/** Release marker for the corrected authorized full Business Office demonstration. */
var H38_FULL_DEMO_RELEASE_VERSION = '2026-07-26-resumable-authorized-v3';
function boFullDemoReleaseVersion() {
  return {
    status: 'PASS',
    version: H38_FULL_DEMO_RELEASE_VERSION,
    marker: H38_FULL_DEMO_MARKER,
    phased: true,
    authorizedHarness: true,
    generatedHarnessSyntaxChecked: true,
    duplicateProtected: true
  };
}
