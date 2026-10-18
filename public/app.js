// public/app.js — Sunset OutRun game shell: states, input, main loop (browser only).
import {
  createGame, startRace, update, loadStage,
  speedKmh, stageProgress, chooseFork,
  MAX_SPEED,
} from '../src/game.js';
import { STAGES, STAGE_TREE, SEG_LEN, PLAYER_Z, findSegment } from '../src/road.js';
import {
  W, H, initSprites, renderBackground, renderRoad, drawPlayer, drawHUD, themeOf,
} from './render.js';
import * as Sfx from './audio.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
initSprites();

const g = createGame();
window.__game = g; // debug/testing handle
window.__debugSpawnCar = () => {
  if (g.mode === 'race' && g.stage) {
    g.stage.cars.push({ offset: g.playerX, z: g.position + 600, speed: 500, color: 0, passed: false });
  }
};

const view = { skyOffset: 0, t: 0, steerVisual: 0, brakeVisual: false };
const ui = { banner: null, bannerT: 0, countdown: null, fork: null, forkChoice: null };
const input = { left: false, right: false, up: false, down: false };
let bgmSelect = 0;
let best = 0;
try { best = parseInt(localStorage.getItem('sunset-outrun-best') || '0', 10) || 0; } catch (e) { /* private mode */ }
let lastCount = 4;
let demo = null;

function fmtTime(s) {
  const m = Math.floor(s / 60), ss = (s % 60).toFixed(1).padStart(4, '0');
  return m + ':' + ss;
}

function showBanner(text, dur = 2.2) { ui.banner = text; ui.bannerT = dur; }

function forkNames() {
  const next = STAGE_TREE[g.round + 1];
  const li = Math.min(g.idxInRound, next.length - 1);
  const ri = Math.min(g.idxInRound + 1, next.length - 1);
  return { left: STAGES[next[li]].name.toUpperCase(), right: STAGES[next[ri]].name.toUpperCase() };
}

// ---------- input ----------
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
};
window.addEventListener('keydown', (e) => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  Sfx.initAudio();
  const k = KEYMAP[e.code];
  if (k) input[k] = true;
  if (e.code === 'KeyM') Sfx.setMuted(!Sfx.isMuted());
  if (e.code === 'Enter') onConfirm();
  if (g.mode === 'bgm') {
    if (e.code === 'ArrowUp' || e.code === 'KeyW') { bgmSelect = (bgmSelect + 2) % 3; Sfx.playBGM(bgmSelect); }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { bgmSelect = (bgmSelect + 1) % 3; Sfx.playBGM(bgmSelect); }
  }
});
window.addEventListener('keyup', (e) => {
  const k = KEYMAP[e.code];
  if (k) input[k] = false;
});

function onConfirm() {
  if (g.mode === 'title') {
    g.mode = 'bgm';
    bgmSelect = 0;
    Sfx.playBGM(0);
  } else if (g.mode === 'bgm') {
    startRace(g, bgmSelect);
    Sfx.playBGM(bgmSelect);
    lastCount = 4;
  } else if (g.mode === 'results' || g.mode === 'gameover') {
    Sfx.stopBGM(); Sfx.engineStop();
    g.mode = 'title';
    startDemo();
  }
}

// touch controls
function bindTouch(id, key) {
  const el = document.getElementById(id);
  const on = (e) => { e.preventDefault(); Sfx.initAudio(); input[key] = true; };
  const off = (e) => { e.preventDefault(); input[key] = false; };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('pointerleave', off);
}
bindTouch('t-left', 'left'); bindTouch('t-right', 'right');
bindTouch('t-gas', 'up'); bindTouch('t-brake', 'down');
document.getElementById('t-start').addEventListener('pointerdown', (e) => {
  e.preventDefault(); Sfx.initAudio(); onConfirm();
});
if ('ontouchstart' in window) document.getElementById('touch').style.display = 'block';

