import Phaser from "phaser";
import { GameState, MemoryStats, AIDecision, GameLog } from "../types";
import { getEnemyDecision } from "../utils/ai-client";
import { Enemy } from "./Enemy";
import { Player } from "./Player";
import { MemorySystem } from "./MemorySystem";
import { VisionSystem } from "./VisionSystem";

export class AIManager {
  private sceneRef: Phaser.Scene;
  private enemy: Enemy;
  private player: Player;
  private memorySystem: MemorySystem;
  private visionSystem: VisionSystem;

  private decisionInterval: number = 3000; // ms (every 3 seconds)
  private lastDecisionTime: number = 0;
  private isProcessingDecision: boolean = false;

  // Callback to push decision changes up to the React dashboard layer
  private onDecisionLoggedCallback?: (log: GameLog, isFallback: boolean) => void;

  constructor(
    scene: Phaser.Scene,
    enemy: Enemy,
    player: Player,
    memorySystem: MemorySystem,
    visionSystem: VisionSystem,
    onDecisionLogged?: (log: GameLog, isFallback: boolean) => void
  ) {
    this.sceneRef = scene;
    this.enemy = enemy;
    this.player = player;
    this.memorySystem = memorySystem;
    this.visionSystem = visionSystem;
    this.onDecisionLoggedCallback = onDecisionLogged;
  }

  public update(time: number, obstacles: Phaser.Physics.Arcade.StaticGroup, bulletsGroup: Phaser.Physics.Arcade.Group) {
    // Wait until game is active
    if (this.player.hp <= 0 || this.enemy.hp <= 0) return;

    if (time > this.lastDecisionTime + this.decisionInterval) {
      if (!this.isProcessingDecision) {
        this.triggerAIDecision(obstacles, bulletsGroup);
      }
      this.lastDecisionTime = time;
    }
  }

  private async triggerAIDecision(
    obstacles: Phaser.Physics.Arcade.StaticGroup,
    bulletsGroup: Phaser.Physics.Arcade.Group
  ) {
    this.isProcessingDecision = true;

    // 1. Gather current gameplay metrics
    const distanceToPlayer = Phaser.Math.Distance.Between(this.enemy.x, this.enemy.y, this.player.x, this.player.y);
    const isPlayerVisible = this.visionSystem.hasLineOfSight(
      this.enemy.x,
      this.enemy.y,
      this.player.x,
      this.player.y,
      obstacles
    );

    // Calculate count of nearby active bullets within 180px threat circle
    let nearbyBulletsCount = 0;
    bulletsGroup.getChildren().forEach((child: any) => {
      if (child.active) {
        const d = Phaser.Math.Distance.Between(this.enemy.x, this.enemy.y, child.x, child.y);
        // Only count player-owned hostile incoming threats
        if (d < 185 && child.getIsPlayerOwned && child.getIsPlayerOwned()) {
          nearbyBulletsCount++;
        }
      }
    });

    // Check if cover objects are structurally nearby (< 200px)
    let coverAvailable = false;
    obstacles.getChildren().forEach((child: any) => {
      const d = Phaser.Math.Distance.Between(this.enemy.x, this.enemy.y, child.x, child.y);
      if (d < 220) {
        coverAvailable = true;
      }
    });

    // Capture precise snapshot state
    const gameState: GameState = {
      player: {
        x: Math.round(this.player.x),
        y: Math.round(this.player.y),
        hp: this.player.hp,
      },
      enemy: {
        x: Math.round(this.enemy.x),
        y: Math.round(this.enemy.y),
        hp: this.enemy.hp,
      },
      distanceToPlayer: Math.round(distanceToPlayer),
      playerVisible: isPlayerVisible,
      nearbyBullets: nearbyBulletsCount,
      coverAvailable,
      enemyState: this.enemy.aiState,
    };

    const memoryStats = this.memorySystem.getStats();

    // 2. Query Gemini / Express REST endpoint
    const result = await getEnemyDecision(gameState, memoryStats);

    // 3. Extract and enforce AI configuration values
    const choice = result.decision;

    // Apply decision parameters back to the Arena Enemy Object
    this.enemy.aiState = choice.state;
    this.enemy.aiMoveStrategy = choice.move;
    this.enemy.aiShouldAttack = choice.attack;

    // Track last seen coordinates when player is spotted
    if (isPlayerVisible) {
      const sceneAny = this.sceneRef as any;
      if (sceneAny.lastKnownPlayerPos) {
        sceneAny.lastKnownPlayerPos.set(this.player.x, this.player.y);
      }
    }

    // 4. Log payload updates back up to the stats context
    if (this.onDecisionLoggedCallback) {
      const logItem: GameLog = {
        timestamp: new Date().toLocaleTimeString(),
        state: gameState,
        decision: choice,
      };
      this.onDecisionLoggedCallback(logItem, result.isFallback);
    }

    this.isProcessingDecision = false;
  }

  public setDecisionInterval(durationMs: number) {
    this.decisionInterval = Math.max(1000, durationMs); // Keep safe bounds > 1s
  }
}
