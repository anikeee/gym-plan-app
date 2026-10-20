import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const data = JSON.parse(await readFile(new URL('../data/exercises.json', import.meta.url), 'utf8'));
const library = JSON.parse(await readFile(new URL('../data/library.json', import.meta.url), 'utf8')).exercises;
const plans = data.plans ?? [];
const trainer = plans[0];
const exercisesOf = (plan) => plan.days.flatMap((d) => d.exercises);
const allExercises = () => plans.flatMap(exercisesOf);
const everyExercise = () => [...allExercises(), ...library]; // the plans and the library the Replace sheet offers

// The personal trainer's plan, exactly as the PDF gives it (docs/research/anik-workout-plan-1.txt).
const PDF_NAMES = {
  push: ['Incline Chest Press Machine', 'Dumbbell Pullover', 'Lateral Raise', 'Chest Press Machine', 'Cable Chest Fly', 'Tricep Pushdown', 'Overhead Dumbbell Tricep Extension'],
  pull: ['Lat Pulldown', 'Straight Arm Pulldown', 'Seated Cable Row', 'Diverging Chest Supported Row', 'Face Pull', 'Barbell Curl', 'Hammer Curl'],
  legs: ['Perfect Squat', 'Romanian Deadlift', 'Leg Press', 'Back Lunges', 'Leg Curl', 'Leg Extension', 'Standing Calf Raise'],
};
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const EXDB_ID = /^[A-Za-z0-9]{7}$/;
const FEDB_ID = /^[A-Za-z0-9_()-]+$/;
const EX_ID = /^[a-z]+-\d+$/; // must keep matching ID_RE in log.js, which older cached copies of the app also use
const DRAWN = /^[a-z0-9-]+$/; // a file stem under media/drawn, written by scripts/draw-animations.mjs
// Keyed by exercise name, because the same exercise (with the same data) appears in more than one plan.
const ALLOWED_NO_FALLBACK = new Set(['Leg Curl.dumbbell', 'Leg Extension.dumbbell', 'Landmine Chest Press.barbell', 'Landmine Shoulder Press.barbell', 'Landmine Squat.barbell', 'Lateral Lunge.dumbbell', 'Single Leg Romanian Deadlift.dumbbell']);
const VARIANT_KEYS = ['machine', 'dumbbell', 'barbell', 'bodyweight'];

// One version of an exercise, in a plan or the library: every field the app shows must be there and well formed.
function checkVariant(ex, key, v) {
  const where = `${ex.id}.${key}`;
  assert.ok(VARIANT_KEYS.includes(key), where);
  assert.ok(typeof v.name === 'string' && v.name.trim().length > 3, `${where}.name`); // short names like Rack pull are fine
  for (const f of ['kit', 'tip']) assert.ok(typeof v[f] === 'string' && v[f].length > 10, `${where}.${f}`);
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
  if (a.drawn !== undefined) assert.match(a.drawn, DRAWN, `${where}.drawn`);
  // A version with no offline pictures gets a drawing, so the box never falls back to "Watch the video below instead",
  // neither for a version with no animation at all nor when the live animation cannot load (weak signal in the gym).
  if (a.fallback === null) assert.ok(a.drawn, `${where} has no offline picture: draw one in scripts/draw-animations.mjs`);
  if (a.fallback === null) assert.ok(ALLOWED_NO_FALLBACK.has(`${ex.name}.${key}`), `${where} has no fallback`);
  assert.ok(v.guide === null || v.guide.startsWith('https://www.puregym.com/'), where);
  if (v.assisted !== undefined) assert.ok(v.assisted === true && key === 'machine' && /assist/i.test(v.name), `${where}: only an assisted machine is marked assisted`);
}
function checkAliases(ex) {
  if (ex.aliases === undefined) return;
  assert.ok(Array.isArray(ex.aliases) && ex.aliases.every((a) => typeof a === 'string' && a.trim().length > 1), `${ex.id}.aliases`);
}

test('the trainer plan comes first and is the default', () => {
  assert.ok(plans.length >= 1);
  assert.equal(trainer.id, 'trainer');
  assert.equal(trainer.sets, 4);
  assert.deepEqual(trainer.reps, [12, 10, 10, 8]);
  assert.ok(trainer.rest.compound && trainer.rest.isolation);
  assert.equal(trainer.minutes, 45);
});

test('the trainer plan has three days of seven exercises, names and ids exactly as the PDF', () => {
  assert.deepEqual(trainer.days.map((d) => d.id), ['push', 'pull', 'legs']);
  for (const day of trainer.days) {
    assert.equal(day.exercises.length, 7, day.id);
    assert.deepEqual(day.exercises.map((e) => e.name), PDF_NAMES[day.id], day.id);
    day.exercises.forEach((e, i) => assert.equal(e.id, `${day.id}-${i + 1}`));
    day.exercises.forEach((e) => assert.equal(e.reps, undefined, `${e.id} uses the plan's 12, 10, 10, 8`));
  }
});

