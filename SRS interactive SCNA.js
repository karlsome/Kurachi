// SRS interactive (SCNA) - Girasol 1 / Girasol 2
//
// One page per Girasol machine, same flow as DCP interactive:
//   Scan tab:       Step 0 workers (confirm / select, several allowed) -> Step 1 scan WIP label -> completed card
//   Production tab: LH and RH lanes + shared timer-based break
//
// A lane is opened by scanning its work order (WO-005460): the WO's 品番 -> masterDB gives R/L, which picks
// the lane. Then box QRs are scanned; a box goes to the lane whose WO has the same 品番. Box QR is either
// the new "品番,収容数,lot,boxId" or the legacy "品番,収容数,lot" (no box ID). A lane is released only by
// submit or reset of that lane. LH and RH are fully independent; only workers and breaks are shared.
// Each lane submits its own SRSDB record (via /submitToSRSDBInteractive, its own route; the legacy iReporter route is untouched).
//
// Same shell as DCP interactive: language picker (i18n.js + SRS interactive i18n.js), "i" product info sidebar,
// Maintenance tab (machine trouble timer, shared by both lanes like breaks) and a call-leader button (hold 2s,
// leader QR unlocks; drives the factory stop-call TV). The TV also shows this machine's running/break/
// maintenance state through /api/machine-assert. No box / material call buttons here.
//
// Tablet link: SRS interactive.html?filter=SCNA&machine=Girasol-1

//const serverURL = "https://kurachi.onrender.com";
const serverURL = "http://localhost:3000";
//const serverURL = "http://192.168.0.20:3000";
window.serverURL = serverURL;

