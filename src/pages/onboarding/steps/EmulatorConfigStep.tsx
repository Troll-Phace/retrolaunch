/**
 * Onboarding step 3 — Emulator Configuration.
 *
 * Simplified emulator setup: auto-detect button, per-system path input with
 * browse, filtered to only show systems the user actually has games for.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Badge } from '@/components/Badge';
import { StatusIndicator } from '@/components/StatusIndicator';
import {
  autoDetectEmulators,
  getEmulatorConfigs,
  getSystems,
  setEmulatorConfig,
} from '@/services/api';
import {
  staggerContainer,
  staggerItem,
  reducedStaggerItem,
} from '../animations';
import type { WizardData } from '../hooks/useOnboardingState';
import type { EmulatorConfig, System } from '@/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EmulatorConfigStepProps {
  wizardData: WizardData;
  updateWizardData: (partial: Partial<WizardData>) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getConfigForSystem(
  configs: EmulatorConfig[],
  systemId: string,
): EmulatorConfig | undefined {
  return configs.find((c) => c.system_id === systemId);
}

function isConfigured(config: EmulatorConfig | undefined): boolean {
  return config !== undefined && config.executable_path.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Per-system row (simplified — no launch args for onboarding)
// ---------------------------------------------------------------------------

interface SystemRowProps {
  system: System;
  config: EmulatorConfig | undefined;
  onSave: (config: EmulatorConfig) => Promise<void>;
}

function SystemRow({ system, config, onSave }: SystemRowProps) {
  const [path, setPath] = useState(config?.executable_path ?? '');
  const [saving, setSaving] = useState(false);

  // Sync when config changes (e.g. after auto-detect)
  useEffect(() => {
    setPath(config?.executable_path ?? '');
  }, [config?.executable_path]);

  const configured = isConfigured(config) || path.trim().length > 0;
  const themeColor = system.theme_color ?? 'var(--accent)';

  const saveConfig = useCallback(
    async (execPath: string) => {
      setSaving(true);
      try {
        await onSave({
          id: config?.id ?? null,
          system_id: system.id,
          system_name: system.name,
          executable_path: execPath,
          launch_args: config?.launch_args ?? '{rom}',
          supported_extensions:
            config?.supported_extensions ?? JSON.stringify(system.extensions),
          auto_detected: false,
          created_at: config?.created_at ?? null,
          updated_at: null,
        });
      } catch (err: unknown) {
        console.error('Failed to save emulator config:', err);
      } finally {
        setSaving(false);
      }
    },
    [config, system, onSave],
  );

  const handleBrowse = useCallback(async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ multiple: false, filters: [] });
      if (selected && typeof selected === 'string') {
        setPath(selected);
        await saveConfig(selected);
      }
    } catch {
      // Dialog not available
    }
  }, [saveConfig]);

  const handleBlur = useCallback(() => {
    if (path.trim().length === 0 && !config) return;
    void saveConfig(path);
  }, [path, config, saveConfig]);

  return (
    <div className="rounded-lg border border-ghost bg-surface p-4 transition-colors duration-200 hover:border-ghost-lit">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-3 h-3 rounded-sm flex-shrink-0"
            style={{ backgroundColor: themeColor }}
            aria-hidden="true"
          />
          <span className="text-sm font-semibold text-text-primary">{system.name}</span>
          <Badge
            label={system.extensions.map((e) => `.${e}`).join(', ')}
            className="text-[9px]"
          />
        </div>
        <StatusIndicator
          status={configured ? 'configured' : 'not_configured'}
          label={configured ? 'Configured' : 'Not configured'}
        />
      </div>

      {/* Path input */}
      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            variant="form"
            placeholder="Path to emulator executable..."
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onBlur={handleBlur}
            className="font-mono text-xs"
            aria-label={`Emulator path for ${system.name}`}
          />
        </div>
        <Button variant="secondary" size="sm" onClick={handleBrowse} disabled={saving}>
          Browse
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main step component
// ---------------------------------------------------------------------------

