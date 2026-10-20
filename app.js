import * as L from './log.js';

const API = 'https://oss.exercisedb.dev/api/v1/exercises/';
const GIF_TIMEOUT_MS = 6000;
const PLAN_KEY = 'gymplan.plan'; // the plan picked in the day page header; the personal trainer's plan when unset
const state = { data: null, plan: null, index: null, search: null, live: new Map(), shown: null, refocus: null, log: null, logOk: true, logRecovered: null, day: null, days: null, order: null, swaps: null, effective: new Map(), timer: null, reorder: false }; // live: exerciseId -> API response for this page load only
const LATEST_APK = 'https://github.com/anikeee/gym-plan-app/releases/latest/download/workout-plan.apk';
const SAVE_FAILED = "Couldn't save on this phone. Storage may be full or blocked.";
// Reading the localStorage global itself throws when site data is blocked, so read it once here. The log
// functions treat null as blocked storage, which lets the page still render and show why nothing saves.
const store = (() => { try { return window.localStorage; } catch { return null; } })();

async function main() {
  const [res, lib] = await Promise.all([fetch('data/exercises.json', { cache: 'no-cache' }), fetch('data/library.json', { cache: 'no-cache' }).catch(() => null)]);
  state.data = await res.json();
  // The library: every exercise the Replace sheet can offer beyond the plans. An older cached copy has no such file.
  state.data.library = lib?.ok ? (await lib.json()).exercises : [];
  state.index = buildIndex(state.data.plans, state.data.library);
  state.search = buildSearch();
  state.plan = pickedPlan();
  state.log = L.emptyLog(); state.days = L.emptyDays(); state.order = L.emptyOrder(); state.swaps = L.emptySwaps();
  freshLog(); freshDays(); freshOrder(); freshSwaps();
  state.day = L.currentDay(state.days, state.log);
  closeStaleSessions();
  // A reload or an Android restore can leave the set sheet's history entry behind. Step back off it, so the
  // next back press leaves the exercise. Same URL below it, so only popstate fires, and it finds no open sheet.
  if (history.state?.sheet) history.back();
  window.addEventListener('hashchange', render);
  // The phone's back button closes the set sheet instead of leaving the exercise (see openSheet).
  window.addEventListener('popstate', () => document.querySelector('dialog.sheet[open]')?.close());
  // Another tab changed something (key null means storage was cleared): show it here too.
  window.addEventListener('storage', (e) => {
    const all = e.key === null;
    if (all || e.key === PLAN_KEY) state.plan = pickedPlan();
    if (e.key === PLAN_KEY) { if (!route().exercise) redraw(); return; }
    if (e.key === L.SWAPS_KEY) { freshSwaps(); redraw(); return; } // the exercise page may now show another exercise
    const logChanged = all || e.key === L.STORE_KEY || e.key === L.BODYWEIGHT_KEY;
    const daysChanged = all || e.key === L.DAYS_KEY || e.key === L.ORDER_KEY;
    if (!logChanged && !daysChanged) return;
    if (logChanged) freshLog();
    if (daysChanged) { freshDays(); freshOrder(); }
    if (!route().exercise) { redraw(); return; } // the day list and the diary hold no animation, so a redraw is cheap
    if (logChanged) state.repaintSets?.();
    if (daysChanged) { state.repaintDone?.(); state.repaintPosition?.(); } // the exercise page keeps its live animation
  });
  // Back on screen: the running clock catches up at once, and after 4 am the boxes must show a new session.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    state.tick?.();
    if (syncDay()) {
      // Removing an open dialog does not fire 'close', so close it first: its handler pops the sheet's history entry.
      document.querySelector('dialog.sheet[open]')?.close();
      render();
    }
  });
  // The Android app says when a backup file was really written (MainActivity.reportBackup).
  window.addEventListener('workoutplan:backup', takeBackupResult);
  render();
  takeBackupResult(); // a result from before this page could listen: Android restarted the app while its save picker was open
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  warmPictures(state.plan);
}

// The trainer plan's offline pictures come with the app. Another plan's are fetched once, while online, when it is
// picked; the service worker keeps every picture it serves, so that plan's offline pictures work at the gym too.
async function warmPictures(plan) {
  if (plan === state.data.plans[0] || !('serviceWorker' in navigator) || !navigator.onLine) return;
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
  const ids = new Set(plan.days.flatMap((d) => d.exercises.flatMap((e) => Object.values(e.variants).map((v) => v.animation.fallback).filter(Boolean))));
  const urls = [...ids].flatMap((id) => [`media/fallback/${id}/0.jpg`, `media/fallback/${id}/1.jpg`]);
  const next = () => { const url = urls.shift(); if (url && state.plan === plan) fetch(url).catch(() => {}).finally(next); };
  next(); next(); // two at a time, and it stops if another plan is picked meanwhile
}

// Every exercise of every plan and of the library by id, every plan by id, and every weight log key, built once.
function buildIndex(plans, library) {
  const exercises = new Map(); const keys = new Map(); const planById = new Map();
  const addKeys = (ex, rank) => { for (const k of Object.keys(ex.variants)) { const key = L.entryKey(ex.name, k); if (!keys.has(key)) keys.set(key, { ex, variant: k, rank }); } };
  plans.forEach((plan, planRank) => {
    planById.set(plan.id, plan);
    plan.days.forEach((day) => day.exercises.forEach((ex, i) => {
      exercises.set(ex.id, { plan, day, ex, rank: planRank * 1000 + plan.days.indexOf(day) * 100 + i });
      addKeys(ex, exercises.get(ex.id).rank);
    }));
  });
  library.forEach((ex, i) => { exercises.set(ex.id, { plan: null, day: null, ex, rank: 9000 + i }); addKeys(ex, 9000 + i); });
  return { exercises, keys, planById };
}
// What the Replace sheet searches: one entry per exercise name (the same lift in two plans is one entry), then the library.
function buildSearch() {
  const items = []; const seen = new Set();
  const add = (ex, group) => items.push({ id: ex.id, name: ex.name, group, type: ex.type, aliases: ex.aliases || [], variantNames: Object.values(ex.variants).map((v) => v.name), rank: items.length, ex });
  state.data.plans.forEach((plan) => plan.days.forEach((day) => day.exercises.forEach((ex) => { if (!seen.has(ex.name)) { seen.add(ex.name); add(ex, day.id); } })));
  state.data.library.forEach((ex) => add(ex, ex.group));
  return items;
}
// The exercise that fills a plan's slot: the plan's own, or the user's replacement merged onto the slot's sets, reps,
// rest and step, so the replacement follows the plan's scheme. One object per slot, so identity checks keep working.
function slotExercise(plan, slot) {
  const id = L.swapFor(state.swaps, plan.id, slot.id);
  const target = id ? state.index.exercises.get(id)?.ex : null;
  if (!target) return slot; // no replacement, or one the data file no longer has
  const key = `${plan.id}/${slot.id}`;
  let ex = state.effective.get(key);
  if (!ex || ex.id !== target.id) {
    ex = { ...target, slot: slot.id, planId: plan.id };
    for (const f of ['reps', 'repRange', 'rest', 'step']) { if (slot[f] !== undefined) ex[f] = slot[f]; else delete ex[f]; }
    state.effective.set(key, ex);
  }
  return ex;
}
function dayExercises(plan, day) { return day.exercises.map((slot) => slotExercise(plan, slot)); }
// An exercise by id: in the picked plan's days first (a replacement lives only there), then any plan, then the library.
function findExercise(id, dayId) {
  for (const day of state.plan.days) { const ex = dayExercises(state.plan, day).find((e) => e.id === id); if (ex) return { plan: state.plan, day, ex }; }
  const hit = state.index.exercises.get(id);
  if (!hit) return null;
  return hit.plan ? hit : { plan: state.plan, day: state.plan.days.find((d) => d.id === dayId) || state.plan.days[0], ex: hit.ex };
}
function planById(id) { return state.index.planById.get(id) || state.data.plans[0]; }
function pickedPlan() {
  let id = null;
  try { id = store.getItem(PLAN_KEY); } catch { /* blocked storage: the default plan */ }
  return planById(id);
}
function planOf(ex) { return (ex.planId && planById(ex.planId)) || state.index.exercises.get(ex.id)?.plan || state.data.plans[0]; }
// The rep target of every set: the exercise's own, else the plan's (the trainer plan: 12, 10, 10, 8).
function targetsFor(ex) { return ex.reps || planOf(ex).reps; }
// "4 × 12, 10, 10, 8", or "3 × 8 to 12" for a range, whose target is its top: reach it on every set, then add weight.
function schemeText(ex) {
  const t = targetsFor(ex);
  if (ex.repRange) return `${t.length} × ${ex.repRange[0]} to ${ex.repRange[1]}`;
  return t.every((r) => r === t[0]) ? `${t.length} × ${t[0]}` : `${t.length} × ${t.join(', ')}`;
}

// A redraw from outside the page (another tab): an open sheet is closed first, so its back step goes with it.
function redraw() {
  document.querySelector('dialog.sheet[open]')?.close();
  render();
}

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const dayIds = state.plan.days.map((d) => d.id);
  let saved = null;
  try { saved = store.getItem('day'); } catch { /* blocked storage: start on push */ }
  const history = parts[0] === 'history'; // #/history: the training days diary. Its back link goes to the last day shown.
  let day = !history && dayIds.includes(parts[0]) ? parts[0] : (saved || 'push');
  if (!dayIds.includes(day)) day = 'push';
  return { history, day, exercise: history ? null : parts[1] || null, variant: history ? null : parts[2] || null };
}

function render() {
  syncDay(); // a page opened after 4 am shows the new day, even when the screen never went off
  const r = route();
  if (state.timer) { clearInterval(state.timer); state.timer = null; }
  state.tick = null;
  state.drag?.cancel(); // a drag whose list is about to vanish must not keep scrolling the page
  try { store.setItem('day', r.day); } catch { /* blocked storage: the day is only remembered in the URL */ }
  // An exercise is found in whichever plan holds it, so a link keeps working after another plan is picked.
  const found = r.exercise ? findExercise(r.exercise, r.day) : null;
  const day = found ? found.day : state.plan.days.find((d) => d.id === r.day);
  const ex = found ? found.ex : null;
  const view = document.getElementById('view');
  // A version switch keeps the scroll position. A new day or exercise starts at the top, and leaves Reorder mode.
  const shown = r.history ? 'history' : `${day.id}/${ex ? ex.id : ''}`;
  if (shown !== state.shown) state.reorder = false;
  view.replaceChildren();
  if (r.history) renderHistory(view, day); else if (ex) renderExercise(view, day, ex, r.variant); else renderDay(view, day);
  if (shown !== state.shown) window.scrollTo(0, 0);
  state.shown = shown;
}

