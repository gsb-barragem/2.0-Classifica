import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type AdministraEscritaAction =
  | 'listar_arts_rt'
  | 'salvar_art_rt'
  | 'salvar_rt'
  | 'salvar_empreendedor'
  | 'salvar_barragem';

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

const ALLOWED_ACTIONS = new Set<AdministraEscritaAction>([
  'listar_arts_rt',
  'salvar_art_rt',
  'salvar_rt',
  'salvar_empreendedor',
  'salvar_barragem',
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

function normalizeUserRole(rawRole: unknown): 'Administrador' | 'Analista' | 'Visualizador' {
  const lower = String(rawRole ?? '').trim().toLowerCase();
  if (['administrador', 'administradora', 'admin'].includes(lower)) return 'Administrador';
  if (lower === 'analista') return 'Analista';
  return 'Visualizador';
}

async function verifyClassificaWriteSession(bearerToken: string): Promise<
  | {
      ok: true;
      userId: string;
      userName: string;
      userRole: 'Administrador' | 'Analista';
      classificaUrl: string;
    }
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
    const role = normalizeUserRole(row.role ?? row.papel);
    if (role === 'Visualizador') {
      return {
        ok: false,
        status: 403,
        code: 'FORBIDDEN_ROLE',
        error: 'Usuários com perfil Visualizador não podem gravar dados no Administra Barragens.',
      };
    }
    return {
      ok: true,
      userId: authUser.id,
      userName: String(row.name || row.nome || authUser.email || 'Analista CSB'),
      userRole: role,
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
      const role = normalizeUserRole(rec.role ?? rec.papel);
      if (role === 'Visualizador') {
        return {
          ok: false,
          status: 403,
          code: 'FORBIDDEN_ROLE',
          error: 'Usuários com perfil Visualizador não podem gravar dados no Administra Barragens.',
        };
      }
      return {
        ok: true,
        userId: authUser.id,
        userName: String(rec.name || rec.nome || authUser.email || 'Analista CSB'),
        userRole: role,
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

function getAdministraServerClient(classificaUrl?: string):
  | { ok: true; client: SupabaseClient; url: string; secretKey: string; keyFormat: string }
  | { ok: false; status: number; code: string; error: string } {
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
    return fetch(input, { ...init, headers });
  };

  const client = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: isolatedFetch,
      headers: { 'X-Client-Info': 'classifica-server-to-administra-write' },
    },
  });

  return { ok: true, client, url, secretKey, keyFormat: keyMeta.keyFormat };
}

