/**
 * Custom hook that extracts a dominant color palette from cover art using
 * node-vibrant and applies it as CSS custom properties on the document root
 * via the global Zustand store.
 *
 * Colors are extracted asynchronously and never block render — the UI shows
 * fallback theme colors immediately, then transitions to extracted colors
 * over 300ms once they are available.
 */

import { useEffect, useState } from 'react';
import { Vibrant } from 'node-vibrant/browser';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useAppStore } from '@/store';

export interface DynamicColorPalette {
  accent: string;
  accentLight: string;
  glowColor: string;
}

/**
 * Extract a color palette from a local cover art image and apply it to the
 * document root as CSS custom properties (`--dynamic-accent`,
 * `--dynamic-accent-light`, `--dynamic-glow`).
 *
 * @param imagePath - Absolute filesystem path to the cover art image, or null.
 * @returns The extracted palette for component-level usage, or null while
 *          loading / on failure / when no image path is provided.
 */
export function useDynamicColor(imagePath: string | null): DynamicColorPalette | null {
  const [palette, setPalette] = useState<DynamicColorPalette | null>(null);

  useEffect(() => {
    // Nothing to extract — clear any previously applied palette.
    if (!imagePath) {
      setPalette(null);
      useAppStore.getState().setDynamicColorPalette(null);
      return;
    }

    let ignore = false;

    async function extract(path: string) {
      try {
        const url = convertFileSrc(path);
        const result = await Vibrant.from(url).getPalette();

        if (ignore) return;

        // Use the current theme's accent as the fallback rather than hardcoded hex
        const rootStyle = getComputedStyle(document.documentElement);
        const themeAccent = rootStyle.getPropertyValue('--accent').trim() || '#6366f1';
        const themeAccentLight = rootStyle.getPropertyValue('--accent-light').trim() || '#8b5cf6';

        const accent =
          result.Vibrant?.hex ??
          result.Muted?.hex ??
          result.DarkVibrant?.hex ??
          themeAccent;

        const accentLight =
          result.LightVibrant?.hex ??
          result.Vibrant?.hex ??
          themeAccentLight;

        const extracted: DynamicColorPalette = {
          accent,
          accentLight,
          glowColor: accent,
        };

        setPalette(extracted);
        useAppStore.getState().setDynamicColorPalette(extracted);
      } catch (err) {
        if (ignore) return;
        console.warn('Dynamic color extraction failed:', err);
        setPalette(null);
        useAppStore.getState().setDynamicColorPalette(null);
      }
    }

    extract(imagePath);

    return () => {
      ignore = true;
      useAppStore.getState().setDynamicColorPalette(null);
    };
  }, [imagePath]);

  return palette;
}
