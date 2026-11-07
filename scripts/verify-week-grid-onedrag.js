/* One-drag scheduling (gap5) — contract verifier.
 * Pins the invariants of the change on the canonical week grid
 * (commercial-app/week-grid.js, the desktop Schedule surface):
 *  - the assignee read model is the dispatch board's union model:
 *    effective assignee = 'Assigned User ID', falling back to the
 *    first 'Assigned User IDs' entry (assigneeOf), used for BOTH the
 *    column list and the per-day chip placement — an array-only
 *    event can no longer be misfiled as Unassigned;
 *  - one drop is one write: moveEvent issues exactly one
 *    SAVE_SCHEDULE queueOperation whose optimistic record carries
 *    BOTH the new Start Time AND the new assignee in the same record;
 *  - the write mirrors the array when the record carries one
 *    ('Assigned User IDs' = [target] or []), matching the
 *    field-operations-ui moveEvent precedent, so no other view can
 *    keep reading the old assignee;
 *  - the SAVE_SCHEDULE payload uses the canonical camelCase fields
 *    (assignedUserId / startTime / endTime), like every other
 *    SAVE_SCHEDULE writer;
 *  - a no-op drop (same day + same assignee) writes nothing, and a
 *    single-flight guard keeps a re-entrant drop from duplicating
 *    the write;
 *  - a cancelled/Escaped drag writes nothing: dragend only clears
 *    drag state;
 *  - loader pin for week-grid matches the version.json stamp
 *    (checked dynamically — no hard-coded stamp to go stale). */
const fs = require('fs');
const grid = fs.readFileSync('commercial-app/week-grid.js', 'utf8');
const loader = fs.readFileSync('commercial-app/h38-script-loader.js', 'utf8');
const version = JSON.parse(fs.readFileSync('commercial-app/version.json', 'utf8'));
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

// Union assignee read model exists and is used for columns + placement.
check(grid.includes('function assigneeOf(ev)'), 'week-grid must define assigneeOf (union assignee read model)');
check(grid.includes("var single=text(v(ev,'Assigned User ID'));"), 'assigneeOf must read the canonical singular field first');
check(grid.includes("var arr=v(ev,'Assigned User IDs');"), 'assigneeOf must fall back to the Assigned User IDs array');
check(grid.includes('var a=assigneeOf(x.ev);'), 'columns() must derive extra columns from assigneeOf');
check(grid.includes('assigneeOf(x.ev)===col.id'), 'chip placement must filter by assigneeOf');

// One drop = one SAVE_SCHEDULE write carrying both fields together.
const moveStart = grid.indexOf('async function moveEvent');
const moveEnd = grid.indexOf('function bindGrid');
const move = moveStart >= 0 && moveEnd > moveStart ? grid.slice(moveStart, moveEnd) : '';
check(!!move, 'moveEvent must exist in week-grid.js');
check((move.match(/queueOperation\(/g) || []).length === 1, 'moveEvent must issue exactly one queueOperation (one drop = one write)');
check(move.includes("'SAVE_SCHEDULE'"), 'moveEvent must save through SAVE_SCHEDULE');
check(move.includes("updated['Start Time']=newStart.toISOString();"), 'the one written record must carry the new Start Time');
check(move.includes("updated['Assigned User ID']=targetUser;"), 'the one written record must carry the new assignee');
check(move.includes("updated['Assigned User IDs']=targetUser?[targetUser]:[];"), 'the write must mirror the Assigned User IDs array when present');
check(move.includes("Object.prototype.hasOwnProperty.call(ev,'Assigned User IDs')"), 'array mirroring must be conditional on the record carrying the array (field-ops precedent)');
check(move.includes('assignedUserId:targetUser') && move.includes("startTime:updated['Start Time']") && move.includes("endTime:updated['End Time']"),
  'SAVE_SCHEDULE payload must use the canonical camelCase fields');

// No orphan/duplicate writes: no-op guard + single-flight guard.
check(move.includes('if(sameDay(newStart,start)&&assigneeOf(ev)===targetUser)'), 'moveEvent must no-op when day and assignee are unchanged');
check(move.includes("toast('Already there — nothing changed.');"), 'no-op drop must tell the user nothing changed');
check(grid.includes('var moveInFlight={};') && move.includes('if(moveInFlight[eventId])return;'), 'moveEvent must keep a single-flight guard against duplicate drops');

// Cancelled drag writes nothing: dragend only clears state.
check(grid.includes("chip.addEventListener('dragend',function(){") && grid.includes("dragEventId='';"),
  'dragend must clear the drag id (cancelled/Escaped drags write nothing)');
check(grid.includes("chip.classList.add('dragging')") && grid.includes('.h38-wg-chip.dragging{opacity:.45}'),
  'the dragged chip must show dragging feedback');

// Wiring: week-grid loader pin matches the live version stamp.
check(loader.includes("'./week-grid.js?build=" + version.version + "'"),
  'loader pin for week-grid.js must match the version.json stamp');
check(grid.includes("var BUILD='" + version.version + "';"), 'week-grid BUILD must match the version.json stamp');

if (failures.length) { console.error(failures.map(x => 'FAIL: ' + x).join('\n')); process.exit(1); }
console.log('Week-grid one-drag contract verified.');
