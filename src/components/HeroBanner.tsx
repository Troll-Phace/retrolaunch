import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import type { Game, PlayStats } from "@/types";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { BlurhashPlaceholder } from "@/components/BlurhashPlaceholder";

export interface HeroBannerProps {
  game: Game | null;
  playStats: PlayStats | null;
  onPlay: (gameId: number) => void;
}

/** Format a duration in seconds to a human-readable string. */
function formatPlaytime(seconds: number): string {
  if (seconds >= 3600) {
    return `${(seconds / 3600).toFixed(1)} hours`;
  }
  if (seconds >= 60) {
    return `${Math.floor(seconds / 60)} min`;
  }
  return "< 1 min";
}

/** Format an ISO date string as a relative time description. */
function formatRelativeTime(isoDate: string): string {
  const then = new Date(isoDate).getTime();
  const now = Date.now();
  const diffSeconds = Math.floor((now - then) / 1000);

  if (diffSeconds < 60) return "just now";

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) {
    return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  }

  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths} month${diffMonths === 1 ? "" : "s"} ago`;
}

/** Extract a 4-digit year from an ISO date string or year-only string. */
function extractYear(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const match = /\d{4}/.exec(dateStr);
  return match ? match[0] : null;
}

/** Play triangle icon as an inline SVG. */
function PlayIcon() {
  return (
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
  );
}

export function HeroBanner({ game, playStats, onPlay }: HeroBannerProps) {
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();

  if (!game) {
    return (
      <motion.div
        className="relative flex min-h-[200px] items-center justify-center overflow-hidden rounded-2xl bg-deep p-6"
        style={{
          boxShadow: "0 4px 24px color-mix(in srgb, var(--bg-void) 60%, transparent)",
          transition: "box-shadow 300ms ease",
        }}
        initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        {/* Gradient overlay */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in srgb, var(--dynamic-accent, var(--accent)) 15%, transparent), transparent)",
            transition: "background 300ms ease",
          }}
        />

        <div className="relative z-10 flex flex-col items-center text-center">
          <h2 className="text-2xl font-bold text-text-primary">
            Welcome to RetroLaunch
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            Scan a ROM directory to get started
          </p>
          <div className="mt-4">
            <Button
              variant="secondary"
              size="md"
              onClick={() => navigate("/settings")}
            >
              Open Settings
            </Button>
          </div>
        </div>
      </motion.div>
    );
  }

  const year = extractYear(game.release_date);
  const subtitleParts: string[] = [];
  if (game.developer) subtitleParts.push(game.developer);
  if (year) subtitleParts.push(year);
  const subtitle = subtitleParts.join(" \u00B7 ");

  const playtimeLabel = playStats
    ? formatPlaytime(playStats.total_playtime_seconds)
    : formatPlaytime(game.total_playtime_seconds);

  const lastPlayedLabel =
    game.last_played_at
      ? `Last played ${formatRelativeTime(game.last_played_at)}`
      : null;

  return (
    <motion.div
      className="relative min-h-[200px] overflow-hidden rounded-2xl bg-deep"
      style={{
        boxShadow: "0 4px 24px color-mix(in srgb, var(--bg-void) 60%, transparent)",
        transition: "box-shadow 300ms ease",
      }}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      {/* Gradient overlay */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--dynamic-accent, var(--accent)) 15%, transparent), transparent)",
          transition: "background 300ms ease",
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex gap-6 p-6">
        {/* Cover art — click to view game detail */}
        <motion.div
          className="shrink-0 cursor-pointer overflow-hidden rounded-xl transition-opacity hover:opacity-90"
          style={{ width: 160, height: 160 }}
          layoutId={`game-cover-${game.id}`}
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 300, damping: 30 }
          }
          role="button"
          tabIndex={0}
          aria-label={`View details for ${game.title}`}
          onClick={() => navigate(`/game/${game.id}`)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              navigate(`/game/${game.id}`);
            }
          }}
        >
          {game.cover_path ? (
            <BlurhashPlaceholder
              blurhash={game.blurhash ?? ""}
              width={160}
              height={160}
              src={game.cover_path}
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
                className="h-10 w-10 text-text-dim"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.91 11.672a.375.375 0 0 1 0 .656l-5.603 3.113a.375.375
                     0 0 1-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112Z"
                />
              </svg>
            </div>
          )}
        </motion.div>

        {/* Info column */}
        <div className="flex min-w-0 flex-col gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-[2px] text-accent">
            Continue Playing
          </span>

          <h2 className="text-xl font-bold leading-tight text-text-primary">
            {game.title}
          </h2>

          <div>
            <Badge label={game.system_id} variant="system" />
          </div>

          {subtitle && (
            <p className="text-sm text-text-secondary">{subtitle}</p>
          )}

          <p className="text-xs text-text-dim">
            {playtimeLabel} played
            {lastPlayedLabel ? ` \u00B7 ${lastPlayedLabel}` : ""}
          </p>

          <div className="mt-auto pt-1">
            <Button
              variant="primary"
              size="md"
              onClick={() => onPlay(game.id)}
            >
              <PlayIcon />
              <span className="ml-2">Play Now</span>
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
