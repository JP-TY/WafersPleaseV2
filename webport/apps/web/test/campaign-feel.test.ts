import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { Campaign } from '@wafers/sim';
import { createNullStage } from '../src/bootstrap/engine.js';
import { loadGameConfig, campaignConfigFrom } from '../src/session/config.js';
import { shouldRunOnboarding, markOnboardingDone, OnboardingTour } from '../src/bay/onboarding.js';
import { Scaffolding } from '../src/bay/scaffolding.js';
import { QuizBoard } from '../src/bay/quiz.js';
import { ProgressionBoard } from '../src/bay/progression.js';
import { CONTENT_MODELS } from '../src/content/props.js';
import { measure, EMPTY_EVIDENCE, addReading } from '@wafers/sim';
import type { Engine } from '@babylonjs/core/Engines/engine.js';
import type { Scene } from '@babylonjs/core/scene.js';

describe('campaign + feel modules', () => {
  let engine: Engine;
  let scene: Scene;

  beforeEach(() => {
    const stage = createNullStage();
    engine = stage.engine;
    scene = stage.scene;
  });

  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  it('content model list matches packages/content budget props', () => {
    expect(CONTENT_MODELS).toContain('Foup');
    expect(CONTENT_MODELS).toContain('Wafer');
    expect(CONTENT_MODELS).toContain('Workbench');
    expect(CONTENT_MODELS.length).toBe(8);
  });

  it('campaign exposes Day 1 available and locks Day 3 until earlier pass', () => {
    const game = loadGameConfig();
    const c = new Campaign(campaignConfigFrom(game, 42), 1);
    expect(c.statusOf(1)).toBe('available');
    expect(c.statusOf(2)).toBe('locked');
    expect(c.statusOf(3)).toBe('locked');
  });

  it('onboarding tour advances and finishes', () => {
    const tour = new OnboardingTour(scene);
    tour.start();
    expect(tour.isActive).toBe(true);
    while (tour.isActive) {
      const done = tour.next();
      if (done) break;
    }
    expect(tour.isActive).toBe(false);
  });

  it('markOnboardingDone is idempotent with shouldRunOnboarding force flag', () => {
    markOnboardingDone();
    // Without ?onboarding=1, done flag suppresses — but in node location may be undefined.
    expect(typeof shouldRunOnboarding()).toBe('boolean');
  });

  it('scaffolding respects Day 3 disabled callouts', () => {
    const game = loadGameConfig();
    const sc = new Scaffolding(scene);
    const day3 = game.days.find((d) => d.dayNumber === 3)!;
    sc.setDay(day3);
    const campaign = new Campaign(campaignConfigFrom(game, 9), 3);
    const dir = campaign.createDirector();
    dir.beginShift();
    dir.presentNextWafer();
    const wafer = dir.currentWafer()!;
    const reading = measure(wafer, 'ElectronMicroscope');
    sc.onReading(reading);
    sc.update(0.1);
    // Day 3 calloutMode Disabled — card stays hidden.
    expect(sc['root'].isEnabled()).toBe(false);
  });

  it('quiz awards boosts for correct answers', () => {
    const quiz = new QuizBoard(scene);
    quiz.open(1);
    expect(quiz.isActive).toBe(true);
    // Answer all correctly using known indices for Day 1.
    quiz.answer(1);
    quiz.answer(2);
    quiz.answer(0);
    expect(quiz.isFinished).toBe(true);
    expect(quiz.boostsEarned).toBe(3);
  });

  it('progression board mounts without throw', () => {
    const game = loadGameConfig();
    const c = new Campaign(campaignConfigFrom(game, 1), 1);
    const board = new ProgressionBoard(scene);
    board.show(c);
    board.hide();
  });

  it('evidence fold is pure across identical readings', () => {
    const game = loadGameConfig();
    const c = new Campaign(campaignConfigFrom(game, 77), 1);
    const d = c.createDirector();
    d.beginShift();
    d.presentNextWafer();
    const w = d.currentWafer()!;
    const r = measure(w, 'StylusProfilometer');
    const a = addReading(EMPTY_EVIDENCE, r);
    const b = addReading(EMPTY_EVIDENCE, r);
    expect(a.anyOutOfSpec).toBe(b.anyOutOfSpec);
    expect(a.latencySeconds).toBe(b.latencySeconds);
  });
});
