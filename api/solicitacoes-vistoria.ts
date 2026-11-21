import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient } from '@supabase/supabase-js';

export type UserRole = 'Administrador' | 'Analista' | 'Visualizador';

export interface VerifiedActor {
  canonicalUserId: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface EquipeMembroSafe {
  id: string | null;
  nome: string | null;
  email: string | null;
}

export interface SolicitacaoVistoriaSafe {
  id: string;
  sistema_origem: 'classifica';
  status: string;
  relato: string;
  barragem_id: string | null;
  barragem_nome: string | null;
  municipio: string | null;
  curso_agua: string | null;
  coordenadas: string | null;
  empreendedor_id: string | null;
  empreendedor_nome: string | null;
  processo: string | null;
  classificacao_atual: string | null;
  dpa: string | null;
  cri: string | null;
  solicitante_id: string | null;
  solicitante_nome: string | null;
  solicitante_email: string | null;
  vistoria_id: string | null;
  data_realizacao: string | null;
  equipe: Array<EquipeMembroSafe | string>;
  observacao_campo: string | null;
  motivo_cancelamento: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export type NodeReq = IncomingMessage & { body?: unknown; originalUrl?: string };
export type NodeRes = ServerResponse & {
  status?: (code: number) => NodeRes;
  json?: (payload: unknown) => void;
};

export interface SolicitacoesVistoriaDeps {
  verifySession?: (
    bearerToken: string
  ) => Promise<
    | { ok: true; actor: VerifiedActor }
    | { ok: false; status: number; code: string; error: string }
  >;
  fetchImpl?: typeof fetch;
  getConfig?: () => { baseUrl: string; serviceToken: string } | null;
}

const MAX_RELATO_LENGTH = 1000;
const MAX_OBSERVACAO_LENGTH = 1000;
const ALLOWED_STATUS_FILTER = new Set([
  'pendente',
  'aberta',
  'em_planejamento',
  'realizada',
  'cancelada',
]);

const FORMATTED_CPF_REGEX = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/;
const FORMATTED_CNPJ_REGEX = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/;
const RAW_DIGIT_TOKEN_REGEX = /\b\d[\d.\-\/]{9,18}\d\b/g;

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

function normalizeEndpointBaseUrl(rawUrl?: string): string {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (parsed.protocol !== 'https:' && !isLocalhost) return '';
    const cleanPath = parsed.pathname.replace(/\/+$/, '');
    if (!cleanPath) {
      return `${parsed.origin}/api/solicitacoes-vistoria`;
    }
    return `${parsed.origin}${cleanPath}`;
  } catch {
    return '';
  }
}

function defaultGetConfig(): { baseUrl: string; serviceToken: string } | null {
  const baseUrl = normalizeEndpointBaseUrl(process.env.ADMINISTRA_SOLICITACOES_URL);
  const serviceToken = (process.env.SOLICITACOES_SERVICE_TOKEN || '').trim();
  if (!baseUrl || !serviceToken) return null;
  return { baseUrl, serviceToken };
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
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
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
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
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

function normalizeUserRole(rawRole: unknown): UserRole {
  const lower = String(rawRole ?? '').trim().toLowerCase();
  if (['administrador', 'administradora', 'admin'].includes(lower)) return 'Administrador';
  if (lower === 'analista') return 'Analista';
  return 'Visualizador';
}

export function isValidCpfDigits(digits: string): boolean {
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(digits[i]) * (10 - i);
  }
  let check1 = (sum * 10) % 11;
  if (check1 === 10) check1 = 0;
  if (check1 !== Number(digits[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += Number(digits[i]) * (11 - i);
  }
  let check2 = (sum * 10) % 11;
  if (check2 === 10) check2 = 0;
  return check2 === Number(digits[10]);
}

export function isValidCnpjDigits(digits: string): boolean {
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  let sum1 = 0;
  for (let i = 0; i < 12; i++) {
    sum1 += Number(digits[i]) * weights1[i];
  }
  const rem1 = sum1 % 11;
  const d1 = rem1 < 2 ? 0 : 11 - rem1;
  if (d1 !== Number(digits[12])) return false;

  let sum2 = 0;
  for (let i = 0; i < 13; i++) {
    sum2 += Number(digits[i]) * weights2[i];
  }
  const rem2 = sum2 % 11;
  const d2 = rem2 < 2 ? 0 : 11 - rem2;
  return d2 === Number(digits[13]);
}

export function containsCpfOrCnpj(value: string | null | undefined): boolean {
  if (!value) return false;
  if (FORMATTED_CPF_REGEX.test(value) || FORMATTED_CNPJ_REGEX.test(value)) {
    return true;
  }
  const matches = value.match(RAW_DIGIT_TOKEN_REGEX);
  if (!matches) return false;
  for (const token of matches) {
    const digits = token.replace(/\D/g, '');
    if (digits.length === 11 && isValidCpfDigits(digits)) return true;
    if (digits.length === 14 && isValidCnpjDigits(digits)) return true;
  }
  return false;
}

function cleanOptionalField(
  raw: unknown,
  label: string,
  maxLength: number
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== 'string') {
    return { ok: false, error: `${label} deve ser um texto válido.` };
  }
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > maxLength) {
    return { ok: false, error: `${label} excede o limite de ${maxLength} caracteres.` };
  }
  if (containsCpfOrCnpj(trimmed)) {
    return { ok: false, error: `${label} não pode conter CPF ou CNPJ.` };
  }
  return { ok: true, value: trimmed };
}

function sanitizeOptionalOutText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || containsCpfOrCnpj(trimmed)) return null;
  return trimmed;
}

