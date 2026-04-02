import {
  createContext,
  memo,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactElement,
} from "react";
import { List, useListRef } from "react-window";
import type { Game } from "@/types";
import { GameListRow } from "@/components/GameListRow";
import { EmptyState } from "@/components/EmptyState";
import { useListKeyboardNav } from "@/hooks/useListKeyboardNav";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VirtualizedGameListProps {
  games: Game[];
  onGameClick: (gameId: number) => void;
  onClearFilters?: () => void;
}

/** Extra props forwarded to each row via react-window v2 `rowProps`. */
interface RowExtraProps {
  games: Game[];
  onGameClick: (game: Game) => void;
}

// ---------------------------------------------------------------------------
// Focus context — avoids passing focusedIndex through rowProps which would
// invalidate the memoized rowProps object on every keyboard nav step and
// cause ALL visible rows to re-render. Only rows whose focused state
// actually changes will re-render via useContext subscription.
// ---------------------------------------------------------------------------

interface FocusContextValue {
  focusedIndex: number;
  isFocused: boolean;
}

const FocusContext = createContext<FocusContextValue>({
  focusedIndex: -1,
  isFocused: false,
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROW_HEIGHT = 72;
const GAP = 8;
const TOTAL_ROW_HEIGHT = ROW_HEIGHT + GAP;
const OVERSCAN = 4;

// ---------------------------------------------------------------------------
// Row component (react-window v2 API: rowComponent)
// ---------------------------------------------------------------------------

/**
 * Inner row that reads focus state from context. Separated from the outer
 * Row memo so that focus changes (keyboard nav) only re-render rows whose
 * focused state actually changes, rather than all visible rows.
 */
function RowInner({
  game,
  index,
  onGameClick,
}: {
  game: Game;
  index: number;
  onGameClick: (game: Game) => void;
}) {
  const { focusedIndex, isFocused } = useContext(FocusContext);
  const isCurrentFocus = index === focusedIndex && isFocused;

  return (
    <GameListRow
      game={game}
      onClick={onGameClick}
      focused={isCurrentFocus}
      tabIndex={index === focusedIndex ? 0 : -1}
    />
  );
}

interface RowComponentProps {
  ariaAttributes: {
    "aria-posinset": number;
    "aria-setsize": number;
    role: "listitem";
  };
  index: number;
  style: CSSProperties;
  games: Game[];
  onGameClick: (game: Game) => void;
}

const Row = memo(function Row({
  ariaAttributes,
  index,
  style,
  games,
  onGameClick,
}: RowComponentProps): ReactElement | null {
  if (index >= games.length) {
    return <div style={style} />;
  }

  const game = games[index] as Game | undefined;
  if (!game) {
    return <div style={style} />;
  }

  return (
    <div style={style} {...ariaAttributes}>
      <div
        style={{
          paddingBottom: GAP,
          height: "100%",
          boxSizing: "border-box",
        }}
      >
        <RowInner game={game} index={index} onGameClick={onGameClick} />
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// VirtualizedGameList
// ---------------------------------------------------------------------------

export function VirtualizedGameList({
  games,
  onGameClick,
  onClearFilters,
}: VirtualizedGameListProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useListRef(null);

  // Stable callback that bridges GameListRow's (game: Game) => void signature
  // to the parent's (gameId: number) => void. This avoids creating a new
  // closure per row on every render, which would defeat GameListRow's memo.
  const handleGameClick = useCallback(
    (game: Game) => {
      onGameClick(game.id);
    },
    [onGameClick],
  );

  const { focusedIndex, containerProps, isFocused } = useListKeyboardNav({
    totalItems: games.length,
    onSelect: (index) => {
      const g = games[index];
      if (g) onGameClick(g.id);
    },
    onEscape: () => containerRef.current?.blur(),
    listRef,
  });

  const rowProps = useMemo<RowExtraProps>(
    () => ({ games, onGameClick: handleGameClick }),
    [games, handleGameClick],
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
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="size-full"
              aria-hidden="true"
            >
              <circle
                cx="11"
                cy="11"
                r="8"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="m21 21-4.35-4.35"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
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
      <FocusContext.Provider value={focusContextValue}>
        <List<RowExtraProps>
          listRef={listRef}
          rowComponent={
            Row as unknown as (
              props: {
                ariaAttributes: {
                  "aria-posinset": number;
                  "aria-setsize": number;
                  role: "listitem";
                };
                index: number;
                style: CSSProperties;
              } & RowExtraProps
            ) => ReactElement | null
          }
          rowCount={games.length}
          rowHeight={TOTAL_ROW_HEIGHT}
          rowProps={rowProps}
          overscanCount={OVERSCAN}
          style={{ width: "100%", height: "100%" }}
        />
      </FocusContext.Provider>
    </div>
  );
}
