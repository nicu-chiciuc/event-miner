import { Scene } from "phaser";
import { TileType, TILE_COLORS, WORLD_CONFIG } from "../types/index.ts";

export class BootScene extends Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload(): void {
    // Create loading text
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    const loadingText = this.add.text(width / 2, height / 2, "Loading...", {
      fontSize: "32px",
      color: "#ffffff",
    });
    loadingText.setOrigin(0.5);
  }

  create(): void {
    // Generate tile textures programmatically
    this.createTileTextures();

    // Create player texture
    this.createPlayerTexture();

    // Create refinery texture
    this.createRefineryTexture();

    // Start the game scene
    this.scene.start("GameScene");
  }

  private createTileTextures(): void {
    const size = WORLD_CONFIG.tileSize;

    // Create texture for each tile type
    for (const [typeStr, color] of Object.entries(TILE_COLORS)) {
      const type = parseInt(typeStr) as TileType;
      const key = `tile_${type}`;

      const graphics = this.add.graphics();
      graphics.fillStyle(color, 1);
      graphics.fillRect(0, 0, size, size);

      // Add some visual variety with darker edges
      if (type !== TileType.AIR) {
        graphics.fillStyle(0x000000, 0.2);
        graphics.fillRect(0, 0, size, 2); // Top edge
        graphics.fillRect(0, 0, 2, size); // Left edge
        graphics.fillStyle(0x000000, 0.3);
        graphics.fillRect(size - 2, 0, 2, size); // Right edge
        graphics.fillRect(0, size - 2, size, 2); // Bottom edge

        // Add texture detail for coal
        if (type === TileType.COAL) {
          graphics.fillStyle(0x1a1a1a, 1);
          this.addOreSpeckles(graphics, size, 4);
        }
      }

      graphics.generateTexture(key, size, size);
      graphics.destroy();
    }
  }

  private addOreSpeckles(
    graphics: Phaser.GameObjects.Graphics,
    size: number,
    count: number
  ): void {
    for (let i = 0; i < count; i++) {
      const x = 4 + Math.random() * (size - 8);
      const y = 4 + Math.random() * (size - 8);
      const radius = 2 + Math.random() * 3;
      graphics.fillCircle(x, y, radius);
    }
  }

  private createPlayerTexture(): void {
    const graphics = this.add.graphics();

    // Player body (mining vehicle) - smaller than tile for easy navigation
    graphics.fillStyle(0xffd700, 1); // Gold color
    graphics.fillRoundedRect(12, 10, 24, 16, 4);

    // Drill bit
    graphics.fillStyle(0x808080, 1); // Gray
    graphics.fillTriangle(24, 26, 16, 38, 32, 38);

    // Cabin window
    graphics.fillStyle(0x4169e1, 1); // Royal blue
    graphics.fillRect(18, 12, 12, 8);

    // Wheels/tracks
    graphics.fillStyle(0x333333, 1);
    graphics.fillCircle(17, 28, 5);
    graphics.fillCircle(31, 28, 5);

    graphics.generateTexture("player", 48, 48);
    graphics.destroy();
  }

  private createRefineryTexture(): void {
    const graphics = this.add.graphics();
    const width = 96;
    const height = 80;

    // Main building body
    graphics.fillStyle(0x5a4a3a, 1); // Dark brown
    graphics.fillRect(8, 30, 80, 50);

    // Building front face highlight
    graphics.fillStyle(0x6b5b4b, 1);
    graphics.fillRect(12, 34, 72, 42);

    // Roof
    graphics.fillStyle(0x4a3a2a, 1);
    graphics.fillRect(4, 24, 88, 10);

    // Chimney
    graphics.fillStyle(0x3a3a3a, 1);
    graphics.fillRect(60, 0, 20, 30);
    graphics.fillStyle(0x4a4a4a, 1);
    graphics.fillRect(62, 2, 16, 26);

    // Chimney top
    graphics.fillStyle(0x2a2a2a, 1);
    graphics.fillRect(58, 0, 24, 6);

    // Furnace opening (glowing)
    graphics.fillStyle(0xff6600, 1);
    graphics.fillRect(20, 50, 24, 20);
    graphics.fillStyle(0xff9933, 1);
    graphics.fillRect(24, 54, 16, 12);

    // Fuel tank / output container
    graphics.fillStyle(0x336633, 1);
    graphics.fillRect(54, 45, 28, 28);
    graphics.fillStyle(0x448844, 1);
    graphics.fillRect(58, 49, 20, 20);

    // Tank gauge
    graphics.fillStyle(0x88ff88, 1);
    graphics.fillRect(64, 55, 8, 10);

    // Door
    graphics.fillStyle(0x3a2a1a, 1);
    graphics.fillRect(36, 55, 14, 22);

    // Window
    graphics.fillStyle(0x87ceeb, 0.7);
    graphics.fillRect(14, 38, 12, 10);

    // Ground base
    graphics.fillStyle(0x2a2a2a, 1);
    graphics.fillRect(0, 76, 96, 4);

    graphics.generateTexture("refinery", width, height);
    graphics.destroy();
  }
}
