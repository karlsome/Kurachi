// Kensa interactive (SCNA) - inspection table IT1 / IT2
//
// One page per inspection bench, same shell as SRS interactive / DCP interactive:
//   Scan tab:     Step 0 workers (confirm / select, several allowed) -> Step 1 scan incoming boxes
//   Inspect tab:  12 NG counters per input + 初物 photo + Kensa labels (print / draft / reprint) + submit
//
// Single bench (IT1 / IT2 from the URL), no LH/RH lanes, no work order. The FIRST box scan sets the 品番
// (-> masterDB gives 背番号 and the standard 収容数); every later scan must be the same 品番.
// Inputs: legacy QR "品番,収容数,lot", DCP press box "…,<key>-B###", SRS label "…,<key>-S###" (the last two are
// resolved by GET /api/kensa-inputs/:id, with their remaining pieces). A Kensa label (-K###) is rejected as an
// input, EXCEPT a DRAFT Kensa label of the current 品番, which resumes it (its pieces are carried to the next label).
// Kensa labels get a server-issued ID (POST /api/kensa-boxes). Submit goes to the NEW route
// /submitToKensaDBInteractive (the legacy newKensa iReporter route is untouched).
//
// Tablet link: Kensa interactive.html?filter=SCNA&machine=IT1

//const serverURL = "https://kurachi.onrender.com";
const serverURL = "http://localhost:3000";
//const serverURL = "http://192.168.0.20:3000";
window.serverURL = serverURL;

