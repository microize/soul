/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { StartupProgressEvent } from '../types.js';

interface StartupProgressContextType {
  progress: StartupProgressEvent | null;
  isActive: boolean;
  setProgress: (progress: StartupProgressEvent | null) => void;
  setActive: (active: boolean) => void;
  cancel: () => void;
}

const StartupProgressContext = createContext<StartupProgressContextType | undefined>(
  undefined,
);

export const useStartupProgress = (): StartupProgressContextType => {
  const context = useContext(StartupProgressContext);
  if (context === undefined) {
    throw new Error(
      'useStartupProgress must be used within a StartupProgressProvider',
    );
  }
  return context;
};

interface StartupProgressProviderProps {
  children: ReactNode;
  onCancel?: () => void;
}

export const StartupProgressProvider: React.FC<StartupProgressProviderProps> = ({
  children,
  onCancel,
}) => {
  const [progress, setProgress] = useState<StartupProgressEvent | null>(null);
  const [isActive, setIsActive] = useState(false);

  const setActive = (active: boolean) => {
    setIsActive(active);
    if (!active) {
      setProgress(null);
    }
  };

  const cancel = () => {
    setActive(false);
    setProgress(null);
    onCancel?.();
  };

  const value: StartupProgressContextType = {
    progress,
    isActive,
    setProgress,
    setActive,
    cancel,
  };

  return (
    <StartupProgressContext.Provider value={value}>
      {children}
    </StartupProgressContext.Provider>
  );
};