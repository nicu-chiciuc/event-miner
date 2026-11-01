import { rateBetween, stretchAt } from '../../core/field.ts';
import type { Field } from '../../core/field.ts';
import { createRng } from '../../core/rng.ts';
import { DEPTHS, LEVELS } from './levels.ts';
import type { Kind, Level, Placement } from './levels.ts';

export const STEP = 1 / 30;
export const RULES = {
  drillCycle: 1, smeltCycle: 12, recipe: 3, power: 0.6, powerRadius: 90,
  anchorRadius: 22, anchorCharge: 6, oreLife: 8, buildTime: 0.8,
  buildReach: 6, viewSpeed: 50, dispatch: 0.4, coalCycle: 20,
} as const;

export type Item = { id: number; kind: 'ore' | 'ingot'; age: number; life: number };
type Base = { id: number; depth: number; bay: number; construction: number; items: Item[] };
export type Building = Base & (
  | { kind: 'drill'; progress: number }
  | { kind: 'smelter'; work: number | null; power: number }
  | { kind: 'generator'; coal: number }
  | { kind: 'lift' }
  | { kind: 'vault' }
  | { kind: 'anchor'; mode: 4 | 0.25; charge: number }
);
type Journey =
  | { kind: 'idle' }
  | { kind: 'pickup'; source: number; item: number; target: number | null }
  | { kind: 'loaded'; item: Item; target: number | null };
export type Car = { depth: number; journey: Journey; cooldown: number };
export type Sim = {
  field: Field; level: Level; levelIndex: number; rng: () => number;
  buildings: Building[]; cars: Car[]; nextId: number;
  viewDepth: number; targetDepth: number; localTime: number; surfaceTime: number;
  paused: boolean; result: 'playing' | 'won' | 'lost'; delivered: number;
  produced: number; expired: number; scrapped: number; anchorSpent: number;
  peakBuildings: number; coalReserve: number; message: string;
};
export type Command =
  | { type: 'view'; depth: number }
  | { type: 'build'; placement: Placement }
  | { type: 'remove'; depth: number; bay: number }
  | { type: 'pause' };

export function createSim(field: Field, levelIndex = 0, seed = 73): Sim {
  const level = LEVELS[levelIndex];
  if (!level) throw new Error('Unknown level');
  return {
    field, level, levelIndex, rng: createRng(seed),
    buildings: [{ id: 1, kind: 'lift', depth: 0, bay: 2, construction: 0, items: [] }],
    cars: Array.from({ length: level.cars }, () => ({ depth: 0, journey: { kind: 'idle' }, cooldown: 0 })),
    nextId: 2, viewDepth: 0, targetDepth: 0, localTime: 0, surfaceTime: 0,
    paused: false, result: 'playing', delivered: 0, produced: 0, expired: 0,
    scrapped: 0, anchorSpent: 0, peakBuildings: 1, coalReserve: 600,
    message: 'Choose a tool, visit a depth, then build in an empty bay.',
  };
}

export function allowed(sim: Sim, kind: Kind): boolean {
  if (kind === 'generator') return sim.level.power;
  if (kind === 'anchor') return sim.level.anchors;
  if (kind === 'vault') return sim.level.volatile;
  if (kind === 'lift') return sim.levelIndex >= 2;
  return true;
}

