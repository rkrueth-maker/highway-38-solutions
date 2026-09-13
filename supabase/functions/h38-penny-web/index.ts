import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const IMMUTABLE_PAYLOAD_SOURCE =
  "https://raw.githubusercontent.com/rkrueth-maker/highway-38-solutions/db32f2d876d34f9f316775606ebe71dbe01a3525/supabase/functions/h38-penny-web/index.ts";

let htmlPromise: Promise<string> | null = null;

async function loadHtml(): Promise<string> {
  if (!htmlPromise) {
    htmlPromise = (async () => {
      const sourceResponse = await fetch(IMMUTABLE_PAYLOAD_SOURCE, {
        headers: { "user-agent": "h38-penny-web/boot-recovery" },
      });
      if (!sourceResponse.ok) {
        throw new Error(`PAYLOAD_SOURCE_${sourceResponse.status}`);
      }

      const source = await sourceResponse.text();
      const match = source.match(/const B="([A-Za-z0-9+/=]+)";/);
      if (!match) throw new Error("PAYLOAD_NOT_FOUND");

      const bin = Uint8Array.from(atob(match[1]), (c) => c.charCodeAt(0));
      const ds = new DecompressionStream("gzip");
      return await new Response(
        new Blob([bin]).stream().pipeThrough(ds),
      ).text();
    })().catch((error) => {
      htmlPromise = null;
      throw error;
    });
  }
  return await htmlPromise;
}

Deno.serve(async () => {
  try {
    const html = await loadHtml();
    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("h38-penny-web payload load failed", error);
    return new Response("H38 Deals is temporarily unavailable. Please retry.", {
      status: 503,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }
});
