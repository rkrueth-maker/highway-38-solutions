import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type",
  "content-type": "application/json",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

async function invoke(
  url: string,
  anon: string,
  auth: string,
  slug: string,
  body: unknown,
) {
  const r = await fetch(`${url}/functions/v1/${slug}`, {
    method: "POST",
    headers: {
      Authorization: auth,
      apikey: anon,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { ok: r.ok, status: r.status, text, data };
}

function savedCandidate(row: any) {
  return {
    ...row,
    id: row.canonical_key,
    verification_status: "SAVED DEAL · NEEDS SOLD COMPS",
    stage: "needs_comp",
    profit_verified: false,
    reason: "Current acquisition price is saved; verify sold comps, fees and local availability before buying.",
  };
}

async function loadSaved(admin: any, limit = 80) {
  const q = await admin
    .from("reseller_hunt_cache")
    .select("canonical_key,retailer,title,upc,sku,buy_price,retail_price,image_url,source_url,deal_type,penny_sort_at")
    .eq("active", true)
    .gt("buy_price", 0)
    .order("penny_sort_at", { ascending: false })
    .limit(limit);
  return { rows: (q.data || []).map(savedCandidate), error: q.error };
}

function normalizeRadius(payload: Record<string, any>) {
  const raw = Number(payload.radiusMiles ?? payload.radius_miles ?? payload.radius ?? 50);
  const radius = Number.isFinite(raw) && raw > 0 ? Math.max(1, Math.min(150, raw)) : 50;
  payload.radiusMiles = radius;
  payload.radius_miles = radius;
  payload.radius = radius;
}

function locationLabel(location: any) {
  return [location?.city, location?.state_code || location?.state, location?.zip || location?.postal]
    .filter(Boolean)
    .join(", ");
}

async function reverseLocation(lat: number, lon: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}`,
      {
        headers: {
          "user-agent": "H38Resale/1.0 (+https://highway38solutions.com)",
          accept: "application/json",
        },
        signal: AbortSignal.timeout(7000),
      },
    );
    const p = await r.json().catch(() => ({}));
    if (!r.ok) return null;
    const a = (p as any)?.address || {};
    const city = String(a.city || a.town || a.village || a.hamlet || a.county || "").trim();
    const state = String(a.state || "").trim();
    const stateCode = String(a["ISO3166-2-lvl4"] || "").split("-").pop() || "";
    const zip = String(a.postcode || "").match(/\b\d{5}\b/)?.[0] || "";
    return { city, state, state_code: stateCode, zip, postal: zip };
  } catch {
    return null;
  }
}

async function normalizeLocation(
  payload: Record<string, any>,
  url: string,
  anon: string,
  auth: string,
) {
  normalizeRadius(payload);
  const zip = String(payload.postal || payload.zip || "").match(/\b\d{5}\b/)?.[0] || "";
  if (zip) {
    payload.postal = zip;
    payload.zip = zip;
  }

  let lat = Number(payload.lat);
  let lon = Number(payload.lon);
  if ((!Number.isFinite(lat) || !Number.isFinite(lon)) && zip) {
    const geo = await invoke(url, anon, auth, "reseller-location-geocode", { zip });
    const location = (geo.data as any)?.location;
    if (geo.ok && location) {
      Object.assign(payload, location);
      lat = Number(location.lat);
      lon = Number(location.lon);
      payload.postal = location.zip || zip;
      payload.zip = location.zip || zip;
      payload.location_label = locationLabel(location);
      payload.locationLabel = payload.location_label;
    }
  }

  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    payload.lat = lat;
    payload.lon = lon;
    if (!String(payload.location_label || payload.locationLabel || "").trim()) {
      const rev = await reverseLocation(lat, lon);
      if (rev) {
        Object.assign(payload, rev);
        if (rev.zip) {
          payload.postal = rev.zip;
          payload.zip = rev.zip;
        }
        payload.location_label = locationLabel(rev);
        payload.locationLabel = payload.location_label;
      }
    }
  }
  return payload;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "AUTH_REQUIRED" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error } = await sb.auth.getUser(token);
    if (error || !user) return json({ error: "AUTH_REQUIRED" }, 401);

    const { data: ent } = await sb
      .from("h38_product_entitlements")
      .select("active,expires_at")
      .eq("user_id", user.id)
      .eq("product_key", "resale")
      .maybeSingle();
    if (!ent?.active || (ent.expires_at && Date.parse(ent.expires_at) <= Date.now()))
      return json({ error: "PRODUCT_LOCKED", product: "resale" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "deals");
    const payload: Record<string, any> = { ...(body.payload || {}) };
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

    if (action === "saved") {
      const saved = await loadSaved(admin, 80);
      if (saved.error)
        return json({ error: "SAVED_DEALS_UNAVAILABLE", detail: saved.error.message }, 500);
      return json({
        ok: true,
        product: "resale",
        source: "h38_shared_deal_cache",
        data: {
          candidates: saved.rows,
          candidate_count: saved.rows.length,
          saved_only: true,
          warning: "Saved H38 buy leads are shown without starting a live marketplace scan. Verify sold comps, fees and local availability before buying.",
        },
      });
    }

    await normalizeLocation(payload, url, anon, auth);

    if (action === "stores") {
      if (!Number.isFinite(Number(payload.lat)) || !Number.isFinite(Number(payload.lon))) {
        return json({
          ok: true,
          product: "resale",
          source: "reseller-nearby-stores-v262",
          data: { status: "PARTIAL", stores: [], warning: "Enter a valid ZIP or use phone location before finding nearby stores." },
        });
      }
      const nearby = await invoke(url, anon, auth, "reseller-nearby-stores-v262", payload);
      if (nearby.ok) return json({ ok: true, product: "resale", source: "reseller-nearby-stores-v262", data: nearby.data });
      return json({ error: "SOURCE_UNAVAILABLE", detail: `reseller-nearby-stores-v262:${nearby.status}:${nearby.text.slice(0, 250)}` }, 502);
    }

    const map: Record<string, string> = {
      deals: "reseller-opportunity-scan-v060",
      facebook: "reseller-facebook-public-v240",
      auctions: "reseller-auction-search-v230",
      garage: "reseller-garage-sales-v308",
    };
    const slug = map[action];
    if (!slug) return json({ error: "UNKNOWN_ACTION" }, 400);

    let facebookMeta: Record<string, any> | null = null;
    if (action === "deals") {
      const fb = await invoke(url, anon, auth, "reseller-facebook-public-v240", payload);
      if (fb.ok && fb.data && typeof fb.data === "object") {
        const fd = fb.data as Record<string, any>;
        const facebookCandidates = [
          ...(Array.isArray(fd.results) ? fd.results : []),
          ...(Array.isArray(fd.candidates) ? fd.candidates : []),
        ];
        if (facebookCandidates.length) payload.facebookCandidates = facebookCandidates;
        facebookMeta = {
          provider_status: fd.provider_status || fd.status || "UNKNOWN",
          verified_count: Array.isArray(fd.results) ? fd.results.length : 0,
          candidate_count: Array.isArray(fd.candidates) ? fd.candidates.length : 0,
          raw_public_candidates: Number(fd.raw_public_candidates || 0),
          warnings: Array.isArray(fd.warnings) ? fd.warnings.slice(0, 4) : [],
        };
      } else {
        facebookMeta = { provider_status: "UNAVAILABLE", verified_count: 0, candidate_count: 0 };
      }
    }

    const result = await invoke(url, anon, auth, slug, payload);
    if (result.ok) {
      const data = (result.data && typeof result.data === "object" ? result.data : {}) as Record<string, any>;
      if (facebookMeta) data.facebook_source = facebookMeta;
      data.location_used = {
        zip: payload.zip || payload.postal || null,
        location_label: payload.location_label || payload.locationLabel || null,
        radius_miles: payload.radiusMiles,
        coordinates_available: Number.isFinite(Number(payload.lat)) && Number.isFinite(Number(payload.lon)),
      };
      const hasRows = [data.opportunities, data.candidates, data.auction_candidates]
        .some((rows: any) => Array.isArray(rows) && rows.length);
      if (action === "deals" && !hasRows) {
        const saved = await loadSaved(admin, 80);
        if (!saved.error && saved.rows.length) {
          data.candidates = saved.rows;
          data.candidate_count = saved.rows.length;
          data.fallback_source = "h38_shared_deal_cache";
          data.warning = "Live marketplace scan returned no rows, so current saved deals are shown for resale review.";
        }
      }
      return json({ ok: true, product: "resale", source: slug, data });
    }
    return json({ error: "SOURCE_UNAVAILABLE", detail: `${slug}:${result.status}:${result.text.slice(0, 250)}` }, 502);
  } catch (e) {
    return json({ error: "RESALE_API_ERROR", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});
