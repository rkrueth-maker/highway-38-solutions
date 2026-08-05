(function () {
  'use strict';

  const config=window.H38_BUSINESS_OFFICE_SUPABASE || {};
  const auth=window.H38_SUPABASE_AUTH;
  if(!auth || auth.enabled!==true || !window.supabase)return;

  const DEFAULT_MODULES=[
    'today','customers','jobs','tasks','quotes','measure','schedule','communications',
    'field','daily-logs','checklists','time','inventory','fleet','money','documents',
    'social','ai','settings','people','accounting','payroll-prep','tax-prep','controls',
    'reports','storage-providers'
  ];
  const NL_OWNER_LOGIN='https://highway38solutions.com/businesses/northern-lakes/owner-login.html';
  let installerClient=null;
  let installerState=null;
  let loading=false;

  function client(){
    if(installerClient)return installerClient;
    installerClient=window.supabase.createClient(config.url,config.publishableKey,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'},
      global:{headers:{'x-client-info':'h38-client-tenant-installer'}}
    });
    return installerClient;
  }
  function text(value){return String(value==null?'':value);}
  function escape(value){return window.esc?window.esc(value):text(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
  function statusPill(value){
    const status=text(value || 'unknown');
    const kind=status==='active'?'good':status==='suspended'||status==='closed'?'bad':'pending';
    return window.pill?window.pill(status,kind):`<span class="pill ${kind}">${escape(status)}</span>`;
  }
  function isPlatformOwner(){
    return window.state?.snapshot?.business?.businessKey==='highway38' && window.state?.snapshot?.user?.owner===true;
  }
  function tenantUrl(businessKey){
    const url=new URL('./',location.href);
    url.searchParams.set('businessKey',businessKey);
    return url.toString();
  }
  function installerRows(){
    return Array.isArray(installerState?.businesses)?installerState.businesses:[];
  }

  async function refreshState(){
    if(!isPlatformOwner())return null;
    loading=true;
    try{
      const {data,error}=await client().rpc('client_tenant_installer_state');
      if(error)throw error;
      if(!data || data.status!=='PASS')throw new Error('Client tenant installer state failed closed.');
      installerState=data;
      return data;
    }finally{
      loading=false;
    }
  }

  async function provision(payload){
    const {data,error}=await client().rpc('provision_client_business',payload);
    if(error)throw error;
    if(!data || data.status!=='PASS')throw new Error('Client tenant provisioning did not return PASS.');
    return data;
  }
  async function activate(businessId){
    const {data,error}=await client().rpc('activate_client_business',{p_business_id:businessId});
    if(error)throw error;
    if(!data || data.status!=='PASS')throw new Error('Client tenant activation did not return PASS.');
    return data;
  }
  async function suspend(businessId,reason){
    const {data,error}=await client().rpc('suspend_client_business',{p_business_id:businessId,p_reason:reason});
    if(error)throw error;
    if(!data || data.status!=='PASS')throw new Error('Client tenant suspension did not return PASS.');
    return data;
  }

  function rowHtml(row){
    const ownerClaimed=!!row.ownerAuthUserId;
    const ownerStatus=ownerClaimed?'claimed':text(row.ownerMembershipStatus || 'missing');
    const openUrl=tenantUrl(row.businessKey);
    const activationUrl=row.businessKey==='northern-lakes'?NL_OWNER_LOGIN:'';
    return `<div class="row" data-client-business="${escape(row.businessId)}">
      <div class="row-top"><div><strong>${escape(row.displayName)}</strong><small>${escape(row.businessKey)} · ${escape(row.packageId || 'standard')}</small></div>${statusPill(row.businessStatus)}</div>
      <small>Owner: ${escape(row.ownerEmail)} · ${escape(ownerStatus)} · Storage: ${escape(row.storageProvider || 'not set')} (${escape(row.storageConnectionStatus || 'unknown')}) · ${Number(row.enabledModuleCount || 0)} modules · ${Number(row.recordCount || 0)} records</small>
      <div class="row-actions">
        <a class="secondary" href="${escape(openUrl)}" target="_self">Open tenant</a>
        ${activationUrl?`<a class="secondary" href="${escape(activationUrl)}" target="_blank" rel="noopener">Owner activation page</a>`:''}
        ${row.businessStatus!=='active'?`<button data-activate-client="${escape(row.businessId)}">Activate closed beta</button>`:''}
        ${row.businessStatus==='active'?`<button class="danger" data-suspend-client="${escape(row.businessId)}">Suspend access</button>`:''}
      </div>
    </div>`;
  }

  function renderCard(){
    if(!isPlatformOwner())return;
    const grid=document.querySelector('#mainContent .grid');
    if(!grid || document.getElementById('clientTenantInstallerCard'))return;

    const card=document.createElement('section');
    card.id='clientTenantInstallerCard';
    card.className='card';
    const rows=installerRows();
    card.innerHTML=`<h2>Client tenant installer</h2>
      <p class="muted">Create an isolated Supabase business, prepare its owner invitation, select private storage, and activate it only after acceptance. This never imports Google records or changes an Apps Script deployment.</p>
      <div class="notice warn"><strong>Explicit controls:</strong> provisioning does not send an email or activate the business. The invited user requests the secure email from the branded owner-login page. Customer sending, payments, purchases, payroll, tax filing, publishing and advertising stay disabled.</div>
      <div id="clientTenantList" class="list">${loading?'<div class="empty">Loading client tenants…</div>':rows.length?rows.map(rowHtml).join(''):'<div class="empty">No client tenants have been provisioned.</div>'}</div>
      <details id="clientTenantCreatePanel" style="margin-top:14px">
        <summary><strong>Provision or refresh a client tenant</strong></summary>
        <form id="clientTenantForm">
          <div class="two"><div><label>Business key</label><input name="businessKey" required pattern="[a-z0-9][a-z0-9-]{1,62}" value="northern-lakes"></div><div><label>Package ID</label><input name="packageId" required value="northern-lakes-closed-beta"></div></div>
          <label>Legal name</label><input name="legalName" required value="Northern Lakes Property Maintenance LLC">
          <label>Display name</label><input name="displayName" required value="Northern Lakes Property Maintenance LLC">
          <div class="two"><div><label>Owner email</label><input name="ownerEmail" type="email" required value="northernlakesproperty@gmail.com"></div><div><label>Timezone</label><input name="timezone" required value="America/Chicago"></div></div>
          <div class="two"><div><label>Primary color</label><input name="primaryColor" value="#113b2e"></div><div><label>Accent color</label><input name="accentColor" value="#9a632f"></div></div>
          <label>Logo URL</label><input name="logoUrl" value="https://highway38solutions.com/businesses/northern-lakes/assets/diamond-logo.png?v=rendered-photo-pass-20260726">
          <label>Additional customer-visible H38 support email</label><input name="supportEmail" type="email" value="mandakw55@gmail.com">
          <div class="actions"><button type="submit">Provision or refresh</button><button id="refreshClientTenants" type="button" class="secondary">Refresh status</button></div>
        </form>
      </details>`;
    grid.appendChild(card);

    const form=document.getElementById('clientTenantForm');
    form.onsubmit=async event=>{
      event.preventDefault();
      const data=new FormData(form);
      const submit=form.querySelector('button[type="submit"]');
      try{
        submit.disabled=true;
        const businessKey=text(data.get('businessKey')).trim().toLowerCase();
        const result=await provision({
          p_business_key:businessKey,
          p_legal_name:text(data.get('legalName')).trim(),
          p_display_name:text(data.get('displayName')).trim(),
          p_owner_email:text(data.get('ownerEmail')).trim().toLowerCase(),
          p_timezone:text(data.get('timezone')).trim(),
          p_brand_config:{
            currency:'USD',
            industryPack:businessKey==='northern-lakes'?'property-maintenance':'service-business',
            logoUrl:text(data.get('logoUrl')).trim(),
            primaryColor:text(data.get('primaryColor')).trim(),
            accentColor:text(data.get('accentColor')).trim(),
            secondaryColor:businessKey==='northern-lakes'?'#f4efe5':'#eef3f7'
          },
          p_module_keys:DEFAULT_MODULES,
          p_package_id:text(data.get('packageId')).trim().toLowerCase(),
          p_support_email:text(data.get('supportEmail')).trim().toLowerCase() || null
        });
        window.toast?.(`${result.businessKey} is provisioned. Activation and invitation email remain separate.`);
        await refreshAndRender();
      }catch(error){window.toast?.(text(error && error.message || error),true);}
      finally{submit.disabled=false;}
    };

    document.getElementById('refreshClientTenants').onclick=()=>refreshAndRender();
    bindActions(card);
  }

  function bindActions(card){
    card.querySelectorAll('[data-activate-client]').forEach(button=>{
      button.onclick=async()=>{
        const businessId=button.dataset.activateClient;
        if(!confirm('Activate this client for the closed beta? This allows active members to open its isolated Supabase data. External actions remain disabled.'))return;
        try{
          button.disabled=true;
          await activate(businessId);
          window.toast?.('Client closed beta activated.');
          await refreshAndRender();
        }catch(error){window.toast?.(text(error && error.message || error),true);button.disabled=false;}
      };
    });
    card.querySelectorAll('[data-suspend-client]').forEach(button=>{
      button.onclick=async()=>{
        const businessId=button.dataset.suspendClient;
        if(!confirm('Suspend this client Business Office now? Cached data cannot override an online suspension.'))return;
        try{
          button.disabled=true;
          await suspend(businessId,'Suspended by Highway 38 Owner from Client Tenant Installer.');
          window.toast?.('Client access suspended.');
          await refreshAndRender();
        }catch(error){window.toast?.(text(error && error.message || error),true);button.disabled=false;}
      };
    });
  }

  async function refreshAndRender(){
    try{await refreshState();}
    catch(error){window.toast?.(text(error && error.message || error),true);}
    const existing=document.getElementById('clientTenantInstallerCard');
    if(existing)existing.remove();
    renderCard();
  }

  const baseRenderSettings=window.renderSettings || (typeof renderSettings==='function'?renderSettings:null);
  if(typeof baseRenderSettings==='function'){
    const wrapped=function(){
      const result=baseRenderSettings.apply(this,arguments);
      if(isPlatformOwner()){
        refreshState().catch(error=>console.warn('Client tenant installer state:',text(error && error.message || error))).finally(()=>{
          const existing=document.getElementById('clientTenantInstallerCard');
          if(existing)existing.remove();
          renderCard();
        });
      }
      return result;
    };
    window.renderSettings=wrapped;
    try{renderSettings=wrapped;}catch(ignore){}
  }

  window.H38_CLIENT_TENANT_INSTALLER={
    enabled:true,
    systemOfRecord:'supabase',
    automaticActivation:false,
    automaticInvitationEmail:false,
    googleDataImport:false,
    appsScriptMutation:false,
    refresh:refreshState
  };
})();
