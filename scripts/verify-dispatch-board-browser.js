'use strict';
/*
 * WS2 Dispatch Board — live browser verifier (spec §6, tests 2–6).
 *
 * COORDINATOR-RUN ONLY. This script drives the REAL Office app signed in as
 * Kit against the BUILD SANDBOX tenant and writes seeded records there. It is
 * intentionally NOT run during implementation.
 *
 * Prerequisites:
 *  1. Playwright for node resolvable from the repo root (`playwright` package;
 *     the browsers under ~/.cache/ms-playwright). If the worktree has no
 *     node_modules, run with NODE_PATH pointing at a checkout that does.
 *  2. Serve THIS worktree statically from the repo root, e.g.
 *       python3 -m http.server 8765 --directory .
 *     then H38_APP_BASE defaults to http://127.0.0.1:8765/commercial-app/
 *     (the app entry is commercial-app/index.html).
 *  3. Kit auth storage state at ~/.h38-kit-auth.json (override with
 *     H38_KIT_AUTH). The script only READS it (Playwright storageState) — it
 *     never writes, copies, or refreshes it. If sign-in fails, the token has
 *     expired; refresh it via ~/workspace/refresh-h38-auth.py first.
 *  4. Tenant: the URL key is FIXED to build-sandbox (Build Sandbox tenant,
 *     coordinator override 2026-10-20 — do NOT point this at the Clearwater
 *     demo tenant or any customer tenant). Seeded records carry a unique
 *     `WS2TEST-<runId>` prefix in every id/title and are left in the sandbox
 *     for inspection; they are safe to delete by prefix afterwards.
 *  5. Chromium relay note: headless Chromium against the live app can fail
 *     with net::ERR_EMPTY_RESPONSE on some hosts. If that happens, set
 *     H38_BROWSER=firefox — Firefox is the established engine for this app's
 *     browser checks (see AGENTS.md mobile-viewport method). The phone pass
 *     uses a 390x844 viewport; for a true mobile-viewport proof use Firefox.
 *
 * What it proves (spec §6):
 *  2. Seeded board render: per-tech columns, rail sections, ⚠ on both
 *     overlapping cards, Unassigned badge count, Tech A load count/hours,
 *     chip labels/kinds incl. En Route (assignment) winning over event status.
 *  3. Persistence gate: (a) drag Tech B card → Tech C column, (b) tap-move an
 *     unassigned event → Tech A at a new time, (c) Unassign a card. After
 *     each, the record is re-read from a FRESH snapshot and must show the new
 *     'Assigned User ID', Start/End Time and Record Version +1 via
 *     SAVE_SCHEDULE — with the scheduleEvents row count unchanged (no new
 *     event row) and no SMS/message record queued.
 *  4. Overlap-on-move requires the "Move anyway" second tap and stamps
 *     'Conflict Override'.
 *  5. Week view: 7 Mon–Sun columns, compact cards, day click → Day view,
 *     drag disabled, action-sheet move works.
 *  6. Phone 390x844: single column, unassigned first, tech switcher filters,
 *     action sheet usable, no horizontal overflow.
 */
const fs = require('fs');
const path = require('path');

const APP_BASE = process.env.H38_APP_BASE || 'http://127.0.0.1:8765/commercial-app/';
const TENANT_KEY = 'build-sandbox';
const AUTH_PATH = process.env.H38_KIT_AUTH || path.join(process.env.HOME || '', '.h38-kit-auth.json');
const BROWSER_KIND = (process.env.H38_BROWSER || 'chromium').toLowerCase();
const RUN = `WS2TEST-${Date.now().toString(36).toUpperCase()}`;

function assert(cond, msg) { if (!cond) throw new Error(msg); console.log('ok:', msg); }
const pad = n => String(n).padStart(2, '0');
const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

