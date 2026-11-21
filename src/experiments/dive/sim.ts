import { stretchAt } from '../../core/field.ts';
import type { Field } from '../../core/field.ts';
import { createRng } from '../../core/rng.ts';

export type Mode = 'waves' | 'years';
export type Action = 'drill' | 'tank' | 'cargo' | 'battery' | 'generator' | 'shield' | 'repair' | 'anchor' | 'beacon';
export type Command = { move: -1 | 0 | 1; down: boolean; thrust: boolean; action?: Action; dismiss?: boolean };
export const IDLE: Command = { move: 0, down: false, thrust: false };
export const WIDTH = 32;
export const METRES = 2;
export const STEP = 1 / 60;
export const CALENDAR_SCALE = 60;
export const WAVE_INTERVAL = 90;
export const DRILL_SECONDS = 3.2;
export const HARDNESS_FACTOR = 1.65;
export const COAL_ENERGY = 32;
export const GENERATOR_RATE = 0.24;
export const COAL_PER_PERSON_DAY = 0.00008;
export const DEFAULT_FIELDS: Record<Mode, Field> = {
  waves: { law: 'exp', doublingMetres: 25, skyFloor: 0.25, depthCap: 256 },
  years: { law: 'exp', doublingMetres: 10, skyFloor: 0.25, depthCap: 131072 },
};
export const LAYER_NAMES = ['Topsoil', 'Clay', 'Stone', 'Basalt', 'Shale', 'Deep rock', 'Horizon', 'Gneiss', 'Obsidian', 'Ember', 'Cobalt', 'Mantle', 'Violet', 'Abyss', 'Relic', 'Night', 'Singularity'];
export const ORE_NAMES = ['Copper', 'Tin', 'Iron', 'Quartz', 'Silver', 'Voidstone', 'Ruby', 'Nickel', 'Glass', 'Emberite', 'Cobalt', 'Olivine', 'Amethyst', 'Pearl', 'Relic', 'Dark matter', 'Starstone'];
export const ROCK_COLORS = ['#594632', '#794c3b', '#525b66', '#373e58', '#4d5960', '#48435e', '#61475c', '#505e59', '#38444c', '#604643', '#3d5367', '#5a5b49', '#574465', '#384b58', '#535160', '#373342', '#4b364b'];
export const ORE_COLORS = ['#eda56b', '#b9d3cd', '#90b9d2', '#e7baf0', '#dddde5', '#9e8bfb', '#ff7f82', '#addbaa', '#83dddc', '#ffb868', '#7dabf6', '#cadb87', '#c99bea', '#e8dcaf', '#ffc772', '#aca0ff', '#ffdadb'];
export type Tile = { layer: number; ore: 'coal' | 'heart' | number | null; fleck: number };
export type Dive = { local: number; surface: number; depth: number; items: number; waves: number; damage: number; population: number; produced: number; coalUsed: number; research: string; towed: boolean };
type Expedition = { localStart: number; surfaceStart: number; depth: number; wavesStart: number; hpStart: number; popStart: number; producedStart: number; coalUsedStart: number };
export type Offer = { action: Action; label: string; layer: number; cost: number; duration: number; available: boolean; detail: string };
export type Research = { action: Action; label: string; remaining: number; total: number };
export type Sim = {
  mode: Mode; field: Field; seed: number; rows: number; layers: number; tiles: (Tile | null)[];
  player: { x: number; y: number; vx: number; vy: number; grounded: boolean; thrust: number; fuel: number; cargo: (number | 'coal' | 'heart')[] };
  local: number; surface: number; deepest: number; outcome: 'playing' | 'win' | 'loss'; reason: string;
  tier: number; tank: number; hold: number; battery: number; generator: number; shield: number; ores: number[]; coal: number;
  hp: number; energy: number; baseClock: number; wave: number; nextWave: number; anchor: boolean; anchorClock: number;
  population: number; research: Research | null; researchDone: string; beacon: boolean;
  produced: number; coalUsed: number;
  expedition: Expedition | null; dives: Dive[]; receipt: Dive | null; tows: number;
  drill: { index: number; progress: number; duration: number } | null;
  event: string; eventSerial: number; impact: number; mined: number; lastBreak: { x: number; y: number; layer: number } | null;
};

