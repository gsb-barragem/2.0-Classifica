import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createAdministraS2sHealthRouteHandler,
  type AdministraS2sHealthRouteDeps,
} from '../api/administra-s2s-health.ts';
import { createApiApp } from '../server.ts';
import { EMPTY_BODY_SHA256 } from '../server/administraS2sHealth.ts';

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

interface SqlProfileRow {
  id: string;
  auth_user_id: string | null;
  username: string;
  email: string;
  name: string;
  role: string;
  setor: string | null;
  perfil: string | null;
  matricula: string | null;
  active: boolean;
  force_password_change: boolean;
  force_password_change_at: string | null;
}

interface MockAuthUserSpec {
  id: string;
  isAdminRpc: boolean | Error;
  profileRpc: SqlProfileRow[] | Record<string, unknown> | Error | null;
}

function makeSqlProfileRow(
  overrides: Partial<SqlProfileRow> & Pick<SqlProfileRow, 'id' | 'auth_user_id'>
): SqlProfileRow {
  return {
    username: 'admin.teste',
    email: 'user@example.invalid',
    name: 'Usuário Teste',
    role: 'Administrador',
    setor: 'SETOR DE CLASSIFICAÇÃO DE BARRAGENS',
    perfil: 'Administrador',
    matricula: '0001',
    active: true,
    force_password_change: false,
    force_password_change_at: null,
    ...overrides,
  };
}

function makeMockSupabaseFactory(
  usersByToken: Record<string, MockAuthUserSpec>,
  onCreateClient?: (url: string, key: string, bearerToken: string) => void
) {
  return (
    url: string,
    key: string,
    bearerToken: string
  ): SupabaseClient => {
    onCreateClient?.(url, key, bearerToken);
    const spec = usersByToken[bearerToken];
    const clientLike = {
      auth: {
        getUser: async (token: string) => {
          const found = usersByToken[token];
          if (!found) {
            return {
              data: { user: null },
              error: { message: 'Invalid JWT' },
            };
          }
          return {
            data: { user: { id: found.id, email: 'user@example.invalid' } },
            error: null,
          };
        },
      },
      rpc: async (fnName: string) => {
        if (!spec) {
          return { data: null, error: { message: 'Unauthorized' } };
        }
        if (fnName === 'classifica_is_admin') {
          if (spec.isAdminRpc instanceof Error) {
            return {
              data: null,
              error: { message: spec.isAdminRpc.message },
            };
          }
          return { data: spec.isAdminRpc, error: null };
        }
        if (fnName === 'classifica_my_profile') {
          if (spec.profileRpc instanceof Error) {
            return {
              data: null,
              error: { message: spec.profileRpc.message },
            };
          }
          return { data: spec.profileRpc, error: null };
        }
        return { data: null, error: { message: `Unknown RPC ${fnName}` } };
      },
    };
    return clientLike as unknown as SupabaseClient;
  };
}

