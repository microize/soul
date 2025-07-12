/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { getProjectTempDir } from './paths.js';

export interface UserInteraction {
  id: string;
  timestamp: string;
  type: 'user_question';
  sessionId: string;
  content: string;
  context: {
    gitBranch?: string;
    model: string;
    workingDirectory: string;
    shellMode?: boolean;
  };
}

export interface ToolCallInteraction {
  id: string;
  timestamp: string;
  type: 'tool_call';
  sessionId: string;
  parentInteractionId: string;
  toolName: string;
  parameters: Record<string, unknown>;
  result?: unknown;
  error?: string;
  duration?: number;
  sequence: number; // Order within the parent interaction
}

export interface ModelInteraction {
  id: string;
  timestamp: string;
  type: 'model_input' | 'model_output';
  sessionId: string;
  parentInteractionId: string;
  content: unknown;
  metadata: {
    model: string;
    tokenCount?: number;
    temperature?: number;
    systemPrompt?: boolean;
  };
}

export interface InteractionChain {
  id: string;
  startTime: string;
  endTime?: string;
  userInteraction: UserInteraction;
  modelInputs: ModelInteraction[];
  toolCalls: ToolCallInteraction[];
  modelOutputs: ModelInteraction[];
  status: 'pending' | 'completed' | 'error';
  error?: string;
}

export interface SecretTrackingConfig {
  enabled: boolean;
  outputDirectory?: string;
  maxFileSize?: number; // in MB
  maxDays?: number;
  bufferSize?: number;
}

export class SecretTracker {
  private static instance: SecretTracker | null = null;
  private config: SecretTrackingConfig;
  private sessionId: string;
  private currentChain: InteractionChain | null = null;
  private writeBuffer: InteractionChain[] = [];
  private initialized = false;
  private outputPath: string | null = null;
  private toolCallSequence = 0;

  private constructor(sessionId: string, config: SecretTrackingConfig) {
    this.sessionId = sessionId;
    this.config = {
      maxFileSize: 50, // 50MB default
      maxDays: 30, // 30 days default
      bufferSize: 10, // Buffer 10 interactions before writing
      ...config,
    };
  }

  static getInstance(sessionId?: string, config?: SecretTrackingConfig): SecretTracker | null {
    if (!SecretTracker.instance && sessionId && config) {
      SecretTracker.instance = new SecretTracker(sessionId, config);
    }
    return SecretTracker.instance;
  }

  static reset(): void {
    SecretTracker.instance = null;
  }

  async initialize(projectRoot: string): Promise<void> {
    if (this.initialized || !this.config.enabled) {
      return;
    }

    try {
      const cacheDir = this.config.outputDirectory || path.join(getProjectTempDir(projectRoot), '.soul-cache');
      await fs.mkdir(cacheDir, { recursive: true });
      
      this.outputPath = path.join(cacheDir, `secret-tracking-${this.sessionId}.json`);
      
      // Clean up old files
      await this.cleanupOldFiles(cacheDir);
      
      this.initialized = true;
    } catch (error) {
      console.debug('Failed to initialize secret tracker:', error);
      this.config.enabled = false;
    }
  }

  private async cleanupOldFiles(cacheDir: string): Promise<void> {
    if (!this.config.maxDays) return;

    try {
      const files = await fs.readdir(cacheDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.maxDays);

      for (const file of files) {
        if (file.startsWith('secret-tracking-')) {
          const filePath = path.join(cacheDir, file);
          const stats = await fs.stat(filePath);
          
          if (stats.mtime < cutoffDate) {
            await fs.unlink(filePath);
            console.debug(`Cleaned up old secret tracking file: ${file}`);
          }
        }
      }
    } catch (error) {
      console.debug('Error cleaning up old secret tracking files:', error);
    }
  }

  isEnabled(): boolean {
    return this.config.enabled && this.initialized;
  }

  async startUserInteraction(
    content: string,
    context: UserInteraction['context']
  ): Promise<string | null> {
    if (!this.isEnabled()) return null;

    const interactionId = this.generateId();
    const timestamp = new Date().toISOString();

    const userInteraction: UserInteraction = {
      id: interactionId,
      timestamp,
      type: 'user_question',
      sessionId: this.sessionId,
      content,
      context,
    };

    this.currentChain = {
      id: interactionId,
      startTime: timestamp,
      userInteraction,
      modelInputs: [],
      toolCalls: [],
      modelOutputs: [],
      status: 'pending',
    };

    this.toolCallSequence = 0;
    return interactionId;
  }

