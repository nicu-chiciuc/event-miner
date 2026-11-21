import type { Field } from '../../core/field.ts';

export const DEFAULT_FIELD: Field = { law: 'exp', doublingMetres: 20, depthCap: 512, skyFloor: 0.25 };
export const DEPTHS = [-20, 0, 20, 40, 60, 80, 100, 120, 140, 160] as const;
export const KINDS = ['drill', 'smelter', 'generator', 'lift', 'vault', 'anchor'] as const;
export type Kind = typeof KINDS[number];
export type Placement = { kind: Kind; depth: number; bay: number; mode?: 4 | 0.25 };
export type Level = {
  name: string;
  intro: string;
  hint: string;
  seam: number;
  goal: number;
  deadline: number;
  early: number;
  budget: number;
  par: number;
  cars: number;
  speed: number;
  volatile: boolean;
  power: boolean;
  anchors: boolean;
  view: number;
  good: Placement[];
};

export const LEVELS: readonly Level[] = [
  {
    name: 'Ratio',
    intro: 'One deep seam. Three ore make one ingot, but a furnace takes twelve of its own seconds.',
    hint: 'A furnace higher up can keep pace with the deep drill. The lift is generous here.',
    seam: 80, goal: 28, deadline: 2100, early: 1700, budget: 5, par: 3,
    cars: 6, speed: 80, volatile: false, power: false, anchors: false, view: 60,
    good: [{ kind: 'smelter', depth: 0, bay: 0 }, { kind: 'drill', depth: 80, bay: 0 }],
  },
  {
    name: 'Power',
    intro: 'The shore supply is gone. A generator makes power on its own clock; a furnace spends it on its clock.',
    hint: 'Keep the generator above the furnace, within 90 m. Higher fuel burns faster, too.',
    seam: 80, goal: 24, deadline: 2600, early: 1900, budget: 6, par: 4,
    cars: 6, speed: 80, volatile: false, power: true, anchors: false, view: 60,
    good: [{ kind: 'generator', depth: 0, bay: 0 }, { kind: 'smelter', depth: 40, bay: 0 }, { kind: 'drill', depth: 80, bay: 0 }],
  },
  {
    name: 'Lift',
    intro: 'Two slow cars serve a deeper seam. An ingot occupies one car, just like a single piece of ore.',
    hint: 'Smelting at the seam cuts three long ore journeys to one ingot journey.',
    seam: 100, goal: 9, deadline: 5200, early: 4400, budget: 6, par: 4,
    cars: 2, speed: 5, volatile: false, power: true, anchors: false, view: 80,
    good: [{ kind: 'generator', depth: 20, bay: 0 }, { kind: 'drill', depth: 100, bay: 0 }, { kind: 'smelter', depth: 100, bay: 1 }],
  },
  {
    name: 'Volatile',
    intro: 'Raw ore survives about eight local seconds. Smelting stabilizes it; a deep vault buys surface time.',
    hint: 'The raw climb takes ten local seconds. Smelt at the seam before the ore rots.',
    seam: 80, goal: 16, deadline: 4500, early: 3700, budget: 6, par: 4,
    cars: 2, speed: 8, volatile: true, power: true, anchors: false, view: 80,
    good: [{ kind: 'generator', depth: 0, bay: 0 }, { kind: 'drill', depth: 80, bay: 0 }, { kind: 'smelter', depth: 80, bay: 1 }],
  },
  {
    name: 'Anchor',
    intro: 'The last seam is painfully slow. An anchor bends every clock within 22 m, but eats one ore per six local seconds.',
    hint: 'A fast bubble can cover both drill and furnace. Keep its ore supply alive.',
    seam: 120, goal: 16, deadline: 5100, early: 4300, budget: 7, par: 5,
    cars: 2, speed: 8, volatile: true, power: true, anchors: true, view: 80,
    good: [{ kind: 'generator', depth: 40, bay: 0 }, { kind: 'drill', depth: 120, bay: 0 }, { kind: 'smelter', depth: 120, bay: 1 }, { kind: 'anchor', depth: 120, bay: 2, mode: 4 }],
  },
];
