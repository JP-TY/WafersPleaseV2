import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { Rng, recipeFor, createRcaClean } from '@wafers/sim';
import { createNullStage } from '../src/bootstrap/engine.js';
import { RcaBench } from '../src/rework/rca-bench.js';
import { loadGameConfig } from '../src/session/config.js';
import type { Engine } from '@babylonjs/core/Engines/engine.js';
import type { Scene } from '@babylonjs/core/scene.js';

describe('RCA bench', () => {
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

  it('uses authored RCA recipe from data package', () => {
    const game = loadGameConfig();
    const recipe = recipeFor('RCAClean', game.rework);
    expect(recipe.kind).toBe('RCAClean');
    expect(recipe.steps.length).toBeGreaterThanOrEqual(4);
    expect(recipe.steps[0]!.key).toMatch(/SC1/i);
  });

  it('mounts and can be refreshed without throwing under NullEngine', () => {
    const game = loadGameConfig();
    const recipe = recipeFor('RCAClean', game.rework);
    const bench = new RcaBench(scene, () => new Rng(1), recipe);
    bench.setVisible(true);
    bench.prepareFresh();
    bench.update(0.016);
    bench.setVisible(false);
    expect(bench.getCloseRequest()).toBeNull();
  });

  it('ideal soak path succeeds in sim (grading source)', () => {
    const game = loadGameConfig();
    const recipe = recipeFor('RCAClean', game.rework);
    const clean = createRcaClean(new Rng(42), 0, recipe);
    const dt = 1 / 60;
    const runStep = (bath: 'sc1' | 'sc2' | null, hold: number) => {
      if (bath) {
        clean.act({ type: 'setHeater', bath, setpointC: clean.state.step.targetC.nominal });
        for (let i = 0; i < 60 * 60 && clean.state.baths[bath].temperatureC < clean.state.step.targetC.nominal - 0.5; i++) {
          clean.tick(dt);
        }
      }
      clean.act({ type: 'immerse' });
      for (let t = 0; t < hold; t += dt) clean.tick(dt);
      clean.act({ type: 'withdraw' });
    };
    runStep('sc1', clean.state.step.dwellSeconds);
    runStep(null, clean.state.step.dwellSeconds); // QDR1
    runStep('sc2', clean.state.step.dwellSeconds);
    runStep(null, clean.state.step.dwellSeconds); // QDR2
    expect(clean.finished).toBe(true);
    expect(clean.result?.success).toBe(true);
  });
});
