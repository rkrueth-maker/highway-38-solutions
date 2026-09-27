---
name: h38-training-video-qa
description: Review, repair, order, and regenerate Highway 38 or Northern Lakes training/demo videos using the real software workflow. Use for narrated instruction videos, lifecycle recordings, phone recordings, or requests to scan videos for operator errors.
---

1. Identify the exact software build/commit shown or used by the recording.
2. Use the real deployed/runtime interface when the task is to demonstrate functioning software. Do not substitute fake UI, generated screens, or slide-only demonstrations.
3. Review each video for:
   - incorrect navigation or module placement;
   - confusing button order;
   - hidden/awkward operator actions;
   - wrong tenant/customer context;
   - stale statuses or balances;
   - clipped/obscured phone controls;
   - narration that disagrees with the screen;
   - steps shown out of lifecycle order;
   - long idle sections or unnecessary repetition.
4. Compare the recording to the canonical workflow: customer → site visit when applicable → quote → job/service → completion → invoice → payment.
5. If a UX defect is discovered, fix the canonical shared engine first when appropriate, then rerun the affected recording. Do not merely narrate around a product defect.
6. Keep H38 and Northern Lakes engine behavior aligned while preserving tenant-specific branding/data.
7. Produce both desktop and phone evidence for operator-critical flows when requested.
8. For a master training video, order segments by the way a new operator would actually perform the work. Put specialized/admin modules after core daily workflow.
9. Use controlled TEST data and do not trigger real customer communication, money movement, or external actions.
10. Return a QA result for each recording: `PASS`, `RECORD AGAIN`, or `PRODUCT FIX REQUIRED`, with the exact reason.
