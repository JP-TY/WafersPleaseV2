# @wafers/web

Diegetic Babylon.js 9 presentation layer for **Wafers Please**.

Simulation truth lives in `@wafers/sim` + `@wafers/data`. Optimized props come
from `@wafers/content` via `/models/*`.

## Run

```bash
cd webport
pnpm install   # once
pnpm --filter @wafers/web dev
```

Open **http://127.0.0.1:5180/**

Query params:

- `?seed=20260904` — lot seed (deterministic)
- `?day=1|2|3` — start day
- `?onboarding=1` — force station tour

## Controls

- Orbit: drag background · tilt wafer: drag disk
- Tools: click screens or keys `1`–`5` (day roster gated)
- Stamps: Accept / Reject / Rework
- Mute: `M`
- WebXR: browser VR button when immersive-vr is available

## Architecture

```
src/
  bootstrap/   engine (WebGL2), lighting, materials
  bay/         FOUP, stage, instruments, traveler, stamps, boards,
               onboarding, scaffolding, quiz, progression
  session/     ShiftSession + config + purity boundary
  rework/      RCA, silicide, CMP benches
  content/     GLB prop loader (/models)
  audio/       Web Audio + HVAC ambience
  player/      follow camera
  input/       picking
  xr/          probe + DefaultXRExperience install
```

## Test / build

```bash
pnpm --filter @wafers/web test
pnpm --filter @wafers/web typecheck
pnpm --filter @wafers/web build
```
