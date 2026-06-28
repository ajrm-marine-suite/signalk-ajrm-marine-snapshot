# Signal K AJRM Marine Snapshot

`signalk-ajrm-marine-snapshot` is a local Signal K server plugin that prepares a compact JSON snapshot for manual copy/paste into ChatGPT.

It is not an MCP server and it does not call any AI service. It keeps selected Signal K values in memory, exposes a local snapshot endpoint, and provides a small web UI for previewing and copying the JSON.

Version `0.5.3` includes the same long-voyage diagnostics when Capture calls
Snapshot through the in-process API for unattended voyage recording.

Version `0.2.3` adds named snapshot presets for AJRM Marine Capture. The
`voyage` preset is compact and suitable for routine start/stop voyage records.
The `debug` preset includes all targets plus raw debug fields for event
investigation.

## What It Captures

- Own-vessel position, SOG, COG, heading, depth, and wind
- Battery voltage/current/state of charge when available
- AIS target identity, range, bearing, motion, AIS GPS antenna offsets, CPA/TCPA, CPA reference, and risk status
- Enriched encounter fields from AJRM Marine
- AJRM Marine alarm profiles, sensitivity values, repeat intervals, speech-output settings, active alert events, recent announcement log, target silence state, auto-profile status, and harbour count when AJRM Marine is installed
- AJRM Marine harbour region bounds only when the separate harbour-list option is enabled
- AJRM Marine Audio render, queue, local playback, radio stream, volume, ping, voice, and recent event status when AJRM Marine Audio is installed
- Installed Signal K plugin/webapp package names, display names, versions, and Git/npm source specs
- Long-voyage diagnostics from AJRM Marine Traffic, Capture, Logger, DR Plotter, GPS Integrity, Simulator, Notifications, and compact Signal K chart resources
- Active `vessels.self.notifications.*` messages
- Legacy Announce AIS Messages live/spoken output when enabled

The plugin understands the enriched AIS hand-off paths:

- `navigation.closestApproach`
- `sensors.ais.fromBow`
- `sensors.ais.fromCenter`
- `navigation.closestApproach.enriched.alarmState`
- `navigation.closestApproach.enriched.clockLabel`
- `navigation.closestApproach.enriched.passTypeLabel`
- `navigation.closestApproach.enriched.spokenSummary`
- `vessels.self.notifications.collision.*`

When the related checkboxes are enabled, the server also fetches local status
from:

- `/plugins/signalk-ajrm-marine-display/alertEvents`
- `/plugins/signalk-ajrm-marine-display/announcementLog`
- `/plugins/signalk-ajrm-marine-audio/status`
- `/plugins/signalk-ajrm-marine-traffic/status`
- `/plugins/signalk-ajrm-marine-capture/status`
- `/signalk/v1/api/ajrmMarineLogger/status`
- `/plugins/signalk-ajrm-marine-dr-plotter/status`
- `/plugins/signalk-ajrm-marine-gps-integrity/status`
- `/plugins/signalk-ajrm-marine-simulator/state`
- `/plugins/signalk-ajrm-marine-notifications/status`
- `/signalk/v1/api/resources/charts`
- `/plugins/announce-ais-messages/api/state`

## Endpoints

The main endpoint is:

```text
/plugins/signalk-ajrm-marine-snapshot/snapshot
```

AJRM Marine Capture can request centralised presets:

```text
/plugins/signalk-ajrm-marine-snapshot/snapshot?snapshotPreset=voyage
/plugins/signalk-ajrm-marine-snapshot/snapshot?snapshotPreset=debug
```

The web UI is mounted by Signal K at:

```text
/signalk-ajrm-marine-snapshot
```

By default, the API only serves localhost requests. Enable `Allow remote HTTP/browser access` only on a trusted private network.

## Options

- Max own-vessel value age seconds
- Snapshot preset (`standard`, `voyage`, or `debug`)
- Max AIS target age seconds
- Max notification age seconds
- Max AIS range NM
- Include all targets, or only targets with risk/enriched collision data
- Include notifications
- Include electrical data
- Include AJRM Marine server state
- Include AJRM Marine harbour region list
- Include AJRM Marine Audio state
- Include AJRM Marine Companion state
- Include legacy announcer output
- Include installed app versions
- Include debug/raw fields
- Allow remote HTTP/browser access

## Development

Run the tests:

```bash
npm test
```

During local Signal K development:

```bash
npm link
cd ~/.signalk
npm link signalk-ajrm-marine-snapshot
```

Then restart Signal K, enable the plugin in the admin UI, and open `/signalk-ajrm-marine-snapshot`.

## Install on the Raspberry Pi

Use this dependency-based install method instead of cloning directly into
`~/.signalk/node_modules`. A direct clone can be removed later if npm prunes
packages that are not listed in `~/.signalk/package.json`.

1. Go to your Signal K configuration directory:

```sh
cd ~/.signalk
```

2. Install the public GitHub repo as a Signal K dependency:

```sh
npm install git+https://github.com/ajrm-marine-suite/signalk-ajrm-marine-snapshot.git#v0.5.7 --omit=dev --no-package-lock
```

3. Restart Signal K:

```sh
sudo systemctl restart signalk
```

4. In the Signal K server admin UI:

- enable `signalk-ajrm-marine-snapshot`
- keep `Allow remote HTTP/browser access` disabled unless you are on a trusted private network
- open `/signalk-ajrm-marine-snapshot` on the Signal K server to preview and copy the JSON

## If It Disappears After Another Plugin Update

Reinstall it from `~/.signalk` so npm records it again:

```sh
cd ~/.signalk
npm install git+https://github.com/ajrm-marine-suite/signalk-ajrm-marine-snapshot.git#v0.5.7 --omit=dev --no-package-lock
sudo systemctl restart signalk
```

If GitHub SSH access has not been set up on the Pi yet, confirm this works first:

```sh
ssh -T git@github.com
```

## Update on the Raspberry Pi

```sh
cd ~/.signalk
npm install git+https://github.com/ajrm-marine-suite/signalk-ajrm-marine-snapshot.git#v0.5.7 --omit=dev --no-package-lock
sudo systemctl restart signalk
```


## Public Beta

Diagnostic snapshot collector for AJRM Marine Suite support.

Development assistance: OpenAI Codex helped with code generation, refactoring, and automated testing during the beta development cycle.
