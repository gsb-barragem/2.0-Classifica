import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ADMINISTRA_MASTER_WRITE_BLOCKED_CODE,
  AdministraEscritaDeps,
  BLOCKED_WRITE_ACTIONS,
  createAdministraEscritaHandler,
} from '../api/administra-escrita';
import {
  AdministraLeituraDeps,
  createAdministraLeituraHandler,
} from '../api/administra-leitura';
import {
  buildS2sV2CanonicalString,
  canonicalizeS2sQuery,
} from '../server/administraS2sHealth';
import { createApiApp } from '../server';
import { CLASSIFICA_INTEGRATION_ARCHITECTURE } from '../src/config/integrationArchitecture';

async function withServer(
  opts: {
    escritaDeps?: AdministraEscritaDeps;
    leituraDeps?: AdministraLeituraDeps;
  },
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const escritaHandler = createAdministraEscritaHandler(opts.escritaDeps);
  const leituraHandler = createAdministraLeituraHandler(opts.leituraDeps);

  const app = createApiApp({
    administraEscrita: (req, res) => void escritaHandler(req, res),
    administraLeitura: (req, res) => void leituraHandler(req, res),
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    server.close();
    throw new Error('Falha ao alocar porta efêmera para teste HTTP.');
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

function makeFakeSupabaseReadClient(): SupabaseClient {
  const clientLike = {
    rpc: async (fnName: string) => {
      if (fnName === 'csb_ler_empreendedores') {
        return {
          data: [
            {
              id: 'emp-1',
              razao_social: 'Empreendedor Canônico Ltda',
              cpf_cnpj: '12345678000190',
              total: 1,
            },
          ],
          error: null,
          status: 200,
        };
      }
      if (fnName === 'csb_ler_barragens') {
        return {
          data: [
            {
              id: 'bar-1',
              nome: 'Barragem Canônica',
              empreendedor_id: 'emp-1',
              municipio: 'Cuiabá',
              total: 1,
            },
          ],
          error: null,
          status: 200,
        };
      }
      if (fnName === 'csb_ler_rts') {
        return {
          data: {
            total: 1,
            dados: [
              {
                id: 'rt-1',
                nome: 'Eng. Responsável Canônico',
                registro_profissional: 'CREA-MT 1000/D',
              },
            ],
          },
          error: null,
          status: 200,
        };
      }
      if (fnName === 'csb_ler_vinculos_rt_barragem') {
        return {
          data: {
            total: 1,
            dados: [
              {
                id: 'vinc-1',
                rt_id: 'rt-1',
                barragem_id: 'bar-1',
                art: 'ART-2026-001',
              },
            ],
          },
          error: null,
          status: 200,
        };
      }
      throw new Error(`RPC inesperada no cliente somente leitura: ${fnName}`);
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
          then: (resolve: (value: { data: unknown[]; error: null }) => void) =>
            Promise.resolve({ data: [], error: null }).then(resolve),
        }),
        maybeSingle: async () => ({ data: null, error: null }),
      }),
    }),
  };
  return clientLike as unknown as SupabaseClient;
}

test('/api/administra-escrita bloqueia todas as ações de escrita com HTTP 409 antes de qualquer chamada remota', async () => {
  let verifyCalls = 0;
  let clientCalls = 0;
  let fetchCalls = 0;

  await withServer(
    {
      escritaDeps: {
        verifySession: async () => {
          verifyCalls += 1;
          throw new Error('verifySession não deve ser chamado em escrita bloqueada');
        },
        getAdministraClient: () => {
          clientCalls += 1;
          throw new Error('getAdministraClient não deve ser chamado em escrita bloqueada');
        },
        fetchImpl: async () => {
          fetchCalls += 1;
          throw new Error('fetchImpl não deve ser chamado em escrita bloqueada');
        },
      },
    },
    async (baseUrl) => {
      for (const action of BLOCKED_WRITE_ACTIONS) {
        const res = await fetch(`${baseUrl}/api/administra-escrita`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer qualquer-token',
          },
          body: JSON.stringify({
            action,
            razao_social: 'Teste',
            nome: 'Teste',
            rtId: 'rt-1',
            art: 'ART-123',
          }),
        });

        assert.equal(res.status, 409, `Esperado HTTP 409 para ação bloqueada ${action}`);
        const body = (await res.json()) as Record<string, unknown>;
        assert.equal(body.ok, false);
        assert.equal(body.blocked, true);
        assert.equal(body.code, ADMINISTRA_MASTER_WRITE_BLOCKED_CODE);
      }
    }
  );

  assert.equal(verifyCalls, 0);
  assert.equal(clientCalls, 0);
  assert.equal(fetchCalls, 0);
});

