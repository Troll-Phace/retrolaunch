/**
 * Settings page — layout shell with sidebar navigation and 7 content panels.
 *
 * Loads shared data on mount and passes it as props to child panels.
 * Provides refresh callbacks that re-fetch data after mutations.
 */

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

import {
  getSystems,
  getEmulatorConfigs,
  getWatchedDirectories,
  getPreferences,
  getDatFiles,
} from "@/services/api";
import type { DatFile, EmulatorConfig, System, WatchedDirectory } from "@/types";

import {
  SettingsSidebar,
  type SettingsSection,
} from "./settings/SettingsSidebar";
import { EmulatorConfigPanel } from "./settings/EmulatorConfigPanel";
import { RomDirectoriesPanel } from "./settings/RomDirectoriesPanel";
import { MetadataApisPanel } from "./settings/MetadataApisPanel";
import { AppearancePanel } from "./settings/AppearancePanel";
import { ControlsPanel } from "./settings/ControlsPanel";
import { AboutPanel } from "./settings/AboutPanel";
import { NoIntroPanel } from "./settings/NoIntroPanel";

// Panel content transition variants
const panelVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const panelTransition = { duration: 0.2, ease: "easeOut" };

// Reduced-motion variants: instant, no movement
const reducedPanelVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

const reducedPanelTransition = { duration: 0.15 };

export function Settings() {
  const shouldReduceMotion = useReducedMotion();
  const [activeSection, setActiveSection] = useState<SettingsSection>("emulators");

  // Shared data
  const [systems, setSystems] = useState<System[]>([]);
  const [configs, setConfigs] = useState<EmulatorConfig[]>([]);
  const [directories, setDirectories] = useState<WatchedDirectory[]>([]);
  const [preferences, setPreferences] = useState<Record<string, string>>({});
  const [_datFiles, setDatFiles] = useState<DatFile[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [sys, emu, dirs, prefs, dats] = await Promise.all([
        getSystems(),
        getEmulatorConfigs(),
        getWatchedDirectories(),
        getPreferences(),
        getDatFiles(),
      ]);
      setSystems(sys);
      setConfigs(emu);
      setDirectories(dirs);
      setPreferences(prefs);
      setDatFiles(dats);
    } catch (err: unknown) {
      console.error("Failed to load settings data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const refresh = useCallback(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-64px)]">
        <div className="w-[260px] flex-shrink-0 bg-surface border-r border-ghost" />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-text-dim">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-64px)]">
      <SettingsSidebar
        activeSection={activeSection}
        onSelect={setActiveSection}
      />

      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeSection}
            variants={shouldReduceMotion ? reducedPanelVariants : panelVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={shouldReduceMotion ? reducedPanelTransition : panelTransition}
          >
            {activeSection === "emulators" && (
              <EmulatorConfigPanel
                systems={systems}
                configs={configs}
                onRefresh={refresh}
              />
            )}
            {activeSection === "directories" && (
              <RomDirectoriesPanel
                directories={directories}
                onRefresh={refresh}
              />
            )}
            {activeSection === "metadata" && (
              <MetadataApisPanel
                preferences={preferences}
                onRefresh={refresh}
              />
            )}
            {activeSection === "nointro" && (
              <NoIntroPanel
                systems={systems}
                onRefresh={refresh}
              />
            )}
            {activeSection === "appearance" && (
              <AppearancePanel
                preferences={preferences}
                onRefresh={refresh}
              />
            )}
            {activeSection === "controls" && <ControlsPanel />}
            {activeSection === "about" && <AboutPanel />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
