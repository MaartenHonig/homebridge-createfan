# homebridge-create-fan

Control your CREATE ceiling fan from Apple HomeKit via Homebridge.

## Features

- **Fan control**: Power on/off, multi-step speed (mapped to HomeKit 0–100%), rotation direction
- **Light control**: Power on/off
- **Light temperature presets**: 3 momentary buttons that cycle through warm/neutral/cool modes
- **Timer presets**: 1h / 2h / 4h momentary buttons (if your device exposes a timer DPS)
- **State sync**: Real-time updates via TuyAPI events + configurable polling fallback
- **Configurable DPS mapping**: Works with different CREATE fan models by customizing DPS numbers
- **Secrets management**: Keep Tuya credentials out of config.json using environment variables or a storage file

## Installation

Go to the Homebridge UI → Plugins → search for `homebridge-create-fan` → Install.

Or install manually:

```bash
npm install -g homebridge-create-fan
```

---

## Getting Your Device ID and Local Key

Every Tuya-based device (including CREATE fans) communicates locally using a **Device ID** and a **Local Key**. These credentials are only available through the Tuya Cloud — there is no way to extract them from the device itself.

You only need to do this **once per device**. After you have the ID and key, the plugin communicates directly with the fan over your local network — no cloud connection needed.

### Option A: Browser-only (Tuya IoT Platform)

This method requires no extra software — just a browser and the Smart Life / Tuya Smart app on your phone.

#### Step 1: Pair your fan

