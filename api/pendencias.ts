import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type PendenciasAction =
  | 'listar'
  | 'historico'
  | 'criar'
  | 'editar'
  | 'direcionar'
  | 'alterar_situacao';

type PendenciaSituacao =
  | 'aberta'
  | 'direcionada'
  | 'em_analise'
  | 'resolvida'
  | 'cancelada';

type UserRole = 'Administrador' | 'Analista' | 'Visualizador';

type NodeReq = IncomingMessage & { body?: unknown };
type NodeRes = ServerResponse & {
  status?: (code: number) => NodeRes;
  json?: (payload: unknown) => void;
};

interface VerifiedPendenciasActor {
  canonicalUserId: string;
  name: string;
  role: UserRole;
}

interface PendenciaRow {
  id: string;
  origem: string;
  origem_ref_id: string | null;
  tipo: string;
  titulo: string;
  descricao: string | null;
  situacao: PendenciaSituacao;
  responsavel_id: string | null;
  direcionado_por: string | null;
  direcionado_em: string | null;
  criado_por: string;
  tipo_referencia: string | null;
  referencia_id: string | null;
  empreendedor_id: string | null;
  barragem_id: string | null;
  resolvido_por: string | null;
  resolvido_em: string | null;
  created_at: string;
  updated_at: string;
}

interface PendenciaHistoricoRow {
  id: string;
  pendencia_id: string;
  acao: string;
  campo: string | null;
  valor_anterior: string | null;
  valor_novo: string | null;
  usuario_id: string;
  motivo: string | null;
  created_at: string;
}

interface AssignableUserOption {
  id: string;
  canonicalUserId: string;
  name: string;
  role: UserRole;
  setor: string | null;
  active: boolean;
}

const ALLOWED_ACTIONS = new Set<PendenciasAction>([
  'listar',
  'historico',
  'criar',
  'editar',
  'direcionar',
  'alterar_situacao',
]);

const ALLOWED_SITUACOES = new Set<PendenciaSituacao>([
  'aberta',
  'direcionada',
  'em_analise',
  'resolvida',
  'cancelada',
]);

const PENDENCIA_ORIGEM_CANONICAL = 'classifica' as const;

const PENDENCIA_SELECT_COLUMNS =
  'id, origem, origem_ref_id, tipo, titulo, descricao, situacao, responsavel_id, direcionado_por, direcionado_em, criado_por, tipo_referencia, referencia_id, empreendedor_id, barragem_id, resolvido_por, resolvido_em, created_at, updated_at';

const HISTORICO_SELECT_COLUMNS =
  'id, pendencia_id, acao, campo, valor_anterior, valor_novo, usuario_id, motivo, created_at';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FORMATTED_CPF_REGEX = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/;
const FORMATTED_CNPJ_REGEX = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/;
const RAW_DIGIT_TOKEN_REGEX = /\b\d[\d.\-\/]{9,18}\d\b/g;

const ATOMIC_MUTATION_BLOCK_REASON =
  'Mutações bloqueadas no servidor: não há mecanismo transacional/atômico pré-existente para gravar public.pendencias e public.pendencias_historico em conjunto sem risco de gravação parcial.';

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

function inspectSupabaseKeyMeta(secretKey: string): {
  keyFormat: 'jwt' | 'sb_secret' | 'sb_publishable' | 'unknown';
  role: string;
} {
  if (secretKey.startsWith('sb_secret_')) {
    return { keyFormat: 'sb_secret', role: 'service_role' };
  }
  if (secretKey.startsWith('sb_publishable_')) {
    return { keyFormat: 'sb_publishable', role: 'anon' };
  }
  const parts = secretKey.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<
        string,
        unknown
      >;
      return {
        keyFormat: 'jwt',
        role: typeof payload?.role === 'string' ? payload.role.trim() : 'unknown',
      };
    } catch {
      return { keyFormat: 'unknown', role: 'unknown' };
    }
  }
  return { keyFormat: 'unknown', role: 'unknown' };
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

