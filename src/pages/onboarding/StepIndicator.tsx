/**
 * 6-dot step progress indicator for the onboarding wizard.
 *
 * Active dot is larger with an animated ring indicator (layoutId).
 * Past dots show at reduced opacity, future dots use ghost color.
 */

import { motion, useReducedMotion } from 'framer-motion';

interface StepIndicatorProps {
  currentStep: number;
  totalSteps?: number;
}

export function StepIndicator({ currentStep, totalSteps = 6 }: StepIndicatorProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Dot row */}
      <div className="flex items-center gap-3">
        {Array.from({ length: totalSteps }, (_, i) => {
          const isActive = i === currentStep;
          const isPast = i < currentStep;

          return (
            <div key={i} className="relative flex items-center justify-center">
              {/* Animated ring on active dot */}
              {isActive && (
                <motion.div
                  layoutId="step-indicator"
                  className="absolute w-5 h-5 rounded-full border-2 border-accent"
                  transition={
                    shouldReduceMotion
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 400, damping: 28 }
                  }
                />
              )}

              {/* Dot */}
              <div
                className={[
                  'rounded-full transition-all duration-200',
                  isActive
                    ? 'w-3 h-3 bg-accent'
                    : isPast
                      ? 'w-2 h-2 bg-accent/50'
                      : 'w-2 h-2 bg-[var(--border)]',
                ].join(' ')}
              />
            </div>
          );
        })}
      </div>

      {/* Step label */}
      <span className="text-xs text-text-dim">
        Step {currentStep + 1} of {totalSteps}
      </span>
    </div>
  );
}