test('in the trainer plan only Barbell Curl has a barbell version', () => {
  assert.deepEqual(exercisesOf(trainer).filter((e) => e.variants.barbell).map((e) => e.id), ['pull-6']);
});

test('every plan has a name, a credit, rest times, and the same three days', () => {
  const ids = new Set();
  for (const plan of plans) {
    assert.match(plan.id, /^[a-z]+$/, plan.id);
    assert.ok(!ids.has(plan.id), `duplicate plan ${plan.id}`); ids.add(plan.id);
    for (const f of ['name', 'by', 'tagline', 'progression']) assert.ok(typeof plan[f] === 'string' && plan[f].length > 3, `${plan.id}.${f}`);
    assert.ok(Number.isInteger(plan.minutes) && plan.minutes >= 30 && plan.minutes <= 120, `${plan.id}.minutes`);
    assert.ok(plan.rest.compound && plan.rest.isolation, `${plan.id}.rest`);
    assert.ok(Number.isInteger(plan.sets) && Array.isArray(plan.reps) && plan.reps.length === plan.sets, `${plan.id} default sets and reps`);
    if (plan !== trainer) assert.match(plan.sourceUrl, /^https:\/\//, `${plan.id}.sourceUrl`);
    assert.deepEqual(plan.days.map((d) => d.id), ['push', 'pull', 'legs'], plan.id);
    for (const day of plan.days) {
      assert.ok(day.exercises.length >= 5 && day.exercises.length <= 7, `${plan.id}.${day.id} has ${day.exercises.length} exercises`);
      assert.ok(day.name && day.focus, `${plan.id}.${day.id}`);
    }
  }
});

test('exercise ids are unique across all plans and keep the old id shape', () => {
  const seen = new Set();
  for (const plan of plans) for (const day of plan.days) for (const ex of day.exercises) {
    assert.match(ex.id, EX_ID, ex.id);
    assert.ok(ex.id.startsWith(`${day.id}-`), `${ex.id} is on ${day.id}`);
    assert.ok(!seen.has(ex.id), `duplicate exercise id ${ex.id}`); seen.add(ex.id);
  }
});

test('sets and reps per exercise are sane, and a range targets its top', () => {
  for (const ex of allExercises()) {
    if (ex.rest !== undefined) assert.ok(typeof ex.rest === 'string' && /\d/.test(ex.rest), `${ex.id}.rest`);
    if (ex.step !== undefined) assert.ok(typeof ex.step === 'number' && ex.step > 0 && ex.step <= 10, `${ex.id}.step`);
    if (ex.reps === undefined) continue;
    assert.ok(Array.isArray(ex.reps) && ex.reps.length >= 1 && ex.reps.length <= 6, `${ex.id}.reps`);
    ex.reps.forEach((r) => assert.ok(Number.isInteger(r) && r >= 1 && r <= 30, `${ex.id}.reps ${r}`));
    if (ex.repRange) {
      const [lo, hi] = ex.repRange;
      assert.ok(Number.isInteger(lo) && Number.isInteger(hi) && lo < hi, `${ex.id}.repRange`);
      ex.reps.forEach((r) => assert.equal(r, hi, `${ex.id} targets the top of its range`));
    }
  }
});

test('the same exercise name means the same movement in every plan, so weight history follows the lift', () => {
  const byName = new Map();
  for (const ex of allExercises()) {
    const shape = JSON.stringify({ type: ex.type, variants: Object.fromEntries(Object.entries(ex.variants).map(([k, v]) => [k, v.name])) });
    if (!byName.has(ex.name)) byName.set(ex.name, shape);
    else assert.equal(shape, byName.get(ex.name), `${ex.name} differs between plans`);
  }
});

test('each added plan brings new exercises on every day', () => {
  for (const plan of plans.slice(1)) {
    let total = 0;
    for (const day of plan.days) {
      const fresh = day.exercises.filter((e) => !PDF_NAMES[day.id].includes(e.name)).length;
      assert.ok(fresh >= 3, `${plan.id}.${day.id} has only ${fresh} exercises the trainer plan does not have`);
      total += fresh;
    }
    assert.ok(total >= 10, `${plan.id} has only ${total} new exercises`);
  }
});

test('every plan exercise has machine and dumbbell versions with complete fields', () => {
  for (const ex of allExercises()) {
    assert.ok(['compound', 'isolation'].includes(ex.type), ex.id);
    assert.ok(['machine', 'dumbbell', 'barbell', 'other'].includes(ex.asWritten), ex.id);
    assert.ok(ex.variants.machine && ex.variants.dumbbell, ex.id);
    for (const [key, v] of Object.entries(ex.variants)) checkVariant(ex, key, v);
    if (ex.asWritten !== 'other') assert.ok(ex.variants[ex.asWritten], `${ex.id} asWritten points at a missing variant`);
    checkAliases(ex);
  }
});

// The library: the exercises the Replace sheet offers beyond the plans. Each has at least one complete version.
test('every library exercise has a unique id and name, a day group, and complete versions', () => {
  assert.ok(library.length >= 40, `only ${library.length} library exercises`);
  const planNames = new Set(allExercises().map((e) => e.name));
  const ids = new Set(); const names = new Set();
  for (const ex of library) {
    assert.match(ex.id, /^lib-\d+$/, ex.id);
    assert.ok(!ids.has(ex.id), `duplicate library id ${ex.id}`); ids.add(ex.id);
    assert.ok(!names.has(ex.name) && !planNames.has(ex.name), `${ex.name} is listed twice`); names.add(ex.name);
    assert.ok(['push', 'pull', 'legs', 'core'].includes(ex.group), `${ex.id}.group`); // core: abs, offered on any day
    assert.ok(['compound', 'isolation'].includes(ex.type), ex.id);
    assert.ok([...VARIANT_KEYS, 'other'].includes(ex.asWritten), ex.id);
    assert.ok(Object.keys(ex.variants).length >= 1, ex.id);
    for (const [key, v] of Object.entries(ex.variants)) checkVariant(ex, key, v);
    if (ex.asWritten !== 'other') assert.ok(ex.variants[ex.asWritten], `${ex.id} asWritten points at a missing variant`);
    checkAliases(ex);
    assert.equal(ex.reps, undefined, `${ex.id}: a library exercise takes the slot's sets and reps`);
  }
  for (const g of ['push', 'pull', 'legs', 'core']) assert.ok(library.filter((e) => e.group === g).length >= 10, `${g} has few library exercises`);
});

test('every video id is in the research oEmbed check', async () => {
  const checked = JSON.parse(await readFile(new URL('../docs/research/oembed-check.json', import.meta.url), 'utf8'));
  for (const ex of everyExercise()) for (const v of Object.values(ex.variants)) for (const vid of v.videos) {
    assert.ok(checked[vid.id]?.ok, `${vid.id} missing from docs/research/oembed-check.json`);
  }
});

test('every fallback id has both local images', async () => {
  for (const ex of everyExercise()) for (const v of Object.values(ex.variants)) {
    const id = v.animation.fallback; if (!id) continue;
    for (const n of [0, 1]) await readFile(new URL(`../media/fallback/${id}/${n}.jpg`, import.meta.url));
  }
});

// The drawings ship with the app: the moving one for the animation box and a still for the list thumbnail, nothing unused.
test('every drawn animation has its moving file and its still, and every drawn file is used', async () => {
  const used = new Set();
  for (const ex of everyExercise()) for (const v of Object.values(ex.variants)) {
    const d = v.animation.drawn; if (!d) continue; used.add(d);
    for (const f of [`${d}.svg`, `${d}-still.svg`]) {
      const svg = await readFile(new URL(`../media/drawn/${f}`, import.meta.url), 'utf8');
      assert.ok(svg.startsWith('<svg ') && svg.trimEnd().endsWith('</svg>'), f);
      assert.equal(svg.includes('<animate '), !f.endsWith('-still.svg'), `${f}: the animation moves, the still does not`);
    }
  }
  assert.ok(used.size >= 4, 'the landmine exercises and the dumbbell leg extension are drawn');
  const files = (await readdir(new URL('../media/drawn/', import.meta.url))).filter((f) => f.endsWith('.svg'));
  assert.deepEqual([...new Set(files.map((f) => f.replace(/(-still)?\.svg$/, '')))].sort(), [...used].sort());
});

test('the assisted pull up and chin up machines are marked, so the app takes help off instead of adding it', () => {
  for (const ex of allExercises().filter((e) => e.name === 'Pull Up')) assert.equal(ex.variants.machine.assisted, true, ex.id);
  assert.equal(library.find((e) => e.name === 'Chin Up')?.variants.machine.assisted, true);
});

// A bodyweight version logs the weight added (0 kg is bodyweight only), so its sets go to their own store in log.js.
test('every Pull Up has the same bodyweight version for sets on the bar with no assist', () => {
  const pulls = allExercises().filter((e) => e.name === 'Pull Up');
  assert.equal(pulls.length, 3);
  for (const ex of pulls) assert.deepEqual(ex.variants.bodyweight, pulls[0].variants.bodyweight, ex.id);
  assert.equal(pulls[0].variants.bodyweight.assisted, undefined);
  assert.deepEqual(allExercises().filter((e) => e.variants.bodyweight).map((e) => e.name), ['Pull Up', 'Pull Up', 'Pull Up']);
});