async function withRouteServer(
  deps: AdministraS2sHealthRouteDeps,
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const routeHandler = createAdministraS2sHealthRouteHandler(deps);
  const app = createApiApp({
    administraS2sHealth: (req, res) => void routeHandler(req, res),
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    server.close();
    throw new Error('Falha ao alocar porta efêmera para teste da rota.');
  }

  const baseUrl = `http://127.0.0.1:${addr.port}`;
  try {
    await run(baseUrl);
  } finally {
    server.closeAllConnections?.();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

const DEFAULT_USERS: Record<string, MockAuthUserSpec> = {
  'token-admin-1': {
    id: '11111111-1111-4111-8111-111111111111',
    isAdminRpc: true,
    profileRpc: [
      makeSqlProfileRow({
        id: 'aaaa1111-1111-4111-8111-111111111111',
        auth_user_id: '11111111-1111-4111-8111-111111111111',
        role: 'Administrador',
      }),
    ],
  },
  'token-admin-2': {
    id: '22222222-2222-4222-8222-222222222222',
    isAdminRpc: true,
    profileRpc: [
      makeSqlProfileRow({
        id: 'aaaa2222-2222-4222-8222-222222222222',
        auth_user_id: '22222222-2222-4222-8222-222222222222',
        role: 'Administrador',
      }),
    ],
  },
  'token-admin-3': {
    id: '22222222-2222-4222-8222-333333333333',
    isAdminRpc: true,
    profileRpc: [
      makeSqlProfileRow({
        id: 'aaaa3333-3333-4333-8333-333333333333',
        auth_user_id: '22222222-2222-4222-8222-333333333333',
        role: 'Administrador',
      }),
    ],
  },
  'token-analista': {
    id: '33333333-3333-4333-8333-333333333333',
    isAdminRpc: false,
    profileRpc: [
      makeSqlProfileRow({
        id: 'bbbb3333-3333-4333-8333-333333333333',
        auth_user_id: '33333333-3333-4333-8333-333333333333',
        role: 'Analista',
      }),
    ],
  },
  'token-is-admin-false': {
    id: '33333333-3333-4333-8333-444444444444',
    isAdminRpc: false,
    profileRpc: [
      makeSqlProfileRow({
        id: 'bbbb4444-4444-4444-8444-444444444444',
        auth_user_id: '33333333-3333-4333-8333-444444444444',
        role: 'Administrador',
      }),
    ],
  },
  'token-inativo': {
    id: '44444444-4444-4444-8444-444444444444',
    isAdminRpc: true,
    profileRpc: [
      makeSqlProfileRow({
        id: 'cccc4444-4444-4444-8444-444444444444',
        auth_user_id: '44444444-4444-4444-8444-444444444444',
        role: 'Administrador',
        active: false,
      }),
    ],
  },
  'token-troca-senha': {
    id: '55555555-5555-4555-8555-555555555555',
    isAdminRpc: true,
    profileRpc: [
      makeSqlProfileRow({
        id: 'dddd5555-5555-4555-8555-555555555555',
        auth_user_id: '55555555-5555-4555-8555-555555555555',
        role: 'Administrador',
        force_password_change: true,
      }),
    ],
  },
  'token-mismatch': {
    id: '66666666-6666-4666-8666-666666666666',
    isAdminRpc: true,
    profileRpc: [
      makeSqlProfileRow({
        id: 'eeee6666-6666-4666-8666-666666666666',
        auth_user_id: '99999999-9999-4999-8999-999999999999',
        role: 'Administrador',
      }),
    ],
  },
  'token-perfil-vazio': {
    id: '66666666-6666-4666-8666-777777777777',
    isAdminRpc: true,
    profileRpc: [],
  },
  'token-perfil-contrato-invalido': {
    id: '66666666-6666-4666-8666-888888888888',
    isAdminRpc: true,
    // Objeto solto (fora do contrato RETURNS TABLE array do PostgREST)
    profileRpc: {
      id: 'ffff8888-8888-4888-8888-888888888888',
      auth_user_id: '66666666-6666-4666-8666-888888888888',
      role: 'Administrador',
      active: true,
      force_password_change: false,
    },
  },
  'token-rpc-indisponivel': {
    id: '77777777-7777-4777-8777-777777777777',
    isAdminRpc: new Error('RPC unavailable'),
    profileRpc: null,
  },
};

function makeBaseEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    SUPABASE_URL: 'https://classifica-auth.example.invalid',
    SUPABASE_ANON_KEY: 'anon-placeholder-for-test',
    CLASSIFICA_S2S_HEALTH_TEST_ENABLED: 'true',
    ...overrides,
  };
}

test('rota S2S temporária rejeita métodos diferentes de POST com HTTP 405 sem executar S2S', async () => {
  let healthCalls = 0;

  await withRouteServer(
    {
      env: makeBaseEnv(),
      createSupabaseClient: makeMockSupabaseFactory(DEFAULT_USERS),
      rateLimitStore: new Map(),
      runHealthCheck: async () => {
        healthCalls += 1;
        throw new Error('Não deve executar');
      },
    },
    async (baseUrl) => {
      for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) {
        const res = await fetch(`${baseUrl}/api/administra-s2s-health`, {
          method,
          headers: { Authorization: 'Bearer token-admin-1' },
        });
        assert.equal(res.status, 405);
        assert.equal(res.headers.get('allow'), 'POST');
        const body = (await res.json()) as Record<string, unknown>;
        assert.equal(body.ok, false);
      }
    }
  );

  assert.equal(healthCalls, 0);
});

