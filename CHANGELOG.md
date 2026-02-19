# Changelog

## 0.1.0

Initial release. Inspired by [moifort/homebridge-create-fan](https://github.com/moifort/homebridge-create-fan).

### Features
- **FanV2 service** with power, speed (discrete steps mapped to 0–100%), and optional rotation direction.
- **Lightbulb service** with power on/off.
- **Light temperature preset buttons** – 3 momentary switches for cycling through warm/neutral/cool modes.
- **Timer preset buttons** – 1h/2h/4h momentary switches (when device exposes timer DPS).
- **State sync** – real-time updates via TuyAPI `data` and `dp-refresh` events, plus configurable polling fallback.
- **Configurable DPS mapping** per device – no hard-coded DPS numbers.
- **Secrets management** – three modes: `inline`, `env` (environment variables), `storage` (external JSON file).
- **Automatic reconnection** with exponential backoff.
