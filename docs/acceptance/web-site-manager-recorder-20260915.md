# Web Site Manager recorder acceptance

Date: 2026-09-15
Branch: `agent/pwa-recording-recovery-20260915`
Base authority: `8d6332a53004a9e29d20b18fa8362d7944c72f89`

## Required phone flow

1. Open the same H38 Business Office Site Visit.
2. Tap **Save & Start Walkthrough**.
3. Browser requests rear camera + microphone and begins recording automatically.
4. Timer continues while recording.
5. Tap **Take Photo** at least twice; the button reports `1 saved`, `2 saved`, etc., while video continues uninterrupted.
6. Tap **Stop & Use Video**.
7. Return to the same Site Visit context with the walkthrough retained, intentional stills retained, and extracted review frames generated when the browser can decode them.
8. Intentional stills and extracted frames remain internal Site Visit evidence. Customer quote photos remain unselected until the owner explicitly chooses them.

## Recovery behavior

- MediaRecorder emits one-second chunks.
- Each chunk is persisted to local IndexedDB recovery records while recording.
- A reload, browser eviction, or page exit preserves recoverable chunk metadata instead of intentionally discarding the in-progress recording.
- On the next matching Site Visit load, H38 attempts to rebuild and save the interrupted walkthrough.
- Normal Stop & Use Video cleans up temporary recovery chunks after the final video is retained.

## Browser/native parity

The web flow mirrors the Android CameraX Site Manager interaction as closely as browser APIs allow. Browser stills are captured from the active preview stream so a second camera session is not opened and video recording does not stop. Torch and wake-lock are used only when the browser exposes those capabilities.

## Safety boundaries

No automatic quote-photo selection, approval, customer sending, purchasing, payment, or scheduling is introduced.
