(function(){
'use strict';
const BUILD='20260807-1315';
const supabase=window.supabase;
if(!supabase||typeof supabase.createClient!=='function'||supabase.__h38PortalStableClient)return;
const create=supabase.createClient.bind(supabase);
supabase.createClient=function(){
  const client=create.apply(null,arguments);
  const auth=client&&client.auth;
  if(!auth||auth.__h38PortalStableAuth)return client;
  let lastGetSessionUser='';
  let lastGetSessionAt=0;
  const getSession=auth.getSession.bind(auth);
  const onAuthStateChange=auth.onAuthStateChange.bind(auth);
  auth.getSession=async function(){
    const result=await getSession.apply(null,arguments);
    lastGetSessionUser=String(result?.data?.session?.user?.id||'');
    lastGetSessionAt=Date.now();
    return result;
  };
  auth.onAuthStateChange=function(callback){
    return onAuthStateChange(function(event,session){
      const userId=String(session?.user?.id||'');
      if(event==='TOKEN_REFRESHED')return;
      if((event==='INITIAL_SESSION'||event==='SIGNED_IN')&&userId&&userId===lastGetSessionUser&&Date.now()-lastGetSessionAt<10000)return;
      setTimeout(function(){callback(event,session);},0);
    });
  };
  Object.defineProperty(auth,'__h38PortalStableAuth',{value:true});
  return client;
};
Object.defineProperty(supabase,'__h38PortalStableClient',{value:true});
window.H38_CUSTOMER_PORTAL_AUTH_STABILITY=Object.freeze({enabled:true,build:BUILD,deferredAuthCallbacks:true,suppressesDuplicateStartupSession:true,suppressesTokenRefreshReload:true});
})();
