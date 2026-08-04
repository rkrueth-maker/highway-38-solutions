(function () {
  'use strict';

  const config = window.H38_CUSTOMER_PORTAL_SUPABASE || {};
  const state = { client: null, session: null, businesses: [], selected: null, loadingUserId: '' };
  const byId = id => document.getElementById(id);
  const configured = () => Boolean(
    config.enabled === true &&
    /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(String(config.url || '')) &&
    String(config.publishableKey || '').length >= 20 &&
    !/REPLACE_WITH|YOUR_PROJECT/i.test(String(config.url || '') + String(config.publishableKey || ''))
  );

  function setText(id, value) {
    const node = byId(id);
    if (node) node.textContent = String(value == null ? '' : value);
  }

  function setHidden(id, hidden) {
    const node = byId(id);
    if (node) node.hidden = Boolean(hidden);
  }

  function notice(message, kind) {
    const node = byId('status');
    if (!node) return;
    node.className = 'status ' + (kind || '');
    node.textContent = message;
  }

  function show(view) {
    ['officeAuthLogin', 'officeAuthReady', 'officeAuthHold'].forEach(id => setHidden(id, id !== view));
  }

  function emailValue() {
    return String((byId('officeAuthEmail') || {}).value || '').trim().toLowerCase();
  }

  function currentRedirectUrl() {
    const redirect = new URL(location.href);
    redirect.searchParams.set('auth', 'supabase');
    redirect.hash = '';
    return redirect.toString();
  }

  function legacyDestination(business) {
    const destination = new URL('https://script.google.com/macros/s/AKfycbyY8cbfvGLzllw7rMhRY46wx_eIKhsK5oLlV6vIcDxDIKuCzX0_oTi4EyVufSxonLdxow/exec');
    destination.searchParams.set('entry', '1');
    destination.searchParams.set('officeBuild', '20260803-1700');
    const incoming = new URLSearchParams(location.search);
    ['page', 'shell', 'businessId'].forEach(key => {
      const value = String(incoming.get(key) || '').trim();
      if (value) destination.searchParams.set(key, value);
    });
    if (business && business.business_key) destination.searchParams.set('supabaseTenant', business.business_key);
    destination.searchParams.set('supabaseAuth', 'verified');
    return destination.toString();
  }

  function roleLabel(role) {
    return String(role || 'viewer').replace(/(^|_)([a-z])/g, (_, lead, letter) => (lead ? ' ' : '') + letter.toUpperCase());
  }

  async function loadMemberships(session) {
    const userId = session && session.user && session.user.id;
    if (!userId) return applySession(null);
    if (state.loadingUserId === userId) return;
    state.loadingUserId = userId;
    notice('Verifying your Highway 38 Business Office access…');

    try {
      const { data: businesses, error: businessError } = await state.client
        .from('business_office_my_businesses')
        .select('business_id,business_key,display_name,business_status,timezone,brand_config,module_config,role,membership_status')
        .eq('membership_status', 'active')
        .eq('business_status', 'active')
        .order('display_name', { ascending: true });
      if (businessError) throw businessError;
      state.businesses = Array.isArray(businesses) ? businesses : [];
      if (!state.businesses.length) {
        state.selected = null;
        show('officeAuthHold');
        notice('This sign-in is valid, but it is not connected to an active Business Office membership.', 'bad');
        return;
      }

      const requestedTenant = String(new URLSearchParams(location.search).get('tenant') || '').trim().toLowerCase();
      state.selected = state.businesses.find(row => String(row.business_key || '').toLowerCase() === requestedTenant) || state.businesses[0];

      const { data: modules, error: moduleError } = await state.client
        .from('business_module_settings')
        .select('module_key,enabled')
        .eq('business_id', state.selected.business_id)
        .eq('enabled', true)
        .order('module_key', { ascending: true });
      if (moduleError) throw moduleError;

      setText('officeAuthBusinessName', state.selected.display_name || state.selected.business_key || 'Business Office');
      setText('officeAuthRole', roleLabel(state.selected.role));
      setText('officeAuthEmailDisplay', session.user.email || 'Signed-in user');
      setText('officeAuthModules', `${Array.isArray(modules) ? modules.length : 0} enabled modules`);
      const continueButton = byId('officeAuthContinue');
      if (continueButton) continueButton.href = legacyDestination(state.selected);
      show('officeAuthReady');
      notice('Supabase sign-in and tenant access verified. The current Google Office remains available while modules are migrated.', 'ok');
    } finally {
      state.loadingUserId = '';
    }
  }

  async function applySession(session) {
    state.session = session || null;
    if (!state.session) {
      state.businesses = [];
      state.selected = null;
      show('officeAuthLogin');
      notice('Sign in with the Highway 38 account connected to your Business Office.');
      return;
    }
    await loadMemberships(state.session);
  }

  async function signInWithPassword(event) {
    event.preventDefault();
    const email = emailValue();
    const passwordNode = byId('officeAuthPassword');
    const password = String((passwordNode || {}).value || '');
    if (!email) return notice('Enter your Business Office email address.', 'bad');
    if (!password) return notice('Enter your password or request a secure email sign-in link.', 'bad');
    notice('Signing in securely…');
    const { data, error } = await state.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (passwordNode) passwordNode.value = '';
    if (data && data.session) await applySession(data.session);
  }

  async function sendMagicLink() {
    const email = emailValue();
    if (!email) return notice('Enter your Business Office email address first.', 'bad');
    notice('Requesting a secure sign-in email…');
    const { error } = await state.client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: currentRedirectUrl(), shouldCreateUser: false }
    });
    if (error) throw error;
    notice('Check your email for the secure sign-in link. For privacy, this page does not confirm whether an address is registered.', 'ok');
  }

  async function signOut() {
    const { error } = await state.client.auth.signOut();
    if (error) throw error;
    sessionStorage.removeItem('h38-supabase-office-bootstrap-v1');
    await applySession(null);
    notice('Signed out.', 'ok');
  }

  function recordVerifiedBootstrap(event) {
    if (!state.session || !state.selected) {
      event.preventDefault();
      notice('Business Office access must be verified before continuing.', 'bad');
      return;
    }
    sessionStorage.setItem('h38-supabase-office-bootstrap-v1', JSON.stringify({
      businessId: state.selected.business_id,
      businessKey: state.selected.business_key,
      role: state.selected.role,
      userId: state.session.user.id,
      verifiedAt: new Date().toISOString(),
      externalActionOccurred: false
    }));
  }

  function safeRun(task) {
    Promise.resolve().then(task).catch(error => {
      console.error(error);
      show(state.session ? 'officeAuthHold' : 'officeAuthLogin');
      notice(error && error.message ? error.message : 'Secure Business Office sign-in failed.', 'bad');
    });
  }

  async function init() {
    if (!configured()) {
      show('officeAuthHold');
      notice('Supabase Business Office configuration did not pass validation. The current Google Office remains available.', 'bad');
      return;
    }
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      throw new Error('The pinned Supabase client library did not load.');
    }

    state.client = window.supabase.createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      global: { headers: { 'x-client-info': 'highway-38-business-office-auth-bootstrap' } }
    });

    const form = byId('officeAuthForm');
    const magic = byId('officeAuthMagicLink');
    const signOutButton = byId('officeAuthSignOut');
    const continueButton = byId('officeAuthContinue');
    if (form) form.addEventListener('submit', event => safeRun(() => signInWithPassword(event)));
    if (magic) magic.addEventListener('click', () => safeRun(sendMagicLink));
    if (signOutButton) signOutButton.addEventListener('click', () => safeRun(signOut));
    if (continueButton) continueButton.addEventListener('click', recordVerifiedBootstrap);

    state.client.auth.onAuthStateChange((_event, session) => {
      if ((session && session.user && session.user.id) !== (state.session && state.session.user && state.session.user.id)) {
        safeRun(() => applySession(session));
      }
    });

    const { data, error } = await state.client.auth.getSession();
    if (error) throw error;
    await applySession(data && data.session ? data.session : null);
  }

  safeRun(init);
})();
