import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const profitSource=fs.readFileSync(new URL('./src/main/assets/reseller/v220-profit.js',import.meta.url),'utf8');
const profitSandbox={console};
vm.createContext(profitSandbox);
vm.runInContext(profitSource,profitSandbox,{filename:'v220-profit.js'});
const H=profitSandbox.H38Profit;
assert.ok(H,'shared profitability engine must load');

const strong=H.evaluateOpportunity({
  acquisitionPrice:25,
  soldCount:18,
  activeCount:5,
  soldMedian:90,
  soldLow:78,
  soldHigh:105,
  marketplaceFees:10,
  paymentFees:0,
  shipping:8,
  taxAllowance:0,
  travelCost:0,
  buyerPremium:0,
  otherAcquisitionFees:0,
  minimumProfit:25,
  minimumROI:.5,
  confidence:'high',
  freshnessDays:7,
  distanceMiles:5,
  shippingBurden:'easy',
  sizeWeightBurden:'low'
});
assert.equal(strong.recommendedAction,'BUY');
assert.ok(strong.dealScore>=75);
assert.equal(strong.expectedProfit,47);
assert.ok(strong.scoreReasons.length>0);

const marginal=H.evaluateOpportunity({
  acquisitionPrice:60,
  soldCount:12,
  activeCount:18,
  soldMedian:90,
  marketplaceFees:10,
  paymentFees:0,
  shipping:12,
  taxAllowance:0,
  travelCost:0,
  buyerPremium:0,
  otherAcquisitionFees:0,
  minimumProfit:25,
  minimumROI:.5,
  confidence:'medium',
  freshnessDays:30,
  distanceMiles:20,
  shippingBurden:'moderate',
  sizeWeightBurden:'moderate'
});
assert.ok(['MAYBE','PASS'].includes(marginal.recommendedAction));
assert.ok(marginal.expectedProfit<25);

const askingOnly=H.evaluateOpportunity({
  acquisitionPrice:25,
  soldCount:0,
  activeCount:8,
  askingLow:89,
  askingHigh:130
});
assert.equal(askingOnly.recommendedAction,'NEEDS COMP');
assert.equal(askingOnly.dealScore,null);
assert.equal(Object.hasOwn(askingOnly,'resaleEstimate'),false,'asking prices must not silently become expected resale');
assert.ok(askingOnly.warnings.some(x=>x.includes('ASKING MARKET ONLY')));

const missingPrice=H.evaluateOpportunity({soldCount:10,soldMedian:90});
assert.equal(missingPrice.recommendedAction,'NEEDS PRICE');

const missingRequiredCost=H.evaluateOpportunity({
  acquisitionPrice:25,soldCount:10,soldMedian:90,
  marketplaceFees:10,paymentFees:0,taxAllowance:0,travelCost:0,buyerPremium:0,otherAcquisitionFees:0,
  requiredCosts:['shipping']
});
assert.equal(missingRequiredCost.recommendedAction,'NEEDS VERIFICATION');

const noPremium=H.maxBid({soldCount:12,soldMedian:100,minimumProfit:30,minimumROI:.5});
assert.equal(noPremium.status,'NOT YET PROVEN');
assert.equal(noPremium.reason,'Buyer premium unknown');

const provenBid=H.maxBid({
  soldCount:12,soldMedian:100,buyerPremiumRate:.15,taxRate:.08,
  marketplaceFees:10,paymentFees:0,shipping:5,travelCost:5,riskBuffer:5,otherFixedAcquisitionFees:0,
  minimumProfit:25,minimumROI:.5
});
assert.equal(provenBid.status,'PROVEN');
assert.ok(provenBid.maxHammerBid>0);

const glitch=H.classifyGlitch({currentPrice:25,referencePrice:100});
assert.equal(glitch.label,'GLITCH CANDIDATE');
assert.equal(glitch.verified,false);
assert.match(glitch.message,/retailer error is not established/i);

