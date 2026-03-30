import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactElement } from "react";
import { Grid } from "react-window";
import type { Game } from "@/types";
import { GameCard } from "@/components/GameCard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VirtualizedGameGridProps {
  games: Game[];
  onGameClick: (gameId: number) => void;
}

/** Extra props forwarded to each cell via react-window v2 `cellProps`. */
interface CellExtraProps {
  games: Game[];
  columnCount: number;
  onGameClick: (gameId: number) => void;
}

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

function Cell({
  columnIndex,
  rowIndex,
  style,
  games,
  columnCount,
  onGameClick,
}: {
  ariaAttributes: { "aria-colindex": number; role: "gridcell" };
  columnIndex: number;
  rowIndex: number;
  style: CSSProperties;
  games: Game[];
  columnCount: number;
  onGameClick: (gameId: number) => void;
}): ReactElement | null {
  const gameIndex = rowIndex * columnCount + columnIndex;

  if (gameIndex >= games.length) {
    return <div style={style} />;
  }

  const game = games[gameIndex] as Game | undefined;
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
        <GameCard
          game={game}
          onClick={() => onGameClick(game.id)}
          className="h-full"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState(): ReactElement {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24">
      <p
        className="text-lg font-medium"
        style={{ color: "var(--text-secondary)" }}
      >
        No games found
      </p>
      <p className="text-sm" style={{ color: "var(--text-dim)" }}>
        Try adjusting your filters or adding games to this system
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VirtualizedGameGrid
// ---------------------------------------------------------------------------

export function VirtualizedGameGrid({
  games,
  onGameClick,
}: VirtualizedGameGridProps): ReactElement {
  // Track container width for responsive column count via ResizeObserver.
  // react-window v2 Grid handles its own sizing (fills its container), so
  // we only need the width for deriving column count.
  const containerRef = useRef<HTMLDivElement>(null);
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

  const handleGameClick = useCallback(
    (gameId: number) => {
      onGameClick(gameId);
    },
    [onGameClick],
  );

  if (games.length === 0) {
    return (
      <div ref={containerRef} className="flex flex-1 w-full">
        <EmptyState />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 w-full min-h-0" style={{ height: "100%" }}>
      {containerWidth > 0 && (
        <Grid<CellExtraProps>
          cellComponent={Cell}
          cellProps={{
            games,
            columnCount,
            onGameClick: handleGameClick,
          }}
          columnCount={columnCount}
          columnWidth={columnWidthPercent}
          rowCount={rowCount}
          rowHeight={ROW_HEIGHT}
          overscanCount={OVERSCAN}
          style={{ width: "100%", height: "100%" }}
          role="grid"
          aria-label="Game library grid"
        />
      )}
    </div>
  );
}
