/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Planning session phases
 */
export enum PlanningPhase {
  UNDERSTANDING = 'understanding',
  EXPLORATION = 'exploration',
  ANALYSIS = 'analysis',
  STRATEGY = 'strategy',
  FINALIZATION = 'finalization',
  COMPLETED = 'completed',
}

/**
 * Types of planning sessions
 */
export enum PlanType {
  ANALYSIS = 'analysis',
  FEATURE_DESIGN = 'feature_design',
  BUG_INVESTIGATION = 'bug_investigation',
  REFACTORING = 'refactoring',
  ARCHITECTURE = 'architecture',
  OPTIMIZATION = 'optimization',
  TESTING = 'testing',
}

/**
 * Session status
 */
export enum SessionStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  ERROR = 'error',
}

/**
 * Types of findings
 */
export enum FindingType {
  ISSUE = 'issue',
  OPPORTUNITY = 'opportunity',
  INSIGHT = 'insight',
  RISK = 'risk',
  DEPENDENCY = 'dependency',
  CONSTRAINT = 'constraint',
}

/**
 * Importance levels
 */
export enum ImportanceLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

/**
 * Types of planning steps
 */
export enum StepType {
  INVESTIGATE = 'investigate',
  DESIGN = 'design',
  IMPLEMENT = 'implement',
  TEST = 'test',
  REVIEW = 'review',
  DOCUMENT = 'document',
}

/**
 * Effort levels for planning steps
 */
export enum EffortLevel {
  TRIVIAL = 'trivial',
  SMALL = 'small',
  MEDIUM = 'medium',
  LARGE = 'large',
  EXTRA_LARGE = 'extra_large',
}

/**
 * Parameters for the PlanMode tool
 */
export interface PlanModeToolParams {
  /**
   * The planning objective or goal to work towards
   */
  objective: string;

  /**
   * Optional context or constraints for the planning session
   */
  context?: string;

  /**
   * Specific areas to focus on during planning
   */
  focusAreas?: string[];

  /**
   * Type of planning session to guide the approach
   */
  planType?: PlanType;

  /**
   * Maximum duration for the planning session in minutes
   */
  maxDuration?: number;

  /**
   * Whether to include file system exploration in planning
   */
  includeExploration?: boolean;

  /**
   * Specific files or directories to analyze during planning
   */
  analyzeFiles?: string[];
}

/**
 * A finding discovered during planning
 */
export interface PlanningFinding {
  /**
   * Description of the finding
   */
  description: string;

  /**
   * Source of the finding (file, tool, analysis, etc.)
   */
  source: string;

  /**
   * Type of finding
   */
  type: FindingType;

  /**
   * Importance level of this finding
   */
  importance: ImportanceLevel;

  /**
   * Files related to this finding
   */
  relatedFiles?: string[];

  /**
   * Phase in which this finding was discovered
   */
  discoveredInPhase: PlanningPhase;

  /**
   * Additional notes or details
   */
  notes?: string;
}

/**
 * A planning step to be executed
 */
export interface PlanningStep {
  /**
   * Description of the step
   */
  description: string;

  /**
   * Type of step
   */
  type: StepType;

  /**
   * Estimated effort level
   */
  effort: EffortLevel;

  /**
   * Priority level
   */
  priority: ImportanceLevel;

  /**
   * Files that will be affected by this step
   */
  affectedFiles?: string[];

  /**
   * Additional notes or instructions
   */
  notes?: string;

  /**
   * Dependencies on other steps
   */
  dependencies?: string[];
}

/**
 * A planning session
 */
export interface PlanningSession {
  /**
   * Unique session identifier
   */
  id: string;

  /**
   * Planning objective
   */
  objective: string;

  /**
   * Session start time
   */
  startTime: Date;

  /**
   * Session end time
   */
  endTime?: Date;

  /**
   * Current session status
   */
  status: SessionStatus;

  /**
   * Current planning phase
   */
  currentPhase: PlanningPhase;

  /**
   * Plan type
   */
  planType: PlanType;

  /**
   * Focus areas
   */
  focusAreas: string[];

  /**
   * Context information
   */
  context?: string;

  /**
   * Findings discovered during planning
   */
  findings: PlanningFinding[];

  /**
   * Files analyzed during the session
   */
  analyzedFiles: string[];

  /**
   * Next steps identified
   */
  nextSteps: PlanningStep[];

  /**
   * Session metadata
   */
  metadata?: Record<string, any>;
}

/**
 * Validates PlanModeToolParams
 */
export function validatePlanModeToolParams(params: PlanModeToolParams): string | null {
  if (!params.objective || typeof params.objective !== 'string') {
    return 'objective is required and must be a string';
  }

  if (params.objective.length > 500) {
    return 'objective must be 500 characters or less';
  }

  if (params.context && typeof params.context !== 'string') {
    return 'context must be a string';
  }

  if (params.context && params.context.length > 1000) {
    return 'context must be 1000 characters or less';
  }

  if (params.focusAreas && !Array.isArray(params.focusAreas)) {
    return 'focusAreas must be an array';
  }

  if (params.focusAreas && params.focusAreas.some(area => typeof area !== 'string')) {
    return 'all focusAreas must be strings';
  }

  if (params.planType && !Object.values(PlanType).includes(params.planType)) {
    return `planType must be one of: ${Object.values(PlanType).join(', ')}`;
  }

  if (params.maxDuration && (typeof params.maxDuration !== 'number' || params.maxDuration < 1 || params.maxDuration > 240)) {
    return 'maxDuration must be a number between 1 and 240';
  }

  if (params.includeExploration && typeof params.includeExploration !== 'boolean') {
    return 'includeExploration must be a boolean';
  }

  if (params.analyzeFiles && !Array.isArray(params.analyzeFiles)) {
    return 'analyzeFiles must be an array';
  }

  if (params.analyzeFiles && params.analyzeFiles.some(file => typeof file !== 'string')) {
    return 'all analyzeFiles must be strings';
  }

  return null;
}

/**
 * Normalizes PlanModeToolParams with defaults
 */
export function normalizePlanModeToolParams(params: PlanModeToolParams): Required<PlanModeToolParams> {
  return {
    objective: params.objective,
    context: params.context || '',
    focusAreas: params.focusAreas || [],
    planType: params.planType || PlanType.ANALYSIS,
    maxDuration: params.maxDuration || 30,
    includeExploration: params.includeExploration !== false,
    analyzeFiles: params.analyzeFiles || [],
  };
}

/**
 * Creates a new planning session
 */
export function createPlanningSession(
  objective: string,
  planType: PlanType = PlanType.ANALYSIS,
  focusAreas: string[] = [],
  context?: string,
): PlanningSession {
  return {
    id: generateSessionId(),
    objective,
    startTime: new Date(),
    status: SessionStatus.ACTIVE,
    currentPhase: PlanningPhase.UNDERSTANDING,
    planType,
    focusAreas,
    context,
    findings: [],
    analyzedFiles: [],
    nextSteps: [],
    metadata: {},
  };
}

/**
 * Generates a unique session ID
 */
function generateSessionId(): string {
  return `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}