import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/Button";

export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  variant?: "page" | "inline";
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  variant = "page",
  className = "",
}: EmptyStateProps) {
  const shouldReduceMotion = useReducedMotion();

  const isInline = variant === "inline";

  const motionProps = shouldReduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.3, ease: "easeOut" as const },
      };

  return (
    <motion.div
      {...motionProps}
      className={`flex flex-col items-center text-center ${
        isInline ? "gap-2 py-6" : "justify-center gap-3 py-24"
      } ${className}`}
    >
      <div className={`text-text-dim ${isInline ? "size-8" : "size-12"}`}>
        {icon}
      </div>

      <h3
        className={`font-semibold text-text-primary ${
          isInline ? "text-sm" : "text-lg"
        }`}
      >
        {title}
      </h3>

      <p
        className={`text-text-dim max-w-md ${
          isInline ? "text-xs" : "text-sm"
        }`}
      >
        {description}
      </p>

      {(actionLabel || secondaryActionLabel) && (
        <div className={`flex gap-3 ${isInline ? "mt-2" : "mt-4"}`}>
          {actionLabel && onAction && (
            <Button
              variant="primary"
              size={isInline ? "sm" : "md"}
              onClick={onAction}
            >
              {actionLabel}
            </Button>
          )}
          {secondaryActionLabel && onSecondaryAction && (
            <Button
              variant="secondary"
              size={isInline ? "sm" : "md"}
              onClick={onSecondaryAction}
            >
              {secondaryActionLabel}
            </Button>
          )}
        </div>
      )}
    </motion.div>
  );
}
