/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { Config } from '../config/config.js';
import {
  BaseTool,
  ToolResult,
  ToolCallConfirmationDetails,
  ToolInfoConfirmationDetails,
  ToolConfirmationOutcome,
} from './tools.js';
import { Type } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { getErrorMessage } from '../utils/errors.js';

export interface TaskToolParams {
  description: string;
  prompt: string;
  timeout?: number;
  working_directory?: string;
  tools?: string[];
  exclude_tools?: string[];
  max_iterations?: number;
  memory_limit?: string;
}

interface TaskMessage {
  type: 'command' | 'result' | 'error' | 'progress' | 'completion';
  data: unknown;
  id?: string;
}

interface TaskAgentConfig {
  targetDir: string;
  debugMode: boolean;
  model: string;
  tools?: string[];
  excludeTools?: string[];
  maxIterations: number;
  prompt: string;
  timeout: number;
}

export class TaskTool extends BaseTool<TaskToolParams, ToolResult> {
  static Name: string = 'task';
  private readonly DEFAULT_TIMEOUT = 10 * 60 * 1000; // 10 minutes
  private readonly DEFAULT_MAX_ITERATIONS = 50;
  private readonly MAX_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  constructor(private readonly config: Config) {
    super(
      TaskTool.Name,
      'Task Agent',
      `Creates a separate agent that has access to all tools and can execute complex multi-step tasks autonomously.

The agent runs in an isolated process with full tool access (filtered by optional parameters) and can perform:
- Complex multi-step operations requiring multiple tools
- Parallel task execution without blocking main process
- Resource-isolated operations with configurable constraints
- Autonomous problem-solving with structured result reporting

The agent will:
1. Receive the task prompt and execute it step by step
2. Use all available tools as needed (subject to filtering)
3. Provide progress updates and intermediate results
4. Return a comprehensive final result with summary

Use this tool for complex tasks that require multiple steps, tool coordination, or autonomous problem-solving.`,
      {
        type: Type.OBJECT,
        properties: {
          description: {
            type: Type.STRING,
            description: 'A brief 3-5 word description of the task for tracking purposes',
          },
          prompt: {
            type: Type.STRING,
            description: 'Detailed task instructions for the agent to execute autonomously. Be specific about what you want accomplished and provide clear success criteria.',
          },
          timeout: {
            type: Type.NUMBER,
            description: 'Maximum execution time in milliseconds (default: 600000 = 10 minutes, max: 1800000 = 30 minutes)',
          },
          working_directory: {
            type: Type.STRING,
            description: 'Optional working directory for the agent, relative to project root',
          },
          tools: {
            type: Type.ARRAY,
            description: 'Optional allowlist of tools the agent can use. If not specified, all tools are available.',
            items: {
              type: Type.STRING,
            },
          },
          exclude_tools: {
            type: Type.ARRAY,
            description: 'Optional blocklist of tools the agent cannot use',
            items: {
              type: Type.STRING,
            },
          },
          max_iterations: {
            type: Type.NUMBER,
            description: 'Maximum number of iterations the agent can perform (default: 50)',
          },
          memory_limit: {
            type: Type.STRING,
            description: 'Memory limit for the agent process (e.g., "512M", "1G")',
          },
        },
        required: ['description', 'prompt'],
      },
      true, // output is markdown
      true, // output can be updated
    );
  }

  getDescription(params: TaskToolParams): string {
    let description = `Execute task: ${params.description}`;
    if (params.working_directory) {
      description += ` [in ${params.working_directory}]`;
    }
    if (params.timeout) {
      description += ` (timeout: ${params.timeout}ms)`;
    }
    return description;
  }

  validateToolParams(params: TaskToolParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }

    if (!params.description.trim()) {
      return 'Description cannot be empty';
    }

    if (!params.prompt.trim()) {
      return 'Prompt cannot be empty';
    }

    if (params.timeout !== undefined) {
      if (params.timeout < 1000) {
        return 'Timeout must be at least 1000ms (1 second)';
      }
      if (params.timeout > this.MAX_TIMEOUT) {
        return `Timeout cannot exceed ${this.MAX_TIMEOUT}ms (30 minutes)`;
      }
    }

    if (params.max_iterations !== undefined) {
      if (params.max_iterations < 1) {
        return 'Max iterations must be at least 1';
      }
      if (params.max_iterations > 200) {
        return 'Max iterations cannot exceed 200';
      }
    }

    if (params.working_directory) {
      if (path.isAbsolute(params.working_directory)) {
        return 'Working directory must be relative to project root';
      }
      const fullPath = path.resolve(this.config.getTargetDir(), params.working_directory);
      if (!fs.existsSync(fullPath)) {
        return `Working directory does not exist: ${params.working_directory}`;
      }
    }

