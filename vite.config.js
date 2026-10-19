import { createReadStream, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defineConfig } from 'vite';

const OUT_DIR = resolve(process.env.OUT_DIR || 'out');

// In dev, serve the pipeline's local output at /data, mirroring the deployed
// layout (dist/data).
const localData = () => ({
  name: 'torflow-local-data',
  configureServer(server) {
    server.middlewares.use('/data', (req, res, next) => {
      const path = join(OUT_DIR, decodeURIComponent(req.url.split('?')[0]));
      if (!path.startsWith(OUT_DIR)) return next();
      try {
        if (!statSync(path).isFile()) return next();
      } catch {
        res.statusCode = 404;
        return res.end();
      }
      res.setHeader('content-type', 'application/json');
      createReadStream(path).pipe(res);
    });
  },
});

export default defineConfig({
  root: 'web',
  // relative URLs so the site works at a domain root or a subpath (GitHub Pages)
  base: './',
  build: { outDir: '../dist', emptyOutDir: true, sourcemap: true, target: 'es2022' },
  worker: { format: 'es' },
  plugins: [localData()],
});
