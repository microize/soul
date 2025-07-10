/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { Config } from '../config/config.js';
import { BaseTool, ToolResult } from './tools.js';
import { Type } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';

/**
 * Todo item interface
 */
export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  created?: string;
  updated?: string;
}

/**
 * Enhanced todo item for display
 */
export interface TodoDisplayItem {
  id: string;
  checkbox: boolean;
  task: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
}

/**
 * Parameters for the TodoWrite tool
 */
export interface TodoWriteToolParams {
  todos: TodoItem[];
}

/**
 * Enhanced result interface for TodoWrite tool
 */
export interface TodoWriteToolResult extends ToolResult {
  updated_todos: TodoDisplayItem[];
}

/**
 * Implementation of the TodoWrite tool
 */
export class TodoWriteTool extends BaseTool<TodoWriteToolParams, TodoWriteToolResult> {
  private readonly config: Config;
  static readonly Name = 'todo_write';

  constructor(config: Config) {
    super(
      TodoWriteTool.Name,
      'TodoWrite',
      'Updates the todo list by creating, updating, or removing todo items. Takes an array of todo items and writes them to storage. Returns the updated todo list for display.',
      {
        properties: {
          todos: {
            description: 'Array of todo items to save in the todo list. Each item must have id, content, status, and priority fields.',
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: {
                  type: Type.STRING,
                  description: 'Unique identifier for the todo item.',
                },
                content: {
                  type: Type.STRING,
                  description: 'Description of the todo task.',
                },
                status: {
                  type: Type.STRING,
                  description: 'Current status of the todo item.',
                  enum: ['pending', 'in_progress', 'completed'],
                },
                priority: {
                  type: Type.STRING,
                  description: 'Priority level of the todo item.',
                  enum: ['low', 'medium', 'high'],
                },
                created: {
                  type: Type.STRING,
                  description: 'Optional creation timestamp in ISO format.',
                },
                updated: {
                  type: Type.STRING,
                  description: 'Optional last update timestamp in ISO format.',
                },
              },
              required: ['id', 'content', 'status', 'priority'],
            },
          },
        },
        required: ['todos'],
        type: Type.OBJECT,
      }
    );
    this.config = config;
  }

  /**
   * Gets the path to the todo storage file
   */
  private getTodoFilePath(): string {
    return path.join(this.config.getTargetDir(), '.claude-todos.json');
  }

  /**
   * Converts TodoItem to TodoDisplayItem
   */
  private toDisplayItem(todo: TodoItem): TodoDisplayItem {
    return {
      id: todo.id,
      checkbox: todo.status === 'completed',
      task: todo.content,
      status: todo.status,
      priority: todo.priority,
    };
  }

  /**
   * Generates status summary for display
   */
  private generateStatusSummary(todos: TodoItem[]): string {
    const total = todos.length;
    const statusCounts = todos.reduce(
      (acc, todo) => {
        acc[todo.status] = (acc[todo.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const parts = [];
    if (statusCounts.pending) parts.push(`${statusCounts.pending} pending`);
    if (statusCounts.in_progress) parts.push(`${statusCounts.in_progress} in progress`);
    if (statusCounts.completed) parts.push(`${statusCounts.completed} completed`);

    return `${total} total items${parts.length > 0 ? ` (${parts.join(', ')})` : ''}`;
  }

  validateToolParams(params: TodoWriteToolParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }

    if (!Array.isArray(params.todos)) {
      return 'todos must be an array';
    }

    for (const todo of params.todos) {
      if (!todo.id || typeof todo.id !== 'string') {
        return 'Each todo item must have a valid id string';
      }
      if (!todo.content || typeof todo.content !== 'string') {
        return 'Each todo item must have a valid content string';
      }
      if (!['pending', 'in_progress', 'completed'].includes(todo.status)) {
        return 'Each todo item must have a valid status (pending, in_progress, completed)';
      }
      if (!['low', 'medium', 'high'].includes(todo.priority)) {
        return 'Each todo item must have a valid priority (low, medium, high)';
      }
    }

    return null;
  }

  getDescription(params: TodoWriteToolParams): string {
    if (!params.todos || !Array.isArray(params.todos)) {
      return 'Model did not provide valid parameters for todo write tool';
    }

    const count = params.todos.length;
    return `Updating todo list with ${count} item${count !== 1 ? 's' : ''}`;
  }

  async execute(params: TodoWriteToolParams): Promise<TodoWriteToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: `Error: ${validationError}`,
        updated_todos: [],
      };
    }

    try {
      const todoFilePath = this.getTodoFilePath();
      const now = new Date().toISOString();

      // Add timestamps to todos
      const todosWithTimestamps = params.todos.map(todo => ({
        ...todo,
        created: todo.created || now,
        updated: now,
      }));

      // Write to file
      fs.writeFileSync(todoFilePath, JSON.stringify(todosWithTimestamps, null, 2), 'utf8');

      // Convert to display format
      const displayTodos = todosWithTimestamps.map(todo => this.toDisplayItem(todo));

      // Generate summary
      const summary = this.generateStatusSummary(todosWithTimestamps);

      return {
        llmContent: 'Todo list updated successfully',
        returnDisplay: `Todo list updated successfully. ${summary}.`,
        updated_todos: displayTodos,
      };
    } catch (error) {
      const errorMsg = `Error updating todo list: ${
        error instanceof Error ? error.message : String(error)
      }`;
      return {
        llmContent: `Error updating todo list: ${errorMsg}`,
        returnDisplay: `Error: ${errorMsg}`,
        updated_todos: [],
      };
    }
  }
}