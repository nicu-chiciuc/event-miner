import { Scene } from 'phaser';
import { TileType, TILE_COLORS, WORLD_CONFIG } from '../types/index.ts';

export class BootScene extends Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // Create loading text
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;
    
    const loadingText = this.add.text(width / 2, height / 2, 'Loading...', {
      fontSize: '32px',
      color: '#ffffff',
    });
    loadingText.setOrigin(0.5);
  }

  create(): void {
    // Generate tile textures programmatically
    this.createTileTextures();
    
    // Create player texture
    this.createPlayerTexture();

    // Start the game scene
    this.scene.start('GameScene');
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
        graphics.fillRect(0, 0, size, 2);           // Top edge
        graphics.fillRect(0, 0, 2, size);           // Left edge
        graphics.fillStyle(0x000000, 0.3);
        graphics.fillRect(size - 2, 0, 2, size);    // Right edge
        graphics.fillRect(0, size - 2, size, 2);    // Bottom edge

        // Add texture detail for ores
        if (type === TileType.COAL) {
          graphics.fillStyle(0x1a1a1a, 1);
          this.addOreSpeckles(graphics, size, 4);
        } else if (type === TileType.IRON) {
          graphics.fillStyle(0xd4943a, 1);
          this.addOreSpeckles(graphics, size, 5);
        }
      }

      graphics.generateTexture(key, size, size);
      graphics.destroy();
    }
  }

  private addOreSpeckles(graphics: Phaser.GameObjects.Graphics, size: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const x = 4 + Math.random() * (size - 8);
      const y = 4 + Math.random() * (size - 8);
      const radius = 2 + Math.random() * 3;
      graphics.fillCircle(x, y, radius);
    }
  }

  private createPlayerTexture(): void {
    const graphics = this.add.graphics();
    
    // Player body (mining vehicle)
    graphics.fillStyle(0xffd700, 1); // Gold color
    graphics.fillRoundedRect(4, 8, 24, 16, 4);
    
    // Drill bit
    graphics.fillStyle(0x808080, 1); // Gray
    graphics.fillTriangle(16, 24, 10, 32, 22, 32);
    
    // Cabin window
    graphics.fillStyle(0x4169e1, 1); // Royal blue
    graphics.fillRect(12, 10, 8, 6);
    
    // Wheels/tracks
    graphics.fillStyle(0x333333, 1);
    graphics.fillCircle(10, 24, 4);
    graphics.fillCircle(22, 24, 4);

    graphics.generateTexture('player', 32, 36);
    graphics.destroy();
  }
}

