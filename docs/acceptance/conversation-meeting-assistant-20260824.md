# H38 Conversation & Meeting Assistant — 2026-08-24

Branch: `agent/conversation-meeting-assistant-20260824`

Base authority: `6ef9ac615c254aa2d8464db41e59b25e87bb8d19`

## Implemented first-version contract

- One Business Office Meetings area for customer, Site Visit, follow-up, business, vendor, subcontractor, employee/internal, phone, informal, other, and past conversations.
- Recording is optional. `Add Past Conversation` accepts typed recollection or dictated recollection with zero pre-existing audio.
- Meeting evidence uses explicit provenance: `RECORDED_AUDIO`, `RECORDED_VIDEO_AUDIO`, `LIVE_TYPED_NOTE`, `DICTATED_RECOLLECTION`, `TYPED_RECOLLECTION`, `IMPORTED_NOTE`, `ATTACHMENT`, `MIXED`.
- Recalled measurements remain `RECALLED_NOT_VERIFIED`. Recorded spoken measurements remain unverified unless the evidence explicitly states operator verification with a tape, laser, ARCore, or LiDAR source.
- Meeting records live in the existing generic `business_records` model under collection `meetings`; no destructive Site Visit migration.
- Existing Site Visit records are projected read-only as historical conversation memory.
- Live meeting audio uses WebView/browser microphone capture and private IndexedDB checkpoints, then private Supabase Storage synchronization.
- The meeting audio controller stops and persists its segment before a user-launched CameraX walkthrough, so CameraX retains microphone authority.
- Walkthrough transcript evidence can be added as a `RECORDED_VIDEO_AUDIO` segment in the same logical Site Visit meeting.
- Customer page exposes conversation history and Start Follow-up Meeting.
- Before Visit context uses actual recent meeting history plus relevant quote/job state.
- Quote Builder receives an explicit meeting context object with provenance. Canonical Quote Agent remains the quote-generation authority.
- No automatic customer/vendor messaging, quote approval, purchasing, payment, scheduling, or external commitment.

## Acceptance status semantics

Automated verification may prove architecture, persistence contracts, provenance, offline logic, browser/runtime integration, and unchanged CameraX authority. It does **not** replace physical Android acceptance.

Final physical acceptance must still prove:

1. Past conversation with no recording.
2. Live customer meeting audio capture/transcription.
3. Conversation → CameraX walkthrough → resumed conversation without dual-microphone failure.
4. Follow-up context for the same customer.
5. Business meeting without a customer.
6. Recalled dimension stays unverified downstream.
7. Offline recording/notes survive reconnect and synchronize.

Do not call the feature physically accepted until those phone paths pass.
