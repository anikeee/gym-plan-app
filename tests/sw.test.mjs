import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Runs the real sw.js in a sandbox: the files come from this repo, served as if from the Pages site. A test can make
// some of them 404 (a bad push) or fail with a network error (weak signal), and can switch the network off.
const ROOT = new URL('../', import.meta.url);
const BASE = 'https://example.test/gym-plan-app/';
const source = await readFile(new URL('sw.js', ROOT), 'utf8');
const version = source.match(/const VERSION = '([^']+)'/)[1];
const json = async (f) => JSON.parse(await readFile(new URL(f, ROOT), 'utf8'));
const data = await json('data/exercises.json'), library = (await json('data/library.json')).exercises;
const drawnStems = [...new Set([...data.plans.flatMap((p) => p.days.flatMap((d) => d.exercises)), ...library].flatMap((e) => Object.values(e.variants).map((v) => v.animation.drawn).filter(Boolean)))];

function worker({ missing = [], failing = [] } = {}) {
  const stores = new Map();
  const listeners = {};
  const net = { offline: false, failing: new Set(failing) };
  // Node's Request rejects relative URLs; a worker resolves them against its own location.
  class SwRequest extends Request { constructor(u, o) { super(new URL(typeof u === 'string' ? u : u.url, BASE), o); } }
  const fetch = async (req) => {
    const url = new URL(typeof req === 'string' ? req : req.url, BASE);
    const path = decodeURIComponent(url.pathname.slice(new URL(BASE).pathname.length)) || 'index.html';
    if (net.offline || net.failing.has(path)) throw new TypeError(`network error for ${path}`);
    if (missing.includes(path)) return new Response('not found', { status: 404 });
    // The drawings answer a little later than the rest, so an install that stops waiting for them is caught.
    if (path.startsWith('media/drawn/')) await new Promise((r) => setTimeout(r, 30));
    try { return new Response(await readFile(new URL(path, ROOT)), { status: 200 }); } catch { return new Response('not found', { status: 404 }); }
  };
  const key = (r) => new URL(typeof r === 'string' ? r : r.url, BASE).href;
  const cache = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    const getOk = async (r) => { const res = await fetch(r); if (!res.ok) throw new TypeError(`${res.status} ${key(r)}`); return res; };
    return {
      add: async (r) => { m.set(key(r), await getOk(r)); },
      addAll: async (rs) => { const got = await Promise.all(rs.map(async (r) => [key(r), await getOk(r)])); for (const [k, v] of got) m.set(k, v); },
      put: async (r, res) => { m.set(key(r), res); },
      match: async (r) => m.get(key(r))?.clone(),
      keys: async () => [...m.keys()],
    };
  };
  // Opening a cache takes a moment in a browser, as it does here, so a response handed to the page is read before the worker gets back to it.
  const caches = { open: async (n) => { await new Promise((r) => setTimeout(r, 5)); return cache(n); }, keys: async () => [...stores.keys()], delete: async (n) => stores.delete(n), match: async (r) => { for (const n of stores.keys()) { const hit = await cache(n).match(r); if (hit) return hit; } } };
  const self = { addEventListener: (t, f) => { listeners[t] = f; }, skipWaiting: async () => {}, clients: { claim: async () => {} }, location: new URL('sw.js', BASE) };
  vm.runInNewContext(source, { self, caches, fetch, Request: SwRequest, Response, URL, Promise, Set, Map, console });
  return {
    net,
    install: async () => { let done; listeners.install({ waitUntil: (p) => { done = p; } }); await done; },
    // A page request through the worker's fetch handler. Like a browser, the page reads the body straight away.
    get: async (path) => {
      let answer;
      const waits = [];
      listeners.fetch({ request: new SwRequest(path), respondWith: (p) => { answer = p; }, waitUntil: (p) => waits.push(p) });
      const res = await answer;
      const body = await res.text();
      await Promise.all(waits); await new Promise((r) => setTimeout(r, 20)); // let a cache write that follows the response finish
      return { status: res.status, body };
    },
    cached: async (name) => (stores.has(name) ? [...stores.get(name).keys()].map((k) => k.slice(BASE.length)) : []),
  };
}

test('the service worker caches the app shell and every drawing from every plan and the library', async () => {
  const sw = worker(); await sw.install();
  const files = await sw.cached(version);
  for (const f of ['index.html', 'app.js', 'log.js', 'data/library.json']) assert.ok(files.includes(f), f);
  assert.ok(drawnStems.length >= 7);
  for (const d of drawnStems) for (const f of [`media/drawn/${d}.svg`, `media/drawn/${d}-still.svg`]) assert.ok(files.includes(f), f);
});

test('a missing drawing costs only that drawing, not the whole install', async () => {
  const sw = worker({ missing: ['media/drawn/landmine-squat.svg'] }); await sw.install();
  const files = await sw.cached(version);
  assert.ok(files.includes('app.js'), 'the shell is cached');
  assert.ok(!files.includes('media/drawn/landmine-squat.svg'));
  assert.ok(files.includes('media/drawn/landmine-chest-press.svg'), 'the other drawings are still cached');
});

test('a drawing the install could not fetch is kept the first time it is viewed, so it works offline after', async () => {
  const sw = worker({ failing: ['media/drawn/dumbbell-leg-curl.svg'] }); await sw.install();
  assert.ok(!(await sw.cached(version)).includes('media/drawn/dumbbell-leg-curl.svg'));
  sw.net.failing.clear();
  assert.equal((await sw.get('media/drawn/dumbbell-leg-curl.svg')).status, 200, 'online, it loads');
  sw.net.offline = true;
  assert.equal((await sw.get('media/drawn/dumbbell-leg-curl.svg')).status, 200, 'offline, it comes from the cache');
});

test('a missing app file still fails the install, so a phone never runs half an app', async () => {
  await assert.rejects(worker({ missing: ['app.js'] }).install());
});
