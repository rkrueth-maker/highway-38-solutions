import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// H38 Recommended Vendors — phase 1 (Highway 38-curated partners for everyone).
//
// Canonical store: business_records in the Highway 38 tenant.
//   collection "partnerVendors"     — curated partner listings Ricky approves.
//   collection "vendorApplications" — partner applications awaiting review.
// This function is the only cross-tenant read path for the curated list:
//   POST {action:"list", businessId} + user JWT → active partners, only for an
//     active member of a business that turned Recommended Vendors ON in Owner
//     Controls (business_module_settings module_key "recommended_vendors").
//     Test listings stay visible only inside the Build Sandbox tenant.
//   POST {action:"publicList", businessId} (anonymous) → {enabled, partners}
//     for the optional tenant-website "Recommended local pros" block. A
//     business only gets partners back when its owner turned the feature ON;
//     test listings never appear on public websites.
//   POST {action:"apply", ...} (anonymous) → stores one application in the
//     Highway 38 tenant for Ricky's review. Nobody is listed automatically,
//     and no email or external action is ever triggered here.
//   POST {action:"applications"} + Highway 38 owner/admin JWT → pending
//     applications for review.
//   POST {action:"decide", applicationId, decision} + Highway 38 owner/admin
//     JWT → "approve" lists the partner; "pass" marks it not listed.
const BUILD = "20261007-vendor-directory-2";
const H38_BUSINESS_ID = "10b85a89-5834-436d-95b0-c6ee2eb335ad";
const BUILD_SANDBOX_BUSINESS_ID = "d44d32de-dd95-4f6e-81e8-ff5592979d68";
const MODULE_KEY = "recommended_vendors";
const PARTNER_COLLECTION = "partnerVendors";
const APPLICATION_COLLECTION = "vendorApplications";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const ALLOWED_ORIGINS = new Set([
  "https://highway38solutions.com",
  "https://www.highway38solutions.com",
  "https://rkrueth-maker.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

// Abuse controls: per-IP in-memory rate limit (defense in depth alongside the
// tenant gates; same posture as h38-public-booking).
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const rateHits = new Map<string, number[]>();
function rateLimited(req: Request): boolean {
  const ip =
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";
  const now = Date.now();
  const hits = (rateHits.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  hits.push(now);
  rateHits.set(ip, hits);
  return hits.length > RATE_LIMIT_MAX;
}

type Json = Record<string, unknown>;

function clean(v: unknown, max = 1000): string {
  return String(v ?? "").replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]").slice(0, max);
}
function db() {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Supabase service configuration is unavailable.");
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
function cors(req: Request) {
  const origin = clean(req.headers.get("origin"), 300);
  return {
    "access-control-allow-origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://highway38solutions.com",
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods": "POST, OPTIONS",
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "vary": "Origin",
  };
}
function json(req: Request, status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), { status, headers: cors(req) });
}
function bearer(req: Request) {
  const m = String(req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}
async function signedUser(req: Request) {
  const token = bearer(req);
  if (!token) throw new Error("Supabase Auth session is required.");
  const service = db();
  const { data, error } = await service.auth.getUser(token);
  if (error || !data.user) throw new Error("Supabase Auth session is invalid or expired.");
  return { service, user: data.user };
}
async function requireActiveMember(service: ReturnType<typeof db>, userId: string, businessId: string) {
  const { data, error } = await service.from("business_memberships")
    .select("role,status").eq("business_id", businessId).eq("auth_user_id", userId)
    .eq("status", "active").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Active business membership is required.");
  return clean(data.role, 60).toLowerCase();
}
async function requireH38Reviewer(service: ReturnType<typeof db>, userId: string) {
  const role = await requireActiveMember(service, userId, H38_BUSINESS_ID);
  if (role !== "owner" && role !== "administrator") {
    throw new Error("Only a Highway 38 owner or administrator can review partner applications.");
  }
  return role;
}
async function moduleEnabled(service: ReturnType<typeof db>, businessId: string): Promise<boolean> {
  if (!businessId) return false;
  const { data, error } = await service.from("business_module_settings")
    .select("enabled").eq("business_id", businessId).eq("module_key", MODULE_KEY)
    .maybeSingle();
  if (error) throw error;
  return !!data && data.enabled === true;
}

function yes(v: unknown): boolean {
  const s = clean(v, 20).toLowerCase();
  return s === "yes" || s === "true" || s === "y";
}

// includeTestBusinessId: test listings are returned only when the caller is
// browsing as that exact business (Build Sandbox fixtures). Public surfaces
// always pass "" so test entries can never leak onto real websites.
async function activePartners(
  service: ReturnType<typeof db>,
  includeTestBusinessId = "",
): Promise<Json[]> {
  const { data, error } = await service.from("business_records")
    .select("record_key,payload,updated_at")
    .eq("business_id", H38_BUSINESS_ID)
    .eq("collection", PARTNER_COLLECTION)
    .eq("record_status", "active")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  const out: Json[] = [];
  for (const row of data || []) {
    const p = (row.payload || {}) as Json;
    if (clean(p["Status"], 40) !== "Active") continue;
    const isTest = yes(p["Test"]);
    if (isTest && clean(p["Test Business ID"], 80) !== includeTestBusinessId) continue;
    out.push({
      id: clean(row.record_key, 120),
      name: clean(p["Vendor Name"], 200),
      category: clean(p["Category"], 120) || "Other",
      serviceArea: clean(p["Service Area"], 300),
      phone: clean(p["Phone"], 60),
      website: clean(p["Website"], 500),
      blurb: clean(p["Blurb"], 600),
      logoUrl: clean(p["Logo URL"], 800),
      featured: yes(p["Featured"]),
      paidPlacement: yes(p["Paid Placement"]),
      placementDisclosure: clean(p["Placement Disclosure"], 300),
      test: isTest,
    });
  }
  // Featured first, then name — stable, honest ordering. Paid placement is
  // always disclosed in the payload so every surface can label it.
  out.sort((a, b) => Number(b.featured) - Number(a.featured) || String(a.name).localeCompare(String(b.name)));
  return out.filter((p) => p.name);
}

async function list(req: Request, input: Json) {
  const { service, user } = await signedUser(req);
  const businessId = clean(input.businessId, 80);
  if (!businessId) throw new Error("businessId is required.");
  await requireActiveMember(service, user.id, businessId);
  if (!(await moduleEnabled(service, businessId))) {
    throw new Error("Recommended Vendors is off for this business. Turn it on in Settings → Owner Controls first.");
  }
  const partners = await activePartners(
    service,
    businessId === BUILD_SANDBOX_BUSINESS_ID ? businessId : "",
  );
  return { partners };
}

async function publicList(input: Json) {
  const service = db();
  const businessId = clean(input.businessId, 80);
  const enabled = await moduleEnabled(service, businessId);
  if (!enabled) return { enabled: false, partners: [] as Json[] };
  const partners = (await activePartners(service)).map((p) => ({
    name: p.name, category: p.category, serviceArea: p.serviceArea,
    phone: p.phone, website: p.website, blurb: p.blurb,
    paidPlacement: p.paidPlacement, placementDisclosure: p.placementDisclosure,
  }));
  return { enabled: true, partners };
}

// business_records.created_by/updated_by are NOT NULL; anonymous applications
// are attributed to the Highway 38 owner (same pattern as h38-public-booking).
async function attributionUserId(service: ReturnType<typeof db>): Promise<string> {
  for (const role of ["owner", "administrator"]) {
    const { data, error } = await service.from("business_memberships")
      .select("auth_user_id").eq("business_id", H38_BUSINESS_ID)
      .eq("role", role).eq("status", "active")
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (error) throw error;
    if (data?.auth_user_id) return String(data.auth_user_id);
  }
  throw new Error("Highway 38 attribution owner is unavailable.");
}

function validEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

async function apply(input: Json) {
  const name = clean(input.businessName, 200);
  const category = clean(input.category, 120);
  const whatTheyDo = clean(input.whatTheyDo, 500);
  const serviceArea = clean(input.serviceArea, 300);
  const contactName = clean(input.contactName, 200);
  const phone = clean(input.phone, 60);
  const email = clean(input.email, 200);
  const website = clean(input.website, 500);
  const referralSource = clean(input.referralSource, 500);
  const sourceBusinessId = clean(input.sourceBusinessId, 80);
  if (!name) throw new Error("Business name is required.");
  if (!category) throw new Error("Category is required.");
  if (!serviceArea) throw new Error("Service area is required.");
  if (!contactName) throw new Error("Contact name is required.");
  if (!phone && !email) throw new Error("A phone number or email is required so Highway 38 can reach you.");
  if (email && !validEmail(email)) throw new Error("That email address does not look complete.");
  // Honeypot: real applicants never fill this.
  if (clean(input.website2, 50)) return { received: true };

  const service = db();
  const actorId = await attributionUserId(service);
  const id = `VAPP-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  const now = new Date().toISOString();
  const { error } = await service.from("business_records").insert({
    business_id: H38_BUSINESS_ID,
    collection: APPLICATION_COLLECTION,
    record_key: id,
    record_status: "active",
    created_by: actorId,
    updated_by: actorId,
    payload: {
      "Application ID": id,
      "Business Name": name,
      "Category": category,
      "What They Do": whatTheyDo,
      "Service Area": serviceArea,
      "Contact Name": contactName,
      "Phone": phone,
      "Email": email,
      "Website": website,
      "Who Recommends You": referralSource,
      "Source Business ID": sourceBusinessId,
      "Status": "Pending Review",
      "Received Time": now,
      "Record Version": 1,
    },
  });
  if (error) throw error;
  try {
    await service.from("business_proof_log").insert({
      business_id: H38_BUSINESS_ID, actor_user_id: actorId,
      action_type: "VENDOR_APPLICATION_RECEIVED", entity_type: "Vendor Application",
      result: "PASS",
      details: { applicationId: id, businessName: name, category, externalActionOccurred: false },
      external_action_occurred: false,
    });
  } catch (_) { /* proof is best-effort; the application row is the record */ }
  return { received: true, applicationId: id };
}

async function applications(req: Request) {
  const { service, user } = await signedUser(req);
  await requireH38Reviewer(service, user.id);
  const { data, error } = await service.from("business_records")
    .select("record_key,payload,created_at")
    .eq("business_id", H38_BUSINESS_ID)
    .eq("collection", APPLICATION_COLLECTION)
    .eq("record_status", "active")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  const out: Json[] = [];
  for (const row of data || []) {
    const p = (row.payload || {}) as Json;
    out.push({
      id: clean(row.record_key, 120),
      businessName: clean(p["Business Name"], 200),
      category: clean(p["Category"], 120),
      whatTheyDo: clean(p["What They Do"], 500),
      serviceArea: clean(p["Service Area"], 300),
      contactName: clean(p["Contact Name"], 200),
      phone: clean(p["Phone"], 60),
      email: clean(p["Email"], 200),
      website: clean(p["Website"], 500),
      referralSource: clean(p["Who Recommends You"], 500),
      status: clean(p["Status"], 60) || "Pending Review",
      receivedTime: clean(p["Received Time"], 60),
      test: yes(p["Test"]),
    });
  }
  return { applications: out };
}

async function decide(req: Request, input: Json) {
  const { service, user } = await signedUser(req);
  await requireH38Reviewer(service, user.id);
  const applicationId = clean(input.applicationId, 120);
  const decision = clean(input.decision, 20).toLowerCase();
  if (!applicationId) throw new Error("applicationId is required.");
  if (decision !== "approve" && decision !== "pass") {
    throw new Error("decision must be \"approve\" or \"pass\".");
  }
  const { data: appRow, error: readError } = await service.from("business_records")
    .select("id,payload")
    .eq("business_id", H38_BUSINESS_ID)
    .eq("collection", APPLICATION_COLLECTION)
    .eq("record_key", applicationId)
    .eq("record_status", "active")
    .maybeSingle();
  if (readError) throw readError;
  if (!appRow) throw new Error("That application could not be found.");
  const p = (appRow.payload || {}) as Json;
  const currentStatus = clean(p["Status"], 60);
  if (currentStatus !== "Pending Review") {
    return { applicationId, status: currentStatus, alreadyDecided: true };
  }
  const now = new Date().toISOString();
  const isTest = yes(p["Test"]);
  let partnerId = "";
  if (decision === "approve") {
    partnerId = `VPART-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
    const { error: partnerError } = await service.from("business_records").insert({
      business_id: H38_BUSINESS_ID,
      collection: PARTNER_COLLECTION,
      record_key: partnerId,
      record_status: "active",
      created_by: user.id,
      updated_by: user.id,
      payload: {
        "Vendor ID": partnerId,
        "Vendor Name": clean(p["Business Name"], 200),
        "Category": clean(p["Category"], 120) || "Other",
        "Service Area": clean(p["Service Area"], 300),
        "Phone": clean(p["Phone"], 60),
        "Website": clean(p["Website"], 500),
        "Blurb": clean(p["What They Do"], 600),
        "Logo URL": "",
        "Status": "Active",
        "Featured": "No",
        "Paid Placement": "No",
        "Placement Disclosure": "",
        "Test": isTest ? "Yes" : "No",
        "Test Business ID": isTest ? clean(p["Test Business ID"], 80) || BUILD_SANDBOX_BUSINESS_ID : "",
        "Source Application ID": applicationId,
        "Reviewed By": user.id,
        "Reviewed Time": now,
        "Record Version": 1,
      },
    });
    if (partnerError) throw partnerError;
  }
  const nextStatus = decision === "approve" ? "Approved — Listed" : "Not Listed";
  const { error: updateError } = await service.from("business_records")
    .update({
      payload: {
        ...p,
        "Status": nextStatus,
        "Reviewed By": user.id,
        "Reviewed Time": now,
        "Partner Record ID": partnerId,
        "Record Version": Number(p["Record Version"] || 1) + 1,
      },
      updated_by: user.id,
      updated_at: now,
    })
    .eq("id", appRow.id)
    .eq("business_id", H38_BUSINESS_ID);
  if (updateError) throw updateError;
  try {
    await service.from("business_proof_log").insert({
      business_id: H38_BUSINESS_ID, actor_user_id: user.id,
      action_type: decision === "approve" ? "VENDOR_APPLICATION_APPROVED" : "VENDOR_APPLICATION_PASSED",
      entity_type: "Vendor Application",
      result: "PASS",
      details: { applicationId, partnerId, externalActionOccurred: false },
      external_action_occurred: false,
    });
  } catch (_) { /* proof is best-effort */ }
  return { applicationId, status: nextStatus, partnerId };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  try {
    if (req.method !== "POST") return json(req, 405, { status: "FAIL", message: "POST required.", build: BUILD });
    if (rateLimited(req)) return json(req, 429, { status: "FAIL", message: "Too many requests. Please try again later.", build: BUILD });
    const input = (await req.json().catch(() => ({}))) as Json;
    const action = clean(input.action || new URL(req.url).searchParams.get("action"), 60);
    if (action === "list") {
      const result = await list(req, input);
      return json(req, 200, { status: "PASS", build: BUILD, ...result, externalActionOccurred: false });
    }
    if (action === "publicList") {
      const result = await publicList(input);
      return json(req, 200, { status: "PASS", build: BUILD, ...result, externalActionOccurred: false });
    }
    if (action === "apply") {
      const result = await apply(input);
      return json(req, 200, { status: "PASS", build: BUILD, ...result, externalActionOccurred: false });
    }
    if (action === "applications") {
      const result = await applications(req);
      return json(req, 200, { status: "PASS", build: BUILD, ...result, externalActionOccurred: false });
    }
    if (action === "decide") {
      const result = await decide(req, input);
      return json(req, 200, { status: "PASS", build: BUILD, ...result, externalActionOccurred: false });
    }
    return json(req, 400, { status: "FAIL", message: "Unsupported vendor directory action.", build: BUILD });
  } catch (e) {
    const message = clean(e instanceof Error ? e.message : e, 500);
    const auth = /session|membership|administrator/i.test(message);
    const off = /is off for this business/i.test(message);
    return json(req, auth ? 401 : off ? 403 : 400, { status: "FAIL", message, build: BUILD });
  }
});
