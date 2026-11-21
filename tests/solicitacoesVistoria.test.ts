import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  createSolicitacoesVistoriaHandler,
  SolicitacoesVistoriaDeps,
  VerifiedActor,
} from '../api/solicitacoes-vistoria';

const ACTORS: Record<string, VerifiedActor> = {
  'token-admin': {
    canonicalUserId: 'user-admin-1',
    name: 'Administrador Geral',
    email: 'admin@sema.mt.gov.br',
    role: 'Administrador',
  },
  'token-analista-a': {
    canonicalUserId: 'user-analista-a',
    name: 'Analista A',
    email: 'analista.a@sema.mt.gov.br',
    role: 'Analista',
  },
  'token-analista-b': {
    canonicalUserId: 'user-analista-b',
    name: 'Analista B',
    email: 'analista.b@sema.mt.gov.br',
    role: 'Analista',
  },
  'token-visualizador': {
    canonicalUserId: 'user-vis-1',
    name: 'Visualizador Um',
    email: 'visualizador@sema.mt.gov.br',
    role: 'Visualizador',
  },
};

function makeVerifySession(): NonNullable<SolicitacoesVistoriaDeps['verifySession']> {
  return async (token: string) => {
    const actor = ACTORS[token];
    if (!actor) {
      return {
        ok: false,
        status: 401,
        code: 'INVALID_SESSION',
        error: 'Sessão inválida.',
      };
    }
    return { ok: true, actor };
  };
}

