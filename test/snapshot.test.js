'use strict';

const http = require('node:http');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const packageInfo = require('../package.json');
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
          { path: 'navigation.closestApproach.enriched.cpaRelativeBearing', value: Math.PI / 3 },
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

test('uses Navigation Reference provenance and never labels raw magnetic heading as true', () => {
  const state = createSnapshotState();
  const now = new Date('2026-07-16T09:04:25Z');

  applyDelta(state, {
    context: 'vessels.self',
    updates: [
      {
        timestamp: now.toISOString(),
        values: [
          { path: 'navigation.headingMagnetic', value: 100 * Math.PI / 180 },
          { path: 'navigation.headingTrue', value: 40 * Math.PI / 180 },
          {
            path: 'plugins.ajrmMarineNavigationReference.state',
            value: {
              contract: 'ajrm-marine-navigation-reference',
              schemaVersion: 1,
              status: 'heading',
              position: {
                value: { latitude: 55.8872512, longitude: -5.724038 }
              },
              groundTrack: {
                courseTrue: { value: 80 * Math.PI / 180 },
                speedOverGround: { value: 2.5 }
              },
              bowHeadingTrue: {
                value: 98.63 * Math.PI / 180,
                source: 'YDEN.4',
                method: 'magnetic-heading-plus-wmm'
              },
              clockReference: {
                value: 98.63 * Math.PI / 180,
                kind: 'heading',
                source: 'YDEN.4',
                method: 'magnetic-heading-plus-wmm',
                ageMs: 120,
                uncertaintyRad: 5.03 * Math.PI / 180,
                gpsDependent: false
              },
              magneticVariation: {
                value: -1.37 * Math.PI / 180
              },
              throughWater: { leewayStatus: 'unknown' },
              residual: {
                origin: 'ground-minus-water-residual',
                gpsDependent: true
              }
            }
          }
        ]
      }
    ]
  }, now);

  const snapshot = buildSnapshot(state, {}, now);

  assert.equal(snapshot.self.heading, 99);
  assert.equal(snapshot.self.cog, 80);
  assert.equal(snapshot.self.sog, 4.9);
  assert.deepEqual(snapshot.self.position, {
    latitude: 55.887251,
    longitude: -5.724038
  });
  assert.deepEqual(snapshot.self.clockReference, {
    degreesTrue: 99,
    kind: 'heading',
    source: 'YDEN.4',
    method: 'magnetic-heading-plus-wmm',
    ageMs: 120,
    uncertaintyDegrees: 5,
    gpsDependent: false
  });
  assert.deepEqual(snapshot.self.navigationReference, {
    contract: 'ajrm-marine-navigation-reference',
    schemaVersion: 1,
    status: 'heading',
    leewayStatus: 'unknown',
    residualOrigin: 'ground-minus-water-residual',
    magneticVariationDegrees: -1.37,
    residualGpsDependent: true
  });
});

test('does not fall back to raw heading when Navigation Reference is present but has no clock reference', () => {
  const state = createSnapshotState();
  const now = new Date('2026-07-16T09:04:25Z');

  applyDelta(state, {
    context: 'vessels.self',
    updates: [{
      timestamp: now.toISOString(),
      values: [
        { path: 'navigation.headingTrue', value: 40 * Math.PI / 180 },
        { path: 'navigation.courseOverGroundTrue', value: 40 * Math.PI / 180 },
        {
          path: 'plugins.ajrmMarineNavigationReference.state',
          value: {
            contract: 'ajrm-marine-navigation-reference',
            schemaVersion: 1,
            status: 'unavailable',
            position: {
              value: { latitude: 55.8872512, longitude: -5.724038 }
            },
            groundTrack: {
              courseTrue: { value: 80 * Math.PI / 180 },
              speedOverGround: { value: 0.1 }
            },
            bowHeadingTrue: null,
            clockReference: null,
            throughWater: { leewayStatus: 'unknown' }
          }
        }
      ]
    }]
  }, now);
  applyDelta(state, {
    context: 'vessels.urn:mrn:imo:mmsi:235008635',
    updates: [{
      timestamp: now.toISOString(),
      values: [
        { path: 'mmsi', value: '235008635' },
        {
          path: 'navigation.position',
          value: { latitude: 55.8972512, longitude: -5.724038 }
        }
      ]
    }]
  }, now);

  const snapshot = buildSnapshot(
    state,
    { includeAllTargets: true },
    now
  );

  assert.equal(snapshot.self.cog, 80);
  assert.equal(Object.hasOwn(snapshot.self, 'heading'), false);
  assert.equal(
    Object.hasOwn(snapshot.aisTargets[0], 'relativeClock'),
    false
  );
});

