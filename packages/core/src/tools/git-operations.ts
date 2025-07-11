/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../config/config.js';
import { BaseTool, ToolResult, ToolCallConfirmationDetails } from './tools.js';
import { Type } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { getErrorMessage } from '../utils/errors.js';
import { isGitRepository, findGitRoot } from '../utils/gitUtils.js';
import { simpleGit, SimpleGit } from 'simple-git';

/**
 * Git operation types
 */
export enum GitOperation {
  STATUS = 'status',
  BRANCH_LIST = 'branch_list',
  BRANCH_CREATE = 'branch_create',
  BRANCH_SWITCH = 'branch_switch',
  BRANCH_DELETE = 'branch_delete',
  COMMIT = 'commit',
  PUSH = 'push',
  PULL = 'pull',
  MERGE = 'merge',
  LOG = 'log',
  DIFF = 'diff',
  STASH = 'stash',
  UNSTASH = 'unstash',
  RESET = 'reset',
  REVERT = 'revert',
  CHERRY_PICK = 'cherry_pick',
  REMOTE_INFO = 'remote_info',
  CONFLICT_STATUS = 'conflict_status',
  BLAME = 'blame',
}

/**
 * Parameters for the GitOperations tool
 */
export interface GitOperationsToolParams {
  /**
   * The Git operation to perform
   */
  operation: GitOperation;

  /**
   * Branch name (for branch operations)
   */
  branch_name?: string;

  /**
   * Commit message (for commit operations)
   */
  message?: string;

  /**
   * File path (for file-specific operations)
   */
  file_path?: string;

  /**
   * Commit hash (for operations that need a specific commit)
   */
  commit_hash?: string;

  /**
   * Remote name (for remote operations)
   */
  remote_name?: string;

  /**
   * Additional options for the operation
   */
  options?: Record<string, unknown>;

  /**
   * Whether to force the operation (use with caution)
   */
  force?: boolean;
}

/**
 * Git Operations Tool - Comprehensive Git repository management
 */
export class GitOperationsTool extends BaseTool<GitOperationsToolParams, ToolResult> {
  private readonly config: Config;
  static readonly Name = 'git_ops';

  constructor(config: Config) {
    super(
      GitOperationsTool.Name,
      'Git Operations',
      'Comprehensive Git repository management tool for branch operations, commits, merges, and repository analysis. Provides intelligent Git workflow assistance with conflict detection and resolution guidance.',
      {
        properties: {
          operation: {
            type: Type.STRING,
            description: 'The Git operation to perform',
            enum: Object.values(GitOperation),
          },
          branch_name: {
            type: Type.STRING,
            description: 'Branch name for branch operations (create, switch, delete, merge)',
          },
          message: {
            type: Type.STRING,
            description: 'Commit message for commit operations',
          },
          file_path: {
            type: Type.STRING,
            description: 'File path for file-specific operations (diff, blame)',
          },
          commit_hash: {
            type: Type.STRING,
            description: 'Commit hash for operations that reference specific commits',
          },
          remote_name: {
            type: Type.STRING,
            description: 'Remote name for remote operations (default: origin)',
          },
          options: {
            type: Type.OBJECT,
            description: 'Additional options for the operation',
          },
          force: {
            type: Type.BOOLEAN,
            description: 'Whether to force the operation (use with caution)',
          },
        },
        required: ['operation'],
        type: Type.OBJECT,
      }
    );
    this.config = config;
  }

  validateToolParams(params: GitOperationsToolParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }

    // Validate that we're in a git repository
    const targetDir = this.config.getTargetDir();
    if (!isGitRepository(targetDir)) {
      return 'Current directory is not a Git repository';
    }

    // Validate operation-specific parameters
    switch (params.operation) {
      case GitOperation.BRANCH_CREATE:
      case GitOperation.BRANCH_SWITCH:
      case GitOperation.BRANCH_DELETE:
      case GitOperation.MERGE:
        if (!params.branch_name) {
          return `Branch name is required for ${params.operation} operation`;
        }
        break;

      case GitOperation.COMMIT:
        if (!params.message) {
          return 'Commit message is required for commit operation';
        }
        break;

      case GitOperation.DIFF:
      case GitOperation.BLAME:
        if (!params.file_path) {
          return `File path is required for ${params.operation} operation`;
        }
        break;

      case GitOperation.CHERRY_PICK:
      case GitOperation.REVERT:
        if (!params.commit_hash) {
          return `Commit hash is required for ${params.operation} operation`;
        }
        break;
      default:
        break;
    }

