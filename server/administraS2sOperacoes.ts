import crypto from 'node:crypto';
import {
  readAdministraS2sEnv,
  S2S_V2_VERSION,
  signS2sV2Canonical,
} from './administraS2sHealth.js';

export const ADMINISTRA_OPERACOES_V2_PATH = '/api/v2/operacoes';
export const ADMINISTRA_OPERACOES_V2_SCOPE = 'operacoes:write';

export const ALLOWED_S2S_OPERACOES = [
  'cadastrar_empreendedor',
  'cadastrar_barragem',
  'cadastrar_rt',
  'propor_alteracao_empreendedor',
  'propor_alteracao_barragem',
  'propor_alteracao_rt',
] as const;

export function isProporAlteracaoOperacao(op: string): boolean {
  return (
    op === 'propor_alteracao_empreendedor' ||
    op === 'propor_alteracao_barragem' ||
    op === 'propor_alteracao_rt'
  );
}

export type AllowedS2sOperacao = (typeof ALLOWED_S2S_OPERACOES)[number];

export const BLOCKED_S2S_OPERACOES = [
  'registrar_documento',
  'transferencia_titularidade',
  'desativar',
  'reverter',
] as const;

export type BlockedS2sOperacao = (typeof BLOCKED_S2S_OPERACOES)[number];

export type AdministraEntidadeAlvo =
  | 'empreendedor'
  | 'barragem'
  | 'responsavel_tecnico';

export type AdministraOperacaoOutcome =
  | 'concluida'
  | 'aguardando_aprovacao'
  | 'conflito'
  | 'erro_temporario'
  | 'rejeitada';

export type S2sV2OperacoesHeaders = {
  'Content-Type': 'application/json';
  'x-s2s-key-id': string;
  'x-s2s-timestamp': string;
  'x-s2s-jti': string;
  'x-s2s-body-sha256': string;
  'x-s2s-signature': string;
  'x-consumer-user-id': string;
  'x-s2s-scope': typeof ADMINISTRA_OPERACOES_V2_SCOPE;
};

export interface OperacaoInput {
  operacao: string;
  entidadeTipo?: string | null;
  entidadeId?: string | null;
  dados?: Record<string, unknown> | null;
  justificativa?: string | null;
  origemDocumentoTipo?: string | null;
  origemDocumentoId?: string | null;
  solicitanteUserId: string;
}

export interface NormalizedAdministraOperacao {
  operacao: AllowedS2sOperacao;
  entidadeTipo: AdministraEntidadeAlvo;
  entidadeId: string | null;
  dados: Record<string, unknown>;
  justificativa: string | null;
  origemDocumentoTipo: string | null;
  origemDocumentoId: string | null;
  idempotencyKey: string;
  requestBody: Record<string, unknown>;
}

export interface AdministraOperacaoDispatchResult {
  ok: boolean;
  outcome: AdministraOperacaoOutcome;
  httpStatus: number;
  retryable: boolean;
  configError?: boolean;
  code: string;
  message: string;
  idempotencyKey: string;
  entidadeIdRetorno: string | null;
  solicitacaoIdRetorno: string | null;
  responsePayload: Record<string, unknown> | null;
}

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const BLOCKED_OP_SET = new Set<string>(BLOCKED_S2S_OPERACOES);
const ALLOWED_OP_SET = new Set<string>(ALLOWED_S2S_OPERACOES);

const EMPREENDEDOR_ALLOWED_FIELDS = [
  'razao_social',
  'cpf_cnpj',
  'tipo_pessoa',
  'nome_fantasia',
  'email',
  'telefone',
  'endereco',
  'municipio',
  'num_car',
] as const;