export function command(sim: Sim, input: Command): boolean {
  if (input.type === 'pause') {
    sim.paused = !sim.paused;
    return true;
  }
  if (sim.result !== 'playing') return false;
  if (input.type === 'view') {
    if (!Number.isFinite(input.depth)) return false;
    sim.targetDepth = Math.max(-20, Math.min(160, input.depth));
    return true;
  }
  const depth = input.type === 'build' ? input.placement.depth : input.depth;
  const bay = input.type === 'build' ? input.placement.bay : input.bay;
  if (!DEPTHS.some(d => d === depth) || !Number.isInteger(bay) || bay < 0 || bay > 2) return false;
  if (Math.abs(sim.viewDepth - depth) > RULES.buildReach) {
    sim.message = `Visit ${depth} m first. Build within ${RULES.buildReach} m of your watch.`;
    return false;
  }
  const existing = sim.buildings.find(b => b.depth === depth && b.bay === bay);
  if (input.type === 'remove') {
    if (!existing) return false;
    if (existing.kind === 'lift' && sim.levelIndex < 2) {
      sim.message = 'The supplied lift stays here for this lesson.';
      return false;
    }
    sim.scrapped += existing.items.reduce((sum, item) => sum + (item.kind === 'ore' ? 1 : RULES.recipe), 0);
    if (existing.kind === 'smelter' && existing.work !== null) sim.scrapped += RULES.recipe;
    if (existing.kind === 'generator') sim.coalReserve += existing.coal;
    sim.buildings = sim.buildings.filter(b => b !== existing);
    sim.message = 'Bay cleared. Building credit returned; stored items scrapped.';
    return true;
  }
  const { kind } = input.placement;
  if (!allowed(sim, kind)) return false;
  if (existing) { sim.message = 'Bay occupied. Right click or hold to remove.'; return false; }
  if (sim.buildings.length >= sim.level.budget) { sim.message = 'Building budget full. Remove a building to free a credit.'; return false; }
  if (kind === 'drill' && depth !== sim.level.seam) { sim.message = `Drills need the seam at ${sim.level.seam} m.`; return false; }
  if (kind === 'lift' && sim.buildings.some(b => b.kind === 'lift')) { sim.message = 'One lift, fixed cars. Remove the old station to relocate it.'; return false; }
  const base: Base = { id: sim.nextId++, depth, bay, construction: RULES.buildTime, items: [] };
  let building: Building;
  switch (kind) {
    case 'drill': building = { ...base, kind, progress: 0 }; break;
    case 'smelter': building = { ...base, kind, work: null, power: 0 }; break;
    case 'generator': {
      const coal = Math.min(240, sim.coalReserve);
      sim.coalReserve -= coal;
      building = { ...base, kind, coal };
      break;
    }
    case 'lift': building = { ...base, kind }; break;
    case 'vault': building = { ...base, kind }; break;
    case 'anchor': building = { ...base, kind, mode: input.placement.mode ?? 4, charge: RULES.anchorCharge }; break;
  }
  sim.buildings.push(building);
  sim.peakBuildings = Math.max(sim.peakBuildings, sim.buildings.length);
  sim.message = `${kind[0].toUpperCase()}${kind.slice(1)} building at ${depth} m.`;
  return true;
}

export function bubbleAt(sim: Sim, depth: number): number {
  const anchor = sim.buildings.find(b => b.kind === 'anchor' && b.construction <= 0 && b.charge > 0 && Math.abs(b.depth - depth) <= RULES.anchorRadius);
  return anchor?.kind === 'anchor' ? anchor.mode : 1;
}

export function localRate(sim: Sim, depth: number): number {
  return rateBetween(sim.field, sim.viewDepth, depth) * bubbleAt(sim, depth);
}

export function surfaceRate(sim: Sim, depth: number): number {
  return bubbleAt(sim, depth) / stretchAt(sim.field, depth);
}

export function stars(sim: Sim): number {
  return sim.result === 'won' ? 1 + Number(sim.surfaceTime <= sim.level.early) + Number(sim.peakBuildings <= sim.level.par) : 0;
}

function newItem(sim: Sim, kind: Item['kind']): Item {
  return { id: sim.nextId++, kind, age: 0, life: kind === 'ore' && sim.level.volatile ? RULES.oreLife * (0.9 + 0.2 * sim.rng()) : Infinity };
}

function ageItem(sim: Sim, item: Item, dt: number): boolean {
  item.age += dt;
  if (item.age < item.life) return true;
  sim.expired++;
  return false;
}

function accepts(sim: Sim, building: Building, item: Item): boolean {
  if (building.construction > 0) return false;
  const incoming = sim.cars.filter(car => car.journey.kind !== 'idle' && car.journey.target === building.id).length;
  switch (building.kind) {
    case 'smelter': return item.kind === 'ore' && building.items.filter(i => i.kind === 'ore').length + incoming < 6;
    case 'anchor': return item.kind === 'ore' && building.items.length + incoming < 1 && building.charge < RULES.anchorCharge / 2;
    case 'vault': return building.items.length + incoming < 30;
    default: return false;
  }
}

function destination(sim: Sim, source: Building, item: Item): Building | null | undefined {
  if (item.kind === 'ingot') return null;
  const candidates = sim.buildings.filter(b => b.id !== source.id && accepts(sim, b, item) && (source.kind !== 'vault' || b.kind !== 'vault'));
  candidates.sort((a, b) => Number(a.kind === 'vault') - Number(b.kind === 'vault') || Math.abs(a.depth - source.depth) - Math.abs(b.depth - source.depth) || Number(b.kind === 'anchor') - Number(a.kind === 'anchor') || a.id - b.id);
  return candidates[0];
}

