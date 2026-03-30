/**
 * ROM Directories panel — manage watched directories, add/remove, rescan,
 * drag-and-drop support.
 */

import { useCallback, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { Button } from "@/components/Button";
import {
  addWatchedDirectory,
  removeWatchedDirectory,
  scanDirectories,
} from "@/services/api";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import type { WatchedDirectory } from "@/types";


export interface RomDirectoriesPanelProps {
  directories: WatchedDirectory[];
  onRefresh: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(dateString: string | null): string {
  if (!dateString) return "Never";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes !== 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
  return new Date(dateString).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Inline SVG icons
// ---------------------------------------------------------------------------

function FolderOpenIcon() {
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

function RefreshIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"
        stroke="currentColor"
        strokeWidth="2"
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

function PlusIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Directory row
// ---------------------------------------------------------------------------

interface DirectoryRowProps {
  directory: WatchedDirectory;
  onRescan: (path: string) => Promise<void>;
  onRemove: (id: number) => Promise<void>;
}

function DirectoryRow({ directory, onRescan, onRemove }: DirectoryRowProps) {
  const [rescanning, setRescanning] = useState(false);
  const [removing, setRemoving] = useState(false);

  const handleRescan = useCallback(async () => {
    setRescanning(true);
    try {
      await onRescan(directory.path);
    } catch {
      // handled by parent
    } finally {
      setRescanning(false);
    }
  }, [directory.path, onRescan]);

  const handleRemove = useCallback(async () => {
    setRemoving(true);
    try {
      await onRemove(directory.id);
    } catch {
      // handled by parent
    } finally {
      setRemoving(false);
    }
  }, [directory.id, onRemove]);

  return (
    <div className="rounded-lg border border-ghost bg-surface p-4 transition-colors duration-200 hover:border-ghost-lit">
      <div className="flex items-center gap-3">
        <div className="text-text-secondary flex-shrink-0">
          <FolderOpenIcon />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-mono text-text-primary truncate" title={directory.path}>
            {directory.path}
          </p>
          <div className="flex items-center gap-3 mt-1 text-xs text-text-secondary">
            <span>
              <span className="font-mono text-text-primary">{directory.game_count}</span> games
            </span>
            <span aria-hidden="true">&middot;</span>
            <span>Scanned {timeAgo(directory.last_scanned_at)}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="icon"
            size="sm"
            onClick={handleRescan}
            disabled={rescanning}
            aria-label="Rescan directory"
            title="Rescan"
          >
            <span className={rescanning ? "animate-spin" : ""}>
              <RefreshIcon />
            </span>
          </Button>
          <Button
            variant="icon"
            size="sm"
            onClick={handleRemove}
            disabled={removing}
            aria-label="Remove directory"
            title="Remove"
            className="hover:text-error"
          >
            <TrashIcon />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function RomDirectoriesPanel({
  directories,
  onRefresh,
}: RomDirectoriesPanelProps) {
  const shouldReduceMotion = useReducedMotion();
  const [isDragOver, setIsDragOver] = useState(false);
  const [adding, setAdding] = useState(false);

  const handleAddDirectory = useCallback(async () => {
    setAdding(true);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === "string") {
        await addWatchedDirectory(selected);
        onRefresh();
      }
    } catch {
      // Dialog plugin not available
    } finally {
      setAdding(false);
    }
  }, [onRefresh]);

  const handleRescan = useCallback(
    async (path: string) => {
      try {
        await scanDirectories([path]);
      } catch (err: unknown) {
        console.error("Rescan failed:", err);
      } finally {
        onRefresh();
      }
    },
    [onRefresh]
  );

  const handleRemove = useCallback(
    async (id: number) => {
      try {
        await removeWatchedDirectory(id);
        onRefresh();
      } catch (err: unknown) {
        console.error("Remove failed:", err);
      }
    },
    [onRefresh]
  );

  // Listen for Tauri drag-drop events
  useTauriEvent<{ paths: string[] }>("tauri://drag-drop", async (payload) => {
    setIsDragOver(false);
    if (payload.paths && payload.paths.length > 0) {
      for (const path of payload.paths) {
        try {
          await addWatchedDirectory(path);
        } catch (err: unknown) {
          console.error("Failed to add directory:", err);
        }
      }
      onRefresh();
    }
  });

  useTauriEvent<unknown>("tauri://drag-enter", () => {
    setIsDragOver(true);
  });

  useTauriEvent<unknown>("tauri://drag-leave", () => {
    setIsDragOver(false);
  });

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold text-text-primary">ROM Directories</h2>
      <p className="text-sm text-text-secondary mt-1">
        Manage folders where your ROM files are stored. RetroLaunch will scan
        these directories for games.
      </p>

      {/* Directory list */}
      <div className="mt-6 space-y-3">
        {directories.map((dir) => (
          <DirectoryRow
            key={dir.id}
            directory={dir}
            onRescan={handleRescan}
            onRemove={handleRemove}
          />
        ))}

        {directories.length === 0 && (
          <div className="py-8 text-center text-sm text-text-dim">
            No directories added yet. Add a directory below to get started.
          </div>
        )}
      </div>

      {/* Add directory area */}
      <div className="mt-6">
        <motion.button
          type="button"
          onClick={handleAddDirectory}
          disabled={adding}
          aria-label="Add ROM directory"
          className={`w-full rounded-lg border-2 border-dashed p-8 text-center cursor-pointer ${
            isDragOver
              ? "border-accent bg-accent/5 text-accent"
              : "border-ghost hover:border-ghost-lit text-text-secondary hover:text-text-primary"
          }`}
          animate={
            shouldReduceMotion
              ? {}
              : isDragOver
                ? { scale: 1.01, borderColor: "var(--accent)" }
                : { scale: 1, borderColor: "var(--border)" }
          }
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          <div className="flex flex-col items-center gap-2">
            <PlusIcon />
            <span className="text-sm font-medium">
              {adding
                ? "Opening..."
                : isDragOver
                  ? "Drop folders here"
                  : "Drop folders here or click to browse"}
            </span>
          </div>
        </motion.button>
      </div>
    </div>
  );
}
