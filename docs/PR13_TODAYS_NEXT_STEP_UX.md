# PR #13 Prompt — Today's Next Step UX Card

## Goal
Make the dashboard answer this question within 10 seconds:

> What do I do next?

Add a high-visibility `Today’s Next Step` card directly under `Launch Control` and before the First-Run Checklist / Apply Staged Changes grid.

## Current context
- PR #12 is merged.
- Dashboard already has Launch Control, First-Run Checklist, and Apply Staged Changes.
- Stage/Approve actions must not write to Shopify.
- Bulk stage actions must not write to Shopify.
- Only `Apply Approved to Shopify` writes staged changes.
- Latest reported tests: `51 passed`.

## Required UX behavior
Add a top-of-page card that changes based on current state:

### Case 1 — Shopify is not connected
Title: `Today’s Next Step`
Message: `Connect Shopify before staging products.`
Detail: `Do not stage or apply changes until the connection status is Connected.`
Badge: `Needs connection`

### Case 2 — Shopify connected but write permissions missing
Title: `Today’s Next Step`
Message: `Fix Shopify write permissions before applying changes.`
Detail: `You can review recommendations, but do not apply until Write Permissions shows Available.`
Badge: `Needs write permission`

### Case 3 — connected, write permissions available, no staged products
Title: `Today’s Next Step`
Message: `Stage 1 low-risk product only.`
Detail: `Then confirm Staged products shows 1 before using Apply Approved to Shopify. Do not bulk stage yet.`
Badge: `Start here`

### Case 4 — one or more staged products
Title: `Today’s Next Step`
Message: `Review staged products, then Apply Approved to Shopify.`
Detail: `This writes only staged products. Confirm the success banner has zero failures and verify the product in Shopify admin.`
Badge: `Ready to apply`

## Placement
Place the card immediately below `Launch Control`, before the two-column section that contains `First-Run Checklist` and `Apply Staged Changes`.

## Visual requirements
- Use a large, obvious heading: `Today’s Next Step`.
- Make the main instruction short and bold.
- Include a small safety note: `One product first. Do not bulk stage until the first live test passes.`
- Keep it readable on mobile.
- Do not add clutter.

## Tests
Add or update tests so they verify:
1. Dashboard renders `Today’s Next Step`.
2. When no products are staged and Shopify is connected/write-ready, the page says `Stage 1 low-risk product only`.
3. When products are staged, the page says `Review staged products, then Apply Approved to Shopify`.
4. The `Apply Approved to Shopify` button still appears only in the Apply Staged Changes card.
5. Stage/Approve routes still do not write to Shopify.
6. Apply Approved still applies only staged products.

## README update
Add one sentence to the Launch Dashboard Workflow:

`The Today’s Next Step card tells you exactly what to do first; follow it before using bulk stage actions.`

## Validation
Run:

```bash
python -m pytest -q
```

Expected:

```text
All tests pass.
```
