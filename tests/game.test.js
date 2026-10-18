// tests/game.test.js — bun test for src/game.js
import { describe, test, expect } from 'bun:test';
import {
  MAX_SPEED,
  createGame, startRace, loadStage, update,
  speedKmh, stageProgress, chooseFork, nextStageIndex,
  OFFROAD_LIMIT, PLAYER_BOUND, CRASH_Z, CHECKPOINT_BONUS,
} from '../src/game.js';
import { STAGES, STAGE_TREE, SEG_LEN, PLAYER_Z } from '../src/road.js';

const NO_INPUT = { left: false, right: false, up: false, down: false };
const GAS = { left: false, right: false, up: true, down: false };

function racingGame() {
  const g = createGame();
  startRace(g, 0);
  g.mode = 'race'; // skip countdown for logic tests
  return g;
}

describe('lifecycle', () => {
  test('createGame defaults', () => {
    const g = createGame();
    expect(g.mode).toBe('title');
    expect(g.speed).toBe(0);
    expect(g.score).toBe(0);
  });
  test('startRace loads stage 1 with its time limit', () => {
    const g = createGame();
    startRace(g, 2);
    expect(g.mode).toBe('countdown');
    expect(g.route).toEqual([0]);
    expect(g.timeLeft).toBe(STAGES[0].time);
    expect(g.bgmTrack).toBe(2);
  });
  test('update is a no-op outside race mode', () => {
    const g = createGame();
    startRace(g);
    const ev = update(g, GAS, 1);
    expect(g.position).toBe(0);
    expect(ev.checkpoint).toBe(false);
  });
});

describe('physics', () => {
  test('gas accelerates at MAX_SPEED/4.5 per second', () => {
    const g = racingGame();
    update(g, GAS, 1);
    expect(g.speed).toBeCloseTo(MAX_SPEED / 4.5, 6);
  });
  test('speed never exceeds MAX_SPEED', () => {
    const g = racingGame();
    for (let i = 0; i < 30; i++) update(g, GAS, 0.5);
    expect(g.speed).toBeLessThanOrEqual(MAX_SPEED);
  });
  test('brake sheds speed fast', () => {
    const g = racingGame();
    g.speed = MAX_SPEED;
    update(g, { ...NO_INPUT, down: true }, 0.5);
    expect(g.speed).toBeLessThan(MAX_SPEED * 0.6);
  });
  test('offroad drag is much stronger than rolling decel', () => {
    const a = racingGame(), b = racingGame();
    a.speed = b.speed = MAX_SPEED * 0.8;
    a.playerX = 0; b.playerX = OFFROAD_LIMIT + 0.5;
    update(a, GAS, 1); update(b, GAS, 1);
    expect(b.speed).toBeLessThan(a.speed * 0.5);
    expect(b.offroad).toBe(true);
    expect(a.offroad).toBe(false);
  });
  test('steering moves playerX and clamps at bounds', () => {
    const g = racingGame();
    g.stage.cars.length = 0; // no traffic interference
    const gasLeft = { left: true, right: false, up: true, down: false };
    g.speed = MAX_SPEED / 2;
    update(g, gasLeft, 1);
    expect(g.playerX).toBeLessThan(0);
    for (let i = 0; i < 20; i++) update(g, gasLeft, 1);
    expect(g.playerX).toBe(PLAYER_BOUND * -1);
  });
  test('centrifugal force pushes outward on curves', () => {
    const g = racingGame();
    g.speed = MAX_SPEED / 2;
    // stage 0 part [90,2,400] hold region ≈ segment 270
    g.position = 270 * SEG_LEN - PLAYER_Z;
    g.playerX = 0;
    update(g, NO_INPUT, 0.5);
    expect(g.playerX).toBeLessThan(0); // curve>0 pushes negative
  });
  test('crash locks steering and decays speed', () => {
    const g = racingGame();
    g.speed = MAX_SPEED / 2;
    g.crashTimer = 1;
    update(g, { ...NO_INPUT, left: true }, 0.2);
    expect(g.playerX).toBe(0);
    expect(g.crashTimer).toBeLessThan(1);
  });
  test('speedKmh maps max speed to 280', () => {
    const g = racingGame();
    g.speed = MAX_SPEED;
    expect(speedKmh(g)).toBe(280);
  });
});

