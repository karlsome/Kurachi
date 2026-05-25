'use strict';

const API_BASE_URL = window.location.origin;

const CHECKLIST_API = {
  templates:    `${API_BASE_URL}/api/check-forms/templates`,
  templateById: `${API_BASE_URL}/api/check-forms/template`,
  names:        `${API_BASE_URL}/api/check-forms/names`,
  translate:    `${API_BASE_URL}/api/check-forms/translate`,
  submit:       `${API_BASE_URL}/api/check-forms/submit`,
  verifyQr:     `${API_BASE_URL}/api/check-forms/verify-qr`,
};

const CHECKLIST_DB_NAME     = 'kurachi-checklist-assets';
const CHECKLIST_DB_VERSION  = 1;
const CHECKLIST_ASSET_STORE = 'assets';
const CHECKLIST_DRAFT_KEY          = 'checkListDraft2';
const CHECKLIST_RECENT_NAMES_PREFIX = 'checkListRecentNames2::';
const MAX_RECENT_NAMES              = 4;

const ANNOTATOR_BRUSH_SIZE = 14;
const ANNOTATOR_COLORS     = ['#ffffff', '#f59e0b', '#ef4444'];

const STRINGS = {
  en: {
    eyebrow:         'PRE-USE INSPECTION',
    stepLabel:       'STEP',
    namePrompt:      'Enter your name to begin',
    namePlaceholder: 'Your name…',
    beginBtn:        'BEGIN INSPECTION',
    ngSub:           'Not Good',
    okSub:           'Confirmed',
    okFlash:         'CONFIRMED',
    ngFlash:         'NOT GOOD',
    complete:        'PRE-USE INSPECTION COMPLETE',
    passed:          'PASSED',
    failed:          'FAILED',
    allClear:        'All checks cleared. Machine is ready to operate.',
    someNg:          (n, t) => `${n} of ${t} check${n > 1 ? 's' : ''} failed — do not operate.`,
    submitBtn:       'SUBMIT RESULTS',
    takePhoto:       'Take photo',
    retakePhoto:     'Retake photo',
    noTemplates:     'No active inspection templates found.',
    loadError:       (e) => `Could not load template: ${e}`,
    translating:     'Translating…',
    backBtn:         'Back',
    startOver:       'Start Over',
    ticketTitle:     'NG Report',
    ticketReasonLabel: 'Reason for failure',
    ticketReasonHint: 'Describe the issue in detail…',
    ticketPhotoLabel: 'Photo evidence',
    ticketPhoto:     'Add photo',
    ticketSave:      'Save ticket',
    ticketCancel:    'Change answer',
    ticketReasonReq: 'A reason is required before saving.',
    ticketPhotoReq:  'At least one photo is required.',
    skipped:         'SKIPPED',
    skipSub:         'Inspection skipped — results recorded for reference only.',
    skipBtn:         'SKIP CHECK',
    skipModalTitle:  'Skip Inspection',
    skipModalBody:   'All checks will be recorded as NG. Provide a reason below.',
    skipReasonLabel: 'Reason for skipping',
    skipReasonHint:  'Explain why this inspection is being skipped…',
    skipConfirm:     'Skip & Record NG',
    skipCancel:      'Cancel',
    skipReasonReq:          'A reason is required to skip.',
    skipQrLabel:            'SUPERVISOR AUTHORISATION',
    skipQrPrompt:           'Hold QR code in front of camera',
    skipQrLooking:          'Verifying…',
    skipQrNotFound:         'User not found — try again',
    skipQrDenied:           'Insufficient permissions',
    skipQrNoCamera:         'Camera unavailable',
    skipQrManualPlaceholder:'Enter QR code value…',
    skipQrManualPrompt:     'Enter the QR code value to verify',
  },
  ja: {
    eyebrow:         '事前点検',
    stepLabel:       'ステップ',
    namePrompt:      '名前を入力して開始してください',
    namePlaceholder: '名前…',
    beginBtn:        '点検を開始',
    ngSub:           '不良',
    okSub:           '確認済',
    okFlash:         '確認済',
    ngFlash:         '不良',
    complete:        '点検完了',
    passed:          '合格',
    failed:          '不合格',
    allClear:        '全項目確認。機械は稼働可能です。',
    someNg:          (n, t) => `${t}項目中${n}項目が不良 — 操作しないでください。`,
    submitBtn:       '結果を送信',
    takePhoto:       '写真を撮る',
    retakePhoto:     '撮り直す',
    noTemplates:     '有効な点検テンプレートが見つかりません。',
    loadError:       (e) => `テンプレートを読み込めません: ${e}`,
    translating:     '翻訳中…',
    backBtn:         '戻る',
    startOver:       'やり直す',
    ticketTitle:     '不合格報告',
    ticketReasonLabel: '不合格の理由',
    ticketReasonHint: '問題を詳しく説明してください…',
    ticketPhotoLabel: '写真証拠',
    ticketPhoto:     '写真を追加',
    ticketSave:      'チケットを保存',
    ticketCancel:    '回答を変更',
    ticketReasonReq: '保存する前に理由が必要です。',
    ticketPhotoReq:  '写真が少なくとも1枚必要です。',
    skipped:         'スキップ済',
    skipSub:         '点検はスキップされました — 記録のみ保存されます。',
    skipBtn:         'スキップ',
    skipModalTitle:  '点検のスキップ',
    skipModalBody:   '全ての項目がNGとして記録されます。',
    skipReasonLabel: 'スキップの理由',
    skipReasonHint:  '点検をスキップする理由を説明してください…',
    skipConfirm:     'スキップして記録',
    skipCancel:      'キャンセル',
    skipReasonReq:          '理由を入力してください。',
    skipQrLabel:            'スーパーバイザー認証',
    skipQrPrompt:           'QRコードをカメラに向けてください',
    skipQrLooking:          '確認中…',
    skipQrNotFound:         'ユーザーが見つかりません',
    skipQrDenied:           '権限が不足しています',
    skipQrNoCamera:         'カメラが利用できません',
    skipQrManualPlaceholder:'QRコードの値を入力…',
    skipQrManualPrompt:     'QRコードの値を入力して確認',
  },
  tl: {
    eyebrow:         'INSPEKSYON BAGO GAMITIN',
    stepLabel:       'HAKBANG',
    namePrompt:      'Ilagay ang iyong pangalan upang magsimula',
    namePlaceholder: 'Iyong pangalan…',
    beginBtn:        'SIMULAN ANG INSPEKSYON',
    ngSub:           'Hindi Maganda',
    okSub:           'Nakumpirma',
    okFlash:         'NAKUMPIRMA',
    ngFlash:         'HINDI MAGANDA',
    complete:        'KUMPLETO NA ANG INSPEKSYON',
    passed:          'PUMASA',
    failed:          'NABIGO',
    allClear:        'Lahat ng pagsusuri ay maayos. Handa na ang makina.',
    someNg:          (n, t) => `${n} sa ${t} pagsusuri ay nabigo — huwag ipaandar.`,
    submitBtn:       'ISUMITE ANG MGA RESULTA',
    takePhoto:       'Kumuha ng larawan',
    retakePhoto:     'Kumuha muli',
    noTemplates:     'Walang aktibong template ng inspeksyon na natagpuan.',
    loadError:       (e) => `Hindi ma-load ang template: ${e}`,
    translating:     'Nagsasalin…',
    backBtn:         'Bumalik',
    startOver:       'Magsimula Muli',
    ticketTitle:     'Ulat ng NG',
    ticketReasonLabel: 'Dahilan ng Pagkabigo',
    ticketReasonHint: 'Ilarawan ang isyu nang detalyado…',
    ticketPhotoLabel: 'Patunay ng Larawan',
    ticketPhoto:     'Magdagdag ng larawan',
    ticketSave:      'I-save ang tiket',
    ticketCancel:    'Baguhin ang sagot',
    ticketReasonReq: 'Kinakailangan ang dahilan bago i-save.',
    ticketPhotoReq:  'Kailangan ng hindi bababa sa isang larawan.',
    skipped:         'NILAKTAWAN',
    skipSub:         'Nilaktawan ang inspeksyon — mga resulta ay naitala para sa sanggunian.',
    skipBtn:         'LAKTAWAN',
    skipModalTitle:  'Laktawan ang Inspeksyon',
    skipModalBody:   'Lahat ng hakbang ay itatala bilang NG.',
    skipReasonLabel: 'Dahilan ng paglaktaw',
    skipReasonHint:  'Ipaliwanag kung bakit nilalaktawan ang inspeksyon…',
    skipConfirm:     'Laktawan at I-record',
    skipCancel:      'Kanselahin',
    skipReasonReq:          'Kinakailangan ang dahilan upang laktawan.',
    skipQrLabel:            'AWTORISASYON NG SUPERBISOR',
    skipQrPrompt:           'Ituro ang QR code sa harap ng camera',
    skipQrLooking:          'Sinusuri…',
    skipQrNotFound:         'Hindi nahanap ang user',
    skipQrDenied:           'Hindi sapat ang pahintulot',
    skipQrNoCamera:         'Hindi available ang camera',
    skipQrManualPlaceholder:'Ilagay ang QR code na halaga…',
    skipQrManualPrompt:     'Ilagay ang QR code na halaga upang i-verify',
  },
};

