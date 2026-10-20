// The weight log logic. Runs in Europe/London so the date rules are tested the way the phone sees them.
process.env.TZ = 'Europe/London';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as L from '../log.js';
import * as OLD from './fixtures/log-before-bodyweight.mjs'; // the rule older copies of the app apply to the main key

const data = JSON.parse(await readFile(new URL('../data/exercises.json', import.meta.url), 'utf8'));
const trainerDays = data.plans[0].days; // the personal trainer's plan, the default
const allNames = [...new Set(data.plans.flatMap((p) => p.days.flatMap((d) => d.exercises.map((e) => e.name))))];
const TARGETS = [12, 10, 10, 8];
const KEY = 'incline-chest-press-machine.machine';
const fakeStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, map: m };
};
const session = (date, sets) => ({ date, sets: sets.map((s) => (s ? { w: s[0], r: s[1] } : null)) });

test('every exercise name in every plan gives a unique log key that the validator accepts', () => {
  const names = allNames; // one name in two plans is one movement with one history (tests/data.test.mjs checks that)
  const keys = names.map((n) => L.entryKey(n, 'machine'));
  assert.equal(new Set(keys).size, names.length);
  const log = { v: 1, entries: Object.fromEntries(keys.map((k) => [k, [session('2026-07-15', [[20, 12]])]])) };
  assert.equal(L.validateLog(log).ok, true);
  assert.equal(L.entryKey('Overhead Dumbbell Tricep Extension', 'dumbbell'), 'overhead-dumbbell-tricep-extension.dumbbell');
});

test('dates use the London calendar day, not UTC, during British Summer Time', () => {
  const half12 = new Date('2026-07-15T23:30:00Z'); // 00:30 BST on 16 July
  assert.equal(L.localDate(half12), '2026-07-16');
  assert.notEqual(half12.toISOString().slice(0, 10), '2026-07-16'); // the trap localDate avoids
  assert.equal(L.sessionDay(half12), '2026-07-15'); // still the evening session
  assert.equal(L.sessionDay(new Date('2026-07-16T03:00:00Z')), '2026-07-16'); // 04:00 BST starts a new day
  assert.equal(L.sessionDay(new Date('2026-07-16T02:59:00Z')), '2026-07-15');
});

test('the 4 am session boundary holds on the night the clocks go back', () => {
  assert.equal(L.sessionDay(new Date(2026, 9, 25, 3, 30)), '2026-10-24');
  assert.equal(L.sessionDay(new Date(2026, 9, 25, 4, 0)), '2026-10-25');
  assert.equal(L.formatDay('2026-10-05'), 'Mon 5 Oct');
});

test('weights parse with a comma or a dot and snap to quarter kilos', () => {
  assert.equal(L.parseWeight('32,5'), 32.5);
  assert.equal(L.parseWeight(' 20 '), 20);
  assert.equal(L.parseWeight('32.3'), 32.25);
  for (const bad of ['', 'abc', '0', '-5', '501', '1e3', '12kg', null]) assert.equal(L.parseWeight(bad), null, String(bad));
  assert.equal(L.formatWeight(32.5), '32.5');
  assert.equal(L.formatWeight(30), '30');
  assert.equal(L.stepFor('dumbbell'), 2);
  assert.equal(L.stepFor('machine'), 2.5);
});

test('saving and clearing sets keeps sessions sorted and drops empty ones', () => {
  let log = L.emptyLog();
  log = L.setSlot(log, KEY, '2026-07-16', 1, { w: 32.5, r: 10 }, 4);
  log = L.setSlot(log, KEY, '2026-07-09', 0, { w: 30, r: 12 }, 4);
  assert.deepEqual(L.entriesFor(log, KEY).map((e) => e.date), ['2026-07-09', '2026-07-16']);
  assert.deepEqual(L.todayEntry(log, KEY, '2026-07-16').sets, [null, { w: 32.5, r: 10 }, null, null]);
  log = L.setSlot(log, KEY, '2026-07-16', 1, null, 4);
  assert.equal(L.todayEntry(log, KEY, '2026-07-16'), null);
  log = L.setSlot(log, KEY, '2026-07-09', 0, null, 4);
  assert.equal(log.entries[KEY], undefined);
  assert.equal(L.countSessions(log), 0);
});

test('no history means no suggestions', () => {
  const g = L.guide(L.emptyLog(), KEY, '2026-07-16', TARGETS, 2.5);
  assert.equal(g.last, null);
  assert.equal(g.allHit, false);
  assert.deepEqual(g.suggestions, [null, null, null, null]);
});

test('hitting every rep on every set nudges every set up one step', () => {
  const log = { v: 1, entries: { [KEY]: [session('2026-07-09', [[30, 12], [32.5, 10], [32.5, 10], [35, 8]])] } };
  const g = L.guide(log, KEY, '2026-07-16', TARGETS, 2.5);
  assert.equal(g.allHit, true);
  assert.deepEqual(g.suggestions.map((s) => s.w), [32.5, 35, 35, 37.5]);
  assert.ok(g.suggestions.every((s) => s.up));
});

test('missing one rep keeps the same weights', () => {
  const log = { v: 1, entries: { [KEY]: [session('2026-07-09', [[30, 12], [32.5, 9], [32.5, 10], [35, 8]])] } };
  const g = L.guide(log, KEY, '2026-07-16', TARGETS, 2.5);
  assert.equal(g.allHit, false);
  assert.deepEqual(g.suggestions.map((s) => s.w), [30, 32.5, 32.5, 35]);
  assert.ok(g.suggestions.every((s) => !s.up));
});

test('a partly logged last session never nudges up, and each set falls back to its own newest weight', () => {
  const log = { v: 1, entries: { [KEY]: [
    session('2026-07-02', [[27.5, 12], [30, 10], [30, 10], [32.5, 8]]),
    session('2026-07-09', [[30, 12], [32.5, 10], null, null]),
  ] } };
  const g = L.guide(log, KEY, '2026-07-16', TARGETS, 2.5);
  assert.equal(g.last.date, '2026-07-09');
  assert.equal(g.allHit, false);
  assert.deepEqual(g.suggestions.map((s) => s.w), [30, 32.5, 30, 32.5]);
});

test("today's own sets are this session, never last time", () => {
  const log = { v: 1, entries: { [KEY]: [
    session('2026-07-09', [[30, 12], [32.5, 10], [32.5, 10], [35, 8]]),
    session('2026-07-16', [[50, 12], null, null, null]),
  ] } };
  const g = L.guide(log, KEY, '2026-07-16', TARGETS, 2.5);
  assert.equal(g.last.date, '2026-07-09');
  assert.equal(g.suggestions[0].w, 32.5);
});

test('the sheet opens on today, then the suggestion, then the nearest set logged today', () => {
  const log = { v: 1, entries: { [KEY]: [session('2026-07-16', [[40, 12], null, null, [45, 8]])] } };
  const none = [null, null, null, null];
  assert.equal(L.prefill(log, KEY, '2026-07-16', 0, none), 40);
  assert.equal(L.prefill(log, KEY, '2026-07-16', 1, none), 40);
  assert.equal(L.prefill(log, KEY, '2026-07-16', 2, none), 45);
  assert.equal(L.prefill(log, KEY, '2026-07-16', 1, [null, { w: 42.5, up: true }, null, null]), 42.5);
  assert.equal(L.prefill(L.emptyLog(), KEY, '2026-07-16', 0, none), null);
});

