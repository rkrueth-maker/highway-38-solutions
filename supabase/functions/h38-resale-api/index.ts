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
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { ok: r.ok, status: r.status, text, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") || "",
      token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "AUTH_REQUIRED" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!,
      anon = Deno.env.get("SUPABASE_ANON_KEY")!,
      service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(url, anon, {
      global: { headers: { Authorization: auth } },
    });
    const {
      data: { user },
      error,
    } = await sb.auth.getUser(token);
    if (error || !user) return json({ error: "AUTH_REQUIRED" }, 401);
    const { data: ent } = await sb
      .from("h38_product_entitlements")
      .select("active,expires_at")
      .eq("user_id", user.id)
      .eq("product_key", "resale")
      .maybeSingle();
    if (
      !ent?.active ||
      (ent.expires_at && Date.parse(ent.expires_at) <= Date.now())
    )
      return json({ error: "PRODUCT_LOCKED", product: "resale" }, 403);
    const body = await req.json().catch(() => ({})),
      action = String(body.action || "deals"),
      payload = { ...(body.payload || {}) };
    if (action === "stores") {
      if (
        !Number.isFinite(Number(payload.lat)) ||
        !Number.isFinite(Number(payload.lon))
      ) {
        const geo = await invoke(url, anon, auth, "reseller-location-geocode", {
          postal: payload.postal || payload.zip,
        });
        const location = (geo.data as any)?.location;
        if (!geo.ok || !location)
          return json({
            ok: true,
            product: "resale",
            source: "reseller-nearby-stores-v262",
            data: {
              status: "PARTIAL",
              stores: [],
              warning:
                "Enter a valid ZIP or use phone location before finding nearby stores.",
            },
          });
        Object.assign(payload, location, {
          location_label: [location.city, location.state_code, location.zip]
            .filter(Boolean)
            .join(", "),
        });
      }
      const nearby = await invoke(
        url,
        anon,
        auth,
        "reseller-nearby-stores-v262",
        payload,
      );
      if (nearby.ok)
        return json({
          ok: true,
          product: "resale",
          source: "reseller-nearby-stores-v262",
          data: nearby.data,
        });
      return json(
        {
          error: "SOURCE_UNAVAILABLE",
          detail: `reseller-nearby-stores-v262:${nearby.status}:${nearby.text.slice(0, 250)}`,
        },
        502,
      );
    }
    const map: Record<string, string> = {
      deals: "reseller-opportunity-scan-v060",
      facebook: "reseller-facebook-public-v240",
      auctions: "reseller-auction-search-v230",
      garage: "reseller-garage-sales-v308",
    };
    const slug = map[action];
    if (!slug) return json({ error: "UNKNOWN_ACTION" }, 400);
    const result = await invoke(url, anon, auth, slug, payload);
    if (result.ok) {
      const data = (
        result.data && typeof result.data === "object" ? result.data : {}
      ) as Record<string, any>;
      const hasRows =
        [data.opportunities, data.candidates, data.auction_candidates].some(
          Array.isArray,
        ) &&
        [data.opportunities, data.candidates, data.auction_candidates].some(
          (rows: any) => Array.isArray(rows) && rows.length,
        );
      if (action === "deals" && !hasRows) {
        const admin = createClient(url, service, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: cached, error: cacheError } = await admin
          .from("reseller_hunt_cache")
          .select(
            "canonical_key,retailer,title,upc,sku,buy_price,retail_price,image_url,source_url,deal_type,penny_sort_at",
          )
          .eq("active", true)
          .gt("buy_price", 0)
          .order("penny_sort_at", { ascending: false })
          .limit(80);
        if (!cacheError && cached?.length) {
          data.candidates = cached.map((row: any) => ({
            ...row,
            id: row.canonical_key,
            verification_status: "SAVED DEAL · NEEDS SOLD COMPS",
            stage: "needs_comp",
            profit_verified: false,
            reason:
              "Current acquisition price is saved; verify sold comps, fees and local availability before buying.",
          }));
          data.candidate_count = data.candidates.length;
          data.fallback_source = "h38_shared_deal_cache";
          data.warning =
            "Live marketplace scan returned no rows, so current saved deals are shown for resale review.";
        }
      }
      return json({ ok: true, product: "resale", source: slug, data });
    }
    return json(
      {
        error: "SOURCE_UNAVAILABLE",
        detail: `${slug}:${result.status}:${result.text.slice(0, 250)}`,
      },
      502,
    );
  } catch (e) {
    return json(
      {
        error: "RESALE_API_ERROR",
        detail: e instanceof Error ? e.message : String(e),
      },
      500,
    );
  }
});