const state = {
  phase: 'loading',   // 'loading' | 'name' | 'inspection' | 'summary'
  lang: detectDefaultLang(),
  translationCache: {},   // { 'ja': { 'original text': 'translated' }, ... }
  allNames: [],       // fetched from server for autocomplete
  workerName: '',
  factory: '',
  machine: '',
  pageTitle: 'Machine Check',
  steps: [],          // built from template fields
  step: 0,
  results: [],        // { result: 'OK'|'NG', value: any, photoAssetId: string }
  templates: [],      // raw template objects from API (for metadata at submit time)
  animating: false,
  submitting: false,
  pressedBtn: null,
  inputValue: null,       // entered value for the current non-checkbox step
  numpadBuffer: '',       // current digits typed on the custom numpad
  photoAssetId: null,     // IndexedDB asset ID for the current step's photo
  assetCache: new Map(),  // in-memory cache keyed by asset ID
  memoryAssets: new Map(), // fallback when IndexedDB is unavailable
  recentNames: [],
  skipApprovedBy: null,   // QR-verified supervisor name for skipped submissions
};

const dom = {};
let indexedDbPromise = null;

const ticketModal = {
  open: false,
  stepIndex: null,
  reason: '',
  imageAssetIds: [],
  reasonInvalid: false,
  imagesInvalid: false,
};

const annotator = {
  open: false, sourceDataUrl: '', sourceImage: null,
  strokes: [], activeColor: '#ef4444',
  drawing: false, currentStroke: null, pointerId: null, resolve: null,
};

const skipQr = {
  stream:      null,
  rafId:       null,
  manualTimer: null,
  canvas:      null,
  ctx:         null,
  user:        null,
  approved:    false,
};

document.addEventListener('DOMContentLoaded', init);

// ── Language helpers ─────────────────────────────────────────────

function detectDefaultLang() {
  const l = (navigator.language || '').toLowerCase();
  if (l.startsWith('ja')) return 'ja';
  if (l.startsWith('tl') || l.startsWith('fil')) return 'tl';
  return 'en';
}

function S() { return STRINGS[state.lang]; }

function tx(text) {
  if (!text) return text;
  const cache = state.translationCache[state.lang];
  return (cache && cache[text]) ? cache[text] : text;
}

function applyLang(lang) {
  const s = STRINGS[lang];
  // Update switcher active state
  document.querySelectorAll('.lang-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.lang === lang)
  );
  // Static text elements
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  set('name-eyebrow',       s.eyebrow);
  set('inspection-eyebrow', s.eyebrow);
  set('step-eyebrow',       s.stepLabel);
  set('name-prompt',        s.namePrompt);
  set('begin-btn-text',     s.beginBtn);
  set('ng-sub',             s.ngSub);
  set('ok-sub',             s.okSub);
  set('summary-eyebrow',    s.complete);
  set('submit-btn-text',    s.submitBtn);
  set('back-btn-text',      s.backBtn);
  set('start-over-btn-text', s.startOver);
  if (dom.btnSkip) dom.btnSkip.textContent = s.skipBtn;
  const nameInput = document.getElementById('worker-name-input');
  if (nameInput) nameInput.placeholder = s.namePlaceholder;
}

async function setLang(lang) {
  state.lang = lang;
  applyLang(lang);
  if (state.steps.length > 0 && !state.translationCache[lang]) {
    await translateSteps(lang);
  }
  if (state.phase === 'inspection') renderStep();
  if (state.phase === 'name') {
    // Update dynamic name-screen title if template already loaded
    const el = document.getElementById('name-screen-title');
    if (el) el.textContent = tx(state.pageTitle);
  }
}

async function translateSteps(lang) {
  const nameErrorEl = document.getElementById('name-error');
  if (nameErrorEl && state.phase === 'name') {
    nameErrorEl.textContent = S().translating;
    nameErrorEl.classList.remove('hidden');
  }

  const texts = new Set();
  texts.add(state.pageTitle);
  state.steps.forEach(step => {
    if (step.title)       texts.add(step.title);
    if (step.instruction) texts.add(step.instruction);
    step.options.forEach(o => { if (o) texts.add(o); });
  });

  try {
    const res = await fetchJson(CHECKLIST_API.translate, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ texts: [...texts].filter(Boolean), targetLang: lang }),
    });
    state.translationCache[lang] = res.translations || {};
  } catch {
    state.translationCache[lang] = {};
  }

  if (nameErrorEl) nameErrorEl.classList.add('hidden');
}

// ── Entry ────────────────────────────────────────────────────────

async function init() {
  cacheDom();
  bindEvents();
  transitionTo('loading');
  await loadTemplates();
}

// ── DOM cache ────────────────────────────────────────────────────

function cacheDom() {
  dom.loadingScreen    = document.getElementById('loading-screen');
  dom.nameScreen       = document.getElementById('name-screen');
  dom.nameScreenTitle  = document.getElementById('name-screen-title');
  dom.workerNameInput  = document.getElementById('worker-name-input');
  dom.btnBegin         = document.getElementById('btn-begin');
  dom.nameError        = document.getElementById('name-error');
  dom.nameDropdown     = document.getElementById('name-dropdown');

  dom.flash            = document.getElementById('result-flash');
  dom.flashIcon        = document.getElementById('flash-icon');
  dom.flashResultText  = document.getElementById('flash-result-text');
  dom.flashSubText     = document.getElementById('flash-sub-text');

  dom.inspectionView   = document.getElementById('inspection-view');
  dom.inspectionTitle  = document.getElementById('inspection-title');
  dom.stepCounter      = document.getElementById('step-counter');
  dom.progressBar      = document.getElementById('progress-bar');
  dom.stepContent      = document.getElementById('step-content');
  dom.photoWrap        = document.getElementById('photo-wrap');
  dom.stepImg          = document.getElementById('step-img');
  dom.stepTitle        = document.getElementById('step-title');
  dom.stepInstruction  = document.getElementById('step-instruction');
  dom.fieldInputArea   = document.getElementById('field-input-area');
  dom.numpad           = document.getElementById('numpad');
  dom.numpadValue      = document.getElementById('numpad-value');
  dom.numpadUnit       = document.getElementById('numpad-unit');
  dom.numpadRange      = document.getElementById('numpad-range');
  dom.btnOK            = document.getElementById('btn-ok');
  dom.btnNG            = document.getElementById('btn-ng');

  dom.summaryView      = document.getElementById('summary-view');
  dom.summaryWorker    = document.getElementById('summary-worker');
  dom.verdictCard      = document.getElementById('verdict-card');
  dom.verdictIconSvg   = document.getElementById('verdict-icon-svg');
  dom.verdictText      = document.getElementById('verdict-text');
  dom.verdictSub       = document.getElementById('verdict-sub');
  dom.resultsList      = document.getElementById('results-list');
  dom.btnReset         = document.getElementById('btn-reset');
  dom.submitBtnText    = document.getElementById('submit-btn-text');
  dom.summaryError     = document.getElementById('summary-error');
  dom.ticketModal      = document.getElementById('ticket-modal');
  dom.btnBack          = document.getElementById('btn-back');
  dom.btnStartOver     = document.getElementById('btn-start-over');
  dom.annotatorOverlay  = document.getElementById('annotator-overlay');
  dom.photoLightbox     = document.getElementById('photo-lightbox');
  dom.photoLightboxImg  = document.getElementById('photo-lightbox-img');
  dom.btnSkip           = document.getElementById('skip-btn');
  dom.skipModal         = document.getElementById('skip-modal');

  dom.segs = [];
}

// ── Events ───────────────────────────────────────────────────────

function bindEvents() {
  dom.workerNameInput.addEventListener('input', () => {
    const val = dom.workerNameInput.value.trim();
    dom.btnBegin.disabled = val.length === 0;
    dom.btnSkip.disabled  = val.length === 0;
    renderNameDropdown(val);
  });

  dom.workerNameInput.addEventListener('focus', () => {
    renderNameDropdown(dom.workerNameInput.value.trim());
  });

  document.getElementById('lang-switcher').addEventListener('click', (e) => {
    const lang = e.target.closest('[data-lang]')?.dataset.lang;
    if (lang && lang !== state.lang) setLang(lang);
  });

  dom.workerNameInput.addEventListener('blur', () => {
    // Delay so click on option fires first
    setTimeout(() => dom.nameDropdown.classList.add('hidden'), 150);
  });

  dom.workerNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !dom.btnBegin.disabled) { closeNameDropdown(); beginInspection(); }
    if (e.key === 'Escape') closeNameDropdown();
  });

  dom.btnBegin.addEventListener('click', beginInspection);
  dom.btnSkip.addEventListener('click', openSkipModal);
  dom.skipModal.addEventListener('click', handleSkipModalClick);
  dom.skipModal.addEventListener('input', handleSkipModalInput);

  dom.btnOK.addEventListener('pointerdown', () => startPress('OK'));
  dom.btnNG.addEventListener('pointerdown', () => startPress('NG'));

  dom.btnOK.addEventListener('pointerup',     () => endPress('OK', true));
  dom.btnOK.addEventListener('pointercancel', () => endPress('OK', false));
  dom.btnOK.addEventListener('pointerleave',  () => endPress('OK', false));

  dom.btnNG.addEventListener('pointerup',     () => endPress('NG', true));
  dom.btnNG.addEventListener('pointercancel', () => endPress('NG', false));
  dom.btnNG.addEventListener('pointerleave',  () => endPress('NG', false));

  dom.btnReset.addEventListener('click', () => { void handleSubmitRequest(); });

  dom.ticketModal.addEventListener('click', handleTicketModalClick);
  dom.ticketModal.addEventListener('input', handleTicketModalInput);
  dom.btnBack.addEventListener('click', () => { void goBack(); });
  dom.btnStartOver.addEventListener('click', () => {
    if (!window.confirm('Discard all answers and start over?')) return;
    void reset();
  });

  dom.numpad.addEventListener('pointerdown', (e) => {
    const key = e.target.closest('[data-key]')?.dataset.key;
    if (key !== undefined) { e.preventDefault(); handleNumKey(key); }
  });

  dom.annotatorOverlay.addEventListener('click',        handleAnnotatorClick);
  dom.annotatorOverlay.addEventListener('pointerdown',  handleAnnotatorPointerDown);
  dom.annotatorOverlay.addEventListener('pointermove',  handleAnnotatorPointerMove);
  dom.annotatorOverlay.addEventListener('pointerup',    handleAnnotatorPointerUp);
  dom.annotatorOverlay.addEventListener('pointercancel',handleAnnotatorPointerUp);

  document.addEventListener('click', (e) => {
    const thumb = e.target.closest('.photo-thumb') || e.target.closest('img[data-ticket-thumb]');
    if (thumb && thumb.src) { openPhotoLightbox(thumb.src); return; }
    if (e.target === dom.photoLightbox) closePhotoLightbox();
  });
}

