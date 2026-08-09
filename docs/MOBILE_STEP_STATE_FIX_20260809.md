# Mobile startup and Site Visit step-state acceptance

Observed on the physical Android recording:

- Saved sign-in was not engaging cleanly at startup; the user had to work the login fields instead of the saved provider being requested as the form settled.
- Returning from walkthrough video capture could expose the Today workspace before the Site Visit capture step recovered.
- Moving between Job, Capture, Notes and Review did not consistently land the viewport at the beginning of the selected step.
- After the user accepted the system-camera recording, Android could recreate the H38 activity. The v0.5.5 shell explicitly treated Site Visit URLs as URLs that should be reset to the Business Office root, and its transient WebView file callback could be lost during that recreation.

Acceptance target:

1. Login form requests the saved credential provider automatically on startup and retries the actual missing field while the form settles. Manual saved-login remains only as a fallback.
2. Before native walkthrough capture, Site Visit records the intended `capture` step.
3. Android no longer deliberately resets a restored Site Visit to the Business Office root.
4. The pre-created MediaStore walkthrough URI is persisted across Activity recreation. If the WebView file callback survives, the video returns normally. If that callback is lost, the native shell exposes the accepted video back to the restored Site Visit and the existing `captureFiles` workflow ingests it.
5. On Android focus/pageshow/visibility return, the Site Visit is reopened on the recorded step before attachment processing completes.
6. A successfully accepted walkthrough remains on Capture and moves the viewport to the next targeted action.
7. Every explicit tab/Next transition aligns the selected step to the top rather than preserving a stale scroll position.
8. Physical Android behavior remains final acceptance.
