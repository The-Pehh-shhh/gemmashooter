import Phaser from "phaser";
import { Bullet } from "./Bullet";
import { playProceduralShootSound } from "../utils/audio";

export class Enemy extends Phaser.GameObjects.Container {
  public hp: number = 100;
  public maxHp: number = 100;
  public speed: number = 195; // Slightly slower than player for balanced playability

  private sceneRef: Phaser.Scene;
  private circle: Phaser.GameObjects.Arc;
  private barrel: Phaser.GameObjects.Rectangle;
  private healthBar: Phaser.GameObjects.Graphics;

  // Strategic controls manipulated by AIManager
  public aiState: string = "PATROL";
  public aiMoveStrategy: string = "RANDOM_PATROL";
  public aiShouldAttack: boolean = false;
  public aiTargetPos: Phaser.Math.Vector2;

  // Firing rate attributes
  private lastFired: number = 0;
  private fireRate: number = 420; // Slightly higher interval for fair CPU engagements

  // AI navigation variables
  private patrolTarget: Phaser.Math.Vector2;
  private patrolWaitTimer: number = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    this.sceneRef = scene;
    this.aiTargetPos = new Phaser.Math.Vector2(x, y);
    this.patrolTarget = new Phaser.Math.Vector2(x, y);

    // Deep Neural-Orange style (Gemma signature color)
    this.barrel = scene.add.rectangle(15, 0, 26, 8, 0x1e293b);
    this.barrel.setOrigin(0, 0.5);

    this.circle = scene.add.arc(0, 0, 18, 0, 360, false, 0xf97316);
    this.circle.setStrokeStyle(2, 0xffffff);

    this.add([this.barrel, this.circle]);

    // Build overhead stats bar
    this.healthBar = scene.add.graphics();
    this.drawHealthBar();

    scene.add.existing(this);
    scene.physics.add.existing(this);

