# Highway 38 Public Helper

Date: 2026-07-29

## Purpose

Add a controlled website assistant that helps visitors:

- choose between business software and project services;
- compare Quote Builder, Business Office, and Custom Business System;
- understand approved pricing, setup, and implementation;
- find public examples and the browser-only quote demonstration;
- understand security and owner-control boundaries;
- start the correct request path.

## Public behavior

The helper is mounted by the canonical public site shell and appears as **Ask the H38 Helper** on public Highway 38 pages.

It accepts short natural-language questions and provides approved answers and links. It also provides quick-start prompts for product fit, implementation, project help, and examples.

## Data and action boundaries

The first release is intentionally controlled:

- approved Highway 38 website information only;
- no OpenAI or other model endpoint;
- no API key in the browser;
- no network request from the helper;
- no local, session, or indexed storage;
- no private Business Office, customer, quote, job, document, user, or financial data;
- no account creation;
- no quote creation or binding estimate;
- no email, SMS, scheduling, approval, purchasing, payment, payroll, tax, publishing, or deployment action;
- no promise of an integration or business outcome.

Visitors are warned not to enter private customer information. Nothing typed into the helper is submitted to Highway 38.

## Approved commercial information

The helper reflects the current approved public structure:

- Quote Builder — $59/month; self-setup included; assisted setup $499 one time.
- Highway 38 Business Office — $249/month; implementation $2,500.
- Custom Business System — starting at $499/month; implementation starting at $7,500.
- Business Snapshot — $299 one time.
- Smart Contact Website — $1,995 setup plus $99/month.
- H38 AI is included in the product structure rather than charged as a separate premium.

## Verification

`scripts/verify-public-helper.js` enforces:

- JavaScript syntax;
- canonical shell loading;
- approved information and destinations;
- pricing and human-approval wording;
- absence of network, browser-storage, private-app, and model calls;
- safe `textContent` rendering of visitor input;
- keyboard and accessibility controls;
- desktop and mobile styles;
- live GitHub Pages delivery of both helper assets.

The verifier runs in Final Polish Acceptance and after GitHub Pages deployment.
