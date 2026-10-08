// Weight log: the pure logic, with no DOM. app.js passes in localStorage, the Node tests pass in a fake.
// Stored shape: { v: 1, entries: { "<exercise slug>.<version>": [ { date: "YYYY-MM-DD", sets: [ {w, r} | null, ... ] } ] } }
export const STORE_KEY = 'gymplan.log.v1'; // namespaced: anikeee.github.io is shared by all of this user's Pages sites
export const META_KEY = 'gymplan.meta.v1';
export const APP_MARK = 'gym-plan-app';
// Above what localStorage can hold (about 5 MB), so any backup this app writes can always be restored.
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
const DAY_START_HOUR = 4; // a session that runs past midnight still belongs to the evening it started
const MAX_SLOTS = 10;
const MAX_WEIGHT = 500;
const MAX_REPS = 50;
const KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z]+$/;
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
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
}
// Checks the rounded weight, the value that gets stored: 0.1 kg would round to 0 and make the next load reject the whole log.
function cleanSlot(s) {
  if (s === null) return null;
  if (typeof s !== 'object' || Array.isArray(s)) throw new Error('set');
  const w = typeof s.w === 'number' ? roundWeight(s.w) : NaN;
  const { r } = s;
  if (!Number.isFinite(w) || w <= 0 || w > MAX_WEIGHT) throw new Error('weight');
  if (!Number.isInteger(r) || r < 0 || r > MAX_REPS) throw new Error('reps');
  return { w, r };
}
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
        byDay.set(e.date, { date: e.date, sets: e.sets.map(cleanSlot) });
      }
      const kept = [...byDay.values()].filter((e) => e.sets.some(Boolean)).sort(byDate);
      if (kept.length) entries[key] = kept;
    }
    return { ok: true, log: { v: 1, entries } };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
export function validateBackup(obj) {
  if (!obj || typeof obj !== 'object' || obj.app !== APP_MARK) return { ok: false, error: 'not a backup from this app' };
  return validateLog(obj);
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
export function setSlot(log, key, day, index, slot, nSets) {
  const list = entriesFor(log, key).map((e) => ({ date: e.date, sets: e.sets.slice() }));
  let entry = list.find((e) => e.date === day);
  if (!entry) { entry = { date: day, sets: [] }; list.push(entry); }
  while (entry.sets.length < Math.max(nSets, index + 1)) entry.sets.push(null);
  entry.sets[index] = slot ? { w: roundWeight(slot.w), r: slot.r } : null;
  const kept = list.filter((e) => e.sets.some(Boolean)).sort(byDate);
  const entries = { ...log.entries };
  if (kept.length) entries[key] = kept; else delete entries[key];
  return { ...log, entries };
}

// What the set boxes show for one exercise version.
// last: the newest earlier session with at least one set (today is "this session", never "last time").
// Each set's weight comes from the newest earlier session that logged that set.
// Go up a step only when the last session logged every set and hit every target, as the plan asks.
export function guide(log, key, day, targets, step) {
  const prior = entriesFor(log, key).filter((e) => e.date < day && e.sets.some(Boolean));
  const last = prior.length ? prior[prior.length - 1] : null;
  const allHit = Boolean(last) && targets.every((t, i) => last.sets[i] && last.sets[i].r >= t);
  const suggestions = targets.map((t, i) => {
    for (let k = prior.length - 1; k >= 0; k--) {
      const s = prior[k].sets[i];
      if (s) return { w: allHit ? roundWeight(s.w + step) : s.w, up: allHit };
    }
    return null;
  });
  return { last, allHit, suggestions };
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
  const keys = new Set([...Object.keys(current.entries), ...Object.keys(imported.entries)]);
  for (const key of keys) {
    const byDay = new Map(entriesFor(current, key).map((e) => [e.date, { date: e.date, sets: e.sets.slice() }]));
    for (const e of entriesFor(imported, key)) {
      const mine = byDay.get(e.date);
      if (!mine) { byDay.set(e.date, { date: e.date, sets: e.sets.slice() }); filled += e.sets.filter(Boolean).length; continue; }
      e.sets.forEach((s, i) => { if (s && !mine.sets[i]) { mine.sets[i] = { ...s }; filled++; } });
      for (let i = 0; i < mine.sets.length; i++) if (mine.sets[i] === undefined) mine.sets[i] = null;
    }
    const list = [...byDay.values()].filter((e) => e.sets.some(Boolean)).sort(byDate);
    if (list.length) entries[key] = list;
  }
  const log = { v: 1, entries };
  return { log, added: countSessions(log) - countSessions(current), filled };
}

export function exportPayload(log, now = new Date()) {
  return { app: APP_MARK, v: 1, exportedAt: now.toISOString(), entries: log.entries };
}
export function exportFileName(now = new Date()) {
  return `workout-log-${localDate(now)}.json`;
}