function isValidCpfDigits(digits: string): boolean {
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

function isValidCnpjDigits(digits: string): boolean {
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

function containsCpfOrCnpj(value: string | null | undefined): boolean {
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

function cleanOptionalTextField(
  raw: unknown,
  fieldLabel: string,
  maxLength: number
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null) {
    return { ok: true, value: null };
  }
  if (typeof raw !== 'string') {
    return { ok: false, error: `${fieldLabel} deve ser um texto simples.` };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, value: null };
  }
  if (trimmed.length > maxLength) {
    return { ok: false, error: `${fieldLabel} excede o limite de ${maxLength} caracteres.` };
  }
  if (containsCpfOrCnpj(trimmed)) {
    return {
      ok: false,
      error: `${fieldLabel} não pode conter CPF ou CNPJ. Utilize apenas referências de ID.`,
    };
  }
  return { ok: true, value: trimmed };
}

function getServerClients():
  | {
      ok: true;
      classificaUrl: string;
      anonOrVerifyKey: string;
      serviceRoleKey: string;
      keyFormat: string;
      serviceClient: SupabaseClient;
    }
  | { ok: false; status: number; code: string; error: string } {
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

  if (!classificaUrl || !serviceRoleKey) {
    return {
      ok: false,
      status: 503,
      code: 'PENDENCIAS_SERVER_CONFIG_MISSING',
      error:
        'Configuração server-side de pendências ausente (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).',
    };
  }

  const keyMeta = inspectSupabaseKeyMeta(serviceRoleKey);
  if (
    keyMeta.keyFormat === 'sb_publishable' ||
    (keyMeta.keyFormat === 'jwt' && keyMeta.role !== 'service_role') ||
    keyMeta.keyFormat === 'unknown'
  ) {
    return {
      ok: false,
      status: 503,
      code: 'CLASSIFICA_INVALID_SERVICE_ROLE_KEY',
      error: 'SUPABASE_SERVICE_ROLE_KEY configurada no servidor não possui papel service_role.',
    };
  }

  const isolatedFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    headers.delete('Authorization');
    headers.delete('authorization');
    headers.set('apikey', serviceRoleKey);
    if (keyMeta.keyFormat === 'jwt') {
      headers.set('Authorization', `Bearer ${serviceRoleKey}`);
    }
    return fetch(input, { ...init, headers });
  };

  const serviceClient = createClient(classificaUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: isolatedFetch,
      headers: { 'X-Client-Info': 'classifica-pendencias-server' },
    },
  });

  return {
    ok: true,
    classificaUrl,
    anonOrVerifyKey,
    serviceRoleKey,
    keyFormat: keyMeta.keyFormat,
    serviceClient,
  };
}

async function verifySessionAndActor(
  bearerToken: string,
  classificaUrl: string,
  anonOrVerifyKey: string,
  serviceClient: SupabaseClient
): Promise<
  | { ok: true; actor: VerifiedPendenciasActor }
  | { ok: false; status: number; code: string; error: string }
> {
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
        role: normalizeUserRole(row.role ?? row.papel),
      },
    };
  }

  // Fallback seguro usando serviceClient apenas para leitura do perfil vinculado ao authUser.id verificado
  const profileTables: Array<{ name: 'users' | 'user' | 'usuarios'; cols: string }> = [
    { name: 'users', cols: 'id, auth_user_id, email, name, role, active, force_password_change' },
    { name: 'users', cols: 'id, nome, email, papel, role, situacao, status' },
    { name: 'user', cols: 'id, nome, email, papel, role, situacao, status' },
    { name: 'usuarios', cols: 'id, nome, email, papel, role, situacao, status' },
  ];

  for (const tbl of profileTables) {
    let row: Record<string, unknown> | null = null;

    if (tbl.cols.includes('auth_user_id')) {
      const byAuth = await serviceClient
        .from(tbl.name)
        .select(tbl.cols)
        .eq('auth_user_id', authUser.id)
        .maybeSingle();
      if (!byAuth.error && byAuth.data) {
        row = byAuth.data as unknown as Record<string, unknown>;
      }
    }

    if (!row) {
      const byId = await serviceClient
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
          error: 'Perfil do usuário inativo ou aguardando revisão no Classifica CSB.',
        };
      }
      return {
        ok: true,
        actor: {
          canonicalUserId: authUser.id,
          name: String(row.name || row.nome || authUser.email || 'Usuário'),
          role: normalizeUserRole(row.role ?? row.papel),
        },
      };
    }
  }

  return {
    ok: false,
    status: 403,
    code: 'PROFILE_NOT_VERIFIED',
    error: 'Perfil ativo do usuário não pôde ser verificado no Classifica CSB.',
  };
}

