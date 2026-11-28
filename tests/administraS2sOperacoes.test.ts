import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createApiApp } from '../server';
import { createAdministraEscritaHandler } from '../api/administra-escrita';
import {
  createInMemoryAdministraOutboxStore,
  createSupabaseAdministraOutboxStore,
  OutboxStorageError,
} from '../server/administraOutbox';
import {
  ADMINISTRA_OPERACOES_V2_PATH,
  ADMINISTRA_OPERACOES_V2_SCOPE,
  BLOCKED_S2S_OPERACOES,
  buildValidatedAdministraOperacao,
  computeDeterministicIdempotencyKey,
  dispatchAdministraS2sOperacao,
  OperacaoValidationError,
} from '../server/administraS2sOperacoes';
import { submitAdministraS2sOperation } from '../src/services/administraService';

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

async function withEscritaServer(
  deps: Parameters<typeof createAdministraEscritaHandler>[0],
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const escritaHandler = createAdministraEscritaHandler(deps);
  const app = createApiApp({
    administraEscrita: (req, res) => void escritaHandler(req, res),
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  assert.ok(addr && typeof addr !== 'string');
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

test('assinatura Ed25519 S2S-V2 POST /api/v2/operacoes valida string canônica, escopo operacoes:write e x-consumer-user-id', async () => {
  const { privateKeyPem, publicKey } = generateEphemeralEd25519Pair();
  const keyId = 'classifica-ops-kid-01';
  const verifiedUserId = '11111111-1111-4111-8111-111111111111';

  let observedMethod = '';
  let observedPath = '';
  let observedScope = '';
  let observedConsumer = '';
  let observedAuth: string | undefined;
  let signatureValid = false;
  let receivedBody: Record<string, any> = {};

  const mockAdministra = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => {
      const bodyText = Buffer.concat(chunks).toString('utf8');
      receivedBody = JSON.parse(bodyText);

      const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1');
      observedMethod = req.method || '';
      observedPath = parsedUrl.pathname;
      observedScope = String(req.headers['x-s2s-scope'] || '');
      observedConsumer = String(req.headers['x-consumer-user-id'] || '');
      observedAuth = req.headers.authorization;

      const bodySha = crypto.createHash('sha256').update(bodyText, 'utf8').digest('hex');
      const timestamp = String(req.headers['x-s2s-timestamp'] || '');
      const jti = String(req.headers['x-s2s-jti'] || '');
      const sig = String(req.headers['x-s2s-signature'] || '');

      const expectedCanonical =
        'S2S-V2\n' +
        'POST\n' +
        '/api/v2/operacoes\n' +
        '\n' +
        'application/json\n' +
        `${bodySha}\n` +
        `${keyId}\n` +
        `${timestamp}\n` +
        `${jti}\n` +
        `${verifiedUserId}|`;

      signatureValid =
        req.headers['x-s2s-body-sha256'] === bodySha &&
        !/[+/=]/.test(sig) &&
        crypto.verify(
          null,
          Buffer.from(expectedCanonical, 'utf8'),
          publicKey,
          Buffer.from(sig, 'base64url')
        );

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          ok: true,
          codigo: 'EMPREENDEDOR_CRIADO',
          entidade_id: '22222222-2222-4222-8222-222222222222',
        })
      );
    });
  });

  await new Promise<void>((resolve) => {
    mockAdministra.listen(0, '127.0.0.1', () => resolve());
  });

  try {
    const addr = mockAdministra.address();
    assert.ok(addr && typeof addr !== 'string');
    const mockBaseUrl = `http://127.0.0.1:${addr.port}`;
    const store = createInMemoryAdministraOutboxStore();

    await withEscritaServer(
      {
        verifySession: async () => ({
          ok: true,
          userId: verifiedUserId,
          userName: 'Analista Sintético',
          userRole: 'Analista',
          classificaUrl: 'https://classifica.example.supabase.co',
        }),
        getOutboxStore: () => store,
        s2sEnv: {
          ADMINISTRA_API_URL: mockBaseUrl,
          CLASSIFICA_S2S_KID: keyId,
          CLASSIFICA_S2S_PRIVATE_KEY: privateKeyPem,
        },
      },
      async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/administra-escrita`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer valid-analista-token',
            'x-consumer-user-id': '99999999-9999-4999-8999-999999999999',
          },
          body: JSON.stringify({
            action: 'operacao_s2s',
            operacao: 'cadastrar_empreendedor',
            solicitanteUserId: '99999999-9999-4999-8999-999999999999',
            dados: {
              razao_social: 'Empresarial Teste Sintético Ltda',
              cpf_cnpj: '11.111.111/0001-11',
              municipio: 'Cuiabá',
              campo_nao_permitido_interno: 'ignorar',
              sistema_origem: 'TENTATIVA_INJECAO',
            },
          }),
        });

        assert.equal(res.status, 200);
        const json = (await res.json()) as Record<string, any>;
        assert.equal(json.ok, true);
        assert.equal(json.estado, 'concluida');
        assert.equal(json.entidadeIdRetorno, '22222222-2222-4222-8222-222222222222');
        assert.match(json.idempotencyKey, /^s2s_op_[0-9a-f]{64}$/);
      }
    );

    assert.equal(observedMethod, 'POST');
    assert.equal(observedPath, ADMINISTRA_OPERACOES_V2_PATH);
    assert.equal(observedScope, ADMINISTRA_OPERACOES_V2_SCOPE);
    assert.equal(observedConsumer, verifiedUserId);
    assert.equal(observedAuth, undefined);
    assert.equal(signatureValid, true);
    assert.equal(receivedBody.dados.razao_social, 'Empresarial Teste Sintético Ltda');
    assert.equal(receivedBody.dados.cpf_cnpj, '11111111000111');
    assert.equal(receivedBody.dados.tipo_pessoa, 'PJ');
    assert.equal('campo_nao_permitido_interno' in receivedBody.dados, false);
    assert.equal('sistema_origem' in receivedBody.dados, false);
  } finally {
    mockAdministra.closeAllConnections?.();
    await new Promise<void>((resolve, reject) => {
      mockAdministra.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

test('idempotencyKey é determinística independentemente da ordem das chaves e bloqueia operações proibidas e mutação direta', async () => {
  const userId = '11111111-1111-4111-8111-111111111111';

  const opA = buildValidatedAdministraOperacao({
    operacao: 'cadastrar_barragem',
    solicitanteUserId: userId,
    dados: {
      nome: 'Barragem Sintética Norte',
      municipio: 'Sinop',
      uf: 'mt',
      extra_field: 'drop-me',
    },
  });
  const opB = buildValidatedAdministraOperacao({
    operacao: 'cadastrar_barragem',
    solicitanteUserId: userId,
    dados: {
      uf: 'MT',
      municipio: 'Sinop',
      nome: 'Barragem Sintética Norte',
    },
  });

  assert.equal(opA.idempotencyKey, opB.idempotencyKey);
  assert.equal('extra_field' in opA.dados, false);

  const keyDirect = computeDeterministicIdempotencyKey({
    operacao: 'cadastrar_barragem',
    entidadeTipo: 'barragem',
    entidadeId: null,
    dados: opA.dados,
    justificativa: null,
    origemDocumentoTipo: null,
    origemDocumentoId: null,
    solicitanteUserId: userId,
  });
  assert.equal(opA.idempotencyKey, keyDirect);

  for (const blockedOp of BLOCKED_S2S_OPERACOES) {
    assert.throws(
      () =>
        buildValidatedAdministraOperacao({
          operacao: blockedOp,
          solicitanteUserId: userId,
          dados: { id: 'x' },
        }),
      (err: unknown) =>
        err instanceof OperacaoValidationError &&
        err.code === 'ADMINISTRA_S2S_OPERATION_BLOCKED' &&
        err.httpStatus === 403
    );
  }

  for (const directMutation of ['atualizar_barragem', 'editar_empreendedor', 'update_rt']) {
    assert.throws(
      () =>
        buildValidatedAdministraOperacao({
          operacao: directMutation,
          solicitanteUserId: userId,
          dados: { nome: 'Tentativa Direta' },
        }),
      (err: unknown) =>
        err instanceof OperacaoValidationError &&
        err.code === 'DIRECT_MUTATION_NOT_ALLOWED'
    );
  }

  assert.throws(
    () =>
      buildValidatedAdministraOperacao({
        operacao: 'cadastrar_rt',
        solicitanteUserId: userId,
        dados: { id: 'rt-existente', nome: 'Eng. Existente' },
      }),
    (err: unknown) =>
      err instanceof OperacaoValidationError &&
      err.code === 'DIRECT_MUTATION_NOT_ALLOWED'
  );

  // Valida também propor_alteracao_empreendedor e propor_alteracao_rt
  const propEmp = buildValidatedAdministraOperacao({
    operacao: 'propor_alteracao_empreendedor',
    entidadeId: 'emp-123',
    justificativa: 'Correção de município sede.',
    solicitanteUserId: userId,
    dados: { municipio: 'Várzea Grande', campo_ignorado: 'x' },
  });
  assert.equal(propEmp.entidadeTipo, 'empreendedor');
  assert.equal('campo_ignorado' in propEmp.dados, false);

  const propRt = buildValidatedAdministraOperacao({
    operacao: 'propor_alteracao_rt',
    entidadeId: 'rt-123',
    justificativa: 'Atualização de registro profissional.',
    solicitanteUserId: userId,
    dados: { registro_profissional: 'CREA-MT 99999/D', campo_ignorado: 'y' },
  });
  assert.equal(propRt.entidadeTipo, 'responsavel_tecnico');
  assert.equal('campo_ignorado' in propRt.dados, false);
});

test('propor_alteracao_barragem retorna 202 aguardando_aprovacao e 409 conflito nunca vira sucesso', async () => {
  const store = createInMemoryAdministraOutboxStore();
  let upstreamMode: '202' | '409' = '202';

  await withEscritaServer(
    {
      verifySession: async () => ({
        ok: true,
        userId: '11111111-1111-4111-8111-111111111111',
        userName: 'Analista Sintético',
        userRole: 'Analista',
        classificaUrl: 'https://classifica.example.supabase.co',
      }),
      getOutboxStore: () => store,
      dispatchS2sOperacao: async ({ operacao }) => {
        if (upstreamMode === '202') {
          return {
            ok: true,
            outcome: 'aguardando_aprovacao',
            httpStatus: 202,
            retryable: false,
            code: 'AGUARDANDO_APROVACAO_ADMIN',
            message: 'Proposta encaminhada para aprovação.',
            idempotencyKey: operacao.idempotencyKey,
            entidadeIdRetorno: operacao.entidadeId,
            solicitacaoIdRetorno: '33333333-3333-4333-8333-333333333333',
            responsePayload: { status: 'pendente_aprovacao' },
          };
        }
        return {
          ok: false,
          outcome: 'conflito',
          httpStatus: 409,
          retryable: false,
          code: 'DUPLICIDADE_CONFLITO',
          message: 'Registro conflitante já cadastrado no Administra.',
          idempotencyKey: operacao.idempotencyKey,
          entidadeIdRetorno: null,
          solicitacaoIdRetorno: null,
          responsePayload: { conflito: true },
        };
      },
    },
    async (baseUrl) => {
      // 1. propor_alteracao_barragem -> 202 aguardando_aprovacao
      const propRes = await fetch(`${baseUrl}/api/administra-escrita`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          action: 'operacao_s2s',
          operacao: 'propor_alteracao_barragem',
          entidadeId: '44444444-4444-4444-8444-444444444444',
          justificativa: 'Atualização de altura após vistoria técnica.',
          dados: { altura_maxima: 18.5 },
        }),
      });
      assert.equal(propRes.status, 202);
      const propJson = (await propRes.json()) as Record<string, any>;
      assert.equal(propJson.ok, true);
      assert.equal(propJson.estado, 'aguardando_aprovacao');
      assert.equal(propJson.solicitacaoIdRetorno, '33333333-3333-4333-8333-333333333333');

      // 2. 409 conflito -> nunca convertido em sucesso
      upstreamMode = '409';
      const conflictRes = await fetch(`${baseUrl}/api/administra-escrita`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          action: 'operacao_s2s',
          operacao: 'cadastrar_rt',
          dados: {
            nome: 'Responsável Teste Sintético',
            crea: 'MT-99999',
          },
        }),
      });
      assert.equal(conflictRes.status, 409);
      const conflictJson = (await conflictRes.json()) as Record<string, any>;
      assert.equal(conflictJson.ok, false);
      assert.equal(conflictJson.estado, 'conflito');
      assert.equal(conflictJson.code, 'DUPLICIDADE_CONFLITO');
    }
  );
});

test('falha 503 ou erro de rede persiste na outbox e reprocessamento seguro conclui sem duplicar idempotencyKey', async () => {
  const store = createInMemoryAdministraOutboxStore();
  let mode: '503' | 'network' | '200' = '503';
  const sentKeys: string[] = [];
  const fixedNow = new Date('2026-11-27T12:00:00.000Z');
  let clock = fixedNow;

  await withEscritaServer(
    {
      verifySession: async () => ({
        ok: true,
        userId: '11111111-1111-4111-8111-111111111111',
        userName: 'Analista Outbox',
        userRole: 'Analista',
        classificaUrl: 'https://classifica.example.supabase.co',
      }),
      getOutboxStore: () => store,
      now: () => clock,
      dispatchS2sOperacao: async ({ operacao }) => {
        sentKeys.push(operacao.idempotencyKey);
        if (mode === '503') {
          return {
            ok: false,
            outcome: 'erro_temporario',
            httpStatus: 503,
            retryable: true,
            code: 'POLICY_INACTIVE',
            message: 'Política de escrita temporariamente inativa (503).',
            idempotencyKey: operacao.idempotencyKey,
            entidadeIdRetorno: null,
            solicitacaoIdRetorno: null,
            responsePayload: null,
          };
        }
        if (mode === 'network') {
          return {
            ok: false,
            outcome: 'erro_temporario',
            httpStatus: 503,
            retryable: true,
            code: 'ADMINISTRA_NETWORK_ERROR',
            message: 'Falha de rede.',
            idempotencyKey: operacao.idempotencyKey,
            entidadeIdRetorno: null,
            solicitacaoIdRetorno: null,
            responsePayload: null,
          };
        }
        return {
          ok: true,
          outcome: 'concluida',
          httpStatus: 200,
          retryable: false,
          code: 'BARRAGEM_CRIADA',
          message: 'Barragem cadastrada com sucesso.',
          idempotencyKey: operacao.idempotencyKey,
          entidadeIdRetorno: '55555555-5555-4555-8555-555555555555',
          solicitacaoIdRetorno: null,
          responsePayload: { ok: true },
        };
      },
    },
    async (baseUrl) => {
      // Tentativa inicial com 503 -> outbox guarda erro_temporario, tentativas=1
      const first = await fetch(`${baseUrl}/api/administra-escrita`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          action: 'operacao_s2s',
          operacao: 'cadastrar_barragem',
          dados: {
            nome: 'Barragem Sintética Resiliente',
            municipio: 'Sorriso',
            uf: 'MT',
          },
        }),
      });
      assert.equal(first.status, 503);
      const firstJson = (await first.json()) as Record<string, any>;
      assert.equal(firstJson.ok, false);
      assert.equal(firstJson.estado, 'erro_temporario');
      assert.equal(firstJson.outbox.tentativas, 1);
      assert.ok(firstJson.outbox.proxima_tentativa_em);

      // Reprocessamento após backoff -> Administra retorna 200 com mesma idempotencyKey
      mode = '200';
      clock = new Date('2026-11-27T12:05:00.000Z');
      const retryRes = await fetch(`${baseUrl}/api/administra-escrita`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({ action: 'outbox_reprocessar', limit: 10 }),
      });
      assert.equal(retryRes.status, 200);
      const retryJson = (await retryRes.json()) as Record<string, any>;
      assert.equal(retryJson.ok, true);
      assert.equal(retryJson.processed, 1);
      assert.equal(retryJson.succeeded, 1);
      assert.equal(retryJson.items[0].tentativas, 2);
      assert.equal(retryJson.items[0].estado, 'concluida');
      assert.equal(sentKeys.length, 2);
      assert.equal(sentKeys[0], sentKeys[1]);

      // Reenvio idempotente do mesmo payload -> retorna concluida sem nova chamada remota
      const replayRes = await fetch(`${baseUrl}/api/administra-escrita`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({
          action: 'operacao_s2s',
          operacao: 'cadastrar_barragem',
          dados: {
            nome: 'Barragem Sintética Resiliente',
            municipio: 'Sorriso',
            uf: 'MT',
          },
        }),
      });
      assert.equal(replayRes.status, 200);
      const replayJson = (await replayRes.json()) as Record<string, any>;
      assert.equal(replayJson.ok, true);
      assert.equal(replayJson.deduplicated, true);
      assert.equal(sentKeys.length, 2);
    }
  );
});

test('falha fechado sem vazar segredos quando falta chave privada, falta service_role ou migration outbox não foi aplicada', async () => {
  const op = buildValidatedAdministraOperacao({
    operacao: 'cadastrar_empreendedor',
    solicitanteUserId: '11111111-1111-4111-8111-111111111111',
    dados: { razao_social: 'Empresarial Sem Chave Ltda' },
  });

  const missingKeyResult = await dispatchAdministraS2sOperacao({
    operacao: op,
    consumerUserId: '11111111-1111-4111-8111-111111111111',
    env: {
      ADMINISTRA_API_URL: 'https://administra.example.gov.br',
      CLASSIFICA_S2S_KID: 'kid-1',
      CLASSIFICA_S2S_PRIVATE_KEY: '',
    },
  });
  assert.equal(missingKeyResult.ok, false);
  assert.equal(missingKeyResult.httpStatus, 503);
  assert.equal(missingKeyResult.configError, true);
  assert.equal(missingKeyResult.outcome, 'erro_temporario');

  assert.throws(
    () =>
      createSupabaseAdministraOutboxStore({
        env: {
          SUPABASE_URL: 'https://classifica.example.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: 'sb_publishable_chave_publica_invalida',
        },
      }),
    (err: unknown) =>
      err instanceof OutboxStorageError && err.code === 'OUTBOX_INVALID_SERVICE_KEY'
  );

  // Simula PostgREST PGRST205 / 42P01 (tabela administra_operacoes_outbox ainda não criada)
  const storeMissingTable = createSupabaseAdministraOutboxStore({
    env: {
      SUPABASE_URL: 'https://classifica.example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_server_only_test',
    },
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          code: 'PGRST205',
          message: "Could not find the table 'public.administra_operacoes_outbox' in the schema cache",
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      ),
  });

  await assert.rejects(
    () => storeMissingTable.findByIdempotencyKey('s2s_op_123'),
    (err: unknown) =>
      err instanceof OutboxStorageError &&
      err.code === 'OUTBOX_MIGRATION_PENDING' &&
      err.httpStatus === 503
  );
});

test('autorização no endpoint, cliente browser seguro, isolamento de variáveis server-side e preservação de api/', async () => {
  const store = createInMemoryAdministraOutboxStore();

  await withEscritaServer(
    {
      verifySession: async (token) => {
        if (token === 'viewer-token') {
          return {
            ok: true,
            userId: '77777777-7777-4777-8777-777777777777',
            userName: 'Visualizador Sintético',
            userRole: 'Visualizador',
            classificaUrl: 'https://classifica.example.supabase.co',
          };
        }
        return {
          ok: false,
          status: 401,
          code: 'INVALID_SESSION',
          error: 'Sessão inválida.',
        };
      },
      getOutboxStore: () => store,
    },
    async (baseUrl) => {
      const unauth = await fetch(`${baseUrl}/api/administra-escrita`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'operacao_s2s', operacao: 'cadastrar_rt', dados: { nome: 'X' } }),
      });
      assert.equal(unauth.status, 401);

      const viewerRes = await fetch(`${baseUrl}/api/administra-escrita`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer viewer-token',
        },
        body: JSON.stringify({ action: 'operacao_s2s', operacao: 'cadastrar_rt', dados: { nome: 'X' } }),
      });
      assert.equal(viewerRes.status, 403);

      const blockedRes = await fetch(`${baseUrl}/api/administra-escrita`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer viewer-token',
        },
        body: JSON.stringify({
          action: 'operacao_s2s',
          operacao: 'registrar_documento',
          dados: {},
        }),
      });
      assert.equal(blockedRes.status, 403);
    }
  );

  // Wrapper do browser exige sessão e nunca assina localmente
  const browserNoAuth = await submitAdministraS2sOperation(
    { operacao: 'cadastrar_rt', dados: { nome: 'Eng. Sintético' } },
    { getAccessToken: async () => null }
  );
  assert.equal(browserNoAuth.ok, false);
  assert.equal(browserNoAuth.status, 401);

  // Garante isolamento entre server/ e código cliente (src/, components/, App.tsx)
  const forbiddenPatterns: Array<{ label: string; regex: RegExp }> = [
    { label: 'CLASSIFICA_S2S_PRIVATE_KEY', regex: /CLASSIFICA_S2S_PRIVATE_KEY/ },
    { label: 'VITE_CLASSIFICA_S2S_', regex: /VITE_CLASSIFICA_S2S_/ },
    {
      label: '(CLASSIFICA_)?SUPABASE_SERVICE_ROLE_KEY',
      regex: /\b(CLASSIFICA_)?SUPABASE_SERVICE_ROLE_KEY\b/,
    },
    { label: 'VITE_SUPABASE_SERVICE_ROLE_KEY', regex: /VITE_.*SERVICE_ROLE/ },
    { label: 'administraS2sOperacoes', regex: /administraS2sOperacoes/ },
    { label: 'administraOutbox', regex: /administraOutbox/ },
    { label: 'createPrivateKey', regex: /\bcreatePrivateKey\b/ },
  ];
  const walkTs = (dir: string): string[] => {
    const full = path.resolve(process.cwd(), dir);
    if (!fs.existsSync(full)) return [];
    const st = fs.statSync(full);
    if (st.isFile()) return [full];
    return fs.readdirSync(full).flatMap((f) => walkTs(path.join(dir, f)));
  };
  for (const root of ['src', 'components', 'App.tsx']) {
    for (const file of walkTs(root)) {
      const content = fs.readFileSync(file, 'utf8');
      for (const { label, regex } of forbiddenPatterns) {
        assert.equal(
          regex.test(content),
          false,
          `${file} não deve referenciar ${label}`
        );
      }
    }
  }

  // Preserva limite de exatamente 4 arquivos em api/
  const apiFiles = fs
    .readdirSync(path.resolve(process.cwd(), 'api'))
    .filter((f) => f.endsWith('.ts'));
  assert.equal(apiFiles.length, 4);
});
