import crypto from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  buildValidatedAdministraOperacao,
  dispatchAdministraS2sOperacao,
  type AdministraEntidadeAlvo,
  type AdministraOperacaoDispatchResult,
  type AllowedS2sOperacao,
  type NormalizedAdministraOperacao,
  type OperacaoInput,
} from './administraS2sOperacoes.js';

export const ADMINISTRA_OUTBOX_TABLE = 'administra_operacoes_outbox';
export const DEFAULT_OUTBOX_MAX_TENTATIVAS = 5;

export type AdministraOutboxEstado =
  | 'pendente'
  | 'processando'
  | 'concluida'
  | 'aguardando_aprovacao'
  | 'conflito'
  | 'erro_temporario'
  | 'rejeitada';

export interface AdministraOutboxRecord {
  id: string;
  operacao: AllowedS2sOperacao;
  entidade_tipo: AdministraEntidadeAlvo;
  entidade_id: string | null;
  idempotency_key: string;
  payload: Record<string, unknown>;
  solicitante_user_id: string;
  solicitante_nome: string;
  solicitante_role: string;
  origem_documento_tipo: string | null;
  origem_documento_id: string | null;
  estado: AdministraOutboxEstado;
  tentativas: number;
  max_tentativas: number;
  proxima_tentativa_em: string | null;
  resposta_http_status: number | null;
  resposta_codigo: string | null;
  resposta_payload: Record<string, unknown> | null;
  ultimo_erro: string | null;
  entidade_id_retorno: string | null;
  solicitacao_id_retorno: string | null;
  created_at: string;
  updated_at: string;
  processado_em: string | null;
}

export type NewAdministraOutboxRecord = Omit<
  AdministraOutboxRecord,
  'id' | 'created_at' | 'updated_at'
> & { id?: string };

export interface AdministraOutboxStore {
  findByIdempotencyKey(key: string): Promise<AdministraOutboxRecord | null>;
  findById(id: string): Promise<AdministraOutboxRecord | null>;
  insert(record: NewAdministraOutboxRecord): Promise<AdministraOutboxRecord>;
  update(
    id: string,
    patch: Partial<Omit<AdministraOutboxRecord, 'id' | 'created_at'>>
  ): Promise<AdministraOutboxRecord>;
  listEligibleForRetry(
    limit: number,
    nowIso: string
  ): Promise<AdministraOutboxRecord[]>;
  listRecent(opts: {
    limit: number;
    estado?: AdministraOutboxEstado;
  }): Promise<AdministraOutboxRecord[]>;
}

export class OutboxStorageError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus = 503) {
    super(message);
    this.name = 'OutboxStorageError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export interface EnqueueAndDispatchParams {
  input: OperacaoInput;
  solicitanteNome: string;
  solicitanteRole: string;
}

export interface EnqueueAndDispatchResult {
  ok: boolean;
  httpStatus: number;
  deduplicated: boolean;
  code: string;
  message: string;
  record: AdministraOutboxRecord;
}

export interface ReprocessOutboxResult {
  ok: boolean;
  processed: number;
  succeeded: number;
  awaitingApproval: number;
  conflicts: number;
  failedTemporary: number;
  rejected: number;
  items: AdministraOutboxRecord[];
}

export interface OutboxExecutionDeps {
  store: AdministraOutboxStore;
  dispatchOperacao?: typeof dispatchAdministraS2sOperacao;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

function normalizeSupabaseOrigin(rawUrl?: string): string {
  const trimmed = rawUrl?.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    const isLocalhost =
      parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (parsed.protocol !== 'https:' && !isLocalhost) return '';
    return parsed.origin;
  } catch {
    return '';
  }
}

function inspectServiceKeyRole(secretKey: string): {
  validServiceRole: boolean;
  keyFormat: 'jwt' | 'sb_secret' | 'sb_publishable' | 'unknown';
} {
  if (secretKey.startsWith('sb_secret_')) {
    return { validServiceRole: true, keyFormat: 'sb_secret' };
  }
  if (secretKey.startsWith('sb_publishable_')) {
    return { validServiceRole: false, keyFormat: 'sb_publishable' };
  }
  const parts = secretKey.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64url').toString('utf8')
      ) as Record<string, unknown>;
      return {
        validServiceRole: payload?.role === 'service_role',
        keyFormat: 'jwt',
      };
    } catch {
      return { validServiceRole: false, keyFormat: 'unknown' };
    }
  }
  return { validServiceRole: false, keyFormat: 'unknown' };
}

