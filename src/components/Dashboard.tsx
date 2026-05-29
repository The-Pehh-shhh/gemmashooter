import React, { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { GameScene } from "../game/GameScene";
import { MemorySystem } from "../game/MemorySystem";
import { GameLog, MemoryStats } from "../types";
import { 
  Shield, 
  Brain, 
  Trash2, 
  Activity, 
  Eye, 
  EyeOff, 
  Crosshair, 
  Sliders, 
  ListRestart, 
  TrendingUp, 
  ChevronRight, 
  HelpCircle,
  Cpu
} from "lucide-react";

export default function Dashboard() {
  const gameRef = useRef<Phaser.Game | null>(null);
  const memorySystemRef = useRef<MemorySystem>(new MemorySystem());

  // Real-time telemetry pulled from Phaser callbacks
  const [telemetry, setTelemetry] = useState({
    playerHp: 100,
    enemyHp: 100,
    distance: 0,
    playerVisible: false,
    aiState: "PATROL",
    aiMove: "RANDOM_PATROL",
    aiAttack: false,
    healPadActive: true,
  });

  // Memory metrics persisted in localStorage
  const [memoryStats, setMemoryStats] = useState<MemoryStats>({
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
  });

  // Dynamic decision-making interval speed input
  const [decisionSpeed, setDecisionSpeed] = useState<number>(3); // seconds
  const [logs, setLogs] = useState<Array<{ log: GameLog; isFallback: boolean }>>([]);

  // Local Ollama & Cloud Gemini Engine config
  const [aiBackend, setAiBackend] = useState<"gemini" | "ollama">(() => {
    return (localStorage.getItem("gemma_ai_backend") as "gemini" | "ollama") || "gemini";
  });
  const [ollamaUrl, setOllamaUrl] = useState<string>(() => {
    return localStorage.getItem("gemma_ollama_url") || "http://localhost:11434";
  });
  const [ollamaModel, setOllamaModel] = useState<string>(() => {
    return localStorage.getItem("gemma_ollama_model") || "gemma";
  });

  useEffect(() => {
    localStorage.setItem("gemma_ai_backend", aiBackend);
  }, [aiBackend]);

  useEffect(() => {
    localStorage.setItem("gemma_ollama_url", ollamaUrl);
  }, [ollamaUrl]);

  useEffect(() => {
    localStorage.setItem("gemma_ollama_model", ollamaModel);
  }, [ollamaModel]);

  // Setup game loops and load stored memory state on render
  useEffect(() => {
    // Populate Initial Memory
    setMemoryStats(memorySystemRef.current.getStats());

    // Phaser Game Config
    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: 1000,
      height: 800,
      parent: "phaser-canvas-parent",
      physics: {
        default: "arcade",
        arcade: {
          gravity: { x: 0, y: 0 },
          debug: false,
        },
      },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [GameScene],
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    // Trigger scene launching parameters
    game.scene.start("GemmaGameScene", {
      memorySystem: memorySystemRef.current,
      onDecisionLogged: (log: GameLog, isFallback: boolean) => {
        setLogs((prev) => [
          { log, isFallback },
          ...prev.slice(0, 19), // Cap logs list size for memory efficiency
        ]);
        // Read updated memory scores
        setMemoryStats(memorySystemRef.current.getStats());
      },
      onStatsChannel: (pStats: any) => {
        setTelemetry({ ...pStats });
      },
    });

    // Cleanup Phaser instance on component unmounting
    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  // Update AI update frequency
  const handleSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setDecisionSpeed(val);
    if (gameRef.current) {
      const sceneAny = gameRef.current.scene.getScene("GemmaGameScene") as GameScene | null;
      if (sceneAny && sceneAny.aiManager) {
        sceneAny.aiManager.setDecisionInterval(val * 1000);
      }
    }
  };

  // Completely wipe local adaptive memory
  const handleWipeMemory = () => {
    if (confirm("Are you sure you want to clear stored AI Gemma telemetry? This will reset adaptive heuristics for the CPU.")) {
      memorySystemRef.current.clearMemory();
      setMemoryStats(memorySystemRef.current.getStats());
      if (gameRef.current) {
        const sceneAny = gameRef.current.scene.getScene("GemmaGameScene") as GameScene | null;
        if (sceneAny) {
          sceneAny.manualResetAll();
        }
      }
      setLogs([]);
    }
  };

  // Push custom reset action
  const handleRestartMatch = () => {
    if (gameRef.current) {
      const sceneAny = gameRef.current.scene.getScene("GemmaGameScene") as GameScene | null;
      if (sceneAny) {
        (sceneAny as any).resetMatch();
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#050507] text-[#e0e0e0] flex flex-col font-sans overflow-x-hidden selection:bg-orange-500/30 selection:text-white">
      
      {/* Header / Status Bar */}
      <header className="h-16 md:h-12 bg-[#0c0c12] border-b border-[#252530] flex flex-col md:flex-row items-center justify-between px-6 py-2 md:py-0 shrink-0 gap-2 md:gap-0 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981] animate-pulse"></div>
          <span className="text-xs font-mono tracking-widest text-emerald-500 uppercase font-bold">
            System Online: GEMMA-2B_DECISION_ENGINE
          </span>
        </div>
        
        {/* Global Action controls */}
        <div className="flex items-center gap-4 text-[10px] font-mono text-slate-500 uppercase">
          <div className="flex gap-1.5 items-center">
            <span>FPS:</span>
            <span className="text-white bg-slate-800/80 px-1.5 py-0.5 rounded">60.0</span>
          </div>
          <div className="flex gap-1.5 items-center">
            <span>Latency:</span>
            <span className="text-white bg-slate-800/80 px-1.5 py-0.5 rounded">142ms</span>
          </div>
          <div className="flex gap-1.5 items-center">
            <span>Arena:</span>
            <span className="text-white bg-slate-800/80 px-1.5 py-0.5 rounded">Sector_09</span>
          </div>
          <div className="h-4 w-px bg-[#252530] hidden md:block" />
          <button
            onClick={handleRestartMatch}
            className="flex items-center gap-1.5 bg-[#1a1a24] hover:bg-[#252530] border border-[#2d2d3d] px-2.5 py-1 rounded text-slate-300 font-mono text-[9px] cursor-pointer transition-colors"
          >
            <ListRestart size={11} className="text-[#10b981]" />
            RELOAD_ARENA
          </button>
          <button
            onClick={handleWipeMemory}
            className="flex items-center gap-1.5 bg-[#ff3e3e]/10 hover:bg-[#ff3e3e]/20 border border-[#ff3e3e]/30 px-2.5 py-1 rounded text-[#ff3e3e] font-mono text-[9px] cursor-pointer transition-colors"
          >
            <Trash2 size={11} />
            WIPE_BRAIN
          </button>
        </div>
      </header>

      {/* Main Grid Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 pb-20">
        
        {/* Playable Phaser Canvas Screen */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <div className="relative bg-[#0a0a0f] rounded-lg border border-[#252530] p-0 overflow-hidden shadow-2xl flex flex-col">
            
            {/* Grid Overlay inside card wrapper */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[radial-gradient(#252530_1px,transparent_1px)] [background-size:32px_32px]"></div>

            {/* Direct Heads up stats display bar */}
            <div className="bg-[#0c0c12]/90 border-b border-[#252530] px-4 py-3 flex items-center justify-between text-xs font-mono relative z-10">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#0095ff] shadow-[0_0_6px_#0095ff]" />
                  <span className="text-slate-400">PLAYER_HUMAN:</span>
                  <span className="font-bold text-[#0095ff]">{telemetry.playerHp}% HP</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#ff3e3e] shadow-[0_0_6px_#ff3e3e]" />
                  <span className="text-slate-400">GEMMA_AGENT:</span>
                  <span className="font-bold text-[#ff3e3e]">{telemetry.enemyHp}% HP</span>
                </div>
              </div>

              <div className="flex items-center gap-4 text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Crosshair size={11} className="text-slate-600" />
                  RANGE: <b className="text-[#e0e0e0]">{telemetry.distance}px</b>
                </span>
                <span className="flex items-center gap-1.5 flex-wrap">
                  {telemetry.playerVisible ? (
                    <>
                      <Eye size={12} className="text-[#0095ff]" />
                      LOS: <b className="text-[#0095ff]">SPOT_VISIBLE</b>
                    </>
                  ) : (
                    <>
                      <EyeOff size={11} className="text-slate-600" />
                      LOS: <b className="text-slate-500">BLOCKED_COVER</b>
                    </>
                  )}
                </span>
                <span className="bg-[#1a1a24] text-[9px] text-[#ff3e3e] px-2 py-0.5 border border-[#2d2d3d]/50 rounded font-mono uppercase font-semibold">
                  STATE: {telemetry.aiState}
                </span>
              </div>
            </div>

            {/* Mount container for Phaser Canvas */}
            <div 
              id="phaser-canvas-parent" 
              className="w-full bg-[#050507] flex justify-center items-center overflow-hidden aspect-[5/4] max-h-[500px]"
            />

            {/* Key instructions banner */}
            <div className="bg-[#0c0c12]/80 border-t border-[#252530] px-4 py-2 text-[10px] font-mono text-slate-500 flex flex-wrap justify-between items-center gap-3 relative z-10">
              <span className="flex items-center gap-1">
                CONTROLS: 
                <span className="bg-[#1a1a24] border border-[#2d2d3d] px-1 py-0.5 rounded text-slate-300 font-bold ml-1">W</span>
                <span className="bg-[#1a1a24] border border-[#2d2d3d] px-1 py-0.5 rounded text-slate-300 font-bold">A</span>
                <span className="bg-[#1a1a24] border border-[#2d2d3d] px-1 py-0.5 rounded text-slate-300 font-bold">S</span>
                <span className="bg-[#1a1a24] border border-[#2d2d3d] px-1 py-0.5 rounded text-slate-300 font-bold">D</span>
                <span className="text-slate-500 ml-1">VECTOR_MOVE</span>
              </span>
              <span className="text-slate-700 hidden sm:block">|</span>
              <span className="flex items-center gap-1">
                AIM: <span className="text-slate-350">MOUSE_AXIS</span>
              </span>
              <span className="text-slate-700 hidden sm:block">|</span>
              <span className="flex items-center gap-1 col-span-2">
                ACTION: 
                <span className="bg-[#1a1a24] border border-[#2d2d3d] px-1.5 py-0.5 rounded text-slate-300 font-semibold uppercase font-mono ml-1">LEFT_CLICK</span>
                <span className="text-slate-500">WEAPON_FIRE</span>
              </span>
            </div>
          </div>

          {/* Quick Stats overview panel */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[#0c0c12] border border-[#252530] rounded-lg p-3.5 flex flex-col justify-between">
              <span className="text-[9px] text-slate-500 uppercase tracking-widest font-mono">BATTLES_COUNT</span>
              <span className="text-xl font-mono text-slate-300 mt-1">{memoryStats.gamesPlayed}</span>
            </div>
            <div className="bg-[#0c0c12] border border-[#252530] rounded-lg p-3.5 flex flex-col justify-between">
              <span className="text-[9px] text-slate-500 uppercase tracking-widest font-mono text-emerald-500">HUMAN_WINS</span>
              <span className="text-xl font-mono text-emerald-500 mt-1">{memoryStats.playerWins}</span>
            </div>
            <div className="bg-[#0c0c12] border border-[#252530] rounded-lg p-3.5 flex flex-col justify-between">
              <span className="text-[9px] text-slate-500 uppercase tracking-widest font-mono text-[#ff3e3e]">GEMMA_WINS</span>
              <span className="text-xl font-mono text-[#ff3e3e] mt-1">{memoryStats.aiWins}</span>
            </div>
            <div className="bg-[#0c0c12] border border-[#252530] rounded-lg p-3.5 flex flex-col justify-between">
              <span className="text-[9px] text-slate-500 uppercase tracking-widest font-mono font-sans">MY_ACCURACY</span>
              <span className="text-xl font-mono text-[#0095ff] mt-1">
                {Math.round(memoryStats.accuracy * 100)}%
              </span>
            </div>
          </div>
        </div>

        {/* AI Sidebar (Gemma Monitor on the right) */}
        <aside className="lg:col-span-4 bg-[#0c0c12] border border-[#252530] rounded-lg flex flex-col p-4 gap-4 shrink-0 overflow-hidden shadow-lg">
          
          <div className="space-y-1">
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <Brain size={12} className="text-emerald-500" />
              AI Brain Trace
            </h2>
            <div className="h-[1px] w-full bg-gradient-to-r from-[#252530] to-transparent"></div>
          </div>

          {/* Gemma Real-time prompt response stream */}
          <div className="bg-[#050507] border border-[#1a1a24] p-3.5 rounded-lg overflow-hidden">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[9px] font-mono text-emerald-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                PROMPT_RESPONSE.JSON
              </span>
              <span className={`text-[8px] px-1.5 py-0.5 rounded font-mono ${
                logs.length > 0 && logs[0].isFallback 
                ? "bg-amber-500/10 text-amber-500" 
                : "bg-emerald-500/10 text-emerald-500"
              }`}>
                {logs.length > 0 ? (logs[0].isFallback ? "FALLBACK" : "ACTIVE_VALID") : "WAITING"}
              </span>
            </div>
            
            {logs.length > 0 ? (
              <pre className="text-[10.5px] font-mono text-[#38bdf8] leading-relaxed overflow-x-auto max-h-[140px] whitespace-pre-wrap font-sans">
                {`{\n  "state": "${logs[0].log.decision.state}",\n  "move": "${logs[0].log.decision.move}",\n  "attack": ${logs[0].log.decision.attack},\n  "reason": "${logs[0].log.decision.reason}"\n}`}
              </pre>
            ) : (
              <pre className="text-[10.5px] font-mono text-slate-600 leading-relaxed font-sans">
                {`{\n  "state": "IDLE",\n  "move": "STANDBY",\n  "attack": false,\n  "reason": "Establishing telemetry..."\n}`}
              </pre>
            )}
          </div>

          {/* Memory System Values Progress Bars */}
          <div className="space-y-3.5 py-1">
            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px] uppercase font-mono tracking-wider text-slate-400">
                <span>Player Aggression</span>
                <span className={memoryStats.playerAggression === "HIGH" ? "text-red-500 font-bold" : "text-emerald-500 font-bold"}>
                  {memoryStats.playerAggression}
                </span>
              </div>
              <div className="h-1.5 w-full bg-[#1a1a24] rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-500 ${
                    memoryStats.playerAggression === "HIGH" ? "bg-[#ff3e3e]" :
                    memoryStats.playerAggression === "LOW" ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                  style={{ width: memoryStats.playerAggression === "HIGH" ? "88%" : memoryStats.playerAggression === "MEDIUM" ? "50%" : "22%" }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px] uppercase font-mono tracking-wider text-slate-400">
                <span>Direct Rushes frequency</span>
                <span className="text-white font-mono">{memoryStats.rushCount} units</span>
              </div>
              <div className="h-1.5 w-full bg-[#1a1a24] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[#0095ff] transition-all duration-500" 
                  style={{ width: `${Math.min(100, Math.max(8, (memoryStats.rushCount / (memoryStats.gamesPlayed || 1)) * 100))}%` }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px] uppercase font-mono tracking-wider text-slate-400">
                <span>Cover Usage coefficient</span>
                <span className="text-white font-mono">{memoryStats.coverUsage} points</span>
              </div>
              <div className="h-1.5 w-full bg-[#1a1a24] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 transition-all duration-500" 
                  style={{ width: `${Math.min(100, Math.max(12, (memoryStats.coverUsage / (memoryStats.gamesPlayed * 2 || 1)) * 100))}%` }}
                />
              </div>
            </div>
          </div>

          {/* AI Decision Timeline */}
          <div className="flex-1 flex flex-col gap-2 overflow-hidden min-h-[160px]">
            <h3 className="text-[9px] uppercase font-bold text-slate-500 font-mono tracking-wider">Strategic Decision History Log</h3>
            <div className="flex-1 space-y-2 overflow-y-auto text-[10px] font-mono pr-1 scrollbar-thin">
              {logs.length === 0 ? (
                <div className="text-slate-600 text-[10px] py-1 border-l border-slate-700 pl-3">
                  [T+000s] Listening for match strategic events...
                </div>
              ) : (
                logs.slice(0, 5).map((item, idx) => {
                  let borderClass = "border-slate-700 text-slate-450";
                  let bgClass = "";
                  
                  if (item.log.decision.state === "ATTACK" || item.log.decision.state === "CHASE") {
                    borderClass = "border-[#ff3e3e] text-red-250";
                    bgClass = "bg-[#ff3e3e]/5";
                  } else if (item.log.decision.state === "RETREAT" || item.log.decision.state === "HIDE") {
                    borderClass = "border-amber-500 text-amber-250";
                    bgClass = "bg-amber-500/5";
                  } else if (item.log.decision.state === "PATROL" || item.log.decision.state === "SEARCH") {
                    borderClass = "border-emerald-500 text-emerald-250";
                    bgClass = "bg-emerald-500/5";
                  }

                  return (
                    <div key={idx} className={`border-l-2 ${borderClass} pl-3 py-1.5 ${bgClass} rounded-r`}>
                      <span className="opacity-50 font-semibold font-mono">[{item.log.timestamp}]</span> Gemma: Tactical state configured to <b className="font-bold">{item.log.decision.state}</b> via <span className="opacity-75">{item.log.decision.move}</span>.
                      <div className="text-[9.5px] opacity-80 mt-0.5 text-slate-400">
                        &ldquo;{item.log.decision.reason}&rdquo;
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Intelligence Engine Backend Selector Panel */}
          <div className="pt-3 border-t border-[#1a1a24] flex flex-col gap-2">
            <div className="flex justify-between items-center text-[10px] font-mono uppercase text-[#e0e0e0]">
              <span className="flex items-center gap-1">
                <Sliders size={11} className="text-[#0095ff]" />
                Neural Decision Engine
              </span>
              <span className="text-[9px] text-slate-500 font-normal">Active Backend</span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 bg-[#050507] p-1 border border-[#1a1a24] rounded">
              <button
                type="button"
                onClick={() => setAiBackend("gemini")}
                className={`py-1 text-[9.5px] font-semibold font-mono rounded transition-colors uppercase cursor-pointer ${
                  aiBackend === "gemini"
                    ? "bg-[#0095ff] text-white"
                    : "text-slate-500 hover:text-slate-300 hover:bg-[#0c0c12]"
                }`}
              >
                Gemini Cloud
              </button>
              <button
                type="button"
                onClick={() => setAiBackend("ollama")}
                className={`py-1 text-[9.5px] font-semibold font-mono rounded transition-colors uppercase cursor-pointer ${
                  aiBackend === "ollama"
                    ? "bg-[#10b981] text-white shadow-[0_0_8px_rgba(16,185,129,0.2)]"
                    : "text-slate-500 hover:text-slate-300 hover:bg-[#0c0c12]"
                }`}
              >
                Ollama Local
              </button>
            </div>

            {aiBackend === "ollama" && (
              <div className="bg-[#050507] border border-[#1a1a24] p-2.5 rounded flex flex-col gap-2 mt-0.5 text-[10px] font-sans">
                <div className="flex flex-col gap-1">
                  <span className="text-slate-400 font-mono text-[9px] uppercase">Ollama Host URL</span>
                  <input
                    type="text"
                    value={ollamaUrl}
                    onChange={(e) => setOllamaUrl(e.target.value)}
                    placeholder="http://localhost:11434"
                    className="bg-[#0c0c12] border border-[#252530] rounded px-2 py-1 text-slate-200 text-xs font-mono focus:outline-none focus:border-[#10b981]"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-slate-400 font-mono text-[9px] uppercase font-sans">Ollama Model / Tag</span>
                  <input
                    type="text"
                    value={ollamaModel}
                    onChange={(e) => setOllamaModel(e.target.value)}
                    placeholder="gemma"
                    className="bg-[#0c0c12] border border-[#252530] rounded px-2 py-1 text-slate-200 text-xs font-mono focus:outline-none focus:border-[#10b981]"
                  />
                </div>

                <div className="border border-slate-900 pt-2 mt-1 flex flex-col gap-1 text-[8.5px] font-mono text-slate-500 bg-[#0c0c12] p-2 rounded">
                  <div className="text-slate-400 uppercase font-bold text-[8px] tracking-wide mb-0.5">Local Launch command</div>
                  <div>$ OLLAMA_ORIGINS=&quot;*&quot; ollama serve</div>
                  <div>$ ollama run {ollamaModel || "gemma"}</div>
                </div>
              </div>
            )}
          </div>

          {/* Prompt Pace / Tune Panel as footer details inside sidebar */}
          <div className="pt-2 border-t border-[#1a1a24] flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-[10px] font-mono uppercase text-[#e0e0e0]">
              <span>Gemma Decision interval</span>
              <span className="text-emerald-500 font-semibold">{decisionSpeed}s interval</span>
            </div>
            <input
              type="range"
              min="1.5"
              max="5"
              step="0.5"
              value={decisionSpeed}
              onChange={handleSpeedChange}
              className="w-full accent-emerald-550 bg-[#1a1a24] h-1.5 rounded cursor-pointer"
            />
          </div>
        </aside>
      </main>

      {/* Retro bottom HUD footer status display */}
      <footer className="h-12 bg-[#08080c] border-t border-[#1a1a24] flex items-center px-6 gap-6 md:gap-12 shrink-0 text-xs font-mono fixed bottom-0 left-0 w-full z-40 bg-opacity-95 backdrop-blur-md">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] text-slate-500 uppercase font-bold">DECISION_INTERVAL</span>
          <span className="text-sm font-bold text-white font-mono">{decisionSpeed}.0s</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] text-slate-500 uppercase font-bold">PLAYER_HP</span>
          <span className="text-sm font-bold text-[#0095ff] font-mono">{telemetry.playerHp} / 100</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] text-slate-500 uppercase font-bold text-slate-500">ENEMY_HP</span>
          <span className="text-sm font-bold text-[#ff3e3e] font-mono">{telemetry.enemyHp} / 100</span>
        </div>
        <div className="ml-auto hidden md:flex gap-6">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${telemetry.playerVisible ? "bg-[#0095ff] shadow-[0_0_6px_#0095ff]" : "bg-slate-700"}`}></div>
            <span className="text-[10px] text-slate-400">Player: {telemetry.playerVisible ? "LOS_VISIBLE" : "LOS_BLOCKED"}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${telemetry.enemyHp < 40 ? "bg-[#ff3e3e] shadow-[0_0_6px_#ff3e3e] animate-pulse" : "bg-[#ff3e3e]"}`}></div>
            <span className="text-[10px] text-slate-400">Gemma: {telemetry.enemyHp < 40 ? "CRITICAL HP" : "OPERATIONAL"}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