// ── Screen transitions ───────────────────────────────────────────

function transitionTo(phase) {
  state.phase = phase;
  dom.loadingScreen.classList.toggle('hidden', phase !== 'loading');
  dom.nameScreen.classList.toggle('hidden',    phase !== 'name');
  dom.inspectionView.classList.toggle('hidden', phase !== 'inspection');
  dom.summaryView.classList.toggle('hidden',   phase !== 'summary');
}

// ── Template loading ─────────────────────────────────────────────

function getSelectedFactoryFromUrl() {
  const p = new URLSearchParams(window.location.search);
  return (p.get('selected') || p.get('factory') || '').trim();
}

function getSelectedMachineFromUrl() {
  const p = new URLSearchParams(window.location.search);
  return (p.get('machine') || '').trim();
}

function getTemplateIdFromUrl() {
  return new URLSearchParams(window.location.search).get('templateId') || '';
}

async function loadTemplates() {
  state.factory = getSelectedFactoryFromUrl();
  state.machine = getSelectedMachineFromUrl();
  const templateId = getTemplateIdFromUrl();

  try {
    // Names and templates are independent — fetch in parallel, names failure is silent
    const templateUrl = templateId
      ? `${CHECKLIST_API.templateById}/${encodeURIComponent(templateId)}`
      : `${CHECKLIST_API.templates}?factory=${encodeURIComponent(state.factory)}&machine=${encodeURIComponent(state.machine)}`;

    const [tplData, nameData] = await Promise.allSettled([
      fetchJson(templateUrl),
      fetchJson(CHECKLIST_API.names),
    ]);

    state.allNames = nameData.status === 'fulfilled' && Array.isArray(nameData.value.names)
      ? nameData.value.names
      : [];

    if (tplData.status === 'rejected') throw tplData.reason;

    const templates = templateId
      ? (tplData.value.template ? [tplData.value.template] : [])
      : (Array.isArray(tplData.value.templates) ? tplData.value.templates : []);

    if (templates.length === 0) {
      applyLang(state.lang);
      showNameError(S().noTemplates);
      transitionTo('name');
      return;
    }

    state.templates = templates;
    state.steps     = buildSteps(templates);
    state.results   = Array(state.steps.length).fill(null);
    state.pageTitle = templates[0].name || 'Machine Check';

    // Apply current language to static UI, then translate dynamic content
    applyLang(state.lang);
    await translateSteps(state.lang);

    dom.nameScreenTitle.textContent = tx(state.pageTitle);
    dom.inspectionTitle.textContent = tx(state.pageTitle);

    restoreRecentNames();

    const savedDraft = loadDraft();
    if (savedDraft && savedDraft.workerName &&
        Array.isArray(savedDraft.results) && savedDraft.results.some(r => r !== null)) {
      // In-progress draft — skip name screen and restore directly
      dom.workerNameInput.value = savedDraft.workerName;
      beginInspection();
    } else {
      transitionTo('name');
      if (savedDraft && savedDraft.workerName) {
        dom.workerNameInput.value = savedDraft.workerName;
        dom.btnBegin.disabled = false;
        dom.btnSkip.disabled  = false;
      }
    }

  } catch (err) {
    applyLang(state.lang);
    showNameError(S().loadError(err.message));
    transitionTo('name');
  }
}

function buildSteps(templates) {
  const steps = [];
  for (const tpl of templates) {
    const fields = Array.isArray(tpl.fields) ? tpl.fields : [];
    for (const field of fields) {
      if (field.type === 'name') continue;
      steps.push({
        templateId:   String(tpl._id || ''),
        templateName: String(tpl.name || ''),
        fieldId:      String(field.id || ''),
        type:         String(field.type || 'checkbox'),
        title:        String(field.label || ''),
        instruction:  String(field.description || ''),
        imageUrl:     String(field.imageURL || ''),
        options:      Array.isArray(field.options) ? field.options : [],
        min:          field.min ?? null,
        max:          field.max ?? null,
        unit:         String(field.unit || ''),
        required:      Boolean(field.required),
        photoRequired: Boolean(field.photoRequired),
      });
    }
  }
  return steps;
}

function showNameError(msg) {
  dom.nameError.textContent = msg;
  dom.nameError.classList.remove('hidden');
}

// ── Name autocomplete ────────────────────────────────────────────

function appendNameOption(name, isRecent) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'name-option' + (isRecent ? ' name-option-recent' : '');
  btn.textContent = name;
  btn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dom.workerNameInput.value = name;
    dom.btnBegin.disabled = false;
    dom.btnSkip.disabled  = false;
    closeNameDropdown();
  });
  dom.nameDropdown.appendChild(btn);
}

function appendDropdownLabel(text) {
  const el = document.createElement('span');
  el.className = 'name-dropdown-label';
  el.textContent = text;
  dom.nameDropdown.appendChild(el);
}

function appendDropdownDivider() {
  const el = document.createElement('div');
  el.className = 'name-dropdown-divider';
  dom.nameDropdown.appendChild(el);
}

function getVisibleRecentNames() {
  const allLower = new Set(state.allNames.map(n => n.toLowerCase()));
  return state.recentNames.filter(n => allLower.has(n.toLowerCase()));
}

function renderNameDropdown(query) {
  if (!state.allNames.length && !state.recentNames.length) {
    dom.nameDropdown.classList.add('hidden');
    return;
  }

  const q = query.toLowerCase();
  dom.nameDropdown.innerHTML = '';

  if (q) {
    const matches = state.allNames.filter(n => n.toLowerCase().includes(q)).slice(0, 50);
    if (matches.length === 0) { dom.nameDropdown.classList.add('hidden'); return; }
    matches.forEach(name => appendNameOption(name, false));
  } else {
    const recents = getVisibleRecentNames();
    if (recents.length > 0) {
      appendDropdownLabel('Recent');
      recents.forEach(name => appendNameOption(name, true));
      if (state.allNames.length > 0) appendDropdownDivider();
    }
    const recentSet = new Set(recents.map(n => n.toLowerCase()));
    const rest = state.allNames.filter(n => !recentSet.has(n.toLowerCase()));
    rest.forEach(name => appendNameOption(name, false));
    if (dom.nameDropdown.childElementCount === 0) { dom.nameDropdown.classList.add('hidden'); return; }
  }

  dom.nameDropdown.classList.remove('hidden');
}

function closeNameDropdown() {
  dom.nameDropdown.classList.add('hidden');
}

// ── Name screen ──────────────────────────────────────────────────

function beginInspection() {
  closeNameDropdown();
  state.workerName = dom.workerNameInput.value.trim();
  if (!state.workerName) return;
  rememberRecentName(state.workerName);

  const draft = loadDraft();
  if (draft && draft.workerName === state.workerName && Array.isArray(draft.results)) {
    state.results = draft.results.slice(0, state.steps.length);
    while (state.results.length < state.steps.length) state.results.push(null);

    // Find the first step that still needs attention
    const firstIncomplete = state.results.findIndex((r, i) => {
      if (r === null) return true;
      const s = state.steps[i];
      const answerForTicket = s.type === 'checkbox' ? r.result : r.value;
      return isTicketNeeded(s, answerForTicket, r.result) && !r.ticket;
    });

    if (firstIncomplete === -1) {
      // All steps fully answered — go straight to summary
      buildProgressBar();
      showSummary();
      return;
    }
    state.step = firstIncomplete;
  } else {
    state.step    = 0;
    state.results = Array(state.steps.length).fill(null);
  }

  state.inputValue   = null;
  state.photoAssetId = null;
  buildProgressBar();
  renderStep();
  transitionTo('inspection');

  const stepResult = state.results[state.step];
  const curStep    = state.steps[state.step];
  if (stepResult && curStep) {
    const answerForTicket = curStep.type === 'checkbox' ? stepResult.result : stepResult.value;
    if (isTicketNeeded(curStep, answerForTicket, stepResult.result) && !stepResult.ticket) {
      openTicketModal(state.step);
    }
  }
}

// ── Skip inspection ──────────────────────────────────────────────

