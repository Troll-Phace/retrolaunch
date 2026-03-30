export type StatusState =
  | "configured"
  | "scanning"
  | "not_configured"
  | "error"
  | "matched";

export interface StatusIndicatorProps {
  status: StatusState;
  label?: string;
  className?: string;
}

interface StatusConfig {
  colorClass: string;
  icon: React.ReactNode;
  ariaLabel: string;
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 7.5L5.5 10.5L11.5 3.5" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="animate-spin"
      aria-hidden="true"
    >
      <path d="M7 1a6 6 0 0 1 6 6" />
    </svg>
  );
}

function EmptyCircleIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="5" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5" />
    </svg>
  );
}

function FilledCircleIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="4" />
    </svg>
  );
}

const statusMap: Record<StatusState, StatusConfig> = {
  configured: {
    colorClass: "text-success",
    icon: <CheckIcon />,
    ariaLabel: "Configured",
  },
  scanning: {
    colorClass: "text-warning",
    icon: <SpinnerIcon />,
    ariaLabel: "Scanning",
  },
  not_configured: {
    colorClass: "text-warning",
    icon: <EmptyCircleIcon />,
    ariaLabel: "Not configured",
  },
  error: {
    colorClass: "text-error",
    icon: <XIcon />,
    ariaLabel: "Error",
  },
  matched: {
    colorClass: "text-success",
    icon: <FilledCircleIcon />,
    ariaLabel: "Matched",
  },
};

export function StatusIndicator({
  status,
  label,
  className = "",
}: StatusIndicatorProps) {
  const config = statusMap[status];

  return (
    <span
      className={`inline-flex items-center gap-2 text-sm ${config.colorClass} ${className}`}
      role="status"
      aria-label={label ?? config.ariaLabel}
    >
      {config.icon}
      {label && <span>{label}</span>}
    </span>
  );
}
