/**
 * Shared Framer Motion variants for onboarding step transitions.
 *
 * Use with AnimatePresence custom={direction} where direction is 1 (forward) or -1 (backward).
 */

// ---------------------------------------------------------------------------
// Directional step transitions
// ---------------------------------------------------------------------------

export const stepVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 80 : -80,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -80 : 80,
    opacity: 0,
  }),
};

export const stepTransition = {
  x: { type: 'spring' as const, stiffness: 350, damping: 30 },
  opacity: { duration: 0.2 },
};

// ---------------------------------------------------------------------------
// Reduced motion fallbacks
// ---------------------------------------------------------------------------

export const reducedStepVariants = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: { opacity: 0 },
};

export const reducedStepTransition = { duration: 0.15 };

// ---------------------------------------------------------------------------
// Stagger container for lists
// ---------------------------------------------------------------------------

export const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

export const staggerItem = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
};

export const reducedStaggerItem = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.15 } },
};

// ---------------------------------------------------------------------------
// Stagger container with faster interval (for large lists)
// ---------------------------------------------------------------------------

export const fastStaggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.03 } },
};

// ---------------------------------------------------------------------------
// Spring pop variant (for badges, small elements)
// ---------------------------------------------------------------------------

export const springPopItem = {
  hidden: { opacity: 0, scale: 0.8 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 400, damping: 20 },
  },
};

export const reducedSpringPopItem = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.15 } },
};

// ---------------------------------------------------------------------------
// Bounce stagger item (slight overshoot for celebration)
// ---------------------------------------------------------------------------

export const bounceStaggerItem = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 350, damping: 22 },
  },
};

export const reducedBounceStaggerItem = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.15 } },
};