function openSkipModal() {
  const s = S();
  dom.skipModal.innerHTML = `
    <div class="skip-modal-card">
      <h2 class="skip-modal-title">${escapeHtml(s.skipModalTitle)}</h2>
      <p class="skip-modal-body">${escapeHtml(s.skipModalBody)}</p>
      <p class="skip-modal-label">${escapeHtml(s.skipQrLabel)}</p>
      <div class="skip-qr-viewport" id="skip-qr-viewport">
        <video id="skip-qr-video" autoplay playsinline muted></video>
      </div>
      <p id="skip-qr-status" class="skip-qr-status">${escapeHtml(s.skipQrPrompt)}</p>
      <label class="skip-modal-label" for="skip-reason-input" style="margin-top:0.75rem">${escapeHtml(s.skipReasonLabel)}</label>
      <textarea id="skip-reason-input" class="skip-modal-textarea" rows="3"
        placeholder="${escapeHtml(s.skipReasonHint)}"></textarea>
      <p id="skip-reason-error" class="error-msg hidden">${escapeHtml(s.skipReasonReq)}</p>
      <div class="skip-modal-actions">
        <button class="skip-cancel-btn" data-action="skip-cancel" type="button">${escapeHtml(s.skipCancel)}</button>
        <button class="skip-submit-btn" data-action="skip-submit" type="button" disabled>${escapeHtml(s.skipConfirm)}</button>
      </div>
    </div>`;
  dom.skipModal.classList.remove('hidden');
  void startQrScanner();
}

function closeSkipModal() {
  stopQrScanner();
  dom.skipModal.classList.add('hidden');
  dom.skipModal.innerHTML = '';
}

function handleSkipModalInput(e) {
  if (!e.target.matches('#skip-reason-input')) return;
  const err = dom.skipModal.querySelector('#skip-reason-error');
  if (err) err.classList.add('hidden');
  updateSkipSubmit();
}

function handleSkipModalClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  if (btn.dataset.action === 'skip-cancel') { closeSkipModal(); return; }
  if (btn.dataset.action === 'skip-submit') {
    const textarea = dom.skipModal.querySelector('#skip-reason-input');
    const reason   = textarea ? textarea.value.trim() : '';
    if (!reason || !skipQr.approved) return;
    executeSkip(reason);
  }
}

function updateSkipSubmit() {
  const submitBtn = dom.skipModal.querySelector('[data-action="skip-submit"]');
  const textarea  = dom.skipModal.querySelector('#skip-reason-input');
  if (!submitBtn) return;
  submitBtn.disabled = !(skipQr.approved && (textarea?.value.trim().length ?? 0) > 0);
}

// ── QR scanner (skip authorisation) ──────────────────────────────

async function startQrScanner() {
  const viewport = dom.skipModal.querySelector('#skip-qr-viewport');
  const statusEl = dom.skipModal.querySelector('#skip-qr-status');
  if (!viewport) return;

  // getUserMedia requires a secure context (HTTPS or localhost).
  // On HTTP over a local network Chrome sets navigator.mediaDevices = undefined.
  // In that case skip straight to the capture-button fallback.
  const canStream = window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;

  if (canStream) {
    if (statusEl) { statusEl.className = 'skip-qr-status'; statusEl.textContent = S().skipQrPrompt; }
    try {
      skipQr.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      const video = viewport.querySelector('#skip-qr-video');
      if (!video || !dom.skipModal.contains(video)) { stopQrScanner(); return; }
      video.srcObject = skipQr.stream;
      try { await video.play(); } catch { /* already autoplaying */ }
      skipQr.canvas = document.createElement('canvas');
      skipQr.ctx    = skipQr.canvas.getContext('2d');
      startScanLoop(video, statusEl);
      return; // live path — done
    } catch (err) {
      stopQrScanner();
      const msg = err?.name === 'NotAllowedError' ? 'Camera access denied — check browser permissions'
                : err?.name === 'NotFoundError'   ? 'No camera found on this device'
                : S().skipQrNoCamera;
      if (statusEl) { statusEl.className = 'skip-qr-status qr-error'; statusEl.textContent = msg; }
      // fall through to capture overlay
    }
  }

  // Capture-button fallback — works on HTTP; opens native camera on Android/iOS
  addCaptureOverlay(viewport, statusEl, !canStream);
}

function addCaptureOverlay(viewport, statusEl, isHttpFallback) {
  // Remove any stale overlay before adding a fresh one
  viewport.querySelector('.skip-qr-capture-overlay')?.remove();

  const label = document.createElement('label');
  label.className = 'skip-qr-capture-overlay';
  label.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"
         stroke-linecap="round" stroke-linejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
    <span>TAP TO SCAN QR</span>
    <input type="file" accept="image/*" capture="environment" style="position:absolute;opacity:0;inset:0;cursor:pointer">`;
  viewport.appendChild(label);

  if (statusEl && isHttpFallback) {
    statusEl.className = 'skip-qr-status';
    statusEl.textContent = 'Tap camera icon — point at QR code and capture';
  }

  label.querySelector('input[type="file"]').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (statusEl) { statusEl.className = 'skip-qr-status'; statusEl.textContent = S().skipQrLooking; }
    const code = await decodeQrFromFile(file);
    e.target.value = ''; // allow retry
    if (code) {
      label.remove();
      await lookupQrUser(code, statusEl);
    } else {
      if (statusEl) { statusEl.className = 'skip-qr-status qr-error'; statusEl.textContent = 'No QR code detected — tap to try again'; }
    }
  });
}

async function decodeQrFromFile(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1200;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.round(img.width  * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const d = ctx.getImageData(0, 0, w, h);
        const result = window.jsQR?.(d.data, w, h, { inversionAttempts: 'attemptBoth' });
        resolve(result?.data || null);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function startScanLoop(video, statusEl) {
  let lastScan = 0;
  function tick(now) {
    if (!skipQr.stream || skipQr.approved) return;
    skipQr.rafId = requestAnimationFrame(tick);
    if (now - lastScan < 250) return;
    lastScan = now;
    if (video.readyState < 2 || !video.videoWidth) return;
    skipQr.canvas.width  = video.videoWidth;
    skipQr.canvas.height = video.videoHeight;
    skipQr.ctx.drawImage(video, 0, 0);
    const imageData = skipQr.ctx.getImageData(0, 0, skipQr.canvas.width, skipQr.canvas.height);
    const code = window.jsQR?.(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
    if (code?.data) {
      cancelAnimationFrame(skipQr.rafId);
      skipQr.rafId = null;
      void lookupQrUser(code.data, statusEl);
    }
  }
  skipQr.rafId = requestAnimationFrame(tick);
}

async function lookupQrUser(code, statusEl) {
  if (!code) return;
  if (statusEl) { statusEl.className = 'skip-qr-status'; statusEl.textContent = S().skipQrLooking; }
  try {
    const user = await fetchJson(`${CHECKLIST_API.verifyQr}?code=${encodeURIComponent(code)}`);
    if (user.role === 'member') {
      if (statusEl) { statusEl.className = 'skip-qr-status qr-error'; statusEl.textContent = S().skipQrDenied; }
      resumeScanAfterDelay(statusEl);
    } else {
      skipQr.user     = user;
      skipQr.approved = true;
      if (skipQr.stream) { skipQr.stream.getTracks().forEach(t => t.stop()); skipQr.stream = null; }
      if (statusEl) {
        statusEl.className = 'skip-qr-status qr-approved';
        const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username;
        statusEl.textContent = `✓ ${name}  ·  ${user.role}`;
      }
      updateSkipSubmit();
    }
  } catch {
    if (statusEl) { statusEl.className = 'skip-qr-status qr-error'; statusEl.textContent = S().skipQrNotFound; }
    resumeScanAfterDelay(statusEl);
  }
}

function resumeScanAfterDelay(statusEl) {
  setTimeout(() => {
    if (skipQr.approved) return;
    const viewport = dom.skipModal.querySelector('#skip-qr-viewport');
    const video    = dom.skipModal.querySelector('#skip-qr-video');
    if (video && skipQr.stream) {
      if (statusEl) { statusEl.className = 'skip-qr-status'; statusEl.textContent = S().skipQrPrompt; }
      startScanLoop(video, statusEl);
    } else if (viewport) {
      if (statusEl) { statusEl.className = 'skip-qr-status'; }
      addCaptureOverlay(viewport, statusEl, false);
    }
  }, 1800);
}

function stopQrScanner() {
  if (skipQr.rafId)       { cancelAnimationFrame(skipQr.rafId); skipQr.rafId       = null; }
  if (skipQr.manualTimer) { clearTimeout(skipQr.manualTimer);   skipQr.manualTimer = null; }
  if (skipQr.stream)      { skipQr.stream.getTracks().forEach(t => t.stop()); skipQr.stream = null; }
  skipQr.canvas   = null;
  skipQr.ctx      = null;
  skipQr.user     = null;
  skipQr.approved = false;
}

function executeSkip(reason) {
  const name = dom.workerNameInput.value.trim();
  if (!name) return;
  const approvedUser = skipQr.user;
  state.skipApprovedBy = approvedUser
    ? `${approvedUser.firstName || ''} ${approvedUser.lastName || ''}`.trim() || approvedUser.username
    : null;
  closeSkipModal();  // stops QR scanner + clears modal
  closeNameDropdown();

  state.workerName  = name;
  rememberRecentName(name);

  const skipValue = `skipped by ${name}`;
  state.results = state.steps.map(() => ({
    result:      'NG',
    value:       skipValue,
    skipReason:  reason,
    photoAssetId: null,
    ticket:       null,
  }));

  state.step        = 0;
  state.inputValue  = null;
  state.photoAssetId = null;

  buildProgressBar();
  persistDraft();
  showSummary();
}

// ── Progress bar ─────────────────────────────────────────────────

function buildProgressBar() {
  dom.progressBar.innerHTML = '';
  state.steps.forEach(() => {
    const seg = document.createElement('div');
    seg.className = 'seg';
    seg.dataset.state = 'pending';
    dom.progressBar.appendChild(seg);
  });
  dom.segs = Array.from(dom.progressBar.querySelectorAll('.seg'));
}

function updateProgressBar() {
  dom.segs.forEach((seg, i) => {
    const r = state.results[i];
    if      (r && r.result === 'OK') seg.dataset.state = 'ok';
    else if (r && r.result === 'NG') seg.dataset.state = 'ng';
    else if (i === state.step)       seg.dataset.state = 'current';
    else                             seg.dataset.state = 'pending';
  });
}

// ── Step rendering ───────────────────────────────────────────────

function renderStep() {
  const s = state.steps[state.step];
  const num = String(state.step + 1).padStart(2, '0');
  dom.stepCounter.innerHTML = `${num}<span class="total">/${state.steps.length}</span>`;

  dom.photoWrap.classList.toggle('hidden', !s.imageUrl);
  dom.stepImg.alt = tx(s.title);
  if (s.imageUrl) {
    dom.stepImg.classList.add('loading');
    dom.stepImg.onload = () => dom.stepImg.classList.remove('loading');
    dom.stepImg.src = s.imageUrl;
    if (dom.stepImg.complete) dom.stepImg.classList.remove('loading');
  } else {
    dom.stepImg.onload = null;
    dom.stepImg.src = '';
  }
  dom.stepTitle.textContent   = tx(s.title);
  dom.stepInstruction.textContent = tx(s.instruction);
  dom.inspectionTitle.textContent = tx(state.pageTitle);

  state.inputValue   = null;
  state.photoAssetId = null;
  dom.inspectionView.classList.remove('photo-taken');
  renderFieldInput(s);

  const existingResult = state.results[state.step];
  if (existingResult) void restoreStepAnswer(s, existingResult);

  updateProgressBar();
  updateButtonLock();

  dom.stepContent.classList.remove('step-entering');
  void dom.stepContent.offsetWidth;
  dom.stepContent.classList.add('step-entering');
}

// ── Numpad ───────────────────────────────────────────────────────

function showNumpad(step) {
  state.numpadBuffer = '';
  dom.numpadValue.textContent = '—';
  dom.numpadValue.classList.add('empty');
  dom.numpadUnit.textContent = step.unit || '';

  const hasMin = step.min !== null;
  const hasMax = step.max !== null;
  if (hasMin || hasMax) {
    const u = step.unit ? ` ${step.unit}` : '';
    if (hasMin && hasMax)   dom.numpadRange.textContent = `${step.min} – ${step.max}${u}`;
    else if (hasMin)        dom.numpadRange.textContent = `min ${step.min}${u}`;
    else                    dom.numpadRange.textContent = `max ${step.max}${u}`;
    dom.numpadRange.classList.remove('hidden');
  } else {
    dom.numpadRange.classList.add('hidden');
  }

  dom.numpad.classList.remove('hidden');
  dom.inspectionView.classList.add('numpad-active');
}

function hideNumpad() {
  dom.numpad.classList.add('hidden');
  dom.inspectionView.classList.remove('numpad-active');
  state.numpadBuffer = '';
}

function handleNumKey(key) {
  let buf = state.numpadBuffer;

  if (key === 'back') {
    buf = buf.slice(0, -1);
  } else if (key === '.') {
    if (!buf.includes('.') && !buf.includes('-')) buf += '.';
  } else if (key === '-') {
    // Dash allowed once, only after at least one digit, and not if decimal already used
    if (buf.length > 0 && !buf.includes('-') && !buf.includes('.')) buf += '-';
  } else {
    // Prevent leading zeros (e.g. "007") unless decimal or dash already present
    if (buf === '0') buf = key;
    else buf += key;
  }

  state.numpadBuffer = buf;
  const display = buf || '—';
  dom.numpadValue.textContent = display;
  dom.numpadValue.classList.toggle('empty', !buf);

  // Unlock buttons as soon as at least one digit is present
  state.inputValue = /\d/.test(buf) ? buf : null;
  updateButtonLock();
}

// ── Field input rendering ────────────────────────────────────────

function buildPhotoCapture() {
  const wrap = document.createElement('div');
  wrap.className = 'photo-capture';

  const fileInput = document.createElement('input');
  fileInput.type   = 'file';
  fileInput.accept = 'image/*';
  fileInput.setAttribute('capture', 'environment');
  fileInput.style.display = 'none';

  const btn = document.createElement('button');
  btn.type      = 'button';
  btn.className = 'photo-btn';
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
    <span>${S().takePhoto}</span>`;

  const thumb = document.createElement('img');
  thumb.className = 'photo-thumb hidden';
  thumb.alt       = '';

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (state.photoAssetId) await deleteAsset(state.photoAssetId);
    const compressed = await compressImageFile(file, 1600, 0.78);
    const assetId = createAssetId('field');
    await saveAsset(assetId, compressed);
    state.photoAssetId = assetId;
    thumb.src = compressed;
    thumb.classList.remove('hidden');
    btn.classList.add('has-photo');
    btn.querySelector('span').textContent = S().retakePhoto;
    wrap.classList.add('has-photo');
    dom.inspectionView.classList.add('photo-taken');
    updateButtonLock();
  });

  btn.addEventListener('click', () => fileInput.click());

  wrap.appendChild(fileInput);
  wrap.appendChild(thumb);
  wrap.appendChild(btn);
  return wrap;
}

