import { fieldFromQuery, rateBetween } from "../src/core/field.ts";
import { SandSim, DEFAULT_FIELD, HEIGHT, WIDTH, MATERIAL, IDLE, STEP, SURFACE, RATE_CAP, depthAt } from "../src/experiments/sand/sim.ts";
import type { Command } from "../src/experiments/sand/sim.ts";

function check(ok: boolean, label: string): void { if (!ok) throw new Error(label); }
function policy(step: number): Command {
  return { move: Math.sin(step / 190) > 0.7 ? 0.4 : -0.05, aimX: Math.sin(step / 90) * 0.35, aimY: step % 600 < 420 ? 1 : -1, drill: true, thrust: step % 600 >= 420 };
}
console.log("| Check | Result | Status |\n| --- | --- | --- |");
const first = new SandSim(DEFAULT_FIELD, 713);
const second = new SandSim(DEFAULT_FIELD, 713);
for (let step = 0; step < 1500; step++) { first.step(policy(step)); second.step(policy(step)); }
check(first.worldHash() === second.worldHash(), "Seed/input determinism");
console.log(`| Determinism, 1,500 steps | ${first.worldHash()} = ${second.worldHash()} | PASS |`);

console.log("\nFour identical sand columns, observer fixed at 176 m. Rates average the actual 24-cell fall path; motion is capped at 8x.\n");
console.log("\n| Sand depth | Expected rate | Measured cells/step | Error | Status |\n| --- | --- | --- | --- | --- |");
for (const row of [70, 118, 212, 306, 400, 494, 588, 682]) {
  const sim = new SandSim(DEFAULT_FIELD);
  sim.cells.fill(MATERIAL.rock);
  sim.awake.fill(0);
  const xs = [50, 90, 130, 170];
  for (const x of xs) {
    for (let y = 1; y < HEIGHT - 5; y++) sim.setCell(x, y, MATERIAL.air);
    sim.setCell(x, row, MATERIAL.sand);
  }
  const positions = xs.map(() => row);
  let distance = 0;
  let expected = 0;
  const steps = 1600;
  for (let step = 0; step < steps; step++) {
    for (const y of positions) expected += Math.min(RATE_CAP, rateBetween(DEFAULT_FIELD, depthAt(400), depthAt(y)));
    sim.stepMaterials(depthAt(400));
    for (let grain = 0; grain < xs.length; grain++) {
      const x = xs[grain];
      const before = positions[grain];
      let after = before;
      while (sim.cell(x, after) !== MATERIAL.sand && after < HEIGHT - 5) after++;
      check(after < HEIGHT - 5, "Sand was lost from its test column");
      distance += after - before;
      if (after >= row + 24) { sim.setCell(x, after, MATERIAL.air); sim.setCell(x, row, MATERIAL.sand); positions[grain] = row; }
      else positions[grain] = after;
    }
  }
  check(sim.rowTicks[400] === steps, "The observer row must tick at exactly 1x");
  const measured = distance / (steps * xs.length);
  const predicted = expected / (steps * xs.length);
  const error = Math.abs(measured - predicted) / predicted;
  console.log(`| ${depthAt(row).toFixed(0)} m | ${predicted.toFixed(3)}x | ${measured.toFixed(3)} | ${(error * 100).toFixed(2)}% | ${error <= 0.1 ? "PASS" : "FAIL"} |`);
  check(error <= 0.1, `Gradient at row ${row}: ${(error * 100).toFixed(2)}%`);
}

const reaction = new SandSim(DEFAULT_FIELD);
reaction.cells.fill(MATERIAL.rock);
reaction.awake.fill(0);
reaction.setCell(50, 400, MATERIAL.lava);
reaction.setCell(51, 400, MATERIAL.water);
reaction.stepMaterials(depthAt(400));
check(reaction.cell(50, 400) === MATERIAL.rock && reaction.cell(51, 400) === MATERIAL.steam, "Lava-water reaction");
for (let i = 0; i < 151; i++) reaction.stepMaterials(depthAt(400));
check(reaction.cell(51, 400) === MATERIAL.air, "Steam fades on its row clock");

