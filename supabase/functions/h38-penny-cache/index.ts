import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

type Any = Record<string, any>;
const BASE = Deno.env.get("SUPABASE_URL") || "",
  ANON = Deno.env.get("SUPABASE_ANON_KEY") || "",
  SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const IMAGE_BUCKET = "h38-penny-images",
  MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);
const REMOTE_IMAGE_HOSTS = [
  "scene7.com",
  "dollargeneral.com",
  "pennycentral.com",
  "thdstatic.com",
  "openfoodfacts.org",
  "openbeautyfacts.org",
  "openproductsfacts.org",
  "openpetfoodfacts.org",
  "retailshout.com",
  "pennytree.org",
  "walmartimages.com",
  "cloudfront.net",
];
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });
const txt = (v: any) => String(v ?? "").trim(),
  digits = (v: any) => txt(v).replace(/\D/g, "");
const numOrNull = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
function adminClient() {
  if (!SERVICE) throw new Error("SUPABASE_SERVICE_ROLE_KEY unavailable");
  return createClient(BASE, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
function retailerKey(v: any) {
  const s = txt(v)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (s.includes("home depot")) return "home depot";
  if (s.includes("family dollar")) return "family dollar";
  if (s.includes("dollar general")) return "dollar general";
  if (s.includes("dollar tree")) return "dollar tree";
  if (s.includes("lowe")) return "lowes";
  return s || "other";
}
function strictRetailer(v: any) {
  const k = retailerKey(v);
  return k === "dollar general" || k === "dollar tree";
}
function junkTitle(v: any) {
  const s = txt(v).replace(/\s+/g, " ").trim(),
    a = s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return (
    !a ||
    a.length < 3 ||
    /add the first photo|inventory checker/.test(a) ||
    [
      "penny",
      "penny item",
      "item",
      "product",
      "unknown",
      "search",
      "photo recovery",
      "dollar general",
    ].includes(a)
  );
}
function canonicalKey(r: Any) {
  const retailer = retailerKey(r?.retailer || r?.store_name || r?.source_name),
    upc = digits(r?.upc || r?.gtin || r?.barcode).replace(/^0+/, ""),
    sku = digits(r?.sku || r?.store_sku || r?.internet_number).replace(
      /^0+/,
      "",
    ),
    title = txt(
      r?.source_identity_title ||
        r?.canonical_title ||
        r?.title ||
        r?.product_name ||
        r?.item_name,
    )
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .slice(0, 180);
  if (retailer === "home depot" && sku) return `${retailer}|s:${sku}`;
  if (upc) return `${retailer}|u:${upc}`;
  if (sku) return `${retailer}|s:${sku}`;
  return title ? `${retailer}|t:${title}` : "";
}
function sanitizePayload(r: Any) {
  const x = { ...r };
  delete x.image_data_url;
  delete x.image_blob;
  return x;
}
function list(data: any) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.leads)) return data.leads;
  if (data && Array.isArray(data.results)) return data.results;
  if (data && Array.isArray(data.items)) return data.items;
  return [];
}
function normalizedDigits(v: any) {
  return digits(v).replace(/^0+/, "");
}
function repair2001Partial(d: Date) {
  const now = new Date();
  let y = now.getUTCFullYear(),
    candidate = new Date(Date.UTC(y, d.getUTCMonth(), d.getUTCDate(), 12));
  if (candidate.getTime() > Date.now() + 36 * 3600_000)
    candidate = new Date(Date.UTC(y - 1, d.getUTCMonth(), d.getUTCDate(), 12));
  return candidate;
}
function parseSourceDate(v: any): string | null {
  const s = txt(v);
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower === "today") {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    return d.toISOString();
  }
  if (lower === "yesterday") {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    d.setHours(12, 0, 0, 0);
    return d.toISOString();
  }
  let d = new Date(s);
  if (!Number.isFinite(d.getTime())) return null;
  if (d.getUTCFullYear() === 2001 && /^2001-\d{2}-\d{2}$/.test(s))
    d = repair2001Partial(d);
  const y = d.getUTCFullYear();
  if (y < 2024 || d.getTime() > Date.now() + 36 * 3600_000) return null;
  return d.toISOString();
}
function dateRank(kind: any) {
  const k = txt(kind);
  if (k === "pennied_at" || k === "pennied_at_repaired_partial_year") return3;
  if (k === "reported_at") return2;
  if (k === "first_captured") return1;
  return0;
}
function sourceDateFor(r: Any, prior?: Any) {
  const raw = txt(r?.pennied_at);
  let at = parseSourceDate(raw),
    kind = at
      ? raw.startsWith("2001-")
        ? "pennied_at_repaired_partial_year"
        : "pennied_at"
      : "";
  if (!at) {
    at =
      parseSourceDate(r?.posted_date) ||
      parseSourceDate(r?.last_seen) ||
      parseSourceDate(r?.signal_observed_at);
    if (!at && Array.isArray(r?.signal_sources)) {
      const dates = r.signal_sources
        .map((s: Any) => parseSourceDate(s?.observed_at))
        .filter(Boolean)
        .sort()
        .reverse();
      at = dates[0] || null;
    }
    if (at) kind = "reported_at";
  }
  const priorAt = parseSourceDate(prior?.penny_sort_at),
    priorKind = txt(prior?.penny_date_kind);
  if (priorAt && dateRank(priorKind) > dateRank(kind))
    return { at: priorAt, kind: priorKind };
  if (priorAt && dateRank(priorKind) === dateRank(kind) && dateRank(kind) < 3)
    return { at: priorAt, kind: priorKind };
  if (at) return { at, kind };
  if (priorAt) return { at: priorAt, kind: priorKind || "first_captured" };
  return { at: new Date().toISOString(), kind: "first_captured" };
}
function rawImage(r: Any) {
  const u = txt(
    r?.image_url ||
      r?.image ||
      r?.thumbnail_url ||
      r?.thumbnail ||
      r?.product_image_url ||
      r?.primary_image_url ||
      r?.source_image_url ||
      r?.photo_url,
  );
  if (
    !/^https:\/\//i.test(u) ||
    /(?:placeholder|blank|spacer|logo|favicon|sprite|pixel|loading|no-image)/i.test(
      u,
    )
  )
    return "";
  return u;
}
function safeRemoteImage(raw: any) {
  try {
    const u = new URL(txt(raw));
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    return (
      REMOTE_IMAGE_HOSTS.some((x) => h === x || h.endsWith("." + x)) &&
      !/(?:placeholder|blank|spacer|logo|favicon|sprite|pixel|loading|no-image)/i.test(
        u.pathname + u.search,
      )
    );
  } catch {
    return false;
  }
}
async function imagePath(key: string, mime: string) {
  const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)),
    ),
    hash = Array.from(digest)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 40),
    ext =
      mime === "image/png"
        ? "png"
        : mime === "image/webp"
          ? "webp"
          : mime === "image/gif"
            ? "gif"
            : mime === "image/avif"
              ? "avif"
              : "jpg";
  return `${hash.slice(0, 2)}/${hash}.${ext}`;
}
function decodeDataUrl(dataUrl: string) {
  const m =
    /^data:(image\/(?:jpeg|png|webp|gif|avif));base64,([A-Za-z0-9+/=\s]+)$/i.exec(
      dataUrl,
    );
  if (!m) return null;
  const mime = m[1].toLowerCase();
  if (!IMAGE_MIMES.has(mime)) return null;
  try {
    const bin = atob(m[2].replace(/\s/g, ""));
    if (!bin.length || bin.length > MAX_IMAGE_BYTES) return null;
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { mime, bytes };
  } catch {
    return null;
  }
}
async function fetchRemoteImage(url: string) {
  if (!safeRemoteImage(url)) return null;
  try {
    const r = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 H38Deals/3.1",
        accept: "image/avif,image/webp,image/*,*/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const mime = (r.headers.get("content-type") || "")
      .split(";")[0]
      .toLowerCase();
    if (!IMAGE_MIMES.has(mime)) return null;
    const len = Number(r.headers.get("content-length") || 0);
    if (len > MAX_IMAGE_BYTES) return null;
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return null;
    return { mime, bytes, sourceUrl: r.url };
  } catch {
    return null;
  }
}
async function storeImage(admin: any, key: string, input: Any) {
  const { data: row } = await admin
    .from("reseller_hunt_cache")
    .select("retailer,upc")
    .eq("canonical_key", key)
    .maybeSingle();
  if (!row) return null;
  const strict = strictRetailer(row.retailer),
    barcode = normalizedDigits(input?.barcode),
    rowUpc = normalizedDigits(row.upc);
  let got: any = null,
    sourceUrl = txt(input?.image_url || input?.source_url);
  if (strict) {
    if (
      input?.identity_verified !== true ||
      !barcode ||
      !rowUpc ||
      barcode !== rowUpc
    )
      return null;
    got = decodeDataUrl(txt(input?.data_url));
    if (!got) return null;
  } else {
    got = decodeDataUrl(txt(input?.data_url));
    if (!got && sourceUrl) {
      got = await fetchRemoteImage(sourceUrl);
      sourceUrl = got?.sourceUrl || sourceUrl;
    }
  }
  if (!got) return null;
  const path = await imagePath(key, got.mime);
  const { error } = await admin.storage
    .from(IMAGE_BUCKET)
    .upload(path, got.bytes, {
      contentType: got.mime,
      cacheControl: "31536000",
      upsert: true,
    });
  if (error) return null;
  const publicUrl = admin.storage.from(IMAGE_BUCKET).getPublicUrl(path)
    .data.publicUrl;
  const { error: dbError } = await admin
    .from("reseller_hunt_cache")
    .update({
      image_url: publicUrl,
      image_storage_path: path,
      image_cached_at: new Date().toISOString(),
      image_source_url: sourceUrl || "",
      image_mime: got.mime,
      last_changed_at: new Date().toISOString(),
    })
    .eq("canonical_key", key);
  if (dbError) return null;
  return { key, cached_url: publicUrl, path, mime: got.mime };
}
async function invokeFunction(
  slug: string,
  auth: string,
  body: Any,
  timeoutMs: number,
) {
  try {
    const r = await fetch(`${BASE}/functions/v1/${slug}`, {
        method: "POST",
        headers: {
          Authorization: auth,
          apikey: ANON,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      }),
      text = await r.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    return { ok: r.ok, status: r.status, text, data };
  } catch (e) {
    return {
      ok: false,
      status: 598,
      text: e instanceof Error ? e.message : String(e),
      data: {},
    };
  }
}
async function authenticatedUser(auth: string) {
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const sb = createClient(BASE, ANON, {
    global: { headers: { Authorization: auth } },
  });
  const {
    data: { user },
    error,
  } = await sb.auth.getUser(token);
  if (error || !user) return null;
  const { data: ent } = await sb
    .from("h38_product_entitlements")
    .select("active,expires_at")
    .eq("user_id", user.id)
    .eq("product_key", "penny")
    .maybeSingle();
  if (
    !ent?.active ||
    (ent.expires_at && Date.parse(ent.expires_at) <= Date.now())
  )
    return null;
  return user;
}
async function readMeta(admin: any) {
  const { data } = await admin
    .from("reseller_hunt_cache_meta")
    .select("*")
    .eq("cache_key", "penny")
    .maybeSingle();
  return data || { cache_key: "penny", scan_status: "idle" };
}
function rowCmp(a: Any, b: Any) {
  const ra = dateRank(a.penny_date_kind),
    rb = dateRank(b.penny_date_kind);
  if (rb !== ra) return rb - ra;
  const da = Date.parse(a.penny_sort_at || 0) || 0,
    db = Date.parse(b.penny_sort_at || 0) || 0;
  return db - da;
}
async function readCache(admin: any) {
  const { data, error } = await admin
    .from("reseller_hunt_cache")
    .select(
      "canonical_key,retailer,title,upc,sku,deal_type,buy_price,retail_price,image_url,image_storage_path,image_cached_at,image_source_url,image_mime,source_url,source_bucket,payload,penny_sort_at,penny_date_kind,first_seen_at,last_seen_at,last_changed_at,seen_count",
    )
    .eq("active", true)
    .limit(1000);
  if (error) throw error;
  return (data || [])
    .filter((r: Any) => !junkTitle(r.title))
    .sort(rowCmp)
    .map((r: Any) => {
      const p = r?.payload && typeof r.payload === "object" ? r.payload : {},
        direct = dateRank(r.penny_date_kind) === 3,
        cached = !!r.image_storage_path;
      return {
        ...p,
        id: p.id || r.canonical_key,
        canonical_id: p.canonical_id || r.canonical_key,
        retailer: r.retailer || p.retailer,
        title: r.title || p.title,
        canonical_title: r.title || p.canonical_title || p.title,
        upc: r.upc || p.upc || "",
        sku: r.sku || p.sku || "",
        deal_type: r.deal_type || p.deal_type || "candidate",
        buy_price: retailerKey(r.retailer || p.retailer) === "home depot" &&
            Number(r.buy_price ?? p.buy_price) === 0
          ? null
          : r.buy_price ?? p.buy_price,
        retail_price: r.retail_price ?? p.retail_price,
        image_url: r.image_url || p.image_url || "",
        image_source_scope: cached ? "exact_product" : p.image_source_scope,
        image_source_proof: cached
          ? "h38_penny_cache_verified_image"
          : p.image_source_proof,
        source_url: r.source_url || p.source_url || "",
        pennied_at: direct ? r.penny_sort_at : "",
        reported_at:
          !direct && r.penny_date_kind === "reported_at" ? r.penny_sort_at : "",
        penny_sort_at: r.penny_sort_at,
        penny_date_kind: r.penny_date_kind,
        h38_cache_key: r.canonical_key,
        h38_cache_bucket: r.source_bucket,
        h38_cache_first_seen_at: r.first_seen_at,
        h38_cache_last_seen_at: r.last_seen_at,
        h38_cache_seen_count: r.seen_count,
        h38_image_cached: cached,
        h38_image_cached_at: r.image_cached_at,
      };
    });
}
async function persistRows(admin: any, rows: Any[], sourceBucket: string) {
  const normalized = rows
    .map((r) => ({
      r,
      key: canonicalKey(r),
      title: txt(
        r?.source_identity_title ||
          r?.canonical_title ||
          r?.title ||
          r?.product_name ||
          r?.item_name,
      ),
    }))
    .filter((x) => x.key && !junkTitle(x.title));
  if (!normalized.length)
    return {
      new_count: 0,
      updated_count: 0,
      total_count: (await readCache(admin)).length,
    };
  const keys = [...new Set(normalized.map((x) => x.key))],
    { data: existing } = await admin
      .from("reseller_hunt_cache")
      .select(
        "canonical_key,image_url,image_storage_path,image_cached_at,image_source_url,image_mime,penny_sort_at,penny_date_kind,seen_count",
      )
      .in("canonical_key", keys),
    old = new Map((existing || []).map((r: Any) => [r.canonical_key, r]));
  let newCount = 0,
    updatedCount = 0;
  const now = new Date().toISOString(),
    upserts = normalized.map(({ r, key, title }) => {
      const prior: any = old.get(key);
      prior ? updatedCount++ : newCount++;
      const dt = sourceDateFor(r, prior),
        incomingImage = rawImage(r),
        image = prior?.image_storage_path
          ? prior.image_url
          : incomingImage || prior?.image_url || "",
        sourceImage = prior?.image_storage_path
          ? prior.image_source_url || incomingImage
          : incomingImage || prior?.image_source_url || "";
      return {
        canonical_key: key,
        retailer: txt(r.retailer || r.store_name || r.source_name),
        title,
        upc: digits(r.upc || r.gtin || r.barcode),
        sku: txt(r.sku || r.store_sku || r.internet_number),
        deal_type: txt(
          r.deal_type ||
            (Number(r.reported_penny_price) === 0.01 ? "penny" : "candidate"),
        ),
        buy_price: numOrNull(
          r.buy_price ??
            r.price ??
            r.current_price ??
            r.sale_price ??
            r.deal_price,
        ),
        retail_price: numOrNull(
          r.retail_price ??
            r.regular_price ??
            r.msrp ??
            r.reference_price ??
            r.original_price,
        ),
        image_url: image,
        image_storage_path: prior?.image_storage_path || "",
        image_cached_at: prior?.image_cached_at || null,
        image_source_url: sourceImage,
        image_mime: prior?.image_mime || "",
        source_url: txt(r.source_item_url || r.source_url || r.url),
        source_bucket: sourceBucket,
        payload: sanitizePayload(r),
        penny_sort_at: dt.at,
        penny_date_kind: dt.kind,
        last_seen_at: now,
        last_changed_at: now,
        seen_count: Number(prior?.seen_count || 0) + 1,
        active: true,
      };
    });
  const { error } = await admin
    .from("reseller_hunt_cache")
    .upsert(upserts, { onConflict: "canonical_key" });
  if (error) throw error;
  const { count } = await admin
    .from("reseller_hunt_cache")
    .select("canonical_key", { count: "exact", head: true })
    .eq("active", true);
  return {
    new_count: newCount,
    updated_count: updatedCount,
    total_count: Number(count || 0),
  };
}
async function updateMeta(admin: any, patch: Any) {
  await admin
    .from("reseller_hunt_cache_meta")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("cache_key", "penny");
}
async function acquireLock(admin: any, key: string, staleMs: number) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = crypto.randomUUID(),
      { error } = await admin
        .from("reseller_hunt_scan_locks")
        .insert({
          cache_key: key,
          token,
          acquired_at: new Date().toISOString(),
        });
    if (!error) return token;
    if (error.code !== "23505") throw error;
    const { data: row } = await admin
        .from("reseller_hunt_scan_locks")
        .select("token,acquired_at")
        .eq("cache_key", key)
        .maybeSingle(),
      old = row?.acquired_at ? Date.parse(row.acquired_at) : 0;
    if (!old || Date.now() - old <= staleMs) return null;
    await admin
      .from("reseller_hunt_scan_locks")
      .delete()
      .eq("cache_key", key)
      .eq("token", row.token);
  }
  return null;
}
async function releaseLock(admin: any, key: string, token: string) {
  await admin
    .from("reseller_hunt_scan_locks")
    .delete()
    .eq("cache_key", key)
    .eq("token", token);
}
async function fullRefresh(auth: string, payload: Any, token: string) {
  const admin = adminClient();
  try {
    const full = await invokeFunction(
      "h38-penny-api",
      auth,
      { action: "hunt_full", payload },
      120000,
    );
    if (!full.ok)
      throw new Error(`hunt_full ${full.status}: ${full.text.slice(0, 220)}`);
    const stats = await persistRows(admin, list(full.data?.data), "full-v065");
    await updateMeta(admin, {
      scan_status: "idle",
      scan_finished_at: new Date().toISOString(),
      last_full_scan_at: new Date().toISOString(),
      last_new_count: stats.new_count,
      last_updated_count: stats.updated_count,
      last_total_count: stats.total_count,
      last_error: "",
    });
  } catch (e) {
    await updateMeta(admin, {
      scan_status: "error",
      scan_finished_at: new Date().toISOString(),
      last_error:
        e instanceof Error
          ? e.message.slice(0, 1000)
          : String(e).slice(0, 1000),
    }).catch(() => {});
  } finally {
    await releaseLock(admin, "penny-dg", token).catch(() => {});
  }
}
function referenceFor(p: Any) {
  if (txt(p.image_reference_url)) return txt(p.image_reference_url);
  if (txt(p.source_item_url)) return txt(p.source_item_url);
  if (txt(p.image_source_url)) return txt(p.image_source_url);
  if (txt(p.source_url)) return txt(p.source_url);
  for (const s of Array.isArray(p.signal_sources) ? p.signal_sources : []) {
    const u = txt(s?.item_url || s?.url || s?.source_url);
    if (u) return u;
  }
  return "";
}
async function resolveStrictImages(auth: string, token: string) {
  const admin = adminClient();
  try {
    const { data } = await admin
        .from("reseller_hunt_cache")
        .select("canonical_key,retailer,upc,image_url,payload")
        .eq("active", true)
        .eq("image_storage_path", "")
        .in("retailer", ["Dollar General", "Dollar Tree"])
        .limit(48),
      rows = (data || []).filter(
        (r: Any) =>
          !junkTitle(r?.payload?.title || r?.payload?.canonical_title || "") &&
          digits(r.upc).length >= 6,
      );
    let cursor = 0;
    async function worker() {
      while (cursor < rows.length) {
        const start = cursor;
        ((cursor += 8),
          (part = rows.slice(start, start + 8)),
          (items = part.map((r: Any) => ({
            key: r.canonical_key,
            retailer: r.retailer,
            barcode: r.upc,
            proof:
              r.payload?.image_match_barcode ||
              r.payload?.image_proof_barcode ||
              "",
            image_url: r.image_url || "",
            reference_url: referenceFor(r.payload || {}),
          }))),
          (q = await invokeFunction(
            "reseller-image-delivery-v201",
            auth,
            { items },
            65000,
          )));
        if (!q.ok) continue;
        const images = Array.isArray(q.data?.images) ? q.data.images : [],
          byKey = new Map(part.map((r: Any) => [r.canonical_key, r]));
        for (const x of images) {
          const row: any = byKey.get(txt(x.key));
          if (row && txt(x.data_url))
            await storeImage(admin, row.canonical_key, {
              data_url: x.data_url,
              image_url: txt(x.source_url),
              barcode: row.upc,
              identity_verified: true,
            });
        }
      }
    }
    await Promise.all([worker(), worker()]);
  } finally {
    await releaseLock(admin, "penny-image-resolve", token).catch(() => {});
  }
}
async function mirrorNonstrictImages(token: string) {
  const admin = adminClient();
  try {
    for (let pass = 0; pass < 4; pass++) {
      const { data } = await admin
          .from("reseller_hunt_cache")
          .select("canonical_key,retailer,image_url,image_source_url")
          .eq("active", true)
          .eq("image_storage_path", "")
          .neq("image_url", "")
          .limit(40),
        rows = (data || [])
          .filter(
            (r: Any) =>
              !strictRetailer(r.retailer) &&
              safeRemoteImage(r.image_source_url || r.image_url),
          )
          .slice(0, 24);
      if (!rows.length) break;
      let changed = 0;
      for (let i = 0; i < rows.length; i += 4) {
        const done = await Promise.all(
          rows
            .slice(i, i + 4)
            .map((r: Any) =>
              storeImage(admin, r.canonical_key, {
                image_url: r.image_source_url || r.image_url,
              }),
            ),
        );
        changed += done.filter(Boolean).length;
      }
      if (!changed) break;
    }
  } finally {
    await releaseLock(admin, "penny-image-mirror", token).catch(() => {});
  }
}

