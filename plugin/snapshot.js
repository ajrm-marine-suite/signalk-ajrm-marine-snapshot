'use strict';

const METERS_PER_NM = 1852;
const MPS_TO_KNOTS = 1.9438444924406046;
const RAD_TO_DEG = 180 / Math.PI;

const DEFAULT_OPTIONS = Object.freeze({
  snapshotPreset: 'standard',
  maxSelfValueAgeSeconds: 120,
  maxTargetAgeSeconds: 120,
  maxNotificationAgeSeconds: 300,
  maxAisRangeNm: 6,
  includeAllTargets: false,
  includeNotifications: true,
  includeElectrical: true,
  includeAisPlus: true,
  includeAisPlusHarbourRegions: false,
  includeAisPlusAudio: true,
  includeCompanion: true,
  includeAnnouncerOutput: false,
  includeInstalledApps: true,
  includeSuiteDiagnostics: true,
  includeDebugRaw: false,
  signalKBaseUrl: 'https://127.0.0.1:3443',
  allowRemoteAccess: false
});

const SNAPSHOT_PRESETS = Object.freeze({
  standard: {},
  voyage: {
    maxTargetAgeSeconds: 600,
    maxNotificationAgeSeconds: 3600,
    includeAllTargets: false,
    includeDebugRaw: false,
    includeAisPlus: true,
    includeAisPlusAudio: true,
    includeCompanion: true,
    includeInstalledApps: true,
    includeSuiteDiagnostics: true
  },
  debug: {
    maxTargetAgeSeconds: 600,
    maxNotificationAgeSeconds: 3600,
    includeAllTargets: true,
    includeDebugRaw: true,
    includeAisPlus: true,
    includeAisPlusAudio: true,
    includeCompanion: true,
    includeInstalledApps: true,
    includeSuiteDiagnostics: true
  }
});

const SNAPSHOT_UNITS = Object.freeze({
  position: 'deg',
  speed: 'kn',
  angle: 'deg',
  depth: 'm',
  distance: 'NM',
  time: 'min',
  electricalVoltage: 'V',
  electricalCurrent: 'A',
  electricalCharge: 'ratio 0-1',
  temperature: 'C'
});

function createSnapshotState() {
  return {
    self: {
      fields: {},
      depths: {},
      wind: {},
      electrical: {
        batteries: new Map()
      }
    },
    targets: new Map(),
    notifications: new Map(),
    lastUpdatedAt: null
  };
}

function clearSnapshotState(state) {
  state.self.fields = {};
  state.self.depths = {};
  state.self.wind = {};
  state.self.electrical = { batteries: new Map() };
  state.targets.clear();
  state.notifications.clear();
  state.lastUpdatedAt = null;
}

function normalizeOptions(input) {
  const inputSource = isObject(input) ? input : {};
  const snapshotPreset = normalizeSnapshotPreset(inputSource.snapshotPreset || inputSource.preset);
  const source = {
    ...SNAPSHOT_PRESETS[snapshotPreset],
    ...inputSource
  };
  return {
    snapshotPreset,
    maxSelfValueAgeSeconds: positiveNumber(source.maxSelfValueAgeSeconds, DEFAULT_OPTIONS.maxSelfValueAgeSeconds),
    maxTargetAgeSeconds: positiveNumber(source.maxTargetAgeSeconds, DEFAULT_OPTIONS.maxTargetAgeSeconds),
    maxNotificationAgeSeconds: positiveNumber(
      source.maxNotificationAgeSeconds,
      DEFAULT_OPTIONS.maxNotificationAgeSeconds
    ),
    maxAisRangeNm: positiveNumber(source.maxAisRangeNm, DEFAULT_OPTIONS.maxAisRangeNm),
    includeAllTargets: booleanValue(source.includeAllTargets, DEFAULT_OPTIONS.includeAllTargets),
    includeNotifications: booleanValue(source.includeNotifications, DEFAULT_OPTIONS.includeNotifications),
    includeElectrical: booleanValue(source.includeElectrical, DEFAULT_OPTIONS.includeElectrical),
    includeAisPlus: booleanValue(source.includeAisPlus, DEFAULT_OPTIONS.includeAisPlus),
    includeAisPlusHarbourRegions: booleanValue(
      source.includeAisPlusHarbourRegions,
      DEFAULT_OPTIONS.includeAisPlusHarbourRegions
    ),
    includeAisPlusAudio: booleanValue(source.includeAisPlusAudio, DEFAULT_OPTIONS.includeAisPlusAudio),
    includeCompanion: booleanValue(source.includeCompanion, DEFAULT_OPTIONS.includeCompanion),
    includeAnnouncerOutput: booleanValue(source.includeAnnouncerOutput, DEFAULT_OPTIONS.includeAnnouncerOutput),
    includeInstalledApps: booleanValue(source.includeInstalledApps, DEFAULT_OPTIONS.includeInstalledApps),
    includeSuiteDiagnostics: booleanValue(source.includeSuiteDiagnostics, DEFAULT_OPTIONS.includeSuiteDiagnostics),
    includeDebugRaw: booleanValue(source.includeDebugRaw, DEFAULT_OPTIONS.includeDebugRaw),
    signalKBaseUrl: textValue(source.signalKBaseUrl, DEFAULT_OPTIONS.signalKBaseUrl),
    allowRemoteAccess: booleanValue(source.allowRemoteAccess, DEFAULT_OPTIONS.allowRemoteAccess)
  };
}