function sanitizeEquipe(rawEquipe: unknown): Array<EquipeMembroSafe | string> {
  if (!Array.isArray(rawEquipe)) return [];
  const list: Array<EquipeMembroSafe | string> = [];
  for (const item of rawEquipe) {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed && !containsCpfOrCnpj(trimmed)) {
        list.push(trimmed);
      }
    } else if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      const id = sanitizeOptionalOutText(obj.id ?? obj.user_id ?? obj.auth_user_id);
      const nome = sanitizeOptionalOutText(obj.nome ?? obj.name);
      const email = sanitizeOptionalOutText(obj.email);
      if (id || nome || email) {
        list.push({ id, nome, email });
      }
    }
  }
  return list;
}

export function sanitizeSolicitacao(raw: unknown): SolicitacaoVistoriaSafe | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' || typeof r.id === 'number' ? String(r.id).trim() : '';
  if (!id) return null;

  const sistemaOrigem = String(r.sistema_origem ?? '').trim().toLowerCase();
  if (sistemaOrigem && sistemaOrigem !== 'classifica') {
    return null;
  }

  return {
    id,
    sistema_origem: 'classifica',
    status: sanitizeOptionalOutText(r.status) || 'pendente',
    relato: sanitizeOptionalOutText(r.relato) || '',
    barragem_id: sanitizeOptionalOutText(r.barragem_id),
    barragem_nome: sanitizeOptionalOutText(r.barragem_nome),
    municipio: sanitizeOptionalOutText(r.municipio),
    curso_agua: sanitizeOptionalOutText(r.curso_agua),
    coordenadas: sanitizeOptionalOutText(r.coordenadas),
    empreendedor_id: sanitizeOptionalOutText(r.empreendedor_id),
    empreendedor_nome: sanitizeOptionalOutText(r.empreendedor_nome),
    processo: sanitizeOptionalOutText(r.processo),
    classificacao_atual: sanitizeOptionalOutText(r.classificacao_atual),
    dpa: sanitizeOptionalOutText(r.dpa),
    cri: sanitizeOptionalOutText(r.cri),
    solicitante_id: sanitizeOptionalOutText(r.solicitante_id),
    solicitante_nome: sanitizeOptionalOutText(r.solicitante_nome),
    solicitante_email: sanitizeOptionalOutText(r.solicitante_email),
    vistoria_id: sanitizeOptionalOutText(r.vistoria_id),
    data_realizacao: sanitizeOptionalOutText(r.data_realizacao ?? r.data_conclusao),
    equipe: sanitizeEquipe(r.equipe),
    observacao_campo: sanitizeOptionalOutText(r.observacao_campo),
    motivo_cancelamento: sanitizeOptionalOutText(r.motivo_cancelamento),
    created_at: sanitizeOptionalOutText(r.created_at),
    updated_at: sanitizeOptionalOutText(r.updated_at),
  };
}

function isSolicitationAuthor(sol: SolicitacaoVistoriaSafe, actor: VerifiedActor): boolean {
  if (sol.solicitante_id) {
    return sol.solicitante_id === actor.canonicalUserId;
  }
  if (sol.solicitante_email && actor.email) {
    return sol.solicitante_email.trim().toLowerCase() === actor.email.trim().toLowerCase();
  }
  return false;
}

function isEquipeMember(
  equipe: Array<EquipeMembroSafe | string>,
  actor: VerifiedActor
): boolean {
  const actorId = actor.canonicalUserId;
  const actorEmail = actor.email.trim().toLowerCase();

  for (const member of equipe) {
    if (typeof member === 'string') {
      const m = member.trim();
      if (!m) continue;
      if (m === actorId) return true;
      if (actorEmail && m.includes('@') && m.toLowerCase() === actorEmail) return true;
    } else if (member && typeof member === 'object') {
      if (member.id && member.id.trim() === actorId) return true;
      if (member.email && actorEmail && member.email.trim().toLowerCase() === actorEmail) {
        return true;
      }
    }
  }
  return false;
}