const BARRAGEM_ALLOWED_FIELDS = [
  'nome',
  'empreendedor_id',
  'snisb',
  'municipio',
  'municipio_ibge',
  'uf',
  'empreendimento',
  'processo',
  'upg',
  'sub_bacia',
  'curso_agua',
  'zona',
  'localizacao',
  'lat_gms',
  'long_gms',
  'lat_decimal',
  'long_decimal',
  'altura_maxima',
  'comprimento_coroamento',
  'largura_coroamento',
  'volume_nmo',
  'volume_nmm',
  'tipo_estrutural',
  'tipo_fundacao',
  'finalidade',
  'situacao',
  'dpa_atual',
  'cri_atual',
  'enquadramento_pnsb',
] as const;

const RT_ALLOWED_FIELDS = [
  'nome',
  'cpf',
  'crea',
  'registro_profissional',
  'uf_crea',
  'titulo_profissional',
  'especialidade',
  'email',
  'telefone',
  'art',
] as const;

export class OperacaoValidationError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus = 400) {
    super(message);
    this.name = 'OperacaoValidationError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function assertSingleLine(value: string, fieldName: string): string {
  const clean = value.trim();
  if (!clean) {
    throw new OperacaoValidationError(
      'INVALID_FIELD',
      `${fieldName} obrigatório.`
    );
  }
  if (/[\r\n]/.test(clean)) {
    throw new OperacaoValidationError(
      'INVALID_FIELD',
      `${fieldName} contém quebra de linha inválida.`
    );
  }
  return clean;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.trim().replace(/\s+/g, ' ');
  return clean || null;
}

function normalizeOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(num) ? num : null;
}

function normalizeOptionalBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function sanitizeFields(
  raw: Record<string, unknown>,
  allowlist: readonly string[],
  numericFields: Set<string>,
  booleanFields: Set<string>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of allowlist) {
    if (!(field in raw)) continue;
    const value = raw[field];
    if (value === undefined) continue;
    if (value === null) {
      result[field] = null;
      continue;
    }
    if (numericFields.has(field)) {
      const n = normalizeOptionalNumber(value);
      if (n !== null) result[field] = n;
      continue;
    }
    if (booleanFields.has(field)) {
      const b = normalizeOptionalBoolean(value);
      if (b !== null) result[field] = b;
      continue;
    }
    if (typeof value === 'string') {
      const clean = value.trim();
      if (clean !== '') {
        if (field === 'email') {
          result[field] = clean.toLowerCase();
        } else if (field === 'cpf_cnpj' || field === 'cpf') {
          const digits = clean.replace(/\D/g, '');
          if (digits) result[field] = digits;
        } else if (field === 'snisb' || field === 'uf' || field === 'uf_crea') {
          result[field] = clean.toUpperCase();
        } else {
          result[field] = clean;
        }
      } else {
        result[field] = null;
      }
    }
  }
  return result;
}

function stableSortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableSortValue);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) {
        out[key] = stableSortValue(v);
      }
    }
    return out;
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(stableSortValue(value));
}

export function computeDeterministicIdempotencyKey(params: {
  operacao: AllowedS2sOperacao;
  entidadeTipo: AdministraEntidadeAlvo;
  entidadeId: string | null;
  dados: Record<string, unknown>;
  justificativa: string | null;
  origemDocumentoTipo: string | null;
  origemDocumentoId: string | null;
  solicitanteUserId: string;
}): string {
  const canonical = stableStringify({
    operacao: params.operacao,
    entidadeTipo: params.entidadeTipo,
    entidadeId: params.entidadeId ?? null,
    dados: params.dados,
    justificativa: params.justificativa ?? null,
    origemDocumentoTipo: params.origemDocumentoTipo ?? null,
    origemDocumentoId: params.origemDocumentoId ?? null,
    solicitanteUserId: params.solicitanteUserId,
  });
  const digest = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
  return `s2s_op_${digest}`;
}