function renderFieldInput(step) {
  hideNumpad();
  dom.fieldInputArea.innerHTML = '';

  if (step.photoRequired) {
    dom.fieldInputArea.appendChild(buildPhotoCapture());
  }

  if (step.type === 'checkbox') return;

  if (step.type === 'text') {
    const input = document.createElement('input');
    input.type        = 'text';
    input.className   = 'field-text-input';
    input.placeholder = step.title ? `Enter ${step.title.toLowerCase()}…` : 'Enter value…';
    input.addEventListener('input', () => {
      state.inputValue = input.value.trim() || null;
      updateButtonLock();
    });
    dom.fieldInputArea.appendChild(input);
    setTimeout(() => input.focus(), 50);
  }

  if (step.type === 'number') {
    showNumpad(step);
    return;
  }

  if (step.type === 'select') {
    const grid = document.createElement('div');
    grid.className = 'field-select-grid';
    step.options.forEach((opt) => {
      const btn = document.createElement('button');
      btn.type         = 'button';
      btn.className    = 'field-select-btn';
      btn.dataset.option = opt;
      btn.textContent  = tx(opt);
      btn.addEventListener('click', () => {
        grid.querySelectorAll('.field-select-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        state.inputValue = opt;
        updateButtonLock();
      });
      grid.appendChild(btn);
    });
    dom.fieldInputArea.appendChild(grid);
  }
}

// ── Answer restoration (back navigation / draft reload) ──────────

async function restoreStepAnswer(step, result) {
  state.inputValue   = result.value ?? null;
  state.photoAssetId = result.photoAssetId || null;

  if (step.type === 'number' && result.value != null) {
    state.numpadBuffer = String(result.value);
    dom.numpadValue.textContent = state.numpadBuffer;
    dom.numpadValue.classList.remove('empty');
  }

  if (step.type === 'select' && result.value != null) {
    dom.fieldInputArea.querySelectorAll('.field-select-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.option === result.value);
    });
  }

  if (step.type === 'text' && result.value != null) {
    const input = dom.fieldInputArea.querySelector('.field-text-input');
    if (input) input.value = String(result.value);
  }

  if (result.photoAssetId) {
    const data = await getAsset(result.photoAssetId);
    if (data) {
      const thumb = dom.fieldInputArea.querySelector('.photo-thumb');
      const btn   = dom.fieldInputArea.querySelector('.photo-btn');
      const wrap  = dom.fieldInputArea.querySelector('.photo-capture');
      if (thumb) { thumb.src = data; thumb.classList.remove('hidden'); }
      if (btn)   { btn.classList.add('has-photo'); const sp = btn.querySelector('span'); if (sp) sp.textContent = S().retakePhoto; }
      if (wrap)  wrap.classList.add('has-photo');
      dom.inspectionView.classList.add('photo-taken');
    }
  }

  updateButtonLock();
}

// ── Button lock ──────────────────────────────────────────────────

function updateButtonLock() {
  const step = state.steps[state.step];
  if (!step) return;
  const needsValue = step.type !== 'checkbox';
  const hasValue   = state.inputValue !== null;
  const needsPhoto = step.photoRequired;
  const hasPhoto   = state.photoAssetId !== null;
  const locked = state.animating
    || ticketModal.open
    || (needsValue && !hasValue)
    || (needsPhoto && !hasPhoto);
  dom.btnOK.disabled = locked;
  dom.btnNG.disabled = locked;
}

// ── Button press interaction ─────────────────────────────────────

function startPress(result) {
  if (state.animating) return;
  const btn = result === 'OK' ? dom.btnOK : dom.btnNG;
  if (btn.disabled) return;
  btn.classList.add('pressed');
  state.pressedBtn = result;
}

function endPress(result, commit) {
  const btn = result === 'OK' ? dom.btnOK : dom.btnNG;
  btn.classList.remove('pressed');
  if (commit && state.pressedBtn === result && !state.animating) {
    state.pressedBtn = null;
    handleResult(result);
  } else {
    state.pressedBtn = null;
  }
}