function optionsWithQueryOverrides(baseOptions, query) {
  const source = isObject(query) ? query : {};
  const requestedPreset = source.snapshotPreset || source.preset;
  const options = requestedPreset
    ? normalizeOptions({
        snapshotPreset: requestedPreset,
        signalKBaseUrl: baseOptions?.signalKBaseUrl,
        allowRemoteAccess: baseOptions?.allowRemoteAccess
      })
    : normalizeOptions(baseOptions);

  setTextOverride(options, source, 'snapshotPreset', normalizeSnapshotPreset);
  setBooleanOverride(options, source, 'includeAllTargets');
  setBooleanOverride(options, source, 'includeNotifications');
  setBooleanOverride(options, source, 'includeElectrical');
  setBooleanOverride(options, source, 'includeAisPlus');
  setBooleanOverride(options, source, 'includeAisPlusHarbourRegions');
  setBooleanOverride(options, source, 'includeAisPlusAudio');
  setBooleanOverride(options, source, 'includeCompanion');
  setBooleanOverride(options, source, 'includeAnnouncerOutput');
  setBooleanOverride(options, source, 'includeInstalledApps');
  setBooleanOverride(options, source, 'includeSuiteDiagnostics');
  setBooleanOverride(options, source, 'includeDebugRaw');
  setNumberOverride(options, source, 'maxSelfValueAgeSeconds');
  setNumberOverride(options, source, 'maxTargetAgeSeconds');
  setNumberOverride(options, source, 'maxNotificationAgeSeconds');
  setNumberOverride(options, source, 'maxAisRangeNm');

  return options;
}

function normalizeSnapshotPreset(value) {
  const preset = String(value || DEFAULT_OPTIONS.snapshotPreset).trim().toLowerCase();
  return Object.hasOwn(SNAPSHOT_PRESETS, preset) ? preset : DEFAULT_OPTIONS.snapshotPreset;
}

function applyDelta(state, delta, receivedAt) {
  if (!delta || !Array.isArray(delta.updates)) return;

  const fallbackDate = validDate(receivedAt) || new Date();
  delta.updates.forEach(update => {
    const context = normalizeContext(update.context || delta.context || delta.contexts || 'vessels.self');
    const timestamp = normalizeTimestamp(update.timestamp || delta.timestamp, fallbackDate);
    const values = Array.isArray(update.values)
      ? update.values
      : update.path
        ? [update]
        : [];

    values.forEach(item => {
      if (!item || typeof item.path !== 'string') return;
      applyValue(state, context, item.path, item.value, timestamp, item);
    });
  });
}

function applyValue(state, context, path, value, timestamp, meta) {
  const cleanContext = normalizeContext(context);
  const cleanPath = String(path || '').trim();

  const recordTimestamp = normalizeTimestamp(timestamp, new Date());
  state.lastUpdatedAt = recordTimestamp;

  if (!cleanPath) {
    applyRootValue(state, cleanContext, value, recordTimestamp);
    return;
  }

  if (isSelfContext(cleanContext)) {
    applySelfValue(state, cleanPath, value, recordTimestamp);
  } else if (isVesselContext(cleanContext)) {
    applyTargetValue(state, cleanContext, cleanPath, value, recordTimestamp);
  }

  if (isSelfContext(cleanContext) && cleanPath.startsWith('notifications.')) {
    applyNotificationValue(state, cleanContext, cleanPath, value, recordTimestamp, meta);
  }
}

function applyRootValue(state, context, value, timestamp) {
  const root = unwrapSignalKValue(value);
  if (!isObject(root)) return;

  [
    'name',
    'mmsi',
    'communication.callsignVhf',
    'communication.callsign',
    'navigation.position',
    'navigation.speedOverGround',
    'navigation.courseOverGroundTrue',
    'navigation.headingTrue',
    'sensors.ais.fromBow',
    'sensors.ais.fromCenter',
    'navigation.closestApproach',
    'navigation.closestApproach.enriched.alarmState',
    'navigation.closestApproach.enriched.clockLabel',
    'navigation.closestApproach.enriched.passTypeLabel',
    'navigation.closestApproach.enriched.spokenSummary',
    'navigation.closestApproach.enriched.cpaRelativeBearing'
  ].forEach(rootPath => {
    const rootPathValue = getPathValue(root, rootPath);
    if (typeof rootPathValue !== 'undefined') {
      applyValue(state, context, rootPath, rootPathValue, timestamp);
    }
  });
}

function seedFromApp(app, state, now, seedOptions) {
  if (!app) return;

  const options = Object.assign({ includeTargets: true }, seedOptions || {});
  const seedTime = normalizeTimestamp(now, new Date());
  const selfPaths = [
    'name',
    'mmsi',
    'communication.callsignVhf',
    'communication.callsign',
    'navigation.position',
    'navigation.speedOverGround',
    'navigation.courseOverGroundTrue',
    'navigation.courseOverGroundMagnetic',
    'navigation.headingTrue',
    'navigation.headingMagnetic',
    'environment.depth.belowKeel',
    'environment.depth.belowTransducer',
    'environment.depth.belowSurface',
    'environment.wind.speedTrue',
    'environment.wind.angleTrue',
    'environment.wind.angleTrueWater',
    'environment.wind.speedApparent',
    'environment.wind.angleApparent'
  ];

  if (typeof app.getSelfPath === 'function') {
    selfPaths.forEach(path => {
      const value = unwrapSignalKValue(app.getSelfPath(path));
      if (typeof value !== 'undefined') applyValue(state, 'vessels.self', path, value, seedTime);
    });
  }

  if (typeof app.getPath !== 'function') return;

  const batteries = unwrapSignalKValue(app.getPath('vessels.self.electrical.batteries'));
  if (isObject(batteries)) {
    Object.keys(batteries).forEach(id => {
      seedBattery(state, id, unwrapSignalKValue(batteries[id]), seedTime);
    });
  }

  const selfNotifications = unwrapSignalKValue(app.getPath('vessels.self.notifications'));
  seedNotificationTree(state, 'vessels.self', 'notifications', selfNotifications, seedTime);

  if (!options.includeTargets) return;

  const vessels = unwrapSignalKValue(app.getPath('vessels'));
  if (!isObject(vessels)) return;

  Object.keys(vessels).forEach(vesselId => {
    if (vesselId === 'self') return;
    const vessel = unwrapSignalKValue(vessels[vesselId]);
    if (!isObject(vessel)) return;
    const context = `vessels.${vesselId}`;
    seedVessel(state, context, vessel, seedTime);
  });
}

