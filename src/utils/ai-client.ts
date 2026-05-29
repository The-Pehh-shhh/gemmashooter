import { GameState, MemoryStats, AIDecision } from "../types";

export interface AIResponse {
  decision: AIDecision;
  isFallback: boolean;
  error?: string;
  notice?: string;
}

const SYSTEM_PROMPT = `You are "Gemma", a competitive tactical CPU agent in a 2D Top-Down Shooter called Gemma Arena.
Your goal is to defeat the human player by making smart combat decisions.
You must respond with a JSON object.

TACTICAL STRATEGY ROLES:
- PATROL: Player not visible. Search around random zones.
- SEARCH: Player recently lost. Move to last known location.
- CHASE: Player visible but far. Advance to close distance.
- ATTACK: Player visible in range. Sidestep, shoot, and secure kill.
- RETREAT: Your health is low. Escape line of sight, run away.
- HIDE: Duck behind cover objects to ambush or shield.
- AMBUSH: Wait near cover/walls. Bait the player.
- FLANK: Circle around cover, cut off player.

MOVEMENT PLAN:
- PLAYER_POS: Move to player's position.
- LAST_KNOWN_POS: Move to player's last seen position.
- NEAREST_COVER: Move to nearest cover object.
- RUN_AWAY: Run away towards corners.
- RANDOM_PATROL: Search random zones of the map.
- AMBUSH_POINT: Stand solid behind walls.`;

function buildUserPrompt(gameState: GameState, memory: MemoryStats): string {
  return `
CURRENT GAME SNAPSHOT:
- Player HP: ${gameState.player.hp}
- Your HP: ${gameState.enemy.hp}
- Distance to Player: ${gameState.distanceToPlayer}px
- Player Visible: ${gameState.playerVisible}
- Bullets nearby: ${gameState.nearbyBullets}
- Obstacles nearby: ${gameState.coverAvailable}
- Current State: ${gameState.enemyState}

PLAYER HISTORIC BEHAVIOR PROFILE:
- Matches Played: ${memory?.gamesPlayed || 0}
- CPU Wins: ${memory?.aiWins || 0}
- Player Wins: ${memory?.playerWins || 0}
- Rushes counted: ${memory?.rushCount || 0}
- Sniper tactics seen: ${memory?.sniperCount || 0}
- Cover uses seen: ${memory?.coverUsage || 0}
- Calculated Aggression Tier: ${memory?.playerAggression || 'MEDIUM'}

Response MUST be a single parseable JSON object with the exact keys:
{
  "state": "PATROL" | "SEARCH" | "CHASE" | "ATTACK" | "RETREAT" | "HIDE" | "AMBUSH" | "FLANK",
  "move": "PLAYER_POS" | "LAST_KNOWN_POS" | "NEAREST_COVER" | "RUN_AWAY" | "RANDOM_PATROL" | "AMBUSH_POINT",
  "attack": true or false,
  "reason": "A 1-sentence explanation"
}`;
}

export async function getEnemyDecision(
  gameState: GameState,
  memory: MemoryStats
): Promise<AIResponse> {
  const backend = localStorage.getItem("gemma_ai_backend") || "gemini";
  
  if (backend === "ollama") {
    const rawUrl = localStorage.getItem("gemma_ollama_url") || "http://localhost:11434";
    const model = localStorage.getItem("gemma_ollama_model") || "gemma";
    
    // Standardize URL structure
    const baseUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
    
    try {
      const userPrompt = buildUserPrompt(gameState, memory);
      
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt }
          ],
          format: "json", // Instructs Ollama to guarantee a JSON output response
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama returned status ${response.status}`);
      }

      const data = await response.json();
      const contentText = data.message?.content?.trim() || "";
      
      // Parse decision or extract with regex fallback
      let decision: AIDecision;
      try {
        decision = JSON.parse(contentText);
      } catch (err) {
        // Fallback regex parsers for robust recovery
        const matchState = contentText.match(/"state"\s*:\s*"([A-Z_]+)"/i);
        const matchMove = contentText.match(/"move"\s*:\s*"([A-Z_]+)"/i);
        const matchAttack = contentText.match(/"attack"\s*:\s*(true|false)/i);
        const matchReason = contentText.match(/"reason"\s*:\s*"([^"]+)"/i);

        decision = {
          state: (matchState ? matchState[1].toUpperCase() : "CHASE") as any,
          move: (matchMove ? matchMove[1].toUpperCase() : "PLAYER_POS") as any,
          attack: matchAttack ? matchAttack[1] === "true" : true,
          reason: matchReason ? matchReason[1] : "Parsed via regex safety."
        };
      }

      // Keep type boundaries valid
      const allowedStates = ["PATROL", "SEARCH", "CHASE", "ATTACK", "RETREAT", "HIDE", "AMBUSH", "FLANK"];
      const allowedMoves = ["PLAYER_POS", "LAST_KNOWN_POS", "NEAREST_COVER", "RUN_AWAY", "RANDOM_PATROL", "AMBUSH_POINT"];

      if (!allowedStates.includes(decision.state)) decision.state = "CHASE" as any;
      if (!allowedMoves.includes(decision.move)) decision.move = "PLAYER_POS" as any;

      return {
        decision,
        isFallback: false,
        notice: `Connected to Local Ollama [${model}]`
      };
    } catch (error: any) {
      console.warn("Local Ollama connection failed. Suggest checking OLLAMA_ORIGINS.", error);
      
      // Give a super helpful error back so they can see why and configure it
      return {
        decision: {
          state: "PATROL",
          move: "RANDOM_PATROL",
          attack: false,
          reason: `Ollama connection error. Ensure Ollama runs locally: 'OLLAMA_ORIGINS="*" ollama serve'`
        },
        isFallback: true,
        error: `Ollama Connection Error: ${error.message || "Failed to fetch"}. Ensure local Ollama is active on ${baseUrl} and CORS is allowed.`
      };
    }
  }

  // DEFAULT PATH: Fetch from Cloud Gemini Proxy route
  try {
    const response = await fetch("/api/enemy/decide", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ gameState, memory }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: AIResponse = await response.json();
    return data;
  } catch (error: any) {
    console.warn("Notice: Switching to local fallback engine.", error.message || error);
    return {
      decision: {
        state: "PATROL",
        move: "RANDOM_PATROL",
        attack: false,
        reason: "Bypassed to local heuristics fallback engine.",
      },
      isFallback: true,
      error: error.message || "Network Error",
    };
  }
}