for (const law of ["linear", "step"]) {
  const selected = fieldFromQuery(new URLSearchParams(`law=${law}&double=35`), DEFAULT_FIELD);
  const alternative = new SandSim(selected);
  for (let i = 0; i < 120; i++) alternative.stepMaterials(depthAt(400));
  check(alternative.field.law === law && alternative.field.doublingMetres === 35, "Query field overrides");
  check(alternative.rowTicks[400] === 120, "Player row remains 1x for alternate laws");
}
const heat = new SandSim(DEFAULT_FIELD);
heat.cells.fill(MATERIAL.rock);
heat.awake.fill(0);
heat.player.x = 50;
heat.player.y = 400;
for (let y = 396; y <= 404; y++) for (let x = 46; x <= 54; x++) heat.setCell(x, y, MATERIAL.lava);
for (let i = 0; i < 300; i++) heat.step(IDLE);
check(heat.status === "lost", "Lava must end an overheated run");
const stoppedTicks = heat.ticks;
heat.step(IDLE);
check(heat.ticks === stoppedTicks, "Ended runs freeze their numbers");

const trip = new SandSim(DEFAULT_FIELD);
const crystals: { x: number; y: number }[] = [];
for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) if (trip.cell(x, y) === MATERIAL.crystal) crystals.push({ x, y });
let returning = false;
let refueling = false;
for (let step = 0; step < 18000 && trip.status === "playing"; step++) {
  if (trip.player.crystals >= 20) returning = true;
  if (trip.player.fuel < 8) refueling = true;
  if (trip.player.fuel > 90) refueling = false;
  let targetX = 120;
  let targetY = SURFACE - 7;
  if (!returning) {
    let nearest = Infinity;
    for (const crystal of crystals) {
      if (trip.cell(crystal.x, crystal.y) !== MATERIAL.crystal) continue;
      const distance = Math.hypot(crystal.x - trip.player.x, crystal.y - trip.player.y);
      if (distance < nearest) { nearest = distance; targetX = crystal.x; targetY = crystal.y; }
    }
  }
  const dx = targetX - trip.player.x;
  const dy = targetY - trip.player.y;
  const desiredVy = Math.max(-40, Math.min(30, dy * 3));
  trip.step({ move: Math.max(-1, Math.min(1, dx / 3)), aimX: dx, aimY: dy, drill: true, thrust: trip.player.vy > desiredVy && !refueling });
}
check(trip.status === "won", `Round trip policy ended ${trip.status}, y=${trip.player.y.toFixed(1)}, crystals=${trip.player.crystals}`);
console.log("\n| Play / performance | Result | Status |\n| --- | --- | --- |");
console.log("| Water + lava; steam lifetime | Stone + steam; steam fades | PASS |");
console.log("| Alternate laws; lava loss | Local row stays 1x; ended run freezes | PASS |");
console.log(`| Collect and return, real controls | ${trip.player.crystals} crystals, ${trip.localTime.toFixed(1)} s local, ${trip.surfaceTime.toFixed(0)} s surface | PASS |`);
console.log(`| While away | ${trip.rainEvents} rains, ${trip.grassGrown} growth, ${trip.waterDepth.toFixed(0)} m seep | PASS |`);

const benchmark = new SandSim(DEFAULT_FIELD);
for (let i = 0; i < 120; i++) benchmark.step(IDLE);
const started = performance.now();
const samples = new Float64Array(1200);
for (let i = 0; i < samples.length; i++) {
  // Traverse the full world to exercise uncapped and heavily capped rows.
  benchmark.player.y = SURFACE + 10 + i % 680;
  const start = performance.now();
  benchmark.step({ ...IDLE, drill: true });
  samples[i] = performance.now() - start;
}
const elapsed = performance.now() - started;
check(benchmark.ticks === 1320, "Benchmark must execute every live simulation step");
samples.sort();
const sps = samples.length / (elapsed / 1000);
console.log(`| Full world, ${WIDTH} x ${HEIGHT} cells | ${sps.toFixed(0)} steps/s, p95 ${samples[Math.floor(samples.length * 0.95)].toFixed(2)} ms | ${sps >= 60 ? "PASS" : "FAIL"} |`);
check(sps >= 60, "Headless simulation below 60 steps/s");
check(STEP === 1 / 60, "Fixed timestep");