test('a backup must come from this app and pass every check', () => {
  const good = L.exportPayload({ v: 1, entries: { [KEY]: [session('2026-07-09', [[30, 12], null, null, null])] } }, new Date('2026-07-16T10:00:00Z'));
  assert.equal(L.validateBackup(good).ok, true);
  assert.equal(L.validateBackup({ ...good, app: 'other' }).ok, false);
  assert.equal(L.validateBackup({ ...good, v: 2 }).ok, false);
  assert.equal(L.validateBackup(null).ok, false);
  const bad = (entries) => L.validateBackup({ app: L.APP_MARK, v: 1, entries }).ok;
  assert.equal(bad({ 'Bad Key': [] }), false);
  assert.equal(bad({ [KEY]: [{ date: '2026-02-30', sets: [null] }] }), false);
  assert.equal(bad({ [KEY]: [{ date: '2026-07-09', sets: [{ w: 0, r: 12 }] }] }), false);
  assert.equal(bad({ [KEY]: [{ date: '2026-07-09', sets: [{ w: 0.1, r: 12 }] }] }), false); // rounds to 0 kg
  assert.equal(bad({ [KEY]: [{ date: '2026-07-09', sets: [{ w: 30, r: 12.5 }] }] }), false);
  assert.equal(bad({ [KEY]: [{ date: '2026-07-09', sets: [] }] }), false);
  const dup = L.validateBackup({ app: L.APP_MARK, v: 1, entries: { [KEY]: [
    session('2026-07-09', [[30, 12]]), session('2026-07-02', [[25, 12]]), session('2026-07-09', [[31, 12]]),
  ] } });
  assert.deepEqual(dup.log.entries[KEY].map((e) => [e.date, e.sets[0].w]), [['2026-07-02', 25], ['2026-07-09', 31]]);
});

test('restoring a backup fills gaps but never overwrites what is on the phone', () => {
  const phone = { v: 1, entries: { [KEY]: [session('2026-07-16', [[40, 12], null, null, null])] } };
  const backup = { v: 1, entries: {
    [KEY]: [session('2026-07-09', [[30, 12], [32.5, 10], [32.5, 10], [35, 8]]), session('2026-07-16', [[99, 1], [42.5, 10], null, null])],
    'leg-press.machine': [session('2026-07-10', [[100, 12]])],
  } };
  const { log, added, filled } = L.mergeLogs(phone, backup);
  assert.deepEqual(L.todayEntry(log, KEY, '2026-07-16').sets, [{ w: 40, r: 12 }, { w: 42.5, r: 10 }, null, null]);
  assert.deepEqual(L.entriesFor(log, KEY).map((e) => e.date), ['2026-07-09', '2026-07-16']);
  assert.equal(added, 2);
  assert.equal(filled, 1); // only set 2 on 16 July: the two new days are counted by added, not again as sets
  assert.equal(L.mergeLogs(L.emptyLog(), backup).filled, 0); // an empty phone gets whole days, nothing is "filled in"
  assert.equal(L.countSessions(log), 3);
});

test('restoring sets onto days already on the phone reports how many sets it filled', () => {
  const phone = { v: 1, entries: { [KEY]: [session('2026-07-16', [[40, 12], null, null, null])] } };
  const backup = { v: 1, entries: {
    [KEY]: [session('2026-07-16', [[99, 1], [42.5, 10], [42.5, 10], [45, 8]])],
    'leg-press.machine': [session('2026-07-16', [[100, 12], null, null, null])],
  } };
  const { log, added, filled } = L.mergeLogs(phone, backup);
  assert.equal(added, 0); // no new day
  assert.equal(filled, 4); // 3 incline sets and 1 leg press set
  assert.equal(L.todayEntry(log, KEY, '2026-07-16').sets[0].w, 40); // the phone's set 1 stays
  assert.equal(L.mergeLogs(log, backup).filled, 0); // restoring the same file again adds nothing
});

test('anything the validator accepts loads back after saving', () => {
  const s = fakeStorage();
  const checked = L.validateBackup({ app: L.APP_MARK, v: 1, entries: { [KEY]: [{ date: '2026-07-09', sets: [{ w: 0.2, r: 12 }, { w: 499.9, r: 0 }] }] } });
  assert.equal(checked.ok, true);
  assert.equal(L.saveLog(s, checked.log), true);
  const back = L.loadLog(s);
  assert.equal(back.recovered, undefined);
  assert.deepEqual(back.log, checked.log);
});

test('five years of a 6 day week exports well under the import cap and restores', () => {
  const names = trainerDays.flatMap((d) => d.exercises.map((e) => e.name));
  let log = L.emptyLog();
  const start = new Date(2026, 0, 5);
  for (let day = 0; day < 7 * 52 * 5; day++) { // five years, to leave room
    if (day % 7 === 6) continue;
    const date = L.localDate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + day));
    for (const n of names.slice((day % 3) * 7, (day % 3) * 7 + 7)) {
      const key = L.entryKey(n, 'machine');
      log.entries[key] ??= [];
      log.entries[key].push(session(date, [[132.5, 12], [142.5, 10], [142.5, 10], [147.5, 8]]));
    }
  }
  const text = JSON.stringify(L.exportPayload(log));
  assert.ok(Buffer.byteLength(text) < L.MAX_IMPORT_BYTES, `export is ${Buffer.byteLength(text)} bytes`);
  assert.equal(L.validateBackup(JSON.parse(text)).ok, true);
});

test('storage: round trip, unreadable data is copied aside, blocked storage is reported', () => {
  const s = fakeStorage();
  const log = L.setSlot(L.emptyLog(), KEY, '2026-07-16', 0, { w: 40, r: 12 }, 4);
  assert.equal(L.saveLog(s, log), true);
  assert.deepEqual(L.loadLog(s).log, log);
  const broken = fakeStorage({ [L.STORE_KEY]: '{not json' });
  const r = L.loadLog(broken);
  assert.deepEqual(r.recovered, [L.STORE_KEY]);
  assert.equal(r.ok, true);
  const asides = () => [...broken.map.keys()].filter((k) => k.startsWith(`${L.STORE_KEY}.unreadable.`));
  assert.equal(asides().length, 1);
  assert.equal(broken.map.get(asides()[0]), '{not json');
  L.loadLog(broken); // loading the same bad value again writes no second copy
  assert.equal(asides().length, 1);
  broken.map.set(L.STORE_KEY, '{"v":1,"entries":{"BAD":[]}}'); // a different bad value never replaces the first copy
  L.loadLog(broken);
  assert.deepEqual(asides().map((k) => broken.map.get(k)).sort(), ['{"v":1,"entries":{"BAD":[]}}', '{not json'].sort());
  // Storage full: no copy could be kept, so ok is false and the app must not write over the original.
  const full = fakeStorage({ [L.STORE_KEY]: '{not json' });
  full.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.equal(L.loadLog(full).ok, false);
  assert.equal(L.loadLog(null).ok, false); // the app passes null when the localStorage global itself is blocked
  const blocked = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); } };
  assert.equal(L.loadLog(blocked).ok, false);
  assert.equal(L.saveLog(blocked, log), false);
  assert.equal(L.exportFileName(new Date(2026, 6, 16, 0, 30)), 'workout-log-2026-07-16.json');
});

