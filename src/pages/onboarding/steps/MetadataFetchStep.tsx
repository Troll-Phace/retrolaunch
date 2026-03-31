/**
 * Onboarding step 4 — Metadata Fetch.
 *
 * Auto-starts fetching metadata for all discovered games, shows a progress bar,
 * live preview of recently matched games, and summary statistics.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

import { ProgressBar } from '@/components/ProgressBar';
import { fetchMetadata, getCacheStats } from '@/services/api';
import { useMetadataProgress } from '../hooks/useMetadataProgress';
import {
  staggerContainer,
  staggerItem,
  reducedStaggerItem,
} from '../animations';
import type { WizardData } from '../hooks/useOnboardingState';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MetadataFetchStepProps {
  wizardData: WizardData;
  updateWizardData: (partial: Partial<WizardData>) => void;
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

interface StatCardProps {
  label: string;
  value: number | string;
  colorClass: string;
}

function StatCard({ label, value, colorClass }: StatCardProps) {
  return (
    <div className="rounded-lg border border-ghost bg-surface p-3 text-center w-32">
      <p className={`text-lg font-mono font-bold ${colorClass}`}>{value}</p>
      <p className="text-[10px] text-text-secondary mt-0.5">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Format bytes helper
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.round(bytes / 1024)} KB`;
  return `${mb.toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Main step component
// ---------------------------------------------------------------------------

export function MetadataFetchStep({ wizardData, updateWizardData }: MetadataFetchStepProps) {
  const shouldReduceMotion = useReducedMotion();
  const fetchStartedRef = useRef(false);
  const { progress, isComplete, activate } = useMetadataProgress();
  const [recentGames, setRecentGames] = useState<string[]>([]);
  const [cacheSize, setCacheSize] = useState(0);

  // -----------------------------------------------------------------------
  // Auto-start metadata fetch on mount
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (fetchStartedRef.current) return;
    if (wizardData.gamesFound <= 0) return;

    fetchStartedRef.current = true;
    activate(); // Start accepting events only NOW — ignores stale events from prior tasks
    void fetchMetadata({ game_ids: [], force: true }).catch((err: unknown) => {
      console.error('Metadata fetch failed:', err);
    });
  }, [wizardData.gamesFound, activate]);

  // -----------------------------------------------------------------------
  // Track recent games from progress events
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!progress?.current_game) return;
    setRecentGames((prev) => {
      const next = [progress.current_game, ...prev.filter((g) => g !== progress.current_game)];
      return next.slice(0, 5);
    });
  }, [progress?.current_game]);

  // -----------------------------------------------------------------------
  // Update wizard data from progress
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!progress) return;
    updateWizardData({
      metadataMatched: progress.fetched,
      metadataTotal: progress.total,
    });
  }, [progress, updateWizardData]);

  // -----------------------------------------------------------------------
  // Fetch cache stats periodically and on completion
  // -----------------------------------------------------------------------

  const refreshCacheStats = useCallback(async () => {
    try {
      const stats = await getCacheStats();
      setCacheSize(stats.total_size_bytes);
      updateWizardData({
        cacheSizeMb: Math.round((stats.total_size_bytes / (1024 * 1024)) * 10) / 10,
        coverArtFound: stats.covers_count,
      });
    } catch {
      // non-critical
    }
  }, [updateWizardData]);

  useEffect(() => {
    if (isComplete) {
      void refreshCacheStats();
    }
  }, [isComplete, refreshCacheStats]);

  // Also refresh cache stats on unmount
  useEffect(() => {
    return () => {
      void refreshCacheStats();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -----------------------------------------------------------------------
  // Derived values
  // -----------------------------------------------------------------------

  const fetched = progress?.fetched ?? 0;
  const total = progress?.total ?? wizardData.gamesFound;
  const percent = total > 0 ? Math.round((fetched / total) * 100) : 0;
  const isFetching = fetchStartedRef.current && !isComplete && total > 0;

  // -----------------------------------------------------------------------
  // Empty state
  // -----------------------------------------------------------------------

  if (wizardData.gamesFound <= 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <h2 className="text-2xl font-bold text-text-primary">Fetch Game Metadata</h2>
        <p className="text-sm text-text-secondary mt-2">
          Download cover art, descriptions, and details for your games.
        </p>
        <div className="mt-16 text-center text-sm text-text-dim">
          No games to enrich. Continue to finish setup.
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header */}
      <h2 className="text-2xl font-bold text-text-primary">Fetch Game Metadata</h2>
      <p className="text-sm text-text-secondary mt-2">
        Download cover art, descriptions, and details for your games.
      </p>

      {/* Progress card */}
      <div className="mt-8 rounded-lg border border-ghost bg-surface p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-base font-semibold text-text-primary">
              {isComplete
                ? fetched === 0 && total === 0
                  ? 'No games need metadata — all set!'
                  : 'Complete!'
                : isFetching
                  ? 'Fetching metadata...'
                  : 'Starting...'}
            </p>
            <p className="text-sm text-text-secondary mt-1">
              {fetched} of {total} games processed
            </p>
          </div>
          <span className="text-sm font-mono text-accent">{percent}%</span>
        </div>
        <div className="mt-4">
          <ProgressBar value={percent} />
        </div>
        {progress?.current_game && !isComplete && (
          <p className="mt-2 text-xs text-text-dim truncate">
            Currently: {progress.current_game}
          </p>
        )}
      </div>

      {/* Live preview */}
      {recentGames.length > 0 && (
        <motion.div
          className="mt-6 flex gap-4 overflow-x-auto pb-1"
          variants={staggerContainer}
          initial="hidden"
          animate="show"
        >
          {recentGames.map((gameName) => (
            <motion.div
              key={gameName}
              variants={shouldReduceMotion ? reducedStaggerItem : staggerItem}
              className="flex-shrink-0 w-28"
            >
              <div className="bg-deep rounded-md aspect-[3/4] w-full" />
              <p className="text-xs text-text-primary mt-1.5 truncate" title={gameName}>
                {gameName}
              </p>
              <p className="text-[10px] text-success">Processed</p>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Stats summary */}
      <motion.div
        className="mt-6 flex gap-3 justify-center flex-wrap"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        {[
          { label: 'Processed', value: fetched, colorClass: 'text-success' },
          { label: 'Cover Art', value: wizardData.coverArtFound, colorClass: 'text-accent' },
          { label: 'Remaining', value: Math.max(0, total - fetched), colorClass: 'text-warning' },
          { label: 'Cache Size', value: formatBytes(cacheSize), colorClass: 'text-text-secondary' },
        ].map((stat) => (
          <motion.div
            key={stat.label}
            variants={shouldReduceMotion ? reducedStaggerItem : staggerItem}
          >
            <StatCard label={stat.label} value={stat.value} colorClass={stat.colorClass} />
          </motion.div>
        ))}
      </motion.div>

      {/* Background note */}
      <p className="mt-6 text-xs text-text-dim text-center">
        You can continue to the app — metadata will keep downloading in the background.
      </p>
    </div>
  );
}
