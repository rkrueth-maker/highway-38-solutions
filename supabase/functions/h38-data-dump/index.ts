// h38-data-dump — year data dump + confirmed purge (Rick, 2026-10-21).
//
// Part of the per-business data-limit feature (server data included per
// business; the limit value itself lives in the data-limit policy, not
// here). The dump is the FREE way for a business to get back under the
// limit: export one full year of their data (records + files)
// as downloadable zip archives, then — as a SEPARATE, explicit step, only
// after the archive exists — purge that year's bulk from the server.
//
// Marked photos (Rick, 2026-10-22): a photo whose document record carries
// 'Keep On Server': true (set in the Office gallery — "Keep on server —
// example of work") is NEVER purged: the file and its document record stay
// on the server and keep counting toward the business's data meter. The
// dump archive itself is always complete for the year regardless of the
// flag — the flag governs purge retention only. Purge re-checks the flags
// live at purge time, so a photo marked after the export was built is
// still kept.
//
// Hard rules:
//  * Export never deletes anything. Purge is a separate action requiring
//    { confirm: true } and the dump in status 'ready'.
//  * Purge deletes ONLY what the dump's manifest lists AND only classes on
//    the purgeable allowlist below. Accounting retention is absolute:
//    invoices, payments, GL (accountingTransactions), payroll, tax and other
//    money records + customers are NEVER purged. Any collection or file
//    segment not explicitly purgeable is RETAINED by default.
//  * Purge is audit-logged (business_data_purge_audit) and idempotent:
//    a second purge on a purged dump is a no-op.
//  * Callers must be the business's owner/administrator (membership, active);
//    purge additionally requires the OWNER role. The H38 platform owner may
//    act for support. Nothing here sends, charges, or gates anything.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { zipSync } from "https://esm.sh/fflate@0.8.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const H38 = "10b85a89-5834-436d-95b0-c6ee2eb335ad";
const BUCKET = "business-office-files";
const PART_CAP = 128 * 1024 * 1024; // zip part soft cap; larger years split into parts
const SIGNED_TTL = 86400; // 24h download links

// --- purge classification (explicit; default = RETAIN) ----------------------
const PURGEABLE_COLLECTIONS = new Set([
  "jobs", "jobNotes", "documents", "siteCaptureSessions", "siteMeasurements",
  "siteAiReviews", "scheduleEvents", "checklists", "crewLocationStamps",
  "routeStops", "routes", "dispatchAssignments", "dailyLogs",
  "mediaAnalysisSessions", "mediaAnalyses", "inspections", "usageLogs",
  "app_sessions",
]);
// Retained no matter what (accounting/money/tax + customers). Listed for the
// record; the enforcement rule is "purgeable list only, everything else kept".
const RETAINED_COLLECTIONS = new Set([
  "customers", "invoices", "payments", "accountingTransactions", "expenses",
  "payrollPeriods", "payrollPreparations", "payrollLines", "taxPeriods",
  "paymentMethods", "stripe_webhook_events", "quotes", "quoteRevisions",
]);
const PURGEABLE_SEGMENTS = new Set([
  "Site-Visit", "Site-Capture", "Job", "Document-Scan", "RepairGuide",
]);
// Retained segments include Quote, HistoricalQuoteAssets, Meetings, Business,
// DataDumps (the archives themselves) and anything unknown.

function cors(request: Request): HeadersInit {
  const origin = request.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "vary": "Origin, Access-Control-Request-Headers",
  };
}
function json(request: Request, status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status, headers: cors(request) });
}
function safeMessage(error: unknown): string {
  return String(error instanceof Error ? error.message : error || "Request failed.")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/sb_secret_[A-Za-z0-9_-]+/g, "[REDACTED_KEY]")
    .slice(0, 700);
}
async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface FileEntry {
  path: string; bytes: number; sha256: string;
  segment: string; recordKey: string; purgeable: boolean;
  keepOnServer?: boolean;
}

