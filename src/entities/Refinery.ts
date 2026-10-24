import { Scene, GameObjects } from "phaser";
import { tweaks } from "../tweaks.ts";

export class Refinery {
  private scene: Scene;
  private sprite: GameObjects.Sprite;
  private smokeEmitter: GameObjects.Particles.ParticleEmitter | null = null;
  private progressBarBg: GameObjects.Rectangle;
  private progressBarFill: GameObjects.Rectangle;
  private fuelCountText: GameObjects.Text;

  // Processing state
  private coalQueue = 0;
  private isProcessing = false;
  private processingProgress = 0;
  private accumulatedFuel = 0;

  public readonly x: number;
  public readonly y: number;
  /** Depth in tiles where the refinery stands. Its clock runs at the rate of that depth. */
  public readonly depthTiles: number;
  private readonly PROGRESS_BAR_WIDTH = 120;
  private readonly PROGRESS_BAR_HEIGHT = 16;

  constructor(scene: Scene, x: number, y: number, depthTiles: number, scale: number) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.depthTiles = depthTiles;

    this.sprite = scene.add.sprite(x, y, "refinery");
    this.sprite.setScale(scale);
    this.sprite.setDepth(5);

    // Create progress bar above the building
    const barY = this.y - this.sprite.displayHeight / 2 - 20;
    this.progressBarBg = scene.add.rectangle(
      this.x,
      barY,
      this.PROGRESS_BAR_WIDTH,
      this.PROGRESS_BAR_HEIGHT,
      0x333333
    );
    this.progressBarBg.setDepth(6);
    this.progressBarBg.setVisible(false);

    this.progressBarFill = scene.add.rectangle(
      this.x - this.PROGRESS_BAR_WIDTH / 2,
      barY,
      0,
      this.PROGRESS_BAR_HEIGHT - 2,
      0x00ff00
    );
    this.progressBarFill.setOrigin(0, 0.5);
    this.progressBarFill.setDepth(7);
    this.progressBarFill.setVisible(false);

    // Create fuel count text next to the bar
    this.fuelCountText = scene.add.text(
      this.x + this.PROGRESS_BAR_WIDTH / 2 + 12,
      barY,
      "0",
      {
        fontSize: "24px",
        color: "#00ff00",
        fontStyle: "bold",
      }
    );
    this.fuelCountText.setOrigin(0, 0.5);
    this.fuelCountText.setDepth(7);

    // Create smoke particles (will be activated when processing)
    this.createSmokeEmitter(scale);
  }

  private createSmokeEmitter(scale: number): void {
    if (!this.scene.textures.exists("smoke")) {
      const graphics = this.scene.add.graphics();
      graphics.fillStyle(0x666666, 0.6);
      graphics.fillCircle(4, 4, 4);
      graphics.generateTexture("smoke", 8, 8);
      graphics.destroy();
    }

    this.smokeEmitter = this.scene.add.particles(
      this.x + 30 * scale,
      this.y - 35 * scale,
      "smoke",
      {
        speed: { min: 20, max: 40 },
        angle: { min: -100, max: -80 },
        scale: { start: 0.5, end: 1.5 },
        alpha: { start: 0.6, end: 0 },
        lifespan: 1500,
        frequency: 200,
        emitting: false,
      }
    );
    this.smokeEmitter.setDepth(6);
  }

  depositCoal(amount: number): number {
    this.coalQueue += amount;
    return amount;
  }

  collectFuel(): number {
    const fuel = this.accumulatedFuel;
    this.accumulatedFuel = 0;
    return fuel;
  }

  /** Advances the refinery by `delta` milliseconds of its own clock. A large delta processes several coal. */
  update(delta: number): void {
    const processingTime = tweaks.refinerySecondsPerCoal * 1000;
    let remaining = delta;
    while (remaining > 0) {
      if (!this.isProcessing) {
        if (this.coalQueue === 0) break;
        this.coalQueue--;
        this.isProcessing = true;
        this.processingProgress = 0;
      }
      const step = Math.min(remaining, processingTime - this.processingProgress);
      this.processingProgress += step;
      remaining -= step;
      if (this.processingProgress >= processingTime) {
        this.accumulatedFuel += 1;
        this.isProcessing = false;
        this.processingProgress = 0;
      }
    }

    const active = this.isProcessing || this.coalQueue > 0;
    if (this.smokeEmitter && this.smokeEmitter.emitting !== active) {
      if (active) this.smokeEmitter.start();
      else this.smokeEmitter.stop();
    }

    // Update visuals
    this.updateProgressBar();
    this.updateFuelCountText();
  }

  private updateProgressBar(): void {
    if (this.isProcessing) {
      // Show progress bar when processing
      this.progressBarBg.setVisible(true);
      this.progressBarFill.setVisible(true);

      const progress = this.processingProgress / (tweaks.refinerySecondsPerCoal * 1000);
      this.progressBarFill.width = (this.PROGRESS_BAR_WIDTH - 4) * progress;
      this.progressBarFill.fillColor = 0x888888; // Gray for coal
    } else {
      // Hide bar when not processing
      this.progressBarBg.setVisible(false);
      this.progressBarFill.setVisible(false);
    }
  }

  private updateFuelCountText(): void {
    this.fuelCountText.setText(this.accumulatedFuel.toString());

    // Show/hide and color based on fuel amount
    if (this.accumulatedFuel > 0) {
      this.fuelCountText.setColor("#00ff00");
      this.fuelCountText.setVisible(true);
    } else if (this.isProcessing || this.coalQueue > 0) {
      this.fuelCountText.setColor("#888888");
      this.fuelCountText.setVisible(true);
    } else {
      this.fuelCountText.setVisible(false);
    }
  }

  isPlayerInRange(playerX: number, playerY: number, range = 80): boolean {
    const dx = playerX - this.x;
    const dy = playerY - this.y;
    return Math.sqrt(dx * dx + dy * dy) < range;
  }

  // Getters for UI
  getQueueCount(): number {
    return this.coalQueue + (this.isProcessing ? 1 : 0);
  }

  getCurrentProgress(): number | null {
    if (!this.isProcessing) return null;
    return this.processingProgress / (tweaks.refinerySecondsPerCoal * 1000);
  }

  getAccumulatedFuel(): number {
    return this.accumulatedFuel;
  }

  getIsProcessing(): boolean {
    return this.isProcessing;
  }

  getGameObjects(): GameObjects.GameObject[] {
    const objects: GameObjects.GameObject[] = [
      this.sprite,
      this.progressBarBg,
      this.progressBarFill,
      this.fuelCountText,
    ];
    if (this.smokeEmitter) {
      objects.push(this.smokeEmitter);
    }
    return objects;
  }
}
