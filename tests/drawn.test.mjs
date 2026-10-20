import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as D from '../scripts/draw-animations.mjs';

// The drawn animations (scripts/draw-animations.mjs). The figure must match the form tips in the data files,
// because people copy what they see: these tests measure the poses, not the pixels.
const scene = (name) => D.SCENES.find((s) => s.name === name);
const samples = (n = 200) => Array.from({ length: n + 1 }, (_, i) => i / n);
const angleAt = (a, b, c) => { // inner angle at b, in degrees
  const u = [a[0] - b[0], a[1] - b[1]], v = [c[0] - b[0], c[1] - b[1]];
  return (Math.acos((u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v))) * 180) / Math.PI;
};
const mid = (a, b, t = 0.5) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
// Whole body centre of mass from standard segment shares (head 8, trunk 50, thighs 10, shanks 4.5, feet 1.5, arms 5 each).
function centreOfMass(j) {
  const parts = [
    [j.head, 0.08], [mid(j.hip, j.shoulder), 0.5],
    [mid(j.hip, j.kneeN, 0.43), 0.1], [mid(j.hipF, j.kneeF, 0.43), 0.1],
    [mid(j.kneeN, j.ankleN), 0.045], [mid(j.kneeF, j.ankleF), 0.045],
    [mid(j.heelN, j.toeN), 0.015], [mid(j.heelF, j.toeF), 0.015],
    [mid(j.shoulder, j.elbowN), 0.028], [mid(j.elbowN, j.handN), 0.022],
    [mid(j.shoulderF, j.elbowF), 0.028], [mid(j.elbowF, j.handF), 0.022],
  ];
  return parts.reduce((s, [p, w]) => [s[0] + p[0] * w, s[1] + p[1] * w], [0, 0]);
}
const feetSpan = (j) => { const xs = [j.heelN[0], j.toeN[0], j.heelF[0], j.toeF[0]]; return [Math.min(...xs), Math.max(...xs)]; };
const kneeBend = (hip, knee, ankle) => 180 - angleAt(hip, knee, ankle);
const luminance = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const BOX_DARKEST = '#D3D9E1'; // the darkest stop of the animation box gradient in styles.css

test('the shipped SVG files are exactly what the generator draws', async () => {
  for (const s of D.SCENES) for (const still of [false, true]) {
    const f = `${s.name}${still ? '-still' : ''}.svg`;
    assert.equal(await readFile(new URL(`../media/drawn/${f}`, import.meta.url), 'utf8'), D.render(s, still), `${f}: run npm run draw`);
  }
});

test('no limb is ever pulled out of reach, so hands stay on the bar and feet on the floor', () => {
  for (const s of D.SCENES) for (const p of samples()) assert.equal(s.pose(p).clamps, 0, `${s.name} at p=${p}`);
});

test('both hands stay on the bar end and the bar reaches the hands', () => {
  for (const name of ['landmine-chest-press', 'landmine-squat']) for (const p of samples()) {
    const j = scene(name).pose(p);
    const gap = Math.hypot(j.handF[0] - j.handN[0], j.handF[1] - j.handN[1]);
    assert.ok(gap <= 6, `${name} at p=${p}: the far hand is ${gap.toFixed(1)} px from the near hand`);
  }
  for (const name of ['landmine-chest-press', 'landmine-shoulder-press', 'landmine-squat']) for (const p of samples(50)) {
    const j = scene(name).pose(p);
    const bar = scene(name).draw(p).find((x) => x.kind === 'seg' && x.color === D.COLORS.BAR && x.w === 6);
    const reach = Math.hypot(bar.b[0] - j.handN[0], bar.b[1] - j.handN[1]);
    assert.ok(reach <= 7, `${name} at p=${p}: the bar ends ${reach.toFixed(1)} px from the hand`);
  }
});

test('nothing sinks into the floor', () => {
  for (const s of D.SCENES) for (const p of samples(50)) for (const part of s.draw(p)) {
    const pts = part.kind === 'circle' ? [[part.c, part.r]] : part.kind === 'seg' ? [[part.a, part.w / 2], [part.b, part.w / 2]] : part.pts.map((q) => [q, 0]);
    for (const [[x, y], r] of pts) assert.ok(y + r <= D.FLOOR + 3.5, `${s.name} at p=${p}: a ${part.kind} reaches ${(y + r).toFixed(1)}, below the floor at ${x.toFixed(0)}`);
  }
});

test('the still is the finished position the tip describes, and it is see-through like the animation', () => {
  for (const s of D.SCENES) {
    assert.equal(s.stillAt, 1, `${s.name}: the still shows the end of the rep`);
    assert.ok(!D.render(s, true).includes('<rect'), `${s.name}: the still has no background panel`);
  }
});

test('standing figures keep a soft knee, not a half squat', () => {
  const standing = { 'landmine-chest-press': samples(), 'landmine-shoulder-press': samples(), 'landmine-squat': [0] };
  for (const [name, ps] of Object.entries(standing)) for (const p of ps) {
    const j = scene(name).pose(p);
    for (const [hip, knee, ankle] of [[j.hip, j.kneeN, j.ankleN], [j.hipF, j.kneeF, j.ankleF]]) {
      const bend = kneeBend(hip, knee, ankle);
      assert.ok(bend <= 20, `${name} at p=${p}: knee bent ${bend.toFixed(1)} degrees`);
    }
  }
});

test('the landmine squat stays balanced over the feet with the knees travelling forward', () => {
  const s = scene('landmine-squat');
  let forward = Infinity, back = 0;
  for (const p of samples()) {
    const j = s.pose(p);
    const [lo, hi] = feetSpan(j), x = centreOfMass(j)[0];
    assert.ok(x >= lo && x <= hi, `p=${p}: centre of mass x ${x.toFixed(1)} outside the feet ${lo.toFixed(1)} to ${hi.toFixed(1)}`);
    forward = Math.min(forward, j.kneeN[0]); back = Math.max(back, j.kneeN[0] - forward); // facing left, so forward is smaller x
  }
  assert.ok(back <= 3, `the knee moves back ${back.toFixed(1)} px after its most forward point`);
  const j = s.pose(1);
  const shin = (Math.atan2(j.ankleN[0] - j.kneeN[0], j.ankleN[1] - j.kneeN[1]) * 180) / Math.PI;
  assert.ok(Math.abs(shin) >= 25, `the shin is ${Math.abs(shin).toFixed(1)} degrees off vertical at the bottom`);
  const thigh = (Math.atan2(j.hip[1] - j.kneeN[1], j.hip[0] - j.kneeN[0]) * 180) / Math.PI;
  assert.ok(Math.abs(thigh) <= 12, `the thigh is ${thigh.toFixed(1)} degrees off parallel at the bottom`);
});