export function EmulatorConfigStep({ wizardData, updateWizardData }: EmulatorConfigStepProps) {
  const shouldReduceMotion = useReducedMotion();
  const hasAnimatedRef = useRef(false);
  const [systems, setSystems] = useState<System[]>([]);
  const [configs, setConfigs] = useState<EmulatorConfig[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [detectResult, setDetectResult] = useState<string | null>(null);

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const refreshData = useCallback(async () => {
    try {
      const [allSystems, allConfigs] = await Promise.all([
        getSystems(),
        getEmulatorConfigs(),
      ]);
      setSystems(allSystems);
      setConfigs(allConfigs);

      // Count configured systems
      const configuredCount = allConfigs.filter(
        (c) => c.executable_path.trim().length > 0,
      ).length;
      updateWizardData({ emulatorsConfigured: configuredCount });
    } catch {
      // non-critical
    }
  }, [updateWizardData]);

  useEffect(() => {
    void refreshData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -----------------------------------------------------------------------
  // Filter systems to only those detected, or show all as fallback
  // -----------------------------------------------------------------------

  const filteredSystems =
    wizardData.systemsDetected.length > 0
      ? systems.filter((s) => wizardData.systemsDetected.includes(s.id))
      : systems;

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleSaveConfig = useCallback(
    async (config: EmulatorConfig) => {
      await setEmulatorConfig(config);
      await refreshData();
    },
    [refreshData],
  );

  const handleAutoDetect = useCallback(async () => {
    setDetecting(true);
    setDetectResult(null);
    try {
      const detected = await autoDetectEmulators();
      if (detected.length === 0) {
        setDetectResult('No emulators found. You can configure them manually below.');
      } else {
        for (const emu of detected) {
          for (const systemId of emu.system_ids) {
            const system = systems.find((s) => s.id === systemId);
            if (!system) continue;
            const existing = getConfigForSystem(configs, systemId);
            await setEmulatorConfig({
              id: existing?.id ?? null,
              system_id: systemId,
              system_name: system.name,
              executable_path: emu.executable_path,
              launch_args: emu.default_args,
              supported_extensions:
                existing?.supported_extensions ?? JSON.stringify(system.extensions),
              auto_detected: true,
              created_at: existing?.created_at ?? null,
              updated_at: null,
            });
          }
        }
        const systemCount = detected.reduce((acc, d) => acc + d.system_ids.length, 0);
        setDetectResult(
          `Found ${detected.length} emulator${detected.length !== 1 ? 's' : ''} covering ${systemCount} system${systemCount !== 1 ? 's' : ''}.`,
        );
        await refreshData();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Auto-detection failed.';
      setDetectResult(msg);
    } finally {
      setDetecting(false);
    }
  }, [systems, configs, refreshData]);

  // -----------------------------------------------------------------------
  // Derived
  // -----------------------------------------------------------------------

  const configuredCount = configs.filter(
    (c) =>
      c.executable_path.trim().length > 0 &&
      filteredSystems.some((s) => s.id === c.system_id),
  ).length;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header */}
      <h2 className="text-2xl font-bold text-text-primary">Set Up Your Emulators</h2>
      <p className="text-sm text-text-secondary mt-2">
        Point each detected system to its emulator executable.
      </p>

      {/* Auto-detect banner */}
      <div className="mt-6 rounded-lg border border-accent/30 bg-accent/5 p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-text-primary">Auto-detect Emulators</h3>
            <p className="text-xs text-text-secondary mt-0.5">
              Scan common install locations for known emulators on your system.
            </p>
          </div>
          <motion.div
            animate={detecting ? { scale: [1, 1.03, 1] } : {}}
            transition={
              detecting
                ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' }
                : {}
            }
          >
            <Button
              variant="secondary"
              size="sm"
              onClick={handleAutoDetect}
              disabled={detecting}
            >
              {detecting ? 'Scanning...' : 'Auto-detect'}
            </Button>
          </motion.div>
        </div>
        {detectResult && (
          <p className="mt-3 text-xs text-text-secondary">{detectResult}</p>
        )}
      </div>

      {/* System rows */}
      {filteredSystems.length > 0 ? (
        <motion.div
          className="mt-6 space-y-3 max-h-[400px] overflow-y-auto pr-1"
          variants={staggerContainer}
          initial={!hasAnimatedRef.current ? 'hidden' : false}
          animate="show"
          onAnimationComplete={() => { hasAnimatedRef.current = true; }}
        >
          {filteredSystems.map((system) => (
            <motion.div
              key={system.id}
              variants={shouldReduceMotion ? reducedStaggerItem : staggerItem}
            >
              <SystemRow
                system={system}
                config={getConfigForSystem(configs, system.id)}
                onSave={handleSaveConfig}
              />
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <div className="mt-10 text-center text-sm text-text-dim">
          No systems detected yet. You can configure emulators later in Settings.
        </div>
      )}

      {/* Status summary */}
      {filteredSystems.length > 0 && (
        <p className="mt-6 text-sm text-text-secondary">
          {configuredCount} of {filteredSystems.length} system
          {filteredSystems.length !== 1 ? 's' : ''} configured
        </p>
      )}
    </div>
  );
}
