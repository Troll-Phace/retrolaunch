/**
 * Onboarding step 2 — ROM Directories.
 *
 * Allows the user to add ROM directories via drag-and-drop or browse dialog,
 * scans them for games, and displays detected systems with game counts.
 */

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { ProgressBar } from '@/components/ProgressBar';
import {
  addWatchedDirectory,
  cleanupOrphanedGames,
  getGames,
  getSystems,
  getWatchedDirectories,
  removeWatchedDirectory,
  scanDirectories,
} from '@/services/api';
import { useTauriEvent } from '@/hooks/useTauriEvent';
import { useScanProgress } from '../hooks/useScanProgress';
import {
  staggerContainer,
  springPopItem,
  reducedSpringPopItem,
} from '../animations';
import type { WizardData } from '../hooks/useOnboardingState';
import type { System, WatchedDirectory } from '@/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RomDirectoriesStepProps {
  wizardData: WizardData;
  updateWizardData: (partial: Partial<WizardData>) => void;
}

// ---------------------------------------------------------------------------
// Inline SVG icons
// ---------------------------------------------------------------------------

function PlusIcon() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

function TrashIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2.5 7.5L5.5 10.5L11.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" fill="none" className="animate-spin" aria-hidden="true">
      <path d="M7 1a6 6 0 0 1 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Directory row within the step
// ---------------------------------------------------------------------------

interface DirRowProps {
  directory: WatchedDirectory;
  isScanning: boolean;
  scanFilesFound: number;
  onRemove: (id: number) => void;
}