function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
function link(href, cls, text) { const a = el('a', cls, text); a.href = href; return a; }
function withIcon(node, name, size, text) { node.append(icon(name, size), text); return node; }
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const ICONS = {
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chevronRight: '<path d="M9 6l6 6-6 6"/>',
  chevronLeft: '<path d="M15 6l-6 6 6 6"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  chevronUp: '<path d="M6 15l6-6 6 6"/>',
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  external: '<path d="M14 5h5v5"/><path d="M19 5l-8 8"/><path d="M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4"/>',
  wifiOff: '<path d="M2 8.5a15 15 0 0 1 20 0"/><path d="M5.5 12a10 10 0 0 1 13 0"/><path d="M9 15.5a5 5 0 0 1 6 0"/><path d="M3 3l18 18"/>',
  video: '<rect x="3" y="5" width="14" height="14" rx="3"/><path d="M17 10l4-2v8l-4-2"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  up: '<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14"/><path d="M6 13l6 6 6-6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>',
  drag: '<path d="M5 8h14"/><path d="M5 12h14"/><path d="M5 16h14"/>',
  swap: '<path d="M4 7h13"/><path d="M14 4l3 3-3 3"/><path d="M20 17H7"/><path d="M10 14l-3 3 3 3"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/>',
};
const SPINNER = '<svg class="spinner" width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true"><circle cx="22" cy="22" r="18" stroke="#E3E6EA" stroke-width="5"/><path d="M22 4a18 18 0 0 1 18 18" stroke="#0E0F12" stroke-width="5" stroke-linecap="round"/></svg>';

function icon(name, size, cls) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', cls ? `i ${cls}` : 'i');
  s.innerHTML = ICONS[name]; // constant markup only, API text always goes in through textContent
  return s;
}

// An exercise may set its own rest (the strength plan's first lift: 3 to 5 min), else the plan's rest for its type.
function restFor(ex) { return (ex.rest || planOf(ex).rest[ex.type]).replace(/ sec$/, ' s'); }
// "Chest / Shoulders / Triceps" reads as "Chest, shoulders and triceps".
function focusText(focus) {
  const p = focus.split(' / ').map((w, i) => (i ? w.toLowerCase() : w));
  return p.length < 2 ? p[0] : `${p.slice(0, -1).join(', ')} and ${p[p.length - 1]}`;
}
function duration(s) { return s === null ? 'Short' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
// Opens on the version the plan wrote, else the machine, else whatever version the exercise has (asWritten "other").
function defaultVariant(ex) { return ex.variants[ex.asWritten] ? ex.asWritten : ex.variants.machine ? 'machine' : Object.keys(ex.variants)[0]; }
function exerciseHref(day, ex) { return `#/${day.id}/${ex.id}/${defaultVariant(ex)}`; }
// The day's exercises, replacements in place, in the user's own order (Reorder on the day page), plan order until they
// change it. The order is stored by slot, so a slot keeps its place when its exercise is replaced or put back.
function orderedExercises(day, plan = state.plan) {
  const list = dayExercises(plan, day);
  const bySlot = new Map(list.map((ex) => [ex.slot || ex.id, ex.id]));
  return L.applyOrder(list, (state.order.order[day.id] || []).map((id) => bySlot.get(id) || id));
}
function dayName(id) { return state.plan.days.find((d) => d.id === id)?.name || cap(id); }
// The day an exercise belongs to: the slot it fills in the picked plan, else its own plan day, else its library group.
function dayOfExercise(ex) {
  const slot = state.plan.days.find((day) => dayExercises(state.plan, day).some((e) => e.id === ex.id));
  return slot?.id || state.index.exercises.get(ex.id)?.day?.id || ex.group || null;
}
// How many of a plan day's exercises carry a Done mark on a date. The day chip and the training card both use it.
function doneCount(planDay, date) { const ids = new Set(dayExercises(state.plan, planDay).map((e) => e.id)); return L.doneOn(state.days, date).filter((id) => ids.has(id)).length; }
function fmtTime(ms) { return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }
// The running clock: 42:13, or 1:02:13 past an hour.
function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
function fmtDuration(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

function renderDay(view, day) {
  const head = el('header', 'dayhead');
  const row = el('div', 'dayhead-row');
  const picker = el('button', 'plan-btn'); picker.type = 'button';
  picker.setAttribute('aria-haspopup', 'dialog'); picker.setAttribute('aria-label', `Plan: ${state.plan.name}. Change plan`);
  picker.append(el('span', 'plan-btn-name', state.plan.name), icon('chevronDown', 16));
  picker.addEventListener('click', () => openPlanSheet(view, picker));
  row.append(picker, withIcon(el('p', 'duration'), 'clock', 15, `${state.plan.minutes} min`));
  const nav = el('nav', 'seg'); nav.setAttribute('aria-label', 'Training day');
  for (const d of state.plan.days) {
    const a = link(`#/${d.id}`, 'seg-btn', d.name);
    if (d.id === day.id) a.setAttribute('aria-current', 'page');
    nav.append(a);
  }
  // One line says what the day works and the plan's sets. The tab above already names the day, so there is no title.
  const uniform = day.exercises.every((e) => !e.reps);
  const meta = el('p', 'day-meta');
  meta.append(el('span', null, focusText(day.focus)), el('span', 'day-scheme', uniform ? `${state.plan.sets} sets: ${state.plan.reps.join(', ')}` : 'Sets and reps per exercise'));
  head.append(row, nav, meta);

  const body = el('section', 'day');
  const listHead = el('div', 'list-head');
  const title = el('h2', 'list-title', 'Exercises'); const count = el('span', 'list-count'); title.append(' ', count);
  const reorder = el('button', 'reorder-btn'); reorder.type = 'button';
  const list = el('ol', 'ex-list'); list.setAttribute('role', 'list'); // Safari drops list semantics when list-style is none
  const moved = el('p', 'sr-only'); moved.setAttribute('role', 'status'); // keyboard moves are announced here
  const listStatus = el('p', 'list-status'); listStatus.setAttribute('role', 'status');
  const paintList = () => {
    state.drag?.cancel();
    const ordered = orderedExercises(day);
    const doneToday = doneCount(day, state.day);
    const running = L.activeSession(state.days, state.day);
    const next = running && !state.reorder ? ordered.find((e) => !L.isDone(state.days, state.day, e.id)) : null; // the one to do now
    count.textContent = doneToday ? `· ${doneToday} of ${ordered.length} done` : `· ${ordered.length}`;
    count.classList.toggle('is-done', doneToday > 0);
    list.classList.toggle('is-reorder', state.reorder);
    list.replaceChildren(...ordered.map((ex, i) => {
      const li = el('li');
      li.append(state.reorder ? reorderRow(day, ex, i, ordered, list, paintList, moved, listStatus) : exerciseRow(day, ex, i, ex === next));
      return li;
    }));
    reorder.setAttribute('aria-pressed', String(state.reorder));
    reorder.replaceChildren(icon(state.reorder ? 'check' : 'drag', 16), state.reorder ? 'Done reordering' : 'Reorder');
  };
  reorder.addEventListener('click', () => { state.reorder = !state.reorder; paintList(); if (state.reorder) list.querySelector('.handle')?.focus(); });
  listHead.append(title, reorder);
  paintList();
  body.append(buildTrainingBar(day, paintList), listHead, list, listStatus, moved);
  view.append(head, body);
}

// The plan picker: every plan, who it comes from and who it suits. The personal trainer's plan is first and the default.
function openPlanSheet(view, opener) {
  const sheet = el('dialog', 'sheet plan-sheet'); sheet.setAttribute('aria-labelledby', 'plan-title');
  const head = el('div', 'sheet-head');
  const title = el('h2', 'sheet-title', 'Choose a plan'); title.id = 'plan-title';
  const close = el('button', 'sheet-clear', 'Close'); close.type = 'button';
  head.append(title, close);
  const list = el('div', 'plan-list'); list.setAttribute('role', 'radiogroup'); list.setAttribute('aria-labelledby', 'plan-title');
  for (const plan of state.data.plans) {
    const on = plan === state.plan;
    const item = el('div', 'plan-item');
    const opt = el('button', `plan-opt${on ? ' is-on' : ''}`); opt.type = 'button';
    opt.setAttribute('role', 'radio'); opt.setAttribute('aria-checked', String(on));
    const name = el('span', 'plan-opt-head'); name.append(el('span', null, plan.name));
    if (on) name.append(icon('checkCircle', 22));
    const counts = plan.days.map((d) => d.exercises.length);
    const lo = Math.min(...counts); const hi = Math.max(...counts);
    opt.append(name, el('span', 'plan-opt-meta', `${plan.by} · ${plan.minutes} min · ${lo === hi ? lo : `${lo} to ${hi}`} exercises a day`), el('span', 'plan-opt-tag', plan.tagline), el('span', 'plan-opt-meta', plan.progression));
    opt.addEventListener('click', () => {
      try { store.setItem(PLAN_KEY, plan.id); } catch { /* blocked storage: the pick lasts until the page reloads */ }
      state.plan = plan;
      sheet.close();
      render();
      warmPictures(plan);
      document.querySelector('.plan-btn')?.focus({ preventScroll: true });
    });
    item.append(opt);
    if (plan.sourceUrl) { const src = link(plan.sourceUrl, 'plan-source', 'Read the source'); src.target = '_blank'; src.rel = 'noopener'; item.append(src); }
    list.append(item);
  }
  sheet.append(head, list);
  close.addEventListener('click', () => sheet.close());
  sheet.addEventListener('close', () => {
    if (history.state?.sheet) history.back(); // the phone's back button closes the sheet (popstate in main)
    sheet.remove();
    if (opener.isConnected) opener.focus({ preventScroll: true });
  });
  view.append(sheet);
  sheet.showModal();
  history.pushState({ sheet: 1 }, '');
  list.querySelector('[aria-checked="true"]')?.focus();
}

function exerciseRow(day, ex, i, isNext) {
  const done = L.isDone(state.days, state.day, ex.id);
  const a = link(exerciseHref(day, ex), `ex-card${done ? ' is-done' : ''}${isNext ? ' is-next' : ''}`);
  a.append(exerciseThumb(ex, done), exerciseText(ex, i, done, isNext), icon(done ? 'checkCircle' : 'chevronRight', done ? 22 : 18, done ? 'ex-done' : 'chev'));
  return a;
}
// The card picture; a done exercise gets a tick on it.
function exerciseThumb(ex, done) {
  const src = L.thumbSrc(ex); // the same rule as the animation box, so the card shows what the page shows
  const pic = el('span', 'ex-pic');
  if (src) {
    const thumb = el('img', 'ex-thumb'); thumb.src = src; thumb.alt = ''; thumb.width = 52; thumb.height = 52;
    thumb.onerror = () => thumb.replaceWith(el('span', 'ex-thumb')); // a picture missing offline shows the grey placeholder
    pic.append(thumb);
  } else pic.append(el('span', 'ex-thumb'));
  if (done) { const tick = el('span', 'ex-tick'); tick.append(icon('check', 14)); pic.append(tick); }
  return pic;
}
// The name and one line of meta: the number, type and rest, or, once logged today, the sets and weights.
function exerciseText(ex, i, done, isNext) {
  const text = el('span', 'ex-text');
  if (isNext) text.append(el('span', 'ex-next', 'Up next'));
  text.append(el('span', 'ex-name', ex.name));
  const meta = el('span', 'ex-meta');
  const logged = todaySets(ex);
  if (done || logged.length) {
    meta.append(done ? 'Done' : `${logged.length} of ${targetsFor(ex).length} sets`);
    if (logged.length) meta.append(` · ${done ? `${logged.length} ${logged.length === 1 ? 'set' : 'sets'} · ` : ''}${weightsText(logged)}`);
    else meta.append(' · no weights logged');
  } else {
    meta.append(el('span', `ex-kind is-${ex.type}`, `${String(i + 1).padStart(2, '0')} · ${cap(ex.type)}`), ` · ${ex.reps ? `${schemeText(ex)} · ` : ''}Rest ${restFor(ex)}`);
  }
  text.append(meta);
  if (done) text.append(el('span', 'sr-only', 'Done today'));
  return text;
}
// Today's logged sets of an exercise across its versions, in log order.
function todaySets(ex) {
  const out = [];
  for (const k of Object.keys(ex.variants)) for (const s of (L.todayEntry(state.log, L.entryKey(ex.name, k), state.day)?.sets || [])) if (s) out.push({ k, w: s.w });
  return out;
}
// "30, 32.5, 35 kg", or "30 to 35 kg" when there are many different ones; BW and BW+5 for bodyweight sets.
function weightsText(sets) {
  const words = [...new Set(sets.map((s) => weightText(s.k, s.w)))];
  const plain = words.every((w) => !w.startsWith('BW'));
  if (words.length > 3 && plain) { const ws = sets.map((s) => s.w); return `${L.formatWeight(Math.min(...ws))} to ${L.formatWeight(Math.max(...ws))} kg`; }
  return `${words.join(', ')}${plain ? ' kg' : ''}`;
}

// Reorder mode: each row gets a handle. Drag it with a finger or the mouse, or press the arrow keys on it.
function reorderRow(day, ex, i, ordered, list, paintList, moved, listStatus) {
  const row = el('div', 'ex-card is-reorder');
  const handle = el('button', 'handle'); handle.type = 'button';
  handle.setAttribute('aria-label', `Move ${ex.name}, position ${i + 1} of ${ordered.length}. Drag, or use the up and down arrow keys.`);
  handle.append(icon('drag', 22));
  const ids = ordered.map((e) => e.slot || e.id); // by slot: a replaced exercise keeps the slot's place
  const commit = (to) => {
    const next = L.moveItem(ids, i, to);
    if (next === ids) return false;
    const cur = freshOrder();
    const order = cur && L.setDayOrder(cur, day.id, next); // keeps the other plans' order for this day
    if (!order || !L.saveOrder(store, order)) { say(listStatus, SAVE_FAILED, true); return false; }
    state.order = order;
    listStatus.textContent = '';
    paintList();
    return true;
  };
  const move = (to, focusSel) => {
    if (!commit(to)) return;
    const li = list.children[to];
    (li?.querySelector(focusSel) && !li.querySelector(focusSel).disabled ? li.querySelector(focusSel) : li?.querySelector('.handle'))?.focus();
    moved.textContent = `${ex.name} moved to position ${to + 1}.`;
  };
  handle.addEventListener('keydown', (e) => {
    const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : null;
    if (to === null) return;
    e.preventDefault();
    move(to, '.handle');
  });
  // Buttons too: a phone screen reader has no arrow keys, and a tap is easier than a drag for one step.
  const up = el('button', 'move-btn'); up.type = 'button'; up.setAttribute('aria-label', `Move ${ex.name} up`); up.append(icon('chevronUp', 20)); up.disabled = i === 0;
  const down = el('button', 'move-btn'); down.type = 'button'; down.setAttribute('aria-label', `Move ${ex.name} down`); down.append(icon('chevronDown', 20)); down.disabled = i === ordered.length - 1;
  up.addEventListener('click', () => move(i - 1, '.move-btn:first-of-type'));
  down.addEventListener('click', () => move(i + 1, '.move-btn:last-of-type'));
  handle.addEventListener('pointerdown', (e) => {
    if ((e.pointerType === 'mouse' && e.button !== 0) || state.drag) return; // one finger at a time
    e.preventDefault();
    startDrag(e, handle, list, i, commit);
  });
  const moves = el('span', 'moves'); moves.append(up, down);
  row.append(handle, exerciseText(ex, i, false), moves);
  return row;
}

// One drag: the row follows the pointer, the others slide out of its way, and the list auto scrolls near the edges.
function startDrag(e, handle, list, from, commit) {
  const items = [...list.children];
  const li = items[from];
  const rects = items.map((n) => n.getBoundingClientRect()); // measured once, in the viewport as it was at the start
  const gap = items.length > 1 ? Math.max(0, rects[1].top - rects[0].bottom) : 0;
  const y0 = e.clientY; const scroll0 = window.scrollY;
  let lastY = y0; let to = from; let edge = 0; let raf = 0;
  try { handle.setPointerCapture(e.pointerId); } catch { /* an old browser: the move events still reach the handle while the pointer is over it */ }
  li.classList.add('is-dragging'); list.classList.add('is-dragging');
  const place = () => {
    const dy = lastY - y0 + (window.scrollY - scroll0);
    li.style.transform = `translateY(${dy}px)`;
    const centre = rects[from].top + rects[from].height / 2 + dy;
    to = from;
    for (let i = 0; i < from; i++) if (centre < rects[i].top + rects[i].height / 2) { to = i; break; }
    if (to === from) for (let i = items.length - 1; i > from; i--) if (centre > rects[i].top + rects[i].height / 2) { to = i; break; }
    items.forEach((n, i) => {
      if (i === from) return;
      const shift = (to < from && i >= to && i < from) ? rects[from].height + gap : (to > from && i > from && i <= to) ? -(rects[from].height + gap) : 0;
      n.style.transform = shift ? `translateY(${shift}px)` : '';
    });
  };
  const stop = () => {
    cancelAnimationFrame(raf);
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onEnd);
    handle.removeEventListener('pointercancel', onCancel);
    items.forEach((n) => { n.style.transform = ''; });
    li.classList.remove('is-dragging'); list.classList.remove('is-dragging');
    state.drag = null;
  };
  const tick = () => { // keep scrolling while the pointer rests near the top or bottom of the screen
    if (!handle.isConnected) { stop(); return; } // the list was redrawn under the finger: no pointerup will ever come
    if (edge) { window.scrollBy(0, edge * 8); place(); }
    raf = requestAnimationFrame(tick);
  };
  const onMove = (ev) => {
    if (ev.pointerId !== e.pointerId) return;
    lastY = ev.clientY;
    edge = ev.clientY < 70 ? -1 : ev.clientY > window.innerHeight - 70 ? 1 : 0;
    place();
  };
  const onEnd = (ev) => {
    if (ev.pointerId !== e.pointerId) return;
    stop();
    if (to !== from && commit(to)) list.querySelectorAll('.handle')[to]?.focus({ preventScroll: true });
  };
  // The system took the touch away (a call, the lock screen): put the row back and save nothing.
  const onCancel = (ev) => { if (ev.pointerId === e.pointerId) stop(); };
  state.drag = { cancel: stop };
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onEnd);
  handle.addEventListener('pointercancel', onCancel);
  raf = requestAnimationFrame(tick);
}

