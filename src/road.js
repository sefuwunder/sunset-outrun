// src/road.js — pure ESM: pseudo-3D road math + track building.
// Shared by `bun test` and the browser (imported as /src/road.js). No DOM, no bun APIs.

export const SEG_LEN = 200;          // world units per road segment
export const RUMBLE_LEN = 3;         // segments per light/dark alternation
export const ROAD_WIDTH = 2000;      // road half-width in world units
export const DRAW_DISTANCE = 200;    // segments rendered per frame
export const CAMERA_HEIGHT = 1100;
export const CAMERA_DEPTH = 0.84;    // ~1/tan(fov/2)
export const PLAYER_Z = CAMERA_HEIGHT * CAMERA_DEPTH;
export const MAX_SPEED = SEG_LEN * 60; // 12000 world units / second

// ---------- small math helpers ----------
export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
export function interpolate(a, b, p) { return a + (b - a) * p; }
export function easeIn(a, b, p) { return a + (b - a) * p * p; }
export function easeInOut(a, b, p) { return a + (b - a) * (-Math.cos(p * Math.PI) / 2 + 0.5); }
export function overlap(x1, w1, x2, w2, percent = 1) {
  const half1 = (w1 * percent) / 2, half2 = (w2 * percent) / 2;
  return !((x1 + half1) < (x2 - half2) || (x2 + half2) < (x1 - half1));
}

// Deterministic RNG so tracks (and tests) are reproducible.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Project a world point into camera + screen space (mutates p, like the classic).
export function project(p, cameraX, cameraY, cameraZ, width, height) {
  if (width === undefined || height === undefined)
    throw new Error('project: width/height are required (silent NaN road otherwise)');
  p.camera.x = (p.world.x || 0) - cameraX;
  p.camera.y = (p.world.y || 0) - cameraY;
  p.camera.z = (p.world.z || 0) - cameraZ;
  const scale = CAMERA_DEPTH / Math.max(p.camera.z, 0.0001);
  p.screen.scale = scale;
  p.screen.x = Math.round(width / 2 + scale * p.camera.x * (width / 2));
  p.screen.y = Math.round(height / 2 - scale * p.camera.y * (height / 2));
  p.screen.w = Math.round(scale * ROAD_WIDTH * (width / 2));
  return p;
}

export function findSegment(segments, z) {
  const n = segments.length;
  return segments[Math.floor(z / SEG_LEN) % n];
}

// ---------- stage catalogue ----------
// 15 stages in 5 rounds (1+2+3+4+5), OutRun-style. After rounds 1..4 the road
// forks: from round-r stage i, LEFT leads to round-(r+1) stage i,
// RIGHT to round-(r+1) stage i+1.
export const STAGE_TREE = [[0], [1, 2], [3, 4, 5], [6, 7, 8, 9], [10, 11, 12, 13, 14]];

export function nextStageIndex(round, idxInRound, choice) {
  // round: 0-based round just finished (0..3). Returns index into STAGES.
  const next = STAGE_TREE[round + 1];
  const i = choice === 'left' ? idxInRound : idxInRound + 1;
  return next[clamp(i, 0, next.length - 1)];
}

