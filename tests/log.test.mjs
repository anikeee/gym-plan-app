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
  const { log, added } = L.mergeLogs(phone, backup);
  assert.deepEqual(L.todayEntry(log, KEY, '2026-07-16').sets, [{ w: 40, r: 12 }, { w: 42.5, r: 10 }, null, null]);
  assert.deepEqual(L.entriesFor(log, KEY).map((e) => e.date), ['2026-07-09', '2026-07-16']);
  assert.equal(added, 2);
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