async function fetchAdministraOpenApi(
  url: string,
  secretKey: string,
  keyFormat: string
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

    const res = await fetch(`${url}/rest/v1/`, { headers });
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

function pickColumnName(columns: Set<string>, candidates: string[]): string | null {
  for (const c of candidates) {
    if (columns.has(c)) return c;
  }
  const lowerMap = new Map<string, string>();
  for (const c of columns) lowerMap.set(c.toLowerCase(), c);
  for (const c of candidates) {
    const found = lowerMap.get(c.toLowerCase());
    if (found) return found;
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

  // Mapa rápido de barragens para enriquecer nomes/SNISB
  const barragensMap: Record<string, Record<string, any>> = {};
  const barRes = await client.rpc('csb_ler_barragens', { p_busca: '', p_limite: 500, p_offset: 0 });
  if (!barRes.error && Array.isArray(barRes.data)) {
    for (const b of barRes.data as Record<string, any>[]) {
      const bId = pickField(b, [/^id$/i, /^barragem_id$/i]);
      if (bId) barragensMap[bId] = b;
    }
  }

  // 1. Vínculos RT-Barragem via RPC canônica e tabela
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

  // 2. Eventual tabela dedicada de ARTs no Administra (arts / rt_arts / arts_rts / responsaveis_tecnicos_arts)
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

  // 3. Campos de ART no próprio registro do RT (rts / administra_responsaveis_tecnicos)
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

async function saveArtForRtServer(
  client: SupabaseClient,
  tables: Record<string, TableSchemaInfo>,
  rpcs: Set<string>,
  params: {
    rtId: string;
    art: string;
    barragemId?: string | null;
    atividade?: string | null;
    observacao?: string | null;
    userId: string;
    userName: string;
  }
): Promise<
  | { ok: true; artItem: RtArtVinculo; savedTarget: string }
  | { ok: false; status: number; code: string; error: string }
> {
  const cleanArt = params.art.trim();
  const cleanBarragemId = params.barragemId?.trim() || null;
  const cleanAtiv = params.atividade?.trim() || null;
  const cleanObs = params.observacao?.trim() || null;

  if (!params.rtId || cleanArt.length < 2) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_ART_PAYLOAD',
      error: 'Informe o RT e um número de ART válido.',
    };
  }

  // 1. Tenta RPCs de escrita caso existam no Administra
  const rpcCandidates: Array<{ name: string; args: Record<string, unknown> }> = [
    {
      name: 'csb_vincular_art_rt',
      args: {
        p_rt_id: params.rtId,
        p_art: cleanArt,
        p_barragem_id: cleanBarragemId,
        p_atividade: cleanAtiv,
        p_observacao: cleanObs,
        p_sistema_origem: 'CLASSIFICA_CSB',
        p_user_id: params.userId,
        p_user_name: params.userName,
      },
    },
    {
      name: 'csb_salvar_art_rt',
      args: {
        p_rt_id: params.rtId,
        p_art: cleanArt,
        p_barragem_id: cleanBarragemId,
        p_atividade: cleanAtiv,
        p_observacao: cleanObs,
        p_sistema_origem: 'CLASSIFICA_CSB',
        p_user_name: params.userName,
      },
    },
    {
      name: 'administra_salvar_art_rt',
      args: {
        p_rt_id: params.rtId,
        p_art: cleanArt,
        p_barragem_id: cleanBarragemId,
        p_atividade: cleanAtiv,
        p_observacao: cleanObs,
      },
    },
    ...(cleanBarragemId
      ? [
          {
            name: 'csb_vincular_rt_barragem',
            args: {
              p_rt_id: params.rtId,
              p_barragem_id: cleanBarragemId,
              p_art: cleanArt,
            },
          },
        ]
      : []),
  ];

  for (const candidate of rpcCandidates) {
    if (rpcs.size > 0 && !rpcs.has(candidate.name)) continue;
    const rpcRes = await client.rpc(candidate.name, candidate.args);
    if (!rpcRes.error) {
      const row = (Array.isArray(rpcRes.data) ? rpcRes.data[0] : rpcRes.data) as Record<
        string,
        any
      > | null;
      return {
        ok: true,
        savedTarget: `rpc:${candidate.name}`,
        artItem: {
          id: pickField(row, [/^id$/i]) || `art_${params.rtId}_${cleanArt}`,
          art: cleanArt,
          rt_id: params.rtId,
          barragem_id: cleanBarragemId,
          atividade: cleanAtiv,
          observacao: cleanObs,
          origem: 'vinculo',
        },
      };
    }
  }

  // 2. Verifica tabela dedicada de ARTs (se existir)
  const artTableCandidates = ['arts', 'rt_arts', 'arts_rts', 'responsaveis_tecnicos_arts', 'rts_arts'];
  for (const tblName of artTableCandidates) {
    const schema = tables[tblName];
    if (Object.keys(tables).length > 0 && !schema?.exists) continue;

    const cols = schema?.columns || new Set<string>();
    const rtCol = pickColumnName(cols, ['rt_id', 'responsavel_tecnico_id', 'id_rt']) || 'rt_id';
    const artCol =
      pickColumnName(cols, ['numero_art', 'art', 'art_numero', 'num_art', 'numero', 'codigo_art']) ||
      'numero_art';
    const barCol = pickColumnName(cols, ['barragem_id', 'id_barragem']);
    const ativCol = pickColumnName(cols, ['atividade', 'funcao', 'tipo', 'descricao_atividade']);
    const obsCol = pickColumnName(cols, ['observacao', 'observacoes', 'descricao']);

    // Evita duplicata
    const existingRes = await client
      .from(tblName)
      .select('*')
      .eq(rtCol, params.rtId)
      .eq(artCol, cleanArt)
      .maybeSingle();

    if (!existingRes.error && existingRes.data) {
      const row = existingRes.data as Record<string, any>;
      return {
        ok: true,
        savedTarget: tblName,
        artItem: {
          id: pickField(row, [/^id$/i]) || `art_${params.rtId}_${cleanArt}`,
          art: cleanArt,
          rt_id: params.rtId,
          barragem_id: pickField(row, [/^barragem_id$/i]) || cleanBarragemId,
          atividade: pickField(row, [/^atividade$/i, /^funcao$/i, /^tipo$/i]) || cleanAtiv,
          observacao: pickField(row, [/^observacao$/i, /^observacoes$/i, /^descricao$/i]) || cleanObs,
          created_at: pickField(row, [/^created_at$/i]),
          origem: 'arts',
        },
      };
    }

    const insertRow: Record<string, unknown> = {
      [rtCol]: params.rtId,
      [artCol]: cleanArt,
    };
    if (barCol && cleanBarragemId) insertRow[barCol] = cleanBarragemId;
    if (ativCol && cleanAtiv) insertRow[ativCol] = cleanAtiv;
    if (obsCol && cleanObs) insertRow[obsCol] = cleanObs;
    if (cols.has('sistema_origem')) insertRow.sistema_origem = 'CLASSIFICA_CSB';
    if (cols.has('created_by_user_id')) insertRow.created_by_user_id = params.userId;
    if (cols.has('created_by_name')) insertRow.created_by_name = params.userName;

    const ins = await client.from(tblName).insert(insertRow).select('*').maybeSingle();
    if (!ins.error && ins.data) {
      const row = ins.data as Record<string, any>;
      return {
        ok: true,
        savedTarget: tblName,
        artItem: {
          id: pickField(row, [/^id$/i]) || `art_${params.rtId}_${cleanArt}`,
          art: cleanArt,
          rt_id: params.rtId,
          barragem_id: cleanBarragemId,
          atividade: cleanAtiv,
          observacao: cleanObs,
          created_at: pickField(row, [/^created_at$/i]),
          origem: 'arts',
        },
      };
    }
  }

  // 3. Salva na tabela canônica de vínculos responsaveis_tecnicos_barragens
  const vincSchema = tables.responsaveis_tecnicos_barragens;
  if (!vincSchema || vincSchema.exists) {
    let cols = vincSchema?.columns || new Set<string>();
    if (cols.size === 0) {
      const probe = await client.from('responsaveis_tecnicos_barragens').select('*').limit(1);
      if (!probe.error && Array.isArray(probe.data) && probe.data[0]) {
        cols = new Set(Object.keys(probe.data[0] as Record<string, unknown>));
      }
    }

    const rtCol = pickColumnName(cols, ['rt_id', 'id_rt', 'responsavel_tecnico_id']) || 'rt_id';
    const barCol = pickColumnName(cols, ['barragem_id', 'id_barragem']) || 'barragem_id';
    const artCol =
      pickColumnName(cols, ['art', 'numero_art', 'art_numero', 'num_art', 'registro_art']) ||
      'art';
    const ativCol = pickColumnName(cols, ['atividade', 'funcao', 'tipo', 'papel']);
    const obsCol = pickColumnName(cols, ['observacao', 'observacoes', 'descricao']);

    // Verifica se já existe vínculo com essa ART
    const { data: existingLinks } = await client
      .from('responsaveis_tecnicos_barragens')
      .select('*')
      .eq(rtCol, params.rtId);

    const rows = Array.isArray(existingLinks) ? (existingLinks as Record<string, any>[]) : [];
    const exactMatch = rows.find((r) => {
      const rowArt = pickField(r, [/^art$/i, /^numero_art$/i, /^art_numero$/i, /^num_art$/i]);
      const rowBar = pickField(r, [/^barragem_id$/i, /^id_barragem$/i]);
      return (
        rowArt?.toUpperCase() === cleanArt.toUpperCase() &&
        (!cleanBarragemId || !rowBar || rowBar === cleanBarragemId)
      );
    });

    if (exactMatch) {
      return {
        ok: true,
        savedTarget: 'responsaveis_tecnicos_barragens',
        artItem: {
          id: pickField(exactMatch, [/^id$/i]) || `vinc_${params.rtId}_${cleanArt}`,
          art: cleanArt,
          rt_id: params.rtId,
          barragem_id: pickField(exactMatch, [/^barragem_id$/i]) || cleanBarragemId,
          atividade: cleanAtiv,
          observacao: cleanObs,
          created_at: pickField(exactMatch, [/^created_at$/i]),
          origem: 'vinculo',
        },
      };
    }

    // Se já existe vínculo para esta barragem ainda sem número de ART, atualiza
    if (cleanBarragemId) {
      const linkWithoutArt = rows.find((r) => {
        const rowBar = pickField(r, [/^barragem_id$/i, /^id_barragem$/i]);
        const rowArt = pickField(r, [/^art$/i, /^numero_art$/i, /^art_numero$/i, /^num_art$/i]);
        return rowBar === cleanBarragemId && !rowArt;
      });

      if (linkWithoutArt?.id && cols.has(artCol)) {
        const updPayload: Record<string, unknown> = { [artCol]: cleanArt };
        if (ativCol && cleanAtiv) updPayload[ativCol] = cleanAtiv;
        if (obsCol && cleanObs) updPayload[obsCol] = cleanObs;

        const upd = await client
          .from('responsaveis_tecnicos_barragens')
          .update(updPayload)
          .eq('id', linkWithoutArt.id)
          .select('*')
          .maybeSingle();

        if (!upd.error && upd.data) {
          const row = upd.data as Record<string, any>;
          return {
            ok: true,
            savedTarget: 'responsaveis_tecnicos_barragens',
            artItem: {
              id: pickField(row, [/^id$/i]) || String(linkWithoutArt.id),
              art: cleanArt,
              rt_id: params.rtId,
              barragem_id: cleanBarragemId,
              atividade: cleanAtiv,
              observacao: cleanObs,
              created_at: pickField(row, [/^created_at$/i]),
              origem: 'vinculo',
            },
          };
        }
      }
    }

    // Insere novo vínculo em responsaveis_tecnicos_barragens se a coluna de ART existir (ou tentar padrão)
    const insertVinc: Record<string, unknown> = {
      [rtCol]: params.rtId,
    };
    if (cleanBarragemId) insertVinc[barCol] = cleanBarragemId;
    if (cols.size === 0 || cols.has(artCol)) insertVinc[artCol] = cleanArt;
    if (ativCol && cleanAtiv) insertVinc[ativCol] = cleanAtiv;
    if (obsCol && cleanObs) insertVinc[obsCol] = cleanObs;
    if (cols.has('sistema_origem')) insertVinc.sistema_origem = 'CLASSIFICA_CSB';
    if (cols.has('created_by_user_id')) insertVinc.created_by_user_id = params.userId;
    if (cols.has('created_by_name')) insertVinc.created_by_name = params.userName;

    const insVinc = await client
      .from('responsaveis_tecnicos_barragens')
      .insert(insertVinc)
      .select('*')
      .maybeSingle();

    if (!insVinc.error && insVinc.data) {
      const row = insVinc.data as Record<string, any>;
      return {
        ok: true,
        savedTarget: 'responsaveis_tecnicos_barragens',
        artItem: {
          id: pickField(row, [/^id$/i]) || `vinc_${params.rtId}_${cleanArt}`,
          art: cleanArt,
          rt_id: params.rtId,
          barragem_id: pickField(row, [/^barragem_id$/i]) || cleanBarragemId,
          atividade: cleanAtiv,
          observacao: cleanObs,
          created_at: pickField(row, [/^created_at$/i]),
          origem: 'vinculo',
        },
      };
    }

    // Se falhou porque barragem_id é NOT NULL e não havia barragem selecionada, tenta gravar no RT antes de exigir barragem
    const isMissingBarragem =
      !cleanBarragemId &&
      (insVinc.error?.code === '23502' ||
        String(insVinc.error?.message || '').toLowerCase().includes('barragem_id'));

    if (!isMissingBarragem && insVinc.error) {
      // Continua para tentativa na tabela rts antes de retornar erro
    }
  }

  // 4. Fallback: grava campo `art` / `numero_art` / `arts` no próprio registro do RT (`rts` / `administra_responsaveis_tecnicos`)
  for (const rtTbl of ['rts', 'administra_responsaveis_tecnicos']) {
    const schema = tables[rtTbl];
    if (Object.keys(tables).length > 0 && !schema?.exists) continue;
    const cols = schema?.columns || new Set<string>();
    const { data: rtRow, error: rtReadErr } = await client
      .from(rtTbl)
      .select('*')
      .eq('id', params.rtId)
      .maybeSingle();

    if (rtReadErr || !rtRow) continue;
    const rowCols = cols.size > 0 ? cols : new Set(Object.keys(rtRow as Record<string, unknown>));

    if (rowCols.has('arts') && Array.isArray((rtRow as Record<string, any>).arts)) {
      const currentArts = (rtRow as Record<string, any>).arts as unknown[];
      const nextArts = [
        ...currentArts,
        {
          art: cleanArt,
          barragem_id: cleanBarragemId,
          atividade: cleanAtiv,
          observacao: cleanObs,
          created_at: new Date().toISOString(),
        },
      ];
      const upd = await client.from(rtTbl).update({ arts: nextArts }).eq('id', params.rtId);
      if (!upd.error) {
        return {
          ok: true,
          savedTarget: `${rtTbl}.arts`,
          artItem: {
            id: `rt_${params.rtId}_${cleanArt}`,
            art: cleanArt,
            rt_id: params.rtId,
            barragem_id: cleanBarragemId,
            atividade: cleanAtiv,
            observacao: cleanObs,
            origem: 'rt',
          },
        };
      }
    }

    const rtArtCol = pickColumnName(rowCols, ['art', 'numero_art', 'art_numero', 'num_art']);
    if (rtArtCol) {
      const upd = await client
        .from(rtTbl)
        .update({ [rtArtCol]: cleanArt })
        .eq('id', params.rtId);
      if (!upd.error) {
        return {
          ok: true,
          savedTarget: `${rtTbl}.${rtArtCol}`,
          artItem: {
            id: `rt_${params.rtId}_${cleanArt}`,
            art: cleanArt,
            rt_id: params.rtId,
            barragem_id: cleanBarragemId,
            atividade: cleanAtiv,
            observacao: cleanObs,
            origem: 'rt',
          },
        };
      }
    }
  }

  if (!cleanBarragemId) {
    return {
      ok: false,
      status: 422,
      code: 'BARRAGEM_REQUIRED_FOR_ART_LINK',
      error:
        'No schema atual do Administra Barragens, selecione primeiro uma barragem da base para vincular e salvar a nova ART do RT.',
    };
  }

  return {
    ok: false,
    status: 500,
    code: 'ART_SAVE_FAILED',
    error: 'Não foi possível salvar a ART vinculada ao RT no Administra Barragens.',
  };
}

async function saveRtServer(
  client: SupabaseClient,
  tables: Record<string, TableSchemaInfo>,
  rpcs: Set<string>,
  params: {
    nome: string;
    cpf?: string | null;
    registro_profissional?: string | null;
    email?: string | null;
    telefone?: string | null;
    art?: string | null;
    barragemId?: string | null;
    userId: string;
    userName: string;
  }
): Promise<
  | { ok: true; rt: Record<string, any>; artItem?: RtArtVinculo | null; artSaveWarning?: string }
  | { ok: false; status: number; code: string; error: string }
> {
  const cleanNome = params.nome.trim().replace(/\s+/g, ' ');
  const cleanCpf = params.cpf ? params.cpf.replace(/\D/g, '') : null;
  const cleanReg = params.registro_profissional
    ? params.registro_profissional.trim().replace(/\s+/g, ' ').toUpperCase()
    : null;
  const cleanEmail = params.email ? params.email.trim().toLowerCase() : null;
  const cleanTel = params.telefone ? params.telefone.trim() : null;
  const cleanArt = params.art ? params.art.trim() : null;

  if (cleanNome.length < 2) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_RT_NAME',
      error: 'Informe o nome completo do Responsável Técnico.',
    };
  }

  let savedRt: Record<string, any> | null = null;

  // 1. Tenta RPCs csb_cadastrar_rt e administra_upsert_rt se disponíveis
  const rtDados = {
    nome: cleanNome,
    cpf: cleanCpf,
    registro_profissional: cleanReg,
    email: cleanEmail,
    telefone: cleanTel,
    art: cleanArt,
  };

  if (rpcs.size === 0 || rpcs.has('csb_cadastrar_rt')) {
    const csbRes = await client.rpc('csb_cadastrar_rt', {
      p_id: null,
      p_dados: rtDados,
      p_user_id: params.userId,
      p_user_name: params.userName,
      p_sistema_origem: 'CLASSIFICA_CSB',
    });
    if (!csbRes.error && csbRes.data) {
      savedRt = (Array.isArray(csbRes.data) ? csbRes.data[0] : csbRes.data) as Record<string, any>;
    }
  }

  if (!savedRt && (rpcs.size === 0 || rpcs.has('administra_upsert_rt'))) {
    const rpcRes = await client.rpc('administra_upsert_rt', {
      p_id: null,
      p_sistema_solicitante: 'CLASSIFICA_CSB',
      p_user_id: params.userId,
      p_user_name: params.userName,
      p_dados: rtDados,
    });
    if (!rpcRes.error && rpcRes.data) {
      savedRt = (Array.isArray(rpcRes.data) ? rpcRes.data[0] : rpcRes.data) as Record<string, any>;
    }
  }

  // 2. Insere/reutiliza diretamente nas tabelas canônicas `rts` ou `administra_responsaveis_tecnicos`
  if (!savedRt) {
    for (const rtTbl of ['rts', 'administra_responsaveis_tecnicos']) {
      const schema = tables[rtTbl];
      if (Object.keys(tables).length > 0 && !schema?.exists) continue;

      let cols = schema?.columns || new Set<string>();
      if (cols.size === 0) {
        const probe = await client.from(rtTbl).select('*').limit(1);
        if (probe.error) continue;
        if (Array.isArray(probe.data) && probe.data[0]) {
          cols = new Set(Object.keys(probe.data[0] as Record<string, unknown>));
        }
      }

      const nomeCol = pickColumnName(cols, ['nome', 'rt_nome', 'nome_completo']) || 'nome';
      const regCol = pickColumnName(cols, [
        'registro_profissional',
        'crea',
        'registro',
        'conselho_registro',
      ]);
      const cpfCol = pickColumnName(cols, ['cpf', 'cpf_cnpj', 'documento']);
      const emailCol = pickColumnName(cols, ['email', 'e_mail']);
      const telCol = pickColumnName(cols, ['telefone', 'celular', 'fone']);
      const artCol = pickColumnName(cols, ['art', 'numero_art', 'art_numero']);

      // Verifica se já existe por registro profissional, CPF ou nome
      if (regCol && cleanReg) {
        const byReg = await client
          .from(rtTbl)
          .select('*')
          .ilike(regCol, cleanReg)
          .limit(1)
          .maybeSingle();
        if (!byReg.error && byReg.data) {
          savedRt = byReg.data as Record<string, any>;
          break;
        }
      }
      if (!savedRt && cpfCol && cleanCpf) {
        const byCpf = await client
          .from(rtTbl)
          .select('*')
          .eq(cpfCol, cleanCpf)
          .limit(1)
          .maybeSingle();
        if (!byCpf.error && byCpf.data) {
          savedRt = byCpf.data as Record<string, any>;
          break;
        }
      }
      if (!savedRt && cleanNome) {
        const byNome = await client
          .from(rtTbl)
          .select('*')
          .ilike(nomeCol, cleanNome)
          .limit(1)
          .maybeSingle();
        if (!byNome.error && byNome.data) {
          savedRt = byNome.data as Record<string, any>;
          break;
        }
      }

      const payload: Record<string, unknown> = { [nomeCol]: cleanNome };
      if (regCol && cleanReg) payload[regCol] = cleanReg;
      if (cpfCol && cleanCpf) payload[cpfCol] = cleanCpf;
      if (emailCol && cleanEmail) payload[emailCol] = cleanEmail;
      if (telCol && cleanTel) payload[telCol] = cleanTel;
      if (artCol && cleanArt) payload[artCol] = cleanArt;
      if (cols.has('sistema_origem')) payload.sistema_origem = 'CLASSIFICA_CSB';
      if (cols.has('created_by_user_id')) payload.created_by_user_id = params.userId;
      if (cols.has('created_by_name')) payload.created_by_name = params.userName;

      const ins = await client.from(rtTbl).insert(payload).select('*').maybeSingle();
      if (!ins.error && ins.data) {
        savedRt = ins.data as Record<string, any>;
        break;
      }
    }
  }

  if (!savedRt) {
    return {
      ok: false,
      status: 500,
      code: 'RT_SAVE_FAILED',
      error: 'Não foi possível cadastrar o Responsável Técnico no Administra Barragens.',
    };
  }

  const rtId = pickField(savedRt, [/^id$/i, /^rt_id$/i, /^id_rt$/i]) || '';
  let artItem: RtArtVinculo | null = null;
  let artSaveWarning: string | undefined;

  if (cleanArt && rtId) {
    const artRes = await saveArtForRtServer(client, tables, rpcs, {
      rtId,
      art: cleanArt,
      barragemId: params.barragemId || null,
      userId: params.userId,
      userName: params.userName,
    });
    if (artRes.ok) {
      artItem = artRes.artItem;
    } else {
      artSaveWarning = artRes.error;
    }
  }

  return { ok: true, rt: savedRt, artItem, artSaveWarning };
}

