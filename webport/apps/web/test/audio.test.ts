import { describe, expect, it, vi } from 'vitest';
import { installAudio } from '../src/audio/sfx.js';

describe('installAudio', () => {
  it('does not create AudioContext before unlock', () => {
    const Original = globalThis.AudioContext;
    const ctor = vi.fn(function (this: unknown) {
      return {
        state: 'running',
        currentTime: 0,
        destination: {},
        createGain: () => ({
          gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
          connect: vi.fn(),
        }),
        createOscillator: () => ({
          type: 'sine',
          frequency: { setValueAtTime: vi.fn() },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        }),
        createBuffer: () => ({ getChannelData: () => new Float32Array(8) }),
        createBufferSource: () => ({
          buffer: null,
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        }),
        createBiquadFilter: () => ({
          type: 'bandpass',
          frequency: { value: 0 },
          Q: { value: 0 },
          connect: vi.fn(),
        }),
        resume: vi.fn(),
        suspend: vi.fn(),
        sampleRate: 44100,
      };
    });
    // @ts-expect-error test double
    globalThis.AudioContext = ctor;

    const api = installAudio();
    expect(api.unlocked).toBe(false);
    expect(ctor).not.toHaveBeenCalled();

    api.unlock();
    api.play('stamp');
    expect(api.unlocked).toBe(true);
    expect(ctor).toHaveBeenCalled();

    api.setMuted(true);
    api.play('fault'); // should no-op safely
    expect(api.muted).toBe(true);

    globalThis.AudioContext = Original;
  });

  it('every cue is callable after unlock', () => {
    const api = installAudio();
    api.unlock();
    const cues = [
      'click',
      'stamp',
      'fault',
      'tool',
      'phase',
      'foup',
      'reworkOpen',
      'reworkOk',
      'reworkFail',
      'pass',
      'fail',
      'callout',
      'quizOk',
      'quizMiss',
    ] as const;
    for (const c of cues) expect(() => api.play(c)).not.toThrow();
    expect(() => api.setAmbience(0.5)).not.toThrow();
  });
});

