/* Job completion and sign-off sheet.
   - Everything stays on the device: the draft autosaves to the browser's IndexedDB,
     photos are shrunk in the browser, and the PDF is built here with jsPDF.
   - Nothing is sent to a server. "Share PDF" uses the phone's own share sheet. */

(function () {
  'use strict';

  var COMPANY = 'Northern External Cleaning Co';
  var COMPANY_LINE = 'Halifax, West Yorkshire · 07735 894261 · Instagram @northernwcc';
  var DRAFT_KEY = 'draft-v1';

  // ---------- tiny IndexedDB key/value store (falls back to memory) ----------
  var memory = {};
  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) { return reject(new Error('no idb')); }
      var req = indexedDB.open('necc-signoff', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('kv'); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function kvSet(key, value) {
    memory[key] = value;
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(value, key);
        tx.oncomplete = resolve; tx.onerror = function () { reject(tx.error); };
      });
    }).catch(function () { /* memory only */ });
  }
  function kvGet(key) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('kv', 'readonly');
        var r = tx.objectStore('kv').get(key);
        r.onsuccess = function () { resolve(r.result); }; r.onerror = function () { reject(r.error); };
      });
    }).catch(function () { return memory[key]; });
  }
  function kvDel(key) {
    delete memory[key];
    return openDb().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').delete(key);
        tx.oncomplete = resolve; tx.onerror = resolve;
      });
    }).catch(function () {});
  }

  // ---------- state ----------
  var state = { fields: {}, checks: [], tanks: [], photos: [], sigs: { boc: null, us: null } };
  var form = document.getElementById('so-form');
  var statusEl = document.getElementById('status');
  var savedPill = document.getElementById('saved-pill');
  var saveTimer = null;

  function setStatus(msg) { statusEl.textContent = msg || ''; }
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 400);
  }
  function save() {
    collectFields();
    kvSet(DRAFT_KEY, state).then(function () {
      var t = new Date();
      savedPill.textContent = 'Draft saved ' + two(t.getHours()) + ':' + two(t.getMinutes());
    });
  }
  function two(n) { return (n < 10 ? '0' : '') + n; }

  function collectFields() {
    var f = {};
    Array.prototype.forEach.call(form.querySelectorAll('input[name], textarea[name], select[name]'), function (el) {
      if (el.type === 'checkbox' || el.type === 'radio' || el.closest('.tank-row') || el.closest('.photo')) { return; }
      f[el.name] = el.value;
    });
    var acc = form.querySelector('input[name="acceptance"]:checked');
    f.acceptance = acc ? acc.value : '';
    state.fields = f;
    state.checks = Array.prototype.map.call(form.querySelectorAll('input[name="chk"]:checked'), function (c) { return c.value; });
    state.tanks = Array.prototype.map.call(document.querySelectorAll('.tank-row'), function (row) {
      return {
        ref: row.querySelector('[data-k="ref"]').value,
        gas: row.querySelector('[data-k="gas"]').value,
        faces: row.querySelector('[data-k="faces"]').value,
        result: row.querySelector('[data-k="result"]').value,
        notes: row.querySelector('[data-k="notes"]').value
      };
    });
  }

  function applyFields() {
    Object.keys(state.fields || {}).forEach(function (name) {
      if (name === 'acceptance') {
        var r = form.querySelector('input[name="acceptance"][value="' + CSS.escape(state.fields.acceptance) + '"]');
        if (r) { r.checked = true; }
        return;
      }
      var el = form.querySelector('[name="' + name + '"]');
      if (el && !el.closest('.tank-row') && !el.closest('.photo')) { el.value = state.fields[name]; }
    });
    Array.prototype.forEach.call(form.querySelectorAll('input[name="chk"]'), function (c) {
      c.checked = (state.checks || []).indexOf(c.value) !== -1;
    });
  }

  // ---------- tank rows ----------
  var tankRows = document.getElementById('tank-rows');
  var GASES = ['Liquid oxygen', 'Liquid nitrogen', 'Liquid argon', 'Carbon dioxide', 'Other / not a tank'];
  var FACES = ['All faces', 'Partial (see notes)'];
  var RESULTS = ['Cleaned to standard', 'Partially cleaned', 'Not cleaned'];

  function optionList(values, chosen) {
    return values.map(function (v) { return '<option' + (v === chosen ? ' selected' : '') + '>' + v + '</option>'; }).join('');
  }
  function addTankRow(t) {
    t = t || { ref: '', gas: GASES[0], faces: FACES[0], result: RESULTS[0], notes: '' };
    var row = document.createElement('div');
    row.className = 'tank-row';
    row.innerHTML =
      '<div class="field"><label>Tank / area</label><input data-k="ref" type="text" placeholder="Tank 1" value="' + esc(t.ref) + '"></div>' +
      '<div class="field"><label>Gas</label><select data-k="gas">' + optionList(GASES, t.gas) + '</select></div>' +
      '<div class="field"><label>Faces</label><select data-k="faces">' + optionList(FACES, t.faces) + '</select></div>' +
      '<div class="field"><label>Result</label><select data-k="result">' + optionList(RESULTS, t.result) + '</select></div>' +
      '<button type="button" class="icon-btn remove" aria-label="Remove this row" title="Remove">×</button>' +
      '<div class="field notes"><label>Notes</label><input data-k="notes" type="text" placeholder="e.g. north face left, overhead line within 10 m" value="' + esc(t.notes) + '"></div>';
    row.querySelector('.remove').addEventListener('click', function () { row.remove(); scheduleSave(); });
    tankRows.appendChild(row);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  document.getElementById('add-tank').addEventListener('click', function () { addTankRow(); scheduleSave(); });

  // ---------- photos ----------
  var photoGrid = document.getElementById('photo-grid');
  var photoEmpty = document.getElementById('photo-empty');
  var KINDS = ['After', 'Before', 'Observation', 'General'];

  function handleFiles(files) {
    var list = Array.prototype.slice.call(files || []);
    if (!list.length) { return; }
    setStatus('Adding ' + list.length + ' photo' + (list.length > 1 ? 's' : '') + '…');
    var chain = Promise.resolve();
    list.forEach(function (file) {
      chain = chain.then(function () { return shrinkImage(file, 1400, 0.82); }).then(function (img) {
        state.photos.push({ id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), dataUrl: img.dataUrl, w: img.w, h: img.h, kind: 'After', caption: '' });
      }).catch(function () { setStatus('One photo could not be read and was skipped.'); });
    });
    chain.then(function () { renderPhotos(); save(); setStatus(''); });
  }
  function shrinkImage(file, maxSide, quality) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var s = Math.min(1, maxSide / Math.max(w, h));
        var cw = Math.round(w * s), ch = Math.round(h * s);
        var c = document.createElement('canvas'); c.width = cw; c.height = ch;
        c.getContext('2d').drawImage(img, 0, 0, cw, ch);
        URL.revokeObjectURL(url);
        resolve({ dataUrl: c.toDataURL('image/jpeg', quality), w: cw, h: ch });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('bad image')); };
      img.src = url;
    });
  }
  function renderPhotos() {
    photoGrid.innerHTML = '';
    photoEmpty.hidden = state.photos.length > 0;
    state.photos.forEach(function (p) {
      var card = document.createElement('div');
      card.className = 'photo';
      card.innerHTML =
        '<img src="' + p.dataUrl + '" alt="">' +
        '<select aria-label="Photo type">' + optionList(KINDS, p.kind) + '</select>' +
        '<input type="text" placeholder="Caption, e.g. Tank 2 north face" value="' + esc(p.caption) + '" aria-label="Caption">' +
        '<button type="button" class="remove">Remove</button>';
      card.querySelector('select').addEventListener('change', function (e) { p.kind = e.target.value; scheduleSave(); });
      card.querySelector('input').addEventListener('input', function (e) { p.caption = e.target.value; scheduleSave(); });
      card.querySelector('.remove').addEventListener('click', function () {
        state.photos = state.photos.filter(function (x) { return x.id !== p.id; });
        renderPhotos(); save();
      });
      photoGrid.appendChild(card);
    });
  }
  document.getElementById('photo-camera').addEventListener('change', function (e) { handleFiles(e.target.files); e.target.value = ''; });
  document.getElementById('photo-gallery').addEventListener('change', function (e) { handleFiles(e.target.files); e.target.value = ''; });

  // ---------- signature pads ----------
  function makePad(canvas, key) {
    var ctx = canvas.getContext('2d');
    var drawing = false, hasInk = false, last = null;
    function fit() {
      var ratio = window.devicePixelRatio || 1;
      var rect = canvas.getBoundingClientRect();
      var snapshot = hasInk ? canvas.toDataURL() : null;
      canvas.width = Math.round(rect.width * ratio); canvas.height = Math.round(rect.height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
      if (snapshot) { var im = new Image(); im.onload = function () { ctx.drawImage(im, 0, 0, rect.width, rect.height); }; im.src = snapshot; }
    }
    function pos(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    canvas.addEventListener('pointerdown', function (e) { drawing = true; last = pos(e); canvas.setPointerCapture(e.pointerId); e.preventDefault(); });
    canvas.addEventListener('pointermove', function (e) {
      if (!drawing) { return; }
      var p = pos(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; hasInk = true; e.preventDefault();
    });
    function up() { if (drawing) { drawing = false; state.sigs[key] = hasInk ? canvas.toDataURL('image/png') : null; scheduleSave(); } }
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('pointerleave', up);
    window.addEventListener('resize', fit);
    fit();
    return {
      clear: function () { ctx.clearRect(0, 0, canvas.width, canvas.height); hasInk = false; state.sigs[key] = null; scheduleSave(); },
      load: function (dataUrl) {
        if (!dataUrl) { return; }
        var im = new Image(); im.onload = function () { var r = canvas.getBoundingClientRect(); ctx.drawImage(im, 0, 0, r.width, r.height); hasInk = true; }; im.src = dataUrl;
      },
      hasInk: function () { return hasInk; }
    };
  }
  var pads = { boc: makePad(document.getElementById('sig-boc'), 'boc'), us: makePad(document.getElementById('sig-us'), 'us') };
  Array.prototype.forEach.call(document.querySelectorAll('[data-clear]'), function (b) {
    b.addEventListener('click', function () { pads[b.getAttribute('data-clear') === 'sig-boc' ? 'boc' : 'us'].clear(); });
  });

  // ---------- autosave wiring ----------
  form.addEventListener('input', scheduleSave);
  form.addEventListener('change', scheduleSave);

  // ---------- load draft or start fresh ----------
  function todayIso() { var d = new Date(); return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()); }
  function startFresh() {
    state = { fields: {}, checks: [], tanks: [], photos: [], sigs: { boc: null, us: null } };
    form.reset();
    document.getElementById('date').value = todayIso();
    tankRows.innerHTML = ''; addTankRow();
    renderPhotos();
    pads.boc.clear(); pads.us.clear();
    savedPill.textContent = '';
  }
  kvGet(DRAFT_KEY).then(function (saved) {
    if (saved && saved.fields && (saved.fields.siteName || saved.photos.length || saved.tanks.length)) {
      state = saved;
      state.sigs = state.sigs || { boc: null, us: null };
      applyFields();
      tankRows.innerHTML = '';
      (state.tanks.length ? state.tanks : [null]).forEach(addTankRow);
      renderPhotos();
      pads.boc.load(state.sigs.boc); pads.us.load(state.sigs.us);
      savedPill.textContent = 'Draft restored';
      if (!document.getElementById('date').value) { document.getElementById('date').value = todayIso(); }
    } else {
      startFresh();
    }
  });

  document.getElementById('clear-form').addEventListener('click', function () {
    if (confirm('Start a new sheet? This clears everything on this page, including photos and signatures.')) {
      kvDel(DRAFT_KEY).then(startFresh);
      lastPdf = null; document.getElementById('share-pdf').hidden = true; setStatus('');
    }
  });

  // ---------- PDF ----------
  var lastPdf = null; // { blob, name }

  function loadLogo() {
    return new Promise(function (resolve) {
      var im = new Image();
      im.onload = function () { var c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0); try { resolve(c.toDataURL('image/png')); } catch (e) { resolve(null); } };
      im.onerror = function () { resolve(null); };
      im.src = 'img/logo.png';
    });
  }

  function validate() {
    var missing = [];
    ['jobRef', 'date', 'siteName', 'contactName', 'bocSigner', 'usSigner'].forEach(function (n) {
      var el = form.querySelector('[name="' + n + '"]');
      if (!el.value.trim()) { missing.push(el.previousElementSibling ? el.previousElementSibling.textContent.replace(' *', '') : n); }
    });
    if (!pads.boc.hasInk()) { missing.push('client signature'); }
    if (!pads.us.hasInk()) { missing.push('your signature'); }
    return missing;
  }

  function niceDate(iso) {
    if (!iso) { return ''; }
    var p = iso.split('-'); if (p.length !== 3) { return iso; }
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  function buildPdf() {
    collectFields();
    var f = state.fields;
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    var W = 210, H = 297, M = 14, CW = W - 2 * M, FOOT = 14;
    var y = M;

    function ensure(h) { if (y + h > H - FOOT - 4) { doc.addPage(); y = M; } }
    function heading(text) {
      ensure(28); y += 3; // keep the heading with at least a few lines of its section
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.setTextColor(17);
      doc.text(text, M, y + 5); y += 7.5;
      doc.setDrawColor(17); doc.setLineWidth(0.5); doc.line(M, y, W - M, y); y += 3.5;
    }
    function para(text, size, color) {
      size = size || 10; doc.setFont('helvetica', 'normal'); doc.setFontSize(size);
      if (Array.isArray(color)) { doc.setTextColor(color[0], color[1], color[2]); } else { doc.setTextColor(color || 17); }
      var lines = doc.splitTextToSize(String(text || ''), CW); var lh = size * 0.42;
      lines.forEach(function (ln) { ensure(lh); doc.text(ln, M, y + lh * 0.78); y += lh; });
      y += 1.5;
    }
    function kvTable(rows) {
      var kw = 58; doc.setFontSize(9.5);
      rows.forEach(function (r) {
        var val = String(r[1] == null || r[1] === '' ? '—' : r[1]);
        var lines = doc.splitTextToSize(val, CW - kw - 2);
        var h = Math.max(1, lines.length) * 4.3 + 2.4;
        ensure(h);
        doc.setFont('helvetica', 'bold'); doc.setTextColor(74, 74, 71); doc.text(r[0], M, y + 4.1);
        doc.setFont('helvetica', 'normal'); doc.setTextColor(17); doc.text(lines, M + kw, y + 4.1);
        doc.setDrawColor(220, 216, 207); doc.setLineWidth(0.2); doc.line(M, y + h, W - M, y + h);
        y += h;
      });
      y += 2;
    }
    function grid(headers, rows, widths) {
      doc.setFontSize(9);
      var pad = 1.6;
      function rowHeight(cells, bold) {
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        var maxLines = 1;
        cells.forEach(function (c, i) { maxLines = Math.max(maxLines, doc.splitTextToSize(String(c == null || c === '' ? '—' : c), widths[i] - pad * 2).length); });
        return maxLines * 3.9 + pad * 2;
      }
      function drawRow(cells, bold, fill) {
        var h = rowHeight(cells, bold);
        ensure(h);
        var x = M;
        if (fill) { doc.setFillColor(244, 242, 237); doc.rect(M, y, CW, h, 'F'); }
        doc.setDrawColor(200, 196, 187); doc.setLineWidth(0.2); doc.rect(M, y, CW, h);
        doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setTextColor(17);
        cells.forEach(function (c, i) {
          var lines = doc.splitTextToSize(String(c == null || c === '' ? '—' : c), widths[i] - pad * 2);
          doc.text(lines, x + pad, y + pad + 2.9);
          if (i < cells.length - 1) { doc.line(x + widths[i], y, x + widths[i], y + h); }
          x += widths[i];
        });
        y += h;
      }
      drawRow(headers, true, true);
      rows.forEach(function (r) { drawRow(r, false, false); });
      y += 3;
    }
    function checkRow(text, ticked) {
      doc.setFontSize(9.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(17);
      var lines = doc.splitTextToSize(text, CW - 8);
      var h = lines.length * 4.2 + 1.6;
      ensure(h);
      doc.setDrawColor(17); doc.setLineWidth(0.35); doc.rect(M + 0.5, y + 0.9, 3.4, 3.4);
      if (ticked) { doc.setLineWidth(0.6); doc.line(M + 1.2, y + 2.7, M + 2.2, y + 3.8); doc.line(M + 2.2, y + 3.8, M + 3.7, y + 1.5); }
      doc.text(lines, M + 6.5, y + 3.6);
      y += h;
    }

    return loadLogo().then(function (logo) {
      // Header band
      doc.setFillColor(17, 17, 17); doc.rect(0, 0, W, 26, 'F');
      if (logo) { doc.addImage(logo, 'PNG', W - M - 18, 4, 18, 18); }
      doc.setTextColor(244, 242, 237); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
      doc.text('Job completion and client sign-off', M, 12);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
      doc.text(COMPANY + ' · ' + COMPANY_LINE, M, 19);
      y = 34;

      doc.setTextColor(17); doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
      doc.text(f.siteName || 'Site', M, y); y += 7;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(74, 74, 71);
      doc.text([niceDate(f.date), 'Job ref ' + (f.jobRef || '—')].join('  ·  '), M, y); y += 6;

      heading('1. Job details');
      kvTable([
        ['Client', f.client], ['Site', f.siteName], ['Site address', f.siteAddress],
        ['Client contact on site', [f.contactName, f.contactRole].filter(Boolean).join(', ')],
        ['Purchase order / contract', f.poNumber], ['Permit to work', f.permitNo || 'None issued'],
        ['Operatives', f.operatives], ['Signed in / out', [f.timeIn, f.timeOut].filter(Boolean).join(' – ')],
        ['Weather', f.weather], ['Water purity at start', f.tds ? f.tds + ' ppm TDS' : '']
      ]);

      heading('2. Work carried out');
      var allChecks = Array.prototype.map.call(form.querySelectorAll('input[name="chk"]'), function (c) { return c.value; });
      allChecks.forEach(function (t) { checkRow(t, state.checks.indexOf(t) !== -1); });
      y += 2;

      heading('3. Tanks and areas cleaned');
      if (state.tanks.length) {
        grid(['Tank / area', 'Gas', 'Faces', 'Result', 'Notes'], state.tanks.map(function (t) { return [t.ref, t.gas, t.faces, t.result, t.notes]; }), [30, 30, 28, 36, CW - 124]);
      } else { para('No tanks recorded.'); }

      heading('4. Not completed');
      para(f.exceptions || 'Nothing outstanding. All listed tanks and areas completed.');

      heading('5. Observations reported to the client');
      para(f.observations || 'None.');

      if (state.photos.length) {
        heading('6. Photos');
        var colW = (CW - 6) / 2, maxH = 78;
        for (var i = 0; i < state.photos.length; i += 2) {
          var pair = state.photos.slice(i, i + 2);
          var hs = pair.map(function (p) { return Math.min(maxH, colW * p.h / p.w); });
          var rowH = Math.max.apply(null, hs) + 9;
          ensure(rowH);
          pair.forEach(function (p, j) {
            var x = M + j * (colW + 6);
            var hh = hs[j];
            var ww = Math.min(colW, hh * p.w / p.h);
            doc.addImage(p.dataUrl, 'JPEG', x + (colW - ww) / 2, y, ww, hh, undefined, 'FAST');
            doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(17);
            var cap = p.kind + (p.caption ? ': ' + p.caption : '');
            doc.text(doc.splitTextToSize(cap, colW)[0], x, y + hs[j] + 4);
          });
          y += rowH;
        }
      }

      heading((state.photos.length ? '7' : '6') + '. Client acceptance');
      para('Agreed standard: external surfaces of the listed tanks and areas free of algae, grime and loose dirt, with no water directed at vents, valves, instruments or electrical equipment. The client contact inspected the work with the operative before signing.', 9.5, [74, 74, 71]);
      var ACCEPT = ['Accepted: work completed to the agreed standard', 'Accepted with snags listed below, to be completed on a return visit', 'Not accepted, see comments'];
      ACCEPT.forEach(function (a) { checkRow(a, f.acceptance === a); });
      y += 1;
      kvTable([['Snags / client comments', f.snags || 'None'], ['Return visit', f.returnVisit || 'Not needed']]);

      heading((state.photos.length ? '8' : '7') + '. Signatures');
      ensure(48);
      var sw = (CW - 10) / 2;
      [['Client representative', f.bocSigner, f.bocSignerRole, state.sigs.boc], ['For ' + COMPANY, f.usSigner, f.usSignerRole, state.sigs.us]].forEach(function (s, j) {
        var x = M + j * (sw + 10);
        doc.setDrawColor(200, 196, 187); doc.setLineWidth(0.3); doc.rect(x, y, sw, 30);
        if (s[3]) { doc.addImage(s[3], 'PNG', x + 2, y + 1.5, sw - 4, 27, undefined, 'FAST'); }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(17);
        doc.text(s[0], x, y + 35.5);
        doc.setFont('helvetica', 'normal'); doc.setTextColor(74, 74, 71);
        doc.text([s[1], s[2]].filter(Boolean).join(', ') + '  ·  ' + niceDate(f.date), x, y + 40.5);
      });
      y += 46;

      // Footer on every page
      var n = doc.getNumberOfPages();
      for (var p = 1; p <= n; p++) {
        doc.setPage(p);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120, 118, 112);
        doc.text(COMPANY + ' · Job completion record · ' + (f.jobRef || '') + ' · ' + (f.siteName || ''), M, H - 7);
        doc.text('Page ' + p + ' of ' + n, W - M, H - 7, { align: 'right' });
      }
      doc.setProperties({ title: 'Job completion record ' + (f.jobRef || ''), subject: f.siteName || '', author: COMPANY });

      var safeSite = (f.siteName || 'site').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
      var name = 'NECC-sign-off-' + safeSite + '-' + (f.date || todayIso()) + '.pdf';
      return { blob: doc.output('blob'), name: name };
    });
  }

  var shareBtn = document.getElementById('share-pdf');
  document.getElementById('make-pdf').addEventListener('click', function () {
    var missing = validate();
    if (missing.length) { setStatus('Still needed before the PDF: ' + missing.join(', ') + '.'); return; }
    setStatus('Building the PDF…');
    buildPdf().then(function (pdf) {
      lastPdf = pdf;
      var url = URL.createObjectURL(pdf.blob);
      var a = document.createElement('a'); a.href = url; a.download = pdf.name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      var file = new File([pdf.blob], pdf.name, { type: 'application/pdf' });
      var canShare = navigator.canShare && navigator.canShare({ files: [file] });
      shareBtn.hidden = !canShare;
      setStatus('PDF created: ' + pdf.name + (canShare ? '. Use Share PDF to send it to the client by email or WhatsApp.' : '. It has been downloaded to this device.'));
    }).catch(function (e) { setStatus('The PDF could not be built: ' + (e && e.message ? e.message : e)); });
  });
  shareBtn.addEventListener('click', function () {
    if (!lastPdf) { return; }
    var file = new File([lastPdf.blob], lastPdf.name, { type: 'application/pdf' });
    navigator.share({ files: [file], title: 'Job completion record', text: 'Job completion and sign-off record from ' + COMPANY }).catch(function () {});
  });
})();
