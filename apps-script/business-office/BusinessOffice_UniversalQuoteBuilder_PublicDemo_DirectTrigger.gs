/**
 * Exact-deployment trigger for the Office-generated public UQB demonstration.
 * The companion workflow waits for this commit to be deployed to the existing
 * H38 Apps Script deployment before it creates or verifies demo records.
 */
var H38_UQB_PUBLIC_DEMO_DIRECT_TRIGGER = Object.freeze({
  version: '2026-07-26-exact-deploy-v1',
  runKey: 'PUBLIC-NEW-HOUSE-DEMO-V1',
  existingDeploymentOnly: true,
  externalActionsEnabled: false
});
