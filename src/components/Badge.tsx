import { type CSSProperties } from "react";

export interface BadgeProps {
  label: string;
  variant?: "system" | "genre" | "status" | "region";
  color?: string;
  className?: string;
}

export function Badge({
  label,
  variant: _variant,
  color,
  className = "",
}: BadgeProps) {
  const dynamicStyle: CSSProperties | undefined = color
    ? {
        backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 50%, transparent)`,
        color,
      }
    : undefined;

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] font-semibold leading-none ${
        color
          ? "border"
          : "border border-accent/50 bg-accent/15 text-accent"
      } ${className}`}
      style={dynamicStyle}
    >
      {label}
    </span>
  );
}