assert.equal(H.sourceState({timedOut:true}),'SOURCE UNAVAILABLE');
assert.equal(H.sourceState({error:'provider failed'}),'SOURCE UNAVAILABLE');
assert.equal(H.sourceState({verifiedCount:0}),'NO VERIFIED RESULTS');
assert.equal(H.sourceState({checked:false}),'NOT CHECKED');
assert.equal(H.sourceState({partial:true}),'PARTIAL RESULTS');

const easy=H.evaluateOpportunity({
  acquisitionPrice:45,soldCount:25,activeCount:8,soldMedian:110,
  marketplaceFees:8,paymentFees:0,shipping:7,taxAllowance:0,travelCost:0,buyerPremium:0,otherAcquisitionFees:0,
  minimumProfit:25,minimumROI:.5,confidence:'high',freshnessDays:7,distanceMiles:5,shippingBurden:'easy',sizeWeightBurden:'easy'
});
const bulky=H.evaluateOpportunity({
  acquisitionPrice:45,soldCount:3,activeCount:30,soldMedian:110,
  marketplaceFees:8,paymentFees:0,shipping:7,taxAllowance:0,travelCost:0,buyerPremium:0,otherAcquisitionFees:0,
  minimumProfit:25,minimumROI:.5,confidence:'low',freshnessDays:120,distanceMiles:45,shippingBurden:'high',sizeWeightBurden:'high'
});
assert.ok(easy.dealScore>bulky.dealScore,'same raw economics should rank stronger evidence / lower burden higher');

const memory=new Map();
const localStorage={
  getItem:key=>memory.has(key)?memory.get(key):null,
  setItem:(key,value)=>memory.set(key,String(value)),
  removeItem:key=>memory.delete(key)
};
const trackSource=fs.readFileSync(new URL('./src/main/assets/reseller/v220-track.js',import.meta.url),'utf8');
const trackSandbox={console,localStorage,Date,Math};
vm.createContext(trackSandbox);
vm.runInContext(trackSource,trackSandbox,{filename:'v220-track.js'});
const T=trackSandbox.H38Track;
assert.ok(T,'Track engine must load');

const track=T.upsert({watchType:'exact',upc:'045242000001',radius:50,maxBuyPrice:75});
assert.equal(T.matches(track,{upc:'045242000001',buy_price:70,distance_miles:50}),true,'50.0 miles must be accepted');
assert.equal(T.matches(track,{upc:'045242000001',buy_price:70,distance_miles:50.1}),false,'50.1 miles must be rejected');
assert.equal(T.matches(track,{upc:'045242000001',buy_price:76,distance_miles:10}),false,'max acquisition threshold must be enforced');

const first=T.fromOpportunity({title:'Milwaukee M18 Blower',upc:'045242999999'},{radius:50});
const second=T.fromOpportunity({title:'Milwaukee M18 Blower',upc:'045242999999'},{radius:50});
assert.equal(first.id,second.id,'repeated Track action must update, not duplicate, the same exact-item watch');

const ev={recommendedAction:'BUY',dealScore:88,expectedProfit:47,roi:1.1};
const op={id:'opp-1',title:'Milwaukee M18 Blower',upc:'045242999999',buy_price:40,distance_miles:5};
T.scanMatches(op,ev);
const countAfterFirst=T.events().length;
T.scanMatches(op,ev);
assert.equal(T.events().length,countAfterFirst,'unchanged repeated discovery must not create a duplicate match alert');

const nearbySource=fs.readFileSync(new URL('../../../../supabase/functions/reseller-nearby-sources/index.ts',import.meta.url),'utf8');
for(const marker of ['Estate sale / auction','Garage / moving sale','Government / institutional surplus','Equipment auction / liquidation','Auction company'])assert.ok(nearbySource.includes(marker),`nearby source expansion must include ${marker}`);
assert.ok(nearbySource.includes('inventory_known:false'),'place discovery must not imply inventory proof');
assert.ok(nearbySource.includes('if(d>radius)continue'),'nearby source discovery must keep the exact radius boundary');

console.log('PASS Scout v2.2 shared profitability + Track + sourcing deterministic fixtures');