1. Install the **Smart Life** app ([iOS](https://apps.apple.com/app/smart-life-smart-living/id1115101477) / [Android](https://play.google.com/store/apps/details?id=com.tuya.smartlife)) or **Tuya Smart** app on your phone.
2. Create an account (do **not** use a guest account).
3. Add your CREATE ceiling fan to the app following its instructions.

#### Step 2: Create a Tuya Developer account

1. Go to [iot.tuya.com](https://iot.tuya.com/) and sign up for a free account.
2. When asked for "Account Type", select **"Skip this step..."**.

#### Step 3: Create a Cloud Project

1. In the left sidebar, click **Cloud** → **Development**.
2. Click **Create Cloud Project**.
3. Fill in any name (e.g. "Homebridge"), select your **Data Center** region, and click Create.
   - **Important**: The Data Center must match your Smart Life account's region. If your devices don't show up later, try a different Data Center (e.g. some UK users need "Central Europe" instead of "Western Europe").
4. Note your **Authorization Key** — you'll see an **API ID** (Client ID) and **API Secret** on the project overview page. You don't need these for the browser method, but save them in case.

#### Step 4: Subscribe to IoT Core

1. Go to **Cloud** → **Cloud Services**.
2. Find **IoT Core** and subscribe to the **Trial Edition** (free).
3. Also ensure **Authorization** is listed under your project's Service APIs.

> **Note**: The Trial Edition lasts approximately 1 month. You can request a free extension: go to Cloud → Cloud Services → IoT Core → View Details → My Subscriptions → Extend Trial Period. Approval usually takes 1–2 working days. You only need this subscription active long enough to grab your keys — once you have them, the plugin works locally without any cloud access.

#### Step 5: Link your Smart Life account

1. Open your Cloud Project and go to the **Devices** tab.
2. Click **Link Tuya App Account** → **Add App Account**.
3. A QR code will appear. Scan it with the Smart Life app:
   - Open Smart Life → tap **Me** (bottom right) → tap the **scan icon** (top right).
4. Your devices should now appear in the Devices list. If not, check your Data Center selection.

#### Step 6: Get your Device ID

1. Still in your Cloud Project → **Devices** → **All Devices**.
2. Find your fan in the list. Copy the **Device ID**.

#### Step 7: Get your Local Key

1. Go to **Cloud** → **API Explorer** (opens in a new tab).
2. Navigate to **Devices Management** → **Query Device Details in Bulk** (or **Query Device Details**).
3. Select the correct **Data Center** in the top-right dropdown.
4. Paste your **Device ID** into the params field.
5. Click **Submit Request**.
6. In the response JSON, find the field **`local_key`** — this is your Local Key.

#### Step 8: (Optional) Get your DPS mapping

While you're in the API Explorer, you can also discover your fan's data points:

1. Navigate to **Device Control** → **Query Things Data Model**.
2. Enter your **Device ID** and submit.
3. The response lists all data points (DPS) with their IDs, names, types, and value ranges.

This tells you which DPS number controls fan power, speed, light, etc. — useful if your fan's mapping differs from the defaults.

### Option B: Using tinytuya (command-line)

If you prefer a command-line approach or want to process multiple devices at once:

```bash
pip install tinytuya
python -m tinytuya wizard
```

The wizard will prompt for your Tuya IoT API credentials and produce a `devices.json` file with all device IDs and local keys. This still requires the Tuya IoT Platform account from Steps 2–5 above.

### Option C: Discover DPS values with tinytuya

Once you have ID and key, you can dump the current device status to see actual DPS values:

```python
import tinytuya
d = tinytuya.OutletDevice('DEVICE_ID', 'IP_ADDRESS', 'LOCAL_KEY')
d.set_version(3.3)
print(d.status())
```

This returns something like:
```json
{
  "dps": {
    "20": true,
    "60": false,
    "62": 3
  }
}
```

Where `20` = light on, `60` = fan power off, `62` = fan speed at step 3.

---

## Configuration

### Minimal

```json
{
  "platform": "HomebridgeCreateFan",
  "name": "CREATE Fan",
  "devices": [
    {
      "name": "Living Room Fan",
      "id": "your-device-id",
      "key": "your-local-key"
    }
  ]
}
```

### Two devices with custom mapping

```json
{
  "platform": "HomebridgeCreateFan",
  "name": "CREATE Fan",
  "pollingIntervalSeconds": 15,
  "devices": [
    {
      "name": "Living Room Fan",
      "id": "abc123...",
      "key": "def456...",
      "model": "CREATE Fan 2024",
      "mapping": {
        "fanPowerDps": 60,
        "fanSpeedDps": 62,
        "fanDirectionDps": 63,
        "fanSpeedMin": 1,
        "fanSpeedMax": 6,
        "lightPowerDps": 20,
        "lightTempCycleDps": 25,
        "lightTempCycleMethod": "dpsPulse",
        "lightTempValues": [1, 2, 3],
        "timerDps": 65,
        "timerValues": [1, 2, 4]
      }
    },
    {
      "name": "Bedroom Fan",
      "id": "xyz789...",
      "key": "uvw012...",
      "mapping": {
        "fanSpeedMax": 3
      },
      "features": {
        "enableTempButtons": false,
        "enableTimerButtons": false
      }
    }
  ]
}
```

### Using environment variables for secrets

```json
{
  "platform": "HomebridgeCreateFan",
  "name": "CREATE Fan",
  "secrets": {
    "mode": "env"
  },
  "devices": [
    {
      "name": "Living Room Fan",
      "idEnv": "LIVING_FAN_ID",
      "keyEnv": "LIVING_FAN_KEY"
    }
  ]
}
```

Then set the environment variables before starting Homebridge:
```bash
export LIVING_FAN_ID="your-device-id"
export LIVING_FAN_KEY="your-local-key"
```

### Using a storage file for secrets

This keeps credentials completely out of your Homebridge config:

```json
{
  "platform": "HomebridgeCreateFan",
  "name": "CREATE Fan",
  "secrets": {
    "mode": "storage",
    "storageFile": "create-fan-secrets.json"
  },
  "devices": [
    {
      "name": "Living Room Fan"
    },
    {
      "name": "Bedroom Fan",
      "deviceKey": "bedroom"
    }
  ]
}
```

Create the file `create-fan-secrets.json` in your Homebridge storage directory (usually `~/.homebridge/` or `/var/lib/homebridge/`):

```json
{
  "devices": {
    "Living Room Fan": { "id": "abc123...", "key": "def456..." },
    "bedroom": { "id": "xyz789...", "key": "uvw012..." }
  }
}
```

The plugin matches by device `name` or by the optional `deviceKey` field.

---

## Light Temperature Cycling

The CREATE fan cycles its light color temperature in 3 discrete steps (e.g. warm → neutral → cool → warm…). This plugin exposes three **momentary switch** buttons in HomeKit:

- **Light Temp 1** – Warm
- **Light Temp 2** – Neutral
- **Light Temp 3** – Cool

When you tap a button, it turns on briefly and then switches itself off. The plugin tracks the current mode and calculates how many cycles are needed to reach the target.

**Configuration options:**

| Setting | Description |
|---------|-------------|
| `lightTempModeDps` | If your device has a writable DPS that sets temp directly, use this for instant switching |
| `lightTempCycleDps` | DPS to pulse (write true then false) to advance one step |
| `lightTempCycleMethod` | `"dpsPulse"` (default) or `"lightToggle"` (turns light off/on to advance) |

---

## DPS Reference

Default DPS mapping (based on common CREATE fan models):

| DPS | Function | Default |
|-----|----------|---------|
| 20  | Light power (bool) | ✓ |
| 60  | Fan power (bool) | ✓ |
| 62  | Fan speed (1–6) | ✓ |

Your fan may use different DPS numbers. Use the API Explorer method (Step 8 above) or tinytuya to discover your device's actual mapping, then configure it in the `mapping` section.

---

## Known Limitations

- **Tuya Cloud required for initial setup**: There is no way to obtain the Device ID and Local Key without a (free) Tuya IoT Platform account. Once you have the credentials, the plugin works entirely locally.
- **IoT Core Trial expiration**: The free Tuya trial lasts ~1 month. You can request extensions, but you only need it active long enough to grab your keys.
- **Temperature cycling without readable DPS**: If the device doesn't expose a readable temperature mode DPS, the plugin tracks the mode internally. Using the physical remote may cause drift. Re-tapping a preset will re-sync.
- **Timer**: The plugin sets the timer value but doesn't show a countdown in HomeKit.
- **Brightness**: Not exposed as a slider. If your device has a brightness DPS, this can be added in a future version.
- **Direction values**: The plugin sends `"forward"` / `"reverse"` strings by default. Some devices may use `true`/`false` or numeric values — adjust via the mapping if needed.
- **Single local connection**: Most Tuya devices only accept one local connection at a time. Close the Smart Life app on your phone when using this plugin, and don't run other local Tuya integrations on the same device simultaneously.

## Credits

Inspired by [moifort/homebridge-create-fan](https://github.com/moifort/homebridge-create-fan).

- [tuyapi](https://github.com/codetheweb/tuyapi)
- [tinytuya](https://github.com/jasonacox/tinytuya)
