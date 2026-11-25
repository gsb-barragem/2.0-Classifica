import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type AdministraEscritaAction =
  | 'listar_arts_rt'
  | 'salvar_art_rt'
  | 'salvar_rt'
  | 'salvar_empreendedor'
  | 'salvar_barragem';

export const BLOCKED_WRITE_ACTIONS = new Set<AdministraEscritaAction>([
  'salvar_art_rt',
  'salvar_rt',
  'salvar_empreendedor',
  'salvar_barragem',
]);

export const ADMINISTRA_MASTER_WRITE_BLOCKED_CODE = 'ADMINISTRA_MASTER_WRITE_BLOCKED';
export const ADMINISTRA_MASTER_WRITE_BLOCKED_MESSAGE =
  'Gravação direta de cadastros mestres no Administra Barragens está bloqueada no Classifica 2.0 até a implantação da API de escrita aprovada com validação híbrida.';

type NodeReq = IncomingMessage & { body?: unknown };
type NodeRes = ServerResponse & {
  status?: (code: number) => NodeRes;
  json?: (payload: unknown) => void;
};

interface RtArtVinculo {
  id: string;
  art: string;
  rt_id: string;
  barragem_id?: string | null;
  barragem_nome?: string | null;
  barragem_snisb?: string | null;
  atividade?: string | null;
  observacao?: string | null;
  created_at?: string | null;
  origem?: 'vinculo' | 'rt' | 'arts';
}

interface TableSchemaInfo {
  exists: boolean;
  columns: Set<string>;
  required: Set<string>;
}

export type SessionVerificationResult =
  | {
      ok: true;
      userId: string;
      userName: string;
      userRole: 'Administrador' | 'Analista' | 'Visualizador';
      classificaUrl: string;
    }
  | { ok: false; status: number; code: string; error: string };

export type AdministraClientCheckResult =
  | { ok: true; client: SupabaseClient; url: string; secretKey: string; keyFormat: string }
  | { ok: false; status: number; code: string; error: string };

export interface AdministraEscritaDeps {
  verifySession?: (bearerToken: string) => Promise<SessionVerificationResult>;
  getAdministraClient?: (classificaUrl?: string) => AdministraClientCheckResult;
  fetchImpl?: typeof fetch;
}

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

function normalizeUserRole(rawRole: unknown): 'Administrador' | 'Analista' | 'Visualizador' {
  const lower = String(rawRole ?? '').trim().toLowerCase();
  if (['administrador', 'administradora', 'admin'].includes(lower)) return 'Administrador';
  if (lower === 'analista') return 'Analista';
  return 'Visualizador';
}

