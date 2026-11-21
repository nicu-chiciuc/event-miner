import { rateBetween, stretchAt } from "../../core/field.ts";
import type { Field } from "../../core/field.ts";
import { createRng } from "../../core/rng.ts";

export const WIDTH = 240;
export const HEIGHT = 800;
export const SURFACE = 48;
export const METRES_PER_CELL = 0.5;
export const STEP = 1 / 60;
export const RATE_CAP = 8;
export const CHUNK = 32;
export const CHUNKS_X = Math.ceil(WIDTH / CHUNK);
export const CHUNKS_Y = Math.ceil(HEIGHT / CHUNK);
export const TARGET = 20;
export const DEFAULT_FIELD: Field = { law: "exp", doublingMetres: 47, depthCap: 512, skyFloor: 0.25 };
export const MATERIAL = { air: 0, dirt: 1, rock: 2, sand: 3, water: 4, steam: 5, lava: 6, crystal: 7, grass: 8 } as const;
export type Material = typeof MATERIAL[keyof typeof MATERIAL];
export type Command = { move: number; aimX: number; aimY: number; thrust: boolean; drill: boolean };
export const IDLE: Command = { move: 0, aimX: 0, aimY: 1, thrust: false, drill: false };
export const TUNING = { acceleration: 125, drag: 7, gravity: 52, thrust: 168, riseSpeed: 48, fallSpeed: 36, fuelBurn: 10, fuelRegen: 28, drillRadius: 4.4, drillPeriod: 0.065 } as const;

export function depthAt(y: number): number { return (y - SURFACE) * METRES_PER_CELL; }

export class SandSim {
  readonly field: Field;
  readonly cells = new Uint8Array(WIDTH * HEIGHT);
  readonly life = new Uint16Array(WIDTH * HEIGHT);
  readonly moved = new Uint32Array(WIDTH * HEIGHT);
  readonly materialClock = new Uint32Array(WIDTH * HEIGHT);
  readonly credit = new Float64Array(WIDTH * HEIGHT);
  readonly dirty = new Uint32Array(CHUNKS_X * CHUNKS_Y);
  readonly awake = new Uint8Array(HEIGHT * CHUNKS_X);
  readonly rowClock = new Float64Array(HEIGHT);
  readonly rowRate = new Float64Array(HEIGHT);
  readonly rowTicks = new Uint32Array(HEIGHT);
  readonly plants = new Uint8Array(WIDTH);
  readonly player = { x: 120, y: SURFACE - 5, vx: 0, vy: 0, aimX: 0, aimY: 1, fuel: 100, hull: 100, crystals: 0, grounded: false, thrusting: false };
  readonly random: () => number;
  status: "playing" | "won" | "lost" = "playing";
  ticks = 0;
  phase = 0;
  localTime = 0;
  surfaceTime = 0;
  maxDepth = 0;
  rainEvents = 0;
  grassGrown = 0;
  waterDepth = 0;
  drilled = 0;
  impact = 0;
  raining = false;
  drillCooldown = 0;
  weatherClock = 0;
  growthClock = 0;
  leftSurface = false;
  returnCount = 0;
  private readonly inverseStretch = new Float64Array(HEIGHT);

  constructor(field: Field, seed = 713) {
    this.field = { ...field };
    this.random = createRng(seed);
    for (let y = 0; y < HEIGHT; y++) this.inverseStretch[y] = rateBetween(field, 0, depthAt(y)) / stretchAt(field, 0);
    this.generate();
  }

