/**
 * Platform name users register in Homebridge config.json.
 */
export const PLATFORM_NAME = 'HomebridgeCreateFan';

/**
 * Must match the "name" field in package.json.
 */
export const PLUGIN_NAME = 'homebridge-create-fan';

/** Default polling interval in seconds */
export const DEFAULT_POLLING_INTERVAL = 15;

/** Delay before resetting momentary switch to off (ms) */
export const MOMENTARY_RESET_DELAY = 500;

/** Delay between DPS pulse writes (ms) */
export const DPS_PULSE_DELAY = 300;

/** Maximum reconnect backoff (ms) */
export const MAX_RECONNECT_DELAY = 60000;

/** Initial reconnect delay (ms) */
export const INITIAL_RECONNECT_DELAY = 5000;