function handoffs(sim: Sim): void {
  for (const source of sim.buildings) {
    if (source.construction > 0 || (source.kind !== 'drill' && source.kind !== 'smelter' && source.kind !== 'vault')) continue;
    for (const item of [...source.items]) {
      if (source.kind === 'smelter' && item.kind === 'ore') continue;
      const target = destination(sim, source, item);
      if (target === undefined || Math.abs((target?.depth ?? 0) - source.depth) > 0.01) continue;
      source.items = source.items.filter(i => i !== item);
      if (target) target.items.push(item);
      else sim.delivered++;
    }
  }
}

function machines(sim: Sim, surfaceDt: number): void {
  const supply = new Map<number, number>();
  for (const b of sim.buildings) {
    const dt = surfaceDt * surfaceRate(sim, b.depth);
    b.items = b.items.filter(item => ageItem(sim, item, dt));
    if (b.construction > 0) { b.construction -= dt; continue; }
    if (b.kind === 'generator' && b.coal > 0) {
      const running = Math.min(dt, b.coal * RULES.coalCycle);
      b.coal -= running / RULES.coalCycle;
      supply.set(b.id, running * RULES.power);
    }
  }
  for (const b of sim.buildings) {
    if (b.construction > 0) continue;
    const dt = surfaceDt * surfaceRate(sim, b.depth);
    switch (b.kind) {
      case 'drill':
        if (b.items.length < 18) {
          b.progress += dt;
          while (b.progress >= RULES.drillCycle && b.items.length < 18) {
            b.progress -= RULES.drillCycle;
            b.items.push(newItem(sim, 'ore'));
            sim.produced++;
          }
        }
        break;
      case 'smelter': {
        if (b.work === null && b.items.filter(i => i.kind === 'ore').length >= RULES.recipe && b.items.filter(i => i.kind === 'ingot').length < 6) {
          let consumed = 0;
          b.items = b.items.filter(i => i.kind !== 'ore' || consumed++ >= RULES.recipe);
          b.work = RULES.smeltCycle;
        }
        let energy = sim.level.power ? 0 : dt;
        if (b.work !== null && sim.level.power) {
          for (const gen of sim.buildings) {
            if (gen.kind !== 'generator' || Math.abs(gen.depth - b.depth) > RULES.powerRadius) continue;
            const available = supply.get(gen.id) ?? 0;
            const take = Math.min(available, dt - energy);
            supply.set(gen.id, available - take);
            energy += take;
          }
        }
        b.power = dt > 0 ? energy / dt : 0;
        if (b.work !== null) {
          b.work -= energy;
          if (b.work <= 0) { b.work = null; b.items.push(newItem(sim, 'ingot')); }
        }
        break;
      }
      case 'anchor': {
        if (b.charge < RULES.anchorCharge / 2 && b.items.length) {
          b.items.shift();
          b.charge += RULES.anchorCharge;
          sim.anchorSpent++;
        }
        b.charge = Math.max(0, b.charge - dt);
        break;
      }
      case 'generator': case 'lift': case 'vault': break;
    }
  }
}

// Midpoint quadrature in one-metre segments integrates the car's changing clock.
// Cargo ages by distance / local speed, including inside an anchor bubble.
function travel(sim: Sim, car: Car, target: number, surfaceDt: number): number {
  let age = 0;
  let remaining = surfaceDt;
  while (remaining > 1e-8 && Math.abs(target - car.depth) > 1e-7) {
    const direction = Math.sign(target - car.depth);
    const distance = Math.min(1, Math.abs(target - car.depth));
    const mid = car.depth + direction * distance / 2;
    const rate = surfaceRate(sim, mid);
    const duration = distance / (sim.level.speed * rate);
    const portion = Math.min(1, remaining / duration);
    car.depth += direction * distance * portion;
    age += distance * portion / sim.level.speed;
    remaining -= duration * portion;
  }
  return age;
}