const VARIANT_LABEL = { machine: 'Machine', bodyweight: 'Bodyweight', dumbbell: 'Dumbbells', barbell: 'Barbell' };
// A set's weight in a box, the Last time row and the diary. A bodyweight version logs what was added: BW is bodyweight only.
function weightText(variantKey, w) {
  if (variantKey !== 'bodyweight') return L.formatWeight(w);
  return w ? `BW+${L.formatWeight(w)}` : 'BW';
}

function renderExercise(view, day, ex, variantKey) {
  const keys = Object.keys(ex.variants);
  const key = keys.includes(variantKey) ? variantKey : defaultVariant(ex);
  const v = ex.variants[key];
  const count = el('span', 'count');
  const nextWrap = el('div', 'next-wrap');
  const paintPosition = () => {
    const ordered = orderedExercises(day);
    const position = ordered.indexOf(ex);
    const next = position < 0 ? null : ordered[position + 1]; // a page for an exercise this day no longer holds (replaced elsewhere, or an old link)
    count.textContent = position < 0 ? 'Not in this day' : `${position + 1} of ${ordered.length}`;
    nextWrap.hidden = !next;
    nextWrap.replaceChildren();
    if (next) { const a = link(exerciseHref(day, next), 'next'); a.append(el('span', null, `Next: ${next.name}`), icon('chevronRight', 22)); nextWrap.append(a); }
  };
  paintPosition();
  state.repaintPosition = paintPosition;

  const top = el('div', 'topbar');
  const back = link(`#/${day.id}`, 'back'); back.setAttribute('aria-label', `Back to ${day.name} day`);
  back.append(icon('chevronLeft', 20), `${day.name} day`);
  const right = el('div', 'topbar-right'); right.append(count);
  // Replace: only on the picked plan's own days, where the exercise fills a slot that can hold another one.
  const slotId = ex.slot || ex.id;
  if (dayExercises(state.plan, day).includes(ex)) {
    const replace = el('button', 'swap-icon'); replace.type = 'button'; replace.setAttribute('aria-haspopup', 'dialog');
    replace.setAttribute('aria-label', ex.slot ? 'Replace this exercise, or put the plan\'s own back' : 'Replace this exercise');
    replace.append(icon('swap', 20));
    replace.addEventListener('click', () => openReplaceSheet(view, replace, day, slotId, ex));
    right.append(replace);
  }
  top.append(back, right);

  const head = el('div', 'ex-head');
  head.append(el('p', 'eyebrow', cap(ex.type)), el('h1', 'title-lg', ex.name));

  const setsBlock = el('div', 'sets-block');
  const nSets = targetsFor(ex).length;
  const cols = nSets <= 5 ? nSets : Math.ceil(nSets / 2); // 6 sets: two rows of 3, so every box keeps a readable size
  setsBlock.style.setProperty('--n', String(cols));
  setsBlock.classList.toggle('many', cols >= 5);
  const setLog = buildSetLog(ex, key);
  // Done and the rest time share one row under the boxes.
  const actions = el('div', 'set-actions');
  actions.append(buildDoneButton(ex), withIcon(el('span', 'rest'), 'clock', 16, `Rest ${restFor(ex)}`));
  // On the assisted machine the step is less help, and at the least help the next step is the bar (buildSetLog says when).
  const progress = ex.variants[key].assisted ? 'take one step of assist off. At the least assist, move to the bar' : 'add weight';
  const scheme = ex.repRange ? el('p', 'scheme', `${schemeText(ex)} reps. Reach ${ex.repRange[1]} on every set, then ${progress}.`) : null;
  setsBlock.append(...[setLog.lastLine, setLog.list, actions, scheme].filter(Boolean));

  // Buttons, not links: switching version replaces the hash so the back button still goes to the day.
  // "in plan" marks the version a plan wrote; a replacement and a library exercise have none.
  const inPlan = !ex.slot && Boolean(state.index.exercises.get(ex.id)?.plan);
  const seg = el('div', `seg seg-versions${keys.length > 2 ? ' three' : ''}`); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Version');
  for (const k of keys) {
    const b = el('button', 'seg-btn', VARIANT_LABEL[k] || cap(k)); b.type = 'button'; b.dataset.variant = k;
    b.setAttribute('aria-pressed', String(k === key));
    if (ex.asWritten === k && inPlan) b.append(el('span', 'pill-in', 'in plan'));
    b.addEventListener('click', () => { if (k !== key) { state.refocus = k; location.replace(`#/${day.id}/${ex.id}/${k}`); } });
    seg.append(b);
  }
  const segBlock = el('div', 'version-block'); segBlock.append(seg);

  // The animation card: the picture with its chips laid over it, a note under it, and the steps folded inside.
  const animCard = el('section', 'card anim-card'); animCard.setAttribute('aria-label', 'Animation');
  const box = el('div', 'anim'); const foot = el('div', 'anim-foot'); const note = el('p', 'anim-note'); note.hidden = true;
  const animWrap = el('div', 'anim-wrap'); animWrap.append(box, foot);
  const toggle = el('button', 'steps-toggle'); toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', 'steps');
  const sub = el('span', 'steps-sub'); const toggleText = el('span', 'steps-text');
  toggleText.append(el('span', 'steps-title', 'Step by step'), sub);
  toggle.append(toggleText, icon('chevronDown', 18));
  const steps = el('ol', 'steps'); steps.id = 'steps'; steps.hidden = true; steps.setAttribute('role', 'list');
  toggle.addEventListener('click', () => { const open = steps.hidden; steps.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); });
  animCard.append(animWrap, note, toggle, steps);

  const setup = el('section', 'card setup'); setup.setAttribute('aria-label', 'Setup');
  const find = setupRow('pin', 'Find it.', v.kit);
  if (v.guide) { const g = link(v.guide, 'guide', 'PureGym guide'); g.target = '_blank'; g.rel = 'noopener'; g.append(' ', icon('external', 14)); find.querySelector('p').append(' ', g); }
  setup.append(find, setupRow('target', 'Form cue.', v.tip));
  if (v.note) setup.append(setupRow('info', 'Note.', v.note));

  // Every version's clips in one sideways strip, the version on screen first.
  const watch = el('section', 'watch'); watch.setAttribute('aria-labelledby', 'watch');
  const clips = [key, ...keys.filter((x) => x !== key)].flatMap((k) => ex.variants[k].videos.map((vid) => [k, vid]));
  const watchHead = el('div', 'watch-head'); const watchTitle = el('h2', null, 'Watch'); watchTitle.id = 'watch'; watchTitle.tabIndex = -1;
  watchTitle.append(' ', el('span', 'list-count', `· ${clips.length} ${clips.length === 1 ? 'clip' : 'clips'}`));
  watchHead.append(watchTitle, el('span', null, 'Opens in YouTube'));
  const strip = el('div', 'watch-strip');
  for (const [k, vid] of clips) {
    const a = link(`https://www.youtube.com/watch?v=${vid.id}`, 'clip'); a.target = '_blank'; a.rel = 'noopener';
    const thumb = el('span', 'clip-thumb');
    const img = el('img'); img.src = `https://i.ytimg.com/vi/${vid.id}/hqdefault.jpg`; img.alt = ''; img.loading = 'lazy'; img.width = 132; img.height = 74;
    img.onerror = () => img.remove(); // no signal: keep the plain tile with the play button
    const play = el('span', 'play'); play.append(icon('play', 14, 'fill'));
    thumb.append(img, play, el('span', 'dur', duration(vid.seconds)));
    a.append(thumb, el('span', 'clip-label', vid.label), el('span', 'clip-by', `${vid.by}${k === key ? '' : ` · ${VARIANT_LABEL[k] || cap(k)} version`}`));
    strip.append(a);
  }
  watch.append(watchHead, strip);

  const body = el('div', 'variant');
  body.append(animCard, setup, watch);
  view.append(top, head, segBlock, setsBlock, body, setLog.sheet, nextWrap);
  if (state.refocus) { seg.querySelector(`[data-variant="${state.refocus}"]`)?.focus(); state.refocus = null; }

  const toVideos = () => {
    watch.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    watchTitle.focus({ preventScroll: true });
  };
  loadAnimation(v, { box, foot, note, toggle, sub, steps, toVideos });
}

