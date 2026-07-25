# Highway 38 Universal Quote Builder

## Authority

This capability extends the existing canonical Highway 38 Quote Builder. It does not create a second application, database, router, approval system, customer boundary, or deployment.

- Quote Builder remains a module inside Highway 38 Business Office.
- The focused standalone package uses the same shared codebase.
- Existing customers, quotes, lines, jobs, documents, approvals, roles, Proof Log, Error Log, audit history, and deployment IDs remain authoritative.
- External actions remain disabled or owner-approved.

## Product rule

> Simple when the quote is simple. Deep when the work is complex.

The engine uses five progressive quote levels:

1. Basic quote
2. Itemized quote
3. Area-based quote
4. Technical quote
5. Concept and integration proposal

An intake recommendation may suggest a level. An authorized user controls the final level.

## Structured project model

Complex quotes use one project model with:

- master proposal;
- area, system, phase, trade, assembly, vendor, subcontractor, or alternate sub-quotes;
- calculations and quantity sources;
- customer scope and protected internal cost;
- drawings and revision classifications;
- instructions, quality checks, evidence requirements, and completion criteria;
- allowances, options, contingencies, assumptions, exclusions, approvals, and schedule basis.

Customer and internal outputs are visibility-controlled views of the same structured data.

## Pricing

`BusinessOffice_UniversalQuoteBuilder.gs` provides 34 deterministic pricing methods covering unit, service, labor, machine, setup, operation, production, area, volume, weight, flat-rate, recurring, tiered, formula, cost-plus, target-margin, pass-through, allowance, and time-and-material calculations.

Every result preserves input values, formula, price-book version, waste, markup, margin, minimum charge, difficulty, contingency, manual override, override reason, approving user, and source and warning status.

H38 AI may organize inputs or recommend a method. It may not invent official prices, rates, costs, codes, or technical specifications.

## Drawings

Supported classifications are Conceptual, Estimating, Subcontractor bidding, Field layout, Construction-ready, Permit submission, Engineer or licensed-professional review required, and Approved final.

AI-generated concepts must never be represented as permits, stamped engineering, or approved construction documents.

## Agents

The controlled universal agents are Intake and Requirements, Quote Architect, Measurement and Quantity, Pricing and Costing, Scope and Instruction, Drawing, Quote Review, and Business Setup.

Agent outputs remain proposals until the configured approval level is satisfied. Agents cannot independently send quotes or bid requests, alter official pricing, commit funds, promise schedules, approve changes, delete protected records, change permissions, or deploy code.

## Repeatable demonstrations

`boUniversalPrepareHouseDemonstration(runKey)` creates a stable idempotency key from an owner-supplied run label. It intentionally does not hard-code a demonstration number. Existing Cabin Demo 08 records remain untouched as accepted historical proof.

Each run prepares one project, one master proposal, fourteen trade sub-quotes, ten drawing-register entries, six subcontractor bid packages, and no customer send, purchasing, payment, scheduling, or other external action.

The public demonstration is `universal-quote-builder.html`.

## Verification

The dedicated verifier is `scripts/verify-universal-quote-builder.js`. It is included in fast application, commercial, Business Office, PR source-smoke, and production deployment verification paths. The expected machine-readable result records five levels, 34 pricing methods, eight controlled agents, eighteen scenarios, fourteen house sub-quotes, ten drawings, six bid packages, open-ended example wording, and zero external actions.