test('the presses finish with the arms as straight as the tips say', () => {
  // Chest press tip: until the arms are nearly straight. Single arm press tip: until the arm is straight.
  for (const [name, least] of [['landmine-chest-press', 155], ['landmine-shoulder-press', 160]]) {
    const j = scene(name).pose(1);
    const elbow = angleAt(j.shoulder, j.elbowN, j.handN);
    assert.ok(elbow >= least, `${name}: the elbow ends at ${elbow.toFixed(1)} degrees`);
  }
});

test('elbows never fold tighter than a real elbow, and the hands stay clear of the head', () => {
  for (const name of ['landmine-chest-press', 'landmine-shoulder-press', 'landmine-squat']) for (const p of samples()) {
    const j = scene(name).pose(p);
    const inside = angleAt(j.shoulder, j.elbowN, j.handN);
    assert.ok(inside >= 28, `${name} at p=${p}: the elbow folds to ${inside.toFixed(1)} degrees`);
    const gap = Math.hypot(j.handN[0] - j.head[0], j.handN[1] - j.head[1]) - (D.L.head + 7);
    assert.ok(gap >= 0, `${name} at p=${p}: the hand overlaps the head by ${(-gap).toFixed(1)} px`);
  }
});

// Which way p moves while the weight goes down: 'back' (1 to 0) for a lift that starts low, 'out' (0 to 1) for a squat or hinge.
const LOWERS = {
  'landmine-chest-press': 'back', 'landmine-shoulder-press': 'back', 'dumbbell-leg-extension': 'back', 'dumbbell-leg-curl': 'back',
  'landmine-squat': 'out', 'dumbbell-lateral-lunge': 'out', 'dumbbell-single-leg-rdl': 'out',
};
test('every drawing lowers the weight more slowly than it lifts it', () => {
  assert.deepEqual(D.SCENES.map((s) => s.name).sort(), Object.keys(LOWERS).sort(), 'every scene has its lowering direction pinned here');
  // The p values render() samples over one loop. The lowering is p going 1 to 0 for a lift that starts low,
  // and 0 to 1 for a squat or hinge that starts standing (scene.lowers).
  const phases = D.repPhases ?? (() => Array.from({ length: D.SAMPLES + 1 }, (_, i) => D.phase(i / D.SAMPLES)));
  for (const s of D.SCENES) {
    const ps = phases(s);
    assert.equal(ps[0], ps[ps.length - 1], `${s.name}: the loop must end where it starts`);
    let up = 0, down = 0;
    for (let i = 1; i < ps.length; i++) { if (ps[i] > ps[i - 1]) up++; else if (ps[i] < ps[i - 1]) down++; }
    assert.equal(s.lowers, LOWERS[s.name], `${s.name}: lowers is the wrong way round`);
    const [lowering, lifting] = LOWERS[s.name] === 'back' ? [down, up] : [up, down];
    assert.ok(lowering > lifting, `${s.name}: ${lowering} samples lowering against ${lifting} lifting`);
  }
});

test('the dumbbell leg extension straightens the legs and the dumbbell clears the floor', () => {
  const s = scene('dumbbell-leg-extension');
  const end = s.pose(1);
  const knee = angleAt(end.hip, end.kneeN, end.ankleN);
  assert.ok(knee >= 175, `the knee ends at ${knee.toFixed(1)} degrees`);
  for (const p of samples()) assert.ok(s.pose(p).bell[1] + 16 <= D.FLOOR - 4, `p=${p}: the dumbbell touches the floor`);
  for (const knee of [end.kneeN, end.kneeF]) {
    const past = end.seat[0] - knee[0];
    assert.ok(past >= 0 && past <= 10, `the knee is ${past.toFixed(1)} px past the front of the seat: the thighs should rest on it`);
  }
  const seatMetres = ((D.FLOOR - end.seatY) / 215) * 1.78; // the figure is about 215 px for 1.78 m
  assert.ok(seatMetres <= 0.6, `the seat is ${seatMetres.toFixed(2)} m high, more than a gym bench`);
});

test('the bench stands out from the animation box, and the figure stands out from the bench', () => {
  for (const name of ['dumbbell-leg-extension', 'dumbbell-leg-curl']) for (const part of scene(name).draw(0.5).filter((x) => x.kind === 'poly')) {
    assert.equal(part.fill, D.COLORS.BENCH, `${name}: every bench shape is drawn in the bench colour`);
  }
  const bench = D.COLORS.BENCH;
  assert.ok(contrast(bench, BOX_DARKEST) >= 3, `bench ${bench} is ${contrast(bench, BOX_DARKEST).toFixed(2)} to 1 on ${BOX_DARKEST}`);
  assert.ok(contrast(bench, D.COLORS.INK) >= 3, `the figure is ${contrast(bench, D.COLORS.INK).toFixed(2)} to 1 on the bench`);
});

test('every drawing stays inside the box and clear of the chip the app lays over its top left corner', () => {
  const CHIP = { x0: 12, y0: 12, x1: 124, y1: 51 }; // the Drawn chip on a 320 px wide phone, in drawing units
  const points = (part) => { // the outline of a part as points with a radius
    if (part.kind === 'circle') return [[part.c, part.r]];
    const line = (a, b, r) => Array.from({ length: 21 }, (_, i) => [[a[0] + ((b[0] - a[0]) * i) / 20, a[1] + ((b[1] - a[1]) * i) / 20], r]);
    if (part.kind === 'seg') return line(part.a, part.b, part.w / 2);
    return part.pts.flatMap((p, i) => line(p, part.pts[(i + 1) % part.pts.length], 0));
  };
  for (const s of D.SCENES) for (const p of samples(100)) for (const part of s.draw(p)) for (const [[x, y], r] of points(part)) {
    assert.ok(x - r >= 0 && x + r <= D.W && y - r >= 0 && y + r <= D.H, `${s.name} at p=${p}: a ${part.kind} leaves the box at ${x.toFixed(0)},${y.toFixed(0)}`);
    const inChip = x + r > CHIP.x0 && x - r < CHIP.x1 && y + r > CHIP.y0 && y - r < CHIP.y1;
    assert.ok(!inChip, `${s.name} at p=${p}: a ${part.kind} runs under the chip at ${x.toFixed(0)},${y.toFixed(0)}`);
  }
});

