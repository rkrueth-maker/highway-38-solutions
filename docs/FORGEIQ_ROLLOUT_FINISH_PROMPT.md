# ForgeIQ Rollout Finish Prompt
Implement the final ForgeIQ Control Center rollout upgrades.

## Current status
Persistent Phase 2-5 rollout checklist has been implemented.

Known validation:

- Targeted dashboard tests: 16 passed
- Full test suite: 58 passed
- Rollout checklist state is saved under `rollout_checks`
- `/rollout/check` toggle endpoint exists
- Apply Approved flow should preserve rollout checklist state

## Finish tasks

### 1. Add Rollout Summary card
Add a compact dashboard card that shows:

- `Rollout Progress: X / Y complete`
- Phase 2 progress: X / Y
- Phase 3 progress: X / Y
- Phase 4 progress: X / Y
- Phase 5 progress: X / Y
- Next unchecked rollout item
The next unchecked item should include:

- Phase name
- Item label
- Short recommended next action
Use existing `rollout_checks`.
Do not create a second state system.

### 2. Add Stage Top 3 safety gate
Stage Top 3 must be blocked until the one-product safety checklist is complete.

Required checklist items:

- Tests passed
- Local dashboard verified
- Shopify connection confirmed
- One low-risk product staged
- Apply Approved completed
- Zero failures confirmed
- Product verified in Shopify admin
If blocked, show:

`Stage Top 3 is locked until the one-product safety test is complete.`

Also show the missing checklist items.

Server-side protection is required.
Do not rely only on front-end disabling.

### 3. Add tests
Add or update tests proving:

- Rollout Summary total count is correct
- Phase-level counts are correct
- Next unchecked item updates after toggling
- Rollout checklist state survives refresh/apply flows
- Stage Top 3 is blocked when prerequisites are incomplete
- Missing prerequisites are displayed
- Stage Top 3 is allowed only after prerequisites are complete
- One-product staging still works

### 4. Run validation
Run:

```python -m pytest -q
```
Expected result:

- Full suite passes

### 5. Commit
Use this commit message:

```git add shopify/approval_state.py shopify/web_dashboard.py tests/test_scheduler_web_dashboard.py docs/FORGEIQ_ROLLOUT_FINISH_PROMPT.md
git commit -m "Finish rollout summary and Stage Top 3 safety gate"
```

## Rules
Do not bulk apply Shopify products until:

- One-product test passes
- Apply Approved shows zero failures
- Product change is manually verified in Shopify admin
