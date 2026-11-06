/* H38 Payroll Tax Tables — 2026.
 *
 * Year-keyed withholding data for payroll-calc.js. Every figure below was
 * transcribed from the OFFICIAL publications for tax year 2026 and verified
 * line by line against them on 2026-11-06:
 *
 *  - Federal percentage-method schedules (STANDARD + Step 2 checkbox), the
 *    Worksheet 1A built-in amounts ($12,900 MFJ / $8,600 other, $0 when the
 *    Step 2 box is checked) and the pre-2020 allowance value ($4,300):
 *    IRS Publication 15-T (2026), "Federal Income Tax Withholding Methods",
 *    p. 11 (Percentage Method Tables for Automated Payroll Systems) and
 *    Worksheet 1A — https://www.irs.gov/pub/irs-pdf/p15t.pdf
 *  - FICA: Social Security 6.2% up to the 2026 wage base of $184,500;
 *    Medicare 1.45%; Additional Medicare 0.9% on wages over $200,000:
 *    IRS Topic No. 751 (https://www.irs.gov/taxtopics/tc751) and the Social
 *    Security Administration 2026 wage base
 *    (https://www.ssa.gov/OACT/COLA/cbb.html).
 *  - Minnesota: Computer Formula chart (p. 34) and the $5,300 per-allowance
 *    amount (Step 3): Minnesota Department of Revenue, "2026 Minnesota
 *    Withholding Tax Instructions and Tables" —
 *    https://www.revenue.state.mn.us/sites/default/files/2025-12/wh-inst-26.pdf
 *    Bracket base amounts carry the booklet's exact cents.
 *  - FUTA: 0.6% effective rate on the first $7,000 of wages per employee
 *    per year (6.0% statutory less the full 5.4% state credit):
 *    IRS, "Federal Unemployment (FUTA) Tax" —
 *    https://www.irs.gov/businesses/small-businesses-self-employed/federal-unemployment-futa-tax
 *    MN SUTA is NOT here on purpose: the rate is employer-specific (MN DEED
 *    assigns it), so it comes only from the owner's Payroll tax settings.
 *
 * Row shape: [atLeast, butLessThan (null = no cap), baseTax, rateOnExcess,
 * excessOver] — annual amounts.
 */
(function(root){
  'use strict';
  var TABLES_2026 = {
    taxYear: 2026,
    federal: {
      builtInMFJ: 12900, builtInOther: 8600, pre2020AllowanceValue: 4300,
      source: 'IRS Pub. 15-T (2026) Percentage Method Tables for Automated Payroll Systems (p. 11) + Worksheet 1A — verified against irs.gov PDF 2026-11-06',
      tables: {
        standard: {
          mfj: [[0,19300,0,0,0],[19300,44100,0,0.10,19300],[44100,120100,2480,0.12,44100],[120100,230700,11600,0.22,120100],[230700,422850,35932,0.24,230700],[422850,531750,82048,0.32,422850],[531750,788000,116896,0.35,531750],[788000,null,206583.50,0.37,788000]],
          single: [[0,7500,0,0,0],[7500,19900,0,0.10,7500],[19900,57900,1240,0.12,19900],[57900,113200,5800,0.22,57900],[113200,209275,17966,0.24,113200],[209275,263725,41024,0.32,209275],[263725,648100,58448,0.35,263725],[648100,null,192979.25,0.37,648100]],
          hoh: [[0,15550,0,0,0],[15550,33250,0,0.10,15550],[33250,83000,1770,0.12,33250],[83000,121250,7740,0.22,83000],[121250,217300,16155,0.24,121250],[217300,271750,39207,0.32,217300],[271750,656150,56631,0.35,271750],[656150,null,191171.00,0.37,656150]]
        },
        step2: {
          mfj: [[0,16100,0,0,0],[16100,28500,0,0.10,16100],[28500,66500,1240,0.12,28500],[66500,121800,5800,0.22,66500],[121800,217875,17966,0.24,121800],[217875,272325,41024,0.32,217875],[272325,400450,58448,0.35,272325],[400450,null,103291.75,0.37,400450]],
          single: [[0,8050,0,0,0],[8050,14250,0,0.10,8050],[14250,33250,620,0.12,14250],[33250,60900,2900,0.22,33250],[60900,108938,8983,0.24,60900],[108938,136163,20512,0.32,108938],[136163,328350,29224,0.35,136163],[328350,null,96489.63,0.37,328350]],
          hoh: [[0,12075,0,0,0],[12075,20925,0,0.10,12075],[20925,45800,885,0.12,20925],[45800,64925,3870,0.22,45800],[64925,112950,8077.50,0.24,64925],[112950,140175,19603.50,0.32,112950],[140175,332375,28315.50,0.35,140175],[332375,null,95585.50,0.37,332375]]
        }
      }
    },
    fica: {
      ssRate: 0.062, ssWageBase: 184500, medicareRate: 0.0145,
      additionalRate: 0.009, additionalWithholdingThreshold: 200000,
      source: 'IRS Topic 751 rates + SSA 2026 wage base $184,500 — verified 2026-11-06'
    },
    minnesota: {
      allowanceValue: 5300,
      source: 'MN Dept. of Revenue, 2026 Minnesota Withholding Tax Instructions and Tables — Computer Formula (p. 34), allowance $5,300 (Step 3) — verified against revenue.state.mn.us PDF 2026-11-06',
      tables: {
        single: [[0,4700,0,0,0],[4700,38010,0,0.0535,4700],[38010,114130,1782.09,0.068,38010],[114130,207850,6958.25,0.0785,114130],[207850,null,14315.27,0.0985,207850]],
        married: [[0,14700,0,0,0],[14700,63400,0,0.0535,14700],[63400,208180,2605.45,0.068,63400],[208180,352630,12450.49,0.0785,208180],[352630,null,23789.82,0.0985,352630]]
      },
      paidLeave: { enabled: false, employeeRate: 0, employerRate: 0, wageCap: 184500 }
    },
    futa: {
      rate: 0.006, wageBase: 7000,
      source: 'IRS FUTA: 0.6% effective on the first $7,000 per employee per year (after full state credit) — verified 2026-11-06'
    }
  };
  var registry = (root && root.H38_PAYROLL_TAX_TABLES) || {};
  registry['2026'] = TABLES_2026;
  if (root) root.H38_PAYROLL_TAX_TABLES = registry;
  if (typeof module === 'object' && module.exports) module.exports = TABLES_2026;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