function buildSnapshot(state, requestedOptions, now) {
  const options = normalizeOptions(requestedOptions);
  const snapshotTime = validDate(now) || new Date();
  const self = buildSelfSnapshot(state, options, snapshotTime);
  const aisTargets = buildTargetSnapshots(state, options, snapshotTime);
  const snapshot = {
    timestamp: snapshotTime.toISOString(),
    units: SNAPSHOT_UNITS,
    self
  };

  if (aisTargets.length) {
    snapshot.aisTargets = aisTargets;
  }

  if (options.includeNotifications) {
    const notifications = buildNotificationSnapshots(state, options, snapshotTime);
    if (notifications.length) snapshot.notifications = notifications;
  }

  if (options.includeDebugRaw) {
    snapshot.debug = {
      storedTargets: state.targets.size,
      returnedTargets: aisTargets.length,
      storedNotifications: state.notifications.size,
      lastUpdatedAt: state.lastUpdatedAt
    };
  }

  return snapshot;
}

function buildSelfSnapshot(state, options, now) {
  const maxAge = options.maxSelfValueAgeSeconds;
  const fields = state.self.fields;
  const self = {};

  const name = stringValue(latestValueNoAge(fields.name));
  const mmsi = stringValue(latestValueNoAge(fields.mmsi));
  const callsign = stringValue(latestValueNoAge(fields.callsign));
  if (name) self.name = name;
  if (mmsi) self.mmsi = mmsi;
  if (callsign) self.callsign = callsign;

  const position = latestValue(fields.position, maxAge, now);
  if (isPosition(position)) {
    self.position = {
      latitude: round(position.latitude, 6),
      longitude: round(position.longitude, 6)
    };
  }

  const sog = readNumber(latestValue(fields.sog, maxAge, now));
  if (sog !== null) self.sog = round(sog * MPS_TO_KNOTS, 1);

  const cog = readAngleDegrees(latestValue(fields.cogTrue, maxAge, now), true);
  if (cog !== null) self.cog = round(cog, 0);

  const heading = readAngleDegrees(
    latestValue(fields.headingTrue, maxAge, now),
    true
  ) ?? readAngleDegrees(latestValue(fields.headingMagnetic, maxAge, now), true);
  if (heading !== null) self.heading = round(heading, 0);

  const depth = readPreferredDepth(state.self.depths, maxAge, now);
  if (depth) {
    self.depth = round(depth.value, 1);
    self.depthSource = depth.source;
  }

  const wind = buildWindSnapshot(state.self.wind, maxAge, now);
  if (Object.keys(wind).length) self.wind = wind;

  if (options.includeElectrical) {
    const electrical = buildElectricalSnapshot(state.self.electrical, maxAge, now);
    if (Object.keys(electrical).length) self.electrical = electrical;
  }

  return self;
}

function buildWindSnapshot(windState, maxAge, now) {
  const wind = {};
  const speedTrue = readNumber(latestValue(windState.speedTrue, maxAge, now));
  const speedApparent = readNumber(latestValue(windState.speedApparent, maxAge, now));
  const angleTrue = readAngleDegrees(latestValue(windState.angleTrue, maxAge, now), false);
  const angleApparent = readAngleDegrees(latestValue(windState.angleApparent, maxAge, now), false);

  if (speedTrue !== null) wind.speedTrue = round(speedTrue * MPS_TO_KNOTS, 1);
  if (angleTrue !== null) wind.angleTrue = round(angleTrue, 0);
  if (speedApparent !== null) wind.speedApparent = round(speedApparent * MPS_TO_KNOTS, 1);
  if (angleApparent !== null) wind.angleApparent = round(angleApparent, 0);

  return wind;
}

function buildElectricalSnapshot(electricalState, maxAge, now) {
  const batteries = [];

  electricalState.batteries.forEach((battery, id) => {
    const output = { id };
    const voltage = readNumber(latestValue(battery.fields.voltage, maxAge, now));
    const current = readNumber(latestValue(battery.fields.current, maxAge, now));
    const stateOfCharge = readNumber(latestValue(battery.fields.stateOfCharge, maxAge, now));
    const temperature = readNumber(latestValue(battery.fields.temperature, maxAge, now));

    if (voltage !== null) output.voltage = round(voltage, 2);
    if (current !== null) output.current = round(current, 1);
    if (stateOfCharge !== null) output.stateOfCharge = round(stateOfCharge, 2);
    if (temperature !== null) output.temperature = round(kelvinToCelsius(temperature), 1);

    if (Object.keys(output).length > 1) batteries.push(output);
  });

  return batteries.length ? { batteries } : {};
}

