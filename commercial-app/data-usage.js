/* H38 Data & Storage — per-person memory storage (15 GB included per person).
 *
 * Settings card:
 *  - Every signed-in person sees their OWN meter: "Your memory storage:
 *    X of 15 GB included" with a photos / videos / other files split
 *    (snapshot from public.business_data_usage_people, metered daily by
 *    compute_business_data_usage). The meter counts ALL of the person's
 *    files; records/text are shown for visibility and never counted.
 *  - Owners/administrators additionally see the per-person list for their
 *    business, plus the year export/purge controls. The free way back under
 *    the limit: export one year of data (records + files) via the
 *    h38-data-dump edge function, then — as a separate, explicit, owner-only
 *    step — purge that year's bulk. Accounting records (invoices, payments,
 *    GL, payroll, tax) and customer records are always retained server-side;
 *    the purge copy says so plainly.
 *  - Nothing here charges, sends, or blocks anything.
 * Lazy-loaded with the Settings page group (h38-script-loader PAGE_SETTINGS):
 * zero startup cost, on-demand only (MODULE_PERFORMANCE_STANDARD).
 */
(function(){
'use strict';

var BUILD='20261022-perperson-1';
var H38_KEY='highway38';

function text(v){return String(v==null?'':v).trim();}
function esc(s){return text(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function businessId(){try{return text(window.state&&window.state.businessId);}catch(e){return '';}}
function businessKey(){try{return text(window.state&&window.state.snapshot&&window.state.snapshot.business&&window.state.snapshot.business.businessKey);}catch(e){return '';}}
function isOwnerAdmin(){
  try{
    var u=window.state&&window.state.snapshot&&window.state.snapshot.user;
    return !!(u&&(u.owner===true||/owner|administrator/i.test(text(u.roleName||u.role||''))));
  }catch(e){return false;}
}
function myId(){
  try{
    var u=window.state&&window.state.snapshot&&window.state.snapshot.user;
    return text(u&&(u.userId||u.id||''));
  }catch(e){return '';}
}
function api(){
  try{
    return window.H38_SUPABASE_SHARED_CLIENT&&window.H38_SUPABASE_SHARED_CLIENT.ensure
      ? window.H38_SUPABASE_SHARED_CLIENT.ensure() : null;
  }catch(e){return null;}
}
function fmtBytes(n){
  n=Number(n)||0;
  if(n>=1073741824) return (n/1073741824).toFixed(2)+' GB';
  if(n>=1048576) return (n/1048576).toFixed(1)+' MB';
  if(n>=1024) return (n/1024).toFixed(1)+' KB';
  return n+' B';
}
function fmtLimit(n){
  n=Number(n)||16106127360;
  if(n%1073741824===0) return (n/1073741824)+' GB';
  return fmtBytes(n);
}
function fmtDate(iso){
  try{return new Date(iso).toLocaleDateString([], {month:'short', day:'numeric', year:'numeric'});}
  catch(e){return text(iso).slice(0,10);}
}

var S={usage:null, mine:null, people:[], dumps:[], years:[], yearsLoaded:false, selectedYear:null, busy:'', error:'', purgeArmYear:null, loaded:false};

function fallbackYears(){
  var nowY=new Date().getFullYear();
  return [nowY, nowY-1, nowY-2];
}

/* The real year list comes from the h38-data-dump edge function, but Settings
 * must render with zero automatic function work (the route verifier asserts
 * this), so years are fetched lazily — only inside the user-initiated Export
 * action — and the select renders with a local fallback list until then. */
async function ensureYears(){
  if(S.yearsLoaded) return;
  S.yearsLoaded=true;
  try{
    var y=await invokeDump({action:'years', businessId:businessId()});
    var ys=(y.years||[]).map(Number).filter(function(n){return n>0;});
    if(ys.length) S.years=ys;
  }catch(e){ /* keep the fallback list */ }
  if(!S.years.length) S.years=fallbackYears();
  if(!S.selectedYear||S.years.indexOf(Number(S.selectedYear))<0) S.selectedYear=S.years[0];
}

async function invokeDump(payload){
  var client=api();
  if(!client) throw new Error('Secure connection unavailable.');
  var res=await client.functions.invoke('h38-data-dump',{body:payload});
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

async function load(){
  var client=api();
  if(!client) throw new Error('Secure connection unavailable.');
  var bid=businessId();
  var uid=myId();
  // The signed-in person's own meter (RLS: own row is readable by any member).
  if(uid){
    var m=await client.from('business_data_usage_people').select('*')
      .eq('business_id',bid).eq('person_id',uid).maybeSingle();
    if(m.error) throw new Error(m.error.message||'Could not load your memory storage.');
    S.mine=m.data||null;
  }
  if(isOwnerAdmin()){
    var u=await client.from('business_data_usage').select('*').eq('business_id',bid).maybeSingle();
    if(u.error) throw new Error(u.error.message||'Could not load data usage.');
    S.usage=u.data||null;
    var pp=await client.from('business_data_usage_people').select('*')
      .eq('business_id',bid).order('files_bytes',{ascending:false});
    S.people=(pp&&!pp.error&&pp.data)||[];
    var d=await client.from('business_data_dumps').select('*').eq('business_id',bid).order('dump_year',{ascending:false});
    S.dumps=(d&&!d.error&&d.data)||[];
  }
  if(!S.years.length) S.years=fallbackYears();
  if(!S.selectedYear||S.years.indexOf(Number(S.selectedYear))<0) S.selectedYear=S.years[0];
  S.loaded=true;
}

function dumpForYear(y){
  for(var i=0;i<S.dumps.length;i++){ if(Number(S.dumps[i].dump_year)===Number(y)) return S.dumps[i]; }
  return null;
}

function meterHtml(u, mine){
  var limit=Number(u.limit_bytes)||16106127360;
  var total=Number(u.files_bytes)||0;
  var pct=Math.min(100, Number(u.pct_of_limit)||0);
  var barColor=u.threshold_state==='over'?'#c0392b':(u.threshold_state==='warning'?'#d4a017':'#2e7d32');
  var h='';
  h+='<p style="font-size:1.05em"><strong>'+(mine?'Your memory storage: ':'')+esc(fmtBytes(total))+' of '+esc(fmtLimit(limit))+' included</strong> <span class="muted">('+(Number(u.pct_of_limit)||0)+'% · updated '+esc(fmtDate(u.computed_at))+')</span></p>';
  h+='<div style="background:#e8e8e8;border-radius:6px;height:10px;overflow:hidden;margin:6px 0 10px"><div style="height:100%;width:'+pct+'%;background:'+barColor+'"></div></div>';
  h+='<div class="list">'
    +'<div class="row"><div class="row-top"><span>🖼️ Photos</span><strong>'+esc(fmtBytes(u.files_photos_bytes))+'</strong></div></div>'
    +'<div class="row"><div class="row-top"><span>🎬 Videos</span><strong>'+esc(fmtBytes(u.files_videos_bytes))+'</strong></div></div>'
    +'<div class="row"><div class="row-top"><span>📄 Other files</span><strong>'+esc(fmtBytes(u.files_other_bytes))+'</strong></div></div>'
    +'<div class="row"><div class="row-top"><span>🗂️ Records <span class="muted">(not counted)</span></span><strong>'+esc(fmtBytes(u.records_bytes))+'</strong></div></div>'
    +'</div>';
  return h;
}

function usageHtml(){
  var u=S.mine;
  if(!u) return '<p class="muted">No usage snapshot yet — the meter runs daily. Check back tomorrow.</p>';
  var h=meterHtml(u, true);
  if(u.threshold_state==='warning'){
    h+='<div class="card" style="background:#fdf6e0;margin-top:10px"><p><strong>You\'re approaching your included 15 GB of memory storage.</strong> 15 GB included and $5 for 50 GB more — quoted first, nothing is charged automatically.</p>'
      +'<p class="muted small">Videos — like site walkthroughs — are usually the biggest part. Export a year of your data and clear its old files — it\'s free (ask your account owner if you don\'t see export controls).</p></div>';
  }
  if(u.threshold_state==='over'){
    h+='<div class="card" style="background:#fdecea;margin-top:10px"><p><strong>You\'ve passed your included 15 GB of memory storage.</strong> Nothing is cut off and nothing is charged automatically — your Office keeps working.</p>'
      +'<p class="muted small">Free up space with a year export (videos like site walkthroughs are usually the biggest part), or extra storage can be quoted: $5 for 50 GB more.</p></div>';
  }
  return h;
}

function peopleHtml(){
  if(!isOwnerAdmin()||!S.people.length) return '';
  var uid=myId();
  var rows=S.people.map(function(r){
    var name=text(r.person_email)||r.person_id;
    var state=r.threshold_state==='over'?' · <strong style="color:#c0392b">over limit</strong>'
      :(r.threshold_state==='warning'?' · <strong style="color:#d4a017">warning</strong>':'');
    return '<div class="row"><div class="row-top"><span>'+esc(name)+(r.person_id===uid?' (you)':'')+'</span><span><strong>'+esc(fmtBytes(r.files_bytes))+'</strong> · '+(Number(r.pct_of_limit)||0)+'%'+state+'</span></div></div>';
  }).join('');
  return '<h3 style="margin-top:14px">👥 Memory storage by person</h3>'
    +'<p class="muted small">Each person gets their own 15 GB of memory storage included. Files a person uploads count toward their own meter.</p>'
    +'<div class="list">'+rows+'</div>';
}

function dumpHtml(){
  var h='<h3 style="margin-top:14px">Free up space — export a year</h3>';
  h+='<p class="muted small">Download a complete copy of one year — every record plus your files — as a zip archive. The export itself deletes nothing. After your export is ready you can purge that year\'s old files and operational records from the server; invoices, payments, accounting, payroll, tax records and customer records always stay. Photos you have marked as gallery / examples of your work also stay on the server.</p>';
  h+='<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0">'
    +'<label>Year <select id="h38-dump-year">'+S.years.map(function(y){
        return '<option value="'+y+'"'+(Number(S.selectedYear)===y?' selected':'')+'>'+y+'</option>';
      }).join('')+'</select></label>'
    +'<button type="button" class="btn" data-act="export" '+(S.busy?'disabled':'')+'>'+(S.busy==='export'?'Building your export…':'Export this year')+'</button>'
    +(S.busy==='export'?'<span class="muted small">Large years can take a few minutes.</span>':'')
    +'</div>';
  if(S.error) h+='<p style="color:#c0392b">'+esc(S.error)+'</p>';
  var dump=dumpForYear(S.selectedYear);
  if(dump){
    h+='<div class="card" style="margin-top:8px">';
    if(dump.status==='ready'||dump.status==='purged'){
      h+='<p><strong>'+esc(dump.dump_year)+' export is ready</strong> — '+esc(dump.records_exported)+' records, '+esc(dump.files_exported)+' files ('+esc(fmtBytes(dump.files_bytes_exported))+').</p>';
      var links=(dump.downloads||[]);
      // downloads are attached by the edge function on create/status; the table
      // read does not carry them, so offer a refresh that mints fresh links.
      if(links.length){
        h+='<p>'+links.map(function(l,i){
          return '<a href="'+esc(l.url)+'" rel="noopener">⬇️ Download part '+(i+1)+'</a>';
        }).join(' · ')+'</p>';
      }else{
        h+='<p><button type="button" class="btn" data-act="links" '+(S.busy?'disabled':'')+'>Get download links</button></p>';
      }
    }
    if(dump.status==='building') h+='<p class="muted">Export is building…</p>';
    if(dump.status==='failed') h+='<p style="color:#c0392b">Export failed: '+esc(dump.error||'unknown error')+'</p>';
    if(dump.status==='ready'){
      if(S.purgeArmYear===Number(dump.dump_year)){
        h+='<div style="border-top:1px solid #ddd;margin-top:10px;padding-top:10px">'
          +'<p><strong>Purge '+esc(dump.dump_year)+' from the server?</strong></p>'
          +'<p class="muted small">Purged data leaves the server. Your downloaded export is your copy — keep it safe. Invoices, payments, accounting, payroll, tax records and customer records always stay on the server. Photos you have marked as gallery / examples of your work are never removed. What gets removed: old job photos, site-scan captures, attachments and old operational records for '+esc(dump.dump_year)+'.</p>'
          +'<label style="display:block;margin:8px 0"><input type="checkbox" id="h38-purge-ack"> I have downloaded my copy of the '+esc(dump.dump_year)+' export.</label>'
          +'<button type="button" class="btn" data-act="purge-confirm" '+(S.busy?'disabled':'')+'>'+(S.busy==='purge'?'Purging…':'Yes, purge '+esc(dump.dump_year))+'</button> '
          +'<button type="button" class="btn" data-act="purge-cancel">Cancel</button>'
          +'</div>';
      }else{
        h+='<p style="margin-top:8px"><button type="button" class="btn" data-act="purge-open">Purge '+esc(dump.dump_year)+' from the server…</button></p>';
      }
    }
    if(dump.status==='purged'){
      h+='<p class="muted small">✅ Purged '+esc(fmtDate(dump.purged_at))+' — freed '+esc(fmtBytes(dump.purge_bytes_freed))+' ('+esc(dump.purge_records_deleted)+' records, '+esc(dump.purge_files_deleted)+' files). Accounting and customer records were kept.</p>';
    }
    if(dump.status==='archive_deleted'){
      h+='<p class="muted small">The stored export copy was deleted from the server.</p>';
    }
    if(dump.status==='ready'||dump.status==='purged'){
      h+='<p class="muted small">The export copy stored on the server counts toward memory storage until you delete it. <button type="button" class="btn" data-act="delete-dump" '+(S.busy?'disabled':'')+'>Delete my stored export</button></p>';
    }
    h+='</div>';
  }
  return h;
}

async function platformHtml(){
  if(businessKey()!==H38_KEY||!isOwnerAdmin()) return '';
  try{
    var client=api(); if(!client) return '';
    var res=await client.from('business_data_usage')
      .select('business_id,files_bytes,pct_of_limit,threshold_state,businesses(display_name)')
      .order('pct_of_limit',{ascending:false}).limit(50);
    if(res.error||!res.data||res.data.length<=1) return '';
    var rows=res.data.map(function(r){
      var name=(r.businesses&&r.businesses.display_name)||r.business_id;
      return '<div class="row"><div class="row-top"><span>'+esc(name)+'</span><span><strong>'+esc(fmtBytes(r.files_bytes))+'</strong> files · biggest person at '+esc(r.pct_of_limit)+'% · '+esc(r.threshold_state)+'</span></div></div>';
    }).join('');
    return '<h3 style="margin-top:14px">🌐 All businesses (platform)</h3><div class="list">'+rows+'</div>';
  }catch(e){ return ''; }
}

function renderBody(){
  var body=document.getElementById('h38-data-usage-body');
  if(!body) return;
  if(!S.loaded){ body.innerHTML='<p class="muted">Loading data usage…</p>'; return; }
  body.innerHTML=usageHtml()+peopleHtml()+(isOwnerAdmin()?dumpHtml():'')+'<div id="h38-data-usage-platform"></div>';
  platformHtml().then(function(html){
    var t=document.getElementById('h38-data-usage-platform');
    if(t) t.innerHTML=html;
  });
}

async function refresh(){
  S.error='';
  try{ await load(); }
  catch(e){ S.error=text(e.message); S.loaded=true; }
  renderBody();
}

async function onAction(act){
  var bid=businessId();
  var dump=dumpForYear(S.selectedYear);
  try{
    if(act==='export'){
      S.busy='export'; renderBody();
      await ensureYears(); renderBody();
      var out=await invokeDump({action:'create', businessId:bid, year:Number(S.selectedYear)});
      if(out.dump){
        var idx=S.dumps.findIndex(function(d){return Number(d.dump_year)===Number(out.dump.dump_year);});
        if(idx>=0) S.dumps[idx]=out.dump; else S.dumps.unshift(out.dump);
      }
    }
    if(act==='links'&&dump){
      S.busy='links'; renderBody();
      var st=await invokeDump({action:'status', businessId:bid, dumpId:dump.id});
      if(st.dump){
        var i2=S.dumps.findIndex(function(d){return d.id===st.dump.id;});
        if(i2>=0) S.dumps[i2]=st.dump;
      }
    }
    if(act==='purge-open'){ S.purgeArmYear=Number(S.selectedYear); }
    if(act==='purge-cancel'){ S.purgeArmYear=null; }
    if(act==='purge-confirm'&&dump){
      var ack=document.getElementById('h38-purge-ack');
      if(!ack||!ack.checked){ S.error='Check the box confirming you downloaded your copy first.'; renderBody(); return; }
      S.busy='purge'; renderBody();
      await invokeDump({action:'purge', businessId:bid, dumpId:dump.id, confirm:true});
      S.purgeArmYear=null;
      await refresh();
    }
    if(act==='delete-dump'&&dump){
      S.busy='delete'; renderBody();
      await invokeDump({action:'deleteDump', businessId:bid, dumpId:dump.id});
      await refresh();
    }
  }catch(e){
    S.error=text(e.message);
  }
  S.busy='';
  renderBody();
}

function render(){
  var grid=document.querySelector('#mainContent .grid');
  if(!grid||document.getElementById('h38-data-usage-card')) return;
  var card=document.createElement('section');
  card.className='card span12';
  card.id='h38-data-usage-card';
  card.innerHTML='<h2>💾 Data &amp; storage</h2>'
    +'<p class="muted small">15 GB of memory storage included for each person on your account — $5 for 50 GB more. It covers your files — mostly photos and videos. Records and text don\'t count. Extra storage is quoted first — never charged automatically, and nothing is ever cut off.</p>'
    +'<div id="h38-data-usage-body"><p class="muted">Loading data usage…</p></div>';
  var oc=document.getElementById('ownerControlsSection');
  if(oc&&oc.closest('section')) oc.closest('section').after(card);
  else grid.appendChild(card);
  card.addEventListener('click',function(ev){
    var t=ev.target&&ev.target.closest?ev.target.closest('[data-act]'):null;
    if(t) onAction(t.getAttribute('data-act'));
  });
  card.addEventListener('change',function(ev){
    if(ev.target&&ev.target.id==='h38-dump-year'){
      S.selectedYear=Number(ev.target.value);
      S.purgeArmYear=null;
      renderBody();
    }
  });
  refresh();
}

function maybeRender(){
  try{
    if(window.state&&window.state.page==='settings') render();
  }catch(e){}
}

var lastCheck=0;
setInterval(function(){
  var t=Date.now();
  if(t-lastCheck<2000) return;
  lastCheck=t;
  maybeRender();
},2000);

window.H38DataUsage={BUILD:BUILD, render:render, refresh:refresh};

})();
