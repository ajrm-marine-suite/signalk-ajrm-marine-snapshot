'use strict';

const http = require('node:http');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const startPlugin = require('../plugin');
const {
  applyDelta,
  buildSnapshot,
  createSnapshotState,
  isLocalRequest,
  optionsWithQueryOverrides,
  seedFromApp
} = require('../plugin/snapshot');

test('builds compact self, AIS, collision, notification, and electrical snapshot', () => {
  const state = createSnapshotState();
  const now = new Date('2026-04-27T14:30:00Z');

  applyDelta(state, {
    context: 'vessels.self',
    updates: [
      {
        timestamp: now.toISOString(),
        values: [
          { path: 'navigation.position', value: { latitude: 51.123, longitude: 1.234 } },
          { path: 'navigation.speedOverGround', value: 2.984 },
          { path: 'navigation.courseOverGroundTrue', value: 82 * Math.PI / 180 },
          { path: 'navigation.headingTrue', value: 79 * Math.PI / 180 },
          { path: 'environment.depth.belowKeel', value: 12.44 },
          { path: 'environment.wind.speedTrue', value: 4.218 },
          { path: 'environment.wind.angleTrueWater', value: 42 * Math.PI / 180 },
          { path: 'electrical.batteries.house.voltage', value: 12.72 },
          { path: 'electrical.batteries.house.capacity.stateOfCharge', value: 0.83 },
          {
            path: 'notifications.collision.235008635',
            value: {
              state: 'warning',
              message: 'Vessel INGRID KNUTSEN. 2 o clock. CPA 0.8 NM. TCPA 28 min'
            }
          }
        ]
      }
    ]
  }, now);

  applyDelta(state, {
    context: 'vessels.urn:mrn:imo:mmsi:235008635',
    updates: [
      {
        timestamp: now.toISOString(),
        values: [
          { path: 'name', value: 'INGRID KNUTSEN' },
          { path: 'mmsi', value: '235008635' },
          { path: 'navigation.position', value: { latitude: 51.136, longitude: 1.243 } },
          { path: 'navigation.speedOverGround', value: 3.2 },
          { path: 'navigation.courseOverGroundTrue', value: 20 * Math.PI / 180 },
          { path: 'sensors.ais.fromBow', value: 86.4 },
          { path: 'sensors.ais.fromCenter', value: -4.5 },
          {
            path: 'navigation.closestApproach',
            value: {
              distance: 1481.6,
              gpsDistance: 1500.2,
              cpaReference: 'hull',
              timeTo: 1680,
              bearing: 35,
              collisionAlarmState: 'warning'
            }
          },
          { path: 'navigation.closestApproach.enriched.clockLabel', value: '2 o clock' },
          { path: 'navigation.closestApproach.enriched.passTypeLabel', value: 'crossing-starboard' },
          { path: 'navigation.closestApproach.enriched.spokenSummary', value: 'Warning. INGRID KNUTSEN at 2 o clock. CPA 0.8 miles in 28 minutes.' }
        ]
      }
    ]
  }, now);

  const snapshot = buildSnapshot(state, {}, now);

  assert.equal(snapshot.timestamp, '2026-04-27T14:30:00.000Z');
  assert.deepEqual(snapshot.self.position, { latitude: 51.123, longitude: 1.234 });
  assert.equal(snapshot.self.sog, 5.8);
  assert.equal(snapshot.self.cog, 82);
  assert.equal(snapshot.self.heading, 79);
  assert.equal(snapshot.self.depth, 12.4);
  assert.equal(snapshot.self.wind.speedTrue, 8.2);
  assert.equal(snapshot.self.wind.angleTrue, 42);
  assert.equal(snapshot.self.electrical.batteries[0].voltage, 12.72);

  assert.equal(snapshot.aisTargets.length, 1);
  assert.equal(snapshot.aisTargets[0].mmsi, '235008635');
  assert.equal(snapshot.aisTargets[0].name, 'INGRID KNUTSEN');
  assert.equal(snapshot.aisTargets[0].relativeClock, 2);
  assert.equal(snapshot.aisTargets[0].cpaNm, 0.8);
  assert.equal(snapshot.aisTargets[0].cpaMeters, 1482);
  assert.equal(snapshot.aisTargets[0].gpsCpaMeters, 1500);
  assert.equal(snapshot.aisTargets[0].cpaReference, 'hull');
  assert.equal(snapshot.aisTargets[0].tcpaMin, 28);
  assert.deepEqual(snapshot.aisTargets[0].gpsAntenna, { fromBow: 86.4, fromCenter: -4.5 });
  assert.equal(snapshot.aisTargets[0].status, 'warning');
  assert.equal(snapshot.notifications.length, 1);
  assert.equal(snapshot.notifications[0].level, 'warning');
});