// ---------- demo behind title ----------
function startDemo() {
  demo = createGame();
  demo.mode = 'race';
  loadStage(demo, 0);
  demo.timeLeft = 9999;
  demo.speed = MAX_SPEED * 0.55;
}

// ---------- per-frame ----------
function stepRace(dt) {
  const ev = update(g, input, dt);
  if (ev.crashed) { Sfx.crashSfx(); showBanner('CRASH!', 1.2); }
  if (ev.checkpoint) {
    showBanner(ev.fork ? 'CHECKPOINT — CHOOSE!' : 'CHECKPOINT!', 2.2);
    Sfx.beep(880, 0.2, 'square', 0.25);
    setTimeout(() => Sfx.beep(1174, 0.3, 'square', 0.25), 180);
  }
  if (ev.finished) {
    showBanner('FINISH!', 3);
    Sfx.stopBGM(); Sfx.engineStop();
    Sfx.beep(880, 0.15); Sfx.beep(1174, 0.15, 'square', 0.25, 0.15); Sfx.beep(1568, 0.4, 'square', 0.25, 0.3);
    if (g.score > best) {
      best = Math.round(g.score);
      try { localStorage.setItem('sunset-outrun-best', String(best)); } catch (e) {}
    }
  }
  if (ev.timeout) {
    Sfx.stopBGM(); Sfx.engineStop();
    Sfx.beep(220, 0.8, 'sawtooth', 0.3);
  }
  Sfx.engineUpdate(g.speed / MAX_SPEED, g.offroad);
  Sfx.skidUpdate(g.skid);
  view.steerVisual += ((input.left ? -1 : 0) + (input.right ? 1 : 0) - view.steerVisual) * Math.min(1, dt * 10);
  view.brakeVisual = input.down;
  // fork UI state
  if (g.inForkZone && g.stage.def.fork) {
    ui.fork = forkNames();
    ui.forkChoice = g.forkChoice;
  } else {
    ui.fork = null; ui.forkChoice = null;
  }
}

function render() {
  view.t += 1 / 60;
  if (g.mode === 'title' || g.mode === 'bgm') {
    if (!demo) startDemo();
    demo.position += demo.speed * (1 / 60);
    demo.playerX = Math.sin(view.t * 0.5) * 0.4;
    const seg = findSegment(demo.stage.segments, demo.position + PLAYER_Z);
    view.skyOffset += seg.curve * 0.002;
    renderBackground(ctx, themeOf(demo), view);
    renderRoad(ctx, demo, view, H * 0.52);
    drawPlayer(ctx, demo, view);
    if (g.mode === 'bgm') drawBgmSelect(); else drawTitle();
    return;
  }
  const seg = findSegment(g.stage.segments, g.position + PLAYER_Z);
  view.skyOffset += seg.curve * (g.speed / MAX_SPEED) * 0.004;
  const horizon = renderBackground(ctx, themeOf(g), view);
  renderRoad(ctx, g, view, horizon);
  drawPlayer(ctx, g, view);
  drawHUD(ctx, g, ui);
  if (g.mode === 'results') drawResults();
  if (g.mode === 'gameover') drawGameOver();
}

let last = performance.now();
function frame(now) {
  let dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (ui.bannerT > 0) { ui.bannerT -= dt; if (ui.bannerT <= 0) ui.banner = null; }

  if (g.mode === 'countdown') {
    g.countdownT -= dt;
    const c = Math.ceil(g.countdownT);
    ui.countdown = g.countdownT > 0.6 ? String(Math.max(1, c - 1)) : 'GO!';
    if (c !== lastCount && c >= 1) { Sfx.beep(660, 0.14); lastCount = c; }
    if (g.countdownT <= 0) {
      g.mode = 'race';
      ui.countdown = null;
      Sfx.beep(990, 0.4, 'square', 0.3);
      showBanner('GO!', 1);
    }
  } else if (g.mode === 'race') {
    stepRace(dt);
  }
  render();
  requestAnimationFrame(frame);
}

