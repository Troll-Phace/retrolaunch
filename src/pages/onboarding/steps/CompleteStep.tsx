/**
 * Setup Complete step (step 5) of the onboarding wizard.
 *
 * Shows a celebration screen with summary stats from the wizard data,
 * a checkmark animation, and quick tips. The "Launch RetroLaunch" button
 * is handled by WizardNav, not this component.
 */

import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

import type { WizardData } from '../hooks/useOnboardingState';
import {
  staggerContainer,
  bounceStaggerItem,
  reducedBounceStaggerItem,
} from '../animations';

// ---------------------------------------------------------------------------
// Glow orb (same pattern as WelcomeStep)
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

// ---------------------------------------------------------------------------
// Summary stat card
// ---------------------------------------------------------------------------

interface StatCardProps {
  value: string;
  label: string;
  colorClass: string;
}

function StatCard({ value, label, colorClass }: StatCardProps) {
  return (
    <div className="w-32 rounded-lg border border-ghost bg-surface p-4 text-center">
      <span className={`text-2xl font-bold font-mono ${colorClass}`}>
        {value}
      </span>
      <p className="text-xs text-text-secondary mt-1">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick tips
// ---------------------------------------------------------------------------

const TIPS = [
  'Drop ROM files onto the app to add them instantly',
  'Right-click any game for quick actions like launching or viewing details',
  'Visit Settings anytime to reconfigure emulators, manage directories, or change your theme',
];

// ---------------------------------------------------------------------------
// Confetti burst effect
// ---------------------------------------------------------------------------

// Confetti colors use CSS custom properties so they adapt to the active theme.
// var() references work in inline `backgroundColor` because the browser
// resolves them at paint time.
const CONFETTI_COLORS = [
  'var(--accent)',
  'var(--success)',
  'var(--accent-light)',
  'var(--warning)',
];

interface ConfettiDot {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
  delay: number;
}

function ConfettiBurst() {
  const dots = useMemo<ConfettiDot[]>(() => {
    return Array.from({ length: 14 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / 14 + (Math.random() - 0.5) * 0.6;
      const distance = 60 + Math.random() * 80;
      return {
        id: i,
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance - 20, // slight upward bias
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
        size: Math.random() > 0.5 ? 8 : 6,
        delay: Math.random() * 0.15,
      };
    });
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none z-20" aria-hidden="true">
      <div className="absolute top-1/2 left-1/2">
        {dots.map((dot) => (
          <motion.div
            key={dot.id}
            className="absolute rounded-full"
            style={{
              width: dot.size,
              height: dot.size,
              backgroundColor: dot.color,
              top: -dot.size / 2,
              left: -dot.size / 2,
            }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: dot.x, y: dot.y, opacity: 0, scale: 0.4 }}
            transition={{
              duration: 1.5,
              delay: 0.4 + dot.delay,
              ease: 'easeOut',
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface CompleteStepProps {
  wizardData: WizardData;
}

export function CompleteStep({ wizardData }: CompleteStepProps) {
  const shouldReduceMotion = useReducedMotion();
  const itemVariant = shouldReduceMotion ? reducedBounceStaggerItem : bounceStaggerItem;

  // Build stat cards from wizard data
  const stats: StatCardProps[] = [
    {
      value: String(wizardData.gamesFound),
      label: 'games found',
      colorClass: 'text-success',
    },
    {
      value: String(wizardData.systemsDetected.length),
      label: 'systems',
      colorClass: 'text-accent',
    },
    {
      value: String(wizardData.emulatorsConfigured),
      label: 'configured',
      colorClass: 'text-accent',
    },
    {
      value:
        wizardData.metadataTotal > 0
          ? `${Math.round((wizardData.metadataMatched / wizardData.metadataTotal) * 100)}%`
          : 'N/A',
      label: 'matched',
      colorClass: 'text-purple-400',
    },
    {
      value: String(wizardData.cacheSizeMb),
      label: 'MB cached',
      colorClass: 'text-text-secondary',
    },
  ];

  return (
    <div className="relative flex flex-col items-center text-center py-8">
      {/* Celebration glow orbs */}
      <GlowOrb
        className="w-80 h-80 -top-24 -left-36 bg-success/10"
        animateProps={
          shouldReduceMotion
            ? undefined
            : { x: [0, 15, 0], y: [0, -10, 0] }
        }
        duration={22}
      />
      <GlowOrb
        className="w-96 h-96 -top-16 -right-44 bg-accent/10"
        animateProps={
          shouldReduceMotion
            ? undefined
            : { x: [0, -12, 0], y: [0, 18, 0] }
        }
        duration={26}
      />
      <GlowOrb
        className="w-64 h-64 top-56 left-1/2 -translate-x-1/2 bg-success/[0.05]"
        animateProps={
          shouldReduceMotion
            ? undefined
            : { x: [0, 8, 0], y: [0, -8, 0] }
        }
        duration={19}
      />

      {/* Confetti burst */}
      {!shouldReduceMotion && <ConfettiBurst />}

      {/* Checkmark circle with separate green glow */}
      <div className="relative z-10">
        {/* Green glow shadow layer */}
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ boxShadow: '0 0 40px color-mix(in srgb, var(--success) 30%, transparent)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={
            shouldReduceMotion
              ? { duration: 0.15 }
              : { duration: 0.5, delay: 0.5 }
          }
          aria-hidden="true"
        />
        <motion.div
          className="w-24 h-24 rounded-full border-2 border-success bg-success/10 flex items-center justify-center"
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0 }}
          animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
          transition={
            shouldReduceMotion
              ? { duration: 0.15 }
              : { type: 'spring', stiffness: 200, damping: 15, delay: 0.3 }
          }
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-12 h-12 text-success"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </motion.div>
      </div>

      {/* Heading */}
      <motion.h2
        className="relative z-10 text-[38px] font-extrabold text-text-primary mt-8"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={
          shouldReduceMotion
            ? { duration: 0.15 }
            : { duration: 0.4, delay: 0.2 }
        }
      >
        You're All Set!
      </motion.h2>

      {/* Subtitle */}
      <motion.p
        className="relative z-10 text-base text-text-secondary mt-3 max-w-md"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={
          shouldReduceMotion
            ? { duration: 0.15 }
            : { duration: 0.4, delay: 0.3 }
        }
      >
        Your library is ready to explore. Here's a summary of your setup.
      </motion.p>

      {/* Summary stats */}
      <motion.div
        className="relative z-10 flex gap-4 justify-center flex-wrap mt-10"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        {stats.map((stat) => (
          <motion.div key={stat.label} variants={itemVariant}>
            <StatCard
              value={stat.value}
              label={stat.label}
              colorClass={stat.colorClass}
            />
          </motion.div>
        ))}
      </motion.div>

      {/* Quick tips */}
      <motion.div
        className="relative z-10 mt-8 max-w-lg mx-auto rounded-lg border border-ghost bg-surface p-5 text-left"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={
          shouldReduceMotion
            ? { duration: 0.15 }
            : { duration: 0.4, delay: 0.6 }
        }
      >
        <h3 className="text-xs font-semibold uppercase tracking-widest text-text-secondary mb-3">
          Quick Tips
        </h3>
        <ul className="space-y-2">
          {TIPS.map((tip) => (
            <li key={tip} className="flex">
              <span
                className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 mr-3 flex-shrink-0"
                aria-hidden="true"
              />
              <span className="text-sm text-text-secondary">{tip}</span>
            </li>
          ))}
        </ul>
      </motion.div>
    </div>
  );
}
