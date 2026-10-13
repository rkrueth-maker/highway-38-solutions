(function(){
'use strict';
const BUILD='20260911-cross-platform-assistant-polish-3-launch-stability';
let lastSearchTrigger=null;
let shellSyncTimer=0;
let applyScheduled=false;

function text(value){return String(value==null?'':value).trim();}
function setText(node,value){const next=String(value==null?'':value);if(node&&node.textContent!==next)node.textContent=next;}
function northernTenant(){try{const b=window.state?.snapshot?.business||{};const key=text(b.businessKey||b['Business Key']||window.state?.businessKey||new URLSearchParams(location.search).get('businessKey')||'').toLowerCase();return key==='northern-lakes';}catch(_){return false;}}
function assistantDisplayName(){return northernTenant()?'Assistant':'My Hank';}
function assistantPageTitle(){return northernTenant()?'Personal Assistant':'My Hank';}
function searchDialog(){return document.getElementById('h38OfficeSearchDialog');}
function androidNative(){return /H38SiteScannerAndroid\//.test(String(navigator.userAgent||''))||!!window.AndroidH38Native;}
function iosLike(){return /iPhone|iPad|iPod/i.test(String(navigator.userAgent||''));}
function isStaff(){
  const user=window.state?.snapshot?.user||{};
  const role=text(user.roleId||user.roleName||user.role).toLowerCase();
  return role==='staff'||document.body.classList.contains('h38-employee-mode');
}
function ownerLabel(){
  const user=window.state?.snapshot?.user||{};
  const auth=window.H38_SUPABASE_AUTH?.getState?.()||{};
  return text(user.displayName||user.name||user.email||auth.user?.email||auth.email||'your signed-in account');
}
function resetSearch(dialog){
  const input=dialog?.querySelector('#h38OfficeSearchInput');
  const results=dialog?.querySelector('#h38OfficeSearchResults');
  if(input){input.value='';input.blur();}
  if(results&&results.innerHTML!=='<p class="muted">Type at least two characters.</p>')results.innerHTML='<p class="muted">Type at least two characters.</p>';
}
function closeSearch(reason='close'){
  const dialog=searchDialog();
  if(!dialog||!dialog.open)return false;
  resetSearch(dialog);
  try{dialog.close(reason);}catch(_){dialog.removeAttribute('open');}
  const target=lastSearchTrigger||document.getElementById('h38OfficeSearchButton');
  setTimeout(()=>{try{target?.focus?.({preventScroll:true});}catch(_){}},0);
  return true;
}
function polishSearch(){
  const dialog=searchDialog();
  if(!dialog||dialog.dataset.h38OfficePolished==='1')return;
  dialog.dataset.h38OfficePolished='1';
  const shell=dialog.querySelector('.h38-search-shell');
  shell?.setAttribute('role','search');
  const input=dialog.querySelector('#h38OfficeSearchInput');
  if(input){input.setAttribute('aria-label','Search Business Office');input.setAttribute('enterkeyhint','search');}
  const close=dialog.querySelector('header button');
  if(close){
    close.type='button';
    close.removeAttribute('value');
    close.classList.add('h38-search-close');
    close.setAttribute('aria-label','Close Business Office search');
    close.innerHTML='<span aria-hidden="true">×</span><span class="h38-search-close-label">Close</span>';
    close.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();closeSearch('close');});
  }
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeSearch('cancel');});
  dialog.addEventListener('click',event=>{if(event.target===dialog)closeSearch('backdrop');});
  dialog.addEventListener('close',()=>resetSearch(dialog));
}
function bindSearchTrigger(button){
  if(!button||button.dataset.h38OfficePolishTrigger==='1')return;
  button.dataset.h38OfficePolishTrigger='1';
  button.setAttribute('aria-haspopup','dialog');
  button.setAttribute('title','Search Business Office');
  button.addEventListener('click',()=>{lastSearchTrigger=button;queueMicrotask(polishSearch);});
}
function installPlatformClasses(){
  const root=document.documentElement;
  root.classList.toggle('h38-native-android',androidNative());
  root.classList.toggle('h38-ios-like',iosLike());
  root.classList.add('h38-cross-platform-shell');
}
function syncShellTop(){
  clearTimeout(shellSyncTimer);
  shellSyncTimer=setTimeout(()=>{
    if(!matchMedia('(max-width:760px)').matches)return;
    let bottom=0;
    for(const node of [document.querySelector('.topbar'),document.querySelector('.business-bar')]){
      if(!node||node.hidden)continue;
      try{
        const style=getComputedStyle(node);
        if(style.display==='none'||style.visibility==='hidden'||!node.getClientRects().length)continue;
        bottom=Math.max(bottom,Math.ceil(node.getBoundingClientRect().bottom));
      }catch(_){}
    }
    if(bottom>0){
      const next=`${bottom}px`;
      if(document.documentElement.style.getPropertyValue('--h38-office-shell-top')!==next)document.documentElement.style.setProperty('--h38-office-shell-top',next);
    }
  },0);
}
function openUnifiedAssistant(event){
  if(isStaff())return;
  event?.preventDefault?.();
  event?.stopImmediatePropagation?.();
  try{
    if(window.H38_PERSONAL_ASSISTANT&&typeof window.openPage==='function'){
      window.openPage('assistant');
      return true;
    }
  }catch(_){}
  try{
    if(typeof window.openPage==='function'){
      window.openPage('assistant');
      if(window.state?.page==='assistant')return true;
    }
  }catch(_){}
  try{window.openGlobalAi?.();return true;}catch(_){return false;}
}
function syncAssistantBadge(){
  const source=document.querySelector('#personalAssistantButton .pa-due-dot');
  const launcher=document.getElementById('globalAiButton');
  if(!launcher)return;
  let badge=launcher.querySelector('.h38-floating-due');
  // The top-bar Personal Assistant button no longer exists (desktop
  // sleekness, 2026-10-13); personal-assistant.js now publishes its due
  // count on window.H38_PA_DUE_COUNT and badges the pill directly. Keep
  // the legacy fixture/button source working when one is present.
  const count=text(source?.textContent)||(Number(window.H38_PA_DUE_COUNT||0)>0?String(Math.min(99,Number(window.H38_PA_DUE_COUNT))):'');
  if(!count){badge?.remove();return;}
  if(!badge){badge=document.createElement('span');badge.className='h38-floating-due';launcher.appendChild(badge);}
  setText(badge,count);
}
function polishAssistantLauncher(){
  const personal=document.getElementById('personalAssistantButton');
  if(personal){
    if(personal.hidden!==true)personal.hidden=true;
    if(personal.tabIndex!==-1)personal.tabIndex=-1;
    if(personal.getAttribute('aria-hidden')!=='true')personal.setAttribute('aria-hidden','true');
  }
  const launcher=document.getElementById('globalAiButton');
  if(launcher){
    const displayName=assistantDisplayName();
    // The launcher is styled position:fixed, but it ships inside the top bar.
    // On phone widths the mobile shell styles give .topbar a transform, which
    // makes the header the containing block for fixed descendants — the pill
    // anchored to the header and rendered above the viewport (complete scan
    // 2026-10-13, rect y=-74 at 390px). A viewport-floating launcher belongs
    // at body level; move it there once so fixed positioning is always
    // viewport-relative. Listeners and ID lookups are unaffected by the move.
    if(document.body&&launcher.parentElement!==document.body)document.body.appendChild(launcher);
    launcher.classList.add('h38-floating-assistant','h38-polish-touch');
    if(launcher.getAttribute('aria-label')!==displayName)launcher.setAttribute('aria-label',displayName);
    if(launcher.getAttribute('title')!==displayName)launcher.setAttribute('title',displayName);
    if(launcher.dataset.h38UnifiedAssistant!=='1'){
      launcher.dataset.h38UnifiedAssistant='1';
      launcher.innerHTML='<span class="h38-floating-assistant-icon" aria-hidden="true">✦</span><span class="h38-floating-assistant-label">'+displayName+'</span>';
      launcher.addEventListener('click',openUnifiedAssistant,true);
    }else{
      const label=launcher.querySelector('.h38-floating-assistant-label,.ai-launcher-label');
      if(label&&text(label.textContent)!==displayName)label.textContent=displayName;
    }
  }
  syncAssistantBadge();
  bindFabCollapse();
}
function bindFabCollapse(){
  // Shrink the assistant pill to an icon button once the user scrolls into
  // page content, so it never sits on top of right-edge content. Expands
  // again near the top. Bound once; rAF-throttled passive listener.
  const launcher=document.getElementById('globalAiButton');
  if(!launcher||launcher.dataset.h38FabCollapse==='1')return;
  launcher.dataset.h38FabCollapse='1';
  let ticking=false;
  const update=()=>{
    ticking=false;
    const y=window.scrollY||document.documentElement.scrollTop||document.body.scrollTop||0;
    launcher.classList.toggle('h38-fab-collapsed',y>140);
  };
  const onScroll=()=>{if(ticking)return;ticking=true;if(typeof requestAnimationFrame==='function')requestAnimationFrame(update);else update();};
  window.addEventListener('scroll',onScroll,{passive:true});
  update();
}
function commandButton(label,command){
  const button=document.createElement('button');
  button.type='button';
  button.className='secondary h38-assistant-chip';
  button.textContent=label;
  button.dataset.h38AssistantCommand=command;
  button.addEventListener('click',()=>{
    const form=document.getElementById('paCommandForm'),input=form?.querySelector('[name="command"]');
    if(!form||!input)return;
    input.value=command;
    form.requestSubmit();
  });
  return button;
}
function ensureOwnerNote(main){
  let note=main.querySelector('.h38-owner-assistant-note');
  if(note)return note;
  note=document.createElement('div');
  note.className='h38-owner-assistant-note';
  const strong=document.createElement('strong');strong.textContent='Your private assistant';
  const span=document.createElement('span');
  note.append(strong,span);
  main.querySelector('.pa-shell')?.prepend(note);
  return note;
}
function decorateAssistantPage(){
  if(window.state?.page!=='assistant')return;
  const main=document.getElementById('mainContent');
  const form=document.getElementById('paCommandForm');
  if(!main||!form)return;
  const heading=main.querySelector('.page-head h1');
  setText(heading,assistantPageTitle());
  const intro=main.querySelector('.page-head p');
  setText(intro,'Private to your sign-in. Ask questions, manage personal reminders, or give H38 Business Office commands.');
  const label=form.querySelector('label');
  setText(label,'Ask or command H38');
  const input=form.querySelector('[name="command"]');
  if(input){
    input.setAttribute('placeholder','Open Smith customer  |  Start quote for Johnson  |  Show inventory  |  Remind me to call supplier tomorrow');
    input.setAttribute('enterkeyhint','send');
  }
  const ownerNote=ensureOwnerNote(main);
  const ownerSpan=ownerNote?.querySelector('span');
  setText(ownerSpan,`Personal items belong only to ${ownerLabel()}. Business commands use your current Office permissions and existing review gates.`);
  if(!form.querySelector('.h38-assistant-command-chips')){
    const chips=document.createElement('div');
    chips.className='h38-assistant-command-chips';
    chips.append(
      commandButton('My day','What do I need to do today?'),
      commandButton('Open jobs','Open jobs'),
      commandButton('Find customer','Open customer Smith'),
      commandButton('Show schedule','Show schedule'),
      commandButton('Agent status','Agent status')
    );
    form.insertBefore(chips,form.firstChild);
  }
}
function polishTouchTargets(){
  bindSearchTrigger(document.getElementById('h38OfficeSearchButton'));
  bindSearchTrigger(document.getElementById('h38AssistantSearch'));
  bindSearchTrigger(document.getElementById('h38OpenLifecycleSearch'));
  document.getElementById('h38OfficeSearchButton')?.classList.add('h38-polish-touch');
}
/* Card-top band (treatment B, Rick-approved 2026-10-13): every content card gets a
   tinted header band — icon chip + title + the card's own status pill when it has
   one. Runs inside this shared polish pass so all views inherit it (Today, Jobs,
   Quotes, Money, Customers, Schedule, Messages inbox, …) with no per-view markup
   changes and no new requests. Cards with their own designed headers (Today
   .h38-action-card action cards, .h38-profit-card) and heading-less stat cards are
   left untouched, so big numbers stay dominant. Tenant-neutral: chip glyphs come
   from the page icon vocabulary (app-01 PAGE_DEFS) or the heading's own leading
   emoji — never business branding. */