// ---- Training days, Done marks and exercise order ----

const at = (h, m = 0, d = 8) => new Date(2026, 9, d, h, m).getTime(); // October 2026, London time

test('a set keeps the time it was saved, and nonsense times are dropped instead of rejecting the log', () => {
  const log = L.setSlot(L.emptyLog(), KEY, '2026-10-08', 0, { w: 30, r: 12, t: at(18, 40) }, 4);
  assert.deepEqual(log.entries[KEY][0].sets[0], { w: 30, r: 12, t: at(18, 40) });
  const checked = L.validateBackup({ app: L.APP_MARK, v: 1, entries: { [KEY]: [{ date: '2026-10-08', sets: [{ w: 30, r: 12, t: 'soon' }] }] } });
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.log.entries[KEY][0].sets[0], { w: 30, r: 12 });
  assert.equal(L.lastSetTime(log, '2026-10-08'), at(18, 40));
  assert.equal(L.lastSetTime(log, '2026-10-07'), null);
});

test('start and finish a session, and a session left running is closed at its last set the next day', () => {
  let days = L.emptyDays();
  const r1 = L.startSession(days, 'push', new Date(2026, 9, 8, 18, 32));
  assert.equal(r1.started, true);
  days = r1.days;
  assert.equal(L.activeSession(days, '2026-10-08').day, 'push');
  const r2 = L.startSession(days, 'legs', new Date(2026, 9, 8, 18, 40)); // a second Start while one runs changes nothing
  assert.equal(r2.started, false);
  assert.equal(r2.days.sessions.length, 1);
  const done = L.finishSession(days, new Date(2026, 9, 8, 19, 24));
  assert.equal(done.session.end - done.session.start, 52 * 60000);
  assert.equal(L.activeSession(done.days, '2026-10-08'), null);
  // Forgot to finish: the next day it is closed at the last saved set.
  const forgot = L.startSession(L.emptyDays(), 'pull', new Date(2026, 9, 9, 18, 0)).days;
  const log = L.setSlot(L.emptyLog(), 'lat-pulldown.machine', '2026-10-09', 0, { w: 50, r: 12, t: at(18, 50, 9) }, 4);
  const closed = L.closeStale(forgot, log, '2026-10-10');
  assert.equal(closed.closed, 1);
  assert.deepEqual(closed.days.sessions[0], { date: '2026-10-09', day: 'pull', start: at(18, 0, 9), end: at(18, 50, 9), auto: 'set' });
  assert.equal(L.closeStale(forgot, log, '2026-10-09').closed, 0); // still the same session day: left running
  const noSets = L.closeStale(forgot, L.emptyLog(), '2026-10-10').days.sessions[0];
  assert.deepEqual([noSets.end, noSets.auto], [at(18, 0, 9), 'start']); // nothing logged after Start: closed where it began
  assert.equal(L.validateDays(closed.days).days.sessions[0].auto, 'set');
  // Across 4 am with the page still open: the app passes its own session day, so Start and Finish agree with the card.
  const early = L.startSession(L.emptyDays(), 'push', new Date(2026, 9, 9, 4, 5), '2026-10-08');
  assert.equal(early.session.date, '2026-10-08');
  assert.equal(L.finishSession(early.days, new Date(2026, 9, 9, 4, 10), '2026-10-08').session.date, '2026-10-08');
  assert.equal(L.finishSession(early.days, new Date(2026, 9, 9, 4, 10)).session, null); // the clock's own day has no running session
  // A session started at 1 am belongs to the evening before, so it stays active until 4 am.
  const late = L.startSession(L.emptyDays(), 'legs', new Date(2026, 9, 9, 1, 0));
  assert.equal(late.session.date, '2026-10-08');
});

test('Done marks toggle per day and training days are numbered across sessions, sets and marks', () => {
  let days = L.toggleDone(L.emptyDays(), '2026-10-08', 'push-1');
  days = L.toggleDone(days, '2026-10-08', 'push-2');
  assert.deepEqual(L.doneOn(days, '2026-10-08'), ['push-1', 'push-2']);
  days = L.toggleDone(days, '2026-10-08', 'push-1');
  assert.deepEqual(L.doneOn(days, '2026-10-08'), ['push-2']);
  assert.equal(L.isDone(days, '2026-10-08', 'push-2'), true);
  assert.deepEqual(L.toggleDone(days, '2026-10-08', 'push-2').done, {}); // the last mark removes the day
  days = L.startSession(days, 'push', new Date(2026, 9, 6, 18, 0)).days;
  const log = L.setSlot(L.emptyLog(), KEY, '2026-10-01', 0, { w: 30, r: 12 }, 4);
  const td = L.trainingDays(days, log);
  assert.deepEqual(td.map((d) => [d.number, d.date, d.sessions.length, d.done.length]), [[1, '2026-10-01', 0, 0], [2, '2026-10-06', 1, 0], [3, '2026-10-08', 0, 1]]);
});

test('the days store validates, saves and loads, and a restore adds only unknown sessions and marks', () => {
  const s = fakeStorage();
  const days = L.toggleDone(L.startSession(L.emptyDays(), 'push', new Date(2026, 9, 8, 18, 32)).days, '2026-10-08', 'push-1');
  assert.equal(L.saveDays(s, days), true);
  assert.deepEqual(L.loadDays(s).days, days);
  assert.equal(L.validateDays({ v: 1, sessions: [{ date: '2026-10-08', day: 'push', start: 5, end: 4 }], done: {} }).ok, false); // ends before it starts
  assert.equal(L.validateDays({ v: 1, sessions: [], done: { '2026-10-08': ['Push 1'] } }).ok, false);
  const twice = L.validateDays({ v: 1, sessions: [{ date: '2026-10-08', day: 'push', start: 5, end: null }, { date: '2026-10-08', day: 'legs', start: 5, end: 9 }], done: {} });
  assert.deepEqual(twice.days.sessions, [{ date: '2026-10-08', day: 'legs', start: 5, end: 9 }]);
  const backup = { v: 1, sessions: [{ date: '2026-10-08', day: 'push', start: days.sessions[0].start, end: 99 }, { date: '2026-10-01', day: 'legs', start: at(18, 0, 1), end: at(19, 0, 1) }], done: { '2026-10-08': ['push-1', 'push-3'], '2026-10-01': ['legs-1'] } };
  const merged = L.mergeDays(days, backup);
  assert.equal(merged.added, 1);
  assert.equal(merged.days.sessions[1].end, null); // the phone's own running session is kept as it is
  assert.deepEqual(merged.days.done, { '2026-10-08': ['push-1', 'push-3'], '2026-10-01': ['legs-1'] });
  const broken = fakeStorage({ [L.DAYS_KEY]: '[1' });
  const r = L.loadDays(broken);
  assert.equal(r.recovered, true);
  assert.deepEqual(r.days, L.emptyDays());
  assert.equal([...broken.map.keys()].filter((k) => k.startsWith(`${L.DAYS_KEY}.unreadable.`)).length, 1);
});

