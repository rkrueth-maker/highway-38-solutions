(function(){
'use strict';
const BUILD='20260922-office-account-identity-mobile-clean-2';
const STYLE_ID='h38OfficeAccountIdentityStyle';
const WRAP_ID='h38OfficeAccountIdentity';
function officeState(){try{return window.state||(typeof globalThis.state!=='undefined'?globalThis.state:null);}catch(_){return window.state||null;}}
function user(){return officeState()?.snapshot?.user||null;}
function roleName(value){return String(value?.roleName||value?.roleId||value?.role||'').trim();}
function email(value){return String(value?.email||'').trim();}
function mobile(){return !!window.matchMedia?.('(max-width:760px)').matches;}
function removeIdentity(){document.getElementById(WRAP_ID)?.remove();delete document.body?.dataset?.h38OfficeRole;}
function installStyle(){
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');style.id=STYLE_ID;style.textContent=`
#${WRAP_ID}{display:flex;align-items:center;gap:8px;margin-left:auto;min-width:0}.h38-office-account-badge{display:inline-flex;align-items:center;min-width:0;max-width:min(48vw,620px);padding:5px 9px;border:1px solid var(--border,#d6dde3);border-radius:999px;background:var(--card,#fff);font-size:.76rem;line-height:1.2;color:var(--muted,#667085)}.h38-office-account-badge strong{color:var(--text,#10263a);margin-right:4px}.h38-office-account-value{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.h38-office-switch-account{min-height:32px;padding:5px 9px;white-space:nowrap}
@media(max-width:760px){.business-bar{min-height:32px!important;max-height:32px!important;height:32px!important;display:flex!important;align-items:center!important;gap:6px!important;padding:3px 8px!important;overflow:hidden!important;flex-wrap:nowrap!important}.business-bar>span#businessStatus{display:none!important}.business-bar>#businessSelect{flex:1 1 auto!important;min-width:0!important;max-width:none!important;height:26px!important;font-size:.72rem!important}.business-bar>#loadBusinessButton{flex:0 0 auto!important;min-height:26px!important;height:26px!important;padding:2px 8px!important;font-size:.72rem!important}#${WRAP_ID}{width:auto;max-width:26%;margin-left:0;flex:0 1 26%;overflow:hidden;flex-wrap:nowrap}.h38-office-account-badge{max-width:100%;padding:2px 4px;border:0;background:transparent;font-size:.65rem;white-space:nowrap;overflow:hidden}.h38-office-account-badge strong{display:none}.h38-office-account-value{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right}.h38-office-switch-account{display:none!important}#mainNav.h38-five-primary-nav button span:last-child{font-size:.62rem!important;letter-spacing:-.015em!important;white-space:nowrap!important;overflow:visible!important}}
`;
  document.head.appendChild(style);
}
function switchAccount(){
  const signOut=document.getElementById('authSignOutButton');
  if(signOut){signOut.click();return true;}
  try{const action=window.H38_SUPABASE_AUTH?.signOut;if(typeof action==='function'){action();return true;}}catch(_){}
  return false;
}
function renderIdentity(){
  installStyle();
  const current=user(),bar=document.querySelector('.business-bar');
  if(!bar||!current){removeIdentity();return false;}
  const currentRole=roleName(current)||'member',currentEmail=email(current)||String(current.displayName||'Signed-in account').trim();
  document.body.dataset.h38OfficeRole=currentRole.toLowerCase();
  let wrap=document.getElementById(WRAP_ID);if(!wrap){wrap=document.createElement('div');wrap.id=WRAP_ID;bar.appendChild(wrap);}
  let badge=wrap.querySelector('.h38-office-account-badge');if(!badge){badge=document.createElement('span');badge.className='h38-office-account-badge';wrap.appendChild(badge);}
  badge.innerHTML='<strong>Signed in</strong><span class="h38-office-account-value"></span>';
  const value=badge.querySelector('.h38-office-account-value');value.textContent=mobile()?currentRole:`${currentEmail} · ${currentRole}`;badge.title=`Signed in as ${currentEmail} · ${currentRole}`;
  let button=wrap.querySelector('.h38-office-switch-account');if(!button){button=document.createElement('button');button.type='button';button.className='secondary h38-office-switch-account';button.textContent='Switch account';button.onclick=switchAccount;wrap.appendChild(button);}
  button.setAttribute('aria-label',`Switch from ${currentEmail}`);
  return true;
}
function schedule(){queueMicrotask(renderIdentity);}
function observeStatus(){const node=document.getElementById('businessStatus');if(!node)return;new MutationObserver(schedule).observe(node,{childList:true,subtree:true,characterData:true});}
window.addEventListener('h38:office-navigation-access-updated',schedule);
window.addEventListener('h38:business-snapshot-updated',schedule);
window.addEventListener('pageshow',schedule);
window.addEventListener('h38:auth-cleared',()=>queueMicrotask(removeIdentity));
window.matchMedia?.('(max-width:760px)')?.addEventListener?.('change',schedule);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{observeStatus();schedule();},{once:true});else{observeStatus();schedule();}
window.H38_OFFICE_ACCOUNT_IDENTITY=Object.freeze({build:BUILD,renderIdentity,switchAccount,mobileSingleLineIdentity:true,mobileStableBusinessBarHeight:true,mobileStatusNoiseHidden:true,mobilePrimaryLabelsFit:true,permissionEscalation:false,automaticApproval:false,automaticSending:false,automaticPurchase:false,automaticPayment:false});
})();
