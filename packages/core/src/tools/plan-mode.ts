/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseTool,
  ToolResult,
  ToolCallConfirmationDetails,
} from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { getErrorMessage } from '../utils/errors.js';
import { Config } from '../config/config.js';
import { ToolRegistry } from './tool-registry.js';
import {
  PlanModeToolParams,
  PlanningSession,
  PlanningPhase,
  PlanType,
  SessionStatus,
  PlanningFinding,
  PlanningStep,
  FindingType,
  ImportanceLevel,
  StepType,
  EffortLevel,
  validatePlanModeToolParams,
  normalizePlanModeToolParams,
  createPlanningSession,
} from './plan-mode-types.js';
import { Type } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Plan Mode Tool - Enables thinking and ideation without making edits
 * Only allows read operations and analysis for planning purposes
 */
export class PlanModeTool extends BaseTool<PlanModeToolParams, ToolResult> {
  static readonly Name: string = 'plan_mode';
  private activeSessions: Map<string, PlanningSession> = new Map();
  private readonly readOnlyTools: string[] = [
    'ls', 'read_file', 'grep', 'glob', 'repo_map', 'web_fetch', 'web_search',
    'notebook_read', 'todo_read'
  ];

  constructor(
    private readonly config?: Config,
    private readonly toolRegistry?: ToolRegistry,
  ) {
    super(
      PlanModeTool.Name,
      'Plan Mode',
      'Enables thinking, ideation, and analysis without making any edits. Supports read-only operations for exploration and planning. Creates structured planning sessions with findings, insights, and next steps. Ideal for problem analysis, feature design, bug investigation, and strategic planning.',
      {
        type: Type.OBJECT,
        properties: {
          objective: {
            type: Type.STRING,
            description: 'The planning objective or goal to work towards. Be specific about what you want to plan or analyze.',
          },
          context: {
            type: Type.STRING,
            description: 'Optional context or constraints for the planning session. Include relevant background information.',
          },
          focusAreas: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Specific areas to focus on during planning (e.g., "performance", "security", "user experience").',
          },
          planType: {
            type: Type.STRING,
            enum: Object.values(PlanType),
            description: 'Type of planning session to guide the approach and methodology.',
          },
          maxDuration: {
            type: Type.NUMBER,
            description: 'Maximum duration for the planning session in minutes.',
          },
          includeExploration: {
            type: Type.BOOLEAN,
            description: 'Whether to include file system exploration in planning.',
          },
          analyzeFiles: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Specific files or directories to analyze during planning.',
          },
        },
        required: ['objective'],
      },
      true, // isOutputMarkdown
      false, // canUpdateOutput
    );
  }

  validateToolParams(params: PlanModeToolParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }
    return validatePlanModeToolParams(params);
  }

  getDescription(params: PlanModeToolParams): string {
    const normalized = normalizePlanModeToolParams(params);
    
    let description = `Start plan mode session: ${normalized.objective}`;
    
    if (normalized.planType !== PlanType.ANALYSIS) {
      description += ` (${normalized.planType})`;
    }
    
    if (normalized.focusAreas.length > 0) {
      description += ` - Focus: ${normalized.focusAreas.slice(0, 3).join(', ')}${normalized.focusAreas.length > 3 ? '...' : ''}`;
    }
    
    return description;
  }

  async shouldConfirmExecute(
    _params: PlanModeToolParams,
  ): Promise<ToolCallConfirmationDetails | false> {
    // Plan mode is always safe - no edits, only reading and thinking
    return false;
  }

  async execute(
    params: PlanModeToolParams,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters. ${validationError}`,
        returnDisplay: `Error: ${validationError}`,
      };
    }

    if (signal.aborted) {
      return {
        llmContent: 'Plan mode session was cancelled.',
        returnDisplay: 'Planning session cancelled.',
      };
    }

    const normalized = normalizePlanModeToolParams(params);
    
    try {
      // Create new planning session
      const session = createPlanningSession(
        normalized.objective,
        normalized.planType,
        normalized.focusAreas,
        normalized.context
      );
      this.activeSessions.set(session.id, session);

      // Initialize session context
      await this.initializePlanningSession(session, normalized, signal);

      // Execute planning phases
      const result = await this.executePlanningSession(session, normalized, signal);

      // Mark session as completed
      session.status = SessionStatus.COMPLETED;
      session.currentPhase = PlanningPhase.COMPLETED;
      session.endTime = new Date();

      return result;

    } catch (error) {
      const errorMessage = getErrorMessage(error);
      return {
        llmContent: `Planning session failed: ${errorMessage}`,
        returnDisplay: `Error: Planning session failed - ${errorMessage}`,
      };
    }
  }

  /**
   * Initialize the planning session with context and initial exploration
   */
  private async initializePlanningSession(
    session: PlanningSession,
    params: Required<PlanModeToolParams>,
    signal: AbortSignal,
  ): Promise<void> {
    // Phase 1: Understanding
    session.currentPhase = PlanningPhase.UNDERSTANDING;
    
    const understanding: PlanningFinding = {
      description: `Planning session started for: ${params.objective}`,
      source: 'session_init',
      type: FindingType.INSIGHT,
      importance: ImportanceLevel.HIGH,
      discoveredInPhase: PlanningPhase.UNDERSTANDING,
    };
    
    if (params.context) {
      understanding.description += `\nContext: ${params.context}`;
    }
    
    if (params.focusAreas.length > 0) {
      understanding.description += `\nFocus areas: ${params.focusAreas.join(', ')}`;
    }
    
    session.findings.push(understanding);

    // Phase 2: Exploration (if enabled)
    if (params.includeExploration && !signal.aborted) {
      session.currentPhase = PlanningPhase.EXPLORATION;
      await this.exploreCodebase(session, params, signal);
    }
  }

  /**
   * Explore the codebase to gather information for planning
   */
  private async exploreCodebase(
    session: PlanningSession,
    params: Required<PlanModeToolParams>,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      // Analyze specific files if provided
      if (params.analyzeFiles.length > 0) {
        for (const filePath of params.analyzeFiles) {
          if (signal.aborted) break;
          await this.analyzeFile(session, filePath);
        }
      }

      // If no specific files provided, do general exploration based on plan type
      if (params.analyzeFiles.length === 0 && this.config) {
        await this.performGeneralExploration(session, params, signal);
      }

    } catch (error) {
      const finding: PlanningFinding = {
        description: `Exploration error: ${getErrorMessage(error)}`,
        source: 'exploration',
        type: FindingType.ISSUE,
        importance: ImportanceLevel.MEDIUM,
        discoveredInPhase: PlanningPhase.EXPLORATION,
      };
      session.findings.push(finding);
    }
  }

  /**
   * Analyze a specific file and add findings
   */
  private async analyzeFile(session: PlanningSession, filePath: string): Promise<void> {
    try {
      const targetDir = this.config?.getTargetDir() || process.cwd();
      const fullPath = path.isAbsolute(filePath) ? filePath : path.join(targetDir, filePath);
      
      if (!fs.existsSync(fullPath)) {
        const finding: PlanningFinding = {
          description: `File not found: ${filePath}`,
          source: filePath,
          type: FindingType.ISSUE,
          importance: ImportanceLevel.LOW,
          relatedFiles: [filePath],
          discoveredInPhase: session.currentPhase,
        };
        session.findings.push(finding);
        return;
      }

      const stats = fs.statSync(fullPath);
      if (stats.isDirectory()) {
        const finding: PlanningFinding = {
          description: `Directory identified for analysis: ${filePath}`,
          source: filePath,
          type: FindingType.INSIGHT,
          importance: ImportanceLevel.MEDIUM,
          relatedFiles: [filePath],
          discoveredInPhase: session.currentPhase,
        };
        session.findings.push(finding);
      } else {
        // Analyze file content (basic analysis)
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n').length;
        const size = stats.size;
        
        const finding: PlanningFinding = {
          description: `File analyzed: ${filePath} (${lines} lines, ${this.formatFileSize(size)})`,
          source: filePath,
          type: FindingType.INSIGHT,
          importance: ImportanceLevel.MEDIUM,
          relatedFiles: [filePath],
          discoveredInPhase: session.currentPhase,
        };
        session.findings.push(finding);
        session.analyzedFiles.push(filePath);
      }

    } catch (error) {
      const finding: PlanningFinding = {
        description: `Error analyzing ${filePath}: ${getErrorMessage(error)}`,
        source: filePath,
        type: FindingType.ISSUE,
        importance: ImportanceLevel.LOW,
        relatedFiles: [filePath],
        discoveredInPhase: session.currentPhase,
      };
      session.findings.push(finding);
    }
  }

  /**
   * Perform general exploration based on plan type
   */
  private async performGeneralExploration(
    session: PlanningSession,
    params: Required<PlanModeToolParams>,
    signal: AbortSignal,
  ): Promise<void> {
    const targetDir = this.config?.getTargetDir() || process.cwd();
    
    // Basic directory structure analysis
    try {
      const entries = fs.readdirSync(targetDir);
      const directories = entries.filter(entry => {
        try {
          return fs.statSync(path.join(targetDir, entry)).isDirectory();
        } catch {
          return false;
        }
      });

      const finding: PlanningFinding = {
        description: `Project structure: ${directories.length} directories, ${entries.length - directories.length} files in root`,
        source: 'directory_analysis',
        type: FindingType.INSIGHT,
        importance: ImportanceLevel.MEDIUM,
        discoveredInPhase: session.currentPhase,
      };
      session.findings.push(finding);

      // Look for common configuration files
      const configFiles = entries.filter(entry => 
        entry.includes('config') || 
        entry.endsWith('.json') || 
        entry.endsWith('.yml') || 
        entry.endsWith('.yaml') ||
        entry.startsWith('.')
      );

      if (configFiles.length > 0) {
        const configFinding: PlanningFinding = {
          description: `Configuration files found: ${configFiles.join(', ')}`,
          source: 'config_analysis',
          type: FindingType.INSIGHT,
          importance: ImportanceLevel.MEDIUM,
          relatedFiles: configFiles,
          discoveredInPhase: session.currentPhase,
        };
        session.findings.push(configFinding);
      }

    } catch (error) {
      // Silently handle exploration errors
    }
  }

  /**
   * Execute the main planning session logic
   */
  private async executePlanningSession(
    session: PlanningSession,
    params: Required<PlanModeToolParams>,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    // Phase 3: Analysis
    if (!signal.aborted) {
      session.currentPhase = PlanningPhase.ANALYSIS;
      this.analyzeFindings(session, params);
    }

    // Phase 4: Strategy
    if (!signal.aborted) {
      session.currentPhase = PlanningPhase.STRATEGY;
      this.generateStrategy(session, params);
    }

    // Phase 5: Finalization
    if (!signal.aborted) {
      session.currentPhase = PlanningPhase.FINALIZATION;
      this.finalizeNextSteps(session, params);
    }

    // Generate output
    return this.generatePlanningReport(session, params);
  }

  /**
   * Analyze findings and generate insights
   */
  private analyzeFindings(session: PlanningSession, params: Required<PlanModeToolParams>): void {
    const highPriorityFindings = session.findings.filter(f => f.importance === ImportanceLevel.HIGH);
    const issues = session.findings.filter(f => f.type === FindingType.ISSUE);
    
    if (highPriorityFindings.length > 0) {
      const analysis: PlanningFinding = {
        description: `${highPriorityFindings.length} high-priority findings identified`,
        source: 'analysis',
        type: FindingType.INSIGHT,
        importance: ImportanceLevel.HIGH,
        discoveredInPhase: PlanningPhase.ANALYSIS,
      };
      session.findings.push(analysis);
    }

    if (issues.length > 0) {
      const issueAnalysis: PlanningFinding = {
        description: `${issues.length} issues or concerns identified that need attention`,
        source: 'analysis',
        type: FindingType.RISK,
        importance: ImportanceLevel.MEDIUM,
        discoveredInPhase: PlanningPhase.ANALYSIS,
      };
      session.findings.push(issueAnalysis);
    }
  }

  /**
   * Generate strategy based on plan type and findings
   */
  private generateStrategy(session: PlanningSession, params: Required<PlanModeToolParams>): void {
    const strategy = this.getStrategyForPlanType(params.planType, session);
    
    const strategyFinding: PlanningFinding = {
      description: strategy,
      source: 'strategy_generation',
      type: FindingType.INSIGHT,
      importance: ImportanceLevel.HIGH,
      discoveredInPhase: PlanningPhase.STRATEGY,
    };
    session.findings.push(strategyFinding);
  }

  /**
   * Get strategy recommendations based on plan type
   */
  private getStrategyForPlanType(planType: PlanType, session: PlanningSession): string {
    const findingsCount = session.findings.length;
    const filesAnalyzed = session.analyzedFiles.length;
    
    switch (planType) {
      case PlanType.FEATURE_DESIGN:
        return `Feature design strategy: Based on ${findingsCount} findings, focus on modular design with clear interfaces. Consider ${filesAnalyzed} analyzed files for integration points.`;
      
      case PlanType.BUG_INVESTIGATION:
        return `Bug investigation strategy: Systematic analysis of ${findingsCount} findings suggests following the error trail through ${filesAnalyzed} files. Prioritize reproduction and root cause analysis.`;
      
      case PlanType.REFACTORING:
        return `Refactoring strategy: With ${findingsCount} findings from ${filesAnalyzed} files, plan incremental changes with comprehensive testing at each step.`;
      
      case PlanType.ARCHITECTURE:
        return `Architecture strategy: Review ${findingsCount} findings to identify structural improvements. Focus on scalability, maintainability, and performance.`;
      
      case PlanType.OPTIMIZATION:
        return `Optimization strategy: Analyze ${findingsCount} performance-related findings. Measure first, then optimize based on data.`;
      
      case PlanType.TESTING:
        return `Testing strategy: Develop comprehensive test plan covering ${findingsCount} identified areas. Prioritize critical paths and edge cases.`;
      
      default:
        return `Analysis strategy: Synthesize ${findingsCount} findings from ${filesAnalyzed} files to develop actionable next steps.`;
    }
  }

  /**
   * Finalize next steps based on analysis
   */
  private finalizeNextSteps(session: PlanningSession, params: Required<PlanModeToolParams>): void {
    // Generate next steps based on findings and plan type
    const nextSteps = this.generateNextSteps(session, params);
    session.nextSteps = nextSteps;
  }

  /**
   * Generate actionable next steps
   */
  private generateNextSteps(session: PlanningSession, params: Required<PlanModeToolParams>): PlanningStep[] {
    const steps: PlanningStep[] = [];
    
    // Always start with deeper investigation if needed
    if (session.analyzedFiles.length < 5 && params.includeExploration) {
      steps.push({
        description: 'Conduct deeper file system exploration to gather more context',
        type: StepType.INVESTIGATE,
        effort: EffortLevel.SMALL,
        priority: ImportanceLevel.MEDIUM,
        notes: 'Use read-only tools to analyze additional relevant files',
      });
    }

    // Add plan-type specific steps
    switch (params.planType) {
      case PlanType.FEATURE_DESIGN:
        steps.push(
          {
            description: 'Create detailed feature specification and API design',
            type: StepType.DESIGN,
            effort: EffortLevel.MEDIUM,
            priority: ImportanceLevel.HIGH,
          },
          {
            description: 'Implement feature with unit tests',
            type: StepType.IMPLEMENT,
            effort: EffortLevel.LARGE,
            priority: ImportanceLevel.HIGH,
          }
        );
        break;

      case PlanType.BUG_INVESTIGATION:
        steps.push(
          {
            description: 'Reproduce the bug in controlled environment',
            type: StepType.INVESTIGATE,
            effort: EffortLevel.MEDIUM,
            priority: ImportanceLevel.HIGH,
          },
          {
            description: 'Implement fix with regression tests',
            type: StepType.IMPLEMENT,
            effort: EffortLevel.MEDIUM,
            priority: ImportanceLevel.HIGH,
          }
        );
        break;

      default:
        steps.push({
          description: 'Execute the planned changes based on analysis',
          type: StepType.IMPLEMENT,
          effort: EffortLevel.MEDIUM,
          priority: ImportanceLevel.MEDIUM,
          notes: 'Implement changes incrementally with testing at each step',
        });
    }

    // Always end with review
    steps.push({
      description: 'Review and validate completed changes',
      type: StepType.REVIEW,
      effort: EffortLevel.SMALL,
      priority: ImportanceLevel.MEDIUM,
    });

    return steps;
  }

  /**
   * Generate the final planning report
   */
  private generatePlanningReport(session: PlanningSession, params: Required<PlanModeToolParams>): ToolResult {
    const duration = Math.round((Date.now() - session.startTime.getTime()) / 1000);
    
    let report = `# Planning Session Report\n\n`;
    report += `**Objective:** ${params.objective}\n\n`;
    report += `**Plan Type:** ${params.planType}\n`;
    report += `**Duration:** ${duration} seconds\n`;
    report += `**Status:** ${session.status}\n\n`;

    if (params.context) {
      report += `**Context:** ${params.context}\n\n`;
    }

    if (params.focusAreas.length > 0) {
      report += `**Focus Areas:** ${params.focusAreas.join(', ')}\n\n`;
    }

    // Findings section
    report += `## 📋 Findings (${session.findings.length})\n\n`;
    const findingsByType = this.groupFindingsByType(session.findings);
    
    for (const [type, findings] of Object.entries(findingsByType)) {
      if (findings.length > 0) {
        report += `### ${this.getFindingTypeEmoji(type as FindingType)} ${type.charAt(0).toUpperCase() + type.slice(1)}s\n\n`;
        findings.forEach((finding, index) => {
          const priority = finding.importance === ImportanceLevel.HIGH ? '🔴' : 
                          finding.importance === ImportanceLevel.MEDIUM ? '🟡' : '🟢';
          report += `${index + 1}. ${priority} ${finding.description}\n`;
          if (finding.relatedFiles && finding.relatedFiles.length > 0) {
            report += `   - Files: ${finding.relatedFiles.join(', ')}\n`;
          }
          report += '\n';
        });
      }
    }

    // Next steps section
    report += `## 🚀 Next Steps (${session.nextSteps.length})\n\n`;
    session.nextSteps.forEach((step, index) => {
      const priority = step.priority === ImportanceLevel.HIGH ? '🔴' : 
                      step.priority === ImportanceLevel.MEDIUM ? '🟡' : '🟢';
      const effort = this.getEffortEmoji(step.effort);
      report += `${index + 1}. ${priority} ${effort} **${step.type}:** ${step.description}\n`;
      if (step.notes) {
        report += `   - Notes: ${step.notes}\n`;
      }
      if (step.affectedFiles && step.affectedFiles.length > 0) {
        report += `   - Affects: ${step.affectedFiles.join(', ')}\n`;
      }
      report += '\n';
    });

    // Summary
    report += `## 📊 Summary\n\n`;
    report += `- **Files analyzed:** ${session.analyzedFiles.length}\n`;
    report += `- **Total findings:** ${session.findings.length}\n`;
    report += `- **High priority items:** ${session.findings.filter(f => f.importance === ImportanceLevel.HIGH).length}\n`;
    report += `- **Next steps planned:** ${session.nextSteps.length}\n\n`;

    report += `---\n*Planning session completed. Ready to proceed with implementation when you exit plan mode.*`;

    const summary = `Plan mode session completed: ${session.findings.length} findings, ${session.nextSteps.length} next steps`;

    return {
      llmContent: report,
      returnDisplay: summary,
    };
  }

  /**
   * Group findings by type
   */
  private groupFindingsByType(findings: PlanningFinding[]): Record<string, PlanningFinding[]> {
    const grouped: Record<string, PlanningFinding[]> = {};
    
    findings.forEach(finding => {
      if (!grouped[finding.type]) {
        grouped[finding.type] = [];
      }
      grouped[finding.type].push(finding);
    });

    return grouped;
  }

  /**
   * Get emoji for finding type
   */
  private getFindingTypeEmoji(type: FindingType): string {
    switch (type) {
      case FindingType.ISSUE: return '🚨';
      case FindingType.OPPORTUNITY: return '💡';
      case FindingType.INSIGHT: return '🔍';
      case FindingType.RISK: return '⚠️';
      case FindingType.DEPENDENCY: return '🔗';
      case FindingType.CONSTRAINT: return '🚧';
      default: return '📌';
    }
  }

  /**
   * Get emoji for effort level
   */
  private getEffortEmoji(effort: EffortLevel): string {
    switch (effort) {
      case EffortLevel.TRIVIAL: return '⚡';
      case EffortLevel.SMALL: return '🔸';
      case EffortLevel.MEDIUM: return '🔶';
      case EffortLevel.LARGE: return '🔺';
      case EffortLevel.EXTRA_LARGE: return '🔴';
      default: return '🔸';
    }
  }

  /**
   * Format file size for display
   */
  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
    return `${Math.round(bytes / (1024 * 1024))}MB`;
  }

  /**
   * Get active planning sessions
   */
  public getActiveSessions(): PlanningSession[] {
    return Array.from(this.activeSessions.values()).filter(
      session => session.status === SessionStatus.ACTIVE
    );
  }

  /**
   * Get planning session by ID
   */
  public getSession(sessionId: string): PlanningSession | undefined {
    return this.activeSessions.get(sessionId);
  }
}