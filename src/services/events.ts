/**
 * Typed event listener wrappers for Tauri backend events.
 *
 * Each function subscribes to a specific Tauri event and returns an unlisten
 * function for cleanup. Event names match the strings passed to `app.emit()`
 * in the Rust backend.
 *
 * All functions are named exports — no default export.
 */

import { getCurrentWindow } from '@tauri-apps/api/window';
import type { UnlistenFn } from '@tauri-apps/api/event';
import type {
  Game,
  GameSessionEnded,
  MetadataProgress,
  ScanComplete,
  ScanProgress,
} from '@/types';

/**
 * Subscribes to ROM scan progress updates.
 *
 * Emitted repeatedly during `scan_directories` execution.
 * Event name: `scan-progress`
 */
export function onScanProgress(
  callback: (payload: ScanProgress) => void,
): Promise<UnlistenFn> {
  return getCurrentWindow().listen<ScanProgress>('scan-progress', (event) =>
    callback(event.payload),
  );
}

/**
 * Subscribes to the ROM scan completion event.
 *
 * Emitted once when `scan_directories` finishes.
 * Event name: `scan-complete`
 */
export function onScanComplete(
  callback: (payload: ScanComplete) => void,
): Promise<UnlistenFn> {
  return getCurrentWindow().listen<ScanComplete>('scan-complete', (event) =>
    callback(event.payload),
  );
}

/**
 * Subscribes to metadata fetch progress updates.
 *
 * Emitted repeatedly during `fetch_metadata` background execution.
 * Event name: `metadata-progress`
 */
export function onMetadataProgress(
  callback: (payload: MetadataProgress) => void,
): Promise<UnlistenFn> {
  return getCurrentWindow().listen<MetadataProgress>('metadata-progress', (event) =>
    callback(event.payload),
  );
}

/**
 * Subscribes to game session ended events.
 *
 * Emitted when the emulator process exits after `launch_game`.
 * Event name: `game-session-ended`
 */
export function onGameSessionEnded(
  callback: (payload: GameSessionEnded) => void,
): Promise<UnlistenFn> {
  return getCurrentWindow().listen<GameSessionEnded>('game-session-ended', (event) =>
    callback(event.payload),
  );
}

/**
 * Subscribes to new ROM detection events from the file system watcher.
 *
 * Emitted when the file watcher detects a new ROM in a watched directory.
 * Event name: `new-rom-detected`
 *
 * Note: Requires the file system watcher to be implemented and running.
 */
export function onNewRomDetected(
  callback: (payload: Game) => void,
): Promise<UnlistenFn> {
  return getCurrentWindow().listen<Game>('new-rom-detected', (event) =>
    callback(event.payload),
  );
}

/**
 * Subscribes to ROM removal events from the file system watcher.
 *
 * Emitted when the file watcher detects that a tracked ROM file has been
 * deleted or renamed. The payload is the `rom_path` string of the removed game.
 * Event name: `rom-removed`
 */
export function onRomRemoved(
  callback: (payload: string) => void,
): Promise<UnlistenFn> {
  return getCurrentWindow().listen<string>('rom-removed', (event) =>
    callback(event.payload),
  );
}