test('the exercise order applies per day, moves items, and the backup carries it', () => {
  const push = trainerDays.find((d) => d.id === 'push').exercises;
  const ids = push.map((e) => e.id);
  assert.deepEqual(L.applyOrder(push, []).map((e) => e.id), ids);
  const moved = L.moveItem(ids, 6, 0); // the last exercise first
  assert.deepEqual(moved, ['push-7', 'push-1', 'push-2', 'push-3', 'push-4', 'push-5', 'push-6']);
  assert.deepEqual(L.applyOrder(push, moved).map((e) => e.id), moved);
  assert.deepEqual(L.applyOrder(push, ['push-3', 'legs-9']).map((e) => e.id), ['push-3', 'push-1', 'push-2', 'push-4', 'push-5', 'push-6', 'push-7']); // unknown ids are ignored, the rest keep plan order
  assert.deepEqual(L.moveItem(ids, 2, 9), ids);
  assert.equal(L.validateOrder({ v: 1, order: { push: ['push-1', 'push-1'] } }).ok, false);
  const s = fakeStorage();
  const order = { v: 1, order: { push: moved } };
  assert.equal(L.saveOrder(s, order), true);
  assert.deepEqual(L.loadOrder(s).order, order);
  assert.deepEqual(L.mergeOrder(order, { v: 1, order: { push: ids, legs: ['legs-7'] } }).order, { push: moved, legs: ['legs-7'] });
  const payload = L.exportPayload(L.emptyLog(), new Date('2026-10-08T10:00:00Z'), L.toggleDone(L.emptyDays(), '2026-10-08', 'push-1'), order);
  const checked = L.validateBackup(JSON.parse(JSON.stringify(payload)));
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.days.done, { '2026-10-08': ['push-1'] });
  assert.deepEqual(checked.order.order, { push: moved });
  const old = L.validateBackup({ app: L.APP_MARK, v: 1, entries: {} }); // a backup from before training days
  assert.equal(old.ok, true);
  assert.deepEqual(old.days, L.emptyDays());
});

// ---- Review fixes: speed with years of data, and one running training at a time after a restore ----

// The plain version of trainingDays: rescans the whole log once per date. The fast one must give the same answer.
function slowTrainingDays(days, log) {
  const dates = new Set([...days.sessions.map((s) => s.date), ...Object.keys(days.done)]);
  for (const list of Object.values(log.entries)) for (const e of list) dates.add(e.date);
  const times = (date, pick) => { let t = null; for (const list of Object.values(log.entries)) for (const e of list) if (e.date === date) for (const s of e.sets) if (s && Number.isInteger(s.t) && s.t > 0 && (t === null || pick(s.t, t))) t = s.t; return t; };
  return [...dates].sort().map((date, i) => ({ number: i + 1, date, sessions: days.sessions.filter((s) => s.date === date), done: L.doneOn(days, date),
    firstSet: times(date, (a, b) => a < b), lastSet: times(date, (a, b) => a > b) }));
}

test('training days and the sets per date come out the same from one pass over the stores', () => {
  let seed = 11; const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let run = 0; run < 40; run++) {
    let log = L.emptyLog(); let days = L.emptyDays();
    for (let k = 0; k < 60; k++) {
      const date = `2026-0${1 + rnd(9)}-${String(1 + rnd(28)).padStart(2, '0')}`;
      const key = ['incline-chest-press-machine.machine', 'leg-press.machine', 'lat-pulldown.dumbbell'][rnd(3)];
      if (rnd(3)) log = L.setSlot(log, key, date, rnd(4), { w: 20 + rnd(80), r: rnd(13), ...(rnd(2) ? { t: 1e12 + rnd(1e9) } : {}) }, 4);
      if (!rnd(4)) days = L.toggleDone(days, date, `push-${1 + rnd(7)}`);
      if (!rnd(5)) days = { ...days, sessions: [...days.sessions, { date, day: 'push', start: 1e12 + rnd(1e9), end: null }].sort((a, b) => a.start - b.start) };
    }
    const fast = L.trainingDays(days, log);
    const slow = slowTrainingDays(days, log);
    assert.deepEqual(fast.map((d) => ({ ...d })), slow);
    const byDate = L.setsByDate(log);
    for (const d of slow) assert.deepEqual(byDate.get(d.date) ?? {}, L.setsOn(log, d.date));
  }
});

test('a restored backup never leaves two trainings running', () => {
  const phone = L.startSession(L.emptyDays(), 'push', new Date(2026, 9, 8, 18, 30)).days;
  const other = { v: 1, sessions: [{ date: '2026-10-08', day: 'legs', start: at(18, 10), end: null }], done: {} };
  const merged = L.mergeDays(phone, other).days;
  assert.equal(merged.sessions.filter((s) => s.end === null).length, 1);
  assert.equal(L.activeSession(merged, '2026-10-08').day, 'push'); // the phone's own running training wins
  assert.deepEqual(merged.sessions.find((s) => s.day === 'legs'), { date: '2026-10-08', day: 'legs', start: at(18, 10), end: at(18, 10), auto: 'start' });
  // With nothing running on the phone, the restored training keeps running, so it can be finished here.
  const alone = L.mergeDays(L.emptyDays(), other).days;
  assert.equal(L.activeSession(alone, '2026-10-08').day, 'legs');
  // Two running in the backup itself: only the newest keeps running.
  const two = { v: 1, sessions: [{ date: '2026-10-08', day: 'legs', start: at(18, 10), end: null }, { date: '2026-10-08', day: 'pull', start: at(18, 20), end: null }], done: {} };
  assert.deepEqual(L.mergeDays(L.emptyDays(), two).days.sessions.map((s) => [s.day, s.end === null]), [['legs', false], ['pull', true]]);
});

test('a training that is still running owns its day past 4 am, and a forgotten one rolls over after 3 quiet hours', () => {
  let days = L.startSession(L.emptyDays(), 'push', new Date(2026, 9, 9, 3, 45)).days; // 03:45: the evening of 8 Oct
  let log = L.setSlot(L.emptyLog(), KEY, '2026-10-08', 0, { w: 40, r: 12, t: at(3, 55, 9) }, 4);
  assert.equal(L.currentDay(days, log, new Date(2026, 9, 9, 4, 20)), '2026-10-08'); // still training at 04:20
  const done = L.finishSession(days, new Date(2026, 9, 9, 4, 20), L.currentDay(days, log, new Date(2026, 9, 9, 4, 20)));
  assert.equal(done.session.end, at(4, 20, 9)); // Finish counts, it is not thrown away
  assert.equal(L.currentDay(done.days, log, new Date(2026, 9, 9, 4, 25)), '2026-10-09'); // finished: the new day starts
  assert.equal(L.currentDay(days, log, new Date(2026, 9, 9, 7, 0)), '2026-10-09'); // forgotten: over 3 hours since the last set
  assert.equal(L.currentDay(L.emptyDays(), log, new Date(2026, 9, 9, 4, 20)), '2026-10-09'); // nothing running: the plain 4 am rule
});

