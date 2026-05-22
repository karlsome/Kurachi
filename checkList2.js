'use strict';

const API_BASE_URL = window.location.origin;

const CHECKLIST_API = {
  templates:    `${API_BASE_URL}/api/check-forms/templates`,
  templateById: `${API_BASE_URL}/api/check-forms/template`,
  names:        `${API_BASE_URL}/api/check-forms/names`,
  translate:    `${API_BASE_URL}/api/check-forms/translate`,
};

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
  results: [],        // { result: 'OK'|'NG', value: any }
  animating: false,
  pressedBtn: null,
  inputValue: null,     // entered value for the current non-checkbox step
  numpadBuffer: '',     // current digits typed on the custom numpad
  photo: null,          // File object for the current step's required photo
};

const dom = {};

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
  dom.stepImg          = document.getElementById('step-img');
  dom.stepTitle        = document.getElementById('step-title');
  dom.stepInstruction  = document.getElementById('step-instruction');
  dom.fieldInputArea   = document.getElementById('field-input-area');
  dom.numpad           = document.getElementById('numpad');
  dom.numpadValue      = document.getElementById('numpad-value');
  dom.numpadUnit       = document.getElementById('numpad-unit');
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

  dom.segs = [];
}

// ── Events ───────────────────────────────────────────────────────

function bindEvents() {
  dom.workerNameInput.addEventListener('input', () => {
    const val = dom.workerNameInput.value.trim();
    dom.btnBegin.disabled = val.length === 0;
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

  dom.btnOK.addEventListener('pointerdown', () => startPress('OK'));
  dom.btnNG.addEventListener('pointerdown', () => startPress('NG'));

  dom.btnOK.addEventListener('pointerup',     () => endPress('OK', true));
  dom.btnOK.addEventListener('pointercancel', () => endPress('OK', false));
  dom.btnOK.addEventListener('pointerleave',  () => endPress('OK', false));

  dom.btnNG.addEventListener('pointerup',     () => endPress('NG', true));
  dom.btnNG.addEventListener('pointercancel', () => endPress('NG', false));
  dom.btnNG.addEventListener('pointerleave',  () => endPress('NG', false));

  dom.btnReset.addEventListener('click', reset);

  dom.numpad.addEventListener('pointerdown', (e) => {
    const key = e.target.closest('[data-key]')?.dataset.key;
    if (key !== undefined) { e.preventDefault(); handleNumKey(key); }
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

    state.steps     = buildSteps(templates);
    state.results   = Array(state.steps.length).fill(null);
    state.pageTitle = templates[0].name || 'Machine Check';

    // Apply current language to static UI, then translate dynamic content
    applyLang(state.lang);
    await translateSteps(state.lang);

    dom.nameScreenTitle.textContent = tx(state.pageTitle);
    dom.inspectionTitle.textContent = tx(state.pageTitle);

    transitionTo('name');

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

function renderNameDropdown(query) {
  if (!state.allNames.length) { dom.nameDropdown.classList.add('hidden'); return; }

  const q = query.toLowerCase();
  const matches = q
    ? state.allNames.filter(n => n.toLowerCase().includes(q))
    : state.allNames;

  if (matches.length === 0) { dom.nameDropdown.classList.add('hidden'); return; }

  dom.nameDropdown.innerHTML = '';
  matches.slice(0, 20).forEach(name => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'name-option';
    btn.textContent = name;
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      dom.workerNameInput.value = name;
      dom.btnBegin.disabled = false;
      closeNameDropdown();
    });
    dom.nameDropdown.appendChild(btn);
  });
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
  state.step    = 0;
  state.results = Array(state.steps.length).fill(null);
  state.inputValue = null;
  buildProgressBar();
  renderStep();
  transitionTo('inspection');
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

  dom.stepImg.src             = s.imageUrl;
  dom.stepImg.alt             = tx(s.title);
  dom.stepTitle.textContent   = tx(s.title);
  dom.stepInstruction.textContent = tx(s.instruction);
  dom.inspectionTitle.textContent = tx(state.pageTitle);

  state.inputValue = null;
  state.photo      = null;
  renderFieldInput(s);
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
    if (!buf.includes('.')) buf += '.';
  } else {
    // Prevent leading zeros (e.g. "007") unless decimal follows
    if (buf === '0') buf = key;
    else buf += key;
  }

  state.numpadBuffer = buf;
  const display = buf || '—';
  dom.numpadValue.textContent = display;
  dom.numpadValue.classList.toggle('empty', !buf);

  // Only a valid number (not just ".") unlocks the buttons
  const parsed = parseFloat(buf);
  state.inputValue = (buf.length > 0 && !isNaN(parsed)) ? buf : null;
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

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    state.photo = file;
    thumb.src = URL.createObjectURL(file);
    thumb.classList.remove('hidden');
    btn.classList.add('has-photo');
    btn.querySelector('span').textContent = S().retakePhoto;
    updateButtonLock();
  });

  btn.addEventListener('click', () => fileInput.click());

  wrap.appendChild(fileInput);
  wrap.appendChild(btn);
  wrap.appendChild(thumb);
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
      btn.type      = 'button';
      btn.className = 'field-select-btn';
      btn.textContent = tx(opt);
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

