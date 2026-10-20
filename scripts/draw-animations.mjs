// Draws the flat animations for the versions no free source animates (ExerciseDB, free-exercise-db, wger and Wikimedia
// Commons were checked on 2026-10-19, see docs/research/README.md), and the offline view of versions whose live
// animation has no free picture of the same form. Run with `npm run draw`.
// Output per scene: media/drawn/<name>.svg, an animated SVG with a see-through background that the app shows in the
// animation box, and media/drawn/<name>-still.svg, the finished position, also see-through: the list thumbnail (on white)
// and the box when the phone asks for reduced motion.
// Every scene has pose(p), the joints at rep phase p (0 = start, 1 = end), and draw(p), the figure as segments and circles.
// The file samples one rep at SAMPLES points and writes them as SMIL values, so the browser interpolates between them
// and the hands stay on the bar, the feet on the floor, without any script in the SVG.
// Importing this file writes nothing: tests/drawn.test.mjs checks the poses and that the shipped files match render().
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const OUT = new URL('../media/drawn/', import.meta.url);
export const W = 400, H = 300, FLOOR = 250; // the floor sits above the caption chip the app lays over the bottom of the box
// BENCH is 3.1 to 1 against the darkest box colour and against INK, so the bench reads and the figure reads on it.
const INK = '#2A2E36', FAR = '#A1A8B3', BAR = '#0E0F12', LIME = '#C6F432', LINE = '#C9CED6', BENCH = '#717985';
export const COLORS = { INK, FAR, BAR, LIME, LINE, BENCH };
export const SAMPLES = 40;

// Body lengths in px for a figure about 215 px tall, side view, facing left (forward is -x).
export const L = { head: 15, neck: 9, torso: 62, upper: 42, fore: 44, thigh: 55, shin: 52, foot: 24 };
const WIDTH = { torso: 26, thigh: 20, shin: 16, upper: 15, fore: 13, foot: 10 };

const rad = (d) => (d * Math.PI) / 180;
const add = (p, q) => [p[0] + q[0], p[1] + q[1]];
// SVG angles: 0 points right, 90 points down, -90 points up.
const polar = (p, len, deg) => [p[0] + len * Math.cos(rad(deg)), p[1] + len * Math.sin(rad(deg))];
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const lerp = (a, b, t) => a + (b - a) * t;
const r1 = (n) => String(Math.round(n * 10) / 10);

// Two bone inverse kinematics: the middle joint of a limb from root to target, bent to one side (+1 or -1).
// A target out of reach is pulled in along the same line, so a limb never stretches; clamped says that happened.
export function ik(root, target, l1, l2, bend) {
  let d = dist(root, target);
  const max = (l1 + l2) * 0.995;
  let t = target, clamped = false;
  if (d > max) { t = [root[0] + ((target[0] - root[0]) * max) / d, root[1] + ((target[1] - root[1]) * max) / d]; d = max; clamped = true; }
  const a = Math.acos(Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const base = Math.atan2(t[1] - root[1], t[0] - root[0]);
  const mid = [root[0] + l1 * Math.cos(base + bend * a), root[1] + l1 * Math.sin(base + bend * a)];
  return { mid, end: t, clamped };
}
// Finds x in [lo, hi] where f(x) = 0, for a monotonic f.
function solve(f, lo, hi) {
  let flo = f(lo);
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2; const fm = f(mid);
    if ((fm < 0) === (flo < 0)) { lo = mid; flo = fm; } else hi = mid;
  }
  return (lo + hi) / 2;
}
// One rep: p goes 0 to 1 and back, with a short hold at each end and soft turns. out is the share of the moving time
// spent going 0 to 1; 0.5 is an even rep.
export function phase(t, out = 0.5) {
  const hold = 0.04, move = 1 - 4 * hold, t1 = hold + move * out, t2 = t1 + 2 * hold;
  const s = t < t1 ? (t - hold) / (t1 - hold) : 1 - (t - t2) / (1 - hold - t2);
  const c = Math.min(1, Math.max(0, s));
  return c * c * (3 - 2 * c);
}
// The p values render() samples over one loop. Lowering the weight takes 60 percent of the moving time, as the chest
// press, leg extension and leg curl tips ask (with control, slowly) and as good form for the rest: that is p going 1 to 0
// for a lift that starts low (lowers 'back') and 0 to 1 for a squat or a hinge that starts standing (lowers 'out').
const LOWERING = 0.6;
export const repPhases = (scene) => Array.from({ length: SAMPLES + 1 }, (_, i) => phase(i / SAMPLES, scene.lowers === 'out' ? LOWERING : 1 - LOWERING));

const seg = (a, b, w, color) => ({ kind: 'seg', a, b, w, color });
const circle = (c, r, fill) => ({ kind: 'circle', c, r, fill });
const poly = (pts, fill) => ({ kind: 'poly', pts, fill });

