/* H38 Accountant View — share-link management (Phase 1, 2026-10-22).
 *
 * Reports-page card for business owners/administrators:
 *  - Create a read-only "accountant view" share link (long unguessable
 *    token; only its SHA-256 hash is stored server-side). The link opens a
 *    live spreadsheet workbook of this business's money data — Invoices,
 *    Payments, Expenses, Payroll, Books/GL — computed from the records at
 *    open by the h38-accountant-view edge function. No login is needed to
 *    open it, and there is no write path on the link surface at all.
 *  - See existing links (created, last opened, open count) and revoke them;
 *    a revoked link serves nothing.
 * Lazy-loaded with the Reports page group (h38-script-loader PAGE_REPORTS):
 * zero startup cost, on-demand only (MODULE_PERFORMANCE_STANDARD). All
 * network work happens inside owner-initiated actions on this card.
 */
(function(){
'use strict';

var BUILD='20261022-acct-view-1';

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

var S={links:null, busy:'', error:'', notice:'', newUrl:'', loaded:false};

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

async function loadLinks(){
  var d=await invoke({action:'list', businessId:businessId()});
  S.links=Array.isArray(d.links)?d.links:[];
  S.loaded=true;
}

function linksHtml(){
  if(!S.loaded) return '<p class="muted">Loading share links…</p>';
  if(!S.links.length) return '<p class="muted">No accountant view links yet. Create one below — your accountant gets a read-only workbook link, no login needed.</p>';
  var h='<div class="list">';
  S.links.forEach(function(l){
    var revoked=!!l.revoked_at;
    h+='<div class="row"><div class="row-top"><span>'+(l.label?esc(l.label):'Accountant view link')
      +' <span class="muted small">('+esc(l.token_prefix)+'…)</span></span>'
      +(revoked?'<strong style="color:#8c2f1b">Revoked</strong>':'<strong style="color:#2e7d32">Active</strong>')
      +'</div><div class="muted small">Created '+esc(fmtDateTime(l.created_at))
      +' · Last opened '+esc(fmtDateTime(l.last_opened_at))
      +' · '+(Number(l.open_count)||0)+' open'+(Number(l.open_count)===1?'':'s')+'</div>'
      +(revoked?'':'<div style="margin-top:6px"><button type="button" class="btn secondary" data-act="revoke" data-id="'+esc(l.id)+'">Revoke this link</button></div>')
      +'</div></div>';
  });
  return h+'</div>';
}

function renderBody(){
  var body=document.getElementById('h38-accountant-view-body');
  if(!body) return;
  var h='';
  if(S.error) h+='<div class="card" style="background:#fdecea"><p>'+esc(S.error)+'</p></div>';
  if(S.notice) h+='<div class="card" style="background:#eef7ee"><p>'+esc(S.notice)+'</p></div>';
  if(S.newUrl){
    h+='<div class="card" style="background:#fdf6e0"><p><strong>Your new accountant view link — copy it now.</strong> '
      +'For safety, the full link is only shown once; if you lose it, revoke it and create a new one.</p>'
      +'<p style="word-break:break-all"><a href="'+esc(S.newUrl)+'" target="_blank" rel="noopener">'+esc(S.newUrl)+'</a></p>'
      +'<button type="button" class="btn" data-act="copy">Copy link</button> '
      +'<button type="button" class="btn secondary" data-act="dismiss-url">Done</button></div>';
  }
  h+=linksHtml();
  h+='<div style="margin-top:12px"><label class="small" for="h38-acct-label">Label (optional — e.g. your accountant\u2019s name)</label><br>'
    +'<input id="h38-acct-label" type="text" maxlength="120" style="width:min(420px,100%);padding:8px;border:1px solid #c9d1d6;border-radius:8px" placeholder="e.g. Smith CPA — year end">'
    +'<div style="margin-top:8px"><button type="button" class="btn" data-act="create" '+(S.busy==='create'?'disabled':'')+'>'
    +(S.busy==='create'?'Creating…':'Create accountant view link')+'</button></div>'
    +'<p class="muted small">Anyone with the link can VIEW this business\u2019s books (invoices, payments, expenses, payroll, and the general ledger) — live and read-only, nothing can be changed from the link. Share it only with your accountant, and revoke it any time.</p></div>';
  body.innerHTML=h;
}

async function onAction(act, el){
  S.error=''; S.notice='';
  try{
    if(act==='create'){
      S.busy='create'; renderBody();
      var labelEl=document.getElementById('h38-acct-label');
      var d=await invoke({action:'create', businessId:businessId(), label:labelEl?labelEl.value:''});
      S.newUrl=text(d.url);
      S.notice='Link created.';
      await loadLinks();
    }else if(act==='copy'){
      if(navigator.clipboard&&S.newUrl){ await navigator.clipboard.writeText(S.newUrl); S.notice='Link copied.'; }
    }else if(act==='dismiss-url'){
      S.newUrl='';
    }else if(act==='revoke'){
      var id=el&&el.getAttribute('data-id');
      if(!id) return;
      if(!window.confirm('Revoke this accountant view link? Anyone using it loses access immediately.')) return;
      S.busy='revoke'; renderBody();
      await invoke({action:'revoke', businessId:businessId(), linkId:id});
      S.notice='Link revoked.';
      await loadLinks();
    }
  }catch(e){
    S.error=text(e.message)||'Something went wrong.';
  }
  S.busy='';
  renderBody();
}

function render(){
  if(!isOwnerAdmin()) return;
  var grid=document.querySelector('#mainContent .grid');
  if(!grid||document.getElementById('h38-accountant-view-card')) return;
  var card=document.createElement('section');
  card.className='card span12';
  card.id='h38-accountant-view-card';
  card.innerHTML='<h2>📗 Accountant view</h2>'
    +'<p class="muted small">Give your accountant a live, read-only spreadsheet of your books — invoices, payments, expenses, payroll, and the ledger — with a download that carries real spreadsheet formulas. No login for them, nothing they can change, and you can revoke the link any time.</p>'
    +'<div id="h38-accountant-view-body"><p class="muted">Loading share links…</p></div>';
  grid.appendChild(card);
  card.addEventListener('click',function(ev){
    var t=ev.target&&ev.target.closest?ev.target.closest('[data-act]'):null;
    if(t) onAction(t.getAttribute('data-act'), t);
  });
  loadLinks().then(renderBody).catch(function(e){ S.error=text(e.message); S.loaded=true; renderBody(); });
}

function maybeRender(){
  try{
    if(window.state&&window.state.page==='reports') render();
  }catch(e){}
}

var lastCheck=0;
setInterval(function(){
  var t=Date.now();
  if(t-lastCheck<2000) return;
  lastCheck=t;
  maybeRender();
},2000);

window.H38AccountantView={BUILD:BUILD, render:render};

})();
