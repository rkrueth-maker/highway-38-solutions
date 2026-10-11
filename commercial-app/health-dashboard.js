/* H38 Health Dashboard — H38 TENANT ONLY.
 *
 * Renders the "App Health" card in Settings. Gated THREE ways:
 *  1. Nav/section hidden unless businessKey==='highway38'
 *  2. render() refuses to run for any other tenant
 *  3. All Supabase queries are rejected client-side for non-H38 tenants
 *     (RLS enforces it server-side too)
 *
 * Sections: errors by page, top failing features, perf trends,
 * "Hank fixed X issues" heal feed, and (platform owner only)
 * cross-tenant usage analytics.
 */
(function(){
'use strict';

var BUILD='20261011-health-dashboard-1';
var H38_KEY='highway38';

function text(v){return String(v==null?'':v).trim();}
function esc(s){return text(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function isH38(){
  try{return text(window.state&&window.state.snapshot&&window.state.snapshot.business&&window.state.snapshot.business.businessKey)===H38_KEY;}
  catch(e){return false;}
}
function isOwner(){
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
function businessId(){try{return text(window.state&&window.state.businessId);}catch(e){return '';}}
function since(days){var d=new Date();d.setDate(d.getDate()-days);return d.toISOString();}

async function queryEvents(filters){
  // Triple-gate: refuse for non-H38 tenants before any network call.
  if(!isH38()) throw new Error('Health dashboard is only available on the H38 tenant.');
  var client=api();
  if(!client) throw new Error('Secure connection unavailable.');
  var q=client.from('app_health_events').select('event_type,page,message,viewport,meta,created_at,business_id');
  if(filters&&filters.types) q=q.in('event_type',filters.types);
  if(filters&&filters.since) q=q.gte('created_at',filters.since);
  if(filters&&filters.businessId) q=q.eq('business_id',filters.businessId);
  q=q.order('created_at',{ascending:false}).limit(filters&&filters.limit||500);
  var res=await q;
  if(res.error) throw new Error(res.error.message||'query failed');
  return res.data||[];
}

function countBy(rows,key){
  var m={};
  rows.forEach(function(r){
    var k=text(r[key]||'unknown').slice(0,60)||'unknown';
    m[k]=(m[k]||0)+1;
  });
  return Object.entries(m).sort(function(a,b){return b[1]-a[1];});
}
function avgBy(rows,groupKey,valFn){
  var sums={},ns={};
  rows.forEach(function(r){
    var k=text(r[groupKey]||'unknown').slice(0,40)||'unknown';
    var v=valFn(r); if(v==null||isNaN(v)) return;
    sums[k]=(sums[k]||0)+v; ns[k]=(ns[k]||0)+1;
  });
  return Object.keys(sums).map(function(k){return[k,Math.round(sums[k]/ns[k]),ns[k]];})
    .sort(function(a,b){return b[2]-a[2];});
}
function fmtTime(iso){
  try{return new Date(iso).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}
  catch(e){return text(iso).slice(0,16);}
}

async function renderTenantView(container,bid){
  var html='';
  try{
    var errors=await queryEvents({types:['error'],since:since(7),businessId:bid,limit:500});
    var heals=await queryEvents({types:['heal'],since:since(7),businessId:bid,limit:100});
    var perf=await queryEvents({types:['perf'],since:since(7),businessId:bid,limit:500});
    var usage=await queryEvents({types:['usage'],since:since(7),businessId:bid,limit:500});

    var errByPage=countBy(errors,'page').slice(0,8);
    var healCount=heals.length;
    var loadAvgs=avgBy(perf.filter(function(r){return r.message==='page_load';}),'page',function(r){return r.meta&&r.meta.valueMs;}).slice(0,8);
    var ttiAvgs=avgBy(perf.filter(function(r){return r.message==='time_to_interactive';}),'page',function(r){return r.meta&&r.meta.valueMs;}).slice(0,8);
    var topClicks=countBy(usage.filter(function(r){return r.message==='click';}).map(function(r){
      return{page:((r.meta&&r.meta.label)||'?')+' ('+text(r.page)+')'};}),'page').slice(0,8);

    html+='<div class="grid">';

    // Heal feed — "Hank fixed X issues"
    html+='<section class="card span6"><h2>🔧 Hank auto-fixed '+healCount+' issue'+(healCount===1?'':'s')+' this week</h2>';
    if(heals.length){
      html+='<div class="list">'+heals.slice(0,10).map(function(h){
        return '<div class="row"><div class="row-top"><strong>'+esc(h.message)+'</strong></div>'+
          '<small>'+esc(h.page)+' · '+fmtTime(h.created_at)+'</small></div>';
      }).join('')+'</div>';
    }else{
      html+='<p class="muted">No auto-fixes needed — the app is running clean. Hank is watching.</p>';
    }
    html+='</section>';

    // Errors by page
    html+='<section class="card span6"><h2>⚠️ Errors by page (7 days)</h2>';
    if(errByPage.length){
      html+='<div class="list">'+errByPage.map(function(e){
        return '<div class="row"><div class="row-top"><strong>'+esc(e[0])+'</strong>'+
          '<span class="pill '+(e[1]>10?'bad':e[1]>3?'pending':'good')+'">'+e[1]+'</span></div></div>';
      }).join('')+'</div>';
      var top=errors.slice(0,5);
      html+='<h3 style="margin-top:12px">Latest errors</h3><div class="list">'+top.map(function(r){
        return '<div class="row"><div class="row-top"><strong>'+esc(text(r.message).slice(0,80))+'</strong></div>'+
          '<small>'+esc(r.page)+' · '+fmtTime(r.created_at)+'</small></div>';
      }).join('')+'</div>';
    }else{
      html+='<p class="muted">Zero errors in the last 7 days. 🎉</p>';
    }
    html+='</section>';

    // Perf
    html+='<section class="card span6"><h2>⏱️ Performance (7-day avg)</h2>';
    if(loadAvgs.length){
      html+='<div class="list">'+loadAvgs.map(function(p){
        var slow=p[1]>5000;
        return '<div class="row"><div class="row-top"><strong>'+esc(p[0])+'</strong>'+
          '<span class="pill '+(slow?'bad':'good')+'">'+(p[1]/1000).toFixed(1)+'s load</span></div>'+
          '<small>'+p[2]+' samples</small></div>';
      }).join('')+'</div>';
    }else{html+='<p class="muted">No performance data yet.</p>';}
    html+='</section>';

    // Top used features
    html+='<section class="card span6"><h2>👆 Most used (7 days)</h2>';
    if(topClicks.length){
      html+='<div class="list">'+topClicks.map(function(c){
        return '<div class="row"><div class="row-top"><strong>'+esc(c[0])+'</strong>'+
          '<span class="pill">'+c[1]+'</span></div></div>';
      }).join('')+'</div>';
    }else{html+='<p class="muted">No usage data yet.</p>';}
    html+='</section>';

    html+='</div>';
  }catch(err){
    html='<p class="muted">Could not load health data: '+esc(err.message)+'</p>';
  }
  container.innerHTML=html;
}

async function renderPlatformView(container){
  // Platform owner only: cross-tenant analytics. RLS policy
  // "platform owner reads all health events" gates this server-side.
  var html='<section class="card span12"><h2>🌐 Platform-wide (all tenants)</h2><div id="h38-platform-health"><p class="muted">Loading…</p></div></section>';
  container.insertAdjacentHTML('beforeend',html);
  var target=container.querySelector('#h38-platform-health');
  try{
    var errors=await queryEvents({types:['error'],since:since(7),limit:1000});
    var usage=await queryEvents({types:['usage'],since:since(7),limit:1000});
    var perf=await queryEvents({types:['perf'],since:since(7),limit:1000});
    var bizIds={};
    errors.concat(usage,perf).forEach(function(r){bizIds[r.business_id]=true;});
    var tenantCount=Object.keys(bizIds).length;
    if(tenantCount<=1){
      target.innerHTML='<p class="muted">Only H38 data visible — no other tenants reporting yet, or this account lacks platform access.</p>';
      return;
    }
    var errByPage=countBy(errors,'page').slice(0,10);
    var featUse=countBy(usage.filter(function(r){return r.message==='click';}).map(function(r){
      return{page:text((r.meta&&r.meta.label)||'?').slice(0,50)};}),'page').slice(0,10);
    var slowPages=avgBy(perf.filter(function(r){return r.message==='page_load';}),'page',function(r){return r.meta&&r.meta.valueMs;})
      .filter(function(p){return p[1]>4000;}).slice(0,10);

    var out='<p><strong>'+tenantCount+'</strong> tenants reporting · <strong>'+errors.length+'</strong> errors · <strong>'+usage.length+'</strong> usage events (7 days)</p><div class="grid">';
    out+='<section class="card span4"><h3>🔥 Error hotspots</h3><div class="list">'+
      (errByPage.map(function(e){return '<div class="row"><div class="row-top"><strong>'+esc(e[0])+'</strong><span class="pill '+(e[1]>10?'bad':'pending')+'">'+e[1]+'</span></div></div>';}).join('')||'<p class="muted">None</p>')+'</div></section>';
    out+='<section class="card span4"><h3>📊 Top features</h3><div class="list">'+
      (featUse.map(function(e){return '<div class="row"><div class="row-top"><strong>'+esc(e[0])+'</strong><span class="pill">'+e[1]+'</span></div></div>';}).join('')||'<p class="muted">None</p>')+'</div></section>';
    out+='<section class="card span4"><h3>🐌 Slow pages (&gt;4s)</h3><div class="list">'+
      (slowPages.map(function(p){return '<div class="row"><div class="row-top"><strong>'+esc(p[0])+'</strong><span class="pill bad">'+(p[1]/1000).toFixed(1)+'s</span></div></div>';}).join('')||'<p class="muted">None</p>')+'</div></section>';
    out+='</div>';
    target.innerHTML=out;
  }catch(err){
    target.innerHTML='<p class="muted">Platform data unavailable: '+esc(err.message)+'</p>';
  }
}

function render(){
  // Gate 2: block the route for non-H38 tenants.
  if(!isH38()) return;
  if(!isOwner()) return;
  var grid=document.querySelector('#mainContent .grid');
  if(!grid||document.getElementById('h38-health-card')) return;
  var card=document.createElement('section');
  card.className='card span12';
  card.id='h38-health-card';
  card.innerHTML='<h2>❤️ App Health</h2><p class="muted small">Errors, performance, and Hank\'s auto-fixes. H38 only.</p><div id="h38-health-body"><p class="muted">Loading health data…</p></div>';
  // Insert right after the Owner Controls card when present.
  var oc=document.getElementById('ownerControlsSection');
  if(oc&&oc.closest('section')) oc.closest('section').after(card);
  else grid.appendChild(card);
  var body=card.querySelector('#h38-health-body');
  var bid=businessId();
  renderTenantView(body,bid).then(function(){
    // Platform view only for the H38 owner (Ricky).
    if(isH38()&&isOwner()) renderPlatformView(body);
  });
}

function maybeRender(){
  try{
    if(window.state&&window.state.page==='settings') render();
  }catch(e){}
}

// Re-check on navigation (settings page renders dynamically).
var lastCheck=0;
setInterval(function(){
  var t=Date.now();
  if(t-lastCheck<2000) return;
  lastCheck=t;
  maybeRender();
},2000);

window.H38HealthDashboard={BUILD:BUILD,render:render,isH38:isH38};

})();
