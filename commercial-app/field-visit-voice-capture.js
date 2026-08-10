(function(){
'use strict';
/*
 * Retired 2026-08-10 during the Site Visit recovery rebuild.
 *
 * Walkthrough speech now comes from the audio track in the same saved video.
 * Android records that video in the H38 CameraX activity. iPhone/iPad use the
 * native video capture sheet. The transcription service accepts the saved
 * walkthrough video directly and rejects recordings with no usable audio.
 *
 * This compatibility object remains because transcription code safely calls
 * syncPending() when older builds created a separate voice attachment.
 */
async function syncPending(){return 0;}
window.H38_FIELD_VISIT_VOICE_CAPTURE={
  build:'20260810-retired-0236',
  retired:true,
  authoritativeRecorder:false,
  sameWalkthroughSpeech:true,
  microphoneRequired:true,
  videoOnlyFallback:false,
  syncPending,
  automaticApproval:false,
  automaticCustomerSending:false
};
})();