test('editing a logged set keeps the time it was first saved', () => {
  let log = L.setSlot(L.emptyLog(), KEY, '2026-10-08', 2, { w: 40, r: 10, t: at(18, 20) }, 4);
  log = L.setSlot(log, KEY, '2026-10-08', 2, { w: 42.5, r: 10, t: at(22, 30) }, 4);
  assert.deepEqual(log.entries[KEY][0].sets[2], { w: 42.5, r: 10, t: at(18, 20) });
  log = L.setSlot(L.setSlot(log, KEY, '2026-10-08', 2, null, 4), KEY, '2026-10-08', 2, { w: 45, r: 10, t: at(22, 31) }, 4);
  assert.equal(log.entries[KEY][0].sets[2].t, at(22, 31)); // cleared and logged again: a new time
});

test('a backup with a list where a date or a day name belongs is refused', () => {
  const bad = (sessions, entries = {}) => L.validateBackup({ app: L.APP_MARK, v: 1, entries, sessions, done: {}, order: {} }).ok;
  assert.equal(bad([{ date: ['2026-10-05'], day: 'push', start: 5, end: 9 }]), false);
  assert.equal(bad([{ date: '2026-10-05', day: ['push'], start: 5, end: 9 }]), false);
  assert.equal(bad([], { [KEY]: [{ date: ['2026-10-05'], sets: [{ w: 30, r: 12 }] }] }), false);
  assert.equal(bad([{ date: '2026-10-05', day: 'push', start: 5, end: 9 }]), true);
});

test('a restore counts the Done marks it adds, and a training started by mistake can be discarded', () => {
  const r = L.mergeDays(L.toggleDone(L.emptyDays(), '2026-10-05', 'push-1'), { v: 1, sessions: [], done: { '2026-10-05': ['push-1', 'push-2'], '2026-10-06': ['pull-1'] } });
  assert.equal(r.marks, 2);
  let days = L.startSession(L.emptyDays(), 'push', new Date(2026, 9, 8, 18, 0)).days;
  days = L.discardSession(days, '2026-10-08');
  assert.deepEqual(days.sessions, []);
  const finished = L.finishSession(L.startSession(L.emptyDays(), 'push', new Date(2026, 9, 8, 18, 0)).days, new Date(2026, 9, 8, 19, 0)).days;
  assert.equal(L.discardSession(finished, '2026-10-08').sessions.length, 1); // only a running training can be discarded
});

// ---- Several plans ----

test('a training records its plan, and the plan survives saving and loading', () => {
  const r = L.startSession(L.emptyDays(), 'pull', new Date(2026, 9, 9, 18, 0), '2026-10-09', 'strength');
  assert.equal(r.session.plan, 'strength');
  const s = fakeStorage();
  L.saveDays(s, r.days);
  assert.equal(L.loadDays(s).days.sessions[0].plan, 'strength');
  assert.equal(L.startSession(L.emptyDays(), 'pull', new Date(2026, 9, 9, 18, 0)).session.plan, undefined); // older callers: the trainer plan
  assert.equal(L.validateDays({ v: 1, sessions: [{ date: '2026-10-09', day: 'pull', start: 5, end: 9, plan: 'Bad Plan' }], done: {} }).days.sessions[0].plan, undefined); // a bad plan id is dropped, not fatal
});

test('saving one plan\'s order keeps the other plans\' order on the same day', () => {
  let order = L.setDayOrder(L.emptyOrder(), 'push', ['push-3', 'push-1', 'push-2']);
  order = L.setDayOrder(order, 'push', ['push-102', 'push-101']);
  assert.deepEqual(order.order.push, ['push-102', 'push-101', 'push-3', 'push-1', 'push-2']);
  order = L.setDayOrder(order, 'push', ['push-1', 'push-3', 'push-2']);
  assert.deepEqual(order.order.push, ['push-1', 'push-3', 'push-2', 'push-102', 'push-101']);
  const trainerPush = [{ id: 'push-1' }, { id: 'push-2' }, { id: 'push-3' }];
  assert.deepEqual(L.applyOrder(trainerPush, order.order.push).map((e) => e.id), ['push-1', 'push-3', 'push-2']);
});

// ---- Review fixes for several plans ----

const TRAINER = [12, 10, 10, 8];
const FIVE = [5, 5, 5];
const SQUAT = 'barbell-back-squat.barbell';

test('advice only compares sessions with the same rep targets', () => {
  // 3 x 5 at 100 kg on the strength plan, every rep hit.
  let log = L.setSlot(L.emptyLog(), SQUAT, '2026-10-02', 0, { w: 100, r: 5 }, 3, FIVE);
  log = L.setSlot(log, SQUAT, '2026-10-02', 1, { w: 100, r: 5 }, 3, FIVE);
  log = L.setSlot(log, SQUAT, '2026-10-02', 2, { w: 100, r: 5 }, 3, FIVE);
  assert.deepEqual(log.entries[SQUAT][0].tg, FIVE);
  const same = L.guide(log, SQUAT, '2026-10-05', FIVE, 2.5, TRAINER);
  assert.equal(same.allHit, true);
  assert.deepEqual(same.suggestions.map((s) => s.w), [102.5, 102.5, 102.5]);
  // Opened on a plan where the squat is 3 x 8 to 12: last time is shown, but no 100 kg for 12 reps and no nudge.
  const other = L.guide(log, SQUAT, '2026-10-05', [12, 12, 12], 2.5, TRAINER);
  assert.equal(other.last.date, '2026-10-02');
  assert.equal(other.sameScheme, false);
  assert.equal(other.allHit, false);
  assert.deepEqual(other.suggestions, [null, null, null]);
  // An older session with the same targets still guides.
  let mixed = L.setSlot(L.emptyLog(), SQUAT, '2026-09-28', 0, { w: 60, r: 12 }, 3, [12, 12, 12]);
  mixed = L.setSlot(mixed, SQUAT, '2026-10-02', 0, { w: 100, r: 5 }, 3, FIVE);
  assert.deepEqual(L.guide(mixed, SQUAT, '2026-10-05', [12, 12, 12], 2.5, TRAINER).suggestions[0], { w: 60, up: false });
});

test('sets logged before plans existed count as the trainer plan\'s 12, 10, 10, 8', () => {
  const legacy = { v: 1, entries: { [KEY]: [{ date: '2026-10-01', sets: [{ w: 30, r: 12 }, { w: 32.5, r: 10 }, { w: 32.5, r: 10 }, { w: 35, r: 8 }] }] } };
  assert.equal(L.guide(legacy, KEY, '2026-10-05', TRAINER, 2.5, TRAINER).allHit, true);
  assert.equal(L.guide(legacy, KEY, '2026-10-05', [20, 20, 20, 20, 20, 20], 2, TRAINER).sameScheme, false);
});

test('the targets of a session survive edits, restores and saving', () => {
  let log = L.setSlot(L.emptyLog(), SQUAT, '2026-10-02', 0, { w: 100, r: 5 }, 3, FIVE);
  log = L.setSlot(log, SQUAT, '2026-10-02', 1, { w: 100, r: 5 }, 3); // an older caller without targets keeps them
  assert.deepEqual(log.entries[SQUAT][0].tg, FIVE);
  assert.deepEqual(L.mergeLogs(L.emptyLog(), log).log.entries[SQUAT][0].tg, FIVE);
  assert.deepEqual(L.mergeLogs(log, { v: 1, entries: { [SQUAT]: [{ date: '2026-10-02', sets: [null, null, { w: 100, r: 5 }] }] } }).log.entries[SQUAT][0].tg, FIVE);
  const s = fakeStorage();
  L.saveLog(s, log);
  assert.deepEqual(L.loadLog(s).log.entries[SQUAT][0].tg, FIVE);
  const odd = L.validateLog({ v: 1, entries: { [SQUAT]: [{ date: '2026-10-02', sets: [{ w: 100, r: 5 }], tg: ['five'] }] } });
  assert.equal(odd.ok, true); // nonsense targets are dropped, never fatal
  assert.equal(odd.log.entries[SQUAT][0].tg, undefined);
});

