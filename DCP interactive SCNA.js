/* ============================================================================
   DCP interactive : SCNA add-on
   See docs/scna-dcp-interactive-plan.md

   Loaded by DCP interactive.html ONLY when ?filter=SCNA (a no-op for every
   other factory, so 小瀬 and the rest are untouched). Loaded BEFORE
   "DCP interactive backend.js" so the machine parameter can be normalised
   before the backend reads it.

   What this file does
   - Normalises the machine param ("AOL 2,3" / "AOL-2,AOL-3" -> "AOL-2,AOL-3") so
     the existing grouped-machine code (per-machine lots, shots, send, check forms,
     stop-call) works for AOL pairs.
   - Tablet "home": the machine in the opened link. Submit / reset return there.
   - Work orders (SCNAWorkOrderDB): picker, wrong-tablet warning, leader override.
   - Lot entry by keypad (SCNA material QR labels are unreadable).
   - 2-hour quality check (+15 min snooze), Partial from Spare.
   - Rewrites the /submitToDCP payload into the legacy SCNA shape (+ new fields).
   - Strips the 小瀬-only mode/machine params from the AOL NC "request" URL.
   ========================================================================== */
(function () {
  'use strict';

  var qs = new URLSearchParams(window.location.search);
  if (qs.get('filter') !== 'SCNA') return;

  var SCNA = window.SCNA = { active: true };
  var PAGE_PATH = window.location.pathname;
  var HOME_KEY = 'scna_home_machines';
  var PENDING_WO_KEY = 'scna_pending_wo';

  /* ------------------------------------------------------------------ */
  /* 1. Machines + tablet home (runs immediately, before the backend)    */
  /* ------------------------------------------------------------------ */

  // "AOL 2,3" | "AOL-2,AOL-3" | "AOL-1" -> ["AOL-2","AOL-3"]; other machines
  // (MANAS, SCNA-PSA) are kept as-is, upper-cased.
  function parseMachines(str) {
    var out = [], inAol = false;
    function add(m) { if (out.indexOf(m) < 0) out.push(m); }
    String(str || '').split(',').forEach(function (tok) {
      tok = tok.trim();
      if (!tok) return;
      var m = /^AOL[\s-]*(\d+)$/i.exec(tok);
      if (m) { inAol = true; add('AOL-' + parseInt(m[1], 10)); return; }
      if (inAol && /^\d+$/.test(tok)) { add('AOL-' + parseInt(tok, 10)); return; }   // "AOL 2,3" -> the "3"
      inAol = false;
      add(tok.toUpperCase());
    });
    return out;
  }
  // ["AOL-2","AOL-3"] -> "AOL 2,3" (legacy 設備 string); other machines by name
  function legacyLabel(list) {
    if (!list || !list.length) return '';
    var aol = list.filter(function (m) { return /^AOL-\d+$/.test(m); });
    var rest = list.filter(function (m) { return !/^AOL-\d+$/.test(m); });
    var parts = [];
    if (aol.length) parts.push('AOL ' + aol.map(function (m) { return m.replace('AOL-', ''); }).join(','));
    return parts.concat(rest).join(',');
  }
  function sameList(a, b) {
    return a.length === b.length && a.every(function (x, i) { return x === b[i]; });
  }

  // AOL machines that always run as a pair. A tablet opened for one of them (machine=AOL-2)
  // belongs to the whole pair. Machines not listed here are a unit of their own.
  var AOL_PAIRS = [['AOL-2', 'AOL-3'], ['AOL-4', 'AOL-5']];

  // Opened for one machine of a pair -> treat the page as the pair, so the original's grouped-machine
  // code (IP lookup per machine, per-machine send buttons, chooser, checklists) covers both.
  function expandPairs(list) {
    var out = [];
    list.forEach(function (m) {
      var pair = AOL_PAIRS.filter(function (p) { return p.indexOf(m) >= 0; })[0] || [m];
      pair.forEach(function (x) { if (out.indexOf(x) < 0) out.push(x); });
    });
    return out;
  }

  var machines = expandPairs(parseMachines(qs.get('machine')));
  var home = parseMachines(qs.get('home'));
  if (machines.length) {
    if (!home.length) home = machines.slice();
    qs.set('machine', machines.join(','));
    if (sameList(home, machines)) qs.delete('home'); else qs.set('home', home.join(','));
    try {
      window.history.replaceState(null, '', PAGE_PATH + '?' + qs.toString() + window.location.hash);
    } catch (e) { /* non-fatal */ }
    try { localStorage.setItem(HOME_KEY, home.join(',')); } catch (e) { }
  } else {
    home = [];
  }

  SCNA.machines = machines;
  SCNA.home = home;
  SCNA.parseMachines = parseMachines;
  SCNA.legacyLabel = legacyLabel;
  SCNA.homeUrl = function () {
    var h = SCNA.home.length ? SCNA.home : SCNA.machines;
    return PAGE_PATH + '?filter=SCNA&machine=' + encodeURIComponent(h.join(','));
  };
  SCNA.isAtHome = function () { return !new URLSearchParams(window.location.search).get('home'); };
  SCNA.goHome = function () { window.location.replace(SCNA.homeUrl()); };

  // Process Quantity is auto-calculated (shots x pcPerCycle per lot), as on the other factories.
  window.__scnaManualQty = false;

  /* ------------------------------------------------------------------ */
  /* 2. Network hooks (fetch / window.open)                              */
  /* ------------------------------------------------------------------ */

  // The AOL mini-PCs were only ever sent ?filename=...pce. Keep that exact shape
  // (other SCNA machines, MANAS / SCNA-PSA, are left untouched).
  function stripNcParams(url) {
    try {
      var u = new URL(url, window.location.href);
      if (/^AOL/i.test(u.searchParams.get('machine') || '')) {
        u.searchParams.delete('mode');
        u.searchParams.delete('machine');
      }
      return u.toString();
    } catch (e) { return url; }
  }
  var NC_RE = /:5000\/request\?/;

  // NC programs (admin SCNA page -> scnaNCProgramsDB). When the item has uploaded
  // programs the operator picks one and the request becomes ?program_id=<id> (JSON sent
  // straight to the machine). With none uploaded, the legacy ?filename=<sebanggo>.pce stays.
  var ncChoice = {};   // sebanggo -> { promise, at } shared by all machines of one send
  var NC_CHOICE_TTL_MS = 20000;

  function sebanggoOfNcUrl(url) {
    try {
      var u = new URL(url, window.location.href);
      var f = u.searchParams.get('filename') || '';
      if (!/^AOL/i.test(u.searchParams.get('machine') || '')) return null;
      return f.replace(/\.pce$/i, '') || null;
    } catch (e) { return null; }
  }

  function pickNcProgram(sebanggo, programs) {
    return new Promise(function (resolve) {
      var rows = programs.map(function (p, i) {
        return '<button type="button" data-i="' + i + '" style="' + btnCss('#fff', '#111827', '#9CA3AF') + 'text-align:left;">' +
          esc(p.displayName) + '<span style="font-weight:400;color:#6B7280;font-size:.8rem;"> &nbsp;' +
          (p.pointCount || 0) + ' pts</span></button>';
      }).join('');
      var el = overlay('scnaNcModal',
        '<h3 style="margin:0 0 4px;font-size:1.2rem;">NCプログラム選択 / Select NC program</h3>' +
        '<p style="margin:0 0 8px;color:#6B7280;font-size:.85rem;">' + esc(sebanggo) + '</p>' + rows +
        '<button type="button" data-cancel="1" style="' + btnCss('#F3F4F6', '#374151', '#D1D5DB') + '">キャンセル / Cancel</button>');
      el.addEventListener('click', function (ev) {
        var b = ev.target.closest('button'); if (!b) return;
        el.remove();
        resolve(b.getAttribute('data-cancel') ? false : programs[parseInt(b.getAttribute('data-i'), 10)]);
      });
    });
  }

  // -> program object | null (none uploaded: use legacy .pce) | false (operator cancelled)
  function chooseNcProgram(sebanggo) {
    var c = ncChoice[sebanggo];
    if (c && Date.now() - c.at < NC_CHOICE_TTL_MS) return c.promise;
    var promise = (async function () {
      var programs = [];
      try {
        var res = await origFetch(window.serverURL + '/api/scna-nc-programs/by-sebanggo/' + encodeURIComponent(sebanggo));
        if (res.ok) {
          var j = await res.json();
          programs = (j.programs || j || []).filter(function (p) { return p && p.isActive !== false; });
        }
      } catch (e) { console.warn('SCNA NC program lookup failed, using .pce:', e); }
      if (!programs.length) return null;
      if (programs.length === 1) return programs[0];
      return await pickNcProgram(sebanggo, programs);
    })();
    ncChoice[sebanggo] = { promise: promise, at: Date.now() };
    promise.then(function (r) { if (r === false) delete ncChoice[sebanggo]; });
    return promise;
  }

  var ncResultSeq = 0;
  function ncResultCard(id, ok, title, detail, onLegacy) {
    var el = overlay(id,
      '<div style="text-align:center;">' +
      '<div style="font-size:3rem;line-height:1;">' + (ok ? '✅' : '❌') + '</div>' +
      '<h3 style="margin:8px 0 4px;font-size:1.25rem;color:' + (ok ? '#047857' : '#B91C1C') + ';">' + esc(title) + '</h3>' +
      '<p style="margin:0;color:#4B5563;font-size:.9rem;word-break:break-word;">' + detail + '</p></div>' +
      '<button type="button" data-ok="1" style="' + btnCss(ok ? '#059669' : '#DC2626', '#fff') + '">OK</button>' +
      (onLegacy ? '<button type="button" data-legacy="1" style="' + btnCss('#F3F4F6', '#374151', '#D1D5DB') +
        '">従来の送信 / Legacy send to machine</button>' : ''));
    el.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      el.remove();
      if (b.getAttribute('data-legacy') && onLegacy) onLegacy();
    });
    if (ok) setTimeout(function () { if (el.parentNode) el.remove(); }, 6000);
  }

  // Old way of sending (?filename=<sebanggo>.pce). Offered only after the new send failed or
  // could not be confirmed. The response cannot be read (no-cors), so no result is shown.
  function legacySend(url, sebanggo) {
    try {
      var u = new URL(url);
      var legacyUrl = u.origin + '/request?filename=' + encodeURIComponent(sebanggo + '.pce');
      origFetch(legacyUrl, { method: 'GET', mode: 'no-cors' }).catch(function () { });
      toast('従来の方法で送信しました / Sent with the legacy method');
    } catch (e) { console.error('SCNA legacy send failed:', e); }
  }

  // Sends ?program_id= with a readable (CORS) response so the operator sees the real result.
  // Success = the listener says ok AND the machine confirmed. An old listener (no program_id
  // support, or no machine_confirmed) is treated as "not confirmed" -> legacy button.
  async function sendNcProgram(url, init, prog, sebanggo) {
    var machineLabel = '';
    try { machineLabel = new URL(url).hostname; } catch (e) { }
    var id = 'scnaNcResult' + (++ncResultSeq);
    var legacy = function () { legacySend(url, sebanggo); };
    try {
      var res = await origFetch(url, Object.assign({}, init, { mode: 'cors' }));
      var body = null;
      try { body = await res.json(); } catch (e) { body = null; }
      if (res.ok && body && body.ok && body.upload && body.upload.machine_confirmed === true) {
        ncResultCard(id, true, '送信完了 / Sent to machine',
          esc(prog.displayName) + '<br>' + esc(machineLabel) + '<br>' + esc(body.upload.points) + ' pts');
        return res;
      }
      var busy = body && (body.status === 'machine_busy' || body.status === 'busy');
      var title = busy ? '機械が動作中です / Machine is busy'
        : (res.ok && body && body.ok) ? '機械の確認が取れませんでした / Not confirmed by the machine'
        : '送信失敗 / Send failed';
      ncResultCard(id, false, title,
        esc(prog.displayName) + '<br>' + esc((body && (body.error || body.failed_step)) || ('HTTP ' + res.status)) +
        '<br><small>' + esc(machineLabel) + '</small>', busy ? null : legacy);
      return res;
    } catch (e) {
      ncResultCard(id, false, '送信失敗 / Send failed',
        esc(prog.displayName) + '<br>ミニPCに接続できません / Cannot reach the mini PC<br><small>' + esc(machineLabel) + '</small>', legacy);
      return new Response('', { status: 502 });
    }
  }

  // The page holds the Send buttons for 17 s because a send gives no reply. The program send does
  // (the mini-PC answers), so once it has answered - success or failure - free the button right away.
  // The shared "send to all" clock is only freed when no other machine's send is still waiting.
  var ncInFlight = 0;
  function releaseSendCooldown(machine) {
    try {
      if (machine && typeof machineSendCooldownEndTime !== 'undefined') machineSendCooldownEndTime[machine] = 0;
      if (ncInFlight === 0 && typeof sendToMachineCooldownEndTime !== 'undefined') sendToMachineCooldownEndTime = 0;
      if (typeof updateSendToMachineCooldownUI === 'function') updateSendToMachineCooldownUI();
    } catch (e) { console.warn('SCNA: could not release send cooldown', e); }
  }

  var origFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    try {
      var url = (typeof input === 'string') ? input : (input && input.url) || '';
      if (NC_RE.test(url) && typeof input === 'string') {
        var sb = sebanggoOfNcUrl(input);
        var ncMachine = '';
        try { ncMachine = new URL(input, window.location.href).searchParams.get('machine') || ''; } catch (e) { }
        var prog = sb ? await chooseNcProgram(sb) : null;
        if (prog === false) { releaseSendCooldown(ncMachine); return new Response('', { status: 499 }); }   // operator cancelled
        if (prog && prog._id) {
          var u = new URL(input, window.location.href);
          u.searchParams.delete('filename');
          u.searchParams.delete('mode');
          u.searchParams.delete('machine');
          u.searchParams.set('program_id', prog._id);
          input = u.toString();
          ncInFlight++;
          try { return await sendNcProgram(input, init, prog, sb); }
          finally { ncInFlight--; releaseSendCooldown(ncMachine); }
        } else if (sb) {
          // No uploaded program (or lookup failed): the old request. Its reply can't be read
          // (no-cors), so say so instead of the original's "sent" confirmation.
          var legacyRes = await origFetch(stripNcParams(input), init);
          toast('従来の方法で送信しました(確認なし) / Sent with the legacy method (not confirmed)');
          return legacyRes;
        } else {
          input = stripNcParams(input);
        }
      } else if (/\/submitToDCP(\?|$)/.test(url) && init && String(init.method || '').toUpperCase() === 'POST' &&
        typeof init.body === 'string') {
        init = Object.assign({}, init, { body: await SCNA.addCycleTimes(SCNA.patchSubmit(init.body)) });
      }
    } catch (e) { console.error('SCNA fetch hook failed (sending original):', e); }
    return origFetch(input, init);
  };
  // The original shows "Sent to AOL-2" / "送信完了" the moment a request is fired, before any reply
  // exists. On AOL machines the NC send reports its real result (card / legacy toast), so drop those.
  var FALSE_SENT_RE = /に送信しました|Sent to |Enviado para |送信完了|Send to machine completed/;
  function wrapSentToast() {
    var orig = window.showAppToast;
    if (typeof orig !== 'function' || orig.__scna) return;
    var wrapped = function (msg) {
      if (SCNA.machines.some(function (m) { return /^AOL/i.test(m); }) && FALSE_SENT_RE.test(String(msg || ''))) return;
      return orig.apply(this, arguments);
    };
    wrapped.__scna = true;
    window.showAppToast = wrapped;
  }
  var origOpen = window.open.bind(window);
  window.open = function (url) {
    var args = Array.prototype.slice.call(arguments);
    if (typeof url === 'string' && NC_RE.test(url)) args[0] = stripNcParams(url);
    return origOpen.apply(window, args);
  };

  /* ------------------------------------------------------------------ */
  /* 3. State (work order, partial spare, 2-hour checks)                 */
  /* ------------------------------------------------------------------ */

  function prefix() { return (typeof uniquePrefix !== 'undefined') ? uniquePrefix : 'scna_'; }
  function lsGet(k, d) { try { var v = localStorage.getItem(prefix() + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(prefix() + k, JSON.stringify(v)); } catch (e) { } }
  function lsDel(k) { try { localStorage.removeItem(prefix() + k); } catch (e) { } }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  var currentWO = null;     // { number, assignedTo, status, sku, customer, deadline, targetMachines, sebanggo }
  var pageMachines = SCNA.machines.slice();   // machines the page was opened with
  SCNA.getWorkOrder = function () { return currentWO; };

  /* ------------------------------------------------------------------ */
  /* 4. Submit payload -> legacy SCNA shape (+ new fields)               */
  /* ------------------------------------------------------------------ */

  SCNA.activeMachines = function () {
    return (currentWO && currentWO.targetMachines && currentWO.targetMachines.length)
      ? currentWO.targetMachines : SCNA.machines;
  };

  SCNA.patchSubmit = function (bodyStr) {
    try {
      var b = JSON.parse(bodyStr);
      var active = SCNA.activeMachines();

      // 設備 stays in the legacy "AOL 4,5" form
      b.設備 = currentWO && currentWO.assignedTo && !currentWO.overridden ? currentWO.assignedTo : legacyLabel(active);
      b.Tablet_Home = legacyLabel(SCNA.home.length ? SCNA.home : SCNA.machines);

      // shot1 / shot2 = shots per machine, in WO / tablet order (legacy fields)
      var perMachine = {};
      (b.Lot_Details || []).forEach(function (l) {
        perMachine[l.machine] = (perMachine[l.machine] || 0) + (parseInt(l.shots, 10) || 0);
      });
      var total = parseInt(b['ショット数'], 10) || 0;
      if (active.length >= 2) {
        b.shot1 = perMachine[active[0]] || 0;
        b.shot2 = perMachine[active[1]] || 0;
      } else {
        b.shot1 = active.length ? (perMachine[active[0]] != null ? perMachine[active[0]] : total) : total;
        b.shot2 = 0;
      }

      (b.Lot_Details || []).forEach(function (l) { Object.assign(l, SCNA.cycleLotInfo(l.machine, l.lotNumber)); });

      b['スペアからの部分数'] = spareTotal();
      b.Spare_Lots = SCNA.sparePayload();
      Object.assign(b, SCNA.runPayload());
      b['2HourQualityCheck'] = SCNA.twoHourPayload();
      b.WorkOrder_Info = SCNA.workOrderPayload();

      // The server reads Inspector_Name for the kensaDB worker (小瀬 sends Inspection_Name)
      if (b.isToggleChecked) {
        b.Inspector_Name = b.Inspector_Name || b.Inspection_Name || '';
        b.Inspection_Comment = (document.querySelector('textarea[name="Comments2"]') || {}).value || '';
        b.Inspection_Spare = parseInt(($('在庫') || {}).value, 10) || 0;
        var ng = 0;
        Object.keys(b.Counters || {}).forEach(function (k) { ng += parseInt(b.Counters[k], 10) || 0; });
        b.Inspection_Total_NG = ng;
        b.Inspection_Good_Total = parseInt(($('total') || {}).value, 10) || 0;
      }
      return JSON.stringify(b);
    } catch (e) {
      console.error('SCNA patchSubmit failed (sending original):', e);
      return bodyStr;
    }
  };

  SCNA.workOrderPayload = function () {
    var sent = false;
    try { sent = (typeof sendtoNCButtonisPressed !== 'undefined') && sendtoNCButtonisPressed === true; } catch (e) { }
    var now = new Date().toISOString();
    if (!currentWO) return { isWorkOrder: false, timestamp: now };
    return {
      isWorkOrder: true,
      workOrderNumber: currentWO.number,
      assignedTo: currentWO.assignedTo,
      overridden: !!currentWO.overridden,
      status: currentWO.status,
      sku: currentWO.sku,
      targetMachines: currentWO.targetMachines,
      timestamp: now,
      ncProgramSent: sent,
      ncSendTimestamp: sent ? now : null
    };
  };

  /* ------------------------------------------------------------------ */
  /* 5. UI helpers                                                       */
  /* ------------------------------------------------------------------ */

  function overlay(id, innerHtml) {
    var old = $(id); if (old) old.remove();
    var el = document.createElement('div');
    el.id = id;
    el.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.72);z-index:100200;display:flex;' +
      'align-items:center;justify-content:center;padding:16px;font-family:inherit;';
    el.innerHTML = '<div style="background:#fff;border-radius:16px;max-width:560px;width:100%;max-height:90vh;' +
      'overflow:auto;padding:22px;box-shadow:0 12px 40px rgba(0,0,0,.35);">' + innerHtml + '</div>';
    document.body.appendChild(el);
    return el;
  }
  function btnCss(bg, fg, border) {
    return 'display:block;width:100%;padding:14px;margin-top:10px;border-radius:12px;font-size:1rem;font-weight:700;' +
      'cursor:pointer;background:' + bg + ';color:' + fg + ';border:1.5px solid ' + (border || bg) + ';';
  }
  function toast(msg) {
    if (typeof window.showAppToast === 'function') window.showAppToast(msg, 4000);
    else if (typeof showAlert === 'function') showAlert(msg);
    else alert(msg);
  }

  /* ------------------------------------------------------------------ */
  /* 6. Work orders                                                      */
  /* ------------------------------------------------------------------ */

  // Machines this tablet physically serves: the opened machines plus their pair partners.
  function tabletUnit() {
    var out = [];
    pageMachines.forEach(function (m) {
      var pair = AOL_PAIRS.filter(function (p) { return p.indexOf(m) >= 0; })[0] || [m];
      pair.forEach(function (x) { if (out.indexOf(x) < 0) out.push(x); });
    });
    return out;
  }

  function woFits(woMachines) {
    // A WO fits when all of its machines belong to this tablet (its machine, or that machine's pair).
    var unit = tabletUnit();
    return woMachines.length > 0 && woMachines.every(function (m) { return unit.indexOf(m) >= 0; });
  }

  // Machines a leader-approved foreign WO runs on: this tablet's own machines, as many as the WO has.
  function overrideTargets(woMachines) {
    var unit = tabletUnit();
    return woMachines.length && woMachines.length < unit.length ? unit.slice(0, woMachines.length) : unit;
  }

  async function fetchWorkOrders() {
    var res = await fetch(window.serverURL + '/getSCNAWorkOrders');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  }

  function openWorkOrderPicker() {
    var el = overlay('scnaWoModal',
      '<h3 style="margin:0 0 4px;font-size:1.2rem;">作業指示 / Work Order</h3>' +
      '<p style="margin:0 0 12px;color:#6B7280;font-size:.85rem;">このタブレット / This tablet: <b>' +
      esc(legacyLabel(tabletUnit())) + '</b></p>' +
      '<input id="scnaWoSearch" type="text" placeholder="WO / SKU / Customer" ' +
      'style="width:100%;padding:12px;border:1.5px solid #D1D5DB;border-radius:10px;font-size:1rem;box-sizing:border-box;">' +
      '<div id="scnaWoList" style="margin-top:12px;color:#6B7280;">読み込み中... / Loading...</div>' +
      '<button type="button" id="scnaWoClose" style="' + btnCss('#F3F4F6', '#374151', '#D1D5DB') + '">閉じる / Close</button>');
    $('scnaWoClose').onclick = function () { el.remove(); };

    fetchWorkOrders().then(function (list) {
      var rows = (list || []).map(function (wo) {
        var assigned = wo['Assign to-Custom fields'] || '';
        var ms = parseMachines(assigned);
        return { wo: wo, assigned: assigned, ms: ms, fits: woFits(ms) };
      });
      // WOs for this tablet first; the server already sorts newest first
      rows.sort(function (a, b) { return (b.fits ? 1 : 0) - (a.fits ? 1 : 0); });
      function render() {
        var q = ($('scnaWoSearch').value || '').toLowerCase();
        var html = rows.filter(function (r) {
          var w = r.wo;
          return !q || [w.Number, w['P_SKU-Custom fields'], w['Customer-Custom fields'], r.assigned]
            .join(' ').toLowerCase().indexOf(q) >= 0;
        }).map(function (r, i) {
          var w = r.wo;
          return '<button type="button" data-n="' + esc(w.Number) + '" style="display:block;width:100%;text-align:left;' +
            'margin-top:8px;padding:12px 14px;border-radius:12px;cursor:pointer;font-family:inherit;' +
            'border:1.5px solid ' + (r.fits ? '#2E6FF2' : '#D1D5DB') + ';background:' + (r.fits ? '#EEF4FF' : '#fff') + ';">' +
            '<div style="display:flex;justify-content:space-between;gap:8px;"><b>' + esc(w.Number) + '</b>' +
            '<span style="font-weight:700;color:' + (r.fits ? '#1D4ED8' : '#B45309') + ';">' +
            (r.fits ? '' : '⚠ ') + esc(r.assigned || '-') + '</span></div>' +
            '<div style="font-size:.85rem;color:#4B5563;">' + esc(w['P_SKU-Custom fields']) + ' · ' +
            esc(w['Customer-Custom fields']) + '</div>' +
            '<div style="font-size:.78rem;color:#9AA1AC;">' + esc(w.Status) + ' · ' + esc(w.Deadline || '') + '</div>' +
            '</button>';
        }).join('');
        $('scnaWoList').innerHTML = html || '該当なし / No work orders';
        Array.prototype.forEach.call($('scnaWoList').querySelectorAll('button[data-n]'), function (b) {
          b.onclick = function () {
            var row = rows.filter(function (r) { return r.wo.Number === b.getAttribute('data-n'); })[0];
            el.remove();
            selectWorkOrder(row.wo);
          };
        });
      }
      $('scnaWoSearch').addEventListener('input', render);
      render();
    }).catch(function (err) {
      console.error('SCNA: work orders failed', err);
      $('scnaWoList').textContent = '❌ 読み込み失敗 / Failed to load work orders';
    });
  }

  function selectWorkOrder(wo, opts) {
    opts = opts || {};
    var assigned = wo['Assign to-Custom fields'] || '';
    var ms = parseMachines(assigned);
    if (ms.length && !woFits(ms) && !opts.skipWarn) { showWrongTablet(wo, assigned, ms); return; }
    return applyWorkOrder(wo, assigned, ms);
  }

  // Leader approved a WO meant for other machines: run it on this tablet's own machines.
  function applyOverriddenWorkOrder(wo, assigned, ms) {
    return applyWorkOrder(wo, assigned, overrideTargets(ms), true);
  }

  function showWrongTablet(wo, assigned, ms) {
    var el = overlay('scnaWrongTablet',
      '<div style="font-size:42px;text-align:center;">⚠️</div>' +
      '<h3 style="text-align:center;margin:6px 0 10px;">このワークオーダーはこの機械用ではありません<br>' +
      '<span style="font-size:.9rem;font-weight:600;">This work order is not for this machine</span></h3>' +
      '<p style="text-align:center;margin:0;">' + esc(wo.Number) + ' → <b>' + esc(assigned) + '</b><br>' +
      'タブレット / Tablet: <b>' + esc(legacyLabel(tabletUnit())) + '</b></p>' +
      '<button type="button" id="scnaWtOk" style="' + btnCss('#2E6FF2', '#fff') + '">OK</button>' +
      '<button type="button" id="scnaWtOverride" style="' + btnCss('#fff', '#6B7280', '#D1D5DB') +
      'font-size:.85rem;padding:9px;">リーダー承認で切り替え / Override (leader)</button>');
    $('scnaWtOk').onclick = function () { el.remove(); };
    $('scnaWtOverride').onclick = function () {
      if (typeof window.verifyLeaderUI !== 'function') { toast('Leader verification unavailable'); return; }
      el.remove();
      window.verifyLeaderUI(function () {
        applyOverriddenWorkOrder(wo, assigned, ms);
      },
        'リーダー承認 / Leader approval',
        'このワークオーダーをこのタブレットの機械で行うにはリーダーQRをスキャン<br>Scan leader QR to run this work order on this tablet\'s machines');
    };
  }

  // Fake the kanban scan so the existing Step 1 logic (session id, broadcast, caching, step 2) runs unchanged.
  function runStep1With(seb) {
    var btn = $('startStep1Scan');
    if (!btn) return false;
    var Real = window.Html5Qrcode;
    window.Html5Qrcode = function () {
      this.start = function (cam, cfg, ok) { setTimeout(function () { ok(seb); }, 0); return Promise.resolve(); };
      this.stop = function () { return Promise.resolve(); };
      this.clear = function () { };
    };
    try { btn.click(); } finally { window.Html5Qrcode = Real; }
    return true;
  }

  async function applyWorkOrder(wo, assigned, ms, overridden) {
    var sku = String(wo['P_SKU-Custom fields'] || '').trim();
    var clean = sku.charAt(0).toUpperCase() === 'P' ? sku.slice(1) : sku;
    var rec = null;
    try {
      var res = await fetch(window.serverURL + '/queries', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dbName: 'Sasaki_Coating_MasterDB', collectionName: 'masterDB', query: { 品番: clean } })
      });
      var rows = await res.json();
      rec = (rows || []).filter(function (r) { return r.工場 === 'SCNA'; })[0] || (rows || [])[0] || null;
    } catch (e) { console.error('SCNA: masterDB lookup failed', e); }

    if (!rec || !rec.背番号) {
      toast('❌ マスターに品番が見つかりません / SKU not found in masterDB: ' + clean);
      return false;
    }

    currentWO = {
      number: wo.Number,
      assignedTo: assigned,
      status: wo.Status,
      sku: sku,
      customer: wo['Customer-Custom fields'],
      deadline: wo.Deadline,
      targetMachines: ms.length ? ms : pageMachines.slice(),
      overridden: !!overridden,
      sebanggo: rec.背番号
    };
    lsSet('scnaWO', currentWO);
    applyActiveMachines();
    renderWoBanner();

    // The scan flow validates against the dropdown options: make sure this 背番号 is there.
    var dd = $('sub-dropdown');
    if (dd && !Array.prototype.some.call(dd.options, function (o) { return o.value === rec.背番号; })) {
      var opt = document.createElement('option'); opt.value = rec.背番号; opt.textContent = rec.背番号; dd.appendChild(opt);
    }
    runStep1With(rec.背番号);
    return true;
  }

  // Restrict the page's grouped machines to the WO's machines (subset of the tablet's pair)
  function applyActiveMachines() {
    var active = SCNA.activeMachines();
    try {
      if (typeof groupedMachines !== 'undefined' && active.length) {
        groupedMachines = active.slice();
      }
    } catch (e) { console.error('SCNA: could not set groupedMachines', e); }
    if (typeof window.buildCompletedSendPanel === 'function') {
      try { window.buildCompletedSendPanel(); } catch (e) { }
    }
  }

  function renderWoBanner() {
    var host = $('scnaWoBanner');
    if (!host) {
      var panel = $('panel-0'); if (!panel) return;
      host = document.createElement('div');
      host.id = 'scnaWoBanner';
      host.style.cssText = 'margin:0 0 12px;padding:12px 14px;border-radius:12px;background:#E8F0FE;' +
        'border:1.5px solid #2E6FF2;color:#1D4ED8;font-weight:700;font-size:.95rem;line-height:1.5;';
      panel.insertBefore(host, panel.firstChild);
    }
    if (!currentWO) { host.style.display = 'none'; return; }
    host.style.display = '';
    host.innerHTML = '📋 ' + esc(currentWO.number) + ' · ' + esc(currentWO.assignedTo) +
      (currentWO.overridden ? ' → ' + esc(legacyLabel(currentWO.targetMachines)) : '') + '<br>' +
      '<span style="font-weight:600;font-size:.82rem;">' + esc(currentWO.sku) + ' · ' + esc(currentWO.customer || '') +
      ' · ' + esc(currentWO.status || '') + '</span>';
  }

  function injectWoButton() {
    var scanBtn = $('startStep1Scan');
    if (!scanBtn || $('scnaWoBtn')) return;
    var b = document.createElement('button');
    b.type = 'button'; b.id = 'scnaWoBtn';
    b.className = scanBtn.className;
    b.style.cssText = 'margin-top:10px;';
    b.textContent = '📋 作業指示を選ぶ / Select Work Order';
    b.addEventListener('click', function (e) { e.preventDefault(); openWorkOrderPicker(); });
    scanBtn.parentNode.insertBefore(b, scanBtn.nextSibling);
  }

  // Resume a work order after a leader override reloaded the page onto the WO's machines
  function resumePendingWO() {
    var num; try { num = localStorage.getItem(PENDING_WO_KEY); } catch (e) { }
    if (!num) return;
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      var s1 = $('step1Modal');
      var visible = s1 && s1.offsetParent !== null && getComputedStyle(s1).display !== 'none';
      if (visible) {
        clearInterval(iv);
        try { localStorage.removeItem(PENDING_WO_KEY); } catch (e) { }
        fetchWorkOrders().then(function (list) {
          var wo = (list || []).filter(function (w) { return w.Number === num; })[0];
          if (wo) selectWorkOrder(wo, { skipWarn: true });
        }).catch(function (e) { console.error('SCNA: resume WO failed', e); });
      } else if (tries > 600) { clearInterval(iv); }
    }, 1000);
  }

  /* ------------------------------------------------------------------ */
  /* 7. Lot entry by keypad (no QR / no material-code validation)        */
  /* ------------------------------------------------------------------ */

  function manualLotEntry() {
    var input = $('材料ロット');
    var step2 = $('step2Modal');
    if (!input || typeof window.openDirectNumericKeypad !== 'function') return;
    var before = input.value ? input.value.split(',').map(function (v) { return v.trim(); }).filter(Boolean) : [];
    var machine = window.__lotScanMachine || (typeof groupedMachines !== 'undefined' && groupedMachines[0]) || '';
    if (step2) step2.style.display = 'none';
    window.openDirectNumericKeypad('材料ロット', true);

    var iv = setInterval(function () {
      var kp = $('numericKeypadModalDirect');
      if (kp && kp.style.display === 'block') return;
      clearInterval(iv);

      var now = input.value ? input.value.split(',').map(function (v) { return v.trim(); }).filter(Boolean) : [];
      var lot = now.length > before.length ? now[now.length - 1] : '';
      if (!lot) { if (typeof showStep2Modal === 'function') showStep2Modal(); return; }

      var known = (typeof materialLots !== 'undefined') && materialLots.some(function (l) { return l.lotNumber === lot; });
      var ok = true;
      if (known) {
        // Same lot used on the other machine: it is only recorded on that machine's timeline.
        input.value = before.join(',');
        if (typeof window.recordLotScan === 'function') {
          window.__pendingPrevLot = window.recordLotScan(lot, machine, 'manual');
          if (typeof window.assertMachineState === 'function') window.assertMachineState();
        }
        if (typeof saveMaterialLots === 'function') saveMaterialLots();
        if (typeof renderMaterialLotTags === 'function') renderMaterialLotTags();
      } else {
        input.value = before.join(',');
        ok = (typeof window.addManualLot === 'function') ? window.addManualLot(lot) : false;
      }
      if (!ok) { if (typeof showStep2Modal === 'function') showStep2Modal(); return; }

      getRun();
      markLotStart(machine, lot);   // reading of the listener's cycles_total at this lot change
      var next = function () {
        var after = function () {
          if (typeof window.proceedAfterMachineDone === 'function') window.proceedAfterMachineDone();
          else if (typeof showStep3Modal === 'function') showStep3Modal();
        };
        if (typeof window.afterLotPhotoProceed === 'function') window.afterLotPhotoProceed(after); else after();
      };
      var hasPhoto = (typeof materialLabelPhotos !== 'undefined') && Array.isArray(materialLabelPhotos) &&
        materialLabelPhotos.some(function (p) { return p && p.lotNumber === lot; });
      setTimeout(function () {
        if (!hasPhoto && typeof window.materialPhotoGate === 'function') window.materialPhotoGate(next); else next();
      }, 300);
    }, 300);
  }

  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest && e.target.closest('#startStep2Scan');
    if (!t) return;
    var grouped = (typeof groupedMachines !== 'undefined') && groupedMachines.length > 1;
    // Grouped and no machine chosen yet: let the original open the machine chooser; it re-clicks afterwards.
    if (grouped && !window.__lotScanMachine) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    manualLotEntry();
  }, true);

  // The page's "Scan material" buttons refuse to run when the product's material code is empty,
  // and SCNA products have none (lots are typed, never validated). Same flow, guarded on the 背番号.
  function scnaMaterialScan() {
    var seb = (typeof currentProductDetails !== 'undefined' && currentProductDetails && currentProductDetails.sebanggo) ||
      ($('sub-dropdown') && $('sub-dropdown').value) || '';
    if (!seb) { toast('先に製品をスキャンしてください / Scan the product first'); return; }
    window.__materialScanMode = 'production';
    window.__lotScanEpoch = (window.__lotScanEpoch || 0) + 1;
    if (window.__lotCycleMachinesDone) window.__lotCycleMachinesDone = [];
    window.__lotSendMachines = [];
    var go = function () {
      if (typeof showStep2Modal !== 'function') return;
      showStep2Modal();
      setTimeout(function () { var b = $('startStep2Scan'); if (b) b.click(); }, 250);
    };
    if (typeof groupedMachines !== 'undefined' && groupedMachines.length > 1 && typeof window.chooseScanMachine === 'function') {
      window.chooseScanMachine(go);
    } else go();
  }

  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest && e.target.closest('#prodScanMaterialButton, #kensaScanMaterialButton');
    if (!t) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    scnaMaterialScan();
  }, true);

  // Submit tab "Edit" on the worker row: the original opens the picker for slot 0 only, so a second
  // worker can't be added there. Show the whole worker list (change / remove / add) instead.
  function openWorkerListEditor() {
    var render = function () {
      var names = (window.selectedWorkerNames || []).filter(function (n) { return (n || '').trim(); });
      var rows = names.map(function (n, i) {
        return '<div style="display:flex;gap:8px;margin-top:10px;">' +
          '<button type="button" data-edit="' + i + '" style="' + btnCss('#F8F9FA', '#101828', '#E6E8EF') + 'margin:0;flex:1;text-align:left;">' + esc(n) + '</button>' +
          (names.length > 1 ? '<button type="button" data-del="' + i + '" style="' + btnCss('#FEE4E2', '#B42318', '#FDA29B') + 'margin:0;width:56px;">✕</button>' : '') +
          '</div>';
      }).join('');
      return { names: names, html: rows || '<p style="color:#6B7280;margin:10px 0;">作業者が未選択です / No worker selected</p>' };
    };
    var el = overlay('scnaWorkerEditor',
      '<h3 style="margin:0;font-size:1.2rem;text-align:center;">作業者 / Workers</h3>' +
      '<div id="scnaWorkerRows"></div>' +
      '<button type="button" data-add="1" style="' + btnCss('#fff', '#2E6FF2', '#2E6FF2') + '">＋ 作業者を追加 / Add worker</button>' +
      '<button type="button" data-done="1" style="' + btnCss('#2E6FF2', '#fff') + '">完了 / Done</button>');
    el.style.zIndex = '99990';   // the page's worker picker (#workerNameModal, 100000) must open above this
    var last = '';
    var draw = function () {
      var r = render();
      var key = r.names.join('|');
      if (key === last) return;
      last = key;
      $('scnaWorkerRows').innerHTML = r.html;
    };
    draw();
    var iv = setInterval(function () { if (!document.body.contains(el)) { clearInterval(iv); return; } draw(); }, 300);
    var close = function () {
      clearInterval(iv); el.remove();
      if (typeof window.renderWorkerListUI === 'function') window.renderWorkerListUI();
      if (typeof updateSubmitSummary === 'function') updateSubmitSummary();
    };
    el.addEventListener('click', function (ev) {
      var b = ev.target.closest('button');
      if (!b) { if (ev.target === el) close(); return; }
      var names = (window.selectedWorkerNames || []).filter(function (n) { return (n || '').trim(); });
      if (b.hasAttribute('data-done')) { close(); return; }
      if (b.hasAttribute('data-add')) { window.selectedWorkerNames = names; window.addWorkerSlot(); return; }
      if (b.hasAttribute('data-del')) {
        window.selectedWorkerNames = names; window.removeWorkerSlot(parseInt(b.getAttribute('data-del'), 10));
        last = ''; draw(); return;
      }
      if (b.hasAttribute('data-edit')) { window.selectedWorkerNames = names; window.openWorkerModal(parseInt(b.getAttribute('data-edit'), 10)); }
    });
  }

  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest && e.target.closest('.row-edit-btn');
    if (!t || !/openWorkerModal/.test(t.getAttribute('onclick') || '')) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    openWorkerListEditor();
  }, true);

  // Kensa (inspection toggle + tab). The page hides both on a grouped (comma) machine link, and
  // every AOL tablet is grouped now that a solo link is expanded to its pair. SCNA uses the toggle
  // on pair tablets too (the legacy page did), so redo the non-grouped logic of syncKensaTab here.
  function scnaSyncKensa() {
    var card = $('kensaCard'), tabBtn = $('kensaTabBtn'), kPanel = $('panel-kensa'), pPanel = $('panel-2');
    var fields = $('kensa-fields-container'), cb = $('enable-inputs'), home = $('kensaCardHome');
    if (!card || !tabBtn || !kPanel || !pPanel || !cb) return;
    if (card.style.display === 'none') card.style.display = '';
    if (fields) fields.style.display = cb.checked ? 'flex' : 'none';
    if (cb.checked) {
      if (card.parentElement !== kPanel) kPanel.insertBefore(card, kPanel.firstChild);
      if (tabBtn.style.display === 'none') tabBtn.style.display = '';
    } else {
      if (home && card.parentElement !== pPanel) pPanel.insertBefore(card, home);
      if (tabBtn.style.display !== 'none') tabBtn.style.display = 'none';
    }
  }
  function wireKensa() {
    window.onKensaToggleClicked = function (checked) {
      scnaSyncKensa();
      if (typeof updateTabIndicator === 'function') { try { updateTabIndicator(currentTabIndex); } catch (e) { } }
      if (typeof goToTab !== 'function') return;
      if (checked) goToTab(3); else if (currentTabIndex === 3) goToTab(2);   // same targets as the page's own handler
    };
    // the page re-hides the card/tab on its own timers (restore, 800 ms sync): put them back
    setInterval(scnaSyncKensa, 500);
    scnaSyncKensa();
  }

  function relabelLotStep() {
    var b = $('startStep2Scan');
    if (b) b.textContent = '⌨ ロット番号を入力 / Enter lot number';
    var ov = $('overrideStep2');
    if (ov) ov.style.display = 'none';
  }

  /* ------------------------------------------------------------------ */
  /* 8. Partial from Spare                                               */
  /* ------------------------------------------------------------------ */

  // Spare entries live in the run (localStorage) so a reload keeps them: { id, lotNumber, pieces, at, worker, consumedByBoxUid }.
  // The field shows their sum (legacy スペアからの部分数); spare is NOT part of Process Quantity / Total (it was recorded earlier).
  var SPARE_KEY = 'scnaSpareEntries';
  SCNA.spareEntries = function () { var l = lsGet(SPARE_KEY, []); return Array.isArray(l) ? l : []; };
  // Entries not yet put into a box (the box flow takes these, then calls SCNA.consumeSpare after the server accepted the box)
  SCNA.pendingSpare = function () { return SCNA.spareEntries().filter(function (e) { return !e.consumedByBoxUid; }); };
  SCNA.consumeSpare = function (ids, boxUid) {
    var list = SCNA.spareEntries();
    list.forEach(function (e) { if (ids.indexOf(e.id) >= 0 && !e.consumedByBoxUid) e.consumedByBoxUid = boxUid; });
    lsSet(SPARE_KEY, list);
  };
  SCNA.sparePayload = function () {
    return SCNA.spareEntries().map(function (e) {
      return { lotNumber: e.lotNumber, pieces: e.pieces, at: e.at, worker: e.worker, consumedByBoxUid: e.consumedByBoxUid || null };
    });
  };

  function spareTotal() { return SCNA.spareEntries().reduce(function (n, e) { return n + (e.pieces || 0); }, 0); }
  function refreshSpareField() {
    var inp = $('partial-from-spare');
    if (!inp) return;
    var n = spareTotal();
    inp.value = n > 0 ? String(n) : '';
    lsSet('partial-from-spare', inp.value);
    var cnt = SCNA.spareEntries().length;
    inp.placeholder = cnt ? '' : 'タップして追加 / Tap to add';
  }

  // Small self-contained keypad (digits, optional hyphen): does not touch the page's keypad or its fields
  function spareKeypad(title, sub, allowHyphen, cb) {
    var el = overlay('scnaSpareKeypad',
      '<h3 style="margin:0;font-size:1.2rem;text-align:center;">' + esc(title) + '</h3>' +
      '<div style="text-align:center;color:#475467;font-weight:600;margin:4px 0 10px;">' + esc(sub) + '</div>' +
      '<input id="scnaSpareDisp" type="text" readonly inputmode="none" style="width:100%;box-sizing:border-box;font-size:2.2rem;font-weight:900;text-align:center;padding:10px;border:3px solid #2E6FF2;border-radius:10px;">' +
      '<div id="scnaSpareKeys" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px;"></div>' +
      '<button type="button" data-ok="1" style="' + btnCss('#2E6FF2', '#fff') + '">OK</button>' +
      '<button type="button" data-cancel="1" style="' + btnCss('#fff', '#344054', '#D0D5DD') + '">キャンセル / Cancel</button>');
    el.style.zIndex = '100300';
    var disp = $('scnaSpareDisp');
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', allowHyphen ? '-' : 'C', '0', '⌫'].forEach(function (k) {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = k;
      b.style.cssText = 'padding:16px;font-size:1.3rem;font-weight:800;border:1px solid #D0D5DD;border-radius:10px;background:#F9FAFB;color:#101828;cursor:pointer;';
      b.onclick = function () { if (k === '⌫') disp.value = disp.value.slice(0, -1); else if (k === 'C') disp.value = ''; else disp.value += k; };
      $('scnaSpareKeys').appendChild(b);
    });
    el.addEventListener('click', function (ev) {
      var b = ev.target.closest && ev.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-cancel')) { el.remove(); return; }
      if (b.hasAttribute('data-ok')) {
        var v = disp.value.trim();
        if (!v) return;
        el.remove(); cb(v);
      }
    });
  }

  function addSpareEntry(onDone) {
    spareKeypad('スペアの数量 / Spare quantity', '手で戻す数 (個) / Pieces taken from spare', false, function (qty) {
      var pieces = parseInt(qty, 10);
      if (!(pieces > 0)) { toast('数量を入力してください / Enter a quantity'); return; }
      spareKeypad('スペアのロット番号 / Spare lot number', pieces + ' 個 / pcs', true, function (lot) {
        var list = SCNA.spareEntries();
        var workers = (window.selectedWorkerNames || []).filter(function (n) { return (n || '').trim(); });
        list.push({
          id: 'sp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          lotNumber: lot, pieces: pieces, at: new Date().toISOString(), worker: workers.join(','), consumedByBoxUid: null
        });
        lsSet(SPARE_KEY, list);
        refreshSpareField();
        if (onDone) onDone();
      });
    });
  }

  function openSpareManager() {
    var el = overlay('scnaSpareManager', '<div id="scnaSpareBody"></div>');
    var draw = function () {
      var list = SCNA.spareEntries();
      var rows = list.map(function (e) {
        var used = !!e.consumedByBoxUid;
        return '<div style="display:flex;align-items:center;gap:8px;margin-top:10px;padding:10px;border:1px solid #E4E7EC;border-radius:10px;' + (used ? 'background:#F2F4F7;color:#667085;' : '') + '">' +
          '<div style="flex:1;"><div style="font-weight:800;">' + esc(e.lotNumber || '—') + '</div>' +
          '<div style="font-size:.85rem;">' + e.pieces + ' pcs' + (used ? ' · 箱に反映済み / in a box' : ' · 次の箱に入ります / goes in the next box') + '</div></div>' +
          (used ? '' : '<button type="button" data-del="' + esc(e.id) + '" style="' + btnCss('#FEE4E2', '#B42318', '#FDA29B') + 'margin:0;width:56px;">✕</button>') + '</div>';
      }).join('');
      $('scnaSpareBody').innerHTML =
        '<h3 style="margin:0;font-size:1.2rem;text-align:center;">スペアからの部分数 / Partial from Spare</h3>' +
        (rows || '<p style="color:#6B7280;margin:12px 0;text-align:center;">なし / None</p>') +
        '<div style="text-align:right;font-weight:800;margin-top:10px;">合計 / Total: ' + spareTotal() + '</div>' +
        '<button type="button" data-add="1" style="' + btnCss('#fff', '#2E6FF2', '#2E6FF2') + '">＋ 追加 / Add</button>' +
        '<button type="button" data-done="1" style="' + btnCss('#2E6FF2', '#fff') + '">完了 / Done</button>';
    };
    draw();
    el.addEventListener('click', function (ev) {
      var b = ev.target.closest && ev.target.closest('button');
      if (!b) { if (ev.target === el) el.remove(); return; }
      if (b.hasAttribute('data-done')) { el.remove(); return; }
      if (b.hasAttribute('data-add')) { addSpareEntry(draw); return; }
      if (b.hasAttribute('data-del')) {
        var id = b.getAttribute('data-del');
        lsSet(SPARE_KEY, SCNA.spareEntries().filter(function (e) { return e.id !== id || e.consumedByBoxUid; }));
        refreshSpareField(); draw();
      }
    });
  }

  function injectPartialSpare() {
    var pq = $('ProcessQuantity');
    if (!pq || $('partial-from-spare')) return;
    var grp = pq.closest('.form-group');
    var box = document.createElement('div');
    box.className = 'form-group';
    box.innerHTML = '<label for="partial-from-spare">スペアからの部分数 / Partial from Spare</label>' +
      '<input type="text" name="partial-from-spare" id="partial-from-spare" class="tap-field" ' +
      'placeholder="タップして追加 / Tap to add" readonly>';
    grp.parentNode.insertBefore(box, grp.nextSibling);
    // A number typed with the old single box (mid-run upgrade) becomes one entry without a lot number
    var old = parseInt(lsGet('partial-from-spare', ''), 10) || 0;
    if (old > 0 && !SCNA.spareEntries().length) {
      lsSet(SPARE_KEY, [{ id: 'sp-legacy', lotNumber: '', pieces: old, at: new Date().toISOString(), worker: '', consumedByBoxUid: null }]);
    }
    refreshSpareField();
    $('partial-from-spare').addEventListener('click', openSpareManager);
  }

  /* ------------------------------------------------------------------ */
  /* 9. 2-hour quality check (120 min working time, 15 min snooze)       */
  /* ------------------------------------------------------------------ */

  var CHECK_MIN = 120;
  var SNOOZE_MIN = 15;
  var twoHourTimer = null;

  function checks() { return lsGet('scnaTwoHourChecks', []); }

  SCNA.twoHourPayload = function () {
    var list = checks();
    var obj = {};
    list.forEach(function (c, i) {
      obj['check' + (i + 1)] = {
        checkerName: c.inspectorName, timestamp: c.timestamp, checkTime: c.checkTime, checkNumber: i + 1
      };
    });
    return {
      totalChecks: list.length,
      checks: obj,
      lastCheckTimestamp: list.length ? list[list.length - 1].timestamp : null
    };
  };

  function timeToDate(v, ref) {
    // "HH:MM" (today) or any Date-parsable value
    if (!v) return null;
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(v));
    if (m) { var d = new Date(ref || Date.now()); d.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0); return d; }
    var d2 = new Date(v); return isNaN(d2) ? null : d2;
  }

  // Break + maintenance milliseconds overlapping [from, to]
  function pauseOverlapMs(from, to) {
    var total = 0;
    function add(s, e) {
      if (!s) return;
      var end = e || to;
      var a = Math.max(s.getTime(), from.getTime()), b = Math.min(end.getTime(), to.getTime());
      if (b > a) total += b - a;
    }
    for (var i = 1; i <= 4; i++) {
      var st = $('break' + i + '-start'), en = $('break' + i + '-end');
      if (st && st.value) add(timeToDate(st.value, to), en && en.value ? timeToDate(en.value, to) : null);
    }
    var recs = (typeof maintenanceRecords !== 'undefined' && Array.isArray(maintenanceRecords)) ? maintenanceRecords : [];
    recs.forEach(function (r) {
      if (r && r.startTime) add(timeToDate(r.startTime, to), r.endTime ? timeToDate(r.endTime, to) : null);
    });
    return total;
  }
  function onBreakOrMaintenance() {
    for (var i = 1; i <= 4; i++) {
      var st = $('break' + i + '-start'), en = $('break' + i + '-end');
      if (st && st.value && !(en && en.value)) return true;
    }
    var recs = (typeof maintenanceRecords !== 'undefined' && Array.isArray(maintenanceRecords)) ? maintenanceRecords : [];
    return recs.some(function (r) { return r && r.startTime && !r.endTime; });
  }

  function twoHourTick() {
    var st = $('Start Time'), et = $('End Time'), dd = $('sub-dropdown');
    if (!st || !st.value || !dd || !dd.value) return;
    if (et && et.value) { return; }                         // work completed: stop checking
    if ($('scnaTwoHourModal')) return;                      // modal already showing
    if (onBreakOrMaintenance()) return;
    var snooze = lsGet('scnaTwoHourSnooze', null);
    if (snooze && Date.now() < snooze) return;

    var list = checks();
    var started = timeToDate(st.value, Date.now());
    var from = list.length ? new Date(list[list.length - 1].timestamp) : started;
    if (!from) return;
    var now = new Date();
    var workingMin = (now - from - pauseOverlapMs(from, now)) / 60000;
    if (workingMin >= CHECK_MIN) showTwoHourModal();
    updateTwoHourDisplay(workingMin);
  }

  // Tell the factory stop-call TV that this machine needs its 2-hour quality check (purple blink + sound).
  // Same path the other calls use (window.notifyStopCall -> POST /api/stop-call); never blocks the tablet.
  function notifyQualityCall(action) {
    try {
      if (typeof window.notifyStopCall === 'function') window.notifyStopCall(action, 'quality');
    } catch (e) { }
  }
  SCNA.clearQualityCall = function () { notifyQualityCall('clear'); };

  function showTwoHourModal() {
    var names = (typeof workerNamesData !== 'undefined' && Array.isArray(workerNamesData)) ? workerNamesData : [];
    var field = names.length
      ? '<select id="scnaThInspector" style="width:100%;padding:14px;font-size:1.05rem;border:1.5px solid #D1D5DB;border-radius:10px;">' +
      '<option value="">検査者を選択 / Select inspector</option>' +
      names.map(function (n) { return '<option value="' + esc(n) + '">' + esc(n) + '</option>'; }).join('') + '</select>'
      : '<input id="scnaThInspector" type="text" placeholder="検査者名 / Inspector name" ' +
      'style="width:100%;padding:14px;font-size:1.05rem;border:1.5px solid #D1D5DB;border-radius:10px;box-sizing:border-box;">';
    var el = overlay('scnaTwoHourModal',
      '<div style="font-size:48px;text-align:center;">🕐</div>' +
      '<h3 style="text-align:center;margin:6px 0;">2時間品質チェック / 2-Hour Quality Check</h3>' +
      '<p style="text-align:center;color:#6B7280;margin:0 0 14px;">品質チェックを行ってください<br>Please perform the quality check</p>' +
      field +
      '<button type="button" id="scnaThDone" style="' + btnCss('#16A34A', '#fff') + '">✅ チェック完了 / Check done</button>' +
      '<button type="button" id="scnaThSnooze" style="' + btnCss('#fff', '#B45309', '#F59E0B') + '">😴 ' + SNOOZE_MIN +
      '分後に再通知 / Snooze ' + SNOOZE_MIN + ' min</button>');
    el.style.zIndex = '100250';
    notifyQualityCall('activate');
    $('scnaThDone').onclick = function () {
      var name = ($('scnaThInspector').value || '').trim();
      if (!name) { toast('検査者名を選択してください / Please select an inspector'); return; }
      var list = checks();
      list.push({
        timestamp: new Date().toISOString(),
        inspectorName: name,
        checkTime: new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      });
      lsSet('scnaTwoHourChecks', list);
      lsDel('scnaTwoHourSnooze');
      el.remove();
      notifyQualityCall('clear');
      updateTwoHourDisplay();
    };
    $('scnaThSnooze').onclick = function () {
      lsSet('scnaTwoHourSnooze', Date.now() + SNOOZE_MIN * 60000);
      el.remove();
      notifyQualityCall('clear');   // the call comes back when the reminder reappears
    };
  }

  function updateTwoHourDisplay(workingMin) {
    var panel = $('panel-2'); if (!panel) return;
    var card = $('scnaTwoHourCard');
    if (!card) {
      card = document.createElement('div');
      card.id = 'scnaTwoHourCard'; card.className = 'glass-card';
      panel.appendChild(card);
    }
    var list = checks();
    var last = list.length ? list[list.length - 1] : null;
    card.innerHTML = '<h3>2時間品質チェック / 2-Hour Quality Check</h3>' +
      '<div style="font-size:.95rem;line-height:1.7;">実施回数 / Done: ' +
      '<button type="button" id="scnaTwoHourList" style="border:0;background:#E8F0FE;color:#1D4ED8;font-weight:800;font-size:1rem;' +
      'padding:2px 14px;border-radius:999px;cursor:pointer;text-decoration:underline;">' + list.length + '</button>' +
      (last ? '<br>最終 / Last: ' + esc(last.checkTime) + ' · ' + esc(last.inspectorName) : '') +
      (typeof workingMin === 'number' ? '<br><span style="color:#6B7280;font-size:.82rem;">次回まで約 ' +
        Math.max(0, Math.round(CHECK_MIN - workingMin)) + ' 分 / next in ~' + Math.max(0, Math.round(CHECK_MIN - workingMin)) + ' min</span>' : '') +
      '</div>';
    var lb = $('scnaTwoHourList');
    if (lb) lb.onclick = showTwoHourHistory;
  }

  function showTwoHourHistory() {
    var list = checks();
    var rows = list.length ? list.map(function (c, i) {
      return '<div style="display:flex;gap:12px;align-items:center;padding:12px 4px;border-bottom:1px solid #E5E7EB;">' +
        '<span style="min-width:28px;height:28px;border-radius:50%;background:#16A34A;color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;">' + (i + 1) + '</span>' +
        '<div><div style="font-weight:700;font-size:1.05rem;">' + esc(c.inspectorName) + '</div>' +
        '<div style="color:#6B7280;font-size:.88rem;">' + esc(c.checkTime) + '</div></div></div>';
    }).join('') : '<p style="text-align:center;color:#6B7280;margin:16px 0;">まだ実施されていません / No checks yet</p>';
    var el = overlay('scnaTwoHourHistory',
      '<h3 style="margin:0 0 6px;text-align:center;">2時間品質チェック履歴 / Quality check history</h3>' + rows +
      '<button type="button" data-close="1" style="' + btnCss('#2E6FF2', '#fff') + '">閉じる / Close</button>');
    el.addEventListener('click', function (ev) {
      if (ev.target === el || ev.target.closest('[data-close]')) el.remove();
    });
  }

  /* ------------------------------------------------------------------ */
  /* 10. Return to the tablet's home after submit / reset                */
  /* ------------------------------------------------------------------ */

  function wrapReset() {
    if (typeof window.resetForm !== 'function' || window.resetForm.__scna) return;
    var orig = window.resetForm;
    var wrapped = function () {
      var r;
      try {
        lsDel('scnaWO'); lsDel(CYCLE_MARKS_KEY); lsDel(RUN_KEY); lsDel('scnaTwoHourChecks'); lsDel('scnaTwoHourSnooze'); lsDel('partial-from-spare'); lsDel(SPARE_KEY);
      } catch (e) { }
      notifyQualityCall('clear');
      r = orig.apply(this, arguments);
      return Promise.resolve(r).then(function (v) {
        // The original ends with location.reload(); when the URL is not the home link, go home instead.
        if (!SCNA.isAtHome()) SCNA.goHome();
        return v;
      });
    };
    wrapped.__scna = true;
    window.resetForm = wrapped;
  }

  /* ------------------------------------------------------------------ */
  /* 10b. Close button on the machine chooser (#lpModal)                 */
  /* ------------------------------------------------------------------ */

  // The backend only offers ✕ on the chooser during a production material scan; SCNA's
  // keypad lot entry opens it without one, leaving the operator stuck.
  function addChooserClose() {
    var ov = $('lpModal');
    var card = ov && ov.firstElementChild;
    if (!card || card.__scnaClose || !card.querySelector('[data-m]')) return;
    card.__scnaClose = true;
    if (card.querySelector('button[aria-label="Close"]')) return;
    card.style.position = 'relative';
    var x = document.createElement('button');
    x.type = 'button'; x.innerHTML = '✕'; x.setAttribute('aria-label', 'Close');
    x.style.cssText = 'position:absolute;top:16px;right:16px;background:none;border:none;font-size:1.4rem;' +
      'font-weight:bold;color:#667085;cursor:pointer;padding:0;line-height:1;z-index:10;';
    // The original hides Step 2 while the lot chooser is open: bring it back on close.
    var isLotChooser = (card.textContent || '').indexOf('Machine for this lot') >= 0;
    function close() {
      ov.remove();
      var s2 = $('step2Modal');
      if (isLotChooser && s2 && s2.style.display === 'none' && typeof showStep2Modal === 'function') showStep2Modal();
    }
    x.onclick = function (e) { e.stopPropagation(); close(); };
    card.appendChild(x);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
  }

  /* ------------------------------------------------------------------ */
  /* 10d. Step 1 scan accepts a work order QR (WO-xxxxxx)                */
  /* ------------------------------------------------------------------ */

  // The original Step 1 scan only accepts values that are in the 背番号 dropdown. Wrap the
  // scanner so a WO-number QR is handled as a work order; every other QR goes to the original code.
  function wrapStep1Scanner() {
    var Real = window.Html5Qrcode;
    if (!Real || Real.__scna) return;
    var Wrapped = class extends Real {
      constructor(id, cfg) { super(id, cfg); this.__scnaId = id; }
      start(cam, cfg, ok, err) {
        var self = this, handling = false, orig = ok;
        if (self.__scnaId === 'step1QrReader' && typeof ok === 'function') {
          ok = function (text) {
            var wo = /^WO-\d+$/i.exec(String(text || '').trim());
            if (!wo) return orig.apply(this, arguments);
            if (handling) return;
            handling = true;
            handleScannedWorkOrder(self, wo[0].toUpperCase());
          };
        }
        return super.start(cam, cfg, ok, err);
      }
    };
    Wrapped.__scna = true;
    window.Html5Qrcode = Wrapped;
  }

  async function handleScannedWorkOrder(scanner, number) {
    try { await scanner.stop(); } catch (e) { }
    try { step1Scanner = null; } catch (e) { }
    var sc = $('step1Scanner'), ct = $('step1Content');
    if (sc) sc.style.display = 'none';
    if (ct) ct.style.display = 'flex';
    var wo = null;
    try {
      wo = (await fetchWorkOrders() || []).filter(function (w) { return String(w.Number).toUpperCase() === number; })[0];
    } catch (e) { console.error('SCNA: work order scan lookup failed', e); }
    if (!wo) {
      toast('❌ ワークオーダーが見つかりません / Work order not found: ' + number);
      return;
    }
    selectWorkOrder(wo);
  }

  /* ------------------------------------------------------------------ */
  /* 10c. Always-available Reset on the scan page                        */
  /* ------------------------------------------------------------------ */

  // Steps 1-3 have their own Reset button; worker select and Scan completed have none, so this
  // floating one covers those two. It sits below the pickers / leader dialogs.
  function injectGlobalReset() {
    if ($('scnaResetBtn')) return;
    var b = document.createElement('button');
    b.type = 'button'; b.id = 'scnaResetBtn';
    b.textContent = '↺ リセット / Reset';
    b.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:64px;z-index:100050;display:none;padding:10px 16px;' +
      'border-radius:999px;border:1.5px solid #DC2626;background:#fff;color:#DC2626;font-weight:800;' +
      'font-size:.9rem;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25);font-family:inherit;';
    b.onclick = function () {
      var msg = 'リセットして最初からやり直しますか？ / Reset and start over?';
      if (!window.confirm(msg)) return;
      currentWO = null;
      if (typeof window.resetAllSteps === 'function') window.resetAllSteps();
      else if (typeof resetAllSteps === 'function') resetAllSteps();
      else window.location.reload();
    };
    document.body.appendChild(b);
    setInterval(function () {
      // Only where the page has no reset of its own: worker select (Step 0) and Scan completed.
      var p = $('panel-0');
      var s0 = $('step0Modal'), done = $('scanCompletedCard');
      // Tabs are panels in a sliding strip, so "on screen" means the panel sits over the viewport centre.
      var r = p && p.getBoundingClientRect();
      var onScanTab = !!r && r.left < window.innerWidth / 2 && r.right > window.innerWidth / 2;
      var show = onScanTab &&
        ((s0 && s0.style.display !== 'none' && s0.offsetParent !== null) ||
         (done && done.style.display !== 'none' && done.offsetParent !== null));
      b.style.display = show ? '' : 'none';
    }, 500);
  }

  /* ------------------------------------------------------------------ */
  /* 10b. Label layout choice for the mini-PC print server               */
  /* ------------------------------------------------------------------ */

  // An item can have several label layouts (admin SCNA > Label Designer). When the print button goes to
  // the mini-PC print server (printLabel's :5001 path), ask which layout to print if there is more than
  // one, then send it as &layoutId=. One layout (or none) keeps the old behaviour: the server picks it.
  var printLayoutId = null;

  // Values for named label elements (admin SCNA > Label Designer > Element ID), sent with every print:
  //   SCNA.labelValues.text_1 = 'hello';                  // fixed value
  //   SCNA.labelValues.text_2 = function () { return ... }; // evaluated at print time
  // The element with that ID prints the value instead of what the designer shows. An ID that is not in the
  // chosen layout is ignored by the print server (it logs a warning).
  SCNA.boxId = '';   // set by the box flow (plan Phase 5) before each print; appended to the qr_1 value
  SCNA.labelValues = {};
  SCNA.setLabelValue = function (id, value) { SCNA.labelValues[id] = value; };
  SCNA.clearLabelValues = function () { SCNA.labelValues = {}; };

  function collectLabelValues() {
    var out = {};
    var src = SCNA.labelValues || {};
    Object.keys(src).forEach(function (id) {
      var v = src[id];
      if (typeof v === 'function') { try { v = v(); } catch (e) { console.warn('SCNA.labelValues.' + id + ' failed:', e); return; } }
      if (v !== undefined && v !== null) out[id] = String(v);
    });
    return out;
  }

  async function fetchPrintLayouts(sebanggo) {
    try {
      var res = await fetch(window.serverURL + '/api/scna-label-layouts/for-item?sebanggo=' + encodeURIComponent(sebanggo));
      if (!res.ok) return [];
      var body = await res.json();
      return Array.isArray(body.layouts) ? body.layouts : [];
    } catch (e) { return []; }   // offline: let the print server choose
  }

  function chooseLabelLayout(layouts) {
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:10002;padding:20px;';
      var box = document.createElement('div');
      box.style.cssText = 'background:#fff;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.3);width:min(420px,100%);max-height:80vh;display:flex;flex-direction:column;padding:24px;';
      box.innerHTML = '<h3 style="margin:0 0 6px;font-size:22px;text-align:center;">ラベルを選択 / Select label</h3>' +
        '<p style="margin:0 0 14px;color:#555;text-align:center;">どのラベルを印刷しますか？ / Which label do you want to print?</p>';
      var list = document.createElement('div');
      list.style.cssText = 'display:flex;flex-direction:column;gap:10px;overflow-y:auto;';
      function done(v) { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); resolve(v); }
      layouts.forEach(function (l) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = l.name;
        b.style.cssText = 'padding:16px;font-size:20px;font-weight:700;border:none;border-radius:8px;background:#0d6efd;color:#fff;cursor:pointer;';
        b.onclick = function () { done(l.layoutId); };
        list.appendChild(b);
      });
      var cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.textContent = 'Cancel';
      cancel.style.cssText = 'margin-top:14px;padding:12px 20px;border:none;border-radius:8px;background:#adb5bd;color:#fff;cursor:pointer;';
      cancel.onclick = function () { done(null); };
      box.appendChild(list);
      box.appendChild(cancel);
      overlay.appendChild(box);
      overlay.addEventListener('click', function (e) { if (e.target === overlay) done(null); });
      document.body.appendChild(overlay);
    });
  }

  function wrapLabelPrint() {
    var origPrompt = window.promptLaptopAutoPrintCopies;
    var origRequest = window.request047JAutoPrint;
    if (typeof origPrompt !== 'function' || typeof origRequest !== 'function') return;

    // Runs first inside printLabel's printer-server branch: layout choice, then the copies dialog.
    window.promptLaptopAutoPrintCopies = async function () {
      printLayoutId = null;
      var sebanggo = (($('sub-dropdown') || {}).value || '').trim();
      var layouts = sebanggo ? await fetchPrintLayouts(sebanggo) : [];
      if (layouts.length > 1) {
        var chosen = await chooseLabelLayout(layouts);
        if (!chosen) return null;   // cancelled
        printLayoutId = chosen;
      }
      return origPrompt.call(this, 1);   // SCNA default is 1 copy (the shared default is 3)
    };

    window.request047JAutoPrint = async function (machineName, sebanggo, copies) {
      var layoutId = printLayoutId;
      printLayoutId = null;
      var overrides = collectLabelValues();
      // Box traceability: the layout's qr_1 stays {品番},{収容数},{lotNumber}; the tablet sends that same text
      // with the box ID appended. The print server fills the {fields}. An explicit qr_1 value is left alone.
      if (SCNA.boxId && !('qr_1' in overrides)) {
        overrides.qr_1 = '{品番},{収容数},{lotNumber},' + String(SCNA.boxId);
      }
      // A text element with Element ID box_id prints the box ID as readable text (ignored if the layout has none)
      if (SCNA.boxId && !('box_id' in overrides)) overrides.box_id = String(SCNA.boxId);
      // text_9 shows the date (the print server's {lotNumber}, yyyymmdd) followed by the box ID: 20261022 - WO-9999-B001
      if (SCNA.boxId && !('text_9' in overrides)) overrides.text_9 = '{lotNumber} - ' + String(SCNA.boxId);
      var params = { filename: sebanggo, qty: String(copies) };
      if (layoutId) params.layoutId = layoutId;
      if (Object.keys(overrides).length) params.overrides = JSON.stringify(overrides);
      var printerIP = await resolveEquipmentPrinterIP(machineName);
      var url = 'http://' + printerIP + ':5001/request?' + new URLSearchParams(params).toString();
      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, 10000);
      try {
        var response = await fetch(url, { method: 'GET', signal: controller.signal });
        var text = await response.text();
        var payload = {};
        if (text) { try { payload = JSON.parse(text); } catch (e) { payload = { success: response.ok, error: text }; } }
        if (!response.ok || payload.success === false) {
          throw new Error('HTTP ' + response.status + ': ' + (payload.error || 'Printer server returned HTTP ' + response.status));
        }
        return { printerIP: printerIP, payload: payload };
      } catch (e) {
        if (e.name === 'AbortError') throw new Error('Label print request timed out / ラベル印刷リクエストがタイムアウトしました');
        throw e;
      } finally { clearTimeout(timer); }
    };

    // SCNA always prints through the mini-PC print server (:5001): the original printLabel only does that
    // for 047J items and sends everything else to the Brother app. With no 背番号 selected the original
    // runs unchanged, so its "Sebanggo is required" alert still shows.
    var origPrintLabel = window.printLabel;
    if (typeof origPrintLabel !== 'function') return;
    window.printLabel = async function () {
      var sebanggo = (($('sub-dropdown') || {}).value || '').trim();
      if (!sebanggo) return origPrintLabel.apply(this, arguments);
      var machine = (($('process') || {}).value || '').trim();

      var boxId = await prepareBox();   // server-issued box ID (blocks the print when the server is unreachable)
      if (!boxId) return;
      var copies = await window.promptLaptopAutoPrintCopies();   // layout choice (if several), then copies
      if (copies === null) return;

      if (typeof window.setPrintBtnState === 'function') window.setPrintBtnState('printing');
      try {
        var r = await window.request047JAutoPrint(machine, sebanggo, copies);
        markBoxPrinted();
        if (typeof window.setPrintBtnState === 'function') window.setPrintBtnState('success');
        if (typeof window.logTabletAction === 'function') {
          window.logTabletAction('SCNA label print success', 'Completed', {
            machine: machine, 背番号: sebanggo, copies: copies, boxId: boxId, printerIP: r.printerIP,
            productNumber: (r.payload && r.payload.productNumber) || '', lotNumber: (r.payload && r.payload.lotNumber) || ''
          });
        }
      } catch (e) {
        console.error('SCNA label print failed:', e);
        if (typeof window.setPrintBtnState === 'function') window.setPrintBtnState('error', e.message);
        if (typeof window.logTabletAction === 'function') {
          window.logTabletAction('SCNA label print failed', 'in-progress', { machine: machine, 背番号: sebanggo, copies: copies, error: e.message });
        }
      }
    };
  }

  // Cycle times per machine and lot for analytics (submit only): from the listener's timestamped cycle log, for the
  // cycles between each lot's cyclesTotalStart and cyclesTotalEnd. A cycle time is the gap between two finished cuts
  // (feed and short pauses included); the median is used so a break or a stop does not skew it.
  function median(a) {
    if (!a.length) return null;
    var b = a.slice().sort(function (x, y) { return x - y; }), h = b.length >> 1;
    return b.length % 2 ? b[h] : (b[h - 1] + b[h]) / 2;
  }
  var round2 = function (v) { return v == null ? null : Math.round(v * 100) / 100; };

  // cycles: [{ n, ts }] ; the lot owns cycles start < n <= end. Intervals only between consecutive numbers inside it.
  function cycleTimeStats(cycles, start, end) {
    var mine = cycles.filter(function (c) { return c.n > start && c.n <= end; }).sort(function (a, b) { return a.n - b.n; });
    if (!mine.length) return null;
    var gaps = [];
    for (var i = 1; i < mine.length; i++) {
      if (mine[i].n !== mine[i - 1].n + 1) continue;
      var dt = (Date.parse(mine[i].ts) - Date.parse(mine[i - 1].ts)) / 1000;
      if (dt > 0) gaps.push(dt);
    }
    return { firstCycleAt: mine[0].ts, lastCycleAt: mine[mine.length - 1].ts, cycles: mine.length, gaps: gaps };
  }

  SCNA.addCycleTimes = async function (bodyStr) {
    try {
      var b = JSON.parse(bodyStr);
      var lots = (b.Lot_Details || []).filter(function (l) { return l.cyclesTotalStart != null && l.cyclesTotalEnd != null; });
      if (!lots.length) return bodyStr;
      var machines = [];
      lots.forEach(function (l) { if (machines.indexOf(l.machine) < 0) machines.push(l.machine); });
      var logs = {};
      await Promise.all(machines.map(async function (m) {
        var minStart = Math.min.apply(null, lots.filter(function (l) { return l.machine === m; }).map(function (l) { return l.cyclesTotalStart; }));
        var st = await fetchCycleState(m);
        if (st.auto && st.log) logs[m] = await fetchCycleLog(st, minStart);
      }));
      var perMachine = {};
      lots.forEach(function (l) {
        var log = logs[l.machine];
        if (!log) return;
        var st = cycleTimeStats(log, l.cyclesTotalStart, l.cyclesTotalEnd);
        if (!st) return;
        l.firstCycleAt = st.firstCycleAt; l.lastCycleAt = st.lastCycleAt;
        l.cycleSecMedian = round2(median(st.gaps));
        l.cycleSecMin = st.gaps.length ? round2(Math.min.apply(null, st.gaps)) : null;
        l.cycleSecMax = st.gaps.length ? round2(Math.max.apply(null, st.gaps)) : null;
        l.cycleIntervals = st.gaps.length;
        var pm = perMachine[l.machine] || (perMachine[l.machine] = { machine: l.machine, cycles: 0, pieces: 0, firstCycleAt: st.firstCycleAt, lastCycleAt: st.lastCycleAt, gaps: [] });
        pm.cycles += st.cycles; pm.pieces += (l.pieces || 0); pm.gaps = pm.gaps.concat(st.gaps);
        if (st.firstCycleAt < pm.firstCycleAt) pm.firstCycleAt = st.firstCycleAt;
        if (st.lastCycleAt > pm.lastCycleAt) pm.lastCycleAt = st.lastCycleAt;
      });
      var summary = Object.keys(perMachine).map(function (m) {
        var x = perMachine[m];
        return { machine: x.machine, cycles: x.cycles, pieces: x.pieces, firstCycleAt: x.firstCycleAt, lastCycleAt: x.lastCycleAt,
          cycleSecMedian: round2(median(x.gaps)), cycleIntervals: x.gaps.length };
      });
      if (summary.length) b.Machine_Summary = summary;
      return JSON.stringify(b);
    } catch (e) {
      console.warn('SCNA cycle times skipped:', e);
      return bodyStr;
    }
  };

  /* ------------------------------------------------------------------ */
  /* 10f. Run + box flow (unique box ID per printed box)                 */
  /* ------------------------------------------------------------------ */

  // Run = one session from the first scan to data submission (cleared by Reset / after submit). A box = the production
  // between two prints: the cycles_total difference since the previous box, split by lot, plus unused spare entries.
  // The server issues the box ID; no print without it (D4). Stored payload + boxUid make a retry or reload safe.
  var RUN_KEY = 'scnaRun';
  function newUid(prefixStr) {
    var a = new Uint8Array(8);
    try { crypto.getRandomValues(a); } catch (e) { for (var i = 0; i < 8; i++) a[i] = Math.floor(Math.random() * 256); }
    return prefixStr + Date.now().toString(36) + Array.prototype.map.call(a, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  }
  function getRun() {
    var run = lsGet(RUN_KEY, null);
    if (!run || !run.runId) {
      run = { runId: newUid('run-'), startedAt: new Date().toISOString(), lastSnapshot: { perMachine: {} }, pendingBox: null, lastPrinted: null, boxIds: [] };
      lsSet(RUN_KEY, run);
    }
    return run;
  }
  function saveRun(run) { lsSet(RUN_KEY, run); }
  SCNA.getRun = getRun;

  // The page keeps its lot records in localStorage (its own variable is private to its script)
  function readLots() { var l = lsGet('lotsByMachine', {}); return (l && typeof l === 'object') ? l : {}; }

  function lotPcPerCycle(machine, lot) {
    try {
      var list = readLots()[machine] || [];
      for (var i = list.length - 1; i >= 0; i--) if (list[i].lotNumber === lot && list[i].pcPerCycle != null) return list[i].pcPerCycle;
    } catch (e) { }
    return null;
  }

  // Machine part of a box, from the cycles_total readings. Pure: no network.
  //   totals: { machine: { auto, total } }   cap: 収容数 minus spare pieces (0 / null = no cap)
  // Without a cap the box is everything since the previous box. With one, machines are scaled in proportion to what
  // each produced (so the faster machine puts in more), within a machine the oldest cycles go first, and the cycles
  // left over stay in the counter for the next box (nextSnap only advances by what was used).
  function sliceBox(run, totals, cap) {
    var machines = SCNA.activeMachines();
    var marks = cycleMarks();
    var per = [], lots = [], notes = [], approximate = false, nextSnap = {};
    machines.forEach(function (m) {
      var list = marks[m] || [];
      var st = totals[m] || { auto: false, total: null };
      var prev = run.lastSnapshot.perMachine[m];
      var prevTotal = prev ? prev.total : (list.length && list[0].start != null ? list[0].start : null);
      if (!list.length) { approximate = true; notes.push(m + ': no lot recorded'); return; }
      if (!st.auto || prevTotal == null || list.some(function (l) { return l.start == null; })) {
        approximate = true; notes.push(m + ': count not available (manual)');
        var open = list[list.length - 1];
        lots.push({ source: 'machine', lotNumber: open.lotNumber, machine: m, shots: null, pieces: null, countSource: 'unknown' });
        if (st.auto) nextSnap[m] = { total: st.total };
        return;
      }
      var segs = [], produced = 0;
      for (var i = 0; i < list.length; i++) {
        var from = Math.max(list[i].start, prevTotal);
        var to = Math.min(i + 1 < list.length ? list[i + 1].start : st.total, st.total);
        var cyc = to - from;
        if (!(cyc > 0)) continue;
        var pc = lotPcPerCycle(m, list[i].lotNumber);
        // pieces of the first cycle already went into the previous box (split cycle)
        var less = (!segs.length && prev && prev.partial && from === prevTotal) ? prev.partial : 0;
        segs.push({ lotNumber: list[i].lotNumber, cycles: cyc, pc: pc, less: less });
        produced += cyc * (pc || 0) - less;
      }
      per.push({ machine: m, prevTotal: prevTotal, now: st.total, segs: segs, produced: produced, take: null });
    });

    var allKnown = per.every(function (x) { return x.segs.every(function (g) { return g.pc != null; }); });
    var producedAll = per.reduce(function (n, x) { return n + x.produced; }, 0);
    var capped = !!(cap && cap > 0 && allKnown && producedAll > cap);
    if (capped) {
      // proportional share per machine, oldest cycles first inside it
      per.forEach(function (x) {
        var share = cap * x.produced / producedAll, left = share, used = 0;
        x.take = x.segs.map(function (g) {
          var c = Math.min(g.cycles, Math.floor(left / g.pc));
          left -= c * g.pc; used += c * g.pc;
          return c;
        });
        x.used = used;
      });
      // top up with whole cycles while they still fit (rounding), the machine with the most left over first
      var usedAll = per.reduce(function (n, x) { return n + x.used; }, 0), moved = true;
      while (moved) {
        moved = false;
        var order = per.slice().sort(function (p, q) { return (q.produced - q.used) - (p.produced - p.used); });
        for (var k = 0; k < order.length; k++) {
          var x = order[k];
          for (var j = 0; j < x.segs.length; j++) {
            if (x.take[j] < x.segs[j].cycles && usedAll + x.segs[j].pc <= cap) {
              x.take[j]++; x.used += x.segs[j].pc; usedAll += x.segs[j].pc; moved = true; break;
            }
          }
          if (moved) break;
        }
      }
      notes.push('capped to ' + cap + ' machine pieces: produced ' + producedAll + ', carried over ' + (producedAll - usedAll));
    }
    per.forEach(function (x) {
      var consumed = 0;
      x.segs.forEach(function (g, j) {
        var c = capped ? x.take[j] : g.cycles;
        consumed += c;
        if (c > 0) {
          var pcs = g.pc != null ? c * g.pc - (capped ? 0 : g.less) : null;
          lots.push({ source: 'machine', lotNumber: g.lotNumber, machine: x.machine, shots: (pcs != null && g.pc) ? Math.round(pcs / g.pc * 100) / 100 : c, pieces: pcs, countSource: 'auto' });
        }
      });
      nextSnap[x.machine] = { total: capped ? x.prevTotal + consumed : x.now, partial: 0 };
    });
    var machinePieces = lots.reduce(function (n, l) { return n + (l.pieces || 0); }, 0);
    return { lots: lots, nextSnap: nextSnap, approximate: approximate, notes: notes, capped: capped,
      producedPieces: producedAll, machinePieces: machinePieces, carriedPieces: capped ? producedAll - machinePieces : 0 };
  }

  // Exact box fill from the listener's timestamped cycle log (cycle_log_v1): all cycles since each machine's last box are
  // merged by time and the OLDEST are taken until the box is full (spare first). Each machine's snapshot then moves to the
  // last of its cycles that went in; the rest stay for the next box. Pure function of its inputs.
  //   logs: { machine: [ { n, ts } ] } (cycles after the machine's last snapshot)   cap: machine pieces that fit (0 = all)
  // Returns null when a machine's log is incomplete (cycle numbers missing): the caller then falls back to sliceBox.
  function sliceBoxTimed(run, totals, logs, cap) {
    var machines = SCNA.activeMachines();
    var marks = cycleMarks();
    var cycles = [], notes = [], approximate = false, prevOf = {}, partialOf = {};
    for (var mi = 0; mi < machines.length; mi++) {
      var m = machines[mi];
      var list = marks[m] || [];
      var st = totals[m] || { auto: false, total: null };
      var prev = run.lastSnapshot.perMachine[m];
      var prevTotal = prev ? prev.total : (list.length && list[0].start != null ? list[0].start : null);
      if (!list.length || !st.auto || prevTotal == null || list.some(function (l) { return l.start == null; })) return null;
      var log = logs[m];
      if (!log) return null;
      var need = st.total - prevTotal;
      var mine = log.filter(function (c) { return c.n > prevTotal && c.n <= st.total; });
      if (mine.length !== need) return null;                    // gap in the log: do not guess
      mine.sort(function (a, b) { return a.n - b.n; });
      prevOf[m] = prevTotal;
      var prevPartial = (prev && prev.partial) || 0;   // pieces of the next cycle that already went into the previous box
      partialOf[m] = prevPartial;
      mine.forEach(function (c) {
        var idx = -1;
        for (var i = 0; i < list.length; i++) if (c.n > list[i].start) idx = i;   // cycle belongs to the last lot started before it
        if (idx < 0) return;
        var pc = lotPcPerCycle(m, list[idx].lotNumber);
        var pre = (prevPartial && c.n === prevTotal + 1) ? prevPartial : 0;
        cycles.push({ machine: m, n: c.n, ts: c.ts, t: Date.parse(c.ts) || 0, lot: list[idx].lotNumber, pc: pc, pre: pre, avail: pc - pre });
      });
    }
    if (cycles.some(function (c) { return c.pc == null; })) return null;
    cycles.sort(function (a, b) { return (a.t - b.t) || (a.n - b.n); });
    // oldest first; the cycle that does not fit whole is split: only the pieces that fit go in, the rest stays for the next box
    var taken = [], sum = 0;
    for (var k = 0; k < cycles.length; k++) {
      var c = cycles[k];
      if (cap && cap > 0 && sum + c.avail > cap) {
        var room = cap - sum;
        if (room > 0) { taken.push({ c: c, pieces: room, full: false }); sum += room; }
        break;
      }
      taken.push({ c: c, pieces: c.avail, full: true }); sum += c.avail;
    }
    var producedAll = cycles.reduce(function (n, c) { return n + c.avail; }, 0);
    var byKey = {}, lots = [], nextSnap = {};
    machines.forEach(function (m) {
      var mine = taken.filter(function (t) { return t.c.machine === m; });
      var fullCount = mine.filter(function (t) { return t.full; }).length;
      var last = mine[mine.length - 1];
      var partial = !mine.length ? partialOf[m] : (last && !last.full ? last.c.pre + last.pieces : 0);
      nextSnap[m] = { total: prevOf[m] + fullCount, partial: partial };
    });
    taken.forEach(function (t) {
      var c = t.c, key = c.machine + '|' + c.lot;
      var l = byKey[key];
      if (!l) { l = byKey[key] = { source: 'machine', lotNumber: c.lot, machine: c.machine, shots: 0, pieces: 0, countSource: 'auto', firstCycleAt: c.ts, lastCycleAt: c.ts }; lots.push(l); }
      l.shots += t.pieces / c.pc; l.pieces += t.pieces; l.lastCycleAt = c.ts;
    });
    lots.forEach(function (l) { l.shots = Math.round(l.shots * 100) / 100; });
    var capped = cap > 0 && producedAll > sum;
    if (capped) notes.push('exact fill by cycle time: produced ' + producedAll + ', carried over ' + (producedAll - sum));
    return { lots: lots, nextSnap: nextSnap, approximate: approximate, notes: notes, capped: capped, fillMethod: 'timed',
      producedPieces: producedAll, machinePieces: sum, carriedPieces: producedAll - sum };
  }

  function boxCapacity() { return parseInt((($('収容数') || {}).value || ''), 10) || 0; }

  // Build the box record from the cycle marks and the previous snapshot. Never throws: whatever cannot be counted
  // becomes an `approximate` box with the lot listed but no pieces.
  async function buildBoxPayload(run, spare) {
    var machines = SCNA.activeMachines();
    var totals = {};
    for (var mi = 0; mi < machines.length; mi++) totals[machines[mi]] = await fetchCycleState(machines[mi]);
    var spareSum = spare.reduce(function (n, e) { return n + (e.pieces || 0); }, 0);
    var qtyLabel = boxCapacity();
    var capMachine = qtyLabel ? Math.max(0, qtyLabel - spareSum) : 0;
    var r = null;
    var allLog = machines.length > 0 && machines.every(function (m) { return totals[m].auto && totals[m].log; });
    if (allLog) {
      var logs = {};
      for (var li = 0; li < machines.length; li++) {
        var mm = machines[li], pv = run.lastSnapshot.perMachine[mm];
        var mk = (cycleMarks()[mm] || [])[0];
        var after = pv ? pv.total : (mk && mk.start != null ? mk.start : 0);
        logs[mm] = await fetchCycleLog(totals[mm], after);
      }
      r = sliceBoxTimed(run, totals, logs, capMachine);
    }
    if (!r) {
      r = sliceBox(run, totals, capMachine);
      r.fillMethod = 'proportional';
      r.notes.push('cycle log not available: box split in proportion (not exact)');
    }
    var lots = r.lots;
    spare.forEach(function (e) { lots.push({ source: 'spare', lotNumber: e.lotNumber, pieces: e.pieces, machine: null, shots: null, countSource: 'spare' }); });
    var measured = r.machinePieces + spareSum;
    var hinban = (($('product-number') || {}).value || '') || (typeof currentProductDetails !== 'undefined' && currentProductDetails && currentProductDetails.hinban) || '';
    var workers = (window.selectedWorkerNames || []).filter(function (n) { return (n || '').trim(); });
    return {
      payload: {
        boxUid: newUid('box-'), runId: run.runId,
        workOrderNumber: currentWO ? currentWO.number : '',
        背番号: (($('sub-dropdown') || {}).value || '').trim(), 品番: hinban,
        machines: machines, Tablet_Home: legacyLabel(SCNA.home.length ? SCNA.home : SCNA.machines), worker: workers.join(','),
        startedAt: run.lastPrinted ? run.lastPrinted.printedAt : run.startedAt, finishedAt: new Date().toISOString(),
        qtyLabel: qtyLabel || null, qtyMeasured: measured,
        lots: lots, snapshot: r.nextSnap, approximate: r.approximate, notes: r.notes.concat(
          r.capped ? [] : (qtyLabel && measured < qtyLabel ? ['under 収容数: ' + measured + ' of ' + qtyLabel] : [])),
        fillMethod: r.fillMethod, capped: r.capped, producedSinceLastBox: r.producedPieces + spareSum, carriedOverPieces: r.carriedPieces
      },
      nextSnap: r.nextSnap, spareIds: spare.map(function (e) { return e.id; })
    };
  }

  async function postBox(payload) {
    var res = await fetch(window.serverURL + '/api/scna-boxes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  function askBoxChoice(lastId, printed) {
    return new Promise(function (resolve) {
      var el = overlay('scnaBoxChoice',
        '<h3 style="margin:0;font-size:1.2rem;text-align:center;">' + esc(lastId) + (printed ? ' は印刷済み / already printed' : ' (印刷未完了 / print not finished)') + '</h3>' +
        '<button type="button" data-r="1" style="' + btnCss('#fff', '#2E6FF2', '#2E6FF2') + '">同じ箱を再印刷 / Reprint ' + esc(lastId) + '</button>' +
        '<button type="button" data-n="1" style="' + btnCss('#2E6FF2', '#fff') + '">新しい箱 / New box</button>' +
        '<button type="button" data-x="1" style="' + btnCss('#fff', '#344054', '#D0D5DD') + '">キャンセル / Cancel</button>');
      el.style.zIndex = '100300';
      el.addEventListener('click', function (ev) {
        var b = ev.target.closest && ev.target.closest('button');
        if (!b) return;
        el.remove();
        resolve(b.hasAttribute('data-r') ? 'reprint' : b.hasAttribute('data-n') ? 'new' : null);
      });
    });
  }

  // -> box ID to print, or null (cancelled / blocked). Sets SCNA.boxId.
  async function prepareBox() {
    var run = getRun();
    var choice = 'new';
    if (!run.pendingBox && run.lastPrinted) {
      choice = await askBoxChoice(run.lastPrinted.boxId, run.lastPrinted.printed);
      if (!choice) return null;
    }
    if (choice === 'reprint') { SCNA.boxId = run.lastPrinted.boxId; return SCNA.boxId; }

    var pending = run.pendingBox;
    if (!pending) {
      var built;
      try { built = await buildBoxPayload(run, SCNA.pendingSpare()); }
      catch (e) {
        console.error('SCNA box build failed:', e);
        built = { payload: { boxUid: newUid('box-'), runId: run.runId, workOrderNumber: currentWO ? currentWO.number : '',
          背番号: (($('sub-dropdown') || {}).value || '').trim(), lots: [], approximate: true, notes: ['box build failed: ' + e.message],
          finishedAt: new Date().toISOString() }, nextSnap: {}, spareIds: [] };
      }
      pending = run.pendingBox = built;
      saveRun(run);   // reload / retry reuses this exact box
    }
    var box;
    try { box = await postBox(pending.payload); }
    catch (e) {
      toast('サーバーに接続できないため印刷できません / Cannot print: server unreachable (' + e.message + ')');
      return null;
    }
    // accepted: the slice is now committed, so the next box starts from here
    run = getRun();
    Object.keys(pending.nextSnap || {}).forEach(function (m) { run.lastSnapshot.perMachine[m] = pending.nextSnap[m]; });
    SCNA.consumeSpare(pending.spareIds || [], pending.payload.boxUid);
    run.boxIds = (run.boxIds || []).concat([box.boxId]);
    run.lastPrinted = { boxId: box.boxId, boxUid: pending.payload.boxUid, printedAt: new Date().toISOString(), printed: false };
    run.pendingBox = null;
    saveRun(run);
    SCNA.boxId = box.boxId;
    return box.boxId;
  }

  function markBoxPrinted() {
    var run = getRun();
    if (run.lastPrinted) { run.lastPrinted.printed = true; saveRun(run); }
  }

  SCNA.runPayload = function () {
    var run = lsGet(RUN_KEY, null);
    return run && run.runId ? { Run_ID: run.runId, Box_IDs: run.boxIds || [] } : {};
  };

  /* ------------------------------------------------------------------ */
  /* 10e. Live cycle count (listener cycles_total) at lot change         */
  /* ------------------------------------------------------------------ */

  // Needs the new listener (capabilities has live_cycle_count_v1). Anything else (old listener, offline, no IP,
  // error) leaves the page's plain shots keypad untouched. The cycle_total reading is taken when a lot is typed in;
  // the shots prompt later offers (reading at the next lot's entry - reading at this lot's entry) to Confirm.
  var CYCLE_MARKS_KEY = 'scnaCycleMarks';   // { machine: [ { lotNumber, start, end, offered, source, at } ] }
  var CYCLE_CAP = 'live_cycle_count_v1';
  SCNA.cycleStatus = {};                    // machine -> { auto, total, at } from the last poll

  function cycleMarks() { return lsGet(CYCLE_MARKS_KEY, {}) || {}; }
  function lastMark(marks, machine, lot) {
    var list = marks[machine] || [];
    for (var i = list.length - 1; i >= 0; i--) if (list[i].lotNumber === lot) return { list: list, i: i };
    return null;
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

  // -> { auto, total } ; auto only for a new listener that is online with a numeric cycles_total
  async function fetchCycleState(machine) {
    var ip = listenerIP(machine);
    if (!ip) return { auto: false, total: null, log: false };
    var ports = [5000, 8766];
    // Test setups with two listeners on one PC: localStorage scnaListenerPorts = {"AOL-9": 5002} (used for the count/cycle log only)
    try { var po = JSON.parse(localStorage.getItem('scnaListenerPorts') || '{}'); if (po && po[machine]) ports = [parseInt(po[machine], 10)]; } catch (e) { }
    for (var i = 0; i < ports.length; i++) {
      try {
        var res = await fetch('http://' + ip + ':' + ports[i] + '/state', { cache: 'no-store', signal: AbortSignal.timeout(2000) });
        if (!res.ok) continue;
        var st = await res.json();
        var ok = Array.isArray(st.capabilities) && st.capabilities.indexOf(CYCLE_CAP) >= 0 &&
          st.cnc_online === true && typeof st.cycles_total === 'number' && isFinite(st.cycles_total);
        return { auto: ok, total: ok ? st.cycles_total : null, log: ok && st.capabilities.indexOf('cycle_log_v1') >= 0, ip: ip, port: ports[i] };
      } catch (e) { /* try the mirror port */ }
    }
    return { auto: false, total: null, log: false };
  }

  // Timestamped cycles of one machine after a given cycles_total: [{ n, ts }] or null (old listener / error)
  async function fetchCycleLog(st, afterN) {
    try {
      var res = await fetch('http://' + st.ip + ':' + st.port + '/cycles?after=' + afterN, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
      if (!res.ok) return null;
      var body = await res.json();
      return Array.isArray(body.cycles) ? body.cycles : null;
    } catch (e) { return null; }
  }

  // Called when a lot is typed in on a machine: remember the reading at that moment (null = manual lot)
  async function markLotStart(machine, lot) {
    try {
      var st = await fetchCycleState(machine);
      var marks = cycleMarks();
      var list = marks[machine] || (marks[machine] = []);
      var last = list[list.length - 1];
      if (last && last.lotNumber === lot && last.end == null) return;
      list.push({ lotNumber: lot, start: st.auto ? st.total : null, end: null, offered: null, source: null, at: new Date().toISOString() });
      lsSet(CYCLE_MARKS_KEY, marks);
    } catch (e) { console.warn('SCNA markLotStart failed:', e); }
  }

  // The end reading of a lot: stored end > next lot's start > a fresh reading (last lot of the machine)
  async function lotEndReading(machine, lot) {
    var found = lastMark(cycleMarks(), machine, lot);
    if (!found || found.list[found.i].start == null) return null;
    var m = found.list[found.i];
    if (m.end != null) return m.end;
    var next = found.list[found.i + 1];
    if (next) return next.start;           // may be null -> manual
    var st = await fetchCycleState(machine);
    return st.auto ? st.total : null;
  }

  function enhanceShotsPrompt() {
    var ov = $('lpModal');
    var card = ov && ov.firstElementChild;
    var disp = card && card.querySelector('#lpDisplay');
    var okBtn = card && card.querySelector('#lpOk');
    if (!disp || !okBtn || card.__scnaCount) return;
    card.__scnaCount = true;
    var divs = card.querySelectorAll('div');
    var machine = '', lot = '';
    for (var i = 0; i < divs.length; i++) {
      var t = (divs[i].textContent || '').trim();
      if (!machine && t && divs[i].children.length === 0 && !/^Lot:/.test(t)) machine = t;
      var lm = /^Lot:\s*(.+)$/.exec(t);
      if (lm && divs[i].children.length === 0) lot = lm[1].trim();
    }
    if (!machine || !lot) return;

    lotEndReading(machine, lot).then(function (end) {
      if (end == null || !document.body.contains(card)) return;
      var found = lastMark(cycleMarks(), machine, lot);
      if (!found) return;
      var offered = end - found.list[found.i].start;
      if (!(offered >= 0)) return;   // counter went backwards (listener reset): manual
      var keys = card.querySelector('#lpKeys');
      var confirmed = false;
      var bar = document.createElement('div');
      bar.style.cssText = 'margin-bottom:12px;padding:12px;border:2px solid #29C36A;border-radius:12px;background:#ECFDF3;text-align:center;';
      bar.innerHTML = '<div style="font-size:.85rem;font-weight:700;color:#027A48;">自動カウント / Auto count</div>' +
        '<div style="font-size:2.4rem;font-weight:900;color:#101828;line-height:1.2;">' + offered + '</div>' +
        '<button type="button" data-c="1" style="' + btnCss('#29C36A', '#fff') + '">確定 / Confirm</button>' +
        '<button type="button" data-m="1" style="' + btnCss('#fff', '#344054', '#D0D5DD') + '">手入力 / Manual entry</button>';
      disp.parentNode.insertBefore(bar, disp);
      disp.style.display = 'none'; keys.style.display = 'none'; okBtn.style.display = 'none';
      bar.querySelector('[data-c]').onclick = function () { confirmed = true; disp.value = String(offered); okBtn.click(); };
      bar.querySelector('[data-m]').onclick = function () {
        bar.remove(); disp.style.display = ''; keys.style.display = ''; okBtn.style.display = ''; disp.value = '';
      };
      // record what was offered and how the value was finalised (capture: runs before the page's own OK handler)
      okBtn.addEventListener('click', function () {
        try {
          var v = parseInt(disp.value, 10) || 0;
          var marks = cycleMarks();
          var f = lastMark(marks, machine, lot);
          if (!f) return;
          var m = f.list[f.i];
          m.end = end; m.offered = offered;
          m.source = (confirmed && v === offered) ? 'auto-confirmed' : 'manual';
          lsSet(CYCLE_MARKS_KEY, marks);
        } catch (e) { }
      }, true);
    }).catch(function (e) { console.warn('SCNA shots prompt enhancement skipped:', e); });
  }

  // Lot_Details of the submit payload get the count info
  SCNA.cycleLotInfo = function (machine, lot) {
    var f = lastMark(cycleMarks(), machine, lot);
    if (!f) return { countSource: 'manual' };
    var m = f.list[f.i];
    var info = { countSource: m.source || 'manual' };
    if (m.offered != null) info.shotsAuto = m.offered;
    if (m.start != null) info.cyclesTotalStart = m.start;
    if (m.end != null) info.cyclesTotalEnd = m.end;
    return info;
  };

  // Live Process Quantity: pieces of the closed lots (what the page already sums) + the open lot of each machine
  // measured from the listener count (cycles since the lot was typed in x pcPerCycle). When a lot is closed or the
  // final shots are confirmed, the page recalculates the field from the confirmed shots as before.
  function updateLiveQty(list) {
    var pq = $('ProcessQuantity');
    if (!pq || document.activeElement === pq) return;
    var marks = cycleMarks(), openPieces = 0, any = false, complete = true;
    list.forEach(function (m) {
      var ms = marks[m] || [];
      var cur = ms[ms.length - 1];
      var st = SCNA.cycleStatus[m];
      if (!cur || cur.end != null || cur.start == null || !st || !st.auto) { if (cur && cur.end == null) complete = false; return; }
      var pc = lotPcPerCycle(m, cur.lotNumber);
      if (pc == null) { complete = false; return; }
      var cycles = st.total - cur.start;
      if (!(cycles >= 0)) { complete = false; return; }
      openPieces += cycles * pc; any = true;
    });
    if (!any || !complete) return;
    var closed = 0;
    try {
      var lotsAll = readLots();
      Object.keys(lotsAll).forEach(function (m) {
        (lotsAll[m] || []).forEach(function (r) { if (r.shots != null && r.pieces != null) closed += r.pieces; });
      });
    } catch (e) { return; }
    var v = String(closed + openPieces);
    if (pq.value === v) return;
    pq.value = v;
    pq.readOnly = true;
    try { pq.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) { }
  }

  // Compact counts in the production tab's product card (right of 背番号 / 品番):
  //   AOL-8: 24 cc: 6          machine pieces since the last box, cc = cycle count behind them
  //   S: 5 To: 29              pending spare pieces, To = going in the box (machines + spare); one line for all machines
  //   AOL-9: manual    only machines that are NOT on auto count; nothing is shown when all are auto
  // Shows everything produced since the last print; the box itself is capped at 収容数 when printed, so after a print
  // the cell shows what was left over (e.g. box 75: 10 S: 0 To: 10).
  function updateCountCell(list) {
    var card = $('prodInfoCard');
    var cell = $('scnaCountCell');
    if (!card) return;
    if (!cell) {
      cell = document.createElement('div');
      cell.id = 'scnaCountCell';
      cell.style.cssText = 'display:flex;flex-direction:column;justify-content:space-between;align-self:stretch;gap:6px;' +
        'text-align:right;font-size:.8rem;font-weight:800;line-height:1.35;white-space:nowrap;';
      cell.innerHTML = '<div id="scnaCountRows" style="color:#101828;"></div><div id="scnaManualRows" style="color:#B54708;"></div>';
      card.appendChild(cell);
    }
    var run = lsGet(RUN_KEY, null);
    var haveLots = run && run.runId && Object.keys(cycleMarks()).length;
    var totals = {};
    list.forEach(function (m) { totals[m] = SCNA.cycleStatus[m] || { auto: false, total: null }; });
    var spareSum = SCNA.pendingSpare().reduce(function (n, e) { return n + (e.pieces || 0); }, 0);
    var r = haveLots ? sliceBox(run, totals, 0) : { lots: [] };
    var autoMachines = list.filter(function (m) { return totals[m].auto; });
    var manual = list.filter(function (m) { return !totals[m].auto; }).map(function (m) { return m + ': manual'; });
    var ccOf = function (m) { return r.lots.filter(function (l) { return l.machine === m && l.pieces != null; }).reduce(function (n, l) { return n + (l.shots || 0); }, 0); };
    var pcsOf = function (m) { return r.lots.filter(function (l) { return l.machine === m && l.pieces != null; }).reduce(function (n, l) { return n + l.pieces; }, 0); };
    var total = autoMachines.reduce(function (n, m) { return n + pcsOf(m); }, 0) + spareSum;
    var cap = boxCapacity();
    var rows = [];
    if (haveLots && autoMachines.length) {
      autoMachines.forEach(function (m) { rows.push(m + ': ' + pcsOf(m) + ' cc: ' + ccOf(m)); });
      rows.push('S: ' + spareSum + ' To: ' + total);
    }
    var html = rows.map(esc).join('<br>');
    if (cap && haveLots && total > cap) html = html.replace(/(To: \d+)/, '<span style="color:#B42318;">$1</span>');   // more than fits: the rest goes to the next box
    $('scnaCountRows').innerHTML = html;
    $('scnaManualRows').innerHTML = manual.map(esc).join('<br>');
  }

  function updateCountBadge() {
    var list = SCNA.activeMachines();
    Promise.all(list.map(function (m) { return fetchCycleState(m).then(function (st) { SCNA.cycleStatus[m] = { auto: st.auto, total: st.total, at: Date.now() }; }); }))
      .then(function () {
        updateCountCell(list);
        updateLiveQty(list);
      }).catch(function () { });
  }

  /* ------------------------------------------------------------------ */
  /* 11. Init                                                            */
  /* ------------------------------------------------------------------ */

  // Registered before the backend's own handlers, so the wrap is in place before they run.
  document.addEventListener('DOMContentLoaded', wrapReset);

  window.addEventListener('load', function () {
    try {
      // Worker names are saved by the original on pick but only reloaded on pages with pre-checklists;
      // reload them here so Step 0 asks "same worker?" after a refresh instead of starting empty.
      if (typeof window.loadWorkerNamesFromStorage === 'function') window.loadWorkerNamesFromStorage();
      relabelLotStep();
      wireKensa();
      injectWoButton();
      injectGlobalReset();
      wrapSentToast();
      wrapStep1Scanner();
      wrapLabelPrint();
      injectPartialSpare();
      updateTwoHourDisplay();

      var saved = lsGet('scnaWO', null);
      if (saved) { currentWO = saved; applyActiveMachines(); renderWoBanner(); }
      document.addEventListener('languageChanged', relabelLotStep);

      if (!twoHourTimer) twoHourTimer = setInterval(twoHourTick, 10000);
      resumePendingWO();
      new MutationObserver(addChooserClose).observe(document.body, { childList: true });
      new MutationObserver(function () { try { enhanceShotsPrompt(); } catch (e) { } }).observe(document.body, { childList: true });
      updateCountBadge();
      setInterval(updateCountBadge, 5000);
    } catch (e) { console.error('SCNA init failed:', e); }
  });
})();
