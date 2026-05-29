import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = 3000;

// Initialize Google GenAI if API key exists
let aiClient: GoogleGenAI | null = null;
const apiKey = process.env.GEMINI_API_KEY;

if (apiKey) {
  try {
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    console.log("Google GenAI client successfully initialized on server.");
  } catch (err) {
    console.error("Failed to initialize Google GenAI SDK:", err);
  }
} else {
  console.warn("WARNING: GEMINI_API_KEY is not defined. The game will run with local-fallback tactical decision logic.");
}

// Local Fallback Decision Maker in case AI is offline or key missing
function getLocalFallbackDecision(gameState: any, memory: any): any {
  const hp = gameState.enemy.hp;
  const playerHp = gameState.player.hp;
  const visible = gameState.playerVisible;
  const dist = gameState.distanceToPlayer;

  let state = "PATROL";
  let move = "RANDOM_PATROL";
  let attack = false;
  let reason = "Using tactical heuristic backend fallback.";

  if (hp <= 30) {
    state = "RETREAT";
    move = "RUN_AWAY";
    attack = visible && Math.random() < 0.4;
    reason = "Fallback: Critical HP! Backing off.";
  } else if (visible) {
    if (dist < 150) {
      state = "ATTACK";
      move = "NEAREST_COVER";
      attack = true;
      reason = "Fallback: Player too close! Engaging and finding cover.";
    } else {
      state = "CHASE";
      move = "PLAYER_POS";
      attack = true;
      reason = "Fallback: Player is spotted! Closing in to attack.";
    }
  } else {
    if (dist < 250) {
      state = "SEARCH";
      move = "LAST_KNOWN_POS";
      reason = "Fallback: Searching for player near last known location.";
    } else {
      state = "PATROL";
      move = "RANDOM_PATROL";
    }
  }

  // Adjust fallback based on memory
  if (memory && memory.playerAggression === "HIGH" && visible) {
    state = Math.random() > 0.5 ? "FLANK" : "HIDE";
    move = "NEAREST_COVER";
    reason += " (Adapting to Highly Aggressive player).";
  }

  return { state, move, attack, reason };
}

// Cooldown timestamp for the Gemini API circuit breaker (to handle 429 and 503 limits gracefully)
let geminiCooldownUntil = 0;

