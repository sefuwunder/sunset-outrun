// public/render.js — canvas renderer for Sunset OutRun (browser only).
// Classic segment-projection pseudo-3D road, back-to-front.
import {
  SEG_LEN, ROAD_WIDTH, DRAW_DISTANCE, CAMERA_HEIGHT, CAMERA_DEPTH, PLAYER_Z,
  project, findSegment, interpolate, clamp,
} from '../src/road.js';
import { speedKmh, stageProgress } from '../src/game.js';

export const W = 960, H = 540;

const THEMES = {
  coast: {
    sky: ['#160b33', '#4b2160', '#b34a6e', '#ff9e5e'],
    sun: '#ffe9a8', glow: 'rgba(255,170,90,0.35)',
    grass: ['#4d7a5c', '#467154'], road: ['#565661', '#4e4e57'],
    rumble: ['#efe6d2', '#b23a48'], edge: '#f2ead6', ocean: true, far: 'peaks',
  },
  palm: {
    sky: ['#1a0f38', '#572a68', '#c05a74', '#ffa45e'],
    sun: '#ffdf9e', glow: 'rgba(255,180,100,0.35)',
    grass: ['#3f7a4e', '#3a7048'], road: ['#565661', '#4e4e57'],
    rumble: ['#efe6d2', '#b23a48'], edge: '#f2ead6', ocean: false, far: 'palms',
  },
  desert: {
    sky: ['#200f3a', '#6b2a55', '#d4695e', '#ffb35e'],
    sun: '#fff0b0', glow: 'rgba(255,190,110,0.4)',
    grass: ['#c9a05e', '#bd9457'], road: ['#5a5a64', '#52525c'],
    rumble: ['#f2e8d8', '#a83a48'], edge: '#f7efdd', ocean: false, far: 'dunes',
  },
  city: {
    sky: ['#120b2e', '#3d1c58', '#8a3a68', '#ff8a5e'],
    sun: '#ffd28a', glow: 'rgba(255,150,120,0.3)',
    grass: ['#3a3f4a', '#343945'], road: ['#5c5c66', '#54545e'],
    rumble: ['#e8e2d4', '#b23a48'], edge: '#d8f0ff', ocean: false, far: 'city',
  },
};

