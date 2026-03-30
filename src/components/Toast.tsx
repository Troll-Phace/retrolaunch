/**
 * Toast notification system.
 *
 * Provides `ToastContainer` (rendered once in AppShell) and individual
 * `ToastItem` components. Toast state is managed in the Zustand store —
 * call `useAppStore.getState().addToast(...)` from anywhere to show one.
 */

import { useEffect, useCallback } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useAppStore } from '@/store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  duration?: number;
}

// ---------------------------------------------------------------------------
// Icons (inline SVG — no icon library)
// ---------------------------------------------------------------------------

const ICON_SIZE = 20;

function SuccessIcon() {
  return (
    <svg
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="var(--success)" strokeWidth="2" />
      <path
        d="M8 12l3 3 5-5"
        stroke="var(--success)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="var(--error)" strokeWidth="2" />
      <path
        d="M15 9l-6 6M9 9l6 6"
        stroke="var(--error)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="var(--accent)" strokeWidth="2" />
      <path
        d="M12 16v-4M12 8h.01"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M18 6L6 18M6 6l12 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ICON_MAP: Record<Toast['type'], React.FC> = {
  success: SuccessIcon,
  error: ErrorIcon,
  info: InfoIcon,
};

/** CSS custom property name for the left-border accent per toast type. */
const BORDER_COLOR_MAP: Record<Toast['type'], string> = {
  success: 'var(--success)',
  error: 'var(--error)',
  info: 'var(--accent)',
};

const DEFAULT_DURATION = 4000;

// ---------------------------------------------------------------------------
// ToastItem
// ---------------------------------------------------------------------------

interface ToastItemProps {
  toast: Toast;
}

export function ToastItem({ toast }: ToastItemProps) {
  const removeToast = useAppStore((s) => s.removeToast);
  const shouldReduceMotion = useReducedMotion();

  const handleClose = useCallback(() => {
    removeToast(toast.id);
  }, [removeToast, toast.id]);

  // Auto-dismiss
  useEffect(() => {
    const ms = toast.duration ?? DEFAULT_DURATION;
    const timer = window.setTimeout(handleClose, ms);
    return () => window.clearTimeout(timer);
  }, [toast.duration, handleClose]);

  const Icon = ICON_MAP[toast.type];

  return (
    <motion.div
      layout
      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 80 }}
      animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 80 }}
      transition={
        shouldReduceMotion
          ? { duration: 0 }
          : { duration: 0.2, ease: 'easeOut' }
      }
      role="alert"
      className="pointer-events-auto flex items-start gap-3 rounded-lg border border-ghost bg-surface px-4 py-3 shadow-lg"
      style={{ borderLeftWidth: 3, borderLeftColor: BORDER_COLOR_MAP[toast.type] }}
    >
      <span className="mt-0.5 shrink-0">
        <Icon />
      </span>

      <p className="flex-1 text-[13px] leading-snug text-text-primary">
        {toast.message}
      </p>

      <button
        type="button"
        onClick={handleClose}
        className="shrink-0 rounded-sm p-0.5 text-text-secondary transition-colors hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-label="Dismiss notification"
      >
        <CloseIcon />
      </button>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// ToastContainer
// ---------------------------------------------------------------------------

export function ToastContainer() {
  const toasts = useAppStore((s) => s.toasts);

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed bottom-6 right-6 z-50 flex w-80 flex-col gap-2"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}