test('rota S2S temporária responde 404 e não executa nada quando CLASSIFICA_S2S_HEALTH_TEST_ENABLED não é exatamente "true"', async () => {
  for (const flagValue of [undefined, '', 'false', 'TRUE', '1']) {
    let authCalls = 0;
    let healthCalls = 0;

    await withRouteServer(
      {
        env: makeBaseEnv({ CLASSIFICA_S2S_HEALTH_TEST_ENABLED: flagValue }),
        createSupabaseClient: (...args) => {
          authCalls += 1;
          return makeMockSupabaseFactory(DEFAULT_USERS)(...args);
        },
        rateLimitStore: new Map(),
        runHealthCheck: async () => {
          healthCalls += 1;
          throw new Error('Não deve executar com flag desativada');
        },
      },
      async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/administra-s2s-health`, {
          method: 'POST',
          headers: { Authorization: 'Bearer token-admin-1' },
        });
        assert.equal(res.status, 404);
        const body = (await res.json()) as Record<string, unknown>;
        assert.deepEqual(body, { ok: false, error: 'Recurso indisponível.' });
      }
    );

    assert.equal(authCalls, 0);
    assert.equal(healthCalls, 0);
  }
});

test('verifyStrictAdminSession exige chave anon do Classifica, nunca usa service_role e falha fechado com 503', async () => {
  let clientCreateCalls = 0;
  let healthCalls = 0;

  await withRouteServer(
    {
      env: {
        SUPABASE_URL: 'https://classifica-auth.example.invalid',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-nao-deve-ser-usada',
        CLASSIFICA_SUPABASE_SERVICE_ROLE_KEY: 'service-role-nao-deve-ser-usada-2',
        CLASSIFICA_S2S_HEALTH_TEST_ENABLED: 'true',
      },
      createSupabaseClient: (...args) => {
        clientCreateCalls += 1;
        return makeMockSupabaseFactory(DEFAULT_USERS)(...args);
      },
      rateLimitStore: new Map(),
      runHealthCheck: async () => {
        healthCalls += 1;
        throw new Error('Não deve executar sem chave anon');
      },
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/administra-s2s-health`, {
        method: 'POST',
        headers: { Authorization: 'Bearer token-admin-1' },
      });
      assert.equal(res.status, 503);
      const body = (await res.json()) as Record<string, unknown>;
      assert.equal(body.ok, false);
    }
  );

  assert.equal(clientCreateCalls, 0);
  assert.equal(healthCalls, 0);

  const routeSource = fs.readFileSync(
    path.resolve(process.cwd(), 'api/administra-s2s-health.ts'),
    'utf8'
  );
  assert.equal(routeSource.includes('SERVICE_ROLE_KEY'), false);
});

test('rota S2S temporária exige Authorization Bearer (rejeita ausência, cookie e token inválido com 401)', async () => {
  let healthCalls = 0;

  await withRouteServer(
    {
      env: makeBaseEnv(),
      createSupabaseClient: makeMockSupabaseFactory(DEFAULT_USERS),
      rateLimitStore: new Map(),
      runHealthCheck: async () => {
        healthCalls += 1;
        throw new Error('Não deve executar sem autenticação válida');
      },
    },
    async (baseUrl) => {
      const noAuth = await fetch(`${baseUrl}/api/administra-s2s-health`, {
        method: 'POST',
      });
      assert.equal(noAuth.status, 401);

      const cookieOnly = await fetch(`${baseUrl}/api/administra-s2s-health`, {
        method: 'POST',
        headers: { Cookie: 'sb-access-token=token-admin-1' },
      });
      assert.equal(cookieOnly.status, 401);

      const invalidToken = await fetch(`${baseUrl}/api/administra-s2s-health`, {
        method: 'POST',
        headers: { Authorization: 'Bearer token-desconhecido' },
      });
      assert.equal(invalidToken.status, 401);
    }
  );

  assert.equal(healthCalls, 0);
});

