/**
 * Emulator configuration panel — per-system emulator path and launch args,
 * with auto-detection support.
 */

import { useCallback, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Badge } from "@/components/Badge";
import { StatusIndicator } from "@/components/StatusIndicator";
import { autoDetectEmulators, setEmulatorConfig } from "@/services/api";
import type { EmulatorConfig, System } from "@/types";

// Stagger container variant — only triggers on initial mount
const staggerContainer = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.03 },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: "easeOut" } },
};

const reducedStaggerItem = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.15 } },
};

export interface EmulatorConfigPanelProps {
  systems: System[];
  configs: EmulatorConfig[];
  onRefresh: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getConfigForSystem(
  configs: EmulatorConfig[],
  systemId: string
): EmulatorConfig | undefined {
  return configs.find((c) => c.system_id === systemId);
}

function isConfigured(config: EmulatorConfig | undefined): boolean {
  return config !== undefined && config.executable_path.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Per-system row
// ---------------------------------------------------------------------------

interface SystemRowProps {
  system: System;
  config: EmulatorConfig | undefined;
  onSave: (config: EmulatorConfig) => Promise<void>;
}

function SystemRow({ system, config, onSave }: SystemRowProps) {
  const [path, setPath] = useState(config?.executable_path ?? "");
  const [args, setArgs] = useState(config?.launch_args ?? "{rom}");
  const [saving, setSaving] = useState(false);

  const configured = isConfigured(config) || path.trim().length > 0;

  const handleBrowse = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ multiple: false, filters: [] });
      if (selected && typeof selected === "string") {
        setPath(selected);
        // Auto-save after browse
        setSaving(true);
        try {
          await onSave({
            id: config?.id ?? null,
            system_id: system.id,
            system_name: system.name,
            executable_path: selected,
            launch_args: args,
            supported_extensions: config?.supported_extensions ?? JSON.stringify(system.extensions),
            auto_detected: false,
            created_at: config?.created_at ?? null,
            updated_at: null,
          });
        } catch (err: unknown) {
          console.error("Failed to save emulator config:", err);
        } finally {
          setSaving(false);
        }
      }
    } catch {
      // Dialog plugin not available (e.g., browser dev mode)
    }
  }, [config, system, args, onSave]);

  const handleBlurSave = useCallback(async () => {
    if (path.trim().length === 0 && !config) return;
    setSaving(true);
    try {
      await onSave({
        id: config?.id ?? null,
        system_id: system.id,
        system_name: system.name,
        executable_path: path,
        launch_args: args,
        supported_extensions: config?.supported_extensions ?? JSON.stringify(system.extensions),
        auto_detected: config?.auto_detected ?? false,
        created_at: config?.created_at ?? null,
        updated_at: null,
      });
    } catch (err: unknown) {
      console.error("Failed to save emulator config:", err);
    } finally {
      setSaving(false);
    }
  }, [path, args, config, system, onSave]);

  const themeColor = system.theme_color ?? "var(--accent)";

  return (
    <div className="rounded-lg border border-ghost bg-surface p-4 transition-colors duration-200 hover:border-ghost-lit">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-3 h-3 rounded-sm flex-shrink-0"
            style={{ backgroundColor: themeColor }}
            aria-hidden="true"
          />
          <span className="text-sm font-semibold text-text-primary">{system.name}</span>
          <Badge
            label={system.extensions.map((e) => `.${e}`).join(", ")}
            className="text-[9px]"
          />
        </div>
        <StatusIndicator
          status={configured ? "configured" : "not_configured"}
          label={configured ? "Configured" : "Not configured"}
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
            onBlur={handleBlurSave}
            className="font-mono text-xs"
            aria-label={`Emulator path for ${system.name}`}
          />
        </div>
        <Button variant="secondary" size="sm" onClick={handleBrowse} disabled={saving}>
          Browse
        </Button>
      </div>

      {/* Launch args */}
      <div className="mt-2">
        <Input
          variant="form"
          placeholder="Launch args (use {rom} for ROM path)"
          value={args}
          onChange={(e) => setArgs(e.target.value)}
          aria-label={`Launch arguments for ${system.name}`}
          onBlur={handleBlurSave}
          className="text-xs"
        />
        <p className="mt-1 text-[10px] text-text-dim">
          Use <code className="font-mono text-accent">{"{rom}"}</code> as a placeholder for the ROM file path.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function EmulatorConfigPanel({
  systems,
  configs,
  onRefresh,
}: EmulatorConfigPanelProps) {
  const shouldReduceMotion = useReducedMotion();
  const hasAnimatedRef = useRef(false);
  const [detecting, setDetecting] = useState(false);
  const [detectResult, setDetectResult] = useState<string | null>(null);

  const handleSaveConfig = useCallback(
    async (config: EmulatorConfig) => {
      try {
        await setEmulatorConfig(config);
        onRefresh();
      } catch (err: unknown) {
        console.error("Failed to save emulator config:", err);
      }
    },
    [onRefresh]
  );

  const handleAutoDetect = useCallback(async () => {
    setDetecting(true);
    setDetectResult(null);
    try {
      const detected = await autoDetectEmulators();
      if (detected.length === 0) {
        setDetectResult("No emulators found. You can configure them manually above.");
      } else {
        // Create/update configs for each detected emulator
        for (const emu of detected) {
          for (const systemId of emu.system_ids) {
            const system = systems.find((s) => s.id === systemId);
            if (!system) continue;
            const existingConfig = getConfigForSystem(configs, systemId);
            await setEmulatorConfig({
              id: existingConfig?.id ?? null,
              system_id: systemId,
              system_name: system.name,
              executable_path: emu.executable_path,
              launch_args: emu.default_args,
              supported_extensions:
                existingConfig?.supported_extensions ??
                JSON.stringify(system.extensions),
              auto_detected: true,
              created_at: existingConfig?.created_at ?? null,
              updated_at: null,
            });
          }
        }
        const systemCount = detected.reduce((acc, d) => acc + d.system_ids.length, 0);
        setDetectResult(
          `Found ${detected.length} emulator${detected.length !== 1 ? "s" : ""} covering ${systemCount} system${systemCount !== 1 ? "s" : ""}.`
        );
        onRefresh();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Auto-detection failed.";
      setDetectResult(msg);
    } finally {
      setDetecting(false);
    }
  }, [systems, configs, onRefresh]);

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold text-text-primary">Emulator Configuration</h2>
      <p className="text-sm text-text-secondary mt-1">
        Configure the emulator executable and launch arguments for each system.
      </p>

      {/* System list */}
      <motion.div
        className="mt-6 space-y-3"
        variants={staggerContainer}
        initial={hasAnimatedRef.current ? false : "hidden"}
        animate="show"
        onAnimationComplete={() => { hasAnimatedRef.current = true; }}
      >
        {systems.map((system) => (
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

        {systems.length === 0 && (
          <div className="py-10 text-center text-sm text-text-dim">
            No systems found. Scan some ROM directories first.
          </div>
        )}
      </motion.div>

      {/* Auto-detect card */}
      <div className="mt-8 rounded-lg border border-accent/30 bg-accent/5 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              Auto-detect Emulators
            </h3>
            <p className="text-xs text-text-secondary mt-0.5">
              Scan common install locations for known emulators on your system.
            </p>
          </div>
          <motion.div
            animate={detecting ? { scale: [1, 1.03, 1] } : {}}
            transition={detecting ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" } : {}}
          >
            <Button
              variant="secondary"
              size="sm"
              onClick={handleAutoDetect}
              disabled={detecting}
            >
              {detecting ? "Scanning..." : "Auto-detect"}
            </Button>
          </motion.div>
        </div>
        {detectResult && (
          <p className="mt-3 text-xs text-text-secondary">{detectResult}</p>
        )}
      </div>
    </div>
  );
}
