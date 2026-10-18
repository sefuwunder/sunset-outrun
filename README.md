# Sunset OutRun

An OutRun (1986)-style arcade racer in the browser. Pseudo-3D raster road renderer
on 2D canvas — curves, hills, branching forks, checkpoint timer, traffic, and a
synthesized soundtrack. Bun + zero npm dependencies; all art is procedural canvas,
all audio is WebAudio.

## Play

```sh
bun src/server.ts
# → http://127.0.0.1:3036
```

## Controls

| Input | Action |
|---|---|
| Arrow keys / WASD | steer · gas · brake |
| Enter | start / confirm |
| M | mute |
| Touch | on-screen ◀ ▶ GAS BRK buttons |

## Game flow

Title → BGM select (3 synthesized tracks, up/down + Enter) → 3-2-1-GO →
5 stages with a **left/right fork at the end of each of the first 4**
(steer to choose, or it follows your road position). 15 stages across the
route tree, OutRun-style: round 1 has 1 stage, round 2 has 2, … round 5 has 5.

- **Checkpoints:** beat each stage's timer for +30s. Time up = game over.
- **Traffic:** dodge it — a hit spins you out and kills your speed.
- **Off-road:** rumble strips slow you down hard.
- **Scoring:** speed + near misses (+500 per car passed) + leftover time bonus.
- Best score persists in localStorage.

## Code

- `src/road.js` — pure ESM: segment/projection math, seeded track builder, the
  15-stage route tree. No DOM.
- `src/game.js` — pure ESM: car physics, collisions, timer/checkpoints, fork
  logic, scoring. No DOM.
- `public/render.js` — canvas road renderer, procedural sprites/cars, HUD.
- `public/audio.js` — WebAudio engine/skid/crash SFX + 3 looped BGM tracks.
- `public/app.js` — game states, input, main loop.
- `src/server.ts` — static file server (`/src/*.js` serves the shared modules).

`bun test` — 39 tests covering projection math, track determinism, physics,
collisions, checkpoints, forks, and stage beatability.
