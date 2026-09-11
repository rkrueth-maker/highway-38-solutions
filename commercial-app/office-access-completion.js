(function(){
'use strict';
const BUILD='20260911-office-access-settings-event-only-2';
const FINANCE_PAGES=['money','accounting','payroll','tax','reports'];
const ADMIN_PAGES=['people','controls','settings'];
const text=value=>String(value==null?'':value).trim();
function state(){try{return window.state||(typeof globalThis.state!=='undefined'?globalThis.state:null);}catch(_){return window.state||null;}}
function allowed(){try{return new Set(typeof window.allowedPages==='function'?window.allowedPages():[]);}catch(_){return new Set();}}
function role(){const user=state()?.snapshot?.user||{};return text(user.roleName||user.roleId||user.role||'').toLowerCase();}
function can(capability){const user=state()?.snapshot?.user;if(!user)return false;if(user.owner===true||user.permissions?.all===true)return true;return user.permissions?.[capability]===true;}
function label(page){try{return window.PAGE_DEFS?.[page]?.[1]||page;}catch(_){return page;}}
function open(page){if(!allowed().has(page))return false;window.openPage?.(page);return true;}
function installStyle(){
  if(document.getElementById('h38OfficeAccessCompletionStyle'))return;
  const style=document.createElement('style');style.id='h38OfficeAccessCompletionStyle';style.textContent=`
.h38-access-strip{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 14px;padding:10px 12px;border:1px solid var(--border,#d6dde3);border-radius:12px;background:var(--card,#fff)}
.h38-access-strip>strong{font-size:.76rem;letter-spacing:.055em;text-transform:uppercase;color:var(--muted,#667085);margin-right:2px}.h38-access-strip button{min-height:38px;padding:7px 11px}.h38-access-strip button[aria-current="page"]{font-weight:900}
.h38-access-context{display:flex;gap:10px;align-items:center;justify-content:space-between;margin:0 0 14px;padding:10px 12px;border:1px solid var(--border,#d6dde3);border-radius:12px;background:var(--card,#fff)}.h38-access-context p{margin:0}.h38-access-context strong{display:block;margin-bottom:2px}
@media(max-width:760px){.h38-access-strip{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));padding:10px}.h38-access-strip>strong{grid-column:1/-1}.h38-access-strip button{width:100%;min-height:44px}.h38-access-context{align-items:flex-start;flex-direction:column}.h38-access-context button{width:100%;min-height:44px}}
`;
  document.head.appendChild(style);
}
function head(){return document.querySelector('#mainContent .page-head')||document.querySelector('#mainContent > header')||document.querySelector('#mainContent > h1')?.parentElement||null;}
function removeExisting(id){document.getElementById(id)?.remove();}
function makeStrip(id,title,entries,currentPage){
  removeExisting(id);const usable=entries.filter(item=>item.kind==='section'||allowed().has(item.page));if(!usable.length)return null;
  const strip=document.createElement('nav');strip.id=id;strip.className='h38-access-strip';strip.setAttribute('aria-label',title);
  const strong=document.createElement('strong');strong.textContent=title;strip.appendChild(strong);
  usable.forEach(item=>{const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=item.label||label(item.page);if(item.kind==='section'){button.dataset.h38AccessSection=item.section;button.onclick=()=>scrollToHeading(item.section);}else{button.dataset.h38AccessPage=item.page;if(item.page===currentPage)button.setAttribute('aria-current','page');button.onclick=()=>open(item.page);}strip.appendChild(button);});
  const anchor=head();if(anchor)anchor.insertAdjacentElement('afterend',strip);else document.getElementById('mainContent')?.prepend(strip);return strip;
}
function scrollToHeading(name){const wanted=text(name).toLowerCase();const headings=Array.from(document.querySelectorAll('#mainContent h2,#mainContent h3'));const target=headings.find(node=>text(node.textContent).toLowerCase()===wanted||text(node.textContent).toLowerCase().includes(wanted));if(!target)return false;target.scrollIntoView({behavior:'smooth',block:'start'});target.closest('.card')?.querySelector('input,select,textarea,button')?.focus?.({preventScroll:true});return true;}
function financeStrip(current){return makeStrip('h38FinanceAccessStrip','Money & accounting',[{kind:'section',label:'Invoices',section:'Invoices'},{kind:'section',label:'Payments',section:'Record payment'},{kind:'section',label:'Expenses',section:'Expenses'},{page:'accounting',label:'Accounting'},{page:'payroll',label:'Payroll Prep'},{page:'tax',label:'Tax Prep'},{page:'reports',label:'Reports'}],current);}
function accountingStrip(current){return makeStrip('h38FinanceAccessStrip','Money & accounting',[{page:'money',label:'Invoices & Money'},{kind:'section',label:'Vendors',section:'Vendors'},{kind:'section',label:'Purchase Orders',section:'Purchase orders'},{page:'accounting',label:'Accounting'},{page:'payroll',label:'Payroll Prep'},{page:'tax',label:'Tax Prep'},{page:'reports',label:'Reports'}],current);}
function peopleStrip(){return makeStrip('h38PeopleAccessStrip','Team & employees',[{kind:'section',label:'Team Access',section:'Team Access'},{kind:'section',label:'Employees',section:'Employees'},{kind:'section',label:'Time Records',section:'Recent time'},{page:'payroll',label:'Payroll Prep'},{page:'settings',label:'Users & Settings'}],'people');}
function adminStrip(current){return makeStrip('h38AdminAccessStrip','Office administration',[{page:'people',label:'Employees & Users'},{page:'money',label:'Invoices & Money'},{page:'accounting',label:'Accounting'},{page:'reports',label:'Reports'},{page:'controls',label:'Controls'},{page:'settings',label:'Settings'}],current);}
function enhanceToday(){
  removeExisting('h38AccessRoleContext');const s=state();if(s?.page!=='today'||!s.snapshot?.user)return;
  const node=document.createElement('section');node.id='h38AccessRoleContext';node.className='h38-access-context';const full=can('manageUsers')||can('manageFinancial')||s.snapshot.user.owner===true||s.snapshot.user.permissions?.all===true;
  if(full){node.innerHTML='<p><strong>Full Office access</strong><span class="muted small">Owner/Admin areas are available below the daily work pages.</span></p>';const actions=document.createElement('div');actions.className='actions';[['money','Invoices & Money'],['people','Employees'],['reports','Reports'],['settings','Office Settings']].filter(([key])=>allowed().has(key)).forEach(([key,name])=>{const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=name;button.onclick=()=>open(key);actions.appendChild(button);});node.appendChild(actions);}else{node.innerHTML=`<p><strong>${role().includes('staff')?'Staff':'Restricted'} view</strong><span class="muted small">Employee administration, accounting, payroll, tax and owner controls are hidden by your signed-in permissions.</span></p>`;const signOut=document.getElementById('authSignOutButton');if(signOut){const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Switch account';button.onclick=()=>signOut.click();node.appendChild(button);}}
  const anchor=head();if(anchor)anchor.insertAdjacentElement('afterend',node);else document.getElementById('mainContent')?.prepend(node);
}
function enhance(){
  installStyle();const page=text(state()?.page);if(!page)return;
  if(page==='today'){enhanceToday();return;}
  if(page==='money'){financeStrip(page);return;}
  if(page==='accounting'){accountingStrip(page);return;}
  if(page==='payroll'||page==='tax'||page==='reports'){financeStrip(page);return;}
  if(page==='people'){peopleStrip();return;}
  if(page==='settings'||page==='controls'){adminStrip(page);}
}
function wrap(name){const base=window[name];if(typeof base!=='function'||base.__h38CompleteOfficeAccess)return false;const wrapped=function(){const result=base.apply(this,arguments);queueMicrotask(enhance);return result;};wrapped.__h38CompleteOfficeAccess=true;wrapped.__h38CompleteOfficeAccessBase=base;window[name]=wrapped;return true;}
['renderToday','renderMoney','renderPeople','renderAccounting','renderPayrollPrep','renderTaxPrep','renderReports','renderControls'].forEach(wrap);
window.addEventListener('h38:office-page-rendered',event=>{if(event?.detail?.page==='settings')queueMicrotask(enhance);});
window.addEventListener('h38:office-navigation-access-updated',()=>queueMicrotask(enhance));
window.addEventListener('pageshow',()=>queueMicrotask(enhance));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>queueMicrotask(enhance),{once:true});else queueMicrotask(enhance);
window.H38_OFFICE_ACCESS_COMPLETION=Object.freeze({build:BUILD,financePages:FINANCE_PAGES.slice(),adminPages:ADMIN_PAGES.slice(),roleAware:true,settingsRendererOwnership:false,permissionEscalation:false,automaticApproval:false,automaticSending:false,automaticPurchase:false,automaticPayment:false,automaticPayrollFunding:false,automaticTaxFiling:false,enhance});
})();