// The figure from its joints. Far limbs first, then the body, then the near limbs, so the near side sits in front.
function far(j) {
  return [
    seg(j.shoulderF, j.elbowF, WIDTH.upper, FAR), seg(j.elbowF, j.handF, WIDTH.fore, FAR), circle(j.handF, 7, FAR),
    seg(j.hipF, j.kneeF, WIDTH.thigh, FAR), seg(j.kneeF, j.ankleF, WIDTH.shin, FAR), seg(j.heelF, j.toeF, WIDTH.foot, FAR),
  ];
}
function body(j) {
  return [seg(j.hip, j.shoulder, WIDTH.torso, INK), circle(j.head, L.head, INK)];
}
function nearLeg(j) {
  return [seg(j.hip, j.kneeN, WIDTH.thigh, INK), seg(j.kneeN, j.ankleN, WIDTH.shin, INK), seg(j.heelN, j.toeN, WIDTH.foot, INK)];
}
function nearArm(j) {
  return [seg(j.shoulder, j.elbowN, WIDTH.upper, INK), seg(j.elbowN, j.handN, WIDTH.fore, INK), circle(j.handN, 7, INK)];
}
// A foot flat on the floor under an ankle: heel just behind it, toes in front.
const flatFoot = (ankle) => ({ heel: [ankle[0] + 7, FLOOR - 4], toe: [ankle[0] - L.foot + 4, FLOOR - 4] });
const clampCount = (...limbs) => limbs.filter((x) => x.clamped).length;

// The landmine: a sleeve on the floor at A, the bar up to the hands, the plate just inside the hands (edge on from the side).
function landmine(A, hand) {
  const ang = (Math.atan2(hand[1] - A[1], hand[0] - A[0]) * 180) / Math.PI;
  const plate = polar(hand, 24, ang + 180);
  const p1 = polar(plate, 22, ang + 90), p2 = polar(plate, 22, ang - 90);
  return {
    base: [poly([[A[0] - 12, FLOOR], [A[0] + 16, FLOOR], [A[0] + 9, FLOOR - 14], [A[0] - 5, FLOOR - 14]], INK)],
    bar: [seg(A, polar(hand, 6, ang), 6, BAR), seg(p1, p2, 9, BAR), seg(polar(plate, 19, ang + 90), polar(plate, 19, ang - 90), 4, LIME)],
  };
}
// Hands on a bar end that swings on the arc around A: from the start position to arm's reach from the shoulder.
function barArc(A, start, shoulderAtEnd, reach) {
  const len = dist(A, start);
  const at = (deg) => polar(A, len, -deg);
  const a0 = (Math.atan2(A[1] - start[1], start[0] - A[0]) * 180) / Math.PI;
  const a1 = solve((deg) => dist(at(deg), shoulderAtEnd) - reach, a0, 89);
  return { at, a0, a1 };
}

// Standing figure: hip, lean in degrees forward of vertical, the two ankles. Legs with a soft knee, head looking forward.
function standing(hip, lean, ankleN, ankleF) {
  const shoulder = polar(hip, L.torso, -90 - lean);
  const head = polar(shoulder, L.neck + L.head, -90 - lean - 12);
  const hipF = add(hip, [3, 2]);
  const legN = ik(hip, ankleN, L.thigh, L.shin, 1), legF = ik(hipF, ankleF, L.thigh, L.shin, 1);
  const fN = flatFoot(ankleN), fF = flatFoot(ankleF);
  return { hip, hipF, shoulder, shoulderF: add(shoulder, [4, 3]), head, kneeN: legN.mid, ankleN, heelN: fN.heel, toeN: fN.toe, kneeF: legF.mid, ankleF, heelF: fF.heel, toeF: fF.toe, clamps: clampCount(legN, legF) };
}
// A landmine scene's parts, in the drawing order every landmine scene uses.
const landmineParts = (j) => { const lm = landmine(j.A, j.handN); return [lm.base, far(j), body(j), lm.bar, nearLeg(j), nearArm(j)].flat(); };

// 1. Landmine chest press: both hands on the bar end at mid chest, pressed up and away until the arms are nearly straight.
function chestPress(p) {
  const A = [34, FLOOR];
  const hip = [306, FLOOR - 114]; // high enough for a soft knee: a straight leg needs about 114 px from hip to floor
  const pose = (q) => standing(hip, 5 + 3 * q, [300, FLOOR - 8], [308, FLOOR - 6]);
  const start = add(pose(0).shoulder, [-20, 12]);
  const arc = barArc(A, start, pose(1).shoulder, (L.upper + L.fore) * 0.98); // nearly straight arms at the top
  const j = pose(p);
  const hand = arc.at(lerp(arc.a0, arc.a1, p));
  const armN = ik(j.shoulder, hand, L.upper, L.fore, -1), armF = ik(j.shoulderF, add(hand, [4, 3]), L.upper, L.fore, -1);
  return Object.assign(j, { A, elbowN: armN.mid, handN: hand, elbowF: armF.mid, handF: armF.end, clamps: j.clamps + clampCount(armN, armF) });
}

