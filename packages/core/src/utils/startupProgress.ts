/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Startup progress phase types
 */
export enum StartupPhase {
  INITIALIZING = 'initializing',
  SCANNING_PROJECT = 'scanning',
  LOADING_CONTEXT = 'context', 
  INITIALIZING_TOOLS = 'tools',
  LOADING_MEMORY = 'memory',
  SETTING_UP_CACHE = 'caching',
  FINALIZING = 'finalizing',
}

/**
 * Progress event interface
 */
export interface StartupProgressEvent {
  phase: StartupPhase;
  message: string;
  percentage: number;
  filesProcessed?: number;
  totalFiles?: number;
  estimatedTimeRemaining?: number;
}

/**
 * Progress callback type
 */
export type StartupProgressCallback = (event: StartupProgressEvent) => void;

/**
 * Manages startup progress tracking and communication
 */
export class StartupProgressManager {
  private callback?: StartupProgressCallback;
  private currentPhase: StartupPhase = StartupPhase.INITIALIZING;
  private startTime: number = Date.now();
  private phaseStartTime: number = Date.now();
  private totalPhases: number = 7;
  private completedPhases: number = 0;

  constructor(callback?: StartupProgressCallback) {
    this.callback = callback;
  }

  /**
   * Sets the progress callback
   */
  setCallback(callback: StartupProgressCallback): void {
    this.callback = callback;
  }

  /**
   * Updates progress for current phase
   */
  updateProgress(
    message: string,
    phaseProgress: number,
    options: {
      filesProcessed?: number;
      totalFiles?: number;
    } = {}
  ): void {
    if (!this.callback) return;

    // Calculate overall percentage (completed phases + current phase progress)
    const overallProgress = Math.min(
      Math.round(
        ((this.completedPhases + phaseProgress / 100) / this.totalPhases) * 100
      ),
      100
    );

    // Estimate time remaining based on current progress
    const elapsed = Date.now() - this.startTime;
    const estimatedTotal = overallProgress > 0 ? (elapsed / overallProgress) * 100 : 0;
    const estimatedTimeRemaining = Math.max(0, estimatedTotal - elapsed);

    this.callback({
      phase: this.currentPhase,
      message,
      percentage: overallProgress,
      filesProcessed: options.filesProcessed,
      totalFiles: options.totalFiles,
      estimatedTimeRemaining,
    });
  }

  /**
   * Starts a new phase
   */
  startPhase(phase: StartupPhase, message: string): void {
    this.currentPhase = phase;
    this.phaseStartTime = Date.now();
    this.updateProgress(message, 0);
  }

  /**
   * Completes the current phase
   */
  completePhase(message: string): void {
    this.updateProgress(message, 100);
    this.completedPhases++;
  }

  /**
   * Completes the entire startup process
   */
  complete(): void {
    if (!this.callback) return;

    this.callback({
      phase: StartupPhase.FINALIZING,
      message: 'Startup complete',
      percentage: 100,
    });
  }

  /**
   * Gets phase-specific messages
   */
  static getPhaseMessage(phase: StartupPhase, subMessage?: string): string {
    const baseMessages = {
      [StartupPhase.INITIALIZING]: 'Initializing Soul CLI',
      [StartupPhase.SCANNING_PROJECT]: 'Scanning project structure',
      [StartupPhase.LOADING_CONTEXT]: 'Loading project context',
      [StartupPhase.INITIALIZING_TOOLS]: 'Initializing development tools',
      [StartupPhase.LOADING_MEMORY]: 'Loading project memory',
      [StartupPhase.SETTING_UP_CACHE]: 'Setting up caching system',
      [StartupPhase.FINALIZING]: 'Finalizing setup',
    };

    const baseMessage = baseMessages[phase];
    return subMessage ? `${baseMessage}: ${subMessage}` : baseMessage;
  }

  /**
   * Calculates estimated time display string
   */
  static formatEstimatedTime(milliseconds: number): string {
    if (milliseconds < 1000) {
      return 'few seconds';
    }
    
    const seconds = Math.ceil(milliseconds / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    }
    
    const minutes = Math.ceil(seconds / 60);
    return `${minutes}m`;
  }

  /**
   * Creates a no-op progress manager for cases where progress tracking is disabled
   */
  static createSilent(): StartupProgressManager {
    return new StartupProgressManager();
  }
}