// REST route to handle AI decisions
app.post("/api/enemy/decide", async (req, res) => {
  const { gameState, memory } = req.body;

  if (!gameState) {
    return res.status(400).json({ error: "Missing gameState object" });
  }

  // If AI client is not available, use local fallback logic
  if (!aiClient) {
    const backupDecision = getLocalFallbackDecision(gameState, memory);
    return res.json({
      decision: backupDecision,
      isFallback: true,
      notice: "No GEMINI_API_KEY found. Running on highly optimized local heuristics."
    });
  }

  // Active circuit breaker check to avoid spamming the Gemini API during transient demand/quota overages
  if (Date.now() < geminiCooldownUntil) {
    const backupDecision = getLocalFallbackDecision(gameState, memory);
    return res.json({
      decision: backupDecision,
      isFallback: true,
      notice: `Circuit breaker active. Next fallback evaluation in ${Math.round((geminiCooldownUntil - Date.now()) / 1000)}s.`
    });
  }

  try {
    const systemPrompt = `You are "Gemma", a highly competitive tactical CPU agent in a 2D Top-Down Shooter called Gemma Arena.
Your objective is to defeat the human player by selecting optimal combat states.
You are given the current Game State and a memory record of the player's historic behaviors.

TACTICAL STRATEGY ROLES:
- PATROL: Player not visible. Cruise around corners to search, avoid getting shot.
- SEARCH: Player recently lost. Head to Player's last known location.
- CHASE: Player visible but outside ideal range. Advance to close distance.
- ATTACK: Player visible in range. Sidestep, shoot continuously, secure kill.
- RETREAT: Your health is dangerously low. Escape line of sight, run away.
- HIDE: Duck behind cover objects to ambush or shield.
- AMBUSH: Wait near cover/walls. Bait the player.
- FLANK: Circle around cover, cut off player's escape line.

MOVEMENT INSTRUCTIONS:
- PLAYER_POS: Move directly towards player's position.
- LAST_KNOWN_POS: Head to player's last seen position.
- NEAREST_COVER: Find cover block to break line of sight.
- RUN_AWAY: Move directly away from player towards corners.
- RANDOM_PATROL: Search random zones of the map.
- AMBUSH_POINT: Stand behind solid walls.

Choose strategies to counter player habits.
For instance:
- If player snipes (sniperCount high), hide behind cover to force them close, or flank.
- If player is super aggressive (rushCount high/rushes), hide/ambush near walls then strike, or retreat and shoot.
- If your HP is low, avoid direct face-to-face combat (use RETREAT or HIDE).`;

    const userPrompt = `
CURRENT GAME STATE:
- Player Position: (${Math.round(gameState.player.x)}, ${Math.round(gameState.player.y)})
- Player HP: ${gameState.player.hp}
- Your Position: (${Math.round(gameState.enemy.x)}, ${Math.round(gameState.enemy.y)})
- Your HP: ${gameState.enemy.hp}
- Distance to Player: ${Math.round(gameState.distanceToPlayer)}
- Player Visible (Line of Sight): ${gameState.playerVisible}
- Bullets nearby: ${gameState.nearbyBullets}
- Obstacles/Cover nearby: ${gameState.coverAvailable}
- Current State: ${gameState.enemyState}

PLAYER HISTORIC MEMORY:
- Matches Played: ${memory?.gamesPlayed || 0}
- CPU Wins: ${memory?.aiWins || 0}
- Player Wins: ${memory?.playerWins || 0}
- Player Aggressive Rushes: ${memory?.rushCount || 0}
- Player Sniping Tactics: ${memory?.sniperCount || 0}
- Player Cover Usage Count: ${memory?.coverUsage || 0}
- Player Shots Fired: ${memory?.playerShotsFired || 0}
- Player Accuracy: ${Math.round((memory?.accuracy || 0) * 100)}%
- Calculated Aggression Tier: ${memory?.playerAggression || 'MEDIUM'}

Analyze the situation and select the best tactical action. Respond exactly with the requested JSON schema.`;

    const response = await aiClient.models.generateContent({
      model: "gemini-3.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.3,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            state: {
              type: Type.STRING,
              description: "Must be exactly one of: PATROL, SEARCH, CHASE, ATTACK, RETREAT, HIDE, AMBUSH, FLANK"
            },
            move: {
              type: Type.STRING,
              description: "Must be exactly one of: PLAYER_POS, LAST_KNOWN_POS, NEAREST_COVER, RUN_AWAY, RANDOM_PATROL, AMBUSH_POINT"
            },
            attack: {
              type: Type.BOOLEAN,
              description: "Whether the AI should fire towards the player if visible or suspected."
            },
            reason: {
              type: Type.STRING,
              description: "A short, 1-sentence tactical explanation of why this decision was made."
            }
          },
          required: ["state", "move", "attack", "reason"]
        }
      }
    });

    const bodyText = response.text?.trim() || "";
    // Parse response
    let decision = JSON.parse(bodyText);

    // Sanitize values to match enums
    const allowedStates = ["PATROL", "SEARCH", "CHASE", "ATTACK", "RETREAT", "HIDE", "AMBUSH", "FLANK"];
    const allowedMoves = ["PLAYER_POS", "LAST_KNOWN_POS", "NEAREST_COVER", "RUN_AWAY", "RANDOM_PATROL", "AMBUSH_POINT"];

    if (!allowedStates.includes(decision.state)) {
      decision.state = "PATROL";
    }
    if (!allowedMoves.includes(decision.move)) {
      decision.move = "RANDOM_PATROL";
    }

    res.json({
      decision,
      isFallback: false
    });

  } catch (err: any) {
    const rawErrorString = err.message || JSON.stringify(err) || "";
    
    // Check if it's a rate limit (429) or high demand limit (503)
    if (rawErrorString.includes("429") || rawErrorString.includes("503") || rawErrorString.includes("RESOURCE_EXHAUSTED") || rawErrorString.includes("UNAVAILABLE")) {
      geminiCooldownUntil = Date.now() + 30000; // Enforce a 30 seconds local cooling down period
      console.warn("Gemini API overloaded or limited. Activated 30s local-only circuit breaker. Details:", rawErrorString);
    } else {
      console.warn("Gemini API connection bypassed gracefully. Details:", rawErrorString);
    }

    // Graceful fallback response
    const backupDecision = getLocalFallbackDecision(gameState, memory);
    res.json({
      decision: backupDecision,
      isFallback: true,
      error: rawErrorString || "Failed to contact Gemini servers."
    });
  }
});

// Configure Vite or Static Asset delivery
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express custom server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