// 2. Single arm landmine press: bar end at the front of the shoulder, opposite foot forward, pressed up and forward.
function shoulderPress(p) {
  const A = [34, FLOOR];
  const hip = [304, FLOOR - 113];
  const pose = (q) => standing(hip, 3 + 4 * q, [320, FLOOR - 8], [281, FLOOR - 8]); // the far (opposite) foot forward
  const start = add(pose(0).shoulder, [-23, -2]); // at the front of the shoulder, with the elbow folded as far as a real one
  const arc = barArc(A, start, pose(1).shoulder, (L.upper + L.fore) * 0.99); // a straight arm at the top
  const j = pose(p);
  const hand = arc.at(lerp(arc.a0, arc.a1, p));
  const armN = ik(j.shoulder, hand, L.upper, L.fore, -1);
  const handF = add(j.hipF, [-2, -4]);
  const armF = ik(j.shoulderF, handF, L.upper, L.fore, -1);
  return Object.assign(j, { A, elbowN: armN.mid, handN: hand, elbowF: armF.mid, handF: armF.end, clamps: j.clamps + clampCount(armN, armF) });
}

// 3. Landmine squat: bar end held at the chest, hips back and down to parallel, the hands riding the bar's arc.
function squat(p) {
  const A = [34, FLOOR];
  // The feet sit under the body and the torso stays fairly upright, so the knees travel forward over the toes and the
  // body's weight stays over the feet all the way down (the bar end held at the chest is what allows that).
  const ankleN = [320, FLOOR - 8], ankleF = [328, FLOOR - 6];
  const chest = [-20, 12]; // the hands relative to the shoulder
  const lean = (q) => lerp(14, 12, q);
  const standShoulder = polar([316, FLOOR - 114], L.torso, -90 - lean(0));
  const start = add(standShoulder, chest);
  const len = dist(A, start);
  const at = (deg) => polar(A, len, -deg);
  const a0 = (Math.atan2(A[1] - start[1], start[0] - A[0]) * 180) / Math.PI;
  const hipAt = (deg, q) => polar(add(at(deg), [-chest[0], -chest[1]]), L.torso, 90 - lean(q));
  const a1 = solve((deg) => hipAt(deg, 1)[1] - (FLOOR - 56), a0, a0 - 20); // bottom: the hips 58 px lower, thighs near parallel
  const q = p;
  const hand = at(lerp(a0, a1, q));
  const shoulder = add(hand, [-chest[0], -chest[1]]);
  const hip = polar(shoulder, L.torso, 90 - lean(q));
  const head = polar(shoulder, L.neck + L.head, -90 - lean(q) - 12);
  const hipF = add(hip, [3, 2]);
  const legN = ik(hip, ankleN, L.thigh, L.shin, 1), legF = ik(hipF, ankleF, L.thigh, L.shin, 1);
  const fN = flatFoot(ankleN), fF = flatFoot(ankleF);
  const shoulderF = add(shoulder, [4, 3]);
  const armN = ik(shoulder, hand, L.upper, L.fore, -1), armF = ik(shoulderF, add(hand, [3, 2]), L.upper, L.fore, -1);
  return { A, hip, hipF, shoulder, shoulderF, head, kneeN: legN.mid, ankleN, heelN: fN.heel, toeN: fN.toe, kneeF: legF.mid, ankleF, heelF: fF.heel, toeF: fF.toe, elbowN: armN.mid, handN: hand, elbowF: armF.mid, handF: armF.end, clamps: clampCount(legN, legF, armN, armF) };
}

