import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  createSolicitacoesVistoriaHandler,
  sanitizeSolicitacao,
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
      getConfig: () => ({
        baseUrl: 'https://administra.example/api/solicitacoes-vistoria',
        serviceToken: 'svc-secret',
      }),
      fetchImpl: async () => new Response(JSON.stringify({ solicitacoes: [] }), { status: 200 }),
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

test('Solicitações de Vistoria API — Visualizador lê dados_pre_preenchidos, status solicitada e é bloqueado em mutações (403)', async () => {
  let capturedUpstreamUrl = '';
  let capturedGetHeaders: Record<string, string> = {};
  const sampleItem = {
    id: 'sol-1',
    sistema_origem: 'classifica',
    origem_ref_id: 'par-100',
    status: 'solicitada',
    relato: 'Solicita verificação de vertedouro.',
    barragem_id: 'bar-10',
    empreendedor_id: 'emp-10',
    processo_referencia: 'SEMA-PRO-2026/001',
    dados_pre_preenchidos: {
      nome_barragem: 'Barragem Esperança',
      municipio: 'Cuiabá',
      curso_agua: 'Rio Coxipó',
      coordenadas: "15°30'00\"S / 56°05'00\"W",
      uso: 'Irrigação',
      classificacao: 'Categoria B',
      nome_empreendedor: 'Empreendimento Esperança Ltda',
    },
    solicitante_id: 'user-analista-a',
    solicitante_nome: 'Analista A',
    cpf_cnpj: '123.456.789-09',
    segredo_interno: 'nao-deve-vazar',
  };

  await withServer(
    {
      verifySession: makeVerifySession(),
      getConfig: () => ({
        baseUrl: 'https://administra.example/api/solicitacoes-vistoria',
        serviceToken: 'svc-secret',
      }),
      fetchImpl: async (url, init) => {
        capturedUpstreamUrl = String(url);
        capturedGetHeaders = Object.fromEntries(
          Object.entries((init?.headers as Record<string, string>) || {}).map(([k, v]) => [
            k.toLowerCase(),
            String(v),
          ])
        );
        return new Response(JSON.stringify({ solicitacoes: [sampleItem] }), { status: 200 });
      },
    },
    async (baseUrl) => {
      const getRes = await fetch(`${baseUrl}/api/solicitacoes-vistoria?status=solicitada`, {
        headers: { Authorization: 'Bearer token-visualizador' },
      });
      assert.equal(getRes.status, 200);
      assert.match(capturedUpstreamUrl, /sistema_origem=classifica/);
      assert.match(capturedUpstreamUrl, /status=solicitada/);
      assert.equal(capturedGetHeaders.authorization, 'Bearer token-visualizador');
      assert.equal(capturedGetHeaders['x-solicitacoes-service-token'], 'svc-secret');
      assert.equal(capturedGetHeaders['x-sistema-origem'], 'classifica');

      const getBody = (await getRes.json()) as { items: Array<Record<string, unknown>> };
      assert.equal(getBody.items.length, 1);
      assert.equal(getBody.items[0].id, 'sol-1');
      assert.equal(getBody.items[0].status, 'solicitada');
      assert.equal(getBody.items[0].origem_ref_id, 'par-100');
      assert.equal(getBody.items[0].barragem_nome, 'Barragem Esperança');
      assert.equal(getBody.items[0].municipio, 'Cuiabá');
      assert.equal(getBody.items[0].curso_agua, 'Rio Coxipó');
      assert.equal(getBody.items[0].uso, 'Irrigação');
      assert.equal(getBody.items[0].classificacao_atual, 'Categoria B');
      assert.equal(getBody.items[0].empreendedor_nome, 'Empreendimento Esperança Ltda');
      assert.equal(getBody.items[0].processo, 'SEMA-PRO-2026/001');
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

test('Solicitações de Vistoria API — POST mapeia contrato real Administra, anexa DPA/CRI, bloqueia chaves extras e CPF/CNPJ', async () => {
  let forwardedPayload: Record<string, unknown> | null = null;
  let forwardedHeaders: Record<string, string> = {};

  await withServer(
    {
      verifySession: makeVerifySession(),
      getConfig: () => ({
        baseUrl: 'https://administra.example/api/solicitacoes-vistoria',
        serviceToken: 'svc-secret',
      }),
      fetchImpl: async (_url, init) => {
        forwardedHeaders = Object.fromEntries(
          Object.entries((init?.headers as Record<string, string>) || {}).map(([k, v]) => [
            k.toLowerCase(),
            String(v),
          ])
        );
        forwardedPayload = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            solicitacao: {
              id: 'sol-created-1',
              sistema_origem: 'classifica',
              status: 'solicitada',
              solicitante_id: 'user-analista-a',
              solicitante_nome: 'Analista A',
              solicitante_email: 'analista.a@sema.mt.gov.br',
              ...forwardedPayload,
              created_at: '2026-01-01T10:00:00Z',
            },
          }),
          { status: 201 }
        );
      },
    },
    async (baseUrl) => {
      // Tentativa de falsificar solicitante e sistema_origem no body + campos de mapeamento
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
          origem_ref_id: 'parecer-uuid-999',
          barragem_id: 'bar-123',
          barragem_nome: 'Barragem Norte',
          municipio: 'Sinop',
          curso_agua: 'Rio Teles Pires',
          coordenadas: "11°51'50\"S / 55°30'14\"W",
          uso: 'Geração de energia',
          empreendedor_id: 'emp-456',
          empreendedor_nome: 'Agropecuária Norte Ltda',
          processo: 'PROC-2026-77',
          classificacao_atual: 'Categoria A',
          dpa: 'Alto',
          cri: 'Média',
          relato: 'Verificação de trincas no maciço e nível de água.',
        }),
      });
      assert.equal(okRes.status, 201);
      assert.equal(forwardedHeaders.authorization, 'Bearer token-analista-a');
      assert.equal(forwardedHeaders['x-solicitacoes-service-token'], 'svc-secret');
      assert.equal(forwardedHeaders['x-sistema-origem'], 'classifica');

      // Somente as 6 chaves permitidas
      assert.deepEqual(Object.keys(forwardedPayload || {}).sort(), [
        'barragem_id',
        'dados_pre_preenchidos',
        'empreendedor_id',
        'origem_ref_id',
        'processo_referencia',
        'relato',
      ]);

      // Chaves proibidas NÃO podem estar no payload
      for (const forbidden of [
        'sistema_origem',
        'solicitante_id',
        'solicitante_nome',
        'solicitante_email',
        'processo',
        'barragem_nome',
        'empreendedor_nome',
        'classificacao_atual',
        'dpa',
        'cri',
      ]) {
        assert.equal(forbidden in (forwardedPayload || {}), false);
      }

      assert.equal(forwardedPayload?.origem_ref_id, 'parecer-uuid-999');
      assert.equal(forwardedPayload?.barragem_id, 'bar-123');
      assert.equal(forwardedPayload?.empreendedor_id, 'emp-456');
      assert.equal(forwardedPayload?.processo_referencia, 'PROC-2026-77');
      assert.match(String(forwardedPayload?.relato || ''), /DPA: Alto \| CRI: Média$/);
      assert.deepEqual(forwardedPayload?.dados_pre_preenchidos, {
        nome_barragem: 'Barragem Norte',
        municipio: 'Sinop',
        curso_agua: 'Rio Teles Pires',
        coordenadas: "11°51'50\"S / 55°30'14\"W",
        uso: 'Geração de energia',
        classificacao: 'Categoria A',
        nome_empreendedor: 'Agropecuária Norte Ltda',
      });

      const createdBody = (await okRes.json()) as { item: Record<string, unknown> };
      assert.equal(createdBody.item.barragem_nome, 'Barragem Norte');
      assert.equal(createdBody.item.processo, 'PROC-2026-77');
      assert.equal(createdBody.item.uso, 'Geração de energia');
      assert.equal(createdBody.item.origem_ref_id, 'parecer-uuid-999');

      // Relato + DPA/CRI longo respeita limite máximo de 1000 chars
      const tightRes = await fetch(`${baseUrl}/api/solicitacoes-vistoria`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-analista-a',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          relato: 'A'.repeat(995),
          dpa: 'Alto',
          cri: 'Baixa',
        }),
      });
      assert.equal(tightRes.status, 201);
      assert.ok(String(forwardedPayload?.relato || '').length <= 1000);
      assert.match(String(forwardedPayload?.relato || ''), /DPA: Alto \| CRI: Baixa$/);

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

      // Relato < 3 caracteres -> 400
      const shortRelato = await fetch(`${baseUrl}/api/solicitacoes-vistoria`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-analista-a',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ relato: 'ab' }),
      });
      assert.equal(shortRelato.status, 400);

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

      // origem_ref_id > 120 caracteres -> 400
      const longOrigemRef = await fetch(`${baseUrl}/api/solicitacoes-vistoria`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-analista-a',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          relato: 'Vistoria técnica.',
          origem_ref_id: 'r'.repeat(121),
        }),
      });
      assert.equal(longOrigemRef.status, 400);

      // dados_pre_preenchidos rejeita objetos/arrays, chaves extras e > 300 chars -> 400
      const nestedObjDadosPre = await fetch(`${baseUrl}/api/solicitacoes-vistoria`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-analista-a',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          relato: 'Vistoria técnica.',
          dados_pre_preenchidos: {
            nome_barragem: { nested: 'proibido' },
          },
        }),
      });
      assert.equal(nestedObjDadosPre.status, 400);

      const unknownKeyDadosPre = await fetch(`${baseUrl}/api/solicitacoes-vistoria`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-analista-a',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          relato: 'Vistoria técnica.',
          dados_pre_preenchidos: {
            chave_invalida: 'valor',
          },
        }),
      });
      assert.equal(unknownKeyDadosPre.status, 400);

      const longDadosPre = await fetch(`${baseUrl}/api/solicitacoes-vistoria`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-analista-a',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          relato: 'Vistoria técnica.',
          dados_pre_preenchidos: {
            nome_barragem: 'B'.repeat(301),
          },
        }),
      });
      assert.equal(longDadosPre.status, 400);

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