export function depth(s: Sim): number { return Math.max(0, s.player.y * METRES); }
export function layerAt(field: Field, metres: number): number {
  return Math.min(LAYER_NAMES.length - 1, Math.max(0, Math.floor(Math.log2(stretchAt(field, metres)))));
}
export function fuelCapacity(s: Sim): number { return 72 + s.tank * 48; }
export function cargoCapacity(s: Sim): number { return 10 + s.hold * 7; }
export function energyCapacity(s: Sim): number { return 110 + s.battery * 160; }
export function atBase(s: Sim): boolean { return s.player.y < 0; }
export function safeSeconds(s: Sim): number {
  return s.coal / Math.max(0.000001, s.population * COAL_PER_PERSON_DAY) * 86400 / CALENDAR_SCALE / stretchAt(s.field, depth(s));
}
export function createSim(mode: Mode, field: Field, seed = 417): Sim {
  const random = createRng(seed);
  const rows = mode === 'waves' ? 88 : 85;
  const layers = layerAt(field, (rows - 1) * METRES) + 1;
  const tiles: (Tile | null)[] = [];
  for (let y = 0; y < rows; y++) {
    const layer = layerAt(field, y * METRES);
    for (let x = 0; x < WIDTH; x++) {
      const roll = random();
      const coalChance = layer < 2 ? 0.32 : 0.06;
      const ore = mode === 'waves' && y === rows - 1 ? 'heart' : roll < coalChance ? 'coal' : roll < 0.84 ? layer : null;
      tiles.push({ layer, ore, fleck: Math.floor(random() * 4) });
    }
  }
  return {
    mode, field, seed, rows, layers, tiles,
    player: { x: 16.5, y: -0.31, vx: 0, vy: 0, grounded: true, thrust: 0, fuel: 72, cargo: [] },
    local: 0, surface: 0, deepest: 0, outcome: 'playing', reason: '',
    tier: 0, tank: 0, hold: 0, battery: 0, generator: 0, shield: 0, ores: Array.from({ length: LAYER_NAMES.length }, () => 0), coal: mode === 'waves' ? 12 : 4,
    hp: 100, energy: 110, baseClock: 0, wave: 0, nextWave: WAVE_INTERVAL, anchor: false, anchorClock: 0,
    population: 12, research: null, researchDone: '', beacon: false, produced: 0, coalUsed: 0,
    expedition: null, dives: [], receipt: null, tows: 0, drill: null,
    event: mode === 'waves' ? 'Generator online. Coal keeps the shield alive.' : 'Twelve settlers. Bring coal. Give them time.',
    eventSerial: 0, impact: 0, mined: 0, lastBreak: null,
  };
}
function announce(s: Sim, message: string): void { s.event = message; s.eventSerial++; }
export function tileAt(s: Sim, x: number, y: number): Tile | null {
  if (y < 0) return null;
  return s.tiles[y * WIDTH + x] ?? null;
}
function solid(s: Sim, x: number, y: number): boolean {
  if (x < 0 || x >= WIDTH || y >= s.rows) return true;
  return y >= 0 && tileAt(s, x, y) !== null;
}
function collision(s: Sim, x: number, y: number): boolean {
  return solid(s, Math.floor(x - 0.28), Math.floor(y - 0.29)) || solid(s, Math.floor(x + 0.28), Math.floor(y - 0.29)) || solid(s, Math.floor(x - 0.28), Math.floor(y + 0.29)) || solid(s, Math.floor(x + 0.28), Math.floor(y + 0.29));
}
export function offers(s: Sim): Offer[] {
  const result: Offer[] = [];
  const add = (action: Action, label: string, layer: number, cost: number, detail: string, duration = 0): void => {
    result.push({ action, label, layer, cost, detail, duration, available: atBase(s) && !s.research && s.ores[layer] >= cost });
  };
  if (s.tier < s.layers - 1) add('drill', `Drill ${s.tier + 2}`, s.tier, s.mode === 'waves' ? 12 : 4, 'Cuts the next band', s.mode === 'years' ? 18 * 2 ** s.tier : 0);
  if (s.tank < 3) add('tank', `Tank ${s.tank + 2}`, Math.min(s.tank, s.layers - 1), 4, '+48 seconds of fuel', s.mode === 'years' ? 25 * 2 ** s.tank : 0);
  if (s.hold < 2) add('cargo', `Cargo ${s.hold + 2}`, Math.min(s.hold, s.layers - 1), 4, '+7 cargo slots', s.mode === 'years' ? 25 * 2 ** s.hold : 0);
  if (s.mode === 'waves') {
    if (s.battery < 3) add('battery', `Battery ${s.battery + 2}`, Math.min(s.battery, s.layers - 1), 4, '+160 energy storage');
    if (s.generator < 3) add('generator', `Generator ${s.generator + 2}`, Math.min(s.generator, s.layers - 1), 4, '+65% charge speed');
    if (s.shield < 3) add('shield', `Shield ${s.shield + 2}`, Math.min(s.shield, s.layers - 1), 4, '+50% shield efficiency');
    if (s.hp < 100) add('repair', 'Repair +45 HP', 0, 2, 'Patch the base');
    if (!s.anchor) add('anchor', 'Build Anchor', Math.max(0, s.layers - 2), 4, 'Base clock /4. Uses 1 deep ore / 12 base min');
  } else if (!s.beacon) {
    add('beacon', 'Build Beacon', s.layers - 1, 6, 'Four years of research. Keep the colony warm.', 4 * 365 * 86400 / CALENDAR_SCALE);
  }
  return result;
}
function applyUpgrade(s: Sim, action: Action): void {
  switch (action) {
    case 'drill': s.tier++; break;
    case 'tank': s.tank++; break;
    case 'cargo': s.hold++; break;
    case 'battery': s.battery++; break;
    case 'generator': s.generator++; break;
    case 'shield': s.shield++; break;
    case 'repair': s.hp = Math.min(100, s.hp + 45); break;
    case 'anchor': s.anchor = true; break;
    case 'beacon': s.beacon = true; break;
  }
}
function purchase(s: Sim, action: Action): void {
  const offer = offers(s).find(item => item.action === action);
  if (!offer?.available) return;
  s.ores[offer.layer] -= offer.cost;
  if (offer.duration > 0) {
    s.research = { action, label: offer.label, remaining: offer.duration, total: offer.duration };
    announce(s, `${offer.label} queued. Go deep to give it time.`);
  } else {
    applyUpgrade(s, action);
    announce(s, `${offer.label} installed.`);
  }
}
function tickSurface(s: Sim, dt: number): void {
  const surfaceDt = dt * stretchAt(s.field, depth(s));
  s.surface += surfaceDt;
  if (s.mode === 'waves') {
    const baseDt = surfaceDt * (s.anchor && s.ores[Math.max(0, s.layers - 2)] > 0 ? 0.25 : 1);
    s.baseClock += baseDt;
    if (s.anchor) {
      s.anchorClock += baseDt;
      while (s.anchorClock >= 720) {
        s.anchorClock -= 720;
        const layer = Math.max(0, s.layers - 2);
        if (s.ores[layer] >= 1) { s.ores[layer]--; announce(s, 'Anchor consumed 1 Voidstone. The bubble holds.'); }
        else announce(s, 'Anchor has no upkeep ore. Surface clock restored.');
      }
    }
    const charge = Math.min(baseDt * (GENERATOR_RATE * 1.65 ** s.generator), s.coal * COAL_ENERGY, energyCapacity(s) - s.energy);
    s.coal -= charge / COAL_ENERGY;
    s.coalUsed += charge / COAL_ENERGY;
    s.produced += charge;
    s.energy += charge;
    while (s.baseClock >= s.nextWave && s.outcome === 'playing') {
      s.wave++;
      s.nextWave += WAVE_INTERVAL;
      const strength = 13 + s.wave * 0.65;
      const efficiency = 1 + s.shield * 0.5;
      const absorbed = Math.min(strength, s.energy * efficiency);
      s.energy -= absorbed / efficiency;
      const damage = strength - absorbed;
      s.hp = Math.max(0, s.hp - damage);
      s.impact++;
      announce(s, damage > 0.1 ? `Wave ${s.wave}: ${Math.ceil(damage)} damage. Bring coal home.` : `Wave ${s.wave}: shield held. ${Math.round(s.energy)} energy left.`);
      if (s.hp === 0) { s.outcome = 'loss'; s.reason = 'The base fell while your watch barely moved.'; }
    }
  } else {
    const days = surfaceDt * CALENDAR_SCALE / 86400;
    const needed = s.population * COAL_PER_PERSON_DAY * days;
    const warm = Math.min(1, s.coal / Math.max(0.00000001, needed));
    s.coalUsed += Math.min(s.coal, needed);
    if (s.coal > 0 && needed >= s.coal) announce(s, 'The last coal is gone. The houses are going dark.');
    s.coal = Math.max(0, s.coal - needed);
    s.population = Math.min(60, Math.max(0, s.population + days * (warm > 0.99 ? 0.035 : -0.22)));
    if (s.research && warm > 0.99) {
      s.research.remaining -= surfaceDt;
      if (s.research.remaining <= 0) {
        const done = s.research;
        s.research = null;
        s.researchDone = done.label;
        applyUpgrade(s, done.action);
        announce(s, `${done.label} complete. Colony population ${Math.floor(s.population)}.`);
      }
    }
    if (s.population <= 0) { s.outcome = 'loss'; s.reason = 'No lights remain. The colony ran out of coal.'; }
  }
}
function dock(s: Sim, towed: boolean): void {
  const trip = s.expedition;
  if (!trip) return;
  const cargo = s.player.cargo;
  if (!towed) for (const ore of cargo) {
    if (ore === 'coal') s.coal += 1;
    else if (ore === 'heart') { s.outcome = 'win'; s.reason = 'The Heart is home. Time belongs to you again.'; }
    else s.ores[ore]++;
  }
  const receipt: Dive = { local: s.local - trip.localStart, surface: s.surface - trip.surfaceStart, depth: trip.depth, items: towed ? 0 : cargo.length, waves: s.wave - trip.wavesStart, damage: trip.hpStart - s.hp, population: s.population - trip.popStart, produced: s.produced - trip.producedStart, coalUsed: s.coalUsed - trip.coalUsedStart, research: s.researchDone, towed };
  s.researchDone = '';
  s.dives.push(receipt);
  s.receipt = receipt;
  s.player.cargo = [];
  s.player.fuel = fuelCapacity(s);
  s.player.y = -0.31; s.player.vx = 0; s.player.vy = 0;
  s.expedition = null;
  if (s.mode === 'years' && s.beacon && !towed) { s.outcome = 'win'; s.reason = 'The Beacon is lit. They kept a place for you.'; }
  if (towed) { s.tows++; s.coal = Math.max(0, s.coal - 2); announce(s, 'Towed home. Cargo lost. Two coal paid to the rescue crew.'); }
}

