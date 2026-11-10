// verify-price-refresh.js — contract tests for the 30-day price book
// freshness refresh (build 20261109-price-refresh-1, Rick's "look up what
// we can" call). Client module runs in a stubbed browser env (same pattern
// as verify-sms-registration.js); the edge function is verified by source
// contract — class rules, review-only writes, owner-only resolve.
// Run: node scripts/verify-price-refresh.js
'use strict';
const fs=require('fs'), path=require('path'), vm=require('vm');
const ROOT=path.join(__dirname,'..');
const APP=path.join(ROOT,'commercial-app');
const FN=path.join(ROOT,'supabase','functions','h38-price-refresh','index.ts');
const MIG=path.join(ROOT,'supabase','migrations','20261109120000_price_refresh_monthly.sql');

let pass=0, fail=0;
function ok(name,cond,extra){ if(cond){pass++;} else {fail++; console.error('FAIL: '+name+(extra?' — '+extra:''));} }
function read(p){ return fs.readFileSync(p,'utf8'); }

function makeSandbox(overrides){
  const store={};
  const localStorage={ getItem:k=>(k in store?store[k]:null), setItem:(k,v)=>{store[k]=String(v);}, removeItem:k=>{delete store[k];} };
  const sb={
    console, window:{}, document:{getElementById:()=>null,querySelectorAll:()=>[]},
    localStorage, FormData:class{ constructor(){} entries(){ return [][Symbol.iterator](); } },
    state:{businessId:'BIZ-1',snapshot:{user:{roleName:'Owner'}}},
    _rows:{},
    records:(c)=>sb._rows[c]||[], v:(r,k)=>r[k], rowId:()=>'',
    esc:(s)=>String(s==null?'':s), money:(n)=>'$'+Number(n||0).toFixed(2),
    setTimeout:(fn)=>0,
  };
  sb.window=sb;
  Object.assign(sb,overrides||{});
  return vm.createContext(sb);
}
function load(mod,ctx){ vm.runInContext(read(path.join(APP,mod)),ctx,{filename:mod}); }

const REVIEW_PENDING={
  'Review ID':'PRICE-REVIEW-AAAAAAAA-20261109','Status':'pending','Price Class':'material_published',
  'Description':'DRYWALL MATERIAL ONLY — Standard 1/2 in. drywall board','Item Code':'DW-MAT','Unit':'SF',
  'Current Sell Price':0.52,'Found Sell Price':13.33,'Found Note':'price read from source',
  'Source':'https://www.menards.com/example','Decided At':''
};
const REVIEW_LABOR={
  'Review ID':'PRICE-REVIEW-BBBBBBBB-20261109','Status':'pending','Price Class':'labor_benchmark_only',
  'Description':'DRYWALL LABOR ONLY — Hang and finish','Item Code':'DW-LAB','Unit':'SF',
  'Current Sell Price':1.30,'Found Sell Price':null,'Found Note':'Labor has no live published price',
  'Source':'','Decided At':''
};

// ---------- 1. Client card: pending review renders with decision buttons ----------
(function(){
  const ctx=makeSandbox(); load('price-refresh.js',ctx);
  const M=ctx.H38PriceRefresh;
  ok('module BUILD stamp', M.BUILD==='20261109-price-refresh-1', M.BUILD);
  ctx._rows={priceRefreshReviews:[REVIEW_PENDING]};
  const card=M.reviewCard();
  ok('card renders the pending item', card.indexOf('DRYWALL MATERIAL ONLY')>=0);
  ok('card shows current price', card.indexOf('$0.52')>=0);
  ok('card shows found price', card.indexOf('$13.33')>=0);
  ok('card links the source page', card.indexOf('https://www.menards.com/example')>=0);
  ok('material review offers Use found price', card.indexOf('data-pr-decide="approve"')>=0);
  ok('review offers Still current', card.indexOf('data-pr-decide="still_current"')>=0);
  ok('review offers Dismiss', card.indexOf('data-pr-decide="dismiss"')>=0);
  ok('card states nothing changes until the owner decides', /Nothing changes until you decide/.test(card));
})();

// ---------- 2. Labor review: NO approve button (no found price exists) ----------
(function(){
  const ctx=makeSandbox(); load('price-refresh.js',ctx);
  ctx._rows={priceRefreshReviews:[REVIEW_LABOR]};
  const card=ctx.H38PriceRefresh.reviewCard();
  ok('labor review renders', card.indexOf('DRYWALL LABOR ONLY')>=0);
  ok('labor review is labeled benchmark only', /benchmark only/i.test(card));
  ok('labor review has NO Use found price button', card.indexOf('data-pr-decide="approve"')<0);
  ok('labor review still offers Still current', card.indexOf('data-pr-decide="still_current"')>=0);
})();

