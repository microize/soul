/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';
import type { 
  StartupProgressEvent, 
  StartupProgressCallback 
} from '@google/gemini-cli-core';
import { useStartupProgress } from '../contexts/StartupProgressContext.js';

/**
 * Hook to integrate core startup progress with UI components
 */
export const useStartupProgressIntegration = () => {
  const { setProgress, setActive, isActive } = useStartupProgress();
  const [isStartupComplete, setIsStartupComplete] = useState(false);

  /**
   * Progress callback that can be passed to the core Config
   */
  const progressCallback: StartupProgressCallback = useCallback((event: StartupProgressEvent) => {
    setProgress(event);
    
    // Mark startup as complete when we reach 100%
    if (event.percentage >= 100 && event.message.includes('complete')) {
      setIsStartupComplete(true);
      setTimeout(() => {
        setActive(false);
      }, 1000); // Show completion for 1 second
    }
  }, [setProgress, setActive]);

  /**
   * Start startup progress tracking
   */
  const startStartupProgress = useCallback(() => {
    setIsStartupComplete(false);
    setActive(true);
  }, [setActive]);

  /**
   * Stop startup progress tracking
   */
  const stopStartupProgress = useCallback(() => {
    setActive(false);
    setProgress(null);
  }, [setActive, setProgress]);

  return {
    progressCallback,
    startStartupProgress,
    stopStartupProgress,
    isActive,
    isStartupComplete,
  };
};