import assert from 'node:assert/strict';
import {parseIndicators,parseMinnesotaCandidates,normalizeProbe,scoreStore} from './core.mjs';
const indicators=parseIndicators('<p>Believe Beauty Tweezers UPC: 840797164635</p><p>Frozen Pot Pie UPC 014800002294 remodel indicator</p>');assert.equal(indicators.length,2);assert.equal(indicators[0].upc,'840797164635');
const mn=parseMinnesotaCandidates('<div>123 Main St, Grand Rapids, MN 55744</div>');assert.equal(mn.length,1);assert.equal(mn[0].postal,'55744');
const probes=[normalizeProbe({upc:'1',name:'Beauty item',price:10,effective_price:5,store_id:283},{upc:'1'}),normalizeProbe({upc:'2',name:'Frozen Pot Pie',price:4,effective_price:2,store_id:283},{upc:'2'}),normalizeProbe({upc:'3',name:'Gift bag',price:8,effective_price:4,store_id:283},{upc:'3'}),normalizeProbe({upc:'4',name:'Household',price:6,effective_price:3,store_id:283},{upc:'4'})];
const score=scoreStore({store_id:'283',city:'Grand Rapids',state:'MN'},probes,true);assert.equal(score.label,'PENNY WINDOW CANDIDATE');assert.equal(score.cold_case_signal,true);assert.ok(score.score>=80);assert.match(score.truth,/not an official remodel schedule/i);
console.log('PASS reseller-dg-remodel-radar-v240 fixtures');
