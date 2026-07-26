/**
 * Exact-deployment trigger for the public Universal Quote Builder examples.
 * The companion workflow waits for this commit to reach the existing H38 Apps
 * Script deployment, then verifies the public-only quote and CAD package routes.
 */
var H38_UQB_PUBLIC_DEMO_DIRECT_TRIGGER = Object.freeze({
  version: '2026-07-26-public-only-final-v5',
  runKey: 'PUBLIC-NEW-HOUSE-DEMO-V1',
  publicSource: 'fixed demonstration specification and public CAD assets',
  privateRecordsRead: false,
  existingDeploymentOnly: true,
  externalActionsEnabled: false
});
