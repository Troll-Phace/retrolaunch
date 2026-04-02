import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Game, GameSortField, SortOrder, System } from "@/types";
import { getGames, getSystems, scanDirectories } from "@/services/api";
import { useAppStore } from "@/store";
import { useDebounce } from "@/hooks/useDebounce";
import { SystemThemeHeader } from "@/components/SystemThemeHeader";
import { GenreFilterBar } from "@/components/GenreFilterBar";
import { SortDropdown } from "@/components/SortDropdown";
import { ViewToggle } from "@/components/ViewToggle";
import { VirtualizedGameGrid } from "@/components/VirtualizedGameGrid";
import { EmptyState } from "@/components/EmptyState";

// ---------------------------------------------------------------------------
// Default theme color when the system has none defined
// ---------------------------------------------------------------------------

const FALLBACK_THEME_COLOR = "#6366f1";

// ---------------------------------------------------------------------------
// SystemGrid page
// ---------------------------------------------------------------------------

export function SystemGrid() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // ---- System data --------------------------------------------------------
  const [system, setSystem] = useState<System | null>(null);

  // ---- Games data ---------------------------------------------------------
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---- Local filter state -------------------------------------------------
  const [genre, setGenre] = useState("All");

  // ---- Sort state (initialised from Zustand for persistence) ---------------
  const activeFilters = useAppStore((s) => s.activeFilters);
  const setActiveFilters = useAppStore((s) => s.setActiveFilters);
  const [sortBy, setSortBy] = useState<GameSortField>(activeFilters.sortBy);
  const [sortOrder, setSortOrder] = useState<SortOrder>(activeFilters.sortOrder);

  // ---- Search (from global store, debounced) ------------------------------
  const searchQuery = useAppStore((s) => s.searchQuery);
  const debouncedSearch = useDebounce(searchQuery, 300);

  // ---- Data version (triggers refetch when watcher detects changes) ------
  const dataVersion = useAppStore((s) => s.dataVersion);

  // ---- Fetch system info --------------------------------------------------
  useEffect(() => {
    if (!id) return;

    getSystems()
      .then((systems) => {
        const found = systems.find((s) => s.id === id);
        if (found) {
          setSystem(found);
        }
      })
      .catch((err: unknown) => {
        console.error("Failed to fetch systems:", err);
      });
  }, [id]);

  // ---- Fetch games (reactive to all filter dependencies) ------------------
  useEffect(() => {
    if (!id) return;

    setLoading(true);
    setError(null);

    getGames({
      system_id: id,
      genre: genre === "All" ? null : genre,
      sort_by: sortBy,
      sort_order: sortOrder,
      search: debouncedSearch || null,
    })
      .then((result) => {
        setGames(result);
        setLoading(false);
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : "Failed to load games";
        setError(message);
        setLoading(false);
      });
  }, [id, genre, sortBy, sortOrder, debouncedSearch, dataVersion]);

  // ---- Sort change handler (persists to Zustand) --------------------------
  const handleSortChange = useCallback(
    (newSortBy: GameSortField, newSortOrder: SortOrder) => {
      setSortBy(newSortBy);
      setSortOrder(newSortOrder);
      setActiveFilters({ sortBy: newSortBy, sortOrder: newSortOrder });
    },
    [setActiveFilters],
  );

  // ---- Game click handler -------------------------------------------------
  const handleGameClick = useCallback(
    (gameId: number) => {
      navigate(`/game/${gameId}`);
    },
    [navigate],
  );

  // ---- Whether any filters are currently applied ---------------------------
  const hasFilters = useMemo(
    () => genre !== "All" || Boolean(debouncedSearch),
    [genre, debouncedSearch],
  );

  // ---- Clear all filters --------------------------------------------------
  const handleClearFilters = useCallback(() => {
    setGenre("All");
    useAppStore.getState().setSearchQuery("");
  }, []);

  // ---- Scan handler for empty state ---------------------------------------
  const handleScanNow = useCallback(() => {
    scanDirectories([]).catch(console.error);
  }, []);

  // ---- Derived values -----------------------------------------------------
  const systemName = system?.name ?? "Loading...";
  const themeColor = system?.theme_color ?? FALLBACK_THEME_COLOR;

  // ---- Render -------------------------------------------------------------

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <p className="text-lg font-medium text-text-secondary">
          Something went wrong
        </p>
        <p className="text-sm text-text-dim">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* System-themed header with back nav, breadcrumb, name, count */}
      <SystemThemeHeader
        systemName={systemName}
        gameCount={games.length}
        themeColor={themeColor}
      />

      {/* Toolbar row: genre filters, sort, view toggle */}
      <div className="flex items-center gap-3 px-6 py-3">
        <div className="flex-1 min-w-0">
          <GenreFilterBar activeGenre={genre} onGenreChange={setGenre} />
        </div>
        <SortDropdown
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={handleSortChange}
        />
        <ViewToggle />
      </div>

      {/* Game grid — fills remaining vertical space */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-text-secondary">Loading games...</p>
        </div>
      ) : games.length === 0 && !hasFilters ? (
        <div className="flex flex-1 items-center justify-center px-6 pb-6">
          <EmptyState
            icon={
              <svg viewBox="0 0 24 24" fill="none" className="size-full" aria-hidden="true">
                <path
                  d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            }
            title="No games found for this system"
            description="Scan your ROM directories to add games."
            actionLabel="Scan Now"
            onAction={handleScanNow}
          />
        </div>
      ) : (
        <div className="flex-1 min-h-0 px-6 pb-6">
          <VirtualizedGameGrid
            games={games}
            onGameClick={handleGameClick}
            onClearFilters={hasFilters ? handleClearFilters : undefined}
          />
        </div>
      )}
    </div>
  );
}