export function step(s: Sim, command: Command, dt = STEP): void {
  if (s.outcome !== 'playing') return;
  if (s.receipt) { if (command.dismiss) s.receipt = null; return; }
  if (command.action) purchase(s, command.action);
  const p = s.player;
  s.local += dt;
  const oldDepth = depth(s);
  if (!s.expedition && oldDepth > 0.25) {
    s.expedition = { localStart: s.local, surfaceStart: s.surface, depth: oldDepth, wavesStart: s.wave, hpStart: s.hp, popStart: s.population, producedStart: s.produced, coalUsedStart: s.coalUsed };
  }
  tickSurface(s, dt);
  s.deepest = Math.max(s.deepest, oldDepth);
  if (s.expedition) s.expedition.depth = Math.max(s.expedition.depth, oldDepth);
  if (s.outcome !== 'playing') return;
  p.grounded = collision(s, p.x, p.y + 0.025) || (!s.expedition && atBase(s) && p.y >= -0.32 && !command.down);
  p.thrust = command.thrust ? Math.min(1, p.thrust + dt * 7) : Math.max(0, p.thrust - dt * 10);
  p.vy = Math.max(-4.8, Math.min(6.5, p.vy + (18 - p.thrust * 38) * dt));
  const accel = p.grounded ? 28 : 13;
  p.vx += command.move * accel * dt;
  p.vx *= Math.exp(-(command.move === 0 ? (p.grounded ? 16 : 4) : 4) * dt);
  p.vx = Math.max(-3.8, Math.min(3.8, p.vx));
  if (command.down && !command.move && p.grounded) p.vx += (Math.floor(p.x) + 0.5 - p.x) * dt * 50;
  let target = -1;
  if (p.grounded && !command.thrust) {
    const tx = command.down ? Math.floor(p.x) : Math.floor(p.x + command.move * 0.65);
    const ty = command.down ? Math.floor(p.y + 0.4) : Math.floor(p.y);
    if ((command.down || command.move !== 0) && tx >= 0 && tx < WIDTH && ty >= 0 && ty < s.rows && tileAt(s, tx, ty)) target = ty * WIDTH + tx;
  }
  if (target >= 0) {
    const tile = s.tiles[target];
    if (tile) {
      const duration = DRILL_SECONDS * HARDNESS_FACTOR ** (tile.layer - s.tier);
      if (s.drill?.index !== target) s.drill = { index: target, progress: 0, duration };
      s.drill.progress += dt;
      if (s.drill.progress >= duration) {
        s.tiles[target] = null;
        if (tile.ore !== null && p.cargo.length < cargoCapacity(s)) p.cargo.push(tile.ore);
        else if (tile.ore !== null) announce(s, 'Cargo full. Ore left behind. Return to unload.');
        s.mined++;
        s.lastBreak = { x: target % WIDTH + 0.5, y: Math.floor(target / WIDTH) + 0.5, layer: tile.layer };
        s.drill = null;
        if (command.down) p.vy = 2.2;
        else p.vx = command.move * 2.4;
      }
    }
  } else s.drill = null;
  const burn = command.thrust ? 1.25 : target >= 0 ? 1 : command.move ? 0.5 : 0;
  if (!atBase(s)) p.fuel = Math.max(0, p.fuel - burn * dt);
  const nx = Math.max(0.3, Math.min(WIDTH - 0.3, p.x + p.vx * dt));
  if (!collision(s, nx, p.y)) p.x = nx; else p.vx = 0;
  const ny = Math.max(-3, p.y + p.vy * dt);
  if (!s.expedition && atBase(s) && !command.down && ny > -0.31) { p.y = -0.31; p.vy = 0; }
  else if (!collision(s, p.x, ny)) p.y = ny;
  else p.vy = 0;
  if (s.expedition && p.y < -0.32) dock(s, false);
  if (p.fuel <= 0 && s.expedition) {
    p.x = 16.5; p.y = -0.5; p.vx = 0; p.vy = 0;
    dock(s, true);
  }
  if (atBase(s) && !s.expedition) p.fuel = fuelCapacity(s);
}
