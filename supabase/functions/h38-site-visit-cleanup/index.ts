import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BUILD = "20260821-site-visit-cleanup-authority-1";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const BUCKET = "business-office-files";
const PAGE_SIZE = 250;
const MAX_PAGES = 40;
const ALLOWED_ORIGINS = new Set([
  "https://highway38solutions.com",
  "https://www.highway38solutions.com",
  "https://rkrueth-maker.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

type JsonObject = Record<string, unknown>;
type BusinessRow = { record_key: string; payload: JsonObject; record_status?: string; updated_at?: string };

function clean(value: unknown, max = 1000): string {
  return String(value ?? "").replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]").slice(0, max);
}
function text(value: unknown): string { return String(value ?? "").trim(); }
function field(row: JsonObject | null | undefined, ...keys: string[]): unknown {
  for (const key of keys) if (row && row[key] !== undefined && row[key] !== null && row[key] !== "") return row[key];
  return "";
}
function unique(values: unknown[]): string[] { return Array.from(new Set(values.map(text).filter(Boolean))); }
function origin(request: Request): string { return text(request.headers.get("origin")).replace(/\/+$/, ""); }
function cors(request: Request): HeadersInit {
  const requested = text(request.headers.get("access-control-request-headers"));
  return {
    "access-control-allow-origin": origin(request) || "*",
    "access-control-allow-headers": requested || "authorization, apikey, content-type, x-client-info, x-h38-request-id",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-max-age": "600",
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "vary": "Origin, Access-Control-Request-Headers",
  };
}
function json(request: Request, status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status, headers: cors(request) });
}
function bearer(request: Request): string {
  const match = text(request.headers.get("authorization")).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}
