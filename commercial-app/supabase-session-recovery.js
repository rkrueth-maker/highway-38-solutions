(function () {
  'use strict';

  const shared = window.H38_SUPABASE_SHARED_CLIENT;
  const officeAuth = window.H38_SUPABASE_AUTH;
  if (!shared?.enabled || !officeAuth || typeof officeAuth.signOut !== 'function') return;
  if (window.H38_SUPABASE_SESSION_RECOVERY?.enabled) return;

  let checking = false;
  let redirecting = false;
  let lastValidatedAt = 0;

  function text(value) {
    return String(value == null ? '' : value);
  }

  function isSessionFailure(error) {
    const code = text(error && (error.code || error.error_code)).toLowerCase();
    const message = text(error && error.message || error).toLowerCase();
    return code.includes('refresh_token_not_found') ||
      code.includes('bad_jwt') ||
      code.includes('no_authorization') ||
      message.includes('invalid refresh token') ||
      message.includes('refresh token not found') ||
      message.includes('jwt expired') ||
      message.includes('token is malformed') ||
      message.includes('session is invalid') ||
      message.includes('session expired');
  }

  function setStatus(message) {
    const businessStatus = document.getElementById('businessStatus');
    if (businessStatus) businessStatus.textContent = message;
  }

  async function requireSignIn(reason) {
    if (redirecting) return false;
    redirecting = true;
    setStatus('Session expired · secure sign-in required');
    try {
      await officeAuth.signOut();
    } catch (error) {
      try {
        const client = shared.get();
        if (client) await client.auth.signOut({ scope: 'local' });
      } catch (ignore) {}
    }
    window.dispatchEvent(new CustomEvent('h38:session-invalid', {
      detail: { reason: text(reason || 'Supabase session expired.'), draftPreserved: true }
    }));
    return false;
  }

  async function validate(trigger, force) {
    if (checking || redirecting || !navigator.onLine) return true;
    const now = Date.now();
    if (!force && now - lastValidatedAt < 15000) return true;
    checking = true;
    try {
      const client = shared.ensure();
      const sessionResult = await client.auth.getSession();
      if (sessionResult.error) {
        if (isSessionFailure(sessionResult.error)) return requireSignIn(sessionResult.error.message);
        throw sessionResult.error;
      }
      let session = sessionResult.data && sessionResult.data.session;
      if (!session) return true;

      const expiresAtMs = Number(session.expires_at || 0) * 1000;
      if (expiresAtMs && expiresAtMs <= Date.now() + 60000) {
        const refreshed = await client.auth.refreshSession();
        if (refreshed.error || !refreshed.data?.session) {
          return requireSignIn(refreshed.error?.message || 'Supabase session refresh failed.');
        }
        session = refreshed.data.session;
      }

      const userResult = await client.auth.getUser(session.access_token);
      if (userResult.error || !userResult.data?.user) {
        return requireSignIn(userResult.error?.message || 'Supabase session could not be verified.');
      }
      lastValidatedAt = Date.now();
      window.dispatchEvent(new CustomEvent('h38:session-valid', {
        detail: { trigger: text(trigger), userId: userResult.data.user.id, validatedAt: new Date().toISOString() }
      }));
      return true;
    } catch (error) {
      if (isSessionFailure(error)) return requireSignIn(error.message);
      return false;
    } finally {
      checking = false;
    }
  }

  function refreshServiceWorker() {
    if (!('serviceWorker' in navigator) || !navigator.onLine) return;
    const build = '20260807-2132';
    const reloadKey = `h38:worker-reloaded:${build}`;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      try {
        if (sessionStorage.getItem(reloadKey)) return;
        sessionStorage.setItem(reloadKey, '1');
      } catch (ignore) {}
      location.reload();
    });
    navigator.serviceWorker.register(`./service-worker.js?build=${build}`, {
      scope: './',
      updateViaCache: 'none'
    }).then(registration => registration.update()).catch(error => {
      console.warn('Business Office service worker refresh failed', error);
    });
  }

  window.addEventListener('pageshow', () => { void validate('pageshow', true); });
  window.addEventListener('online', () => { void validate('online', true); refreshServiceWorker(); });
  window.addEventListener('load', refreshServiceWorker, { once: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void validate('visible', false);
  });
  document.addEventListener('click', event => {
    const protectedAction = event.target?.closest?.('#h38AiQuoteDraftButton,#syncButton,#loadBusinessButton');
    if (!protectedAction) return;
    void validate('protected-action', true);
  }, true);

  setTimeout(() => { void validate('startup', true); }, 0);

  window.H38_SUPABASE_SESSION_RECOVERY = Object.freeze({
    enabled: true,
    build: '20260807-2132',
    validate: function () { return validate('manual', true); },
    singleClientRequired: true,
    clearsRevokedMembershipState: true,
    preservesDrafts: true,
    forcesCurrentServiceWorker: true
  });
})();

