# Ecosystem Launch Rollback Point

Branch: `complete-ecosystem-live-launch-2026-07-11`

Production baseline before this package: `3bd325f0d94c6bcc798fbbc31f42effab413472b`.

This launch-branch package has not written to production. If the public-site package is later merged and requires rollback, reset or revert the public deployment to the recorded pre-merge production baseline or the merge parent's exact commit, then rerun route, catalog, privacy, and asset verification.

The existing private Owner Portal rollback backup remains separate from this public-site package. No Apps Script deployment is changed by these branch commits.
