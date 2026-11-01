import { fieldFromQuery, stretchAt } from '../src/core/field.ts';
import { DEFAULT_FIELD, DEPTHS, LEVELS } from '../src/experiments/chain/levels.ts';
import type { Placement } from '../src/experiments/chain/levels.ts';
import { accountedOre, bubbleAt, command, createSim, stars, step, STEP } from '../src/experiments/chain/sim.ts';
import type { Sim } from '../src/experiments/chain/sim.ts';

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function wait(sim: Sim, seconds: number): void {
  for (let i = 0; i < Math.ceil(seconds / STEP); i++) step(sim, STEP);
}

function visit(sim: Sim, depth: number): void {
  command(sim, { type: 'view', depth });
  for (let i = 0; i < 1000 && Math.abs(sim.viewDepth - depth) > 0.01; i++) step(sim, STEP);
}

function run(index: number, placements: readonly Placement[], watch?: number): Sim {
  const sim = createSim(DEFAULT_FIELD, index);
  for (const placement of placements) {
    visit(sim, placement.depth);
    check(command(sim, { type: 'build', placement }), `Cannot build ${placement.kind}: ${sim.message}`);
    wait(sim, 0.9);
  }
  visit(sim, watch ?? sim.level.view);
  for (let i = 0; i < 60 * 30 * 30 && sim.result === 'playing'; i++) step(sim, STEP);
  check(sim.result !== 'playing', 'Policy timed out');
  check(sim.produced === accountedOre(sim), `Ore conservation failed in ${sim.level.name}: ${sim.produced} vs ${accountedOre(sim)}`);
  return sim;
}

console.log('| Level | Policy | Delivered | Surface time | Real minutes | Buildings | Stars |');
console.log('| --- | --- | ---: | ---: | ---: | ---: | ---: |');
const goodRuns: Sim[] = [];
let naiveFailures = 0;
for (let index = 0; index < LEVELS.length; index++) {
  const level = LEVELS[index];
  const naive: Placement[] = [
    { kind: 'drill', depth: level.seam, bay: 0 },
    { kind: 'smelter', depth: level.seam, bay: 1 },
  ];
  if (level.power) naive.push({ kind: 'generator', depth: level.seam, bay: 2 });
  const good = run(index, level.good);
  const bad = run(index, naive);
  goodRuns.push(good);
  if (stars(bad) <= 1) naiveFailures++;
  for (const [policy, sim] of [['Good', good], ['Naive', bad]] as const) {
    console.log(`| ${level.name} | ${policy} | ${sim.delivered}/${level.goal} | ${sim.result === 'won' ? '' : 'deadline '}${sim.surfaceTime.toFixed(0)} s | ${(sim.localTime / 60).toFixed(2)} | ${sim.peakBuildings} | ${stars(sim)} |`);
  }
}

const shallowSmelt = run(0, LEVELS[0].good);
const deepSmelt = run(0, [{ kind: 'drill', depth: 80, bay: 0 }, { kind: 'smelter', depth: 80, bay: 1 }]);
const compressed = run(2, LEVELS[2].good);
const rawLift = run(2, [{ kind: 'generator', depth: -20, bay: 0 }, { kind: 'smelter', depth: 0, bay: 0 }, { kind: 'drill', depth: 100, bay: 0 }]);
console.log(`\nPlacement flip: Ratio smelter at 0 m delivers ${shallowSmelt.delivered}, at 80 m ${deepSmelt.delivered}. Lift smelter at 100 m delivers ${compressed.delivered}, at 0 m ${rawLift.delivered}.`);

const bestDepths = [0, 2].map(index => {
  const level = LEVELS[index];
  const sweep = DEPTHS.map(depth => {
    const placements: Placement[] = [];
    if (level.power) placements.push({ kind: 'generator', depth: Math.max(-20, depth - 80), bay: 1 });
    placements.push({ kind: 'smelter', depth, bay: depth === level.seam ? 1 : 0 }, { kind: 'drill', depth: level.seam, bay: 0 });
    return { depth, sim: run(index, placements) };
  });
  sweep.sort((a, b) => b.sim.delivered - a.sim.delivered || a.sim.surfaceTime - b.sim.surfaceTime);
  const best = sweep[0];
  console.log(`${level.name} depth sweep winner: smelter ${best.depth} m, ${best.sim.delivered} ingots at ${best.sim.surfaceTime.toFixed(0)} surface s.`);
  return best.depth;
});
check(bestDepths[0] !== bestDepths[1], 'Best smelter depth must differ across the complete slot sweep');