async function withServer(
  deps: SolicitacoesVistoriaDeps,
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const handler = createSolicitacoesVistoriaHandler(deps);
  const server = http.createServer((req, res) => {
    void handler(req, res);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    server.close();
    throw new Error('Failed to bind ephemeral port');
  }

  const baseUrl = `http://127.0.0.1:${addr.port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test('Solicitações de Vistoria API — autenticação obrigatória (401)', async () => {
  await withServer(
    {
      verifySession: makeVerifySession(),
      getConfig: () => ({ baseUrl: 'https://administra.example/api/solicitacoes-vistoria', serviceToken: 'svc-secret' }),
      fetchImpl: async () => new Response(JSON.stringify({ items: [] }), { status: 200 }),
    },
    async (baseUrl) => {
      const noAuth = await fetch(`${baseUrl}/api/solicitacoes-vistoria`);
      assert.equal(noAuth.status, 401);

      const badAuth = await fetch(`${baseUrl}/api/solicitacoes-vistoria`, {
        headers: { Authorization: 'Bearer token-invalido' },
      });
      assert.equal(badAuth.status, 401);
    }
  );
});

test('Solicitações de Vistoria API — Visualizador lê com allowlist e é bloqueado em mutações (403)', async () => {
  let capturedUpstreamUrl = '';
  const sampleItem = {
    id: 'sol-1',
    sistema_origem: 'classifica',
    status: 'pendente',
    relato: 'Solicita verificação de vertedouro.',
    barragem_id: 'bar-10',
    barragem_nome: 'Barragem Esperança',
    municipio: 'Cuiabá',
    solicitante_id: 'user-analista-a',
    solicitante_nome: 'Analista A',
    cpf_cnpj: '123.456.789-09',
    segredo_interno: 'nao-deve-vazar',
  };

  await withServer(
    {
      verifySession: makeVerifySession(),
      getConfig: () => ({ baseUrl: 'https://administra.example/api/solicitacoes-vistoria', serviceToken: 'svc-secret' }),
      fetchImpl: async (url) => {
        capturedUpstreamUrl = String(url);
        return new Response(JSON.stringify({ items: [sampleItem] }), { status: 200 });
      },
    },
    async (baseUrl) => {
      const getRes = await fetch(`${baseUrl}/api/solicitacoes-vistoria`, {
        headers: { Authorization: 'Bearer token-visualizador' },
      });
      assert.equal(getRes.status, 200);
      assert.match(capturedUpstreamUrl, /sistema_origem=classifica/);

      const getBody = (await getRes.json()) as { items: Array<Record<string, unknown>> };
      assert.equal(getBody.items.length, 1);
      assert.equal(getBody.items[0].id, 'sol-1');
      assert.equal('cpf_cnpj' in getBody.items[0], false);
      assert.equal('segredo_interno' in getBody.items[0], false);

      const postRes = await fetch(`${baseUrl}/api/solicitacoes-vistoria`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-visualizador',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ relato: 'Tentativa de criar' }),
      });
      assert.equal(postRes.status, 403);

      const patchRes = await fetch(`${baseUrl}/api/solicitacoes-vistoria/sol-1`, {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer token-visualizador',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ relato: 'Tentativa de editar' }),
      });
      assert.equal(patchRes.status, 403);

      const obsRes = await fetch(`${baseUrl}/api/solicitacoes-vistoria/sol-1/observacao`, {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer token-visualizador',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ observacao_campo: 'Tentativa' }),
      });
      assert.equal(obsRes.status, 403);
    }
  );
});

test('Solicitações de Vistoria API — POST impõe sessão verificada, valida relato e bloqueia CPF/CNPJ', async () => {
  let forwardedPayload: Record<string, unknown> | null = null;
  let forwardedAuth = '';

  await withServer(
    {
      verifySession: makeVerifySession(),
      getConfig: () => ({ baseUrl: 'https://administra.example/api/solicitacoes-vistoria', serviceToken: 'svc-secret' }),
      fetchImpl: async (_url, init) => {
        forwardedAuth = String((init?.headers as Record<string, string>)?.Authorization || '');
        forwardedPayload = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            item: {
              id: 'sol-created-1',
              status: 'pendente',
              ...forwardedPayload,
              created_at: '2026-01-01T10:00:00Z',
            },
          }),
          { status: 201 }
        );
      },
    },
    async (baseUrl) => {
      // Tentativa de falsificar solicitante e sistema_origem no body
      const okRes = await fetch(`${baseUrl}/api/solicitacoes-vistoria`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-analista-a',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sistema_origem: 'fiscaliza',
          solicitante_id: 'fake-admin-id',
          solicitante_nome: 'Falsificado',
          solicitante_email: 'fake@example.com',
          barragem_id: 'bar-123',
          barragem_nome: 'Barragem Norte',
          municipio: 'Sinop',
          empreendedor_id: 'emp-456',
          empreendedor_nome: 'Agropecuária Norte Ltda',
          relato: 'Verificação de trincas no maciço e nível de água.',
        }),
      });
      assert.equal(okRes.status, 201);
      assert.equal(forwardedAuth, 'Bearer svc-secret');
      assert.equal(forwardedPayload?.sistema_origem, 'classifica');
      assert.equal(forwardedPayload?.solicitante_id, 'user-analista-a');
      assert.equal(forwardedPayload?.solicitante_nome, 'Analista A');
      assert.equal(forwardedPayload?.solicitante_email, 'analista.a@sema.mt.gov.br');

      // Relato vazio -> 400
      const emptyRelato = await fetch(`${baseUrl}/api/solicitacoes-vistoria`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-analista-a',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ relato: '   ' }),
      });
      assert.equal(emptyRelato.status, 400);

      // Relato > 1000 caracteres -> 400
      const longRelato = await fetch(`${baseUrl}/api/solicitacoes-vistoria`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-analista-a',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ relato: 'x'.repeat(1001) }),
      });
      assert.equal(longRelato.status, 400);

      // CPF formatado no relato -> 400
      const cpfInRelato = await fetch(`${baseUrl}/api/solicitacoes-vistoria`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-analista-a',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ relato: 'Responsável CPF 123.456.789-09 presente.' }),
      });
      assert.equal(cpfInRelato.status, 400);

      // CNPJ sem máscara válido no nome do empreendedor -> 400
      const cnpjInField = await fetch(`${baseUrl}/api/solicitacoes-vistoria`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-analista-a',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          relato: 'Solicitação de inspeção.',
          empreendedor_nome: 'Empresa 11222333000181',
        }),
      });
      assert.equal(cnpjInField.status, 400);

      // Campo explícito cpf_cnpj no body -> 400
      const explicitCpfField = await fetch(`${baseUrl}/api/solicitacoes-vistoria`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-analista-a',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          relato: 'Solicitação de inspeção.',
          cpf_cnpj: '11.222.333/0001-81',
        }),
      });
      assert.equal(explicitCpfField.status, 400);

      // CPF na URL -> 400
      const cpfInUrl = await fetch(
        `${baseUrl}/api/solicitacoes-vistoria?q=123.456.789-09`,
        { headers: { Authorization: 'Bearer token-analista-a' } }
      );
      assert.equal(cpfInUrl.status, 400);
    }
  );
});

test('Solicitações de Vistoria API — edição/cancelamento restrito a autor ou Administrador', async () => {
  let currentRecord = {
    id: 'sol-20',
    sistema_origem: 'classifica',
    status: 'pendente',
    relato: 'Relato original',
    solicitante_id: 'user-analista-a',
    solicitante_nome: 'Analista A',
    solicitante_email: 'analista.a@sema.mt.gov.br',
    equipe: [],
  };

  await withServer(
    {
      verifySession: makeVerifySession(),
      getConfig: () => ({ baseUrl: 'https://administra.example/api/solicitacoes-vistoria', serviceToken: 'svc-secret' }),
      fetchImpl: async (_url, init) => {
        if ((init?.method || 'GET').toUpperCase() === 'GET') {
          return new Response(JSON.stringify({ item: currentRecord }), { status: 200 });
        }
        const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
        if (body.acao === 'cancelar') {
          currentRecord = { ...currentRecord, status: 'cancelada' };
        } else if (typeof body.relato === 'string') {
          currentRecord = { ...currentRecord, relato: body.relato };
        }
        return new Response(JSON.stringify({ item: currentRecord }), { status: 200 });
      },
    },
    async (baseUrl) => {
      // Outro analista NÃO pode editar -> 403
      const forbiddenEdit = await fetch(`${baseUrl}/api/solicitacoes-vistoria/sol-20`, {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer token-analista-b',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ relato: 'Editado por terceiro' }),
      });
      assert.equal(forbiddenEdit.status, 403);

      // Autor pode editar -> 200
      const authorEdit = await fetch(`${baseUrl}/api/solicitacoes-vistoria/sol-20`, {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer token-analista-a',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ relato: 'Relato atualizado pelo autor' }),
      });
      assert.equal(authorEdit.status, 200);
      const editedJson = (await authorEdit.json()) as { item: { relato: string } };
      assert.equal(editedJson.item.relato, 'Relato atualizado pelo autor');

      // Outro analista NÃO pode cancelar -> 403
      const forbiddenCancel = await fetch(`${baseUrl}/api/solicitacoes-vistoria/sol-20/cancelar`, {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer token-analista-b',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ motivo_cancelamento: 'Não autorizado' }),
      });
      assert.equal(forbiddenCancel.status, 403);

      // Administrador pode cancelar -> 200
      const adminCancel = await fetch(`${baseUrl}/api/solicitacoes-vistoria/sol-20/cancelar`, {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer token-admin',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ motivo_cancelamento: 'Cancelamento administrativo' }),
      });
      assert.equal(adminCancel.status, 200);
      const canceledJson = (await adminCancel.json()) as { item: { status: string } };
      assert.equal(canceledJson.item.status, 'cancelada');
    }
  );
});

test('Solicitações de Vistoria API — observacao_campo restrita a equipe ou Administrador e nunca altera status/data', async () => {
  let obsForwardedBody: Record<string, unknown> | null = null;
  let currentRecord = {
    id: 'sol-30',
    sistema_origem: 'classifica',
    status: 'realizada',
    relato: 'Vistoria concluída',
    solicitante_id: 'user-analista-a',
    solicitante_nome: 'Analista A',
    solicitante_email: 'analista.a@sema.mt.gov.br',
    vistoria_id: 'vist-99',
    data_realizacao: '2026-04-10T14:30:00Z',
    equipe: [
      { id: 'user-analista-b', nome: 'Analista B', email: 'analista.b@sema.mt.gov.br' },
    ],
    observacao_campo: null as string | null,
  };

  await withServer(
    {
      verifySession: makeVerifySession(),
      getConfig: () => ({ baseUrl: 'https://administra.example/api/solicitacoes-vistoria', serviceToken: 'svc-secret' }),
      fetchImpl: async (_url, init) => {
        if ((init?.method || 'GET').toUpperCase() === 'GET') {
          return new Response(JSON.stringify({ item: currentRecord }), { status: 200 });
        }
        obsForwardedBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
        currentRecord = {
          ...currentRecord,
          observacao_campo: (obsForwardedBody.observacao_campo as string | null) ?? null,
        };
        // Mesmo que upstream devolvesse campos diferentes, handler preserva status e data_realizacao
        return new Response(
          JSON.stringify({
            item: {
              ...currentRecord,
              status: 'pendente',
              data_realizacao: '2000-01-01T00:00:00Z',
            },
          }),
          { status: 200 }
        );
      },
    },
    async (baseUrl) => {
      // Autor da solicitação que NÃO está na equipe -> 403
      const nonTeamAuthor = await fetch(`${baseUrl}/api/solicitacoes-vistoria/sol-30/observacao`, {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer token-analista-a',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ observacao_campo: 'Não pertence à equipe' }),
      });
      assert.equal(nonTeamAuthor.status, 403);

      // Integrante da equipe atualiza observação (mesmo enviando status/data maliciosos no body) -> 200
      const teamMemberRes = await fetch(`${baseUrl}/api/solicitacoes-vistoria/sol-30/observacao`, {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer token-analista-b',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          observacao_campo: 'Observação registrada em campo pela equipe.',
          status: 'cancelada',
          data_realizacao: '1999-01-01T00:00:00Z',
        }),
      });
      assert.equal(teamMemberRes.status, 200);
      assert.equal('status' in (obsForwardedBody || {}), false);
      assert.equal('data_realizacao' in (obsForwardedBody || {}), false);

      const teamJson = (await teamMemberRes.json()) as {
        item: { status: string; data_realizacao: string; observacao_campo: string };
      };
      assert.equal(teamJson.item.status, 'realizada');
      assert.equal(teamJson.item.data_realizacao, '2026-04-10T14:30:00Z');
      assert.equal(teamJson.item.observacao_campo, 'Observação registrada em campo pela equipe.');

      // Administrador também pode atualizar observação -> 200
      const adminObsRes = await fetch(`${baseUrl}/api/solicitacoes-vistoria/sol-30/observacao`, {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer token-admin',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ observacao_campo: 'Complemento administrativo.' }),
      });
      assert.equal(adminObsRes.status, 200);

      // Observação > 1000 chars -> 400
      const longObsRes = await fetch(`${baseUrl}/api/solicitacoes-vistoria/sol-30/observacao`, {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer token-admin',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ observacao_campo: 'a'.repeat(1001) }),
      });
      assert.equal(longObsRes.status, 400);
    }
  );
});

test('Solicitações de Vistoria API — resposta controlada se env ausente (503) ou erro 409/rede no serviço central', async () => {
  // 1) Variáveis de ambiente ausentes -> 503 sem vazar token
  await withServer(
    {
      verifySession: makeVerifySession(),
      getConfig: () => null,
      fetchImpl: async () => {
        throw new Error('fetch não deve ser chamado sem configuração');
      },
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/solicitacoes-vistoria`, {
        headers: { Authorization: 'Bearer token-analista-a' },
      });
      assert.equal(res.status, 503);
      const body = (await res.json()) as { configured: boolean; ok: boolean };
      assert.equal(body.ok, false);
      assert.equal(body.configured, false);
    }
  );

  // 2) Upstream retorna 409 -> repassa 409 controlado
  await withServer(
    {
      verifySession: makeVerifySession(),
      getConfig: () => ({ baseUrl: 'https://administra.example/api/solicitacoes-vistoria', serviceToken: 'super-secret-token' }),
      fetchImpl: async () =>
        new Response(JSON.stringify({ error: 'Já existe solicitação ativa para esta barragem.' }), {
          status: 409,
        }),
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/solicitacoes-vistoria`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-analista-a',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ relato: 'Nova solicitação' }),
      });
      assert.equal(res.status, 409);
      const text = await res.text();
      assert.equal(text.includes('super-secret-token'), false);
    }
  );

  // 3) Falha de rede -> 502 controlado
  await withServer(
    {
      verifySession: makeVerifySession(),
      getConfig: () => ({ baseUrl: 'https://administra.example/api/solicitacoes-vistoria', serviceToken: 'super-secret-token' }),
      fetchImpl: async () => {
        throw new Error('ECONNREFUSED');
      },
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/solicitacoes-vistoria`, {
        headers: { Authorization: 'Bearer token-analista-a' },
      });
      assert.equal(res.status, 502);
      const text = await res.text();
      assert.equal(text.includes('super-secret-token'), false);
    }
  );
});