function mapSupabaseOutboxError(err: {
  code?: string;
  message?: string;
}): OutboxStorageError {
  const code = String(err.code || '').trim().toUpperCase();
  const message = String(err.message || '').toLowerCase();
  if (
    code === '42P01' ||
    code === 'PGRST205' ||
    message.includes('administra_operacoes_outbox') &&
      (message.includes('does not exist') || message.includes('could not find'))
  ) {
    return new OutboxStorageError(
      'OUTBOX_MIGRATION_PENDING',
      'Tabela public.administra_operacoes_outbox ainda não aplicada no Supabase do Classifica. Aplique sql/04_administra_s2s_operacoes_outbox.sql para habilitar a fila persistente.',
      503
    );
  }
  return new OutboxStorageError(
    'OUTBOX_STORAGE_ERROR',
    'Falha ao persistir operação na outbox do Classifica CSB.',
    503
  );
}

export function createSupabaseAdministraOutboxStore(opts?: {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): AdministraOutboxStore {
  const env = opts?.env ?? process.env;
  const url = normalizeSupabaseOrigin(
    env.CLASSIFICA_SUPABASE_URL || env.SUPABASE_URL || env.VITE_SUPABASE_URL
  );
  const serviceKey = (
    env.CLASSIFICA_SUPABASE_SERVICE_ROLE_KEY ||
    env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  ).trim();

  if (!url || !serviceKey) {
    throw new OutboxStorageError(
      'OUTBOX_STORAGE_UNAVAILABLE',
      'Persistência da outbox S2S requer SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY configuradas no servidor.',
      503
    );
  }

  const keyInfo = inspectServiceKeyRole(serviceKey);
  if (!keyInfo.validServiceRole) {
    throw new OutboxStorageError(
      'OUTBOX_INVALID_SERVICE_KEY',
      'SUPABASE_SERVICE_ROLE_KEY inválida para acesso exclusivo de servidor à outbox.',
      503
    );
  }

  const fetchImpl = opts?.fetchImpl ?? fetch;
  const isolatedFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    headers.delete('Authorization');
    headers.delete('authorization');
    headers.set('apikey', serviceKey);
    if (keyInfo.keyFormat === 'jwt') {
      headers.set('Authorization', `Bearer ${serviceKey}`);
    }
    return fetchImpl(input, { ...init, headers });
  };

  const client: SupabaseClient = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: isolatedFetch,
      headers: { 'X-Client-Info': 'classifica-s2s-outbox-server' },
    },
  });

  return {
    async findByIdempotencyKey(key: string) {
      const { data, error } = await client
        .from(ADMINISTRA_OUTBOX_TABLE)
        .select('*')
        .eq('idempotency_key', key)
        .maybeSingle();
      if (error) throw mapSupabaseOutboxError(error);
      return (data as AdministraOutboxRecord | null) ?? null;
    },

    async findById(id: string) {
      const { data, error } = await client
        .from(ADMINISTRA_OUTBOX_TABLE)
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw mapSupabaseOutboxError(error);
      return (data as AdministraOutboxRecord | null) ?? null;
    },

    async insert(record: NewAdministraOutboxRecord) {
      const { data, error } = await client
        .from(ADMINISTRA_OUTBOX_TABLE)
        .insert(record)
        .select('*')
        .single();
      if (error || !data) throw mapSupabaseOutboxError(error || {});
      return data as AdministraOutboxRecord;
    },

    async update(id, patch) {
      const { data, error } = await client
        .from(ADMINISTRA_OUTBOX_TABLE)
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
      if (error || !data) throw mapSupabaseOutboxError(error || {});
      return data as AdministraOutboxRecord;
    },

    async listEligibleForRetry(limit: number, nowIso: string) {
      const { data, error } = await client
        .from(ADMINISTRA_OUTBOX_TABLE)
        .select('*')
        .in('estado', ['pendente', 'erro_temporario'])
        .or(`proxima_tentativa_em.is.null,proxima_tentativa_em.lte.${nowIso}`)
        .order('created_at', { ascending: true })
        .limit(limit);
      if (error) throw mapSupabaseOutboxError(error);
      const rows = (Array.isArray(data) ? data : []) as AdministraOutboxRecord[];
      return rows.filter((row) => row.tentativas < row.max_tentativas);
    },

    async listRecent({ limit, estado }) {
      let query = client
        .from(ADMINISTRA_OUTBOX_TABLE)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (estado) {
        query = query.eq('estado', estado);
      }
      const { data, error } = await query;
      if (error) throw mapSupabaseOutboxError(error);
      return (Array.isArray(data) ? data : []) as AdministraOutboxRecord[];
    },
  };
}