// ---------- procedural sprite factory (offscreen canvases) ----------
function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function spritePalm() {
  const [c, x] = mkCanvas(160, 220);
  x.strokeStyle = '#6b4a2a'; x.lineWidth = 14; x.lineCap = 'round';
  x.beginPath(); x.moveTo(80, 220); x.quadraticCurveTo(70, 140, 88, 90); x.stroke();
  x.strokeStyle = '#2e7d46'; x.lineWidth = 10;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    x.beginPath(); x.moveTo(88, 90);
    x.quadraticCurveTo(88 + Math.cos(a) * 55, 90 + Math.sin(a) * 30 - 18, 88 + Math.cos(a) * 72, 90 + Math.sin(a) * 44 + 6);
    x.stroke();
  }
  x.fillStyle = '#8a5a33';
  x.beginPath(); x.arc(80, 100, 9, 0, 7); x.arc(96, 100, 9, 0, 7); x.fill();
  return c;
}
function spriteCactus() {
  const [c, x] = mkCanvas(120, 200);
  x.fillStyle = '#3e8e4f';
  x.beginPath();
  x.roundRect(45, 30, 30, 170, 15); x.fill();
  x.beginPath(); x.roundRect(15, 80, 22, 70, 11); x.fill();
  x.beginPath(); x.roundRect(83, 60, 22, 80, 11); x.fill();
  x.fillStyle = '#2c6b3a';
  x.fillRect(52, 30, 5, 170);
  return c;
}
function spriteRock() {
  const [c, x] = mkCanvas(160, 120);
  x.fillStyle = '#8d8578';
  x.beginPath(); x.moveTo(10, 120); x.lineTo(40, 50); x.lineTo(90, 25); x.lineTo(140, 60); x.lineTo(150, 120); x.closePath(); x.fill();
  x.fillStyle = '#a39a88';
  x.beginPath(); x.moveTo(40, 50); x.lineTo(90, 25); x.lineTo(110, 60); x.lineTo(60, 80); x.closePath(); x.fill();
  return c;
}
function spriteSign(text) {
  const [c, x] = mkCanvas(160, 160);
  x.fillStyle = '#555'; x.fillRect(74, 60, 12, 100);
  x.fillStyle = '#f5c518'; x.strokeStyle = '#222'; x.lineWidth = 6;
  x.beginPath(); x.roundRect(10, 10, 140, 60, 10); x.fill(); x.stroke();
  x.fillStyle = '#222'; x.font = 'bold 30px sans-serif'; x.textAlign = 'center';
  x.fillText(text, 80, 52);
  return c;
}
function spriteBillboard() {
  const [c, x] = mkCanvas(320, 220);
  x.fillStyle = '#444'; x.fillRect(60, 130, 16, 90); x.fillRect(244, 130, 16, 90);
  const g = x.createLinearGradient(0, 10, 0, 130);
  g.addColorStop(0, '#2b1a4e'); g.addColorStop(1, '#c65b7c');
  x.fillStyle = g; x.fillRect(10, 10, 300, 120);
  x.strokeStyle = '#f5f0e0'; x.lineWidth = 6; x.strokeRect(10, 10, 300, 120);
  x.fillStyle = '#ffd97a'; x.beginPath(); x.arc(70, 70, 28, 0, 7); x.fill();
  x.fillStyle = '#fff'; x.font = 'bold 44px sans-serif'; x.textAlign = 'center';
  x.fillText('SUNSET', 195, 75); x.font = 'bold 30px sans-serif';
  x.fillText('OUTRUN', 195, 110);
  return c;
}
function spriteLamp() {
  const [c, x] = mkCanvas(120, 260);
  x.strokeStyle = '#333'; x.lineWidth = 10;
  x.beginPath(); x.moveTo(60, 260); x.lineTo(60, 40); x.quadraticCurveTo(60, 20, 90, 20); x.stroke();
  x.fillStyle = '#ffe9a8'; x.beginPath(); x.arc(92, 30, 14, 0, 7); x.fill();
  x.fillStyle = 'rgba(255,230,160,0.25)'; x.beginPath(); x.arc(92, 30, 34, 0, 7); x.fill();
  return c;
}
function spriteBuilding(hue) {
  const [c, x] = mkCanvas(220, 320);
  x.fillStyle = hue; x.fillRect(20, 20, 180, 300);
  for (let r = 0; r < 8; r++) for (let col = 0; col < 5; col++) {
    x.fillStyle = (r * 5 + col) % 3 ? '#ffe9a8' : '#2b2b3a';
    x.fillRect(34 + col * 34, 40 + r * 34, 22, 24);
  }
  return c;
}
function spriteGantry(label) {
  const [c, x] = mkCanvas(640, 160);
  x.fillStyle = '#3a3a44'; x.fillRect(20, 40, 18, 120); x.fillRect(602, 40, 18, 120);
  x.fillStyle = '#22222a'; x.fillRect(20, 10, 600, 44);
  x.fillStyle = '#f5f0e0'; x.font = 'bold 30px sans-serif'; x.textAlign = 'center';
  x.fillText(label, 320, 42);
  return c;
}

let SPRITES = null;
export function initSprites() {
  if (SPRITES) return SPRITES;
  SPRITES = {
    palm: { img: spritePalm(), h: 950 },
    cactus: { img: spriteCactus(), h: 520 },
    rock: { img: spriteRock(), h: 420 },
    sign: { img: spriteSign('>>>'), h: 480 },
    billboard: { img: spriteBillboard(), h: 1150 },
    lamp: { img: spriteLamp(), h: 850 },
    building: { img: spriteBuilding('#23232e'), h: 2600 },
    'fork-left': { img: spriteSign('<<< LEFT'), h: 700 },
    'fork-right': { img: spriteSign('RIGHT >>>'), h: 700 },
    gantry: { img: spriteGantry('SUNSET OUTRUN'), h: 900 },
  };
  return SPRITES;
}