function buildTargetSnapshots(state, options, now) {
  const selfPosition = latestValue(state.self.fields.position, options.maxSelfValueAgeSeconds, now);
  const ownMmsi = stringValue(latestValueNoAge(state.self.fields.mmsi));
  const selfHeading = readAngleDegrees(
    latestValue(state.self.fields.headingTrue, options.maxSelfValueAgeSeconds, now),
    true
  ) ?? readAngleDegrees(latestValue(state.self.fields.cogTrue, options.maxSelfValueAgeSeconds, now), true);

  const output = [];
  state.targets.forEach(target => {
    if (ownMmsi && targetMmsi(target) === ownMmsi) return;
    const snapshot = buildTargetSnapshot(target, selfPosition, selfHeading, options, now);
    if (snapshot) output.push(snapshot);
  });

  output.sort((a, b) => {
    const risk = statusRank(b.status) - statusRank(a.status);
    if (risk) return risk;
    if (typeof a.cpaNm === 'number' && typeof b.cpaNm === 'number') return a.cpaNm - b.cpaNm;
    if (typeof a.rangeNm === 'number' && typeof b.rangeNm === 'number') return a.rangeNm - b.rangeNm;
    return String(a.name || a.mmsi || '').localeCompare(String(b.name || b.mmsi || ''));
  });

  return output;
}

function buildTargetSnapshot(target, selfPosition, selfHeading, options, now) {
  if (!isFreshTimestamp(target.lastUpdatedAt, options.maxTargetAgeSeconds, now)) return null;

  const fields = target.fields;
  const maxAge = options.maxTargetAgeSeconds;
  const targetPosition = latestValue(fields.position, maxAge, now);
  const ca = readClosestApproach(target, maxAge, now);
  const output = {};
  const mmsi = stringValue(latestValueNoAge(fields.mmsi)) || extractMmsi(target.context);
  const name = stringValue(latestValueNoAge(fields.name));
  const callsign = stringValue(latestValueNoAge(fields.callsign));

  if (mmsi) output.mmsi = mmsi;
  if (name) output.name = name;
  if (callsign) output.callsign = callsign;

  if (isPosition(selfPosition) && isPosition(targetPosition)) {
    const rangeBearing = distanceBearing(selfPosition, targetPosition);
    output.rangeNm = round(rangeBearing.distanceMeters / METERS_PER_NM, 1);
    output.bearingTrue = round(rangeBearing.bearingTrue, 0);
  } else if (ca.bearingTrue !== null) {
    output.bearingTrue = round(ca.bearingTrue, 0);
  }

  const targetSog = readNumber(latestValue(fields.sog, maxAge, now));
  const targetCog = readAngleDegrees(latestValue(fields.cogTrue, maxAge, now), true);
  const targetHeading = readAngleDegrees(latestValue(fields.headingTrue, maxAge, now), true);
  if (targetSog !== null) output.sog = round(targetSog * MPS_TO_KNOTS, 1);
  if (targetCog !== null) output.cog = round(targetCog, 0);
  if (targetHeading !== null) output.heading = round(targetHeading, 0);
  const aisFromBow = readNumber(latestValue(fields.aisFromBow, maxAge, now));
  const aisFromCenter = readNumber(latestValue(fields.aisFromCenter, maxAge, now));
  if (aisFromBow !== null || aisFromCenter !== null) {
    output.gpsAntenna = {};
    if (aisFromBow !== null) output.gpsAntenna.fromBow = round(aisFromBow, 1);
    if (aisFromCenter !== null) output.gpsAntenna.fromCenter = round(aisFromCenter, 1);
  }

  const clock = ca.relativeClock || clockNumber(output.bearingTrue, selfHeading);
  if (clock !== null) output.relativeClock = clock;
  if (ca.cpaNm !== null) output.cpaNm = round(ca.cpaNm, 1);
  if (ca.cpaMeters !== null) output.cpaMeters = round(ca.cpaMeters, 0);
  if (ca.gpsCpaMeters !== null) output.gpsCpaMeters = round(ca.gpsCpaMeters, 0);
  if (ca.cpaReference) output.cpaReference = ca.cpaReference;
  if (ca.tcpaMin !== null) output.tcpaMin = round(ca.tcpaMin, 0);

  if (ca.status) output.status = ca.status;
  if (ca.passType) output.passType = ca.passType;
  if (ca.summary) output.summary = ca.summary;

  const risky = isRiskyTarget(output);
  if (!options.includeAllTargets && !risky) return null;
  if (typeof output.rangeNm === 'number' && output.rangeNm > options.maxAisRangeNm) return null;

  if (options.includeDebugRaw) {
    output.debug = {
      context: target.context,
      lastUpdatedAt: target.lastUpdatedAt,
      closestApproach: ca.debugRaw
    };
  }

  return Object.keys(output).length ? output : null;
}

function buildNotificationSnapshots(state, options, now) {
  const notifications = [];

  state.notifications.forEach(notification => {
    if (!isFreshTimestamp(notification.timestamp, options.maxNotificationAgeSeconds, now)) return;

    const level = notificationLevel(notification.value);
    const message = notificationMessage(notification.value);
    if (!message || !isActiveLevel(level)) return;

    const output = {
      level,
      message
    };

    if (options.includeDebugRaw) {
      output.path = notification.path;
      output.context = notification.context;
      output.timestamp = notification.timestamp;
    }

    notifications.push(output);
  });

  notifications.sort((a, b) => statusRank(b.level) - statusRank(a.level) || a.message.localeCompare(b.message));
  return notifications;
}

