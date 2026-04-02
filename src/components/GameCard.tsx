import { memo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { Game } from "@/types";
import { Badge } from "@/components/Badge";
import { BlurhashPlaceholder } from "@/components/BlurhashPlaceholder";
import { STATUS_CONFIG } from "@/constants/gameStatus";

export interface GameCardProps {
  game: Game;
  onClick?: (game: Game) => void;
  className?: string;
  /** Whether this card is keyboard-focused in the grid. */
  focused?: boolean;
  /** Roving tabindex value — only the focused card should be tabbable. */
  tabIndex?: number;
  /**
   * When true, omit the `layoutId` prop from the cover art motion element.
   * Use this inside virtualized grids to avoid expensive layout tracking
   * across 1000+ cards. Defaults to false so non-grid contexts (e.g. home
   * page horizontal scroll rows) retain shared-element layout transitions.
   */
  disableLayoutAnimation?: boolean;
}

/** Extract a 4-digit year from an ISO date string or year-only string. */
function extractYear(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const match = /\d{4}/.exec(dateStr);
  return match ? match[0] : null;
}

const springTransition = { type: "spring" as const, stiffness: 400, damping: 25 };

export const GameCard = memo(function GameCard({ game, onClick, className = "", focused = false, tabIndex: tabIndexProp, disableLayoutAnimation = false }: GameCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  const year = extractYear(game.release_date);

  // Build "Developer . Year" subtitle
  const subtitleParts: string[] = [];
  if (game.developer) subtitleParts.push(game.developer);
  if (year) subtitleParts.push(year);
  const subtitle = subtitleParts.join(" \u00B7 ");

  return (
    <motion.div
      className={`group flex flex-col cursor-pointer overflow-hidden rounded-xl border bg-surface transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-void ${
        focused ? "ring-2 ring-accent/50 ring-offset-2 ring-offset-void border-accent/50" : isHovered ? "border-accent/50" : "border-ghost"
      } ${className}`}
      style={{
        boxShadow: isHovered
          ? "0 0 20px color-mix(in srgb, var(--accent) 30%, transparent)"
          : "none",
      }}
      whileHover={shouldReduceMotion ? undefined : { scale: 1.02 }}
      transition={springTransition}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      onClick={() => onClick?.(game)}
      role="button"
      tabIndex={tabIndexProp ?? 0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.(game);
        }
      }}
      aria-label={`${game.title} — ${game.system_id}`}
    >
      {/* Cover art area */}
      <motion.div
        className="relative aspect-[3/4] w-full overflow-hidden"
        layoutId={disableLayoutAnimation ? undefined : `game-cover-${game.id}`}
        transition={
          shouldReduceMotion
            ? { duration: 0 }
            : { type: "spring", stiffness: 300, damping: 30 }
        }
      >
        {game.cover_path ? (
          <BlurhashPlaceholder
            blurhash={game.blurhash ?? ""}
            src={convertFileSrc(game.cover_path)}
            alt={game.title}
            className="h-full w-full"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-elevated">
            {/* Generic game icon placeholder */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className="h-10 w-10 text-text-dim"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003
                   0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0
                   .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64
                   0 0 1-.657.643 48.39 48.39 0 0 0-4.163.3c-1.24.116-2.13
                   1.157-2.13 2.408v0c0 .647.224 1.275.633 1.774a5.25
                   5.25 0 0 0 3.178 1.842 48.394 48.394 0 0 0 3.08.326.64.64
                   0 0 1 .594.643v0a.64.64 0 0 1-.594.643 48.394 48.394
                   0 0 0-3.08.326 5.25 5.25 0 0 0-3.178 1.842 2.89 2.89
                   0 0 0-.633 1.774v0c0 1.251.89 2.292 2.13
                   2.408a48.39 48.39 0 0 0 4.163.3.64.64 0 0 1
                   .657.643v0c0 .355-.186.676-.401.959a1.647 1.647
                   0 0 0-.349 1.003c0 1.035 1.007 1.875 2.25
                   1.875s2.25-.84 2.25-1.875c0-.369-.128-.713-.349-1.003a1.647
                   1.647 0 0 1-.401-.959v0a.64.64 0 0 1
                   .658-.643 48.39 48.39 0 0 0 4.163-.3c1.24-.116
                   2.13-1.157 2.13-2.408v0a2.89 2.89 0 0 0-.633-1.774
                   5.25 5.25 0 0 0-3.178-1.842 48.393 48.393 0 0
                   0-3.08-.326.64.64 0 0 1-.594-.643v0c0-.357.238-.649.594-.643a48.393
                   48.393 0 0 0 3.08-.326 5.25 5.25 0 0 0
                   3.178-1.842A2.89 2.89 0 0 0 19.5
                   8.637v0c0-1.251-.89-2.292-2.13-2.408a48.39
                   48.39 0 0 0-4.163-.3.64.64 0 0 1-.657-.643v0Z"
              />
            </svg>
          </div>
        )}

        {/* Play icon overlay on hover */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="white"
            className="h-6 w-6"
          >
            <path
              fillRule="evenodd"
              d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54
                 6.347c1.295.712 1.295 2.573 0
                 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </motion.div>

      {/* Text info area */}
      <div className="p-3 mt-auto">
        <p className="line-clamp-2 text-xs font-semibold text-text-primary">
          {game.title}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge label={game.system_id} variant="system" />
          {game.status !== '' && (
            <Badge
              label={STATUS_CONFIG[game.status].label}
              variant="status"
              color={STATUS_CONFIG[game.status].color}
            />
          )}
        </div>

        {subtitle && (
          <p className="mt-1 text-[10px] text-text-dim">{subtitle}</p>
        )}
      </div>
    </motion.div>
  );
});