function parseGmsDecimalServer(raw?: string | number | null): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const text = String(raw || '').trim();
  if (!text) return null;

  const gmsMatch = text.match(/(-?\d+)\s*[°º]\s*(\d+)\s*['´’′"]\s*(\d+(?:[.,]\d+)?)/);
  if (gmsMatch) {
    const degAbs = Math.abs(parseFloat(gmsMatch[1]));
    const min = parseFloat(gmsMatch[2]);
    const sec = parseFloat(gmsMatch[3].replace(',', '.'));
    if (Number.isFinite(degAbs) && Number.isFinite(min) && Number.isFinite(sec)) {
      const sign = gmsMatch[1].startsWith('-') || /[swSW]/.test(text) ? -1 : 1;
      return sign * (degAbs + min / 60 + sec / 3600);
    }
  }

  const normalized = text.replace(',', '.');
  if (/^-?\d+(\.\d+)?$/.test(normalized)) {
    const val = parseFloat(normalized);
    return Number.isFinite(val) ? val : null;
  }
  return null;
}

function normalizeGmsServer(rawGms?: string | null, decimalFallback?: number | null): string | null {
  const text = String(rawGms || '').trim();
  const dec =
    typeof decimalFallback === 'number' && Number.isFinite(decimalFallback)
      ? decimalFallback
      : parseGmsDecimalServer(text);

  if (dec !== null && Number.isFinite(dec)) {
    const abs = Math.abs(dec);
    const deg = Math.floor(abs);
    const minFloat = (abs - deg) * 60;
    let min = Math.floor(minFloat);
    let sec = (minFloat - min) * 60;
    if (sec >= 59.995) {
      sec = 0;
      min += 1;
    }
    const finalDeg = min >= 60 ? deg + 1 : deg;
    const finalMin = min >= 60 ? 0 : min;
    const prefix = dec < 0 ? '-' : '';
    const secStr = sec.toFixed(2).replace('.', ',').padStart(5, '0');
    return `${prefix}${String(finalDeg).padStart(2, '0')}°${String(finalMin).padStart(2, '0')}"${secStr}'`;
  }

  return text || null;
}

async function saveEmpreendedorServer(
  client: SupabaseClient,
  tables: Record<string, TableSchemaInfo>,
  rpcs: Set<string>,
  params: {
    id?: string | null;
    cpf_cnpj?: string | null;
    tipo_pessoa?: string | null;
    razao_social: string;
    nome_fantasia?: string | null;
    email?: string | null;
    telefone?: string | null;
    endereco?: string | null;
    municipio?: string | null;
    num_car?: string | null;
    userId: string;
    userName: string;
  }
): Promise<
  | { ok: true; empreendedor: Record<string, any> }
  | { ok: false; status: number; code: string; error: string }
> {
  const cleanId = params.id?.trim() || null;
  const cleanRazao = params.razao_social.trim().replace(/\s+/g, ' ');
  const cpfDigits = (params.cpf_cnpj || '').replace(/\D/g, '');
  const cleanFantasia = params.nome_fantasia ? params.nome_fantasia.trim().replace(/\s+/g, ' ') : null;
  const cleanEmail = params.email ? params.email.trim().toLowerCase() : null;
  const cleanTel = params.telefone ? params.telefone.trim() : null;
  const cleanEndereco = params.endereco ? params.endereco.trim().replace(/\s+/g, ' ') : null;
  const cleanMunicipio = params.municipio ? params.municipio.trim().replace(/\s+/g, ' ') : null;
  const cleanCar = params.num_car ? params.num_car.trim().replace(/\s+/g, ' ') : null;
  const tipoPessoa =
    params.tipo_pessoa === 'PJ' || params.tipo_pessoa === 'PF'
      ? params.tipo_pessoa
      : cpfDigits.length === 14
        ? 'PJ'
        : 'PF';

  if (cleanRazao.length < 2) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_EMPREENDEDOR_NAME',
      error: 'Informe o nome ou razão social do empreendedor.',
    };
  }

  if (cpfDigits.length > 0 && cpfDigits.length !== 11 && cpfDigits.length !== 14) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_CPF_CNPJ',
      error: 'CPF/CNPJ inválido. Informe 11 dígitos (CPF) ou 14 dígitos (CNPJ), ou deixe em branco caso indisponível.',
    };
  }

  const dadosPayload = {
    cpf_cnpj: cpfDigits || null,
    tipo_pessoa: tipoPessoa,
    razao_social: cleanRazao,
    nome_fantasia: cleanFantasia,
    email: cleanEmail,
    telefone: cleanTel,
    endereco: cleanEndereco,
    municipio: cleanMunicipio,
    num_car: cleanCar,
  };

  let savedEmp: Record<string, any> | null = null;

  if (rpcs.size === 0 || rpcs.has('csb_cadastrar_empreendedor')) {
    const csbRes = await client.rpc('csb_cadastrar_empreendedor', {
      p_id: cleanId,
      p_dados: dadosPayload,
      p_user_id: params.userId,
      p_user_name: params.userName,
      p_sistema_origem: 'CLASSIFICA_CSB',
    });
    if (!csbRes.error && csbRes.data) {
      savedEmp = (Array.isArray(csbRes.data) ? csbRes.data[0] : csbRes.data) as Record<string, any>;
    }
  }

  if (!savedEmp && (rpcs.size === 0 || rpcs.has('administra_upsert_empreendedor'))) {
    const upsertRes = await client.rpc('administra_upsert_empreendedor', {
      p_id: cleanId,
      p_sistema_solicitante: 'CLASSIFICA_CSB',
      p_user_id: params.userId,
      p_user_name: params.userName,
      p_dados: dadosPayload,
    });
    if (!upsertRes.error && upsertRes.data) {
      savedEmp = (Array.isArray(upsertRes.data) ? upsertRes.data[0] : upsertRes.data) as Record<string, any>;
    }
  }

  if (!savedEmp) {
    for (const empTbl of ['empreendedores', 'administra_empreendedores']) {
      const schema = tables[empTbl];
      if (Object.keys(tables).length > 0 && !schema?.exists) continue;

      let cols = schema?.columns || new Set<string>();
      if (cols.size === 0) {
        const probe = await client.from(empTbl).select('*').limit(1);
        if (probe.error) continue;
        if (Array.isArray(probe.data) && probe.data[0]) {
          cols = new Set(Object.keys(probe.data[0] as Record<string, unknown>));
        }
      }

      const razaoCol = pickColumnName(cols, ['razao_social', 'nome_razao', 'nome', 'nome_empreendedor']) || 'razao_social';
      const nomeCol = pickColumnName(cols, ['nome', 'nome_completo']);
      const docCol = pickColumnName(cols, ['cpf_cnpj', 'cnpj_cpf', 'documento']);
      const tipoCol = pickColumnName(cols, ['tipo_pessoa']);
      const fanCol = pickColumnName(cols, ['nome_fantasia']);
      const emailCol = pickColumnName(cols, ['email', 'e_mail']);
      const telCol = pickColumnName(cols, ['telefone', 'celular', 'fone']);
      const endCol = pickColumnName(cols, ['endereco', 'logradouro', 'localizacao']);
      const munCol = pickColumnName(cols, ['municipio', 'cidade']);
      const carCol = pickColumnName(cols, ['num_car', 'car', 'numero_car']);

      if (cleanId) {
        const byId = await client.from(empTbl).select('*').eq('id', cleanId).limit(1).maybeSingle();
        if (!byId.error && byId.data) {
          savedEmp = byId.data as Record<string, any>;
          break;
        }
      }

      if (!savedEmp && docCol && cpfDigits) {
        const byDoc = await client.from(empTbl).select('*').ilike(docCol, `%${cpfDigits}%`).limit(5);
        if (!byDoc.error && Array.isArray(byDoc.data)) {
          const exactDoc = (byDoc.data as Record<string, any>[]).find(
            (r) => String(r[docCol] || '').replace(/\D/g, '') === cpfDigits
          );
          if (exactDoc) {
            savedEmp = exactDoc;
            break;
          }
        }
      }

      if (!savedEmp) {
        let q = client.from(empTbl).select('*').ilike(razaoCol, cleanRazao);
        if (munCol && cleanMunicipio) q = q.ilike(munCol, cleanMunicipio);
        const byName = await q.limit(1).maybeSingle();
        if (!byName.error && byName.data) {
          savedEmp = byName.data as Record<string, any>;
          break;
        }
      }

      const insertRow: Record<string, unknown> = { [razaoCol]: cleanRazao };
      if (nomeCol && nomeCol !== razaoCol) insertRow[nomeCol] = cleanRazao;
      if (docCol && cpfDigits) insertRow[docCol] = cpfDigits;
      if (tipoCol) insertRow[tipoCol] = tipoPessoa;
      if (fanCol && cleanFantasia) insertRow[fanCol] = cleanFantasia;
      if (emailCol && cleanEmail) insertRow[emailCol] = cleanEmail;
      if (telCol && cleanTel) insertRow[telCol] = cleanTel;
      if (endCol && cleanEndereco) insertRow[endCol] = cleanEndereco;
      if (munCol && cleanMunicipio) insertRow[munCol] = cleanMunicipio;
      if (carCol && cleanCar) insertRow[carCol] = cleanCar;
      if (cols.has('sistema_origem')) insertRow.sistema_origem = 'CLASSIFICA_CSB';
      if (cols.has('created_by_user_id')) insertRow.created_by_user_id = params.userId;
      if (cols.has('created_by_name')) insertRow.created_by_name = params.userName;

      const ins = await client.from(empTbl).insert(insertRow).select('*').maybeSingle();
      if (!ins.error && ins.data) {
        savedEmp = ins.data as Record<string, any>;
        break;
      }
    }
  }

  if (!savedEmp) {
    return {
      ok: false,
      status: 500,
      code: 'EMPREENDEDOR_SAVE_FAILED',
      error: 'Não foi possível cadastrar o empreendedor no Administra Barragens.',
    };
  }

  return { ok: true, empreendedor: savedEmp };
}