// Normal Office startup does not need hundreds of Proof/Error rows. Keep those
// durable records in Supabase and load them explicitly for management reports.
// The guard is installed from this live-first runtime before supabase-data.js
// executes, so stale service-worker copies of supabase-data.js cannot reintroduce
// the two hot audit reads.
(function(){
  'use strict';
  if(window.H38_SUPABASE_TRAFFIC_GUARD?.enabled)return;
  const shared=window.H38_SUPABASE_SHARED_CLIENT;
  if(!shared?.enabled)return;
  const api=shared.ensure?.();
  if(!api||typeof api.from!=='function')return;

  const BUILD='20260905-supabase-traffic-efficiency-1';
  const AUDIT_TABLES=new Set(['business_proof_log','business_error_log']);
  const rawFrom=api.from.bind(api);
  let suppressedStartupAuditReads=0;
  let explicitAuditLoads=0;

  function emptyQuery(){
    const response={data:[],error:null,count:null,status:200,statusText:'OK'};
    let proxy;
    proxy=new Proxy({}, {
      get(_target,property){
        if(property==='then')return (resolve,reject)=>Promise.resolve(response).then(resolve,reject);
        if(property==='catch')return reject=>Promise.resolve(response).catch(reject);
        if(property==='finally')return callback=>Promise.resolve(response).finally(callback);
        if(property===Symbol.toStringTag)return 'Promise';
        return ()=>proxy;
      }
    });
    return proxy;
  }

  function isOperationalHydration(){
    try{
      const stack=String(new Error().stack||'');
      return /hydrateSnapshot/.test(stack)&&/supabase-data\.js/.test(stack);
    }catch(_){return false;}
  }

  api.from=function(table){
    const name=String(table||'');
    if(AUDIT_TABLES.has(name)&&isOperationalHydration()){
      suppressedStartupAuditReads+=1;
      return emptyQuery();
    }
    return rawFrom(name);
  };

  function mapProof(row){
    return {
      'Proof ID':row.id,'Action Type':row.action_type,'Entity Type':row.entity_type||'',
      'Entity ID':row.entity_id||'','Result':row.result,'Details':row.details||{},
      'External Action Occurred':row.external_action_occurred===true,'Created Time':row.created_at
    };
  }

  function mapError(row){
    return {
      'Error ID':row.id,'Source':row.source,'Error Code':row.error_code||'',
      'Message':row.message,'Severity':row.severity,'Status':row.status,
      'Context':row.context||{},'Occurrence Count':Number(row.occurrence_count||1),
      'First Seen':row.created_at,'Last Seen':row.last_seen_at||row.created_at,'Created Time':row.created_at
    };
  }

  async function loadAuditHistory(businessId,options={}){
    const id=String(businessId||window.state?.businessId||'').trim();
    if(!id)throw new Error('Choose a business before loading audit history.');
    const proofLimit=Math.max(1,Math.min(Number(options.proofLimit||500),1000));
    const errorLimit=Math.max(1,Math.min(Number(options.errorLimit||250),1000));
    const [proofResult,errorResult]=await Promise.all([
      rawFrom('business_proof_log').select('*').eq('business_id',id).order('created_at',{ascending:false}).limit(proofLimit),
      rawFrom('business_error_log').select('*').eq('business_id',id).order('created_at',{ascending:false}).limit(errorLimit)
    ]);
    if(proofResult.error)throw proofResult.error;
    if(errorResult.error)throw errorResult.error;
    explicitAuditLoads+=1;
    const result={proofLog:(proofResult.data||[]).map(mapProof),errorLog:(errorResult.data||[]).map(mapError)};
    if(window.state?.snapshot&&String(window.state?.businessId||'')===id){
      window.state.snapshot.proofLog=result.proofLog;
      window.state.snapshot.errorLog=result.errorLog;
    }
    window.dispatchEvent(new CustomEvent('h38:audit-history-loaded',{detail:{businessId:id,proofCount:result.proofLog.length,errorCount:result.errorLog.length}}));
    return result;
  }

  window.H38_SUPABASE_TRAFFIC_GUARD=Object.freeze({
    enabled:true,
    build:BUILD,
    startupAuditHistoryLazy:true,
    auditHistoryStillAvailable:true,
    rlsStillAuthoritative:true,
    loadAuditHistory,
    metrics:()=>({suppressedStartupAuditReads,explicitAuditLoads})
  });
})();

(function(){
  'use strict';
  if(document.querySelector('script[data-h38-play-auth-runtime-repair]'))return;
  const script=document.createElement('script');
  script.dataset.h38PlayAuthRuntimeRepair='1';
  script.src='./auth-play-runtime-repair.js?build=20260818-play-auth-singleflight-1';
  document.head.appendChild(script);
})();
