(function(){
'use strict';
const BUILD='20260807-0615';
function restore(){
  const active=window.H38_ACTIVE_BRIDGE;
  if(!active||!window.state)return false;
  if(window.state.bridge!==active)window.state.bridge=active;
  window.state.bridgeReady=!!active.ready;
  window.H38_STARTUP_BRIDGE_REPAIR={enabled:true,build:BUILD,preservedActiveBridge:true,directQuoteAiSeparate:true};
  return true;
}
if(!restore()){
  let tries=0;
  const timer=setInterval(()=>{tries+=1;if(restore()||tries>=40)clearInterval(timer);},250);
}
addEventListener('h38:auth-cleared',()=>{if(window.state)window.state.bridgeReady=false;});
})();
