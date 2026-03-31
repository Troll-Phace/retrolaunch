/**
 * Hook that subscribes to ROM scan progress and completion events.
 *
 * Wraps `useTauriEvent` for the `scan-progress` and `scan-complete` events,
 * exposing reactive state for the current scan status.
 */

import { useState, useCallback } from 'react';
import { useTauriEvent } from '@/hooks/useTauriEvent';
import type { ScanProgress, ScanComplete } from '@/types';

export interface UseScanProgressReturn {
  progress: ScanProgress | null;
  complete: ScanComplete | null;
  isScanning: boolean;
  reset: () => void;
}

export function useScanProgress(): UseScanProgressReturn {
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [complete, setComplete] = useState<ScanComplete | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  useTauriEvent<ScanProgress>('scan-progress', (payload) => {
    setIsScanning(true);
    setProgress(payload);
  });

  useTauriEvent<ScanComplete>('scan-complete', (payload) => {
    setComplete(payload);
    setProgress(null);
    setIsScanning(false);
  });

  const reset = useCallback(() => {
    setProgress(null);
    setComplete(null);
    setIsScanning(false);
  }, []);

  return { progress, complete, isScanning, reset };
}
