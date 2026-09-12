(function(){
'use strict';
const BUILD='20260912-live-customer-navigation-guard-invoice-print-delete-1';
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
function loadStyle(href,key){
  if(document.querySelector(`link[data-${key}]`))return;
  const css=document.createElement('link');css.rel='stylesheet';css.href=href;css.setAttribute(`data-${key}`,'style');document.head.appendChild(css);
}
function loadOfficeLaunchPolish(){
  loadStyle('./office-document-export.css?build=20260911-office-document-export-1','h38-office-document-export');
  loadStyle('./office-reference-samples.css?build=20260911-office-reference-samples-1','h38-office-reference-samples');
  loadStyle('./service-operations-final.css?build=20260912-service-ops-final-1','h38-service-operations-final');
  loadRuntime('./office-document-export.js?build=20260911-office-document-export-1','h38-office-document-export',()=>window.H38_OFFICE_DOCUMENT_EXPORT);
  loadRuntime('./office-scale-workflow.js?build=20260911-office-scale-workflow-1','h38-office-scale-workflow',()=>window.H38_OFFICE_SCALE_WORKFLOW);
  loadRuntime('./office-scale-task-guard.js?build=20260911-office-scale-task-guard-1','h38-office-scale-task-guard',()=>window.H38_OFFICE_SCALE_TASK_GUARD);
  loadRuntime('./office-document-packet.js?build=20260911-office-document-packet-1','h38-office-document-packet',()=>window.H38_OFFICE_DOCUMENT_PACKET);
  loadRuntime('./office-reference-samples.js?build=20260911-office-reference-samples-1','h38-office-reference-samples',()=>window.H38_OFFICE_REFERENCE_SAMPLES);
  loadRuntime('./customer-import-intelligence.js?build=20260912-customer-service-operations-1','h38-customer-import-intelligence',()=>window.H38_CUSTOMER_IMPORT_INTELLIGENCE);
  loadRuntime('./recurring-service-runtime.js?build=20260912-recurring-service-runtime-1','h38-recurring-service-runtime',()=>window.H38_RECURRING_SERVICE_RUNTIME);
  loadRuntime('./multi-rate-labor-runtime.js?build=20260912-multi-rate-labor-runtime-1','h38-multi-rate-labor-runtime',()=>window.H38_MULTI_RATE_LABOR_RUNTIME);
  loadRuntime('./plow-trigger-runtime.js?build=20260912-plow-trigger-runtime-1','h38-plow-trigger-runtime',()=>window.H38_PLOW_TRIGGER_RUNTIME);
  loadRuntime('./invoice-delete-lifecycle-runtime.js?build=20260912-invoice-delete-lifecycle-1','h38-invoice-delete-lifecycle',()=>window.H38_INVOICE_DELETE_LIFECYCLE);
  loadRuntime('./invoice-print-delete-runtime.js?build=20260912-invoice-print-delete-1','h38-invoice-print-delete',()=>window.H38_INVOICE_PRINT_DELETE);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadOfficeLaunchPolish,{once:true});else loadOfficeLaunchPolish();
})();
