(function(){
'use strict';
const BUILD='20260811-cad-save-guard-1156';
const COOLDOWN_MS=15000;
let lastKey='',lastAt=0,inFlight=false;
const text=v=>String(v==null?'':v);
function visit(){return window.H38_FIELD_VISIT_CORE?.state?.visit||null}
function signature(button){
  const v=visit(),session=text(v?.sessionId),measurements=Array.isArray(window.state?.snapshot?.siteMeasurements)?window.state.snapshot.siteMeasurements:[];
  const stable=measurements.filter(row=>text(row?.['Capture Session ID']||row?.captureSessionId)===session).map(row=>[
    text(row?.['Site Measurement ID']||row?.measurementId),
    text(row?.['Value']||row?.value),
    text(row?.['Unit']||row?.unit),
    text(row?.['Verification Status']||row?.verificationStatus)
  ].join(':')).sort().join('|');
  return [button?.id,session,text(v?.quoteId),stable].join('::');
}
function intercept(event){
  const button=event.target instanceof Element?event.target.closest('#h38CadSave,#h38CadAttachInternal,#h38CadQuote'):null;
  if(!button)return;
  const key=signature(button),age=Date.now()-lastAt;
  if(inFlight||(key===lastKey&&age<COOLDOWN_MS)){
    event.preventDefault();
    event.stopImmediatePropagation();
    window.toast?.(inFlight?'2D review is already saving.':'This exact 2D review was just saved.');
    return;
  }
  inFlight=true;
  lastKey=key;
  lastAt=Date.now();
  setTimeout(()=>{inFlight=false},2500);
}
document.addEventListener('click',intercept,true);
window.H38_SITE_SCANNER_CAD_SAVE_GUARD=Object.freeze({build:BUILD,cooldownMs:COOLDOWN_MS,duplicateUiSaveBlocked:true,inFlightSaveBlocked:true,automaticAttachment:false,automaticApproval:false,automaticCustomerSending:false});
})();
