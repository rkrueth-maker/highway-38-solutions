/* H38 Quick Calc — UI logic. Core math lives in calc.js (validated), data in data.js. */
(function () {
  'use strict';
  const QC = window.QC;
  const D = (typeof QC_DATA !== 'undefined') ? QC_DATA : window.QC_DATA;  // data.js declares a script-scope const
  const $ = (id) => document.getElementById(id);
  const num = (id) => { const v = parseFloat($(id).value); return isNaN(v) ? null : v; };
  const fmt = (x, d = 4) => {
    if (x == null || !isFinite(x)) return '—';
    let s = Number(x).toFixed(d);
    if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const results = (el, pairs) => {
    el.innerHTML = pairs.map(([k, v, plain]) =>
      `<div class="result"><div class="k">${esc(k)}</div><div class="v${plain ? ' plain' : ''}">${v}</div></div>`).join('');
  };
  const on = (id, ev, fn) => { const e = $(id); if (e) e.addEventListener(ev, fn); };
  const onAll = (ids, fn) => ids.forEach((id) => { on(id, 'input', fn); on(id, 'change', fn); });

  /* ---------------- My Shop store (on-device only) ---------------- */
  const KEY = 'h38-quickcalc-myshop-v1';
  const DEFAULTS = {
    settings: { endAllow: 4, perPart: 0.25, scrap: 1.05, sheetLen: 120,
                densitySteel: 0.284, densityStainless: 0.29, densityAluminum: 0.10 },
    stacks: [], calcs: []
  };
  let store;
  try { store = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || '{}'));
    store.settings = Object.assign({}, DEFAULTS.settings, store.settings || {});
    store.stacks = store.stacks || []; store.calcs = store.calcs || [];
  } catch (e) { store = JSON.parse(JSON.stringify(DEFAULTS)); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} };
  const densities = () => ({ steel: store.settings.densitySteel, stainless: store.settings.densityStainless, aluminum: store.settings.densityAluminum });

  /* ---------------- navigation ---------------- */
  function go(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'scr-' + id));
    document.querySelectorAll('#chipnav button').forEach((b) => b.classList.toggle('on', b.dataset.go === id));
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
  function seg(id, fn) {
    const box = $(id); if (!box) return;
    box.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      box.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on'); fn(b.dataset.m);
    }));
  }

  /* ---------------- Speeds & Feeds ---------------- */
  function calcMill() {
    const sfm = num('fm-sfm'), dia = num('fm-dia'), teeth = num('fm-teeth'), ipt = num('fm-ipt');
    const doc = num('fm-doc'), woc = num('fm-woc');
    if (!(sfm > 0 && dia > 0 && teeth > 0 && ipt > 0)) { $('fm-out').innerHTML = ''; return; }
    const rpm = QC.rpmFromSfm(sfm, dia), ipm = QC.millIpm(rpm, ipt, teeth);
    const pairs = [['RPM', fmt(rpm, 0)], ['Feed (IPM)', fmt(ipm, 2)], ['Feed per rev', fmt(QC.millIpr(ipm, rpm)) + ' <small>IPR</small>']];
    if (doc > 0 && woc > 0) pairs.push(['Removal rate', fmt(QC.millMrr(rpm, doc, woc, ipt, teeth), 2) + ' <small>in³/min</small>']);
    results($('fm-out'), pairs);
  }
  function calcMillFinish() {
    const ipr = num('fmf-ipr'), nose = num('fmf-nose');
    if (!(ipr > 0 && nose > 0)) { $('fmf-out').innerHTML = ''; return; }
    results($('fmf-out'), [
      ['Theoretical finish (Rt)', fmt(QC.surfaceRt(ipr, nose), 0) + ' <small>µin</small>'],
      ['≈ Ra (Rt ÷ 4, approx)', fmt(QC.surfaceRa(ipr, nose), 0) + ' <small>µin</small>'],
    ]);
  }
  function calcLathe() {
    const sfm = num('fl-sfm'), dia = num('fl-dia'), ipr = num('fl-ipr'), doc = num('fl-doc'), nose = num('fl-nose');
    if (!(sfm > 0 && dia > 0)) { $('fl-out').innerHTML = ''; return; }
    const rpm = QC.rpmFromSfm(sfm, dia);
    const pairs = [['RPM', fmt(rpm, 0)]];
    if (ipr > 0) {
      pairs.push(['Feed (IPM)', fmt(QC.latheIpm(rpm, ipr), 2)]);
      if (doc > 0) pairs.push(['Removal rate', fmt(QC.latheMrr(sfm, doc, ipr), 2) + ' <small>in³/min</small>']);
      if (nose > 0) pairs.push(['Theoretical finish (Rt)', fmt(QC.surfaceRt(ipr, nose), 0) + ' <small>µin</small>'],
        ['≈ Ra (Rt ÷ 4, approx)', fmt(QC.surfaceRa(ipr, nose), 0) + ' <small>µin</small>']);
    }
    results($('fl-out'), pairs);
  }
  function calcLathePlan() {
    const rt = num('fl-ra'), nose = num('fl-nose'), ipr = num('fl-ipr');
    if (!(rt > 0)) { $('fl-ra-out').innerHTML = ''; return; }
    const pairs = [];
    if (nose > 0) pairs.push(['Feed for target Rt (nose above)', fmt(QC.iprForRt(rt, nose)) + ' <small>IPR</small>']);
    if (ipr > 0) pairs.push(['Nose radius needed at current feed', fmt(QC.noseRForRt(rt, ipr)) + ' <small>in</small>']);
    results($('fl-ra-out'), pairs);
  }
  function calcLife() {
    const sfm = num('fl-life-sfm'), mins = parseFloat($('fl-life-min').value), ppi = num('fl-ppi');
    const pairs = [];
    const adj = QC.sfmForLife(sfm, mins);
    if (sfm > 0 && adj != null) pairs.push([`SFM for ${mins}-min life`, fmt(adj, 0)]);
    if (ppi > 0) pairs.push(['Parts per insert @15 min', fmt(QC.partsPerInsert(ppi), 0)]);
    results($('fl-life-out'), pairs);
  }
  seg('fm-mode', (m) => { $('fm-mill').style.display = m === 'mill' ? '' : 'none'; $('fm-lathe').style.display = m === 'lathe' ? '' : 'none'; });
  $('fl-life-min').innerHTML = QC.SFM_LIVES.map((m) => `<option value="${m}"${m === 15 ? ' selected' : ''}>${m} min (×${fmt(QC.sfmLifeFactor(m), 3)})</option>`).join('');
  onAll(['fm-sfm', 'fm-dia', 'fm-teeth', 'fm-ipt', 'fm-doc', 'fm-woc'], calcMill);
  onAll(['fmf-ipr', 'fmf-nose'], calcMillFinish);
  onAll(['fl-sfm', 'fl-dia', 'fl-ipr', 'fl-doc', 'fl-nose'], () => { calcLathe(); calcLathePlan(); });
  onAll(['fl-ra'], calcLathePlan);
  onAll(['fl-life-sfm', 'fl-ppi'], calcLife); on('fl-life-min', 'change', calcLife);

  /* ---------------- Drill & Tap ---------------- */
  const drillRow = (r, hl) => `<tr${hl ? ' class="hl"' : ''}><td>${esc(r.size || '')}</td><td>${fmt(r.dec)}</td><td>${fmt(r.mm, 3)}</td><td>${esc(r.tap || '')}</td></tr>`;
  function renderChart(filter) {
    const f = (filter || '').trim().toLowerCase();
    let rows = D.drills;
    if (f) rows = rows.filter((r) =>
      (r.size && r.size.toLowerCase().includes(f)) || (r.tap && r.tap.toLowerCase().includes(f)) ||
      Math.abs(r.dec - parseFloat(f)) < 0.002);
    $('dt-tbody').innerHTML = rows.slice(0, 300).map((r) => drillRow(r)).join('') ||
      '<tr><td colspan="4">No match — try a decimal like 0.201</td></tr>';
  }
  on('dt-search', 'input', () => renderChart($('dt-search').value));
  function nearestDrill(dec) {
    let best = null, bd = 1e9;
    for (const r of D.drills) { const d = Math.abs(r.dec - dec); if (d < bd) { bd = d; best = r; } }
    return best;
  }
  seg('dt-mode', (m) => {
    for (const k of ['chart', 'tap', 'thread', 'wire', 'npt', 'nptdim', 'pitch']) $('dt-' + k).style.display = m === k ? '' : 'none';
  });
  let tdKind = 'numbered';
  seg('td-kind', (m) => { tdKind = m;
    for (const k of ['numbered', 'inch', 'metric']) $('td-f-' + k).style.display = m === k ? '' : 'none';
    calcTapDrill();
  });
  function calcTapDrill() {
    let r = null;
    if (tdKind === 'numbered') { const n = num('td-num'), t = num('td-num-tpi'); if (n != null && t > 0) r = QC.tapDrillNumbered(n, t); }
    if (tdKind === 'inch') { const d = num('td-dia'), t = num('td-inch-tpi'); if (d > 0 && t > 0) r = QC.tapDrillInch(d, t); }
    if (tdKind === 'metric') { const d = num('td-diamm'), p = num('td-pitch'); if (d > 0 && p > 0) r = QC.tapDrillMetric(d, p); }
    if (!r) { $('td-out').innerHTML = ''; return; }
    const nd = nearestDrill(r.cut);
    results($('td-out'), [
      ['Major diameter', fmt(r.major) + ' <small>in</small>'],
      ['Cut tap drill', fmt(r.cut) + ' <small>in</small>'],
      ['Form tap drill', fmt(r.form) + ' <small>in</small>'],
      ['Countersink dia', fmt(r.csink) + ' <small>in</small>'],
      ['Nearest drill (cut)', nd ? `${esc(nd.size || fmt(nd.dec))} <small>(${fmt(nd.dec)})</small>` : '—', true],
    ]);
  }
  onAll(['td-num', 'td-num-tpi', 'td-dia', 'td-inch-tpi', 'td-diamm', 'td-pitch'], calcTapDrill);
  /* Thread data */
  let thKind = 'un';
  seg('th-kind', (m) => { thKind = m;
    $('th-dia-label').textContent = m === 'un' ? 'Major diameter (in)' : 'Major diameter (mm)';
    $('th-pitch-label').textContent = m === 'un' ? 'Threads per inch' : 'Pitch (mm)';
    calcThreadData();
  });
  on('th-pct', 'input', () => { $('th-pct-label').textContent = $('th-pct').value + '%'; calcThreadData(); });
  function calcThreadData() {
    let dia = num('th-dia'), pitch;
    if (thKind === 'un') { const tpi = num('th-tpi'); if (!(dia > 0 && tpi > 0)) return; pitch = 1 / tpi; }
    else { pitch = num('th-tpi'); if (!(dia > 0 && pitch > 0)) return; }
    const u = thKind === 'un' ? 'in' : 'mm';
    const td = QC.threadData(dia, pitch), pct = parseFloat($('th-pct').value);
    const drill = QC.tapDrillForPct(dia, pitch, pct);
    const pairs = [
      ['Pitch', fmt(pitch) + ` <small>${u}</small>`],
      ['Pitch diameter (basic)', fmt(td.pitchDia) + ` <small>${u}</small>`],
      ['Minor — internal (basic)', fmt(td.minorInt) + ` <small>${u}</small>`],
      ['Minor — external (basic)', fmt(td.minorExt) + ` <small>${u}</small>`],
      [`Tap drill @ ${pct}%`, fmt(drill) + ` <small>${u}</small>`],
    ];
    if (thKind === 'un') { const nd = nearestDrill(drill); if (nd) pairs.push(['Nearest chart drill', `${esc(nd.size || fmt(nd.dec))} <small>(${fmt(nd.dec)}, ${fmt(QC.pctForDrill(dia, pitch, nd.dec), 0)}%)</small>`, true]); }
    else pairs.push(['Full-pitch drill (D − P)', fmt(td.tapDrillFull) + ' <small>mm</small>']);
    results($('th-out'), pairs);
  }
  onAll(['th-dia', 'th-tpi'], calcThreadData);
  /* 3-wire */
  function calcWire() {
    let pitch = num('tw-pitch'); const tpi = num('tw-tpi');
    if (!(pitch > 0)) pitch = tpi > 0 ? 1 / tpi : null;
    const w = num('tw-wire'), pd = num('tw-pd'), mow = num('tw-mow');
    if (!(pitch > 0 && w > 0)) { $('tw-out').innerHTML = ''; return; }
    const tw = QC.threeWire(pitch, w);
    const pairs = [['Best wire for this pitch', fmt(tw.bestWire) + ' <small>in</small>']];
    if (pd > 0) pairs.push(['Measure over wires @ PD', fmt(tw.mowFromPd(pd)) + ' <small>in</small>']);
    if (mow > 0) pairs.push(['PD from your measurement', fmt(tw.pdFromMow(mow)) + ' <small>in</small>']);
    results($('tw-out'), pairs);
  }
  onAll(['tw-tpi', 'tw-pitch', 'tw-wire', 'tw-pd', 'tw-mow'], calcWire);

  /* ---------------- Weights ---------------- */
  $('w-gauge').innerHTML = '<option value="">— thickness above —</option>' +
    D.gaugeWeights.steel.map((g, i) => `<option value="${i}">${g.t} in — ${g.w} lb per 4×10 sheet</option>`).join('');
  function calcSheet() {
    const mat = $('w-mat').value;
    let t = num('w-t');
    const gi = $('w-gauge').value;
    if (gi !== '' && mat === 'steel') { t = D.gaugeWeights.steel[+gi].t; }
    const L = num('w-l'), W = num('w-w');
    if (!(L > 0 && W > 0 && t > 0)) { $('w-sheet-out').innerHTML = ''; return null; }
    const wgt = QC.sheetWeight(L, W, t, mat, densities());
    results($('w-sheet-out'), [['Sheet weight', fmt(wgt, 2) + ' <small>lb</small>'],
      ['Per square foot', fmt(wgt / (L * W / 144), 3) + ' <small>lb</small>']]);
    return wgt;
  }
  function calcRound() {
    const mat = $('w-mat').value, d = num('w-rd'), L = num('w-rl');
    if (!(d > 0 && L > 0)) { $('w-round-out').innerHTML = ''; return null; }
    const wgt = QC.roundWeight(d, L, mat);
    results($('w-round-out'), [['Bar weight', fmt(wgt, 2) + ' <small>lb</small>'],
      ['Per foot', fmt(wgt / (L / 12), 3) + ' <small>lb/ft</small>']]);
    return wgt;
  }
  function calcBar() {
    const ft = num('w-bar-ft'), part = num('w-part'), kerf = num('w-kerf') || 0;
    const full = calcRoundSilent();
    if (!(ft > 0 && part > 0) || full == null) { $('w-bar-out').innerHTML = ''; return; }
    const barW = full.perFoot * ft;
    const y = QC.barYield(ft, part + (store.settings.perPart || 0), barW, store.settings.endAllow, kerf, store.settings.scrap);
    results($('w-bar-out'), [['Parts per bar', fmt(y.partsPerBar, 0)], ['Weight per 1,000 parts', fmt(y.weightPer1000, 0) + ' <small>lb</small>']]);
  }
  function calcRoundSilent() {
    const mat = $('w-mat').value, d = num('w-rd');
    if (!(d > 0)) return null;
    return { perFoot: d * d * QC.ROUND_F[mat] };
  }
  function calcTub() {
    const ft = num('w-tub-ft'), part = num('w-tub-part');
    if (!(ft > 0 && part > 0)) { $('w-tub-out').innerHTML = ''; return; }
    const y = QC.tubingYield(ft, part + (store.settings.perPart || 0), store.settings.endAllow, 0, store.settings.scrap);
    results($('w-tub-out'), [['Parts per length', fmt(y.partsPerBar, 0)], ['Feet per 1,000 parts', fmt(y.feetPer1000, 0) + ' <small>ft</small>']]);
  }
  function calcYield() {
    const sheetW = calcSheetSilent(), parts = num('w-laser-parts'), bw = num('w-bl-width'), per = num('w-bl-per');
    const pairs = [];
    if (sheetW != null && parts > 0) pairs.push(['Laser: weight per 1,000', fmt(QC.laserYield(sheetW, parts, store.settings.scrap), 0) + ' <small>lb</small>']);
    if (sheetW != null && bw > 0 && per > 0) {
      const b = QC.blankingYield(bw, per, sheetW, store.settings.sheetLen);
      pairs.push(['Blanking drops per sheet', fmt(b.drops, 0)], ['Blanking: weight per 1,000', fmt(b.weightPer1000, 0) + ' <small>lb</small>']);
    }
    results($('w-yield-out'), pairs);
  }
  function calcSheetSilent() {
    const mat = $('w-mat').value; let t = num('w-t');
    const gi = $('w-gauge').value;
    if (gi !== '' && mat === 'steel') t = D.gaugeWeights.steel[+gi].t;
    const L = num('w-l'), W = num('w-w');
    return (L > 0 && W > 0 && t > 0) ? QC.sheetWeight(L, W, t, mat, densities()) : null;
  }
  const wAll = () => { calcSheet(); calcRound(); calcBar(); calcTub(); calcYield(); };
  onAll(['w-l', 'w-w', 'w-t', 'w-rd', 'w-rl', 'w-bar-ft', 'w-part', 'w-kerf', 'w-tub-ft', 'w-tub-part', 'w-laser-parts', 'w-bl-width', 'w-bl-per'], wAll);
  on('w-mat', 'change', wAll); on('w-gauge', 'change', wAll);

  /* ---------------- Convert ---------------- */
  function calcFrac() {
    const raw = $('cv-frac').value, v = QC.parseFraction(raw);
    if (!(v > 0)) { $('cv-frac-out').innerHTML = ''; return; }
    const nd = nearestDrill(v);
    results($('cv-frac-out'), [
      ['Decimal', fmt(v, 5) + ' <small>in</small>'],
      ['Millimeters', fmt(v * 25.4, 3) + ' <small>mm</small>'],
      ['Nearest 64th', QC.toFraction(v, 64).text + ' <small>in</small>', true],
      ['Nearest drill', nd ? `${esc(nd.size || fmt(nd.dec))} <small>(${fmt(nd.dec)})</small>` : '—', true],
    ]);
  }
  on('cv-frac', 'input', calcFrac);
  function calcConv() {
    const v = num('cv-val'), kind = $('cv-kind').value;
    if (v == null || !QC.CONV[kind]) { $('cv-out').innerHTML = ''; return; }
    results($('cv-out'), [['Result', fmt(QC.CONV[kind](v), 4), true]]);
  }
  onAll(['cv-val'], calcConv); on('cv-kind', 'change', calcConv);
  function calcHard(from) {
    if (from === 'hrc') { const h = num('cv-hrc'); if (h > 0) { const b = QC.rockwellCToBrinell(h);
      results($('cv-hard-out'),
      [['Brinell (HBW) from HRC ' + fmt(h, 1), b == null ? 'outside E140 range' : fmt(b, 0) + ' <small>HBW</small>']]); } }
    else { const b = num('cv-bhn'); if (b > 0) { const h = QC.brinellToRockwellC(b);
      results($('cv-hard-out'), [['Rockwell C from HBW ' + fmt(b, 0), h == null ? 'outside E140 range' : fmt(h, 1) + ' <small>HRC</small>']]); } }
  }
  on('cv-hrc', 'input', () => calcHard('hrc')); on('cv-bhn', 'input', () => calcHard('bhn'));

  /* ---------------- Threading ---------------- */
  let trForm = 'un60';
  function trLookup() {
    const tpi = num('tr-tpi'), dia = num('tr-dia'), key = String(tpi);
    let passes = null, ext = null, int = null, note = '';
    if (trForm === 'un60') {
      if (tpi > 0) { const d = QC.threadDepth60(tpi); ext = d.ext; int = d.int; passes = QC.passes60(tpi); }
      note = 'Depths are the standard UN design depths — external 0.6134 × pitch, internal 0.5413 × pitch (ASME B1.1). Pass count from the workbook rule.';
    } else if (trForm === 'acme') {
      const d = D.acmeDepthByIndex[key];
      if (d && typeof d.ext === 'number') { ext = d.ext; int = d.int; }
      if (D.acmePasses[key]) passes = D.acmePasses[key];
      note = 'Acme depths ≈ 0.5 × pitch + 0.010 from the workbook chart (16 TPI pass count fixed from the chart — the workbook lookup dropped it).';
    } else if (trForm === 'stub') {
      const d = D.stubAcme[key];
      if (d && tpi > 0) { const sd = QC.stubAcmeDepth(tpi); ext = sd.ext; int = sd.int; passes = d.passes; }
      note = 'Stub Acme depth = the standard basic thread height, 0.3 × pitch, external and internal (ASME B1.8). Pass counts from the workbook chart.';
    } else if (trForm === 'npt') {
      const d = D.npt[key];
      if (d) { passes = d.passes; ext = d.depth; int = d.depth; }
      note = 'NPT covers the workbook\'s five sizes (8, 11½, 14, 18, 27 TPI); depth = 0.8 × pitch.';
    }
    return { tpi, dia, passes, ext, int, note };
  }
  function calcThreading() {
    const r = trLookup();
    const pairs = [];
    if (r.tpi > 0 && r.dia > 0) pairs.push(['Helix angle', fmt(QC.helixDeg(r.tpi, r.dia), 3) + ' <small>°</small>']);
    if (r.passes != null) pairs.push(['Passes', fmt(r.passes, 0)]);
    if (r.ext != null) pairs.push(['External depth', fmt(r.ext) + ' <small>in</small>']);
    if (r.int != null) pairs.push(['Internal depth', fmt(r.int) + ' <small>in</small>']);
    if (!pairs.length) pairs.push(['—', 'No chart entry for that TPI', true]);
    results($('tr-out'), pairs);
    $('tr-note').textContent = r.note;
    if (r.ext != null) $('tr-depth').value = fmt(r.ext);
    if (r.passes != null) $('tr-passes').value = r.passes;
    calcSchedule();
  }
  function calcSchedule() {
    const depth = num('tr-depth'), n = num('tr-passes');
    if (!(depth > 0 && n >= 1)) { $('tr-sched').innerHTML = ''; return; }
    const s = QC.infeedSchedule(depth, Math.floor(n));
    $('tr-sched').innerHTML = s.infeeds.map((v, i) =>
      `<tr><td>${i + 1}</td><td>${fmt(v)}</td><td>${fmt(s.cumulative[i])}</td></tr>`).join('');
  }
  seg('tr-form', (m) => { trForm = m; calcThreading(); });
  onAll(['tr-tpi', 'tr-dia'], calcThreading);
  onAll(['tr-depth', 'tr-passes'], calcSchedule);

  /* ---------------- Chip thinning ---------------- */
  function calcChip() {
    const clpt = num('ch-clpt'), rdoc = num('ch-rdoc'), dia = num('ch-dia');
    if (!(clpt > 0 && rdoc > 0 && dia > 0)) { $('ch-out').innerHTML = ''; return; }
    const r = QC.chipThin(clpt, rdoc, dia);
    results($('ch-out'), [
      ['RDOC ÷ dia', fmt(r.ratio, 3), true],
      ['Actual chip at programmed load', fmt(r.actual) + ' <small>IPT</small>'],
      ['Program this to hit target chip', fmt(r.adjusted) + ' <small>IPT</small>'],
    ]);
    document.querySelectorAll('#ch-tbody tr').forEach((tr) => {
      const v = parseFloat(tr.dataset.ratio);
      tr.classList.toggle('hl', Math.abs(v - r.ratio) < 0.026);
    });
  }
  $('ch-tbody').innerHTML = QC.CHIP_TABLE.map((row) =>
    `<tr data-ratio="${row[0]}"><td>${row[0]}</td><td>${row[1]}</td><td>${row[2]}</td></tr>`).join('');
  onAll(['ch-clpt', 'ch-rdoc', 'ch-dia'], calcChip);

  /* ---------------- Ball nose ---------------- */
  let bMode = 'tip';
  seg('b-mode', (m) => { bMode = m; calcBall(); });
  function calcBall() {
    const dia = num('b-dia'), depth = num('b-depth'), vc = num('b-vc'), feed = num('b-feed'),
          ze = num('b-effteeth'), maxrpm = num('b-maxrpm');
    if (!(dia > 0 && depth > 0 && vc > 0 && feed > 0 && ze > 0 && maxrpm > 0)) { $('b-out').innerHTML = ''; return; }
    const o = QC.ballNose({ dia, teeth: ze, effTeeth: ze, maxRpm: maxrpm, vc, depth, feedTooth: feed, mode: bMode });
    const pairs = [
      ['Effective diameter', fmt(o.De, 3) + ' <small>in</small>'],
      ['RPM (capped at max)', fmt(o.rpm, 0)],
      ['Feed rate', fmt(o.feedRate, 1) + ' <small>IPM</small>'],
      ['Removal rate', fmt(o.mrr, 3) + ' <small>in³/min</small>'],
    ];
    if (o.feedAdjusted != null) pairs.push(['Feed adjusted (off-tip)', fmt(o.feedAdjusted, 1) + ' <small>IPM</small>'],
      ['Chip/tooth adjusted', fmt(o.feedToothAdjusted) + ' <small>in</small>']);
    results($('b-out'), pairs);
    calcScallop();
  }
  function calcScallop() {
    const dia = num('b-dia'), sh = num('b-sh'), so = num('b-so');
    const pairs = [];
    if (dia > 0 && sh > 0) pairs.push(['Stepover for scallop', fmt(QC.scallopStepover(dia, sh)) + ' <small>in</small>']);
    if (dia > 0 && so > 0) pairs.push(['Scallop from stepover', fmt(QC.scallopHeight(dia, so)) + ' <small>in</small>']);
    results($('b-sc-out'), pairs);
  }
  onAll(['b-dia', 'b-depth', 'b-vc', 'b-feed', 'b-effteeth', 'b-maxrpm'], calcBall);
  onAll(['b-sh', 'b-so'], calcScallop);

  /* ---------------- Geometry ---------------- */
  function calcTri() {
    const get = (id) => { const v = $(id).value.trim(); return v === '' ? undefined : parseFloat(v); };
    const k = { a: get('g-a'), b: get('g-b'), c: get('g-c'), A: get('g-A'), B: get('g-B2') };
    const known = Object.values(k).filter((v) => v != null && isFinite(v)).length;
    if (known < 2) { $('g-tri-out').innerHTML = ''; return; }
    let r = null; try { r = QC.rightTriangle(k); } catch (e) {}
    if (!r) { $('g-tri-out').innerHTML = '<div class="err">Can\'t solve — check the two values (e.g. side must be shorter than hypotenuse).</div>'; return; }
    results($('g-tri-out'), [
      ['Side a', fmt(r.a), true], ['Side b', fmt(r.b), true], ['Hypotenuse c', fmt(r.c), true],
      ['Angle A', fmt(r.A, 2) + ' <small>°</small>', true], ['Angle B', fmt(r.B, 2) + ' <small>°</small>', true],
    ]);
  }
  onAll(['g-a', 'g-b', 'g-c', 'g-A', 'g-B2'], calcTri);
  function calcBolt() {
    const dia = num('g-bc-dia'), n = num('g-bc-n'), st = num('g-bc-start') || 0;
    if (!(dia > 0 && n >= 2)) { $('g-bc-out').innerHTML = ''; return; }
    $('g-bc-out').innerHTML = QC.boltCircle(dia, Math.floor(n), st).map((h) =>
      `<tr><td>${h.hole}</td><td>${fmt(h.angle, 2)}</td><td>${fmt(h.x)}</td><td>${fmt(h.y)}</td></tr>`).join('');
  }
  onAll(['g-bc-dia', 'g-bc-n', 'g-bc-start'], calcBolt);
  function calcSine() {
    const L = num('g-sine-l'), ang = num('g-sine-ang'), h = num('g-sine-h');
    if (!(L > 0)) { $('g-sine-out').innerHTML = ''; return; }
    const pairs = [];
    if (ang > 0) pairs.push(['Stack height for angle', fmt(QC.sineStack(L, ang)) + ' <small>in</small>']);
    if (h > 0 && h < L) pairs.push(['Angle from stack', fmt(QC.sineAngle(L, h), 3) + ' <small>°</small>']);
    results($('g-sine-out'), pairs);
  }
  onAll(['g-sine-l', 'g-sine-ang', 'g-sine-h'], calcSine);
  function calcPoint() {
    const d = num('g-pt-dia'), ang = num('g-pt-ang'), f = num('g-cf-from'), t = num('g-cf-to'), ca = num('g-cf-ang');
    const pairs = [];
    if (d > 0 && ang > 0) pairs.push(['Drill point depth', fmt(QC.drillPointDepth(d, ang)) + ' <small>in</small>']);
    if (f > 0 && t > f && ca > 0) pairs.push(['Chamfer / c\'sink depth', fmt(QC.chamferDepth(f, t, ca)) + ' <small>in</small>']);
    results($('g-pt-out'), pairs);
  }
  onAll(['g-pt-dia', 'g-pt-ang', 'g-cf-from', 'g-cf-to', 'g-cf-ang'], calcPoint);

  /* ---------------- Press ---------------- */
  function calcPress() {
    const L = num('p-len'), t = num('p-thk'), tensile = num('p-tensile'), strip = num('p-strip') || 0;
    if (!(L > 0 && t > 0 && tensile > 0)) { $('p-out').innerHTML = ''; return; }
    const shear = tensile * QC.SHEAR_PCT_OF_TENSILE[$('p-mat').value];
    const r = QC.pressForce(L, t, shear, strip);
    results($('p-out'), [
      ['Shear strength used', fmt(shear, 0) + ' <small>MPa</small>', true],
      ['Cutting force', fmt(r.forceKn, 1) + ' <small>kN</small>'],
      ['Cutting tonnage', fmt(r.cuttingTons, 2) + ' <small>US tons</small>'],
      ['Stripping', fmt(r.strippingTons, 2) + ' <small>tons</small>'],
      ['Ejection (in cutting)', fmt(r.ejectionTons, 2) + ' <small>tons</small>'],
      ['Press size needed (cut + strip)', fmt(r.totalTons, 2) + ' <small>US tons</small>'],
    ]);
  }
  onAll(['p-len', 'p-thk', 'p-tensile', 'p-strip'], calcPress); on('p-mat', 'change', calcPress);
  function calcSpring() {
    const t = num('p-spring-t'), m = num('p-spring-mult');
    if (!(t > 0 && m > 0)) { $('p-spring-out').innerHTML = ''; return; }
    results($('p-spring-out'), [['Spring deflection Y', fmt(QC.springDeflection(t, m), 2) + ' <small>mm</small>']]);
  }
  onAll(['p-spring-t', 'p-spring-mult'], calcSpring);

  /* ---------------- Reference ---------------- */
  const reamLabel = (r) => `${r.material} — ${r.tool} (chip class ${r.chipClass}, hardness ${r.hardness})`;
  $('rf-ream-mat').innerHTML = D.reams.map((r, i) => `<option value="${i}">${esc(reamLabel(r))}</option>`).join('');
  function calcReam() {
    const r = D.reams[+$('rf-ream-mat').value || 0];
    if (!r) { $('rf-ream-out').innerHTML = ''; return; }
    const dias = Object.keys(r.feeds);
    $('rf-ream-out').innerHTML =
      `<p class="note">SFM — general purpose: <b>${esc(r.sfmGP)}</b> · carbide: <b>${esc(r.sfmCF)}</b>. Examples: ${esc(r.examples || '')}</p>
       <div class="scrollbox"><table class="data"><thead><tr><th>Drill dia</th><th>Feed GP (IPR)</th><th>Feed carbide (IPR)</th></tr></thead>
       <tbody>${dias.map((d) => `<tr><td>${d}</td><td>${r.feeds[d].gp}</td><td>${r.feeds[d].cf}</td></tr>`).join('')}</tbody></table></div>`;
  }
  on('rf-ream-mat', 'change', calcReam);
  let csMode = 'unified';
  seg('rf-cs-mode', (m) => { csMode = m; renderCs(); });
  function renderCs() {
    const rows = D.countersinks[csMode] || [];
    $('rf-cs-out').innerHTML = rows.map((r) =>
      `<tr><td>${esc(r.thread)}</td><td>${fmt(r.tap)}</td><td>${fmt(r.close)}</td><td>${fmt(r.free)}</td><td>${fmt(r.csink82)}</td></tr>`).join('');
  }
  const pierceSections = [...new Set(D.pierce.map((p) => p.section))];
  $('rf-pierce-sec').innerHTML = pierceSections.map((s) => `<option>${esc(s)}</option>`).join('');
  function renderPierce() {
    const sec = $('rf-pierce-sec').value;
    $('rf-pierce-out').innerHTML = D.pierce.filter((p) => p.section === sec).map((p) =>
      `<tr><td>${esc(p.item)}</td><td>${fmt(p.size, 3)}</td></tr>`).join('');
  }
  on('rf-pierce-sec', 'change', renderPierce);
  on('rf-ra', 'input', () => { const ra = num('rf-ra'); if (ra > 0)
    results($('rf-finish-out'), [['Rz ≈', fmt(QC.rzFromRa(ra), 1) + ' <small>µm</small>'], ['Ra in µin', fmt(ra * 39.3701, 0) + ' <small>µin</small>', true]]); });
  on('rf-rz', 'input', () => { const rz = num('rf-rz'); if (rz > 0)
    results($('rf-finish-out'), [['Ra ≈', fmt(QC.raFromRz(rz), 2) + ' <small>µm</small>']]); });
  function calcTorque() {
    const K = parseFloat($('rf-tq-k').value), d = num('rf-tq-dia'), F = num('rf-tq-clamp');
    if (!(d > 0 && F > 0)) { $('rf-tq-out').innerHTML = ''; return; }
    const t = QC.boltTorqueInLb(K, d, F);
    results($('rf-tq-out'), [['Torque', fmt(t, 0) + ' <small>in-lb</small>'], ['Torque', fmt(t / 12, 1) + ' <small>ft-lb</small>']]);
  }
  onAll(['rf-tq-dia', 'rf-tq-clamp'], calcTorque); on('rf-tq-k', 'change', calcTorque);
  function renderWf() {
    const F = QC.WEIGHT_FACTORS;
    $('rf-wf-out').innerHTML = `<table class="data"><tbody>
      <tr><td>Round bar</td><td>${F.roundPerFt} × D² lb/ft</td></tr>
      <tr><td>Square bar</td><td>${F.squarePerFt} × D² lb/ft</td></tr>
      <tr><td>Hex bar</td><td>${F.hexPerFt} × D² lb/ft</td></tr>
      <tr><td>Octagon bar</td><td>${F.octagonPerFt} × D² lb/ft</td></tr>
      <tr><td>Plate (per ft of width)</td><td>${F.platePerFt} × thickness lb</td></tr>
      <tr><td>Round tube</td><td>10.68 × (OD − wall) × wall lb/ft</td></tr>
      <tr><td>Square tube</td><td>13.6 × (OD − wall) × wall lb/ft</td></tr></tbody></table>`;
  }
  function calcKnurl() {
    const d = num('rf-kn-dia'), t = num('rf-kn-tpi');
    if (!(d > 0 && t > 0)) { $('rf-kn-out').innerHTML = ''; return; }
    results($('rf-kn-out'), [['Blank dia for even knurl', fmt(QC.knurlBlankDia(d, t), 3) + ' <small>in</small>']]);
  }
  onAll(['rf-kn-dia', 'rf-kn-tpi'], calcKnurl);

  /* ---------------- G & M codes + SHCS reference ----------------
     Static quick-reference tables (standard published Fanuc-style meanings).
     Not from the workbook — added 2026-10-27 on Rick's order. */
  const GCODES = [
    // Motion
    ['G00', 'Motion', 'Rapid positioning — fast traverse, not a cutting move'],
    ['G01', 'Motion', 'Linear interpolation — straight cut at the programmed feedrate'],
    ['G02', 'Motion', 'Circular interpolation, clockwise'],
    ['G03', 'Motion', 'Circular interpolation, counter-clockwise'],
    ['G04', 'Motion', 'Dwell — pause for a set time or spindle revolutions'],
    ['G09', 'Motion', 'Exact stop — decelerate to a full stop at the end of this block'],
    // Canned cycles
    ['G73', 'Canned cycles', 'Peck drilling cycle, high-speed — short retracts to break chips'],
    ['G74', 'Canned cycles', 'Left-hand tapping cycle (counter-boring on some lathes)'],
    ['G76', 'Canned cycles', 'Fine boring cycle on mills; threading cycle on lathes'],
    ['G80', 'Canned cycles', 'Cancel canned cycle'],
    ['G81', 'Canned cycles', 'Drilling cycle — feed in, rapid out'],
    ['G82', 'Canned cycles', 'Drilling cycle with dwell at the bottom (counterboring / spot-facing)'],
    ['G83', 'Canned cycles', 'Peck drilling cycle — full retract to clear chips'],
    ['G84', 'Canned cycles', 'Tapping cycle, right-hand'],
    ['G85', 'Canned cycles', 'Boring cycle — feed in, feed out (reaming cycle)'],
    // Compensation & work offsets
    ['G40', 'Compensation & work offsets', 'Cancel cutter compensation'],
    ['G41', 'Compensation & work offsets', 'Cutter compensation left'],
    ['G42', 'Compensation & work offsets', 'Cutter compensation right'],
    ['G43', 'Compensation & work offsets', 'Tool length compensation — apply (plus)'],
    ['G49', 'Compensation & work offsets', 'Cancel tool length compensation'],
    ['G54', 'Compensation & work offsets', 'Work coordinate system 1'],
    ['G55', 'Compensation & work offsets', 'Work coordinate system 2'],
    ['G56', 'Compensation & work offsets', 'Work coordinate system 3'],
    ['G57', 'Compensation & work offsets', 'Work coordinate system 4'],
    ['G58', 'Compensation & work offsets', 'Work coordinate system 5'],
    ['G59', 'Compensation & work offsets', 'Work coordinate system 6'],
    // Modes
    ['G17', 'Modes', 'Select the XY plane (arcs & cutter comp)'],
    ['G18', 'Modes', 'Select the XZ plane (the lathe plane)'],
    ['G19', 'Modes', 'Select the YZ plane'],
    ['G20', 'Modes', 'Inch input'],
    ['G21', 'Modes', 'Metric (mm) input'],
    ['G61', 'Modes', 'Exact stop mode — full stop at every block end'],
    ['G64', 'Modes', 'Cutting mode — continuous path, no stop between blocks'],
    ['G90', 'Modes', 'Absolute programming — positions from the work zero'],
    ['G91', 'Modes', 'Incremental programming — positions from where you are'],
    ['G94', 'Modes', 'Feed per minute'],
    ['G95', 'Modes', 'Feed per revolution'],
    ['G96', 'Modes', 'Constant surface speed (CSS) on — value is surface speed'],
    ['G97', 'Modes', 'CSS off — spindle speed is direct RPM'],
    ['G98', 'Modes', 'Canned cycle return to the initial plane'],
    ['G99', 'Modes', 'Canned cycle return to the R plane'],
    // Reference point return
    ['G27', 'Reference point return', 'Reference point return check'],
    ['G28', 'Reference point return', 'Return to reference point (machine home), through an intermediate point'],
    ['G30', 'Reference point return', 'Return to the 2nd, 3rd, or 4th reference point'],
  ];
  const MCODES = [
    // Program control
    ['M00', 'Program control', 'Program stop — unconditional; press cycle start to continue'],
    ['M01', 'Program control', 'Optional stop — stops only when the optional-stop switch is on'],
    ['M02', 'Program control', 'End of program'],
    ['M30', 'Program control', 'End of program — reset and rewind to the start'],
    ['M98', 'Program control', 'Subprogram call'],
    ['M99', 'Program control', 'Subprogram end — return to the main program'],
    // Spindle & gear
    ['M03', 'Spindle & gear', 'Spindle on, clockwise'],
    ['M04', 'Spindle & gear', 'Spindle on, counter-clockwise'],
    ['M05', 'Spindle & gear', 'Spindle stop'],
    ['M19', 'Spindle & gear', 'Spindle orientation — stop at a set angle'],
    ['M41', 'Spindle & gear', 'Gear range 1 (low) — on machines with a geared head'],
    ['M42', 'Spindle & gear', 'Gear range 2 — on machines with a geared head'],
    ['M43', 'Spindle & gear', 'Gear range 3 — on machines with a geared head'],
    ['M44', 'Spindle & gear', 'Gear range 4 (high) — on machines with a geared head'],
    // Tool change
    ['M06', 'Tool change', 'Tool change'],
    // Coolant
    ['M07', 'Coolant', 'Coolant on — mist (through-spindle on some machines)'],
    ['M08', 'Coolant', 'Coolant on — flood'],
    ['M09', 'Coolant', 'Coolant off'],
    // Overrides
    ['M48', 'Overrides', 'Enable feed & speed overrides (cancels M49)'],
    ['M49', 'Overrides', 'Disable feed & speed overrides — locked at 100%'],
  ];
  // Socket head cap screws, ASME B18.3 — head diameter & height are maximums, inches.
  const SHCS = [
    ['#0-80', '0.096', '0.060', '0.050'], ['#1-64', '0.118', '0.073', '0.062 (1/16)'],
    ['#2-56', '0.140', '0.086', '0.078 (5/64)'], ['#3-48', '0.161', '0.099', '0.078 (5/64)'],
    ['#4-40', '0.183', '0.112', '0.093 (3/32)'], ['#5-40', '0.205', '0.125', '0.093 (3/32)'],
    ['#6-32', '0.226', '0.138', '0.109 (7/64)'], ['#8-32', '0.270', '0.164', '0.141 (9/64)'],
    ['#10-32', '0.312', '0.190', '0.156 (5/32)'], ['1/4-20', '0.375', '0.250', '0.188 (3/16)'],
    ['5/16-18', '0.469', '0.312', '0.250 (1/4)'], ['3/8-16', '0.562', '0.375', '0.312 (5/16)'],
    ['7/16-14', '0.625', '0.437', '0.375 (3/8)'], ['1/2-13', '0.750', '0.500', '0.375 (3/8)'],
    ['5/8-11', '0.938', '0.625', '0.500 (1/2)'], ['3/4-10', '1.125', '0.750', '0.625 (5/8)'],
    ['7/8-9', '1.312', '0.875', '0.750 (3/4)'], ['1-8', '1.500', '1.000', '0.750 (3/4)'],
    ['1-1/4-7', '1.875', '1.250', '1.000'],
  ];
  let cdKind = 'g';
  function renderCodes() {
    const f = ($('cd-search').value || '').trim().toLowerCase();
    const rows = cdKind === 'g' ? GCODES : MCODES;
    let lastGroup = null, shown = 0, html = '';
    for (const [code, grp, meaning] of rows) {
      if (f && !(code.toLowerCase().includes(f) || meaning.toLowerCase().includes(f) || grp.toLowerCase().includes(f))) continue;
      if (grp !== lastGroup) { html += `<tr class="grp"><td colspan="2">${esc(grp)}</td></tr>`; lastGroup = grp; }
      html += `<tr class="cd-row"><td><b>${esc(code)}</b></td><td>${esc(meaning)}</td></tr>`;
      shown++;
    }
    $('cd-tbody').innerHTML = html ||
      '<tr><td colspan="2">No match — try a code like G84, or a word like "tap"</td></tr>';
  }
  seg('cd-mode', (m) => { cdKind = m; renderCodes(); });
  on('cd-search', 'input', renderCodes);
  function renderShcs() {
    $('rf-shcs-out').innerHTML = SHCS.map((r) =>
      `<tr><td>${esc(r[0])}</td><td>${r[1]}</td><td>${r[2]}</td><td>${esc(r[3])}</td></tr>`).join('');
  }

  /* ---------------- Added 2026-10-27 (Rick's order: the audited missing tools) ----------------
     SFM starting ranges: standard textbook values (Machinery's Handbook-style
     machinability tables) — ranges, labeled as starting points in the UI.
     NPT drills: the widely published standard tap-drill chart. Pitches: ISO
     coarse/fine series. Screw tables: ISO 4762 / ISO 10642 / ASME B18.3. */
  const SFM_RECS = [
    ['Aluminum alloys', '250-400', '800-1500'],
    ['Magnesium alloys', '300-500', '1000+'],
    ['Brass - free-cutting', '150-250', '500-800'],
    ['Brass / bronze - hard', '100-180', '350-600'],
    ['Copper', '100-175', '400-700'],
    ['Cast iron - gray', '60-100', '250-400'],
    ['Cast iron - ductile / malleable', '50-90', '200-350'],
    ['Steel - mild (1018)', '80-110', '300-450'],
    ['Steel - medium carbon (1045)', '60-90', '250-350'],
    ['Steel - alloy, annealed (4140)', '50-80', '200-300'],
    ['Steel - alloy, hardened ~40 HRC', '-', '100-180'],
    ['Tool steel, annealed', '40-70', '150-250'],
    ['Stainless - free-machining (303)', '50-80', '200-300'],
    ['Stainless - austenitic (304/316)', '35-60', '120-220'],
    ['Titanium (6Al-4V)', '20-35', '60-100'],
    ['Plastics (acetal, nylon)', '200-400', '500-900'],
  ];
  function renderSfmRecs() {
    $('fm-sfmrec-out').innerHTML = SFM_RECS.map((r) =>
      `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('');
  }
  /* RPM quick chart (added 2026-10-27, Rick's order) — pure grid math:
     RPM = SFM x 3.82 / D, the same QC.rpmFromSfm relation the calculators use. */
  const RPM_SFMS = [20, 30, 40, 50, 60, 80, 100, 120, 150, 200, 250, 300, 350, 400, 450, 500, 600];
  const RPM_DIAS = [ // label, inches
    ['1/16', 0.0625], ['1/8', 0.125], ['3/16', 0.1875], ['1/4', 0.25], ['3/8', 0.375],
    ['1/2', 0.5], ['3/4', 0.75], ['1', 1], ['1-1/2', 1.5], ['2', 2], ['3', 3], ['4', 4], ['6', 6],
  ];
  function renderRpmChart() {
    $('fm-rpm-head').innerHTML = '<th>SFM \\ Ø</th>' + RPM_DIAS.map((d) => `<th>${esc(d[0])}</th>`).join('');
    $('fm-rpm-out').innerHTML = RPM_SFMS.map((s) =>
      `<tr><td><b>${s}</b></td>` + RPM_DIAS.map((d) =>
        `<td>${Math.round(QC.rpmFromSfm(s, d[1])).toLocaleString('en-US')}</td>`).join('') + '</tr>').join('');
  }
  const NPT_DRILLS = [ // size, TPI, pipe OD, tap drill, decimal
    ['1/16', '27', '0.3125', 'R', '0.339'], ['1/8', '27', '0.405', '11/32', '0.344'],
    ['1/4', '18', '0.540', '7/16', '0.438'], ['3/8', '18', '0.675', '37/64', '0.578'],
    ['1/2', '14', '0.840', '23/32', '0.719'], ['3/4', '14', '1.050', '59/64', '0.922'],
    ['1', '11-1/2', '1.315', '1-5/32', '1.156'], ['1-1/4', '11-1/2', '1.660', '1-1/2', '1.500'],
    ['1-1/2', '11-1/2', '1.900', '1-47/64', '1.734'], ['2', '11-1/2', '2.375', '2-13/64', '2.203'],
  ];
  function renderNpt() {
    $('dt-npt-out').innerHTML = NPT_DRILLS.map((r) =>
      `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${r[2]}</td><td>${esc(r[3])}</td><td>${r[4]}</td></tr>`).join('');
  }
  /* NPT basic pipe dimensions, ASME B1.20.1 (added 2026-10-27):
     size, OD, TPI, pitch, L1 hand-tight engagement, hand-tight turns, L2 effective length. */
  const NPT_DIMS = [
    ['1/16', 0.3125, '27', '0.0370', '0.1600', '4.3', '0.2611'],
    ['1/8', 0.405, '27', '0.0370', '0.1800', '4.9', '0.2680'],
    ['1/4', 0.540, '18', '0.0556', '0.2278', '4.1', '0.4018'],
    ['3/8', 0.675, '18', '0.0556', '0.2400', '4.3', '0.4078'],
    ['1/2', 0.840, '14', '0.0714', '0.3200', '4.5', '0.5337'],
    ['3/4', 1.050, '14', '0.0714', '0.3390', '4.7', '0.5457'],
    ['1', 1.315, '11.5', '0.0870', '0.4000', '4.6', '0.6828'],
    ['1-1/4', 1.660, '11.5', '0.0870', '0.4200', '4.8', '0.7068'],
    ['1-1/2', 1.900, '11.5', '0.0870', '0.4200', '4.8', '0.7235'],
    ['2', 2.375, '11.5', '0.0870', '0.4360', '5.0', '0.7565'],
  ];
  function renderNptDims() {
    $('dt-nptdim-out').innerHTML = NPT_DIMS.map((r) =>
      `<tr><td>${esc(r[0])}</td><td>${fmt(r[1], 4)}</td><td>${esc(r[2])}</td><td>${r[3]}</td><td>${r[4]} <small>(${r[5]} turns)</small></td><td>${r[6]}</td></tr>`).join('');
  }
  const METRIC_PITCHES = [ // size, coarse, fine, extra fine
    ['M1.6', '0.35', '0.20', '-'], ['M2', '0.40', '0.25', '-'], ['M2.5', '0.45', '0.35', '-'],
    ['M3', '0.50', '0.35', '-'], ['M3.5', '0.60', '0.35', '-'], ['M4', '0.70', '0.50', '-'],
    ['M5', '0.80', '0.50', '-'], ['M6', '1.00', '0.75', '0.50'], ['M7', '1.00', '0.75', '-'],
    ['M8', '1.25', '1.00', '0.75'], ['M10', '1.50', '1.25', '1.00 / 0.75'],
    ['M12', '1.75', '1.50', '1.25 / 1.00'], ['M14', '2.00', '1.50', '1.00'],
    ['M16', '2.00', '1.50', '-'], ['M18', '2.50', '2.00', '1.50'],
    ['M20', '2.50', '2.00', '1.50 / 1.00'], ['M22', '2.50', '2.00', '1.50'],
    ['M24', '3.00', '2.00', '1.50'], ['M27', '3.00', '2.00', '1.50'],
    ['M30', '3.50', '2.00', '1.50'], ['M33', '3.50', '2.00', '1.50'],
    ['M36', '4.00', '3.00', '2.00'], ['M39', '4.00', '3.00', '2.00'],
    ['M42', '4.50', '3.00', '2.00'], ['M45', '4.50', '3.00', '2.00'],
    ['M48', '5.00', '3.00', '2.00'],
  ];
  function renderPitches() {
    $('dt-pitch-out').innerHTML = METRIC_PITCHES.map((r) =>
      `<tr><td>${esc(r[0])}</td><td>${r[1]}</td><td>${r[2]}</td><td>${esc(r[3])}</td></tr>`).join('');
  }
  // Metric socket head cap screws, ISO 4762 — head dia & height are maximums, mm.
  const SHCS_METRIC = [
    ['M1.6', '3.0', '1.6', '1.5'], ['M2', '3.8', '2.0', '1.5'], ['M2.5', '4.5', '2.5', '2'],
    ['M3', '5.5', '3.0', '2.5'], ['M4', '7.0', '4.0', '3'], ['M5', '8.5', '5.0', '4'],
    ['M6', '10.0', '6.0', '5'], ['M8', '13.0', '8.0', '6'], ['M10', '16.0', '10.0', '8'],
    ['M12', '18.0', '12.0', '10'], ['M14', '21.0', '14.0', '10'], ['M16', '24.0', '16.0', '14'],
    ['M20', '30.0', '20.0', '17'], ['M24', '36.0', '24.0', '19'],
  ];
  function renderShcsMetric() {
    $('rf-mshcs-out').innerHTML = SHCS_METRIC.map((r) =>
      `<tr><td>${esc(r[0])}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join('');
  }
  // Flat head screws — nominal catalog dimensions (max head dia / max head height).
  const FLATHEAD_METRIC = [ // ISO 10642, 90 deg, mm
    ['M2', '4.4', '1.3', '1.25'], ['M2.5', '5.5', '1.6', '1.5'], ['M3', '6.7', '1.9', '2'],
    ['M4', '8.9', '2.5', '2.5'], ['M5', '11.0', '3.0', '3'], ['M6', '13.2', '3.6', '4'],
    ['M8', '17.5', '4.8', '5'], ['M10', '21.9', '6.0', '6'], ['M12', '25.9', '7.2', '8'],
    ['M16', '33.6', '9.6', '10'], ['M20', '41.3', '12.0', '12'],
  ];
  const FLATHEAD_INCH = [ // ASME B18.3, 82 deg, inches (hex not listed — varies by maker)
    ['#4-40', '0.225', '0.075', '-'], ['#6-32', '0.279', '0.089', '-'], ['#8-32', '0.332', '0.104', '-'],
    ['#10-32', '0.385', '0.118', '-'], ['1/4-20', '0.472', '0.153', '-'],
    ['5/16-18', '0.590', '0.191', '-'], ['3/8-16', '0.708', '0.230', '-'],
  ];
  let fhMode = 'metric';
  seg('rf-fh-mode', (m) => { fhMode = m; renderFlathead(); });
  function renderFlathead() {
    const rows = fhMode === 'metric' ? FLATHEAD_METRIC : FLATHEAD_INCH;
    $('rf-fh-out').innerHTML = rows.map((r) =>
      `<tr><td>${esc(r[0])}</td><td>${r[1]}</td><td>${r[2]}</td><td>${esc(r[3])}</td></tr>`).join('');
  }
  /* ------- Quick-reference charts added 2026-10-27 (Rick's order) -------
     Keyway/keyseat: ASME B17.1 standard parallel keys; nominal depth = half
     the key height, shaft and hub. Center drills: ASA B5.20 Type A (60 deg);
     point length is the 60 deg cone from drill dia to body dia.
     O-rings: AS568 nominal dash dimensions (ID x cross-section; OD derived). */
  const KEYWAY = [ // shaft dia range, key W x H, shaft keyseat depth, hub keyway depth
    ['0.250–0.375', '3/32 × 3/32', '0.047', '0.047'],
    ['0.376–0.500', '1/8 × 1/8', '0.062', '0.062'],
    ['0.501–0.875', '3/16 × 3/16', '0.094', '0.094'],
    ['0.876–1.250', '1/4 × 1/4', '0.125', '0.125'],
    ['1.251–1.375', '5/16 × 5/16', '0.156', '0.156'],
    ['1.376–1.750', '3/8 × 3/8', '0.188', '0.188'],
    ['1.751–2.250', '1/2 × 1/2', '0.250', '0.250'],
    ['2.251–2.750', '5/8 × 5/8', '0.312', '0.312'],
    ['2.751–3.000', '3/4 × 3/4', '0.375', '0.375'],
  ];
  function renderKeyway() {
    $('rf-kw-out').innerHTML = KEYWAY.map((r) =>
      `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join('');
  }
  const CENTER_DRILLS = [ // size, drill dia, body dia, 60 deg point length
    ['#1', '0.0469', '0.125', '0.068'],
    ['#2', '0.0781', '0.1875', '0.095'],
    ['#3', '0.1094', '0.250', '0.122'],
    ['#4', '0.125', '0.3125', '0.162'],
    ['#5', '0.1875', '0.4375', '0.217'],
    ['#6', '0.250', '0.500', '0.217'],
  ];
  function renderCenterDrills() {
    $('rf-cd-out').innerHTML = CENTER_DRILLS.map((r) =>
      `<tr><td>${esc(r[0])}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join('');
  }
  const ORING = [ // AS568 dash, ID, cross-section (OD = ID + 2 x CS)
  ['-001',0.029,0.040],
  ['-002',0.042,0.040],
  ['-003',0.056,0.040],
  ['-004',0.070,0.040],
  ['-005',0.101,0.050],
  ['-006',0.114,0.070],
  ['-007',0.145,0.070],
  ['-008',0.176,0.070],
  ['-009',0.208,0.070],
  ['-010',0.239,0.070],
  ['-011',0.301,0.070],
  ['-012',0.364,0.070],
  ['-013',0.426,0.070],
  ['-014',0.489,0.070],
  ['-015',0.551,0.070],
  ['-016',0.614,0.070],
  ['-017',0.676,0.070],
  ['-018',0.739,0.070],
  ['-019',0.801,0.070],
  ['-020',0.864,0.070],
  ['-021',0.926,0.070],
  ['-022',0.989,0.070],
  ['-023',1.051,0.070],
  ['-024',1.114,0.070],
  ['-025',1.176,0.070],
  ['-026',1.239,0.070],
  ['-027',1.301,0.070],
  ['-028',1.364,0.070],
  ['-102',0.049,0.103],
  ['-103',0.081,0.103],
  ['-104',0.112,0.103],
  ['-105',0.143,0.103],
  ['-106',0.174,0.103],
  ['-107',0.206,0.103],
  ['-108',0.237,0.103],
  ['-109',0.299,0.103],
  ['-110',0.362,0.103],
  ['-111',0.424,0.103],
  ['-112',0.487,0.103],
  ['-113',0.549,0.103],
  ['-114',0.612,0.103],
  ['-115',0.674,0.103],
  ['-116',0.737,0.103],
  ['-117',0.799,0.103],
  ['-118',0.862,0.103],
  ['-119',0.924,0.103],
  ['-120',0.987,0.103],
  ['-121',1.049,0.103],
  ['-122',1.112,0.103],
  ['-123',1.174,0.103],
  ['-124',1.237,0.103],
  ['-125',1.299,0.103],
  ['-126',1.362,0.103],
  ['-127',1.424,0.103],
  ['-128',1.487,0.103],
  ['-129',1.549,0.103],
  ['-130',1.612,0.103],
  ['-131',1.674,0.103],
  ['-132',1.737,0.103],
  ['-133',1.799,0.103],
  ['-134',1.862,0.103],
  ['-135',1.924,0.103],
  ['-136',1.987,0.103],
  ['-137',2.049,0.103],
  ['-138',2.112,0.103],
  ['-139',2.174,0.103],
  ['-140',2.237,0.103],
  ['-141',2.299,0.103],
  ['-142',2.362,0.103],
  ['-143',2.424,0.103],
  ['-144',2.487,0.103],
  ['-145',2.549,0.103],
  ['-146',2.612,0.103],
  ['-147',2.674,0.103],
  ['-148',2.737,0.103],
  ['-149',2.799,0.103],
  ['-150',2.862,0.103],
  ['-151',2.924,0.103],
  ['-152',2.987,0.103],
  ['-153',3.049,0.103],
  ['-154',3.112,0.103],
  ['-155',3.174,0.103],
  ['-156',3.237,0.103],
  ['-157',3.299,0.103],
  ['-158',3.362,0.103],
  ['-159',3.424,0.103],
  ['-160',3.487,0.103],
  ['-161',3.549,0.103],
  ['-162',3.612,0.103],
  ['-163',3.674,0.103],
  ['-164',3.737,0.103],
  ['-165',3.799,0.103],
  ['-166',3.862,0.103],
  ['-167',3.924,0.103],
  ['-168',3.987,0.103],
  ['-169',4.049,0.103],
  ['-170',4.112,0.103],
  ['-171',4.174,0.103],
  ['-172',4.237,0.103],
  ['-173',4.299,0.103],
  ['-174',4.362,0.103],
  ['-175',4.424,0.103],
  ['-176',4.487,0.103],
  ['-177',4.549,0.103],
  ['-178',4.612,0.103],
  ['-201',0.171,0.139],
  ['-202',0.234,0.139],
  ['-203',0.296,0.139],
  ['-204',0.359,0.139],
  ['-205',0.421,0.139],
  ['-206',0.484,0.139],
  ['-207',0.546,0.139],
  ['-208',0.609,0.139],
  ['-209',0.671,0.139],
  ['-210',0.734,0.139],
  ['-211',0.796,0.139],
  ['-212',0.859,0.139],
  ['-213',0.921,0.139],
  ['-214',0.984,0.139],
  ['-215',1.046,0.139],
  ['-216',1.109,0.139],
  ['-217',1.171,0.139],
  ['-218',1.234,0.139],
  ['-219',1.296,0.139],
  ['-220',1.359,0.139],
  ['-221',1.421,0.139],
  ['-222',1.484,0.139],
  ['-223',1.546,0.139],
  ['-224',1.609,0.139],
  ['-225',1.671,0.139],
  ['-226',1.734,0.139],
  ['-227',1.796,0.139],
  ['-228',1.859,0.139],
  ['-229',1.921,0.139],
  ['-230',1.984,0.139],
  ['-231',2.109,0.139],
  ['-232',2.234,0.139],
  ['-233',2.359,0.139],
  ['-234',2.484,0.139],
  ['-235',2.609,0.139],
  ['-236',2.734,0.139],
  ['-237',2.859,0.139],
  ['-238',2.984,0.139],
  ['-239',3.109,0.139],
  ['-240',3.234,0.139],
  ['-241',3.359,0.139],
  ['-242',3.484,0.139],
  ['-243',3.609,0.139],
  ['-244',3.734,0.139],
  ['-245',3.859,0.139],
  ['-246',3.984,0.139],
  ['-247',4.109,0.139],
  ['-248',4.234,0.139],
  ['-249',4.359,0.139],
  ['-250',4.484,0.139]
  ];
  function renderOrings(q) {
    const needle = (q || '').trim().toLowerCase();
    const rows = ORING.filter((r) => !needle ||
      r[0].toLowerCase().includes(needle) ||
      r[1].toFixed(3).includes(needle) ||
      (r[1] + 2 * r[2]).toFixed(3).includes(needle) ||
      r[2].toFixed(3).includes(needle));
    $('rf-oring-out').innerHTML = rows.map((r) =>
      `<tr><td>${esc(r[0])}</td><td>${r[1].toFixed(3)}</td><td>${(r[1] + 2 * r[2]).toFixed(3)}</td><td>${r[2].toFixed(3)}</td></tr>`).join('') ||
      '<tr><td colspan="4">No match — try a dash number like -214 or an ID like 1.359</td></tr>';
  }
  on('rf-oring-search', 'input', () => renderOrings($('rf-oring-search').value));
  /* Taper solver (Geometry screen) */
  function calcTaper() {
    const big = num('g-tp-big'), small = num('g-tp-small'), len = num('g-tp-len');
    if (!(big > 0 && small > 0 && big > small && len > 0)) { $('g-tp-out').innerHTML = ''; }
    else {
      const t = QC.taperFromDias(big, small, len);
      results($('g-tp-out'), [
        ['Taper per foot', fmt(t.perFoot, 4) + ' <small>in/ft</small>'],
        ['Taper per inch', fmt(t.perInch, 5) + ' <small>in/in</small>'],
        ['Included angle', fmt(t.includedDeg, 3) + ' <small>deg</small>'],
        ['Half angle (set compound)', fmt(t.halfAngleDeg, 3) + ' <small>deg</small>'],
      ]);
    }
    const tpf = num('g-tp-tpf'), inv = num('g-tp-inv');
    if (big > 0 && tpf > 0 && len > 0 && inv != null) {
      results($('g-tp-inv-out'), [['Big end from small + TPF', fmt(QC.taperOtherDia(inv, tpf, len, true), 4) + ' <small>in</small>']]);
    } else if (big > 0 && tpf > 0 && len > 0) {
      results($('g-tp-inv-out'), [['Small end from big + TPF', fmt(QC.taperOtherDia(big, tpf, len, false), 4) + ' <small>in</small>']]);
    } else { $('g-tp-inv-out').innerHTML = ''; }
  }
  onAll(['g-tp-big', 'g-tp-small', 'g-tp-len', 'g-tp-tpf', 'g-tp-inv'], calcTaper);
  /* Gears screen */
  let grPairSys = 'dp';
  seg('gr-mode', (m) => {
    for (const k of ['dp', 'mod', 'pair', 'od']) $('gr-' + k).style.display = m === k ? '' : 'none';
  });
  seg('gr-pair-sys', (m) => { grPairSys = m; calcGearPair(); });
  function gearPairs(g, unit, dp) {
    const p3 = unit === 'mm' ? 3 : 4;
    return [
      ['Pitch diameter', fmt(g.pitchDia, p3) + ' <small>' + unit + '</small>'],
      ['Outside diameter', fmt(g.outsideDia, p3) + ' <small>' + unit + '</small>'],
      ['Root diameter', fmt(g.rootDia, p3) + ' <small>' + unit + '</small>'],
      ['Circular pitch', fmt(g.circularPitch, 4) + ' <small>' + unit + '</small>'],
      ['Addendum', fmt(g.addendum, 4) + ' <small>' + unit + '</small>'],
      ['Whole depth', fmt(g.wholeDepth, 4) + ' <small>' + unit + '</small>'],
      ['Tooth thickness (pitch line)', fmt(g.toothThickness, 4) + ' <small>' + unit + '</small>'],
    ];
  }
  function calcGearDp() {
    const n = num('gr-n'), dp = num('gr-dpv');
    if (!(n >= 1 && dp > 0)) { $('gr-dp-out').innerHTML = ''; return; }
    const g = QC.gearFromDP(Math.floor(n), dp);
    const pairs = gearPairs(g, 'in');
    pairs.push(['Module equivalent', fmt(g.module, 3) + ' <small>mm</small>']);
    results($('gr-dp-out'), pairs);
  }
  function calcGearMod() {
    const n = num('gr-mn'), m = num('gr-mm');
    if (!(n >= 1 && m > 0)) { $('gr-mod-out').innerHTML = ''; return; }
    const g = QC.gearFromModule(Math.floor(n), m);
    const pairs = gearPairs(g, 'mm');
    pairs.push(['DP equivalent', fmt(g.dp, 3) + ' <small>teeth/in</small>']);
    results($('gr-mod-out'), pairs);
  }
  function calcGearPair() {
    const n1 = num('gr-p1'), n2 = num('gr-p2'), p = num('gr-pdp'), rpm = num('gr-prpm');
    if (!(n1 >= 1 && n2 >= 1 && p > 0)) { $('gr-pair-out').innerHTML = ''; return; }
    const isMod = grPairSys === 'mod', u = isMod ? 'mm' : 'in';
    const r = QC.gearPair(Math.floor(n1), Math.floor(n2), p, isMod);
    const pairs = [
      ['Pinion pitch diameter', fmt(r.g1.pitchDia, 3) + ' <small>' + u + '</small>'],
      ['Gear pitch diameter', fmt(r.g2.pitchDia, 3) + ' <small>' + u + '</small>'],
      ['Center distance', fmt(r.centerDistance, 4) + ' <small>' + u + '</small>'],
      ['Ratio (gear : pinion)', fmt(r.ratio, 3) + ' <small>: 1</small>'],
    ];
    if (rpm > 0) pairs.push(['Gear RPM', fmt(rpm * r.rpmOutPerIn, 1)]);
    results($('gr-pair-out'), pairs);
  }
  function calcGearOd() {
    const n = num('gr-on'), odIn = num('gr-ood'), odMm = num('gr-oodmm');
    if (!(n >= 1)) { $('gr-od-out').innerHTML = ''; return; }
    const pairs = [];
    if (odIn > 0) {
      const dp = QC.gearDpFromOD(Math.floor(n), odIn);
      pairs.push(['Diametral pitch', fmt(dp, 3) + ' <small>teeth/in</small>'],
        ['Pitch diameter at that DP', fmt(n / dp, 4) + ' <small>in</small>'],
        ['Module equivalent', fmt(25.4 / dp, 3) + ' <small>mm</small>']);
    }
    if (odMm > 0) {
      const m = QC.gearModuleFromOD(Math.floor(n), odMm);
      pairs.push(['Module', fmt(m, 3) + ' <small>mm</small>'],
        ['Pitch diameter at that module', fmt(n * m, 3) + ' <small>mm</small>'],
        ['DP equivalent', fmt(25.4 / m, 3) + ' <small>teeth/in</small>']);
    }
    results($('gr-od-out'), pairs);
  }
  onAll(['gr-n', 'gr-dpv'], calcGearDp);
  onAll(['gr-mn', 'gr-mm'], calcGearMod);
  onAll(['gr-p1', 'gr-p2', 'gr-pdp', 'gr-prpm'], calcGearPair);
  onAll(['gr-on', 'gr-ood', 'gr-oodmm'], calcGearOd);
  /* ISO fits (Reference screen) */
  function calcFit() {
    const dia = num('rf-fit-dia');
    const holeSel = $('rf-fit-hole').value, shaftSel = $('rf-fit-shaft').value;
    if (!(dia > 0)) { $('rf-fit-out').innerHTML = ''; return; }
    const f = QC.isoFit(dia, holeSel.replace(/[0-9]/g, ''), parseInt(holeSel.replace(/\D/g, ''), 10),
      shaftSel.replace(/[0-9]/g, ''), parseInt(shaftSel.replace(/\D/g, ''), 10));
    if (!f) { $('rf-fit-out').innerHTML = '<div class="err">Outside the 1-500 mm table range.</div>'; return; }
    let clr;
    if (f.minClearance >= 0) clr = ['Clearance', fmt(f.minClearance, 1) + ' to ' + fmt(f.maxClearance, 1) + ' <small>um</small>'];
    else if (f.maxClearance <= 0) clr = ['Interference', fmt(-f.maxClearance, 1) + ' to ' + fmt(-f.minClearance, 1) + ' <small>um</small>'];
    else clr = ['Max clearance / interference', fmt(f.maxClearance, 1) + ' / ' + fmt(-f.minClearance, 1) + ' <small>um</small>'];
    results($('rf-fit-out'), [
      ['Fit type', f.type, true],
      ['Hole limits', fmt(f.hole.min, 3) + ' - ' + fmt(f.hole.max, 3) + ' <small>mm</small>'],
      ['Shaft limits', fmt(f.shaft.min, 3) + ' - ' + fmt(f.shaft.max, 3) + ' <small>mm</small>'],
      clr,
    ]);
  }
  onAll(['rf-fit-dia'], calcFit);
  on('rf-fit-hole', 'change', calcFit); on('rf-fit-shaft', 'change', calcFit);
  /* Insert decoder (Reference screen) */
  let insSys = 'inch';
  seg('rf-ins-sys', (m) => { insSys = m; calcInsert(); });
  function calcInsert() {
    const d = QC.decodeInsert($('rf-ins-code').value, insSys);
    if (d.error) { $('rf-ins-out').innerHTML = '<div class="err">' + esc(d.error) + '</div>'; return; }
    $('rf-ins-out').innerHTML = '<div class="scrollbox" style="margin-top:10px"><table class="data"><thead><tr><th>Position</th><th>Code</th><th>Meaning</th></tr></thead><tbody>' +
      d.parts.map((p) => '<tr><td>' + esc(p.pos) + '</td><td><b>' + esc(p.code) + '</b></td><td style="text-align:left">' + esc(p.meaning) + '</td></tr>').join('') +
      '</tbody></table></div>';
  }
  on('rf-ins-code', 'input', calcInsert);

  /* ---------------- Welding (added 2026-10-27 on Rick's order) ----------------
     MIG chart: starting-point ranges that sit inside the values the machine
     makers commonly publish on door charts for mild steel, ER70S-6, C25 gas
     (checked against the Lincoln door chart and Lincoln dealer-published
     ER70S-6 starting-point tables). Electrode traits: AWS A5.1 classification
     facts. Symbols: AWS A2.4 basic glyphs, drawn as simple line diagrams. */
  const MIG_CHART = [ // thickness label, in, wire (in), volts, wire feed (ipm)
    ['1/16', '0.062', '.023–.030', '16–17', '150–200'],
    ['1/8', '0.125', '.030', '17–19', '180–300'],
    ['3/16', '0.188', '.030–.035', '18–19', '200–275'],
    ['1/4', '0.250', '.035', '19–21', '250–325'],
    ['5/16', '0.312', '.035', '19.5–21', '285–335'],
    ['3/8', '0.375', '.035–.045', '20–22', '300–390'],
  ];
  function renderMig() {
    $('wd-mig-out').innerHTML = MIG_CHART.map((r) =>
      `<tr><td>${esc(r[0])} <small>(${r[1]})</small></td><td>${esc(r[2])}</td><td>${esc(r[3])}</td><td>${esc(r[4])}</td></tr>`).join('');
  }
  const ELECTRODES = [ // rod, weld metal, coating, known for
    ['E6010', '60 ksi', 'Cellulose (sodium)', 'Root passes on pipe — deep-digging and fast-freezing, DC+ only. The pipe welder root rod.'],
    ['E6011', '60 ksi', 'Cellulose (potassium)', 'The AC farm and repair rod: deep penetration that burns through rust, scale, and paint better than most.'],
    ['E6013', '60 ksi', 'Titania (potassium)', 'Sheet metal and light work — soft, quiet arc, shallow bite, and slag that lifts off easily.'],
    ['E7014', '70 ksi', 'Iron-powder titania', 'Smooth, fast flat and horizontal fills on clean steel — higher deposition than 6013, easy restarts.'],
    ['E7018', '70 ksi', 'Low-hydrogen, iron powder', 'The structural and code rod: strong, ductile welds. Keep it dry (rod oven) or the low-hydrogen benefit is lost.'],
  ];
  function renderRods() {
    $('wd-rods-out').innerHTML = ELECTRODES.map((r) =>
      `<tr><td><b>${esc(r[0])}</b></td><td>${esc(r[1])}</td><td>${esc(r[2])}</td><td style="text-align:left">${esc(r[3])}</td></tr>`).join('');
  }
  /* Weld symbols: each glyph is drawn on the standard reference line with its
     arrow; glyphs below the line are arrow-side symbols, the backing and
     melt-through marks sit on the opposite (top) side as the standard draws them. */
  const SYM_LINE = '<line x1="2" y1="22" x2="46" y2="22"/><path d="M46 22 L58 32"/><path d="M58 32 L50.5 31 L54.5 24.5 Z" fill="currentColor" stroke="none"/>';
  const FILLET_GLYPH = '<path d="M18 22 V34 L31 22 Z" fill="currentColor" stroke="none"/>';
  const WELD_SYMBOLS = [ // name, meaning, glyph (inner SVG on the reference line)
    ['Fillet', 'Triangle weld filling a corner — tee, lap, and corner joints. The upright leg of the triangle is always drawn on the left of the symbol.', FILLET_GLYPH],
    ['Square groove', 'Butt joint with square edges and no bevel — the two strokes are the two square joint faces.', '<path d="M21 13 V31 M28 13 V31"/>'],
    ['V-groove', 'Both members beveled into a V — for butt joints too thick for a square groove.', '<path d="M17 22 L24.5 33 L32 22"/>'],
    ['Bevel groove', 'Only ONE member is beveled. On the drawing, the arrow is broken to point at the member that gets the bevel.', '<path d="M20 22 V33 L31 22"/>'],
    ['U-groove', 'Both edges rounded into a U — less filler metal than a V on thick plate, but more edge preparation.', '<path d="M18 22 V27 Q18 34 24.5 34 Q31 34 31 27 V22"/>'],
    ['J-groove', 'One member only, curved like a J. Like the bevel, the arrow points at the member to be grooved.', '<path d="M30 22 V29 Q30 34 24 34 Q18.5 34 18.5 29"/>'],
    ['Plug', 'A round hole in the top member, filled with weld metal to fuse it to the member below.', '<rect x="17" y="22" width="15" height="9"/>'],
    ['Slot', 'The plug idea in an elongated hole — the rectangle carries rounded ends for the slot.', '<rect x="14" y="22" width="21" height="9" rx="4.5"/>'],
    ['Backing', 'A bar or strip behind the joint supporting the root pass. Its rectangle sits on the OPPOSITE side of the line from the weld symbol.', '<rect x="18" y="13" width="13" height="9"/>' + FILLET_GLYPH],
    ['Melt-through', 'Complete penetration welded from one side, with visible root reinforcement on the far side. The solid half-disc sits opposite the weld symbol.', '<path d="M17 22 A7.5 7.5 0 0 1 32 22 Z" fill="currentColor" stroke="none"/>' + FILLET_GLYPH],
  ];
  function renderSymbols() {
    $('wd-sym-out').innerHTML = WELD_SYMBOLS.map((s) =>
      `<tr><td><span style="color:var(--accent2)"><svg viewBox="0 0 64 44" width="64" height="44" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">${SYM_LINE}${s[2]}</svg></span></td>` +
      `<td><b>${esc(s[0])}</b></td><td style="text-align:left">${esc(s[1])}</td></tr>`).join('');
  }
  /* Fillet leg ⇄ throat */
  let wdFilMode = 'leg', wdFilUnit = 'in';
  function wdFilLabel() {
    $('wd-fil-label').textContent = (wdFilMode === 'leg' ? 'Leg size' : 'Throat') + (wdFilUnit === 'in' ? ' (in)' : ' (mm)');
  }
  function calcWeldFillet() {
    const v = num('wd-fil-v');
    if (!(v > 0)) { $('wd-fil-out').innerHTML = ''; return; }
    const leg = wdFilMode === 'leg' ? v : QC.filletLeg(v);
    const throat = wdFilMode === 'leg' ? QC.filletThroat(v) : v;
    const u = wdFilUnit, o = u === 'in' ? 'mm' : 'in', k = u === 'in' ? 25.4 : 1 / 25.4;
    const pairs = wdFilMode === 'leg'
      ? [['Throat', fmt(throat, 4) + ' <small>' + u + '</small>', true],
         ['Throat', fmt(throat * k, 3) + ' <small>' + o + '</small>'],
         ['Leg size', fmt(leg, 4) + ' <small>' + u + '</small>']]
      : [['Leg size for that throat', fmt(leg, 4) + ' <small>' + u + '</small>', true],
         ['Leg size', fmt(leg * k, 3) + ' <small>' + o + '</small>'],
         ['Throat', fmt(throat, 4) + ' <small>' + u + '</small>']];
    results($('wd-fil-out'), pairs);
  }
  seg('wd-fil-mode', (m) => { wdFilMode = m; wdFilLabel(); calcWeldFillet(); });
  seg('wd-fil-unit', (m) => { wdFilUnit = m; wdFilLabel(); calcWeldFillet(); });
  on('wd-fil-v', 'input', calcWeldFillet);
  /* Heat input */
  let wdHiUnit = 'in';
  function calcHeat() {
    const v = num('wd-hi-v'), a = num('wd-hi-a'), s = num('wd-hi-s');
    if (!(v > 0 && a > 0 && s > 0)) { $('wd-hi-out').innerHTML = ''; return; }
    const h = QC.heatInput(v, a, s, wdHiUnit);
    results($('wd-hi-out'), [
      ['Heat input', fmt(h.kjPerIn, 2) + ' <small>kJ/in</small>', true],
      ['Heat input', fmt(h.kjPerMm, 3) + ' <small>kJ/mm</small>'],
      ['Heat input', fmt(h.jPerIn, 0) + ' <small>J/in</small>'],
    ]);
  }
  seg('wd-hi-unit', (m) => { wdHiUnit = m; calcHeat(); });
  onAll(['wd-hi-v', 'wd-hi-a', 'wd-hi-s'], calcHeat);
  /* TIG rule-of-thumb amps */
  let wdTigMat = 'steel';
  function calcTig() {
    const tin = num('wd-tig-in'), tmm = num('wd-tig-mm');
    const thIn = tin > 0 ? tin : (tmm > 0 ? tmm / 25.4 : null);
    if (!(thIn > 0)) { $('wd-tig-out').innerHTML = ''; return; }
    const r = QC.tigAmps(thIn, wdTigMat);
    results($('wd-tig-out'), [
      ['Starting amps', fmt(r.amps, 0) + ' <small>A</small>', true],
      ['Working band (±10%)', fmt(r.low, 0) + '–' + fmt(r.high, 0) + ' <small>A</small>'],
      ['Thickness figured', fmt(thIn, 3) + ' <small>in</small> (' + fmt(thIn * 25.4, 2) + ' <small>mm</small>)'],
    ]);
  }
  seg('wd-tig-mat', (m) => { wdTigMat = m; calcTig(); });
  onAll(['wd-tig-in', 'wd-tig-mm'], calcTig);
  /* Stick electrode decoder */
  function calcElectrode() {
    const d = QC.decodeElectrode($('wd-el-code').value);
    if (d.error) { $('wd-el-out').innerHTML = '<div class="err">' + esc(d.error) + '</div>'; return; }
    $('wd-el-out').innerHTML = '<div class="scrollbox" style="margin-top:10px"><table class="data"><thead><tr><th>Position</th><th>Code</th><th>Meaning</th></tr></thead><tbody>' +
      d.parts.map((p) => '<tr><td>' + esc(p.pos) + '</td><td><b>' + esc(p.code) + '</b></td><td style="text-align:left">' + esc(p.meaning) + '</td></tr>').join('') +
      '</tbody></table></div>';
  }
  on('wd-el-code', 'input', calcElectrode);

  /* ---------------- My Shop ---------------- */
  function initSettings() {
    $('ms-end').value = store.settings.endAllow; $('ms-perpart').value = store.settings.perPart;
    $('ms-scrap').value = store.settings.scrap; $('ms-sheetlen').value = store.settings.sheetLen;
    $('ms-den-steel').value = store.settings.densitySteel; $('ms-den-al').value = store.settings.densityAluminum;
  }
  on('ms-save', 'click', () => {
    const g = (id, cur) => { const v = num(id); return v == null ? cur : v; };
    store.settings.endAllow = g('ms-end', store.settings.endAllow);
    store.settings.perPart = g('ms-perpart', store.settings.perPart);
    store.settings.scrap = g('ms-scrap', store.settings.scrap);
    store.settings.sheetLen = g('ms-sheetlen', store.settings.sheetLen);
    store.settings.densitySteel = g('ms-den-steel', store.settings.densitySteel);
    store.settings.densityAluminum = g('ms-den-al', store.settings.densityAluminum);
    save(); $('ms-saved').textContent = 'Saved ✓'; wAll();
  });
  function stackDepths(s) {
    const rawPocket = -((s.punch + s.clr) - s.stripper - s.spring + s.sclr);
    return {
      cbore: (s.punch + s.clr) - s.stripper + s.base - s.bolt,
      pocket: s.base < 1.05 ? 0 : rawPocket,
      double: s.base > 1 ? 0 : rawPocket - s.base,
    };
  }
  function renderStacks() {
    $('ms-stacks').innerHTML = store.stacks.map((s, i) => {
      const d = stackDepths(s);
      return `<div class="stackitem"><div class="nm">${esc(s.name)}<div class="note">stripper ${s.stripper} · punch ${s.punch} · base ${s.base} · bolt ${s.bolt} · spring ${s.spring}</div>
        <div class="note">C'bore depth <b>${fmt(d.cbore, 3)}</b> · Spring pocket <b>${fmt(d.pocket, 3)}</b> · Double-base into 2nd <b>${fmt(d.double, 3)}</b></div></div>
        <button class="ghost danger" data-delstack="${i}">Delete</button></div>`;
    }).join('') || '<p class="note">No die stacks saved yet.</p>';
    document.querySelectorAll('[data-delstack]').forEach((b) => b.addEventListener('click', () => {
      store.stacks.splice(+b.dataset.delstack, 1); save(); renderStacks();
    }));
  }
  on('ms-st-save', 'click', () => {
    const s = { name: $('ms-st-name').value.trim(), stripper: num('ms-st-stripper'), punch: num('ms-st-punch'),
      base: num('ms-st-base'), bolt: num('ms-st-bolt'), spring: num('ms-st-spring'),
      clr: num('ms-st-clr') ?? 0.1, sclr: num('ms-st-sclr') ?? 0.05 };
    if (!s.name || [s.stripper, s.punch, s.base, s.bolt, s.spring].some((v) => v == null)) {
      $('ms-st-err').textContent = 'Give the stack a name and all five dimensions.'; return;
    }
    $('ms-st-err').textContent = '';
    store.stacks.push(s); save(); renderStacks();
    $('ms-st-name').value = '';
  });
  /* custom calculators */
  let ccInputCount = 0;
  function addCcInput(name = '', unit = '') {
    if (ccInputCount >= 6) return;
    ccInputCount++;
    const row = document.createElement('div');
    row.className = 'grid2'; row.style.marginTop = '8px';
    row.innerHTML = `<div><label class="f">Input name (used in formula)</label><input type="text" class="cc-in-name" value="${esc(name)}" placeholder="e.g. flat"></div>
      <div><label class="f">Unit</label><input type="text" class="cc-in-unit" value="${esc(unit)}" placeholder="in"></div>`;
    $('ms-cc-inputs').appendChild(row);
  }
  on('ms-cc-addinput', 'click', () => addCcInput());
  function renderCalcs() {
    $('ms-calcs').innerHTML = store.calcs.map((c, ci) => `
      <div class="card" style="background:var(--panel2)">
        <h3>${esc(c.name)}</h3>
        ${c.inputs.map((inp, ii) => `<label class="f">${esc(inp.name)}${inp.unit ? ' (' + esc(inp.unit) + ')' : ''}</label>
          <input type="number" inputmode="decimal" data-cc="${ci}" data-ii="${ii}">`).join('')}
        <div class="results" id="cc-out-${ci}"></div>
        <p class="note">= ${esc(c.formula)}${c.unit ? ' → ' + esc(c.unit) : ''} · your formula — verify before relying on it</p>
        <button class="ghost danger" data-delcalc="${ci}">Delete calculator</button>
      </div>`).join('') || '<p class="note">No custom calculators yet — add one below.</p>';
    document.querySelectorAll('[data-delcalc]').forEach((b) => b.addEventListener('click', () => {
      store.calcs.splice(+b.dataset.delcalc, 1); save(); renderCalcs();
    }));
    document.querySelectorAll('input[data-cc]').forEach((inp) => inp.addEventListener('input', () => runCalc(+inp.dataset.cc)));
  }
  function runCalc(ci) {
    const c = store.calcs[ci]; if (!c) return;
    const vars = {}; let ready = true;
    c.inputs.forEach((inp, ii) => {
      const el = document.querySelector(`input[data-cc="${ci}"][data-ii="${ii}"]`);
      const v = el ? parseFloat(el.value) : NaN;
      if (isNaN(v)) ready = false; else vars[inp.name] = v;
    });
    const out = $('cc-out-' + ci); if (!out) return;
    if (!ready) { out.innerHTML = ''; return; }
    try {
      const r = QC.evaluateFormula(c.formula, vars);
      results(out, [[c.name, fmt(r) + (c.unit ? ` <small>${esc(c.unit)}</small>` : '')]]);
    } catch (e) { out.innerHTML = `<div class="err">Formula error: ${esc(e.message)}</div>`; }
  }
  on('ms-cc-save', 'click', () => {
    const name = $('ms-cc-name').value.trim(), formula = $('ms-cc-formula').value.trim(), unit = $('ms-cc-unit').value.trim();
    const inputs = [];
    document.querySelectorAll('#ms-cc-inputs .cc-in-name').forEach((el, i) => {
      const n = el.value.trim(), u = document.querySelectorAll('#ms-cc-inputs .cc-in-unit')[i].value.trim();
      if (n) inputs.push({ name: n, unit: u });
    });
    const idOk = (s) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s);
    if (!name || !formula || !inputs.length) { $('ms-cc-err').textContent = 'Name, at least one input, and a formula are required.'; return; }
    if (!inputs.every((i) => idOk(i.name))) { $('ms-cc-err').textContent = 'Input names must be plain names (letters, numbers, underscore; no spaces) — they are used in the formula.'; return; }
    const dummy = {}; inputs.forEach((i) => dummy[i.name] = 1);
    try { QC.evaluateFormula(formula, dummy); }
    catch (e) { $('ms-cc-err').textContent = 'Formula does not parse: ' + e.message; return; }
    $('ms-cc-err').textContent = '';
    store.calcs.push({ name, inputs, formula, unit }); save(); renderCalcs();
    $('ms-cc-name').value = ''; $('ms-cc-formula').value = ''; $('ms-cc-unit').value = '';
    $('ms-cc-inputs').innerHTML = ''; ccInputCount = 0; addCcInput();
  });
  on('ms-export', 'click', () => {
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'h38-quickcalc-myshop.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    $('ms-io-note').textContent = 'Exported — settings, die stacks, and custom calculators.';
  });
  on('ms-import-btn', 'click', () => $('ms-import').click());
  on('ms-import', 'change', () => {
    const f = $('ms-import').files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const j = JSON.parse(rd.result);
        if (!j || typeof j !== 'object' || !('settings' in j)) throw new Error('not a Quick Calc backup');
        store = Object.assign({}, DEFAULTS, j);
        store.settings = Object.assign({}, DEFAULTS.settings, j.settings || {});
        store.stacks = j.stacks || []; store.calcs = j.calcs || [];
        save(); initSettings(); renderStacks(); renderCalcs(); wAll();
        $('ms-io-note').textContent = 'Imported ✓';
      } catch (e) { $('ms-io-note').textContent = 'Import failed: ' + e.message; }
    };
    rd.readAsText(f);
  });

  /* ---------------- init ---------------- */
  addCcInput('x', 'in');
  initSettings(); renderStacks(); renderCalcs();
  calcMill(); calcMillFinish(); calcLathe(); calcLathePlan(); calcLife();
  renderChart(''); calcTapDrill(); calcThreadData(); calcWire();
  wAll(); calcFrac(); calcConv(); calcHard('hrc');
  calcThreading(); calcChip(); calcBall(); calcScallop();
  calcTri(); calcBolt(); calcSine(); calcPoint();
  calcPress(); calcSpring();
  calcReam(); renderCs(); renderPierce(); calcTorque(); renderWf(); calcKnurl();
  renderCodes(); renderShcs();
  renderSfmRecs(); renderNpt(); renderPitches(); renderShcsMetric(); renderFlathead();
  renderRpmChart(); renderNptDims(); renderKeyway(); renderCenterDrills(); renderOrings('');
  calcTaper(); calcGearDp(); calcGearMod(); calcGearPair(); calcGearOd(); calcFit(); calcInsert();
  renderMig(); renderRods(); renderSymbols(); calcWeldFillet(); calcHeat(); calcTig(); calcElectrode();
})();
