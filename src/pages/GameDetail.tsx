/**
 * Game Detail page — full game information view with cover art, metadata,
 * play stats, screenshot carousel, and file info.
 *
 * Uses dynamic color extraction from cover art via useDynamicColor hook.
 * Cover art uses layoutId for shared element transition from grid cards.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { convertFileSrc } from "@tauri-apps/api/core";

import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { BlurhashPlaceholder } from "@/components/BlurhashPlaceholder";
import { useDynamicColor } from "@/hooks/useDynamicColor";
import { getGameDetail, getPlayStats, launchGame, toggleFavorite, revealInFileManager } from "@/services/api";
import { useAppStore } from "@/store";
import type { Game, GameDetailResponse, PlayStats, Screenshot } from "@/types";

// ---------------------------------------------------------------------------
// Inline SVG icons
// ---------------------------------------------------------------------------

function ArrowLeftIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M19 12H5M5 12l7 7M5 12l7-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 5v14l11-7L8 5z" fill="currentColor" />
    </svg>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 6L9 17l-5-5"
        stroke="var(--success)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M18 6L6 18M6 6l12 12"
        stroke="var(--error)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseModalIcon() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M18 6L6 18M6 6l12 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPlaytime(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0m";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours === 0 && minutes === 0) return "< 1m";
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes <= 0) return "N/A";
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatRelativeDate(isoDate: string | null): string {
  if (!isoDate) return "Never";
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays} days ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

function formatReleaseDate(isoDate: string | null): string {
  if (!isoDate) return "";
  try {
    return new Date(isoDate).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return isoDate;
  }
}

function extractFilename(romPath: string): string {
  const parts = romPath.split(/[/\\]/);
  return parts[parts.length - 1] || romPath;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ScreenshotModalProps {
  screenshot: Screenshot;
  onClose: () => void;
}

function ScreenshotModal({ screenshot, onClose }: ScreenshotModalProps) {
  const shouldReduceMotion = useReducedMotion();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const imgSrc = screenshot.local_path
    ? convertFileSrc(screenshot.local_path)
    : screenshot.url;

  // Auto-focus close button on mount
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // Close on Escape + focus trap (only interactive element is the close button)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        e.preventDefault();
        closeButtonRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

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
      aria-label="Screenshot preview"
    >
      <button
        ref={closeButtonRef}
        type="button"
        className="absolute right-6 top-6 rounded-full bg-surface/80 p-2 text-text-primary transition-colors hover:bg-elevated"
        onClick={onClose}
        aria-label="Close screenshot preview"
      >
        <CloseModalIcon />
      </button>
      <motion.img
        src={imgSrc}
        alt="Game screenshot"
        className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain"
        initial={{ scale: shouldReduceMotion ? 1 : 0.95, opacity: shouldReduceMotion ? 1 : 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: shouldReduceMotion ? 1 : 0.95, opacity: shouldReduceMotion ? 1 : 0 }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
        onClick={(e) => e.stopPropagation()}
      />
    </motion.div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="overflow-y-auto h-full px-8 py-6">
      {/* Back button skeleton */}
      <div className="mb-6 h-8 w-20 animate-pulse rounded-full bg-elevated" />

      {/* Two-column layout */}
      <div className="flex flex-row gap-10">
        {/* Cover art skeleton */}
        <div className="w-[300px] h-[300px] flex-shrink-0 animate-pulse rounded-xl bg-elevated" />

        {/* Right column */}
        <div className="flex-1 min-w-0">
          <div className="h-10 w-3/4 animate-pulse rounded-lg bg-elevated" />
          <div className="mt-3 flex gap-2">
            <div className="h-6 w-20 animate-pulse rounded-full bg-elevated" />
            <div className="h-6 w-16 animate-pulse rounded-full bg-elevated" />
          </div>
          <div className="mt-5 flex gap-3">
            <div className="h-[50px] w-[160px] animate-pulse rounded-full bg-elevated" />
            <div className="h-[42px] w-[130px] animate-pulse rounded-full bg-elevated" />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <div className="h-3 w-16 animate-pulse rounded bg-elevated" />
                <div className="mt-1 h-4 w-24 animate-pulse rounded bg-elevated" />
              </div>
            ))}
          </div>
          <div className="mt-6">
            <div className="h-4 w-12 animate-pulse rounded bg-elevated" />
            <div className="mt-2 h-20 w-full animate-pulse rounded bg-elevated" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metadata field component
// ---------------------------------------------------------------------------

interface MetadataFieldProps {
  label: string;
  value: string;
}