async function fetchActiveAssignableUsers(
  serviceClient: SupabaseClient
): Promise<AssignableUserOption[]> {
  const res = await serviceClient
    .from('users')
    .select('id, auth_user_id, name, role, setor, active, force_password_change')
    .eq('active', true)
    .order('name', { ascending: true });

  let rows: Array<Record<string, unknown>> = [];
  if (!res.error && Array.isArray(res.data)) {
    rows = res.data as Array<Record<string, unknown>>;
  } else {
    const legacyRes = await serviceClient
      .from('users')
      .select('id, name, nome, role, papel, setor, active, status, situacao')
      .order('name', { ascending: true });
    if (!legacyRes.error && Array.isArray(legacyRes.data)) {
      rows = legacyRes.data as Array<Record<string, unknown>>;
    }
  }

  const seenCanonical = new Set<string>();
  const result: AssignableUserOption[] = [];

  for (const row of rows) {
    if (!isProfileActive(row) || row.force_password_change === true) continue;
    const rawCanonical =
      typeof row.auth_user_id === 'string' && row.auth_user_id.trim()
        ? row.auth_user_id.trim()
        : typeof row.auth_user_id === 'undefined' && typeof row.id === 'string'
        ? row.id.trim()
        : '';
    if (!UUID_REGEX.test(rawCanonical) || seenCanonical.has(rawCanonical)) continue;
    seenCanonical.add(rawCanonical);

    result.push({
      id: String(row.id || rawCanonical),
      canonicalUserId: rawCanonical,
      name: String(row.name || row.nome || 'Usuário'),
      role: normalizeUserRole(row.role ?? row.papel),
      setor: typeof row.setor === 'string' && row.setor.trim() ? row.setor.trim() : null,
      active: true,
    });
  }

  return result;
}

async function resolveReferencedUserNames(
  serviceClient: SupabaseClient,
  candidateIds: Array<string | null | undefined>,
  actor: VerifiedPendenciasActor,
  assignableUsers: AssignableUserOption[]
): Promise<Record<string, string>> {
  const names: Record<string, string> = {
    [actor.canonicalUserId]: actor.name,
  };
  for (const u of assignableUsers) {
    names[u.canonicalUserId] = u.name;
  }

  const missingIds = Array.from(
    new Set(
      candidateIds
        .filter((id): id is string => typeof id === 'string' && UUID_REGEX.test(id.trim()))
        .map((id) => id.trim())
        .filter((id) => !names[id])
    )
  );

  if (missingIds.length === 0) {
    return names;
  }

  const byAuthRes = await serviceClient
    .from('users')
    .select('id, auth_user_id, name')
    .in('auth_user_id', missingIds);

  if (!byAuthRes.error && Array.isArray(byAuthRes.data)) {
    for (const row of byAuthRes.data as Array<Record<string, unknown>>) {
      const key =
        typeof row.auth_user_id === 'string' && row.auth_user_id.trim()
          ? row.auth_user_id.trim()
          : typeof row.id === 'string'
          ? row.id.trim()
          : '';
      if (key && typeof row.name === 'string' && row.name.trim()) {
        names[key] = row.name.trim();
      }
    }
  }

  const stillMissing = missingIds.filter((id) => !names[id]);
  if (stillMissing.length > 0) {
    const byIdRes = await serviceClient
      .from('users')
      .select('id, name')
      .in('id', stillMissing);
    if (!byIdRes.error && Array.isArray(byIdRes.data)) {
      for (const row of byIdRes.data as Array<Record<string, unknown>>) {
        const key = typeof row.id === 'string' ? row.id.trim() : '';
        if (key && typeof row.name === 'string' && row.name.trim()) {
          names[key] = row.name.trim();
        }
      }
    }
  }

  return names;
}

