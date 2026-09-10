import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const DISABLED_MARKER = "H38_DISABLED_LEGACY_RECOVERY_V1";

Deno.serve(() => new Response(JSON.stringify({
  status: "DISABLED",
  code: DISABLED_MARKER,
  message: "This legacy recovery route is permanently disabled.",
}), {
  status: 410,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  },
}));
