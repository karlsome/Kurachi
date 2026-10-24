// SRS interactive (SCNA) - Girasol 1 / Girasol 2
//
// One page per Girasol machine. The page has two independent lanes, LH and RH.
// A lane is opened by scanning a WIP label (box ID such as WO-005460-B003); the box
// gives the 背番号, masterDB gives R/L, and R/L picks the lane.
// Operator and breaks are shared by both lanes; everything else is per lane.
// Each lane submits its own SRSDB record (via /submitToSRSDBiReporter).
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
  var MACHINE = machineNo ? 'Girasol-' + machineNo : '';      // internal form
  var MACHINE_LEGACY = machineNo ? 'Girasol ' + machineNo : ''; // 設備 string, same style as "AOL 4,5"
  var DRAFT_KEY = 'srs_' + FACTORY + '_' + MACHINE;

  // ---------- state ----------
  function emptyLane() {
    return {
      sebango: '', hinban: '', hinmei: '', model: '', shape: '', rl: '', workOrder: '',
      boxes: [],            // [{ boxId, qty, lots:[lotNumber], machines:[] }]
      start: '', end: '', date: '',
      qtyOverride: null,
      ng: {}, spare: 0, srsCode: '', lotNumbers: '', comment: '', photo: null
    };
  }
  var state = { worker: '', breaks: [], lanes: { LH: emptyLane(), RH: emptyLane() } };
  var activeLane = 'LH';
  var workers = [];

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toInt(v) { var n = parseInt(v, 10); return isNaN(n) || n < 0 ? 0 : n; }
  function pad(n) { return String(n).padStart(2, '0'); }
  function nowHM() { var d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function todayStr() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  // ---------- draft ----------
  function save() { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(state)); } catch (e) { /* quota: keep working */ } }
  function load() {
    try {
      var raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      var d = JSON.parse(raw);
      state.worker = d.worker || '';
      state.breaks = Array.isArray(d.breaks) ? d.breaks : [];
      LANES.forEach(function (l) { state.lanes[l] = Object.assign(emptyLane(), (d.lanes || {})[l] || {}); });
    } catch (e) { console.error('SRS: draft load failed', e); }
  }

  // ---------- small UI helpers ----------
  var toastTimer;
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function showAlert(text, title) {
    $('alertTitle').textContent = title || 'エラー / Error';
    $('alertText').textContent = text;
    $('alertModal').classList.add('show');
    document.body.classList.add('flash-red');
    var a = $('alert-sound');
    if (a) { a.muted = false; a.volume = 1; a.currentTime = 0; a.play().catch(function () { }); }
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

  // ---------- breaks (shared) ----------
  function toMin(hm) { var p = String(hm || '').split(':'); return p.length < 2 ? null : toInt(p[0]) * 60 + toInt(p[1]); }
  function spanMin(start, end) {
    var s = toMin(start), e = toMin(end);
    if (s == null || e == null) return 0;
    return e >= s ? e - s : e + 1440 - s;   // crossing midnight
  }
  function breakTotal() { return state.breaks.reduce(function (a, b) { return a + spanMin(b.start, b.end); }, 0); }
  function renderBreakSummary() { $('breakSummary').textContent = '休憩 ' + breakTotal() + '分'; }
  function renderBreakRows() {
    var host = $('breakRows'); host.innerHTML = '';
    if (!state.breaks.length) host.innerHTML = '<p style="margin-bottom:10px">休憩はありません / No breaks</p>';
    state.breaks.forEach(function (b, i) {
      var row = document.createElement('div'); row.className = 'break-row';
      row.innerHTML = '<div class="field"><label>開始</label><input type="time" value="' + esc(b.start) + '"></div>' +
        '<div class="field"><label>終了</label><input type="time" value="' + esc(b.end) + '"></div>' +
        '<button type="button" class="btn btn-danger btn-sm">✕</button>';
      var ins = row.querySelectorAll('input');
      ins[0].onchange = function () { b.start = ins[0].value; save(); renderBreakSummary(); };
      ins[1].onchange = function () { b.end = ins[1].value; save(); renderBreakSummary(); };
      row.querySelector('button').onclick = function () { state.breaks.splice(i, 1); save(); renderBreakRows(); renderBreakSummary(); renderAllDerived(); };
      host.appendChild(row);
    });
  }
  $('breakBtn').onclick = function () { renderBreakRows(); $('breakModal').classList.add('show'); };
  $('breakAdd').onclick = function () { state.breaks.push({ start: '', end: '' }); save(); renderBreakRows(); };
  $('breakDone').onclick = function () {
    state.breaks = state.breaks.filter(function (b) { return b.start && b.end; });
    save(); renderBreakSummary(); renderAllDerived(); $('breakModal').classList.remove('show');
  };

  // ---------- derived numbers ----------
  function boxQty(l) { return l.boxes.reduce(function (a, b) { return a + (b.qty || 0); }, 0); }
  function procQty(l) { return l.qtyOverride != null ? l.qtyOverride : boxQty(l); }
  function ngTotal(l) { return NG_FIELDS.reduce(function (a, f) { return a + toInt(l.ng[f]); }, 0); }
  function goodQty(l) { return Math.max(0, procQty(l) - ngTotal(l)); }
  function cycleSec(l) {
    var work = spanMin(l.start, l.end) - breakTotal();
    var q = procQty(l);
    return work > 0 && q > 0 ? Math.round((work * 60 / q) * 10) / 10 : 0;
  }

  // ---------- rendering ----------
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
    var busy = l.boxes.length > 0;
    var html = '<div class="lane-head"><span class="lane-badge">' + name + '</span>' +
      '<span class="lane-state">' + (busy ? esc(l.sebango) + ' · ' + l.boxes.length + '箱' : '待機中 / Idle') + '</span></div>';

    if (!busy) {
      html += '<div class="empty"><div class="big">WIPラベルをスキャンすると ' + name + ' が自動で開きます<br>' +
        '<span style="font-size:.8125rem;font-weight:600">Scan a WIP label — the lane opens by the product\'s R/L</span></div>' +
        '<button type="button" class="btn btn-primary" data-act="scan">スキャン / Scan</button></div>';
      sec.innerHTML = html; bindLane(name); updateSwitch(); return;
    }

    html += '<div class="lane-body">' +
      '<div class="product"><div class="name">' + esc(l.sebango) + ' · ' + esc(l.hinban) + '</div>' +
      '<div class="meta">' + esc(l.hinmei) + '<br>' + (l.workOrder ? 'WO: ' + esc(l.workOrder) + ' · ' : '') + esc(l.model) + ' ' + esc(l.shape) + '</div>' +
      '<div class="box-chips">' + l.boxes.map(function (b) { return '<span class="chip">' + esc(b.boxId) + ' · ' + b.qty + 'pcs</span>'; }).join('') + '</div>' +
      '<div style="margin-top:10px"><button type="button" class="btn btn-ghost btn-sm" data-act="scan">＋ 箱を追加 / Add box</button></div></div>' +

      '<div class="grid2">' +
      '<div class="field"><label>加工開始</label><input type="time" data-f="start" value="' + esc(l.start) + '"></div>' +
      '<div class="field"><label>加工終了</label><input type="time" data-f="end" value="' + esc(l.end) + '"></div></div>' +
      '<div><button type="button" class="btn btn-ghost btn-sm" data-act="now-end">終了 = 今 / End = now</button></div>' +

      '<div class="grid2">' +
      '<div class="field"><label>加工数（良品）+ NG</label><input type="number" inputmode="numeric" data-f="qty" min="0" value="' + procQty(l) + '"></div>' +
      '<div class="field"><label>製造ロット</label><input type="text" data-f="lotNumbers" value="' + esc(l.lotNumbers) + '"></div></div>' +
      '<div class="grid2">' +
      '<div class="field"><label>シールロット / SRSコード</label><input type="text" data-f="srsCode" value="' + esc(l.srsCode) + '"></div>' +
      '<div class="field"><label>スペア</label><input type="number" inputmode="numeric" data-f="spare" min="0" value="' + toInt(l.spare) + '"></div></div>' +

      '<div class="section-title">不良 / NG</div><div class="ng-grid">' +
      NG_FIELDS.map(function (f, i) {
        return '<div class="ng-item"><span class="lbl">' + esc(f) + '</span><div class="stepper">' +
          '<button type="button" data-ng="' + i + '" data-d="-1">−</button>' +
          '<input type="number" inputmode="numeric" min="0" data-ngv="' + i + '" value="' + toInt(l.ng[f]) + '">' +
          '<button type="button" data-ng="' + i + '" data-d="1">＋</button></div></div>';
      }).join('') + '</div>' +

      '<div class="totals">' +
      '<div class="total-box"><div class="k">加工数</div><div class="v" data-out="proc">0</div></div>' +
      '<div class="total-box ng"><div class="k">NG</div><div class="v" data-out="ng">0</div></div>' +
      '<div class="total-box good"><div class="k">良品</div><div class="v" data-out="good">0</div></div></div>' +
      '<div class="pill-info" data-out="cycle"></div>' +

      '<div class="photo-row"><button type="button" class="btn btn-ghost btn-sm" data-act="photo">初物チェック写真 / 1st-piece photo</button>' +
      (l.photo ? '<img src="' + l.photo + '" alt="1st piece">' : '') +
      '<input type="file" accept="image/*" capture="environment" data-photo style="display:none"></div>' +

      '<div class="field"><label>コメント</label><textarea data-f="comment">' + esc(l.comment) + '</textarea></div>' +
      '</div>' +

      '<div class="lane-foot">' +
      '<button type="button" class="btn btn-danger" data-act="reset">リセット / Reset</button>' +
      '<button type="button" class="btn btn-success btn-grow" data-act="submit">送信 / Submit ' + name + '</button></div>';

    sec.innerHTML = html;
    bindLane(name);
    updateDerived(name);
    updateSwitch();
  }

  function updateDerived(name) {
    var l = state.lanes[name], sec = laneEl(name);
    if (!sec || !l.boxes.length) return;
    var set = function (k, v) { var e = sec.querySelector('[data-out="' + k + '"]'); if (e) e.textContent = v; };
    set('proc', procQty(l)); set('ng', ngTotal(l)); set('good', goodQty(l));
    var c = cycleSec(l);
    set('cycle', c ? 'サイクルタイム: ' + c + ' 秒/pcs (休憩 ' + breakTotal() + '分 控除)' : '');
  }
  function renderAllDerived() { LANES.forEach(updateDerived); }

  function bindLane(name) {
    var l = state.lanes[name], sec = laneEl(name);
    sec.querySelectorAll('[data-act]').forEach(function (b) {
      b.onclick = function () {
        var a = b.getAttribute('data-act');
        if (a === 'scan') openScan();
        else if (a === 'reset') resetLane(name);
        else if (a === 'submit') submitLane(name);
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
    sec.querySelectorAll('[data-ng]').forEach(function (b) {
      b.onclick = function () {
        var i = +b.getAttribute('data-ng'), f = NG_FIELDS[i];
        l.ng[f] = Math.max(0, toInt(l.ng[f]) + (+b.getAttribute('data-d')));
        sec.querySelector('[data-ngv="' + i + '"]').value = l.ng[f];
        save(); updateDerived(name);
      };
    });
    sec.querySelectorAll('[data-ngv]').forEach(function (inp) {
      inp.oninput = function () { l.ng[NG_FIELDS[+inp.getAttribute('data-ngv')]] = toInt(inp.value); save(); updateDerived(name); };
    });
    var ph = sec.querySelector('[data-photo]');
    if (ph) ph.onchange = function () {
      if (!ph.files || !ph.files[0]) return;
      shrinkImage(ph.files[0]).then(function (dataUrl) { l.photo = dataUrl; save(); renderLane(name); })
        .catch(function () { toast('写真を読み込めません / Could not read photo'); });
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

  // ---------- narrow-screen lane switch ----------
  function applyActiveLane() { LANES.forEach(function (n) { laneEl(n).classList.toggle('active', n === activeLane); }); updateSwitch(); }
  function updateSwitch() {
    document.querySelectorAll('#laneSwitch button').forEach(function (b) {
      var n = b.getAttribute('data-lane');
      b.classList.toggle('active', n === activeLane);
      b.classList.toggle('busy', state.lanes[n].boxes.length > 0);
    });
  }
  document.querySelectorAll('#laneSwitch button').forEach(function (b) {
    b.onclick = function () { activeLane = b.getAttribute('data-lane'); applyActiveLane(); };
  });

  // ---------- scanning ----------
  var scanner = null, scanBusy = false;
  function openScan() {
    $('scanModal').classList.add('show');
    $('manualBoxId').value = '';
    if (typeof Html5Qrcode === 'undefined') return;
    stopScanner().then(function () {
      scanner = new Html5Qrcode('qrReader');
      return scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 220 }, function (text) { handleScan(text); }, function () { });
    }).catch(function (e) { console.warn('SRS: camera unavailable, manual entry still works', e); });
  }
  function stopScanner() {
    if (!scanner) return Promise.resolve();
    var s = scanner; scanner = null;
    return s.stop().then(function () { return s.clear(); }).catch(function () { });
  }
  function closeScan() { $('scanModal').classList.remove('show'); stopScanner(); }
  $('scanCancel').onclick = closeScan;
  $('manualBoxOk').onclick = function () { handleScan($('manualBoxId').value); };
  $('manualBoxId').addEventListener('keydown', function (e) { if (e.key === 'Enter') handleScan($('manualBoxId').value); });

  // A label can carry just the box ID, or "品番,収容数,lotNumber,boxId" (the box label QR).
  function extractBoxId(text) {
    var parts = String(text || '').split(/[,\s]+/).map(function (p) { return p.trim(); }).filter(Boolean);
    for (var i = parts.length - 1; i >= 0; i--) if (/-B\d{3,}$/i.test(parts[i])) return parts[i].toUpperCase();
    return '';
  }

  async function handleScan(text) {
    if (scanBusy) return;
    var boxId = extractBoxId(text);
    if (!boxId) { if (String(text || '').trim()) { closeScan(); showAlert('WIPラベルではありません / Not a WIP label: ' + text); } return; }
    scanBusy = true;
    try {
      await acceptBox(boxId);
    } finally { scanBusy = false; }
  }

  async function acceptBox(boxId) {
    // 1. already open on this tablet (either lane)
    for (var i = 0; i < LANES.length; i++) {
      if (state.lanes[LANES[i]].boxes.some(function (b) { return b.boxId === boxId; })) {
        closeScan(); return showAlert('この箱は既に ' + LANES[i] + ' で使用中です。送信またはリセットしてください。\nBox ' + boxId + ' is already open in ' + LANES[i] + '. Submit or reset first.');
      }
    }
    // 2. fetch the box
    var box;
    try {
      var r = await fetch(serverURL + '/api/scna-boxes/' + encodeURIComponent(boxId));
      if (r.status === 404) { closeScan(); return showAlert('箱が見つかりません / Box not found: ' + boxId); }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      box = await r.json();
    } catch (e) { closeScan(); return showAlert('サーバーに接続できません / Server unreachable.\n' + e.message); }

    // 3. already submitted to SRSDB
    try {
      var used = await queryDB('submittedDB', 'SRSDB', { Box_IDs: boxId });
      if (used && used.length) { closeScan(); return showAlert('この箱は既にSRS送信済みです / Box ' + boxId + ' was already submitted to SRS.'); }
    } catch (e) { closeScan(); return showAlert('重複チェックができません / Could not check for duplicates.\n' + e.message); }

    // 4. masterDB: SRS flag + R/L
    var rec = null;
    try {
      var rows = await queryDB('Sasaki_Coating_MasterDB', 'masterDB', { 背番号: box.背番号 });
      if (!rows || !rows.length) rows = await queryDB('Sasaki_Coating_MasterDB', 'masterDB', { 品番: box.品番 });
      rec = (rows || []).filter(function (x) { return x.工場 === FACTORY; })[0] || null;
    } catch (e) { closeScan(); return showAlert('マスター取得に失敗 / masterDB lookup failed.\n' + e.message); }
    if (!rec) { closeScan(); return showAlert('マスターに見つかりません / Not found in masterDB (SCNA): ' + (box.背番号 || box.品番)); }
    if (rec.SRS !== 'あり' && rec.SRS !== '有り') { closeScan(); return showAlert('SRS工程の対象外です / This product has no SRS process: ' + rec.背番号); }
    var lane = rec['R/L'] === 'LH' ? 'LH' : rec['R/L'] === 'RH' ? 'RH' : '';
    if (!lane) { closeScan(); return showAlert('R/L が不明です / R/L is not set in masterDB for ' + rec.背番号); }

    // 5. lane occupied by a different product
    var l = state.lanes[lane];
    if (l.boxes.length && l.sebango !== rec.背番号) {
      closeScan(); activeLane = lane; applyActiveLane();
      return showAlert(lane + ' は別の製品（' + l.sebango + '）で使用中です。送信またはリセットしてください。\n' + lane + ' is busy with ' + l.sebango + '. Submit or reset first.');
    }

    // 6. accept
    var qty = toInt(box.qtyMeasured != null ? box.qtyMeasured : box.qtyLabel);
    var lots = (box.lots || []).map(function (x) { return x.lotNumber; }).filter(Boolean);
    if (!l.boxes.length) {
      l.sebango = rec.背番号; l.hinban = rec.品番 || box.品番 || ''; l.hinmei = rec.品名 || ''; l.model = rec.モデル || ''; l.shape = rec.形状 || '';
      l.rl = lane; l.workOrder = box.workOrderNumber || '';
      l.start = nowHM(); l.date = todayStr();
    }
    l.boxes.push({ boxId: boxId, qty: qty, lots: lots, machines: box.machines || [] });
    l.qtyOverride = null;     // the new box changes the sum; operator can override again
    var known = l.lotNumbers ? l.lotNumbers.split(/\s*,\s*/) : [];
    lots.forEach(function (x) { if (known.indexOf(x) < 0) known.push(x); });
    l.lotNumbers = known.join(', ');
    save(); closeScan();
    activeLane = lane; renderLane(lane); applyActiveLane();
    toast(lane + ' ← ' + boxId + ' (' + qty + 'pcs)');
  }

  // ---------- reset / submit ----------
  async function resetLane(name) {
    if (!(await confirmBox(name + ' をリセット / Reset ' + name, '入力内容と読み込んだ箱を破棄します。\nThis discards the lane\'s entries and scanned boxes.', 'リセット / Reset'))) return;
    state.lanes[name] = emptyLane(); afterLaneCleared(name);
  }
  function afterLaneCleared(name) {
    if (!LANES.some(function (n) { return state.lanes[n].boxes.length; })) state.breaks = [];   // breaks are shared: clear when both lanes are idle
    save(); renderBreakSummary(); renderLane(name);
  }

  function validate(name) {
    var l = state.lanes[name], miss = [];
    if (!state.worker) miss.push('作業者 / Operator');
    if (!l.start) miss.push('加工開始 / Start');
    if (!l.end) miss.push('加工終了 / End');
    if (procQty(l) <= 0) miss.push('加工数 / Quantity');
    if (ngTotal(l) > procQty(l)) miss.push('NGが加工数を超えています / NG exceeds quantity');
    if (spanMin(l.start, l.end) < breakTotal()) miss.push('休憩が加工時間を超えています / Breaks exceed processing time');
    return miss;
  }

  var submitting = false;
  async function submitLane(name) {
    if (submitting) return;
    var l = state.lanes[name];
    var miss = validate(name);
    if (miss.length) return showAlert('次を確認してください / Please check:\n・' + miss.join('\n・'));
    if (!(await confirmBox(name + ' を送信 / Submit ' + name, l.sebango + ' · ' + procQty(l) + 'pcs (良品 ' + goodQty(l) + ' / NG ' + ngTotal(l) + ')', '送信 / Submit'))) return;

    submitting = true;
    var btn = laneEl(name).querySelector('[data-act="submit"]'); if (btn) btn.disabled = true;
    try {
      var ngBy = {}; NG_FIELDS.forEach(function (f) { ngBy[f] = toInt(l.ng[f]); });
      var body = Object.assign({
        // legacy SRSDB fields (same names as SRS Process iReporter)
        品番: l.hinban, 背番号: l.sebango,
        Total: goodQty(l), 工場: FACTORY, Worker_Name: state.worker,
        Process_Quantity: procQty(l), Date: l.date || todayStr(), Time_start: l.start, Time_end: l.end,
        設備: MACHINE_LEGACY, SRSコード: l.srsCode,
        SRS_Total_NG: ngTotal(l), Spare: toInt(l.spare), Comment: l.comment,
        製造ロット: l.lotNumbers, Cycle_Time: cycleSec(l),
        // new
        Lane: name, 'R/L': name, Tablet_Home: MACHINE_LEGACY,
        Box_IDs: l.boxes.map(function (b) { return b.boxId; }),
        WorkOrder_Info: l.workOrder ? { number: l.workOrder } : null,
        Break_Time_Total_Minutes: breakTotal(), Break_Time_Data: state.breaks.slice()
      }, ngBy);
      if (l.photo) {
        body.images = [{
          base64: l.photo.replace(/^data:image\/\w+;base64,/, ''), label: '初物チェック',
          sebanggo: l.sebango, date: body.Date, worker: state.worker, factory: FACTORY, machine: MACHINE_LEGACY
        }];
      }
      var r = await postJSON('/submitToSRSDBiReporter', body);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      state.lanes[name] = emptyLane(); afterLaneCleared(name);
      toast('✅ ' + name + ' 送信完了 / Submitted');
    } catch (e) {
      // draft stays untouched so nothing is lost; the operator can press Submit again
      showAlert('送信に失敗しました。もう一度お試しください。\nSubmit failed - your entries are kept. Try again.\n' + e.message);
      if (btn) btn.disabled = false;
    } finally { submitting = false; }
  }

  // ---------- operator ----------
  async function loadWorkers() {
    var sel = $('workerSelect');
    try {
      var r = await fetch(serverURL + '/getWorkerNames?selectedFactory=' + encodeURIComponent(FACTORY));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      workers = await r.json();
    } catch (e) { console.error('SRS: worker list failed', e); toast('作業者リストを取得できません / Could not load workers'); }
    workers.forEach(function (n) { var o = document.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o); });
    if (state.worker && workers.indexOf(state.worker) < 0) { var o = document.createElement('option'); o.value = state.worker; o.textContent = state.worker; sel.appendChild(o); }
    sel.value = state.worker;
  }
  $('workerSelect').onchange = function () { state.worker = this.value; save(); };

  // ---------- init ----------
  function tickClock() { $('clock').textContent = nowHM(); }

  function init() {
    if (!MACHINE) {
      // no / unknown machine in the URL: let the operator pick (the URL stays the source of truth afterwards)
      $('lanes').innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="big">設備を選択 / Choose machine</div>' +
        '<div style="display:flex;gap:12px"><a class="btn btn-primary" href="?filter=SCNA&machine=Girasol-1">Girasol 1</a>' +
        '<a class="btn btn-primary" href="?filter=SCNA&machine=Girasol-2">Girasol 2</a></div></div>';
      $('headerMachineTag').textContent = '設備: --';
      document.querySelector('.shared-bar').style.display = 'none';
      return;
    }
    $('headerMachineTag').textContent = '設備: ' + MACHINE_LEGACY;
    load();
    renderBreakSummary();
    renderShell();
    loadWorkers();
    tickClock(); setInterval(tickClock, 15000);
  }
  init();
})();
