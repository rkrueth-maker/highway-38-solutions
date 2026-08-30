import assert from 'node:assert/strict';
import {buildIndexQueries,listingFromSearch,locationVariants,marketplaceTarget,parseBingRss,parseSearchHtml} from './public-index.mjs';

assert.deepEqual(locationVariants('Grand Rapids, Minnesota, 55744').slice(0,2),['Grand Rapids, MN','Grand Rapids, Minnesota']);
assert.equal(marketplaceTarget('https://www.secure.facebook.com/marketplace/item/1321460146625084/').id,'1321460146625084');
assert.equal(marketplaceTarget('/url?q=https%3A%2F%2Fwww.facebook.com%2Fmarketplace%2Fitem%2F123456789012345%2F&sa=U').id,'123456789012345');
assert.equal(marketplaceTarget('//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.facebook.com%2Fmarketplace%2Fitem%2F223456789012345%2F').id,'223456789012345');
assert.equal(marketplaceTarget('Public backlink: https://www.facebook.com/marketplace/item/273456789012345/').id,'273456789012345');
assert.equal(marketplaceTarget('https://www.facebook.com/groups/123456789/'),null);

const google=`<div><a href="/url?q=https%3A%2F%2Fwww.secure.facebook.com%2Fmarketplace%2Fitem%2F323456789012345%2F&sa=U"><h3>Milwaukee M18 Drill - Facebook Marketplace</h3></a><div class="VwiC3b">$55 · Listed 2 hours ago in Grand Rapids, MN. Local pickup.</div></div>`;
const gp=parseSearchHtml(google);assert.equal(gp.length,1);assert.equal(gp[0].id,'323456789012345');const gl=listingFromSearch(gp[0]);assert.equal(gl.title,'Milwaukee M18 Drill');assert.equal(gl.location_label,'Grand Rapids, MN');assert.match(gl.price_label,/55/);

const ddg=`<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.facebook.com%2Fmarketplace%2Fitem%2F423456789012345%2F">Tool Chest | Facebook Marketplace</a><a class="result__snippet">Available for pickup in Grand Rapids, Minnesota. $100</a>`;
const dp=parseSearchHtml(ddg);assert.equal(dp.length,1);assert.equal(dp[0].id,'423456789012345');assert.equal(listingFromSearch(dp[0]).location_label,'Grand Rapids, Minnesota');

const backlinkHtml=`<div><a href="https://example.org/thread"><h3>Northern Minnesota tool listing</h3></a><div class="snippet">Marketplace source https%3A%2F%2Fwww.facebook.com%2Fmarketplace%2Fitem%2F473456789012345%2F · $80 · pickup in Grand Rapids, MN.</div></div>`;
const hp=parseSearchHtml(backlinkHtml);assert.equal(hp.length,1);assert.equal(hp[0].id,'473456789012345');assert.equal(listingFromSearch(hp[0]).location_label,'Grand Rapids, MN');

const rss=`<?xml version="1.0"?><rss><channel><item><title>Snowblower - Facebook Marketplace</title><link>https://www.facebook.com/marketplace/item/523456789012345/</link><description><![CDATA[$125 · Listed today in Grand Rapids, MN.]]></description></item></channel></rss>`;
const bp=parseBingRss(rss);assert.equal(bp.length,1);assert.equal(listingFromSearch(bp[0]).location_label,'Grand Rapids, MN');

const backlinkRss=`<?xml version="1.0"?><rss><channel><item><title>Estate tools discussion</title><link>https://example.org/forum/post-55</link><description><![CDATA[Public source points to https://www.facebook.com/marketplace/item/623456789012345/ · $140 · pickup in Grand Rapids, MN.]]></description></item></channel></rss>`;
const br=parseBingRss(backlinkRss);assert.equal(br.length,1);assert.equal(br[0].id,'623456789012345');assert.equal(listingFromSearch(br[0]).location_label,'Grand Rapids, MN');

const duplicateRss=`<?xml version="1.0"?><rss><channel><item><title>A</title><link>https://example.org/a</link><description>https://www.facebook.com/marketplace/item/723456789012345/</description></item><item><title>B</title><link>https://www.facebook.com/marketplace/item/723456789012345/</link><description>duplicate</description></item></channel></rss>`;
assert.equal(parseBingRss(duplicateRss).length,1);

const queries=buildIndexQueries('tools','Grand Rapids, Minnesota, 55744');
assert.ok(queries.some(x=>x.includes('"Grand Rapids, MN"')));assert.ok(queries.some(x=>x.includes('"Minnesota"')));assert.ok(queries.some(x=>x.includes('"facebook.com/marketplace/item/"')));assert.ok(queries.every(x=>!x.includes('55744')));

console.log('PASS resilient public Facebook index and backlink fixtures');
