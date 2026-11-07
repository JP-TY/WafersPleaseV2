import { defineConfig, type Plugin } from 'vite';
import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Where the optimized props actually live, relative to apps/web. */
const MODELS_DIR = path.resolve(HERE, '../../packages/content/public/models');

const MIME: Record<string, string> = {
  '.glb': 'model/gltf-binary',
  '.json': 'application/json',
  '.ktx2': 'image/ktx2',
};

/**
 * Serve the committed optimized models at /models/*.
 *
 * A symlink from public/models would be simpler, but committing a symlink
 * breaks on Windows checkouts and in archives that do not preserve them. The
 * props are a build input of apps/web rather than its own assets, so serving them
 * from their real location keeps a single copy in the repository.
 */
function serveModels(): Plugin {
  return {
    name: 'wafers-serve-models',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '';
        if (!url.startsWith('/models/')) return next();
        const file = path.join(MODELS_DIR, path.basename(url.split('?')[0] ?? ''));
        // basename() already strips traversal, but be explicit about the boundary.
        if (!file.startsWith(MODELS_DIR) || !existsSync(file)) return next();
        res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        createReadStream(file).pipe(res);
      });
    },
    generateBundle() {
      // Copy the props into the build output at the same public path.
      if (!existsSync(MODELS_DIR)) return;
      mkdirSync(path.resolve(HERE, 'dist/models'), { recursive: true });
      for (const f of readdirSync(MODELS_DIR)) {
        copyFileSync(path.join(MODELS_DIR, f), path.resolve(HERE, 'dist/models', f));
      }
    },
  };
}

export default defineConfig({
  plugins: [serveModels()],
  server: { host: '127.0.0.1', port: 5180 },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@babylonjs')) return 'babylon';
          return undefined;
        },
      },
    },
  },
});