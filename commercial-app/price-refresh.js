// H38 price book 30-day refresh — BUILD 20261109-price-refresh-1
//
// Rick's direction (2026-11-09): "We can update prices with a search every
// 30 days but we should look up what we can."
//
// The monthly h38-price-refresh job re-reads the price each stale
// local_research row's OWN stored source page publishes and writes a REVIEW
// row per finding (business_records collection 'priceRefreshReviews',
// written only by the edge function with the service key). This module is
// the Office half: it renders those reviews on the Inventory page, under
// the price history card, and sends the owner's decision back to the edge
// function — the only path that writes a price or a freshness stamp.
//
// Rules this module lives by:
//   - Nothing here changes a price on its own. Approve / Still current /
//     Dismiss are explicit owner taps, resolved server-side.
//   - Labor rows carry no found price (no live published price exists for
//     labor — only survey benchmarks), so they offer Still current /
//     Dismiss only. The owner edits labor rates by hand in the item editor.
//   - Blank rows stay blank: the scan never proposes a price for a row
//     that has none, and neither does this card.
//   - A found retailer price is per package/sheet as the source page states
//     it; the row's own unit is shown beside it so the owner converts
//     before approving. Approving applies the found price as-is.
(function(){
'use strict';
var BUILD='20261109-price-refresh-1';
var COLLECTION='priceRefreshReviews';
var ENDPOINT='h38-price-refresh';

function text(v){ return String(v==null?'':v).trim(); }
function esc(s){ return typeof window.esc==='function'?window.esc(s):text(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
function money(n){ return typeof window.money==='function'?window.money(n):('$'+Number(n||0).toFixed(2)); }
function isOwner(){
  try{
    var u=(typeof state!=='undefined'&&state&&state.snapshot&&state.snapshot.user)||{};
    var r=text(u.roleName||u.role||u.roleId).toLowerCase();
    return r==='owner'||r==='administrator';
  }catch(e){ return false; }
}
function reviewRows(){
  try{ return (typeof records==='function'?records(COLLECTION):[])||[]; }catch(e){ return []; }
}
function client(){ try{ return window.H38_SUPABASE_SHARED_CLIENT&&window.H38_SUPABASE_SHARED_CLIENT.ensure&&window.H38_SUPABASE_SHARED_CLIENT.ensure(); }catch(e){ return null; } }
function businessId(){ try{ return text((typeof state!=='undefined'&&state&&state.businessId)||''); }catch(e){ return ''; } }

async function callFn(body){
  var db=client(); if(!db) throw new Error('Secure connection unavailable — price decisions need a live sign-in.');
  var sess=await db.auth.getSession();
  var token=sess&&sess.data&&sess.data.session&&sess.data.session.access_token;
  if(!token) throw new Error('Your sign-in session has expired. Sign in again, then decide the review.');
  var base=text(db.supabaseUrl||''); if(!base) throw new Error('Secure connection unavailable.');
  // Plain fetch, NOT db.functions.invoke — the invoke path doubles the
  // Authorization header in this app (proven live 2026-10-26).
  var res=await fetch(base+'/functions/v1/'+ENDPOINT,{method:'POST',
    headers:{'content-type':'application/json',apikey:text(db.supabaseKey||''),authorization:'Bearer '+token,'x-client-info':BUILD},
    body:JSON.stringify(Object.assign({businessId:businessId()},body))});
  var data=null; try{ data=await res.json(); }catch(e){ data=null; }
  if(!res.ok||!data||data.ok!==true) throw new Error((data&&data.error)||('Price refresh request failed ('+res.status+').'));
  return data;
}

function reviewCard(){
  if(!isOwner()) return '';
  var rows=reviewRows();
  var pending=rows.filter(function(r){ return text(v(r,'Status'))==='pending'; });
  var decided=rows.filter(function(r){ var st=text(v(r,'Status')); return st==='approved'||st==='confirmed_current'||st==='dismissed'; })
    .sort(function(a,b){ return text(v(b,'Decided At')).localeCompare(text(v(a,'Decided At'))); }).slice(0,5);
  var html='<section class="card span12" id="h38PriceRefreshCard"><h2>🔄 Price refresh — monthly check</h2>'
    +'<p class="muted small">Once a month Hank re-reads the prices on the source pages your researched prices came from. '
    +'Nothing changes until you decide: <strong>Use found price</strong> applies it, <strong>Still current</strong> keeps your price and marks it checked, '
    +'<strong>Dismiss</strong> leaves everything as-is. Labor rates have no published price to look up — confirm those by hand. '
    +'A found price is per package or sheet, exactly as the source page states it — check it against the item\u2019s unit before approving.</p>';
  if(!pending.length){
    html+='<p class="muted small">No price reviews waiting. The next check runs at the start of the month.</p>';
  } else {
    html+='<div class="list">'+pending.map(function(r){
      var found=v(r,'Found Sell Price');
      var hasFound=found!==null&&found!==undefined&&found!==''&&Number(found)>0;
      var key=esc(v(r,'Review ID'));
      var src=text(v(r,'Source'));
      return '<div class="row"><div class="row-top"><strong>'+esc(v(r,'Description'))+'</strong>'
        +'<span class="pill">'+(text(v(r,'Price Class'))==='labor_benchmark_only'?'Labor — benchmark only':'Researched price')+'</span></div>'
        +'<small>'+esc(v(r,'Item Code'))+' · per '+esc(v(r,'Unit')||'unit')+' · your price now '+money(v(r,'Current Sell Price'))
        +(hasFound?' · <strong>found '+money(found)+'</strong>':'')
        +(src?' · <a href="'+esc(src)+'" target="_blank" rel="noopener">source page</a>':'')
        +'</small>'
        +(text(v(r,'Found Note'))?'<small>'+esc(v(r,'Found Note'))+'</small>':'')
        +'<div class="actions">'
        +(hasFound?'<button type="button" data-pr-decide="approve" data-pr-review="'+key+'">Use found price</button>':'')
        +'<button type="button" class="secondary" data-pr-decide="still_current" data-pr-review="'+key+'">Still current</button>'
        +'<button type="button" class="secondary" data-pr-decide="dismiss" data-pr-review="'+key+'">Dismiss</button>'
        +'</div></div>';
    }).join('')+'</div>';
  }
  if(decided.length){
    html+='<h3>Recently decided</h3><div class="list">'+decided.map(function(r){
      return '<div class="row"><div class="row-top"><strong>'+esc(v(r,'Description'))+'</strong><span class="pill">'+esc(v(r,'Status').replace(/_/g,' '))+'</span></div>'
        +'<small>'+esc(v(r,'Item Code'))+' · decided '+esc(text(v(r,'Decided At')).slice(0,10))
        +(v(r,'Applied Sell Price')?' · price set to '+money(v(r,'Applied Sell Price')):'')+'</small></div>';
    }).join('')+'</div>';
  }
  html+='<div class="actions"><button type="button" class="secondary" id="h38PriceRefreshRun">Check prices now</button></div></section>';
  setTimeout(bindCard,0);
  return html;
}

function bindCard(){
  try{
    var root=document.getElementById('h38PriceRefreshCard');
    if(!root||root.dataset.prBound) return;
    root.dataset.prBound='1';
    root.querySelectorAll('[data-pr-decide]').forEach(function(b){
      b.onclick=async function(){
        var decision=b.getAttribute('data-pr-decide'), reviewId=b.getAttribute('data-pr-review');
        b.disabled=true;
        try{
          await callFn({action:'resolve',reviewId:reviewId,decision:decision});
          if(typeof toast==='function') toast('Price review decided.');
          if(typeof renderInventory==='function') renderInventory();
        }catch(e){
          if(typeof toast==='function') toast(e.message||String(e),true);
          b.disabled=false;
        }
      };
    });
    var run=document.getElementById('h38PriceRefreshRun');
    if(run) run.onclick=async function(){
      run.disabled=true;
      try{
        var out=await callFn({action:'scan'});
        if(typeof toast==='function') toast('Price check done — '+(out.proposed||0)+' review(s) proposed.');
        if(typeof renderInventory==='function') renderInventory();
      }catch(e){
        if(typeof toast==='function') toast(e.message||String(e),true);
        run.disabled=false;
      }
    };
  }catch(e){ /* render context without DOM helpers */ }
}

window.H38PriceRefresh={ reviewCard:reviewCard, BUILD:BUILD };
})();
