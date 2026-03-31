import { renderHook, act } from '@testing-library/react';
import { useGridKeyboardNav } from '@/hooks/useGridKeyboardNav';
import type { KeyboardEvent } from 'react';

// Mock requestAnimationFrame to execute immediately
vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
  cb(0);
  return 0;
});

function createMockGridRef() {
  return { current: { scrollToCell: vi.fn() } };
}

function makeKeyEvent(key: string): KeyboardEvent {
  return {
    key,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent;
}

describe('useGridKeyboardNav', () => {
  it('returns focusedIndex of -1 initially', () => {
    const { result } = renderHook(() =>
      useGridKeyboardNav({
        totalItems: 20,
        columnCount: 4,
        onSelect: vi.fn(),
        gridRef: createMockGridRef(),
      }),
    );
    expect(result.current.focusedIndex).toBe(-1);
  });

  it('returns isFocused as false initially', () => {
    const { result } = renderHook(() =>
      useGridKeyboardNav({
        totalItems: 20,
        columnCount: 4,
        onSelect: vi.fn(),
        gridRef: createMockGridRef(),
      }),
    );
    expect(result.current.isFocused).toBe(false);
  });

  it('sets focusedIndex to 0 on container focus', () => {
    const { result } = renderHook(() =>
      useGridKeyboardNav({
        totalItems: 20,
        columnCount: 4,
        onSelect: vi.fn(),
        gridRef: createMockGridRef(),
      }),
    );
    act(() => {
      result.current.containerProps.onFocus();
    });
    expect(result.current.focusedIndex).toBe(0);
    expect(result.current.isFocused).toBe(true);
  });

  it('ArrowRight increments focusedIndex', () => {
    const { result } = renderHook(() =>
      useGridKeyboardNav({
        totalItems: 20,
        columnCount: 4,
        onSelect: vi.fn(),
        gridRef: createMockGridRef(),
      }),
    );
    // Focus first to set index to 0
    act(() => {
      result.current.containerProps.onFocus();
    });
    act(() => {
      result.current.handleKeyDown(makeKeyEvent('ArrowRight'));
    });
    expect(result.current.focusedIndex).toBe(1);
  });

  it('ArrowLeft decrements focusedIndex', () => {
    const { result } = renderHook(() =>
      useGridKeyboardNav({
        totalItems: 20,
        columnCount: 4,
        onSelect: vi.fn(),
        gridRef: createMockGridRef(),
      }),
    );
    // Set to index 2 first
    act(() => {
      result.current.setFocusedIndex(2);
    });
    act(() => {
      result.current.handleKeyDown(makeKeyEvent('ArrowLeft'));
    });
    expect(result.current.focusedIndex).toBe(1);
  });

  it('ArrowDown moves by columnCount', () => {
    const { result } = renderHook(() =>
      useGridKeyboardNav({
        totalItems: 20,
        columnCount: 4,
        onSelect: vi.fn(),
        gridRef: createMockGridRef(),
      }),
    );
    act(() => {
      result.current.containerProps.onFocus();
    });
    act(() => {
      result.current.handleKeyDown(makeKeyEvent('ArrowDown'));
    });
    expect(result.current.focusedIndex).toBe(4);
  });

  it('ArrowUp moves by negative columnCount', () => {
    const { result } = renderHook(() =>
      useGridKeyboardNav({
        totalItems: 20,
        columnCount: 4,
        onSelect: vi.fn(),
        gridRef: createMockGridRef(),
      }),
    );
    act(() => {
      result.current.setFocusedIndex(8);
    });
    act(() => {
      result.current.handleKeyDown(makeKeyEvent('ArrowUp'));
    });
    expect(result.current.focusedIndex).toBe(4);
  });

  it('does not go below 0 (ArrowLeft at start)', () => {
    const { result } = renderHook(() =>
      useGridKeyboardNav({
        totalItems: 20,
        columnCount: 4,
        onSelect: vi.fn(),
        gridRef: createMockGridRef(),
      }),
    );
    act(() => {
      result.current.containerProps.onFocus();
    });
    act(() => {
      result.current.handleKeyDown(makeKeyEvent('ArrowLeft'));
    });
    expect(result.current.focusedIndex).toBe(0);
  });

  it('does not exceed totalItems - 1 (ArrowRight at end)', () => {
    const { result } = renderHook(() =>
      useGridKeyboardNav({
        totalItems: 5,
        columnCount: 4,
        onSelect: vi.fn(),
        gridRef: createMockGridRef(),
      }),
    );
    act(() => {
      result.current.setFocusedIndex(4);
    });
    act(() => {
      result.current.handleKeyDown(makeKeyEvent('ArrowRight'));
    });
    expect(result.current.focusedIndex).toBe(4);
  });

  it('Home key sets focusedIndex to 0', () => {
    const { result } = renderHook(() =>
      useGridKeyboardNav({
        totalItems: 20,
        columnCount: 4,
        onSelect: vi.fn(),
        gridRef: createMockGridRef(),
      }),
    );
    act(() => {
      result.current.setFocusedIndex(15);
    });
    act(() => {
      result.current.handleKeyDown(makeKeyEvent('Home'));
    });
    expect(result.current.focusedIndex).toBe(0);
  });

  it('End key sets focusedIndex to totalItems - 1', () => {
    const { result } = renderHook(() =>
      useGridKeyboardNav({
        totalItems: 20,
        columnCount: 4,
        onSelect: vi.fn(),
        gridRef: createMockGridRef(),
      }),
    );
    act(() => {
      result.current.containerProps.onFocus();
    });
    act(() => {
      result.current.handleKeyDown(makeKeyEvent('End'));
    });
    expect(result.current.focusedIndex).toBe(19);
  });

  it('Enter key calls onSelect with current focusedIndex', () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() =>
      useGridKeyboardNav({
        totalItems: 20,
        columnCount: 4,
        onSelect,
        gridRef: createMockGridRef(),
      }),
    );
    act(() => {
      result.current.setFocusedIndex(5);
    });
    act(() => {
      result.current.handleKeyDown(makeKeyEvent('Enter'));
    });
    expect(onSelect).toHaveBeenCalledWith(5);
  });

  it('Space key calls onSelect with current focusedIndex', () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() =>
      useGridKeyboardNav({
        totalItems: 20,
        columnCount: 4,
        onSelect,
        gridRef: createMockGridRef(),
      }),
    );
    act(() => {
      result.current.setFocusedIndex(3);
    });
    act(() => {
      result.current.handleKeyDown(makeKeyEvent(' '));
    });
    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it('Escape key calls onEscape', () => {
    const onEscape = vi.fn();
    const { result } = renderHook(() =>
      useGridKeyboardNav({
        totalItems: 20,
        columnCount: 4,
        onSelect: vi.fn(),
        onEscape,
        gridRef: createMockGridRef(),
      }),
    );
    act(() => {
      result.current.handleKeyDown(makeKeyEvent('Escape'));
    });
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('containerProps includes correct role, aria-label, tabIndex', () => {
    const { result } = renderHook(() =>
      useGridKeyboardNav({
        totalItems: 20,
        columnCount: 4,
        onSelect: vi.fn(),
        gridRef: createMockGridRef(),
      }),
    );
    expect(result.current.containerProps.role).toBe('grid');
    expect(result.current.containerProps['aria-label']).toBe('Game library grid');
    expect(result.current.containerProps.tabIndex).toBe(0);
  });
});
