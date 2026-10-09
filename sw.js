const VERSION = 'gym-v10'; // bump on every data or code change
const MEDIA = 'gym-media-v1'; // offline pictures: a path never changes its picture, so they outlive app updates
const FONTS = ['./fonts/barlow-400.woff2', './fonts/barlow-600.woff2', './fonts/barlow-condensed-600.woff2', './fonts/barlow-condensed-700.woff2'];
const SHELL = ['./', './index.html', './styles.css', './app.js', './log.js', './data/exercises.json', './manifest.webmanifest', './icon.svg', ...FONTS];

// The offline pictures are listed in the data file, so read it here instead of keeping a second list.
// Only the default plan's (the personal trainer's) come with the app: every plan's would double the first download.
// Another plan's are fetched by the page when it is picked, and the fetch handler keeps each one.
async function precache() {
  const res = await fetch(new Request('./data/exercises.json', { cache: 'reload' }));
  const data = await res.json();
  // cache: 'reload' skips the browser HTTP cache, so a version bump never stores a stale copy.
  await (await caches.open(VERSION)).addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })));
  const ids = new Set(data.plans[0].days.flatMap((d) => d.exercises.flatMap((e) => Object.values(e.variants).map((v) => v.animation.fallback).filter(Boolean))));
  const media = await caches.open(MEDIA);
  const urls = [...ids].flatMap((id) => [`./media/fallback/${id}/0.jpg`, `./media/fallback/${id}/1.jpg`]);
  const missing = [];
  for (const u of urls) if (!(await media.match(u))) missing.push(new Request(u, { cache: 'reload' }));
  await media.addAll(missing);
}

self.addEventListener('install', (e) => {
  e.waitUntil(precache().then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== MEDIA).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // never touch ExerciseDB, YouTube, GitHub (plan F19)
  if (url.pathname.includes('/media/fallback/')) { // our own public domain pictures: keep each one the first time it loads
    e.respondWith(caches.open(MEDIA).then((c) => c.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }))));
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
