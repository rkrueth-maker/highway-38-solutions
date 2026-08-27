(function(){
'use strict';
const BUILD='20260827-owner-phone-visual-fix-3-customer-action-delegated';
const style=document.createElement('style');
style.id='h38OwnerPhoneVisualFixStyle';
style.textContent=`
@media(max-width:760px){
  #mainContent .h38-polish-details{grid-column:1/-1!important;width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important}
  #mainContent .h38-polish-details-body{width:100%!important;min-width:0!important;box-sizing:border-box!important}
  #mainContent .h38-polish-details-body>.card,#mainContent .h38-polish-details-body>.field-offline-card{width:100%!important;min-width:0!important;max-width:100%!important;box-sizing:border-box!important}
  #mainContent .h38-life-today .h38-life-columns{grid-template-columns:minmax(0,1fr)!important;width:100%!important;min-width:0!important}
  #mainContent .h38-life-today .h38-life-columns>div{min-width:0!important;width:100%!important}
  #mainContent .card,#mainContent .row,#mainContent details{overflow-wrap:anywhere}
}
`;
document.head.appendChild(style);
window.H38_OWNER_PHONE_VISUAL_FIX=Object.freeze({
  build:BUILD,
  todayCollapsedCardsFullWidth:true,
  lifecycleSingleColumn:true,
  overflowWrapGuard:true,
  customerCreationDelegatedToTopAction:true,
  jobsDomMutation:false,
  automaticApproval:false,
  automaticCustomerSending:false
});
})();