function applySelfValue(state, path, value, timestamp) {
  const fields = state.self.fields;

  switch (path) {
    case 'name':
      setLatest(fields, 'name', value, timestamp, path);
      return;
    case 'mmsi':
      setLatest(fields, 'mmsi', value, timestamp, path);
      return;
    case 'communication.callsignVhf':
    case 'communication.callsign':
      setLatest(fields, 'callsign', value, timestamp, path);
      return;
    case 'navigation.position':
      setLatest(fields, 'position', value, timestamp, path);
      return;
    case 'navigation.speedOverGround':
      setLatest(fields, 'sog', value, timestamp, path);
      return;
    case 'navigation.courseOverGroundTrue':
      setLatest(fields, 'cogTrue', value, timestamp, path);
      return;
    case 'navigation.courseOverGroundMagnetic':
      setLatest(fields, 'cogMagnetic', value, timestamp, path);
      return;
    case 'navigation.headingTrue':
      setLatest(fields, 'headingTrue', value, timestamp, path);
      return;
    case 'navigation.headingMagnetic':
      setLatest(fields, 'headingMagnetic', value, timestamp, path);
      return;
    default:
      break;
  }

  if (path.startsWith('environment.depth.')) {
    const key = path.slice('environment.depth.'.length);
    setLatest(state.self.depths, key, value, timestamp, path);
    return;
  }

  if (path.startsWith('environment.wind.')) {
    applyWindValue(state.self.wind, path, value, timestamp);
    return;
  }

  if (path.startsWith('electrical.batteries.')) {
    applyBatteryValue(state, path, value, timestamp);
  }
}

function applyWindValue(wind, path, value, timestamp) {
  const windPath = path.slice('environment.wind.'.length);
  switch (windPath) {
    case 'speedTrue':
      setLatest(wind, 'speedTrue', value, timestamp, path);
      break;
    case 'angleTrue':
    case 'angleTrueWater':
    case 'angleTrueGround':
      setLatest(wind, 'angleTrue', value, timestamp, path);
      break;
    case 'speedApparent':
      setLatest(wind, 'speedApparent', value, timestamp, path);
      break;
    case 'angleApparent':
      setLatest(wind, 'angleApparent', value, timestamp, path);
      break;
    default:
      break;
  }
}

function applyBatteryValue(state, path, value, timestamp) {
  const match = path.match(/^electrical\.batteries\.([^.]+)\.(.+)$/);
  if (!match) return;

  const id = match[1];
  const fieldPath = match[2];
  const battery = getBattery(state, id);
  const key = normalizeBatteryFieldKey(fieldPath);
  if (!key) return;

  setLatest(battery.fields, key, value, timestamp, path);
}

function applyTargetValue(state, context, path, value, timestamp) {
  const target = getTarget(state, context);
  target.lastUpdatedAt = timestamp;

  switch (path) {
    case 'name':
      setLatest(target.fields, 'name', value, timestamp, path);
      return;
    case 'mmsi':
      setLatest(target.fields, 'mmsi', value, timestamp, path);
      return;
    case 'communication.callsignVhf':
    case 'communication.callsign':
      setLatest(target.fields, 'callsign', value, timestamp, path);
      return;
    case 'navigation.position':
      setLatest(target.fields, 'position', value, timestamp, path);
      return;
    case 'navigation.speedOverGround':
      setLatest(target.fields, 'sog', value, timestamp, path);
      return;
    case 'navigation.courseOverGroundTrue':
      setLatest(target.fields, 'cogTrue', value, timestamp, path);
      return;
    case 'navigation.headingTrue':
      setLatest(target.fields, 'headingTrue', value, timestamp, path);
      return;
    case 'sensors.ais.fromBow':
      setLatest(target.fields, 'aisFromBow', value, timestamp, path);
      return;
    case 'sensors.ais.fromCenter':
      setLatest(target.fields, 'aisFromCenter', value, timestamp, path);
      return;
    default:
      break;
  }

  if (path === 'navigation.closestApproach' || path.startsWith('navigation.closestApproach.')) {
    applyClosestApproachValue(target, path, value, timestamp);
  }
}

function applyClosestApproachValue(target, path, value, timestamp) {
  if (path === 'navigation.closestApproach') {
    setLatest(target.closestApproach, 'raw', value, timestamp, path);
    return;
  }

  const suffix = path.slice('navigation.closestApproach.'.length);
  if (suffix.startsWith('enriched.')) {
    const key = suffix.slice('enriched.'.length);
    setLatest(target.closestApproach.enriched, key, value, timestamp, path);
    return;
  }

  setLatest(target.closestApproach.fields, suffix, value, timestamp, path);
}

function applyNotificationValue(state, context, path, value, timestamp, meta) {
  const key = `${context}:${path}`;
  if (!isNotificationActive(value)) {
    state.notifications.delete(key);
    return;
  }

  state.notifications.set(key, {
    context,
    path,
    value: cloneJson(value),
    timestamp,
    source: meta && (meta.source || meta.$source)
  });
}

function seedVessel(state, context, vessel, timestamp) {
  [
    'name',
    'mmsi',
    'communication.callsignVhf',
    'communication.callsign',
    'navigation.position',
    'navigation.speedOverGround',
    'navigation.courseOverGroundTrue',
    'navigation.headingTrue',
    'sensors.ais.fromBow',
    'sensors.ais.fromCenter',
    'navigation.closestApproach',
    'navigation.closestApproach.enriched.alarmState',
    'navigation.closestApproach.enriched.clockLabel',
    'navigation.closestApproach.enriched.passTypeLabel',
    'navigation.closestApproach.enriched.spokenSummary',
    'navigation.closestApproach.enriched.cpaRelativeBearing'
  ].forEach(path => {
    const value = getPathValue(vessel, path);
    if (typeof value !== 'undefined') applyValue(state, context, path, value, timestamp);
  });
}

