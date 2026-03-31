/**
 * Local state hook for the onboarding wizard.
 *
 * Manages the current step, navigation direction (for animated transitions),
 * and accumulated wizard data that flows between steps.
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WizardData {
  directoriesAdded: number;
  gamesFound: number;
  systemsDetected: string[];
  emulatorsConfigured: number;
  metadataMatched: number;
  metadataTotal: number;
  coverArtFound: number;
  cacheSizeMb: number;
}

export interface OnboardingState {
  step: number;
  direction: 1 | -1;
  wizardData: WizardData;
  goForward: () => void;
  goBack: () => void;
  updateWizardData: (partial: Partial<WizardData>) => void;
  skipAll: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const MAX_STEP = 5;
const MIN_STEP = 0;

const DEFAULT_WIZARD_DATA: WizardData = {
  directoriesAdded: 0,
  gamesFound: 0,
  systemsDetected: [],
  emulatorsConfigured: 0,
  metadataMatched: 0,
  metadataTotal: 0,
  coverArtFound: 0,
  cacheSizeMb: 0,
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useOnboardingState(): OnboardingState {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [wizardData, setWizardData] = useState<WizardData>({ ...DEFAULT_WIZARD_DATA });

  const goForward = useCallback(() => {
    setDirection(1);
    setStep((prev) => Math.min(prev + 1, MAX_STEP));
  }, []);

  const goBack = useCallback(() => {
    setDirection(-1);
    setStep((prev) => Math.max(prev - 1, MIN_STEP));
  }, []);

  const updateWizardData = useCallback((partial: Partial<WizardData>) => {
    setWizardData((prev) => ({ ...prev, ...partial }));
  }, []);

  const markComplete = useCallback(async () => {
    // setOnboardingComplete already persists via setPreference internally
    useAppStore.getState().setOnboardingComplete(true);
    navigate('/', { replace: true });
  }, [navigate]);

  return {
    step,
    direction,
    wizardData,
    goForward,
    goBack,
    updateWizardData,
    skipAll: markComplete,
    completeOnboarding: markComplete,
  };
}
