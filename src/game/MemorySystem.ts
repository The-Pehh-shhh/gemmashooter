import { MemoryStats } from "../types";

export class MemorySystem {
  private stats: MemoryStats;
  private readonly STORAGE_KEY = "gemma_shooter_memory";

  constructor() {
    this.stats = this.loadMemory();
  }

  private loadMemory(): MemoryStats {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          rushCount: parsed.rushCount ?? 0,
          sniperCount: parsed.sniperCount ?? 0,
          coverUsage: parsed.coverUsage ?? 0,
          playerShotsFired: parsed.playerShotsFired ?? 0,
          playerShotsHit: parsed.playerShotsHit ?? 0,
          accuracy: parsed.accuracy ?? 0,
          playerAggression: parsed.playerAggression ?? "MEDIUM",
          gamesPlayed: parsed.gamesPlayed ?? 0,
          aiWins: parsed.aiWins ?? 0,
          playerWins: parsed.playerWins ?? 0,
        };
      }
    } catch (e) {
      console.error("Failed to load local statistics:", e);
    }

    return {
      rushCount: 0,
      sniperCount: 0,
      coverUsage: 0,
      playerShotsFired: 0,
      playerShotsHit: 0,
      accuracy: 0,
      playerAggression: "MEDIUM",
      gamesPlayed: 0,
      aiWins: 0,
      playerWins: 0,
    };
  }

  public getStats(): MemoryStats {
    return { ...this.stats };
  }

  public saveMemory(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.stats));
    } catch (e) {
      console.error("Failed to persist stats locally:", e);
    }
  }

  public recordShotFired(): void {
    this.stats.playerShotsFired++;
    this.updateAccuracy();
    this.saveMemory();
  }

  public recordShotHit(): void {
    this.stats.playerShotsHit++;
    this.updateAccuracy();
    this.saveMemory();
  }

  private updateAccuracy(): void {
    if (this.stats.playerShotsFired > 0) {
      this.stats.accuracy = this.stats.playerShotsHit / this.stats.playerShotsFired;
    } else {
      this.stats.accuracy = 0;
    }
    this.recalculateAggression();
  }

  public recordRush(): void {
    this.stats.rushCount++;
    this.recalculateAggression();
    this.saveMemory();
  }

  public recordSniperShot(): void {
    this.stats.sniperCount++;
    this.recalculateAggression();
    this.saveMemory();
  }

  public recordCoverUse(): void {
    this.stats.coverUsage++;
    this.recalculateAggression();
    this.saveMemory();
  }

  public recordGameCount(winner: "player" | "ai"): void {
    this.stats.gamesPlayed++;
    if (winner === "player") {
      this.stats.playerWins++;
    } else {
      this.stats.aiWins++;
    }
    this.saveMemory();
  }

  private recalculateAggression(): void {
    // Aggression category computation based on behavior counts
    const rush = this.stats.rushCount;
    const sniper = this.stats.sniperCount;
    const covers = this.stats.coverUsage;

    const totalActions = rush + sniper + covers;
    if (totalActions < 5) {
      this.stats.playerAggression = "MEDIUM";
      return;
    }

    const rushRatio = rush / totalActions;
    if (rushRatio > 0.5) {
      this.stats.playerAggression = "HIGH";
    } else if (rushRatio < 0.25 && sniper > covers) {
      this.stats.playerAggression = "LOW"; // Passive sniper
    } else {
      this.stats.playerAggression = "MEDIUM";
    }
  }

  public clearMemory(): void {
    this.stats = {
      rushCount: 0,
      sniperCount: 0,
      coverUsage: 0,
      playerShotsFired: 0,
      playerShotsHit: 0,
      accuracy: 0,
      playerAggression: "MEDIUM",
      gamesPlayed: 0,
      aiWins: 0,
      playerWins: 0,
    };
    this.saveMemory();
  }
}
