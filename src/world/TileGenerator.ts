import { TileType, WORLD_CONFIG } from "../types/index.ts";
import type { TileData, WorldConfig } from "../types/index.ts";

export class TileGenerator {
  private config: WorldConfig;
  private tiles: TileType[][];

  constructor(config: WorldConfig = WORLD_CONFIG) {
    this.config = config;
    this.tiles = [];
    this.generate();
  }

  private generate(): void {
    for (let y = 0; y < this.config.height; y++) {
      this.tiles[y] = [];
      for (let x = 0; x < this.config.width; x++) {
        this.tiles[y][x] = this.getTileTypeForPosition(x, y);
      }
    }
  }

  private getTileTypeForPosition(_x: number, y: number): TileType {
    // Above surface = air
    if (y < this.config.surfaceLevel) {
      return TileType.AIR;
    }

    // Calculate depth below surface
    const depth = y - this.config.surfaceLevel;

    // Ore probabilities increase with depth
    const coalChance = Math.min(0.15, 0.05 + depth * 0.002);
    const ironChance = Math.min(0.1, 0.01 + depth * 0.0015);

    const roll = Math.random();

    // Iron is rarer but more valuable
    if (roll < ironChance) {
      return TileType.IRON;
    }

    // Coal is more common
    if (roll < ironChance + coalChance) {
      return TileType.COAL;
    }

    // Default to dirt
    return TileType.DIRT;
  }

  getTile(x: number, y: number): TileType {
    if (y < 0 || y >= this.config.height || x < 0 || x >= this.config.width) {
      return TileType.AIR;
    }
    return this.tiles[y][x];
  }

  setTile(x: number, y: number, type: TileType): void {
    if (y >= 0 && y < this.config.height && x >= 0 && x < this.config.width) {
      this.tiles[y][x] = type;
    }
  }

  getAllTiles(): TileData[] {
    const result: TileData[] = [];
    for (let y = 0; y < this.config.height; y++) {
      for (let x = 0; x < this.config.width; x++) {
        result.push({
          type: this.tiles[y][x],
          x,
          y,
        });
      }
    }
    return result;
  }

  getConfig(): WorldConfig {
    return this.config;
  }
}
