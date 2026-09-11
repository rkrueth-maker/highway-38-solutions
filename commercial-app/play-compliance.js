(function(){
'use strict';
const BUILD='20260911-play-compliance-settings-event-only-2';
const PRIVACY_URL='https://highway38solutions.com/privacy.html';
const DELETE_URL='https://highway38solutions.com/account-deletion.html';
let scheduled=false;

function addCard(){
  const main=document.getElementById('mainContent');
  if(!main||document.getElementById('h38AccountPrivacyCard'))return;
  let settings=false;
  try{settings=(typeof state!=='undefined'&&state?.page==='settings');}catch(_){}
  if(!settings)return;
  const grid=main.querySelector('.grid');
  if(!grid)return;
  const card=document.createElement('section');
  card.id='h38AccountPrivacyCard';
  card.className='card span6';
  card.innerHTML=`<h2>Account & privacy</h2><p class="muted">Review how H38 handles Business Office data or request deletion of your signed-in H38 account and user-private records.</p><div class="actions"><a class="secondary" href="${PRIVACY_URL}" target="_self">Privacy policy</a><a class="secondary" href="${DELETE_URL}" target="_self">Delete account / data</a></div><p class="muted small">Shared business records may be retained by the business for legitimate accounting, audit, security, contractual, or legal purposes after a user's access is removed.</p>`;
  grid.appendChild(card);
}
function schedule(){
  if(scheduled)return;
  scheduled=true;
  queueMicrotask(()=>{scheduled=false;try{addCard();}catch(error){console.warn('[H38 privacy] Settings card:',error);}});
}

window.addEventListener('h38:office-page-rendered',event=>{if(event?.detail?.page==='settings')schedule();});
window.addEventListener('pageshow',()=>{try{if(window.state?.page==='settings')schedule();}catch(_){}});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{try{if(window.state?.page==='settings')schedule();}catch(_){}},{once:true});
else{try{if(window.state?.page==='settings')schedule();}catch(_){}}
window.H38_PLAY_COMPLIANCE=Object.freeze({enabled:true,build:BUILD,privacyUrl:PRIVACY_URL,accountDeletionUrl:DELETE_URL,eventDriven:true,settingsRendererOwnership:false,globalMutationObserver:false});
})();