// dumbbell-leg-curl: the scene's own form rules (designed with an independent form critic).
{
  // Dumbbell hamstring curl. Kit: one dumbbell and a flat bench. Tip: lie face down with the dumbbell gripped between
  // your feet, curl it towards your glutes and lower under control. Widths below are the module's drawing widths.
  // No clamps and nothing under the chip are checked for this scene by the shared tests above ('no limb is ever pulled
  // out of reach' and 'every drawing stays inside the box and clear of the chip'), which run over every scene in SCENES.
  const curl = D.SCENES.find((s) => s.name === 'dumbbell-leg-curl');
  const ps = Array.from({ length: 201 }, (_, i) => i / 200);
  const TORSO = 13, THIGH = 10, SHIN = 8, FOOT = 5, FORE = 6.5, HAND = 7, PLATE = 6, HANDLE = 3; // half widths, px
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const unit = (a) => { const n = Math.hypot(...a); return [a[0] / n, a[1] / n]; };
  const deg = (r) => (r * 180) / Math.PI;
  const inner = (a, b, c) => deg(Math.acos(dot(unit(sub(a, b)), unit(sub(c, b))))); // inner angle at b
  const toSeg = (q, a, b) => { // distance from q to the segment a b
    const d = sub(b, a), t = Math.max(0, Math.min(1, dot(sub(q, a), d) / dot(d, d)));
    return Math.hypot(q[0] - a[0] - d[0] * t, q[1] - a[1] - d[1] * t);
  };
  const along = (a, b, n = 20) => Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
  const cross = (a, b, c, d) => { // where line a b meets segment c d, as a fraction of c to d
    const r = sub(b, a), s = sub(d, c), den = r[0] * s[1] - r[1] * s[0];
    return ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  };

  test('the dumbbell hamstring curl starts with long legs and curls to a right angle, never so far the dumbbell slips', () => {
    const start = curl.pose(0), end = curl.pose(1);
    for (const [hip, knee, ankle] of [[start.hip, start.kneeN, start.ankleN], [start.hipF, start.kneeF, start.ankleF]]) {
      assert.ok(inner(hip, knee, ankle) >= 165, `the knee starts at ${inner(hip, knee, ankle).toFixed(1)} degrees`);
    }
    for (const [hip, knee, ankle] of [[end.hip, end.kneeN, end.ankleN], [end.hipF, end.kneeF, end.ankleF]]) {
      const flexion = 180 - inner(hip, knee, ankle);
      assert.ok(flexion >= 90 && flexion <= 100, `the knee ends at ${flexion.toFixed(1)} degrees of flexion`);
    }
    let last = 181;
    for (const p of ps) {
      const j = curl.pose(p), knee = inner(j.hip, j.kneeN, j.ankleN);
      assert.ok(knee <= last + 1e-9, `p=${p}: the knee opens again (${knee.toFixed(1)} after ${last.toFixed(1)})`);
      last = knee;
      // The soles face up at every p, so the top head of the dumbbell stays resting on them.
      assert.ok(j.ankleN[1] < j.kneeN[1], `p=${p}: the shin points down, so the soles face the floor`);
    }
    const tilt = deg(Math.atan2(end.bell.top[0] - end.bell.bottom[0], end.bell.bottom[1] - end.bell.top[1]));
    assert.ok(Math.abs(tilt) <= 5, `at the top the dumbbell leans ${tilt.toFixed(1)} degrees off vertical`);
  });

  test('the dumbbell hamstring curl keeps the hips and chest on the bench and the lower legs free past its end', () => {
    const j0 = curl.pose(0), [x0, x1] = j0.bench, y = j0.benchY;
    const metres = (px) => (px / 215) * 1.78; // the figure is about 215 px for 1.78 m
    assert.ok(metres(D.FLOOR - y) >= 0.4 && metres(D.FLOOR - y) <= 0.5, `the bench is ${metres(D.FLOOR - y).toFixed(2)} m high`);
    assert.ok(metres(x1 - x0) >= 1 && metres(x1 - x0) <= 1.35, `the bench is ${metres(x1 - x0).toFixed(2)} m long`);
    for (const p of ps) {
      const j = curl.pose(p);
      for (const [name, q] of [['hip', j.hip], ['shoulder', j.shoulder]]) {
        assert.ok(Math.abs(q[1] + TORSO - y) <= 0.5, `p=${p}: the ${name} is ${(y - q[1] - TORSO).toFixed(1)} px off the pad`);
        assert.ok(q[0] - TORSO >= x0 && q[0] + TORSO <= x1, `p=${p}: the ${name} is not over the pad`);
      }
      const thighY = j.hip[1] + ((j.kneeN[1] - j.hip[1]) * (x1 - j.hip[0])) / (j.kneeN[0] - j.hip[0]);
      assert.ok(Math.abs(thighY + THIGH - y) <= 1, `p=${p}: the thigh is ${(y - thighY - THIGH).toFixed(1)} px off the end of the pad`);
      assert.ok(j.kneeN[0] - x1 >= 5 && j.kneeN[0] - x1 <= 15, `p=${p}: the knee is ${(j.kneeN[0] - x1).toFixed(1)} px past the bench`);
      const swinging = [
        [j.kneeN, j.ankleN, SHIN], [j.kneeF, j.ankleF, SHIN], [j.heelN, j.toeN, FOOT], [j.heelF, j.toeF, FOOT],
        [j.bell.bottom, j.bell.top, HANDLE], [...j.bell.topEnds, PLATE], [...j.bell.bottomEnds, PLATE],
      ];
      for (const [a, b, r] of swinging) for (const q of along(a, b)) {
        const cx = Math.max(x0, Math.min(x1, q[0])), cy = Math.max(y, Math.min(y + 12, q[1]));
        assert.ok(Math.hypot(q[0] - cx, q[1] - cy) >= r, `p=${p}: the lower leg or dumbbell runs into the pad at ${q[0].toFixed(0)},${q[1].toFixed(0)}`);
      }
    }
  });

  test('the dumbbell hamstring curl keeps the dumbbell gripped between the feet', () => {
    for (const p of ps) {
      const j = curl.pose(p), { top, bottom } = j.bell;
      const u = unit(sub(j.ankleN, j.kneeN)), axis = unit(sub(top, bottom));
      const off = deg(Math.acos(Math.min(1, dot(u, axis))));
      assert.ok(off <= 0.5, `p=${p}: the dumbbell is ${off.toFixed(2)} degrees off the line of the shin`);
      const near = cross(bottom, top, j.heelN, j.toeN), far = cross(bottom, top, j.heelF, j.toeF);
      assert.ok(near >= 0.25 && near <= 0.75, `p=${p}: the handle crosses the near foot at ${near.toFixed(2)} of heel to toe`);
      assert.ok(far > 0 && far < 1, `p=${p}: the handle misses the far foot (${far.toFixed(2)})`);
      const sole = dot(sub(top, j.heelN), u) - PLATE - FOOT; // gap from the soles to the top head
      assert.ok(Math.abs(sole) <= 0.5, `p=${p}: the top head is ${sole.toFixed(1)} px off the soles`);
      const instep = -dot(sub(bottom, j.heelN), u) - PLATE - FOOT; // gap from the top of the feet to the bottom head
      assert.ok(instep >= 0, `p=${p}: the bottom head cuts ${(-instep).toFixed(1)} px into the feet`);
    }
  });

  test('the dumbbell hamstring curl shows the handle between the feet, clear of the near shin', () => {
    // The near shin is painted over the handle, so a handle inside the shin's outline leaves two loose lime stubs.
    for (const p of ps) {
      const j = curl.pose(p), { bottom } = j.bell, u = unit(sub(j.ankleN, j.kneeN)), side = [-u[1], u[0]];
      const off = Math.abs(dot(sub(bottom, j.kneeN), side)); // handle line to shin line
      assert.ok(off >= SHIN + HANDLE - 1e-6, `p=${p}: the handle runs ${(SHIN + HANDLE - off).toFixed(1)} px behind the near shin`);
      const shown = dot(sub(j.heelN, bottom), u) - FOOT - PLATE; // handle between the top of the feet and the bottom head
      assert.ok(shown >= 8, `p=${p}: only ${shown.toFixed(1)} px of handle shows below the feet`);
    }
  });

  test('the dumbbell hamstring curl holds the front of the bench with the hands, clear of the head', () => {
    for (const p of ps) {
      const j = curl.pose(p), [x0] = j.bench, y = j.benchY;
      assert.ok(j.handN[0] >= x0 && j.handN[0] <= x0 + 10 && j.handN[1] >= y && j.handN[1] <= y + 12, `p=${p}: the hand is not on the front of the pad`);
      const elbow = inner(j.shoulder, j.elbowN, j.handN);
      assert.ok(elbow >= 28, `p=${p}: the elbow folds to ${elbow.toFixed(1)} degrees`);
      const gap = Math.min(Math.hypot(...sub(j.handN, j.head)) - HAND, toSeg(j.head, j.elbowN, j.handN) - FORE) - D.L.head;
      assert.ok(gap >= 0, `p=${p}: the arm overlaps the head by ${(-gap).toFixed(1)} px`);
      assert.ok(Math.max(j.elbowN[1], j.elbowF[1]) + 7.5 <= D.FLOOR, `p=${p}: an elbow touches the floor`);
      assert.ok(j.head[1] + D.L.head <= y, `p=${p}: the head sinks ${(j.head[1] + D.L.head - y).toFixed(1)} px into the pad`);
    }
  });

  test('the dumbbell hamstring curl paints the far arm behind the bench and the dumbbell between the far and near legs', () => {
    const { FAR, BENCH } = D.COLORS;
    const same = (a, b) => a[0] === b[0] && a[1] === b[1];
    for (const p of [0, 0.55, 1]) {
      const j = curl.pose(p), parts = curl.draw(p);
      const ends = (q) => (q.kind === 'circle' ? [q.c] : q.kind === 'seg' ? [q.a, q.b] : []);
      const touches = (q, joints) => ends(q).some((e) => joints.some((k) => same(e, k)));
      const where = (pred) => parts.flatMap((q, i) => (pred(q) ? [i] : []));
      const farArm = where((q) => (q.color ?? q.fill) === FAR && touches(q, [j.shoulderF, j.elbowF, j.handF]));
      const farLeg = where((q) => (q.color ?? q.fill) === FAR && touches(q, [j.hipF, j.kneeF, j.ankleF, j.heelF, j.toeF]));
      const bench = where((q) => q.kind === 'poly' && q.fill === BENCH);
      const bell = where((q) => q.kind === 'seg' && [j.bell.top, j.bell.bottom, ...j.bell.topEnds, ...j.bell.bottomEnds].some((e) => same(e, q.a)));
      const nearShin = where((q) => q.kind === 'seg' && same(q.a, j.kneeN) && same(q.b, j.ankleN));
      const nearFoot = where((q) => q.kind === 'seg' && same(q.a, j.heelN) && same(q.b, j.toeN));
      assert.ok([farArm, farLeg, bench, bell, nearShin, nearFoot].every((g) => g.length > 0), `p=${p}: a part is missing`);
      assert.ok(Math.max(...farArm) < Math.min(...bench), `p=${p}: the far arm is painted over the bench`);
      assert.ok(Math.max(...farLeg) < Math.min(...bell), `p=${p}: the far leg is painted over the dumbbell`);
      assert.ok(Math.max(...bell) < Math.min(...nearShin, ...nearFoot), `p=${p}: the dumbbell is painted over the near leg`);
    }
  });

  test('the dumbbell hamstring curl keeps every part above the floor line', () => {
    const points = (part) => { // the outline of a part as points with a radius, polygon edges included
      if (part.kind === 'circle') return [[part.c, part.r]];
      const line = (a, b, r) => along(a, b).map((q) => [q, r]);
      if (part.kind === 'seg') return line(part.a, part.b, part.w / 2);
      return part.pts.flatMap((q, i) => line(q, part.pts[(i + 1) % part.pts.length], 0));
    };
    for (const p of ps) for (const part of curl.draw(p)) for (const [[x, yy], r] of points(part)) {
      assert.ok(yy + r <= D.FLOOR, `p=${p}: a ${part.kind} goes under the floor at ${x.toFixed(0)},${yy.toFixed(0)}`);
    }
  });
}

