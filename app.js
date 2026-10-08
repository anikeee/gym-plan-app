import * as L from './log.js';

const API = 'https://oss.exercisedb.dev/api/v1/exercises/';
const GIF_TIMEOUT_MS = 6000;
const SESSION_LENGTH = '45 min'; // docs/research/anik-workout-plan-1.txt:3
const state = { data: null, live: new Map(), shown: null, refocus: null, log: null, logOk: true, day: null }; // live: exerciseId -> API response for this page load only
const LATEST_APK = 'https://github.com/anikeee/gym-plan-app/releases/latest/download/workout-plan.apk';
const SAVE_FAILED = "Couldn't save on this phone. Storage may be full or blocked.";
// Reading the localStorage global itself throws when site data is blocked, so read it once here. The log
// functions treat null as blocked storage, which lets the page still render and show why nothing saves.
const store = (() => { try { return window.localStorage; } catch { return null; } })();

async function main() {
  const res = await fetch('data/exercises.json', { cache: 'no-cache' });
  state.data = await res.json();
  state.log = L.emptyLog();
  freshLog();
  state.day = L.sessionDay();
  // A reload or an Android restore can leave the set sheet's history entry behind. Step back off it, so the
  // next back press leaves the exercise. Same URL below it, so only popstate fires, and it finds no open sheet.
  if (history.state?.sheet) history.back();
  window.addEventListener('hashchange', render);
  // The phone's back button closes the set sheet instead of leaving the exercise (see openSheet).
  window.addEventListener('popstate', () => document.querySelector('dialog.sheet[open]')?.close());
  // Another tab saved or cleared a set (key null means storage was cleared): show it here too.
  window.addEventListener('storage', (e) => {
    if (e.key !== L.STORE_KEY && e.key !== null) return;
    freshLog();
    state.repaintSets?.();
    if (state.logCard?.status.isConnected) state.logCard.paint();
  });
  // Left open overnight: after 4 am the boxes must show a new session.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && L.sessionDay() !== state.day) {
      state.day = L.sessionDay();
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
}

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const dayIds = state.data.days.map((d) => d.id);
  let saved = null;
  try { saved = store.getItem('day'); } catch { /* blocked storage: start on push */ }
  let day = dayIds.includes(parts[0]) ? parts[0] : (saved || 'push');
  if (!dayIds.includes(day)) day = 'push';
  return { day, exercise: parts[1] || null, variant: parts[2] || null };
}

function render() {
  const r = route();
  try { store.setItem('day', r.day); } catch { /* blocked storage: the day is only remembered in the URL */ }
  const day = state.data.days.find((d) => d.id === r.day);
  const ex = r.exercise ? day.exercises.find((e) => e.id === r.exercise) : null;
  const view = document.getElementById('view');
  view.replaceChildren();
  if (ex) renderExercise(view, day, ex, r.variant); else renderDay(view, day);
  // A version switch keeps the scroll position. A new day or exercise starts at the top.
  const shown = `${day.id}/${ex ? ex.id : ''}`;
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
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  external: '<path d="M14 5h5v5"/><path d="M19 5l-8 8"/><path d="M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4"/>',
  wifiOff: '<path d="M2 8.5a15 15 0 0 1 20 0"/><path d="M5.5 12a10 10 0 0 1 13 0"/><path d="M9 15.5a5 5 0 0 1 6 0"/><path d="M3 3l18 18"/>',
  video: '<rect x="3" y="5" width="14" height="14" rx="3"/><path d="M17 10l4-2v8l-4-2"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  up: '<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
};
const SPINNER = '<svg class="spinner" width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true"><circle cx="22" cy="22" r="18" stroke="#E3E6EA" stroke-width="5"/><path d="M22 4a18 18 0 0 1 18 18" stroke="#0E0F12" stroke-width="5" stroke-linecap="round"/></svg>';

function icon(name, size, cls) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', cls ? `i ${cls}` : 'i');
  s.innerHTML = ICONS[name]; // constant markup only, API text always goes in through textContent
  return s;
}

