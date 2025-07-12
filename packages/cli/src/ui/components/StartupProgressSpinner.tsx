/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import type { SpinnerName } from 'cli-spinners';
import { Colors } from '../colors.js';

import type { StartupProgressEvent } from '../types.js';

interface StartupProgressSpinnerProps {
  /** Current progress event */
  progress?: StartupProgressEvent;
  /** Called when user cancels startup */
  onCancel?: () => void;
  /** Spinner type */
  spinnerType?: SpinnerName;
  /** Whether to show detailed progress */
  showDetails?: boolean;
  /** Whether cancellation is enabled */
  enableCancel?: boolean;
}

export const StartupProgressSpinner: React.FC<StartupProgressSpinnerProps> = ({
  progress,
  onCancel,
  spinnerType = 'dots',
  showDetails = true,
  enableCancel = true,
}) => {
  const [cancelled, setCancelled] = useState(false);

  useInput((input, key) => {
    if (enableCancel && (key.escape || input === 'q')) {
      setCancelled(true);
      onCancel?.();
    }
  });

  if (cancelled) {
    return (
      <Box
        borderStyle="round"
        borderColor={Colors.AccentRed}
        flexDirection="column"
        padding={1}
        width="100%"
      >
        <Text color={Colors.AccentRed}>
          Startup cancelled by user.
        </Text>
      </Box>
    );
  }

  if (!progress) {
    return (
      <Box flexDirection="row" alignItems="center">
        <Text>
          <Spinner type={spinnerType} /> Initializing Soul CLI...
        </Text>
      </Box>
    );
  }

  const formatEstimatedTime = (milliseconds: number): string => {
    if (milliseconds < 1000) {
      return 'few seconds';
    }
    
    const seconds = Math.ceil(milliseconds / 1000);
    if (seconds < 60) {
      return `${seconds}s remaining`;
    }
    
    const minutes = Math.ceil(seconds / 60);
    if (minutes === 1) {
      return 'about 1 minute remaining';
    }
    return `about ${minutes} minutes remaining`;
  };

  const getProgressBar = (percentage: number, width: number = 20): string => {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  };

  const getPhaseIcon = (phase: string): string => {
    const icons: Record<string, string> = {
      initializing: '🚀',
      scanning: '🔍',
      context: '📁',
      tools: '🔧',
      memory: '🧠',
      caching: '💾',
      finalizing: '✨',
    };
    return icons[phase] || '⚙️';
  };


  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Box flexDirection="row" alignItems="center" marginBottom={showDetails ? 1 : 0}>
        <Text>
          <Spinner type={spinnerType} />
        </Text>
        <Text>
          {' '}{getPhaseIcon(progress.phase)} {progress.message}
        </Text>
      </Box>

      {showDetails && (
        <>
          <Box marginBottom={1}>
            <Text color={Colors.Gray}>
              Progress: {getProgressBar(progress.percentage)} {progress.percentage}%
            </Text>
          </Box>

          {progress.filesProcessed !== undefined && progress.totalFiles !== undefined && (
            <Box marginBottom={1}>
              <Text color={Colors.Gray}>
                Files: {progress.filesProcessed}/{progress.totalFiles}
              </Text>
            </Box>
          )}

          {progress.estimatedTimeRemaining !== undefined && progress.estimatedTimeRemaining > 0 && (
            <Box marginBottom={1}>
              <Text color={Colors.Gray}>
                ETA: ~{formatEstimatedTime(progress.estimatedTimeRemaining)}
                {progress.estimatedTimeRemaining > 30000 && (
                  <Text color={Colors.AccentYellow}>
                    {' '}(Large project detected)
                  </Text>
                )}
              </Text>
            </Box>
          )}

          {enableCancel && (
            <Box>
              <Text color={Colors.Gray} dimColor>
                Press ESC or &apos;q&apos; to cancel
              </Text>
            </Box>
          )}
        </>
      )}
    </Box>
  );
};

/**
 * Simple version for minimal progress display
 */
export const SimpleStartupProgressSpinner: React.FC<{
  progress?: StartupProgressEvent;
  spinnerType?: SpinnerName;
}> = ({ progress, spinnerType = 'dots' }) => (
  <StartupProgressSpinner
    progress={progress}
    spinnerType={spinnerType}
    showDetails={false}
    enableCancel={false}
  />
);