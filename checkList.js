//const serverURL = "https://kurachi.onrender.com";
const serverURL = "http://localhost:3000";
//const serverURL = "http://192.0.0.2:3000";

'use strict';

const API_BASE_URL = String(serverURL || '').replace(/\/+$/, '');

const CHECKLIST_API = {
  templates: `${API_BASE_URL}/api/check-forms/templates`,
  workers: `${API_BASE_URL}/api/check-forms/workers`,
  submit: `${API_BASE_URL}/api/check-forms/submit`,
};

const CHECKLIST_DRAFT_PREFIX = 'checkListDraft::';
const CHECKLIST_RECENT_WORKERS_PREFIX = 'checkListRecentWorkers::';
const MAX_RECENT_WORKERS = 4;
const CHECKLIST_DB_NAME = 'kurachi-checklist-assets';
const CHECKLIST_DB_VERSION = 1;
const CHECKLIST_ASSET_STORE = 'assets';
const SCHEDULE_LABELS = {
  daily: 'Daily Check',
  weekly: 'Weekly Check',
  monthly: 'Monthly Check',
  unscheduled: 'Checklist',
};
const SCHEDULE_ORDER = {
  daily: 0,
  weekly: 1,
  monthly: 2,
  unscheduled: 99,
};
const FIELD_TIME_FORMATTER = new Intl.DateTimeFormat('ja-JP', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});
const PHOTO_EDITOR_BRUSH_COLOR = '#d3312a';
const PHOTO_EDITOR_BRUSH_SIZE = 18;
const PHOTO_EDITOR_OUTPUT_QUALITY = 0.84;

const appState = {
  factory: '',
  machine: '',
  templates: [],
  workers: [],
  selectedWorkerName: '',
  recentWorkers: [],
  loading: true,
  submitting: false,
  validationErrors: new Set(),
  bannerTimer: null,
  assetCache: new Map(),
  memoryAssets: new Map(),
  activeWorkerModal: {
    open: false,
    search: '',
  },
  activeTicket: null,
  activeKeypad: null,
  photoEditor: null,
  imagePreview: null,
};

const dom = {};
let indexedDbPromise = null;

document.addEventListener('DOMContentLoaded', initializeCheckListApp);

async function initializeCheckListApp() {
  cacheDom();
  bindStaticEvents();

  appState.factory = getSelectedFactoryFromUrl();
  appState.machine = getSelectedMachineFromUrl();
  dom.factoryValue.textContent = appState.factory || '-';
  renderSummarySection();

  if (!appState.factory) {
    appState.loading = false;
    renderEmptyState('Factory is missing. Open the page with a query like ?selected=第二工場&machine=OZNC02.');
    dom.statusValue.textContent = 'Factory required';
    renderApp();
    return;
  }

  if (!appState.machine) {
    appState.loading = false;
    renderEmptyState('Machine is missing. Open the page with a query like ?selected=第二工場&machine=OZNC02.');
    dom.statusValue.textContent = 'Machine required';
    renderApp();
    return;
  }

  restoreRecentWorkers();

  try {
    const [templateData, workerData] = await Promise.all([
      fetchJson(`${CHECKLIST_API.templates}?factory=${encodeURIComponent(appState.factory)}&machine=${encodeURIComponent(appState.machine)}`),
      fetchJson(`${CHECKLIST_API.workers}?factory=${encodeURIComponent(appState.factory)}`),
    ]);

    appState.workers = Array.isArray(workerData.workers) ? workerData.workers : [];
  appState.recentWorkers = getVisibleRecentWorkers(appState.recentWorkers);
  persistRecentWorkers();
    appState.templates = buildTemplateState(Array.isArray(templateData.templates) ? templateData.templates : []);
    await restoreDraftState();
    syncTemplateWorkersFromSelection(false);
    appState.loading = false;

    if (appState.templates.length === 0) {
      renderEmptyState(`No active checklist templates were found for ${appState.factory} / ${appState.machine}.`);
      dom.statusValue.textContent = 'No templates';
    } else {
      hideEmptyState();
      dom.statusValue.textContent = 'Ready';
    }
  } catch (error) {
    appState.loading = false;
    renderEmptyState(error.message || 'Failed to load checklist data.');
    dom.statusValue.textContent = 'Load failed';
    showBanner(error.message || 'Failed to load checklist data.', 'danger');
  }

  renderApp();
}

function cacheDom() {
  dom.appSubtitle = document.getElementById('appSubtitle');
  dom.factoryValue = document.getElementById('factoryValue');
  dom.progressValue = document.getElementById('progressValue');
  dom.statusValue = document.getElementById('statusValue');
  dom.summaryChips = document.getElementById('summaryChips');
  dom.summaryStats = document.getElementById('summaryStats');
  dom.banner = document.getElementById('banner');
  dom.loadingState = document.getElementById('loadingState');
  dom.loadingMessage = document.getElementById('loadingMessage');
  dom.emptyState = document.getElementById('emptyState');
  dom.templatesContainer = document.getElementById('templatesContainer');
  dom.actionFooter = document.getElementById('actionFooter');
  dom.resetButton = document.getElementById('resetButton');
  dom.submitButton = document.getElementById('submitButton');
  dom.workerModal = document.getElementById('workerModal');
  dom.ticketModal = document.getElementById('ticketModal');
  dom.keypadModal = document.getElementById('keypadModal');
  dom.photoEditorModal = document.getElementById('photoEditorModal');
  dom.imagePreviewModal = document.getElementById('imagePreviewModal');
  dom.submitOverlay = document.getElementById('submitOverlay');
}

function bindStaticEvents() {
  dom.templatesContainer.addEventListener('click', handleTemplateAreaClick);
  dom.templatesContainer.addEventListener('input', handleTemplateAreaInput);
  dom.templatesContainer.addEventListener('change', handleTemplateAreaChange);
  dom.resetButton.addEventListener('click', handleResetRequest);
  dom.submitButton.addEventListener('click', handleSubmitRequest);
  dom.workerModal.addEventListener('click', handleWorkerModalClick);
  dom.workerModal.addEventListener('input', handleWorkerModalInput);
  dom.ticketModal.addEventListener('click', handleTicketModalClick);
  dom.ticketModal.addEventListener('input', handleTicketModalInput);
  dom.keypadModal.addEventListener('click', handleKeypadModalClick);
  dom.photoEditorModal.addEventListener('click', handlePhotoEditorClick);
  dom.photoEditorModal.addEventListener('pointerdown', handlePhotoEditorPointerDown);
  dom.photoEditorModal.addEventListener('pointermove', handlePhotoEditorPointerMove);
  dom.photoEditorModal.addEventListener('pointerup', finishPhotoEditorStroke);
  dom.photoEditorModal.addEventListener('pointercancel', finishPhotoEditorStroke);
  dom.imagePreviewModal.addEventListener('click', handleImagePreviewClick);
  window.addEventListener('scroll', syncHeaderCondensedState, { passive: true });
  window.addEventListener('resize', syncPhotoEditorLayout, { passive: true });
  syncHeaderCondensedState();

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (appState.photoEditor) {
      closePhotoEditor('');
      return;
    }
    if (appState.imagePreview) {
      closeImagePreview();
      return;
    }
    if (appState.activeKeypad) {
      closeKeypadModal();
      return;
    }
    if (appState.activeTicket) {
      closeTicketModal(true);
      return;
    }
    if (appState.activeWorkerModal.open) {
      closeWorkerModal();
    }
  });
}

function getSelectedFactoryFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return normalizeText(params.get('selected') || params.get('factory') || '');
}

function getSelectedMachineFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return normalizeText(params.get('machine') || '');
}

function buildTemplateState(templates = []) {
  return templates
    .map((template) => ({
      templateId: normalizeText(template._id),
      templateName: normalizeText(template.name) || 'Untitled checklist',
      description: normalizeText(template.description),
      schedule: normalizeSchedule(template.schedule),
      startDate: normalizeText(template.startDate),
      equipmentIds: normalizeStringArray(template.equipmentIds),
      equipmentNames: normalizeStringArray(template.equipmentNames),
      equipmentDetails: Array.isArray(template.equipmentDetails)
        ? template.equipmentDetails.map((equipment) => ({
            _id: normalizeText(equipment._id),
            name: normalizeText(equipment.name),
            imageURL: normalizeText(equipment.imageURL),
            factory: normalizeText(equipment['工場']),
          }))
        : [],
      workerName: '',
      fields: Array.isArray(template.fields)
        ? template.fields.map((field, index) => createFieldState(template._id, field, index))
        : [],
    }))
    .sort((left, right) => {
      const scheduleDiff = (SCHEDULE_ORDER[left.schedule] ?? 99) - (SCHEDULE_ORDER[right.schedule] ?? 99);
      if (scheduleDiff !== 0) return scheduleDiff;
      return left.templateName.localeCompare(right.templateName, 'ja');
    });
}

function createFieldState(templateId, field, index) {
  const fieldId = normalizeText(field.id) || `field-${index + 1}`;

  return {
    fieldId,
    label: normalizeText(field.label) || `Field ${index + 1}`,
    description: normalizeText(field.description),
    imageURL: normalizeText(field.imageURL),
    type: normalizeText(field.type).toLowerCase() || 'text',
    required: Boolean(field.required),
    locked: Boolean(field.locked),
    photoRequired: Boolean(field.photoRequired),
    options: normalizeStringArray(field.options),
    min: normalizeNumber(field.min),
    max: normalizeNumber(field.max),
    unit: normalizeText(field.unit),
    answerValue: '',
    lastAnsweredAt: '',
    fieldPhotoAssetId: '',
    ticket: {
      ticketKey: createTicketKey(templateId, fieldId),
      saved: false,
      reason: '',
      imageAssetIds: [],
      pendingTouched: false,
      pendingReason: '',
      pendingImageAssetIds: [],
    },
  };
}

function normalizeText(value = '') {
  return String(value ?? '').trim();
}

