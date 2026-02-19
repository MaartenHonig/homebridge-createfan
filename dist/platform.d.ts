import type { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import type { DeviceConfig, PlatformAccessoryContext, SecretsConfig } from './types.js';
export type { PlatformAccessoryContext };
export declare class CreateFanPlatform implements DynamicPlatformPlugin {
    readonly log: Logging;
    readonly config: PlatformConfig;
    readonly api: API;
    readonly Service: typeof Service;
    readonly Characteristic: typeof Characteristic;
    readonly accessories: Map<string, PlatformAccessory<PlatformAccessoryContext>>;
    readonly discoveredCacheUUIDs: string[];
    readonly pollingInterval: number;
    readonly secretsConfig: SecretsConfig;
    constructor(log: Logging, config: PlatformConfig, api: API);
    discoverDevices(devices: DeviceConfig[]): void;
    configureAccessory(accessory: PlatformAccessory): void;
}
