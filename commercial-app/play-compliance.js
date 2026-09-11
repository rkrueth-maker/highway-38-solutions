(function(){
'use strict';
const BUILD='20260911-play-compliance-event-driven-2-settings-authority-bootstrap';
const SETTINGS_AUTHORITY_BUILD='20260911-shared-settings-runtime-authority-1';
const PRIVACY_URL='https://highway38solutions.com/privacy.html';
const DELETE_URL='https://highway38solutions.com/account-deletion.html';
let scheduled=false;

function addCard(){
  const main=document.getElementById('mainContent');
  if(!main||document.getElementById('h38AccountPrivacyCard'))return;
  const heading=main.querySelector('.page-head h1')?.textContent||'';
  let settings=false;
  try{settings=(typeof state!=='undefined'&&state?.page==='settings')||/settings/i.test(heading);}catch(_){settings=/settings/i.test(heading);}
  if(!settings)return;
  const grid=main.querySelector('.grid');
  if(!grid)return;
  const card=document.createElement('section');
  card.id='h38AccountPrivacyCard';
  card.className='card span6';
  card.innerHTML=`<h2>Account & privacy</h2><p class="muted">Review how H38 handles Business Office data or request deletion of your signed-in H38 account and user-private records.</p><div class="actions"><a class="secondary" href="${PRIVACY_URL}" target="_self">Privacy policy</a><a class="secondary" href="${DELETE_URL}" target="_self">Delete account / data</a></div><p class="muted small">Shared business records may be retained by the business for legitimate accounting, audit, security, contractual, or legal purposes after a user's access is removed.</p>`;
  grid.appendChild(card);
}

function wrapSettings(){
  try{
    if(window.H38_SETTINGS_RUNTIME_AUTHORITY)return;
    if(typeof renderSettings!=='function'||renderSettings.__h38PlayCompliance)return;
    const original=renderSettings;
    const wrapped=function(){const result=original.apply(this,arguments);queueMicrotask(addCard);return result;};
    wrapped.__h38PlayCompliance=true;
    wrapped.__h38PlayComplianceBase=original;
    renderSettings=wrapped;
    window.renderSettings=wrapped;
  }catch(_){}
}
function loadSettingsAuthority(){
  if(window.H38_SETTINGS_RUNTIME_AUTHORITY||document.querySelector('script[data-h38-settings-runtime-authority]'))return false;
  const script=document.createElement('script');
  script.src=`./settings-runtime-authority.js?build=${SETTINGS_AUTHORITY_BUILD}`;
  script.async=false;
  script.dataset.h38SettingsRuntimeAuthority='true';
  (document.head||document.documentElement).appendChild(script);
  return true;
}

function apply(){wrapSettings();addCard();loadSettingsAuthority();}
function schedule(){
  if(scheduled)return;
  scheduled=true;
  queueMicrotask(()=>{scheduled=false;apply();});
}

window.addEventListener('h38:office-page-rendered',schedule);
window.addEventListener('pageshow',schedule);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});
apply();
setTimeout(apply,400);
setTimeout(apply,1200);
window.H38_PLAY_COMPLIANCE=Object.freeze({enabled:true,build:BUILD,privacyUrl:PRIVACY_URL,accountDeletionUrl:DELETE_URL,eventDriven:true,globalMutationObserver:false,settingsAuthorityBootstrap:true,settingsAuthorityBuild:SETTINGS_AUTHORITY_BUILD});
})();