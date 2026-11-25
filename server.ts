import express, { type RequestHandler } from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { parseArgs } from 'node:util';
import administraLeituraHandler from './api/administra-leitura.ts';
import administraEscritaHandler from './api/administra-escrita.ts';
import pendenciasHandler from './api/pendencias.ts';
import solicitacoesVistoriaHandler from './api/solicitacoes-vistoria.ts';
// TEMPORÁRIO: remover importação e rota de administra-s2s-barragens-test após validação.
import administraS2sBarragensTestHandler from './api/administra-s2s-barragens-test.ts';

dotenv.config();

const root = path.dirname(fileURLToPath(import.meta.url));
const { values } = parseArgs({
  options: { port: { type: 'string' }, host: { type: 'string' } },
  strict: false,
});

export interface ApiAppHandlers {
  administraLeitura?: RequestHandler;
  administraEscrita?: RequestHandler;
  pendencias?: RequestHandler;
  solicitacoesVistoria?: RequestHandler;
  administraS2sBarragensTest?: RequestHandler;
}

export function createApiApp(handlers: ApiAppHandlers = {}) {
  const app = express();
  const isProduction = process.env.NODE_ENV === 'production';

  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: isProduction
        ? {
            directives: {
              ...helmet.contentSecurityPolicy.getDefaultDirectives(),
              "script-src": ["'self'"],
              "img-src": [
                "'self'",
                'data:',
                'https://lh3.googleusercontent.com',
                'https://server.arcgisonline.com',
                'https://*.tile.openstreetmap.org',
              ],
              "connect-src": [
                "'self'",
                'https://*.supabase.co',
                'wss://*.supabase.co',
                'https://servicodados.ibge.gov.br',
              ],
              "style-src": [
                "'self'",
                "'unsafe-inline'",
                'https://fonts.googleapis.com',
                'https://unpkg.com',
              ],
              "font-src": ["'self'", 'https://fonts.gstatic.com'],
            },
          }
        : false,
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: 'no-referrer' },
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    if (isProduction) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  const handleLeitura =
    handlers.administraLeitura ?? ((req, res) => void administraLeituraHandler(req, res));
  const handleEscrita =
    handlers.administraEscrita ?? ((req, res) => void administraEscritaHandler(req, res));
  const handlePendencias =
    handlers.pendencias ?? ((req, res) => void pendenciasHandler(req, res));
  const handleVistoria =
    handlers.solicitacoesVistoria ?? ((req, res) => void solicitacoesVistoriaHandler(req, res));
  const handleS2sBarragensTest =
    handlers.administraS2sBarragensTest ??
    ((req, res) => void administraS2sBarragensTestHandler(req, res));

  app.all('/api/administra-leitura', handleLeitura);
  app.all('/api/administra-escrita', handleEscrita);
  app.all('/api/pendencias', handlePendencias);
  app.all('/api/solicitacoes-vistoria', handleVistoria);
  app.all('/api/solicitacoes-vistoria/:id', handleVistoria);
  app.all('/api/solicitacoes-vistoria/:id/observacao', handleVistoria);
  app.all('/api/solicitacoes-vistoria/:id/cancelar', handleVistoria);
  app.all('/api/administra-s2s-barragens-test', handleS2sBarragensTest);

  return app;
}

async function startServer() {
  const parsedPort = Number(values.port || process.env.PORT || 3000);
  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    throw new Error('A porta configurada não é válida.');
  }
  const host = typeof values.host === 'string' ? values.host : process.env.HOST || '0.0.0.0';
  const distPath = path.join(root, 'dist');
  const isProduction = process.env.NODE_ENV === 'production';

  const app = createApiApp();

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
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const server = app.listen(parsedPort, host, () => {
    console.log(
      `Classifica 2.0 em http://${host}:${parsedPort} (${isProduction ? 'produção' : 'desenvolvimento'})`
    );
  });

  const shutdown = () => server.close(() => process.exit(0));
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

const isDirectExecution =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  startServer().catch((error) => {
    console.error(
      'Não foi possível iniciar o Classifica 2.0:',
      error instanceof Error ? error.message : 'erro inesperado'
    );
    process.exitCode = 1;
  });
}
