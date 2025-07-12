/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import * as Diff from 'diff';
import {
  BaseTool,
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  ToolResult,
} from './tools.js';
import { Type } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { isNodeError } from '../utils/errors.js';
import { Config, ApprovalMode } from '../config/config.js';
import { ensureCorrectEdit } from '../utils/editCorrector.js';
import { DEFAULT_DIFF_OPTIONS } from './diffOptions.js';
import { ReadFileTool } from './read-file.js';
import { ModifiableTool, ModifyContext } from './modifiable-tool.js';

/**
 * Parameters for a single edit operation
 */
export interface SingleEditParams {
  /**
   * The absolute path to the file to modify
   */
  file_path: string;

  /**
   * The text to replace
   */
  old_string: string;

  /**
   * The text to replace it with
   */
  new_string: string;

  /**
   * Number of replacements expected. Defaults to 1 if not specified.
   */
  expected_replacements?: number;
}

/**
 * Parameters for the MultiEdit tool
 */
export interface MultiEditToolParams {
  /**
   * Array of edit operations to perform
   */
  edits: SingleEditParams[];

  /**
   * Whether to perform atomic operations (all succeed or all fail)
   */
  atomic?: boolean;

  /**
   * Whether to show confirmation for each edit individually
   */
  confirm_each?: boolean;

  /**
   * Whether the edits were modified manually by the user
   */
  modified_by_user?: boolean;
}

/**
 * Result of a single edit operation
 */
interface SingleEditResult {
  file_path: string;
  success: boolean;
  occurrences: number;
  error?: string;
  isNewFile: boolean;
  currentContent: string | null;
  newContent: string;
}

/**
 * Result of conflict detection
 */
interface ConflictDetectionResult {
  hasConflicts: boolean;
  conflicts: Array<{
    file_path: string;
    conflictingEdits: number[];
    reason: string;
  }>;
}

/**
 * Enhanced result interface for multi-edit operations
 */
export interface MultiEditResult extends ToolResult {
  totalEdits: number;
  successfulEdits: number;
  failedEdits: number;
  conflicts: ConflictDetectionResult;
  editResults: SingleEditResult[];
}

/**
 * Implementation of the MultiEdit tool
 */
