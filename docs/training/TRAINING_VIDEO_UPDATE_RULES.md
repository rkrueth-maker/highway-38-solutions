# H38 / Northern Training Video Update Rules

This is the canonical fast-path rule for maintaining the Highway 38 and Northern Lakes training libraries after workflow, UI, recorder, narration, or tenant changes.

## 1. Permanent Drive destinations

Keep each tenant's current training library in its existing shared folder.

- **Highway 38 Solutions** → Amanda's shared folder **Highway 38 Solutions — Current Training**: https://drive.google.com/drive/folders/1mkJ5QyHqX3bJ8KW64Cc8vI_ZKD-LCo5t
- **Northern Lakes** → shared folder **Northern Lakes — Current Training**: https://drive.google.com/drive/folders/1goznCyh2_FDYKHqgMk7halig03TNABPm

Do not cross-publish tenant-specific lessons between these folders. Keep shared-engine behavior aligned while preserving tenant-specific branding, data, service examples, and file names.

## 2. Replace in place by default

When an existing workflow video is regenerated and still represents the same lesson:

1. verify the new recording first;
2. replace the existing Drive file bytes in place so its Drive file ID and shared link remain stable;
3. rename the file only when the workflow name or capture date needs to change;
4. update only the master video or videos that include that lesson.

Create a new Drive file only for a genuinely new workflow or a new required viewport/master that did not previously exist.

When a lesson is retired, misclassified, or moved to another tenant, move it into an archive folder instead of deleting it unless Rick explicitly approves deletion.

## 3. Targeted regeneration is the default

Do **not** rerun the full training library merely because one workflow changes.

Use the smallest valid scope:

- one workflow change → regenerate that lesson only, then rebuild only the master or masters containing it;
- desktop-only change → regenerate desktop lesson and affected desktop master only;
- phone-only change → regenerate phone lesson and affected phone master only;
- narration-only change → regenerate/remux narration only when the visual capture remains valid;
- master ordering/title change → rebuild the affected master from existing PASS lesson files without re-recording unchanged lessons;
- tenant-specific change → rerun only that tenant's affected lessons and masters;
- workflow/test harness change → rerun only the workflow evidence owned by that harness;
- failed lesson in a multi-lesson batch → preserve existing PASS lessons and rerun only the failed lesson when the inputs to the passing lessons did not change.

## 4. When a full-library rerun is justified

A full tenant-library rerun is required only when the change can invalidate most or all lessons, such as:

- shared training privacy masking or PII scrubbing;
- shared caption/coach-mark positioning used across the library;
- narrator engine or narration timing rules affecting the whole library;
- tenant-wide branding shell changes visible throughout recordings;
- authentication/session behavior used by nearly every lesson;
- a shared navigation or layout change that materially alters most workflows;
- a recorder framework defect that means prior PASS media is no longer trustworthy.

A shared Business Office engine change alone does **not** automatically require every H38 and Northern video to be regenerated. Rerun only the workflows whose visible behavior, persisted result, permissions, privacy boundary, or narration actually changed.

## 5. Pass criteria for a targeted video update

A targeted replacement may ship when all affected items pass:

- correct tenant and workflow;
- correct desktop/phone layout for that lesson;
- no private email, UUID, customer/property information, credential, or raw TEST/internal label leaks;
- narration agrees with the screen when narration is required;
- no coach mark or caption obscures the control being taught;
- no unauthorized external action occurred;
- controlled TEST data is used where mutations are demonstrated;
- the workflow result required by the lesson is proven;
- affected master video or videos are rebuilt and checked;
- unchanged lessons retain their prior valid evidence when their tested inputs are unchanged.

Security, customer isolation, destructive-action, payment, external-send, approval, and privacy checks remain fail-closed and may never be skipped for speed.

## 6. Evidence reuse

Reuse existing PASS media and evidence when the concern it proves did not change.

A new commit does not invalidate unrelated training evidence by itself. Record which workflows were affected, which previous PASS lessons were reused, and why their tested inputs remained unchanged.

If the same recording failure occurs twice, stop blindly rerunning the full library. Fix the canonical product, recorder, fixture, selector, concurrency rule, or permission path, then rerun the smallest affected scope.

## 7. Master video rule

Keep desktop-landscape and phone-portrait masters separate. Never pad phone lessons into a desktop master merely to make one combined file.

Rebuild only masters that contain a changed lesson. A new workflow is added to the appropriate operator, owner/accounting/AI, or reference master based on the way a trainee would actually use it.

## 8. Completion rule

Training maintenance is complete when:

- the affected lesson files are PASS;
- the affected masters are current;
- the correct tenant shared folder contains the current files;
- existing Drive IDs/links were preserved where possible;
- obsolete current-folder copies were archived or removed from the current view;
- no unrelated full-library rerun was required merely for process compliance.
