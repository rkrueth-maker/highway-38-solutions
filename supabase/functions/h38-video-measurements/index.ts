import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://highway38solutions.com",
  "https://www.highway38solutions.com",
  "https://rkrueth-maker.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const MODEL = Deno.env.get("OPENAI_SITE_SCANNER_MODEL") ||
  Deno.env.get("OPENAI_QUOTE_MODEL") || "gpt-5-mini-2025-08-07";
const BUCKET = "business-office-files";
const ENGINE = "video-reference-scale-v2-field-authority";
const VERIFIED_STATUSES = new Set([
  "OPERATOR_VERIFIED",
  "FIELD_VERIFIED",
  "VERIFIED_BY_OPERATOR",
  "VERIFIED",
  "FIELD_MEASURED",
  "FIELD_MEASURED_AND_CHECKED",
  "DEVICE_CAPTURED",
]);
const GENERIC_MEASUREMENT_WORDS = new Set([
  "verify", "verified", "measure", "measured", "measurement", "measurements",
  "field", "dimension", "dimensions", "required", "needed", "need", "confirm",
  "record", "walkthrough", "estimate", "estimated", "camera", "video", "using",
  "android", "laser", "tape", "device", "the", "a", "an", "to", "of", "for",
  "from", "and", "or", "in", "at", "feet", "foot", "ft", "inch", "inches",
  "length", "width", "height", "value", "again",
]);

type J = Record<string, unknown>;
type Client = any;
type Reference = {
  id: string;
  label: string;
  dimension: "width" | "height" | "length";
  valueInches: number;
  displayValue: string;
  source: string;
  verificationStatus: string;
};
type VerifiedMeasurement = {
  id: string;
  label: string;
  valueInches: number;
  displayValue: string;
  source: string;
  verificationStatus: string;
};
type FrameInput = {
  id: string;
  image: { type: "input_image"; image_url: string; detail: "high" };
};
type Estimate = {
  id: string;
  label: string;
  dimension: string;
  valueInches: number;
  displayValue: string;
  source: "CAMERA_ESTIMATE";
  verificationStatus: "UNVERIFIED";
  method: "SAME_FRAME_REFERENCE_SCALE";
  confidence: number;
  frameIndex: number;
  frameDocumentId: string;
  referenceId: string;
  referenceLabel: string;
  referenceValue: string;
  referenceSource: string;
  referenceVerificationStatus: string;
  startPoint: J;
  endPoint: J;
  evidenceNote: string;
  ownerReviewRequired: true;
  fieldVerificationRequired: true;
  sampleCount?: number;
  agreementSpreadRatio?: number;
  conflictReviewRequired?: boolean;
  supersededByFieldMeasurementId?: string;
};

