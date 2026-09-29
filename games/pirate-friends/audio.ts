/** Procedural Web Audio effects for Pirate Friends. No recordings or downloads. */
import type { SoundName } from "./engine.js";

export type PirateAudio = Readonly<{ unlock(): void; play(name: SoundName): void; setMuted(muted: boolean): void; dispose(): void }>;

export function createPirateAudio(initiallyMuted: boolean): PirateAudio {
  let context: AudioContext | null = null, master: GainNode | null = null, noise: AudioBuffer | null = null;
  let muted = initiallyMuted;
  const last = new Map<SoundName, number>();

  function ensure() {
    if (context) return context;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
    master = context.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(context.destination);
    noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = noise.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return context;
  }
  function burst(ctx: AudioContext, at: number, duration: number, freq: number, type: BiquadFilterType, gain: number, sweepTo?: number) {
    const src = ctx.createBufferSource(); src.buffer = noise;
    const filter = ctx.createBiquadFilter(); filter.type = type; filter.frequency.setValueAtTime(freq, at);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, at + duration);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, at); g.gain.exponentialRampToValueAtTime(0.001, at + duration);
    src.connect(filter).connect(g).connect(master!); src.start(at); src.stop(at + duration + 0.05);
  }
  function tone(ctx: AudioContext, at: number, duration: number, from: number, to: number, type: OscillatorType, gain: number) {
    const osc = ctx.createOscillator(); osc.type = type; osc.frequency.setValueAtTime(from, at); osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + duration);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(g).connect(master!); osc.start(at); osc.stop(at + duration + 0.05);
  }

  return {
    unlock() { const ctx = ensure(); if (ctx?.state === "suspended") void ctx.resume(); },
    setMuted(next) { muted = next; if (master && context) master.gain.setTargetAtTime(next ? 0 : 0.5, context.currentTime, 0.02); },
    dispose() { void context?.close(); context = null; master = null; },
    play(name) {
      if (muted) return;
      const ctx = ensure(); if (!ctx || ctx.state !== "running" || !master) return;
      const now = ctx.currentTime;
      // Rapid fire should stay punchy, not a wall of noise.
      if (now - (last.get(name) ?? -1) < (name === "fire" ? 0.05 : 0.03)) return;
      last.set(name, now);
      switch (name) {
        case "fire": burst(ctx, now, 0.35, 900, "lowpass", 0.9, 120); tone(ctx, now, 0.25, 140, 45, "sine", 0.8); break;
        case "enemyFire": burst(ctx, now, 0.4, 600, "lowpass", 0.55, 90); tone(ctx, now, 0.3, 110, 40, "sine", 0.5); break;
        case "hit": burst(ctx, now, 0.22, 1800, "bandpass", 0.8, 400); tone(ctx, now, 0.12, 220, 80, "square", 0.15); break;
        case "boom": burst(ctx, now, 1.1, 1200, "lowpass", 1, 60); tone(ctx, now, 0.8, 90, 28, "sine", 1); break;
        case "splash": burst(ctx, now, 0.45, 2500, "highpass", 0.35, 800); break;
        case "skip": burst(ctx, now, 0.12, 3000, "bandpass", 0.3); tone(ctx, now, 0.12, 700, 1100, "sine", 0.15); break;
        case "tear": burst(ctx, now, 0.25, 4000, "highpass", 0.35, 1500); break;
        case "bonus": [660, 880, 1320].forEach((f, i) => tone(ctx, now + i * 0.06, 0.16, f, f, "triangle", 0.25)); break;
        case "gull": tone(ctx, now, 0.18, 1500, 900, "sawtooth", 0.08); tone(ctx, now + 0.16, 0.14, 1400, 800, "sawtooth", 0.07); break;
        case "kraken": tone(ctx, now, 1.1, 70, 45, "sawtooth", 0.25); burst(ctx, now, 0.9, 300, "lowpass", 0.4); break;
        case "win": [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(ctx, now + i * 0.12, 0.22, f, f, "square", 0.12)); break;
        case "lose": [392, 330, 262, 196].forEach((f, i) => tone(ctx, now + i * 0.2, 0.3, f, f * 0.97, "triangle", 0.25)); break;
      }
    },
  };
}
