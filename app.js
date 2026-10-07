const API = 'https://oss.exercisedb.dev/api/v1/exercises/';
const GIF_TIMEOUT_MS = 6000;
const SESSION_LENGTH = '45 min'; // docs/research/anik-workout-plan-1.txt:3
const state = { data: null, live: new Map(), shown: null, refocus: null }; // live: exerciseId -> API response for this page load only

async function main() {
  const res = await fetch('data/exercises.json', { cache: 'no-cache' });
  state.data = await res.json();
  window.addEventListener('hashchange', render);
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const dayIds = state.data.days.map((d) => d.id);
  let day = dayIds.includes(parts[0]) ? parts[0] : (localStorage.getItem('day') || 'push');
  if (!dayIds.includes(day)) day = 'push';
  return { day, exercise: parts[1] || null, variant: parts[2] || null };
}

function render() {
  const r = route();
  localStorage.setItem('day', r.day);
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
  body.append(titles, chips, list);
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
  const sets = el('ol', 'sets'); sets.setAttribute('role', 'list'); sets.setAttribute('aria-label', 'Sets');
  state.data.plan.reps.forEach((reps, i) => {
    const li = el('li', 'set');
    li.append(el('span', 'set-label', `Set ${i + 1}`), el('span', 'set-reps', String(reps)), el('span', 'set-unit', 'reps'));
    sets.append(li);
  });
  setsBlock.append(sets, withIcon(el('p', 'rest'), 'clock', 18, `Rest ${restFor(ex)} between sets`));

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
  // The stage tilts in 3D and casts the shadow. The box inside it clips and holds the lighting (two elements, so Safari clips the corners).
  const stage = el('div', 'stage'); const box = el('div', 'anim'); const foot = el('div', 'anim-foot');
  stage.append(box); animCard.append(stage, foot);
  wireTilt(stage);

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
  view.append(top, head, setsBlock, segBlock, body);
  if (next) {
    const wrap = el('div', 'next-wrap'); const a = link(exerciseHref(day, next), 'next');
    a.append(el('span', null, `Next: ${next.name}`), icon('chevronRight', 22)); wrap.append(a); view.append(wrap);
  }
  if (state.refocus) { seg.querySelector(`[data-variant="${state.refocus}"]`)?.focus(); state.refocus = null; }

  const toVideos = () => {
    watch.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    watchTitle.focus({ preventScroll: true });
  };
  loadAnimation(v, { stage, box, foot, toggle, sub, steps, toVideos });
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
  setLive(ui.stage, name === 'live');
}

// 3D stage for the live animation. The idle sway and the hand tilt add up in one transform (.stage in styles.css), so the box never jumps between them.
const MAX_TILT = 8; // degrees: the largest angle the box ever shows
const calmMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function setLive(stage, live) {
  stage.classList.toggle('is-live', live);
  // An unregistered custom property snaps instead of easing, so the sway needs CSS.registerProperty.
  stage.classList.toggle('sway', live && !calmMotion() && Boolean(window.CSS && CSS.registerProperty));
  if (!live) holdTilt(stage, null);
}

// target null lets go. Otherwise the sway pauses where it is and the tilt makes up the difference, so the sum stays on target.
function holdTilt(stage, target) {
  if (!target) {
    stage.classList.remove('held');
    stage.style.setProperty('--tilt-rx', '0deg'); stage.style.setProperty('--tilt-ry', '0deg');
    return;
  }
  stage.classList.add('held');
  const cs = getComputedStyle(stage);
  const idleX = parseFloat(cs.getPropertyValue('--idle-rx')) || 0;
  const idleY = parseFloat(cs.getPropertyValue('--idle-ry')) || 0;
  stage.style.setProperty('--tilt-rx', `${target.rx - idleX}deg`);
  stage.style.setProperty('--tilt-ry', `${target.ry - idleY}deg`);
}

// A mouse tilts the box by hovering. A finger tilts it by dragging sideways; a vertical drag stays a page scroll (touch-action) and cancels the tilt.
function wireTilt(stage) {
  let start = null;
  const clamp = (n) => Math.max(-1, Math.min(1, n));
  stage.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') start = { x: e.clientX, y: e.clientY }; });
  stage.addEventListener('pointermove', (e) => {
    if (!stage.classList.contains('is-live') || calmMotion()) return;
    let nx; let ny;
    if (e.pointerType === 'touch') {
      if (!start) return;
      nx = clamp((e.clientX - start.x) / 120); ny = clamp((e.clientY - start.y) / 120);
    } else {
      const r = stage.getBoundingClientRect();
      nx = clamp(((e.clientX - r.left) / r.width) * 2 - 1); ny = clamp(((e.clientY - r.top) / r.height) * 2 - 1);
    }
    holdTilt(stage, { rx: -ny * MAX_TILT, ry: nx * MAX_TILT });
  });
  const release = () => { start = null; holdTilt(stage, null); };
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) stage.addEventListener(type, release);
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
