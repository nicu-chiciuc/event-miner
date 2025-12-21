import { Scene, GameObjects, Physics } from "phaser";
import { TileGenerator } from "../world/TileGenerator.ts";
import { Player } from "../entities/Player.ts";
import { Refinery } from "../entities/Refinery.ts";
import { TileType, WORLD_CONFIG } from "../types/index.ts";

export class GameScene extends Scene {
  private tileGenerator!: TileGenerator;
  private player!: Player;
  private refinery!: Refinery;
  private tileSprites: Map<string, GameObjects.Sprite> = new Map();
  private tileGroup!: Physics.Arcade.StaticGroup;

  // Time dilation settings
  private readonly DILATION_RATE = 0.1; // 10% per tile deeper

  // UI elements
  private inventoryText!: GameObjects.Text;
  private fuelBarBg!: GameObjects.Rectangle;
  private fuelBarFill!: GameObjects.Rectangle;
  private refineryUI!: GameObjects.Container;
  private refineryStatusText!: GameObjects.Text;
  private refineryPromptText!: GameObjects.Text;
  private dilationText!: GameObjects.Text;
  private uiCamera!: Phaser.Cameras.Scene2D.Camera;
  private uiElements: GameObjects.GameObject[] = [];

  // Parallax background elements
  private parallaxElements: GameObjects.GameObject[] = [];

  constructor() {
    super({ key: "GameScene" });
  }

  create(): void {
    // Set world bounds based on tile world size
    const worldWidth = WORLD_CONFIG.width * WORLD_CONFIG.tileSize;
    const worldHeight = WORLD_CONFIG.height * WORLD_CONFIG.tileSize;
    this.physics.world.setBounds(0, 0, worldWidth, worldHeight);

    // Set alien sky gradient background
    this.cameras.main.setBackgroundColor(0x1a0a2a);

    // Create parallax background layers
    this.createParallaxBackground(worldWidth);

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

    // Set up interact callback
    this.player.setInteractCallback(this.onPlayerInteract.bind(this));

    // Create refinery on surface (to the right of player start)
    this.refinery = new Refinery(this, Math.floor(WORLD_CONFIG.width / 2) + 3);

    // Camera follows player
    this.cameras.main.startFollow(this.player.getSprite(), true, 0.1, 0.1);
    this.cameras.main.setZoom(0.5);
    // Extend camera bounds upward to allow viewing when flying high
    const skyHeight = 400;
    this.cameras.main.setBounds(
      0,
      -skyHeight,
      worldWidth,
      worldHeight + skyHeight
    );

    // Create a separate UI camera that doesn't zoom
    this.uiCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.uiCamera.setScroll(0, 0);

    // Create UI (fixed to camera)
    this.createUI();

    // Make main camera ignore UI elements, and UI camera ignore everything else
    this.cameras.main.ignore(this.uiElements);
    this.uiCamera.ignore(this.tileGroup.getChildren());
    this.uiCamera.ignore(this.player.getSprite());
    this.uiCamera.ignore(this.refinery.getGameObjects());
    this.uiCamera.ignore(this.parallaxElements);
  }

  private createParallaxBackground(worldWidth: number): void {
    const surfaceY = WORLD_CONFIG.surfaceLevel * WORLD_CONFIG.tileSize;

    // Layer 1: Far mountains (slowest - 10% scroll)
    this.createMountainLayer(
      worldWidth,
      surfaceY + 20,
      0x2a1a3a, // Dark purple
      0.1,
      -10,
      [0.4, 0.7, 0.5, 0.85, 0.6, 0.9, 0.45, 0.75, 0.55, 0.8]
    );

    // Layer 2: Mid mountains (25% scroll)
    this.createMountainLayer(
      worldWidth,
      surfaceY + 30,
      0x3d2852, // Medium purple
      0.25,
      -9,
      [0.5, 0.85, 0.65, 0.95, 0.55, 0.8, 0.7, 0.9]
    );

    // Layer 3: Near mountains (40% scroll)
    this.createMountainLayer(
      worldWidth,
      surfaceY + 40,
      0x4f3666, // Lighter purple
      0.4,
      -8,
      [0.6, 0.95, 0.75, 1.0, 0.7, 0.9, 0.8]
    );

    // Add an alien sun in the sky
    const sun = this.add.circle(worldWidth * 0.75, -80, 50, 0xff6644, 0.9);
    sun.setScrollFactor(0.05);
    sun.setDepth(-11);
    this.parallaxElements.push(sun);

    // Sun glow
    const sunGlow = this.add.circle(worldWidth * 0.75, -80, 90, 0xff4422, 0.3);
    sunGlow.setScrollFactor(0.05);
    sunGlow.setDepth(-12);
    this.parallaxElements.push(sunGlow);
  }

