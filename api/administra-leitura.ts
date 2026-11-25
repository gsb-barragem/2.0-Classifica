import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  ADMINISTRA_BARRAGENS_V2_PATH,
  requestAdministraS2sGet,
} from '../server/administraS2sHealth';

export type AdministraLeituraAction =
  | 'diagnostico'
  | 'empreendedores'
  | 'barragens'
  | 'barragens_v2'
  | 'rts'
  | 'vinculos_rt_barragem';

export type AdministraRpcName =
  | 'csb_ler_empreendedores'
  | 'csb_ler_barragens'
  | 'csb_ler_rts'
  | 'csb_ler_vinculos_rt_barragem';

type NodeReq = IncomingMessage & { body?: unknown };
type NodeRes = ServerResponse & {
  status?: (code: number) => NodeRes;
  json?: (payload: unknown) => void;
};

export interface AdministraLeituraDeps {
  verifySession?: typeof verifyClassificaSession;
  getAdministraClient?: typeof getAdministraServerClient;
  requestS2sGet?: typeof requestAdministraS2sGet;
  s2sEnv?: NodeJS.ProcessEnv;
}

const ALLOWED_ACTIONS = new Set<AdministraLeituraAction>([
  'diagnostico',
  'empreendedores',
  'barragens',
  'barragens_v2',
  'rts',
  'vinculos_rt_barragem',
]);

function normalizeOrigin(rawUrl?: string): string {
  const trimmed = rawUrl?.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (parsed.protocol !== 'https:' && !isLocalhost) return '';
    return parsed.origin;
  } catch {
    return '';
  }
}

function sendJson(res: NodeRes, statusCode: number, payload: unknown): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (typeof res.status === 'function' && typeof res.json === 'function') {
    const chained = res.status(statusCode);
    if (typeof chained.json === 'function') {
      chained.json(payload);
      return;
    }
  }

  res.statusCode = statusCode;
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req: NodeReq): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body as Record<string, unknown>;
  }
  if (typeof req.body === 'string') {
    try {
      const parsed = JSON.parse(req.body);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buf.length;
    if (totalBytes > 128 * 1024) {
      throw new Error('PAYLOAD_TOO_LARGE');
    }
    chunks.push(buf);
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function isProfileActive(profile: Record<string, unknown> | null | undefined): boolean {
  if (!profile) return false;
  if (profile.active === false) return false;
  if (profile.active === true) return true;
  const statusText = String(profile.status ?? profile.situacao ?? '').trim().toLowerCase();
  return ['ativo', 'ativa', 'active', 'aprovado', 'aprovada'].includes(statusText);
}

async function verifyClassificaSession(bearerToken: string): Promise<
  | { ok: true; userId: string; classificaUrl: string }
  | { ok: false; status: number; code: string; error: string }
> {
  const classificaUrl = normalizeOrigin(
    process.env.CLASSIFICA_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL
  );
  const classificaKey = (
    process.env.CLASSIFICA_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.CLASSIFICA_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ''
  ).trim();

  if (!classificaUrl || !classificaKey) {
    return {
      ok: false,
      status: 503,
      code: 'AUTH_VERIFICATION_UNAVAILABLE',
      error:
        'Autenticação do Classifica CSB não verificável no servidor: configure SUPABASE_URL e SUPABASE_ANON_KEY (ou SUPABASE_SERVICE_ROLE_KEY) nas variáveis do servidor.',
    };
  }

  const userScopedClient = createClient(classificaUrl, classificaKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
      },
    },
  });

  const { data: authData, error: authError } = await userScopedClient.auth.getUser(bearerToken);
  if (authError || !authData?.user) {
    return {
      ok: false,
      status: 401,
      code: 'INVALID_SESSION',
      error: 'Token de sessão do Classifica inválido ou expirado.',
    };
  }

  const authUser = authData.user;

  // 1. Verifica gate oficial do Classifica (classifica_can_access_app / classifica_my_profile)
  const canAccessRes = await userScopedClient.rpc('classifica_can_access_app');
  if (!canAccessRes.error && typeof canAccessRes.data === 'boolean') {
    if (!canAccessRes.data) {
      return {
        ok: false,
        status: 403,
        code: 'FORBIDDEN_PROFILE',
        error: 'Usuário autenticado, porém sem acesso ativo ou com troca de senha pendente no Classifica CSB.',
      };
    }
    return { ok: true, userId: authUser.id, classificaUrl };
  }

  const profileRpc = await userScopedClient.rpc('classifica_my_profile');
  if (!profileRpc.error && profileRpc.data) {
    const row = Array.isArray(profileRpc.data) ? profileRpc.data[0] : profileRpc.data;
    if (isProfileActive(row as Record<string, unknown>) && row?.force_password_change !== true) {
      return { ok: true, userId: authUser.id, classificaUrl };
    }
    return {
      ok: false,
      status: 403,
      code: 'FORBIDDEN_PROFILE',
      error: 'Perfil do usuário inativo ou não aprovado no Classifica CSB.',
    };
  }

  // 2. Fallback caso as RPCs do Classifica ainda não estejam aplicadas (espelha AuthContext)
  const fallbackClient = createClient(classificaUrl, classificaKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
      },
    },
  });

  const tables: Array<{ name: 'users' | 'user' | 'usuarios'; cols: string }> = [
    { name: 'users', cols: 'id, auth_user_id, email, active, force_password_change' },
    { name: 'users', cols: 'id, email, situacao, status' },
    { name: 'user', cols: 'id, email, situacao, status' },
    { name: 'usuarios', cols: 'id, email, situacao, status' },
  ];

  const verifiedEmail = authUser.email?.trim().toLowerCase();
  for (const tbl of tables) {
    if (tbl.cols.includes('auth_user_id')) {
      const byAuthId = await fallbackClient
        .from(tbl.name)
        .select(tbl.cols)
        .eq('auth_user_id', authUser.id)
        .maybeSingle();
      if (!byAuthId.error && byAuthId.data) {
        const rec = byAuthId.data as unknown as Record<string, unknown>;
        if (isProfileActive(rec) && rec.force_password_change !== true) {
          return { ok: true, userId: authUser.id, classificaUrl };
        }
        return {
          ok: false,
          status: 403,
          code: 'FORBIDDEN_PROFILE',
          error: 'Perfil do usuário inativo ou aguardando revisão no Classifica CSB.',
        };
      }
    }

    const byId = await fallbackClient
      .from(tbl.name)
      .select(tbl.cols)
      .eq('id', authUser.id)
      .maybeSingle();
    if (!byId.error && byId.data) {
      const rec = byId.data as unknown as Record<string, unknown>;
      if (isProfileActive(rec) && rec.force_password_change !== true) {
        return { ok: true, userId: authUser.id, classificaUrl };
      }
      return {
        ok: false,
        status: 403,
        code: 'FORBIDDEN_PROFILE',
        error: 'Perfil do usuário inativo ou aguardando revisão no Classifica CSB.',
      };
    }

    if (verifiedEmail) {
      const byEmail = await fallbackClient
        .from(tbl.name)
        .select(tbl.cols)
        .ilike('email', verifiedEmail)
        .maybeSingle();
      if (!byEmail.error && byEmail.data) {
        const rec = byEmail.data as unknown as Record<string, unknown>;
        if (isProfileActive(rec) && rec.force_password_change !== true) {
          return { ok: true, userId: authUser.id, classificaUrl };
        }
        return {
          ok: false,
          status: 403,
          code: 'FORBIDDEN_PROFILE',
          error: 'Perfil do usuário inativo ou aguardando revisão no Classifica CSB.',
        };
      }
    }
  }

  return {
    ok: false,
    status: 403,
    code: 'PROFILE_NOT_VERIFIED',
    error: 'Perfil ativo do usuário não pôde ser verificado no Classifica CSB.',
  };
}

