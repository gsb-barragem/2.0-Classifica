import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createApiApp } from '../server';
import {
  createAdministraS2sBarragensTestHandler,
  TEMP_S2S_BARRAGENS_FLAG_ENV,
  verifyStrictAdminSession,
} from '../api/administra-s2s-barragens-test';
import {
  ADMINISTRA_BARRAGENS_TEST_PATH,
  ADMINISTRA_BARRAGENS_TEST_QUERY,
  buildS2sV2BarragensTestCanonicalString,
  createAdministraS2sBarragensHeaders,
  testAdministraBarragensS2s,
} from '../server/administraS2sBarragensTest';
import {
  buildS2sV2CanonicalString,
  buildS2sV2HealthCanonicalString,
  EMPTY_BODY_SHA256,
} from '../server/administraS2sHealth';
import {
  AdministraS2sBarragensTempTestCard,
  TEMP_S2S_BARRAGENS_TEST_ENDPOINT,
  triggerAdministraS2sBarragensTest,
} from '../components/AdministraS2sBarragensTempTestCard';
import { AuthContext } from '../src/contexts/AuthContext';
import { User } from '../types';

function generateEphemeralEd25519Pair(): {
  privateKeyPem: string;
  publicKey: crypto.KeyObject;
} {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const privateKeyPem = privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  }) as string;
  return { privateKeyPem, publicKey };
}

