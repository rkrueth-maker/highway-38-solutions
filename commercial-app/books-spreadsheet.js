/* H38 Books Spreadsheet — in-app workbook tabs (Phase 2, 2026-10-22).
 *
 * The Phase 1 accountant share link (Reports → 📗 Accountant view) serves a
 * read-only workbook computed live from business_records by the
 * h38-accountant-view edge function. This page is the same workbook inside
 * the Office: the identical tabs, columns, and totals, fetched through the
 * function's authenticated "workbook" action (JWT + owner/admin membership,
 * same gate as link management). One money-math implementation, two
 * surfaces — any fix to the workbook lands in both at once.
 *
 * v1 is READ-ONLY, mirroring the link exactly. All editing stays in the
 * existing record screens (Invoices, Payments, Expenses, Payroll,
 * accounting workspace), which remain the single write path. The page
 * refreshes from the records on open and on the Refresh button. The
 * Download button returns the same .xlsx the link produces (real =SUM(...)
 * formulas and cross-sheet Books references, built server-side).
 *
 * Accountant-link management (create / list / revoke) also lives at the top
 * of this page, sharing the Phase 1 card's actions; the Reports card stays
 * as an entry point. Lazy-loaded with its own page group
 * (h38-script-loader PAGE_BOOKS): zero startup cost, on-demand only
 * (MODULE_PERFORMANCE_STANDARD). All network work happens after the page
 * opens or inside user-initiated actions on this page.
 */
