(function(){
'use strict';
const BUILD='20260821-field-quote-preflight-retired-1';
async function run(){return{status:'SKIP',reason:'AUTOMATIC_PREFLIGHT_RETIRED',message:'Quote analysis now runs only from an explicit owner Build / Refresh action.',automaticQuoteChanges:false,externalActionOccurred:false};}
window.H38_FIELD_VISIT_QUOTE_PREFLIGHT=Object.freeze({enabled:false,build:BUILD,retired:true,onlineAutomatic:false,automatic:false,backgroundInterval:false,ownerInitiatedQuoteBuildRequired:true,automaticQuoteChanges:false,automaticApproval:false,automaticSending:false,run});
})();