function handleResult(result) {
  state.animating = true;
  updateButtonLock();

  const step = state.steps[state.step];
  const answerForTicket = step.type === 'checkbox' ? result : state.inputValue;
  showFlash(isTicketNeeded(step, answerForTicket, result) ? 'NG' : result);

  setTimeout(() => {
    state.results[state.step] = { result, value: state.inputValue, photoAssetId: state.photoAssetId, ticket: null };
    persistDraft();
    hideFlash();
    setTimeout(() => {
      const answerForTicket = step.type === 'checkbox' ? result : state.inputValue;
      if (isTicketNeeded(step, answerForTicket, result)) {
        openTicketModal(state.step);
        state.animating = false;
        updateButtonLock();
      } else {
        state.animating = false;
        updateButtonLock();
        advanceStep();
      }
    }, 200);
  }, 600);
}

function advanceStep() {
  if (state.step + 1 >= state.steps.length) {
    showSummary();
    return;
  }
  // If every step ahead is already answered, the user jumped back from the summary
  if (state.results.slice(state.step + 1).every(r => r !== null)) {
    showSummary();
    return;
  }
  state.step++;
  renderStep();
}

async function goBack() {
  if (state.animating || ticketModal.open) return;

  // Discard photo only if it wasn't already committed to this step's result.
  // restoreStepAnswer also sets state.photoAssetId for previously-answered steps,
  // so we must not delete it unless it's a new uncommitted capture.
  const committedPhotoId = state.results[state.step]?.photoAssetId || null;
  if (state.photoAssetId && state.photoAssetId !== committedPhotoId) {
    await deleteAsset(state.photoAssetId);
    state.photoAssetId = null;
  }

  if (state.step === 0) {
    transitionTo('name');
    return;
  }

  // Navigate back — keep the previous step's result so renderStep can restore it
  state.step--;
  persistDraft();
  renderStep();
}

// ── Flash ────────────────────────────────────────────────────────

function showFlash(result) {
  const isOK = result === 'OK';
  dom.flash.classList.remove('hidden', 'ok', 'ng');
  dom.flash.classList.add(isOK ? 'ok' : 'ng');
  dom.flashIcon.innerHTML = isOK
    ? '<circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-5"/>'
    : '<circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>';
  dom.flashResultText.textContent = result;
  dom.flashSubText.textContent    = isOK ? S().okFlash : S().ngFlash;
}

function hideFlash() {
  dom.flash.classList.add('hidden');
}

// ── Summary ──────────────────────────────────────────────────────

function showSummary() {
  transitionTo('summary');

  const allOK     = state.results.every(r => r && r.result === 'OK');
  const isSkipped = state.results.every(r => r && r.skipReason);
  const ngCount   = state.results.filter(r => r && r.result === 'NG').length;

  dom.summaryWorker.textContent = state.workerName || '';

  dom.verdictCard.className = allOK ? 'passed' : isSkipped ? 'skipped' : 'failed';
  dom.verdictIconSvg.innerHTML = allOK
    ? '<circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-5"/>'
    : isSkipped
      ? '<circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/>'
      : '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>';
  dom.verdictText.textContent = allOK ? S().passed : isSkipped ? S().skipped : S().failed;
  dom.verdictSub.textContent  = allOK
    ? S().allClear
    : isSkipped
      ? S().skipSub
      : S().someNg(ngCount, state.steps.length);

  dom.resultsList.innerHTML = '';
  state.steps.forEach((s, i) => {
    const r   = state.results[i];
    const res = r ? r.result : '—';
    const val = r ? r.value  : null;

    const isSkippedRow = !!(r && r.skipReason);
    const rowClass = res === 'OK' ? 'ok' : isSkippedRow ? 'skipped' : 'ng';
    const row = document.createElement('div');
    row.className = `result-row ${rowClass}`;

    const iconPath = res === 'OK'
      ? '<circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-5"/>'
      : isSkippedRow
        ? '<circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/>'
        : '<circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>';

    const verdictLabel = res === 'OK' ? 'OK' : isSkippedRow ? 'NA' : 'NG';

    const valueHtml = (!isSkippedRow && val !== null && s.type !== 'checkbox')
      ? `<p class="result-value">${escapeHtml(String(val))}${s.unit ? ' ' + escapeHtml(s.unit) : ''}</p>`
      : '';

    const ticketHtml = (r && r.ticket) ? `<p class="result-ticket">Ticket saved</p>` : '';

    row.innerHTML = `
      <div class="result-icon">
        <svg viewBox="0 0 24 24">${iconPath}</svg>
      </div>
      <div class="result-info">
        <p class="result-title">${escapeHtml(s.title)}</p>
        ${valueHtml}
        ${ticketHtml}
      </div>
      <span class="result-verdict">${verdictLabel}</span>
    `;
    row.addEventListener('click', () => {
      state.step = i;
      transitionTo('inspection');
      renderStep();
    });

    dom.resultsList.appendChild(row);
  });
}

// ── Submit ───────────────────────────────────────────────────────

