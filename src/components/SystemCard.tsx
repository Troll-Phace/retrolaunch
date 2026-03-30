import { type CSSProperties, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { System } from "@/types";

export interface SystemCardProps {
  system: System;
  gameCount: number;
  onClick?: (system: System) => void;
  className?: string;
}

const springTransition = { type: "spring" as const, stiffness: 400, damping: 25 };

export function SystemCard({
  system,
  gameCount,
  onClick,
  className = "",
}: SystemCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  const themeColor = system.theme_color;

  // Dynamic glow and border color based on system theme color
  const hoverStyle: CSSProperties = isHovered
    ? themeColor
      ? {
          borderColor: `color-mix(in srgb, ${themeColor} 50%, transparent)`,
          boxShadow: `0 0 20px color-mix(in srgb, ${themeColor} 30%, transparent)`,
        }
      : {
          boxShadow:
            "0 0 20px color-mix(in srgb, var(--accent) 30%, transparent)",
        }
    : {};

  return (
    <motion.div
      className={`flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border p-4 bg-surface transition-colors duration-200 ${
        isHovered && !themeColor ? "border-accent/50" : isHovered ? "" : "border-ghost"
      } ${className}`}
      style={{
        width: 140,
        height: 110,
        ...hoverStyle,
      }}
      whileHover={shouldReduceMotion ? undefined : { scale: 1.02 }}
      transition={springTransition}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      onClick={() => onClick?.(system)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.(system);
        }
      }}
      aria-label={`${system.name} — ${gameCount} games`}
    >
      <span className="text-center text-[13px] font-semibold text-text-primary">
        {system.name}
      </span>

      <span
        className="font-mono text-xl font-bold text-accent"
        style={themeColor ? { color: themeColor } : undefined}
      >
        {gameCount}
      </span>

      <span className="text-[10px] text-text-dim">games</span>
    </motion.div>
  );
}
