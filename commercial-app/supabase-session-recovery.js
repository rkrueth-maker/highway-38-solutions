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