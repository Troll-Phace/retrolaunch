import type { GameStatus } from '@/types';

/** Display configuration for each game completion status. */
export const STATUS_CONFIG: Record<GameStatus, { label: string; color: string }> = {
  backlog:   { label: 'Backlog',   color: '#f59e0b' },
  playing:   { label: 'Playing',   color: '#6366f1' },
  completed: { label: 'Completed', color: '#10b981' },
  dropped:   { label: 'Dropped',   color: '#f43f5e' },
};

/** All valid status values in display order. */
export const STATUSES: GameStatus[] = ['backlog', 'playing', 'completed', 'dropped'];