// Weight log for one exercise version: the "Last time" line, the set boxes, and the sheet that logs a set.
// Saving repaints only the tapped box. It never calls render(), which would restart the animation and refetch it on weak signal.
function buildSetLog(ex, variantKey) {
  const targets = targetsFor(ex);
  const logKey = L.entryKey(ex.name, variantKey);
  let today = state.day;
  // An exercise may set its own step for the version the plan writes (the strength plan's deadlift: 5 kg).
  const step = (variantKey === ex.asWritten && ex.step) || L.stepFor(variantKey);
  // An assisted machine counts help, not load: less is progress, so the guide steps down.
  const assisted = Boolean(ex.variants[variantKey].assisted);
  // A bodyweight version counts the weight added, so 0 kg is a real set (log.js keeps it apart from the main log).
  const bodyweight = L.isBodyweightKey(logKey);
  const parse = bodyweight ? L.parseAdded : L.parseWeight;
  const short = (w) => weightText(variantKey, w);
  const spoken = (w) => (bodyweight ? (w ? `bodyweight plus ${L.formatWeight(w)} kilograms` : 'bodyweight only') : `${L.formatWeight(w)} kilograms`);
  const written = (w) => (bodyweight ? (w ? `bodyweight + ${L.formatWeight(w)} kg` : 'bodyweight only') : `${L.formatWeight(w)} ${assisted ? 'kg of assist' : 'kg'}`);
  const toBarText = ex.variants.bodyweight ? 'try the bar with no assist: tap Bodyweight' : 'try it with no assist';
  const legacy = state.data.plans[0].reps; // sessions saved before plans existed came from the trainer's plan
  const versionName = VARIANT_LABEL[variantKey] || cap(variantKey);
  const lastLine = el('div', 'last');
  let g; // the guide: last session, nudge and suggested weights. Rebuilt only when earlier days change (another tab).
  function paintLast() {
    g = L.guide(state.log, logKey, today, targets, assisted ? -step : step, legacy);
    lastLine.replaceChildren();
    const nudge = !g.last ? null
      : g.allHit && g.suggestions.some((x) => x?.up) ? (assisted ? 'You hit every rep last time. Take one step of assist off today.' : 'You hit every rep last time. Go up a step today.')
        : g.toBar ? `You hit every rep with the least assist. Now ${toBarText} above.` : null;
    lastLine.hidden = !nudge;
    if (nudge) lastLine.append(withIcon(el('p', 'last-nudge'), 'up', 16, nudge));
  }
  paintLast();

  const list = el('ol', 'sets'); list.setAttribute('role', 'list'); list.setAttribute('aria-label', `Sets, ${versionName}`);
  const buttons = targets.map((t, i) => {
    const b = el('button', 'set'); b.type = 'button';
    b.addEventListener('click', () => openSheet(i));
    const li = el('li'); li.append(b); list.append(li);
    return b;
  });
  function paintSet(i) {
    const t = targets[i];
    const done = L.todayEntry(state.log, logKey, today)?.sets[i];
    const s = g.suggestions[i];
    const hint = el('span', 'set-hint');
    const b = buttons[i];
    b.classList.toggle('done', Boolean(done));
    if (done) {
      // A logged set shows exactly what was lifted: the weight large, the reps under it. The plan target is in the sheet.
      // On the bar: BW for bodyweight only, else the weight added, like +2.5.
      const w = bodyweight && done.w ? `+${L.formatWeight(done.w)}` : short(done.w);
      const unit = bodyweight ? (done.w ? 'kg added' : 'bodyweight') : 'kg';
      hint.classList.add('is-done'); hint.append(icon('check', 14), `${done.r} reps`);
      b.replaceChildren(el('span', 'set-label', `Set ${i + 1}`), el('span', `set-reps${w.length >= 6 ? ' is-long' : ''}`, w), el('span', 'set-unit', unit), hint); // 102.25 is six characters
      b.setAttribute('aria-label', `Set ${i + 1}, done: ${spoken(done.w)}, ${done.r} reps. Plan ${t} reps. Tap to change.`);
      return;
    }
    let say;
    if (s) {
      const w = short(s.w);
      if (s.up && assisted) { hint.classList.add('is-up'); hint.append(icon('down', 14), w); say = `try ${spoken(s.w)} of assist, one step less than last time`; }
      else if (s.up) { hint.classList.add('is-up'); hint.append(icon('up', 14), w); say = `try ${spoken(s.w)}, up from last time`; }
      else { hint.append(w); say = `last time ${spoken(s.w)}`; }
    } else { hint.append(bodyweight ? 'Add reps' : 'Add kg'); say = 'not logged yet'; }
    b.replaceChildren(el('span', 'set-label', `Set ${i + 1}`), el('span', 'set-reps', String(t)), el('span', 'set-unit', 'reps'), hint);
    b.setAttribute('aria-label', `Set ${i + 1}, ${t} reps, ${say}. Tap to log.`);
  }
  buttons.forEach((b, i) => paintSet(i));
  // Another tab changed the log (a set, a restore, or cleared storage): redraw the guide and every box, never render().
  state.repaintSets = () => { if (buttons[0]?.isConnected) { paintLast(); buttons.forEach((b, i) => paintSet(i)); } };

  // The sheet. Save has autofocus, so opening it never pops the keypad over the sheet.
  const sheet = el('dialog', 'sheet'); sheet.setAttribute('aria-labelledby', 'sheet-title');
  const title = el('h2', 'sheet-title'); title.id = 'sheet-title';
  const clear = el('button', 'sheet-clear', 'Clear set'); clear.type = 'button';
  const headText = el('div', 'sheet-head-text'); headText.append(title, el('p', 'sheet-version', versionName));
  const head = el('div', 'sheet-head'); head.append(headText, clear);
  const context = el('p', 'sheet-context');
  const wLabel = el('label', 'sheet-label', assisted ? 'Assist (kg of help)' : bodyweight ? 'Weight added (0 for none)' : 'Weight'); wLabel.htmlFor = 'sheet-weight';
  const wInput = el('input', 'stepper-input'); wInput.id = 'sheet-weight'; wInput.type = 'text';
  wInput.inputMode = 'decimal'; wInput.enterKeyHint = 'done'; wInput.autocomplete = 'off'; wInput.spellcheck = false;
  const wField = el('span', 'stepper-field'); wField.append(wInput, el('span', 'stepper-unit', 'kg'));
  const wMinus = stepButton('minus', 'Less weight'); const wPlus = stepButton('plus', 'More weight');
  const wRow = el('div', 'stepper'); wRow.append(wMinus, wField, wPlus);
  const rLabel = el('p', 'sheet-label', 'Reps done'); rLabel.id = 'sheet-reps-label';
  const rValue = el('output', 'stepper-value'); rValue.setAttribute('aria-labelledby', 'sheet-reps-label');
  const rMinus = stepButton('minus', 'Fewer reps'); const rPlus = stepButton('plus', 'More reps');
  const rRow = el('div', 'stepper'); rRow.append(rMinus, rValue, rPlus);
  const status = el('p', 'sheet-status'); status.setAttribute('role', 'alert');
  const cancel = el('button', 'sheet-cancel', 'Cancel'); cancel.type = 'button';
  const save = el('button', 'sheet-save', 'Save'); save.type = 'button';
  // With a mouse and keyboard the sheet opens in the weight field. On a phone it opens on Save, so the keypad never covers the sheet.
  const desktop = matchMedia('(hover: hover) and (pointer: fine)').matches;
  (desktop ? wInput : save).autofocus = true;
  // The field opens prefilled (last time's weight, or a set from today). Typing must replace it, not append to it: "30" then "40" is not 3040.
  // Only the click that focuses the field keeps the selection; once the field has focus, a click places the caret.
  let keepSelection = false;
  wInput.addEventListener('mousedown', () => { keepSelection = document.activeElement !== wInput; });
  wInput.addEventListener('focus', () => wInput.select());
  wInput.addEventListener('mouseup', (e) => { if (keepSelection) e.preventDefault(); keepSelection = false; });
  const actions = el('div', 'sheet-actions'); actions.append(cancel, save);
  sheet.append(head, context, wLabel, wRow, rLabel, rRow, status, actions);

  let current = 0;
  let reps = 0;
  const setReps = (n) => { reps = Math.max(0, Math.min(50, n)); rValue.value = String(reps); };
  // The newest earlier session that logged this set, for the line at the top of the sheet.
  const lastFor = (i) => {
    const prior = L.entriesFor(state.log, logKey).filter((e) => e.date < today);
    for (let k = prior.length - 1; k >= 0; k--) if (prior[k].sets[i]) return { date: prior[k].date, tg: prior[k].tg || legacy, ...prior[k].sets[i] };
    return null;
  };
  // The clock passed 4 am with this page open: the boxes belong to a new session now.
  const rollDay = () => { if (!syncDay()) return false; today = state.day; paintLast(); buttons.forEach((b, k) => paintSet(k)); state.repaintDone?.(); return true; };
  function openSheet(i) {
    rollDay();
    current = i;
    const t = targets[i];
    const done = L.todayEntry(state.log, logKey, today)?.sets[i];
    const w = L.prefill(state.log, logKey, today, i, g.suggestions);
    title.textContent = `Set ${i + 1} · ${t} reps`;
    wInput.value = w == null ? (bodyweight ? '0' : '') : L.formatWeight(w); // on the bar, most sets add nothing
    setReps(done ? done.r : t);
    clear.hidden = !done;
    status.textContent = '';
    const last = lastFor(i);
    const s = g.suggestions[i];
    // The version key reads as a plain noun here (machine, dumbbell, barbell sets); the label "Dumbbells" would not.
    if (!last) context.textContent = bodyweight ? 'No earlier bodyweight sets yet. Log 0 kg added for bodyweight only, and your reps will show here next time.' : `No earlier ${variantKey} sets yet. Log today's weight and it will show here next time.`;
    else {
      const same = last.tg.length === targets.length && last.tg.every((r, k) => r === targets[k]);
      let text;
      const pick = assisted ? `Pick the help you need for ${t} reps.` : bodyweight ? `Pick how much weight to add for ${t} reps, or 0 for none.` : `Pick a weight you can lift for ${t} reps.`;
      if (!same) text = `Last time, ${L.formatDay(last.date)}: ${written(last.w)} × ${last.r}, on a plan with different reps. ${pick}`;
      else {
        text = `Last time, ${L.formatDay(last.date)}: ${written(last.w)} × ${last.r} of ${t}.`;
        if (s?.up) text += ` You hit every rep, so try ${written(s.w)}.`;
        else if (last.r < t) text += ` Stay at ${written(last.w)} until you hit ${t}.`;
        else if (g.toBar) text += ` You hit every rep with the least assist, so ${toBarText}.`;
        else text += ` Hit every rep on all ${targets.length} sets to ${assisted ? 'take one step of assist off' : 'go up a step'}.`;
      }
      context.textContent = text;
    }
    sheet.showModal();
    history.pushState({ sheet: 1 }, ''); // back closes the sheet (popstate in main)
  }
  // Saves one set (slot) or clears it (null), starting from the stored log. False when nothing could be saved.
  const persist = (slot) => {
    const cur = freshLog();
    const next = cur && L.setSlot(cur, logKey, today, current, slot, targets.length, targets);
    if (!next || !L.saveLog(store, next)) { status.textContent = SAVE_FAILED; return false; }
    state.log = next;
    return true;
  };
  function doSave() {
    const w = parse(wInput.value);
    if (w == null) { status.textContent = bodyweight ? 'Enter the weight added in kg, or 0 for bodyweight only.' : 'Enter the weight in kg, for example 32.5.'; wInput.focus(); return; }
    if (!persist({ w, r: reps, t: Date.now() })) return; // t: when the set was first saved, for the training day's times. Saves to the day the sheet opened for.
    paintSet(current);
    sheet.close();
  }
  const bump = (dir) => {
    const w = parse(wInput.value);
    if (w == null) { if (dir > 0) wInput.value = L.formatWeight(step); else wInput.focus(); return; } // + from empty starts at one step
    const next = L.roundWeight(w + dir * step);
    if (next <= 500 && (next > 0 || bodyweight)) wInput.value = L.formatWeight(Math.max(0, next)); // on the bar, minus always reaches bodyweight only, even from 2 kg
  };
  wMinus.addEventListener('click', () => bump(-1));
  wPlus.addEventListener('click', () => bump(1));
  rMinus.addEventListener('click', () => setReps(reps - 1));
  rPlus.addEventListener('click', () => setReps(reps + 1));
  wInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSave(); } });
  save.addEventListener('click', doSave);
  cancel.addEventListener('click', () => sheet.close());
  clear.addEventListener('click', () => {
    if (!persist(null)) return;
    paintSet(current);
    sheet.close();
  });
  // Every way out (Save, Cancel, Clear, Escape, back) ends here. Read history.state now, not a flag from opening,
  // so a back press that already popped the entry is not followed by a second one.
  sheet.addEventListener('close', () => {
    if (history.state?.sheet) history.back();
    buttons[current]?.focus({ preventScroll: true });
  });
  return { lastLine, list, sheet };
}