function seedBattery(state, id, battery, timestamp) {
  if (!isObject(battery)) return;
  [
    ['voltage', 'voltage'],
    ['current', 'current'],
    ['capacity.stateOfCharge', 'capacity.stateOfCharge'],
    ['stateOfCharge', 'capacity.stateOfCharge'],
    ['temperature', 'temperature']
  ].forEach(([readPath, writePath]) => {
    const value = getPathValue(battery, readPath);
    if (typeof value !== 'undefined') {
      applyValue(state, 'vessels.self', `electrical.batteries.${id}.${writePath}`, value, timestamp);
    }
  });
}

function seedNotificationTree(state, context, basePath, value, timestamp) {
  const node = unwrapSignalKValue(value);
  if (!isObject(node)) return;

  if (isNotificationLike(node)) {
    applyValue(state, context, basePath, node, timestamp);
    return;
  }

  Object.keys(node).forEach(key => {
    seedNotificationTree(state, context, `${basePath}.${key}`, node[key], timestamp);
  });
}

function readPreferredDepth(depths, maxAge, now) {
  const priority = ['belowKeel', 'belowTransducer', 'belowSurface'];
  for (const key of priority) {
    const value = readNumber(latestValue(depths[key], maxAge, now));
    if (value !== null) {
      return {
        source: key,
        value
      };
    }
  }
  return null;
}

function readClosestApproach(target, maxAge, now) {
  const raw = latestValue(target.closestApproach.raw, maxAge, now);
  const fields = target.closestApproach.fields;
  const enriched = target.closestApproach.enriched;
  const rawObject = isObject(raw) ? raw : {};

  const cpaNm = readDistanceNm(rawObject, fields, maxAge, now);
  const cpaMeters = readDistanceMeters(rawObject, fields, maxAge, now);
  const gpsCpaMeters = readGpsDistanceMeters(rawObject, fields, maxAge, now);
  const tcpaMin = readTcpaMin(rawObject, fields, maxAge, now);
  const bearingTrue = readBearingTrue(rawObject, fields, maxAge, now);
  const explicitStatus = normalizedStatus(
    firstPresent(
      latestValue(enriched.alarmState, maxAge, now),
      rawObject.collisionAlarmState,
      rawObject.alarmState,
      rawObject.status,
      latestValue(fields.collisionAlarmState, maxAge, now),
      latestValue(fields.status, maxAge, now)
    )
  );

  return {
    cpaNm,
    cpaMeters,
    gpsCpaMeters,
    cpaReference: stringValue(firstPresent(rawObject.cpaReference, latestValue(fields.cpaReference, maxAge, now))),
    tcpaMin,
    bearingTrue,
    relativeClock: clockFromLabel(latestValue(enriched.clockLabel, maxAge, now)),
    status: explicitStatus,
    passType: stringValue(latestValue(enriched.passTypeLabel, maxAge, now)),
    summary: stringValue(latestValue(enriched.spokenSummary, maxAge, now)),
    debugRaw: {
      raw: cloneJson(rawObject),
      enriched: latestRecordValues(enriched, maxAge, now),
      fields: latestRecordValues(fields, maxAge, now)
    }
  };
}

function readDistanceNm(raw, fields, maxAge, now) {
  const nm = readNumber(firstPresent(
    raw.cpaNm,
    raw.distanceNm,
    raw.closestApproachNm,
    latestValue(fields.cpaNm, maxAge, now),
    latestValue(fields.distanceNm, maxAge, now)
  ));
  if (nm !== null) return nm;

  const meters = readNumber(firstPresent(
    raw.distance,
    raw.cpa,
    raw.cpaDistance,
    raw.cpaDistanceMeters,
    raw.closestApproachMeters,
    latestValue(fields.distance, maxAge, now),
    latestValue(fields.cpa, maxAge, now),
    latestValue(fields.cpaDistance, maxAge, now)
  ));

  return meters === null ? null : meters / METERS_PER_NM;
}

function readDistanceMeters(raw, fields, maxAge, now) {
  const meters = readNumber(firstPresent(
    raw.distance,
    raw.cpa,
    raw.cpaDistance,
    raw.cpaDistanceMeters,
    raw.closestApproachMeters,
    latestValue(fields.distance, maxAge, now),
    latestValue(fields.cpa, maxAge, now),
    latestValue(fields.cpaDistance, maxAge, now)
  ));
  if (meters !== null) return meters;

  const nm = readNumber(firstPresent(
    raw.cpaNm,
    raw.distanceNm,
    raw.closestApproachNm,
    latestValue(fields.cpaNm, maxAge, now),
    latestValue(fields.distanceNm, maxAge, now)
  ));
  return nm === null ? null : nm * METERS_PER_NM;
}

function readGpsDistanceMeters(raw, fields, maxAge, now) {
  const meters = readNumber(firstPresent(
    raw.gpsDistance,
    raw.gpsCpa,
    raw.gpsCpaMeters,
    raw.gpsDistanceMeters,
    latestValue(fields.gpsDistance, maxAge, now),
    latestValue(fields.gpsCpa, maxAge, now),
    latestValue(fields.gpsCpaMeters, maxAge, now),
    latestValue(fields.gpsDistanceMeters, maxAge, now)
  ));
  if (meters !== null) return meters;

  const nm = readNumber(firstPresent(
    raw.gpsCpaNm,
    raw.gpsDistanceNm,
    latestValue(fields.gpsCpaNm, maxAge, now),
    latestValue(fields.gpsDistanceNm, maxAge, now)
  ));
  return nm === null ? null : nm * METERS_PER_NM;
}

