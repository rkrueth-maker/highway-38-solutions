# H38 Office post-deploy Tool Center marker repair

Scope: acceptance-contract repair only. No production Supabase mutation, no production quote mutation, and no Owner Maintenance Quote Regression rerun.

Direct evidence before repair:

- `main` was `fb7b96d6c1f835fbb8f3a43d91c8baf37a90adee`.
- The published `gh-pages/tool-center.html` is intentionally retired and contains `Tool Center has been retired.`.
- The post-deploy workflow still expected the obsolete marker `data-tool="project"` for `tool-center.html`.
- The exact-main post-deploy live acceptance run failed at the live-page marker verification step while repository verification passed.

Repair:

- Update the live acceptance marker for `tool-center.html` to `Tool Center has been retired.`.
- Update acceptance-report wording from `Planning Tool Center` to `retired Tool Center redirect`.

Acceptance rule:

- PASS only after exact-head checks succeed and the exact-main post-deploy live acceptance succeeds after merge.
