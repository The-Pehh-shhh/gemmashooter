import Phaser from "phaser";
import { Player } from "./Player";
import { Enemy } from "./Enemy";
import { Bullet } from "./Bullet";
import { MemorySystem } from "./MemorySystem";
import { VisionSystem } from "./VisionSystem";
import { AIManager } from "./AIManager";
import { GameLog } from "../types";
import { playProceduralMatchOutcomeSound } from "../utils/audio";

export class GameScene extends Phaser.Scene {
  public player!: Player;
  public enemy!: Enemy;
  public memorySystem!: MemorySystem;
  public visionSystem!: VisionSystem;
  public aiManager!: AIManager;

  // Groups and items
  public obstacles!: Phaser.Physics.Arcade.StaticGroup;
  public bulletsGroup!: Phaser.Physics.Arcade.Group;
  public healthPack?: Phaser.GameObjects.Arc;
  private trailGraphics!: Phaser.GameObjects.Graphics;

  // Tactical variables
  public lastKnownPlayerPos!: Phaser.Math.Vector2;
  private healthPackSpawnTimer: number = 0;
  private isHealPackActive: boolean = false;

  // Event handlers to pipeline logs to the UI
  private onDecisionLogged?: (log: GameLog, isFallback: boolean) => void;
  private onStatsChannel?: (stats: any) => void;

  constructor() {
    super({ key: "GemmaGameScene" });
  }

  public init(data: {
    memorySystem: MemorySystem;
    onDecisionLogged: (log: GameLog, isFallback: boolean) => void;
    onStatsChannel: (stats: any) => void;
  }) {
    this.memorySystem = data.memorySystem;
    this.onDecisionLogged = data.onDecisionLogged;
    this.onStatsChannel = data.onStatsChannel;
  }

  public preload() {
    // We construct assets dynamically via procedurally generated canvases, 
    // ensuring the game loads and builds robustly regardless of network failures.
    this.createProceduralTextures();
  }

  private createProceduralTextures() {
    // 1. Solid Obstacle block
    const obstacleCanvas = this.textures.createCanvas("obstacle_block", 48, 48);
    if (obstacleCanvas) {
      const ctx = obstacleCanvas.context;
      // Dark slate background
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, 0, 48, 48);
      // Cyber neon cyan outline
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 3;
      ctx.strokeRect(3, 3, 42, 42);
      obstacleCanvas.refresh();
    }

