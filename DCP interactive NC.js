/* ============================================================================
   DCP interactive NC add-on (non-SCNA AOL cutters: OZNC.. and NCC01)
   Loaded by "DCP interactive.html" AFTER "DCP interactive backend.js", only when the page is not
   ?filter=SCNA. It does nothing unless one of the page's machines is an AOL cutter.
   The backend and the SCNA add-on are not changed by this file; printing is not touched.

   1. Send to machine from JSON (freyaAdmin2 masterDB > item > NC programs, Mongo ncProgramsDB)
      The backend still fires  :5000/request?filename=<背番号>.pce&mode=mass&machine=<m>  (no-cors).
      Here that request is rerouted per machine:
        - /api/nc-programs/resolve picks the machine's own version, else its machine type's program;
        - the listener must announce nc_json_upload_v1 on /state;
        - then ?program_id=<id> is sent with a readable (CORS) reply and a green / red result card;
        - no program, old listener or lookup failure: the original request (old Xiao send) unchanged.
      A red card (not for "machine busy") offers the old Xiao send.
   2. Live cycle count (listener cycles_total, live_cycle_count_v1)
        - reading taken when a lot is added to a machine (the backend's lotsByMachine);
        - the ショット数 keypad of a lot offers (reading at the next lot - reading at this lot) to Confirm;
        - Lot_Details in the submit get countSource / shotsAuto / cyclesTotalStart / cyclesTotalEnd;
        - Process Quantity shows the closed lots + the open lot's cycles x pcPerCycle while running.
   ============================================================================ */
