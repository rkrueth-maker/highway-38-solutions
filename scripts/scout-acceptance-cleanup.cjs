const BASE = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY;
const EMAIL = process.env.SCOUT_EMAIL;
const PASSWORD = process.env.SCOUT_PASSWORD;

function need(v, name) {
  if (!v) throw new Error('Missing ' + name);
  return v;
}

async function session() {
  const r = await fetch(need(BASE, 'SUPABASE_URL') + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: need(KEY, 'SUPABASE_KEY') },
    body: JSON.stringify({ email: need(EMAIL, 'SCOUT_EMAIL'), password: need(PASSWORD, 'SCOUT_PASSWORD') }),
  });
  const raw = await r.text();
  if (!r.ok) throw new Error('QA cleanup auth failed HTTP ' + r.status + ' ' + raw.slice(0, 300));
  return JSON.parse(raw);
}

async function rest(s, method, table, params) {
  const q = new URLSearchParams(params);
  const r = await fetch(BASE + '/rest/v1/' + table + '?' + q.toString(), {
    method,
    headers: {
      apikey: KEY,
      authorization: 'Bearer ' + s.access_token,
      Prefer: method === 'DELETE' ? 'return=representation' : 'return=representation',
    },
  });
  const raw = await r.text();
  if (!r.ok) throw new Error(method + ' ' + table + ' failed HTTP ' + r.status + ' ' + raw.slice(0, 600));
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

async function del(s, table, params) {
  const rows = await rest(s, 'DELETE', table, params);
  console.log('CLEANED ' + table + ' ' + rows.length);
  return rows.length;
}

async function count(s, table, params) {
  const rows = await rest(s, 'GET', table, { select: 'id', ...params });
  return rows.length;
}

(async () => {
  const s = await session();

  // Acceptance data uses a dedicated namespace. Never delete ordinary user data here.
  // Order mirrored watches before coupon watches so both sides of the test mirror are removed.
  await del(s, 'deal_engine_watch_rules', { query_text: 'ilike.H38 QA%' });
  await del(s, 'deal_engine_sourcing_queue', { notes: 'ilike.H38 QA Engine%' });
  await del(s, 'coupon_watch_rules', { item_name: 'ilike.H38 QA%' });
  await del(s, 'coupon_price_observations', { store: 'eq.QA Store', item_name: 'ilike.H38 QA%' });
  await del(s, 'coupon_receipts', { store: 'eq.QA Store' });
  await del(s, 'coupon_list_items', { item_name: 'ilike.H38 QA%' });

  const leftovers = {
    deal_engine_watch_rules: await count(s, 'deal_engine_watch_rules', { query_text: 'ilike.H38 QA%' }),
    deal_engine_sourcing_queue: await count(s, 'deal_engine_sourcing_queue', { notes: 'ilike.H38 QA Engine%' }),
    coupon_watch_rules: await count(s, 'coupon_watch_rules', { item_name: 'ilike.H38 QA%' }),
    coupon_price_observations: await count(s, 'coupon_price_observations', { store: 'eq.QA Store', item_name: 'ilike.H38 QA%' }),
    coupon_receipts: await count(s, 'coupon_receipts', { store: 'eq.QA Store' }),
    coupon_list_items: await count(s, 'coupon_list_items', { item_name: 'ilike.H38 QA%' }),
  };
  console.log('QA_LEFTOVERS ' + JSON.stringify(leftovers));
  if (Object.values(leftovers).some(Number)) throw new Error('Scout acceptance QA cleanup incomplete');
  console.log('H38_SCOUT_ACCEPTANCE_CLEANUP_PASS');
})().catch(e => {
  console.error(e && e.stack || e);
  process.exitCode = 1;
});
