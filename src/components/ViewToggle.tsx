import { motion } from "framer-motion";
import { useAppStore } from "@/store";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ViewToggle() {
  const viewPreference = useAppStore((s) => s.viewPreference);
  const setViewPreference = useAppStore((s) => s.setViewPreference);

  return (
    <div className="inline-flex items-center gap-1" role="radiogroup" aria-label="View mode">
      <ViewButton
        active={viewPreference === "grid"}
        onClick={() => setViewPreference("grid")}
        label="Grid view"
      >
        <GridIcon />
      </ViewButton>
      <ViewButton
        active={viewPreference === "list"}
        onClick={() => setViewPreference("list")}
        label="List view"
      >
        <ListIcon />
      </ViewButton>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ViewButton (internal)
// ---------------------------------------------------------------------------

interface ViewButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}

function ViewButton({ active, onClick, label, children }: ViewButtonProps) {
  return (
    <motion.button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={label}
      onClick={onClick}
      whileTap={{ scale: 0.92 }}
      className={`inline-flex size-9 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-void ${
        active
          ? "bg-accent text-white"
          : "border border-ghost-lit bg-transparent text-text-secondary hover:border-accent/50 hover:text-text-primary"
      }`}
    >
      {children}
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Icons (internal)
// ---------------------------------------------------------------------------

function GridIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="size-4"
      aria-hidden="true"
    >
      <rect x="1" y="1" width="6" height="6" rx="1" />
      <rect x="9" y="1" width="6" height="6" rx="1" />
      <rect x="1" y="9" width="6" height="6" rx="1" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="size-4"
      aria-hidden="true"
    >
      <rect x="1" y="2" width="14" height="2.5" rx="0.75" />
      <rect x="1" y="6.75" width="14" height="2.5" rx="0.75" />
      <rect x="1" y="11.5" width="14" height="2.5" rx="0.75" />
    </svg>
  );
}
