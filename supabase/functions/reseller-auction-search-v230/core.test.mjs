import assert from 'node:assert/strict';
import {parseKbidEvents,parseKbidLots,parseGovDeals,parseProxibid,parseAuctionTime,buyerPremium,shippingMode} from './core.mjs';

const kbList=`<article><a href="/auction/77777"><img src="https://cdn.k-bid.com/a.jpg">RCS Auctions</a><a href="/auction/77777">Iron Junction Tool & Estate Auction - DeWalt, Milwaukee, Welders</a><div>Begins Closing Today 08/26/2026 07:00 pm Active 3950 Hwy 7, Iron Junction, MN 55751 Household, Estate & Personal Property | 239 Items</div></article>`;
const ev=parseKbidEvents(kbList,'https://www.k-bid.com/auction/list');assert.equal(ev.length,1);assert.match(ev[0].title,/Tool & Estate/);assert.equal(ev[0].location_label.includes('55751'),true);assert.equal(ev[0].item_count,239);
const kbLots=`<h4>DeWalt 20V Max Impact Driver Kit</h4><div>Lot: 12</div><div>Current Bid: $42.00</div><img src="https://cdn.k-bid.com/lot12.jpg"><h4>Oak China Cabinet</h4><div>Lot: 13</div><div>Current Bid: $55.00</div><div>15% Buyer's Premium. Shipping Available on smaller items.</div>`;
const lots=parseKbidLots(kbLots,'https://www.k-bid.com/auction/77777',{source_url:'https://www.k-bid.com/auction/77777',title:ev[0].title,location_label:ev[0].location_label},'dewalt');assert.equal(lots.length,1);assert.equal(lots[0].current_bid,42);assert.equal(lots[0].buyer_premium,15);assert.equal(lots[0].pickup_mode,'Shipping available');
const gd=`Online Auction McCloskey Trommel drum with many screens Menahga, Minnesota, USA USD $7,500.00 7 D 14 H Lot#: 21141-304 Online Auction 2019 HIAB MOFFETT M9 PIGGYBACK FORKLIFT Rice, Minnesota, USA USD 9,000.00 4 D Lot#: 24329-516`;
assert.equal(parseGovDeals(gd,'https://prod-seo.govdeals.com/en/minnesota','forklift').length,1);
const px=`<a href="/lotinformation/101415144/yamaha-450-grizzly-atv"><img src="https://images.proxibid.com/y.jpg">Yamaha 450 Grizzly ATV</a><div>This item is in Hoffman, MN CURRENT BID USD $500 Buyer Premium: 6% Internet Buyers Premium Shipping available</div>`;
const pr=parseProxibid(px,'https://www.proxibid.com/for-sale/','yamaha');assert.equal(pr.length,1);assert.equal(pr[0].current_bid,500);assert.equal(pr[0].buyer_premium,6);
const at=`<a href="https://www.auctiontime.com/listing/upcoming-auctions/259042243/2026-voler-lhr"><img src="https://media.auctiontime.com/a.jpg">2026 VOLER LHR-MC2113</a><div>Current Bid: USD $11.00 Sale Ends: Wednesday, August 12, 2026 12:24 PM Item Location:3237 190th Ave Twin Valley, MN 56584</div>`;
const ar=parseAuctionTime(at,'https://www.auctiontime.com/','voler');assert.equal(ar.length,1);assert.equal(ar[0].current_bid,11);assert.equal(ar[0].location_label.includes('56584'),true);
assert.equal(buyerPremium("There is a 15% Internet Buyer's Premium"),15);assert.equal(shippingMode('NO SHIPPING. Local pickup only.'),'Local pickup only');
console.log('PASS Scout v2.3 broad auction parser fixtures');