// Every write starts from what is stored right now, so a set saved in another tab is never overwritten.
// Null when storage is blocked, or when an unreadable log could not be copied aside: then nothing may be written.
function freshLog() {
  const r = L.loadLog(store);
  state.logOk = r.ok;
  state.logRecovered = r.ok && r.recovered ? r.recovered : null; // the stores set aside, only once their unreadable value really was copied
  if (!r.ok) return null;
  state.log = r.log;
  return state.log;
}

// The training days and the exercise order, read fresh before every write like the log. Null when storage is blocked.
function freshDays() {
  const r = L.loadDays(store);
  if (!r.ok) return null;
  state.days = r.days;
  return state.days;
}
function freshOrder() {
  const r = L.loadOrder(store);
  if (!r.ok) return null;
  state.order = r.order;
  return state.order;
}
// The replacements, read fresh before every write. The merged slot objects are rebuilt from them (slotExercise).
function freshSwaps() {
  const r = L.loadSwaps(store);
  if (!r.ok) return null;
  state.swaps = r.swaps; state.effective.clear();
  return state.swaps;
}
// Fills a slot of the picked plan with another exercise (null puts the plan's own back). False when nothing could be saved.
function saveSwap(day, slotId, exerciseId) {
  const cur = freshSwaps();
  const next = cur && L.setSwap(cur, state.plan.id, slotId, exerciseId);
  if (!next || !L.saveSwaps(store, next)) return false;
  state.swaps = next; state.effective.clear();
  return true;
}
// A replacement's offline pictures, fetched once while online; the service worker keeps every picture it serves.
function warmExercise(ex) {
  if (!navigator.serviceWorker?.controller || !navigator.onLine) return;
  for (const v of Object.values(ex.variants)) for (const n of [0, 1]) if (v.animation.fallback) fetch(`media/fallback/${v.animation.fallback}/${n}.jpg`).catch(() => {});
}

