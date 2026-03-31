/**
 * No-Intro DAT management panel — import DAT files per system, view status,
 * remove, and re-match the library against imported DATs.
 */

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/Button";
import {
  getDatFiles,
  importDatFile,
  removeDatFile,
  rematchNointro,
} from "@/services/api";
import type { DatFile, System } from "@/types";

export interface NoIntroPanelProps {
  systems: System[];
  onRefresh: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Inline SVG icons
// ---------------------------------------------------------------------------

function UploadIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"
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

function CheckCircleIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M22 11.08V12a10 10 0 1 1-5.93-9.14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M22 4L12 14.01l-3-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// System row
// ---------------------------------------------------------------------------

interface SystemRowProps {
  system: System;
  datFile: DatFile | undefined;
  importing: boolean;
  onImport: (systemId: string) => void;
  onRemove: (systemId: string) => void;
}

function SystemRow({ system, datFile, importing, onImport, onRemove }: SystemRowProps) {
  const [confirmRemove, setConfirmRemove] = useState(false);

  const handleRemove = useCallback(() => {
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    setConfirmRemove(false);
    onRemove(system.id);
  }, [confirmRemove, onRemove, system.id]);

  // Reset confirmation after a delay
  useEffect(() => {
    if (!confirmRemove) return;
    const timer = setTimeout(() => setConfirmRemove(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmRemove]);

  return (
    <div className="rounded-lg border border-ghost bg-surface p-4 transition-colors duration-200 hover:border-ghost-lit">
      <div className="flex items-center gap-3">
        {/* Status indicator */}
        <div className="flex-shrink-0">
          {datFile ? (
            <span className="text-success">
              <CheckCircleIcon />
            </span>
          ) : (
            <span className="w-3.5 h-3.5 rounded-full border-2 border-ghost-lit block" />
          )}
        </div>

        {/* System info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-text-primary">{system.name}</p>
            <span className="text-xs text-text-dim font-mono">{system.short_name}</span>
          </div>

          {datFile ? (
            <div className="flex items-center gap-3 mt-1 text-xs text-text-secondary">
              <span className="truncate max-w-[200px]" title={datFile.file_name}>
                {datFile.file_name}
              </span>
              <span aria-hidden="true">&middot;</span>
              <span>
                <span className="font-mono text-text-primary">{datFile.entry_count.toLocaleString()}</span> entries
              </span>
              <span aria-hidden="true">&middot;</span>
              <span>Imported {formatDate(datFile.imported_at)}</span>
            </div>
          ) : (
            <p className="mt-1 text-xs text-text-dim">Not imported</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="icon"
            size="sm"
            onClick={() => onImport(system.id)}
            disabled={importing}
            aria-label={`Import DAT for ${system.name}`}
            title="Import DAT"
          >
            {importing ? (
              <span className="animate-spin">
                <RefreshIcon />
              </span>
            ) : (
              <UploadIcon />
            )}
          </Button>
          {datFile && (
            <Button
              variant="icon"
              size="sm"
              onClick={handleRemove}
              aria-label={`Remove DAT for ${system.name}`}
              title={confirmRemove ? "Click again to confirm" : "Remove DAT"}
              className={confirmRemove ? "text-error border-error/50" : "hover:text-error"}
            >
              <TrashIcon />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function NoIntroPanel({ systems, onRefresh }: NoIntroPanelProps) {
  const [datFiles, setDatFiles] = useState<DatFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState<string | null>(null);
  const [rematching, setRematching] = useState(false);
  const [rematchResult, setRematchResult] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDatFiles = useCallback(async () => {
    try {
      const dats = await getDatFiles();
      setDatFiles(dats);
    } catch (err: unknown) {
      console.error("Failed to load DAT files:", err);
      setError("Failed to load DAT files.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDatFiles();
  }, [loadDatFiles]);

  const handleImport = useCallback(
    async (systemId: string) => {
      setImporting(systemId);
      setError(null);
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const system = systems.find((s) => s.id === systemId);
        const selected = await open({
          title: `Select No-Intro DAT for ${system?.name ?? systemId}`,
          filters: [{ name: "DAT Files", extensions: ["dat", "xml"] }],
          multiple: false,
        });
        if (selected && typeof selected === "string") {
          await importDatFile(systemId, selected);
          await loadDatFiles();
          onRefresh();
        }
      } catch (err: unknown) {
        console.error("Import failed:", err);
        setError(`Failed to import DAT file: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setImporting(null);
      }
    },
    [systems, loadDatFiles, onRefresh]
  );

  const handleRemove = useCallback(
    async (systemId: string) => {
      setError(null);
      try {
        await removeDatFile(systemId);
        await loadDatFiles();
        onRefresh();
      } catch (err: unknown) {
        console.error("Remove failed:", err);
        setError(`Failed to remove DAT file: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [loadDatFiles, onRefresh]
  );

  const handleRematch = useCallback(async () => {
    setRematching(true);
    setRematchResult(null);
    setError(null);
    try {
      const count = await rematchNointro();
      setRematchResult(count);
      onRefresh();
    } catch (err: unknown) {
      console.error("Rematch failed:", err);
      setError(`Rematch failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRematching(false);
    }
  }, [onRefresh]);

  const datFileMap = new Map(datFiles.map((d) => [d.system_id, d]));
  const importedCount = datFiles.length;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-text-primary">ROM Verification</h2>
          <p className="text-sm text-text-secondary mt-1 max-w-xl">
            Import No-Intro DAT files to accurately identify your ROMs. Matched ROMs
            get their canonical names, improving metadata search accuracy.
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={handleRematch}
          disabled={rematching || importedCount === 0}
          className="flex-shrink-0"
        >
          <span className={`mr-2 ${rematching ? "animate-spin" : ""}`}>
            <RefreshIcon />
          </span>
          {rematching ? "Matching..." : "Re-match Library"}
        </Button>
      </div>

      {/* Rematch result */}
      {rematchResult !== null && (
        <div className="mt-4 rounded-lg border border-success/30 bg-success/5 px-4 py-3 text-sm text-success">
          <span className="font-mono font-bold">{rematchResult}</span>{" "}
          {rematchResult === 1 ? "game was" : "games were"} newly matched against No-Intro databases.
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="mt-4 rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      {/* Summary bar */}
      <div className="mt-6 flex items-center gap-2 text-xs text-text-secondary">
        <span className="font-mono text-text-primary">{importedCount}</span>
        <span>of</span>
        <span className="font-mono text-text-primary">{systems.length}</span>
        <span>systems have DAT files imported</span>
      </div>

      {/* System list */}
      <div className="mt-4 space-y-2">
        {loading ? (
          <div className="py-8 text-center text-sm text-text-dim">
            Loading DAT files...
          </div>
        ) : (
          systems.map((system) => (
            <SystemRow
              key={system.id}
              system={system}
              datFile={datFileMap.get(system.id)}
              importing={importing === system.id}
              onImport={handleImport}
              onRemove={handleRemove}
            />
          ))
        )}

        {!loading && systems.length === 0 && (
          <div className="py-8 text-center text-sm text-text-dim">
            No systems found. Add ROM directories first to detect systems.
          </div>
        )}
      </div>
    </div>
  );
}
