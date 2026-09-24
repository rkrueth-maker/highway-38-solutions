(function () {
  'use strict';

  const auth=window.H38_SUPABASE_AUTH;
  if(!auth || auth.enabled!==true)return;

  const BUILD='20260907-staff-canonical-office-1';
  const WORK_DRAFT_REFRESH_BUILD='20260924-work-draft-refresh-preservation-2';
  const WORK_DRAFT_MEMORY_BUILD='20260924-work-draft-input-memory-1';
  const PLATFORM_EXTENSION_BUILD='20260924-platform-extension-loader-2-tax-center';
  const priorHandleStartupBootstrap=handleStartupBootstrap;
  const priorHandleFullSnapshot=handleFullSnapshot;

  function text(value){return String(value==null?'':value).trim();}

  const WORK_DRAFT_SPECS=Object.freeze([
    Object.freeze({id:'requestForm',meaningful:['subject','details']}),
    Object.freeze({id:'jobForm',meaningful:['projectTitle']}),
    Object.freeze({id:'taskForm',meaningful:['taskTitle']})
  ]);
  const workDraftMemory=new Map();

  function workDraftSpec(formOrId){
    const id=typeof formOrId==='string'?formOrId:text(formOrId?.id);
    return WORK_DRAFT_SPECS.find(spec=>spec.id===id)||null;
  }

  function visibleWorkForm(formId){
    const forms=Array.from(document.querySelectorAll(`[id="${formId}"]`)).filter(node=>node?.tagName==='FORM');
    for(let index=forms.length-1;index>=0;index--){
      const form=forms[index];
      if(form.getClientRects?.().length)return form;
    }
    return forms[0]||null;
  }

  function readWorkDraft(form,spec,businessId=text(window.state?.businessId)){
    if(!form||!spec)return null;
    const values={};
    Array.from(form.elements||[]).forEach(control=>{
      const name=text(control?.name);
      if(!name||control.disabled||['button','submit','reset','file'].includes(text(control.type).toLowerCase()))return;
      if((control.type==='checkbox'||control.type==='radio')&&!control.checked)return;
      values[name]=String(control.value==null?'':control.value);
    });
    if(!spec.meaningful.some(name=>text(values[name])))return null;
    const active=document.activeElement;
    return{businessId,id:spec.id,values,activeName:active&&active.form===form?text(active.name):''};
  }

  function rememberWorkDraft(form){
    if(window.state?.page!=='work')return false;
    const spec=workDraftSpec(form);
    if(!spec)return false;
    const draft=readWorkDraft(form,spec);
    if(!draft){workDraftMemory.delete(spec.id);return false;}
    workDraftMemory.set(spec.id,draft);
    return true;
  }

  function installWorkDraftMemory(){
    if(document.documentElement?.dataset.h38WorkDraftMemory==='1')return;
    if(document.documentElement)document.documentElement.dataset.h38WorkDraftMemory='1';
    const remember=event=>{const form=event.target?.form;if(form)rememberWorkDraft(form);};
    const clear=event=>{const spec=workDraftSpec(event.target);if(spec)workDraftMemory.delete(spec.id);};
    document.addEventListener('input',remember,true);
    document.addEventListener('change',remember,true);
    document.addEventListener('submit',clear,true);
    document.addEventListener('reset',clear,true);
    window.addEventListener('h38:office-page-rendered',()=>{
      if(window.state?.page!=='work')workDraftMemory.clear();
    });
  }

  function captureWorkDrafts(){
    if(window.state?.page!=='work')return null;
    const businessId=text(window.state?.businessId);
    const drafts=[];
    for(const spec of WORK_DRAFT_SPECS){
      const form=visibleWorkForm(spec.id);
      const current=form&&form.getClientRects?.().length?readWorkDraft(form,spec,businessId):null;
      if(current){
        workDraftMemory.set(spec.id,current);
        drafts.push({id:current.id,values:current.values,activeName:current.activeName});
        continue;
      }
      const remembered=workDraftMemory.get(spec.id);
      if(remembered&&remembered.businessId===businessId){
        drafts.push({id:remembered.id,values:{...remembered.values},activeName:remembered.activeName||''});
      }
    }
    return drafts.length?{businessId,drafts}:null;
  }

  function reopenWorkDraftForm(formId){
    let form=visibleWorkForm(formId);
    if(form?.getClientRects?.().length)return form;
    const chooser=document.querySelector(`[data-h38-create="${formId}"]`);
    if(!chooser)return form;
    chooser.click();
    form=visibleWorkForm(formId);
    return form?.getClientRects?.().length?form:null;
  }

  function restoreWorkDrafts(bundle){
    if(!bundle || window.state?.page!=='work' || text(window.state?.businessId)!==bundle.businessId)return false;
    let restored=false;
    for(const draft of bundle.drafts||[]){
      const form=reopenWorkDraftForm(draft.id);
      if(!form)continue;
      for(const [name,value] of Object.entries(draft.values||{})){
        const control=form.elements?.namedItem?.(name);
        if(!control || typeof control.value==='undefined')continue;
        if(control.tagName==='SELECT' && value && !Array.from(control.options||[]).some(option=>String(option.value)===String(value)))continue;
        control.value=value;
        restored=true;
      }
      const spec=workDraftSpec(draft.id);
      const remembered=readWorkDraft(form,spec,bundle.businessId);
      if(remembered)workDraftMemory.set(draft.id,remembered);
      if(draft.activeName){
        const active=form.elements?.namedItem?.(draft.activeName);
        try{active?.focus?.({preventScroll:true});}catch(_){try{active?.focus?.();}catch(__){}}
      }
    }
    if(restored)window.dispatchEvent(new CustomEvent('h38:work-draft-restored',{detail:{source:'authoritative-refresh',build:WORK_DRAFT_REFRESH_BUILD,memoryBuild:WORK_DRAFT_MEMORY_BUILD,reopened:true}}));
    return restored;
  }

  function loadPlatformExtensions(){
    const scripts=[
      ['H38_PLATFORM_DEEPEN','h38-platform-deepen','./platform-deepen.js?build=20260924-platform-deepen-1'],
      ['H38_QUICKBOOKS_SERVER_BRIDGE','h38-quickbooks-server-bridge','./quickbooks-server-bridge.js?build=20260924-qbo-server-bridge-1'],
      ['H38_TAX_CENTER','h38-tax-center','./tax-center.js?build=20260924-tax-center-1']
    ];
    scripts.forEach(([globalName,datasetKey,src])=>{
      if(window[globalName]||document.querySelector(`script[data-${datasetKey}]`))return;
      const script=document.createElement('script');
      script.src=src;
      script.async=false;
      script.setAttribute(`data-${datasetKey}`,'1');
      document.body.appendChild(script);
    });
  }

  function suppressStaffUsageTelemetryAtRlsBoundary(){
    const Bridge=window.H38Bridge;
    if(!Bridge||!Bridge.prototype||typeof Bridge.prototype.request!=='function')return;
    const priorRequest=Bridge.prototype.request;
    if(priorRequest.__h38StaffUsageTelemetryBoundary)return;

    function activeRole(){
      const user=window.state?.snapshot?.user||{};
      return text(user.roleName||user.roleId||user.role).toLowerCase();
    }
    function shouldSuppress(operation){
      return activeRole()==='staff'&&text(operation?.action).toUpperCase()==='RECORD_USAGE_EVENT';
    }
    function suppressedResult(operation){
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
      if(action!=='completionSync')return priorRequest.call(this,action,args,timeout);
      const operations=Array.isArray(args?.operations)?args.operations:[];
      const suppressed=operations.filter(shouldSuppress);
      if(!suppressed.length)return priorRequest.call(this,action,args,timeout);
      const remaining=operations.filter(operation=>!shouldSuppress(operation));
      const suppressedResults=suppressed.map(suppressedResult);
      if(!remaining.length){
        return {status:'PASS',transport:'staff-usage-telemetry-boundary',results:suppressedResults,externalActionOccurred:false,staffUsageTelemetrySuppressed:true};
      }
      const response=await priorRequest.call(this,action,Object.assign({},args,{operations:remaining}),timeout);
      return Object.assign({},response||{}, {
        status:response?.status||'PASS',
        results:suppressedResults.concat(response?.results||[]),
        externalActionOccurred:response?.externalActionOccurred===true,
        staffUsageTelemetrySuppressed:true
      });
    };
    wrapped.__h38StaffUsageTelemetryBoundary=true;
    wrapped.__h38StaffUsageTelemetryBoundaryBase=priorRequest;
    Bridge.prototype.request=wrapped;
  }

  function chooseAuthorizedBusiness(startup){
    const businesses=Array.isArray(startup?.businesses)?startup.businesses:[];
    if(!businesses.length)return null;
    const ids=new Set(businesses.map(b=>text(b.businessId)));
    const candidates=[
      startup?.selectedBusinessId,
      window.state?.requestedBusinessId,
      auth.getState?.().selectedBusinessId,
      window.state?.businessId
    ].map(text).filter(Boolean);
    for(const id of candidates){
      if(ids.has(id))return businesses.find(b=>text(b.businessId)===id)||null;
    }
    return businesses.find(b=>/highway\s*38/i.test(text(b.businessName))&&/owner/i.test(text(b.role||b.roleName||'')))
      || businesses.find(b=>/highway\s*38/i.test(text(b.businessName)))
      || businesses[0];
  }

  handleStartupBootstrap=async function(startup){
    const businesses=Array.isArray(startup?.businesses)?startup.businesses:[];
    if(startup?.snapshot){
      return priorHandleStartupBootstrap(startup);
    }
    if(businesses.length===0)return priorHandleStartupBootstrap(startup);

    const userId=window.H38DB?.getUserScope?.()||'';
    if(!userId || startup?.user?.id!==userId){
      return priorHandleStartupBootstrap(startup);
    }

    const chosen=chooseAuthorizedBusiness(startup);
    if(!chosen?.businessId){
      return priorHandleStartupBootstrap(startup);
    }

    state.authUserId=userId;
    state.canSwitchBusinesses=businesses.length>1 || startup?.canSwitchBusinesses===true;
    setBusinessSwitcherVisible(state.canSwitchBusinesses);
    populateBusinessSelector(businesses);
    setFastBusinessId(text(chosen.businessId));
    const select=document.getElementById('businessSelect');
    if(select)select.value=text(chosen.businessId);
    const status=document.getElementById('businessStatus');
    if(status)status.textContent=`Opening ${text(chosen.businessName)||'authorized business'}…`;
    renderWelcome('connecting');

    const opened=await loadBusiness(text(chosen.businessId),true);
    if(!opened){
      throw new Error(`Could not open ${text(chosen.businessName)||'the authorized business'} after Supabase membership verification.`);
    }
  };

  handleFullSnapshot=async function(snapshot,businessId){
    const workDrafts=captureWorkDrafts();
    const result=await priorHandleFullSnapshot(snapshot,businessId);
    restoreWorkDrafts(workDrafts);
    return result;
  };

  installWorkDraftMemory();
  suppressStaffUsageTelemetryAtRlsBoundary();
  loadPlatformExtensions();

  window.H38_AUTHORIZED_BUSINESS_AUTO_OPEN={
    enabled:true,
    build:BUILD,
    platformExtensionBuild:PLATFORM_EXTENSION_BUILD,
    source:'handleStartupBootstrap',
    preferredBusiness:'Highway 38 Solutions',
    security:'authenticated startup businesses only',
    staffUsesCanonicalOffice:true,
    staffUsesPermissionFilteredNavigation:true,
    employeeWorkspaceAutoLoad:false,
    staffWorkspaceBeforeFirstRender:false,
    delayedStaffTakeover:false,
    staffUsageTelemetryBoundaryRuntime:true,
    platformExtensionLoader:true,
    taxCenterLoader:true,
    workDraftRefreshPreservation:true,
    workDraftRefreshBuild:WORK_DRAFT_REFRESH_BUILD,
    workDraftInputMemory:true,
    workDraftInputMemoryBuild:WORK_DRAFT_MEMORY_BUILD
  };
})();
