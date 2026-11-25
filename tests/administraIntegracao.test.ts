import test from 'node:test';
import assert from 'node:assert/strict';
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
});
