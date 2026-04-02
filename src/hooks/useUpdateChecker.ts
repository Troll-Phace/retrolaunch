/**
 * Update checker hook and utilities.
 *
 * Wraps the Tauri updater plugin to provide a React-friendly interface for
 * checking, downloading, and installing application updates.
 */

import { useState, useCallback, useRef } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UpdateState {
  checking: boolean;
  updateAvailable: boolean;
  updateVersion: string | null;
  updateNotes: string | null;
  downloading: boolean;
  downloadProgress: number; // 0-100
  error: string | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useUpdateChecker() {
  const [state, setState] = useState<UpdateState>({
    checking: false,
    updateAvailable: false,
    updateVersion: null,
    updateNotes: null,
    downloading: false,
    downloadProgress: 0,
    error: null,
  });

  const updateRef = useRef<Awaited<ReturnType<typeof check>> | null>(null);

  const checkForUpdate = useCallback(async (silent = false) => {
    console.log('[updater] Checking for updates...');
    setState((prev) => ({ ...prev, checking: true, error: null }));
    try {
      const update = await check();
      if (update) {
        console.log('[updater] Update available:', update.version);
        updateRef.current = update;
        setState((prev) => ({
          ...prev,
          checking: false,
          updateAvailable: true,
          updateVersion: update.version,
          updateNotes: update.body ?? null,
        }));
        return true;
      }
      setState((prev) => ({ ...prev, checking: false, updateAvailable: false }));
      return false;
    } catch (err) {
      console.error('[updater] Check failed:', err);
      if (!silent) {
        setState((prev) => ({
          ...prev,
          checking: false,
          error: err instanceof Error ? err.message : 'Failed to check for updates',
        }));
      } else {
        setState((prev) => ({ ...prev, checking: false }));
      }
      return false;
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    const update = updateRef.current;
    if (!update) return;

    setState((prev) => ({ ...prev, downloading: true, downloadProgress: 0, error: null }));
    console.log('[updater] Starting download and install...');

    try {
      let totalLength = 0;
      let downloaded = 0;

      await update.downloadAndInstall((event) => {
        console.log('[updater] Event:', event.event, event.data);
        if (event.event === 'Started' && event.data.contentLength) {
          totalLength = event.data.contentLength;
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          if (totalLength > 0) {
            setState((prev) => ({
              ...prev,
              downloadProgress: Math.round((downloaded / totalLength) * 100),
            }));
          }
        } else if (event.event === 'Finished') {
          setState((prev) => ({ ...prev, downloadProgress: 100 }));
        }
      });

      await relaunch();
    } catch (err) {
      console.error('[updater] Download/install failed:', err);
      console.error('[updater] Error type:', typeof err, 'Is Error:', err instanceof Error);
      if (err instanceof Error) {
        console.error('[updater] Error stack:', err.stack);
      }
      const errorMessage = err instanceof Error
        ? err.message
        : typeof err === 'string'
          ? err
          : JSON.stringify(err);
      setState((prev) => ({
        ...prev,
        downloading: false,
        error: `Update failed: ${errorMessage}`,
      }));
    }
  }, []);

  return {
    ...state,
    checkForUpdate,
    downloadAndInstall,
  };
}

// ---------------------------------------------------------------------------
// Imperative helper — for background checks outside of React render cycle
// ---------------------------------------------------------------------------

export async function checkForUpdateSilently(): Promise<{
  available: boolean;
  version?: string;
  downloadAndInstall?: () => Promise<void>;
} | null> {
  console.log('[updater] Silent check...');
  try {
    const update = await check();
    if (update) {
      return {
        available: true,
        version: update.version,
        downloadAndInstall: async () => {
          await update.downloadAndInstall();
          await relaunch();
        },
      };
    }
    return { available: false };
  } catch (err) {
    console.error('[updater] Silent check failed:', err);
    return null; // silently fail
  }
}
