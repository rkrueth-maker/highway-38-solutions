(function(){
'use strict';
// H38 Recommended Vendors — phase 1 (optional, toggle-gated, default OFF).
// The curated partner list lives in the Highway 38 tenant and is served only
// through the h38-vendor-directory edge function, which checks the user's
// membership and this business's recommended_vendors module setting before
// returning anything. Nothing renders while the owner toggle is OFF.
const BUILD='20261007-recommended-vendors-1';
const FN_SLUG='h38-vendor-directory';
const H38_BUSINESS_ID='10b85a89-5834-436d-95b0-c6ee2eb335ad';
const CATEGORIES=['Material Suppliers','Equipment Rental','Disposal & Dumpsters','Portable Toilets','Inspectors','Real-Estate Photography','Bookkeeping','Sign Shops','Small-Engine Repair','Other'];
const text=v=>String(v==null?'':v).trim();
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state=()=>window.state||{};
const cache={partners:null,applications:null,loaded:false};
function isEnabled(){try{return !!(window.H38OwnerControls&&typeof window.H38OwnerControls.isRecommendedVendorsEnabled==='function'&&window.H38OwnerControls.isRecommendedVendorsEnabled());}catch(e){return false;}}
function isH38(){return text(state().businessId)===H38_BUSINESS_ID;}
async function callVendorFn(body){
  const cfg=window.H38_BUSINESS_OFFICE_SUPABASE||{};
  if(!cfg.url) throw new Error('Business Office connection is unavailable.');
  const api=window.H38_SUPABASE_SHARED_CLIENT&&window.H38_SUPABASE_SHARED_CLIENT.ensure?window.H38_SUPABASE_SHARED_CLIENT.ensure():null;
  let token='';
  if(api){try{const s=await api.auth.getSession();token=s&&s.data&&s.data.session?s.data.session.access_token:'';}catch(e){}}
  const res=await fetch(cfg.url+'/functions/v1/'+FN_SLUG,{method:'POST',mode:'cors',cache:'no-store',credentials:'omit',
    headers:{'content-type':'application/json','x-client-info':BUILD,...(token?{authorization:'Bearer '+token}:{})},
    body:JSON.stringify(body)});
  const out=await res.json().catch(()=>({}));
  if(!res.ok||out.status!=='PASS') throw new Error(out.message||('Vendor directory failed ('+res.status+').'));
  return out;
}
function partnerCard(p){
  const chips=[];
  if(p.test)chips.push('<span class="pill pending">TEST — not a real listing</span>');
  if(p.featured)chips.push('<span class="pill">Featured</span>');
  if(p.paidPlacement)chips.push('<span class="pill">Paid placement</span>');
  const call=p.phone?' <a class="h38-rv-call" href="tel:'+esc(p.phone.replace(/[^+\d]/g,''))+'" style="display:inline-flex;align-items:center;min-height:44px;padding:0 14px;border:1px solid currentColor;border-radius:8px;text-decoration:none">📞 '+esc(p.phone)+'</a>':'';
  const site=p.website?' <a href="'+esc(p.website)+'" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;min-height:44px;padding:0 10px">Website ↗</a>':'';
  return '<div class="row"><div class="row-top"><strong>'+esc(p.name)+'</strong><span class="pill">'+esc(p.category)+'</span></div>'+
    (chips.length?'<div style="margin:4px 0">'+chips.join(' ')+'</div>':'')+
    (p.serviceArea?'<small>📍 '+esc(p.serviceArea)+'</small>':'')+
    (p.blurb?'<p class="small" style="margin:6px 0">'+esc(p.blurb)+'</p>':'')+
    (p.paidPlacement?'<small class="muted">Paid placement'+(p.placementDisclosure?' — '+esc(p.placementDisclosure):'')+'</small>':'')+
    '<div class="row-actions" style="margin-top:6px">'+call+site+'</div></div>';
}
function directoryHtml(){
  const head=typeof pageHead==='function'?pageHead('Recommended Vendors','Local suppliers and services that Highway 38 recommends. Every partner is reviewed before listing — no fake endorsements, and paid placement is always labeled.'):'<header class="page-head"><div><h1>Recommended Vendors</h1></div></header>';
  const intro='<section class="card span12"><h2>How this list works</h2><p class="muted small">Highway 38 approves every partner on this list before they appear. Listings are free while the network is growing; if a partner ever pays for placement, it says so right on their card. Know a supplier or service your crew already trusts? Recommend them below — applications go to Highway 38 for review, and nobody is listed automatically.</p><div id="h38RvList"><p class="muted">Loading partners…</p></div></section>';
  const form='<section class="card span12"><h2>Recommend a partner</h2>'+
    '<form id="h38RvApplyForm"><div class="two"><div><label>Business name *</label><input name="businessName" required maxlength="200"></div>'+
    '<div><label>Category *</label><select name="category" required><option value="">Choose…</option>'+CATEGORIES.map(c=>'<option>'+esc(c)+'</option>').join('')+'</select></div></div>'+
    '<label>What do they do?</label><input name="whatTheyDo" maxlength="500" placeholder="One line — e.g. lumber, hardware, and jobsite delivery">'+
    '<label>Service area *</label><input name="serviceArea" required maxlength="300" placeholder="Towns or radius they cover">'+
    '<div class="two"><div><label>Your contact there</label><input name="contactName" maxlength="200" placeholder="Name at the business"></div>'+
    '<div><label>Phone</label><input name="phone" maxlength="60"></div></div>'+
    '<div class="two"><div><label>Email</label><input name="email" type="email" maxlength="200"></div>'+
    '<div><label>Website</label><input name="website" maxlength="500" placeholder="https://"></div></div>'+
    '<label>Why recommend them?</label><textarea name="referralSource" maxlength="500" placeholder="Who already works with them — your business, a crew you know…"></textarea>'+
    '<input name="website2" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">'+
    '<div class="actions"><button type="submit">Send for Highway 38 review</button></div>'+
    '<p class="muted small" id="h38RvApplyNote">Sending an application never lists anyone by itself — Highway 38 reviews every application first.</p></form></section>';
  const review=isH38()?'<section class="card span12"><h2>Partner applications to review</h2><div id="h38RvApplications"><p class="muted">Loading applications…</p></div></section>':'';
  return '<div class="grid">'+head+intro+form+review+'</div>';
}
function renderDirectory(){
  const main=document.getElementById('mainContent');
  if(!main) return;
  main.innerHTML=directoryHtml();
  try{if(typeof window.scrollTo==='function')window.scrollTo(0,0);}catch(e){}
  bindApplyForm();
  loadPartners();
  if(isH38()) loadApplications();
}
async function loadPartners(){
  const box=document.getElementById('h38RvList');
  if(!box) return;
  try{
    const out=await callVendorFn({action:'list',businessId:text(state().businessId)});
    cache.partners=out.partners||[]; cache.loaded=true;
    if(!cache.partners.length){
      box.innerHTML='<p class="muted">No recommended partners yet — Highway 38 is building this list now. When partners are approved, they will show up here with tap-to-call numbers. Know someone good? Recommend them with the form below.</p>';
      return;
    }
    const cats=[];
    cache.partners.forEach(p=>{if(!cats.includes(p.category))cats.push(p.category);});
    box.innerHTML=cats.map(cat=>'<h3 style="margin:14px 0 6px">'+esc(cat)+'</h3><div class="list">'+cache.partners.filter(p=>p.category===cat).map(partnerCard).join('')+'</div>').join('');
  }catch(e){
    box.innerHTML='<p class="muted">Could not load the partner list: '+esc(e&&e.message?e.message:e)+'</p><div class="actions"><button type="button" class="secondary" id="h38RvRetry">Retry</button></div>';
    const retry=document.getElementById('h38RvRetry');
    if(retry) retry.onclick=loadPartners;
  }
}
function bindApplyForm(){
  const form=document.getElementById('h38RvApplyForm');
  if(!form||form.dataset.h38Bound) return;
  form.dataset.h38Bound='1';
  form.onsubmit=async ev=>{
    ev.preventDefault();
    const fd=new FormData(form);
    const body={action:'apply',businessName:fd.get('businessName'),category:fd.get('category'),whatTheyDo:fd.get('whatTheyDo'),
      serviceArea:fd.get('serviceArea'),contactName:fd.get('contactName'),phone:fd.get('phone'),email:fd.get('email'),
      website:fd.get('website'),referralSource:fd.get('referralSource'),website2:fd.get('website2'),sourceBusinessId:text(state().businessId)};
    try{
      await callVendorFn(body);
      form.reset();
      const note=document.getElementById('h38RvApplyNote');
      if(note) note.textContent='Application sent. Highway 38 will review it — thanks for the recommendation.';
      if(typeof toast==='function') toast('Application sent for Highway 38 review. Nobody is listed automatically.');
    }catch(e){
      if(typeof toast==='function') toast(e&&e.message?e.message:String(e),true);
    }
  };
}
function applicationRow(a){
  const decided=a.status&&a.status!=='Pending Review';
  const actions=decided?'<span class="pill">'+esc(a.status)+'</span>':
    '<button type="button" class="secondary" data-h38-rv-approve="'+esc(a.id)+'">Approve &amp; list</button> <button type="button" class="secondary" data-h38-rv-pass="'+esc(a.id)+'">Not listed</button>';
  return '<div class="row"><div class="row-top"><strong>'+esc(a.businessName)+'</strong><span class="pill">'+esc(a.category||'Other')+'</span></div>'+
    (a.test?'<div style="margin:4px 0"><span class="pill pending">TEST — not a real application</span></div>':'')+
    '<small>'+esc(a.whatTheyDo||'')+'</small>'+
    '<small>📍 '+esc(a.serviceArea||'')+' · '+esc(a.contactName||'')+(a.phone?' · '+esc(a.phone):'')+(a.email?' · '+esc(a.email):'')+'</small>'+
    (a.referralSource?'<small>Recommended by: '+esc(a.referralSource)+'</small>':'')+
    '<div class="row-actions" style="margin-top:6px">'+actions+'</div></div>';
}
async function loadApplications(){
  const box=document.getElementById('h38RvApplications');
  if(!box) return;
  try{
    const out=await callVendorFn({action:'applications'});
    cache.applications=out.applications||[];
    if(!cache.applications.length){ box.innerHTML='<p class="muted">No applications yet. When vendors apply (or businesses recommend someone), they land here for your review — nothing is listed until you approve it.</p>'; return; }
    box.innerHTML='<div class="list">'+cache.applications.map(applicationRow).join('')+'</div>';
    box.querySelectorAll('[data-h38-rv-approve]').forEach(b=>{b.onclick=()=>decide(b.getAttribute('data-h38-rv-approve'),'approve');});
    box.querySelectorAll('[data-h38-rv-pass]').forEach(b=>{b.onclick=()=>decide(b.getAttribute('data-h38-rv-pass'),'pass');});
  }catch(e){
    box.innerHTML='<p class="muted">Could not load applications: '+esc(e&&e.message?e.message:e)+'</p>';
  }
}
async function decide(applicationId,decision){
  try{
    const out=await callVendorFn({action:'decide',applicationId,decision});
    if(typeof toast==='function') toast(decision==='approve'?'Partner listed. It now shows in every Office with Recommended Vendors on.':'Application marked not listed.');
    await loadApplications();
    if(decision==='approve') loadPartners();
  }catch(e){
    if(typeof toast==='function') toast(e&&e.message?e.message:String(e),true);
  }
}
function install(){
  try{
    if(window.PAGE_DEFS&&!window.PAGE_DEFS['vendors'])window.PAGE_DEFS['vendors']=['🤝','Vendors'];
    const baseAllowed=window.allowedPages;
    if(typeof baseAllowed==='function'&&!baseAllowed.__h38Vendors){
      const wrapped=function(){const pages=baseAllowed.apply(this,arguments).slice();
        if(isEnabled()&&(state().shell||'office')==='office'&&pages.indexOf('vendors')<0){
          const at=pages.indexOf('documents');
          if(at>=0)pages.splice(at+1,0,'vendors'); else pages.push('vendors');
        }
        return pages;};
      wrapped.__h38Vendors=true;
      window.allowedPages=wrapped;
    }
    const baseNav=window.renderNav;
    if(typeof baseNav==='function'&&!baseNav.__h38Vendors){
      const wrapped=function(){const result=baseNav.apply(this,arguments);
        try{
          const nav=document.getElementById('mainNav');
          if(isEnabled()&&(state().shell||'office')==='office'&&nav&&!nav.querySelector('[data-page="vendors"]')){
            const button=document.createElement('button');
            button.type='button';
            button.dataset.page='vendors';
            button.className=state().page==='vendors'?'active':'';
            button.innerHTML='<span class="nav-icon">🤝</span><span>Vendors</span>';
            button.onclick=function(){if(window.openPage)window.openPage('vendors');};
            const docBtn=nav.querySelector('[data-page="documents"]');
            if(docBtn)docBtn.insertAdjacentElement('afterend',button);else nav.appendChild(button);
          }
        }catch(e){}
        return result;};
      wrapped.__h38Vendors=true;
      window.renderNav=wrapped;
    }
    const baseRender=window.renderPage;
    if(typeof baseRender==='function'&&!baseRender.__h38Vendors){
      const wrapped=function(){
        if(isEnabled()&&state().page==='vendors'){renderDirectory();return;}
        return baseRender.apply(this,arguments);};
      wrapped.__h38Vendors=true;
      window.renderPage=wrapped;
    }
    const baseOpen=window.openPage;
    if(typeof baseOpen==='function'&&!baseOpen.__h38Vendors){
      const wrapped=function(page){
        if(isEnabled()&&page==='vendors'){
          state().page='vendors';
          try{if(window.renderNav)window.renderNav();}catch(e){}
          renderDirectory();
          try{const f=document.getElementById('mainContent');if(f&&f.focus)f.focus({preventScroll:true});}catch(e){}
          return;
        }
        return baseOpen.apply(this,arguments);};
      wrapped.__h38Vendors=true;
      window.openPage=wrapped;
    }
  }catch(e){/* integration must never break the Office shell */}
}
window.H38RecommendedVendors={isEnabled:isEnabled,refresh:loadPartners,BUILD:BUILD};
install();
})();
