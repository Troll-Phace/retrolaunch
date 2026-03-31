import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from "react";
import { Grid, useGridRef } from "react-window";
import type { Game } from "@/types";
import { GameCard } from "@/components/GameCard";
import { EmptyState } from "@/components/EmptyState";
import { useGridKeyboardNav } from "@/hooks/useGridKeyboardNav";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VirtualizedGameGridProps {
  games: Game[];
  onGameClick: (gameId: number) => void;
  onClearFilters?: () => void;
}

/** Extra props forwarded to each cell via react-window v2 `cellProps`. */
interface CellExtraProps {
  games: Game[];
  columnCount: number;
  onGameClick: (game: Game) => void;
}

// ---------------------------------------------------------------------------
// Focus context — avoids passing focusedIndex through cellProps which would
// invalidate the memoized cellProps object on every keyboard nav step and
// cause ALL visible cells to re-render. Only cells whose focused state
// actually changes will re-render via useContext subscription.
// ---------------------------------------------------------------------------

interface FocusContextValue {
  focusedIndex: number;
  isFocused: boolean;
}

const FocusContext = createContext<FocusContextValue>({ focusedIndex: -1, isFocused: false });

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GAP_V = 16; // vertical gap between cards (space-4)
const CARD_CONTENT_HEIGHT = 280; // approximate card height
const ROW_HEIGHT = CARD_CONTENT_HEIGHT + GAP_V;
const OVERSCAN = 2;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive column count from container width using the responsive breakpoints. */
function getColumnCount(width: number): number {
  if (width >= 1920) return 6;
  if (width >= 1440) return 5;
  if (width >= 1200) return 4;
  if (width >= 900) return 3;
  return 2;
}

// ---------------------------------------------------------------------------
// Cell component (react-window v2 API: cellComponent)
// ---------------------------------------------------------------------------

interface CellProps {
  ariaAttributes: { "aria-colindex": number; role: "gridcell" };
  columnIndex: number;
  rowIndex: number;
  style: CSSProperties;
  games: Game[];
  columnCount: number;
  onGameClick: (game: Game) => void;
}

/**
 * Inner cell that reads focus state from context. Separated from the outer
 * Cell memo so that focus changes (keyboard nav) only re-render cells whose
 * focused state actually changes, rather than all visible cells.
 */
function CellInner({
  game,
  flatIndex,
  onGameClick,
}: {
  game: Game;
  flatIndex: number;
  onGameClick: (game: Game) => void;
}) {
  const { focusedIndex, isFocused } = useContext(FocusContext);
  const isCurrentFocus = flatIndex === focusedIndex && isFocused;

  return (
    <GameCard
      game={game}
      onClick={onGameClick}
      className="h-full"
      focused={isCurrentFocus}
      tabIndex={flatIndex === focusedIndex ? 0 : -1}
      disableLayoutAnimation
    />
  );
}

const Cell = memo(function Cell({
  columnIndex,
  rowIndex,
  style,
  games,
  columnCount,
  onGameClick,
}: CellProps): ReactElement | null {
  const flatIndex = rowIndex * columnCount + columnIndex;

  if (flatIndex >= games.length) {
    return <div style={style} />;
  }

  const game = games[flatIndex] as Game | undefined;
  if (!game) {
    return <div style={style} />;
  }

  return (
    <div style={style}>
      <div
        style={{
          paddingBottom: GAP_V,
          height: "100%",
          boxSizing: "border-box",
        }}
      >
        <CellInner game={game} flatIndex={flatIndex} onGameClick={onGameClick} />
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Empty state (removed — now using shared EmptyState component)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// VirtualizedGameGrid
// ---------------------------------------------------------------------------

export function VirtualizedGameGrid({
  games,
  onGameClick,
  onClearFilters,
}: VirtualizedGameGridProps): ReactElement {
  // Track container width for responsive column count via ResizeObserver.
  // react-window v2 Grid handles its own sizing (fills its container), so
  // we only need the width for deriving column count.
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useGridRef(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = Math.floor(entry.contentRect.width);
        setContainerWidth((prev) => (prev === width ? prev : width));
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const columnCount = getColumnCount(containerWidth);

  // Use a percentage-based column width so the Grid distributes space evenly.
  // This avoids needing to know the exact pixel width — the Grid auto-sizes.
  const columnWidthPercent = columnCount > 0 ? `${100 / columnCount}%` : "100%";
  const rowCount = Math.ceil(games.length / columnCount) || 0;

  // Stable callback that bridges GameCard's (game: Game) => void signature
  // to the parent's (gameId: number) => void. This avoids creating a new
  // closure per cell on every render, which would defeat GameCard's memo.
  const handleGameClick = useCallback(
    (game: Game) => {
      onGameClick(game.id);
    },
    [onGameClick],
  );

  const { focusedIndex, containerProps, isFocused } = useGridKeyboardNav({
    totalItems: games.length,
    columnCount,
    onSelect: (index) => {
      const g = games[index];
      if (g) onGameClick(g.id);
    },
    onEscape: () => containerRef.current?.blur(),
    gridRef,
  });

  // cellProps no longer includes focusedIndex/isFocused — those are delivered
  // via FocusContext so that keyboard nav changes do not invalidate this object
  // and force every visible cell to re-render.
  const cellProps = useMemo(
    () => ({ games, columnCount, onGameClick: handleGameClick }),
    [games, columnCount, handleGameClick],
  );

  const focusContextValue = useMemo(
    () => ({ focusedIndex, isFocused }),
    [focusedIndex, isFocused],
  );

  if (games.length === 0) {
    return (
      <div ref={containerRef} className="flex flex-1 w-full">
        <EmptyState
          icon={
            <svg viewBox="0 0 24 24" fill="none" className="size-full" aria-hidden="true">
              <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.5" />
              <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          }
          title="No games found"
          description="Try adjusting your search or filters."
          actionLabel={onClearFilters ? "Clear Filters" : undefined}
          onAction={onClearFilters}
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 w-full min-h-0 outline-none"
      style={{ height: "100%" }}
      {...containerProps}
    >
      {containerWidth > 0 && (
        <FocusContext.Provider value={focusContextValue}>
          <Grid<CellExtraProps>
            gridRef={gridRef}
            cellComponent={Cell as unknown as (props: { ariaAttributes: { "aria-colindex": number; role: "gridcell" }; columnIndex: number; rowIndex: number; style: CSSProperties } & CellExtraProps) => ReactElement | null}
            cellProps={cellProps}
            columnCount={columnCount}
            columnWidth={columnWidthPercent}
            rowCount={rowCount}
            rowHeight={ROW_HEIGHT}
            overscanCount={OVERSCAN}
            style={{ width: "100%", height: "100%" }}
          />
        </FocusContext.Provider>
      )}
    </div>
  );
}