test('rota S2S temporária falha fechado para não administrador, inativo, troca de senha, auth_user_id divergente, array vazio e contrato/RPC indisponível', async () => {
  let healthCalls = 0;

  await withRouteServer(
    {
      env: makeBaseEnv(),
      createSupabaseClient: makeMockSupabaseFactory(DEFAULT_USERS),
      rateLimitStore: new Map(),
      runHealthCheck: async () => {
        healthCalls += 1;
        throw new Error('Não deve executar sem Administrador ativo válido');
      },
    },
    async (baseUrl) => {
      const analista = await fetch(`${baseUrl}/api/administra-s2s-health`, {
        method: 'POST',
        headers: { Authorization: 'Bearer token-analista' },
      });
      assert.equal(analista.status, 403);

      const isAdminFalse = await fetch(`${baseUrl}/api/administra-s2s-health`, {
        method: 'POST',
        headers: { Authorization: 'Bearer token-is-admin-false' },
      });
      assert.equal(isAdminFalse.status, 403);

      const inativo = await fetch(`${baseUrl}/api/administra-s2s-health`, {
        method: 'POST',
        headers: { Authorization: 'Bearer token-inativo' },
      });
      assert.equal(inativo.status, 403);

      const trocaSenha = await fetch(`${baseUrl}/api/administra-s2s-health`, {
        method: 'POST',
        headers: { Authorization: 'Bearer token-troca-senha' },
      });
      assert.equal(trocaSenha.status, 403);

      const mismatch = await fetch(`${baseUrl}/api/administra-s2s-health`, {
        method: 'POST',
        headers: { Authorization: 'Bearer token-mismatch' },
      });
      assert.equal(mismatch.status, 403);

      const perfilVazio = await fetch(`${baseUrl}/api/administra-s2s-health`, {
        method: 'POST',
        headers: { Authorization: 'Bearer token-perfil-vazio' },
      });
      assert.equal(perfilVazio.status, 403);

      const contratoInvalido = await fetch(`${baseUrl}/api/administra-s2s-health`, {
        method: 'POST',
        headers: { Authorization: 'Bearer token-perfil-contrato-invalido' },
      });
      assert.equal(contratoInvalido.status, 503);

      const rpcIndisponivel = await fetch(`${baseUrl}/api/administra-s2s-health`, {
        method: 'POST',
        headers: { Authorization: 'Bearer token-rpc-indisponivel' },
      });
      assert.equal(rpcIndisponivel.status, 503);
    }
  );

  assert.equal(healthCalls, 0);
});