const CARD_PAGE_ICONS={today:'⌂',customers:'👤',meetings:'🗣️',work:'🧰',tasks:'📋',quotes:'🧾',measure:'📐',schedule:'🗓',messages:'💬',field:'📍',inventory:'📦',fleet:'🚚',money:'💵',memberships:'🎟',accounting:'🧮',payroll:'💰',tax:'📑',reports:'📊',documents:'📁',social:'📣',ai:'🤖',assistant:'✦',settings:'⚙️',people:'👥',controls:'🎛️'};
function cardHeadingGlyph(heading){
  const node=heading.firstChild;
  if(!node||node.nodeType!==3)return'';
  const match=node.textContent.match(/^(\s*)([^\p{L}\p{N}]+)/u);
  if(!match)return'';
  const run=match[2].trim();
  if(!run||[...run].length>3)return'';
  if(![...run].some(ch=>ch.codePointAt(0)>0x2000))return'';
  node.textContent=node.textContent.slice(match[0].length).replace(/^[\s\uFE0F\u200D]+/u,'');
  return run;
}
function cardBandPillTone(pill){
  if(['good','bad','pending','warn','info','neutral'].some(kind=>pill.classList.contains(kind)))return;
  const label=text(pill.textContent).toLowerCase();
  const tone=/\b(overdue|past due|failed|declined|missed|cancelled|canceled)\b/.test(label)?'bad'
    :/\b(paid|completed|complete|done|approved|won|strong|delivered|signed)\b/.test(label)?'good'
    :/\bin progress\b/.test(label)?'info'
    :/\b(draft|pending|awaiting|review)\b/.test(label)?'pending':'';
  if(tone)pill.classList.add(tone);
}
function cardBandKicker(wrapper,heading){
  // The kicker/eyebrow line that introduces a heading inside a designed head
  // wrapper: class-marked (kicker/eyebrow), or a bare short span/p directly
  // before the heading. It moves into the band so the card keeps its context.
  const marked=wrapper.querySelector('.eyebrow,[class*="kicker" i]');
  if(marked&&marked!==heading&&!marked.classList.contains('pill')&&(marked.compareDocumentPosition(heading)&Node.DOCUMENT_POSITION_FOLLOWING))return marked;
  const prev=heading.previousElementSibling;
  if(prev&&(prev.tagName==='SPAN'||prev.tagName==='P')&&!prev.querySelector('*')&&!prev.classList.contains('pill')&&text(prev.textContent)&&text(prev.textContent).length<=48)return prev;
  return null;
}
function polishCardBands(){
  const main=document.getElementById('mainContent');
  if(!main)return;
  main.querySelectorAll('.card,.h38-platform-card').forEach(card=>{
    // Presence of the band itself is the guard (not the data attribute): a
    // renderer that rewrites a card's innerHTML — platform-next does this on
    // every render — drops the band, and the next pass must restore it.
    if(card.querySelector(':scope > .card-band'))return;
    if(card.classList.contains('h38-action-card')||card.classList.contains('h38-profit-card')){card.dataset.h38CardBand='skip';return;}
    if(card.id==='h38CustomerReadyHero'||card.id==='h38CustomerReadyCards')return;
    const first=card.firstElementChild;
    if(!first)return;
    // Today's readiness sections, the kit feed and the lifecycle cards keep
    // their own designed heads (treatment-B implementation decision).
    if(first.classList.contains('h38-ready-section-head')||first.classList.contains('h38-kit-feed-head')||first.classList.contains('h38-life-head')){card.dataset.h38CardBand='skip';return;}
    let heading=null,pill=null,rowHost=null,rowHostOnly=false,kicker=null,headWrap=null;
    if(first.matches('h2,h3')){
      heading=first;
      const sibling=heading.nextElementSibling;
      if(sibling&&sibling.classList.contains('pill'))pill=sibling;
    }else if(first.classList.contains('row-top')){
      const head=first.querySelector(':scope > h2,:scope > h3');
      const headPill=first.querySelector(':scope > .pill');
      if(head){heading=head;pill=headPill;rowHost=first;rowHostOnly=[...first.children].every(el=>el===head||el===headPill);}
    }else if(first.tagName==='DIV'||first.tagName==='HEADER'||first.tagName==='SECTION'){
      // Designed head wrapper (h38-customer-directory-head, h38-c360-head,
      // h38-photo-quote-head, h38-platform-head, …): the heading lives inside
      // it next to a kicker, a note and/or actions. Band the heading (plus
      // kicker and a loose status pill/badge); notes, buttons and counts stay
      // in the wrapper below the band. Wrappers holding form controls or
      // content lists are not heads and are left alone.
      const cls=String(first.className||'');
      if(/(^|[-_ ])head($|[-_ ])/.test(cls)){
        const head=first.querySelector('h2,h3');
        if(head&&(head.parentElement===first||head.parentElement.parentElement===first)&&!first.querySelector('input,select,textarea,form,.card,.list,table')){
          heading=head;headWrap=first;
          kicker=cardBandKicker(first,head);
          pill=first.querySelector('.pill')||first.querySelector('.h38-platform-badge');
        }
      }
    }
    if(!heading||heading.hidden||heading.classList.contains('hidden')||!text(heading.textContent))return;
    card.dataset.h38CardBand='1';
    const glyph=cardHeadingGlyph(heading);
    const band=document.createElement('div');
    band.className='card-band';
    const chip=document.createElement('span');
    chip.className='card-chip';
    chip.setAttribute('aria-hidden','true');
    chip.textContent=glyph||CARD_PAGE_ICONS[text(window.state&&window.state.page)]||'▦';
    const titleWrap=document.createElement('div');
    titleWrap.className='card-band-title';
    if(kicker){kicker.classList.add('card-band-kicker');titleWrap.appendChild(kicker);}
    titleWrap.appendChild(heading);
    band.append(chip,titleWrap);
    if(pill){if(pill.classList.contains('pill'))cardBandPillTone(pill);band.appendChild(pill);}
    if(rowHost&&rowHostOnly)rowHost.remove();
    if(headWrap&&!headWrap.querySelector('*')&&!text(headWrap.textContent))headWrap.remove();
    card.insertBefore(band,card.firstChild);
  });
}
let applyMuted=false;
function apply(){
  if(applyMuted)return;
  applyMuted=true;
  try{
    installPlatformClasses();
    polishSearch();
    polishTouchTargets();
    polishAssistantLauncher();
    decorateAssistantPage();
    syncShellTop();
    polishCardBands();
  }finally{
    setTimeout(()=>{applyMuted=false;},50);
  }
}
function scheduleApply(){
  if(applyScheduled||applyMuted)return;
  applyScheduled=true;
  const run=()=>{applyScheduled=false;apply();};
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(run);else setTimeout(run,0);
}