// --- marked photos: "Keep on server — example of work" (Rick, 2026-10-22) --
// The flag lives on the documents record payload as 'Keep On Server': true.
// Returns the flagged record keys and the flagged files' storage paths so
// both the dump manifest and the purge can honor it.
async function markedKeepSet(
  sb: ReturnType<typeof createClient>, businessId: string,
): Promise<{ recordKeys: Set<string>; paths: Set<string> }> {
  const recordKeys = new Set<string>();
  const paths = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.from("business_records")
      .select("record_key, payload")
      .eq("business_id", businessId).eq("collection", "documents")
      .eq("record_status", "active")
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    for (const r of data || []) {
      const payload = (r.payload || {}) as Record<string, unknown>;
      const flag = payload["Keep On Server"];
      if (flag === true || flag === "true") {
        recordKeys.add(String(r.record_key));
        const p = String(payload["Storage Path"] || "");
        if (p) paths.add(p);
      }
    }
    if (!data || data.length < 1000) break;
  }
  return { recordKeys, paths };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors(request) });
  if (request.method !== "POST") return json(request, 405, { error: "POST only." });
  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "");
    const businessId = String(body?.businessId || "");
    if (!businessId) return json(request, 400, { error: "businessId is required." });

    // --- authenticate + authorize ------------------------------------------
    const authHeader = request.headers.get("Authorization") || "";
    if (!authHeader) return json(request, 401, { error: "Sign-in required." });
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json(request, 401, { error: "Sign-in required." });
    const user = userData.user;

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const roleFor = async (bid: string): Promise<string> => {
      const { data } = await sb.from("business_memberships")
        .select("role").eq("business_id", bid).eq("auth_user_id", user.id)
        .eq("status", "active").limit(1).maybeSingle();
      return String(data?.role || "");
    };
    const role = await roleFor(businessId);
    const platformRole = businessId === H38 ? role : await roleFor(H38);
    const isMember = role === "owner" || role === "administrator";
    const isPlatform = platformRole === "owner" || platformRole === "administrator";
    if (!isMember && !isPlatform) {
      return json(request, 403, { error: "Only the business's owners and administrators can do this." });
    }
    const canPurge = role === "owner" || platformRole === "owner";
    // ------------------------------------------------------------------------

    if (action === "years") {
      const years = new Set<number>();
      const { data: recs } = await sb.from("business_records")
        .select("created_at").eq("business_id", businessId).limit(5000);
      for (const r of recs || []) {
        const y = new Date(String(r.created_at)).getUTCFullYear();
        if (y >= 2000 && y <= 2100) years.add(y);
      }
      const objs = await listAll(sb, businessId + "/");
      for (const o of objs) {
        const y = new Date(String(o.created_at || "")).getUTCFullYear();
        if (y >= 2000 && y <= 2100) years.add(y);
      }
      return json(request, 200, { years: Array.from(years).sort((a, b) => b - a) });
    }

    if (action === "create") {
      const year = Number(body?.year);
      if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        return json(request, 400, { error: "A valid year is required." });
      }
      let { data: dump } = await sb.from("business_data_dumps")
        .select("*").eq("business_id", businessId).eq("dump_year", year).maybeSingle();
      if (dump && (dump.status === "ready" || dump.status === "purged")) {
        return json(request, 200, { dump: await withSignedUrls(sb, dump) });
      }
      if (!dump) {
        const ins = await sb.from("business_data_dumps")
          .insert({ business_id: businessId, dump_year: year, status: "building", requested_by: user.id })
          .select("*").single();
        if (ins.error) throw new Error(ins.error.message);
        dump = ins.data;
      } else {
        await sb.from("business_data_dumps")
          .update({ status: "building", error: null }).eq("id", dump.id);
      }
      try {
        const built = await buildDump(sb, businessId, year);
        const upd = await sb.from("business_data_dumps").update({
          status: "ready", archive_parts: built.parts, archive_bytes: built.archiveBytes,
          records_exported: built.recordsCount, files_exported: built.files.length,
          files_bytes_exported: built.files.reduce((s, f) => s + f.bytes, 0),
          manifest: built.summary, ready_at: new Date().toISOString(), error: null,
        }).eq("id", dump.id).select("*").single();
        if (upd.error) throw new Error(upd.error.message);
        return json(request, 200, { dump: await withSignedUrls(sb, upd.data) });
      } catch (e) {
        await sb.from("business_data_dumps")
          .update({ status: "failed", error: safeMessage(e) }).eq("id", dump.id);
        return json(request, 500, { error: "Export failed: " + safeMessage(e) });
      }
    }

    if (action === "status") {
      const { data: dump } = await sb.from("business_data_dumps")
        .select("*").eq("id", String(body?.dumpId || "")).eq("business_id", businessId).maybeSingle();
      if (!dump) return json(request, 404, { error: "Dump not found." });
      return json(request, 200, { dump: await withSignedUrls(sb, dump) });
    }

    if (action === "list") {
      const { data: dumps } = await sb.from("business_data_dumps")
        .select("*").eq("business_id", businessId).order("dump_year", { ascending: false });
      const out = [];
      for (const d of dumps || []) out.push(await withSignedUrls(sb, d));
      return json(request, 200, { dumps: out });
    }

    if (action === "purge") {
      if (body?.confirm !== true) {
        return json(request, 400, { error: "Purge requires explicit confirmation (confirm: true)." });
      }
      if (!canPurge) {
        return json(request, 403, { error: "Only the business owner can confirm a purge." });
      }
      const { data: dump } = await sb.from("business_data_dumps")
        .select("*").eq("id", String(body?.dumpId || "")).eq("business_id", businessId).maybeSingle();
      if (!dump) return json(request, 404, { error: "Dump not found." });
      if (dump.status === "purged") {
        await sb.from("business_data_purge_audit").insert({
          business_id: businessId, dump_id: dump.id, dump_year: dump.dump_year,
          actor_user_id: user.id, action: "purge_noop",
          detail: { reason: "already purged" },
        });
        return json(request, 200, { alreadyPurged: true, dump });
      }
      if (dump.status !== "ready") {
        return json(request, 409, {
          error: "Purge is only available after the export is generated and downloadable (status: ready).",
        });
      }
      const result = await runPurge(sb, businessId, dump, user.id);
      return json(request, 200, result);
    }

    if (action === "deleteDump") {
      const { data: dump } = await sb.from("business_data_dumps")
        .select("*").eq("id", String(body?.dumpId || "")).eq("business_id", businessId).maybeSingle();
      if (!dump) return json(request, 404, { error: "Dump not found." });
      const paths: string[] = (dump.archive_parts || []).map((p: { path: string }) => p.path);
      paths.push(manifestPath(businessId, dump.dump_year));
      if (paths.length) await sb.storage.from(BUCKET).remove(paths);
      await sb.from("business_data_dumps")
        .update({ status: "archive_deleted", archive_parts: [] }).eq("id", dump.id);
      await sb.rpc("compute_business_data_usage");
      return json(request, 200, { deleted: true });
    }

    return json(request, 400, { error: "Unknown action." });
  } catch (e) {
    return json(request, 500, { error: safeMessage(e) });
  }
});

