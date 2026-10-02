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
11. Follow `docs/training/TRAINING_VIDEO_UPDATE_RULES.md` for every training-library maintenance task.
12. Keep Highway 38 current videos in Amanda's **Highway 38 Solutions — Current Training** shared folder and Northern Lakes current videos in **Northern Lakes — Current Training**. Never cross-publish tenant-specific lessons.
13. Targeted regeneration is the default. A workflow change reruns only that lesson and the master or masters that contain it. A phone-only, desktop-only, narration-only, or master-ordering change must stay limited to that affected media whenever existing PASS evidence remains valid.
14. Preserve existing Drive file IDs and shared links by replacing video bytes in place whenever the lesson still represents the same workflow. Create a new Drive file only for a genuinely new workflow or required viewport/master.
15. Preserve unaffected PASS videos. Do not rerun a full library merely because another lesson failed or a new commit exists. Full-library reruns are reserved for changes such as shared privacy masking, shared caption/coach-mark behavior, narrator engine changes, tenant-wide branding/navigation changes, authentication/session changes used across nearly every lesson, or a recorder-framework defect that invalidates prior media.
16. When a lesson is retired or misclassified, archive/move it out of the Current Training folder instead of deleting it unless Rick explicitly approves deletion.
17. Keep desktop-landscape and phone-portrait masters separate. Rebuild only masters that contain a changed lesson.
18. A targeted replacement passes only when the affected lesson has the correct tenant/workflow/layout, no privacy leaks, accurate narration when required, unobscured controls, controlled TEST data for mutations, no unauthorized external actions, and a rebuilt affected master when applicable.
