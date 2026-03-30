/**
 * Debounces a rapidly-changing value so that downstream consumers only
 * re-render once the value has settled for the specified delay.
 *
 * @example
 * ```tsx
 * const [query, setQuery] = useState('');
 * const debouncedQuery = useDebounce(query, 300);
 *
 * useEffect(() => {
 *   if (debouncedQuery) search(debouncedQuery);
 * }, [debouncedQuery]);
 * ```
 */

import { useState, useEffect } from 'react';

/**
 * Returns a debounced copy of `value` that only updates after `delay`
 * milliseconds have elapsed since the last change to the input value.
 *
 * @param value - The value to debounce.
 * @param delay - Debounce delay in milliseconds (default 300).
 * @returns The debounced value.
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}