export class MultiEditTool
  extends BaseTool<MultiEditToolParams, MultiEditResult>
  implements ModifiableTool<MultiEditToolParams>
{
  static readonly Name = 'multi_edit';
  private readonly rootDirectory: string;

  constructor(private readonly config: Config) {
    super(
      MultiEditTool.Name,
      'Multi Edit',
      `Performs multiple text replacements across multiple files in a single operation. Supports atomic transactions, conflict detection, and batch processing for efficient multi-file edits.

Key features:
- Batch processing: Multiple edits in a single tool call
- Atomic operations: All edits succeed or all fail (when atomic=true)
- Conflict detection: Prevents overlapping edits in the same file
- Consolidated confirmation: Single approval for all related changes
- Cross-file operations: Edit multiple files simultaneously

Always use the ${ReadFileTool.Name} tool to examine file contents before attempting multi-edit operations.

Requirements:
1. All \`file_path\` values MUST be absolute paths
2. Each \`old_string\` MUST be exact literal text with sufficient context
3. Each \`new_string\` MUST be exact replacement text
4. Use \`atomic: true\` for all-or-nothing operations
5. Set \`confirm_each: true\` to review each edit individually

The tool will detect conflicts between edits and provide detailed error reporting for failed operations.`,
      {
        properties: {
          edits: {
            type: Type.ARRAY,
            description: 'Array of edit operations to perform',
            items: {
              type: Type.OBJECT,
              properties: {
                file_path: {
                  type: Type.STRING,
                  description: "Absolute path to the file to modify. Must start with '/'.",
                },
                old_string: {
                  type: Type.STRING,
                  description: 'The exact literal text to replace, with sufficient context.',
                },
                new_string: {
                  type: Type.STRING,
                  description: 'The exact literal text to replace old_string with.',
                },
                expected_replacements: {
                  type: Type.NUMBER,
                  description: 'Number of replacements expected. Defaults to 1.',
                  minimum: 1,
                },
              },
              required: ['file_path', 'old_string', 'new_string'],
            },
          },
          atomic: {
            type: Type.BOOLEAN,
            description: 'Whether to perform atomic operations (all succeed or all fail). Defaults to false.',
          },
          confirm_each: {
            type: Type.BOOLEAN,
            description: 'Whether to show confirmation for each edit individually. Defaults to false.',
          },
        },
        required: ['edits'],
        type: Type.OBJECT,
      },
    );
    this.rootDirectory = path.resolve(this.config.getTargetDir());
  }

  /**
   * Checks if a path is within the root directory
   */
  private isWithinRoot(pathToCheck: string): boolean {
    try {
      // Use realpath to resolve symlinks and normalize the path
      const realPath = fs.realpathSync(pathToCheck);
      const realRoot = fs.realpathSync(this.rootDirectory);
      const rootWithSep = realRoot.endsWith(path.sep)
        ? realRoot
        : realRoot + path.sep;
      return (
        realPath === realRoot ||
        realPath.startsWith(rootWithSep)
      );
    } catch (_error) {
      // If realpath fails (e.g., file doesn't exist), check with normalized paths
      // but still validate against path traversal patterns
      const normalizedPath = path.normalize(pathToCheck);
      const normalizedRoot = path.normalize(this.rootDirectory);
      
      // Check for path traversal patterns
      if (normalizedPath.includes('../') || normalizedPath.includes('..\\')) {
        return false;
      }
      
      const rootWithSep = normalizedRoot.endsWith(path.sep)
        ? normalizedRoot
        : normalizedRoot + path.sep;
      return (
        normalizedPath === normalizedRoot ||
        normalizedPath.startsWith(rootWithSep)
      );
    }
  }

  /**
   * Validates the parameters for the MultiEdit tool
   */
  validateToolParams(params: MultiEditToolParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }

    if (!params.edits || params.edits.length === 0) {
      return 'At least one edit operation must be provided';
    }

    if (params.edits.length > 100) {
      return 'Too many edit operations. Maximum 100 edits per batch.';
    }

    for (let i = 0; i < params.edits.length; i++) {
      const edit = params.edits[i];
      
      if (!path.isAbsolute(edit.file_path)) {
        return `Edit ${i + 1}: File path must be absolute: ${edit.file_path}`;
      }

      if (!this.isWithinRoot(edit.file_path)) {
        return `Edit ${i + 1}: File path must be within root directory (${this.rootDirectory}): ${edit.file_path}`;
      }

      if (edit.expected_replacements !== undefined && edit.expected_replacements < 1) {
        return `Edit ${i + 1}: expected_replacements must be at least 1`;
      }
    }

    return null;
  }

  getDescription(params: MultiEditToolParams): string {
    if (!params.edits || params.edits.length === 0) {
      return 'Multi-edit: No edits provided';
    }

    const editCount = params.edits.length;
    const fileCount = new Set(params.edits.map(e => e.file_path)).size;
    const atomicText = params.atomic ? ' (atomic)' : '';
    
    if (fileCount === 1) {
      const relativePath = makeRelative(params.edits[0].file_path, this.rootDirectory);
      return `Multi-edit: ${editCount} edits in ${shortenPath(relativePath)}${atomicText}`;
    }

    return `Multi-edit: ${editCount} edits across ${fileCount} files${atomicText}`;
  }

  async shouldConfirmExecute(
    params: MultiEditToolParams,
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      return false;
    }

    const validationError = this.validateToolParams(params);
    if (validationError) {
      console.error(`[MultiEditTool] Invalid parameters: ${validationError}`);
      return false;
    }

    // Check for conflicts first
    const conflicts = this.detectConflicts(params.edits);
    if (conflicts.hasConflicts) {
      console.error(`[MultiEditTool] Conflicts detected, cannot confirm execution`);
      return false;
    }

    // Generate consolidated diff for all files
    try {
      const consolidatedDiff = await this.generateConsolidatedDiff(params.edits, abortSignal);
      
      if (consolidatedDiff.trim() === '') {
        console.log('No changes detected in multi-edit operation');
        return false;
      }

      const fileCount = new Set(params.edits.map(e => e.file_path)).size;
      const fileName = fileCount === 1 ? 
        path.basename(params.edits[0].file_path) : 
        `${fileCount} files`;

      return {
        type: 'edit',
        title: `Confirm Multi-Edit: ${params.edits.length} operations${params.atomic ? ' (atomic)' : ''}`,
        fileName,
        fileDiff: consolidatedDiff,
        onConfirm: async (outcome: ToolConfirmationOutcome) => {
          if (outcome === ToolConfirmationOutcome.ProceedAlways) {
            this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
          }
        },
      };
    } catch (error) {
      console.error(`Error generating consolidated diff: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  async execute(
    params: MultiEditToolParams,
    signal: AbortSignal,
  ): Promise<MultiEditResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: `Error: ${validationError}`,
        totalEdits: 0,
        successfulEdits: 0,
        failedEdits: 0,
        conflicts: { hasConflicts: false, conflicts: [] },
        editResults: [],
      };
    }

    // Detect conflicts before processing
    const conflicts = this.detectConflicts(params.edits);
    if (conflicts.hasConflicts) {
      const conflictMsg = conflicts.conflicts.map(c => 
        `${c.file_path}: ${c.reason} (edits: ${c.conflictingEdits.join(', ')})`
      ).join('; ');
      
      return {
        llmContent: `Error: Conflicts detected in edit operations. ${conflictMsg}`,
        returnDisplay: `Error: Conflicts detected. ${conflictMsg}`,
        totalEdits: params.edits.length,
        successfulEdits: 0,
        failedEdits: params.edits.length,
        conflicts,
        editResults: [],
      };
    }

    // Process edits with atomic support
    const editResults: SingleEditResult[] = [];
    let successfulEdits = 0;
    let failedEdits = 0;
    const backupData: Map<string, string> = new Map();

    // If atomic, create backups first
    if (params.atomic) {
      for (const edit of params.edits) {
        try {
          if (fs.existsSync(edit.file_path)) {
            backupData.set(edit.file_path, fs.readFileSync(edit.file_path, 'utf8'));
          }
        } catch (error) {
          // If we can't backup, fail the entire operation
          return {
            llmContent: `Error: Cannot create backup for atomic operation: ${error instanceof Error ? error.message : String(error)}`,
            returnDisplay: `Error: Atomic operation failed during backup`,
            totalEdits: params.edits.length,
            successfulEdits: 0,
            failedEdits: params.edits.length,
            conflicts,
            editResults: [],
          };
        }
      }
    }

    // Process each edit
    for (let i = 0; i < params.edits.length; i++) {
      const edit = params.edits[i];
      try {
        const result = await this.processSingleEdit(edit, signal);
        editResults.push(result);
        if (result.success) {
          successfulEdits++;
        } else {
          failedEdits++;
          // If atomic and any edit fails, rollback and fail entire operation
          if (params.atomic) {
            this.rollbackChanges(editResults, backupData);
            return {
              llmContent: `Error: Atomic operation failed at edit ${i + 1}: ${result.error}`,
              returnDisplay: `Error: Atomic operation failed and rolled back`,
              totalEdits: params.edits.length,
              successfulEdits: 0,
              failedEdits: params.edits.length,
              conflicts,
              editResults: [],
            };
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const failedResult: SingleEditResult = {
          file_path: edit.file_path,
          success: false,
          occurrences: 0,
          error: errorMsg,
          isNewFile: false,
          currentContent: null,
          newContent: '',
        };
        editResults.push(failedResult);
        failedEdits++;
        
        // If atomic and any edit fails, rollback and fail entire operation
        if (params.atomic) {
          this.rollbackChanges(editResults, backupData);
          return {
            llmContent: `Error: Atomic operation failed at edit ${i + 1}: ${errorMsg}`,
            returnDisplay: `Error: Atomic operation failed and rolled back`,
            totalEdits: params.edits.length,
            successfulEdits: 0,
            failedEdits: params.edits.length,
            conflicts,
            editResults: [],
          };
        }
      }
    }

    const atomicText = params.atomic ? ' (atomic)' : '';
    return {
      llmContent: `Multi-edit completed${atomicText}: ${successfulEdits} successful, ${failedEdits} failed`,
      returnDisplay: `Multi-edit: ${successfulEdits}/${params.edits.length} operations successful${atomicText}`,
      totalEdits: params.edits.length,
      successfulEdits,
      failedEdits,
      conflicts,
      editResults,
    };
  }

  private async processSingleEdit(
    edit: SingleEditParams,
    _signal: AbortSignal,
  ): Promise<SingleEditResult> {
    // Basic single edit processing - will enhance with EditTool integration
    const expectedReplacements = edit.expected_replacements ?? 1;
    let currentContent: string | null = null;
    let fileExists = false;
    let isNewFile = false;

    try {
      currentContent = fs.readFileSync(edit.file_path, 'utf8');
      currentContent = currentContent.replace(/\r\n/g, '\n');
      fileExists = true;
    } catch (err: unknown) {
      if (!isNodeError(err) || err.code !== 'ENOENT') {
        throw err;
      }
      fileExists = false;
    }

    if (edit.old_string === '' && !fileExists) {
      isNewFile = true;
    } else if (!fileExists) {
      return {
        file_path: edit.file_path,
        success: false,
        occurrences: 0,
        error: 'File not found. Cannot apply edit. Use an empty old_string to create a new file.',
        isNewFile: false,
        currentContent: null,
        newContent: '',
      };
    }

    let newContent = '';
    let occurrences = 0;

    if (isNewFile) {
      newContent = edit.new_string;
      occurrences = 1;
    } else if (currentContent !== null) {
      if (edit.old_string === '') {
        return {
          file_path: edit.file_path,
          success: false,
          occurrences: 0,
          error: 'Failed to edit. Attempted to create a file that already exists.',
          isNewFile: false,
          currentContent,
          newContent: '',
        };
      }

      occurrences = (currentContent.match(new RegExp(edit.old_string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      
      if (occurrences === 0) {
        return {
          file_path: edit.file_path,
          success: false,
          occurrences: 0,
          error: 'Failed to edit, could not find the string to replace.',
          isNewFile: false,
          currentContent,
          newContent: '',
        };
      }

      if (occurrences !== expectedReplacements) {
        return {
          file_path: edit.file_path,
          success: false,
          occurrences,
          error: `Failed to edit, expected ${expectedReplacements} occurrences but found ${occurrences}.`,
          isNewFile: false,
          currentContent,
          newContent: '',
        };
      }

      newContent = currentContent.replaceAll(edit.old_string, edit.new_string);
    }

    try {
      this.ensureParentDirectoriesExist(edit.file_path);
      fs.writeFileSync(edit.file_path, newContent, 'utf8');

      return {
        file_path: edit.file_path,
        success: true,
        occurrences,
        isNewFile,
        currentContent,
        newContent,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        file_path: edit.file_path,
        success: false,
        occurrences,
        error: `Error writing file: ${errorMsg}`,
        isNewFile,
        currentContent,
        newContent,
      };
    }
  }

  private ensureParentDirectoriesExist(filePath: string): void {
    const dirName = path.dirname(filePath);
    if (!fs.existsSync(dirName)) {
      fs.mkdirSync(dirName, { recursive: true });
    }
  }

  /**
   * Detects conflicts between edit operations
   */
  private detectConflicts(edits: SingleEditParams[]): ConflictDetectionResult {
    const conflicts: ConflictDetectionResult['conflicts'] = [];
    
    // Group edits by file path
    const editsByFile = new Map<string, number[]>();
    edits.forEach((edit, index) => {
      if (!editsByFile.has(edit.file_path)) {
        editsByFile.set(edit.file_path, []);
      }
      editsByFile.get(edit.file_path)!.push(index);
    });

    // Check for conflicts within each file
    for (const [filePath, editIndices] of editsByFile.entries()) {
      if (editIndices.length > 1) {
        const fileEdits = editIndices.map(i => edits[i]);
        const conflictingEdits = this.findOverlappingEdits(fileEdits, editIndices);
        
        if (conflictingEdits.length > 0) {
          conflicts.push({
            file_path: filePath,
            conflictingEdits,
            reason: 'Overlapping edit operations detected',
          });
        }

        // Check for other conflict types
        const createFileEdits = editIndices.filter(i => edits[i].old_string === '');
        if (createFileEdits.length > 1) {
          conflicts.push({
            file_path: filePath,
            conflictingEdits: createFileEdits,
            reason: 'Multiple file creation operations',
          });
        }

        if (createFileEdits.length > 0 && editIndices.length > createFileEdits.length) {
          conflicts.push({
            file_path: filePath,
            conflictingEdits: editIndices,
            reason: 'File creation mixed with edit operations',
          });
        }
      }
    }

    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
    };
  }

  /**
   * Finds overlapping edits in the same file
   */
  private findOverlappingEdits(edits: SingleEditParams[], indices: number[]): number[] {
    const conflicts: number[] = [];
    
    for (let i = 0; i < edits.length; i++) {
      for (let j = i + 1; j < edits.length; j++) {
        const edit1 = edits[i];
        const edit2 = edits[j];
        
        // Skip if either is creating a new file
        if (edit1.old_string === '' || edit2.old_string === '') {
          continue;
        }
        
        // Check if old_strings overlap
        if (this.stringsOverlap(edit1.old_string, edit2.old_string)) {
          if (!conflicts.includes(indices[i])) conflicts.push(indices[i]);
          if (!conflicts.includes(indices[j])) conflicts.push(indices[j]);
        }
      }
    }
    
    return conflicts;
  }

  /**
   * Checks if two strings overlap (one contains the other)
   */
  private stringsOverlap(str1: string, str2: string): boolean {
    return str1.includes(str2) || str2.includes(str1);
  }

  /**
   * Rolls back changes for atomic operations
   */
  private rollbackChanges(editResults: SingleEditResult[], backupData: Map<string, string>): void {
    for (const result of editResults) {
      if (result.success) {
        try {
          if (result.isNewFile) {
            // Remove the newly created file
            if (fs.existsSync(result.file_path)) {
              fs.unlinkSync(result.file_path);
            }
          } else {
            // Restore from backup
            const backup = backupData.get(result.file_path);
            if (backup !== undefined) {
              fs.writeFileSync(result.file_path, backup, 'utf8');
            }
          }
        } catch (error) {
          // Log rollback errors but don't throw - we're already in error handling
          console.error(`Failed to rollback ${result.file_path}:`, error);
        }
      }
    }
  }

  /**
   * Generates a consolidated diff for all edit operations
   */
  private async generateConsolidatedDiff(edits: SingleEditParams[], abortSignal: AbortSignal): Promise<string> {
    const diffs: string[] = [];
    
    // Group edits by file path
    const editsByFile = new Map<string, SingleEditParams[]>();
    edits.forEach(edit => {
      if (!editsByFile.has(edit.file_path)) {
        editsByFile.set(edit.file_path, []);
      }
      editsByFile.get(edit.file_path)!.push(edit);
    });

    // Generate diff for each file
    for (const [filePath, fileEdits] of editsByFile.entries()) {
      try {
        const fileDiff = await this.generateFileDiff(filePath, fileEdits, abortSignal);
        if (fileDiff.trim() !== '') {
          diffs.push(fileDiff);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        diffs.push(`Error generating diff for ${filePath}: ${errorMsg}`);
      }
    }

    return diffs.join('\n\n');
  }

  /**
   * Generates a diff for a single file with multiple edits
   */
  private async generateFileDiff(filePath: string, edits: SingleEditParams[], abortSignal: AbortSignal): Promise<string> {
    let currentContent: string | null = null;
    let isNewFile = false;

    // Check if file exists
    try {
      currentContent = fs.readFileSync(filePath, 'utf8');
      currentContent = currentContent.replace(/\r\n/g, '\n');
    } catch (err: unknown) {
      if (!isNodeError(err) || err.code !== 'ENOENT') {
        throw err;
      }
      // File doesn't exist
      if (edits.some(e => e.old_string === '')) {
        isNewFile = true;
        currentContent = '';
      } else {
        throw new Error(`File not found: ${filePath}`);
      }
    }

    // Apply all edits to simulate the final content
    let finalContent = currentContent;
    
    if (isNewFile) {
      // For new files, use the first edit's new_string
      const createEdit = edits.find(e => e.old_string === '');
      finalContent = createEdit ? createEdit.new_string : '';
    } else {
      // Apply edits in order
      for (const edit of edits) {
        if (edit.old_string === '') {
          throw new Error(`Cannot create file that already exists: ${filePath}`);
        }
        
        // Use ensureCorrectEdit for intelligent correction
        const correctedEdit = await ensureCorrectEdit(
          filePath,
          finalContent,
          edit,
          this.config.getGeminiClient(),
          abortSignal,
        );
        
        if (correctedEdit.occurrences === 0) {
          throw new Error(`Cannot find text to replace in ${filePath}: ${edit.old_string}`);
        }
        
        finalContent = finalContent.replaceAll(correctedEdit.params.old_string, correctedEdit.params.new_string);
      }
    }

    // Generate diff
    const relativePath = makeRelative(filePath, this.rootDirectory);
    
    return Diff.createPatch(
      relativePath,
      currentContent,
      finalContent,
      'Current',
      'Proposed',
      DEFAULT_DIFF_OPTIONS,
    );
  }

  getModifyContext(_signal: AbortSignal): ModifyContext<MultiEditToolParams> {
    return {
      getFilePath: (params: MultiEditToolParams) => 
        params.edits.length > 0 ? params.edits[0].file_path : '',
      getCurrentContent: async (params: MultiEditToolParams): Promise<string> => {
        if (params.edits.length === 0) return '';
        try {
          return fs.readFileSync(params.edits[0].file_path, 'utf8');
        } catch (err) {
          if (!isNodeError(err) || err.code !== 'ENOENT') throw err;
          return '';
        }
      },
      getProposedContent: async (params: MultiEditToolParams): Promise<string> => {
        if (params.edits.length === 0) return '';
        const firstEdit = params.edits[0];
        try {
          const currentContent = fs.readFileSync(firstEdit.file_path, 'utf8');
          return currentContent.replaceAll(firstEdit.old_string, firstEdit.new_string);
        } catch (err) {
          if (!isNodeError(err) || err.code !== 'ENOENT') throw err;
          return '';
        }
      },
      createUpdatedParams: (
        _oldContent: string,
        _modifiedProposedContent: string,
        originalParams: MultiEditToolParams,
      ): MultiEditToolParams => ({
        ...originalParams,
        modified_by_user: true,
      }),
    };
  }
}