async function handleSubmitRequest() {
  if (state.submitting) return;

  for (let i = 0; i < state.steps.length; i++) {
    const step   = state.steps[i];
    const result = state.results[i];
    if (!result || result.skipReason) continue;
    const answerForTicket = step.type === 'checkbox' ? result.result : result.value;
    if (isTicketNeeded(step, answerForTicket, result.result) && !result.ticket) {
      dom.summaryError.textContent = `"${tx(step.title)}" is NG/out-of-range but has no ticket. Reset and re-run the inspection.`;
      dom.summaryError.classList.remove('hidden');
      return;
    }
  }

  state.submitting = true;
  dom.btnReset.disabled = true;
  dom.summaryError.classList.add('hidden');
  dom.submitBtnText.textContent = 'Submitting…';

  try {
    const payload = await buildSubmissionPayload();
    await fetchJson(CHECKLIST_API.submit, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    await reset();
  } catch (err) {
    dom.summaryError.textContent = err.message || 'Submission failed. Please try again.';
    dom.summaryError.classList.remove('hidden');
    dom.submitBtnText.textContent = S().submitBtn;
    dom.btnReset.disabled = false;
  } finally {
    state.submitting = false;
  }
}

async function buildSubmissionPayload() {
  const templateMap = new Map();

  for (let i = 0; i < state.steps.length; i++) {
    const step   = state.steps[i];
    const result = state.results[i];

    if (!templateMap.has(step.templateId)) {
      const tpl = state.templates.find(t => String(t._id) === step.templateId) || {};
      const eqId = resolveEquipmentId(tpl);
      templateMap.set(step.templateId, {
        templateId:        step.templateId,
        templateName:      step.templateName,
        description:       tpl.description || '',
        schedule:          tpl.schedule    || '',
        startDate:         tpl.startDate   || '',
        equipmentId:       eqId,
        加工設備:            state.machine,
        selectedMachine:   state.machine,
        selectedMachineId: eqId,
        workerName:        state.workerName,
        answers:           [],
      });
    }

    const isSkipped = !!(result && result.skipReason);

    const answerValue = isSkipped
      ? (step.type === 'checkbox' ? result.result : result.skipReason)
      : (step.type === 'checkbox'
          ? result.result
          : (step.type === 'number' && !String(result.value || '').includes('-')
              ? parseFloat(result.value)
              : (result.value || '')));

    const displayValue = step.type === 'checkbox'
      ? result.result
      : `${result.value || ''}${step.unit ? ' ' + step.unit : ''}`.trim();

    const answer = {
      id:           step.fieldId,
      label:        step.title,
      description:  step.instruction,
      imageURL:     step.imageUrl,
      type:         isSkipped && step.type === 'number' ? 'text' : step.type,
      required:     step.required,
      locked:       false,
      photoRequired: isSkipped ? false : step.photoRequired,
      options:      step.options,
      min:          step.min,
      max:          step.max,
      unit:         step.unit,
      value:        answerValue,
      displayValue,
      answeredAt:   new Date().toISOString(),
    };

    if (!isSkipped && result.photoAssetId) {
      answer.fieldPhotoData = await getAsset(result.photoAssetId);
    }

    if (isSkipped && step.type === 'checkbox') {
      answer.ticket = {
        saved:      true,
        ticketKey:  `ticket_${step.templateId}_${step.fieldId}`,
        reason:     result.skipReason,
        imagesData: [],
      };
    } else if (!isSkipped && isTicketNeeded(step, answerValue, result.result) && result.ticket) {
      const ticketImagesData = await Promise.all(
        result.ticket.imageAssetIds.map(id => getAsset(id))
      );
      answer.ticket = {
        saved:      true,
        ticketKey:  `ticket_${step.templateId}_${step.fieldId}`,
        reason:     result.ticket.reason,
        imagesData: ticketImagesData.filter(Boolean),
      };
    }

    templateMap.get(step.templateId).answers.push(answer);
  }

  const payload = {
    factory:           state.factory,
    machine:           state.machine,
    submittedAtClient: new Date().toISOString(),
    templates:         [...templateMap.values()],
  };
  if (state.skipApprovedBy) payload.approvedBy = state.skipApprovedBy;
  return payload;
}

function resolveEquipmentId(tpl) {
  if (!tpl || !state.machine) return '';
  const details = Array.isArray(tpl.equipmentDetails) ? tpl.equipmentDetails : [];
  const match = details.find(eq =>
    (eq.name || '').trim().toUpperCase() === state.machine.trim().toUpperCase()
  );
  return match?._id ? String(match._id) : '';
}

function isTicketNeeded(step, answerValue, buttonResult) {
  // Explicit NG button press always requires a ticket on any field type
  if (String(buttonResult || '').toUpperCase() === 'NG') return true;
  if (step.type === 'checkbox') {
    return String(answerValue).toUpperCase() === 'NG';
  }
  if (step.type === 'number' || step.type === 'select') {
    const num = parseFloat(answerValue);
    if (!isNaN(num)) {
      if (step.min !== null && num < step.min) return true;
      if (step.max !== null && num > step.max) return true;
    }
  }
  return false;
}

// ── Ticket modal ─────────────────────────────────────────────────

function openTicketModal(stepIndex) {
  ticketModal.open          = true;
  ticketModal.stepIndex     = stepIndex;
  ticketModal.reason        = '';
  ticketModal.imageAssetIds = [];
  ticketModal.reasonInvalid = false;
  ticketModal.imagesInvalid = false;
  renderTicketModal();
}

function renderTicketModal() {
  if (!ticketModal.open) {
    dom.ticketModal.classList.add('hidden');
    dom.ticketModal.innerHTML = '';
    return;
  }

  const s    = S();
  const step = state.steps[ticketModal.stepIndex];
  const num  = ticketModal.stepIndex + 1;
  const r    = state.results[ticketModal.stepIndex];

  let context = '';
  if (step.type === 'checkbox') {
    context = ' · NG';
  } else if (r && r.value !== null) {
    context = ` · ${r.value}${step.unit ? ' ' + step.unit : ''}`;
    if (step.min !== null || step.max !== null) {
      const lo = step.min !== null ? step.min : '—';
      const hi = step.max !== null ? step.max : '—';
      context += ` (limit ${lo}–${hi}${step.unit ? ' ' + step.unit : ''})`;
    }
  }

  const thumbsHtml = ticketModal.imageAssetIds.map((id, i) => `
    <div class="ticket-thumb">
      <button type="button" class="thumb-del" data-action="ticket-remove-photo" data-index="${i}" aria-label="Remove">×</button>
      <img src="" alt="Ticket photo ${i + 1}" data-ticket-thumb="${escapeHtml(id)}">
    </div>
  `).join('');

  dom.ticketModal.classList.remove('hidden');
  dom.ticketModal.innerHTML = `
    <div class="modal-panel" role="dialog" aria-modal="true">
      <h2 class="modal-title">${escapeHtml(s.ticketTitle)}</h2>
      <p class="modal-subtitle">Step ${num} · ${escapeHtml(tx(step.title))}${escapeHtml(context)}</p>
      <div class="modal-section">
        <label class="modal-label${ticketModal.reasonInvalid ? ' modal-label--danger' : ''}" for="ticket-reason-input">${escapeHtml(s.ticketReasonLabel)}</label>
        <textarea id="ticket-reason-input" class="modal-textarea${ticketModal.reasonInvalid ? ' modal-textarea--invalid' : ''}" placeholder="${escapeHtml(s.ticketReasonHint)}" rows="4">${escapeHtml(ticketModal.reason)}</textarea>
        ${ticketModal.reasonInvalid ? `<div class="modal-validation">${escapeHtml(s.ticketReasonReq)}</div>` : ''}
      </div>
      <div class="modal-section">
        <div class="modal-label${ticketModal.imagesInvalid ? ' modal-label--danger' : ''}">${escapeHtml(s.ticketPhotoLabel)}</div>
        <div class="ticket-thumb-grid">${thumbsHtml}</div>
        ${ticketModal.imagesInvalid ? `<div class="modal-validation">${escapeHtml(s.ticketPhotoReq)}</div>` : ''}
        <button type="button" class="ticket-add-photo-btn" data-action="ticket-add-photo">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          <span>${escapeHtml(s.ticketPhoto)}</span>
        </button>
      </div>
      <button type="button" class="ticket-save-btn" data-action="ticket-save">${escapeHtml(s.ticketSave)}</button>
      <button type="button" class="ticket-cancel-btn" data-action="ticket-cancel">${escapeHtml(s.ticketCancel)}</button>
    </div>
  `;

  dom.ticketModal.querySelectorAll('img[data-ticket-thumb]').forEach(img => {
    void getAsset(img.dataset.ticketThumb).then(url => { if (url) img.src = url; });
  });
}

function saveTicketModal() {
  const reason    = ticketModal.reason.trim();
  const hasImages = ticketModal.imageAssetIds.length > 0;

  if (!reason || !hasImages) {
    ticketModal.reasonInvalid = !reason;
    ticketModal.imagesInvalid = !hasImages;
    renderTicketModal();
    return;
  }

  state.results[ticketModal.stepIndex].ticket = {
    reason,
    imageAssetIds: [...ticketModal.imageAssetIds],
  };

  ticketModal.open          = false;
  ticketModal.stepIndex     = null;
  ticketModal.reason        = '';
  ticketModal.imageAssetIds = [];
  ticketModal.reasonInvalid = false;
  ticketModal.imagesInvalid = false;

  renderTicketModal();
  persistDraft();
  advanceStep();
}

async function cancelTicketModal() {
  for (const id of ticketModal.imageAssetIds) await deleteAsset(id);

  const idx = ticketModal.stepIndex;
  if (idx !== null) {
    state.results[idx] = null;
    persistDraft();
  }

  ticketModal.open          = false;
  ticketModal.stepIndex     = null;
  ticketModal.reason        = '';
  ticketModal.imageAssetIds = [];
  ticketModal.reasonInvalid = false;
  ticketModal.imagesInvalid = false;

  renderTicketModal();
  state.animating = false;
  renderStep();
  updateButtonLock();
}

async function addTicketImage() {
  const file = await pickImageFile();
  if (!file) return;
  const compressed = await compressImageFile(file, 1600, 0.78);
  const annotated  = await openAnnotator(compressed);
  if (!annotated) return;
  const assetId    = createAssetId('ticket');
  await saveAsset(assetId, annotated);
  ticketModal.imageAssetIds.push(assetId);
  ticketModal.imagesInvalid = false;
  renderTicketModal();
}

async function removeTicketImage(index) {
  const assetId = ticketModal.imageAssetIds[index];
  if (!assetId) return;
  ticketModal.imageAssetIds.splice(index, 1);
  await deleteAsset(assetId);
  renderTicketModal();
}

function pickImageFile() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type  = 'file';
    input.accept = 'image/*';
    input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      document.body.removeChild(input);
      resolve(input.files[0] || null);
    }, { once: true });
    input.click();
  });
}

function handleTicketModalClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  switch (btn.dataset.action) {
    case 'ticket-save':         saveTicketModal();                            break;
    case 'ticket-add-photo':    void addTicketImage();                        break;
    case 'ticket-remove-photo': void removeTicketImage(Number(btn.dataset.index)); break;
    case 'ticket-cancel':       void cancelTicketModal();                     break;
  }
}

function handleTicketModalInput(e) {
  if (e.target.id !== 'ticket-reason-input') return;
  ticketModal.reason = e.target.value;
  if (ticketModal.reason.trim() && ticketModal.reasonInvalid) {
    ticketModal.reasonInvalid = false;
    e.target.classList.remove('modal-textarea--invalid');
    const label = dom.ticketModal.querySelector('.modal-label');
    if (label) label.classList.remove('modal-label--danger');
    const validation = dom.ticketModal.querySelector('.modal-validation');
    if (validation) validation.remove();
  }
}

// ── Reset ────────────────────────────────────────────────────────

async function reset() {
  for (const r of state.results) {
    if (r && r.photoAssetId) await deleteAsset(r.photoAssetId);
    if (r && r.ticket) {
      for (const id of (r.ticket.imageAssetIds || [])) await deleteAsset(id);
    }
  }
  if (state.photoAssetId) await deleteAsset(state.photoAssetId);
  for (const id of ticketModal.imageAssetIds) await deleteAsset(id);
  ticketModal.open = false;
  ticketModal.stepIndex = null;
  ticketModal.reason = '';
  ticketModal.imageAssetIds = [];
  ticketModal.reasonInvalid = false;
  ticketModal.imagesInvalid = false;
  renderTicketModal();
  removeDraft();

  state.step         = 0;
  state.results      = Array(state.steps.length).fill(null);
  state.animating    = false;
  state.pressedBtn   = null;
  state.inputValue   = null;
  state.photoAssetId = null;
  dom.workerNameInput.value = '';
  dom.btnBegin.disabled = true;
  dom.btnSkip.disabled  = true;
  dom.nameError.classList.add('hidden');
  closeNameDropdown();
  transitionTo('name');
}

// ── Utilities ────────────────────────────────────────────────────

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json() : await response.text();
  if (!response.ok) {
    throw new Error(isJson ? (payload.error || payload.details || 'Request failed.') : (payload || 'Request failed.'));
  }
  return payload;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Photo lightbox ───────────────────────────────────────────────

function openPhotoLightbox(src) {
  dom.photoLightboxImg.src = src;
  dom.photoLightbox.classList.remove('hidden');
}

function closePhotoLightbox() {
  dom.photoLightbox.classList.add('hidden');
  dom.photoLightboxImg.src = '';
}

// ── Photo annotator ──────────────────────────────────────────────

function openAnnotator(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      annotator.sourceDataUrl  = dataUrl;
      annotator.sourceImage    = img;
      annotator.strokes        = [];
      annotator.activeColor    = '#ef4444';
      annotator.drawing        = false;
      annotator.currentStroke  = null;
      annotator.pointerId      = null;
      annotator.open           = true;
      annotator.resolve        = resolve;
      renderAnnotator();
    };
    img.src = dataUrl;
  });
}