async function saveBarragemServer(
  client: SupabaseClient,
  tables: Record<string, TableSchemaInfo>,
  rpcs: Set<string>,
  params: {
    id?: string | null;
    empreendedor_id?: string | null;
    snisb?: string | null;
    nome: string;
    municipio?: string | null;
    upg?: string | null;
    sub_bacia?: string | null;
    curso_agua?: string | null;
    zona?: string | null;
    localizacao?: string | null;
    lat_gms?: string | null;
    long_gms?: string | null;
    lat_decimal?: number | null;
    long_decimal?: number | null;
    altura_maxima?: string | null;
    comprimento_coroamento?: string | null;
    largura_coroamento?: string | null;
    volume_nmo?: string | null;
    volume_nmm?: string | null;
    tipo_estrutural?: string | null;
    tipo_fundacao?: string | null;
    finalidade?: string | null;
    situacao?: string | null;
    dpa_atual?: string | null;
    cri_atual?: string | null;
    enquadramento_pnsb?: boolean | null;
    userId: string;
    userName: string;
  }
): Promise<
  | { ok: true; barragem: Record<string, any> }
  | { ok: false; status: number; code: string; error: string }
> {
  const cleanId = params.id?.trim() || null;
  const cleanNome = params.nome.trim().replace(/\s+/g, ' ');
  const cleanSnisb = params.snisb ? params.snisb.trim().toUpperCase() : null;
  const cleanMunicipio = params.municipio ? params.municipio.trim().replace(/\s+/g, ' ') : '';
  const cleanEmpId = params.empreendedor_id?.trim() || null;
  const latDec = parseGmsDecimalServer(params.lat_decimal ?? params.lat_gms);
  const longDec = parseGmsDecimalServer(params.long_decimal ?? params.long_gms);
  const latGms = normalizeGmsServer(params.lat_gms, latDec);
  const longGms = normalizeGmsServer(params.long_gms, longDec);

  if (cleanNome.length < 2) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_BARRAGEM_NAME',
      error: 'Informe o nome da barragem ou empreendimento.',
    };
  }

  const dadosPayload = {
    empreendedor_id: cleanEmpId,
    snisb: cleanSnisb,
    nome: cleanNome,
    municipio: cleanMunicipio,
    upg: params.upg ? params.upg.trim().replace(/\s+/g, ' ') : null,
    sub_bacia: params.sub_bacia ? params.sub_bacia.trim().replace(/\s+/g, ' ') : null,
    curso_agua: params.curso_agua ? params.curso_agua.trim().replace(/\s+/g, ' ') : null,
    zona: params.zona?.trim() || 'Rural',
    localizacao: params.localizacao ? params.localizacao.trim().replace(/\s+/g, ' ') : null,
    lat_gms: latGms,
    long_gms: longGms,
    lat_decimal: latDec,
    long_decimal: longDec,
    altura_maxima: params.altura_maxima?.trim() || null,
    comprimento_coroamento: params.comprimento_coroamento?.trim() || null,
    largura_coroamento: params.largura_coroamento?.trim() || null,
    volume_nmo: params.volume_nmo?.trim() || null,
    volume_nmm: params.volume_nmm?.trim() || null,
    tipo_estrutural: params.tipo_estrutural?.trim() || null,
    tipo_fundacao: params.tipo_fundacao?.trim() || null,
    finalidade: params.finalidade?.trim() || null,
    situacao: params.situacao?.trim() || null,
    dpa_atual: params.dpa_atual?.trim() || null,
    cri_atual: params.cri_atual?.trim() || null,
    enquadramento_pnsb: typeof params.enquadramento_pnsb === 'boolean' ? params.enquadramento_pnsb : null,
  };

  let savedBar: Record<string, any> | null = null;

  if (rpcs.size === 0 || rpcs.has('csb_cadastrar_barragem')) {
    const csbRes = await client.rpc('csb_cadastrar_barragem', {
      p_id: cleanId,
      p_dados: dadosPayload,
      p_user_id: params.userId,
      p_user_name: params.userName,
      p_sistema_origem: 'CLASSIFICA_CSB',
    });
    if (!csbRes.error && csbRes.data) {
      savedBar = (Array.isArray(csbRes.data) ? csbRes.data[0] : csbRes.data) as Record<string, any>;
    }
  }

  if (!savedBar && (rpcs.size === 0 || rpcs.has('administra_upsert_barragem'))) {
    const upsertRes = await client.rpc('administra_upsert_barragem', {
      p_id: cleanId,
      p_sistema_solicitante: 'CLASSIFICA_CSB',
      p_user_id: params.userId,
      p_user_name: params.userName,
      p_dados: dadosPayload,
    });
    if (!upsertRes.error && upsertRes.data) {
      savedBar = (Array.isArray(upsertRes.data) ? upsertRes.data[0] : upsertRes.data) as Record<string, any>;
    }
  }

  if (!savedBar) {
    for (const barTbl of ['barragens', 'administra_barragens']) {
      const schema = tables[barTbl];
      if (Object.keys(tables).length > 0 && !schema?.exists) continue;

      let cols = schema?.columns || new Set<string>();
      if (cols.size === 0) {
        const probe = await client.from(barTbl).select('*').limit(1);
        if (probe.error) continue;
        if (Array.isArray(probe.data) && probe.data[0]) {
          cols = new Set(Object.keys(probe.data[0] as Record<string, unknown>));
        }
      }

      const nomeCol = pickColumnName(cols, ['nome', 'barragem_nome', 'nome_barragem']) || 'nome';
      const empCol = pickColumnName(cols, ['empreendedor_id', 'id_empreendedor']);
      const snisbCol = pickColumnName(cols, ['snisb', 'codigo_snisb']);
      const munCol = pickColumnName(cols, ['municipio', 'cidade']);
      const upgCol = pickColumnName(cols, ['upg']);
      const subCol = pickColumnName(cols, ['sub_bacia', 'bacia']);
      const cursoCol = pickColumnName(cols, ['curso_agua', 'curso_dagua']);
      const zonaCol = pickColumnName(cols, ['zona']);
      const locCol = pickColumnName(cols, ['localizacao', 'endereco']);
      const latGmsCol = pickColumnName(cols, ['lat_gms', 'latitude_gms', 'latitude', 'lat']);
      const longGmsCol = pickColumnName(cols, ['long_gms', 'longitude_gms', 'longitude', 'long']);
      const latDecCol = pickColumnName(cols, ['lat_decimal']);
      const longDecCol = pickColumnName(cols, ['long_decimal']);

      if (cleanId) {
        const byId = await client.from(barTbl).select('*').eq('id', cleanId).limit(1).maybeSingle();
        if (!byId.error && byId.data) {
          savedBar = byId.data as Record<string, any>;
          break;
        }
      }

      if (!savedBar && snisbCol && cleanSnisb) {
        const bySnisb = await client.from(barTbl).select('*').ilike(snisbCol, cleanSnisb).limit(1).maybeSingle();
        if (!bySnisb.error && bySnisb.data) {
          savedBar = bySnisb.data as Record<string, any>;
          break;
        }
      }

      if (!savedBar) {
        let q = client.from(barTbl).select('*').ilike(nomeCol, cleanNome);
        if (munCol && cleanMunicipio) q = q.ilike(munCol, cleanMunicipio);
        if (empCol && cleanEmpId) q = q.eq(empCol, cleanEmpId);
        const byName = await q.limit(1).maybeSingle();
        if (!byName.error && byName.data) {
          savedBar = byName.data as Record<string, any>;
          break;
        }
      }

      const insertRow: Record<string, unknown> = { [nomeCol]: cleanNome };
      if (empCol && cleanEmpId) insertRow[empCol] = cleanEmpId;
      if (snisbCol && cleanSnisb) insertRow[snisbCol] = cleanSnisb;
      if (munCol) insertRow[munCol] = cleanMunicipio;
      if (upgCol && dadosPayload.upg) insertRow[upgCol] = dadosPayload.upg;
      if (subCol && dadosPayload.sub_bacia) insertRow[subCol] = dadosPayload.sub_bacia;
      if (cursoCol && dadosPayload.curso_agua) insertRow[cursoCol] = dadosPayload.curso_agua;
      if (zonaCol && dadosPayload.zona) insertRow[zonaCol] = dadosPayload.zona;
      if (locCol && dadosPayload.localizacao) insertRow[locCol] = dadosPayload.localizacao;
      if (latGmsCol && latGms) insertRow[latGmsCol] = latGms;
      if (longGmsCol && longGms) insertRow[longGmsCol] = longGms;
      if (latDecCol && latDec !== null) insertRow[latDecCol] = latDec;
      if (longDecCol && longDec !== null) insertRow[longDecCol] = longDec;
      if (cols.has('altura_maxima') && dadosPayload.altura_maxima) insertRow.altura_maxima = dadosPayload.altura_maxima;
      if (cols.has('comprimento_coroamento') && dadosPayload.comprimento_coroamento) {
        insertRow.comprimento_coroamento = dadosPayload.comprimento_coroamento;
      }
      if (cols.has('largura_coroamento') && dadosPayload.largura_coroamento) {
        insertRow.largura_coroamento = dadosPayload.largura_coroamento;
      }
      if (cols.has('volume_nmo') && dadosPayload.volume_nmo) insertRow.volume_nmo = dadosPayload.volume_nmo;
      if (cols.has('volume_nmm') && dadosPayload.volume_nmm) insertRow.volume_nmm = dadosPayload.volume_nmm;
      if (cols.has('tipo_estrutural') && dadosPayload.tipo_estrutural) insertRow.tipo_estrutural = dadosPayload.tipo_estrutural;
      if (cols.has('tipo_fundacao') && dadosPayload.tipo_fundacao) insertRow.tipo_fundacao = dadosPayload.tipo_fundacao;
      if (cols.has('finalidade') && dadosPayload.finalidade) insertRow.finalidade = dadosPayload.finalidade;
      if (cols.has('situacao') && dadosPayload.situacao) insertRow.situacao = dadosPayload.situacao;
      if (cols.has('dpa_atual') && dadosPayload.dpa_atual) insertRow.dpa_atual = dadosPayload.dpa_atual;
      if (cols.has('cri_atual') && dadosPayload.cri_atual) insertRow.cri_atual = dadosPayload.cri_atual;
      if (cols.has('enquadramento_pnsb') && dadosPayload.enquadramento_pnsb !== null) {
        insertRow.enquadramento_pnsb = dadosPayload.enquadramento_pnsb;
      }
      if (cols.has('sistema_origem')) insertRow.sistema_origem = 'CLASSIFICA_CSB';
      if (cols.has('created_by_user_id')) insertRow.created_by_user_id = params.userId;
      if (cols.has('created_by_name')) insertRow.created_by_name = params.userName;

      const ins = await client.from(barTbl).insert(insertRow).select('*').maybeSingle();
      if (!ins.error && ins.data) {
        savedBar = ins.data as Record<string, any>;
        break;
      }
    }
  }

  if (!savedBar) {
    return {
      ok: false,
      status: 500,
      code: 'BARRAGEM_SAVE_FAILED',
      error: 'Não foi possível cadastrar a barragem no Administra Barragens.',
    };
  }

  return { ok: true, barragem: savedBar };
}

