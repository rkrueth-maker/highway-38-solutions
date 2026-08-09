# Mobile startup and Site Visit step-state acceptance

Observed on the physical Android recording:

- Saved sign-in was not engaging cleanly at startup; the user had to work the login fields instead of the saved provider being requested as the form settled.
- Returning from walkthrough video capture could expose the Today workspace before the Site Visit capture step recovered.
- Moving between Job, Capture, Notes and Review did not consistently land the viewport at the beginning of the selected step.

Acceptance target:

1. Login form requests the saved credential provider automatically on startup and retries the actual missing field while the form settles. Manual saved-login remains only as a fallback.
2. Before native walkthrough capture, Site Visit records the intended `capture` step.
3. On Android focus/pageshow/visibility return, the Site Visit is reopened on the recorded step before attachment processing completes.
4. A successfully accepted walkthrough remains on Capture and moves the viewport to the next targeted action.
5. Every explicit tab/Next transition aligns the selected step to the top rather than preserving a stale scroll position.
6. Physical Android behavior remains final acceptance.
