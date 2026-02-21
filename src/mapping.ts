import type { DpsMapping, FeatureFlags, DeviceConfig } from './types.js';

// ── Defaults ─────────────────────────────────────────────────────────

const DEFAULT_MAPPING: DpsMapping = {
  fanPowerDps: 60,
  fanSpeedDps: 62,
  fanDirectionDps: 63,
  fanSpeedMin: 1,
  fanSpeedMax: 6,
  lightPowerDps: 20,
  lightTempModeDps: 23,
  lightTempValues: [0, 500, 1000],  // warm, neutral, cool (DPS 23 values)
  timerDps: 64,
  timerValues: [60, 120, 240, 540],   // minutes (1h, 2h, 4h, 9h)
};

export function resolveMapping(partial?: Partial<DpsMapping>): DpsMapping {
  return { ...DEFAULT_MAPPING, ...partial };
}

export function resolveFeatures(mapping: DpsMapping, partial?: Partial<FeatureFlags>): FeatureFlags {
  return {
    enableLight: partial?.enableLight ?? true,
    enableDirection: partial?.enableDirection ?? (mapping.fanDirectionDps !== undefined),
    enableTimerButtons: partial?.enableTimerButtons ?? (mapping.timerDps !== undefined),
    enableTempButtons: partial?.enableTempButtons ?? true,
  };
}

// ── Speed conversion ─────────────────────────────────────────────────

/**
 * Convert HomeKit percentage (0–100) to discrete device step.
 * E.g. min=1, max=6: 0→1, 1–17→1, 18–33→2, …, 84–100→6
 * Uses floor-based mapping so that stepToPercent → percentToStep roundtrips.
 */
export function percentToStep(percent: number, min: number, max: number): number {
  if (percent <= 0) {
    return min;
  }
  const range = max - min;
  const step = min + Math.min(Math.floor(percent * range / 100), range);
  return Math.min(Math.max(step, min), max);
}

/**
 * Convert discrete device step to HomeKit percentage (0–100).
 */
export function stepToPercent(step: number, min: number, max: number): number {
  if (step <= 0) {
    return 0;
  }
  const clamped = Math.min(Math.max(step, min), max);
  const steps = max - min + 1;
  return Math.round(((clamped - min + 1) / steps) * 100);
}

/**
 * Build a full ResolvedDevice-ready mapping + features from a raw DeviceConfig.
 */
export function buildDeviceConfig(device: DeviceConfig) {
  const mapping = resolveMapping(device.mapping);
  const features = resolveFeatures(mapping, device.features);
  return { mapping, features };
}