function service() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase service configuration is unavailable.");
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function signedInUser(request: Request): Promise<{ id: string; email?: string }> {
  const token = bearer(request);
  if (!token) throw new Error("Supabase Auth session is required.");
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: "GET",
    headers: { authorization: `Bearer ${token}`, apikey: SUPABASE_SERVICE_ROLE_KEY, "x-client-info": `h38-site-visit-cleanup/${BUILD}` },
    signal: AbortSignal.timeout(15000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.id) throw new Error("Supabase Auth session is invalid or expired.");
  return { id: String(payload.id), email: typeof payload.email === "string" ? payload.email : undefined };
}
async function ownerMembership(api: ReturnType<typeof service>, userId: string, businessId: string) {
  const { data, error } = await api.from("business_memberships").select("role,status").eq("business_id", businessId).eq("auth_user_id", userId).eq("status", "active").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("The signed-in account is not an active member of this business.");
  if (!["owner", "administrator"].includes(String(data.role))) throw new Error("Only an owner or administrator can permanently clean deleted Site Visit evidence.");
}
async function allRows(api: ReturnType<typeof service>, businessId: string, collection: string, status?: string): Promise<BusinessRow[]> {
  const out: BusinessRow[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const start = page * PAGE_SIZE;
    let query = api.from("business_records").select("record_key,payload,record_status,updated_at").eq("business_id", businessId).eq("collection", collection).order("record_key", { ascending: true }).range(start, start + PAGE_SIZE - 1);
    if (status) query = query.eq("record_status", status);
    const { data, error } = await query;
    if (error) throw error;
    const batch = (data || []) as BusinessRow[];
    out.push(...batch);
    if (batch.length < PAGE_SIZE) return out;
  }
  throw new Error(`Site Visit cleanup exceeded the safe ${collection} scan limit.`);
}
function captureSession(row: BusinessRow): string { return text(field(row.payload, "Capture Session ID", "captureSessionId")); }
function siteVisitId(row: BusinessRow): string { return text(field(row.payload, "Site Visit ID", "siteVisitId", "Linked Site Visit ID", "linkedSiteVisitId")); }
function sourceId(row: BusinessRow): string { return text(field(row.payload, "Source ID", "sourceId")); }
function sourceType(row: BusinessRow): string { return text(field(row.payload, "Source Type", "sourceType")).toLowerCase(); }
function originalId(row: BusinessRow): string { return text(field(row.payload, "Original Document ID", "originalDocumentId")); }
function documentId(row: BusinessRow): string { return text(field(row.payload, "Document ID", "documentId")) || text(row.record_key); }
function storagePath(row: BusinessRow): string { return text(field(row.payload, "Storage Path", "storagePath")); }
function pathVisitId(path: string): string {
  const match = text(path).match(/(?:^|\/)Site-Visit\/(VISIT-[^/]+)(?:\/|$)/i);
  return match ? match[1] : "";
}
function directDocument(row: BusinessRow, captureSessionId: string, explicitVisitId: string): boolean {
  if (captureSessionId && captureSession(row) === captureSessionId) return true;
  if (explicitVisitId && [siteVisitId(row), sourceId(row), pathVisitId(storagePath(row))].includes(explicitVisitId)) return true;
  return false;
}
function resolveCanonicalVisitIds(docs: BusinessRow[], sessionPayload: JsonObject, captureSessionId: string, explicitVisitId: string): string[] {
  const ids = new Set<string>();
  const add = (value: unknown) => { const id = text(value); if (/^VISIT-/i.test(id)) ids.add(id); };
  add(explicitVisitId);
  add(field(sessionPayload, "Site Visit ID", "siteVisitId"));
  for (const row of docs.filter(row => directDocument(row, captureSessionId, explicitVisitId))) {
    if (sourceType(row) === "site visit") add(sourceId(row));
    add(siteVisitId(row));
    add(pathVisitId(storagePath(row)));
  }
  return Array.from(ids);
}
function targetDocuments(docs: BusinessRow[], captureSessionId: string, visitIds: string[]): BusinessRow[] {
  const visitSet = new Set(visitIds);
  const selected = new Map<string, BusinessRow>();
  const ids = new Set<string>();
  const include = (row: BusinessRow) => { selected.set(row.record_key, row); ids.add(row.record_key); ids.add(documentId(row)); };
  for (const row of docs) {
    const visitMatch = [siteVisitId(row), sourceId(row), pathVisitId(storagePath(row))].some(id => id && visitSet.has(id));
    if ((captureSessionId && captureSession(row) === captureSessionId) || visitMatch) include(row);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of docs) {
      if (selected.has(row.record_key)) continue;
      const original = originalId(row);
      if (original && ids.has(original)) { include(row); changed = true; }
    }
  }
  return Array.from(selected.values());
}
function relatedRecord(row: BusinessRow, captureSessionId: string, visitIds: string[]): boolean {
  if (captureSessionId && (row.record_key === captureSessionId || captureSession(row) === captureSessionId)) return true;
  const visits = new Set(visitIds);
  return [siteVisitId(row), sourceId(row), text(field(row.payload, "Linked Site Visit ID", "linkedSiteVisitId"))].some(id => id && visits.has(id));
}
async function storageExists(api: ReturnType<typeof service>, path: string): Promise<boolean> {
  const normalized = text(path).replace(/^\/+|\/+$/g, "");
  if (!normalized) return false;
  const slash = normalized.lastIndexOf("/");
  const folder = slash >= 0 ? normalized.slice(0, slash) : "";
  const name = slash >= 0 ? normalized.slice(slash + 1) : normalized;
  const { data, error } = await api.storage.from(BUCKET).list(folder, { limit: 100, search: name });
  if (error) throw error;
  return (data || []).some(row => text(row.name) === name);
}
async function removeStorage(api: ReturnType<typeof service>, paths: string[]) {
  for (let index = 0; index < paths.length; index += 50) {
    const group = paths.slice(index, index + 50);
    if (!group.length) continue;
    const { error } = await api.storage.from(BUCKET).remove(group);
    if (error) throw error;
  }
}
async function deleteDocumentRows(api: ReturnType<typeof service>, businessId: string, keys: string[]) {
  for (let index = 0; index < keys.length; index += 100) {
    const group = keys.slice(index, index + 100);
    if (!group.length) continue;
    const { error } = await api.from("business_records").delete().eq("business_id", businessId).eq("collection", "documents").in("record_key", group);
    if (error) throw error;
  }
}
async function softDeleteRelated(api: ReturnType<typeof service>, userId: string, businessId: string, captureSessionId: string, visitIds: string[]) {
  const collections = ["siteCaptureSessions", "siteMeasurements", "jobNotes", "siteAiReviews", "siteVisits"];
  const changed: Record<string, number> = {};
  for (const collection of collections) {
    const rows = await allRows(api, businessId, collection, "active");
    const keys = rows.filter(row => relatedRecord(row, captureSessionId, visitIds)).map(row => row.record_key);
    changed[collection] = keys.length;
    for (let index = 0; index < keys.length; index += 100) {
      const group = keys.slice(index, index + 100);
      const { error } = await api.from("business_records").update({ record_status: "deleted", updated_by: userId, updated_at: new Date().toISOString() }).eq("business_id", businessId).eq("collection", collection).in("record_key", group);
      if (error) throw error;
    }
  }
  return changed;
}
async function writeProof(api: ReturnType<typeof service>, businessId: string, userId: string, result: "PASS" | "FAIL", details: JsonObject) {
  try {
    await api.from("business_proof_log").insert({
      business_id: businessId,
      actor_user_id: userId,
      action_type: "DELETE_SITE_VISIT_SERVER_CLEANUP",
      entity_type: "Site Visit",
      entity_id: null,
      result,
      details: { serverBuild: BUILD, linkedQuoteDeleted: false, linkedCustomerDeleted: false, automaticApproval: false, automaticCustomerSending: false, ...details },
      external_action_occurred: false,
    });
  } catch (_) {}
}
async function writeError(api: ReturnType<typeof service>, businessId: string, userId: string | null, message: string, details: JsonObject) {
  try {
    await api.from("business_error_log").insert({
      business_id: businessId,
      actor_user_id: userId,
      source: "supabase/functions/h38-site-visit-cleanup",
      error_code: "SITE_VISIT_SERVER_CLEANUP_FAILED",
      message: clean(message, 1200),
      severity: "error",
      status: "open",
      context: { serverBuild: BUILD, ...details },
    });
  } catch (_) {}
}