function DirRow({ directory, isScanning, scanFilesFound, onRemove }: DirRowProps) {
  const scanned = directory.last_scanned_at !== null;

  return (
    <div className="rounded-lg border border-ghost bg-surface p-4">
      <div className="flex items-center gap-3">
        <div className="text-text-secondary flex-shrink-0">
          <FolderIcon />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-mono text-text-primary truncate" title={directory.path}>
            {directory.path}
          </p>
          <div className="mt-1 text-xs">
            {isScanning ? (
              <span className="text-warning inline-flex items-center gap-1.5">
                <SpinnerIcon />
                Scanning... {scanFilesFound} files found
              </span>
            ) : scanned ? (
              <span className="text-success inline-flex items-center gap-1.5">
                <CheckIcon />
                Found {directory.game_count} game{directory.game_count !== 1 ? 's' : ''}
              </span>
            ) : (
              <span className="text-text-dim">Pending scan</span>
            )}
          </div>
        </div>
        <Button
          variant="icon"
          size="sm"
          onClick={() => onRemove(directory.id)}
          aria-label="Remove directory"
          title="Remove"
          className="hover:text-error flex-shrink-0"
        >
          <TrashIcon />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main step component
// ---------------------------------------------------------------------------

export function RomDirectoriesStep({ wizardData: _wizardData, updateWizardData }: RomDirectoriesStepProps) {
  const shouldReduceMotion = useReducedMotion();
  const [directories, setDirectories] = useState<WatchedDirectory[]>([]);
  const [systems, setSystems] = useState<System[]>([]);
  const [gameCounts, setGameCounts] = useState<Record<string, number>>({});
  const [isDragOver, setIsDragOver] = useState(false);
  const [adding, setAdding] = useState(false);

  const { progress, isScanning } = useScanProgress();

  // -----------------------------------------------------------------------
  // Data fetching helpers
  // -----------------------------------------------------------------------

  const refreshDirectories = useCallback(async () => {
    try {
      const dirs = await getWatchedDirectories();
      setDirectories(dirs);
      return dirs;
    } catch {
      return [];
    }
  }, []);

  const refreshSystemsAndGames = useCallback(async (dirs?: WatchedDirectory[]) => {
    try {
      const [allSystems, allGames] = await Promise.all([
        getSystems(),
        getGames({ limit: 50000 }),
      ]);

      // Filter games to only those whose path belongs to a currently-watched directory.
      // This avoids counting orphaned records from previous sessions or removed directories.
      const activeDirs = dirs ?? directories;
      const filteredGames = allGames.filter((game) =>
        activeDirs.some((dir) => game.rom_path.startsWith(dir.path)),
      );

      // Only include systems that have games
      const counts: Record<string, number> = {};
      for (const game of filteredGames) {
        counts[game.system_id] = (counts[game.system_id] ?? 0) + 1;
      }

      const detectedSystems = allSystems.filter((s) => (counts[s.id] ?? 0) > 0);
      setSystems(detectedSystems);
      setGameCounts(counts);

      // Update wizard data
      updateWizardData({
        gamesFound: filteredGames.length,
        systemsDetected: detectedSystems.map((s) => s.id),
      });
    } catch {
      // non-critical
    }
  }, [directories, updateWizardData]);

  // Load initial data
  useEffect(() => {
    void cleanupOrphanedGames()
      .catch(() => { /* non-critical */ })
      .then(() => refreshDirectories())
      .then((dirs) => {
        updateWizardData({ directoriesAdded: dirs.length });
        void refreshSystemsAndGames(dirs);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch after scan completes
  useTauriEvent('scan-complete', () => {
    void refreshDirectories().then((dirs) => {
      updateWizardData({ directoriesAdded: dirs.length });
      void refreshSystemsAndGames(dirs);
    });
  });

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const addAndScan = useCallback(
    async (path: string) => {
      try {
        await addWatchedDirectory(path);
        const dirs = await refreshDirectories();
        updateWizardData({ directoriesAdded: dirs.length });
        void scanDirectories([path]);
      } catch (err: unknown) {
        console.error('Failed to add directory:', err);
      }
    },
    [refreshDirectories, updateWizardData],
  );

  const handleBrowse = useCallback(async () => {
    setAdding(true);
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === 'string') {
        await addAndScan(selected);
      }
    } catch {
      // Dialog not available
    } finally {
      setAdding(false);
    }
  }, [addAndScan]);

  const handleRemove = useCallback(
    async (id: number) => {
      try {
        await removeWatchedDirectory(id);
        const dirs = await refreshDirectories();
        updateWizardData({ directoriesAdded: dirs.length });
        void refreshSystemsAndGames(dirs);
      } catch (err: unknown) {
        console.error('Failed to remove directory:', err);
      }
    },
    [refreshDirectories, refreshSystemsAndGames, updateWizardData],
  );

  // Drag-drop events
  useTauriEvent<{ paths: string[] }>('tauri://drag-drop', async (payload) => {
    setIsDragOver(false);
    if (payload.paths && payload.paths.length > 0) {
      for (const path of payload.paths) {
        await addAndScan(path);
      }
    }
  });

  useTauriEvent<unknown>('tauri://drag-enter', () => {
    setIsDragOver(true);
  });

  useTauriEvent<unknown>('tauri://drag-leave', () => {
    setIsDragOver(false);
  });

  // -----------------------------------------------------------------------
  // Derived values
  // -----------------------------------------------------------------------

  const totalGames = Object.values(gameCounts).reduce((sum, c) => sum + c, 0);
  const scanPercent =
    isScanning && progress ? Math.round((progress.scanned / Math.max(progress.total, 1)) * 100) : 0;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header */}
      <h2 className="text-2xl font-bold text-text-primary">Where are your ROMs?</h2>
      <p className="text-sm text-text-secondary mt-2">
        Add the folders where your game files are stored. We'll scan them to find your games.
      </p>

      {/* Drop zone */}
      <motion.button
        type="button"
        onClick={handleBrowse}
        disabled={adding}
        aria-label="Add ROM directory"
        className={`mt-8 w-full rounded-lg border-2 border-dashed p-10 text-center cursor-pointer transition-colors duration-200 ${
          isDragOver
            ? 'border-accent bg-accent/5 text-accent'
            : 'border-ghost hover:border-ghost-lit text-text-secondary hover:text-text-primary'
        }`}
        animate={
          shouldReduceMotion
            ? {}
            : isDragOver
              ? { scale: 1.01, borderColor: 'var(--accent)' }
              : directories.length === 0
                ? { borderColor: ['var(--ghost)', 'var(--ghost-lit)', 'var(--ghost)'], scale: 1 }
                : { scale: 1 }
        }
        transition={
          shouldReduceMotion
            ? { duration: 0.15 }
            : directories.length === 0 && !isDragOver
              ? { borderColor: { duration: 2, repeat: Infinity, ease: 'easeInOut' }, duration: 0.2, ease: 'easeOut' }
              : { duration: 0.2, ease: 'easeOut' }
        }
      >
        <div className="flex flex-col items-center gap-3">
          <PlusIcon />
          <span className="text-sm font-medium">
            {adding
              ? 'Opening...'
              : isDragOver
                ? 'Drop folders here'
                : 'Drop folders here or click to browse'}
          </span>
        </div>
      </motion.button>

      {/* Directory list */}
      {directories.length > 0 && (
        <div className="mt-6 space-y-3">
          <AnimatePresence mode="popLayout">
            {directories.map((dir) => (
              <motion.div
                key={dir.id}
                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
                animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                transition={
                  shouldReduceMotion
                    ? { duration: 0.15 }
                    : { duration: 0.3, ease: 'easeOut' }
                }
                layout={!shouldReduceMotion}
              >
                <DirRow
                  directory={dir}
                  isScanning={isScanning && progress?.current_file?.startsWith(dir.path) === true}
                  scanFilesFound={
                    isScanning && progress
                      ? Object.values(progress.systems_found).reduce((s, c) => s + c, 0)
                      : 0
                  }
                  onRemove={handleRemove}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Scan progress bar */}
      {isScanning && (
        <div className="mt-4">
          <ProgressBar value={scanPercent} />
          {progress?.current_file && (
            <p className="mt-1.5 text-xs text-text-dim truncate">
              Scanning: {progress.current_file}
            </p>
          )}
        </div>
      )}

      {/* Detected systems */}
      {systems.length > 0 && (
        <motion.div
          className="mt-6"
          variants={staggerContainer}
          initial="hidden"
          animate="show"
        >
          <div className="flex flex-wrap gap-2">
            {systems.map((sys) => (
              <motion.div
                key={sys.id}
                variants={shouldReduceMotion ? reducedSpringPopItem : springPopItem}
              >
                <Badge
                  label={`${sys.name} (${gameCounts[sys.id] ?? 0})`}
                  color={sys.theme_color ?? undefined}
                />
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Summary line */}
      {totalGames > 0 && (
        <p className="mt-4 text-sm text-text-secondary">
          {totalGames} game{totalGames !== 1 ? 's' : ''} detected across {systems.length} system
          {systems.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}