function MetadataField({ label, value }: MetadataFieldProps) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
        {label}
      </dt>
      <dd className="text-[14px] text-text-primary mt-0.5">{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function GameDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();
  const addToast = useAppStore((s) => s.addToast);
  const dynamicColorPalette = useAppStore((s) => s.dynamicColorPalette);

  // Data state
  const [detail, setDetail] = useState<GameDetailResponse | null>(null);
  const [stats, setStats] = useState<PlayStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [isFavorite, setIsFavorite] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [selectedScreenshot, setSelectedScreenshot] = useState<Screenshot | null>(null);

  const game: Game | null = detail?.game ?? null;
  const screenshots: Screenshot[] = detail?.screenshots ?? [];

  // Dynamic color extraction
  const dynamicPalette = useDynamicColor(game?.cover_path ?? null);
  const dynamicAccent = dynamicPalette?.accent ?? dynamicColorPalette?.accent ?? null;

  // Cover art src
  const coverSrc = useMemo(() => {
    if (!game?.cover_path) return undefined;
    return convertFileSrc(game.cover_path);
  }, [game?.cover_path]);

  // Sync favorite state from game data
  useEffect(() => {
    if (game) setIsFavorite(game.is_favorite);
  }, [game]);

  // Fetch data
  useEffect(() => {
    const gameId = Number(id);
    if (isNaN(gameId)) {
      setError("Invalid game ID");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    Promise.all([getGameDetail(gameId), getPlayStats(gameId)])
      .then(([detailRes, statsRes]) => {
        setDetail(detailRes);
        setStats(statsRes);
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : String(err ?? "Failed to load game");
        setError(message);
      })
      .finally(() => setLoading(false));
  }, [id]);

  // Handlers
  const handleBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const handleLaunch = useCallback(async () => {
    if (!game) return;
    setIsLaunching(true);
    try {
      await launchGame(game.id);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to launch game. Check emulator configuration.";
      addToast({ type: "error", message });
    } finally {
      setIsLaunching(false);
    }
  }, [game, addToast]);

  const handleToggleFavorite = useCallback(async () => {
    if (!game) return;
    // Optimistic update
    const previousState = isFavorite;
    setIsFavorite(!previousState);
    try {
      const newState = await toggleFavorite(game.id);
      setIsFavorite(newState);
    } catch {
      // Revert on error
      setIsFavorite(previousState);
      addToast({ type: "error", message: "Failed to update favorite status." });
    }
  }, [game, isFavorite, addToast]);

  const revealLabel = navigator.platform.startsWith("Mac")
    ? "Reveal in Finder"
    : navigator.platform.startsWith("Win")
      ? "Show in Explorer"
      : "Open File Location";

  const handleRevealInFinder = useCallback(async () => {
    if (!game) return;
    try {
      await revealInFileManager(game.rom_path);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to reveal file.";
      addToast({ type: "error", message });
    }
  }, [game, addToast]);

  const handleScreenshotClose = useCallback(() => {
    setSelectedScreenshot(null);
  }, []);

  // Metadata fields
  const metadataFields = useMemo(() => {
    if (!game) return [];
    const fields: MetadataFieldProps[] = [];
    if (game.developer) fields.push({ label: "Developer", value: game.developer });
    if (game.publisher) fields.push({ label: "Publisher", value: game.publisher });
    if (game.release_date) {
      fields.push({ label: "Release Date", value: formatReleaseDate(game.release_date) });
    }
    if (game.region) fields.push({ label: "Region", value: game.region });
    return fields;
  }, [game]);

  // Genre badges
  const genres = useMemo(() => {
    if (!game?.genre) return [];
    return game.genre
      .split(",")
      .map((g) => g.trim())
      .filter(Boolean);
  }, [game?.genre]);

  // Cover layout transition
  const coverLayoutTransition = shouldReduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 300, damping: 30 };

  // ---------------------------------------------------------------------------
  // Render states
  // ---------------------------------------------------------------------------

  if (loading) return <LoadingSkeleton />;

  if (error || !game) {
    return (
      <div className="overflow-y-auto h-full px-8 py-6">
        <Button variant="ghost" size="sm" onClick={handleBack} className="mb-6 gap-2">
          <ArrowLeftIcon />
          Back
        </Button>
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-[18px] font-semibold text-text-primary">
            {error || "Game not found"}
          </p>
          <p className="mt-2 text-[14px] text-text-secondary">
            The game you are looking for could not be loaded.
          </p>
        </div>
      </div>
    );
  }

  // Has meaningful play stats
  const hasPlayStats =
    stats !== null && (stats.session_count > 0 || stats.total_playtime_seconds > 0);

  // Stagger variants for section entry animation
  const containerVariants = {
    initial: {},
    animate: {
      transition: shouldReduceMotion
        ? { staggerChildren: 0 }
        : { staggerChildren: 0.06 },
    },
  };

  const sectionVariants = shouldReduceMotion
    ? { initial: {}, animate: {} }
    : {
        initial: { opacity: 0, y: 12 },
        animate: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.3, ease: "easeOut" as const },
        },
      };

  // Orb colors — prefer extracted palette, fall back to CSS custom properties
  const orbAccent = dynamicPalette?.accent ?? "var(--accent)";
  const orbAccentLight = dynamicPalette?.accentLight ?? "var(--accent-light)";
  const orbGlow = dynamicPalette?.glowColor ?? "var(--accent)";

  return (
    <div className="relative overflow-hidden overflow-y-auto h-full px-8 py-6">
      {/* Background color bleed orbs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
      >
        {/* Orb 1: top-right, large, accent */}
        <div
          className="absolute transition-colors duration-300"
          style={{
            top: "-120px",
            right: "-80px",
            width: "650px",
            height: "650px",
            borderRadius: "9999px",
            background: orbAccent,
            opacity: 0.05,
            filter: "blur(150px)",
          }}
        />
        {/* Orb 2: bottom-left, medium, accentLight */}
        <div
          className="absolute transition-colors duration-300"
          style={{
            bottom: "-60px",
            left: "-100px",
            width: "450px",
            height: "450px",
            borderRadius: "9999px",
            background: orbAccentLight,
            opacity: 0.04,
            filter: "blur(120px)",
          }}
        />
        {/* Orb 3: center, small, glowColor */}
        <div
          className="absolute transition-colors duration-300"
          style={{
            top: "40%",
            left: "35%",
            width: "350px",
            height: "350px",
            borderRadius: "9999px",
            background: orbGlow,
            opacity: 0.03,
            filter: "blur(130px)",
          }}
        />
      </div>

      {/* Page content (z-10 above orbs) */}
      <motion.div
        className="relative z-10"
        variants={containerVariants}
        initial="initial"
        animate="animate"
      >

      {/* Back navigation */}
      <Button variant="ghost" size="sm" onClick={handleBack} className="mb-6 gap-2">
        <ArrowLeftIcon />
        Back
      </Button>

      {/* Two-column layout */}
      <motion.div variants={sectionVariants} className="flex flex-col lg:flex-row gap-10">
        {/* Left column: Cover art */}
        <div className="flex-shrink-0 w-[300px]">
          <motion.div
            layoutId={`game-cover-${game.id}`}
            transition={coverLayoutTransition}
            className="w-[300px] h-[300px] rounded-xl overflow-hidden"
            style={{
              boxShadow: dynamicAccent
                ? `0 20px 60px -10px ${dynamicAccent}40`
                : "0 20px 60px -10px rgba(0,0,0,0.4)",
              transition: "box-shadow 300ms ease",
            }}
          >
            {game.cover_path && game.blurhash ? (
              <BlurhashPlaceholder
                blurhash={game.blurhash}
                width={300}
                height={300}
                src={coverSrc}
                alt={`${game.title} cover art`}
                className="rounded-xl"
              />
            ) : game.cover_path ? (
              <img
                src={coverSrc}
                alt={`${game.title} cover art`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div
                className="w-full h-full bg-elevated flex items-center justify-center"
                role="img"
                aria-label={`${game.title} placeholder`}
              >
                <span className="text-[48px] text-text-dim">
                  {game.title.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </motion.div>
        </div>

        {/* Right column: Metadata */}
        <div className="flex-1 min-w-0">
          {/* Title */}
          <h1 className="text-[36px] font-bold leading-[1.1] text-text-primary tracking-[-0.5px]">
            {game.title}
          </h1>

          {/* Badges */}
          <div className="flex flex-wrap gap-2 mt-3 transition-colors duration-300">
            <Badge label={game.system_id} variant="system" />
            {genres.map((g) => (
              <Badge key={g} label={g} variant="genre" />
            ))}
            {game.region && <Badge label={game.region} variant="region" />}
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 mt-5">
            <Button
              variant="primary"
              size="lg"
              onClick={handleLaunch}
              disabled={isLaunching}
              className="gap-2"
            >
              <PlayIcon />
              {isLaunching ? "Launching..." : "Launch"}
            </Button>
            <Button
              variant={isFavorite ? "primary" : "secondary"}
              size="md"
              onClick={handleToggleFavorite}
              className="gap-2"
            >
              <HeartIcon filled={isFavorite} />
              {isFavorite ? "Favorited" : "Favorite"}
            </Button>
          </div>

          {/* Metadata grid */}
          {metadataFields.length > 0 && (
            <dl className="grid grid-cols-2 gap-x-8 gap-y-3 mt-6">
              {metadataFields.map((field) => (
                <MetadataField key={field.label} label={field.label} value={field.value} />
              ))}
            </dl>
          )}

          {/* Description */}
          {game.description && (
            <div className="mt-6">
              <h2 className="text-[16px] font-semibold text-text-primary">About</h2>
              <p
                className={`mt-2 text-[14px] leading-relaxed text-text-secondary ${
                  descriptionExpanded ? "" : "line-clamp-6"
                }`}
              >
                {game.description}
              </p>
              {/* Only show expand toggle if description is long enough */}
              {game.description.length > 400 && (
                <button
                  type="button"
                  onClick={() => setDescriptionExpanded((prev) => !prev)}
                  className="mt-1 text-[13px] font-medium text-accent transition-opacity hover:opacity-80"
                >
                  {descriptionExpanded ? "Show less" : "Show more"}
                </button>
              )}
            </div>
          )}
        </div>
      </motion.div>

      {/* Play Stats section */}
      <motion.div variants={sectionVariants} className="mt-8">
        <h2 className="text-[16px] font-semibold text-text-primary">Your Stats</h2>
        {hasPlayStats && stats ? (
          <div className="flex gap-8 mt-4">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                Total Playtime
              </span>
              <p className="font-mono font-bold text-[24px] text-text-primary mt-0.5">
                {formatPlaytime(stats.total_playtime_seconds)}
              </p>
            </div>
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                Sessions
              </span>
              <p className="font-mono font-bold text-[24px] text-text-primary mt-0.5">
                {stats.session_count}
              </p>
            </div>
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                Last Played
              </span>
              <p className="text-[14px] text-text-secondary mt-1">
                {formatRelativeDate(stats.last_played_at)}
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-[14px] text-text-dim">Not played yet</p>
        )}
      </motion.div>

      {/* Screenshot carousel */}
      {screenshots.length > 0 && (
        <motion.div variants={sectionVariants} className="mt-8">
          <h2 className="text-[16px] font-semibold text-text-primary">Screenshots</h2>
          <div className="mt-3 overflow-hidden mr-[-32px]">
            <div className="overflow-x-auto flex gap-3 pb-2 pr-8 no-scrollbar">
              {screenshots.map((ss) => {
                const ssImgSrc = ss.local_path
                  ? convertFileSrc(ss.local_path)
                  : ss.url;
                return (
                  <button
                    key={ss.id}
                    type="button"
                    className="w-[280px] h-[160px] flex-shrink-0 rounded-lg overflow-hidden cursor-pointer transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    onClick={() => setSelectedScreenshot(ss)}
                    aria-label={`View screenshot ${ss.sort_order + 1}`}
                  >
                    <img
                      src={ssImgSrc}
                      alt={`Screenshot ${ss.sort_order + 1}`}
                      className="object-cover w-full h-full"
                      loading="lazy"
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}

      {/* File info bar */}
      <motion.div variants={sectionVariants} className="mt-8 border-t border-ghost pt-4">
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-text-dim font-mono">
          <span>{extractFilename(game.rom_path)}</span>
          <span aria-hidden="true">&middot;</span>
          <span>{formatFileSize(game.file_size_bytes)}</span>
          <span aria-hidden="true">&middot;</span>
          <span>CRC32: {game.rom_hash_crc32 ?? "N/A"}</span>
          <span aria-hidden="true">&middot;</span>
          <span className="inline-flex items-center gap-1">
            {game.nointro_name ? (
              <>
                <CheckIcon />
                <span className="text-success">Verified</span>
              </>
            ) : (
              <>
                <XIcon />
                <span className="text-error">Unverified</span>
              </>
            )}
          </span>
          <span aria-hidden="true">&middot;</span>
          <Button variant="ghost" size="sm" onClick={handleRevealInFinder} className="gap-1 text-[12px] font-mono h-7 px-2">
            <ExternalLinkIcon />
            {revealLabel}
          </Button>
        </div>
      </motion.div>

      {/* Screenshot modal */}
      <AnimatePresence>
        {selectedScreenshot && (
          <ScreenshotModal
            screenshot={selectedScreenshot}
            onClose={handleScreenshotClose}
          />
        )}
      </AnimatePresence>

      </motion.div>
    </div>
  );
}
