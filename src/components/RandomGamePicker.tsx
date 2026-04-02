import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, useAnimate, useReducedMotion, AnimatePresence } from "framer-motion";
import { convertFileSrc } from "@tauri-apps/api/core";

import type { Game, System } from "@/types";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { BlurhashPlaceholder } from "@/components/BlurhashPlaceholder";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RandomGamePickerProps {
  games: Game[];
  systems: System[];
  onClose: () => void;
  onLaunch: (gameId: number) => void;
  onViewDetails: (gameId: number) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractYear(dateStr: string | null): string {
  if (!dateStr) return "";
  const match = dateStr.match(/\d{4}/);
  return match ? match[0] : "";
}

/** Fisher-Yates shuffle (returns a new array). */
function shuffle<T>(arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

const COVER_WIDTH = 200;
const COVER_HEIGHT = 267;

// ---------------------------------------------------------------------------
// Inner component (remounts on "Pick Again" via key)
// ---------------------------------------------------------------------------

interface InnerProps {
  games: Game[];
  systems: System[];
  onClose: () => void;
  onLaunch: (gameId: number) => void;
  onViewDetails: (gameId: number) => void;
  onPickAgain: () => void;
}

type Phase = "cycling" | "landed" | "revealed";

function RandomGamePickerInner({
  games,
  systems,
  onClose,
  onLaunch,
  onViewDetails,
  onPickAgain,
}: InnerProps) {
  const shouldReduceMotion = useReducedMotion();
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const playButtonRef = useRef<HTMLButtonElement>(null);

  // Pick winner and build cycling pool once per mount
  const { winner, cyclingPool } = useMemo(() => {
    const w = games[Math.floor(Math.random() * games.length)]!;
    const shuffled = shuffle(games).slice(0, 20);
    // Remove the winner if it ended up in the shuffled pool, then append at end
    const filtered = shuffled.filter((g) => g.id !== w.id).slice(0, 19);
    filtered.push(w);
    return { winner: w, cyclingPool: filtered };
  }, [games]);

  const skipAnimation = shouldReduceMotion || games.length < 8;
  const [phase, setPhase] = useState<Phase>(skipAnimation ? "revealed" : "cycling");

  // System lookup for winner
  const system = systems.find((s) => s.id === winner.system_id);
  const systemShortName = system?.short_name ?? winner.system_id.toUpperCase();
  const systemThemeColor = system?.theme_color ?? undefined;

  // Focus management: close button on mount, play button on revealed
  useEffect(() => {
    if (phase === "revealed") {
      playButtonRef.current?.focus();
    } else {
      closeButtonRef.current?.focus();
    }
  }, [phase]);

  // Keyboard handling
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Animation sequence
  useEffect(() => {
    if (skipAnimation) return;

    let cancelled = false;

    async function run() {
      const totalDistance = -(cyclingPool.length - 1) * COVER_HEIGHT;

      // Phase 1: Cycling
      await animate(
        scope.current,
        { y: totalDistance },
        { duration: 2, ease: [0.2, 0, 0.1, 1] },
      );

      if (cancelled) return;

      // Phase 2: Landing bounce
      setPhase("landed");
      await animate(
        scope.current,
        { scale: [1, 1.05, 1] },
        { duration: 0.3, type: "spring", stiffness: 400, damping: 25 },
      );

      if (cancelled) return;

      // Phase 3: Wait for glow burst, then reveal
      await new Promise((r) => setTimeout(r, 600));

      if (cancelled) return;
      setPhase("revealed");
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [animate, scope, cyclingPool.length, skipAnimation]);

  // ------- Render -------

  if (phase === "revealed") {
    return (
      <div className="flex flex-col items-center gap-6">
        {/* Large cover art */}
        <div className="relative">
          <div className="w-[280px] aspect-[3/4] rounded-xl overflow-hidden shadow-2xl">
            <BlurhashPlaceholder
              blurhash={winner.blurhash || ""}
              src={winner.cover_path ? convertFileSrc(winner.cover_path) : undefined}
              alt={winner.title}
              className="w-full h-full"
              objectFit="cover"
            />
          </div>
        </div>

        {/* Game info */}
        <div className="flex flex-col items-center gap-2 text-center">
          <h2 className="text-2xl font-bold text-white">{winner.title}</h2>
          <Badge label={systemShortName} variant="system" color={systemThemeColor} />
          <p className="text-sm text-text-secondary">
            {winner.developer}
            {winner.developer && winner.release_date ? " \u00b7 " : ""}
            {extractYear(winner.release_date)}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            size="lg"
            ref={playButtonRef}
            onClick={() => onLaunch(winner.id)}
          >
            <svg className="mr-2 size-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
            Play Now
          </Button>
          <Button variant="secondary" size="md" onClick={() => onViewDetails(winner.id)}>
            View Details
          </Button>
          <Button variant="ghost" size="md" onClick={onPickAgain}>
            <svg
              className="mr-2 size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="2" width="20" height="20" rx="3" />
              <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="16" cy="16" r="1.5" fill="currentColor" stroke="none" />
            </svg>
            Pick Again
          </Button>
        </div>
      </div>
    );
  }

  // Cycling / landed states
  return (
    <div className="flex flex-col items-center gap-6">
      {/* Viewport window */}
      <div
        className="relative overflow-hidden rounded-xl"
        style={{ width: COVER_WIDTH, height: COVER_HEIGHT }}
      >
        <motion.div ref={scope} className="flex flex-col">
          {cyclingPool.map((game, i) => (
            <div
              key={`${game.id}-${i}`}
              className="shrink-0"
              style={{ width: COVER_WIDTH, height: COVER_HEIGHT }}
            >
              {game.cover_path ? (
                <img
                  src={convertFileSrc(game.cover_path)}
                  alt={game.title}
                  className="w-full h-full object-cover rounded-xl"
                />
              ) : (
                <div className="w-full h-full bg-elevated rounded-xl flex items-center justify-center">
                  <span className="text-4xl font-bold text-text-dim">
                    {game.title.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>
          ))}
        </motion.div>

        {/* Glow burst on landing */}
        <AnimatePresence>
          {phase === "landed" && (
            <motion.div
              className="absolute inset-0 rounded-xl pointer-events-none"
              style={{
                background:
                  "radial-gradient(circle, var(--accent) 0%, transparent 70%)",
              }}
              initial={{ opacity: 0.5 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          )}
        </AnimatePresence>
      </div>

      <p className={`text-sm text-text-secondary${shouldReduceMotion ? "" : " animate-pulse"}`}>Picking a game...</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Outer wrapper (handles modal backdrop + pick-again remount key)
// ---------------------------------------------------------------------------

export function RandomGamePicker({
  games,
  systems,
  onClose,
  onLaunch,
  onViewDetails,
}: RandomGamePickerProps) {
  const shouldReduceMotion = useReducedMotion();
  const [pickCount, setPickCount] = useState(0);

  const handlePickAgain = useCallback(() => {
    setPickCount((c) => c + 1);
  }, []);

  // If no games, close immediately
  useEffect(() => {
    if (games.length === 0) onClose();
  }, [games.length, onClose]);

  if (games.length === 0) return null;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      initial={{ opacity: shouldReduceMotion ? 1 : 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: shouldReduceMotion ? 1 : 0 }}
      transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Random game picker"
    >
      <motion.div
        initial={{
          scale: shouldReduceMotion ? 1 : 0.95,
          opacity: shouldReduceMotion ? 1 : 0,
        }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{
          scale: shouldReduceMotion ? 1 : 0.95,
          opacity: shouldReduceMotion ? 1 : 0,
        }}
        transition={
          shouldReduceMotion ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }
        }
        onClick={(e) => e.stopPropagation()}
        className="relative flex flex-col items-center"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 rounded-full bg-surface/80 p-2 text-text-primary hover:bg-elevated transition-colors"
          aria-label="Close"
        >
          <svg
            className="size-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Inner content - keyed to remount on "Pick Again" */}
        <RandomGamePickerInner
          key={pickCount}
          games={games}
          systems={systems}
          onClose={onClose}
          onLaunch={onLaunch}
          onViewDetails={onViewDetails}
          onPickAgain={handlePickAgain}
        />
      </motion.div>
    </motion.div>
  );
}
