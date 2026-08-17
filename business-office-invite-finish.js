(function(){
'use strict';
const BUILD='20260817-1055';
const OFFICE_URL='https://highway38solutions.com/commercial-app/?invitation=complete';
const PORTAL_SCRIPT='customer-portal-supabase.js?v=20260807-1720';
const config=window.H38_CUSTOMER_PORTAL_SUPABASE||{};
let routed=false;

function text(value){return String(value==null?'':value);}
function hasAuthCallback(){
  const hash=text(location.hash).toLowerCase();
  const query=new URLSearchParams(location.search);
  return hash.includes('access_token=')||hash.includes('refresh_token=')||hash.includes('type=invite')||hash.includes('type=recovery')||query.has('code')||query.has('token_hash')||query.has('error_description');
}
function loadCustomerPortal(){
  if(routed)return;
  routed=true;
  const script=document.createElement('script');
  script.src=PORTAL_SCRIPT;
  script.defer=true;
  document.head.appendChild(script);
}
function configured(){
  return config.enabled===true&&/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(text(config.url))&&text(config.publishableKey).length>=20;
}
function invitationMetadata(user){
  const metadata=user&&user.user_metadata&&typeof user.user_metadata==='object'?user.user_metadata:{};
  return {
    type:text(metadata.invitation_type).trim(),
    businessId:text(metadata.business_id).trim(),
    businessKey:text(metadata.business_key).trim().toLowerCase(),
    businessName:text(metadata.business_name).trim(),
    requestedRole:text(metadata.requested_role).trim().toLowerCase()
  };
}
function showFinish(client,session,meta){
  routed=true;
  const hold=document.getElementById('portal-hold');
  const app=document.getElementById('portal-app');
  const login=document.getElementById('portal-login');
  const notice=document.getElementById('portalNotice');
  if(hold)hold.hidden=true;
  if(app)app.hidden=true;
  if(login){
    login.hidden=false;
    login.innerHTML='<h2>Finish Business Office access</h2><p>This secure email link is for an invited Highway 38 Business Office user. Set the password that will be used for normal Business Office sign-in.</p><form id="h38BusinessInviteFinishForm"><label><span>Email address</span><input type="email" value="'+text(session.user.email).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];})+'" readonly></label><label><span>New password</span><input id="h38BusinessInvitePassword" type="password" autocomplete="new-password" minlength="10" required></label><div class="portal-actions"><button class="btn btn-primary" type="submit">Set password and open Business Office</button></div><p class="portal-help">The password goes directly to Supabase Auth. Membership access is granted only by the existing authenticated Business Office membership claim.</p></form>';
  }
  if(notice){notice.className='portal-notice ok';notice.textContent='Authenticated invitation found for '+(meta.businessName||'Highway 38 Solutions')+'.';}
  const form=document.getElementById('h38BusinessInviteFinishForm');
  if(!form)return;
  form.addEventListener('submit',async function(event){
    event.preventDefault();
    const password=text(document.getElementById('h38BusinessInvitePassword')&&document.getElementById('h38BusinessInvitePassword').value);
    const button=form.querySelector('button[type="submit"]');
    try{
      if(password.length<10)throw new Error('Use at least 10 characters.');
      if(button)button.disabled=true;
      if(notice){notice.className='portal-notice';notice.textContent='Securing the account and activating the invited Business Office membership…';}
      const updated=await client.auth.updateUser({password:password});
      if(updated.error)throw updated.error;
      const state=await client.rpc('business_office_auth_state');
      if(state.error)throw state.error;
      const payload=state.data||{};
      const memberships=Array.isArray(payload.memberships)?payload.memberships:[];
      const membership=memberships.find(function(row){return text(row.businessKey).toLowerCase()===(meta.businessKey||'highway38')&&row.membershipStatus==='active'&&row.businessStatus==='active';});
      if(!membership)throw new Error('The authenticated invitation did not resolve to an active Highway 38 Business Office membership.');
      await client.auth.signOut();
      if(notice){notice.className='portal-notice ok';notice.textContent='Business Office access activated. Opening the sign-in page…';}
      location.replace(OFFICE_URL);
    }catch(error){
      if(button)button.disabled=false;
      if(notice){notice.className='portal-notice bad';notice.textContent='Business Office activation failed: '+text(error&&error.message||error).slice(0,500);}
    }
  });
}
async function route(){
  if(!hasAuthCallback()){loadCustomerPortal();return;}
  if(!configured()||!window.supabase||typeof window.supabase.createClient!=='function'){loadCustomerPortal();return;}
  try{
    const client=window.supabase.createClient(config.url,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true},global:{headers:{'x-client-info':'h38-business-office-invite-finish-'+BUILD}}});
    const result=await client.auth.getSession();
    if(result.error)throw result.error;
    const session=result.data&&result.data.session;
    const meta=invitationMetadata(session&&session.user);
    if(session&&session.user&&meta.type==='business_office_membership'&&meta.businessId&&meta.businessKey){
      showFinish(client,session,meta);
      return;
    }
  }catch(error){
    console.warn('H38 Business Office invite routing did not claim this callback.',error);
  }
  loadCustomerPortal();
}

window.H38_BUSINESS_OFFICE_INVITE_FINISH=Object.freeze({build:BUILD,officeUrl:OFFICE_URL,usesAuthenticatedMembershipClaim:true,automaticExternalAction:false});
route();
})();