function readTcpaMin(raw, fields, maxAge, now) {
  const minutes = readNumber(firstPresent(
    raw.tcpaMin,
    raw.timeToMinutes,
    latestValue(fields.tcpaMin, maxAge, now),
    latestValue(fields.timeToMinutes, maxAge, now)
  ));
  if (minutes !== null) return minutes;

  const seconds = readNumber(firstPresent(
    raw.timeTo,
    raw.tcpa,
    raw.timeToClosestApproach,
    raw.tcpaSeconds,
    latestValue(fields.timeTo, maxAge, now),
    latestValue(fields.tcpa, maxAge, now),
    latestValue(fields.timeToClosestApproach, maxAge, now)
  ));

  return seconds === null ? null : seconds / 60;
}

function readBearingTrue(raw, fields, maxAge, now) {
  const degrees = readNumber(firstPresent(
    raw.bearing,
    raw.bearingTrue,
    raw.trueBearing,
    latestValue(fields.bearing, maxAge, now),
    latestValue(fields.bearingTrue, maxAge, now)
  ));
  if (degrees !== null) return normalizeDegrees(degrees);

  return readAngleDegrees(latestValue(fields.bearingRad, maxAge, now), true);
}

function isRiskyTarget(target) {
  return statusRank(target.status) > 0 || target.status === 'alert';
}

function isLocalRequest(req) {
  const candidates = [
    req && req.ip,
    req && req.connection && req.connection.remoteAddress,
    req && req.socket && req.socket.remoteAddress
  ].filter(Boolean);

  if (!candidates.length) return true;

  return candidates.some(address => {
    const value = String(address).toLowerCase();
    return value === '127.0.0.1' ||
      value === '::1' ||
      value === '::ffff:127.0.0.1' ||
      value === 'localhost' ||
      value.startsWith('::ffff:127.');
  });
}

function getTarget(state, context) {
  const key = normalizeContext(context);
  if (!state.targets.has(key)) {
    state.targets.set(key, {
      context: key,
      fields: {},
      closestApproach: {
        raw: undefined,
        fields: {},
        enriched: {}
      },
      lastUpdatedAt: null
    });
  }
  return state.targets.get(key);
}

function getBattery(state, id) {
  const key = String(id || 'battery').trim() || 'battery';
  if (!state.self.electrical.batteries.has(key)) {
    state.self.electrical.batteries.set(key, { fields: {} });
  }
  return state.self.electrical.batteries.get(key);
}

function setLatest(container, key, value, timestamp, path) {
  if (value === null || typeof value === 'undefined') {
    delete container[key];
    return;
  }

  container[key] = {
    value: cloneJson(unwrapSignalKValue(value)),
    timestamp: normalizeTimestamp(timestamp, new Date()),
    path
  };
}

function latestValue(record, maxAgeSeconds, now) {
  if (!record || !isFreshTimestamp(record.timestamp, maxAgeSeconds, now)) return undefined;
  return record.value;
}

function latestValueNoAge(record) {
  return record ? record.value : undefined;
}

function latestRecordValues(records, maxAge, now) {
  const output = {};
  Object.keys(records || {}).forEach(key => {
    const value = latestValue(records[key], maxAge, now);
    if (typeof value !== 'undefined') output[key] = cloneJson(value);
  });
  return output;
}

function isFreshTimestamp(timestamp, maxAgeSeconds, now) {
  if (!timestamp) return false;
  const date = new Date(timestamp);
  const ref = validDate(now) || new Date();
  if (!Number.isFinite(date.getTime())) return false;
  return ref.getTime() - date.getTime() <= maxAgeSeconds * 1000;
}

function isSelfContext(context) {
  const value = normalizeContext(context);
  return value === 'vessels.self' || value === 'vessel.self';
}

function isVesselContext(context) {
  const value = normalizeContext(context);
  return value.startsWith('vessels.') && !isSelfContext(value);
}

function normalizeContext(context) {
  if (Array.isArray(context)) return normalizeContext(context[0]);
  return String(context || '').trim() || 'vessels.self';
}

function normalizeBatteryFieldKey(fieldPath) {
  switch (fieldPath) {
    case 'voltage':
      return 'voltage';
    case 'current':
      return 'current';
    case 'capacity.stateOfCharge':
    case 'stateOfCharge':
      return 'stateOfCharge';
    case 'temperature':
      return 'temperature';
    default:
      return '';
  }
}

function isNotificationActive(value) {
  if (!value) return false;
  if (!isObject(value)) return Boolean(String(value).trim());
  return isActiveLevel(notificationLevel(value));
}

function isNotificationLike(value) {
  return isObject(value) && (
    Object.prototype.hasOwnProperty.call(value, 'state') ||
    Object.prototype.hasOwnProperty.call(value, 'message') ||
    Object.prototype.hasOwnProperty.call(value, 'method')
  );
}

function notificationLevel(value) {
  if (!isObject(value)) return 'alert';
  return normalizedStatus(value.state || value.level || value.status || value.severity) || 'alert';
}

function notificationMessage(value) {
  if (typeof value === 'string') return value.trim();
  if (!isObject(value)) return '';
  return stringValue(value.message || value.description || value.text || value.name);
}

