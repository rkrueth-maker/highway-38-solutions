# ForgeIQ
AI-powered garage, workshop, and ecommerce operating system.

![Status](https://img.shields.io/badge/status-v2.0%20core%20operational-success)
![Tests](https://img.shields.io/badge/tests-9%20passed-success)
![Python](https://img.shields.io/badge/python-3.12-blue)

## Project Status
| Area | State | Notes |
| --- | --- | --- |
| Core architecture | Complete | Shared settings, config, logging, and Shopify client are in place. |
| Plugin registry | Complete | Modules auto-discover from the modules package. |
| Launcher and CLI | Complete | Interactive launcher plus direct option and setting commands. |
| Shopify modules | Active | SEO audit, alt text, collections, product intelligence, and content preview are available. |
| Test coverage | Complete | Regression tests for setup, CLI, and optimizer logic are passing. |
| Next phase | Planned | Content engine expansion, analytics dashboard, orchestrator. |

## Overview
ForgeIQ has evolved from standalone scripts into a modular Shopify operations app with shared configuration, logging, and a reusable API client.

## Current Capabilities
- Menu-based launcher with direct CLI execution options.
- Centralized settings management with persistent updates.
- Shared Shopify GraphQL and REST client path for all active modules.
- Automatic plugin discovery and registry-backed module routing.
- Staged dashboard approval workflow: Approve marks products, Apply Approved writes updates.
- Regression test coverage for setup, CLI, and optimizer behaviors.

## Application Entry Points
- Interactive mode:
  - `python app.py`
- Run one module directly:
  - `python app.py --option 1`
- Persist a setting:
  - `python app.py --setting SHOPIFY_API_VERSION 2026-07`

## Module Catalog
- `1` SEO Audit: audits products and writes a CSV report.
- `2` Update Image Alt Text: previews/applies missing image alt text.
- `3` Optimize Product SEO: analyzes products, scores SEO health, writes report, supports staged approve/reject plus explicit Apply Approved.
- `4` Create Shopify Collections: creates/updates collections and assignments.
- `5` Generate Blog Post: placeholder, validates connection.
- `6` Content Engine Preview: generates phase 2 content seeds and writes a markdown preview.

## Architecture Snapshot
- `settings.py`: centralized config loading and persistence.
- `config.py`: dynamic Shopify URL/header helpers and validation wrappers.
- `shopify/client.py`: shared API client for GraphQL/REST operations.
- `logger.py`: consistent app and module logging.
- `modules/`: metadata-driven plugin registry and module entrypoints.
- `shopify/`: domain workflows for SEO, alt text, collections, product intelligence, and content preview.

## Verification Status
- Automated tests currently passing: `9 passed`.
- CLI routing verified for direct module execution across options 3 and 6.
- Settings persistence verified through tests and runtime path.
- Live runtime validations completed:
	- Option `3` Product Intelligence dry-run against Shopify store, no changes applied.
	- Option `6` Content Engine preview generated successfully.

## Roadmap (Next Phase)
1. Content Engine Expansion:
	- Blog, social, Pinterest, and email generation from catalog data.
	- Template packs and channel-specific tone controls.
2. Product Intelligence Enhancements:
	- Smarter title/meta/tag heuristics and confidence scoring.
	- Bulk approval presets and category-based workflows.
3. Analytics Dashboard:
	- Shopify + GA + Search Console metrics and SEO health.
4. AI Orchestrator:
	- Prioritize actions, queue tasks, and produce operational summaries.
