'use strict';

const controls = {
  includeAllTargets: document.getElementById('includeAllTargets'),
  includeNotifications: document.getElementById('includeNotifications'),
  includeElectrical: document.getElementById('includeElectrical'),
  includeAisPlus: document.getElementById('includeAisPlus'),
  includeAisPlusHarbourRegions: document.getElementById('includeAisPlusHarbourRegions'),
  includeAisPlusAudio: document.getElementById('includeAisPlusAudio'),
  includeCompanion: document.getElementById('includeCompanion'),
  includeDebugRaw: document.getElementById('includeDebugRaw'),
  includeAnnouncerOutput: document.getElementById('includeAnnouncerOutput'),
  includeInstalledApps: document.getElementById('includeInstalledApps'),
  maxTargetAgeSeconds: document.getElementById('maxTargetAgeSeconds'),
  maxAisRangeNm: document.getElementById('maxAisRangeNm')
};

const statusEl = document.getElementById('status');
const updatedAtEl = document.getElementById('updatedAt');
const previewEl = document.getElementById('snapshotPreview');
const refreshButton = document.getElementById('refreshButton');
const copyButton = document.getElementById('copyButton');

let latestSnapshotText = '{}';

refreshButton.addEventListener('click', () => {
  loadSnapshot();
});

copyButton.addEventListener('click', async () => {
  const copied = await copyText(latestSnapshotText);
  if (copied) {
    setStatus('Copied');
  } else {
    selectSnapshotPreview();
    setStatus('Selected - press Ctrl+C');
  }
});

Object.values(controls).forEach(control => {
  control.addEventListener('change', () => {
    loadSnapshot();
  });
});

init();

async function init() {
  await loadSettings();
  await loadSnapshot();
}

async function loadSettings() {
  try {
    const response = await fetch('/plugins/signalk-ajrm-marine-snapshot/settings', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const settings = await response.json();
    const options = settings.options || {};
    controls.includeAllTargets.checked = Boolean(options.includeAllTargets);
    controls.includeNotifications.checked = options.includeNotifications !== false;
    controls.includeElectrical.checked = options.includeElectrical !== false;
    controls.includeAisPlus.checked = options.includeAisPlus !== false;
    controls.includeAisPlusHarbourRegions.checked = Boolean(options.includeAisPlusHarbourRegions);
    controls.includeAisPlusAudio.checked = options.includeAisPlusAudio !== false;
    controls.includeCompanion.checked = options.includeCompanion !== false;
    controls.includeDebugRaw.checked = Boolean(options.includeDebugRaw);
    controls.includeAnnouncerOutput.checked = Boolean(options.includeAnnouncerOutput);
    controls.includeInstalledApps.checked = options.includeInstalledApps !== false;
    controls.maxTargetAgeSeconds.value = options.maxTargetAgeSeconds || 120;
    controls.maxAisRangeNm.value = options.maxAisRangeNm || 6;
  } catch (err) {
    setStatus('Settings unavailable');
  }
}

async function loadSnapshot() {
  setBusy(true);
  try {
    const response = await fetch(`/plugins/signalk-ajrm-marine-snapshot/snapshot?${snapshotQuery()}`, { cache: 'no-store' });
    if (!response.ok) {
      const body = await safeJson(response);
      throw new Error(body.detail || body.error || `HTTP ${response.status}`);
    }

    const snapshot = await response.json();

    latestSnapshotText = JSON.stringify(snapshot, null, 2);
    previewEl.textContent = latestSnapshotText;
    updatedAtEl.textContent = snapshot.timestamp || 'Updated';
    setStatus('Ready');
  } catch (err) {
    previewEl.textContent = JSON.stringify({ error: err.message }, null, 2);
    latestSnapshotText = previewEl.textContent;
    updatedAtEl.textContent = 'Unavailable';
    setStatus('Error');
  } finally {
    setBusy(false);
  }
}

function snapshotQuery() {
  const params = new URLSearchParams();
  params.set('includeAllTargets', String(controls.includeAllTargets.checked));
  params.set('includeNotifications', String(controls.includeNotifications.checked));
  params.set('includeElectrical', String(controls.includeElectrical.checked));
  params.set('includeAisPlus', String(controls.includeAisPlus.checked));
  params.set('includeAisPlusHarbourRegions', String(controls.includeAisPlusHarbourRegions.checked));
  params.set('includeAisPlusAudio', String(controls.includeAisPlusAudio.checked));
  params.set('includeCompanion', String(controls.includeCompanion.checked));
  params.set('includeAnnouncerOutput', String(controls.includeAnnouncerOutput.checked));
  params.set('includeInstalledApps', String(controls.includeInstalledApps.checked));
  params.set('includeDebugRaw', String(controls.includeDebugRaw.checked));
  params.set('maxTargetAgeSeconds', controls.maxTargetAgeSeconds.value || '120');
  params.set('maxAisRangeNm', controls.maxAisRangeNm.value || '6');
  return params.toString();
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch (err) {
    return {};
  }
}

function setBusy(isBusy) {
  refreshButton.disabled = isBusy;
  copyButton.disabled = isBusy;
  if (isBusy) setStatus('Refreshing');
}

function setStatus(message) {
  statusEl.textContent = message;
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      // Fall through to the older copy path below.
    }
  }

  return copyTextWithTextarea(text);
}

function copyTextWithTextarea(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '-9999px';
  textarea.style.width = '1px';
  textarea.style.height = '1px';
  textarea.style.opacity = '0';

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  try {
    return document.execCommand('copy');
  } catch (err) {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

function selectSnapshotPreview() {
  const selection = window.getSelection();
  const range = document.createRange();

  range.selectNodeContents(previewEl);
  selection.removeAllRanges();
  selection.addRange(range);
}
