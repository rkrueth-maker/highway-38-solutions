(function(){
'use strict';
const BUILD='20260916-site-visit-mobile-simplification-1';
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
  app.querySelectorAll('.field-device-card,.field-capture-counts,[data-field-after-walkthrough],.field-compact-help,.field-bottom-nav,.field-next,.h38-meeting-visit-dock').forEach(n=>n.remove());
  app.querySelectorAll('p,small,strong,h2,h3,div').forEach(n=>{
    if(n.children.length>1)return;
    const s=text(n.textContent).toLowerCase();
    if((s.includes('after walkthrough')||s.includes('walkthrough first')||s.includes('workflow stays available after')||s.includes('prepare site manager'))&&!n.closest('[data-h38-mobile-simple]')) n.style.display='none';
  });
}
function compactConversation(app){
  const card=app.querySelector('[data-field-meeting-seed]');if(!card)return;
  card.classList.add('h38-mobile-conversation');
  const head=card.querySelector('.field-meeting-seed-head');
  const strong=head?.querySelector('strong');if(strong)strong.textContent='Talk / Notes';
  const small=head?.querySelector('small');if(small)small.textContent='Optional. Record the conversation when useful and H38 will organize the notes.';
}
function buildCaptureBar(app){
  const panel=app.querySelector('.field-panel.active')||app.querySelector('.field-panel');if(!panel)return;
  let bar=panel.querySelector('[data-h38-mobile-simple]');
  if(!bar){bar=document.createElement('section');bar.dataset.h38MobileSimple='1';bar.className='h38-mobile-capture';bar.innerHTML='<strong>Capture what helps</strong><div class="h38-mobile-capture-row"></div>';const conversation=panel.querySelector('[data-field-meeting-seed]');(conversation||panel.querySelector('.field-step-head'))?.insertAdjacentElement('afterend',bar);}
  const row=bar.querySelector('.h38-mobile-capture-row');
  const photo=panel.querySelector('#fieldPhotos');
  const measure=panel.querySelector('#fieldCamera');
  const video=panel.querySelector('[data-simple-video]');
  if(photo){photo.textContent='📷 Photo';photo.hidden=false;photo.disabled=false;if(photo.parentElement!==row)row.appendChild(photo);}
  if(video){video.textContent='🎥 Video';video.hidden=false;if(video.parentElement!==row)row.appendChild(video);}
  if(measure){measure.textContent='📏 Measure';measure.hidden=false;measure.disabled=false;if(measure.parentElement!==row)row.appendChild(measure);}
  panel.querySelectorAll('.field-targeted-actions,.field-capture-actions').forEach(group=>{if(group!==row&&group.children.length===0)group.style.display='none';});
  const stage=panel.querySelector('[data-field-walkthrough-stage]');if(stage){const evidence=stage.querySelector('[data-field-walkthrough-evidence]');if(evidence&&evidence.children.length){bar.appendChild(evidence);}stage.style.display='none';}
  const manual=panel.querySelector('#fieldManual')?.closest('details');if(manual){manual.classList.add('h38-mobile-manual');const summary=manual.querySelector('summary');if(summary)summary.textContent='Enter measurement manually';}
}
function compactFinish(app){
  const finish=app.querySelector('.field-simple-finish');if(!finish)return;
  finish.classList.add('h38-mobile-finish');
  const small=finish.querySelector('small');if(small)small.textContent='Save what you captured and close this visit.';
}
function simplify(){
  cleanActivity();
  if(!mobile()||!visitOpen())return;
  const app=document.getElementById('h38FieldVisitApp');if(!app)return;
  hideLegacy(app);compactConversation(app);buildCaptureBar(app);compactFinish(app);
  const head=app.querySelector('.field-panel.active .field-step-head')||app.querySelector('.field-step-head');
  if(head){const span=head.querySelector('span');if(span)span.textContent='Visit';const h=head.querySelector('h1');if(h)h.textContent='Site Visit';const p=head.querySelector('p');if(p)p.textContent='Talk, capture what helps, then finish.';}
}
function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;simplify();});}
const style=document.createElement('style');style.id='h38SiteVisitMobileSimplificationStyle';style.textContent=`
@media(max-width:760px){
#h38FieldVisitApp .field-visit-main{padding:10px 10px calc(116px + env(safe-area-inset-bottom))!important}
#h38FieldVisitApp .field-step-head{margin-bottom:8px!important}#h38FieldVisitApp .field-step-head p{font-size:13px!important;margin:.2rem 0!important}
#h38FieldVisitApp .h38-mobile-conversation{padding:12px!important;margin:8px 0!important;border-width:1px!important;gap:8px!important}
#h38FieldVisitApp .h38-mobile-conversation .field-meeting-seed-head>span{display:none!important}
#h38FieldVisitApp .h38-mobile-conversation .field-meeting-seed-head small{font-size:12px!important;line-height:1.25!important}
#h38FieldVisitApp .h38-mobile-conversation button{min-height:46px!important}
#h38FieldVisitApp .h38-mobile-capture{display:grid;gap:8px;padding:12px;margin:8px 0;border:1px solid rgba(23,63,95,.18);border-radius:14px;background:#fff}
#h38FieldVisitApp .h38-mobile-capture-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
#h38FieldVisitApp .h38-mobile-capture-row button{min-width:0!important;min-height:52px!important;padding:8px 4px!important;font-size:13px!important;white-space:normal!important}
#h38FieldVisitApp .h38-mobile-manual{margin:6px 0!important}#h38FieldVisitApp .h38-mobile-manual summary{font-size:13px!important}
#h38FieldVisitApp .h38-mobile-finish{margin:10px 64px 0 0!important;padding:10px!important;gap:4px!important}#h38FieldVisitApp .h38-mobile-finish button{min-height:54px!important;font-size:17px!important}#h38FieldVisitApp .h38-mobile-finish small{font-size:11px!important}
#h38FieldVisitApp [data-field-walkthrough-stage]{display:none!important}
}
`;document.head.appendChild(style);
new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true,characterData:true});
[0,100,300,700,1500,3000].forEach(ms=>setTimeout(schedule,ms));
window.addEventListener('h38:business-snapshot-updated',schedule);window.addEventListener('resize',schedule);
window.H38_SITE_VISIT_MOBILE_SIMPLIFICATION=Object.freeze({build:BUILD,singleCaptureRow:true,conversationOptional:true,videoOptional:true,measurementOptional:true,finishDirect:true});
})();
