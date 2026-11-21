import {
  CreateSolicitacaoVistoriaInput,
  SolicitacaoVistoriaEquipeMembro,
  SolicitacaoVistoriaRecord,
  UpdateSolicitacaoVistoriaInput,
  UserRole,
} from '../../types';
import { isSupabaseConfigured, supabase } from '../supabaseClient';

export const SOLICITACAO_RELATO_MAX_LENGTH = 1000;
export const SOLICITACAO_OBSERVACAO_MAX_LENGTH = 1000;

export const SOLICITACAO_STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente',
  aberta: 'Pendente',
  em_planejamento: 'Em planejamento',
  realizada: 'Vistoria realizada',
  cancelada: 'Cancelada',
};

export interface SolicitacaoActor {
  canonicalUserId: string;
  name: string;
  email: string;
  role: UserRole;
}

const FORMATTED_CPF_REGEX = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/;
const FORMATTED_CNPJ_REGEX = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/;
const RAW_DIGIT_TOKEN_REGEX = /\b\d[\d.\-\/]{9,18}\d\b/g;

function isValidCpfDigits(digits: string): boolean {
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(digits[i]) * (10 - i);
  let check1 = (sum * 10) % 11;
  if (check1 === 10) check1 = 0;
  if (check1 !== Number(digits[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(digits[i]) * (11 - i);
  let check2 = (sum * 10) % 11;
  if (check2 === 10) check2 = 0;
  return check2 === Number(digits[10]);
}

function isValidCnpjDigits(digits: string): boolean {
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let s1 = 0;
  for (let i = 0; i < 12; i++) s1 += Number(digits[i]) * w1[i];
  const r1 = s1 % 11;
  if ((r1 < 2 ? 0 : 11 - r1) !== Number(digits[12])) return false;
  let s2 = 0;
  for (let i = 0; i < 13; i++) s2 += Number(digits[i]) * w2[i];
  const r2 = s2 % 11;
  return (r2 < 2 ? 0 : 11 - r2) === Number(digits[13]);
}

export function containsCpfOrCnpj(value?: string | null): boolean {
  if (!value) return false;
  if (FORMATTED_CPF_REGEX.test(value) || FORMATTED_CNPJ_REGEX.test(value)) return true;
  const matches = value.match(RAW_DIGIT_TOKEN_REGEX);
  if (!matches) return false;
  for (const token of matches) {
    const digits = token.replace(/\D/g, '');
    if (digits.length === 11 && isValidCpfDigits(digits)) return true;
    if (digits.length === 14 && isValidCnpjDigits(digits)) return true;
  }
  return false;
}

function cleanOptionalText(val?: string | null): string | null {
  const trimmed = typeof val === 'string' ? val.trim() : '';
  return trimmed.length > 0 ? trimmed : null;
}

export function isSolicitacaoAuthor(
  sol: Pick<SolicitacaoVistoriaRecord, 'solicitante_id' | 'solicitante_email'>,
  actor: Pick<SolicitacaoActor, 'canonicalUserId' | 'email'> | null | undefined
): boolean {
  if (!actor) return false;
  if (sol.solicitante_id) {
    return sol.solicitante_id === actor.canonicalUserId;
  }
  if (sol.solicitante_email && actor.email) {
    return sol.solicitante_email.trim().toLowerCase() === actor.email.trim().toLowerCase();
  }
  return false;
}

export function isSolicitacaoEquipeMember(
  equipe: Array<SolicitacaoVistoriaEquipeMembro | string> | null | undefined,
  actor: Pick<SolicitacaoActor, 'canonicalUserId' | 'email'> | null | undefined
): boolean {
  if (!actor || !Array.isArray(equipe)) return false;
  const actorId = actor.canonicalUserId;
  const actorEmail = (actor.email || '').trim().toLowerCase();

  for (const member of equipe) {
    if (typeof member === 'string') {
      const val = member.trim();
      if (!val) continue;
      if (val === actorId) return true;
      if (actorEmail && val.includes('@') && val.toLowerCase() === actorEmail) return true;
    } else if (member && typeof member === 'object') {
      if (member.id && member.id.trim() === actorId) return true;
      if (member.email && actorEmail && member.email.trim().toLowerCase() === actorEmail) return true;
    }
  }
  return false;
}

export function formatEquipeMemberLabel(
  member: SolicitacaoVistoriaEquipeMembro | string
): string {
  if (typeof member === 'string') return member;
  return member.nome || member.email || member.id || 'Integrante';
}

async function getAccessToken(): Promise<string> {
  if (!isSupabaseConfigured()) {
    throw new Error('Autenticação não configurada neste ambiente.');
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

async function callApi<T>(url: string, init: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });

  const data = (await res.json().catch(() => null)) as
    | ({ ok?: boolean; error?: string } & Record<string, unknown>)
    | null;

  if (!res.ok || !data || data.ok === false) {
    throw new Error(data?.error || `Não foi possível concluir a operação (HTTP ${res.status}).`);
  }

  return data as unknown as T;
}

export async function listSolicitacoesVistoria(statusFilter?: string): Promise<{
  actor: SolicitacaoActor;
  items: SolicitacaoVistoriaRecord[];
}> {
  const qs = statusFilter && statusFilter !== 'todas'
    ? `?status=${encodeURIComponent(statusFilter)}`
    : '';
  const data = await callApi<{
    actor: SolicitacaoActor;
    items: SolicitacaoVistoriaRecord[];
  }>(`/api/solicitacoes-vistoria${qs}`, { method: 'GET' });

  return {
    actor: data.actor,
    items: Array.isArray(data.items) ? data.items : [],
  };
}

export async function createSolicitacaoVistoria(
  input: CreateSolicitacaoVistoriaInput
): Promise<SolicitacaoVistoriaRecord> {
  const relato = cleanOptionalText(input.relato);
  if (!relato) {
    throw new Error('Informe o relato técnico da solicitação de vistoria.');
  }
  if (relato.length > SOLICITACAO_RELATO_MAX_LENGTH) {
    throw new Error(`O relato não pode ultrapassar ${SOLICITACAO_RELATO_MAX_LENGTH} caracteres.`);
  }
  if (containsCpfOrCnpj(relato)) {
    throw new Error('O relato não pode conter CPF ou CNPJ. Utilize apenas referências de ID.');
  }

  const fieldsToCheck: Array<[string, string | null | undefined]> = [
    ['Nome da barragem', input.barragem_nome],
    ['Município', input.municipio],
    ["Curso d'água", input.curso_agua],
    ['Coordenadas', input.coordenadas],
    ['Nome do empreendedor', input.empreendedor_nome],
    ['Processo', input.processo],
    ['Classificação atual', input.classificacao_atual],
    ['DPA', input.dpa],
    ['CRI', input.cri],
  ];

  for (const [label, val] of fieldsToCheck) {
    if (containsCpfOrCnpj(val)) {
      throw new Error(`${label} não pode conter CPF ou CNPJ.`);
    }
  }

  const data = await callApi<{ item: SolicitacaoVistoriaRecord }>('/api/solicitacoes-vistoria', {
    method: 'POST',
    body: JSON.stringify({
      relato,
      barragem_id: cleanOptionalText(input.barragem_id),
      barragem_nome: cleanOptionalText(input.barragem_nome),
      municipio: cleanOptionalText(input.municipio),
      curso_agua: cleanOptionalText(input.curso_agua),
      coordenadas: cleanOptionalText(input.coordenadas),
      empreendedor_id: cleanOptionalText(input.empreendedor_id),
      empreendedor_nome: cleanOptionalText(input.empreendedor_nome),
      processo: cleanOptionalText(input.processo),
      classificacao_atual: cleanOptionalText(input.classificacao_atual),
      dpa: cleanOptionalText(input.dpa),
      cri: cleanOptionalText(input.cri),
    }),
  });

  return data.item;
}

export async function updateSolicitacaoVistoria(
  id: string,
  input: UpdateSolicitacaoVistoriaInput
): Promise<SolicitacaoVistoriaRecord> {
  if (!id || !id.trim()) {
    throw new Error('Solicitação inválida.');
  }

  if (input.acao === 'cancelar') {
    const motivo = cleanOptionalText(input.motivo_cancelamento);
    if (motivo && containsCpfOrCnpj(motivo)) {
      throw new Error('O motivo do cancelamento não pode conter CPF ou CNPJ.');
    }
    const data = await callApi<{ item: SolicitacaoVistoriaRecord }>(
      `/api/solicitacoes-vistoria/${encodeURIComponent(id.trim())}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          acao: 'cancelar',
          motivo_cancelamento: motivo,
        }),
      }
    );
    return data.item;
  }

  const relato = cleanOptionalText(input.relato);
  if (!relato) {
    throw new Error('O campo relato é obrigatório.');
  }
  if (relato.length > SOLICITACAO_RELATO_MAX_LENGTH) {
    throw new Error(`O relato não pode ultrapassar ${SOLICITACAO_RELATO_MAX_LENGTH} caracteres.`);
  }
  if (containsCpfOrCnpj(relato)) {
    throw new Error('O relato não pode conter CPF ou CNPJ.');
  }

  const data = await callApi<{ item: SolicitacaoVistoriaRecord }>(
    `/api/solicitacoes-vistoria/${encodeURIComponent(id.trim())}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        acao: 'editar',
        relato,
      }),
    }
  );
  return data.item;
}

export async function updateSolicitacaoObservacao(
  id: string,
  observacaoCampo: string
): Promise<SolicitacaoVistoriaRecord> {
  if (!id || !id.trim()) {
    throw new Error('Solicitação inválida.');
  }
  const cleanObs = cleanOptionalText(observacaoCampo);
  if (cleanObs && cleanObs.length > SOLICITACAO_OBSERVACAO_MAX_LENGTH) {
    throw new Error(
      `A observação de campo não pode ultrapassar ${SOLICITACAO_OBSERVACAO_MAX_LENGTH} caracteres.`
    );
  }
  if (cleanObs && containsCpfOrCnpj(cleanObs)) {
    throw new Error('A observação de campo não pode conter CPF ou CNPJ.');
  }

  const data = await callApi<{ item: SolicitacaoVistoriaRecord }>(
    `/api/solicitacoes-vistoria/${encodeURIComponent(id.trim())}/observacao`,
    {
      method: 'PATCH',
      body: JSON.stringify({ observacao_campo: cleanObs }),
    }
  );
  return data.item;
}
