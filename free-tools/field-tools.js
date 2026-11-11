/* H38 Field Tools — shared calculation engine for the seven free field
   tools (snow estimator, roofing, photo-quote ballpark, paint & drywall,
   machinist speeds & tap drills, markup & margin, materials yardage).
   Every formula here was verified against independent hand computations
   before shipping (see the workstream evidence). Pure functions on
   window.H38FT; each tool page renders its own inputs and readouts. */
(function () {
  "use strict";

  function round2(v) { return Math.round(v * 100) / 100; }

  /* ---------- 1 · Snow & seasonal services estimator ----------
     Northern-Minnesota market ballparks (2026), stated on the page:
     plowing per visit = base call-out + per-sq-ft of cleared area;
     mowing per visit = base + per-sq-ft of lawn. Seasonal contract =
     per-visit midpoint x expected events (plowing 18, mowing 22). */
  var SNOW = {
    plow:  { base: 45, lo: 0.020, hi: 0.045, events: 18, label: "Snow plowing" },
    mow:   { base: 35, lo: 0.0012, hi: 0.0028, events: 22, label: "Lawn mowing" }
  };
  function snowEstimate(service, period, sqft) {
    var s = SNOW[service] || SNOW.plow;
    var lo = s.base + sqft * s.lo, hi = s.base + sqft * s.hi;
    if (period === "season") {
      var mid = (lo + hi) / 2 * s.events;
      return { lo: round2(mid * 0.9), hi: round2(mid * 1.1), perVisitLo: round2(lo), perVisitHi: round2(hi), events: s.events };
    }
    return { lo: round2(lo), hi: round2(hi), events: 1 };
  }

  /* ---------- 2 · Roofing squares & materials ----------
     True roof area = footprint x slope factor sqrt(1+(rise/12)^2).
     1 square = 100 sq ft; 3 bundles per square; underlayment rolls
     cover ~400 sq ft each; ridge cap ~33 lin ft per bundle, shown per
     linear foot of ridge entered. */
  function roofEstimate(lenFt, widFt, rise, wastePct, ridgeFt) {
    var slope = Math.sqrt(1 + Math.pow(rise / 12, 2));
    var plan = lenFt * widFt;
    var trueArea = plan * slope;
    var withWaste = trueArea * (1 + wastePct / 100);
    return {
      slopeFactor: round2(slope * 1000) / 1000,
      planSqft: Math.round(plan),
      roofSqft: Math.round(trueArea),
      squaresExact: round2(trueArea / 100),
      squaresBuy: round2(withWaste / 100),
      bundles: Math.ceil(withWaste / 100 * 3),
      underlaymentRolls: Math.ceil(withWaste / 400),
      ridgeCapBundles: ridgeFt > 0 ? Math.ceil(ridgeFt / 33) : 0
    };
  }

  /* ---------- 3 · Photo-quote ballpark (teaser — ranges only) ----------
     Per-type installed-cost ballpark ranges per unit, northern-MN 2026.
     These are planning ranges, never a quote; the page says so plainly. */
  var PHOTO_RATES = {
    deck:      { unit: "sq ft of deck",        lo: 25,  hi: 45 },
    fence:     { unit: "linear ft of fence",   lo: 25,  hi: 55 },
    drywall:   { unit: "sq ft of wall/ceiling", lo: 2,  hi: 4 },
    painting:  { unit: "sq ft of wall area",   lo: 2,  hi: 5 },
    concrete:  { unit: "sq ft of slab",        lo: 8,  hi: 15 },
    lawnsnow:  { unit: "sq ft serviced / visit", lo: 0.03, hi: 0.08 }
  };
  function photoBallpark(type, size) {
    var r = PHOTO_RATES[type];
    if (!r || !(size > 0)) return null;
    return { lo: Math.round(size * r.lo), hi: Math.round(size * r.hi), unit: r.unit };
  }

  /* ---------- 4 · Paint & drywall materials ----------
     Paint: ~350 sq ft per gallon per coat. Drywall: 4x8 = 32 sq ft,
     4x12 = 48 sq ft sheets; joint compound ~1 ready-mix gallon per
     100 sq ft finished (a 4.5-gal bucket covers ~450 sq ft); tape
     ~370 ft per 1,000 sq ft; screws ~1 lb per 250 sq ft. */
  function paintGallons(wallSqft, coats) {
    var exact = wallSqft * coats / 350;
    return { exact: round2(exact), buy: Math.ceil(exact) };
  }
  function drywallMaterials(sqft, sheetSqft) {
    return {
      sheets: Math.ceil(sqft / sheetSqft),
      mudBuckets: Math.ceil(sqft / 450),
      tapeRolls: Math.ceil(sqft * 0.37 / 500),
      tapeFeet: Math.round(sqft * 0.37),
      screwsLb: Math.ceil(sqft / 250)
    };
  }

  /* ---------- 5 · Machinist speeds, feeds & tap drills ----------
     RPM = 3.82 x SFM / diameter(in). SFM values are the standard
     published starting points (Machinery's Handbook ranges, conservative
     mid-low picks). Chip load per tooth/flute in inches, standard
     starting ranges by tool diameter. Tap drill = major dia - pitch
     (the standard ~75% thread formula). */
  var SFM = {
    /* key: [HSS, Carbide] surface feet per minute */
    aluminum:   [300, 800],
    brass:      [200, 450],
    castiron:   [110, 300],
    mildsteel:  [100, 300],
    alloysteel: [70, 220],
    stainless:  [50, 150],
    titanium:   [30, 90]
  };
  function chipLoad(diaIn) {
    if (diaIn <= 0.125) return 0.001;
    if (diaIn <= 0.25) return 0.002;
    if (diaIn <= 0.5) return 0.004;
    if (diaIn <= 1) return 0.006;
    return 0.010;
  }
  /* Drill feed is per revolution (one cutting edge pair), not per flute:
     a drill at chip load c advances ~2c per rev counting both lips; the
     standard shop starting point uses the per-flute value as the feed per
     rev for a two-flute drill, which is what the tables below use. */
  function speeds(material, toolIdx, diaIn, flutes, isDrill) {
    var row = SFM[material] || SFM.mildsteel;
    var sfm = row[toolIdx] || row[0];
    var rpm = diaIn > 0 ? 3.82 * sfm / diaIn : 0;
    var cl = chipLoad(diaIn);
    var feed = isDrill ? rpm * cl : rpm * cl * Math.max(1, flutes);
    return { sfm: sfm, rpm: Math.round(rpm), chipLoad: cl, feedIpm: round2(feed) };
  }
  function tapDrillInch(majorIn, tpi) { return round2((majorIn - 1 / tpi) * 1000) / 1000; }
  function tapDrillMetric(majorMm, pitchMm) { return round2(majorMm - pitchMm); }

  /* ---------- 6 · Markup & margin ----------
     price = cost x (1 + markup%)  ·  price = cost / (1 - margin%).
     Job charge = (labor + materials) marked up for overhead, then
     profit on top: subtotal x (1+oh%) x (1+profit%). */
  function priceFromMarkup(cost, markupPct) {
    var price = cost * (1 + markupPct / 100);
    return { price: round2(price), marginPct: round2((price - cost) / price * 100) };
  }
  function priceFromMargin(cost, marginPct) {
    var price = marginPct >= 100 ? 0 : cost / (1 - marginPct / 100);
    return { price: round2(price), markupPct: price > 0 ? round2((price - cost) / cost * 100) : 0 };
  }
  function jobCharge(hours, rate, materials, overheadPct, profitPct) {
    var labor = hours * rate;
    var subtotal = (labor + materials) * (1 + overheadPct / 100);
    return { labor: round2(labor), subtotal: round2(subtotal), charge: round2(subtotal * (1 + profitPct / 100)) };
  }

  /* ---------- 7 · Materials yardage & tonnage ----------
     Cubic yards = area(sq ft) x depth(in) / 324.
     Densities (loose/placed, stated on the page): gravel 1.35 t/yd3,
     topsoil 1.10 t/yd3, mulch sold by the yard (~0.45 t/yd3 if weighed),
     asphalt compacted 2.0 t/yd3 (145 lb/ft3). */
  var DENSITIES = { gravel: 1.35, topsoil: 1.10, mulch: 0.45, asphalt: 2.00 };
  function materialYards(areaSqft, depthIn) { return areaSqft * depthIn / 324; }
  function materialEstimate(kind, areaSqft, depthIn) {
    var cy = materialYards(areaSqft, depthIn);
    var d = DENSITIES[kind] || 1.35;
    return { yards: round2(cy), tons: round2(cy * d), density: d };
  }

  window.H38FT = {
    snowEstimate: snowEstimate,
    roofEstimate: roofEstimate,
    photoBallpark: photoBallpark,
    PHOTO_RATES: PHOTO_RATES,
    paintGallons: paintGallons,
    drywallMaterials: drywallMaterials,
    speeds: speeds,
    SFM: SFM,
    tapDrillInch: tapDrillInch,
    tapDrillMetric: tapDrillMetric,
    priceFromMarkup: priceFromMarkup,
    priceFromMargin: priceFromMargin,
    jobCharge: jobCharge,
    materialEstimate: materialEstimate,
    materialYards: materialYards,
    DENSITIES: DENSITIES
  };
})();