test('Solicitações de Vistoria API — edição/cancelamento restrito a autor ou Administrador com payloads reais', async () => {
  let lastMutationUrl = '';
  let lastMutationBody: Record<string, unknown> | null = null;
  let currentRecord = {
    id: 'sol-20',
    sistema_origem: 'classifica',
    status: 'solicitada',
    relato: 'Relato original',
    solicitante_id: 'user-analista-a',
    solicitante_nome: 'Analista A',
    solicitante_email: 'analista.a@sema.mt.gov.br',
    equipe: [],
    motivo: null as string | null,
  };

  await withServer(
    {
      verifySession: makeVerifySession(),
      getConfig: () => ({
        baseUrl: 'https://administra.example/api/solicitacoes-vistoria',
        serviceToken: 'svc-secret',
      }),
      fetchImpl: async (url, init) => {
        if ((init?.method || 'GET').toUpperCase() === 'GET') {
          return new Response(JSON.stringify({ solicitacao: currentRecord }), { status: 200 });
        }
        lastMutationUrl = String(url);
        const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
        lastMutationBody = body;
        if (lastMutationUrl.endsWith('/cancelar')) {
          currentRecord = {
            ...currentRecord,
            status: 'cancelada',
            motivo: typeof body.motivo === 'string' ? body.motivo : null,
          };
        } else if (typeof body.relato === 'string') {
          currentRecord = { ...currentRecord, relato: body.relato };
        }
        return new Response(JSON.stringify({ solicitacao: currentRecord }), { status: 200 });
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

      // Autor pode editar -> 200 e envia SOMENTE { relato }
      const authorEdit = await fetch(`${baseUrl}/api/solicitacoes-vistoria/sol-20`, {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer token-analista-a',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          acao: 'editar',
          atualizado_por_id: 'tentativa',
          relato: 'Relato atualizado pelo autor',
        }),
      });
      assert.equal(authorEdit.status, 200);
      assert.equal(lastMutationUrl, 'https://administra.example/api/solicitacoes-vistoria/sol-20');
      assert.deepEqual(lastMutationBody, { relato: 'Relato atualizado pelo autor' });
      assert.equal('acao' in (lastMutationBody || {}), false);
      assert.equal('atualizado_por_id' in (lastMutationBody || {}), false);

      const editedJson = (await authorEdit.json()) as { item: { relato: string } };
      assert.equal(editedJson.item.relato, 'Relato atualizado pelo autor');

      // Outro analista NÃO pode cancelar -> 403
      const forbiddenCancel = await fetch(`${baseUrl}/api/solicitacoes-vistoria/sol-20/cancelar`, {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer token-analista-b',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ motivo: 'Não autorizado' }),
      });
      assert.equal(forbiddenCancel.status, 403);

      // Administrador pode cancelar -> 200 e envia PATCH /:id/cancelar com SOMENTE { motivo }
      const adminCancel = await fetch(`${baseUrl}/api/solicitacoes-vistoria/sol-20/cancelar`, {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer token-admin',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          acao: 'cancelar',
          status: 'cancelada',
          motivo_cancelamento: 'legado',
          atualizado_por_id: 'tentativa',
          motivo: 'Cancelamento administrativo',
        }),
      });
      assert.equal(adminCancel.status, 200);
      assert.equal(
        lastMutationUrl,
        'https://administra.example/api/solicitacoes-vistoria/sol-20/cancelar'
      );
      assert.deepEqual(lastMutationBody, { motivo: 'Cancelamento administrativo' });
      for (const forbidden of ['acao', 'status', 'motivo_cancelamento', 'atualizado_por_id']) {
        assert.equal(forbidden in (lastMutationBody || {}), false);
      }
      const canceledJson = (await adminCancel.json()) as {
        item: { status: string; motivo: string };
      };
      assert.equal(canceledJson.item.status, 'cancelada');
      assert.equal(canceledJson.item.motivo, 'Cancelamento administrativo');
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
      getConfig: () => ({
        baseUrl: 'https://administra.example/api/solicitacoes-vistoria',
        serviceToken: 'svc-secret',
      }),
      fetchImpl: async (_url, init) => {
        if ((init?.method || 'GET').toUpperCase() === 'GET') {
          return new Response(JSON.stringify({ solicitacao: currentRecord }), { status: 200 });
        }
        obsForwardedBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
        currentRecord = {
          ...currentRecord,
          observacao_campo: (obsForwardedBody.observacao_campo as string | null) ?? null,
        };
        // Mesmo que upstream devolvesse campos diferentes, handler preserva status e data_realizacao
        return new Response(
          JSON.stringify({
            solicitacao: {
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
      assert.deepEqual(Object.keys(obsForwardedBody || {}), ['observacao_campo']);
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
      getConfig: () => ({
        baseUrl: 'https://administra.example/api/solicitacoes-vistoria',
        serviceToken: 'super-secret-token',
      }),
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
      getConfig: () => ({
        baseUrl: 'https://administra.example/api/solicitacoes-vistoria',
        serviceToken: 'super-secret-token',
      }),
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

test('Solicitações de Vistoria API — recusa registros sem sistema_origem ou com outra origem na leitura e antes de mutações', async () => {
  assert.equal(sanitizeSolicitacao({ id: 'x1', status: 'solicitada', relato: 'Sem origem' }), null);
  assert.equal(
    sanitizeSolicitacao({ id: 'x2', sistema_origem: '', status: 'solicitada', relato: 'Origem vazia' }),
    null
  );
  assert.equal(
    sanitizeSolicitacao({
      id: 'x3',
      sistema_origem: 'fiscaliza',
      status: 'solicitada',
      relato: 'Outra origem',
    }),
    null
  );
  assert.equal(
    sanitizeSolicitacao({
      id: 'x3b',
      sistema_origem: 'CLASSIFICA',
      status: 'solicitada',
      relato: 'Caixa alta não é exatamente classifica',
    }),
    null
  );
  assert.notEqual(
    sanitizeSolicitacao({
      id: 'x4',
      sistema_origem: 'classifica',
      status: 'solicitada',
      relato: 'Origem válida',
    }),
    null
  );

  const mixedItems = [
    { id: 'sem-origem', status: 'solicitada', relato: 'Sem origem' },
    { id: 'outra-origem', sistema_origem: 'notifica', status: 'solicitada', relato: 'Do Notifica' },
    {
      id: 'origem-classifica',
      sistema_origem: 'classifica',
      status: 'solicitada',
      relato: 'Do Classifica',
      solicitante_id: 'user-analista-a',
    },
  ];

  const byId: Record<string, Record<string, unknown>> = {
    'sem-origem': {
      id: 'sem-origem',
      status: 'realizada',
      relato: 'Sem sistema_origem',
      solicitante_id: 'user-analista-a',
      equipe: ['user-analista-b'],
    },
    'outra-origem': {
      id: 'outra-origem',
      sistema_origem: 'fiscaliza',
      status: 'realizada',
      relato: 'De outro sistema',
      solicitante_id: 'user-analista-a',
      equipe: ['user-analista-b'],
    },
  };

  let mutatingCalls = 0;

  await withServer(
    {
      verifySession: makeVerifySession(),
      getConfig: () => ({
        baseUrl: 'https://administra.example/api/solicitacoes-vistoria',
        serviceToken: 'svc-secret',
      }),
      fetchImpl: async (url, init) => {
        const method = (init?.method || 'GET').toUpperCase();
        if (method !== 'GET') {
          mutatingCalls++;
          return new Response(JSON.stringify({ solicitacao: {} }), { status: 200 });
        }
        const rawUrl = String(url);
        const match = rawUrl.match(/\/([^/?]+)\?/);
        const id = match?.[1];
        if (id && byId[id]) {
          return new Response(JSON.stringify({ solicitacao: byId[id] }), { status: 200 });
        }
        return new Response(JSON.stringify({ solicitacoes: mixedItems }), { status: 200 });
      },
    },
    async (baseUrl) => {
      // Lista filtra registros sem origem e de outras origens
      const listRes = await fetch(`${baseUrl}/api/solicitacoes-vistoria`, {
        headers: { Authorization: 'Bearer token-analista-a' },
      });
      assert.equal(listRes.status, 200);
      const listJson = (await listRes.json()) as { items: Array<{ id: string }> };
      assert.deepEqual(
        listJson.items.map((item) => item.id),
        ['origem-classifica']
      );

      // Leitura individual /:id recusa sem origem e de outra origem
      const getMissingOrigin = await fetch(`${baseUrl}/api/solicitacoes-vistoria/sem-origem`, {
        headers: { Authorization: 'Bearer token-admin' },
      });
      assert.equal(getMissingOrigin.status, 404);

      const getOtherOrigin = await fetch(`${baseUrl}/api/solicitacoes-vistoria/outra-origem`, {
        headers: { Authorization: 'Bearer token-admin' },
      });
      assert.equal(getOtherOrigin.status, 404);

      // Editar, cancelar e alterar observação são recusados ANTES de mutar no serviço central
      const editOther = await fetch(`${baseUrl}/api/solicitacoes-vistoria/outra-origem`, {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer token-admin',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ relato: 'Tentativa' }),
      });
      assert.equal(editOther.status, 404);

      const cancelMissing = await fetch(`${baseUrl}/api/solicitacoes-vistoria/sem-origem/cancelar`, {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer token-admin',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ motivo: 'Tentativa' }),
      });
      assert.equal(cancelMissing.status, 404);

      const obsOther = await fetch(`${baseUrl}/api/solicitacoes-vistoria/outra-origem/observacao`, {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer token-admin',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ observacao_campo: 'Tentativa' }),
      });
      assert.equal(obsOther.status, 404);

      assert.equal(mutatingCalls, 0);
    }
  );
});

test('Solicitações de Vistoria API — não vaza mensagem de erro do serviço central ao cliente', async () => {
  const upstreamScenarios: Array<{ upstreamStatus: number; expectedStatus: number; leakedText: string }> = [
    { upstreamStatus: 400, expectedStatus: 400, leakedText: 'SENSITIVE_SQL_400_DETAIL' },
    { upstreamStatus: 401, expectedStatus: 401, leakedText: 'INTERNAL_JWT_KEY_MISMATCH' },
    { upstreamStatus: 403, expectedStatus: 403, leakedText: 'INTERNAL_POLICY_DENIED_ADMIN' },
    { upstreamStatus: 404, expectedStatus: 404, leakedText: 'ROW_UUID_INTERNAL_MISSING' },
    { upstreamStatus: 409, expectedStatus: 409, leakedText: 'UNIQUE_CONSTRAINT_IDX_SOL_123' },
    { upstreamStatus: 500, expectedStatus: 502, leakedText: 'ECONNRESET postgres://user:pass@db' },
  ];

  for (const scenario of upstreamScenarios) {
    await withServer(
      {
        verifySession: makeVerifySession(),
        getConfig: () => ({
          baseUrl: 'https://administra.example/api/solicitacoes-vistoria',
          serviceToken: 'svc-secret',
        }),
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              error: scenario.leakedText,
              message: scenario.leakedText,
            }),
            { status: scenario.upstreamStatus }
          ),
      },
      async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/solicitacoes-vistoria`, {
          method: 'POST',
          headers: {
            Authorization: 'Bearer token-analista-a',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ relato: 'Teste de erro controlado' }),
        });
        assert.equal(res.status, scenario.expectedStatus);
        const rawBody = await res.text();
        assert.equal(rawBody.includes(scenario.leakedText), false);
        assert.equal(rawBody.includes('svc-secret'), false);
        const parsed = JSON.parse(rawBody) as { ok: boolean; error: string };
        assert.equal(parsed.ok, false);
        assert.ok(parsed.error.length > 0);
      }
    );
  }
});

test('Solicitações de Vistoria API — PATCH /:id/observacao envia apenas observacao_campo no corpo e headers do contrato central', async () => {
  let capturedMethod = '';
  let capturedBody: Record<string, unknown> | null = null;
  let capturedHeaders: Record<string, string> = {};

  const existingRecord = {
    id: 'sol-obs-only',
    sistema_origem: 'classifica',
    status: 'realizada',
    relato: 'Solicitação concluída',
    data_realizacao: '2026-05-01T09:00:00Z',
    equipe: [{ id: 'user-analista-b', nome: 'Analista B', email: 'analista.b@sema.mt.gov.br' }],
    observacao_campo: null,
  };

  await withServer(
    {
      verifySession: makeVerifySession(),
      getConfig: () => ({
        baseUrl: 'https://administra.example/api/solicitacoes-vistoria',
        serviceToken: 'svc-secret',
      }),
      fetchImpl: async (_url, init) => {
        const method = (init?.method || 'GET').toUpperCase();
        capturedHeaders = Object.fromEntries(
          Object.entries((init?.headers as Record<string, string>) || {}).map(([k, v]) => [
            k.toLowerCase(),
            String(v),
          ])
        );
        if (method === 'GET') {
          return new Response(JSON.stringify({ solicitacao: existingRecord }), { status: 200 });
        }
        capturedMethod = method;
        capturedBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            solicitacao: {
              ...existingRecord,
              observacao_campo: capturedBody.observacao_campo ?? null,
            },
          }),
          { status: 200 }
        );
      },
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/solicitacoes-vistoria/sol-obs-only/observacao`, {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer token-analista-b',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          observacao_campo: 'Anotação de vistoria em campo.',
          atualizado_por_id: 'tentativa-extra',
          status: 'cancelada',
        }),
      });
      assert.equal(res.status, 200);
      assert.equal(capturedMethod, 'PATCH');
      assert.equal(capturedHeaders.authorization, 'Bearer token-analista-b');
      assert.equal(capturedHeaders['x-solicitacoes-service-token'], 'svc-secret');
      assert.equal(capturedHeaders['x-sistema-origem'], 'classifica');
      assert.deepEqual(capturedBody, { observacao_campo: 'Anotação de vistoria em campo.' });
      assert.deepEqual(Object.keys(capturedBody || {}), ['observacao_campo']);
    }
  );
});
