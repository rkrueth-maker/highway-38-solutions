// kit-proactive-engine — Proactive Kit back-office engine.
//
// Makes Kit ACTUALLY DO the work, not just wait to be asked.
// Runs on schedule (cron), processes each active business:
//
// 1. Overdue quote follow-ups — quotes sent >7 days ago, no response
//    → AI drafts a personalized follow-up, creates owner approval task
// 2. Late invoice nudges — invoices overdue >14 days
//    → AI drafts a personalized payment reminder, owner reviews before send
// 3. Daily digest — AI writes a natural morning briefing for the owner
//
// HARD RULES:
// - NEVER sends customer-facing messages without owner approval
// - NEVER moves money
// - All actions logged to business_proof_log with [ai:kit] tag
// - Respects per-tenant AI settings (ai_config.can_do_autonomously)
// - Respects $20/month per-business AI cap (falls back to template drafts)
// - Idempotent: won't create duplicate drafts for the same quote/invoice
//   within 7 days (any status, not just pending)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BUILD = "20261012-proactive-auth-gate-1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MUSE_SPARK_API_KEY = Deno.env.get("MUSE_SPARK_API_KEY") || "";
const MUSE_MODEL = "muse-spark-1.1";

// AI cost accounting (matches the per-tenant usage system)
const AI_MONTHLY_CAP_USD = 20;
const AI_COST_IN_PER_M = 1.25;
const AI_COST_OUT_PER_M = 4.25;

// Thresholds (days)
const QUOTE_FOLLOWUP_DAYS = 7;
const INVOICE_NUDGE_DAYS = 14;
const DRAFT_DEDUPE_DAYS = 7; // Don't re-draft for the same quote/invoice within this window

// Kit's actor ID for proof log (from MEMORY.md: Kit's Office account)
const KIT_ACTOR_ID = "ccf25333-47cd-42ca-a20b-cdbc63a8a695";
const KIT_TAG = "[ai:kit]";

interface Business {
  id: string;
  business_key: string;
  display_name: string;
  status: string;
}

interface Quote {
  id: string;
  customer_id: string;
  quote_number: string;
  title: string;
  amount: number;
  status: string;
  created_at: string;
  updated_at: string;
}

interface Invoice {
  id: string;
  customer_id: string;
  invoice_number: string;
  amount: number;
  amount_due: number;
  status: string;
  due_date: string;
  created_at: string;
}