// The Replace sheet: a search over every exercise in every plan and the library. Typing filters as you go, and tapping
// one puts it in this slot. Exercises already on this day are left out, so a day never lists the same lift twice.
function openReplaceSheet(view, opener, day, slotId, current) {
  const sheet = el('dialog', 'sheet replace-sheet'); sheet.setAttribute('aria-labelledby', 'replace-title');
  const head = el('div', 'sheet-head');
  const title = el('h2', 'sheet-title', 'Replace'); title.id = 'replace-title';
  const close = el('button', 'sheet-clear', 'Close'); close.type = 'button';
  const headText = el('div', 'sheet-head-text'); headText.append(title, el('p', 'sheet-version', current.name));
  head.append(headText, close);
  const field = el('label', 'search-field'); field.append(icon('search', 20));
  const input = el('input', 'search-input'); input.type = 'search'; input.placeholder = 'Search exercises'; input.autocomplete = 'off'; input.spellcheck = false; input.setAttribute('aria-label', 'Search exercises');
  field.append(input);
  const status = el('p', 'sheet-status'); status.setAttribute('role', 'alert');
  const count = el('p', 'pick-count'); count.setAttribute('role', 'status');
  const list = el('ul', 'pick-list'); list.setAttribute('role', 'list');
  const onDay = new Set(dayExercises(state.plan, day).map((e) => e.name));
  const pool = state.search.filter((it) => !onDay.has(it.name));
  const MAX = 40;
  const paint = () => {
    const found = L.searchExercises(pool, input.value, day.id);
    const rows = found.slice(0, MAX).map((it) => {
      const b = el('button', 'pick'); b.type = 'button';
      const text = el('span', 'pick-text');
      const versions = Object.keys(it.ex.variants).map((k) => VARIANT_LABEL[k] || cap(k)).join(', ');
      text.append(el('span', 'pick-name', it.name), el('span', 'pick-meta', `${dayName(it.group)} · ${cap(it.type)} · ${versions}`));
      b.append(exerciseThumb(it.ex), text, icon('chevronRight', 18, 'chev'));
      b.addEventListener('click', () => pick(it));
      const li = el('li'); li.append(b); return li;
    });
    // A replaced slot offers the plan's own exercise back, first, until a search narrows the list.
    const original = current.slot && !input.value.trim() ? state.index.exercises.get(current.slot)?.ex : null;
    if (original) {
      const b = el('button', 'pick is-back'); b.type = 'button';
      const text = el('span', 'pick-text');
      text.append(el('span', 'pick-name', `Put back ${original.name}`), el('span', 'pick-meta', 'The plan\'s own exercise for this slot'));
      b.append(exerciseThumb(original), text, icon('chevronLeft', 18, 'chev'));
      b.addEventListener('click', () => { if (!saveSwap(day, slotId, null)) { say(status, SAVE_FAILED, true); return; } sheet.close(); location.replace(exerciseHref(day, original)); });
      const li = el('li'); li.append(b); rows.unshift(li);
    }
    list.replaceChildren(...rows);
    count.textContent = !found.length ? 'No exercise matches. Try another word, like the muscle or the machine.' : found.length > MAX ? `${found.length} exercises. Showing the first ${MAX}, keep typing to narrow it down.` : `${found.length} ${found.length === 1 ? 'exercise' : 'exercises'}`;
    sheet.dataset.first = found[0]?.id || '';
  };
  const pick = (it) => {
    if (!saveSwap(day, slotId, it.id)) { say(status, SAVE_FAILED, true); return; }
    sheet.close();
    warmExercise(it.ex);
    location.replace(exerciseHref(day, it.ex)); // the new exercise's page, with this slot's sets and reps
  };
  input.addEventListener('input', paint);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const first = pool.find((it) => it.id === sheet.dataset.first); if (first) pick(first); } });
  close.addEventListener('click', () => sheet.close());
  sheet.addEventListener('close', () => {
    if (history.state?.sheet) history.back(); // the phone's back button closes the sheet (popstate in main)
    sheet.remove();
    if (opener.isConnected) opener.focus({ preventScroll: true });
  });
  sheet.append(head, field, count, list, status);
  view.append(sheet);
  paint();
  sheet.showModal();
  history.pushState({ sheet: 1 }, '');
  input.focus();
}
// state.day is the session day the page was drawn for. The clock can pass 4 am while the page stays visible (a 24 hour
// gym), so every page draw and every write checks again. A running training keeps its day (L.currentDay).
// True when the day moved on: the caller then redraws for the new day.
function syncDay() {
  const now = L.currentDay(freshDays() ?? state.days, state.log);
  if (now === state.day) return false;
  state.day = now;
  closeStaleSessions();
  return true;
}
// A training left running on an earlier day ends at its last saved set, so the diary never shows a 3 day session.
function closeStaleSessions() {
  const cur = freshDays();
  if (!cur) return;
  const { days, closed } = L.closeStale(cur, state.log, state.day);
  if (closed && L.saveDays(store, days)) state.days = days;
}

// One place writes the log card's status line, so an error never keeps the success colour, or the reverse.
function say(status, text, bad = false) {
  status.textContent = text;
  status.classList.toggle('is-error', bad);
}

function stepButton(iconName, label) {
  const b = el('button', 'stepper-btn'); b.type = 'button'; b.setAttribute('aria-label', label);
  b.append(icon(iconName, 24));
  return b;
}

// Older Android app versions (1.0.x) and other apps' in-app browsers cannot save or open files.
const inAppWebView = () => /; wv\)/.test(navigator.userAgent) && typeof window.WorkoutPlanApp?.saveFile !== 'function';

// Which weights were set aside (L.loadLog recovered): the main log holds every weight but the bodyweight sets.
const unreadableText = (keys) => `${keys.includes(L.STORE_KEY) ? 'Your saved weights' : 'Your bodyweight sets'} couldn't be read, so they aren't shown. A copy was kept on this phone, and new sets save as normal.`;

function buildLogCard() {
  const card = el('section', 'card log-card'); card.setAttribute('aria-labelledby', 'log-title');
  const h = el('h2', 'log-title', 'Your weight log'); h.id = 'log-title';
  const count = el('p', 'log-count');
  const backup = el('p', 'log-backup');
  const status = el('p', 'log-status'); status.setAttribute('role', 'status');
  const paint = () => {
    const n = L.trainingDays(state.days, freshLog() ?? state.log).length; // weights, training times or Done marks
    // An unreadable store is set aside whole, so none of it can show. This line goes once a new set replaces it.
    count.textContent = !state.logOk ? "This phone isn't letting the app save. Check that site storage is allowed."
      : state.logRecovered ? unreadableText(state.logRecovered)
        : n ? `${n} training ${n === 1 ? 'day' : 'days'} saved on this phone: weights, training times and Done marks.` : 'Nothing logged yet. Tap a set on any exercise to log its weight.';
    const at = L.loadMeta(store).lastExportAt;
    const age = at ? Math.floor((Date.now() - Date.parse(at)) / 86400000) : null;
    backup.textContent = at ? `Last backup: ${L.formatDay(L.localDate(new Date(at)))}` : 'Last backup: never';
    backup.classList.toggle('is-due', n > 0 && (age === null || age >= 14));
  };
  const exp = el('button', 'log-btn', 'Export backup'); exp.type = 'button';
  const imp = el('button', 'log-btn', 'Import backup'); imp.type = 'button';
  const file = el('input'); file.type = 'file'; file.accept = '.json,application/json'; file.hidden = true;
  exp.addEventListener('click', () => exportBackup(status));
  imp.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files[0]; file.value = '';
    if (!f) return;
    const result = await importBackup(f);
    if (result.ok) render(); // Done marks, the order and the training card may all have changed
    say(state.logCard.status, result.message, !result.ok);
  });
  const row = el('div', 'log-actions'); row.append(exp, imp);
  card.append(h, count, backup);
  if (inAppWebView()) {
    const note = el('p', 'log-note', 'In the Workout Plan Android app? Update it to back up or restore your log. ');
    const get = link(LATEST_APK, null, 'Get the new app'); note.append(get);
    card.append(note);
  }
  card.append(row, file, status);
  state.logCard = { paint, status };
  paint();
  return card;
}

async function exportBackup(status) {
  const log = freshLog();
  if (!log) { say(status, "Couldn't read the log on this phone, so nothing was exported.", true); return; }
  const now = new Date();
  const text = JSON.stringify(L.exportPayload(log, now, freshDays() ?? state.days, freshOrder() ?? state.order, freshSwaps() ?? state.swaps)); // compact: about the size of the stored log, far below the import cap
  const name = L.exportFileName(now);
  const bridge = window.WorkoutPlanApp;
  if (bridge && typeof bridge.saveFile === 'function') {
    bridge.saveFile(name, text); // the app answers with a workoutplan:backup event once the file is written or not
    say(status, 'Choose where to save the backup.');
    return;
  }
  if (inAppWebView()) { say(status, "This app can't save files. Update it, or open the site in Chrome to back up.", true); return; }
  if (typeof window.showSaveFilePicker === 'function') {
    const saved = await saveWithPicker(name, text, status);
    if (saved !== null) { backupFinished(saved, saved ? 'Backup saved. Keep the file somewhere safe, like Google Drive.' : undefined); return; }
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = link(url, null); a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  // The page never hears whether a download finished, so it records the backup now and says what a cancel means.
  backupFinished(true, 'Backup downloaded. Keep the file somewhere safe, like Google Drive. If you cancelled the download, nothing was saved, so export again.');
}

// Desktop Chrome and Edge let the page write the file itself, so only a real save is recorded.
// True once the file is written, false when it was cancelled or could not be written,
// null when the picker can't open here (the caller then downloads the file instead).
async function saveWithPicker(name, text, status) {
  let handle;
  try {
    // Called before any await, so the tap still counts as the user gesture the picker needs.
    const picked = window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'Workout log backup', accept: { 'application/json': ['.json'] } }] });
    say(status, 'Choose where to save the backup.');
    handle = await picked;
  } catch (err) {
    return err?.name === 'AbortError' ? false : null;
  }
  try {
    const out = await handle.createWritable();
    await out.write(text);
    await out.close(); // the file only holds the backup once close resolves
    return true;
  } catch {
    return false; // a place was already chosen, so a second surprise download would only confuse
  }
}

