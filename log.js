// Weight log: the pure logic, with no DOM. app.js passes in localStorage, the Node tests pass in a fake.
// Stored shape: { v: 1, entries: { "<exercise slug>.<version>": [ { date: "YYYY-MM-DD", sets: [ {w, r} | null, ... ] } ] } }
export const STORE_KEY = 'gymplan.log.v1'; // namespaced: anikeee.github.io is shared by all of this user's Pages sites
export const META_KEY = 'gymplan.meta.v1';
// Training days (start and finish times, Done marks) and the user's own exercise order live beside the log.
// Stored shapes: { v: 1, sessions: [ { date, day, start, end, auto? } ], done: { "YYYY-MM-DD": [exerciseId] } }
//                { v: 1, order: { push: [exerciseId, ...] } }
export const DAYS_KEY = 'gymplan.days.v1';
export const ORDER_KEY = 'gymplan.order.v1';
export const APP_MARK = 'gym-plan-app';
// Above what localStorage can hold (about 5 MB), so any backup this app writes can always be restored.
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
const DAY_START_HOUR = 4; // a session that runs past midnight still belongs to the evening it started
const MAX_SLOTS = 10;
const MAX_WEIGHT = 500;
const MAX_REPS = 50;
const KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z]+$/;
const ID_RE = /^[a-z]+-\d+$/; // exercise ids in data/exercises.json, like push-1
const DAY_ID_RE = /^[a-z]+$/;
const PLAN_ID_RE = /^[a-z]+$/; // plan ids in data/exercises.json, like trainer
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Keyed by the exercise name from the plan, not its position (push-1), so a reordered or new plan never
// attaches old weights to a different exercise. The names are pinned to the PDF by tests/data.test.mjs.
export function slug(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
export function entryKey(exerciseName, variantKey) {
  return `${slug(exerciseName)}.${variantKey}`;
}

const pad = (n) => String(n).padStart(2, '0');
// The phone's own calendar date. Never toISOString(): that is UTC, which during British Summer Time
// files anything logged between midnight and 1 am under the day before.
export function localDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
// Local field arithmetic (not milliseconds), so the 4 am boundary stays exact on clock change nights.
export function sessionDay(now = new Date()) {
  return localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() - DAY_START_HOUR, now.getMinutes()));
}
// "2026-10-05" reads as "Mon 5 Oct". Built from the parts, because new Date("2026-10-05") is parsed as UTC.
export function formatDay(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

// PureGym dumbbells go up in 2 kg steps, stacks and bars in 2.5 kg.
export function stepFor(variantKey) {
  return variantKey === 'dumbbell' ? 2 : 2.5;
}
export function roundWeight(w) {
  return Math.round(w * 4) / 4;
}
// "32,5" and "32.5" both mean 32.5 kg. Returns null for anything that is not a sensible weight.
export function parseWeight(text) {
  const t = String(text ?? '').trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d+)?$/.test(t)) return null;
  const w = roundWeight(Number(t));
  return w > 0 && w <= MAX_WEIGHT ? w : null;
}
export function formatWeight(w) {
  return String(Number(w.toFixed(2)));
}

export function emptyLog() {
  return { v: 1, entries: {} };
}

function validDate(s) {
  if (typeof s !== 'string') return false; // a list like ["2026-10-05"] would pass the pattern as text and break the page later
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
}
// Checks the rounded weight, the value that gets stored: 0.1 kg would round to 0 and make the next load reject the whole log.
// t is when the set was saved (ms). It is optional and only kept when it makes sense, so a bad t never rejects a log.
function cleanSlot(s) {
  if (s === null) return null;
  if (typeof s !== 'object' || Array.isArray(s)) throw new Error('set');
  const w = typeof s.w === 'number' ? roundWeight(s.w) : NaN;
  const { r } = s;
  if (!Number.isFinite(w) || w <= 0 || w > MAX_WEIGHT) throw new Error('weight');
  if (!Number.isInteger(r) || r < 0 || r > MAX_REPS) throw new Error('reps');
  return validTime(s.t) ? { w, r, t: s.t } : { w, r };
}
const validTime = (t) => Number.isInteger(t) && t > 0;
// tg: the rep target of every set when the session was logged. Plans differ (12, 10, 10, 8 or 5 x 5), so advice only
// compares sessions with the same targets. Optional, and dropped when it makes no sense, so it never rejects a log.
const validTargets = (tg) => Array.isArray(tg) && tg.length >= 1 && tg.length <= MAX_SLOTS && tg.every((r) => Number.isInteger(r) && r >= 1 && r <= MAX_REPS);
const sameTargets = (a, b) => a.length === b.length && a.every((r, i) => r === b[i]);
const withTargets = (entry, tg) => (validTargets(tg) ? { ...entry, tg: tg.slice() } : entry);
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

