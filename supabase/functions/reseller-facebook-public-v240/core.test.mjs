import assert from 'node:assert/strict';
import {normalizeMarketplaceRow,normalizeMarketplaceRows,parseGuestHtml} from './core.mjs';
const row=normalizeMarketplaceRow({id:'123456789',listingTitle:'Milwaukee M18 saw',listingPrice:'$75',city:'Grand Rapids',state:'MN',distanceKm:16,image:'https://img.example/saw.jpg'},{radiusMiles:25,provider:'fixture'});assert.equal(row.title,'Milwaukee M18 saw');assert.equal(row.price,75);assert.equal(row.location_verified,true);assert.ok(row.distance_miles<10.1);
const far=normalizeMarketplaceRows([{id:'1',title:'Near',distanceKm:10},{id:'2',title:'Far',distanceKm:200}],{radiusMiles:50});assert.equal(far.length,1);
const html='<script>{"marketplace_listing_title":"Tool Chest","formatted_amount":"$100","uri":"https://img.example/x.jpg"}</script><a href="/marketplace/item/987654321/">x</a>';const parsed=parseGuestHtml(html,{radiusMiles:50});assert.equal(parsed.length,1);assert.equal(parsed[0].url,'https://www.facebook.com/marketplace/item/987654321/');
console.log('PASS reseller-facebook-public-v240 fixtures');
