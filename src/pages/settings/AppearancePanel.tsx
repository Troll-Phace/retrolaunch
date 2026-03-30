/**
 * Appearance panel — theme picker, view toggles, and cache management.
 */

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

import { Button } from "@/components/Button";
import { getCacheStats, clearCache, setPreference } from "@/services/api";
import { useAppStore } from "@/store";
import type { CacheStats, ThemeName } from "@/types";

const themeCardSpring = { type: "spring" as const, stiffness: 400, damping: 25 };

export interface AppearancePanelProps {
  preferences: Record<string, string>;
  onRefresh: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

// ---------------------------------------------------------------------------
// Theme card
// ---------------------------------------------------------------------------

interface ThemeOption {
  id: ThemeName;
  label: string;
  swatches: [string, string, string];
}

const THEMES: ThemeOption[] = [
  { id: "dark", label: "Dark", swatches: ["#0a0a0f", "#141420", "#6366f1"] },
  { id: "light", label: "Light", swatches: ["#f5f5f7", "#ffffff", "#4f46e5"] },
  { id: "oled", label: "OLED", swatches: ["#000000", "#0a0a0a", "#6366f1"] },
  { id: "retro", label: "Retro", swatches: ["#1a1008", "#2a1a10", "#f59e0b"] },
];

interface ThemeCardProps {
  theme: ThemeOption;
  isActive: boolean;
  onSelect: () => void;
}

function ThemeCard({ theme, isActive, onSelect }: ThemeCardProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      aria-pressed={isActive}
      className={`rounded-lg border p-4 cursor-pointer text-left ${
        isActive
          ? "ring-2 ring-accent border-accent bg-accent/5"
          : "border-ghost hover:border-ghost-lit bg-surface"
      }`}
      animate={shouldReduceMotion ? {} : { scale: isActive ? 1.02 : 1 }}
      whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
      transition={themeCardSpring}
    >
      <div className="flex gap-2 mb-3">
        {theme.swatches.map((color, i) => (
          <div
            key={i}
            className="w-8 h-8 rounded-md border border-ghost"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
        ))}
      </div>
      <span className="text-sm font-medium text-text-primary">{theme.label}</span>
      <AnimatePresence>
        {isActive && (
          <motion.span
            className="ml-2 text-xs text-accent font-medium inline-block"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
          >
            Active
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function AppearancePanel({
  preferences,
  onRefresh,
}: AppearancePanelProps) {
  const currentTheme = useAppStore((s) => s.currentTheme);
  const storeSetTheme = useAppStore((s) => s.setTheme);
  const viewPreference = useAppStore((s) => s.viewPreference);
  const storeSetViewPreference = useAppStore((s) => s.setViewPreference);

  const dynamicColorsEnabled = preferences["dynamic_colors_enabled"] !== "false";

  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [clearing, setClearing] = useState<"covers" | "screenshots" | "all" | null>(null);

  // Load cache stats on mount
  useEffect(() => {
    getCacheStats()
      .then(setCacheStats)
      .catch(console.error);
  }, []);

  const refreshCacheStats = useCallback(() => {
    getCacheStats()
      .then(setCacheStats)
      .catch(console.error);
  }, []);

  const handleToggleDynamicColors = useCallback(async () => {
    try {
      const newVal = dynamicColorsEnabled ? "false" : "true";
      await setPreference("dynamic_colors_enabled", newVal);
      onRefresh();
    } catch (err: unknown) {
      console.error("Failed to toggle dynamic colors:", err);
    }
  }, [dynamicColorsEnabled, onRefresh]);

  const handleClearCache = useCallback(
    async (type: "covers" | "screenshots" | "all") => {
      setClearing(type);
      try {
        await clearCache(
          type === "all"
            ? { all: true }
            : type === "covers"
              ? { covers: true }
              : { screenshots: true }
        );
        refreshCacheStats();
      } catch (err: unknown) {
        console.error("Failed to clear cache:", err);
      } finally {
        setClearing(null);
      }
    },
    [refreshCacheStats]
  );

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold text-text-primary">Appearance</h2>
      <p className="text-sm text-text-secondary mt-1">
        Customize the look and feel of RetroLaunch.
      </p>

      {/* Theme picker */}
      <div className="mt-6">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-text-secondary mb-3">
          Theme
        </h3>
        <div className="grid grid-cols-2 gap-3 max-w-md">
          {THEMES.map((theme) => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              isActive={currentTheme === theme.id}
              onSelect={() => storeSetTheme(theme.id)}
            />
          ))}
        </div>
      </div>

      {/* Toggles */}
      <div className="mt-8">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-text-secondary mb-3">
          Display
        </h3>

        <div className="space-y-4">
          {/* Dynamic colors toggle */}
          <div className="flex items-center justify-between rounded-lg border border-ghost bg-surface p-4">
            <div>
              <span className="text-sm font-medium text-text-primary">
                Dynamic Color Palette
              </span>
              <p className="text-xs text-text-secondary mt-0.5">
                Extract colors from cover art for a unique look per game.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={dynamicColorsEnabled}
              onClick={handleToggleDynamicColors}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ${
                dynamicColorsEnabled ? "bg-accent" : "bg-elevated"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform duration-200 ${
                  dynamicColorsEnabled ? "translate-x-[22px]" : "translate-x-[2px]"
                } mt-[2px]`}
              />
            </button>
          </div>

          {/* Default view toggle */}
          <div className="flex items-center justify-between rounded-lg border border-ghost bg-surface p-4">
            <div>
              <span className="text-sm font-medium text-text-primary">
                Default View
              </span>
              <p className="text-xs text-text-secondary mt-0.5">
                Choose grid or list as the default game view.
              </p>
            </div>
            <div className="flex rounded-full border border-ghost overflow-hidden">
              <button
                type="button"
                onClick={() => storeSetViewPreference("grid")}
                aria-pressed={viewPreference === "grid"}
                className={`px-4 py-1.5 text-xs font-medium transition-colors duration-200 cursor-pointer ${
                  viewPreference === "grid"
                    ? "bg-accent text-white"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Grid
              </button>
              <button
                type="button"
                onClick={() => storeSetViewPreference("list")}
                aria-pressed={viewPreference === "list"}
                className={`px-4 py-1.5 text-xs font-medium transition-colors duration-200 cursor-pointer ${
                  viewPreference === "list"
                    ? "bg-accent text-white"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                List
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Cache management */}
      <div className="mt-8">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-text-secondary mb-3">
          Cache
        </h3>
        <div className="rounded-lg border border-ghost bg-surface p-5">
          {cacheStats ? (
            <>
              <motion.div
                key={`${cacheStats.covers_count}-${cacheStats.screenshots_count}-${cacheStats.total_size_bytes}`}
                className="grid grid-cols-3 gap-4 mb-4"
                initial={{ opacity: 0.4 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              >
                <div>
                  <span className="text-xs text-text-secondary">Covers</span>
                  <p className="text-sm text-text-primary font-medium">
                    <span className="font-mono">{cacheStats.covers_count}</span>{" "}
                    files
                  </p>
                  <p className="text-xs text-text-dim font-mono">
                    {formatBytes(cacheStats.covers_size_bytes)}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-text-secondary">Screenshots</span>
                  <p className="text-sm text-text-primary font-medium">
                    <span className="font-mono">{cacheStats.screenshots_count}</span>{" "}
                    files
                  </p>
                  <p className="text-xs text-text-dim font-mono">
                    {formatBytes(cacheStats.screenshots_size_bytes)}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-text-secondary">Total</span>
                  <p className="text-sm text-text-primary font-medium font-mono">
                    {formatBytes(cacheStats.total_size_bytes)}
                  </p>
                </div>
              </motion.div>

              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleClearCache("covers")}
                  disabled={clearing !== null}
                >
                  {clearing === "covers" ? "Clearing..." : "Clear Covers"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleClearCache("screenshots")}
                  disabled={clearing !== null}
                >
                  {clearing === "screenshots" ? "Clearing..." : "Clear Screenshots"}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleClearCache("all")}
                  disabled={clearing !== null}
                  className="hover:border-error hover:text-error"
                >
                  {clearing === "all" ? "Clearing..." : "Clear All"}
                </Button>
              </div>
            </>
          ) : (
            <div className="py-4 text-center text-sm text-text-dim">
              Loading cache statistics...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
