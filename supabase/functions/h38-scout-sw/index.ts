import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Scout service worker, served as a first-class script so its scope is
// /functions/v1/ — covering the Scout pages (h38-penny-web, h38-resale-web,
// h38-coupon-web, h38-deals-shell). It exists ONLY for Web Push delivery:
// it deliberately registers no fetch handler and caches nothing, so it can
// never interfere with the Scout pages' live data loads.
const SW = String.raw`
"use strict";
var PUSH_API = "https://jqukmwtsgcsaruucnqja.supabase.co/functions/v1/h38-scout-push";
var DEFAULT_URL = "https://jqukmwtsgcsaruucnqja.supabase.co/functions/v1/h38-penny-web";
var ICON = "https://highway38solutions.com/assets/highway38-logo.png";

self.addEventListener("push", function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  var title = data.title || "Scout: new deals found";
  var options = {
    body: data.body || "",
    icon: ICON,
    badge: ICON,
    tag: data.tag || "scout-new-deals",
    data: { url: data.url || DEFAULT_URL }
  };
  event.waitUntil((async function () {
    // Best-effort delivery receipt: proves the push reached this device and
    // was displayed. Stores only a hash server-side, never the endpoint.
    try {
      var sub = await self.registration.pushManager.getSubscription();
      if (sub) {
        await fetch(PUSH_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "receipt", endpoint: sub.endpoint, title: title })
        });
      }
    } catch (e) { /* receipt is best-effort only */ }
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var target = (event.notification.data && event.notification.data.url) || DEFAULT_URL;
  event.waitUntil((async function () {
    var clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (var i = 0; i < clientsList.length; i++) {
      var client = clientsList[i];
      if (client.url.indexOf("/functions/v1/") >= 0 && "focus" in client) {
        await client.focus();
        if ("navigate" in client) { try { await client.navigate(target); } catch (e) {} }
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
`;

Deno.serve((req) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }
  return new Response(SW, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-store",
      "service-worker-allowed": "/functions/v1/",
      "x-content-type-options": "nosniff",
    },
  });
});
