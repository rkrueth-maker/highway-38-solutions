/**
 * Deployment trigger for the first Office-generated public UQB demonstration.
 *
 * PR #322 installed the follow-on workflow on main after its own production
 * deployment event had already started, so that first workflow_run event could
 * not invoke the generator. This source marker causes one controlled update of
 * the existing Apps Script deployment now that the follow-on workflow exists.
 */
var H38_UQB_PUBLIC_DEMO_RELEASE_TRIGGER = Object.freeze({
  version: '2026-07-26-first-live-generation-v1',
  runKey: 'PUBLIC-NEW-HOUSE-DEMO-V1',
  sourceOfTruth: 'H38 Business Office',
  externalActionsEnabled: false
});
