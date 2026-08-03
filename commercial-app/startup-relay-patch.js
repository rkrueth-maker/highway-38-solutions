'use strict';
(function(){
  const relayBuild='20260803-1220';
  const priorSecureAuthUrl=typeof secureAuthUrl==='function'?secureAuthUrl:null;
  if(priorSecureAuthUrl){
    secureAuthUrl=function(){
      const url=priorSecureAuthUrl();
      return window.h38WithBridgeChannel?window.h38WithBridgeChannel(url):url;
    };
  }
  const priorBridgeStatus=typeof handleBridgeStatus==='function'?handleBridgeStatus:null;
  if(priorBridgeStatus){
    handleBridgeStatus=function(status){
      if(status==='relay-connected'){
        state.bridgeReady=!!state.bridge?.ready;
        const statusNode=document.getElementById('businessStatus');
        if(statusNode&&!state.snapshot)statusNode.textContent='Secure return connection ready · waiting for authorized business.';
        return;
      }
      return priorBridgeStatus(status);
    };
  }
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register(`./service-worker.js?build=${relayBuild}`,{updateViaCache:'none'}).then(registration=>registration.update().catch(()=>{})).catch(()=>{});
  }
})();