(function () {
  'use strict';

  var FACTORY = 'SCNA';
  var NG_FIELDS = [];                       // 'counter-1' .. 'counter-12' (same names/order as newKensa iReporter)
  for (var ci = 1; ci <= 12; ci++) NG_FIELDS.push('counter-' + ci);
  var PHOTO_FIRST = 'hatsumonoPic', PHOTO_LAST = 'atomonoPic';   // same ids DCP uses; only 初物 has UI (終物 optional, not asked for)

  // ---------- machine (URL is the source of truth) ----------
  var params = new URLSearchParams(location.search);
  var machineRaw = (params.get('machine') || '').replace(/\+/g, ' ').trim();
  var mm = machineRaw.match(/^IT\s*[-_ ]?\s*(\d+)$/i);
  var MACHINE = mm ? 'IT' + mm[1] : '';
  var DRAFT_KEY = 'kensa_' + FACTORY + '_' + MACHINE;

  // translations: T('key', arg0, arg1) fills {0} {1}; falls back to Japanese, then the key (see "Kensa interactive i18n.js")
  function T(key) {
    var a = Array.prototype.slice.call(arguments, 1);
    var s = typeof _t === 'function' ? _t(key) : key;
    return String(s).replace(/\{(\d+)\}/g, function (m, i) { return a[i] != null ? a[i] : ''; });
  }

  // ---------- state ----------
  function emptyBench() {
    return {
      sebango: '', hinban: '', hinmei: '', model: '', shape: '', imageURL: '',
      cap: 0,               // standard 収容数 from masterDB
      boxes: [],            // inputs [{ id ('' legacy), kind:'legacy'|'dcp'|'srs', qr, legacy, qty (pieces available this session), used, base, lots:[], ng:{counter-n:n} real totals, ngBase:{} totals at the last print }]
      cur: 0,               // index of the input the counters act on
      start: '', end: '', date: '',
      qtyOverride: null,
      printed: [],          // registered Kensa labels [{ kensaId, boxUid, status, qty, measured, mismatch, layoutId, printedOk, at, voided }]
      pendingPrint: null,   // { boxUid, mode, payload, map } registered-but-unconfirmed label request (safe to retry)
      submitUid: '',
      resume: null,         // draft label being finished: { kensaId, qty, lines:[{boxId, srsId, legacy, 品番, lotNumber, good, ng, ngTotal}] }
      bypass: null,         // leader approval to submit without a printed label { leader, at }
      spare: 0, lotNumbers: '', comment: ''
    };
  }
  function benchOpen(b) { return !!b.hinban; }
  var state = {
    workers: [], breaks: [], activeBreakStart: null,
    maint: [], activeMaintStart: null,
    stopCalls: [], activeStopCallStart: null,
    bench: emptyBench()
  };
  var workerNamesData = [];
  var workerSlots = [''];
  var activeSlot = 0;
  var workerConfirmed = false;

  // a missing element never throws (page and script are built in parallel): it is a detached dummy
  var $ = function (id) { return document.getElementById(id) || document.createElement('div'); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toInt(v) { var n = parseInt(v, 10); return isNaN(n) || n < 0 ? 0 : n; }
  function pad(n) { return String(n).padStart(2, '0'); }
  function fmtClock(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function nowHM() { return fmtClock(new Date()); }
  function todayStr() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function workerString() { return state.workers.join(','); }
  function normSku(v) { return String(v || '').trim().toUpperCase(); }

  // ---------- draft ----------
  function save() { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(state)); } catch (e) { /* quota: keep working */ } }
  function load() {
    try {
      var raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      var d = JSON.parse(raw);
      state.workers = Array.isArray(d.workers) ? d.workers.filter(Boolean) : [];
      state.breaks = Array.isArray(d.breaks) ? d.breaks : [];
      state.activeBreakStart = typeof d.activeBreakStart === 'number' ? d.activeBreakStart : null;
      state.maint = Array.isArray(d.maint) ? d.maint : [];
      state.activeMaintStart = typeof d.activeMaintStart === 'number' ? d.activeMaintStart : null;
      state.stopCalls = Array.isArray(d.stopCalls) ? d.stopCalls : [];
      state.activeStopCallStart = typeof d.activeStopCallStart === 'number' ? d.activeStopCallStart : null;
      state.bench = Object.assign(emptyBench(), d.bench || {});
      state.bench.boxes = (state.bench.boxes || []).map(function (b) { b.ng = b.ng || {}; b.ngBase = b.ngBase || {}; b.lots = b.lots || []; if (b.base == null) b.base = b.qty; return b; });
      state.bench.printed = state.bench.printed || [];
    } catch (e) { console.error('Kensa: draft load failed', e); }
  }

  // ---------- small UI helpers ----------
  var toastTimer;
  function toast(msg, ms) {
    var t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, ms || 2600);
  }
  function playAlert() {
    var a = $('alert-sound');
    if (a && a.play) { a.muted = false; a.volume = 1; a.currentTime = 0; var p = a.play(); if (p && p.catch) p.catch(function () { }); }
  }
  function showAlert(text, title) {
    $('alertTitle').textContent = title || T('kensa_err_title');
    $('alertText').textContent = text;
    $('alertModal').classList.add('show');
    document.body.classList.add('flash-red');
    playAlert();
  }
  $('alertOk').onclick = function () {
    $('alertModal').classList.remove('show');
    document.body.classList.remove('flash-red');
    var a = $('alert-sound'); if (a && a.pause) { a.pause(); a.currentTime = 0; }
  };
  function confirmBox(title, text, yesLabel, danger) {
    return new Promise(function (resolve) {
      $('confirmTitle').textContent = title; $('confirmText').textContent = text;
      $('confirmYes').textContent = yesLabel || 'OK';
      $('confirmYes').className = 'btn btn-grow ' + (danger ? 'btn-alert' : 'btn-primary');   // red for destructive actions (reset)
      $('confirmModal').classList.add('show');
      $('confirmYes').onclick = function () { $('confirmModal').classList.remove('show'); resolve(true); };
      $('confirmNo').onclick = function () { $('confirmModal').classList.remove('show'); resolve(false); };
    });
  }
  function postJSON(path, body) {
    return fetch(serverURL + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
  function queryDB(dbName, collectionName, query) {
    return postJSON('/queries', { dbName: dbName, collectionName: collectionName, query: query })
      .then(function (r) { if (!r.ok) throw new Error('queries ' + r.status); return r.json(); });
  }

  // ---------- tabs ----------
  var TAB_INSPECT = 'production';       // the Inspect panel keeps the SRS id panel-production / data-tab="production"
  function switchTab(name) {
    document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === name); });
    $('panel-scan').classList.toggle('active', name === 'scan');
    $('panel-production').classList.toggle('active', name === 'production');
    $('panel-submit').classList.toggle('active', name === 'submit');
    $('panel-maintenance').classList.toggle('active', name === 'maintenance');
    if (name === 'submit') renderSubmit();
  }
  document.querySelectorAll('.tab-btn').forEach(function (b) { b.onclick = function () { switchTab(b.getAttribute('data-tab')); }; });
  function updateBadge() {
    var n = state.bench.boxes.length;
    var b = $('prodBadge'); b.textContent = n; b.style.display = n ? 'flex' : 'none';
  }

  // ============================================================
  //  Step 0 - workers (confirm existing / select several)
  // ============================================================
  function showCard(id) {
    ['step0Modal', 'step1Modal'].forEach(function (c) { $(c).classList.toggle('show', c === id); });
  }
  function showStep0() {
    showCard('step0Modal');
    if (state.workers.length) {
      $('step0CurrentWorkerName').textContent = state.workers.join('\n');
      $('step0ConfirmState').style.display = 'flex';
      $('step0SelectState').style.display = 'none';
    } else {
      workerSlots = [''];
      $('step0ConfirmState').style.display = 'none';
      $('step0SelectState').style.display = 'flex';
      renderWorkerSlots();
    }
  }
  function renderWorkerSlots() {
    var host = $('workerListContainer'); host.innerHTML = '';
    if (!workerSlots.length) workerSlots = [''];
    workerSlots.forEach(function (name, idx) {
      var row = document.createElement('div'); row.className = 'worker-slot';
      var input = document.createElement('input');
      input.type = 'text'; input.readOnly = true; input.className = 'tap-field';
      input.value = name || ''; input.placeholder = '👤 ' + T('kensa_pick_worker') + ' ' + (idx + 1) + '...';
      input.onclick = function () { openWorkerModal(idx); };
      row.appendChild(input);
      if (workerSlots.length > 1) {
        var rm = document.createElement('button');
        rm.type = 'button'; rm.className = 'btn btn-alert'; rm.textContent = '✕'; rm.style.minWidth = '48px';
        rm.onclick = function () { workerSlots.splice(idx, 1); renderWorkerSlots(); };
        row.appendChild(rm);
      }
      host.appendChild(row);
    });
  }
  $('addWorkerBtn').onclick = function () { workerSlots.push(''); renderWorkerSlots(); openWorkerModal(workerSlots.length - 1); };
  $('step0Change').onclick = function () {
    workerSlots = state.workers.slice();
    $('step0ConfirmState').style.display = 'none';
    $('step0SelectState').style.display = 'flex';
    renderWorkerSlots();
  };
  $('step0Yes').onclick = function () { workerConfirmed = true; showStep1(); };
  $('step0Next').onclick = function () {
    var names = [];
    workerSlots.forEach(function (n) { n = (n || '').trim(); if (n && names.indexOf(n) < 0) names.push(n); });
    if (!names.length) return toast(T('kensa_t_select_worker'));
    state.workers = names; save(); workerConfirmed = true; showStep1();
  };

  // Recent workers: same localStorage key / size as DCP interactive, newest first
  var RECENT_KEY = 'recentWorkerNames', MAX_RECENT = 6;
  function getRecent() { try { var r = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(r) ? r : []; } catch (e) { return []; } }
  function setRecent(list) { try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e) { } }
  function addRecent(name) { name = (name || '').trim(); if (!name) return; setRecent([name].concat(getRecent().filter(function (n) { return n !== name; })).slice(0, MAX_RECENT)); }
  function removeRecent(name) { setRecent(getRecent().filter(function (n) { return n !== name; })); }

  function openWorkerModal(idx) {
    activeSlot = idx;
    $('manualWorkerRow').style.display = 'none';
    renderWorkerNames();
    $('workerNameModal').classList.add('show');
  }
  function renderWorkerNames() {
    var host = $('workerNamesContainer'); host.innerHTML = '';
    var others = workerSlots.filter(function (n, i) { return i !== activeSlot && n; }).map(function (n) { return n.toLowerCase(); });
    function mkBtn(name) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'worker-name-btn'; b.textContent = name;
      if (others.indexOf(name.toLowerCase()) >= 0) { b.classList.add('disabled'); b.disabled = true; b.textContent = name + T('kensa_selected_suffix'); }
      else b.onclick = function () { pickWorker(name); };
      return b;
    }
    var recent = getRecent();
    if (recent.length) {
      var h = document.createElement('div'); h.className = 'worker-section-header recent-header'; h.textContent = '⭐ ' + T('kensa_recent_workers');
      host.appendChild(h);
      recent.forEach(function (name) {
        var wrap = document.createElement('div'); wrap.className = 'recent-wrap';
        var x = document.createElement('button'); x.type = 'button'; x.className = 'delete-recent-btn'; x.textContent = '×';
        x.onclick = function (e) { e.stopPropagation(); removeRecent(name); renderWorkerNames(); };
        var b = mkBtn(name); b.classList.add('recent');
        wrap.appendChild(b); wrap.appendChild(x); host.appendChild(wrap);
      });
      var h2 = document.createElement('div'); h2.className = 'worker-section-header recent-header'; h2.textContent = T('kensa_all_workers');
      host.appendChild(h2);
    }
    workerNamesData.forEach(function (name) { host.appendChild(mkBtn(name)); });
  }
  function pickWorker(name) {
    name = (name || '').trim();
    if (!name) return;
    var dup = workerSlots.some(function (n, i) { return i !== activeSlot && n && n.toLowerCase() === name.toLowerCase(); });
    if (dup) return toast('⚠️ ' + T('kensa_t_already_selected', name));
    workerSlots[activeSlot] = name;
    addRecent(name);
    $('workerNameModal').classList.remove('show');
    renderWorkerSlots();
  }
  $('closeWorkerModal').onclick = function () { $('workerNameModal').classList.remove('show'); };
  $('manualEntryBtn').onclick = function () { $('manualWorkerRow').style.display = 'flex'; $('manualWorkerInput').value = ''; $('manualWorkerInput').focus(); };
  $('manualWorkerOk').onclick = function () { pickWorker($('manualWorkerInput').value); };
  $('manualWorkerInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') pickWorker(this.value); });

  // Admin print rule (freyaAdmin2 SCNA > Gatekeeper). Required unless an admin set this machine to optional; any failure keeps it required.
  var printRequired = true;
  async function loadPrintRule() {
    try {
      var r = await fetch(serverURL + '/queries', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dbName: 'Sasaki_Coating_MasterDB', collectionName: 'scnaPrintRuleDB', query: { factory: FACTORY, machine: MACHINE } }) });
      if (!r.ok) return;
      var rows = await r.json();
      if (Array.isArray(rows) && rows[0] && rows[0].printRequired === false) { printRequired = false; $('registerOnlyBtn').style.display = ''; refreshAll(); }
    } catch (e) { console.warn('print rule load failed, keeping required', e); }
  }

  async function loadWorkers() {
    try {
      var r = await fetch(serverURL + '/getWorkerNames?selectedFactory=' + encodeURIComponent(FACTORY));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      workerNamesData = await r.json();
    } catch (e) { console.error('Kensa: worker list failed', e); toast(T('kensa_t_workers_fail')); }
  }

  // ============================================================
  //  Step 1 - scan incoming boxes (inline scanner, no popup)
  // ============================================================
  var scanner = null, scanBusy = false;

  function showStep1() {
    showCard('step1Modal');
    clearStep1Error();
    $('step1Scanner').classList.remove('show');
    $('manualBoxId').value = '';
    $('step1MachineName').textContent = MACHINE;
    renderScanStatus();
  }
  function clearStep1Error() { $('step1ErrorMsg').classList.remove('show'); }
  function step1Error(msg) {
    var box = $('step1ErrorMsg'), p = box.querySelector('p'); if (p) p.textContent = msg; else box.textContent = msg;
    box.classList.add('show');
    playAlert();
    document.body.classList.add('flash-red');
    setTimeout(function () { document.body.classList.remove('flash-red'); }, 1200);
  }
  function stopScanner() {
    $('step1Scanner').classList.remove('show');
    if (!scanner) return Promise.resolve();
    var s = scanner; scanner = null;
    return s.stop().then(function () { return s.clear(); }).catch(function () { });
  }
  $('startStep1Scan').onclick = function () {
    clearStep1Error();
    if (typeof Html5Qrcode === 'undefined') return step1Error(T('kensa_e_scanner_unavail'));
    $('step1Scanner').classList.add('show');
    stopScanner().then(function () {
      $('step1Scanner').classList.add('show');
      scanner = new Html5Qrcode('qrReader');
      return scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 220 }, function (text) {
        stopScanner().then(function () { handleScan(text); });   // one result per scan: stop first so an error is not repeated
      }, function () { });
    }).catch(function (e) {
      $('step1Scanner').classList.remove('show');
      step1Error(T('kensa_e_camera'));
      console.warn('Kensa: camera', e);
    });
  };
  $('manualBoxOk').onclick = function () { handleScan($('manualBoxId').value); };
  $('manualBoxId').addEventListener('keydown', function (e) { if (e.key === 'Enter') handleScan($('manualBoxId').value); });

  // ---------- scan classification ----------
  var DCP_RE = /-B\d{3,}$/i, SRS_RE = /-S\d{3,}$/i, KENSA_RE = /-K\d{3,}$/i;
  function splitQr(text) { return String(text || '').trim().split(/[,\s]+/).map(function (p) { return p.trim(); }).filter(Boolean); }
  // Box QR: DCP "品番,収容数,lot,<key>-B###"  SRS "…,<key>-S###"  legacy "品番,収容数,lot"  (a bare ID is also accepted)
  function parseBoxQr(text) {
    var raw = String(text || '').trim(), parts = splitQr(raw), id = '', kind = '';
    for (var i = parts.length - 1; i >= 0; i--) {
      if (DCP_RE.test(parts[i])) { id = parts[i].toUpperCase(); kind = 'dcp'; parts.splice(i, 1); break; }
      if (SRS_RE.test(parts[i])) { id = parts[i].toUpperCase(); kind = 'srs'; parts.splice(i, 1); break; }
    }
    if (id) return { raw: raw, id: id, kind: kind, hinban: parts[0] || '', qty: parts.length > 1 ? toInt(parts[1]) : null, lot: parts[2] || '' };
    if (parts.length >= 3 && toInt(parts[1]) > 0) return { raw: raw, id: '', kind: 'legacy', hinban: parts[0], qty: toInt(parts[1]), lot: parts.slice(2).join('') };
    return null;
  }
  function kensaIdOf(text) {
    var p = splitQr(text).filter(function (x) { return KENSA_RE.test(x); });
    return p.length ? p[p.length - 1].toUpperCase() : '';
  }


  // Which processes are already done for a scanned QR (press / SRS / Kensa), whatever kind of QR it is
  async function showTrace(text) {
    try {
      var r = await fetch(serverURL + '/api/scna-trace?code=' + encodeURIComponent(text));
      if (!r.ok) return;
      var d = await r.json(), p = d.processes || {};
      function mark(n, x) { return n + (x && x.done ? ' ✓' : x && x.started ? ' …' : ' –'); }
      toast(T('kensa_trace_done') + ': ' + mark(T('kensa_proc_press'), p.press) + ' / ' + mark(T('kensa_proc_srs'), p.srs) + ' / ' + mark(T('kensa_proc_kensa'), p.kensa), 6000);
    } catch (e) { /* trace is informational only */ }
  }

  async function handleScan(text) {
    if (scanBusy) return;
    clearStep1Error();
    var t = String(text || '').trim();
    if (!t) return;
    scanBusy = true;
    showTrace(t);
    try {
      var kid = kensaIdOf(t);
      if (kid) await acceptKensaLabel(kid);
      else {
        var q = parseBoxQr(t);
        if (!q) return step1Error(T('kensa_e_not_label', t));
        await acceptBox(q);
      }
    } finally { scanBusy = false; }
  }

  async function masterByHinban(hinban) {
    var rows = await queryDB('Sasaki_Coating_MasterDB', 'masterDB', { 品番: hinban });
    return (rows || []).filter(function (x) { return x.工場 === FACTORY; })[0] || null;
  }
  // first scan fixes the product for this bench
  function openBench(rec, hinbanFallback) {
    var b = state.bench;
    b.sebango = rec.背番号 || ''; b.hinban = rec.品番 || hinbanFallback; b.hinmei = rec.品名 || rec.name || ''; b.model = rec.モデル || ''; b.shape = rec.形状 || '';
    b.cap = toInt(rec.収容数); b.imageURL = rec.imageURL || ''; b.date = todayStr();
  }
  function refreshAll() { renderBench(); updateBadge(); renderScanStatus(); renderSidebar(); assertMachineState(); }

  // A DRAFT Kensa label of the current 品番 resumes it; every other Kensa label is refused as an input
  async function acceptKensaLabel(id) {
    var box;
    try {
      var r = await fetch(serverURL + '/api/kensa-boxes/' + encodeURIComponent(id));
      if (r.status === 404) return step1Error(T('kensa_e_k_nf', id));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      box = await r.json();
    } catch (e) { return step1Error(T('kensa_e_server', e.message)); }
    var b = state.bench;
    if (box.status !== 'draft') return step1Error(T('kensa_e_k_reject', id, box.status));
    if (benchOpen(b) && normSku(box.品番) !== normSku(b.hinban)) return step1Error(T('kensa_e_k_mismatch', id, box.品番, b.hinban));
    if (b.resume || b.printed.length || b.pendingPrint) return step1Error(T('kensa_e_k_already'));
    if (!benchOpen(b)) {
      var rec;
      try { rec = await masterByHinban(box.品番); } catch (e) { return step1Error(T('kensa_e_master_fail', e.message)); }
      if (!rec) return step1Error(T('kensa_e_master_nf', box.品番));
      openBench(rec, box.品番);
    }
    b.resume = { kensaId: id, qty: box.qtyLabel, lines: (box.lines || []).map(normLine) };
    if (!b.start) b.start = nowHM();
    save(); refreshAll();
    toast('✅ ' + T('kensa_t_resumed', id));
  }
  function normLine(x) {
    var ng = {}; NG_FIELDS.forEach(function (f) { ng[f] = toInt((x.ng || {})[f]); });
    return {
      boxId: x.boxId || null, srsId: x.srsId || null, legacy: !!x.legacy || (!x.boxId && !x.srsId), 品番: x.品番 || state.bench.hinban,
      lotNumber: x.lotNumber || '', carried: true, good: toInt(x.good), ng: ng, ngTotal: NG_FIELDS.reduce(function (a, f) { return a + ng[f]; }, 0)
    };
  }

  async function acceptBox(q) {
    var fail = function (msg) { step1Error(msg); };
    var b = state.bench;

    // 1. exact repeat already open on this tablet (ID for new QRs, raw QR text for legacy ones)
    var dup = b.boxes.some(function (x) { return q.id ? x.id === q.id : (!x.id && x.qr === q.raw); });
    if (dup) return fail(T('kensa_e_box_dup', q.id || q.raw));

    var hinban = q.hinban, qty = q.qty, base = q.qty, lots = q.lot ? [q.lot] : [], kind = q.kind;
    if (q.id) {
      // 2. DCP / SRS input: the server holds the pieces still unused (shared pool)
      var inp;
      try {
        var r = await fetch(serverURL + '/api/kensa-inputs/' + encodeURIComponent(q.id));
        if (r.status === 404) return fail(T('kensa_e_box_nf', q.id));
        if (!r.ok) throw new Error('HTTP ' + r.status);
        inp = await r.json();
      } catch (e) { return fail(T('kensa_e_server', e.message)); }
      if (inp.usable === false || !(inp.remaining > 0)) return fail(T('kensa_e_box_empty', q.id));
      kind = inp.kind === 'srs' ? 'srs' : inp.kind === 'dcp' ? 'dcp' : q.kind;
      hinban = inp.品番 || hinban || '';
      qty = toInt(inp.remaining); base = toInt(inp.base);
      lots = (inp.lotNumbers || []).filter(Boolean);
      if (!lots.length && q.lot) lots = [q.lot];
    }
    if (!hinban) return fail(T('kensa_e_no_hinban'));
    if (!qty) return fail(T('kensa_e_no_qty'));

    // 3. product: the first scan fixes it, later scans must match
    if (!benchOpen(b)) {
      var rec;
      try { rec = await masterByHinban(hinban); } catch (e) { return fail(T('kensa_e_master_fail', e.message)); }
      if (!rec) return fail(T('kensa_e_master_nf', hinban));
      openBench(rec, hinban);
    } else if (normSku(hinban) !== normSku(b.hinban)) {
      return fail(T('kensa_e_box_mismatch', hinban, b.hinban));
    }

    // 4. accept
    if (!b.boxes.length && !b.start) b.start = nowHM();
    b.boxes.push({ id: q.id, kind: kind, qr: q.raw, legacy: !q.id, qty: qty, used: 0, base: base, lots: lots, ng: {}, ngBase: {} });
    b.cur = b.boxes.length - 1;
    b.qtyOverride = null;
    var known = b.lotNumbers ? b.lotNumbers.split(/\s*,\s*/) : [];
    lots.forEach(function (x) { if (known.indexOf(x) < 0) known.push(x); });
    b.lotNumbers = known.join(', ');
    save(); refreshAll();
    toast('✅ ' + T('kensa_t_box_ok', q.id || T('kensa_legacy_short', qty)));
  }

  // ---------- Scan tab: product + scanned inputs (chips, x removes an untouched input) ----------
  function renderScanStatus() {
    var b = state.bench, open = benchOpen(b);
    $('scanProduct').classList.toggle('show', open);
    if (open) {
      $('scanProdName').textContent = b.hinban;
      $('scanProdMeta').textContent = [b.sebango, b.cap ? T('kensa_i_cap') + ' ' + b.cap : '', b.hinmei].filter(Boolean).join(' · ');
    }
    var host = $('scanInputs'); host.innerHTML = '';
    b.boxes.forEach(function (x, i) {
      var c = document.createElement('div'); c.className = 'input-chip'; c.setAttribute('data-idx', i);
      c.innerHTML = '<b>' + esc(boxLabel(x)) + '</b><span class="chip-left">' + T('kensa_chip_left', Math.max(0, x.qty - toInt(x.used))) + '</span>' +
        '<button type="button" class="chip-x" aria-label="' + esc(T('kensa_chip_remove')) + '">×</button>';
      c.querySelector('.chip-x').onclick = function () { removeInput(i); };
      host.appendChild(c);
    });
    if (b.resume) {
      var r = document.createElement('div'); r.className = 'input-chip'; r.innerHTML = '<b>↻ ' + esc(b.resume.kensaId) + '</b><span class="chip-left">' + T('kensa_resume_line', carriedSum(b)) + '</span>';
      host.appendChild(r);
    }
    $('scanInputsEmpty').style.display = b.boxes.length || b.resume ? 'none' : '';
  }
  function removeInput(i) {
    var b = state.bench, x = b.boxes[i]; if (!x) return;
    if (toInt(x.used) > 0 || inNg(x) > 0) return showAlert(T('kensa_e_input_used', boxLabel(x)));
    b.boxes.splice(i, 1);
    b.cur = Math.max(0, Math.min(toInt(b.cur), b.boxes.length - 1));
    var lots = []; b.boxes.forEach(function (y) { (y.lots || []).forEach(function (l) { if (lots.indexOf(l) < 0) lots.push(l); }); });
    b.lotNumbers = lots.join(', ');
    if (!b.boxes.length && !b.resume && !b.printed.length && !b.pendingPrint) {      // nothing left: the product is free again
      var keep = { submitUid: b.submitUid };
      state.bench = Object.assign(emptyBench(), keep);
    }
    save(); refreshAll(); toast(T('kensa_t_input_removed', boxLabel(x)));
  }
  $('doneToProd').onclick = function () { switchTab(TAB_INSPECT); };

  function gotoScan() {
    switchTab('scan');
    if (workerConfirmed) showStep1();   // otherwise Step 0 is still showing
  }

  // ============================================================
  //  Breaks - timer based
  // ============================================================
  var breakInterval = null;
  function toMin(hm) { var p = String(hm || '').split(':'); return p.length < 2 ? null : toInt(p[0]) * 60 + toInt(p[1]); }
  function spanMin(start, end) {
    var s = toMin(start), e = toMin(end);
    if (s == null || e == null) return 0;
    return e >= s ? e - s : e + 1440 - s;   // crossing midnight
  }
  function breakTotal() { return state.breaks.reduce(function (a, b) { return a + spanMin(b.start, b.end); }, 0); }

  function tickBreak() {
    if (!state.activeBreakStart) return;
    var s = Math.max(0, Math.floor((Date.now() - state.activeBreakStart) / 1000));
    $('breakTimerDisplay').textContent = pad(Math.floor(s / 60)) + ':' + pad(s % 60);
  }
  function openBreakOverlay() {
    $('breakOverlay').classList.add('open');
    tickBreak(); clearInterval(breakInterval); breakInterval = setInterval(tickBreak, 1000);
  }
  function startBreak() {
    if (!state.activeBreakStart) state.activeBreakStart = Date.now();
    save(); openBreakOverlay(); assertMachineState();
  }
  function finishBreak() {
    var startEpoch = state.activeBreakStart;
    clearInterval(breakInterval);
    $('breakOverlay').classList.remove('open');
    state.activeBreakStart = null;
    if (startEpoch) {
      state.breaks.push({ start: fmtClock(new Date(startEpoch)), end: nowHM() });
      toast(T('kensa_t_break_recorded'));
    }
    save(); renderBreakList(); updateDerived(); assertMachineState();
  }
  $('breakStartButton').onclick = startBreak;
  $('finishBreakButton').onclick = finishBreak;

  function renderBreakList() {
    var host = $('break-list'); host.innerHTML = '';
    state.breaks.forEach(function (b, i) {
      var row = document.createElement('div'); row.className = 'record-row';
      row.innerHTML = '<span class="record-num">' + (i + 1) + '</span>' +
        '<div class="record-main">' + esc(b.start) + ' – ' + esc(b.end) + '<small>' + T('kensa_min', spanMin(b.start, b.end)) + '</small></div>' +
        '<button type="button" class="btn btn-alert btn-sm">✕</button>';
      row.querySelector('button').onclick = function () { state.breaks.splice(i, 1); save(); renderBreakList(); updateDerived(); };
      host.appendChild(row);
    });
    $('total-break-display').textContent = T('kensa_min', breakTotal());
    var n = state.breaks.length;
    $('break-count-display').textContent = n ? T('kensa_break_count', n) : '';
  }

  // ============================================================
  //  Inspect tab (single bench)
  // ============================================================
  function boxQty(b) { return b.boxes.reduce(function (a, x) { return a + (x.qty || 0); }, 0); }
  function procQty(b) { return b.qtyOverride != null ? b.qtyOverride : boxQty(b); }
  // real NG totals per input are kept for submit; the screen shows only what came after the last print
  function inNg(x) { return NG_FIELDS.reduce(function (a, f) { return a + toInt(x.ng[f]); }, 0); }
  function inNgShown(x, f) { return Math.max(0, toInt(x.ng[f]) - toInt(x.ngBase[f])); }
  function inNgShownTotal(x) { return NG_FIELDS.reduce(function (a, f) { return a + inNgShown(x, f); }, 0); }
  function ngTotal(b) { return b.boxes.reduce(function (a, x) { return a + inNg(x); }, 0); }
  function ngShownTotal(b) { return b.boxes.reduce(function (a, x) { return a + inNgShownTotal(x); }, 0); }
  function curBox(b) { return b.boxes[Math.min(toInt(b.cur), b.boxes.length - 1)]; }
  function boxLabel(x) { return x.id || (x.lots[0] ? T('kensa_legacy') + ' ' + x.lots[0] : T('kensa_legacy')); }
  function goodQty(b) { return Math.max(0, procQty(b) - ngTotal(b)); }
  function ngLabel(i) { return i < 11 ? String(i + 1) : T('kensa_ng_other'); }
  function cycleSec(b) {
    var work = spanMin(b.start, b.end) - breakTotal() - maintTotal();
    var q = procQty(b);
    return work > 0 && q > 0 ? Math.round((work * 60 / q) * 10) / 10 : 0;
  }

  // static page (Kensa interactive.html): render() fills the existing elements, handlers are bound once in bindStatic()
  function hasWork(b) { return benchOpen(b) && (b.boxes.length > 0 || !!b.resume); }
  function setVal(id, v) { var e = $(id); if (document.activeElement !== e) e.value = v; }

  function renderBench() {
    var b = state.bench, has = hasWork(b);
    renderPhoto();
    $('inspEmpty').style.display = has ? 'none' : '';
    $('inspBody').classList.toggle('show', has);
    if (!has) return;
    $('inspProdName').textContent = b.hinban;
    $('inspProdMeta').textContent = [b.sebango, b.cap ? T('kensa_i_cap') + ' ' + b.cap : '', b.lotNumbers].filter(Boolean).join(' · ');
    var ci = Math.min(toInt(b.cur), b.boxes.length - 1), chips = $('inspChips'); chips.innerHTML = '';
    b.boxes.forEach(function (x, i) {
      var c = document.createElement('button'); c.type = 'button'; c.className = 'chip' + (i === ci ? ' cur' : '');
      c.textContent = boxLabel(x) + ' · ' + T('kensa_chip_left', Math.max(0, x.qty - toInt(x.used))) + (inNg(x) ? ' · NG ' + inNg(x) : '');
      c.onclick = function () { b.cur = i; save(); renderBench(); };
      chips.appendChild(c);
    });
    var cb = b.boxes[ci];
    $('inspCurInfo').textContent = cb ? T('kensa_chip_left', Math.max(0, cb.qty - toInt(cb.used))) + (cb.legacy ? ' · ' + T('kensa_kind_legacy') : ' · ' + T(cb.kind === 'srs' ? 'kensa_kind_srs' : 'kensa_kind_dcp')) : '';
    setVal('inspStart', b.start); setVal('inspEnd', b.end); setVal('inspLot', b.lotNumbers); setVal('inspSpare', toInt(b.spare) || ''); setVal('inspComment', b.comment);
    renderCounters(); renderLabels(); updateDerived();
  }
  function renderCounters() {
    var b = state.bench, cb = b.boxes.length ? curBox(b) : null;
    $('counterInputName').textContent = cb ? boxLabel(cb) : '--';
    NG_FIELDS.forEach(function (f) { $(f).value = cb ? inNgShown(cb, f) : 0; });
  }
  function updateDerived() {
    var b = state.bench;
    $('totProc').textContent = procQty(b); $('totGood').textContent = goodQty(b);
    $('totNg').textContent = ngShownTotal(b); $('totNgReal').textContent = ngTotal(b);
    var c = cycleSec(b);
    $('inspCycle').textContent = c ? T('kensa_cycle', c, breakTotal() + maintTotal()) : '';
    renderSubmit();
  }

  // Submit tab: summary of what will be sent + the same checks validate() makes, shown live
  function renderSubmit() {
    var b = state.bench, has = hasWork(b);
    $('subEmpty').style.display = has ? 'none' : '';
    $('subBody').style.display = has ? 'block' : 'none';
    if (!has) return;
    $('subProdName').textContent = b.hinban;
    $('subProdMeta').textContent = [b.sebango, b.lotNumbers].filter(Boolean).join(' · ');
    $('subProc').textContent = procQty(b); $('subGood').textContent = goodQty(b); $('subNg').textContent = ngTotal(b);
    $('subLabels').textContent = livePrinted(b).length;
    var c = cycleSec(b);
    $('subCycle').textContent = c ? T('kensa_cycle', c, breakTotal() + maintTotal()) : '';
    var host = $('subChecks'), miss = validate();
    host.innerHTML = '';
    var row = document.createElement('div'); row.className = 'lbl-row';
    row.textContent = miss.length ? '⚠ ' + T('kensa_v_head') + ' ' + miss.join(' / ') : '✅ ' + T('kensa_sub_ok');
    host.appendChild(row);
    if (printRequired && !livePrinted(b).length && !miss.length) {
      var w = document.createElement('div'); w.className = 'lbl-row'; w.textContent = 'ℹ ' + T('kensa_ld_nolabel');
      host.appendChild(w);
    }
  }

  function bindStatic() {
    var b = function () { return state.bench; };
    $('goScanBtn').onclick = gotoScan;
    $('subGoScanBtn').onclick = gotoScan;
    $('resetBtn').onclick = resetBench;
    $('scanResetBtn').onclick = resetBench;
    $('submitBtn').onclick = submitBench;
    $('printCompleteBtn').onclick = function () { printLabel('complete'); };
    $('printDraftBtn').onclick = function () { printLabel('draft'); };
    $('registerOnlyBtn').onclick = function () { registerOnly(); };
    $('inspEndNow').onclick = function () { b().end = nowHM(); save(); $('inspEnd').value = b().end; updateDerived(); };
    [['inspStart', 'start'], ['inspEnd', 'end'], ['inspLot', 'lotNumbers'], ['inspComment', 'comment']].forEach(function (p) {
      $(p[0]).oninput = function () { b()[p[1]] = this.value; save(); updateDerived(); if (p[1] === 'lotNumbers') renderSidebar(); };
    });
    $('inspSpare').oninput = function () { b().spare = toInt(this.value); save(); };
    document.querySelectorAll('[data-ng]').forEach(function (btn) {
      btn.onclick = function () {
        var bb = b(); if (!bb.boxes.length) return;
        var f = NG_FIELDS[+btn.getAttribute('data-ng') - 1], cb = curBox(bb), d = btn.classList.contains('minus-btn') ? -1 : 1;
        cb.ng[f] = toInt(cb.ngBase[f]) + Math.max(0, inNgShown(cb, f) + d);
        $(f).value = inNgShown(cb, f);
        save(); updateDerived(); renderChipsOnly();
      };
    });
    $('hatsumonoButton').onclick = function () { $('hatsumonoFileInput').click(); };
    $('hatsumonoFileInput').onchange = function () {
      var inp = this; if (!inp.files || !inp.files[0]) return;
      compressImageFile(inp.files[0]).then(function (blob) { return setPhoto(PHOTO_FIRST, blob); })
        .then(function () { renderPhoto(); toast(T('kensa_t_photo_ok')); })
        .catch(function (e) { console.warn('Kensa: photo', e); toast(T('kensa_t_photo_fail')); });
      inp.value = '';
    };
  }
  function renderChipsOnly() {      // keep the NG badge on the chips in step with the counters
    var b = state.bench, chips = $('inspChips').children;
    for (var i = 0; i < chips.length && i < b.boxes.length; i++) {
      var x = b.boxes[i];
      chips[i].textContent = boxLabel(x) + ' · ' + T('kensa_chip_left', Math.max(0, x.qty - toInt(x.used))) + (inNg(x) ? ' · NG ' + inNg(x) : '');
    }
  }

  // ============================================================
  //  初物 (first piece) / 終物 (last piece) photos - IndexedDB, same idea as DCP interactive
  //  (kept out of localStorage; re-taking a photo overwrites it). 初物 is required to submit, 終物 is optional.
  // ============================================================
  var photoBlobs = {}, photoUrls = {}, photoDB = null;
  function photoOpen() {
    if (photoDB) return Promise.resolve(photoDB);
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') return reject(new Error('no indexedDB'));
      var req = indexedDB.open('kensaPhotoDB_' + MACHINE, 1);
      req.onupgradeneeded = function (e) { e.target.result.createObjectStore('photos', { keyPath: 'id' }); };
      req.onsuccess = function (e) { photoDB = e.target.result; resolve(photoDB); };
      req.onerror = function (e) { reject(e.target.error); };
    });
  }
  function idb(mode, fn) {
    return photoOpen().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction('photos', mode), rq = fn(tx.objectStore('photos'));
        tx.oncomplete = function () { res(rq && rq.result); };
        tx.onerror = function (e) { rej(e.target.error); };
      });
    });
  }
  function photoUrl(id) {
    if (!photoBlobs[id]) return '';
    if (!photoUrls[id]) photoUrls[id] = URL.createObjectURL(photoBlobs[id]);
    return photoUrls[id];
  }
  function setPhoto(id, blob) {
    if (photoUrls[id]) { try { URL.revokeObjectURL(photoUrls[id]); } catch (e) { } delete photoUrls[id]; }
    photoBlobs[id] = blob;
    return idb('readwrite', function (s) { return s.put({ id: id, blob: blob, timestamp: new Date().toISOString() }); }).catch(function (e) { console.warn('Kensa: photo not persisted', e); });
  }
  function clearPhotos() {
    [PHOTO_FIRST, PHOTO_LAST].forEach(function (id) { if (photoUrls[id]) { try { URL.revokeObjectURL(photoUrls[id]); } catch (e) { } } });
    photoBlobs = {}; photoUrls = {};
    return idb('readwrite', function (s) { return s.clear(); }).catch(function () { });
  }
  function loadPhotos() {
    return idb('readonly', function (s) { return s.getAll(); }).then(function (recs) {
      (recs || []).forEach(function (r) { if (r && r.blob) photoBlobs[r.id] = r.blob; });
    }).catch(function () { });
  }
  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onloadend = function () { resolve(String(fr.result).split(',')[1]); };
      fr.onerror = reject; fr.readAsDataURL(blob);
    });
  }
  // shrink a camera photo to <= 1 MB JPEG (max 2048px), like DCP's compressBlobToLimit
  function compressImageFile(file, maxBytes) {
    maxBytes = maxBytes || 1024 * 1024;
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('image')); };
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.width, h = img.height;
        if (w > 2048) { h = Math.round(h * 2048 / w); w = 2048; }
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        var qs = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3], i = 0;
        (function next() {
          c.toBlob(function (blob) {
            if (!blob) return reject(new Error('toBlob'));
            if (blob.size <= maxBytes || i >= qs.length - 1) return resolve(blob);
            i++; next();
          }, 'image/jpeg', qs[i]);
        })();
      };
      img.src = url;
    });
  }
  function renderPhoto() {
    var has = !!photoBlobs[PHOTO_FIRST], img = $('hatsumonoPic'), u = photoUrl(PHOTO_FIRST);
    $('hatsumonoLabel').textContent = has ? 'TRUE' : 'FALSE';
    var ind = $('hatsumonoStatusIndicator'); ind.textContent = has ? 'TRUE' : 'FALSE'; ind.classList.toggle('ok', has);
    if (u) { img.src = u; img.style.display = 'block'; } else { img.removeAttribute('src'); img.style.display = 'none'; }
    $('hatsumonoButton').textContent = T(has ? 'kensa_hatsumono_retake' : 'kensa_hatsumono_btn');
    if ($('subChecks')) renderSubmit();
  }

  // ============================================================
  //  Kensa labels - register a Kensa ID on the server, then print through the mini-PC print server (:5001)
  // ============================================================
  var LABEL_PROCESS = 'kensa';
  var ipURL = 'https://script.google.com/macros/s/AKfycbyC6-KiT3xwGiahhzhB-L-OOL8ufG0WqnT5mjEelGBKGnbiqVAS6qjT78FlzBUHqTn3Gg/exec';
  var printerIP = '';
  var printing = false;

  function newUid(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
  function ngObjShown(x) { var o = {}; NG_FIELDS.forEach(function (f) { o[f] = inNgShown(x, f); }); return o; }
  function sumNg(o) { return NG_FIELDS.reduce(function (a, f) { return a + toInt((o || {})[f]); }, 0); }
  function carriedSum(b) { return b.resume ? b.resume.lines.reduce(function (a, x) { return a + x.good; }, 0) : 0; }
  function freeGood(x) { return Math.max(0, x.qty - toInt(x.used) - inNgShownTotal(x)); }

  function renderLabels() {
    var b = state.bench, host = $('lblList'); host.innerHTML = '';
    if (b.resume) {
      var r = document.createElement('div'); r.className = 'lbl-row';
      r.innerHTML = '<span class="lbl-tag draft">↻</span><b>' + esc(b.resume.kensaId) + '</b><span>' + T('kensa_resume_line', carriedSum(b)) + '</span>';
      host.appendChild(r);
    }
    var shown = 0;
    b.printed.forEach(function (e, i) {
      var row = document.createElement('div'); row.className = 'lbl-row';
      if (e.voided) {
        row.innerHTML = '<b>' + esc(e.kensaId) + '</b><span class="lbl-tag bad">' + T('kensa_lbl_voided') + '</span>';
      } else {
        row.innerHTML = '<b>' + esc(e.kensaId) + '</b><span class="lbl-tag ' + (e.status === 'draft' ? 'draft' : 'ok') + '">' +
          T(e.status === 'draft' ? 'kensa_lbl_draft' : 'kensa_lbl_complete') + '</span><span>' + e.qty + 'pcs</span>' +
          (e.printedOk ? '<span class="lbl-ok">✓</span>' : e.noPrint ? '<span class="lbl-tag draft">' + T('kensa_lbl_idonly') + '</span>' : '<span class="lbl-tag bad">' + T('kensa_lbl_notprinted') + '</span>') +
          '<button type="button" class="btn btn-secondary btn-sm">' + T('kensa_lbl_reprint') + '</button>';
        row.querySelector('button').onclick = function () { reprintLabel(i); };
        shown++;
      }
      host.appendChild(row);
    });
    if (!shown && !b.resume) { var n = document.createElement('div'); n.className = 'lbl-none'; n.textContent = T('kensa_lbl_none'); host.appendChild(n); }
  }
  function livePrinted(b) { return b.printed.filter(function (e) { return !e.voided; }); }

  async function fetchPrintLayouts(sebango) {
    var r = await fetch(serverURL + '/api/scna-label-layouts/for-item?sebanggo=' + encodeURIComponent(sebango) + '&process=' + LABEL_PROCESS);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var body = await r.json();
    return Array.isArray(body.layouts) ? body.layouts : [];
  }
  async function resolvePrinterIP() {
    if (printerIP) return printerIP;
    var r = await fetch(ipURL + '?filter=' + encodeURIComponent(MACHINE));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var ip = (await r.text()).replace(/"/g, '').trim().split(',')[0].trim();
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) throw new Error(MACHINE + ': ' + (ip || '?'));
    return (printerIP = ip);
  }

  // small modal built on the page's own .modal-overlay/.modal styles; resolves with the clicked data-r value
  function pickDialog(title, bodyHtml, buttons) {
    return new Promise(function (resolve) {
      var ov = document.createElement('div'); ov.className = 'modal-overlay show'; ov.style.zIndex = 10050;
      ov.innerHTML = '<div class="modal" style="max-width:520px"><h3>' + esc(title) + '</h3><div data-body>' + bodyHtml + '</div><div class="actions">' +
        buttons.map(function (b) { return '<button type="button" class="btn ' + (b.cls || 'btn-secondary') + ' btn-grow" data-r="' + b.r + '">' + esc(b.label) + '</button>'; }).join('') + '</div></div>';
      document.body.appendChild(ov);
      ov.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-r]'); if (!b) return;
        var r = b.getAttribute('data-r');
        if (ov._check && r === 'ok' && !ov._check()) return;
        ov.remove(); resolve(r);
      });
      pickDialog.last = ov;
    });
  }
  async function chooseLayout(layouts) {
    var r = await pickDialog(T('kensa_pick_layout'), layouts.map(function (x, i) {
      return '<button type="button" class="btn btn-primary btn-full" style="margin-bottom:8px" data-r="L' + i + '">' + esc(x.name) + '</button>';
    }).join(''), [{ r: 'x', label: T('cancel') }]);
    return r && r[0] === 'L' ? layouts[+r.slice(1)].layoutId : null;
  }

  // allocation dialog (static #printModal) -> { qtyLabel, qtyMeasured, lines, map } | null
  function allocDialog(b, mode) {
    var cap = toInt(b.cap), cs = carriedSum(b), left = mode === 'complete' ? Math.max(0, cap - cs) : Infinity, def = [];
    b.boxes.forEach(function (x, i) { var g = Math.min(freeGood(x), left); def[i] = g; left -= g; });
    $('printTitle').textContent = mode === 'complete' ? T('kensa_pd_title_c', cap) : T('kensa_pd_title_d');
    $('printInfo').textContent = b.resume ? T('kensa_resume_line', cs) : '';
    $('printQtyWrap').style.display = 'none';
    $('printAlloc').innerHTML = b.boxes.map(function (x, i) {
      var ng = inNgShownTotal(x);
      return '<div class="field"><label>' + esc(boxLabel(x)) + ' · ' + T('kensa_pd_avail', freeGood(x)) + (ng ? ' · ' + T('kensa_pd_ng_note', ng) : '') + '</label>' +
        '<input type="number" inputmode="numeric" min="0" max="' + freeGood(x) + '" data-pa="' + i + '" value="' + def[i] + '"></div>';
    }).join('');
    var inputs = $('printAlloc').querySelectorAll('[data-pa]');
    var sum = function () { return cs + Array.prototype.reduce.call(inputs, function (a, e) { return a + toInt(e.value); }, 0); };
    var refresh = function () { $('printSum').textContent = T('kensa_pd_sum', sum(), mode === 'complete' ? cap : sum()); };
    var err = function (msg) { var e = $('printError'), p = e.querySelector('p'); if (p) p.textContent = msg || ''; e.classList.toggle('show', !!msg); };
    inputs.forEach(function (e) { e.oninput = function () { err(''); refresh(); }; }); refresh(); err('');
    $('printModal').classList.add('show');
    return new Promise(function (resolve) {
      var close = function () { $('printModal').classList.remove('show'); };
      $('printCancel').onclick = function () { close(); resolve(null); };
      $('printOk').onclick = async function () {
        var bad = '';
        inputs.forEach(function (e) { var i = +e.getAttribute('data-pa'); if (toInt(e.value) > freeGood(b.boxes[i])) bad = T('kensa_pd_over_input', boxLabel(b.boxes[i])); });
        if (!bad && sum() <= 0) bad = T('kensa_pd_zero');
        if (!bad && mode === 'complete' && sum() > cap) bad = T('kensa_pd_over_cap', cap);
        if (bad) return err(bad);
        var good = Array.prototype.map.call(inputs, function (e) { return toInt(e.value); }), total = sum();
        close();
        if (mode === 'complete' && total !== cap && !(await confirmBox(T('kensa_lbl_print_complete'), T('kensa_pd_mismatch', total, cap), T('kensa_pd_print')))) return resolve(null);
        var lines = [], map = [];
        if (b.resume) b.resume.lines.forEach(function (x) { lines.push(Object.assign({}, x, { carried: true })); map.push(-1); });
        b.boxes.forEach(function (x, i) {
          var ng = ngObjShown(x), nt = sumNg(ng);
          if (!good[i] && !nt) return;
          lines.push({
            boxId: x.kind === 'dcp' ? x.id : null, srsId: x.kind === 'srs' ? x.id : null, legacy: !x.id, 品番: b.hinban,
            lotNumber: (x.lots || []).join(','), lotNumbers: x.lots || [], carried: false, good: good[i], ng: ng, ngTotal: nt
          });
          map.push(i);
        });
        resolve({ qtyLabel: mode === 'complete' ? cap : total, qtyMeasured: total, lines: lines, map: map });
      };
    });
  }

  async function sendPrint(b, entry, ip) {
    var ov = { qr_1: '{品番},' + entry.qty + ',{lotNumber},' + entry.kensaId, box_id: entry.kensaId, text_9: '{lotNumber} - ' + entry.kensaId, text_6: String(entry.qty) };
    if (entry.status === 'draft') ov.text_10 = '仮';
    var prm = { filename: b.sebango, qty: '1', process: LABEL_PROCESS, overrides: JSON.stringify(ov) };
    if (entry.layoutId) prm.layoutId = entry.layoutId;
    var ctl = new AbortController(), timer = setTimeout(function () { ctl.abort(); }, 10000);
    try {
      var r = await fetch('http://' + ip + ':5001/request?' + new URLSearchParams(prm).toString(), { method: 'GET', signal: ctl.signal });
      var text = await r.text(), payload = {};
      if (text) { try { payload = JSON.parse(text); } catch (e) { payload = { success: r.ok, error: text }; } }
      if (!r.ok || payload.success === false) throw new Error('HTTP ' + r.status + ': ' + (payload.error || ''));
    } catch (e) {
      throw new Error(e.name === 'AbortError' ? 'timeout' : e.message);
    } finally { clearTimeout(timer); }
  }

  async function printLabel(mode, noPrint) {
    if (printing) return false;
    var b = state.bench;
    if (!b.boxes.length) return false;
    printing = true;
    try {
      var pend = b.pendingPrint;
      if (!pend && mode === 'complete' && !toInt(b.cap)) return showAlert(T('kensa_e_no_cap', b.hinban));
      var layouts, ip = null, layoutId = null;
      if (!noPrint) {
        try { layouts = await fetchPrintLayouts(b.sebango); } catch (e) { return showAlert(T('kensa_e_server', e.message)); }
        if (!layouts.length) return showAlert(T('kensa_e_no_layout'));
        layoutId = layouts.length > 1 ? await chooseLayout(layouts) : layouts[0].layoutId;
        if (!layoutId) return;
        try { ip = await resolvePrinterIP(); } catch (e) { return showAlert(T('kensa_e_printer', e.message)); }
      }

      if (!pend) {
        var a = await allocDialog(b, mode); if (!a) return;
        pend = b.pendingPrint = {
          boxUid: newUid('kensa-'), mode: mode, map: a.map,
          payload: {
            boxUid: '', 背番号: b.sebango, 品番: b.hinban, machine: MACHINE, workers: workerString(), status: mode,
            qtyLabel: a.qtyLabel, qtyMeasured: a.qtyMeasured, lines: a.lines,
            parentKensaId: b.resume ? b.resume.kensaId : null, copies: 1
          }
        };
        pend.payload.boxUid = pend.boxUid; save();
      }
      pend.payload.layoutId = layoutId; pend.payload.printedBy = { tablet: MACHINE, printerIP: ip, noPrint: !!noPrint };

      var box;
      try {
        var r = await postJSON('/api/kensa-boxes', pend.payload);
        if (!r.ok) {
          var detail = '', errBody = null; try { errBody = await r.json(); detail = errBody.error || ''; } catch (e) { }
          if (r.status === 400 || r.status === 409) { b.pendingPrint = null; if (/draft/i.test(detail)) b.resume = null; save(); }   // refused for good: nothing was registered, start over
          if (r.status === 409 && errBody && errBody.id) detail = (detail ? detail + ' ' : '') + errBody.id + ' (' + errBody.remaining + '/' + errBody.need + ')';
          return showAlert(T('kensa_e_register', detail || 'HTTP ' + r.status));
        }
        box = await r.json();
      } catch (e) { return showAlert(T('kensa_e_register', e.message)); }   // network: pending stays, same boxUid is retried

      // registered: the pieces are now taken on the server, so book them here before anything else can fail
      pend.payload.lines.forEach(function (line, k) {
        var x = pend.map[k] >= 0 ? b.boxes[pend.map[k]] : null; if (!x || line.carried) return;
        x.used = toInt(x.used) + line.good + toInt(line.ngTotal);
      });
      b.boxes.forEach(function (x) { x.ngBase = Object.assign({}, x.ng); });      // shown NG back to 0, real total kept
      var entry = { kensaId: box.kensaId || box.id, boxUid: pend.boxUid, status: box.status || mode, qty: box.qtyLabel, measured: box.qtyMeasured, mismatch: !!box.mismatch, layoutId: layoutId, printedOk: false, at: new Date().toISOString() };
      b.printed.push(entry); b.pendingPrint = null; b.resume = null; save();
      renderBench(); renderSidebar();
      if (noPrint) { entry.noPrint = true; save(); renderBench(); toast(T('kensa_t_registered', entry.kensaId)); return true; }
      try {
        await sendPrint(b, entry, ip);
        entry.printedOk = true; save(); renderBench();
        toast(T('kensa_t_printed', entry.kensaId));
      } catch (e) { showAlert(T('kensa_e_print_fail', e.message, entry.kensaId)); }
      return true;
    } finally { printing = false; }
  }

  // Optional printing: the ID is still issued (so the next process can trace the box), but nothing is sent to a printer
  async function registerOnly() {
    return printLabel(toInt(state.bench.cap) ? 'complete' : 'draft', true);
  }

  // reprint = same ID / same boxUid, nothing new is registered
  async function reprintLabel(idx) {
    if (printing) return;
    var b = state.bench, entry = b.printed[idx]; if (!entry) return;
    printing = true;
    try {
      var ip;
      try { ip = await resolvePrinterIP(); } catch (e) { return showAlert(T('kensa_e_printer', e.message)); }
      try { await sendPrint(b, entry, ip); entry.printedOk = true; save(); renderBench(); toast(T('kensa_t_printed', entry.kensaId)); }
      catch (e) { showAlert(T('kensa_e_print_fail', e.message, entry.kensaId)); }
    } finally { printing = false; }
  }

  // Leader approval (static #leaderModal): camera scan of the leader QR -> /verifyLeader -> { username, name, role } or null
  function askLeader(reason) {
    return new Promise(function (resolve) {
      if (typeof Html5Qrcode === 'undefined') { showAlert(T('kensa_e_scanner_unavail')); return resolve(null); }
      var ov = $('leaderModal'), status = $('ldStatus');
      $('ldText').textContent = reason; status.textContent = '';
      ov.classList.add('show');
      var sc = null, busy = false, finished = false;
      function finish(v) {
        if (finished) return; finished = true;
        var p; try { p = sc ? sc.stop() : null; } catch (e) { p = null; }
        Promise.resolve(p).catch(function () { }).then(function () {
          try { if (sc) sc.clear(); } catch (e) { }
          ov.classList.remove('show'); resolve(v);
        });
      }
      $('ldCancel').onclick = function () { finish(null); };
      try {
        sc = new Html5Qrcode('ldReader');
        sc.start({ facingMode: 'environment' }, { fps: 20, qrbox: { width: 240, height: 240 } }, async function (decoded) {
          if (busy || finished) return; busy = true;
          try {
            var r = await postJSON('/verifyLeader', { username: decoded }), j = await r.json();
            if (j.authorized) finish({ username: j.username || decoded, name: ((j.lastName || '') + ' ' + (j.firstName || '')).trim(), role: j.role || '' });
            else { status.textContent = '❌ ' + T('kensa_leader_not'); busy = false; }
          } catch (e) { status.textContent = '❌ ' + T('kensa_leader_err'); busy = false; }
        }, function () { }).catch(function () { status.textContent = '❌ ' + T('kensa_e_camera_short'); });
      } catch (e) { status.textContent = '❌ ' + T('kensa_e_camera_short'); }
    });
  }

  // ============================================================
  //  Reset / submit
  // ============================================================
  async function resetBench() {
    var b = state.bench, hasLabels = livePrinted(b).length || b.pendingPrint;
    if (!(await confirmBox(T('kensa_reset_title'), T(hasLabels ? 'kensa_reset_text_labels' : 'kensa_reset_text'), T('kensa_reset_btn'), true))) return;
    if (hasLabels) {
      var leader = await askLeader(T('kensa_ld_reset')); if (!leader) return;
      for (var i = 0; i < b.printed.length; i++) {
        var e = b.printed[i]; if (e.voided) continue;
        try {
          var r = await postJSON('/api/kensa-boxes/' + encodeURIComponent(e.kensaId) + '/void', { reason: 'reset', leader: { username: leader.username, name: leader.name } });
          if (!r.ok) { var d = ''; try { d = (await r.json()).error || ''; } catch (x) { } throw new Error(d || 'HTTP ' + r.status); }
          e.voided = true; save();
        } catch (x) { return showAlert(T('kensa_e_void_fail', e.kensaId, x.message)); }
      }
    }
    await clearPhotos();
    state.bench = emptyBench(); afterBenchCleared();
  }
  function afterBenchCleared() {
    state.breaks = []; state.maint = []; state.stopCalls = [];
    save(); renderBreakList(); renderMaintList(); renderBench(); renderScanStatus(); renderSidebar(); updateBadge(); assertMachineState();
  }

  function validate() {
    var b = state.bench, miss = [];
    if (!state.workers.length) miss.push(T('kensa_v_operator'));
    if (!b.boxes.length) miss.push(T('kensa_v_box'));
    if (b.pendingPrint) miss.push(T('kensa_v_pending'));
    if (!photoBlobs[PHOTO_FIRST]) miss.push(T('kensa_v_hatsumono'));
    if (!b.start) miss.push(T('kensa_v_start'));
    if (!b.end) miss.push(T('kensa_v_end'));
    if (procQty(b) <= 0) miss.push(T('kensa_v_qty'));
    if (ngTotal(b) > procQty(b)) miss.push(T('kensa_v_ng_over'));
    if (spanMin(b.start, b.end) < breakTotal() + maintTotal()) miss.push(T('kensa_v_break_over'));
    return miss;
  }

  var submitting = false;
  async function submitBench() {
    if (submitting) return;
    var b = state.bench;
    var miss = validate();
    if (miss.length) return showAlert(T('kensa_v_head') + '\n・' + miss.join('\n・'));
    var live = livePrinted(b);
    if (!printRequired && !live.length && !b.pendingPrint) {     // no printer needed, but the box still gets an ID
      if (!(await confirmBox(T('kensa_lbl_register_only'), T('kensa_ld_register_first'), T('kensa_lbl_register_only')))) return;
      if (!(await registerOnly())) return;
      live = livePrinted(b);
    }
    if (printRequired && !live.length && !b.bypass) {     // no label was printed: a leader must approve
      var ld = await askLeader(T('kensa_ld_nolabel')); if (!ld) return;
      b.bypass = { leader: ld, at: new Date().toISOString() }; save();
    }
    if (!(await confirmBox(T('kensa_submit_btn'), T('kensa_submit_text', b.sebango, procQty(b), goodQty(b), ngTotal(b)), T('submit')))) return;

    submitting = true;
    var btn = $('submitBtn'); btn.disabled = true;
    try {
      var counters = {}; NG_FIELDS.forEach(function (f) { counters[f] = b.boxes.reduce(function (a, x) { return a + toInt(x.ng[f]); }, 0); });
      var ids = function (kind) { return b.boxes.filter(function (x) { return x.id && x.kind === kind; }).map(function (x) { return x.id; }); };
      var body = {
        // legacy kensaDB fields (same names as newKensa iReporter)
        品番: b.hinban, 背番号: b.sebango, 工場: FACTORY,
        Total: goodQty(b), Worker_Name: workerString(),
        Process_Quantity: procQty(b), Remaining_Quantity: goodQty(b),
        Date: b.date || todayStr(), Time_start: b.start, Time_end: b.end, 設備: MACHINE,
        Counters: counters, Total_NG: ngTotal(b),
        Cycle_Time: cycleSec(b), 製造ロット: b.lotNumbers, Comment: b.comment, Spare: toInt(b.spare),
        // new
        Tablet_Home: MACHINE,
        Kensa_Box_IDs: live.map(function (e) { return e.kensaId; }),
        Box_IDs: ids('dcp').concat(ids('srs')),      // contract: DCP + SRS input ids
        Lot_Details: b.boxes.map(function (x) { return { boxId: x.kind === 'dcp' ? x.id : null, srsId: x.kind === 'srs' ? x.id : null, legacy: !x.id, qty: x.qty, lots: x.lots || [], ng: Object.assign({}, x.ng), ngTotal: inNg(x) }; }),
        Kensa_Label_Bypass: live.length ? null : b.bypass,
        Submit_UID: b.submitUid || (b.submitUid = newUid('sub-')),
        Kensa_Unlabelled_NG: b.boxes.filter(function (x) { return inNgShownTotal(x) > 0; }).map(function (x) { return { boxId: x.kind === 'dcp' ? x.id : null, srsId: x.kind === 'srs' ? x.id : null, legacy: !x.id, ng: ngObjShown(x), ngTotal: inNgShownTotal(x) }; }),
        Break_Time_Total_Minutes: breakTotal(), Break_Time_Data: state.breaks.slice(),
        Maintenance_Data: maintData(),
        StopCall: stopCallData()
      };
      save();     // keeps Submit_UID so a retry after a lost response returns the saved record
      // 初物 / 終物 photos, same shape as DCP's submit (base64 without prefix + metadata)
      body.images = [];
      var meta = [[PHOTO_FIRST, '初物チェック'], [PHOTO_LAST, '終物チェック']], idx = 0;
      for (var i = 0; i < meta.length; i++) {
        var blob = photoBlobs[meta[i][0]]; if (!blob) continue;
        body.images.push({
          base64: await blobToBase64(blob), label: meta[i][1], id: meta[i][0] + '-' + Date.now() + '-' + (idx++), imgId: meta[i][0],
          factory: FACTORY, machine: MACHINE, worker: workerString(), date: body.Date, sebanggo: b.sebango, timestamp: Date.now() + idx
        });
      }
      var sentCalls = state.stopCalls.length;
      var r = await postJSON('/submitToKensaDBInteractive', body);
      if (!r.ok) {
        var detail = ''; try { detail = (await r.json()).error || ''; } catch (e) { }
        throw new Error(detail || 'HTTP ' + r.status);
      }
      state.stopCalls.splice(0, sentCalls);
      await clearPhotos();
      state.bench = emptyBench(); afterBenchCleared();
      toast('✅ ' + T('kensa_t_submitted'));
      gotoScan();     // back to Step 1 for the next box
    } catch (e) {
      // draft stays untouched so nothing is lost; the operator can press Submit again
      showAlert(T('kensa_e_submit_fail', e.message));
    } finally { submitting = false; btn.disabled = false; }
  }

  // ============================================================
  //  Maintenance (machine trouble) - timer + manual records, shared like breaks
  // ============================================================
  var maintInterval = null;
  function maintTotal() { return state.maint.reduce(function (a, r) { return a + spanMin(r.startTime, r.endTime); }, 0); }
  function maintData() {
    var total = maintTotal();
    return {
      records: state.maint.map(function (r) { return { id: r.id, startTime: r.startTime, endTime: r.endTime, comment: r.comment, timestamp: r.timestamp }; }),
      totalMinutes: total, totalHours: Math.round(total / 60 * 100) / 100
    };
  }
  function fmtElapsed(ms) { var sec = Math.max(0, Math.floor(ms / 1000)); return pad(Math.floor(sec / 60)) + ':' + pad(sec % 60); }

  function renderMaintList() {
    var host = $('maintenance-records-container'); host.innerHTML = '';
    state.maint.forEach(function (r, i) {
      var row = document.createElement('div'); row.className = 'record-row';
      row.innerHTML = '<span class="record-num">' + (i + 1) + '</span>' +
        '<div class="record-main"><div class="record-title">' + esc(r.startTime) + ' – ' + esc(r.endTime) + ' (' + T('kensa_min', spanMin(r.startTime, r.endTime)) + ')</div>' +
        '<small>' + esc(r.comment || '') + '</small></div>' +
        '<button type="button" class="record-del" aria-label="delete">✕</button>';
      row.querySelector('button').onclick = function () { state.maint.splice(i, 1); save(); renderMaintList(); updateDerived(); toast(T('kensa_t_maint_removed')); };
      host.appendChild(row);
    });
    $('total-trouble-display').textContent = T('kensa_min', maintTotal());
  }
  function tickMaint() { if (state.activeMaintStart) $('maintenanceTimerDisplay').textContent = fmtElapsed(Date.now() - state.activeMaintStart); }
  function openMaintOverlay() {
    $('maintenanceOverlay').classList.add('open'); $('callMenuWrapper').style.display = 'none';
    tickMaint(); clearInterval(maintInterval); maintInterval = setInterval(tickMaint, 1000);
  }
  function startMaintenance() {
    if (!state.activeMaintStart) state.activeMaintStart = Date.now();
    save(); openMaintOverlay(); assertMachineState();
  }
  var maintFromTimer = false;
  function finishMaintenance() {
    var startEpoch = state.activeMaintStart;
    clearInterval(maintInterval);
    $('maintenanceOverlay').classList.remove('open'); $('callMenuWrapper').style.display = '';
    state.activeMaintStart = null; save(); assertMachineState();
    if (!startEpoch) return;
    maintFromTimer = true;
    openMaintModal(fmtClock(new Date(startEpoch)), nowHM());
  }
  function openMaintModal(startHM, endHM) {
    $('maintStart').value = startHM || ''; $('maintEnd').value = endHM || ''; $('maintComment').value = '';
    $('maintModal').classList.add('show');
  }
  function saveMaintRecord() {
    var st = $('maintStart').value, en = $('maintEnd').value;
    if (!st || !en) return toast(T('kensa_t_maint_times'));
    state.maint.push({ id: Date.now(), startTime: st, endTime: en, comment: $('maintComment').value.trim(), timestamp: new Date().toISOString() });
    $('maintModal').classList.remove('show'); maintFromTimer = false;
    save(); renderMaintList(); updateDerived(); toast(T('kensa_t_maint_saved'));
  }
  $('maintenanceStartButton').onclick = startMaintenance;
  $('finishMaintenanceButton').onclick = finishMaintenance;
  $('add-maintenance-btn').onclick = function () { maintFromTimer = false; openMaintModal('', ''); };
  $('maintSave').onclick = saveMaintRecord;
  $('maintCancel').onclick = function () {
    if (maintFromTimer) { saveMaintRecord(); return; }   // the timer already ran: keep the time even without a comment
    $('maintModal').classList.remove('show');
  };

  // ============================================================
  //  Call leader (hold 2s) -> full-screen wait -> leader QR unlocks. Drives the factory stop-call TV.
  // ============================================================
  var STOP_HOLD_MS = 2000, STOP_CANCEL_WINDOW_MS = 5000;
  var stopCallInterval = null, stopCallCancelTimer = null, stopCallScanner = null, holdRAF = null, holdStart = 0;

  function notifyStopCall(action, callType) {
    try {
      fetch(serverURL + '/api/stop-call', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factory: FACTORY, machine: MACHINE, action: action, callType: callType || 'leader' })
      }).catch(function () { });
    } catch (e) { }
  }
  function stopCallData() {
    var recs = state.stopCalls.slice();
    var sec = recs.reduce(function (a, r) { return a + (Number(r.waitSeconds) || 0); }, 0);
    return { count: recs.length, totalWaitSeconds: sec, totalWaitMinutes: Math.round(sec / 60), records: recs };
  }
  function tickStopCall() { if (state.activeStopCallStart) $('stopCallTimerDisplay').textContent = fmtElapsed(Date.now() - state.activeStopCallStart); }
  function stopStopCallScanner() {
    $('stopCallQrWrap').classList.remove('show');
    if (!stopCallScanner) return;
    var sc = stopCallScanner; stopCallScanner = null;
    try { sc.stop().then(function () { try { sc.clear(); } catch (e) { } }).catch(function () { }); } catch (e) { }
  }
  function openStopCallOverlay() {
    $('stopCallOverlay').classList.add('open'); $('callMenuWrapper').style.display = 'none';
    $('stopCallUnlockButton').style.display = ''; $('stopCallQrWrap').classList.remove('show');
    tickStopCall(); clearInterval(stopCallInterval); stopCallInterval = setInterval(tickStopCall, 1000);
    clearTimeout(stopCallCancelTimer);
    var remain = STOP_CANCEL_WINDOW_MS - (Date.now() - state.activeStopCallStart);
    var cancelBtn = $('stopCallCancelButton');
    if (remain > 0) { cancelBtn.style.display = ''; stopCallCancelTimer = setTimeout(function () { cancelBtn.style.display = 'none'; }, remain); }
    else cancelBtn.style.display = 'none';
  }
  function closeStopCallOverlay() {
    clearInterval(stopCallInterval); clearTimeout(stopCallCancelTimer); stopStopCallScanner();
    $('stopCallOverlay').classList.remove('open');
    if (!state.activeMaintStart) $('callMenuWrapper').style.display = '';
  }
  function startStopCall() {
    if (state.activeStopCallStart) return;
    state.activeStopCallStart = Date.now(); save();
    openStopCallOverlay(); notifyStopCall('activate'); assertMachineState();
  }
  function cancelStopCall() {
    if (!state.activeStopCallStart || Date.now() - state.activeStopCallStart > STOP_CANCEL_WINDOW_MS) return;
    state.activeStopCallStart = null; save();
    closeStopCallOverlay(); notifyStopCall('clear'); assertMachineState();
    toast(T('toast_call_canceled'));
  }
  function finishStopCall(leader) {
    var start = state.activeStopCallStart || Date.now(), end = Date.now();
    var waitSeconds = Math.max(0, Math.round((end - start) / 1000));
    // like DCP: a call made while no product is open is not production downtime, so it is not recorded
    if (benchOpen(state.bench)) {
      state.stopCalls.push({
        calledAt: fmtClock(new Date(start)), arrivedAt: fmtClock(new Date(end)),
        waitSeconds: waitSeconds, waitMinutes: Math.round(waitSeconds / 60),
        leaderName: ((leader.lastName || '') + ' ' + (leader.firstName || '')).trim(),
        leaderUsername: leader.username || '', leaderRole: leader.role || ''
      });
    }
    state.activeStopCallStart = null; save();
    closeStopCallOverlay(); notifyStopCall('clear'); assertMachineState();
    toast(T('toast_leader_recorded'));
  }
  function beginStopCallUnlock() {
    var qrWrap = $('stopCallQrWrap'), statusEl = $('stopCallStatus');
    if (qrWrap.classList.contains('show')) return;
    if (typeof Html5Qrcode === 'undefined') { toast(T('kensa_e_scanner_unavail')); return; }
    qrWrap.classList.add('show'); $('stopCallUnlockButton').style.display = 'none';
    statusEl.textContent = T('kensa_leader_scan'); statusEl.style.color = '#E8A9AD';
    try {
      stopCallScanner = new Html5Qrcode('stopCallQrReader');
      var sc = stopCallScanner;
      sc.start({ facingMode: 'environment' }, { fps: 30, qrbox: { width: 800, height: 800 }, aspectRatio: 1.0 }, async function (decoded) {
        if (sc.__busy) return;
        sc.__busy = true;
        try {
          var resp = await postJSON('/verifyLeader', { username: decoded });
          var result = await resp.json();
          if (result.authorized) {
            statusEl.textContent = '✅ ' + (result.lastName || '') + ' ' + (result.firstName || ''); statusEl.style.color = '#9DEAB0';
            finishStopCall({ username: result.username || decoded, firstName: result.firstName || '', lastName: result.lastName || '', role: result.role || '' });
          } else { statusEl.textContent = '❌ ' + T('kensa_leader_not'); statusEl.style.color = '#FFB3B8'; sc.__busy = false; }
        } catch (e) { statusEl.textContent = '❌ ' + T('kensa_leader_err'); statusEl.style.color = '#FFB3B8'; sc.__busy = false; }
      }, function () { }).catch(function () { statusEl.textContent = '❌ ' + T('kensa_e_camera_short'); statusEl.style.color = '#FFB3B8'; });
    } catch (e) { statusEl.textContent = '❌ ' + T('kensa_e_camera_short'); }
  }
  $('stopCallUnlockButton').onclick = beginStopCallUnlock;
  $('stopCallCancelButton').onclick = cancelStopCall;

  // press-and-hold the button for 2s so a stray tap cannot call the leader
  function setHoldNum(n) { var el = $('stopHoldNum'); el.textContent = n; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  function endHold() {
    if (holdRAF) { cancelAnimationFrame(holdRAF); holdRAF = null; }
    $('stopHoldCountdown').classList.remove('show'); $('stopCallMainToggle').classList.remove('holding');
  }
  (function bindHold() {
    var btn = $('stopCallMainToggle');
    btn.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.cancelable) e.preventDefault();
      if (state.activeStopCallStart || holdRAF) return;
      try { btn.setPointerCapture(e.pointerId); } catch (_) { }
      btn.classList.add('holding'); holdStart = Date.now(); $('stopHoldCountdown').classList.add('show');
      var last = 2; setHoldNum(2);
      var tick = function () {
        var remain = STOP_HOLD_MS - (Date.now() - holdStart);
        if (remain <= 0) { endHold(); startStopCall(); return; }
        var shown = Math.ceil(remain / 1000);
        if (shown !== last) { last = shown; setHoldNum(shown); }
        holdRAF = requestAnimationFrame(tick);
      };
      holdRAF = requestAnimationFrame(tick);
    });
    ['pointerup', 'pointercancel'].forEach(function (ev) { btn.addEventListener(ev, function () { if (holdRAF) endHold(); }); });
    btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  })();

  // ============================================================
  //  Factory TV state (/api/machine-assert): running / break / maintenance / calling for this bench
  // ============================================================
  var pageInstanceId = 'kensa' + Math.random().toString(36).slice(2, 10);
  function benchStartMs(b) {
    var p = String(b.start || '').split(':');
    if (p.length < 2) return 0;
    var d = new Date(); d.setHours(toInt(p[0]), toInt(p[1]), 0, 0);
    var t = d.getTime();
    if (t > Date.now() + 3600000) t -= 86400000;      // started before midnight
    return t;
  }
  function assertMachineState() {
    if (!MACHINE) return;
    try {
      var b = state.bench, running = b.boxes.length > 0;
      var mode = 'idle', modeAt = 0;
      if (state.activeMaintStart) { mode = 'maintenance'; modeAt = state.activeMaintStart; }
      else if (state.activeBreakStart) { mode = 'break'; modeAt = state.activeBreakStart; }
      else if (state.activeStopCallStart) { mode = 'stopcall'; modeAt = state.activeStopCallStart; }
      else if (running) mode = 'running';
      var seb = '', hin = '', runAt = 0, ng = 0;
      if (running) {
        seb = b.sebango; hin = b.hinban;
        // moving the start forward by the breaks/maintenance keeps the TV's elapsed time equal to real working time
        runAt = (benchStartMs(b) || Date.now()) + (breakTotal() + maintTotal()) * 60000;
        ng = ngTotal(b);
      }
      postJSON('/api/machine-assert', {
        工場: FACTORY, 設備: MACHINE, 背番号: seb, 品番: hin, mode: mode, modeStartedAt: modeAt,
        runStartedAt: mode === 'idle' ? 0 : runAt, totalNG: ng, pageInstanceId: pageInstanceId, cycleStopActive: false, worker: workerString()
      }).catch(function () { });
    } catch (e) { console.warn('Kensa: machine-assert failed', e); }
  }

  // ============================================================
  //  "i" product info sidebar
  // ============================================================
  function toggleSidebar(show) {
    var sb = $('infoSidebar');
    if (typeof show !== 'boolean') show = !sb.classList.contains('open');
    sb.classList.toggle('open', show); $('sidebarBackdrop').classList.toggle('open', show);
    if (show) renderSidebar();
  }
  function renderSidebar() {
    var host = $('infoLanes'), b = state.bench;
    if (!benchOpen(b)) { host.innerHTML = '<div class="info-lane"><span class="lane-badge">' + esc(MACHINE) + '</span><div class="info-empty">' + esc(T('kensa_idle')) + '</div></div>'; return; }
    var rows = [
      ['kensa_i_hinban', b.hinban], ['kensa_i_sebango', b.sebango], ['kensa_i_hinmei', b.hinmei], ['kensa_i_model', b.model], ['kensa_i_shape', b.shape],
      ['kensa_i_cap', b.cap || ''], ['kensa_i_inputs', b.boxes.length ? b.boxes.length + ' · ' + boxQty(b) + 'pcs' : '---'], ['kensa_i_lot', b.lotNumbers || '---']
    ];
    host.innerHTML = '<div class="info-lane"><span class="lane-badge">' + esc(MACHINE) + '</span>' +
      (b.imageURL ? '<img src="' + esc(b.imageURL) + '" alt="">' : '') +
      rows.map(function (r) { return '<div class="info-row"><label>' + esc(T(r[0])) + '</label><div>' + esc(r[1] || '---') + '</div></div>'; }).join('') + '</div>';
  }
  $('infoBtn').onclick = function () { toggleSidebar(); };
  $('sidebarClose').onclick = function () { toggleSidebar(false); };
  $('sidebarBackdrop').onclick = function () { toggleSidebar(false); };

  // ============================================================
  //  Init
  // ============================================================
  function tickClock() { $('clock').textContent = nowHM(); }

  function init() {
    if (!MACHINE) {
      // no / unknown machine in the URL: pick one (the URL stays the source of truth afterwards)
      var tb = document.querySelector('.tab-bar'); if (tb) tb.style.display = 'none';
      $('panel-scan').innerHTML = '<div class="step-card show"><h2>' + T('kensa_choose_machine') + '</h2>' +
        '<div style="display:flex;gap:12px"><a class="btn btn-primary btn-grow" href="?filter=SCNA&machine=IT1">IT1</a>' +
        '<a class="btn btn-primary btn-grow" href="?filter=SCNA&machine=IT2">IT2</a></div></div>';
      $('headerMachineTag').textContent = T('equipment') + ': --';
      return;
    }
    $('headerMachineTag').textContent = T('equipment') + ': ' + MACHINE;
    load();
    bindStatic();
    renderBench();
    renderScanStatus();
    renderBreakList();
    renderMaintList();
    renderSidebar();
    updateBadge();
    loadPhotos().then(function () { renderBench(); });
    if (state.activeBreakStart) openBreakOverlay();   // a break was running when the page reloaded
    if (state.activeMaintStart) openMaintOverlay();   // maintenance was running
    if (state.activeStopCallStart) { openStopCallOverlay(); notifyStopCall('activate'); }   // a leader call was open: keep the TV blinking
    loadWorkers();
    loadPrintRule();
    showStep0();
    tickClock(); setInterval(tickClock, 15000);
    setTimeout(assertMachineState, 3000);
    setInterval(assertMachineState, 30000);
    window.addEventListener('online', assertMachineState);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') { assertMachineState(); setTimeout(assertMachineState, 2500); }
    });
    // language picker: static text is handled by i18n.js; re-draw everything built from JS
    document.addEventListener('languageChanged', function () {
      $('headerMachineTag').textContent = T('equipment') + ': ' + MACHINE;
      renderBench(); renderScanStatus(); renderBreakList(); renderMaintList(); renderSidebar();
      if ($('step0SelectState').style.display !== 'none') renderWorkerSlots();
    });
  }
  init();
})();
