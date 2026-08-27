import assert from 'node:assert/strict';

const norm=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');
function candidateMatch(desired,text){
  const want=norm(desired),got=norm(text);
  return !!want && (got===want || (got.startsWith(want) && got.length-want.length<=4));
}
function choose(desired,rows){return rows.find(x=>candidateMatch(desired,x))||null}
function locationMatches(desired,value){
  const a=norm(value),b=norm(desired);
  return !!a&&!!b&&a.includes(b);
}
function actionAfterSelection(buttons){
  const b=buttons.find(x=>['apply','done','update','save'].includes(norm(x)));
  return b||'AUTO_APPLY';
}

const desired='Grand Rapids Minnesota';
const choices=[
  'Grand Rapids, Michigan',
  'Downtown Grand Rapids / Grand Rapids, MI',
  'Grand Rapids, Minnesota',
  'Grand Rapids, North Dakota / North Dakota',
  'Grand Rapids, Ohio / OH',
  'Grand Lake / Oakland, CA',
  'Grand Rapids, Manitoba / MB'
];
assert.equal(choose(desired,choices),'Grand Rapids, Minnesota','must select the Minnesota city-state result, never the first Grand Rapids');
assert.equal(locationMatches(desired,'Grand Rapids, Minnesota'),true);
assert.equal(locationMatches(desired,'Grand Rapids, Michigan'),false);
assert.equal(locationMatches(desired,'Grand Rapids, Ohio'),false);
assert.equal(locationMatches(desired,'San Francisco, California'),false);
assert.equal(actionAfterSelection(['Cancel','Apply']),'Apply');
assert.equal(actionAfterSelection([]),'AUTO_APPLY');
console.log('PASS v2.5.3 Facebook city-state disambiguation + apply contract');