export interface AdministraRuntimeMeta {
  administraUrlPresent: boolean;
  administraServiceRoleKeyPresent: boolean;
  administraHost: string;
  keyFormat: 'jwt' | 'sb_secret' | 'sb_publishable' | 'unknown';
  role: string;
  classificaTokenForwarded: false;
}

function inspectSupabaseKeyMeta(secretKey: string): {
  keyFormat: AdministraRuntimeMeta['keyFormat'];
  role: string;
  ref: string | null;
} {
  if (secretKey.startsWith('sb_secret_')) {
    return { keyFormat: 'sb_secret', role: 'service_role', ref: null };
  }
  if (secretKey.startsWith('sb_publishable_')) {
    return { keyFormat: 'sb_publishable', role: 'anon', ref: null };
  }
  const parts = secretKey.split('.');
  if (parts.length === 3) {
    try {
      const jsonStr = Buffer.from(parts[1], 'base64url').toString('utf8');
      const payload = JSON.parse(jsonStr) as Record<string, unknown>;
      const role = typeof payload?.role === 'string' && payload.role.trim()
        ? payload.role.trim()
        : 'unknown';
      const ref = typeof payload?.ref === 'string' && payload.ref.trim()
        ? payload.ref.trim()
        : null;
      return { keyFormat: 'jwt', role, ref };
    } catch {
      return { keyFormat: 'unknown', role: 'unknown', ref: null };
    }
  }
  return { keyFormat: 'unknown', role: 'unknown', ref: null };
}

function extractHostAndRef(origin: string): { host: string; urlRef: string | null } {
  if (!origin) return { host: '', urlRef: null };
  try {
    const parsed = new URL(origin);
    const host = parsed.host;
    const urlRef = parsed.hostname.endsWith('.supabase.co')
      ? parsed.hostname.split('.')[0] || null
      : null;
    return { host, urlRef };
  } catch {
    return { host: '', urlRef: null };
  }
}

function getAdministraServerClient(classificaUrl?: string):
  | { ok: true; client: SupabaseClient; meta: AdministraRuntimeMeta }
  | { ok: false; status: number; code: string; error: string; meta?: Partial<AdministraRuntimeMeta> } {
  // Exclusivamente ADMINISTRA_SUPABASE_URL e ADMINISTRA_SUPABASE_SERVICE_ROLE_KEY (sem fallbacks ou VITE_)
  const rawUrl = process.env.ADMINISTRA_SUPABASE_URL;
  const url = normalizeOrigin(rawUrl);
  const secretKey = (process.env.ADMINISTRA_SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const { host: administraHost, urlRef } = extractHostAndRef(url);

  if (!url || !secretKey) {
    return {
      ok: false,
      status: 503,
      code: 'ADMINISTRA_SERVER_CONFIG_MISSING',
      error:
        'Configuração server-side do Administra Barragens ausente. Defina ADMINISTRA_SUPABASE_URL e ADMINISTRA_SUPABASE_SERVICE_ROLE_KEY (sem prefixo VITE_) no servidor.',
      meta: {
        administraUrlPresent: Boolean(url),
        administraServiceRoleKeyPresent: Boolean(secretKey),
        administraHost,
        classificaTokenForwarded: false,
      },
    };
  }

  if (classificaUrl && url === classificaUrl) {
    return {
      ok: false,
      status: 503,
      code: 'ADMINISTRA_URL_POINTS_TO_CLASSIFICA',
      error:
        'ADMINISTRA_SUPABASE_URL está apontando para o mesmo projeto Supabase do Classifica CSB em vez do projeto Administra Barragens.',
      meta: {
        administraUrlPresent: true,
        administraServiceRoleKeyPresent: true,
        administraHost,
        classificaTokenForwarded: false,
      },
    };
  }

  const keyMeta = inspectSupabaseKeyMeta(secretKey);

  if (keyMeta.keyFormat === 'sb_publishable' || (keyMeta.keyFormat === 'jwt' && keyMeta.role !== 'service_role') || keyMeta.keyFormat === 'unknown') {
    return {
      ok: false,
      status: 503,
      code: 'ADMINISTRA_INVALID_KEY_ROLE',
      error: `A variável ADMINISTRA_SUPABASE_SERVICE_ROLE_KEY não possui papel service_role (papel detectado: "${keyMeta.role}", formato: ${keyMeta.keyFormat}).`,
      meta: {
        administraUrlPresent: true,
        administraServiceRoleKeyPresent: true,
        administraHost,
        keyFormat: keyMeta.keyFormat,
        role: keyMeta.role,
        classificaTokenForwarded: false,
      },
    };
  }

  if (keyMeta.ref && urlRef && keyMeta.ref !== urlRef) {
    return {
      ok: false,
      status: 503,
      code: 'ADMINISTRA_KEY_PROJECT_MISMATCH',
      error:
        'A chave em ADMINISTRA_SUPABASE_SERVICE_ROLE_KEY pertence a um projeto Supabase diferente da URL configurada em ADMINISTRA_SUPABASE_URL.',
      meta: {
        administraUrlPresent: true,
        administraServiceRoleKeyPresent: true,
        administraHost,
        keyFormat: keyMeta.keyFormat,
        role: keyMeta.role,
        classificaTokenForwarded: false,
      },
    };
  }

  const isolatedFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    // Garante isolamento absoluto: nunca repassar Authorization de usuário Classifica.
    headers.delete('Authorization');
    headers.delete('authorization');
    headers.set('apikey', secretKey);
    if (keyMeta.keyFormat === 'jwt') {
      headers.set('Authorization', `Bearer ${secretKey}`);
    }
    return fetch(input, { ...init, headers });
  };

  const client = createClient(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: isolatedFetch,
      headers: {
        'X-Client-Info': 'classifica-server-to-administra-rpc',
      },
    },
  });

  return {
    ok: true,
    client,
    meta: {
      administraUrlPresent: true,
      administraServiceRoleKeyPresent: true,
      administraHost,
      keyFormat: keyMeta.keyFormat,
      role: keyMeta.role,
      classificaTokenForwarded: false,
    },
  };
}

