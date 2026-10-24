import Phaser, { Physics, Input } from "phaser";
import type { Scene } from "phaser";
import { TileType, WORLD_CONFIG } from "../types/index.ts";
import type { TileGenerator } from "../world/TileGenerator.ts";
import { tweaks } from "../tweaks.ts";

export class Player {
  private sprite: Physics.Arcade.Sprite;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private wasd: {
    W: Input.Keyboard.Key;
    A: Input.Keyboard.Key;
    S: Input.Keyboard.Key;
    D: Input.Keyboard.Key;
  } | null = null;
  private interactKey: Input.Keyboard.Key | null = null;
  private tileGenerator: TileGenerator;
  private onTileMined: ((x: number, y: number, type: TileType) => void) | null =
    null;
  private onInteract: (() => void) | null = null;

  private lastMineTime = 0;

  // Flight fuel system
  private fuel = 100;
  private readonly MAX_FUEL = 100;

  // Coal inventory
  private coal = 6;

  constructor(
    scene: Scene,
    x: number,
    y: number,
    tileGenerator: TileGenerator
  ) {
    this.tileGenerator = tileGenerator;

    // Create player sprite
    this.sprite = scene.physics.add.sprite(x, y, "player");
    this.sprite.setCollideWorldBounds(false);
    this.sprite.setBounce(0);
    this.sprite.setDragX(800);

    // Small hitbox for easy movement through 1-tile gaps
    const hitboxSize = 20;
    const offsetX = (48 - hitboxSize) / 2;
    const offsetY = (48 - hitboxSize) / 2;
    this.sprite.body?.setSize(hitboxSize, hitboxSize);
    this.sprite.body?.setOffset(offsetX, offsetY);

    // Setup controls
    if (scene.input.keyboard) {
      this.cursors = scene.input.keyboard.createCursorKeys();
      this.wasd = {
        W: scene.input.keyboard.addKey(Input.Keyboard.KeyCodes.W),
        A: scene.input.keyboard.addKey(Input.Keyboard.KeyCodes.A),
        S: scene.input.keyboard.addKey(Input.Keyboard.KeyCodes.S),
        D: scene.input.keyboard.addKey(Input.Keyboard.KeyCodes.D),
      };
      this.interactKey = scene.input.keyboard.addKey(Input.Keyboard.KeyCodes.E);
    }
  }

  setTileMinedCallback(
    callback: (x: number, y: number, type: TileType) => void
  ): void {
    this.onTileMined = callback;
  }

  setInteractCallback(callback: () => void): void {
    this.onInteract = callback;
  }

  update(time: number, delta: number): void {
    if (!this.cursors || !this.wasd) return;

    const body = this.sprite.body as Physics.Arcade.Body;
    const deltaSeconds = delta / 1000;

    const movingLeft = this.cursors.left.isDown || this.wasd.A.isDown;
    const movingRight = this.cursors.right.isDown || this.wasd.D.isDown;
    const movingUp = this.cursors.up.isDown || this.wasd.W.isDown;
    const movingDown = this.cursors.down.isDown || this.wasd.S.isDown;

    // Horizontal movement
    if (movingLeft) {
      body.setVelocityX(-tweaks.moveSpeed);
    } else if (movingRight) {
      body.setVelocityX(tweaks.moveSpeed);
    }

    // Holding down slides the vehicle to the centre of its column, so it drops into the shaft
    // instead of resting on the edge of the next tile.
    if (movingDown && !movingLeft && !movingRight) {
      const tileSize = WORLD_CONFIG.tileSize;
      const columnCentre = (Math.floor(this.sprite.x / tileSize) + 0.5) * tileSize;
      body.setVelocityX((columnCentre - this.sprite.x) * 12);
    }

    // Flying (uses fuel)
    if (movingUp && this.fuel > 0) {
      body.setVelocityY(-tweaks.flyThrust);
      this.fuel = Math.max(0, this.fuel - tweaks.fuelPerSecond * deltaSeconds);
    }

    // Mining
    if (movingDown && time > this.lastMineTime + tweaks.mineCooldownMs) {
      this.tryMine(0, 1, time);
    }
    if (time > this.lastMineTime + tweaks.mineCooldownMs) {
      if (movingLeft) {
        this.tryMine(-1, 0, time);
      } else if (movingRight) {
        this.tryMine(1, 0, time);
      }
    }

    // Interact
    if (this.interactKey && Phaser.Input.Keyboard.JustDown(this.interactKey)) {
      if (this.onInteract) {
        this.onInteract();
      }
    }
  }

  private tryMine(dx: number, dy: number, time: number): void {
    const tileSize = WORLD_CONFIG.tileSize;
    const playerTileX = Math.floor(this.sprite.x / tileSize);
    const playerTileY = Math.floor(this.sprite.y / tileSize);
    const targetX = playerTileX + dx;
    const targetY = playerTileY + dy;

    const tileType = this.tileGenerator.getTile(targetX, targetY);

    if (tileType !== TileType.AIR) {
      this.tileGenerator.setTile(targetX, targetY, TileType.AIR);
      this.lastMineTime = time;

      if (this.onTileMined) {
        this.onTileMined(targetX, targetY, tileType);
      }
    }
  }

  getSprite(): Physics.Arcade.Sprite {
    return this.sprite;
  }

  getPosition(): { x: number; y: number } {
    return { x: this.sprite.x, y: this.sprite.y };
  }

  getFuel(): number {
    return this.fuel;
  }

  getMaxFuel(): number {
    return this.MAX_FUEL;
  }

  addCoal(): void {
    this.coal++;
  }

  getCoal(): number {
    return this.coal;
  }

  depositAllCoal(): number {
    const deposited = this.coal;
    this.coal = 0;
    return deposited;
  }

  spendCoal(amount: number): void {
    this.coal -= amount;
  }

  hasCoal(): boolean {
    return this.coal > 0;
  }

  addFuel(amount: number): void {
    this.fuel = Math.min(this.MAX_FUEL, this.fuel + amount);
  }
}
