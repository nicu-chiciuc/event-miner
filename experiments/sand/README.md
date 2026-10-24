# Sand

Play at `/experiments/sand/`. The experiment asks whether watching a material world run at different speeds is fun without an economy.

WASD or arrows steer and aim. W or Up also fires the thruster. Space thrusts, X or Shift drills, and a held mouse button aims and drills. Q looks up the shaft. Release thrust to refill fuel. H pauses with help; R restarts. Touch controls appear on coarse pointers and narrow screens. Bring at least 20 crystals back to the surface.

## Time and materials

The world is 240 by 800 cells, with the surface at row 48 and 0.5 metres per cell. The default exponential field doubles every 47 metres, giving eight doublings below ground. Rendering uses four CSS pixels per cell. At 1280 by 800, the area between the HUD and footer spans about 1.5 doublings. `?law=linear`, `?law=step`, and `?double=35` use the shared field parser.

The whole world advances at 60 fixed steps per local second. Each row has a deterministic fractional clock, with eight evenly spaced scheduling phases. Moving material carries its unused local-time credit across rows so grains cannot gain speed by crossing staggered update phases. Material motion is capped at 8x. The surface clock, day cycle, storm count and plant growth retain the full time ratio; the surface inset shows streaks when particle motion is capped.

Cells, clocks, lifetimes and movement stamps use typed arrays. Terrain rendering caches 32 by 32 chunks. Simulation sleeps settled 32-cell row strips after eight quiet updates and wakes neighboring strips on changes. Rendering only reads the simulation; input sends commands. Rainwater carries a tag through material swaps so the return receipt measures rain seepage rather than pre-existing deep pools.

## Tuning

- Acceleration 125 cells/s² and drag 7/s give prompt direction changes with a short coast.
- Gravity 52 cells/s², thrust 168 cells/s², ascent limit 48 cells/s and descent limit 36 cells/s keep the return trip controllable.
- Fuel burns at 10 units/s and refills at 28 units/s only when thrust is released.
- The drill clears a radius of 4.4 cells every 0.065 s. Chips fall behind the cutter rather than blocking its nose.
- Five crystals per seam require several collections. The initial 21-cell seam ended the objective on the first deposit.
- Increasing carried time credit from two to eight ticks reduced the worst gradient-test error from 8.13% to 7.16%.

## Verification

Run `npx tsc --noEmit -p .`, `npx vite build`, and `node scripts/sim-sand.ts`.

The script compares 1,500 seeded steps, measures four identical falling columns at eight depths, checks the observer's row stays exactly 1x under all three laws, exercises water/lava reactions and steam expiry, verifies lava ends and freezes a run, completes a trip using movement commands, then times 1,200 full-world steps while traversing shallow and deep observer positions. Fall rates average the field along each repeated 24-cell path. The performance fixture asserts that every timed step actually advances the simulation.

Latest run on the development Mac:

| Check | Result |
| --- | --- |
| Determinism | Both hashes `a9a8e992` |
| Gradient error, eight depths | 0.00% to 7.16%, all below 10% |
| Exact observer row | 1.000x for exp, linear and step |
| Collect and return policy | 20 crystals, 31.8 s local, 329 s surface |
| Full-world throughput | 1,835 steps/s |
| Full-world p95 step | 1.19 ms |
| Chrome at 1280 by 800 | About 120 fps, 0.63 ms average render, 1.04 ms average sim |
| Chrome at 390 by 844 | About 120 fps, touch drill verified, no horizontal overflow |

A manual browser trip returned 25 crystals from 311 m, with 2.7 minutes on the player's clock and 2 hours at the surface. Help, restart, fuel release, the return screen and the phone layout were exercised. Browser error and warning logs were empty. The build's large-chunk warning comes from the existing Phaser prototype. No 2020 laptop was available; browser timings describe this Mac only. Timing attributes on the canvas expose FPS, average simulation/render cost and render p95 for repeat measurement.

The weakest part is the 8x cap: at great depth the surface's full acceleration is clearest in weather and daylight, while individual falling grains cannot keep accelerating. The cellular water is deliberately coarse and can flood the return shaft.