function daysAgo(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function money(n: number): string {
  return `$${Number(n || 0).toFixed(2)}`;
}

async function logProof(
  supabase: any,
  businessId: string,
  actionType: string,
  entityType: string,
  entityId: string,
  details: Record<string, any>,
): Promise<void> {
  await supabase.from("business_proof_log").insert({
    business_id: businessId,
    actor_user_id: KIT_ACTOR_ID,
    action_type: actionType,
    entity_type: entityType,
    entity_id: entityId,
    result: "PASS",
    details: {
      ...details,
      aiActor: KIT_TAG,
      ownerReviewRequired: true,
      automaticSend: false,
      externalActionOccurred: false,
    },
    external_action_occurred: false,
  });
}

// ---- AI usage accounting (per-tenant $20/month cap) ----

async function aiCapCheck(supabase: any, businessId: string): Promise<void> {
  const m = new Date();
  m.setUTCDate(1);
  m.setUTCHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from("ai_usage_log")
    .select("cost_estimate")
    .eq("business_id", businessId)
    .gte("created_at", m.toISOString());
  if (error) throw new Error(`AI usage check failed: ${error.message}`);
  const spend = (data || []).reduce(
    (t: number, x: any) => t + Number(x.cost_estimate || 0),
    0,
  );
  if (spend >= AI_MONTHLY_CAP_USD) {
    throw new Error(
      `AI usage cap reached for this month ($${AI_MONTHLY_CAP_USD.toFixed(2)}).`,
    );
  }
}

async function aiLogUsage(
  supabase: any,
  businessId: string,
  fn: string,
  usage: any,
  model: string,
): Promise<void> {
  try {
    const ti = Number(usage?.prompt_tokens ?? usage?.input_tokens ?? 0);
    const to = Number(usage?.completion_tokens ?? usage?.output_tokens ?? 0);
    const cost =
      (ti / 1e6) * AI_COST_IN_PER_M + (to / 1e6) * AI_COST_OUT_PER_M;
    await supabase.from("ai_usage_log").insert({
      business_id: businessId,
      function_name: fn,
      tokens_in: ti,
      tokens_out: to,
      cost_estimate: Number(cost.toFixed(6)),
      model: model || MUSE_MODEL,
    });
  } catch (e) {
    console.warn("aiLogUsage failed:", e instanceof Error ? e.message : e);
  }
}

// ---- AI draft writer ----
// Returns { text, source } where source is "ai" or "template".
// Falls back to the template when the cap is hit, the key is missing,
// or the API errors — the engine keeps working either way.

async function aiDraft(
  supabase: any,
  businessId: string,
  systemPrompt: string,
  userPrompt: string,
  templateFallback: string,
): Promise<{ text: string; source: "ai" | "template" }> {
  if (!MUSE_SPARK_API_KEY) {
    console.warn("MUSE_SPARK_API_KEY not set — using template draft");
    return { text: templateFallback, source: "template" };
  }
  try {
    await aiCapCheck(supabase, businessId);
    const res = await fetch("https://api.meta.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${MUSE_SPARK_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MUSE_MODEL,
        max_tokens: 2000,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(60000),
    });
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(
        `Muse Spark error ${res.status}: ${JSON.stringify(payload).substring(0, 200)}`,
      );
    }
    const text: string = payload?.choices?.[0]?.message?.content || "";
    if (!text.trim()) throw new Error("Muse Spark returned empty draft.");
    await aiLogUsage(supabase, businessId, "kit-proactive-engine", payload?.usage, MUSE_MODEL);
    return { text: text.trim(), source: "ai" };
  } catch (e) {
    console.warn(
      "AI draft failed, using template:",
      e instanceof Error ? e.message : e,
    );
    return { text: templateFallback, source: "template" };
  }
}

function quoteFollowupSystem(businessName: string): string {
  return (
    `You are Kit, the office worker for ${businessName}, a home-services business. ` +
    `You write short, warm, human follow-up messages to customers — like a real person ` +
    `at the front desk would, not a robot and not a marketing email. ` +
    `Keep it under 3 sentences. Never use phrases like "I hope this message finds you well", ` +
    `"just bumping this", or "per my last email". Be specific about the work. ` +
    `End with one easy next step (reply, call, or ask questions).`
  );
}

function invoiceNudgeSystem(businessName: string): string {
  return (
    `You are Kit, the office worker for ${businessName}, a home-services business. ` +
    `You write polite, professional payment reminders — firm but friendly, never aggressive ` +
    `or guilt-tripping. Like a real office manager who values the relationship. ` +
    `Keep it under 3 sentences. Mention the invoice number and amount. ` +
    `Offer an easy next step (questions, payment options). Never threaten fees or collections.`
  );
}

function digestSystem(): string {
  return (
    `You are Kit, the office worker. Write a brief morning briefing for the business owner — ` +
    `like you'd say it walking into their office with coffee. Most urgent first. ` +
    `Conversational, specific with numbers, under 150 words. No bullet points, no headers, ` +
    `no "Dear" — just talk to them. If there's nothing urgent, say so plainly and keep it short.`
  );
}

async function checkAiEnabled(supabase: any, businessId: string): Promise<boolean> {
  // Check ai_config for this business — respects per-tenant settings
  const { data } = await supabase
    .from("business_records")
    .select("payload")
    .eq("business_id", businessId)
    .eq("collection", "ai_config")
    .eq("record_status", "active")
    .limit(1)
    .single();

  if (!data?.payload) return true; // Default: enabled if no config

  const config = data.payload;
  // Check if proactive actions are allowed
  if (config.proactive_enabled === false) return false;
  if (config.can_do_autonomously === false) return false;

  return true;
}

async function getCustomerName(
  supabase: any,
  customerId: string,
): Promise<string> {
  const { data: customer } = await supabase
    .from("customers")
    .select("display_name, first_name")
    .eq("id", customerId)
    .limit(1)
    .single();
  return customer?.display_name || customer?.first_name || "there";
}