// ---------- traffic car sprites ----------
let CAR_SPRITES = null;
const CAR_COLORS = ['#2a9df4', '#f4d03f', '#9b59b6', '#2ecc71', '#e67e22'];
function renderCarSprite(color) {
  const [c, x] = mkCanvas(200, 130);
  x.fillStyle = 'rgba(0,0,0,0.35)';
  x.beginPath(); x.ellipse(100, 118, 80, 12, 0, 0, 7); x.fill();
  x.fillStyle = '#1a1a1a';
  x.beginPath(); x.roundRect(28, 88, 34, 30, 6); x.fill();
  x.beginPath(); x.roundRect(138, 88, 34, 30, 6); x.fill();
  const g = x.createLinearGradient(0, 30, 0, 110);
  g.addColorStop(0, color); g.addColorStop(1, '#222');
  x.fillStyle = g;
  x.beginPath(); x.roundRect(40, 45, 120, 65, 14); x.fill();
  x.fillStyle = 'rgba(20,20,40,0.9)';
  x.beginPath(); x.roundRect(58, 52, 84, 30, 8); x.fill();
  x.fillStyle = '#ff3b30';
  x.beginPath(); x.roundRect(48, 92, 28, 12, 4); x.fill();
  x.beginPath(); x.roundRect(124, 92, 28, 12, 4); x.fill();
  return c;
}
export function initCarSprites() {
  if (CAR_SPRITES) return CAR_SPRITES;
  CAR_SPRITES = CAR_COLORS.map(renderCarSprite);
  return CAR_SPRITES;
}

// ---------- player car (procedural, drawn live for tilt/spin) ----------
export function drawPlayerCar(ctx, x, y, w, o) {
  // o: {steer (-1..1), brake, offroad, spin (radians|null), t}
  const h = w * 0.62;
  ctx.save();
  ctx.translate(x, y);
  if (o.spin != null) ctx.rotate(o.spin);
  else {
    const bounce = o.offroad ? Math.sin(o.t * 55) * h * 0.02 : Math.sin(o.t * 8) * h * 0.004;
    ctx.translate(0, bounce);
    ctx.transform(1, 0, o.steer * 0.1, 1, 0, 0);
  }
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(0, h * 0.42, w * 0.46, h * 0.1, 0, 0, 7); ctx.fill();
  // wheels
  ctx.fillStyle = '#141414';
  for (const sx of [-1, 1]) {
    ctx.beginPath(); ctx.roundRect(sx * w * 0.42 - w * 0.07, h * 0.08, w * 0.14, h * 0.3, w * 0.03); ctx.fill();
  }
  // body
  const g = ctx.createLinearGradient(0, -h * 0.5, 0, h * 0.45);
  g.addColorStop(0, '#e5322d'); g.addColorStop(0.55, '#c11f24'); g.addColorStop(1, '#7c1216');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.roundRect(-w * 0.44, -h * 0.32, w * 0.88, h * 0.74, w * 0.1); ctx.fill();
  // cabin / rear window
  ctx.fillStyle = '#1c1c2a';
  ctx.beginPath(); ctx.roundRect(-w * 0.3, -h * 0.28, w * 0.6, h * 0.3, w * 0.06); ctx.fill();
  ctx.fillStyle = 'rgba(255,180,120,0.25)';
  ctx.beginPath(); ctx.roundRect(-w * 0.3, -h * 0.28, w * 0.6, h * 0.12, w * 0.05); ctx.fill();
  // spoiler
  ctx.fillStyle = '#5c0d10';
  ctx.fillRect(-w * 0.42, -h * 0.52, w * 0.84, h * 0.1);
  ctx.fillRect(-w * 0.38, -h * 0.44, w * 0.05, h * 0.14);
  ctx.fillRect(w * 0.33, -h * 0.44, w * 0.05, h * 0.14);
  // taillights (bright when braking)
  ctx.fillStyle = o.brake ? '#ffe14d' : '#ff3b30';
  for (const sx of [-1, 1]) {
    ctx.beginPath(); ctx.roundRect(sx * w * 0.3 - w * 0.11, h * 0.18, w * 0.22, h * 0.12, w * 0.03); ctx.fill();
  }
  // exhausts
  ctx.fillStyle = '#333';
  for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * w * 0.12, h * 0.36, w * 0.035, 0, 7); ctx.fill(); }
  ctx.restore();
}

