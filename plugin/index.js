'use strict';

const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');

const openApi = require('../openApi.json');
const {
  DEFAULT_OPTIONS,
  applyDelta,
  buildSnapshot,
  clearSnapshotState,
  createSnapshotState,
  isLocalRequest,
  normalizeOptions,
  optionsWithQueryOverrides,
  seedFromApp
} = require('./snapshot');

const AJRM_MARINE_SNAPSHOT_API_REGISTRY = Symbol.for('mcdonaldajr.ajrmMarineSnapshotApi');
const KNOWN_SUITE_PACKAGES = new Set([
  'signalk-ajrm-marine-snapshot',
  'signalk-ajrm-marine-audio',
  'signalk-ajrm-marine-console',
  'signalk-ajrm-marine-display',
  'signalk-ajrm-marine-traffic',
  'signalk-ajrm-marine-instrument-alerts',
  'signalk-ajrm-marine-logger',
  'signalk-ajrm-marine-dr-plotter',
  'signalk-ajrm-marine-gps-integrity',
  'signalk-ajrm-marine-harbour-editor',
  'signalk-ajrm-marine-instruments',
  'signalk-ajrm-marine-notifications',
  'signalk-ajrm-marine-pi-controller',
  'signalk-self-track-simulator',
  'signalk-vessel-simulator',
  'signalk-ajrm-marine-capture',
  'signalk-ajrm-marine-voyage-viewer',
  'signalk-ajrm-marine-alerts',
  'signalk-ajrm-marine-simulator'
]);

