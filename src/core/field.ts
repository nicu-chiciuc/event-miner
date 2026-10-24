/**
 * The time field shared by every experiment.
 *
 * Depth is in metres: positive below the surface, negative above it.
 * `stretchAt(field, depth)` is how many surface seconds pass during one local second at that
 * depth. Deep places run slow, so the stretch grows with depth. Above ground it falls below 1.
 */
export type Law = "exp" | "linear" | "step";

export type Field = {
  law: Law;
  /** Depth over which the stretch doubles: exactly for exp and step, at the first doubling for linear. */
  doublingMetres: number;
  /** Lowest stretch, reached high above ground. 0.25 means a sky clock runs at most 4 times the surface rate. */
  skyFloor: number;
  /** Highest stretch, reached at the horizon. */
  depthCap: number;
};

const LAWS: readonly Law[] = ["exp", "linear", "step"];

export function stretchAt(field: Field, depth: number): number {
  const doublings = depth / field.doublingMetres;
  let raw: number;
  switch (field.law) {
    case "exp":
      raw = 2 ** doublings;
      break;
    case "step":
      raw = 2 ** Math.trunc(doublings);
      break;
    case "linear":
      raw = doublings >= 0 ? 1 + doublings : 1 / (1 - doublings);
      break;
    default:
      field.law satisfies never;
      raw = 1;
  }
  return Math.min(field.depthCap, Math.max(field.skyFloor, raw));
}

/** Local seconds that pass at `targetDepth` during one second of an observer at `observerDepth`. */
export function rateBetween(field: Field, observerDepth: number, targetDepth: number): number {
  return stretchAt(field, observerDepth) / stretchAt(field, targetDepth);
}

/** Reads `?law=exp|linear|step`, `?double=<metres>`, `?cap=<stretch>` and `?sky=<stretch>` over the defaults. */
export function fieldFromQuery(search: URLSearchParams, defaults: Field): Field {
  const law = LAWS.find((candidate) => candidate === search.get("law")) ?? defaults.law;
  return {
    law,
    doublingMetres: positiveParam(search, "double") ?? defaults.doublingMetres,
    depthCap: positiveParam(search, "cap") ?? defaults.depthCap,
    skyFloor: positiveParam(search, "sky") ?? defaults.skyFloor,
  };
}

function positiveParam(search: URLSearchParams, name: string): number | undefined {
  const value = Number(search.get(name));
  return search.has(name) && Number.isFinite(value) && value > 0 ? value : undefined;
}