export default async function handler(req: NodeReq, res: NodeRes): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, {
      ok: false,
      code: 'METHOD_NOT_ALLOWED',
      error: 'Método não permitido. Use POST.',
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

  const session = await verifyClassificaWriteSession(token);
  if (session.ok === false) {
    sendJson(res, session.status, {
      ok: false,
      code: session.code,
      error: session.error,
    });
    return;
  }

  const adminCheck = getAdministraServerClient(session.classificaUrl);
  if (adminCheck.ok === false) {
    sendJson(res, adminCheck.status, {
      ok: false,
      configured: false,
      code: adminCheck.code,
      error: adminCheck.error,
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

  const action = body.action as AdministraEscritaAction;
  if (typeof action !== 'string' || !ALLOWED_ACTIONS.has(action)) {
    sendJson(res, 400, { ok: false, code: 'INVALID_ACTION', error: 'Ação não permitida.' });
    return;
  }

  const { tables, rpcs } = await fetchAdministraOpenApi(
    adminCheck.url,
    adminCheck.secretKey,
    adminCheck.keyFormat
  );

  if (action === 'listar_arts_rt') {
    const rtId = typeof body.rtId === 'string' ? body.rtId.trim() : '';
    if (!rtId) {
      sendJson(res, 400, { ok: false, code: 'MISSING_RT_ID', error: 'Informe o rtId.' });
      return;
    }
    const items = await listArtsForRtServer(adminCheck.client, rtId, tables);
    sendJson(res, 200, { ok: true, configured: true, items });
    return;
  }

  if (action === 'salvar_art_rt') {
    const rtId = typeof body.rtId === 'string' ? body.rtId.trim() : '';
    const art = typeof body.art === 'string' ? body.art.trim() : '';
    const barragemId = typeof body.barragemId === 'string' ? body.barragemId.trim() : null;
    const atividade = typeof body.atividade === 'string' ? body.atividade.trim() : null;
    const observacao = typeof body.observacao === 'string' ? body.observacao.trim() : null;

    const saveRes = await saveArtForRtServer(adminCheck.client, tables, rpcs, {
      rtId,
      art,
      barragemId,
      atividade,
      observacao,
      userId: session.userId,
      userName: session.userName,
    });

    if (saveRes.ok === false) {
      sendJson(res, saveRes.status, {
        ok: false,
        configured: true,
        code: saveRes.code,
        error: saveRes.error,
      });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      configured: true,
      artItem: saveRes.artItem,
      savedTarget: saveRes.savedTarget,
    });
    return;
  }

  if (action === 'salvar_empreendedor') {
    const empRes = await saveEmpreendedorServer(adminCheck.client, tables, rpcs, {
      id: typeof body.id === 'string' ? body.id : null,
      cpf_cnpj: typeof body.cpf_cnpj === 'string' ? body.cpf_cnpj : null,
      tipo_pessoa: typeof body.tipo_pessoa === 'string' ? body.tipo_pessoa : null,
      razao_social: typeof body.razao_social === 'string' ? body.razao_social : '',
      nome_fantasia: typeof body.nome_fantasia === 'string' ? body.nome_fantasia : null,
      email: typeof body.email === 'string' ? body.email : null,
      telefone: typeof body.telefone === 'string' ? body.telefone : null,
      endereco: typeof body.endereco === 'string' ? body.endereco : null,
      municipio: typeof body.municipio === 'string' ? body.municipio : null,
      num_car: typeof body.num_car === 'string' ? body.num_car : null,
      userId: session.userId,
      userName: session.userName,
    });

    if (empRes.ok === false) {
      sendJson(res, empRes.status, {
        ok: false,
        configured: true,
        code: empRes.code,
        error: empRes.error,
      });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      configured: true,
      empreendedor: empRes.empreendedor,
    });
    return;
  }

  if (action === 'salvar_barragem') {
    const barRes = await saveBarragemServer(adminCheck.client, tables, rpcs, {
      id: typeof body.id === 'string' ? body.id : null,
      empreendedor_id: typeof body.empreendedor_id === 'string' ? body.empreendedor_id : null,
      snisb: typeof body.snisb === 'string' ? body.snisb : null,
      nome: typeof body.nome === 'string' ? body.nome : '',
      municipio: typeof body.municipio === 'string' ? body.municipio : '',
      upg: typeof body.upg === 'string' ? body.upg : null,
      sub_bacia: typeof body.sub_bacia === 'string' ? body.sub_bacia : null,
      curso_agua: typeof body.curso_agua === 'string' ? body.curso_agua : null,
      zona: typeof body.zona === 'string' ? body.zona : null,
      localizacao: typeof body.localizacao === 'string' ? body.localizacao : null,
      lat_gms: typeof body.lat_gms === 'string' ? body.lat_gms : null,
      long_gms: typeof body.long_gms === 'string' ? body.long_gms : null,
      lat_decimal: typeof body.lat_decimal === 'number' ? body.lat_decimal : null,
      long_decimal: typeof body.long_decimal === 'number' ? body.long_decimal : null,
      altura_maxima: typeof body.altura_maxima === 'string' ? body.altura_maxima : null,
      comprimento_coroamento:
        typeof body.comprimento_coroamento === 'string' ? body.comprimento_coroamento : null,
      largura_coroamento:
        typeof body.largura_coroamento === 'string' ? body.largura_coroamento : null,
      volume_nmo: typeof body.volume_nmo === 'string' ? body.volume_nmo : null,
      volume_nmm: typeof body.volume_nmm === 'string' ? body.volume_nmm : null,
      tipo_estrutural: typeof body.tipo_estrutural === 'string' ? body.tipo_estrutural : null,
      tipo_fundacao: typeof body.tipo_fundacao === 'string' ? body.tipo_fundacao : null,
      finalidade: typeof body.finalidade === 'string' ? body.finalidade : null,
      situacao: typeof body.situacao === 'string' ? body.situacao : null,
      dpa_atual: typeof body.dpa_atual === 'string' ? body.dpa_atual : null,
      cri_atual: typeof body.cri_atual === 'string' ? body.cri_atual : null,
      enquadramento_pnsb:
        typeof body.enquadramento_pnsb === 'boolean' ? body.enquadramento_pnsb : null,
      userId: session.userId,
      userName: session.userName,
    });

    if (barRes.ok === false) {
      sendJson(res, barRes.status, {
        ok: false,
        configured: true,
        code: barRes.code,
        error: barRes.error,
      });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      configured: true,
      barragem: barRes.barragem,
    });
    return;
  }

  // action === 'salvar_rt'
  const rtRes = await saveRtServer(adminCheck.client, tables, rpcs, {
    nome: typeof body.nome === 'string' ? body.nome : '',
    cpf: typeof body.cpf === 'string' ? body.cpf : null,
    registro_profissional:
      typeof body.registro_profissional === 'string' ? body.registro_profissional : null,
    email: typeof body.email === 'string' ? body.email : null,
    telefone: typeof body.telefone === 'string' ? body.telefone : null,
    art: typeof body.art === 'string' ? body.art : null,
    barragemId: typeof body.barragemId === 'string' ? body.barragemId : null,
    userId: session.userId,
    userName: session.userName,
  });

  if (rtRes.ok === false) {
    sendJson(res, rtRes.status, {
      ok: false,
      configured: true,
      code: rtRes.code,
      error: rtRes.error,
    });
    return;
  }

  sendJson(res, 200, {
    ok: true,
    configured: true,
    rt: rtRes.rt,
    artItem: rtRes.artItem || null,
    artSaveWarning: rtRes.artSaveWarning,
  });
}