function manifestPath(businessId: string, year: number): string {
  return `${businessId}/DataDumps/${year}/manifest.json`;
}

async function withSignedUrls(sb: ReturnType<typeof createClient>, dump: Record<string, unknown>) {
  const parts = (dump.archive_parts as { path: string; bytes: number }[]) || [];
  const paths = parts.map((p) => p.path);
  let downloads: { path: string; url: string }[] = [];
  if (paths.length) {
    const { data } = await sb.storage.from(BUCKET).createSignedUrls(paths, SIGNED_TTL);
    downloads = (data || []).filter((d) => d.signedUrl)
      .map((d) => ({ path: d.path || "", url: d.signedUrl }));
  }
  return { ...dump, downloads };
}

async function listAll(sb: ReturnType<typeof createClient>, prefix: string) {
  // Recursively list every object under prefix (storage list is one level deep).
  const out: { name: string; path: string; created_at?: string; metadata?: Record<string, unknown> }[] = [];
  const walk = async (dir: string) => {
    let offset = 0;
    for (;;) {
      const { data, error } = await sb.storage.from(BUCKET)
        .list(dir, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw new Error(error.message);
      const rows = data || [];
      for (const row of rows) {
        const p = dir ? `${dir}/${row.name}` : row.name;
        if (row.id) out.push({ name: row.name, path: p, created_at: row.created_at, metadata: row.metadata });
        else await walk(p);
      }
      if (rows.length < 1000) break;
      offset += 1000;
    }
  };
  await walk(prefix.replace(/\/$/, ""));
  return out;
}

async function buildDump(sb: ReturnType<typeof createClient>, businessId: string, year: number) {
  const from = `${year}-01-01T00:00:00Z`;
  const to = `${year + 1}-01-01T00:00:00Z`;

  // Records for the year (ALL collections — the dump is the complete copy).
  const records: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.from("business_records")
      .select("collection, record_key, record_status, payload, created_at, updated_at")
      .eq("business_id", businessId).gte("created_at", from).lt("created_at", to)
      .order("created_at", { ascending: true }).range(offset, offset + 999);
    if (error) throw new Error(error.message);
    records.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const keep = await markedKeepSet(sb, businessId);
  const recordKeys = new Set(records.map((r) => String(r.record_key)));
  const recordIndex = records.map((r) => ({
    collection: String(r.collection), recordKey: String(r.record_key),
    // A marked photo's document record stays with its file (Rick, 2026-10-22).
    purgeable: PURGEABLE_COLLECTIONS.has(String(r.collection)) &&
      !(String(r.collection) === "documents" && keep.recordKeys.has(String(r.record_key))),
    keepOnServer: String(r.collection) === "documents" && keep.recordKeys.has(String(r.record_key)),
  }));

  // Files: attached to an exported record, or uploaded in the year.
  const allFiles = await listAll(sb, businessId + "/");
  const files: FileEntry[] = [];
  const fileData = new Map<string, Uint8Array>();
  for (const f of allFiles) {
    const seg = f.path.split("/")[1] || "";
    if (seg === "DataDumps") continue; // never re-export archives
    const recordKey = f.path.split("/")[2] || "";
    const fileYear = new Date(String(f.created_at || "")).getUTCFullYear();
    if (!recordKeys.has(recordKey) && fileYear !== year) continue;
    const { data, error } = await sb.storage.from(BUCKET).download(f.path);
    if (error) throw new Error("Download failed for " + f.path + ": " + error.message);
    const bytes = new Uint8Array(await data.arrayBuffer());
    fileData.set(f.path, bytes);
    // Marked photos are exported like everything else (the archive is
    // always complete) but are never purgeable.
    const kept = keep.paths.has(f.path) || keep.recordKeys.has(recordKey);
    files.push({
      path: f.path, bytes: bytes.length, sha256: await sha256Hex(bytes),
      segment: seg, recordKey,
      purgeable: PURGEABLE_SEGMENTS.has(seg) && !kept,
      keepOnServer: kept,
    });
  }

  const byCollection: Record<string, number> = {};
  for (const r of records) byCollection[String(r.collection)] = (byCollection[String(r.collection)] || 0) + 1;
  const summary = {
    businessId, year, generatedAt: new Date().toISOString(),
    records: { count: records.length, byCollection },
    files: { count: files.length, bytes: files.reduce((s, f) => s + f.bytes, 0) },
    filesKeptOnServer: files.filter((f) => f.keepOnServer).length,
    retentionNote: "Purge (a separate, explicit step) removes only purgeable classes listed in the manifest. Accounting records (invoices, payments, GL, payroll, tax) and customer records are always retained on the server. Photos marked 'Keep on server — example of work' (and their document records) are also always retained on the server and keep counting toward the data meter.",
  };
  const manifest = { ...summary, recordsIndex: recordIndex, files };
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
  await sb.storage.from(BUCKET).upload(manifestPath(businessId, year), new Blob([manifestBytes], { type: "application/json" }), { upsert: true });

  const recordsJson = new TextEncoder().encode(JSON.stringify({
    businessId, year, exportedAt: summary.generatedAt, records,
  }, null, 2));
  const readme = new TextEncoder().encode(
    `Highway 38 Solutions — data export for ${year}\n\n` +
    `This archive is your copy of one year of your Office data: records.json (structured export of every record created that year) plus your files under files/. ` +
    `The full manifest (file list with checksums) is the manifest.json stored next to these archives in your Office files.\n\n` +
    `If you later choose to purge this year from the server, only old operational bulk is removed (job photos, site-scan captures, attachments, old operational records). ` +
    `Invoices, payments, accounting, payroll, tax records and customer records always stay on the server. ` +
    `Photos you marked "Keep on server — example of work" in the Office also always stay on the server.\n`);

  // Pack parts.
  const parts: { path: string; bytes: number }[] = [];
  let partNo = 0;
  let current: Record<string, [Uint8Array, { level: number }]> = {};
  let currentBytes = 0;
  const flush = async () => {
    if (!Object.keys(current).length) return;
    partNo += 1;
    const zipBytes = zipSync(current);
    const path = `${businessId}/DataDumps/${year}/export-part-${partNo}.zip`;
    const { error } = await sb.storage.from(BUCKET)
      .upload(path, new Blob([zipBytes], { type: "application/zip" }), { upsert: true });
    if (error) throw new Error(error.message);
    parts.push({ path, bytes: zipBytes.length });
    current = {}; currentBytes = 0;
  };
  current["README.txt"] = [readme, { level: 0 }];
  current["records.json"] = [recordsJson, { level: 6 }];
  currentBytes += recordsJson.length;
  for (const f of files) {
    const data = fileData.get(f.path)!;
    if (currentBytes + data.length > PART_CAP && Object.keys(current).length > 2) await flush();
    current[`files/${f.path.split("/").slice(1).join("/")}`] = [data, { level: 0 }];
    currentBytes += data.length;
  }
  await flush();

  return {
    parts, files,
    archiveBytes: parts.reduce((s, p) => s + p.bytes, 0),
    recordsCount: records.length, summary,
  };
}

async function runPurge(
  sb: ReturnType<typeof createClient>, businessId: string,
  dump: Record<string, unknown>, actorId: string,
) {
  const year = Number(dump.dump_year);
  // The dump manifest is authoritative: purge exactly what was exported,
  // and only the classes marked purgeable in it.
  const { data: manifestBlob, error: mErr } = await sb.storage.from(BUCKET)
    .download(manifestPath(businessId, year));
  if (mErr || !manifestBlob) throw new Error("Dump manifest is missing; purge cannot run safely.");
  const manifest = JSON.parse(await manifestBlob.text());

  const beforeRes = await sb.from("business_data_usage")
    .select("total_bytes").eq("business_id", businessId).maybeSingle();
  const totalBefore = Number(beforeRes.data?.total_bytes || 0);

  // Marked photos: re-check the flags LIVE (Rick, 2026-10-22) — a photo
  // marked after this export was built is still kept. Manifest keep marks
  // are honored too (union of both).
  const liveKeep = await markedKeepSet(sb, businessId);
  const keptFilePaths = new Set<string>(
    (manifest.files || []).filter((f: FileEntry) => f.keepOnServer).map((f: FileEntry) => f.path),
  );
  const keptRecordKeys = new Set<string>(
    (manifest.recordsIndex || [])
      .filter((r: { keepOnServer?: boolean }) => r.keepOnServer)
      .map((r: { recordKey: string }) => r.recordKey),
  );

  const recordKeys: string[] = (manifest.recordsIndex || [])
    .filter((r: { purgeable: boolean }) => r.purgeable)
    .map((r: { recordKey: string }) => r.recordKey)
    .filter((k: string) => !liveKeep.recordKeys.has(k) && !keptRecordKeys.has(k));
  const recordsKept = (manifest.recordsIndex || [])
    .filter((r: { purgeable: boolean; collection: string }) =>
      r.collection === "documents" && (liveKeep.recordKeys.has(r.recordKey) || keptRecordKeys.has(r.recordKey)))
    .length;
  let recordsDeleted = 0;
  for (let i = 0; i < recordKeys.length; i += 200) {
    const batch = recordKeys.slice(i, i + 200);
    const { data, error } = await sb.from("business_records")
      .delete().eq("business_id", businessId).in("record_key", batch)
      .in("collection", Array.from(PURGEABLE_COLLECTIONS)).select("id");
    if (error) throw new Error(error.message);
    recordsDeleted += (data || []).length;
  }

  const candidateFiles = (manifest.files || []).filter((f: FileEntry) => f.purgeable);
  const filePaths: string[] = candidateFiles
    .filter((f: FileEntry) => !liveKeep.paths.has(f.path) && !liveKeep.recordKeys.has(f.recordKey) && !keptFilePaths.has(f.path))
    .map((f: FileEntry) => f.path);
  const filesKept = candidateFiles.length - filePaths.length;
  let filesDeleted = 0;
  for (let i = 0; i < filePaths.length; i += 100) {
    const batch = filePaths.slice(i, i + 100);
    const { data, error } = await sb.storage.from(BUCKET).remove(batch);
    if (error) throw new Error(error.message);
    filesDeleted += (data || []).length;
  }

  await sb.rpc("compute_business_data_usage");
  const afterRes = await sb.from("business_data_usage")
    .select("total_bytes").eq("business_id", businessId).maybeSingle();
  const totalAfter = Number(afterRes.data?.total_bytes || 0);
  const bytesFreed = Math.max(0, totalBefore - totalAfter);

  await sb.from("business_data_dumps").update({
    status: "purged", purged_at: new Date().toISOString(), purged_by: actorId,
    purge_records_deleted: recordsDeleted, purge_files_deleted: filesDeleted,
    purge_bytes_freed: bytesFreed,
  }).eq("id", dump.id);
  await sb.from("business_data_purge_audit").insert({
    business_id: businessId, dump_id: dump.id, dump_year: year,
    actor_user_id: actorId, action: "purge",
    records_deleted: recordsDeleted, files_deleted: filesDeleted,
    bytes_freed: bytesFreed,
    detail: {
      totalBefore, totalAfter, filesKeptOnServer: filesKept, documentRecordsKept: recordsKept,
      retainedNote: "Only manifest-listed purgeable classes were deleted; accounting + customer records retained. Photos marked 'Keep on server' (files + their document records) were retained on the server and still count toward the meter.",
    },
  });
  return {
    purged: true, recordsDeleted, filesDeleted, bytesFreed,
    filesKeptOnServer: filesKept, documentRecordsKept: recordsKept,
    usageBefore: totalBefore, usageAfter: totalAfter,
  };
}
