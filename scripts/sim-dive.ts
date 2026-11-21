import { createSim, step, STEP, DEFAULT_FIELDS, WIDTH, METRES, layerAt, tileAt, cargoCapacity, fuelCapacity, offers, atBase, depth, safeSeconds, IDLE } from '../src/experiments/dive/sim.ts';
import type { Sim, Command, Mode, Action } from '../src/experiments/dive/sim.ts';
import { formatDuration } from '../src/core/format.ts';
import { fieldFromQuery, stretchAt } from '../src/core/field.ts';

type Policy = 'balanced' | 'greedy' | 'shallow';
type Pilot = { shaft: number; returning: boolean; layer: number; row: number; side: -1 | 1; target: { layer: number; count: number }; phase: 'shaft' | 'mine'; lastDives: number };
function need(s: Sim): { layer: number; count: number; action: Action | null } {
  const wish: Action[] = [];
  if (s.tank < 1) wish.push('tank');
  if (s.hold < 1) wish.push('cargo');
  if (s.mode === 'waves') {
    if (s.hp < 65) wish.push('repair');
    if (s.generator < 1) wish.push('generator');
    if (s.shield < 1) wish.push('shield');
    if (s.battery < 1) wish.push('battery');
    if (s.tier >= 2) {
      if (s.tank < 2) wish.push('tank');
      if (s.hold < 2) wish.push('cargo');
      if (s.generator < 2) wish.push('generator');
      if (s.shield < 2) wish.push('shield');
    }
    if (s.tier >= 4) {
      if (s.tank < 3) wish.push('tank');
      if (s.generator < 3) wish.push('generator');
      if (s.shield < 3) wish.push('shield');
    }
    if (s.tier >= s.layers - 2 && !s.anchor) wish.push('anchor');
    if (s.anchor && s.ores[s.layers - 2] < 4) return { layer: s.layers - 2, count: 10, action: null };
  } else {
    if (s.tier >= 4 && s.tank < 2) wish.push('tank');
    if (s.tier >= 8 && s.tank < 3) wish.push('tank');
    if (s.tier >= 5 && s.hold < 2) wish.push('cargo');
  }
  wish.push(s.tier < s.layers - 1 ? 'drill' : s.mode === 'years' ? 'beacon' : 'drill');
  for (const action of wish) {
    const offer = offers(s).find(item => item.action === action);
    if (offer) return { layer: offer.layer, count: offer.cost, action };
  }
  return { layer: s.layers - 1, count: 1, action: null };
}
function steer(delta: number): -1 | 0 | 1 { return Math.abs(delta) < 0.08 ? 0 : delta > 0 ? 1 : -1; }
function home(s: Sim): Command {
  const x = Math.floor(s.player.x);
  const y = Math.floor(s.player.y);
  if (y < 0) return { ...IDLE, thrust: true };
  const start = (y + 1) * WIDTH + x;
  const previous = Array.from({ length: (s.rows + 1) * WIDTH }, () => -1);
  previous[start] = start;
  const queue = [start];
  let goal = start;
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i];
    if (node < WIDTH) { goal = node; break; }
    const nx = node % WIDTH;
    const ny = Math.floor(node / WIDTH) - 1;
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
      const tx = nx + dx; const ty = ny + dy;
      if (tx < 0 || tx >= WIDTH || ty < -1 || ty >= s.rows || tileAt(s, tx, ty)) continue;
      const next = (ty + 1) * WIDTH + tx;
      if (previous[next] !== -1) continue;
      previous[next] = node; queue.push(next);
    }
  }
  if (goal === start) return { ...IDLE, thrust: true };
  while (previous[goal] !== start) goal = previous[goal];
  const tx = goal % WIDTH + 0.5;
  const ty = Math.floor(goal / WIDTH) - 1;
  const move = steer(tx - s.player.x);
  return { ...IDLE, move, thrust: ty < y ? Math.abs(tx - s.player.x) < 0.18 : s.player.y > ty + 0.65 };
}
function chooseRow(s: Sim, layer: number): number {
  const rows = Array.from({ length: s.rows }, (_, y) => y).filter(y => layerAt(s.field, y * METRES) === layer);
  // Stay on the first useful shelf of a band; open a new one after its ore is mined.
  return rows.find(y => {
    if (y === 0) return false;
    let left = 0;
    for (let x = 1; x < WIDTH - 1; x++) if (tileAt(s, x, y)?.ore === layer) left++;
    return left > 2;
  }) ?? rows[rows.length - 1] ?? s.rows - 1;
}
function commandFor(s: Sim, p: Pilot, policy: Policy): Command {
  if (s.receipt) return { ...IDLE, dismiss: true };
  if (s.dives.length !== p.lastDives) {
    p.lastDives = s.dives.length; p.returning = false; p.phase = 'shaft';
  }
  if (atBase(s) && !s.expedition) {
    const wanted = need(s);
    const buy = offers(s).find(item => item.action === (policy === 'greedy' ? 'drill' : wanted.action) && item.available);
    if (buy && !s.research) return { ...IDLE, action: buy.action };
    p.target = wanted;
    p.layer = policy === 'shallow' ? 0 : policy === 'greedy' ? Math.min(s.layers - 1, s.tier + 2) : wanted.layer;
    if (s.research) p.layer = s.tier;
    if (s.mode === 'years' && s.coal < (s.tier >= 13 ? 32 : 8) && s.tier > 6 && !s.research) p.layer = 0;
    if (s.mode === 'waves' && s.coal < 10 && s.tier > 2 && policy === 'balanced') p.layer = 0;
    p.row = chooseRow(s, p.layer);
    if (s.mode === 'waves' && s.tier === s.layers - 1 && wanted.action === null && p.layer === s.layers - 1) p.row = s.rows - 1;
    if (policy === 'greedy') p.row = Math.min(s.rows - 1, p.row + 4);
    p.phase = 'shaft'; p.side = 1;
    let best = Infinity;
    for (let x = 1; x < WIDTH - 1; x++) {
      if (p.row < s.rows - 1 && !tileAt(s, x, p.row + 1)) continue;
      let nearest = Infinity;
      for (const direction of [-1, 1]) for (let dx = 0; dx < WIDTH; dx++) {
        const tx = x + dx * direction;
        if (tx < 0 || tx >= WIDTH || (p.row < s.rows - 1 && !tileAt(s, tx, p.row + 1))) break;
        if (tileAt(s, tx, p.row)?.ore === p.layer || tileAt(s, tx, p.row)?.ore === 'heart') nearest = Math.min(nearest, dx);
      }
      if (!Number.isFinite(nearest)) continue;
      let cost = Math.abs(x - s.player.x) * 0.1;
      cost += nearest;
      for (let y = 0; y <= p.row; y++) if (tileAt(s, x, y)) cost += 1;
      if (cost < best) { best = cost; p.shaft = x + 0.5; }
    }
    if (Math.abs(s.player.x - p.shaft) > 0.09) return { ...IDLE, move: steer(p.shaft - s.player.x) };
    return { ...IDLE, down: true };
  }
  const cargo = s.player.cargo;
  const have = cargo.filter(ore => ore === p.target.layer).length + s.ores[p.target.layer];
  const fuelReserve = depth(s) / 7 + Math.abs(s.player.x - p.shaft) * 0.8 + 10;
  const researchFinished = s.mode === 'years' && s.researchDone !== '';
  const needCoal = p.layer === 0 && p.target.layer > 0;
  const heartTrip = s.mode === 'waves' && s.tier === s.layers - 1 && p.layer === s.layers - 1;
  const enough = heartTrip ? cargo.includes('heart') : needCoal ? cargo.filter(ore => ore === 'coal').length >= 7 : have >= p.target.count;
  if (policy !== 'greedy' && (s.player.fuel < fuelReserve || cargo.length >= cargoCapacity(s) || cargo.includes('heart') || (enough && !s.research) || researchFinished || (s.mode === 'years' && safeSeconds(s) < depth(s) / 7 + 30))) p.returning = true;
  if (policy === 'greedy' && s.player.fuel < 4) p.returning = true;
  if (p.returning) {
    return home(s);
  }
  if (p.phase === 'shaft') {
    if (Math.floor(s.player.y) < p.row) return { ...IDLE, down: true };
    p.phase = 'mine';
  }
  if (s.mode === 'years' && s.research && s.player.fuel < fuelReserve + 18) return IDLE;
  if (policy === 'balanced' && s.mode === 'waves' && s.tier === s.layers - 1 && !s.research && p.layer === s.layers - 1) return { ...IDLE, down: true };
  const nextX = Math.floor(s.player.x + p.side * 0.8);
  if (s.player.grounded && !tileAt(s, nextX, Math.floor(s.player.y) + 1)) {
    if (p.side === 1) p.side = -1;
    else { p.returning = true; return IDLE; }
  }
  if (s.player.x > WIDTH - 1.4) p.side = -1;
  if (s.player.x < 1.4) {
    p.returning = true; return IDLE;
  }
  return { ...IDLE, move: p.side };
}
function run(mode: Mode, policy: Policy, seed = 417): Sim {
  const s = createSim(mode, { ...DEFAULT_FIELDS[mode] }, seed);
  const p: Pilot = { shaft: 16.5, returning: false, layer: 0, row: 1, side: 1, target: { layer: 0, count: 4 }, phase: 'shaft', lastDives: 0 };
  for (let frame = 0; frame < 40 * 60 * 60 && s.outcome === 'playing'; frame++) step(s, commandFor(s, p, policy));
  return s;
}
let failed = false;
const results: { mode: Mode; policy: Policy; sim: Sim }[] = [];
for (const mode of ['waves', 'years'] as const) {
  for (const policy of ['balanced', 'greedy', 'shallow'] as const) results.push({ mode, policy, sim: run(mode, policy) });
}
console.log('# Dive acceptance metrics\n');
console.log('Seed 417. Inputs run at 60 Hz. Years surface time is calendar time.\n');
console.log('| Mode | Policy | Outcome | Real min | Surface elapsed | Deepest | Dives |');
console.log('|---|---|---|---:|---:|---:|---:|');
for (const { mode, policy, sim: s } of results) {
    console.log(`| ${mode} | ${policy} | ${s.outcome === 'playing' ? 'timeout' : s.outcome} | ${(s.local / 60).toFixed(2)} | ${formatDuration(s.surface * (mode === 'years' ? 60 : 1))} | ${s.deepest.toFixed(1)} m | ${s.dives.length} |`);
}
for (const { mode, policy, sim: s } of results) {
    if (policy === 'balanced') {
      console.log(`\n## ${mode} balanced dive log\n`);
      console.log('| Dive | Depth | Your time | Surface elapsed |');
      console.log('|---:|---:|---:|---:|');
      for (const [i, dive] of s.dives.entries()) console.log(`| ${i + 1} | ${dive.depth.toFixed(1)} m | ${dive.local.toFixed(1)} s | ${formatDuration(dive.surface * (mode === 'years' ? 60 : 1))} |`);
      const first = s.dives[0];
      const last = s.dives[s.dives.length - 1];
      const factor = first && last ? last.surface / first.surface : 0;
      console.log(`\nSurface dive growth: ${factor.toFixed(1)}x. Drill ${s.tier + 1}, coal ${s.coal.toFixed(1)}, fuel ${s.player.fuel.toFixed(1)}/${fuelCapacity(s)}, HP ${s.hp.toFixed(1)}, population ${s.population.toFixed(1)}, tows ${s.tows}.\n`);
      if (s.outcome !== 'win' || s.local < 15 * 60 || s.local > 25 * 60 || factor < 10 || !first || !last || last.depth <= first.depth) failed = true;
    }
    if (policy === 'shallow' && s.outcome === 'win') failed = true;
    if (policy === 'greedy' && s.outcome === 'win' && s.local <= 25 * 60) failed = true;
}
// Clock, idling, input determinism, and the three query laws use the same real step.
for (const law of ['exp', 'linear', 'step'] as const) {
  const field = fieldFromQuery(new URLSearchParams(`law=${law}&double=20`), DEFAULT_FIELDS.waves);
  if (field.law !== law || field.doublingMetres !== 20) throw new Error('Query field not applied');
  const a = createSim('waves', field);
  const b = createSim('waves', field);
  for (let i = 0; i < 600; i++) {
    const command = i < 450 ? { ...IDLE, down: true } : IDLE;
    const before = a.surface;
    const expected = STEP * stretchAt(a.field, depth(a));
    const fuelBefore = a.player.fuel;
    step(a, command, STEP); step(b, command, STEP);
    if (Math.abs(a.surface - before - expected) > 0.0000001) throw new Error(`Clock integration failed for ${law}`);
    if (i >= 450 && a.player.fuel !== fuelBefore) throw new Error('Idle burns fuel');
  }
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`Determinism failed for ${law}`);
  for (let i = 0; i < 600 && !a.receipt; i++) step(a, { ...IDLE, thrust: true });
  if (!a.receipt) throw new Error('Thrust failed to return to base');
  step(a, { ...IDLE, dismiss: true });
  for (let i = 0; i < 300; i++) step(a, IDLE);
  if (!atBase(a) || a.expedition || a.player.fuel !== fuelCapacity(a)) throw new Error('Docking failed to park and refuel');
}
console.log(failed ? '\nACCEPTANCE FAILED: tune and rerun.' : '\nPASS: policy acceptance, deterministic input replay, clock integration, idle fuel, docking, and all three query laws.');
if (failed) throw new Error('Dive acceptance metrics failed');
