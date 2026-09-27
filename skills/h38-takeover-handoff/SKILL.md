---
name: h38-takeover-handoff
description: Create a precise takeover handoff for another ChatGPT chat, Work session, or coding agent working on Highway 38 Solutions. Use when the user asks for a handoff, new-chat takeover, or continuation package.
---

Build the handoff from verified current state, not memory alone.

Include:
1. Goal — what must be finished and what must not be redone.
2. Repository — `rkrueth-maker/highway-38-solutions` and production branch.
3. Current verified production `main` SHA fetched at handoff time.
4. Active feature/repair branch and exact head SHA, if any.
5. Open PR number/title/status, if any.
6. Completed work — only what is actually complete.
7. Current failures/HOLD items — exact failure, affected workflow, platform, and evidence/run IDs when available.
8. Required next actions in execution order.
9. Mandatory repository rules:
   - refetch `main` before every write;
   - preserve intervening work;
   - never reset backward to a handoff SHA;
   - branch first;
   - merge only on exact-head green acceptance.
10. Product invariants relevant to the task: unified Office engine, tenant isolation, approved H38 logo/assets, external-action locks, production/test boundaries.
11. Acceptance definition — what concrete evidence makes the task complete.
12. Links/identifiers for workflows, artifacts, releases, or deployed pages when they materially help continuation.

Write the handoff so the next agent can begin execution immediately without asking the user to restate known context.