// dumbbell-lateral-lunge: the scene's own form rules (designed with an independent form critic).
{
// The dumbbell lateral lunge is drawn from the front: the pose is built in 3D (x screen right, y down, z toward the
// viewer) and drawn by dropping z, so these tests measure the 3D joints the pose returns in j.k3, not the drawn angles.
// N is the figure's right side (screen left), the lunging leg; F is the left leg, which stays straight.
const dbLatLunge = () => D.SCENES.find((s) => s.name === 'dumbbell-lateral-lunge');
const dbLatLungeSamples = (n = 200) => Array.from({ length: n + 1 }, (_, i) => i / n);
const dbLatLungeSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dbLatLungeLen = (a) => Math.hypot(a[0], a[1], a[2]);
const dbLatLungeDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const dbLatLungeCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dbLatLungeAngle = (a, b, c) => { // inner angle at b, in degrees
  const u = dbLatLungeSub(a, b), v = dbLatLungeSub(c, b);
  return (Math.acos(dbLatLungeDot(u, v) / (dbLatLungeLen(u) * dbLatLungeLen(v))) * 180) / Math.PI;
};
const dbLatLungeMid = (a, b, t = 0.5) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
// Whole body centre of mass in 3D from the same segment shares as centreOfMass(). The trunk runs from the pelvis centre
// to the shoulder centre (k.neck): in a front view j.hip and j.shoulder are the right hip and shoulder, not the midline.
function dbLatLungeCentreOfMass(k) {
  const parts = [
    [k.head, 0.08], [dbLatLungeMid(k.pelvis, k.neck), 0.5],
    [dbLatLungeMid(k.hipN, k.kneeN, 0.43), 0.1], [dbLatLungeMid(k.hipF, k.kneeF, 0.43), 0.1],
    [dbLatLungeMid(k.kneeN, k.ankleN), 0.045], [dbLatLungeMid(k.kneeF, k.ankleF), 0.045],
    [dbLatLungeMid(k.heelN, k.toeN), 0.015], [dbLatLungeMid(k.heelF, k.toeF), 0.015],
    [dbLatLungeMid(k.shoulderN, k.elbowN), 0.028], [dbLatLungeMid(k.elbowN, k.handN), 0.022],
    [dbLatLungeMid(k.shoulderF, k.elbowF), 0.028], [dbLatLungeMid(k.elbowF, k.handF), 0.022],
  ];
  return parts.reduce((s, [p, w]) => [s[0] + p[0] * w, s[1] + p[1] * w, s[2] + p[2] * w], [0, 0, 0]);
}

test('the dumbbell lateral lunge draws its 3D joints seen from the front, with every bone its real length', () => {
  const s = dbLatLunge();
  assert.equal(s.lowers, 'out', 'it starts standing, so lowering is p going 0 to 1');
  assert.ok(s.dur >= 2.8 && s.dur <= 3.2, `a ${s.dur} s loop`);
  const bones = [['hipN', 'kneeN', D.L.thigh], ['hipF', 'kneeF', D.L.thigh], ['kneeN', 'ankleN', D.L.shin], ['kneeF', 'ankleF', D.L.shin],
    ['shoulderN', 'elbowN', D.L.upper], ['shoulderF', 'elbowF', D.L.upper], ['elbowN', 'handN', D.L.fore], ['elbowF', 'handF', D.L.fore],
    ['pelvis', 'neck', D.L.torso], ['neck', 'head', D.L.neck + D.L.head]];
  for (const p of dbLatLungeSamples()) {
    const j = s.pose(p), k = j.k3;
    for (const [name, q] of Object.entries(k)) assert.deepEqual(j[name], [q[0], q[1]], `p=${p}: ${name} is not drawn where it is`);
    assert.deepEqual([j.hip, j.shoulder], [j.hipN, j.shoulderN], `p=${p}: hip and shoulder are the right side's joints`);
    for (const [a, b, l] of bones) assert.ok(Math.abs(dbLatLungeLen(dbLatLungeSub(k[a], k[b])) - l) < 1e-6, `p=${p}: ${a} to ${b} is ${dbLatLungeLen(dbLatLungeSub(k[a], k[b])).toFixed(2)} px, not ${l}`);
  }
});

test('the dumbbell lateral lunge never pulls a limb out of reach', () => {
  for (const p of dbLatLungeSamples()) assert.equal(dbLatLunge().pose(p).clamps, 0, `p=${p}`);
});

test('the dumbbell lateral lunge sits into one knee to about 90 degrees with the other leg straight', () => {
  // Tip: sit back into that leg, other leg straight; lower until the bent knee is about 90 degrees.
  const s = dbLatLunge();
  const kneeN = (p) => dbLatLungeAngle(s.pose(p).k3.hipN, s.pose(p).k3.kneeN, s.pose(p).k3.ankleN);
  const bottom = kneeN(1);
  assert.ok(bottom >= 80 && bottom <= 110, `the lunging knee ends at ${bottom.toFixed(1)} degrees`);
  let last = Infinity;
  for (const p of dbLatLungeSamples()) {
    const k = s.pose(p).k3;
    const straight = dbLatLungeAngle(k.hipF, k.kneeF, k.ankleF);
    assert.ok(straight >= 170, `p=${p}: the straight leg's knee is at ${straight.toFixed(1)} degrees`);
    const bent = kneeN(p);
    assert.ok(bent <= last + 1e-9, `p=${p}: the lunging knee opens on the way down`);
    last = bent;
  }
  // Standing at p = 0, both knees are soft, not a half squat.
  const top = s.pose(0).k3;
  for (const [hip, knee, ankle] of [[top.hipN, top.kneeN, top.ankleN], [top.hipF, top.kneeF, top.ankleF]]) {
    assert.ok(180 - dbLatLungeAngle(hip, knee, ankle) <= 20, `standing: a knee bent ${(180 - dbLatLungeAngle(hip, knee, ankle)).toFixed(1)} degrees`);
  }
});

test('the dumbbell lateral lunge bends the knee toward its toes and keeps it over the foot', () => {
  const s = dbLatLunge();
  for (const p of dbLatLungeSamples()) {
    const k = s.pose(p).k3;
    // The knee tracks the toes: the foot (heel to toe) lies within 15 degrees of the plane through hip, knee and ankle.
    // From p = 0.5 on, where the bend is deep enough for a twist to matter.
    if (p >= 0.5) {
      const n = dbLatLungeCross(dbLatLungeSub(k.hipN, k.kneeN), dbLatLungeSub(k.ankleN, k.kneeN)), foot = dbLatLungeSub(k.toeN, k.heelN);
      const off = (Math.asin(Math.abs(dbLatLungeDot(n, foot)) / (dbLatLungeLen(n) * dbLatLungeLen(foot))) * 180) / Math.PI;
      assert.ok(off <= 15, `p=${p}: the foot is ${off.toFixed(1)} degrees out of the bent knee's plane, so the knee twists off the toes`);
    }
    // Near the bottom the knee sits over the foot: not caving in, not out past it, and at most 6 px (5 cm) past the toes.
    if (p >= 0.8) {
      const lo = Math.min(k.heelN[0], k.toeN[0]) - 3, hi = Math.max(k.heelN[0], k.toeN[0]) + 3;
      assert.ok(k.kneeN[0] >= lo && k.kneeN[0] <= hi, `p=${p}: knee x ${k.kneeN[0].toFixed(1)} is off the foot ${lo.toFixed(1)} to ${hi.toFixed(1)}`);
      assert.ok(k.kneeN[2] <= k.toeN[2] + 6, `p=${p}: the knee is ${(k.kneeN[2] - k.toeN[2]).toFixed(1)} px past the toes`);
      assert.ok(k.kneeN[2] >= k.ankleN[2], `p=${p}: the knee is behind the ankle`);
    }
  }
});

test('the dumbbell lateral lunge keeps the centre of mass between the feet, side to side and front to back', () => {
  const s = dbLatLunge();
  for (const p of dbLatLungeSamples()) {
    const k = s.pose(p).k3, c = dbLatLungeCentreOfMass(k);
    assert.ok(c[0] > k.ankleN[0] && c[0] < k.ankleF[0], `p=${p}: centre of mass x ${c[0].toFixed(1)} is not between the feet`);
    const back = Math.max(k.heelN[2], k.heelF[2]), front = Math.min(k.toeN[2], k.toeF[2]);
    assert.ok(c[2] >= back && c[2] <= front, `p=${p}: centre of mass z ${c[2].toFixed(1)} is off the feet ${back.toFixed(1)} to ${front.toFixed(1)}`);
  }
});

test('the dumbbell lateral lunge sits back into the bent leg at the bottom', () => {
  // Tip: sit back into that leg. Most of the weight goes over the bent leg and the hips go back, as in a squat.
  const k = dbLatLunge().pose(1).k3, c = dbLatLungeCentreOfMass(k);
  const share = (k.ankleF[0] - c[0]) / (k.ankleF[0] - k.ankleN[0]);
  assert.ok(share >= 0.65, `only ${(share * 100).toFixed(1)} percent of the weight is over the bent leg`);
  assert.ok(k.pelvis[2] <= -15, `the hips are only ${(-k.pelvis[2]).toFixed(1)} px back`);
});

test('the dumbbell lateral lunge keeps the chest up and square, and both feet flat where they landed', () => {
  const s = dbLatLunge(), start = s.pose(0).k3;
  for (const p of dbLatLungeSamples()) {
    const k = s.pose(p).k3, t = dbLatLungeSub(k.neck, k.pelvis);
    const lean = (Math.acos(-t[1] / dbLatLungeLen(t)) * 180) / Math.PI;
    assert.ok(lean <= 35, `p=${p}: the torso is ${lean.toFixed(1)} degrees from vertical`);
    const tilt = (Math.asin(Math.abs(t[0]) / dbLatLungeLen(t)) * 180) / Math.PI;
    assert.ok(tilt <= 10, `p=${p}: the torso tips ${tilt.toFixed(1)} degrees to the side`);
    for (const f of ['heelN', 'toeN', 'heelF', 'toeF']) {
      assert.equal(k[f][1], D.FLOOR - 4, `p=${p}: ${f} is off the floor`);
      assert.deepEqual(k[f], start[f], `p=${p}: ${f} moved`);
    }
  }
});

test('the dumbbell lateral lunge holds the dumbbell at the chest with both hands that you can see', () => {
  const s = dbLatLunge(), { INK, FAR, LIME } = D.COLORS;
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];
  for (const p of dbLatLungeSamples()) {
    const j = s.pose(p), k = j.k3, parts = s.draw(p);
    // Elbows down under the hands and tucked at the ribs, measured in the torso's own frame: the hold rides on the
    // torso, so leaning forward must not count as the elbows lifting.
    const t = dbLatLungeSub(k.neck, k.pelvis), up = t.map((v) => v / dbLatLungeLen(t));
    for (const [sh, el, ha] of [['shoulderN', 'elbowN', 'handN'], ['shoulderF', 'elbowF', 'handF']]) {
      const inside = dbLatLungeAngle(k[sh], k[el], k[ha]);
      assert.ok(inside >= 28, `p=${p}: an elbow folds to ${inside.toFixed(1)} degrees`);
      const below = dbLatLungeDot(dbLatLungeSub(k[ha], k[el]), up);
      assert.ok(below >= 20, `p=${p}: ${el} is only ${below.toFixed(1)} px below the hands along the torso`);
      const out = Math.abs(k[el][0] - k.neck[0]) - Math.abs(k[sh][0] - k.neck[0]);
      assert.ok(out <= 8, `p=${p}: ${el} flares ${out.toFixed(1)} px out past the shoulder`);
    }
    // In the drawing: each hand is a FAR circle painted over the INK top head (not hidden under it), overlapping the
    // head's lower half where the hands cup it, one on each side of the handle; the LIME band is painted last.
    const head = parts.findIndex((x) => x.kind === 'seg' && x.color === INK && same(x.a, j.topL) && same(x.b, j.topR));
    assert.ok(head >= 0, `p=${p}: no INK top head on the dumbbell`);
    const [a, b] = [j.topL, j.topR], ab = [b[0] - a[0], b[1] - a[1]];
    const toHead = (q) => {
      const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * ab[0] + (q[1] - a[1]) * ab[1]) / (ab[0] ** 2 + ab[1] ** 2)));
      return Math.hypot(q[0] - (a[0] + ab[0] * t), q[1] - (a[1] + ab[1] * t));
    };
    for (const [hand, sideOf] of [['handN', -1], ['handF', 1]]) {
      const i = parts.findIndex((x) => x.kind === 'circle' && x.fill === FAR && same(x.c, j[hand]));
      assert.ok(i > head, `p=${p}: ${hand} is ${i < 0 ? 'not drawn' : 'painted under the top head'}`);
      assert.ok(toHead(j[hand]) < parts[i].r + parts[head].w / 2 - 2, `p=${p}: ${hand} does not touch the top head`);
      assert.ok(j[hand][1] > j.bellTop[1], `p=${p}: ${hand} is above the top head, not cupping it from below`);
      assert.ok(sideOf * (j[hand][0] - j.bellTop[0]) > 0, `p=${p}: ${hand} is on the wrong side of the handle`);
    }
    const apart = Math.hypot(j.handN[0] - j.handF[0], j.handN[1] - j.handF[1]);
    assert.ok(apart >= 12, `p=${p}: the hands are ${apart.toFixed(1)} px apart, so they read as one`);
    const last = parts[parts.length - 1];
    assert.ok(last.kind === 'seg' && last.color === LIME && last.w >= 5, `p=${p}: the LIME band is not on top`);
    // The top head of the dumbbell, keyline included, stays clear of the head circle in the drawing.
    const gap = toHead(j.head) - 7.5 - D.L.head;
    assert.ok(gap >= 2, `p=${p}: the dumbbell is ${gap.toFixed(1)} px from the chin`);
  }
});

