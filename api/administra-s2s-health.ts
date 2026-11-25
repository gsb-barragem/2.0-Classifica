import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  testAdministraHealth,
  type AdministraHealthCheckResult,
} from '../server/administraS2sHealth.ts';

type NodeReq = IncomingMessage & { body?: unknown; originalUrl?: string };
type NodeRes = ServerResponse & {
  status?: (code: number) => NodeRes;
  json?: (payload: unknown) => void;
};

export interface StrictAdminAuthResult {
  ok: true;
  userId: string;
}

export interface StrictAdminAuthFailure {
  ok: false;
  status: number;
  error: string;
}

export type StrictAdminVerifyResult =
  | StrictAdminAuthResult
  | StrictAdminAuthFailure;

export interface AdministraS2sHealthRouteDeps {
  env?: NodeJS.ProcessEnv;
  createSupabaseClient?: (
    url: string,
    key: string,
    bearerToken: string
  ) => SupabaseClient;
  verifyAdmin?: (
    bearerToken: string,
    env: NodeJS.ProcessEnv
  ) => Promise<StrictAdminVerifyResult>;
  runHealthCheck?: (opts?: {
    env?: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
  }) => Promise<AdministraHealthCheckResult>;
  fetchImpl?: typeof fetch;
  now?: () => number;
  cooldownMs?: number;
  maxRateLimitEntries?: number;
  rateLimitStore?: Map<string, number>;
}

const DEFAULT_COOLDOWN_MS = 60_000;
const DEFAULT_MAX_RATE_LIMIT_ENTRIES = 500;

/**
 * Controle em memória de intervalo mínimo (60s) por usuário autenticado,
 * com teto fixo de entradas e remoção previsível de registros expirados/antigos.
 * IMPORTANTE: Esta é apenas uma proteção best-effort por processo Node.js e NÃO
 * constitui um rate limit global entre múltiplas instâncias serverless da Vercel
 * ou após reinícios/cold starts.
 */
const defaultRateLimitStore = new Map<string, number>();

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

function normalizeServerOrigin(rawUrl?: string): string {
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

function extractBearerToken(req: NodeReq): string {
  const authHeader = req.headers.authorization;
  if (typeof authHeader !== 'string') return '';
  const match = authHeader.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1].trim() : '';
}

async function hasUnexpectedClientInputs(req: NodeReq): Promise<boolean> {
  const rawUrl = req.originalUrl || req.url || '/';
  try {
    const parsed = new URL(rawUrl, 'http://localhost');
    if (Array.from(parsed.searchParams.keys()).length > 0) {
      return true;
    }
  } catch {
    return true;
  }

  if (req.body !== undefined) {
    if (Buffer.isBuffer(req.body)) {
      const text = req.body.toString('utf8').trim();
      if (text !== '' && text !== '{}') return true;
    } else if (typeof req.body === 'string') {
      const text = req.body.trim();
      if (text !== '' && text !== '{}') return true;
    } else if (req.body && typeof req.body === 'object') {
      if (Array.isArray(req.body) || Object.keys(req.body).length > 0) {
        return true;
      }
    } else if (req.body !== null) {
      return true;
    }
    return false;
  }

  if (req.readableEnded) {
    return false;
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buf.length;
    if (totalBytes > 4096) {
      return true;
    }
    chunks.push(buf);
  }
  const rawBody = Buffer.concat(chunks).toString('utf8').trim();
  if (rawBody !== '' && rawBody !== '{}') {
    return true;
  }

  return false;
}

function defaultCreateSupabaseClient(
  url: string,
  key: string,
  bearerToken: string
): SupabaseClient {
  return createClient(url, key, {
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
}

export async function verifyStrictAdminSession(
  bearerToken: string,
  env: NodeJS.ProcessEnv = process.env,
  createSupabaseClientImpl: (
    url: string,
    key: string,
    bearerToken: string
  ) => SupabaseClient = defaultCreateSupabaseClient
): Promise<StrictAdminVerifyResult> {
  const supabaseUrl = normalizeServerOrigin(
    env.CLASSIFICA_SUPABASE_URL || env.SUPABASE_URL
  );
  // Exige exclusivamente a chave anon do Classifica; nunca utiliza service_role no contexto do usuário.
  const supabaseAnonKey = (
    env.CLASSIFICA_SUPABASE_ANON_KEY ||
    env.SUPABASE_ANON_KEY ||
    ''
  ).trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      ok: false,
      status: 503,
      error: 'Verificação de autenticação indisponível no servidor.',
    };
  }

  const userScopedClient = createSupabaseClientImpl(
    supabaseUrl,
    supabaseAnonKey,
    bearerToken
  );

  const { data: authData, error: authError } =
    await userScopedClient.auth.getUser(bearerToken);
  if (authError || !authData?.user?.id) {
    return {
      ok: false,
      status: 401,
      error: 'Sessão inválida ou expirada.',
    };
  }

  const authUserId = authData.user.id;

  // Contrato SQL real: public.classifica_is_admin() RETURNS boolean
  const isAdminRes = await userScopedClient.rpc('classifica_is_admin');
  if (isAdminRes.error || typeof isAdminRes.data !== 'boolean') {
    return {
      ok: false,
      status: 503,
      error: 'Confirmação de permissão administrativa indisponível.',
    };
  }
  if (isAdminRes.data !== true) {
    return {
      ok: false,
      status: 403,
      error: 'Acesso restrito a Administradores ativos.',
    };
  }

  // Contrato SQL real: public.classifica_my_profile() RETURNS TABLE(
  //   id uuid, auth_user_id uuid, username text, email text, name text,
  //   role text, setor text, [perfil text,] matricula text,
  //   active boolean, force_password_change boolean, force_password_change_at timestamptz
  // ) -> PostgREST retorna array de linhas (0 ou 1 registro com LIMIT 1).
  const profileRes = await userScopedClient.rpc('classifica_my_profile');
  if (profileRes.error || !Array.isArray(profileRes.data)) {
    return {
      ok: false,
      status: 503,
      error: 'Confirmação de perfil administrativo indisponível.',
    };
  }

  if (profileRes.data.length !== 1) {
    return {
      ok: false,
      status: 403,
      error: 'Perfil administrativo não confirmado.',
    };
  }

  const rawRow = profileRes.data[0];
  if (!rawRow || typeof rawRow !== 'object') {
    return {
      ok: false,
      status: 403,
      error: 'Perfil administrativo não confirmado.',
    };
  }

  const profile = rawRow as Record<string, unknown>;
  const profileId =
    typeof profile.id === 'string' ? profile.id.trim() : '';
  const profileAuthUserId =
    typeof profile.auth_user_id === 'string'
      ? profile.auth_user_id.trim()
      : '';
  if (!profileId || !profileAuthUserId || profileAuthUserId !== authUserId) {
    return {
      ok: false,
      status: 403,
      error: 'Vínculo de autenticação divergente ou ausente.',
    };
  }

  if (profile.active !== true || profile.force_password_change !== false) {
    return {
      ok: false,
      status: 403,
      error: 'Conta inativa ou com troca de senha pendente.',
    };
  }

  if (
    typeof profile.role !== 'string' ||
    profile.role.trim() !== 'Administrador'
  ) {
    return {
      ok: false,
      status: 403,
      error: 'Acesso restrito a Administradores ativos.',
    };
  }

  return {
    ok: true,
    userId: authUserId,
  };
}