export function normalizeEntidadeTipo(
  operacao: AllowedS2sOperacao,
  rawEntidadeTipo?: string | null
): AdministraEntidadeAlvo {
  let expected: AdministraEntidadeAlvo;
  if (
    operacao === 'cadastrar_empreendedor' ||
    operacao === 'propor_alteracao_empreendedor'
  ) {
    expected = 'empreendedor';
  } else if (
    operacao === 'cadastrar_barragem' ||
    operacao === 'propor_alteracao_barragem'
  ) {
    expected = 'barragem';
  } else {
    expected = 'responsavel_tecnico';
  }

  const clean = String(rawEntidadeTipo ?? '').trim().toLowerCase();
  if (!clean) return expected;

  const normalizedInput = clean === 'rt' ? 'responsavel_tecnico' : clean;
  if (normalizedInput !== expected) {
    throw new OperacaoValidationError(
      'INVALID_ENTIDADE_TIPO',
      `entidadeTipo '${clean}' incompatível com a operação '${operacao}'.`
    );
  }
  return expected;
}

export function buildValidatedAdministraOperacao(
  input: OperacaoInput
): NormalizedAdministraOperacao {
  const operacaoRaw = String(input.operacao ?? '').trim().toLowerCase();
  if (!operacaoRaw) {
    throw new OperacaoValidationError('MISSING_OPERACAO', 'Informe a operação desejada.');
  }

  if (BLOCKED_OP_SET.has(operacaoRaw)) {
    throw new OperacaoValidationError(
      'ADMINISTRA_S2S_OPERATION_BLOCKED',
      `A operação '${operacaoRaw}' permanece bloqueada no Administra e não pode ser enviada pelo Classifica.`,
      403
    );
  }

  if (
    operacaoRaw.startsWith('atualizar_') ||
    operacaoRaw.startsWith('editar_') ||
    operacaoRaw.startsWith('update_') ||
    operacaoRaw.startsWith('alterar_')
  ) {
    throw new OperacaoValidationError(
      'DIRECT_MUTATION_NOT_ALLOWED',
      'Alterações em cadastros mestres existentes devem usar exclusivamente propor_alteracao_empreendedor, propor_alteracao_barragem ou propor_alteracao_rt.',
      400
    );
  }

  if (!ALLOWED_OP_SET.has(operacaoRaw)) {
    throw new OperacaoValidationError(
      'UNSUPPORTED_OPERACAO',
      `Operação '${operacaoRaw}' não permitida no contrato S2S /api/v2/operacoes.`,
      400
    );
  }

  const operacao = operacaoRaw as AllowedS2sOperacao;
  const solicitanteUserId = assertSingleLine(
    input.solicitanteUserId,
    'solicitanteUserId'
  );
  if (solicitanteUserId.includes('|')) {
    throw new OperacaoValidationError(
      'INVALID_CONSUMER_USER_ID',
      'Identificador do usuário solicitante inválido.'
    );
  }

  const entidadeTipo = normalizeEntidadeTipo(operacao, input.entidadeTipo);
  const rawDados = input.dados && typeof input.dados === 'object' && !Array.isArray(input.dados)
    ? input.dados
    : null;

  if (!rawDados) {
    throw new OperacaoValidationError(
      'MISSING_DADOS',
      'Informe os dados da operação em formato de objeto JSON.'
    );
  }

  const entidadeId = normalizeOptionalString(input.entidadeId);
  const isProporAlteracao = isProporAlteracaoOperacao(operacao);

  if (!isProporAlteracao) {
    if (entidadeId || normalizeOptionalString(rawDados.id)) {
      throw new OperacaoValidationError(
        'DIRECT_MUTATION_NOT_ALLOWED',
        'Cadastros existentes não podem ser editados diretamente via cadastrar_*; use propor_alteracao_*.',
        400
      );
    }
  } else if (!entidadeId) {
    throw new OperacaoValidationError(
      'MISSING_ENTIDADE_ID',
      `Informe entidadeId do registro existente para ${operacao}.`
    );
  }

  const numericBarragemFields = new Set([
    'lat_decimal',
    'long_decimal',
    'altura_maxima',
    'comprimento_coroamento',
    'largura_coroamento',
    'volume_nmo',
    'volume_nmm',
  ]);
  const booleanBarragemFields = new Set(['enquadramento_pnsb']);

  let sanitizedDados: Record<string, unknown>;
  if (entidadeTipo === 'empreendedor') {
    sanitizedDados = sanitizeFields(
      rawDados,
      EMPREENDEDOR_ALLOWED_FIELDS,
      new Set(),
      new Set()
    );
    if (operacao === 'cadastrar_empreendedor') {
      const razao = normalizeOptionalString(sanitizedDados.razao_social);
      if (!razao || razao.length < 2) {
        throw new OperacaoValidationError(
          'INVALID_EMPREENDEDOR',
          'Informe razao_social válida para cadastrar empreendedor.'
        );
      }
      const cpfCnpj = typeof sanitizedDados.cpf_cnpj === 'string' ? sanitizedDados.cpf_cnpj : '';
      if (cpfCnpj && cpfCnpj.length !== 11 && cpfCnpj.length !== 14) {
        throw new OperacaoValidationError(
          'INVALID_CPF_CNPJ',
          'cpf_cnpj deve conter 11 dígitos (CPF) ou 14 dígitos (CNPJ).'
        );
      }
      if (!sanitizedDados.tipo_pessoa && cpfCnpj) {
        sanitizedDados.tipo_pessoa = cpfCnpj.length === 14 ? 'PJ' : 'PF';
      }
    }
  } else if (entidadeTipo === 'barragem') {
    sanitizedDados = sanitizeFields(
      rawDados,
      BARRAGEM_ALLOWED_FIELDS,
      numericBarragemFields,
      booleanBarragemFields
    );
    if (operacao === 'cadastrar_barragem') {
      const nome = normalizeOptionalString(sanitizedDados.nome);
      if (!nome || nome.length < 2) {
        throw new OperacaoValidationError(
          'INVALID_BARRAGEM',
          'Informe nome válido para cadastrar barragem.'
        );
      }
    }
  } else {
    sanitizedDados = sanitizeFields(
      rawDados,
      RT_ALLOWED_FIELDS,
      new Set(),
      new Set()
    );
    if (operacao === 'cadastrar_rt') {
      const nome = normalizeOptionalString(sanitizedDados.nome);
      if (!nome || nome.length < 2) {
        throw new OperacaoValidationError(
          'INVALID_RT',
          'Informe nome válido para cadastrar responsável técnico.'
        );
      }
      const cpf = typeof sanitizedDados.cpf === 'string' ? sanitizedDados.cpf : '';
      if (cpf && cpf.length !== 11) {
        throw new OperacaoValidationError(
          'INVALID_CPF',
          'cpf do responsável técnico deve conter 11 dígitos.'
        );
      }
    }
  }

  let justificativa: string | null = null;
  if (isProporAlteracao) {
    if (Object.keys(sanitizedDados).length === 0) {
      throw new OperacaoValidationError(
        'EMPTY_ALTERACOES',
        `Informe ao menos um campo permitido em dados para ${operacao}.`
      );
    }
    justificativa = normalizeOptionalString(input.justificativa);
    if (!justificativa || justificativa.length < 3) {
      throw new OperacaoValidationError(
        'MISSING_JUSTIFICATIVA',
        `Informe uma justificativa com ao menos 3 caracteres para ${operacao}.`
      );
    }
  }

  const origemDocumentoTipo = normalizeOptionalString(input.origemDocumentoTipo);
  const origemDocumentoId = normalizeOptionalString(input.origemDocumentoId);

  const idempotencyKey = computeDeterministicIdempotencyKey({
    operacao,
    entidadeTipo,
    entidadeId,
    dados: sanitizedDados,
    justificativa,
    origemDocumentoTipo,
    origemDocumentoId,
    solicitanteUserId,
  });

  const requestBody: Record<string, unknown> = {
    operacao,
    entidade_tipo: entidadeTipo,
    ...(entidadeId ? { entidade_id: entidadeId } : {}),
    ...(isProporAlteracao
      ? { alteracoes: sanitizedDados, justificativa }
      : { dados: sanitizedDados }),
    idempotencyKey,
    origem: {
      sistema: 'CLASSIFICA_CSB',
      ...(origemDocumentoTipo ? { documento_tipo: origemDocumentoTipo } : {}),
      ...(origemDocumentoId ? { documento_id: origemDocumentoId } : {}),
    },
  };

  return {
    operacao,
    entidadeTipo,
    entidadeId,
    dados: sanitizedDados,
    justificativa,
    origemDocumentoTipo,
    origemDocumentoId,
    idempotencyKey,
    requestBody,
  };
}