test('the dumbbell lateral lunge stays inside the box and clear of the chip', () => {
  const CHIP = { x0: 12, y0: 12, x1: 124, y1: 51 }; // the floor line is 3 px wide, so a foot may sit 1.5 px into FLOOR
  const points = (part) => {
    if (part.kind === 'circle') return [[part.c, part.r]];
    const line = (a, b, r) => Array.from({ length: 21 }, (_, i) => [[a[0] + ((b[0] - a[0]) * i) / 20, a[1] + ((b[1] - a[1]) * i) / 20], r]);
    if (part.kind === 'seg') return line(part.a, part.b, part.w / 2);
    return part.pts.flatMap((p, i) => line(p, part.pts[(i + 1) % part.pts.length], 0));
  };
  const s = dbLatLunge(), count = s.draw(0).length;
  for (const p of dbLatLungeSamples(100)) {
    const parts = s.draw(p);
    assert.equal(parts.length, count, `p=${p}: the parts list changes length`);
    for (const part of parts) for (const [[x, y], r] of points(part)) {
      assert.ok(x - r >= 0 && x + r <= D.W && y - r >= 0 && y + r <= D.FLOOR + 1.5, `p=${p}: a ${part.kind} leaves the box or sinks through the floor line at ${x.toFixed(0)},${y.toFixed(0)}`);
      assert.ok(!(x + r > CHIP.x0 && x - r < CHIP.x1 && y + r > CHIP.y0 && y - r < CHIP.y1), `p=${p}: a ${part.kind} runs under the chip at ${x.toFixed(0)},${y.toFixed(0)}`);
    }
  }
});
}

