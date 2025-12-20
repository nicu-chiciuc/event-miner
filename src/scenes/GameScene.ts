import { Scene, GameObjects, Physics } from "phaser";
import { TileGenerator } from "../world/TileGenerator.ts";
import { Player } from "../entities/Player.ts";
import { TileType, WORLD_CONFIG, TILE_COLORS } from "../types/index.ts";

export class GameScene extends Scene {
  private tileGenerator!: TileGenerator;
  private player!: Player;
  private tileSprites: Map<string, GameObjects.Sprite> = new Map();
  private tileGroup!: Physics.Arcade.StaticGroup;

  // UI elements
  private inventoryText!: GameObjects.Text;
  private fuelBarBg!: GameObjects.Rectangle;
  private fuelBarFill!: GameObjects.Rectangle;
  private inventory = { coal: 0, iron: 0 };

  constructor() {
    super({ key: "GameScene" });
  }

  create(): void {
    // Set world bounds based on tile world size
    const worldWidth = WORLD_CONFIG.width * WORLD_CONFIG.tileSize;
    const worldHeight = WORLD_CONFIG.height * WORLD_CONFIG.tileSize;
    this.physics.world.setBounds(0, 0, worldWidth, worldHeight);

    // Set background color (sky blue)
    this.cameras.main.setBackgroundColor(TILE_COLORS[TileType.AIR]);

    // Generate the world
    this.tileGenerator = new TileGenerator();

    // Create static group for collision tiles
    this.tileGroup = this.physics.add.staticGroup();

    // Render all tiles
    this.renderTiles();

    // Create player at surface level
    const playerStartX = (WORLD_CONFIG.width / 2) * WORLD_CONFIG.tileSize;
    const playerStartY =
      (WORLD_CONFIG.surfaceLevel - 1) * WORLD_CONFIG.tileSize;
    this.player = new Player(
      this,
      playerStartX,
      playerStartY,
      this.tileGenerator
    );

    // Set up collision between player and tiles
    this.physics.add.collider(this.player.getSprite(), this.tileGroup);

    // Set up mining callback
    this.player.setTileMinedCallback(this.onTileMined.bind(this));

    // Camera follows player
    this.cameras.main.startFollow(this.player.getSprite(), true, 0.1, 0.1);
    this.cameras.main.setZoom(1);
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);

    // Create UI (fixed to camera)
    this.createUI();
  }

  private renderTiles(): void {
    const tiles = this.tileGenerator.getAllTiles();
    const tileSize = WORLD_CONFIG.tileSize;

    for (const tile of tiles) {
      // Skip air tiles for performance (background handles sky)
      if (tile.type === TileType.AIR) continue;

      const x = tile.x * tileSize + tileSize / 2;
      const y = tile.y * tileSize + tileSize / 2;
      const key = `tile_${tile.type}`;
      const posKey = `${tile.x},${tile.y}`;

      const sprite = this.tileGroup.create(x, y, key) as Physics.Arcade.Sprite;
      sprite.setImmovable(true);
      sprite.refreshBody();

      this.tileSprites.set(posKey, sprite);
    }
  }

  private onTileMined(x: number, y: number, type: TileType): void {
    const posKey = `${x},${y}`;
    const sprite = this.tileSprites.get(posKey);

    if (sprite) {
      // Remove from physics group and destroy
      this.tileGroup.remove(sprite, true, true);
      this.tileSprites.delete(posKey);

      // Add to inventory if it's an ore
      if (type === TileType.COAL) {
        this.inventory.coal++;
        this.updateInventoryUI();
        this.showMineEffect(x, y, 0x2c2c2c);
      } else if (type === TileType.IRON) {
        this.inventory.iron++;
        this.updateInventoryUI();
        this.showMineEffect(x, y, 0xb87333);
      } else {
        this.showMineEffect(x, y, 0x8b4513);
      }
    }
  }

  private showMineEffect(tileX: number, tileY: number, color: number): void {
    const tileSize = WORLD_CONFIG.tileSize;
    const x = tileX * tileSize + tileSize / 2;
    const y = tileY * tileSize + tileSize / 2;

    // Create particle effect
    const particles = this.add.particles(x, y, undefined, {
      speed: { min: 50, max: 150 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.4, end: 0 },
      lifespan: 300,
      quantity: 8,
      emitting: false,
    });

    // Create a small rectangle texture for particles
    const graphics = this.add.graphics();
    graphics.fillStyle(color, 1);
    graphics.fillRect(0, 0, 6, 6);
    graphics.generateTexture("particle_" + color, 6, 6);
    graphics.destroy();

    particles.setTexture("particle_" + color);
    particles.explode(8);

    // Clean up after animation
    this.time.delayedCall(500, () => {
      particles.destroy();
    });
  }

  private createUI(): void {
    // Create inventory display
    this.inventoryText = this.add.text(16, 16, "", {
      fontSize: "18px",
      color: "#ffffff",
      backgroundColor: "#000000aa",
      padding: { x: 12, y: 8 },
    });
    this.inventoryText.setScrollFactor(0); // Fixed to camera
    this.inventoryText.setDepth(100);

    this.updateInventoryUI();

    // Create fuel bar
    const fuelBarWidth = 150;
    const fuelBarHeight = 16;
    const fuelBarX = 16;
    const fuelBarY = 56;

    // Fuel label
    const fuelLabel = this.add.text(fuelBarX, fuelBarY - 2, "FUEL", {
      fontSize: "12px",
      color: "#ffffff",
    });
    fuelLabel.setScrollFactor(0);
    fuelLabel.setDepth(100);

    // Background bar
    this.fuelBarBg = this.add.rectangle(
      fuelBarX + 40,
      fuelBarY + 6,
      fuelBarWidth,
      fuelBarHeight,
      0x333333
    );
    this.fuelBarBg.setOrigin(0, 0.5);
    this.fuelBarBg.setScrollFactor(0);
    this.fuelBarBg.setDepth(100);

    // Fill bar
    this.fuelBarFill = this.add.rectangle(
      fuelBarX + 42,
      fuelBarY + 6,
      fuelBarWidth - 4,
      fuelBarHeight - 4,
      0x00ff00
    );
    this.fuelBarFill.setOrigin(0, 0.5);
    this.fuelBarFill.setScrollFactor(0);
    this.fuelBarFill.setDepth(101);

    // Add controls help text
    const helpText = this.add.text(
      16,
      85,
      "WASD/Arrows: Move & Mine\nUp/W: Fly (uses fuel)",
      {
        fontSize: "14px",
        color: "#ffffff",
        backgroundColor: "#000000aa",
        padding: { x: 12, y: 8 },
      }
    );
    helpText.setScrollFactor(0);
    helpText.setDepth(100);
  }

  private updateInventoryUI(): void {
    this.inventoryText.setText(
      `Coal: ${this.inventory.coal}  |  Iron: ${this.inventory.iron}`
    );
  }

  update(time: number, delta: number): void {
    this.player.update(time, delta);
    this.updateFuelBar();
  }

  private updateFuelBar(): void {
    const fuelPercent = this.player.getFuel() / this.player.getMaxFuel();
    const maxWidth = 146; // fuelBarWidth - 4
    this.fuelBarFill.width = maxWidth * fuelPercent;

    // Change color based on fuel level
    if (fuelPercent > 0.5) {
      this.fuelBarFill.fillColor = 0x00ff00; // Green
    } else if (fuelPercent > 0.25) {
      this.fuelBarFill.fillColor = 0xffff00; // Yellow
    } else {
      this.fuelBarFill.fillColor = 0xff0000; // Red
    }
  }
}
