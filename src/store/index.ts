/**
 * Zustand global state store for RetroLaunch.
 *
 * Manages theme, search/filter state, view preferences, and dynamic color
 * palettes. Preferences are persisted to the Tauri backend via IPC and
 * hydrated on app startup.
 */

import { useEffect } from 'react';
import { create } from 'zustand';
import type { GameSortField, SortOrder, ThemeName } from '@/types';
import type { Toast } from '@/components/Toast';
import { getPreferences, setPreference } from '@/services/api';

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

interface ActiveFilters {
  system: string | null;
  genre: string | null;
  sortBy: GameSortField;
  sortOrder: SortOrder;
}

interface DynamicColorPalette {
  accent: string;
  accentLight: string;
  glowColor: string;
}

interface AppState {
  // Theme
  currentTheme: ThemeName;
  setTheme: (theme: ThemeName) => void;

  // Search & Filters
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  activeFilters: ActiveFilters;
  setActiveFilters: (filters: Partial<ActiveFilters>) => void;

  // View preference
  viewPreference: 'grid' | 'list';
  setViewPreference: (view: 'grid' | 'list') => void;

  // Dynamic color (set by game detail / hero banner)
  dynamicColorPalette: DynamicColorPalette | null;
  setDynamicColorPalette: (palette: DynamicColorPalette | null) => void;

  // Toast notifications
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;

  // Hydration
  hydrated: boolean;
  hydrateFromPreferences: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_FILTERS: ActiveFilters = {
  system: null,
  genre: null,
  sortBy: 'title',
  sortOrder: 'asc',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Type guard for valid ThemeName values. */
function isThemeName(value: string): value is ThemeName {
  return value === 'dark' || value === 'light' || value === 'oled' || value === 'retro';
}

/** Type guard for valid GameSortField values. */
function isGameSortField(value: string): value is GameSortField {
  return (
    value === 'title' ||
    value === 'date_added' ||
    value === 'last_played' ||
    value === 'playtime' ||
    value === 'release_date'
  );
}

/** Type guard for valid SortOrder values. */
function isSortOrder(value: string): value is SortOrder {
  return value === 'asc' || value === 'desc';
}

/** Apply a dynamic color palette (or clear it) on the document root element. */
function applyDynamicColors(palette: DynamicColorPalette | null): void {
  const root = document.documentElement;
  if (palette) {
    root.style.setProperty('--dynamic-accent', palette.accent);
    root.style.setProperty('--dynamic-accent-light', palette.accentLight);
    root.style.setProperty('--dynamic-glow', palette.glowColor);
  } else {
    root.style.removeProperty('--dynamic-accent');
    root.style.removeProperty('--dynamic-accent-light');
    root.style.removeProperty('--dynamic-glow');
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAppStore = create<AppState>()((set, get) => ({
  // -- Theme ----------------------------------------------------------------
  currentTheme: 'dark',
  setTheme: (theme) => {
    set({ currentTheme: theme });
    document.documentElement.dataset.theme = theme;
    setPreference('theme', theme).catch(console.error);
  },

  // -- Search & Filters -----------------------------------------------------
  searchQuery: '',
  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },

  activeFilters: { ...DEFAULT_FILTERS },
  setActiveFilters: (partial) => {
    const merged: ActiveFilters = { ...get().activeFilters, ...partial };
    set({ activeFilters: merged });

    // Persist only sort preferences (system/genre are transient nav state)
    setPreference('sort_by', merged.sortBy).catch(console.error);
    setPreference('sort_order', merged.sortOrder).catch(console.error);
  },

  // -- View preference ------------------------------------------------------
  viewPreference: 'grid',
  setViewPreference: (view) => {
    set({ viewPreference: view });
    setPreference('view_preference', view).catch(console.error);
  },

  // -- Dynamic color palette ------------------------------------------------
  dynamicColorPalette: null,
  setDynamicColorPalette: (palette) => {
    set({ dynamicColorPalette: palette });
    applyDynamicColors(palette);
  },

  // -- Toast notifications ---------------------------------------------------
  toasts: [],
  addToast: (toast) => {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now());
    const MAX_TOASTS = 5;
    set((state) => {
      const next = [...state.toasts, { ...toast, id }];
      // Keep only the newest MAX_TOASTS entries
      return { toasts: next.length > MAX_TOASTS ? next.slice(-MAX_TOASTS) : next };
    });
  },
  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },

  // -- Hydration ------------------------------------------------------------
  hydrated: false,
  hydrateFromPreferences: async () => {
    if (get().hydrated) return;
    try {
      const prefs = await getPreferences();

      const theme: ThemeName =
        prefs.theme !== undefined && isThemeName(prefs.theme) ? prefs.theme : 'dark';

      const viewPreference: 'grid' | 'list' =
        prefs.view_preference === 'list' ? 'list' : 'grid';

      const sortBy: GameSortField =
        prefs.sort_by !== undefined && isGameSortField(prefs.sort_by)
          ? prefs.sort_by
          : DEFAULT_FILTERS.sortBy;

      const sortOrder: SortOrder =
        prefs.sort_order !== undefined && isSortOrder(prefs.sort_order)
          ? prefs.sort_order
          : DEFAULT_FILTERS.sortOrder;

      // Apply theme to DOM
      document.documentElement.dataset.theme = theme;

      set({
        currentTheme: theme,
        viewPreference,
        activeFilters: {
          ...DEFAULT_FILTERS,
          sortBy,
          sortOrder,
        },
        hydrated: true,
      });
    } catch {
      // IPC unavailable (e.g., running in browser dev mode without Tauri).
      // Keep defaults and mark as hydrated so the app renders.
      set({ hydrated: true });
    }
  },
}));

// ---------------------------------------------------------------------------
// Hydration hook — call once in the root App component
// ---------------------------------------------------------------------------

/**
 * Triggers preference hydration on first mount and returns whether hydration
 * is complete. The App component can use the return value to delay rendering
 * until preferences are loaded.
 */
export function useHydrateStore(): boolean {
  const hydrated = useAppStore((s) => s.hydrated);
  const hydrateFromPreferences = useAppStore((s) => s.hydrateFromPreferences);

  useEffect(() => {
    if (!hydrated) {
      hydrateFromPreferences();
    }
  }, [hydrated, hydrateFromPreferences]);

  return hydrated;
}