// dumbbell-single-leg-rdl: the scene's own form rules (designed with an independent form critic).
{
// Single leg dumbbell deadlift (dumbbell-single-leg-rdl). Kit: one dumbbell in the hand opposite the standing leg.
// Tip: soft knee, hips back, the other leg lifting straight behind as the dumbbell slides to mid shin, hips square,
// drive the hips forward to stand. The far (right) leg stands, the near (left) leg lifts, the near (left) hand holds it.
// The helpers live in one object with a scene specific name, so this block can sit next to the other scenes' tests.
const singleLegRdl = {
  scene: () => D.SCENES.find((s) => s.name === 'dumbbell-single-leg-rdl'),
  ps: (n = 200) => Array.from({ length: n + 1 }, (_, i) => i / n),
  angle(a, b, c) { // inner angle at b, in degrees
    const u = [a[0] - b[0], a[1] - b[1]], v = [c[0] - b[0], c[1] - b[1]];
    return (Math.acos((u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v))) * 180) / Math.PI;
  },
  // Whole body centre of mass x from the standard segment shares (head 8, trunk 50, thighs 10, shanks 4.5, feet 1.5,
  // arms 5 each), plus the dumbbell as a share of body mass (0 for the body alone, 0.15 for a 12 kg dumbbell at 80 kg).
  comX(j, bell = 0) {
    const at = (a, b, t = 0.5) => a[0] + (b[0] - a[0]) * t;
    const parts = [
      [j.head[0], 0.08], [at(j.hip, j.shoulder), 0.5],
      [at(j.hip, j.kneeN, 0.43), 0.1], [at(j.hipF, j.kneeF, 0.43), 0.1],
      [at(j.kneeN, j.ankleN), 0.045], [at(j.kneeF, j.ankleF), 0.045],
      [at(j.heelN, j.toeN), 0.015], [at(j.heelF, j.toeF), 0.015],
      [at(j.shoulder, j.elbowN), 0.028], [at(j.elbowN, j.handN), 0.022],
      [at(j.shoulderF, j.elbowF), 0.028], [at(j.elbowF, j.handF), 0.022],
      [j.bell[0], bell],
    ];
    return parts.reduce((s, [x, w]) => s + x * w, 0) / (1 + bell);
  },
};