test('an assisted exercise progresses by taking assist off, and never below one step', () => {
  const PULL = 'pull-up.machine';
  let log = L.emptyLog();
  for (let i = 0; i < 3; i++) log = L.setSlot(log, PULL, '2026-10-02', i, { w: 30, r: 12 }, 3, [12, 12, 12]);
  assert.deepEqual(L.guide(log, PULL, '2026-10-05', [12, 12, 12], -2.5, TRAINER).suggestions.map((s) => [s.w, s.up]), [[27.5, true], [27.5, true], [27.5, true]]);
  let light = L.emptyLog();
  for (let i = 0; i < 3; i++) light = L.setSlot(light, PULL, '2026-10-02', i, { w: 2.5, r: 12 }, 3, [12, 12, 12]);
  assert.deepEqual(L.guide(light, PULL, '2026-10-05', [12, 12, 12], -2.5, TRAINER).suggestions[0], { w: 2.5, up: false });
});

test('a restore keeps the phone\'s order first and adds the other plans\' order for the same day', () => {
  const phone = { v: 1, order: { push: ['push-3', 'push-1', 'push-2'] } };
  const backup = { v: 1, order: { push: ['push-102', 'push-101', 'push-1'], legs: ['legs-7'] } };
  assert.deepEqual(L.mergeOrder(phone, backup).order, { push: ['push-3', 'push-1', 'push-2', 'push-102', 'push-101'], legs: ['legs-7'] });
});

// ---- Bodyweight sets: Pull Up on the bar logs the weight added, and 0 kg means bodyweight only ----

const BAR = 'pull-up.bodyweight';
const BAR_TG = [12, 12, 12];

test('a bodyweight version takes 0 kg as bodyweight only, while every other weight stays above 0', () => {
  assert.equal(L.parseAdded('0'), 0);
  assert.equal(L.parseAdded('2,5'), 2.5);
  assert.equal(L.parseAdded(''), null);
  assert.equal(L.parseAdded('-5'), null);
  assert.equal(L.parseAdded('501'), null);
  assert.equal(L.parseWeight('0'), null); // unchanged: no 0 kg anywhere else
  assert.equal(L.isBodyweightKey(BAR), true);
  assert.equal(L.isBodyweightKey('pull-up.machine'), false);
  const zero = { v: 1, entries: { [BAR]: [session('2026-10-02', [[0, 8]])] } };
  assert.equal(L.validateLog(zero).ok, false); // the main rule, the one older copies use, still refuses 0 kg
  assert.equal(L.validateLog(zero, { bodyweight: true }).ok, true);
  assert.equal(L.validateLog({ v: 1, entries: { [KEY]: [session('2026-10-02', [[0, 8]])] } }, { bodyweight: true }).ok, false); // only bodyweight keys
  assert.equal(L.validateLog({ v: 1, entries: { [BAR]: [session('2026-10-02', [[-1, 8]])] } }, { bodyweight: true }).ok, false);
});

test('bodyweight sets are stored under their own key, so the main log never holds a 0 kg set', () => {
  const s = fakeStorage();
  let log = L.setSlot(L.emptyLog(), KEY, '2026-10-02', 0, { w: 40, r: 12, t: at(18) }, 4, TARGETS);
  assert.equal(L.saveLog(s, log), true);
  assert.equal(s.map.has(L.BODYWEIGHT_KEY), false); // no bodyweight sets: no new key at all
  log = L.setSlot(log, BAR, '2026-10-02', 0, { w: 0, r: 8, t: at(18, 10) }, 3, BAR_TG);
  log = L.setSlot(log, BAR, '2026-10-02', 1, { w: 2.5, r: 6, t: at(18, 13) }, 3, BAR_TG);
  assert.equal(L.saveLog(s, log), true);
  const main = JSON.parse(s.map.get(L.STORE_KEY));
  assert.deepEqual(Object.keys(main.entries), [KEY]);
  assert.equal(OLD.validateLog(main).ok, true); // the older copy still reads it
  assert.deepEqual(JSON.parse(s.map.get(L.BODYWEIGHT_KEY)).entries[BAR][0].sets.map((x) => x && [x.w, x.r]), [[0, 8], [2.5, 6], null]);
  const back = L.loadLog(s);
  assert.equal(back.ok, true);
  assert.deepEqual(back.log, log); // the app sees one log
  assert.equal(L.trainingDays(L.emptyDays(), back.log)[0].lastSet, at(18, 13));
  assert.equal(L.prefill(back.log, BAR, '2026-10-02', 0, [null, null, null]), 0); // a logged 0 is a weight, not a gap
  // Clearing the last bodyweight set empties its key instead of leaving the set behind.
  log = L.setSlot(L.setSlot(log, BAR, '2026-10-02', 0, null, 3), BAR, '2026-10-02', 1, null, 3);
  assert.equal(L.saveLog(s, log), true);
  assert.deepEqual(JSON.parse(s.map.get(L.BODYWEIGHT_KEY)), { v: 1, entries: {} });
});

test('a 0 kg set on any other version is refused before anything is written', () => {
  const s = fakeStorage();
  const bad = { v: 1, entries: { [KEY]: [session('2026-10-02', [[0, 8]])], [BAR]: [session('2026-10-02', [[0, 8]])] } };
  assert.equal(L.saveLog(s, bad), false);
  assert.equal(s.map.size, 0);
});

test('an unreadable bodyweight store is copied aside and the main log still loads', () => {
  const log = L.setSlot(L.emptyLog(), KEY, '2026-10-02', 0, { w: 40, r: 12 }, 4, TARGETS);
  const s = fakeStorage({ [L.STORE_KEY]: JSON.stringify(log), [L.BODYWEIGHT_KEY]: '{"v":1,"entries":{"pull-up.machine":[]}}' });
  const r = L.loadLog(s);
  assert.equal(r.ok, true);
  assert.deepEqual(r.recovered, [L.BODYWEIGHT_KEY]);
  assert.deepEqual(r.log, log);
  assert.equal([...s.map.keys()].filter((k) => k.startsWith(`${L.BODYWEIGHT_KEY}.unreadable.`)).length, 1);
  const full = fakeStorage({ [L.BODYWEIGHT_KEY]: '{not json' });
  full.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.equal(L.loadLog(full).ok, false); // no copy could be kept, so nothing may be written
});

