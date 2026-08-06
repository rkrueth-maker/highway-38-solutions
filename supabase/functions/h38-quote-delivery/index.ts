import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const ALLOWED_ORIGINS = new Set([
  "https://highway38solutions.com",
  "https://www.highway38solutions.com",
  "https://rkrueth-maker.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const PORTAL_URL = Deno.env.get("H38_CUSTOMER_PORTAL_URL") || "https://highway38solutions.com/customer-portal.html";
const STORAGE_BUCKET = "customer-portal";

type JsonObject = Record<string, unknown>;
type AuthUser = { id: string; email?: string };

function clean(value: unknown, max = 8000): string {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
    .trim()
    .slice(0, max);
}
function pick(row: JsonObject, ...keys: string[]): unknown {
  for (const key of keys) if (row[key] !== undefined && row[key] !== null) return row[key];
  return "";
}
function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function requestOrigin(request: Request): string {
  return clean(request.headers.get("origin"), 300).replace(/\/+$/, "");
}
function corsHeaders(request: Request): HeadersInit {
  const origin = requestOrigin(request);
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "https://highway38solutions.com";
  const requestedHeaders = clean(request.headers.get("access-control-request-headers"), 500);
  return {
    "access-control-allow-origin": allowed,
    "access-control-allow-headers": requestedHeaders || "authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-max-age": "600",
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "vary": "Origin, Access-Control-Request-Headers",
  };
}
function reply(request: Request, status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders(request) });
}
function bearer(request: Request): string {
  const match = clean(request.headers.get("authorization"), 10000).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}
function serviceClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase service configuration is unavailable.");
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
async function readJson(response: Response): Promise<JsonObject> {
  const raw = await response.text();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}
