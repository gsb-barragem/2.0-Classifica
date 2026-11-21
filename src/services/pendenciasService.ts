import {
  CreatePendenciaInput,
  PendenciaCapabilities,
  PendenciaHistoricoRecord,
  PendenciaRecord,
  PendenciaSituacao,
  PendenciaUsuarioOption,
  UpdatePendenciaInput,
  UserRole,
} from '../../types';
import { isSupabaseConfigured, supabase } from '../supabaseClient';

export const CURRENT_PENDENCIA_ORIGEM = 'classifica' as const;

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
  canonicalUserId: string;
  name: string;
  role: UserRole;
}

export interface ListPendenciasResponse {
  actor: VerifiedSessionActor;
  items: PendenciaRecord[];
  userNames: Record<string, string>;
  assignableUsers: PendenciaUsuarioOption[];
  capabilities: PendenciaCapabilities;
}

export interface ListPendenciaHistoricoResponse {
  items: PendenciaHistoricoRecord[];
  userNames: Record<string, string>;
}

function cleanOptionalText(value?: string | null): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : null;
}

function requirePendenciaUuid(value: string | null | undefined, fieldLabel: string): string {
  const cleaned = cleanOptionalText(value);
  if (!cleaned || !UUID_REGEX.test(cleaned)) {
    throw new Error(`${fieldLabel} deve ser um identificador UUID válido.`);
  }
  return cleaned;
}

export function isValidPendenciaSituacao(value: string): value is PendenciaSituacao {
  return PENDENCIA_SITUACOES.includes(value as PendenciaSituacao);
}

export function matchesActorCanonicalId(
  candidateUserId: string | null | undefined,
  actor: Pick<VerifiedSessionActor, 'canonicalUserId'> | null | undefined
): boolean {
  if (!candidateUserId || !actor || !actor.canonicalUserId) return false;
  return candidateUserId === actor.canonicalUserId;
}

async function getClassificaAccessToken(): Promise<string> {
  if (!isSupabaseConfigured()) {
    throw new Error('Autenticação do Classifica não configurada neste ambiente.');
  }

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    throw new Error('Sessão expirada ou não autenticada. Faça login novamente.');
  }

  return session.access_token;
}

