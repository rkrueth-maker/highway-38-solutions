'use strict';
window.H38_SCOUT_V323_NATIVE_AUTH_BRIDGE=true;
(function installNativeOwnerAuthBridge(){
  const clean=v=>String(v??'').trim();
  const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const authState=window.H38NativeOwnerAuthState={ready:false,busy:false,error:'',result:'STARTING'};
  const setLoginMessage=(message,kind='warn')=>{const host=document.getElementById('loginMessage');if(host)host.innerHTML=`<div class="status-line"><span class="dot ${kind==='loading'?'loading':kind==='good'?'live':'warn'}"></span>${escapeHtml(message||'')}</div>`};
  const runtimeReady=()=>typeof h38sb!=='undefined'&&!!h38sb?.auth?.signInWithPassword&&typeof authorize==='function';
  window.H38NativeOwnerSignIn=async function H38NativeOwnerSignIn(email,password){
    const e=clean(email),p=String(password||'');
    if(!e||!p){authState.busy=false;authState.error='Enter your owner email and password.';authState.result='INPUT_REQUIRED';setLoginMessage(authState.error);return false}
    if(!runtimeReady()){
      authState.ready=false;authState.busy=false;authState.error='Secure sign-in runtime did not load. Check the connection and reopen Scout.';authState.result='AUTH_RUNTIME_UNAVAILABLE';setLoginMessage(authState.error);return false;
    }
    authState.ready=true;authState.busy=true;authState.error='';authState.result='SIGNING_IN';setLoginMessage('Signing in…','loading');
    try{
      const {data,error}=await h38sb.auth.signInWithPassword({email:e,password:p});
      if(error)throw error;
      await authorize(data?.session||null);
      if(typeof state!=='undefined'&&state?.user){authState.busy=false;authState.error='';authState.result='PASS';return true}
      const message=clean(document.getElementById('loginMessage')?.textContent)||'This H38 account is not authorized for Scout.';
      authState.busy=false;authState.error=message;authState.result='NOT_AUTHORIZED';return false;
    }catch(err){
      const message=clean(err?.message||err||'Sign-in failed.');
      authState.busy=false;authState.error=message;authState.result='FAIL';
      if(typeof showLogin==='function')showLogin();
      setLoginMessage(message);return false;
    }
  };
  if(runtimeReady()){
    authState.ready=true;authState.result='READY';
  }else{
    authState.ready=false;authState.result='AUTH_RUNTIME_UNAVAILABLE';authState.error='Secure sign-in runtime did not load. Check the connection and reopen Scout.';
  }
})();
