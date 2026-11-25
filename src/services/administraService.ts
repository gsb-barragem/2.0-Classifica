import {
  BarragemMaster,
  EmpreendedorMaster,
  EntidadeTipoEcossistema,
  ProdutoEcossistemaResumo,
  ResponsavelTecnicoMaster,
  SistemaOrigem,
  SolicitacaoAlteracao,
  User,
} from '../../types';
import {
  getAdministraClient,
  getFiscalizaReadOnlyClient,
  getNotificaReadOnlyClient,
  isAdministraConfigured,
} from '../lib/ecosystemClients';
import { CLASSIFICA_INTEGRATION_ARCHITECTURE } from '../config/integrationArchitecture';
import { supabase, isSupabaseConfigured } from '../supabaseClient';
import { logActivity } from '../lib/auditService';
import { AppDocument } from '../contexts/DataContext';
import { normalizeCoordinateToGMS } from '../utils/coordinateUtils';

const CURRENT_SYSTEM: SistemaOrigem = 'CLASSIFICA_CSB';

export const ADMINISTRA_MASTER_WRITE_BLOCKED_CODE =
  CLASSIFICA_INTEGRATION_ARCHITECTURE.masterWriteApi.blockCode;
export const ADMINISTRA_MASTER_WRITE_BLOCKED_MESSAGE =
  'Gravação direta de cadastros mestres no Administra Barragens está bloqueada no Classifica 2.0 até a implantação da API de escrita aprovada com validação híbrida.';

export const SYSTEM_LABELS: Record<SistemaOrigem, string> = {
  CLASSIFICA_CSB: '2.0 Classifica CSB',
  ADMINISTRA_BARRAGENS: 'Administra Barragens',
  NOTIFICA_CSB: 'Notifica CSB',
  FISCALIZA_BARRAGENS: 'Fiscaliza Barragens',
};

export function normalizeDigits(value?: string | null): string {
  return (value || '').replace(/\D/g, '');
}

export function normalizeText(value?: string | null): string {
  return (value || '').trim().replace(/\s+/g, ' ');
}

export interface MasterWriteResult<T> {
  success: boolean;
  data?: T;
  blocked?: boolean;
  code?: string;
  ownershipConflict?: boolean;
  ownerSystem?: SistemaOrigem;
  notConfigured?: boolean;
  message?: string;
}

function buildBlockedMasterWriteResult<T>(message?: string): MasterWriteResult<T> {
  return {
    success: false,
    blocked: true,
    code: ADMINISTRA_MASTER_WRITE_BLOCKED_CODE,
    message: message || ADMINISTRA_MASTER_WRITE_BLOCKED_MESSAGE,
  };
}

// ============================================================================
// LEITURA DA BASE MESTRE (ADMINISTRA BARRAGENS VIA /api/administra-leitura)
// ============================================================================

function pickCanonicalField(
  row: Record<string, any> | null | undefined,
  patterns: RegExp[]
): string | null {
  if (!row || typeof row !== 'object') return null;
  const keys = Object.keys(row);
  for (const rx of patterns) {
    const matchedKey = keys.find((k) => rx.test(k));
    if (matchedKey) {
      const val = row[matchedKey];
      if (val !== null && val !== undefined && String(val).trim() !== '') {
        return String(val).trim();
      }
    }
  }
  return null;
}

export function mapCanonicalEmpreendedor(record: Record<string, any>): EmpreendedorMaster {
  const cpfCnpj =
    pickCanonicalField(record, [
      /^cpf_cnpj$/i,
      /^cnpj_cpf$/i,
      /^documento$/i,
      /^cnpj$/i,
      /^cpf$/i,
    ]) || '';
  const digits = normalizeDigits(cpfCnpj);
  const tipoPessoaRaw = pickCanonicalField(record, [/^tipo_pessoa$/i]);
  const tipoPessoa: 'PF' | 'PJ' =
    tipoPessoaRaw === 'PJ' || digits.length === 14 ? 'PJ' : 'PF';

  return {
    id:
      pickCanonicalField(record, [/^id$/i, /^empreendedor_id$/i, /^id_empreendedor$/i]) || '',
    cpf_cnpj: cpfCnpj,
    tipo_pessoa: tipoPessoa,
    razao_social:
      pickCanonicalField(record, [
        /^empreendedor_nome$/i,
        /^razao_social$/i,
        /^nome_razao$/i,
        /^nome_razao_social$/i,
        /^nome$/i,
        /^nome_empreendedor$/i,
        /^nome_completo$/i,
        /^nome_fantasia$/i,
        /^titulo$/i,
      ]) || 'Empreendedor sem nome',
    nome_fantasia: pickCanonicalField(record, [/^nome_fantasia$/i]),
    email: pickCanonicalField(record, [/^email$/i, /^e_mail$/i]),
    telefone: pickCanonicalField(record, [/^telefone$/i, /^celular$/i, /^fone$/i]),
    endereco: pickCanonicalField(record, [/^endereco$/i, /^logradouro$/i, /^localizacao$/i]),
    municipio: pickCanonicalField(record, [/^municipio$/i, /^municipio_uf$/i, /^cidade$/i]),
    num_car: pickCanonicalField(record, [/^num_car$/i, /^car$/i, /^numero_car$/i, /^car_mt$/i]),
    sistema_origem:
      (pickCanonicalField(record, [/^sistema_origem$/i]) as SistemaOrigem) ||
      'ADMINISTRA_BARRAGENS',
    created_by_user_id: pickCanonicalField(record, [/^created_by_user_id$/i]),
    created_by_name: pickCanonicalField(record, [/^created_by_name$/i]),
    created_at: pickCanonicalField(record, [/^created_at$/i]) || undefined,
    updated_at: pickCanonicalField(record, [/^updated_at$/i]) || undefined,
  };
}

