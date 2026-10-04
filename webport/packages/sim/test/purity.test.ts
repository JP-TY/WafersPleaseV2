import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Purity guard for packages/sim.
 *
 * The Unity project's `PurityScanner` walked IL with Mono.Cecil to enforce that
 * the simulation core referenced no Unity types. That scanner never existed, so
 * the rule it was meant to enforce has no mechanical guard here either — which
 * is precisely the gap this file closes.
 *
 * The rule: packages/sim is a pure simulation. It may not import an engine, the
 * DOM, or Node built-ins. That is what makes the whole assessment surface
 * testable headlessly and runnable identically in a worker, on the server for
 * golden-test generation, and in the browser.
 *
 * A grep over import specifiers is a blunt instrument compared with IL walking,
 * but it is the same class of check and it fails the build, which is the part
 * that matters.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(HERE, '..');
const SRC = path.join(PKG_ROOT, 'src');

/** Engine and platform bindings that must never enter the simulation core. */
const FORBIDDEN = [
  { pattern: /^@babylonjs\//, why: 'Babylon engine' },
  { pattern: /^three$/, why: 'three.js' },
  { pattern: /^@babylonjs\/loaders/, why: 'Babylon loader' },
  { pattern: /^react/, why: 'React' },
  { pattern: /^node:/, why: 'Node built-in' },
  { pattern: /^(fs|path|child_process|worker_threads|crypto|perf_hooks|http|https|net|os)$/, why: 'Node built-in' },
  { pattern: /^(window|document|navigator|localStorage|sessionPerformance)$/, why: 'DOM global' },
  { pattern: /^(aframe|playcanvas)$/, why: 'other web engine' },
] as const;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(p));
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/**
 * Strip comments so prose cannot trigger a violation.
 *
 * Without this, a doc comment reading "outside a process window." trips the DOM
 * check on `window.`. A guard that cries wolf over comments trains people to
 * ignore it, which is worse than having no guard.
 */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')          // block comments
    .replace(/^[ \t]*(\/\/|\*).*$/gm, ' ')      // whole-line // and * comment lines
    .replace(/([^:])\/\/[^\n]*/g, '$1 ');       // trailing // comments
}

const files = sourceFiles(SRC);

/** Every module specifier in the file, from static imports, re-exports and dynamic import(). */
function importsOf(file: string): string[] {
  const text = stripComments(readFileSync(file, 'utf8'));
  const specs: string[] = [];
  const patterns = [
    /(?:^|\n)\s*import\s+[^'"\n]*from\s*['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*export\s+[^'"\n]*from\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) if (m[1]) specs.push(m[1]);
  }
  return specs;
}

describe('packages/sim is free of engine and platform dependencies', () => {
  it('has source files to check — a vacuous pass would be worse than none', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it('imports nothing from an engine, the DOM, or Node', () => {
    const violations: string[] = [];
    for (const file of files) {
      for (const spec of importsOf(file)) {
        for (const { pattern, why } of FORBIDDEN) {
          if (pattern.test(spec)) {
            violations.push(`${path.relative(PKG_ROOT, file)} imports "${spec}" (${why})`);
          }
        }
      }
    }
    expect(violations, `Purity violations:\n  ${violations.join('\n  ')}`).toHaveLength(0);
  });

  it('references no bare DOM globals', () => {
    const violations: string[] = [];
    // Identifier-level check catches globals used without an import, which the
    // specifier check above cannot see.
    const globals = /\b(document|window|localStorage|requestAnimationFrame|performance)\s*[\.\[]/g;
    for (const file of files) {
      const text = stripComments(readFileSync(file, 'utf8'));
      for (const m of text.matchAll(globals)) {
        violations.push(`${path.relative(PKG_ROOT, file)} uses \`${m[0]}\``);
      }
    }
    expect(violations, violations.join('\n')).toHaveLength(0);
  });

  it('uses no Math.random — determinism must come from the seeded Rng', () => {
    // Unity's `UnityEngine.Random` was the single largest determinism defect in
    // the original project. Nothing here may reintroduce it.
    const violations: string[] = [];
    for (const file of files) {
      if (stripComments(readFileSync(file, 'utf8')).includes('Math.random')) {
        violations.push(path.relative(PKG_ROOT, file));
      }
    }
    expect(violations, `Math.random in: ${violations.join(', ')}`).toHaveLength(0);
  });

  it('imports no wall-clock time', () => {
    // Date.now / new Date would reintroduce the non-reproducibility that
    // `Random.InitState(displayName.GetHashCode())` caused in Unity.
    const violations: string[] = [];
    const clock = /\b(Date\.now|new\s+Date\s*\()/;
    for (const file of files) {
      if (clock.test(stripComments(readFileSync(file, 'utf8')))) violations.push(path.relative(PKG_ROOT, file));
    }
    expect(violations, `wall-clock in: ${violations.join(', ')}`).toHaveLength(0);
  });

  it('only depends on itself and its declared dev-free surface', () => {
    const allowed = /^\.\.?\/|^@wafers\//;
    const violations: string[] = [];
    for (const file of files) {
      for (const spec of importsOf(file)) {
        if (!allowed.test(spec)) violations.push(`${path.relative(PKG_ROOT, file)} -> "${spec}"`);
      }
    }
    expect(violations, violations.join('\n')).toHaveLength(0);
  });

  it('declares no runtime dependencies at all', () => {
    const pkg = JSON.parse(readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8'));
    expect(pkg.dependencies ?? {}).toEqual({});
  });
});

describe('the guard would actually catch a violation', () => {
  // A guard that cannot fail is not a guard. Prove the matcher works by running
  // it against synthetic specifiers.
  const matches = (spec: string) => FORBIDDEN.some(({ pattern }) => pattern.test(spec));

  it('flags engine, Node and DOM specifiers', () => {
    for (const spec of ['@babylonjs/core', '@babylonjs/loaders/glTF', 'three', 'node:fs', 'fs', 'window', 'react']) {
      expect(matches(spec), `${spec} should be forbidden`).toBe(true);
    }
  });

  it('does not flag relative or sibling-workspace specifiers', () => {
    for (const spec of ['./rng.js', '../rng.js', '@wafers/data']) {
      expect(matches(spec), `${spec} should be allowed`).toBe(false);
    }
  });

  it('the scan is not silently reading zero files', () => {
    for (const f of files) expect(statSync(f).size).toBeGreaterThan(0);
  });
});