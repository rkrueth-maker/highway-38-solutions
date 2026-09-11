(function(){
'use strict';
const BUILD='20260910-office-account-identity-1';
const STYLE_ID='h38OfficeAccountIdentityStyle';
const WRAP_ID='h38OfficeAccountIdentity';
function officeState(){try{return window.state||(typeof globalThis.state!=='undefined'?globalThis.state:null);}catch(_){return window.state||null;}}
function user(){return officeState()?.snapshot?.user||null;}
function roleName(value){return String(value?.roleName||value?.roleId||value?.role||'').trim();}
function email(value){return String(value?.email||'').trim();}
function removeIdentity(){document.getElementById(WRAP_ID)?.remove();delete document.body?.dataset?.h38OfficeRole;}
function installStyle(){
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');style.id=STYLE_ID;style.textContent=`
#${WRAP_ID}{display:flex;align-items:center;gap:8px;margin-left:auto;min-width:0}.h38-office-account-badge{display:inline-flex;align-items:center;min-width:0;max-width:min(48vw,620px);padding:5px 9px;border:1px solid var(--border,#d6dde3);border-radius:999px;background:var(--card,#fff);font-size:.76rem;line-height:1.2;color:var(--muted,#667085)}.h38-office-account-badge strong{color:var(--text,#10263a);margin-right:4px}.h38-office-account-value{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.h38-office-switch-account{min-height:32px;padding:5px 9px;white-space:nowrap}
@media(max-width:760px){#${WRAP_ID}{width:100%;margin-left:0;justify-content:space-between}.h38-office-account-badge{max-width:calc(100vw - 150px)}.h38-office-switch-account{min-height:40px}}
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
  const value=badge.querySelector('.h38-office-account-value');value.textContent=`${currentEmail} · ${currentRole}`;badge.title=`Signed in as ${currentEmail} · ${currentRole}`;
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
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{observeStatus();schedule();},{once:true});else{observeStatus();schedule();}
window.H38_OFFICE_ACCOUNT_IDENTITY=Object.freeze({build:BUILD,renderIdentity,switchAccount,permissionEscalation:false,automaticApproval:false,automaticSending:false,automaticPurchase:false,automaticPayment:false});
})();