export function createInMemoryAdministraOutboxStore(
  initial: AdministraOutboxRecord[] = []
): AdministraOutboxStore {
  const rows = new Map<string, AdministraOutboxRecord>();
  for (const r of initial) {
    rows.set(r.id, { ...r });
  }

  return {
    async findByIdempotencyKey(key: string) {
      for (const r of rows.values()) {
        if (r.idempotency_key === key) return { ...r };
      }
      return null;
    },
    async findById(id: string) {
      const found = rows.get(id);
      return found ? { ...found } : null;
    },
    async insert(record: NewAdministraOutboxRecord) {
      for (const existing of rows.values()) {
        if (existing.idempotency_key === record.idempotency_key) {
          throw new OutboxStorageError(
            'OUTBOX_DUPLICATE_KEY',
            'idempotency_key duplicada.',
            409
          );
        }
      }
      const nowIso = new Date().toISOString();
      const created: AdministraOutboxRecord = {
        ...record,
        id: record.id ?? crypto.randomUUID(),
        created_at: nowIso,
        updated_at: nowIso,
      };
      rows.set(created.id, created);
      return { ...created };
    },
    async update(id, patch) {
      const current = rows.get(id);
      if (!current) {
        throw new OutboxStorageError(
          'OUTBOX_NOT_FOUND',
          'Registro da outbox não encontrado.',
          404
        );
      }
      const updated: AdministraOutboxRecord = {
        ...current,
        ...patch,
        id: current.id,
        created_at: current.created_at,
        updated_at: new Date().toISOString(),
      };
      rows.set(id, updated);
      return { ...updated };
    },
    async listEligibleForRetry(limit: number, nowIso: string) {
      const nowMs = Date.parse(nowIso);
      return Array.from(rows.values())
        .filter((r) => {
          if (r.estado !== 'pendente' && r.estado !== 'erro_temporario') {
            return false;
          }
          if (r.tentativas >= r.max_tentativas) return false;
          if (!r.proxima_tentativa_em) return true;
          return Date.parse(r.proxima_tentativa_em) <= nowMs;
        })
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .slice(0, limit)
        .map((r) => ({ ...r }));
    },
    async listRecent({ limit, estado }) {
      return Array.from(rows.values())
        .filter((r) => (!estado ? true : r.estado === estado))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, limit)
        .map((r) => ({ ...r }));
    },
  };
}

function computeNextRetryIso(
  now: Date,
  nextAttempt: number,
  maxTentativas: number
): string | null {
  if (nextAttempt >= maxTentativas) return null;
  const delaySec = Math.min(3600, 30 * Math.pow(2, Math.max(0, nextAttempt - 1)));
  return new Date(now.getTime() + delaySec * 1000).toISOString();
}

function reconstructNormalizedOperacaoFromRecord(
  record: AdministraOutboxRecord
): NormalizedAdministraOperacao {
  const payload = record.payload || {};
  const isPropor = record.operacao.startsWith('propor_alteracao_');
  const dados = isPropor
    ? ((payload.alteracoes as Record<string, unknown>) ?? {})
    : ((payload.dados as Record<string, unknown>) ?? {});
  const justificativa =
    typeof payload.justificativa === 'string' ? payload.justificativa : null;

  return {
    operacao: record.operacao,
    entidadeTipo: record.entidade_tipo,
    entidadeId: record.entidade_id,
    dados,
    justificativa,
    origemDocumentoTipo: record.origem_documento_tipo,
    origemDocumentoId: record.origem_documento_id,
    idempotencyKey: record.idempotency_key,
    requestBody: {
      ...payload,
      operacao: record.operacao,
      entidade_tipo: record.entidade_tipo,
      ...(record.entidade_id ? { entidade_id: record.entidade_id } : {}),
      idempotencyKey: record.idempotency_key,
    },
  };
}

