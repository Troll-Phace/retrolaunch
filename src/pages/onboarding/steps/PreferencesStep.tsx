/**
 * Preferences step (step 4) of the onboarding wizard.
 *
 * Lets users configure theme, dynamic colors, default view,
 * file watcher, and image cache optimization. All settings
 * persist via the app store and setPreference IPC calls.
 */

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

import { getPreferences, setPreference } from '@/services/api';
import { useAppStore } from '@/store';
import type { ThemeName } from '@/types';
import {
  staggerContainer,
  staggerItem,
  reducedStaggerItem,
} from '../animations';

// ---------------------------------------------------------------------------
// Theme card data
// ---------------------------------------------------------------------------

interface ThemeOption {
  id: ThemeName;
  label: string;
  swatches: [string, string, string];
}

const THEMES: ThemeOption[] = [
  { id: 'dark', label: 'Dark', swatches: ['#0a0a0f', '#141420', '#6366f1'] },
  { id: 'light', label: 'Light', swatches: ['#f5f5f7', '#ffffff', '#4f46e5'] },
  { id: 'oled', label: 'OLED', swatches: ['#000000', '#0a0a0a', '#6366f1'] },
  { id: 'retro', label: 'Retro', swatches: ['#1a1008', '#2a1a10', '#f59e0b'] },
];

const themeCardSpring = { type: 'spring' as const, stiffness: 400, damping: 25 };

// ---------------------------------------------------------------------------
// Theme card
// ---------------------------------------------------------------------------

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
          ? 'ring-2 ring-accent border-accent bg-accent/5'
          : 'border-ghost hover:border-ghost-lit bg-surface'
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
// Toggle switch
// ---------------------------------------------------------------------------

interface ToggleSwitchProps {
  enabled: boolean;
  onToggle: () => void;
  label: string;
}

function ToggleSwitch({ enabled, onToggle, label }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ${
        enabled ? 'bg-accent' : 'bg-elevated'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform duration-200 ${
          enabled ? 'translate-x-[22px]' : 'translate-x-[2px]'
        } mt-[2px]`}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PreferencesStep() {
  const shouldReduceMotion = useReducedMotion();
  const itemVariant = shouldReduceMotion ? reducedStaggerItem : staggerItem;

  const currentTheme = useAppStore((s) => s.currentTheme);
  const storeSetTheme = useAppStore((s) => s.setTheme);
  const viewPreference = useAppStore((s) => s.viewPreference);
  const storeSetViewPreference = useAppStore((s) => s.setViewPreference);

  // Local toggle states loaded from preferences
  const [dynamicColorsEnabled, setDynamicColorsEnabled] = useState(true);
  const [fileWatcherEnabled, setFileWatcherEnabled] = useState(true);
  const [optimizeImages, setOptimizeImages] = useState(false);

  // Load preferences on mount
  useEffect(() => {
    getPreferences()
      .then((prefs) => {
        setDynamicColorsEnabled(prefs['dynamic_colors_enabled'] !== 'false');
        setFileWatcherEnabled(prefs['file_watcher_enabled'] !== 'false');
        setOptimizeImages(prefs['optimize_images'] === 'true');
      })
      .catch(console.error);
  }, []);

  const handleToggleDynamicColors = useCallback(() => {
    const next = !dynamicColorsEnabled;
    setDynamicColorsEnabled(next);
    setPreference('dynamic_colors_enabled', next ? 'true' : 'false').catch(
      console.error,
    );
  }, [dynamicColorsEnabled]);

  const handleToggleFileWatcher = useCallback(() => {
    const next = !fileWatcherEnabled;
    setFileWatcherEnabled(next);
    setPreference('file_watcher_enabled', next ? 'true' : 'false').catch(
      console.error,
    );
  }, [fileWatcherEnabled]);

  const handleToggleOptimizeImages = useCallback(() => {
    const next = !optimizeImages;
    setOptimizeImages(next);
    setPreference('optimize_images', next ? 'true' : 'false').catch(
      console.error,
    );
  }, [optimizeImages]);

  return (
    <motion.div
      className="max-w-3xl mx-auto"
      variants={staggerContainer}
      initial="hidden"
      animate="show"
    >
      {/* Header */}
      <motion.div variants={itemVariant}>
        <h2 className="text-2xl font-bold text-text-primary">Preferences</h2>
        <p className="text-sm text-text-secondary mt-2">
          Customize your experience. All of these can be changed later in
          Settings.
        </p>
      </motion.div>

      {/* APPEARANCE */}
      <motion.div variants={itemVariant} className="mt-8">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-text-secondary mb-3">
          Appearance
        </h3>

        {/* Theme picker */}
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

        {/* Dynamic color toggle */}
        <div className="mt-4 rounded-lg border border-ghost bg-surface p-4 flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-text-primary">
              Dynamic Color Palette
            </span>
            <p className="text-xs text-text-secondary mt-0.5">
              Adapt UI accent colors based on game cover art
            </p>
          </div>
          <ToggleSwitch
            enabled={dynamicColorsEnabled}
            onToggle={handleToggleDynamicColors}
            label="Toggle dynamic color palette"
          />
        </div>
      </motion.div>

      {/* LIBRARY */}
      <motion.div variants={itemVariant} className="mt-8">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-text-secondary mb-3">
          Library
        </h3>

        {/* Default view */}
        <div className="rounded-lg border border-ghost bg-surface p-4 flex items-center justify-between">
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
              onClick={() => storeSetViewPreference('grid')}
              aria-pressed={viewPreference === 'grid'}
              className={`px-4 py-1.5 text-xs font-medium transition-colors duration-200 cursor-pointer ${
                viewPreference === 'grid'
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Grid
            </button>
            <button
              type="button"
              onClick={() => storeSetViewPreference('list')}
              aria-pressed={viewPreference === 'list'}
              className={`px-4 py-1.5 text-xs font-medium transition-colors duration-200 cursor-pointer ${
                viewPreference === 'list'
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              List
            </button>
          </div>
        </div>

        {/* Watch for new ROMs */}
        <div className="mt-3 rounded-lg border border-ghost bg-surface p-4 flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-text-primary">
              Watch for New ROMs
            </span>
            <p className="text-xs text-text-secondary mt-0.5">
              Automatically detect when new files are added to your ROM
              directories
            </p>
          </div>
          <ToggleSwitch
            enabled={fileWatcherEnabled}
            onToggle={handleToggleFileWatcher}
            label="Toggle file watcher"
          />
        </div>
      </motion.div>

      {/* STORAGE */}
      <motion.div variants={itemVariant} className="mt-8">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-text-secondary mb-3">
          Storage
        </h3>

        {/* Optimize image cache */}
        <div className="rounded-lg border border-ghost bg-surface p-4 flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-text-primary">
              Optimize Image Cache
            </span>
            <p className="text-xs text-text-secondary mt-0.5">
              Downsample cover art images to save disk space (reduces quality
              slightly)
            </p>
          </div>
          <ToggleSwitch
            enabled={optimizeImages}
            onToggle={handleToggleOptimizeImages}
            label="Toggle image optimization"
          />
        </div>
      </motion.div>
    </motion.div>
  );
}