// 4. Dumbbell leg extension: seated on the end of a bench, a dumbbell between the feet, knees extended until the legs are straight.
function legExtension(p) {
  const seatY = FLOOR - 64, seat = [185, 352]; // about 0.53 m, high enough for the dumbbell to clear the floor; the knees at the edge
  const hip = [232, seatY - 6], hipF = [236, seatY - 4];
  const lean = -6 - 2 * p;
  const shoulder = polar(hip, L.torso, -90 - lean);
  const head = polar(shoulder, L.neck + L.head, -90 - lean + 4);
  const knee = add(hip, [-L.thigh, 0]), kneeF = add(hipF, [-L.thigh, 0]);
  const shin = lerp(90, 178, p); // hanging straight down, then out in front until the legs are straight
  const ankle = polar(knee, L.shin, shin), ankleF = polar(kneeF, L.shin, shin);
  const toe = (a) => polar(a, L.foot - 4, shin + 90);
  const heel = (a) => polar(a, 5, shin - 90);
  const bell = add(polar(ankle, 13, shin + 90), polar([0, 0], 8, shin + 180));
  const handN = [hip[0] + 14, seatY + 2], handF = [hipF[0] + 18, seatY + 3];
  const armN = ik(shoulder, handN, L.upper, L.fore, -1), armF = ik(add(shoulder, [4, 3]), handF, L.upper, L.fore, -1);
  return { seatY, seat, bell, hip, hipF, shoulder, shoulderF: add(shoulder, [4, 3]), head, kneeN: knee, ankleN: ankle, heelN: heel(ankle), toeN: toe(ankle), kneeF, ankleF, heelF: heel(ankleF), toeF: toe(ankleF), elbowN: armN.mid, handN, elbowF: armF.mid, handF, clamps: clampCount(armN, armF) };
}
function legExtensionParts(j) {
  const { seatY, seat } = j;
  const bench = [
    poly([[seat[0] + 14, seatY + 12], [seat[0] + 24, seatY + 12], [seat[0] + 24, FLOOR], [seat[0] + 14, FLOOR]], BENCH),
    poly([[seat[1] - 24, seatY + 12], [seat[1] - 14, seatY + 12], [seat[1] - 14, FLOOR], [seat[1] - 24, FLOOR]], BENCH),
    poly([[seat[0], seatY], [seat[1], seatY], [seat[1], seatY + 12], [seat[0], seatY + 12]], BENCH),
  ];
  const dumbbell = [circle(j.bell, 16, INK), circle(j.bell, 6, LIME)];
  return [bench, far(j), body(j), nearLeg(j), dumbbell, nearArm(j)].flat();
}

// 5. Dumbbell hamstring curl: face down on a flat bench with the knees just past its end, a dumbbell held upright between
// the feet (top head resting on the soles, handle squeezed between the arches), curled from long legs to a right angle.
function legCurl(p) {
  const benchY = FLOOR - 54; // the top of the pad, 0.45 m up
  const hip = [187, benchY - 13], shoulder = [hip[0] - L.torso, benchY - 13]; // hips and chest resting on the pad
  const head = polar(shoulder, L.neck + L.head, 188); // in line with the body, the face just clear of the pad
  const thigh = 3; // degrees below horizontal, the thigh lying on the pad
  const knee = polar(hip, L.thigh, thigh);
  const bench = [knee[0] - 8 - 145, knee[0] - 8]; // 1.2 m long, ending just short of the knee so the lower leg swings free
  const shin = lerp(thigh - 12, thigh - 95, p); // knee at 168 degrees, then curled to 95 degrees of flexion
  const ankle = polar(knee, L.shin, shin);
  const u = (o, len) => polar(o, len, shin), v = (o, len) => polar(o, len, shin + 90); // along the shin, towards the toes
  const sole = u(ankle, 4); // the foot's centre line, square to the shin
  const heel = v(sole, -7), toe = v(sole, 20);
  // The dumbbell, fixed to the feet: its handle between the arches, square to the soles, the top head (12 px thick,
  // 24 across) resting on the soles and the bottom head 19 px of handle further down, in front of the ankles. The handle
  // runs 11 px in front of the shin line, just clear of the near shin (half widths 8 + 3), so it shows between the heads.
  const axis = v(ankle, 11);
  const top = u(axis, 4 + 5 + 6), bottom = u(axis, 4 + 5 - 19 - 6);
  const bell = { top, bottom, topEnds: [v(top, -6), v(top, 6)], bottomEnds: [v(bottom, -6), v(bottom, 6)] };
  const FO = [4, -2]; // the far side, just behind the near one
  const handN = [bench[0] + 4, benchY + 8], handF = add(handN, FO); // gripping the front end of the pad
  const shoulderF = add(shoulder, FO);
  const armN = ik(shoulder, handN, L.upper, L.fore, -1), armF = ik(shoulderF, handF, L.upper, L.fore, -1);
  return {
    benchY, bench, bell, hip, hipF: add(hip, FO), shoulder, shoulderF, head,
    kneeN: knee, ankleN: ankle, heelN: heel, toeN: toe, kneeF: add(knee, FO), ankleF: add(ankle, FO), heelF: add(heel, FO), toeF: add(toe, FO),
    elbowN: armN.mid, handN, elbowF: armF.mid, handF, clamps: clampCount(armN, armF),
  };
}
function legCurlParts(j) {
  const { benchY, bench: [x0, x1] } = j;
  const box = (a, b, c, d) => poly([[a, b], [c, b], [c, d], [a, d]], BENCH);
  const bench = [
    box(x0 + 16, benchY + 12, x0 + 26, FLOOR), box(x1 - 26, benchY + 12, x1 - 16, FLOOR), // the uprights
    box(x0 + 6, FLOOR - 5, x0 + 36, FLOOR), box(x1 - 36, FLOOR - 5, x1 - 6, FLOOR), // the feet
    box(x0, benchY, x1, benchY + 12), // the pad
  ];
  const { top, bottom, topEnds, bottomEnds } = j.bell;
  const dumbbell = [
    seg(bottom, top, 6, BAR),
    seg(...bottomEnds, 12, BAR), seg(...bottomEnds, 4, LIME),
    seg(...topEnds, 12, BAR), seg(...topEnds, 4, LIME),
  ];
  // The far arm holds the far side of the pad, so it goes behind the bench; the far leg goes in front of it. The arm's
  // parts are picked out of far(j) by the joints they start from, not by their place in the list, so a part added to
  // far() or a change in its order still lands on the right side of the pad.
  const arm = [j.shoulderF, j.elbowF, j.handF];
  const onArm = (q) => arm.includes(q.kind === 'circle' ? q.c : q.a);
  const f = far(j), farArm = f.filter(onArm), farLeg = f.filter((q) => !onArm(q));
  // The dumbbell sits between the far leg and the near one, so the near foot passes in front of the handle.
  return [farArm, bench, farLeg, dumbbell, body(j), nearLeg(j), nearArm(j)].flat();
}