test('omits stale targets and normal notifications', () => {
  const state = createSnapshotState();
  const old = new Date('2026-04-27T14:20:00Z');
  const now = new Date('2026-04-27T14:30:00Z');

  applyDelta(state, {
    context: 'vessels.urn:mrn:imo:mmsi:111222333',
    updates: [
      {
        timestamp: old.toISOString(),
        values: [
          { path: 'name', value: 'OLD TARGET' },
          { path: 'navigation.closestApproach', value: { distance: 100, timeTo: 300, collisionAlarmState: 'alarm' } }
        ]
      }
    ]
  }, old);

  applyDelta(state, {
    context: 'vessels.self',
    updates: [
      {
        timestamp: now.toISOString(),
        values: [
          { path: 'notifications.collision.111222333', value: { state: 'normal', message: 'clear' } }
        ]
      }
    ]
  }, now);

  const snapshot = buildSnapshot(state, { maxTargetAgeSeconds: 60 }, now);
  assert.equal(snapshot.aisTargets, undefined);
  assert.equal(snapshot.notifications, undefined);
});

test('reads standard root-object vessel deltas', () => {
  const state = createSnapshotState();
  const now = new Date('2026-04-27T14:30:00Z');

  applyDelta(state, {
    context: 'vessels.urn:mrn:imo:mmsi:235900009',
    updates: [
      {
        timestamp: now.toISOString(),
        values: [
          {
            path: '',
            value: {
              name: 'RIB ALPHA',
              communication: {
                callsignVhf: 'VSB009'
              }
            }
          },
          { path: 'navigation.position', value: { latitude: 51.136, longitude: 1.243 } },
          { path: 'navigation.closestApproach', value: { distance: 1481.6, timeTo: 1680, collisionAlarmState: 'warning' } }
        ]
      }
    ]
  }, now);

  const snapshot = buildSnapshot(state, {}, now);
  assert.equal(snapshot.aisTargets.length, 1);
  assert.equal(snapshot.aisTargets[0].mmsi, '235900009');
  assert.equal(snapshot.aisTargets[0].name, 'RIB ALPHA');
  assert.equal(snapshot.aisTargets[0].callsign, 'VSB009');
});

test('query overrides cannot enable remote access', () => {
  const options = optionsWithQueryOverrides(
    {
      allowRemoteAccess: false,
      includeAllTargets: false,
      includeAisPlus: true,
      includeAisPlusHarbourRegions: false,
      includeAisPlusAudio: true,
      includeCompanion: true,
      includeAnnouncerOutput: false,
      includeInstalledApps: true
    },
    {
      allowRemoteAccess: 'true',
      includeAllTargets: 'true',
      includeAisPlus: 'false',
      includeAisPlusHarbourRegions: 'true',
      includeAisPlusAudio: 'false',
      includeCompanion: 'false',
      includeAnnouncerOutput: 'true',
      includeInstalledApps: 'false'
    }
  );

  assert.equal(options.allowRemoteAccess, false);
  assert.equal(options.includeAllTargets, true);
  assert.equal(options.includeAisPlus, false);
  assert.equal(options.includeAisPlusHarbourRegions, true);
  assert.equal(options.includeAisPlusAudio, false);
  assert.equal(options.includeCompanion, false);
  assert.equal(options.includeAnnouncerOutput, true);
  assert.equal(options.includeInstalledApps, false);
});

test('snapshot presets centralize voyage and debug capture defaults', () => {
  const voyage = optionsWithQueryOverrides(
    {
      allowRemoteAccess: false,
      maxTargetAgeSeconds: 120,
      maxNotificationAgeSeconds: 300,
      includeAllTargets: false,
      includeDebugRaw: false
    },
    { snapshotPreset: 'voyage' }
  );
  assert.equal(voyage.snapshotPreset, 'voyage');
  assert.equal(voyage.maxTargetAgeSeconds, 600);
  assert.equal(voyage.maxNotificationAgeSeconds, 3600);
  assert.equal(voyage.includeAllTargets, false);
  assert.equal(voyage.includeDebugRaw, false);

  const debug = optionsWithQueryOverrides({}, { snapshotPreset: 'debug' });
  assert.equal(debug.snapshotPreset, 'debug');
  assert.equal(debug.maxTargetAgeSeconds, 600);
  assert.equal(debug.maxNotificationAgeSeconds, 3600);
  assert.equal(debug.includeAllTargets, true);
  assert.equal(debug.includeDebugRaw, true);
});