(function () {
  'use strict';

  var AOL_RE = /^(OZNC\d+|NCC01)$/i;
  var factory = '';
  try { factory = new URLSearchParams(location.search).get('filter') || ''; } catch (e) { }
  if (factory === 'SCNA') return;

  function pageMachines() {
    try { if (typeof groupedMachines !== 'undefined' && groupedMachines.length) return groupedMachines.slice(); } catch (e) { }
    try {
      var m = new URLSearchParams(location.search).get('machine') || '';
      return m.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    } catch (e) { return []; }
  }
  var AOL_MACHINES = pageMachines().filter(function (m) { return AOL_RE.test(m); });
  if (!AOL_MACHINES.length) return;

  var NC = window.DCPNC = { machines: AOL_MACHINES, cycleStatus: {} };

  /* ---------- helpers ---------- */
  function prefix() { try { return (typeof uniquePrefix !== 'undefined' && uniquePrefix) ? uniquePrefix : 'dcp-'; } catch (e) { return 'dcp-'; } }
  function lsGet(k, d) { try { var v = localStorage.getItem(prefix() + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(prefix() + k, JSON.stringify(v)); } catch (e) { } }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function isJa() { try { return (typeof getCurrentLanguage === 'function' ? getCurrentLanguage() : 'ja') === 'ja'; } catch (e) { return true; } }
  function tr(ja, en) { return isJa() ? ja : en; }
  function server() {
    try { if (typeof serverURL !== 'undefined' && serverURL) return serverURL; } catch (e) { }
    return window.serverURL || 'https://kurachi.onrender.com';
  }
  function toast(msg) {
    if (typeof origToast === 'function') origToast(msg, 4000);
    else if (typeof window.showAppToast === 'function') window.showAppToast(msg, 4000);
  }
  function overlay(id, innerHtml) {
    var old = $(id); if (old) old.remove();
    var el = document.createElement('div');
    el.id = id;
    el.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.72);z-index:100200;display:flex;' +
      'align-items:center;justify-content:center;padding:16px;font-family:inherit;';
    el.innerHTML = '<div style="background:#fff;border-radius:16px;max-width:520px;width:100%;max-height:90vh;' +
      'overflow:auto;padding:22px;box-shadow:0 12px 40px rgba(0,0,0,.35);">' + innerHtml + '</div>';
    document.body.appendChild(el);
    return el;
  }
  function btnCss(bg, fg, border) {
    return 'display:block;width:100%;padding:14px;margin-top:10px;border-radius:12px;font-size:1rem;font-weight:700;' +
      'cursor:pointer;background:' + bg + ';color:' + fg + ';border:1.5px solid ' + (border || bg) + ';';
  }

  function listenerIP(machine) {
    try {
      if (typeof groupedMachineIPs !== 'undefined' && groupedMachineIPs[machine]) return groupedMachineIPs[machine];
      var m = ($('process') || {}).value, ip = ($('ipInfo') || {}).value;
      if (m && ip) {
        var ms = m.split(',').map(function (x) { return x.trim(); });
        var ips = ip.split(',').map(function (x) { return x.replace(/"/g, '').trim(); });
        var idx = ms.indexOf(machine);
        if (idx >= 0 && ips[idx]) return ips[idx];
        if (ms.length === 1 && ips[0]) return ips[0];
      }
    } catch (e) { }
    return '';
  }

  var origFetch = window.fetch.bind(window);

  // /state of one machine's listener -> { reachable, auto, total, log, json, ip, port }
  async function fetchListenerState(machine, ipOverride) {
    var ip = ipOverride || listenerIP(machine);
    var none = { reachable: false, auto: false, total: null, log: false, json: false };
    if (!ip) return none;
    var ports = [5000, 8766];
    try { var po = JSON.parse(localStorage.getItem('ncListenerPorts') || '{}'); if (po && po[machine]) ports = [parseInt(po[machine], 10)]; } catch (e) { }
    for (var i = 0; i < ports.length; i++) {
      try {
        var res = await origFetch('http://' + ip + ':' + ports[i] + '/state', { cache: 'no-store', signal: AbortSignal.timeout(2000) });
        if (!res.ok) continue;
        var st = await res.json();
        var caps = Array.isArray(st.capabilities) ? st.capabilities : [];
        var auto = caps.indexOf('live_cycle_count_v1') >= 0 && st.cnc_online === true &&
          typeof st.cycles_total === 'number' && isFinite(st.cycles_total);
        return {
          reachable: true, auto: auto, total: auto ? st.cycles_total : null,
          log: auto && caps.indexOf('cycle_log_v1') >= 0, json: caps.indexOf('nc_json_upload_v1') >= 0,
          ip: ip, port: ports[i]
        };
      } catch (e) { /* try the mirror port */ }
    }
    return none;
  }

  /* ====================================================================== */
  /* 1. Send to machine from JSON                                            */
  /* ====================================================================== */

  var NC_RE = /:5000\/request\?/;

  function parseNcUrl(url) {
    try {
      var u = new URL(url, location.href);
      if (u.searchParams.get('program_id') || u.searchParams.get('callStop') != null) return null;
      var machine = u.searchParams.get('machine') || '';
      var f = u.searchParams.get('filename') || '';
      if (!AOL_RE.test(machine) || !f) return null;
      return { u: u, machine: machine, sebanggo: f.replace(/\.pce$/i, '') };
    } catch (e) { return null; }
  }

  async function resolveProgram(sebanggo, machine) {
    try {
      var res = await origFetch(server() + '/api/nc-programs/resolve?sebanggo=' + encodeURIComponent(sebanggo) +
        '&machine=' + encodeURIComponent(machine), { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      var j = await res.json();
      return j && j.program && j.program._id ? j : null;
    } catch (e) { console.warn('[DCP NC] program lookup failed, using the old send:', e); return null; }
  }

  var resultSeq = 0;
  function resultCard(ok, title, detail, onLegacy) {
    var el = overlay('dcpNcResult' + (++resultSeq),
      '<div style="text-align:center;">' +
      '<div style="font-size:3rem;line-height:1;">' + (ok ? '✅' : '❌') + '</div>' +
      '<h3 style="margin:8px 0 4px;font-size:1.25rem;color:' + (ok ? '#047857' : '#B91C1C') + ';">' + esc(title) + '</h3>' +
      '<p style="margin:0;color:#4B5563;font-size:.95rem;word-break:break-word;">' + detail + '</p></div>' +
      '<button type="button" data-ok="1" style="' + btnCss(ok ? '#059669' : '#DC2626', '#fff') + '">OK</button>' +
      (onLegacy ? '<button type="button" data-legacy="1" style="' + btnCss('#F3F4F6', '#374151', '#D1D5DB') + '">' +
        esc(tr('従来の送信', 'Legacy send to machine')) + '</button>' : ''));
    el.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      el.remove();
      if (b.getAttribute('data-legacy') && onLegacy) onLegacy();
    });
    if (ok) setTimeout(function () { if (el.parentNode) el.remove(); }, 6000);
  }

  // The old request (listener opens <背番号>_<type>.pce in Xiao). Its reply cannot be read (no-cors).
  function legacySend(originalUrl, init) {
    origFetch(originalUrl, Object.assign({}, init || {}, { method: 'GET', mode: 'no-cors' })).catch(function () { });
    toast(tr('従来の方法で送信しました', 'Sent with the legacy method'));
  }

  var inFlight = 0;
  function releaseCooldown(machine) {
    try {
      if (machine && typeof machineSendCooldownEndTime !== 'undefined') machineSendCooldownEndTime[machine] = 0;
      if (inFlight === 0 && typeof sendToMachineCooldownEndTime !== 'undefined') sendToMachineCooldownEndTime = 0;
      if (typeof updateSendToMachineCooldownUI === 'function') updateSendToMachineCooldownUI();
    } catch (e) { }
  }

  async function sendProgram(p, init, resolved) {
    var prog = resolved.program;
    var label = esc(p.machine) + ' · ' + esc(prog.fileName || prog.displayName || '') +
      (resolved.source === 'machine' ? ' <small>(' + esc(tr('この機械専用', 'machine-specific')) + ')</small>' : '');
    var u = new URL(p.u.toString());
    ['filename', 'mode', 'machine'].forEach(function (k) { u.searchParams.delete(k); });
    u.searchParams.set('program_id', prog._id);
    var original = p.u.toString();
    var legacy = function () { legacySend(original, init); };
    try {
      var res = await origFetch(u.toString(), { method: 'GET', mode: 'cors', cache: 'no-store' });
      var body = null;
      try { body = await res.json(); } catch (e) { }
      if (res.ok && body && body.ok && body.upload && body.upload.machine_confirmed === true) {
        resultCard(true, tr('送信完了', 'Sent to machine'), label + '<br>' + esc(body.upload.points) + ' pts');
        return new Response('', { status: 200 });
      }
      var busy = body && (body.status === 'machine_busy' || body.status === 'busy');
      var title = busy ? tr('機械が動作中です', 'Machine is busy')
        : (res.ok && body && body.ok) ? tr('機械の確認が取れませんでした', 'Not confirmed by the machine')
        : tr('送信失敗', 'Send failed');
      resultCard(false, title, label + '<br>' + esc((body && (body.error || body.failed_step)) || ('HTTP ' + res.status)), busy ? null : legacy);
      return new Response('', { status: 200 });
    } catch (e) {
      resultCard(false, tr('送信失敗', 'Send failed'), label + '<br>' + esc(tr('ミニPCに接続できません', 'Cannot reach the mini PC')), legacy);
      return new Response('', { status: 200 });
    }
  }

  async function routeNcRequest(p, input, init) {
    var resolved = await resolveProgram(p.sebanggo, p.machine);
    if (!resolved) return origFetch(input, init);              // no program -> old Xiao send
    var st = await fetchListenerState(p.machine, p.u.hostname);
    if (!st.json) {                                             // old listener (or unreachable): old send
      console.warn('[DCP NC] listener of ' + p.machine + ' has no JSON upload; using the old send');
      toast(tr(p.machine + ': 従来の方法で送信しました(確認なし)', p.machine + ': sent with the legacy method (not confirmed)'));
      return origFetch(input, init);
    }
    inFlight++;
    try { return await sendProgram(p, init, resolved); }
    finally { inFlight--; suppressSentUntil = Date.now() + 4000; releaseCooldown(p.machine); }
  }

  /* ====================================================================== */
  /* 2. Live cycle count                                                     */
  /* ====================================================================== */

  var MARKS_KEY = 'ncCycleMarks';   // { machine: [ { lotNumber, ts, start, end, offered, source, at } ] }
  var LOTS_KEY_SUFFIX = 'lotsByMachine';
  var pendingStart = {};             // machine|lot -> promise of the start reading

  function marks() { var m = lsGet(MARKS_KEY, {}); return (m && typeof m === 'object') ? m : {}; }
  function readLots() { var l = lsGet(LOTS_KEY_SUFFIX, {}); return (l && typeof l === 'object') ? l : {}; }
  function findMark(all, machine, lot) {
    var list = all[machine] || [];
    for (var i = list.length - 1; i >= 0; i--) if (list[i].lotNumber === lot) return { list: list, i: i };
    return null;
  }

  // A lot was added to a machine (record pushed by the backend): take the listener reading now.
  function markLotStart(machine, lot, ts) {
    if (!AOL_RE.test(machine)) return;
    var all = marks();
    var list = all[machine] || (all[machine] = []);
    if (list.some(function (x) { return x.lotNumber === lot && x.ts === ts; })) return;
    list.push({ lotNumber: lot, ts: ts, start: null, end: null, offered: null, source: null, at: new Date(ts || Date.now()).toISOString() });
    lsSet(MARKS_KEY, all);
    var key = machine + '|' + lot;
    pendingStart[key] = fetchListenerState(machine).then(function (st) {
      var a = marks(), f = findMark(a, machine, lot);
      if (f && f.list[f.i].start == null && st.auto) { f.list[f.i].start = st.total; lsSet(MARKS_KEY, a); }
      return st.auto ? st.total : null;
    }).catch(function () { return null; }).finally(function () { delete pendingStart[key]; });
  }

  // Watch the backend's lotsByMachine writes: a new open record = a new lot on that machine.
  var lotsKey = function () { return prefix() + LOTS_KEY_SUFFIX; };
  var knownLotTs = {};
  function scanLots(lots) {
    Object.keys(lots || {}).forEach(function (m) {
      (lots[m] || []).forEach(function (r) {
        var k = m + '|' + r.lotNumber + '|' + r.ts;
        if (knownLotTs[k]) return;
        knownLotTs[k] = true;
        if (r.open && r.shots == null) markLotStart(m, r.lotNumber, r.ts);
      });
    });
  }
  function seedKnownLots() {
    var lots = readLots();
    Object.keys(lots).forEach(function (m) { (lots[m] || []).forEach(function (r) { knownLotTs[m + '|' + r.lotNumber + '|' + r.ts] = true; }); });
    // Open lots that never got a mark (page opened before this add-on existed) get one now, healed from the log later.
    var all = marks(), changed = false;
    Object.keys(lots).forEach(function (m) {
      if (!AOL_RE.test(m)) return;
      (lots[m] || []).forEach(function (r) {
        if (!r.open || findMark(all, m, r.lotNumber)) return;
        (all[m] || (all[m] = [])).push({ lotNumber: r.lotNumber, ts: r.ts, start: null, end: null, offered: null, source: null, at: new Date(r.ts || Date.now()).toISOString() });
        changed = true;
      });
    });
    if (changed) lsSet(MARKS_KEY, all);
  }
  var origRemoveItem = Storage.prototype.removeItem;
  Storage.prototype.removeItem = function (k) {
    origRemoveItem.apply(this, arguments);
    try { if (this === window.localStorage && k === lotsKey()) { knownLotTs = {}; lsSet(MARKS_KEY, {}); } } catch (e) { }
  };
  var origSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    origSetItem.apply(this, arguments);
    try {
      if (this === window.localStorage && k === lotsKey()) {
        var parsed = JSON.parse(v || '{}');
        if (!parsed || !Object.keys(parsed).length) { knownLotTs = {}; lsSet(MARKS_KEY, {}); }   // reset / submit
        else scanLots(parsed);
      }
    } catch (e) { }
  };

  async function fetchCycleLog(st, afterN) {
    try {
      var res = await origFetch('http://' + st.ip + ':' + st.port + '/cycles?after=' + afterN, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
      if (!res.ok) return null;
      var body = await res.json();
      return Array.isArray(body.cycles) ? body.cycles : null;
    } catch (e) { return null; }
  }

  // Missing start readings (listener unreachable when the lot was added) are rebuilt from the timestamped cycle log.
  var healing = {};
  async function healStartReadings(machine, st) {
    if (healing[machine] || !st || !st.auto || !st.log) return;
    var all = marks(), list = all[machine] || [];
    if (!list.some(function (x) { return x.start == null && x.at && !pendingStart[machine + '|' + x.lotNumber]; })) return;
    healing[machine] = true;
    try {
      var log = await fetchCycleLog(st, 0);
      if (!log || !log.length) return;
      log = log.slice().sort(function (a, b) { return a.n - b.n; });
      all = marks(); list = all[machine] || [];
      var changed = false;
      list.forEach(function (mk) {
        if (mk.start != null || !mk.at) return;
        var t = Date.parse(mk.at);
        if (!isFinite(t)) return;
        var before = null;
        for (var i = 0; i < log.length; i++) { if (Date.parse(log[i].ts) <= t) before = log[i]; else break; }
        var start = null;
        if (before) start = before.n;
        else if (log[0].n >= 1 && Date.parse(log[0].ts) > t) start = log[0].n - 1;
        if (start == null || start > st.total) return;
        mk.start = start; mk.healed = true; changed = true;
      });
      if (changed) lsSet(MARKS_KEY, all);
    } catch (e) { console.warn('[DCP NC] start reading backfill skipped:', e); }
    finally { healing[machine] = false; }
  }

  // End reading of a lot: stored end > next lot's start (waits for a reading still on its way) > fresh reading
  async function lotEndReading(machine, lot) {
    var f = findMark(marks(), machine, lot);
    if (!f) return null;
    var p = pendingStart[machine + '|' + lot];
    if (p) await p;
    f = findMark(marks(), machine, lot);
    if (!f || f.list[f.i].start == null) return null;
    var m = f.list[f.i];
    if (m.end != null) return m.end;
    var next = f.list[f.i + 1];
    if (next) {
      var pn = pendingStart[machine + '|' + next.lotNumber];
      if (pn) await pn;
      var f2 = findMark(marks(), machine, next.lotNumber);
      return f2 ? f2.list[f2.i].start : null;
    }
    var st = await fetchListenerState(machine);
    return st.auto ? st.total : null;
  }

  // The backend's ショット数 keypad (#lpModal with #lpDisplay): offer the auto count, keep manual entry.
  function enhanceShotsPrompt() {
    var ov = $('lpModal');
    var card = ov && ov.firstElementChild;
    var disp = card && card.querySelector('#lpDisplay');
    var okBtn = card && card.querySelector('#lpOk');
    if (!disp || !okBtn || card.__ncCount) return;
    card.__ncCount = true;
    var divs = card.querySelectorAll('div');
    var machine = '', lot = '';
    for (var i = 0; i < divs.length; i++) {
      var t = (divs[i].textContent || '').trim();
      if (!machine && t && divs[i].children.length === 0 && !/^Lot:/.test(t)) machine = t;
      var lm = /^Lot:\s*(.+)$/.exec(t);
      if (lm && divs[i].children.length === 0) lot = lm[1].trim();
    }
    if (!machine || !lot || !AOL_RE.test(machine)) return;

    lotEndReading(machine, lot).then(function (end) {
      if (end == null || !document.body.contains(card)) return;
      var f = findMark(marks(), machine, lot);
      if (!f) return;
      var offered = end - f.list[f.i].start;
      if (!(offered >= 0)) return;   // counter went backwards: manual
      var keys = card.querySelector('#lpKeys');
      var confirmed = false;
      var bar = document.createElement('div');
      bar.style.cssText = 'margin-bottom:12px;padding:12px;border:2px solid #29C36A;border-radius:12px;background:#ECFDF3;text-align:center;';
      bar.innerHTML = '<div style="font-size:.85rem;font-weight:700;color:#027A48;">' + esc(tr('自動カウント', 'Auto count')) + '</div>' +
        '<div style="font-size:2.4rem;font-weight:900;color:#101828;line-height:1.2;">' + offered + '</div>' +
        '<button type="button" data-c="1" style="' + btnCss('#29C36A', '#fff') + '">' + esc(tr('確定', 'Confirm')) + '</button>' +
        '<button type="button" data-m="1" style="' + btnCss('#fff', '#344054', '#D0D5DD') + '">' + esc(tr('手入力', 'Manual entry')) + '</button>';
      disp.parentNode.insertBefore(bar, disp);
      disp.style.display = 'none'; keys.style.display = 'none'; okBtn.style.display = 'none';
      bar.querySelector('[data-c]').onclick = function () { confirmed = true; disp.value = String(offered); okBtn.click(); };
      bar.querySelector('[data-m]').onclick = function () {
        bar.remove(); disp.style.display = ''; keys.style.display = ''; okBtn.style.display = ''; disp.value = '';
      };
      okBtn.addEventListener('click', function () {
        try {
          var v = parseInt(disp.value, 10) || 0;
          var all = marks(), ff = findMark(all, machine, lot);
          if (!ff) return;
          var m = ff.list[ff.i];
          m.end = end; m.offered = offered;
          m.source = (confirmed && v === offered) ? 'auto-confirmed' : 'manual';
          lsSet(MARKS_KEY, all);
        } catch (e) { }
      }, true);
    }).catch(function (e) { console.warn('[DCP NC] shots prompt enhancement skipped:', e); });
  }

  function cycleLotInfo(machine, lot) {
    var f = findMark(marks(), machine, lot);
    if (!f) return AOL_RE.test(machine || '') ? { countSource: 'manual' } : {};
    var m = f.list[f.i];
    var info = { countSource: m.source || 'manual' };
    if (m.offered != null) info.shotsAuto = m.offered;
    if (m.start != null) info.cyclesTotalStart = m.start;
    if (m.end != null) info.cyclesTotalEnd = m.end;
    return info;
  }
  function patchSubmit(bodyStr) {
    try {
      var b = JSON.parse(bodyStr);
      if (!Array.isArray(b.Lot_Details)) return bodyStr;
      b.Lot_Details.forEach(function (l) { if (l && AOL_RE.test(l.machine || '')) Object.assign(l, cycleLotInfo(l.machine, l.lotNumber)); });
      return JSON.stringify(b);
    } catch (e) { return bodyStr; }
  }

  function lotPcPerCycle(machine, lot) {
    var list = readLots()[machine] || [];
    for (var i = list.length - 1; i >= 0; i--) if (list[i].lotNumber === lot && list[i].pcPerCycle != null) return list[i].pcPerCycle;
    return null;
  }

  // Process Quantity while running = pieces of the closed lots + the open lot of each measurable machine.
  // When nothing is open (all lots closed, e.g. at submit) the backend's own value stays.
  function updateLiveQty() {
    var pq = $('ProcessQuantity');
    if (!pq || document.activeElement === pq) return;
    var all = marks(), lots = readLots(), openPieces = 0, any = false;
    NC.machines.forEach(function (m) {
      var ms = all[m] || [];
      var cur = ms[ms.length - 1];
      var st = NC.cycleStatus[m];
      if (!cur || cur.end != null || cur.start == null || !st || !st.auto) return;
      var rec = (lots[m] || []).filter(function (r) { return r.lotNumber === cur.lotNumber; }).pop();
      if (!rec || !rec.open) return;
      var pc = lotPcPerCycle(m, cur.lotNumber);
      if (pc == null) return;
      var cycles = st.total - cur.start;
      if (!(cycles >= 0)) return;
      openPieces += cycles * pc; any = true;
    });
    if (!any) return;
    var closed = 0;
    Object.keys(lots).forEach(function (m) {
      (lots[m] || []).forEach(function (r) { if (r.shots != null && r.pieces != null) closed += r.pieces; });
    });
    var v = String(closed + openPieces);
    if (pq.value === v) return;
    pq.value = v;
    pq.readOnly = true;
    try { pq.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) { }
  }

  function poll() {
    Promise.all(NC.machines.map(function (m) {
      return fetchListenerState(m).then(function (st) {
        NC.cycleStatus[m] = { auto: st.auto, total: st.total, at: Date.now() };
        return healStartReadings(m, st);
      });
    })).then(updateLiveQty).catch(function () { });
  }

  /* ====================================================================== */
  /* Hooks                                                                   */
  /* ====================================================================== */

  window.fetch = async function (input, init) {
    try {
      var url = (typeof input === 'string') ? input : (input && input.url) || '';
      if (typeof input === 'string' && NC_RE.test(url)) {
        var p = parseNcUrl(input);
        if (p) return await routeNcRequest(p, input, init);
      } else if (/\/submitToDCP(\?|$)/.test(url) && init && String(init.method || '').toUpperCase() === 'POST' && typeof init.body === 'string') {
        init = Object.assign({}, init, { body: patchSubmit(init.body) });
      }
    } catch (e) { console.error('[DCP NC] fetch hook failed (sending original):', e); }
    return origFetch(input, init);
  };

  // The backend says "送信完了" the moment a no-cors request is fired. The JSON send shows its real result card.
  // Only around a JSON send: the old Xiao send keeps the backend's toast as before.
  var FALSE_SENT_RE = /に送信しました|Sent to |Enviado para |送信完了|Send to machine completed/;
  var origToast = null;
  var suppressSentUntil = 0;
  function wrapSentToast() {
    var orig = window.showAppToast;
    if (typeof orig !== 'function' || orig.__dcpnc) return;
    origToast = orig;
    var wrapped = function (msg) {
      if ((inFlight > 0 || Date.now() < suppressSentUntil) && FALSE_SENT_RE.test(String(msg || ''))) return;
      return orig.apply(this, arguments);
    };
    wrapped.__dcpnc = true;
    window.showAppToast = wrapped;
  }

  function init() {
    try {
      seedKnownLots();
      wrapSentToast();
      new MutationObserver(function () { try { enhanceShotsPrompt(); } catch (e) { } }).observe(document.body, { childList: true });
      poll();
      setInterval(poll, 5000);
      console.log('[DCP NC] add-on active for', NC.machines.join(', '));
    } catch (e) { console.error('[DCP NC] init failed:', e); }
  }
  if (document.readyState === 'complete') init(); else window.addEventListener('load', init);

  NC.cycleLotInfo = cycleLotInfo;
  NC.marks = marks;
})();
