import {
  CreatePendenciaInput,
  PendenciaHistoricoRecord,
  PendenciaRecord,
  PendenciaSituacao,
  PendenciaUsuarioOption,
  SistemaOrigem,
  UpdatePendenciaInput,
  UserRole,
} from '../../types';
import { isSupabaseConfigured, supabase } from '../supabaseClient';

export const CURRENT_PENDENCIA_ORIGEM: SistemaOrigem = 'CLASSIFICA_CSB';

export const PENDENCIA_SITUACOES: PendenciaSituacao[] = [
  'aberta',
  'direcionada',
  'em_analise',
  'resolvida',
  'cancelada',
];

export const PENDENCIA_SITUACAO_LABELS: Record<PendenciaSituacao, string> = {
  aberta: 'Aberta',
  direcionada: 'Direcionada',
  em_analise: 'Em análise',
  resolvida: 'Resolvida',
  cancelada: 'Cancelada',
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface VerifiedSessionActor {
  authUserId: string;
  profileId: string;
  name: string;
  email: string;
  role: UserRole;
}

function normalizeRole(role?: string | null): UserRole {
  if (!role) return 'Visualizador';
  const lower = role.toLowerCase().trim();
  if (lower === 'administrador' || lower === 'administradora' || lower === 'admin') {
    return 'Administrador';
  }
  if (lower === 'analista') return 'Analista';
  return 'Visualizador';
}

function isProfileActive(profile: Record<string, any> | null | undefined): boolean {
  if (!profile) return false;
  if (profile.active === false) return false;
  if (profile.active === true) return true;
  const statusText = String(profile.status ?? profile.situacao ?? '').trim().toLowerCase();
  return ['ativo', 'ativa', 'active', 'aprovado', 'aprovada'].includes(statusText);
}

function cleanOptionalText(value?: string | null): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : null;
}

function cleanOptionalUuid(value: string | null | undefined, fieldLabel: string): string | null {
  const cleaned = cleanOptionalText(value);
  if (!cleaned) return null;
  if (!UUID_REGEX.test(cleaned)) {
    throw new Error(`${fieldLabel} deve ser um identificador UUID válido.`);
  }
  return cleaned;
}

export function isValidPendenciaSituacao(value: string): value is PendenciaSituacao {
  return PENDENCIA_SITUACOES.includes(value as PendenciaSituacao);
}

export function matchesActorUserId(
  candidateUserId: string | null | undefined,
  actor: Pick<VerifiedSessionActor, 'authUserId' | 'profileId'> | null | undefined
): boolean {
  if (!candidateUserId || !actor) return false;
  return candidateUserId === actor.authUserId || candidateUserId === actor.profileId;
}

async function getVerifiedSessionActor(): Promise<VerifiedSessionActor> {
  if (!isSupabaseConfigured()) {
    throw new Error('Conexão com o banco de dados não configurada neste ambiente.');
  }

  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !authUser) {
    throw new Error('Sessão expirada ou não autenticada. Faça login novamente.');
  }

  try {
    const { data, error } = await supabase.rpc('classifica_my_profile');
    if (!error && data) {
      const row = (Array.isArray(data) ? data[0] : data) as Record<string, any> | undefined;
      if (row) {
        if (!isProfileActive(row) || row.force_password_change === true) {
          throw new Error('Seu perfil está inativo ou pendente de troca de senha.');
        }
        return {
          authUserId: authUser.id,
          profileId: String(row.id || authUser.id),
          name: String(row.name || row.nome || authUser.email || 'Usuário'),
          email: String(row.email || authUser.email || ''),
          role: normalizeRole(row.role || row.papel),
        };
      }
    }
  } catch (err: any) {
    if (err instanceof Error && err.message.includes('Seu perfil')) {
      throw err;
    }
  }

  const candidates: Array<{ table: 'users' | 'user' | 'usuarios'; columns: string }> = [
    { table: 'users', columns: 'id, auth_user_id, email, name, role, active, force_password_change' },
    { table: 'users', columns: 'id, nome, email, papel, situacao, status' },
    { table: 'user', columns: 'id, nome, email, papel, situacao, status' },
    { table: 'usuarios', columns: 'id, nome, email, papel, situacao, status' },
  ];

  const verifiedEmail = authUser.email?.trim().toLowerCase();
  for (const candidate of candidates) {
    let row: Record<string, any> | null = null;

    if (candidate.columns.includes('auth_user_id')) {
      const byAuth = await supabase
        .from(candidate.table)
        .select(candidate.columns)
        .eq('auth_user_id', authUser.id)
        .maybeSingle();
      if (!byAuth.error && byAuth.data) {
        row = byAuth.data as Record<string, any>;
      }
    }

    if (!row) {
      const byId = await supabase
        .from(candidate.table)
        .select(candidate.columns)
        .eq('id', authUser.id)
        .maybeSingle();
      if (!byId.error && byId.data) {
        row = byId.data as Record<string, any>;
      }
    }

    if (!row && verifiedEmail) {
      const byEmail = await supabase
        .from(candidate.table)
        .select(candidate.columns)
        .ilike('email', verifiedEmail)
        .maybeSingle();
      if (!byEmail.error && byEmail.data) {
        row = byEmail.data as Record<string, any>;
      }
    }

    if (row) {
      if (!isProfileActive(row) || row.force_password_change === true) {
        throw new Error('Seu perfil está inativo ou pendente de troca de senha.');
      }
      return {
        authUserId: authUser.id,
        profileId: String(row.id || authUser.id),
        name: String(row.name || row.nome || authUser.email || 'Usuário'),
        email: String(row.email || authUser.email || ''),
        role: normalizeRole(row.role || row.papel),
      };
    }
  }

  throw new Error('Perfil ativo do usuário não verificado.');
}