function classifyRpcError(
  rpc: AdministraRpcName,
  err: { code?: string; message?: string; details?: string | null; hint?: string | null; status?: number },
  meta?: AdministraRuntimeMeta
) {
  const code = err.code || undefined;
  const message = err.message || `Erro ao executar ${rpc}.`;
  const lower = message.toLowerCase();
  const isRlsOrPermission =
    code === '42501' ||
    code === 'PGRST301' ||
    err.status === 401 ||
    err.status === 403 ||
    lower.includes('permission denied') ||
    lower.includes('row-level security') ||
    lower.includes('policy');

  const roleHint = meta ? ` [papel=${meta.role}, formato=${meta.keyFormat}, host=${meta.administraHost}]` : '';

  return {
    rpc,
    code,
    status: err.status,
    message,
    details: err.details ?? null,
    hint: err.hint ?? null,
    isRlsOrPermission,
    administraRole: meta?.role,
    administraHost: meta?.administraHost,
    userMessage: isRlsOrPermission
      ? `Permissão/RLS bloqueou a execução da RPC ${rpc} (${code || err.status || '401'}: ${message})${roleHint}.`
      : `Falha na RPC ${rpc}: ${message}${code ? ` (${code})` : ''}.`,
  };
}

function parseJsonRpcPayload(rpcName: AdministraRpcName, raw: unknown): {
  total: number;
  dados: Record<string, any>[];
} {
  let obj: any = raw;
  if (typeof obj === 'string') {
    try {
      obj = JSON.parse(obj);
    } catch {
      obj = null;
    }
  }
  if (Array.isArray(obj)) {
    const first = obj[0];
    if (first && typeof first === 'object' && rpcName in first) {
      obj = (first as Record<string, any>)[rpcName];
    } else if (first && typeof first === 'object' && 'dados' in first) {
      obj = first;
    }
  }

  const dados = Array.isArray(obj?.dados) ? (obj.dados as Record<string, any>[]) : [];
  const rawTotal = obj?.total;
  const total = typeof rawTotal === 'number' && Number.isFinite(rawTotal)
    ? rawTotal
    : Number.isFinite(Number(rawTotal))
    ? Number(rawTotal)
    : dados.length;

  return { total, dados };
}

type ClassifiedRpcError = ReturnType<typeof classifyRpcError>;

async function callRowsRpc(
  client: SupabaseClient,
  rpc: 'csb_ler_empreendedores' | 'csb_ler_barragens',
  busca: string,
  limite: number,
  offset: number
): Promise<{ rows: Record<string, any>[]; error?: ClassifiedRpcError }> {
  const res = await client.rpc(rpc, {
    p_busca: busca,
    p_limite: limite,
    p_offset: offset,
  });
  if (res.error) {
    return {
      rows: [] as Record<string, any>[],
      error: classifyRpcError(rpc, { ...res.error, status: res.status }),
    };
  }
  const rows = Array.isArray(res.data) ? (res.data as Record<string, any>[]) : [];
  return { rows };
}

async function callJsonRpc(
  client: SupabaseClient,
  rpc: 'csb_ler_rts' | 'csb_ler_vinculos_rt_barragem',
  busca: string,
  limite: number,
  offset: number
): Promise<{ total: number; dados: Record<string, any>[]; error?: ClassifiedRpcError }> {
  const res = await client.rpc(rpc, {
    p_busca: busca,
    p_limite: limite,
    p_offset: offset,
  });
  if (res.error) {
    return {
      total: 0,
      dados: [] as Record<string, any>[],
      error: classifyRpcError(rpc, { ...res.error, status: res.status }),
    };
  }
  const parsed = parseJsonRpcPayload(rpc, res.data);
  return { total: parsed.total, dados: parsed.dados };
}

function extractRowKey(row: Record<string, any> | null | undefined, keys: string[]): string {
  if (!row || typeof row !== 'object') return '';
  for (const k of keys) {
    const val = row[k];
    if (val !== null && val !== undefined && String(val).trim() !== '') {
      return String(val);
    }
  }
  return '';
}