async function defaultVerifySession(
  bearerToken: string
): Promise<
  | { ok: true; actor: VerifiedActor }
  | { ok: false; status: number; code: string; error: string }
> {
  const classificaUrl = normalizeOrigin(
    process.env.CLASSIFICA_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL
  );
  const serviceRoleKey = (
    process.env.CLASSIFICA_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  ).trim();
  const anonOrVerifyKey = (
    process.env.CLASSIFICA_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    serviceRoleKey
  ).trim();

  if (!classificaUrl || !anonOrVerifyKey) {
    return {
      ok: false,
      status: 503,
      code: 'AUTH_VERIFICATION_UNAVAILABLE',
      error: 'Autenticação do servidor não configurada.',
    };
  }

  const userScopedClient = createClient(classificaUrl, anonOrVerifyKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${bearerToken}` } },
  });

  const { data: authData, error: authError } = await userScopedClient.auth.getUser(bearerToken);
  if (authError || !authData?.user) {
    return {
      ok: false,
      status: 401,
      code: 'INVALID_SESSION',
      error: 'Sessão expirada ou não autenticada. Faça login novamente.',
    };
  }

  const authUser = authData.user;
  const canAccessRes = await userScopedClient.rpc('classifica_can_access_app');
  if (!canAccessRes.error && canAccessRes.data === false) {
    return {
      ok: false,
      status: 403,
      code: 'FORBIDDEN_PROFILE',
      error: 'Usuário autenticado, porém sem acesso ativo ou com troca de senha pendente.',
    };
  }

  const profileRpc = await userScopedClient.rpc('classifica_my_profile');
  if (!profileRpc.error && profileRpc.data) {
    const row = (Array.isArray(profileRpc.data)
      ? profileRpc.data[0]
      : profileRpc.data) as Record<string, unknown> | undefined;
    if (!row || !isProfileActive(row) || row.force_password_change === true) {
      return {
        ok: false,
        status: 403,
        code: 'FORBIDDEN_PROFILE',
        error: 'Perfil do usuário inativo ou aguardando troca de senha.',
      };
    }

    const canonicalFromRow =
      typeof row.auth_user_id === 'string' && row.auth_user_id.trim()
        ? row.auth_user_id.trim()
        : authUser.id;
    if (canonicalFromRow !== authUser.id) {
      return {
        ok: false,
        status: 403,
        code: 'IDENTITY_MISMATCH',
        error: 'Identidade canônica da sessão divergente do perfil ativo.',
      };
    }

    return {
      ok: true,
      actor: {
        canonicalUserId: authUser.id,
        name: String(row.name || row.nome || authUser.email || 'Usuário'),
        email: String(row.email || authUser.email || '').trim().toLowerCase(),
        role: normalizeUserRole(row.role ?? row.papel),
      },
    };
  }

  const lookupClient = serviceRoleKey
    ? createClient(classificaUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
    : userScopedClient;

  const profileTables: Array<{ name: 'users' | 'user' | 'usuarios'; cols: string }> = [
    { name: 'users', cols: 'id, auth_user_id, email, name, role, active, force_password_change' },
    { name: 'users', cols: 'id, nome, email, papel, role, situacao, status' },
    { name: 'user', cols: 'id, nome, email, papel, role, situacao, status' },
    { name: 'usuarios', cols: 'id, nome, email, papel, role, situacao, status' },
  ];

  for (const tbl of profileTables) {
    let row: Record<string, unknown> | null = null;
    if (tbl.cols.includes('auth_user_id')) {
      const byAuth = await lookupClient
        .from(tbl.name)
        .select(tbl.cols)
        .eq('auth_user_id', authUser.id)
        .maybeSingle();
      if (!byAuth.error && byAuth.data) {
        row = byAuth.data as unknown as Record<string, unknown>;
      }
    }
    if (!row) {
      const byId = await lookupClient
        .from(tbl.name)
        .select(tbl.cols)
        .eq('id', authUser.id)
        .maybeSingle();
      if (!byId.error && byId.data) {
        row = byId.data as unknown as Record<string, unknown>;
      }
    }
    if (row) {
      if (!isProfileActive(row) || row.force_password_change === true) {
        return {
          ok: false,
          status: 403,
          code: 'FORBIDDEN_PROFILE',
          error: 'Perfil do usuário inativo ou aguardando revisão.',
        };
      }
      return {
        ok: true,
        actor: {
          canonicalUserId: authUser.id,
          name: String(row.name || row.nome || authUser.email || 'Usuário'),
          email: String(row.email || authUser.email || '').trim().toLowerCase(),
          role: normalizeUserRole(row.role ?? row.papel),
        },
      };
    }
  }

  return {
    ok: false,
    status: 403,
    code: 'PROFILE_NOT_VERIFIED',
    error: 'Perfil ativo do usuário não pôde ser verificado.',
  };
}

function parseRoutePath(req: NodeReq): {
  id: string | null;
  subAction: 'observacao' | 'cancelar' | null;
  queryStatus: string | null;
  rawSearch: string;
} {
  const rawUrl = req.originalUrl || req.url || '/api/solicitacoes-vistoria';
  const parsed = new URL(rawUrl, 'http://localhost');
  const trimmedPath = parsed.pathname.replace(/\/+$/, '');
  const prefix = '/api/solicitacoes-vistoria';
  const rest = trimmedPath.startsWith(prefix) ? trimmedPath.slice(prefix.length) : trimmedPath;
  const parts = rest.split('/').filter(Boolean);

  const id = parts[0] ? decodeURIComponent(parts[0]).trim() : null;
  const second = parts[1] ? parts[1].trim().toLowerCase() : null;
  const subAction =
    second === 'observacao' ? 'observacao' : second === 'cancelar' ? 'cancelar' : null;
  const statusParam = parsed.searchParams.get('status')?.trim().toLowerCase() || null;

  return {
    id: id || null,
    subAction,
    queryStatus: statusParam,
    rawSearch: parsed.search,
  };
}

async function callCentralApi(
  fetchImpl: typeof fetch,
  url: string,
  serviceToken: string,
  init?: RequestInit
): Promise<{
  ok: boolean;
  status: number;
  data: Record<string, unknown> | null;
  errorMessage?: string;
}> {
  try {
    const res = await fetchImpl(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${serviceToken}`,
        ...(init?.headers || {}),
      },
    });

    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) {
      const rawErr =
        (typeof json?.error === 'string' && json.error) ||
        (typeof json?.message === 'string' && json.message) ||
        `Erro no serviço central de solicitações (HTTP ${res.status}).`;
      const safeErr = containsCpfOrCnpj(rawErr)
        ? `Erro no serviço central de solicitações (HTTP ${res.status}).`
        : rawErr;
      return {
        ok: false,
        status: res.status === 409 ? 409 : res.status >= 400 && res.status < 500 ? res.status : 502,
        data: json,
        errorMessage: safeErr,
      };
    }

    return { ok: true, status: res.status, data: json };
  } catch {
    return {
      ok: false,
      status: 502,
      data: null,
      errorMessage: 'Não foi possível comunicar com o serviço central de solicitações.',
    };
  }
}