// Strict check used for both the stored log and an imported backup. Duplicate dates collapse (last wins),
// each list is re-sorted, and sessions with no sets are dropped.
export function validateLog(obj) {
  try {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj) || obj.v !== 1) throw new Error('version');
    const src = obj.entries;
    if (!src || typeof src !== 'object' || Array.isArray(src)) throw new Error('entries');
    const entries = {};
    for (const [key, list] of Object.entries(src)) {
      if (!KEY_RE.test(key) || !Array.isArray(list)) throw new Error(`key ${key}`);
      const byDay = new Map();
      for (const e of list) {
        if (!e || typeof e !== 'object' || !validDate(e.date)) throw new Error('date');
        if (!Array.isArray(e.sets) || e.sets.length < 1 || e.sets.length > MAX_SLOTS) throw new Error('sets');
        byDay.set(e.date, withTargets({ date: e.date, sets: e.sets.map(cleanSlot) }, e.tg));
      }
      const kept = [...byDay.values()].filter((e) => e.sets.some(Boolean)).sort(byDate);
      if (kept.length) entries[key] = kept;
    }
    return { ok: true, log: { v: 1, entries } };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
// A backup holds the log and, since the training days update, the sessions, Done marks and exercise order too.
// Older backups have only the log; the rest is optional and checked when present.
export function validateBackup(obj) {
  if (!obj || typeof obj !== 'object' || obj.app !== APP_MARK) return { ok: false, error: 'not a backup from this app' };
  const log = validateLog(obj);
  if (!log.ok) return log;
  const days = validateDays({ v: 1, sessions: obj.sessions ?? [], done: obj.done ?? {} });
  if (!days.ok) return days;
  const order = validateOrder({ v: 1, order: obj.order ?? {} });
  if (!order.ok) return order;
  return { ok: true, log: log.log, days: days.days, order: order.order };
}

