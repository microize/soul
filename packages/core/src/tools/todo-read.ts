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
import { TodoItem, TodoDisplayItem } from './todo-write.js';

/**
 * Parameters for the TodoRead tool (no parameters needed)
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface TodoReadToolParams {}

/**
 * Result interface for TodoRead tool
 */
export interface TodoReadToolResult extends ToolResult {
  todos: TodoDisplayItem[];
  summary: string;
}

/**
 * Implementation of the TodoRead tool
 */
export class TodoReadTool extends BaseTool<TodoReadToolParams, TodoReadToolResult> {
  private readonly config: Config;
  static readonly Name = 'todo_read';

  constructor(config: Config) {
    super(
      TodoReadTool.Name,
      'TodoRead',
      'Reads and displays the current todo list from storage. Returns all todo items with their status, priority, and other details.',
      {
        type: Type.OBJECT,
        properties: {},
        required: [],
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
      step: todo.step,
    };
  }

  /**
   * Generates status summary for display
   */
  private generateStatusSummary(todos: TodoItem[]): string {
    const total = todos.length;
    if (total === 0) {
      return 'No todos found';
    }

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

  /**
   * Generates formatted display output with step ordering and strikethrough
   */
  private generateFormattedDisplay(todos: TodoItem[]): string {
    if (todos.length === 0) {
      return 'No todos found. Use the TodoWrite tool to create your first todo item.';
    }

    // Sort todos by step number, putting items without steps at the end
    const sortedTodos = todos.sort((a, b) => {
      if (a.step === undefined && b.step === undefined) return 0;
      if (a.step === undefined) return 1;
      if (b.step === undefined) return -1;
      return a.step - b.step;
    });

    const lastUpdated = sortedTodos.reduce((latest, todo) => {
      if (todo.updated && (!latest || todo.updated > latest)) {
        return todo.updated;
      }
      return latest;
    }, '');

    const updateTime = lastUpdated 
      ? new Date(lastUpdated).toLocaleString()
      : 'Unknown';

    let output = `# Todo List (Last Updated: ${updateTime})\n\n`;
    output += `${this.generateStatusSummary(sortedTodos)}\n\n`;

    // Simple checkbox format for all todos
    for (const todo of sortedTodos) {
      const checkbox = todo.status === 'completed' ? '[x]' : '[ ]';
      const content = todo.status === 'completed' 
        ? `~~${todo.content}~~` 
        : todo.content;
      
      const statusDisplay = todo.status === 'in_progress' ? ' (in progress)' : '';
      const priorityDisplay = todo.priority === 'high' ? ' 🔴' : todo.priority === 'medium' ? ' 🟡' : '';
      
      output += `${checkbox} ${content}${statusDisplay}${priorityDisplay}\n`;
    }

    return output;
  }

  validateToolParams(_params: TodoReadToolParams): string | null {
    // No validation needed for read operation
    return null;
  }

  getDescription(_params: TodoReadToolParams): string {
    return 'Reading current todo list from storage';
  }

  async execute(_params: TodoReadToolParams): Promise<TodoReadToolResult> {
    try {
      const todoFilePath = this.getTodoFilePath();

      // Check if todo file exists
      if (!fs.existsSync(todoFilePath)) {
        return {
          llmContent: 'No todo list found. The todo list is empty.',
          returnDisplay: 'No todos found. Use the TodoWrite tool to create your first todo item.',
          todos: [],
          summary: 'No todos found',
        };
      }

      // Read and parse todo file
      const fileContent = fs.readFileSync(todoFilePath, 'utf8');
      let todos: TodoItem[];
      
      try {
        todos = JSON.parse(fileContent);
      } catch (_parseError) {
        return {
          llmContent: 'Error: Todo file is corrupted or invalid JSON format.',
          returnDisplay: 'Error: Todo file is corrupted. Please recreate your todo list.',
          todos: [],
          summary: 'Error reading todos',
        };
      }

      // Validate that todos is an array
      if (!Array.isArray(todos)) {
        return {
          llmContent: 'Error: Todo file contains invalid data format.',
          returnDisplay: 'Error: Todo file format is invalid. Please recreate your todo list.',
          todos: [],
          summary: 'Error reading todos',
        };
      }

      // Convert to display format
      const displayTodos = todos.map(todo => this.toDisplayItem(todo));
      const summary = this.generateStatusSummary(todos);
      const formattedDisplay = this.generateFormattedDisplay(todos);

      return {
        llmContent: `Found ${todos.length} todo items. ${summary}`,
        returnDisplay: formattedDisplay,
        todos: displayTodos,
        summary,
      };
    } catch (error) {
      const errorMsg = `Error reading todo list: ${
        error instanceof Error ? error.message : String(error)
      }`;
      return {
        llmContent: errorMsg,
        returnDisplay: `Error: ${errorMsg}`,
        todos: [],
        summary: 'Error reading todos',
      };
    }
  }
}