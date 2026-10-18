// tests/road.test.js — bun test for src/road.js
import { describe, test, expect } from 'bun:test';
import {
  SEG_LEN, RUMBLE_LEN, ROAD_WIDTH, DRAW_DISTANCE, CAMERA_HEIGHT, CAMERA_DEPTH, PLAYER_Z, MAX_SPEED,
  clamp, interpolate, easeIn, easeInOut, overlap, mulberry32,
  project, findSegment, buildStage, STAGES, STAGE_TREE, nextStageIndex,
} from '../src/road.js';

describe('math helpers', () => {
  test('clamp/interpolate/ease', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(interpolate(10, 20, 0.5)).toBe(15);
    expect(easeIn(0, 10, 0)).toBe(0);
    expect(easeIn(0, 10, 1)).toBe(10);
    expect(easeInOut(0, 10, 0.5)).toBeCloseTo(5, 9);
  });
  test('overlap', () => {
    expect(overlap(0, 1, 0.4, 1)).toBe(true);
    expect(overlap(0, 1, 5, 1)).toBe(false);
  });
  test('mulberry32 is deterministic per seed', () => {
    const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
    const sa = [a(), a(), a()], sb = [b(), b(), b()];
    expect(sa).toEqual(sb);
    expect(c()).not.toBe(sa[0]);
  });
});

describe('projection', () => {
  test('known point projects to expected screen values', () => {
    const width = 960, height = 540;
    const position = 5000;
    const p = { world: { x: 0, y: 0, z: position + 1000 }, camera: {}, screen: {} };
    project(p, 0, CAMERA_HEIGHT, position, width, height);
    // scale = 0.84/1000 = 0.00084
    expect(p.screen.scale).toBeCloseTo(0.00084, 9);
    expect(p.screen.x).toBe(480);
    // y = 270 - 0.00084*(0-1100)*270 = 270 + 249.48
    expect(p.screen.y).toBe(519);
    expect(p.screen.w).toBe(806);
  });
  test('lateral world x shifts screen x', () => {
    const p = { world: { x: ROAD_WIDTH, y: 0, z: 6000 }, camera: {}, screen: {} };
    project(p, 0, CAMERA_HEIGHT, 5000, 960, 540);
    expect(p.screen.x).toBeGreaterThan(480);
  });
  test('project requires width/height (fails loud, never NaN-silence)', () => {
    const p = { world: { x: 0, y: 0, z: 6000 }, camera: {}, screen: {} };
    expect(() => project(p, 0, CAMERA_HEIGHT, 5000)).toThrow();
  });
  test('project never divides by zero behind camera', () => {
    const p = { world: { x: 0, y: 0, z: 4999 }, camera: {}, screen: {} };
    project(p, 0, CAMERA_HEIGHT, 5000, 960, 540);
    expect(Number.isFinite(p.screen.x)).toBe(true);
  });
});

describe('stage catalogue', () => {
  test('tree has 5 rounds of sizes 1..5', () => {
    expect(STAGE_TREE.length).toBe(5);
    expect(STAGE_TREE.map(r => r.length)).toEqual([1, 2, 3, 4, 5]);
  });
  test('nextStageIndex maps forks like the original', () => {
    expect(nextStageIndex(0, 0, 'left')).toBe(1);
    expect(nextStageIndex(0, 0, 'right')).toBe(2);
    expect(nextStageIndex(1, 1, 'left')).toBe(4);
    expect(nextStageIndex(1, 1, 'right')).toBe(5);
    expect(nextStageIndex(3, 3, 'right')).toBe(14); // clamped to last
    expect(nextStageIndex(2, 0, 'left')).toBe(6);
  });
  test('15 stages defined', () => {
    expect(STAGES.length).toBe(15);
    for (const s of STAGES) expect(s.parts.length).toBeGreaterThan(0);
  });
});

describe('buildStage', () => {
  test('stage 0 has the expected segment count', () => {
    const st = buildStage(STAGES[0]);
    // start 120 + parts 700 + finish 60
    expect(st.totalSegments).toBe(880);
    expect(st.length).toBe(880 * SEG_LEN);
  });
  test('deterministic: same seed, same track', () => {
    const a = buildStage(STAGES[3]), b = buildStage(STAGES[3]);
    expect(a.segments.map(s => s.curve)).toEqual(b.segments.map(s => s.curve));
    expect(a.cars.map(c => c.z)).toEqual(b.cars.map(c => c.z));
    expect(a.segments.map(s => s.p2.world.y)).toEqual(b.segments.map(s => s.p2.world.y));
  });
  test('curves stay in range and hills are continuous', () => {
    for (const def of STAGES) {
      const st = buildStage(def);
      for (const s of st.segments) {
        expect(Math.abs(s.curve)).toBeLessThanOrEqual(6.0001);
      }
      for (let i = 1; i < st.segments.length; i++) {
        expect(st.segments[i].p1.world.y).toBe(st.segments[i - 1].p2.world.y);
      }
    }
  });
  test('fork zone flagged on forking stages only', () => {
    const forked = buildStage(STAGES[0]);
    const forks = forked.segments.filter(s => s.forkZone);
    expect(forks.length).toBe(142); // last 150 minus the final 8
    const last = buildStage(STAGES[14]);
    expect(last.segments.some(s => s.forkZone)).toBe(false);
  });
  test('finish line on last 4 segments + start gantry', () => {
    const st = buildStage(STAGES[0]);
    const fin = st.segments.filter(s => s.finish);
    expect(fin.length).toBe(4);
    expect(st.segments[8].sprites.some(s => s.type === 'gantry')).toBe(true);
  });
  test('roadside sprites sit off the road', () => {
    const st = buildStage(STAGES[0]);
    const roadside = st.segments.flatMap(s => s.sprites).filter(s => s.type !== 'gantry');
    expect(roadside.length).toBeGreaterThan(20);
    for (const s of roadside) expect(Math.abs(s.offset)).toBeGreaterThan(1.2);
  });
  test('traffic placed and start kept clear', () => {
    const st = buildStage(STAGES[5]);
    expect(st.cars.length).toBeGreaterThan(5);
    for (const c of st.cars) expect(c.z).toBeGreaterThanOrEqual(60 * SEG_LEN);
  });
});

describe('findSegment', () => {
  test('resolves segment index from z', () => {
    const st = buildStage(STAGES[0]);
    expect(findSegment(st.segments, 0).index).toBe(0);
    expect(findSegment(st.segments, 5.5 * SEG_LEN).index).toBe(5);
    expect(findSegment(st.segments, st.length + 10).index).toBe(0); // wraps
  });
});
