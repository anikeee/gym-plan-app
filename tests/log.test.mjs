// The weight log logic. Runs in Europe/London so the date rules are tested the way the phone sees them.
process.env.TZ = 'Europe/London';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as L from '../log.js';

const data = JSON.parse(await readFile(new URL('../data/exercises.json', import.meta.url), 'utf8'));
const TARGETS = [12, 10, 10, 8];
const KEY = 'incline-chest-press-machine.machine';
const fakeStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, map: m };
};
const session = (date, sets) => ({ date, sets: sets.map((s) => (s ? { w: s[0], r: s[1] } : null)) });

test('every exercise name gives a unique log key that the validator accepts', () => {
  const names = data.days.flatMap((d) => d.exercises.map((e) => e.name));
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
  const names = data.days.flatMap((d) => d.exercises.map((e) => e.name));
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
  assert.equal(r.recovered, true);
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
  const push = data.days.find((d) => d.id === 'push').exercises;
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