function normalizeIsoTimestamp(value = '') {
  const normalized = normalizeText(value);
  if (!normalized) return '';

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

function normalizeSchedule(value = '') {
  const schedule = normalizeText(value).toLowerCase();
  return schedule in SCHEDULE_LABELS ? schedule : 'unscheduled';
}

function normalizeStringArray(values = []) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => normalizeText(value)).filter(Boolean);
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeDomSegment(value) {
  const safe = normalizeText(value).replace(/[^a-zA-Z0-9_-]+/g, '_');
  return safe || 'item';
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createTicketKey(templateId, fieldId) {
  return `${sanitizeDomSegment(templateId)}-${sanitizeDomSegment(fieldId)}-${Date.now().toString(36)}`;
}

function getDraftStorageKey() {
  const machineKey = appState.machine || 'all-machines';
  return `${CHECKLIST_DRAFT_PREFIX}${appState.factory}::${machineKey}`;
}

function getRecentWorkersStorageKey() {
  return `${CHECKLIST_RECENT_WORKERS_PREFIX}${appState.factory || 'unknown-factory'}`;
}

function restoreRecentWorkers() {
  appState.recentWorkers = [];

  try {
    const raw = window.localStorage.getItem(getRecentWorkersStorageKey());
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;

    appState.recentWorkers = normalizeStringArray(parsed)
      .filter((name, index, list) => list.indexOf(name) === index)
      .slice(0, MAX_RECENT_WORKERS);
  } catch (error) {
    console.warn('Failed to restore recent workers:', error);
  }
}

function persistRecentWorkers() {
  try {
    window.localStorage.setItem(getRecentWorkersStorageKey(), JSON.stringify(appState.recentWorkers.slice(0, MAX_RECENT_WORKERS)));
  } catch (error) {
    console.warn('Failed to persist recent workers:', error);
  }
}

function getVisibleRecentWorkers(names) {
  const normalizedNames = normalizeStringArray(names).slice(0, MAX_RECENT_WORKERS);
  if (appState.workers.length === 0) return normalizedNames;

  const availableNames = new Set(appState.workers.map((worker) => normalizeText(worker.name)));
  return normalizedNames.filter((name) => availableNames.has(name));
}

async function restoreDraftState() {
  const raw = window.localStorage.getItem(getDraftStorageKey());
  if (!raw) return;

  try {
    const draft = JSON.parse(raw);
    appState.selectedWorkerName = normalizeText(draft.selectedWorkerName);

    if (!Array.isArray(draft.templates)) return;

    draft.templates.forEach((templateDraft) => {
      const template = appState.templates.find((item) => item.templateId === normalizeText(templateDraft.templateId));
      if (!template) return;
      template.workerName = normalizeText(templateDraft.workerName);

      if (!Array.isArray(templateDraft.fields)) return;

      templateDraft.fields.forEach((fieldDraft) => {
        const field = template.fields.find((item) => item.fieldId === normalizeText(fieldDraft.fieldId));
        if (!field) return;

        field.answerValue = field.type === 'number'
          ? normalizeText(fieldDraft.answerValue)
          : String(fieldDraft.answerValue ?? '');
        field.lastAnsweredAt = normalizeIsoTimestamp(fieldDraft.lastAnsweredAt);
        field.fieldPhotoAssetId = normalizeText(fieldDraft.fieldPhotoAssetId);
        field.ticket.saved = Boolean(fieldDraft.ticket?.saved);
        field.ticket.reason = normalizeText(fieldDraft.ticket?.reason);
        field.ticket.imageAssetIds = normalizeStringArray(fieldDraft.ticket?.imageAssetIds);
        field.ticket.pendingTouched = Boolean(fieldDraft.ticket?.pendingTouched);
        field.ticket.pendingReason = normalizeText(fieldDraft.ticket?.pendingReason);
        field.ticket.pendingImageAssetIds = normalizeStringArray(fieldDraft.ticket?.pendingImageAssetIds);
      });
    });
  } catch (error) {
    console.warn('Failed to restore checklist draft:', error);
  }
}

function persistDraftState() {
  try {
    const draft = {
      version: 1,
      factory: appState.factory,
      machine: appState.machine,
      selectedWorkerName: appState.selectedWorkerName,
      templates: appState.templates.map((template) => ({
        templateId: template.templateId,
        workerName: template.workerName,
        fields: template.fields.map((field) => ({
          fieldId: field.fieldId,
          answerValue: field.answerValue,
          lastAnsweredAt: field.lastAnsweredAt,
          fieldPhotoAssetId: field.fieldPhotoAssetId,
          ticket: {
            saved: field.ticket.saved,
            reason: field.ticket.reason,
            imageAssetIds: field.ticket.imageAssetIds,
            pendingTouched: field.ticket.pendingTouched,
            pendingReason: field.ticket.pendingReason,
            pendingImageAssetIds: field.ticket.pendingImageAssetIds,
          },
        })),
      })),
      updatedAt: new Date().toISOString(),
    };

    window.localStorage.setItem(getDraftStorageKey(), JSON.stringify(draft));
  } catch (error) {
    console.warn('Failed to persist checklist draft:', error);
  }
}

function removeDraftState() {
  window.localStorage.removeItem(getDraftStorageKey());
}

function renderApp() {
  renderLoadingState();
  renderSummarySection();
  renderTemplates();
  renderFooter();
  renderWorkerModal();
  renderTicketModal();
  renderKeypadModal();
  renderPhotoEditorModal();
  renderImagePreviewModal();
  renderSubmitOverlay();
}

function renderLoadingState() {
  dom.loadingState.classList.toggle('hidden', !appState.loading);
}

function renderEmptyState(message = '') {
  dom.emptyState.innerHTML = `<p>${escapeHtml(message)}</p>`;
  dom.emptyState.classList.remove('hidden');
}

function hideEmptyState() {
  dom.emptyState.classList.add('hidden');
  dom.emptyState.innerHTML = '';
}

function renderSummarySection() {
  const counts = getChecklistCounts();
  dom.factoryValue.textContent = appState.factory || '-';
  dom.progressValue.textContent = `${counts.complete} / ${counts.total}`;
  dom.appSubtitle.textContent = appState.factory && appState.machine
    ? `Factory ${appState.factory} and machine ${appState.machine} are loaded. Only templates linked to that machine are shown, and cards stay incomplete until the answer, required photo, and any required ticket are finished.`
    : 'Load the checklist with ?selected=工場名&machine=設備名. Portrait mode is optimized first, landscape stays fully usable.';

  const scheduleCounts = appState.templates.reduce((result, template) => {
    result[template.schedule] = (result[template.schedule] || 0) + 1;
    return result;
  }, {});

  const chipMarkup = [];
  if (appState.factory) {
    chipMarkup.push(`<span class="chip chip--strong">Factory ${escapeHtml(appState.factory)}</span>`);
  }
  if (appState.machine) {
    chipMarkup.push(`<span class="chip chip--strong">Machine ${escapeHtml(appState.machine)}</span>`);
  }

  Object.keys(scheduleCounts)
    .sort((left, right) => (SCHEDULE_ORDER[left] ?? 99) - (SCHEDULE_ORDER[right] ?? 99))
    .forEach((schedule) => {
      chipMarkup.push(`<span class="chip">${escapeHtml(SCHEDULE_LABELS[schedule] || 'Checklist')} ${scheduleCounts[schedule]}</span>`);
    });

  if (counts.pendingTickets > 0) {
    chipMarkup.push(`<span class="chip">Tickets pending ${counts.pendingTickets}</span>`);
  }

  if (counts.pendingPhotos > 0) {
    chipMarkup.push(`<span class="chip chip--muted">Photos pending ${counts.pendingPhotos}</span>`);
  }

  dom.summaryChips.innerHTML = chipMarkup.join('');

  const statMarkup = [
    `<span class="chip">Templates ${appState.templates.length}</span>`,
    `<span class="chip">Fields ${counts.total}</span>`,
    `<span class="chip">Completed ${counts.complete}</span>`,
  ];

  dom.summaryStats.innerHTML = statMarkup.join('');
}

function renderTemplates() {
  if (appState.loading) {
    dom.templatesContainer.innerHTML = '';
    dom.actionFooter.classList.add('hidden');
    return;
  }

  if (appState.templates.length === 0) {
    dom.templatesContainer.innerHTML = '';
    dom.actionFooter.classList.add('hidden');
    return;
  }

  hideEmptyState();

  dom.templatesContainer.innerHTML = appState.templates
    .map((template, templateIndex) => renderTemplatePanel(template, templateIndex))
    .join('');

  hydrateAssetThumbs(dom.templatesContainer);
}

function renderTemplatePanel(template, templateIndex) {
  const templateCounts = getTemplateCounts(template);
  const visibleEquipment = appState.machine
    ? template.equipmentDetails.filter((equipment) =>
        (equipment.name || '').trim().toLowerCase() === appState.machine.trim().toLowerCase()
      )
    : template.equipmentDetails;
  const equipmentMarkup = visibleEquipment.length > 0
    ? visibleEquipment.map((equipment) => `
        <div class="equipment-card">
          ${equipment.imageURL ? `<img src="${escapeHtml(equipment.imageURL)}" alt="${escapeHtml(equipment.name)}">` : ''}
          <div class="equipment-card__label">${escapeHtml(equipment.name || 'Unknown equipment')}</div>
        </div>
      `).join('')
    : `<span class="chip chip--muted">No equipment image available</span>`;

  return `
    <section class="template-panel" data-template-id="${escapeHtml(template.templateId)}">
      <div class="template-panel__hero">
        <div class="template-panel__header">
          <span class="schedule-pill">${escapeHtml(SCHEDULE_LABELS[template.schedule] || 'Checklist')}</span>
          <div>
            <h2 class="template-panel__title">${escapeHtml(template.templateName)}</h2>
            <p class="template-panel__description">${escapeHtml(template.description || 'No description provided.')}</p>
          </div>
          <div class="chip-row">
            <span class="chip">Answered ${templateCounts.complete} / ${templateCounts.total}</span>
            <span class="chip">Equipment ${visibleEquipment.length}</span>
            ${template.startDate ? `<span class="chip chip--muted">Start ${escapeHtml(template.startDate)}</span>` : ''}
          </div>
        </div>
        <div>
          <div class="modal-label">Equipment</div>
          <div class="equipment-strip">${equipmentMarkup}</div>
        </div>
      </div>
      <div class="template-fields">
        ${template.fields.map((field, fieldIndex) => renderFieldCard(template, field, templateIndex, fieldIndex)).join('')}
      </div>
    </section>
  `;
}

function renderFieldCard(template, field, templateIndex, fieldIndex) {
  const fieldKey = getFieldKey(template.templateId, field.fieldId);
  const fieldStatus = getFieldStatus(field);
  const showTicketButton = shouldShowTicketButton(field);
  const showPhotoSection = field.photoRequired;
  const showResetButton = fieldHasResettableState(field);
  const answeredTimestampLabel = formatFieldAnswerTimestamp(field.lastAnsweredAt);
  const showFieldActions = showTicketButton || showPhotoSection;
  const showActionRow = showFieldActions || showResetButton;
  const classNames = [
    'field-card',
    fieldStatus.complete ? 'field-card--complete' : '',
    fieldStatus.ticketNeeded ? 'field-card--needs-ticket' : '',
    appState.validationErrors.has(fieldKey) ? 'field-card--attention' : '',
    field.type === 'text' || field.type === 'name' ? 'field-card--full' : '',
  ].filter(Boolean).join(' ');

  return `
    <article class="${classNames}" id="${escapeHtml(getFieldDomId(template.templateId, field.fieldId))}" data-template-id="${escapeHtml(template.templateId)}" data-field-id="${escapeHtml(field.fieldId)}">
      <div class="field-card__inner">
        <div class="field-card__head">
          <div>
            <span class="field-card__index">${templateIndex + 1}.${fieldIndex + 1}</span>
            <h3 class="field-card__title">${escapeHtml(field.label)}</h3>
            <p class="field-card__description">${escapeHtml(field.description || describeFieldType(field))}</p>
          </div>
          <div class="field-tags">
            <span class="status-pill ${escapeHtml(fieldStatus.className)}">${escapeHtml(fieldStatus.label)}</span>
            ${field.photoRequired ? '<span class="tag-pill">Photo required</span>' : ''}
            ${field.min !== null || field.max !== null ? `<span class="tag-pill">Range ${escapeHtml(formatRange(field.min, field.max, field.unit))}</span>` : ''}
          </div>
        </div>
        ${field.imageURL ? renderReferenceThumb(field) : ''}
        <div class="field-control">
          ${renderFieldControl(template, field)}
        </div>
        ${showActionRow ? `
        <div class="field-actions">
          ${showResetButton ? `
          <div class="field-reset-meta">
            <button
              type="button"
              class="utility-button utility-button--danger field-reset-button"
              data-action="reset-field"
              data-template-id="${escapeHtml(template.templateId)}"
              data-field-id="${escapeHtml(field.fieldId)}"
            >Reset</button>
            ${answeredTimestampLabel ? `<span class="field-timestamp" title="${escapeHtml(field.lastAnsweredAt)}">${escapeHtml(answeredTimestampLabel)}</span>` : ''}
          </div>
          ` : ''}
          ${showPhotoSection ? `
          <div class="field-thumb-grid">
            ${renderFieldPhotoSection(template, field)}
          </div>
          ` : ''}
          ${showTicketButton ? `
          <div class="field-option-grid">
            <button
              type="button"
              class="utility-button ${fieldStatus.ticketNeeded ? 'utility-button--ticket-required' : 'utility-button--ghost'}"
              data-action="open-ticket"
              data-template-id="${escapeHtml(template.templateId)}"
              data-field-id="${escapeHtml(field.fieldId)}"
            >${escapeHtml(field.ticket.saved ? 'Ticket saved' : fieldStatus.ticketNeeded ? 'Ticket required' : 'Open ticket')}</button>
          </div>
          ` : ''}
        </div>
        ` : ''}
        ${renderTicketSummary(field)}
      </div>
    </article>
  `;
}

function renderReferenceThumb(field) {
  return `
    <button
      type="button"
      class="reference-thumb"
      data-action="preview-remote-image"
      data-image-url="${escapeHtml(field.imageURL)}"
      data-title="${escapeHtml(field.label)}"
    >
      <img src="${escapeHtml(field.imageURL)}" alt="${escapeHtml(field.label)} reference image">
    </button>
  `;
}

function fieldHasResettableState(field) {
  if (!field) return false;

  return normalizeText(field.answerValue) !== ''
    || Boolean(field.fieldPhotoAssetId)
    || Boolean(field.ticket?.saved)
    || normalizeText(field.ticket?.reason) !== ''
    || (Array.isArray(field.ticket?.imageAssetIds) && field.ticket.imageAssetIds.length > 0)
    || Boolean(field.ticket?.pendingTouched)
    || normalizeText(field.ticket?.pendingReason) !== ''
    || (Array.isArray(field.ticket?.pendingImageAssetIds) && field.ticket.pendingImageAssetIds.length > 0);
}

function createFieldAnswerTimestamp() {
  return new Date().toISOString();
}

function touchFieldAnswerTimestamp(field) {
  if (!field) return;
  field.lastAnsweredAt = createFieldAnswerTimestamp();
}

function syncFieldAnswerTimestamp(field) {
  if (!field) return;
  field.lastAnsweredAt = normalizeText(field.answerValue) ? createFieldAnswerTimestamp() : '';
}

function formatFieldAnswerTimestamp(value = '') {
  const normalized = normalizeIsoTimestamp(value);
  if (!normalized) return '';

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return '';
  return FIELD_TIME_FORMATTER.format(parsed);
}

function renderFieldControl(template, field) {
  if (field.type === 'name') {
    return renderWorkerControl(template, field);
  }

  if (field.type === 'checkbox') {
    const current = normalizeText(field.answerValue).toUpperCase();
    return `
      <div class="choice-grid choice-grid--checkbox">
        <button
          type="button"
          class="choice-button choice-button--ok ${current === 'OK' ? 'is-active' : ''}"
          data-action="set-checkbox"
          data-template-id="${escapeHtml(template.templateId)}"
          data-field-id="${escapeHtml(field.fieldId)}"
          data-value="OK"
        >OK</button>
        <button
          type="button"
          class="choice-button choice-button--danger ${current === 'NG' ? 'is-active' : ''}"
          data-action="set-checkbox"
          data-template-id="${escapeHtml(template.templateId)}"
          data-field-id="${escapeHtml(field.fieldId)}"
          data-value="NG"
        >NG</button>
      </div>
    `;
  }

  if (field.type === 'number') {
    return `
      <button
        type="button"
        class="surface-button ${field.answerValue !== '' ? 'is-active' : ''}"
        data-action="open-keypad"
        data-template-id="${escapeHtml(template.templateId)}"
        data-field-id="${escapeHtml(field.fieldId)}"
      >
        <div>
          <span class="surface-button__label">Numeric input</span>
          <span class="surface-button__value">${escapeHtml(getNumberFieldDisplayValue(field))}</span>
          <div class="surface-button__hint">Tap to use the dedicated keypad</div>
        </div>
        <span>→</span>
      </button>
    `;
  }

  if (field.type === 'select') {
    return `
      <div class="field-option-grid">
        ${field.options.map((option) => `
          <button
            type="button"
            class="option-chip ${field.answerValue === option ? 'is-active' : ''}"
            data-action="set-select"
            data-template-id="${escapeHtml(template.templateId)}"
            data-field-id="${escapeHtml(field.fieldId)}"
            data-value="${escapeHtml(option)}"
          >${escapeHtml(option)}</button>
        `).join('')}
      </div>
    `;
  }

  return `
    <textarea
      class="field-textarea"
      data-field-input="text"
      data-template-id="${escapeHtml(template.templateId)}"
      data-field-id="${escapeHtml(field.fieldId)}"
      placeholder="Enter the answer or note here"
    >${escapeHtml(field.answerValue)}</textarea>
  `;
}

function renderWorkerControl(template, field) {
  if (field.answerValue) {
    return `
      <div class="worker-lock">
        <div class="worker-lock__name">${escapeHtml(field.answerValue)}</div>
        <button
          type="button"
          class="utility-button utility-button--ghost"
          data-action="open-worker-modal"
          data-template-id="${escapeHtml(template.templateId)}"
          data-field-id="${escapeHtml(field.fieldId)}"
        >Change worker</button>
      </div>
    `;
  }

  return `
    <button
      type="button"
      class="surface-button"
      data-action="open-worker-modal"
      data-template-id="${escapeHtml(template.templateId)}"
      data-field-id="${escapeHtml(field.fieldId)}"
    >
      <div>
        <span class="surface-button__label">Worker name</span>
        <span class="surface-button__value">Select a worker</span>
        <div class="surface-button__hint">Only workers assigned to ${escapeHtml(appState.factory || 'this factory')} are shown</div>
      </div>
      <span>→</span>
    </button>
  `;
}

function renderFieldPhotoSection(template, field) {
  if (!field.photoRequired) return '';

  if (!field.fieldPhotoAssetId) {
    return `
      <button
        type="button"
        class="utility-button ${field.photoRequired ? 'utility-button--accent' : 'utility-button--ghost'}"
        data-action="capture-field-photo"
        data-template-id="${escapeHtml(template.templateId)}"
        data-field-id="${escapeHtml(field.fieldId)}"
      >Take photo</button>
    `;
  }

  return `
    <div class="field-thumb">
      <button
        type="button"
        class="thumb-delete"
        aria-label="Delete photo"
        data-action="remove-field-photo"
        data-template-id="${escapeHtml(template.templateId)}"
        data-field-id="${escapeHtml(field.fieldId)}"
      >×</button>
      <img
        src=""
        alt="Captured photo for ${escapeHtml(field.label)}"
        data-thumb-asset-id="${escapeHtml(field.fieldPhotoAssetId)}"
        data-action="preview-asset"
        data-asset-id="${escapeHtml(field.fieldPhotoAssetId)}"
        data-title="${escapeHtml(field.label)}"
      >
    </div>
  `;
}

function renderTicketSummary(field) {
  if (!shouldShowTicketButton(field)) {
    return '';
  }

  if (!field.ticket.saved) {
    return fieldRequiresTicket(field)
      ? '<div class="ticket-summary"><strong>Ticket needed</strong>Answer is abnormal. Save a ticket before submit.</div>'
      : '';
  }

  return `
    <div class="ticket-summary">
      <strong>Ticket summary</strong>
      <div>${escapeHtml(field.ticket.reason)}</div>
      <div class="muted">Images ${field.ticket.imageAssetIds.length}</div>
    </div>
  `;
}

function renderFooter() {
  const templatesReady = appState.templates.length > 0 && !appState.loading;
  dom.actionFooter.classList.toggle('hidden', !templatesReady);

  if (!templatesReady) return;

  dom.submitButton.disabled = appState.submitting;
  dom.resetButton.disabled = appState.submitting;
}

function renderWorkerModal() {
  if (!appState.activeWorkerModal.open) {
    dom.workerModal.classList.add('hidden');
    dom.workerModal.innerHTML = '';
    return;
  }

  const recentWorkers = getVisibleRecentWorkers(appState.recentWorkers);
  const filteredWorkers = appState.workers.filter((worker) => {
    if (!appState.activeWorkerModal.search) return true;
    return worker.name.toLowerCase().includes(appState.activeWorkerModal.search.toLowerCase());
  });

  dom.workerModal.classList.remove('hidden');
  dom.workerModal.innerHTML = `
    <div class="modal-panel modal-panel--narrow" role="dialog" aria-modal="true" aria-label="Worker selection">
      <div class="modal-head">
        <div>
          <h2 class="modal-title">Select worker</h2>
          <p class="modal-subtitle">Only workers assigned to ${escapeHtml(appState.factory)} are shown. Choosing one worker updates every name field.</p>
        </div>
        <button type="button" class="modal-close" data-action="close-worker-modal" aria-label="Close">×</button>
      </div>
      <div class="modal-section">
        <label class="modal-label" for="workerSearchInput">Search worker</label>
        <input id="workerSearchInput" class="worker-search" data-worker-search type="search" placeholder="Type a worker name" value="${escapeHtml(appState.activeWorkerModal.search)}">
      </div>
      ${recentWorkers.length > 0 ? `
      <div class="modal-section">
        <div class="modal-label">Recent workers</div>
        <div class="recent-workers-row">
          ${recentWorkers.map((name, index) => `
            <button type="button" class="recent-worker-chip" data-action="choose-worker" data-worker-name="${escapeHtml(name)}" title="Recently selected worker">
              <span class="recent-worker-chip__name">${escapeHtml(name)}</span>
              <span class="recent-worker-chip__meta">#${index + 1}</span>
            </button>
          `).join('')}
        </div>
      </div>
      ` : ''}
      <div class="worker-list">
        ${filteredWorkers.length === 0 ? '<div class="chip chip--muted">No workers match this search.</div>' : filteredWorkers.map((worker) => `
          <button type="button" class="worker-option" data-action="choose-worker" data-worker-name="${escapeHtml(worker.name)}">
            <div>
              <div class="worker-option__name">${escapeHtml(worker.name)}</div>
              <div class="worker-option__dept">${escapeHtml(worker['部署'] || '')}</div>
            </div>
            <span>→</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function renderTicketModal() {
  if (!appState.activeTicket) {
    dom.ticketModal.classList.add('hidden');
    dom.ticketModal.innerHTML = '';
    return;
  }

  const { template, field, draft } = getActiveTicketContext();
  const reasonInvalid = Boolean(draft.reasonInvalid);
  const imagesInvalid = Boolean(draft.imagesInvalid);
  dom.ticketModal.classList.remove('hidden');
  dom.ticketModal.innerHTML = `
    <div class="modal-panel" role="dialog" aria-modal="true" aria-label="Ticket modal">
      <div class="modal-head">
        <div>
          <h2 class="modal-title">Create ticket</h2>
          <p class="modal-subtitle">${escapeHtml(template.templateName)} · ${escapeHtml(field.label)}${fieldRequiresTicket(field) ? ' requires a ticket before submit.' : ' can store an additional issue note if needed.'}</p>
        </div>
        <button type="button" class="modal-close" data-action="close-ticket-modal" aria-label="Close">×</button>
      </div>
      <div class="modal-section">
        <div class="chip-row">
          <span class="chip">Answer ${escapeHtml(getTicketAnswerLabel(field))}</span>
          ${field.min !== null || field.max !== null ? `<span class="chip chip--muted">Limit ${escapeHtml(formatRange(field.min, field.max, field.unit))}</span>` : ''}
          <span class="chip chip--muted">Photos ${draft.imageAssetIds.length} / 5</span>
        </div>
      </div>
      <div class="modal-section ${reasonInvalid ? 'modal-section--invalid' : ''}">
        <label class="modal-label ${reasonInvalid ? 'modal-label--danger' : ''}" for="ticketReasonInput">Reason</label>
        <textarea id="ticketReasonInput" class="modal-textarea ${reasonInvalid ? 'modal-textarea--invalid' : ''}" data-ticket-reason placeholder="Why did this answer go out of range or need a ticket?">${escapeHtml(draft.reason)}</textarea>
        ${reasonInvalid ? '<div class="modal-validation" data-ticket-validation="reason">Reason is required before saving the ticket.</div>' : ''}
      </div>
      <div class="modal-section ${imagesInvalid ? 'modal-section--invalid' : ''}">
        <div class="field-actions">
          <div>
            <div class="modal-label">Ticket images</div>
            <div class="muted">Up to 5 photos. Tap a thumbnail to open it larger.</div>
          </div>
          <div class="field-option-grid">
            <button type="button" class="utility-button ${imagesInvalid ? 'utility-button--danger' : 'utility-button--accent'}" data-action="add-ticket-images">Add photo</button>
          </div>
        </div>
        <div class="ticket-thumb-grid">
          ${draft.imageAssetIds.length === 0 ? '<span class="chip chip--muted">No ticket photos yet</span>' : draft.imageAssetIds.map((assetId, index) => `
            <div class="ticket-thumb">
              <button type="button" class="thumb-delete" aria-label="Delete photo" data-action="remove-ticket-image" data-index="${index}">×</button>
              <img src="" alt="Ticket image ${index + 1}" data-thumb-asset-id="${escapeHtml(assetId)}" data-action="preview-asset" data-asset-id="${escapeHtml(assetId)}" data-title="${escapeHtml(field.label)} ticket image ${index + 1}">
            </div>
          `).join('')}
        </div>
        ${imagesInvalid ? '<div class="modal-validation" data-ticket-validation="images">Add at least one ticket photo before saving.</div>' : ''}
      </div>
      <div class="field-option-grid">
        <button type="button" class="modal-button modal-button--ghost" data-action="close-ticket-modal">Close</button>
        <button type="button" class="modal-button modal-button--primary" data-action="save-ticket-modal">Save ticket</button>
      </div>
    </div>
  `;

  hydrateAssetThumbs(dom.ticketModal);
}

function renderKeypadModal() {
  if (!appState.activeKeypad) {
    dom.keypadModal.classList.add('hidden');
    dom.keypadModal.innerHTML = '';
    return;
  }

  const { field, value } = getActiveKeypadContext();
  const keypadButtons = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '-', '0', '.', 'C', '⌫', 'OK'];

  dom.keypadModal.classList.remove('hidden');
  dom.keypadModal.innerHTML = `
    <div class="modal-panel modal-panel--narrow" role="dialog" aria-modal="true" aria-label="Numeric keypad">
      <div class="modal-head">
        <div>
          <h2 class="modal-title">Numeric keypad</h2>
          <p class="modal-subtitle">${escapeHtml(field.label)}${field.min !== null || field.max !== null ? ` · Limit ${escapeHtml(formatRange(field.min, field.max, field.unit))}` : ''}</p>
        </div>
        <button type="button" class="modal-close" data-action="close-keypad-modal" aria-label="Close">×</button>
      </div>
      <div class="modal-section">
        <div class="keypad-display">
          <div class="keypad-display__value">${escapeHtml(value || '0')}</div>
          <div class="keypad-display__unit">${escapeHtml(field.unit || '')}</div>
        </div>
      </div>
      <div class="keypad-grid">
        ${keypadButtons.map((button) => {
          const action = button === 'OK' ? 'confirm-keypad' : button === '⌫' ? 'backspace-keypad' : button === 'C' ? 'clear-keypad' : 'append-keypad';
          const className = button === 'OK' ? 'keypad-button keypad-button--accent' : 'keypad-button';
          return `<button type="button" class="${className}" data-action="${action}" data-value="${escapeHtml(button)}">${escapeHtml(button)}</button>`;
        }).join('')}
      </div>
    </div>
  `;
}

function renderPhotoEditorModal() {
  if (!appState.photoEditor) {
    dom.photoEditorModal.classList.add('hidden');
    dom.photoEditorModal.innerHTML = '';
    return;
  }

  const editor = appState.photoEditor;
  const hasScribble = editor.strokes.length > 0;
  const hasRedoHistory = editor.redoStrokes.length > 0;
  const scribbleActive = editor.activeTool === 'scribble';
  const helperText = scribbleActive
    ? 'Draw directly on the photo. The scribble is optional and will be flattened into the saved image.'
    : hasScribble
      ? 'Scribble added. Use photo to keep the flattened result, or switch back to Scribble to keep drawing.'
      : 'Overlay tools are optional. Use photo to keep the original image as-is.';

  dom.photoEditorModal.classList.remove('hidden');
  dom.photoEditorModal.innerHTML = `
    <div class="photo-editor" role="dialog" aria-modal="true" aria-label="Photo overlay editor">
      <div class="modal-head">
        <div>
          <h2 class="modal-title">Photo overlay</h2>
          <p class="modal-subtitle">${escapeHtml(editor.title || 'Captured photo')} · Pick an optional overlay tool below before saving the photo.</p>
        </div>
        <button type="button" class="modal-close" data-action="close-photo-editor" aria-label="Close">×</button>
      </div>
      <div class="photo-editor__stage">
        <div class="photo-editor__canvas-stack">
          <canvas class="photo-editor__canvas" data-photo-editor-canvas="base" width="${editor.sourceImage.width}" height="${editor.sourceImage.height}"></canvas>
          <canvas class="photo-editor__canvas photo-editor__canvas--overlay ${scribbleActive ? 'photo-editor__canvas--active' : ''}" data-photo-editor-canvas="overlay" width="${editor.sourceImage.width}" height="${editor.sourceImage.height}"></canvas>
        </div>
      </div>
      <div class="photo-editor__tools" aria-label="Photo overlay tools">
        <button type="button" class="photo-tool ${!scribbleActive ? 'photo-tool--active' : ''}" data-action="select-photo-tool" data-tool="photo">
          <span class="photo-tool__thumb">
            <canvas data-photo-editor-preview="photo" width="84" height="84" aria-hidden="true"></canvas>
          </span>
          <span class="photo-tool__label">Photo</span>
        </button>
        <button type="button" class="photo-tool ${scribbleActive ? 'photo-tool--active' : ''}" data-action="select-photo-tool" data-tool="scribble">
          <span class="photo-tool__thumb">
            <canvas data-photo-editor-preview="scribble" width="84" height="84" aria-hidden="true"></canvas>
          </span>
          <span class="photo-tool__label">Scribble</span>
        </button>
      </div>
      <div class="photo-editor__footer">
        <div class="muted">${escapeHtml(helperText)}</div>
        <div class="photo-editor__actions">
          <button type="button" class="utility-button utility-button--ghost" data-action="undo-photo-scribble" ${hasScribble ? '' : 'disabled'}>Undo</button>
          <button type="button" class="utility-button utility-button--ghost" data-action="redo-photo-scribble" ${hasRedoHistory ? '' : 'disabled'}>Redo</button>
          <button type="button" class="utility-button utility-button--ghost" data-action="clear-photo-scribble" ${hasScribble ? '' : 'disabled'}>Clear scribble</button>
          <button type="button" class="modal-button modal-button--ghost" data-action="close-photo-editor">Cancel</button>
          <button type="button" class="modal-button modal-button--primary" data-action="apply-photo-editor">Use photo</button>
        </div>
      </div>
    </div>
  `;

  syncPhotoEditorCanvases();
  window.requestAnimationFrame(syncPhotoEditorLayout);
}

function syncPhotoEditorCanvases() {
  if (!appState.photoEditor) return;

  const baseCanvas = dom.photoEditorModal.querySelector('[data-photo-editor-canvas="base"]');
  const overlayCanvas = dom.photoEditorModal.querySelector('[data-photo-editor-canvas="overlay"]');

  if (baseCanvas) {
    const context = baseCanvas.getContext('2d');
    if (context) {
      context.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
      context.drawImage(appState.photoEditor.sourceImage, 0, 0, baseCanvas.width, baseCanvas.height);
    }
  }

  if (overlayCanvas) {
    drawPhotoEditorOverlayCanvas(overlayCanvas);
  }

  syncPhotoEditorToolPreviews();
}

function syncPhotoEditorLayout() {
  if (!appState.photoEditor) return;

  const modal = dom.photoEditorModal.querySelector('.photo-editor');
  const stage = dom.photoEditorModal.querySelector('.photo-editor__stage');
  const canvasStack = dom.photoEditorModal.querySelector('.photo-editor__canvas-stack');
  if (!modal || !stage || !canvasStack) return;

  const overlayStyle = window.getComputedStyle(dom.photoEditorModal);
  const modalStyle = window.getComputedStyle(modal);
  const stageStyle = window.getComputedStyle(stage);

  const overlayPadding = (parseFloat(overlayStyle.paddingTop) || 0) + (parseFloat(overlayStyle.paddingBottom) || 0);
  const modalPadding = (parseFloat(modalStyle.paddingTop) || 0) + (parseFloat(modalStyle.paddingBottom) || 0);
  const stagePaddingY = (parseFloat(stageStyle.paddingTop) || 0) + (parseFloat(stageStyle.paddingBottom) || 0);
  const stagePaddingX = (parseFloat(stageStyle.paddingLeft) || 0) + (parseFloat(stageStyle.paddingRight) || 0);
  const rowGap = parseFloat(modalStyle.rowGap || modalStyle.gap || '0') || 0;

  const availableHeight = Math.max(220, window.innerHeight - overlayPadding);
  const reservedHeight = modalPadding
    + stagePaddingY
    + rowGap * 3
    + (modal.querySelector('.modal-head')?.offsetHeight || 0)
    + (modal.querySelector('.photo-editor__tools')?.offsetHeight || 0)
    + (modal.querySelector('.photo-editor__footer')?.offsetHeight || 0);
  const stageMaxHeight = Math.max(180, Math.floor(availableHeight - reservedHeight));
  const stageInnerWidth = Math.max(180, Math.floor(stage.clientWidth - stagePaddingX));
  const imageRatio = appState.photoEditor.sourceImage.width / Math.max(appState.photoEditor.sourceImage.height, 1);

  let displayWidth = stageInnerWidth;
  let displayHeight = displayWidth / imageRatio;

  if (displayHeight > stageMaxHeight) {
    displayHeight = stageMaxHeight;
    displayWidth = displayHeight * imageRatio;
  }

  modal.style.setProperty('--photo-editor-stage-max-height', `${stageMaxHeight}px`);
  modal.style.setProperty('--photo-editor-display-width', `${Math.max(1, Math.floor(displayWidth))}px`);
  modal.style.setProperty('--photo-editor-display-height', `${Math.max(1, Math.floor(displayHeight))}px`);
  canvasStack.style.width = `var(--photo-editor-display-width)`;
  canvasStack.style.height = `var(--photo-editor-display-height)`;
}

function syncPhotoEditorToolPreviews() {
  if (!appState.photoEditor) return;

  const previewCanvases = Array.from(dom.photoEditorModal.querySelectorAll('canvas[data-photo-editor-preview]'));
  previewCanvases.forEach((canvas) => {
    drawPhotoEditorPreviewCanvas(canvas, normalizeText(canvas.dataset.photoEditorPreview));
  });
}

function drawPhotoEditorOverlayCanvas(canvas) {
  if (!appState.photoEditor) return;
  const context = canvas.getContext('2d');
  if (!context) return;

  context.clearRect(0, 0, canvas.width, canvas.height);
  drawPhotoEditorStrokes(context, appState.photoEditor.strokes);
}

function drawPhotoEditorPreviewCanvas(canvas, previewType) {
  if (!appState.photoEditor) return;
  const context = canvas.getContext('2d');
  if (!context) return;

  const box = drawImageContain(context, appState.photoEditor.sourceImage, canvas.width, canvas.height, 'rgba(15, 23, 42, 0.92)');
  if (previewType === 'scribble') {
    const strokes = appState.photoEditor.strokes.length > 0
      ? appState.photoEditor.strokes
      : [createPhotoEditorSampleStroke(appState.photoEditor.sourceImage.width, appState.photoEditor.sourceImage.height)];
    drawPhotoEditorStrokes(context, strokes, box.scale, box.offsetX, box.offsetY);
  }
}

function drawImageContain(context, image, width, height, background) {
  context.clearRect(0, 0, width, height);
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const offsetX = (width - drawWidth) / 2;
  const offsetY = (height - drawHeight) / 2;

  context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
  return { scale, offsetX, offsetY };
}

function drawPhotoEditorStrokes(context, strokes, scale = 1, offsetX = 0, offsetY = 0) {
  strokes.forEach((stroke) => {
    if (!stroke || !Array.isArray(stroke.points) || stroke.points.length === 0) return;

    context.save();
    context.strokeStyle = stroke.color || PHOTO_EDITOR_BRUSH_COLOR;
    context.fillStyle = stroke.color || PHOTO_EDITOR_BRUSH_COLOR;
    context.lineWidth = Math.max(2, (stroke.width || PHOTO_EDITOR_BRUSH_SIZE) * scale);
    context.lineCap = 'round';
    context.lineJoin = 'round';

    if (stroke.points.length === 1) {
      const point = stroke.points[0];
      context.beginPath();
      context.arc(offsetX + (point.x * scale), offsetY + (point.y * scale), context.lineWidth / 2, 0, Math.PI * 2);
      context.fill();
      context.restore();
      return;
    }

    context.beginPath();
    context.moveTo(offsetX + (stroke.points[0].x * scale), offsetY + (stroke.points[0].y * scale));
    for (let index = 1; index < stroke.points.length; index += 1) {
      context.lineTo(offsetX + (stroke.points[index].x * scale), offsetY + (stroke.points[index].y * scale));
    }
    context.stroke();
    context.restore();
  });
}

function createPhotoEditorSampleStroke(width, height) {
  return {
    color: PHOTO_EDITOR_BRUSH_COLOR,
    width: PHOTO_EDITOR_BRUSH_SIZE,
    points: [
      { x: width * 0.18, y: height * 0.72 },
      { x: width * 0.36, y: height * 0.48 },
      { x: width * 0.56, y: height * 0.63 },
      { x: width * 0.78, y: height * 0.3 },
    ],
  };
}

function renderImagePreviewModal() {
  if (!appState.imagePreview) {
    dom.imagePreviewModal.classList.add('hidden');
    dom.imagePreviewModal.innerHTML = '';
    return;
  }

  dom.imagePreviewModal.classList.remove('hidden');
  dom.imagePreviewModal.innerHTML = `
    <div class="image-preview" role="dialog" aria-modal="true" aria-label="Image preview">
      <div class="image-preview__media">
        <img src="${escapeHtml(appState.imagePreview.src)}" alt="${escapeHtml(appState.imagePreview.title || 'Image preview')}">
      </div>
      <div class="image-preview__caption">
        <div>
          <p class="image-preview__title">${escapeHtml(appState.imagePreview.title || 'Image preview')}</p>
          <div class="muted">Tap outside the panel or press Escape to close.</div>
        </div>
        <button type="button" class="modal-button modal-button--ghost" data-action="close-image-preview">Close</button>
      </div>
    </div>
  `;
}

function renderSubmitOverlay() {
  dom.submitOverlay.classList.toggle('hidden', !appState.submitting);
}

function handleTemplateAreaClick(event) {
  const trigger = event.target.closest('[data-action]');
  if (!trigger) return;

  const action = trigger.dataset.action;
  const templateId = normalizeText(trigger.dataset.templateId);
  const fieldId = normalizeText(trigger.dataset.fieldId);

  switch (action) {
    case 'open-worker-modal':
      openWorkerModal();
      break;
    case 'set-checkbox':
      setCheckboxValue(templateId, fieldId, trigger.dataset.value);
      break;
    case 'open-keypad':
      openKeypadModal(templateId, fieldId);
      break;
    case 'set-select':
      setSelectValue(templateId, fieldId, trigger.dataset.value);
      break;
    case 'capture-field-photo':
      void captureFieldPhoto(templateId, fieldId);
      break;
    case 'remove-field-photo':
      void removeFieldPhoto(templateId, fieldId);
      break;
    case 'reset-field':
      void resetFieldCard(templateId, fieldId);
      break;
    case 'open-ticket':
      openTicketModal(templateId, fieldId, false);
      break;
    case 'preview-asset':
      void openImagePreviewFromAsset(trigger.dataset.assetId, trigger.dataset.title);
      break;
    case 'preview-remote-image':
      openImagePreview(trigger.dataset.imageUrl, trigger.dataset.title);
      break;
    default:
      break;
  }
}

function handleTemplateAreaInput(event) {
  const target = event.target;
  if (!target.matches('[data-field-input="text"]')) return;

  const templateId = normalizeText(target.dataset.templateId);
  const fieldId = normalizeText(target.dataset.fieldId);
  const field = getFieldByIds(templateId, fieldId);
  if (!field) return;

  field.answerValue = target.value;
  syncFieldAnswerTimestamp(field);
  clearValidationError(templateId, fieldId);
  persistDraftState();
  renderSummarySection();
  renderFooter();
}

function handleTemplateAreaChange(event) {
  const target = event.target;
  if (!target.matches('[data-field-input="text"]')) return;
  renderTemplates();
}

function handleWorkerModalClick(event) {
  if (event.target === dom.workerModal) {
    closeWorkerModal();
    return;
  }

  const trigger = event.target.closest('[data-action]');
  if (!trigger) return;

  switch (trigger.dataset.action) {
    case 'close-worker-modal':
      closeWorkerModal();
      break;
    case 'choose-worker':
      chooseWorker(trigger.dataset.workerName);
      break;
    default:
      break;
  }
}

function handleWorkerModalInput(event) {
  if (!event.target.matches('[data-worker-search]')) return;
  appState.activeWorkerModal.search = event.target.value;
  // Partial update: only replace the list, not the whole modal, so the input keeps focus
  const workerList = dom.workerModal.querySelector('.worker-list');
  if (!workerList) return;
  const filteredWorkers = appState.workers.filter((worker) => {
    if (!appState.activeWorkerModal.search) return true;
    return worker.name.toLowerCase().includes(appState.activeWorkerModal.search.toLowerCase());
  });
  workerList.innerHTML = filteredWorkers.length === 0
    ? '<div class="chip chip--muted">No workers match this search.</div>'
    : filteredWorkers.map((worker) => `
          <button type="button" class="worker-option" data-action="choose-worker" data-worker-name="${escapeHtml(worker.name)}">
            <div>
              <div class="worker-option__name">${escapeHtml(worker.name)}</div>
              <div class="worker-option__dept">${escapeHtml(worker['部署'] || '')}</div>
            </div>
            <span>→</span>
          </button>
        `).join('');
}

function handleTicketModalClick(event) {
  if (event.target === dom.ticketModal) {
    closeTicketModal(true);
    return;
  }

  const trigger = event.target.closest('[data-action]');
  if (!trigger) return;

  switch (trigger.dataset.action) {
    case 'close-ticket-modal':
      closeTicketModal(true);
      break;
    case 'save-ticket-modal':
      saveTicketModal();
      break;
    case 'add-ticket-images':
      void addTicketImages();
      break;
    case 'remove-ticket-image':
      void removeTicketImage(Number(trigger.dataset.index));
      break;
    case 'preview-asset':
      void openImagePreviewFromAsset(trigger.dataset.assetId, trigger.dataset.title);
      break;
    default:
      break;
  }
}

function handleTicketModalInput(event) {
  if (!appState.activeTicket) return;
  if (!event.target.matches('[data-ticket-reason]')) return;
  appState.activeTicket.reason = event.target.value;

  if (normalizeText(appState.activeTicket.reason)) {
    appState.activeTicket.reasonInvalid = false;
    const section = event.target.closest('.modal-section');
    section?.classList.remove('modal-section--invalid');
    section?.querySelector('.modal-label')?.classList.remove('modal-label--danger');
    event.target.classList.remove('modal-textarea--invalid');
    section?.querySelector('[data-ticket-validation="reason"]')?.remove();
  }
}

function handleKeypadModalClick(event) {
  if (event.target === dom.keypadModal) {
    closeKeypadModal();
    return;
  }

  const trigger = event.target.closest('[data-action]');
  if (!trigger) return;

  switch (trigger.dataset.action) {
    case 'close-keypad-modal':
      closeKeypadModal();
      break;
    case 'append-keypad':
      appendKeypadValue(trigger.dataset.value);
      break;
    case 'backspace-keypad':
      backspaceKeypadValue();
      break;
    case 'clear-keypad':
      clearKeypadValue();
      break;
    case 'confirm-keypad':
      confirmKeypadValue();
      break;
    default:
      break;
  }
}

function handleImagePreviewClick(event) {
  if (event.target === dom.imagePreviewModal || event.target.closest('[data-action="close-image-preview"]')) {
    closeImagePreview();
  }
}

function handlePhotoEditorClick(event) {
  if (event.target === dom.photoEditorModal) {
    closePhotoEditor('');
    return;
  }

  const trigger = event.target.closest('[data-action]');
  if (!trigger) return;

  switch (trigger.dataset.action) {
    case 'close-photo-editor':
      closePhotoEditor('');
      break;
    case 'apply-photo-editor':
      closePhotoEditor(buildPhotoEditorOutput());
      break;
    case 'select-photo-tool':
      selectPhotoEditorTool(trigger.dataset.tool);
      break;
    case 'undo-photo-scribble':
      undoPhotoEditorScribble();
      break;
    case 'redo-photo-scribble':
      redoPhotoEditorScribble();
      break;
    case 'clear-photo-scribble':
      clearPhotoEditorScribble();
      break;
    default:
      break;
  }
}

function handlePhotoEditorPointerDown(event) {
  const canvas = event.target.closest('[data-photo-editor-canvas="overlay"]');
  if (!canvas || !appState.photoEditor || appState.photoEditor.activeTool !== 'scribble') return;

  event.preventDefault();
  const point = getPhotoEditorCanvasPoint(canvas, event);
  const stroke = {
    color: PHOTO_EDITOR_BRUSH_COLOR,
    width: PHOTO_EDITOR_BRUSH_SIZE,
    points: [point],
  };

  appState.photoEditor.redoStrokes = [];
  appState.photoEditor.strokes.push(stroke);
  appState.photoEditor.currentStroke = stroke;
  appState.photoEditor.drawing = true;
  appState.photoEditor.pointerId = event.pointerId;
  canvas.setPointerCapture?.(event.pointerId);
  drawPhotoEditorOverlayCanvas(canvas);
}

function handlePhotoEditorPointerMove(event) {
  if (!appState.photoEditor?.drawing) return;
  if (appState.photoEditor.pointerId !== null && event.pointerId !== appState.photoEditor.pointerId) return;

  const canvas = dom.photoEditorModal.querySelector('[data-photo-editor-canvas="overlay"]');
  const currentStroke = appState.photoEditor.currentStroke;
  if (!canvas || !currentStroke) return;

  event.preventDefault();
  const point = getPhotoEditorCanvasPoint(canvas, event);
  const lastPoint = currentStroke.points[currentStroke.points.length - 1];
  if (lastPoint && Math.hypot(lastPoint.x - point.x, lastPoint.y - point.y) < 1.5) return;

  currentStroke.points.push(point);
  drawPhotoEditorOverlayCanvas(canvas);
}

function finishPhotoEditorStroke(event) {
  if (!appState.photoEditor?.drawing) return;
  if (event.type !== 'pointercancel' && appState.photoEditor.pointerId !== null && event.pointerId !== appState.photoEditor.pointerId) return;

  appState.photoEditor.drawing = false;
  appState.photoEditor.pointerId = null;
  appState.photoEditor.currentStroke = null;
  syncPhotoEditorToolPreviews();
}

function getPhotoEditorCanvasPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / Math.max(rect.width, 1);
  const scaleY = canvas.height / Math.max(rect.height, 1);

  return {
    x: clampNumber((event.clientX - rect.left) * scaleX, 0, canvas.width),
    y: clampNumber((event.clientY - rect.top) * scaleY, 0, canvas.height),
  };
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function selectPhotoEditorTool(tool) {
  if (!appState.photoEditor) return;
  appState.photoEditor.activeTool = tool === 'scribble' ? 'scribble' : 'photo';
  renderPhotoEditorModal();
}

function undoPhotoEditorScribble() {
  if (!appState.photoEditor || appState.photoEditor.strokes.length === 0) return;

  appState.photoEditor.drawing = false;
  appState.photoEditor.pointerId = null;
  appState.photoEditor.currentStroke = null;
  const stroke = appState.photoEditor.strokes.pop();
  if (stroke) {
    appState.photoEditor.redoStrokes.push(stroke);
  }
  renderPhotoEditorModal();
}

function redoPhotoEditorScribble() {
  if (!appState.photoEditor || appState.photoEditor.redoStrokes.length === 0) return;

  appState.photoEditor.drawing = false;
  appState.photoEditor.pointerId = null;
  appState.photoEditor.currentStroke = null;
  const stroke = appState.photoEditor.redoStrokes.pop();
  if (stroke) {
    appState.photoEditor.strokes.push(stroke);
  }
  renderPhotoEditorModal();
}

function clearPhotoEditorScribble() {
  if (!appState.photoEditor) return;
  appState.photoEditor.strokes = [];
  appState.photoEditor.redoStrokes = [];
  appState.photoEditor.currentStroke = null;
  appState.photoEditor.drawing = false;
  appState.photoEditor.pointerId = null;
  renderPhotoEditorModal();
}

function buildPhotoEditorOutput() {
  if (!appState.photoEditor) return '';
  if (appState.photoEditor.strokes.length === 0) {
    return appState.photoEditor.sourceDataUrl;
  }

  const canvas = document.createElement('canvas');
  canvas.width = appState.photoEditor.sourceImage.width;
  canvas.height = appState.photoEditor.sourceImage.height;
  const context = canvas.getContext('2d');
  if (!context) {
    return appState.photoEditor.sourceDataUrl;
  }

  context.drawImage(appState.photoEditor.sourceImage, 0, 0, canvas.width, canvas.height);
  drawPhotoEditorStrokes(context, appState.photoEditor.strokes);
  return canvas.toDataURL('image/jpeg', PHOTO_EDITOR_OUTPUT_QUALITY);
}

function closePhotoEditor(result) {
  if (!appState.photoEditor) return;

  const resolveEditor = appState.photoEditor.resolve;
  appState.photoEditor = null;
  renderPhotoEditorModal();

  if (typeof resolveEditor === 'function') {
    resolveEditor(result || '');
  }
}

function openWorkerModal() {
  appState.activeWorkerModal.open = true;
  appState.activeWorkerModal.search = '';
  renderWorkerModal();
}

function closeWorkerModal() {
  appState.activeWorkerModal.open = false;
  appState.activeWorkerModal.search = '';
  renderWorkerModal();
}

function chooseWorker(workerName) {
  const normalized = normalizeText(workerName);
  if (!normalized) return;

  rememberRecentWorker(normalized);
  appState.selectedWorkerName = normalized;
  syncTemplateWorkersFromSelection(true, true);
  closeWorkerModal();
  showBanner(`Worker set to ${normalized}.`, 'info', 1800);
}

function rememberRecentWorker(workerName) {
  const normalized = normalizeText(workerName);
  if (!normalized) return;

  appState.recentWorkers = [
    normalized,
    ...appState.recentWorkers.filter((name) => name !== normalized),
  ].slice(0, MAX_RECENT_WORKERS);
  persistRecentWorkers();
}

function syncTemplateWorkersFromSelection(shouldRender, shouldStampTimestamp = false) {
  if (!appState.selectedWorkerName) return;

  appState.templates.forEach((template) => {
    template.workerName = appState.selectedWorkerName;
    template.fields.forEach((field) => {
      if (field.type !== 'name') return;
      field.answerValue = appState.selectedWorkerName;
      if (shouldStampTimestamp) {
        touchFieldAnswerTimestamp(field);
      }
      clearValidationError(template.templateId, field.fieldId);
    });
  });

  persistDraftState();

  if (shouldRender) {
    renderApp();
  }
}

function setCheckboxValue(templateId, fieldId, value) {
  const field = getFieldByIds(templateId, fieldId);
  if (!field) return;

  field.answerValue = normalizeText(value).toUpperCase();
  touchFieldAnswerTimestamp(field);
  clearValidationError(templateId, fieldId);
  persistDraftState();
  renderApp();

  if (fieldRequiresTicket(field) && !field.ticket.saved) {
    openTicketModal(templateId, fieldId, true);
  }
}

function setSelectValue(templateId, fieldId, value) {
  const field = getFieldByIds(templateId, fieldId);
  if (!field) return;

  field.answerValue = normalizeText(value);
  touchFieldAnswerTimestamp(field);
  clearValidationError(templateId, fieldId);
  persistDraftState();
  renderApp();

  if (fieldRequiresTicket(field) && !field.ticket.saved) {
    openTicketModal(templateId, fieldId, true);
  }
}

function openKeypadModal(templateId, fieldId) {
  const field = getFieldByIds(templateId, fieldId);
  if (!field) return;

  appState.activeKeypad = {
    templateId,
    fieldId,
    value: normalizeText(field.answerValue),
  };
  renderKeypadModal();
}

function getActiveKeypadContext() {
  const field = getFieldByIds(appState.activeKeypad.templateId, appState.activeKeypad.fieldId);
  return {
    field,
    value: appState.activeKeypad.value,
  };
}

function updateKeypadDisplay() {
  if (!appState.activeKeypad) return;
  const displayEl = dom.keypadModal.querySelector('.keypad-display__value');
  if (displayEl) displayEl.textContent = appState.activeKeypad.value || '0';
}

function appendKeypadValue(token) {
  if (!appState.activeKeypad) return;

  const current = appState.activeKeypad.value;
  if (token === '-') {
    if (current.includes('-')) return;
    appState.activeKeypad.value = current ? current : '-';
    updateKeypadDisplay();
    return;
  }

  if (token === '.') {
    if (current.includes('.')) return;
    if (!current || current === '-') {
      appState.activeKeypad.value = `${current || '0'}.`;
    } else {
      appState.activeKeypad.value = `${current}.`;
    }
    updateKeypadDisplay();
    return;
  }

  appState.activeKeypad.value = `${current}${token}`;
  updateKeypadDisplay();
}

function backspaceKeypadValue() {
  if (!appState.activeKeypad) return;
  appState.activeKeypad.value = appState.activeKeypad.value.slice(0, -1);
  updateKeypadDisplay();
}

function clearKeypadValue() {
  if (!appState.activeKeypad) return;
  appState.activeKeypad.value = '';
  updateKeypadDisplay();
}

function closeKeypadModal() {
  appState.activeKeypad = null;
  renderKeypadModal();
}

function confirmKeypadValue() {
  if (!appState.activeKeypad) return;
  const templateId = appState.activeKeypad.templateId;
  const fieldId = appState.activeKeypad.fieldId;
  const field = getFieldByIds(templateId, fieldId);
  if (!field) return;

  const normalized = normalizeKeypadEntry(appState.activeKeypad.value);
  if (normalized === null) {
    showBanner('Enter a valid number before confirming.', 'danger', 2200);
    return;
  }

  field.answerValue = normalized;
  touchFieldAnswerTimestamp(field);
  clearValidationError(templateId, fieldId);
  closeKeypadModal();
  persistDraftState();
  renderApp();

  if (fieldRequiresTicket(field) && !field.ticket.saved) {
    openTicketModal(templateId, fieldId, true);
  }
}

function normalizeKeypadEntry(value) {
  const normalized = normalizeText(value);
  if (!normalized || normalized === '-' || normalized === '.' || normalized === '-.') {
    return null;
  }
  if (!/^[-]?\d*(\.\d+)?$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? String(parsed) : null;
}

function openTicketModal(templateId, fieldId, autoOpened) {
  const template = getTemplateById(templateId);
  const field = getFieldByIds(templateId, fieldId);
  if (!template || !field) return;

  const draft = getTicketDraft(field);
  appState.activeTicket = {
    templateId,
    fieldId,
    reason: draft.reason,
    imageAssetIds: [...draft.imageAssetIds],
    autoOpened: Boolean(autoOpened),
    reasonInvalid: false,
    imagesInvalid: false,
  };
  renderTicketModal();
}

function getActiveTicketContext() {
  const template = getTemplateById(appState.activeTicket.templateId);
  const field = getFieldByIds(appState.activeTicket.templateId, appState.activeTicket.fieldId);
  return {
    template,
    field,
    draft: appState.activeTicket,
  };
}

function getTicketDraft(field) {
  if (field.ticket.pendingTouched) {
    return {
      reason: field.ticket.pendingReason,
      imageAssetIds: [...field.ticket.pendingImageAssetIds],
    };
  }

  return {
    reason: field.ticket.reason,
    imageAssetIds: [...field.ticket.imageAssetIds],
  };
}

function focusTicketValidationTarget(reasonInvalid, imagesInvalid) {
  window.requestAnimationFrame(() => {
    if (reasonInvalid) {
      dom.ticketModal.querySelector('#ticketReasonInput')?.focus();
      return;
    }

    if (imagesInvalid) {
      dom.ticketModal.querySelector('[data-action="add-ticket-images"]')?.focus();
    }
  });
}

function closeTicketModal(keepDraft) {
  if (appState.activeTicket && keepDraft) {
    const field = getFieldByIds(appState.activeTicket.templateId, appState.activeTicket.fieldId);
    if (field) {
      field.ticket.pendingTouched = true;
      field.ticket.pendingReason = appState.activeTicket.reason;
      field.ticket.pendingImageAssetIds = [...appState.activeTicket.imageAssetIds];
      persistDraftState();
    }
  }

  appState.activeTicket = null;
  renderTicketModal();
  renderTemplates();
}

function saveTicketModal() {
  if (!appState.activeTicket) return;
  const templateId = appState.activeTicket.templateId;
  const fieldId = appState.activeTicket.fieldId;
  const field = getFieldByIds(templateId, fieldId);
  if (!field) return;

  const reason = normalizeText(appState.activeTicket.reason);
  const missingReason = !reason;
  const missingImages = appState.activeTicket.imageAssetIds.length === 0;

  if (missingReason || missingImages) {
    appState.activeTicket.reasonInvalid = missingReason;
    appState.activeTicket.imagesInvalid = missingImages;
    renderTicketModal();
    focusTicketValidationTarget(missingReason, missingImages);
    return;
  }

  field.ticket.saved = true;
  field.ticket.reason = reason;
  field.ticket.imageAssetIds = [...appState.activeTicket.imageAssetIds];
  field.ticket.pendingTouched = false;
  field.ticket.pendingReason = reason;
  field.ticket.pendingImageAssetIds = [...appState.activeTicket.imageAssetIds];
  clearValidationError(templateId, fieldId);
  appState.activeTicket = null;
  persistDraftState();
  renderApp();
  showBanner('Ticket saved.', 'info', 1800);
}

async function addTicketImages() {
  if (!appState.activeTicket) return;
  const remaining = 5 - appState.activeTicket.imageAssetIds.length;
  if (remaining <= 0) {
    showBanner('A maximum of 5 ticket photos is allowed.', 'danger', 2200);
    return;
  }

  const field = getFieldByIds(appState.activeTicket.templateId, appState.activeTicket.fieldId);
  const editedDataUrl = await capturePhotoWithOptionalOverlay(field ? `${field.label} ticket photo` : 'Ticket photo');
  if (!editedDataUrl) return;

  const assetId = createAssetId('ticket');
  await saveAsset(assetId, editedDataUrl);
  appState.activeTicket.imageAssetIds.push(assetId);
  appState.activeTicket.imagesInvalid = false;
  renderTicketModal();
}

async function removeTicketImage(index) {
  if (!appState.activeTicket) return;
  const assetId = appState.activeTicket.imageAssetIds[index];
  if (!assetId) return;

  appState.activeTicket.imageAssetIds.splice(index, 1);
  await deleteAsset(assetId);

  const field = getFieldByIds(appState.activeTicket.templateId, appState.activeTicket.fieldId);
  if (field) {
    field.ticket.pendingTouched = true;
    field.ticket.pendingReason = appState.activeTicket.reason;
    field.ticket.pendingImageAssetIds = [...appState.activeTicket.imageAssetIds];

    if (field.ticket.saved && field.ticket.imageAssetIds.includes(assetId)) {
      field.ticket.imageAssetIds = field.ticket.imageAssetIds.filter((savedAssetId) => savedAssetId !== assetId);
      if (field.ticket.imageAssetIds.length === 0) {
        field.ticket.saved = false;
      }
    }

    persistDraftState();
  }

  renderTicketModal();
}

async function captureFieldPhoto(templateId, fieldId) {
  const field = getFieldByIds(templateId, fieldId);
  if (!field) return;

  const editedDataUrl = await capturePhotoWithOptionalOverlay(`${field.label} photo`);
  if (!editedDataUrl) return;

  if (field.fieldPhotoAssetId) {
    await deleteAsset(field.fieldPhotoAssetId);
  }

  const assetId = createAssetId('field');
  await saveAsset(assetId, editedDataUrl);
  field.fieldPhotoAssetId = assetId;
  clearValidationError(templateId, fieldId);
  persistDraftState();
  renderApp();
}

async function removeFieldPhoto(templateId, fieldId) {
  const field = getFieldByIds(templateId, fieldId);
  if (!field || !field.fieldPhotoAssetId) return;

  await deleteAsset(field.fieldPhotoAssetId);
  field.fieldPhotoAssetId = '';
  persistDraftState();
  renderApp();
}

async function resetFieldCard(templateId, fieldId) {
  const template = getTemplateById(templateId);
  const field = getFieldByIds(templateId, fieldId);
  if (!template || !field || !fieldHasResettableState(field)) return;

  const assetIds = new Set();
  if (field.fieldPhotoAssetId) {
    assetIds.add(field.fieldPhotoAssetId);
  }

  (field.ticket.imageAssetIds || []).forEach((assetId) => {
    if (assetId) assetIds.add(assetId);
  });
  (field.ticket.pendingImageAssetIds || []).forEach((assetId) => {
    if (assetId) assetIds.add(assetId);
  });

  await Promise.all(Array.from(assetIds).map((assetId) => deleteAsset(assetId)));

  field.answerValue = '';
  field.fieldPhotoAssetId = '';
  field.ticket.saved = false;
  field.ticket.reason = '';
  field.ticket.imageAssetIds = [];
  field.ticket.pendingTouched = false;
  field.ticket.pendingReason = '';
  field.ticket.pendingImageAssetIds = [];
  field.ticket.ticketKey = createTicketKey(templateId, fieldId);

  if (field.type === 'name') {
    template.workerName = '';
  }

  clearValidationError(templateId, fieldId);
  persistDraftState();
  renderApp();
}

async function openImagePreviewFromAsset(assetId, title) {
  const dataUrl = await getAsset(assetId);
  if (!dataUrl) {
    showBanner('Could not load the image preview.', 'danger', 2200);
    return;
  }
  openImagePreview(dataUrl, title);
}

function openImagePreview(src, title = '') {
  appState.imagePreview = {
    src,
    title: normalizeText(title),
  };
  renderImagePreviewModal();
}

function closeImagePreview() {
  appState.imagePreview = null;
  renderImagePreviewModal();
}

function getTemplateById(templateId) {
  return appState.templates.find((template) => template.templateId === normalizeText(templateId)) || null;
}

function getFieldByIds(templateId, fieldId) {
  const template = getTemplateById(templateId);
  if (!template) return null;
  return template.fields.find((field) => field.fieldId === normalizeText(fieldId)) || null;
}

function getFieldKey(templateId, fieldId) {
  return `${templateId}::${fieldId}`;
}

function getFieldDomId(templateId, fieldId) {
  return `field-${sanitizeDomSegment(templateId)}-${sanitizeDomSegment(fieldId)}`;
}

function clearValidationError(templateId, fieldId) {
  appState.validationErrors.delete(getFieldKey(templateId, fieldId));
}

function getChecklistCounts() {
  let total = 0;
  let complete = 0;
  let pendingTickets = 0;
  let pendingPhotos = 0;

  appState.templates.forEach((template) => {
    template.fields.forEach((field) => {
      total += 1;
      if (isFieldComplete(field)) complete += 1;
      if (fieldRequiresTicket(field) && !field.ticket.saved) pendingTickets += 1;
      if (fieldRequiresTicket(field) && field.ticket.saved && !ticketHasRequiredImage(field)) pendingTickets += 1;
      if (field.photoRequired && !field.fieldPhotoAssetId) pendingPhotos += 1;
    });
  });

  return { total, complete, pendingTickets, pendingPhotos };
}

function getTemplateCounts(template) {
  const total = template.fields.length;
  const complete = template.fields.filter((field) => isFieldComplete(field)).length;
  return { total, complete };
}

function isFieldAnswered(field) {
  if (field.type === 'checkbox') {
    const normalized = normalizeText(field.answerValue).toUpperCase();
    return normalized === 'OK' || normalized === 'NG';
  }
  if (field.type === 'number') {
    return normalizeNumber(field.answerValue) !== null;
  }
  return normalizeText(field.answerValue).length > 0;
}

function fieldRequiresTicket(field) {
  if (field.type === 'checkbox') {
    return normalizeText(field.answerValue).toUpperCase() === 'NG';
  }

  if (field.type === 'number' || field.type === 'select') {
    const numericValue = normalizeNumber(field.answerValue);
    if (numericValue === null) return false;
    if (field.min !== null && numericValue < field.min) return true;
    if (field.max !== null && numericValue > field.max) return true;
  }

  return false;
}

function isFieldComplete(field) {
  const hasAnswer = isFieldAnswered(field);
  const hasPhoto = !field.photoRequired || Boolean(field.fieldPhotoAssetId);
  const hasRequiredTicket = !fieldRequiresTicket(field)
    || (field.ticket.saved && normalizeText(field.ticket.reason).length > 0 && ticketHasRequiredImage(field));
  return hasAnswer && hasPhoto && hasRequiredTicket;
}

function getFieldStatus(field) {
  if (!isFieldAnswered(field)) {
    return {
      label: 'Pending',
      className: 'status-pill--pending',
      complete: false,
      ticketNeeded: false,
    };
  }

  if (fieldRequiresTicket(field) && !field.ticket.saved) {
    return {
      label: 'Ticket needed',
      className: 'status-pill--ticket',
      complete: false,
      ticketNeeded: true,
    };
  }

  if (fieldRequiresTicket(field) && field.ticket.saved && !ticketHasRequiredImage(field)) {
    return {
      label: 'Ticket photo needed',
      className: 'status-pill--ticket',
      complete: false,
      ticketNeeded: true,
    };
  }

  if (field.photoRequired && !field.fieldPhotoAssetId) {
    return {
      label: 'Photo needed',
      className: 'status-pill--draft',
      complete: false,
      ticketNeeded: false,
    };
  }

  return {
    label: 'Answered',
    className: 'status-pill--complete',
    complete: true,
    ticketNeeded: false,
  };
}

function getNumberFieldDisplayValue(field) {
  if (normalizeText(field.answerValue).length === 0) {
    return field.unit ? `Tap to enter ${field.unit}` : 'Tap to enter a value';
  }

  return `${field.answerValue}${field.unit || ''}`;
}

function getTicketAnswerLabel(field) {
  if (field.type === 'number') {
    return getNumberFieldDisplayValue(field);
  }
  return normalizeText(field.answerValue) || 'Not answered';
}

function formatRange(min, max, unit = '') {
  if (min !== null && max !== null) return `${min} to ${max}${unit || ''}`;
  if (min !== null) return `≥ ${min}${unit || ''}`;
  if (max !== null) return `≤ ${max}${unit || ''}`;
  return unit || 'No limit';
}

function describeFieldType(field) {
  if (field.type === 'checkbox') return 'Choose OK or NG.';
  if (field.type === 'number') return 'Tap to open the numeric keypad.';
  if (field.type === 'select') return 'Choose one option.';
  if (field.type === 'name') return 'Select the worker assigned to this checklist.';
  return 'Enter the required note or answer.';
}

async function handleSubmitRequest() {
  if (appState.submitting || appState.templates.length === 0) return;

  const firstIncomplete = collectValidationErrors();
  renderTemplates();
  renderSummarySection();
  renderFooter();

  if (firstIncomplete) {
    scrollToField(firstIncomplete.templateId, firstIncomplete.fieldId);
    showBanner('Finish the highlighted card before submitting.', 'danger', 2600);
    return;
  }

  appState.submitting = true;
  renderSubmitOverlay();

  try {
    const payload = await buildSubmissionPayload();
    await fetchJson(CHECKLIST_API.submit, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    await resetDraftState(false);
    showBanner('Checklist submitted successfully.', 'success', 3200);
    dom.statusValue.textContent = 'Submitted';
  } catch (error) {
    showBanner(error.message || 'Checklist submission failed.', 'danger', 3800);
  } finally {
    appState.submitting = false;
    renderApp();
  }
}

function collectValidationErrors() {
  appState.validationErrors.clear();
  let firstIncomplete = null;

  appState.templates.forEach((template) => {
    template.fields.forEach((field) => {
      if (isFieldComplete(field)) return;
      appState.validationErrors.add(getFieldKey(template.templateId, field.fieldId));
      if (!firstIncomplete) {
        firstIncomplete = {
          templateId: template.templateId,
          fieldId: field.fieldId,
        };
      }
    });
  });

  return firstIncomplete;
}

function scrollToField(templateId, fieldId) {
  const target = document.getElementById(getFieldDomId(templateId, fieldId));
  if (!target) return;
  target.classList.add('field-card--attention-live');
  window.setTimeout(() => target.classList.remove('field-card--attention-live'), 2200);
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function buildSubmissionPayload() {
  const templates = [];

  for (const template of appState.templates) {
    const answers = [];

    for (const field of template.fields) {
      const answer = {
        id: field.fieldId,
        label: field.label,
        description: field.description,
        imageURL: field.imageURL,
        type: field.type,
        required: field.required,
        locked: field.locked,
        photoRequired: field.photoRequired,
        options: field.options,
        min: field.min,
        max: field.max,
        unit: field.unit,
        value: field.type === 'number' ? normalizeNumber(field.answerValue) : normalizeText(field.answerValue),
        displayValue: field.type === 'number' ? getNumberFieldDisplayValue(field) : normalizeText(field.answerValue),
        answeredAt: field.lastAnsweredAt || null,
      };

      if (field.fieldPhotoAssetId) {
        const fieldPhotoData = await getAsset(field.fieldPhotoAssetId);
        if (!fieldPhotoData) {
          throw new Error(`Could not load the saved field photo for ${field.label}. Capture it again before submit.`);
        }
        answer.fieldPhotoData = fieldPhotoData;
      }

      if (field.ticket.saved) {
        const ticketImagesData = (await Promise.all(field.ticket.imageAssetIds.map((assetId) => getAsset(assetId)))).filter(Boolean);
        if (ticketImagesData.length === 0) {
          throw new Error(`Could not load the saved ticket photo for ${field.label}. Open the ticket and add the photo again.`);
        }
        answer.ticket = {
          saved: true,
          ticketKey: field.ticket.ticketKey,
          reason: field.ticket.reason,
          imagesData: ticketImagesData,
        };
      }

      answers.push(answer);
    }

    templates.push({
      templateId: template.templateId,
      templateName: template.templateName,
      description: template.description,
      schedule: template.schedule,
      startDate: template.startDate,
      equipmentId: resolveTemplateMachineId(template),
      加工設備: appState.machine,
      selectedMachine: appState.machine,
      selectedMachineId: resolveTemplateMachineId(template),
      workerName: template.workerName || appState.selectedWorkerName,
      answers,
    });
  }

  return {
    factory: appState.factory,
    machine: appState.machine,
    submittedAtClient: new Date().toISOString(),
    templates,
  };
}

function handleResetRequest() {
  if (appState.submitting) return;
  const confirmed = window.confirm(`Reset every answer, photo, and local draft for ${appState.factory} / ${appState.machine}?`);
  if (!confirmed) return;
  void resetDraftState(true);
}

function resolveTemplateMachineId(template) {
  if (!template || !appState.machine) return '';
  const matchedEquipment = template.equipmentDetails.find((equipment) => machineNamesMatch(equipment.name, appState.machine));
  return matchedEquipment?._id || '';
}

function machineNamesMatch(left, right) {
  return normalizeText(left).toUpperCase() === normalizeText(right).toUpperCase();
}

async function resetDraftState(showResetBanner) {
  const assetIds = collectAllAssetIds();
  await Promise.all(assetIds.map((assetId) => deleteAsset(assetId)));
  removeDraftState();

  appState.selectedWorkerName = '';
  appState.validationErrors.clear();
  appState.activeTicket = null;
  appState.activeKeypad = null;
  appState.photoEditor = null;
  appState.imagePreview = null;

  appState.templates.forEach((template) => {
    template.workerName = '';
    template.fields.forEach((field) => {
      field.answerValue = '';
      field.lastAnsweredAt = '';
      field.lastAnsweredAt = '';
      field.fieldPhotoAssetId = '';
      field.ticket.saved = false;
      field.ticket.reason = '';
      field.ticket.imageAssetIds = [];
      field.ticket.pendingTouched = false;
      field.ticket.pendingReason = '';
      field.ticket.pendingImageAssetIds = [];
      field.ticket.ticketKey = createTicketKey(template.templateId, field.fieldId);
    });
  });

  if (showResetBanner) {
    showBanner('Draft reset complete.', 'info', 2200);
    dom.statusValue.textContent = 'Reset';
  }

  renderApp();
}

function shouldShowTicketButton(field) {
  return field.type !== 'name';
}

function ticketHasRequiredImage(field) {
  return Array.isArray(field.ticket?.imageAssetIds) && field.ticket.imageAssetIds.length > 0;
}

function setFooterExpanded(expanded) {
  appState.footerExpanded = Boolean(expanded);
  renderFooter();
}

function syncHeaderCondensedState() {
  document.body.classList.toggle('header-condensed', window.scrollY > 36);
}

function collectAllAssetIds() {
  const assetIds = [];
  appState.templates.forEach((template) => {
    template.fields.forEach((field) => {
      if (field.fieldPhotoAssetId) assetIds.push(field.fieldPhotoAssetId);
      assetIds.push(...field.ticket.imageAssetIds);
      assetIds.push(...field.ticket.pendingImageAssetIds);
    });
  });
  return Array.from(new Set(assetIds.filter(Boolean)));
}

async function hydrateAssetThumbs(scope) {
  const images = Array.from(scope.querySelectorAll('img[data-thumb-asset-id]'));
  await Promise.all(images.map(async (image) => {
    const assetId = normalizeText(image.dataset.thumbAssetId);
    if (!assetId) return;
    const assetSrc = await getAsset(assetId);
    if (assetSrc) {
      image.src = assetSrc;
    }
  }));
}

function createAssetId(prefix) {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return `${prefix}_${window.crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function pickImagesFromDevice(multiple) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.multiple = Boolean(multiple);
    input.style.display = 'none';

    const cleanup = () => {
      if (input.parentNode) {
        input.parentNode.removeChild(input);
      }
    };

    input.addEventListener('change', () => {
      const files = Array.from(input.files || []);
      cleanup();
      resolve(files);
    }, { once: true });

    document.body.appendChild(input);
    input.click();
  });
}

async function compressImageFile(file, maxWidth, quality) {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);
  const scale = Math.min(1, maxWidth / image.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

async function capturePhotoWithOptionalOverlay(title) {
  const files = await pickImagesFromDevice(false);
  if (files.length === 0) return '';

  const compressedDataUrl = await compressImageFile(files[0], 1600, 0.78);
  return openPhotoEditor(compressedDataUrl, title);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image for compression.'));
    image.src = src;
  });
}

async function openPhotoEditor(sourceDataUrl, title) {
  if (!sourceDataUrl) return '';

  try {
    const sourceImage = await loadImage(sourceDataUrl);
    return await new Promise((resolve) => {
      appState.photoEditor = {
        title: normalizeText(title) || 'Captured photo',
        sourceDataUrl,
        sourceImage,
        activeTool: 'photo',
        strokes: [],
        redoStrokes: [],
        drawing: false,
        pointerId: null,
        currentStroke: null,
        resolve,
      };
      renderPhotoEditorModal();
    });
  } catch (error) {
    console.warn('Photo editor initialization failed:', error);
    showBanner('Photo overlay tools are unavailable. The original photo will be used.', 'warning', 2200);
    return sourceDataUrl;
  }
}

async function openAssetDatabase() {
  if (!('indexedDB' in window)) {
    throw new Error('IndexedDB is not available in this browser.');
  }

  if (!indexedDbPromise) {
    indexedDbPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(CHECKLIST_DB_NAME, CHECKLIST_DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(CHECKLIST_ASSET_STORE)) {
          db.createObjectStore(CHECKLIST_ASSET_STORE, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB.'));
    });
  }

  return indexedDbPromise;
}

async function saveAsset(assetId, dataUrl) {
  appState.assetCache.set(assetId, dataUrl);

  try {
    const db = await openAssetDatabase();
    await runAssetTransaction(db, 'readwrite', (store) => store.put({
      id: assetId,
      dataUrl,
      updatedAt: Date.now(),
    }));
  } catch (error) {
    appState.memoryAssets.set(assetId, dataUrl);
  }
}

async function getAsset(assetId) {
  if (!assetId) return '';
  if (appState.assetCache.has(assetId)) return appState.assetCache.get(assetId);
  if (appState.memoryAssets.has(assetId)) return appState.memoryAssets.get(assetId);

  try {
    const db = await openAssetDatabase();
    const record = await runAssetTransaction(db, 'readonly', (store) => store.get(assetId));
    const dataUrl = record?.dataUrl || '';
    if (dataUrl) {
      appState.assetCache.set(assetId, dataUrl);
    }
    return dataUrl;
  } catch (error) {
    return '';
  }
}

async function deleteAsset(assetId) {
  if (!assetId) return;
  appState.assetCache.delete(assetId);
  appState.memoryAssets.delete(assetId);

  try {
    const db = await openAssetDatabase();
    await runAssetTransaction(db, 'readwrite', (store) => store.delete(assetId));
  } catch (error) {
    // Ignore IndexedDB cleanup failures; in-memory cache is already cleared.
  }
}

function runAssetTransaction(db, mode, callback) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CHECKLIST_ASSET_STORE, mode);
    const store = transaction.objectStore(CHECKLIST_ASSET_STORE);
    const request = callback(store);

    transaction.oncomplete = () => resolve(request?.result);
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed.'));
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted.'));
  });
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const errorMessage = isJson
      ? payload.error || payload.details || 'Request failed.'
      : payload || 'Request failed.';
    throw new Error(errorMessage);
  }

  return payload;
}

function showBanner(message, type = 'info', timeoutMs = 0) {
  window.clearTimeout(appState.bannerTimer);
  dom.banner.textContent = message;
  dom.banner.className = `banner banner--${type} is-visible`;
  dom.banner.classList.remove('hidden');

  if (timeoutMs > 0) {
    appState.bannerTimer = window.setTimeout(() => {
      dom.banner.classList.add('hidden');
      dom.banner.classList.remove('is-visible');
    }, timeoutMs);
  }
}