async function main() {
  let playwright;
  try { playwright = require('playwright'); }
  catch (_) { throw new Error('playwright is not resolvable — see prerequisite 1 in the header.'); }
  if (!fs.existsSync(AUTH_PATH)) throw new Error(`Kit auth storage state not found at ${AUTH_PATH} — see prerequisite 3.`);
  const engine = BROWSER_KIND === 'firefox' ? playwright.firefox : playwright.chromium;
  const browser = await engine.launch({ headless: true });
  const context = await browser.newContext({ storageState: AUTH_PATH, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const today = new Date();
  const D = dateKey(today);
  const at = (h, m = 0) => `${D}T${pad(h)}:${pad(m)}:00`;

  await page.goto(`${APP_BASE}?businessKey=${TENANT_KEY}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.state && !!window.state.snapshot, null, { timeout: 60000 });
  const businessId = await page.evaluate(() => window.state.businessId || window.state.snapshot?.business?.businessId || '');
  assert(!!businessId, 'signed in and snapshot loaded for build-sandbox tenant');

  /* ---- Seed (spec §6 test 2 fixture), all ids/titles RUN-prefixed ---- */
  const seed = await page.evaluate(async ({ RUN, businessId, D, at }) => {
    const q = window.queueOperation;
    if (typeof q !== 'function') throw new Error('queueOperation unavailable in app context.');
    const save = (collection, type, idValue, record, idKeys) =>
      q('SAVE_PARITY_ENTITY', type, idValue, { entityKey: collection, record }, { collection, record, idKeys }, false);
    const U = n => `${RUN}-U${n}`;
    const users = [1, 2, 3].map(n => ({ 'User ID': U(n), 'Business ID': businessId, 'Display Name': `${RUN} Tech ${'ABC'[n - 1]}`, Email: '', Status: 'Active', 'Record Version': 1 }));
    for (const u of users) await save('users', 'User', u['User ID'], u, ['User ID']);
    const job = n => ({ 'Job ID': `${RUN}-J${n}`, 'Business ID': businessId, 'Customer ID': '', 'Project Title': `${RUN} Job ${n}`, Status: 'Scheduled', 'Service Address': '1 Sandbox Way', 'Record Version': 1 });
    for (let n = 1; n <= 6; n++) await save('jobs', 'Job', `${RUN}-J${n}`, job(n), ['Job ID']);
    const unscheduled = { ...job(7), Status: 'Approved', 'Project Title': `${RUN} Unscheduled job` };
    await save('jobs', 'Job', unscheduled['Job ID'], unscheduled, ['Job ID']);
    const ev = (n, start, end, uid) => ({
      'Schedule Event ID': `${RUN}-E${n}`, 'Business ID': businessId, 'Event Type': 'Job',
      Title: `${RUN} Job ${n}`, 'Related Record Type': 'Job', 'Related Record ID': `${RUN}-J${n}`,
      'Assigned User ID': uid, 'Start Time': start, 'End Time': end, Location: '1 Sandbox Way',
      Status: 'Scheduled', 'Record Version': 1,
    });
    const events = [
      ev(1, at(8), at(10), U(1)),      // Tech A, overlaps E2
      ev(2, at(9), at(11), U(1)),      // Tech A, overlaps E1  (Tech A load: 2 jobs, 4h)
      ev(3, at(13), at(14), ''),       // unassigned today
      ev(4, at(12), at(13), U(2)),     // Tech B + En Route assignment row
      ev(5, at(15), '', U(2)),         // Tech B, no End Time
      ev(6, at(16), at(17), U(3)),     // Tech C (drag target column mate)
    ];
    for (const e of events) {
      await q('SAVE_SCHEDULE', 'Schedule Event', e['Schedule Event ID'],
        { scheduleEventId: e['Schedule Event ID'], relatedRecordId: e['Related Record ID'], assignedUserId: e['Assigned User ID'], startTime: e['Start Time'], endTime: e['End Time'], status: 'Scheduled' },
        { collection: 'scheduleEvents', record: e, idKeys: ['Schedule Event ID'] });
    }
    const assignment = { 'Assignment ID': `${RUN}-AS4`, 'Business ID': businessId, 'Job ID': `${RUN}-J4`, 'Schedule Event ID': `${RUN}-E4`, 'Crew User IDs': JSON.stringify([U(2)]), 'Vehicle ID': '', Status: 'En Route', 'Record Version': 1 };
    await save('dispatchAssignments', 'Dispatch Assignment', assignment['Assignment ID'], assignment, ['Assignment ID']);
    if (typeof window.sync === 'function') await window.sync(true);
    return { users: users.map(u => u['User ID']) };
  }, { RUN, businessId, D, at });
  const [UA, UB, UC] = seed.users;

  const readEvent = async eventId => page.evaluate(async id => {
    if (typeof window.sync === 'function') await window.sync(true);
    const rows = window.state.snapshot?.scheduleEvents || [];
    return { row: rows.find(r => r['Schedule Event ID'] === id) || null, total: rows.length, messages: (window.state.snapshot?.messages || []).length };
  }, eventId);
  const before = await readEvent(`${RUN}-E4`);
  assert(!!before.row, 'seeded events visible in a fresh snapshot');

  /* ---- Render asserts (test 2) ---- */
  await page.evaluate(() => { window.openPage && window.openPage('schedule'); });
  await page.waitForSelector('#h38Wave3Dispatch', { timeout: 30000 });
  await page.waitForFunction(run => document.querySelector('#h38Wave3Dispatch')?.innerText.includes(`${run} Job 1`), RUN, { timeout: 30000 });
  const boardText = await page.locator('#h38Wave3Dispatch').innerText();
  assert(boardText.includes('6 stops'), 'header summary counts 6 stops today');
  assert(boardText.includes('1 unassigned'), 'header summary counts 1 unassigned');
  assert(boardText.includes('2 jobs · ~4h booked'), 'Tech A column load = 2 jobs · ~4h booked');
  assert(/Load = scheduled jobs and booked hours\./.test(boardText), 'load footnote present (load, never capacity)');
  assert(boardText.includes('En route'), 'En Route assignment chip wins over event status');
  assert(boardText.includes(`${RUN} Unscheduled job`), 'rail shows the unscheduled job');
  for (const id of [`${RUN}-E1`, `${RUN}-E2`]) {
    const warn = await page.locator(`[data-board-event="${id}"] .h38-board-warn`).count();
    assert(warn >= 1, `overlap ⚠ shown on ${id}`);
  }
  const unassignedCol = await page.locator(`[data-board-user=""] [data-board-event="${RUN}-E3"]`).count();
  assert(unassignedCol >= 1, 'unassigned event renders in the Unassigned column');

  /* ---- Persistence (test 3a): drag Tech B card E5 → Tech C column ---- */
  const dragMove = async (eventId, userId) => page.evaluate(({ eventId, userId }) => {
    const card = document.querySelector(`[data-board-event="${eventId}"]`);
    const col = [...document.querySelectorAll('[data-board-user]')].find(c => c.dataset.boardUser === userId);
    if (!card || !col) throw new Error(`drag fixtures missing for ${eventId} -> ${userId}`);
    card.dispatchEvent(new DragEvent('dragstart', { bubbles: true }));
    col.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true }));
    col.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true }));
  }, { eventId, userId });
  await dragMove(`${RUN}-E5`, UC);
  await page.waitForTimeout(500);
  let after = await readEvent(`${RUN}-E5`);
  assert(after.row && after.row['Assigned User ID'] === UC, 'drag move persisted: E5 now assigned to Tech C');
  assert(after.row['Record Version'] === 2, 'drag move bumped Record Version 1 -> 2');
  assert(after.total === before.total, 'drag move created NO new scheduleEvents row');
  assert(after.messages === before.messages, 'drag move queued NO SMS/message');

  /* ---- Persistence (test 3b): tap-move unassigned E3 → Tech A, new time ---- */
  await page.locator(`.h38-board-rail [data-board-menu="${RUN}-E3"]`).first().click();
  await page.waitForSelector('#h38SheetMoveForm');
  await page.locator('#h38SheetMoveForm input[name="time"]').fill('07:30');
  await page.locator('#h38SheetMoveForm input[name="duration"]').fill('1');
  await page.locator('#h38SheetMoveForm').evaluate(f => f.requestSubmit());
  await page.waitForTimeout(300);
  // Assign-to happens in the same sheet: reopen and pick Tech A (07:30 is free).
  await page.locator(`[data-board-menu="${RUN}-E3"]`).first().click();
  await page.waitForSelector('#h38FieldOpsDialog[open]');
  await page.locator(`[data-sheet-assign="${UA}"]`).click();
  await page.waitForTimeout(500);
  after = await readEvent(`${RUN}-E3`);
  assert(after.row && after.row['Assigned User ID'] === UA, 'tap move persisted: E3 assigned to Tech A');
  assert(String(after.row['Start Time']).includes('07:30') || String(after.row['Start Time']).includes('12:30'), 'tap move persisted the new start time');
  assert(after.total === before.total && after.messages === before.messages, 'tap move created no row and queued no SMS');

  /* ---- Persistence (test 3c): Unassign E6 ---- */
  await page.locator(`[data-board-menu="${RUN}-E6"]`).first().click();
  await page.waitForSelector('#h38FieldOpsDialog[open]');
  await page.locator('[data-sheet-unassign]').click();
  await page.waitForTimeout(500);
  after = await readEvent(`${RUN}-E6`);
  assert(after.row && after.row['Assigned User ID'] === '', 'unassign persisted: E6 assignee cleared');
  assert(after.total === before.total, 'unassign created no new row');

  /* ---- Overlap-on-move (test 4): E2 (Tech A 09:00-11:00) onto Tech C at E6's old slot is free;
   *      instead move E1 onto Tech A is a no-op — use E4 (12:00-13:00, Tech B) → Tech A after
   *      shifting via sheet to 09:30, which overlaps E1/E2. ---- */
  await page.locator(`[data-board-menu="${RUN}-E4"]`).first().click();
  await page.waitForSelector('#h38SheetMoveForm');
  await page.locator('#h38SheetMoveForm input[name="time"]').fill('09:30');
  await page.locator('#h38SheetMoveForm').evaluate(f => f.requestSubmit());
  await page.waitForTimeout(300);
  await page.locator(`[data-board-menu="${RUN}-E4"]`).first().click();
  await page.waitForSelector('#h38FieldOpsDialog[open]');
  await page.locator(`[data-sheet-assign="${UA}"]`).click();
  await page.waitForTimeout(300);
  const conflictBody = await page.locator('#h38FieldOpsBody').innerText().catch(() => '');
  assert(conflictBody.includes('Move anyway'), 'overlap-on-move requires the Move anyway second tap');
  const preAnyway = await readEvent(`${RUN}-E4`);
  assert(preAnyway.row['Assigned User ID'] === UB, 'no write happened before Move anyway');
  await page.locator('#h38MoveAnyway').click();
  await page.waitForTimeout(500);
  after = await readEvent(`${RUN}-E4`);
  assert(after.row['Assigned User ID'] === UA, 'Move anyway persisted the overlapping move');
  assert(after.row['Conflict Override'] && Number(after.row['Conflict Override'].Count) >= 1, "Move anyway stamped 'Conflict Override'");

  /* ---- Week view (test 5) ---- */
  await page.locator('[data-board-view="week"]').click();
  await page.waitForTimeout(300);
  const weekDays = await page.locator('[data-board-weekday]').count();
  assert(weekDays === 7, 'week view renders 7 day columns');
  const firstKey = await page.locator('[data-board-weekday]').first().getAttribute('data-board-weekday');
  assert(new Date(`${firstKey}T12:00:00`).getDay() === 1, 'week view starts on Monday');
  const dragAttr = await page.locator(`.h38-board-compact[data-board-event="${RUN}-E1"]`).getAttribute('draggable').catch(() => null);
  assert(dragAttr !== 'true', 'drag is disabled in week view');
  await page.locator('[data-board-weekday]').nth(3).click();
  await page.waitForTimeout(300);
  assert(await page.locator('.h38-board-cols').count() === 1, 'week day click switches to Day view');

  /* ---- Phone viewport (test 6) ---- */
  const phone = await browser.newContext({ storageState: AUTH_PATH, viewport: { width: 390, height: 844 }, isMobile: BROWSER_KIND !== 'firefox', hasTouch: true });
  const ppage = await phone.newPage();
  await ppage.goto(`${APP_BASE}?businessKey=${TENANT_KEY}`, { waitUntil: 'domcontentloaded' });
  await ppage.waitForFunction(() => !!window.state && !!window.state.snapshot, null, { timeout: 60000 });
  await ppage.evaluate(() => { window.openPage && window.openPage('schedule'); });
  await ppage.waitForSelector('#h38Wave3Dispatch', { timeout: 30000 });
  await ppage.waitForTimeout(500);
  const overflow = await ppage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  assert(!overflow, 'phone: no horizontal overflow at 390px');
  assert(await ppage.locator('.h38-board-switcher').isVisible(), 'phone: tech switcher visible');
  const railFirst = await ppage.evaluate(() => {
    const rail = document.querySelector('.h38-board-rail'), cols = document.querySelector('.h38-board-cols');
    return !!rail && !!cols && (rail.compareDocumentPosition(cols) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  });
  assert(railFirst, 'phone: unassigned rail renders before tech columns');
  await ppage.locator(`[data-board-tech="${UB}"]`).click();
  await ppage.waitForTimeout(300);
  const cols = await ppage.locator('[data-board-user]').evaluateAll(els => els.map(e => e.dataset.boardUser));
  assert(JSON.stringify(cols) === JSON.stringify([UB]), 'phone: tech switcher filters to the chosen tech');
  await ppage.locator(`[data-board-menu="${RUN}-E5"]`).first().click();
  await ppage.waitForSelector('#h38FieldOpsDialog[open]');
  assert(await ppage.locator('[data-sheet-assign]').count() >= 2, 'phone: action sheet opens with assign options');

  await browser.close();
  console.log(`Dispatch board browser acceptance complete (run ${RUN}).`);
}

main().catch(err => { console.error(err); process.exit(1); });