async function cleanup(request: Request, body: JsonObject): Promise<Response> {
  const api = service();
  const businessId = clean(body.businessId, 100);
  const captureSessionId = clean(body.captureSessionId, 180);
  const explicitVisitId = clean(body.siteVisitId, 180);
  const dryRun = body.dryRun === true;
  const requestId = clean(body.requestId || request.headers.get("x-h38-request-id") || crypto.randomUUID(), 180);
  let userId: string | null = null;
  try {
    const requestOrigin = origin(request);
    if (!ALLOWED_ORIGINS.has(requestOrigin)) return json(request, 403, { status: "FAIL", message: `Site Visit cleanup origin is not approved: ${requestOrigin || "missing origin"}.`, serverBuild: BUILD, requestId });
    if (!businessId || !captureSessionId) throw new Error("Business ID and Capture Session ID are required for Site Visit cleanup.");
    const user = await signedInUser(request); userId = user.id;
    await ownerMembership(api, user.id, businessId);
    const { data: sessionRow, error: sessionError } = await api.from("business_records").select("record_key,payload,record_status,updated_at").eq("business_id", businessId).eq("collection", "siteCaptureSessions").eq("record_key", captureSessionId).maybeSingle();
    if (sessionError) throw sessionError;
    if (!sessionRow) throw new Error("The capture session could not be found for exact cleanup verification.");
    if (text(sessionRow.record_status).toLowerCase() !== "deleted" && body.confirmDelete !== true) throw new Error("The Site Visit capture session is still active. Delete/confirm the Site Visit before permanent evidence cleanup.");
    const sessionPayload = (sessionRow.payload || {}) as JsonObject;
    const sessionBusiness = text(field(sessionPayload, "Business ID", "businessId"));
    if (sessionBusiness && sessionBusiness !== businessId) throw new Error("Capture session business identity does not match the requested business.");

    let docs = await allRows(api, businessId, "documents", "active");
    const canonicalVisitIds = resolveCanonicalVisitIds(docs, sessionPayload, captureSessionId, explicitVisitId);
    const targets = targetDocuments(docs, captureSessionId, canonicalVisitIds);
    const documentKeys = unique(targets.map(row => row.record_key));
    const documentIds = unique(targets.flatMap(row => [row.record_key, documentId(row)]));
    const storagePaths = unique(targets.map(storagePath));
    const linkedQuoteId = text(field(sessionPayload, "Quote ID", "quoteId"));
    const summary = { captureSessionId, canonicalVisitIds, linkedQuoteId: linkedQuoteId || null, documentCount: documentKeys.length, documentIds, storagePathCount: storagePaths.length, storagePaths, linkedQuoteDeleted: false, linkedCustomerDeleted: false };
    if (dryRun) {
      await writeProof(api, businessId, user.id, "PASS", { reason: "DRY_RUN", requestId, ...summary });
      return json(request, 200, { status: "PASS", dryRun: true, serverBuild: BUILD, requestId, ...summary });
    }

    await removeStorage(api, storagePaths);
    await deleteDocumentRows(api, businessId, documentKeys);
    const relatedRecordCounts = await softDeleteRelated(api, user.id, businessId, captureSessionId, canonicalVisitIds);

    docs = await allRows(api, businessId, "documents", "active");
    const remainingDocs = targetDocuments(docs, captureSessionId, canonicalVisitIds);
    const remainingPaths: string[] = [];
    for (const path of storagePaths) if (await storageExists(api, path)) remainingPaths.push(path);
    if (remainingDocs.length || remainingPaths.length) {
      const details = { reason: "POST_DELETE_VERIFICATION_FAILED", requestId, ...summary, remainingDocumentCount: remainingDocs.length, remainingDocumentIds: remainingDocs.map(documentId), remainingStoragePathCount: remainingPaths.length, remainingStoragePaths: remainingPaths, relatedRecordCounts };
      await writeProof(api, businessId, user.id, "FAIL", details);
      throw new Error(`Server Site Visit cleanup could not be verified (${remainingDocs.length} document records, ${remainingPaths.length} stored files remain).`);
    }

    const details = { reason: "SERVER_AUTHORITY_VERIFIED", requestId, ...summary, relatedRecordCounts, postDeleteVerification: true };
    await writeProof(api, businessId, user.id, "PASS", details);
    return json(request, 200, { status: "PASS", serverBuild: BUILD, requestId, ...summary, relatedRecordCounts, postDeleteVerification: true, externalActionOccurred: false });
  } catch (error) {
    const message = clean(error instanceof Error ? error.message : error, 1200) || "Site Visit cleanup failed.";
    if (businessId) await writeError(api, businessId, userId, message, { captureSessionId, siteVisitId: explicitVisitId || null, requestId, linkedQuoteDeleted: false, linkedCustomerDeleted: false });
    return json(request, /auth|member|owner|administrator/i.test(message) ? 401 : 500, { status: "FAIL", message, serverBuild: BUILD, requestId, linkedQuoteDeleted: false, linkedCustomerDeleted: false });
  }
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return json(request, 200, { status: "PASS", preflight: true, serverBuild: BUILD });
  if (request.method === "GET") return json(request, 200, { status: "PASS", service: "h38-site-visit-cleanup", serverBuild: BUILD, exactCaptureSessionResolution: true, canonicalVisitIdentityDiscovery: true, serverAuthorizedDocumentDelete: true, storageDeleteVerification: true, linkedQuoteDeleted: false, linkedCustomerDeleted: false, dryRunSupported: true, ownerOrAdministratorRequired: true });
  if (request.method !== "POST") return json(request, 405, { status: "FAIL", message: "Method not allowed.", serverBuild: BUILD });
  let body: JsonObject = {};
  try { body = await request.json(); } catch (_) { return json(request, 400, { status: "FAIL", message: "Request body must be JSON.", serverBuild: BUILD }); }
  if (text(body.action || "cleanupSiteVisit") !== "cleanupSiteVisit") return json(request, 400, { status: "FAIL", message: "Unsupported Site Visit cleanup action.", serverBuild: BUILD });
  return cleanup(request, body);
});