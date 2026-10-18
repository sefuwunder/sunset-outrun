// public/audio.js — WebAudio: engine, SFX, and 3 synthesized BGM tracks (browser only).
const N = m => 440 * Math.pow(2, (m - 69) / 12);

let ctx = null, master = null, muted = false;
let engineOsc = null, engineFilter = null, engineGain = null;
let skidGain = null;
let noiseBuf = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // engine: saw -> lowpass -> gain
  engineOsc = ctx.createOscillator();
  engineOsc.type = 'sawtooth';
  engineOsc.frequency.value = 55;
  engineFilter = ctx.createBiquadFilter();
  engineFilter.type = 'lowpass'; engineFilter.frequency.value = 400;
  engineGain = ctx.createGain(); engineGain.gain.value = 0;
  engineOsc.connect(engineFilter).connect(engineGain).connect(master);
  engineOsc.start();
  // skid: looped noise -> bandpass -> gain
  const skid = ctx.createBufferSource();
  skid.buffer = noiseBuf; skid.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.2;
  skidGain = ctx.createGain(); skidGain.gain.value = 0;
  skid.connect(bp).connect(skidGain).connect(master);
  skid.start();
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.9;
}
export function isMuted() { return muted; }

export function engineUpdate(speedPercent, offroad) {
  if (!ctx) return;
  const t = ctx.currentTime;
  engineOsc.frequency.setTargetAtTime(55 + speedPercent * 230 + (offroad ? 18 : 0), t, 0.05);
  engineFilter.frequency.setTargetAtTime(350 + speedPercent * 2400, t, 0.05);
  engineGain.gain.setTargetAtTime(0.028 + speedPercent * 0.05, t, 0.05);
}
export function engineStop() {
  if (!ctx) return;
  engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
  if (skidGain) skidGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
}
export function skidUpdate(amount) {
  if (!ctx) return;
  skidGain.gain.setTargetAtTime(Math.min(0.16, amount * 0.16), ctx.currentTime, 0.06);
}

export function beep(freq, dur = 0.14, type = 'square', vol = 0.22, when = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

export function crashSfx() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass';
  f.frequency.setValueAtTime(3000, t);
  f.frequency.exponentialRampToValueAtTime(120, t + 0.5);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
  src.connect(f).connect(g).connect(master);
  src.start(t); src.stop(t + 0.6);
  const o = ctx.createOscillator(), g2 = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(110, t);
  o.frequency.exponentialRampToValueAtTime(32, t + 0.4);
  g2.gain.setValueAtTime(0.4, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
  o.connect(g2).connect(master);
  o.start(t); o.stop(t + 0.5);
}

// ---------- BGM: 3 looped tracks, 16th-note lookahead scheduler ----------
const TRACKS = [
  {
    name: 'SUNSET CRUISE', bpm: 116,
    bass: [36, 0, 36, 0, 36, 0, 41, 0, 43, 0, 43, 0, 43, 0, 36, 0,
           36, 0, 36, 0, 36, 0, 41, 0, 43, 0, 43, 0, 47, 0, 43, 0,
           36, 0, 36, 0, 36, 0, 41, 0, 43, 0, 43, 0, 43, 0, 36, 0,
           36, 0, 36, 0, 36, 0, 41, 0, 43, 0, 47, 0, 48, 0, 47, 0],
    lead: [72, 0, 76, 0, 79, 0, 76, 0, 72, 0, 67, 0, 69, 0, 67, 0,
           69, 0, 72, 0, 77, 0, 72, 0, 69, 0, 65, 0, 69, 0, 65, 0,
           74, 0, 79, 0, 74, 0, 71, 0, 74, 0, 67, 0, 71, 0, 67, 0,
           72, 0, 76, 0, 79, 0, 76, 0, 84, 0, 79, 0, 76, 0, 72, 0],
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
  },
  {
    name: 'COASTLINE DRIVE', bpm: 128,
    bass: [33, 0, 33, 33, 0, 33, 0, 33, 29, 0, 29, 29, 0, 29, 0, 29,
           36, 0, 36, 36, 0, 36, 0, 36, 31, 0, 31, 31, 0, 31, 0, 31,
           33, 0, 33, 33, 0, 33, 0, 33, 29, 0, 29, 29, 0, 29, 0, 29,
           36, 0, 36, 36, 0, 36, 0, 36, 31, 0, 31, 0, 33, 0, 36, 0],
    lead: [81, 0, 79, 0, 76, 0, 79, 0, 81, 0, 79, 0, 76, 0, 74, 0,
           77, 0, 76, 0, 74, 0, 76, 0, 77, 0, 76, 0, 74, 0, 72, 0,
           72, 0, 76, 0, 79, 0, 76, 0, 72, 0, 74, 0, 76, 0, 74, 0,
           74, 0, 79, 0, 74, 0, 71, 0, 74, 0, 76, 0, 74, 0, 72, 0],
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1],
  },
  {
    name: 'NEON HORIZON', bpm: 142,
    bass: [38, 0, 38, 0, 38, 0, 38, 41, 34, 0, 34, 0, 34, 0, 34, 36,
           29, 0, 29, 0, 29, 0, 29, 31, 36, 0, 36, 0, 36, 0, 38, 0,
           38, 0, 38, 0, 38, 0, 38, 41, 34, 0, 34, 0, 34, 0, 34, 36,
           29, 0, 29, 0, 29, 0, 31, 0, 33, 0, 34, 0, 36, 0, 38, 0],
    lead: [86, 0, 84, 0, 81, 0, 84, 0, 86, 0, 84, 0, 81, 0, 79, 0,
           81, 0, 79, 0, 77, 0, 79, 0, 81, 0, 84, 0, 81, 0, 79, 0,
           77, 0, 81, 0, 84, 0, 81, 0, 77, 0, 74, 0, 77, 0, 74, 0,
           74, 0, 77, 0, 81, 0, 77, 0, 79, 0, 81, 0, 84, 0, 86, 0],
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  },
];
export const TRACK_NAMES = TRACKS.map(t => t.name);

function drumKick(t, vol) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(130, t);
  o.frequency.exponentialRampToValueAtTime(38, t + 0.12);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  o.connect(g).connect(master); o.start(t); o.stop(t + 0.2);
}
function drumSnare(t, vol) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1400;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + 0.15);
}
function drumHat(t, vol) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + 0.06);
}
function pluck(t, midi, dur, vol, type) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = N(midi);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
}

let bgmTimer = null, bgmStep = 0, bgmNext = 0, bgmTrack = 0;
function playStep(step, t, tr) {
  const bar16 = step % 16;
  if (tr.kick[bar16]) drumKick(t, 0.5);
  if (tr.snare[bar16]) drumSnare(t, 0.28);
  if (tr.hat[bar16]) drumHat(t, 0.1);
  const b = tr.bass[step % 64];
  if (b) pluck(t, b, 0.22, 0.2, 'triangle');
  const l = tr.lead[step % 64];
  if (l) pluck(t, l, 0.24, 0.11, 'square');
}
export function playBGM(i) {
  if (!ctx) return;
  stopBGM();
  bgmTrack = i;
  const tr = TRACKS[i];
  const stepDur = 60 / tr.bpm / 4;
  bgmStep = 0;
  bgmNext = ctx.currentTime + 0.06;
  bgmTimer = setInterval(() => {
    while (bgmNext < ctx.currentTime + 0.18) {
      playStep(bgmStep, bgmNext, tr);
      bgmNext += stepDur;
      bgmStep = (bgmStep + 1) % 64;
    }
  }, 30);
}
export function stopBGM() {
  if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
}
export function currentBgmTrack() { return bgmTrack; }