// at: when the file was written, in milliseconds. The Android app passes it, because the page may hear the result later.
function backupFinished(ok, message, at = Date.now()) {
  if (ok) L.saveMeta(store, { ...L.loadMeta(store), lastExportAt: new Date(at).toISOString() });
  const card = state.logCard;
  if (card?.status.isConnected) { card.paint(); say(card.status, message || (ok ? 'Backup saved.' : 'Backup not saved.'), !ok); }
}

// The Android app keeps each backup result until the page takes it (MainActivity.takeBackupResult), so the result
// is handled exactly once, even when it arrived before this page existed. Older app versions have no bridge at all.
function takeBackupResult() {
  const app = window.WorkoutPlanApp;
  const raw = typeof app?.takeBackupResult === 'function' ? app.takeBackupResult() : '';
  if (!raw) return;
  let r;
  try { r = JSON.parse(raw); } catch { return; }
  backupFinished(r.ok === true, undefined, Number.isFinite(r.at) ? r.at : Date.now());
}

// Restores a backup into the log, the training days and the order. The phone's own data always wins.
async function importBackup(f) {
  const fail = (message) => ({ ok: false, message });
  if (f.size > L.MAX_IMPORT_BYTES) return fail('That file is too big to be a workout log backup.');
  let obj;
  try { obj = JSON.parse(await f.text()); } catch { return fail("That file isn't a workout log backup."); }
  const checked = L.validateBackup(obj);
  if (!checked.ok) return fail("That file isn't a workout log backup from this app, so nothing changed.");
  const cur = freshLog(); const curDays = freshDays(); const curOrder = freshOrder(); const curSwaps = freshSwaps();
  if (!cur || !curDays || !curOrder || !curSwaps) return fail(SAVE_FAILED);
  const { log, added, filled } = L.mergeLogs(cur, checked.log);
  const days = L.mergeDays(curDays, checked.days);
  const order = L.mergeOrder(curOrder, checked.order);
  const swaps = L.mergeSwaps(curSwaps, checked.swaps);
  const newOrderDays = Object.keys(order.order).length - Object.keys(curOrder.order).length;
  const before = [L.STORE_KEY, L.BODYWEIGHT_KEY, L.DAYS_KEY, L.ORDER_KEY, L.SWAPS_KEY].map((k) => [k, store.getItem(k)]);
  if (!L.saveLog(store, log) || !L.saveDays(store, days.days) || !L.saveOrder(store, order) || !L.saveSwaps(store, swaps.swaps)) {
    for (const [k, v] of before) { try { if (v === null) store.removeItem(k); else store.setItem(k, v); } catch { /* the old value was smaller, so this only fails if storage is gone */ } }
    return fail(SAVE_FAILED);
  }
  state.log = log; state.days = days.days; state.order = order; state.swaps = swaps.swaps; state.effective.clear();
  closeStaleSessions(); // a backup can carry a training that was never finished on the other phone
  const parts = [];
  if (added) parts.push(`${added} new ${added === 1 ? 'day' : 'days'} of weights`);
  if (filled) parts.push(`${filled} missing ${filled === 1 ? 'set' : 'sets'} filled in`);
  if (days.added) parts.push(`${days.added} training ${days.added === 1 ? 'time' : 'times'}`);
  if (days.marks) parts.push(`${days.marks} Done ${days.marks === 1 ? 'mark' : 'marks'}`);
  if (newOrderDays > 0) parts.push('your exercise order');
  if (swaps.added) parts.push(`${swaps.added} replaced ${swaps.added === 1 ? 'exercise' : 'exercises'}`);
  return { ok: true, message: parts.length ? `Backup restored: ${parts.join(', ')}.` : 'Backup restored. Everything in it was already on this phone.' };
}

// The training bar on the day page: Start and the diary while nothing runs; the clock, the done count and Finish while
// a training runs. refresh repaints the exercise list, whose "Up next" and ticks follow the training.
function buildTrainingBar(day, refresh) {
  const wrap = el('div', 'train');
  const status = el('p', 'train-status'); status.setAttribute('role', 'status');
  const paint = () => {
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
    wrap.replaceChildren();
    const today = state.day;
    const running = L.activeSession(state.days, today);
    const bar = el('div', 'train-bar');
    if (running) {
      const runPlan = planById(running.plan);
      const planDay = runPlan.days.find((d) => d.id === running.day) ?? day;
      const total = planDay.exercises.length;
      const doneN = doneCount(planDay, today);
      const number = L.trainingDays(state.days, state.log).find((d) => d.date === today)?.number;
      bar.classList.add('is-running');
      bar.setAttribute('role', 'status'); bar.setAttribute('aria-live', 'off'); // a clock read out every second is noise
      const clock = el('span', 'train-clock'); const meta = el('span', 'train-meta');
      const tick = () => {
        clock.textContent = fmtClock(Date.now() - running.start);
        const sets = Object.values(L.setsOn(state.log, today)).reduce((n, s) => n + L.countSets(s), 0);
        meta.textContent = `${doneN} of ${total} done · ${sets} ${sets === 1 ? 'set' : 'sets'}${runPlan !== state.plan ? ` · ${runPlan.name}` : ''}`;
      };
      tick();
      state.tick = tick; // called again the moment the page comes back on screen
      state.timer = setInterval(tick, 1000);
      const finish = el('button', 'train-finish', 'Finish'); finish.type = 'button'; finish.setAttribute('aria-label', 'Finish training');
      finish.addEventListener('click', () => {
        if (syncDay()) { render(); return; } // past 4 am: the training was closed at its last set, the page shows the new day
        const cur = freshDays();
        const r = cur && L.finishSession(cur, new Date(), today);
        if (!r?.session || !L.saveDays(store, r.days)) { say(status, SAVE_FAILED, true); return; }
        state.days = r.days;
        const sets = Object.values(L.setsOn(state.log, today)).reduce((n, s) => n + L.countSets(s), 0);
        paint(); refresh();
        wrap.querySelector('.train-btn')?.focus({ preventScroll: true }); // Finish is gone: keep the keyboard on the bar
        say(status, `Day ${number} saved: ${fmtDuration(r.session.end - r.session.start)}, ${doneN} of ${total} exercises done, ${sets} ${sets === 1 ? 'set' : 'sets'} logged.`);
      });
      const text = el('span', 'train-text'); text.append(clock, meta);
      bar.append(el('span', 'train-dot'), text, finish);
      const discard = el('button', 'train-discard', 'Started by mistake? Discard'); discard.type = 'button';
      let armed = null;
      discard.addEventListener('click', () => {
        if (!armed) { discard.textContent = 'Tap again to discard this training'; armed = setTimeout(() => { armed = null; discard.textContent = 'Started by mistake? Discard'; }, 5000); return; }
        clearTimeout(armed); armed = null;
        const cur = freshDays();
        const days = cur && L.discardSession(cur, today);
        if (!days || !L.saveDays(store, days)) { say(status, SAVE_FAILED, true); return; }
        state.days = days;
        paint(); refresh();
        wrap.querySelector('.train-btn')?.focus({ preventScroll: true });
        say(status, 'Training discarded. Sets and Done marks stay saved.');
      });
      wrap.append(bar, discard, status);
      return;
    }
    const start = el('button', 'train-btn'); start.type = 'button'; start.append(icon('play', 18, 'fill'), `Start ${day.name.toLowerCase()} training`);
    start.addEventListener('click', () => {
      const rolled = syncDay();
      const cur = freshDays();
      const r = cur && L.startSession(cur, day.id, new Date(), state.day, state.plan === state.data.plans[0] ? undefined : state.plan.id);
      if (!r || (r.started && !L.saveDays(store, r.days))) { say(status, SAVE_FAILED, true); return; }
      state.days = r.days;
      status.textContent = '';
      if (rolled) { render(); return; } // the whole page moves to the new day, with the training running on it
      paint(); refresh();
      wrap.querySelector('.train-finish')?.focus({ preventScroll: true });
    });
    const all = L.trainingDays(state.days, state.log).length;
    const diary = link('#/history', 'train-diary'); diary.setAttribute('aria-label', all ? `Training days (${all}) and backups` : 'Training days and backups');
    diary.append(icon('calendar', 22));
    bar.append(start, diary);
    wrap.append(bar, status);
  };
  paint();
  return wrap;
}

function buildDoneButton(ex) {
  const wrap = el('div', 'done-wrap');
  const btn = el('button', 'done-btn'); btn.type = 'button';
  const status = el('p', 'done-status'); status.setAttribute('role', 'status');
  const paint = () => {
    const done = L.isDone(state.days, state.day, ex.id);
    btn.setAttribute('aria-pressed', String(done));
    btn.classList.toggle('is-done', done);
    btn.replaceChildren(icon(done ? 'checkCircle' : 'check', 20), done ? 'Done' : 'Mark as done');
  };
  btn.addEventListener('click', () => {
    if (syncDay()) { render(); return; } // past 4 am: a fresh page for the new day, tap again to mark it
    const cur = freshDays();
    const days = cur && L.toggleDone(cur, state.day, ex.id);
    if (!days || !L.saveDays(store, days)) { say(status, SAVE_FAILED, true); return; }
    state.days = days;
    status.textContent = '';
    paint();
  });
  paint();
  state.repaintDone = paint;
  wrap.append(btn, status);
  return wrap;
}

// #/history: every training day, newest first, with its times, Done marks and every set logged that day.
function renderHistory(view, day) {
  const top = el('div', 'topbar');
  const back = link(`#/${day.id}`, 'back'); back.setAttribute('aria-label', `Back to ${day.name} day`);
  back.append(icon('chevronLeft', 20), `${day.name} day`);
  top.append(back);
  const head = el('div', 'ex-head');
  head.append(el('p', 'eyebrow', 'Your diary'), el('h1', 'title-lg', 'Training days'));
  const wrap = el('div', 'history');
  wrap.append(buildLogCard()); // backups live here now, not on every day page
  const all = L.trainingDays(state.days, state.log).reverse();
  if (!all.length) wrap.append(el('p', 'history-empty', 'No training days yet. Press Start training on a day, or log a set, and it shows up here.'));
  // Thirty days at a time: after years of training, drawing every day at once froze the page for seconds on a phone.
  const setsByDate = L.setsByDate(state.log);
  const more = el('button', 'history-more'); more.type = 'button';
  let shown = 0;
  const showMore = () => {
    const page = all.slice(shown, shown + HISTORY_PAGE);
    page.forEach((d, i) => wrap.insertBefore(dayCard(d, shown + i === 0, setsByDate.get(d.date) || {}), more));
    shown += page.length;
    more.hidden = shown >= all.length;
    more.textContent = `Show older days (${all.length - shown} more)`;
  };
  more.addEventListener('click', showMore);
  wrap.append(more);
  showMore();
  view.append(top, head, wrap);
}
const HISTORY_PAGE = 30;

