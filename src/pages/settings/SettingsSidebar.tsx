/**
 * Settings sidebar navigation with 7 section items.
 * Uses Framer Motion layoutId for a smooth sliding active indicator.
 */

import { motion, useReducedMotion } from "framer-motion";

export type SettingsSection =
  | "emulators"
  | "directories"
  | "metadata"
  | "nointro"
  | "appearance"
  | "controls"
  | "about";

export interface SettingsSidebarProps {
  activeSection: SettingsSection;
  onSelect: (section: SettingsSection) => void;
}

interface NavItem {
  id: SettingsSection;
  label: string;
  icon: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Inline SVG icons
// ---------------------------------------------------------------------------

function GamepadIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 12h4M8 10v4M15 13h.01M18 11h.01M17.32 5H6.68a4 4 0 0 0-3.978 3.59l-.95 7.6A2 2 0 0 0 3.737 18.8l.377-.188a2 2 0 0 0 .96-1.088L6 15h12l.926 2.524a2 2 0 0 0 .96 1.088l.377.188a2 2 0 0 0 1.985-2.61l-.95-7.6A4 4 0 0 0 17.32 5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v11z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloudIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DatabaseIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <ellipse cx="12" cy="5" rx="9" ry="3" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function PaletteIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.563-2.512 5.563-5.563C22 5.55 17.5 2 12 2z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="8" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="8" r="1.5" fill="currentColor" />
      <circle cx="16" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

function KeyboardIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="2"
        y="4"
        width="20"
        height="16"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M8 16h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const NAV_ITEMS: NavItem[] = [
  { id: "emulators", label: "Emulators", icon: <GamepadIcon /> },
  { id: "directories", label: "ROM Directories", icon: <FolderIcon /> },
  { id: "metadata", label: "Metadata & APIs", icon: <CloudIcon /> },
  { id: "nointro", label: "ROM Verification", icon: <DatabaseIcon /> },
  { id: "appearance", label: "Appearance", icon: <PaletteIcon /> },
  { id: "controls", label: "Controls", icon: <KeyboardIcon /> },
  { id: "about", label: "About", icon: <InfoIcon /> },
];

const activeIndicatorSpring = {
  type: "spring" as const,
  stiffness: 500,
  damping: 30,
};

export function SettingsSidebar({ activeSection, onSelect }: SettingsSidebarProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <nav className="w-[260px] flex-shrink-0 bg-surface border-r border-ghost" aria-label="Settings navigation">
      <div className="px-4 py-5">
        <span className="text-xs font-semibold uppercase tracking-widest text-text-secondary">
          Settings
        </span>
      </div>
      <ul className="space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <li key={item.id} className="relative">
              {isActive && (
                <motion.div
                  layoutId="settings-active-indicator"
                  className="absolute inset-0 bg-accent/10 border-l-[3px] border-accent"
                  transition={shouldReduceMotion ? { duration: 0 } : activeIndicatorSpring}
                />
              )}
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                className={`relative w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors duration-200 cursor-pointer ${
                  isActive
                    ? "border-l-[3px] border-transparent text-accent"
                    : "border-l-[3px] border-transparent text-text-secondary hover:bg-elevated"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                {item.icon}
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
