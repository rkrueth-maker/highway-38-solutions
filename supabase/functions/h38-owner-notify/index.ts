// h38-owner-notify — owner/admin notifications for the Business Office.
//
// Rick's requirement (2026-10-13): "office should notify of any customer
// activity or when new items need review."
//
// This function is the single server-side producer. Every 5 minutes
// (pg_cron job 'h38-owner-notify-5m' via pg_net) it scans the canonical
// source tables/collections for each active business and writes owner
// notification rows into business_records collection 'notifications'
// (Audience 'owners-admins'). The Office app already hydrates that
// collection; commercial-app/owner-notifications.js renders the topbar
// bell, unread badge, panel and Today card from it. Nothing here sends
// anything to customers — notifications go to the business's own
// owners/admins only.
//
// Idempotency: every notification gets a deterministic record_key,
//   OWNERNOTIF-<first 20 hex of sha256(business|source|sourceId|event)>
// and each run loads the business's existing OWNERNOTIF keys before
// inserting, so a source event notifies exactly once no matter how often
// the scan repeats. Inserts also use upsert ignoreDuplicates on the
// (business_id, collection, record_key) unique key as a second belt.
//
// Toggles: business_module_settings module_key 'owner_notifications'
// (written by Owner Controls in the app; canonical shape — enabled +
// config {customer, review, push}). No row means customer + review ON,
// push OFF (owner-facing internal feature; in-app defaults ON). When both
// categories are off the business is skipped entirely.
//
// Push seam: rows carry 'Push Status' ('pending' when the business's push
// toggle is on, otherwise 'off'). This function deliberately does NOT
// implement Web Push itself and does NOT keep a subscription store — the
// shared push dispatcher (Scout crew's h38-scout-push sender machinery)
// consumes 'pending' rows, coalescing per business + category so bursts
// become one push, and flips them to 'sent'. Until that dispatcher is
// wired for Office scopes, rows simply stay 'pending'/'off' and the
// in-app surface is the delivery channel. No fake sends, ever.
//
// Caller auth (two paths, review-scheduler / kit-proactive pattern):
//   1. x-h38-nightly-key header matching the 'h38-owner-notify' row in
//      h38_internal_job_secrets (the pg_cron caller), verify_jwt=false.
//   2. A signed-in owner/administrator JWT (Authorization bearer) asking
//      for a scan of their own business only — powers the panel's
//      "Check now" button and live verification.
// A failed source scan never throws the run: per-source errors are
// collected and reported; the underlying customer action is never
// touched by this function (read-only on sources, insert-only on
// notifications + one proof row per business that gained notifications).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BUILD = "20261013-owner-notify-2";
const JOB_SECRET_NAME = "h38-owner-notify";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const RECORD_WINDOW_HOURS = 48; // created-at based sources
const STATE_WINDOW_DAYS = 7; // status-based sources (still in the state)
const MAX_PER_BUSINESS = 60; // hard cap of new rows per business per run

type Json = Record<string, unknown>;

