/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { ApprovalMode, Config } from '../config/config.js';
import {
  BaseTool,
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  ToolResult,
} from './tools.js';
import { Type } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { DEFAULT_DIFF_OPTIONS } from './diffOptions.js';
import { getSpecificMimeType } from '../utils/fileUtils.js';
import {
  recordFileOperationMetric,
  FileOperation,
} from '../telemetry/metrics.js';
import * as Diff from 'diff';

/**
 * Parameters for the NotebookEdit tool
 */
export interface NotebookEditToolParams {
  /**
   * The absolute path to the Jupyter notebook file to edit
   */
  notebook_path: string;

  /**
   * The new content for the cell
   */
  new_source: string;

  /**
   * The ID of the cell to edit
   */
  cell_id?: string;

  /**
   * The type of cell: 'code' or 'markdown'
   */
  cell_type?: 'code' | 'markdown';

  /**
   * The edit operation to perform: 'replace', 'insert', or 'delete'
   */
  edit_mode?: 'replace' | 'insert' | 'delete';
}

/**
 * Implementation of the NotebookEdit tool logic
 */
export class NotebookEditTool extends BaseTool<
  NotebookEditToolParams,
  ToolResult
> {
  private readonly config: Config;
  static readonly Name = 'notebook_edit';

  constructor(config: Config) {
    super(
      NotebookEditTool.Name,
      'NotebookEdit',
      'Edits a Jupyter notebook (.ipynb) file by modifying, inserting, or deleting cells.',
      {
        properties: {
          notebook_path: {
            description:
              "The absolute path to the Jupyter notebook file to edit (e.g., '/home/user/project/notebook.ipynb'). Must be a .ipynb file. Relative paths are not supported.",
            type: Type.STRING,
          },
          new_source: {
            description:
              'The new content for the cell. This is the actual code or markdown content. Not needed for delete mode.',
            type: Type.STRING,
          },
          cell_id: {
            description:
              'The ID of the cell to edit. Required for replace and delete modes. Optional for insert mode (inserts at beginning if not provided).',
            type: Type.STRING,
          },
          cell_type: {
            description:
              "The type of cell: 'code' or 'markdown'. Required for insert mode, optional for replace mode (defaults to existing cell type).",
            type: Type.STRING,
            enum: ['code', 'markdown'],
          },
          edit_mode: {
            description:
              "The edit operation to perform: 'replace' (default), 'insert', or 'delete'.",
            type: Type.STRING,
            enum: ['replace', 'insert', 'delete'],
          },
        },
        required: ['notebook_path', 'new_source'],
        type: Type.OBJECT,
      }
    );
    this.config = config;
  }

  /**
   * Checks if a given path is within the root directory bounds.
   */
  private isWithinRoot(pathToCheck: string): boolean {
    const normalizedPath = path.normalize(pathToCheck);
    const normalizedRoot = path.normalize(this.config.getTargetDir());
    const rootWithSep = normalizedRoot.endsWith(path.sep)
      ? normalizedRoot
      : normalizedRoot + path.sep;

    return (
      normalizedPath === normalizedRoot ||
      normalizedPath.startsWith(rootWithSep)
    );
  }

  /**
   * Normalizes cell source to array format
   */
  private normalizeSource(source: string): string[] {
    if (Array.isArray(source)) {
      return source;
    }
    return source
      .split('\n')
      .map((line, index, array) =>
        index === array.length - 1 ? line : line + '\n'
      );
  }

  /**
   * Converts cell source array to string
   */
  private sourceToString(source: string | string[]): string {
    if (Array.isArray(source)) {
      return source.join('');
    }
    return source;
  }

  /**
   * Finds cell by ID
   */
  private findCellById(
    cells: any[],
    cellId: string
  ): { cell: any; index: number } | null {
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].id === cellId) {
        return { cell: cells[i], index: i };
      }
    }
    return null;
  }

  /**
   * Generates a new cell ID
   */
  private generateCellId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  validateToolParams(params: NotebookEditToolParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }

    const notebookPath = params.notebook_path;
    if (!path.isAbsolute(notebookPath)) {
      return `Notebook path must be absolute: ${notebookPath}`;
    }

    if (!notebookPath.endsWith('.ipynb')) {
      return `Path must be a .ipynb file: ${notebookPath}`;
    }

    if (!this.isWithinRoot(notebookPath)) {
      return `Notebook path must be within the root directory (${this.config.getTargetDir()}): ${notebookPath}`;
    }

    const editMode = params.edit_mode || 'replace';
    if (editMode === 'delete' && !params.cell_id) {
      return 'cell_id is required for delete mode';
    }

    if (editMode === 'replace' && !params.cell_id) {
      return 'cell_id is required for replace mode';
    }

    if (editMode === 'insert' && !params.cell_type) {
      return 'cell_type is required for insert mode';
    }

    if (editMode === 'delete' && !params.new_source) {
      // For delete mode, new_source is not needed
      return null;
    }

    if (!fs.existsSync(notebookPath)) {
      return `Notebook file does not exist: ${notebookPath}`;
    }

    try {
      const stats = fs.lstatSync(notebookPath);
      if (stats.isDirectory()) {
        return `Path is a directory, not a file: ${notebookPath}`;
      }
    } catch (statError) {
      return `Error accessing path properties for validation: ${notebookPath}. Reason: ${
        statError instanceof Error ? statError.message : String(statError)
      }`;
    }

    return null;
  }

  getDescription(params: NotebookEditToolParams): string {
    if (!params.notebook_path) {
      return 'Model did not provide valid parameters for notebook edit tool';
    }

    const relativePath = makeRelative(
      params.notebook_path,
      this.config.getTargetDir()
    );
    const editMode = params.edit_mode || 'replace';
    const cellId = params.cell_id || 'new cell';

    return `${
      editMode.charAt(0).toUpperCase() + editMode.slice(1)
    }ing cell ${cellId} in ${shortenPath(relativePath)}`;
  }

  async shouldConfirmExecute(
    params: NotebookEditToolParams,
    abortSignal: AbortSignal
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      return false;
    }

    const validationError = this.validateToolParams(params);
    if (validationError) {
      return false;
    }

    try {
      const notebookContent = fs.readFileSync(params.notebook_path, 'utf8');
      const notebook = JSON.parse(notebookContent);
      const editMode = params.edit_mode || 'replace';
      const relativePath = makeRelative(
        params.notebook_path,
        this.config.getTargetDir()
      );
      const fileName = path.basename(params.notebook_path);

      let originalContent = '';
      let proposedContent = '';

      if (editMode === 'replace' || editMode === 'delete') {
        const cellResult = this.findCellById(notebook.cells, params.cell_id!);
        if (!cellResult) {
          return false;
        }
        originalContent = this.sourceToString(cellResult.cell.source);
        proposedContent = editMode === 'delete' ? '' : params.new_source;
      } else if (editMode === 'insert') {
        originalContent = '';
        proposedContent = params.new_source;
      }

      const fileDiff = Diff.createPatch(
        `${fileName}[${params.cell_id || 'new'}]`,
        originalContent,
        proposedContent,
        'Current',
        'Proposed',
        DEFAULT_DIFF_OPTIONS
      );

      const confirmationDetails: ToolCallConfirmationDetails = {
        type: 'edit',
        title: `Confirm ${editMode}: ${shortenPath(relativePath)}`,
        fileName,
        fileDiff,
        onConfirm: async (outcome: ToolConfirmationOutcome) => {
          if (outcome === ToolConfirmationOutcome.ProceedAlways) {
            this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
          }
        },
      };

      return confirmationDetails;
    } catch (error) {
      return false;
    }
  }

  async execute(
    params: NotebookEditToolParams,
    abortSignal: AbortSignal
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: `Error: ${validationError}`,
      };
    }

    try {
      const notebookContent = fs.readFileSync(params.notebook_path, 'utf8');
      const notebook = JSON.parse(notebookContent);
      const editMode = params.edit_mode || 'replace';
      let operationResult = '';

      if (editMode === 'replace') {
        const cellResult = this.findCellById(notebook.cells, params.cell_id!);
        if (!cellResult) {
          return {
            llmContent: `Error: Cell with ID "${params.cell_id}" not found in notebook`,
            returnDisplay: `Error: Cell with ID "${params.cell_id}" not found`,
          };
        }

        const oldSource = this.sourceToString(cellResult.cell.source);
        cellResult.cell.source = this.normalizeSource(params.new_source);
        if (params.cell_type) {
          cellResult.cell.cell_type = params.cell_type;
        }
        operationResult = `Replaced cell ${params.cell_id}`;
      } else if (editMode === 'insert') {
        const newCell: any = {
          cell_type: params.cell_type,
          id: this.generateCellId(),
          source: this.normalizeSource(params.new_source),
          metadata: {},
        };

        if (params.cell_type === 'code') {
          newCell.outputs = [];
          newCell.execution_count = null;
        }

        if (params.cell_id) {
          const cellResult = this.findCellById(notebook.cells, params.cell_id);
          if (cellResult) {
            notebook.cells.splice(cellResult.index + 1, 0, newCell);
            operationResult = `Inserted new cell after ${params.cell_id}`;
          } else {
            return {
              llmContent: `Error: Cell with ID "${params.cell_id}" not found in notebook`,
              returnDisplay: `Error: Cell with ID "${params.cell_id}" not found`,
            };
          }
        } else {
          notebook.cells.unshift(newCell);
          operationResult = `Inserted new cell at beginning`;
        }
      } else if (editMode === 'delete') {
        const cellResult = this.findCellById(notebook.cells, params.cell_id!);
        if (!cellResult) {
          return {
            llmContent: `Error: Cell with ID "${params.cell_id}" not found in notebook`,
            returnDisplay: `Error: Cell with ID "${params.cell_id}" not found`,
          };
        }

        notebook.cells.splice(cellResult.index, 1);
        operationResult = `Deleted cell ${params.cell_id}`;
      }

      const updatedNotebookContent = JSON.stringify(notebook, null, 2);
      fs.writeFileSync(params.notebook_path, updatedNotebookContent, 'utf8');

      const fileName = path.basename(params.notebook_path);
      const fileDiff = Diff.createPatch(
        fileName,
        notebookContent,
        updatedNotebookContent,
        'Original',
        'Modified',
        DEFAULT_DIFF_OPTIONS
      );

      const lines = updatedNotebookContent.split('\n').length;
      const mimetype = getSpecificMimeType(params.notebook_path);
      const extension = path.extname(params.notebook_path);

      recordFileOperationMetric(
        this.config,
        FileOperation.UPDATE,
        lines,
        mimetype,
        extension
      );

      return {
        llmContent: `Successfully ${operationResult} in notebook: ${params.notebook_path}`,
        returnDisplay: { fileDiff, fileName },
      };
    } catch (error) {
      const errorMsg = `Error editing notebook: ${
        error instanceof Error ? error.message : String(error)
      }`;
      return {
        llmContent: `Error editing notebook ${params.notebook_path}: ${errorMsg}`,
        returnDisplay: `Error: ${errorMsg}`,
      };
    }
  }
}