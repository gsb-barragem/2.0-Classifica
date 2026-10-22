
import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { parseArgs } from 'node:util';

dotenv.config();

const root = path.dirname(fileURLToPath(import.meta.url));
const { values } = parseArgs({
  options: { port: { type: 'string' }, host: { type: 'string' } },
  strict: false,
});

async function startServer() {
  const app = express();
  const parsedPort = Number(values.port || process.env.PORT || 3000);
  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    throw new Error('A porta configurada não é válida.');
  }
  const host = typeof values.host === 'string' ? values.host : (process.env.HOST || '127.0.0.1');
  const distPath = path.join(root, 'dist');
  const isProduction = process.env.NODE_ENV === 'production';

  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "script-src": ["'self'"],
        "img-src": ["'self'", 'data:', 'https://lh3.googleusercontent.com', 'https://server.arcgisonline.com', 'https://*.tile.openstreetmap.org'],
        "connect-src": ["'self'", 'https://*.supabase.co', 'wss://*.supabase.co', 'https://servicodados.ibge.gov.br'],
        "style-src": ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://unpkg.com'],
        "font-src": ["'self'", 'https://fonts.gstatic.com'],
      },
    },
    referrerPolicy: { policy: 'no-referrer' },
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  if (isProduction) {
    if (!fs.existsSync(path.join(distPath, 'index.html'))) {
      throw new Error('Build ausente: gere a versão de produção antes de iniciar.');
    }
    app.use(express.static(distPath, { index: false, etag: true, maxAge: '1h' }));
    app.get('/{*splat}', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      configFile: path.join(root, 'vite.config.ts'),
      server: { middlewareMode: true, hmr: { host } },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const server = app.listen(parsedPort, host, () => {
    console.log(`Classifica 2.0 em http://${host}:${parsedPort} (${isProduction ? 'produção' : 'desenvolvimento'})`);
  });

  const shutdown = () => server.close(() => process.exit(0));
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

startServer().catch((error) => {
  console.error('Não foi possível iniciar o Classifica 2.0:', error instanceof Error ? error.message : 'erro inesperado');
  process.exitCode = 1;
});