function lifts(sim: Sim, surfaceDt: number): void {
  const lift = sim.buildings.find(b => b.kind === 'lift' && b.construction <= 0);
  if (!lift) {
    for (const car of sim.cars) {
      if (car.journey.kind === 'loaded' && !ageItem(sim, car.journey.item, surfaceDt * surfaceRate(sim, car.depth))) car.journey = { kind: 'idle' };
    }
    return;
  }
  for (const car of sim.cars) {
    car.cooldown -= surfaceDt * surfaceRate(sim, lift.depth);
    const journey = car.journey;
    if (journey.kind === 'idle') {
      if (car.cooldown > 0) continue;
      const reserved = new Set(sim.cars.flatMap(c => c.journey.kind === 'pickup' ? [c.journey.item] : []));
      const jobs = sim.buildings.flatMap(source => {
        if (source.construction > 0 || (source.kind !== 'drill' && source.kind !== 'smelter' && source.kind !== 'vault')) return [];
        return source.items.flatMap(item => {
          if (reserved.has(item.id) || (source.kind === 'smelter' && item.kind === 'ore')) return [];
          const target = destination(sim, source, item);
          return target === undefined ? [] : [{ source, item, target }];
        });
      });
      jobs.sort((a, b) => Number(b.item.kind === 'ingot') - Number(a.item.kind === 'ingot') || a.item.id - b.item.id);
      const job = jobs[0];
      if (job) car.journey = { kind: 'pickup', source: job.source.id, item: job.item.id, target: job.target?.id ?? null };
      else travel(sim, car, lift.depth, surfaceDt);
      continue;
    }
    if (journey.kind === 'pickup') {
      const source = sim.buildings.find(b => b.id === journey.source);
      const item = source?.items.find(i => i.id === journey.item);
      if (!source || !item) { car.journey = { kind: 'idle' }; continue; }
      travel(sim, car, source.depth, surfaceDt);
      if (Math.abs(car.depth - source.depth) < 1e-6) {
        source.items = source.items.filter(i => i !== item);
        car.journey = { kind: 'loaded', item, target: journey.target };
      }
      continue;
    }
    const target = sim.buildings.find(b => b.id === journey.target);
    if (journey.target !== null && !target) {
      const replacement = sim.buildings.filter(b => accepts(sim, b, journey.item)).sort((a, b) => Math.abs(a.depth - car.depth) - Math.abs(b.depth - car.depth))[0];
      if (replacement) journey.target = replacement.id;
      else {
        if (!ageItem(sim, journey.item, surfaceDt * surfaceRate(sim, car.depth))) car.journey = { kind: 'idle' };
        continue;
      }
    }
    const travelAge = travel(sim, car, journey.target === null ? 0 : (sim.buildings.find(b => b.id === journey.target)?.depth ?? car.depth), surfaceDt);
    if (!ageItem(sim, journey.item, travelAge)) { car.journey = { kind: 'idle' }; continue; }
    const receiver = sim.buildings.find(b => b.id === journey.target);
    if (Math.abs(car.depth - (receiver?.depth ?? 0)) < 1e-6) {
      if (receiver) receiver.items.push(journey.item);
      else sim.delivered++;
      car.journey = { kind: 'idle' };
      car.cooldown = RULES.dispatch;
    }
  }
}

export function step(sim: Sim, dt: number): void {
  if (sim.paused || sim.result !== 'playing') return;
  const move = Math.max(-RULES.viewSpeed * dt, Math.min(RULES.viewSpeed * dt, sim.targetDepth - sim.viewDepth));
  const surfaceDt = dt * stretchAt(sim.field, sim.viewDepth + move / 2);
  sim.viewDepth = Math.abs(sim.targetDepth - sim.viewDepth) <= RULES.viewSpeed * dt + 1e-9 ? sim.targetDepth : sim.viewDepth + move;
  sim.localTime += dt;
  // Bound integration error even when watching from the deepest row.
  const slices = Math.max(1, Math.ceil(surfaceDt / 0.5));
  for (let slice = 0; slice < slices && sim.result === 'playing'; slice++) {
    const elapsed = Math.min(surfaceDt / slices, sim.level.deadline - sim.surfaceTime);
    sim.surfaceTime += elapsed;
    machines(sim, elapsed);
    handoffs(sim);
    lifts(sim, elapsed);
    if (sim.delivered >= sim.level.goal) sim.result = 'won';
    else if (sim.surfaceTime >= sim.level.deadline) sim.result = 'lost';
  }
}

export function accountedOre(sim: Sim): number {
  const stored = sim.buildings.reduce((sum, b) => sum + b.items.reduce((n, i) => n + (i.kind === 'ore' ? 1 : RULES.recipe), 0) + (b.kind === 'smelter' && b.work !== null ? RULES.recipe : 0), 0);
  const riding = sim.cars.reduce((sum, c) => sum + (c.journey.kind === 'loaded' ? (c.journey.item.kind === 'ore' ? 1 : RULES.recipe) : 0), 0);
  return stored + riding + sim.delivered * RULES.recipe + sim.expired + sim.scrapped + sim.anchorSpent;
}