export function resolveAdministraOperacoesUrl(
  rawBaseUrl: string,
  opts?: { env?: NodeJS.ProcessEnv }
): string {
  const trimmed = rawBaseUrl.trim();
  if (!trimmed) {
    throw new Error('ADMINISTRA_API_URL não configurada.');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('ADMINISTRA_API_URL inválida.');
  }

  if (parsed.username || parsed.password || /^[^/]+:\/\/[^/]*@/.test(trimmed)) {
    throw new Error('ADMINISTRA_API_URL não deve conter credenciais.');
  }

  const runtimeEnv = opts?.env ?? process.env;
  const isProduction =
    runtimeEnv.NODE_ENV === 'production' ||
    runtimeEnv.VERCEL_ENV === 'production';
  const isLocalhost =
    parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';

  if (isProduction) {
    if (parsed.protocol !== 'https:') {
      throw new Error('ADMINISTRA_API_URL deve utilizar protocolo HTTPS em produção.');
    }
  } else if (parsed.protocol !== 'https:' && !isLocalhost) {
    throw new Error('ADMINISTRA_API_URL deve utilizar protocolo HTTPS.');
  }

  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    throw new Error('ADMINISTRA_API_URL deve conter apenas a URL-base, sem caminho.');
  }

  if (
    parsed.search ||
    parsed.hash ||
    trimmed.includes('?') ||
    trimmed.includes('#')
  ) {
    throw new Error('ADMINISTRA_API_URL não deve conter query string nem fragmento.');
  }

  return `${parsed.origin}${ADMINISTRA_OPERACOES_V2_PATH}`;
}