    return null;
  }

  getDescription(params: GitOperationsToolParams): string {
    const operation = params.operation;
    const branch = params.branch_name || '';
    const message = params.message || '';
    const file = params.file_path || '';

    switch (operation) {
      case GitOperation.STATUS:
        return 'Get Git repository status';
      case GitOperation.BRANCH_LIST:
        return 'List all branches';
      case GitOperation.BRANCH_CREATE:
        return `Create new branch: ${branch}`;
      case GitOperation.BRANCH_SWITCH:
        return `Switch to branch: ${branch}`;
      case GitOperation.BRANCH_DELETE:
        return `Delete branch: ${branch}`;
      case GitOperation.COMMIT:
        return `Commit changes: ${message}`;
      case GitOperation.PUSH:
        return 'Push changes to remote';
      case GitOperation.PULL:
        return 'Pull changes from remote';
      case GitOperation.MERGE:
        return `Merge branch: ${branch}`;
      case GitOperation.LOG:
        return 'Show commit history';
      case GitOperation.DIFF:
        return `Show diff for: ${file}`;
      case GitOperation.BLAME:
        return `Show blame for: ${file}`;
      default:
        return `Perform Git operation: ${operation}`;
    }
  }

  async shouldConfirmExecute(params: GitOperationsToolParams): Promise<ToolCallConfirmationDetails | false> {
    // Operations that are potentially destructive and should be confirmed
    const destructiveOperations = [
      GitOperation.BRANCH_DELETE,
      GitOperation.RESET,
      GitOperation.REVERT,
      GitOperation.MERGE,
      GitOperation.PUSH,
    ];

    if (destructiveOperations.includes(params.operation) || params.force) {
      return {
        type: 'exec',
        title: `Confirm Git Operation: ${params.operation}`,
        command: `git ${params.operation}`,
        rootCommand: 'git',
        onConfirm: async (_outcome) => {
          // No additional action needed
        },
      };
    }

    return false;
  }

  async execute(params: GitOperationsToolParams): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: ${validationError}`,
        returnDisplay: `Error: ${validationError}`,
      };
    }

    try {
      const targetDir = this.config.getTargetDir();
      const gitRoot = findGitRoot(targetDir);
      
      if (!gitRoot) {
        return {
          llmContent: 'Error: Not in a Git repository',
          returnDisplay: 'Error: Not in a Git repository',
        };
      }

      const git = simpleGit(gitRoot);
      
      switch (params.operation) {
        case GitOperation.STATUS:
          return await this.getStatus(git);
        case GitOperation.BRANCH_LIST:
          return await this.listBranches(git);
        case GitOperation.BRANCH_CREATE:
          return await this.createBranch(git, params.branch_name!);
        case GitOperation.BRANCH_SWITCH:
          return await this.switchBranch(git, params.branch_name!);
        case GitOperation.BRANCH_DELETE:
          return await this.deleteBranch(git, params.branch_name!, params.force);
        case GitOperation.COMMIT:
          return await this.commitChanges(git, params.message!);
        case GitOperation.PUSH:
          return await this.pushChanges(git, params.remote_name || 'origin');
        case GitOperation.PULL:
          return await this.pullChanges(git, params.remote_name || 'origin');
        case GitOperation.MERGE:
          return await this.mergeBranch(git, params.branch_name!);
        case GitOperation.LOG:
          return await this.getLog(git);
        case GitOperation.DIFF:
          return await this.getDiff(git, params.file_path);
        case GitOperation.STASH:
          return await this.stashChanges(git, params.message);
        case GitOperation.UNSTASH:
          return await this.unstashChanges(git);
        case GitOperation.RESET:
          return await this.resetChanges(git, params.commit_hash);
        case GitOperation.REVERT:
          return await this.revertCommit(git, params.commit_hash!);
        case GitOperation.CHERRY_PICK:
          return await this.cherryPick(git, params.commit_hash!);
        case GitOperation.REMOTE_INFO:
          return await this.getRemoteInfo(git);
        case GitOperation.CONFLICT_STATUS:
          return await this.getConflictStatus(git);
        case GitOperation.BLAME:
          return await this.getBlame(git, params.file_path!);
        default:
          return {
            llmContent: `Error: Unsupported operation: ${params.operation}`,
            returnDisplay: `Error: Unsupported operation: ${params.operation}`,
          };
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      return {
        llmContent: `Git operation failed: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
      };
    }
  }

  private async getStatus(git: SimpleGit): Promise<ToolResult> {
    const status = await git.status();
    
    const statusInfo = [
      `Current branch: ${status.current}`,
      `Ahead: ${status.ahead} commits`,
      `Behind: ${status.behind} commits`,
      ``,
      `Modified files: ${status.modified.length}`,
      `Staged files: ${status.staged.length}`,
      `Untracked files: ${status.not_added.length}`,
      `Deleted files: ${status.deleted.length}`,
    ];

    if (status.conflicted.length > 0) {
      statusInfo.push(`⚠️  Conflicts: ${status.conflicted.length} files`);
    }

    const result = statusInfo.join('\n');
    
    return {
      llmContent: result,
      returnDisplay: result,
    };
  }

  private async listBranches(git: SimpleGit): Promise<ToolResult> {
    const branches = await git.branch();
    
    const branchList = [
      `Current branch: ${branches.current}`,
      ``,
      `Local branches:`,
      ...branches.all.filter(b => !b.startsWith('remotes/')).map(b => 
        b === branches.current ? `* ${b}` : `  ${b}`
      ),
      ``,
      `Remote branches:`,
      ...branches.all.filter(b => b.startsWith('remotes/')).map(b => `  ${b}`),
    ];

    const result = branchList.join('\n');
    
    return {
      llmContent: result,
      returnDisplay: result,
    };
  }

  private async createBranch(git: SimpleGit, branchName: string): Promise<ToolResult> {
    await git.checkoutLocalBranch(branchName);
    
    const result = `Created and switched to new branch: ${branchName}`;
    
    return {
      llmContent: result,
      returnDisplay: result,
    };
  }

  private async switchBranch(git: SimpleGit, branchName: string): Promise<ToolResult> {
    await git.checkout(branchName);
    
    const result = `Switched to branch: ${branchName}`;
    
    return {
      llmContent: result,
      returnDisplay: result,
    };
  }

  private async deleteBranch(git: SimpleGit, branchName: string, force?: boolean): Promise<ToolResult> {
    if (force) {
      await git.deleteLocalBranch(branchName, true);
    } else {
      await git.deleteLocalBranch(branchName);
    }
    
    const result = `Deleted branch: ${branchName}`;
    
    return {
      llmContent: result,
      returnDisplay: result,
    };
  }

  private async commitChanges(git: SimpleGit, message: string): Promise<ToolResult> {
    // First add all changes
    await git.add('.');
    
    // Then commit
    const commitResult = await git.commit(message);
    
    const result = `Committed changes: ${commitResult.commit}\nMessage: ${message}`;
    
    return {
      llmContent: result,
      returnDisplay: result,
    };
  }

  private async pushChanges(git: SimpleGit, remoteName: string): Promise<ToolResult> {
    const status = await git.status();
    const currentBranch = status.current;
    
    if (!currentBranch) {
      return {
        llmContent: 'Error: No current branch found',
        returnDisplay: 'Error: No current branch found',
      };
    }
    
    await git.push(remoteName, currentBranch);
    
    const result = `Pushed changes to ${remoteName}/${currentBranch}`;
    
    return {
      llmContent: result,
      returnDisplay: result,
    };
  }

  private async pullChanges(git: SimpleGit, remoteName: string): Promise<ToolResult> {
    const pullResult = await git.pull(remoteName);
    
    const result = `Pulled changes from ${remoteName}\nSummary: ${pullResult.summary.changes} changes, ${pullResult.summary.insertions} insertions, ${pullResult.summary.deletions} deletions`;
    
    return {
      llmContent: result,
      returnDisplay: result,
    };
  }

  private async mergeBranch(git: SimpleGit, branchName: string): Promise<ToolResult> {
    const mergeResult = await git.merge([branchName]);
    
    const result = `Merged branch: ${branchName}\nResult: ${mergeResult.result}`;
    
    return {
      llmContent: result,
      returnDisplay: result,
    };
  }

  private async getLog(git: SimpleGit): Promise<ToolResult> {
    const log = await git.log({ maxCount: 10 });
    
    const logEntries = log.all.map(commit => 
      `${commit.hash.substring(0, 7)} - ${commit.message} (${commit.author_name}, ${commit.date})`
    );
    
    const result = `Recent commits:\n${logEntries.join('\n')}`;
    
    return {
      llmContent: result,
      returnDisplay: result,
    };
  }

  private async getDiff(git: SimpleGit, filePath?: string): Promise<ToolResult> {
    const diff = filePath ? await git.diff([filePath]) : await git.diff();
    
    const result = diff || 'No changes found';
    
    return {
      llmContent: result,
      returnDisplay: result,
    };
  }

  private async stashChanges(git: SimpleGit, message?: string): Promise<ToolResult> {
    await git.stash(['push', '-m', message || 'Stashed changes']);
    
    const result = `Stashed changes: ${message || 'Stashed changes'}`;
    
    return {
      llmContent: result,
      returnDisplay: result,
    };
  }

  private async unstashChanges(git: SimpleGit): Promise<ToolResult> {
    await git.stash(['pop']);
    
    const result = 'Applied most recent stash';
    
    return {
      llmContent: result,
      returnDisplay: result,
    };
  }

  private async resetChanges(git: SimpleGit, commitHash?: string): Promise<ToolResult> {
    if (commitHash) {
      await git.reset(['--hard', commitHash]);
    } else {
      await git.reset(['--hard', 'HEAD']);
    }
    
    const result = `Reset to ${commitHash || 'HEAD'}`;
    
    return {
      llmContent: result,
      returnDisplay: result,
    };
  }

  private async revertCommit(git: SimpleGit, commitHash: string): Promise<ToolResult> {
    await git.revert(commitHash);
    
    const result = `Reverted commit: ${commitHash}`;
    
    return {
      llmContent: result,
      returnDisplay: result,
    };
  }

  private async cherryPick(git: SimpleGit, commitHash: string): Promise<ToolResult> {
    await git.raw(['cherry-pick', commitHash]);
    
    const result = `Cherry-picked commit: ${commitHash}`;
    
    return {
      llmContent: result,
      returnDisplay: result,
    };
  }

  private async getRemoteInfo(git: SimpleGit): Promise<ToolResult> {
    const remotes = await git.getRemotes(true);
    
    const remoteInfo = remotes.map(remote => 
      `${remote.name}: ${remote.refs.fetch} (fetch), ${remote.refs.push} (push)`
    );
    
    const result = `Remote repositories:\n${remoteInfo.join('\n')}`;
    
    return {
      llmContent: result,
      returnDisplay: result,
    };
  }

  private async getConflictStatus(git: SimpleGit): Promise<ToolResult> {
    const status = await git.status();
    
    if (status.conflicted.length === 0) {
      return {
        llmContent: 'No merge conflicts found',
        returnDisplay: 'No merge conflicts found',
      };
    }

    const conflicts = status.conflicted.map(file => `  - ${file}`);
    const result = `Merge conflicts found in ${status.conflicted.length} files:\n${conflicts.join('\n')}`;
    
    return {
      llmContent: result,
      returnDisplay: result,
    };
  }

  private async getBlame(git: SimpleGit, filePath: string): Promise<ToolResult> {
    const blame = await git.raw(['blame', filePath]);
    
    const result = `Blame for ${filePath}:\n${blame}`;
    
    return {
      llmContent: result,
      returnDisplay: result,
    };
  }
}