test('AJRM Marine snapshot keeps the harbour list optional', async () => {
  const harbourPayload = {
    regions: [
      {
        id: 'harbour-a',
        name: 'Harbour: A',
        geometry: {
          type: 'Polygon',
          coordinates: [[[1, 2], [3, 2], [3, 4], [1, 2]]]
        }
      },
      {
        id: 'harbour-b',
        name: 'Harbour: B',
        geometry: {
          type: 'Point',
          coordinates: [5, 6]
        }
      }
    ]
  };
  const server = http.createServer((req, res) => {
    if (new URL(req.url, 'http://localhost').pathname === '/plugins/signalk-ajrm-marine-display/harbourRegions') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(harbourPayload));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  try {
    const route = snapshotRouteHandler(startPlugin({ debug() {}, error() {} }));
    const baseQuery = {
      includeAisPlus: 'true',
      includeAisPlusAudio: 'false',
      includeCompanion: 'false',
      includeAnnouncerOutput: 'false'
    };
    const host = `127.0.0.1:${server.address().port}`;
    const compact = await invokeSnapshotRoute(route, host, baseQuery);
    const expanded = await invokeSnapshotRoute(route, host, {
      ...baseQuery,
      includeAisPlusHarbourRegions: 'true'
    });

    assert.equal(compact.ajrmMarine.harbours.count, 2);
    assert.equal(compact.ajrmMarine.harbours.regions, undefined);
    assert.equal(expanded.ajrmMarine.harbours.count, 2);
    assert.deepEqual(expanded.ajrmMarine.harbours.regions, [
      { id: 'harbour-a', name: 'Harbour: A', bounds: [1, 2, 3, 4] },
      { id: 'harbour-b', name: 'Harbour: B', bounds: [5, 6, 5, 6] }
    ]);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('snapshot includes installed Signal K app versions', async () => {
  const configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-snapshot-apps-'));
  await fs.mkdir(path.join(configDir, 'node_modules', 'signalk-ajrm-marine-voyage-viewer'), { recursive: true });
  await fs.mkdir(path.join(configDir, 'node_modules', 'left-pad'), { recursive: true });
  await fs.writeFile(
    path.join(configDir, 'package.json'),
    JSON.stringify({
      dependencies: {
        'signalk-ajrm-marine-voyage-viewer': 'git+https://github.com/ajrm-marine-suite/signalk-ajrm-marine-voyage-viewer.git#v0.1.14',
        'left-pad': '^1.3.0'
      }
    })
  );
  await fs.writeFile(
    path.join(configDir, 'node_modules', 'signalk-ajrm-marine-voyage-viewer', 'package.json'),
    JSON.stringify({
      name: 'signalk-ajrm-marine-voyage-viewer',
      version: '0.1.14',
      description: 'AJRM Marine Voyage Viewer',
      keywords: ['signalk-node-server-plugin', 'signalk-webapp'],
      signalk: {
        displayName: 'AJRM Marine Voyage Viewer',
        appIcon: './icon.svg'
      }
    })
  );
  await fs.writeFile(
    path.join(configDir, 'node_modules', 'left-pad', 'package.json'),
    JSON.stringify({
      name: 'left-pad',
      version: '1.3.0'
    })
  );

  const route = snapshotRouteHandler(startPlugin(fakeAppWithConfig({}, configDir)));
  const snapshot = await invokeSnapshotRoute(route, '127.0.0.1', {
    includeAisPlus: 'false',
    includeAisPlusAudio: 'false',
    includeCompanion: 'false',
    includeAnnouncerOutput: 'false',
    includeInstalledApps: 'true',
    includeSuiteDiagnostics: 'false'
  });

  assert.equal(snapshot.installedApps.count, 1);
  assert.deepEqual(snapshot.installedApps.packages[0], {
    name: 'signalk-ajrm-marine-voyage-viewer',
    version: '0.1.14',
    displayName: 'AJRM Marine Voyage Viewer',
    description: 'AJRM Marine Voyage Viewer',
    source: 'git+https://github.com/ajrm-marine-suite/signalk-ajrm-marine-voyage-viewer.git#v0.1.14',
    appIcon: './icon.svg'
  });
});

test('snapshot includes long voyage diagnostics from plugin status routes', async () => {
  const responses = {
    '/plugins/signalk-ajrm-marine-traffic/status': {
      plugin: 'signalk-ajrm-marine-traffic',
      version: '0.5.6',
      ok: true,
      profiles: {
        current: 'harbor',
        harbor: { enabled: true, cpa: 0.5, tcpaLookahead: 1800 }
      },
      targets: [
        { mmsi: '235900005', name: 'HARBOUR TUG', lastAlarmState: 'warning' }
      ]
    },
    '/plugins/signalk-ajrm-marine-capture/status': {
      plugin: 'signalk-ajrm-marine-capture',
      version: '0.5.3',
      enabled: true,
      state: 'watching',
      voyages: [
        {
          fileName: 'voyage-20260626T201629Z.zip',
          bytes: 101883,
          comment: 'Long soak test'
        }
      ],
      recentEvents: [
        { at: '2026-06-26T20:31:31.840Z', type: 'voyage-stopped', message: 'manual' }
      ]
    },
    '/signalk/v1/api/ajrmMarineLogger/status': {
      plugin: 'signalk-ajrm-marine-logger',
      version: '0.5.5',
      playback: { active: false, rate: 'max' },
      stats: { playbackSent: 47897 },
      voyages: [
        { fileName: 'voyage-20260626T201629Z.zip', bytes: 101883 }
      ]
    },
    '/plugins/signalk-ajrm-marine-dr-plotter/status': {
      plugin: 'signalk-ajrm-marine-dr-plotter',
      version: '0.5.0',
      enabled: true,
      noAisTargets: true
    },
    '/plugins/signalk-ajrm-marine-gps-integrity/status': {
      plugin: 'signalk-ajrm-marine-gps-integrity',
      version: '0.5.0',
      state: 'trusted',
      sample: { sogKnots: 5.4 }
    },
    '/plugins/signalk-ajrm-marine-simulator/state': {
      plugin: 'signalk-ajrm-marine-simulator',
      version: '0.5.4',
      outputEnabled: true,
      own: { speedKnots: 5, gpsFaultMode: 'normal' },
      targets: [
        { mmsi: '235900005', name: 'HARBOUR TUG', enabled: true, speedKnots: 3.2 }
      ]
    },
    '/plugins/signalk-ajrm-marine-notifications/status': {
      plugin: 'signalk-ajrm-marine-notifications',
      version: '0.5.1',
      active: [],
      history: [
        { ts: '2026-06-26T20:20:00Z', type: 'audio', message: 'Traffic advisory' }
      ]
    },
    '/signalk/v1/api/resources/charts': {
      '0002-0': {
        name: 'W-0002-0',
        bounds: [-13.79, 48.16, 3.41, 62.83],
        minzoom: 8,
        maxzoom: 9,
        scale: 1600000,
        format: 'png',
        type: 'tilelayer'
      }
    }
  };

  const server = http.createServer((req, res) => {
    const pathName = new URL(req.url, 'http://localhost').pathname;
    if (responses[pathName]) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(responses[pathName]));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  try {
    const route = snapshotRouteHandler(startPlugin(fakeAppWithConfig({}, await fs.mkdtemp(path.join(os.tmpdir(), 'ai-snapshot-long-')))));
    const snapshot = await invokeSnapshotRoute(route, `127.0.0.1:${server.address().port}`, {
      includeAisPlus: 'false',
      includeAisPlusAudio: 'false',
      includeCompanion: 'false',
      includeAnnouncerOutput: 'false',
      includeInstalledApps: 'false',
      includeSuiteDiagnostics: 'true'
    });

    assert.equal(snapshot.longVoyageDiagnostics.traffic.targets.count, 1);
    assert.equal(snapshot.longVoyageDiagnostics.capture.voyages[0].comment, 'Long soak test');
    assert.equal(snapshot.longVoyageDiagnostics.logger.playback.rate, 'max');
    assert.equal(snapshot.longVoyageDiagnostics.drPlotter.noAisTargets, true);
    assert.equal(snapshot.longVoyageDiagnostics.gpsIntegrity.sample.sogKnots, 5.4);
    assert.equal(snapshot.longVoyageDiagnostics.simulator.targets.count, 1);
    assert.equal(snapshot.longVoyageDiagnostics.notifications.historyRecent[0].message, 'Traffic advisory');
    assert.equal(snapshot.longVoyageDiagnostics.chartResources.count, 1);
    assert.deepEqual(snapshot.longVoyageDiagnostics.chartResources.charts[0].bounds, [-13.79, 48.16, 3.41, 62.83]);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('filters own vessel from AIS targets when self MMSI is known', () => {
  const state = createSnapshotState();
  const now = new Date('2026-04-27T14:30:00Z');

  applyDelta(state, {
    context: 'vessels.self',
    updates: [
      {
        timestamp: now.toISOString(),
        values: [
          { path: 'name', value: 'Test Own Vessel' },
          { path: 'mmsi', value: '235008635' },
          { path: 'navigation.position', value: { latitude: 51.1, longitude: 1.2 } }
        ]
      }
    ]
  }, now);

  applyDelta(state, {
    context: 'vessels.urn:mrn:imo:mmsi:235008635',
    updates: [
      {
        timestamp: now.toISOString(),
        values: [
          { path: 'name', value: 'Test Own Vessel' },
          { path: 'mmsi', value: '235008635' },
          { path: 'navigation.position', value: { latitude: 51.1, longitude: 1.2 } },
          { path: 'navigation.closestApproach', value: { distance: 100, timeTo: 300, collisionAlarmState: 'warning' } }
        ]
      }
    ]
  }, now);

  const snapshot = buildSnapshot(state, {}, now);
  assert.equal(snapshot.self.mmsi, '235008635');
  assert.equal(snapshot.self.name, 'Test Own Vessel');
  assert.equal(snapshot.aisTargets, undefined);
});

test('request-time seeding refreshes self data without making old targets fresh', () => {
  const state = createSnapshotState();
  const old = new Date('2026-04-27T14:20:00Z');
  const now = new Date('2026-04-27T14:30:00Z');

  applyDelta(state, {
    context: 'vessels.urn:mrn:imo:mmsi:111222333',
    updates: [
      {
        timestamp: old.toISOString(),
        values: [
          { path: 'name', value: 'OLD TARGET' },
          { path: 'navigation.closestApproach', value: { distance: 100, timeTo: 300, collisionAlarmState: 'alarm' } }
        ]
      }
    ]
  }, old);

  seedFromApp(fakeApp({
    'vessels.self.name': 'Test Own Vessel',
    'vessels.self.mmsi': '235008635',
    'vessels.self.navigation.position': { latitude: 51.12345, longitude: 1.23456 },
    vessels: {
      'urn:mrn:imo:mmsi:111222333': {
        name: { value: 'OLD TARGET' },
        navigation: {
          closestApproach: {
            value: { distance: 100, timeTo: 300, collisionAlarmState: 'alarm' }
          }
        }
      }
    }
  }), state, now, { includeTargets: false });

  const snapshot = buildSnapshot(state, { maxTargetAgeSeconds: 60 }, now);
  assert.deepEqual(snapshot.self.position, { latitude: 51.12345, longitude: 1.23456 });
  assert.equal(snapshot.self.name, 'Test Own Vessel');
  assert.equal(snapshot.aisTargets, undefined);
});

test('local request detection accepts loopback and rejects private lan addresses', () => {
  assert.equal(isLocalRequest({ ip: '::1' }), true);
  assert.equal(isLocalRequest({ ip: '::ffff:127.0.0.1' }), true);
  assert.equal(isLocalRequest({ ip: '192.168.1.20' }), false);
});

function snapshotRouteHandler(plugin) {
  const routes = {};
  plugin.registerWithRouter({
    get(path, handler) {
      routes[path] = handler;
    }
  });
  return routes['/snapshot'];
}

async function invokeSnapshotRoute(handler, host, query) {
  let body;
  const res = {
    statusCode: 200,
    set() {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      body = value;
    }
  };
  await handler({
    protocol: 'http',
    ip: '127.0.0.1',
    query,
    get(header) {
      if (header === 'host') return host;
      if (header === 'cookie') return '';
      return '';
    }
  }, res);
  assert.equal(res.statusCode, 200);
  return body;
}

function fakeApp(paths) {
  return {
    getSelfPath(path) {
      return paths[`vessels.self.${path}`];
    },
    getPath(path) {
      return paths[path];
    }
  };
}

function fakeAppWithConfig(paths, configPath) {
  return {
    ...fakeApp(paths),
    config: {
      configPath
    },
    debug() {},
    error() {}
  };
}