describe('traffic collisions', () => {
  test('hitting a car triggers a crash', () => {
    const g = racingGame();
    g.speed = MAX_SPEED / 2;
    g.stage.cars.length = 0;
    g.stage.cars.push({ offset: 0, z: g.position + 100, speed: 1000, color: 0, passed: false });
    const ev = update(g, GAS, 0.05);
    expect(ev.crashed).toBe(true);
    expect(g.crashTimer).toBeGreaterThan(0);
    expect(g.speed).toBeLessThanOrEqual(MAX_SPEED * 0.22 + 1);
  });
  test('nearby car in another lane does not crash', () => {
    const g = racingGame();
    g.speed = MAX_SPEED / 2;
    g.stage.cars.length = 0;
    g.stage.cars.push({ offset: 0.9, z: g.position + 100, speed: 1000, color: 0, passed: false });
    const ev = update(g, GAS, 0.05);
    expect(ev.crashed).toBe(false);
  });
  test('passing a car at speed scores a bonus', () => {
    const g = racingGame();
    g.speed = MAX_SPEED * 0.8;
    g.stage.cars.length = 0;
    g.stage.cars.push({ offset: 0.8, z: g.position - CRASH_Z - 100, speed: 1000, color: 0, passed: false });
    const before = g.score;
    update(g, GAS, 0.05);
    expect(g.score).toBeGreaterThanOrEqual(before + 500);
  });
});

describe('checkpoints, forks, timer', () => {
  test('crossing the line adds bonus time and advances the round', () => {
    const g = racingGame();
    const t0 = g.timeLeft;
    g.position = g.stage.length - 5;
    g.speed = MAX_SPEED;
    g.playerX = 0.5; // centered -> default right
    const ev = update(g, GAS, 0.01);
    expect(ev.checkpoint).toBe(true);
    expect(g.round).toBe(1);
    expect(g.route.length).toBe(2);
    expect(g.timeLeft).toBeCloseTo(Math.min(t0 + CHECKPOINT_BONUS, 99), 0);
    expect(g.position).toBe(0); // new stage starts at 0
  });
  test('fork defaults to playerX side; explicit choice wins', () => {
    const g = racingGame();
    g.position = g.stage.length - 5; g.speed = MAX_SPEED; g.playerX = -0.6;
    update(g, GAS, 0.01);
    expect(g.route[1]).toBe(1); // left -> stage 1
    const h = racingGame();
    chooseFork(h, 'right');
    h.position = h.stage.length - 5; h.speed = MAX_SPEED; h.playerX = -0.6;
    update(h, GAS, 0.01);
    expect(h.route[1]).toBe(2); // explicit right beats playerX
  });
  test('in fork zone, held arrows set the choice live', () => {
    const g = racingGame();
    g.position = g.stage.length - 100 * SEG_LEN; // inside fork zone
    g.speed = MAX_SPEED * 0.5;
    update(g, { ...NO_INPUT, left: true }, 0.1);
    expect(g.inForkZone).toBe(true);
    expect(g.forkChoice).toBe('left');
  });
  test('timeout ends the game', () => {
    const g = racingGame();
    g.timeLeft = 0.05;
    const ev = update(g, GAS, 0.2);
    expect(ev.timeout).toBe(true);
    expect(g.mode).toBe('gameover');
  });
  test('finishing round 5 ends the race with results', () => {
    const g = racingGame();
    g.round = 4; g.idxInRound = 0;
    loadStage(g, STAGE_TREE[4][0]);
    g.mode = 'race';
    g.timeLeft = 20;
    g.position = g.stage.length - 5;
    g.speed = MAX_SPEED;
    const before = g.score;
    const ev = update(g, GAS, 0.01);
    expect(ev.finished).toBe(true);
    expect(g.mode).toBe('results');
    expect(g.score).toBeGreaterThan(before); // remaining time converted
  });
  test('stageProgress goes 0 -> 1', () => {
    const g = racingGame();
    expect(stageProgress(g)).toBe(0);
    g.position = g.stage.length / 2;
    expect(stageProgress(g)).toBeCloseTo(0.5, 6);
  });
});

describe('beatability', () => {
  test('a steady 70% run clears every stage in its time limit', () => {
    for (let s = 0; s < STAGES.length; s++) {
      const g = createGame();
      g.mode = 'race';
      loadStage(g, s);
      g.timeLeft = STAGES[s].time;
      let guard = 0;
      while (g.position < g.stage.length && guard++ < 20000) {
        g.speed = MAX_SPEED * 0.7; // cruise control
        g.playerX = 0;
        const ev = update(g, NO_INPUT, 1 / 60);
        if (ev.timeout) break;
      }
      expect(g.timeLeft).toBeGreaterThan(0);
    }
  }, 30000);
});
