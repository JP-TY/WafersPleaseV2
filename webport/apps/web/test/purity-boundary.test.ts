import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IntentChannel, assertReadOnly, authoritative } from '../src/session/purity.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '../src');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('sim purity boundary', () => {
  it('IntentChannel only queues player choices', () => {
    const ch = new IntentChannel();
    ch.push({ kind: 'stamp', action: 'Accept' });
    ch.push({ kind: 'runTool', tool: 'StylusProfilometer' });
    expect(ch.drain()).toEqual([
      { kind: 'stamp', action: 'Accept' },
      { kind: 'runTool', tool: 'StylusProfilometer' },
    ]);
    expect(ch.drain()).toEqual([]);
  });

  it('authoritative + assertReadOnly do not throw on display values', () => {
    const v = authoritative({ salary: 100 });
    expect(() => assertReadOnly(v)).not.toThrow();
    expect(v.salary).toBe(100);
  });

  it('presentation modules do not import sim generation for grading', () => {
    const banned = [
      'generation/lot-generator',
      'generation/wafer',
      'evaluation/disposition',
      'evaluation/scoring',
    ];
    // Allowed to import from @wafers/sim barrel / public API; banned are deep
    // paths that would couple presentation to grading internals.
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      if (file.includes(`${path.sep}session${path.sep}`)) continue; // session may wire sim
      const text = readFileSync(file, 'utf8');
      for (const b of banned) {
        if (text.includes(`@wafers/sim/${b}`) || text.includes(`packages/sim/src/${b}`)) {
          offenders.push(`${path.relative(SRC, file)} → ${b}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no physics module grades from sim state files', () => {
    // Fresh architecture: no physics/ folder yet. Guard the contract.
    const physicsDir = path.join(SRC, 'physics');
    let exists = false;
    try {
      exists = statSync(physicsDir).isDirectory();
    } catch {
      exists = false;
    }
    if (!exists) {
      expect(exists).toBe(false);
      return;
    }
    for (const file of walk(physicsDir)) {
      const text = readFileSync(file, 'utf8');
      expect(text).not.toMatch(/evaluateDisposition|scoreDisposition|completeShift/);
    }
  });
});