async function processQuoteFollowups(
  supabase: any,
  business: Business,
): Promise<{ count: number; ai: number; template: number }> {
  // Find quotes sent >7 days ago with no customer decision
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - QUOTE_FOLLOWUP_DAYS);

  const { data: quotes } = await supabase
    .from("customer_quotes")
    .select("id, customer_id, quote_number, title, amount, status, created_at, updated_at")
    .eq("business_id", business.id)
    .in("status", ["sent", "presented", "viewed"])
    .is("customer_decision", null)
    .lt("updated_at", cutoff.toISOString())
    .limit(20);

  if (!quotes?.length) return { count: 0, ai: 0, template: 0 };

  // Dedupe window: don't re-draft for the same quote within 7 days (any status)
  const dedupeCutoff = new Date();
  dedupeCutoff.setDate(dedupeCutoff.getDate() - DRAFT_DEDUPE_DAYS);

  let processed = 0;
  let aiCount = 0;
  let templateCount = 0;

  for (const quote of quotes as Quote[]) {
    const { data: existing } = await supabase
      .from("ai_handoff_tasks")
      .select("id")
      .eq("business_id", business.id)
      .eq("task_type", "quote_followup_draft")
      .eq("payload->>quote_id", quote.id)
      .gte("created_at", dedupeCutoff.toISOString())
      .limit(1);

    if (existing?.length) continue; // Already drafted recently

    const customerName = await getCustomerName(supabase, quote.customer_id);
    const firstName = customerName.split(" ")[0];
    const daysWaiting = daysAgo(quote.updated_at);

    // Template fallback (used when AI is capped/unavailable)
    const templateMessage =
      `Hi ${firstName}, just checking in on the quote I sent for "${quote.title}". ` +
      `Wanted to see if you had any questions or if you'd like to move forward. Let me know!`;

    const { text: draftMessage, source } = await aiDraft(
      supabase,
      business.id,
      quoteFollowupSystem(business.display_name),
      `Write a follow-up message for this customer:\n\n` +
        `Customer: ${customerName}\n` +
        `Quote: "${quote.title}" (#${quote.quote_number}), ${money(quote.amount)}\n` +
        `Sent ${daysWaiting} days ago, no response yet.\n\n` +
        `Write just the message, nothing else.`,
      templateMessage,
    );

    // Create an approval task (owner reviews before anything sends)
    await supabase.from("ai_handoff_tasks").insert({
      business_id: business.id,
      task_type: "quote_followup_draft",
      payload: {
        quote_id: quote.id,
        quote_number: quote.quote_number,
        customer_id: quote.customer_id,
        customer_name: customerName,
        draft_message: draftMessage,
        draft_source: source,
        days_since_sent: daysWaiting,
        amount: quote.amount,
      },
      status: "pending",
      created_by: KIT_ACTOR_ID,
    });

    // Log to proof log (shows in "While You Were Away")
    await logProof(supabase, business.id, "QUOTE_FOLLOWUP_DRAFTED", "quote", quote.id, {
      quoteNumber: quote.quote_number,
      customerName,
      daysSinceSent: daysWaiting,
      draftSource: source,
      draftPreview: draftMessage.substring(0, 100),
    });

    processed++;
    if (source === "ai") aiCount++;
    else templateCount++;
  }

  return { count: processed, ai: aiCount, template: templateCount };
}