// ---------- background ----------
let farCache = {};
function farLayer(theme, w, h) {
  const key = theme + w;
  if (farCache[key]) return farCache[key];
  const [c, x] = mkCanvas(w, 160);
  const t = THEMES[theme] || THEMES.palm;
  x.clearRect(0, 0, w, 160);
  if (t.far === 'peaks' || t.far === 'dunes') {
    x.fillStyle = t.far === 'peaks' ? '#3a2358' : '#8a5a48';
    x.beginPath(); x.moveTo(0, 160);
    for (let i = 0; i <= 16; i++) x.lineTo((i / 16) * w, 60 + 50 * Math.abs(Math.sin(i * 2.7 + 1)));
    x.lineTo(w, 160); x.closePath(); x.fill();
    x.fillStyle = t.far === 'peaks' ? '#54407a' : '#a06a52';
    x.beginPath(); x.moveTo(0, 160);
    for (let i = 0; i <= 16; i++) x.lineTo((i / 16) * w, 100 + 34 * Math.abs(Math.sin(i * 3.9)));
    x.lineTo(w, 160); x.closePath(); x.fill();
  } else if (t.far === 'city') {
    for (let i = 0; i < 40; i++) {
      const bw = 30 + (i * 37 % 50), bh = 60 + (i * 53 % 90);
      x.fillStyle = '#241a3e';
      x.fillRect(i * (w / 40), 160 - bh, bw * 0.7, bh);
      x.fillStyle = 'rgba(255,220,150,0.5)';
      for (let wy = 0; wy < 4; wy++) for (let wx = 0; wx < 2; wx++)
        if ((i + wx * 3 + wy) % 3 === 0) x.fillRect(i * (w / 40) + 6 + wx * 12, 160 - bh + 10 + wy * 18, 6, 9);
    }
  } else { // palms silhouette
    x.fillStyle = '#2c1a44';
    for (let i = 0; i < 12; i++) {
      const px = i * (w / 12) + 20, ph = 70 + (i * 41 % 60);
      x.fillRect(px - 4, 160 - ph, 8, ph);
      x.beginPath(); x.arc(px, 160 - ph, 26, 0, 7); x.fill();
    }
  }
  farCache[key] = c;
  return c;
}

export function renderBackground(ctx, theme, view) {
  const t = THEMES[theme] || THEMES.palm;
  const horizon = H * 0.52;
  const g = ctx.createLinearGradient(0, 0, 0, horizon + 2);
  t.sky.forEach((col, i) => g.addColorStop(i / (t.sky.length - 1), col));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, horizon + 2);
  // sun with glow
  const sx = W * 0.5 + Math.sin(view.t * 0.05) * 8, sy = horizon - H * 0.13, sr = H * 0.11;
  const glow = ctx.createRadialGradient(sx, sy, sr * 0.4, sx, sy, sr * 3);
  glow.addColorStop(0, t.glow); glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sx - sr * 3, sy - sr * 3, sr * 6, sr * 6);
  ctx.fillStyle = t.sun;
  ctx.beginPath(); ctx.arc(sx, sy, sr, 0, 7); ctx.fill();
  // sun stripes (outrun vibe)
  ctx.fillStyle = t.sky[0];
  for (let i = 0; i < 3; i++) ctx.fillRect(sx - sr, sy + sr * (0.1 + i * 0.28), sr * 2, sr * 0.09);
  // parallax far layer (wrapped)
  const layer = farLayer(theme, W, H);
  const off = -(((view.skyOffset * 40) % W) + W) % W;
  ctx.drawImage(layer, off, horizon - 158, W, 160);
  ctx.drawImage(layer, off + W, horizon - 158, W, 160);
  // ocean band for coast
  if (t.ocean) {
    const og = ctx.createLinearGradient(0, horizon - 40, 0, horizon + 40);
    og.addColorStop(0, '#7a4a8a'); og.addColorStop(1, '#2a4a7a');
    ctx.fillStyle = og;
    ctx.fillRect(W * 0.62, horizon - 42, W * 0.38, 84);
    ctx.fillStyle = 'rgba(255,220,150,0.35)';
    for (let i = 0; i < 8; i++) {
      const yy = horizon - 30 + i * 9;
      ctx.fillRect(W * 0.62 + ((i * 53) % 200), yy, 40 + (i * 29 % 60), 2);
    }
  }
  return horizon;
}

// ---------- road ----------
function poly(ctx, x1, y1, x2, y2, x3, y3, x4, y4, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4);
  ctx.closePath(); ctx.fill();
}