  private createMountainLayer(
    worldWidth: number,
    baseY: number,
    color: number,
    scrollFactor: number,
    depth: number,
    peaks: number[]
  ): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(color, 1);

    const totalWidth = worldWidth * 2;
    const startX = -worldWidth * 0.5;
    const segmentWidth = totalWidth / (peaks.length - 1);
    const maxHeight = 180;

    graphics.beginPath();
    graphics.moveTo(startX, baseY + 300);

    for (let i = 0; i < peaks.length; i++) {
      const x = startX + i * segmentWidth;
      const peakY = baseY - peaks[i] * maxHeight;
      graphics.lineTo(x, peakY);
    }

    graphics.lineTo(startX + totalWidth, baseY + 300);
    graphics.closePath();
    graphics.fill();

    graphics.setScrollFactor(scrollFactor);
    graphics.setDepth(depth);
    this.parallaxElements.push(graphics);
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

      // Add to player's inventory if it's coal
      if (type === TileType.COAL) {
        this.player.addCoal();
        this.updateInventoryUI();
        this.showMineEffect(x, y, 0x2c2c2c);
      } else {
        this.showMineEffect(x, y, 0x8b4513);
      }
    }
  }

  private onPlayerInteract(): void {
    const pos = this.player.getPosition();

    // Check if near refinery
    if (this.refinery.isPlayerInRange(pos.x, pos.y)) {
      const accumulatedFuel = this.refinery.getAccumulatedFuel();

      // If refinery has fuel ready, collect it
      if (accumulatedFuel > 0) {
        const collected = this.refinery.collectFuel();
        this.player.addFuel(collected);
        this.showCollectEffect("+", collected.toString(), "FUEL", 0x00ff00);
      }
      // If player has coal, deposit it
      else if (this.player.hasCoal()) {
        const deposited = this.player.depositAllCoal();
        this.refinery.depositCoal(deposited);
        this.updateInventoryUI();
        this.showCollectEffect("-", deposited.toString(), "COAL", 0xffaa00);
      }
    }
  }

  private showCollectEffect(
    prefix: string,
    amount: string,
    label: string,
    color: number
  ): void {
    const pos = this.player.getPosition();
    const text = this.add.text(
      pos.x,
      pos.y - 40,
      `${prefix}${amount} ${label}`,
      {
        fontSize: "16px",
        color: "#" + color.toString(16).padStart(6, "0"),
        fontStyle: "bold",
      }
    );
    text.setOrigin(0.5);
    text.setDepth(200);

    this.tweens.add({
      targets: text,
      y: pos.y - 80,
      alpha: 0,
      duration: 1000,
      ease: "Power2",
      onComplete: () => text.destroy(),
    });
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
    this.inventoryText.setDepth(100);
    this.uiElements.push(this.inventoryText);

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
    fuelLabel.setDepth(100);
    this.uiElements.push(fuelLabel);

    // Background bar
    this.fuelBarBg = this.add.rectangle(
      fuelBarX + 40,
      fuelBarY + 6,
      fuelBarWidth,
      fuelBarHeight,
      0x333333
    );
    this.fuelBarBg.setOrigin(0, 0.5);
    this.fuelBarBg.setDepth(100);
    this.uiElements.push(this.fuelBarBg);

    // Fill bar
    this.fuelBarFill = this.add.rectangle(
      fuelBarX + 42,
      fuelBarY + 6,
      fuelBarWidth - 4,
      fuelBarHeight - 4,
      0x00ff00
    );
    this.fuelBarFill.setOrigin(0, 0.5);
    this.fuelBarFill.setDepth(101);
    this.uiElements.push(this.fuelBarFill);

    // Add controls help text
    const helpText = this.add.text(
      16,
      85,
      "WASD/Arrows: Move & Mine\nUp/W: Fly | E: Interact",
      {
        fontSize: "14px",
        color: "#ffffff",
        backgroundColor: "#000000aa",
        padding: { x: 12, y: 8 },
      }
    );
    helpText.setDepth(100);
    this.uiElements.push(helpText);

    // Time dilation display
    this.dilationText = this.add.text(16, 145, "Time: x1.0", {
      fontSize: "16px",
      color: "#00ffff",
      backgroundColor: "#000000aa",
      padding: { x: 12, y: 8 },
      fontStyle: "bold",
    });
    this.dilationText.setDepth(100);
    this.uiElements.push(this.dilationText);

    // Create refinery UI (hidden by default)
    this.createRefineryUI();
  }

  private createRefineryUI(): void {
    this.refineryUI = this.add.container(0, 0);
    this.refineryUI.setDepth(100);
    this.refineryUI.setVisible(false);
    this.uiElements.push(this.refineryUI);

    // Background - positioned at bottom center
    const bg = this.add.rectangle(400, 500, 450, 160, 0x000000, 0.9);
    bg.setStrokeStyle(3, 0x888888);

    // Status text - top of the panel
    this.refineryStatusText = this.add.text(190, 435, "", {
      fontSize: "18px",
      color: "#ffffff",
      lineSpacing: 8,
    });

    // Prompt text - bottom of the panel
    this.refineryPromptText = this.add.text(400, 560, "", {
      fontSize: "20px",
      color: "#ffff00",
      fontStyle: "bold",
    });
    this.refineryPromptText.setOrigin(0.5);

    this.refineryUI.add([bg, this.refineryStatusText, this.refineryPromptText]);
  }

  private updateInventoryUI(): void {
    const coal = this.player.getCoal();
    this.inventoryText.setText(`Coal: ${coal}`);
  }

  update(time: number, delta: number): void {
    this.player.update(time, delta);

    // Apply time dilation to refinery - runs slower from player's perspective when deep
    const dilation = this.getTimeDilation();
    this.refinery.update(delta / dilation);

    this.updateFuelBar();
    this.updateRefineryUI();
    this.updateDilationUI(dilation);
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

  private updateDilationUI(dilation: number): void {
    this.dilationText.setText(`Time: x${dilation.toFixed(2)}`);

    // Color based on dilation direction and intensity
    if (dilation < 0.8) {
      this.dilationText.setColor("#4444ff"); // Blue when far above surface (time slowed)
    } else if (dilation < 1.0) {
      this.dilationText.setColor("#44aaff"); // Light blue when above surface
    } else if (dilation < 2) {
      this.dilationText.setColor("#00ffff"); // Cyan at low dilation
    } else if (dilation < 5) {
      this.dilationText.setColor("#ff00ff"); // Magenta at medium
    } else {
      this.dilationText.setColor("#ff4444"); // Red at high dilation
    }
  }

  private updateRefineryUI(): void {
    const pos = this.player.getPosition();
    const inRange = this.refinery.isPlayerInRange(pos.x, pos.y);

    this.refineryUI.setVisible(inRange);

    if (inRange) {
      const queue = this.refinery.getQueueCount();
      const progress = this.refinery.getCurrentProgress();
      const fuel = this.refinery.getAccumulatedFuel();
      const playerCoal = this.player.getCoal();

      // Build status text
      let status = "=== REFINERY ===\n";
      status += `Queue: ${queue} Coal\n`;

      if (progress !== null) {
        const progressBar = this.makeProgressBar(progress);
        status += `Processing: ${progressBar}`;
      } else {
        status += "Processing: Idle";
      }

      status += `\nFuel Ready: ${Math.floor(fuel)}`;

      this.refineryStatusText.setText(status);

      // Build prompt text
      if (fuel > 0) {
        this.refineryPromptText.setText(`[E] Collect ${Math.floor(fuel)} Fuel`);
        this.refineryPromptText.setColor("#00ff00");
      } else if (playerCoal > 0) {
        this.refineryPromptText.setText(`[E] Deposit ${playerCoal} Coal`);
        this.refineryPromptText.setColor("#ffaa00");
      } else {
        this.refineryPromptText.setText("Mine coal to deposit");
        this.refineryPromptText.setColor("#888888");
      }
    }
  }

  private makeProgressBar(progress: number): string {
    const filled = Math.floor(progress * 10);
    const empty = 10 - filled;
    return "[" + "=".repeat(filled) + "-".repeat(empty) + "]";
  }

  private getTimeDilation(): number {
    // Use continuous Y position for smooth dilation changes
    const playerY = this.player.getPosition().y / WORLD_CONFIG.tileSize;
    // Adjusted for where player actually rests when standing on ground
    const groundLevel = WORLD_CONFIG.surfaceLevel - 0.2;
    const depth = playerY - groundLevel;
    // Exponential: 1.1^depth - works both ways (slower above, faster below)
    return Math.pow(1 + this.DILATION_RATE, depth);
  }
}