  private generate(): void {
    const m = MATERIAL;
    for (let y = SURFACE; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const wobble = Math.sin(x * 0.09) * 3;
        this.cells[y * WIDTH + x] = y < SURFACE + 48 + wobble ? m.dirt : m.rock;
        if (y < SURFACE + 2 && x % 3 !== 0) this.cells[y * WIDTH + x] = m.grass;
      }
    }
    for (let y = SURFACE; y < HEIGHT - 8; y++) {
      const center = 120 + Math.sin(y * 0.018) * 7;
      const half = 7 + Math.sin(y * 0.035) * 2;
      for (let x = Math.floor(center - half); x <= center + half; x++) {
        this.cells[y * WIDTH + x] = y % 110 < 4 ? m.sand : m.air;
      }
    }
    for (let cave = 0; cave < 25; cave++) {
      const cy = 100 + cave * 27;
      const cx = cave % 3 === 0 ? 120 : 35 + Math.floor(this.random() * 170);
      const rx = 19 + Math.floor(this.random() * 21);
      const ry = 12 + Math.floor(this.random() * 13);
      for (let y = cy - ry; y <= cy + ry; y++) {
        for (let x = Math.max(2, cx - rx); x <= Math.min(WIDTH - 3, cx + rx); x++) {
          if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1) continue;
          let material: Material = m.air;
          if (y > cy + ry * 0.35) material = cave % 3 === 0 ? m.water : m.sand;
          if (cy > 650 && y > cy + 3 && cave % 2 === 0) material = m.lava;
          this.cells[y * WIDTH + x] = material;
        }
      }
    }
    // A visible spill above the first cave gives the gradient something to carry.
    for (let y = 76; y < 92; y++) for (let x = 90; x < 118; x++) this.cells[y * WIDTH + x] = m.sand;
    for (let y = 160; y < 177; y++) for (let x = 125; x < 151; x++) this.cells[y * WIDTH + x] = m.water;
    for (let seam = 0; seam < 18; seam++) {
      const cy = 460 + Math.floor(seam / 3) * 49;
      const cx = seam % 3 === 0 ? 120 : seam % 3 === 1 ? 88 : 157;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) + Math.abs(dy) <= 1) this.cells[(cy + dy) * WIDTH + cx + dx] = m.crystal;
      }
    }
    for (let x = 0; x < WIDTH; x++) this.plants[x] = x % 11 === 0 ? 3 : 0;
    this.awake.fill(8);
    this.dirty.fill(1);
  }

  cell(x: number, y: number): number {
    if (x < 0 || x >= WIDTH || y >= HEIGHT) return MATERIAL.rock;
    if (y < 0) return MATERIAL.air;
    return this.cells[Math.floor(y) * WIDTH + Math.floor(x)];
  }

  setCell(x: number, y: number, material: Material, life = 0): void {
    if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
    const i = y * WIDTH + x;
    this.cells[i] = material;
    this.life[i] = life;
    this.materialClock[i] = this.phase;
    this.credit[i] = 0;
    this.touch(x, y);
  }

  private touch(x: number, y: number): void {
    this.dirty[Math.floor(y / CHUNK) * CHUNKS_X + Math.floor(x / CHUNK)]++;
    const left = Math.floor(Math.max(0, x - 1) / CHUNK);
    const right = Math.floor(Math.min(WIDTH - 1, x + 1) / CHUNK);
    for (let yy = Math.max(0, y - 1); yy <= Math.min(HEIGHT - 1, y + 1); yy++) {
      for (let c = left; c <= right; c++) this.awake[yy * CHUNKS_X + c] = 8;
    }
  }

  private moveCell(i: number, j: number, x: number, y: number, nx: number, ny: number): void {
    const material = this.cells[i];
    this.cells[i] = this.cells[j];
    this.cells[j] = material;
    const age = this.life[i];
    this.life[i] = this.life[j];
    this.life[j] = age;
    const credit = this.credit[i];
    this.credit[i] = this.credit[j];
    this.credit[j] = credit;
    const clock = this.materialClock[i];
    this.materialClock[i] = this.materialClock[j];
    this.materialClock[j] = clock;
    this.moved[i] = this.phase;
    this.moved[j] = this.phase;
    this.touch(x, y);
    this.touch(nx, ny);
    if (material === MATERIAL.water && this.life[j] === 1) this.waterDepth = Math.max(this.waterDepth, depthAt(ny));
  }

  private tryMove(x: number, y: number, nx: number, ny: number, material: number): boolean {
    if (nx < 1 || nx >= WIDTH - 1 || ny < 1 || ny >= HEIGHT - 5) return false;
    const j = ny * WIDTH + nx;
    const target = this.cells[j];
    const m = MATERIAL;
    if (target === m.air || target === m.steam && material !== m.steam || material === m.sand && target === m.water) {
      this.moveCell(y * WIDTH + x, j, x, y, nx, ny);
      return true;
    }
    return false;
  }

  private updateRow(y: number): void {
    this.rowTicks[y]++;
    const m = MATERIAL;
    const reverse = (this.rowTicks[y] + y) % 2 === 0;
    for (let c = 0; c < CHUNKS_X; c++) {
      const chunk = y * CHUNKS_X + c;
      if (this.awake[chunk] === 0) continue;
      this.awake[chunk]--;
      const start = c * CHUNK;
      const end = Math.min(WIDTH, start + CHUNK);
      for (let offset = 0; offset < end - start; offset++) {
        const x = reverse ? end - 1 - offset : start + offset;
        const i = y * WIDTH + x;
        const material = this.cells[i];
        if (material < m.sand || material > m.lava || this.moved[i] === this.phase) continue;
        // Carry local-time credit with the material across row boundaries.
        // Otherwise a falling grain can surf the rows' staggered update phases.
        this.credit[i] = Math.min(RATE_CAP, this.credit[i] + (this.phase - this.materialClock[i]) * Math.min(RATE_CAP, this.rowRate[y]) / RATE_CAP);
        this.materialClock[i] = this.phase;
        if (this.credit[i] + 1e-9 < 1) { this.awake[chunk] = 8; continue; }
        this.credit[i] = Math.max(0, this.credit[i] - 1);
        const direction = (x + y + this.rowTicks[y]) % 2 === 0 ? 1 : -1;
        if (material === m.steam) {
          if (this.life[i] <= 1) { this.setCell(x, y, m.air); continue; }
          this.life[i]--;
          this.awake[chunk] = 8;
          this.tryMove(x, y, x, y - 1, material) || this.tryMove(x, y, x + direction, y - 1, material) || this.tryMove(x, y, x + direction, y, material);
          continue;
        }
        if (material === m.lava) {
          let cooled = false;
          for (let side = 0; side < 4; side++) {
            const nx = x + (side === 0 ? -1 : side === 1 ? 1 : 0);
            const ny = y + (side === 2 ? -1 : side === 3 ? 1 : 0);
            if (this.cell(nx, ny) !== m.water) continue;
            this.setCell(nx, ny, m.steam, 150);
            this.setCell(x, y, m.rock);
            cooled = true;
            break;
          }
          if (cooled || this.rowTicks[y] % 4 !== 0) continue;
        }
        if (this.tryMove(x, y, x, y + 1, material)) continue;
        if (this.tryMove(x, y, x + direction, y + 1, material)) continue;
        if (this.tryMove(x, y, x - direction, y + 1, material)) continue;
        if (material === m.water || material === m.lava) {
          this.tryMove(x, y, x + direction, y, material) || this.tryMove(x, y, x - direction, y, material);
        }
      }
    }
  }

  stepMaterials(observerDepth: number): void {
    const stretch = stretchAt(this.field, observerDepth);
    for (let y = 0; y < HEIGHT; y++) this.rowRate[y] = stretch * this.inverseStretch[y];
    // Eight evenly spaced phases avoid turning adjacent rows into different frame rates.
    // A moved cell is stamped so crossing a row cannot update it twice in one phase.
    for (let sub = 0; sub < RATE_CAP; sub++) {
      this.phase++;
      for (let y = HEIGHT - 6; y >= 1; y--) {
        this.rowClock[y] += Math.min(RATE_CAP, this.rowRate[y]) / RATE_CAP;
        if (this.rowClock[y] + 1e-10 < 1) continue;
        this.rowClock[y] = Math.max(0, this.rowClock[y] - 1);
        this.updateRow(y);
      }
    }
  }

  private weather(surfaceDelta: number): void {
    const previous = this.surfaceTime;
    this.surfaceTime += surfaceDelta;
    const previousStorm = Math.floor((previous + 13) / 42);
    const storm = Math.floor((this.surfaceTime + 13) / 42);
    this.rainEvents += storm - previousStorm;
    this.raining = (this.surfaceTime + 13) % 42 < 15;
    this.weatherClock += Math.min(surfaceDelta, STEP * RATE_CAP);
    while (this.weatherClock >= 1 / 30) {
      this.weatherClock -= 1 / 30;
      if (!this.raining) continue;
      for (let drop = 0; drop < 3; drop++) {
        const x = 30 + Math.floor(this.random() * 180);
        if (this.cell(x, 12) === MATERIAL.air) this.setCell(x, 12, MATERIAL.water, 1);
      }
    }
    this.growthClock += surfaceDelta;
    while (this.growthClock >= 0.8) {
      this.growthClock -= 0.8;
      const x = Math.floor(this.random() * WIDTH);
      if (this.cell(x, SURFACE) !== MATERIAL.grass || this.plants[x] >= 13) continue;
      this.plants[x]++;
      this.grassGrown++;
    }
  }

  private collides(x: number, y: number): boolean {
    for (let yy = Math.floor(y - 2); yy <= Math.floor(y + 2); yy++) {
      for (let xx = Math.floor(x - 2.2); xx <= Math.floor(x + 2.2); xx++) {
        const m = this.cell(xx, yy);
        if (m === MATERIAL.dirt || m === MATERIAL.rock || m === MATERIAL.sand || m === MATERIAL.crystal || m === MATERIAL.grass) return true;
      }
    }
    return false;
  }

  private drill(): void {
    const p = this.player;
    const cx = p.x + p.aimX * 3.4;
    const cy = p.y + p.aimY * 3.4;
    for (let y = Math.max(SURFACE, Math.floor(cy - TUNING.drillRadius)); y <= Math.min(HEIGHT - 6, cy + TUNING.drillRadius); y++) {
      for (let x = Math.max(1, Math.floor(cx - TUNING.drillRadius)); x <= Math.min(WIDTH - 2, cx + TUNING.drillRadius); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 > TUNING.drillRadius ** 2) continue;
        const material = this.cell(x, y);
        if (material === MATERIAL.air || material === MATERIAL.water || material === MATERIAL.steam || material === MATERIAL.lava) continue;
        if (material === MATERIAL.crystal) p.crystals++;
        this.setCell(x, y, MATERIAL.air);
        this.drilled++;
        this.impact = Math.max(this.impact, material === MATERIAL.crystal ? 1 : 0.35);
        // Loose chips land behind the cutter, outside the vehicle's collision box.
        if ((material === MATERIAL.dirt || material === MATERIAL.rock) && this.random() < 0.12) {
          const dx = Math.floor(p.x + (this.random() < 0.5 ? -5 : 5));
          const dy = Math.floor(p.y - 1);
          if (this.cell(dx, dy) === MATERIAL.air) this.setCell(dx, dy, MATERIAL.sand);
        }
      }
    }
  }

  step(command: Command): void {
    if (this.status !== "playing") return;
    const p = this.player;
    this.ticks++;
    this.localTime += STEP;
    this.impact *= 0.85;
    const aimLength = Math.hypot(command.aimX, command.aimY);
    if (aimLength > 0.01) { p.aimX = command.aimX / aimLength; p.aimY = command.aimY / aimLength; }
    this.drillCooldown -= STEP;
    if (command.drill && this.drillCooldown <= 0) { this.drill(); this.drillCooldown = TUNING.drillPeriod; }
    p.thrusting = command.thrust && p.fuel > 0.5;
    p.fuel = Math.max(0, Math.min(100, p.fuel + (p.thrusting ? -TUNING.fuelBurn : command.thrust ? 0 : TUNING.fuelRegen) * STEP));
    const inWater = this.cell(Math.floor(p.x), Math.floor(p.y)) === MATERIAL.water;
    p.vx += (Math.max(-1, Math.min(1, command.move)) * TUNING.acceleration - p.vx * TUNING.drag) * STEP;
    p.vy += (TUNING.gravity - (p.thrusting ? TUNING.thrust : 0)) * STEP;
    if (inWater) p.vy *= 0.97;
    p.vy = Math.max(-TUNING.riseSpeed, Math.min(TUNING.fallSpeed, p.vy));
    const moves = Math.ceil(Math.max(Math.abs(p.vx), Math.abs(p.vy)) * STEP / 0.4);
    p.grounded = false;
    for (let part = 0; part < moves; part++) {
      const nx = Math.max(3, Math.min(WIDTH - 4, p.x + p.vx * STEP / moves));
      if (!this.collides(nx, p.y)) p.x = nx;
      else p.vx = 0;
      const ny = Math.max(4, Math.min(HEIGHT - 8, p.y + p.vy * STEP / moves));
      if (!this.collides(p.x, ny)) p.y = ny;
      else { if (p.vy > 0) p.grounded = true; this.impact = Math.max(this.impact, Math.abs(p.vy) / 80); p.vy = 0; }
    }
    let hot = false;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      if (this.cell(Math.floor(p.x) + dx, Math.floor(p.y) + dy) === MATERIAL.lava) hot = true;
    }
    p.hull = Math.max(0, Math.min(100, p.hull + (hot ? -24 : 5) * STEP));
    const depth = Math.max(0, depthAt(p.y));
    this.maxDepth = Math.max(this.maxDepth, depth);
    if (depth > 12) this.leftSurface = true;
    if (this.leftSurface && p.y < SURFACE - 2) {
      this.returnCount++;
      this.leftSurface = false;
      if (p.crystals >= TARGET) this.status = "won";
    }
    if (p.hull <= 0) this.status = "lost";
    this.weather(STEP * stretchAt(this.field, depthAt(p.y)));
    this.stepMaterials(depthAt(p.y));
  }

  worldHash(): string {
    let hash = 2166136261;
    for (let i = 0; i < this.cells.length; i++) hash = Math.imul(hash ^ this.cells[i] ^ this.life[i], 16777619);
    for (const value of [this.ticks, this.player.x * 1000, this.player.y * 1000, this.player.crystals, this.surfaceTime * 1000]) hash = Math.imul(hash ^ Math.floor(value), 16777619);
    return (hash >>> 0).toString(16).padStart(8, "0");
  }
}