export function buildS2sV2OperacoesCanonicalString(input: {
  bodySha256: string;
  keyId: string;
  timestamp: string;
  jti: string;
  consumerUserId: string;
}): string {
  const bodySha256 = assertSingleLine(input.bodySha256, 'bodySha256');
  const keyId = assertSingleLine(input.keyId, 'CLASSIFICA_S2S_KID');
  const timestamp = assertSingleLine(input.timestamp, 'timestamp');
  if (!/^\d+$/.test(timestamp)) {
    throw new Error('timestamp deve ser Unix em segundos.');
  }
  const jti = assertSingleLine(input.jti, 'jti');
  if (!UUID_V4_REGEX.test(jti)) {
    throw new Error('jti deve ser um UUID v4 válido.');
  }
  const consumerUserId = assertSingleLine(input.consumerUserId, 'x-consumer-user-id');
  if (consumerUserId.includes('|')) {
    throw new Error('x-consumer-user-id inválido.');
  }

  return [
    S2S_V2_VERSION,
    'POST',
    ADMINISTRA_OPERACOES_V2_PATH,
    '',
    'application/json',
    bodySha256,
    keyId,
    timestamp,
    jti,
    `${consumerUserId}|`,
  ].join('\n');
}

export function createAdministraS2sOperacoesHeaders(params: {
  bodyText: string;
  keyId: string;
  privateKeyPem: string;
  consumerUserId: string;
  timestamp?: string;
  jti?: string;
}): {
  headers: S2sV2OperacoesHeaders;
  canonicalString: string;
  bodySha256: string;
  timestamp: string;
  jti: string;
} {
  const timestamp = params.timestamp ?? String(Math.floor(Date.now() / 1000));
  const jti = params.jti ?? crypto.randomUUID();
  const bodySha256 = crypto
    .createHash('sha256')
    .update(params.bodyText, 'utf8')
    .digest('hex');

  const canonicalString = buildS2sV2OperacoesCanonicalString({
    bodySha256,
    keyId: params.keyId,
    timestamp,
    jti,
    consumerUserId: params.consumerUserId,
  });

  const signature = signS2sV2Canonical(canonicalString, params.privateKeyPem);

  const headers: S2sV2OperacoesHeaders = {
    'Content-Type': 'application/json',
    'x-s2s-key-id': params.keyId.trim(),
    'x-s2s-timestamp': timestamp,
    'x-s2s-jti': jti,
    'x-s2s-body-sha256': bodySha256,
    'x-s2s-signature': signature,
    'x-consumer-user-id': params.consumerUserId.trim(),
    'x-s2s-scope': ADMINISTRA_OPERACOES_V2_SCOPE,
  };

  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === 'authorization') {
      throw new Error('Cabeçalho Authorization proibido em S2S-V2.');
    }
  }

  return {
    headers,
    canonicalString,
    bodySha256,
    timestamp,
    jti,
  };
}

