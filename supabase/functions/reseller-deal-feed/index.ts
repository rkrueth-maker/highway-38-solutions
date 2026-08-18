import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_USER_IDS = new Set([
  "ccf25333-47cd-42ca-a20b-cdbc63a8a695",
  "6dd51b31-5974-4691-b8b8-83e5877528c0",
]);
const ALLOWED_ORIGINS = new Set([
  "https://highway38solutions.com",
  "https://www.highway38solutions.com",
  "https://rkrueth-maker.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const FEEDS = [
  { url: "https://www.dealnews.com/?rss=1&sort=time", hot: false },
  { url: "https://www.dealnews.com/?rss=1&sort=hotness", hot: true },
];

type FeedItem = {
  title: string;
  link: string;
  description: string;
  published_at: string;
  source: string;
  hot: boolean;
};

function origin(request: Request): string {
  return String(request.headers.get("origin") || "").trim().replace(/\/+$/, "");
}
function headers(request: Request): HeadersInit {
  const requestOrigin = origin(request);
  return {
    "access-control-allow-origin": requestOrigin && ALLOWED_ORIGINS.has(requestOrigin) ? requestOrigin : "https://highway38solutions.com",
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-max-age": "600",
    "cache-control": "private, max-age=120",
    "content-type": "application/json; charset=utf-8",
    "vary": "Origin",
  };
}
function json(request: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: headers(request) });
}
function bearer(request: Request): string {
  return String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
}
async function signedInUserId(request: Request): Promise<string> {
  const token = bearer(request);
  if (!token) throw new Error("Supabase Auth session is required.");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase Auth configuration is unavailable.");
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      authorization: `Bearer ${token}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      "x-client-info": "h38-private-reseller-feed-v1",
    },
    signal: AbortSignal.timeout(15000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload?.id !== "string") throw new Error("Supabase Auth session is invalid or expired.");
  return payload.id;
}
function decodeXml(value: string): string {
  return value
    .replace(/^<!\[CDATA\[|\]\]>$/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}
function tag(item: string, name: string): string {
  const match = item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}
function parseFeed(xml: string, hot: boolean): FeedItem[] {
  const rows = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  return rows.map((item) => ({
    title: tag(item, "title"),
    link: tag(item, "link"),
    description: tag(item, "description"),
    published_at: tag(item, "pubDate"),
    source: "DealNews RSS",
    hot,
  })).filter((item) => item.title && item.link);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(request) });
  if (request.method !== "GET") return json(request, 405, { error: "Method not allowed." });
  try {
    const userId = await signedInUserId(request);
    if (!ALLOWED_USER_IDS.has(userId)) return json(request, 403, { error: "This private reseller feed is not enabled for this account." });
    const results = await Promise.all(FEEDS.map(async (feed) => {
      const response = await fetch(feed.url, {
        headers: { "user-agent": "Highway38Solutions-PrivateResellerScout/1.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`Deal feed returned ${response.status}.`);
      return parseFeed(await response.text(), feed.hot);
    }));
    const byLink = new Map<string, FeedItem>();
    for (const item of results.flat()) {
      const prior = byLink.get(item.link);
      byLink.set(item.link, prior ? { ...prior, hot: prior.hot || item.hot } : item);
    }
    const items = Array.from(byLink.values()).slice(0, 40);
    return json(request, 200, { status: "PASS", source: "DealNews RSS", fetched_at: new Date().toISOString(), items });
  } catch (error) {
    return json(request, 502, { error: error instanceof Error ? error.message : String(error) });
  }
});
