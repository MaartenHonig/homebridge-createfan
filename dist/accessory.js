import { MAX_RECONNECT_DELAY, INITIAL_RECONNECT_DELAY, } from './settings.js';
import TuyAPI from 'tuyapi';
export class FanAccessory {
    platform;
    accessory;
    Characteristic;
    log;
    tuyaDevice;
    mapping;
    features;
    deviceName;
    // Services
    fanService;
    lightService;
    speedSwitches = [];
    tempSwitches = [];
    timerSwitches = [];
    // Connection state
    isConnecting = false;
    isConnected = false;
    reconnectDelay = INITIAL_RECONNECT_DELAY;
    reconnectTimer;
    pollTimer;
    // Device state cache
    state = {
        fanActive: false,
        fanSpeed: 1,
        fanDirection: 0, // 0 = clockwise, 1 = counter-clockwise
        lightOn: false,
        currentTempIndex: 0, // index into lightTempValues
        timerRemaining: 0, // minutes remaining on timer
    };
    // Debounce: prevent re-entrant HomeKit updates within a window
    lastUpdateTime = 0;
    UPDATE_DEBOUNCE_MS = 200;
    constructor(platform, accessory) {
        this.platform = platform;
        this.accessory = accessory;
        this.Characteristic = this.platform.Characteristic;
        this.log = this.platform.log;
        this.mapping = accessory.context.device.mapping;
        this.features = accessory.context.device.features;
        this.deviceName = accessory.context.device.name;
        this.log.info(`[${this.deviceName}]`, 'Initializing accessory…');
        // ── Accessory Information ────────────────────────────────────
        this.accessory
            .getService(this.platform.Service.AccessoryInformation)
            .setCharacteristic(this.Characteristic.Manufacturer, 'CREATE')
            .setCharacteristic(this.Characteristic.Model, accessory.context.device.model)
            .setCharacteristic(this.Characteristic.Name, this.deviceName)
            .setCharacteristic(this.Characteristic.SerialNumber, accessory.context.device.id);
        // ── Fan Service (FanV2) ──────────────────────────────────────
        this.fanService =
            this.accessory.getService(this.platform.Service.Fanv2) ||
                this.accessory.addService(this.platform.Service.Fanv2);
        this.fanService.setCharacteristic(this.Characteristic.Name, this.deviceName);
        this.fanService
            .getCharacteristic(this.Characteristic.Active)
            .onGet(() => this.state.fanActive ? 1 : 0)
            .onSet(this.setFanActive.bind(this));
        // Remove RotationSpeed if previously cached (we use speed buttons instead)
        const existingRotation = this.fanService.getCharacteristic(this.Characteristic.RotationSpeed);
        if (existingRotation) {
            this.fanService.removeCharacteristic(existingRotation);
        }
        if (this.features.enableDirection && this.mapping.fanDirectionDps !== undefined) {
            this.fanService
                .getCharacteristic(this.Characteristic.RotationDirection)
                .onGet(() => this.state.fanDirection)
                .onSet(this.setFanDirection.bind(this));
        }
        // ── Light Service ────────────────────────────────────────────
        if (this.features.enableLight) {
            this.lightService =
                this.accessory.getService(this.platform.Service.Lightbulb) ||
                    this.accessory.addService(this.platform.Service.Lightbulb);
            this.lightService.displayName = `${this.deviceName} Light`;
            this.lightService.setCharacteristic(this.Characteristic.Name, `${this.deviceName} Light`);
            this.lightService.setCharacteristic(this.Characteristic.ConfiguredName, `${this.deviceName} Light`);
            this.lightService
                .getCharacteristic(this.Characteristic.On)
                .onGet(() => this.state.lightOn)
                .onSet(this.setLightOn.bind(this));
        }
        else {
            // Remove light service if it was previously cached but now disabled
            const existing = this.accessory.getService(this.platform.Service.Lightbulb);
            if (existing) {
                this.accessory.removeService(existing);
            }
        }
        // ── Speed Preset Buttons ────────────────────────────────────
        this.setupSpeedButtons();
        // ── Temperature Preset Buttons ───────────────────────────────
        this.setupTempButtons();
        // ── Timer Preset Buttons ─────────────────────────────────────
        this.setupTimerButtons();
        // ── Remove legacy toggle switch if present ───────────────────
        this.cleanupLegacyServices();
        // ── Tuya device ──────────────────────────────────────────────
        this.tuyaDevice = new TuyAPI({
            id: accessory.context.device.id,
            key: accessory.context.device.key,
        });
        this.tuyaDevice.on('connected', () => {
            this.log.info(`[${this.deviceName}]`, 'Connected');
            this.isConnected = true;
            this.isConnecting = false;
            this.reconnectDelay = INITIAL_RECONNECT_DELAY;
            // Small delay before first refresh to avoid ECONNRESET
            setTimeout(() => {
                if (this.isConnected) {
                    this.refreshState();
                    this.startPolling();
                }
            }, 2000);
        });
        this.tuyaDevice.on('disconnected', () => {
            this.log.info(`[${this.deviceName}]`, 'Disconnected');
            this.isConnected = false;
            this.stopPolling();
            this.scheduleReconnect();
        });
        this.tuyaDevice.on('error', (error) => {
            this.log.warn(`[${this.deviceName}]`, `Error: ${error.message}`);
        });
        this.tuyaDevice.on('dp-refresh', (data, _cmd, _seq) => this.handleData(data));
        this.tuyaDevice.on('data', (data, _cmd, _seq) => this.handleData(data));
        this.connect();
    }
    // ════════════════════════════════════════════════════════════════
    //  CONNECTION MANAGEMENT
    // ════════════════════════════════════════════════════════════════
    async connect() {
        if (this.isConnecting || this.isConnected) {
            return;
        }
        this.isConnecting = true;
        this.log.info(`[${this.deviceName}]`, 'Connecting…');
        try {
            await this.tuyaDevice.find();
            await this.tuyaDevice.connect();
        }
        catch (err) {
            this.isConnecting = false;
            this.log.warn(`[${this.deviceName}]`, `Connection failed: ${err}`);
            this.scheduleReconnect();
        }
    }
    scheduleReconnect() {
        if (this.reconnectTimer) {
            return;
        }
        this.log.debug(`[${this.deviceName}]`, `Reconnecting in ${this.reconnectDelay / 1000}s…`);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = undefined;
            this.connect();
        }, this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY);
    }
    startPolling() {
        this.stopPolling();
        const interval = this.platform.pollingInterval;
        if (interval > 0) {
            this.pollTimer = setInterval(() => this.refreshState(), interval);
            this.log.debug(`[${this.deviceName}]`, `Polling every ${interval / 1000}s`);
        }
    }
    stopPolling() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = undefined;
        }
    }
    // ════════════════════════════════════════════════════════════════
    //  STATE SYNC
    // ════════════════════════════════════════════════════════════════
    async refreshState() {
        if (!this.isConnected) {
            return;
        }
        try {
            // dp-refresh triggers the data event with all DPS values
            await this.tuyaDevice.refresh({ schema: true });
        }
        catch (err) {
            this.log.debug(`[${this.deviceName}]`, `Refresh failed: ${err}`);
        }
    }
    handleData(data) {
        if (!data?.dps) {
            return;
        }
        // Cast tuyapi's loose Object type to a usable Record
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dps = data.dps;
        // Log raw DPS for mapping discovery
        this.log.debug(`[${this.deviceName}]`, `Raw DPS: ${JSON.stringify(dps)}`);
        const now = Date.now();
        if (now - this.lastUpdateTime < this.UPDATE_DEBOUNCE_MS) {
            this.applyDps(dps, false);
            return;
        }
        this.lastUpdateTime = now;
        this.applyDps(dps, true);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    applyDps(dps, pushToHomeKit) {
        const m = this.mapping;
        // Fan power
        const fanPower = dps[String(m.fanPowerDps)];
        if (fanPower !== undefined) {
            this.state.fanActive = !!fanPower;
            if (pushToHomeKit) {
                this.fanService.updateCharacteristic(this.Characteristic.Active, this.state.fanActive ? 1 : 0);
            }
        }
        // Fan speed
        const fanSpeed = dps[String(m.fanSpeedDps)];
        if (fanSpeed !== undefined) {
            this.state.fanSpeed = Number(fanSpeed);
            if (pushToHomeKit) {
                this.updateSpeedButtons();
            }
        }
        // Fan direction
        if (m.fanDirectionDps !== undefined) {
            const dir = dps[String(m.fanDirectionDps)];
            if (dir !== undefined) {
                // Device may use string "forward"/"reverse", bool, or number
                this.state.fanDirection = this.parseDirection(dir);
                if (pushToHomeKit && this.features.enableDirection) {
                    this.fanService.updateCharacteristic(this.Characteristic.RotationDirection, this.state.fanDirection);
                }
            }
        }
        // Light power
        const lightPower = dps[String(m.lightPowerDps)];
        if (lightPower !== undefined) {
            this.state.lightOn = !!lightPower;
            if (pushToHomeKit && this.lightService) {
                this.lightService.updateCharacteristic(this.Characteristic.On, this.state.lightOn);
            }
        }
        // Light temperature (direct value from DPS 23)
        if (m.lightTempModeDps !== undefined) {
            const tempVal = dps[String(m.lightTempModeDps)];
            if (tempVal !== undefined) {
                const idx = m.lightTempValues.indexOf(Number(tempVal));
                if (idx >= 0) {
                    this.state.currentTempIndex = idx;
                }
                if (pushToHomeKit) {
                    this.updateTempButtons();
                }
            }
        }
        // Timer remaining (DPS 64 = minutes)
        if (m.timerDps !== undefined) {
            const timerVal = dps[String(m.timerDps)];
            if (timerVal !== undefined) {
                this.state.timerRemaining = Number(timerVal);
                if (pushToHomeKit) {
                    this.updateTimerButtons();
                }
            }
        }
        this.log.debug(`[${this.deviceName}]`, `State: fan=${this.state.fanActive ? 'ON' : 'OFF'} speed=${this.state.fanSpeed} ` +
            `light=${this.state.lightOn ? 'ON' : 'OFF'} temp=${this.state.currentTempIndex} ` +
            `timer=${this.state.timerRemaining}m`);
    }
    parseDirection(value) {
        if (typeof value === 'boolean') {
            return value ? 1 : 0;
        }
        if (typeof value === 'string') {
            return value === 'reverse' || value === '1' ? 1 : 0;
        }
        return value ? 1 : 0;
    }
    // ════════════════════════════════════════════════════════════════
    //  TUYA COMMAND HELPER
    // ════════════════════════════════════════════════════════════════
    sendCommand(dps, value) {
        this.log.debug(`[${this.deviceName}]`, `sendCommand(dps=${dps}, value=${value})`);
        if (!this.isConnected) {
            this.log.warn(`[${this.deviceName}]`, 'Not connected – command dropped');
            return;
        }
        this.tuyaDevice.set({ dps, set: value });
    }
    // ════════════════════════════════════════════════════════════════
    //  FAN HANDLERS
    // ════════════════════════════════════════════════════════════════
    setFanActive(value) {
        const active = value === 1;
        this.state.fanActive = active;
        this.sendCommand(this.mapping.fanPowerDps, active);
        this.log.debug(`[${this.deviceName}]`, `setFanActive → ${active ? 'ACTIVE' : 'INACTIVE'}`);
        // Update speed buttons to reflect state
        if (!active) {
            this.updateSpeedButtons();
        }
    }
    setFanDirection(value) {
        const dir = value;
        this.state.fanDirection = dir;
        if (this.mapping.fanDirectionDps !== undefined) {
            this.sendCommand(this.mapping.fanDirectionDps, dir === 1 ? 'reverse' : 'forward');
        }
        this.log.debug(`[${this.deviceName}]`, `setFanDirection → ${dir === 0 ? 'CW' : 'CCW'}`);
    }
    // ════════════════════════════════════════════════════════════════
    //  SPEED PRESET BUTTONS
    // ════════════════════════════════════════════════════════════════
    setupSpeedButtons() {
        const min = this.mapping.fanSpeedMin;
        const max = this.mapping.fanSpeedMax;
        for (let step = min; step <= max; step++) {
            const name = `Speed ${step}`;
            const subtype = `speed-preset-${step}`;
            const svc = this.accessory.getServiceById(this.platform.Service.Switch, subtype) ||
                this.accessory.addService(this.platform.Service.Switch, name, subtype);
            svc.displayName = name;
            svc.setCharacteristic(this.Characteristic.Name, name);
            svc.setCharacteristic(this.Characteristic.ConfiguredName, name);
            const currentStep = step; // capture for closure
            svc
                .getCharacteristic(this.Characteristic.On)
                .onGet(() => this.state.fanActive && this.state.fanSpeed === currentStep)
                .onSet((value) => {
                if (value) {
                    this.setSpeedStep(currentStep);
                }
                else {
                    // User turned off active speed button → turn fan off
                    if (this.state.fanSpeed === currentStep && this.state.fanActive) {
                        this.state.fanActive = false;
                        this.sendCommand(this.mapping.fanPowerDps, false);
                        this.fanService.updateCharacteristic(this.Characteristic.Active, 0);
                        this.log.debug(`[${this.deviceName}]`, `Speed ${currentStep} toggled off → fan OFF`);
                    }
                    this.updateSpeedButtons();
                }
            });
            this.speedSwitches.push(svc);
        }
    }
    setSpeedStep(step) {
        // Turn fan on if needed
        if (!this.state.fanActive) {
            this.state.fanActive = true;
            this.sendCommand(this.mapping.fanPowerDps, true);
            this.fanService.updateCharacteristic(this.Characteristic.Active, 1);
        }
        this.state.fanSpeed = step;
        this.sendCommand(this.mapping.fanSpeedDps, step);
        this.updateSpeedButtons();
        this.log.debug(`[${this.deviceName}]`, `setSpeed → step ${step}`);
    }
    updateSpeedButtons() {
        const min = this.mapping.fanSpeedMin;
        for (let i = 0; i < this.speedSwitches.length; i++) {
            const step = min + i;
            const isActive = this.state.fanActive && this.state.fanSpeed === step;
            this.speedSwitches[i].updateCharacteristic(this.Characteristic.On, isActive);
        }
    }
    // ════════════════════════════════════════════════════════════════
    //  LIGHT HANDLERS
    // ════════════════════════════════════════════════════════════════
    setLightOn(value) {
        const on = value;
        this.state.lightOn = on;
        this.sendCommand(this.mapping.lightPowerDps, on);
        this.log.debug(`[${this.deviceName}]`, `setLightOn → ${on ? 'ON' : 'OFF'}`);
    }
    // ════════════════════════════════════════════════════════════════
    //  TEMPERATURE PRESET BUTTONS
    // ════════════════════════════════════════════════════════════════
    setupTempButtons() {
        if (!this.features.enableTempButtons || !this.features.enableLight) {
            // Remove any previously cached temp switches
            for (let i = 0; i < 3; i++) {
                const existing = this.accessory.getServiceById(this.platform.Service.Switch, `temp-preset-${i}`);
                if (existing) {
                    this.accessory.removeService(existing);
                }
            }
            return;
        }
        const labels = ['Warm', 'Neutral', 'Cool'];
        const values = this.mapping.lightTempValues;
        for (let i = 0; i < values.length; i++) {
            const name = labels[i] ?? `Temp ${i + 1}`;
            const subtype = `temp-preset-${i}`;
            const svc = this.accessory.getServiceById(this.platform.Service.Switch, subtype) ||
                this.accessory.addService(this.platform.Service.Switch, name, subtype);
            svc.displayName = name;
            svc.setCharacteristic(this.Characteristic.Name, name);
            svc.setCharacteristic(this.Characteristic.ConfiguredName, name);
            const targetIndex = i;
            svc
                .getCharacteristic(this.Characteristic.On)
                .onGet(() => this.state.lightOn && this.state.currentTempIndex === targetIndex)
                .onSet((value) => {
                if (value) {
                    this.setTempPreset(targetIndex);
                }
                // Ignore off — we update buttons via updateTempButtons
            });
            this.tempSwitches.push(svc);
        }
    }
    setTempPreset(targetIndex) {
        const m = this.mapping;
        const value = m.lightTempValues[targetIndex];
        // Turn light on if needed
        if (!this.state.lightOn) {
            this.state.lightOn = true;
            this.sendCommand(m.lightPowerDps, true);
            if (this.lightService) {
                this.lightService.updateCharacteristic(this.Characteristic.On, true);
            }
        }
        // Direct write to temp DPS
        if (m.lightTempModeDps !== undefined) {
            this.sendCommand(m.lightTempModeDps, value);
        }
        this.state.currentTempIndex = targetIndex;
        this.updateTempButtons();
        this.log.debug(`[${this.deviceName}]`, `setTemp → ${['Warm', 'Neutral', 'Cool'][targetIndex]} (${value})`);
    }
    updateTempButtons() {
        for (let i = 0; i < this.tempSwitches.length; i++) {
            const isActive = this.state.lightOn && this.state.currentTempIndex === i;
            this.tempSwitches[i].updateCharacteristic(this.Characteristic.On, isActive);
        }
    }
    // ════════════════════════════════════════════════════════════════
    //  TIMER PRESET BUTTONS
    // ════════════════════════════════════════════════════════════════
    setupTimerButtons() {
        if (!this.features.enableTimerButtons || this.mapping.timerDps === undefined) {
            // Remove previously cached timer switches
            for (const val of (this.mapping.timerValues ?? [])) {
                const existing = this.accessory.getServiceById(this.platform.Service.Switch, `timer-preset-${val}`);
                if (existing) {
                    this.accessory.removeService(existing);
                }
            }
            return;
        }
        const timerDps = this.mapping.timerDps;
        const values = this.mapping.timerValues;
        for (let i = 0; i < values.length; i++) {
            const minutes = values[i];
            const label = minutes >= 60 ? `Timer ${Math.round(minutes / 60)}h` : `Timer ${minutes}m`;
            const subtype = `timer-preset-${minutes}`;
            const svc = this.accessory.getServiceById(this.platform.Service.Switch, subtype) ||
                this.accessory.addService(this.platform.Service.Switch, label, subtype);
            svc.displayName = label;
            svc.setCharacteristic(this.Characteristic.Name, label);
            svc.setCharacteristic(this.Characteristic.ConfiguredName, label);
            const timerMinutes = minutes;
            svc
                .getCharacteristic(this.Characteristic.On)
                .onGet(() => this.state.timerRemaining === timerMinutes)
                .onSet((value) => {
                if (value) {
                    this.sendCommand(timerDps, timerMinutes);
                    this.state.timerRemaining = timerMinutes;
                    this.updateTimerButtons();
                    this.log.info(`[${this.deviceName}]`, `Timer set → ${timerMinutes} min`);
                }
                else {
                    // Toggle off = cancel timer
                    if (this.state.timerRemaining === timerMinutes) {
                        this.sendCommand(timerDps, 0);
                        this.state.timerRemaining = 0;
                        this.updateTimerButtons();
                        this.log.info(`[${this.deviceName}]`, 'Timer cancelled');
                    }
                }
            });
            this.timerSwitches.push(svc);
        }
    }
    updateTimerButtons() {
        for (let i = 0; i < this.timerSwitches.length; i++) {
            const minutes = this.mapping.timerValues[i];
            const isActive = this.state.timerRemaining === minutes;
            this.timerSwitches[i].updateCharacteristic(this.Characteristic.On, isActive);
        }
    }
    // ════════════════════════════════════════════════════════════════
    //  CLEANUP
    // ════════════════════════════════════════════════════════════════
    /**
     * Remove the legacy single Switch service that the old plugin used for
     * "Toggle Light". Avoids orphaned services in HomeKit cache.
     */
    cleanupLegacyServices() {
        // The old code added a Switch service without a subtype for "Toggle Light".
        // We now use subtyped switches for temp/timer, so remove the un-subtyped one.
        const services = this.accessory.services.filter((s) => s.UUID === this.platform.Service.Switch.UUID &&
            !s.subtype);
        for (const svc of services) {
            this.log.info(`[${this.deviceName}]`, 'Removing legacy toggle switch service');
            this.accessory.removeService(svc);
        }
    }
    // ════════════════════════════════════════════════════════════════
    //  UTILITIES
    // ════════════════════════════════════════════════════════════════
    delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
//# sourceMappingURL=accessory.js.map