    return null;
  }

  async shouldConfirmExecute(
    params: TaskToolParams,
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return false;
    }

    const timeout = params.timeout || this.DEFAULT_TIMEOUT;
    const maxIterations = params.max_iterations || this.DEFAULT_MAX_ITERATIONS;
    const workingDir = params.working_directory || '(project root)';
    const toolsInfo = params.tools ? 
      `Limited to tools: ${params.tools.join(', ')}` : 
      'All tools available';
    const excludeInfo = params.exclude_tools ? 
      `Excluding tools: ${params.exclude_tools.join(', ')}` : 
      'No tools excluded';

    const confirmationDetails: ToolInfoConfirmationDetails = {
      type: 'info',
      title: 'Confirm Task Agent Execution',
      prompt: `**Task**: ${params.description}

**Working Directory**: ${workingDir}
**Timeout**: ${timeout}ms (${Math.round(timeout / 1000)}s)
**Max Iterations**: ${maxIterations}
**Tools**: ${toolsInfo}
**Exclusions**: ${excludeInfo}

**Task Prompt**:
${params.prompt}

The agent will run with full tool access (subject to filtering) and can make changes to your system. Are you sure you want to proceed?`,
      onConfirm: async (_outcome: ToolConfirmationOutcome) => {
        // No special handling needed for confirmation
      },
    };

    return confirmationDetails;
  }

  async execute(
    params: TaskToolParams,
    abortSignal: AbortSignal,
    updateOutput?: (output: string) => void,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Task execution failed: ${validationError}`,
        returnDisplay: `Error: ${validationError}`,
      };
    }

    if (abortSignal.aborted) {
      return {
        llmContent: 'Task was cancelled before execution could start',
        returnDisplay: 'Task cancelled',
      };
    }

    const timeout = params.timeout || this.DEFAULT_TIMEOUT;
    const maxIterations = params.max_iterations || this.DEFAULT_MAX_ITERATIONS;
    const workingDir = params.working_directory ? 
      path.resolve(this.config.getTargetDir(), params.working_directory) : 
      this.config.getTargetDir();

    let output = `## Task Agent Execution\n\n**Task**: ${params.description}\n**Working Directory**: ${workingDir}\n\n`;

    const appendOutput = (text: string) => {
      output += text;
      if (updateOutput) {
        updateOutput(output);
      }
    };

    const appendProgress = (text: string) => {
      appendOutput(text + '\n');
    };

    appendProgress('🚀 Starting task agent...');

    try {
      const agentConfig: TaskAgentConfig = {
        targetDir: workingDir,
        debugMode: this.config.getDebugMode(),
        model: this.config.getModel(),
        tools: params.tools,
        excludeTools: params.exclude_tools,
        maxIterations,
        prompt: params.prompt,
        timeout,
      };

      const result = await this.executeTaskAgent(agentConfig, abortSignal, (progress) => {
        appendProgress(progress);
      });

      if (abortSignal.aborted) {
        appendProgress('❌ Task was cancelled by user');
        return {
          llmContent: output + '\n\n**Status**: Task cancelled by user',
          returnDisplay: output,
        };
      }

      appendProgress('✅ Task completed successfully');

      const finalOutput = output + '\n\n## Task Results\n\n' + result.summary;

      return {
        llmContent: finalOutput,
        returnDisplay: finalOutput,
      };

    } catch (error) {
      const errorMessage = getErrorMessage(error);
      appendProgress(`❌ Task failed: ${errorMessage}`);
      
      const finalOutput = output + '\n\n**Status**: Task failed\n**Error**: ' + errorMessage;

      return {
        llmContent: finalOutput,
        returnDisplay: finalOutput,
      };
    }
  }

  private async executeTaskAgent(
    config: TaskAgentConfig,
    abortSignal: AbortSignal,
    onProgress: (progress: string) => void,
  ): Promise<{ summary: string; details: unknown }> {
    return new Promise((resolve, reject) => {
      let agentProcess: ChildProcess | null = null;
      let result: unknown = null;
      let buffer = '';
      let isResolved = false;

      const cleanup = () => {
        if (agentProcess && !agentProcess.killed) {
          try {
            // First try graceful termination
            agentProcess.kill('SIGTERM');
            
            // Force kill after timeout
            setTimeout(() => {
              if (agentProcess && !agentProcess.killed) {
                agentProcess.kill('SIGKILL');
              }
            }, 5000);
          } catch (error) {
            // Ignore cleanup errors
            console.debug('Error during agent cleanup:', getErrorMessage(error));
          }
        }
      };

      const safeResolve = (value: { summary: string; details: unknown }) => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          resolve(value);
        }
      };

      const safeReject = (error: Error) => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          reject(error);
        }
      };

      const timeoutHandler = setTimeout(() => {
        safeReject(new Error(`Task timed out after ${config.timeout}ms`));
      }, config.timeout);

      const abortHandler = () => {
        clearTimeout(timeoutHandler);
        safeReject(new Error('Task was cancelled'));
      };

      if (abortSignal.aborted) {
        safeReject(new Error('Task was cancelled before starting'));
        return;
      }

      abortSignal.addEventListener('abort', abortHandler);

      try {
        agentProcess = this.spawnTaskAgent(config);

        agentProcess.stdout?.on('data', (data: Buffer) => {
          try {
            buffer += data.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.trim()) {
                try {
                  const message: TaskMessage = JSON.parse(line);
                  this.handleAgentMessage(message, onProgress, (finalResult) => {
                    result = finalResult;
                  });
                } catch (_parseError) {
                  // If it's not JSON, treat as regular output
                  onProgress(`📝 ${line}`);
                }
              }
            }
          } catch (error) {
            onProgress(`⚠️ Output processing error: ${getErrorMessage(error)}`);
          }
        });

        agentProcess.stderr?.on('data', (data: Buffer) => {
          const errorText = data.toString().trim();
          if (errorText) {
            onProgress(`⚠️ ${errorText}`);
          }
        });

        agentProcess.on('error', (error) => {
          clearTimeout(timeoutHandler);
          abortSignal.removeEventListener('abort', abortHandler);
          safeReject(new Error(`Agent process error: ${getErrorMessage(error)}`));
        });

        agentProcess.on('exit', (code, signal) => {
          clearTimeout(timeoutHandler);
          abortSignal.removeEventListener('abort', abortHandler);

          if (signal && signal !== 'SIGTERM') {
            safeReject(new Error(`Agent process terminated by signal: ${signal}`));
          } else if (code !== null && code !== 0) {
            safeReject(new Error(`Agent process exited with code: ${code}`));
          } else if (result && typeof result === 'object' && 'summary' in result) {
            safeResolve(result as { summary: string; details: unknown });
          } else {
            safeReject(new Error('Agent process completed without returning results'));
          }
        });

        // Give the process a moment to initialize before sending the message
        setTimeout(() => {
          if (agentProcess && !agentProcess.killed && agentProcess.stdin) {
            try {
              const initMessage: TaskMessage = {
                type: 'command',
                data: {
                  action: 'initialize',
                  config,
                },
              };

              agentProcess.stdin.write(JSON.stringify(initMessage) + '\n');
            } catch (error) {
              safeReject(new Error(`Failed to send initialization message: ${getErrorMessage(error)}`));
            }
          }
        }, 100);

      } catch (error) {
        clearTimeout(timeoutHandler);
        abortSignal.removeEventListener('abort', abortHandler);
        safeReject(new Error(`Failed to start agent process: ${getErrorMessage(error)}`));
      }
    });
  }

  private spawnTaskAgent(config: TaskAgentConfig): ChildProcess {
    // Use ts-node to run TypeScript directly in development
    const agentScript = path.join(__dirname, 'task-agent.ts');
    const isProduction = process.env.NODE_ENV === 'production';
    
    let command: string;
    let args: string[];
    
    if (isProduction) {
      // In production, use compiled JavaScript
      const agentScriptJs = path.join(__dirname, 'task-agent.js');
      command = 'node';
      args = [agentScriptJs];
    } else {
      // In development, use ts-node to run TypeScript
      command = 'npx';
      args = ['ts-node', '--transpile-only', agentScript];
    }

    const agentProcess = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: config.targetDir,
      env: {
        ...process.env,
        TASK_AGENT_MODE: 'true',
        NODE_PATH: process.env.NODE_PATH,
      },
      detached: false, // Keep attached for better control
    });

    // Handle process startup errors
    agentProcess.on('error', (error) => {
      console.error('Failed to spawn task agent process:', getErrorMessage(error));
    });

    return agentProcess;
  }

  private handleAgentMessage(
    message: TaskMessage,
    onProgress: (progress: string) => void,
    onResult: (result: unknown) => void,
  ): void {
    switch (message.type) {
      case 'progress':
        onProgress((message.data as any)?.message || String(message.data));
        break;
      case 'result':
        onProgress(`📊 ${(message.data as any)?.message || 'Intermediate result received'}`);
        break;
      case 'error':
        onProgress(`❌ ${(message.data as any)?.message || String(message.data)}`);
        break;
      case 'completion':
        onResult(message.data);
        break;
      default:
        onProgress(`📝 ${JSON.stringify(message.data)}`);
    }
  }
}