test('/api/administra-escrita mantém ação somente leitura listar_arts_rt autenticada e funcional', async () => {
  let fetchCalls = 0;
  const fakeClient = makeFakeSupabaseReadClient();

  await withServer(
    {
      escritaDeps: {
        verifySession: async (token) => {
          if (token !== 'valid-read-token') {
            return {
              ok: false,
              status: 401,
              code: 'INVALID_SESSION',
              error: 'Sessão inválida.',
            };
          }
          return {
            ok: true,
            userId: 'user-1',
            userName: 'Analista Leitura',
            userRole: 'Analista',
            classificaUrl: 'https://classifica.example.supabase.co',
          };
        },
        getAdministraClient: () => ({
          ok: true,
          client: fakeClient,
          url: 'https://administra.example.supabase.co',
          secretKey: 'sb_secret_test',
          keyFormat: 'sb_secret',
        }),
        fetchImpl: async () => {
          fetchCalls += 1;
          return new Response(JSON.stringify({ definitions: {}, paths: {} }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        },
      },
    },
    async (baseUrl) => {
      const noAuth = await fetch(`${baseUrl}/api/administra-escrita`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'listar_arts_rt', rtId: 'rt-1' }),
      });
      assert.equal(noAuth.status, 401);

      const okRes = await fetch(`${baseUrl}/api/administra-escrita`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-read-token',
        },
        body: JSON.stringify({ action: 'listar_arts_rt', rtId: 'rt-1' }),
      });

      assert.equal(okRes.status, 200);
      const body = (await okRes.json()) as {
        ok: boolean;
        readOnly: boolean;
        items: Array<{ art: string; barragem_nome?: string }>;
      };
      assert.equal(body.ok, true);
      assert.equal(body.readOnly, true);
      assert.equal(body.items.length, 1);
      assert.equal(body.items[0].art, 'ART-2026-001');
      assert.equal(body.items[0].barragem_nome, 'Barragem Canônica');
      assert.equal(fetchCalls, 1);
    }
  );
});

test('/api/administra-leitura permanece separado, autenticado e funcional para leitura canônica', async () => {
  const fakeClient = makeFakeSupabaseReadClient();

  await withServer(
    {
      leituraDeps: {
        verifySession: async (token) => {
          if (token !== 'valid-session-token') {
            return {
              ok: false,
              status: 401,
              code: 'INVALID_SESSION',
              error: 'Sessão inválida.',
            };
          }
          return {
            ok: true,
            userId: 'user-1',
            classificaUrl: 'https://classifica.example.supabase.co',
          };
        },
        getAdministraClient: () => ({
          ok: true,
          client: fakeClient,
          meta: {
            administraUrlPresent: true,
            administraServiceRoleKeyPresent: true,
            administraHost: 'administra.example.supabase.co',
            keyFormat: 'sb_secret',
            role: 'service_role',
            classificaTokenForwarded: false,
          },
        }),
      },
    },
    async (baseUrl) => {
      const noTokenRes = await fetch(`${baseUrl}/api/administra-leitura`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'empreendedores' }),
      });
      assert.equal(noTokenRes.status, 401);

      const invalidTokenRes = await fetch(`${baseUrl}/api/administra-leitura`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer invalid-token',
        },
        body: JSON.stringify({ action: 'empreendedores' }),
      });
      assert.equal(invalidTokenRes.status, 401);

      const empRes = await fetch(`${baseUrl}/api/administra-leitura`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-session-token',
        },
        body: JSON.stringify({ action: 'empreendedores', busca: '' }),
      });
      assert.equal(empRes.status, 200);
      const empBody = (await empRes.json()) as {
        ok: boolean;
        items: Array<{ id: string }>;
      };
      assert.equal(empBody.ok, true);
      assert.equal(empBody.items.length, 1);
      assert.equal(empBody.items[0].id, 'emp-1');

      const diagRes = await fetch(`${baseUrl}/api/administra-leitura`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-session-token',
        },
        body: JSON.stringify({ action: 'diagnostico' }),
      });
      assert.equal(diagRes.status, 200);
      const diagBody = (await diagRes.json()) as {
        ok: boolean;
        diagnostics: Array<{ accessible: boolean }>;
      };
      assert.equal(diagBody.ok, true);
      assert.equal(diagBody.diagnostics.every((d) => d.accessible), true);
    }
  );
});