async function readAllRowsViaRpc(
  client: SupabaseClient,
  rpc: 'csb_ler_empreendedores' | 'csb_ler_barragens',
  targetIds?: Set<string>,
  maxRows = 1000
) {
  const idKeys = rpc === 'csb_ler_empreendedores'
    ? ['id', 'empreendedor_id', 'id_empreendedor']
    : ['id', 'barragem_id', 'id_barragem'];
  const batchSize = 200;
  const collected: Record<string, any>[] = [];
  const foundIds = new Set<string>();

  for (let offset = 0; offset < maxRows; offset += batchSize) {
    const res = await callRowsRpc(client, rpc, '', batchSize, offset);
    if (res.error) return { rows: collected, error: res.error };

    collected.push(...res.rows);
    if (targetIds) {
      for (const row of res.rows) {
        const key = extractRowKey(row, idKeys);
        if (key) foundIds.add(key);
      }
      if (Array.from(targetIds).every((id) => foundIds.has(id))) {
        break;
      }
    }

    if (res.rows.length < batchSize) break;
  }

  return { rows: collected };
}

async function readAllJsonViaRpc(
  client: SupabaseClient,
  rpc: 'csb_ler_rts' | 'csb_ler_vinculos_rt_barragem',
  targetIds?: Set<string>,
  maxRows = 1000
) {
  const idKeys = rpc === 'csb_ler_rts' ? ['id', 'rt_id', 'id_rt'] : ['id', 'vinculo_id'];
  const batchSize = 200;
  const collected: Record<string, any>[] = [];
  const foundIds = new Set<string>();
  let total = 0;

  for (let offset = 0; offset < maxRows; offset += batchSize) {
    const res = await callJsonRpc(client, rpc, '', batchSize, offset);
    if (res.error) return { total, rows: collected, error: res.error };

    total = res.total;
    collected.push(...res.dados);

    if (targetIds) {
      for (const row of res.dados) {
        const key = extractRowKey(row, idKeys);
        if (key) foundIds.add(key);
      }
      if (Array.from(targetIds).every((id) => foundIds.has(id))) {
        break;
      }
    }

    if (res.dados.length < batchSize || collected.length >= total) break;
  }

  return { total, rows: collected };
}

function indexById(
  rows: Record<string, any>[],
  wantedIds?: Set<string>,
  idKeys: string[] = ['id']
): Record<string, Record<string, any>> {
  const map: Record<string, Record<string, any>> = {};
  for (const row of rows) {
    const id = extractRowKey(row, idKeys);
    if (!id) continue;
    if (!wantedIds || wantedIds.has(id)) {
      map[id] = row;
    }
  }
  return map;
}

export interface BarragemV2Dto {
  id: string;
  nome: string;
  car: string | null;
  uf: string | null;
  municipio: string | null;
  municipio_ibge: string | number | null;
  empreendimento: string | null;
  processo: string | null;
  snisb: string | null;
  curso_agua: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  altura: number | string | null;
  volume: number | string | null;
  dano_potencial: string | null;
  categoria_risco: string | null;
  classificada_em: string | null;
  situacao: string | null;
  empreendedor_id: string | null;
}

export interface BarragensV2Pagination {
  limit: number | null;
  nextCursor: string | null;
  hasMore: boolean;
  total: number | null;
}

const BARRAGENS_V2_ALLOWED_BODY_KEYS = new Set(['action', 'limit', 'cursor']);
const BARRAGENS_V2_MAX_LIMIT = 100;
const BARRAGENS_V2_MAX_CURSOR_LENGTH = 512;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function parseOptionalNullableString(
  value: unknown
): { ok: true; value: string | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value === 'string') return { ok: true, value };
  return { ok: false };
}

function parseOptionalNullableStringOrNumber(
  value: unknown
): { ok: true; value: string | number | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value === 'string') return { ok: true, value };
  if (typeof value === 'number' && Number.isFinite(value)) return { ok: true, value };
  return { ok: false };
}

function parseBarragensV2Params(body: Record<string, unknown>):
  | { ok: true; limit?: number; cursor?: string; query: string }
  | { ok: false; code: string; error: string } {
  for (const key of Object.keys(body)) {
    if (!BARRAGENS_V2_ALLOWED_BODY_KEYS.has(key)) {
      return {
        ok: false,
        code: 'INVALID_PARAMS',
        error: 'Parâmetros não suportados para a ação barragens_v2. Utilize apenas limit e cursor.',
      };
    }
  }

  let limit: number | undefined;
  if (body.limit !== undefined && body.limit !== null && body.limit !== '') {
    let parsedLimit = NaN;
    if (typeof body.limit === 'number') {
      if (Number.isInteger(body.limit)) {
        parsedLimit = body.limit;
      }
    } else if (typeof body.limit === 'string' && /^\d+$/.test(body.limit.trim())) {
      parsedLimit = Number.parseInt(body.limit.trim(), 10);
    }
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > BARRAGENS_V2_MAX_LIMIT) {
      return {
        ok: false,
        code: 'INVALID_LIMIT',
        error: `Parâmetro limit inválido. Informe um inteiro entre 1 e ${BARRAGENS_V2_MAX_LIMIT}.`,
      };
    }
    limit = parsedLimit;
  }

  let cursor: string | undefined;
  if (body.cursor !== undefined && body.cursor !== null && body.cursor !== '') {
    if (typeof body.cursor !== 'string') {
      return {
        ok: false,
        code: 'INVALID_CURSOR',
        error: 'Parâmetro cursor inválido.',
      };
    }
    if (
      body.cursor.length === 0 ||
      body.cursor.length > BARRAGENS_V2_MAX_CURSOR_LENGTH ||
      /[\x00-\x1f\x7f\s]/.test(body.cursor)
    ) {
      return {
        ok: false,
        code: 'INVALID_CURSOR',
        error: 'Parâmetro cursor inválido.',
      };
    }
    cursor = body.cursor;
  }

  const searchParams = new URLSearchParams();
  if (cursor !== undefined) {
    searchParams.set('cursor', cursor);
  }
  if (limit !== undefined) {
    searchParams.set('limit', String(limit));
  }

  return {
    ok: true,
    limit,
    cursor,
    query: searchParams.toString(),
  };
}

