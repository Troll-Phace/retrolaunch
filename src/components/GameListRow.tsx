import { memo, useState } from "react";
import { motion } from "framer-motion";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { Game } from "@/types";
import { Badge } from "@/components/Badge";
import { BlurhashPlaceholder } from "@/components/BlurhashPlaceholder";
import { STATUS_CONFIG } from "@/constants/gameStatus";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a playtime duration in seconds to a human-readable string. */
function formatPlaytime(seconds: number): string {
  if (seconds < 60) return "< 1m";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Extract a 4-digit year from an ISO date string or year-only string. */
function extractYear(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const match = /\d{4}/.exec(dateStr);
  return match ? match[0] : null;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GameListRowProps {
  game: Game;
  onClick?: (game: Game) => void;
  focused?: boolean;
  tabIndex?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const GameListRow = memo(function GameListRow({
  game,
  onClick,
  focused = false,
  tabIndex: tabIndexProp,
}: GameListRowProps) {
  const [isHovered, setIsHovered] = useState(false);

  const year = extractYear(game.release_date);

  return (
    <motion.div
      className={`group flex h-[72px] items-center gap-4 px-4 rounded-xl border bg-surface cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-void ${
        focused
          ? "ring-2 ring-accent/50 ring-offset-2 ring-offset-void border-accent/50"
          : isHovered
            ? "border-accent/50"
            : "border-ghost"
      }`}
      style={{
        boxShadow: isHovered
          ? "0 0 20px color-mix(in srgb, var(--accent) 30%, transparent)"
          : "none",
      }}
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
      {/* 1. Cover art thumbnail */}
      <div className="h-16 w-12 flex-shrink-0 overflow-hidden rounded-md">
        {game.cover_path ? (
          <BlurhashPlaceholder
            blurhash={game.blurhash ?? ""}
            src={convertFileSrc(game.cover_path)}
            alt={game.title}
            className="h-full w-full"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-elevated">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className="h-5 w-5 text-text-dim"
              aria-hidden="true"
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
      </div>

      {/* 2. Title */}
      <span className="flex-1 min-w-0 truncate text-sm font-semibold text-text-primary">
        {game.title}
      </span>

      {/* 3. System badge */}
      <Badge label={game.system_id} variant="system" />

      {/* 4. Genre (hidden below xl / 1200px) */}
      <span className="hidden xl:block w-24 truncate text-xs text-text-secondary">
        {game.genre ?? "\u2014"}
      </span>

      {/* 5. Developer (hidden below lg / 900px) */}
      <span className="hidden lg:block w-28 truncate text-xs text-text-secondary">
        {game.developer ?? "\u2014"}
      </span>

      {/* 6. Year (hidden below lg / 900px) */}
      <span className="hidden lg:block w-10 text-xs text-text-dim">
        {year ?? "\u2014"}
      </span>

      {/* 7. Status badge or spacer */}
      <span className="w-20 flex-shrink-0 flex items-center justify-center">
        {game.status !== '' ? (
          <Badge
            label={STATUS_CONFIG[game.status].label}
            variant="status"
            color={STATUS_CONFIG[game.status].color}
          />
        ) : null}
      </span>

      {/* 8. Playtime */}
      <span className="w-[60px] flex-shrink-0 text-right font-mono text-xs text-text-dim">
        {formatPlaytime(game.total_playtime_seconds)}
      </span>

      {/* 9. Play button */}
      <button
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        aria-label={`Play ${game.title}`}
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.(game);
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54
               6.347c1.295.712 1.295 2.573 0
               3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </motion.div>
  );
});
