// Procedural retro sound synthesis using Web Audio API

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Procedural Laser Shot sound
 */
export function playProceduralShootSound(isPlayer: boolean) {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Dynamic pitch drop configuration
    const startFreq = isPlayer ? 880 : 540;
    const endFreq = isPlayer ? 220 : 110;
    const duration = isPlayer ? 0.12 : 0.18;

    osc.type = isPlayer ? "triangle" : "sawtooth";
    osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + duration);

    gainNode.gain.setValueAtTime(0.08, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (err) {
    // Graceful fallback for browsers block autoplaying contexts
    console.warn("Web Audio API warning:", err);
  }
}

/**
 * Immediate Auditory Feedback on Match Conclusion
 */
export function playProceduralMatchOutcomeSound(winner: "player" | "ai") {
  try {
    const ctx = getAudioContext();
    const time = ctx.currentTime;

    if (winner === "player") {
      // Clean ascending victory fanfare (Major third and perfect fifth)
      const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
      const noteDelay = 0.12;

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, time + (idx * noteDelay));

        gain.gain.setValueAtTime(0, time + (idx * noteDelay));
        gain.gain.linearRampToValueAtTime(0.1, time + (idx * noteDelay) + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, time + (idx * noteDelay) + 0.3);

        osc.start(time + (idx * noteDelay));
        osc.stop(time + (idx * noteDelay) + 0.35);
      });
    } else {
      // Grungier metallic descending defeat chord (Tritones)
      const notes = [220.00, 155.56, 110.00, 77.78]; // A3, Eb3, A2, Eb2
      const noteDelay = 0.15;

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freq, time + (idx * noteDelay));

        gain.gain.setValueAtTime(0, time + (idx * noteDelay));
        gain.gain.linearRampToValueAtTime(0.12, time + (idx * noteDelay) + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, time + (idx * noteDelay) + 0.5);

        osc.start(time + (idx * noteDelay));
        osc.stop(time + (idx * noteDelay) + 0.55);
      });
    }
  } catch (err) {
    console.warn("Web Audio API matches outcome warning:", err);
  }
}