(function () {
  'use strict';

  var FACTORY = 'SCNA';
  var NG_FIELDS = ['くっつき・めくれ', 'シワ', '転写位置ズレ', '転写不良', '文字欠け', 'その他'];
  var LANES = ['LH', 'RH'];

  // ---------- machine (URL is the source of truth) ----------
  var params = new URLSearchParams(location.search);
  var machineRaw = (params.get('machine') || '').replace(/\+/g, ' ').trim();
  var mm = machineRaw.match(/girasol\s*[-_ ]?\s*(\d+)/i);
  var machineNo = mm ? mm[1] : '';
  var MACHINE = machineNo ? 'Girasol-' + machineNo : '';
  var MACHINE_LEGACY = machineNo ? 'Girasol ' + machineNo : '';   // 設備 string, same style as "AOL 4,5"
  var DRAFT_KEY = 'srs_' + FACTORY + '_' + MACHINE;

  // translations: T('key', arg0, arg1) fills {0} {1}; falls back to Japanese, then the key (see "SRS interactive i18n.js")
  function T(key) {
    var a = Array.prototype.slice.call(arguments, 1);
    var s = typeof _t === 'function' ? _t(key) : key;
    return String(s).replace(/\{(\d+)\}/g, function (m, i) { return a[i] != null ? a[i] : ''; });
  }

  // ---------- state ----------
  function emptyLane() {
    return {
      sebango: '', hinban: '', hinmei: '', model: '', shape: '', rl: '', workOrder: '', woSku: '', woAssigned: '', imageURL: '',
      boxes: [],            // inputs [{ boxId ('' for legacy QR), qr, legacy, qty (pieces available this session), base, lots:[lotNumber], machines:[], ng:{type:n} real totals, ngBase:{type:n} totals at the last print }]
      start: '', end: '', date: '',
      qtyOverride: null,
      cur: 0,               // index of the input the NG buttons act on
      cap: 0,               // standard 収容数 from masterDB
      printed: [],          // registered SRS labels [{ srsId, status, qty, measured, mismatch, layoutId, printedOk, at }]
      pendingPrint: null,   // { boxUid, mode, payload, map } registered-but-unconfirmed label request (safe to retry)
      submitUid: '',
      spare: 0, srsCode: '', lotNumbers: '', comment: '', photo: null
    };
  }
  function laneOpen(l) { return !!l.workOrder; }   // a lane is claimed by its scanned work order
  var state = {
    workers: [], breaks: [], activeBreakStart: null,
    maint: [],                  // machine trouble records [{ id, startTime, endTime, comment, timestamp }], shared by both lanes
    activeMaintStart: null,
    stopCalls: [],              // finished leader calls, handed to the first lane that submits
    activeStopCallStart: null,
    lanes: { LH: emptyLane(), RH: emptyLane() }
  };
  var activeLane = 'LH';
  var workerNamesData = [];
  var workerSlots = [''];          // Step 0 editing copy
  var activeSlot = 0;
  var workerConfirmed = false;     // asked again after every page load, like DCP

  var $ = function (id) { return document.getElementById(id); };
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
      LANES.forEach(function (l) { state.lanes[l] = Object.assign(emptyLane(), (d.lanes || {})[l] || {}); });
      LANES.forEach(function (n) {      // drafts from before per-input NG: lane NG moves onto the first input
        var x = state.lanes[n];
        x.boxes.forEach(function (b) { b.ng = b.ng || {}; b.ngBase = b.ngBase || {}; if (b.base == null) b.base = b.qty; });
        if (x.ng && x.boxes.length) { NG_FIELDS.forEach(function (f) { if (x.ng[f]) x.boxes[0].ng[f] = toInt(x.boxes[0].ng[f]) + toInt(x.ng[f]); }); }
        delete x.ng;
      });
    } catch (e) { console.error('SRS: draft load failed', e); }
  }

  // ---------- small UI helpers ----------
  var toastTimer;
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function playAlert() {
    var a = $('alert-sound');
    if (a) { a.muted = false; a.volume = 1; a.currentTime = 0; a.play().catch(function () { }); }
  }
  function showAlert(text, title) {
    $('alertTitle').textContent = title || T('srs_err_title');
    $('alertText').textContent = text;
    $('alertModal').classList.add('show');
    document.body.classList.add('flash-red');
    playAlert();
  }
  $('alertOk').onclick = function () {
    $('alertModal').classList.remove('show');
    document.body.classList.remove('flash-red');
    var a = $('alert-sound'); if (a) { a.pause(); a.currentTime = 0; }
  };
  function confirmBox(title, text, yesLabel) {
    return new Promise(function (resolve) {
      $('confirmTitle').textContent = title; $('confirmText').textContent = text;
      $('confirmYes').textContent = yesLabel || 'OK';
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
  function switchTab(name) {
    document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === name); });
    $('panel-scan').classList.toggle('active', name === 'scan');
    $('panel-production').classList.toggle('active', name === 'production');
    $('panel-maintenance').classList.toggle('active', name === 'maintenance');
  }
  document.querySelectorAll('.tab-btn').forEach(function (b) { b.onclick = function () { switchTab(b.getAttribute('data-tab')); }; });
  function updateBadge() {
    var n = LANES.filter(function (l) { return laneOpen(state.lanes[l]); }).length;
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
      input.value = name || ''; input.placeholder = '👤 Select Worker ' + (idx + 1) + '...';
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
    if (!names.length) return toast(T('srs_t_select_worker'));
    state.workers = names; save(); workerConfirmed = true; showStep1();
  };

  // worker picker modal
  function openWorkerModal(idx) {
    activeSlot = idx;
    $('manualWorkerRow').style.display = 'none';
    var host = $('workerNamesContainer'); host.innerHTML = '';
    var others = workerSlots.filter(function (n, i) { return i !== idx && n; }).map(function (n) { return n.toLowerCase(); });
    workerNamesData.forEach(function (name) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'worker-name-btn'; b.textContent = name;
      if (others.indexOf(name.toLowerCase()) >= 0) { b.classList.add('disabled'); b.disabled = true; b.textContent = name + T('srs_selected_suffix'); }
      else b.onclick = function () { pickWorker(name); };
      host.appendChild(b);
    });
    $('workerNameModal').classList.add('show');
  }
  function pickWorker(name) {
    name = (name || '').trim();
    if (!name) return;
    var dup = workerSlots.some(function (n, i) { return i !== activeSlot && n && n.toLowerCase() === name.toLowerCase(); });
    if (dup) return toast('⚠️ ' + T('srs_t_already_selected', name));
    workerSlots[activeSlot] = name;
    $('workerNameModal').classList.remove('show');
    renderWorkerSlots();
  }
  $('closeWorkerModal').onclick = function () { $('workerNameModal').classList.remove('show'); };
  $('manualEntryBtn').onclick = function () { $('manualWorkerRow').style.display = 'flex'; $('manualWorkerInput').value = ''; $('manualWorkerInput').focus(); };
  $('manualWorkerOk').onclick = function () { pickWorker($('manualWorkerInput').value); };
  $('manualWorkerInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') pickWorker(this.value); });

  async function loadWorkers() {
    try {
      var r = await fetch(serverURL + '/getWorkerNames?selectedFactory=' + encodeURIComponent(FACTORY));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      workerNamesData = await r.json();
    } catch (e) { console.error('SRS: worker list failed', e); toast(T('srs_t_workers_fail')); }
  }

  // ============================================================
  //  Step 1 - scan WIP label (inline scanner, no popup)
  // ============================================================
  var scanner = null, scanBusy = false;

  function showStep1() {
    showCard('step1Modal');
    clearStep1Error();
    $('step1Scanner').classList.remove('show');
    $('manualBoxId').value = '';
    $('step1MachineName').textContent = MACHINE_LEGACY;
    renderScanLanes();
  }
  function clearStep1Error() { $('step1ErrorMsg').classList.remove('show'); }
  function step1Error(msg) {
    var box = $('step1ErrorMsg'); box.querySelector('p').textContent = msg; box.classList.add('show');
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
    if (typeof Html5Qrcode === 'undefined') return step1Error(T('srs_e_scanner_unavail'));
    $('step1Scanner').classList.add('show');
    stopScanner().then(function () {
      $('step1Scanner').classList.add('show');
      scanner = new Html5Qrcode('qrReader');
      return scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 220 }, function (text) {
        stopScanner().then(function () { handleScan(text); });   // one result per scan: stop first so an error is not repeated
      }, function () { });
    }).catch(function (e) {
      $('step1Scanner').classList.remove('show');
      step1Error(T('srs_e_camera'));
      console.warn('SRS: camera', e);
    });
  };
  $('manualBoxOk').onclick = function () { handleScan($('manualBoxId').value); };
  $('manualBoxId').addEventListener('keydown', function (e) { if (e.key === 'Enter') handleScan($('manualBoxId').value); });

  // ---------- scan classification ----------
  var WO_RE = /^WO-\d+$/i;
  var BOXID_RE = /-B\d{3,}$/i;
  // Box QR: new = 品番,収容数,lotNumber,boxId   legacy = 品番,収容数,lotNumber   (a bare box ID is also accepted)
  function parseBoxQr(text) {
    var raw = String(text || '').trim();
    var parts = raw.split(/[,\s]+/).map(function (p) { return p.trim(); }).filter(Boolean);
    var boxId = '';
    for (var i = parts.length - 1; i >= 0; i--) if (BOXID_RE.test(parts[i])) { boxId = parts[i].toUpperCase(); parts.splice(i, 1); break; }
    if (boxId) return { raw: raw, boxId: boxId, hinban: parts[0] || '', qty: parts.length > 1 ? toInt(parts[1]) : null, lot: parts[2] || '' };
    if (parts.length >= 3 && toInt(parts[1]) > 0) return { raw: raw, boxId: '', hinban: parts[0], qty: toInt(parts[1]), lot: parts.slice(2).join('') };
    return null;
  }
  var SRS_RE = /-S\d{3,}(\b|$)/i;
  function normSku(v) { return String(v || '').trim().toUpperCase(); }

  async function handleScan(text) {
    if (scanBusy) return;
    clearStep1Error();
    var t = String(text || '').trim();
    if (!t) return;
    scanBusy = true;
    try {
      if (WO_RE.test(t)) await acceptWorkOrder(t.toUpperCase());
      else if (SRS_RE.test(t)) step1Error(T('srs_e_srs_label', t));
      else {
        var q = parseBoxQr(t);
        if (!q) return step1Error(T('srs_e_not_label', t));
        await acceptBox(q);
      }
    } finally { scanBusy = false; }
  }

  // "Girasol 1,2" -> [1,2]; "Girasol 1" -> [1]
  function girasolList(str) {
    var out = [], inG = false;
    String(str || '').split(',').forEach(function (tok) {
      tok = tok.trim();
      var m = /^girasol[\s_-]*(\d+)$/i.exec(tok);
      if (m) { inG = true; out.push(m[1]); }
      else if (inG && /^\d+$/.test(tok)) out.push(tok);
      else inG = false;
    });
    return out;
  }

  async function masterByHinban(hinban) {
    var rows = await queryDB('Sasaki_Coating_MasterDB', 'masterDB', { 品番: hinban });
    return (rows || []).filter(function (x) { return x.工場 === FACTORY; })[0] || null;
  }
  function laneOf(rec) { return rec && rec['R/L'] === 'LH' ? 'LH' : rec && rec['R/L'] === 'RH' ? 'RH' : ''; }

  async function acceptWorkOrder(number) {
    var fail = function (msg) { step1Error(msg); };
    for (var i = 0; i < LANES.length; i++) {
      if (state.lanes[LANES[i]].workOrder === number) {
        return fail(T('srs_e_wo_dup', LANES[i], number));
      }
    }
    var wo;
    try {
      var r = await fetch(serverURL + '/getWorkOrderByNumber?number=' + encodeURIComponent(number));
      if (r.status === 404) return fail(T('srs_e_wo_nf', number));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      wo = await r.json();
    } catch (e) { return fail(T('srs_e_server', e.message)); }

    var assigned = wo['Assign to-Custom fields'] || '';
    if (girasolList(assigned).indexOf(machineNo) < 0) {
      return fail(T('srs_e_wo_not_assigned', MACHINE_LEGACY, number, assigned || T('srs_none')));
    }
    var sku = String(wo['P_SKU-Custom fields'] || '').trim();
    if (!sku) return fail(T('srs_e_wo_nosku', number));

    var rec;
    try { rec = await masterByHinban(sku); }
    catch (e) { return fail(T('srs_e_master_fail', e.message)); }
    if (!rec) return fail(T('srs_e_master_nf', sku));
    if (rec.SRS !== 'あり' && rec.SRS !== '有り') return fail(T('srs_e_no_srs', rec.背番号 || sku));
    var lane = laneOf(rec);
    if (!lane) return fail(T('srs_e_no_rl', rec.背番号 || sku));

    var l = state.lanes[lane];
    if (laneOpen(l)) {
      return fail(T('srs_e_lane_busy', lane, l.workOrder));
    }
    l.sebango = rec.背番号 || ''; l.hinban = rec.品番 || sku; l.hinmei = rec.品名 || ''; l.model = rec.モデル || ''; l.shape = rec.形状 || '';
    l.cap = toInt(rec.収容数); l.rl = lane; l.workOrder = number; l.woSku = sku; l.woAssigned = assigned; l.imageURL = rec.imageURL || '';
    l.date = todayStr();
    save();
    activeLane = lane; renderLane(lane); applyActiveLane(); updateBadge(); renderScanLanes(); renderSidebar(); assertMachineState();
    toast('✅ ' + T('srs_t_wo_ok', lane, number));
  }

  async function acceptBox(q) {
    var fail = function (msg) { step1Error(msg); };

    // 1. exact repeat already open on this tablet (box ID for new QRs, raw QR text for legacy ones)
    for (var i = 0; i < LANES.length; i++) {
      var dup = state.lanes[LANES[i]].boxes.some(function (b) { return q.boxId ? b.boxId === q.boxId : (!b.boxId && b.qr === q.raw); });
      if (dup) {
        return fail(T('srs_e_box_dup', LANES[i], q.boxId));
      }
    }

    var hinban = q.hinban, qty = q.qty, base = q.qty, lots = q.lot ? [q.lot] : [], machines = [];
    if (q.boxId) {
      // 2. new QR: the server holds the box (qty, lots)
      var box;
      try {
        var r = await fetch(serverURL + '/api/srs-press-boxes/' + encodeURIComponent(q.boxId));
        if (r.status === 404) return fail(T('srs_e_box_nf', q.boxId));
        if (!r.ok) throw new Error('HTTP ' + r.status);
        box = await r.json();
      } catch (e) { return fail(T('srs_e_server', e.message)); }
      // 3. pieces still unused (a press box can feed several SRS sessions)
      if (!(box.remaining > 0)) return fail(T('srs_e_box_empty', q.boxId));
      hinban = hinban || box.品番 || '';
      qty = toInt(box.remaining); base = toInt(box.base);
      lots = (box.lots || []).map(function (x) { return x.lotNumber; }).filter(Boolean);
      if (!lots.length && q.lot) lots = [q.lot];
      machines = box.machines || [];
    }
    if (!hinban) return fail(T('srs_e_no_hinban'));
    if (!qty) return fail(T('srs_e_no_qty'));

    // 4. the lane is the one whose work order has this 品番
    var key = normSku(hinban), lane = '';
    LANES.forEach(function (n) {
      var x = state.lanes[n];
      if (!lane && laneOpen(x) && (normSku(x.hinban) === key || normSku(x.woSku) === key)) lane = n;
    });
    if (!lane) {
      var missing = LANES.filter(function (n) { return !laneOpen(state.lanes[n]); });
      if (missing.length) {
        // is this product LH or RH? Only worth a lookup when a lane is still waiting for its work order
        var rec = null;
        try { rec = await masterByHinban(hinban); } catch (e) { return fail(T('srs_e_master_fail', e.message)); }
        var want = laneOf(rec);
        if (want && missing.indexOf(want) >= 0) {
          return fail(T('srs_e_scan_wo_first', want, hinban));
        }
      }
      var open = LANES.filter(function (n) { return laneOpen(state.lanes[n]); })
        .map(function (n) { return n + ': ' + state.lanes[n].hinban; }).join(' / ');
      return fail(T('srs_e_box_mismatch', hinban, open ? ' (' + open + ')' : ''));
    }

    // 5. accept (box ID is kept for traceability even when its WO prefix differs from the lane's WO)
    var l = state.lanes[lane];
    if (!l.boxes.length) l.start = nowHM();
    l.boxes.push({ boxId: q.boxId, qr: q.raw, legacy: !q.boxId, qty: qty, used: 0, base: base, lots: lots, machines: machines, ng: {}, ngBase: {} });
    l.cur = l.boxes.length - 1;
    l.qtyOverride = null;     // the new box changes the sum; operator can override again
    var known = l.lotNumbers ? l.lotNumbers.split(/\s*,\s*/) : [];
    lots.forEach(function (x) { if (known.indexOf(x) < 0) known.push(x); });
    l.lotNumbers = known.join(', ');
    save();
    activeLane = lane; renderLane(lane); applyActiveLane(); updateBadge(); renderScanLanes(); renderSidebar(); assertMachineState();
    toast('✅ ' + T('srs_t_box_ok', lane, q.boxId || T('srs_legacy_short', qty)));
  }

  // ---------- Scan tab: per-lane status (grey = not scanned, green = scanned) ----------
  function renderScanLanes() {
    var host = $('scanLanes'); if (!host) return;
    host.innerHTML = LANES.map(function (n) {
      var l = state.lanes[n], wo = laneOpen(l), bx = l.boxes.length;
      var last = bx ? l.boxes[bx - 1] : null;
      var boxVal = bx ? T('srs_boxes_count', bx) + ' · ' + boxQty(l) + 'pcs' + (last && last.boxId ? '<br>' + esc(last.boxId) : '') : '';
      return '<div class="scan-lane" data-lane="' + n + '">' +
        '<div class="scan-lane-head"><span class="lane-badge">' + n + '</span>' +
        '<span class="scan-lane-prod">' + (wo ? esc(l.sebango) + '<br>' + esc(l.hinban) : '') + '</span></div>' +
        '<div class="ind ' + (wo ? 'ok' : '') + '"><span class="dot"></span><span>' + (wo
          ? T('srs_ind_wo_ok') + ' <span class="val">' + esc(l.workOrder) + '</span>'
          : T('srs_ind_wo_no')) + '</span></div>' +
        '<div class="ind ' + (bx ? 'ok' : (wo ? 'warn' : '')) + '"><span class="dot"></span><span>' + (bx
          ? T('srs_ind_box_ok') + ' <span class="val">' + boxVal + '</span>'
          : T('srs_ind_box_no')) + '</span></div>' +
        (wo ? '' : '<div class="scan-next">① ' + T('srs_scan_next', n) + '</div>') +
        '</div>';
    }).join('');
  }
  $('doneToProd').onclick = function () { switchTab('production'); };

  function gotoScan() {
    switchTab('scan');
    if (workerConfirmed) showStep1();   // otherwise Step 0 is still showing
  }

  // ============================================================
  //  Breaks - timer based, shared by both lanes
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
      toast(T('srs_t_break_recorded'));
    }
    save(); renderBreakList(); renderAllDerived(); assertMachineState();
  }
  $('breakStartButton').onclick = startBreak;
  $('finishBreakButton').onclick = finishBreak;

  function renderBreakList() {
    var host = $('break-list'); host.innerHTML = '';
    state.breaks.forEach(function (b, i) {
      var row = document.createElement('div'); row.className = 'record-row';
      row.innerHTML = '<span class="record-num">' + (i + 1) + '</span>' +
        '<div class="record-main">' + esc(b.start) + ' – ' + esc(b.end) + '<small>' + T('srs_min', spanMin(b.start, b.end)) + '</small></div>' +
        '<button type="button" class="btn btn-alert btn-sm">✕</button>';
      row.querySelector('button').onclick = function () { state.breaks.splice(i, 1); save(); renderBreakList(); renderAllDerived(); };
      host.appendChild(row);
    });
    $('total-break-display').textContent = T('srs_min', breakTotal());
    var n = state.breaks.length;
    $('break-count-display').textContent = n ? T('srs_break_count', n) : '';
  }

  // ============================================================
  //  Production lanes
  // ============================================================
  function boxQty(l) { return l.boxes.reduce(function (a, b) { return a + (b.qty || 0); }, 0); }
  function procQty(l) { return l.qtyOverride != null ? l.qtyOverride : boxQty(l); }
  // real NG totals per input are kept for submit; the screen shows only what came after the last print
  function inNg(b) { return NG_FIELDS.reduce(function (a, f) { return a + toInt(b.ng[f]); }, 0); }
  function inNgShown(b, f) { return Math.max(0, toInt(b.ng[f]) - toInt(b.ngBase[f])); }
  function inNgShownTotal(b) { return NG_FIELDS.reduce(function (a, f) { return a + inNgShown(b, f); }, 0); }
  function ngTotal(l) { return l.boxes.reduce(function (a, b) { return a + inNg(b); }, 0); }
  function ngShownTotal(l) { return l.boxes.reduce(function (a, b) { return a + inNgShownTotal(b); }, 0); }
  function curBox(l) { return l.boxes[Math.min(toInt(l.cur), l.boxes.length - 1)]; }
  function boxLabel(b) { return b.boxId || (b.lots[0] ? T('srs_legacy') + ' ' + b.lots[0] : T('srs_legacy')); }
  function goodQty(l) { return Math.max(0, procQty(l) - ngTotal(l)); }
  function cycleSec(l) {
    var work = spanMin(l.start, l.end) - breakTotal() - maintTotal();
    var q = procQty(l);
    return work > 0 && q > 0 ? Math.round((work * 60 / q) * 10) / 10 : 0;
  }

  function laneEl(name) { return document.querySelector('.lane[data-lane="' + name + '"]'); }

  function renderShell() {
    var host = $('lanes'); host.innerHTML = '';
    LANES.forEach(function (name) {
      var sec = document.createElement('section');
      sec.className = 'lane'; sec.setAttribute('data-lane', name);
      host.appendChild(sec);
    });
    LANES.forEach(renderLane);
    applyActiveLane();
  }

  function renderLane(name) {
    var l = state.lanes[name], sec = laneEl(name);
    var busy = laneOpen(l);
    var html = '<div class="lane-head"><span class="lane-badge">' + name + '</span>' +
      '<span class="lane-state">' + (busy ? esc(l.sebango) + ' · ' + T('srs_boxes_count', l.boxes.length) : T('srs_idle')) + '</span></div>';

    if (!busy) {
      html += '<div class="empty"><div class="big">' + T('srs_lane_empty', name) + '</div>' +
        '<button type="button" class="btn btn-primary" data-act="scan">' + T('srs_go_scan') + '</button></div>';
      sec.innerHTML = html; bindLane(name); updateSwitch(); return;
    }

    html += '<div class="lane-body">' +
      '<div class="product"><div class="name">' + esc(l.sebango) + ' · ' + esc(l.hinban) + '</div>' +
      '<div class="meta">' + esc(l.hinmei) + '<br>' + (l.workOrder ? 'WO: ' + esc(l.workOrder) + ' · ' : '') + esc(l.model) + ' ' + esc(l.shape) + '</div>' +
      '<div class="box-chips">' + l.boxes.map(function (b, i) { return '<button type="button" class="chip' + (i === Math.min(toInt(l.cur), l.boxes.length - 1) ? ' cur' : '') + '" data-cur="' + i + '">' + esc(boxLabel(b)) + ' · ' + T('srs_chip_left', Math.max(0, b.qty - toInt(b.used))) + (inNg(b) ? ' · NG ' + inNg(b) : '') + '</button>'; }).join('') + '</div>' +
      '<div style="margin-top:10px"><button type="button" class="btn btn-secondary btn-sm" data-act="scan">' + T('srs_add_box') + '</button></div></div>' +

      '<div class="grid2">' +
      '<div class="field"><label>' + T('srs_l_start') + '</label><input type="time" data-f="start" value="' + esc(l.start) + '"></div>' +
      '<div class="field"><label>' + T('srs_l_end') + '</label><input type="time" data-f="end" value="' + esc(l.end) + '"></div></div>' +
      '<div><button type="button" class="btn btn-secondary btn-sm" data-act="now-end">' + T('srs_end_now') + '</button></div>' +

      '<div class="grid2">' +
      '<div class="field"><label>' + T('process_quantity') + '</label><input type="number" inputmode="numeric" data-f="qty" min="0" value="' + procQty(l) + '"></div>' +
      '<div class="field"><label>' + T('srs_l_lot') + '</label><input type="text" data-f="lotNumbers" value="' + esc(l.lotNumbers) + '"></div></div>' +
      '<div class="grid2">' +
      '<div class="field"><label>' + T('srs_l_srscode') + '</label><input type="text" data-f="srsCode" value="' + esc(l.srsCode) + '"></div>' +
      '<div class="field"><label>' + T('srs_l_spare') + '</label><input type="number" inputmode="numeric" data-f="spare" min="0" value="' + toInt(l.spare) + '"></div></div>' +

      '<div class="section-title">' + T('srs_l_ng') + ' · ' + esc(boxLabel(curBox(l))) + '</div><div class="ng-grid">' +
      NG_FIELDS.map(function (f, i) {
        return '<div class="ng-item"><span class="lbl">' + esc(T('srs_ng_' + i)) + '</span><div class="stepper">' +
          '<button type="button" data-ng="' + i + '" data-d="-1">−</button>' +
          '<input type="number" inputmode="numeric" min="0" data-ngv="' + i + '" value="' + inNgShown(curBox(l), f) + '">' +
          '<button type="button" data-ng="' + i + '" data-d="1">＋</button></div></div>';
      }).join('') + '</div>' +

      '<div class="section-title">' + T('srs_lbl_title') + '</div>' + labelsHtml(l) +

      '<div class="totals">' +
      '<div class="total-box"><div class="k">' + T('srs_l_proc') + '</div><div class="v" data-out="proc">0</div></div>' +
      '<div class="total-box ng"><div class="k">NG</div><div class="v" data-out="ng">0</div></div>' +
      '<div class="total-box good"><div class="k">' + T('srs_l_good') + '</div><div class="v" data-out="good">0</div></div></div>' +
      '<div class="pill-info" data-out="cycle"></div>' +

      '<div class="photo-row"><button type="button" class="btn btn-secondary btn-sm" data-act="photo">' + T('srs_l_photo') + '</button>' +
      (l.photo ? '<img src="' + l.photo + '" alt="1st piece">' : '') +
      '<input type="file" accept="image/*" capture="environment" data-photo style="display:none"></div>' +

      '<div class="field"><label>' + T('srs_l_comment') + '</label><textarea data-f="comment">' + esc(l.comment) + '</textarea></div>' +
      '</div>' +

      '<div class="lane-foot">' +
      '<button type="button" class="btn btn-alert" data-act="reset">' + T('srs_reset_btn') + '</button>' +
      '<button type="button" class="btn btn-primary btn-grow" data-act="submit">' + T('srs_submit_lane', name) + '</button></div>';

    sec.innerHTML = html;
    bindLane(name);
    updateDerived(name);
    updateSwitch();
  }

  function updateDerived(name) {
    var l = state.lanes[name], sec = laneEl(name);
    if (!sec || !l.boxes.length) return;
    var set = function (k, v) { var e = sec.querySelector('[data-out="' + k + '"]'); if (e) e.textContent = v; };
    set('proc', procQty(l)); set('ng', ngShownTotal(l)); set('good', goodQty(l));
    var c = cycleSec(l);
    set('cycle', c ? T('srs_cycle', c, breakTotal() + maintTotal()) : '');
  }
  function renderAllDerived() { LANES.forEach(updateDerived); }

  function bindLane(name) {
    var l = state.lanes[name], sec = laneEl(name);
    sec.querySelectorAll('[data-act]').forEach(function (b) {
      b.onclick = function () {
        var a = b.getAttribute('data-act');
        if (a === 'scan') gotoScan();
        else if (a === 'reset') resetLane(name);
        else if (a === 'submit') submitLane(name);
        else if (a === 'print-complete') printLabel(name, 'complete');
        else if (a === 'print-draft') printLabel(name, 'draft');
        else if (a === 'now-end') { l.end = nowHM(); save(); var i = sec.querySelector('[data-f="end"]'); if (i) i.value = l.end; updateDerived(name); }
        else if (a === 'photo') sec.querySelector('[data-photo]').click();
      };
    });
    sec.querySelectorAll('[data-f]').forEach(function (inp) {
      inp.oninput = function () {
        var f = inp.getAttribute('data-f');
        if (f === 'qty') l.qtyOverride = toInt(inp.value);
        else if (f === 'spare') l.spare = toInt(inp.value);
        else l[f] = inp.value;
        save(); updateDerived(name);
      };
    });
    sec.querySelectorAll('[data-reprint]').forEach(function (b) {
      b.onclick = function () { reprintLabel(name, +b.getAttribute('data-reprint')); };
    });
    sec.querySelectorAll('[data-cur]').forEach(function (b) {
      b.onclick = function () { l.cur = +b.getAttribute('data-cur'); save(); renderLane(name); };
    });
    sec.querySelectorAll('[data-ng]').forEach(function (b) {
      b.onclick = function () {
        var i = +b.getAttribute('data-ng'), f = NG_FIELDS[i], cb = curBox(l);
        cb.ng[f] = toInt(cb.ngBase[f]) + Math.max(0, inNgShown(cb, f) + (+b.getAttribute('data-d')));
        sec.querySelector('[data-ngv="' + i + '"]').value = inNgShown(cb, f);
        save(); updateDerived(name);
      };
    });
    sec.querySelectorAll('[data-ngv]').forEach(function (inp) {
      inp.oninput = function () { var cb = curBox(l), f = NG_FIELDS[+inp.getAttribute('data-ngv')]; cb.ng[f] = toInt(cb.ngBase[f]) + toInt(inp.value); save(); updateDerived(name); };
    });
    var ph = sec.querySelector('[data-photo]');
    if (ph) ph.onchange = function () {
      if (!ph.files || !ph.files[0]) return;
      shrinkImage(ph.files[0]).then(function (dataUrl) { l.photo = dataUrl; save(); renderLane(name); })
        .catch(function () { toast(T('srs_t_photo_fail')); });
    };
  }

  function shrinkImage(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onerror = reject;
      fr.onload = function () {
        var img = new Image();
        img.onerror = reject;
        img.onload = function () {
          var max = 1280, s = Math.min(1, max / Math.max(img.width, img.height));
          var c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.7));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  // narrow-screen lane switch
  function applyActiveLane() { LANES.forEach(function (n) { laneEl(n).classList.toggle('active', n === activeLane); }); updateSwitch(); }
  function updateSwitch() {
    document.querySelectorAll('#laneSwitch button').forEach(function (b) {
      var n = b.getAttribute('data-lane');
      b.classList.toggle('active', n === activeLane);
      b.classList.toggle('busy', laneOpen(state.lanes[n]));
    });
    updateBadge();
  }
  document.querySelectorAll('#laneSwitch button').forEach(function (b) {
    b.onclick = function () { activeLane = b.getAttribute('data-lane'); applyActiveLane(); };
  });


  // ============================================================
  //  SRS labels - register an SRS ID on the server, then print through the mini-PC print server (:5001)
  // ============================================================
  var LABEL_PROCESS = 'SRS';
  var ipURL = 'https://script.google.com/macros/s/AKfycbyC6-KiT3xwGiahhzhB-L-OOL8ufG0WqnT5mjEelGBKGnbiqVAS6qjT78FlzBUHqTn3Gg/exec';
  var printerIP = '';
  var printing = false;

  function newUid(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
  function shownNgObj(b) { var o = {}; NG_FIELDS.forEach(function (f) { var n = inNgShown(b, f); if (n) o[f] = n; }); return o; }
  function freeGood(b) { return Math.max(0, b.qty - toInt(b.used) - inNgShownTotal(b)); }

  function labelsHtml(l) {
    var rows = l.printed.map(function (e, i) {
      return '<div class="lbl-row"><b>' + esc(e.srsId) + '</b><span class="lbl-tag ' + (e.status === 'draft' ? 'draft' : 'ok') + '">' +
        T(e.status === 'draft' ? 'srs_lbl_draft' : 'srs_lbl_complete') + '</span><span>' + e.qty + 'pcs</span>' +
        (e.printedOk ? '<span class="lbl-ok">✓</span>' : '<span class="lbl-tag bad">' + T('srs_lbl_notprinted') + '</span>') +
        '<button type="button" class="btn btn-secondary btn-sm" data-reprint="' + i + '">' + T('srs_lbl_reprint') + '</button></div>';
    }).join('');
    return '<div class="lbl-list">' + (rows || '<div class="lbl-none">' + T('srs_lbl_none') + '</div>') + '</div>' +
      '<div class="grid2" style="margin-top:8px">' +
      '<button type="button" class="btn btn-primary" data-act="print-complete">' + T('srs_lbl_print_complete') + '</button>' +
      '<button type="button" class="btn btn-secondary" data-act="print-draft">' + T('srs_lbl_print_draft') + '</button></div>';
  }

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
      ov._done = ov;
      pickDialog.last = ov;
    });
  }
  async function chooseLayout(layouts) {
    var r = await pickDialog(T('srs_pick_layout'), layouts.map(function (x, i) {
      return '<button type="button" class="btn btn-primary btn-full" style="margin-bottom:8px" data-r="L' + i + '">' + esc(x.name) + '</button>';
    }).join(''), [{ r: 'x', label: T('cancel') }]);
    return r && r[0] === 'L' ? layouts[+r.slice(1)].layoutId : null;
  }

  // allocation dialog -> { qtyLabel, lines, map } | null
  async function allocDialog(l, mode) {
    var cap = toInt(l.cap), left = mode === 'complete' ? cap : Infinity, def = [];
    l.boxes.forEach(function (b, i) { var g = Math.min(freeGood(b), left); def[i] = g; left -= g; });
    var rows = l.boxes.map(function (b, i) {
      var ng = inNgShownTotal(b);
      return '<div class="field"><label>' + esc(boxLabel(b)) + ' · ' + T('srs_pd_avail', freeGood(b)) + (ng ? ' · ' + T('srs_pd_ng_note', ng) : '') + '</label>' +
        '<input type="number" inputmode="numeric" min="0" max="' + freeGood(b) + '" data-pa="' + i + '" value="' + def[i] + '"></div>';
    }).join('');
    var done = pickDialog(mode === 'complete' ? T('srs_pd_title_c', cap) : T('srs_pd_title_d'), rows + '<div class="pill-info" data-sum></div>',
      [{ r: 'x', label: T('cancel') }, { r: 'ok', label: T('srs_pd_print'), cls: 'btn-primary' }]);
    var ov = pickDialog.last, sum = function () {
      return Array.prototype.reduce.call(ov.querySelectorAll('[data-pa]'), function (a, e) { return a + toInt(e.value); }, 0);
    };
    var refresh = function () { ov.querySelector('[data-sum]').textContent = T('srs_pd_sum', sum(), mode === 'complete' ? cap : sum()); };
    ov.querySelectorAll('[data-pa]').forEach(function (e) { e.oninput = refresh; }); refresh();
    ov._check = function () {
      var bad = '';
      ov.querySelectorAll('[data-pa]').forEach(function (e) { var i = +e.getAttribute('data-pa'); if (toInt(e.value) > freeGood(l.boxes[i])) bad = T('srs_pd_over_input', boxLabel(l.boxes[i])); });
      if (!bad && sum() <= 0) bad = T('srs_pd_zero');
      if (!bad && mode === 'complete' && sum() > cap) bad = T('srs_pd_over_cap', cap);
      if (bad) { showAlert(bad); return false; }
      return true;
    };
    var r = await done; if (r !== 'ok') return null;
    var good = Array.prototype.map.call(ov.querySelectorAll('[data-pa]'), function (e) { return toInt(e.value); }), total = good.reduce(function (a, b) { return a + b; }, 0);
    if (mode === 'complete' && total !== cap && !(await confirmBox(T('srs_lbl_print_complete'), T('srs_pd_mismatch', total, cap), T('srs_pd_print')))) return null;
    var lines = [], map = [];
    l.boxes.forEach(function (b, i) {
      var ng = shownNgObj(b);
      if (!good[i] && !Object.keys(ng).length) return;
      lines.push({ boxId: b.boxId || null, legacy: !b.boxId, 品番: l.hinban, lotNumbers: b.lots || [], machines: b.machines || [], carried: false, good: good[i], ng: ng });
      map.push(i);
    });
    return { qtyLabel: mode === 'complete' ? cap : total, lines: lines, map: map };
  }

  async function sendPrint(l, entry, ip) {
    var ov = { qr_1: '{品番},' + entry.qty + ',{lotNumber},' + entry.srsId, box_id: entry.srsId, text_9: '{lotNumber} - ' + entry.srsId, text_6: String(entry.qty) };
    if (entry.status === 'draft') ov.text_10 = '仮';
    var prm = { filename: l.sebango, qty: '1', process: LABEL_PROCESS, overrides: JSON.stringify(ov) };
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

  async function printLabel(name, mode) {
    if (printing) return;
    var l = state.lanes[name];
    if (!l.boxes.length) return;
    printing = true;
    try {
      var pend = l.pendingPrint;
      if (!pend && mode === 'complete' && !toInt(l.cap)) return showAlert(T('srs_e_no_cap', l.hinban));
      var layouts, ip;
      try { layouts = await fetchPrintLayouts(l.sebango); } catch (e) { return showAlert(T('srs_e_server', e.message)); }
      if (!layouts.length) return showAlert(T('srs_e_no_layout'));
      var layoutId = layouts.length > 1 ? await chooseLayout(layouts) : layouts[0].layoutId;
      if (!layoutId) return;
      try { ip = await resolvePrinterIP(); } catch (e) { return showAlert(T('srs_e_printer', e.message)); }

      if (!pend) {
        var a = await allocDialog(l, mode); if (!a) return;
        pend = l.pendingPrint = {
          boxUid: newUid('srs-'), mode: mode, map: a.map,
          payload: { boxUid: '', status: mode, workOrder: l.workOrder, 背番号: l.sebango, 品番: l.hinban, lane: name, machine: MACHINE_LEGACY,
            workers: workerString(), qtyLabel: a.qtyLabel, copies: 1, lines: a.lines }
        };
        pend.payload.boxUid = pend.boxUid; save();
      }
      pend.payload.layoutId = layoutId; pend.payload.printedBy = { tablet: MACHINE, printerIP: ip };

      var box;
      try {
        var r = await postJSON('/api/srs-boxes', pend.payload);
        if (!r.ok) {
          var detail = ''; try { detail = (await r.json()).error || ''; } catch (e) { }
          if (r.status === 400 || r.status === 409) { l.pendingPrint = null; save(); }   // refused for good: nothing was registered, start over
          return showAlert(T('srs_e_register', detail || 'HTTP ' + r.status));
        }
        box = await r.json();
      } catch (e) { return showAlert(T('srs_e_register', e.message)); }   // network: pending stays, same boxUid is retried

      // registered: the pieces are now taken on the server, so book them here before anything else can fail
      pend.payload.lines.forEach(function (line, k) {
        var b = l.boxes[pend.map[k]]; if (!b) return;
        b.used = toInt(b.used) + line.good + NG_FIELDS.reduce(function (acc, f) { return acc + toInt(line.ng[f]); }, 0);
      });
      l.boxes.forEach(function (b) { b.ngBase = Object.assign({}, b.ng); });      // shown NG back to 0, real total kept
      var entry = { srsId: box.srsId, status: box.status, qty: box.qtyLabel, measured: box.qtyMeasured, mismatch: !!box.mismatch, layoutId: layoutId, printedOk: false, at: new Date().toISOString() };
      l.printed.push(entry); l.pendingPrint = null; save();
      renderLane(name); renderSidebar();
      try {
        await sendPrint(l, entry, ip);
        entry.printedOk = true; save(); renderLane(name);
        toast(T('srs_t_printed', entry.srsId));
      } catch (e) { showAlert(T('srs_e_print_fail', e.message, entry.srsId)); }
    } finally { printing = false; }
  }

  async function reprintLabel(name, idx) {
    if (printing) return;
    var l = state.lanes[name], entry = l.printed[idx]; if (!entry) return;
    printing = true;
    try {
      var ip;
      try { ip = await resolvePrinterIP(); } catch (e) { return showAlert(T('srs_e_printer', e.message)); }
      try { await sendPrint(l, entry, ip); entry.printedOk = true; save(); renderLane(name); toast(T('srs_t_printed', entry.srsId)); }
      catch (e) { showAlert(T('srs_e_print_fail', e.message, entry.srsId)); }
    } finally { printing = false; }
  }

  // ============================================================
  //  Reset / submit
  // ============================================================
  async function resetLane(name) {
    if (state.lanes[name].printed.length || state.lanes[name].pendingPrint) return showAlert(T('srs_e_reset_printed'));
    if (!(await confirmBox(T('srs_reset_title', name), T('srs_reset_text'), T('srs_reset_btn')))) return;
    state.lanes[name] = emptyLane(); afterLaneCleared(name);
  }
  function afterLaneCleared(name) {
    if (!LANES.some(function (n) { return laneOpen(state.lanes[n]); })) { state.breaks = []; state.maint = []; state.stopCalls = []; }   // shared by both lanes: clear when both are idle
    save(); renderBreakList(); renderMaintList(); renderLane(name); renderScanLanes(); renderSidebar(); updateBadge(); assertMachineState();
  }

  function validate(name) {
    var l = state.lanes[name], miss = [];
    if (!state.workers.length) miss.push(T('srs_v_operator'));
    if (!l.workOrder) miss.push(T('srs_v_wo'));
    if (!l.boxes.length) miss.push(T('srs_v_box'));
    if (l.pendingPrint) miss.push(T('srs_v_pending'));
    if (!l.start) miss.push(T('srs_v_start'));
    if (!l.end) miss.push(T('srs_v_end'));
    if (procQty(l) <= 0) miss.push(T('srs_v_qty'));
    if (ngTotal(l) > procQty(l)) miss.push(T('srs_v_ng_over'));
    if (spanMin(l.start, l.end) < breakTotal() + maintTotal()) miss.push(T('srs_v_break_over'));
    return miss;
  }

  var submitting = false;
  async function submitLane(name) {
    if (submitting) return;
    var l = state.lanes[name];
    var miss = validate(name);
    if (miss.length) return showAlert(T('srs_v_head') + '\n・' + miss.join('\n・'));
    if (!(await confirmBox(T('srs_submit_lane', name), T('srs_submit_text', l.sebango, procQty(l), goodQty(l), ngTotal(l)), T('submit')))) return;

    submitting = true;
    var btn = laneEl(name).querySelector('[data-act="submit"]'); if (btn) btn.disabled = true;
    try {
      var ngBy = {}; NG_FIELDS.forEach(function (f) { ngBy[f] = l.boxes.reduce(function (a, b) { return a + toInt(b.ng[f]); }, 0); });
      var body = Object.assign({
        // legacy SRSDB fields (same names as SRS Process iReporter)
        品番: l.hinban, 背番号: l.sebango,
        Total: goodQty(l), 工場: FACTORY, Worker_Name: workerString(),
        Process_Quantity: procQty(l), Date: l.date || todayStr(), Time_start: l.start, Time_end: l.end,
        設備: MACHINE_LEGACY, SRSコード: l.srsCode,
        SRS_Total_NG: ngTotal(l), Spare: toInt(l.spare), Comment: l.comment,
        製造ロット: l.lotNumbers, Cycle_Time: cycleSec(l),
        // new
        Lane: name, 'R/L': name, Tablet_Home: MACHINE_LEGACY,
        Box_IDs: l.boxes.map(function (b) { return b.boxId; }).filter(Boolean),
        Box_Scans: l.boxes.map(function (b) { return { boxId: b.boxId || null, qr: b.qr || '', legacy: !!b.legacy, qty: b.qty, lots: b.lots || [], ng: b.ng || {} }; }),
        WorkOrders: l.workOrder ? [l.workOrder] : [],
        WorkOrder_Info: l.workOrder ? { number: l.workOrder, 品番: l.woSku, assignedTo: l.woAssigned } : null,
        Srs_Box_IDs: l.printed.map(function (e) { return e.srsId; }),
        Submit_UID: l.submitUid || (l.submitUid = newUid('sub-')),
        Srs_Unlabelled_NG: l.boxes.filter(function (b) { return b.boxId && inNgShownTotal(b) > 0; }).map(function (b) { return { boxId: b.boxId, ng: shownNgObj(b), ngTotal: inNgShownTotal(b) }; }),
        Break_Time_Total_Minutes: breakTotal(), Break_Time_Data: state.breaks.slice(),
        Maintenance_Data: maintData(),
        StopCall: stopCallData()      // leader calls are handed to the first lane that submits so they are not counted twice
      }, ngBy);
      save();     // keeps Submit_UID so a retry after a lost response returns the saved record
      var sentCalls = state.stopCalls.length;
      if (l.photo) {
        body.images = [{
          base64: l.photo.replace(/^data:image\/\w+;base64,/, ''), label: '初物チェック',
          sebanggo: l.sebango, date: body.Date, worker: workerString(), factory: FACTORY, machine: MACHINE_LEGACY
        }];
      }
      var r = await postJSON('/submitToSRSDBInteractive', body);
      if (!r.ok) {
        var detail = ''; try { detail = (await r.json()).error || ''; } catch (e) { }
        throw new Error(detail || 'HTTP ' + r.status);
      }
      state.stopCalls.splice(0, sentCalls);
      state.lanes[name] = emptyLane(); afterLaneCleared(name);
      toast('✅ ' + T('srs_t_submitted', name));
      gotoScan();     // back to Step 1 for the next label, like DCP returns after a submit
    } catch (e) {
      // draft stays untouched so nothing is lost; the operator can press Submit again
      showAlert(T('srs_e_submit_fail', e.message));
      if (btn) btn.disabled = false;
    } finally { submitting = false; }
  }

  // ============================================================
  //  Maintenance (machine trouble) - timer + manual records, shared by both lanes like breaks
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
        '<div class="record-main"><div class="record-title">' + esc(r.startTime) + ' – ' + esc(r.endTime) + ' (' + T('srs_min', spanMin(r.startTime, r.endTime)) + ')</div>' +
        '<small>' + esc(r.comment || '') + '</small></div>' +
        '<button type="button" class="record-del" aria-label="delete">✕</button>';
      row.querySelector('button').onclick = function () { state.maint.splice(i, 1); save(); renderMaintList(); renderAllDerived(); toast(T('srs_t_maint_removed')); };
      host.appendChild(row);
    });
    $('total-trouble-display').textContent = T('srs_min', maintTotal());
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
    if (!st || !en) return toast(T('srs_t_maint_times'));
    state.maint.push({ id: Date.now(), startTime: st, endTime: en, comment: $('maintComment').value.trim(), timestamp: new Date().toISOString() });
    $('maintModal').classList.remove('show'); maintFromTimer = false;
    save(); renderMaintList(); renderAllDerived(); toast(T('srs_t_maint_saved'));
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
    if (LANES.some(function (n) { return laneOpen(state.lanes[n]); })) {
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
    if (typeof Html5Qrcode === 'undefined') { toast(T('srs_e_scanner_unavail')); return; }
    qrWrap.classList.add('show'); $('stopCallUnlockButton').style.display = 'none';
    statusEl.textContent = T('srs_leader_scan'); statusEl.style.color = '#E8A9AD';
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
          } else { statusEl.textContent = '❌ ' + T('srs_leader_not'); statusEl.style.color = '#FFB3B8'; sc.__busy = false; }
        } catch (e) { statusEl.textContent = '❌ ' + T('srs_leader_err'); statusEl.style.color = '#FFB3B8'; sc.__busy = false; }
      }, function () { }).catch(function () { statusEl.textContent = '❌ ' + T('srs_e_camera_short'); statusEl.style.color = '#FFB3B8'; });
    } catch (e) { statusEl.textContent = '❌ ' + T('srs_e_camera_short'); }
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
      try { btn.setPointerCapture(e.pointerId); } catch (_) { }   // keep the hold alive if the finger drifts, like DCP
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
  //  Factory TV state (/api/machine-assert): running / break / maintenance / calling for this machine
  // ============================================================
  var pageInstanceId = 'srs' + Math.random().toString(36).slice(2, 10);
  function laneStartMs(l) {
    var p = String(l.start || '').split(':');
    if (p.length < 2) return 0;
    var d = new Date(); d.setHours(toInt(p[0]), toInt(p[1]), 0, 0);
    var t = d.getTime();
    if (t > Date.now() + 3600000) t -= 86400000;      // started before midnight
    return t;
  }
  function assertMachineState() {
    if (!MACHINE) return;
    try {
      var running = LANES.filter(function (n) { return state.lanes[n].boxes.length; });
      var mode = 'idle', modeAt = 0;
      if (state.activeMaintStart) { mode = 'maintenance'; modeAt = state.activeMaintStart; }
      else if (state.activeBreakStart) { mode = 'break'; modeAt = state.activeBreakStart; }
      else if (state.activeStopCallStart) { mode = 'stopcall'; modeAt = state.activeStopCallStart; }
      else if (running.length) mode = 'running';
      var seb = '', hin = '', runAt = 0, ng = 0;
      if (running.length) {
        seb = running.map(function (n) { return state.lanes[n].sebango; }).join(' / ');
        hin = running.map(function (n) { return state.lanes[n].hinban; }).join(' / ');
        var starts = running.map(function (n) { return laneStartMs(state.lanes[n]); }).filter(Boolean);
        // moving the start forward by the breaks/maintenance keeps the TV's elapsed time equal to real working time
        runAt = (starts.length ? Math.min.apply(null, starts) : Date.now()) + (breakTotal() + maintTotal()) * 60000;
        running.forEach(function (n) { ng += ngTotal(state.lanes[n]); });
      }
      postJSON('/api/machine-assert', {
        工場: FACTORY, 設備: MACHINE, 背番号: seb, 品番: hin, mode: mode, modeStartedAt: modeAt,
        runStartedAt: mode === 'idle' ? 0 : runAt, totalNG: ng, pageInstanceId: pageInstanceId, cycleStopActive: false, worker: workerString()
      }).catch(function () { });
    } catch (e) { console.warn('SRS: machine-assert failed', e); }
  }

  // ============================================================
  //  "i" product info sidebar (both lanes)
  // ============================================================
  function toggleSidebar(show) {
    var sb = $('infoSidebar');
    if (typeof show !== 'boolean') show = !sb.classList.contains('open');
    sb.classList.toggle('open', show); $('sidebarBackdrop').classList.toggle('open', show);
    if (show) renderSidebar();
  }
  function renderSidebar() {
    var host = $('infoLanes'); if (!host) return;
    host.innerHTML = LANES.map(function (n) {
      var l = state.lanes[n];
      if (!laneOpen(l)) return '<div class="info-lane" data-lane="' + n + '"><span class="lane-badge">' + n + '</span><div class="info-empty">' + esc(T('srs_idle')) + '</div></div>';
      var rows = [
        ['srs_i_hinban', l.hinban], ['srs_i_sebango', l.sebango], ['srs_i_hinmei', l.hinmei], ['srs_i_model', l.model], ['srs_i_shape', l.shape],
        ['srs_i_wo', l.workOrder], ['srs_i_boxes', l.boxes.length ? l.boxes.length + ' · ' + boxQty(l) + 'pcs' : '---'], ['srs_i_lot', l.lotNumbers || '---']
      ];
      return '<div class="info-lane" data-lane="' + n + '"><span class="lane-badge">' + n + '</span>' +
        (l.imageURL ? '<img src="' + esc(l.imageURL) + '" alt="">' : '') +
        rows.map(function (r) { return '<div class="info-row"><label>' + esc(T(r[0])) + '</label><div>' + esc(r[1] || '---') + '</div></div>'; }).join('') + '</div>';
    }).join('');
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
      document.querySelector('.tab-bar').style.display = 'none';
      $('panel-scan').innerHTML = '<div class="step-card show"><h2>' + T('srs_choose_machine') + '</h2>' +
        '<div style="display:flex;gap:12px"><a class="btn btn-primary btn-grow" href="?filter=SCNA&machine=Girasol-1">Girasol 1</a>' +
        '<a class="btn btn-primary btn-grow" href="?filter=SCNA&machine=Girasol-2">Girasol 2</a></div></div>';
      $('headerMachineTag').textContent = T('equipment') + ': --';
      return;
    }
    $('headerMachineTag').textContent = T('equipment') + ': ' + MACHINE_LEGACY;
    load();
    renderShell();
    renderScanLanes();
    renderBreakList();
    renderMaintList();
    renderSidebar();
    updateBadge();
    if (state.activeBreakStart) openBreakOverlay();   // a break was running when the page reloaded
    if (state.activeMaintStart) openMaintOverlay();   // maintenance was running
    if (state.activeStopCallStart) { openStopCallOverlay(); notifyStopCall('activate'); }   // a leader call was open: keep the TV blinking
    loadWorkers();
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
      $('headerMachineTag').textContent = T('equipment') + ': ' + MACHINE_LEGACY;
      renderShell(); renderScanLanes(); renderBreakList(); renderMaintList(); renderSidebar();
      if ($('step0SelectState').style.display !== 'none') renderWorkerSlots();
    });
  }
  init();
})();