async function fetchAuthorizedUserList(actor: VerifiedSessionActor): Promise<PendenciaUsuarioOption[]> {
  if (actor.role !== 'Administrador') {
    return [];
  }

  const { data, error } = await supabase.rpc('classifica_list_users');
  if (error) {
    throw new Error('Não foi possível carregar a lista de usuários autorizados.');
  }

  return ((data || []) as Array<Record<string, any>>).map((u) => ({
    id: String(u.id),
    authUserId: String(u.auth_user_id || u.id),
    name: String(u.name || u.email || u.username || 'Usuário'),
    email: String(u.email || u.username || ''),
    role: normalizeRole(u.role),
    setor: u.setor ? String(u.setor) : null,
    active: u.active !== false,
  }));
}

async function insertHistoricoEntries(
  entries: Array<{
    pendencia_id: string;
    acao: string;
    campo: string | null;
    valor_anterior: string | null;
    valor_novo: string | null;
    usuario_id: string;
    motivo: string | null;
  }>
): Promise<void> {
  if (entries.length === 0) return;

  const { error } = await supabase.from('pendencias_historico').insert(entries);
  if (error) {
    throw new Error(`Falha ao registrar histórico da pendência: ${error.message || 'erro de permissão'}`);
  }
}

export async function listPendencias(): Promise<{
  actor: VerifiedSessionActor;
  items: PendenciaRecord[];
}> {
  const actor = await getVerifiedSessionActor();

  const { data, error } = await supabase
    .from('pendencias')
    .select(
      'id, origem, origem_ref_id, tipo, titulo, descricao, situacao, responsavel_id, direcionado_por, direcionado_em, criado_por, tipo_referencia, referencia_id, empreendedor_id, barragem_id, resolvido_por, resolvido_em, created_at, updated_at'
    )
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(`Não foi possível carregar as pendências: ${error.message || 'acesso negado'}`);
  }

  return {
    actor,
    items: (data || []) as PendenciaRecord[],
  };
}