function buildResultFromExistingRecord(
  record: AdministraOutboxRecord
): EnqueueAndDispatchResult {
  if (record.estado === 'concluida') {
    return {
      ok: true,
      httpStatus: 200,
      deduplicated: true,
      code: record.resposta_codigo || 'OPERACAO_CONCLUIDA',
      message: 'Operação já concluída anteriormente com a mesma idempotencyKey.',
      record,
    };
  }
  if (record.estado === 'aguardando_aprovacao') {
    return {
      ok: true,
      httpStatus: 202,
      deduplicated: true,
      code: record.resposta_codigo || 'AGUARDANDO_APROVACAO',
      message:
        'Solicitação já registrada e aguardando aprovação de Administrador no Administra.',
      record,
    };
  }
  if (record.estado === 'conflito') {
    return {
      ok: false,
      httpStatus: 409,
      deduplicated: true,
      code: record.resposta_codigo || 'ADMINISTRA_CONFLITO',
      message:
        record.ultimo_erro ||
        'Operação anteriormente marcada com conflito no Administra (HTTP 409).',
      record,
    };
  }
  if (record.estado === 'processando') {
    return {
      ok: false,
      httpStatus: 409,
      deduplicated: true,
      code: 'OUTBOX_IN_FLIGHT',
      message: 'Operação já está em processamento na fila.',
      record,
    };
  }
  const status =
    record.resposta_http_status &&
    record.resposta_http_status >= 400 &&
    record.resposta_http_status < 500
      ? record.resposta_http_status
      : 422;
  return {
    ok: false,
    httpStatus: status,
    deduplicated: true,
    code: record.resposta_codigo || 'ADMINISTRA_OPERACAO_REJEITADA',
    message:
      record.ultimo_erro ||
      'Operação anteriormente rejeitada pelo Administra Barragens.',
    record,
  };
}

async function applyDispatchOutcomeToOutbox(
  store: AdministraOutboxStore,
  record: AdministraOutboxRecord,
  dispatch: AdministraOperacaoDispatchResult,
  now: Date
): Promise<AdministraOutboxRecord> {
  const nextAttempts = record.tentativas + 1;
  const nowIso = now.toISOString();

  if (dispatch.outcome === 'concluida' || dispatch.outcome === 'aguardando_aprovacao') {
    return store.update(record.id, {
      estado: dispatch.outcome,
      tentativas: nextAttempts,
      proxima_tentativa_em: null,
      resposta_http_status: dispatch.httpStatus,
      resposta_codigo: dispatch.code,
      resposta_payload: dispatch.responsePayload,
      ultimo_erro: null,
      entidade_id_retorno:
        dispatch.entidadeIdRetorno ?? record.entidade_id_retorno,
      solicitacao_id_retorno:
        dispatch.solicitacaoIdRetorno ?? record.solicitacao_id_retorno,
      processado_em: nowIso,
    });
  }

  if (dispatch.outcome === 'erro_temporario') {
    return store.update(record.id, {
      estado: 'erro_temporario',
      tentativas: nextAttempts,
      proxima_tentativa_em: computeNextRetryIso(
        now,
        nextAttempts,
        record.max_tentativas
      ),
      resposta_http_status: dispatch.httpStatus,
      resposta_codigo: dispatch.code,
      resposta_payload: dispatch.responsePayload,
      ultimo_erro: dispatch.message,
      processado_em: null,
    });
  }

  return store.update(record.id, {
    estado: dispatch.outcome,
    tentativas: nextAttempts,
    proxima_tentativa_em: null,
    resposta_http_status: dispatch.httpStatus,
    resposta_codigo: dispatch.code,
    resposta_payload: dispatch.responsePayload,
    ultimo_erro: dispatch.message,
    processado_em: nowIso,
  });
}