function sanitizeResponsePayload(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const src = raw as Record<string, unknown>;
  const safeKeys = [
    'ok',
    'status',
    'estado',
    'code',
    'codigo',
    'message',
    'mensagem',
    'error',
    'idempotencyKey',
    'idempotency_key',
    'entidade_id',
    'entidadeId',
    'solicitacao_id',
    'solicitacaoId',
    'operacao',
    'entidade_tipo',
    'entidadeTipo',
    'duplicado',
    'requer_aprovacao',
  ];
  const out: Record<string, unknown> = {};
  for (const key of safeKeys) {
    if (key in src && src[key] !== undefined) {
      out[key] = src[key];
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function pickOptionalString(
  obj: Record<string, unknown> | null,
  keys: string[]
): string | null {
  if (!obj) return null;
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

export async function dispatchAdministraS2sOperacao(params: {
  operacao: NormalizedAdministraOperacao;
  consumerUserId: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  timestamp?: string;
}): Promise<AdministraOperacaoDispatchResult> {
  if (typeof window !== 'undefined') {
    throw new Error('Cliente S2S-V2 só pode ser executado no servidor.');
  }

  const runtimeEnv = params.env ?? process.env;

  let url: string;
  let headers: S2sV2OperacoesHeaders;
  const bodyText = JSON.stringify(params.operacao.requestBody);

  try {
    const config = readAdministraS2sEnv(runtimeEnv);
    url = resolveAdministraOperacoesUrl(config.baseUrl, { env: runtimeEnv });
    ({ headers } = createAdministraS2sOperacoesHeaders({
      bodyText,
      keyId: config.keyId,
      privateKeyPem: config.privateKeyPem,
      consumerUserId: params.consumerUserId,
      timestamp: params.timestamp,
      jti: crypto.randomUUID(),
    }));
  } catch (err) {
    return {
      ok: false,
      outcome: 'erro_temporario',
      httpStatus: 503,
      retryable: true,
      configError: true,
      code: 'ADMINISTRA_S2S_CONFIG_INVALID',
      message:
        err instanceof Error
          ? err.message
          : 'Configuração S2S-V2 ausente ou inválida no servidor.',
      idempotencyKey: params.operacao.idempotencyKey,
      entidadeIdRetorno: null,
      solicitacaoIdRetorno: null,
      responsePayload: null,
    };
  }

  const fetchFn = params.fetchImpl ?? fetch;
  const timeoutMs = params.timeoutMs ?? 10_000;

  try {
    const response = await fetchFn(url, {
      method: 'POST',
      headers,
      body: bodyText,
      signal: AbortSignal.timeout(timeoutMs),
    });

    const rawText = await response.text();
    let parsed: unknown = null;
    if (rawText) {
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = null;
      }
    }

    const safePayload = sanitizeResponsePayload(parsed);
    const codeFromBody = pickOptionalString(safePayload, ['code', 'codigo']);
    const msgFromBody = pickOptionalString(safePayload, [
      'message',
      'mensagem',
      'error',
    ]);
    const entidadeIdRetorno = pickOptionalString(safePayload, [
      'entidade_id',
      'entidadeId',
    ]);
    const solicitacaoIdRetorno = pickOptionalString(safePayload, [
      'solicitacao_id',
      'solicitacaoId',
    ]);

    if (response.status === 200) {
      return {
        ok: true,
        outcome: 'concluida',
        httpStatus: 200,
        retryable: false,
        code: codeFromBody || 'OPERACAO_CONCLUIDA',
        message: msgFromBody || 'Operação concluída no Administra Barragens.',
        idempotencyKey: params.operacao.idempotencyKey,
        entidadeIdRetorno,
        solicitacaoIdRetorno,
        responsePayload: safePayload,
      };
    }

    if (response.status === 202) {
      return {
        ok: true,
        outcome: 'aguardando_aprovacao',
        httpStatus: 202,
        retryable: false,
        code: codeFromBody || 'AGUARDANDO_APROVACAO',
        message:
          msgFromBody ||
          'Proposta enviada e aguardando aprovação de Administrador no Administra Barragens.',
        idempotencyKey: params.operacao.idempotencyKey,
        entidadeIdRetorno,
        solicitacaoIdRetorno,
        responsePayload: safePayload,
      };
    }

    if (response.status === 409) {
      return {
        ok: false,
        outcome: 'conflito',
        httpStatus: 409,
        retryable: false,
        code: codeFromBody || 'ADMINISTRA_CONFLITO',
        message:
          msgFromBody ||
          'Conflito ou duplicidade detectada no Administra Barragens (HTTP 409).',
        idempotencyKey: params.operacao.idempotencyKey,
        entidadeIdRetorno,
        solicitacaoIdRetorno,
        responsePayload: safePayload,
      };
    }

    if (
      response.status === 503 ||
      response.status === 502 ||
      response.status === 504 ||
      response.status === 429
    ) {
      return {
        ok: false,
        outcome: 'erro_temporario',
        httpStatus: response.status,
        retryable: true,
        code: codeFromBody || 'ADMINISTRA_INDISPONIVEL',
        message:
          msgFromBody ||
          `Administra Barragens indisponível ou política inativa (HTTP ${response.status}). Operação preservada na fila para reprocessamento seguro.`,
        idempotencyKey: params.operacao.idempotencyKey,
        entidadeIdRetorno,
        solicitacaoIdRetorno,
        responsePayload: safePayload,
      };
    }

    return {
      ok: false,
      outcome: 'rejeitada',
      httpStatus: response.status || 400,
      retryable: false,
      code: codeFromBody || 'ADMINISTRA_OPERACAO_REJEITADA',
      message:
        msgFromBody ||
        `Operação rejeitada pelo Administra Barragens (HTTP ${response.status}).`,
      idempotencyKey: params.operacao.idempotencyKey,
      entidadeIdRetorno,
      solicitacaoIdRetorno,
      responsePayload: safePayload,
    };
  } catch {
    return {
      ok: false,
      outcome: 'erro_temporario',
      httpStatus: 503,
      retryable: true,
      code: 'ADMINISTRA_NETWORK_ERROR',
      message:
        'Falha de rede ou timeout ao enviar operação ao Administra Barragens. Operação preservada na outbox para reprocessamento seguro.',
      idempotencyKey: params.operacao.idempotencyKey,
      entidadeIdRetorno: null,
      solicitacaoIdRetorno: null,
      responsePayload: null,
    };
  }
}