// 6. Dumbbell lateral lunge with a goblet hold, drawn from the FRONT, because a side view cannot show a lunge to the side.
// The joints are built in 3D (x to screen right, which is the figure's left; y down; z toward the viewer) and drawn by
// dropping z, so the angles the tests measure are the real ones, not the drawn ones. N is the figure's right side
// (screen left) and is the lunging leg; F is the figure's left side, the leg that stays straight.
// The feet stay planted in the stepped out stance for the whole loop: p = 0 stands tall between them, p = 1 sits back into
// the right leg with the knee near 90 degrees, the left leg straight and the chest up, and p going back to 0 is the push
// off that foot back to standing.
const DB_LAT_LUNGE = {
  ankleN: [141, FLOOR - 8, 0], ankleF: [269, FLOOR - 8, 0], // 128 px apart, about 1.06 m, centred on x 205
  hipHalf: 11, // hip joints 22 px apart, about 18 cm
  shoulderHalf: 20, // shoulder joints 40 px apart, about 33 cm
  kneeTop: 175, kneeBottom: 85, // lunging knee, inner angle in degrees; the other knee stays at kneeTop
  sitBack: -21, // the hips move back 21 px (about 17 cm) at the bottom
  leanTop: 3, leanBottom: 28, // torso, degrees forward of vertical
  turnN: 30, turnF: 30, // toes turned out, degrees
  kneeOut: 6, // the bent knee points 6 degrees outside its toe line, a little of the shin rotation a bent knee allows
  handOff: 9, // each hand 9 px to the side of the handle, cupping the top head
};
const dbLatLungeV = {
  add: (...vs) => vs.reduce((a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]),
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  norm: (a) => { const n = Math.hypot(a[0], a[1], a[2]); return [a[0] / n, a[1] / n, a[2] / n]; },
};
// Two bone limb in 3D: the middle joint of a limb from root to target, bent toward pole. A target out of reach is pulled
// in like ik() does; reach is the share of l1 + l2 counted as reachable.
function dbLatLungeLimb(root, target, l1, l2, pole, reach = 0.995) {
  const v = dbLatLungeV.sub(target, root);
  let d = Math.hypot(v[0], v[1], v[2]), clamped = false;
  const dir = dbLatLungeV.mul(v, 1 / d);
  if (d > (l1 + l2) * reach) { d = (l1 + l2) * reach; clamped = true; }
  const t = dbLatLungeV.add(root, dbLatLungeV.mul(dir, d));
  const side = dbLatLungeV.norm(dbLatLungeV.sub(pole, dbLatLungeV.mul(dir, dbLatLungeV.dot(pole, dir))));
  const a = Math.acos(Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  return { mid: dbLatLungeV.add(root, dbLatLungeV.mul(dir, l1 * Math.cos(a)), dbLatLungeV.mul(side, l1 * Math.sin(a))), end: t, clamped };
}
// The way a foot points: forward (toward the viewer), turned out by turn degrees toward side (-1 screen left, +1 right).
const dbLatLungeHeading = (turn, side) => [side * Math.sin(rad(turn)), 0, Math.cos(rad(turn))];
// A foot flat on the floor under an ankle, pointing along its heading.
function dbLatLungeFoot(ankle, heading) {
  const at = (k) => [ankle[0] + heading[0] * k, FLOOR - 4, ankle[2] + heading[2] * k];
  return { heel: at(-7), toe: at(L.foot - 4) };
}
function dbLateralLunge(p) {
  const C = DB_LAT_LUNGE, { ankleN, ankleF } = C, V = dbLatLungeV;
  // Legs are driven by knee angle, so the hip to ankle distance always comes from the law of cosines and is in reach.
  const span = (deg) => Math.sqrt(L.thigh ** 2 + L.shin ** 2 - 2 * L.thigh * L.shin * Math.cos(rad(deg)));
  const dN = span(lerp(C.kneeTop, C.kneeBottom, p)), dF = span(C.kneeTop);
  const zp = lerp(0, C.sitBack, p);
  // A level pelvis whose two hip joints sit dN from the right ankle and dF from the left one (two spheres, closed form).
  const s = ankleF[0] - ankleN[0] - 2 * C.hipHalf;
  const u = (dN * dN - dF * dF + s * s) / (2 * s);
  const h2 = dN * dN - u * u - zp * zp;
  const hipN = [ankleN[0] + u, ankleN[1] - Math.sqrt(Math.max(0, h2)), zp], hipF = V.add(hipN, [2 * C.hipHalf, 0, 0]);
  // Each knee bends toward its own toes, so the foot lies in (or, for the bent knee, within kneeOut degrees of) the plane
  // of hip, knee and ankle: the knee tracks the toes. Seen from the front, the few degrees out make the bend read deeper.
  const toesN = dbLatLungeHeading(C.turnN, -1), toesF = dbLatLungeHeading(C.turnF, 1);
  const legN = dbLatLungeLimb(hipN, ankleN, L.thigh, L.shin, dbLatLungeHeading(C.turnN + C.kneeOut, -1), 1);
  const legF = dbLatLungeLimb(hipF, ankleF, L.thigh, L.shin, toesF, 1);
  const fN = dbLatLungeFoot(ankleN, toesN), fF = dbLatLungeFoot(ankleF, toesF);
  // Torso: leaned forward by lean degrees, no side lean. up runs from the pelvis to the shoulders, fwd points out of the chest.
  const lean = rad(lerp(C.leanTop, C.leanBottom, p)), look = lean * 0.4; // the neck stays a little more upright: eyes forward
  const up = [0, -Math.cos(lean), Math.sin(lean)], fwd = [0, Math.sin(lean), Math.cos(lean)], side = [1, 0, 0];
  const pelvis = V.mul(V.add(hipN, hipF), 0.5);
  const neck = V.add(pelvis, V.mul(up, L.torso));
  const head = V.add(neck, V.mul([0, -Math.cos(look), Math.sin(look)], L.neck + L.head));
  const shoulderN = V.add(neck, V.mul(side, -C.shoulderHalf)), shoulderF = V.add(neck, V.mul(side, C.shoulderHalf));
  // Goblet hold: both hands cup the underside of the dumbbell's top head just below the collarbones, the handle upright in
  // front of the sternum, the upper arms hanging at the sides of the ribs and the forearms folded up to the hands.
  const grip = V.add(neck, V.mul(up, -8), V.mul(fwd, 25));
  const handN = V.add(grip, V.mul(side, -C.handOff)), handF = V.add(grip, V.mul(side, C.handOff));
  const elbowPole = V.add(V.mul(up, -1), V.mul(fwd, 0.3)); // elbows down, tucked in at the ribs
  const armN = dbLatLungeLimb(shoulderN, handN, L.upper, L.fore, elbowPole), armF = dbLatLungeLimb(shoulderF, handF, L.upper, L.fore, elbowPole);
  const bellTop = V.add(grip, V.mul(up, 7)), bellBot = V.add(bellTop, V.mul(up, -28));
  const k3 = {
    pelvis, neck, head, hipN, hipF, shoulderN, shoulderF, kneeN: legN.mid, ankleN, heelN: fN.heel, toeN: fN.toe,
    kneeF: legF.mid, ankleF, heelF: fF.heel, toeF: fF.toe, elbowN: armN.mid, handN, elbowF: armF.mid, handF, bellTop, bellBot,
  };
  const at = (q) => [q[0], q[1]]; // front view: drop z
  const j = Object.fromEntries(Object.entries(k3).map(([k, q]) => [k, at(q)]));
  const along = (q, a, b) => at(V.add(q, V.mul(side, a), V.mul(up, b))); // a point offset in the torso's frame
  return Object.assign(j, {
    hip: j.hipN, shoulder: j.shoulderN, k3,
    // the drawn torso and dumbbell, set in by their round caps
    waist: along(pelvis, 0, 14), chest: along(neck, 0, -14), neckTop: at(V.add(neck, V.mul([0, -Math.cos(look), Math.sin(look)], 10))),
    topL: along(bellTop, -5, 0), topR: along(bellTop, 5, 0), botL: along(bellBot, -5, 0), botR: along(bellBot, 5, 0),
    capL: along(bellTop, -5, 2.5), capR: along(bellTop, 5, 2.5),
    clamps: clampCount(legN, legF, armN, armF) + (h2 < 0 ? 1 : 0),
  });
}
// Front view paint order: both legs INK, the pelvis, torso, neck and head INK, both arms FAR so they read over the dark
// torso, the dumbbell in INK over a FAR keyline, then the two FAR hands over the lower half of its top head (the fingers
// wrap the front of it), and the LIME band last, on the top edge of that head above the hands.
function dbLateralLungeParts(j) {
  const leg = (hip, knee, ankle, heel, toe) => [seg(hip, knee, WIDTH.thigh, INK), seg(knee, ankle, WIDTH.shin, INK), seg(heel, toe, WIDTH.foot, INK)];
  const arm = (shoulder, elbow, hand) => [seg(shoulder, elbow, WIDTH.upper, FAR), seg(elbow, hand, WIDTH.fore, FAR)];
  return [
    leg(j.hipF, j.kneeF, j.ankleF, j.heelF, j.toeF), leg(j.hipN, j.kneeN, j.ankleN, j.heelN, j.toeN),
    seg(j.hipN, j.hipF, 24, INK), seg(j.waist, j.chest, 34, INK), seg(j.shoulderN, j.shoulderF, 14, INK), seg(j.neck, j.neckTop, 12, INK), circle(j.head, L.head, INK),
    arm(j.shoulderN, j.elbowN, j.handN), arm(j.shoulderF, j.elbowF, j.handF),
    seg(j.botL, j.botR, 15, FAR), seg(j.topL, j.topR, 15, FAR), // a light keyline, so the dark dumbbell reads on the dark torso
    seg(j.bellTop, j.bellBot, 5, INK), seg(j.botL, j.botR, 12, INK), seg(j.topL, j.topR, 12, INK),
    circle(j.handN, 7, FAR), circle(j.handF, 7, FAR), seg(j.capL, j.capR, 6, LIME),
  ].flat();
}

// 7. Single leg dumbbell deadlift: standing on the far (right) leg with the dumbbell in the near (left) hand, the opposite
// hand. Soft knee, hips back, the near leg lifting straight behind in line with the torso while the dumbbell hangs
// straight down from the shoulder to mid shin. The hips stay square (the lifted foot stays square to its shin, toes
// down), the standing foot stays planted, and the standing shin goes from a little forward to a little back of vertical,
// so the hips travel back on the way down, the loaded body stays over the middle of the foot, and they drive forward to stand.
function singleLegDeadlift(p) {
  const ankleF = [194, FLOOR - 8];
  const fF = flatFoot(ankleF);
  const lean = lerp(3, 79, p), kneeSoft = lerp(5, 18, p), shinTilt = lerp(4, -3, p); // degrees: torso from vertical, standing knee bend, shin forward of vertical
  const kneeF = polar(ankleF, L.shin, -90 - shinTilt);
  const hipF = polar(kneeF, L.thigh, -90 - shinTilt + kneeSoft);
  const hip = add(hipF, [-3, -2]);
  const shoulder = polar(hip, L.torso, -90 - lean), shoulderF = add(shoulder, [4, 3]);
  const head = polar(shoulder, L.neck + L.head, -90 - lean - lerp(12, 6, p)); // the neck stays in line with the back
  // The lifted leg: from just behind the standing heel, toes resting on the floor, to straight back in line with the torso.
  const legBack = lerp(14, 79, p), knee = lerp(8, 3, p);
  const kneeN = polar(hip, L.thigh, 90 - legBack);
  const shin = 90 - legBack - knee;
  const ankleN = polar(kneeN, L.shin, shin);
  const sole = polar(ankleN, 4, shin); // the foot square to the shin, the toes pointing at the floor
  const heelN = polar(sole, 7, shin - 90), toeN = polar(sole, L.foot - 4, shin + 90);
  // Both arms hang straight down from their own shoulders, as long as ik draws an arm without clamping it (elbow about
  // 168 degrees). The free arm hangs parallel to the loaded one: a grey edge behind the ink arm, its fist a sliver below.
  const handN = add(shoulder, [0, 85.5]);
  const armN = ik(shoulder, handN, L.upper, L.fore, -1);
  const armF = ik(shoulderF, add(handN, [4, 3]), L.upper, L.fore, -1);
  return { bell: handN, hip, hipF, shoulder, shoulderF, head, kneeN, ankleN, heelN, toeN, kneeF, ankleF, heelF: fF.heel, toeF: fF.toe, elbowN: armN.mid, handN, elbowF: armF.mid, handF: armF.end, clamps: clampCount(armN, armF) };
}
// A dumbbell in a neutral grip seen from the side: the handle runs front to back through the fist, a head at each end.
function singleLegDeadliftParts(j) {
  const c = j.bell;
  const head = (dx) => [seg(add(c, [dx, -7]), add(c, [dx, 7]), 11, BAR), seg(add(c, [dx, -5]), add(c, [dx, 5]), 4, LIME)];
  const dumbbell = [seg(add(c, [-13, 0]), add(c, [13, 0]), 5, BAR), head(-13), head(13)].flat();
  // The standing leg is the one to copy, so it is drawn darker than a far limb (3.1 to 1 on the box), still lighter than
  // the near side so it reads as behind.
  const standing = (q) => q.a === j.hipF || q.a === j.kneeF || q.a === j.heelF;
  const farSide = far(j).map((q) => (standing(q) ? { ...q, color: BENCH } : q));
  return [farSide, body(j), nearLeg(j), dumbbell, nearArm(j)].flat();
}

export const SCENES = [
  { name: 'landmine-chest-press', title: 'Landmine chest press', pose: chestPress, parts: landmineParts, dur: 2.6, lowers: 'back', stillAt: 1 },
  { name: 'landmine-shoulder-press', title: 'Single arm landmine press', pose: shoulderPress, parts: landmineParts, dur: 2.6, lowers: 'back', stillAt: 1 },
  { name: 'landmine-squat', title: 'Landmine squat', pose: squat, parts: landmineParts, dur: 3.2, lowers: 'out', stillAt: 1 },
  { name: 'dumbbell-leg-extension', title: 'Dumbbell leg extension', pose: legExtension, parts: legExtensionParts, dur: 2.8, lowers: 'back', stillAt: 1 },
  { name: 'dumbbell-leg-curl', title: 'Dumbbell hamstring curl', pose: legCurl, parts: legCurlParts, dur: 2.8, lowers: 'back', stillAt: 1 },
  { name: 'dumbbell-lateral-lunge', title: 'Dumbbell lateral lunge', pose: dbLateralLunge, parts: dbLateralLungeParts, dur: 3, lowers: 'out', stillAt: 1 },
  { name: 'dumbbell-single-leg-rdl', title: 'Single leg dumbbell deadlift', pose: singleLegDeadlift, parts: singleLegDeadliftParts, dur: 3.6, lowers: 'out', stillAt: 1 },
].map((s) => ({ ...s, draw: (p) => s.parts(s.pose(p)) }));

const pathD = (s) => `M${r1(s.a[0])} ${r1(s.a[1])} L${r1(s.b[0])} ${r1(s.b[1])}`;
const polyPts = (s) => s.pts.map((p) => `${r1(p[0])},${r1(p[1])}`).join(' ');

// The scene sampled over one rep. Each part keeps its place in the list, so values line up across samples.
export function render(scene, still) {
  const dur = scene.dur;
  const frames = still ? [scene.draw(scene.stillAt)] : repPhases(scene).map((p) => scene.draw(p)); // the still is the finished position
  const first = frames[0];
  const anim = (attr, values) => (new Set(values).size > 1 ? `<animate attributeName="${attr}" dur="${dur}s" repeatCount="indefinite" values="${values.join(';')}"/>` : '');
  const out = [];
  first.forEach((part, i) => {
    const at = frames.map((f) => f[i]);
    if (part.kind === 'seg') {
      const inner = anim('d', at.map(pathD));
      const open = `<path d="${pathD(part)}" stroke="${part.color}" stroke-width="${part.w}" stroke-linecap="round" fill="none"`;
      out.push(inner ? `${open}>${inner}</path>` : `${open}/>`);
    } else if (part.kind === 'circle') {
      const cx = anim('cx', at.map((c) => r1(c.c[0]))), cy = anim('cy', at.map((c) => r1(c.c[1])));
      out.push(`<circle cx="${r1(part.c[0])}" cy="${r1(part.c[1])}" r="${part.r}" fill="${part.fill}">${cx}${cy}</circle>`);
    } else out.push(`<polygon points="${polyPts(part)}" fill="${part.fill}"/>`);
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${scene.title}">
<title>${scene.title}${still ? '' : ', drawn animation'}</title>
<line x1="24" y1="${FLOOR}" x2="${W - 24}" y2="${FLOOR}" stroke="${LINE}" stroke-width="3" stroke-linecap="round"/>
${out.join('\n')}
</svg>
`;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  for (const s of SCENES) {
    await writeFile(new URL(`${s.name}.svg`, OUT), render(s, false));
    await writeFile(new URL(`${s.name}-still.svg`, OUT), render(s, true));
    console.log(`${s.name}: ${s.dur}s rep, ${SAMPLES} samples`);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
