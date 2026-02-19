import { PLATFORM_NAME, PLUGIN_NAME, DEFAULT_POLLING_INTERVAL } from './settings.js';
import { FanAccessory } from './accessory.js';
import { resolveSecret } from './secrets.js';
import { buildDeviceConfig } from './mapping.js';
export class CreateFanPlatform {
    log;
    config;
    api;
    Service;
    Characteristic;
    accessories = new Map();
    discoveredCacheUUIDs = [];
    pollingInterval;
    secretsConfig;
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;
        this.Service = api.hap.Service;
        this.Characteristic = api.hap.Characteristic;
        // Parse top-level config
        const cfg = config;
        this.pollingInterval = (cfg.pollingIntervalSeconds ?? DEFAULT_POLLING_INTERVAL) * 1000;
        this.secretsConfig = cfg.secrets ?? { mode: 'inline' };
        this.log.debug('Platform:', `Finished initializing platform ${this.config.name}`);
        this.api.on('didFinishLaunching', () => {
            log.debug('Platform:', 'Executed didFinishLaunching callback');
            const devices = cfg.devices;
            if (!devices || !Array.isArray(devices) || devices.length === 0) {
                this.log.warn('No fans specified in the configuration.');
                return;
            }
            this.discoverDevices(devices);
        });
    }
    discoverDevices(devices) {
        for (const deviceCfg of devices) {
            // ── Resolve secrets ────────────────────────────────────────
            const secret = resolveSecret(deviceCfg, this.secretsConfig, this.api.user.storagePath(), this.log);
            if (!secret) {
                this.log.error(`Platform: Skipping device "${deviceCfg.name}" – secret resolution failed.`);
                continue;
            }
            // ── Build resolved device ──────────────────────────────────
            const { mapping, features } = buildDeviceConfig(deviceCfg);
            const resolved = {
                name: deviceCfg.name,
                id: secret.id,
                key: secret.key,
                model: deviceCfg.model ?? 'CREATE Ceiling Fan',
                mapping,
                features,
            };
            const uuid = this.api.hap.uuid.generate(resolved.id);
            const existingFan = this.accessories.get(uuid);
            if (existingFan) {
                this.log.info('Platform:', `Restoring existing accessory from cache → ${existingFan.displayName}`);
                existingFan.context.device = resolved;
                this.api.updatePlatformAccessories([existingFan]);
                new FanAccessory(this, existingFan);
            }
            else {
                this.log.info('Platform:', `Adding new accessory → ${resolved.name}`);
                const accessory = new this.api.platformAccessory(resolved.name, uuid);
                accessory.context.device = resolved;
                new FanAccessory(this, accessory);
                this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
            }
            this.discoveredCacheUUIDs.push(uuid);
        }
        // ── Remove stale cached accessories ──────────────────────────
        for (const [uuid, accessory] of this.accessories) {
            if (!this.discoveredCacheUUIDs.includes(uuid)) {
                this.log.info('Platform:', 'Removing stale accessory from cache →', accessory.displayName);
                this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
            }
        }
    }
    configureAccessory(accessory) {
        this.log.info('Platform:', 'Loading accessory from cache →', accessory.displayName);
        this.accessories.set(accessory.UUID, accessory);
    }
}
//# sourceMappingURL=platform.js.map