async function withRouteServer(
  handler: ReturnType<typeof createAdministraS2sBarragensTestHandler>,
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const app = createApiApp({
    administraS2sBarragensTest: (req, res) => void handler(req, res),
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    server.close();
    throw new Error('Falha ao abrir porta efêmera para teste HTTP.');
  }
  try {
    await run(`http://127.0.0.1:${addr.port}`);
  } finally {
    server.closeAllConnections?.();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

const ADMIN_USER: User = {
  id: 'user-admin-1',
  authUserId: 'auth-admin-1',
  username: 'admin.teste@exemplo.local',
  email: 'admin.teste@exemplo.local',
  name: 'Administrador Teste',
  role: 'Administrador',
  setor: 'COORDENADOR',
  perfil: 'Analista de Meio Ambiente',
  matricula: '100001',
  active: true,
  forcePasswordChange: false,
};

const ANALYST_USER: User = {
  ...ADMIN_USER,
  id: 'user-analista-1',
  authUserId: 'auth-analista-1',
  role: 'Analista',
};

const VIEWER_USER: User = {
  ...ADMIN_USER,
  id: 'user-vis-1',
  authUserId: 'auth-vis-1',
  role: 'Visualizador',
};

test('buildS2sV2BarragensTestCanonicalString assina GET /api/v2/barragens com query limit=1 em 10 linhas', () => {
  const canonical = buildS2sV2BarragensTestCanonicalString({
    keyId: 'kid-barragens-1',
    timestamp: '1764000000',
    jti: '550e8400-e29b-41d4-a716-446655440000',
  });

  assert.equal(canonical.endsWith('\n'), false);
  assert.deepEqual(canonical.split('\n'), [
    'S2S-V2',
    'GET',
    ADMINISTRA_BARRAGENS_TEST_PATH,
    ADMINISTRA_BARRAGENS_TEST_QUERY,
    '',
    EMPTY_BODY_SHA256,
    'kid-barragens-1',
    '1764000000',
    '550e8400-e29b-41d4-a716-446655440000',
    '|',
  ]);
});

test('canonicalizador compartilhado coincide byte a byte com a string de GET /api/v2/barragens?limit=1 e difere do health apenas em path e query', () => {
  const keyId = 'classifica-ed25519-2026-02';
  const timestamp = '1764000000';
  const jti = '550e8400-e29b-41d4-a716-446655440000';

  const sharedCanonical = buildS2sV2CanonicalString({
    method: 'GET',
    path: '/api/v2/barragens',
    query: 'limit=1',
    contentType: '',
    bodySha256: EMPTY_BODY_SHA256,
    keyId,
    timestamp,
    jti,
  });

  const barragensCanonical = buildS2sV2BarragensTestCanonicalString({
    keyId,
    timestamp,
    jti,
  });

  const expectedString = [
    'S2S-V2',
    'GET',
    '/api/v2/barragens',
    'limit=1',
    '',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'classifica-ed25519-2026-02',
    timestamp,
    jti,
    '|',
  ].join('\n');

  assert.equal(barragensCanonical, sharedCanonical);
  assert.equal(sharedCanonical, expectedString);
  assert.equal(
    Buffer.compare(
      Buffer.from(barragensCanonical, 'utf8'),
      Buffer.from(expectedString, 'utf8')
    ),
    0
  );
  assert.equal(sharedCanonical.endsWith('\n'), false);

  const healthCanonical = buildS2sV2HealthCanonicalString({
    keyId,
    timestamp,
    jti,
  });

  const barragensLines = barragensCanonical.split('\n');
  const healthLines = healthCanonical.split('\n');
  assert.equal(barragensLines.length, 10);
  assert.equal(healthLines.length, 10);

  for (let i = 0; i < 10; i++) {
    if (i === 2) {
      assert.equal(healthLines[i], '/api/v2/health');
      assert.equal(barragensLines[i], '/api/v2/barragens');
    } else if (i === 3) {
      assert.equal(healthLines[i], '');
      assert.equal(barragensLines[i], 'limit=1');
    } else {
      assert.equal(barragensLines[i], healthLines[i]);
    }
  }

  const { privateKeyPem, publicKey } = generateEphemeralEd25519Pair();
  const signed = createAdministraS2sBarragensHeaders({
    keyId,
    privateKeyPem,
    timestamp,
    jti,
  });
  assert.equal(signed.canonicalString, expectedString);
  assert.equal(signed.headers['x-s2s-key-id'], 'classifica-ed25519-2026-02');
  assert.equal(
    crypto.verify(
      null,
      Buffer.from(expectedString, 'utf8'),
      publicKey,
      Buffer.from(signed.headers['x-s2s-signature'], 'base64')
    ),
    true
  );
});

test('testAdministraBarragensS2s assina Ed25519 para /api/v2/barragens?limit=1 e extrai apenas política de mascaramento sem retornar registros', async () => {
  const { privateKeyPem, publicKey } = generateEphemeralEd25519Pair();
  let observedUrl = '';
  let observedMethod = '';
  let observedContentType: string | string[] | undefined;
  let verifiedSignature = false;

  const mockServer = http.createServer((req, res) => {
    observedUrl = req.url || '';
    observedMethod = req.method || '';
    observedContentType = req.headers['content-type'];

    const [reqPath, reqQuery = ''] = observedUrl.split('?');
    const canonical = [
      'S2S-V2',
      observedMethod,
      reqPath,
      reqQuery,
      '',
      String(req.headers['x-s2s-body-sha256'] || ''),
      String(req.headers['x-s2s-key-id'] || ''),
      String(req.headers['x-s2s-timestamp'] || ''),
      String(req.headers['x-s2s-jti'] || ''),
      '|',
    ].join('\n');

    verifiedSignature = crypto.verify(
      null,
      Buffer.from(canonical, 'utf8'),
      publicKey,
      Buffer.from(String(req.headers['x-s2s-signature'] || ''), 'base64')
    );

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        masking_policy: 'pii_masked_v1',
        items: [
          {
            id: 'bar-secreta-999',
            nome: 'Barragem Sensível XYZ',
            cpf_cnpj: '12345678901',
          },
        ],
      })
    );
  });

  await new Promise<void>((resolve) => {
    mockServer.listen(0, '127.0.0.1', () => resolve());
  });

  try {
    const addr = mockServer.address();
    assert.ok(addr && typeof addr !== 'string');
    const result = await testAdministraBarragensS2s({
      env: {
        ADMINISTRA_API_BASE_URL: `http://127.0.0.1:${addr.port}`,
        CLASSIFICA_S2S_KID: 'kid-barragens-test',
        CLASSIFICA_S2S_PRIVATE_KEY: privateKeyPem,
      },
    });

    assert.equal(observedMethod, 'GET');
    assert.equal(observedUrl, '/api/v2/barragens?limit=1');
    assert.equal(observedContentType, undefined);
    assert.equal(verifiedSignature, true);
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(result.maskingPolicy, 'pii_masked_v1');

    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes('Barragem Sensível XYZ'), false);
    assert.equal(serialized.includes('bar-secreta-999'), false);
    assert.equal(serialized.includes('12345678901'), false);
  } finally {
    mockServer.closeAllConnections?.();
    await new Promise<void>((resolve, reject) => {
      mockServer.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

test('rota temporária permanece desativada por padrão (404) e falha fechado para chave anon ausente', async () => {
  for (const flagValue of [undefined, '', 'false', '0', 'TRUE']) {
    let verifyCalled = false;
    const handler = createAdministraS2sBarragensTestHandler({
      env: {
        [TEMP_S2S_BARRAGENS_FLAG_ENV]: flagValue,
      },
      verifyAdminSession: async () => {
        verifyCalled = true;
        return { ok: true, authUserId: 'admin-1' };
      },
    });

    await withRouteServer(handler, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/administra-s2s-barragens-test`, {
        method: 'POST',
        headers: { Authorization: 'Bearer token-1' },
      });
      assert.equal(res.status, 404);
    });

    assert.equal(verifyCalled, false);
  }

  const strictCheckWithoutAnon = await verifyStrictAdminSession('bearer-jwt', {
    SUPABASE_URL: 'https://classifica.example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-nao-deve-ser-usada',
  });
  assert.equal(strictCheckWithoutAnon.ok, false);
  if (strictCheckWithoutAnon.ok === false) {
    assert.equal(strictCheckWithoutAnon.status, 503);
  }
});

test('rota temporária valida método POST, rejeita query/body, exige Administrador e devolve apenas status e política de mascaramento', async () => {
  const { privateKeyPem } = generateEphemeralEd25519Pair();
  const baseEnv: NodeJS.ProcessEnv = {
    [TEMP_S2S_BARRAGENS_FLAG_ENV]: 'true',
    ADMINISTRA_API_BASE_URL: 'https://administra.example.gov.br',
    CLASSIFICA_S2S_KID: 'kid-administra-1',
    CLASSIFICA_S2S_PRIVATE_KEY: privateKeyPem,
  };

  let now = 1_700_000_000_000;
  const handler = createAdministraS2sBarragensTestHandler({
    env: baseEnv,
    nowMs: () => now,
    cooldownMs: 30_000,
    verifyAdminSession: async (token) => {
      if (token === 'token-admin') return { ok: true, authUserId: 'admin-1' };
      if (token === 'token-analista') {
        return { ok: false, status: 403, error: 'Perfil sem permissão administrativa ativa.' };
      }
      return { ok: false, status: 401, error: 'Sessão inválida ou expirada.' };
    },
    runBarragensS2sTest: async () => ({
      ok: true,
      status: 200,
      maskingPolicy: { mode: 'masked', cpf_cnpj: 'hidden' },
    }),
  });

  await withRouteServer(handler, async (baseUrl) => {
    const getRes = await fetch(`${baseUrl}/api/administra-s2s-barragens-test`, {
      method: 'GET',
      headers: { Authorization: 'Bearer token-admin' },
    });
    assert.equal(getRes.status, 405);

    const queryRes = await fetch(
      `${baseUrl}/api/administra-s2s-barragens-test?limit=50`,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer token-admin' },
      }
    );
    assert.equal(queryRes.status, 400);

    const bodyRes = await fetch(`${baseUrl}/api/administra-s2s-barragens-test`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token-admin',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ target: 'https://evil.invalid' }),
    });
    assert.equal(bodyRes.status, 400);

    const noAuth = await fetch(`${baseUrl}/api/administra-s2s-barragens-test`, {
      method: 'POST',
    });
    assert.equal(noAuth.status, 401);

    const analistaRes = await fetch(`${baseUrl}/api/administra-s2s-barragens-test`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token-analista' },
    });
    assert.equal(analistaRes.status, 403);

    const okRes = await fetch(`${baseUrl}/api/administra-s2s-barragens-test`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token-admin' },
    });
    assert.equal(okRes.status, 200);
    const okJson = (await okRes.json()) as Record<string, unknown>;
    assert.deepEqual(okJson, {
      ok: true,
      status: 200,
      maskingPolicy: { mode: 'masked', cpf_cnpj: 'hidden' },
    });

    const cooldownRes = await fetch(`${baseUrl}/api/administra-s2s-barragens-test`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token-admin' },
    });
    assert.equal(cooldownRes.status, 429);

    now += 31_000;
    const afterCooldownRes = await fetch(
      `${baseUrl}/api/administra-s2s-barragens-test`,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer token-admin' },
      }
    );
    assert.equal(afterCooldownRes.status, 200);
  });
});

function renderTempBarragensCard(currentUser: User | null): string {
  return renderToStaticMarkup(
    React.createElement(
      AuthContext.Provider,
      {
        value: {
          currentUser,
          login: async () => ({ success: false }),
          logout: async () => undefined,
          loading: false,
          refreshProfile: async () => undefined,
        },
      },
      React.createElement(AdministraS2sBarragensTempTestCard)
    )
  );
}

test('acionador temporário aparece somente para Administrador e exibe política de mascaramento sem vazar dados sensíveis', async () => {
  assert.equal(renderTempBarragensCard(null), '');
  assert.equal(renderTempBarragensCard(ANALYST_USER), '');
  assert.equal(renderTempBarragensCard(VIEWER_USER), '');

  const html = renderTempBarragensCard(ADMIN_USER);
  assert.match(html, /Testar S2S Barragens \(Temporário\)/);
  assert.doesNotMatch(html, /<input/i);

  let fetchCount = 0;
  const blocked = await triggerAdministraS2sBarragensTest({
    currentUser: ANALYST_USER,
    isConfigured: () => true,
    getSession: async () => ({
      data: { session: { access_token: 'tok-1', expires_at: 9_999_999_999 } },
      error: null,
    }),
    fetchImpl: async () => {
      fetchCount += 1;
      return new Response('{}', { status: 200 });
    },
  });
  assert.equal(blocked.ok, false);
  assert.equal(fetchCount, 0);

  let capturedUrl = '';
  let capturedMethod = '';
  const okOutcome = await triggerAdministraS2sBarragensTest({
    currentUser: ADMIN_USER,
    isConfigured: () => true,
    nowMs: () => 1_700_000_000_000,
    getSession: async () => ({
      data: {
        session: {
          access_token: 'jwt-admin-secret',
          expires_at: 1_700_003_600,
        },
      },
      error: null,
    }),
    fetchImpl: async (input, init) => {
      capturedUrl = String(input);
      capturedMethod = init?.method || 'GET';
      return new Response(
        JSON.stringify({
          ok: true,
          status: 200,
          maskingPolicy: 'pii_masked_v1',
        }),
        { status: 200 }
      );
    },
  });

  assert.equal(capturedUrl, TEMP_S2S_BARRAGENS_TEST_ENDPOINT);
  assert.equal(capturedMethod, 'POST');
  assert.equal(okOutcome.ok, true);
  assert.equal(okOutcome.httpStatus, 200);
  assert.match(okOutcome.message, /HTTP 200/);
  assert.match(okOutcome.message, /pii_masked_v1/);
  assert.equal(okOutcome.message.includes('jwt-admin-secret'), false);
});

test('frontend e rota temporária mantêm segredos e escopos isolados no servidor sem VITE_', () => {
  const routeSource = fs.readFileSync(
    path.resolve(process.cwd(), 'api/administra-s2s-barragens-test.ts'),
    'utf8'
  );
  assert.equal(routeSource.includes('VITE_'), false);
  assert.equal(routeSource.includes('SERVICE_ROLE'), false);

  const clientRoots = ['src', 'components', 'App.tsx'];
  const forbiddenInClient = [
    'CLASSIFICA_S2S_BARRAGENS_TEST_ENABLED',
    'CLASSIFICA_S2S_PRIVATE_KEY',
    'CLASSIFICA_S2S_KID',
    'ADMINISTRA_API_BASE_URL',
    'barragens:read',
    'administraS2sBarragensTest',
  ];

  const collectTsFiles = (entry: string): string[] => {
    const full = path.resolve(process.cwd(), entry);
    if (!fs.existsSync(full)) return [];
    const stat = fs.statSync(full);
    if (stat.isFile()) return [full];
    const files: string[] = [];
    for (const item of fs.readdirSync(full)) {
      files.push(...collectTsFiles(path.join(entry, item)));
    }
    return files;
  };

  for (const root of clientRoots) {
    for (const filePath of collectTsFiles(root)) {
      const content = fs.readFileSync(filePath, 'utf8');
      for (const forbidden of forbiddenInClient) {
        assert.equal(
          content.includes(forbidden),
          false,
          `${filePath} não deve referenciar ${forbidden}`
        );
      }
    }
  }

  const cardSource = fs.readFileSync(
    path.resolve(process.cwd(), 'components/AdministraS2sBarragensTempTestCard.tsx'),
    'utf8'
  );
  assert.equal(cardSource.includes('console.'), false);
  assert.equal(cardSource.includes('VITE_'), false);
});
