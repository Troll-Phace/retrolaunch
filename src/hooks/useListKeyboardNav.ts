import { useCallback, useRef, useState, type KeyboardEvent } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ListHandle {
  scrollToRow: (params: {
    index: number;
    align?: "auto" | "center" | "end" | "smart" | "start";
    behavior?: "auto" | "instant" | "smooth";
  }) => void;
}

export interface UseListKeyboardNavOptions {
  totalItems: number;
  onSelect: (index: number) => void;
  onEscape?: () => void;
  listRef: React.RefObject<ListHandle | null>;
}

export interface UseListKeyboardNavReturn {
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

export function useListKeyboardNav({
  totalItems,
  onSelect,
  onEscape,
  listRef,
}: UseListKeyboardNavOptions): UseListKeyboardNavReturn {
  const [focusedIndex, setFocusedIndexRaw] = useState(-1);
  const [isFocused, setIsFocused] = useState(false);

  // Ref to avoid stale closure when reading focusedIndex in Enter/Space handler.
  const focusedIndexRef = useRef(focusedIndex);
  focusedIndexRef.current = focusedIndex;

  // RAF-based throttle: only process one key event per animation frame.
  const rafPending = useRef(false);

  const scrollToIndex = useCallback(
    (index: number) => {
      listRef.current?.scrollToRow({ index, align: "smart" });
    },
    [listRef],
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
      const navKeys = new Set(["ArrowDown", "ArrowUp"]);

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
              case "ArrowDown":
                next = Math.min(current + 1, totalItems - 1);
                break;
              case "ArrowUp":
                next = Math.max(current - 1, 0);
                break;
            }

            // Scroll to the new position
            listRef.current?.scrollToRow({ index: next, align: "smart" });

            return next;
          });
        });
        return;
      }

      // Non-throttled keys
      switch (e.key) {
        case "Enter":
        case " ": {
          e.preventDefault();
          const idx = focusedIndexRef.current;
          if (idx >= 0 && idx < totalItems) {
            onSelect(idx);
          }
          break;
        }

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
    [totalItems, onSelect, onEscape, listRef, setFocusedIndex],
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
    role: "list" as const,
    "aria-label": "Game library list" as const,
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