function rejectAnyCpfCnpjInBody(body: Record<string, unknown>): string | null {
  for (const [key, val] of Object.entries(body)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey === 'cpf' || lowerKey === 'cnpj' || lowerKey === 'cpf_cnpj' || lowerKey === 'cpfcnpj') {
      if (val !== null && val !== undefined && String(val).trim() !== '') {
        return 'Não é permitido enviar CPF ou CNPJ na solicitação.';
      }
    }
    if (typeof val === 'string' && containsCpfOrCnpj(val)) {
      return `O campo "${key}" não pode conter CPF ou CNPJ.`;
    }
  }
  return null;
}

export function createSolicitacoesVistoriaHandler(
  deps: SolicitacoesVistoriaDeps = {}
): (req: NodeReq, res: NodeRes) => Promise<void> {
  const verifySession = deps.verifySession || defaultVerifySession;
  const fetchImpl = deps.fetchImpl || fetch;
  const getConfig = deps.getConfig || defaultGetConfig;

  return async function handler(req: NodeReq, res: NodeRes): Promise<void> {
    const method = (req.method || 'GET').toUpperCase();
    if (!['GET', 'POST', 'PATCH'].includes(method)) {
      res.setHeader('Allow', 'GET, POST, PATCH');
      sendJson(res, 405, {
        ok: false,
        code: 'METHOD_NOT_ALLOWED',
        error: 'Método não permitido.',
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
        code: 'AUTH_REQUIRED',
        error: 'Sessão expirada ou não autenticada. Faça login novamente.',
      });
      return;
    }

    const session = await verifySession(token);
    if (session.ok === false) {
      sendJson(res, session.status, {
        ok: false,
        code: session.code,
        error: session.error,
      });
      return;
    }

    const { actor } = session;
    const route = parseRoutePath(req);

    if (route.id && containsCpfOrCnpj(route.id)) {
      sendJson(res, 400, {
        ok: false,
        code: 'INVALID_IDENTIFIER',
        error: 'Identificador inválido na URL.',
      });
      return;
    }
    if (route.rawSearch && containsCpfOrCnpj(decodeURIComponent(route.rawSearch))) {
      sendJson(res, 400, {
        ok: false,
        code: 'CPF_CNPJ_IN_URL_FORBIDDEN',
        error: 'Não é permitido informar CPF ou CNPJ na URL.',
      });
      return;
    }

    const config = getConfig();
    if (!config) {
      sendJson(res, 503, {
        ok: false,
        configured: false,
        code: 'SOLICITACOES_SERVICE_UNAVAILABLE',
        error: 'Serviço central de solicitações não configurado no servidor.',
      });
      return;
    }

    // GET /api/solicitacoes-vistoria (e GET /:id opcional)
    if (method === 'GET') {
      if (route.queryStatus && !ALLOWED_STATUS_FILTER.has(route.queryStatus)) {
        sendJson(res, 400, {
          ok: false,
          code: 'INVALID_STATUS_FILTER',
          error: 'Filtro de status inválido.',
        });
        return;
      }

      const qs = new URLSearchParams({ sistema_origem: 'classifica' });
      if (route.queryStatus) {
        qs.set('status', route.queryStatus);
      }

      const targetUrl = route.id
        ? `${config.baseUrl}/${encodeURIComponent(route.id)}?sistema_origem=classifica`
        : `${config.baseUrl}?${qs.toString()}`;

      const upstream = await callCentralApi(fetchImpl, targetUrl, config.serviceToken, {
        method: 'GET',
      });

      if (!upstream.ok) {
        sendJson(res, upstream.status, {
          ok: false,
          configured: true,
          code: 'SOLICITACOES_UPSTREAM_ERROR',
          error: upstream.errorMessage || 'Erro ao consultar solicitações de vistoria.',
        });
        return;
      }

      if (route.id) {
        const rawItem = upstream.data?.item ?? upstream.data?.solicitacao ?? upstream.data;
        const item = sanitizeSolicitacao(rawItem);
        if (!item) {
          sendJson(res, 404, {
            ok: false,
            code: 'SOLICITACAO_NOT_FOUND',
            error: 'Solicitação de vistoria não encontrada.',
          });
          return;
        }
        sendJson(res, 200, { ok: true, configured: true, item });
        return;
      }

      const rawList = Array.isArray(upstream.data?.items)
        ? upstream.data.items
        : Array.isArray(upstream.data?.solicitacoes)
        ? upstream.data.solicitacoes
        : Array.isArray(upstream.data?.data)
        ? upstream.data.data
        : Array.isArray(upstream.data)
        ? (upstream.data as unknown[])
        : [];

      const items = rawList
        .map(sanitizeSolicitacao)
        .filter((s): s is SolicitacaoVistoriaSafe => Boolean(s))
        .filter((s) => (!route.queryStatus ? true : s.status.toLowerCase() === route.queryStatus));

      sendJson(res, 200, {
        ok: true,
        configured: true,
        actor: {
          canonicalUserId: actor.canonicalUserId,
          name: actor.name,
          email: actor.email,
          role: actor.role,
        },
        items,
      });
      return;
    }

    // Mutações exigem corpo JSON
    let body: Record<string, unknown>;
    try {
      body = await readJsonBody(req);
    } catch {
      sendJson(res, 413, {
        ok: false,
        code: 'PAYLOAD_TOO_LARGE',
        error: 'Requisição muito grande.',
      });
      return;
    }

    if (actor.role === 'Visualizador') {
      sendJson(res, 403, {
        ok: false,
        code: 'FORBIDDEN_ROLE',
        error: 'Usuários com perfil Visualizador não têm permissão para alterar solicitações de vistoria.',
      });
      return;
    }

    const cpfCnpjViolation = rejectAnyCpfCnpjInBody(body);
    if (cpfCnpjViolation) {
      sendJson(res, 400, {
        ok: false,
        code: 'CPF_CNPJ_FORBIDDEN',
        error: cpfCnpjViolation,
      });
      return;
    }

    // POST /api/solicitacoes-vistoria
    if (method === 'POST') {
      if (route.id && route.subAction === 'cancelar') {
        // Permite fallback se cliente chamar POST /:id/cancelar tratando como cancelamento
      } else if (route.id) {
        sendJson(res, 400, {
          ok: false,
          code: 'INVALID_ROUTE',
          error: 'Use POST /api/solicitacoes-vistoria para criar uma solicitação.',
        });
        return;
      } else {
        const relatoCheck = cleanOptionalField(body.relato, 'Relato', MAX_RELATO_LENGTH);
        if (relatoCheck.ok === false) {
          sendJson(res, 400, { ok: false, code: 'INVALID_RELATO', error: relatoCheck.error });
          return;
        }
        if (!relatoCheck.value) {
          sendJson(res, 400, {
            ok: false,
            code: 'MISSING_RELATO',
            error: 'O campo relato é obrigatório.',
          });
          return;
        }

        const barragemIdCheck = cleanOptionalField(body.barragem_id, 'ID da barragem', 120);
        if (barragemIdCheck.ok === false) {
          sendJson(res, 400, { ok: false, code: 'INVALID_INPUT', error: barragemIdCheck.error });
          return;
        }
        const barragemNomeCheck = cleanOptionalField(body.barragem_nome, 'Nome da barragem', 200);
        if (barragemNomeCheck.ok === false) {
          sendJson(res, 400, { ok: false, code: 'INVALID_INPUT', error: barragemNomeCheck.error });
          return;
        }
        const municipioCheck = cleanOptionalField(body.municipio, 'Município', 120);
        if (municipioCheck.ok === false) {
          sendJson(res, 400, { ok: false, code: 'INVALID_INPUT', error: municipioCheck.error });
          return;
        }
        const cursoAguaCheck = cleanOptionalField(body.curso_agua, "Curso d'água", 160);
        if (cursoAguaCheck.ok === false) {
          sendJson(res, 400, { ok: false, code: 'INVALID_INPUT', error: cursoAguaCheck.error });
          return;
        }
        const coordCheck = cleanOptionalField(body.coordenadas, 'Coordenadas', 120);
        if (coordCheck.ok === false) {
          sendJson(res, 400, { ok: false, code: 'INVALID_INPUT', error: coordCheck.error });
          return;
        }
        const empIdCheck = cleanOptionalField(body.empreendedor_id, 'ID do empreendedor', 120);
        if (empIdCheck.ok === false) {
          sendJson(res, 400, { ok: false, code: 'INVALID_INPUT', error: empIdCheck.error });
          return;
        }
        const empNomeCheck = cleanOptionalField(body.empreendedor_nome, 'Nome do empreendedor', 200);
        if (empNomeCheck.ok === false) {
          sendJson(res, 400, { ok: false, code: 'INVALID_INPUT', error: empNomeCheck.error });
          return;
        }
        const processoCheck = cleanOptionalField(body.processo, 'Processo', 120);
        if (processoCheck.ok === false) {
          sendJson(res, 400, { ok: false, code: 'INVALID_INPUT', error: processoCheck.error });
          return;
        }
        const classAtualCheck = cleanOptionalField(
          body.classificacao_atual,
          'Classificação atual',
          160
        );
        if (classAtualCheck.ok === false) {
          sendJson(res, 400, { ok: false, code: 'INVALID_INPUT', error: classAtualCheck.error });
          return;
        }
        const dpaCheck = cleanOptionalField(body.dpa, 'DPA', 60);
        if (dpaCheck.ok === false) {
          sendJson(res, 400, { ok: false, code: 'INVALID_INPUT', error: dpaCheck.error });
          return;
        }
        const criCheck = cleanOptionalField(body.cri, 'CRI', 60);
        if (criCheck.ok === false) {
          sendJson(res, 400, { ok: false, code: 'INVALID_INPUT', error: criCheck.error });
          return;
        }

        // Identidade do solicitante e sistema_origem vêm SEMPRE da sessão verificada no servidor
        const createPayload = {
          sistema_origem: 'classifica' as const,
          solicitante_id: actor.canonicalUserId,
          solicitante_nome: actor.name,
          solicitante_email: actor.email || null,
          relato: relatoCheck.value,
          barragem_id: barragemIdCheck.value,
          barragem_nome: barragemNomeCheck.value,
          municipio: municipioCheck.value,
          curso_agua: cursoAguaCheck.value,
          coordenadas: coordCheck.value,
          empreendedor_id: empIdCheck.value,
          empreendedor_nome: empNomeCheck.value,
          processo: processoCheck.value,
          classificacao_atual: classAtualCheck.value,
          dpa: dpaCheck.value,
          cri: criCheck.value,
        };

        const upstream = await callCentralApi(fetchImpl, config.baseUrl, config.serviceToken, {
          method: 'POST',
          body: JSON.stringify(createPayload),
        });

        if (!upstream.ok) {
          sendJson(res, upstream.status, {
            ok: false,
            configured: true,
            code: 'SOLICITACOES_UPSTREAM_ERROR',
            error: upstream.errorMessage || 'Não foi possível enviar a solicitação de vistoria.',
          });
          return;
        }

        const rawCreated = upstream.data?.item ?? upstream.data?.solicitacao ?? upstream.data;
        const item = sanitizeSolicitacao(rawCreated);
        if (!item) {
          sendJson(res, 502, {
            ok: false,
            configured: true,
            code: 'INVALID_UPSTREAM_RESPONSE',
            error: 'Resposta inesperada do serviço central de solicitações.',
          });
          return;
        }

        sendJson(res, 201, { ok: true, configured: true, item });
        return;
      }
    }

    // PATCH /:id, PATCH /:id/cancelar, POST /:id/cancelar ou PATCH /:id/observacao
    const targetId =
      route.id || (typeof body.id === 'string' && body.id.trim() ? body.id.trim() : '');
    if (!targetId) {
      sendJson(res, 400, {
        ok: false,
        code: 'MISSING_SOLICITACAO_ID',
        error: 'Informe o identificador da solicitação de vistoria.',
      });
      return;
    }

    // Busca registro atual no serviço central para validar autoria/equipe/status no servidor
    const existingRes = await callCentralApi(
      fetchImpl,
      `${config.baseUrl}/${encodeURIComponent(targetId)}?sistema_origem=classifica`,
      config.serviceToken,
      { method: 'GET' }
    );

    if (!existingRes.ok) {
      sendJson(res, existingRes.status, {
        ok: false,
        configured: true,
        code: 'SOLICITACAO_LOOKUP_ERROR',
        error: existingRes.errorMessage || 'Não foi possível localizar a solicitação de vistoria.',
      });
      return;
    }

    const existing = sanitizeSolicitacao(
      existingRes.data?.item ?? existingRes.data?.solicitacao ?? existingRes.data
    );
    if (!existing) {
      sendJson(res, 404, {
        ok: false,
        code: 'SOLICITACAO_NOT_FOUND',
        error: 'Solicitação de vistoria não encontrada.',
      });
      return;
    }

    // PATCH /:id/observacao — somente integrante da equipe que realizou ou Administrador
    if (route.subAction === 'observacao') {
      if (method !== 'PATCH') {
        sendJson(res, 405, {
          ok: false,
          code: 'METHOD_NOT_ALLOWED',
          error: 'Use PATCH para atualizar a observação de campo.',
        });
        return;
      }

      if (existing.status.toLowerCase() !== 'realizada') {
        sendJson(res, 409, {
          ok: false,
          code: 'VISTORIA_NOT_REALIZADA',
          error: 'Observações de campo só podem ser editadas após a realização da vistoria.',
        });
        return;
      }

      const allowedObservacao =
        actor.role === 'Administrador' || isEquipeMember(existing.equipe, actor);
      if (!allowedObservacao) {
        sendJson(res, 403, {
          ok: false,
          code: 'FORBIDDEN_OBSERVACAO',
          error:
            'Apenas integrantes da equipe responsável pela vistoria ou administradores podem editar a observação de campo.',
        });
        return;
      }

      const obsCheck = cleanOptionalField(
        body.observacao_campo,
        'Observação de campo',
        MAX_OBSERVACAO_LENGTH
      );
      if (obsCheck.ok === false) {
        sendJson(res, 400, { ok: false, code: 'INVALID_OBSERVACAO', error: obsCheck.error });
        return;
      }

      // Envia SOMENTE observacao_campo e ator verificado — nunca status nem data_realizacao
      const upstream = await callCentralApi(
        fetchImpl,
        `${config.baseUrl}/${encodeURIComponent(targetId)}/observacao`,
        config.serviceToken,
        {
          method: 'PATCH',
          body: JSON.stringify({
            observacao_campo: obsCheck.value,
            atualizado_por_id: actor.canonicalUserId,
            atualizado_por_email: actor.email || null,
          }),
        }
      );

      if (!upstream.ok) {
        sendJson(res, upstream.status, {
          ok: false,
          configured: true,
          code: 'SOLICITACOES_UPSTREAM_ERROR',
          error: upstream.errorMessage || 'Não foi possível atualizar a observação de campo.',
        });
        return;
      }

      const rawUpdated = upstream.data?.item ?? upstream.data?.solicitacao ?? upstream.data;
      const item = sanitizeSolicitacao(rawUpdated);
      if (!item) {
        sendJson(res, 502, {
          ok: false,
          configured: true,
          code: 'INVALID_UPSTREAM_RESPONSE',
          error: 'Resposta inesperada do serviço central de solicitações.',
        });
        return;
      }

      // Garante que status e data_realizacao não foram alterados por retorno inesperado
      item.status = existing.status;
      item.data_realizacao = existing.data_realizacao;

      sendJson(res, 200, { ok: true, configured: true, item });
      return;
    }

    // PATCH /:id ou /:id/cancelar — somente autor ou Administrador
    const isAuthorOrAdmin =
      actor.role === 'Administrador' || isSolicitationAuthor(existing, actor);
    if (!isAuthorOrAdmin) {
      sendJson(res, 403, {
        ok: false,
        code: 'FORBIDDEN_MODIFICATION',
        error: 'Apenas o solicitante autor ou um administrador pode editar ou cancelar esta solicitação.',
      });
      return;
    }

    const requestedAcao =
      route.subAction === 'cancelar' ||
      body.acao === 'cancelar' ||
      body.status === 'cancelada'
        ? 'cancelar'
        : 'editar';

    if (requestedAcao === 'cancelar') {
      if (existing.status.toLowerCase() === 'realizada') {
        sendJson(res, 409, {
          ok: false,
          code: 'ALREADY_REALIZADA',
          error: 'Não é possível cancelar uma solicitação cuja vistoria já foi realizada.',
        });
        return;
      }
      if (existing.status.toLowerCase() === 'cancelada') {
        sendJson(res, 409, {
          ok: false,
          code: 'ALREADY_CANCELADA',
          error: 'Esta solicitação já está cancelada.',
        });
        return;
      }

      const motivoCheck = cleanOptionalField(
        body.motivo_cancelamento,
        'Motivo do cancelamento',
        500
      );
      if (motivoCheck.ok === false) {
        sendJson(res, 400, { ok: false, code: 'INVALID_MOTIVO', error: motivoCheck.error });
        return;
      }

      const upstream = await callCentralApi(
        fetchImpl,
        `${config.baseUrl}/${encodeURIComponent(targetId)}`,
        config.serviceToken,
        {
          method: 'PATCH',
          body: JSON.stringify({
            acao: 'cancelar',
            status: 'cancelada',
            motivo_cancelamento: motivoCheck.value,
            atualizado_por_id: actor.canonicalUserId,
          }),
        }
      );

      if (!upstream.ok) {
        sendJson(res, upstream.status, {
          ok: false,
          configured: true,
          code: 'SOLICITACOES_UPSTREAM_ERROR',
          error: upstream.errorMessage || 'Não foi possível cancelar a solicitação de vistoria.',
        });
        return;
      }

      const rawUpdated = upstream.data?.item ?? upstream.data?.solicitacao ?? upstream.data;
      const item = sanitizeSolicitacao(rawUpdated);
      if (!item) {
        sendJson(res, 502, {
          ok: false,
          configured: true,
          code: 'INVALID_UPSTREAM_RESPONSE',
          error: 'Resposta inesperada do serviço central de solicitações.',
        });
        return;
      }

      sendJson(res, 200, { ok: true, configured: true, item });
      return;
    }

    // Edição pelo autor ou Administrador
    if (existing.status.toLowerCase() === 'realizada' || existing.status.toLowerCase() === 'cancelada') {
      sendJson(res, 409, {
        ok: false,
        code: 'STATUS_LOCKED',
        error: 'Não é possível editar solicitações já realizadas ou canceladas.',
      });
      return;
    }

    const relatoCheck = cleanOptionalField(body.relato, 'Relato', MAX_RELATO_LENGTH);
    if (relatoCheck.ok === false) {
      sendJson(res, 400, { ok: false, code: 'INVALID_RELATO', error: relatoCheck.error });
      return;
    }
    if (!relatoCheck.value) {
      sendJson(res, 400, {
        ok: false,
        code: 'MISSING_RELATO',
        error: 'O campo relato é obrigatório.',
      });
      return;
    }

    const upstream = await callCentralApi(
      fetchImpl,
      `${config.baseUrl}/${encodeURIComponent(targetId)}`,
      config.serviceToken,
      {
        method: 'PATCH',
        body: JSON.stringify({
          acao: 'editar',
          relato: relatoCheck.value,
          atualizado_por_id: actor.canonicalUserId,
        }),
      }
    );

    if (!upstream.ok) {
      sendJson(res, upstream.status, {
        ok: false,
        configured: true,
        code: 'SOLICITACOES_UPSTREAM_ERROR',
        error: upstream.errorMessage || 'Não foi possível atualizar a solicitação de vistoria.',
      });
      return;
    }

    const rawUpdated = upstream.data?.item ?? upstream.data?.solicitacao ?? upstream.data;
    const item = sanitizeSolicitacao(rawUpdated);
    if (!item) {
      sendJson(res, 502, {
        ok: false,
        configured: true,
        code: 'INVALID_UPSTREAM_RESPONSE',
        error: 'Resposta inesperada do serviço central de solicitações.',
      });
      return;
    }

    sendJson(res, 200, { ok: true, configured: true, item });
  };
}

export default createSolicitacoesVistoriaHandler();
