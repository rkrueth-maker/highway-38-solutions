/* H38 Quick Calc — core math library.
   Every function traces to Quick calc2.0.xlsx formulas (see ../SCOPE.md).
   Pure functions only: no DOM, no storage. Loaded by the app and by validate.mjs. */
(function (global) {
  'use strict';

  var K_SFM = 3.82;          // workbook constant (12/pi = 3.8197)
  var K_SFM2 = 0.262;        // workbook constant (pi/12 = 0.2618)

  // ---------- Speeds & feeds (Feeds!AD:AF mill + lathe blocks) ----------
  function rpmFromSfm(sfm, diaIn) { return sfm * K_SFM / diaIn; }            // AF9 / AF23
  function sfmFromRpm(rpm, diaIn) { return rpm * diaIn * K_SFM2; }           // AF10 / AF24
  function millIpr(ipm, rpm) { return ipm / rpm; }                            // AF11
  function millIpm(rpm, ipt, teeth) { return rpm * ipt * teeth; }             // AF12
  function millIpt(ipm, rpm, teeth) { return ipm / rpm / teeth; }             // AF13
  function millMrr(rpm, doc, woc, ipt, teeth) { return rpm * doc * woc * ipt * teeth; } // AF14
  function latheIpm(rpm, ipr) { return rpm * ipr; }                           // AF26
  function latheIpr(ipm, rpm) { return ipm / rpm; }                           // AF25
  function latheMrr(sfm, docIn, ipr) { return sfm * 12 * ipr * docIn; }       // AF28

  // Surface finish — STANDARD theoretical scallop geometry (Rick's bless-list ruling
  // 2026-10-22: textbook standards replace the workbook's 317500 turning constant and
  // the AF27 milling constant, which were inconsistent with each other by ~1000x).
  // The cusp height left by a round-nose tool is Rt = f^2 / (8 x nose radius); with f
  // and R in inches, x 1,000,000 gives Rt in microinches. Same formula turning and
  // milling (feed per rev in both cases). Ra is shown as the customary approximation
  // Ra ~ Rt / 4 and is labeled approximate wherever the app displays it.
  function surfaceRt(ipr, noseR) { return (ipr * ipr) / (8 * noseR) * 1000000; }
  function surfaceRa(ipr, noseR) { return surfaceRt(ipr, noseR) / 4; }        // approx: Ra ~ Rt/4
  function iprForRt(rt, noseR) { return Math.sqrt(rt * 8 * noseR / 1000000); }
  function noseRForRt(rt, ipr) { return (ipr * ipr) * 1000000 / (8 * rt); }

  // ---------- Threading (Feeds!G:Z) ----------
  function helixDeg(tpi, diaIn) {                                             // K15
    return Math.atan((1 / tpi) / (Math.PI * diaIn)) * 180 / Math.PI;
  }
  function passes60(tpi) { return Math.floor(72 / tpi + 2); }                 // J18 (M14 = 1/TPI)
  // 60 deg UN single depths — STANDARD design values (bless-list #1, Rick's ruling
  // 2026-10-22): external 0.6134 x P (ASME B1.1 design depth; = (major - max minor
  // ext) / 2 with the 1.226869P coefficient used in threadData), internal 0.54127 x P
  // (5H/8 basic profile height). Replaces the workbook chart's ~0.6312 x P external.
  function threadDepth60(tpi) {
    var p = 1 / tpi;
    return { ext: 0.6134 * p, int: 0.54127 * p };
  }
  // Stub Acme single depth — STANDARD basic thread height h = 0.3 x P, external and
  // internal alike (ASME B1.8 / Machinery's Handbook: basic minor = major - 0.6P,
  // basic pitch dia = major - 0.3P). Bless-list #4: replaces the workbook chart
  // values (e.g. 12 TPI chart 0.031/0.032 vs standard 0.025/0.025).
  function stubAcmeDepth(tpi) {
    var h = 0.3 / tpi;
    return { ext: h, int: h };
  }
  // Diminishing infeed schedule — STANDARD constant-chip-area (square-root) scheme
  // (bless-list #5): cumulative depth at pass n = total x sqrt(n / N), so every pass
  // removes an equal share of the thread's cross-sectional area and infeeds diminish.
  // Replaces the workbook's pass-1 sqrt(0.3) factor (Feeds!G33:K40).
  function infeedSchedule(totalDepth, nPasses) {
    var cumulative = [], infeeds = [], prev = 0;
    for (var n = 1; n <= nPasses; n++) {
      var cum = totalDepth * Math.sqrt(n / nPasses);
      cumulative.push(cum);
      infeeds.push(cum - prev);
      prev = cum;
    }
    return { cumulative: cumulative, infeeds: infeeds };
  }

  // ---------- Tap drills (Feeds!AD31:AI35) ----------
  function tapDrillNumbered(num, tpi) {                                       // AG33/AH33/AI33
    var major = num * 0.013 + 0.06, p = 1 / tpi;
    return { major: major, cut: major - p, form: major - p / 2, csink: major + 0.025 };
  }
  function tapDrillInch(diaIn, tpi) {                                         // AG34/AH34/AI34
    var p = 1 / tpi;
    return { major: diaIn, cut: diaIn - p, form: diaIn - p / 2, csink: diaIn + 0.025 };
  }
  function tapDrillMetric(diaMm, pitchMm) {                                   // AG35/AH35/AI35 (results in inches)
    return { major: diaMm / 25.4, cut: (diaMm - pitchMm) / 25.4, form: (diaMm - pitchMm / 2) / 25.4, csink: diaMm / 25.4 + 0.025 };
  }

  // ---------- Weights (Weights sheet) ----------
  // Densities lb/in^3 (Weights!F9-F11). Steel = STANDARD 0.284 (bless-list #9,
  // Rick's ruling 2026-10-22; replaces the workbook's 0.29 shop factor — and matches
  // the workbook's own bar factors below: 2.67 = pi/4 x 12 x 0.284). Stainless 0.29
  // and aluminum 0.10 are themselves the textbook values and stand.
  var DENSITY = { steel: 0.284, stainless: 0.29, aluminum: 0.1 };
  var ROUND_F = { steel: 2.67, stainless: 2.67, aluminum: 0.9613 };           // F14-F16 (lb per ft = D^2 * F)
  function sheetWeight(lIn, wIn, tIn, material, densities) {
    var d = (densities && densities[material]) || DENSITY[material];
    return lIn * wIn * tIn * d;
  }
  function roundWeight(diaIn, lenIn, material) {                              // F14-F16
    return diaIn * diaIn * ROUND_F[material] * (lenIn / 12);
  }
  // Bar yield (Weights!C23/C24): endAllowance 4in, kerf 0.25in/part, scrap x1.05 — editable shop settings.
  function barYield(barLenFt, partLenIn, barWeightLb, endAllowanceIn, kerfIn, scrapFactor) {
    var barIn = barLenFt * 12;
    var exact = (barIn - endAllowanceIn) / (partLenIn + kerfIn);
    return {
      partsPerBar: Math.floor(exact),
      barInches: barIn,
      weightPer1000: Math.ceil((barWeightLb / exact) * 1000 * scrapFactor)
    };
  }
  function tubingYield(barLenFt, partLenIn, endAllowanceIn, kerfIn, scrapFactor) { // C30/C31
    var barIn = barLenFt * 12;
    var exact = (barIn - endAllowanceIn) / (partLenIn + kerfIn);
    return {
      partsPerBar: Math.floor(exact),
      feetPer1000: Math.ceil((barIn / exact) * 1000 / 12) * scrapFactor
    };
  }
  function laserYield(sheetWeightLb, partsPerSheet, scrapFactor) {            // C37
    return Math.ceil((sheetWeightLb / partsPerSheet) * 1000 * scrapFactor);
  }
  function blankingYield(shearWidthIn, partsPerStrip, sheetWeightLb, sheetLenIn) { // C44/C45
    var drops = Math.floor(sheetLenIn / shearWidthIn);
    return { drops: drops, weightPer1000: Math.ceil(((1000 / drops) / partsPerStrip) * sheetWeightLb) };
  }
  // Weight-per-foot factors (Weights!B51:B59), steel
  var WEIGHT_FACTORS = {
    roundPerFt: 2.67, squarePerFt: 3.4, hexPerFt: 2.945, octagonPerFt: 2.817,
    platePerFt: 3.40, plateCircle: 0.2225,                                    // B51-B56 (plate 3.40 = textbook value, bless-list #6; workbook had 3.45)
    roundTubePerFt: function (od, wt) { return 10.68 * (od - wt) * wt; },     // B57
    squareTubePerFt: function (od, wt) { return 13.6 * (od - wt) * wt; },     // B58
    rectTubePerFt: function (sl, ss, wt) { return 13.6 * ((sl + ss) - wt) * wt; } // B59
  };

  // ---------- Chip thinning (Chip thin sheet) ----------
  // Workbook table = analytic A = sqrt(1-(1-2r)^2); B = 1/A. Validated vs all 22 table rows.
  function chipThinFactors(ratio) {
    if (ratio >= 0.5) return { a: 1, b: 1 };
    var a = Math.sqrt(1 - Math.pow(1 - 2 * ratio, 2));
    return { a: a, b: 1 / a };
  }
  function chipThin(clpt, rdoc, dia) {
    var r = rdoc / dia, f = chipThinFactors(r);
    return { ratio: r, factorA: f.a, factorB: f.b, actual: f.a * clpt, adjusted: f.b * clpt };
  }
  var CHIP_TABLE = [ // workbook D36:F57 verbatim, for validation + display
    [0.005, 0.14, 7.1], [0.01, 0.2, 5], [0.016, 0.25, 4], [0.02, 0.28, 3.6], [0.03, 0.34, 2.9],
    [0.04, 0.39, 2.6], [0.05, 0.44, 2.3], [0.06, 0.48, 2.1], [0.067, 0.5, 2], [0.08, 0.54, 1.9],
    [0.1, 0.6, 1.7], [0.12, 0.65, 1.5], [0.14, 0.7, 1.4], [0.16, 0.74, 1.35], [0.18, 0.77, 1.3],
    [0.2, 0.8, 1.25], [0.25, 0.87, 1.15], [0.3, 0.92, 1.09], [0.35, 0.96, 1.04], [0.4, 0.98, 1.02],
    [0.45, 0.99, 1.01], [0.5, 1, 1]
  ];

  // ---------- Ball nose & scallop (ball sheet) ----------
  function ballEffectiveDia(diaIn, depthIn) { return 2 * Math.sqrt(depthIn * (diaIn - depthIn)); } // E12
  function ballNose(o) {
    // o: {dia, teeth(Z), effTeeth(Ze), maxRpm, vc, depth, feedTooth, mode: 'tip'|'surfacing'}
    // Bless-list #7 (Rick's ruling 2026-10-22): BOTH modes take RPM from the true
    // geometric effective diameter at the actual depth of cut, De = 2 x sqrt(d(D-d)).
    // The workbook's surfacing mode used a flat 0.7 x D factor instead — removed.
    var De = ballEffectiveDia(o.dia, o.depth);
    var nReq = o.mode === 'tip' ? (12 / Math.PI) * o.vc / De : o.vc * K_SFM / De; // E14
    var n = Math.min(nReq, o.maxRpm);                                          // E15
    var feedRev = o.feedTooth * o.effTeeth;                                    // E18
    var feed = n * o.feedTooth * o.effTeeth;                                   // E19
    var out = { De: De, rpmRequired: nReq, rpm: n, feedRev: feedRev, feedRate: feed,
                mrr: o.depth * De * feed };                                    // E23 (w = De per E16)
    if (o.depth < o.dia / 2) {                                                 // E20-E22/E24
      out.feedAdjusted = feed / (De / o.dia);
      out.feedRevAdjusted = out.feedAdjusted / n;
      out.feedToothAdjusted = out.feedRevAdjusted / o.effTeeth;
      out.mrrAdjusted = o.depth * De * out.feedAdjusted;
    }
    return out;
  }
  function scallopStepover(ballDiaIn, heightIn) {                              // ball!J4
    var r = ballDiaIn / 2;
    return 2 * Math.sqrt(r * r - (r - heightIn) * (r - heightIn));
  }
  function scallopHeight(ballDiaIn, stepoverIn) {
    var r = ballDiaIn / 2;
    return r - Math.sqrt(r * r - (stepoverIn / 2) * (stepoverIn / 2));
  }

  // ---------- Press force (Sheet2 notes + Feeds!AD38:51) ----------
  function pressForce(lenMm, thickMm, shearMpa, stripPct) {
    var fN = lenMm * thickMm * shearMpa;                                       // F = L x S x tau
    var tons = fN / 8896.44;                                                   // US tons
    var strip = tons * stripPct / 100;                                         // Sheet2: 10-20%
    var eject = tons * 0.10;                                                   // Sheet2: 10%
    return { forceN: fN, forceKn: fN / 1000, cuttingTons: tons, strippingTons: strip,
             ejectionTons: eject, totalTons: tons + strip, springDeflectionMm: null };
  }
  function springDeflection(thickMm, multiplier) {                             // Sheet2: Y = (3 to 4)(t + 2)
    return multiplier * (thickMm + 2);
  }
  var SHEAR_PCT_OF_TENSILE = { aluminum: 0.5, coldRolledSteel: 0.8, stainless: 0.9 }; // Sheet2 A33

  // ---------- Conversions & hardness (Feeds!A7:F72) ----------
  var CONV = {
    hpToKw: function (x) { return x * 0.745699; },                             // D37
    kwToHp: function (x) { return x / 0.745699; },                             // D40
    ftToM: function (x) { return x * 0.3048; },                                // D43
    mToFt: function (x) { return x / 0.3048; },                                // D46
    inToM: function (x) { return x * 0.0254; },                                // D49
    mToIn: function (x) { return x / 0.0254; },                                // D52
    fToC: function (x) { return (x - 32) * 5 / 9; },                           // D61
    cToF: function (x) { return x * 9 / 5 + 32; },                             // D64
    mmToIn: function (x) { return x / 25.4; },
    inToMm: function (x) { return x * 25.4; }
  };
  // Hardness conversion — ASTM E140 Table 1 (non-austenitic steels), HRC <-> Brinell
  // with a 10-mm CARBIDE ball at 3000 kgf (HBW). Bless-list #10 (Rick's ruling
  // 2026-10-22): the standard table replaces the workbook's reverse-engineered
  // piecewise fit (Feeds!D55/D58), which drifted off the table at the top end.
  // Anchors: HRC 32 -> 301 HBW, HRC 40 -> 371 HBW (E140 Table 1).
  // HBW values for HRC 60-65 are printed in E140 in parentheses (beyond the range
  // recommended for Brinell testing in ASTM E10) and are carried here as printed.
  // Conversions interpolate linearly between table rows; outside HRC 20-65 (HBW
  // 226-739) the result is null — E140 values are not extrapolated.
  var E140_HRC_HBW = [
    [20, 226], [21, 231], [22, 237], [23, 243], [24, 247], [25, 253], [26, 258],
    [27, 264], [28, 271], [29, 279], [30, 286], [31, 294], [32, 301], [33, 311],
    [34, 319], [35, 327], [36, 336], [37, 344], [38, 353], [39, 362], [40, 371],
    [41, 381], [42, 390], [43, 400], [44, 409], [45, 421], [46, 432], [47, 443],
    [48, 455], [49, 469], [50, 481], [51, 496], [52, 512], [53, 525], [54, 543],
    [55, 560], [56, 577], [57, 595], [58, 615], [59, 634], [60, 654], [61, 670],
    [62, 688], [63, 705], [64, 722], [65, 739]
  ];
  function interpTable(table, x, xi, yi) {
    if (x < table[0][xi] || x > table[table.length - 1][xi]) return null;
    for (var i = 0; i < table.length; i++) {
      if (x === table[i][xi]) return table[i][yi];
      if (i > 0 && x < table[i][xi]) {
        var x0 = table[i - 1][xi], x1 = table[i][xi], y0 = table[i - 1][yi], y1 = table[i][yi];
        return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
      }
    }
    return null;
  }
  function rockwellCToBrinell(hrc) { return interpTable(E140_HRC_HBW, hrc, 0, 1); }
  function brinellToRockwellC(hb) { return interpTable(E140_HRC_HBW, hb, 1, 0); }
  function knurlBlankDia(diaIn, knurlPitchTpi) {                               // AJ28
    return Math.round(Math.floor(diaIn * knurlPitchTpi * Math.PI) / knurlPitchTpi / Math.PI * 1000) / 1000;
  }

  // ---------- Tool life (Feeds!G55:K71) ----------
  function partsPerInsert(timeInCutMinPerPart) { return Math.ceil(15 / timeInCutMinPerPart); } // K57
  // Tool-life / SFM adjustment — bless-list #8 (Rick's ruling 2026-10-22).
  // SCHEME IMPLEMENTED: Taylor's tool-life equation V x T^n = C — the standard
  // tool-life relationship presented in Machinery's Handbook (speeds/feeds
  // methodology and Machining Econometrics) — solved for speed at the wanted life:
  //   V_T = V_15 x (15 / T)^n,  with n = 0.25, the standard handbook exponent for
  // carbide turning (handbook range ~0.2-0.3; HSS runs ~0.1-0.15, ceramics ~0.4+).
  // The 15-minute base life is retained from the workbook layout (Feeds!G55:K71).
  // This replaces the workbook's multiplier table (5 min x1.15 ... 60 min x0.75),
  // which Rick reverse-engineered from known-good results. (Machinery's Handbook's
  // printed factor tables — e.g. milling Table 15e — are operation- and feed-band
  // specific to their own speed tables and do not transfer to this general turning
  // adjuster; the Taylor relation is the handbook standard that applies.)
  // Resulting factors: 5 min x1.316, 10 x1.107, 15 x1.000, 20 x0.931, 25 x0.880,
  // 30 x0.841, 45 x0.760, 60 x0.707.
  var SFM_BASE_LIFE_MIN = 15;
  var TAYLOR_N_CARBIDE = 0.25;
  var SFM_LIVES = [5, 10, 15, 20, 25, 30, 45, 60];
  function sfmLifeFactor(targetMin) {
    return Math.pow(SFM_BASE_LIFE_MIN / targetMin, TAYLOR_N_CARBIDE);
  }
  function sfmForLife(baseSfmAt15, targetMin) {
    if (!(targetMin > 0)) return null;
    return baseSfmAt15 * sfmLifeFactor(targetMin);
  }
  // Milling time-in-cut fraction (Feeds!K61): engagement arc fraction of each revolution.
  function millingCutFraction(toolDia, woc, timeInCutMin) {
    var ang = Math.asin((2 * woc - toolDia) / toolDia) * 180 / Math.PI;       // U46/V46, U48/V48
    var frac = woc >= toolDia / 2 ? (90 + ang) / 360 : (90 - (-ang)) / 360;
    return frac * timeInCutMin;
  }

  // ---------- Gap tools (added per gap audit; validated vs published values) ----------
  function parseFraction(str) {                       // "1 1/2", "1-1/2", "3/16", "0.1875"
    if (typeof str === 'number') return str;
    str = String(str).trim();
    if (!str) return NaN;
    var m = str.match(/^(\d+)\s*[- ]\s*(\d+)\s*\/\s*(\d+)$/);
    if (m) return (+m[1]) + (+m[2]) / (+m[3]);
    var f = str.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (f) return (+f[1]) / (+f[2]);
    var v = parseFloat(str);
    return isNaN(v) ? NaN : v;
  }
  function toFraction(dec, denom) {                   // nearest fraction, reduced
    denom = denom || 64;
    var sign = dec < 0 ? -1 : 1; dec = Math.abs(dec);
    var whole = Math.floor(dec + 1e-12);
    var num = Math.round((dec - whole) * denom), den = denom;
    if (num === den) return { whole: sign * (whole + 1), num: 0, den: 1, text: String(sign * (whole + 1)) };
    if (num === 0) return { whole: sign * whole, num: 0, den: 1, text: String(sign * whole) };
    var a = num, b = den; while (b) { var t = a % b; a = b; b = t; }
    num /= a; den /= a;
    return { whole: sign * whole, num: num, den: den,
             text: (sign < 0 ? '-' : '') + (whole ? whole + ' ' : '') + num + '/' + den };
  }
  function rightTriangle(k) {                         // any two of a,b,c(hyp),A(opp a),B — degrees
    var a = k.a, b = k.b, c = k.c, A = k.A, B = k.B, R = Math.PI / 180;
    if (A != null && B == null) B = 90 - A;
    if (B != null && A == null) A = 90 - B;
    if (a != null && b != null) { c = Math.hypot(a, b); A = Math.atan2(a, b) / R; B = 90 - A; }
    else if (a != null && c != null) { b = Math.sqrt(c * c - a * a); A = Math.asin(a / c) / R; B = 90 - A; }
    else if (b != null && c != null) { a = Math.sqrt(c * c - b * b); B = Math.asin(b / c) / R; A = 90 - B; }
    else if (c != null && A != null) { a = c * Math.sin(A * R); b = c * Math.cos(A * R); B = 90 - A; }
    else if (a != null && A != null) { c = a / Math.sin(A * R); b = a / Math.tan(A * R); B = 90 - A; }
    else if (b != null && A != null) { a = b * Math.tan(A * R); c = b / Math.cos(A * R); B = 90 - A; }
    else if (a != null && B != null) { c = a / Math.cos(B * R); b = a * Math.tan(B * R); A = 90 - B; }
    else if (b != null && B != null) { a = b / Math.tan(B * R); c = b / Math.sin(B * R); A = 90 - B; }
    else if (c != null && B != null) { b = c * Math.sin(B * R); a = c * Math.cos(B * R); A = 90 - B; }
    else return null;
    return { a: a, b: b, c: c, A: A, B: B };
  }
  function boltCircle(dia, holes, startDeg) {         // X/Y from center, CCW from 3 o'clock
    startDeg = startDeg || 0;
    var R = dia / 2, out = [], i, t;
    for (i = 0; i < holes; i++) {
      t = (startDeg + i * 360 / holes) * Math.PI / 180;
      out.push({ hole: i + 1, angle: startDeg + i * 360 / holes, x: R * Math.cos(t), y: R * Math.sin(t) });
    }
    return out;
  }
  function threadData(major, pitch) {                 // 60 deg UN & ISO metric basic profile
    return { pitch: pitch,
      pitchDia: major - 0.649519 * pitch,
      minorInt: major - 1.082532 * pitch,
      minorExt: major - 1.226869 * pitch,
      tapDrillFull: major - pitch };
  }
  function tapDrillForPct(major, pitch, pct) {        // % on 0.649519P depth basis (chart standard)
    return major - 1.299038 * pitch * pct / 100;
  }
  function pctForDrill(major, pitch, drill) {
    return (major - drill) / (1.299038 * pitch) * 100;
  }
  function threeWire(pitch, wire) {                   // M = PD + 3W - 0.8660254P (60 deg)
    var C = 3 * wire - 0.8660254 * pitch;
    return { bestWire: 0.577350 * pitch, constant: C,
      mowFromPd: function (pd) { return pd + C; },
      pdFromMow: function (m) { return m - C; } };
  }
  function drillPointDepth(dia, pointAngleDeg) {
    pointAngleDeg = pointAngleDeg || 118;
    return (dia / 2) / Math.tan((pointAngleDeg / 2) * Math.PI / 180);
  }
  function chamferDepth(diaFrom, diaTo, includedDeg) {
    return ((diaTo - diaFrom) / 2) / Math.tan((includedDeg / 2) * Math.PI / 180);
  }
  function sineStack(barLength, angleDeg) { return barLength * Math.sin(angleDeg * Math.PI / 180); }
  function sineAngle(barLength, stack) { return Math.asin(stack / barLength) / (Math.PI / 180); }
  function boltTorqueInLb(K, diaIn, clampLb) { return K * diaIn * clampLb; }   // T = K*D*F
  function rzFromRa(raMicron) { return 4.5 * raMicron; }    // APPROXIMATE shop conversion
  function raFromRz(rzMicron) { return rzMicron / 4.5; }    // APPROXIMATE shop conversion

  // ---------- Gears (added 2026-10-27 on Rick's order; standard full-depth
  // involute relations, Machinery's Handbook): addendum = 1/DP (or 1 module),
  // dedendum = 1.25/DP, whole depth = 2.25/DP, circular pitch = pi/DP. ----------
  function gearFromDP(teeth, dp) {
    var pd = teeth / dp;
    return { teeth: teeth, dp: dp, module: 25.4 / dp, pitchDia: pd,
      outsideDia: (teeth + 2) / dp, rootDia: (teeth - 2.5) / dp,
      circularPitch: Math.PI / dp, addendum: 1 / dp, dedendum: 1.25 / dp,
      wholeDepth: 2.25 / dp, toothThickness: Math.PI / (2 * dp) };
  }
  function gearFromModule(teeth, mod) {
    var pd = teeth * mod;
    return { teeth: teeth, module: mod, dp: 25.4 / mod, pitchDia: pd,
      outsideDia: (teeth + 2) * mod, rootDia: (teeth - 2.5) * mod,
      circularPitch: Math.PI * mod, addendum: mod, dedendum: 1.25 * mod,
      wholeDepth: 2.25 * mod, toothThickness: Math.PI * mod / 2 };
  }
  function gearPair(n1, n2, dpOrModule, isModule) {
    var g1 = isModule ? gearFromModule(n1, dpOrModule) : gearFromDP(n1, dpOrModule);
    var g2 = isModule ? gearFromModule(n2, dpOrModule) : gearFromDP(n2, dpOrModule);
    return { g1: g1, g2: g2, centerDistance: (g1.pitchDia + g2.pitchDia) / 2,
      ratio: n2 / n1, rpmOutPerIn: n1 / n2 };   // multiply input RPM by rpmOutPerIn
  }
  function gearDpFromOD(teeth, odIn) { return (teeth + 2) / odIn; }        // DP = (N+2)/OD
  function gearModuleFromOD(teeth, odMm) { return odMm / (teeth + 2); }    // m = OD/(N+2)

  // ---------- Taper solver (added 2026-10-27) ----------
  function taperFromDias(dBig, dSmall, lenIn) {
    var diff = Math.abs(dBig - dSmall);
    var perInch = diff / lenIn;
    var half = Math.atan(diff / (2 * lenIn)) * 180 / Math.PI;
    return { diff: diff, perInch: perInch, perFoot: perInch * 12,
      halfAngleDeg: half, includedDeg: 2 * half };
  }
  function taperOtherDia(dKnown, perFoot, lenIn, grows) {
    var diff = perFoot / 12 * lenIn;
    return grows ? dKnown + diff : dKnown - diff;
  }

  // ---------- ISO 286 fits & tolerances (added 2026-10-27) ----------
  // IT grades are the standard tabulated values (microns) by size step.
  // Fundamental deviations for shafts f, g, h, js, k, m, n, p use the ISO 286-2
  // formulas with D = geometric mean of the size step; each was checked against
  // published limit tables at several sizes (e.g. 25 g6 = -7/-20, 25 p6 =
  // +35/+22, 50 n6 = +33/+17, 10 k6 = +10/+1). Letters whose tabulated values
  // the formulas do NOT reproduce (c, d, e) are deliberately not offered.
  var ISO_STEPS = [ // [over, up to] mm
    [0, 3], [3, 6], [6, 10], [10, 18], [18, 30], [30, 50], [50, 80],
    [80, 120], [120, 180], [180, 250], [250, 315], [315, 400], [400, 500]
  ];
  var ISO_IT = { // microns, per step above
    5:  [4, 5, 6, 8, 9, 11, 13, 15, 18, 20, 23, 25, 27],
    6:  [6, 8, 9, 11, 13, 16, 19, 22, 25, 29, 32, 36, 40],
    7:  [10, 12, 15, 18, 21, 25, 30, 35, 40, 46, 52, 57, 63],
    8:  [14, 18, 22, 27, 33, 39, 46, 54, 63, 72, 81, 89, 97],
    9:  [25, 30, 36, 43, 52, 62, 74, 87, 100, 115, 130, 140, 155],
    10: [40, 48, 58, 70, 84, 100, 120, 140, 160, 185, 210, 230, 250],
    11: [60, 75, 90, 110, 130, 160, 190, 220, 250, 290, 320, 360, 400]
  };
  var ISO_P_ADD = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5]; // p: ei = IT7 + addend
  function isoStep(diaMm) {
    for (var i = 0; i < ISO_STEPS.length; i++) {
      if (diaMm <= ISO_STEPS[i][1] && (i === 0 || diaMm > ISO_STEPS[i][0])) return i;
    }
    return -1;
  }
  function isoDg(stepIdx) { // geometric mean diameter of the step (mm)
    var lo = ISO_STEPS[stepIdx][0], hi = ISO_STEPS[stepIdx][1];
    return Math.sqrt((lo === 0 ? 1 : lo) * hi);
  }
  function isoIT(stepIdx, grade) { return ISO_IT[grade] ? ISO_IT[grade][stepIdx] : null; }
  // Returns {es, ei} in microns for a shaft letter+grade at a size step.
  function isoShaftDev(letter, grade, stepIdx) {
    var D = isoDg(stepIdx), IT = isoIT(stepIdx, grade), es, ei;
    switch (letter) {
      case 'f': es = -Math.round(5.5 * Math.pow(D, 0.41)); ei = es - IT; break;
      case 'g': es = -Math.round(2.5 * Math.pow(D, 0.34)); ei = es - IT; break;
      case 'h': es = 0; ei = -IT; break;
      case 'js': es = IT / 2; ei = -IT / 2; break;
      case 'k': ei = (grade >= 4 && grade <= 7) ? Math.round(0.6 * Math.cbrt(D)) : 0; es = ei + IT; break;
      case 'm': ei = isoIT(stepIdx, 7) - isoIT(stepIdx, 6); es = ei + IT; break;
      case 'n': ei = Math.round(5 * Math.pow(D, 0.34)); es = ei + IT; break;
      case 'p': ei = isoIT(stepIdx, 7) + ISO_P_ADD[stepIdx]; es = ei + IT; break;
      default: return null;
    }
    return { es: es, ei: ei };
  }
  function isoHoleDev(letter, grade, stepIdx) {
    var IT = isoIT(stepIdx, grade);
    if (letter === 'H') return { ES: IT, EI: 0 };
    if (letter === 'JS') return { ES: IT / 2, EI: -IT / 2 };
    return null;
  }
  // Full fit: diaMm nominal, hole {letter, grade}, shaft {letter, grade}.
  // Limits in mm; clearances in microns (negative = interference).
  function isoFit(diaMm, holeLetter, holeGrade, shaftLetter, shaftGrade) {
    var si = isoStep(diaMm);
    if (si < 0) return null;
    var hole = isoHoleDev(holeLetter, holeGrade, si);
    var shaft = isoShaftDev(shaftLetter.toLowerCase(), shaftGrade, si);
    if (!hole || !shaft) return null;
    var maxClr = hole.ES - shaft.ei, minClr = hole.EI - shaft.es;
    return {
      step: ISO_STEPS[si],
      hole: { ES: hole.ES, EI: hole.EI, max: diaMm + hole.ES / 1000, min: diaMm + hole.EI / 1000 },
      shaft: { es: shaft.es, ei: shaft.ei, max: diaMm + shaft.es / 1000, min: diaMm + shaft.ei / 1000 },
      maxClearance: maxClr, minClearance: minClr,
      type: minClr > 0 ? 'Clearance' : (maxClr < 0 ? 'Interference' : 'Transition')
    };
  }

  // ---------- ISO 1832 indexable-insert designation decoder (added 2026-10-27) ----------
  var INSERT_SHAPES = {
    H: 'Hexagon, 120° corners', O: 'Octagon, 135° corners', P: 'Pentagon, 108° corners',
    S: 'Square, 90° corners', T: 'Triangle, 60° corners', C: 'Diamond, 80° corners',
    D: 'Diamond, 55° corners', E: 'Diamond, 75° corners', F: 'Diamond, 50° corners',
    L: 'Rectangle, 90° corners', A: 'Parallelogram, 85° corners', B: 'Parallelogram, 82° corners',
    K: 'Parallelogram, 55° corners', M: 'Diamond, 86° corners', V: 'Diamond, 35° corners',
    W: 'Trigon, 80° corners', R: 'Round'
  };
  var INSERT_CLEARANCE = { A: '3°', B: '5°', C: '7°', D: '15°', E: '20°', F: '25°', G: '30°',
    N: '0° (negative insert — double-sided)', P: '11°', O: 'Other / special' };
  var INSERT_TOLERANCE = { // inscribed-circle tolerance, mm (size-dependent classes marked *)
    A: '±0.005 mm (precision)', F: '±0.005 mm (precision)', C: '±0.013 mm', H: '±0.013 mm',
    E: '±0.025 mm', G: '±0.025 mm (ground)', J: '±0.005–0.05 mm *', K: '±0.013–0.05 mm *',
    L: '±0.025–0.05 mm *', M: '±0.05–0.15 mm * (standard molded)', N: '±0.05–0.15 mm *',
    P: '±0.05–0.15 mm *', T: '±0.005–0.05 mm *', U: '±0.08–0.25 mm * (utility)'
  };
  var INSERT_TYPES = {
    A: 'No fixing hole, no chipbreaker', B: 'No fixing hole, chipbreaker one side',
    C: 'No fixing hole, chipbreaker both sides', G: 'Cylindrical hole, no chipbreaker',
    H: 'Hole + countersink one side (70–90°), no chipbreaker',
    J: 'Hole + countersink both sides (70–90°), no chipbreaker',
    M: 'Cylindrical hole, chipbreaker one side', N: 'Cylindrical hole, chipbreaker both sides',
    Q: 'Hole + countersink both sides, chipbreaker one side',
    T: 'Hole + countersink one side, chipbreaker one side',
    U: 'Hole + countersink both sides, chipbreaker both sides',
    W: 'Hole + countersink one side (40–60°), no chipbreaker', X: 'Special design'
  };
  var INSERT_IC_METRIC = { // size code -> inscribed circle (mm), by shape family
    C: { '06': 6.35, '09': 9.525, '12': 12.7, '16': 15.875, '19': 19.05, '25': 25.4 },
    D: { '07': 6.35, '11': 9.525, '15': 12.7 },
    S: { '06': 6.35, '09': 9.525, '12': 12.7, '16': 15.875, '19': 19.05, '25': 25.4 },
    T: { '11': 6.35, '16': 9.525, '22': 12.7, '27': 15.875, '33': 19.05 },
    V: { '11': 6.35, '16': 9.525, '22': 12.7 },
    W: { '06': 9.525, '08': 12.7, '10': 15.875 },
    K: { '16': 9.525 }
  };
  var INSERT_THICK_METRIC = { '01': 1.59, '02': 2.38, '03': 3.18, 'T3': 3.18, '04': 4.76,
    '05': 5.56, '06': 6.35, '07': 7.94, '09': 9.52, '12': 12.7 };
  // system: 'inch' (size/thickness/radius in 1/8, 1/16, 1/32 units) or 'metric' (ISO codes).
  function decodeInsert(code, system) {
    var s = String(code || '').toUpperCase().replace(/[\s-]/g, '');
    if (s.length < 5) return { error: 'Too short — a full designation looks like CNMG432 or CNMG120408.' };
    var shape = s[0], clr = s[1], tol = s[2], typ = s[3], rest = s.slice(4);
    if (!INSERT_SHAPES[shape]) return { error: 'First letter "' + shape + '" is not an ISO insert shape.' };
    var parts = [
      { pos: '1 — Shape', code: shape, meaning: INSERT_SHAPES[shape] },
      { pos: '2 — Clearance angle', code: clr, meaning: INSERT_CLEARANCE[clr] || 'Per ISO 1832 table' },
      { pos: '3 — Tolerance class', code: tol, meaning: (INSERT_TOLERANCE[tol] || 'Per ISO 1832 table') + (INSERT_TOLERANCE[tol] && INSERT_TOLERANCE[tol].includes('*') ? ' — range depends on insert size' : ' on the inscribed circle') },
      { pos: '4 — Type (hole / chipbreaker)', code: typ, meaning: INSERT_TYPES[typ] || 'Per ISO 1832 type table' }
    ];
    var sizeCode, thickCode, radCode, tail = '';
    if (system === 'metric') {
      if (rest.length < 6) return { error: 'Metric designations carry 6 size digits after the letters, e.g. CNMG120408.' };
      sizeCode = rest.slice(0, 2);
      thickCode = rest.slice(2, 4);
      radCode = rest.slice(4, 6);
      tail = rest.slice(6);
      var ic = shape === 'R' ? parseFloat(sizeCode) : (INSERT_IC_METRIC[shape] || {})[sizeCode];
      parts.push({ pos: '5 — Size', code: sizeCode, meaning: ic != null && !isNaN(ic)
        ? 'Inscribed circle ≈ ' + ic + ' mm (' + (ic / 25.4).toFixed(3) + ' in)'
        : 'Size code ' + sizeCode + ' — inscribed circle per the ISO size table for this shape' });
      var th = INSERT_THICK_METRIC[thickCode];
      parts.push({ pos: '6 — Thickness', code: thickCode, meaning: th != null ? th + ' mm' : 'Thickness code ' + thickCode + ' — per ISO 1832 table' });
      parts.push({ pos: '7 — Corner radius', code: radCode, meaning: radCode === '00' ? 'Sharp corner (≈ 0 mm)'
        : radCode === 'MO' ? 'Full round (tumbled) edge' : (parseInt(radCode, 10) / 10) + ' mm' });
    } else {
      if (!/^\d{3}/.test(rest)) return { error: 'Inch designations carry 3 size digits after the letters, e.g. CNMG432. Metric codes (CNMG120408) — switch to Metric.' };
      sizeCode = rest[0]; thickCode = rest[1]; radCode = rest[2];
      tail = rest.slice(3);
      parts.push({ pos: '5 — Size', code: sizeCode, meaning: 'Inscribed circle ' + sizeCode + '/8 in = ' + (sizeCode * 0.125).toFixed(3) + ' in' });
      parts.push({ pos: '6 — Thickness', code: thickCode, meaning: (thickCode * 0.0625).toFixed(4) + ' in (' + thickCode + '/16)' });
      parts.push({ pos: '7 — Corner radius', code: radCode, meaning: radCode === '0' ? 'Sharp corner (≈ 0 in)' : (radCode * 0.03125).toFixed(4) + ' in (' + radCode + '/32)' });
    }
    if (tail) {
      var hand = { R: 'Right-hand', L: 'Left-hand', N: 'Neutral (non-handed)' }[tail[0]];
      if (hand && tail.length >= 1) {
        parts.push({ pos: '8 — Hand', code: tail[0], meaning: hand });
        tail = tail.slice(1);
      }
      if (tail) parts.push({ pos: 'Maker codes', code: tail, meaning: 'Edge prep / chipbreaker codes — specific to the insert maker' });
    }
    return { parts: parts };
  }

  // ---------- Welding (added 2026-10-27 on Rick's order) ----------
  // Fillet throat: exact geometry for an equal-leg fillet with a flat face
  // (throat = leg x cos 45°). Heat input: gross arc energy
  // H = V x A x 60 / travel speed — no arc-efficiency factor applied.
  // TIG amps: the shop rule of thumb (~1 A per 0.001 in of thickness for
  // steel), presented as the rule of thumb it is. Electrode decode: AWS A5.1
  // carbon-steel stick (SMAW) classifications.
  var FILLET_K = Math.SQRT1_2;   // 0.70710678…
  function filletThroat(leg) { return leg * FILLET_K; }
  function filletLeg(throat) { return throat / FILLET_K; }
  function heatInput(volts, amps, speed, speedUnit) {
    var perMin = volts * amps * 60;
    var jPerIn = speedUnit === 'mm' ? perMin / (speed / 25.4) : perMin / speed;
    return { jPerIn: jPerIn, kjPerIn: jPerIn / 1000, jPerMm: jPerIn / 25.4, kjPerMm: jPerIn / 25400 };
  }
  var TIG_FACTORS = { steel: 1.0, stainless: 0.85, aluminum: 1.25 };
  function tigAmps(thicknessIn, material) {
    var f = TIG_FACTORS[material];
    if (f == null) return null;
    var a = thicknessIn * 1000 * f;   // amps at ~1 A per 0.001 in, scaled by factor
    return { amps: a, low: a * 0.9, high: a * 1.1, factor: f };
  }
  var ELECTRODE_POSITIONS = {
    '1': 'All positions — flat, horizontal, vertical, and overhead',
    '2': 'Flat position and horizontal fillets only',
    '4': 'All positions including vertical-down (flat, horizontal, overhead, vertical down)'
  };
  var ELECTRODE_COATINGS = {
    '0': ['High cellulose sodium', 'DC+ only — a deep, digging, fast-freeze arc'],
    '1': ['High cellulose potassium', 'AC or DC+ — a deep, digging arc'],
    '2': ['High titania sodium', 'AC or DC- — a soft arc with shallow penetration'],
    '3': ['High titania potassium', 'AC or DC — a soft, quiet arc; the slag lifts off easily'],
    '4': ['Iron powder titania', 'AC or DC — smooth beads at a higher deposition rate'],
    '5': ['Low-hydrogen sodium', 'DC+ only — code-quality weld metal from a dry rod'],
    '6': ['Low-hydrogen potassium', 'AC or DC+ — code-quality weld metal from a dry rod'],
    '7': ['Iron powder iron oxide', 'AC or DC — flat and horizontal work at high deposition'],
    '8': ['Low-hydrogen potassium with iron powder', 'AC or DC+ — code-quality weld metal with higher deposition']
  };
  function decodeElectrode(input) {
    var s = String(input == null ? '' : input).toUpperCase().replace(/\s+/g, '');
    if (!s) return { error: 'Type an electrode classification, e.g. 7018 or E6010.' };
    if (s[0] === 'E') s = s.slice(1);
    var m = s.match(/^(\d{4,5})(.*)$/);
    if (!m) return { error: 'Stick classifications carry 4 or 5 digits after the E, e.g. E7018 or E11018.' };
    var digits = m[1], suffix = m[2] || '';
    var tensile = digits.slice(0, digits.length - 2);
    var posDigit = digits[digits.length - 2], coatDigit = digits[digits.length - 1];
    var pos = ELECTRODE_POSITIONS[posDigit];
    if (!pos) return { error: 'Position digit "' + posDigit + '" is not used in AWS A5.1 — it is 1 (all positions), 2 (flat / horizontal fillets), or 4 (incl. vertical-down).' };
    var coat = ELECTRODE_COATINGS[coatDigit];
    if (!coat) return { error: 'Coating digit "' + coatDigit + '" is not an AWS A5.1 usability class (0-8).' };
    var parts = [
      { pos: '1 — E', code: 'E', meaning: 'Stick (SMAW) electrode — AWS A5.1 carbon-steel classification' },
      { pos: '2 — Strength', code: tensile, meaning: 'Weld-metal tensile strength: ' + tensile + ' ksi minimum (' + (parseInt(tensile, 10) * 1000).toLocaleString('en-US') + ' psi) as welded' },
      { pos: '3 — Position', code: posDigit, meaning: pos },
      { pos: '4 — Coating', code: coatDigit, meaning: coat[0] + '. Runs ' + coat[1] + '.' }
    ];
    if (suffix) {
      parts.push({ pos: 'Suffix', code: suffix, meaning: 'Supplemental designators — e.g. -1 (improved toughness), H4 / H8 / H16 (diffusible-hydrogen limit, ml per 100 g), R (moisture-resistant coating). The rod maker\'s datasheet gives the exact ones.' });
    }
    return { parts: parts };
  }

  // ---------- Safe expression parser (My Shop custom calculators; NO eval) ----------
  var FUNCS = {
    sqrt: Math.sqrt, abs: Math.abs, sin: function (x) { return Math.sin(x * Math.PI / 180); },
    cos: function (x) { return Math.cos(x * Math.PI / 180); },
    tan: function (x) { return Math.tan(x * Math.PI / 180); },
    asin: function (x) { return Math.asin(x) * 180 / Math.PI; },
    acos: function (x) { return Math.acos(x) * 180 / Math.PI; },
    atan: function (x) { return Math.atan(x) * 180 / Math.PI; },
    log: Math.log10, ln: Math.log, exp: Math.exp, round: Math.round,
    floor: Math.floor, ceil: Math.ceil, min: Math.min, max: Math.max, pow: Math.pow
  };
  function tokenize(src) {
    var tokens = [], i = 0;
    while (i < src.length) {
      var ch = src[i];
      if (ch === ' ' || ch === '\t') { i++; continue; }
      if (/[0-9.]/.test(ch)) {
        var num = '';
        while (i < src.length && /[0-9.]/.test(src[i])) num += src[i++];
        if (!/^\d*\.?\d+$/.test(num)) throw new Error('Bad number: ' + num);
        tokens.push({ t: 'num', v: parseFloat(num) });
      } else if (/[A-Za-z_]/.test(ch)) {
        var id = '';
        while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) id += src[i++];
        tokens.push({ t: 'id', v: id });
      } else if ('+-*/^(),'.indexOf(ch) >= 0) {
        tokens.push({ t: ch, v: ch }); i++;
      } else {
        throw new Error('Unexpected character: ' + ch);
      }
    }
    return tokens;
  }
  function parseExpression(src) {
    var tokens = tokenize(src), pos = 0;
    function peek() { return tokens[pos]; }
    function next() { return tokens[pos++]; }
    function parseExpr() {
      var node = parseTerm();
      while (peek() && (peek().t === '+' || peek().t === '-')) {
        var op = next().t;
        node = { op: op, l: node, r: parseTerm() };
      }
      return node;
    }
    function parseTerm() {
      var node = parseFactor();
      while (peek() && (peek().t === '*' || peek().t === '/')) {
        var op = next().t;
        node = { op: op, l: node, r: parseFactor() };
      }
      return node;
    }
    function parseFactor() {
      var node = parseUnary();
      if (peek() && peek().t === '^') { next(); node = { op: '^', l: node, r: parseFactor() }; }
      return node;
    }
    function parseUnary() {
      if (peek() && peek().t === '-') { next(); return { op: 'neg', l: parseUnary() }; }
      if (peek() && peek().t === '+') { next(); return parseUnary(); }
      return parseAtom();
    }
    function parseAtom() {
      var tk = next();
      if (!tk) throw new Error('Unexpected end of formula');
      if (tk.t === 'num') return { num: tk.v };
      if (tk.t === '(') {
        var e = parseExpr();
        if (!next() || tokens[pos - 1].t !== ')') throw new Error('Missing closing parenthesis');
        return e;
      }
      if (tk.t === 'id') {
        if (peek() && peek().t === '(') {
          next();
          var args = [];
          if (!(peek() && peek().t === ')')) {
            args.push(parseExpr());
            while (peek() && peek().t === ',') { next(); args.push(parseExpr()); }
          }
          var close = next();
          if (!close || close.t !== ')') throw new Error('Missing ) after function ' + tk.v);
          if (!FUNCS[tk.v.toLowerCase()]) throw new Error('Unknown function: ' + tk.v);
          return { fn: tk.v.toLowerCase(), args: args };
        }
        return { var: tk.v };
      }
      throw new Error('Unexpected token: ' + tk.v);
    }
    var ast = parseExpr();
    if (pos !== tokens.length) throw new Error('Trailing characters in formula');
    return ast;
  }
  function evalAst(node, vars) {
    if (node.num !== undefined) return node.num;
    if (node.var !== undefined) {
      var name = node.var.toLowerCase();
      if (name === 'pi') return Math.PI;
      if (name === 'e') return Math.E;
      for (var k in vars) if (k.toLowerCase() === name) return vars[k];
      throw new Error('Unknown input: ' + node.var);
    }
    if (node.fn) return FUNCS[node.fn].apply(null, node.args.map(function (a) { return evalAst(a, vars); }));
    if (node.op === 'neg') return -evalAst(node.l, vars);
    var l = evalAst(node.l, vars), r = evalAst(node.r, vars);
    switch (node.op) {
      case '+': return l + r;
      case '-': return l - r;
      case '*': return l * r;
      case '/': if (r === 0) throw new Error('Division by zero'); return l / r;
      case '^': return Math.pow(l, r);
    }
    throw new Error('Bad expression');
  }
  function evaluateFormula(src, vars) { return evalAst(parseExpression(src), vars || {}); }

  var api = {
    K_SFM: K_SFM, K_SFM2: K_SFM2,
    rpmFromSfm: rpmFromSfm, sfmFromRpm: sfmFromRpm,
    millIpr: millIpr, millIpm: millIpm, millIpt: millIpt, millMrr: millMrr,
    latheIpm: latheIpm, latheIpr: latheIpr, latheMrr: latheMrr,
    surfaceRt: surfaceRt, surfaceRa: surfaceRa, iprForRt: iprForRt, noseRForRt: noseRForRt,
    helixDeg: helixDeg, passes60: passes60, infeedSchedule: infeedSchedule,
    threadDepth60: threadDepth60, stubAcmeDepth: stubAcmeDepth,
    tapDrillNumbered: tapDrillNumbered, tapDrillInch: tapDrillInch, tapDrillMetric: tapDrillMetric,
    DENSITY: DENSITY, ROUND_F: ROUND_F, sheetWeight: sheetWeight, roundWeight: roundWeight,
    barYield: barYield, tubingYield: tubingYield, laserYield: laserYield, blankingYield: blankingYield,
    WEIGHT_FACTORS: WEIGHT_FACTORS,
    chipThinFactors: chipThinFactors, chipThin: chipThin, CHIP_TABLE: CHIP_TABLE,
    ballEffectiveDia: ballEffectiveDia, ballNose: ballNose,
    scallopStepover: scallopStepover, scallopHeight: scallopHeight,
    pressForce: pressForce, springDeflection: springDeflection, SHEAR_PCT_OF_TENSILE: SHEAR_PCT_OF_TENSILE,
    CONV: CONV, brinellToRockwellC: brinellToRockwellC, rockwellCToBrinell: rockwellCToBrinell,
    E140_HRC_HBW: E140_HRC_HBW,
    knurlBlankDia: knurlBlankDia,
    partsPerInsert: partsPerInsert, SFM_LIVES: SFM_LIVES, SFM_BASE_LIFE_MIN: SFM_BASE_LIFE_MIN,
    TAYLOR_N_CARBIDE: TAYLOR_N_CARBIDE, sfmLifeFactor: sfmLifeFactor, sfmForLife: sfmForLife,
    millingCutFraction: millingCutFraction,
    evaluateFormula: evaluateFormula, parseExpression: parseExpression,
    parseFraction: parseFraction, toFraction: toFraction, rightTriangle: rightTriangle,
    boltCircle: boltCircle, threadData: threadData, tapDrillForPct: tapDrillForPct,
    pctForDrill: pctForDrill, threeWire: threeWire, drillPointDepth: drillPointDepth,
    chamferDepth: chamferDepth, sineStack: sineStack, sineAngle: sineAngle,
    boltTorqueInLb: boltTorqueInLb, rzFromRa: rzFromRa, raFromRz: raFromRz,
    gearFromDP: gearFromDP, gearFromModule: gearFromModule, gearPair: gearPair,
    gearDpFromOD: gearDpFromOD, gearModuleFromOD: gearModuleFromOD,
    taperFromDias: taperFromDias, taperOtherDia: taperOtherDia,
    isoStep: isoStep, isoIT: isoIT, isoShaftDev: isoShaftDev, isoHoleDev: isoHoleDev, isoFit: isoFit,
    decodeInsert: decodeInsert,
    filletThroat: filletThroat, filletLeg: filletLeg, heatInput: heatInput,
    tigAmps: tigAmps, TIG_FACTORS: TIG_FACTORS, decodeElectrode: decodeElectrode
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.QC = api;
})(typeof window !== 'undefined' ? window : globalThis);
