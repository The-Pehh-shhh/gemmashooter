export interface PlayerStats {
  x: number;
  y: number;
  hp: number;
}

export interface EnemyStats {
  x: number;
  y: number;
  hp: number;
}

export interface GameState {
  player: PlayerStats;
  enemy: EnemyStats;
  distanceToPlayer: number;
  playerVisible: boolean;
  nearbyBullets: number;
  coverAvailable: boolean;
  enemyState: string;
}

export interface MemoryStats {
  rushCount: number;       // How many times player charged/rushed straight
  sniperCount: number;     // How many times player snipes from far (>400px)
  coverUsage: number;      // Player time or count hiding behind obstacles
  playerShotsFired: number;
  playerShotsHit: number;
  accuracy: number;        // Accuracy percent (hits / fired)
  playerAggression: 'LOW' | 'MEDIUM' | 'HIGH';
  gamesPlayed: number;
  aiWins: number;
  playerWins: number;
}

export interface AIDecision {
  state: 'PATROL' | 'SEARCH' | 'CHASE' | 'ATTACK' | 'RETREAT' | 'HIDE' | 'AMBUSH' | 'FLANK';
  move: 'PLAYER_POS' | 'LAST_KNOWN_POS' | 'NEAREST_COVER' | 'RUN_AWAY' | 'RANDOM_PATROL' | 'AMBUSH_POINT';
  attack: boolean;
  reason: string;
}

export interface GameLog {
  timestamp: string;
  state: GameState;
  decision: AIDecision;
}
