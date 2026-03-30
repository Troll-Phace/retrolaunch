/**
 * Metadata & APIs panel — credential management for IGDB and ScreenScraper.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { fetchMetadata, setPreference } from "@/services/api";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import type { MetadataProgress } from "@/types";

export interface MetadataApisPanelProps {
  preferences: Record<string, string>;
  onRefresh: () => void;
}

// ---------------------------------------------------------------------------
// Credential card
// ---------------------------------------------------------------------------

interface CredentialField {
  key: string;
  label: string;
  type: "text" | "password";
  placeholder: string;
}

interface CredentialCardProps {
  title: string;
  description: string;
  fields: CredentialField[];
  preferences: Record<string, string>;
  onRefresh: () => void;
}

function CredentialCard({
  title,
  description,
  fields,
  preferences,
  onRefresh,
}: CredentialCardProps) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of fields) {
      initial[field.key] = preferences[field.key] ?? "";
    }
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleChange = useCallback((key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      for (const field of fields) {
        await setPreference(field.key, values[field.key] ?? "");
      }
      onRefresh();
      setSaved(true);
      // Clear saved feedback after 3 seconds
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      console.error("Failed to save credentials:", err);
    } finally {
      setSaving(false);
    }
  }, [fields, values, onRefresh]);

  return (
    <div className="rounded-lg border border-ghost bg-surface p-5">
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      <p className="text-xs text-text-secondary mt-1">{description}</p>

      <div className="mt-4 space-y-3">
        {fields.map((field) => (
          <div key={field.key}>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              {field.label}
            </label>
            <Input
              variant="form"
              type={field.type}
              placeholder={field.placeholder}
              value={values[field.key] ?? ""}
              onChange={(e) => handleChange(field.key, e.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button variant="secondary" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
        {saved && (
          <span className="text-xs text-success font-medium">
            Saved successfully
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fetch metadata card
// ---------------------------------------------------------------------------

function FetchMetadataCard() {
  const [fetching, setFetching] = useState(false);
  const [progress, setProgress] = useState<MetadataProgress | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(resultTimerRef.current), []);

  useTauriEvent<MetadataProgress>("metadata-progress", (payload) => {
    setProgress(payload);
  });

  const handleFetch = useCallback(async () => {
    setFetching(true);
    setProgress(null);
    setResult(null);
    try {
      await fetchMetadata({ game_ids: [] });
      setResult(
        progress
          ? `Fetched metadata for ${progress.total} game${progress.total === 1 ? "" : "s"}`
          : "Metadata fetch complete"
      );
      clearTimeout(resultTimerRef.current);
      resultTimerRef.current = setTimeout(() => setResult(null), 5000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setResult(`Error: ${msg}`);
    } finally {
      setFetching(false);
      setProgress(null);
    }
  }, [progress]);

  const pct =
    progress && progress.total > 0
      ? Math.round((progress.fetched / progress.total) * 100)
      : 0;

  return (
    <div className="rounded-lg border border-ghost bg-surface p-5">
      <h3 className="text-sm font-semibold text-text-primary">
        Fetch Metadata
      </h3>
      <p className="text-xs text-text-secondary mt-1">
        Download cover art, screenshots, and game info for all games that don't
        have metadata yet. Requires at least one API configured above.
      </p>

      <div className="mt-4 flex items-center gap-3">
        <Button
          variant="primary"
          size="sm"
          onClick={handleFetch}
          disabled={fetching}
        >
          {fetching ? "Fetching..." : "Fetch All Missing Metadata"}
        </Button>
        {result && (
          <span
            className={`text-xs font-medium ${
              result.startsWith("Error") ? "text-error" : "text-success"
            }`}
          >
            {result}
          </span>
        )}
      </div>

      {fetching && progress && (
        <div className="mt-3 space-y-1">
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span className="truncate max-w-[70%]">
              {progress.current_game}
            </span>
            <span className="font-mono">
              {progress.fetched}/{progress.total} ({pct}%)
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-elevated overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent to-accent-light transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

const IGDB_FIELDS: CredentialField[] = [
  {
    key: "igdb_client_id",
    label: "Client ID",
    type: "text",
    placeholder: "Your Twitch Client ID",
  },
  {
    key: "igdb_client_secret",
    label: "Client Secret",
    type: "password",
    placeholder: "Your Twitch Client Secret",
  },
];

const SCREENSCRAPER_FIELDS: CredentialField[] = [
  {
    key: "ss_dev_id",
    label: "Developer ID",
    type: "text",
    placeholder: "ScreenScraper Dev ID",
  },
  {
    key: "ss_dev_password",
    label: "Developer Password",
    type: "password",
    placeholder: "ScreenScraper Dev Password",
  },
  {
    key: "ss_username",
    label: "Username",
    type: "text",
    placeholder: "ScreenScraper Username",
  },
  {
    key: "ss_password",
    label: "Password",
    type: "password",
    placeholder: "ScreenScraper Password",
  },
];

export function MetadataApisPanel({
  preferences,
  onRefresh,
}: MetadataApisPanelProps) {
  return (
    <div className="p-6">
      <h2 className="text-xl font-bold text-text-primary">Metadata & APIs</h2>
      <p className="text-sm text-text-secondary mt-1">
        Configure API credentials for fetching game metadata, cover art, and
        screenshots.
      </p>

      <div className="mt-6 space-y-4">
        <CredentialCard
          title="IGDB (Twitch)"
          description="Required for game metadata, cover art, and screenshots. Get credentials from the Twitch Developer Console."
          fields={IGDB_FIELDS}
          preferences={preferences}
          onRefresh={onRefresh}
        />

        <CredentialCard
          title="ScreenScraper"
          description="Alternative metadata source, especially useful for retro platforms and regional variants."
          fields={SCREENSCRAPER_FIELDS}
          preferences={preferences}
          onRefresh={onRefresh}
        />

        <FetchMetadataCard />
      </div>
    </div>
  );
}
