# H38 Skills Catalog

This directory contains reusable Agent Skills for Highway 38 Solutions. Each skill follows the OpenAI/Agent Skills `SKILL.md` convention so the workflow can be versioned with the product and reused by compatible ChatGPT, Codex, or agent environments.

## Core skills

- `h38-repo-change-safety` — safe repository intake, branching, canonical-owner checks, and exact-head discipline.
- `h38-office-acceptance` — Business Office lifecycle acceptance from customer creation through paid invoice.
- `h38-tenant-engine-protection` — preserve the shared engine while keeping tenant data, branding, and permissions isolated.
- `h38-ux-polish` — systematic desktop/phone UX review without duplicating shared components.
- `h38-production-deployment` — merge/deploy/live verification discipline.
- `h38-takeover-handoff` — durable handoff for another chat/agent without restarting diagnosis.
- `h38-training-video-qa` — review and rebuild training/demo recordings against the actual software.
- `h38-social-content` — tenant-neutral social-content and AI-spokesperson workflow with controlled branding.

## Authority

These skills do not replace `AGENTS.md` or the architecture documents. Repository authority always wins. Skills should point work back to the canonical source instead of creating a parallel process.

## Design rule

Keep skills modular. Use several small skills together when a task spans repository safety, UX, acceptance, deployment, or training evidence rather than building one giant all-purpose instruction file.
