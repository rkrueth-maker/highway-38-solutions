// h38-task-complete — token-based task completion for external recipients.
//
// PUBLIC endpoint (verify_jwt = false). Accepts an anonymous completion token
// (a per-task secret minted by the Office Send Task flow) and allows exactly
// one capability: viewing and completing THAT task. No other records are
// readable or writable. The token is a high-entropy secret sent only to the
// recipient via the owner's own text/email.
//
// Actions:
//   GET  ?action=view&token=<token>     -> safe display fields for the task
//   POST ?action=complete&token=<token> -> marks the task Completed
//
// Abuse controls: per-IP in-memory rate limit, strict token format, generic
// client errors; internals logged server-side only.
//
// DEPLOYMENT (coordinator): deploy this function and add to supabase/config.toml:
//   [functions.h38-task-complete]
//   verify_jwt = false

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://highway38solutions.com",
  "https://www.highway38solutions.com",
  "https://rkrueth-maker.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

const TASKS_COLLECTION = "tasks";
const TOKEN_FIELD = "Completion Token";

// Rate limit: max requests per IP per window. In-memory per isolate —
// defense in depth, not a hard guarantee.
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const rateHits = new Map<string, number[]>();

// Tokens are minted as newId('TOKEN') -> "TOKEN-<UUID>". Accept that shape
// plus bare UUIDs, so older/newer minters keep working.
const TOKEN_RE =
  /^(TOKEN-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cors(origin: string | null): Record<string, string> {
  const o =
    origin && ALLOWED_ORIGINS.has(origin)
      ? origin
      : "https://highway38solutions.com";
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
}

function json(
  status: number,
  body: unknown,
  headers: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (rateHits.get(ip) || []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );
  hits.push(now);
  rateHits.set(ip, hits);
  return hits.length > RATE_LIMIT_MAX;
}

function serviceClient(): any {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) throw new Error("server_misconfigured");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type TaskRow = {
  id: string;
  business_id: string;
  record_key: string;
  payload: Record<string, any>;
};

async function findTask(sb: any, token: string): Promise<TaskRow | null> {
  const { data, error } = await sb
    .from("business_records")
    .select("id,business_id,record_key,payload")
    .eq("collection", TASKS_COLLECTION)
    .eq("record_status", "active")
    .eq(`payload->>'${TOKEN_FIELD}'`, token)
    .maybeSingle();
  if (error) throw error;
  return (data as TaskRow | null) || null;
}

function isDone(payload: Record<string, any>): boolean {
  return /^(COMPLETE|COMPLETED|DONE)$/i.test(String(payload["Status"] || ""));
}

function safeView(row: TaskRow): Record<string, any> {
  const p = row.payload || {};
  return {
    title: String(p["Task Title"] || "Untitled task"),
    linkUrl: String(p["Link URL"] || ""),
    due: String(p["Due Time"] || ""),
    senderName: String(p["Sent By Name"] || ""),
    businessName: String(p["Business Name"] || "Highway 38 Solutions"),
    status: String(p["Status"] || "Open"),
    alreadyDone: isDone(p),
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  const headers = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return json(204, {}, headers);

  const ip = clientIp(req);
  if (rateLimited(ip)) {
    return json(429, { ok: false, error: "Too many requests. Try again soon." }, headers);
  }

  const url = new URL(req.url);
  let action = url.searchParams.get("action") || "";
  let token = url.searchParams.get("token") || "";
  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (body && typeof body.action === "string") action = body.action;
      if (body && typeof body.token === "string" && !token) token = body.token;
    } catch {
      // ignore malformed bodies; GET params still apply
    }
  }
  token = token.trim();
  if (!TOKEN_RE.test(token)) {
    return json(400, { ok: false, error: "This task link is not valid." }, headers);
  }

  let sb: any;
  try {
    sb = serviceClient();
  } catch {
    console.error("[h38-task-complete] missing service credentials");
    return json(500, { ok: false, error: "The task service is unavailable." }, headers);
  }

  try {
    const row = await findTask(sb, token);
    if (!row) {
      return json(404, { ok: false, error: "This task link is not valid. It may have been cancelled." }, headers);
    }

    if (action === "view") {
      return json(200, { ok: true, task: safeView(row) }, headers);
    }

    if (action === "complete") {
      const p = row.payload || {};
      if (isDone(p)) {
        return json(200, { ok: true, alreadyDone: true, task: safeView(row) }, headers);
      }
      const now = new Date().toISOString();
      const next = {
        ...p,
        Status: "Completed",
        "Completed At": now,
        "Viewed At": p["Viewed At"] || now,
        "Updated Time": now,
        "Record Version": Math.max(1, Number(p["Record Version"]) || 0) + 1,
      };
      const { error } = await sb
        .from("business_records")
        .update({ payload: next, updated_at: now })
        .eq("id", row.id)
        .eq("record_status", "active");
      if (error) throw error;
      console.log("[h38-task-complete] completed", row.record_key);
      return json(200, { ok: true, task: safeView({ ...row, payload: next }) }, headers);
    }

    return json(400, { ok: false, error: "Unknown action." }, headers);
  } catch (e) {
    console.error("[h38-task-complete] error", e);
    return json(500, { ok: false, error: "The task service hit a problem. Try again." }, headers);
  }
});
