(function () {
  'use strict';

  const CONFIG = Object.freeze({
    url: 'https://uvcqnkjidllhdmjnqshk.supabase.co',
    publishableKey: 'sb_publishable_CMkRPG2Qn3VvunVO-Gxo5w_uLQXysUo',
    clientInfo: 'highway-38-business-office-auth-dev',
    storagePrefix: 'h38-office-auth'
  });
  const params = new URLSearchParams(location.search);
  const enabled = params.get('supabaseAuth') === '1' || sessionStorage.getItem('h38-supabase-auth-dev') === '1';
  const state = { client: null, session: null, user: null, memberships: [], businesses: [], selectedBusinessId: '', authEvent: '' };
  let authReadyResolve;
  const authReady = new Promise(resolve => { authReadyResolve = resolve; });

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
  function userKey(suffix) {
    return `${CONFIG.storagePrefix}:${state.user && state.user.id ? state.user.id : 'anonymous'}:${suffix}`;
  }
  function clearVisibleTenantState() {
    state.memberships = [];
    state.businesses = [];
    state.selectedBusinessId = '';
    try {
      localStorage.removeItem('h38-selected-business');
      sessionStorage.removeItem('h38-gateway-session-v1');
      sessionStorage.removeItem('h38-execution-session-v1');
    } catch (_) {}
    window.H38_SUPABASE_STARTUP = null;
    window.dispatchEvent(new CustomEvent('h38:auth-user-cleared'));
  }
  function configured() {
    return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(CONFIG.url) && /^sb_publishable_/.test(CONFIG.publishableKey);
  }
  function ensureStyle() {
    if (document.getElementById('h38SupabaseAuthStyle')) return;
    const style = document.createElement('style');
    style.id = 'h38SupabaseAuthStyle';
    style.textContent = '.h38-auth-cover{position:fixed;inset:0;z-index:10000;background:#081b2a;display:grid;place-items:center;padding:20px}.h38-auth-card{width:min(440px,100%);background:#fff;color:#12212b;border-radius:16px;padding:24px;box-shadow:0 24px 70px #0008}.h38-auth-card h1{margin:0 0 8px}.h38-auth-card p{line-height:1.45}.h38-auth-card label{display:block;font-weight:700;margin:14px 0 5px}.h38-auth-card input{box-sizing:border-box;width:100%;font:inherit;padding:12px;border:1px solid #9aa8b2;border-radius:9px}.h38-auth-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}.h38-auth-actions button{font:inherit;padding:11px 15px;border-radius:9px;border:1px solid #36566b;background:#fff}.h38-auth-actions .primary{background:#0b5f86;color:#fff;border-color:#0b5f86}.h38-auth-notice{min-height:24px;margin-top:12px}.h38-auth-notice.bad{color:#9b1c1c}.h38-auth-notice.ok{color:#176b37}.h38-auth-businesses button{display:block;width:100%;text-align:left;margin:8px 0;padding:12px;border:1px solid #b8c3ca;border-radius:9px;background:#f6f8f9}';
    document.head.appendChild(style);
  }
  function authRoot() {
    ensureStyle();
    let root = document.getElementById('h38SupabaseAuth');
    if (!root) {
      root = document.createElement('section');
      root.id = 'h38SupabaseAuth';
      root.className = 'h38-auth-cover';
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      document.body.appendChild(root);
    }
    return root;
  }
  function notice(message, kind) {
    const node = document.getElementById('h38AuthNotice');
    if (node) { node.className = `h38-auth-notice ${kind || ''}`; node.textContent = message || ''; }
  }
  function renderLogin(message) {
    const root = authRoot();
    root.hidden = false;
    root.innerHTML = `<form class="h38-auth-card" id="h38AuthForm"><h1>Highway 38 Business Office</h1><p>Sign in with the email address assigned to your business membership.</p><label for="h38AuthEmail">Email</label><input id="h38AuthEmail" type="email" autocomplete="username" required><label for="h38AuthPassword">Password</label><input id="h38AuthPassword" type="password" autocomplete="current-password" required><div class="h38-auth-actions"><button class="primary" type="submit">Sign in</button><button id="h38ResetPassword" type="button">Reset password</button><a href="/open-business-office.html">Use Google fallback</a></div><div id="h38AuthNotice" class="h38-auth-notice">${esc(message || '')}</div></form>`;
    document.getElementById('h38AuthForm').addEventListener('submit', event => { event.preventDefault(); signIn().catch(showError); });
    document.getElementById('h38ResetPassword').addEventListener('click', () => resetPassword().catch(showError));
  }
  function renderRecovery() {
    const root = authRoot();
    root.hidden = false;
    root.innerHTML = `<form class="h38-auth-card" id="h38RecoveryForm"><h1>Set a new password</h1><p>Enter a new password for this Business Office account.</p><label for="h38NewPassword">New password</label><input id="h38NewPassword" type="password" autocomplete="new-password" minlength="10" required><div class="h38-auth-actions"><button class="primary" type="submit">Update password</button></div><div id="h38AuthNotice" class="h38-auth-notice"></div></form>`;
    document.getElementById('h38RecoveryForm').addEventListener('submit', event => { event.preventDefault(); updatePassword().catch(showError); });
  }
  function renderMembershipState(message) {
    const root = authRoot();
    root.hidden = false;
    root.innerHTML = `<div class="h38-auth-card"><h1>Business access unavailable</h1><p>${esc(message)}</p><div class="h38-auth-actions"><button id="h38AuthSignOut" type="button">Sign out</button><a href="/open-business-office.html">Use Google fallback</a></div></div>`;
    document.getElementById('h38AuthSignOut').addEventListener('click', () => signOut().catch(showError));
  }
  function renderBusinessPicker() {
    const root = authRoot();
    root.hidden = false;
    root.innerHTML = `<div class="h38-auth-card"><h1>Choose a business</h1><p>Your account has access to more than one active business.</p><div class="h38-auth-businesses">${state.businesses.map(row => `<button type="button" data-business-id="${esc(row.id)}"><strong>${esc(row.display_name || row.legal_name)}</strong><br><small>${esc(row.role)}</small></button>`).join('')}</div><div class="h38-auth-actions"><button id="h38AuthSignOut" type="button">Sign out</button></div></div>`;
    root.querySelectorAll('[data-business-id]').forEach(button => button.addEventListener('click', () => selectBusiness(button.dataset.businessId)));
    document.getElementById('h38AuthSignOut').addEventListener('click', () => signOut().catch(showError));
  }
  function showError(error) {
    console.error(error);
    notice(error && error.message ? error.message : String(error), 'bad');
  }
  async function signIn() {
    notice('Signing in securely…');
    const email = String(document.getElementById('h38AuthEmail').value || '').trim().toLowerCase();
    const password = String(document.getElementById('h38AuthPassword').value || '');
    const { error } = await state.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }
  async function resetPassword() {
    const email = String(document.getElementById('h38AuthEmail').value || '').trim().toLowerCase();
    if (!email) throw new Error('Enter your email address first.');
    const redirectTo = `${location.origin}${location.pathname}?supabaseAuth=1`;
    const { error } = await state.client.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
    notice('Check your email for the password reset link.', 'ok');
  }
  async function updatePassword() {
    const password = String(document.getElementById('h38NewPassword').value || '');
    if (password.length < 10) throw new Error('Use at least 10 characters.');
    const { error } = await state.client.auth.updateUser({ password });
    if (error) throw error;
    notice('Password updated. Loading your business access…', 'ok');
    await resolveAccess();
  }
  async function signOut() {
    clearVisibleTenantState();
    const { error } = await state.client.auth.signOut();
    if (error) throw error;
    renderLogin('Signed out.');
  }
  async function loadMemberships() {
    const { data, error } = await state.client.from('business_memberships').select('id,business_id,role,status,accepted_at').eq('auth_user_id', state.user.id);
    if (error) throw error;
    state.memberships = Array.isArray(data) ? data : [];
    const active = state.memberships.filter(row => row.status === 'active');
    if (!active.length) {
      const pending = state.memberships.find(row => row.status === 'invited');
      const blocked = state.memberships.find(row => row.status === 'suspended' || row.status === 'revoked');
      renderMembershipState(pending ? 'Your invitation exists but has not become active. Ask the owner to review it.' : blocked ? `Your membership is ${blocked.status}. No business data was loaded.` : 'No active business membership is connected to this account. No business data was loaded.');
      return [];
    }
    const ids = active.map(row => row.business_id);
    const { data: businesses, error: businessError } = await state.client.from('businesses').select('id,business_key,legal_name,display_name,status,timezone,brand_config,module_config').in('id', ids).eq('status', 'active');
    if (businessError) throw businessError;
    state.businesses = (businesses || []).map(business => ({ ...business, role: active.find(row => row.business_id === business.id).role }));
    return state.businesses;
  }
  async function loadModules(businessId) {
    const { data, error } = await state.client.from('business_module_settings').select('module_key,enabled,config').eq('business_id', businessId);
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }
  function validPreferredBusiness() {
    const urlId = params.get('business');
    const storedId = localStorage.getItem(userKey('selected-business'));
    return [urlId, storedId].find(id => state.businesses.some(row => row.id === id)) || '';
  }
  async function selectBusiness(businessId) {
    const business = state.businesses.find(row => row.id === businessId);
    if (!business) throw new Error('That business is not available to this account.');
    state.selectedBusinessId = business.id;
    localStorage.setItem(userKey('selected-business'), business.id);
    const modules = await loadModules(business.id);
    window.H38_SUPABASE_STARTUP = {
      source: 'supabase-auth-dev',
      user: { id: state.user.id, email: state.user.email || '', role: business.role },
      business,
      businesses: state.businesses.map(row => ({ id: row.id, businessId: row.id, name: row.display_name || row.legal_name, displayName: row.display_name || row.legal_name, role: row.role })),
      canSwitchBusinesses: state.businesses.length > 1,
      selectedBusinessId: business.id,
      modules,
      safeguards: { externalActionsEnabled: false, automaticApprovalEnabled: false, automaticSendingEnabled: false, ownerReviewRequired: true },
      snapshot: { user: { id: state.user.id, email: state.user.email || '', role: business.role }, business, modules, safeguards: { externalActionsEnabled: false, automaticApprovalEnabled: false, automaticSendingEnabled: false, ownerReviewRequired: true } }
    };
    authRoot().hidden = true;
    window.dispatchEvent(new CustomEvent('h38:supabase-startup', { detail: window.H38_SUPABASE_STARTUP }));
    return window.H38_SUPABASE_STARTUP;
  }
  async function resolveAccess() {
    if (!state.user) return null;
    const businesses = await loadMemberships();
    if (!businesses.length) return null;
    const selected = validPreferredBusiness();
    if (businesses.length === 1) return selectBusiness(businesses[0].id);
    if (selected) return selectBusiness(selected);
    renderBusinessPicker();
    return null;
  }
  async function applySession(session, event) {
    const previousUserId = state.user && state.user.id;
    state.session = session || null;
    state.user = session && session.user ? session.user : null;
    state.authEvent = event || '';
    if (previousUserId && (!state.user || previousUserId !== state.user.id)) clearVisibleTenantState();
    if (event === 'PASSWORD_RECOVERY') { renderRecovery(); return; }
    if (!state.user) { clearVisibleTenantState(); renderLogin(); return; }
    await resolveAccess();
  }
  async function boot() {
    if (!enabled) { authReadyResolve(false); return; }
    sessionStorage.setItem('h38-supabase-auth-dev', '1');
    if (!configured() || !window.supabase || typeof window.supabase.createClient !== 'function') {
      renderMembershipState('Supabase Auth development configuration did not load. The existing Google fallback remains available.');
      authReadyResolve(false);
      return;
    }
    state.client = window.supabase.createClient(CONFIG.url, CONFIG.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'h38-office-auth-dev' },
      global: { headers: { 'x-client-info': CONFIG.clientInfo } }
    });
    state.client.auth.onAuthStateChange((event, session) => { queueMicrotask(() => applySession(session, event).catch(showError)); });
    const { data, error } = await state.client.auth.getSession();
    if (error) throw error;
    await applySession(data.session, 'INITIAL_SESSION');
    authReadyResolve(true);
  }

  window.H38SupabaseAuth = {
    enabled,
    ready: () => authReady,
    getStartup: () => window.H38_SUPABASE_STARTUP || null,
    getAccessToken: () => state.session && state.session.access_token ? state.session.access_token : '',
    signOut,
    selectBusiness,
    getState: () => ({ ...state, memberships: state.memberships.slice(), businesses: state.businesses.slice() })
  };
  document.addEventListener('DOMContentLoaded', () => boot().catch(error => { showError(error); authReadyResolve(false); }));
})();