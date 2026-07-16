(function () {
  'use strict';

  const config = window.H38_CUSTOMER_PORTAL_SUPABASE || {};
  const state = { client: null, session: null, account: null };

  const byId = id => document.getElementById(id);
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
  const configured = () => Boolean(
    config.enabled === true &&
    /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(String(config.url || '')) &&
    String(config.publishableKey || '').length >= 20 &&
    !/REPLACE_WITH|YOUR_PROJECT/i.test(String(config.url || '') + String(config.publishableKey || ''))
  );

  function notice(message, kind) {
    const node = byId('portalNotice');
    if (!node) return;
    node.className = 'portal-notice ' + (kind || '');
    node.innerHTML = message;
  }

  function setView(name) {
    ['hold', 'login', 'app'].forEach(key => {
      const node = byId('portal-' + key);
      if (node) node.hidden = key !== name;
    });
  }

  function safeError(error) {
    console.error(error);
    notice('<b>Portal hold:</b> ' + esc(error && error.message ? error.message : error), 'bad');
  }

  function currentRedirectUrl() {
    return config.redirectUrl || (location.origin + location.pathname);
  }

  function initClient() {
    if (!configured()) {
      setView('hold');
      notice('<b>Supabase connection is prepared but not enabled.</b> Add the project URL and publishable key, apply the SQL migration, then set <code>enabled: true</code>. No customer data is exposed.', 'hold');
      return null;
    }
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      throw new Error('Supabase client library did not load.');
    }
    state.client = window.supabase.createClient(config.url, config.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      },
      global: {
        headers: { 'x-client-info': 'highway-38-customer-portal' }
      }
    });
    return state.client;
  }

  async function sendMagicLink(event) {
    event.preventDefault();
    const email = String(byId('portalEmail').value || '').trim().toLowerCase();
    if (!email) return notice('Enter the email address connected to your customer account.', 'bad');
    const { error } = await state.client.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: currentRedirectUrl(),
        shouldCreateUser: false
      }
    });
    if (error) throw error;
    notice('<b>Check your email.</b> The secure sign-in link was requested. For privacy, the portal does not confirm whether an address is registered.', 'ok');
  }

  async function signOut() {
    const { error } = await state.client.auth.signOut();
    if (error) throw error;
    state.session = null;
    state.account = null;
    setView('login');
    notice('Signed out.', 'ok');
  }

  async function loadAccount() {
    const userId = state.session && state.session.user && state.session.user.id;
    const { data, error } = await state.client
      .from('customer_accounts')
      .select('id,customer_code,display_name,email,status')
      .eq('auth_user_id', userId)
      .eq('status', 'active')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('This login is not connected to an active Highway 38 customer account.');
    state.account = data;
    byId('customerName').textContent = data.display_name || data.customer_code || 'Customer';
    byId('customerCode').textContent = data.customer_code || '';
  }

  async function queryOwn(table, columns, orderColumn) {
    let request = state.client.from(table).select(columns).eq('customer_id', state.account.id);
    if (orderColumn) request = request.order(orderColumn, { ascending: false });
    const { data, error } = await request;
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  function renderJobs(rows) {
    byId('jobsList').innerHTML = rows.length ? rows.map(row => `
      <article class="portal-item">
        <div><strong>${esc(row.job_number || row.title || 'Project')}</strong><span>${esc(row.title || '')}</span></div>
        <div><span class="portal-pill">${esc(row.status || 'Open')}</span><span>${esc(row.next_action || 'No next action posted')}</span></div>
        <progress max="100" value="${Math.max(0, Math.min(100, Number(row.progress_percent || 0)))}"></progress>
      </article>`).join('') : '<p class="portal-empty">No active projects are posted.</p>';
  }

  function renderQuotes(rows) {
    byId('quotesList').innerHTML = rows.length ? rows.map(row => `
      <article class="portal-item">
        <div><strong>${esc(row.quote_number || row.title || 'Quote')}</strong><span>${esc(row.title || '')}</span></div>
        <div><strong>${money(row.amount)}</strong><span class="portal-pill">${esc(row.status || 'Draft')}</span></div>
        ${row.status === 'presented' && !row.customer_decision ? `<button class="btn btn-primary" type="button" data-approve-quote="${esc(row.id)}" data-version="${Number(row.version || 1)}">Approve selected quote</button>` : `<span>${esc(row.customer_decision ? 'Customer decision: ' + row.customer_decision : '')}</span>`}
      </article>`).join('') : '<p class="portal-empty">No quotes are available.</p>';
    byId('quotesList').querySelectorAll('[data-approve-quote]').forEach(button => {
      button.addEventListener('click', () => approveQuote(button.dataset.approveQuote, Number(button.dataset.version)));
    });
  }

  function renderInvoices(rows) {
    byId('invoicesList').innerHTML = rows.length ? rows.map(row => `
      <article class="portal-item">
        <div><strong>${esc(row.invoice_number || 'Invoice')}</strong><span>Due ${esc(row.due_date || 'not posted')}</span></div>
        <div><strong>${money(row.balance_due)}</strong><span class="portal-pill">${esc(row.status || 'Open')}</span></div>
        ${row.hosted_payment_url ? `<a class="btn" href="${esc(row.hosted_payment_url)}" target="_blank" rel="noopener noreferrer">Open hosted payment</a>` : ''}
      </article>`).join('') : '<p class="portal-empty">No invoices are available.</p>';
  }

  function renderFiles(rows) {
    byId('filesList').innerHTML = rows.length ? rows.map(row => `
      <article class="portal-item">
        <div><strong>${esc(row.file_name || 'File')}</strong><span>${esc(row.status || '')}</span></div>
        <button class="btn" type="button" data-download-path="${esc(row.storage_path)}">Download</button>
      </article>`).join('') : '<p class="portal-empty">No customer files are available.</p>';
    byId('filesList').querySelectorAll('[data-download-path]').forEach(button => {
      button.addEventListener('click', () => downloadFile(button.dataset.downloadPath));
    });
  }

  async function approveQuote(quoteId, version) {
    if (!confirm('Approve only this selected quote? This records your decision but does not charge a card or send an automatic message.')) return;
    const { data, error } = await state.client.rpc('customer_portal_approve_quote', {
      p_quote_id: quoteId,
      p_expected_version: version
    });
    if (error) throw error;
    notice('<b>Quote approval recorded.</b> Highway 38 will review the selected quote before any next action.', 'ok');
    await refreshDashboard();
    return data;
  }

  async function downloadFile(storagePath) {
    const { data, error } = await state.client.storage
      .from(config.storageBucket || 'customer-portal')
      .createSignedUrl(storagePath, 120, { download: true });
    if (error) throw error;
    if (!data || !data.signedUrl) throw new Error('A secure download URL was not created.');
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function submitMessage(event) {
    event.preventDefault();
    const body = String(byId('messageBody').value || '').trim();
    if (!body) return notice('Enter a message first.', 'bad');
    if (body.length > 2000) return notice('Messages are limited to 2,000 characters.', 'bad');
    const { error } = await state.client.from('customer_messages').insert({
      customer_id: state.account.id,
      body,
      direction: 'customer_to_business',
      status: 'pending_owner_review'
    });
    if (error) throw error;
    byId('messageBody').value = '';
    notice('<b>Message recorded.</b> No automatic text or email was sent. Highway 38 will review it.', 'ok');
  }

  async function refreshDashboard() {
    notice('Loading your customer records…', '');
    const [jobs, quotes, invoices, files] = await Promise.all([
      queryOwn('customer_jobs', 'id,job_number,title,status,next_action,due_date,progress_percent', 'updated_at'),
      queryOwn('customer_quotes', 'id,quote_number,title,amount,status,version,customer_decision,decision_at', 'updated_at'),
      queryOwn('customer_invoices', 'id,invoice_number,total,balance_due,status,due_date,hosted_payment_url', 'updated_at'),
      queryOwn('customer_files', 'id,file_name,storage_path,status,available_to_customer', 'updated_at')
    ]);
    renderJobs(jobs);
    renderQuotes(quotes);
    renderInvoices(invoices);
    renderFiles(files.filter(row => row.available_to_customer === true));
    byId('metricJobs').textContent = jobs.filter(row => !/complete|cancel/i.test(row.status || '')).length;
    byId('metricQuotes').textContent = quotes.filter(row => row.status === 'presented' && !row.customer_decision).length;
    byId('metricBalance').textContent = money(invoices.reduce((sum, row) => sum + Number(row.balance_due || 0), 0));
    notice('<b>Secure portal loaded.</b> Supabase Auth and Row Level Security limit this session to the connected customer account.', 'ok');
  }

  async function applySession(session) {
    state.session = session;
    if (!session) {
      setView('login');
      return;
    }
    setView('app');
    await loadAccount();
    await refreshDashboard();
  }

  async function boot() {
    try {
      if (!initClient()) return;
      byId('loginForm').addEventListener('submit', event => sendMagicLink(event).catch(safeError));
      byId('signOutButton').addEventListener('click', () => signOut().catch(safeError));
      byId('refreshPortal').addEventListener('click', () => refreshDashboard().catch(safeError));
      byId('messageForm').addEventListener('submit', event => submitMessage(event).catch(safeError));
      const { data, error } = await state.client.auth.getSession();
      if (error) throw error;
      await applySession(data.session);
      state.client.auth.onAuthStateChange((_event, session) => {
        applySession(session).catch(safeError);
      });
    } catch (error) {
      safeError(error);
      setView(configured() ? 'login' : 'hold');
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
