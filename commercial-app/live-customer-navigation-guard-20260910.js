(function(){
'use strict';
const BUILD='20260911-live-customer-navigation-guard-retired-3-document-export-loader';
window.H38_LIVE_CUSTOMER_NAVIGATION_GUARD=Object.freeze({
  build:BUILD,
  enabled:false,
  retired:true,
  replacement:'app-01.js canonical renderNav + app-02.js canonical openPage',
  windowCapture:false,
  customerPhysicalIntentPinned:false,
  customerSearchSelectionPinned:false,
  lateMeetingBounceBlocked:false,
  explicitMeetingPreserved:true,
  mutatesNavigation:false,
  capturesClicks:false,
  automaticApproval:false,
  automaticCustomerSending:false,
  automaticPurchase:false,
  automaticPayment:false,
  automaticScheduling:false
});

function loadOfficeDocumentExport(){
  if(!document.querySelector('link[data-h38-office-document-export]')){
    const css=document.createElement('link');
    css.rel='stylesheet';
    css.href='./office-document-export.css?build=20260911-office-document-export-1';
    css.dataset.h38OfficeDocumentExport='style';
    document.head.appendChild(css);
  }
  if(window.H38_OFFICE_DOCUMENT_EXPORT||document.querySelector('script[data-h38-office-document-export]'))return;
  const script=document.createElement('script');
  script.src='./office-document-export.js?build=20260911-office-document-export-1';
  script.async=true;
  script.dataset.h38OfficeDocumentExport='runtime';
  document.head.appendChild(script);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadOfficeDocumentExport,{once:true});else loadOfficeDocumentExport();
})();
