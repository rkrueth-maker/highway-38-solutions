'use strict';
window.H38_SCOUT_V323_NATIVE_AUTH_BRIDGE=true;
(function installNativeOwnerAuthBridge(){
  const authState=window.H38NativeOwnerAuthState={ready:false,busy:false,error:'',result:'STARTING'};
  const setLoginMessage=(message,kind='warn')=>{const host=document.getElementById('loginMessage');if(host)host.innerHTML=`<div class="status-line"><span class="dot ${kind==='loading'?'loading':kind==='good'?'live':'warn'}"></span>${esc(message||'')}</div>`};
  window.H38NativeOwnerSignIn=async function H38NativeOwnerSignIn(email,password){
    const e=txt(email),p=String(password||'');
    if(!e||!p){authState.busy=false;authState.error='Enter your owner email and password.';authState.result='INPUT_REQUIRED';setLoginMessage(authState.error);return false}
    if(typeof h38sb==='undefined'||!h38sb?.auth?.signInWithPassword){authState.busy=false;authState.error='Secure sign-in runtime is unavailable. Reopen Scout with an internet connection.';authState.result='AUTH_RUNTIME_UNAVAILABLE';setLoginMessage(authState.error);return false}
    authState.busy=true;authState.error='';authState.result='SIGNING_IN';setLoginMessage('Signing in…','loading');
    try{
      const {data,error}=await h38sb.auth.signInWithPassword({email:e,password:p});
      if(error)throw error;
      await authorize(data?.session||null);
      if(state?.user){authState.busy=false;authState.error='';authState.result='PASS';return true}
      const message=txt(document.getElementById('loginMessage')?.textContent)||'This H38 account is not authorized for Scout.';
      authState.busy=false;authState.error=message;authState.result='NOT_AUTHORIZED';return false;
    }catch(err){
      const message=txt(err?.message||err||'Sign-in failed.');
      authState.busy=false;authState.error=message;authState.result='FAIL';showLogin();setLoginMessage(message);return false;
    }
  };
  authState.ready=true;authState.result='READY';
})();