test('single leg dumbbell deadlift: no clamps, the standing foot stays planted, and the body stays balanced over it', () => {
  const s = singleLegRdl.scene();
  const top = s.pose(0);
  for (const p of singleLegRdl.ps()) {
    const j = s.pose(p);
    assert.equal(j.clamps, 0, `p=${p}: a limb was pulled out of reach`);
    assert.ok(j.heelF[1] === D.FLOOR - 4 && j.toeF[1] === D.FLOOR - 4, `p=${p}: the standing foot is not flat on the floor`);
    for (const k of ['ankleF', 'heelF', 'toeF']) assert.deepEqual(j[k], top[k], `p=${p}: the standing foot moved (${k})`);
    // The base of support is the standing foot alone: the lifted foot never carries weight.
    const [lo, hi] = [j.toeF[0], j.heelF[0]];
    for (const [what, x] of [['body', singleLegRdl.comX(j)], ['body and dumbbell', singleLegRdl.comX(j, 0.15)]]) {
      assert.ok(x >= lo + 3 && x <= hi - 3, `p=${p}: ${what} centre of mass x ${x.toFixed(1)} is not over the standing foot ${lo} to ${hi}`);
    }
  }
});

test('single leg dumbbell deadlift: a soft standing knee, a straight lifted leg, and the lifted foot never sinks into the floor', () => {
  const s = singleLegRdl.scene();
  let lastToe = Infinity;
  for (const p of singleLegRdl.ps()) {
    const j = s.pose(p);
    const bend = 180 - singleLegRdl.angle(j.hipF, j.kneeF, j.ankleF);
    assert.ok(bend >= 3 && bend <= 20, `p=${p}: the standing knee is bent ${bend.toFixed(1)} degrees`);
    const lifted = singleLegRdl.angle(j.hip, j.kneeN, j.ankleN);
    assert.ok(lifted >= 170, `p=${p}: the lifted knee is at ${lifted.toFixed(1)} degrees, not straight`);
    for (const pt of [j.toeN, j.heelN, j.ankleN]) assert.ok(pt[1] <= D.FLOOR - 4 + 1e-9, `p=${p}: the lifted foot dips to y ${pt[1].toFixed(1)}`);
    assert.ok(j.toeN[1] <= lastToe + 1e-9, `p=${p}: the lifted toe drops back towards the floor`);
    lastToe = j.toeN[1];
    if (p >= 0.15) assert.ok(j.toeN[1] + 5 <= D.FLOOR - 1.5, `p=${p}: the lifted foot still touches the floor line`);
  }
  const bottom = s.pose(1);
  const bend = 180 - singleLegRdl.angle(bottom.hipF, bottom.kneeF, bottom.ankleF);
  assert.ok(bend >= 10 && bend <= 25, `the standing knee ends bent ${bend.toFixed(1)} degrees`);
});

