# BLURR // NEON OVERDRIVE — 3D Arcade Combat Racing Game

A browser-based 3D street combat racing game inspired by **Blur (2010)**, built with **Three.js (WebGL)**, **TypeScript**, **React**, **Vite**, and a procedural **Web Audio API** synthesizer.

## Features & Implemented Gameplay Systems

- **Real-Time 3D WebGL Racing Engine (`src/engine/RaceEngine.ts`)**:
  - Closed 3D Catmull-Rom spline circuits with elevation changes (suspension bridges, viaducts, and cyber tunnels), neon crash barriers, overhead start/finish gantries, and procedural city/harbor skylines.
  - Responsive arcade driving physics with forward/reverse acceleration, speed-dependent steering, high-angle handbrake drifting (`Space`) that builds auxiliary Nitro and awards Drift Fans, slipstream & collision physics, automatic barrier alignment, and off-track/stall recovery (`R`).
  - Dynamic chase camera with FOV speed warp, impact camera shake, and interactive 3D showroom turntable in the Main Menu and Garage.
- **Full 7-Power-Up Combat System (`src/engine/TrackBuilder.ts`, `src/engine/RaceEngine.ts`)**:
  - **Nitro Surge**: Explosive speed burst, FOV warp, and afterburner exhaust flames.
  - **Plasma Bolts**: Fires 3 high-velocity energy projectiles forward with slight magnetic cone assist.
  - **Seeker Missile**: Locks onto and pursues the nearest rival ahead along the spline; triggers an incoming lock warning on the target's HUD.
  - **Shockwave**: Emits an expanding radial energy dome that blasts nearby rivals and clears mines/missiles.
  - **Pulse Mine**: Drops an armed explosive hazard behind the vehicle.
  - **Aegis Shield**: Surrounds the vehicle in a protective hexagonal energy field for 6 seconds that absorbs incoming attacks.
  - **Nano Repair**: Immediately restores +55 vehicle chassis integrity.
- **Tactical AI Rivals**:
  - 5 to 7 AI drivers with distinct vehicles, corner curvature speed regulation, dynamic overtaking lane changes, pickup collection, and offensive/defensive power-up usage.
- **Complete Game Loop & Career Progression**:
  - **Main Menu → Vehicle Garage → Career Mode / Race Setup → Countdown → Live Race → Pause / Restart → Results & Fan Breakdown → Replay**.
  - 6 original vehicles across 6 archetypes (`VORTEX GT-R`, `KITSUNE S-15`, `TITAN HEMI-X`, `SPECTRE V12`, `AEGIS INTERCEPTOR`, `VALKYRIE ZERO`) and 3 circuits (`NEON METROPOLIS CIRCUIT`, `IRON HARBOR DOCKS`, `PACIFIC BAY OVERPASS`).
  - Persistent `localStorage` save system for Fans, unlocked vehicles, career event records, audio/graphics settings, and custom keybindings.

## Running Locally

```bash
# 1. Install dependencies
npm install

# 2. Start the development server
npm run dev

# 3. Build for production
npm run build

# 4. Preview the production build locally
npm run preview
```

## Deploying to a Static Web Host

Running `npm run build` outputs a self-contained static bundle in the `dist/` directory. You can deploy `dist/` directly to any static host (Vercel, Netlify, Cloudflare Pages, GitHub Pages, or Firebase Hosting) with zero backend requirements.
