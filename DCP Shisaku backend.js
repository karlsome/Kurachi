const API = {
  names: '/api/check-forms/names',
  requestList: '/api/shisaku-request/list',
};

// Same Google Apps Script machine-IP lookup used by DCP interactive backend.js / DCP backend.js.
const IP_URL = 'https://script.google.com/macros/s/AKfycbyC6-KiT3xwGiahhzhB-L-OOL8ufG0WqnT5mjEelGBKGnbiqVAS6qjT78FlzBUHqTn3Gg/exec';

const SELECTED_NAME_KEY = 'dcpShisaku_selectedName';

const state = {
  allNames: [],
  selectedName: '',
  records: [],
  activeRecord: null,
  frontPhotoBase64: '',
  backPhotoBase64: '',
};

const dom = {
  loadingScreen: document.getElementById('loading-screen'),
  nameScreen: document.getElementById('name-screen'),
  queueView: document.getElementById('queue-view'),
  workerNameInput: document.getElementById('worker-name-input'),
  nameDropdown: document.getElementById('name-dropdown'),
  btnBegin: document.getElementById('btn-begin'),
  nameError: document.getElementById('name-error'),
  queueWorkerName: document.getElementById('queue-worker-name'),
  queueRows: document.getElementById('queue-rows'),
  queueEmpty: document.getElementById('queue-empty'),
  detailModal: document.getElementById('detail-modal'),
  detailRows: document.getElementById('detail-rows'),
  detailPdfLink: document.getElementById('detail-pdf-link'),
  pdfPreviewModal: document.getElementById('pdf-preview-modal'),
  pdfPreviewImg: document.getElementById('pdf-preview-img'),
  pdfPreviewCloseBtn: document.getElementById('pdf-preview-close-btn'),
  detailCloseBtn: document.getElementById('detail-close-btn'),
  produceBtn: document.getElementById('produce-btn'),
  produceModal: document.getElementById('produce-modal'),
  produceTitle: document.getElementById('produce-card-title'),
  produceSubtitle: document.getElementById('produce-card-subtitle'),
  produceProductNo: document.getElementById('produce-productNo'),
  produceModel: document.getElementById('produce-model'),
  produceMachineReadonly: document.getElementById('produce-machine-readonly'),
  produceMaterialReadonly: document.getElementById('produce-material-readonly'),
  produceColorReadonly: document.getElementById('produce-color-readonly'),
  produceQuantityRequestedReadonly: document.getElementById('produce-quantity-requested-readonly'),
  producePrintBtn: document.getElementById('produce-print-btn'),
  produceDate: document.getElementById('produce-date'),
  produceQuantityProduced: document.getElementById('produce-quantity-produced'),
  producePartsPerCycle: document.getElementById('produce-parts-per-cycle'),
  produceStartTime: document.getElementById('produce-start-time'),
  produceEndTime: document.getElementById('produce-end-time'),
  produceTimePerCycle: document.getElementById('produce-time-per-cycle'),
  produceFrontStatus: document.getElementById('produce-front-status'),
  produceFrontPreview: document.getElementById('produce-front-preview'),
  produceFrontBtn: document.getElementById('produce-front-btn'),
  produceFrontInput: document.getElementById('produce-front-input'),
  produceBackStatus: document.getElementById('produce-back-status'),
  produceBackPreview: document.getElementById('produce-back-preview'),
  produceBackBtn: document.getElementById('produce-back-btn'),
  produceBackInput: document.getElementById('produce-back-input'),
  produceSendBtn: document.getElementById('produce-send-btn'),
  produceStatusMsg: document.getElementById('produce-status-msg'),
  produceCloseBtn: document.getElementById('produce-close-btn'),
  produceSubmitBtn: document.getElementById('produce-submit-btn'),
};

async function fetchJson(url) {
  const response = await fetch(url);
  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json() : await response.text();
  if (!response.ok) {
    throw new Error(isJson ? (payload.error || payload.details || 'Request failed.') : (payload || 'Request failed.'));
  }
  return payload;
}

function normalizeAndSortNames(names) {
  if (!Array.isArray(names)) return [];
  const unique = new Map();
  names.forEach((name) => {
    const clean = String(name || '').trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (!unique.has(key)) unique.set(key, clean);
  });
  return [...unique.values()].sort((a, b) => a.localeCompare(b, 'ja'));
}