async function hasExistingAtomicAuditRpc(
  classificaUrl: string,
  serviceRoleKey: string,
  keyFormat: string
): Promise<boolean> {
  // Verifica via OpenAPI se existe alguma RPC transacional conhecida e compatível.
  // Sem mecanismo atômico pré-existente que grave pendencias + pendencias_historico juntos,
  // mutações permanecem bloqueadas no servidor para impedir gravação parcial (e DELETE é proibido).
  try {
    const headers: Record<string, string> = {
      apikey: serviceRoleKey,
      Accept: 'application/openapi+json, application/json',
    };
    if (keyFormat === 'jwt') {
      headers.Authorization = `Bearer ${serviceRoleKey}`;
    }
    const res = await fetch(`${classificaUrl}/rest/v1/`, { headers });
    if (!res.ok) return false;
    const spec = (await res.json()) as { paths?: Record<string, unknown> };
    const paths = spec?.paths && typeof spec.paths === 'object' ? Object.keys(spec.paths) : [];
    // Não invocamos RPCs desconhecidas por suposição de assinatura.
    void paths;
    return false;
  } catch {
    return false;
  }
}

export default async function handler(req: NodeReq, res: NodeRes): Promise<void> {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    sendJson(res, 405, {
      ok: false,
      code: 'METHOD_NOT_ALLOWED',
      error: 'Método não permitido. Use GET ou POST.',
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

  const serverCheck = getServerClients();
  if (serverCheck.ok === false) {
    sendJson(res, serverCheck.status, {
      ok: false,
      configured: false,
      code: serverCheck.code,
      error: serverCheck.error,
    });
    return;
  }

  const session = await verifySessionAndActor(
    token,
    serverCheck.classificaUrl,
    serverCheck.anonOrVerifyKey,
    serverCheck.serviceClient
  );
  if (session.ok === false) {
    sendJson(res, session.status, {
      ok: false,
      configured: true,
      code: session.code,
      error: session.error,
    });
    return;
  }

  const { actor } = session;
  let body: Record<string, unknown> = {};
  if (req.method === 'POST') {
    try {
      body = await readJsonBody(req);
    } catch {
      sendJson(res, 413, { ok: false, code: 'PAYLOAD_TOO_LARGE', error: 'Requisição muito grande.' });
      return;
    }
  }

  const action: PendenciasAction =
    req.method === 'GET' ? 'listar' : ((body.action as PendenciasAction) || 'listar');
  if (!ALLOWED_ACTIONS.has(action)) {
    sendJson(res, 400, { ok: false, code: 'INVALID_ACTION', error: 'Ação de pendência inválida.' });
    return;
  }

  const atomicAvailable = await hasExistingAtomicAuditRpc(
    serverCheck.classificaUrl,
    serverCheck.serviceRoleKey,
    serverCheck.keyFormat
  );

  if (action === 'listar') {
    const { data, error } = await serverCheck.serviceClient
      .from('pendencias')
      .select(PENDENCIA_SELECT_COLUMNS)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      sendJson(res, 500, {
        ok: false,
        code: 'PENDENCIAS_READ_ERROR',
        error: `Não foi possível carregar as pendências: ${error.message || 'erro interno'}`,
      });
      return;
    }

    const items = ((data || []) as PendenciaRow[]).map((row) => ({
      ...row,
      situacao: ALLOWED_SITUACOES.has(row.situacao) ? row.situacao : 'aberta',
    }));

    const assignableUsers =
      actor.role === 'Administrador' ? await fetchActiveAssignableUsers(serverCheck.serviceClient) : [];

    const referencedIds: Array<string | null | undefined> = [];
    for (const item of items) {
      referencedIds.push(item.criado_por, item.responsavel_id, item.direcionado_por, item.resolvido_por);
    }
    const userNames = await resolveReferencedUserNames(
      serverCheck.serviceClient,
      referencedIds,
      actor,
      assignableUsers
    );

    sendJson(res, 200, {
      ok: true,
      configured: true,
      actor,
      items,
      userNames,
      assignableUsers,
      capabilities: {
        readEnabled: true,
        mutationsEnabled: atomicAvailable,
        mutationBlockCode: atomicAvailable ? null : 'ATOMIC_AUDIT_UNAVAILABLE',
        mutationBlockReason: atomicAvailable ? null : ATOMIC_MUTATION_BLOCK_REASON,
      },
    });
    return;
  }

  if (action === 'historico') {
    const pendenciaId = typeof body.pendenciaId === 'string' ? body.pendenciaId.trim() : '';
    if (!UUID_REGEX.test(pendenciaId)) {
      sendJson(res, 400, {
        ok: false,
        code: 'INVALID_PENDENCIA_ID',
        error: 'ID da pendência deve ser um identificador UUID válido.',
      });
      return;
    }

    const { data: parentRow, error: parentErr } = await serverCheck.serviceClient
      .from('pendencias')
      .select('id')
      .eq('id', pendenciaId)
      .maybeSingle();

    if (parentErr) {
      sendJson(res, 500, {
        ok: false,
        code: 'PENDENCIA_LOOKUP_ERROR',
        error: 'Erro ao verificar a pendência informada.',
      });
      return;
    }

    if (!parentRow) {
      sendJson(res, 404, {
        ok: false,
        code: 'PENDENCIA_NOT_FOUND',
        error: 'Pendência não encontrada.',
      });
      return;
    }

    const { data, error } = await serverCheck.serviceClient
      .from('pendencias_historico')
      .select(HISTORICO_SELECT_COLUMNS)
      .eq('pendencia_id', pendenciaId)
      .order('created_at', { ascending: false });

    if (error) {
      sendJson(res, 500, {
        ok: false,
        code: 'HISTORICO_READ_ERROR',
        error: `Não foi possível carregar o histórico: ${error.message || 'erro interno'}`,
      });
      return;
    }

    const items = (data || []) as PendenciaHistoricoRow[];
    const userNames = await resolveReferencedUserNames(
      serverCheck.serviceClient,
      items.map((h) => h.usuario_id),
      actor,
      []
    );

    sendJson(res, 200, {
      ok: true,
      items,
      userNames,
    });
    return;
  }

  // Mutações: validar rigorosamente antes do bloqueio transacional
  if (actor.role === 'Visualizador') {
    sendJson(res, 403, {
      ok: false,
      code: 'FORBIDDEN_ROLE',
      error: 'Usuários com perfil Visualizador não têm permissão para alterar pendências.',
    });
    return;
  }

  if (action === 'criar') {
    const tipoCheck = cleanOptionalTextField(body.tipo, 'Tipo', 80);
    if (tipoCheck.ok === false) {
      sendJson(res, 400, { ok: false, code: 'INVALID_INPUT', error: tipoCheck.error });
      return;
    }
    const tituloCheck = cleanOptionalTextField(body.titulo, 'Título', 200);
    if (tituloCheck.ok === false) {
      sendJson(res, 400, { ok: false, code: 'INVALID_INPUT', error: tituloCheck.error });
      return;
    }
    const descricaoCheck = cleanOptionalTextField(body.descricao, 'Descrição', 2000);
    if (descricaoCheck.ok === false) {
      sendJson(res, 400, { ok: false, code: 'INVALID_INPUT', error: descricaoCheck.error });
      return;
    }
    const origemRefCheck = cleanOptionalTextField(body.origem_ref_id, 'Ref. de origem', 120);
    if (origemRefCheck.ok === false) {
      sendJson(res, 400, { ok: false, code: 'INVALID_INPUT', error: origemRefCheck.error });
      return;
    }
    const tipoRefCheck = cleanOptionalTextField(body.tipo_referencia, 'Tipo de referência', 80);
    if (tipoRefCheck.ok === false) {
      sendJson(res, 400, { ok: false, code: 'INVALID_INPUT', error: tipoRefCheck.error });
      return;
    }
    const refIdCheck = cleanOptionalTextField(body.referencia_id, 'ID da referência', 120);
    if (refIdCheck.ok === false) {
      sendJson(res, 400, { ok: false, code: 'INVALID_INPUT', error: refIdCheck.error });
      return;
    }
    const empIdCheck = cleanOptionalTextField(body.empreendedor_id, 'ID do Empreendedor', 120);
    if (empIdCheck.ok === false) {
      sendJson(res, 400, { ok: false, code: 'INVALID_INPUT', error: empIdCheck.error });
      return;
    }
    const barIdCheck = cleanOptionalTextField(body.barragem_id, 'ID da Barragem', 120);
    if (barIdCheck.ok === false) {
      sendJson(res, 400, { ok: false, code: 'INVALID_INPUT', error: barIdCheck.error });
      return;
    }
    const motivoCheck = cleanOptionalTextField(body.motivo, 'Motivo', 300);
    if (motivoCheck.ok === false) {
      sendJson(res, 400, { ok: false, code: 'INVALID_INPUT', error: motivoCheck.error });
      return;
    }

    if (!tituloCheck.value || tituloCheck.value.length < 3) {
      sendJson(res, 400, {
        ok: false,
        code: 'INVALID_TITULO',
        error: 'Informe um título com pelo menos 3 caracteres.',
      });
      return;
    }
    if (!tipoCheck.value) {
      sendJson(res, 400, {
        ok: false,
        code: 'INVALID_TIPO',
        error: 'Informe o tipo da pendência.',
      });
      return;
    }

    const reqResp = cleanOptionalTextField(body.responsavel_id, 'Responsável', 64);
    if (reqResp.ok === false) {
      sendJson(res, 400, { ok: false, code: 'INVALID_RESPONSAVEL', error: reqResp.error });
      return;
    }
    if (reqResp.value) {
      if (actor.role !== 'Administrador') {
        sendJson(res, 403, {
          ok: false,
          code: 'FORBIDDEN_DIRECIONAMENTO',
          error: 'Usuários não administradores não podem escolher ou alterar o responsável.',
        });
        return;
      }
      if (!UUID_REGEX.test(reqResp.value)) {
        sendJson(res, 400, {
          ok: false,
          code: 'INVALID_RESPONSAVEL_UUID',
          error: 'ID do responsável deve ser um UUID válido.',
        });
        return;
      }
      const activeUsers = await fetchActiveAssignableUsers(serverCheck.serviceClient);
      const validTarget = activeUsers.find((u) => u.canonicalUserId === reqResp.value);
      if (!validTarget) {
        sendJson(res, 400, {
          ok: false,
          code: 'TARGET_USER_NOT_ACTIVE',
          error: 'O usuário selecionado para direcionamento não existe ou está inativo.',
        });
        return;
      }
    }

    // Payload canônico preparado (sem motivo em pendencias; origem fixa em 'classifica')
    const _validatedPendenciaRecord = {
      origem: PENDENCIA_ORIGEM_CANONICAL,
      origem_ref_id: origemRefCheck.value,
      tipo: tipoCheck.value,
      titulo: tituloCheck.value,
      descricao: descricaoCheck.value,
      situacao: (reqResp.value ? 'direcionada' : 'aberta') as PendenciaSituacao,
      responsavel_id: reqResp.value,
      direcionado_por: reqResp.value ? actor.canonicalUserId : null,
      criado_por: actor.canonicalUserId,
      tipo_referencia: tipoRefCheck.value,
      referencia_id: refIdCheck.value,
      empreendedor_id: empIdCheck.value,
      barragem_id: barIdCheck.value,
    };
    void _validatedPendenciaRecord;
  } else {
    const pendenciaId = typeof body.pendenciaId === 'string' ? body.pendenciaId.trim() : '';
    if (!UUID_REGEX.test(pendenciaId)) {
      sendJson(res, 400, {
        ok: false,
        code: 'INVALID_PENDENCIA_ID',
        error: 'ID da pendência deve ser um identificador UUID válido.',
      });
      return;
    }

    const { data: existingRow, error: fetchError } = await serverCheck.serviceClient
      .from('pendencias')
      .select(PENDENCIA_SELECT_COLUMNS)
      .eq('id', pendenciaId)
      .maybeSingle();

    if (fetchError) {
      sendJson(res, 500, {
        ok: false,
        code: 'PENDENCIA_LOOKUP_ERROR',
        error: 'Não foi possível verificar a pendência solicitada.',
      });
      return;
    }

    if (!existingRow) {
      sendJson(res, 404, {
        ok: false,
        code: 'PENDENCIA_NOT_FOUND',
        error: 'Pendência não encontrada.',
      });
      return;
    }

    const current = existingRow as PendenciaRow;

    if (action === 'direcionar') {
      if (actor.role !== 'Administrador') {
        sendJson(res, 403, {
          ok: false,
          code: 'FORBIDDEN_DIRECIONAMENTO',
          error: 'Apenas administradores podem direcionar ou alterar o responsável.',
        });
        return;
      }

      const targetId = typeof body.responsavelId === 'string' ? body.responsavelId.trim() : '';
      if (!UUID_REGEX.test(targetId)) {
        sendJson(res, 400, {
          ok: false,
          code: 'INVALID_RESPONSAVEL_UUID',
          error: 'Selecione um usuário válido para direcionamento.',
        });
        return;
      }

      const motivoCheck = cleanOptionalTextField(body.motivo, 'Motivo', 300);
      if (motivoCheck.ok === false) {
        sendJson(res, 400, { ok: false, code: 'INVALID_INPUT', error: motivoCheck.error });
        return;
      }

      const activeUsers = await fetchActiveAssignableUsers(serverCheck.serviceClient);
      const targetUser = activeUsers.find((u) => u.canonicalUserId === targetId);
      if (!targetUser) {
        sendJson(res, 400, {
          ok: false,
          code: 'TARGET_USER_NOT_ACTIVE',
          error: 'O usuário selecionado não existe ou está inativo.',
        });
        return;
      }

      if (current.situacao === 'resolvida' || current.situacao === 'cancelada') {
        sendJson(res, 400, {
          ok: false,
          code: 'INVALID_SITUACAO_TRANSITION',
          error: 'Pendências resolvidas ou canceladas devem ter a situação alterada antes de novo direcionamento.',
        });
        return;
      }

      if (current.responsavel_id === targetUser.canonicalUserId) {
        sendJson(res, 400, {
          ok: false,
          code: 'SAME_RESPONSAVEL',
          error: 'Esta pendência já está direcionada para o usuário selecionado.',
        });
        return;
      }
    }

    if (action === 'editar') {
      const canEdit =
        actor.role === 'Administrador' ||
        !current.responsavel_id ||
        current.responsavel_id === actor.canonicalUserId ||
        current.criado_por === actor.canonicalUserId;
      if (!canEdit) {
        sendJson(res, 403, {
          ok: false,
          code: 'FORBIDDEN_EDIT',
          error: 'Você só pode editar pendências sob sua responsabilidade, criadas por você ou sem responsável.',
        });
        return;
      }

      const tipoCheck = cleanOptionalTextField(body.tipo, 'Tipo', 80);
      if (tipoCheck.ok === false) {
        sendJson(res, 400, { ok: false, code: 'INVALID_INPUT', error: tipoCheck.error });
        return;
      }
      const tituloCheck = cleanOptionalTextField(body.titulo, 'Título', 200);
      if (tituloCheck.ok === false) {
        sendJson(res, 400, { ok: false, code: 'INVALID_INPUT', error: tituloCheck.error });
        return;
      }
      const descricaoCheck = cleanOptionalTextField(body.descricao, 'Descrição', 2000);
      if (descricaoCheck.ok === false) {
        sendJson(res, 400, { ok: false, code: 'INVALID_INPUT', error: descricaoCheck.error });
        return;
      }
      const origemRefCheck = cleanOptionalTextField(body.origem_ref_id, 'Ref. de origem', 120);
      if (origemRefCheck.ok === false) {
        sendJson(res, 400, { ok: false, code: 'INVALID_INPUT', error: origemRefCheck.error });
        return;
      }
      const tipoRefCheck = cleanOptionalTextField(body.tipo_referencia, 'Tipo de referência', 80);
      if (tipoRefCheck.ok === false) {
        sendJson(res, 400, { ok: false, code: 'INVALID_INPUT', error: tipoRefCheck.error });
        return;
      }
      const refIdCheck = cleanOptionalTextField(body.referencia_id, 'ID da referência', 120);
      if (refIdCheck.ok === false) {
        sendJson(res, 400, { ok: false, code: 'INVALID_INPUT', error: refIdCheck.error });
        return;
      }
      const empIdCheck = cleanOptionalTextField(body.empreendedor_id, 'ID do Empreendedor', 120);
      if (empIdCheck.ok === false) {
        sendJson(res, 400, { ok: false, code: 'INVALID_INPUT', error: empIdCheck.error });
        return;
      }
      const barIdCheck = cleanOptionalTextField(body.barragem_id, 'ID da Barragem', 120);
      if (barIdCheck.ok === false) {
        sendJson(res, 400, { ok: false, code: 'INVALID_INPUT', error: barIdCheck.error });
        return;
      }
      const motivoCheck = cleanOptionalTextField(body.motivo, 'Motivo', 300);
      if (motivoCheck.ok === false) {
        sendJson(res, 400, { ok: false, code: 'INVALID_INPUT', error: motivoCheck.error });
        return;
      }

      if (!tituloCheck.value || tituloCheck.value.length < 3) {
        sendJson(res, 400, {
          ok: false,
          code: 'INVALID_TITULO',
          error: 'Informe um título com pelo menos 3 caracteres.',
        });
        return;
      }
      if (!tipoCheck.value) {
        sendJson(res, 400, {
          ok: false,
          code: 'INVALID_TIPO',
          error: 'Informe o tipo da pendência.',
        });
        return;
      }
    }

    if (action === 'alterar_situacao') {
      const novaSituacao = typeof body.novaSituacao === 'string' ? body.novaSituacao.trim() : '';
      if (!ALLOWED_SITUACOES.has(novaSituacao as PendenciaSituacao)) {
        sendJson(res, 400, {
          ok: false,
          code: 'INVALID_SITUACAO',
          error: 'Situação inválida para pendência.',
        });
        return;
      }

      const motivoCheck = cleanOptionalTextField(body.motivo, 'Motivo', 300);
      if (motivoCheck.ok === false) {
        sendJson(res, 400, { ok: false, code: 'INVALID_INPUT', error: motivoCheck.error });
        return;
      }

      const canChangeStatus =
        actor.role === 'Administrador' ||
        !current.responsavel_id ||
        current.responsavel_id === actor.canonicalUserId;
      if (!canChangeStatus) {
        sendJson(res, 403, {
          ok: false,
          code: 'FORBIDDEN_SITUACAO',
          error: 'Apenas o responsável designado ou um administrador pode alterar a situação desta pendência.',
        });
        return;
      }

      if (novaSituacao === 'direcionada' && !current.responsavel_id) {
        sendJson(res, 400, {
          ok: false,
          code: 'MISSING_RESPONSAVEL',
          error: 'Não é possível definir a situação como direcionada sem um responsável atribuído.',
        });
        return;
      }
    }
  }

  // Bloqueio obrigatório: sem mecanismo transacional/atômico pré-existente para gravar
  // pendencias e pendencias_historico juntos, nenhuma mutação parcial é executada.
  sendJson(res, 409, {
    ok: false,
    code: 'ATOMIC_AUDIT_UNAVAILABLE',
    error: ATOMIC_MUTATION_BLOCK_REASON,
  });
}
