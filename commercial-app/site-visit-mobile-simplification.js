(function(){
'use strict';
const BUILD='20260916-site-visit-mobile-simplification-2';
const text=v=>String(v==null?'':v).trim();
const mobile=()=>matchMedia('(max-width:760px)').matches;
let queued=false;
function visitOpen(){return window.H38_FIELD_VISIT_CORE?.state?.open===true;}
function cleanActivity(){
  document.querySelectorAll('.h38-ready-activity,.h38-c360-timeline,[data-h38-activity],.activity-list,.timeline').forEach(root=>{
    root.querySelectorAll('span,strong,small,p,div').forEach(node=>{
      if(node.children.length)return;
      let s=node.textContent||'';
      s=s.replace(/^Meeting\s*·\s*/i,'Conversation · ').replace(/^Site visit\s*·\s*Site visit\b/i,'Site visit');
      if(s!==node.textContent)node.textContent=s;
    });
  });
}
function hideLegacy(app){
  document.getElementById('h38MeetingVisitDock')?.remove();
  app.querySelectorAll('.field-device-card,.field-capture-counts,[data-field-after-walkthrough],.field-compact-help,.field-bottom-nav,.field-next,.h38-meeting-visit-dock').forEach(n=>{n.hidden=true;n.setAttribute('aria-hidden','true');});
  app.querySelectorAll('p,small,strong,h2,h3,div').forEach(n=>{
    if(n.children.length>1)return;
    const s=text(n.textContent).toLowerCase();
    if((s.includes('after walkthrough')||s.includes('walkthrough first')||s.includes('workflow stays available after')||s.includes('prepare site manager'))&&!n.closest('[data-h38-mobile-simple]')){n.hidden=true;n.setAttribute('aria-hidden','true');}
  });
}
function compactConversation(app){
  const card=app.querySelector('[data-field-meeting-seed]');if(!card)return;
  card.classList.add('h38-mobile-conversation');
  const head=card.querySelector('.field-meeting-seed-head');
  const strong=head?.querySelector('strong');if(strong)strong.textContent='Talk / Notes';
  const small=head?.querySelector('small');if(small)small.textContent='Optional. Record when useful; H38 keeps and organizes the notes.';
  card.querySelectorAll('button').forEach(button=>{const s=text(button.textContent);if(/resume conversation/i.test(s))button.textContent='🎙️ Resume';if(/view notes/i.test(s))button.textContent='Notes';if(/finish conversation/i.test(s))button.textContent='Finish Talking';});
}
function buildCaptureBar(app){
  const panel=app.querySelector('.field-panel.active')||app.querySelector('.field-panel');if(!panel)return;
  let bar=panel.querySelector('[data-h38-mobile-simple]');
  if(!bar){bar=document.createElement('section');bar.dataset.h38MobileSimple='1';bar.className='h38-mobile-capture';bar.innerHTML='<strong>Capture</strong><div class="h38-mobile-capture-row"></div>';const conversation=panel.querySelector('[data-field-meeting-seed]');(conversation||panel.querySelector('.field-step-head'))?.insertAdjacentElement('afterend',bar);}
  const row=bar.querySelector('.h38-mobile-capture-row');
  const photo=panel.querySelector('#fieldPhotos'),measure=panel.querySelector('#fieldCamera'),video=panel.querySelector('[data-simple-video]');
  if(photo){photo.textContent='📷 Photo';photo.hidden=false;photo.removeAttribute('aria-hidden');photo.disabled=false;if(photo.parentElement!==row)row.appendChild(photo);}
  if(video){video.textContent='🎥 Video';video.hidden=false;video.removeAttribute('aria-hidden');if(video.parentElement!==row)row.appendChild(video);}
  if(measure){measure.textContent='📏 Measure';measure.hidden=false;measure.removeAttribute('aria-hidden');measure.disabled=false;if(measure.parentElement!==row)row.appendChild(measure);}
  const stage=panel.querySelector('[data-field-walkthrough-stage]');if(stage){const evidence=stage.querySelector('[data-field-walkthrough-evidence]');if(evidence&&evidence.children.length&&!bar.contains(evidence))bar.appendChild(evidence);stage.hidden=true;stage.setAttribute('aria-hidden','true');}
  const manual=panel.querySelector('#fieldManual')?.closest('details');if(manual){manual.classList.add('h38-mobile-manual');const summary=manual.querySelector('summary');if(summary)summary.textContent='Enter measurement manually';}
}
function compactFinish(app){const finish=app.querySelector('.field-simple-finish');if(!finish)return;finish.classList.add('h38-mobile-finish');const small=finish.querySelector('small');if(small)small.textContent='Save and close this visit.';}
function simplify(){
  cleanActivity();if(!mobile()||!visitOpen())return;
  const app=document.getElementById('h38FieldVisitApp');if(!app)return;
  hideLegacy(app);compactConversation(app);buildCaptureBar(app);compactFinish(app);
  const head=app.querySelector('.field-panel.active .field-step-head')||app.querySelector('.field-step-head');
  if(head){const span=head.querySelector('span');if(span)span.textContent='Visit';const h=head.querySelector('h1');if(h)h.textContent='Site Visit';const p=head.querySelector('p');if(p)p.textContent='Talk, capture what helps, then finish.';}
}
function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;simplify();});}
const style=document.createElement('style');style.id='h38SiteVisitMobileSimplificationStyle';style.textContent=`
@media(max-width:760px){
body:has(#h38FieldVisitApp) #h38MeetingVisitDock,body:has(#h38FieldVisitApp) .h38-meeting-visit-dock,body:has(#h38FieldVisitApp) #h38MeetingRecordingDock{display:none!important}
#h38FieldVisitApp .field-device-card,#h38FieldVisitApp .field-capture-counts,#h38FieldVisitApp [data-field-after-walkthrough],#h38FieldVisitApp .field-compact-help,#h38FieldVisitApp .field-bottom-nav,#h38FieldVisitApp .field-next,#h38FieldVisitApp [data-field-walkthrough-stage]{display:none!important}
#h38FieldVisitApp .field-visit-main{padding:10px 72px calc(116px + env(safe-area-inset-bottom)) 10px!important}
#h38FieldVisitApp .field-step-head{margin-bottom:6px!important}#h38FieldVisitApp .field-step-head p{font-size:13px!important;margin:.15rem 0!important}
#h38FieldVisitApp .h38-mobile-conversation{padding:10px!important;margin:6px 0!important;border-width:1px!important;gap:7px!important}
#h38FieldVisitApp .h38-mobile-conversation .field-meeting-seed-head>span{display:none!important}#h38FieldVisitApp .h38-mobile-conversation .field-meeting-seed-head small{font-size:12px!important;line-height:1.25!important}
#h38FieldVisitApp .h38-mobile-conversation button{min-height:44px!important;padding:8px!important}
#h38FieldVisitApp .h38-mobile-capture{display:grid;gap:7px;padding:10px;margin:6px 0;border:1px solid rgba(23,63,95,.18);border-radius:14px;background:#fff}
#h38FieldVisitApp .h38-mobile-capture-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}#h38FieldVisitApp .h38-mobile-capture-row button{min-width:0!important;min-height:50px!important;padding:7px 3px!important;font-size:12px!important;white-space:normal!important}
#h38FieldVisitApp .h38-mobile-manual{margin:5px 0!important}#h38FieldVisitApp .h38-mobile-manual summary{font-size:13px!important}
#h38FieldVisitApp .h38-mobile-finish{margin:8px 0 0!important;padding:9px!important;gap:3px!important}#h38FieldVisitApp .h38-mobile-finish button{min-height:54px!important;font-size:17px!important}#h38FieldVisitApp .h38-mobile-finish small{font-size:11px!important}
}
`;document.head.appendChild(style);
new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true,characterData:true});
[0,80,200,500,1000,2000].forEach(ms=>setTimeout(schedule,ms));window.addEventListener('h38:business-snapshot-updated',schedule);window.addEventListener('resize',schedule);
window.H38_SITE_VISIT_MOBILE_SIMPLIFICATION=Object.freeze({build:BUILD,singleCaptureRow:true,conversationOptional:true,duplicateRecordingDockSuppressed:true,videoOptional:true,measurementOptional:true,finishDirect:true});
})();