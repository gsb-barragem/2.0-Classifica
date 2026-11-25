// TEMPORÁRIO: endpoint exclusivo para validação administrativa do handshake S2S-V2
// contra GET /api/v2/barragens?limit=1. Remover este arquivo e sua montagem após o teste.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient } from '@supabase/supabase-js';
import {
  testAdministraBarragensS2s,
  type AdministraBarragensS2sTestResult,
  type SafeMaskingPolicyValue,
} from '../server/administraS2sBarragensTest.ts';

export const TEMP_S2S_BARRAGENS_FLAG_ENV = 'CLASSIFICA_S2S_BARRAGENS_TEST_ENABLED';
export const DEFAULT_COOLDOWN_MS = 30_000;
const MAX_COOLDOWN_ENTRIES = 200;

type NodeReq = IncomingMessage & { body?: unknown; url?: string };
type NodeRes = ServerResponse & {
  status?: (code: number) => NodeRes;
  json?: (payload: unknown) => void;
};

export type StrictAdminVerificationResult =
  | { ok: true; authUserId: string }
  | { ok: false; status: number; error: string };

export interface AdministraS2sBarragensRouteDeps {
  env?: NodeJS.ProcessEnv;
  verifyAdminSession?: (
    bearerToken: string,
    env: NodeJS.ProcessEnv
  ) => Promise<StrictAdminVerificationResult>;
  runBarragensS2sTest?: (opts: {
    env: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
  }) => Promise<AdministraBarragensS2sTestResult>;
  fetchImpl?: typeof fetch;
  nowMs?: () => number;
  cooldownMs?: number;
}

