(function(){
'use strict';
const BUILD='20260911-staff-usage-telemetry-boundary-1';
const Bridge=window.H38Bridge;
if(!Bridge||!Bridge.prototype||typeof Bridge.prototype.request!=='function')return;
const previousRequest=Bridge.prototype.request;
if(previousRequest.__h38StaffUsageTelemetryBoundary)return;
const text=value=>String(value==null?'':value);
function activeRole(){
  const user=window.state?.snapshot?.user||{};
  return text(user.roleName||user.roleId||user.role).trim().toLowerCase();
}
function suppress(operation){
  return activeRole()==='staff'&&text(operation?.action).trim().toUpperCase()==='RECORD_USAGE_EVENT';
}
function synthetic(operation){
  return {
    operationId:operation.operationId||operation.id,
    status:'SYNCED',
    recordType:operation.recordType||'Usage Event',
    recordId:operation.recordId||operation.operationId||operation.id,
    suppressed:true,
    suppressionReason:'STAFF_USAGE_TELEMETRY_RLS_BOUNDARY'
  };
}
const wrapped=async function(action,args,timeout){
  if(action!=='completionSync')return previousRequest.call(this,action,args,timeout);
  const operations=Array.isArray(args?.operations)?args.operations:[];
  const suppressed=operations.filter(suppress);
  if(!suppressed.length)return previousRequest.call(this,action,args,timeout);
  const remaining=operations.filter(operation=>!suppress(operation));
  const suppressedResults=suppressed.map(synthetic);
  if(!remaining.length){
    return {status:'PASS',transport:'staff-usage-telemetry-boundary',results:suppressedResults,externalActionOccurred:false,staffUsageTelemetrySuppressed:true};
  }
  const response=await previousRequest.call(this,action,Object.assign({},args,{operations:remaining}),timeout);
  return Object.assign({},response||{}, {
    status:response?.status||'PASS',
    results:suppressedResults.concat(response?.results||[]),
    externalActionOccurred:response?.externalActionOccurred===true,
    staffUsageTelemetrySuppressed:true
  });
};
wrapped.__h38StaffUsageTelemetryBoundary=true;
wrapped.__h38StaffUsageTelemetryBoundaryBase=previousRequest;
Bridge.prototype.request=wrapped;
window.H38_STAFF_USAGE_TELEMETRY_BOUNDARY=Object.freeze({build:BUILD,staffUsageTelemetrySuppressed:true,ownerTelemetryPreserved:true,externalActions:false});
})();
