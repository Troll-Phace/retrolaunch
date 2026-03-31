/**
 * Bottom navigation bar for the onboarding wizard.
 *
 * Renders Back / Skip / Forward actions with contextual labels per step.
 */

import { Button } from '@/components/Button';

interface WizardNavProps {
  step: number;
  onBack: () => void;
  onForward: () => void;
  onSkip: () => void;
  canContinue?: boolean;
}

export function WizardNav({
  step,
  onBack,
  onForward,
  onSkip,
  canContinue = true,
}: WizardNavProps) {
  const isFirstStep = step === 0;
  const isLastStep = step === 5;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-void border-t border-ghost z-40">
      <div className="flex justify-between items-center max-w-3xl mx-auto py-4 px-8">
        {/* Left: Back button */}
        <div className="w-28">
          {!isFirstStep && (
            <Button variant="ghost" size="md" onClick={onBack}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 mr-1.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </Button>
          )}
        </div>

        {/* Center: Skip link */}
        <div className="flex-1 text-center">
          {!isLastStep && (
            <button
              type="button"
              onClick={onSkip}
              className="text-sm text-text-dim hover:text-text-secondary cursor-pointer transition-colors duration-200"
            >
              Skip setup
            </button>
          )}
        </div>

        {/* Right: Forward button */}
        <div className="w-44 flex justify-end">
          {isFirstStep && (
            <Button variant="primary" size="md" onClick={onForward} disabled={!canContinue}>
              Get Started
            </Button>
          )}
          {!isFirstStep && !isLastStep && (
            <Button variant="primary" size="md" onClick={onForward} disabled={!canContinue}>
              Continue
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 ml-1.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Button>
          )}
          {isLastStep && (
            <Button variant="primary" size="lg" onClick={onForward}>
              Launch RetroLaunch
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