test('withholds raw navigation when Navigation Reference has a wrong or unsupported contract', () => {
  const now = new Date('2026-07-16T09:04:25Z');
  const invalidReferences = [
    {
      contract: 'unexpected-provider',
      schemaVersion: 1
    },
    {
      contract: 'ajrm-marine-navigation-reference',
      schemaVersion: 2
    }
  ];

  for (const invalidReference of invalidReferences) {
    const state = createSnapshotState();
    applyDelta(state, {
      context: 'vessels.self',
      updates: [{
        timestamp: now.toISOString(),
        values: [
          {
            path: 'navigation.position',
            value: { latitude: 55.8872512, longitude: -5.724038 }
          },
          { path: 'navigation.speedOverGround', value: 2.5 },
          {
            path: 'navigation.courseOverGroundTrue',
            value: 80 * Math.PI / 180
          },
          { path: 'navigation.headingTrue', value: 40 * Math.PI / 180 },
          {
            path: 'plugins.ajrmMarineNavigationReference.state',
            value: invalidReference
          }
        ]
      }]
    }, now);
    applyDelta(state, {
      context: 'vessels.urn:mrn:imo:mmsi:235008635',
      updates: [{
        timestamp: now.toISOString(),
        values: [
          { path: 'mmsi', value: '235008635' },
          {
            path: 'navigation.position',
            value: { latitude: 55.8972512, longitude: -5.724038 }
          }
        ]
      }]
    }, now);

    const snapshot = buildSnapshot(
      state,
      { includeAllTargets: true },
      now
    );

    assert.equal(Object.hasOwn(snapshot.self, 'position'), false);
    assert.equal(Object.hasOwn(snapshot.self, 'sog'), false);
    assert.equal(Object.hasOwn(snapshot.self, 'cog'), false);
    assert.equal(Object.hasOwn(snapshot.self, 'heading'), false);
    assert.equal(Object.hasOwn(snapshot.self, 'clockReference'), false);
    assert.equal(
      Object.hasOwn(snapshot.aisTargets[0], 'relativeClock'),
      false
    );
  }
});

test('withholds raw navigation while a recorded Navigation Reference state is stale', () => {
  const state = createSnapshotState();
  const now = new Date('2026-07-16T09:10:00Z');
  const stale = new Date('2026-07-16T09:00:00Z');

  applyDelta(state, {
    context: 'vessels.self',
    updates: [{
      timestamp: stale.toISOString(),
      values: [{
        path: 'plugins.ajrmMarineNavigationReference.state',
        value: {
          contract: 'ajrm-marine-navigation-reference',
          schemaVersion: 1,
          status: 'heading'
        }
      }]
    }]
  }, stale);
  applyDelta(state, {
    context: 'vessels.self',
    updates: [{
      timestamp: now.toISOString(),
      values: [
        {
          path: 'navigation.position',
          value: { latitude: 55.8872512, longitude: -5.724038 }
        },
        { path: 'navigation.speedOverGround', value: 2.5 },
        {
          path: 'navigation.courseOverGroundTrue',
          value: 80 * Math.PI / 180
        },
        { path: 'navigation.headingTrue', value: 40 * Math.PI / 180 }
      ]
    }]
  }, now);

  const snapshot = buildSnapshot(state, {}, now);

  assert.equal(Object.hasOwn(snapshot.self, 'position'), false);
  assert.equal(Object.hasOwn(snapshot.self, 'sog'), false);
  assert.equal(Object.hasOwn(snapshot.self, 'cog'), false);
  assert.equal(Object.hasOwn(snapshot.self, 'heading'), false);
});

test('does not infer GPS independence from missing provider provenance', () => {
  const state = createSnapshotState();
  const now = new Date('2026-07-16T09:04:25Z');

  applyDelta(state, {
    context: 'vessels.self',
    updates: [{
      timestamp: now.toISOString(),
      values: [{
        path: 'plugins.ajrmMarineNavigationReference.state',
        value: {
          contract: 'ajrm-marine-navigation-reference',
          schemaVersion: 1,
          status: 'heading',
          clockReference: {
            value: 0,
            kind: 'heading',
            source: 'incomplete.test',
            method: 'direct-true-heading'
          },
          residual: {
            origin: 'ground-minus-water-residual'
          }
        }
      }]
    }]
  }, now);

  const snapshot = buildSnapshot(state, {}, now);

  assert.equal(snapshot.self.clockReference.degreesTrue, 0);
  assert.equal(
    Object.hasOwn(snapshot.self.clockReference, 'gpsDependent'),
    false
  );
  assert.equal(
    Object.hasOwn(snapshot.self.navigationReference, 'residualGpsDependent'),
    false
  );
});