function parseBarragemV2Item(raw: unknown): BarragemV2Dto | null {
  if (!isPlainObject(raw)) return null;

  const id = raw.id;
  const nome = raw.nome;
  if (typeof id !== 'string' || !id.trim() || typeof nome !== 'string' || !nome.trim()) {
    return null;
  }

  const car = parseOptionalNullableString(raw.car);
  const uf = parseOptionalNullableString(raw.uf);
  const municipio = parseOptionalNullableString(raw.municipio);
  const municipioIbge = parseOptionalNullableStringOrNumber(raw.municipio_ibge);
  const empreendimento = parseOptionalNullableString(raw.empreendimento);
  const processo = parseOptionalNullableString(raw.processo);
  const snisb = parseOptionalNullableString(raw.snisb);
  const cursoAgua = parseOptionalNullableString(raw.curso_agua);
  const latitude = parseOptionalNullableStringOrNumber(raw.latitude);
  const longitude = parseOptionalNullableStringOrNumber(raw.longitude);
  const altura = parseOptionalNullableStringOrNumber(raw.altura);
  const volume = parseOptionalNullableStringOrNumber(raw.volume);
  const danoPotencial = parseOptionalNullableString(raw.dano_potencial);
  const categoriaRisco = parseOptionalNullableString(raw.categoria_risco);
  const classificadaEm = parseOptionalNullableString(raw.classificada_em);
  const situacao = parseOptionalNullableString(raw.situacao);
  const empreendedorId = parseOptionalNullableString(raw.empreendedor_id);

  if (
    !car.ok ||
    !uf.ok ||
    !municipio.ok ||
    !municipioIbge.ok ||
    !empreendimento.ok ||
    !processo.ok ||
    !snisb.ok ||
    !cursoAgua.ok ||
    !latitude.ok ||
    !longitude.ok ||
    !altura.ok ||
    !volume.ok ||
    !danoPotencial.ok ||
    !categoriaRisco.ok ||
    !classificadaEm.ok ||
    !situacao.ok ||
    !empreendedorId.ok
  ) {
    return null;
  }

  return {
    id,
    nome,
    car: car.value,
    uf: uf.value,
    municipio: municipio.value,
    municipio_ibge: municipioIbge.value,
    empreendimento: empreendimento.value,
    processo: processo.value,
    snisb: snisb.value,
    curso_agua: cursoAgua.value,
    latitude: latitude.value,
    longitude: longitude.value,
    altura: altura.value,
    volume: volume.value,
    dano_potencial: danoPotencial.value,
    categoria_risco: categoriaRisco.value,
    classificada_em: classificadaEm.value,
    situacao: situacao.value,
    empreendedor_id: empreendedorId.value,
  };
}

function parseBarragensV2Response(
  rawBody: unknown,
  headers: Headers,
  requestedLimit?: number
):
  | {
      ok: true;
      maskingPolicy: 'masked';
      pagination: BarragensV2Pagination;
      items: BarragemV2Dto[];
    }
  | { ok: false; code: string; error: string } {
  const headerPolicy = headers.get('x-masking-policy');
  if (headerPolicy !== null && headerPolicy.trim() !== 'masked') {
    return {
      ok: false,
      code: 'INVALID_MASKING_POLICY',
      error: 'Resposta externa rejeitada: política de mascaramento inválida.',
    };
  }

  if (!isPlainObject(rawBody)) {
    return {
      ok: false,
      code: 'INVALID_UPSTREAM_RESPONSE',
      error: 'Resposta inválida do serviço Administra v2.',
    };
  }

  const metaPolicy = isPlainObject(rawBody.meta) ? rawBody.meta.maskingPolicy : undefined;
  const maskingPolicy =
    rawBody.maskingPolicy !== undefined ? rawBody.maskingPolicy : metaPolicy;
  if (maskingPolicy !== 'masked') {
    return {
      ok: false,
      code: 'INVALID_MASKING_POLICY',
      error: 'Resposta externa rejeitada: maskingPolicy obrigatório deve ser "masked".',
    };
  }

  const rawItems = Array.isArray(rawBody.items)
    ? rawBody.items
    : Array.isArray(rawBody.data)
    ? rawBody.data
    : null;
  if (!rawItems) {
    return {
      ok: false,
      code: 'INVALID_UPSTREAM_RESPONSE',
      error: 'Resposta inválida do serviço Administra v2.',
    };
  }

  let pagSource: Record<string, unknown>;
  if (rawBody.pagination !== undefined) {
    if (!isPlainObject(rawBody.pagination)) {
      return {
        ok: false,
        code: 'INVALID_UPSTREAM_RESPONSE',
        error: 'Paginação inválida na resposta do serviço Administra v2.',
      };
    }
    pagSource = rawBody.pagination;
  } else {
    pagSource = rawBody;
  }

  const rawLimit = pagSource.limit !== undefined ? pagSource.limit : pagSource.pageSize;
  let limit: number | null = requestedLimit ?? null;
  if (rawLimit !== undefined && rawLimit !== null) {
    if (typeof rawLimit !== 'number' || !Number.isInteger(rawLimit) || rawLimit < 1) {
      return {
        ok: false,
        code: 'INVALID_UPSTREAM_RESPONSE',
        error: 'Paginação inválida na resposta do serviço Administra v2.',
      };
    }
    limit = rawLimit;
  }

  const rawNextCursor =
    pagSource.nextCursor !== undefined ? pagSource.nextCursor : pagSource.next_cursor;
  let nextCursor: string | null = null;
  if (rawNextCursor !== undefined && rawNextCursor !== null) {
    if (typeof rawNextCursor !== 'string') {
      return {
        ok: false,
        code: 'INVALID_UPSTREAM_RESPONSE',
        error: 'Paginação inválida na resposta do serviço Administra v2.',
      };
    }
    nextCursor = rawNextCursor.length > 0 ? rawNextCursor : null;
  }

  const rawHasMore =
    pagSource.hasMore !== undefined ? pagSource.hasMore : pagSource.has_more;
  let hasMore: boolean;
  if (rawHasMore !== undefined) {
    if (typeof rawHasMore !== 'boolean') {
      return {
        ok: false,
        code: 'INVALID_UPSTREAM_RESPONSE',
        error: 'Paginação inválida na resposta do serviço Administra v2.',
      };
    }
    hasMore = rawHasMore;
  } else {
    hasMore = nextCursor !== null;
  }

  const rawTotal = pagSource.total;
  let total: number | null = null;
  if (rawTotal !== undefined && rawTotal !== null) {
    if (typeof rawTotal !== 'number' || !Number.isInteger(rawTotal) || rawTotal < 0) {
      return {
        ok: false,
        code: 'INVALID_UPSTREAM_RESPONSE',
        error: 'Paginação inválida na resposta do serviço Administra v2.',
      };
    }
    total = rawTotal;
  }

  const items: BarragemV2Dto[] = [];
  for (const rawItem of rawItems) {
    const parsedItem = parseBarragemV2Item(rawItem);
    if (!parsedItem) {
      return {
        ok: false,
        code: 'INVALID_UPSTREAM_ITEM',
        error: 'Registro inválido recebido do serviço Administra v2.',
      };
    }
    items.push(parsedItem);
  }

  return {
    ok: true,
    maskingPolicy: 'masked',
    pagination: {
      limit,
      nextCursor,
      hasMore,
      total,
    },
    items,
  };
}