  async recordModelInput(
    parentInteractionId: string,
    content: unknown,
    metadata: ModelInteraction['metadata']
  ): Promise<void> {
    if (!this.isEnabled() || !this.currentChain || this.currentChain.id !== parentInteractionId) {
      return;
    }

    const modelInput: ModelInteraction = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      type: 'model_input',
      sessionId: this.sessionId,
      parentInteractionId,
      content,
      metadata,
    };

    this.currentChain.modelInputs.push(modelInput);
  }

  async recordToolCall(
    parentInteractionId: string,
    toolName: string,
    parameters: Record<string, unknown>,
    result?: unknown,
    error?: string,
    duration?: number
  ): Promise<void> {
    if (!this.isEnabled() || !this.currentChain || this.currentChain.id !== parentInteractionId) {
      return;
    }

    const toolCall: ToolCallInteraction = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      type: 'tool_call',
      sessionId: this.sessionId,
      parentInteractionId,
      toolName,
      parameters,
      result,
      error,
      duration,
      sequence: ++this.toolCallSequence,
    };

    this.currentChain.toolCalls.push(toolCall);
  }

  async recordModelOutput(
    parentInteractionId: string,
    content: unknown,
    metadata: ModelInteraction['metadata']
  ): Promise<void> {
    if (!this.isEnabled() || !this.currentChain || this.currentChain.id !== parentInteractionId) {
      return;
    }

    const modelOutput: ModelInteraction = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      type: 'model_output',
      sessionId: this.sessionId,
      parentInteractionId,
      content,
      metadata,
    };

    this.currentChain.modelOutputs.push(modelOutput);
  }

  async completeInteraction(success: boolean, error?: string): Promise<void> {
    if (!this.isEnabled() || !this.currentChain) {
      return;
    }

    this.currentChain.endTime = new Date().toISOString();
    this.currentChain.status = success ? 'completed' : 'error';
    if (error) {
      this.currentChain.error = error;
    }

    // Add to buffer
    this.writeBuffer.push({ ...this.currentChain });
    this.currentChain = null;
    this.toolCallSequence = 0;

    // Write to file if buffer is full
    if (this.writeBuffer.length >= (this.config.bufferSize || 10)) {
      await this.flushBuffer();
    }
  }

  private async flushBuffer(): Promise<void> {
    if (!this.outputPath || this.writeBuffer.length === 0) {
      return;
    }

    try {
      // Check file size before writing
      if (this.config.maxFileSize) {
        try {
          const stats = await fs.stat(this.outputPath);
          const sizeMB = stats.size / (1024 * 1024);
          
          if (sizeMB > this.config.maxFileSize) {
            // Rotate file
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const rotatedPath = this.outputPath.replace('.json', `-${timestamp}.json`);
            await fs.rename(this.outputPath, rotatedPath);
          }
        } catch (_error) {
          // File doesn't exist yet, continue
        }
      }

      // Read existing data
      let existingData: InteractionChain[] = [];
      try {
        const fileContent = await fs.readFile(this.outputPath, 'utf-8');
        existingData = JSON.parse(fileContent);
      } catch (_error) {
        // File doesn't exist or is empty, start fresh
      }

      // Append new data
      const updatedData = [...existingData, ...this.writeBuffer];
      
      // Write back to file
      await fs.writeFile(this.outputPath, JSON.stringify(updatedData, null, 2), 'utf-8');
      
      // Clear buffer
      this.writeBuffer = [];
    } catch (error) {
      console.debug('Error flushing secret tracking buffer:', error);
    }
  }

  async flush(): Promise<void> {
    await this.flushBuffer();
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  getConfig(): SecretTrackingConfig {
    return { ...this.config };
  }

  updateConfig(newConfig: Partial<SecretTrackingConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  async close(): Promise<void> {
    if (this.writeBuffer.length > 0) {
      await this.flushBuffer();
    }
    this.initialized = false;
    this.currentChain = null;
    this.outputPath = null;
  }
}