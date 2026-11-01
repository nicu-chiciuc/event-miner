import { stretchAt } from '../../core/field.ts';
import { formatStretch } from '../../core/format.ts';
import { DEPTHS } from './levels.ts';
import type { Kind } from './levels.ts';
import { RULES, bubbleAt } from './sim.ts';
import type { Building, Sim } from './sim.ts';

export const COLORS: Record<Kind, string> = {
  drill: '#eab47b', smelter: '#ed8568', generator: '#e7cc75',
  lift: '#84bbc4', vault: '#9ec5a0', anchor: '#bfa1dd',
};
const SPRITES: Record<Kind, readonly string[]> = {
  drill: ['..####..', '.######.', '..####..', '...##...', '..####..', '...##...', '...##...', '....#...'],
  smelter: ['.#....#.', '.######.', '.#....#.', '.#.##.#.', '.#.##.#.', '.######.', '.######.', '.#....#.'],
  generator: ['...##...', '..##....', '.#####..', '....##..', '...##...', '..##....', '.######.', '.#....#.'],
  lift: ['.######.', '.#....#.', '.#....#.', '.#....#.', '.#....#.', '.######.', '...##...', '..####..'],
  vault: ['.######.', '.#....#.', '.#.##.#.', '.#.##.#.', '.#....#.', '.######.', '..#..#..', '........'],
  anchor: ['...##...', '...##...', '.######.', '...##...', '#..##..#', '.######.', '..####..', '...##...'],
};
export type Layout = { left: number; right: number; top: number; bottom: number; row: number; ruler: number; slots: number; bay: number; rail: number; mobile: boolean };
export type Focus = { depth: number; bay: number };
export type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };

export function layout(width: number, top: number, bottom: number): Layout {
  const mobile = width < 760;
  const left = mobile ? 10 : Math.max(30, (width - 1100) / 2);
  const right = mobile ? width - 10 : width - Math.max(30, (width - 1100) / 2) - 330;
  const ruler = left + (mobile ? 64 : 104);
  const slots = ruler + (mobile ? 25 : 64);
  const bay = Math.floor(Math.min(mobile ? 58 : 92, (right - slots - 65) / 3));
  return { left, right, top: top + 22, bottom: bottom - 25, row: (bottom - top - 47) / 10, ruler, slots, bay, rail: slots + bay * 3 + 24, mobile };
}

export function yAt(board: Layout, depth: number): number {
  return board.top + board.row * ((depth + 20) / 20 + 0.5);
}

export function hitSlot(board: Layout, x: number, y: number): Focus | null {
  const row = Math.floor((y - board.top) / board.row);
  const bay = Math.floor((x - board.slots) / board.bay);
  const depth = DEPTHS[row];
  return depth !== undefined && bay >= 0 && bay < 3 ? { depth, bay } : null;
}

export function rulerDepth(board: Layout, y: number): number {
  return Math.max(-20, Math.min(160, ((y - board.top) / board.row - 0.5) * 20));
}

function progress(building: Building): number {
  if (building.construction > 0) return 1 - building.construction / RULES.buildTime;
  switch (building.kind) {
    case 'drill': return building.progress / RULES.drillCycle;
    case 'smelter': return building.work === null ? 0 : 1 - building.work / RULES.smeltCycle;
    case 'generator': return building.coal / 240;
    case 'anchor': return Math.min(1, building.charge / RULES.anchorCharge);
    case 'vault': return building.items.length / 30;
    case 'lift': return 0;
  }
}

