# Signal K AJRM Marine Snapshot

`signalk-ajrm-marine-snapshot` is a local Signal K server plugin that prepares a compact JSON snapshot for manual copy/paste into ChatGPT.

It is not an MCP server and it does not call any AI service. It keeps selected Signal K values in memory, exposes a local snapshot endpoint, and provides a small web UI for previewing and copying the JSON.

Version `0.7.0` is the reviewed Signal K baseline. Snapshot remains a small
standalone diagnostic provider because both Capture and Console consume its
in-process API. It now reads collision policy and target state directly from
Traffic, and removes retired Logger, Companion and announcer compatibility.

## What It Captures

- Own-vessel position, SOG, COG, true bow heading, clock-reference kind, and
  navigation provenance, plus depth and wind
- Battery voltage/current/state of charge when available
- AIS target identity, range, bearing, motion, AIS GPS antenna offsets, CPA/TCPA, CPA reference, and risk status
- Enriched encounter fields from AJRM Marine
- Traffic alarm profiles, target state, auto-profile and audio policy, plus
  Display alert history, announcement history and harbour count
- AJRM Marine harbour region bounds only when the separate harbour-list option is enabled
- AJRM Marine Audio render, queue, local playback, radio stream, volume, ping, voice, and recent event status when AJRM Marine Audio is installed
- Installed Signal K plugin/webapp package names, display names, versions, and Git/npm source specs
- Long-voyage diagnostics from AJRM Marine Traffic, Navigation Reference,
  Capture, DR Plotter, GPS Integrity, Simulator, Notifications, and
  compact Signal K chart resources
- Active `vessels.self.notifications.*` messages
- Legacy Announce AIS Messages live/spoken output when enabled

Snapshot never treats raw `navigation.headingMagnetic` as true heading. When
AJRM Marine Navigation Reference is present it records the selected compass or
moving-COG proxy, source, method, age, uncertainty, WMM variation, leeway
status, and whether a residual is GPS-dependent.
If the provider path exists but is stale, malformed, or uses an unsupported
schema, Snapshot withholds provider-owned position and motion fields instead of
silently repairing them from unrelated raw paths. Raw fallback is used only
when the provider path is absent.

The plugin understands the enriched AIS hand-off paths:

- `navigation.closestApproach`
- `sensors.ais.fromBow`
- `sensors.ais.fromCenter`
- `navigation.closestApproach.enriched.alarmState`
- `navigation.closestApproach.enriched.cpaRelativeBearing` (radians)
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
- `/plugins/signalk-ajrm-marine-gps-integrity/plotter/status`
- `/plugins/signalk-ajrm-marine-gps-integrity/status`
- `/plugins/signalk-ajrm-marine-simulator/state`
- `/plugins/signalk-ajrm-marine-notifications/status`
- `/signalk/v1/api/resources/charts`

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
npm install git+https://github.com/ajrm-marine-suite/signalk-ajrm-marine-snapshot.git#v0.7.2 --omit=dev --no-package-lock
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
npm install git+https://github.com/ajrm-marine-suite/signalk-ajrm-marine-snapshot.git#v0.7.2 --omit=dev --no-package-lock
sudo systemctl restart signalk
```

The public HTTPS install URL does not require a GitHub SSH key.

## Update on the Raspberry Pi

```sh
cd ~/.signalk
npm install git+https://github.com/ajrm-marine-suite/signalk-ajrm-marine-snapshot.git#v0.7.2 --omit=dev --no-package-lock
sudo systemctl restart signalk
```


## Public Beta

Diagnostic snapshot collector for AJRM Marine Suite support.

Development assistance: OpenAI Codex helped with code generation, refactoring, and automated testing during the beta development cycle.
## License and commercial use

This software is licensed under the GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later). You may use, study, share, and modify it under that licence. If you modify it and make it available to users over a network, the corresponding source code must also be made available under the AGPL.

Commercial licensing is available by arrangement for organisations that want different terms.
