export enum TileType {
  AIR = 0,
  DIRT = 1,
  COAL = 2,
  IRON = 3,
}

export interface TileData {
  type: TileType;
  x: number;
  y: number;
}

export interface WorldConfig {
  width: number;
  height: number;
  tileSize: number;
  surfaceLevel: number;
}

export const TILE_COLORS: Record<TileType, number> = {
  [TileType.AIR]: 0x87ceeb, // Light blue sky
  [TileType.DIRT]: 0x8b4513, // Brown
  [TileType.COAL]: 0x2c2c2c, // Dark gray
  [TileType.IRON]: 0xb87333, // Rust orange
};

export const WORLD_CONFIG: WorldConfig = {
  width: 50, // tiles wide
  height: 200, // tiles deep
  tileSize: 32, // pixels per tile
  surfaceLevel: 5, // sky tiles before ground starts
};