// ── Button lock ──────────────────────────────────────────────────

function updateButtonLock() {
  const step = state.steps[state.step];
  if (!step) return;
  const needsValue = step.type !== 'checkbox';
  const hasValue   = state.inputValue !== null;
  const needsPhoto = step.photoRequired;
  const hasPhoto   = state.photo !== null;
  const locked = state.animating
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
  showFlash(result);

  setTimeout(() => {
    state.results[state.step] = { result, value: state.inputValue, photo: state.photo };
    hideFlash();
    setTimeout(() => {
      if (state.step + 1 >= state.steps.length) {
        showSummary();
      } else {
        state.step++;
        renderStep();
      }
      state.animating = false;
      updateButtonLock();
    }, 200);
  }, 600);
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

  const allOK   = state.results.every(r => r && r.result === 'OK');
  const ngCount = state.results.filter(r => r && r.result === 'NG').length;

  dom.summaryWorker.textContent = state.workerName || '';

  dom.verdictCard.className = allOK ? 'passed' : 'failed';
  dom.verdictIconSvg.innerHTML = allOK
    ? '<circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-5"/>'
    : '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>';
  dom.verdictText.textContent = allOK ? S().passed : S().failed;
  dom.verdictSub.textContent  = allOK
    ? S().allClear
    : S().someNg(ngCount, state.steps.length);

  dom.resultsList.innerHTML = '';
  state.steps.forEach((s, i) => {
    const r   = state.results[i];
    const res = r ? r.result : '—';
    const val = r ? r.value  : null;

    const row = document.createElement('div');
    row.className = `result-row ${res === 'OK' ? 'ok' : 'ng'}`;

    const iconPath = res === 'OK'
      ? '<circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-5"/>'
      : '<circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>';

    const valueHtml = (val !== null && s.type !== 'checkbox')
      ? `<p class="result-value">${escapeHtml(String(val))}${s.unit ? ' ' + escapeHtml(s.unit) : ''}</p>`
      : '';

    row.innerHTML = `
      <div class="result-icon">
        <svg viewBox="0 0 24 24">${iconPath}</svg>
      </div>
      <div class="result-info">
        <p class="result-title">${escapeHtml(s.title)}</p>
        ${valueHtml}
      </div>
      <span class="result-verdict">${res}</span>
    `;
    dom.resultsList.appendChild(row);
  });
}

// ── Reset ────────────────────────────────────────────────────────

function reset() {
  state.step       = 0;
  state.results    = Array(state.steps.length).fill(null);
  state.animating  = false;
  state.pressedBtn = null;
  state.inputValue = null;
  dom.workerNameInput.value = '';
  dom.btnBegin.disabled = true;
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
