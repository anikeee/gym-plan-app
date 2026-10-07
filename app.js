const API = 'https://oss.exercisedb.dev/api/v1/exercises/';
const GIF_TIMEOUT_MS = 6000;
const state = { data: null, live: new Map() }; // live: exerciseId -> API response for this page load only

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
  renderTabs(r.day);
  const day = state.data.days.find((d) => d.id === r.day);
  const ex = r.exercise ? day.exercises.find((e) => e.id === r.exercise) : null;
  const view = document.getElementById('view');
  view.innerHTML = '';
  if (ex) renderExercise(view, day, ex, r.variant); else renderDay(view, day);
  window.scrollTo(0, 0);
}

function renderTabs(active) {
  const nav = document.getElementById('days');
  nav.innerHTML = '';
  for (const d of state.data.days) {
    const a = document.createElement('a');
    a.href = `#/${d.id}`; a.textContent = d.name; a.className = 'tab' + (d.id === active ? ' active' : '');
    a.setAttribute('aria-current', d.id === active ? 'page' : 'false');
    nav.appendChild(a);
  }
}

function restFor(ex) { return state.data.plan.rest[ex.type]; }
function repsText() { return state.data.plan.reps.join(' / '); }

function renderDay(view, day) {
  const h = el('h2', 'day-title', `${day.name} day`);
  const focus = el('p', 'focus', day.focus);
  const list = el('ol', 'list');
  for (const ex of day.exercises) {
    const li = el('li', 'row');
    const a = document.createElement('a');
    a.href = `#/${day.id}/${ex.id}/machine`; a.className = 'row-link';
    a.append(el('span', 'order', String(ex.order)), el('span', 'name', ex.name),
      el('span', 'meta', `${state.data.plan.sets} x ${repsText()} · rest ${restFor(ex)}`));
    li.appendChild(a); list.appendChild(li);
  }
  view.append(h, focus, list);
}

function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

const VARIANT_LABEL = { machine: 'Machine (PureGym)', dumbbell: 'Dumbbells', barbell: 'Barbell (as written)' };

function renderExercise(view, day, ex, variantKey) {
  const keys = Object.keys(ex.variants);
  const key = keys.includes(variantKey) ? variantKey : 'machine';
  const v = ex.variants[key];

  const back = document.createElement('a'); back.href = `#/${day.id}`; back.textContent = `‹ ${day.name} day`; back.className = 'muted';
  const h = el('h2', 'day-title', `${ex.order}. ${ex.name}`);
  const meta = el('p', 'meta', `${state.data.plan.sets} sets x ${repsText()} · rest ${restFor(ex)} (${ex.type})`);

  const seg = el('nav', 'segment');
  for (const k of keys) {
    const a = document.createElement('a'); a.href = `#/${day.id}/${ex.id}/${k}`; a.textContent = VARIANT_LABEL[k];
    a.className = k === key ? 'active' : ''; if (ex.asWritten === k) a.append(el('span', 'badge', 'in plan'));
    seg.appendChild(a);
  }

  const info = el('section', 'card');
  info.append(el('h3', null, v.name), el('p', null, v.kit), el('p', null, v.tip));
  if (v.note) info.append(el('p', 'muted', v.note));
  if (v.guide) { const g = document.createElement('a'); g.href = v.guide; g.target = '_blank'; g.rel = 'noopener'; g.textContent = 'PureGym written guide'; info.append(g); }

  const anim = el('section', 'card'); anim.append(el('h3', null, 'Animation'));
  const box = el('div', 'anim'); anim.append(box);
  const steps = el('div'); anim.append(steps);
  loadAnimation(v, box, steps);

  const vids = el('section', 'card'); vids.append(el('h3', null, 'Videos'));
  for (const vid of v.videos) {
    const a = document.createElement('a'); a.className = 'video'; a.href = `https://www.youtube.com/watch?v=${vid.id}`; a.target = '_blank'; a.rel = 'noopener';
    const img = document.createElement('img'); img.src = `https://i.ytimg.com/vi/${vid.id}/hqdefault.jpg`; img.alt = ''; img.loading = 'lazy'; img.width = 120; img.height = 68;
    const t = el('div'); t.append(el('div', null, vid.label), el('div', 'meta', `${vid.by} · ${vid.seconds === null ? 'Short' : vid.seconds + ' s'}`));
    a.append(img, t); vids.appendChild(a);
  }
  view.append(back, h, meta, seg, info, anim, vids);
}

async function loadAnimation(v, box, steps) {
  const a = v.animation;
  if (a.exercisedb) {
    box.replaceChildren(el('p', 'muted', 'Loading animation...'));
    try {
      const live = await fetchLive(a.exercisedb);
      const img = document.createElement('img');
      // The API can answer while the GIF still fails: a dead GIF, or no signal after an earlier view kept the answer in memory.
      img.onerror = () => renderFallback(a, box, steps);
      img.src = live.gifUrl; img.alt = live.name; img.width = 360; img.height = 360;
      box.replaceChildren(img);
      if (a.note) steps.append(el('p', 'muted', a.note));
      if (Array.isArray(live.instructions) && live.instructions.length) {
        const ol = el('ol', 'steps');
        for (const s of live.instructions) ol.append(el('li', null, s.replace(/^Step:\d+\s*/, '')));
        steps.append(el('p', 'muted', `Target: ${(live.targetMuscles || []).join(', ')}`), ol);
      }
      return;
    } catch { /* fall through to the fallback */ }
  }
  renderFallback(a, box, steps);
}

// One place draws the fallback. Called when the API fails and when a GIF fails to load.
function renderFallback(a, box, steps) {
  if (!a.fallback) {
    box.replaceChildren(el('p', 'muted', 'No animation for this version. Use the video.'));
    steps.replaceChildren();
    return;
  }
  const frames = el('div', 'frames');
  for (const n of [0, 1]) { const img = document.createElement('img'); img.src = `media/fallback/${a.fallback}/${n}.jpg`; img.alt = n ? 'end position' : 'start position'; frames.append(img); }
  box.replaceChildren(frames);
  steps.replaceChildren(el('p', 'muted', a.note || 'Start and end position (offline picture).'));
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

main();
