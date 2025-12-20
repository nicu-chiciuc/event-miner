import { Physics, Input } from 'phaser';
import type { Scene } from 'phaser';
import { TileType, WORLD_CONFIG } from '../types/index.ts';
import type { TileGenerator } from '../world/TileGenerator.ts';

export class Player {
  private sprite: Physics.Arcade.Sprite;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private wasd: { W: Input.Keyboard.Key; A: Input.Keyboard.Key; S: Input.Keyboard.Key; D: Input.Keyboard.Key } | null = null;
  private tileGenerator: TileGenerator;
  private onTileMined: ((x: number, y: number, type: TileType) => void) | null = null;

  private readonly MOVE_SPEED = 200;
  private readonly JUMP_VELOCITY = -350;
  private readonly MINE_COOLDOWN = 200; // ms between mining actions
  private lastMineTime = 0;

  constructor(scene: Scene, x: number, y: number, tileGenerator: TileGenerator) {
    this.tileGenerator = tileGenerator;

    // Create player sprite
    this.sprite = scene.physics.add.sprite(x, y, 'player');
    this.sprite.setCollideWorldBounds(false);
    this.sprite.setBounce(0);
    this.sprite.setDragX(800);

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

  setTileMinedCallback(callback: (x: number, y: number, type: TileType) => void): void {
    this.onTileMined = callback;
  }

  update(time: number): void {
    if (!this.cursors || !this.wasd) return;

    const body = this.sprite.body as Physics.Arcade.Body;

    // Horizontal movement
    if (this.cursors.left.isDown || this.wasd.A.isDown) {
      body.setVelocityX(-this.MOVE_SPEED);
    } else if (this.cursors.right.isDown || this.wasd.D.isDown) {
      body.setVelocityX(this.MOVE_SPEED);
    }

    // Jumping (only when on ground)
    if ((this.cursors.up.isDown || this.wasd.W.isDown) && body.blocked.down) {
      body.setVelocityY(this.JUMP_VELOCITY);
    }

    // Mining downward
    if ((this.cursors.down.isDown || this.wasd.S.isDown) && time > this.lastMineTime + this.MINE_COOLDOWN) {
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
}