export function paint(ctx: CanvasRenderingContext2D, sim: Sim, board: Layout, focus: Focus, selected: Kind, watch: number, particles: Particle[], shake: number): void {
  const width = ctx.canvas.clientWidth;
  const height = ctx.canvas.clientHeight;
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  const text = (value: string, x: number, y: number, color = '#91a7b7', size = 11, align: CanvasTextAlign = 'left') => {
    ctx.fillStyle = color;
    ctx.font = `${size}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.textAlign = align;
    ctx.fillText(value, Math.round(x), Math.round(y));
  };
  ctx.clearRect(0, 0, width, height);
  rect(0, 0, width, height, '#111e2a');
  ctx.save();
  ctx.translate(Math.round(Math.sin(sim.localTime * 81) * shake), 0);
  const bands = ['#233645', '#343c3c', '#293a41', '#25343f', '#243442', '#253241', '#252e3c', '#262d3b', '#272b39', '#2b2c3c'];
  for (let row = 0; row < DEPTHS.length; row++) {
    const depth = DEPTHS[row];
    const y = yAt(board, depth);
    rect(board.left, y - board.row / 2, board.right - board.left, board.row, bands[row]);
    for (let speck = 0; speck < 10; speck++) {
      const x = board.left + ((row * 71 + speck * 109) % Math.floor(board.right - board.left));
      rect(x, y + ((speck * 7) % 15) - 8, 3, 2, '#3b4550');
    }
    if (depth === sim.level.seam) {
      rect(board.ruler + 8, y - board.row / 2 + 2, board.right - board.ruler - 12, board.row - 4, '#514334');
      for (let i = 0; i < 12; i++) rect(board.ruler + 14 + i * (board.right - board.ruler - 30) / 12, y - board.row / 2 + 5 + i % 3 * 2, 4, 3, sim.level.volatile ? '#bfa1dd' : '#d49d67');
    }
    const nearby = Math.abs(sim.viewDepth - depth) <= RULES.buildReach;
    text(`${depth}m`, board.ruler - 10, y - 2, nearby ? '#eaf4ee' : '#a3b6c2', 11, 'right');
    text(formatStretch(stretchAt(sim.field, depth)), board.ruler - 10, y + 12, '#8fa6b8', 10, 'right');
    rect(board.ruler, y, 8, 1, '#8fa6b8');
    for (let bay = 0; bay < 3; bay++) {
      const x = board.slots + bay * board.bay;
      const w = board.bay - 6;
      const h = Math.min(39, board.row - 9);
      const b = sim.buildings.find(b => b.depth === depth && b.bay === bay);
      const focused = focus.depth === depth && focus.bay === bay;
      const color = b ? COLORS[b.kind] : COLORS[selected];
      rect(x, y - h / 2, w, h, nearby ? '#172b38' : '#1c2a36');
      const edge = focused ? color : nearby ? '#596b70' : '#344654';
      rect(x, y - h / 2, w, 1, edge);
      rect(x, y + h / 2 - 1, w, 1, edge);
      rect(x, y - h / 2, 1, h, edge);
      rect(x + w - 1, y - h / 2, 1, h, edge);
      if (!b) {
        text(nearby ? '+' : '·', x + w / 2, y + 5, nearby ? '#a6b9bd' : '#63798c', 18, 'center');
        continue;
      }
      const sprite = SPRITES[b.kind];
      const iconX = x + (board.mobile ? 6 : 12);
      for (let py = 0; py < sprite.length; py++) {
        for (let px = 0; px < sprite[py].length; px++) {
          if (sprite[py][px] === '#') rect(iconX + px * 2, y - 10 + py * 2, 2, 2, b.construction > 0 ? '#647b89' : color);
        }
      }
      if (b.items.length) text(String(b.items.length), x + w - 7, y + 3, '#dbe4df', 10, 'right');
      else if (!board.mobile) text(b.kind.slice(0, 3).toUpperCase(), x + 35, y + 1, color, 9);
      if (b.kind === 'smelter' && b.work !== null && b.power < 0.95) text('!', x + w - 7, y - 5, '#f38c71', 12, 'right');
      if (b.kind === 'anchor') text(b.mode === 4 ? '4' : '¼', x + w - 6, y + 1, color, 11, 'right');
      rect(x + 4, y + h / 2 - 5, w - 8, 2, '#394853');
      rect(x + 4, y + h / 2 - 5, (w - 8) * Math.min(1, progress(b)), 2, color);
    }
  }
  rect(board.ruler + 2, board.top, 1, board.bottom - board.top, '#637c8a');
  rect(board.left, yAt(board, 0) - board.row / 2, board.right - board.left, 2, '#b59a6b');
  text('DEPTH / RATE', board.left, board.top - 9, '#93abb8', 10);
  text('BUILD BAYS', board.slots, board.top - 9, '#93abb8', 10);
  text('LIFT', board.rail, board.top - 9, '#93abb8', 10, 'center');
  rect(board.rail - 8, yAt(board, 0) - 10, 2, board.bottom - yAt(board, 0), '#586879');
  rect(board.rail + 8, yAt(board, 0) - 10, 2, board.bottom - yAt(board, 0), '#586879');
  rect(board.rail - 17, yAt(board, 0) - 18, 36, 7, '#84bbc4');
  if (!board.mobile && board.right - board.rail > 180) {
    text('SURFACE DOCK', board.rail + 35, yAt(board, 0) - 5, '#9bcac8', 11);
    text(`${sim.delivered} / ${sim.level.goal} INGOTS`, board.rail + 35, yAt(board, 0) + 11, '#89a6b6', 10);
    text(sim.level.volatile ? 'VOLATILE ORE' : 'ORE SEAM', board.rail + 35, yAt(board, sim.level.seam) - 4, sim.level.volatile ? '#bfa1dd' : '#eab47b', 11);
    text('1 ore / local second', board.rail + 35, yAt(board, sim.level.seam) + 12, '#b9a58d', 10);
    text('Drag the ruler to visit.', board.rail + 35, yAt(board, 140), '#8194a4', 10);
    text('Deeper = faster surface.', board.rail + 35, yAt(board, 140) + 16, '#8194a4', 10);
  }
  for (let i = 0; i < sim.cars.length; i++) {
    const car = sim.cars[i];
    const y = yAt(board, car.depth);
    const x = board.rail - 5 + (i % 3 - 1) * 5;
    rect(x - 2, y - 6, 11, 12, '#152733');
    rect(x - 2, y + 5, 11, 2, '#91a9b5');
    rect(x - 2, y - 6, 1, 11, '#91a9b5');
    rect(x + 8, y - 6, 1, 11, '#91a9b5');
    if (car.journey.kind === 'loaded') rect(x + 1, y - 3, 5, 6, car.journey.item.kind === 'ingot' ? '#8ddcc9' : (sim.level.volatile ? '#bfa1dd' : '#eab47b'));
  }
  for (const anchor of sim.buildings) {
    if (anchor.kind !== 'anchor' || bubbleAt(sim, anchor.depth) === 1) continue;
    const from = Math.max(board.top, yAt(board, anchor.depth - RULES.anchorRadius));
    const to = Math.min(board.bottom, yAt(board, anchor.depth + RULES.anchorRadius));
    rect(board.slots - 4, from, board.bay * 3, 2, '#bfa1dd');
    rect(board.slots - 4, to, board.bay * 3, 2, '#bfa1dd');
    text(anchor.mode === 4 ? 'FAST x4' : 'SLOW x1/4', board.slots, from - 4, '#c7addf', 10);
  }
  const watchY = yAt(board, watch);
  rect(board.left, watchY - board.row / 2 + 1, 3, board.row - 2, '#91dacb');
  rect(board.ruler - 3, watchY - 4, 9, 9, '#91dacb');
  text('HORIZON BELOW', board.right, board.bottom + 18, '#8d849d', 10, 'right');
  text(sim.level.volatile ? '◆ VOLATILE SEAM' : '◆ ORE SEAM', board.left, board.bottom + 18, sim.level.volatile ? '#bfa1dd' : '#d7aa7b', 10);
  for (const particle of particles) rect(particle.x, particle.y, 3, 3, particle.color);
  ctx.restore();
}
