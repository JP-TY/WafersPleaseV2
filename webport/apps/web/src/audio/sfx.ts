/**
 * Runtime-synthesized audio (Web Audio API). No committed binary samples.
 * Lazily creates AudioContext on first user gesture.
 */

export type SfxCue =
  | 'click'
  | 'stamp'
  | 'fault'
  | 'tool'
  | 'phase'
  | 'foup'
  | 'reworkOpen'
  | 'reworkOk'
  | 'reworkFail'
  | 'pass'
  | 'fail'
  | 'callout'
  | 'quizOk'
  | 'quizMiss';

export interface AudioApi {
  unlock(): void;
  play(cue: SfxCue): void;
  setMuted(muted: boolean): void;
  /** Soft HVAC bed; gain 0..1. */
  setAmbience(level: number): void;
  readonly muted: boolean;
  readonly unlocked: boolean;
}

export function installAudio(): AudioApi {
  let ctx: AudioContext | null = null;
  let muted = false;
  let unlocked = false;
  let ambienceGain: GainNode | null = null;
  let ambienceStarted = false;

  const reduceMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const ensure = (): AudioContext | null => {
    if (muted || reduceMotion) return null;
    if (!ctx) {
      const AC = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  };

  const startAmbience = (c: AudioContext) => {
    if (ambienceStarted) return;
    ambienceStarted = true;
    ambienceGain = c.createGain();
    ambienceGain.gain.value = 0.02;
    ambienceGain.connect(c.destination);
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.4;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 280;
    src.connect(filter);
    filter.connect(ambienceGain);
    src.start();
  };

  const blip = (freq: number, dur: number, type: OscillatorType, gain = 0.08, noiseBurst = false) => {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    g.connect(c.destination);

    if (noiseBurst) {
      const n = c.createBufferSource();
      const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.2));
      n.buffer = buf;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = 0.8;
      n.connect(f);
      f.connect(g);
      n.start(t0);
      n.stop(t0 + dur);
      return;
    }

    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    o.connect(g);
    o.start(t0);
    o.stop(t0 + dur);
  };

  const play = (cue: SfxCue): void => {
    switch (cue) {
      case 'click':
        blip(880, 0.04, 'square', 0.04);
        break;
      case 'stamp':
        // Soft rubber thunk + brief click — readable without HUD.
        blip(68, 0.2, 'triangle', 0.18, true);
        blip(105, 0.12, 'sine', 0.09);
        blip(380, 0.05, 'square', 0.04);
        blip(880, 0.03, 'square', 0.025);
        break;
      case 'fault':
        blip(220, 0.18, 'sawtooth', 0.07);
        blip(165, 0.22, 'sawtooth', 0.05);
        break;
      case 'tool':
        blip(660, 0.07, 'sine', 0.05);
        break;
      case 'phase':
        blip(392, 0.1, 'triangle', 0.05);
        blip(523, 0.12, 'triangle', 0.04);
        break;
      case 'foup':
        // Cassette seat + latch click — heavier thunk for load juice.
        blip(120, 0.22, 'triangle', 0.12, true);
        blip(210, 0.1, 'square', 0.045);
        blip(440, 0.05, 'sine', 0.03);
        break;
      case 'reworkOpen':
        blip(290, 0.12, 'sine', 0.055);
        blip(380, 0.14, 'sine', 0.045);
        blip(520, 0.1, 'triangle', 0.03);
        break;
      case 'reworkOk':
        blip(523, 0.1, 'sine', 0.06);
        blip(784, 0.14, 'sine', 0.05);
        break;
      case 'reworkFail':
        blip(180, 0.2, 'sawtooth', 0.07);
        break;
      case 'pass':
        blip(523, 0.12, 'sine', 0.05);
        blip(659, 0.14, 'sine', 0.05);
        blip(784, 0.18, 'sine', 0.05);
        break;
      case 'fail':
        blip(196, 0.25, 'triangle', 0.07);
        break;
      case 'callout':
        blip(740, 0.06, 'sine', 0.035);
        break;
      case 'quizOk':
        blip(660, 0.08, 'sine', 0.05);
        break;
      case 'quizMiss':
        blip(240, 0.1, 'triangle', 0.05);
        break;
    }
  };

  return {
    unlock() {
      unlocked = true;
      const c = ensure();
      if (c) startAmbience(c);
    },
    play,
    setMuted(m) {
      muted = m;
      if (muted && ctx) void ctx.suspend();
      else if (!muted && ctx) void ctx.resume();
    },
    setAmbience(level) {
      if (ambienceGain) ambienceGain.gain.value = Math.max(0, Math.min(0.08, level * 0.05));
    },
    get muted() {
      return muted;
    },
    get unlocked() {
      return unlocked;
    },
  };
}