function renderAnnotator() {
  const img = annotator.sourceImage;
  dom.annotatorOverlay.innerHTML = `
    <div class="annotator-stage">
      <div class="annotator-canvas-stack">
        <canvas class="annotator-base-canvas" width="${img.width}" height="${img.height}"></canvas>
        <canvas class="annotator-draw-canvas" width="${img.width}" height="${img.height}"></canvas>
      </div>
    </div>
    <div class="annotator-toolbar">
      <div class="annotator-colors">
        ${ANNOTATOR_COLORS.map(c => `<button class="annotator-color-btn${c === annotator.activeColor ? ' active' : ''}" data-color="${c}" style="background:${c}" type="button"></button>`).join('')}
      </div>
      <button class="annotator-clear-btn" data-action="annotator-clear" type="button">Clear</button>
      <button class="annotator-cancel-btn" data-action="annotator-cancel" type="button">
        <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
      <button class="annotator-confirm-btn" data-action="annotator-confirm" type="button">
        <svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
      </button>
    </div>`;
  dom.annotatorOverlay.classList.remove('hidden');

  // Compute display dimensions so the stack has an explicit pixel size.
  // All child canvases are position:absolute, so the stack needs explicit w/h.
  const stage = dom.annotatorOverlay.querySelector('.annotator-stage');
  const stack = dom.annotatorOverlay.querySelector('.annotator-canvas-stack');
  const sw = stage.clientWidth;
  const sh = stage.clientHeight;
  const ratio = img.width / img.height;
  const w = (sw / sh > ratio) ? Math.round(sh * ratio) : sw;
  const h = (sw / sh > ratio) ? sh : Math.round(sw / ratio);
  stack.style.width  = w + 'px';
  stack.style.height = h + 'px';

  // Draw photo onto base canvas
  const baseCanvas = dom.annotatorOverlay.querySelector('.annotator-base-canvas');
  baseCanvas.getContext('2d').drawImage(img, 0, 0, img.width, img.height);
}

function redrawAnnotatorStrokes() {
  const canvas = dom.annotatorOverlay.querySelector('.annotator-draw-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  annotator.strokes.forEach(s => annotatorPaintStroke(ctx, s));
}

function annotatorPaintStroke(ctx, stroke) {
  if (!stroke.points.length) return;
  ctx.save();
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle   = stroke.color;
  ctx.lineWidth   = stroke.width;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  if (stroke.points.length === 1) {
    ctx.beginPath();
    ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.width / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    ctx.stroke();
  }
  ctx.restore();
}

function annotatorCanvasPoint(canvas, e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (canvas.width  / r.width),
    y: (e.clientY - r.top)  * (canvas.height / r.height),
  };
}

function flattenAnnotation() {
  const out = document.createElement('canvas');
  out.width  = annotator.sourceImage.width;
  out.height = annotator.sourceImage.height;
  const ctx = out.getContext('2d');
  ctx.drawImage(annotator.sourceImage, 0, 0);
  annotator.strokes.forEach(s => annotatorPaintStroke(ctx, s));
  return out.toDataURL('image/jpeg', 0.84);
}

function closeAnnotator(result) {
  annotator.open = false;
  dom.annotatorOverlay.classList.add('hidden');
  dom.annotatorOverlay.innerHTML = '';
  const res = annotator.resolve;
  annotator.resolve = null;
  if (res) res(result);
}

function handleAnnotatorClick(e) {
  const colorBtn = e.target.closest('[data-color]');
  if (colorBtn) {
    annotator.activeColor = colorBtn.dataset.color;
    dom.annotatorOverlay.querySelectorAll('.annotator-color-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.color === annotator.activeColor)
    );
    return;
  }
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  switch (btn.dataset.action) {
    case 'annotator-confirm': closeAnnotator(flattenAnnotation()); break;
    case 'annotator-cancel':  closeAnnotator(null);                break;
    case 'annotator-clear':
      annotator.strokes = [];
      redrawAnnotatorStrokes();
      break;
  }
}

function handleAnnotatorPointerDown(e) {
  const canvas = e.target.closest('.annotator-draw-canvas');
  if (!canvas) return;
  e.preventDefault();
  const pt     = annotatorCanvasPoint(canvas, e);
  const stroke = { color: annotator.activeColor, width: ANNOTATOR_BRUSH_SIZE, points: [pt] };
  annotator.strokes.push(stroke);
  annotator.currentStroke = stroke;
  annotator.drawing       = true;
  annotator.pointerId     = e.pointerId;
  canvas.setPointerCapture?.(e.pointerId);
  annotatorPaintStroke(canvas.getContext('2d'), stroke);
}

function handleAnnotatorPointerMove(e) {
  if (!annotator.drawing || e.pointerId !== annotator.pointerId) return;
  const canvas = dom.annotatorOverlay.querySelector('.annotator-draw-canvas');
  if (!canvas || !annotator.currentStroke) return;
  e.preventDefault();
  const pt   = annotatorCanvasPoint(canvas, e);
  const pts  = annotator.currentStroke.points;
  const last = pts[pts.length - 1];
  if (last && Math.hypot(last.x - pt.x, last.y - pt.y) < 2) return;
  pts.push(pt);
  // Draw only the new segment for performance
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.strokeStyle = annotator.currentStroke.color;
  ctx.lineWidth   = annotator.currentStroke.width;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
  ctx.lineTo(pt.x, pt.y);
  ctx.stroke();
  ctx.restore();
}

function handleAnnotatorPointerUp() {
  annotator.drawing       = false;
  annotator.currentStroke = null;
  annotator.pointerId     = null;
}

// ── Recent names ─────────────────────────────────────────────────

function getRecentNamesKey() {
  return `${CHECKLIST_RECENT_NAMES_PREFIX}${state.factory}`;
}

function restoreRecentNames() {
  try {
    const raw = window.localStorage.getItem(getRecentNamesKey());
    state.recentNames = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(state.recentNames)) state.recentNames = [];
  } catch (e) {
    state.recentNames = [];
  }
}

function persistRecentNames() {
  try {
    window.localStorage.setItem(getRecentNamesKey(), JSON.stringify(state.recentNames));
  } catch (e) {
    console.warn('Failed to persist recent names:', e);
  }
}

function rememberRecentName(name) {
  if (!name) return;
  state.recentNames = [name, ...state.recentNames.filter(n => n !== name)].slice(0, MAX_RECENT_NAMES);
  persistRecentNames();
}

// ── Draft persistence ────────────────────────────────────────────

function getDraftKey() {
  return `${CHECKLIST_DRAFT_KEY}::${state.factory}::${state.machine}`;
}

function persistDraft() {
  try {
    const draft = {
      version: 1,
      factory: state.factory,
      machine: state.machine,
      workerName: state.workerName,
      step: state.step,
      results: state.results.map(r => r
        ? {
            result:       r.result,
            value:        r.value,
            photoAssetId: r.photoAssetId || '',
            ticket:       r.ticket ? { reason: r.ticket.reason, imageAssetIds: [...r.ticket.imageAssetIds] } : null,
          }
        : null),
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(getDraftKey(), JSON.stringify(draft));
  } catch (e) {
    console.warn('Failed to persist checklist draft:', e);
  }
}

function loadDraft() {
  try {
    const raw = window.localStorage.getItem(getDraftKey());
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function removeDraft() {
  window.localStorage.removeItem(getDraftKey());
}

// ── Asset management (IndexedDB + memory fallback) ───────────────

function createAssetId(prefix) {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return `${prefix}_${window.crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function compressImageFile(file, maxWidth, quality) {
  const dataUrl = await readFileAsDataUrl(file);
  const image   = await loadImage(dataUrl);
  const scale   = Math.min(1, maxWidth / image.width);
  const canvas  = document.createElement('canvas');
  canvas.width  = Math.max(1, Math.round(image.width  * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image for compression.'));
    img.src = src;
  });
}

async function openAssetDatabase() {
  if (!('indexedDB' in window)) throw new Error('IndexedDB is not available.');
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
      request.onerror   = () => reject(request.error || new Error('Failed to open IndexedDB.'));
    });
  }
  return indexedDbPromise;
}

async function saveAsset(assetId, dataUrl) {
  state.assetCache.set(assetId, dataUrl);
  try {
    const db = await openAssetDatabase();
    await runAssetTransaction(db, 'readwrite', store => store.put({ id: assetId, dataUrl, updatedAt: Date.now() }));
  } catch {
    state.memoryAssets.set(assetId, dataUrl);
  }
}

async function getAsset(assetId) {
  if (!assetId) return '';
  if (state.assetCache.has(assetId))   return state.assetCache.get(assetId);
  if (state.memoryAssets.has(assetId)) return state.memoryAssets.get(assetId);
  try {
    const db     = await openAssetDatabase();
    const record = await runAssetTransaction(db, 'readonly', store => store.get(assetId));
    const dataUrl = record?.dataUrl || '';
    if (dataUrl) state.assetCache.set(assetId, dataUrl);
    return dataUrl;
  } catch {
    return '';
  }
}

async function deleteAsset(assetId) {
  if (!assetId) return;
  state.assetCache.delete(assetId);
  state.memoryAssets.delete(assetId);
  try {
    const db = await openAssetDatabase();
    await runAssetTransaction(db, 'readwrite', store => store.delete(assetId));
  } catch {
    // ignore cleanup failures
  }
}

function runAssetTransaction(db, mode, callback) {
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(CHECKLIST_ASSET_STORE, mode);
    const store = tx.objectStore(CHECKLIST_ASSET_STORE);
    const req   = callback(store);
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror    = () => reject(tx.error || new Error('IndexedDB transaction failed.'));
    tx.onabort    = () => reject(tx.error || new Error('IndexedDB transaction aborted.'));
  });
}