function dayCard(d, open, sets) {
  const card = el('details', 'card day-card'); card.open = open;
  const sum = el('summary', 'day-sum');
  const setCount = Object.values(sets).reduce((n, s) => n + L.countSets(s), 0);
  // Which plan days were trained: from the sessions, else from the exercises that have sets or a Done mark.
  const names = new Set(d.sessions.map((s) => `${dayName(s.day)}${s.plan && s.plan !== state.data.plans[0].id ? ` (${planById(s.plan).name})` : ''}`));
  const byName = new Map(); // one row per exercise name: the same lift in two plans is one history
  const rowFor = (ex, rank) => {
    let row = byName.get(ex.name);
    if (!row) { row = { ex, done: false, versions: [], rank }; byName.set(ex.name, row); }
    row.rank = Math.min(row.rank, rank);
    return row;
  };
  for (const id of d.done) { const hit = state.index.exercises.get(id); if (hit) rowFor(hit.ex, hit.rank).done = true; }
  for (const [key, s] of Object.entries(sets)) {
    const hit = state.index.keys.get(key);
    if (hit) rowFor(hit.ex, hit.rank).versions.push([hit.variant, s]);
  }
  // Order: first set time that day (the order trained), then the plan that was trained, in the user's own order.
  const plan = d.sessions[0] ? planById(d.sessions[0].plan) : state.plan; // no Start pressed: the plan picked now
  const planPos = new Map(plan.days.flatMap((day) => orderedExercises(day, plan).map((ex, i) => [ex.name, plan.days.indexOf(day) * 100 + i])));
  for (const r of byName.values()) {
    const times = r.versions.flatMap(([, s]) => s.filter((x) => x && Number.isInteger(x.t)).map((x) => x.t));
    r.first = times.length ? Math.min(...times) : Infinity;
    r.pos = planPos.has(r.ex.name) ? planPos.get(r.ex.name) : 10000 + r.rank;
  }
  const rows = [...byName.values()].sort((a, b) => a.first - b.first || a.pos - b.pos);
  if (!d.sessions.length) for (const r of rows) { const id = dayOfExercise(r.ex); if (id) names.add(dayName(id)); }
  const running = d.sessions.find((s) => s.end === null);
  const first = d.sessions[0]; const lastEnd = Math.max(...d.sessions.map((s) => s.end ?? 0));
  let when;
  if (running) when = `Started ${fmtTime(running.start)}, still running`;
  else if (first) when = `${fmtTime(first.start)} to ${fmtTime(lastEnd)} · ${fmtDuration(d.sessions.reduce((n, s) => n + (s.end - s.start), 0))}${d.sessions.some((s) => s.auto === 'set') ? ' (ended at the last set)' : d.sessions.some((s) => s.auto === 'start') ? ' (never finished)' : ''}`;
  else if (d.firstSet) when = `Sets logged ${fmtTime(d.firstSet)} to ${fmtTime(d.lastSet)} · no start pressed`;
  else when = 'No times recorded';
  const title = el('span', 'day-n', `Day ${d.number}${names.size ? ` · ${[...names].join(' + ')}` : ''}`);
  const sub = el('span', 'day-sub', `${L.formatDay(d.date)} · ${when}`);
  const facts = el('span', 'day-sub', `${rows.filter((r) => r.done).length} done · ${setCount} ${setCount === 1 ? 'set' : 'sets'}`);
  const text = el('span', 'day-text'); text.append(title, sub, facts);
  sum.append(text, icon('chevronDown', 20));
  const body = el('div', 'day-body');
  if (!rows.length) body.append(el('p', 'day-sub', 'Nothing logged on this day.'));
  for (const r of rows) {
    const row = el('div', `day-ex${r.done ? ' is-done' : ''}`);
    const name = el('span', 'day-ex-name'); name.append(r.ex.name);
    if (r.done) name.append(' ', icon('checkCircle', 16));
    row.append(name);
    // An assisted machine logs help, not load, so its label says so: the way from the machine to the bar reads right.
    for (const [k, s] of r.versions) row.append(el('span', 'day-ex-sets', `${VARIANT_LABEL[k] || cap(k)}${r.ex.variants[k]?.assisted ? ' (assist kg)' : ''}: ${s.map((x) => (x ? `${weightText(k, x.w)}×${x.r}` : 'skipped')).join(' · ')}`));
    if (!r.versions.length) row.append(el('span', 'day-ex-sets', 'Done, no weights logged'));
    body.append(row);
  }
  card.append(sum, body);
  return card;
}

function setupRow(iconName, label, text) {
  const row = el('div', 'setup-row');
  const tile = el('span', 'setup-icon'); tile.append(icon(iconName, 16));
  const p = el('p'); p.append(el('b', 'setup-lead', label), ' ', text);
  row.append(tile, p);
  return row;
}

// The animation card has five states (loading, live, drawn, offline, none). Each one redraws the box, the row under it and the steps toggle, so nothing from an earlier state survives.
function setAnim(ui, name, boxKids, footKids, note) {
  ui.box.dataset.state = name;
  ui.box.replaceChildren(...boxKids);
  ui.foot.replaceChildren(...footKids);
  ui.note.textContent = note || ''; ui.note.hidden = !note;
}
// list null disables the toggle, sub null hides it.
function setSteps(ui, list, sub) {
  ui.toggle.hidden = sub === null; ui.toggle.disabled = !list; ui.sub.textContent = sub || '';
  ui.toggle.setAttribute('aria-expanded', 'false'); ui.steps.hidden = true;
  ui.steps.replaceChildren(...(list || []).map((s) => el('li', null, s)));
}

async function loadAnimation(v, ui) {
  const a = v.animation;
  if (a.exercisedb) {
    const loading = el('div', 'anim-loading'); loading.innerHTML = SPINNER; loading.append('Loading animation');
    const skel = el('span', 'tchip skel'); skel.setAttribute('aria-hidden', 'true');
    setAnim(ui, 'loading', [loading], [skel]);
    setSteps(ui, null, 'Loading with the animation');
    try {
      const live = await fetchLive(a.exercisedb);
      const img = await loadGif(live.gifUrl, live.name);
      const chip = el('span', 'anim-chip'); chip.append(el('span', 'dot'), 'Live');
      const targets = (live.targetMuscles || []).map((m) => el('span', 'tchip', cap(m)));
      setAnim(ui, 'live', [img, chip], targets, a.note);
      const list = (Array.isArray(live.instructions) ? live.instructions : []).map((s) => String(s).replace(/^Step:\d+\s*/, ''));
      setSteps(ui, list.length ? list : null, list.length ? `${list.length} step${list.length === 1 ? '' : 's'}, loaded live with the animation` : null);
      return;
    } catch { /* API failure or hang, GIF failure or hang: all fall through to the fallback */ }
  }
  renderFallback(a, ui);
}

// One place draws everything but the live animation: the drawing, the offline pictures, or neither.
// Called when there is no ExerciseDB id, when the API fails and when the GIF fails to load.
function renderFallback(a, ui) {
  setSteps(ui, null, a.exercisedb ? 'Needs the live animation' : null);
  const none = () => {
    const btn = el('button', 'watch-btn'); btn.type = 'button'; btn.append(icon('play', 16, 'fill'), 'Watch the video');
    btn.addEventListener('click', ui.toVideos);
    // With an ExerciseDB id the live animation exists, only the offline picture is missing.
    const title = a.exercisedb ? 'No offline picture for this version' : 'No animation for this version';
    setAnim(ui, 'none', [icon('video', 40), el('span', 'none-title', title), el('span', 'none-sub', 'Watch the video below instead.')], [btn]);
  };
  const pictures = () => {
    const frames = el('div', 'frames');
    // A picture that was never stored offline must not show as a broken image: keep the one that loaded, else no picture.
    let loaded = 2;
    for (const n of [0, 1]) {
      const img = el('img'); img.src = `media/fallback/${a.fallback}/${n}.jpg`; img.alt = n ? 'End position' : 'Start position';
      img.onerror = () => { img.remove(); loaded--; if (loaded === 1) frames.classList.add('single'); else if (ui.box.contains(frames)) none(); };
      frames.append(img);
    }
    const chip = el('span', 'anim-chip'); chip.append(icon('wifiOff', 14), 'Offline picture');
    setAnim(ui, 'offline', [frames, chip], [el('span', 'caption', 'Start and end position')], a.note);
  };
  const media = L.offlineMedia(a);
  // A version no free source has, or one whose live animation could not load, gets a drawing (scripts/draw-animations.mjs):
  // a small SVG that ships with the app. With reduced motion on, the box shows the drawing's still frame instead.
  if (media === 'drawn') {
    const img = el('img'); img.src = L.drawnSrc(a, matchMedia('(prefers-reduced-motion: reduce)').matches); img.alt = 'Drawn animation of the movement';
    img.onerror = () => { if (ui.box.contains(img)) (a.fallback ? pictures() : none()); };
    const chip = el('span', 'anim-chip'); chip.append(icon('pen', 14), 'Drawn');
    // With an ExerciseDB id the note describes the live animation (for example "Animation uses a barbell"), not the drawing.
    setAnim(ui, 'drawn', [img, chip], [el('span', 'caption', 'Drawn for this app')], a.exercisedb ? null : a.note);
    return;
  }
  if (media === 'pictures') pictures(); else none();
}

async function fetchLive(id) {
  if (state.live.has(id)) return state.live.get(id);
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), GIF_TIMEOUT_MS);
  try {
    const res = await fetch(API + id, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(String(res.status));
    const json = await res.json();
    if (!json.success || !json.data?.gifUrl) throw new Error('bad payload');
    state.live.set(id, json.data); // memory only, gone on reload (terms of use, plan F19)
    return json.data;
  } finally { clearTimeout(t); }
}

// Resolves once the GIF has loaded, so "Live" never sits on an empty box. A GIF that arrives after the timeout is ignored: the promise has already settled.
function loadGif(url, alt) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const t = setTimeout(() => reject(new Error('gif timeout')), GIF_TIMEOUT_MS);
    img.onload = () => { clearTimeout(t); resolve(img); };
    img.onerror = () => { clearTimeout(t); reject(new Error('gif failed')); };
    img.alt = alt; img.src = url;
  });
}

main();
