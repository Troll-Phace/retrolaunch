import { Link, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";

export interface SystemThemeHeaderProps {
  systemName: string;
  gameCount: number;
  themeColor: string;
}

/** Back arrow icon as an inline SVG. */
function BackArrowIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );
}

export function SystemThemeHeader({
  systemName,
  gameCount,
  themeColor,
}: SystemThemeHeaderProps) {
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.header
      className="relative overflow-hidden px-6 py-4"
      style={
        {
          "--system-theme-color": themeColor,
          transition: "all 300ms ease",
        } as React.CSSProperties
      }
      initial={shouldReduceMotion ? false : { opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      {/* Gradient bleed background */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(to right, color-mix(in srgb, ${themeColor} 20%, transparent), transparent 70%)`,
          transition: "background 300ms ease",
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col gap-2">
        {/* Navigation row: back button + breadcrumb */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary transition-colors duration-200 hover:bg-elevated hover:text-text-primary"
            aria-label="Go back"
          >
            <BackArrowIcon />
          </button>

          <nav aria-label="Breadcrumb">
            <ol className="flex items-center gap-1.5 text-sm text-text-secondary">
              <li>
                <Link
                  to="/"
                  className="transition-opacity duration-200 hover:opacity-70"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Home
                </Link>
              </li>
              <li aria-hidden="true" className="select-none">
                /
              </li>
              <li className="text-text-primary">{systemName}</li>
            </ol>
          </nav>
        </div>

        {/* System name + game count */}
        <div className="flex items-baseline gap-2">
          <h1
            className="text-[28px] font-bold leading-tight text-text-primary"
            style={{ letterSpacing: "-0.5px" }}
          >
            {systemName}
          </h1>
          <span
            className="font-mono text-lg font-bold text-text-secondary"
            style={{ letterSpacing: "0px" }}
          >
            {gameCount} {gameCount === 1 ? "Game" : "Games"}
          </span>
        </div>
      </div>
    </motion.header>
  );
}