function resolveNameOptions(payload) {
  if (!payload) return [];
  if (Array.isArray(payload.workerDBNames) || Array.isArray(payload.userNames)) {
    const workerNames = normalizeAndSortNames(payload.workerDBNames || []);
    const userNames = normalizeAndSortNames(payload.userNames || []);
    const seen = new Set(workerNames.map((n) => n.toLowerCase()));
    const userOnly = userNames.filter((n) => !seen.has(n.toLowerCase()));
    return [...workerNames, ...userOnly];
  }
  return Array.isArray(payload.names) ? normalizeAndSortNames(payload.names) : [];
}

function getSelectedNameKey() {
  return SELECTED_NAME_KEY;
}

function restoreSelectedName() {
  try {
    return String(window.localStorage.getItem(getSelectedNameKey()) || '').trim();
  } catch (e) {
    return '';
  }
}

function persistSelectedName(name) {
  try {
    window.localStorage.setItem(getSelectedNameKey(), String(name || '').trim());
  } catch (e) {
    console.warn('Failed to persist selected name:', e);
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Name autocomplete ────────────────────────────────────────────

function selectNameOption(name) {
  state.selectedName = name;
  persistSelectedName(name);
  dom.workerNameInput.value = name;
  dom.btnBegin.disabled = false;
  closeNameDropdown();
}

function appendNameOption(name) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'name-option';
  btn.textContent = name;
  btn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    selectNameOption(name);
  });
  dom.nameDropdown.appendChild(btn);
}

function renderNameDropdown(query = '') {
  if (!state.allNames.length) {
    dom.nameDropdown.classList.add('hidden');
    return;
  }

  const q = String(query || '').trim().toLowerCase();
  dom.nameDropdown.innerHTML = '';

  const filtered = q
    ? state.allNames.filter((name) => name.toLowerCase().includes(q))
    : state.allNames;

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'name-dropdown-empty';
    empty.textContent = 'No names match your search.';
    dom.nameDropdown.appendChild(empty);
  } else {
    filtered.forEach((name) => appendNameOption(name));
  }

  dom.nameDropdown.classList.remove('hidden');
}

function closeNameDropdown() {
  dom.nameDropdown.classList.add('hidden');
}

function showNameError(msg) {
  dom.nameError.textContent = msg;
  dom.nameError.classList.remove('hidden');
}

// ── Queue ─────────────────────────────────────────────────────────