function isActiveLevel(level) {
  const normalized = normalizedStatus(level);
  return normalized !== '' && normalized !== 'normal' && normalized !== 'nominal' && normalized !== 'none';
}

function normalizedStatus(value) {
  const status = stringValue(value).toLowerCase();
  switch (status) {
    case 'emergency':
      return 'emergency';
    case 'alarm':
    case 'danger':
      return 'alarm';
    case 'warning':
    case 'warn':
      return 'warning';
    case 'alert':
      return 'alert';
    case 'normal':
    case 'nominal':
    case 'ok':
    case 'none':
    case 'clear':
    case 'cleared':
      return 'normal';
    default:
      return status || '';
  }
}

function statusRank(value) {
  switch (normalizedStatus(value)) {
    case 'emergency':
      return 4;
    case 'alarm':
      return 3;
    case 'warning':
      return 2;
    case 'alert':
      return 1;
    default:
      return 0;
  }
}

function clockFromLabel(label) {
  const match = stringValue(label).match(/(\d{1,2})\s*o\s*'?clock/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  if (value === 0) return 12;
  return Math.min(12, Math.max(1, Math.round(value)));
}

function clockNumber(bearingTrue, ownHeading) {
  if (typeof bearingTrue !== 'number' || typeof ownHeading !== 'number') return null;
  const relative = normalizeDegrees(bearingTrue - ownHeading);
  const clock = Math.round(relative / 30);
  return clock === 0 ? 12 : clock;
}

function readAngleDegrees(value, normalize) {
  const number = readNumber(value);
  if (number === null) return null;
  const degrees = number * RAD_TO_DEG;
  return normalize ? normalizeDegrees(degrees) : normalizeSignedDegrees(degrees);
}

function normalizeDegrees(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return ((number % 360) + 360) % 360;
}

function normalizeSignedDegrees(value) {
  const degrees = normalizeDegrees(value);
  return degrees > 180 ? degrees - 360 : degrees;
}

function distanceBearing(from, to) {
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);
  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceMeters = 6371000 * c;
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
  const bearingTrue = normalizeDegrees(Math.atan2(y, x) * RAD_TO_DEG);

  return { distanceMeters, bearingTrue };
}

function extractMmsi(context) {
  const text = String(context || '');
  const mmsiMatch = text.match(/mmsi[:.]?(\d{9})/i);
  if (mmsiMatch) return mmsiMatch[1];
  const anyMatch = text.match(/(\d{9})/);
  return anyMatch ? anyMatch[1] : '';
}

function targetMmsi(target) {
  return stringValue(latestValueNoAge(target.fields.mmsi)) || extractMmsi(target.context);
}

function getPathValue(root, path) {
  const parts = String(path || '').split('.').filter(Boolean);
  let node = root;
  for (const part of parts) {
    if (isObject(node) && part in node) {
      node = node[part];
      continue;
    }

    const unwrapped = unwrapSignalKValue(node);
    if (!isObject(unwrapped) || !(part in unwrapped)) return undefined;
    node = unwrapped[part];
  }
  return unwrapSignalKValue(node);
}

function unwrapSignalKValue(value) {
  if (isObject(value) && Object.prototype.hasOwnProperty.call(value, 'value')) {
    return value.value;
  }
  return value;
}

function firstPresent() {
  for (let i = 0; i < arguments.length; i += 1) {
    if (typeof arguments[i] !== 'undefined' && arguments[i] !== null && arguments[i] !== '') {
      return arguments[i];
    }
  }
  return undefined;
}

function readNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

function isPosition(value) {
  return isObject(value) &&
    readNumber(value.latitude) !== null &&
    readNumber(value.longitude) !== null;
}

function stringValue(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function positiveNumber(value, fallback) {
  const number = readNumber(value);
  return number !== null && number > 0 ? number : fallback;
}

function booleanValue(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return fallback;
}

function textValue(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function setBooleanOverride(options, query, key) {
  if (Object.prototype.hasOwnProperty.call(query, key)) {
    options[key] = booleanValue(Array.isArray(query[key]) ? query[key][0] : query[key], options[key]);
  }
}

function setNumberOverride(options, query, key) {
  if (Object.prototype.hasOwnProperty.call(query, key)) {
    options[key] = positiveNumber(Array.isArray(query[key]) ? query[key][0] : query[key], options[key]);
  }
}

function setTextOverride(options, query, key, normalize) {
  if (Object.prototype.hasOwnProperty.call(query, key)) {
    options[key] = normalize(Array.isArray(query[key]) ? query[key][0] : query[key]);
  }
}

function normalizeTimestamp(value, fallbackDate) {
  const date = validDate(value) || validDate(fallbackDate) || new Date();
  return date.toISOString();
}

function validDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) return date;
  }
  return null;
}

function cloneJson(value) {
  if (typeof value === 'undefined') return undefined;
  if (value === null) return null;
  if (typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (err) {
    return String(value);
  }
}

function round(value, digits) {
  const factor = 10 ** digits;
  const rounded = Math.round((Number(value) + Number.EPSILON) * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function kelvinToCelsius(value) {
  return value - 273.15;
}

function toRadians(value) {
  return value * Math.PI / 180;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

module.exports = {
  DEFAULT_OPTIONS,
  SNAPSHOT_PRESETS,
  SNAPSHOT_UNITS,
  applyDelta,
  applyValue,
  buildSnapshot,
  clearSnapshotState,
  createSnapshotState,
  isLocalRequest,
  normalizeOptions,
  optionsWithQueryOverrides,
  seedFromApp
};
