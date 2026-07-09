# Changelog

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