// ---------- overlays ----------
function drawTitle() {
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(10,6,24,0.35)';
  ctx.fillRect(0, 0, W, H);
  ctx.font = 'bold 92px "Arial Black", sans-serif';
  const tg = ctx.createLinearGradient(0, 120, 0, 220);
  tg.addColorStop(0, '#ffe14d'); tg.addColorStop(1, '#ff5a3c');
  ctx.fillStyle = tg;
  ctx.fillText('SUNSET', W / 2, 180);
  ctx.fillText('OUTRUN', W / 2, 270);
  ctx.font = 'bold 24px sans-serif';
  ctx.fillStyle = '#fff';
  if (Math.floor(view.t * 2) % 2 === 0) ctx.fillText('PRESS ENTER', W / 2, 340);
  ctx.font = '20px sans-serif';
  ctx.fillStyle = '#ffb35e';
  ctx.fillText('ARROWS / WASD — DRIVE      M — MUTE', W / 2, 400);
  if (best > 0) {
    ctx.fillStyle = '#7df9ff';
    ctx.fillText('BEST ' + best, W / 2, 440);
  }
}

function drawBgmSelect() {
  ctx.fillStyle = 'rgba(10,6,24,0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe14d';
  ctx.font = 'bold 54px "Arial Black", sans-serif';
  ctx.fillText('SELECT BGM', W / 2, 130);
  Sfx.TRACK_NAMES.forEach((name, i) => {
    const y = 230 + i * 70;
    if (i === bgmSelect) {
      ctx.fillStyle = '#ff5a3c';
      ctx.fillRect(W / 2 - 260, y - 38, 520, 56);
    }
    ctx.fillStyle = i === bgmSelect ? '#fff' : 'rgba(255,255,255,0.6)';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText((i + 1) + '. ' + name, W / 2, y);
  });
  ctx.fillStyle = '#ffb35e';
  ctx.font = '20px sans-serif';
  ctx.fillText('UP/DOWN — CHOOSE      ENTER — START', W / 2, 480);
}

function drawResults() {
  ctx.fillStyle = 'rgba(10,6,24,0.68)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe14d';
  ctx.font = 'bold 60px "Arial Black", sans-serif';
  ctx.fillText('FINISH!', W / 2, 110);
  ctx.fillStyle = '#fff';
  ctx.font = '24px sans-serif';
  const names = g.route.map(i => STAGES[i].name);
  names.forEach((n, i) => ctx.fillText((i + 1) + '. ' + n, W / 2, 180 + i * 34));
  ctx.font = 'bold 30px sans-serif';
  ctx.fillStyle = '#7df9ff';
  ctx.fillText('TIME ' + fmtTime(g.totalTime), W / 2, 180 + names.length * 34 + 20);
  ctx.fillText('SCORE ' + Math.round(g.score), W / 2, 180 + names.length * 34 + 58);
  if (Math.round(g.score) >= best && best > 0) {
    ctx.fillStyle = '#ff5a3c';
    ctx.fillText('NEW BEST!', W / 2, 180 + names.length * 34 + 96);
  }
  ctx.fillStyle = '#ffb35e';
  ctx.font = '20px sans-serif';
  ctx.fillText('PRESS ENTER', W / 2, H - 40);
}

function drawGameOver() {
  ctx.fillStyle = 'rgba(20,6,10,0.6)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff3b30';
  ctx.font = 'bold 72px "Arial Black", sans-serif';
  ctx.fillText('TIME UP', W / 2, H * 0.45);
  ctx.fillStyle = '#fff';
  ctx.font = '22px sans-serif';
  ctx.fillText('PRESS ENTER TO TRY AGAIN', W / 2, H * 0.45 + 50);
}

startDemo();
requestAnimationFrame(frame);
