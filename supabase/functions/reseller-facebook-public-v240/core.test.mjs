import assert from 'node:assert/strict';
import {normalizeMarketplaceRow,normalizeMarketplaceRows,parseGuestHtml} from './core.mjs';

const row=normalizeMarketplaceRow({id:'123456789',listingTitle:'Milwaukee M18 saw',listingPrice:'$75',city:'Grand Rapids',state:'MN',distanceKm:16,image:'https://img.example/saw.jpg'},{radiusMiles:25,provider:'fixture',locationLabel:'Grand Rapids, MN',lat:47.2372,lon:-93.5302});
assert.equal(row.title,'Milwaukee M18 saw');assert.equal(row.price,75);assert.equal(row.location_verified,true);assert.equal(row.location_evidence,'distance');assert.ok(row.distance_miles<10.1);

const duluth=normalizeMarketplaceRow({id:'223456789',title:'Toolbox',price:'$40',location_label:'Duluth, MN'},{radiusMiles:50,locationLabel:'Duluth, Minnesota'});
assert.equal(duluth.location_verified,true);assert.equal(duluth.location_evidence,'city_state');

const wrongSameCity=normalizeMarketplaceRow({id:'323456789',title:'Wrong state',price:'$20',location_label:'Grand Rapids, MI'},{radiusMiles:50,locationLabel:'Grand Rapids, Minnesota'});
assert.equal(wrongSameCity.location_verified,false);assert.equal(wrongSameCity.location_evidence,'unproven');

const rightFullState=normalizeMarketplaceRow({id:'423456789',title:'Right state',price:'$20',location_label:'Grand Rapids, Minnesota'},{radiusMiles:50,locationLabel:'Grand Rapids, MN'});
assert.equal(rightFullState.location_verified,true);

const far=normalizeMarketplaceRows([{id:'1',title:'Near',distanceKm:10},{id:'2',title:'Far',distanceKm:200,location_label:'Grand Rapids, MN'}],{radiusMiles:50,locationLabel:'Grand Rapids, MN'});assert.equal(far.length,1);
const onlyVerified=normalizeMarketplaceRows([{id:'3',title:'Unproven',location_label:'Somewhere'},{id:'4',title:'Verified',location_label:'Brainerd, MN'}],{radiusMiles:50,locationLabel:'Brainerd, Minnesota',onlyVerified:true});assert.equal(onlyVerified.length,1);assert.equal(onlyVerified[0].title,'Verified');

const html='<script>{"marketplace_listing_title":"Tool Chest","formatted_amount":"$100","location":"Duluth, MN","uri":"https://img.example/x.jpg"}</script><a href="/marketplace/item/987654321/">x</a>';
const parsed=parseGuestHtml(html,{radiusMiles:50,locationLabel:'Duluth, Minnesota'});assert.equal(parsed.length,1);assert.equal(parsed[0].url,'https://www.facebook.com/marketplace/item/987654321/');assert.equal(parsed[0].location_verified,true);

const slashEscaped='<script>{"marketplace_listing_title":"M18 Drill","formatted_amount":"85","location":"Grand Rapids, MN","canonical_url":"https:\\/\\/www.facebook.com\\/marketplace\\/item\\/111222333444\\/"}</script>';
const escapedParsed=parseGuestHtml(slashEscaped,{radiusMiles:50,locationLabel:'Grand Rapids, Minnesota'});assert.equal(escapedParsed.length,1);assert.equal(escapedParsed[0].id,'111222333444');assert.equal(escapedParsed[0].location_verified,true);

const unicodeEscaped='<script>{"marketplace_listing_title":"Snowblower","location":"Grand Rapids, Minnesota","url":"https:\\u002F\\u002Fwww.facebook.com\\u002Fmarketplace\\u002Fitem\\u002F555666777888\\u002F"}</script>';
const unicodeParsed=parseGuestHtml(unicodeEscaped,{radiusMiles:50,locationLabel:'Grand Rapids, MN'});assert.equal(unicodeParsed.length,1);assert.equal(unicodeParsed[0].url,'https://www.facebook.com/marketplace/item/555666777888/');assert.equal(unicodeParsed[0].location_verified,true);

const encoded='<a href="https%3A%2F%2Fwww.facebook.com%2Fmarketplace%2Fitem%2F999888777666%2F">Marketplace</a><script>{"marketplace_listing_title":"Compressor","location":"Grand Rapids, MN"}</script>';
const encodedParsed=parseGuestHtml(encoded,{radiusMiles:50,locationLabel:'Grand Rapids, Minnesota'});assert.equal(encodedParsed.length,1);assert.equal(encodedParsed[0].id,'999888777666');

const wrongArea=parseGuestHtml('<script>{"marketplace_listing_title":"Saw","location":"Grand Rapids, MI"}</script><a href="/marketplace/item/777888999000/">x</a>',{radiusMiles:50,locationLabel:'Grand Rapids, Minnesota'});assert.equal(wrongArea.length,1);assert.equal(wrongArea[0].location_verified,false);

const gated=parseGuestHtml('<html><body>Log in to Facebook to continue</body></html>',{radiusMiles:50,locationLabel:'Grand Rapids, Minnesota'});assert.equal(gated.length,0);

console.log('PASS reseller-facebook-public-v265 guest hydration + strict public-location fixtures');
