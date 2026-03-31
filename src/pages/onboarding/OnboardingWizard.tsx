/**
 * Main onboarding wizard component.
 *
 * Renders a 6-step wizard with animated step transitions, a dot indicator,
 * and bottom navigation.
 */

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  stepVariants,
  stepTransition,
  reducedStepVariants,
  reducedStepTransition,
} from './animations';
import { useOnboardingState } from './hooks/useOnboardingState';
import { StepIndicator } from './StepIndicator';
import { WizardNav } from './WizardNav';
import { WelcomeStep } from './steps/WelcomeStep';
import { RomDirectoriesStep } from './steps/RomDirectoriesStep';
import { EmulatorConfigStep } from './steps/EmulatorConfigStep';
import { MetadataFetchStep } from './steps/MetadataFetchStep';
import { PreferencesStep } from './steps/PreferencesStep';
import { CompleteStep } from './steps/CompleteStep';

// ---------------------------------------------------------------------------
// Wizard
// ---------------------------------------------------------------------------

export function OnboardingWizard() {
  const shouldReduceMotion = useReducedMotion();
  const {
    step,
    direction,
    wizardData,
    updateWizardData,
    goForward,
    goBack,
    skipAll,
    completeOnboarding,
  } = useOnboardingState();

  const variants = shouldReduceMotion ? reducedStepVariants : stepVariants;
  const transition = shouldReduceMotion ? reducedStepTransition : stepTransition;

  const handleForward = () => {
    if (step === 5) {
      void completeOnboarding();
    } else {
      goForward();
    }
  };

  const handleSkip = () => {
    void skipAll();
  };

  return (
    <div className="min-h-screen bg-void flex flex-col">
      {/* Step indicator */}
      <div className="pt-8">
        <StepIndicator currentStep={step} />
      </div>

      {/* Step content */}
      <div className="flex-1 flex items-center justify-center overflow-hidden pb-24">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={transition}
            className="w-full max-w-4xl mx-auto px-8"
          >
            {step === 0 && <WelcomeStep />}
            {step === 1 && (
              <RomDirectoriesStep
                wizardData={wizardData}
                updateWizardData={updateWizardData}
              />
            )}
            {step === 2 && (
              <EmulatorConfigStep
                wizardData={wizardData}
                updateWizardData={updateWizardData}
              />
            )}
            {step === 3 && (
              <MetadataFetchStep
                wizardData={wizardData}
                updateWizardData={updateWizardData}
              />
            )}
            {step === 4 && <PreferencesStep />}
            {step === 5 && <CompleteStep wizardData={wizardData} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom navigation */}
      <WizardNav
        step={step}
        onBack={goBack}
        onForward={handleForward}
        onSkip={handleSkip}
      />
    </div>
  );
}