const deterministic = run(4, LEVELS[4].good);
check(JSON.stringify({ ...deterministic, rng: null }) === JSON.stringify({ ...goodRuns[4], rng: null }), 'Seeded replay diverged');
const fasterWatch = run(0, LEVELS[0].good, 80);
check(Math.abs(fasterWatch.surfaceTime - goodRuns[0].surfaceTime) < 2, 'Changing watch depth must preserve surface throughput');
check(fasterWatch.localTime < goodRuns[0].localTime * 0.55, 'A deeper watch must speed up the same chain');
const paused = createSim(DEFAULT_FIELD);
command(paused, { type: 'pause' });
command(paused, { type: 'view', depth: 80 });
wait(paused, 3);
check(paused.surfaceTime === 0 && paused.viewDepth === 0, 'Pause must freeze travel and clocks');
check(!command(paused, { type: 'build', placement: { kind: 'drill', depth: 80, bay: 0 } }), 'Remote construction must fail');
command(paused, { type: 'pause' });
visit(paused, 80);
check(paused.surfaceTime > 1.6, 'A deep visit must spend surface time');
const clocks = createSim(DEFAULT_FIELD);
visit(clocks, 60);
const before = clocks.surfaceTime;
wait(clocks, 1);
check(Math.abs(clocks.surfaceTime - before - 8) < 1e-6, 'Viewpoint clock must use stretch');
for (const law of ['exp', 'linear', 'step']) {
  const field = fieldFromQuery(new URLSearchParams(`law=${law}&double=30`), DEFAULT_FIELD);
  const sim = createSim(field);
  visit(sim, 60);
  const start = sim.surfaceTime;
  wait(sim, 1);
  check(Math.abs(sim.surfaceTime - start - stretchAt(field, 60)) < 1e-6, `${law} field ignored`);
}
const slow = createSim(DEFAULT_FIELD, 4);
check(command(slow, { type: 'build', placement: { kind: 'anchor', depth: 0, bay: 0, mode: 0.25 } }), 'Slow anchor placement failed');
wait(slow, 1);
check(bubbleAt(slow, 0) === 0.25 && bubbleAt(slow, 40) === 1, 'Anchor radius or slow mode broken');
wait(slow, 28);
check(bubbleAt(slow, 0) === 1, 'Unfed anchor must expire');
const removals = createSim(DEFAULT_FIELD, 4);
visit(removals, 120);
command(removals, { type: 'build', placement: { kind: 'drill', depth: 120, bay: 0 } });
wait(removals, 6);
command(removals, { type: 'remove', depth: 120, bay: 0 });
check(removals.produced === accountedOre(removals), 'Removal lost accounting');

const moving = createSim(DEFAULT_FIELD, 3);
for (const placement of [{ kind: 'smelter', depth: 0, bay: 0 }, { kind: 'drill', depth: 80, bay: 0 }, { kind: 'vault', depth: 80, bay: 1 }] as const) {
  visit(moving, placement.depth);
  command(moving, { type: 'build', placement });
  wait(moving, 1);
}
let checkedTravel = false;
for (let i = 0; i < 3000 && moving.result === 'playing'; i++) {
  const before = moving.cars.flatMap(car => car.journey.kind === 'loaded' ? [{ car, item: car.journey.item, age: car.journey.item.age, depth: car.depth }] : []);
  step(moving, STEP);
  for (const old of before) {
    if (old.car.journey.kind !== 'loaded' || old.car.journey.item.id !== old.item.id) continue;
    const distance = Math.abs(old.car.depth - old.depth);
    check(Math.abs(old.item.age - old.age - distance / moving.level.speed) < 1e-6, 'Cargo must age on the clock along its route');
    if (distance > 0) checkedTravel = true;
  }
  for (const b of moving.buildings) {
    if (b.kind === 'vault') check(b.items.length <= 30, 'Vault reservations exceeded capacity');
    if (b.kind === 'smelter') check(b.items.filter(item => item.kind === 'ore').length <= 6, 'Lift reservations overfilled a furnace');
  }
  check(moving.produced === accountedOre(moving), 'Transit/decay lost material');
}
check(checkedTravel && moving.expired > 0, 'Volatile transport should exercise decay');
visit(moving, 0);
command(moving, { type: 'remove', depth: 0, bay: 0 });
wait(moving, 1);
check(moving.produced === accountedOre(moving), 'Removing a car destination lost cargo');
for (const sim of goodRuns) {
  check(stars(sim) === 3, `${sim.level.name}: reference must earn 3 stars`);
  check(sim.localTime >= 120 && sim.localTime <= 300, `${sim.level.name}: reference must take 2 to 5 real minutes`);
}
check(naiveFailures >= 4, 'At least four naive placements must fail or earn at most one star');
check(shallowSmelt.delivered > deepSmelt.delivered && compressed.delivered > rawLift.delivered, 'Smelter placement must flip');
console.log('\nPASS: five 3-star references, naive separation, placement flip, 2-5 minute runs, deterministic replay, conservation, viewpoint invariance, clocks, query laws, local construction, pause, anchor upkeep, transit aging, capacity and removal.');
