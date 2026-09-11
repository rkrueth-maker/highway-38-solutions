(function(){
'use strict';
const BUILD='20260911-live-customer-navigation-guard-retired-5-launch-loader';
window.H38_LIVE_CUSTOMER_NAVIGATION_GUARD=Object.freeze({
  build:BUILD,enabled:false,retired:true,
  replacement:'app-01.js canonical renderNav + app-02.js canonical openPage',
  windowCapture:false,customerPhysicalIntentPinned:false,customerSearchSelectionPinned:false,
  lateMeetingBounceBlocked:false,explicitMeetingPreserved:true,mutatesNavigation:false,capturesClicks:false,
  automaticApproval:false,automaticCustomerSending:false,automaticPurchase:false,automaticPayment:false,automaticScheduling:false
});
function loadRuntime(src,datasetKey,ready){
  if(ready?.()||document.querySelector(`script[data-${datasetKey}]`))return;
  const script=document.createElement('script');script.src=src;script.async=false;script.setAttribute(`data-${datasetKey}`,'runtime');document.head.appendChild(script);
}
function loadOfficeLaunchPolish(){
  if(!document.querySelector('link[data-h38-office-document-export]')){
    const css=document.createElement('link');css.rel='stylesheet';css.href='./office-document-export.css?build=20260911-office-document-export-1';css.dataset.h38OfficeDocumentExport='style';document.head.appendChild(css);
  }
  loadRuntime('./office-document-export.js?build=20260911-office-document-export-1','h38-office-document-export',()=>window.H38_OFFICE_DOCUMENT_EXPORT);
  loadRuntime('./office-scale-workflow.js?build=20260911-office-scale-workflow-1','h38-office-scale-workflow',()=>window.H38_OFFICE_SCALE_WORKFLOW);
  loadRuntime('./office-document-packet.js?build=20260911-office-document-packet-1','h38-office-document-packet',()=>window.H38_OFFICE_DOCUMENT_PACKET);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadOfficeLaunchPolish,{once:true});else loadOfficeLaunchPolish();
})();