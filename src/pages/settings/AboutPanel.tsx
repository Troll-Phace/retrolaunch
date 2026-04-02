/**
 * About panel — app info, version, tech stack credits, and debug reset.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getVersion } from "@tauri-apps/api/app";

import { resetToFresh } from "@/services/api";
import { useAppStore } from "@/store";
import { useUpdateChecker } from "@/hooks/useUpdateChecker";
import { PatchNotes } from "./PatchNotes";

export function AboutPanel() {
  const navigate = useNavigate();
  const addToast = useAppStore((s) => s.addToast);

  const [showConfirm, setShowConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const [appVersion, setAppVersion] = useState("0.1.0");
  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

  const {
    checking,
    updateAvailable,
    updateVersion,
    downloading,
    downloadProgress,
    error: updateError,
    checkForUpdate,
    downloadAndInstall,
  } = useUpdateChecker();

  async function handleReset() {
    setResetting(true);
    setResetError(null);
    try {
      await resetToFresh();
      useAppStore.getState().resetStore();
      navigate("/");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "An unknown error occurred.";
      setResetError(message);
      addToast({ type: "error", message: `Reset failed: ${message}` });
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold text-text-primary">About</h2>
      <p className="text-sm text-text-secondary mt-1">
        Application information and credits.
      </p>

      <div className="mt-8 flex justify-center">
        <div className="w-full max-w-md rounded-lg bg-surface border border-ghost p-8 text-center">
          {/* App icon placeholder */}
          <div className="mx-auto w-16 h-16 rounded-xl bg-gradient-to-br from-accent to-accent-light flex items-center justify-center mb-4">
            <svg width={32} height={32} viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"
                fill="white"
                stroke="white"
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <h3 className="text-2xl font-extrabold text-text-primary tracking-tight">
            RetroLaunch
          </h3>
          <p className="mt-1 text-sm text-text-secondary">
            Version <span className="font-mono text-text-primary">{appVersion}</span>
          </p>

          {/* Update checker */}
          <div className="mt-3">
            {!updateAvailable && !checking && !downloading && (
              <button
                type="button"
                onClick={() => checkForUpdate()}
                className="text-xs text-accent hover:text-accent-light transition-colors"
              >
                Check for Updates
              </button>
            )}
            {checking && (
              <p className="text-xs text-text-secondary">Checking for updates...</p>
            )}
            {updateAvailable && !downloading && (
              <div>
                <p className="text-xs text-accent">Update available: v{updateVersion}</p>
                <button
                  type="button"
                  onClick={downloadAndInstall}
                  className="mt-1 rounded-md bg-accent/15 border border-accent/50 px-3 py-1 text-xs font-semibold text-accent transition-colors hover:bg-accent/25"
                >
                  Download &amp; Install
                </button>
              </div>
            )}
            {downloading && (
              <div className="mt-1">
                <p className="text-xs text-text-secondary">
                  Downloading update... {downloadProgress}%
                </p>
                <div className="mt-1 h-1 w-32 mx-auto rounded-full bg-surface-hover overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all duration-300"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
              </div>
            )}
            {updateError && (
              <p className="text-xs text-red-400 mt-1">{updateError}</p>
            )}
          </div>

          <p className="mt-4 text-sm text-text-secondary leading-relaxed">
            A visually stunning, platform-agnostic front-end launcher for retro
            game emulation. Scan your ROM library, fetch metadata, and launch
            games with a single click.
          </p>

          <div className="mt-6 border-t border-ghost pt-5">
            <span className="text-xs font-semibold uppercase tracking-widest text-text-secondary">
              Built With
            </span>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {["Tauri 2", "React 18", "Rust", "TypeScript", "Tailwind CSS", "SQLite"].map(
                (tech) => (
                  <span
                    key={tech}
                    className="inline-flex items-center rounded-full px-3 py-1 text-[10px] font-semibold leading-none border border-accent/50 bg-accent/15 text-accent"
                  >
                    {tech}
                  </span>
                )
              )}
            </div>
          </div>

          <p className="mt-6 text-xs text-text-dim">
            Made with care for the retro gaming community.
          </p>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Patch Notes section                                                 */}
      {/* ------------------------------------------------------------------ */}
      <div className="mt-10">
        <PatchNotes />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Debug / Reset section                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="mt-10">
        <h3 className="text-lg font-bold text-text-primary">Debug</h3>
        <p className="text-sm text-text-secondary mt-1">
          Development and troubleshooting utilities.
        </p>

        <div className="mt-4 rounded-lg bg-surface border border-ghost p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-text-primary">
                Start Fresh
              </p>
              <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                Purge all data and return to the onboarding wizard. This is
                intended for debugging and testing.
              </p>
            </div>

            {!showConfirm && (
              <button
                type="button"
                onClick={() => {
                  setShowConfirm(true);
                  setResetError(null);
                }}
                className="shrink-0 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
              >
                Reset Everything
              </button>
            )}
          </div>

          {showConfirm && (
            <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/5 p-4">
              <p className="text-sm text-red-300 leading-relaxed">
                Are you sure? This will delete all games, emulator configs,
                cached images, and preferences. This action cannot be undone.
              </p>

              {resetError && (
                <p className="mt-2 text-xs text-red-400">{resetError}</p>
              )}

              <div className="mt-3 flex gap-3">
                <button
                  type="button"
                  disabled={resetting}
                  onClick={handleReset}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
                >
                  {resetting ? "Resetting..." : "Yes, delete everything"}
                </button>
                <button
                  type="button"
                  disabled={resetting}
                  onClick={() => {
                    setShowConfirm(false);
                    setResetError(null);
                  }}
                  className="rounded-md border border-ghost px-4 py-2 text-sm font-semibold text-text-secondary transition-colors hover:text-text-primary hover:border-text-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