// ---------- 3. Non-owner sees no card; decided rows show as history ----------
(function(){
  const ctx=makeSandbox(); load('price-refresh.js',ctx);
  ctx.state.snapshot.user.roleName='Crew';
  ok('non-owner gets no review card', ctx.H38PriceRefresh.reviewCard()==='');
  const ctx2=makeSandbox(); load('price-refresh.js',ctx2);
  ctx2._rows={priceRefreshReviews:[Object.assign({},REVIEW_PENDING,{'Status':'approved','Decision':'approve','Decided At':'2026-11-09T12:00:00Z','Applied Sell Price':13.33})]};
  const card=ctx2.H38PriceRefresh.reviewCard();
  ok('decided review shows in Recently decided', /Recently decided/.test(card) && /price set to \$13\.33/.test(card));
  ok('no pending -> card says so', /No price reviews waiting/.test(card));
  const ctx3=makeSandbox(); load('price-refresh.js',ctx3);
  ctx3._rows={priceRefreshReviews:[Object.assign({},REVIEW_PENDING,{'Review ID':'PRICE-REVIEW-CCCCCCCC-20261109','Status':'no_price_found','Item Code':'DW-NOPRICE','Decided At':''})]};
  const card3=ctx3.H38PriceRefresh.reviewCard();
  ok('no_price_found rows are NOT listed as decided', card3.indexOf('DW-NOPRICE')<0);
  ok('failed lookup leaves no pending row either', /No price reviews waiting/.test(card3));
})();

// ---------- 4. Edge function source contract ----------
(function(){
  const src=read(FN);
  ok('fn build stamp', src.indexOf('20261109-price-refresh-1')>=0);
  ok('fn freshness window is 30 days', /FRESH_DAYS = 30/.test(src));
  ok('fn only scans local_research rows', src.indexOf('sourceType !== "local_research"')>=0);
  ok('fn skips owner-approved rows', src.indexOf('approval === "approved"')>=0);
  ok('fn never refreshes a blank row', src.indexOf('currentSell <= 0')>=0);
  ok('fn reads the price from JSON-LD offers only', src.indexOf('extractJsonLdPrice')>=0 && src.indexOf('"offers"')>=0);
  ok('fn labor class is benchmark-only', src.indexOf('labor_benchmark_only')>=0);
  ok('fn review collection is priceRefreshReviews', src.indexOf('"priceRefreshReviews"')>=0);
  ok('fn scan never writes price_book_items', !/scanBusiness[\s\S]*?from\("price_book_items"\)\.update/.test(src.slice(src.indexOf('async function scanBusiness'), src.indexOf('// ---------------------------------------------------------------------------\n// Resolve'))));
  ok('fn resolve requires owner role (jwt)', src.indexOf('Only a business owner or administrator can decide a price review.')>=0);
  ok('fn approve writes the found price', src.indexOf('patch.sell_price = appliedPrice')>=0);
  ok('fn decision stamps updated_at (freshness)', src.indexOf('updated_at: nowIso')>=0);
  ok('fn dry_run is pinned to Build Sandbox', src.indexOf('d44d32de-dd95-4f6e-81e8-ff5592979d68')>=0);
  ok('fn internal key reads h38-price-refresh secret row', src.indexOf('"h38-price-refresh"')>=0);
})();

// ---------- 5. Cron migration contract ----------
(function(){
  const mig=read(MIG);
  ok('migration schedules the monthly job', mig.indexOf("cron.schedule(")>=0 && mig.indexOf('h38-price-refresh-monthly')>=0);
  ok('migration runs monthly on the 1st', mig.indexOf("'20 12 1 * *'")>=0);
  ok('migration posts refresh_all to the function', mig.indexOf('h38-price-refresh')>=0 && mig.indexOf('refresh_all')>=0);
  ok('migration reads the key from h38_internal_job_secrets', mig.indexOf('h38_internal_job_secrets')>=0);
  ok('migration carries no secret value', !/secret_value\s*=\s*'/.test(mig) && mig.indexOf('x-h38-nightly-key')>=0);
  ok('migration is pg_cron-guarded + idempotent', mig.indexOf("extname = 'pg_cron'")>=0 && mig.indexOf('cron.unschedule')>=0);
})();

// ---------- 6. Wiring: loader + inventory render + snapshot id keys ----------
(function(){
  const loader=read(path.join(APP,'h38-script-loader.js'));
  ok('loader loads price-refresh.js on the inventory page', loader.indexOf("'./price-refresh.js?build=20261109-price-refresh-1'")>=0);
  const app11=read(path.join(APP,'app-11.js'));
  ok('inventory render includes the review card', app11.indexOf('H38PriceRefresh.reviewCard')>=0);
  const data=read(path.join(APP,'supabase-data.js'));
  ok('snapshot id keys know priceRefreshReviews', data.indexOf("priceRefreshReviews:['Review ID','reviewId']")>=0);
  ok('snapshot fetches priceRefreshReviews explicitly (cap-proof)', data.indexOf("fetchCollectionRows(db, businessId, 'priceRefreshReviews')")>=0);
  const ver=JSON.parse(read(path.join(APP,'version.json')));
  ok('version.json advanced', ver.version==='20261109-kit-suggestions-1', ver.version); // stamp pin moved by kit-suggestions (version.json + SW only; price-refresh build stamps above unchanged)
  const sw=read(path.join(APP,'service-worker.js'));
  ok('service worker cache advanced', sw.indexOf('h38-business-office-20261109-kitsuggest-1')>=0); // stamp pin moved by kit-suggestions
})();

console.log(`verify-price-refresh: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