test('a backup carries bodyweight sets in their own field, which an older copy of the app skips', () => {
  let log = L.setSlot(L.emptyLog(), KEY, '2026-10-02', 0, { w: 40, r: 12 }, 4, TARGETS);
  log = L.setSlot(log, BAR, '2026-10-02', 0, { w: 0, r: 8 }, 3, BAR_TG);
  const payload = JSON.parse(JSON.stringify(L.exportPayload(log, new Date(2026, 9, 10))));
  assert.deepEqual(Object.keys(payload.entries), [KEY]);
  assert.deepEqual(Object.keys(payload.bodyweight), [BAR]);
  assert.equal(OLD.validateBackup(payload).ok, true); // an older copy restores the rest of this file
  const checked = L.validateBackup(payload);
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.log, log);
  assert.equal('bodyweight' in L.exportPayload(L.emptyLog()), false); // nothing to carry: the file looks as before
  assert.equal(L.validateBackup({ ...payload, bodyweight: { [KEY]: [session('2026-10-02', [[40, 12]])] } }).ok, false);
  assert.equal(L.validateBackup({ ...payload, bodyweight: [] }).ok, false);
  const phone = L.setSlot(L.emptyLog(), BAR, '2026-10-02', 1, { w: 2.5, r: 6 }, 3, BAR_TG);
  const merged = L.mergeLogs(phone, checked.log);
  assert.deepEqual(merged.log.entries[BAR][0].sets.map((x) => x && [x.w, x.r]), [[0, 8], [2.5, 6], null]);
});

test('advice goes from less assist, to the bar with no assist, to added weight', () => {
  const PULL = 'pull-up.machine';
  const three = (key, w, r = 12) => { let log = L.emptyLog(); w.forEach((x, i) => { log = L.setSlot(log, key, '2026-10-02', i, { w: x, r }, 3, BAR_TG); }); return log; };
  // Every rep with the least assist: the next step is the bar.
  const least = L.guide(three(PULL, [2.5, 2.5, 2.5]), PULL, '2026-10-05', BAR_TG, -2.5);
  assert.equal(least.toBar, true);
  assert.deepEqual(least.suggestions.map((s) => [s.w, s.up]), [[2.5, false], [2.5, false], [2.5, false]]);
  // One set can still lose a step of assist: keep taking it off first.
  const mixed = L.guide(three(PULL, [5, 2.5, 2.5]), PULL, '2026-10-05', BAR_TG, -2.5);
  assert.equal(mixed.toBar, false);
  assert.deepEqual(mixed.suggestions[0], { w: 2.5, up: true });
  assert.equal(L.guide(three(PULL, [2.5, 2.5, 2.5], 10), PULL, '2026-10-05', BAR_TG, -2.5).toBar, false); // missed reps
  assert.equal(L.guide(three(KEY, [2.5, 2.5, 2.5]), KEY, '2026-10-05', BAR_TG, 2.5).toBar, false); // never for a normal lift
  // On the bar: every rep at bodyweight adds one step of weight, a missed rep stays at bodyweight.
  assert.deepEqual(L.guide(three(BAR, [0, 0, 0]), BAR, '2026-10-05', BAR_TG, 2.5).suggestions.map((s) => [s.w, s.up]), [[2.5, true], [2.5, true], [2.5, true]]);
  assert.deepEqual(L.guide(three(BAR, [0, 0, 0], 9), BAR, '2026-10-05', BAR_TG, 2.5).suggestions[0], { w: 0, up: false });
});

test('a bodyweight key left in the main log by an older copy is merged, never dropped', () => {
  // An older app.js lists every version in the data file and saves w > 0 bar sets into the main log.
  const stray = { v: 1, entries: { [BAR]: [session('2026-10-05', [[5, 6]])], [KEY]: [session('2026-10-01', [[40, 12]])] } };
  const own = { v: 1, entries: { [BAR]: [session('2026-10-02', [[0, 8]]), { date: '2026-10-05', sets: [null, { w: 0, r: 7 }] }] } };
  const s = fakeStorage({ [L.STORE_KEY]: JSON.stringify(stray), [L.BODYWEIGHT_KEY]: JSON.stringify(own) });
  const r = L.loadLog(s);
  assert.equal(r.ok, true);
  assert.deepEqual(r.log.entries[BAR].map((e) => [e.date, e.sets.map((x) => x && [x.w, x.r])]), [['2026-10-02', [[0, 8]]], ['2026-10-05', [[5, 6], [0, 7]]]]);
  assert.equal(L.saveLog(s, r.log), true);
  assert.deepEqual(Object.keys(JSON.parse(s.map.get(L.STORE_KEY)).entries), [KEY]); // the stray copy moved to its own store
  assert.equal(JSON.parse(s.map.get(L.BODYWEIGHT_KEY)).entries[BAR].length, 2);
  const payload = { app: L.APP_MARK, v: 1, entries: stray.entries, bodyweight: own.entries }; // the same mix inside one backup
  assert.deepEqual(L.validateBackup(payload).log.entries[BAR].map((e) => e.date), ['2026-10-02', '2026-10-05']);
});

test('loadLog names the store it set aside, so the app can say what is missing', () => {
  const log = L.setSlot(L.emptyLog(), KEY, '2026-10-02', 0, { w: 40, r: 12 }, 4, TARGETS);
  assert.deepEqual(L.loadLog(fakeStorage({ [L.STORE_KEY]: JSON.stringify(log), [L.BODYWEIGHT_KEY]: '{not json' })).recovered, [L.BODYWEIGHT_KEY]);
  assert.deepEqual(L.loadLog(fakeStorage({ [L.STORE_KEY]: '{not json' })).recovered, [L.STORE_KEY]);
  assert.deepEqual(L.loadLog(fakeStorage({ [L.STORE_KEY]: '{not json', [L.BODYWEIGHT_KEY]: '[1' })).recovered, [L.STORE_KEY, L.BODYWEIGHT_KEY]);
  assert.equal(L.loadLog(fakeStorage({ [L.STORE_KEY]: JSON.stringify(log) })).recovered, undefined);
});

test('everything saveLog writes to the main key, and every backup, still passes the older copy of the app', () => {
  let log = L.setSlot(L.emptyLog(), KEY, '2026-10-02', 0, { w: 40, r: 12, t: at(18) }, 4, TARGETS);
  log = L.setSlot(log, 'pull-up.machine', '2026-10-02', 0, { w: 2.5, r: 12, t: at(18, 5) }, 3, BAR_TG);
  log = L.setSlot(log, BAR, '2026-10-02', 0, { w: 0, r: 8, t: at(18, 10) }, 3, BAR_TG);
  log = L.setSlot(log, BAR, '2026-10-02', 1, { w: 2.5, r: 6, t: at(18, 13) }, 3, BAR_TG);
  const s = fakeStorage();
  assert.equal(L.saveLog(s, log), true);
  const old = OLD.loadLog(s);
  assert.equal(old.ok, true);
  assert.equal(old.recovered, undefined); // nothing set aside: the older copy reads the main key as it always did
  assert.deepEqual(Object.keys(old.log.entries).sort(), [KEY, 'pull-up.machine']);
  assert.equal([...s.map.keys()].some((k) => k.includes('unreadable')), false);
  const payload = JSON.parse(JSON.stringify(L.exportPayload(log, new Date(2026, 9, 10))));
  const restored = OLD.validateBackup(payload);
  assert.equal(restored.ok, true);
  assert.deepEqual(Object.keys(restored.log.entries).sort(), [KEY, 'pull-up.machine']);
  assert.equal(OLD.validateLog({ v: 1, entries: { [BAR]: [session('2026-10-02', [[0, 8]])] } }).ok, false); // why the split exists
});

