# Changelog

## 0.7.0

- Keep Snapshot standalone as the shared diagnostic provider used by Capture
  and Console, with safe cleanup when Signal K starts the plugin again.
- Read collision policy, Auto Profile, audio policy and targets directly from
  Traffic instead of through Display compatibility routes.
- Remove retired Logger, Companion, old announcer and split Alerts package
  compatibility from snapshots and installed-suite discovery.
- Report the package version and current lifecycle state through Signal K's
  plugin status API, and align OpenAPI and help with the reviewed API.

## 0.6.2

- Update diagnostics and installation documentation for the current suite,
  retaining the retired Logger endpoint only as a labelled legacy check.

## 0.6.1

- Capture AJRM Marine Navigation Reference's selected position, ground vector,
  heading kind, source, age, uncertainty, GPS-dependence, magnetic model,
  leeway, current, and residual provenance.
- Treat a recorded Navigation Reference path as authoritative, withholding raw
  navigation when the projection is stale, malformed, or uses an unsupported
  schema; raw fallback remains available only when the provider path is absent.
- Preserve missing GPS-dependence evidence as unknown instead of labelling it
  independent.

## 0.5.11

- Expose Snapshot browser-access readiness through the in-process API so
  Console BITE can detect when remote/browser support snapshots are disabled.

## 0.5.10

- Use explicit closest-approach relative bearing to produce snapshot clock
  position, and stop parsing clock labels from text.

## 0.5.9

- Stop inferring AIS target alert status from CPA/TCPA numbers in compact
  snapshots; status now comes only from explicit notification/state fields.
- Treat standard Signal K navigation and wind angle paths as radians instead
  of guessing radians versus degrees from numeric magnitude.

## 0.5.8

- Internal support snapshot maintenance release.

## 0.5.7

- Align OpenAPI metadata and install documentation with the package version.

## 0.5.6

- Add Signal K AppStore utility category metadata and packaged app icon.

## 0.5.5

- Rename snapshot telemetry descriptions to current AJRM Marine app names.

## 0.5.4

- Remove obsolete simulator package names from the AJRM Marine suite package inventory.

## 0.5.3

- Add installed AJRM Marine app version details to snapshots.

## 0.5.2

- Add selected Pi service and process diagnostics for support snapshots.

## 0.5.1

- Remove obsolete profile-range data from compact AJRM Marine snapshots.

## 0.5.0

- Initial public beta release as AJRM Marine Snapshot.
