import Phaser from "phaser";

export class Bullet extends Phaser.Physics.Arcade.Sprite {
  private isPlayerOwned: boolean = false;
  private maxLifeSpan: number = 2000; // in ms
  private bornTime: number = 0;
  private damageAmount: number = 10;
  public trailHistory: Array<{ x: number; y: number }> = [];

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string) {
    super(scene, x, y, texture);
    scene.add.existing(this);
    scene.physics.add.existing(this);
  }

  public fire(
    fromX: number,
    fromY: number,
    targetX: number,
    targetY: number,
    isPlayer: boolean,
    speed: number = 650,
    damage: number = 10
  ) {
    this.setActive(true);
    this.setVisible(true);
    this.setPosition(fromX, fromY);
    this.isPlayerOwned = isPlayer;
    this.bornTime = 0;
    this.damageAmount = damage;
    this.trailHistory = [{ x: fromX, y: fromY }];

    const angle = Phaser.Math.Angle.Between(fromX, fromY, targetX, targetY);
    this.setRotation(angle);

    if (this.body) {
      this.scene.physics.velocityFromRotation(angle, speed, this.body.velocity);
    }
  }

  public getIsPlayerOwned(): boolean {
    return this.isPlayerOwned;
  }

  public getDamage(): number {
    return this.damageAmount;
  }

  public kill() {
    this.setActive(false);
    this.setVisible(false);
    if (this.body) {
      this.body.stop();
    }
  }

  protected preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    this.bornTime += delta;
    
    if (this.active) {
      this.trailHistory.push({ x: this.x, y: this.y });
      if (this.trailHistory.length > 12) {
        this.trailHistory.shift();
      }
    }

    if (this.bornTime >= this.maxLifeSpan) {
      this.kill();
    }
  }
}