async function postPendenciasApi<T>(payload: Record<string, unknown>): Promise<T> {
  const token = await getClassificaAccessToken();

  const res = await fetch('/api/pendencias', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const data = (await res.json().catch(() => null)) as
    | ({ ok?: boolean; error?: string; code?: string } & Record<string, unknown>)
    | null;

  if (!res.ok || !data || data.ok === false) {
    throw new Error(data?.error || `Falha na requisição de pendências (HTTP ${res.status}).`);
  }

  return data as unknown as T;
}

export async function listPendencias(): Promise<ListPendenciasResponse> {
  const data = await postPendenciasApi<{
    actor: VerifiedSessionActor;
    items: PendenciaRecord[];
    userNames?: Record<string, string>;
    assignableUsers?: PendenciaUsuarioOption[];
    capabilities?: PendenciaCapabilities;
  }>({ action: 'listar' });

  return {
    actor: data.actor,
    items: Array.isArray(data.items) ? data.items : [],
    userNames: data.userNames || {},
    assignableUsers: Array.isArray(data.assignableUsers) ? data.assignableUsers : [],
    capabilities: data.capabilities || {
      readEnabled: true,
      mutationsEnabled: false,
      mutationBlockCode: 'ATOMIC_AUDIT_UNAVAILABLE',
      mutationBlockReason: 'Mutações bloqueadas no servidor.',
    },
  };
}

export async function listPendenciaHistorico(
  pendenciaId: string
): Promise<ListPendenciaHistoricoResponse> {
  const cleanId = requirePendenciaUuid(pendenciaId, 'ID da pendência');
  const data = await postPendenciasApi<{
    items: PendenciaHistoricoRecord[];
    userNames?: Record<string, string>;
  }>({
    action: 'historico',
    pendenciaId: cleanId,
  });

  return {
    items: Array.isArray(data.items) ? data.items : [],
    userNames: data.userNames || {},
  };
}

export async function createPendencia(input: CreatePendenciaInput): Promise<PendenciaRecord> {
  const titulo = cleanOptionalText(input.titulo);
  const tipo = cleanOptionalText(input.tipo);
  if (!titulo || titulo.length < 3) {
    throw new Error('Informe um título com pelo menos 3 caracteres.');
  }
  if (!tipo) {
    throw new Error('Informe o tipo da pendência.');
  }

  const data = await postPendenciasApi<{ item: PendenciaRecord }>({
    action: 'criar',
    origem: CURRENT_PENDENCIA_ORIGEM,
    tipo,
    titulo,
    descricao: cleanOptionalText(input.descricao),
    origem_ref_id: cleanOptionalText(input.origem_ref_id),
    tipo_referencia: cleanOptionalText(input.tipo_referencia),
    referencia_id: cleanOptionalText(input.referencia_id),
    empreendedor_id: cleanOptionalText(input.empreendedor_id),
    barragem_id: cleanOptionalText(input.barragem_id),
    responsavel_id: cleanOptionalText(input.responsavel_id),
    motivo: cleanOptionalText(input.motivo),
  });

  return data.item;
}

export async function direcionarPendencia(
  pendenciaId: string,
  responsavelId: string,
  motivo?: string | null
): Promise<PendenciaRecord> {
  const cleanPendenciaId = requirePendenciaUuid(pendenciaId, 'ID da pendência');
  const cleanTargetId = requirePendenciaUuid(responsavelId, 'Responsável');

  const data = await postPendenciasApi<{ item: PendenciaRecord }>({
    action: 'direcionar',
    pendenciaId: cleanPendenciaId,
    responsavelId: cleanTargetId,
    motivo: cleanOptionalText(motivo),
  });

  return data.item;
}

export async function editarPendencia(
  pendenciaId: string,
  input: UpdatePendenciaInput
): Promise<PendenciaRecord> {
  const cleanPendenciaId = requirePendenciaUuid(pendenciaId, 'ID da pendência');
  const titulo = cleanOptionalText(input.titulo);
  const tipo = cleanOptionalText(input.tipo);
  if (!titulo || titulo.length < 3) {
    throw new Error('Informe um título com pelo menos 3 caracteres.');
  }
  if (!tipo) {
    throw new Error('Informe o tipo da pendência.');
  }

  const data = await postPendenciasApi<{ item: PendenciaRecord }>({
    action: 'editar',
    pendenciaId: cleanPendenciaId,
    tipo,
    titulo,
    descricao: cleanOptionalText(input.descricao),
    origem_ref_id: cleanOptionalText(input.origem_ref_id),
    tipo_referencia: cleanOptionalText(input.tipo_referencia),
    referencia_id: cleanOptionalText(input.referencia_id),
    empreendedor_id: cleanOptionalText(input.empreendedor_id),
    barragem_id: cleanOptionalText(input.barragem_id),
    motivo: cleanOptionalText(input.motivo),
  });

  return data.item;
}

export async function alterarSituacaoPendencia(
  pendenciaId: string,
  novaSituacao: PendenciaSituacao,
  motivo?: string | null
): Promise<PendenciaRecord> {
  const cleanPendenciaId = requirePendenciaUuid(pendenciaId, 'ID da pendência');
  if (!isValidPendenciaSituacao(novaSituacao)) {
    throw new Error('Situação inválida para pendência.');
  }

  const data = await postPendenciasApi<{ item: PendenciaRecord }>({
    action: 'alterar_situacao',
    pendenciaId: cleanPendenciaId,
    novaSituacao,
    motivo: cleanOptionalText(motivo),
  });

  return data.item;
}
