import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
const data = JSON.parse(await readFile(new URL('../data/exercises.json', import.meta.url), 'utf8'));
const BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
const ids = new Set(data.days.flatMap((d) => d.exercises.flatMap((e) => Object.values(e.variants).map((v) => v.animation.fallback).filter(Boolean))));
for (const id of ids) {
  const dir = new URL(`../media/fallback/${id}/`, import.meta.url);
  await mkdir(dir, { recursive: true });
  for (const n of [0, 1]) {
    const target = new URL(`${n}.jpg`, dir);
    try { await access(target); console.log(`have ${id}/${n}.jpg`); continue; } catch {}
    const res = await fetch(`${BASE}${id}/${n}.jpg`);
    if (!res.ok) { console.error(`FAIL ${id}/${n}.jpg ${res.status}`); process.exitCode = 1; continue; }
    await writeFile(target, Buffer.from(await res.arrayBuffer()));
    console.log(`saved ${id}/${n}.jpg`);
  }
}