export function mapCanonicalBarragem(
  record: Record<string, any>,
  empreendedor?: Record<string, any> | null
): BarragemMaster {
  const empId =
    pickCanonicalField(record, [/^empreendedor_id$/i, /^id_empreendedor$/i]) ||
    pickCanonicalField(empreendedor, [/^id$/i, /^empreendedor_id$/i, /^id_empreendedor$/i]);

  return {
    id: pickCanonicalField(record, [/^id$/i, /^barragem_id$/i, /^id_barragem$/i]) || '',
    empreendedor_id: empId,
    empreendedor_nome:
      pickCanonicalField(record, [/^empreendedor_nome$/i, /^razao_social_empreendedor$/i]) ||
      pickCanonicalField(empreendedor, [
        /^empreendedor_nome$/i,
        /^razao_social$/i,
        /^nome_razao$/i,
        /^nome$/i,
      ]),
    empreendedor_cpf_cnpj:
      pickCanonicalField(record, [/^empreendedor_cpf_cnpj$/i]) ||
      pickCanonicalField(empreendedor, [/^cpf_cnpj$/i, /^cnpj_cpf$/i, /^documento$/i]),
    snisb: pickCanonicalField(record, [/^snisb$/i, /^codigo_snisb$/i]),
    nome:
      pickCanonicalField(record, [
        /^barragem_nome$/i,
        /^nome_barragem$/i,
        /^nome$/i,
        /^barragem$/i,
        /^denominacao$/i,
        /^titulo$/i,
      ]) || 'Barragem sem nome',
    municipio:
      pickCanonicalField(record, [/^municipio$/i, /^municipio_uf$/i, /^cidade$/i]) || '',
    upg: pickCanonicalField(record, [/^upg$/i]),
    sub_bacia: pickCanonicalField(record, [/^sub_bacia$/i, /^bacia$/i]),
    curso_agua: pickCanonicalField(record, [/^curso_agua$/i, /^curso_dagua$/i, /^rio$/i]),
    zona: pickCanonicalField(record, [/^zona$/i]),
    localizacao: pickCanonicalField(record, [/^localizacao$/i, /^endereco$/i]),
    lat_decimal: (() => {
      if (typeof record?.lat_decimal === 'number') return record.lat_decimal;
      if (typeof record?.lat_decimal === 'string' && record.lat_decimal.trim() !== '') {
        const parsed = parseFloat(record.lat_decimal.replace(',', '.'));
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    })(),
    long_decimal: (() => {
      if (typeof record?.long_decimal === 'number') return record.long_decimal;
      if (typeof record?.long_decimal === 'string' && record.long_decimal.trim() !== '') {
        const parsed = parseFloat(record.long_decimal.replace(',', '.'));
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    })(),
    lat_gms: (() => {
      const rawLat = pickCanonicalField(record, [/^lat_gms$/i, /^latitude_gms$/i, /^latitude$/i, /^lat$/i]);
      const dec = typeof record?.lat_decimal === 'number' ? record.lat_decimal : typeof record?.lat_decimal === 'string' ? parseFloat(record.lat_decimal.replace(',', '.')) : null;
      return normalizeCoordinateToGMS(rawLat, dec) || null;
    })(),
    long_gms: (() => {
      const rawLong = pickCanonicalField(record, [
        /^long_gms$/i,
        /^longitude_gms$/i,
        /^longitude$/i,
        /^long$/i,
        /^lon$/i,
      ]);
      const dec = typeof record?.long_decimal === 'number' ? record.long_decimal : typeof record?.long_decimal === 'string' ? parseFloat(record.long_decimal.replace(',', '.')) : null;
      return normalizeCoordinateToGMS(rawLong, dec) || null;
    })(),
    altura_maxima: pickCanonicalField(record, [/^altura_maxima$/i, /^altura$/i]),
    comprimento_coroamento: pickCanonicalField(record, [
      /^comprimento_coroamento$/i,
      /^comprimento$/i,
    ]),
    largura_coroamento: pickCanonicalField(record, [/^largura_coroamento$/i, /^largura$/i]),
    volume_nmo: pickCanonicalField(record, [/^volume_nmo$/i, /^volume$/i]),
    volume_nmm: pickCanonicalField(record, [/^volume_nmm$/i, /^volume_maximo$/i]),
    tipo_estrutural: pickCanonicalField(record, [/^tipo_estrutural$/i]),
    tipo_fundacao: pickCanonicalField(record, [/^tipo_fundacao$/i]),
    finalidade: pickCanonicalField(record, [/^finalidade$/i]),
    situacao: pickCanonicalField(record, [/^situacao$/i]),
    dpa_atual: pickCanonicalField(record, [/^dpa_atual$/i, /^dpa$/i]),
    cri_atual: pickCanonicalField(record, [/^cri_atual$/i, /^cri$/i]),
    enquadramento_pnsb:
      typeof record?.enquadramento_pnsb === 'boolean' ? record.enquadramento_pnsb : null,
    sistema_origem:
      (pickCanonicalField(record, [/^sistema_origem$/i]) as SistemaOrigem) ||
      'ADMINISTRA_BARRAGENS',
    created_by_user_id: pickCanonicalField(record, [/^created_by_user_id$/i]),
    created_by_name: pickCanonicalField(record, [/^created_by_name$/i]),
    created_at: pickCanonicalField(record, [/^created_at$/i]) || undefined,
    updated_at: pickCanonicalField(record, [/^updated_at$/i]) || undefined,
  };
}

export interface RtArtVinculo {
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

export function mapCanonicalRt(
  record: Record<string, any>,
  vinculosBarragem?: Array<{ vinculo: AdministraRecord; barragem: AdministraRecord | null }>
): ResponsavelTecnicoMaster & { art?: string | null; arts?: RtArtVinculo[] } {
  const rtId = pickCanonicalField(record, [/^id$/i, /^rt_id$/i, /^id_rt$/i]) || '';
  const directArt = pickCanonicalField(record, [
    /^art$/i,
    /^numero_art$/i,
    /^art_numero$/i,
    /^num_art$/i,
    /^registro_art$/i,
  ]);

  const arts: RtArtVinculo[] = [];
  const seenArts = new Set<string>();
  const pushArt = (item: RtArtVinculo) => {
    const clean = (item.art || '').trim();
    if (!clean) return;
    const key = `${clean.toUpperCase()}::${item.barragem_id || ''}`;
    if (seenArts.has(key)) return;
    seenArts.add(key);
    arts.push({ ...item, art: clean });
  };

  if (directArt) {
    pushArt({
      id: `rt_${rtId}_${directArt}`,
      art: directArt,
      rt_id: rtId,
      origem: 'rt',
    });
  }

  if (Array.isArray(record?.arts)) {
    for (const entry of record.arts) {
      if (typeof entry === 'string' && entry.trim()) {
        pushArt({
          id: `rt_arr_${rtId}_${entry.trim()}`,
          art: entry.trim(),
          rt_id: rtId,
          origem: 'rt',
        });
      } else if (entry && typeof entry === 'object') {
        const a = pickCanonicalField(entry, [/^art$/i, /^numero_art$/i, /^art_numero$/i, /^numero$/i]);
        if (a) {
          pushArt({
            id: pickCanonicalField(entry, [/^id$/i]) || `rt_obj_${rtId}_${a}`,
            art: a,
            rt_id: rtId,
            barragem_id: pickCanonicalField(entry, [/^barragem_id$/i]),
            atividade: pickCanonicalField(entry, [/^atividade$/i, /^funcao$/i, /^tipo$/i]),
            observacao: pickCanonicalField(entry, [/^observacao$/i, /^observacoes$/i, /^descricao$/i]),
            created_at: pickCanonicalField(entry, [/^created_at$/i]),
            origem: 'rt',
          });
        }
      }
    }
  }

  if (Array.isArray(vinculosBarragem)) {
    for (const vItem of vinculosBarragem) {
      const vinc = vItem?.vinculo;
      const bar = vItem?.barragem;
      if (!vinc || typeof vinc !== 'object') continue;
      const vArt = pickCanonicalField(vinc, [
        /^art$/i,
        /^numero_art$/i,
        /^art_numero$/i,
        /^num_art$/i,
        /^registro_art$/i,
        /^codigo_art$/i,
      ]);
      if (!vArt) continue;
      const barId =
        pickCanonicalField(vinc, [/^barragem_id$/i, /^id_barragem$/i]) ||
        pickCanonicalField(bar, [/^id$/i, /^barragem_id$/i]);
      pushArt({
        id: pickCanonicalField(vinc, [/^id$/i, /^vinculo_id$/i]) || `vinc_${rtId}_${vArt}`,
        art: vArt,
        rt_id: rtId,
        barragem_id: barId,
        barragem_nome:
          pickCanonicalField(vinc, [/^barragem_nome$/i, /^nome_barragem$/i]) ||
          pickCanonicalField(bar, [/^barragem_nome$/i, /^nome_barragem$/i, /^nome$/i]),
        barragem_snisb:
          pickCanonicalField(vinc, [/^barragem_snisb$/i, /^snisb$/i]) ||
          pickCanonicalField(bar, [/^snisb$/i, /^codigo_snisb$/i]),
        atividade: pickCanonicalField(vinc, [/^atividade$/i, /^funcao$/i, /^tipo$/i, /^papel$/i]),
        observacao: pickCanonicalField(vinc, [/^observacao$/i, /^observacoes$/i, /^descricao$/i]),
        created_at: pickCanonicalField(vinc, [/^created_at$/i]),
        origem: 'vinculo',
      });
    }
  }

  return {
    id: rtId,
    nome:
      pickCanonicalField(record, [
        /^rt_nome$/i,
        /^nome_rt$/i,
        /^nome$/i,
        /^nome_completo$/i,
        /^responsavel_tecnico$/i,
        /^razao_social$/i,
      ]) || 'Responsável Técnico',
    cpf: pickCanonicalField(record, [/^cpf$/i, /^cpf_cnpj$/i, /^documento$/i]),
    registro_profissional: pickCanonicalField(record, [
      /^registro_profissional$/i,
      /^crea$/i,
      /^registro$/i,
      /^conselho_registro$/i,
      /^numero_registro$/i,
    ]),
    email: pickCanonicalField(record, [/^email$/i, /^e_mail$/i]),
    telefone: pickCanonicalField(record, [/^telefone$/i, /^celular$/i, /^fone$/i]),
    art: directArt || arts[0]?.art || null,
    arts,
    sistema_origem:
      (pickCanonicalField(record, [/^sistema_origem$/i]) as SistemaOrigem) ||
      'ADMINISTRA_BARRAGENS',
    created_by_user_id: pickCanonicalField(record, [/^created_by_user_id$/i]),
    created_by_name: pickCanonicalField(record, [/^created_by_name$/i]),
    created_at: pickCanonicalField(record, [/^created_at$/i]) || undefined,
    updated_at: pickCanonicalField(record, [/^updated_at$/i]) || undefined,
  };
}

export async function searchEmpreendedores(
  query = '',
  pageSize = 25
): Promise<{
  data: EmpreendedorMaster[];
  configured: boolean;
  total?: number | null;
  error?: string;
}> {
  const clean = normalizeText(query);
  const safeLimit = Math.max(1, Math.min(50, pageSize));

  const canonical = await fetchEmpreendedoresPage(1, safeLimit, clean);
  if (canonical.configured && !canonical.error) {
    const mapped = canonical.data.map((item) => mapCanonicalEmpreendedor(item.record));
    return {
      data: mapped,
      configured: true,
      total: canonical.total ?? mapped.length,
    };
  }

  const client = getAdministraClient();
  if (!client) {
    return {
      data: [],
      configured: canonical.configured,
      total: null,
      error: canonical.error?.userMessage,
    };
  }

  try {
    const rpcRes = await client.rpc('administra_buscar_empreendedores', { p_termo: clean });
    if (!rpcRes.error && Array.isArray(rpcRes.data)) {
      const mapped = (rpcRes.data as Record<string, any>[]).map(mapCanonicalEmpreendedor);
      return { data: mapped, configured: true, total: mapped.length };
    }

    let q = client
      .from('administra_empreendedores')
      .select(
        'id, cpf_cnpj, tipo_pessoa, razao_social, nome_fantasia, email, telefone, endereco, municipio, num_car, sistema_origem, created_by_user_id, created_by_name, created_at, updated_at'
      )
      .order('razao_social', { ascending: true })
      .limit(safeLimit);

    if (clean) {
      const digits = normalizeDigits(clean);
      if (digits.length >= 3) {
        q = q.or(`razao_social.ilike.%${clean}%,cpf_cnpj.ilike.%${digits}%`);
      } else {
        q = q.ilike('razao_social', `%${clean}%`);
      }
    }

    const { data, error } = await q;
    if (error) {
      return {
        data: [],
        configured: true,
        error: 'Não foi possível consultar empreendedores no Administra.',
      };
    }
    const mapped = (data || []).map(mapCanonicalEmpreendedor);
    return { data: mapped, configured: true, total: mapped.length };
  } catch {
    return {
      data: [],
      configured: true,
      error: 'Falha de comunicação com o Administra Barragens.',
    };
  }
}

export async function searchBarragens(
  query = '',
  empreendedorId?: string,
  pageSize = 25
): Promise<{
  data: BarragemMaster[];
  configured: boolean;
  total?: number | null;
  error?: string;
}> {
  const clean = normalizeText(query);
  const safeLimit = Math.max(1, Math.min(50, pageSize));

  const canonical = await fetchBarragensPage(1, safeLimit, clean);
  if (canonical.configured && !canonical.error) {
    let mapped = canonical.data.map((item) =>
      mapCanonicalBarragem(item.record, item.empreendedor)
    );

    if (empreendedorId) {
      const linked = mapped.filter((b) => b.empreendedor_id === empreendedorId);
      const others = mapped.filter((b) => b.empreendedor_id !== empreendedorId);
      mapped = linked.length > 0 ? [...linked, ...others] : mapped;
    }

    return {
      data: mapped,
      configured: true,
      total: canonical.total ?? mapped.length,
    };
  }

  const client = getAdministraClient();
  if (!client) {
    return {
      data: [],
      configured: canonical.configured,
      total: null,
      error: canonical.error?.userMessage,
    };
  }

  try {
    const rpcRes = await client.rpc('administra_buscar_barragens', {
      p_termo: clean,
      p_empreendedor_id: empreendedorId || null,
    });
    if (!rpcRes.error && Array.isArray(rpcRes.data)) {
      const mapped = (rpcRes.data as Record<string, any>[]).map((r) =>
        mapCanonicalBarragem(r)
      );
      return { data: mapped, configured: true, total: mapped.length };
    }

    let q = client
      .from('administra_barragens')
      .select(
        'id, empreendedor_id, snisb, nome, municipio, upg, sub_bacia, curso_agua, zona, localizacao, lat_gms, long_gms, lat_decimal, long_decimal, altura_maxima, comprimento_coroamento, largura_coroamento, volume_nmo, volume_nmm, tipo_estrutural, tipo_fundacao, finalidade, situacao, dpa_atual, cri_atual, enquadramento_pnsb, sistema_origem, created_by_user_id, created_by_name, created_at, updated_at'
      )
      .order('nome', { ascending: true })
      .limit(safeLimit);

    if (empreendedorId) {
      q = q.eq('empreendedor_id', empreendedorId);
    }
    if (clean) {
      q = q.or(`nome.ilike.%${clean}%,snisb.ilike.%${clean}%,municipio.ilike.%${clean}%`);
    }

    const { data, error } = await q;
    if (error) {
      return {
        data: [],
        configured: true,
        error: 'Não foi possível consultar barragens no Administra.',
      };
    }
    const mapped = (data || []).map((r) => mapCanonicalBarragem(r));
    return { data: mapped, configured: true, total: mapped.length };
  } catch {
    return {
      data: [],
      configured: true,
      error: 'Falha de comunicação com o Administra Barragens.',
    };
  }
}

export async function searchResponsaveisTecnicos(
  query = '',
  pageSize = 25
): Promise<{
  data: Array<ResponsavelTecnicoMaster & { art?: string | null; arts?: RtArtVinculo[] }>;
  configured: boolean;
  total?: number | null;
  error?: string;
}> {
  const clean = normalizeText(query);
  const safeLimit = Math.max(1, Math.min(50, pageSize));

  const canonical = await fetchRtsPage(1, safeLimit, clean);
  if (canonical.configured && !canonical.error) {
    const mapped = canonical.data.map((item) =>
      mapCanonicalRt(item.record, item.vinculosBarragem)
    );
    return {
      data: mapped,
      configured: true,
      total: canonical.total ?? mapped.length,
    };
  }

  const client = getAdministraClient();
  if (!client) {
    return {
      data: [],
      configured: canonical.configured,
      total: null,
      error: canonical.error?.userMessage,
    };
  }

  try {
    const rpcRes = await client.rpc('administra_buscar_rts', { p_termo: clean });
    if (!rpcRes.error && Array.isArray(rpcRes.data)) {
      const mapped = (rpcRes.data as Record<string, any>[]).map((r) => mapCanonicalRt(r));
      return { data: mapped, configured: true, total: mapped.length };
    }

    let q = client
      .from('administra_responsaveis_tecnicos')
      .select(
        'id, nome, cpf, registro_profissional, email, telefone, sistema_origem, created_by_user_id, created_by_name, created_at, updated_at'
      )
      .order('nome', { ascending: true })
      .limit(safeLimit);

    if (clean) {
      q = q.or(`nome.ilike.%${clean}%,registro_profissional.ilike.%${clean}%`);
    }

    const { data, error } = await q;
    if (error) {
      return {
        data: [],
        configured: true,
        error: 'Não foi possível consultar responsáveis técnicos no Administra.',
      };
    }
    const mapped = (data || []).map((r) => mapCanonicalRt(r));
    return { data: mapped, configured: true, total: mapped.length };
  } catch {
    return {
      data: [],
      configured: true,
      error: 'Falha de comunicação com o Administra Barragens.',
    };
  }
}

// ============================================================================
// ESCRITA NA BASE MESTRE COM REGRA DE PROPRIEDADE POR SISTEMA DE ORIGEM
// ============================================================================

export function canClassificaEditDirectly(sistemaOrigem?: SistemaOrigem | null): boolean {
  return !sistemaOrigem || sistemaOrigem === CURRENT_SYSTEM;
}

export async function saveEmpreendedorMaster(
  payload: Partial<EmpreendedorMaster> & { cpf_cnpj?: string | null; razao_social: string },
  currentUser: User
): Promise<MasterWriteResult<EmpreendedorMaster>> {
  if (currentUser.role === 'Visualizador') {
    return { success: false, message: 'Usuários com perfil Visualizador não podem cadastrar ou alterar dados mestres.' };
  }

  if (CLASSIFICA_INTEGRATION_ARCHITECTURE.masterWriteApi.blocked) {
    return buildBlockedMasterWriteResult();
  }

  const cleanRazao = normalizeText(payload.razao_social);
  if (cleanRazao.length < 2) {
    return { success: false, message: 'Informe o nome ou razão social do empreendedor.' };
  }

  const cpfCnpjDigits = normalizeDigits(payload.cpf_cnpj);
  if (cpfCnpjDigits.length > 0 && cpfCnpjDigits.length !== 11 && cpfCnpjDigits.length !== 14) {
    return { success: false, message: 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido, ou deixe o campo em branco caso não disponível.' };
  }

  if (payload.id && payload.sistema_origem && !canClassificaEditDirectly(payload.sistema_origem)) {
    return {
      success: false,
      ownershipConflict: true,
      ownerSystem: payload.sistema_origem,
      message: `Este empreendedor pertence ao sistema ${SYSTEM_LABELS[payload.sistema_origem]}. Envie uma solicitação de alteração.`,
    };
  }

  const cleanPayload = {
    cpf_cnpj: cpfCnpjDigits || null,
    tipo_pessoa: (cpfCnpjDigits.length === 14 ? 'PJ' : 'PF') as 'PF' | 'PJ',
    razao_social: cleanRazao,
    nome_fantasia: payload.nome_fantasia ? normalizeText(payload.nome_fantasia) : null,
    email: payload.email ? payload.email.trim().toLowerCase() : null,
    telefone: payload.telefone ? payload.telefone.trim() : null,
    endereco: payload.endereco ? normalizeText(payload.endereco) : null,
    municipio: payload.municipio ? normalizeText(payload.municipio) : null,
    num_car: payload.num_car ? normalizeText(payload.num_car) : null,
  };

  try {
    const serverRes = await callAdministraEscritaEndpoint({
      action: 'salvar_empreendedor',
      id: payload.id || null,
      ...cleanPayload,
    });

    if (serverRes.ok && serverRes.data?.empreendedor) {
      const mapped = mapCanonicalEmpreendedor(serverRes.data.empreendedor as AdministraRecord);
      await logActivity(payload.id ? 'ECOSYSTEM_ENTITY_UPDATED' : 'ECOSYSTEM_ENTITY_CREATED', {
        entidade: 'empreendedor',
        empreendedor_id: mapped.id,
        destino: 'ADMINISTRA_BARRAGENS',
      });
      return { success: true, data: mapped };
    }

    if (serverRes.blocked || serverRes.status === 409) {
      return buildBlockedMasterWriteResult(serverRes.message);
    }

    return {
      success: false,
      code: serverRes.code,
      notConfigured: !serverRes.configured,
      message: serverRes.message || 'Não foi possível salvar o empreendedor no Administra Barragens.',
    };
  } catch {
    return { success: false, message: 'Erro de comunicação ao salvar empreendedor no Administra.' };
  }
}

export async function saveBarragemMaster(
  payload: Partial<BarragemMaster> & { nome: string; municipio?: string | null },
  currentUser: User
): Promise<MasterWriteResult<BarragemMaster>> {
  if (currentUser.role === 'Visualizador') {
    return { success: false, message: 'Usuários com perfil Visualizador não podem cadastrar ou alterar barragens.' };
  }

  if (CLASSIFICA_INTEGRATION_ARCHITECTURE.masterWriteApi.blocked) {
    return buildBlockedMasterWriteResult();
  }

  const cleanNome = normalizeText(payload.nome);
  if (cleanNome.length < 2) {
    return { success: false, message: 'Informe o nome da barragem ou empreendimento.' };
  }

  if (payload.id && payload.sistema_origem && !canClassificaEditDirectly(payload.sistema_origem)) {
    return {
      success: false,
      ownershipConflict: true,
      ownerSystem: payload.sistema_origem,
      message: `Esta barragem foi cadastrada pelo sistema ${SYSTEM_LABELS[payload.sistema_origem]}. Envie uma solicitação de alteração.`,
    };
  }

  const cleanPayload = {
    empreendedor_id: payload.empreendedor_id || null,
    snisb: payload.snisb ? payload.snisb.trim().toUpperCase() : null,
    nome: cleanNome,
    municipio: payload.municipio ? normalizeText(payload.municipio) : '',
    upg: payload.upg ? normalizeText(payload.upg) : null,
    sub_bacia: payload.sub_bacia ? normalizeText(payload.sub_bacia) : null,
    curso_agua: payload.curso_agua ? normalizeText(payload.curso_agua) : null,
    zona: payload.zona || 'Rural',
    localizacao: payload.localizacao ? normalizeText(payload.localizacao) : null,
    lat_gms: normalizeCoordinateToGMS(payload.lat_gms, payload.lat_decimal) || null,
    long_gms: normalizeCoordinateToGMS(payload.long_gms, payload.long_decimal) || null,
    lat_decimal:
      typeof payload.lat_decimal === 'number' && Number.isFinite(payload.lat_decimal)
        ? payload.lat_decimal
        : null,
    long_decimal:
      typeof payload.long_decimal === 'number' && Number.isFinite(payload.long_decimal)
        ? payload.long_decimal
        : null,
    altura_maxima: payload.altura_maxima || null,
    comprimento_coroamento: payload.comprimento_coroamento || null,
    largura_coroamento: payload.largura_coroamento || null,
    volume_nmo: payload.volume_nmo || null,
    volume_nmm: payload.volume_nmm || null,
    tipo_estrutural: payload.tipo_estrutural || null,
    tipo_fundacao: payload.tipo_fundacao || null,
    finalidade: payload.finalidade || null,
    situacao: payload.situacao || null,
    dpa_atual: payload.dpa_atual || null,
    cri_atual: payload.cri_atual || null,
    enquadramento_pnsb: payload.enquadramento_pnsb ?? null,
  };

  try {
    const serverRes = await callAdministraEscritaEndpoint({
      action: 'salvar_barragem',
      id: payload.id || null,
      ...cleanPayload,
    });

    if (serverRes.ok && serverRes.data?.barragem) {
      const mapped = mapCanonicalBarragem(serverRes.data.barragem as AdministraRecord);
      await logActivity(payload.id ? 'ECOSYSTEM_ENTITY_UPDATED' : 'ECOSYSTEM_ENTITY_CREATED', {
        entidade: 'barragem',
        barragem_id: mapped.id,
        destino: 'ADMINISTRA_BARRAGENS',
      });
      return { success: true, data: mapped };
    }

    if (serverRes.blocked || serverRes.status === 409) {
      return buildBlockedMasterWriteResult(serverRes.message);
    }

    return {
      success: false,
      code: serverRes.code,
      notConfigured: !serverRes.configured,
      message: serverRes.message || 'Não foi possível salvar a barragem no Administra Barragens.',
    };
  } catch {
    return { success: false, message: 'Erro de comunicação ao salvar barragem no Administra.' };
  }
}

export async function saveResponsavelTecnicoMaster(
  payload: Partial<ResponsavelTecnicoMaster> & { nome: string },
  currentUser: User
): Promise<MasterWriteResult<ResponsavelTecnicoMaster>> {
  if (currentUser.role === 'Visualizador') {
    return { success: false, message: 'Usuários com perfil Visualizador não podem alterar responsáveis técnicos.' };
  }

  if (CLASSIFICA_INTEGRATION_ARCHITECTURE.masterWriteApi.blocked) {
    return buildBlockedMasterWriteResult();
  }

  if (payload.id && payload.sistema_origem && !canClassificaEditDirectly(payload.sistema_origem)) {
    return {
      success: false,
      ownershipConflict: true,
      ownerSystem: payload.sistema_origem,
      message: `Este responsável técnico pertence ao sistema ${SYSTEM_LABELS[payload.sistema_origem]}. Envie uma solicitação de alteração.`,
    };
  }

  return buildBlockedMasterWriteResult();
}

async function callAdministraEscritaEndpoint(
  payload: Record<string, unknown>
): Promise<{
  ok: boolean;
  blocked: boolean;
  configured: boolean;
  status: number;
  data?: any;
  message?: string;
  code?: string;
}> {
  const token = await getClassificaAccessToken();
  if (!token) {
    return {
      ok: false,
      blocked: false,
      configured: false,
      status: 401,
      code: 'AUTH_REQUIRED',
      message: 'Sessão autenticada do Classifica CSB obrigatória.',
    };
  }

  try {
    const response = await fetch('/api/administra-escrita', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return {
        ok: false,
        blocked: response.status === 409,
        configured: false,
        status: response.status,
        code: 'ENDPOINT_UNAVAILABLE',
        message: 'Endpoint /api/administra-escrita indisponível.',
      };
    }

    const json = await response.json();
    const isBlocked = response.status === 409 || json?.blocked === true;
    if (!response.ok || !json?.ok) {
      return {
        ok: false,
        blocked: isBlocked,
        configured: json?.configured !== false,
        status: response.status,
        code: json?.code,
        message:
          typeof json?.error === 'string'
            ? json.error
            : json?.error?.message || 'Erro ao acessar endpoint do Administra Barragens.',
      };
    }

    return { ok: true, blocked: false, configured: true, status: response.status, data: json };
  } catch (err: any) {
    return {
      ok: false,
      blocked: false,
      configured: false,
      status: 0,
      code: 'NETWORK_ERROR',
      message: err?.message || 'Falha de comunicação com o servidor do Administra.',
    };
  }
}

export async function listArtsForRt(
  rtId: string
): Promise<{ data: RtArtVinculo[]; error?: string }> {
  if (!rtId) return { data: [] };
  const serverRes = await callAdministraEscritaEndpoint({
    action: 'listar_arts_rt',
    rtId,
  });

  if (serverRes.ok) {
    return { data: (serverRes.data?.items || []) as RtArtVinculo[] };
  }

  return { data: [], error: serverRes.message };
}

export async function saveArtForRt(
  params: {
    rtId: string;
    art: string;
    barragemId?: string | null;
    atividade?: string | null;
    observacao?: string | null;
  },
  currentUser: User
): Promise<MasterWriteResult<RtArtVinculo>> {
  if (currentUser.role === 'Visualizador') {
    return {
      success: false,
      message: 'Usuários com perfil Visualizador não podem cadastrar ARTs no Administra.',
    };
  }

  if (CLASSIFICA_INTEGRATION_ARCHITECTURE.masterWriteApi.blocked) {
    return buildBlockedMasterWriteResult();
  }

  const cleanArt = normalizeText(params.art);
  if (!params.rtId || cleanArt.length < 2) {
    return {
      success: false,
      message: 'Selecione o RT e informe um número de ART válido.',
    };
  }

  const serverRes = await callAdministraEscritaEndpoint({
    action: 'salvar_art_rt',
    rtId: params.rtId,
    art: cleanArt,
    barragemId: params.barragemId || null,
    atividade: params.atividade ? normalizeText(params.atividade) : null,
    observacao: params.observacao ? normalizeText(params.observacao) : null,
  });

  if (serverRes.ok && serverRes.data?.artItem) {
    await logActivity('ECOSYSTEM_ENTITY_CREATED', {
      entidade: 'art_rt',
      rt_id: params.rtId,
      art: cleanArt,
      destino: 'ADMINISTRA_BARRAGENS',
    });
    return { success: true, data: serverRes.data.artItem as RtArtVinculo };
  }

  if (serverRes.blocked || serverRes.status === 409) {
    return buildBlockedMasterWriteResult(serverRes.message);
  }

  return {
    success: false,
    code: serverRes.code,
    notConfigured: !serverRes.configured,
    message: serverRes.message || 'Não foi possível salvar a ART no Administra.',
  };
}

export async function createResponsavelTecnicoInAdministra(
  payload: {
    nome: string;
    cpf?: string;
    registro_profissional?: string;
    email?: string;
    telefone?: string;
    art?: string;
    barragemId?: string | null;
  },
  currentUser: User
): Promise<
  MasterWriteResult<{
    rt: ResponsavelTecnicoMaster & { art?: string | null; arts?: RtArtVinculo[] };
    artItem?: RtArtVinculo | null;
    artSaveWarning?: string;
  }>
> {
  if (currentUser.role === 'Visualizador') {
    return {
      success: false,
      message: 'Usuários com perfil Visualizador não podem cadastrar RTs no Administra.',
    };
  }

  if (CLASSIFICA_INTEGRATION_ARCHITECTURE.masterWriteApi.blocked) {
    return buildBlockedMasterWriteResult();
  }

  const cleanNome = normalizeText(payload.nome);
  if (cleanNome.length < 2) {
    return { success: false, message: 'Informe o nome completo do Responsável Técnico.' };
  }

  const serverRes = await callAdministraEscritaEndpoint({
    action: 'salvar_rt',
    nome: cleanNome,
    cpf: payload.cpf ? normalizeDigits(payload.cpf) : null,
    registro_profissional: payload.registro_profissional
      ? normalizeText(payload.registro_profissional).toUpperCase()
      : null,
    email: payload.email ? payload.email.trim().toLowerCase() : null,
    telefone: payload.telefone ? payload.telefone.trim() : null,
    art: payload.art ? normalizeText(payload.art) : null,
    barragemId: payload.barragemId || null,
  });

  if (serverRes.ok && serverRes.data?.rt) {
    const mappedRt = mapCanonicalRt(serverRes.data.rt as AdministraRecord);
    const artItem = (serverRes.data.artItem || null) as RtArtVinculo | null;
    if (artItem) {
      mappedRt.art = artItem.art;
      mappedRt.arts = [artItem, ...(mappedRt.arts || [])];
    }

    await logActivity('ECOSYSTEM_ENTITY_CREATED', {
      entidade: 'responsavel_tecnico',
      rt_id: mappedRt.id,
      art: artItem?.art || null,
      destino: 'ADMINISTRA_BARRAGENS',
    });

    return {
      success: true,
      data: {
        rt: mappedRt,
        artItem,
        artSaveWarning: serverRes.data.artSaveWarning,
      },
    };
  }

  if (serverRes.blocked || serverRes.status === 409) {
    return buildBlockedMasterWriteResult(serverRes.message);
  }

  return {
    success: false,
    code: serverRes.code,
    notConfigured: !serverRes.configured,
    message: serverRes.message || 'Não foi possível cadastrar o RT no Administra.',
  };
}

// ============================================================================
// SOLICITAÇÕES DE ALTERAÇÃO ENTRE SISTEMAS (APROVAR / REPROVAR)
// ============================================================================

export async function createChangeRequest(
  params: {
    entidade_tipo: EntidadeTipoEcossistema;
    entidade_id: string;
    entidade_rotulo: string;
    sistema_destino_proprietario: SistemaOrigem;
    dados_atuais: Record<string, any>;
    dados_propostos: Record<string, any>;
    justificativa: string;
  },
  currentUser: User
): Promise<{ success: boolean; message?: string }> {
  const client = getAdministraClient();
  if (!client) {
    return { success: false, message: 'Administra Barragens ainda não está configurado para envio de solicitações.' };
  }

  if (currentUser.role === 'Visualizador') {
    return { success: false, message: 'Perfil Visualizador não pode enviar solicitações de alteração.' };
  }

  if (!params.justificativa.trim() || params.justificativa.trim().length < 5) {
    return { success: false, message: 'Informe uma justificativa clara para a alteração solicitada.' };
  }

  try {
    const { error } = await client.rpc('administra_criar_solicitacao', {
      p_entidade_tipo: params.entidade_tipo,
      p_entidade_id: params.entidade_id,
      p_entidade_rotulo: params.entidade_rotulo,
      p_sistema_solicitante: CURRENT_SYSTEM,
      p_sistema_destino: params.sistema_destino_proprietario,
      p_solicitante_user_id: currentUser.authUserId,
      p_solicitante_nome: currentUser.name,
      p_solicitante_email: currentUser.email || '',
      p_dados_atuais: params.dados_atuais,
      p_dados_propostos: params.dados_propostos,
      p_justificativa: params.justificativa.trim(),
    });

    if (error) {
      return { success: false, message: 'Não foi possível registrar a solicitação de alteração.' };
    }

    await logActivity('ECOSYSTEM_CHANGE_REQUEST_SENT', {
      entidade_tipo: params.entidade_tipo,
      entidade_id: params.entidade_id,
      sistema_destino: params.sistema_destino_proprietario,
    });

    return { success: true };
  } catch {
    return { success: false, message: 'Falha de comunicação ao enviar solicitação de alteração.' };
  }
}

export async function listChangeRequests(
  scope: 'incoming' | 'outgoing' | 'all' = 'all'
): Promise<{ data: SolicitacaoAlteracao[]; configured: boolean; error?: string }> {
  const client = getAdministraClient();
  if (!client) return { data: [], configured: false };

  try {
    const rpcRes = await client.rpc('administra_listar_solicitacoes', {
      p_sistema: CURRENT_SYSTEM,
      p_escopo: scope,
    });
    if (!rpcRes.error && Array.isArray(rpcRes.data)) {
      return { data: rpcRes.data as SolicitacaoAlteracao[], configured: true };
    }

    let q = client
      .from('administra_solicitacoes_alteracao')
      .select('id, entidade_tipo, entidade_id, entidade_rotulo, sistema_solicitante, sistema_destino_proprietario, solicitante_user_id, solicitante_nome, solicitante_email, dados_atuais, dados_propostos, justificativa, status, analisado_por_user_id, analisado_por_nome, parecer_analise, created_at, analisado_at')
      .order('created_at', { ascending: false })
      .limit(100);

    if (scope === 'incoming') {
      q = q.eq('sistema_destino_proprietario', CURRENT_SYSTEM);
    } else if (scope === 'outgoing') {
      q = q.eq('sistema_solicitante', CURRENT_SYSTEM);
    }

    const { data, error } = await q;
    if (error) return { data: [], configured: true, error: 'Erro ao carregar solicitações de alteração.' };
    return { data: (data || []) as SolicitacaoAlteracao[], configured: true };
  } catch {
    return { data: [], configured: true, error: 'Falha de comunicação ao listar solicitações.' };
  }
}

export async function reviewChangeRequest(
  requestId: string,
  decision: 'aprovada' | 'reprovada',
  parecerAnalise: string,
  currentUser: User
): Promise<{ success: boolean; message?: string }> {
  const client = getAdministraClient();
  if (!client) {
    return { success: false, message: 'Administra Barragens ainda não está conectado.' };
  }

  if (currentUser.role !== 'Administrador' && currentUser.role !== 'Analista') {
    return { success: false, message: 'Apenas Analistas ou Administradores podem aprovar ou reprovar alterações.' };
  }

  try {
    const { error } = await client.rpc('administra_revisar_solicitacao', {
      p_solicitacao_id: requestId,
      p_decisao: decision,
      p_sistema_revisor: CURRENT_SYSTEM,
      p_revisor_user_id: currentUser.authUserId,
      p_revisor_nome: currentUser.name,
      p_parecer: parecerAnalise.trim() || null,
    });

    if (error) {
      return { success: false, message: 'Não foi possível processar a revisão da solicitação.' };
    }

    await logActivity('ECOSYSTEM_CHANGE_REQUEST_REVIEWED', {
      solicitacao_id: requestId,
      decisao: decision,
    });

    return { success: true };
  } catch {
    return { success: false, message: 'Falha ao enviar decisão da solicitação.' };
  }
}

// ============================================================================
// DESCOBERTA CRUZADA E SINCRONIZAÇÃO DE PRODUTOS DO ECOSSISTEMA
// ============================================================================

export function mapLocalDocToEcosystemSummary(doc: AppDocument): ProdutoEcossistemaResumo {
  const anyDoc = doc as any;
  const empreendedorNome =
    anyDoc.razaoSocial ||
    anyDoc.interessado ||
    anyDoc.nomeEmpreendedor ||
    anyDoc.empreendedor ||
    anyDoc.novoProprietario ||
    null;

  const cpfCnpj = anyDoc.cpfCnpj || anyDoc.novoDoc || null;
  const barragemNome = anyDoc.barragemPrincipal?.nome || anyDoc.nomeFazenda || null;
  const snisb = anyDoc.barragemPrincipal?.snisb || anyDoc.snisb || null;

  return {
    id: `local_${doc.id || Math.random().toString(36).slice(2)}`,
    sistema_origem: CURRENT_SYSTEM,
    produto_origem_id: doc.id || '',
    tipo_produto: doc.tipo_documento,
    numero_documento: anyDoc.protocolo || anyDoc.processo || anyDoc.numProcesso || anyDoc.nProcesso || null,
    status: doc.status || 'Rascunho',
    data_documento: anyDoc.data || anyDoc.dataProtocolo || doc.created_at || null,
    analista_nome: anyDoc.analista || null,
    empreendedor_id: anyDoc.empreendedorId || null,
    empreendedor_nome: empreendedorNome,
    empreendedor_cpf_cnpj: cpfCnpj ? normalizeDigits(cpfCnpj) : null,
    barragem_id: anyDoc.barragemId || null,
    barragem_nome: barragemNome,
    barragem_snisb: snisb,
    municipio: anyDoc.municipio || anyDoc.municipioEmpreendimento || null,
    created_at: doc.created_at,
  };
}

export async function getEcosystemProductsByEntity(params: {
  empreendedorId?: string | null;
  cpfCnpj?: string | null;
  barragemId?: string | null;
  snisb?: string | null;
  localDocuments?: AppDocument[];
}): Promise<{ products: ProdutoEcossistemaResumo[]; administraConnected: boolean }> {
  const results: ProdutoEcossistemaResumo[] = [];
  const seen = new Set<string>();

  const pushUnique = (item: ProdutoEcossistemaResumo) => {
    const key = `${item.sistema_origem}:${item.produto_origem_id || item.numero_documento || item.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push(item);
  };

  const targetDigits = normalizeDigits(params.cpfCnpj);
  const targetSnisb = (params.snisb || '').trim().toUpperCase();

  // 1. Produtos locais do próprio Classifica CSB
  if (params.localDocuments?.length) {
    for (const doc of params.localDocuments) {
      const summary = mapLocalDocToEcosystemSummary(doc);
      const matchEmp =
        (params.empreendedorId && summary.empreendedor_id === params.empreendedorId) ||
        (targetDigits && summary.empreendedor_cpf_cnpj === targetDigits);
      const matchBar =
        (params.barragemId && summary.barragem_id === params.barragemId) ||
        (targetSnisb && (summary.barragem_snisb || '').trim().toUpperCase() === targetSnisb);

      if (matchEmp || matchBar) {
        pushUnique(summary);
      }
    }
  }

  // 2. Índice unificado no Administra Barragens (agrega Classifica, Notifica e Fiscaliza)
  const administra = getAdministraClient();
  if (administra) {
    try {
      const rpcRes = await administra.rpc('administra_consultar_produtos_entidade', {
        p_empreendedor_id: params.empreendedorId || null,
        p_cpf_cnpj: targetDigits || null,
        p_barragem_id: params.barragemId || null,
        p_snisb: targetSnisb || null,
      });

      if (!rpcRes.error && Array.isArray(rpcRes.data)) {
        for (const item of rpcRes.data as ProdutoEcossistemaResumo[]) {
          pushUnique(item);
        }
      }
    } catch {
      // Silencioso caso o índice ainda não exista no Administra
    }
  }

  // 3. Consultas opcionais diretas somente leitura em Notifica CSB e Fiscaliza Barragens
  const readOnlyPeers: Array<{ client: ReturnType<typeof getNotificaReadOnlyClient>; sistema: SistemaOrigem; rpc: string }> = [
    { client: getNotificaReadOnlyClient(), sistema: 'NOTIFICA_CSB', rpc: 'notifica_consultar_produtos_entidade' },
    { client: getFiscalizaReadOnlyClient(), sistema: 'FISCALIZA_BARRAGENS', rpc: 'fiscaliza_consultar_produtos_entidade' },
  ];

  await Promise.all(
    readOnlyPeers.map(async ({ client, sistema, rpc }) => {
      if (!client) return;
      try {
        const res = await client.rpc(rpc, {
          p_empreendedor_id: params.empreendedorId || null,
          p_cpf_cnpj: targetDigits || null,
          p_barragem_id: params.barragemId || null,
          p_snisb: targetSnisb || null,
        });
        if (!res.error && Array.isArray(res.data)) {
          for (const item of res.data as ProdutoEcossistemaResumo[]) {
            pushUnique({ ...item, sistema_origem: item.sistema_origem || sistema });
          }
        }
      } catch {
        // Peer ainda não provisionado ou RPC ausente
      }
    })
  );

  results.sort((a, b) => {
    const tA = new Date(a.data_documento || a.created_at || 0).getTime();
    const tB = new Date(b.data_documento || b.created_at || 0).getTime();
    return tB - tA;
  });

  return { products: results, administraConnected: isAdministraConfigured() };
}

export async function syncClassificaProductToAdministra(
  summary: Omit<ProdutoEcossistemaResumo, 'id' | 'sistema_origem'>,
  currentUser?: User | null
): Promise<{ synced: boolean; reason?: string }> {
  const client = getAdministraClient();
  if (!client) {
    return { synced: false, reason: 'not_configured' };
  }

  try {
    const { error } = await client.rpc('administra_registrar_produto_ecossistema', {
      p_sistema_origem: CURRENT_SYSTEM,
      p_produto_origem_id: summary.produto_origem_id,
      p_tipo_produto: summary.tipo_produto,
      p_numero_documento: summary.numero_documento || null,
      p_status: summary.status || 'Rascunho',
      p_data_documento: summary.data_documento || null,
      p_analista_nome: summary.analista_nome || currentUser?.name || null,
      p_empreendedor_id: summary.empreendedor_id || null,
      p_empreendedor_nome: summary.empreendedor_nome || null,
      p_empreendedor_cpf_cnpj: summary.empreendedor_cpf_cnpj ? normalizeDigits(summary.empreendedor_cpf_cnpj) : null,
      p_barragem_id: summary.barragem_id || null,
      p_barragem_nome: summary.barragem_nome || null,
      p_barragem_snisb: summary.barragem_snisb || null,
      p_municipio: summary.municipio || null,
    });

    if (error) return { synced: false, reason: 'rpc_error' };

    await logActivity('ECOSYSTEM_SYNC_PRODUCT', {
      produto_id: summary.produto_origem_id,
      tipo: summary.tipo_produto,
    });

    return { synced: true };
  } catch {
    return { synced: false, reason: 'network_error' };
  }
}

// ============================================================================
// LEITURA CANÔNICA SERVER-SIDE (ADMINISTRA BARRAGENS VIA /api/administra-leitura)
// RPCs permitidas: csb_ler_empreendedores, csb_ler_barragens, csb_ler_rts,
// csb_ler_vinculos_rt_barragem
// ============================================================================

export type AdministraCanonicalTable =
  | 'empreendedores'
  | 'barragens'
  | 'rts'
  | 'responsaveis_tecnicos_barragens';

export type AdministraRpcName =
  | 'csb_ler_empreendedores'
  | 'csb_ler_barragens'
  | 'csb_ler_rts'
  | 'csb_ler_vinculos_rt_barragem';

export type AdministraRecord = Record<string, any>;

export interface AdministraReadError {
  table?: AdministraCanonicalTable;
  rpc?: AdministraRpcName;
  status?: number;
  code?: string;
  message: string;
  details?: string | null;
  hint?: string | null;
  isRlsOrPermission: boolean;
  userMessage: string;
}

export interface AdministraTableDiagnostic {
  rpc: AdministraRpcName;
  table: AdministraCanonicalTable;
  accessible: boolean;
  totalCount: number | null;
  hasRecords?: boolean;
  error?: AdministraReadError;
}

export interface AdministraPageResult<T = AdministraRecord> {
  data: T[];
  total: number | null;
  hasMore: boolean;
  page: number;
  pageSize: number;
  configured: boolean;
  error?: AdministraReadError;
  relationErrors: AdministraReadError[];
}

export interface EmpreendedorWithRelations {
  record: AdministraRecord;
  barragens: AdministraRecord[];
}

export interface BarragemWithRelations {
  record: AdministraRecord;
  empreendedor: AdministraRecord | null;
  vinculosRt: Array<{
    vinculo: AdministraRecord;
    rt: AdministraRecord | null;
  }>;
}

export interface RtWithRelations {
  record: AdministraRecord;
  vinculosBarragem: Array<{
    vinculo: AdministraRecord;
    barragem: AdministraRecord | null;
  }>;
}

export interface VinculoRtBarragemWithRelations {
  vinculo: AdministraRecord;
  rt: AdministraRecord | null;
  barragem: AdministraRecord | null;
  empreendedor: AdministraRecord | null;
}

type AdministraEndpointAction =
  | 'diagnostico'
  | 'empreendedores'
  | 'barragens'
  | 'rts'
  | 'vinculos_rt_barragem';

function buildClientError(
  message: string,
  opts: {
    table?: AdministraCanonicalTable;
    rpc?: AdministraRpcName;
    status?: number;
    code?: string;
    details?: string | null;
    hint?: string | null;
    isRlsOrPermission?: boolean;
  } = {}
): AdministraReadError {
  const code = opts.code;
  const status = opts.status;
  const lower = message.toLowerCase();
  const isRlsOrPermission =
    opts.isRlsOrPermission ??
    (code === '42501' ||
      code === 'PGRST301' ||
      code === 'AUTH_REQUIRED' ||
      code === 'INVALID_SESSION' ||
      code === 'FORBIDDEN_PROFILE' ||
      status === 401 ||
      status === 403 ||
      lower.includes('permission denied') ||
      lower.includes('row-level security') ||
      lower.includes('policy'));

  return {
    table: opts.table,
    rpc: opts.rpc,
    status,
    code,
    message,
    details: opts.details ?? null,
    hint: opts.hint ?? null,
    isRlsOrPermission,
    userMessage: message,
  };
}

async function getClassificaAccessToken(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  } catch {
    return null;
  }
}

async function callAdministraLeituraEndpoint(
  payload: {
    action: AdministraEndpointAction;
    busca?: string;
    page?: number;
    pageSize?: number;
  },
  fallbackTable?: AdministraCanonicalTable
): Promise<{
  ok: boolean;
  configured: boolean;
  status: number;
  data?: any;
  error?: AdministraReadError;
}> {
  const token = await getClassificaAccessToken();
  if (!token) {
    return {
      ok: false,
      configured: false,
      status: 401,
      error: buildClientError(
        'Sessão autenticada do Classifica CSB obrigatória para consultar o Administra Barragens.',
        {
          table: fallbackTable,
          status: 401,
          code: 'AUTH_REQUIRED',
          isRlsOrPermission: true,
        }
      ),
    };
  }

  try {
    const response = await fetch('/api/administra-leitura', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return {
        ok: false,
        configured: false,
        status: response.status,
        error: buildClientError(
          `Endpoint /api/administra-leitura indisponível neste servidor (HTTP ${response.status}).`,
          {
            table: fallbackTable,
            status: response.status,
            code: 'ENDPOINT_UNAVAILABLE',
            isRlsOrPermission: false,
          }
        ),
      };
    }

    const json = await response.json();
    if (!response.ok || !json?.ok) {
      const serverErr = json?.error;
      if (serverErr && typeof serverErr === 'object') {
        return {
          ok: false,
          configured: json?.configured !== false,
          status: response.status,
          error: buildClientError(
            serverErr.userMessage || serverErr.message || 'Erro ao consultar Administra Barragens.',
            {
              table: fallbackTable,
              rpc: serverErr.rpc,
              status: serverErr.status ?? response.status,
              code: serverErr.code || json?.code,
              details: serverErr.details,
              hint: serverErr.hint,
              isRlsOrPermission: serverErr.isRlsOrPermission,
            }
          ),
        };
      }

      return {
        ok: false,
        configured: json?.configured !== false,
        status: response.status,
        error: buildClientError(
          typeof json?.error === 'string'
            ? json.error
            : `Falha ao consultar /api/administra-leitura (HTTP ${response.status}).`,
          {
            table: fallbackTable,
            status: response.status,
            code: json?.code,
          }
        ),
      };
    }

    return {
      ok: true,
      configured: json?.configured !== false,
      status: response.status,
      data: json,
    };
  } catch (err: any) {
    return {
      ok: false,
      configured: false,
      status: 0,
      error: buildClientError(
        err?.message || 'Falha de comunicação com o endpoint /api/administra-leitura.',
        {
          table: fallbackTable,
          code: 'NETWORK_ERROR',
          isRlsOrPermission: false,
        }
      ),
    };
  }
}

export async function checkAdministraCanonicalAccess(): Promise<{
  configured: boolean;
  diagnostics: AdministraTableDiagnostic[];
  error?: AdministraReadError;
}> {
  const defaultTables: Array<{ rpc: AdministraRpcName; table: AdministraCanonicalTable }> = [
    { rpc: 'csb_ler_empreendedores', table: 'empreendedores' },
    { rpc: 'csb_ler_barragens', table: 'barragens' },
    { rpc: 'csb_ler_rts', table: 'rts' },
    { rpc: 'csb_ler_vinculos_rt_barragem', table: 'responsaveis_tecnicos_barragens' },
  ];

  const res = await callAdministraLeituraEndpoint({ action: 'diagnostico' });
  if (!res.ok) {
    return {
      configured: res.configured,
      diagnostics: defaultTables.map((item) => ({
        rpc: item.rpc,
        table: item.table,
        accessible: false,
        totalCount: null,
        error: res.error,
      })),
      error: res.error,
    };
  }

  return {
    configured: true,
    diagnostics: (res.data?.diagnostics || []) as AdministraTableDiagnostic[],
  };
}

function pickRowKey(record: AdministraRecord | null | undefined, keys: string[]): string {
  if (!record || typeof record !== 'object') return '';
  for (const k of keys) {
    const v = record[k];
    if (v !== null && v !== undefined && String(v).trim() !== '') {
      return String(v);
    }
  }
  return '';
}

export async function fetchEmpreendedoresPage(
  page = 1,
  pageSize = 15,
  query = ''
): Promise<AdministraPageResult<EmpreendedorWithRelations>> {
  const res = await callAdministraLeituraEndpoint(
    { action: 'empreendedores', busca: query, page, pageSize },
    'empreendedores'
  );

  if (!res.ok) {
    return {
      data: [],
      total: null,
      hasMore: false,
      page,
      pageSize,
      configured: res.configured,
      error: res.error,
      relationErrors: [],
    };
  }

  const items = (res.data?.items || []) as AdministraRecord[];
  const barragensByEmp = (res.data?.relations?.barragensByEmpreendedorId || {}) as Record<
    string,
    AdministraRecord[]
  >;

  const data: EmpreendedorWithRelations[] = items.map((record) => {
    const key = pickRowKey(record, ['id', 'empreendedor_id', 'id_empreendedor']);
    return {
      record,
      barragens: key ? barragensByEmp[key] || [] : [],
    };
  });

  return {
    data,
    total: res.data?.total ?? null,
    hasMore: Boolean(res.data?.hasMore),
    page: res.data?.page ?? page,
    pageSize: res.data?.pageSize ?? pageSize,
    configured: true,
    relationErrors: (res.data?.relationErrors || []) as AdministraReadError[],
  };
}

export async function fetchBarragensPage(
  page = 1,
  pageSize = 15,
  query = ''
): Promise<AdministraPageResult<BarragemWithRelations>> {
  const res = await callAdministraLeituraEndpoint(
    { action: 'barragens', busca: query, page, pageSize },
    'barragens'
  );

  if (!res.ok) {
    return {
      data: [],
      total: null,
      hasMore: false,
      page,
      pageSize,
      configured: res.configured,
      error: res.error,
      relationErrors: [],
    };
  }

  const items = (res.data?.items || []) as AdministraRecord[];
  const empreendedoresById = (res.data?.relations?.empreendedoresById || {}) as Record<
    string,
    AdministraRecord
  >;
  const vinculosByBarragemId = (res.data?.relations?.vinculosByBarragemId || {}) as Record<
    string,
    AdministraRecord[]
  >;
  const rtsById = (res.data?.relations?.rtsById || {}) as Record<string, AdministraRecord>;

  const data: BarragemWithRelations[] = items.map((record) => {
    const barKey = pickRowKey(record, ['id', 'barragem_id', 'id_barragem']);
    const empKey = pickRowKey(record, ['empreendedor_id', 'id_empreendedor']);
    const rawVinculos = barKey ? vinculosByBarragemId[barKey] || [] : [];

    return {
      record,
      empreendedor: empKey ? empreendedoresById[empKey] || null : null,
      vinculosRt: rawVinculos.map((vinculo) => {
        const rtKey =
          vinculo?.rt_id !== null && vinculo?.rt_id !== undefined ? String(vinculo.rt_id) : '';
        return {
          vinculo,
          rt: rtKey ? rtsById[rtKey] || null : null,
        };
      }),
    };
  });

  return {
    data,
    total: res.data?.total ?? null,
    hasMore: Boolean(res.data?.hasMore),
    page: res.data?.page ?? page,
    pageSize: res.data?.pageSize ?? pageSize,
    configured: true,
    relationErrors: (res.data?.relationErrors || []) as AdministraReadError[],
  };
}

export async function fetchRtsPage(
  page = 1,
  pageSize = 15,
  query = ''
): Promise<AdministraPageResult<RtWithRelations>> {
  const res = await callAdministraLeituraEndpoint(
    { action: 'rts', busca: query, page, pageSize },
    'rts'
  );

  if (!res.ok) {
    return {
      data: [],
      total: null,
      hasMore: false,
      page,
      pageSize,
      configured: res.configured,
      error: res.error,
      relationErrors: [],
    };
  }

  const items = (res.data?.items || []) as AdministraRecord[];
  const vinculosByRtId = (res.data?.relations?.vinculosByRtId || {}) as Record<
    string,
    AdministraRecord[]
  >;
  const barragensById = (res.data?.relations?.barragensById || {}) as Record<
    string,
    AdministraRecord
  >;

  const data: RtWithRelations[] = items.map((record) => {
    const rtKey = pickRowKey(record, ['id', 'rt_id', 'id_rt']);
    const rawVinculos = rtKey ? vinculosByRtId[rtKey] || [] : [];

    return {
      record,
      vinculosBarragem: rawVinculos.map((vinculo) => {
        const barKey =
          vinculo?.barragem_id !== null && vinculo?.barragem_id !== undefined
            ? String(vinculo.barragem_id)
            : '';
        return {
          vinculo,
          barragem: barKey ? barragensById[barKey] || null : null,
        };
      }),
    };
  });

  return {
    data,
    total: res.data?.total ?? null,
    hasMore: Boolean(res.data?.hasMore),
    page: res.data?.page ?? page,
    pageSize: res.data?.pageSize ?? pageSize,
    configured: true,
    relationErrors: (res.data?.relationErrors || []) as AdministraReadError[],
  };
}

export async function fetchRtBarragensPage(
  page = 1,
  pageSize = 15,
  query = ''
): Promise<AdministraPageResult<VinculoRtBarragemWithRelations>> {
  const res = await callAdministraLeituraEndpoint(
    { action: 'vinculos_rt_barragem', busca: query, page, pageSize },
    'responsaveis_tecnicos_barragens'
  );

  if (!res.ok) {
    return {
      data: [],
      total: null,
      hasMore: false,
      page,
      pageSize,
      configured: res.configured,
      error: res.error,
      relationErrors: [],
    };
  }

  const items = (res.data?.items || []) as AdministraRecord[];
  const rtsById = (res.data?.relations?.rtsById || {}) as Record<string, AdministraRecord>;
  const barragensById = (res.data?.relations?.barragensById || {}) as Record<
    string,
    AdministraRecord
  >;
  const empreendedoresById = (res.data?.relations?.empreendedoresById || {}) as Record<
    string,
    AdministraRecord
  >;

  const data: VinculoRtBarragemWithRelations[] = items.map((vinculo) => {
    const rtKey =
      vinculo?.rt_id !== null && vinculo?.rt_id !== undefined ? String(vinculo.rt_id) : '';
    const barKey =
      vinculo?.barragem_id !== null && vinculo?.barragem_id !== undefined
        ? String(vinculo.barragem_id)
        : '';
    const rt = rtKey ? rtsById[rtKey] || null : null;
    const barragem = barKey ? barragensById[barKey] || null : null;
    const empKey =
      barragem?.empreendedor_id !== null && barragem?.empreendedor_id !== undefined
        ? String(barragem.empreendedor_id)
        : '';
    const empreendedor = empKey ? empreendedoresById[empKey] || null : null;

    return {
      vinculo,
      rt,
      barragem,
      empreendedor,
    };
  });

  return {
    data,
    total: res.data?.total ?? null,
    hasMore: Boolean(res.data?.hasMore),
    page: res.data?.page ?? page,
    pageSize: res.data?.pageSize ?? pageSize,
    configured: true,
    relationErrors: (res.data?.relationErrors || []) as AdministraReadError[],
  };
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
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
  total: number | null;
}

export interface BarragensV2PageResult {
  ok: boolean;
  data: BarragemV2Dto[];
  maskingPolicy: 'masked' | null;
  pagination: BarragensV2Pagination;
  error?: AdministraReadError;
}

export interface FetchBarragensV2Deps {
  getAccessToken?: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}

const BARRAGENS_V2_DEFAULT_LIMIT = 25;
const BARRAGENS_V2_MAX_LIMIT = 100;

function isPlainV2Object(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function readOptionalV2String(value: unknown): { ok: true; value: string | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value === 'string') return { ok: true, value };
  return { ok: false };
}

function readOptionalV2StringOrNumber(
  value: unknown
): { ok: true; value: string | number | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value === 'string') return { ok: true, value };
  if (typeof value === 'number' && Number.isFinite(value)) return { ok: true, value };
  return { ok: false };
}

function parseBarragemV2Dto(raw: unknown): BarragemV2Dto | null {
  if (!isPlainV2Object(raw)) return null;
  const id = raw.id;
  const nome = raw.nome;
  if (typeof id !== 'string' || !id.trim() || typeof nome !== 'string' || !nome.trim()) {
    return null;
  }

  const car = readOptionalV2String(raw.car);
  const uf = readOptionalV2String(raw.uf);
  const municipio = readOptionalV2String(raw.municipio);
  const municipioIbge = readOptionalV2StringOrNumber(raw.municipio_ibge);
  const empreendimento = readOptionalV2String(raw.empreendimento);
  const processo = readOptionalV2String(raw.processo);
  const snisb = readOptionalV2String(raw.snisb);
  const cursoAgua = readOptionalV2String(raw.curso_agua);
  const latitude = readOptionalV2StringOrNumber(raw.latitude);
  const longitude = readOptionalV2StringOrNumber(raw.longitude);
  const altura = readOptionalV2StringOrNumber(raw.altura);
  const volume = readOptionalV2StringOrNumber(raw.volume);
  const danoPotencial = readOptionalV2String(raw.dano_potencial);
  const categoriaRisco = readOptionalV2String(raw.categoria_risco);
  const classificadaEm = readOptionalV2String(raw.classificada_em);
  const situacao = readOptionalV2String(raw.situacao);
  const empreendedorId = readOptionalV2String(raw.empreendedor_id);

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

function normalizeBarragensV2Limit(rawLimit?: number): number {
  if (typeof rawLimit !== 'number' || !Number.isInteger(rawLimit)) {
    return BARRAGENS_V2_DEFAULT_LIMIT;
  }
  return Math.max(1, Math.min(BARRAGENS_V2_MAX_LIMIT, rawLimit));
}

function emptyV2Pagination(limit: number): BarragensV2Pagination {
  return {
    limit,
    nextCursor: null,
    hasMore: false,
    total: null,
  };
}

export async function fetchBarragensV2Page(
  params: { limit?: number; cursor?: string | null } = {},
  deps: FetchBarragensV2Deps = {}
): Promise<BarragensV2PageResult> {
  const safeLimit = normalizeBarragensV2Limit(params.limit);
  const rawCursor = params.cursor;
  let cursor: string | undefined;

  if (rawCursor !== undefined && rawCursor !== null && rawCursor !== '') {
    if (
      typeof rawCursor !== 'string' ||
      rawCursor.length > 512 ||
      /[\x00-\x1f\x7f\s]/.test(rawCursor)
    ) {
      return {
        ok: false,
        data: [],
        maskingPolicy: null,
        pagination: emptyV2Pagination(safeLimit),
        error: buildClientError('Cursor de paginação inválido para consulta v2 de Barragens.', {
          table: 'barragens',
          status: 400,
          code: 'INVALID_CURSOR',
          isRlsOrPermission: false,
        }),
      };
    }
    cursor = rawCursor;
  }

  const resolveToken = deps.getAccessToken ?? getClassificaAccessToken;
  const token = await resolveToken();
  if (!token) {
    return {
      ok: false,
      data: [],
      maskingPolicy: null,
      pagination: emptyV2Pagination(safeLimit),
      error: buildClientError(
        'Sessão autenticada do Classifica CSB obrigatória para consultar Barragens (v2).',
        {
          table: 'barragens',
          status: 401,
          code: 'AUTH_REQUIRED',
          isRlsOrPermission: true,
        }
      ),
    };
  }

  const requestPayload: { action: 'barragens_v2'; limit: number; cursor?: string } = cursor
    ? { action: 'barragens_v2', limit: safeLimit, cursor }
    : { action: 'barragens_v2', limit: safeLimit };

  const fetchImpl = deps.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl('/api/administra-leitura', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestPayload),
    });

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return {
        ok: false,
        data: [],
        maskingPolicy: null,
        pagination: emptyV2Pagination(safeLimit),
        error: buildClientError(
          `Endpoint /api/administra-leitura indisponível para leitura v2 de Barragens (HTTP ${response.status}).`,
          {
            table: 'barragens',
            status: response.status,
            code: 'ENDPOINT_UNAVAILABLE',
            isRlsOrPermission: false,
          }
        ),
      };
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      return {
        ok: false,
        data: [],
        maskingPolicy: null,
        pagination: emptyV2Pagination(safeLimit),
        error: buildClientError(
          `Resposta JSON inválida recebida de /api/administra-leitura (HTTP ${response.status}).`,
          {
            table: 'barragens',
            status: response.status,
            code: 'INVALID_RESPONSE',
            isRlsOrPermission: false,
          }
        ),
      };
    }

    if (!isPlainV2Object(json) || !response.ok || json.ok !== true) {
      const errObj = isPlainV2Object(json) && isPlainV2Object(json.error) ? json.error : null;
      const errString =
        isPlainV2Object(json) && typeof json.error === 'string' && json.error.trim()
          ? json.error.trim().slice(0, 240)
          : null;
      const errCode =
        (errObj && typeof errObj.code === 'string' ? errObj.code : undefined) ||
        (isPlainV2Object(json) && typeof json.code === 'string' ? json.code : undefined);
      const message =
        (errObj && typeof errObj.userMessage === 'string' && errObj.userMessage.trim()) ||
        (errObj && typeof errObj.message === 'string' && errObj.message.trim()) ||
        errString ||
        `Falha ao consultar Barragens v2 em /api/administra-leitura (HTTP ${response.status}).`;

      return {
        ok: false,
        data: [],
        maskingPolicy: null,
        pagination: emptyV2Pagination(safeLimit),
        error: buildClientError(message, {
          table: 'barragens',
          status: response.status,
          code: errCode,
        }),
      };
    }

    if (json.maskingPolicy !== 'masked') {
      return {
        ok: false,
        data: [],
        maskingPolicy: null,
        pagination: emptyV2Pagination(safeLimit),
        error: buildClientError(
          'Resposta da consulta v2 de Barragens rejeitada: maskingPolicy obrigatório deve ser "masked".',
          {
            table: 'barragens',
            status: response.status,
            code: 'INVALID_MASKING_POLICY',
            isRlsOrPermission: false,
          }
        ),
      };
    }

    if (!Array.isArray(json.items)) {
      return {
        ok: false,
        data: [],
        maskingPolicy: null,
        pagination: emptyV2Pagination(safeLimit),
        error: buildClientError(
          'Resposta da consulta v2 de Barragens em formato inválido.',
          {
            table: 'barragens',
            status: response.status,
            code: 'INVALID_RESPONSE_FORMAT',
            isRlsOrPermission: false,
          }
        ),
      };
    }

    if (json.pagination !== undefined && !isPlainV2Object(json.pagination)) {
      return {
        ok: false,
        data: [],
        maskingPolicy: null,
        pagination: emptyV2Pagination(safeLimit),
        error: buildClientError(
          'Metadados de paginação inválidos na resposta v2 de Barragens.',
          {
            table: 'barragens',
            status: response.status,
            code: 'INVALID_PAGINATION',
            isRlsOrPermission: false,
          }
        ),
      };
    }

    const pag = isPlainV2Object(json.pagination) ? json.pagination : {};
    const parsedLimit =
      typeof pag.limit === 'number' && Number.isInteger(pag.limit) && pag.limit >= 1
        ? pag.limit
        : safeLimit;
    const rawNextCursor = pag.nextCursor;
    if (rawNextCursor !== undefined && rawNextCursor !== null && typeof rawNextCursor !== 'string') {
      return {
        ok: false,
        data: [],
        maskingPolicy: null,
        pagination: emptyV2Pagination(safeLimit),
        error: buildClientError(
          'Cursor de próxima página inválido na resposta v2 de Barragens.',
          {
            table: 'barragens',
            status: response.status,
            code: 'INVALID_PAGINATION',
            isRlsOrPermission: false,
          }
        ),
      };
    }
    const nextCursor =
      typeof rawNextCursor === 'string' && rawNextCursor.length > 0 ? rawNextCursor : null;
    if (pag.hasMore !== undefined && typeof pag.hasMore !== 'boolean') {
      return {
        ok: false,
        data: [],
        maskingPolicy: null,
        pagination: emptyV2Pagination(safeLimit),
        error: buildClientError(
          'Indicador hasMore inválido na resposta v2 de Barragens.',
          {
            table: 'barragens',
            status: response.status,
            code: 'INVALID_PAGINATION',
            isRlsOrPermission: false,
          }
        ),
      };
    }
    const hasMore = typeof pag.hasMore === 'boolean' ? pag.hasMore : nextCursor !== null;
    const total =
      typeof pag.total === 'number' && Number.isInteger(pag.total) && pag.total >= 0
        ? pag.total
        : null;

    const items: BarragemV2Dto[] = [];
    for (const rawItem of json.items) {
      const parsed = parseBarragemV2Dto(rawItem);
      if (!parsed) {
        return {
          ok: false,
          data: [],
          maskingPolicy: null,
          pagination: emptyV2Pagination(safeLimit),
          error: buildClientError(
            'Registro inválido recebido na consulta v2 de Barragens.',
            {
              table: 'barragens',
              status: response.status,
              code: 'INVALID_UPSTREAM_ITEM',
              isRlsOrPermission: false,
            }
          ),
        };
      }
      items.push(parsed);
    }

    return {
      ok: true,
      data: items,
      maskingPolicy: 'masked',
      pagination: {
        limit: parsedLimit,
        nextCursor,
        hasMore,
        total,
      },
    };
  } catch {
    return {
      ok: false,
      data: [],
      maskingPolicy: null,
      pagination: emptyV2Pagination(safeLimit),
      error: buildClientError(
        'Falha de comunicação ao consultar Barragens v2 em /api/administra-leitura.',
        {
          table: 'barragens',
          code: 'NETWORK_ERROR',
          isRlsOrPermission: false,
        }
      ),
    };
  }
}