// parts: [segmentCount, curve(-6..6), hillTotalWorldY]
export const STAGES = [
  { name: 'Sunset Coast', theme: 'coast', seed: 11, time: 55, traffic: 0.35, fork: true,
    parts: [[120, 0, 0], [90, 2, 400], [90, -2, -400], [120, 0, 0], [80, 4, 0], [80, -4, 600], [120, 0, -600]] },
  { name: 'Palm Breeze', theme: 'palm', seed: 22, time: 55, traffic: 0.45, fork: true,
    parts: [[100, 0, 0], [100, -3, 300], [70, 3, 300], [110, 0, -600], [90, 5, 0], [90, -5, 0], [100, 0, 0]] },
  { name: 'Cactus Run', theme: 'desert', seed: 33, time: 55, traffic: 0.45, fork: true,
    parts: [[140, 0, 200], [80, 4, -200], [80, -4, 500], [100, 0, -500], [100, 2, 0], [100, -2, 0], [80, 0, 0]] },
  { name: 'Coral Drive', theme: 'coast', seed: 44, time: 60, traffic: 0.5, fork: true,
    parts: [[110, 0, 0], [90, -4, 600], [90, 4, -600], [120, 0, 0], [70, 6, 0], [70, -6, 400], [110, 0, -400]] },
  { name: 'Neon Dunes', theme: 'desert', seed: 55, time: 60, traffic: 0.5, fork: true,
    parts: [[120, 0, -300], [100, 3, 300], [100, -3, 300], [80, 0, -300], [90, -5, 0], [90, 5, 0], [100, 0, 0]] },
  { name: 'Harbor Lights', theme: 'city', seed: 66, time: 60, traffic: 0.6, fork: true,
    parts: [[100, 0, 0], [110, 2, 0], [110, -2, 400], [90, 4, -400], [90, -4, 0], [100, 0, 300], [80, 0, -300]] },
  { name: 'Coconut Mile', theme: 'palm', seed: 77, time: 62, traffic: 0.55, fork: true,
    parts: [[120, 0, 400], [80, -6, -400], [80, 6, 0], [100, 0, 500], [100, -3, -500], [90, 3, 0], [110, 0, 0]] },
  { name: 'Mirage Pass', theme: 'desert', seed: 88, time: 62, traffic: 0.55, fork: true,
    parts: [[90, 0, 0], [120, 4, 700], [120, -4, -700], [80, 0, 0], [100, 6, 300], [100, -6, -300], [70, 0, 0]] },
  { name: 'Bayview', theme: 'coast', seed: 99, time: 62, traffic: 0.6, fork: true,
    parts: [[110, 0, 0], [90, 5, -500], [90, -5, 500], [110, 0, 0], [80, -4, 400], [80, 4, -400], [120, 0, 0]] },
  { name: 'Downtown Rush', theme: 'city', seed: 111, time: 62, traffic: 0.7, fork: true,
    parts: [[100, 0, 0], [100, -2, 0], [100, 2, 600], [100, -6, -600], [100, 6, 0], [80, 0, 400], [100, 0, -400]] },
  { name: 'Sunset Strip', theme: 'city', seed: 122, time: 65, traffic: 0.65, fork: false,
    parts: [[120, 0, 0], [90, 3, 500], [90, -3, -500], [110, 4, 0], [110, -4, 0], [90, 0, 600], [90, 0, -600]] },
  { name: 'Golden Gate', theme: 'coast', seed: 133, time: 65, traffic: 0.65, fork: false,
    parts: [[100, 0, -400], [110, -4, 400], [110, 4, 400], [90, 0, -400], [100, 6, 0], [100, -6, 0], [90, 0, 0]] },
  { name: 'Oasis End', theme: 'desert', seed: 144, time: 65, traffic: 0.6, fork: false,
    parts: [[130, 0, 300], [90, 5, -300], [90, -5, 600], [100, 0, -600], [90, 3, 0], [90, -3, 0], [110, 0, 0]] },
  { name: 'Palm Finale', theme: 'palm', seed: 155, time: 65, traffic: 0.6, fork: false,
    parts: [[110, 0, 0], [100, -5, 500], [100, 5, -500], [90, 0, 0], [110, -3, 400], [110, 3, -400], [70, 0, 0]] },
  { name: 'Horizon', theme: 'coast', seed: 166, time: 70, traffic: 0.7, fork: false,
    parts: [[120, 0, 600], [100, 4, -600], [100, -4, 0], [100, 6, 700], [100, -6, -700], [80, 0, 0], [100, 0, 0]] },
];

