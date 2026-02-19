/**
 * Types for the homebridge-create-fan plugin.
 */
export type SecretsMode = 'inline' | 'env' | 'storage';
export interface SecretsConfig {
    mode: SecretsMode;
    /** Filename inside Homebridge storagePath, default "create-fan-secrets.json" */
    storageFile?: string;
}
export interface StorageSecretsFile {
    devices: Record<string, {
        id: string;
        key: string;
    }>;
}
export interface ResolvedSecret {
    id: string;
    key: string;
}
export interface DpsMapping {
    fanPowerDps: number;
    fanSpeedDps: number;
    fanDirectionDps?: number;
    fanSpeedMin: number;
    fanSpeedMax: number;
    lightPowerDps: number;
    lightTempModeDps?: number;
    lightTempCycleDps?: number;
    lightTempCycleMethod?: 'dpsPulse' | 'lightToggle';
    lightTempValues: number[];
    timerDps?: number;
    timerValues: number[];
}
export interface FeatureFlags {
    enableLight: boolean;
    enableDirection: boolean;
    enableTimerButtons: boolean;
    enableTempButtons: boolean;
}
export interface DeviceConfig {
    name: string;
    id?: string;
    key?: string;
    idEnv?: string;
    keyEnv?: string;
    deviceKey?: string;
    model?: string;
    mapping?: Partial<DpsMapping>;
    features?: Partial<FeatureFlags>;
}
export interface ResolvedDevice {
    name: string;
    id: string;
    key: string;
    model: string;
    mapping: DpsMapping;
    features: FeatureFlags;
}
export interface CreateFanPlatformConfig {
    platform: string;
    name: string;
    devices: DeviceConfig[];
    pollingIntervalSeconds: number;
    secrets: SecretsConfig;
}
export interface PlatformAccessoryContext {
    device: ResolvedDevice;
}
