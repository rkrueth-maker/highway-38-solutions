# Conversation & Meeting Assistant runtime

This runtime is intentionally additive and loads after the accepted Site Visit/mobile authorities.

- Persistence: existing `business_records` collection `meetings` through the Business Office offline operation queue.
- Private media: IndexedDB attachment checkpoint → `business-office-files` → `documents` record.
- Live audio: browser/WebView microphone only, user initiated.
- Walkthrough: existing native CameraX remains authoritative. Active conversation audio is stopped and persisted before the walkthrough launch click is re-issued.
- AI: `h38-conversation-transcription` and `h38-conversation-organize` share the existing Supabase membership, Proof Log, Error Log, storage, and OpenAI patterns.
- Existing Site Visits: projected as read-only historical meetings; no destructive rewrite.
- Quote Builder: meeting context is attached with field provenance; `h38-quote-agent` remains the canonical quote authority.