// ok is false when storage is blocked, and when an unreadable log could not be copied aside.
// Callers must not write while ok is false, or they would replace the only copy.
export function loadLog(storage) {
  let raw;
  try { raw = storage.getItem(STORE_KEY); } catch { return { log: emptyLog(), ok: false }; }
  if (raw == null) return { log: emptyLog(), ok: true };
  try {
    const checked = validateLog(JSON.parse(raw));
    if (checked.ok) return { log: checked.log, ok: true };
  } catch { /* fall through */ }
  // Each unreadable value gets its own key, named by its content, so a later bad value never replaces an earlier copy.
  const aside = `${STORE_KEY}.unreadable.${hash(raw)}`;
  try { if (storage.getItem(aside) !== raw) storage.setItem(aside, raw); } catch { return { log: emptyLog(), ok: false, recovered: true }; }
  return { log: emptyLog(), ok: true, recovered: true };
}
function hash(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
export function saveLog(storage, log) {
  try { storage.setItem(STORE_KEY, JSON.stringify(log)); return true; } catch { return false; }
}
export function loadMeta(storage) {
  try { return JSON.parse(storage.getItem(META_KEY)) || {}; } catch { return {}; }
}
export function saveMeta(storage, meta) {
  try { storage.setItem(META_KEY, JSON.stringify(meta)); return true; } catch { return false; }
}

export function entriesFor(log, key) {
  return log.entries[key] || [];
}
export function todayEntry(log, key, day) {
  return entriesFor(log, key).find((e) => e.date === day) || null;
}

// Returns a new log with one set saved (slot = {w, r}) or cleared (slot = null). A session left with no sets is removed.
// targets: the rep target of every set on the plan the set was logged on. Kept on the session as tg.
export function setSlot(log, key, day, index, slot, nSets, targets) {
  const list = entriesFor(log, key).map((e) => withTargets({ date: e.date, sets: e.sets.slice() }, e.tg));
  let entry = list.find((e) => e.date === day);
  if (!entry) { entry = { date: day, sets: [] }; list.push(entry); }
  if (slot && validTargets(targets)) entry.tg = targets.slice();
  while (entry.sets.length < Math.max(nSets, index + 1)) entry.sets.push(null);
  // An edit keeps the time the set was first saved, so fixing a weight at home does not stretch the training.
  const t = validTime(entry.sets[index]?.t) ? entry.sets[index].t : slot?.t;
  entry.sets[index] = slot ? (validTime(t) ? { w: roundWeight(slot.w), r: slot.r, t } : { w: roundWeight(slot.w), r: slot.r }) : null;
  const kept = list.filter((e) => e.sets.some(Boolean)).sort(byDate);
  const entries = { ...log.entries };
  if (kept.length) entries[key] = kept; else delete entries[key];
  return { ...log, entries };
}

// What the set boxes show for one exercise version.
// last: the newest earlier session with at least one set (today is "this session", never "last time").
// Each set's weight comes from the newest earlier session that logged that set.
// Go up a step only when the last session logged every set and hit every target, as the plan asks.
// Only sessions logged with the same rep targets count: a 5 rep squat weight is no guide for 12 reps.
// legacy: the targets of sessions saved before plans existed (all from the personal trainer's plan).
// step < 0 for an assisted machine, where the weight is help: progress means taking assist off, never down to 0.
export function guide(log, key, day, targets, step, legacy = targets) {
  const prior = entriesFor(log, key).filter((e) => e.date < day && e.sets.some(Boolean));
  const last = prior.length ? prior[prior.length - 1] : null;
  const isSame = (e) => sameTargets(e.tg || legacy, targets);
  const sameScheme = Boolean(last) && isSame(last);
  const allHit = sameScheme && targets.every((t, i) => last.sets[i] && last.sets[i].r >= t);
  const suggestions = targets.map((t, i) => {
    for (let k = prior.length - 1; k >= 0; k--) {
      if (!isSame(prior[k])) continue;
      const s = prior[k].sets[i];
      if (!s) continue;
      const next = roundWeight(s.w + step);
      return allHit && next > 0 ? { w: next, up: true } : { w: s.w, up: false };
    }
    return null;
  });
  return { last, allHit, sameScheme, suggestions };
}

// The weight the sheet opens with: today's value, else the suggestion, else the nearest set already logged today.
export function prefill(log, key, day, index, suggestions) {
  const sets = todayEntry(log, key, day)?.sets || [];
  if (sets[index]) return sets[index].w;
  if (suggestions[index]) return suggestions[index].w;
  for (let d = 1; d < sets.length; d++) {
    if (sets[index - d]) return sets[index - d].w;
    if (sets[index + d]) return sets[index + d].w;
  }
  return null;
}

export function countSessions(log) {
  const days = new Set();
  for (const list of Object.values(log.entries)) for (const e of list) days.add(e.date);
  return days.size;
}

// Restore never overwrites the phone: same exercise version and date are merged set by set, and the
// backup only fills sets the phone does not have. added counts new days, filled counts every set the backup supplied.
export function mergeLogs(current, imported) {
  const entries = {};
  let filled = 0;
  const phoneDates = new Set(); // filled counts sets added to days the phone already had; whole new days are counted by added
  for (const list of Object.values(current.entries)) for (const e of list) phoneDates.add(e.date);
  const keys = new Set([...Object.keys(current.entries), ...Object.keys(imported.entries)]);
  for (const key of keys) {
    const byDay = new Map(entriesFor(current, key).map((e) => [e.date, withTargets({ date: e.date, sets: e.sets.slice() }, e.tg)]));
    for (const e of entriesFor(imported, key)) {
      const mine = byDay.get(e.date);
      if (!mine) { byDay.set(e.date, withTargets({ date: e.date, sets: e.sets.slice() }, e.tg)); if (phoneDates.has(e.date)) filled += e.sets.filter(Boolean).length; continue; }
      if (!mine.tg && validTargets(e.tg)) mine.tg = e.tg.slice();
      e.sets.forEach((s, i) => { if (s && !mine.sets[i]) { mine.sets[i] = { ...s }; filled++; } });
      for (let i = 0; i < mine.sets.length; i++) if (mine.sets[i] === undefined) mine.sets[i] = null;
    }
    const list = [...byDay.values()].filter((e) => e.sets.some(Boolean)).sort(byDate);
    if (list.length) entries[key] = list;
  }
  const log = { v: 1, entries };
  return { log, added: countSessions(log) - countSessions(current), filled };
}

export function exportPayload(log, now = new Date(), days = emptyDays(), order = emptyOrder()) {
  return { app: APP_MARK, v: 1, exportedAt: now.toISOString(), entries: log.entries, sessions: days.sessions, done: days.done, order: order.order };
}

// ---- Training days: a day is "trained" when it has a session, a logged set or a Done mark. ----

export function emptyDays() { return { v: 1, sessions: [], done: {} }; }
const byStart = (a, b) => a.start - b.start;

export function validateDays(obj) {
  try {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj) || obj.v !== 1) throw new Error('version');
    if (!Array.isArray(obj.sessions)) throw new Error('sessions');
    const byKey = new Map();
    for (const s of obj.sessions) {
      if (!s || typeof s !== 'object' || !validDate(s.date) || typeof s.day !== 'string' || !DAY_ID_RE.test(s.day)) throw new Error('session');
      if (!validTime(s.start)) throw new Error('start');
      if (s.end !== null && s.end !== undefined && (!validTime(s.end) || s.end < s.start)) throw new Error('end');
      const clean = { date: s.date, day: s.day, start: s.start, end: validTime(s.end) ? s.end : null };
      if (s.auto === 'set' || s.auto === 'start') clean.auto = s.auto; // closed by the app, not by Finish: at the last set, or at its start
      if (typeof s.plan === 'string' && PLAN_ID_RE.test(s.plan)) clean.plan = s.plan; // no plan: the trainer plan, the default
      byKey.set(s.start, clean); // the same start twice: last wins
    }
    const sessions = [...byKey.values()].sort(byStart);
    const src = obj.done ?? {};
    if (!src || typeof src !== 'object' || Array.isArray(src)) throw new Error('done');
    const done = {};
    for (const [date, ids] of Object.entries(src)) {
      if (!validDate(date) || !Array.isArray(ids)) throw new Error('done day');
      const kept = [...new Set(ids)].filter((id) => typeof id === 'string' && ID_RE.test(id));
      if (kept.length !== ids.length) throw new Error('done id');
      if (kept.length) done[date] = kept;
    }
    return { ok: true, days: { v: 1, sessions, done } };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
export function loadDays(storage) { return loadStore(storage, DAYS_KEY, validateDays, emptyDays); }
export function saveDays(storage, days) { return saveStore(storage, DAYS_KEY, days); }

// The day the app works on. A training that is still running owns its day, even past 4 am, until it is finished or
// has been quiet for 3 hours (no set and no start in that time). Otherwise the plain rule: the local date of now minus 4 hours.
export const QUIET_MS = 3 * 3600e3;
export function currentDay(days, log, now = new Date()) {
  const plain = sessionDay(now);
  for (let i = days.sessions.length - 1; i >= 0; i--) {
    const s = days.sessions[i];
    if (s.end !== null || s.date > plain) continue;
    const last = Math.max(s.start, lastSetTime(log, s.date) ?? 0);
    return now.getTime() - last <= QUIET_MS ? s.date : plain;
  }
  return plain;
}
// A training started by mistake: only a running one can be removed. Its sets and Done marks stay.
export function discardSession(days, today) {
  const running = activeSession(days, today);
  return running ? { ...days, sessions: days.sessions.filter((s) => s !== running) } : days;
}

// The session running right now: started on this session day and not finished.
export function activeSession(days, today) {
  for (let i = days.sessions.length - 1; i >= 0; i--) {
    const s = days.sessions[i];
    if (s.end === null && s.date === today) return s;
  }
  return null;
}
// today is passed in by the app, so the card, the sets and the session all use the same session day across 4 am.
export function startSession(days, dayId, now = new Date(), today = sessionDay(now), planId) {
  const running = activeSession(days, today);
  if (running) return { days, session: running, started: false };
  const session = { date: today, day: dayId, start: now.getTime(), end: null };
  if (planId) session.plan = planId;
  return { days: { ...days, sessions: [...days.sessions, session].sort(byStart) }, session, started: true };
}
export function finishSession(days, now = new Date(), today = sessionDay(now)) {
  const running = activeSession(days, today);
  if (!running) return { days, session: null };
  const session = { ...running, end: Math.max(running.start, now.getTime()) };
  return { days: { ...days, sessions: days.sessions.map((s) => (s === running ? session : s)) }, session };
}
// A session left running on an earlier day is closed at its last saved set, or at its start when no set has a time.
export function closeStale(days, log, today) {
  let closed = 0;
  const sessions = days.sessions.map((s) => {
    if (s.end !== null || s.date === today) return s;
    closed++;
    const last = lastSetTime(log, s.date);
    return last !== null && last > s.start ? { ...s, end: last, auto: 'set' } : closedAtStart(s);
  });
  return { days: closed ? { ...days, sessions } : days, closed };
}
const closedAtStart = (s) => ({ ...s, end: s.start, auto: 'start' });
export function lastSetTime(log, date) {
  let t = null;
  for (const list of Object.values(log.entries)) for (const e of list) if (e.date === date) for (const s of e.sets) if (s && validTime(s.t) && (t === null || s.t > t)) t = s.t;
  return t;
}
export function firstSetTime(log, date) {
  let t = null;
  for (const list of Object.values(log.entries)) for (const e of list) if (e.date === date) for (const s of e.sets) if (s && validTime(s.t) && (t === null || s.t < t)) t = s.t;
  return t;
}
export function doneOn(days, date) { return days.done[date] || []; }
export function isDone(days, date, id) { return doneOn(days, date).includes(id); }
export function toggleDone(days, date, id) {
  const now = doneOn(days, date);
  const next = now.includes(id) ? now.filter((x) => x !== id) : [...now, id];
  const done = { ...days.done };
  if (next.length) done[date] = next; else delete done[date];
  return { ...days, done };
}
// Every date with a session, a logged set or a Done mark, oldest first. Day 1 is the first of them.
// One pass over each store: the day page runs this on every visit, and five years of training is about 1,500 dates.
export function trainingDays(days, log) {
  const byDay = new Map();
  const at = (date) => {
    let d = byDay.get(date);
    if (!d) { d = { date, sessions: [], done: [], firstSet: null, lastSet: null }; byDay.set(date, d); }
    return d;
  };
  for (const s of days.sessions) at(s.date).sessions.push(s);
  for (const [date, ids] of Object.entries(days.done)) at(date).done = ids;
  for (const list of Object.values(log.entries)) for (const e of list) {
    const d = at(e.date);
    for (const s of e.sets) {
      if (!s || !validTime(s.t)) continue;
      if (d.firstSet === null || s.t < d.firstSet) d.firstSet = s.t;
      if (d.lastSet === null || s.t > d.lastSet) d.lastSet = s.t;
    }
  }
  return [...byDay.values()].sort(byDate).map((d, i) => ({ number: i + 1, ...d }));
}
// The sets of every date at once, keyed by exercise entry key, for the diary. setsOn answers one date.
export function setsByDate(log) {
  const out = new Map();
  for (const [key, list] of Object.entries(log.entries)) for (const e of list) {
    let day = out.get(e.date);
    if (!day) { day = {}; out.set(e.date, day); }
    day[key] = e.sets;
  }
  return out;
}
// The sets logged on one date, keyed by exercise entry key, in log order.
export function setsOn(log, date) {
  const out = {};
  for (const [key, list] of Object.entries(log.entries)) { const e = list.find((x) => x.date === date); if (e) out[key] = e.sets; }
  return out;
}
export function countSets(sets) { return sets.filter(Boolean).length; }

// Only one training runs at a time. A restored training that was still running is kept running only when nothing
// runs on this phone, and then only the newest one; the others are closed where they began.
export function mergeDays(current, imported) {
  const have = new Set(current.sessions.map((s) => s.start));
  let running = current.sessions.some((s) => s.end === null);
  const incoming = imported.sessions.filter((s) => !have.has(s.start)).sort((a, b) => b.start - a.start).map((s) => {
    if (s.end !== null) return s;
    if (running) return closedAtStart(s);
    running = true;
    return s;
  });
  const sessions = [...current.sessions, ...incoming].sort(byStart);
  const done = { ...current.done };
  let marks = 0;
  for (const [date, ids] of Object.entries(imported.done)) {
    const mine = new Set(done[date] || []);
    marks += ids.filter((id) => !mine.has(id)).length;
    done[date] = [...new Set([...(done[date] || []), ...ids])];
  }
  return { days: { v: 1, sessions, done }, added: sessions.length - current.sessions.length, marks };
}

// ---- Exercise order: the user's own order per training day. Missing exercises keep their plan position at the end. ----

export function emptyOrder() { return { v: 1, order: {} }; }
export function validateOrder(obj) {
  try {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj) || obj.v !== 1) throw new Error('version');
    const src = obj.order;
    if (!src || typeof src !== 'object' || Array.isArray(src)) throw new Error('order');
    const order = {};
    for (const [day, ids] of Object.entries(src)) {
      if (!DAY_ID_RE.test(day) || !Array.isArray(ids)) throw new Error('day');
      const kept = [...new Set(ids)].filter((id) => typeof id === 'string' && ID_RE.test(id));
      if (kept.length !== ids.length) throw new Error('id');
      if (kept.length) order[day] = kept;
    }
    return { ok: true, order: { v: 1, order } };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
export function loadOrder(storage) { return loadStore(storage, ORDER_KEY, validateOrder, emptyOrder); }
export function saveOrder(storage, order) { return saveStore(storage, ORDER_KEY, order); }
export function applyOrder(exercises, ids = []) {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const first = ids.filter((id) => byId.has(id)).map((id) => byId.get(id));
  const seen = new Set(first.map((e) => e.id));
  return [...first, ...exercises.filter((e) => !seen.has(e.id))];
}
// One plan's new order for a day. Every plan shares the day key (push, pull, legs) and exercise ids are unique across
// plans, so the other plans' ids stay in the list, after this plan's, in their own order. applyOrder ignores them.
export function setDayOrder(order, dayId, ids) {
  const others = (order.order[dayId] || []).filter((id) => !ids.includes(id));
  return { ...order, order: { ...order.order, [dayId]: [...ids, ...others] } };
}
export function moveItem(ids, from, to) {
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return ids;
  const next = ids.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
// Per day: the phone's own order first, then the ids only the backup has (another plan's order for the same day).
export function mergeOrder(current, imported) {
  const order = { ...imported.order };
  for (const [day, mine] of Object.entries(current.order)) order[day] = [...mine, ...(imported.order[day] || []).filter((id) => !mine.includes(id))];
  return { v: 1, order };
}

// Shared by every store: unreadable data is copied aside (see loadLog) and ok is false when that copy failed.
function loadStore(storage, key, validate, empty) {
  let raw;
  try { raw = storage.getItem(key); } catch { return { ok: false, value: empty(), [storeName(key)]: empty() }; }
  if (raw == null) return { ok: true, value: empty(), [storeName(key)]: empty() };
  try {
    const checked = validate(JSON.parse(raw));
    if (checked.ok) { const value = checked.log ?? checked.days ?? checked.order; return { ok: true, value, [storeName(key)]: value }; }
  } catch { /* fall through */ }
  const aside = `${key}.unreadable.${hash(raw)}`;
  try { if (storage.getItem(aside) !== raw) storage.setItem(aside, raw); } catch { return { ok: false, value: empty(), [storeName(key)]: empty(), recovered: true }; }
  return { ok: true, value: empty(), [storeName(key)]: empty(), recovered: true };
}
function saveStore(storage, key, value) {
  try { storage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
const storeName = (key) => (key === DAYS_KEY ? 'days' : 'order');
export function exportFileName(now = new Date()) {
  return `workout-log-${localDate(now)}.json`;
}
