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
    doneTimeoutMs: 120000,
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
  function bitmapBytes(cv) {
    var W = HEAD_DOTS, wb = W / 8, H = cv.height;
    var src = cv.getContext('2d').getImageData(0, 0, Math.min(cv.width, W), H).data, sw = Math.min(cv.width, W);
    var out = new Uint8Array(wb * H);
    out.fill(0xff);                                              // TSPL BITMAP: 1 = white, 0 = black
    for (var y = 0; y < H; y++) for (var x = 0; x < sw; x++) {
      var i = (y * sw + x) * 4;
      var g = src[i] * 0.3 + src[i + 1] * 0.59 + src[i + 2] * 0.11;
      if (g < BLACK_BELOW) out[y * wb + (x >> 3)] &= ~(0x80 >> (x & 7));
    }
    return { wb: wb, h: H, data: out };
  }
  function buildTspl(cv, copies) {
    var enc = new TextEncoder(), b = bitmapBytes(cv);
    var head = enc.encode(
      'SIZE ' + LABEL_W_MM + ' mm,' + LABEL_H_MM + ' mm\r\nGAP ' + settings.gapMm + ' mm,0 mm\r\nDENSITY ' + settings.density +
      '\r\nSPEED ' + settings.speed + '\r\nDIRECTION 0\r\nCLS\r\nBITMAP 0,0,' + b.wb + ',' + b.h + ',0,');
    var tail = enc.encode('\r\nPRINT 1,' + (copies || 1) + '\r\n');
    var all = new Uint8Array(head.length + b.data.length + tail.length);
    all.set(head, 0); all.set(b.data, head.length); all.set(tail, head.length + b.data.length);
    return all;
  }

  // ------------------------------------------------------------------ Bluetooth
  var dev = null, wch = null, nch = null, waiters = [];
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  function onNotify(ev) {
    var s = ''; try { s = new TextDecoder().decode(ev.target.value.buffer); } catch (e) { }
    waiters.slice().forEach(function (w) { w(s); });
  }
  function waitFor(re, ms) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { drop(); reject(new Error('printer did not answer')); }, ms);
      var acc = '';
      function fn(s) { acc += s; if (re.test(acc)) { drop(); clearTimeout(timer); resolve(acc); } }
      function drop() { waiters = waiters.filter(function (x) { return x !== fn; }); }
      waiters.push(fn);
    });
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
      optionalServices: [BLE.service],
    });
    if (old && old.id !== d.id) { try { if (old.gatt.connected) old.gatt.disconnect(); if (old.forget) await old.forget(); } catch (e) { } }
    dev = d; resetLink(); saveId(d.id);
    dev.addEventListener('gattserverdisconnected', resetLink);
    return connect();
  }

  async function connect(opts) {
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
      var server = await dev.gatt.connect();
      var svc = await server.getPrimaryService(BLE.service);
      wch = await svc.getCharacteristic(BLE.write);
      nch = await svc.getCharacteristic(BLE.notify);
      await nch.startNotifications();
      nch.addEventListener('characteristicvaluechanged', onNotify);
    }
    return dev.name || 'D520';
  }

  async function sendTspl(bytes, onProgress) {
    var done = waitFor(/SSSGETPRINTING:DONE/, BLE.doneTimeoutMs);
    done.catch(function () { });
    for (var o = 0; o < bytes.length; o += BLE.chunk) {
      await wch.writeValueWithoutResponse(bytes.slice(o, o + BLE.chunk));
      await sleep(BLE.delayMs);
      if (onProgress && ((o / BLE.chunk) % 50 === 0)) onProgress(Math.min(1, o / bytes.length));
    }
    if (onProgress) onProgress(1);
    try { await done; }
    catch (e) { e.afterSend = true; throw e; }      // everything was sent: the label may well have printed, so no blind retry
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

  root.KensaBT = {
    settings: settings, renderLabel: renderLabel, buildTspl: buildTspl, connect: connect, pick: pick, listPaired: listPaired, status: status, select: select, forget: forget, watch: watch, testPrint: testPrint,
    printCanvas: printCanvas, printLayout: printLayout, HEAD_DOTS: HEAD_DOTS,
    isSupported: function () { return !!(navigator.bluetooth && navigator.bluetooth.getDevices); },
  };
})(typeof window !== 'undefined' ? window : this);