export function renderRoad(ctx, g, view, horizon) {
  const t = THEMES[g.stage.def.theme] || THEMES.palm;
  const { segments, length } = g.stage;
  const baseSegment = findSegment(segments, g.position);
  const basePercent = (g.position % SEG_LEN) / SEG_LEN;
  const playerSegment = findSegment(segments, g.position + PLAYER_Z);
  const playerPercent = ((g.position + PLAYER_Z) % SEG_LEN) / SEG_LEN;
  const playerY = interpolate(playerSegment.p1.world.y, playerSegment.p2.world.y, playerPercent);

  let maxy = H;
  let x = 0, dx = -(baseSegment.curve * basePercent);
  const drawn = [];

  for (let n = 0; n < DRAW_DISTANCE; n++) {
    const seg = segments[(baseSegment.index + n) % segments.length];
    const looped = seg.index < baseSegment.index;
    const camZ = g.position - (looped ? length : 0);
    const camX = g.playerX * ROAD_WIDTH - x;
    project(seg.p1, camX, playerY + CAMERA_HEIGHT, camZ, W, H);
    project(seg.p2, camX - dx, playerY + CAMERA_HEIGHT, camZ, W, H);
    x += dx; dx += seg.curve;
    seg._clip = maxy;
    if (seg.p1.camera.z <= CAMERA_DEPTH || seg.p2.screen.y >= seg.p1.screen.y || seg.p2.screen.y >= maxy) continue;

    const p1 = seg.p1.screen, p2 = seg.p2.screen;
    const grass = t.grass[seg.color], road = t.road[seg.color];
    ctx.fillStyle = grass;
    ctx.fillRect(0, p2.y, W, p1.y - p2.y);
    const r1 = p1.w / 5, r2 = p2.w / 5;
    poly(ctx, p1.x - p1.w - r1, p1.y, p1.x - p1.w, p1.y, p2.x - p2.w, p2.y, p2.x - p2.w - r2, p2.y, t.rumble[seg.color]);
    poly(ctx, p1.x + p1.w + r1, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x + p2.w + r2, p2.y, t.rumble[seg.color]);
    poly(ctx, p1.x - p1.w, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x - p2.w, p2.y, road);
    if (seg.finish) {
      // checkered finish line
      const rows = 2, cols = 10;
      for (let r = 0; r < rows; r++) for (let cI = 0; cI < cols; cI++) {
        const fx1 = p1.x - p1.w + (cI / cols) * p1.w * 2, fx2 = p1.x - p1.w + ((cI + 1) / cols) * p1.w * 2;
        const fy1 = p1.y - (r / rows) * (p1.y - p2.y), fy2 = p1.y - ((r + 1) / rows) * (p1.y - p2.y);
        ctx.fillStyle = (r + cI) % 2 ? '#111' : '#f5f5f5';
        ctx.fillRect(fx1, fy2, fx2 - fx1 + 1, fy1 - fy2 + 1);
      }
    } else if (seg.color === 0) {
      ctx.fillStyle = t.edge;
      const lw1 = Math.max(1, p1.w / 40), lw2 = Math.max(1, p2.w / 40);
      poly(ctx, p1.x - p1.w + lw1, p1.y, p1.x - p1.w + lw1 * 2.5, p1.y, p2.x - p2.w + lw2 * 2.5, p2.y, p2.x - p2.w + lw2, p2.y, t.edge);
      poly(ctx, p1.x + p1.w - lw1 * 2.5, p1.y, p1.x + p1.w - lw1, p1.y, p2.x + p2.w - lw2, p2.y, p2.x + p2.w - lw2 * 2.5, p2.y, t.edge);
    }
    drawn.push(seg);
    maxy = p1.y;
  }

  // sprites + traffic, far to near
  const sprites = initSprites(), carImgs = initCarSprites();
  for (let n = drawn.length - 1; n >= 0; n--) {
    const seg = drawn[n];
    const p1 = seg.p1.screen;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, seg._clip); ctx.clip();
    for (const sp of seg.sprites) {
      const def = sprites[sp.type];
      if (!def) continue;
      const dh = p1.scale * def.h * (H / 2);
      if (dh < 2) continue;
      const dw = dh * (def.img.width / def.img.height);
      const dxp = p1.x + p1.scale * sp.offset * ROAD_WIDTH * (W / 2) - dw / 2;
      if (sp.type === 'gantry') {
        const gw = p1.w * 2.6;
        ctx.drawImage(def.img, p1.x - gw / 2, p1.y - dh, gw, dh);
      } else {
        ctx.drawImage(def.img, dxp, p1.y - dh, dw, dh);
      }
    }
    ctx.restore();
  }
  // cars far to near
  const cars = g.stage.cars
    .map(car => ({ car, seg: findSegment(segments, car.z) }))
    .filter(o => drawn.includes(o.seg))
    .sort((a, b) => b.car.z - a.car.z);
  for (const { car, seg } of cars) {
    const p1 = seg.p1.screen;
    const dh = p1.scale * 620 * (H / 2);
    if (dh < 3) continue;
    const img = carImgs[car.color % carImgs.length];
    const dw = dh * (img.width / img.height);
    const dxp = p1.x + p1.scale * car.offset * ROAD_WIDTH * (W / 2) - dw / 2;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, seg._clip); ctx.clip();
    ctx.drawImage(img, dxp, p1.y - dh, dw, dh);
    ctx.restore();
  }
  return { playerSegment, playerY };
}

