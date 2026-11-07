/* Review ask on by default (gap4) — contract verifier.
 * Pins the invariants of the change:
 *  - the canonical default for the review-ask toggle
 *    (FEATURE_TOGGLES in owner-controls.js) is ON, and its card copy
 *    says so in plain words ("On by default");
 *  - the generated bundle mirrors the canonical entry;
 *  - an explicit stored OFF still wins: isFeatureEnabled returns the
 *    stored value whenever one exists and only falls back to the
 *    FEATURE_TOGGLES default when the key was never stored;
 *  - the separate, stronger Auto-send toggle stays OFF by default
 *    (it pre-approves sending; the default-on ask only prompts and
 *    queues for owner approval, exactly like the proven flow);
 *  - customer-comms keeps its agreeing fallback (auto_review_requests
 *    defaults true when Owner Controls is not loaded) and the
 *    completion path still routes through maybeAutoAskReview, which
 *    checks the toggle before prompting;
 *  - loader pin for owner-controls matches the version.json stamp
 *    (checked dynamically — no hard-coded stamp to go stale). */
const fs = require('fs');
const ownerControls = fs.readFileSync('commercial-app/owner-controls.js', 'utf8');
const bundle = fs.readFileSync('commercial-app/bundle-features.js', 'utf8');
const comms = fs.readFileSync('commercial-app/customer-comms.js', 'utf8');
const loader = fs.readFileSync('commercial-app/h38-script-loader.js', 'utf8');
const version = JSON.parse(fs.readFileSync('commercial-app/version.json', 'utf8'));
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

function toggleEntry(src) {
  const m = src.match(/\{id:'auto_review_requests'[^}]*\}/);
  return m ? m[0] : '';
}
function toggleEntryFor(src, id) {
  const m = src.match(new RegExp("\\{id:'" + id + "'[^}]*\\}"));
  return m ? m[0] : '';
}

// Canonical default is ON, stated in plain words on the card.
const entry = toggleEntry(ownerControls);
check(!!entry, 'auto_review_requests toggle entry missing from owner-controls.js');
check(entry.includes('default:true'), 'canonical default for auto_review_requests must be true (on by default)');
check(entry.includes('On by default'), 'toggle copy must say "On by default" in plain words');
check(entry.includes("title:'Auto-ask for reviews'"), 'toggle title must stay "Auto-ask for reviews"');

// Bundle mirrors the canonical entry.
const bundleEntry = toggleEntry(bundle);
check(bundleEntry === entry, 'bundle-features.js must mirror the owner-controls auto_review_requests entry exactly');

// Explicit OFF is preserved: stored value wins, default is only a fallback.
check(ownerControls.includes('toggles[featureId]!==undefined?toggles[featureId]:(feature?feature.default:true)'),
  'isFeatureEnabled must keep stored-value-wins semantics (explicit OFF stays OFF)');

// Auto-send (pre-approved sending) stays opt-in — NOT flipped by this change.
const sendEntry = toggleEntryFor(ownerControls, 'auto_send_review_requests');
check(sendEntry.includes('default:false'), 'auto_send_review_requests must stay default:false (separate opt-in)');

// Customer-comms fallback agrees, and completion still routes through the ask.
check(comms.includes("return id==='auto_review_requests';"),
  'customer-comms fallback must keep defaulting auto_review_requests to true');
check(comms.includes("if(!commsFeatureEnabled('auto_review_requests'))return {skipped:'disabled'};"),
  'maybeAutoAskReview must skip when the review-ask toggle is off');
check(comms.includes('await maybeAutoAskReview(Object.assign({},record))'),
  'markJobComplete must still route through maybeAutoAskReview');

// Wiring: owner-controls loader pin matches the live version stamp.
check(loader.includes("'./owner-controls.js?build=" + version.version + "'"),
  'loader pin for owner-controls.js must match the version.json stamp');

if (failures.length) { console.error(failures.map(x => 'FAIL: ' + x).join('\n')); process.exit(1); }
console.log('Review-ask default-on contract verified.');
