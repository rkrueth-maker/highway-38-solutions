import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here=path.dirname(fileURLToPath(import.meta.url));
const src=fs.readFileSync(path.join(here,'src/main/java/com/highway38/resellerscout/FacebookMarketplaceEmbeddedCollector.java'),'utf8');

assert.match(src,/NO_C_USER_COOKIE/,'collector must fail fast to AUTH_REQUIRED without a saved Facebook session');
assert.match(src,/hasFacebookUserCookie\(\)/,'collector must preflight the persisted Facebook session');
assert.match(src,/document\.querySelectorAll\('a\[href\]'\)/,'collector must inspect all href anchors, not one fragile selector');
assert.match(src,/HTML_ITEM_URL/,'collector must have source-HTML fallback capture');
assert.match(src,/DOM_ANCHOR/,'collector must preserve DOM-anchor capture');
assert.match(src,/marketplace\\\\\/item\\\\\//,'collector must recognize Marketplace item URLs');
assert.match(src,/LAST_DIAGNOSTICS/,'collector must persist diagnostics');
assert.match(src,/html_item_hits/,'collector must report HTML item hits');
assert.match(src,/dom_item_anchors/,'collector must report DOM item anchors');
assert.match(src,/captured_count/,'native rows must surface captured count');
assert.match(src,/COMPLETE_LOCATION_UNPROVEN/,'captured rows may survive without local proof');
assert.match(src,/AUTH_REQUIRED/,'auth-required state must be explicit');

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
console.log(`PASS native Facebook capture contract: ${new Set(ids).size} fixture item IDs found`);
