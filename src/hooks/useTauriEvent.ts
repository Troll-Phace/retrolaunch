/**
 * React hook that subscribes to a Tauri event and automatically
 * unsubscribes when the component unmounts.
 *
 * @example
 * ```tsx
 * useTauriEvent<ScanProgress>('scan-progress', (payload) => {
 *   setProgress(payload);
 * });
 * ```
 */

import { useEffect, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { UnlistenFn } from '@tauri-apps/api/event';

/**
 * Subscribes to a Tauri event for the current window and cleans up on unmount.
 *
 * Uses a ref to hold the latest callback so the event listener does not need
 * to be re-registered when the callback reference changes.
 *
 * @param event - The Tauri event name to listen for.
 * @param callback - Handler invoked with the event payload (already unwrapped).
 */
export function useTauriEvent<T>(event: string, callback: (payload: T) => void): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let cancelled = false;

    getCurrentWindow()
      .listen<T>(event, (e) => callbackRef.current(e.payload))
      .then((fn) => {
        if (cancelled) {
          // Component unmounted before the listener was registered.
          fn();
        } else {
          unlisten = fn;
        }
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [event]);
}