function restFor(ex) { return state.data.plan.rest[ex.type].replace(/ sec$/, ' s'); }
// "Chest / Shoulders / Triceps" reads as "Chest, shoulders and triceps".
function focusText(focus) {
  const p = focus.split(' / ').map((w, i) => (i ? w.toLowerCase() : w));
  return p.length < 2 ? p[0] : `${p.slice(0, -1).join(', ')} and ${p[p.length - 1]}`;
}
function duration(s) { return s === null ? 'Short' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
// Opens on the version the trainer wrote, or the machine when the plan names neither (asWritten "other").
function defaultVariant(ex) { return ex.variants[ex.asWritten] ? ex.asWritten : 'machine'; }
function exerciseHref(day, ex) { return `#/${day.id}/${ex.id}/${defaultVariant(ex)}`; }
// Card picture: frame 0 of the as written version, or of the machine version when that has no picture.
function thumbFor(ex) {
  const v = ex.variants[ex.asWritten]?.animation.fallback ? ex.variants[ex.asWritten] : ex.variants.machine;
  return v.animation.fallback ? `media/fallback/${v.animation.fallback}/0.jpg` : null;
}

function renderDay(view, day) {
  const head = el('header', 'dayhead');
  const row = el('div', 'dayhead-row');
  row.append(el('p', 'eyebrow', 'Workout plan #1'), withIcon(el('p', 'duration'), 'clock', 15, SESSION_LENGTH));
  const nav = el('nav', 'seg'); nav.setAttribute('aria-label', 'Training day');
  for (const d of state.data.days) {
    const a = link(`#/${d.id}`, 'seg-btn', d.name);
    if (d.id === day.id) a.setAttribute('aria-current', 'page');
    nav.append(a);
  }
  head.append(row, nav);

  const body = el('section', 'day');
  const titles = el('div', 'day-titles');
  titles.append(el('h1', 'title-xl', `${day.name} day`), el('p', 'focus', focusText(day.focus)));
  const chips = el('div', 'chips');
  chips.append(el('span', 'chip', `${day.exercises.length} exercises`), el('span', 'chip', `${state.data.plan.sets} sets: ${state.data.plan.reps.join(', ')}`));
  const list = el('ol', 'ex-list'); list.setAttribute('role', 'list'); // Safari drops list semantics when list-style is none
  for (const ex of day.exercises) {
    const a = link(exerciseHref(day, ex), 'ex-card');
    const src = thumbFor(ex);
    let thumb = el('span', 'ex-thumb');
    if (src) { thumb = el('img', 'ex-thumb'); thumb.src = src; thumb.alt = ''; thumb.width = 64; thumb.height = 64; }
    const text = el('span', 'ex-text');
    text.append(el('span', `tag is-${ex.type}`, `${String(ex.order).padStart(2, '0')} · ${cap(ex.type)}`), el('span', 'ex-name', ex.name),
      withIcon(el('span', 'ex-rest'), 'clock', 14, `Rest ${restFor(ex)}`));
    a.append(thumb, text, icon('chevronRight', 20, 'chev'));
    const li = el('li'); li.append(a); list.append(li);
  }
  body.append(titles, chips, list, buildLogCard());
  view.append(head, body);
}

const VARIANT_LABEL = { machine: 'Machine', dumbbell: 'Dumbbells', barbell: 'Barbell' };

function renderExercise(view, day, ex, variantKey) {
  const keys = Object.keys(ex.variants);
  const key = keys.includes(variantKey) ? variantKey : defaultVariant(ex);
  const v = ex.variants[key];
  const next = day.exercises[day.exercises.indexOf(ex) + 1];

  const top = el('div', 'topbar');
  const back = link(`#/${day.id}`, 'back'); back.setAttribute('aria-label', `Back to ${day.name} day`);
  back.append(icon('chevronLeft', 20), `${day.name} day`);
  top.append(back, el('span', 'count', `${ex.order} of ${day.exercises.length}`));

  const head = el('div', 'ex-head');
  head.append(el('p', 'eyebrow', cap(ex.type)), el('h1', 'title-lg', ex.name));

  const setsBlock = el('div', 'sets-block');
  const setLog = buildSetLog(ex, key);
  setsBlock.append(setLog.lastLine, setLog.list, withIcon(el('p', 'rest'), 'clock', 18, `Rest ${restFor(ex)} between sets`));

  // Buttons, not links: switching version replaces the hash so the back button still goes to the day.
  const seg = el('div', `seg seg-versions${keys.length > 2 ? ' three' : ''}`); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Version');
  for (const k of keys) {
    const b = el('button', 'seg-btn', VARIANT_LABEL[k] || cap(k)); b.type = 'button'; b.dataset.variant = k;
    b.setAttribute('aria-pressed', String(k === key));
    if (ex.asWritten === k) b.append(el('span', 'pill', 'In plan'));
    b.addEventListener('click', () => { if (k !== key) { state.refocus = k; location.replace(`#/${day.id}/${ex.id}/${k}`); } });
    seg.append(b);
  }
  const segBlock = el('div', 'version-block'); segBlock.append(seg);

  const animCard = el('section', 'card anim-card'); animCard.setAttribute('aria-label', 'Animation');
  const box = el('div', 'anim'); const foot = el('div', 'anim-foot');
  animCard.append(box, foot);

  const toggle = el('button', 'steps-toggle'); toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', 'steps');
  const sub = el('span', 'steps-sub'); const toggleText = el('span', 'steps-text');
  toggleText.append(el('span', 'steps-title', 'Step by step'), sub);
  toggle.append(toggleText, icon('chevronDown', 20));
  const steps = el('ol', 'steps'); steps.id = 'steps'; steps.hidden = true; steps.setAttribute('role', 'list');
  toggle.addEventListener('click', () => { const open = steps.hidden; steps.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); });

  const setup = el('section', 'card setup'); setup.setAttribute('aria-label', 'Setup');
  setup.append(el('h2', 'setup-name', v.name), setupRow('pin', 'Find it', v.kit), el('div', 'divider'), setupRow('target', 'Form cue', v.tip));
  if (v.note) setup.append(el('div', 'divider'), setupRow('info', 'Note', v.note));
  if (v.guide) {
    const g = link(v.guide, 'guide', 'PureGym written guide'); g.target = '_blank'; g.rel = 'noopener';
    g.append(icon('external', 18)); setup.append(g);
  }

  const watch = el('section', 'watch'); watch.setAttribute('aria-labelledby', 'watch');
  const watchHead = el('div', 'watch-head'); const watchTitle = el('h2', null, 'Watch'); watchTitle.id = 'watch'; watchTitle.tabIndex = -1;
  watchHead.append(watchTitle, el('span', null, 'Opens in YouTube'));
  watch.append(watchHead);
  for (const vid of v.videos) {
    const a = link(`https://www.youtube.com/watch?v=${vid.id}`, 'video'); a.target = '_blank'; a.rel = 'noopener';
    const thumb = el('span', 'video-thumb');
    const img = el('img'); img.src = `https://i.ytimg.com/vi/${vid.id}/hqdefault.jpg`; img.alt = ''; img.loading = 'lazy'; img.width = 128; img.height = 72;
    img.onerror = () => img.remove(); // no signal: keep the plain tile with the play button
    const play = el('span', 'play'); play.append(icon('play', 16, 'fill'));
    thumb.append(img, play, el('span', 'dur', duration(vid.seconds)));
    const text = el('span', 'video-text'); text.append(el('span', 'video-label', vid.label), el('span', 'video-by', vid.by));
    a.append(thumb, text); watch.append(a);
  }

  const body = el('div', 'variant');
  body.append(animCard, toggle, steps, setup, watch);
  view.append(top, head, segBlock, setsBlock, body, setLog.sheet);
  if (next) {
    const wrap = el('div', 'next-wrap'); const a = link(exerciseHref(day, next), 'next');
    a.append(el('span', null, `Next: ${next.name}`), icon('chevronRight', 22)); wrap.append(a); view.append(wrap);
  }
  if (state.refocus) { seg.querySelector(`[data-variant="${state.refocus}"]`)?.focus(); state.refocus = null; }

  const toVideos = () => {
    watch.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    watchTitle.focus({ preventScroll: true });
  };
  loadAnimation(v, { box, foot, toggle, sub, steps, toVideos });
}