test('Arquitetura declarada e camada cliente não possuem fallback direto de escrita mestre no Administra', () => {
  assert.equal(CLASSIFICA_INTEGRATION_ARCHITECTURE.masterSourceOfTruth, 'ADMINISTRA_BARRAGENS');
  assert.equal(CLASSIFICA_INTEGRATION_ARCHITECTURE.canonicalReadApi.path, '/api/administra-leitura');
  assert.equal(CLASSIFICA_INTEGRATION_ARCHITECTURE.canonicalReadApi.blocked, false);
  assert.equal(CLASSIFICA_INTEGRATION_ARCHITECTURE.masterWriteApi.path, '/api/administra-escrita');
  assert.equal(CLASSIFICA_INTEGRATION_ARCHITECTURE.masterWriteApi.blocked, true);
  assert.equal(CLASSIFICA_INTEGRATION_ARCHITECTURE.masterWriteApi.httpStatusWhenBlocked, 409);
  assert.equal(CLASSIFICA_INTEGRATION_ARCHITECTURE.masterWriteApi.clientDirectRpcFallbackDisabled, true);

  const serviceSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/services/administraService.ts'),
    'utf8'
  );
  assert.equal(serviceSource.includes('administra_upsert_empreendedor'), false);
  assert.equal(serviceSource.includes('administra_upsert_barragem'), false);
  assert.equal(serviceSource.includes('administra_upsert_rt'), false);

  const serverEscritaSource = fs.readFileSync(
    path.resolve(process.cwd(), 'api/administra-escrita.ts'),
    'utf8'
  );
  assert.equal(serverEscritaSource.includes('csb_cadastrar_'), false);
  assert.equal(serverEscritaSource.includes('csb_vincular_'), false);
  assert.equal(serverEscritaSource.includes('administra_upsert_'), false);

  const apiFiles = fs
    .readdirSync(path.resolve(process.cwd(), 'api'))
    .filter((file) => file.endsWith('.ts'));
  assert.equal(apiFiles.length, 4);
});

test('/api/administra-leitura action barragens_v2 exige autenticação e autorização idênticas a barragens', async () => {
  let upstreamCalls = 0;

  await withServer(
    {
      leituraDeps: {
        verifySession: async (token) => {
          if (token === 'inactive-token') {
            return {
              ok: false,
              status: 403,
              code: 'FORBIDDEN_PROFILE',
              error: 'Perfil do usuário inativo ou não aprovado no Classifica CSB.',
            };
          }
          if (token !== 'valid-session-token') {
            return {
              ok: false,
              status: 401,
              code: 'INVALID_SESSION',
              error: 'Sessão inválida.',
            };
          }
          return {
            ok: true,
            userId: 'user-1',
            classificaUrl: 'https://classifica.example.supabase.co',
          };
        },
        getAdministraClient: () => {
          throw new Error('barragens_v2 não deve exigir ADMINISTRA_SUPABASE_*');
        },
        requestS2sGet: async () => {
          upstreamCalls += 1;
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'x-masking-policy': 'masked' }),
            body: { maskingPolicy: 'masked', items: [], pagination: { limit: 10, nextCursor: null, hasMore: false, total: 0 } },
          };
        },
      },
    },
    async (baseUrl) => {
      const getRes = await fetch(`${baseUrl}/api/administra-leitura`, { method: 'GET' });
      assert.equal(getRes.status, 405);

      const noAuthRes = await fetch(`${baseUrl}/api/administra-leitura`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'barragens_v2' }),
      });
      assert.equal(noAuthRes.status, 401);

      const invalidTokenRes = await fetch(`${baseUrl}/api/administra-leitura`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer wrong-token',
        },
        body: JSON.stringify({ action: 'barragens_v2' }),
      });
      assert.equal(invalidTokenRes.status, 401);

      const forbiddenRes = await fetch(`${baseUrl}/api/administra-leitura`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer inactive-token',
        },
        body: JSON.stringify({ action: 'barragens_v2' }),
      });
      assert.equal(forbiddenRes.status, 403);
    }
  );

  assert.equal(upstreamCalls, 0);
});