test('omits heading when only an unconverted magnetic heading is available', () => {
  const state = createSnapshotState();
  const now = new Date('2026-07-16T09:04:25Z');

  applyDelta(state, {
    context: 'vessels.self',
    updates: [{
      timestamp: now.toISOString(),
      values: [
        { path: 'navigation.headingMagnetic', value: 100 * Math.PI / 180 }
      ]
    }]
  }, now);

  const snapshot = buildSnapshot(state, {}, now);
  assert.equal(Object.hasOwn(snapshot.self, 'heading'), false);
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
      includeInstalledApps: true
    },
    {
      allowRemoteAccess: 'true',
      includeAllTargets: 'true',
      includeAisPlus: 'false',
      includeAisPlusHarbourRegions: 'true',
      includeAisPlusAudio: 'false',
      includeInstalledApps: 'false'
    }
  );

  assert.equal(options.allowRemoteAccess, false);
  assert.equal(options.includeAllTargets, true);
  assert.equal(options.includeAisPlus, false);
  assert.equal(options.includeAisPlusHarbourRegions, true);
  assert.equal(options.includeAisPlusAudio, false);
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
    const requestPath = new URL(req.url, 'http://localhost').pathname;
    if (requestPath === '/plugins/signalk-ajrm-marine-traffic/status') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        plugin: 'signalk-ajrm-marine-traffic',
        version: '0.7.0',
        profiles: { current: 'coastal', coastal: { enabled: true, cpa: 0.5 } },
        targets: [{ mmsi: '235000001', lastAlarmState: 'warning' }]
      }));
      return;
    }
    if (requestPath === '/plugins/signalk-ajrm-marine-display/harbourRegions') {
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
    };
    const host = `127.0.0.1:${server.address().port}`;
    const compact = await invokeSnapshotRoute(route, host, baseQuery);
    const expanded = await invokeSnapshotRoute(route, host, {
      ...baseQuery,
      includeAisPlusHarbourRegions: 'true'
    });

    assert.equal(compact.ajrmMarine.harbours.count, 2);
    assert.equal(compact.ajrmMarine.traffic.plugin, 'signalk-ajrm-marine-traffic');
    assert.equal(compact.ajrmMarine.traffic.profiles.current, 'coastal');
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
      includeInstalledApps: 'false',
      includeSuiteDiagnostics: 'true'
    });

    assert.equal(snapshot.longVoyageDiagnostics.traffic.targets.count, 1);
    assert.equal(snapshot.longVoyageDiagnostics.capture.voyages[0].comment, 'Long soak test');
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

