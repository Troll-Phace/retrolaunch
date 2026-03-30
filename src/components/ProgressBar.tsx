export interface ProgressBarProps {
  value: number;
  height?: number;
  animated?: boolean;
  className?: string;
}

export function ProgressBar({
  value,
  height = 6,
  animated = true,
  className = "",
}: ProgressBarProps) {
  const clampedValue = Math.max(0, Math.min(100, value));

  return (
    <div
      className={`w-full overflow-hidden rounded-full bg-active ${className}`}
      style={{ height }}
      role="progressbar"
      aria-valuenow={clampedValue}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full bg-gradient-to-r from-accent to-accent-light ${
          animated
            ? "transition-all duration-500 ease-out motion-reduce:transition-none"
            : ""
        }`}
        style={{ width: `${clampedValue}%` }}
      />
    </div>
  );
}
