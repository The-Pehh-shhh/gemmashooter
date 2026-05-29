import Phaser from "phaser";
import { Bullet } from "./Bullet";
import { playProceduralShootSound } from "../utils/audio";

export class Player extends Phaser.GameObjects.Container {
  public hp: number = 100;
  public maxHp: number = 100;
  public speed: number = 240;

  private sceneRef: Phaser.Scene;
  private circle: Phaser.GameObjects.Arc;
  private barrel: Phaser.GameObjects.Rectangle;
  private healthBar: Phaser.GameObjects.Graphics;

  private wsKeys!: {
    w: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
  };

  private lastFired: number = 0;
  private fireRate: number = 180; // ms

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    this.sceneRef = scene;

    // Build custom graphics procedurally
    // Barrel pointing right (angle 0)
    this.barrel = scene.add.rectangle(15, 0, 26, 8, 0x1e293b);
    this.barrel.setOrigin(0, 0.5);

    // Main circle chassis (Player green color)
    this.circle = scene.add.arc(0, 0, 18, 0, 360, false, 0x10b981);
    this.circle.setStrokeStyle(2, 0xffffff);

    // Group elements inside container
    this.add([this.barrel, this.circle]);

    // Add health bar just above the player
    this.healthBar = scene.add.graphics();
    this.drawHealthBar();

    scene.add.existing(this);
    scene.physics.add.existing(this);

    // Setup bounds circle for arcade physics
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setCircle(18, -18, -18);
      body.setCollideWorldBounds(true);
    }

    // Configure inputs
    if (scene.input.keyboard) {
      this.wsKeys = {
        w: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        a: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        s: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        d: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      };
    }
  }

  public update(time: number, bulletsGroup: Phaser.Physics.Arcade.Group) {
    if (this.hp <= 0) return;

    const body = this.body as Phaser.Physics.Arcade.Body;
    if (!body) return;

    // 1. WASD velocity calculation
    let vx = 0;
    let vy = 0;

    if (this.wsKeys.w.isDown) vy = -this.speed;
    if (this.wsKeys.s.isDown) vy = this.speed;
    if (this.wsKeys.a.isDown) vx = -this.speed;
    if (this.wsKeys.d.isDown) vx = this.speed;

    // Diagonal speed correction
    if (vx !== 0 && vy !== 0) {
      vx *= 0.7071;
      vy *= 0.7071;
    }

    body.setVelocity(vx, vy);

    // 2. Aim Barrel towards active pointer (Mouse / Touch)
    const pointer = this.sceneRef.input.activePointer;
    const worldPointerX = pointer.worldX;
    const worldPointerY = pointer.worldY;

    const angle = Phaser.Math.Angle.Between(this.x, this.y, worldPointerX, worldPointerY);
    this.setRotation(angle);

    // 3. Keep drawing health statistics
    this.drawHealthBar();

    // 4. Click firing mechanic
    if (pointer.isDown && time > this.lastFired + this.fireRate) {
      this.fireBullet(worldPointerX, worldPointerY, bulletsGroup);
      this.lastFired = time;
    }
  }

  private fireBullet(targetX: number, targetY: number, bulletsGroup: Phaser.Physics.Arcade.Group) {
    const bullet = bulletsGroup.get() as Bullet | undefined;
    if (bullet) {
      // Calculate barrel tip coordinates to spawn bullets elegantly
      const barrelLength = 32;
      const tipX = this.x + Math.cos(this.rotation) * barrelLength;
      const tipY = this.y + Math.sin(this.rotation) * barrelLength;

      bullet.fire(tipX, tipY, targetX, targetY, true, 700, 10);
      playProceduralShootSound(true);
      
      // Callback to register shot fired in match memory
      const sceneAny = this.sceneRef as any;
      if (sceneAny.memorySystem) {
        sceneAny.memorySystem.recordShotFired();
      }
    }
  }

  public takeDamage(amount: number): boolean {
    if (this.hp <= 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.drawHealthBar();

    // Damage indicator effect (brief flash)
    this.circle.setFillStyle(0xef4444);
    this.sceneRef.time.delayedCall(120, () => {
      this.circle.setFillStyle(0x10b981);
    });

    return this.hp <= 0;
  }

  public drawHealthBar() {
    this.healthBar.clear();
    if (this.hp <= 0) return;

    const barW = 36;
    const barH = 5;
    const barX = this.x - barW / 2;
    const barY = this.y - 28;

    // Background empty segment (dark slate gray)
    this.healthBar.fillStyle(0x334155, 0.75);
    this.healthBar.fillRect(barX, barY, barW, barH);

    // Foreground health (Bright Emerald)
    const ratio = this.hp / this.maxHp;
    const hpColor = ratio > 0.4 ? 0x10b981 : 0xf59e0b;
    this.healthBar.fillStyle(hpColor, 1);
    this.healthBar.fillRect(barX, barY, barW * ratio, barH);
  }

  public heal(amount: number) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.drawHealthBar();
  }

  public reset(spawnX: number, spawnY: number) {
    this.hp = this.maxHp;
    this.setPosition(spawnX, spawnY);
    this.drawHealthBar();
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setVelocity(0, 0);
    }
  }

  public destroy(fromScene?: boolean) {
    this.healthBar.destroy();
    super.destroy(fromScene);
  }
}
