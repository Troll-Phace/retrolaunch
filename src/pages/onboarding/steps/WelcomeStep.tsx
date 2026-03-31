/**
 * Welcome step (step 0) of the onboarding wizard.
 *
 * Shows branding, subtitle, and three feature highlight cards with
 * ambient glow orbs in the background.
 */

import { motion, useReducedMotion } from 'framer-motion';
import {
  staggerContainer,
  staggerItem,
  reducedStaggerItem,
} from '../animations';

// ---------------------------------------------------------------------------
// Feature card data
// ---------------------------------------------------------------------------

interface FeatureCard {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const FEATURES: FeatureCard[] = [
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    ),
    title: 'Auto-Scan ROMs',
    description: "Point to your ROM folders and we'll identify every game automatically",
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: 'One-Click Launch',
    description: 'Configure emulators once, then launch any game instantly',
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    title: 'Rich Metadata',
    description: 'Cover art, screenshots, and details from IGDB & ScreenScraper',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WelcomeStep() {
  const shouldReduceMotion = useReducedMotion();
  const itemVariant = shouldReduceMotion ? reducedStaggerItem : staggerItem;

  return (
    <div className="relative flex flex-col items-center text-center py-8">
      {/* Ambient glow orbs */}
      <GlowOrb
        className="w-72 h-72 -top-20 -left-32 bg-accent/10"
        animateProps={
          shouldReduceMotion
            ? undefined
            : { x: [0, 20, 0], y: [0, -15, 0] }
        }
        duration={20}
      />
      <GlowOrb
        className="w-96 h-96 -top-10 -right-40 bg-accent/[0.07]"
        animateProps={
          shouldReduceMotion
            ? undefined
            : { x: [0, -15, 0], y: [0, 20, 0] }
        }
        duration={25}
      />
      <GlowOrb
        className="w-64 h-64 top-48 left-1/2 -translate-x-1/2 bg-accent/[0.05]"
        animateProps={
          shouldReduceMotion
            ? undefined
            : { x: [0, 10, 0], y: [0, -10, 0] }
        }
        duration={18}
      />

      {/* Branding */}
      <motion.div
        className="relative z-10"
        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
        animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
        transition={
          shouldReduceMotion
            ? { duration: 0.15 }
            : { duration: 0.5, ease: 'easeOut' }
        }
      >
        <h1 className="font-extrabold text-[42px] text-text-primary leading-tight tracking-[-0.5px]">
          RETROLAUNCH
        </h1>
        <p className="text-accent text-xs font-semibold tracking-[3px] uppercase">
          GAME LIBRARY
        </p>
      </motion.div>

      {/* Subtitle */}
      <motion.p
        className="relative z-10 text-lg text-text-secondary mt-4 max-w-md"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={
          shouldReduceMotion
            ? { duration: 0.15 }
            : { duration: 0.4, delay: 0.15, ease: 'easeOut' }
        }
      >
        Your entire retro game library, beautifully organized.
      </motion.p>

      {/* Feature cards */}
      <motion.div
        className="relative z-10 flex gap-6 justify-center mt-12"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        {FEATURES.map((feature) => (
          <motion.div
            key={feature.title}
            variants={itemVariant}
            className="w-56 rounded-lg border border-ghost bg-surface p-6 text-left"
          >
            <div className="text-accent mb-3">{feature.icon}</div>
            <h3 className="text-sm font-semibold text-text-primary">{feature.title}</h3>
            <p className="text-xs text-text-secondary mt-1.5">{feature.description}</p>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ambient glow orb helper
// ---------------------------------------------------------------------------

interface GlowOrbProps {
  className: string;
  animateProps?: { x: number[]; y: number[] };
  duration: number;
}

function GlowOrb({ className, animateProps, duration }: GlowOrbProps) {
  return (
    <motion.div
      className={`absolute rounded-full blur-[80px] pointer-events-none ${className}`}
      animate={animateProps}
      transition={
        animateProps
          ? { duration, repeat: Infinity, ease: 'easeInOut' }
          : undefined
      }
      aria-hidden="true"
    />
  );
}