async function processInvoiceNudges(
  supabase: any,
  business: Business,
): Promise<{ count: number; ai: number; template: number }> {
  // Find invoices overdue >14 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - INVOICE_NUDGE_DAYS);

  const { data: invoices } = await supabase
    .from("customer_invoices")
    .select("id, customer_id, invoice_number, amount, amount_due, status, due_date, created_at")
    .eq("business_id", business.id)
    .in("status", ["sent", "viewed", "overdue"])
    .lt("due_date", cutoff.toISOString())
    .gt("amount_due", 0)
    .limit(20);

  if (!invoices?.length) return { count: 0, ai: 0, template: 0 };

  // Dedupe window: don't re-draft for the same invoice within 7 days (any status)
  const dedupeCutoff = new Date();
  dedupeCutoff.setDate(dedupeCutoff.getDate() - DRAFT_DEDUPE_DAYS);

  let processed = 0;
  let aiCount = 0;
  let templateCount = 0;

  for (const invoice of invoices as Invoice[]) {
    const { data: existing } = await supabase
      .from("ai_handoff_tasks")
      .select("id")
      .eq("business_id", business.id)
      .eq("task_type", "invoice_nudge_draft")
      .eq("payload->>invoice_id", invoice.id)
      .gte("created_at", dedupeCutoff.toISOString())
      .limit(1);

    if (existing?.length) continue; // Already drafted recently

    const customerName = await getCustomerName(supabase, invoice.customer_id);
    const firstName = customerName.split(" ")[0];
    const daysOverdue = daysAgo(invoice.due_date);

    // Template fallback (used when AI is capped/unavailable)
    const templateMessage =
      `Hi ${firstName}, just a friendly reminder that invoice ${invoice.invoice_number} ` +
      `for ${money(invoice.amount_due)} is now past due. ` +
      `Let me know if you have any questions or need to discuss payment options.`;

    const { text: draftMessage, source } = await aiDraft(
      supabase,
      business.id,
      invoiceNudgeSystem(business.display_name),
      `Write a payment reminder for this customer:\n\n` +
        `Customer: ${customerName}\n` +
        `Invoice: ${invoice.invoice_number}, ${money(invoice.amount_due)} due\n` +
        `${daysOverdue} days past due.\n\n` +
        `Write just the message, nothing else.`,
      templateMessage,
    );

    await supabase.from("ai_handoff_tasks").insert({
      business_id: business.id,
      task_type: "invoice_nudge_draft",
      payload: {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        customer_id: invoice.customer_id,
        customer_name: customerName,
        draft_message: draftMessage,
        draft_source: source,
        days_overdue: daysOverdue,
        amount_due: invoice.amount_due,
      },
      status: "pending",
      created_by: KIT_ACTOR_ID,
    });

    await logProof(supabase, business.id, "INVOICE_NUDGE_DRAFTED", "invoice", invoice.id, {
      invoiceNumber: invoice.invoice_number,
      customerName,
      daysOverdue,
      amountDue: invoice.amount_due,
      draftSource: source,
    });

    processed++;
    if (source === "ai") aiCount++;
    else templateCount++;
  }

  return { count: processed, ai: aiCount, template: templateCount };
}

async function processDailyDigest(
  supabase: any,
  business: Business,
): Promise<{ done: boolean; source: "ai" | "template" | null }> {
  // Check if we already created a digest today (idempotent)
  const today = new Date().toISOString().split("T")[0];

  const { data: existing } = await supabase
    .from("ai_handoff_tasks")
    .select("id")
    .eq("business_id", business.id)
    .eq("task_type", "daily_digest")
    .gte("created_at", `${today}T00:00:00Z`)
    .limit(1);

  if (existing?.length) return { done: false, source: null }; // Already did today's digest

  // Gather today's priorities
  const { data: overdueQuotes } = await supabase
    .from("customer_quotes")
    .select("id, updated_at, amount")
    .eq("business_id", business.id)
    .in("status", ["sent", "presented"])
    .is("customer_decision", null)
    .limit(50);

  const { data: overdueInvoices } = await supabase
    .from("customer_invoices")
    .select("id, amount_due")
    .eq("business_id", business.id)
    .in("status", ["sent", "viewed", "overdue"])
    .gt("amount_due", 0)
    .limit(50);

  const todayStr = new Date().toISOString().split("T")[0];
  const { count: jobsDue } = await supabase
    .from("customer_jobs")
    .select("id", { count: "exact", head: true })
    .eq("business_id", business.id)
    .lte("due_date", `${todayStr}T23:59:59Z`)
    .not("status", "in", "(completed,cancelled)");

  const quoteCount = overdueQuotes?.length || 0;
  const invoiceCount = overdueInvoices?.length || 0;
  const totalDue = (overdueInvoices || []).reduce(
    (t: number, inv: any) => t + Number(inv.amount_due || 0),
    0,
  );
  const oldestQuoteDays = (overdueQuotes || []).reduce(
    (m: number, q: any) => Math.max(m, daysAgo(q.updated_at)),
    0,
  );

  // Template fallback (used when AI is capped/unavailable)
  const templateSummary =
    `Good morning! Here's what needs your attention today: ${quoteCount} quotes waiting ` +
    `for follow-up, ${invoiceCount} invoices with balances due (${money(totalDue)} total).`;

  const { text: summary, source } = await aiDraft(
    supabase,
    business.id,
    digestSystem(),
    `Write today's morning briefing for the owner of ${business.display_name}:\n\n` +
      `- ${quoteCount} quotes waiting for follow-up` +
      (quoteCount ? ` (oldest waiting ${oldestQuoteDays} days)` : "") + `\n` +
      `- ${invoiceCount} invoices with balances due (${money(totalDue)} total)\n` +
      `- ${jobsDue || 0} jobs due today or overdue\n\n` +
      `Write just the briefing, nothing else.`,
    templateSummary,
  );

  // Create digest task
  await supabase.from("ai_handoff_tasks").insert({
    business_id: business.id,
    task_type: "daily_digest",
    payload: {
      date: today,
      overdue_quotes: quoteCount,
      overdue_invoices: invoiceCount,
      total_due: totalDue,
      jobs_due: jobsDue || 0,
      summary,
      summary_source: source,
    },
    status: "pending",
    created_by: KIT_ACTOR_ID,
  });

  await logProof(supabase, business.id, "DAILY_DIGEST_PREPARED", "digest", today, {
    date: today,
    overdueQuotes: quoteCount,
    overdueInvoices: invoiceCount,
    totalDue,
    jobsDue: jobsDue || 0,
    summarySource: source,
  });

  return { done: true, source };
}

