import { PlatformAccessory } from 'homebridge';
import { CreateFanPlatform } from './platform.js';
import type { PlatformAccessoryContext } from './types.js';
export declare class FanAccessory {
    private readonly platform;
    private readonly accessory;
    private readonly Characteristic;
    private readonly log;
    private readonly tuyaDevice;
    private readonly mapping;
    private readonly features;
    private readonly deviceName;
    private readonly fanService;
    private lightService?;
    private speedSwitches;
    private tempSwitches;
    private timerSwitches;
    private isConnecting;
    private isConnected;
    private reconnectDelay;
    private reconnectTimer?;
    private pollTimer?;
    private state;
    private lastUpdateTime;
    private readonly UPDATE_DEBOUNCE_MS;
    constructor(platform: CreateFanPlatform, accessory: PlatformAccessory<PlatformAccessoryContext>);
    private connect;
    private scheduleReconnect;
    private startPolling;
    private stopPolling;
    private refreshState;
    private handleData;
    private applyDps;
    private parseDirection;
    private sendCommand;
    private setFanActive;
    private setFanDirection;
    private setupSpeedButtons;
    private setSpeedStep;
    private updateSpeedButtons;
    private setLightOn;
    private setupTempButtons;
    private activateTempPreset;
    private performTempCycle;
    private setupTimerButtons;
    /**
     * Remove the legacy single Switch service that the old plugin used for
     * "Toggle Light". Avoids orphaned services in HomeKit cache.
     */
    private cleanupLegacyServices;
    private delay;
}
