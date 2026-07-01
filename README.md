# RangeRivet Works
Practical tools, plans, and systems for garages, shops, homes, and small businesses.

**Live site:** https://rkrueth-maker.github.io/ForgeIQ/

## GitHub Pages Setup
To publish the site:
1. Go to **Settings → Pages**
2. Under **Build and deployment**, select **Deploy from a branch**
3. Branch: `main` — Folder: `/ (root)`
4. Click **Save**

The site will be live at: `https://rkrueth-maker.github.io/ForgeIQ/`

> The `.nojekyll` file at the root disables Jekyll processing so the plain HTML/CSS page loads correctly.

---

![Status](https://img.shields.io/badge/status-launch%20test%20ready-success)
![Tests](https://img.shields.io/badge/tests-51%20passed-success)
![Python](https://img.shields.io/badge/python-3.11-blue)

## Project Status
| Area | State | Notes |
| --- | --- | --- |
| Core architecture | Complete | Shared settings, config, logging, and Shopify client are in place. |
| Plugin registry | Complete | Modules auto-discover from the modules package. |
| Launcher and CLI | Complete | Interactive launcher plus direct option and setting commands are available. |
| Shopify modules | Active | SEO audit, alt text, collections, product intelligence, staged approvals, and content preview are available. |
| Browser dashboard | Launch-ready | Launch Control, First-Run Checklist, Shopify connection status, staged approvals, and Apply Staged Changes flow are in place. |
| Test coverage | Active | Latest reported validation: `51 passed`. |
| Next step | Pending local test | Run the dashboard locally and apply one staged Shopify product only. |

## Overview
ForgeIQ has evolved from standalone scripts into a modular Shopify operations app with shared configuration, logging, a reusable API client, and a launch-ready browser dashboard.

## Current Capabilities
- Menu-based launcher with direct CLI execution options.
- Centralized settings management with persistent updates.
- Shared Shopify GraphQL and REST client path for all active modules.
- Automatic plugin discovery and registry-backed module routing.
- Launch-ready dashboard with Launch Control, First-Run Checklist, Shopify Connection Status, Products Needing Attention, AI Agent, Analytics Summary, Reports, Logs, and Scheduled Tasks.
- Staged dashboard approval workflow: Stage/Approve marks products, and Apply Approved to Shopify writes only staged products.
- Tag-only recommendations now apply through the explicit Shopify product tag update path.
- Apply feedback banner reports processed products, product updates, alt-text updates, and failures.
- GitHub Actions workflow and regression test coverage for the staged approval safety model.

## Application Entry Points
- Interactive mode:
  - `python app.py`
- Run one module directly:
  - `python app.py --option 1`
- Persist a setting:
  - `python app.py --setting SHOPIFY_API_VERSION 2026-07`

## Testing
- Run tests locally:
	- `python -m pytest -q`
- Start the dashboard locally:
	- `python app.py`

## Continuous Integration
- GitHub Actions workflow: `.github/workflows/tests.yml`
- Workflow name: `ForgeIQ Tests`
- Triggers:
	- push to `main`
	- pull_request to `main`
- CI job uses Python `3.11`, installs `requirements.txt`, then runs:
	- `python -m pytest -q`

## First Live Store Test
- Start the dashboard:
	- `python app.py`
- Open the dashboard in your browser:
	- `http://127.0.0.1:5050`
- Confirm the top dashboard sections show:
	- `Launch Control`
	- `First-Run Checklist`
	- `Apply Staged Changes`
	- `Shopify Connection Status`
	- `Products Needing Attention`
- Confirm Shopify status shows:
	- connected status
	- correct store name
	- product count
	- write permissions available or missing
	- order analytics scope available or missing
- Review recommendations before staging any products.
- Stage one low-risk product first.
- Use `Apply Approved to Shopify` only after reviewing the staged queue.
- Confirm the changed product manually in Shopify admin.
- Use bulk staging only after the one-product test succeeds.

## Launch Dashboard Workflow
1. Start dashboard with `python app.py`
2. Confirm Shopify Connection Status
3. Review Products Needing Attention
4. Stage one product first
5. Click Apply Approved to Shopify
6. Confirm the product in Shopify admin
7. Use bulk staging only after one-product test succeeds

## Session Logs
- Latest session log: `docs/SESSION_LOG_2026-06-28.md`

## Module Catalog
- `1` SEO Audit: audits products and writes a CSV report.
- `2` Update Image Alt Text: previews/applies missing image alt text.
- `3` Optimize Product SEO: analyzes products, scores SEO health, writes report, supports staged approve/reject plus explicit Apply Approved.
- `4` Create Shopify Collections: creates/updates collections and assignments.
- `5` Generate Blog Post: placeholder, validates connection.
- `6` Content Engine Preview: generates phase 2 content seeds and writes a markdown preview.
- `11` Shopify Connection Check: validates app install, token access, and required scopes.

## Architecture Snapshot
- `settings.py`: centralized config loading and persistence.
- `config.py`: dynamic Shopify URL/header helpers and validation wrappers.
- `shopify/client.py`: shared API client for GraphQL/REST operations.
- `logger.py`: consistent app and module logging.
- `modules/`: metadata-driven plugin registry and module entrypoints.
- `shopify/`: domain workflows for SEO, alt text, collections, product intelligence, content preview, and browser dashboard workflows.

## Verification Status
- Latest merged launch UX PR: `#12`.
- Latest reported automated tests: `51 passed`.
- Approval safety verified by tests:
	- Stage/Approve routes do not call Shopify write operations.
	- Bulk stage does not call Shopify write operations.
	- Apply Approved applies only approved/staged products.
	- Apply feedback banner renders after apply.
	- Launch Control, First-Run Checklist, and Apply Staged Changes render on the dashboard.
- Local live Shopify test is still pending.

## Roadmap / Next Session
1. Run local tests: `python -m pytest -q`.
2. Start dashboard: `python app.py`.
3. Verify Shopify connection and write permissions.
4. Stage one low-risk product only.
5. Apply that one product to Shopify.
6. Confirm the product changed correctly in Shopify admin.
7. If the one-product test passes, test Stage Top 3.
8. Confirm GitHub Actions checks are visible on future PRs.
9. Consider caching Shopify connection status to reduce dashboard API calls.
