/**
 * ErrorState — reusable error display component.
 *
 * Two variants:
 *  - `fullPage`: centered in container, large icon, prominent text
 *  - `inline`: compact horizontal layout for embedding within a section
 *
 * Follows the same structural pattern as EmptyState but with error-specific
 * styling (red accent on the icon container).
 */

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/Button";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ErrorStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  onRetry?: () => void;
  variant?: "inline" | "fullPage";
  className?: string;
}

// ---------------------------------------------------------------------------
// Default icon — warning triangle
// ---------------------------------------------------------------------------

function WarningTriangleIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="12"
        y1="9"
        x2="12"
        y2="13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="12"
        y1="17"
        x2="12.01"
        y2="17"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ErrorState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  onRetry,
  variant = "fullPage",
  className = "",
}: ErrorStateProps) {
  const shouldReduceMotion = useReducedMotion();
  const isInline = variant === "inline";

  const motionProps = shouldReduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.3, ease: "easeOut" as const },
      };

  const iconSize = isInline ? 20 : 32;

  return (
    <motion.div
      {...motionProps}
      className={`flex ${
        isInline
          ? "flex-row items-center gap-4 rounded-lg border border-red-400/20 bg-red-400/5 px-4 py-3"
          : "flex-col items-center justify-center gap-3 py-24 text-center"
      } ${className}`}
      role="alert"
    >
      {/* Icon */}
      <div
        className={`text-red-400 ${
          isInline ? "shrink-0" : ""
        } ${isInline ? "size-8" : "size-12"} flex items-center justify-center`}
      >
        {icon ?? <WarningTriangleIcon size={iconSize} />}
      </div>

      {/* Text content */}
      <div className={isInline ? "flex-1 min-w-0" : ""}>
        <h3
          className={`font-semibold text-text-primary ${
            isInline ? "text-sm" : "text-lg"
          }`}
        >
          {title}
        </h3>
        <p
          className={`text-text-dim ${
            isInline ? "text-xs mt-0.5" : "text-sm mt-1 max-w-md"
          }`}
        >
          {description}
        </p>
      </div>

      {/* Action buttons */}
      {(actionLabel || onRetry) && (
        <div
          className={`flex gap-3 ${
            isInline ? "shrink-0" : "mt-4"
          }`}
        >
          {actionLabel && onAction && (
            <Button
              variant="primary"
              size={isInline ? "sm" : "md"}
              onClick={onAction}
            >
              {actionLabel}
            </Button>
          )}
          {onRetry && (
            <Button
              variant="secondary"
              size={isInline ? "sm" : "md"}
              onClick={onRetry}
            >
              Retry
            </Button>
          )}
        </div>
      )}
    </motion.div>
  );
}
