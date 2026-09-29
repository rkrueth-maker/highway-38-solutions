import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const headers = { "Content-Type": "application/json" };
const text = (v: unknown) => String(v ?? "").trim();

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST_REQUIRED" }), { status: 405, headers });
  try {
    const supplied = text(req.headers.get("x-h38-nightly-key"));
    if (!supplied) return new Response(JSON.stringify({ error: "WORKER_AUTH_REQUIRED" }), { status: 401, headers });

    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const secret = await admin.from("h38_internal_job_secrets").select("secret_value")
      .eq("name", "penny-nightly").maybeSingle();
    if (secret.error || !secret.data?.secret_value || supplied !== text(secret.data.secret_value)) {
      return new Response(JSON.stringify({ error: "WORKER_AUTH_REQUIRED" }), { status: 401, headers });
    }

    const invoke = async (slug: string, body: unknown) => {
      try {
        const r = await fetch(`${url}/functions/v1/${slug}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${service}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(70000),
        });
        const raw = await r.text().catch(() => "");
        let data: any = raw;
        try { data = raw ? JSON.parse(raw) : null; } catch {}
        return { ok: r.ok, status: r.status, data };
      } catch (e) {
        return { ok: false, status: 598, data: { error: e instanceof Error ? e.message : String(e) } };
      }
    };

    const [ebay, auction] = await Promise.all([
      invoke("h38-deal-engine-market-refresh", { limit: 6, source: "secure_cron_bridge" }),
      invoke("h38-deal-engine-auction-comp-refresh", { limit: 6, source: "secure_cron_bridge" }),
    ]);

    return new Response(JSON.stringify({
      ok: ebay.ok && auction.ok,
      providers: { ebay_public_index: ebay, hibid_public_index: auction },
    }), { status: ebay.ok && auction.ok ? 200 : 207, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: "MARKET_REFRESH_CRON_ERROR", detail: e instanceof Error ? e.message : String(e) }), { status: 500, headers });
  }
});
