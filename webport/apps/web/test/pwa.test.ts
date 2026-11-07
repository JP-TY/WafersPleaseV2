import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSecureContext, registerServiceWorker } from '../src/pwa.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(HERE, '../public');

describe('PWA baseline', () => {
  it('ships manifest, SW, and icons', () => {
    expect(existsSync(path.join(PUBLIC, 'manifest.webmanifest'))).toBe(true);
    expect(existsSync(path.join(PUBLIC, 'sw.js'))).toBe(true);
    expect(existsSync(path.join(PUBLIC, 'icons/icon.svg'))).toBe(true);
    expect(existsSync(path.join(PUBLIC, 'icons/icon-maskable.svg'))).toBe(true);
    const manifest = JSON.parse(readFileSync(path.join(PUBLIC, 'manifest.webmanifest'), 'utf8')) as {
      name: string;
      display: string;
    };
    expect(manifest.name).toMatch(/Wafers/i);
    expect(manifest.display).toBe('standalone');
    const sw = readFileSync(path.join(PUBLIC, 'sw.js'), 'utf8');
    expect(sw).toMatch(/models/);
    expect(sw).toMatch(/skipWaiting/);
  });

  it('registerServiceWorker is safe in Node (no navigator)', async () => {
    expect(isSecureContext()).toBe(false);
    expect(await registerServiceWorker()).toBe(false);
  });
});