(function(){
'use strict';

var BUILD='20261022-native-bridge-1';
var FN_PATH='/functions/v1/h38-accountant-view';

function text(v){return String(v==null?'':v).trim();}
function esc(s){return text(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function businessId(){try{return text(window.state&&window.state.businessId);}catch(e){return '';}}
function isOwnerAdmin(){
  try{
    var u=window.state&&window.state.snapshot&&window.state.snapshot.user;
    return !!(u&&(u.owner===true||/owner|administrator/i.test(text(u.roleName||u.role||''))));
  }catch(e){return false;}
}
function api(){
  try{
    return window.H38_SUPABASE_SHARED_CLIENT&&window.H38_SUPABASE_SHARED_CLIENT.ensure
      ? window.H38_SUPABASE_SHARED_CLIENT.ensure() : null;
  }catch(e){return null;}
}
function fmtDateTime(iso){
  if(!iso) return 'never';
  try{return new Date(iso).toLocaleString([], {month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit'});}
  catch(e){return text(iso).slice(0,16).replace('T',' ');}
}

var moneyFmt=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
var intFmt=new Intl.NumberFormat('en-US');
function fmtCell(col,val){
  if(val===null||val===undefined||val==='')return '';
  if(col.type==='money')return moneyFmt.format(Number(val)||0);
  if(col.type==='int')return intFmt.format(Math.round(Number(val)||0));
  if(col.type==='num'){var n=Number(val)||0;return intFmt.format(Math.round(n*10)/10);}
  return String(val);
}

/* ---------- workbook grid (ported from accountant-view.html) ---------- */
function renderTab(tab){
  var h='<h2 class="h38b-sheet-title">'+esc(tab.title)+'</h2>';
  if(tab.note)h+='<p class="h38b-sheet-note">'+esc(tab.note)+'</p>';
  if(!tab.rows.length){
    return h+'<p class="h38b-empty">No records yet — this tab fills in as the business uses its Office.</p>';
  }
  var minW=tab.columns.length<=3?'300px':(tab.columns.length<=6?'480px':'640px');
  h+='<div class="h38b-tablewrap"><table class="h38b-table" style="min-width:'+minW+'"><thead><tr>'+tab.columns.map(function(c){
    return '<th'+(c.type==='money'||c.type==='int'||c.type==='num'?' class="num"':'')+'>'+esc(c.label)+'</th>';
  }).join('')+'</tr></thead><tbody>';
  tab.rows.forEach(function(row){
    h+='<tr>'+row.map(function(val,i){
      var c=tab.columns[i];
      return '<td'+(c.type==='money'||c.type==='int'||c.type==='num'?' class="num"':'')+'>'+esc(fmtCell(c,val))+'</td>';
    }).join('')+'</tr>';
  });
  h+='</tbody>';
  if(tab.totals.some(function(v){return v!==null;})){
    h+='<tfoot><tr>'+tab.columns.map(function(c,i){
      if(i===0)return '<td>Total</td>';
      var v=tab.totals[i];
      return '<td'+(c.type==='money'||c.type==='int'||c.type==='num'?' class="num"':'')+'>'+(v===null?'':esc(fmtCell(c,v)))+'</td>';
    }).join('')+'</tr></tfoot>';
  }
  h+='</table></div>';
  return h;
}

var STYLE_ID='h38BooksSpreadsheetStyle';
function ensureStyle(){
  if(document.getElementById(STYLE_ID))return;
  var st=document.createElement('style');
  st.id=STYLE_ID;
  st.textContent=[
    '.h38b-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:14px 0 10px}',
    '.h38b-tabs button{border:1px solid #d9dee2;background:#fff;color:#17251f;border-radius:999px;padding:7px 13px;font-size:13.5px;font-weight:600;cursor:pointer}',
    '.h38b-tabs button[aria-selected="true"]{background:#0b3d2e;color:#fff;border-color:#0b3d2e}',
    '.h38b-sheet{background:#fff;border:1px solid #d9dee2;border-radius:12px;padding:14px;margin-bottom:16px}',
    '.h38b-sheet-title{margin:0 0 4px;font-size:17px}',
    '.h38b-sheet-note{color:#5b6872;font-size:12.5px;margin:0 0 10px}',
    '.h38b-tablewrap{overflow-x:auto;-webkit-overflow-scrolling:touch}',
    '.h38b-table{border-collapse:collapse;width:100%;font-size:13.5px}',
    '.h38b-table th,.h38b-table td{padding:7px 9px;border-bottom:1px solid #d9dee2;text-align:left;white-space:nowrap}',
    '.h38b-table th{background:#eef2f0;font-weight:700}',
    '.h38b-table td.num,.h38b-table th.num{text-align:right;font-variant-numeric:tabular-nums}',
    '.h38b-table tfoot td{font-weight:700;background:#f4f7f5;border-top:2px solid #0b3d2e}',
    '@media(max-width:560px){.h38b-table th,.h38b-table td{padding:6px 6px}.h38b-table td:first-child,.h38b-table th:first-child{white-space:normal;min-width:110px}}',
    '.h38b-empty{color:#5b6872;font-size:14px;padding:12px 2px}',
    '.h38b-status{padding:18px 2px;color:#5b6872;font-size:15px}',
    '.h38b-status.error{color:#8c2f1b}'
  ].join('');
  document.head.appendChild(st);
}

/* ---------- shared edge-function calls ---------- */
async function invoke(payload){
  var client=api();
  if(!client) throw new Error('Secure connection unavailable.');
  var res=await client.functions.invoke('h38-accountant-view',{body:payload});
  if(res.error){
    var msg=text(res.error.message)||'Request failed';
    try{
      var ctx=res.error.context;
      if(ctx&&typeof ctx.json==='function'){ var j=await ctx.json(); if(j&&j.error) msg=text(j.error); }
    }catch(e){}
    throw new Error(msg);
  }
  if(res.data&&res.data.error) throw new Error(text(res.data.error));
  return res.data||{};
}

var S={wb:null, activeTab:'', loading:false, error:'',
       links:null, linksLoaded:false, busy:'', notice:'', linkError:'', newUrl:''};

async function loadWorkbook(){
  S.loading=true; S.error='';
  paint();
  try{
    var d=await invoke({action:'workbook', businessId:businessId()});
    S.wb=d.workbook||null;
    if(!S.wb) throw new Error('The workbook came back empty.');
    if(!S.activeTab||!S.wb.tabs.some(function(t){return t.id===S.activeTab;})) S.activeTab=S.wb.tabs[0].id;
  }catch(e){
    S.error=text(e.message)||'The workbook could not be loaded.';
  }
  S.loading=false;
  paint();
}

async function downloadXlsx(btn){
  var client=api();
  if(!client) throw new Error('Secure connection unavailable.');
  var sess=await client.auth.getSession();
  var token=sess&&sess.data&&sess.data.session?sess.data.session.access_token:'';
  if(!token) throw new Error('Sign in again before downloading.');
  var cfg=window.H38_BUSINESS_OFFICE_SUPABASE||{};
  var base=text(cfg.url)||'https://jqukmwtsgcsaruucnqja.supabase.co';
  var key=text(cfg.publishableKey);
  var res=await fetch(base+FN_PATH,{
    method:'POST',
    headers:{'authorization':'Bearer '+token,'apikey':key,'content-type':'application/json'},
    body:JSON.stringify({action:'workbook', businessId:businessId(), format:'xlsx'})
  });
  if(!res.ok){
    var msg='Download failed ('+res.status+').';
    try{ var j=await res.json(); if(j&&j.error) msg=text(j.error); }catch(e){}
    throw new Error(msg);
  }
  var blob=await res.blob();
  var fname='accountant-workbook.xlsx';
  var cd=res.headers.get('content-disposition')||'';
  var m=/filename="([^"]+)"/.exec(cd);
  if(m) fname=m[1];
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=fname;
  document.body.appendChild(a);
  a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },400);
}

/* ---------- accountant link management (same actions as the Reports card) ---------- */
async function loadLinks(){
  try{
    var d=await invoke({action:'list', businessId:businessId()});
    S.links=Array.isArray(d.links)?d.links:[];
  }catch(e){
    S.linkError=text(e.message)||'Share links could not be loaded.';
    S.links=[];
  }
  S.linksLoaded=true;
  paintLinks();
}

function linksHtml(){
  var h='';
  if(S.linkError) h+='<div class="card" style="background:#fdecea"><p>'+esc(S.linkError)+'</p></div>';
  if(S.notice) h+='<div class="card" style="background:#eef7ee"><p>'+esc(S.notice)+'</p></div>';
  if(S.newUrl){
    h+='<div class="card" style="background:#fdf6e0"><p><strong>Your new accountant view link — copy it now.</strong> '
      +'For safety, the full link is only shown once; if you lose it, revoke it and create a new one.</p>'
      +'<p style="word-break:break-all"><a href="'+esc(S.newUrl)+'" target="_blank" rel="noopener">'+esc(S.newUrl)+'</a></p>'
      +'<button type="button" class="btn" data-bact="copy">Copy link</button> '
      +'<button type="button" class="btn secondary" data-bact="dismiss-url">Done</button></div>';
  }
  if(!S.linksLoaded) h+='<p class="muted">Loading share links…</p>';
  else if(!S.links.length) h+='<p class="muted">No accountant view links yet. Create one below — your accountant gets the same read-only workbook, no login needed.</p>';
  else{
    h+='<div class="list">';
    S.links.forEach(function(l){
      var revoked=!!l.revoked_at;
      h+='<div class="row"><div class="row-top"><span>'+(l.label?esc(l.label):'Accountant view link')
        +' <span class="muted small">('+esc(l.token_prefix)+'…)</span></span>'
        +(revoked?'<strong style="color:#8c2f1b">Revoked</strong>':'<strong style="color:#2e7d32">Active</strong>')
        +'</div><div class="muted small">Created '+esc(fmtDateTime(l.created_at))
        +' · Last opened '+esc(fmtDateTime(l.last_opened_at))
        +' · '+(Number(l.open_count)||0)+' open'+(Number(l.open_count)===1?'':'s')+'</div>'
        +(revoked?'':'<div style="margin-top:6px"><button type="button" class="btn secondary" data-bact="revoke" data-id="'+esc(l.id)+'">Revoke this link</button></div>')
        +'</div></div>';
    });
    h+='</div>';
  }
  h+='<div style="margin-top:12px"><label class="small" for="h38-books-acct-label">Label (optional — e.g. your accountant\u2019s name)</label><br>'
    +'<input id="h38-books-acct-label" type="text" maxlength="120" style="width:min(420px,100%);padding:8px;border:1px solid #c9d1d6;border-radius:8px" placeholder="e.g. Smith CPA — year end">'
    +'<div style="margin-top:8px"><button type="button" class="btn" data-bact="create" '+(S.busy==='create'?'disabled':'')+'>'
    +(S.busy==='create'?'Creating…':'Create accountant view link')+'</button></div>'
    +'<p class="muted small">Anyone with the link can VIEW this business\u2019s books — live and read-only, nothing can be changed from the link. Share it only with your accountant, and revoke it any time.</p></div>';
  return h;
}

async function onLinkAction(act, el){
  S.linkError=''; S.notice='';
  try{
    if(act==='create'){
      S.busy='create'; paintLinks();
      var labelEl=document.getElementById('h38-books-acct-label');
      var d=await invoke({action:'create', businessId:businessId(), label:labelEl?labelEl.value:''});
      S.newUrl=text(d.url);
      S.notice='Link created.';
      await loadLinks();
    }else if(act==='copy'){
      if(navigator.clipboard&&S.newUrl){ await navigator.clipboard.writeText(S.newUrl); S.notice='Link copied.'; paintLinks(); }
    }else if(act==='dismiss-url'){
      S.newUrl=''; paintLinks();
    }else if(act==='revoke'){
      var id=el&&el.getAttribute('data-id');
      if(!id) return;
      if(!window.confirm('Revoke this accountant view link? Anyone using it loses access immediately.')) { paintLinks(); return; }
      S.busy='revoke'; paintLinks();
      await invoke({action:'revoke', businessId:businessId(), linkId:id});
      S.notice='Link revoked.';
      await loadLinks();
    }
  }catch(e){
    S.linkError=text(e.message)||'Something went wrong.';
    paintLinks();
  }
  S.busy='';
  paintLinks();
}

/* ---------- page paint ---------- */
function headHtml(withTools){
  var tools=withTools
    ? '<div class="h38-screen-head__actions page-tools">'
      +'<button type="button" class="btn secondary" data-bact="refresh">↻ Refresh</button> '
      +'<button type="button" class="btn" data-bact="download">⬇ Download workbook (.xlsx)</button>'
      +'</div>'
    : '';
  return '<header class="h38-screen-head page-head"><div class="h38-screen-head__titlerow"><div>'
    +'<h1>📗 Books spreadsheet</h1>'
    +'<p class="h38-screen-head__purpose">Your books as a spreadsheet — the same live, read-only workbook your accountant sees through an Accountant view link. Editing stays in the record screens; this page always shows the current numbers.</p>'
    +'</div></div>'+tools+'</header>';
}

function paintLinks(){
  var box=document.getElementById('h38-books-links-body');
  if(box) box.innerHTML=linksHtml();
}

function paint(){
  var main=document.getElementById('mainContent');
  if(!main||!document.getElementById('h38-books-page')) return;
  var area=document.getElementById('h38-books-workbook');
  if(!area) return;
  if(S.loading){ area.innerHTML='<p class="h38b-status">Loading workbook…</p>'; return; }
  if(S.error){ area.innerHTML='<p class="h38b-status error">'+esc(S.error)+' <button type="button" class="btn secondary" data-bact="refresh">Try again</button></p>'; return; }
  if(!S.wb){ area.innerHTML='<p class="h38b-status">Loading workbook…</p>'; return; }
  var wb=S.wb;
  var when=new Date(wb.generatedAt);
  var h='<p class="muted small" style="margin:2px 0 0">Figures computed live from the Office records as of '+esc(when.toLocaleString())+'. Voided or cancelled records are excluded.</p>';
  h+='<nav class="h38b-tabs" aria-label="Workbook tabs">'+wb.tabs.map(function(t){
    return '<button type="button" data-btab="'+esc(t.id)+'" aria-selected="'+(t.id===S.activeTab?'true':'false')+'">'+esc(t.title)+'</button>';
  }).join('')+'</nav>';
  h+=wb.tabs.map(function(t){
    return '<section class="h38b-sheet" data-sheet="'+esc(t.id)+'"'+(t.id===S.activeTab?'':' hidden')+'>'+renderTab(t)+'</section>';
  }).join('');
  area.innerHTML=h;
}

function showTab(id){
  S.activeTab=id;
  document.querySelectorAll('#h38-books-workbook [data-sheet]').forEach(function(s){ s.hidden=s.getAttribute('data-sheet')!==id; });
  document.querySelectorAll('#h38-books-workbook [data-btab]').forEach(function(b){ b.setAttribute('aria-selected',b.getAttribute('data-btab')===id?'true':'false'); });
}

function render(){
  var main=document.getElementById('mainContent');
  if(!main) return;
  ensureStyle();
  if(!isOwnerAdmin()){
    main.innerHTML=headHtml(false)
      +'<section class="card"><h2>Owner / administrator only</h2>'
      +'<p class="muted">The Books spreadsheet shows this business\u2019s full books — invoices, payments, expenses, payroll, and the general ledger — so it is limited to the business owner and administrators, the same as accountant link management. Ask an owner or administrator if you need these figures.</p></section>';
    return;
  }
  main.innerHTML='<div id="h38-books-page">'+headHtml(true)
    +'<section class="card span12"><h2>📗 Accountant view links</h2>'
    +'<p class="muted small">Share this workbook with your accountant: a live, read-only link — no login for them, nothing they can change, revocable any time.</p>'
    +'<div id="h38-books-links-body"><p class="muted">Loading share links…</p></div></section>'
    +'<div id="h38-books-workbook"><p class="h38b-status">Loading workbook…</p></div>'
    +'</div>';
  var page=document.getElementById('h38-books-page');
  page.addEventListener('click',function(ev){
    var tab=ev.target&&ev.target.closest?ev.target.closest('[data-btab]'):null;
    if(tab){ showTab(tab.getAttribute('data-btab')); return; }
    var t=ev.target&&ev.target.closest?ev.target.closest('[data-bact]'):null;
    if(!t) return;
    var act=t.getAttribute('data-bact');
    if(act==='refresh'){ S.linksLoaded=false; loadWorkbook(); loadLinks(); }
    else if(act==='download'){
      t.disabled=true;
      downloadXlsx(t).catch(function(e){ if(typeof window.toast==='function') window.toast(text(e.message)||'Download failed.',true); })
        .finally(function(){ t.disabled=false; });
    }
    else onLinkAction(act, t);
  });
  loadWorkbook();
  loadLinks();
}

window.H38BooksSpreadsheet={BUILD:BUILD, render:render};
window.renderBooksSpreadsheet=render;

})();