async function refreshMenards(admin: any, auth: string, payload: Any) {
  const stores = (Array.isArray(payload.stores) ? payload.stores : [])
    .filter((s: Any) => /menards/i.test(txt(s.retailer || s.store_name)))
    .slice(0, 4);
  if (!stores.length) {
    return {
      leads: await readCache(admin),
      count: 0,
      stores: [],
      warning: "Find nearby stores before checking Ray's List.",
    };
  }
  const rays = await invokeFunction("h38-menards-rays", auth, { stores }, 70000);
  if (!rays.ok) {
    throw new Error(
      `Menards Ray's List ${rays.status}: ${rays.text.slice(0, 220)}`,
    );
  }
  const items = list(rays.data?.data).map((item: Any) => ({
    ...item,
    deal_type: "rays_list",
  }));
  const stats = await persistRows(admin, items, "menards-rays-local");
  const leads = await readCache(admin);
  return {
    leads,
    count: items.length,
    stores: rays.data?.data?.stores || [],
    stats,
  };
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST_REQUIRED" }, 405);
  const auth = req.headers.get("Authorization") || "",
    user = await authenticatedUser(auth);
  if (!user) return json({ error: "AUTH_OR_PRODUCT_REQUIRED" }, 401);
  try {
    const body = await req.json().catch(() => ({})),
      action = txt(body.action || "cache"),
      payload = { ...(body.payload || {}) },
      admin = adminClient();
    if (action === "cache") {
      const [leads, meta] = await Promise.all([
        readCache(admin),
        readMeta(admin),
      ]);
      return json({ ok: true, data: { leads, count: leads.length, meta } });
    }
    if (action === "refresh_menards") {
      return json({
        ok: true,
        data: await refreshMenards(admin, auth, payload),
      });
    }
    if (action === "refresh_fast") {
      const token = await acquireLock(admin, "penny-fast", 45000);
      if (!token) {
        const [leads, meta] = await Promise.all([
          readCache(admin),
          readMeta(admin),
        ]);
        return json({
          ok: true,
          data: {
            leads,
            count: leads.length,
            meta,
            shared_refresh: true,
            already_running: true,
          },
        });
      }
      try {
        const [fast, supp] = await Promise.all([
            invokeFunction(
              "h38-penny-api",
              auth,
              { action: "hunt_fast", payload },
              14000,
            ),
            invokeFunction(
              "h38-penny-api",
              auth,
              { action: "retailer_supplements", payload },
              16000,
            ),
          ]),
          a = await persistRows(
            admin,
            fast.ok ? list(fast.data?.data) : [],
            "fast",
          ),
          b = await persistRows(
            admin,
            supp.ok ? list(supp.data?.data) : [],
            "retailer-supplements",
          ),
          leads = await readCache(admin),
          stats = {
            new_count: a.new_count + b.new_count,
            updated_count: a.updated_count + b.updated_count,
            total_count: leads.length,
          };
        await updateMeta(admin, {
          last_fast_scan_at: new Date().toISOString(),
          last_new_count: stats.new_count,
          last_updated_count: stats.updated_count,
          last_total_count: stats.total_count,
          last_error:
            (!fast.ok ? `fast ${fast.status}; ` : "") +
            (!supp.ok ? `supplements ${supp.status}` : ""),
        });
        return json({
          ok: true,
          data: {
            leads,
            count: leads.length,
            stats,
            fast_ok: fast.ok,
            supplements_ok: supp.ok,
            shared_refresh: false,
          },
        });
      } finally {
        await releaseLock(admin, "penny-fast", token).catch(() => {});
      }
    }
    if (action === "refresh_dg") {
      const token = await acquireLock(admin, "penny-dg", 5 * 60 * 1000);
      if (!token) {
        const meta = await readMeta(admin);
        return json({
          ok: true,
          data: {
            started: false,
            already_running: true,
            shared_refresh: true,
            meta,
          },
        });
      }
      await updateMeta(admin, {
        scan_status: "running",
        scan_started_at: new Date().toISOString(),
        scan_finished_at: null,
        last_error: "",
      });
      EdgeRuntime.waitUntil(fullRefresh(auth, payload, token));
      return json({
        ok: true,
        data: { started: true, background: true, shared_refresh: false },
      });
    }
    if (action === "resolve_images") {
      const token = await acquireLock(
        admin,
        "penny-image-resolve",
        8 * 60 * 1000,
      );
      if (!token)
        return json({
          ok: true,
          data: { started: false, already_running: true, shared_refresh: true },
        });
      EdgeRuntime.waitUntil(resolveStrictImages(auth, token));
      return json({ ok: true, data: { started: true, background: true } });
    }
    if (action === "mirror_images") {
      const token = await acquireLock(
        admin,
        "penny-image-mirror",
        8 * 60 * 1000,
      );
      if (!token)
        return json({
          ok: true,
          data: { started: false, already_running: true, shared_refresh: true },
        });
      EdgeRuntime.waitUntil(mirrorNonstrictImages(token));
      return json({ ok: true, data: { started: true, background: true } });
    }
    if (action === "cache_images") {
      const images = Array.isArray(payload.images)
          ? payload.images.slice(0, 8)
          : [],
        saved = (
          await Promise.all(
            images.map(async (x: Any) => {
              const key = txt(x.key);
              return key ? await storeImage(admin, key, x) : null;
            }),
          )
        ).filter(Boolean);
      return json({ ok: true, data: { saved: saved.length, images: saved } });
    }
    return json({ error: "UNKNOWN_ACTION" }, 400);
  } catch (e) {
    return json(
      {
        error: "H38_PENNY_CACHE_ERROR",
        detail: e instanceof Error ? e.message : String(e),
      },
      500,
    );
  }
});
