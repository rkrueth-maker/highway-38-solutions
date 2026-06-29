# ForgeIQ Control Center v1 Rollout Runbook
Date: 2026-06-29

## Scope
This runbook governs the path from one-product safety verification to controlled rollout.

## Phase 1: One-Product Safety Gate (Required)
Complete every item before using Stage Top 3.

1. `git pull`
2. `/workspaces/ForgeIQ/.venv/bin/python -m pytest -q`
3. Start dashboard with `./scripts/run-dashboard.sh` (fallback: `/workspaces/ForgeIQ/.venv/bin/python app.py`)
4. Open local dashboard URL
5. Verify Launch Control card works
6. Verify Shopify Connection Status card works
7. Verify Write Permissions are confirmed
8. Stage one low-risk product
9. Click Apply Approved to Shopify
10. Verify apply banner reports zero failures
11. Verify product change manually in Shopify admin

Hard rule: Do not use Stage Top 3 or any bulk staging until all steps above are complete.

## Phase 2: Controlled Top 3 Rollout
After Phase 1 passes:

1. Stage Top 3 products
2. Review each product before approving
3. Apply approved products to Shopify
4. Confirm zero failures
5. Manually check all 3 products in Shopify admin

## Phase 3: Product Page QA (Each Top 3 Product)
Use this checklist for each product:

1. Title clean
2. Description clean
3. Price correct
4. Images loaded
5. Category or collection correct
6. Shipping visible
7. Mobile view clean
8. No weird supplier names
9. No bad compare-at price

## Phase 4: Traffic Rollout
1. Schedule Facebook posts
2. Schedule Pinterest posts
3. Queue Instagram later
4. Do not push all products equally
5. Pick one main product per 72-hour test window

## Phase 5: Decision Rules
1. Visits but no carts: improve product page, price, or offer
2. Carts but no checkout: improve trust, shipping clarity, and checkout confidence
3. Checkout but no sale: inspect shipping cost, payment path, and abandoned checkout
4. Sale: scale that product
5. No visits: revise traffic angle and posting approach

## Milestone Definition
ForgeIQ Control Center v1 is proven when all conditions are true:

1. Local dashboard works
2. Shopify write works
3. One product updates safely
4. Top 3 can stage without errors
5. Traffic test data is recorded
6. Next product decision is based on data

## Immediate Next Command
After one-product safety gate passes:

`Stage Top 3`
