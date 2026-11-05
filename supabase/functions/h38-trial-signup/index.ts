// h38-trial-signup — public self-serve signup for the 30-day free full trial.
//
// PUBLIC endpoint (verify_jwt = false). Two modes:
//   A) email + password: creates the auth user (auto-confirmed so the owner
//      can sign in immediately), then provisions the trial tenant.
//   B) Google: caller already completed "Sign in with Google" and passes
//      their Supabase JWT in Authorization; the tenant is provisioned onto
//      that identity. Business name is still collected on the signup page.
//
// Provisioning runs through public.provision_trial_business (service role
// only), which copies the fleet-converged standard from the highway38 tenant
// and stamps trial_start / trial_end (+30 days) server-side.
//
// One trial per email: business_trials holds a unique lower(email); a second
// signup with the same email is refused with a clear message, never a silent
// failure. NO card fields exist anywhere in this flow.
//
// Abuse controls mirror h38-public-booking: per-IP in-memory rate limit,
// honeypot field, strict validation with length caps. Internals are logged
// server-side only; clients get plain, specific messages.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://highway38solutions.com",
  "https://www.highway38solutions.com",
  "https://rkrueth-maker.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const rateHits = new Map<string, number[]>();

const MAX = {
  businessName: 120,
  ownerName: 80,
  email: 160,
  password: 128,
  timezone: 64,
} as const;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function cors(origin: string | null): Record<string, string> {
  const o =
    origin && ALLOWED_ORIGINS.has(origin)
      ? origin
      : "https://highway38solutions.com";
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (rateHits.get(ip) || []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );
  if (hits.length >= RATE_LIMIT_MAX) {
    rateHits.set(ip, hits);
    return true;
  }
  hits.push(now);
  rateHits.set(ip, hits);
  return false;
}

function clean(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

function slugBase(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");
  return slug.length >= 2 ? slug : "trial-office";
}

function keySuffix(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function rpcErrorCode(message: string): string {
  const known = [
    "TRIAL_EMAIL_EXISTS",
    "TRIAL_USER_EXISTS",
    "TRIAL_BUSINESS_KEY_TAKEN",
    "TRIAL_BUSINESS_KEY_INVALID",
    "TRIAL_BUSINESS_NAME_REQUIRED",
    "TRIAL_EMAIL_INVALID",
    "TRIAL_TIMEZONE_INVALID",
    "TRIAL_USER_REQUIRED",
    "TRIAL_TEMPLATE_MISSING",
  ];
  return known.find((code) => message.includes(code)) || "PROVISION_FAILED";
}

Deno.serve(async (req: Request): Promise<Response> => {
  const headers = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") {
    return json(405, { ok: false, message: "Method not allowed." }, headers);
  }
  if (rateLimited(clientIp(req))) {
    return json(
      429,
      { ok: false, message: "Too many signups from this connection. Try again in a bit." },
      headers,
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, message: "That request could not be read." }, headers);
  }

  // Honeypot: real visitors never fill this hidden field.
  if (clean(body.website, 200)) {
    return json(400, { ok: false, message: "That request could not be accepted." }, headers);
  }

  const businessName = clean(body.businessName, MAX.businessName);
  const ownerName = clean(body.ownerName, MAX.ownerName);
  const timezone = clean(body.timezone, MAX.timezone) || "America/Chicago";
  if (businessName.length < 2) {
    return json(400, { ok: false, message: "Enter your business name." }, headers);
  }
  if (ownerName.length < 2) {
    return json(400, { ok: false, message: "Enter your name." }, headers);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) {
    console.error("h38-trial-signup: missing Supabase env");
    return json(500, { ok: false, message: "Signup is unavailable right now. Please try again later." }, headers);
  }
  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Resolve the identity: Google mode carries a user JWT; password mode
  // creates the account here.
  let userId = "";
  let email = "";
  let createdUser = false;

  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";

  if (bearer && bearer !== serviceKey) {
    const { data, error } = await service.auth.getUser(bearer);
    if (error || !data?.user) {
      return json(401, { ok: false, message: "That sign-in could not be verified. Sign in again and retry." }, headers);
    }
    userId = data.user.id;
    email = clean(data.user.email, MAX.email).toLowerCase();
    if (!email) {
      return json(400, { ok: false, message: "Your Google account did not share an email address." }, headers);
    }
  } else {
    email = clean(body.email, MAX.email).toLowerCase();
    const password = String(body.password ?? "");
    if (!EMAIL_RE.test(email)) {
      return json(400, { ok: false, message: "Enter a valid email address." }, headers);
    }
    if (password.length < 8 || password.length > MAX.password) {
      return json(400, { ok: false, message: "Password must be at least 8 characters." }, headers);
    }

    // One trial per email — checked before any account is created.
    const { data: existingTrial } = await service
      .from("business_trials")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    if (existingTrial) {
      return json(
        409,
        { ok: false, code: "TRIAL_EMAIL_EXISTS", message: "This email already has a trial. Sign in to your Office — your trial and your data are right where you left them." },
        headers,
      );
    }

    const { data: created, error: createError } =
      await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: ownerName, source: "trial-signup" },
      });
    if (createError || !created?.user) {
      const msg = String(createError?.message || "");
      if (/already.*(registered|exists)/i.test(msg) || createError?.code === "email_exists") {
        return json(
          409,
          { ok: false, code: "ACCOUNT_EXISTS", message: "This email already has an Office account. Sign in instead — one trial per email." },
          headers,
        );
      }
      console.error("h38-trial-signup: createUser failed:", msg);
      return json(500, { ok: false, message: "The account could not be created. Please try again." }, headers);
    }
    userId = created.user.id;
    createdUser = true;
  }

  // Provision the trial tenant. Retry only on a generated-key collision.
  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const businessKey = `${slugBase(businessName)}-${keySuffix()}`;
    const { data, error } = await service.rpc("provision_trial_business", {
      p_auth_user_id: userId,
      p_business_key: businessKey,
      p_business_name: businessName,
      p_owner_name: ownerName,
      p_owner_email: email,
      p_timezone: timezone,
    });
    if (!error && data?.status === "PASS") {
      return json(
        200,
        {
          ok: true,
          businessKey: data.businessKey,
          businessId: data.businessId,
          trialEnd: data.trialEnd,
        },
        headers,
      );
    }
    lastError = String(error?.message || "provisioning failed");
    const code = rpcErrorCode(lastError);
    if (code !== "TRIAL_BUSINESS_KEY_TAKEN") {
      // Roll back a just-created password account so the email stays usable
      // for a corrected retry instead of leaving an orphaned login behind.
      if (createdUser) {
        await service.auth.admin.deleteUser(userId).catch(() => {});
      }
      if (code === "TRIAL_EMAIL_EXISTS" || code === "TRIAL_USER_EXISTS") {
        return json(
          409,
          { ok: false, code, message: "This email already has a trial. Sign in to your Office — your trial and your data are right where you left them." },
          headers,
        );
      }
      console.error("h38-trial-signup: provisioning failed:", code, lastError);
      return json(500, { ok: false, message: "Your Office could not be set up. Please try again." }, headers);
    }
  }

  if (createdUser) {
    await service.auth.admin.deleteUser(userId).catch(() => {});
  }
  console.error("h38-trial-signup: key collision retries exhausted");
  return json(500, { ok: false, message: "Your Office could not be set up. Please try again." }, headers);
});
