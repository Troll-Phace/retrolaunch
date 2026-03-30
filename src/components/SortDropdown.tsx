import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { GameSortField, SortOrder } from "@/types";

// ---------------------------------------------------------------------------
// Sort option definitions
// ---------------------------------------------------------------------------

interface SortOption {
  label: string;
  sortBy: GameSortField;
  sortOrder: SortOrder;
}

const SORT_OPTIONS: readonly SortOption[] = [
  { label: "A \u2192 Z", sortBy: "title", sortOrder: "asc" },
  { label: "Z \u2192 A", sortBy: "title", sortOrder: "desc" },
  { label: "Year", sortBy: "release_date", sortOrder: "asc" },
  { label: "Recently Added", sortBy: "date_added", sortOrder: "desc" },
  { label: "Most Played", sortBy: "playtime", sortOrder: "desc" },
] as const;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SortDropdownProps {
  sortBy: GameSortField;
  sortOrder: SortOrder;
  onSortChange: (sortBy: GameSortField, sortOrder: SortOrder) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SortDropdown({
  sortBy,
  sortOrder,
  onSortChange,
}: SortDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Resolve current label
  const activeOption = SORT_OPTIONS.find(
    (o) => o.sortBy === sortBy && o.sortOrder === sortOrder
  );
  const activeLabel = activeOption?.label ?? "Sort";

  // Close on outside click
  const handleOutsideClick = useCallback(
    (e: globalThis.MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    },
    []
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("mousedown", handleOutsideClick);
      return () =>
        document.removeEventListener("mousedown", handleOutsideClick);
    }
  }, [open, handleOutsideClick]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const handleSelect = (option: SortOption) => {
    onSortChange(option.sortBy, option.sortOrder);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-transparent px-4 py-1.5 text-sm font-medium text-text-secondary transition-colors duration-200 hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-void"
      >
        {activeLabel}
        <ChevronDownIcon className={`size-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            aria-label="Sort options"
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 z-50 mt-1 min-w-[180px] overflow-hidden rounded-lg border border-ghost-lit bg-deep shadow-lg shadow-black/30"
          >
            {SORT_OPTIONS.map((option) => {
              const isActive =
                option.sortBy === sortBy && option.sortOrder === sortOrder;
              return (
                <li
                  key={option.label}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => handleSelect(option)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleSelect(option);
                    }
                  }}
                  tabIndex={0}
                  className={`cursor-pointer px-4 py-2.5 text-sm transition-colors duration-150 ${
                    isActive
                      ? "font-semibold text-accent"
                      : "text-text-secondary hover:bg-elevated hover:text-text-primary"
                  }`}
                >
                  {option.label}
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChevronDownIcon (internal)
// ---------------------------------------------------------------------------

interface IconProps {
  className?: string;
}

function ChevronDownIcon({ className = "" }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
