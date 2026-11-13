import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Household sharing for the Our Kitchen recipe app (recipes.html).
// One shared shopping list + one future-purchase watch list per household.
// A household is identified only by its unguessable token (the share link);
// this function is the gate — the household_items table has RLS on with no
// public policies, and only this service-role function touches it.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const TOKEN_RE = /^[a-f0-9]{40,64}$/;
const MAX_ITEMS = 1000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function clean(v: unknown, max: number): string {
  return String(v ?? "").slice(0, max);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = new URL(req.url);
    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      body = await req.json().catch(() => ({}));
    }
    const token = clean(body.token ?? url.searchParams.get("token"), 64).toLowerCase();
    const action = clean(body.action ?? url.searchParams.get("action") ?? "get", 20);
    if (!TOKEN_RE.test(token)) return json({ ok: false, error: "bad household token" }, 400);

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const by = clean(body.by, 40) || "Someone";

    const list = async () => {
      const { data, error } = await sb
        .from("household_items")
        .select("kind,item_key,label,detail,checked,target_price,touched_by,updated_at")
        .eq("household_token", token)
        .order("updated_at", { ascending: true })
        .limit(MAX_ITEMS);
      if (error) throw error;
      return data ?? [];
    };

    if (action === "get") {
      return json({ ok: true, items: await list() });
    }

    if (action === "upsert") {
      const item = (body.item ?? {}) as Record<string, unknown>;
      const kind = clean(item.kind, 10);
      const itemKey = clean(item.item_key, 160);
      const label = clean(item.label, 200);
      if ((kind !== "list" && kind !== "watch") || !itemKey || !label) {
        return json({ ok: false, error: "bad item" }, 400);
      }
      const { count } = await sb
        .from("household_items")
        .select("item_key", { count: "exact", head: true })
        .eq("household_token", token);
      const exists = await sb
        .from("household_items")
        .select("item_key", { head: true })
        .eq("household_token", token).eq("kind", kind).eq("item_key", itemKey);
      if ((count ?? 0) >= MAX_ITEMS && !exists.data) {
        return json({ ok: false, error: "household list is full" }, 400);
      }
      const row: Record<string, unknown> = {
        household_token: token,
        kind,
        item_key: itemKey,
        label,
        detail: clean(item.detail, 300) || null,
        touched_by: by,
        updated_at: new Date().toISOString(),
      };
      if (kind === "list") row.checked = item.checked === true;
      if (kind === "watch") {
        const tp = Number(item.target_price);
        row.target_price = Number.isFinite(tp) && tp > 0 ? tp : null;
      }
      const { error } = await sb.from("household_items").upsert(row, {
        onConflict: "household_token,kind,item_key",
      });
      if (error) throw error;
      return json({ ok: true, items: await list() });
    }

    if (action === "set_checked") {
      const itemKey = clean(body.item_key, 160);
      if (!itemKey) return json({ ok: false, error: "bad item_key" }, 400);
      const { error } = await sb.from("household_items").update({
        checked: body.checked === true,
        touched_by: by,
        updated_at: new Date().toISOString(),
      }).eq("household_token", token).eq("kind", "list").eq("item_key", itemKey);
      if (error) throw error;
      return json({ ok: true, items: await list() });
    }

    if (action === "remove") {
      const kind = clean(body.kind, 10);
      const itemKey = clean(body.item_key, 160);
      if ((kind !== "list" && kind !== "watch") || !itemKey) {
        return json({ ok: false, error: "bad remove" }, 400);
      }
      const { error } = await sb.from("household_items").delete()
        .eq("household_token", token).eq("kind", kind).eq("item_key", itemKey);
      if (error) throw error;
      return json({ ok: true, items: await list() });
    }

    if (action === "uncheck_all") {
      const { error } = await sb.from("household_items").update({
        checked: false,
        touched_by: by,
        updated_at: new Date().toISOString(),
      }).eq("household_token", token).eq("kind", "list").eq("checked", true);
      if (error) throw error;
      return json({ ok: true, items: await list() });
    }

    return json({ ok: false, error: "unknown action" }, 400);
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
