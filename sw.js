const VERSION = 'gym-v4'; // bump on every data or code change
const FONTS = ['./fonts/barlow-400.woff2', './fonts/barlow-600.woff2', './fonts/barlow-condensed-600.woff2', './fonts/barlow-condensed-700.woff2'];
const SHELL = ['./', './index.html', './styles.css', './app.js', './data/exercises.json', './manifest.webmanifest', './icon.svg', ...FONTS];

// The offline pictures are listed in the data file, so read it here instead of keeping a second list.
async function precacheUrls() {
  const res = await fetch(new Request('./data/exercises.json', { cache: 'reload' }));
  const data = await res.json();
  const ids = new Set(data.days.flatMap((d) => d.exercises.flatMap((e) => Object.values(e.variants).map((v) => v.animation.fallback).filter(Boolean))));
  return [...SHELL, ...[...ids].flatMap((id) => [`./media/fallback/${id}/0.jpg`, `./media/fallback/${id}/1.jpg`])];
}

self.addEventListener('install', (e) => {
  // cache: 'reload' skips the browser HTTP cache, so a version bump never stores a stale copy.
  e.waitUntil(precacheUrls()
    .then((urls) => caches.open(VERSION).then((c) => c.addAll(urls.map((u) => new Request(u, { cache: 'reload' })))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // never touch ExerciseDB, YouTube, GitHub (plan F19)
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
