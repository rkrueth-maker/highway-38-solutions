(function(){
'use strict';
const BUILD='20260923-ai-owner-command-authority-1';
const PREFIX=/^\s*owner\s+command\s*[:\-–—]\s*/i;
const APPROVE=/^(?:approve(?:\s*&?\s*save)?|save it|yes save|do it|execute(?: it)?|go ahead)\b/i;
const CANCEL=/^(?:cancel|never mind|stop|do not|don't)\b/i;
const EXTERNAL=/\b(send|deliver|release|email(?:\s+it)?|text(?:\s+it)?|message\s+the\s+customer|pay|refund|purchase|buy|order|publish|post(?:\s+it)?|delete|invite|change\s+permission|grant\s+access|deploy|file\s+tax|submit\s+tax|export\s+payroll)\b/i;
let installed=false,base=null;
const text=v=>String(v==null?'':v).trim();
const lower=v=>text(v).toLowerCase();
function user(){return window.state?.snapshot?.user||{};}
function role(){const u=user();return lower(u.roleId||u.roleName||u.role);}
function ownerAuthorized(){const u=user(),r=role();return u.owner===true||r==='owner'||r.startsWith('owner ');}
function body(command){const raw=text(command);return PREFIX.test(raw)?raw.replace(PREFIX,'').trim():'';}
function isOwnerCommand(command){return PREFIX.test(text(command));}
function tenantActions(){return window.H38_ASSISTANT_TENANT_ACTIONS;}
function pending(){try{return tenantActions()?.pending?.()||null;}catch(_){return null;}}
function boundaryMessage(response=''){return`Owner command recognized, but this is an external or security-sensitive commitment. I opened/prepared the existing Office control when available, but I did not send, pay, purchase, delete, change permissions, publish, or deploy anything.${response?`\n${response}`:''}`;}
async function executeOwnerCommand(command,options={}){
  const actionText=body(command);
  if(!actionText)return'Use “Owner command: <action>” so the action and approval are explicit.';
  if(!ownerAuthorized())return'Owner command execution is limited to the signed-in owner. I can still prepare a normal preview or request owner review.';
  const actions=tenantActions();
  if(!actions?.enabled||typeof actions.executePending!=='function')return'The tenant-action authority is not ready. No business data was changed.';
  if(CANCEL.test(actionText)&&pending())return actions.cancelPending?.()||'Cancelled. Nothing was written.';
  if(APPROVE.test(actionText)&&pending())return actions.executePending();
  if(EXTERNAL.test(actionText)){
    let response='';try{response=await base?.handle?.(actionText,{...options,ownerCommand:true})||'';}catch(_){}
    return boundaryMessage(response);
  }
  if(pending())return'Another Assistant change is already waiting. Use “Owner command: approve” or “Owner command: cancel” before starting a different owner-commanded write.';
  const response=await base?.handle?.(actionText,{...options,ownerCommand:true,approvalSource:'explicit-owner-command'});
  const proposal=pending();
  if(!proposal)return response||'Owner command received, but this request does not yet have a deterministic Business Office action adapter. No business data was changed.';
  if(proposal.canExecute===false)return`${response||'The action was prepared.'}\nThis owner command cannot execute because the current signed-in role does not have the required Office capability.`;
  try{
    const saved=await actions.executePending();
    return`Owner command executed through the existing Business Office permission, verification, and proof controls.\n${saved}`;
  }catch(error){return`Owner command was resolved but did not complete. No success is claimed. ${error?.message||String(error)}`;}
}
function install(){
  if(installed)return true;
  if(!window.H38_AI_TEAM?.enabled||!window.H38_ASSISTANT_TENANT_ACTIONS?.enabled||!window.H38_ASSISTANT_COMMAND_BUS)return false;
  base=window.H38_ASSISTANT_COMMAND_BUS;
  if(base.aiOwnerCommandAuthority){installed=true;return true;}
  const canHandle=command=>isOwnerCommand(command)||base.canHandle?.(command)===true;
  const handle=async(command,options={})=>isOwnerCommand(command)?executeOwnerCommand(command,options):base.handle?.(command,options);
  window.H38_ASSISTANT_COMMAND_BUS=Object.freeze({...base,canHandle,handle,aiOwnerCommandAuthority:true,aiOwnerCommandBuild:BUILD,ownerCommandActionsEnabled:true,ownerCommandPrefixRequired:true,explicitOwnerCommandApproval:true,tenantDataActionsEnabled:true,externalActionsEnabled:false,automaticApproval:false,automaticCustomerSending:false,automaticPurchasing:false,automaticPayment:false,automaticScheduling:false,automaticDeployment:false});
  window.H38_AI_OWNER_COMMAND_AUTHORITY=Object.freeze({enabled:true,build:BUILD,prefix:'Owner command:',execute:executeOwnerCommand,isOwnerCommand,ownerAuthorized,pending,usesExistingTenantActions:true,usesExistingPermissionChecks:true,usesExistingVerifyProof:true,activeTenantOnly:true,engineChangesAllowed:false,crossTenantSwitching:false,externalCommitmentsAutoExecute:false,automaticApproval:false,automaticCustomerSending:false,automaticPurchasing:false,automaticPayment:false,automaticScheduling:false,automaticDeployment:false});
  installed=true;
  window.dispatchEvent(new CustomEvent('h38:ai-owner-command-ready',{detail:{build:BUILD}}));
  window.dispatchEvent(new CustomEvent('h38:assistant-command-bus-ready',{detail:{build:window.H38_ASSISTANT_COMMAND_BUS.build,aiOwnerCommandAuthority:true}}));
  return true;
}
function retry(){install();}
if(!install()){
  window.addEventListener('h38:ai-team-ready',retry);
  window.addEventListener('h38:assistant-command-bus-ready',retry);
  window.addEventListener('h38:office-page-rendered',retry);
}
})();
