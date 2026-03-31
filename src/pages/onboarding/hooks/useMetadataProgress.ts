/**
 * Hook that subscribes to metadata fetch progress events.
 *
 * Wraps `useTauriEvent` for the `metadata-progress` event, exposing
 * reactive state for the current metadata fetch status.
 *
 * Events are ignored until `activate()` is called, preventing stale
 * events from a previous background fetch from polluting the UI.
 */

import { useCallback, useRef, useState } from 'react';
import { useTauriEvent } from '@/hooks/useTauriEvent';
import type { MetadataProgress } from '@/types';

export interface UseMetadataProgressReturn {
  progress: MetadataProgress | null;
  isComplete: boolean;
  /** Start accepting events. Call right before triggering fetchMetadata. */
  activate: () => void;
}

export function useMetadataProgress(): UseMetadataProgressReturn {
  const [progress, setProgress] = useState<MetadataProgress | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const activeRef = useRef(false);

  const activate = useCallback(() => {
    setProgress(null);
    setIsComplete(false);
    activeRef.current = true;
  }, []);

  useTauriEvent<MetadataProgress>('metadata-progress', (payload) => {
    if (!activeRef.current) return;
    setProgress(payload);
    if (payload.fetched >= payload.total) {
      setIsComplete(true);
    }
  });

  return { progress, isComplete, activate };
}
