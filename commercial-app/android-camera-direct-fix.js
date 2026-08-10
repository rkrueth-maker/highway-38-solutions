(function(){
'use strict';
/*
 * Retired 2026-08-10 during Site Visit recovery.
 *
 * This file previously intercepted #fieldWalkthrough, rewired getUserMedia,
 * primed microphone streams, altered delete confirmations, and competed with
 * the native CameraX recovery path.  Keeping those overlapping authorities
 * loaded is what allowed a successful CameraX return to be followed by the
 * WebView recorder's "Could not start audio source" failure.
 *
 * Android walkthrough authority now belongs only to
 * android-native-walkthrough-guard.js + MainActivity/WalkthroughCaptureActivity.
 * iPhone capture authority belongs to operator-direct-controls.js and the
 * native video file input.  The shared Site Visit owns persistence/state.
 */
window.H38_ANDROID_CAMERA_DIRECT_FIX={
  build:'20260810-retired-0236',
  retired:true,
  reason:'duplicate walkthrough launch authority',
  cameraAuthority:false,
  microphoneAuthority:false,
  deleteAuthority:false,
  automaticApproval:false,
  automaticCustomerSending:false
};
})();