async function verifyClassificaReadSession(bearerToken: string): Promise<SessionVerificationResult> {
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
        'Autenticação do Classifica CSB não verificável no servidor: configure SUPABASE_URL e SUPABASE_ANON_KEY (ou SUPABASE_SERVICE_ROLE_KEY).',
    };
  }

  const userScopedClient = createClient(classificaUrl, classificaKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${bearerToken}` } },
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
        error: 'Perfil do usuário inativo ou aguardando revisão no Classifica CSB.',
      };
    }
    return {
      ok: true,
      userId: authUser.id,
      userName: String(row.name || row.nome || authUser.email || 'Analista CSB'),
      userRole: normalizeUserRole(row.role ?? row.papel),
      classificaUrl,
    };
  }

  const tables: Array<{ name: 'users' | 'user' | 'usuarios'; cols: string }> = [
    { name: 'users', cols: 'id, auth_user_id, email, name, role, active, force_password_change' },
    { name: 'users', cols: 'id, email, nome, papel, role, situacao, status' },
    { name: 'user', cols: 'id, email, nome, papel, role, situacao, status' },
    { name: 'usuarios', cols: 'id, email, nome, papel, role, situacao, status' },
  ];

  const verifiedEmail = authUser.email?.trim().toLowerCase();
  for (const tbl of tables) {
    const candidates: Array<Record<string, unknown> | null> = [];
    if (tbl.cols.includes('auth_user_id')) {
      const r = await userScopedClient
        .from(tbl.name)
        .select(tbl.cols)
        .eq('auth_user_id', authUser.id)
        .maybeSingle();
      if (!r.error && r.data) candidates.push(r.data as unknown as Record<string, unknown>);
    }
    const byId = await userScopedClient
      .from(tbl.name)
      .select(tbl.cols)
      .eq('id', authUser.id)
      .maybeSingle();
    if (!byId.error && byId.data) candidates.push(byId.data as unknown as Record<string, unknown>);

    if (candidates.length === 0 && verifiedEmail) {
      const byEmail = await userScopedClient
        .from(tbl.name)
        .select(tbl.cols)
        .ilike('email', verifiedEmail)
        .maybeSingle();
      if (!byEmail.error && byEmail.data) candidates.push(byEmail.data as unknown as Record<string, unknown>);
    }

    const rec = candidates[0];
    if (rec) {
      if (!isProfileActive(rec) || rec.force_password_change === true) {
        return {
          ok: false,
          status: 403,
          code: 'FORBIDDEN_PROFILE',
          error: 'Perfil do usuário inativo ou aguardando revisão no Classifica CSB.',
        };
      }
      return {
        ok: true,
        userId: authUser.id,
        userName: String(rec.name || rec.nome || authUser.email || 'Analista CSB'),
        userRole: normalizeUserRole(rec.role ?? rec.papel),
        classificaUrl,
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

function inspectSupabaseKeyMeta(secretKey: string): {
  keyFormat: 'jwt' | 'sb_secret' | 'sb_publishable' | 'unknown';
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
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<
        string,
        unknown
      >;
      return {
        keyFormat: 'jwt',
        role: typeof payload?.role === 'string' ? payload.role.trim() : 'unknown',
        ref: typeof payload?.ref === 'string' ? payload.ref.trim() : null,
      };
    } catch {
      return { keyFormat: 'unknown', role: 'unknown', ref: null };
    }
  }
  return { keyFormat: 'unknown', role: 'unknown', ref: null };
}

function getAdministraServerClient(
  classificaUrl?: string,
  fetchImpl: typeof fetch = fetch
): AdministraClientCheckResult {
  const url = normalizeOrigin(process.env.ADMINISTRA_SUPABASE_URL);
  const secretKey = (process.env.ADMINISTRA_SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!url || !secretKey) {
    return {
      ok: false,
      status: 503,
      code: 'ADMINISTRA_SERVER_CONFIG_MISSING',
      error:
        'Configuração server-side do Administra Barragens ausente (ADMINISTRA_SUPABASE_URL / ADMINISTRA_SUPABASE_SERVICE_ROLE_KEY).',
    };
  }

  if (classificaUrl && url === classificaUrl) {
    return {
      ok: false,
      status: 503,
      code: 'ADMINISTRA_URL_POINTS_TO_CLASSIFICA',
      error: 'ADMINISTRA_SUPABASE_URL aponta para o mesmo projeto do Classifica CSB.',
    };
  }

  const keyMeta = inspectSupabaseKeyMeta(secretKey);
  if (
    keyMeta.keyFormat === 'sb_publishable' ||
    (keyMeta.keyFormat === 'jwt' && keyMeta.role !== 'service_role') ||
    keyMeta.keyFormat === 'unknown'
  ) {
    return {
      ok: false,
      status: 503,
      code: 'ADMINISTRA_INVALID_KEY_ROLE',
      error: 'ADMINISTRA_SUPABASE_SERVICE_ROLE_KEY não possui papel service_role.',
    };
  }

  const isolatedFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    headers.delete('Authorization');
    headers.delete('authorization');
    headers.set('apikey', secretKey);
    if (keyMeta.keyFormat === 'jwt') {
      headers.set('Authorization', `Bearer ${secretKey}`);
    }
    return fetchImpl(input, { ...init, headers });
  };

  const client = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: isolatedFetch,
      headers: { 'X-Client-Info': 'classifica-server-to-administra-read' },
    },
  });

  return { ok: true, client, url, secretKey, keyFormat: keyMeta.keyFormat };
}

async function fetchAdministraOpenApi(
  url: string,
  secretKey: string,
  keyFormat: string,
  fetchImpl: typeof fetch = fetch
): Promise<{
  tables: Record<string, TableSchemaInfo>;
  rpcs: Set<string>;
}> {
  const tables: Record<string, TableSchemaInfo> = {};
  const rpcs = new Set<string>();

  try {
    const headers: Record<string, string> = {
      apikey: secretKey,
      Accept: 'application/openapi+json, application/json',
    };
    if (keyFormat === 'jwt') {
      headers.Authorization = `Bearer ${secretKey}`;
    }

    const res = await fetchImpl(`${url}/rest/v1/`, { headers });
    if (!res.ok) return { tables, rpcs };

    const spec = (await res.json()) as {
      definitions?: Record<string, { properties?: Record<string, unknown>; required?: string[] }>;
      paths?: Record<string, unknown>;
    };

    if (spec?.definitions && typeof spec.definitions === 'object') {
      for (const [name, def] of Object.entries(spec.definitions)) {
        const cols = new Set(Object.keys(def?.properties || {}));
        const req = new Set(Array.isArray(def?.required) ? def.required : []);
        tables[name] = { exists: true, columns: cols, required: req };
      }
    }

    if (spec?.paths && typeof spec.paths === 'object') {
      for (const p of Object.keys(spec.paths)) {
        if (p.startsWith('/rpc/')) {
          rpcs.add(p.slice(5));
        }
      }
    }
  } catch {
    // Fallback para detecção direta por tabela se OpenAPI estiver desabilitado
  }

  return { tables, rpcs };
}

function pickField(row: Record<string, any> | null | undefined, patterns: RegExp[]): string | null {
  if (!row || typeof row !== 'object') return null;
  const keys = Object.keys(row);
  for (const rx of patterns) {
    const matched = keys.find((k) => rx.test(k));
    if (matched) {
      const val = row[matched];
      if (val !== null && val !== undefined && String(val).trim() !== '') {
        return String(val).trim();
      }
    }
  }
  return null;
}

function parseJsonRpcList(rpcName: string, raw: unknown): Record<string, any>[] {
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
    } else {
      return obj as Record<string, any>[];
    }
  }
  return Array.isArray(obj?.dados) ? (obj.dados as Record<string, any>[]) : [];
}

async function listArtsForRtServer(
  client: SupabaseClient,
  rtId: string,
  tables: Record<string, TableSchemaInfo>
): Promise<RtArtVinculo[]> {
  const results: RtArtVinculo[] = [];
  const seen = new Set<string>();

  const pushUnique = (item: RtArtVinculo) => {
    const cleanArt = (item.art || '').trim();
    if (!cleanArt) return;
    const dedupKey = `${cleanArt.toUpperCase()}::${item.barragem_id || ''}`;
    if (seen.has(dedupKey)) return;
    seen.add(dedupKey);
    results.push({ ...item, art: cleanArt });
  };

  const barragensMap: Record<string, Record<string, any>> = {};
  const barRes = await client.rpc('csb_ler_barragens', { p_busca: '', p_limite: 500, p_offset: 0 });
  if (!barRes.error && Array.isArray(barRes.data)) {
    for (const b of barRes.data as Record<string, any>[]) {
      const bId = pickField(b, [/^id$/i, /^barragem_id$/i]);
      if (bId) barragensMap[bId] = b;
    }
  }

  const vincRpc = await client.rpc('csb_ler_vinculos_rt_barragem', {
    p_busca: '',
    p_limite: 1000,
    p_offset: 0,
  });
  const vincRows = vincRpc.error
    ? []
    : parseJsonRpcList('csb_ler_vinculos_rt_barragem', vincRpc.data);

  for (const v of vincRows) {
    const vRtId = pickField(v, [/^rt_id$/i, /^id_rt$/i, /^responsavel_tecnico_id$/i]);
    if (vRtId !== rtId) continue;

    const artVal = pickField(v, [
      /^art$/i,
      /^numero_art$/i,
      /^art_numero$/i,
      /^num_art$/i,
      /^registro_art$/i,
      /^codigo_art$/i,
    ]);
    if (!artVal) continue;

    const barId = pickField(v, [/^barragem_id$/i, /^id_barragem$/i]);
    const bar = barId ? barragensMap[barId] : null;
    pushUnique({
      id: pickField(v, [/^id$/i, /^vinculo_id$/i]) || `vinc_${rtId}_${artVal}`,
      art: artVal,
      rt_id: rtId,
      barragem_id: barId,
      barragem_nome:
        pickField(v, [/^barragem_nome$/i, /^nome_barragem$/i]) ||
        pickField(bar, [/^barragem_nome$/i, /^nome_barragem$/i, /^nome$/i]),
      barragem_snisb:
        pickField(v, [/^barragem_snisb$/i, /^snisb$/i]) ||
        pickField(bar, [/^snisb$/i, /^codigo_snisb$/i]),
      atividade: pickField(v, [/^atividade$/i, /^funcao$/i, /^tipo$/i, /^papel$/i]),
      observacao: pickField(v, [/^observacao$/i, /^observacoes$/i, /^descricao$/i]),
      created_at: pickField(v, [/^created_at$/i]),
      origem: 'vinculo',
    });
  }

  const artTableCandidates = ['arts', 'rt_arts', 'arts_rts', 'responsaveis_tecnicos_arts', 'rts_arts'];
  for (const tblName of artTableCandidates) {
    if (Object.keys(tables).length > 0 && !tables[tblName]?.exists) continue;
    const { data, error } = await client.from(tblName).select('*').eq('rt_id', rtId);
    if (error || !Array.isArray(data)) continue;
    for (const row of data as Record<string, any>[]) {
      const artVal = pickField(row, [
        /^numero_art$/i,
        /^art$/i,
        /^art_numero$/i,
        /^num_art$/i,
        /^numero$/i,
        /^codigo_art$/i,
      ]);
      if (!artVal) continue;
      const barId = pickField(row, [/^barragem_id$/i, /^id_barragem$/i]);
      const bar = barId ? barragensMap[barId] : null;
      pushUnique({
        id: pickField(row, [/^id$/i]) || `art_${rtId}_${artVal}`,
        art: artVal,
        rt_id: rtId,
        barragem_id: barId,
        barragem_nome: pickField(bar, [/^barragem_nome$/i, /^nome_barragem$/i, /^nome$/i]),
        barragem_snisb: pickField(bar, [/^snisb$/i, /^codigo_snisb$/i]),
        atividade: pickField(row, [/^atividade$/i, /^funcao$/i, /^tipo$/i]),
        observacao: pickField(row, [/^observacao$/i, /^observacoes$/i, /^descricao$/i]),
        created_at: pickField(row, [/^created_at$/i]),
        origem: 'arts',
      });
    }
  }

  const rtTableCandidates = ['rts', 'administra_responsaveis_tecnicos'];
  for (const rtTbl of rtTableCandidates) {
    if (Object.keys(tables).length > 0 && !tables[rtTbl]?.exists) continue;
    const { data, error } = await client.from(rtTbl).select('*').eq('id', rtId).maybeSingle();
    if (error || !data) continue;
    const rec = data as Record<string, any>;
    const directArt = pickField(rec, [/^art$/i, /^numero_art$/i, /^art_numero$/i, /^num_art$/i]);
    if (directArt) {
      pushUnique({
        id: `rt_${rtId}_${directArt}`,
        art: directArt,
        rt_id: rtId,
        origem: 'rt',
      });
    }
    if (Array.isArray(rec.arts)) {
      for (const entry of rec.arts) {
        if (typeof entry === 'string' && entry.trim()) {
          pushUnique({ id: `rt_arr_${rtId}_${entry.trim()}`, art: entry.trim(), rt_id: rtId, origem: 'rt' });
        } else if (entry && typeof entry === 'object') {
          const a = pickField(entry as Record<string, any>, [/^art$/i, /^numero_art$/i, /^numero$/i]);
          if (a) {
            pushUnique({
              id: pickField(entry as Record<string, any>, [/^id$/i]) || `rt_obj_${rtId}_${a}`,
              art: a,
              rt_id: rtId,
              barragem_id: pickField(entry as Record<string, any>, [/^barragem_id$/i]),
              atividade: pickField(entry as Record<string, any>, [/^atividade$/i, /^funcao$/i]),
              observacao: pickField(entry as Record<string, any>, [/^observacao$/i, /^descricao$/i]),
              origem: 'rt',
            });
          }
        }
      }
    }
    break;
  }

  return results;
}

export function createAdministraEscritaHandler(deps: AdministraEscritaDeps = {}) {
  const verifySession = deps.verifySession ?? verifyClassificaReadSession;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const resolveAdministraClient =
    deps.getAdministraClient ??
    ((classificaUrl?: string) => getAdministraServerClient(classificaUrl, fetchImpl));

  return async function handler(req: NodeReq, res: NodeRes): Promise<void> {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      sendJson(res, 405, {
        ok: false,
        blocked: false,
        code: 'METHOD_NOT_ALLOWED',
        error: 'Método não permitido. Use POST.',
      });
      return;
    }

    let body: Record<string, unknown>;
    try {
      body = await readJsonBody(req);
    } catch {
      sendJson(res, 413, {
        ok: false,
        blocked: false,
        code: 'PAYLOAD_TOO_LARGE',
        error: 'Requisição muito grande.',
      });
      return;
    }

    const rawAction = typeof body.action === 'string' ? body.action.trim() : '';

    // Bloqueio arquitetural explícito ANTES de qualquer chamada remota:
    // Classifica 2.0 não grava cadastros mestres diretamente no Administra Barragens.
    if (BLOCKED_WRITE_ACTIONS.has(rawAction as AdministraEscritaAction)) {
      sendJson(res, 409, {
        ok: false,
        blocked: true,
        configured: true,
        code: ADMINISTRA_MASTER_WRITE_BLOCKED_CODE,
        error: ADMINISTRA_MASTER_WRITE_BLOCKED_MESSAGE,
      });
      return;
    }

    if (rawAction !== 'listar_arts_rt') {
      sendJson(res, 400, {
        ok: false,
        blocked: false,
        code: 'INVALID_ACTION',
        error: 'Ação não permitida.',
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
        error: 'Token de sessão do Classifica CSB obrigatório.',
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

    const rtId = typeof body.rtId === 'string' ? body.rtId.trim() : '';
    if (!rtId) {
      sendJson(res, 400, {
        ok: false,
        code: 'MISSING_RT_ID',
        error: 'Informe o rtId.',
      });
      return;
    }

    const adminCheck = resolveAdministraClient(session.classificaUrl);
    if (adminCheck.ok === false) {
      sendJson(res, adminCheck.status, {
        ok: false,
        configured: false,
        code: adminCheck.code,
        error: adminCheck.error,
      });
      return;
    }

    const { tables } = await fetchAdministraOpenApi(
      adminCheck.url,
      adminCheck.secretKey,
      adminCheck.keyFormat,
      fetchImpl
    );

    const items = await listArtsForRtServer(adminCheck.client, rtId, tables);
    sendJson(res, 200, {
      ok: true,
      configured: true,
      readOnly: true,
      items,
    });
  };
}

export default createAdministraEscritaHandler();