module.exports = function startPlugin(app) {
  let state = createSnapshotState();
  let unsubscribes = [];
  let currentOptions = normalizeOptions(DEFAULT_OPTIONS);

  const plugin = {
    id: 'signalk-ajrm-marine-snapshot',
    name: 'AJRM Marine Snapshot',
    description: 'Creates a compact local Signal K JSON snapshot for manual copy/paste into ChatGPT.'
  };

  plugin.schema = function schema() {
    return {
      type: 'object',
      properties: {
        maxSelfValueAgeSeconds: {
          type: 'number',
          title: 'Max own-vessel value age seconds',
          description: 'Own-vessel readings older than this are omitted from snapshots.',
          default: DEFAULT_OPTIONS.maxSelfValueAgeSeconds,
          minimum: 1
        },
        maxTargetAgeSeconds: {
          type: 'number',
          title: 'Max AIS target age seconds',
          description: 'AIS targets older than this are omitted from snapshots.',
          default: DEFAULT_OPTIONS.maxTargetAgeSeconds,
          minimum: 1
        },
        maxNotificationAgeSeconds: {
          type: 'number',
          title: 'Max notification age seconds',
          description: 'Active notifications older than this are omitted from snapshots.',
          default: DEFAULT_OPTIONS.maxNotificationAgeSeconds,
          minimum: 1
        },
        maxAisRangeNm: {
          type: 'number',
          title: 'Max AIS range NM',
          description: 'AIS targets with a known current range beyond this distance are omitted.',
          default: DEFAULT_OPTIONS.maxAisRangeNm,
          minimum: 0.1
        },
        includeAllTargets: {
          type: 'boolean',
          title: 'Include all targets',
          description: 'When disabled, only targets with risky CPA/TCPA or collision/enriched status are included.',
          default: DEFAULT_OPTIONS.includeAllTargets
        },
        includeNotifications: {
          type: 'boolean',
          title: 'Include notifications',
          default: DEFAULT_OPTIONS.includeNotifications
        },
        includeElectrical: {
          type: 'boolean',
          title: 'Include electrical and battery data',
          default: DEFAULT_OPTIONS.includeElectrical
        },
        includeAisPlus: {
          type: 'boolean',
          title: 'Include AJRM Marine server state',
          description: 'Adds AJRM Marine profiles, sensitivity, repeat intervals, auto-profile status, harbour count, active alert events, speech settings, and recent announcement log when AJRM Marine is installed.',
          default: DEFAULT_OPTIONS.includeAisPlus
        },
        includeAisPlusHarbourRegions: {
          type: 'boolean',
          title: 'Include AJRM Marine harbour region list',
          description: 'Adds every AJRM Marine harbour region and bounds. This can make the snapshot very large, so leave it disabled unless debugging harbour data.',
          default: DEFAULT_OPTIONS.includeAisPlusHarbourRegions
        },
        includeAisPlusAudio: {
          type: 'boolean',
          title: 'Include AJRM Marine Audio state',
          description: 'Adds AJRM Marine Audio render, queue, stream, volume, ping, and recent event status when the audio plugin is installed.',
          default: DEFAULT_OPTIONS.includeAisPlusAudio
        },
        includeCompanion: {
          type: 'boolean',
          title: 'Include AJRM Marine Companion state',
          description: 'Adds Companion certificate setup and guest iPhone setup status when the Companion plugin is installed.',
          default: DEFAULT_OPTIONS.includeCompanion
        },
        includeAnnouncerOutput: {
          type: 'boolean',
          title: 'Include legacy announcer output',
          description: 'Adds announce-ais-messages status if that older output plugin is still installed.',
          default: DEFAULT_OPTIONS.includeAnnouncerOutput
        },
        includeInstalledApps: {
          type: 'boolean',
          title: 'Include installed app versions',
          description: 'Adds compact package names, display names, versions, and source specs for installed Signal K plugins and webapps.',
          default: DEFAULT_OPTIONS.includeInstalledApps
        },
        includeSuiteDiagnostics: {
          type: 'boolean',
          title: 'Include suite diagnostic plugin state',
          description: 'Adds current plugin telemetry for CapturePlus, Voyage Capture, AJRM Marine Pi Controller, Notifications Plus, Traffic Core, Display, Audio, Companion, Console, and GPS Integrity when present.',
          default: DEFAULT_OPTIONS.includeSuiteDiagnostics
        },
        includeDebugRaw: {
          type: 'boolean',
          title: 'Include debug/raw fields',
          description: 'Adds raw context, timestamps, and closest-approach details. Leave disabled for compact sharing.',
          default: DEFAULT_OPTIONS.includeDebugRaw
        },
        allowRemoteAccess: {
          type: 'boolean',
          title: 'Allow remote HTTP/browser access',
          description: 'Disabled by default so snapshots are only served to localhost clients.',
          default: DEFAULT_OPTIONS.allowRemoteAccess
        }
      }
    };
  };

  plugin.uiSchema = function uiSchema() {
    return {
      includeDebugRaw: {
        'ui:help': 'Raw fields may include more vessel data than needed for ChatGPT. Keep this off unless debugging.'
      },
      includeAisPlusHarbourRegions: {
        'ui:help': 'The full harbour list is large. Keep this off for normal ChatGPT snapshots.'
      },
      allowRemoteAccess: {
        'ui:help': 'Only enable this on a trusted private network.'
      }
    };
  };

  plugin.start = function start(settings) {
    currentOptions = normalizeOptions(settings);
    state = createSnapshotState();

    try {
      seedFromApp(app, state, new Date());
    } catch (err) {
      logDebug(`Initial snapshot seed failed: ${err && err.message ? err.message : err}`);
    }

    const api = {
      snapshot: buildInProcessSnapshot
    };
    app.ajrmMarineSnapshotApi = api;
    globalThis[AJRM_MARINE_SNAPSHOT_API_REGISTRY] = api;

    subscribe({
      context: 'vessels.self',
      subscribe: [
        { path: '', policy: 'instant' },
        { path: 'name', policy: 'instant' },
        { path: 'mmsi', policy: 'instant' },
        { path: 'communication.callsignVhf', policy: 'instant' },
        { path: 'communication.callsign', policy: 'instant' },
        { path: 'navigation.position', policy: 'instant' },
        { path: 'navigation.speedOverGround', policy: 'instant' },
        { path: 'navigation.courseOverGroundTrue', policy: 'instant' },
        { path: 'navigation.courseOverGroundMagnetic', policy: 'instant' },
        { path: 'navigation.headingTrue', policy: 'instant' },
        { path: 'navigation.headingMagnetic', policy: 'instant' },
        { path: 'environment.depth.*', policy: 'instant' },
        { path: 'environment.wind.*', policy: 'instant' },
        { path: 'electrical.batteries.*', policy: 'instant' },
        { path: 'notifications.*', policy: 'instant' }
      ]
    });

    subscribe({
      context: 'vessels.*',
      subscribe: [
        { path: '', policy: 'instant' },
        { path: 'name', policy: 'instant' },
        { path: 'mmsi', policy: 'instant' },
        { path: 'navigation.position', policy: 'instant' },
        { path: 'navigation.speedOverGround', policy: 'instant' },
        { path: 'navigation.courseOverGroundTrue', policy: 'instant' },
        { path: 'navigation.headingTrue', policy: 'instant' },
        { path: 'sensors.ais.fromBow', policy: 'instant' },
        { path: 'sensors.ais.fromCenter', policy: 'instant' },
        { path: 'navigation.closestApproach', policy: 'instant' },
        { path: 'navigation.closestApproach.*', policy: 'instant' },
        { path: 'navigation.closestApproach.enriched.*', policy: 'instant' },
        { path: 'communication.callsignVhf', policy: 'instant' },
        { path: 'communication.callsign', policy: 'instant' }
      ]
    });

    logDebug('Plugin started');
  };

  plugin.stop = function stop() {
    unsubscribes.forEach(unsubscribe => {
      try {
        unsubscribe();
      } catch (err) {
        logDebug(`Unsubscribe failed: ${err && err.message ? err.message : err}`);
      }
    });
    unsubscribes = [];
    if (app.ajrmMarineSnapshotApi?.snapshot === buildInProcessSnapshot) {
      delete app.ajrmMarineSnapshotApi;
    }
    if (globalThis[AJRM_MARINE_SNAPSHOT_API_REGISTRY]?.snapshot === buildInProcessSnapshot) {
      delete globalThis[AJRM_MARINE_SNAPSHOT_API_REGISTRY];
    }
    clearSnapshotState(state);
    logDebug('Plugin stopped');
  };

  plugin.statusMessage = function statusMessage() {
    return `Snapshot state: ${state.targets.size} AIS target(s), ${state.notifications.size} notification(s)`;
  };

  plugin.registerWithRouter = function registerWithRouter(router) {
    router.get('/snapshot', async (req, res) => {
      if (!canServe(req)) {
        res.status(403).json({
          error: 'Snapshot endpoint is local-only by default.',
          detail: 'Enable "Allow remote HTTP/browser access" in plugin options only on a trusted private network.'
        });
        return;
      }

      try {
        const requestOptions = optionsWithQueryOverrides(currentOptions, req.query || {});
        const snapshot = buildBaseSnapshot(requestOptions);
        if (requestOptions.includeAisPlus) {
          const ajrmMarine = await loadAjrmMarineSnapshot(req, requestOptions);
          if (ajrmMarine) snapshot.ajrmMarine = ajrmMarine;
        }
        if (requestOptions.includeAisPlusAudio) {
          const audio = await loadAjrmMarineAudioSnapshot(req);
          if (audio) snapshot.ajrmMarineAudio = audio;
        }
        if (requestOptions.includeAnnouncerOutput) {
          const announcer = await loadAnnouncerSnapshot(req);
          if (announcer) snapshot.announcer = announcer;
        }
        if (requestOptions.includeInstalledApps) {
          const installedApps = loadInstalledApps();
          if (installedApps) snapshot.installedApps = installedApps;
        }
        if (requestOptions.includeSuiteDiagnostics) {
          const diagnostics = loadSuiteDiagnostics();
          if (diagnostics) snapshot.suiteDiagnostics = diagnostics;
        }
        res.set('Cache-Control', 'no-store');
        res.status(200).json(snapshot);
      } catch (err) {
        logError(`Snapshot build failed: ${err && err.stack ? err.stack : err}`);
        res.status(500).json({ error: 'Failed to build snapshot' });
      }
    });

    router.get('/settings', (req, res) => {
      if (!canServe(req)) {
        res.status(403).json({
          error: 'Snapshot settings are local-only by default.'
        });
        return;
      }

      res.set('Cache-Control', 'no-store');
      res.status(200).json({
        pluginId: plugin.id,
        snapshotPath: `/plugins/${plugin.id}/snapshot`,
        options: currentOptions
      });
    });
  };

  plugin.getOpenApi = function getOpenApi() {
    return openApi;
  };

  function subscribe(subscription) {
    if (!app.subscriptionmanager || typeof app.subscriptionmanager.subscribe !== 'function') {
      logError('Signal K subscriptionmanager is not available');
      return;
    }

    app.subscriptionmanager.subscribe(
      subscription,
      unsubscribes,
      err => logError(`Subscription error: ${err && err.message ? err.message : err}`),
      delta => applyDelta(state, delta, new Date())
    );
  }

  function buildBaseSnapshot(requestOptions) {
    seedFromApp(app, state, new Date(), { includeTargets: false });
    return buildSnapshot(state, requestOptions, new Date());
  }

  function buildInProcessSnapshot(options = {}) {
    const requestOptions = optionsWithQueryOverrides(currentOptions, options);
    const snapshot = buildBaseSnapshot(requestOptions);
    if (requestOptions.includeSuiteDiagnostics) {
      const diagnostics = loadSuiteDiagnostics();
      if (diagnostics) snapshot.suiteDiagnostics = diagnostics;
    }
    if (requestOptions.includeInstalledApps) {
      const installedApps = loadInstalledApps();
      if (installedApps) snapshot.installedApps = installedApps;
    }
    return snapshot;
  }

  function canServe(req) {
    return currentOptions.allowRemoteAccess || isLocalRequest(req);
  }

  async function loadAjrmMarineSnapshot(req, options) {
    const [
      profiles,
      repeatIntervals,
      speechOutputSettings,
      autoProfileStatus,
      autoProfileSettings,
      harbourRegions,
      alertEvents,
      announcementLog,
      targets
    ] = await Promise.all([
      fetchLocalJson(req, '/plugins/signalk-ajrm-marine-display/getCollisionProfiles'),
      fetchLocalJson(req, '/plugins/signalk-ajrm-marine-display/repeatIntervals'),
      fetchLocalJson(req, '/plugins/signalk-ajrm-marine-display/getSpeechOutputSettings'),
      fetchLocalJson(req, '/plugins/signalk-ajrm-marine-display/autoProfileStatus'),
      fetchLocalJson(req, '/plugins/signalk-ajrm-marine-display/autoProfileSettings'),
      fetchLocalJson(req, '/plugins/signalk-ajrm-marine-display/harbourRegions'),
      fetchLocalJson(req, '/plugins/signalk-ajrm-marine-display/alertEvents'),
      fetchLocalJson(req, '/plugins/signalk-ajrm-marine-display/announcementLog?limit=12'),
      fetchLocalJson(req, '/plugins/signalk-ajrm-marine-display/getTargets')
    ]);

    if (
      !profiles &&
      !repeatIntervals &&
      !speechOutputSettings &&
      !autoProfileStatus &&
      !autoProfileSettings &&
      !harbourRegions &&
      !alertEvents &&
      !announcementLog &&
      !targets
    ) return null;

    const output = {
      plugin: 'signalk-ajrm-marine-display'
    };

    if (profiles) {
      output.profiles = summarizeCollisionProfiles(profiles);
    }

    if (repeatIntervals) {
      output.repeatIntervals = repeatIntervals;
    }

    if (speechOutputSettings) {
      output.speechOutput = compactSpeechOutputSettings(speechOutputSettings);
    }

    if (autoProfileStatus) {
      output.autoProfile = {
        enabled: autoProfileStatus.options && autoProfileStatus.options.enabled !== false,
        currentProfile: autoProfileStatus.currentProfile,
        harbourProfile: autoProfileStatus.options && autoProfileStatus.options.harbourProfile,
        outsideProfile: autoProfileStatus.options && autoProfileStatus.options.outsideProfile,
        enterDistanceMeters: autoProfileStatus.options && autoProfileStatus.options.enterDistanceMeters,
        exitDistanceMeters: autoProfileStatus.options && autoProfileStatus.options.exitDistanceMeters,
        anchorReleaseSpeed: autoProfileStatus.options && autoProfileStatus.options.anchorReleaseSpeed,
        message: autoProfileStatus.message,
        state: autoProfileStatus.state || {}
      };
    } else if (autoProfileSettings) {
      output.autoProfile = {
        enabled: autoProfileSettings.enabled !== false,
        harbourProfile: autoProfileSettings.harbourProfile,
        outsideProfile: autoProfileSettings.outsideProfile,
        enterDistanceMeters: autoProfileSettings.enterDistanceMeters,
        exitDistanceMeters: autoProfileSettings.exitDistanceMeters,
        anchorReleaseSpeed: autoProfileSettings.anchorReleaseSpeed
      };
    }

    if (harbourRegions && Array.isArray(harbourRegions.regions)) {
      output.harbours = harbourRegionsSnapshot(
        harbourRegions.regions,
        options.includeAisPlusHarbourRegions
      );
    } else if (autoProfileStatus && Array.isArray(autoProfileStatus.regions)) {
      output.harbours = harbourRegionsSnapshot(
        autoProfileStatus.regions,
        options.includeAisPlusHarbourRegions
      );
    }

    if (alertEvents && Array.isArray(alertEvents.events)) {
      output.alertEvents = alertEvents.events.map(compactAlertEvent);
    }

    if (announcementLog && Array.isArray(announcementLog.entries)) {
      output.announcementLogRecent = announcementLog.entries.slice(0, 12).map(compactAnnouncementLogEntry);
    }

    if (targets && typeof targets === 'object') {
      const targetEntries = Object.values(targets).map(compactTargetState).filter(Boolean);
      output.targetState = {
        count: targetEntries.length,
        silenced: targetEntries.filter(target => target.alarmIsMuted).length,
        targets: targetEntries
      };
    }

    return output;
  }

  async function loadAjrmMarineAudioSnapshot(req) {
    const status = await fetchLocalJson(req, '/plugins/signalk-ajrm-marine-audio/status');
    if (!status) return null;

    return compactAudioStatus(status);
  }

  async function loadAnnouncerSnapshot(req) {
    const state = await fetchLocalJson(req, '/plugins/announce-ais-messages/api/state');
    if (!state) return null;

    return {
      plugin: 'announce-ais-messages',
      status: compactAnnouncerStatus(state.status),
      active: compactAnnouncerEntries(state.active, 8),
      spokenRecent: compactAnnouncerEntries(state.spoken, 8),
      logRecent: compactAnnouncerEntries(state.log, 8)
    };
  }

  async function fetchLocalJson(req, path) {
    return new Promise(resolve => {
      const url = new URL(`${req.protocol}://${req.get('host')}${path}`);
      const transport = url.protocol === 'https:' ? https : http;
      const request = transport.request(
        url,
        {
          method: 'GET',
          rejectUnauthorized: false,
          headers: {
            accept: 'application/json',
            cookie: req.get('cookie') || ''
          }
        },
        response => {
          let body = '';
          response.setEncoding('utf8');
          response.on('data', chunk => {
            body += chunk;
          });
          response.on('end', () => {
            if (response.statusCode < 200 || response.statusCode >= 300) {
              resolve(null);
              return;
            }
            try {
              resolve(JSON.parse(body));
            } catch (err) {
              logDebug(`Snapshot JSON parse failed for ${path}: ${err && err.message ? err.message : err}`);
              resolve(null);
            }
          });
        }
      );
      request.setTimeout(2000, () => {
        request.destroy(new Error('timeout'));
      });
      request.on('error', err => {
        logDebug(`Snapshot fetch failed for ${path}: ${err && err.message ? err.message : err}`);
        resolve(null);
      });
      request.end();
    });
  }

  function summarizeCollisionProfiles(profiles) {
    const output = {
      current: profiles.current
    };

    ['anchor', 'harbor', 'coastal', 'offshore'].forEach(key => {
      if (profiles[key]) output[key] = summarizeProfile(profiles[key]);
    });

    if (profiles.vesselSize) output.vesselSize = profiles.vesselSize;
    if (profiles.alertRepeatSeconds) output.alertRepeatSeconds = profiles.alertRepeatSeconds;
    if (profiles.escalationRepeatSeconds) output.escalationRepeatSeconds = profiles.escalationRepeatSeconds;

    return output;
  }

  function summarizeProfile(profile) {
    return {
      enabled: profile.enabled,
      guard: profile.guard,
      cpa: profile.cpa,
      warning: profile.warning,
      danger: profile.danger,
      cpaSensitivity: profile.cpaSensitivity,
      tcpaLookahead: profile.tcpaLookahead,
      repeatSensitivity: profile.repeatSensitivity
    };
  }

  function compactSpeechOutputSettings(settings) {
    const output = {};
    [
      'piSpeech',
      'browserSpeech',
      'muted',
      'automuteStationary',
      'automuteStationarySpeed',
      'alertPanel',
      'alertPopupSound',
      'showAlarmPopup'
    ].forEach(key => copyIfPresent(output, settings, key));
    return output;
  }

  function compactAlertEvent(event) {
    if (!event || typeof event !== 'object') return event;
    const output = {};
    [
      'id',
      'ts',
      'targetContext',
      'mmsi',
      'displayName',
      'vesselName',
      'speechLabel',
      'state',
      'signalKState',
      'uiSeverity',
      'uiRank',
      'uiLabel',
      'category',
      'reason',
      'shouldAnnounce',
      'methods',
      'message',
      'clock',
      'clockLabel',
      'passType',
      'sizeCategory',
      'cpaNm',
      'tcpaSeconds',
      'rangeNm',
      'muted',
      'expiresAt'
    ].forEach(key => copyIfPresent(output, event, key));
    return output;
  }

  function compactAnnouncementLogEntry(entry) {
    if (!entry || typeof entry !== 'object') return entry;
    const output = {};
    [
      'ts',
      'output',
      'vesselName',
      'mmsi',
      'severity',
      'category',
      'message',
      'reason',
      'announcementId'
    ].forEach(key => copyIfPresent(output, entry, key));
    return output;
  }

  function compactTargetState(target) {
    if (!target || typeof target !== 'object') return null;
    const output = {};
    [
      'mmsi',
      'name',
      'alarmIsMuted',
      'lastAlarmState',
      'lastAlarmType',
      'lastAlarmMessage',
      'lastAlarmAt'
    ].forEach(key => copyIfPresent(output, target, key));
    return Object.keys(output).length ? output : null;
  }

  function compactAudioStatus(status) {
    const output = {
      plugin: status.plugin || 'signalk-ajrm-marine-audio'
    };
    [
      'version',
      'serverTime',
      'enabled',
      'muted',
      'localPlayback',
      'liveStream',
      'liveStreamClients',
      'streamUrl',
      'playlistUrl',
      'publicHttpStream',
      'publicHttpStreamPort',
      'publicStreamUseHttps',
      'publicStreamProtocol',
      'publicStreamUrl',
      'publicPlaylistUrl',
      'mp3BitrateKbps',
      'maxStreamLagSeconds',
      'maxStreamBufferBytes',
      'streamHealthTimeCheck',
      'streamHealthIntervalMinutes',
      'masterVolumePercent',
      'speechVolumePercent',
      'pingVolumePercent',
      'queueLength',
      'active',
      'lastAnnouncement',
      'stats',
      'droppedLaggingClients',
      'streamStats',
      'audioDirectory'
    ].forEach(key => copyIfPresent(output, status, key));

    if (Array.isArray(status.liveStreamConnections)) {
      output.liveStreamConnections = status.liveStreamConnections.map(connection => ({
        id: connection.id,
        connectedAt: connection.connectedAt,
        remote: connection.remote,
        uptimeSeconds: connection.uptimeSeconds,
        writableLength: connection.writableLength
      }));
    }

    if (Array.isArray(status.recentEvents)) {
      output.recentEvents = status.recentEvents.slice(0, 12).map(compactAudioEvent);
    }

    if (Array.isArray(status.voices)) {
      output.voices = status.voices.map(voice => ({
        id: voice.id,
        selected: voice.selected === true
      }));
    }

    return output;
  }

  function compactAudioEvent(event) {
    if (!event || typeof event !== 'object') return event;
    const output = {};
    ['ts', 'type', 'event', 'message'].forEach(key => copyIfPresent(output, event, key));
    return output;
  }

  function compactAnnouncerStatus(status) {
    if (!status || typeof status !== 'object') return undefined;
    const compact = {};
    const playback = status.playback && typeof status.playback === 'object' ? status.playback : {};
    const speech = status.speech && typeof status.speech === 'object' ? status.speech : {};

    if (Object.keys(playback).length) {
      compact.playback = {};
      copyIfPresent(compact.playback, playback, 'isSpeaking');
      copyIfPresent(compact.playback, playback, 'current');
      copyIfPresent(compact.playback, playback, 'queueLength');
    }

    if (Object.keys(speech).length) {
      compact.speech = {};
      copyIfPresent(compact.speech, speech, 'engine');
      copyIfPresent(compact.speech, speech, 'ready');
      copyIfPresent(compact.speech, speech, 'binary');
      copyIfPresent(compact.speech, speech, 'modelPath');
      copyIfPresent(compact.speech, speech, 'audioPlayer');
    }

    return Object.keys(compact).length ? compact : undefined;
  }

  function compactAnnouncerEntries(entries, limit) {
    if (!Array.isArray(entries)) return [];

    return entries.slice(0, limit).map(entry => {
      const compact = {};
      [
        'ts',
        'event',
        'vesselName',
        'severity',
        'category',
        'message',
        'currentMessage',
        'currentTs',
        'methods',
        'isCurrent'
      ].forEach(key => copyIfPresent(compact, entry, key));
      return compact;
    });
  }

  function copyIfPresent(target, source, key) {
    const value = source && source[key];
    if (typeof value === 'undefined' || value === null || value === '') return;
    if (Array.isArray(value) && value.length === 0) return;
    target[key] = value;
  }

  function summarizeHarbourRegion(region) {
    const output = {
      id: region.id,
      name: region.name
    };
    const bounds = geometryBounds(region.geometry);
    if (bounds) output.bounds = bounds;
    return output;
  }

  function harbourRegionsSnapshot(regions, includeRegions) {
    const output = {
      count: regions.length
    };
    if (includeRegions) {
      output.regions = regions.map(region => summarizeHarbourRegion(region));
    }
    return output;
  }

  function geometryBounds(geometry) {
    const points = [];
    collectGeometryPoints(geometry, points);
    if (!points.length) return null;
    const lons = points.map(point => point[0]);
    const lats = points.map(point => point[1]);
    return [
      round(Math.min(...lons), 6),
      round(Math.min(...lats), 6),
      round(Math.max(...lons), 6),
      round(Math.max(...lats), 6)
    ];
  }

  function collectGeometryPoints(value, output) {
    if (!Array.isArray(value)) {
      if (value && value.coordinates) collectGeometryPoints(value.coordinates, output);
      return;
    }
    if (
      value.length >= 2 &&
      typeof value[0] === 'number' &&
      typeof value[1] === 'number'
    ) {
      output.push(value);
      return;
    }
    value.forEach(item => collectGeometryPoints(item, output));
  }

  function round(value, precision) {
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
  }

  function loadSuiteDiagnostics() {
    if (!app || typeof app.getSelfPath !== 'function') return null;
    const paths = {
      ajrmMarineLogger: 'plugins.ajrmMarineLogger',
      ajrmMarineCapture: 'plugins.ajrmMarineCapture',
      ajrmMarinePiController: 'plugins.ajrmMarinePiController',
      ajrmMarineNotifications: 'plugins.ajrmMarineNotifications',
      trafficCore: 'plugins.ajrmMarineTraffic',
      ajrmMarineDisplay: 'plugins.ajrmMarineDisplay',
      ajrmMarineAudio: 'plugins.ajrmMarineAudio',
      ajrmMarineConsole: 'plugins.ajrmMarineConsole',
      ajrmMarineGpsIntegrity: 'plugins.ajrmMarineGpsIntegrity'
    };
    const output = {};
    Object.keys(paths).forEach(key => {
      const value = unwrapSignalKValue(app.getSelfPath(paths[key]));
      if (typeof value !== 'undefined' && value !== null) output[key] = value;
    });
    return Object.keys(output).length ? output : null;
  }

  function loadInstalledApps() {
    const configDir = signalKConfigDir();
    const names = new Set(KNOWN_SUITE_PACKAGES);
    const packageSpecs = readConfiguredPackageSpecs(configDir);
    Object.keys(packageSpecs).forEach(name => names.add(name));
    scanNodeModulesPackageNames(path.join(configDir, 'node_modules')).forEach(name => names.add(name));

    const packages = [];
    names.forEach(name => {
      const metadata = readInstalledPackageMetadata(configDir, name);
      if (!metadata) return;
      if (!isSnapshotRelevantPackage(metadata, name)) return;
      const item = {
        name,
        version: typeof metadata.version === 'string' ? metadata.version : 'unknown'
      };
      const displayName = metadata.signalk && metadata.signalk.displayName;
      if (typeof displayName === 'string' && displayName.trim()) item.displayName = displayName.trim();
      if (typeof metadata.description === 'string' && metadata.description.trim()) {
        item.description = metadata.description.trim();
      }
      if (packageSpecs[name]) item.source = packageSpecs[name];
      if (metadata.signalk && typeof metadata.signalk.appIcon === 'string') {
        item.appIcon = metadata.signalk.appIcon;
      }
      packages.push(item);
    });

    packages.sort((left, right) => left.name.localeCompare(right.name));
    if (!packages.length) return null;
    return {
      count: packages.length,
      packages
    };
  }

  function signalKConfigDir() {
    const appCandidates = [
      app && app.config && app.config.configPath,
      app && app.configPath,
      app && app.config && app.configDir,
      app && app.configDir
    ];
    const appConfig = appCandidates.find(candidate => typeof candidate === 'string' && candidate.trim());
    if (appConfig) return appConfig;
    const homeConfig = path.join(os.homedir(), '.signalk');
    if (fs.existsSync(homeConfig)) return homeConfig;
    return process.cwd();
  }

  function readConfiguredPackageSpecs(configDir) {
    const packageJson = readJsonFile(path.join(configDir, 'package.json'));
    if (!packageJson) return {};
    return {
      ...(packageJson.dependencies || {}),
      ...(packageJson.optionalDependencies || {}),
      ...(packageJson.devDependencies || {})
    };
  }

  function scanNodeModulesPackageNames(nodeModulesDir) {
    const output = [];
    const entries = readDirSafe(nodeModulesDir);
    entries.forEach(entry => {
      if (!entry.isDirectory()) return;
      if (entry.name.startsWith('@')) {
        readDirSafe(path.join(nodeModulesDir, entry.name)).forEach(scoped => {
          if (scoped.isDirectory()) output.push(`${entry.name}/${scoped.name}`);
        });
        return;
      }
      output.push(entry.name);
    });
    return output;
  }

  function readInstalledPackageMetadata(configDir, name) {
    const packagePath = path.join(configDir, 'node_modules', ...name.split('/'), 'package.json');
    return readJsonFile(packagePath);
  }

  function readJsonFile(filePath) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return null;
    }
  }

  function readDirSafe(dirPath) {
    try {
      return fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return [];
    }
  }

  function isSnapshotRelevantPackage(metadata, name) {
    if (KNOWN_SUITE_PACKAGES.has(name)) return true;
    const keywords = Array.isArray(metadata.keywords) ? metadata.keywords : [];
    return keywords.includes('signalk-node-server-plugin') || keywords.includes('signalk-webapp');
  }

  function unwrapSignalKValue(value) {
    if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'value')) {
      return value.value;
    }
    return value;
  }

  function logDebug(message) {
    if (app && typeof app.debug === 'function') {
      app.debug(`[${plugin.id}] ${message}`);
    }
  }

  function logError(message) {
    if (app && typeof app.error === 'function') {
      app.error(`[${plugin.id}] ${message}`);
    } else if (app && typeof app.debug === 'function') {
      app.debug(`[${plugin.id}] ERROR ${message}`);
    }
  }

  return plugin;
};