    // 2. Yellow laser bullet capsule
    const bulletCanvas = this.textures.createCanvas("laser_bullet", 12, 6);
    if (bulletCanvas) {
      const ctx = bulletCanvas.context;
      ctx.fillStyle = "#fbbf24";
      ctx.fillRect(0, 0, 12, 6);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(3, 1, 6, 4);
      bulletCanvas.refresh();
    }
  }

  public create() {
    // Scale-independent physical dimensions (Arena: 1000 x 800)
    this.cameras.main.setBackgroundColor("#0b0f19");
    this.physics.world.setBounds(0, 0, 1000, 800);

    // Dynamic grid overlay drawing for visual depth
    this.drawGridBackground();

    // Setup bullet trail renderer overlay
    this.trailGraphics = this.add.graphics();

    this.lastKnownPlayerPos = new Phaser.Math.Vector2(500, 400);

    // 1. Instantiating Static Obstacle layout (Symmetric Cover Architecture)
    this.obstacles = this.physics.add.staticGroup();
    this.spawnSymmetricArena();

    // 2. Bullets Management Engine
    this.bulletsGroup = this.physics.add.group({
      classType: Bullet,
      maxSize: 50,
      runChildUpdate: true,
    });

    // 3. Spawning combatants: Player in South-West, Gemma in North-East
    this.player = new Player(this, 150, 650);
    this.enemy = new Enemy(this, 850, 150);

    // 4. Initializing AI decision pipeline and LOS raycasting
    this.visionSystem = new VisionSystem(this, 450);
    this.aiManager = new AIManager(
      this,
      this.enemy,
      this.player,
      this.memorySystem,
      this.visionSystem,
      this.onDecisionLogged
    );

    // 5. Physics Collision Resolvers
    // Rigid colliders preventing players/enemies walk through walls
    this.physics.add.collider(this.player, this.obstacles);
    this.physics.add.collider(this.enemy, this.obstacles);

    // Bullet-to-Obstacle collisions (disintegrates the bullet)
    this.physics.add.collider(this.bulletsGroup, this.obstacles, (bulletAny: any) => {
      bulletAny.kill();
      this.emitExplosionEffect(bulletAny.x, bulletAny.y, 0x38bdf8, 4);
    });

    // Bullet overlaps: checking bullet hitting Player or Enemy
    this.physics.add.overlap(this.bulletsGroup, this.player, (_, bulletAny: any) => {
      if (!bulletAny.getIsPlayerOwned()) {
        bulletAny.kill();
        this.emitExplosionEffect(bulletAny.x, bulletAny.y, 0xef4444, 8);
        const playerDead = this.player.takeDamage(bulletAny.getDamage());
        
        // Feed hit metrics to the adaptive memory manager
        this.memorySystem.recordShotHit();

        if (playerDead) {
          this.handleMatchOutcome("ai");
        }
      }
    });

    this.physics.add.overlap(this.bulletsGroup, this.enemy, (_, bulletAny: any) => {
      if (bulletAny.getIsPlayerOwned()) {
        bulletAny.kill();
        this.emitExplosionEffect(bulletAny.x, bulletAny.y, 0x10b981, 8);
        const enemyDead = this.enemy.takeDamage(bulletAny.getDamage());

        // Perform memory recording: did player snipe or rush?
        this.recordPlayerTacticalAction();

        if (enemyDead) {
          this.handleMatchOutcome("player");
        }
      }
    });

    // 6. Spawn central glowing neutral Healing Pad
    this.spawnHealPackCenter();

    // Trigger initial stats push
    this.pushStatsToReact();
  }

  private drawGridBackground() {
    const graphics = this.add.graphics();
    graphics.lineStyle(1, 0x1e293b, 0.4);

    const step = 40;
    for (let x = 0; x < 1000; x += step) {
      graphics.lineBetween(x, 0, x, 800);
    }
    for (let y = 0; y < 800; y += step) {
      graphics.lineBetween(0, y, 1000, y);
    }
  }

  private spawnSymmetricArena() {
    // Symm cover layout
    const blocksCoords = [
      // Top-Left structure
      { x: 300, y: 200 }, { x: 300, y: 248 }, { x: 348, y: 200 },
      // Top-Right structure
      { x: 700, y: 200 }, { x: 700, y: 248 }, { x: 652, y: 200 },
      // Bottom-Left structure
      { x: 300, y: 600 }, { x: 300, y: 552 }, { x: 348, y: 600 },
      // Bottom-Right structure
      { x: 700, y: 600 }, { x: 700, y: 552 }, { x: 652, y: 600 },
      // Middle obstacles
      { x: 500, y: 300 }, { x: 500, y: 500 },
    ];

    blocksCoords.forEach((pt) => {
      const b = this.obstacles.create(pt.x, pt.y, "obstacle_block");
      b.setOrigin(0.5, 0.5);
      b.refreshBody();
    });
  }

  private spawnHealPackCenter() {
    this.isHealPackActive = true;
    this.healthPack = this.add.arc(500, 400, 16, 0, 360, false, 0xef4444);
    this.physics.add.existing(this.healthPack);
    const body = this.healthPack.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setCircle(16);
    }

    // Add pulse effects
    this.tweens.add({
      targets: this.healthPack,
      scale: 1.25,
      alpha: 0.8,
      duration: 800,
      yoyo: true,
      repeat: -1,
    });

    // Player heals on touch
    this.physics.add.overlap(this.player, this.healthPack, () => {
      if (this.isHealPackActive) {
        this.player.heal(35);
        this.despawnHealPack();
      }
    });

    // Enemy AI heals on touch (tactical cover incentive)
    this.physics.add.overlap(this.enemy, this.healthPack, () => {
      if (this.isHealPackActive) {
        this.enemy.heal(35);
        this.despawnHealPack();
      }
    });
  }

  private despawnHealPack() {
    this.isHealPackActive = false;
    if (this.healthPack) {
      this.healthPack.destroy();
    }
    this.healthPackSpawnTimer = this.time.now + 12000; // Respawns every 12 seconds
  }

  private recordPlayerTacticalAction() {
    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.enemy.x, this.enemy.y);
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;

    // Check Rushing behavior
    if (dist < 200 && playerBody) {
      const speed = Math.sqrt(playerBody.velocity.x ** 2 + playerBody.velocity.y ** 2);
      if (speed > 100) {
        this.memorySystem.recordRush();
      }
    }

    // Check Sniping behavior
    if (dist >= 400) {
      this.memorySystem.recordSniperShot();
    }

    // Check if player shoots while close to corners/obstacles (cover play)
    let isNearObstacle = false;
    this.obstacles.getChildren().forEach((child: any) => {
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, child.x, child.y) < 65) {
        isNearObstacle = true;
      }
    });

    if (isNearObstacle) {
      this.memorySystem.recordCoverUse();
    }
  }

  private handleMatchOutcome(winner: "player" | "ai") {
    // Increase play totals
    this.memorySystem.recordGameCount(winner);

    // Briefly freeze gameplay and flash outcome
    this.physics.pause();
    
    // Play Web Audio API procedural sound
    playProceduralMatchOutcomeSound(winner);
    
    // Procedural banner drawing
    const rect = this.add.rectangle(500, 400, 380, 120, 0x111827, 0.95);
    rect.setStrokeStyle(2, winner === "player" ? 0x10b981 : 0xf97316);

    const txt = winner === "player" ? "VICTORY" : "CPU GEMMA Arena VICTORY";
    const subTxt = "Respawning combatants in 3 seconds...";
    
    const bannerText = this.add.text(500, 380, txt, {
      fontFamily: "Space Grotesk, sans-serif",
      fontSize: "26px",
      color: winner === "player" ? "#10b981" : "#f97316",
    }).setOrigin(0.5);

    const subText = this.add.text(500, 420, subTxt, {
      fontFamily: "Inter, sans-serif",
      fontSize: "14px",
      color: "#9ca3af"
    }).setOrigin(0.5);

    this.time.delayedCall(3000, () => {
      rect.destroy();
      bannerText.destroy();
      subText.destroy();
      this.resetMatch();
    });
  }

  private resetMatch() {
    this.physics.resume();
    this.player.reset(150, 650);
    this.enemy.reset(850, 150);
    this.lastKnownPlayerPos.set(500, 400);

    if (!this.isHealPackActive) {
      this.spawnHealPackCenter();
    }

    this.pushStatsToReact();
  }

  public manualResetAll() {
    this.memorySystem.clearMemory();
    this.resetMatch();
  }

  private emitExplosionEffect(x: number, y: number, color: number, count: number = 6) {
    for (let i = 0; i < count; i++) {
      const p = this.add.arc(x, y, Phaser.Math.Between(1, 3), 0, 360, false, color);
      this.physics.add.existing(p);
      const b = p.body as Phaser.Physics.Arcade.Body;
      if (b) {
        const speed = Phaser.Math.Between(50, 150);
        const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
        this.physics.velocityFromRotation(angle, speed, b.velocity);
      }

      this.tweens.add({
        targets: p,
        alpha: 0,
        scale: 0.1,
        duration: Phaser.Math.Between(300, 600),
        onComplete: () => p.destroy()
      });
    }
  }

  public update(time: number, delta: number) {
    this.bulletsGroup.getChildren().forEach((child: any) => {
      // Check borders
      if (child.active && (child.x < 0 || child.x > 1000 || child.y < 0 || child.y > 800)) {
        child.kill();
      }
    });

    // Clear and redraw active bullet projectile trails
    if (this.trailGraphics) {
      this.trailGraphics.clear();
      this.bulletsGroup.getChildren().forEach((child: any) => {
        const bullet = child as Bullet;
        if (bullet.active && bullet.trailHistory && bullet.trailHistory.length > 1) {
          const isPlayerOwned = bullet.getIsPlayerOwned();
          // Glow tracer colors to match Immersive UI specs
          const color = isPlayerOwned ? 0x0095ff : 0xff3e3e; // Blue vs Orange-Red
          
          for (let i = 1; i < bullet.trailHistory.length; i++) {
            const pt1 = bullet.trailHistory[i - 1];
            const pt2 = bullet.trailHistory[i];
            
            // Taper and fade calculations
            const progress = i / bullet.trailHistory.length;
            const alpha = progress * 0.55;
            const size = 1.0 + progress * 2.5;
            
            this.trailGraphics.lineStyle(size, color, alpha);
            this.trailGraphics.lineBetween(pt1.x, pt1.y, pt2.x, pt2.y);
          }
        }
      });
    }

    // Run custom entity loops
    this.player.update(time, this.bulletsGroup);
    
    const visible = this.visionSystem.hasLineOfSight(this.enemy.x, this.enemy.y, this.player.x, this.player.y, this.obstacles);
    
    this.enemy.update(
      time,
      this.player.x,
      this.player.y,
      visible,
      this.lastKnownPlayerPos,
      this.obstacles,
      this.bulletsGroup
    );

    // Call decision state engine updates
    this.aiManager.update(time, this.obstacles, this.bulletsGroup);

    // Respawn central healing item if needed
    if (!this.isHealPackActive && time > this.healthPackSpawnTimer) {
      this.spawnHealPackCenter();
    }

    // Cycle update status pipeline to React
    this.pushStatsToReact();
  }

  private pushStatsToReact() {
    if (this.onStatsChannel) {
      this.onStatsChannel({
        playerHp: this.player.hp,
        enemyHp: this.enemy.hp,
        distance: Math.round(Phaser.Math.Distance.Between(this.player.x, this.player.y, this.enemy.x, this.enemy.y)),
        playerVisible: this.visionSystem.hasLineOfSight(this.enemy.x, this.enemy.y, this.player.x, this.player.y, this.obstacles),
        aiState: this.enemy.aiState,
        aiMove: this.enemy.aiMoveStrategy,
        aiAttack: this.enemy.aiShouldAttack,
        healPadActive: this.isHealPackActive,
      });
    }
  }
}
