import assert from 'node:assert/strict';
import {parseIndicators,parseMinnesotaCandidates,normalizeProbe,scoreStore,identityAgreement,sanitizeIdentity,barcodeAgreement} from './core.mjs';

const indicators=parseIndicators('<p>Believe Beauty Tweezers UPC: 840797164635</p><p>Frozen Pot Pie UPC 014800002294 remodel indicator</p>');
assert.equal(indicators.length,2);
assert.equal(indicators[0].upc,'840797164635');
assert.equal(indicators[0].name,'Believe Beauty Tweezers');
assert.equal(indicators[1].upc,'014800002294');
assert.equal(indicators[1].name,'Frozen Pot Pie');

const dirty=parseIndicators('&lt;p&gt;&lt;a href=&quot;https://www.dollargeneral.com/p/believe-beauty-tweezers/840797164635&quot; target=&quot;_blank&quot; rel=&quot;noopener&quot; style=&quot;color:red&quot;&gt;Believe Beauty Tweezers or UPC: 840797164635&lt;/a&gt;&lt;/p&gt;');
assert.equal(dirty.length,1);
assert.equal(dirty[0].upc,'840797164635');
assert.equal(dirty[0].name,'Believe Beauty Tweezers');
assert.doesNotMatch(dirty[0].name,/href|target|rel|noopener|style|https?:|&#|dollargeneral\.com|<a/i);

const adjacent=parseIndicators('<p>Believe Beauty Tweezers UPC: 840797164635</p><p>Beech-Nut Veggies Stage 2 Baby Food UPC: 052200171344</p>');
assert.equal(adjacent.length,2);
assert.equal(adjacent[0].name,'Believe Beauty Tweezers');
assert.equal(adjacent[1].name,'Beech-Nut Veggies Stage 2 Baby Food');
assert.equal(sanitizeIdentity('Believe Beauty Tweezers UPC 840797164635 052200171344','840797164635').ok,false);
assert.equal(barcodeAgreement('840797164635','052200171344').status,'MISMATCH');

const mn=parseMinnesotaCandidates('<div>123 Main St, Grand Rapids, MN 55744</div>');
assert.equal(mn.length,1);
assert.equal(mn[0].postal,'55744');
assert.equal(identityAgreement('Believe Beauty Tweezers','Believe Beauty Precision Tweezers').status,'MATCH');
assert.equal(identityAgreement('Believe Beauty Tweezers','Purina Fancy Feast Cat Food').status,'MISMATCH');

const descriptionMismatch=normalizeProbe({upc:'840797164635',name:'Purina Fancy Feast Cat Food',price:10,effective_price:1,store_id:283},{upc:'840797164635',name:'Believe Beauty Tweezers'});
assert.equal(descriptionMismatch.identity_status,'MISMATCH');
assert.match(descriptionMismatch.identity_warning,/description conflicts/i);
const barcodeMismatch=normalizeProbe({upc:'052200171344',name:'Believe Beauty Tweezers',price:10,effective_price:1,store_id:283},{upc:'840797164635',name:'Believe Beauty Tweezers'});
assert.equal(barcodeMismatch.identity_status,'MISMATCH');
assert.equal(barcodeMismatch.barcode_status,'MISMATCH');
assert.match(barcodeMismatch.identity_warning,/barcode conflicts/i);

const probes=[
  normalizeProbe({upc:'1',name:'Beauty item',price:10,effective_price:5,store_id:283},{upc:'1',name:'Beauty item'}),
  normalizeProbe({upc:'2',name:'Frozen Pot Pie',price:4,effective_price:2,store_id:283},{upc:'2',name:'Frozen Pot Pie'}),
  normalizeProbe({upc:'3',name:'Gift bag',price:8,effective_price:4,store_id:283},{upc:'3',name:'Gift bag'}),
  normalizeProbe({upc:'4',name:'Household',price:6,effective_price:3,store_id:283},{upc:'4',name:'Household'}),
  descriptionMismatch,
  barcodeMismatch,
];
const score=scoreStore({store_id:'283',city:'Grand Rapids',state:'MN'},probes,true);
assert.equal(score.label,'PENNY WINDOW CANDIDATE');
assert.equal(score.cold_case_signal,true);
assert.ok(score.score>=80);
assert.equal(score.identity_conflicts,2);
assert.match(score.truth,/barcode conflicts/i);
console.log('PASS reseller-dg-remodel-radar-v240 block-bounded identity + barcode consistency fixtures');
