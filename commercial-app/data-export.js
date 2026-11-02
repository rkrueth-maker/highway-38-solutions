(function () {
  'use strict';
  // H38 one-click full data export (Wave 3 ADD #12): the owner downloads every
  // record for the current business as one JSON file — "your data, out, in one
  // click, any time." Read-only: pages business_records straight from Supabase
  // with the signed-in user's own session (RLS applies), groups by collection.
  const BUILD = '20261101-wave3e-2';
  const text = v => String(v == null ? '' : v).trim();
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function client() {
    const cfg = window.H38_BUSINESS_OFFICE_SUPABASE || {};
    if (!window.supabase || !cfg.url || !cfg.publishableKey) return null;
    return window.supabase.createClient(cfg.url, cfg.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
      global: { headers: { 'x-client-info': 'h38-data-export' } }
    });
  }

  function businessName() {
    const snap = window.state && window.state.snapshot || {};
    const profile = (snap.businessProfile || [])[0] || {};
    return text(profile['Business Name'] || profile.Name || snap.businessName || 'business');
  }

  async function fetchAllRecords(db, businessId) {
    const PAGE = 1000;
    const rows = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db.from('business_records')
        .select('collection,record_key,payload,record_status,created_at,updated_at')
        .eq('business_id', businessId)
        .order('collection', { ascending: true })
        .order('record_key', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message || 'Export query failed.');
      (data || []).forEach(r => rows.push(r));
      if (!data || data.length < PAGE) break;
    }
    return rows;
  }

  async function downloadAll(button) {
    const businessId = text(window.state && window.state.businessId);
    if (!businessId) { if (typeof toast === 'function') toast('No business selected yet.', true); return; }
    const db = client();
    if (!db) { if (typeof toast === 'function') toast('Export is unavailable right now.', true); return; }
    const original = button ? button.textContent : '';
    if (button) { button.disabled = true; button.textContent = 'Preparing your export…'; }
    try {
      const session = await db.auth.getSession();
      if (!session || !session.data || !session.data.session) throw new Error('Sign in again before exporting.');
      const rows = await fetchAllRecords(db, businessId);
      const collections = {};
      rows.forEach(r => {
        const name = text(r.collection) || 'records';
        if (!collections[name]) collections[name] = [];
        collections[name].push({ recordKey: r.record_key, status: r.record_status, createdAt: r.created_at, updatedAt: r.updated_at, data: r.payload });
      });
      const profileRow = rows.find(r => text(r.collection) === 'businessProfile');
      const name = text(profileRow && profileRow.payload && (profileRow.payload['Business Name'] || profileRow.payload.Name)) || businessName();
      const payload = {
        exportFormat: 'h38-business-data-export-v1',
        exportedAt: new Date().toISOString(),
        businessId,
        businessName: name,
        recordCount: rows.length,
        collectionCounts: Object.fromEntries(Object.entries(collections).map(([k, v]) => [k, v.length])),
        collections
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'business';
      a.href = url;
      a.download = 'h38-data-export-' + slug + '-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      if (typeof toast === 'function') toast('Export downloaded: ' + rows.length + ' records for ' + name + '.');
      const status = document.getElementById('dataExportStatus');
      if (status) status.textContent = 'Last export: ' + rows.length + ' records, ' + new Date().toLocaleString() + '.';
    } catch (err) {
      if (typeof toast === 'function') toast('Export failed: ' + (err && err.message || err), true);
    } finally {
      if (button) { button.disabled = false; button.textContent = original; }
    }
  }

  function render() {
    const mount = document.getElementById('dataExportSection');
    if (!mount || mount.dataset.h38ExportBound === '1') return;
    mount.dataset.h38ExportBound = '1';
    mount.innerHTML = '<p class="muted small">Your data is yours. Download everything for this business — customers, jobs, quotes, invoices, payments, all of it — as one file, any time. No charge, no waiting on us.</p>'
      + '<div class="actions"><button type="button" id="dataExportButton">⬇ Download all my data</button></div>'
      + '<p class="muted small" id="dataExportStatus"></p>';
    const button = document.getElementById('dataExportButton');
    if (button) button.onclick = () => downloadAll(button);
  }

  window.H38DataExport = { render, downloadAll, BUILD };
})();
