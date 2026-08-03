# H38 Reusable Commercial Office — Complete Platform Baseline

## Purpose

This baseline completes the reusable Commercial Office before any Highway 38 production records are loaded into it. Highway 38 will be installed later as a business pack and migration source, not copied into a second architecture.

## Shared platform

One business installation uses shared records and services for:

- users, roles, permissions and multiple business types;
- customers, contacts, properties, requests, jobs, work orders, tasks and scheduling;
- Quote Builder, cached Price Book, measurements, photos, revisions and owner review;
- field capture, time, checklists, documents and offline work;
- inventory, purchasing requests, fleet, equipment assignments, inspections, maintenance and usage;
- invoices, manually recorded payments, expenses and accounting-preparation records;
- internal messaging, email drafts, customer SMS drafts and customer-portal messages;
- Social Control, campaigns, review, approval, internal scheduling, manual publication proof and metrics;
- contextual AI teaching, business recommendations, missing-button detection and feature requests;
- voice capture and driving mode with parked-review controls;
- Proof Log, Error Log, backups, integration health, settings and product entitlements.

## Product shells

The same records and service functions support:

- Full Business Office
- Standalone Quote Builder
- Field and Crew
- Inventory and Fleet
- Social Control

A business can add or remove shells and modules without moving its records.

## Offline contract

The installable application uses a service worker and IndexedDB. It stores business snapshots, drafts, attachments and pending operations with stable IDs. It supports quote drafts, measurement worksheets, field notes, photos, time, internal messages, email/SMS/portal drafts, inventory actions, fleet actions, expenses and social drafts while offline.

Every queued operation contains an operation ID, business, device, action, record, base version, local time and payload. The server is idempotent and records synchronization or conflict evidence. Important conflicts are not silently overwritten.

## Measurement integrity

Measurements are classified as direct, device measured, reference-scaled estimate, visual estimate, user confirmed or needs verification. Estimate-grade measurements are visibly flagged and cannot be represented as verified dimensions.

## Communication boundaries

Internal messages are free within the authorized business and are stored separately from customer-facing communication. Email, SMS and portal records may be drafted and organized before a provider is connected. Nothing is sent automatically.

## Social Control

Social Control supports content creation, campaign organization, assets, review requests, owner or administrator approval, internal scheduling, manual posting proof and performance metrics. Automatic provider publishing remains disabled until a business-specific provider is connected, tested and explicitly released.

## AI and voice

The local knowledge layer teaches users even without cloud AI. A business-specific AI provider can be enabled through protected configuration. The advisor reviews permitted usage events and business state to recommend settings, quick actions, workflow changes, integration fixes and missing buttons. Only bounded owner-approved quick actions can be applied automatically.

Voice can navigate, read work, capture measurements, internal messages and notes. Sending, approval, publication, payments, purchasing, deletion, permissions and deployment are high-risk and go to Review When Parked.

## Provider boundary

Email, SMS, social and AI providers are business-specific. No provider credentials or accounts are copied from Highway 38 into another business. The platform is operational with drafts and manual proof before provider connection. Live provider actions require separate credentials, authorization, testing, consent and owner release.

## H38 load gate

Do not load Highway 38 production records until:

1. the completed Commercial Office deployment is verified;
2. Android online/offline/reconnect acceptance passes;
3. users and role isolation pass;
4. quote, measurement, attachment and sync conflict acceptance pass;
5. Social Control approval and manual proof pass;
6. production migration remains disabled until a separate H38 mapping, backup, dry run and owner approval exist.

No new Apps Script project, permanent deployment, tenant or workbook is required for this baseline.