test('in-process snapshot API includes long voyage diagnostics', async () => {
  const server = http.createServer((req, res) => {
    const pathName = new URL(req.url, 'http://localhost').pathname;
    if (pathName === '/plugins/signalk-ajrm-marine-capture/status') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        plugin: 'signalk-ajrm-marine-capture',
        captureMode: 'debug',
        voyages: [{ fileName: 'voyage-debug.zip', comment: 'Debug voyage' }]
      }));
      return;
    }
    if (pathName === '/plugins/signalk-ajrm-marine-simulator/state') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        plugin: 'signalk-ajrm-marine-simulator',
        outputEnabled: true,
        own: { speedKnots: 6.2 }
      }));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  try {
    const app = fakeAppWithConfig({}, await fs.mkdtemp(path.join(os.tmpdir(), 'ai-snapshot-api-')));
    const plugin = startPlugin(app);
    plugin.start({
      signalKBaseUrl: `http://127.0.0.1:${server.address().port}`,
      includeAisPlus: false,
      includeAisPlusAudio: false,
      includeInstalledApps: false
    });

    const apiSnapshot = await app.ajrmMarineSnapshotApi.snapshot({ snapshotPreset: 'debug' });

    assert.equal(apiSnapshot.longVoyageDiagnostics.capture.captureMode, 'debug');
    assert.equal(apiSnapshot.longVoyageDiagnostics.capture.voyages[0].comment, 'Debug voyage');
    assert.equal(apiSnapshot.longVoyageDiagnostics.simulator.outputEnabled, true);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('in-process snapshot API reports browser access readiness', async () => {
  const app = fakeAppWithConfig({}, await fs.mkdtemp(path.join(os.tmpdir(), 'ai-snapshot-status-')));
  const plugin = startPlugin(app);
  plugin.start({ allowRemoteAccess: true });

  const status = app.ajrmMarineSnapshotApi.status();

  assert.equal(status.ok, true);
  assert.equal(status.pluginId, 'signalk-ajrm-marine-snapshot');
  assert.equal(status.version, packageInfo.version);
  assert.equal(status.allowRemoteAccess, true);
  assert.equal(status.snapshotPath, '/plugins/signalk-ajrm-marine-snapshot/snapshot');
  assert.equal(status.settingsPath, '/plugins/signalk-ajrm-marine-snapshot/settings');
});

test('restart releases prior subscriptions and keeps one in-process API', () => {
  let subscribed = 0;
  let unsubscribed = 0;
  const app = {
    ...fakeApp({}),
    debug() {},
    error() {},
    setPluginStatus() {},
    subscriptionmanager: {
      subscribe(_subscription, unsubscribes) {
        subscribed += 1;
        unsubscribes.push(() => { unsubscribed += 1; });
      }
    }
  };
  const plugin = startPlugin(app);

  plugin.start({});
  const firstApi = app.ajrmMarineSnapshotApi;
  plugin.start({});
  assert.equal(subscribed, 4);
  assert.equal(unsubscribed, 2);
  assert.notEqual(app.ajrmMarineSnapshotApi, firstApi);

  plugin.stop();
  assert.equal(unsubscribed, 4);
  assert.equal(app.ajrmMarineSnapshotApi, undefined);
});

test('remote snapshot access requires both opt-in and Signal K authentication', async () => {
  const plugin = startPlugin({ ...fakeApp({}), debug() {}, error() {} });
  plugin.start({ allowRemoteAccess: true, includeAisPlus: false, includeAisPlusAudio: false });
  const route = snapshotRouteHandler(plugin);
  let statusCode = 200;
  let body;
  await route({
    ip: '192.168.1.20',
    skIsAuthenticated: false,
    skPrincipal: { permissions: 'readonly' },
    query: {},
    protocol: 'http',
    get() { return 'nemo.local:3000'; }
  }, {
    status(code) { statusCode = code; return this; },
    json(value) { body = value; },
    set() {}
  });
  assert.equal(statusCode, 403);
  assert.match(body.error, /local-only/);
  plugin.stop();
});

test('OpenAPI paths match the registered HTTP API', () => {
  const routes = new Map();
  const plugin = startPlugin({ ...fakeApp({}), debug() {}, error() {} });
  plugin.registerWithRouter({
    get(path, handler) { routes.set(`GET ${path}`, handler); }
  });
  const documented = Object.entries(plugin.getOpenApi().paths).flatMap(([path, pathItem]) =>
    Object.keys(pathItem)
      .filter(method => method === 'get')
      .map(method => `${method.toUpperCase()} ${path}`)
  );
  assert.deepEqual([...routes.keys()].sort(), documented.sort());
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

test('uses Signal K radians for angle paths without magnitude guessing', () => {
  const state = createSnapshotState();
  const now = new Date('2026-04-27T14:30:00Z');

  applyDelta(state, {
    context: 'vessels.self',
    updates: [
      {
        timestamp: now.toISOString(),
        values: [
          { path: 'navigation.courseOverGroundTrue', value: 90 },
          { path: 'navigation.headingTrue', value: 90 },
          { path: 'environment.wind.angleTrueWater', value: 90 }
        ]
      }
    ]
  }, now);

  const snapshot = buildSnapshot(state, {}, now);
  assert.equal(snapshot.self.cog, 117);
  assert.equal(snapshot.self.heading, 117);
  assert.equal(snapshot.self.wind.angleTrue, 117);
});

test('does not infer target alert status from CPA and TCPA numbers', () => {
  const state = createSnapshotState();
  const now = new Date('2026-04-27T14:30:00Z');

  applyDelta(state, {
    context: 'vessels.urn:mrn:imo:mmsi:235008635',
    updates: [
      {
        timestamp: now.toISOString(),
        values: [
          { path: 'mmsi', value: '235008635' },
          { path: 'navigation.closestApproach', value: { distance: 100, timeTo: 300 } }
        ]
      }
    ]
  }, now);

  assert.equal(buildSnapshot(state, {}, now).aisTargets, undefined);
  const snapshot = buildSnapshot(state, { includeAllTargets: true }, now);
  assert.equal(snapshot.aisTargets[0].mmsi, '235008635');
  assert.equal(snapshot.aisTargets[0].status, undefined);
});

test('does not infer relative clock from closest-approach label text', () => {
  const state = createSnapshotState();
  const now = new Date('2026-04-27T14:30:00Z');

  applyDelta(state, {
    context: 'vessels.urn:mrn:imo:mmsi:235008635',
    updates: [
      {
        timestamp: now.toISOString(),
        values: [
          { path: 'mmsi', value: '235008635' },
          { path: 'navigation.closestApproach', value: { collisionAlarmState: 'warning' } },
          { path: 'navigation.closestApproach.enriched.clockLabel', value: '2 o clock' }
        ]
      }
    ]
  }, now);

  const snapshot = buildSnapshot(state, { includeAllTargets: true }, now);
  assert.equal(snapshot.aisTargets[0].relativeClock, undefined);
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
