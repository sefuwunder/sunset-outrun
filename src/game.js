// src/game.js — pure ESM: car physics, collisions, timer/checkpoints, forks, scoring.
// Shared by `bun test` and the browser. No DOM, no bun APIs.

import {
  SEG_LEN, ROAD_WIDTH, PLAYER_Z, MAX_SPEED,
  clamp, overlap, findSegment, buildStage, STAGES, STAGE_TREE, nextStageIndex,
} from './road.js';

export { STAGES, STAGE_TREE, nextStageIndex, MAX_SPEED };

export const OFFROAD_LIMIT = 1.0;   // |playerX| beyond this = off road
export const PLAYER_BOUND = 2.6;    // hard clamp for playerX
export const CRASH_Z = 280;         // z window for traffic collision
export const CRASH_W = 0.42;        // lateral window for traffic collision
export const CHECKPOINT_BONUS = 30; // seconds added per cleared stage

export function createGame() {
  return {
    mode: 'title',            // title | bgm | countdown | race | results | gameover
    round: 0,                 // 0-based round (0..4)
    idxInRound: 0,            // stage position within the round
    stage: null,              // built stage {segments, cars, length, def}
    route: [],                // stage indices driven, in order
    position: 0,              // camera z in world units
    playerX: 0,               // -1..1 on road (units of ROAD_WIDTH)
    speed: 0,
    timeLeft: 0,
    totalTime: 0,
    score: 0,
    countdownT: 0,
    forkChoice: null,         // 'left' | 'right' | null (set by player in fork zone)
    inForkZone: false,
    crashTimer: 0,            // >0 while spinning after a crash
    offroad: false,
    skid: 0,                  // 0..1 lateral slide amount (for sfx)
    bgmTrack: 0,
  };
}

export function startRace(g, bgmTrack = 0) {
  g.mode = 'countdown';
  g.round = 0; g.idxInRound = 0; g.route = [];
  g.score = 0; g.totalTime = 0;
  g.bgmTrack = bgmTrack;
  g.crashTimer = 0; g.forkChoice = null;
  loadStage(g, STAGE_TREE[0][0]);
  g.countdownT = 3.2;
}

export function loadStage(g, stageIndex) {
  const def = STAGES[stageIndex];
  g.stage = buildStage(def);
  g.route.push(stageIndex);
  g.position = 0;
  g.playerX = 0;
  g.speed = 0;
  g.timeLeft = def.time;
  g.forkChoice = null;
  g.inForkZone = false;
  g.crashTimer = 0;
}

// One physics tick. input: {left,right,up,down}. Returns event flags.
export function update(g, input, dt) {
  const ev = { checkpoint: false, finished: false, timeout: false, crashed: false, fork: null };
  if (g.mode !== 'race') return ev;

  const speedPercent = g.speed / MAX_SPEED;
  const seg = findSegment(g.stage.segments, g.position + PLAYER_Z);

  // --- longitudinal ---
  if (g.crashTimer > 0) {
    g.crashTimer -= dt;
    g.speed = Math.max(0, g.speed - MAX_SPEED * 1.2 * dt);
  } else if (input.up) {
    g.speed += (MAX_SPEED / 4.5) * dt;
  } else if (input.down) {
    g.speed -= MAX_SPEED * 0.95 * dt;
  } else {
    g.speed -= (MAX_SPEED / 6) * dt;
  }
  g.offroad = Math.abs(g.playerX) > OFFROAD_LIMIT;
  if (g.offroad && g.speed > MAX_SPEED * 0.32) {
    g.speed -= (MAX_SPEED * 0.9) * dt; // rumble-strip drag
  }
  g.speed = clamp(g.speed, 0, MAX_SPEED);

  // --- lateral ---
  const dx = dt * 2.2 * speedPercent;
  let steer = 0;
  if (g.crashTimer <= 0) {
    if (input.left) { g.playerX -= dx; steer = -1; }
    if (input.right) { g.playerX += dx; steer = 1; }
    // centrifugal push on curves
    g.playerX -= dx * speedPercent * seg.curve * 0.32;
  }
  g.playerX = clamp(g.playerX, -PLAYER_BOUND, PLAYER_BOUND);
  g.skid = clamp(Math.abs(steer) * speedPercent * 1.4 - 0.35, 0, 1);

  // --- traffic ---
  for (const car of g.stage.cars) {
    car.z += car.speed * dt;
    if (car.z > g.stage.length) car.z -= g.stage.length * 0.92;
    if (car.z < g.position - PLAYER_Z * 3) car.z = g.position + (0.55 + Math.random() * 0.4) * g.stage.length * 0.5 + PLAYER_Z * 4;
    // passed-car bonus
    if (!car.passed && car.z < g.position - CRASH_Z && speedPercent > 0.5) {
      car.passed = true;
      g.score += 500;
    }
  }

  // --- collisions ---
  if (g.crashTimer <= 0) {
    for (const car of g.stage.cars) {
      const dz = car.z - g.position;
      if (Math.abs(dz) < CRASH_Z && overlap(g.playerX, 0.36, car.offset, 0.5, 1)) {
        g.crashTimer = 1.1;
        g.speed = Math.min(g.speed, MAX_SPEED * 0.22);
        ev.crashed = true;
        break;
      }
    }
  }

  // --- advance ---
  g.position += g.speed * dt;
  g.totalTime += dt;
  g.timeLeft -= dt;
  g.score += speedPercent * 110 * dt;

  // --- fork zone tracking ---
  const cur = findSegment(g.stage.segments, g.position + PLAYER_Z);
  g.inForkZone = !!cur.forkZone;
  if (g.inForkZone) {
    if (input.left) g.forkChoice = 'left';
    else if (input.right) g.forkChoice = 'right';
  }

  // --- checkpoint / finish ---
  if (g.position >= g.stage.length) {
    const choice = g.forkChoice || (g.playerX < -0.15 ? 'left' : 'right');
    if (g.round < 4) {
      ev.checkpoint = true;
      ev.fork = g.stage.def.fork ? choice : null;
      const carry = g.timeLeft + CHECKPOINT_BONUS;
      g.round += 1;
      g.idxInRound = choice === 'left' ? g.idxInRound : g.idxInRound + 1;
      g.idxInRound = clamp(g.idxInRound, 0, STAGE_TREE[g.round].length - 1);
      loadStage(g, STAGE_TREE[g.round][g.idxInRound]);
      g.timeLeft = Math.min(carry, 99); // bonus survives the stage reload
    } else {
      ev.finished = true;
      g.mode = 'results';
      g.score += Math.round(g.timeLeft * 100); // remaining time converts to score
    }
    return ev;
  }

  if (g.timeLeft <= 0) {
    g.timeLeft = 0;
    g.mode = 'gameover';
    ev.timeout = true;
  }
  return ev;
}

// Helpers for tests / UI
export function speedKmh(g) { return Math.round((g.speed / MAX_SPEED) * 280); }
export function currentSegment(g) { return findSegment(g.stage.segments, g.position + PLAYER_Z); }
export function stageProgress(g) { return clamp(g.position / g.stage.length, 0, 1); }
export function chooseFork(g, choice) { g.forkChoice = choice; }