function classifyS2sError(err: unknown): {
  status: number;
  code: string;
  error: string;
} {
  if (err instanceof Error) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return {
        status: 504,
        code: 'ADMINISTRA_V2_TIMEOUT',
        error: 'Tempo limite excedido ao consultar o serviço Administra v2.',
      };
    }
    const msg = err.message;
    if (
      msg.includes('ADMINISTRA_API_BASE_URL') ||
      msg.includes('CLASSIFICA_S2S_KID') ||
      msg.includes('CLASSIFICA_S2S_PRIVATE_KEY')
    ) {
      return {
        status: 503,
        code: 'ADMINISTRA_S2S_CONFIG_INVALID',
        error: 'Configuração S2S-V2 do servidor indisponível ou inválida.',
      };
    }
  }
  return {
    status: 502,
    code: 'ADMINISTRA_V2_UNAVAILABLE',
    error: 'Falha ao consultar o serviço Administra v2.',
  };
}

export function createAdministraLeituraHandler(deps: AdministraLeituraDeps = {}) {
  const verifySession = deps.verifySession ?? verifyClassificaSession;
  const resolveAdministraClient = deps.getAdministraClient ?? getAdministraServerClient;
  const performS2sGet = deps.requestS2sGet ?? requestAdministraS2sGet;

  return async function handler(req: NodeReq, res: NodeRes): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Método não permitido. Use POST.' });
    return;
  }

  const authHeader = req.headers.authorization;
  const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';

  if (!token) {
    sendJson(res, 401, {
      ok: false,
      code: 'AUTH_REQUIRED',
      error: 'Token de sessão do Classifica CSB obrigatório.',
    });
    return;
  }

  const sessionCheck = await verifySession(token);
  if (sessionCheck.ok === false) {
    sendJson(res, sessionCheck.status, {
      ok: false,
      code: sessionCheck.code,
      error: sessionCheck.error,
    });
    return;
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 413, { ok: false, code: 'PAYLOAD_TOO_LARGE', error: 'Requisição muito grande.' });
    return;
  }

  const action = body.action as AdministraLeituraAction;
  if (typeof action !== 'string' || !ALLOWED_ACTIONS.has(action)) {
    sendJson(res, 400, {
      ok: false,
      code: 'INVALID_ACTION',
      error: 'Ação não permitida.',
    });
    return;
  }

  if (action === 'barragens_v2') {
    const parsedParams = parseBarragensV2Params(body);
    if (parsedParams.ok === false) {
      sendJson(res, 400, {
        ok: false,
        code: parsedParams.code,
        error: parsedParams.error,
      });
      return;
    }

    let upstream;
    try {
      upstream = await performS2sGet({
        path: ADMINISTRA_BARRAGENS_V2_PATH,
        query: parsedParams.query,
        env: deps.s2sEnv,
      });
    } catch (err) {
      const classified = classifyS2sError(err);
      sendJson(res, classified.status, {
        ok: false,
        code: classified.code,
        error: classified.error,
      });
      return;
    }

    if (!upstream.ok) {
      sendJson(res, 502, {
        ok: false,
        code: 'ADMINISTRA_V2_UPSTREAM_ERROR',
        error: 'O serviço Administra v2 recusou ou falhou ao processar a consulta.',
      });
      return;
    }

    const validated = parseBarragensV2Response(
      upstream.body,
      upstream.headers,
      parsedParams.limit
    );
    if (validated.ok === false) {
      sendJson(res, 502, {
        ok: false,
        code: validated.code,
        error: validated.error,
      });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      action: 'barragens_v2',
      maskingPolicy: validated.maskingPolicy,
      pagination: validated.pagination,
      items: validated.items,
    });
    return;
  }

  const administraCheck = resolveAdministraClient(sessionCheck.classificaUrl);
  if (administraCheck.ok === false) {
    sendJson(res, administraCheck.status, {
      ok: false,
      configured: false,
      code: administraCheck.code,
      error: administraCheck.error,
      meta: administraCheck.meta,
    });
    return;
  }

  const rawBusca = typeof body.busca === 'string' ? body.busca : '';
  const busca = rawBusca.trim().replace(/\s+/g, ' ').slice(0, 120);
  const pageNum = Math.max(1, Math.floor(Number(body.page || 1) || 1));
  const pageSize = Math.max(1, Math.min(50, Math.floor(Number(body.pageSize || 15) || 15)));
  const offset = Math.max(0, (pageNum - 1) * pageSize);

  const client = administraCheck.client;
  const runtimeMeta = administraCheck.meta;

  if (action === 'diagnostico') {
    const [empRes, barRes, rtRes, vincRes] = await Promise.all([
      callRowsRpc(client, 'csb_ler_empreendedores', '', 1, 0),
      callRowsRpc(client, 'csb_ler_barragens', '', 1, 0),
      callJsonRpc(client, 'csb_ler_rts', '', 1, 0),
      callJsonRpc(client, 'csb_ler_vinculos_rt_barragem', '', 1, 0),
    ]);

    const empRowTotal = empRes.rows[0]?.total ?? empRes.rows[0]?.total_count;
    const barRowTotal = barRes.rows[0]?.total ?? barRes.rows[0]?.total_count;

    sendJson(res, 200, {
      ok: true,
      configured: true,
      meta: runtimeMeta,
      diagnostics: [
        {
          rpc: 'csb_ler_empreendedores',
          table: 'empreendedores',
          accessible: !empRes.error,
          totalCount: empRes.error
            ? null
            : typeof empRowTotal === 'number'
            ? empRowTotal
            : empRes.rows.length === 0
            ? 0
            : null,
          hasRecords: !empRes.error && empRes.rows.length > 0,
          error: empRes.error ? { ...empRes.error, administraRole: runtimeMeta.role, administraHost: runtimeMeta.administraHost } : undefined,
        },
        {
          rpc: 'csb_ler_barragens',
          table: 'barragens',
          accessible: !barRes.error,
          totalCount: barRes.error
            ? null
            : typeof barRowTotal === 'number'
            ? barRowTotal
            : barRes.rows.length === 0
            ? 0
            : null,
          hasRecords: !barRes.error && barRes.rows.length > 0,
          error: barRes.error ? { ...barRes.error, administraRole: runtimeMeta.role, administraHost: runtimeMeta.administraHost } : undefined,
        },
        {
          rpc: 'csb_ler_rts',
          table: 'rts',
          accessible: !rtRes.error,
          totalCount: rtRes.error ? null : rtRes.total,
          hasRecords: !rtRes.error && rtRes.total > 0,
          error: rtRes.error ? { ...rtRes.error, administraRole: runtimeMeta.role, administraHost: runtimeMeta.administraHost } : undefined,
        },
        {
          rpc: 'csb_ler_vinculos_rt_barragem',
          table: 'responsaveis_tecnicos_barragens',
          accessible: !vincRes.error,
          totalCount: vincRes.error ? null : vincRes.total,
          hasRecords: !vincRes.error && vincRes.total > 0,
          error: vincRes.error ? { ...vincRes.error, administraRole: runtimeMeta.role, administraHost: runtimeMeta.administraHost } : undefined,
        },
      ],
    });
    return;
  }

  if (action === 'empreendedores') {
    const primary = await callRowsRpc(client, 'csb_ler_empreendedores', busca, pageSize + 1, offset);
    if (primary.error) {
      sendJson(res, 502, {
        ok: false,
        configured: true,
        error: primary.error,
      });
      return;
    }

    const hasMore = primary.rows.length > pageSize;
    const items = primary.rows.slice(0, pageSize);
    const empIds = new Set(
      items.map((r) => extractRowKey(r, ['id', 'empreendedor_id', 'id_empreendedor'])).filter(Boolean)
    );

    const relationErrors = [];
    const barragensByEmpreendedorId: Record<string, Record<string, any>[]> = {};

    if (empIds.size > 0) {
      const barAll = await readAllRowsViaRpc(client, 'csb_ler_barragens');
      if (barAll.error) {
        relationErrors.push(barAll.error);
      } else {
        for (const bar of barAll.rows) {
          const empId = bar?.empreendedor_id;
          if (empId === null || empId === undefined) continue;
          const key = String(empId);
          if (!empIds.has(key)) continue;
          if (!barragensByEmpreendedorId[key]) barragensByEmpreendedorId[key] = [];
          barragensByEmpreendedorId[key].push(bar);
        }
      }
    }

    const firstTotal = items[0]?.total ?? items[0]?.total_count;
    const total =
      typeof firstTotal === 'number'
        ? firstTotal
        : Number.isFinite(Number(firstTotal)) && firstTotal !== undefined
        ? Number(firstTotal)
        : pageNum === 1 && items.length === 0
        ? 0
        : null;

    sendJson(res, 200, {
      ok: true,
      configured: true,
      action,
      page: pageNum,
      pageSize,
      total,
      hasMore,
      items,
      relations: { barragensByEmpreendedorId },
      relationErrors,
    });
    return;
  }

  if (action === 'barragens') {
    const primary = await callRowsRpc(client, 'csb_ler_barragens', busca, pageSize + 1, offset);
    if (primary.error) {
      sendJson(res, 502, {
        ok: false,
        configured: true,
        error: primary.error,
      });
      return;
    }

    const hasMore = primary.rows.length > pageSize;
    const items = primary.rows.slice(0, pageSize);
    const barIds = new Set(
      items.map((b) => extractRowKey(b, ['id', 'barragem_id', 'id_barragem'])).filter(Boolean)
    );
    const wantedEmpIds = new Set(
      items.map((b) => b?.empreendedor_id).filter((v) => v !== null && v !== undefined).map(String)
    );

    const relationErrors = [];
    let empreendedoresById: Record<string, Record<string, any>> = {};
    const vinculosByBarragemId: Record<string, Record<string, any>[]> = {};
    let rtsById: Record<string, Record<string, any>> = {};

    const [empAll, vincAll] = await Promise.all([
      wantedEmpIds.size > 0
        ? readAllRowsViaRpc(client, 'csb_ler_empreendedores', wantedEmpIds)
        : Promise.resolve({ rows: [] as Record<string, any>[], error: undefined }),
      barIds.size > 0
        ? readAllJsonViaRpc(client, 'csb_ler_vinculos_rt_barragem')
        : Promise.resolve({ total: 0, rows: [] as Record<string, any>[], error: undefined }),
    ]);

    if (empAll.error) {
      relationErrors.push(empAll.error);
    } else {
      empreendedoresById = indexById(empAll.rows, wantedEmpIds, ['id', 'empreendedor_id', 'id_empreendedor']);
    }

    if (vincAll.error) {
      relationErrors.push(vincAll.error);
    } else if (barIds.size > 0) {
      const wantedRtIds = new Set<string>();
      for (const v of vincAll.rows) {
        const bId = v?.barragem_id;
        if (bId === null || bId === undefined) continue;
        const bKey = String(bId);
        if (!barIds.has(bKey)) continue;
        if (!vinculosByBarragemId[bKey]) vinculosByBarragemId[bKey] = [];
        vinculosByBarragemId[bKey].push(v);
        if (v?.rt_id !== null && v?.rt_id !== undefined) {
          wantedRtIds.add(String(v.rt_id));
        }
      }

      if (wantedRtIds.size > 0) {
        const rtsAll = await readAllJsonViaRpc(client, 'csb_ler_rts', wantedRtIds);
        if (rtsAll.error) {
          relationErrors.push(rtsAll.error);
        } else {
          rtsById = indexById(rtsAll.rows, wantedRtIds, ['id', 'rt_id', 'id_rt']);
        }
      }
    }

    const firstTotal = items[0]?.total ?? items[0]?.total_count;
    const total =
      typeof firstTotal === 'number'
        ? firstTotal
        : Number.isFinite(Number(firstTotal)) && firstTotal !== undefined
        ? Number(firstTotal)
        : pageNum === 1 && items.length === 0
        ? 0
        : null;

    sendJson(res, 200, {
      ok: true,
      configured: true,
      action,
      page: pageNum,
      pageSize,
      total,
      hasMore,
      items,
      relations: {
        empreendedoresById,
        vinculosByBarragemId,
        rtsById,
      },
      relationErrors,
    });
    return;
  }

  if (action === 'rts') {
    const primary = await callJsonRpc(client, 'csb_ler_rts', busca, pageSize, offset);
    if (primary.error) {
      sendJson(res, 502, {
        ok: false,
        configured: true,
        error: primary.error,
      });
      return;
    }

    const items = primary.dados;
    const hasMore = offset + items.length < primary.total;
    const rtIds = new Set(
      items.map((r) => extractRowKey(r, ['id', 'rt_id', 'id_rt'])).filter(Boolean)
    );

    const relationErrors = [];
    const vinculosByRtId: Record<string, Record<string, any>[]> = {};
    let barragensById: Record<string, Record<string, any>> = {};

    if (rtIds.size > 0) {
      const vincAll = await readAllJsonViaRpc(client, 'csb_ler_vinculos_rt_barragem');
      if (vincAll.error) {
        relationErrors.push(vincAll.error);
      } else {
        const wantedBarIds = new Set<string>();
        for (const v of vincAll.rows) {
          const rId = v?.rt_id;
          if (rId === null || rId === undefined) continue;
          const rKey = String(rId);
          if (!rtIds.has(rKey)) continue;
          if (!vinculosByRtId[rKey]) vinculosByRtId[rKey] = [];
          vinculosByRtId[rKey].push(v);
          if (v?.barragem_id !== null && v?.barragem_id !== undefined) {
            wantedBarIds.add(String(v.barragem_id));
          }
        }

        if (wantedBarIds.size > 0) {
          const barAll = await readAllRowsViaRpc(client, 'csb_ler_barragens', wantedBarIds);
          if (barAll.error) {
            relationErrors.push(barAll.error);
          } else {
            barragensById = indexById(barAll.rows, wantedBarIds, ['id', 'barragem_id', 'id_barragem']);
          }
        }
      }
    }

    sendJson(res, 200, {
      ok: true,
      configured: true,
      action,
      page: pageNum,
      pageSize,
      total: primary.total,
      hasMore,
      items,
      relations: {
        vinculosByRtId,
        barragensById,
      },
      relationErrors,
    });
    return;
  }

  // action === 'vinculos_rt_barragem'
  const primary = await callJsonRpc(client, 'csb_ler_vinculos_rt_barragem', busca, pageSize, offset);
  if (primary.error) {
    sendJson(res, 502, {
      ok: false,
      configured: true,
      error: primary.error,
    });
    return;
  }

  const items = primary.dados;
  const hasMore = offset + items.length < primary.total;

  const wantedRtIds = new Set(
    items.map((v) => v?.rt_id).filter((val) => val !== null && val !== undefined).map(String)
  );
  const wantedBarIds = new Set(
    items.map((v) => v?.barragem_id).filter((val) => val !== null && val !== undefined).map(String)
  );

  const relationErrors = [];
  let rtsById: Record<string, Record<string, any>> = {};
  let barragensById: Record<string, Record<string, any>> = {};
  let empreendedoresById: Record<string, Record<string, any>> = {};

  const [rtsAll, barsAll] = await Promise.all([
    wantedRtIds.size > 0
      ? readAllJsonViaRpc(client, 'csb_ler_rts', wantedRtIds)
      : Promise.resolve({ total: 0, rows: [] as Record<string, any>[], error: undefined }),
    wantedBarIds.size > 0
      ? readAllRowsViaRpc(client, 'csb_ler_barragens', wantedBarIds)
      : Promise.resolve({ rows: [] as Record<string, any>[], error: undefined }),
  ]);

  if (rtsAll.error) {
    relationErrors.push(rtsAll.error);
  } else {
    rtsById = indexById(rtsAll.rows, wantedRtIds, ['id', 'rt_id', 'id_rt']);
  }

  if (barsAll.error) {
    relationErrors.push(barsAll.error);
  } else {
    barragensById = indexById(barsAll.rows, wantedBarIds, ['id', 'barragem_id', 'id_barragem']);
    const wantedEmpIds = new Set(
      Object.values(barragensById)
        .map((b) => b?.empreendedor_id)
        .filter((val) => val !== null && val !== undefined)
        .map(String)
    );
    if (wantedEmpIds.size > 0) {
      const empAll = await readAllRowsViaRpc(client, 'csb_ler_empreendedores', wantedEmpIds);
      if (empAll.error) {
        relationErrors.push(empAll.error);
      } else {
        empreendedoresById = indexById(empAll.rows, wantedEmpIds, ['id', 'empreendedor_id', 'id_empreendedor']);
      }
    }
  }

  sendJson(res, 200, {
    ok: true,
    configured: true,
    action,
    page: pageNum,
    pageSize,
    total: primary.total,
    hasMore,
    items,
    relations: {
      rtsById,
      barragensById,
      empreendedoresById,
    },
    relationErrors,
  });
  };
}

export default createAdministraLeituraHandler();
