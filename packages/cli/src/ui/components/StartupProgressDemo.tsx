/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box } from 'ink';
import { StartupProgressSpinner } from './StartupProgressSpinner.js';
import { useStartupProgress } from '../contexts/StartupProgressContext.js';

/**
 * Demo component showing how startup progress integrates with the UI
 * This would be used in the main CLI app component
 */
export const StartupProgressDemo: React.FC = () => {
  const { progress, isActive, cancel } = useStartupProgress();

  if (!isActive) {
    return null;
  }

  return (
    <Box flexDirection="column" padding={1}>
      <StartupProgressSpinner
        progress={progress || undefined}
        onCancel={cancel}
        showDetails={true}
        enableCancel={true}
      />
    </Box>
  );
};

/*
 * Example of how to integrate with the CLI application:
 * 
 * const App: React.FC = () => {
 *   const { progressCallback, startStartupProgress } = useStartupProgressIntegration();
 *   
 *   useEffect(() => {
 *     const initializeApp = async () => {
 *       startStartupProgress();
 *       
 *       const config = new Config({
 *         // ... other config options
 *         startupProgressCallback: progressCallback,
 *       });
 *       
 *       await config.initialize();
 *       // App is now ready
 *     };
 *     
 *     initializeApp();
 *   }, []);
 *   
 *   return (
 *     <StartupProgressProvider>
 *       <StartupProgressDemo />
 *       Other app components
 *     </StartupProgressProvider>
 *   );
 * };
 */