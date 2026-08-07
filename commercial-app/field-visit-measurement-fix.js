(function(){
'use strict';
const BUILD='20260806-2100';
const C=window.H38_FIELD_VISIT_CORE;
const DB=window.H38DB;
if(!C||!DB)return;
const S=C.state;
let saving=false;

function text(value){return String(value==null?'':value);}

async function persistGuide(){
  const visit=S.visit;
  if(!visit)return;
  visit.updatedAt=new Date().toISOString();
  if(visit.guidedCapture)visit.guidedCapture.updatedAt=visit.updatedAt;
  const id=`FIELD-VISIT:${visit.businessId}:${visit.quoteId||'UNASSIGNED'}`;
  await DB.put('drafts',Object.assign({id},visit));
}

function announceNext(){
  window.H38_FIELD_VISIT_GUIDANCE?.render?.();
  const next=document.getElementById('fieldGuideEnterMeasure');
  if(next){
    next.click();
    const label=document.querySelector('#fieldGuideCard h2')?.textContent?.trim();
    C.toast(label?`Saved. Next measurement: ${label}.`:'Measurement saved. Enter the next required measurement.');
  }else{
    C.toast('All guided measurements are complete. Continue to Review.');
  }
}

async function saveAndAdvance(event){
  const form=event.target instanceof HTMLFormElement&&event.target.id==='fieldManual'?event.target:null;
  const guide=S.visit?.guidedCapture;
  if(!form||!guide?.pendingMeasurementId)return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  if(saving)return;

  saving=true;
  const before=S.measurements.length;
  const promptId=text(guide.pendingMeasurementId);
  try{
    await C.manual({preventDefault(){},currentTarget:form});
    if(S.measurements.length<=before)return;

    if(!Array.isArray(guide.completedMeasurements))guide.completedMeasurements=[];
    if(!guide.completedMeasurements.includes(promptId))guide.completedMeasurements.push(promptId);
    guide.pendingMeasurementId='';
    guide.measurementIndex=Math.max(0,Number(guide.measurementIndex)||0)+1;
    await persistGuide();

    window.H38_FIELD_VISIT_UI?.render?.();
    setTimeout(announceNext,80);
  }catch(error){
    C.toast(error?.message||String(error),true);
  }finally{
    saving=false;
  }
}

document.addEventListener('submit',event=>{
  saveAndAdvance(event).catch(error=>{
    saving=false;
    C.toast(error?.message||String(error),true);
  });
},true);

window.H38_FIELD_VISIT_MEASUREMENT_FIX={build:BUILD,saveAndAdvance,automaticApproval:false,automaticCustomerSending:false};
})();
