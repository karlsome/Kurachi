// DCP interactive — dynamic press defect buttons (不良管理 lists).
// Loaded ONLY outside ?filter=SCNA, after DCP interactive backend.js.
//
// The press defect section (加工不良カウンター) shows the model's list from 不良管理:
//   GET /resolvedDefectList?process=pressDB&model=<モデル>  →  [{ id, jp, en }]  (その他 always last)
// Counts are kept per defect id and submitted as
//   Defects: [{ id, jp, en, count }]   and   Total_NG = sum of counts.
// The legacy 疵引不良 / 加工不良 / その他 fields (counter-18/19/20) stay in the DOM at 0 so the shared
// backend code keeps working, but are not submitted while this module is active.
// Layout: ≤12 items → tile grid that sizes itself; >12 → first 11 tiles + "他の不良" tile opening a modal.
//
// Grouped tablet (?machine=OZNC04,OZNC06): one red button per machine; it opens the defect list (modal) for
// that machine. Each count goes against the lot that machine is running now (byMachine: machine → lot → defect id), the same idea as SCNA's defectByMachineLot.
// A machine with no lot yet, or blocked by its checklist, is greyed out. The run totals (counts, Defects,
// Total_NG) are still the sum, so everything that reads them keeps working; the split goes into
// Lot_Details[].Defects / Total_NG at submit and into each machine's NG on the TV.
(function () {
  'use strict';

  if (new URLSearchParams(location.search).get('filter') === 'SCNA') return;

  var MAX_TILES = 12;          // above this the overflow modal is used
  var TILES_WITH_MORE = 11;    // tiles shown next to the "more" tile
  // Built-ins used when the server can't be reached and nothing is cached (ids match the server seed)
  var FALLBACK_ITEMS = [
    { id: 'd_15553b7f4b', jp: '疵引不良', en: 'Scratch Defect' },
    { id: 'd_c128361d78', jp: '加工不良', en: 'Processing Defect' },
    { id: 'other', jp: 'その他', en: 'Other' }
  ];

  function prefix() {
    try { if (typeof uniquePrefix !== 'undefined' && uniquePrefix) return uniquePrefix; } catch (e) { /* TDZ */ }
    return 'DCP_';
  }
  function stateKey() { return prefix() + 'dynDefects'; }
  function listCacheKey(model) { return 'dcpDefectList:pressDB:' + model; }
  function baseUrl() {
    try { if (typeof serverURL !== 'undefined' && serverURL) return serverURL; } catch (e) { /* not ready */ }
    return '';
  }
  function isEnglish() {
    try { return (localStorage.getItem('appLanguage') || 'ja') === 'en'; } catch (e) { return false; }
  }
  function tr(key, ja, en) {
    try {
      if (typeof _t === 'function') {
        var v = _t(key);
        if (v && v !== key) return v;
      }
    } catch (e) { /* i18n not loaded */ }
    return isEnglish() ? en : ja;
  }
  function label(item) { return (isEnglish() && item.en) ? item.en : item.jp; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var state = { model: '', items: [], counts: {}, byMachine: {} };

  function load() {
    try {
      var saved = JSON.parse(localStorage.getItem(stateKey()) || 'null');
      if (saved && Array.isArray(saved.items)) {
        state.model = saved.model || '';
        state.items = saved.items;
        state.counts = saved.counts || {};
        state.byMachine = (saved.byMachine && typeof saved.byMachine === 'object') ? saved.byMachine : {};
      }
    } catch (e) { /* corrupt state: start fresh */ }
  }
  function save() {
    try { localStorage.setItem(stateKey(), JSON.stringify(state)); } catch (e) { /* storage full */ }
  }

  function total() {
    var sum = 0;
    for (var id in state.counts) sum += parseInt(state.counts[id], 10) || 0;
    return sum;
  }

  // ── Grouped machines ─────────────────────────────────────────────────────
  function machines() {
    try {
      if (typeof groupedMachines !== 'undefined' && Array.isArray(groupedMachines)) return groupedMachines.filter(Boolean);
    } catch (e) { /* not ready */ }
    return [];
  }
  function isGrouped() { return machines().length > 1; }
  // The lot a machine is running now: its newest lot record (open or already closed for shots)
  function currentLotOf(machine) {
    try {
      var recs = (window.getAllLotRecords ? window.getAllLotRecords() : []).filter(function (r) { return r && r.machine === machine && r.lotNumber; });
      if (!recs.length) return '';
      recs.sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
      return recs[recs.length - 1].lotNumber;
    } catch (e) { return ''; }
  }
  function machineOk(machine) {
    try { return typeof window.isMachineChecklistOk !== 'function' || window.isMachineChecklistOk(machine); } catch (e) { return true; }
  }
  function machineCount(machine, lot, id) {
    var m = state.byMachine[machine];
    return parseInt(m && m[lot] && m[lot][id], 10) || 0;
  }
  function machineTotal(machine) {
    var sum = 0, m = state.byMachine[machine] || {};
    Object.keys(m).forEach(function (lot) { for (var id in m[lot]) sum += parseInt(m[lot][id], 10) || 0; });
    return sum;
  }
  function machineColor(machine) {
    try { if (typeof window.getChecklistMachineColor === 'function') return window.getChecklistMachineColor(machine); } catch (e) { }
    return 'var(--brand)';
  }

  // Keep items that already have counts even if the new list dropped them, so no NG is lost mid-run
  function mergeItems(nextItems) {
    var ids = {};
    nextItems.forEach(function (it) { ids[it.id] = true; });
    var keep = state.items.filter(function (it) { return !ids[it.id] && (state.counts[it.id] || 0) > 0; });
    if (!keep.length) return nextItems;
    var otherIndex = nextItems.findIndex(function (it) { return it.id === 'other'; });
    var merged = nextItems.slice();
    Array.prototype.splice.apply(merged, [otherIndex >= 0 ? otherIndex : merged.length, 0].concat(keep));
    return merged;
  }

  function setItems(items) {
    state.items = mergeItems(items);
    save();
    render();
  }

  async function fetchList(model) {
    if (!model) {
      if (!state.items.length) setItems(FALLBACK_ITEMS);
      return;
    }
    // Show the cached list right away, then refresh from the server
    try {
      var cached = JSON.parse(localStorage.getItem(listCacheKey(model)) || 'null');
      if (cached && cached.length && (state.model !== model || !state.items.length)) setItems(cached);
    } catch (e) { /* ignore */ }
    if (!state.items.length) setItems(FALLBACK_ITEMS);

    try {
      var res = await fetch(baseUrl() + '/resolvedDefectList?process=pressDB&model=' + encodeURIComponent(model));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      if (state.model !== model) return; // product changed while loading
      if (Array.isArray(data.items) && data.items.length) {
        try { localStorage.setItem(listCacheKey(model), JSON.stringify(data.items)); } catch (e) { /* ignore */ }
        setItems(data.items);
      }
    } catch (err) {
      console.warn('Defect list fetch failed, using cached/default list:', err);
    }
  }

  // Called when a 背番号's master record is loaded
  function onProduct(record) {
    var model = String((record && record.モデル) || '').trim();
    if (model === state.model && state.items.length) return;
    // A different product starts a new count only if nothing was counted yet
    if (state.model && model !== state.model && total() === 0) { state.counts = {}; state.byMachine = {}; }
    state.model = model;
    save();
    fetchList(model);
  }

  // machine: grouped tablet → count against that machine's current lot (and the run total)
  function changeCount(id, delta, machine) {
    var current = parseInt(state.counts[id], 10) || 0;
    var next;
    if (machine) {
      var lot = currentLotOf(machine);
      if (!lot || !machineOk(machine)) return;
      var mCur = machineCount(machine, lot, id);
      var mNext = Math.max(0, mCur + delta);
      if (mNext === mCur) return;
      state.byMachine[machine] = state.byMachine[machine] || {};
      state.byMachine[machine][lot] = state.byMachine[machine][lot] || {};
      state.byMachine[machine][lot][id] = mNext;
      next = Math.max(0, current + (mNext - mCur));
    } else {
      next = Math.max(0, current + delta);
      if (next === current) return;
    }
    state.counts[id] = next;
    save();
    var item = state.items.find(function (it) { return it.id === id; }) || { jp: id };
    try {
      if (typeof logTabletAction === 'function') {
        logTabletAction('Defect ' + item.jp + (delta > 0 ? ' incremented' : ' decremented'), 'in-progress', { defectId: id, defect: item.jp, newValue: next });
      }
    } catch (e) { /* logging is best effort */ }
    if (typeof updateTotal === 'function') updateTotal();
    render();
    if (delta > 0) bump(id, machine);
    if (typeof window.assertMachineState === 'function') window.assertMachineState();
  }

  function bump(id, machine) {
    var sel = machine ? '.dyn-mdef-btn[data-machine="' + CSS.escape(machine) + '"]'
      : '.dyn-defect-tile[data-id="' + CSS.escape(id) + '"]';
    var tile = document.querySelector(sel);
    if (!tile) return;
    tile.classList.remove('bump');
    void tile.offsetWidth;
    tile.classList.add('bump');
    setTimeout(function () { tile.classList.remove('bump'); }, 200);
  }

  function reset() {
    state.counts = {};
    state.byMachine = {};
    save();
    render();
  }

  // Submission payload (also used by the submit summary)
  function payload() {
    return state.items
      .map(function (it) { return { id: it.id, jp: it.jp, en: it.en || '', count: parseInt(state.counts[it.id], 10) || 0 }; });
  }

  // Grouped tablet: per machine (totals across its lots) with the per-lot split. null for a single machine.
  //   { OZNC04: { Total_NG, lots: { <lot>: { Total_NG, Defects: [{ id, jp, en, count }] } } } }
  function perMachinePayload() {
    if (!isGrouped()) return null;
    var out = {};
    machines().forEach(function (m) {
      var lots = {}, mTotal = 0;
      Object.keys(state.byMachine[m] || {}).forEach(function (lot) {
        var lotTotal = 0;
        var defects = state.items.map(function (it) {
          var c = machineCount(m, lot, it.id);
          lotTotal += c;
          return { id: it.id, jp: it.jp, en: it.en || '', count: c };
        });
        // ids no longer in the list but counted on this lot
        Object.keys(state.byMachine[m][lot]).forEach(function (id) {
          if (state.items.some(function (it) { return it.id === id; })) return;
          var c = machineCount(m, lot, id);
          if (c > 0) { lotTotal += c; defects.push({ id: id, jp: id, en: '', count: c }); }
        });
        lots[lot] = { Total_NG: lotTotal, Defects: defects };
        mTotal += lotTotal;
      });
      out[m] = { Total_NG: mTotal, lots: lots };
    });
    return out;
  }

  // One line per machine and lot for the submit summary, e.g. "OZNC04 · 888-1: 疵引不良 2". '' when none.
  function summaryHtml() {
    var p = perMachinePayload();
    if (!p) return '';
    return Object.keys(p).map(function (m) {
      var lots = Object.keys(p[m].lots).filter(function (l) { return p[m].lots[l].Total_NG > 0; });
      if (!lots.length) return '';
      return '<div><b>' + esc(m) + '</b> ' + lots.map(function (l) {
        var counted = p[m].lots[l].Defects.filter(function (d) { return d.count > 0; })
          .map(function (d) { return esc((isEnglish() && d.en) ? d.en : d.jp) + ' ' + d.count; }).join(', ');
        return esc(l) + ': ' + counted;
      }).join(' · ') + '</div>';
    }).join('');
  }

  // ── DOM ──────────────────────────────────────────────────────────────────
  var grid, totalEl, modal;

  function tileHtml(item) {
    var count = parseInt(state.counts[item.id], 10) || 0;
    return '<div class="tap-counter dyn-defect-tile' + (count > 0 ? ' has-count' : '') + '" data-id="' + esc(item.id) + '" role="button">' +
      '<button type="button" class="tap-minus" data-minus="' + esc(item.id) + '" aria-label="minus">&minus;</button>' +
      '<div class="tap-count">' + count + '</div>' +
      '<div class="tap-label">' + esc(label(item)) + '</div>' +
      '</div>';
  }

  function render() {
    if (!grid) return;
    if (isGrouped()) { renderGrouped(); return; }
    grid.className = 'dyn-defect-grid';
    var items = state.items;
    var overflow = items.length > MAX_TILES;
    var tiles = overflow ? items.slice(0, TILES_WITH_MORE) : items;
    var size = items.length <= 6 ? 'lg' : 'md';
    grid.setAttribute('data-size', overflow ? 'md' : size);

    var html = tiles.map(tileHtml).join('');
    if (overflow) {
      var hidden = items.slice(TILES_WITH_MORE);
      var hiddenTotal = hidden.reduce(function (s, it) { return s + (parseInt(state.counts[it.id], 10) || 0); }, 0);
      html += '<div class="tap-counter dyn-defect-more' + (hiddenTotal > 0 ? ' has-count' : '') + '" data-more="1" role="button">' +
        '<div class="tap-count">' + (hiddenTotal > 0 ? hiddenTotal : '＋') + '</div>' +
        '<div class="tap-label">' + esc(tr('defect_more', '他の不良', 'More defects')) + ' (' + hidden.length + ')</div>' +
        '</div>';
    }
    grid.innerHTML = html;
    if (totalEl) {
      totalEl.textContent = tr('defect_total', '不良合計', 'Total NG') + ' ' + total();
      totalEl.classList.toggle('has-count', total() > 0);
    }
    if (modal && modal.classList.contains('open')) renderModal();
  }

  // Grouped tablet: one header + tile grid per machine; the overflow tile opens the modal for that machine
  var modalMachine = null;
  var lastSignature = '';
  function groupedSignature() {
    return machines().map(function (m) { return m + ':' + currentLotOf(m) + ':' + (machineOk(m) ? 1 : 0); }).join('|');
  }
  // One red button per machine (name, current lot, NG count); tapping it opens the defect list for that
  // machine's current lot. Keeps the production tab minimal however long the 不良管理 list is.
  function renderGrouped() {
    grid.className = 'dyn-defect-machines';
    // The page's "tap a card +1" hint doesn't fit machine buttons
    var hint = grid.parentNode && grid.parentNode.querySelector('.tap-hint');
    if (hint && hint.getAttribute('data-i18n') !== 'tap_hint_machine') {
      hint.setAttribute('data-i18n', 'tap_hint_machine');
      hint.textContent = tr('tap_hint_machine', '機械をタップして不良を入力', 'Tap a machine to enter its defects');
    }
    lastSignature = groupedSignature();

    grid.innerHTML = machines().map(function (m) {
      var lot = currentLotOf(m);
      var ok = machineOk(m);
      var off = !lot || !ok;
      var sub = !ok ? tr('defect_machine_blocked', '点検NG — 使用不可', 'Checklist NG — not in use')
        : (lot ? lot : tr('defect_machine_no_lot', 'ロット未スキャン', 'No lot scanned'));
      var lotTotal = 0;
      if (lot) state.items.forEach(function (it) { lotTotal += machineCount(m, lot, it.id); });
      var mTotal = machineTotal(m);
      return '<button type="button" class="dyn-mdef-btn' + (off ? ' dyn-mdef-off' : '') + (lotTotal > 0 ? ' has-count' : '') +
        '" data-machine="' + esc(m) + '"' + (off ? ' aria-disabled="true"' : '') + '>' +
        '<span class="dyn-mdef-name">' + esc(m) + '</span>' +
        '<span class="dyn-mdef-count">' + lotTotal + '</span>' +
        '<span class="dyn-mdef-lot">' + esc(sub) + '</span>' +
        (mTotal > lotTotal ? '<span class="dyn-mdef-total">Σ ' + mTotal + '</span>' : '') +
        '</button>';
    }).join('');

    if (totalEl) {
      totalEl.textContent = tr('defect_total', '不良合計', 'Total NG') + ' ' + total();
      totalEl.classList.toggle('has-count', total() > 0);
    }
    if (modal && modal.classList.contains('open')) renderModal();
  }

  function modalCount(id) {
    if (modalMachine) {
      var lot = currentLotOf(modalMachine);
      return lot ? machineCount(modalMachine, lot, id) : 0;
    }
    return parseInt(state.counts[id], 10) || 0;
  }

  function renderModal() {
    var list = modal.querySelector('.dyn-defect-modal-list');
    var head = modal.querySelector('.dyn-defect-modal-head h3');
    if (head) {
      head.textContent = tr('defect_counter_title', '加工不良カウンター', 'Defect counter') +
        (modalMachine ? ' — ' + modalMachine + (currentLotOf(modalMachine) ? ' · ' + currentLotOf(modalMachine) : '') : '');
    }
    list.innerHTML = state.items.map(function (item) {
      var count = modalCount(item.id);
      return '<div class="dyn-defect-row' + (count > 0 ? ' has-count' : '') + '">' +
        '<span class="dyn-defect-row-label">' + esc(label(item)) + '</span>' +
        '<button type="button" class="dyn-step" data-minus="' + esc(item.id) + '" aria-label="minus">&minus;</button>' +
        '<span class="dyn-defect-row-count">' + count + '</span>' +
        '<button type="button" class="dyn-step dyn-step-plus" data-plus="' + esc(item.id) + '" aria-label="plus">+</button>' +
        '</div>';
    }).join('');
    modal.querySelector('.dyn-defect-modal-total').textContent = tr('defect_total', '不良合計', 'Total NG') + ' ' +
      (modalMachine ? machineTotal(modalMachine) : total());
  }

  function openModal(machine) {
    modalMachine = machine || null;
    renderModal();
    modal.classList.add('open');
  }
  function closeModal() {
    modal.classList.remove('open');
  }

  function injectStyles() {
    var css = '' +
      '.dyn-defect-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px}' +
      '.dyn-defect-head h3{margin:0}' +
      '.dyn-defect-head-actions{display:flex;align-items:center;gap:8px}' +
      '.dyn-defect-head .tap-photo-btn{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:999px;border:1px solid var(--border-strong);background:var(--bg-card);color:var(--text-muted);cursor:pointer;font-size:.8rem;font-weight:700;margin:0}' +
      '.dyn-defect-total{padding:6px 12px;border-radius:999px;border:1px solid var(--border-strong);font-size:.85rem;font-weight:800;color:var(--text-muted)}' +
      '.dyn-defect-total.has-count{border-color:var(--red);color:var(--red);background:var(--red-soft)}' +
      '.dyn-defect-grid{display:grid;gap:12px;grid-template-columns:repeat(3,1fr)}' +
      '.dyn-defect-grid[data-size="md"]{grid-template-columns:repeat(4,1fr);gap:10px}' +
      '.dyn-defect-grid[data-size="md"] .tap-counter{min-height:96px;padding:22px 8px 10px;gap:3px}' +
      '.dyn-defect-grid[data-size="md"] .tap-count{font-size:2rem}' +
      '.dyn-defect-grid[data-size="md"] .tap-label{font-size:.82rem}' +
      '.dyn-defect-grid[data-size="md"] .tap-minus{width:28px;height:28px;font-size:1rem;top:6px;left:6px}' +
      '.dyn-defect-grid .tap-label{word-break:break-word;line-height:1.2}' +
      '.dyn-defect-more{border-style:dashed}' +
      '.dyn-defect-machines{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px}' +
      '.dyn-mdef-btn{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:150px;padding:16px 12px;border:none;border-radius:18px;background:var(--red,#e5484d);color:#fff;cursor:pointer;touch-action:manipulation;box-shadow:0 6px 18px rgba(229,72,77,.3);font-family:inherit}' +
      '.dyn-mdef-btn:active{transform:scale(.97)}' +
      '.dyn-mdef-name{font-size:1.5rem;font-weight:800;letter-spacing:.02em}' +
      '.dyn-mdef-count{font-size:2.6rem;font-weight:800;line-height:1}' +
      '.dyn-mdef-lot{font-size:.9rem;font-weight:700;opacity:.92}' +
      '.dyn-mdef-total{font-size:.8rem;font-weight:800;padding:2px 10px;border-radius:999px;background:rgba(255,255,255,.22)}' +
      '.dyn-mdef-btn.dyn-mdef-off{background:var(--bg-muted,#e4e7ec);color:var(--text-muted,#667085);box-shadow:none;cursor:not-allowed}' +
      '.dyn-mdef-btn.bump{transform:scale(1.04)}' +
      '@media (max-width:600px){.dyn-defect-grid,.dyn-defect-grid[data-size="md"]{grid-template-columns:repeat(2,1fr)}}' +
      '.dyn-defect-modal{position:fixed;inset:0;z-index:100100;display:none;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.45)}' +
      '.dyn-defect-modal.open{display:flex}' +
      '@media (min-width:700px){.dyn-defect-modal{align-items:center}}' +
      '.dyn-defect-modal-card{background:var(--bg-surface);color:var(--text-main);width:min(640px,100%);max-height:85vh;display:flex;flex-direction:column;border-radius:18px 18px 0 0;box-shadow:0 -8px 30px rgba(0,0,0,.25)}' +
      '@media (min-width:700px){.dyn-defect-modal-card{border-radius:18px}}' +
      '.dyn-defect-modal-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:16px 18px;border-bottom:1px solid var(--border-strong)}' +
      '.dyn-defect-modal-head h3{margin:0;font-size:1.1rem}' +
      '.dyn-defect-modal-list{overflow-y:auto;padding:8px 12px}' +
      '.dyn-defect-row{display:flex;align-items:center;gap:10px;padding:10px 6px;border-bottom:1px solid var(--border-strong)}' +
      '.dyn-defect-row:last-child{border-bottom:none}' +
      '.dyn-defect-row-label{flex:1;font-weight:700;font-size:1rem}' +
      '.dyn-defect-row-count{min-width:48px;text-align:center;font-size:1.5rem;font-weight:800}' +
      '.dyn-defect-row.has-count .dyn-defect-row-count{color:var(--red)}' +
      '.dyn-step{width:48px;height:48px;border-radius:50%;border:1px solid var(--border-strong);background:var(--bg-surface);color:var(--text-main);font-size:1.4rem;font-weight:800;cursor:pointer;touch-action:manipulation}' +
      '.dyn-step:active{transform:scale(.94)}' +
      '.dyn-step-plus{background:var(--brand);border-color:var(--brand);color:#fff}' +
      '.dyn-defect-modal-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 18px;border-top:1px solid var(--border-strong)}' +
      '.dyn-defect-modal-close{padding:12px 28px;border-radius:12px;border:none;background:var(--brand);color:#fff;font-weight:800;font-size:1rem;cursor:pointer}';
    var style = document.createElement('style');
    style.id = 'dynDefectStyles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function mount() {
    var legacyGrid = document.getElementById('counter-box-18') && document.getElementById('counter-box-18').parentNode;
    if (!legacyGrid) return false;
    var card = legacyGrid.parentNode;
    var heading = card.querySelector('h3');

    injectStyles();

    // Header: title + photo button + total (photo moved off the tiles so it never overlaps them)
    var head = document.createElement('div');
    head.className = 'dyn-defect-head';
    card.insertBefore(head, card.firstChild);
    if (heading) head.appendChild(heading);
    var actions = document.createElement('div');
    actions.className = 'dyn-defect-head-actions';
    var photo = document.getElementById('defectPhotoBtn');
    if (photo) actions.appendChild(photo);
    totalEl = document.createElement('span');
    totalEl.className = 'dyn-defect-total';
    actions.appendChild(totalEl);
    head.appendChild(actions);

    // Legacy tiles stay in the DOM (shared backend reads counter-18/19/20) but hidden
    legacyGrid.style.display = 'none';
    grid = document.createElement('div');
    grid.id = 'dynDefectGrid';
    grid.className = 'dyn-defect-grid';
    legacyGrid.parentNode.insertBefore(grid, legacyGrid.nextSibling);

    grid.addEventListener('click', function (e) {
      // Grouped tablet: a machine button opens the defect list for that machine
      var mBtn = e.target.closest('.dyn-mdef-btn');
      if (mBtn) {
        var m = mBtn.getAttribute('data-machine');
        if (mBtn.classList.contains('dyn-mdef-off')) {
          var why = machineOk(m) ? tr('defect_machine_no_lot', 'ロット未スキャン', 'No lot scanned')
            : (typeof window.getChecklistBlockedMessage === 'function' ? window.getChecklistBlockedMessage(m) : tr('defect_machine_blocked', '点検NG — 使用不可', 'Checklist NG — not in use'));
          if (typeof window.showAppToast === 'function') window.showAppToast(m + ': ' + why.replace(m + ': ', ''));
          return;
        }
        openModal(m);
        return;
      }
      var machine = null;
      var minus = e.target.closest('[data-minus]');
      if (minus) { e.stopPropagation(); changeCount(minus.getAttribute('data-minus'), -1, machine); return; }
      if (e.target.closest('[data-more]')) { openModal(machine); return; }
      var tile = e.target.closest('.dyn-defect-tile');
      if (tile) changeCount(tile.getAttribute('data-id'), +1, machine);
    });

    modal = document.createElement('div');
    modal.className = 'dyn-defect-modal';
    modal.innerHTML =
      '<div class="dyn-defect-modal-card" role="dialog" aria-modal="true">' +
        '<div class="dyn-defect-modal-head"><h3>' + esc(tr('defect_counter_title', '加工不良カウンター', 'Defect counter')) + '</h3></div>' +
        '<div class="dyn-defect-modal-list"></div>' +
        '<div class="dyn-defect-modal-foot"><span class="dyn-defect-total has-count dyn-defect-modal-total"></span>' +
        '<button type="button" class="dyn-defect-modal-close">' + esc(tr('close', '閉じる', 'Close')) + '</button></div>' +
      '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) {
      if (e.target === modal || e.target.closest('.dyn-defect-modal-close')) { closeModal(); return; }
      var plus = e.target.closest('[data-plus]');
      if (plus) { changeCount(plus.getAttribute('data-plus'), +1, modalMachine); return; }
      var minus = e.target.closest('[data-minus]');
      if (minus) changeCount(minus.getAttribute('data-minus'), -1, modalMachine);
    });
    return true;
  }

  load();
  if (!mount()) {
    console.warn('Dynamic defect counters: press defect grid not found; keeping legacy counters');
    return;
  }

  window.DCPDefects = {
    active: true,
    total: total,
    payload: payload,
    perMachinePayload: perMachinePayload,
    summaryHtml: summaryHtml,
    reset: reset,
    onProduct: onProduct,
    refresh: function () { fetchList(state.model); },
    editTargetId: 'dynDefectGrid'
  };

  render();
  // On reload, refresh the list for the product that was already loaded
  var restoredModel = state.model;
  if (!restoredModel) {
    try { restoredModel = (document.getElementById('model') && document.getElementById('model').value) || localStorage.getItem(prefix() + 'cached-model') || ''; } catch (e) { restoredModel = ''; }
    state.model = String(restoredModel || '').trim();
  }
  fetchList(state.model);
  // i18n has no change event: re-render labels when the selector changes (after setLanguage runs)
  var langSelector = document.getElementById('languageSelector');
  if (langSelector) langSelector.addEventListener('change', function () { setTimeout(render, 0); });
  // Grouped tablet: lots are scanned and checklists finished elsewhere on the page; repaint when a machine
  // gets a new lot or is unblocked / blocked.
  setInterval(function () {
    try { if (isGrouped() && groupedSignature() !== lastSignature) render(); } catch (e) { /* ignore */ }
  }, 1000);
})();
