(function(){
'use strict';
const BUILD='20260819-production-mobile-polish-3';
const MOBILE='(max-width: 760px)';
const REVIEW_WORK_MAX_MS=60000;
const PRIMARY=[['today','⌂','Today'],['work','🧰','Jobs'],['customers','👤','Customers'],['messages','💬','Messages']];
const MORE_ORDER=['quotes','field','schedule','documents','money','accounting','reports','people','inventory','fleet','payroll','tax','social','controls','ai','settings'];
let resizeTimer=0;
let interactionUntil=0;
let lastPage='';
let navBusy=false;
let touchGesture=null;
let inertiaFrame=0;
const reviewWorkingSince=new Map();
const text=value=>String(value==null?'':value).trim();
const html=value=>typeof window.esc==='function'?window.esc(value):text(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function mobile(){return !!window.matchMedia?.(MOBILE).matches;}
function interacting(){return Date.now()<interactionUntil;}
function markInteraction(){interactionUntil=Date.now()+700;}
function statePage(){try{return text(window.state?.page);}catch(_){return'';}}
function allowed(){try{return typeof window.allowedPages==='function'?window.allowedPages():[];}catch(_){return[];}}
function pageLabel(key){try{return typeof PAGE_DEFS!=='undefined'&&PAGE_DEFS[key]?PAGE_DEFS[key][1]:key;}catch(_){return key;}}
function pageIcon(key){try{return typeof PAGE_DEFS!=='undefined'&&PAGE_DEFS[key]?PAGE_DEFS[key][0]:'•';}catch(_){return'•';}}
function fieldActuallyOpen(){
  if(window.H38_FIELD_VISIT_CORE?.state?.open!==true)return false;
  const app=document.getElementById('h38FieldVisitApp');
  if(!app||app.hidden||app.getAttribute('aria-hidden')==='true')return false;
  try{const style=getComputedStyle(app);return style.display!=='none'&&style.visibility!=='hidden'&&app.getClientRects().length>0;}catch(_){return false;}
}
function setViewportVars(){
  const viewport=window.visualViewport;
  const height=Math.round(viewport?.height||window.innerHeight||0);
  if(height)document.documentElement.style.setProperty('--h38-mobile-vh',`${height}px`);
  let shellTop=0;
  for(const node of [document.querySelector('.topbar'),document.querySelector('.business-bar')]){
    if(!node||node.hidden)continue;
    try{
      const style=getComputedStyle(node);
      if(style.display==='none'||style.visibility==='hidden'||!node.getClientRects().length)continue;
      shellTop=Math.max(shellTop,Math.round(node.getBoundingClientRect().bottom));
    }catch(_){}
  }
  document.documentElement.style.setProperty('--h38-office-shell-top',`${Math.max(0,shellTop)}px`);
}
function installStyle(){
  let style=document.getElementById('h38MobileRuntimeStabilityStyle');
  if(!style){style=document.createElement('style');style.id='h38MobileRuntimeStabilityStyle';document.head.appendChild(style);}
  style.textContent=`
html,body{max-width:100%;overflow-x:hidden}body{background:var(--bg,#eef3f6)}
#mainContent{overflow-anchor:none;min-width:0}.h38-five-primary-nav{isolation:isolate}
@media(max-width:760px){
 html,body{height:100%!important;min-height:100%!important;max-height:100%!important;overflow:hidden!important;overscroll-behavior:none!important}
 body:not(.h38-field-scroll-lock){height:100%!important;min-height:100%!important;max-height:100%!important;overflow:hidden!important;touch-action:auto!important}
 .topbar{position:relative!important;top:auto!important;z-index:1600;min-height:52px;padding:6px 8px!important;gap:6px!important;transform:translateZ(0);backface-visibility:hidden}
 .topbar .brand{flex:1 1 auto;min-width:0;gap:7px!important;overflow:hidden}
 .topbar .brand-logo{width:34px!important;height:34px!important;flex:0 0 34px!important;object-fit:contain;border-radius:8px}
 .topbar .brand>div{min-width:0}
 .topbar .brand strong{display:block;max-width:118px;font-size:.82rem;line-height:1.12;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 .topbar .brand small{display:none}
 .topbar .top-actions{flex:0 0 auto;gap:4px!important}
 .topbar .icon-button,.topbar .ai-launcher{width:36px!important;height:36px!important;min-height:36px!important;padding:0!important;border-radius:10px!important}
 .business-bar:empty{display:none}.business-bar{position:relative!important;top:auto!important;z-index:1500;padding:5px 10px!important}
 .business-bar span{font-size:.72rem!important;line-height:1.2}
 body:not(.h38-field-scroll-lock) .app-shell{position:fixed!important;left:0!important;right:0!important;top:var(--h38-office-shell-top,58px)!important;bottom:0!important;display:block!important;width:100%!important;height:auto!important;min-height:0!important;max-height:none!important;overflow:hidden!important;contain:layout paint!important;touch-action:auto!important}
 body:not(.h38-field-scroll-lock) #mainContent{position:absolute!important;inset:0!important;box-sizing:border-box!important;width:100%!important;height:auto!important;min-height:0!important;max-height:none!important;overflow-x:hidden!important;overflow-y:scroll!important;overscroll-behavior-y:contain!important;padding:12px 10px calc(112px + env(safe-area-inset-bottom,0px))!important;contain:none!important;touch-action:pan-y!important;-webkit-overflow-scrolling:touch!important;scroll-behavior:auto!important;will-change:scroll-position}
 body:not(.h38-field-scroll-lock) #mainContent>*{max-width:100%;min-width:0}
 #mainContent .page-head{margin-bottom:10px!important}
 #mainContent .page-head h1{font-size:1.35rem!important;line-height:1.12}
 #mainContent .page-head p{margin-top:4px!important;font-size:.82rem!important;line-height:1.35}
 #mainContent .grid{gap:9px!important}
 #mainContent .card{padding:12px!important;border-radius:14px!important;box-shadow:0 4px 14px rgba(25,55,78,.07)!important}
 #mainContent .card h2{margin-bottom:8px!important;font-size:1.05rem!important}
 #mainContent .card h3{margin-bottom:8px!important}
 #mainContent .row{padding:10px!important}
 #mainContent .row small{font-size:.78rem;line-height:1.35}
 #mainContent .empty{padding:17px!important}
 #mainContent .quick-grid{gap:8px!important}
 #mainContent .quick-grid button{min-height:54px!important}
 #mainContent .row-actions button,#mainContent .tabs button{min-height:42px!important}
 #mainContent label{margin-top:8px!important}
 #mainNav.h38-five-primary-nav{position:fixed!important;left:0!important;right:0!important;bottom:0!important;width:100%!important;z-index:2500!important;margin:0!important;padding:6px 6px env(safe-area-inset-bottom,0px)!important;background:var(--card,#fff)!important;box-shadow:0 -8px 24px rgba(11,36,56,.12);transform:translateZ(0);backface-visibility:hidden;display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;overflow:visible!important}
 #mainNav.h38-five-primary-nav button{min-width:0!important;max-width:none!important;min-height:54px!important;padding:5px 2px!important;touch-action:manipulation!important;-webkit-tap-highlight-color:transparent}
 #mainNav.h38-five-primary-nav button span:last-child{font-size:.7rem!important;font-weight:850}
 #toast{position:fixed;left:10px;right:10px;bottom:calc(86px + env(safe-area-inset-bottom,0px));z-index:3000;max-width:none;transform:translateZ(0)}
 dialog{max-height:calc(var(--h38-mobile-vh,100dvh) - 24px)}
 .h38-mobile-tool-details,.h38-mobile-entry-details{grid-column:1/-1!important;width:100%!important;min-width:0!important;margin:0 0 9px;border:1px solid var(--line,#d6e0e8);border-radius:14px;background:var(--card,#fff);overflow:hidden}
 .h38-mobile-tool-details>summary,.h38-mobile-entry-details>summary{min-height:46px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:8px;font-weight:900;color:var(--navy,#0b2438);cursor:pointer;list-style:none}
 .h38-mobile-tool-details>summary::-webkit-details-marker,.h38-mobile-entry-details>summary::-webkit-details-marker{display:none}
 .h38-mobile-tool-details>summary::after,.h38-mobile-entry-details>summary::after{content:'＋';font-size:1rem;color:var(--muted,#607285)}
 .h38-mobile-tool-details[open]>summary::after,.h38-mobile-entry-details[open]>summary::after{content:'−'}
 .h38-mobile-tool-details>.card,.h38-mobile-entry-details>.card{width:100%!important;min-width:0!important;margin:0!important;border:0!important;border-top:1px solid var(--line,#d6e0e8)!important;border-radius:0!important;box-shadow:none!important}
 .h38-mobile-record-card{order:-1}
 body.h38-field-scroll-lock{height:var(--h38-mobile-vh,100dvh)!important;overflow:hidden!important}
 body.h38-field-scroll-lock .app-shell{position:static!important}
 body.h38-field-scroll-lock #mainNav.h38-five-primary-nav{display:none!important}
 body.h38-field-scroll-lock #mainContent{overflow:hidden!important;padding-bottom:0!important}
 #h38FieldVisitApp{position:fixed;inset:0;z-index:2400;height:var(--h38-mobile-vh,100dvh);max-height:var(--h38-mobile-vh,100dvh);overflow:hidden;background:var(--bg,#eef3f6);transform:translateZ(0)}
 #h38FieldVisitApp .field-visit-main{height:100%;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y;padding-bottom:calc(96px + env(safe-area-inset-bottom,0px))}
 #h38FieldVisitApp .field-bottom-nav{position:fixed;left:0;right:0;bottom:0;z-index:2600;padding-bottom:env(safe-area-inset-bottom,0px);background:var(--card,#fff);transform:translateZ(0)}
 input,textarea,select{font-size:16px!important}
 .h38-review-terminal-note{margin:12px 0;padding:14px;border-radius:14px;background:#fff;border:1px solid rgba(11,36,56,.18)}
 .h38-review-terminal-note strong{display:block;margin-bottom:5px}.h38-review-terminal-note span{display:block;color:#52616d;line-height:1.35}
}
`;
}
function clearInlineLocks(){
  for(const node of [document.documentElement,document.body,document.querySelector('.app-shell'),document.getElementById('mainContent')]){
    if(!node)continue;
    node.style.removeProperty('overflow');
    node.style.removeProperty('overflow-y');
    node.style.removeProperty('height');
    node.style.removeProperty('max-height');
    node.style.removeProperty('position');
    node.style.removeProperty('top');
    node.style.removeProperty('bottom');
  }
}
function restoreChrome(){document.querySelectorAll('.topbar,.business-bar,.app-shell,#mainNav,#mainContent').forEach(node=>{node?.style.removeProperty('visibility');node?.style.removeProperty('opacity');});}
function polishChrome(){
  const brand=document.querySelector('.topbar .brand strong');
  if(brand){
    if(!brand.dataset.h38FullBrand)brand.dataset.h38FullBrand=text(brand.textContent)||'Highway 38 Solutions';
    brand.textContent='H38 Office';
    brand.title=brand.dataset.h38FullBrand;
  }
}
function moreDialog(){
  let dialog=document.getElementById('h38PrimaryMoreDialog');
  if(dialog)return dialog;
  dialog=document.createElement('dialog');
  dialog.id='h38PrimaryMoreDialog';
  dialog.className='h38-primary-more-dialog';
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  document.body.appendChild(dialog);
  return dialog;
}
function openMore(){
  const pages=new Set(allowed()),items=MORE_ORDER.filter(key=>pages.has(key)),dialog=moreDialog();
  const markup=`<div class="h38-more-sheet"><div class="h38-more-head"><div><strong>More</strong><small>Tools, money, records and settings</small></div><button type="button" data-close-more aria-label="Close">×</button></div><div class="h38-more-grid">${items.map(key=>`<button type="button" data-more-page="${html(key)}"><span>${pageIcon(key)}</span><strong>${html(pageLabel(key))}</strong></button>`).join('')}</div></div>`;
  if(dialog.innerHTML!==markup)dialog.innerHTML=markup;
  dialog.querySelector('[data-close-more]')?.addEventListener('click',()=>dialog.close(),{once:true});
  dialog.querySelectorAll('[data-more-page]').forEach(button=>button.onclick=()=>{dialog.close();window.openPage?.(button.dataset.morePage);});
  if(typeof dialog.showModal==='function'){if(!dialog.open)dialog.showModal();}else dialog.setAttribute('open','');
}
function ensurePrimaryNav(){
  if(!mobile()||navBusy)return;
  const s=window.state,nav=document.getElementById('mainNav');
  if(!nav||s?.shell!=='office')return;
  const pages=new Set(allowed()),current=statePage(),moreActive=!PRIMARY.some(([key])=>key===current);
  const desired=[
    ...PRIMARY.filter(([key])=>pages.has(key)).map(([key,icon,label])=>`<button type="button" data-h38-primary="${key}" class="${current===key?'active':''}"${current===key?' aria-current="page"':''}><span class="nav-icon">${icon}</span><span>${label}</span></button>`),
    `<button type="button" data-h38-primary="more" class="${moreActive?'active':''}" aria-haspopup="dialog" aria-controls="h38PrimaryMoreDialog"><span class="nav-icon">•••</span><span>More</span></button>`
  ].join('');
  if(nav.classList.contains('h38-five-primary-nav')&&nav.dataset.h38PrimaryNav==='3'&&nav.innerHTML===desired)return;
  navBusy=true;
  nav.classList.add('h38-five-primary-nav');
  nav.classList.remove('h38-operator-scroll-nav');
  nav.dataset.h38PrimaryNav='3';
  nav.innerHTML=desired;
  nav.querySelectorAll('[data-h38-primary]').forEach(button=>button.onclick=()=>button.dataset.h38Primary==='more'?openMore():window.openPage?.(button.dataset.h38Primary));
  navBusy=false;
}
function hideStrayQuoteActions(){
  const main=document.getElementById('mainContent');if(!main)return;
  const quotePage=statePage()==='quotes';
  main.querySelectorAll('button').forEach(button=>{
    if(text(button.textContent).toLowerCase()!=='approve & send quote')return;
    if(quotePage){
      if(button.dataset.h38HiddenOutsideQuotes==='1'){button.hidden=false;delete button.dataset.h38HiddenOutsideQuotes;}
      return;
    }
    button.hidden=true;
    button.dataset.h38HiddenOutsideQuotes='1';
  });
}
function cardHeading(card){return text(card?.querySelector(':scope > h2,:scope > h3')?.textContent);}
function wrapToolCard(card,summaryText,entry=false){
  if(!card||card.closest('.h38-mobile-tool-details,.h38-mobile-entry-details'))return card?.parentElement||null;
  const details=document.createElement('details');
  details.className=entry?'h38-mobile-entry-details':'h38-mobile-tool-details';
  const summary=document.createElement('summary');
  summary.textContent=summaryText;
  card.parentNode?.insertBefore(details,card);
  details.append(summary,card);
  return details;
}
function moveCardsFirst(grid,cards){
  if(!grid)return;
  const valid=cards.filter(Boolean);
  for(let i=valid.length-1;i>=0;i--)grid.insertBefore(valid[i],grid.firstChild);
}
function polishWork(main){
  const head=main.querySelector('.page-head');
  const h1=head?.querySelector('h1');
  const p=head?.querySelector('p');
  if(h1&&/^(work|work\s*&\s*task assignment)$/i.test(text(h1.textContent)))h1.textContent='Jobs';
  if(p&&/turn requests into organized jobs/i.test(text(p.textContent)))p.textContent='Keep jobs, requests, tasks and field work moving from one place.';
  const grid=main.querySelector(':scope > .grid');
  if(!grid)return;
  const cards=Array.from(grid.children).filter(node=>node.classList?.contains('card'));
  const byName=name=>cards.find(card=>cardHeading(card).toLowerCase()===name.toLowerCase());
  const requests=byName('Requests'),jobs=byName('Jobs'),tasks=byName('Tasks');
  [requests,jobs,tasks].forEach(card=>card?.classList.add('h38-mobile-record-card'));
  moveCardsFirst(grid,[requests,jobs,tasks]);
  wrapToolCard(byName('New request'),'New request');
  wrapToolCard(byName('New job'),'New job');
  wrapToolCard(byName('Assign task'),'Assign task');
}
function polishCustomers(main){
  const head=main.querySelector('.page-head');
  const p=head?.querySelector('p');
  if(p&&/installed product shell/i.test(text(p.textContent)))p.textContent='Customers, contacts and properties in one place.';
  const grid=main.querySelector(':scope > .grid');
  if(!grid)return;
  const cards=Array.from(grid.children).filter(node=>node.classList?.contains('card'));
  const byName=name=>cards.find(card=>cardHeading(card).toLowerCase()===name.toLowerCase());
  const start=byName('Start work'),customers=byName('Customers'),properties=byName('Properties');
  [start,customers,properties].forEach(card=>card?.classList.add('h38-mobile-record-card'));
  moveCardsFirst(grid,[start,customers,properties]);
  wrapToolCard(byName('Add or update customer'),'Add or edit customer',true);
  wrapToolCard(byName('Add property'),'Add property',true);
}
function polishMessages(main){
  const head=main.querySelector('.page-head');
  const h1=head?.querySelector('h1');
  const p=head?.querySelector('p');
  if(h1&&text(h1.textContent)==='Communications')h1.textContent='Messages';
  if(p&&/internal chat, email management/i.test(text(p.textContent)))p.textContent='Team messages, email, customer texts and portal conversations in one place.';
  Array.from(main.querySelectorAll('.card h2')).forEach(node=>{if(text(node.textContent)==='Business conversations')node.textContent='Team conversations';});
  Array.from(main.querySelectorAll('label')).forEach(label=>{if(text(label.textContent)==='New channel or group')label.textContent='Start a conversation';});
  const form=document.getElementById('conversationForm');
  const create=form?.querySelector('.actions button');
  if(create&&text(create.textContent)==='Create')create.textContent='Start';
}
function polishVisiblePage(){
  const main=document.getElementById('mainContent'),current=statePage();
  if(!main)return;
  polishChrome();
  if(current==='work')polishWork(main);
  else if(current==='customers')polishCustomers(main);
  else if(current==='messages')polishMessages(main);
}
function cancelInertia(){if(inertiaFrame){cancelAnimationFrame(inertiaFrame);inertiaFrame=0;}}
function clamp(value,min,max){return Math.min(max,Math.max(min,value));}
function independentVerticalScroller(target,main){
  let node=target instanceof Element?target:null;
  while(node&&node!==main){
    try{const style=getComputedStyle(node);if(/auto|scroll/.test(style.overflowY)&&node.scrollHeight>node.clientHeight+2)return node;}catch(_){}
    node=node.parentElement;
  }
  return null;
}
function startInertia(main,velocity){
  cancelInertia();
  if(!Number.isFinite(velocity)||Math.abs(velocity)<0.08)return;
  let v=velocity,last=performance.now();
  const step=now=>{
    const dt=Math.min(32,Math.max(1,now-last));last=now;
    const max=Math.max(0,main.scrollHeight-main.clientHeight),before=main.scrollTop,next=clamp(before+v*dt,0,max);
    main.scrollTop=next;
    v*=Math.pow(0.90,dt/16);
    if(Math.abs(v)<0.03||max<=0||(next===before&&(next===0||next===max))){inertiaFrame=0;return;}
    inertiaFrame=requestAnimationFrame(step);
  };
  inertiaFrame=requestAnimationFrame(step);
}
function installManualTouchScroll(){
  const main=document.getElementById('mainContent');
  if(!main||main.dataset.h38ManualTouchScroll==='2')return;
  main.dataset.h38ManualTouchScroll='2';
  main.dataset.h38PhysicalScrollSurface='mainContent';
  main.addEventListener('touchstart',event=>{
    if(!mobile()||fieldActuallyOpen()||event.touches.length!==1){touchGesture=null;return;}
    cancelInertia();
    const touch=event.touches[0],nested=independentVerticalScroller(event.target,main);
    touchGesture={nested:!!nested,lastY:touch.clientY,lastTime:performance.now(),velocity:0,moved:false};
  },{passive:true});
  main.addEventListener('touchmove',event=>{
    if(!touchGesture||touchGesture.nested||event.touches.length!==1||fieldActuallyOpen())return;
    const max=Math.max(0,main.scrollHeight-main.clientHeight);if(max<=0)return;
    const now=performance.now(),y=event.touches[0].clientY,dy=touchGesture.lastY-y,dt=Math.max(1,now-touchGesture.lastTime);
    if(Math.abs(dy)>0.5){
      const before=main.scrollTop;
      main.scrollTop=clamp(before+dy,0,max);
      touchGesture.velocity=dy/dt;
      touchGesture.moved=true;
      event.preventDefault();
    }
    touchGesture.lastY=y;touchGesture.lastTime=now;
  },{passive:false});
  const finish=()=>{
    if(!touchGesture)return;
    const gesture=touchGesture;touchGesture=null;
    if(!gesture.nested&&gesture.moved)startInertia(main,gesture.velocity);
  };
  main.addEventListener('touchend',finish,{passive:true});
  main.addEventListener('touchcancel',()=>{touchGesture=null;cancelInertia();},{passive:true});
}
function stabilizeAfterRender(){
  if(!mobile())return;
  installStyle();setViewportVars();restoreChrome();clearInlineLocks();
  const fieldOpen=fieldActuallyOpen();
  document.body.classList.toggle('h38-field-scroll-lock',fieldOpen);
  if(!fieldOpen&&window.H38_FIELD_VISIT_CORE?.state?.open!==true)document.body.classList.remove('field-visit-open');
  ensurePrimaryNav();hideStrayQuoteActions();polishVisiblePage();installManualTouchScroll();
  document.body.dataset.h38ProductionPolish='3';
  const current=statePage(),main=document.getElementById('mainContent');
  if(main&&lastPage&&current&&current!==lastPage&&!interacting())main.scrollTo({top:0,left:0,behavior:'instant'});
  if(current)lastPage=current;
}
function schedule(){clearTimeout(resizeTimer);resizeTimer=setTimeout(stabilizeAfterRender,35);}
function wrapOpenPage(){
  if(typeof window.openPage!=='function'||window.openPage.h38PhysicalScrollStable)return;
  const base=window.openPage;
  function stableOpenPage(key,...args){
    const before=statePage(),result=base.call(this,key,...args);
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      stabilizeAfterRender();
      const main=document.getElementById('mainContent');
      if(main&&!interacting()&&before!==statePage()&&!fieldActuallyOpen())main.scrollTo({top:0,left:0,behavior:'instant'});
    }));
    return result;
  }
  stableOpenPage.h38PhysicalScrollStable=true;
  stableOpenPage.h38Base=base;
  window.openPage=stableOpenPage;
}
function wrapRenderNav(){
  if(typeof window.renderNav!=='function'||window.renderNav.h38PhysicalNavStable)return;
  const base=window.renderNav;
  function stableRenderNav(...args){const result=base.apply(this,args);queueMicrotask(ensurePrimaryNav);return result;}
  stableRenderNav.h38PhysicalNavStable=true;
  stableRenderNav.h38Base=base;
  window.renderNav=stableRenderNav;
}
function activeVisit(){return window.H38_FIELD_VISIT_CORE?.state?.visit||null;}
function reviewRecordExists(sessionId){
  const rows=Array.isArray(window.state?.snapshot?.siteAiReviews)?window.state.snapshot.siteAiReviews:[];
  return rows.some(row=>String(row?.['Capture Session ID']||row?.captureSessionId||'')===String(sessionId||''));
}
function clearTerminalPresentation(){
  const card=document.getElementById('h38GuidedController');
  card?.querySelector('.h38-review-terminal-note')?.remove();
  card?.removeAttribute('data-h38-review-terminal');
}
function showTerminalPresentation(message){
  const card=document.getElementById('h38GuidedController');if(!card)return;
  card.setAttribute('data-h38-review-terminal','1');
  card.querySelector('.h38-guided-working')?.remove();
  const title=card.querySelector('.h38-guided-title strong');if(title)title.textContent='Review complete';
  const subtitle=card.querySelector('.h38-guided-title small');if(subtitle)subtitle.textContent='No actionable findings from the current evidence.';
  let note=card.querySelector('.h38-review-terminal-note');
  if(!note){
    note=document.createElement('div');
    note.className='h38-review-terminal-note';
    note.innerHTML='<strong>Nothing else required from this walkthrough yet</strong><span></span>';
    card.querySelector('.h38-guided-title')?.insertAdjacentElement('afterend',note);
  }
  const span=note?.querySelector('span');if(span)span.textContent=message;
  card.querySelectorAll('.h38-guided-section p').forEach(p=>{if(/still processing|reading the saved|reviewing walkthrough/i.test(String(p.textContent||'')))p.textContent='No additional finding was produced from the current evidence.';});
  const next=card.querySelector('.h38-guided-next.done strong');if(next)next.textContent='Add a spoken/typed note, measurement, or detail photo if you want H38 to analyze more.';
}
async function settleWalkthroughReview(){
  if(!mobile()||!fieldActuallyOpen())return;
  const v=activeVisit(),s=v?.walkthroughAi;if(!v?.sessionId||!s)return;
  const status=String(s.status||'').toUpperCase(),key=String(v.sessionId);
  if(!['SYNCING','ANALYZING'].includes(status)){
    reviewWorkingSince.delete(key);
    if(status!=='NEEDS_INPUT')clearTerminalPresentation();
    else showTerminalPresentation(String(s.message||'Add a note, measurement, or detail photo to continue.'));
    return;
  }
  if(reviewRecordExists(v.sessionId)){reviewWorkingSince.delete(key);return;}
  if(!reviewWorkingSince.has(key))reviewWorkingSince.set(key,Date.now());
  if(Date.now()-reviewWorkingSince.get(key)<REVIEW_WORK_MAX_MS)return;
  s.status='NEEDS_INPUT';
  s.message='The walkthrough is saved, but H38 did not find enough actionable evidence to produce another field recommendation. Add a spoken or typed note, a measurement, or a detail photo, then tap Reanalyze current evidence.';
  s.updatedAt=new Date().toISOString();
  reviewWorkingSince.delete(key);
  try{await window.H38_FIELD_VISIT_CORE?.saveDraft?.();}catch(_){}
  try{window.H38_FIELD_VISIT_GUIDANCE?.decorate?.(true);}catch(_){}
  setTimeout(()=>showTerminalPresentation(s.message),0);
  try{window.toast?.('Walkthrough saved. No additional field input is required unless you want H38 to analyze more.',false);}catch(_){}
}
installStyle();setViewportVars();
['pointerdown','touchstart','wheel','keydown'].forEach(name=>window.addEventListener(name,markInteraction,{passive:true,capture:true}));
window.visualViewport?.addEventListener('resize',schedule,{passive:true});
window.addEventListener('resize',schedule,{passive:true});
window.addEventListener('orientationchange',()=>setTimeout(schedule,120),{passive:true});
window.addEventListener('pageshow',()=>{wrapOpenPage();wrapRenderNav();stabilizeAfterRender();});
window.addEventListener('focus',stabilizeAfterRender);
document.addEventListener('h38:business-snapshot-updated',schedule);
const observer=new MutationObserver(()=>{wrapOpenPage();wrapRenderNav();schedule();if(activeVisit()?.walkthroughAi?.status==='NEEDS_INPUT')showTerminalPresentation(activeVisit().walkthroughAi.message);});
observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden','aria-hidden']});
setInterval(()=>void settleWalkthroughReview(),2500);
setTimeout(()=>{wrapOpenPage();wrapRenderNav();stabilizeAfterRender();void settleWalkthroughReview();},0);
setTimeout(()=>{wrapOpenPage();wrapRenderNav();stabilizeAfterRender();void settleWalkthroughReview();},500);
window.H38_MOBILE_RUNTIME_STABILITY=Object.freeze({
  build:BUILD,
  publishedOfficeAuthority:true,
  nativeShellHardwareOnly:true,
  dynamicViewport:true,
  safeAreaBottom:true,
  fixedNavIsolation:true,
  fieldVisitSingleBottomNav:true,
  keyboardZoomGuard:true,
  screenInstabilityGuard:true,
  officeDocumentScroll:false,
  officeExplicitMainScroller:true,
  officeFixedViewportScroller:true,
  documentScrollDisabledByDesign:true,
  manualTouchScrollFallback:true,
  nestedScrollPreserved:true,
  scrollRegressionRepair:true,
  officeOverscrollBounceDisabled:true,
  officeOverscrollContained:true,
  officeVerticalPanPreserved:true,
  staleFieldDomDoesNotLockOfficeScroll:true,
  jobsMutationScrollChurnDisabled:true,
  visualViewportScrollStabilizerDisabled:true,
  mobilePrimaryNavigationSingleAuthority:true,
  accessiblePrimaryNav:true,
  strayQuoteActionHiddenOutsideQuotes:true,
  bottomNavContentReachable:true,
  productionHeaderCompact:true,
  productionCardDensity:true,
  productionTouchTargets:true,
  mobileJobsHeadingSimplified:true,
  mobileJobsCreationToolsCollapsed:true,
  mobileRecordCardsFirst:true,
  mobileCustomerEntryFormsCollapsed:true,
  customerGridCollapseRegressionFixed:true,
  mobileMessageCopyPolished:true,
  walkthroughReviewTerminalState:true,
  walkthroughReviewMaxWorkingMs:REVIEW_WORK_MAX_MS,
  noInfiniteReviewSpinner:true,
  automaticApproval:false,
  automaticCustomerSending:false,
  automaticPurchasing:false,
  automaticPayment:false,
  automaticScheduling:false
});
})();