test('/api/administra-leitura action barragens_v2 valida estritamente parâmetros e bloqueia busca/destino arbitrário', async () => {
  let upstreamCalls = 0;

  await withServer(
    {
      leituraDeps: {
        verifySession: async () => ({
          ok: true,
          userId: 'user-1',
          classificaUrl: 'https://classifica.example.supabase.co',
        }),
        requestS2sGet: async () => {
          upstreamCalls += 1;
          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            body: { maskingPolicy: 'masked', items: [] },
          };
        },
      },
    },
    async (baseUrl) => {
      const invalidPayloads = [
        { action: 'barragens_v2', busca: 'cuiaba' },
        { action: 'barragens_v2', q: 'cuiaba' },
        { action: 'barragens_v2', path: '/api/v2/health' },
        { action: 'barragens_v2', url: 'https://evil.example/api' },
        { action: 'barragens_v2', host: 'evil.example' },
        { action: 'barragens_v2', method: 'DELETE' },
        { action: 'barragens_v2', headers: { authorization: 'x' } },
        { action: 'barragens_v2', limit: 0 },
        { action: 'barragens_v2', limit: 101 },
        { action: 'barragens_v2', limit: 1.5 },
        { action: 'barragens_v2', limit: 'abc' },
        { action: 'barragens_v2', cursor: 'cur com espaco' },
        { action: 'barragens_v2', cursor: 'cur\ninjection' },
        { action: 'barragens_v2', cursor: 123 },
      ];

      for (const payload of invalidPayloads) {
        const res = await fetch(`${baseUrl}/api/administra-leitura`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer valid-session-token',
          },
          body: JSON.stringify(payload),
        });
        assert.equal(res.status, 400, `Esperado HTTP 400 para payload ${JSON.stringify(payload)}`);
      }
    }
  );

  assert.equal(upstreamCalls, 0);
});

