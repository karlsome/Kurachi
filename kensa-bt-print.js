// kensa-bt-print.js - print a SCNA label layout straight from the tablet to a D520BT over Bluetooth LE.
//
//   KensaBT.renderLabel(layout, data, overrides) -> canvas (portrait, ready for the printer)
//   KensaBT.printLayout(layout, data, overrides) -> Promise  (render + TSPL + BLE send, waits for DONE)
//   KensaBT.connect({ pair })                    -> Promise  (reuse the granted printer; pair = true opens the chooser)
//
// Needs (loaded before this file): qrcode.min.js (qrcode-generator) and JsBarcode.code128.min.js.
// Needs Chrome with chrome://flags/#enable-web-bluetooth-new-permissions-backend enabled (for getDevices()).
//
// The layout JSON is the one designed in freyaAdmin2 -> SCNA (elements: text / barcode128 / qr / line / rect, all in mm,
// text size and stroke width in pt). The print server (print_DBprinter.py) draws the same layout to PDF; this file is its
// canvas twin. Layouts are landscape (152.4 x 101.6 mm) while the D520BT stock is portrait 4x6 in, so the canvas is
// rotated 90 degrees before printing (ROTATE below).
(function (root) {
  'use strict';

  // ------------------------------------------------------------------ settings
  var HEAD_DOTS = 808;                 // printable width of the D520BT head in dots (101 bytes), measured with a test label
  var LABEL_W_MM = 101.6, LABEL_H_MM = 152.4;
  var PPM = HEAD_DOTS / LABEL_W_MM;    // dots per mm (7.95; 203 dpi is 7.99)
  var PT = 25.4 / 72;                  // mm per pt
  var MIN_FIT_PT = 4, LINE_HEIGHT = 1.2;
  var CJK_FONTS = '"Noto Sans CJK JP","Noto Sans JP","Droid Sans Japanese","Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif';
  var BLACK_BELOW = 150;               // grey level (0-255) under which a pixel prints black
  var BLE = {
    service: 0xff00, write: 0xff02, notify: 0xff01,
    chunk: 128, delayMs: 15,           // writes are paced; the printer has no flow control we can rely on
    idleTimeoutMs: 15000,              // no progress (write accepted / printer message) for this long = give up with an error
    // services the browser may let us read when listing what the printer exposes (Web Bluetooth only reveals services named when pairing)
    extraServices: [0x1800, 0x1801, 0x180a, 0x180f, 0xfee7, 0xffe0, 0xfff0, 0xff00, 0x18f0, 0xae00,
      '49535343-fe7d-4ae5-8fa9-9fafd205e455', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2'],
  };
  var settings = { rotate: 'cw', density: 8, speed: 4, gapMm: 3 };

  // ------------------------------------------------------------------ rendering
  function fill(template, data) {
    return String(template == null ? '' : template).replace(/\{([^{}]+)\}/g, function (_, k) {
      var v = data[k.trim()]; return v == null ? '' : String(v);
    });
  }
  function hasCjk(s) { for (var i = 0; i < s.length; i++) if (s.charCodeAt(i) > 255) return true; return false; }
  function fontFor(el, sizePx, text) {
    var bold = /Bold/i.test(el.font || '') ? 'bold ' : '';
    return bold + sizePx + 'px ' + (hasCjk(text) ? CJK_FONTS : 'Helvetica,Arial,' + CJK_FONTS);
  }

  function layoutText(ctx, el, text, wDots, hDots) {
    var size = Number(el.size) || 10;                            // pt
    var pxPerPt = PT * PPM;
    function widthOf(t, sz) { ctx.font = fontFor(el, sz * pxPerPt, text); return ctx.measureText(t).width; }
    function wrap(sz) {
      var lines = [];
      String(text).split('\n').forEach(function (para) {
        var line = '';
        para.split(' ').forEach(function (word) {
          var cand = line ? line + ' ' + word : word;
          if (widthOf(cand, sz) <= wDots) { line = cand; return; }
          if (line) { lines.push(line); line = ''; }
          if (widthOf(word, sz) <= wDots) { line = word; return; }
          var chunk = '';
          Array.from(word).forEach(function (ch) {
            if (!chunk || widthOf(chunk + ch, sz) <= wDots) chunk += ch; else { lines.push(chunk); chunk = ch; }
          });
          line = chunk;
        });
        lines.push(line);
      });
      return lines;
    }
    function linesFor(sz) { return el.wrap ? wrap(sz) : String(text).split('\n'); }
    function fits(sz, lines) {
      return lines.every(function (l) { return widthOf(l, sz) <= wDots; }) &&
        (lines.length <= 1 || lines.length * sz * pxPerPt * LINE_HEIGHT <= hDots);
    }
    var lines = linesFor(size);
    if (el.autoFit) {
      while (size > MIN_FIT_PT && !fits(size, lines)) { size = Math.max(MIN_FIT_PT, size - 0.5); lines = linesFor(size); }
    }
    return { size: size, lines: lines };
  }

  function drawQr(ctx, content, x, y, w, h) {
    var qr = root.qrcode(0, 'M');                                // same level as the print server (ERROR_CORRECT_M)
    qr.addData(content); qr.make();
    var n = qr.getModuleCount(), border = 2, total = n + border * 2;
    var side = Math.min(w, h), cell = Math.max(1, Math.floor(side / total));   // whole dots per module = crisp scan
    var used = cell * total, ox = x + (side - used) / 2, oy = y + (side - used) / 2;
    ctx.fillStyle = '#000';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) {
      if (qr.isDark(r, c)) ctx.fillRect(Math.round(ox + (c + border) * cell), Math.round(oy + (r + border) * cell), cell, cell);
    }
  }

  function drawBarcode(ctx, value, x, y, w, h) {
    var tmp = document.createElement('canvas');
    // 1.2 pt per module like the print server, but whole dots so every bar edge is crisp; shrink when it does not fit w
    var mod = Math.max(1, Math.round(1.2 * PT * PPM));
    for (;;) {
      root.JsBarcode(tmp, value, { format: 'CODE128', width: mod, height: Math.max(1, Math.round(h)), displayValue: false, margin: 0 });
      if (tmp.width <= w || mod <= 1) break;
      mod--;
    }
    ctx.drawImage(tmp, Math.round(x), Math.round(y));            // left aligned, like the PDF
  }

  // landscape canvas: layout width along the long side, 1 mm = PPM dots
  function renderLandscape(layout, data, overrides) {
    var wMm = Number(layout.widthMm) || 152.4, hMm = Number(layout.heightMm) || 101.6;
    var W = Math.round(wMm * PPM), H = Math.round(hMm * PPM);
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#000'; ctx.strokeStyle = '#000'; ctx.textBaseline = 'alphabetic';
    var ov = overrides || {};
    (layout.elements || []).forEach(function (el) {
      var x = (Number(el.x) || 0) * PPM, y = (Number(el.y) || 0) * PPM, w = (Number(el.w) || 0) * PPM, h = (Number(el.h) || 0) * PPM;
      if (x + w < 0 || x > W || y + h < 0 || y > H) return;
      var name = el.name, has = name && Object.prototype.hasOwnProperty.call(ov, name);
      var lw = Math.max(1, Math.round((Number(el.strokeWidth) || 1) * PT * PPM));
      if (el.type === 'text') {
        var text = fill(has ? ov[name] : el.text, data);
        var t = layoutText(ctx, el, text, w, h);
        var px = t.size * PT * PPM;
        ctx.font = fontFor(el, px, text); ctx.fillStyle = '#000';
        ctx.textAlign = el.align === 'center' ? 'center' : el.align === 'right' ? 'right' : 'left';
        var ax = el.align === 'center' ? x + w / 2 : el.align === 'right' ? x + w : x;
        t.lines.forEach(function (line, i) { ctx.fillText(line, ax, y + px + i * px * LINE_HEIGHT); });
      } else if (el.type === 'barcode128') {
        var v = fill(has ? ov[name] : (el.bind || el.text), data);
        if (v) drawBarcode(ctx, v, x, y, w, h);
      } else if (el.type === 'qr') {
        var q = fill(has ? ov[name] : (el.bind || el.text), data);
        if (q) drawQr(ctx, q, x, y, w, h);
      } else if (el.type === 'line') {
        ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.stroke();
      } else if (el.type === 'rect') {
        ctx.lineWidth = lw; ctx.strokeRect(x, y, w, h);
      }
    });
    return cv;
  }

  // rotate a landscape canvas into the portrait head orientation
  function toPortrait(land) {
    var cv = document.createElement('canvas'); cv.width = land.height; cv.height = land.width;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    if (settings.rotate === 'ccw') { ctx.translate(0, land.width); ctx.rotate(-Math.PI / 2); }
    else if (settings.rotate === 'cw') { ctx.translate(land.height, 0); ctx.rotate(Math.PI / 2); }
    ctx.drawImage(land, 0, 0);
    return cv;
  }

  function renderLabel(layout, data, overrides) {
    var land = renderLandscape(layout, data || {}, overrides);
    var landscape = (Number(layout.widthMm) || 152.4) > (Number(layout.heightMm) || 101.6);
    var cv = landscape && settings.rotate !== 'none' ? toPortrait(land) : land;
    return cv;
  }

  // ------------------------------------------------------------------ TSPL
  // A full 4x6 bitmap is ~123 KB and BLE moves ~5 KB/s, so the label is sent compactly instead:
  //   * long solid black runs (box borders, rules) become native TSPL BAR commands (a few bytes each)
  //   * what is left (text, barcode, QR) is cut into small BITMAP tiles that cover only the inked areas
  // pack() works on a plain 0/1 mask so it can be checked without a canvas; the result is lossless.
  var BAR_MIN = 120;                   // a black run at least this long (dots) is sent as a BAR
  var GAP_Y = 8, GAP_X = 24;           // blank rows / columns that still keep two inked areas in one tile

  function maskFromCanvas(cv) {
    var W = HEAD_DOTS, H = cv.height, sw = Math.min(cv.width, W);
    var src = cv.getContext('2d').getImageData(0, 0, sw, H).data;
    var mask = new Uint8Array(W * H);
    for (var y = 0; y < H; y++) for (var x = 0; x < sw; x++) {
      var i = (y * sw + x) * 4;
      if (src[i] * 0.3 + src[i + 1] * 0.59 + src[i + 2] * 0.11 < BLACK_BELOW) mask[y * W + x] = 1;
    }
    return { mask: mask, W: W, H: H };
  }

  // -> { bars: [{x,y,w,h}], tiles: [{x,y,wb,h,data}] }  (mask is consumed)
  function pack(mask, W, H) {
    var bars = [], x, y, k, run, act;
    // horizontal runs, merged downwards when the same span repeats on the next row (thick lines = one BAR)
    act = {};
    for (y = 0; y < H; y++) {
      var seen = {};
      for (x = 0; x < W;) {
        if (!mask[y * W + x]) { x++; continue; }
        var x0 = x; while (x < W && mask[y * W + x]) x++;
        if (x - x0 < BAR_MIN) continue;
        k = x0 + ':' + x; seen[k] = 1;
        if (act[k]) act[k].h++; else { act[k] = { x: x0, y: y, w: x - x0, h: 1 }; bars.push(act[k]); }
        for (var c = x0; c < x; c++) mask[y * W + c] = 0;
      }
      for (k in act) if (!seen[k]) delete act[k];
    }
    // vertical runs of what is left (the sides of boxes), merged sideways
    act = {};
    for (x = 0; x < W; x++) {
      var seenV = {};
      for (y = 0; y < H;) {
        if (!mask[y * W + x]) { y++; continue; }
        var y0 = y; while (y < H && mask[y * W + x]) y++;
        if (y - y0 < BAR_MIN) continue;
        k = y0 + ':' + y; seenV[k] = 1;
        if (act[k]) act[k].w++; else { act[k] = { x: x, y: y0, w: 1, h: y - y0 }; bars.push(act[k]); }
        for (var r = y0; r < y; r++) mask[r * W + x] = 0;
      }
      for (k in act) if (!seenV[k]) delete act[k];
    }
    // remaining ink -> tiles: bands of rows, then runs of columns inside each band
    var rowInk = new Uint8Array(H), tiles = [];
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) if (mask[y * W + x]) { rowInk[y] = 1; break; }
    for (y = 0; y < H;) {
      if (!rowInk[y]) { y++; continue; }
      var top = y, last = y, gap = 0;
      for (; y < H; y++) { if (rowInk[y]) { last = y; gap = 0; } else if (++gap > GAP_Y) break; }
      var bh = last - top + 1, colInk = new Uint8Array(W);
      for (var yy = top; yy <= last; yy++) for (x = 0; x < W; x++) if (mask[yy * W + x]) colInk[x] = 1;
      for (x = 0; x < W;) {
        if (!colInk[x]) { x++; continue; }
        var cs = x, ce = x, g = 0;
        for (; x < W; x++) { if (colInk[x]) { ce = x; g = 0; } else if (++g > GAP_X) break; }
        var bx = cs >> 3 << 3, wb = (ce >> 3) + 1 - (bx >> 3), data = new Uint8Array(wb * bh);
        data.fill(0xff);                                           // TSPL BITMAP: 1 = white, 0 = black
        for (var ty = 0; ty < bh; ty++) for (var tx = 0; tx < wb * 8; tx++) {
          if (bx + tx < W && mask[(top + ty) * W + bx + tx]) data[ty * wb + (tx >> 3)] &= ~(0x80 >> (tx & 7));
        }
        tiles.push({ x: bx, y: top, wb: wb, h: bh, data: data });
      }
    }
    return { bars: bars, tiles: tiles };
  }

  function buildTspl(cv, copies) {
    var enc = new TextEncoder(), m = maskFromCanvas(cv), p = pack(m.mask, m.W, m.H);
    var parts = [enc.encode(
      'SIZE ' + LABEL_W_MM + ' mm,' + LABEL_H_MM + ' mm\r\nGAP ' + settings.gapMm + ' mm,0 mm\r\nDENSITY ' + settings.density +
      '\r\nSPEED ' + settings.speed + '\r\nDIRECTION 0\r\nCLS\r\n')];
    // bitmaps first (they overwrite their own area, tiles never overlap), bars last so nothing can paint over them
    p.tiles.forEach(function (t) {
      parts.push(enc.encode('BITMAP ' + t.x + ',' + t.y + ',' + t.wb + ',' + t.h + ',0,'), t.data, enc.encode('\r\n'));
    });
    p.bars.forEach(function (b) { parts.push(enc.encode('BAR ' + b.x + ',' + b.y + ',' + b.w + ',' + b.h + '\r\n')); });
    parts.push(enc.encode('PRINT 1,' + (copies || 1) + '\r\n'));
    var n = 0; parts.forEach(function (a) { n += a.length; });
    var all = new Uint8Array(n), o = 0;
    parts.forEach(function (a) { all.set(a, o); o += a.length; });
    return all;
  }

  // ------------------------------------------------------------------ Bluetooth
  var dev = null, wch = null, nch = null, waiters = [];
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  function onNotify(ev) {
    var s = ''; try { s = new TextDecoder().decode(ev.target.value.buffer); } catch (e) { }
    waiters.slice().forEach(function (w) { w(s); });
  }
  // resolves when the printer's messages match re. The idle timer only runs once touch() has been called (after the last
  // write) and restarts on every message, so a printer that keeps talking is never cut off but a silent one errors after ms.
  function waitFor(re, ms) {
    var timer = null, acc = '', fn, p, touch;
    function drop() { clearTimeout(timer); waiters = waiters.filter(function (x) { return x !== fn; }); }
    p = new Promise(function (resolve, reject) {
      function arm() { clearTimeout(timer); timer = setTimeout(function () { drop(); reject(new Error('printer did not answer (no response for ' + Math.round(ms / 1000) + ' s)')); }, ms); }
      fn = function (s) { acc += s; if (re.test(acc)) { drop(); resolve(acc); } else if (timer) arm(); };
      touch = arm;
      waiters.push(fn);
    });
    p.touch = touch; p.cancel = drop;
    return p;
  }
  function withTimeout(promise, ms, what) {
    var t;
    return Promise.race([promise, new Promise(function (_, rej) { t = setTimeout(function () { rej(new Error(what + ' timed out after ' + Math.round(ms / 1000) + ' s')); }, ms); })])
      .then(function (v) { clearTimeout(t); return v; }, function (e) { clearTimeout(t); throw e; });
  }

  // Chrome only connects to a remembered device it has recently seen advertising ("no longer in range" otherwise),
  // so scan for its advertisement first.
  function seeAdvert(d) {
    if (!d.watchAdvertisements) return Promise.resolve();
    return new Promise(function (resolve) {
      var ctl = new AbortController(), timer;
      function finish() { clearTimeout(timer); d.removeEventListener('advertisementreceived', finish); try { ctl.abort(); } catch (e) { } resolve(); }
      d.addEventListener('advertisementreceived', finish);
      timer = setTimeout(finish, 6000);
      d.watchAdvertisements({ signal: ctl.signal }).catch(finish);
    });
  }

  // the operator picks "their" printer once; its id is remembered per origin (several D520s may be in range)
  var ID_KEY = 'kensaBtDeviceId';
  function savedId() { try { return localStorage.getItem(ID_KEY); } catch (e) { return null; } }
  function saveId(id) { try { localStorage.setItem(ID_KEY, id); } catch (e) { } }
  function resetLink() { wch = null; nch = null; }

  // forgetOld: drop the permission of the printer that was used before, so only the new one stays granted
  // The chooser lists every printer in range and re-sorts as their signal changes, which can swallow the tap on a row
  // (Pair stays grey). The D520BT advertises service 0xfee7, so by default only those are listed; all: true shows every D520.
  async function pick(opts) {
    if (!navigator.bluetooth) throw new Error('Web Bluetooth is not available (use Chrome over HTTPS)');
    var old = dev, all = !!(opts && opts.all);
    var d = await navigator.bluetooth.requestDevice({
      filters: all ? [{ namePrefix: 'D520' }] : [{ name: 'D520', services: [0xfee7] }],
      optionalServices: [BLE.service].concat(BLE.extraServices.filter(function (u) { return u !== BLE.service; })),
    });
    if (old && old.id !== d.id) { try { if (old.gatt.connected) old.gatt.disconnect(); if (old.forget) await old.forget(); } catch (e) { } }
    dev = d; resetLink(); saveId(d.id);
    dev.addEventListener('gattserverdisconnected', resetLink);
    return connect();
  }

  var lastError = '';
  async function connect(opts) {
    try { var r = await connectInner(opts); lastError = ''; return r; }
    catch (e) { lastError = (e && e.message) || String(e); throw e; }
  }
  async function connectInner(opts) {
    opts = opts || {};
    if (!navigator.bluetooth) throw new Error('Web Bluetooth is not available (use Chrome over HTTPS)');
    if (!dev || !dev.gatt) {
      var granted = navigator.bluetooth.getDevices ? await navigator.bluetooth.getDevices() : [];
      var named = granted.filter(function (d) { return /^D520/i.test(d.name || ''); }), want = savedId();
      dev = named.filter(function (d) { return d.id === want; })[0] || named[0] || null;
      if (!dev && opts.pair) return pick();
      if (!dev) throw new Error('printer not paired');
      saveId(dev.id);
      dev.addEventListener('gattserverdisconnected', resetLink);
    }
    if (!dev.gatt.connected || !wch) {
      await seeAdvert(dev);
      var server = await withTimeout(dev.gatt.connect(), BLE.idleTimeoutMs, 'Bluetooth connect');
      var svc = await withTimeout(server.getPrimaryService(BLE.service), BLE.idleTimeoutMs, 'service lookup');
      var w = await svc.getCharacteristic(BLE.write);
      var n = await svc.getCharacteristic(BLE.notify);
      await withTimeout(n.startNotifications(), BLE.idleTimeoutMs, 'notifications');
      wch = w; nch = n;
      nch.addEventListener('characteristicvaluechanged', onNotify);
    }
    return dev.name || 'D520';
  }

  async function sendTspl(bytes, onProgress) {
    var done = waitFor(/SSSGETPRINTING:DONE/, BLE.idleTimeoutMs);
    done.catch(function () { });
    try {
      for (var o = 0; o < bytes.length; o += BLE.chunk) {
        await withTimeout(wch.writeValueWithoutResponse(bytes.slice(o, o + BLE.chunk)), BLE.idleTimeoutMs, 'sending to the printer');
        await sleep(BLE.delayMs);
        if (onProgress && ((o / BLE.chunk) % 50 === 0)) onProgress(Math.min(1, o / bytes.length));
      }
    } catch (e) { done.cancel(); throw e; }
    if (onProgress) onProgress(1);
    done.touch();                                   // all sent: from here the printer has 15 s of silence at most
    try { await done; }
    catch (e) { e.afterSend = true; throw e; }      // everything was sent: the label may well have printed, so no blind retry
  }

  // What the printer really exposes, as plain text lines for a screenshot (Settings / BT offline tag).
  async function diagnose() {
    var L = [], add = function (t) { L.push(t); };
    add('Time: ' + new Date().toISOString());
    add('Secure context: ' + (root.isSecureContext !== false) + ' | Web Bluetooth: ' + !!navigator.bluetooth + ' | getDevices: ' + !!(navigator.bluetooth && navigator.bluetooth.getDevices));
    add('Browser: ' + (navigator.userAgent || '').replace(/^Mozilla\/5.0 /, ''));
    add('Print method: ' + getRoute() + ' | saved printer id: ' + (savedId() || '-'));
    add('Last connect error: ' + (lastError || '-'));
    if (!navigator.bluetooth) return L;
    var granted = [];
    try { granted = navigator.bluetooth.getDevices ? await navigator.bluetooth.getDevices() : []; } catch (e) { add('getDevices failed: ' + e.message); }
    add('Granted devices: ' + (granted.length ? granted.map(function (d) { return (d.name || '?') + ' [' + String(d.id).slice(0, 8) + '] gatt.connected=' + !!(d.gatt && d.gatt.connected); }).join(', ') : 'none'));
    var d = (dev && dev.gatt ? dev : null);
    if (!d) { var named = granted.filter(function (x) { return /^D520/i.test(x.name || ''); }), want = savedId(); d = named.filter(function (x) { return x.id === want; })[0] || named[0] || null; }
    if (!d) { add('No paired D520 to inspect. Pair the printer first.'); return L; }
    add('Inspecting: ' + (d.name || '?') + ' [' + String(d.id).slice(0, 8) + ']');
    add('Link in use by printing: write=' + !!wch + ' notify=' + !!nch);
    var server;
    try { await seeAdvert(d); add('Advertisement seen: yes'); } catch (e) { add('Advertisement: ' + e.message); }
    try { server = await withTimeout(d.gatt.connect(), BLE.idleTimeoutMs, 'gatt.connect'); add('gatt.connect: OK'); }
    catch (e) { add('gatt.connect FAILED: ' + e.message); return L; }
    var services = [];
    try { services = await withTimeout(server.getPrimaryServices(), BLE.idleTimeoutMs, 'getPrimaryServices'); add('Services found: ' + services.length); }
    catch (e) { add('getPrimaryServices FAILED: ' + e.message); }
    for (var i = 0; i < services.length; i++) {
      add('SERVICE ' + services[i].uuid);
      try {
        var chars = await services[i].getCharacteristics();
        if (!chars.length) add('   (no characteristics)');
        chars.forEach(function (c) {
          var p = ['read', 'write', 'writeWithoutResponse', 'notify', 'indicate'].filter(function (k) { return c.properties && c.properties[k]; });
          add('   CHAR ' + c.uuid + '  [' + p.join(', ') + ']');
        });
      } catch (e) { add('   characteristics FAILED: ' + e.message); }
    }
    try {
      var s2 = await server.getPrimaryService(BLE.service);
      var names = { write: BLE.write, notify: BLE.notify };
      for (var k in names) {
        try { await s2.getCharacteristic(names[k]); add('Needed ' + k + ' (0x' + names[k].toString(16) + '): present'); }
        catch (e) { add('Needed ' + k + ' (0x' + names[k].toString(16) + '): MISSING - ' + e.message); }
      }
    } catch (e) { add('Needed service 0xff00: MISSING - ' + e.message); }
    return L;
  }


  // ------------------------------------------------------------------ settings screen helpers
  async function grantedPrinters() {
    var granted = navigator.bluetooth && navigator.bluetooth.getDevices ? await navigator.bluetooth.getDevices() : [];
    return granted.filter(function (d) { return /^D520/i.test(d.name || ''); });
  }
  // printers this tablet has been given access to, with the selected one marked: [{ id, name, selected }]
  async function listPaired() {
    var named = await grantedPrinters(), want = savedId();
    var hit = named.some(function (d) { return d.id === want; });
    return named.map(function (d, i) { return { id: d.id, name: d.name, selected: hit ? d.id === want : i === 0 }; });
  }
  function status() {
    return { connected: !!(dev && dev.gatt && dev.gatt.connected && wch), name: dev ? dev.name : '', id: dev ? dev.id : savedId() };
  }
  // choose which paired printer prints from now on (the link is rebuilt on the next print)
  function select(id) {
    if (dev && dev.id !== id) { try { if (dev.gatt.connected) dev.gatt.disconnect(); } catch (e) { } dev = null; resetLink(); }
    saveId(id);
  }
  async function forget(id) {
    var named = await grantedPrinters();
    for (var i = 0; i < named.length; i++) {
      if (named[i].id !== id) continue;
      try { if (named[i].gatt.connected) named[i].gatt.disconnect(); if (named[i].forget) await named[i].forget(); } catch (e) { }
    }
    if (dev && dev.id === id) { dev = null; resetLink(); }
    if (savedId() === id) { try { localStorage.removeItem(ID_KEY); } catch (e) { } }
  }
  // Live signal strength: a printer that is connected stops advertising, so the current link is dropped while watching
  // (print() reconnects by itself). onUpdate({ id, name, rssi, at }) fires on every advertisement; returns stop().
  async function watch(onUpdate) {
    var named = await grantedPrinters();
    if (dev && dev.gatt && dev.gatt.connected) { try { dev.gatt.disconnect(); } catch (e) { } }
    resetLink();
    var ctl = new AbortController(), hooks = [];
    named.forEach(function (d) {
      var h = function (ev) { onUpdate({ id: d.id, name: d.name, rssi: ev.rssi, at: Date.now() }); };
      d.addEventListener('advertisementreceived', h); hooks.push([d, h]);
      if (d.watchAdvertisements) d.watchAdvertisements({ signal: ctl.signal }).catch(function (e) { onUpdate({ id: d.id, name: d.name, error: e.message || String(e) }); });
    });
    return function stop() {
      try { ctl.abort(); } catch (e) { }
      hooks.forEach(function (x) { x[0].removeEventListener('advertisementreceived', x[1]); });
    };
  }
  // small ASCII-only job (about one second of data) so an operator can see which printer answers
  async function testPrint(line1, line2) {
    await connect();
    var enc = new TextEncoder(), q = function (t) { return String(t || '').replace(/[^\x20-\x7e]/g, '?').replace(/"/g, "'"); };
    var job = 'SIZE ' + LABEL_W_MM + ' mm,' + LABEL_H_MM + ' mm\r\nGAP ' + settings.gapMm + ' mm,0 mm\r\nDENSITY ' + settings.density +
      '\r\nDIRECTION 0\r\nCLS\r\nBOX 8,8,800,1210,4\r\nTEXT 50,80,"4",0,2,2,"PRINTER TEST"\r\nTEXT 50,260,"3",0,2,2,"' + q(line1) +
      '"\r\nTEXT 50,380,"3",0,1,1,"' + q(line2) + '"\r\nPRINT 1,1\r\n';
    await sendTspl(enc.encode(job));
  }

  async function printCanvas(cv, opts) {
    opts = opts || {};
    await connect(opts);
    await sendTspl(buildTspl(cv, opts.copies), opts.onProgress);
  }
  async function printLayout(layout, data, overrides, opts) {
    return printCanvas(renderLabel(layout, data, overrides), opts);
  }


  // ------------------------------------------------------------------ print route (Settings > Print method)
  // 'auto' = Bluetooth first, mini-PC if it fails (default) | 'bt' = Bluetooth only | 'pc' = mini-PC only. Kept per tablet.
  var ROUTE_KEY = 'kensaPrintRoute';
  function getRoute() { try { var v = localStorage.getItem(ROUTE_KEY); return v === 'bt' || v === 'pc' ? v : 'auto'; } catch (e) { return 'auto'; } }
  function setRoute(v) { try { localStorage.setItem(ROUTE_KEY, v === 'bt' || v === 'pc' ? v : 'auto'); } catch (e) { } }
  var ROUTE_TEXT = {
    label: { ja: '印刷方法', en: 'Print method', pt: 'Método de impressão' },
    title: { ja: '印刷方法の設定', en: 'Print Method Settings', pt: 'Configurações do método de impressão' },
    selected: { ja: '選択中', en: 'Selected', pt: 'Selecionada' },
    auto: { ja: '自動', en: 'Auto', pt: 'Automático' },
    auto_d: { ja: 'Bluetoothを優先し、失敗したらミニPCで印刷します', en: 'Bluetooth first, mini PC if it fails', pt: 'Bluetooth primeiro, mini PC se falhar' },
    bt: { ja: 'Bluetoothのみ', en: 'Bluetooth only', pt: 'Somente Bluetooth' },
    bt_d: { ja: 'ミニPCには切り替えません', en: 'Never switches to the mini PC', pt: 'Nunca muda para o mini PC' },
    pc: { ja: 'ミニPCのみ', en: 'Mini PC only', pt: 'Somente mini PC' },
    pc_d: { ja: 'Bluetoothは使いません', en: 'Bluetooth is not used', pt: 'Bluetooth não é usado' }
  };
  function routeText(k) {
    var lang = 'ja';
    try { lang = (typeof root.getCurrentLanguage === 'function' ? root.getCurrentLanguage() : localStorage.getItem('appLanguage')) || 'ja'; } catch (e) { }
    var e = ROUTE_TEXT[k]; return e ? (e[lang] || e.en) : k;
  }
  // Settings page body: one card per route, saved as soon as it is tapped (uses the pages' CSS variables)
  function renderRoutePage(body) {
    var cur = getRoute();
    body.style.cssText = 'display:flex;flex-direction:column;gap:12px;';
    body.innerHTML = '';
    ['auto', 'bt', 'pc'].forEach(function (id) {
      var on = id === cur, card = document.createElement('button');
      card.type = 'button';
      card.style.cssText = 'display:flex;flex-direction:column;align-items:flex-start;gap:4px;padding:16px 18px;border-radius:var(--card-radius);cursor:pointer;font-family:inherit;text-align:left;box-shadow:var(--shadow-card);' +
        (on ? 'background:var(--brand-soft);border:2px solid var(--brand);color:var(--brand-hover);' : 'background:var(--bg-surface);border:1px solid var(--border-strong);color:var(--text-main);');
      card.innerHTML = '<span style="font-size:1.25rem;font-weight:800;"></span><span style="font-size:.875rem;font-weight:700;"></span><span style="font-size:.8125rem;font-weight:800;min-height:1.2em;"></span>';
      var sp = card.querySelectorAll('span');
      sp[0].textContent = routeText(id); sp[1].textContent = routeText(id + '_d'); sp[2].textContent = on ? routeText('selected') : '';
      card.onclick = function () { setRoute(id); renderRoutePage(body); };
      body.appendChild(card);
    });
  }

  root.KensaBT = {
    settings: settings, renderLabel: renderLabel, buildTspl: buildTspl, connect: connect, pick: pick, listPaired: listPaired, status: status, select: select, forget: forget, watch: watch, testPrint: testPrint,
    printCanvas: printCanvas, printLayout: printLayout, diagnose: diagnose, lastError: function () { return lastError; }, getRoute: getRoute, setRoute: setRoute, routeText: routeText, renderRoutePage: renderRoutePage, HEAD_DOTS: HEAD_DOTS, _pack: pack,
    isSupported: function () { return !!(navigator.bluetooth && navigator.bluetooth.getDevices); },
  };
})(typeof window !== 'undefined' ? window : this);
