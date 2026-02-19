import type {
  API,
  Characteristic,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
  Service,
} from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME, DEFAULT_POLLING_INTERVAL } from './settings.js';
import { FanAccessory } from './accessory.js';
import { resolveSecret } from './secrets.js';
import { buildDeviceConfig } from './mapping.js';
import type {
  CreateFanPlatformConfig,
  DeviceConfig,
  PlatformAccessoryContext,
  ResolvedDevice,
  SecretsConfig,
} from './types.js';

export type { PlatformAccessoryContext };

export class CreateFanPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly accessories: Map<string, PlatformAccessory<PlatformAccessoryContext>> = new Map();
  public readonly discoveredCacheUUIDs: string[] = [];
  public readonly pollingInterval: number;
  public readonly secretsConfig: SecretsConfig;

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    // Parse top-level config
    const cfg = config as unknown as CreateFanPlatformConfig;
    this.pollingInterval = (cfg.pollingIntervalSeconds ?? DEFAULT_POLLING_INTERVAL) * 1000;
    this.secretsConfig = cfg.secrets ?? { mode: 'inline' };

    this.log.debug('Platform:', `Finished initializing platform ${this.config.name}`);

    this.api.on('didFinishLaunching', () => {
      log.debug('Platform:', 'Executed didFinishLaunching callback');

      const devices: DeviceConfig[] = cfg.devices;
      if (!devices || !Array.isArray(devices) || devices.length === 0) {
        this.log.warn('No fans specified in the configuration.');
        return;
      }

      this.discoverDevices(devices);
    });
  }

  discoverDevices(devices: DeviceConfig[]) {
    for (const deviceCfg of devices) {
      // ── Resolve secrets ────────────────────────────────────────
      const secret = resolveSecret(
        deviceCfg,
        this.secretsConfig,
        this.api.user.storagePath(),
        this.log,
      );

      if (!secret) {
        this.log.error(`Platform: Skipping device "${deviceCfg.name}" – secret resolution failed.`);
        continue;
      }

      // ── Build resolved device ──────────────────────────────────
      const { mapping, features } = buildDeviceConfig(deviceCfg);
      const resolved: ResolvedDevice = {
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
      } else {
        this.log.info('Platform:', `Adding new accessory → ${resolved.name}`);
        const accessory = new this.api.platformAccessory<PlatformAccessoryContext>(resolved.name, uuid);
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

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Platform:', 'Loading accessory from cache →', accessory.displayName);
    this.accessories.set(accessory.UUID, accessory as PlatformAccessory<PlatformAccessoryContext>);
  }
}