test('rota S2S temporária executa chamada S2S-V2 simulada com chave efêmera, usa apenas anon key, rejeita entradas do cliente, aplica cooldown 60s limitado em memória e retorna apenas { ok, status }', async () => {
  const { privateKeyPem, publicKey } = generateEphemeralEd25519Pair();
  const kid = 'classifica-route-test-kid';

  let upstreamCallCount = 0;
  let lastObservedUrl = '';
  let lastObservedMethod = '';
  let lastVerifiedSignature = false;
  const observedClientKeys: string[] = [];

  const mockAdministraServer = http.createServer((req, res) => {
    upstreamCallCount += 1;
    lastObservedUrl = req.url || '';
    lastObservedMethod = req.method || '';

    const canonical = [
      'S2S-V2',
      req.method || '',
      req.url || '',
      '',
      '',
      String(req.headers['x-s2s-body-sha256'] || ''),
      String(req.headers['x-s2s-key-id'] || ''),
      String(req.headers['x-s2s-timestamp'] || ''),
      String(req.headers['x-s2s-jti'] || ''),
      '|',
    ].join('\n');

    lastVerifiedSignature = crypto.verify(
      null,
      Buffer.from(canonical, 'utf8'),
      publicKey,
      Buffer.from(String(req.headers['x-s2s-signature'] || ''), 'base64')
    );

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        ok: true,
        internalSecretField: 'nao-deve-vazar',
        databaseHost: 'interno.local',
      })
    );
  });

  await new Promise<void>((resolve) => {
    mockAdministraServer.listen(0, '127.0.0.1', () => resolve());
  });

  try {
    const addr = mockAdministraServer.address();
    assert.ok(addr && typeof addr !== 'string');
    const administraBaseUrl = `http://127.0.0.1:${addr.port}`;

    let currentNowMs = 1_700_000_000_000;
    const rateLimitStore = new Map<string, number>();

    await withRouteServer(
      {
        env: makeBaseEnv({
          ADMINISTRA_API_BASE_URL: administraBaseUrl,
          CLASSIFICA_S2S_KID: kid,
          CLASSIFICA_S2S_PRIVATE_KEY: privateKeyPem,
          SUPABASE_SERVICE_ROLE_KEY: 'service-role-ignorada',
        }),
        createSupabaseClient: makeMockSupabaseFactory(
          DEFAULT_USERS,
          (_url, key) => {
            observedClientKeys.push(key);
          }
        ),
        rateLimitStore,
        maxRateLimitEntries: 2,
        now: () => currentNowMs,
      },
      async (baseUrl) => {
        // Rejeita tentativa de enviar URL/corpo/parâmetros do cliente
        const badBody = await fetch(`${baseUrl}/api/administra-s2s-health`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer token-admin-1',
          },
          body: JSON.stringify({ url: 'https://evil.invalid' }),
        });
        assert.equal(badBody.status, 400);
        assert.equal(upstreamCallCount, 0);

        const badQuery = await fetch(
          `${baseUrl}/api/administra-s2s-health?target=https://evil.invalid`,
          {
            method: 'POST',
            headers: { Authorization: 'Bearer token-admin-1' },
          }
        );
        assert.equal(badQuery.status, 400);
        assert.equal(upstreamCallCount, 0);

        // Chamada válida pelo Administrador 1
        const okRes = await fetch(`${baseUrl}/api/administra-s2s-health`, {
          method: 'POST',
          headers: { Authorization: 'Bearer token-admin-1' },
        });
        assert.equal(okRes.status, 200);
        const okJson = (await okRes.json()) as Record<string, unknown>;
        assert.deepEqual(Object.keys(okJson).sort(), ['ok', 'status']);
        assert.deepEqual(okJson, { ok: true, status: 200 });
        assert.equal(upstreamCallCount, 1);
        assert.equal(lastObservedMethod, 'GET');
        assert.equal(lastObservedUrl, '/api/v2/health');
        assert.equal(lastVerifiedSignature, true);
        assert.ok(
          observedClientKeys.every((k) => k === 'anon-placeholder-for-test')
        );

        // Segunda chamada do mesmo Administrador dentro de 60s -> 429
        currentNowMs += 30_000;
        const rateLimited = await fetch(`${baseUrl}/api/administra-s2s-health`, {
          method: 'POST',
          headers: { Authorization: 'Bearer token-admin-1' },
        });
        assert.equal(rateLimited.status, 429);
        assert.equal(rateLimited.headers.get('retry-after'), '30');
        assert.equal(upstreamCallCount, 1);

        // Outro Administrador autenticado não é bloqueado pelo cooldown do Admin 1
        const admin2Res = await fetch(`${baseUrl}/api/administra-s2s-health`, {
          method: 'POST',
          headers: { Authorization: 'Bearer token-admin-2' },
        });
        assert.equal(admin2Res.status, 200);
        assert.equal(upstreamCallCount, 2);
        assert.equal(rateLimitStore.size, 2);

        // Terceiro Administrador na mesma janela respeita teto maxRateLimitEntries = 2
        const admin3Res = await fetch(`${baseUrl}/api/administra-s2s-health`, {
          method: 'POST',
          headers: { Authorization: 'Bearer token-admin-3' },
        });
        assert.equal(admin3Res.status, 200);
        assert.equal(upstreamCallCount, 3);
        assert.equal(rateLimitStore.size, 2);
        assert.equal(
          rateLimitStore.has(DEFAULT_USERS['token-admin-1'].id),
          false
        );

        // Após expirar os 60s completos de Admin 2/3, limpeza previsível remove entradas vencidas
        currentNowMs += 60_000;
        const afterCooldown = await fetch(`${baseUrl}/api/administra-s2s-health`, {
          method: 'POST',
          headers: { Authorization: 'Bearer token-admin-1' },
        });
        assert.equal(afterCooldown.status, 200);
        assert.equal(upstreamCallCount, 4);
        assert.equal(rateLimitStore.size, 1);
        assert.equal(
          rateLimitStore.has(DEFAULT_USERS['token-admin-1'].id),
          true
        );
      }
    );
  } finally {
    mockAdministraServer.closeAllConnections?.();
    await new Promise<void>((resolve, reject) => {
      mockAdministraServer.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

test('falha upstream ou de configuração retorna erro genérico sem vazar URL, chave, assinatura, JTI, timestamp ou corpo upstream', async () => {
  const secretMarker = 'SIG-SENSIVEL-NAO-VAZAR';
  const upstreamUrlMarker = 'https://administra-interno.exemplo.invalid';
  const jtiMarker = 'jti-sensivel-1234';

  await withRouteServer(
    {
      env: makeBaseEnv({
        ADMINISTRA_API_BASE_URL: upstreamUrlMarker,
      }),
      createSupabaseClient: makeMockSupabaseFactory(DEFAULT_USERS),
      rateLimitStore: new Map(),
      runHealthCheck: async () => ({
        ok: false,
        status: 503,
        url: `${upstreamUrlMarker}/api/v2/health`,
        keyId: 'kid-sensivel',
        timestamp: '1764000000',
        jti: jtiMarker,
        bodySha256: EMPTY_BODY_SHA256,
        body: { detail: `${secretMarker} stacktrace interno` },
      }),
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/administra-s2s-health`, {
        method: 'POST',
        headers: { Authorization: 'Bearer token-admin-1' },
      });
      assert.equal(res.status, 502);
      const rawText = await res.text();
      assert.equal(rawText.includes(secretMarker), false);
      assert.equal(rawText.includes(upstreamUrlMarker), false);
      assert.equal(rawText.includes(jtiMarker), false);
      assert.equal(rawText.includes('kid-sensivel'), false);
      assert.equal(rawText.includes('1764000000'), false);
      assert.deepEqual(JSON.parse(rawText), {
        ok: false,
        error: 'Falha na verificação S2S-V2.',
      });
    }
  );
});

test('rota temporária e suas variáveis não usam VITE_ nem são referenciadas no frontend', () => {
  const routeSource = fs.readFileSync(
    path.resolve(process.cwd(), 'api/administra-s2s-health.ts'),
    'utf8'
  );
  assert.equal(routeSource.includes('VITE_'), false);

  const clientRoots = ['src', 'components', 'App.tsx'];
  const forbiddenNames = [
    'CLASSIFICA_S2S_HEALTH_TEST_ENABLED',
    'CLASSIFICA_S2S_PRIVATE_KEY',
    'CLASSIFICA_S2S_KID',
    'ADMINISTRA_API_BASE_URL',
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
      for (const name of forbiddenNames) {
        assert.equal(
          content.includes(name),
          false,
          `${filePath} não deve referenciar ${name}`
        );
      }
    }
  }
});
