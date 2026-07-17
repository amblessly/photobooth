import { defineConfig } from 'vite';
import { resolve } from 'path';
import { execSync } from 'child_process';
import tailwindcss from '@tailwindcss/vite';

const PORT = 5000;

// Clean URL routing: path <-> html file
const ROUTES = {
  '/': 'landing.html',
  '/start': 'start.html',
  '/booth': 'index.html',
};
// reverse map: /landing.html -> /  (for redirects that hide the extension)
const FILE_TO_CLEAN = {
  '/landing.html': '/',
  '/start.html': '/start',
  '/index.html': '/booth',
};

// Free up PORT before the dev/preview server starts so it is ALWAYS 5000.
function killPort(port) {
  try {
    const out = execSync(`netstat -ano -p tcp | findstr :${port}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      const m = line.trim().match(/LISTENING\s+(\d+)$/i);
      if (m) pids.add(m[1]);
    }
    for (const pid of pids) {
      if (pid && pid !== '0') {
        try {
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
          console.log(`[port] freed :${port} (killed PID ${pid})`);
        } catch (_) {
          /* already gone */
        }
      }
    }
  } catch (_) {
    /* nothing listening on the port */
  }
}

function cleanUrls() {
  const middleware = (req, res, next) => {
    const url = req.url.split('?')[0];

    // Redirect ugly .html paths to their clean equivalent.
    if (FILE_TO_CLEAN[url]) {
      res.statusCode = 301;
      res.setHeader('Location', FILE_TO_CLEAN[url] + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''));
      res.end();
      return;
    }

    // Serve the mapped html file for clean paths (rewrite internally).
    const clean = url.replace(/\/$/, '') || '/';
    if (ROUTES[clean]) {
      req.url = '/' + ROUTES[clean] + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
    }
    next();
  };

  return {
    name: 'snapcrate-clean-urls',
    enforce: 'pre',
    configureServer(server) {
      killPort(PORT);
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      killPort(PORT);
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  plugins: [cleanUrls(), tailwindcss()],
  server: {
    host: true,
    port: PORT,
    strictPort: true,
  },
  preview: {
    host: true,
    port: PORT,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        landing: resolve(__dirname, 'landing.html'),
        start: resolve(__dirname, 'start.html'),
        photobooth: resolve(__dirname, 'index.html'),
      },
    },
  },
});
