import { Physics, Input } from "phaser";
import type { Scene } from "phaser";
import { TileType, WORLD_CONFIG } from "../types/index.ts";
import type { TileGenerator } from "../world/TileGenerator.ts";

export class Player {
  private sprite: Physics.Arcade.Sprite;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private wasd: {
    W: Input.Keyboard.Key;
    A: Input.Keyboard.Key;
    S: Input.Keyboard.Key;
    D: Input.Keyboard.Key;
  } | null = null;
  private tileGenerator: TileGenerator;
  private onTileMined: ((x: number, y: number, type: TileType) => void) | null =
    null;

  private readonly MOVE_SPEED = 200;
  private readonly FLY_THRUST = -400;
  private readonly MINE_COOLDOWN = 200; // ms between mining actions
  private lastMineTime = 0;

  // Flight fuel system
  private fuel = 100;
  private readonly MAX_FUEL = 100;
  private readonly FUEL_CONSUMPTION = 50; // fuel per second while flying
  private readonly FUEL_REGEN = 30; // fuel per second while on ground

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

    // Set collision body to fit within a single tile (smaller than 32x32 tile for wiggle room)
    this.sprite.body?.setSize(24, 28);
    this.sprite.body?.setOffset(4, 2);

    // Setup controls
    if (scene.input.keyboard) {
      this.cursors = scene.input.keyboard.createCursorKeys();
      this.wasd = {
        W: scene.input.keyboard.addKey(Input.Keyboard.KeyCodes.W),
        A: scene.input.keyboard.addKey(Input.Keyboard.KeyCodes.A),
        S: scene.input.keyboard.addKey(Input.Keyboard.KeyCodes.S),
        D: scene.input.keyboard.addKey(Input.Keyboard.KeyCodes.D),
      };
    }
  }

  setTileMinedCallback(
    callback: (x: number, y: number, type: TileType) => void
  ): void {
    this.onTileMined = callback;
  }

  update(time: number, delta: number): void {
    if (!this.cursors || !this.wasd) return;

    const body = this.sprite.body as Physics.Arcade.Body;
    const deltaSeconds = delta / 1000;

    // Horizontal movement
    if (this.cursors.left.isDown || this.wasd.A.isDown) {
      body.setVelocityX(-this.MOVE_SPEED);
    } else if (this.cursors.right.isDown || this.wasd.D.isDown) {
      body.setVelocityX(this.MOVE_SPEED);
    }

    // Flying (uses fuel)
    const wantsToFly = this.cursors.up.isDown || this.wasd.W.isDown;
    if (wantsToFly && this.fuel > 0) {
      // Apply thrust
      body.setVelocityY(this.FLY_THRUST);
      // Consume fuel
      this.fuel = Math.max(0, this.fuel - this.FUEL_CONSUMPTION * deltaSeconds);
    }

    // Regenerate fuel when on ground
    if (body.blocked.down) {
      this.fuel = Math.min(
        this.MAX_FUEL,
        this.fuel + this.FUEL_REGEN * deltaSeconds
      );
    }

    // Mining downward
    if (
      (this.cursors.down.isDown || this.wasd.S.isDown) &&
      time > this.lastMineTime + this.MINE_COOLDOWN
    ) {
      this.tryMine(0, 1, time); // Mine below
    }

    // Mining in movement direction
    if (time > this.lastMineTime + this.MINE_COOLDOWN) {
      if (this.cursors.left.isDown || this.wasd.A.isDown) {
        this.tryMine(-1, 0, time); // Mine left
      } else if (this.cursors.right.isDown || this.wasd.D.isDown) {
        this.tryMine(1, 0, time); // Mine right
      }
    }
  }

  private tryMine(dx: number, dy: number, time: number): void {
    const tileSize = WORLD_CONFIG.tileSize;

    // Get the tile position to mine
    const playerTileX = Math.floor(this.sprite.x / tileSize);
    const playerTileY = Math.floor(this.sprite.y / tileSize);

    const targetX = playerTileX + dx;
    const targetY = playerTileY + dy;

    const tileType = this.tileGenerator.getTile(targetX, targetY);

    // Can only mine solid tiles (not air)
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
}
