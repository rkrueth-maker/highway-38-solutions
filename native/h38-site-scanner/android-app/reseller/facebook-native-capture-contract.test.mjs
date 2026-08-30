import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here=path.dirname(fileURLToPath(import.meta.url));
const src=fs.readFileSync(path.join(here,'src/main/java/com/highway38/resellerscout/FacebookMarketplaceEmbeddedCollector.java'),'utf8');

assert.match(src,/Public-only Marketplace discovery/,'collector must declare public-only mode');
assert.match(src,/PUBLIC_ONLY_V304/,'collector must surface v3.0.4 public-only diagnostics');
assert.match(src,/clearFacebookAuthCookies\(\)/,'collector must clear Facebook auth cookies instead of requiring login');
assert.doesNotMatch(src,/AUTH_REQUIRED|CHECKPOINT|__H38_CONNECT__/,'collector must not contain Facebook auth flow');
assert.match(src,/html\.duckduckgo\.com\/html/,'collector must use a public web-index fallback');
assert.match(src,/site:facebook\.com\/marketplace\/item\//,'public index query must target Facebook Marketplace item URLs');
assert.match(src,/PUBLIC_WEB_INDEX/,'collector must label web-indexed public Marketplace rows');
assert.match(src,/PUBLIC_DOM_ANCHOR/,'collector must preserve direct anonymous DOM capture');
assert.match(src,/freshness_unproven/,'indexed public Marketplace results must not claim fresh inventory');
assert.match(src,/PUBLIC_BLOCKED/,'anonymous Facebook blocking must be surfaced truthfully');
assert.match(src,/LAST_DIAGNOSTICS/,'collector must persist diagnostics');
assert.match(src,/public_index_count/,'native rows must surface public-index result count');
assert.match(src,/captured_count/,'native rows must surface captured count');
assert.match(src,/COMPLETE_LOCATION_UNPROVEN/,'captured rows may survive without local proof');

const fixture=`
<html><body>
<a href="https://www.facebook.com/marketplace/item/123456789012345/">DeWalt cordless drill $75 Grand Rapids Minnesota</a>
<a href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.facebook.com%2Fmarketplace%2Fitem%2F987654321098765%2F">Milwaukee saw $90 Grand Rapids Minnesota</a>
</body></html>`;
function target(v){let s=String(v||'');try{const u=new URL(s,'https://html.duckduckgo.com/html/'),x=u.searchParams.get('uddg');if(x)s=decodeURIComponent(x)}catch{}return s}
function itemId(v){const s=target(v),p=s.indexOf('/marketplace/item/');if(p<0)return'';const tail=s.slice(p+18);let id='';for(const c of tail){if(c>='0'&&c<='9')id+=c;else break}return id}
const hrefs=[...fixture.matchAll(/href="([^"]+)"/g)].map(m=>m[1]);
const ids=hrefs.map(itemId).filter(Boolean);
assert.deepEqual(ids,['123456789012345','987654321098765']);
console.log(`PASS public Facebook direct + web-index capture contract: ${ids.length} fixture item IDs found without login`);
