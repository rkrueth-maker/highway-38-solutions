import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here=path.dirname(fileURLToPath(import.meta.url));
const src=fs.readFileSync(path.join(here,'src/main/java/com/highway38/resellerscout/FacebookMarketplaceEmbeddedCollector.java'),'utf8');

assert.match(src,/Public-only Facebook Marketplace collector/,'collector must declare public-only mode');
assert.match(src,/PUBLIC_ONLY/,'collector must surface public-only diagnostics');
assert.match(src,/clearFacebookAuthCookies\(\)/,'collector must clear Facebook auth cookies instead of requiring login');
assert.doesNotMatch(src,/hasFacebookUserCookie\(/,'collector must not depend on a saved Facebook session');
assert.doesNotMatch(src,/AUTH_REQUIRED/,'collector must not emit auth-required state');
assert.match(src,/document\.querySelectorAll\('a\[href\]'\)/,'collector must inspect public href anchors');
assert.match(src,/PUBLIC_HTML_ITEM_URL/,'collector must have public source-HTML fallback capture');
assert.match(src,/PUBLIC_DOM_ANCHOR/,'collector must preserve public DOM-anchor capture');
assert.match(src,/PUBLIC_LOGIN_WALL/,'anonymous login walls must be reported truthfully, not bypassed');
assert.match(src,/LAST_DIAGNOSTICS/,'collector must persist diagnostics');
assert.match(src,/html_item_hits/,'collector must report HTML item hits');
assert.match(src,/dom_item_anchors/,'collector must report DOM item anchors');
assert.match(src,/captured_count/,'native rows must surface captured count');
assert.match(src,/COMPLETE_LOCATION_UNPROVEN/,'captured rows may survive without local proof');

const fixture=`
<html><body>
<a href="https://www.facebook.com/marketplace/item/123456789012345/">
  <img src="https://scontent.xx.fbcdn.net/item.webp" alt="DeWalt cordless drill" />
  <div>$75</div><div>DeWalt cordless drill</div><div>Grand Rapids, MN</div>
</a>
<script>window.__fixture={"url":"https:\\/\\/www.facebook.com\\/marketplace\\/item\\/987654321098765\\/"};</script>
</body></html>`;
const normalized=fixture.replace(/\\u002F/g,'/').replace(/\\\//g,'/');
const ids=[...normalized.matchAll(/\/marketplace\/item\/(\d+)/ig)].map(m=>m[1]);
assert.deepEqual([...new Set(ids)],['123456789012345','987654321098765']);
console.log(`PASS public Facebook capture contract: ${new Set(ids).size} fixture item IDs found without login`);
