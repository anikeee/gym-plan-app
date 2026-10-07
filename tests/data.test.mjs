import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const data = JSON.parse(await readFile(new URL('../data/exercises.json', import.meta.url), 'utf8'));

const PDF_NAMES = {
  push: ['Incline Chest Press Machine', 'Dumbbell Pullover', 'Lateral Raise', 'Chest Press Machine', 'Cable Chest Fly', 'Tricep Pushdown', 'Overhead Dumbbell Tricep Extension'],
  pull: ['Lat Pulldown', 'Straight Arm Pulldown', 'Seated Cable Row', 'Diverging Chest Supported Row', 'Face Pull', 'Barbell Curl', 'Hammer Curl'],
  legs: ['Perfect Squat', 'Romanian Deadlift', 'Leg Press', 'Back Lunges', 'Leg Curl', 'Leg Extension', 'Standing Calf Raise'],
};
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const EXDB_ID = /^[A-Za-z0-9]{7}$/;
const FEDB_ID = /^[A-Za-z0-9_()-]+$/;
const ALLOWED_NO_ANIMATION = new Set(['legs-6.dumbbell']);
const ALLOWED_NO_FALLBACK = new Set(['legs-5.dumbbell', 'legs-6.dumbbell']);

test('plan header matches the PDF', () => {
  assert.equal(data.plan.sets, 4);
  assert.deepEqual(data.plan.reps, [12, 10, 10, 8]);
  assert.ok(data.plan.rest.compound && data.plan.rest.isolation);
});

test('three days with seven exercises each, names and order exactly as the PDF', () => {
  assert.deepEqual(data.days.map((d) => d.id), ['push', 'pull', 'legs']);
  for (const day of data.days) {
    assert.equal(day.exercises.length, 7, day.id);
    assert.deepEqual(day.exercises.map((e) => e.order), [1, 2, 3, 4, 5, 6, 7], day.id);
    assert.deepEqual(day.exercises.map((e) => e.name), PDF_NAMES[day.id], day.id);
    day.exercises.forEach((e) => assert.equal(e.id, `${day.id}-${e.order}`));
  }
});

test('every exercise has machine and dumbbell variants with complete fields', () => {
  for (const day of data.days) for (const ex of day.exercises) {
    assert.ok(['compound', 'isolation'].includes(ex.type), ex.id);
    assert.ok(['machine', 'dumbbell', 'barbell', 'other'].includes(ex.asWritten), ex.id);
    assert.ok(ex.variants.machine && ex.variants.dumbbell, ex.id);
    for (const [key, v] of Object.entries(ex.variants)) {
      const where = `${ex.id}.${key}`;
      assert.ok(['machine', 'dumbbell', 'barbell'].includes(key), where);
      for (const f of ['name', 'kit', 'tip']) assert.ok(typeof v[f] === 'string' && v[f].length > 10, `${where}.${f}`);
      assert.ok(Array.isArray(v.videos) && v.videos.length >= 1, where);
      const ids = new Set();
      for (const vid of v.videos) {
        assert.match(vid.id, YT_ID, where);
        assert.ok(!ids.has(vid.id), `${where} duplicate video ${vid.id}`); ids.add(vid.id);
        assert.ok(vid.label && vid.by, where);
        assert.ok(vid.seconds === null || Number.isInteger(vid.seconds), where);
      }
      const a = v.animation;
      assert.ok(a && 'exercisedb' in a && 'fallback' in a && 'note' in a, where);
      if (a.exercisedb !== null) assert.match(a.exercisedb, EXDB_ID, where);
      if (a.fallback !== null) assert.match(a.fallback, FEDB_ID, where);
      if (a.exercisedb === null && a.fallback === null) assert.ok(ALLOWED_NO_ANIMATION.has(where), `${where} has no animation`);
      if (a.fallback === null) assert.ok(ALLOWED_NO_FALLBACK.has(where), `${where} has no fallback`);
      assert.ok(v.guide === null || v.guide.startsWith('https://www.puregym.com/'), where);
    }
    if (ex.asWritten !== 'other') assert.ok(ex.variants[ex.asWritten], `${ex.id} asWritten points at a missing variant`);
  }
});

test('only Barbell Curl has a barbell variant', () => {
  const withBarbell = data.days.flatMap((d) => d.exercises).filter((e) => e.variants.barbell).map((e) => e.id);
  assert.deepEqual(withBarbell, ['pull-6']);
});

test('every video id is in the research oEmbed check', async () => {
  const checked = JSON.parse(await readFile(new URL('../docs/research/oembed-check.json', import.meta.url), 'utf8'));
  for (const day of data.days) for (const ex of day.exercises) for (const v of Object.values(ex.variants)) for (const vid of v.videos) {
    assert.ok(checked[vid.id]?.ok, `${vid.id} missing from docs/research/oembed-check.json`);
  }
});

test('every fallback id has both local images', async () => {
  for (const day of data.days) for (const ex of day.exercises) for (const [k, v] of Object.entries(ex.variants)) {
    const id = v.animation.fallback; if (!id) continue;
    for (const n of [0, 1]) await readFile(new URL(`../media/fallback/${id}/${n}.jpg`, import.meta.url));
  }
});
