#!/usr/bin/env node
'use strict';
/* Gap9 contract: Queue Board — a read-only view option inside the
 * existing Jobs/Quotes pages. Four queues derived from real stored
 * statuses; cards open the existing full records through the existing
 * openers; no writes, no status changes, no drag, no new route/module,
 * no startup work. */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const failures = [];
const check = (name, cond) => { if (!cond) failures.push(name); };

const STAMP = '20261107-polish-a4-settings-1';
const js = read('commercial-app/queue-board.js');
const css = read('commercial-app/queue-board.css');
const index = read('commercial-app/index.html');
const version = read('commercial-app/version.json');

/* Wiring + stamp */
check('queue-board.js carries the gap9 build stamp', js.includes("BUILD = '" + STAMP + "'"));
check('index loads queue-board.js with the stamp', index.includes('./queue-board.js?build=' + STAMP));
check('index loads queue-board.css with the stamp', index.includes('./queue-board.css?build=' + STAMP));
check('version.json at gap9 stamp', version.includes('"version": "20261107-polish-a4-settings-1"')); // stamp pin moved by gap10 (version.json only; gap9 build stamps above unchanged)

/* Queue definitions: the exact published status mappings */
check('queue 1 quotes-waiting sent/presented (normalized)', js.includes("key: 'quotes-waiting'") && js.includes("statuses: ['sent', 'presented']"));
check('queue 2 booked approved/scheduled (normalized)', js.includes("key: 'booked'") && js.includes("statuses: ['approved', 'scheduled']"));
check('queue 3 in-progress', js.includes("key: 'in-progress'") && js.includes("statuses: ['in progress']"));
check('queue 4 waiting-payment needs a balance', js.includes("key: 'waiting-payment'") && js.includes("statuses: ['sent', 'open', 'partially paid']") && js.includes('needsBalance: true'));
check('exactly four queues', (js.match(/key: '(quotes-waiting|booked|in-progress|waiting-payment)'/g) || []).length === 4);
check('soft-deleted rows excluded', js.includes('isGone') && js.includes('/DELET|VOID|CANCEL/'));
check('cards bounded at 50 per queue', js.includes('MAX_CARDS = 50') && js.includes('slice(0, MAX_CARDS)'));

/* Read-only: no write/save/queue paths, no drag */
['queueRecord', 'queueOperation', 'saveEntity', 'fetch(', 'XMLHttpRequest', 'draggable', 'dataTransfer', 'POST'].forEach(token =>
  check('no write/drag token: ' + token, !js.includes(token)));
check('board declares readOnly + drag disabled', js.includes('readOnly: true') && js.includes('dragEnabled: false'));

/* Snapshot-only data: no new startup/server work */
check('reads through records() only', js.includes("window.records") && js.includes('function rows(name)') && js.includes('rows(q.collection)'));
check('hooks the shared page-rendered event', js.includes('h38:office-page-rendered'));
check('re-renders on snapshot update while open', js.includes('h38:business-snapshot-updated'));
check('restores the open board after foreign repaints', js.includes('restoreIfNeeded') && js.includes('h38:sync-pass-complete') && js.includes('setInterval(restoreIfNeeded, 2500)'));
check('board escapes the workbench page grid while open', js.includes('WB_GRID_CLASSES') && js.includes("'h38-wb-grid-work'") && js.includes('classList.remove'));

/* Placement: a view switch on the existing work/quotes pages only */
check('host pages are work + quotes', js.includes("HOST_PAGES = { work: 1, quotes: 1 }"));
check('view switch offers List view + Queue board', js.includes('List view') && js.includes('Queue board'));
check('no new page def or nav entry', !js.includes('PAGE_DEFS') && !js.includes('data-page'));

/* Cards open the EXISTING full records via the existing openers */
check('job cards use the lifecycle focusJob path', js.includes('H38_JOB_LIFECYCLE') && js.includes('focusJob'));
check('quote cards use window.openQuote', js.includes('window.openQuote'));
check('invoice cards use the workbench selectInvoice path', js.includes('H38_WORKBENCH') && js.includes('selectInvoice'));
check('card shows customer, title, meta, amount', js.includes('h38-qb-card-cust') && js.includes('h38-qb-card-title') && js.includes('h38-qb-card-amt'));

/* Phone: queues stack to one column */
check('css stacks queues on small screens', css.includes('@media (max-width: 640px)') && css.includes('grid-template-columns: minmax(0, 1fr)'));
check('css is scoped to h38-qb classes', !/^\s*(body|main|\.card)\b/m.test(css));
check('board view class hides sibling panels while open', js.includes("classList.add('h38-qb-active')") && css.includes('#mainContent.h38-qb-active > :not(.h38-qb-switch):not(.h38-qb-board)'));

/* Public handle for verification */
check('exposes H38_QUEUE_BOARD with counts + queue defs', js.includes('window.H38_QUEUE_BOARD') && js.includes('counts: counts'));

if (failures.length) {
  console.error('verify-queue-board FAILED:\n - ' + failures.join('\n - '));
  process.exit(1);
}
console.log('verify-queue-board: PASS (gap9 queue board contract, stamp ' + STAMP + ')');