export function drawPlayer(ctx, g, view) {
  const w = W * 0.24;
  const x = W / 2, y = H - H * 0.16;
  const spinning = g.crashTimer > 0;
  drawPlayerCar(ctx, x, y, w, {
    steer: clamp(view.steerVisual || 0, -1, 1),
    brake: view.brakeVisual,
    offroad: g.offroad && g.speed > 100,
    spin: spinning ? (1.1 - g.crashTimer) * 9 : null,
    t: view.t,
  });
}

// ---------- HUD ----------
export function drawHUD(ctx, g, ui) {
  ctx.textAlign = 'left';
  // top bar
  ctx.fillStyle = 'rgba(10,8,24,0.55)';
  ctx.fillRect(0, 0, W, 64);
  ctx.fillStyle = g.timeLeft < 10 ? '#ff3b30' : '#ffe14d';
  ctx.font = 'bold 34px "Arial Black", sans-serif';
  ctx.fillText('TIME ' + Math.ceil(g.timeLeft), 18, 42);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 22px "Arial Black", sans-serif';
  ctx.fillText('STAGE ' + (g.round + 1) + '/5 — ' + g.stage.def.name.toUpperCase(), W / 2, 40);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#7df9ff';
  ctx.fillText(String(Math.round(g.score)).padStart(7, '0'), W - 18, 42);
  // speed
  ctx.textAlign = 'right';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 52px "Arial Black", sans-serif';
  ctx.fillText(speedKmh(g), W - 24, H - 28);
  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = '#ffb35e';
  ctx.fillText('km/h', W - 24, H - 66);
  // progress bar
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(W / 2 - 160, H - 26, 320, 8);
  ctx.fillStyle = '#ff9e5e';
  ctx.fillRect(W / 2 - 160, H - 26, 320 * stageProgress(g), 8);

  if (ui.banner) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 64px "Arial Black", sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillText(ui.banner, W / 2 + 4, H * 0.36 + 4);
    ctx.fillStyle = '#ffe14d';
    ctx.fillText(ui.banner, W / 2, H * 0.36);
  }
  if (ui.countdown != null) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 120px "Arial Black", sans-serif';
    ctx.fillStyle = '#ff5a3c';
    ctx.fillText(ui.countdown, W / 2, H * 0.45);
  }
  if (ui.fork) {
    // fork choice arrows
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px "Arial Black", sans-serif';
    const l = ui.forkChoice === 'left', r = ui.forkChoice === 'right';
    ctx.fillStyle = l ? '#ffe14d' : 'rgba(255,255,255,0.45)';
    ctx.fillText('◀ ' + ui.fork.left, W * 0.28, H * 0.3);
    ctx.fillStyle = r ? '#ffe14d' : 'rgba(255,255,255,0.45)';
    ctx.fillText(ui.fork.right + ' ▶', W * 0.72, H * 0.3);
    if (!ui.forkChoice) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText('STEER TO CHOOSE', W / 2, H * 0.3 + 44);
    }
  }
}

export function themeOf(g) { return g.stage ? g.stage.def.theme : 'coast'; }