function enforceBestEffortCooldown(
  store: Map<string, number>,
  userId: string,
  nowMs: number,
  cooldownMs: number,
  maxEntries: number
): { allowed: true } | { allowed: false; retryAfterSec: number } {
  const lastAt = store.get(userId);
  if (typeof lastAt === 'number') {
    const elapsed = nowMs - lastAt;
    if (elapsed >= 0 && elapsed < cooldownMs) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((cooldownMs - elapsed) / 1000)
      );
      return { allowed: false, retryAfterSec };
    }
    store.delete(userId);
  }

  // Limpeza previsível: remove todas as entradas expiradas/inválidas antes de inserir.
  for (const [k, ts] of store.entries()) {
    if (nowMs - ts >= cooldownMs || nowMs < ts) {
      store.delete(k);
    }
  }

  // Garante limite rígido em memória mesmo sob rajada de múltiplos usuários na mesma janela.
  const effectiveMax = Math.max(1, maxEntries);
  while (store.size >= effectiveMax) {
    const oldestKey = store.keys().next().value;
    if (oldestKey === undefined) break;
    store.delete(oldestKey);
  }

  store.set(userId, nowMs);
  return { allowed: true };
}

export function createAdministraS2sHealthRouteHandler(
  deps: AdministraS2sHealthRouteDeps = {}
) {
  const rateLimitStore = deps.rateLimitStore ?? defaultRateLimitStore;
  const cooldownMs = deps.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const maxRateLimitEntries =
    deps.maxRateLimitEntries ?? DEFAULT_MAX_RATE_LIMIT_ENTRIES;
  const nowFn = deps.now ?? (() => Date.now());
  const runHealthCheck = deps.runHealthCheck ?? testAdministraHealth;

  return async function handler(req: NodeReq, res: NodeRes): Promise<void> {
    const env = deps.env ?? process.env;

    if ((req.method || '').toUpperCase() !== 'POST') {
      res.setHeader('Allow', 'POST');
      sendJson(res, 405, {
        ok: false,
        error: 'Método não permitido.',
      });
      return;
    }

    if (env.CLASSIFICA_S2S_HEALTH_TEST_ENABLED !== 'true') {
      sendJson(res, 404, {
        ok: false,
        error: 'Recurso indisponível.',
      });
      return;
    }

    const bearerToken = extractBearerToken(req);
    if (!bearerToken) {
      sendJson(res, 401, {
        ok: false,
        error: 'Autenticação obrigatória.',
      });
      return;
    }

    const verifyResult = deps.verifyAdmin
      ? await deps.verifyAdmin(bearerToken, env)
      : await verifyStrictAdminSession(
          bearerToken,
          env,
          deps.createSupabaseClient
        );

    if (verifyResult.ok === false) {
      sendJson(res, verifyResult.status, {
        ok: false,
        error: verifyResult.error,
      });
      return;
    }

    if (await hasUnexpectedClientInputs(req)) {
      sendJson(res, 400, {
        ok: false,
        error: 'Parâmetros de entrada não são aceitos neste endpoint.',
      });
      return;
    }

    const cooldown = enforceBestEffortCooldown(
      rateLimitStore,
      verifyResult.userId,
      nowFn(),
      cooldownMs,
      maxRateLimitEntries
    );
    if (cooldown.allowed === false) {
      res.setHeader('Retry-After', String(cooldown.retryAfterSec));
      sendJson(res, 429, {
        ok: false,
        error: 'Aguarde o intervalo mínimo antes de executar novamente.',
      });
      return;
    }

    try {
      const result = await runHealthCheck({
        env,
        fetchImpl: deps.fetchImpl,
      });

      if (!result.ok) {
        sendJson(res, 502, {
          ok: false,
          error: 'Falha na verificação S2S-V2.',
        });
        return;
      }

      sendJson(res, 200, {
        ok: true,
        status: result.status,
      });
    } catch {
      sendJson(res, 502, {
        ok: false,
        error: 'Falha na verificação S2S-V2.',
      });
    }
  };
}

export default createAdministraS2sHealthRouteHandler();