const text = (v: unknown, n = 400): string => String(v ?? "").trim().slice(0, n);
const num = (v: unknown): number => {
  const p = Number(v ?? 0);
  return Number.isFinite(p) ? p : 0;
};
const money = (v: unknown): string => {
  const p = num(v);
  return p ? `$${p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "";
};
const pick = (row: Json, ...keys: string[]): unknown => {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return "";
};
const humanize = (raw: unknown): string => {
  const s = text(raw, 120).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const isoHoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const isoDaysAgo = (d: number) => new Date(Date.now() - d * 24 * 3600_000).toISOString();

async function sha20(input: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)),
  );
  return Array.from(digest).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 20);
}

function json(status: number, body: Json): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function validSecret(req: Request, supabase: any): Promise<boolean> {
  const got = String(req.headers.get("x-h38-nightly-key") ?? "").trim();
  if (!got) return false;
  const { data } = await supabase
    .from("h38_internal_job_secrets")
    .select("secret_value")
    .eq("name", JOB_SECRET_NAME)
    .maybeSingle();
  return !!data?.secret_value && got === data.secret_value;
}

// Signed-in owner/admin asking for their own business (panel "Check now").
async function userBusinessScope(req: Request, supabase: any, businessId: string): Promise<boolean> {
  const auth = String(req.headers.get("authorization") ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token || !businessId) return false;
  try {
    const { data: userData, error } = await supabase.auth.getUser(token);
    if (error || !userData?.user) return false;
    const { data: membership } = await supabase
      .from("business_memberships")
      .select("role")
      .eq("business_id", businessId)
      .eq("auth_user_id", userData.user.id)
      .eq("status", "active")
      .maybeSingle();
    return !!membership && ["owner", "administrator"].includes(String(membership.role || ""));
  } catch {
    return false;
  }
}

async function attributionUserId(sb: any, businessId: string): Promise<string> {
  for (const role of ["owner", "administrator"]) {
    const { data } = await sb
      .from("business_memberships")
      .select("auth_user_id")
      .eq("business_id", businessId)
      .eq("role", role)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data?.auth_user_id) return data.auth_user_id;
  }
  return "";
}

interface NotifySettings { customer: boolean; review: boolean; push: boolean; masterOff: boolean }

async function notifySettings(sb: any, businessId: string): Promise<NotifySettings> {
  const { data } = await sb
    .from("business_module_settings")
    .select("enabled, config")
    .eq("business_id", businessId)
    .eq("module_key", "owner_notifications")
    .maybeSingle();
  if (!data) return { customer: true, review: true, push: false, masterOff: false };
  if (data.enabled === false) return { customer: false, review: false, push: false, masterOff: true };
  const cfg = (data.config || {}) as Json;
  return {
    customer: cfg.customer !== false,
    review: cfg.review !== false,
    push: cfg.push === true,
    masterOff: false,
  };
}

interface Candidate {
  category: "customer" | "review";
  eventType: string;
  source: string; // source table/collection label for the dedupe key
  sourceId: string;
  eventKey: string; // distinguishes multiple events from one source row
  title: string;
  body: string;
  linkPage: string;
  linkRecordId: string;
  customerId: string;
  customerName: string;
}

async function scanBusiness(sb: any, businessId: string): Promise<{ created: number; byCategory: Record<string, number>; errors: string[] }> {
  const errors: string[] = [];
  const settings = await notifySettings(sb, businessId);
  if (settings.masterOff || (!settings.customer && !settings.review)) {
    return { created: 0, byCategory: {}, errors };
  }
  const actorId = await attributionUserId(sb, businessId);
  const recordSince = isoHoursAgo(RECORD_WINDOW_HOURS);
  const stateSince = isoDaysAgo(STATE_WINDOW_DAYS);

  // Customer name lookup (business_records customers + portal accounts).
  const customerNames = new Map<string, string>();
  try {
    const { data } = await sb.from("business_records")
      .select("payload").eq("business_id", businessId)
      .eq("collection", "customers").eq("record_status", "active").limit(2000);
    for (const row of data || []) {
      const p = (row.payload || {}) as Json;
      const id = text(pick(p, "Customer ID", "customerId"));
      const name = text(pick(p, "Customer Name", "Name", "Display Name"));
      if (id && name) customerNames.set(id, name);
    }
  } catch (e) { errors.push(`customers: ${text((e as Error)?.message, 200)}`); }
  const nameFor = async (customerId: string): Promise<string> => {
    if (!customerId) return "";
    if (customerNames.has(customerId)) return customerNames.get(customerId)!;
    try {
      const { data } = await sb.from("customer_accounts")
        .select("display_name").eq("id", customerId).maybeSingle();
      const name = text(data?.display_name);
      if (name) customerNames.set(customerId, name);
      return name;
    } catch { return ""; }
  };

  // Owner user ids (to skip owner-recorded payments — no self-noise).
  const ownerIds = new Set<string>();
  try {
    const { data } = await sb.from("business_memberships")
      .select("auth_user_id").eq("business_id", businessId)
      .eq("role", "owner").eq("status", "active");
    for (const row of data || []) if (row.auth_user_id) ownerIds.add(String(row.auth_user_id));
  } catch { /* non-fatal */ }

  const candidates: Candidate[] = [];
  const add = (c: Candidate) => { if (candidates.length < MAX_PER_BUSINESS * 3) candidates.push(c); };
  const recordsSince = async (collection: string, sinceIso: string, useUpdated = false) => {
    const col = useUpdated ? "updated_at" : "created_at";
    const { data, error } = await sb.from("business_records")
      .select("record_key, payload, created_by, created_at, updated_at")
      .eq("business_id", businessId).eq("collection", collection)
      .eq("record_status", "active").gte(col, sinceIso)
      .order(col, { ascending: false }).limit(500);
    if (error) throw error;
    return (data || []) as Array<{ record_key: string; payload: Json; created_by: string; created_at: string; updated_at: string }>;
  };

  // ---------------- Customer activity ----------------
  if (settings.customer) {
    // New online booking requests (h38-public-booking).
    try {
      for (const row of await recordsSince("booking_requests", recordSince)) {
        const p = row.payload || {};
        const name = text(pick(p, "Customer Name")) || "A customer";
        const svc = text(pick(p, "Service"));
        const when = [text(pick(p, "Preferred Date")), text(pick(p, "Preferred Time"))].filter(Boolean).join(" ");
        add({
          category: "customer", eventType: "booking_request", source: "booking_requests",
          sourceId: row.record_key, eventKey: "created",
          title: `New booking request — ${name}`,
          body: [svc, when].filter(Boolean).join(" · ") || "Online booking",
          // The Service Requests inbox lives on the Schedule page
          // (portal-requests.js) — land the owner there, where the request
          // can be scheduled or dismissed.
          linkPage: "schedule", linkRecordId: row.record_key, customerId: "", customerName: name,
        });
      }
    } catch (e) { errors.push(`booking_requests: ${text((e as Error)?.message, 200)}`); }

    // New customer-originated requests (Start-a-Request / portal / website).
    // Rows the business itself created in the Office (Source 'Office') are
    // the owner's own work, not customer activity.
    try {
      for (const row of await recordsSince("requests", recordSince)) {
        const p = row.payload || {};
        const source = text(pick(p, "Source"));
        if (!source || source.toLowerCase() === "office") continue;
        if (text(pick(p, "Status")).toLowerCase() !== "new") continue;
        const customerId = text(pick(p, "Customer ID"));
        const name = (await nameFor(customerId)) || "A customer";
        add({
          category: "customer", eventType: "customer_request", source: "requests",
          sourceId: row.record_key, eventKey: "created",
          title: `New request — ${text(pick(p, "Subject")) || "Service request"}`,
          body: `${name} · via ${source}`,
          linkPage: "work", linkRecordId: row.record_key, customerId, customerName: name,
        });
      }
    } catch (e) { errors.push(`requests: ${text((e as Error)?.message, 200)}`); }

    // Inbound customer messages / replies (portal, SMS, email threads).
    for (const collection of ["portalMessages", "messages", "smsMessages", "emailMessages"]) {
      try {
        for (const row of await recordsSince(collection, recordSince)) {
          const p = row.payload || {};
          const direction = text(pick(p, "Direction"));
          if (!/inbound|received|customer/i.test(direction)) continue;
          if (/draft/i.test(text(pick(p, "Status")))) continue;
          const customerId = text(pick(p, "Customer ID"));
          const name = (await nameFor(customerId)) || "A customer";
          const snippet = text(pick(p, "Body Preview", "Body", "Subject"), 140);
          add({
            category: "customer", eventType: "customer_message", source: collection,
            sourceId: row.record_key, eventKey: "created",
            title: `${name} sent a message`,
            body: snippet,
            linkPage: "messages", linkRecordId: row.record_key, customerId, customerName: name,
          });
        }
      } catch (e) { errors.push(`${collection}: ${text((e as Error)?.message, 200)}`); }
    }

    // Portal quote decisions + quotes entering owner review (same scan).
    try {
      for (const row of await recordsSince("quotes", stateSince, true)) {
        const p = row.payload || {};
        const quoteId = row.record_key;
        const customerId = text(pick(p, "Customer ID"));
        const name = (await nameFor(customerId)) || "A customer";
        const total = money(pick(p, "Total"));
        const approvedAt = text(pick(p, "Customer Approved Time"));
        const declinedAt = text(pick(p, "Customer Declined Time"));
        if (approvedAt && approvedAt >= recordSince) {
          add({
            category: "customer", eventType: "quote_approved", source: "quotes",
            sourceId: quoteId, eventKey: `approved:${approvedAt}`,
            title: `Quote approved — ${name}`,
            body: [quoteId, total].filter(Boolean).join(" · "),
            linkPage: "quotes", linkRecordId: quoteId, customerId, customerName: name,
          });
        }
        if (declinedAt && declinedAt >= recordSince) {
          const reason = text(pick(p, "Decline Reason"), 120);
          add({
            category: "customer", eventType: "quote_declined", source: "quotes",
            sourceId: quoteId, eventKey: `declined:${declinedAt}`,
            title: `Quote declined — ${name}`,
            body: [quoteId, reason].filter(Boolean).join(" · "),
            linkPage: "quotes", linkRecordId: quoteId, customerId, customerName: name,
          });
        }
        const status = text(pick(p, "Status"));
        if (settings.review && /review/i.test(status) && !/customer/i.test(status)) {
          add({
            category: "review", eventType: "quote_review", source: "quotes",
            sourceId: quoteId, eventKey: `review:${text(pick(p, "Revision")) || "1"}:${status}`,
            title: `Quote needs your review — ${quoteId}`,
            body: [name, total, status].filter(Boolean).join(" · "),
            linkPage: "quotes", linkRecordId: quoteId, customerId, customerName: name,
          });
        }
      }
    } catch (e) { errors.push(`quotes: ${text((e as Error)?.message, 200)}`); }

    // Payments recorded by staff/system (owner-recorded are skipped).
    try {
      for (const row of await recordsSince("payments", recordSince)) {
        if (row.created_by && ownerIds.has(String(row.created_by))) continue;
        const p = row.payload || {};
        const amount = money(pick(p, "Amount"));
        const invoiceId = text(pick(p, "Invoice ID"));
        add({
          category: "customer", eventType: "payment_recorded", source: "payments",
          sourceId: row.record_key, eventKey: "created",
          title: `Payment recorded${amount ? ` — ${amount}` : ""}`,
          body: [text(pick(p, "Method")), invoiceId].filter(Boolean).join(" · "),
          linkPage: "money", linkRecordId: invoiceId || row.record_key, customerId: "", customerName: "",
        });
      }
    } catch (e) { errors.push(`payments: ${text((e as Error)?.message, 200)}`); }

    // Online payments (Stripe webhook / portal) in customer_payments.
    try {
      const { data, error } = await sb.from("customer_payments")
        .select("id, amount, provider, customer_id, invoice_id, status, created_at")
        .eq("business_id", businessId).gte("created_at", recordSince)
        .order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      for (const row of data || []) {
        if (text(row.status) && !/paid|succeeded|complete/i.test(text(row.status))) continue;
        const name = (await nameFor(text(row.customer_id))) || "A customer";
        add({
          category: "customer", eventType: "online_payment", source: "customer_payments",
          sourceId: text(row.id), eventKey: "created",
          title: `Online payment received${money(row.amount) ? ` — ${money(row.amount)}` : ""}`,
          body: [name, humanize(row.provider)].filter(Boolean).join(" · "),
          linkPage: "money", linkRecordId: text(row.invoice_id), customerId: text(row.customer_id), customerName: name,
        });
      }
    } catch (e) { errors.push(`customer_payments: ${text((e as Error)?.message, 200)}`); }

    // Customer document / photo uploads (documents/attachments rows whose
    // source marks them customer- or portal-originated).
    for (const collection of ["documents", "attachments"]) {
      try {
        for (const row of await recordsSince(collection, recordSince)) {
          const p = row.payload || {};
          const src = `${text(pick(p, "Source"))} ${text(pick(p, "Source Type"))} ${text(pick(p, "Uploaded By"))}`;
          if (!/customer|portal/i.test(src)) continue;
          const customerId = text(pick(p, "Customer ID"));
          const name = (await nameFor(customerId)) || "A customer";
          add({
            category: "customer", eventType: "customer_upload", source: collection,
            sourceId: row.record_key, eventKey: "created",
            title: `Customer uploaded a file — ${text(pick(p, "File Name")) || "Document"}`,
            body: name,
            linkPage: "documents", linkRecordId: row.record_key, customerId, customerName: name,
          });
        }
      } catch (e) { errors.push(`${collection}: ${text((e as Error)?.message, 200)}`); }
    }

    // Portal events the portal records for customer-side activity.
    // Owner-caused (QUOTE_PRESENTED_BY_OWNER) and pure auth events are
    // excluded; anything else (views, decisions recorded as events)
    // notifies once per event row.
    try {
      const { data, error } = await sb.from("customer_portal_events")
        .select("id, event_type, record_type, record_id, customer_id, created_at")
        .eq("business_id", businessId).gte("created_at", recordSince)
        .order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      const skip = new Set(["CUSTOMER_AUTH_LINKED", "QUOTE_PRESENTED_BY_OWNER"]);
      for (const row of data || []) {
        if (skip.has(text(row.event_type))) continue;
        const name = (await nameFor(text(row.customer_id))) || "A customer";
        const page = row.record_type === "quote" ? "quotes" : row.record_type === "invoice" ? "money" : "customers";
        add({
          category: "customer", eventType: `portal_${text(row.event_type).toLowerCase()}`,
          source: "customer_portal_events", sourceId: text(row.id), eventKey: "created",
          title: `${humanize(row.event_type)} — ${name}`,
          body: humanize(row.record_type),
          linkPage: page, linkRecordId: text(row.record_id), customerId: text(row.customer_id), customerName: name,
        });
      }
    } catch (e) { errors.push(`customer_portal_events: ${text((e as Error)?.message, 200)}`); }
  }

  // ---------------- Needs review ----------------
  if (settings.review) {
    // Pending business approvals (skip synthetic test probes).
    try {
      const { data, error } = await sb.from("business_approvals")
        .select("id, entity_type, action_type, requested_at")
        .eq("business_id", businessId).eq("status", "pending")
        .order("requested_at", { ascending: false }).limit(100);
      if (error) throw error;
      for (const row of data || []) {
        if (text(row.entity_type) === "test_probe" || /test/i.test(text(row.action_type))) continue;
        add({
          category: "review", eventType: "approval_pending", source: "business_approvals",
          sourceId: text(row.id), eventKey: "pending",
          title: `Approval needed — ${humanize(row.action_type) || "Review item"}`,
          body: humanize(row.entity_type),
          linkPage: "controls", linkRecordId: text(row.id), customerId: "", customerName: "",
        });
      }
    } catch (e) { errors.push(`business_approvals: ${text((e as Error)?.message, 200)}`); }

    // External action queue: waiting on the owner, or failed.
    try {
      const { data, error } = await sb.from("external_action_queue")
        .select("id, action_type, entity_type, status, last_error, updated_at")
        .eq("business_id", businessId)
        .in("status", ["pending_owner_approval", "failed"])
        .order("updated_at", { ascending: false }).limit(100);
      if (error) throw error;
      for (const row of data || []) {
        if (/test/i.test(text(row.action_type))) continue;
        const failed = text(row.status) === "failed";
        add({
          category: "review", eventType: failed ? "action_failed" : "action_pending",
          source: "external_action_queue", sourceId: text(row.id), eventKey: text(row.status),
          title: failed ? `Action failed — ${humanize(row.action_type)}` : `Action waiting for approval — ${humanize(row.action_type)}`,
          body: failed ? text(row.last_error, 160) : humanize(row.entity_type),
          linkPage: "controls", linkRecordId: text(row.id), customerId: "", customerName: "",
        });
      }
    } catch (e) { errors.push(`external_action_queue: ${text((e as Error)?.message, 200)}`); }

    // AI handoff tasks still pending at scan time (website questions,
    // lead responses, anything Kit could not finish on its own).
    try {
      const { data, error } = await sb.from("ai_handoff_tasks")
        .select("id, task_type, payload, created_at")
        .eq("business_id", businessId).eq("status", "pending")
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      for (const row of data || []) {
        const p = (row.payload || {}) as Json;
        add({
          category: "review", eventType: "handoff_pending", source: "ai_handoff_tasks",
          sourceId: text(row.id), eventKey: "pending",
          title: `AI task waiting — ${humanize(row.task_type) || "Handoff"}`,
          body: text(pick(p, "title", "question", "customerName"), 160),
          linkPage: "ai", linkRecordId: text(row.id), customerId: "", customerName: "",
        });
      }
    } catch (e) { errors.push(`ai_handoff_tasks: ${text((e as Error)?.message, 200)}`); }

    // AI-learned / imported prices waiting for owner review.
    try {
      const { data, error } = await sb.from("price_book_items")
        .select("id, item_code, description, unit_cost, updated_at")
        .eq("business_id", businessId).eq("approval_status", "owner_review_required")
        .gte("updated_at", stateSince)
        .order("updated_at", { ascending: false }).limit(100);
      if (error) throw error;
      for (const row of data || []) {
        add({
          category: "review", eventType: "price_review", source: "price_book_items",
          sourceId: text(row.id), eventKey: `review:${text(row.updated_at)}`,
          title: `Price needs review — ${text(row.description) || text(row.item_code)}`,
          body: [text(row.item_code), money(row.unit_cost)].filter(Boolean).join(" · "),
          linkPage: "quotes", linkRecordId: text(row.id), customerId: "", customerName: "",
        });
      }
    } catch (e) { errors.push(`price_book_items: ${text((e as Error)?.message, 200)}`); }
  }

  // ---------------- Dedupe + insert ----------------
  const existing = new Set<string>();
  try {
    const { data } = await sb.from("business_records")
      .select("record_key").eq("business_id", businessId)
      .eq("collection", "notifications").like("record_key", "OWNERNOTIF-%")
      .limit(5000);
    for (const row of data || []) existing.add(String(row.record_key));
  } catch (e) { errors.push(`existing: ${text((e as Error)?.message, 200)}`); }

  const nowIso = new Date().toISOString();
  const rows: Json[] = [];
  const byCategory: Record<string, number> = {};
  const seenThisRun = new Set<string>();
  for (const c of candidates) {
    if (rows.length >= MAX_PER_BUSINESS) break;
    const key = "OWNERNOTIF-" + (await sha20(`${businessId}|${c.source}|${c.sourceId}|${c.eventKey}`));
    if (existing.has(key) || seenThisRun.has(key)) continue;
    seenThisRun.add(key);
    rows.push({
      business_id: businessId,
      collection: "notifications",
      record_key: key,
      record_status: "active",
      created_by: actorId || null,
      updated_by: actorId || null,
      payload: {
        "Notification ID": key,
        "Business ID": businessId,
        "Audience": "owners-admins",
        "Category": c.category,
        "Event Type": c.eventType,
        "Title": c.title,
        "Body": c.body,
        "Link Page": c.linkPage,
        "Link Record ID": c.linkRecordId,
        "Source Collection": c.source,
        "Source ID": c.sourceId,
        "Customer ID": c.customerId,
        "Customer Name": c.customerName,
        "Read By JSON": "[]",
        "Push Status": settings.push ? "pending" : "off",
        "Status": "Unread",
        "Created Time": nowIso,
        "Record Version": 1,
      },
    });
    byCategory[c.category] = (byCategory[c.category] || 0) + 1;
  }

  let created = 0;
  if (rows.length) {
    const { error, count } = await sb.from("business_records")
      .upsert(rows, { onConflict: "business_id,collection,record_key", ignoreDuplicates: true, count: "exact" });
    if (error) errors.push(`insert: ${text(error.message, 240)}`);
    else created = count ?? rows.length;
    if (created > 0) {
      try {
        await sb.from("business_proof_log").insert({
          business_id: businessId,
          action_type: "OWNER_NOTIFY_SCAN",
          entity_type: "notifications",
          entity_id: null,
          result: "PASS",
          details: { build: BUILD, created, byCategory },
          external_action_occurred: false,
          created_by: actorId || null,
        });
      } catch { /* proof is best-effort; notifications already landed */ }
    }
  }
  return { created, byCategory, errors };
}

// ---------- Bouncie connection reminder (Northern Lakes) ----------
// Rick's requirement (2026-10-13): while Bouncie is NOT connected for the
// Northern Lakes tenant, the Office app pushes its owners an hourly
// reminder to connect it — app push only, never SMS/email. The moment
// Bouncie connection/fleet data appears, the reminder latches off
// permanently. Connected evidence is exactly what the existing
// bouncie-watch.py check uses: a fleet_provider_connections row
// (provider 'bouncie', status 'connected') or at least one active
// fleet_vehicles row (provider 'bouncie') for the tenant. Delivery rides
// the shared push dispatcher (h38-scout-push, action 'office_dispatch') —
// this function never sends push itself. The hourly pg_cron job is
// 'h38-bouncie-reminder-1h'; the 55-minute floor below guarantees a
// second run inside the hour can never double-fire.
const NL_BUSINESS_ID = "736a44a8-b36b-4ced-b5ed-456ed252d8ed";
const BOUNCIE_REMINDER_TITLE = "Bouncie isn't connected";
const BOUNCIE_REMINDER_BODY = "Tap to open Fleet settings and connect Bouncie so the trucks sync.";
const BOUNCIE_REMINDER_URL = "https://highway38solutions.com/commercial-app/index.html?businessKey=northern-lakes&shortcut=fleet&fleetTab=settings";
const BOUNCIE_REMINDER_TAG = "bouncie-reminder";
const BOUNCIE_MIN_INTERVAL_MS = 55 * 60 * 1000;

async function bouncieConnected(sb: any, businessId: string): Promise<boolean> {
  const { data: conns } = await sb.from("fleet_provider_connections")
    .select("id, status").eq("business_id", businessId).eq("provider", "bouncie").limit(50);
  if ((conns || []).some((c: Json) => text(c.status).toLowerCase() === "connected")) return true;
  const { data: vehicles } = await sb.from("fleet_vehicles")
    .select("id").eq("business_id", businessId).eq("provider", "bouncie").eq("active", true).limit(1);
  return !!(vehicles && vehicles.length);
}

async function bouncieReminder(sb: any): Promise<Json> {
  const businessId = NL_BUSINESS_ID;
  const { data: stateRow } = await sb.from("bouncie_reminder_state")
    .select("connected_latched_at, last_sent_at, send_count").eq("business_id", businessId).maybeSingle();
  if (stateRow?.connected_latched_at) {
    return { businessId, stopped: true, reason: "connected-latched", sendCount: stateRow.send_count || 0 };
  }
  if (await bouncieConnected(sb, businessId)) {
    await sb.from("bouncie_reminder_state").upsert({
      business_id: businessId,
      connected_latched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "business_id" });
    return { businessId, connected: true, stopped: true, reason: "connected-evidence-found" };
  }
  const lastSentMs = stateRow?.last_sent_at ? Date.parse(stateRow.last_sent_at) : 0;
  if (lastSentMs && Date.now() - lastSentMs < BOUNCIE_MIN_INTERVAL_MS) {
    return { businessId, throttled: true, lastSentAt: stateRow.last_sent_at, sendCount: stateRow.send_count || 0 };
  }
  const { data: owners } = await sb.from("business_memberships")
    .select("auth_user_id").eq("business_id", businessId).eq("role", "owner").eq("status", "active");
  const userIds = (owners || []).map((r: Json) => text(r.auth_user_id)).filter(Boolean);
  if (!userIds.length) return { businessId, noOwners: true };
  // Present this function's own job secret to the shared dispatcher.
  const { data: secretRow } = await sb.from("h38_internal_job_secrets")
    .select("secret_value").eq("name", JOB_SECRET_NAME).maybeSingle();
  if (!secretRow?.secret_value) return { businessId, error: "producer secret missing" };
  let dispatch: Json = {};
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/h38-scout-push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-h38-nightly-key": text(secretRow.secret_value, 200),
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "apikey": SERVICE_KEY,
      },
      body: JSON.stringify({
        action: "office_dispatch", businessId, userIds,
        title: BOUNCIE_REMINDER_TITLE, body: BOUNCIE_REMINDER_BODY,
        url: BOUNCIE_REMINDER_URL, tag: BOUNCIE_REMINDER_TAG,
      }),
    });
    dispatch = (await res.json().catch(() => ({}))) as Json;
  } catch (e) {
    return { businessId, error: `dispatch call failed: ${text((e as Error)?.message, 200)}` };
  }
  const attempted = num(dispatch.attempted);
  const sent = num(dispatch.sent);
  if (!attempted) return { businessId, noSubscriptions: true, dispatch };
  if (sent > 0) {
    const sendCount = (stateRow?.send_count || 0) + 1;
    await sb.from("bouncie_reminder_state").upsert({
      business_id: businessId,
      last_sent_at: new Date().toISOString(),
      send_count: sendCount,
      updated_at: new Date().toISOString(),
    }, { onConflict: "business_id" });
    try {
      await sb.from("business_proof_log").insert({
        business_id: businessId,
        action_type: "BOUNCIE_REMINDER_SENT",
        entity_type: "fleet_provider_connections",
        entity_id: null,
        result: "PASS",
        details: { build: BUILD, attempted, sent, sendCount, title: BOUNCIE_REMINDER_TITLE },
        external_action_occurred: false,
        created_by: userIds[0],
      });
    } catch { /* proof is best-effort; the dispatch log is the delivery record */ }
    return { businessId, dispatched: true, attempted, sent, sendCount };
  }
  return { businessId, dispatched: false, attempted, sent, dispatch };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { status: "FAIL", message: "POST required", build: BUILD });
  if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { status: "FAIL", message: "Server not configured", build: BUILD });
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  let body: Json = {};
  try { body = (await req.json()) as Json; } catch { body = {}; }
  const action = text(body.action, 40) || "scan";
  if (action !== "scan" && action !== "status" && action !== "bouncie-reminder") {
    return json(400, { status: "FAIL", message: "Unsupported action", build: BUILD });
  }
  const requestedBusiness = text(body.businessId, 80);

  const internal = await validSecret(req, sb);
  let businessIds: string[] = [];
  if (internal) {
    if (requestedBusiness) businessIds = [requestedBusiness];
    else {
      const { data } = await sb.from("businesses").select("id").eq("status", "active").limit(200);
      businessIds = (data || []).map((r: Json) => text(r.id)).filter(Boolean);
    }
  } else {
    if (!requestedBusiness) return json(401, { status: "FAIL", message: "Internal key or owner sign-in required", build: BUILD });
    const ok = await userBusinessScope(req, sb, requestedBusiness);
    if (!ok) return json(403, { status: "FAIL", message: "Owner or administrator sign-in required for this business", build: BUILD });
    businessIds = [requestedBusiness];
  }

  if (action === "bouncie-reminder") {
    // Scoped to the Northern Lakes tenant only: internal callers reach it
    // with no businessId (all-active scope includes NL); JWT callers must
    // have passed businessId = NL and passed the owner/admin scope check.
    if (!businessIds.includes(NL_BUSINESS_ID)) {
      return json(403, { status: "FAIL", message: "Bouncie reminder is scoped to the Northern Lakes tenant", build: BUILD });
    }
    const result = await bouncieReminder(sb);
    return json(200, { status: "PASS", build: BUILD, bouncieReminder: result });
  }

  if (action === "status") {
    return json(200, { status: "PASS", build: BUILD, businesses: businessIds.length });
  }

  const perBusiness: Array<Json> = [];
  let totalCreated = 0;
  for (const businessId of businessIds) {
    try {
      const result = await scanBusiness(sb, businessId);
      totalCreated += result.created;
      perBusiness.push({ businessId, created: result.created, byCategory: result.byCategory, errors: result.errors });
    } catch (e) {
      perBusiness.push({ businessId, created: 0, errors: [text((e as Error)?.message, 240)] });
    }
  }
  return json(200, { status: "PASS", build: BUILD, created: totalCreated, perBusiness });
});
