import { useRef, type MouseEvent } from "react";
import { motion } from "framer-motion";
import type { GameStatus } from "@/types";
import { STATUS_CONFIG } from "@/constants/gameStatus";

/** Maps each filter value to its display label. "All" maps to itself. */
const STATUS_OPTIONS: { value: GameStatus | "All"; label: string }[] = [
  { value: "All", label: "All" },
  { value: "backlog", label: "Backlog" },
  { value: "playing", label: "Playing" },
  { value: "completed", label: "Completed" },
  { value: "dropped", label: "Dropped" },
];

export interface StatusFilterBarProps {
  activeStatus: GameStatus | "All";
  onStatusChange: (status: GameStatus | "All") => void;
}

export function StatusFilterBar({
  activeStatus,
  onStatusChange,
}: StatusFilterBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (scrollRef.current) {
      // Allow horizontal scrolling via vertical wheel
      scrollRef.current.scrollLeft += e.deltaY;
    }
  };

  return (
    <div
      ref={scrollRef}
      onWheel={handleWheel}
      className="no-scrollbar flex gap-2 overflow-x-auto py-1"
      role="tablist"
      aria-label="Filter by status"
    >
      {STATUS_OPTIONS.map(({ value, label }) => {
        const isActive = value === activeStatus;
        return (
          <StatusPill
            key={value}
            label={label}
            statusValue={value}
            isActive={isActive}
            onClick={() => onStatusChange(value)}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatusPill (internal)
// ---------------------------------------------------------------------------

interface StatusPillProps {
  label: string;
  statusValue: GameStatus | "All";
  isActive: boolean;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
}

function StatusPill({ label, statusValue, isActive, onClick }: StatusPillProps) {
  const statusColor =
    statusValue !== "All"
      ? STATUS_CONFIG[statusValue]?.color
      : undefined;

  return (
    <motion.button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      className={`inline-flex shrink-0 cursor-pointer items-center rounded-full px-3 py-1 text-xs font-semibold leading-none transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-void ${
        isActive
          ? statusColor
            ? "border border-transparent"
            : "bg-accent text-white"
          : "border border-ghost-lit bg-transparent text-text-secondary hover:border-accent/50 hover:text-text-primary"
      }`}
      style={
        isActive && statusColor
          ? { backgroundColor: statusColor, color: "white" }
          : undefined
      }
    >
      {label}
    </motion.button>
  );
}