// ---- Replacements: the user's own exercise in a plan's slot ----

test('a replacement is kept per plan and slot, validated, saved, loaded and put back', () => {
  let swaps = L.setSwap(L.emptySwaps(), 'trainer', 'push-3', 'lib-12');
  swaps = L.setSwap(swaps, 'muscle', 'pull-103', 'pull-1');
  assert.equal(L.swapFor(swaps, 'trainer', 'push-3'), 'lib-12');
  assert.equal(L.swapFor(swaps, 'muscle', 'push-3'), null);
  assert.deepEqual(L.setSwap(swaps, 'trainer', 'push-3', null).swaps, { muscle: { 'pull-103': 'pull-1' } }); // put back drops the plan when empty
  assert.deepEqual(L.setSwap(swaps, 'trainer', 'push-3', 'push-3').swaps, { muscle: { 'pull-103': 'pull-1' } }); // the slot's own exercise is no swap
  const s = fakeStorage();
  assert.equal(L.saveSwaps(s, swaps), true);
  assert.deepEqual(L.loadSwaps(s).swaps, swaps);
  assert.equal(L.validateSwaps({ v: 1, swaps: { trainer: { 'push-3': 'push-3' } } }).ok, false);
  assert.equal(L.validateSwaps({ v: 1, swaps: { trainer: { 'push-3': 'LIB 12' } } }).ok, false);
  assert.equal(L.validateSwaps({ v: 1, swaps: { trainer: ['push-3'] } }).ok, false);
  assert.equal(L.validateSwaps({ v: 1, swaps: { 'Trainer!': {} } }).ok, false);
  assert.deepEqual(L.validateSwaps({ v: 1, swaps: { trainer: {} } }).swaps.swaps, {}); // an empty plan is dropped
  const broken = fakeStorage({ [L.SWAPS_KEY]: '{not json' });
  assert.equal(L.loadSwaps(broken).recovered, true);
  assert.deepEqual(L.loadSwaps(broken).swaps, L.emptySwaps());
});

test('a backup carries replacements, which an older copy of the app skips, and a restore keeps the phone\'s own', () => {
  const swaps = L.setSwap(L.setSwap(L.emptySwaps(), 'trainer', 'push-3', 'lib-12'), 'trainer', 'pull-1', 'lib-20');
  const log = L.setSlot(L.emptyLog(), KEY, '2026-10-02', 0, { w: 40, r: 12 }, 4, TARGETS);
  const payload = JSON.parse(JSON.stringify(L.exportPayload(log, new Date(2026, 9, 19), L.emptyDays(), L.emptyOrder(), swaps)));
  assert.deepEqual(payload.swaps, { trainer: { 'push-3': 'lib-12', 'pull-1': 'lib-20' } });
  assert.equal('swaps' in L.exportPayload(log), false);
  assert.equal(OLD.validateBackup(payload).ok, true);
  const checked = L.validateBackup(payload);
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.swaps, swaps);
  assert.equal(L.validateBackup({ ...payload, swaps: { trainer: { 'push-3': 'push-3' } } }).ok, false);
  const phone = L.setSwap(L.setSwap(L.emptySwaps(), 'trainer', 'push-3', 'lib-5'), 'science', 'push-301', 'lib-1');
  const merged = L.mergeSwaps(phone, checked.swaps);
  assert.deepEqual(merged.swaps.swaps, { trainer: { 'push-3': 'lib-5', 'pull-1': 'lib-20' }, science: { 'push-301': 'lib-1' } });
  assert.equal(merged.added, 1);
});

test('the replace search matches every typed word by prefix and ranks name, alias, version, then the day group', () => {
  const items = [
    { id: 'push-4', name: 'Chest Press Machine', group: 'push', aliases: ['converging chest press'], variantNames: ['Seated chest press machine', 'Flat dumbbell bench press'], rank: 1 },
    { id: 'lib-1', name: 'Pec Fly Machine', group: 'push', aliases: ['pec deck', 'chest fly machine'], variantNames: ['Pec fly machine', 'Incline dumbbell fly'], rank: 2 },
    { id: 'pull-1', name: 'Lat Pulldown', group: 'pull', aliases: [], variantNames: ['Lat pulldown machine', 'Single arm dumbbell row'], rank: 3 },
    { id: 'legs-3', name: 'Leg Press', group: 'legs', aliases: ['seated leg press'], variantNames: ['Leg press machine', 'Dumbbell squat'], rank: 4 },
  ];
  const ids = (q, g = 'push') => L.searchExercises(items, q, g).map((x) => x.id);
  assert.deepEqual(ids(''), ['push-4', 'lib-1', 'pull-1', 'legs-3']); // empty: the day's own group first, then plan order
  assert.deepEqual(ids('', 'legs'), ['legs-3', 'push-4', 'lib-1', 'pull-1']);
  assert.deepEqual(ids('pec'), ['lib-1']);
  assert.deepEqual(ids('CONVERGING  chest'), ['push-4']); // alias, any case, extra spaces
  assert.deepEqual(ids('press'), ['push-4', 'legs-3']); // name matches, own group first
  assert.deepEqual(ids('dumbbell row'), ['pull-1']); // a version name
  assert.deepEqual(ids('fly incline'), ['lib-1']); // words spread across the name and a version name
  assert.deepEqual(ids('pec-deck!'), ['lib-1']);
  assert.deepEqual(ids('zzz'), []);
});

// One rule for what stands in for the live animation: the drawing (it moves) before the offline pictures.
// The list picture uses the same rule, so it always shows what the exercise page shows.
test('log.js picks the drawing or the pictures by one rule, for the animation box and the list picture', () => {
  const both = { exercisedb: 'abcDEF1', fallback: 'Some_Pictures', drawn: 'some-drawing', note: null };
  assert.equal(L.offlineMedia(both), 'drawn');
  assert.equal(L.offlineMedia({ exercisedb: null, fallback: 'Some_Pictures', note: null }), 'pictures');
  assert.equal(L.offlineMedia({ exercisedb: 'abcDEF1', fallback: null, note: null }), null);
  const ex = { asWritten: 'barbell', variants: { dumbbell: { animation: { exercisedb: null, fallback: 'Other', note: null } }, barbell: { animation: both } } };
  assert.equal(L.thumbSrc(ex), 'media/drawn/some-drawing-still.svg', 'the as written version comes first');
  ex.variants.barbell.animation = { exercisedb: 'abcDEF1', fallback: null, note: null };
  assert.equal(L.thumbSrc(ex), 'media/fallback/Other/0.jpg', 'then the first other version with something to show');
  ex.variants.dumbbell.animation = { exercisedb: 'abcDEF1', fallback: null, note: null };
  assert.equal(L.thumbSrc(ex), null);
});

test('the drawn animation file, or its still frame when the phone asks for reduced motion', () => {
  const a = { exercisedb: null, fallback: null, drawn: 'landmine-squat', note: null };
  assert.equal(L.drawnSrc(a, false), 'media/drawn/landmine-squat.svg');
  assert.equal(L.drawnSrc(a, true), 'media/drawn/landmine-squat-still.svg');
});