function getRecordId(record) {
  return record?._id?.$oid || record?._id || '';
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

function renderQueue() {
  const ordered = [...state.records].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
  );

  dom.queueRows.innerHTML = '';

  if (ordered.length === 0) {
    dom.queueEmpty.classList.remove('hidden');
    return;
  }
  dom.queueEmpty.classList.add('hidden');

  ordered.forEach((record) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(record.name || '—')}</td>
      <td>${escapeHtml(record.material || '—')}</td>
      <td>${escapeHtml(record.quantity ?? '—')}</td>
      <td>${escapeHtml(formatDate(record.deadline))}</td>`;
    tr.addEventListener('click', () => openDetailModal(record));
    dom.queueRows.appendChild(tr);
  });
}

async function loadQueue() {
  try {
    const records = await fetchJson(API.requestList);
    state.records = Array.isArray(records) ? records : [];
  } catch (err) {
    console.error('Failed to load prototype request queue:', err);
    state.records = [];
  }
  renderQueue();
}

// ── Detail modal ─────────────────────────────────────────────────

const DETAIL_FIELDS = [
  ['name', 'Request'],
  ['pce', 'PCE'],
  ['okuriPitch', 'Okuri Pitch'],
  ['color', 'Color'],
  ['material', 'Material'],
  ['boxType', 'Box Type'],
  ['quantity', 'Quantity'],
];

function openDetailModal(record) {
  state.activeRecord = record;
  dom.detailRows.innerHTML = '';

  DETAIL_FIELDS.forEach(([key, label]) => {
    const row = document.createElement('div');
    row.className = 'detail-row';
    row.innerHTML = `
      <span class="detail-row-label">${escapeHtml(label)}</span>
      <span class="detail-row-value">${escapeHtml(record[key] ?? '—')}</span>`;
    dom.detailRows.appendChild(row);
  });

  const createdRow = document.createElement('div');
  createdRow.className = 'detail-row';
  createdRow.innerHTML = `
    <span class="detail-row-label">Registered</span>
    <span class="detail-row-value">${escapeHtml(formatDate(record.createdAt))}</span>`;
  dom.detailRows.appendChild(createdRow);

  if (record.pdfLink) {
    dom.detailPdfLink.classList.remove('hidden');
  } else {
    dom.detailPdfLink.classList.add('hidden');
  }

  dom.detailModal.classList.remove('hidden');
  dom.detailModal.style.display = 'flex';
}

function closeDetailModal() {
  dom.detailModal.classList.add('hidden');
  dom.detailModal.style.display = 'none';
}

function openPdfPreviewModal(pdfLink) {
  if (!pdfLink) return;
  dom.pdfPreviewImg.src = pdfLink;
  dom.pdfPreviewModal.classList.remove('hidden');
  dom.pdfPreviewModal.style.display = 'flex';
}

function closePdfPreviewModal() {
  dom.pdfPreviewModal.classList.add('hidden');
  dom.pdfPreviewModal.style.display = 'none';
  dom.pdfPreviewImg.src = '';
}

// ── Produce modal ─────────────────────────────────────────────────

function getMachineFromUrl() {
  return new URLSearchParams(window.location.search).get('machine') || '';
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function todayDateValue() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function nowTimeValue() {
  const now = new Date();
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}

function resetPhotoCapture() {
  state.frontPhotoBase64 = '';
  state.backPhotoBase64 = '';
  dom.produceFrontPreview.src = '';
  dom.produceFrontPreview.classList.remove('has-image');
  dom.produceFrontStatus.textContent = 'Front Image';
  dom.produceFrontStatus.classList.remove('captured');
  dom.produceBackPreview.src = '';
  dom.produceBackPreview.classList.remove('has-image');
  dom.produceBackStatus.textContent = 'Back Image';
  dom.produceBackStatus.classList.remove('captured');
}

function updateProduceSendGate() {
  dom.produceSendBtn.disabled = !getMachineFromUrl();
}

function showProduceStatus(message, tone) {
  dom.produceStatusMsg.textContent = message;
  dom.produceStatusMsg.className = `produce-status-msg show ${tone}`;
}

function clearProduceStatus() {
  dom.produceStatusMsg.textContent = '';
  dom.produceStatusMsg.className = 'produce-status-msg';
}

function openProduceModal(record) {
  state.activeRecord = record;
  clearProduceStatus();
  resetPhotoCapture();

  dom.produceTitle.textContent = record.pce || '—';
  dom.produceSubtitle.textContent = record.name || '—';
  dom.produceProductNo.value = record.name || '';
  dom.produceModel.value = '';
  dom.produceMachineReadonly.textContent = getMachineFromUrl() || '—';
  dom.produceMaterialReadonly.textContent = record.material || '—';
  dom.produceColorReadonly.textContent = record.color || '—';
  dom.produceQuantityRequestedReadonly.textContent = record.quantity ?? '—';

  dom.produceDate.value = todayDateValue();
  dom.produceQuantityProduced.value = '';
  dom.producePartsPerCycle.value = '';
  dom.produceStartTime.value = nowTimeValue();
  dom.produceEndTime.value = nowTimeValue();
  dom.produceTimePerCycle.value = '';

  updateProduceSendGate();

  dom.produceModal.classList.remove('hidden');
  dom.produceModal.style.display = 'flex';
}

function closeProduceModal() {
  dom.produceModal.classList.add('hidden');
  dom.produceModal.style.display = 'none';
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

async function handlePhotoCapture(file, slot) {
  if (!file) return;
  const base64 = await fileToBase64(file);

  if (slot === 'front') {
    state.frontPhotoBase64 = base64;
    dom.produceFrontPreview.src = base64;
    dom.produceFrontPreview.classList.add('has-image');
    dom.produceFrontStatus.textContent = 'Captured';
    dom.produceFrontStatus.classList.add('captured');
  } else {
    state.backPhotoBase64 = base64;
    dom.produceBackPreview.src = base64;
    dom.produceBackPreview.classList.add('has-image');
    dom.produceBackStatus.textContent = 'Captured';
    dom.produceBackStatus.classList.add('captured');
  }
}

// ── Print label ───────────────────────────────────────────────────
// Mirrors the default flow of printLabel() in DCP backend.js, using the same
// Brother WebPrint template ("sample6.lbx") with shisaku fields best-mapped
// onto the production label's placeholders. 収容数 is intentionally left blank.

function printProduceLabel() {
  const record = state.activeRecord;
  if (!record) return;

  const 品番 = dom.produceProductNo.value.trim();
  const 車型 = dom.produceModel.value.trim();
  const 収容数 = '';
  const 背番号 = record.pce || '';
  const R_L = '';
  const 材料 = record.material || '';
  const 色 = record.color || '';
  const 設備名 = getMachineFromUrl();
  const Date2 = dom.produceDate.value || todayDateValue();
  const 品番収容数 = `${品番},${収容数}`;

  const now = new Date();
  const currentTime = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const WorkDate = `${Date2} - ${currentTime}`;

  const filename = 'sample6.lbx';
  const size = 'RollW62';
  const copies = 1;
  const url =
    `brotherwebprint://print?filename=${encodeURIComponent(filename)}&size=${encodeURIComponent(size)}&copies=${encodeURIComponent(copies)}` +
    `&text_品番=${encodeURIComponent(品番)}` +
    `&text_車型=${encodeURIComponent(車型)}` +
    `&text_収容数=${encodeURIComponent(収容数)}` +
    `&text_背番号=${encodeURIComponent(背番号)}` +
    `&text_RL=${encodeURIComponent(R_L)}` +
    `&text_材料=${encodeURIComponent(材料)}` +
    `&text_色=${encodeURIComponent(色)}` +
    `&text_DateT=${encodeURIComponent(WorkDate)}` +
    `&text_setsubi=${encodeURIComponent(設備名)}` +
    `&barcode_barcode=${encodeURIComponent(品番収容数)}`;

  window.location.href = url;
}