test('/api/administra-leitura action barragens_v2 assina S2S-V2 com query exata, funciona sem ADMINISTRA_SUPABASE_* e filtra somente DTO v2 mascarado', async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  const keyId = 'classifica-ed25519-test-v2';

  let observedMethod = '';
  let observedPath = '';
  let observedQuery = '';
  let observedContentType: string | undefined;
  let verifiedSignature = false;

  const mockAdministra = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1');
    observedMethod = req.method || '';
    observedPath = parsedUrl.pathname;
    observedQuery = parsedUrl.search.replace(/^\?/, '');
    observedContentType = req.headers['content-type'];

    const canonical = buildS2sV2CanonicalString({
      method: observedMethod,
      path: observedPath,
      query: canonicalizeS2sQuery(observedQuery),
      contentType: observedContentType || '',
      bodySha256: String(req.headers['x-s2s-body-sha256'] || ''),
      keyId: String(req.headers['x-s2s-key-id'] || ''),
      timestamp: String(req.headers['x-s2s-timestamp'] || ''),
      jti: String(req.headers['x-s2s-jti'] || ''),
    });

    verifiedSignature = crypto.verify(
      null,
      Buffer.from(canonical, 'utf8'),
      publicKey,
      Buffer.from(String(req.headers['x-s2s-signature'] || ''), 'base64')
    );

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('x-masking-policy', 'masked');
    res.end(
      JSON.stringify({
        maskingPolicy: 'masked',
        pagination: {
          limit: 25,
          nextCursor: 'cursor-page-2==',
          hasMore: true,
          total: 42,
        },
        items: [
          {
            id: 'bar-v2-1',
            nome: 'Barragem Piloto v2',
            car: 'MT-1234',
            uf: 'MT',
            municipio: 'Cuiabá',
            municipio_ibge: '5103403',
            empreendimento: 'UHE Piloto',
            processo: 'PROC-2026-01',
            snisb: 'SNISB-99',
            curso_agua: 'Rio Cuiabá',
            latitude: -15.601,
            longitude: -56.097,
            altura: 32.5,
            volume: 1500000,
            dano_potencial: 'Alto',
            categoria_risco: 'Médio',
            classificada_em: '2026-01-15T10:00:00Z',
            situacao: 'Ativa',
            empreendedor_id: 'emp-v2-1',
            observacoes: 'Campo legado não permitido no v2',
            empreendedor: 'Razão Social Não Permitida',
            created_by: 'internal-user-uuid',
            cpf_cnpj: '00.000.000/0001-00',
          },
        ],
      })
    );
  });

  await new Promise<void>((resolve) => {
    mockAdministra.listen(0, '127.0.0.1', () => resolve());
  });

  try {
    const addr = mockAdministra.address();
    assert.ok(addr && typeof addr !== 'string');
    const mockBaseUrl = `http://127.0.0.1:${addr.port}`;

    await withServer(
      {
        leituraDeps: {
          verifySession: async () => ({
            ok: true,
            userId: 'user-1',
            classificaUrl: 'https://classifica.example.supabase.co',
          }),
          getAdministraClient: () => ({
            ok: false,
            status: 503,
            code: 'ADMINISTRA_SERVER_CONFIG_MISSING',
            error: 'ADMINISTRA_SUPABASE_* ausente',
          }),
          s2sEnv: {
            ADMINISTRA_API_BASE_URL: mockBaseUrl,
            CLASSIFICA_S2S_KID: keyId,
            CLASSIFICA_S2S_PRIVATE_KEY: privateKeyPem,
          },
        },
      },
      async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/administra-leitura`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer valid-session-token',
          },
          body: JSON.stringify({
            action: 'barragens_v2',
            limit: 25,
            cursor: 'cursor-page-1==',
          }),
        });

        assert.equal(res.status, 200);
        const body = (await res.json()) as {
          ok: boolean;
          action: string;
          maskingPolicy: string;
          pagination: {
            limit: number;
            nextCursor: string | null;
            hasMore: boolean;
            total: number | null;
          };
          items: Array<Record<string, unknown>>;
        };

        assert.equal(body.ok, true);
        assert.equal(body.action, 'barragens_v2');
        assert.equal(body.maskingPolicy, 'masked');
        assert.deepEqual(body.pagination, {
          limit: 25,
          nextCursor: 'cursor-page-2==',
          hasMore: true,
          total: 42,
        });

        assert.equal(body.items.length, 1);
        const item = body.items[0];
        assert.deepEqual(Object.keys(item).sort(), [
          'altura',
          'car',
          'categoria_risco',
          'classificada_em',
          'curso_agua',
          'dano_potencial',
          'empreendedor_id',
          'empreendimento',
          'id',
          'latitude',
          'longitude',
          'municipio',
          'municipio_ibge',
          'nome',
          'processo',
          'situacao',
          'snisb',
          'uf',
          'volume',
        ]);
        assert.equal('observacoes' in item, false);
        assert.equal('empreendedor' in item, false);
        assert.equal('created_by' in item, false);
        assert.equal('cpf_cnpj' in item, false);
        assert.equal(item.id, 'bar-v2-1');
        assert.equal(item.nome, 'Barragem Piloto v2');
      }
    );

    assert.equal(observedMethod, 'GET');
    assert.equal(observedPath, '/api/v2/barragens');
    assert.equal(observedQuery, 'cursor=cursor-page-1%3D%3D&limit=25');
    assert.equal(observedContentType, undefined);
    assert.equal(verifiedSignature, true);
  } finally {
    mockAdministra.closeAllConnections?.();
    await new Promise<void>((resolve, reject) => {
      mockAdministra.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

test('/api/administra-leitura action barragens_v2 falha fechado para maskingPolicy divergente, payload inválido, erro upstream e config S2S ausente', async () => {
  // 1. Config S2S ausente -> 503 sanitizado
  await withServer(
    {
      leituraDeps: {
        verifySession: async () => ({
          ok: true,
          userId: 'user-1',
          classificaUrl: 'https://classifica.example.supabase.co',
        }),
        s2sEnv: {},
      },
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/administra-leitura`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-session-token',
        },
        body: JSON.stringify({ action: 'barragens_v2', limit: 10 }),
      });
      assert.equal(res.status, 503);
      const body = (await res.json()) as Record<string, unknown>;
      assert.equal(body.ok, false);
      assert.equal(body.code, 'ADMINISTRA_S2S_CONFIG_INVALID');
    }
  );

  // 2. Cenários de falha upstream / resposta inválida -> 502 sem dados parciais ou detalhes internos
  const scenarios: Array<{
    name: string;
    upstream: {
      ok: boolean;
      status: number;
      headers: Headers;
      body: unknown;
    };
  }> = [
    {
      name: 'maskingPolicy unmasked no body',
      upstream: {
        ok: true,
        status: 200,
        headers: new Headers({ 'x-masking-policy': 'masked' }),
        body: {
          maskingPolicy: 'unmasked',
          items: [{ id: 'b1', nome: 'Barragem 1' }],
        },
      },
    },
    {
      name: 'maskingPolicy ausente',
      upstream: {
        ok: true,
        status: 200,
        headers: new Headers(),
        body: {
          items: [{ id: 'b1', nome: 'Barragem 1' }],
        },
      },
    },
    {
      name: 'header x-masking-policy divergente',
      upstream: {
        ok: true,
        status: 200,
        headers: new Headers({ 'x-masking-policy': 'full' }),
        body: {
          maskingPolicy: 'masked',
          items: [{ id: 'b1', nome: 'Barragem 1' }],
        },
      },
    },
    {
      name: 'item inválido junto com item válido (não deve retornar parcial)',
      upstream: {
        ok: true,
        status: 200,
        headers: new Headers({ 'x-masking-policy': 'masked' }),
        body: {
          maskingPolicy: 'masked',
          items: [
            { id: 'b1', nome: 'Barragem Válida' },
            { id: 'b2', nome: '', latitude: { invalid: true } },
          ],
        },
      },
    },
    {
      name: 'body não objeto / nulo',
      upstream: {
        ok: true,
        status: 200,
        headers: new Headers({ 'x-masking-policy': 'masked' }),
        body: null,
      },
    },
    {
      name: 'erro HTTP 500 upstream com segredo simulado no body',
      upstream: {
        ok: false,
        status: 500,
        headers: new Headers(),
        body: { error: 'INTERNAL_SECRET_DETAIL_DO_NOT_LEAK', stack: 'secret' },
      },
    },
  ];

  for (const scenario of scenarios) {
    await withServer(
      {
        leituraDeps: {
          verifySession: async () => ({
            ok: true,
            userId: 'user-1',
            classificaUrl: 'https://classifica.example.supabase.co',
          }),
          requestS2sGet: async () => scenario.upstream,
        },
      },
      async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/administra-leitura`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer valid-session-token',
          },
          body: JSON.stringify({ action: 'barragens_v2', limit: 10 }),
        });

        assert.equal(res.status, 502, `Esperado 502 para cenário: ${scenario.name}`);
        const text = await res.text();
        assert.equal(text.includes('INTERNAL_SECRET_DETAIL_DO_NOT_LEAK'), false);
        assert.equal(text.includes('Barragem Válida'), false);
        const body = JSON.parse(text) as Record<string, unknown>;
        assert.equal(body.ok, false);
        assert.equal('items' in body, false);
      }
    );
  }
});