export async function enqueueAndDispatchAdministraOperacao(
  params: EnqueueAndDispatchParams,
  deps: OutboxExecutionDeps
): Promise<EnqueueAndDispatchResult> {
  const normalized = buildValidatedAdministraOperacao(params.input);
  const dispatchFn = deps.dispatchOperacao ?? dispatchAdministraS2sOperacao;
  const now = (deps.now ?? (() => new Date()))();

  const existing = await deps.store.findByIdempotencyKey(
    normalized.idempotencyKey
  );

  let record: AdministraOutboxRecord;
  if (existing) {
    if (
      existing.estado === 'concluida' ||
      existing.estado === 'aguardando_aprovacao' ||
      existing.estado === 'conflito' ||
      existing.estado === 'rejeitada' ||
      existing.estado === 'processando'
    ) {
      return buildResultFromExistingRecord(existing);
    }
    record = await deps.store.update(existing.id, {
      estado: 'processando',
    });
  } else {
    record = await deps.store.insert({
      operacao: normalized.operacao,
      entidade_tipo: normalized.entidadeTipo,
      entidade_id: normalized.entidadeId,
      idempotency_key: normalized.idempotencyKey,
      payload: normalized.requestBody,
      solicitante_user_id: params.input.solicitanteUserId,
      solicitante_nome: params.solicitanteNome,
      solicitante_role: params.solicitanteRole,
      origem_documento_tipo: normalized.origemDocumentoTipo,
      origem_documento_id: normalized.origemDocumentoId,
      estado: 'processando',
      tentativas: 0,
      max_tentativas: DEFAULT_OUTBOX_MAX_TENTATIVAS,
      proxima_tentativa_em: null,
      resposta_http_status: null,
      resposta_codigo: null,
      resposta_payload: null,
      ultimo_erro: null,
      entidade_id_retorno: null,
      solicitacao_id_retorno: null,
      processado_em: null,
    });
  }

  const dispatch = await dispatchFn({
    operacao: normalized,
    consumerUserId: params.input.solicitanteUserId,
    env: deps.env,
    fetchImpl: deps.fetchImpl,
  });

  const updated = await applyDispatchOutcomeToOutbox(
    deps.store,
    record,
    dispatch,
    now
  );

  return {
    ok: dispatch.ok,
    httpStatus: dispatch.httpStatus,
    deduplicated: Boolean(existing),
    code: dispatch.code,
    message: dispatch.message,
    record: updated,
  };
}

export async function reprocessAdministraOutbox(
  opts: { id?: string; limit?: number; force?: boolean },
  deps: OutboxExecutionDeps
): Promise<ReprocessOutboxResult> {
  const dispatchFn = deps.dispatchOperacao ?? dispatchAdministraS2sOperacao;
  const now = (deps.now ?? (() => new Date()))();
  const nowIso = now.toISOString();

  let candidates: AdministraOutboxRecord[] = [];
  if (opts.id) {
    const item = await deps.store.findById(opts.id);
    if (!item) {
      throw new OutboxStorageError(
        'OUTBOX_NOT_FOUND',
        'Registro da outbox não encontrado.',
        404
      );
    }
    if (item.estado === 'pendente' || item.estado === 'erro_temporario') {
      if (item.tentativas < item.max_tentativas || opts.force) {
        candidates = [item];
      }
    } else {
      return {
        ok: item.estado === 'concluida' || item.estado === 'aguardando_aprovacao',
        processed: 0,
        succeeded: 0,
        awaitingApproval: 0,
        conflicts: 0,
        failedTemporary: 0,
        rejected: 0,
        items: [item],
      };
    }
  } else {
    const safeLimit = Math.max(1, Math.min(50, Number(opts.limit ?? 20) || 20));
    candidates = await deps.store.listEligibleForRetry(safeLimit, nowIso);
  }

  let succeeded = 0;
  let awaitingApproval = 0;
  let conflicts = 0;
  let failedTemporary = 0;
  let rejected = 0;
  const processedItems: AdministraOutboxRecord[] = [];

  for (const item of candidates) {
    const processing = await deps.store.update(item.id, {
      estado: 'processando',
    });
    const normalized = reconstructNormalizedOperacaoFromRecord(processing);
    const dispatch = await dispatchFn({
      operacao: normalized,
      consumerUserId: processing.solicitante_user_id,
      env: deps.env,
      fetchImpl: deps.fetchImpl,
    });
    const updated = await applyDispatchOutcomeToOutbox(
      deps.store,
      processing,
      dispatch,
      now
    );
    processedItems.push(updated);

    if (updated.estado === 'concluida') succeeded += 1;
    else if (updated.estado === 'aguardando_aprovacao') awaitingApproval += 1;
    else if (updated.estado === 'conflito') conflicts += 1;
    else if (updated.estado === 'erro_temporario') failedTemporary += 1;
    else if (updated.estado === 'rejeitada') rejected += 1;
  }

  return {
    ok: failedTemporary === 0 && conflicts === 0 && rejected === 0,
    processed: processedItems.length,
    succeeded,
    awaitingApproval,
    conflicts,
    failedTemporary,
    rejected,
    items: processedItems,
  };
}