async function signedInUser(request: Request): Promise<AuthUser> {
  const token = bearer(request);
  if (!token) throw new Error("Supabase Auth session is required.");
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      "content-type": "application/json",
      "x-client-info": "h38-quote-delivery-auth-v1",
    },
    signal: AbortSignal.timeout(15000),
  });
  const payload = await readJson(response);
  if (!response.ok || typeof payload.id !== "string" || !payload.id) {
    throw new Error("Supabase Auth session is invalid or expired.");
  }
  return { id: payload.id as string, email: typeof payload.email === "string" ? payload.email : undefined };
}
async function activeOwner(service: ReturnType<typeof serviceClient>, userId: string, businessId: string) {
  const { data, error } = await service
    .from("business_memberships")
    .select("id, role, status")
    .eq("business_id", businessId)
    .eq("auth_user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("The signed-in account is not an active member of this business.");
  if (!["owner", "administrator"].includes(String(data.role))) {
    throw new Error("Owner or Administrator permission is required to approve and send a quote.");
  }
  return data;
}
function quoteLines(payload: JsonObject): JsonObject[] {
  const rows = pick(payload, "lines", "Lines", "Quote Lines");
  return Array.isArray(rows) ? rows.filter((row): row is JsonObject => Boolean(row && typeof row === "object")) : [];
}
function quoteTotal(payload: JsonObject): number {
  const recorded = numberValue(pick(payload, "Total", "total"));
  if (recorded > 0) return recorded;
  const subtotal = quoteLines(payload).reduce((sum, line) => {
    const qty = numberValue(pick(line, "Quantity", "quantity"));
    const rate = numberValue(pick(line, "Unit Price", "unitPrice", "rate"));
    return sum + qty * rate;
  }, 0);
  return subtotal + numberValue(pick(payload, "Tax", "tax"));
}
function safeFile(value: unknown): string {
  return clean(value, 120).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "quote";
}
function emailOk(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
function wrap(text: string, maxChars = 86): string[] {
  const words = clean(text, 30000).replace(/\r/g, "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}
async function createQuotePdf(details: {
  businessName: string;
  customerName: string;
  quoteNumber: string;
  revision: number;
  title: string;
  scope: string;
  measurements: string;
  lines: JsonObject[];
  total: number;
  exclusions: string;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [612, 792];
  const margin = 44;
  let page = pdf.addPage(pageSize);
  let y = 748;
  const draw = (text: string, size = 10, isBold = false, x = margin) => {
    page.drawText(clean(text, 500), { x, y, size, font: isBold ? bold : regular, color: rgb(0.05, 0.12, 0.18) });
    y -= size + 5;
  };
  const newPage = () => { page = pdf.addPage(pageSize); y = 748; };
  const paragraph = (text: string, heading?: string) => {
    if (y < 120) newPage();
    if (heading) draw(heading, 11, true);
    for (const line of wrap(text)) {
      if (y < 70) newPage();
      draw(line, 9, false);
    }
    y -= 5;
  };
  page.drawRectangle({ x: 0, y: 714, width: 612, height: 78, color: rgb(0.04, 0.14, 0.22) });
  page.drawText(details.businessName.toUpperCase(), { x: margin, y: 756, size: 18, font: bold, color: rgb(1, 1, 1) });
  page.drawText("PROFESSIONAL QUOTE", { x: margin, y: 733, size: 10, font: regular, color: rgb(0.86, 0.93, 0.97) });
  page.drawText(`Quote ${details.quoteNumber} · Revision ${details.revision}`, { x: 340, y: 746, size: 10, font: bold, color: rgb(1, 1, 1) });
  y = 685;
  draw(`Prepared for: ${details.customerName}`, 11, true);
  draw(details.title, 18, true);
  y -= 5;
  paragraph(details.scope, "Scope of work");
  if (details.measurements) paragraph(details.measurements, "Measurements and site notes");
  if (y < 180) newPage();
  draw("Itemized quote", 11, true);
  for (const line of details.lines) {
    if (y < 85) newPage();
    const description = clean(pick(line, "Description", "description"), 240) || "Work item";
    const qty = numberValue(pick(line, "Quantity", "quantity"));
    const unit = clean(pick(line, "Unit", "unit"), 30) || "each";
    const rate = numberValue(pick(line, "Unit Price", "unitPrice", "rate"));
    const amount = qty * rate;
    for (const [index, text] of wrap(description, 58).entries()) {
      draw(index === 0 ? `${text} · ${qty} ${unit} @ $${rate.toFixed(2)} = $${amount.toFixed(2)}` : text, 9);
    }
  }
  y -= 8;
  draw(`QUOTE TOTAL: $${details.total.toFixed(2)}`, 14, true);
  paragraph(details.exclusions, "Exclusions");
  paragraph("Customer approval records acceptance of this exact revision. No card is charged and work does not begin automatically. Highway 38 must separately confirm scheduling, payment terms and authorization to proceed.", "Approval boundary");
  page.drawText("Owner-reviewed customer copy · Generated by Highway 38 Business Office", { x: margin, y: 28, size: 8, font: regular, color: rgb(0.35, 0.4, 0.44) });
  return await pdf.save();
}
async function findAuthUser(service: ReturnType<typeof serviceClient>, email: string) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const found = data.users.find((user) => clean(user.email, 320).toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 100) break;
  }
  return null;
}
async function sendPortalEmail(service: ReturnType<typeof serviceClient>, email: string, redirectTo: string, metadata: JsonObject, existingUserId?: string | null) {
  if (existingUserId) {
    if (!SUPABASE_ANON_KEY) throw new Error("Supabase email configuration is unavailable.");
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirectTo } });
    if (error) throw error;
    return { mode: "secure_magic_link", authUserId: existingUserId };
  }
  const { data, error } = await service.auth.admin.inviteUserByEmail(email, { redirectTo, data: metadata });
  if (error) throw error;
  return { mode: "secure_invitation", authUserId: data.user?.id || null };
}
async function writeFailure(service: ReturnType<typeof serviceClient>, businessId: string, userId: string | null, message: string, context: JsonObject, externalActionOccurred: boolean) {
  try {
    await service.from("business_error_log").insert({
      business_id: businessId,
      actor_user_id: userId,
      source: "supabase/functions/h38-quote-delivery",
      error_code: "QUOTE_DELIVERY_FAILED",
      message: clean(message, 4000),
      severity: "error",
      status: "open",
      context: { ...context, externalActionOccurred },
    });
    await service.from("business_proof_log").insert({
      business_id: businessId,
      actor_user_id: userId,
      action_type: "APPROVE_AND_SEND_QUOTE",
      entity_type: "Quote",
      entity_id: null,
      result: "FAIL",
      details: { ...context, message: clean(message, 1200) },
      external_action_occurred: externalActionOccurred,
    });
  } catch (_) {}
}
async function deliverQuote(request: Request, body: JsonObject): Promise<Response> {
  const service = serviceClient();
  const businessId = clean(body.businessId, 80);
  const quoteId = clean(body.quoteId, 180);
  let userId: string | null = null;
  let emailSent = false;
  const context: JsonObject = { businessId, quoteId };
  try {
    if (!ALLOWED_ORIGINS.has(requestOrigin(request))) throw new Error("Quote delivery requests must originate from Highway 38.");
    if (body.confirmOwnerReview !== true) throw new Error("Owner review confirmation is required before sending.");
    const user = await signedInUser(request);
    userId = user.id;
    await activeOwner(service, user.id, businessId);

    const { data: business, error: businessError } = await service.from("businesses").select("id,business_key,display_name,status").eq("id", businessId).maybeSingle();
    if (businessError) throw businessError;
    if (!business || business.status !== "active") throw new Error("The active business could not be verified.");
    if (business.business_key !== "highway38") throw new Error("Secure customer quote delivery is currently enabled for Highway 38 only.");

    const { data: quoteRow, error: quoteError } = await service.from("business_records").select("id,record_key,payload,record_status,updated_at").eq("business_id", businessId).eq("collection", "quotes").eq("record_key", quoteId).eq("record_status", "active").maybeSingle();
    if (quoteError) throw quoteError;
    if (!quoteRow) throw new Error("The saved quote could not be found.");
    const quote = (quoteRow.payload && typeof quoteRow.payload === "object" ? quoteRow.payload : {}) as JsonObject;
    const status = clean(pick(quote, "Status", "status"), 80).toUpperCase();
    if (!["DRAFT", "OWNER REVIEW REQUIRED", "OWNER_REVIEW_REQUIRED"].includes(status)) {
      throw new Error(`${status || "This quote"} cannot be sent as a new revision. Duplicate it for a revision or use the existing presented copy.`);
    }
    const revision = Math.max(1, Math.trunc(numberValue(pick(quote, "Revision", "revision")) || 1));
    const expectedRevision = Math.max(1, Math.trunc(numberValue(body.expectedRevision) || revision));
    if (revision !== expectedRevision) throw new Error("The quote revision changed. Reopen it and review the current version before sending.");
    const total = quoteTotal(quote);
    if (total <= 0) throw new Error("The quote total must be greater than zero before sending.");
    if (Math.abs(total - numberValue(body.expectedTotal)) > 0.01) throw new Error("The quote total changed. Reopen and review it before sending.");
    const lines = quoteLines(quote);
    if (!lines.length) throw new Error("Add at least one reviewed quote line before sending.");

    const customerId = clean(pick(quote, "Customer ID", "customerId"), 180);
    if (!customerId || customerId === "GENERIC-QUOTE-CUSTOMER") throw new Error("Choose a real customer with an email address before sending this quote.");
    const { data: customerRow, error: customerError } = await service.from("business_records").select("record_key,payload").eq("business_id", businessId).eq("collection", "customers").eq("record_key", customerId).eq("record_status", "active").maybeSingle();
    if (customerError) throw customerError;
    if (!customerRow) throw new Error("The selected customer record could not be found.");
    const customer = (customerRow.payload && typeof customerRow.payload === "object" ? customerRow.payload : {}) as JsonObject;
    if (pick(customer, "Internal Only", "internalOnly") === true) throw new Error("Internal-only customers cannot receive quotes.");
    const customerName = clean(pick(customer, "Customer Name", "Name", "customerName", "name"), 240) || "Customer";
    const customerEmail = clean(pick(customer, "Email", "email"), 320).toLowerCase();
    if (!emailOk(customerEmail)) throw new Error("Add a valid email address to the selected customer before sending.");

    const quoteNumber = clean(pick(quote, "Quote Number", "quoteNumber"), 180) || quoteId;
    const title = clean(pick(quote, "Project Title", "projectTitle"), 320) || "Project Quote";
    const scope = clean(pick(quote, "Scope", "scope"), 12000);
    const measurements = clean(pick(quote, "Measurement Notes", "measurementNotes"), 12000);
    const exclusions = clean(pick(quote, "Exclusions", "exclusions"), 5000) || "Work not specifically listed in this quote is excluded.";
    const timing = clean(pick(quote, "Timing", "Payment Terms", "paymentTerms"), 3000) || "Scheduling and start date will be confirmed separately in writing.";
    const revisionAllowance = clean(pick(quote, "Revision Allowance", "revisionAllowance"), 3000) || "Changes after acceptance require a written revision or change order.";
    const approvalConsequence = "Approval records acceptance of this exact quote revision. No payment is charged and work does not begin automatically.";
    Object.assign(context, { quoteNumber, revision, total, customerId, customerEmail });

    let { data: account, error: accountError } = await service.from("customer_accounts").select("id,auth_user_id,status,email,customer_code").eq("business_id", businessId).ilike("email", customerEmail).in("status", ["invited", "active", "suspended"]).maybeSingle();
    if (accountError) throw accountError;
    const authUser = account?.auth_user_id ? await service.auth.admin.getUserById(account.auth_user_id).then(({ data }) => data.user).catch(() => null) : await findAuthUser(service, customerEmail);
    if (!account) {
      const inserted = await service.from("customer_accounts").insert({
        business_id: businessId,
        tenant_key: business.business_key,
        customer_code: customerId,
        display_name: customerName,
        email: customerEmail,
        status: authUser ? "active" : "invited",
        auth_user_id: authUser?.id || null,
        portal_enabled: true,
      }).select("id,auth_user_id,status,email,customer_code").single();
      if (inserted.error) throw inserted.error;
      account = inserted.data;
    } else {
      const updated = await service.from("customer_accounts").update({
        display_name: customerName,
        email: customerEmail,
        auth_user_id: account.auth_user_id || authUser?.id || null,
        status: account.auth_user_id || authUser?.id ? "active" : "invited",
        portal_enabled: true,
        updated_at: new Date().toISOString(),
      }).eq("id", account.id).select("id,auth_user_id,status,email,customer_code").single();
      if (updated.error) throw updated.error;
      account = updated.data;
    }

    const { data: existingPortalQuote, error: existingError } = await service.from("customer_quotes").select("id,status,version,customer_decision").eq("business_id", businessId).eq("quote_number", quoteNumber).maybeSingle();
    if (existingError) throw existingError;
    if (existingPortalQuote?.customer_decision === "approved" || existingPortalQuote?.status === "accepted") throw new Error("The customer already accepted this quote. Create a new revision instead of overwriting it.");
    const draftQuote = {
      business_id: businessId,
      customer_id: account.id,
      quote_number: quoteNumber,
      title,
      amount: total,
      status: "draft",
      version: revision,
      customer_decision: null,
      decision_at: null,
      deliverables: scope || title,
      timing,
      revision_allowance: revisionAllowance,
      exclusions,
      approval_consequence: approvalConsequence,
      updated_at: new Date().toISOString(),
    };
    const portalQuoteResult = existingPortalQuote
      ? await service.from("customer_quotes").update(draftQuote).eq("id", existingPortalQuote.id).select("id").single()
      : await service.from("customer_quotes").insert(draftQuote).select("id").single();
    if (portalQuoteResult.error) throw portalQuoteResult.error;
    const portalQuoteId = portalQuoteResult.data.id;

    const pdfBytes = await createQuotePdf({ businessName: business.display_name, customerName, quoteNumber, revision, title, scope, measurements, lines, total, exclusions });
    const pdfPath = `${account.id}/quotes/${safeFile(quoteNumber)}-revision-${revision}.pdf`;
    const upload = await service.storage.from(STORAGE_BUCKET).upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true, cacheControl: "3600" });
    if (upload.error) throw upload.error;
    const fileName = `${safeFile(quoteNumber)}-revision-${revision}.pdf`;
    const fileResult = await service.from("customer_files").upsert({
      business_id: businessId,
      customer_id: account.id,
      job_id: null,
      file_name: fileName,
      storage_path: pdfPath,
      status: "pending_delivery",
      available_to_customer: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: "storage_path" }).select("id").single();
    if (fileResult.error) throw fileResult.error;

    const redirectTo = `${PORTAL_URL}?quote=${encodeURIComponent(portalQuoteId)}&business=${encodeURIComponent(business.business_key)}`;
    const delivery = await sendPortalEmail(service, customerEmail, redirectTo, {
      business_id: businessId,
      customer_account_id: account.id,
      quote_number: quoteNumber,
      quote_ready: true,
    }, account.auth_user_id || authUser?.id || null);
    emailSent = true;

    const presentedAt = new Date().toISOString();
    const portalFinalize = await service.from("customer_quotes").update({ status: "presented", pdf_storage_path: pdfPath, updated_at: presentedAt }).eq("id", portalQuoteId);
    if (portalFinalize.error) throw portalFinalize.error;
    const fileFinalize = await service.from("customer_files").update({ status: "available", available_to_customer: true, updated_at: presentedAt }).eq("id", fileResult.data.id);
    if (fileFinalize.error) throw fileFinalize.error;
    const updatedPayload: JsonObject = {
      ...quote,
      Status: "Presented",
      "Review Status": "Owner Approved and Presented",
      "Presented Time": presentedAt,
      "Presented To": customerName,
      "Presented Email": customerEmail,
      "Customer Portal Quote ID": portalQuoteId,
      "PDF Storage Path": pdfPath,
      "Locked Revision": revision,
      "Delivery Channel": delivery.mode,
      "External Action Occurred": true,
      "Updated Time": presentedAt,
      "Record Version": Math.max(1, Math.trunc(numberValue(pick(quote, "Record Version", "recordVersion")) || 1) + 1),
    };
    const businessFinalize = await service.from("business_records").update({ payload: updatedPayload, updated_by: user.id, updated_at: presentedAt }).eq("id", quoteRow.id).eq("business_id", businessId);
    if (businessFinalize.error) throw businessFinalize.error;

    await service.from("customer_portal_events").insert({
      business_id: businessId,
      customer_id: account.id,
      auth_user_id: user.id,
      event_type: "QUOTE_PRESENTED_BY_OWNER",
      record_type: "quote",
      record_id: portalQuoteId,
      result: "PASS",
      external_action_occurred: true,
    });
    await service.from("business_proof_log").insert({
      business_id: businessId,
      actor_user_id: user.id,
      action_type: "APPROVE_AND_SEND_QUOTE",
      entity_type: "Quote",
      entity_id: null,
      result: "PASS",
      details: {
        quoteId,
        quoteNumber,
        revision,
        total,
        customerId,
        customerEmail,
        customerPortalQuoteId: portalQuoteId,
        pdfStoragePath: pdfPath,
        emailMode: delivery.mode,
        ownerReviewConfirmed: true,
        quoteLocked: true,
        automaticApproval: false,
        automaticFinancialAction: false,
      },
      external_action_occurred: true,
    });

    return reply(request, 200, {
      status: "PASS",
      message: `Quote ${quoteNumber} was locked, published to the secure customer portal and sent to ${customerEmail}.`,
      quoteId,
      quoteNumber,
      revision,
      customerEmail,
      portalQuoteId,
      portalUrl: redirectTo,
      pdfStoragePath: pdfPath,
      emailMode: delivery.mode,
      ownerReviewRequired: false,
      externalActionOccurred: true,
    });
  } catch (error) {
    const message = clean(error instanceof Error ? error.message : error, 1800) || "Quote delivery failed.";
    if (businessId) await writeFailure(service, businessId, userId, message, context, emailSent);
    const authFailure = /Auth session|active member|permission/i.test(message);
    return reply(request, authFailure ? 401 : 400, { status: "FAIL", message, externalActionOccurred: emailSent });
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return reply(request, 200, { status: "PASS", preflight: true });
  if (request.method === "GET") return reply(request, 200, {
    status: "PASS",
    service: "h38-quote-delivery",
    provider: "Supabase Auth email + private Customer Portal",
    providerConfigured: Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY),
    portalUrl: PORTAL_URL,
    ownerConfirmationRequired: true,
    automaticSending: false,
    automaticApproval: false,
    automaticFinancialAction: false,
  });
  if (request.method !== "POST") return reply(request, 405, { status: "FAIL", message: "Method not allowed." });
  let body: JsonObject = {};
  try { body = await request.json(); } catch (_) { return reply(request, 400, { status: "FAIL", message: "Request body must be JSON." }); }
  if (clean(body.action || "deliverQuote", 80) !== "deliverQuote") return reply(request, 400, { status: "FAIL", message: "Unsupported quote delivery action." });
  return deliverQuote(request, body);
});