function clean(value: unknown, max = 6000): string {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
    .slice(0, max);
}
function requestOrigin(request: Request): string {
  return String(request.headers.get("origin") || "").trim().replace(/\/+$/, "");
}
function headers(request: Request): HeadersInit {
  return {
    "access-control-allow-origin": requestOrigin(request) || "*",
    "access-control-allow-headers": String(
      request.headers.get("access-control-request-headers") ||
        "authorization, apikey, content-type, x-client-info",
    ),
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-max-age": "600",
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    vary: "Origin, Access-Control-Request-Headers",
  };
}
function reply(request: Request, status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status, headers: headers(request) });
}
function bearer(request: Request): string {
  const match = String(request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}
function db(): Client {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Supabase service configuration is unavailable.");
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as any;
}
async function readJson(response: Response): Promise<J> {
  const raw = await response.text();
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? value as J : {};
  } catch (_) {
    return {};
  }
}
async function signedInUser(request: Request): Promise<{ id: string }> {
  const token = bearer(request);
  if (!token) throw new Error("Supabase Auth session is required.");
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      authorization: `Bearer ${token}`,
      apikey: SERVICE_KEY,
      "x-client-info": "h38-video-measurements-auth-v2",
    },
    signal: AbortSignal.timeout(15000),
  });
  const payload = await readJson(response);
  if (!response.ok || typeof payload.id !== "string" || !payload.id) {
    throw new Error("Supabase Auth session is invalid or expired.");
  }
  return { id: payload.id };
}
async function requireMembership(client: Client, userId: string, businessId: string) {
  const { data, error } = await client.from("business_memberships")
    .select("role,status")
    .eq("business_id", businessId)
    .eq("auth_user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("The signed-in account is not an active member of this business.");
  if (!["owner", "administrator", "staff"].includes(String(data.role))) {
    throw new Error("This role cannot create Site Visit measurement estimates.");
  }
}
async function requireSession(
  client: Client,
  businessId: string,
  captureSessionId: string,
  quoteId: string,
): Promise<J> {
  const { data, error } = await client.from("business_records")
    .select("payload")
    .eq("business_id", businessId)
    .eq("collection", "siteCaptureSessions")
    .eq("record_key", captureSessionId)
    .eq("record_status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("The Site Visit capture session was not found.");
  const payload = data.payload && typeof data.payload === "object" ? data.payload as J : {};
  const savedQuote = clean(payload["Quote ID"] || payload.quoteId, 180);
  if (quoteId && savedQuote && savedQuote !== quoteId) {
    throw new Error("The Site Visit does not match the saved quote.");
  }
  return payload;
}
function toInches(value: number, unit: string): number {
  const normalized = unit.toLowerCase().trim();
  if (normalized === "in" || normalized.startsWith("inch")) return value;
  if (["ft", "foot", "feet"].includes(normalized)) return value * 12;
  if (normalized === "yd") return value * 36;
  if (normalized === "cm") return value / 2.54;
  if (normalized === "m") return value * 39.3700787402;
  return 0;
}
function feetInches(totalInches: number): string {
  const eighths = Math.round(Math.max(0, totalInches) * 8);
  const whole = Math.floor(eighths / 8);
  const remainder = eighths % 8;
  const feet = Math.floor(whole / 12);
  const inches = whole % 12;
  const fraction = remainder ? ` ${remainder}/8` : "";
  return `${feet} ft ${inches}${fraction} in`;
}
function isVerified(payload: J): boolean {
  const status = clean(payload.verificationStatus || payload["Verification Status"], 80).toUpperCase();
  return payload.fieldVerified === true || VERIFIED_STATUSES.has(status);
}
function normalizeLabel(value: unknown): string {
  return clean(value, 600).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function measurementTokens(value: unknown): string[] {
  return normalizeLabel(value).split(" ").filter((token) => token && !/^\d/.test(token) && !GENERIC_MEASUREMENT_WORDS.has(token));
}
function sameMeasurement(a: unknown, b: unknown): boolean {
  const left = measurementTokens(a);
  const right = measurementTokens(b);
  if (!left.length || !right.length) return false;
  const rightSet = new Set(right);
  const common = left.filter((token) => rightSet.has(token)).length;
  const shorter = Math.min(left.length, right.length);
  return common >= Math.max(1, Math.ceil(shorter * 0.7));
}
function isMaterialSpec(input: string): boolean {
  const value = input.toLowerCase();
  return (/\br\s*-?\s*\d{1,2}\b/.test(value) &&
      /(insulat|batt|fiberglass|mineral wool|wide|width)/.test(value)) ||
    /\b(?:r-value|sku|model(?: number)?|part number|gauge|capacity)\b/.test(value);
}
function pairReferences(item: J, index: number): Reference[] {
  const label = clean(item.label || "Verified opening", 160);
  const raw = [item.valueText, item.statement, item.detail].map((value) => clean(value, 800)).join(" ");
  if (isMaterialSpec(`${label} ${raw}`)) return [];
  const match = raw.match(
    /(\d+(?:\.\d+)?)\s*(ft|feet|foot|in|inch|inches|["'])?\s*(?:x|×|by)\s*(\d+(?:\.\d+)?)\s*(ft|feet|foot|in|inch|inches|["'])?/i,
  );
  if (!match) return [];
  let unitA = (match[2] || "").toLowerCase();
  let unitB = (match[4] || "").toLowerCase();
  if (!unitA) unitA = unitB;
  if (!unitB) unitB = unitA;
  if (!unitA && !unitB) return [];
  const normalizeUnit = (value: string) => /ft|feet|foot|'/.test(value) ? "ft" : "in";
  const widthInches = toInches(Number(match[1]), normalizeUnit(unitA));
  const heightInches = toInches(Number(match[3]), normalizeUnit(unitB));
  if (!(widthInches > 0 && heightInches > 0)) return [];
  const base = clean(item.id || item.measurementId || `SPOKEN-${index}`, 160);
  const source = clean(item.verificationSource || item.source || "OPERATOR_STATED_FIELD_MEASUREMENT", 120);
  const verificationStatus = clean(item.verificationStatus || "OPERATOR_VERIFIED", 80);
  return [
    { id: `${base}:width`, label: `${label} width`, dimension: "width", valueInches: widthInches, displayValue: feetInches(widthInches), source, verificationStatus },
    { id: `${base}:height`, label: `${label} height`, dimension: "height", valueInches: heightInches, displayValue: feetInches(heightInches), source, verificationStatus },
  ];
}
async function collectMeasurementAuthority(
  client: Client,
  businessId: string,
  captureSessionId: string,
  session: J,
): Promise<{ references: Reference[]; verified: VerifiedMeasurement[] }> {
  const references: Reference[] = [];
  const verified: VerifiedMeasurement[] = [];
  const spoken = Array.isArray(session["Walkthrough Spoken Measurements"])
    ? session["Walkthrough Spoken Measurements"] as J[] : [];
  spoken.forEach((item, index) => {
    if (item && typeof item === "object" && isVerified(item)) references.push(...pairReferences(item, index));
  });
  const { data, error } = await client.from("business_records")
    .select("record_key,payload")
    .eq("business_id", businessId)
    .eq("collection", "siteMeasurements")
    .eq("record_status", "active")
    .limit(500);
  if (error) throw error;
  for (const row of (data || []) as any[]) {
    const payload = row.payload && typeof row.payload === "object" ? row.payload as J : {};
    if (clean(payload["Capture Session ID"] || payload.captureSessionId, 180) !== captureSessionId) continue;
    if (!isVerified(payload)) continue;
    const label = clean(payload["Label"] || payload.label || "Field measurement", 160);
    const valueInches = toInches(Number(payload["Value"] || payload.value || 0), clean(payload["Unit"] || payload.unit, 40));
    if (!(valueInches > 0) || isMaterialSpec(label)) continue;
    const id = clean(payload["Site Measurement ID"] || payload.measurementId || row.record_key, 180);
    const source = clean(payload["Source"] || payload.source || "FIELD_MEASURED", 120);
    const verificationStatus = clean(payload["Verification Status"] || payload.verificationStatus || "FIELD_MEASURED", 80).toUpperCase();
    const item = { id, label, valueInches, displayValue: feetInches(valueInches), source, verificationStatus };
    verified.push(item);
    references.push({ ...item, dimension: "length" });
  }
  const seenReferences = new Set<string>();
  const uniqueReferences = references.filter((reference) => {
    const key = `${normalizeLabel(reference.label)}|${Math.round(reference.valueInches * 10)}`;
    if (seenReferences.has(key)) return false;
    seenReferences.add(key);
    return true;
  }).slice(0, 20);
  const seenVerified = new Set<string>();
  const uniqueVerified = verified.filter((item) => {
    const key = `${normalizeLabel(item.label)}|${Math.round(item.valueInches * 10)}`;
    if (seenVerified.has(key)) return false;
    seenVerified.add(key);
    return true;
  });
  return { references: uniqueReferences, verified: uniqueVerified };
}
function filterTargetsAgainstVerified(targets: string[], verified: VerifiedMeasurement[]) {
  const unresolved: string[] = [];
  const resolved: Array<{ target: string; measurement: VerifiedMeasurement }> = [];
  for (const target of targets) {
    const measurement = verified.find((item) => sameMeasurement(item.label, target));
    if (measurement) resolved.push({ target, measurement });
    else unresolved.push(target);
  }
  return { unresolved, resolved };
}
async function collectFrames(
  client: Client,
  businessId: string,
  captureSessionId: string,
  quoteId: string,
): Promise<FrameInput[]> {
  const { data, error } = await client.from("business_records")
    .select("record_key,payload,updated_at")
    .eq("business_id", businessId)
    .eq("collection", "documents")
    .eq("record_status", "active")
    .order("updated_at", { ascending: false })
    .limit(600);
  if (error) throw error;
  const documents = (data || []) as any[];
  let visitId = "";
  for (const row of documents) {
    const payload = row.payload && typeof row.payload === "object" ? row.payload as J : {};
    const sessionId = clean(payload["Capture Session ID"] || payload.captureSessionId, 180);
    const sourceType = clean(payload["Source Type"] || payload.sourceType, 80).toLowerCase();
    const sourceId = clean(payload["Source ID"] || payload.sourceId, 180);
    if (sessionId === captureSessionId && sourceType === "site visit" && sourceId) {
      visitId = sourceId;
      break;
    }
  }
  const candidates = documents.filter((row) => {
    const payload = row.payload && typeof row.payload === "object" ? row.payload as J : {};
    const mime = clean(payload["Mime Type"] || payload.mimeType, 120).toLowerCase();
    if (!mime.startsWith("image/")) return false;
    const sessionId = clean(payload["Capture Session ID"] || payload.captureSessionId, 180);
    const sourceType = clean(payload["Source Type"] || payload.sourceType, 80).toLowerCase();
    const sourceId = clean(payload["Source ID"] || payload.sourceId, 180);
    const linkedVisit = clean(payload["Linked Site Visit ID"] || payload.linkedSiteVisitId, 180);
    if (sessionId === captureSessionId) return true;
    if (visitId && sourceType === "site visit" && sourceId === visitId) return true;
    if (visitId && linkedVisit === visitId) return true;
    if (visitId && sourceType === "quote" && sourceId === quoteId && linkedVisit === visitId) return true;
    return false;
  }).sort((a, b) => {
    const ap = a.payload && typeof a.payload === "object" ? a.payload as J : {};
    const bp = b.payload && typeof b.payload === "object" ? b.payload as J : {};
    const byName = clean(ap["File Name"] || ap.fileName, 180).localeCompare(clean(bp["File Name"] || bp.fileName, 180));
    if (byName) return byName;
    const at = clean(ap["Source Type"] || ap.sourceType, 80).toLowerCase();
    const bt = clean(bp["Source Type"] || bp.sourceType, 80).toLowerCase();
    return (at === "site visit" ? 0 : 1) - (bt === "site visit" ? 0 : 1);
  });
  const selected: FrameInput[] = [];
  const seen = new Set<string>();
  for (const row of candidates) {
    const payload = row.payload && typeof row.payload === "object" ? row.payload as J : {};
    const bucket = clean(payload["Storage Bucket"] || payload.storageBucket || BUCKET, 120);
    const path = clean(payload["Storage Path"] || payload.storagePath, 1000);
    const fileKey = path || `${clean(payload["File Name"] || payload.fileName, 180).toLowerCase()}|${Number(payload["File Size"] || payload.fileSize || 0)}`;
    if (seen.has(fileKey)) continue;
    seen.add(fileKey);
    if (!path || !path.startsWith(`${businessId}/`)) continue;
    const { data: signed, error: signedError } = await client.storage.from(bucket).createSignedUrl(path, 600);
    if (signedError || !signed?.signedUrl) continue;
    selected.push({
      id: clean(payload["Original Document ID"] || payload.originalDocumentId || payload["Document ID"] || payload.documentId || row.record_key, 180),
      image: { type: "input_image", image_url: signed.signedUrl, detail: "high" },
    });
    if (selected.length >= 6) break;
  }
  return selected;
}
function reviewSchema(): J {
  const point = {
    type: "object", additionalProperties: false, required: ["x", "y"],
    properties: { x: { type: "number", minimum: 0, maximum: 1 }, y: { type: "number", minimum: 0, maximum: 1 } },
  };
  return {
    type: "object", additionalProperties: false, required: ["observations"],
    properties: {
      observations: {
        type: "array", maxItems: 16,
        items: {
          type: "object", additionalProperties: false,
          required: [
            "frameIndex", "targetLabel", "targetDimension", "referenceId", "samePlane",
            "referenceStart", "referenceEnd", "targetStart", "targetEnd", "confidence", "evidenceNote",
          ],
          properties: {
            frameIndex: { type: "integer", minimum: 0, maximum: 5 },
            targetLabel: { type: "string" },
            targetDimension: { type: "string", enum: ["width", "height", "length"] },
            referenceId: { type: "string" }, samePlane: { type: "boolean" },
            referenceStart: point, referenceEnd: point, targetStart: point, targetEnd: point,
            confidence: { type: "number", minimum: 0, maximum: 1 }, evidenceNote: { type: "string" },
          },
        },
      },
    },
  };
}
function outputText(payload: J): string {
  if (typeof payload.output_text === "string") return payload.output_text;
  for (const output of Array.isArray(payload.output) ? payload.output : []) {
    if (!output || typeof output !== "object") continue;
    const content = Array.isArray((output as J).content) ? (output as J).content as unknown[] : [];
    for (const part of content) {
      if (part && typeof part === "object" && (part as J).type === "output_text" && typeof (part as J).text === "string") {
        return (part as J).text as string;
      }
    }
  }
  return "";
}
function span(start: J, end: J): number {
  return Math.hypot(Number(end.x || 0) - Number(start.x || 0), Number(end.y || 0) - Number(start.y || 0));
}
function slug(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "MEASURE";
}
function calculateEstimates(parsed: J, references: Reference[], frames: FrameInput[]): Estimate[] {
  const referenceMap = new Map(references.map((reference) => [reference.id, reference]));
  const accepted: Estimate[] = [];
  for (const raw of Array.isArray(parsed.observations) ? parsed.observations : []) {
    if (!raw || typeof raw !== "object") continue;
    const observation = raw as J;
    const frameIndex = Number(observation.frameIndex);
    const reference = referenceMap.get(clean(observation.referenceId, 180));
    if (!reference || observation.samePlane !== true) continue;
    if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= frames.length) continue;
    const referenceSpan = span(observation.referenceStart as J, observation.referenceEnd as J);
    const targetSpan = span(observation.targetStart as J, observation.targetEnd as J);
    if (referenceSpan < 0.025 || targetSpan < 0.02) continue;
    const ratio = targetSpan / referenceSpan;
    if (!Number.isFinite(ratio) || ratio < 0.08 || ratio > 12) continue;
    const valueInches = reference.valueInches * ratio;
    if (!(valueInches > 0.5 && valueInches < 2400)) continue;
    const confidence = Math.max(0.35, Math.min(0.72, Number(observation.confidence || 0) * 0.85));
    const label = clean(observation.targetLabel, 160);
    const dimension = clean(observation.targetDimension, 40);
    accepted.push({
      id: `VIDEO-${frameIndex + 1}-${slug(label)}-${slug(dimension)}`,
      label, dimension, valueInches: Math.round(valueInches * 8) / 8, displayValue: feetInches(valueInches),
      source: "CAMERA_ESTIMATE", verificationStatus: "UNVERIFIED", method: "SAME_FRAME_REFERENCE_SCALE",
      confidence, frameIndex, frameDocumentId: frames[frameIndex].id,
      referenceId: reference.id, referenceLabel: reference.label, referenceValue: reference.displayValue,
      referenceSource: reference.source, referenceVerificationStatus: reference.verificationStatus,
      startPoint: { ...(observation.targetStart as J), coordinateSystem: "VIDEO_FRAME_NORMALIZED", frameDocumentId: frames[frameIndex].id },
      endPoint: { ...(observation.targetEnd as J), coordinateSystem: "VIDEO_FRAME_NORMALIZED", frameDocumentId: frames[frameIndex].id },
      evidenceNote: clean(observation.evidenceNote, 500), ownerReviewRequired: true, fieldVerificationRequired: true,
    });
  }
  const grouped = new Map<string, Estimate[]>();
  for (const estimate of accepted) {
    const key = `${normalizeLabel(estimate.label)}|${estimate.dimension}`;
    const existing = grouped.get(key) || [];
    existing.push(estimate);
    grouped.set(key, existing);
  }
  const results: Estimate[] = [];
  for (const estimates of grouped.values()) {
    estimates.sort((a, b) => a.valueInches - b.valueInches);
    const mid = estimates[Math.floor(estimates.length / 2)];
    const minimum = estimates[0].valueInches;
    const maximum = estimates[estimates.length - 1].valueInches;
    const spread = mid.valueInches ? Math.abs(maximum - minimum) / mid.valueInches : 1;
    const confidence = Math.max(0.3, Math.min(0.72, mid.confidence - (spread > 0.12 ? 0.18 : estimates.length > 1 ? -0.04 : 0)));
    results.push({ ...mid, id: `VIDEO-${slug(mid.label)}-${slug(mid.dimension)}`, confidence,
      sampleCount: estimates.length, agreementSpreadRatio: Math.round(spread * 1000) / 1000,
      conflictReviewRequired: spread > 0.12 });
  }
  return results.slice(0, 8);
}
function suppressVerifiedEstimates(estimates: Estimate[], verified: VerifiedMeasurement[]) {
  const kept: Estimate[] = [];
  const suppressed: Estimate[] = [];
  for (const estimate of estimates) {
    const authority = verified.find((item) => sameMeasurement(item.label, estimate.label));
    if (!authority) {
      kept.push(estimate);
      continue;
    }
    suppressed.push({
      ...estimate,
      supersededByFieldMeasurementId: authority.id,
      evidenceNote: `${estimate.evidenceNote} Superseded by field-verified ${authority.label}: ${authority.displayValue}.`.trim(),
    });
  }
  return { kept, suppressed };
}
async function writeProof(
  client: Client, businessId: string, userId: string, captureSessionId: string, quoteId: string,
  referenceCount: number, frameCount: number, estimateCount: number, suppressedCount: number,
) {
  await client.from("business_proof_log").insert({
    business_id: businessId, actor_user_id: userId, action_type: "SITE_VISIT_VIDEO_MEASUREMENT_ESTIMATE",
    entity_type: "Site Capture Session", entity_id: null, result: "PASS",
    details: {
      captureSessionId, quoteId, engine: ENGINE, referenceCount, frameCount, estimateCount, suppressedCount,
      exactDimensionsInvented: false, referenceScaleRequired: true, samePlaneRequired: true,
      fieldVerificationRequired: true, ownerReviewRequired: true, fieldMeasuredWins: true,
      cameraEstimateCannotReopenVerifiedDimension: true,
      automaticApproval: false, automaticCustomerSending: false,
    }, external_action_occurred: false,
  });
}
async function writeError(
  client: Client, businessId: string, userId: string, captureSessionId: string, quoteId: string, error: unknown,
) {
  try {
    await client.from("business_error_log").insert({
      business_id: businessId, actor_user_id: userId || null,
      source: "supabase/functions/h38-video-measurements", error_code: "VIDEO_MEASUREMENT_FAILED",
      message: clean(error instanceof Error ? error.message : error, 1000), severity: "error", status: "open",
      context: { captureSessionId, quoteId, engine: ENGINE },
    });
  } catch (_) {}
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return reply(request, 200, { status: "PASS", preflight: true });
  if (request.method === "GET") {
    return reply(request, 200, {
      status: "PASS", function: "h38-video-measurements", engine: ENGINE, model: MODEL,
      referenceScaleRequired: true, fieldVerificationRequired: true,
      fieldMeasuredWins: true, cameraEstimateCannotReopenVerifiedDimension: true,
    });
  }
  if (request.method !== "POST") return reply(request, 405, { status: "FAIL", message: "POST is required." });
  const client = db();
  let businessId = "", captureSessionId = "", quoteId = "", userId = "";
  try {
    const currentOrigin = requestOrigin(request);
    if (!ALLOWED_ORIGINS.has(currentOrigin)) {
      return reply(request, 403, { status: "FAIL", message: `Video measurement origin is not approved: ${currentOrigin || "missing origin"}.` });
    }
    const body = await request.json() as J;
    businessId = clean(body.businessId, 100);
    captureSessionId = clean(body.captureSessionId, 180);
    quoteId = clean(body.quoteId, 180);
    if (!businessId || !captureSessionId || !quoteId) throw new Error("Business, capture session, and saved quote are required.");
    const signed = await signedInUser(request);
    userId = signed.id;
    await requireMembership(client, userId, businessId);
    const session = await requireSession(client, businessId, captureSessionId, quoteId);
    const authority = await collectMeasurementAuthority(client, businessId, captureSessionId, session);
    const references = authority.references;
    const verified = authority.verified;
    const frames = await collectFrames(client,businessId,captureSessionId,quoteId);
    const requestedTargets = (Array.isArray(body.targets) ? body.targets : [])
      .map((value) => clean(value, 500)).filter(Boolean).filter((value) => !isMaterialSpec(value)).slice(0, 12);
    const filteredTargets = filterTargetsAgainstVerified(requestedTargets, verified);
    const targets = filteredTargets.unresolved;
    if (!targets.length && requestedTargets.length) {
      await writeProof(client, businessId, userId, captureSessionId, quoteId, references.length, frames.length, 0, filteredTargets.resolved.length);
      return reply(request, 200, {
        status: "PASS", engine: ENGINE, outcome: "NO_UNVERIFIED_TARGETS",
        message: "All requested measurement targets already have field-verified authority. Camera estimates were not allowed to reopen them.",
        references, estimates: [],
        suppressedTargets: filteredTargets.resolved.map((item) => ({ target: item.target, supersededByFieldMeasurementId: item.measurement.id })),
        ownerReviewRequired: true, fieldVerificationRequired: true,
        fieldMeasuredWins: true, cameraEstimateCannotReopenVerifiedDimension: true,
        automaticApproval: false, automaticCustomerSending: false,
      });
    }
    if (!references.length) {
      await writeProof(client, businessId, userId, captureSessionId, quoteId, 0, frames.length, 0, filteredTargets.resolved.length);
      return reply(request, 200, { status: "PASS", engine: ENGINE, outcome: "NO_VERIFIED_REFERENCE",
        message: "Video measurements need at least one field-verified dimension visible in a review frame.", references: [], estimates: [],
        suppressedTargets: filteredTargets.resolved.map((item) => ({ target: item.target, supersededByFieldMeasurementId: item.measurement.id })) });
    }
    if (!frames.length) {
      await writeProof(client, businessId, userId, captureSessionId, quoteId, references.length, 0, 0, filteredTargets.resolved.length);
      return reply(request, 200, { status: "PASS", engine: ENGINE, outcome: "NO_REVIEW_FRAMES",
        message: "No saved walkthrough review frames are available.", references, estimates: [],
        suppressedTargets: filteredTargets.resolved.map((item) => ({ target: item.target, supersededByFieldMeasurementId: item.measurement.id })) });
    }
    if (!OPENAI_API_KEY) throw new Error("The OpenAI API key is not configured.");
    const instructions = [
      "You are H38's internal video measurement locator.",
      "Your job is only to mark image endpoints for SAME-FRAME reference scaling.",
      "Use only a supplied field-verified reference that is clearly visible in the same image and on the same physical plane as the requested target.",
      "Never infer scale across different walls, depth planes, camera positions, or separate frames.",
      "If perspective, occlusion, lens angle, or reference identity makes scaling unreliable, return no observation for that target.",
      "Reference width and reference height are separate references; use the matching axis when possible.",
      "Coordinates are normalized image coordinates from 0 to 1.",
      "Do not output a dimension value; the server calculates it deterministically from endpoint ratios.",
      "Do not create an observation for a target that is not in the unresolved target list.",
      "This creates internal estimates only. Exact dimensions are never invented and field verification remains required.",
    ].join(" ");
    const content: Array<Record<string, unknown>> = [{ type: "input_text", text: JSON.stringify({
      engine: ENGINE, targets, references,
      policy: { sameFrameOnly: true, samePlaneOnly: true, serverComputesScale: true,
        fieldVerificationRequired: true, ownerReviewRequired: true, fieldMeasuredWins: true },
    }) }];
    frames.forEach((frame, index) => {
      content.push({ type: "input_text", text: `FRAME ${index} document ${frame.id}` });
      content.push(frame.image);
    });
    const aiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${OPENAI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL, instructions, input: [{ role: "user", content }],
        text: { format: { type: "json_schema", name: "h38_video_measurement_observations", strict: true, schema: reviewSchema() } },
      }),
      signal: AbortSignal.timeout(120000),
    });
    const aiPayload = await readJson(aiResponse);
    if (!aiResponse.ok) {
      const errorPayload = aiPayload.error && typeof aiPayload.error === "object" ? aiPayload.error as J : {};
      throw new Error(clean(errorPayload.message || aiPayload.message || `OpenAI returned ${aiResponse.status}.`, 1000));
    }
    const raw = outputText(aiPayload);
    const parsed = raw ? JSON.parse(raw) as J : { observations: [] };
    const calculated = calculateEstimates(parsed, references, frames);
    const suppression = suppressVerifiedEstimates(calculated, verified);
    const estimates = suppression.kept;
    const suppressedEstimates = suppression.suppressed;
    await writeProof(
      client, businessId, userId, captureSessionId, quoteId,
      references.length, frames.length, estimates.length,
      filteredTargets.resolved.length + suppressedEstimates.length,
    );
    return reply(request, 200, {
      status: "PASS", engine: ENGINE,
      outcome: estimates.length ? "ESTIMATES_READY" : suppressedEstimates.length ? "VERIFIED_AUTHORITY_SUPPRESSED_ESTIMATES" : "NO_RELIABLE_SAME_PLANE_ESTIMATE",
      model: MODEL, references, frameCount: frames.length, estimates, suppressedEstimates,
      suppressedTargets: filteredTargets.resolved.map((item) => ({ target: item.target, supersededByFieldMeasurementId: item.measurement.id })),
      ownerReviewRequired: true, fieldVerificationRequired: true,
      fieldMeasuredWins: true, cameraEstimateCannotReopenVerifiedDimension: true,
      automaticApproval: false, automaticCustomerSending: false,
    });
  } catch (error) {
    if (businessId) await writeError(client, businessId, userId, captureSessionId, quoteId, error);
    return reply(request, 400, {
      status: "FAIL", engine: ENGINE,
      message: clean(error instanceof Error ? error.message : error, 1000),
      automaticApproval: false, automaticCustomerSending: false,
    });
  }
});
