(function () {
  'use strict';

  const config = window.H38_BUSINESS_OFFICE_SUPABASE || {};
  const LegacyBridge = window.H38Bridge;
  const runtime = {
    client: null,
    bridge: null,
    session: null,
    user: null,
    memberships: [],
    activeMemberships: [],
    selectedMembership: null,
    recovery: false,
    subscription: null
  };

  const EMPTY_COLLECTIONS = [
    'users','roles','settings','quickActions','providers','customers','contacts','properties','requests','jobs',
    'workOrders','tasks','scheduleEvents','timeEntries','jobNotes','quotes','measurements','measurementPoints',
    'priceBook','inventoryTransactions','materialRequests','assets','assignments','maintenance','inspections',
    'vehicles','usageLogs','invoices','invoiceLines','payments','expenses','documents','attachments','conversations',
    'messages','emailThreads','emailMessages','smsThreads','smsMessages','portalThreads','portalMessages',
    'socialAccounts','socialPosts','socialMetrics','campaigns','aiKnowledge','aiRecommendations','featureRequests',
    'voiceQueue','actionQueue','notifications','syncConflicts'
  ];

  function configured() {
    return config.enabled === true &&
      /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(String(config.url || '')) &&
      /^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(String(config.publishableKey || '')) &&
      config.productionPromotionAuthorized === false &&
      config.northernLakesEnabled === false &&
      config.externalActionsEnabled === false;
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function safeMessage(error) {
    return String(error && error.message ? error.message : error || 'Secure sign-in failed.')
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
      .slice(0, 700);
  }

  function currentRedirectUrl() {
    return String(config.authRedirectUrl || (location.origin + location.pathname));
  }

  function selectedBusinessKey(userId) {
    return `h38-selected-business:${userId}`;
  }

  function readPreferredBusiness(userId) {
    const queryValue = new URLSearchParams(location.search).get('businessId');
    if (queryValue) return queryValue.trim();
    try { return localStorage.getItem(selectedBusinessKey(userId)) || ''; }
    catch (error) { return ''; }
  }

  function writePreferredBusiness(userId, businessId) {
    try {
      if (businessId) localStorage.setItem(selectedBusinessKey(userId), businessId);
      else localStorage.removeItem(selectedBusinessKey(userId));
    } catch (error) {}
  }

  function initClient() {
    if (runtime.client) return runtime.client;
    if (!configured()) throw new Error('Supabase Auth preview configuration failed closed.');
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      throw new Error('Supabase client library did not load.');
    }
    runtime.client = window.supabase.createClient(config.url, config.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce'
      },
      global: { headers: { 'x-client-info': 'highway-38-business-office-auth-preview' } }
    });
    return runtime.client;
  }

  function rolePermissions(role) {
    if (role === 'owner') return { all: true };
    if (role === 'administrator') return {
      viewCustomers: true, manageWork: true, manageQuotes: true, manageSchedule: true,
      manageCommunications: true, manageField: true, captureEvidence: true, manageInventory: true,
      useInventory: true, manageAssets: true, useAssets: true, manageMaintenance: true,
      manageFinancial: true, viewFinancial: true, manageSocial: true, manageSettings: true, manageUsers: true
    };
    if (role === 'staff') return {
      viewCustomers: true, manageWork: true, viewAssignedWork: true, manageAssignedWork: true,
      manageQuotes: true, manageSchedule: true, manageCommunications: true, manageField: true,
      captureEvidence: true, useInventory: true, useAssets: true
    };
    return { viewCustomers: true, viewAssignedWork: true, viewFinancial: true };
  }

  function enabledModules(membership) {
    return (Array.isArray(membership.modules) ? membership.modules : [])
      .filter(row => row && row.enabled === true)
      .map(row => row.moduleKey)
      .filter(Boolean);
  }

  function buildSnapshot(membership, user, serverTime) {
    const brand = membership.brandConfig && typeof membership.brandConfig === 'object' ? membership.brandConfig : {};
    const moduleConfig = membership.businessModuleConfig && typeof membership.businessModuleConfig === 'object'
      ? membership.businessModuleConfig : {};
    const snapshot = {
      status: 'PASS',
      startupMode: 'SUPABASE_AUTH_FOUNDATION',
      fullRefreshPending: false,
      serverTime: serverTime || new Date().toISOString(),
      version: 'supabase-auth-stage-1',
      schemaVersion: 'business-office-auth-v1',
      authUserId: user.id,
      authorizationStatus: 'active',
      authorizationCheckedAt: new Date().toISOString(),
      user: {
        email: user.email || '',
        userId: user.id,
        displayName: user.user_metadata?.display_name || user.email || 'Business Office user',
        roleId: membership.role,
        roleName: membership.role,
        owner: membership.role === 'owner',
        permissions: rolePermissions(membership.role)
      },
      business: {
        businessId: membership.businessId,
        businessKey: membership.businessKey,
        businessName: membership.businessName,
        status: membership.businessStatus,
        currency: brand.currency || 'USD',
        timeZone: membership.timezone || 'America/Chicago',
        timezone: membership.timezone || 'America/Chicago',
        brandConfig: brand,
        moduleConfig,
        industryPack: brand.industryPack || '',
        industryPacks: Array.isArray(brand.industryPacks) ? brand.industryPacks : []
      },
      modules: enabledModules(membership),
      moduleSettings: Array.isArray(membership.modules) ? membership.modules : [],
      productShells: [],
      safeguards: {
        externalActionsEnabled: false,
        productionMigrationEnabled: false,
        automaticSocialPublishing: false,
        automaticCustomerSending: false,
        automaticFinancialActions: false,
        northernLakesEnabled: false
      }
    };
    EMPTY_COLLECTIONS.forEach(name => { snapshot[name] = []; });
    return snapshot;
  }

  async function setUserScope(userId) {
    if (!window.H38DB || typeof window.H38DB.setUserScope !== 'function') {
      throw new Error('User-scoped offline storage is unavailable.');
    }
    window.H38DB.setUserScope(userId);
  }

  async function writeAuthorization(status, userId, businessId) {
    if (!window.H38DB || typeof window.H38DB.put !== 'function' || !userId) return;
    await window.H38DB.put('meta', {
      id: 'authorization',
      userId,
      businessId: businessId || '',
      status,
      checkedAt: new Date().toISOString()
    });
  }

  function deniedStatus(memberships) {
    if (memberships.some(row => row.membershipStatus === 'suspended' || row.businessStatus === 'suspended')) return 'membership-suspended';
    if (memberships.some(row => row.membershipStatus === 'revoked' || row.businessStatus === 'closed')) return 'membership-revoked';
    if (memberships.some(row => row.membershipStatus === 'invited' || row.businessStatus === 'provisioning')) return 'membership-invited';
    return 'no-membership';
  }

  function browserBusinesses(rows) {
    return rows.map(row => ({
      businessId: row.businessId,
      businessKey: row.businessKey,
      businessName: row.businessName,
      businessStatus: row.businessStatus,
      role: row.role,
      industryPack: row.brandConfig?.industryPack || '',
      industryPacks: Array.isArray(row.brandConfig?.industryPacks) ? row.brandConfig.industryPacks : []
    }));
  }

  function clearBrowserTenantState() {
    runtime.memberships = [];
    runtime.activeMemberships = [];
    runtime.selectedMembership = null;
    if (window.H38DB && typeof window.H38DB.clearUserScope === 'function') window.H38DB.clearUserScope();
    window.dispatchEvent(new CustomEvent('h38:auth-cleared'));
    const signOut = document.getElementById('authSignOutButton');
    if (signOut) signOut.hidden = true;
  }

  function showNotice(message, bad) {
    const node = document.getElementById('h38AuthNotice');
    if (!node) return;
    node.textContent = message;
    node.className = `notice${bad ? ' warn' : ''}`;
  }

  function authPanel(mode, detail) {
    const target = document.getElementById('mainContent');
    if (!target) return;
    const fallback = esc(config.fallbackUrl || '/open-business-office.html');
    const states = {
      'membership-suspended': ['Access suspended', 'This account is signed in, but its Business Office membership is suspended. A cached business cannot override this result.'],
      'membership-revoked': ['Access removed', 'This account no longer has an active Business Office membership. A direct link or saved business cannot reopen it.'],
      'membership-invited': ['Invitation is not active yet', 'The signed-in email has a pending or provisioning membership that is not allowed to open business data yet.'],
      'no-membership': ['No Business Office membership', 'This signed-in account is not assigned to an active business.'],
      'auth-expired': ['Session expired', 'Sign in again to reopen the Business Office securely.']
    };
    if (mode === 'recovery') {
      target.innerHTML = `<section class="welcome"><h1>Set a new password</h1><p>Choose a new password for this Supabase Auth account.</p><form id="h38RecoveryForm" class="auth-form"><label><span>New password</span><input id="h38NewPassword" type="password" autocomplete="new-password" minlength="10" required></label><button class="primary" type="submit">Save new password</button></form><div id="h38AuthNotice" class="notice">Passwords go directly to Supabase Auth and are never stored in this page.</div></section>`;
      document.getElementById('h38RecoveryForm').onsubmit = async event => {
        event.preventDefault();
        try {
          const password = String(document.getElementById('h38NewPassword').value || '');
          if (password.length < 10) throw new Error('Use at least 10 characters.');
          const { error } = await initClient().auth.updateUser({ password });
          if (error) throw error;
          runtime.recovery = false;
          showNotice('Password updated. Opening the Business Office…', false);
          runtime.bridge?.connect();
        } catch (error) { showNotice(safeMessage(error), true); }
      };
      return;
    }
    if (states[mode]) {
      const [title, text] = states[mode];
      target.innerHTML = `<section class="welcome"><h1>${esc(title)}</h1><p>${esc(detail || text)}</p><div class="welcome-actions"><button id="h38SignOutDenied" class="primary" type="button">Sign out</button><a class="secondary" href="${fallback}">Use current Google Office fallback</a></div><div id="h38AuthNotice" class="notice">Nothing is sent, approved, purchased, paid, published, or executed automatically.</div></section>`;
      document.getElementById('h38SignOutDenied').onclick = () => signOut();
      return;
    }
    target.innerHTML = `<section class="welcome"><h1>Sign in to Business Office</h1><p>${esc(detail || 'Use the email and password connected to an active business membership.')}</p><form id="h38AuthForm" class="auth-form"><label><span>Email address</span><input id="h38AuthEmail" type="email" autocomplete="email" required></label><label><span>Password</span><input id="h38AuthPassword" type="password" autocomplete="current-password" required></label><div class="welcome-actions"><button class="primary" type="submit">Sign in</button><button id="h38ResetPassword" class="secondary" type="button">Reset password</button></div></form><a class="secondary" href="${fallback}">Use current Google Office fallback</a><div id="h38AuthNotice" class="notice">Supabase Auth and RLS determine access. Saved business IDs never grant permission.</div></section>`;
    document.getElementById('h38AuthForm').onsubmit = async event => {
      event.preventDefault();
      try {
        const email = String(document.getElementById('h38AuthEmail').value || '').trim().toLowerCase();
        const password = String(document.getElementById('h38AuthPassword').value || '');
        showNotice('Signing in securely…', false);
        const { data, error } = await initClient().auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!data.session) throw new Error('Supabase Auth did not create a session.');
        document.getElementById('h38AuthPassword').value = '';
        await runtime.bridge?.connect();
      } catch (error) { showNotice(safeMessage(error), true); }
    };
    document.getElementById('h38ResetPassword').onclick = async () => {
      try {
        const email = String(document.getElementById('h38AuthEmail').value || '').trim().toLowerCase();
        if (!email) throw new Error('Enter the email address first.');
        const { error } = await initClient().auth.resetPasswordForEmail(email, { redirectTo: currentRedirectUrl() });
        if (error) throw error;
        showNotice('Check your email for the password reset link. The page does not confirm whether an address is registered.', false);
      } catch (error) { showNotice(safeMessage(error), true); }
    };
  }

  async function signOut() {
    try {
      if (runtime.client) await runtime.client.auth.signOut();
    } finally {
      runtime.session = null;
      runtime.user = null;
      clearBrowserTenantState();
      runtime.bridge?.onStatus('sign-in-required');
      authPanel('signin', 'Signed out.');
    }
  }

  class SupabaseBusinessOfficeBridge {
    constructor(frame, url, onStatus, onBootstrap, onFullSnapshot, onError) {
      this.frame = frame;
      this.url = url;
      this.onStatus = onStatus || (() => {});
      this.onBootstrap = onBootstrap || (() => {});
      this.onFullSnapshot = onFullSnapshot || (() => {});
      this.onError = onError || (() => {});
      this.ready = false;
      this.transport = 'supabase-auth';
      runtime.bridge = this;
    }

    setUrl(url) { this.url = url; }
    authorize() { this.onStatus('sign-in-required'); authPanel('signin'); return true; }

    async connect() {
      try {
        const client = initClient();
        if (!runtime.subscription) {
          const listener = client.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY') {
              runtime.recovery = true;
              authPanel('recovery');
              return;
            }
            if (event === 'SIGNED_OUT') {
              runtime.session = null;
              runtime.user = null;
              this.ready = false;
              clearBrowserTenantState();
              this.onStatus('sign-in-required');
              return;
            }
            if (session && (!runtime.session || runtime.session.access_token !== session.access_token)) {
              setTimeout(() => this.connect(), 0);
            }
          });
          runtime.subscription = listener.data.subscription;
        }
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        const session = data.session;
        if (!session || !session.user) {
          this.ready = false;
          runtime.session = null;
          runtime.user = null;
          clearBrowserTenantState();
          this.onStatus('sign-in-required');
          return;
        }
        runtime.session = session;
        runtime.user = session.user;
        await setUserScope(session.user.id);
        const signOutButton = document.getElementById('authSignOutButton');
        if (signOutButton) {
          signOutButton.hidden = false;
          signOutButton.onclick = () => signOut();
        }
        if (!navigator.onLine) {
          this.ready = false;
          this.onStatus('offline-authenticated');
          return;
        }
        this.onStatus('connected');
        const { data: authState, error: authError } = await client.rpc('business_office_auth_state');
        if (authError) throw authError;
        if (!authState || authState.status !== 'PASS') throw new Error('Business membership resolution failed closed.');
        runtime.memberships = Array.isArray(authState.memberships) ? authState.memberships : [];
        runtime.activeMemberships = runtime.memberships.filter(row => row.membershipStatus === 'active' && row.businessStatus === 'active');
        if (!runtime.activeMemberships.length) {
          const status = deniedStatus(runtime.memberships);
          await writeAuthorization(status, session.user.id, '');
          writePreferredBusiness(session.user.id, '');
          this.ready = false;
          this.onStatus(status);
          return;
        }
        const preferred = readPreferredBusiness(session.user.id);
        let selected = runtime.activeMemberships.find(row => row.businessId === preferred) || null;
        if (!selected && runtime.activeMemberships.length === 1) selected = runtime.activeMemberships[0];
        runtime.selectedMembership = selected;
        if (selected) {
          writePreferredBusiness(session.user.id, selected.businessId);
          await writeAuthorization('active', session.user.id, selected.businessId);
        }
        this.ready = true;
        const startup = {
          status: 'PASS',
          authTransport: 'supabase-auth',
          user: { id: session.user.id, email: session.user.email || '' },
          canSwitchBusinesses: runtime.activeMemberships.length > 1,
          businesses: browserBusinesses(runtime.activeMemberships),
          selectedBusinessId: selected ? selected.businessId : '',
          snapshot: selected ? buildSnapshot(selected, session.user, authState.serverTime) : null,
          safeguards: authState.safeguards || {}
        };
        this.onBootstrap(startup);
        this.onStatus('bootstrapped');
      } catch (error) {
        this.ready = false;
        const message = safeMessage(error);
        this.onError('authorization', message);
      }
    }

    async request(action, args) {
      if (!runtime.session || !runtime.user) {
        const error = new Error('Supabase Auth session is required.');
        error.code = 'AUTH_REQUIRED';
        throw error;
      }
      if (!navigator.onLine) throw new Error('Offline mode cannot refresh authorization.');
      if (action === 'listBusinesses') return browserBusinesses(runtime.activeMemberships);
      if (action === 'acceptanceStatus') return {
        status: 'PASS', acceptance: 'SUPABASE_AUTH_ACTIVE_BUSINESS', readOnly: true,
        activeBusinessCount: runtime.activeMemberships.length, externalActionsEnabled: false,
        productionPromotionAuthorized: false, northernLakesEnabled: false
      };
      if (action === 'fullStartupRefresh' || action === 'completionBootstrap') {
        const businessId = String(args && args.businessId || '');
        const membership = runtime.activeMemberships.find(row => row.businessId === businessId);
        if (!membership) throw new Error('The selected business is not an active membership.');
        runtime.selectedMembership = membership;
        writePreferredBusiness(runtime.user.id, membership.businessId);
        await writeAuthorization('active', runtime.user.id, membership.businessId);
        return buildSnapshot(membership, runtime.user, new Date().toISOString());
      }
      throw new Error(`${action} is not enabled during the Auth-only migration stage. Existing Google production remains the fallback.`);
    }
  }

  window.H38_SUPABASE_AUTH = {
    enabled: configured(),
    render: authPanel,
    signOut,
    getState: () => ({
      userId: runtime.user?.id || '',
      email: runtime.user?.email || '',
      activeBusinessCount: runtime.activeMemberships.length,
      selectedBusinessId: runtime.selectedMembership?.businessId || '',
      recovery: runtime.recovery,
      transport: 'supabase-auth'
    })
  };

  if (configured()) window.H38Bridge = SupabaseBusinessOfficeBridge;
  else window.H38Bridge = LegacyBridge;
})();
