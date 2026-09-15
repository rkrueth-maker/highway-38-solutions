# Web Site Manager recorder acceptance

Date: 2026-09-15
Branch: `agent/pwa-recording-recovery-20260915`
Base authority: `8d6332a53004a9e29d20b18fa8362d7944c72f89`

## Required phone flow

1. Open an H38 Business Office Site Visit.
2. **Step 1 — Conversation:** tap **Start meeting recording** and intentionally record the customer/site discussion after handling any required consent.
3. During the conversation, capture requests, customer/contact information, service/property address, requested work, known measurements, conditions, decisions and unresolved questions.
4. Tap **Finish conversation & prepare Site Manager**.
5. H38 privately saves/transcribes/organizes the meeting and prepares an editable internal seed containing customer candidate, property/service address candidate, project title, scope draft, quote inputs, known measurements and a preflight capture checklist.
6. Review the seed. Tap **Apply customer, address & scope** when the suggested identity/property details are correct. Customer/property records are created or completed only through this explicit apply action. Blank project title/scope drafts may be prefilled internally before the walkthrough.
7. **Step 2 — Walkthrough:** tap **Start Walkthrough**.
8. Browser requests rear camera + microphone and begins recording automatically.
9. Timer continues while recording for up to **20 minutes**.
10. Tap **Take Photo** at least twice; the button reports `1 saved`, `2 saved`, etc., while video continues uninterrupted.
11. Use the meeting-seeded checklist to capture requested photos, field-verify measurements and resolve scope questions before quoting.
12. Tap **Stop & Use Video**.
13. Return to the same Site Visit context with the walkthrough retained, intentional stills retained, and extracted review frames generated when the browser can decode them.
14. Intentional stills and extracted frames remain internal Site Visit evidence. Customer quote photos remain unselected until the owner explicitly chooses them.

The conversation step can be intentionally skipped, and an already-saved offline meeting can continue to the walkthrough without AI seed when connectivity is unavailable. The meeting evidence remains saved for later organization.

## Meeting seed behavior

- Existing Meeting Assistant audio checkpoints remain the recording authority.
- Meeting transcription and organization remain private Business Office evidence.
- The meeting report document is still produced, but the meeting now also seeds operational data used before and during the Site Visit.
- Customer name/email/phone and property/service address are suggestions derived only from explicit meeting evidence.
- Customer/property creation or completion requires **Apply customer, address & scope**.
- Scope/project title can prefill only when the internal draft fields are blank/generic; existing owner-entered content is preserved.
- The seed carries quote-useful factual inputs, unverified meeting measurements and Site Manager capture items so the walkthrough starts with a purpose.
- Spoken/recalled measurements remain unverified and should generate a field-verification capture item rather than being treated as final dimensions.

## 20-minute recording and recovery behavior

- MediaRecorder emits approximately five-second chunks for long-session stability.
- Each chunk is persisted to local IndexedDB recovery records while recording.
- The final walkthrough is rebuilt from the persisted chunks instead of holding a second full copy of the long recording in memory.
- A reload, browser eviction, or page exit preserves recoverable chunk metadata instead of intentionally discarding the in-progress recording.
- On the next matching Site Visit load, H38 attempts to rebuild and save the interrupted walkthrough.
- Normal **Stop & Use Video** cleans up temporary recovery chunks after the final video is retained.
- The browser requests persistent storage and screen wake-lock when those capabilities are available.

## Browser/native parity

The web flow mirrors the Android CameraX Site Manager interaction as closely as browser APIs allow. Browser stills are captured from the active preview stream so a second camera session is not opened and video recording does not stop. Torch and wake-lock are used only when the browser exposes those capabilities.

## Safety boundaries

No automatic quote-photo selection, approval, customer sending, purchasing, payment, scheduling, pricing acceptance or customer authorization is introduced. Meeting-derived identity/property information remains reviewable internal data until explicitly applied.
