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

test('fetchBarragensV2Page realiza chamada autenticada para barragens_v2, preserva DTO v2 e navega por cursor sem repetir ou pular páginas', async () => {
  const { fetchBarragensV2Page, fetchBarragensPage, searchBarragens } = await import(
    '../src/services/administraService'
  );
  const { advanceBarragensV2Cursor, retreatBarragensV2Cursor } = await import(
    '../components/EcosystemHub'
  );

  assert.equal(typeof fetchBarragensPage, 'function');
  assert.equal(typeof searchBarragens, 'function');

  // 1. Sem sessão autenticada -> falha fechado com 401
  const unauth = await fetchBarragensV2Page(
    { limit: 25 },
    { getAccessToken: async () => null }
  );
  assert.equal(unauth.ok, false);
  assert.equal(unauth.data.length, 0);
  assert.equal(unauth.maskingPolicy, null);
  assert.equal(unauth.error?.code, 'AUTH_REQUIRED');

  // 2. Fluxo completo contra createAdministraLeituraHandler com 2 páginas via cursor
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

  const mockAdministra = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const cursor = parsedUrl.searchParams.get('cursor');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('x-masking-policy', 'masked');

    if (!cursor) {
      res.end(
        JSON.stringify({
          maskingPolicy: 'masked',
          pagination: {
            limit: 25,
            nextCursor: 'cursor-p2-opaco',
            hasMore: true,
            total: 2,
          },
          items: [
            {
              id: 'bar-v2-p1',
              nome: 'Barragem Página 1',
              uf: 'MT',
              municipio: 'Cuiabá',
              snisb: 'SNISB-01',
              situacao: 'Ativa',
              dano_potencial: 'Alto',
              categoria_risco: 'Médio',
              observacoes: 'Campo proibido não deve vazar',
            },
          ],
        })
      );
      return;
    }

    assert.equal(cursor, 'cursor-p2-opaco');
    res.end(
      JSON.stringify({
        maskingPolicy: 'masked',
        pagination: {
          limit: 25,
          nextCursor: null,
          hasMore: false,
          total: 2,
        },
        items: [
          {
            id: 'bar-v2-p2',
            nome: 'Barragem Página 2',
            uf: 'MT',
            municipio: 'Sinop',
            snisb: null,
            situacao: 'Inativa',
            dano_potencial: 'Baixo',
            categoria_risco: 'Baixo',
          },
        ],
      })
    );
  });

  await new Promise<void>((resolve) => {
    mockAdministra.listen(0, '127.0.0.1', () => resolve());
  });

  const sentPayloads: Array<Record<string, unknown>> = [];
  const sentAuthHeaders: Array<string | null> = [];

  try {
    const addr = mockAdministra.address();
    assert.ok(addr && typeof addr !== 'string');
    const mockBaseUrl = `http://127.0.0.1:${addr.port}`;

    await withServer(
      {
        leituraDeps: {
          verifySession: async (token) =>
            token === 'session-jwt-teste'
              ? {
                  ok: true,
                  userId: 'user-1',
                  classificaUrl: 'https://classifica.example.supabase.co',
                }
              : {
                  ok: false,
                  status: 401,
                  code: 'INVALID_SESSION',
                  error: 'Sessão inválida.',
                },
          s2sEnv: {
            ADMINISTRA_API_BASE_URL: mockBaseUrl,
            CLASSIFICA_S2S_KID: 'classifica-ed25519-test',
            CLASSIFICA_S2S_PRIVATE_KEY: privateKeyPem,
          },
        },
      },
      async (baseUrl) => {
        const sentInputs: Array<string> = [];
        const trackedFetch: typeof fetch = (input, init) => {
          assert.equal(input, '/api/administra-leitura');
          sentInputs.push(String(input));
          const headers = new Headers(init?.headers);
          sentAuthHeaders.push(headers.get('Authorization'));
          sentPayloads.push(JSON.parse(String(init?.body || '{}')) as Record<string, unknown>);
          return fetch(`${baseUrl}/api/administra-leitura`, init);
        };

        let cursorState = { cursorHistory: [null] as Array<string | null>, cursorPageIndex: 0 };

        // Página 1 (inclui tentativa indevida de sobrescrita de endpointUrl via cast -> deve ser ignorada)
        const page1 = await fetchBarragensV2Page(
          { limit: 25, cursor: cursorState.cursorHistory[cursorState.cursorPageIndex] },
          {
            getAccessToken: async () => 'session-jwt-teste',
            fetchImpl: trackedFetch,
            ...({ endpointUrl: 'https://evil.example/leak' } as Record<string, unknown>),
          }
        );

        assert.equal(page1.ok, true);
        assert.equal(page1.maskingPolicy, 'masked');
        assert.equal(page1.data.length, 1);
        assert.equal(page1.data[0].id, 'bar-v2-p1');
        assert.equal(page1.data[0].nome, 'Barragem Página 1');
        assert.equal(page1.data[0].car, null);
        assert.equal('observacoes' in page1.data[0], false);
        assert.deepEqual(sentPayloads[0], { action: 'barragens_v2', limit: 25 });
        assert.equal(sentAuthHeaders[0], 'Bearer session-jwt-teste');
        assert.equal(sentInputs[0], '/api/administra-leitura');

        // Avança para Página 2 usando cursor retornado
        cursorState = advanceBarragensV2Cursor(cursorState, page1.pagination);
        assert.equal(cursorState.cursorPageIndex, 1);
        assert.equal(cursorState.cursorHistory[1], 'cursor-p2-opaco');

        const page2 = await fetchBarragensV2Page(
          { limit: 25, cursor: cursorState.cursorHistory[cursorState.cursorPageIndex] },
          {
            getAccessToken: async () => 'session-jwt-teste',
            fetchImpl: trackedFetch,
          }
        );

        assert.equal(page2.ok, true);
        assert.equal(page2.data[0].id, 'bar-v2-p2');
        assert.equal(page2.data[0].snisb, null);
        assert.equal(page2.pagination.hasMore, false);
        assert.equal(page2.pagination.nextCursor, null);
        assert.deepEqual(sentPayloads[1], {
          action: 'barragens_v2',
          limit: 25,
          cursor: 'cursor-p2-opaco',
        });

        // Próxima quando hasMore=false não altera estado
        const noAdvance = advanceBarragensV2Cursor(cursorState, page2.pagination);
        assert.deepEqual(noAdvance, cursorState);

        // Volta para Página 1 usando histórico de cursor
        cursorState = retreatBarragensV2Cursor(cursorState);
        assert.equal(cursorState.cursorPageIndex, 0);
        assert.equal(cursorState.cursorHistory[cursorState.cursorPageIndex], null);

        const backToPage1 = await fetchBarragensV2Page(
          { limit: 25, cursor: cursorState.cursorHistory[cursorState.cursorPageIndex] },
          {
            getAccessToken: async () => 'session-jwt-teste',
            fetchImpl: trackedFetch,
          }
        );
        assert.equal(backToPage1.ok, true);
        assert.equal(backToPage1.data[0].id, 'bar-v2-p1');
        assert.deepEqual(sentPayloads[2], { action: 'barragens_v2', limit: 25 });
      }
    );
  } finally {
    mockAdministra.closeAllConnections?.();
    await new Promise<void>((resolve, reject) => {
      mockAdministra.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

test('fetchBarragensV2Page rejeita maskingPolicy diferente de masked e trata erro de endpoint/rede sem vazar token ou cursor', async () => {
  const { fetchBarragensV2Page } = await import('../src/services/administraService');

  // maskingPolicy inválido -> falha fechado
  const unmasked = await fetchBarragensV2Page(
    { limit: 25, cursor: 'CURSOR_SECRETO_123' },
    {
      getAccessToken: async () => 'TOKEN_SECRETO_XYZ',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            ok: true,
            maskingPolicy: 'unmasked',
            pagination: { limit: 25, nextCursor: null, hasMore: false, total: 1 },
            items: [{ id: 'bar-leak', nome: 'Não Deve Aparecer' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        ),
    }
  );
  assert.equal(unmasked.ok, false);
  assert.equal(unmasked.maskingPolicy, null);
  assert.equal(unmasked.data.length, 0);
  assert.equal(unmasked.error?.code, 'INVALID_MASKING_POLICY');

  // Erro de rede contendo valores sensíveis -> mensagem sanitizada
  const networkErr = await fetchBarragensV2Page(
    { limit: 25, cursor: 'CURSOR_SECRETO_123' },
    {
      getAccessToken: async () => 'TOKEN_SECRETO_XYZ',
      fetchImpl: async () => {
        throw new Error('ECONNREFUSED TOKEN_SECRETO_XYZ CURSOR_SECRETO_123');
      },
    }
  );
  assert.equal(networkErr.ok, false);
  assert.equal(networkErr.data.length, 0);
  assert.equal(networkErr.maskingPolicy, null);
  assert.equal(networkErr.error?.userMessage.includes('TOKEN_SECRETO_XYZ'), false);
  assert.equal(networkErr.error?.userMessage.includes('CURSOR_SECRETO_123'), false);

  // Erro HTTP 502 do endpoint -> falha fechado
  const upstreamFail = await fetchBarragensV2Page(
    { limit: 25 },
    {
      getAccessToken: async () => 'TOKEN_SECRETO_XYZ',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            ok: false,
            code: 'ADMINISTRA_V2_UPSTREAM_ERROR',
            error: 'O serviço Administra v2 recusou ou falhou ao processar a consulta.',
          }),
          { status: 502, headers: { 'Content-Type': 'application/json' } }
        ),
    }
  );
  assert.equal(upstreamFail.ok, false);
  assert.equal(upstreamFail.data.length, 0);
  assert.equal(upstreamFail.error?.status, 502);
});

test('EcosystemHub aba Barragens renderiza DTO v2 mascarado sem bloqueio pelo aviso legado, desabilita busca textual e distingue erro de lista vazia', async () => {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { EcosystemHub } = await import('../components/EcosystemHub');
  const { AuthContext } = await import('../src/contexts/AuthContext');
  const { DataContext } = await import('../src/contexts/DataContext');

  const wrap = (element: React.ReactElement) =>
    React.createElement(
      AuthContext.Provider,
      {
        value: {
          currentUser: {
            id: 'admin-1',
            authUserId: 'auth-admin-1',
            username: 'admin.teste',
            name: 'Admin Teste',
            email: 'admin@classifica.test',
            role: 'Administrador',
            active: true,
            forcePasswordChange: false,
          },
          login: async () => ({ success: false }),
          logout: async () => {},
          loading: false,
          refreshProfile: async () => {},
        },
      },
      React.createElement(
        DataContext.Provider,
        {
          value: {
            pareceres: [],
            oficios: [],
            noObligatoriedades: [],
            indeferimentos: [],
            transferencias: [],
            documents: [],
            loading: false,
            refreshData: async () => {},
            deleteParecer: async () => ({ success: false }),
            deleteOficio: async () => ({ success: false }),
            deleteNoObligatoriedade: async () => ({ success: false }),
            deleteIndeferimento: async () => ({ success: false }),
            deleteTransferencia: async () => ({ success: false }),
          },
        },
        element
      )
    );

  // 1. Lista v2 mascarada renderiza mesmo com erro/ausência de RPCs legadas (serverConfigured === false)
  const maskedHtml = renderToStaticMarkup(
    wrap(
      React.createElement(EcosystemHub, {
        initialTab: 'barragens',
        initialLegacyDiagnosticsState: {
          serverConfigured: false,
          diagnosticsError: {
            status: 503,
            code: 'ADMINISTRA_SERVER_CONFIG_MISSING',
            message: 'ADMINISTRA_SUPABASE_URL ausente.',
            userMessage: 'Configuração legada ausente.',
            isRlsOrPermission: false,
          },
          skipInitialDiagnostics: true,
        },
        initialBarragensV2State: {
          maskingPolicy: 'masked',
          limit: 25,
          cursorHistory: [null],
          cursorPageIndex: 0,
          pagination: {
            limit: 25,
            nextCursor: 'CURSOR_OPACO_SECRETO',
            hasMore: true,
            total: 12,
          },
          items: [
            {
              id: 'bar-v2-ui-1',
              nome: 'Barragem UI Piloto',
              car: null,
              uf: 'MT',
              municipio: 'Cuiabá',
              municipio_ibge: '5103403',
              empreendimento: 'UHE Teste',
              processo: 'PROC-01',
              snisb: 'SNISB-123',
              curso_agua: 'Rio Cuiabá',
              latitude: -15.6,
              longitude: -56.09,
              altura: 20,
              volume: 500000,
              dano_potencial: 'Alto',
              categoria_risco: 'Médio',
              classificada_em: '2026-01-10',
              situacao: 'Ativa',
              empreendedor_id: 'emp-1',
            },
          ],
          skipInitialFetch: true,
        },
      })
    )
  );

  // Aviso global legado preservado, mas sem bloquear a listagem v2 nem sua paginação
  assert.equal(
    maskedHtml.includes('Leitura canônica server-side do Administra Barragens indisponível'),
    true
  );
  assert.equal(maskedHtml.includes('Barragem UI Piloto'), true);
  assert.equal(maskedHtml.includes('SNISB-123'), true);
  assert.equal(
    maskedHtml.includes('15°36&#x27;00,00&quot; S / 56°05&#x27;24,00&quot; O'),
    true
  );
  assert.equal(maskedHtml.includes('-15.6 / -56.09'), false);
  assert.equal(maskedHtml.includes('Busca textual indisponível na fonte v2 de Barragens'), true);
  assert.equal(maskedHtml.includes('disabled=""'), true);
  assert.equal(maskedHtml.includes('Página 1'), true);
  assert.equal(maskedHtml.includes('Próxima'), true);
  assert.equal(maskedHtml.includes('CURSOR_OPACO_SECRETO'), false);

  // 2. Erro na ação barragens_v2 não deve parecer lista vazia
  const errorHtml = renderToStaticMarkup(
    wrap(
      React.createElement(EcosystemHub, {
        initialTab: 'barragens',
        initialLegacyDiagnosticsState: { skipInitialDiagnostics: true },
        initialBarragensV2State: {
          maskingPolicy: null,
          items: [],
          error: {
            table: 'barragens',
            code: 'ADMINISTRA_V2_UPSTREAM_ERROR',
            message: 'Falha segura v2',
            userMessage: 'Serviço Administra v2 indisponível no momento.',
            isRlsOrPermission: false,
          },
          skipInitialFetch: true,
        },
      })
    )
  );
  assert.equal(errorHtml.includes('Erro ao consultar Barragens (v2)'), true);
  assert.equal(errorHtml.includes('Serviço Administra v2 indisponível no momento.'), true);
  assert.equal(errorHtml.includes('Nenhuma barragem retornada pela consulta v2 de Barragens.'), false);

  // 3. maskingPolicy diferente de "masked" nunca exibe registros
  const unmaskedHtml = renderToStaticMarkup(
    wrap(
      React.createElement(EcosystemHub, {
        initialTab: 'barragens',
        initialLegacyDiagnosticsState: { skipInitialDiagnostics: true },
        initialBarragensV2State: {
          maskingPolicy: null,
          items: [
            {
              id: 'bar-secret',
              nome: 'Barragem Secreta Sem Mascara',
              car: null,
              uf: null,
              municipio: null,
              municipio_ibge: null,
              empreendimento: null,
              processo: null,
              snisb: null,
              curso_agua: null,
              latitude: null,
              longitude: null,
              altura: null,
              volume: null,
              dano_potencial: null,
              categoria_risco: null,
              classificada_em: null,
              situacao: null,
              empreendedor_id: null,
            },
          ],
          skipInitialFetch: true,
        },
      })
    )
  );
  assert.equal(unmaskedHtml.includes('Barragem Secreta Sem Mascara'), false);
  assert.equal(
    unmaskedHtml.includes('Leitura v2 de Barragens bloqueada por política de mascaramento'),
    true
  );

  // 4. Lista genuinamente vazia (ok + masked + 0 itens) exibe mensagem de lista vazia
  const emptyHtml = renderToStaticMarkup(
    wrap(
      React.createElement(EcosystemHub, {
        initialTab: 'barragens',
        initialLegacyDiagnosticsState: { skipInitialDiagnostics: true },
        initialBarragensV2State: {
          maskingPolicy: 'masked',
          items: [],
          pagination: { limit: 25, nextCursor: null, hasMore: false, total: 0 },
          skipInitialFetch: true,
        },
      })
    )
  );
  assert.equal(emptyHtml.includes('Nenhuma barragem retornada pela consulta v2 de Barragens.'), true);
  assert.equal(emptyHtml.includes('Erro ao consultar Barragens (v2)'), false);
});

test('mapCanonicalBarragem com source v2 e mapBarragemV2ToMaster mapeiam campos seguros e mantêm volume pendente', async () => {
  const { mapCanonicalBarragem, mapBarragemV2ToMaster } = await import(
    '../src/services/administraService'
  );

  const dtoV2Numeric = {
    id: 'bar-v2-map-1',
    nome: 'Barragem Piloto Mapeada',
    car: 'MT-CAR-001',
    uf: 'MT',
    municipio: 'Cuiabá',
    municipio_ibge: '5103403',
    empreendimento: 'UHE Empreendimento Não Derivável',
    processo: 'PROC-2026-99',
    snisb: 'SNISB-777',
    curso_agua: 'Rio Cuiabá',
    latitude: -15.601,
    longitude: '-56,097',
    altura: 32.5,
    volume: 1500000,
    dano_potencial: 'Alto',
    categoria_risco: 'Média',
    classificada_em: '2026-02-01T12:00:00Z',
    situacao: 'Ativa',
    empreendedor_id: 'emp-v2-10',
  };

  const mappedDirect = mapBarragemV2ToMaster(dtoV2Numeric);
  const mappedExplicit = mapCanonicalBarragem(dtoV2Numeric, null, { source: 'v2' });

  assert.deepEqual(mappedDirect, mappedExplicit);
  assert.equal(mappedDirect.id, 'bar-v2-map-1');
  assert.equal(mappedDirect.nome, 'Barragem Piloto Mapeada');
  assert.equal(mappedDirect.municipio, 'Cuiabá');
  assert.equal(mappedDirect.snisb, 'SNISB-777');
  assert.equal(mappedDirect.curso_agua, 'Rio Cuiabá');
  assert.equal(mappedDirect.situacao, 'Ativa');
  assert.equal(mappedDirect.empreendedor_id, 'emp-v2-10');
  assert.equal(mappedDirect.lat_decimal, -15.601);
  assert.equal(mappedDirect.long_decimal, -56.097);
  assert.equal(mappedDirect.lat_gms, '15°36\'03,60"');
  assert.equal(mappedDirect.long_gms, '56°05\'49,20"');
  assert.equal(mappedDirect.altura_maxima, '32.5');
  assert.equal(mappedDirect.dpa_atual, 'Alto');
  assert.equal(mappedDirect.cri_atual, 'Média');

  // Regra explícita: volume do DTO v2 não deve preencher volume_nmo nem volume_nmm
  assert.equal(mappedDirect.volume_nmo, null);
  assert.equal(mappedDirect.volume_nmm, null);

  // Campos ausentes no contrato v2 não devem ser inventados ou derivados
  assert.equal(mappedDirect.empreendedor_nome, null);
  assert.equal(mappedDirect.empreendedor_cpf_cnpj, null);
  assert.equal(mappedDirect.upg, null);
  assert.equal(mappedDirect.sub_bacia, null);
  assert.equal(mappedDirect.zona, null);
  assert.equal(mappedDirect.localizacao, null);
  assert.equal(mappedDirect.comprimento_coroamento, null);
  assert.equal(mappedDirect.largura_coroamento, null);
  assert.equal(mappedDirect.tipo_estrutural, null);
  assert.equal(mappedDirect.tipo_fundacao, null);
  assert.equal(mappedDirect.finalidade, null);
  assert.equal(mappedDirect.enquadramento_pnsb, null);
  assert.equal(mappedDirect.created_by_user_id, null);
  assert.equal(mappedDirect.created_by_name, null);
  assert.equal(mappedDirect.created_at, undefined);
  assert.equal(mappedDirect.updated_at, undefined);
  assert.equal(mappedDirect.sistema_origem, 'ADMINISTRA_BARRAGENS');

  // Coordenadas em GMS válido preenchem apenas GMS, sem inventar decimal
  const mappedGmsOnly = mapBarragemV2ToMaster({
    ...dtoV2Numeric,
    latitude: '15°36\'03,60" S',
    longitude: '56°05\'49,20" O',
    volume: '2500000',
  });
  assert.equal(mappedGmsOnly.lat_decimal, null);
  assert.equal(mappedGmsOnly.long_decimal, null);
  assert.equal(mappedGmsOnly.lat_gms, '15°36\'03,60"');
  assert.equal(mappedGmsOnly.long_gms, '56°05\'49,20"');
  assert.equal(mappedGmsOnly.volume_nmo, null);
  assert.equal(mappedGmsOnly.volume_nmm, null);
});

test('mapeamento v2 e normalizeCoordinateToGMS rejeitam coordenadas mascaradas, parciais, fora de faixa ou inválidas', async () => {
  const { mapBarragemV2ToMaster } = await import('../src/services/administraService');
  const { normalizeCoordinateToGMS } = await import('../src/utils/coordinateUtils');

  const invalidInputs: Array<string | number | null | undefined> = [
    '***',
    '-15.60**',
    '15°36\'**',
    '15°36\'',
    '15°',
    'mascarado',
    '[REDACTED]',
    'N/A',
    '--',
    '5103403',
    '15°75\'00,00"',
    '15°30\'65,00"',
    '185°00\'00,00"',
    999,
    NaN,
    Infinity,
    '',
    null,
  ];

  for (const bad of invalidInputs) {
    assert.equal(
      normalizeCoordinateToGMS(bad),
      '',
      `normalizeCoordinateToGMS deve rejeitar entrada inválida: ${String(bad)}`
    );
  }

  assert.equal(normalizeCoordinateToGMS('', '-15.60**'), '');
  assert.equal(normalizeCoordinateToGMS(null, -15.601), '15°36\'03,60"');
  assert.equal(normalizeCoordinateToGMS('15°36\'03,60" S'), '15°36\'03,60"');
  assert.equal(normalizeCoordinateToGMS(-15.601), '15°36\'03,60"');

  const maskedCases: Array<{ lat: string | number | null; lon: string | number | null }> = [
    { lat: '***', lon: 'mascarado' },
    { lat: '-15.60**', lon: '-56.09**' },
    { lat: '15°36\'**', lon: '56°05\'' },
    { lat: '95', lon: '185' },
    { lat: '95°00\'00,00"', lon: '181°00\'00,00"' },
    { lat: 95, lon: -181 },
    { lat: null, lon: null },
  ];

  for (const coords of maskedCases) {
    const mapped = mapBarragemV2ToMaster({
      id: 'bar-v2-mask',
      nome: 'Barragem Mascarada',
      car: null,
      uf: 'MT',
      municipio: 'Sinop',
      municipio_ibge: null,
      empreendimento: null,
      processo: null,
      snisb: null,
      curso_agua: null,
      latitude: coords.lat,
      longitude: coords.lon,
      altura: null,
      volume: 1000,
      dano_potencial: null,
      categoria_risco: null,
      classificada_em: null,
      situacao: null,
      empreendedor_id: null,
    });

    assert.equal(mapped.lat_decimal, null);
    assert.equal(mapped.long_decimal, null);
    assert.equal(mapped.lat_gms, null);
    assert.equal(mapped.long_gms, null);
    assert.equal(mapped.volume_nmo, null);
    assert.equal(mapped.volume_nmm, null);
  }
});

test('mapCanonicalBarragem preserva integralmente comportamento legado quando entrada não é v2', async () => {
  const { mapCanonicalBarragem } = await import('../src/services/administraService');

  const legacyMapped = mapCanonicalBarragem(
    {
      id: 'bar-leg-1',
      nome: 'Barragem Legada',
      municipio: 'Lucas do Rio Verde',
      snisb: 'SNISB-LEG-1',
      upg: 'UPG-01',
      sub_bacia: 'Teles Pires',
      curso_agua: 'Rio Verde',
      zona: 'Rural',
      localizacao: 'Fazenda Modelo',
      lat_decimal: -13.05,
      long_decimal: '-55,91',
      altura_maxima: '18.5',
      volume: '850000',
      volume_maximo: '920000',
      dpa_atual: 'Médio',
      cri_atual: 'Baixa',
      enquadramento_pnsb: true,
      sistema_origem: 'CLASSIFICA_CSB',
    },
    {
      id: 'emp-leg-1',
      razao_social: 'Agropecuária Legada Ltda',
      cpf_cnpj: '12345678000190',
    }
  );

  assert.equal(legacyMapped.id, 'bar-leg-1');
  assert.equal(legacyMapped.empreendedor_id, 'emp-leg-1');
  assert.equal(legacyMapped.empreendedor_nome, 'Agropecuária Legada Ltda');
  assert.equal(legacyMapped.empreendedor_cpf_cnpj, '12345678000190');
  assert.equal(legacyMapped.lat_decimal, -13.05);
  assert.equal(legacyMapped.long_decimal, -55.91);
  assert.equal(legacyMapped.lat_gms, '13°03\'00,00"');
  assert.equal(legacyMapped.long_gms, '55°54\'36,00"');
  assert.equal(legacyMapped.altura_maxima, '18.5');
  assert.equal(legacyMapped.volume_nmo, '850000');
  assert.equal(legacyMapped.volume_nmm, '920000');
  assert.equal(legacyMapped.dpa_atual, 'Médio');
  assert.equal(legacyMapped.cri_atual, 'Baixa');
  assert.equal(legacyMapped.enquadramento_pnsb, true);
  assert.equal(legacyMapped.sistema_origem, 'CLASSIFICA_CSB');
});

test('EcosystemHub tabela Barragens v2 formata coordenadas válidas em GMS com direção (S/O, N/E) e exibe — para inválidas, ausentes, mascaradas ou fora de faixa', async () => {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { EcosystemHub, formatBarragemV2CoordinateGms } = await import('../components/EcosystemHub');
  const { AuthContext } = await import('../src/contexts/AuthContext');
  const { DataContext } = await import('../src/contexts/DataContext');

  // 1. Coordenadas negativas válidas -> S para latitude, O para longitude
  assert.equal(formatBarragemV2CoordinateGms(-15.6, 'lat'), '15°36\'00,00" S');
  assert.equal(formatBarragemV2CoordinateGms(-56.09, 'long'), '56°05\'24,00" O');
  assert.equal(formatBarragemV2CoordinateGms(-15.601, 'lat'), '15°36\'03,60" S');
  assert.equal(formatBarragemV2CoordinateGms('-56,097', 'long'), '56°05\'49,20" O');
  assert.equal(formatBarragemV2CoordinateGms(-0.5, 'lat'), '00°30\'00,00" S');
  assert.equal(formatBarragemV2CoordinateGms('-0,5', 'long'), '00°30\'00,00" O');
  assert.equal(formatBarragemV2CoordinateGms('-00°30\'00,00"', 'lat'), '00°30\'00,00" S');
  assert.equal(formatBarragemV2CoordinateGms('15°36\'03,60" S', 'lat'), '15°36\'03,60" S');
  assert.equal(formatBarragemV2CoordinateGms('56°05\'49,20" W', 'long'), '56°05\'49,20" O');
  assert.equal(formatBarragemV2CoordinateGms(-90, 'lat'), '90°00\'00,00" S');
  assert.equal(formatBarragemV2CoordinateGms(-180, 'long'), '180°00\'00,00" O');

  // 2. Coordenadas positivas válidas -> N para latitude, E para longitude
  assert.equal(formatBarragemV2CoordinateGms(2.5, 'lat'), '02°30\'00,00" N');
  assert.equal(formatBarragemV2CoordinateGms(45.5, 'long'), '45°30\'00,00" E');
  assert.equal(formatBarragemV2CoordinateGms('+12.25', 'lat'), '12°15\'00,00" N');
  assert.equal(formatBarragemV2CoordinateGms('2°30\'00,00" N', 'lat'), '02°30\'00,00" N');
  assert.equal(formatBarragemV2CoordinateGms('45°30\'00,00" E', 'long'), '45°30\'00,00" E');
  assert.equal(formatBarragemV2CoordinateGms(90, 'lat'), '90°00\'00,00" N');
  assert.equal(formatBarragemV2CoordinateGms(180, 'long'), '180°00\'00,00" E');

  // 3. Valores ausentes -> —
  for (const missing of [null, undefined, '', '   ']) {
    assert.equal(formatBarragemV2CoordinateGms(missing, 'lat'), '—');
    assert.equal(formatBarragemV2CoordinateGms(missing, 'long'), '—');
  }

  // 4. Valores mascarados, parciais ou inválidos -> — (sem extrair dígitos parciais)
  const invalidOrMasked: Array<number | string> = [
    '***',
    '-15.60**',
    '15°36\'**',
    '15°36\'',
    '15°',
    'mascarado',
    '[REDACTED]',
    'N/A',
    '--',
    '5103403',
    '15°75\'00,00"',
    '15°30\'65,00"',
    '-15.60 N',
    '+56.09 O',
    NaN,
    Infinity,
    -Infinity,
  ];
  for (const bad of invalidOrMasked) {
    assert.equal(formatBarragemV2CoordinateGms(bad, 'lat'), '—');
    assert.equal(formatBarragemV2CoordinateGms(bad, 'long'), '—');
  }
  assert.equal(formatBarragemV2CoordinateGms('15°36\'03,60" O', 'lat'), '—');
  assert.equal(formatBarragemV2CoordinateGms('15°36\'03,60" S', 'long'), '—');

  // 5. Valores fora de faixa (latitude ±90°, longitude ±180°) -> —
  for (const badLat of [90.0001, -90.0001, '90.000001', '-90.000001', 91, -95, '90°00\'00,01" N', '95°00\'00,00" S']) {
    assert.equal(formatBarragemV2CoordinateGms(badLat, 'lat'), '—');
  }
  for (const badLong of [180.0001, -180.0001, '180.000001', '-180.000001', 181, -185, '180°00\'00,01" E', '181°00\'00,00" O']) {
    assert.equal(formatBarragemV2CoordinateGms(badLong, 'long'), '—');
  }

  // 6. Renderização SSR da tabela Barragens v2 no EcosystemHub
  const baseDto = {
    car: null,
    uf: 'MT',
    municipio: 'Cuiabá',
    municipio_ibge: '5103403',
    empreendimento: null,
    processo: null,
    snisb: null,
    curso_agua: null,
    altura: null,
    volume: null,
    dano_potencial: null,
    categoria_risco: null,
    classificada_em: null,
    situacao: null,
    empreendedor_id: null,
  };

  const html = renderToStaticMarkup(
    React.createElement(
      AuthContext.Provider,
      {
        value: {
          currentUser: {
            id: 'admin-1',
            authUserId: 'auth-admin-1',
            username: 'admin.teste',
            name: 'Admin Teste',
            email: 'admin@classifica.test',
            role: 'Administrador',
            active: true,
            forcePasswordChange: false,
          },
          login: async () => ({ success: false }),
          logout: async () => {},
          loading: false,
          refreshProfile: async () => {},
        },
      },
      React.createElement(
        DataContext.Provider,
        {
          value: {
            pareceres: [],
            oficios: [],
            noObligatoriedades: [],
            indeferimentos: [],
            transferencias: [],
            documents: [],
            loading: false,
            refreshData: async () => {},
            deleteParecer: async () => ({ success: false }),
            deleteOficio: async () => ({ success: false }),
            deleteNoObligatoriedade: async () => ({ success: false }),
            deleteIndeferimento: async () => ({ success: false }),
            deleteTransferencia: async () => ({ success: false }),
          },
        },
        React.createElement(EcosystemHub, {
          initialTab: 'barragens',
          initialLegacyDiagnosticsState: { skipInitialDiagnostics: true },
          initialBarragensV2State: {
            maskingPolicy: 'masked',
            limit: 25,
            cursorHistory: [null],
            cursorPageIndex: 0,
            pagination: { limit: 25, nextCursor: null, hasMore: false, total: 5 },
            skipInitialFetch: true,
            items: [
              { ...baseDto, id: 'coord-neg', nome: 'Barragem Sul Oeste', latitude: -15.601, longitude: -56.097 },
              { ...baseDto, id: 'coord-pos', nome: 'Barragem Norte Leste', latitude: 2.5, longitude: 45.5 },
              { ...baseDto, id: 'coord-miss', nome: 'Barragem Sem Coord', latitude: null, longitude: null },
              { ...baseDto, id: 'coord-mask', nome: 'Barragem Mascarada Coord', latitude: '-15.60**', longitude: '56°05\'**' },
              { ...baseDto, id: 'coord-oob', nome: 'Barragem Fora Faixa', latitude: -91.5, longitude: 181.2 },
            ],
          },
        })
      )
    )
  );

  const decodedHtml = html.replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
  assert.equal(decodedHtml.includes('15°36\'03,60" S / 56°05\'49,20" O'), true);
  assert.equal(decodedHtml.includes('02°30\'00,00" N / 45°30\'00,00" E'), true);
  assert.equal(decodedHtml.includes('-15.601'), false);
  assert.equal(decodedHtml.includes('-56.097'), false);
  assert.equal(decodedHtml.includes('-15.60**'), false);
  assert.equal(decodedHtml.includes('56°05\'**'), false);
  assert.equal(decodedHtml.includes('-91.5'), false);
  assert.equal(decodedHtml.includes('181.2'), false);
  const emDashCoordMatches = decodedHtml.match(/Lat\/Long:<\/span>\s*— \/ —/g) || [];
  assert.equal(emDashCoordMatches.length, 3);
});


