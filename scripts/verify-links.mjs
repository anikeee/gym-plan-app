import { readFile } from 'node:fs/promises';
const data = JSON.parse(await readFile(new URL('../data/exercises.json', import.meta.url), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = { 'User-Agent': 'gym-plan-app verify script' };
let failures = 0;
const row = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures++; };

const variants = data.days.flatMap((d) => d.exercises.flatMap((e) => Object.entries(e.variants).map(([k, v]) => [`${e.id}.${k}`, v])));

// 1. YouTube: oEmbed answers 200 for public videos.
const seen = new Set();
for (const [where, v] of variants) for (const vid of v.videos) {
  if (seen.has(vid.id)) continue; seen.add(vid.id);
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${vid.id}`)}&format=json`;
  const res = await fetch(url, { headers: UA });
  row(res.ok, `youtube ${vid.id} ${res.status} (${where})`);
  await sleep(150);
}

// 2. ExerciseDB GIFs: HEAD on the static host. Spaced out because the API family rate limits (plan F18).
for (const [where, v] of variants) {
  const id = v.animation.exercisedb; if (!id) continue;
  const res = await fetch(`https://static.exercisedb.dev/media/${id}.gif`, { method: 'HEAD', headers: UA });
  row(res.ok && (res.headers.get('content-type') || '').includes('image/gif'), `exercisedb ${id} ${res.status} (${where})`);
  await sleep(1000);
}

// 3. Fallback images in the repo.
for (const [where, v] of variants) {
  const id = v.animation.fallback; if (!id) continue;
  for (const n of [0, 1]) {
    try { await readFile(new URL(`../media/fallback/${id}/${n}.jpg`, import.meta.url)); row(true, `fallback ${id}/${n}.jpg (${where})`); }
    catch { row(false, `fallback ${id}/${n}.jpg missing, run npm run fetch-fallback (${where})`); }
  }
}

console.log(failures ? `\n${failures} failure(s)` : '\nall links ok');
process.exit(failures ? 1 : 0);
