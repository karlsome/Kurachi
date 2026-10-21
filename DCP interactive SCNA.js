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

  var machines = parseMachines(qs.get('machine'));
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

  // SCNA keeps Process Quantity manual: block the interactive auto-calculation.
  window.__scnaManualQty = true;

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

  var origFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    try {
      var url = (typeof input === 'string') ? input : (input && input.url) || '';
      if (NC_RE.test(url) && typeof input === 'string') {
        var sb = sebanggoOfNcUrl(input);
        var prog = sb ? await chooseNcProgram(sb) : null;
        if (prog === false) return new Response('', { status: 499 });   // operator cancelled
        if (prog && prog._id) {
          var u = new URL(input, window.location.href);
          u.searchParams.delete('filename');
          u.searchParams.delete('mode');
          u.searchParams.delete('machine');
          u.searchParams.set('program_id', prog._id);
          input = u.toString();
          return await sendNcProgram(input, init, prog, sb);
        } else {
          input = stripNcParams(input);
        }
      } else if (/\/submitToDCP(\?|$)/.test(url) && init && String(init.method || '').toUpperCase() === 'POST' &&
        typeof init.body === 'string') {
        init = Object.assign({}, init, { body: SCNA.patchSubmit(init.body) });
      }
    } catch (e) { console.error('SCNA fetch hook failed (sending original):', e); }
    return origFetch(input, init);
  };
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
      b.設備 = currentWO && currentWO.assignedTo ? currentWO.assignedTo : legacyLabel(active);
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

      b['スペアからの部分数'] = parseInt(($('partial-from-spare') || {}).value, 10) || 0;
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

  function woFits(woMachines) {
    // A WO fits when all of its machines belong to the machines this page was opened with.
    return woMachines.length > 0 && woMachines.every(function (m) { return pageMachines.indexOf(m) >= 0; });
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
      esc(legacyLabel(pageMachines)) + '</b></p>' +
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

  function showWrongTablet(wo, assigned, ms) {
    var el = overlay('scnaWrongTablet',
      '<div style="font-size:42px;text-align:center;">⚠️</div>' +
      '<h3 style="text-align:center;margin:6px 0 10px;">このワークオーダーはこの機械用ではありません<br>' +
      '<span style="font-size:.9rem;font-weight:600;">This work order is not for this machine</span></h3>' +
      '<p style="text-align:center;margin:0;">' + esc(wo.Number) + ' → <b>' + esc(assigned) + '</b><br>' +
      'タブレット / Tablet: <b>' + esc(legacyLabel(pageMachines)) + '</b></p>' +
      '<button type="button" id="scnaWtOk" style="' + btnCss('#2E6FF2', '#fff') + '">OK</button>' +
      '<button type="button" id="scnaWtOverride" style="' + btnCss('#fff', '#6B7280', '#D1D5DB') +
      'font-size:.85rem;padding:9px;">リーダー承認で切り替え / Override (leader)</button>');
    $('scnaWtOk').onclick = function () { el.remove(); };
    $('scnaWtOverride').onclick = function () {
      if (typeof window.verifyLeaderUI !== 'function') { toast('Leader verification unavailable'); return; }
      el.remove();
      window.verifyLeaderUI(function () {
        try { localStorage.setItem(PENDING_WO_KEY, wo.Number); } catch (e) { }
        var u = new URLSearchParams();
        u.set('filter', 'SCNA');
        u.set('machine', ms.join(','));
        u.set('home', (SCNA.home.length ? SCNA.home : pageMachines).join(','));
        window.location.href = PAGE_PATH + '?' + u.toString();
      },
        'リーダー承認 / Leader approval',
        'このワークオーダーを別の機械で行うにはリーダーQRをスキャン<br>Scan leader QR to run this work order on another machine');
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

  async function applyWorkOrder(wo, assigned, ms) {
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
    host.innerHTML = '📋 ' + esc(currentWO.number) + ' · ' + esc(currentWO.assignedTo) + '<br>' +
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

  function relabelLotStep() {
    var b = $('startStep2Scan');
    if (b) b.textContent = '⌨ ロット番号を入力 / Enter lot number';
    var ov = $('overrideStep2');
    if (ov) ov.style.display = 'none';
  }

  /* ------------------------------------------------------------------ */
  /* 8. Partial from Spare                                               */
  /* ------------------------------------------------------------------ */

  function injectPartialSpare() {
    var pq = $('ProcessQuantity');
    if (!pq || $('partial-from-spare')) return;
    var grp = pq.closest('.form-group');
    var box = document.createElement('div');
    box.className = 'form-group';
    box.innerHTML = '<label for="partial-from-spare">スペアからの部分数 / Partial from Spare</label>' +
      '<input type="text" name="partial-from-spare" id="partial-from-spare" class="tap-field" ' +
      'placeholder="Partial from Spare" readonly>';
    grp.parentNode.insertBefore(box, grp.nextSibling);
    var inp = $('partial-from-spare');
    var saved = lsGet('partial-from-spare', '');
    if (saved !== '' && saved != null) inp.value = saved;
    inp.addEventListener('click', function () {
      if (typeof window.openDirectNumericKeypad === 'function') window.openDirectNumericKeypad('partial-from-spare', false);
    });
    inp.addEventListener('input', function () { lsSet('partial-from-spare', inp.value); });
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
      updateTwoHourDisplay();
    };
    $('scnaThSnooze').onclick = function () {
      lsSet('scnaTwoHourSnooze', Date.now() + SNOOZE_MIN * 60000);
      el.remove();
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
      '<div style="font-size:.95rem;line-height:1.7;">実施回数 / Done: <b>' + list.length + '</b>' +
      (last ? '<br>最終 / Last: ' + esc(last.checkTime) + ' · ' + esc(last.inspectorName) : '') +
      (typeof workingMin === 'number' ? '<br><span style="color:#6B7280;font-size:.82rem;">次回まで約 ' +
        Math.max(0, Math.round(CHECK_MIN - workingMin)) + ' 分 / next in ~' + Math.max(0, Math.round(CHECK_MIN - workingMin)) + ' min</span>' : '') +
      '</div>';
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
        lsDel('scnaWO'); lsDel('scnaTwoHourChecks'); lsDel('scnaTwoHourSnooze'); lsDel('partial-from-spare');
      } catch (e) { }
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
  /* 11. Init                                                            */
  /* ------------------------------------------------------------------ */

  // Registered before the backend's own handlers, so the wrap is in place before they run.
  document.addEventListener('DOMContentLoaded', wrapReset);

  window.addEventListener('load', function () {
    try {
      relabelLotStep();
      injectWoButton();
      injectPartialSpare();
      updateTwoHourDisplay();

      var saved = lsGet('scnaWO', null);
      if (saved) { currentWO = saved; applyActiveMachines(); renderWoBanner(); }
      document.addEventListener('languageChanged', relabelLotStep);

      if (!twoHourTimer) twoHourTimer = setInterval(twoHourTick, 10000);
      resumePendingWO();
    } catch (e) { console.error('SCNA init failed:', e); }
  });
})();