// ── Send to machine ──────────────────────────────────────────────
// Mirrors sendtoNC() in DCP interactive backend.js: resolve the machine's IP
// via the same Google Apps Script lookup, then GET the cutter with mode: 'no-cors'.

async function resolveMachineIP(machineName) {
  const response = await fetch(`${IP_URL}?filter=${encodeURIComponent(machineName)}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch IP for ${machineName}`);
  }
  const ip = (await response.text()).replace(/"/g, '').trim();
  if (!ip) {
    throw new Error(`No IP configured for ${machineName}`);
  }
  return ip;
}

async function sendProduceToMachine() {
  const record = state.activeRecord;
  if (!record || !record.pce) return;

  const machineName = getMachineFromUrl();
  if (!machineName) {
    showProduceStatus('Select a machine first.', 'error');
    return;
  }

  dom.produceSendBtn.disabled = true;
  showProduceStatus(`Resolving IP for ${machineName}…`, 'ok');

  try {
    const ip = await resolveMachineIP(machineName);
    const url = `http://${ip}:5000/request?filename=${encodeURIComponent(record.pce)}`;

    try {
      await fetch(url, { method: 'GET', mode: 'no-cors' });
    } catch (fetchErr) {
      const newTab = window.open(url, '_blank');
      setTimeout(() => { if (newTab) newTab.close(); }, 5000);
    }

    showProduceStatus(`Sent ${record.pce} to ${machineName} (${ip}).`, 'ok');
  } catch (err) {
    showProduceStatus(err.message || 'Failed to send to machine.', 'error');
  } finally {
    updateProduceSendGate();
  }
}

// ── Submit report ─────────────────────────────────────────────────

async function submitProduceReport() {
  const record = state.activeRecord;
  if (!record) return;

  dom.produceSubmitBtn.disabled = true;
  showProduceStatus('Submitting report…', 'ok');

  try {
    const payload = {
      requestId: getRecordId(record),
      requestName: record.name || '',
      pce: record.pce || '',
      material: record.material || '',
      color: record.color || '',
      boxType: record.boxType || '',
      quantityRequested: record.quantity ?? null,
      workerName: state.selectedName,
      productNo: dom.produceProductNo.value.trim(),
      model: dom.produceModel.value.trim(),
      machine: getMachineFromUrl(),
      processingDate: dom.produceDate.value,
      quantityProduced: dom.produceQuantityProduced.value,
      partsPerCycle: dom.producePartsPerCycle.value,
      startTime: dom.produceStartTime.value,
      endTime: dom.produceEndTime.value,
      timePerCycle: dom.produceTimePerCycle.value,
      frontPhotoBase64: state.frontPhotoBase64 || null,
      backPhotoBase64: state.backPhotoBase64 || null,
    };

    const response = await fetch('/api/shisaku-production/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Submission failed.');

    showProduceStatus('Report submitted successfully.', 'ok');
    setTimeout(() => closeProduceModal(), 1500);
  } catch (err) {
    showProduceStatus(err.message || 'Failed to submit report.', 'error');
    dom.produceSubmitBtn.disabled = false;
  }
}

