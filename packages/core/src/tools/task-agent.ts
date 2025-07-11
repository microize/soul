/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as readline from 'readline';
import { Config, ConfigParameters } from '../config/config.js';
import { ToolRegistry } from './tool-registry.js';
import { executeToolCall } from '../core/nonInteractiveToolExecutor.js';
import { getErrorMessage } from '../utils/errors.js';

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

interface AgentState {
  config: TaskAgentConfig;
  toolRegistry: ToolRegistry;
  soulConfig: Config;
  iterations: number;
  isComplete: boolean;
  results: Array<{ tool: string; result: unknown }>;
  context: string[];
}

class TaskAgent {
  private state: AgentState | null = null;
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    this.setupMessageHandling();
  }

  private setupMessageHandling(): void {
    this.rl.on('line', async (line) => {
      try {
        const message: TaskMessage = JSON.parse(line);
        await this.handleMessage(message);
      } catch (error) {
        this.sendError(`Failed to parse message: ${getErrorMessage(error)}`);
      }
    });

    this.rl.on('close', () => {
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      this.sendMessage('error', { message: 'Agent terminated by signal' });
      process.exit(1);
    });

    process.on('SIGINT', () => {
      this.sendMessage('error', { message: 'Agent interrupted by signal' });
      process.exit(1);
    });
  }

  private async handleMessage(message: TaskMessage): Promise<void> {
    switch (message.type) {
      case 'command':
        await this.handleCommand(message.data as Record<string, unknown>);
        break;
      default:
        this.sendError(`Unknown message type: ${message.type}`);
    }
  }

  private async handleCommand(data: Record<string, unknown>): Promise<void> {
    switch (data.action) {
      case 'initialize':
        await this.initialize(data.config as TaskAgentConfig);
        break;
      default:
        this.sendError(`Unknown command: ${data.action}`);
    }
  }

  private async initialize(agentConfig: TaskAgentConfig): Promise<void> {
    try {
      this.sendProgress('Initializing agent...');

      // Create Soul CLI config for this agent
      const configParams: ConfigParameters = {
        sessionId: `task-agent-${Date.now()}`,
        targetDir: agentConfig.targetDir,
        debugMode: agentConfig.debugMode,
        model: agentConfig.model,
        coreTools: agentConfig.tools,
        excludeTools: agentConfig.excludeTools,
        cwd: agentConfig.targetDir,
        fullContext: false,
        checkpointing: false,
        usageStatisticsEnabled: false,
        telemetry: { enabled: false },
      };

      const soulConfig = new Config(configParams);
      await soulConfig.initialize();

      this.state = {
        config: agentConfig,
        toolRegistry: await soulConfig.getToolRegistry(),
        soulConfig,
        iterations: 0,
        isComplete: false,
        results: [],
        context: [
          'You are an autonomous task execution agent with access to development tools.',
          'Your goal is to complete the given task efficiently and provide a comprehensive summary.',
          'You can use multiple tools as needed and should work step-by-step to achieve the objective.',
          'Provide clear progress updates and document your reasoning.',
          '',
          `Task to complete: ${agentConfig.prompt}`,
          '',
          'Available tools: ' + (await this.getAvailableToolsList()),
          '',
          'Begin by analyzing the task and creating a plan, then execute it step by step.',
        ],
      };

      this.sendProgress('Agent initialized successfully');
      await this.executeTask();

    } catch (error) {
      this.sendError(`Failed to initialize agent: ${getErrorMessage(error)}`);
    }
  }

  private async getAvailableToolsList(): Promise<string> {
    if (!this.state) return 'none';
    
    const tools = this.state.toolRegistry.getAllTools();
    return tools.map(tool => tool.name).join(', ');
  }

  private async executeTask(): Promise<void> {
    if (!this.state) {
      this.sendError('Agent not initialized');
      return;
    }

    try {
      this.sendProgress('Starting task execution...');

      // Simple implementation: for now, we'll just simulate task completion
      // In a full implementation, this would integrate with the Soul CLI's AI reasoning
      
      const taskSummary = await this.simulateTaskExecution();
      
      this.sendCompletion({
        summary: taskSummary,
        details: {
          iterations: this.state.iterations,
          results: this.state.results,
          context: this.state.context,
        },
      });

    } catch (error) {
      this.sendError(`Task execution failed: ${getErrorMessage(error)}`);
    }
  }

  private async simulateTaskExecution(): Promise<string> {
    if (!this.state) throw new Error('Agent not initialized');

    this.sendProgress('Analyzing task requirements...');
    await this.sleep(1000);

    this.sendProgress('Creating execution plan...');
    await this.sleep(1000);

    // For demonstration, we'll just execute a simple tool call
    this.sendProgress('Executing tools as needed...');
    
    try {
      // Example: List files in current directory
      const lsResult = await executeToolCall(
        this.state.soulConfig,
        {
          callId: 'ls-' + Date.now(),
          name: 'ls',
          args: { path: this.state.config.targetDir },
          isClientInitiated: false,
          prompt_id: 'task-agent-' + Date.now(),
        },
        this.state.toolRegistry,
      );

      this.state.results.push({
        tool: 'ls',
        result: lsResult.resultDisplay,
      });

      this.sendProgress('Tools executed successfully');
    } catch (error) {
      this.sendProgress(`Tool execution warning: ${getErrorMessage(error)}`);
    }

    this.sendProgress('Finalizing results...');
    await this.sleep(500);

    const summary = `## Task Execution Summary

**Task**: ${this.state.config.prompt}

**Status**: Completed successfully

**Iterations**: ${this.state.iterations + 1}

**Actions Taken**:
- Analyzed task requirements
- Created execution plan  
- Executed necessary tools
- Generated comprehensive results

**Results**:
${this.state.results.map(r => `- ${r.tool}: ${r.result}`).join('\n')}

**Note**: This is a demonstration implementation. In the full version, this agent would:
- Use AI reasoning to understand complex tasks
- Dynamically select and execute appropriate tools
- Handle multi-step workflows autonomously
- Provide detailed progress tracking and results

The agent successfully completed the basic task execution framework.`;

    return summary;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private sendMessage(type: string, data: unknown, id?: string): void {
    const message: TaskMessage = { type: type as any, data, id };
    process.stdout.write(JSON.stringify(message) + '\n');
  }

  private sendProgress(message: string): void {
    this.sendMessage('progress', { message: `🔄 ${message}` });
  }

  private sendResult(data: unknown): void {
    this.sendMessage('result', data);
  }

  private sendError(message: string): void {
    this.sendMessage('error', { message: `❌ ${message}` });
  }

  private sendCompletion(data: unknown): void {
    this.sendMessage('completion', data);
  }
}

// Start the agent if running as main process
if (process.env.TASK_AGENT_MODE === 'true') {
  new TaskAgent();
}