import { useCallback, useRef, useState, type KeyboardEvent } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GridHandle {
  scrollToCell: (params: {
    rowIndex: number;
    columnIndex: number;
    rowAlign?: "auto" | "center" | "end" | "smart" | "start";
    columnAlign?: "auto" | "center" | "end" | "smart" | "start";
  }) => void;
}

export interface UseGridKeyboardNavOptions {
  totalItems: number;
  columnCount: number;
  onSelect: (index: number) => void;
  onEscape?: () => void;
  gridRef: React.RefObject<GridHandle | null>;
}

export interface UseGridKeyboardNavReturn {
  focusedIndex: number;
  setFocusedIndex: (index: number) => void;
  handleKeyDown: (e: KeyboardEvent) => void;
  containerProps: {
    tabIndex: number;
    role: string;
    "aria-label": string;
    onKeyDown: (e: KeyboardEvent) => void;
    onFocus: () => void;
    onBlur: () => void;
  };
  isFocused: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGridKeyboardNav({
  totalItems,
  columnCount,
  onSelect,
  onEscape,
  gridRef,
}: UseGridKeyboardNavOptions): UseGridKeyboardNavReturn {
  const [focusedIndex, setFocusedIndexRaw] = useState(-1);
  const [isFocused, setIsFocused] = useState(false);

  // RAF-based throttle: only process one key event per animation frame.
  const rafPending = useRef(false);

  const scrollToIndex = useCallback(
    (index: number) => {
      if (columnCount <= 0) return;
      const rowIndex = Math.floor(index / columnCount);
      const columnIndex = index % columnCount;
      gridRef.current?.scrollToCell({ rowIndex, columnIndex, rowAlign: "smart", columnAlign: "smart" });
    },
    [columnCount, gridRef],
  );

  const setFocusedIndex = useCallback(
    (index: number) => {
      setFocusedIndexRaw(index);
      if (index >= 0) {
        scrollToIndex(index);
      }
    },
    [scrollToIndex],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (totalItems === 0) return;

      // Navigation keys that should be throttled via rAF
      const navKeys = new Set([
        "ArrowRight",
        "ArrowLeft",
        "ArrowDown",
        "ArrowUp",
      ]);

      if (navKeys.has(e.key)) {
        e.preventDefault();

        // Throttle rapid repeats with requestAnimationFrame
        if (rafPending.current) return;
        rafPending.current = true;

        requestAnimationFrame(() => {
          rafPending.current = false;

          setFocusedIndexRaw((prev) => {
            const current = prev < 0 ? 0 : prev;
            let next = current;

            switch (e.key) {
              case "ArrowRight":
                next = Math.min(current + 1, totalItems - 1);
                break;
              case "ArrowLeft":
                next = Math.max(current - 1, 0);
                break;
              case "ArrowDown":
                next = Math.min(current + columnCount, totalItems - 1);
                break;
              case "ArrowUp":
                next = Math.max(current - columnCount, 0);
                break;
            }

            // Scroll to the new position
            if (columnCount > 0) {
              const rowIndex = Math.floor(next / columnCount);
              const columnIndex = next % columnCount;
              gridRef.current?.scrollToCell({ rowIndex, columnIndex, rowAlign: "smart", columnAlign: "smart" });
            }

            return next;
          });
        });
        return;
      }

      // Non-throttled keys
      switch (e.key) {
        case "Enter":
        case " ":
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < totalItems) {
            onSelect(focusedIndex);
          }
          break;

        case "Escape":
          e.preventDefault();
          onEscape?.();
          break;

        case "Home":
          e.preventDefault();
          setFocusedIndex(0);
          break;

        case "End":
          e.preventDefault();
          setFocusedIndex(totalItems - 1);
          break;
      }
    },
    [totalItems, columnCount, focusedIndex, onSelect, onEscape, gridRef, setFocusedIndex],
  );

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    setFocusedIndexRaw((prev) => (prev < 0 ? 0 : prev));
  }, []);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
  }, []);

  const containerProps = {
    tabIndex: 0,
    role: "grid" as const,
    "aria-label": "Game library grid" as const,
    onKeyDown: handleKeyDown,
    onFocus: handleFocus,
    onBlur: handleBlur,
  };

  return {
    focusedIndex,
    setFocusedIndex,
    handleKeyDown,
    containerProps,
    isFocused,
  };
}