const THEME_SPRITES = {
  coast: ['palm', 'palm', 'sign', 'billboard', 'rock'],
  palm: ['palm', 'palm', 'palm', 'sign', 'billboard'],
  desert: ['cactus', 'rock', 'rock', 'sign', 'billboard'],
  city: ['lamp', 'billboard', 'sign', 'building', 'lamp'],
};

export function buildStage(def) {
  const segments = [];
  const rng = mulberry32(def.seed);
  let y = 0;

  function addSegment(curve, y1, y2) {
    const n = segments.length;
    segments.push({
      index: n, curve,
      p1: { world: { x: 0, y: y1, z: n * SEG_LEN }, camera: {}, screen: {} },
      p2: { world: { x: 0, y: y2, z: (n + 1) * SEG_LEN }, camera: {}, screen: {} },
      sprites: [],
      color: Math.floor(n / RUMBLE_LEN) % 2,
      forkZone: false, finish: false,
    });
  }
  function addRoad(enter, hold, leave, curve, dy) {
    const startY = y, endY = startY + dy;
    const total = enter + hold + leave;
    for (let n = 0; n < enter; n++)
      addSegment(easeIn(0, curve, n / enter), easeInOut(startY, endY, n / total), easeInOut(startY, endY, (n + 1) / total));
    for (let n = 0; n < hold; n++)
      addSegment(curve, easeInOut(startY, endY, (enter + n) / total), easeInOut(startY, endY, (enter + n + 1) / total));
    for (let n = 0; n < leave; n++)
      addSegment(easeInOut(curve, 0, n / leave), easeInOut(startY, endY, (enter + hold + n) / total), easeInOut(startY, endY, (enter + hold + n + 1) / total));
    y = endY;
  }

  addRoad(40, 40, 40, 0, 0); // start straight
  for (const [count, curve, hill] of def.parts) {
    const enter = clamp(Math.floor(count / 5), 8, 40);
    const leave = enter;
    const hold = Math.max(0, count - enter - leave);
    addRoad(enter, hold, leave, curve, hill);
  }
  addRoad(20, 20, 20, 0, 0); // finish straight

  const total = segments.length;
  // start gantry + finish line
  segments[8].sprites.push({ type: 'gantry', offset: 0 });
  for (let i = 1; i <= 4; i++) segments[total - i].finish = true;

  // fork zone: last 150 segments get choice signage
  if (def.fork) {
    for (let i = total - 150; i < total - 8; i++) {
      segments[i].forkZone = true;
      if (i % 18 === 0) {
        segments[i].sprites.push({ type: 'fork-left', offset: -1.7 });
        segments[i].sprites.push({ type: 'fork-right', offset: 1.7 });
      }
    }
  }

  // roadside decoration
  const pool = THEME_SPRITES[def.theme] || THEME_SPRITES.palm;
  for (let i = 30; i < total - 10; i += 12 + Math.floor(rng() * 14)) {
    const side = rng() < 0.5 ? -1 : 1;
    const type = pool[Math.floor(rng() * pool.length)];
    segments[i].sprites.push({ type, offset: side * (1.35 + rng() * 1.6) });
    if (rng() < 0.3) {
      const type2 = pool[Math.floor(rng() * pool.length)];
      segments[i + 4].sprites.push({ type: type2, offset: -side * (1.35 + rng() * 1.6) });
    }
  }

  // traffic cars: flat list with absolute z
  const cars = [];
  const nCars = Math.round(total * def.traffic / 45);
  for (let i = 0; i < nCars; i++) {
    cars.push({
      offset: (rng() * 1.6 - 0.8),
      z: (0.08 + 0.88 * rng()) * total * SEG_LEN,
      speed: MAX_SPEED * (0.28 + rng() * 0.24),
      color: Math.floor(rng() * 5),
      passed: false,
    });
  }
  // keep the start clear
  for (const c of cars) if (c.z < 60 * SEG_LEN) c.z += 60 * SEG_LEN;

  return { segments, cars, length: total * SEG_LEN, totalSegments: total, def };
}
