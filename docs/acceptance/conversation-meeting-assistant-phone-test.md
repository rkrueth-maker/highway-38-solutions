# Conversation & Meeting Assistant — Physical Android Acceptance Card

Use the owner-test Highway 38 Android shell. Physical phone behavior is final authority for recording and CameraX microphone handoff.

## A — Past conversation / no recording
1. Meetings → Add Past Conversation.
2. Enter a remembered customer or business conversation.
3. Save without recording.
4. Confirm source label says Typed recollection or Dictated recollection, never Recorded transcript.
5. Confirm summary/requests/decisions/actions organize after sync.

## B — Live customer meeting
1. Start Meeting → Customer Meeting.
2. Tap Start recording intentionally and acknowledge consent reminder.
3. Speak a short request and one undecided question.
4. Add one + Customer Request quick note.
5. Finish Conversation.
6. Confirm private audio survives, transcript appears, request is separate from decision, and no message/quote is sent.

## C — Site Visit microphone handoff
1. Open Site Visit → Start Visit Assistant.
2. Record conversation for at least 10 seconds.
3. Tap Start Walkthrough while conversation audio is active.
4. Confirm H38 visibly closes/saves the conversation audio segment first.
5. Confirm native CameraX opens and records video + microphone normally.
6. Stop & Use Video and return to the same Site Visit.
7. Tap Resume Conversation and record a second audio segment.
8. Finish Visit / meeting.
9. Confirm one logical meeting timeline contains conversation + walkthrough + resumed conversation.

## D — Follow-up context
1. Open the same customer later.
2. Start Follow-up Meeting.
3. Confirm recent requests, unresolved questions/actions, and relevant quote/job state appear under Before Visit.

## E — Business meeting without customer
1. Start Meeting → Business Meeting.
2. Leave customer blank.
3. Record or add recollection.
4. Confirm meeting saves and organizes normally.

## F — Provenance
Enter or dictate: `I think the customer said the opening was about 48 inches.`
Confirm the dimension remains recollected/unverified and is not labeled operator verified in Meeting or Quote context.

## G — Offline recovery
1. Start a meeting while online, then disable data/Wi-Fi.
2. Continue recording and add a quick note.
3. Finish Conversation.
4. Confirm the UI says evidence is saved on this device and meeting remains visible.
5. Reconnect.
6. Confirm upload/transcription/organization completes without losing the original local evidence.
