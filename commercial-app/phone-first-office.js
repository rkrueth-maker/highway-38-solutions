(function(){
'use strict';
const BUILD='20261031-phoneb-5';
const MOBILE='(max-width: 760px)';
let scheduled=false,observer=null;
const text=v=>String(v==null?'':v).trim();
const esc=v=>typeof window.esc==='function'?window.esc(v):text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state=()=>window.state||{};
const snap=()=>state().snapshot||{};
const rows=name=>Array.isArray(snap()[name])?snap()[name]:[];
const val=(row,...keys)=>{for(const key of keys)if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];return'';};
const upper=v=>text(v).toUpperCase();
const mobile=()=>!!window.matchMedia?.(MOBILE).matches;
const signedIn=()=>!!snap().user;
const selectedCustomerId=()=>text(window.H38_CUSTOMER_360?.selectedCustomerId||'');
function openPage(page){window.openPage?.(page);}
function customerName(id){const r=rows('customers').find(x=>text(val(x,'Customer ID','customerId','id'))===text(id));return text(val(r,'Customer Name','name'))||'Customer';}
function fieldOpen(){const app=document.getElementById('h38FieldVisitApp');if(!app||app.hidden||app.getAttribute('aria-hidden')==='true')return false;try{return getComputedStyle(app).display!=='none'&&app.getClientRects().length>0;}catch(_){return false;}}
function ensureStyle(){
  if(document.getElementById('h38PhoneFirstOfficeStyle'))return;
  const s=document.createElement('style');s.id='h38PhoneFirstOfficeStyle';s.textContent=`
@media(max-width:760px){
 :root{--h38-bottom-ui-clearance:calc(184px + env(safe-area-inset-bottom,0px))}
 body.h38-phone-first-office #h38NewActionButton{display:none!important}
 body.h38-phone-first-office #mainContent{padding-bottom:var(--h38-bottom-ui-clearance)!important;scroll-padding-bottom:var(--h38-bottom-ui-clearance)!important}
 .h38-phone-create{position:fixed;right:16px;bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:2490;width:58px;height:58px;border-radius:50%;border:0;box-shadow:0 10px 28px rgba(11,36,56,.28);font-size:30px;font-weight:900;display:grid;place-items:center;background:var(--navy,#0b2438);color:#fff}.h38-phone-create[hidden],body:has(dialog[open]) .h38-phone-create{display:none!important}
 body.h38-phone-first-office .toast{right:84px!important;bottom:calc(88px + env(safe-area-inset-bottom,0px))!important;max-width:calc(100vw - 104px)!important}
 .h38-phone-create-dialog{width:min(520px,calc(100vw - 18px));max-height:82dvh;border:0;border-radius:18px;padding:0}.h38-phone-create-dialog::backdrop{background:rgba(0,0,0,.55)}
 .h38-phone-create-shell{padding:16px;display:grid;gap:14px}.h38-phone-sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.h38-phone-sheet-head h2{margin:0}.h38-phone-sheet-head p{margin:4px 0 0;color:var(--muted,#607285);font-size:.86rem}
 .h38-phone-create-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.h38-phone-create-grid button{min-height:64px;text-align:left;display:grid;grid-template-columns:28px 1fr;align-items:center;gap:8px;padding:10px 12px}.h38-phone-create-grid button span{font-size:1.2rem}.h38-phone-create-grid button small{grid-column:2;color:var(--muted,#607285)}
 .h38-phone-today{display:grid;gap:10px;margin:0 0 12px}.h38-phone-card{background:var(--card,#fff);border:1px solid var(--line,#d6e0e8);border-radius:15px;padding:13px;box-shadow:0 4px 14px rgba(25,55,78,.06)}.h38-phone-card h2{margin:0 0 8px!important}.h38-phone-up-next{display:grid;gap:5px}.h38-phone-up-next strong{font-size:1.08rem}.h38-phone-up-actions,.h38-phone-customer-actions,.h38-phone-customer-tabs{display:flex;gap:7px;overflow:auto;padding-top:8px}.h38-phone-up-actions button,.h38-phone-customer-actions button,.h38-phone-customer-tabs button{min-height:42px;white-space:nowrap}.h38-phone-up-actions{flex-wrap:wrap;overflow:visible}.h38-phone-up-actions button{flex:1 1 auto;min-width:0}
 .h38-phone-attention{display:grid;gap:7px}.h38-phone-attention button{width:100%;text-align:left;padding:10px 11px;min-height:54px;display:grid;gap:2px}.h38-phone-attention small{color:var(--muted,#607285)}.h38-phone-dashboard-toggle{width:100%;min-height:44px}.h38-phone-simplified:not([data-h38-phone-details='1']) [data-h38-phone-secondary='1']{display:none!important}
 .h38-phone-customer-finder{display:grid;gap:9px;margin:0 0 10px}.h38-phone-customer-find-head{display:flex;justify-content:space-between;align-items:center;gap:8px}.h38-phone-customer-finder input{width:100%;min-height:46px;border-radius:12px}.h38-phone-customer-results{display:grid;gap:6px}.h38-phone-customer-results button{display:grid;text-align:left;gap:2px;padding:10px 12px}.h38-phone-customer-results small{color:var(--muted,#607285)}.h38-phone-customer-tools{margin:0 0 10px}.h38-phone-customer-tabs button.active{outline:2px solid currentColor}
 .h38-site-stepper{position:sticky;top:0;z-index:8;background:var(--card,#fff);border-bottom:1px solid var(--line,#d6e0e8);padding:8px 10px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}.h38-site-stepper span{font-size:.68rem;font-weight:800;text-align:center;padding:7px 3px;border-radius:999px;background:#edf1f4;color:#607285}.h38-site-stepper span.done{background:#e2f2e7;color:#1d6631}.h38-site-stepper span.current{background:var(--navy,#0b2438);color:#fff}
 @media(max-width:340px){.h38-phone-create{right:10px;width:54px;height:54px}.h38-phone-create-grid{grid-template-columns:1fr}.h38-phone-create-dialog{width:calc(100vw - 10px)}#mainNav.h38-five-primary-nav{padding-left:2px!important;padding-right:2px!important}#mainNav.h38-five-primary-nav button{padding-left:0!important;padding-right:0!important}#mainNav.h38-five-primary-nav button span:last-child{display:block!important;max-width:100%;overflow:visible!important;font-size:11px!important;line-height:1.15!important;letter-spacing:-.02em;white-space:nowrap}}
}`;(document.head||document.documentElement).appendChild(s);
}
/* Direction B create sheet (2026-10-31): Job · Quote · Invoice ·
   Customer. Every item navigates to the page and then triggers that
   page's EXISTING new-item action — the same controls the desktop
   Workbench palette clicks (#newQuoteButton, [data-h38-create=...],
   #h38AddCustomerTop). The sheet itself creates nothing, sends
   nothing, and charges nothing; creation happens inside the existing
   flows with their existing gates. Pages render async (lazy modules),
   so the trigger polls briefly for its control before falling back. */
function triggerWhenReady(find,fallback){
  let tries=0;
  const tick=()=>{const el=find();if(el){el.click();return;}if(++tries>=25){fallback?.();return;}setTimeout(tick,100);};
  tick();
}
/* After a create trigger fires, land the thumb on the opened form:
 * several create forms live inside a collapsed <details> disclosure
 * deep in a long page (the Jobs form sits ~13,000px down inside one,
 * measured live) and the pages' own New buttons leave it there too —
 * open the disclosure and scroll the form into view. */
function landOnForm(id){setTimeout(()=>{const f=document.getElementById(id);if(!f)return;const det=f.closest('details');if(det)det.open=true;f.scrollIntoView?.({behavior:'smooth',block:'start'});},900);}
function routeCreate(action){
  if(action==='job'){openPage('work');triggerWhenReady(()=>document.querySelector('[data-h38-create="jobForm"]'),()=>{if(window.H38ChooseCreation)window.H38ChooseCreation('work','jobForm');});landOnForm('jobForm');return;}
  if(action==='quote'){openPage('quotes');triggerWhenReady(()=>document.getElementById('newQuoteButton'),null);return;}
  if(action==='invoice'){openPage('money');triggerWhenReady(()=>document.querySelector('[data-h38-create="invoiceForm"]'),()=>document.getElementById('invoiceForm')?.scrollIntoView?.({block:'center'}));landOnForm('invoiceForm');return;}
  if(action==='customer'){openPage('customers');triggerWhenReady(()=>document.getElementById('h38AddCustomerTop'),()=>document.getElementById('customerForm')?.scrollIntoView?.({block:'center'}));landOnForm('customerForm');return;}
}
function createDialog(){
  let d=document.getElementById('h38PhoneCreateDialog');if(d)return d;
  d=document.createElement('dialog');d.id='h38PhoneCreateDialog';d.className='h38-phone-create-dialog';
  d.innerHTML=`<div class="h38-phone-create-shell"><div class="h38-phone-sheet-head"><div><h2>Create</h2><p>Start the thing you are doing now. Each one opens its usual form — nothing is sent or charged from here.</p></div><button type="button" class="icon-button" data-h38-close aria-label="Close">×</button></div><div class="h38-phone-create-grid">${[['job','🧰','Job','Opens the new-job form'],['quote','🧾','Quote','Opens the quote builder'],['invoice','💵','Invoice','Opens the invoice form'],['customer','👤','Customer','Opens the add-customer form']].map(([k,i,l,s])=>`<button type="button" data-h38-create="${k}"><span>${i}</span><strong>${l}</strong><small>${s}</small></button>`).join('')}</div></div>`;
  d.querySelector('[data-h38-close]').onclick=()=>d.close();d.querySelectorAll('[data-h38-create]').forEach(b=>b.onclick=()=>{d.close();routeCreate(b.dataset.h38Create);});document.body.appendChild(d);return d;
}
function ensureCreate(){
  let b=document.getElementById('h38PhoneCreateButton');
  /* Direction B: the + rides on every main phone screen (Today, Jobs,
     Quotes, Customers, Schedule...). Capture surfaces keep their
     exemption (field visits, files) and Money keeps its own — its
     forms + receipt file inputs own that screen; the sheet's Invoice
     item still routes there from anywhere else. */
  const capturePage=['money','documents','field'].includes(text(state().page));
  const visibleFileControl=Array.from(document.querySelectorAll('#mainContent input[type="file"]')).some(input=>{try{return input.getClientRects().length>0&&getComputedStyle(input).display!=='none';}catch(_){return false;}});
  if(!mobile()||!signedIn()||fieldOpen()||capturePage||visibleFileControl){b?.remove();return;}if(b)return;
  b=document.createElement('button');b.type='button';b.id='h38PhoneCreateButton';b.className='h38-phone-create';b.setAttribute('aria-label','Create new work');b.textContent='＋';
  b.onclick=()=>{const d=createDialog();if(!d.open)d.showModal?.();};document.body.appendChild(b);
}
function scheduledNext(){const now=Date.now();return rows('scheduleEvents').filter(r=>!/CANCEL|VOID|COMPLETE/.test(upper(val(r,'Status','status')))).map(row=>({row,time:new Date(val(row,'Start Time','startTime','Scheduled Time','scheduledAt')||0).getTime()})).filter(x=>Number.isFinite(x.time)&&x.time>=now-15*60000).sort((a,b)=>a.time-b.time)[0]||null;}
function attention(){
  const out=[],now=Date.now();
  for(const r of rows('followUps')){if(/DONE|CLOSED|COMPLETE|CANCEL/.test(upper(val(r,'Status','status'))))continue;const due=new Date(val(r,'Due Time','dueTime','Due Date','dueDate')||0).getTime();if(!due||due<=now+86400000)out.push({page:'customers',title:'Follow-up',detail:text(val(r,'Title','Subject','Description'))||customerName(val(r,'Customer ID','customerId'))});}
  for(const r of rows('quotes'))if(/DRAFT|REVIEW|PRESENT|SENT|WAIT|PENDING/.test(upper(val(r,'Status','status')||'DRAFT')))out.push({page:'quotes',title:'Quote needs attention',detail:text(val(r,'Project Title','Quote Number'))||customerName(val(r,'Customer ID','customerId'))});
  for(const r of rows('siteCaptureSessions'))if(/DRAFT|IN PROGRESS|REVIEW|OPEN/.test(upper(val(r,'Status','status')||'DRAFT')))out.push({page:'field',title:'Site Visit not finished',detail:text(val(r,'Project Title','Site Visit ID','Capture Session ID'))||customerName(val(r,'Customer ID','customerId'))});
  for(const r of rows('meetings'))if(/REVIEW|PENDING|OPEN|DRAFT/.test(upper(val(r,'Status','status'))))out.push({page:'meetings',title:'Meeting needs finishing',detail:text(val(r,'Title','Meeting Type'))||customerName(val(r,'Customer ID','customerId'))});
  for(const r of rows('invoices')){const status=upper(val(r,'Status','status')),delivery=upper(val(r,'Delivery Status','deliveryStatus'));if(!/PAID|VOID|CLOSED/.test(status)&&(!delivery||/NOT SENT|DRAFT|PENDING/.test(delivery)))out.push({page:'money',title:'Invoice needs review',detail:text(val(r,'Invoice Number'))||customerName(val(r,'Customer ID','customerId'))});}
  return out.slice(0,4);
}
function openCustomer(cid){if(!cid)return;if(window.H38_CUSTOMER_360)window.H38_CUSTOMER_360.selectedCustomerId=text(cid);openPage('customers');}
function ensureToday(){
  const main=document.getElementById('mainContent');if(!main)return;
  if(!mobile()||state().page!=='today'){main.classList.remove('h38-phone-simplified');main.removeAttribute('data-h38-phone-details');main.querySelectorAll('[data-h38-phone-secondary]').forEach(n=>n.removeAttribute('data-h38-phone-secondary'));document.getElementById('h38PhoneToday')?.remove();try{window.H38FirstScreen?.release?.('phoneToday');}catch(_){}return;}
  main.classList.add('h38-phone-simplified');main.querySelectorAll(':scope > .grid').forEach(n=>n.dataset.h38PhoneSecondary='1');
  // Phone/desktop parity (2026-10-28): the canonical Today workspace
  // (#h38CustomerReadyToday — Next Action / Up Next / Today's Work) is the
  // SAME component the desktop shows first, from the same snapshot data.
  // It must never be demoted to hidden "secondary" content on the phone:
  // doing so left the phone headlining only the schedule hero's
  // "No calls booked yet" while the desktop showed the day's booked work.
  document.getElementById('h38CustomerReadyToday')?.removeAttribute('data-h38-phone-secondary');
  const next=scheduledNext(),items=attention(),sig=JSON.stringify([next?.time,next&&val(next.row,'Title'),items.map(x=>x.title+x.detail)]);let section=document.getElementById('h38PhoneToday');if(section?.dataset.signature===sig)return;
  section?.remove();section=document.createElement('section');section.id='h38PhoneToday';section.className='h38-phone-today';section.dataset.signature=sig;
  const r=next?.row,cid=text(val(r,'Customer ID','customerId')),when=next?new Date(next.time).toLocaleString([], {weekday:'short',hour:'numeric',minute:'2-digit'}):'',title=text(val(r,'Title','Project Title'))||'Scheduled work',location=text(val(r,'Location','Address','Service Address'));
  section.innerHTML=`<section class="h38-phone-card"><span class="h38-eyebrow">UP NEXT</span>${next?`<div class="h38-phone-up-next"><strong>${esc(customerName(cid))}</strong><span>${esc(when)} · ${esc(title)}</span>${location?`<small>${esc(location)}</small>`:''}<div class="h38-phone-up-actions"><button type="button" class="primary" data-phone-open-customer="${esc(cid)}">Open customer</button><button type="button" class="secondary" data-phone-open-page="schedule">Schedule</button><button type="button" class="secondary" data-phone-start-site="${esc(cid)}">Start Site Visit</button></div></div>`:`<div class="h38-phone-up-next"><strong>No scheduled work next</strong><span>Use Customers or + to start what you need.</span></div>`}</section><section class="h38-phone-card"><span class="h38-eyebrow">NEEDS ATTENTION</span><h2>${items.length?`${items.length} item${items.length===1?'':'s'} to handle`:'Nothing urgent'}</h2><div class="h38-phone-attention">${items.length?items.map(i=>`<button type="button" data-phone-open-page="${esc(i.page)}"><strong>${esc(i.title)}</strong><small>${esc(i.detail)}</small></button>`).join(''):'<small>You are caught up on the highest-priority customer work.</small>'}</div></section><button type="button" class="secondary h38-phone-dashboard-toggle">Show full Office details</button>`;
  // Opening-bounce fix: fill the reserved first-screen slot when the Today
  // workspace painted one; the digest then lands in space that already
  // exists instead of pushing the painted screen down by its full height.
  let filledSlot=false;
  try{filledSlot=!!(window.H38FirstScreen&&typeof window.H38FirstScreen.fill==='function'&&window.H38FirstScreen.fill('phoneToday',section));}catch(_){filledSlot=false;}
  if(!filledSlot){const head=main.querySelector('.page-head');const digestFirst=main.querySelector('#h38DigestGrid');(digestFirst||head)?.insertAdjacentElement('afterend',section)||main.prepend(section);}section.querySelectorAll('[data-phone-open-page]').forEach(b=>b.onclick=()=>openPage(b.dataset.phoneOpenPage));section.querySelectorAll('[data-phone-open-customer]').forEach(b=>b.onclick=()=>openCustomer(b.dataset.phoneOpenCustomer));section.querySelector('[data-phone-start-site]')?.addEventListener('click',e=>window.H38_FIELD_VISIT?.open?window.H38_FIELD_VISIT.open({customerId:e.currentTarget.dataset.phoneStartSite,quoteId:''}):openPage('field'));
  section.querySelector('.h38-phone-dashboard-toggle').onclick=e=>{const open=main.dataset.h38PhoneDetails==='1';open?main.removeAttribute('data-h38-phone-details'):main.dataset.h38PhoneDetails='1';e.currentTarget.textContent=open?'Show full Office details':'Hide Office details';};
}
function searchHay(c){const cid=text(val(c,'Customer ID','customerId','id')),parts=[val(c,'Customer Name','name'),val(c,'Email','email'),val(c,'Phone','phone'),val(c,'Service Address','Address'),val(c,'Service City','City'),val(c,'Service State','State'),val(c,'Service ZIP','ZIP')];for(const name of ['properties','jobs','quotes'])for(const r of rows(name))if(text(val(r,'Customer ID','customerId'))===cid)parts.push(JSON.stringify(r));return parts.join(' ').toLowerCase();}
function bindCustomerFinder(finder,customers){
  const input=finder.querySelector('input'),result=finder.querySelector('.h38-phone-customer-results');
  const render=q=>{const query=text(q).toLowerCase(),matches=customers.filter(c=>!query||searchHay(c).includes(query)).slice(0,6);result.innerHTML=matches.map(c=>{const cid=text(val(c,'Customer ID','customerId','id')),name=text(val(c,'Customer Name','name'))||'Customer',meta=[val(c,'Phone','phone'),val(c,'Service Address','Address')].filter(Boolean).join(' · ');return`<button type="button" data-phone-customer="${esc(cid)}"><strong>${esc(name)}</strong><small>${esc(meta||'Open customer history')}</small></button>`;}).join('')||'<small>No matching customer.</small>';result.querySelectorAll('[data-phone-customer]').forEach(b=>b.onclick=()=>openCustomer(b.dataset.phoneCustomer));};
  input.oninput=()=>render(input.value);finder.querySelector('[data-phone-add-customer]')?.addEventListener('click',()=>{document.getElementById('h38AddCustomerTop')?.click();document.getElementById('customerForm')?.scrollIntoView?.({behavior:'smooth',block:'center'});});render(input.value||'');
}
function ensureCustomers(){
  if(!mobile()||state().page!=='customers'){document.getElementById('h38PhoneCustomerFinder')?.remove();document.getElementById('h38PhoneCustomerTools')?.remove();return;}
  const main=document.getElementById('mainContent');if(!main)return;const customers=rows('customers').filter(r=>text(val(r,'Customer ID','customerId','id')));let finder=document.getElementById('h38PhoneCustomerFinder');
  if(!finder){finder=document.createElement('section');finder.id='h38PhoneCustomerFinder';finder.className='h38-phone-customer-finder h38-phone-card';finder.innerHTML=`<div class="h38-phone-customer-find-head"><div><span class="h38-eyebrow">CUSTOMERS</span><h2>Find the customer first</h2></div><button type="button" class="secondary" data-phone-add-customer>+ Add</button></div><input type="search" inputmode="search" autocomplete="off" placeholder="Name, phone, address, job or quote" aria-label="Search customers"><div class="h38-phone-customer-results"></div>`;const head=main.querySelector('.page-head');head?.insertAdjacentElement('afterend',finder)||main.prepend(finder);bindCustomerFinder(finder,customers);}
  const cid=selectedCustomerId();let tools=document.getElementById('h38PhoneCustomerTools');if(document.querySelector('.h38-c360-tabs')){tools?.remove();return;}if(!cid){tools?.remove();return;}if(tools?.dataset.customerId===cid)return;tools?.remove();tools=document.createElement('section');tools.id='h38PhoneCustomerTools';tools.dataset.customerId=cid;tools.className='h38-phone-customer-tools h38-phone-card';tools.innerHTML=`<strong>${esc(customerName(cid))}</strong><div class="h38-phone-customer-actions"><button type="button" class="primary" data-phone-customer-action="site">Start Site Visit</button><button type="button" class="secondary" data-phone-customer-action="quote">New Quote</button><button type="button" class="secondary" data-phone-customer-action="message">Message</button></div><div class="h38-phone-customer-tabs"><button type="button" data-phone-customer-tab="overview">Overview</button><button type="button" data-phone-customer-tab="work">Work</button><button type="button" data-phone-customer-tab="files">Photos & files</button></div>`;finder.insertAdjacentElement('afterend',tools);
  tools.querySelector('[data-phone-customer-action="site"]').onclick=()=>window.H38_FIELD_VISIT?.open?window.H38_FIELD_VISIT.open({customerId:cid,quoteId:''}):openPage('field');tools.querySelector('[data-phone-customer-action="quote"]').onclick=()=>{state().quote={quoteId:'',lines:[],customerId:cid,hydrationComplete:true};openPage('quotes');};tools.querySelector('[data-phone-customer-action="message"]').onclick=()=>openPage('messages');
  tools.querySelectorAll('[data-phone-customer-tab]').forEach(b=>b.onclick=()=>{const key=b.dataset.phoneCustomerTab,target=key==='overview'?(document.getElementById('h38CustomerReadyHero')||document.querySelector('.h38-c360')):key==='work'?(document.querySelector('[data-h38-c360-timeline]')||Array.from(document.querySelectorAll('.h38-c360-grid section.card')).find(s=>/Jobs|Quotes|Site visits/i.test(s.querySelector('h3')?.textContent||''))):document.querySelector('[data-h38-c360-photo-stream]');target?.scrollIntoView?.({behavior:'smooth',block:'start'});tools.querySelectorAll('[data-phone-customer-tab]').forEach(x=>x.classList.toggle('active',x===b));});
}
/* ---------- Direction B pieces (2026-10-31) ---------- */
const moneyFmt=v=>{const n=Number(v)||0;try{if(typeof window.money==='function')return window.money(n);}catch(_){}return n.toLocaleString('en-US',{style:'currency',currency:'USD'});};
function clearPhoneB(){
  for(const id of ['h38PhoneMoneyBand','h38PhonePhotosPill','h38PhoneSignOut'])document.getElementById(id)?.remove();
  document.body.classList.remove('h38-pb-ask-on','h38-pb-band-on');
}
function ensureMoneyBand(){
  const main=document.getElementById('mainContent');
  const stats=(mobile()&&state().page==='today'&&main)?main.querySelector('.h38-today-stats'):null;
  let band=document.getElementById('h38PhoneMoneyBand');
  if(!stats){band?.remove();document.body.classList.remove('h38-pb-band-on');return;}
  const moneyBtn=stats.querySelector('[data-h38-ready-page="money"]');
  const quotesBtn=stats.querySelector('[data-h38-ready-page="quotes"]');
  if(!quotesBtn){band?.remove();document.body.classList.remove('h38-pb-band-on');return;}
  /* Same canonical numbers the stat strip itself renders — read them
     off the strip's own buttons, and the band's segments click those
     very buttons, so values and destinations can never drift. */
  const owed=moneyBtn?text(moneyBtn.querySelector('strong')?.textContent):'';
  const waiting=text(quotesBtn.querySelector('strong')?.textContent);
  const sig=owed+'|'+waiting;
  if(!band){band=document.createElement('div');band.id='h38PhoneMoneyBand';band.className='h38-phone-money-band';stats.insertAdjacentElement('beforebegin',band);}
  /* The band must live OUTSIDE the Today workspace section entirely:
   * #h38CustomerReadyToday is a grid whose tracks sum to ~260px at
   * phone width (260px + eleven 0px tracks, measured live), so any
   * placement inside it — even spanning all tracks, even as a sibling
   * of the inner stats section — inherits that width. As the outer
   * section's previous sibling in the block frame it takes the full
   * content width. */
  const bandSection=stats.closest('#h38CustomerReadyToday')||stats.closest('section');
  if(bandSection&&bandSection.parentElement&&band.nextElementSibling!==bandSection)bandSection.parentElement.insertBefore(band,bandSection);
  if(band.dataset.sig!==sig){
    band.dataset.sig=sig;
    band.innerHTML=`${moneyBtn?`<button type="button" data-band-go="money"><strong>${esc(owed)}</strong><span>owed to you</span></button>`:''}<button type="button" class="h38-band-quotes" data-band-go="quotes"><strong>${esc(waiting)}</strong><span>quotes waiting</span></button><span class="h38-band-go" aria-hidden="true">›</span>`;
    band.querySelectorAll('[data-band-go]').forEach(b=>b.onclick=()=>{stats.querySelector(`[data-h38-ready-page="${b.dataset.bandGo}"]`)?.click();});
  }
  document.body.classList.add('h38-pb-band-on');
}
function ensureAskPill(){
  /* The pill is the EXISTING #askKitButton, repositioned by
     phone-frame.css while body carries h38-pb-ask-on — same element,
     same click handler (kit-link.js), no second assistant entry. */
  const on=mobile()&&signedIn()&&state().page==='today'&&!fieldOpen();
  document.body.classList.toggle('h38-pb-ask-on',!!on);
}
function ensurePhotosPill(){
  let pill=document.getElementById('h38PhonePhotosPill');
  const on=mobile()&&signedIn()&&state().page==='quotes'&&text(state().quoteView||'list')!=='builder'&&!fieldOpen();
  if(!on){pill?.remove();return;}
  if(pill)return;
  pill=document.createElement('button');pill.type='button';pill.id='h38PhonePhotosPill';pill.className='h38-phone-photos-pill';pill.innerHTML='<span aria-hidden="true">📷</span> Quote from photos';
  pill.onclick=()=>{if(typeof window.h38StartQuote==='function')window.h38StartQuote('photos');};
  document.body.appendChild(pill);
}
function ensureQuotesTools(){
  if(!mobile()||state().page!=='quotes')return;
  const card=document.querySelector('[data-h38-canonical-quotes="1"]');
  if(!card)return;
  card.classList.add('h38-pb-quotes-card');
  let totals=card.querySelector('#h38PhoneQuoteTotals');
  if(!totals){totals=document.createElement('div');totals.id='h38PhoneQuoteTotals';totals.className='h38-phone-quote-totals';card.insertBefore(totals,card.firstChild);}
  /* Same set the list itself shows (demo tenant drops DEMO-Q- rows)
     and the same awaiting-answer rule as Today's strip (PRESENT|SENT);
     "out" sums those quotes' totals — the list rows' own Total field. */
  const demoFilter=(()=>{try{return typeof window.businessKey==='function'&&window.businessKey()==='demo';}catch(_){return false;}})();
  const list=rows('quotes').filter(r=>!demoFilter||!/^DEMO-Q-/i.test(text(val(r,'Quote ID','quoteId'))));
  const awaiting=list.filter(r=>/PRESENT|SENT/.test(upper(val(r,'Status','status'))));
  const out=awaiting.reduce((s,r)=>s+(Number(String(val(r,'Total','total')).replace(/[$,]/g,''))||0),0);
  const html=`<strong>${awaiting.length}</strong> awaiting answer · <strong>${esc(moneyFmt(out))}</strong> out`;
  if(totals.innerHTML!==html)totals.innerHTML=html;
}
function ensureSignOut(){
  /* The phone header no longer carries sign-out (Direction B), and the
     header button was the app's ONLY sign-out control — so Settings
     gains a phone sign-out row that clicks that same button. Reachable
     as More -> Settings -> Sign out. */
  let btn=document.getElementById('h38PhoneSignOut');
  if(!mobile()||!signedIn()||state().page!=='settings'){btn?.remove();return;}
  if(btn)return;
  const main=document.getElementById('mainContent');if(!main)return;
  btn=document.createElement('button');btn.type='button';btn.id='h38PhoneSignOut';btn.className='h38-phone-signout';btn.textContent='⇥ Sign out';
  btn.onclick=()=>document.getElementById('authSignOutButton')?.click();
  const head=main.querySelector('.page-head,.h38-screen-head');
  head?.insertAdjacentElement('afterend',btn)||main.prepend(btn);
}
function ensureSiteStepper(){
  const app=document.getElementById('h38FieldVisitApp');if(!mobile()||!fieldOpen()||!app){document.getElementById('h38SiteStepper')?.remove();return;}
  const stageSource=app.cloneNode(true);stageSource.querySelector('#h38SiteStepper')?.remove();const u=upper(stageSource.textContent);let step=1;if(/BUILD QUOTE|QUOTE READY|QUOTE BUILDER|QUOTE HANDOFF/.test(u))step=4;else if(/MEASUREMENT|TARGETED PHOTO|DETAILS|CAPTURE REMAINING/.test(u))step=3;else if(/WALKTHROUGH|RECORDING|STOP & USE VIDEO|TAKE PHOTO/.test(u))step=2;
  let bar=document.getElementById('h38SiteStepper');if(bar?.dataset.step===String(step))return;bar?.remove();bar=document.createElement('div');bar.id='h38SiteStepper';bar.className='h38-site-stepper';bar.dataset.step=String(step);['Conversation','Walkthrough','Details','Quote'].forEach((label,i)=>{const n=i+1,s=document.createElement('span');s.textContent=`${n} ${label}`;if(n<step)s.className='done';if(n===step)s.className='current';bar.appendChild(s);});(app.querySelector('.field-visit-main')||app).prepend(bar);
}
function cleanupDesktop(){
  if(mobile())return;document.body.classList.remove('h38-phone-first-office');for(const id of ['h38PhoneCreateButton','h38PhoneToday','h38PhoneCustomerFinder','h38PhoneCustomerTools','h38SiteStepper','h38PhoneCreateDialog'])document.getElementById(id)?.remove();clearPhoneB();try{window.H38FirstScreen?.release?.('phoneToday');}catch(_){}const main=document.getElementById('mainContent');main?.classList.remove('h38-phone-simplified');main?.removeAttribute('data-h38-phone-details');main?.querySelectorAll('[data-h38-phone-secondary]').forEach(n=>n.removeAttribute('data-h38-phone-secondary'));
}
/* Ready-signal + reconcile loop fix (2026-10-27, build
   20261027-session-keep-1). Measured on the live build at phone width:
   673 'h38:phone-first-ready' dispatches and 6,767 DOM mutations in 30
   idle seconds on a settled Schedule screen (~22 dispatches/sec,
   sustained indefinitely). The chain was self-sustaining: this module's
   MutationObserver saw childList writes made by listeners reacting to
   its own ready dispatch, reconciled, and dispatched again — and every
   dispatch made downstream decorators rewrite header/screen-head text
   nodes, which is the repeating slight up-and-down jerk the owner sees
   on EVERY screen. Two structural breaks:
   1. The ready event is TRANSITION-ONLY: it fires when the ready
      signature (page + required sections present) changes, never on a
      repeat reconcile of the same state.
   2. The MutationObserver ignores batches produced while this module's
      own reconcile is running, so its writes can never re-trigger it. */
let lastReadySignature='';
let reconciling=false;
function signalStartupReady(){
  if(!mobile()||!signedIn()||fieldOpen()){lastReadySignature='';return false;}
  if(!document.getElementById('h38PhoneCreateButton')){lastReadySignature='';return false;}
  if(state().page==='today'&&!document.getElementById('h38PhoneToday')){lastReadySignature='';return false;}
  const signature=BUILD+'|'+String(state().page||'');
  if(document.documentElement.dataset.h38PhoneFirstReady==='ready'&&lastReadySignature===signature)return true;
  lastReadySignature=signature;
  document.documentElement.dataset.h38PhoneFirstReady='ready';
  window.dispatchEvent(new CustomEvent('h38:phone-first-ready',{detail:{build:BUILD,page:String(state().page||'')}}));
  return true;
}
function runReconcile(){
  scheduled=false;
  reconciling=true;
  try{
    if(!mobile()){cleanupDesktop();lastReadySignature='';delete document.documentElement.dataset.h38PhoneFirstReady;return;}
    if(!signedIn()){clearPhoneB();lastReadySignature='';delete document.documentElement.dataset.h38PhoneFirstReady;return;}
    ensureStyle();document.body.classList.add('h38-phone-first-office');ensureCreate();ensureToday();ensureCustomers();ensureSiteStepper();ensureMoneyBand();ensureAskPill();ensurePhotosPill();ensureQuotesTools();ensureSignOut();signalStartupReady();
  }finally{reconciling=false;}
}
function reconcile(){if(scheduled)return;scheduled=true;queueMicrotask(()=>requestAnimationFrame(runReconcile));}
window.addEventListener?.('h38:office-page-rendered',reconcile);window.addEventListener?.('h38:business-snapshot-updated',reconcile);window.addEventListener?.('h38:authoritative-startup-ready',reconcile);window.addEventListener?.('pageshow',reconcile);window.addEventListener?.('resize',reconcile);window.visualViewport?.addEventListener?.('resize',reconcile);
observer=new MutationObserver(ms=>{if(reconciling)return;if(ms.some(m=>m.type==='childList'&&(m.target.id==='mainContent'||m.target.closest?.('#mainContent,#h38FieldVisitApp')||Array.from(m.addedNodes||[]).some(n=>n.nodeType===1&&(n.id==='h38FieldVisitApp'||n.querySelector?.('#h38FieldVisitApp'))))))reconcile();});observer.observe(document.documentElement,{subtree:true,childList:true});queueMicrotask(reconcile);
window.H38_PHONE_FIRST_OFFICE=Object.freeze({enabled:true,build:BUILD,navigationDelegatedToMobileAuthority:true,customerFirst:true,schedulePrimary:true,jobsInMore:true,floatingCreate:true,floatingCreateAvoidsCaptureControls:true,universalBottomSafeZone:true,readableNavigationAt320:true,toastClearsFloatingCreate:true,groupedMoreDelegated:true,simplifiedToday:true,customerFinder:true,customerQuickActions:true,siteVisitStepper:true,desktopUnchanged:true,eventDrivenStartup:true,noStartupTimer:true,startupReadyMarker:true,automaticCustomerSending:false,automaticApproval:false,automaticPayment:false,reconcile});
})();
