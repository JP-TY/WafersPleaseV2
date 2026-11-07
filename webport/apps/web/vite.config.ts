import { defineConfig, type Plugin } from 'vite';
import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** Single source of truth — served via middleware / one-shot dist copy (no watch storms). */
const MODELS_DIR = path.resolve(HERE, '../../packages/content/public/models');
const DIST_MODELS = path.resolve(HERE, 'dist/models');

const MIME: Record<string, string> = {
  '.glb': 'model/gltf-binary',
  '.json': 'application/json',
  '.ktx2': 'image/ktx2',
};

function copyModelsOnce(): void {
  if (!existsSync(MODELS_DIR)) return;
  mkdirSync(DIST_MODELS, { recursive: true });
  for (const f of readdirSync(MODELS_DIR)) {
    const src = path.join(MODELS_DIR, f);
    const dst = path.join(DIST_MODELS, f);
    if (!existsSync(src) || !statSync(src).isFile()) continue;
    // Skip identical copies — avoids GLB copy storms on rebuild loops.
    if (existsSync(dst)) {
      const a = statSync(src);
      const b = statSync(dst);
      if (a.size === b.size && a.mtimeMs <= b.mtimeMs) continue;
    }
    copyFileSync(src, dst);
  }
}

/** Static /models alias: stream from packages/content; one-shot dist sync on build close. */
function serveModels(): Plugin {
  return {
    name: 'wafers-serve-models',
    configureServer(server) {
      // Never watch multi-MB GLBs — that path caused Vite OOM loops here.
      server.watcher.unwatch(MODELS_DIR);
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '';
        if (!url.startsWith('/models/')) return next();
        const file = path.join(MODELS_DIR, path.basename(url.split('?')[0] ?? ''));
        if (!file.startsWith(MODELS_DIR) || !existsSync(file)) return next();
        res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      copyModelsOnce();
    },
  };
}

export default defineConfig({
  plugins: [serveModels()],
  // Prefer 5181 — 5180 has been unreliable under OOM kills in this workspace.
  server: {
    host: '127.0.0.1',
    port: 5181,
    strictPort: false,
    watch: {
      ignored: ['**/packages/content/public/models/**', '**/dist/models/**'],
    },
    fs: { allow: [HERE, MODELS_DIR] },
  },
  preview: { host: '127.0.0.1', port: 4180 },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@babylonjs')) return 'babylon';
          return undefined;
        },
      },
    },
  },
  publicDir: 'public',
});