// ── Screen transitions ───────────────────────────────────────────

function showNameScreen() {
  dom.loadingScreen.classList.add('hidden');
  dom.queueView.classList.add('hidden');
  dom.nameScreen.classList.remove('hidden');
}

function showQueueScreen() {
  dom.loadingScreen.classList.add('hidden');
  dom.nameScreen.classList.add('hidden');
  dom.queueView.classList.remove('hidden');
  dom.queueWorkerName.textContent = state.selectedName;
  loadQueue();
}

function beginQueue() {
  closeNameDropdown();
  const typed = dom.workerNameInput.value.trim();
  state.selectedName = state.selectedName || typed;
  if (!state.selectedName) return;
  persistSelectedName(state.selectedName);
  showQueueScreen();
}

// ── Init ──────────────────────────────────────────────────────────

async function init() {
  try {
    const namesPayload = await fetchJson(API.names);
    state.allNames = resolveNameOptions(namesPayload);
  } catch (err) {
    console.error('Failed to load worker names:', err);
  }

  const savedName = restoreSelectedName();
  if (savedName) {
    state.selectedName = savedName;
    dom.workerNameInput.value = savedName;
    dom.btnBegin.disabled = false;
  }

  showNameScreen();

  dom.workerNameInput.addEventListener('focus', () => renderNameDropdown(dom.workerNameInput.value));
  dom.workerNameInput.addEventListener('input', () => {
    state.selectedName = '';
    dom.btnBegin.disabled = !dom.workerNameInput.value.trim();
    renderNameDropdown(dom.workerNameInput.value);
  });
  dom.workerNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeNameDropdown();
  });
  document.addEventListener('mousedown', (e) => {
    if (!dom.nameDropdown.contains(e.target) && e.target !== dom.workerNameInput) {
      closeNameDropdown();
    }
  });

  dom.btnBegin.addEventListener('click', beginQueue);
  dom.detailCloseBtn.addEventListener('click', closeDetailModal);
  dom.detailModal.addEventListener('click', (e) => {
    if (e.target === dom.detailModal) closeDetailModal();
  });
  dom.detailPdfLink.addEventListener('click', () => openPdfPreviewModal(state.activeRecord?.pdfLink));
  dom.pdfPreviewCloseBtn.addEventListener('click', closePdfPreviewModal);
  dom.pdfPreviewModal.addEventListener('click', (e) => {
    if (e.target === dom.pdfPreviewModal) closePdfPreviewModal();
  });

  dom.produceBtn.addEventListener('click', () => {
    if (!state.activeRecord) return;
    closeDetailModal();
    openProduceModal(state.activeRecord);
  });
  dom.produceCloseBtn.addEventListener('click', closeProduceModal);
  dom.produceSubmitBtn.addEventListener('click', submitProduceReport);
  dom.produceModal.addEventListener('click', (e) => {
    if (e.target === dom.produceModal) closeProduceModal();
  });
  dom.producePrintBtn.addEventListener('click', printProduceLabel);
  dom.produceSendBtn.addEventListener('click', sendProduceToMachine);

  dom.produceFrontBtn.addEventListener('click', () => dom.produceFrontInput.click());
  dom.produceFrontInput.addEventListener('change', (e) => {
    handlePhotoCapture(e.target.files?.[0], 'front');
    e.target.value = '';
  });
  dom.produceBackBtn.addEventListener('click', () => dom.produceBackInput.click());
  dom.produceBackInput.addEventListener('change', (e) => {
    handlePhotoCapture(e.target.files?.[0], 'back');
    e.target.value = '';
  });
}

init();
