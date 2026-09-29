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
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const secret = await admin.from("h38_internal_job_secrets").select("secret_value")
      .eq("name", "penny-nightly").maybeSingle();
    if (secret.error || !secret.data?.secret_value || supplied !== text(secret.data.secret_value)) {
      return new Response(JSON.stringify({ error: "WORKER_AUTH_REQUIRED" }), { status: 401, headers });
    }

    const r = await fetch(`${url}/functions/v1/h38-deal-engine-market-refresh`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${service}`,
        apikey: anon,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ limit: 6, source: "secure_cron_bridge" }),
      signal: AbortSignal.timeout(70000),
    });
    const body = await r.text().catch(() => "");
    return new Response(body || JSON.stringify({ ok: r.ok, status: r.status }), { status: r.status, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: "MARKET_REFRESH_CRON_ERROR", detail: e instanceof Error ? e.message : String(e) }), { status: 500, headers });
  }
});