const observer=new MutationObserver(()=>{if(!applyMuted)scheduleApply();});
observer.observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&searchDialog()?.open){event.preventDefault();closeSearch('escape');}},true);
window.addEventListener('resize',syncShellTop,{passive:true});
window.visualViewport?.addEventListener('resize',syncShellTop,{passive:true});
window.visualViewport?.addEventListener('scroll',syncShellTop,{passive:true});
window.addEventListener('pageshow',scheduleApply);
apply();

window.H38_OFFICE_POLISH=Object.freeze({
  enabled:true,
  build:BUILD,
  searchExitGuaranteed:true,
  closeSearch,
  quoteAiChanged:false,
  navigationAuthority:false,
  unifiedAssistantLauncher:true,
  personalAssistantPrivatePerUser:true,
  businessCommandBusPreserved:true,
  androidSafeArea:true,
  iosSafeAreaReady:true,
  mutationFeedbackLoopPrevented:true,
  mutationObserverCoalesced:true,
  nativeIosShellCreated:false
});
})();

(function(){
'use strict';
const BUILD='20260905-assistant-management-commands-1';
const text=value=>String(value==null?'':value).trim();
const lower=value=>text(value).toLowerCase();
let scheduled=false;

function isStaff(){
  const user=window.state?.snapshot?.user||{};
  const role=lower(user.roleId||user.roleName||user.role);
  return role==='staff'||document.body.classList.contains('h38-employee-mode');
}
function businessControlKind(command){
  const q=lower(command);
  if(!q)return'';
  if(/\b(team access|team directory|employee access|staff access|manage employees?|employee accounts?)\b/.test(q))return'team';
  if(/\b(existing[- ]data uptake|data uptake|import (?:existing|historical|old) data|historical import|bring in (?:old|existing) data)\b/.test(q))return'data';
  if(/\b(quote learning|business quote learning|quote history|pricing history|labor history|learn(?:ing)? from (?:quotes|jobs|history)|analy[sz]e (?:this )?business|analy[sz]e .*quote)\b/.test(q))return'learning';
  if(/\b(time\s*&\s*attendance|time and attendance|time attendance|time clock|time details|timesheets?|time entries|attendance)\b/.test(q))return'time';
  if(/\b(task manager|deployment|assign(?:ed)? tasks?|team tasks?)\b/.test(q))return'tasks';
  if(/\b(erp center|h38 erp|erp)\b/.test(q))return'erp';
  return'';
}
function focusWhenReady(selector,activate=false){
  if(!selector)return;
  let tries=0;
  const check=()=>{
    const node=document.querySelector(selector);
    if(node){
      try{(node.closest?.('.h38-erp-section')||node).scrollIntoView?.({block:'start'});}catch(_){}
      if(activate)try{node.click?.();}catch(_){}
      return;
    }
    if(++tries<30)setTimeout(check,100);
  };
  setTimeout(check,60);
}
function triggerErp(target){
  if(!document.body)return false;
  const selector=`[data-h38-erp-open="${target}"]`;
  const existing=document.querySelector(selector);
  if(existing){existing.click();return true;}
  const proxy=document.createElement('button');
  proxy.type='button';
  proxy.hidden=true;
  proxy.dataset.h38ErpOpen=target;
  document.body.appendChild(proxy);
  proxy.click();
  proxy.remove();
  return true;
}
function openErpSurface(target='erp',selector='',activate=false){
  let opened=false;
  const run=()=>{
    if(opened||!window.H38_ERP_FOUNDATION)return false;
    opened=true;
    triggerErp(target);
    focusWhenReady(selector,activate);
    return true;
  };
  if(run())return true;
  let script=document.querySelector('script[data-h38-erp-foundation]');
  if(!script&&document.body){
    script=document.createElement('script');
    script.src='./erp-foundation.js?build=20260903-erp-time-uptake-learning-2';
    script.async=false;
    script.dataset.h38ErpFoundation='assistant-management-commands';
    document.body.appendChild(script);
  }
  let tries=0;
  const timer=setInterval(()=>{if(run()||++tries>=30)clearInterval(timer);},100);
  return true;
}
async function handleBusinessControl(command){
  const kind=businessControlKind(command);
  if(!kind)return'';
  if(kind==='tasks'){
    try{window.openPage?.('work');}catch(_){}
    return'Opened Jobs & Task Manager. Assignment and deployment changes still require the explicit Task Manager controls.';
  }
  if(isStaff())return'That management control is owner/administrator-only. Employee mode stays limited to your assigned work and your own time punch.';
  if(kind==='time'){
    openErpSurface('time','#h38ErpTime',false);
    return'Opened Time & attendance. The assistant does not clock, edit, or approve time; use the audited time controls.';
  }
  if(kind==='team'){
    openErpSurface('erp','#h38TeamAccess',false);
    return'Opened Team Access in Business Center. Adding, changing, or removing employee access still requires the explicit Team Access controls.';
  }
  if(kind==='data'){
    openErpSurface('erp','#h38DataUptake',false);
    return'Opened Existing-data uptake in Business Center. H38 does not stage or apply an import until you use those explicit controls.';
  }
  if(kind==='learning'){
    const runAnalysis=/\b(analy[sz]e|run|check|review|learn from)\b/.test(lower(command));
    openErpSurface('erp',runAnalysis?'[data-h38-learning]':'#h38QuoteLearning',runAnalysis);
    return runAnalysis?'Opened Business-specific quote learning and started the internal advisory analysis. It does not change quote prices, approve, or send anything.':'Opened Business-specific quote learning. It remains tenant-only and advisory.';
  }
  openErpSurface('erp','',false);
  return'Opened H38 Business Center. External actions remain owner-controlled.';
}
function augmentCommandBus(){
  const base=window.H38_ASSISTANT_COMMAND_BUS;
  if(!base?.canHandle||!base?.handle||base.h38CrossPlatformBusinessControls===true)return;
  const baseCanHandle=base.canHandle.bind(base);
  const baseHandle=base.handle.bind(base);
  const canHandle=command=>!!businessControlKind(command)||baseCanHandle(command);
  const handle=async(command,options={})=>businessControlKind(command)?handleBusinessControl(command):baseHandle(command,options);
  window.H38_ASSISTANT_COMMAND_BUS=Object.freeze({
    ...base,
    build:`${text(base.build)||'assistant-command-bus'}+${BUILD}`,
    canHandle,
    handle,
    h38CrossPlatformBusinessControls:true,
    erpCenterCommands:true,
    timeAttendanceCommands:true,
    teamAccessCommands:true,
    dataUptakeCommands:true,
    quoteLearningCommands:true,
    taskManagerCommands:true,
    automaticTimePunch:false,
    automaticTeamAccessChange:false,
    automaticDataImportApply:false,
    automaticQuoteLearningMutation:false
  });
  window.dispatchEvent(new CustomEvent('h38:assistant-command-bus-ready',{detail:{build:BUILD,managementCommands:true}}));
}
function augmentPersonalAssistant(){
  const pa=window.H38_PERSONAL_ASSISTANT;
  const bus=window.H38_ASSISTANT_COMMAND_BUS;
  if(!pa?.runCommand||!bus?.h38CrossPlatformBusinessControls||pa.h38CrossPlatformBusinessControls===true)return;
  const baseRun=pa.runCommand.bind(pa);
  window.H38_PERSONAL_ASSISTANT=Object.freeze({
    ...pa,
    build:`${text(pa.build)||'personal-assistant'}+${BUILD}`,
    runCommand:async command=>businessControlKind(command)?bus.handle(command,{source:'my-h38-assistant-management'}):baseRun(command),
    h38CrossPlatformBusinessControls:true,
    managementCommandsUseExistingAuthorities:true
  });
}
function managementChip(container,label,command,key){
  if(container.querySelector(`[data-h38-business-control-chip="${key}"]`))return;
  const button=document.createElement('button');
  button.type='button';
  button.className='secondary h38-assistant-chip';
  button.dataset.h38BusinessControlChip=key;
  button.textContent=label;
  button.addEventListener('click',()=>{
    const form=document.getElementById('paCommandForm'),input=form?.querySelector('[name="command"]');
    if(!form||!input)return;
    input.value=command;
    form.requestSubmit();
  });
  container.appendChild(button);
}
function addManagementChips(){
  if(window.state?.page!=='assistant'||isStaff())return;
  const chips=document.querySelector('#paCommandForm .h38-assistant-command-chips');
  if(!chips)return;
  managementChip(chips,'Business center','Open Business Center','erp');
  managementChip(chips,'Time & attendance','Open Time & Attendance','time');
  managementChip(chips,'Team access','Open Team Access','team');
}
function publishFlags(){
  const current=window.H38_OFFICE_POLISH||{};
  if(current.erpAssistantCommands===true)return;
  window.H38_OFFICE_POLISH=Object.freeze({
    ...current,
    erpAssistantCommands:true,
    timeAttendanceAssistantCommands:true,
    teamAccessAssistantCommands:true,
    dataUptakeAssistantCommands:true,
    quoteLearningAssistantCommands:true,
    taskManagerAssistantCommands:true,
    automaticTimePunch:false,
    automaticTeamAccessChange:false,
    automaticDataImportApply:false,
    automaticQuoteLearningMutation:false
  });
}
function apply(){
  augmentCommandBus();
  augmentPersonalAssistant();
  addManagementChips();
  publishFlags();
}
function schedule(){
  if(scheduled)return;
  scheduled=true;
  queueMicrotask(()=>{scheduled=false;apply();});
}
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('h38:assistant-command-bus-ready',schedule);
window.addEventListener('h38:business-snapshot-updated',schedule);
window.addEventListener('pageshow',schedule);
apply();
})();