function normalizeOrigin(rawUrl?: string): string {
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

async function readOptionalEmptyBody(req: NodeReq): Promise<boolean> {
  if (req.body !== undefined) {
    if (typeof req.body === 'string') {
      const trimmed = req.body.trim();
      return trimmed === '' || trimmed === '{}';
    }
    if (typeof req.body === 'object' && req.body !== null && !Buffer.isBuffer(req.body)) {
      return !Array.isArray(req.body) && Object.keys(req.body as Record<string, unknown>).length === 0;
    }
    if (Buffer.isBuffer(req.body)) {
      const trimmed = req.body.toString('utf8').trim();
      return trimmed === '' || trimmed === '{}';
    }
    return false;
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buf.length;
    if (totalBytes > 4096) {
      return false;
    }
    chunks.push(buf);
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw === '' || raw === '{}';
}

export async function verifyStrictAdminSession(
  bearerToken: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<StrictAdminVerificationResult> {
  const classificaUrl = normalizeOrigin(
    env.CLASSIFICA_SUPABASE_URL || env.SUPABASE_URL
  );
  // Exige estritamente chave anon do Classifica; nunca usa service_role como fallback.
  const classificaAnonKey = (
    env.CLASSIFICA_SUPABASE_ANON_KEY ||
    env.SUPABASE_ANON_KEY ||
    ''
  ).trim();

  if (!classificaUrl || !classificaAnonKey) {
    return {
      ok: false,
      status: 503,
      error: 'Verificação administrativa indisponível no servidor.',
    };
  }

  const userScopedClient = createClient(classificaUrl, classificaAnonKey, {
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

  const { data: authData, error: authError } = await userScopedClient.auth.getUser(
    bearerToken
  );
  if (authError || !authData?.user?.id) {
    return {
      ok: false,
      status: 401,
      error: 'Sessão inválida ou expirada.',
    };
  }

  const authUserId = authData.user.id;

  // Falha fechado: exige confirmação explícita da RPC classifica_is_admin() === true
  const isAdminRes = await userScopedClient.rpc('classifica_is_admin');
  if (isAdminRes.error) {
    return {
      ok: false,
      status: 503,
      error: 'Confirmação de administrador indisponível no servidor.',
    };
  }
  if (isAdminRes.data !== true) {
    return {
      ok: false,
      status: 403,
      error: 'Acesso restrito a Administradores ativos.',
    };
  }

  // Confirma contrato oficial de classifica_my_profile() (RETURNS TABLE -> array)
  const profileRes = await userScopedClient.rpc('classifica_my_profile');
  if (profileRes.error) {
    return {
      ok: false,
      status: 503,
      error: 'Confirmação de perfil administrativo indisponível no servidor.',
    };
  }

  const row = (Array.isArray(profileRes.data)
    ? profileRes.data[0]
    : profileRes.data) as Record<string, unknown> | null | undefined;

  if (!row || typeof row !== 'object') {
    return {
      ok: false,
      status: 403,
      error: 'Perfil administrativo ativo não localizado.',
    };
  }

  if (
    row.role !== 'Administrador' ||
    row.active !== true ||
    row.force_password_change !== false ||
    row.auth_user_id !== authUserId
  ) {
    return {
      ok: false,
      status: 403,
      error: 'Perfil sem permissão administrativa ativa.',
    };
  }

  return { ok: true, authUserId };
}

export function createAdministraS2sBarragensTestHandler(
  deps: AdministraS2sBarragensRouteDeps = {}
) {
  // Cooldown limitado em memória por instância; não é compartilhado entre instâncias Vercel.
  const lastInvocationByAdmin = new Map<string, number>();

  const pruneCooldownMap = (now: number, cooldownMs: number) => {
    for (const [adminId, ts] of lastInvocationByAdmin.entries()) {
      if (now - ts >= cooldownMs) {
        lastInvocationByAdmin.delete(adminId);
      }
    }
    while (lastInvocationByAdmin.size >= MAX_COOLDOWN_ENTRIES) {
      const oldestKey = lastInvocationByAdmin.keys().next().value;
      if (!oldestKey) break;
      lastInvocationByAdmin.delete(oldestKey);
    }
  };

  return async function handler(req: NodeReq, res: NodeRes): Promise<void> {
    const env = deps.env ?? process.env;

    // Flag server-side desativada por padrão: responde 404 antes de qualquer validação ou chamada remota.
    if (env[TEMP_S2S_BARRAGENS_FLAG_ENV] !== 'true') {
      sendJson(res, 404, {
        ok: false,
        error: 'Rota temporária não habilitada.',
      });
      return;
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      sendJson(res, 405, {
        ok: false,
        error: 'Método não permitido. Use POST.',
      });
      return;
    }

    const requestUrl = typeof req.url === 'string' ? req.url : '';
    const queryIndex = requestUrl.indexOf('?');
    if (queryIndex !== -1 && queryIndex < requestUrl.length - 1) {
      sendJson(res, 400, {
        ok: false,
        error: 'Parâmetros de query não são aceitos neste endpoint.',
      });
      return;
    }

    const bodyAllowed = await readOptionalEmptyBody(req);
    if (!bodyAllowed) {
      sendJson(res, 400, {
        ok: false,
        error: 'Corpo da requisição não é aceito neste endpoint.',
      });
      return;
    }

    const authHeader = req.headers.authorization;
    const token =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : '';

    if (!token) {
      sendJson(res, 401, {
        ok: false,
        error: 'Autenticação obrigatória.',
      });
      return;
    }

    const verifyFn = deps.verifyAdminSession ?? verifyStrictAdminSession;
    const adminCheck = await verifyFn(token, env);
    if (adminCheck.ok === false) {
      sendJson(res, adminCheck.status, {
        ok: false,
        error: adminCheck.error,
      });
      return;
    }

    const now = (deps.nowMs ?? Date.now)();
    const cooldownMs = deps.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    pruneCooldownMap(now, cooldownMs);

    const lastRun = lastInvocationByAdmin.get(adminCheck.authUserId);
    if (typeof lastRun === 'number' && now - lastRun < cooldownMs) {
      const retryAfterSec = Math.max(1, Math.ceil((cooldownMs - (now - lastRun)) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      sendJson(res, 429, {
        ok: false,
        error: 'Aguarde alguns segundos antes de repetir o teste S2S.',
      });
      return;
    }
    lastInvocationByAdmin.set(adminCheck.authUserId, now);

    const runTest = deps.runBarragensS2sTest ?? testAdministraBarragensS2s;
    try {
      const result = await runTest({
        env,
        fetchImpl: deps.fetchImpl,
      });

      if (result.ok) {
        const payload: {
          ok: true;
          status: number;
          maskingPolicy: SafeMaskingPolicyValue;
        } = {
          ok: true,
          status: result.status,
          maskingPolicy: result.maskingPolicy,
        };
        sendJson(res, 200, payload);
        return;
      }

      sendJson(res, 502, {
        ok: false,
        status: result.status,
      });
    } catch {
      sendJson(res, 502, {
        ok: false,
        status: 502,
      });
    }
  };
}

export default createAdministraS2sBarragensTestHandler();