// Weight log for one exercise version: the "Last time" line, the set boxes, and the sheet that logs a set.
// Saving repaints only the tapped box. It never calls render(), which would restart the animation and refetch it on weak signal.
function buildSetLog(ex, variantKey) {
  const targets = state.data.plan.reps;
  const logKey = L.entryKey(ex.name, variantKey);
  const today = state.day;
  const step = L.stepFor(variantKey);
  const versionName = VARIANT_LABEL[variantKey] || cap(variantKey);
  const lastLine = el('div', 'last');
  let g; // the guide: last session, nudge and suggested weights. Rebuilt only when earlier days change (another tab).
  function paintLast() {
    g = L.guide(state.log, logKey, today, targets, step);
    lastLine.replaceChildren();
    lastLine.hidden = !g.last;
    if (!g.last) return;
    const head = el('p', 'last-head'); head.append(el('span', null, `Last time · ${L.formatDay(g.last.date)}`), el('span', 'last-unit', 'kg × reps'));
    const cells = el('p', 'last-sets');
    targets.forEach((t, i) => { const s = g.last.sets[i]; cells.append(el('span', null, s ? `${L.formatWeight(s.w)}×${s.r}` : 'skipped')); });
    lastLine.append(head, cells);
    if (g.allHit) lastLine.append(withIcon(el('p', 'last-nudge'), 'up', 16, 'You hit every rep. Go up a step today.'));
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
    let say;
    if (done) {
      const w = L.formatWeight(done.w);
      hint.classList.add('is-done'); hint.append(icon('check', 14), w);
      if (done.r !== t) hint.append(el('span', null, `×${done.r}`)); // its own item, so it can wrap under the weight on a narrow phone
      say = `done, ${w} kilograms${done.r === t ? '' : `, ${done.r} reps`}`;
    } else if (s) {
      const w = L.formatWeight(s.w);
      if (s.up) { hint.classList.add('is-up'); hint.append(icon('up', 14), w); say = `try ${w} kilograms, up from last time`; }
      else { hint.append(w); say = `last time ${w} kilograms`; }
    } else { hint.append('Add kg'); say = 'not logged yet'; }
    const b = buttons[i];
    b.classList.toggle('done', Boolean(done));
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
  const wLabel = el('label', 'sheet-label', 'Weight'); wLabel.htmlFor = 'sheet-weight';
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
  const save = el('button', 'sheet-save', 'Save'); save.type = 'button'; save.autofocus = true;
  const actions = el('div', 'sheet-actions'); actions.append(cancel, save);
  sheet.append(head, context, wLabel, wRow, rLabel, rRow, status, actions);

  let current = 0;
  let reps = 0;
  const setReps = (n) => { reps = Math.max(0, Math.min(50, n)); rValue.value = String(reps); };
  // The newest earlier session that logged this set, for the line at the top of the sheet.
  const lastFor = (i) => {
    const prior = L.entriesFor(state.log, logKey).filter((e) => e.date < today);
    for (let k = prior.length - 1; k >= 0; k--) if (prior[k].sets[i]) return { date: prior[k].date, ...prior[k].sets[i] };
    return null;
  };
  function openSheet(i) {
    current = i;
    const t = targets[i];
    const done = L.todayEntry(state.log, logKey, today)?.sets[i];
    const w = L.prefill(state.log, logKey, today, i, g.suggestions);
    title.textContent = `Set ${i + 1} · ${t} reps`;
    wInput.value = w == null ? '' : L.formatWeight(w);
    setReps(done ? done.r : t);
    clear.hidden = !done;
    status.textContent = '';
    const last = lastFor(i);
    const s = g.suggestions[i];
    if (!last) context.textContent = `No earlier ${versionName.toLowerCase()} sets yet. Log today's weight and it will show here next time.`;
    else {
      const lw = L.formatWeight(last.w);
      let text = `Last time, ${L.formatDay(last.date)}: ${lw} kg × ${last.r} of ${t}.`;
      if (s?.up) text += ` You hit every rep, so try ${L.formatWeight(s.w)} kg.`;
      else if (last.r < t) text += ` Stay at ${lw} kg until you hit ${t}.`;
      else text += ' Hit every rep on all 4 sets to go up a step.';
      context.textContent = text;
    }
    sheet.showModal();
    history.pushState({ sheet: 1 }, ''); // back closes the sheet (popstate in main)
  }
  // Saves one set (slot) or clears it (null), starting from the stored log. False when nothing could be saved.
  const persist = (slot) => {
    const cur = freshLog();
    const next = cur && L.setSlot(cur, logKey, today, current, slot, targets.length);
    if (!next || !L.saveLog(store, next)) { status.textContent = SAVE_FAILED; return false; }
    state.log = next;
    return true;
  };
  function doSave() {
    const w = L.parseWeight(wInput.value);
    if (w == null) { status.textContent = 'Enter the weight in kg, for example 32.5.'; wInput.focus(); return; }
    if (!persist({ w, r: reps })) return;
    paintSet(current);
    sheet.close();
  }
  const bump = (dir) => {
    const w = L.parseWeight(wInput.value);
    if (w == null) { wInput.focus(); return; } // nothing to step from yet: type the first weight
    const next = L.roundWeight(w + dir * step);
    if (next > 0 && next <= 500) wInput.value = L.formatWeight(next);
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
  if (!r.ok) return null;
  state.log = r.log;
  return state.log;
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

function buildLogCard() {
  const card = el('section', 'card log-card'); card.setAttribute('aria-labelledby', 'log-title');
  const h = el('h2', 'log-title', 'Your weight log'); h.id = 'log-title';
  const count = el('p', 'log-count');
  const backup = el('p', 'log-backup');
  const status = el('p', 'log-status'); status.setAttribute('role', 'status');
  const paint = () => {
    const n = L.countSessions(freshLog() ?? state.log);
    count.textContent = !state.logOk ? "This phone isn't letting the app save. Check that site storage is allowed."
      : n ? `${n} ${n === 1 ? 'session' : 'sessions'} saved on this phone.` : 'Nothing logged yet. Tap a set on any exercise to log its weight.';
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
    if (f) { await importBackup(f, status); paint(); }
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

function exportBackup(status) {
  const log = freshLog();
  if (!log) { say(status, "Couldn't read the log on this phone, so nothing was exported.", true); return; }
  const now = new Date();
  const text = JSON.stringify(L.exportPayload(log, now)); // compact: about the size of the stored log, far below the import cap
  const name = L.exportFileName(now);
  const bridge = window.WorkoutPlanApp;
  if (bridge && typeof bridge.saveFile === 'function') {
    bridge.saveFile(name, text); // the app answers with a workoutplan:backup event once the file is written or not
    say(status, 'Choose where to save the backup.');
    return;
  }
  if (inAppWebView()) { say(status, "This app can't save files. Update it, or open the site in Chrome to back up.", true); return; }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = link(url, null); a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  backupFinished(true, 'Backup downloaded. Keep the file somewhere safe, like Google Drive.');
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

async function importBackup(f, status) {
  if (f.size > L.MAX_IMPORT_BYTES) { say(status, 'That file is too big to be a workout log backup.', true); return; }
  let obj;
  try { obj = JSON.parse(await f.text()); } catch { say(status, "That file isn't a workout log backup.", true); return; }
  const checked = L.validateBackup(obj);
  if (!checked.ok) { say(status, "That file isn't a workout log backup from this app, so nothing changed.", true); return; }
  const cur = freshLog();
  if (!cur) { say(status, SAVE_FAILED, true); return; }
  const { log, added, filled } = L.mergeLogs(cur, checked.log);
  if (!L.saveLog(store, log)) { say(status, SAVE_FAILED, true); return; }
  state.log = log;
  say(status, added ? `Backup restored: ${added} new ${added === 1 ? 'session' : 'sessions'} added.`
    : filled ? `Backup restored: ${filled} missing ${filled === 1 ? 'set' : 'sets'} filled in.`
      : 'Backup restored. Everything in it was already on this phone.');
}

function setupRow(iconName, label, text) {
  const row = el('div', 'setup-row');
  const tile = el('span', 'setup-icon'); tile.append(icon(iconName, 18));
  const t = el('div', 'setup-text'); t.append(el('span', 'label', label), el('p', null, text));
  row.append(tile, t);
  return row;
}

// The animation card has four states (loading, live, offline, none). Each one redraws the box, the row under it and the steps toggle, so nothing from an earlier state survives.
function setAnim(ui, name, boxKids, footKids) {
  ui.box.dataset.state = name;
  ui.box.replaceChildren(...boxKids);
  ui.foot.replaceChildren(...footKids);
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
    setAnim(ui, 'loading', [loading], [el('span', 'foot-label', 'Targets'), skel]);
    setSteps(ui, null, 'Loading with the animation');
    try {
      const live = await fetchLive(a.exercisedb);
      const img = await loadGif(live.gifUrl, live.name);
      const chip = el('span', 'anim-chip'); chip.append(el('span', 'dot'), 'Live');
      const targets = (live.targetMuscles || []).map((m) => el('span', 'tchip', cap(m)));
      const foot = targets.length ? [el('span', 'foot-label', 'Targets'), ...targets] : [];
      if (a.note) foot.push(el('p', 'anim-note', a.note));
      setAnim(ui, 'live', [img, chip], foot);
      const list = (Array.isArray(live.instructions) ? live.instructions : []).map((s) => String(s).replace(/^Step:\d+\s*/, ''));
      setSteps(ui, list.length ? list : null, list.length ? `${list.length} step${list.length === 1 ? '' : 's'}, loaded live with the animation` : null);
      return;
    } catch { /* API failure or hang, GIF failure or hang: all fall through to the fallback */ }
  }
  renderFallback(a, ui);
}

// One place draws the fallback. Called when the API fails and when the GIF fails to load.
function renderFallback(a, ui) {
  setSteps(ui, null, a.exercisedb ? 'Needs the live animation' : null);
  if (!a.fallback) {
    const btn = el('button', 'watch-btn'); btn.type = 'button'; btn.append(icon('play', 16, 'fill'), 'Watch the video');
    btn.addEventListener('click', ui.toVideos);
    // With an ExerciseDB id the live animation exists, only the offline picture is missing.
    const title = a.exercisedb ? 'No offline picture for this version' : 'No animation for this version';
    setAnim(ui, 'none', [icon('video', 40), el('span', 'none-title', title), el('span', 'none-sub', 'Watch the video below instead.')], [btn]);
    return;
  }
  const frames = el('div', 'frames');
  for (const n of [0, 1]) { const img = el('img'); img.src = `media/fallback/${a.fallback}/${n}.jpg`; img.alt = n ? 'End position' : 'Start position'; frames.append(img); }
  const chip = el('span', 'anim-chip'); chip.append(icon('wifiOff', 14), 'Offline picture');
  const foot = [el('span', 'caption', 'Start and end position')];
  if (a.note) foot.push(el('p', 'anim-note', a.note));
  setAnim(ui, 'offline', [frames, chip], foot);
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