// ---- Internal caller gate ----
// Same pattern as the other internal workers (h38-penny-nightly etc.):
// the caller must present the x-h38-nightly-key header matching the
// 'kit-proactive-engine' row in h38_internal_job_secrets. verify_jwt
// stays false because the scheduler (workspace cron runner) sends no
// user JWT — this header check is the authentication.
const JOB_SECRET_NAME = "kit-proactive-engine";

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

Deno.serve(async (req: Request) => {
  // Only allow POST (from cron) or GET, and only with the internal job key
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  if (!await validSecret(req, supabase)) {
    return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const results: Record<string, any> = {
    build: BUILD,
    businesses_processed: 0,
    quote_followups: 0,
    invoice_nudges: 0,
    digests: 0,
    ai_drafts: 0,
    template_drafts: 0,
    skipped: [],
    errors: [],
  };

  try {
    // Get all active businesses
    const { data: businesses, error: bizError } = await supabase
      .from("businesses")
      .select("id, business_key, display_name, status")
      .eq("status", "active")
      .limit(100);

    if (bizError) throw bizError;
    if (!businesses?.length) {
      return new Response(JSON.stringify({ ...results, message: "No active businesses" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    for (const business of businesses as Business[]) {
      try {
        // Respect per-tenant AI settings
        const aiEnabled = await checkAiEnabled(supabase, business.id);
        if (!aiEnabled) {
          results.skipped.push({ business: business.business_key, reason: "AI disabled" });
          continue;
        }

        const followups = await processQuoteFollowups(supabase, business);
        const nudges = await processInvoiceNudges(supabase, business);
        const digest = await processDailyDigest(supabase, business);

        results.businesses_processed++;
        results.quote_followups += followups.count;
        results.invoice_nudges += nudges.count;
        if (digest.done) results.digests++;
        results.ai_drafts += followups.ai + nudges.ai + (digest.done && digest.source === "ai" ? 1 : 0);
        results.template_drafts += followups.template + nudges.template + (digest.done && digest.source === "template" ? 1 : 0);

      } catch (bizErr) {
        results.errors.push({
          business: business.business_key,
          error: String(bizErr).substring(0, 200),
        });
      }
    }

    return new Response(JSON.stringify(results), {
      headers: { "Content-Type": "application/json" },
    });
    // Note: ai_drafts vs template_drafts show how many drafts used Muse Spark
    // vs the template fallback (cap hit, key missing, or API error).

  } catch (err) {
    return new Response(JSON.stringify({
      ...results,
      error: String(err).substring(0, 500),
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