    // Apply Arcade Physics bounds
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setCircle(18, -18, -18);
      body.setCollideWorldBounds(true);
    }
  }

  public update(
    time: number,
    playerX: number,
    playerY: number,
    playerVisible: boolean,
    lastKnownPlayerPos: Phaser.Math.Vector2,
    obstacles: Phaser.Physics.Arcade.StaticGroup,
    bulletsGroup: Phaser.Physics.Arcade.Group
  ) {
    if (this.hp <= 0) {
      if (this.body) {
        (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      }
      return;
    }

    const body = this.body as Phaser.Physics.Arcade.Body;
    if (!body) return;

    // 1. Resolve path target depending on the movement strategy determined by Gemini
    let targetX = this.x;
    let targetY = this.y;

    switch (this.aiMoveStrategy) {
      case "PLAYER_POS":
        targetX = playerX;
        targetY = playerY;
        break;

      case "LAST_KNOWN_POS":
        targetX = lastKnownPlayerPos.x;
        targetY = lastKnownPlayerPos.y;
        break;

      case "NEAREST_COVER":
        // Find closest solid block and hide behind it relative to player position
        const closestCover = this.findNearestCover(obstacles);
        if (closestCover) {
          // Put the obstacle between the enemy and the player
          const dirFromPlayer = new Phaser.Math.Vector2(closestCover.x - playerX, closestCover.y - playerY).normalize();
          targetX = closestCover.x + dirFromPlayer.x * 24;
          targetY = closestCover.y + dirFromPlayer.y * 24;
        } else {
          // Fallback to random patrol if no covers are present
          targetX = this.patrolTarget.x;
          targetY = this.patrolTarget.y;
        }
        break;

      case "RUN_AWAY":
        // Vector subtraction: move directly away from player coordinates
        const runDir = new Phaser.Math.Vector2(this.x - playerX, this.y - playerY).normalize();
        targetX = Phaser.Math.Clamp(this.x + runDir.x * 200, 50, 950);
        targetY = Phaser.Math.Clamp(this.y + runDir.y * 200, 50, 750);
        break;

      case "AMBUSH_POINT":
        // Retreat to custom defensive map spots (corners or thick obstacles)
        const ambushPoints = [
          new Phaser.Math.Vector2(80, 80),
          new Phaser.Math.Vector2(920, 80),
          new Phaser.Math.Vector2(80, 720),
          new Phaser.Math.Vector2(920, 720),
        ];
        let closestPoint = ambushPoints[0];
        let minDist = Phaser.Math.Distance.Between(this.x, this.y, closestPoint.x, closestPoint.y);
        ambushPoints.forEach((pt) => {
          const d = Phaser.Math.Distance.Between(this.x, this.y, pt.x, pt.y);
          if (d < minDist) {
            minDist = d;
            closestPoint = pt;
          }
        });
        targetX = closestPoint.x;
        targetY = closestPoint.y;
        break;

      case "RANDOM_PATROL":
      default:
        // Move towards a chosen random way point, re-pick periodically
        const distToPatrol = Phaser.Math.Distance.Between(this.x, this.y, this.patrolTarget.x, this.patrolTarget.y);
        if (distToPatrol < 30 || time > this.patrolWaitTimer) {
          // Pick new patrol coords (arena bounds 80-920, 80-720)
          this.patrolTarget.x = Phaser.Math.Between(100, 900);
          this.patrolTarget.y = Phaser.Math.Between(100, 700);
          this.patrolWaitTimer = time + Phaser.Math.Between(3000, 6000);
        }
        targetX = this.patrolTarget.x;
        targetY = this.patrolTarget.y;
        break;
    }

    // 2. Set locomotion velocity towards Resolved Target coords
    const distToTarget = Phaser.Math.Distance.Between(this.x, this.y, targetX, targetY);
    if (distToTarget > 15) {
      const moveAngle = Phaser.Math.Angle.Between(this.x, this.y, targetX, targetY);
      this.sceneRef.physics.velocityFromRotation(moveAngle, this.speed, body.velocity);
    } else {
      body.setVelocity(0, 0);
    }

    // 3. Set visual alignment rotation
    // Face player if they are spotted, otherwise turn to face movement velocity direction
    if (playerVisible) {
      const faceAngle = Phaser.Math.Angle.Between(this.x, this.y, playerX, playerY);
      this.setRotation(faceAngle);
    } else if (body.velocity.x !== 0 || body.velocity.y !== 0) {
      const moveAngle = Math.atan2(body.velocity.y, body.velocity.x);
      this.setRotation(moveAngle);
    }

    // 4. Combat Fire logic (if Gemini permits and player is visible)
    if (this.aiShouldAttack && playerVisible && time > this.lastFired + this.fireRate) {
      this.fireTowardsPlayer(playerX, playerY, bulletsGroup);
      this.lastFired = time;
    }

    // 5. Update UI layer
    this.drawHealthBar();
  }

  private fireTowardsPlayer(px: number, py: number, bulletsGroup: Phaser.Physics.Arcade.Group) {
    const bullet = bulletsGroup.get() as Bullet | undefined;
    if (bullet) {
      const barrelLength = 32;
      const tipX = this.x + Math.cos(this.rotation) * barrelLength;
      const tipY = this.y + Math.sin(this.rotation) * barrelLength;

      // Add slight tactical aim error (5 to 15 pixels offset) depending on range
      const distance = Phaser.Math.Distance.Between(this.x, this.y, px, py);
      const scatterAmount = Phaser.Math.Clamp(distance * 0.05, 5, 30);
      const scatteredPx = px + Phaser.Math.RandomXY(new Phaser.Math.Vector2()).x * scatterAmount;
      const scatteredPy = py + Phaser.Math.RandomXY(new Phaser.Math.Vector2()).y * scatterAmount;

      bullet.fire(tipX, tipY, scatteredPx, scatteredPy, false, 620, 8);
      playProceduralShootSound(false);
    }
  }

  private findNearestCover(obstacles: Phaser.Physics.Arcade.StaticGroup): any {
    let bestCover: any = null;
    let minDist = 999999;

    obstacles.getChildren().forEach((child: any) => {
      // Find decorative boxes labeled as cover points
      const d = Phaser.Math.Distance.Between(this.x, this.y, child.x, child.y);
      if (d < minDist) {
        minDist = d;
        bestCover = child;
      }
    });

    return bestCover;
  }

  public takeDamage(amount: number): boolean {
    if (this.hp <= 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.drawHealthBar();

    // Damage flash UI indicator
    this.circle.setFillStyle(0xef4444);
    this.sceneRef.time.delayedCall(120, () => {
      this.circle.setFillStyle(0xf97316);
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

    // Background segment
    this.healthBar.fillStyle(0x334155, 0.75);
    this.healthBar.fillRect(barX, barY, barW, barH);

    // Foreground health (Bright Orange)
    const ratio = this.hp / this.maxHp;
    const hpColor = ratio > 0.4 ? 0xf97316 : 0xef4444;
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
    this.aiState = "PATROL";
    this.aiMoveStrategy = "RANDOM_PATROL";
    this.aiShouldAttack = false;
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
