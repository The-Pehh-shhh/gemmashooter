import Phaser from "phaser";

export class VisionSystem {
  private scene: Phaser.Scene;
  private visionRadius: number;

  constructor(scene: Phaser.Scene, visionRadius: number = 480) {
    this.scene = scene;
    this.visionRadius = visionRadius;
  }

  /**
   * Evaluates if there is a clear line of sight (LOS) between the from point and to point.
   * If any obstacle intersects the line, return false.
   */
  public hasLineOfSight(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    obstacles: Phaser.Physics.Arcade.StaticGroup | Phaser.Physics.Arcade.Group
  ): boolean {
    const distance = Phaser.Math.Distance.Between(fromX, fromY, toX, toY);
    if (distance > this.visionRadius) {
      return false; // Beyond visual range
    }

    const losLine = new Phaser.Geom.Line(fromX, fromY, toX, toY);

    let isBlocked = false;

    obstacles.getChildren().forEach((child: any) => {
      if (isBlocked) return;

      // Obstacles can be treated as Rectangles based on their sprite bounds
      if (child.active) {
        const bounds = child.getBounds();
        if (Phaser.Geom.Intersects.LineToRectangle(losLine, bounds)) {
          isBlocked = true;
        }
      }
    });

    return !isBlocked;
  }

  public getVisionRadius(): number {
    return this.visionRadius;
  }
}