export async function listPendenciaHistorico(pendenciaId: string): Promise<PendenciaHistoricoRecord[]> {
  await getVerifiedSessionActor();

  const cleanId = cleanOptionalUuid(pendenciaId, 'ID da pendência');
  if (!cleanId) {
    throw new Error('ID da pendência inválido.');
  }

  const { data, error } = await supabase
    .from('pendencias_historico')
    .select('id, pendencia_id, acao, campo, valor_anterior, valor_novo, usuario_id, motivo, created_at')
    .eq('pendencia_id', cleanId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Não foi possível carregar o histórico: ${error.message || 'acesso negado'}`);
  }

  return (data || []) as PendenciaHistoricoRecord[];
}

export async function listAssignableUsersForAdmin(): Promise<PendenciaUsuarioOption[]> {
  const actor = await getVerifiedSessionActor();
  return fetchAuthorizedUserList(actor);
}

export async function createPendencia(input: CreatePendenciaInput): Promise<PendenciaRecord> {
  const actor = await getVerifiedSessionActor();

  if (actor.role === 'Visualizador') {
    throw new Error('Usuários com perfil Visualizador não têm permissão para criar pendências.');
  }

  const titulo = cleanOptionalText(input.titulo);
  const tipo = cleanOptionalText(input.tipo);
  if (!titulo || titulo.length < 3) {
    throw new Error('Informe um título com pelo menos 3 caracteres.');
  }
  if (!tipo) {
    throw new Error('Informe o tipo da pendência.');
  }

  const requestedResponsavelId = cleanOptionalText(input.responsavel_id);
  if (requestedResponsavelId && actor.role !== 'Administrador') {
    throw new Error('Usuários não administradores não podem escolher ou alterar o responsável.');
  }

  let resolvedResponsavelId: string | null = null;
  if (requestedResponsavelId) {
    const cleanRespUuid = cleanOptionalUuid(requestedResponsavelId, 'Responsável');
    const users = await fetchAuthorizedUserList(actor);
    const matchedUser = users.find(
      (u) => u.active && (u.authUserId === cleanRespUuid || u.id === cleanRespUuid)
    );
    if (!matchedUser) {
      throw new Error('O usuário selecionado para direcionamento não está ativo ou não existe.');
    }
    resolvedResponsavelId = matchedUser.authUserId;
  }

  const nowIso = new Date().toISOString();
  const initialSituacao: PendenciaSituacao = resolvedResponsavelId ? 'direcionada' : 'aberta';
  const motivoInicial = cleanOptionalText(input.motivo);

  const insertPayload = {
    origem: CURRENT_PENDENCIA_ORIGEM,
    origem_ref_id: cleanOptionalText(input.origem_ref_id),
    tipo,
    titulo,
    descricao: cleanOptionalText(input.descricao),
    situacao: initialSituacao,
    responsavel_id: resolvedResponsavelId,
    direcionado_por: resolvedResponsavelId ? actor.authUserId : null,
    direcionado_em: resolvedResponsavelId ? nowIso : null,
    criado_por: actor.authUserId,
    tipo_referencia: cleanOptionalText(input.tipo_referencia),
    referencia_id: cleanOptionalText(input.referencia_id),
    empreendedor_id: cleanOptionalUuid(input.empreendedor_id, 'ID do Empreendedor'),
    barragem_id: cleanOptionalUuid(input.barragem_id, 'ID da Barragem'),
    resolvido_por: null,
    resolvido_em: null,
    updated_at: nowIso,
  };

  const { data, error } = await supabase
    .from('pendencias')
    .insert(insertPayload)
    .select(
      'id, origem, origem_ref_id, tipo, titulo, descricao, situacao, responsavel_id, direcionado_por, direcionado_em, criado_por, tipo_referencia, referencia_id, empreendedor_id, barragem_id, resolvido_por, resolvido_em, created_at, updated_at'
    )
    .single();

  if (error || !data) {
    throw new Error(`Não foi possível criar a pendência: ${error?.message || 'erro inesperado'}`);
  }

  const created = data as PendenciaRecord;
  const historyRows: Array<{
    pendencia_id: string;
    acao: string;
    campo: string | null;
    valor_anterior: string | null;
    valor_novo: string | null;
    usuario_id: string;
    motivo: string | null;
  }> = [
    {
      pendencia_id: created.id,
      acao: 'criacao',
      campo: 'situacao',
      valor_anterior: null,
      valor_novo: initialSituacao,
      usuario_id: actor.authUserId,
      motivo: motivoInicial,
    },
  ];

  if (resolvedResponsavelId) {
    historyRows.push({
      pendencia_id: created.id,
      acao: 'direcionamento',
      campo: 'responsavel_id',
      valor_anterior: null,
      valor_novo: resolvedResponsavelId,
      usuario_id: actor.authUserId,
      motivo: motivoInicial,
    });
  }

  await insertHistoricoEntries(historyRows);

  return created;
}

export async function direcionarPendencia(
  pendenciaId: string,
  responsavelId: string,
  motivo?: string | null
): Promise<PendenciaRecord> {
  const actor = await getVerifiedSessionActor();

  if (actor.role !== 'Administrador') {
    throw new Error('Apenas administradores podem direcionar ou alterar o responsável.');
  }

  const cleanPendenciaId = cleanOptionalUuid(pendenciaId, 'ID da pendência');
  const cleanTargetId = cleanOptionalUuid(responsavelId, 'Responsável');
  if (!cleanPendenciaId || !cleanTargetId) {
    throw new Error('Selecione um usuário válido para direcionamento.');
  }

  const users = await fetchAuthorizedUserList(actor);
  const matchedUser = users.find(
    (u) => u.active && (u.authUserId === cleanTargetId || u.id === cleanTargetId)
  );
  if (!matchedUser) {
    throw new Error('O usuário selecionado não existe ou está inativo.');
  }

  const { data: existing, error: fetchError } = await supabase
    .from('pendencias')
    .select('*')
    .eq('id', cleanPendenciaId)
    .single();

  if (fetchError || !existing) {
    throw new Error('Pendência não encontrada ou sem permissão de acesso.');
  }

  const current = existing as PendenciaRecord;
  if (current.situacao === 'resolvida' || current.situacao === 'cancelada') {
    throw new Error('Pendências resolvidas ou canceladas devem ter a situação alterada antes de novo direcionamento.');
  }

  const targetUserId = matchedUser.authUserId;
  if (current.responsavel_id === targetUserId) {
    throw new Error('Esta pendência já está direcionada para o usuário selecionado.');
  }

  const nowIso = new Date().toISOString();
  const nextSituacao: PendenciaSituacao =
    current.situacao === 'aberta' ? 'direcionada' : current.situacao;

  const { data: updated, error: updateError } = await supabase
    .from('pendencias')
    .update({
      responsavel_id: targetUserId,
      direcionado_por: actor.authUserId,
      direcionado_em: nowIso,
      situacao: nextSituacao,
      updated_at: nowIso,
    })
    .eq('id', cleanPendenciaId)
    .select('*')
    .single();

  if (updateError || !updated) {
    throw new Error(`Não foi possível direcionar a pendência: ${updateError?.message || 'erro inesperado'}`);
  }

  const cleanMotivo = cleanOptionalText(motivo);
  const historyRows: Array<{
    pendencia_id: string;
    acao: string;
    campo: string | null;
    valor_anterior: string | null;
    valor_novo: string | null;
    usuario_id: string;
    motivo: string | null;
  }> = [
    {
      pendencia_id: cleanPendenciaId,
      acao: 'direcionamento',
      campo: 'responsavel_id',
      valor_anterior: current.responsavel_id,
      valor_novo: targetUserId,
      usuario_id: actor.authUserId,
      motivo: cleanMotivo,
    },
  ];

  if (nextSituacao !== current.situacao) {
    historyRows.push({
      pendencia_id: cleanPendenciaId,
      acao: 'mudanca_situacao',
      campo: 'situacao',
      valor_anterior: current.situacao,
      valor_novo: nextSituacao,
      usuario_id: actor.authUserId,
      motivo: cleanMotivo,
    });
  }

  await insertHistoricoEntries(historyRows);

  return updated as PendenciaRecord;
}

export async function editarPendencia(
  pendenciaId: string,
  input: UpdatePendenciaInput
): Promise<PendenciaRecord> {
  const actor = await getVerifiedSessionActor();

  if (actor.role === 'Visualizador') {
    throw new Error('Usuários com perfil Visualizador não têm permissão para editar pendências.');
  }

  const cleanPendenciaId = cleanOptionalUuid(pendenciaId, 'ID da pendência');
  if (!cleanPendenciaId) {
    throw new Error('ID da pendência inválido.');
  }

  const titulo = cleanOptionalText(input.titulo);
  const tipo = cleanOptionalText(input.tipo);
  if (!titulo || titulo.length < 3) {
    throw new Error('Informe um título com pelo menos 3 caracteres.');
  }
  if (!tipo) {
    throw new Error('Informe o tipo da pendência.');
  }

  const { data: existing, error: fetchError } = await supabase
    .from('pendencias')
    .select('*')
    .eq('id', cleanPendenciaId)
    .single();

  if (fetchError || !existing) {
    throw new Error('Pendência não encontrada ou sem permissão de acesso.');
  }

  const current = existing as PendenciaRecord;
  const isOwnerOrCreator =
    !current.responsavel_id ||
    matchesActorUserId(current.responsavel_id, actor) ||
    matchesActorUserId(current.criado_por, actor);

  if (actor.role !== 'Administrador' && !isOwnerOrCreator) {
    throw new Error('Você só pode editar pendências sob sua responsabilidade, criadas por você ou sem responsável.');
  }

  const nextValues = {
    tipo,
    titulo,
    descricao: cleanOptionalText(input.descricao),
    origem_ref_id: cleanOptionalText(input.origem_ref_id),
    tipo_referencia: cleanOptionalText(input.tipo_referencia),
    referencia_id: cleanOptionalText(input.referencia_id),
    empreendedor_id: cleanOptionalUuid(input.empreendedor_id, 'ID do Empreendedor'),
    barragem_id: cleanOptionalUuid(input.barragem_id, 'ID da Barragem'),
  };

  const trackedFields: Array<keyof typeof nextValues> = [
    'tipo',
    'titulo',
    'descricao',
    'origem_ref_id',
    'tipo_referencia',
    'referencia_id',
    'empreendedor_id',
    'barragem_id',
  ];

  const cleanMotivo = cleanOptionalText(input.motivo);
  const changedEntries = trackedFields
    .filter((field) => (current[field] ?? null) !== (nextValues[field] ?? null))
    .map((field) => ({
      pendencia_id: cleanPendenciaId,
      acao: 'edicao',
      campo: field,
      valor_anterior: current[field] ?? null,
      valor_novo: nextValues[field] ?? null,
      usuario_id: actor.authUserId,
      motivo: cleanMotivo,
    }));

  if (changedEntries.length === 0) {
    return current;
  }

  const nowIso = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from('pendencias')
    .update({
      ...nextValues,
      updated_at: nowIso,
    })
    .eq('id', cleanPendenciaId)
    .select('*')
    .single();

  if (updateError || !updated) {
    throw new Error(`Não foi possível atualizar a pendência: ${updateError?.message || 'erro inesperado'}`);
  }

  await insertHistoricoEntries(changedEntries);

  return updated as PendenciaRecord;
}

export async function alterarSituacaoPendencia(
  pendenciaId: string,
  novaSituacao: PendenciaSituacao,
  motivo?: string | null
): Promise<PendenciaRecord> {
  const actor = await getVerifiedSessionActor();

  if (actor.role === 'Visualizador') {
    throw new Error('Usuários com perfil Visualizador não têm permissão para alterar a situação.');
  }

  if (!isValidPendenciaSituacao(novaSituacao)) {
    throw new Error('Situação inválida para pendência.');
  }

  const cleanPendenciaId = cleanOptionalUuid(pendenciaId, 'ID da pendência');
  if (!cleanPendenciaId) {
    throw new Error('ID da pendência inválido.');
  }

  const { data: existing, error: fetchError } = await supabase
    .from('pendencias')
    .select('*')
    .eq('id', cleanPendenciaId)
    .single();

  if (fetchError || !existing) {
    throw new Error('Pendência não encontrada ou sem permissão de acesso.');
  }

  const current = existing as PendenciaRecord;

  const canActOnItem =
    actor.role === 'Administrador' ||
    !current.responsavel_id ||
    matchesActorUserId(current.responsavel_id, actor);

  if (!canActOnItem) {
    throw new Error('Apenas o responsável designado ou um administrador pode alterar a situação desta pendência.');
  }

  if (novaSituacao === 'direcionada' && !current.responsavel_id) {
    throw new Error('Não é possível definir a situação como direcionada sem um responsável atribuído.');
  }

  if (current.situacao === novaSituacao) {
    return current;
  }

  const nowIso = new Date().toISOString();
  const isResolving = novaSituacao === 'resolvida';
  const wasResolved = current.situacao === 'resolvida';

  const updatePayload: Record<string, any> = {
    situacao: novaSituacao,
    updated_at: nowIso,
  };

  if (isResolving) {
    updatePayload.resolvido_por = actor.authUserId;
    updatePayload.resolvido_em = nowIso;
  } else if (wasResolved) {
    updatePayload.resolvido_por = null;
    updatePayload.resolvido_em = null;
  }

  const { data: updated, error: updateError } = await supabase
    .from('pendencias')
    .update(updatePayload)
    .eq('id', cleanPendenciaId)
    .select('*')
    .single();

  if (updateError || !updated) {
    throw new Error(`Não foi possível atualizar a situação: ${updateError?.message || 'erro inesperado'}`);
  }

  const cleanMotivo = cleanOptionalText(motivo);
  await insertHistoricoEntries([
    {
      pendencia_id: cleanPendenciaId,
      acao: isResolving ? 'resolucao' : 'mudanca_situacao',
      campo: 'situacao',
      valor_anterior: current.situacao,
      valor_novo: novaSituacao,
      usuario_id: actor.authUserId,
      motivo: cleanMotivo,
    },
  ]);

  return updated as PendenciaRecord;
}