test('single leg dumbbell deadlift: hips back to a flat torso with the lifted leg in line, hips square, and forward to stand', () => {
  const s = singleLegRdl.scene();
  const lean = (j) => (Math.atan2(j.hip[0] - j.shoulder[0], j.hip[1] - j.shoulder[1]) * 180) / Math.PI; // forward of vertical
  const top = s.pose(0), bottom = s.pose(1);
  assert.ok(lean(top) <= 8, `the start leans ${lean(top).toFixed(1)} degrees, not standing tall`);
  assert.ok(lean(bottom) >= 60 && lean(bottom) <= 80, `the torso ends ${lean(bottom).toFixed(1)} degrees from vertical`);
  const line = singleLegRdl.angle(bottom.shoulder, bottom.hip, bottom.ankleN);
  assert.ok(line >= 170, `the lifted leg is ${(180 - line).toFixed(1)} degrees out of line with the torso`);
  assert.ok(bottom.toeN[1] > bottom.heelN[1] + 15, 'the lifted toes do not point at the floor at the bottom');
  let lastHip = -Infinity;
  for (const p of singleLegRdl.ps()) {
    const j = s.pose(p);
    // Hips square, seen from the side: if the pelvis turned open, the lifted foot would turn out with it, so it would
    // stop being square to its shin and the toes would swing away from the floor.
    const foot = [j.toeN[0] - j.heelN[0], j.toeN[1] - j.heelN[1]], shin = [j.ankleN[0] - j.kneeN[0], j.ankleN[1] - j.kneeN[1]];
    const square = (Math.acos((foot[0] * shin[0] + foot[1] * shin[1]) / (Math.hypot(...foot) * Math.hypot(...shin))) * 180) / Math.PI;
    assert.ok(Math.abs(square - 90) <= 10, `p=${p}: the lifted foot is at ${square.toFixed(1)} degrees to its shin, the hip has turned`);
    assert.ok(j.toeN[1] - j.heelN[1] >= 8, `p=${p}: the lifted toe is only ${(j.toeN[1] - j.heelN[1]).toFixed(1)} px below the heel`);
    assert.ok(j.hip[0] >= lastHip - 1e-9, `p=${p}: the hips move forward on the way down`); // facing left, back is larger x
    lastHip = j.hip[0];
    assert.ok(Math.abs(j.hip[1] - top.hip[1]) <= 5, `p=${p}: the hips drop ${(j.hip[1] - top.hip[1]).toFixed(1)} px, a squat, not a hinge`);
  }
  assert.ok(bottom.hip[0] - top.hip[0] >= 15, `the hips only travel back ${(bottom.hip[0] - top.hip[0]).toFixed(1)} px`);
});

test('single leg dumbbell deadlift: the dumbbell hangs straight down from the shoulder to mid shin, the free arm hangs beside it', () => {
  const s = singleLegRdl.scene();
  for (const p of singleLegRdl.ps()) {
    const j = s.pose(p);
    assert.ok(Math.abs(j.bell[0] - j.shoulder[0]) < 0.5, `p=${p}: the dumbbell is ${(j.bell[0] - j.shoulder[0]).toFixed(1)} px off the shoulder line`);
    assert.ok(j.bell[0] === j.handN[0] && j.bell[1] === j.handN[1], `p=${p}: the dumbbell left the near hand`);
    // ik clamps at 0.995 of the arm's length, so about 168 degrees is the straightest arm it draws.
    const elbow = singleLegRdl.angle(j.shoulder, j.elbowN, j.handN);
    assert.ok(elbow >= 165, `p=${p}: the loaded arm bends to ${elbow.toFixed(1)} degrees, it should hang straight`);
    // The free hand hangs from its own shoulder, as straight as the loaded arm, not bent onto the dumbbell.
    assert.ok(Math.abs(j.handF[0] - j.shoulderF[0]) < 0.5, `p=${p}: the free hand is ${(j.handF[0] - j.shoulderF[0]).toFixed(1)} px off its shoulder line`);
    const free = singleLegRdl.angle(j.shoulderF, j.elbowF, j.handF);
    assert.ok(Math.abs(free - elbow) <= 3, `p=${p}: the free elbow at ${free.toFixed(1)} degrees is bent unlike the loaded one at ${elbow.toFixed(1)}`);
    assert.ok(j.bell[1] + 12.5 <= D.FLOOR - 2, `p=${p}: the dumbbell touches the floor`);
  }
  const j = s.pose(1);
  assert.ok(j.bell[1] > j.kneeF[1] && j.bell[1] < j.ankleF[1], `the dumbbell ends at y ${j.bell[1].toFixed(1)}, not between the knee ${j.kneeF[1].toFixed(1)} and the ankle ${j.ankleF[1].toFixed(1)}`);
  const share = (j.bell[1] - j.kneeF[1]) / (j.ankleF[1] - j.kneeF[1]);
  assert.ok(share >= 0.25 && share <= 0.75, `the dumbbell ends ${(share * 100).toFixed(0)} percent of the way down the shin, not mid shin`);
});

test('single leg dumbbell deadlift: inside the box and clear of the chip at every frame', () => {
  const s = singleLegRdl.scene();
  const CHIP = { x0: 12, y0: 12, x1: 124, y1: 51 };
  const line = (a, b, r) => Array.from({ length: 21 }, (_, i) => [[a[0] + ((b[0] - a[0]) * i) / 20, a[1] + ((b[1] - a[1]) * i) / 20], r]);
  for (const p of singleLegRdl.ps(100)) for (const part of s.draw(p)) {
    const pts = part.kind === 'circle' ? [[part.c, part.r]]
      : part.kind === 'seg' ? line(part.a, part.b, part.w / 2)
        : part.pts.flatMap((q, i) => line(q, part.pts[(i + 1) % part.pts.length], 0));
    for (const [[x, y], r] of pts) {
      assert.ok(x - r >= 0 && x + r <= D.W && y - r >= 0 && y + r <= D.H, `p=${p}: a ${part.kind} leaves the box at ${x.toFixed(0)},${y.toFixed(0)}`);
      assert.ok(!(x + r > CHIP.x0 && x - r < CHIP.x1 && y + r > CHIP.y0 && y - r < CHIP.y1), `p=${p}: a ${part.kind} runs under the chip at ${x.toFixed(0)},${y.toFixed(0)}`);
    }
  }
});
}

test('the single leg deadlift draws the standing leg dark enough to read', () => {
  const s = scene('dumbbell-single-leg-rdl'), j = s.pose(1);
  const same = (a, b) => a[0] === b[0] && a[1] === b[1]; // draw() works out the pose again, so compare positions
  const leg = s.draw(1).filter((x) => x.kind === 'seg' && (same(x.a, j.hipF) || same(x.a, j.kneeF)));
  assert.equal(leg.length, 2, 'the thigh and the shin of the standing leg');
  for (const part of leg) assert.ok(contrast(part.color, BOX_DARKEST) >= 3, `the standing leg is ${contrast(part.color, BOX_DARKEST).toFixed(2)} to 1 on ${BOX_DARKEST}`);
});
