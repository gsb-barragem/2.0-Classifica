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
import { supabase, isSupabaseConfigured } from '../supabaseClient';
import { logActivity } from '../lib/auditService';
import { AppDocument } from '../contexts/DataContext';

const CURRENT_SYSTEM: SistemaOrigem = 'CLASSIFICA_CSB';

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
  ownershipConflict?: boolean;
  ownerSystem?: SistemaOrigem;
  notConfigured?: boolean;
  message?: string;
}

// ============================================================================
// LEITURA DA BASE MESTRE (ADMINISTRA BARRAGENS)
// ============================================================================

export async function searchEmpreendedores(query = ''): Promise<{ data: EmpreendedorMaster[]; configured: boolean; error?: string }> {
  const client = getAdministraClient();
  if (!client) return { data: [], configured: false };

  try {
    const clean = normalizeText(query);
    const rpcRes = await client.rpc('administra_buscar_empreendedores', { p_termo: clean });
    if (!rpcRes.error && Array.isArray(rpcRes.data)) {
      return { data: rpcRes.data as EmpreendedorMaster[], configured: true };
    }

    let q = client
      .from('administra_empreendedores')
      .select('id, cpf_cnpj, tipo_pessoa, razao_social, nome_fantasia, email, telefone, endereco, municipio, num_car, sistema_origem, created_by_user_id, created_by_name, created_at, updated_at')
      .order('razao_social', { ascending: true })
      .limit(50);

    if (clean) {
      const digits = normalizeDigits(clean);
      if (digits.length >= 3) {
        q = q.or(`razao_social.ilike.%${clean}%,cpf_cnpj.ilike.%${digits}%`);
      } else {
        q = q.ilike('razao_social', `%${clean}%`);
      }
    }

    const { data, error } = await q;
    if (error) return { data: [], configured: true, error: 'Não foi possível consultar empreendedores no Administra.' };
    return { data: (data || []) as EmpreendedorMaster[], configured: true };
  } catch {
    return { data: [], configured: true, error: 'Falha de comunicação com o Administra Barragens.' };
  }
}

export async function searchBarragens(
  query = '',
  empreendedorId?: string
): Promise<{ data: BarragemMaster[]; configured: boolean; error?: string }> {
  const client = getAdministraClient();
  if (!client) return { data: [], configured: false };

  try {
    const clean = normalizeText(query);
    const rpcRes = await client.rpc('administra_buscar_barragens', {
      p_termo: clean,
      p_empreendedor_id: empreendedorId || null,
    });
    if (!rpcRes.error && Array.isArray(rpcRes.data)) {
      return { data: rpcRes.data as BarragemMaster[], configured: true };
    }

    let q = client
      .from('administra_barragens')
      .select('id, empreendedor_id, snisb, nome, municipio, upg, sub_bacia, curso_agua, zona, localizacao, lat_gms, long_gms, lat_decimal, long_decimal, altura_maxima, comprimento_coroamento, largura_coroamento, volume_nmo, volume_nmm, tipo_estrutural, tipo_fundacao, finalidade, situacao, dpa_atual, cri_atual, enquadramento_pnsb, sistema_origem, created_by_user_id, created_by_name, created_at, updated_at')
      .order('nome', { ascending: true })
      .limit(50);

    if (empreendedorId) {
      q = q.eq('empreendedor_id', empreendedorId);
    }
    if (clean) {
      q = q.or(`nome.ilike.%${clean}%,snisb.ilike.%${clean}%,municipio.ilike.%${clean}%`);
    }

    const { data, error } = await q;
    if (error) return { data: [], configured: true, error: 'Não foi possível consultar barragens no Administra.' };
    return { data: (data || []) as BarragemMaster[], configured: true };
  } catch {
    return { data: [], configured: true, error: 'Falha de comunicação com o Administra Barragens.' };
  }
}

export async function searchResponsaveisTecnicos(
  query = ''
): Promise<{ data: ResponsavelTecnicoMaster[]; configured: boolean; error?: string }> {
  const client = getAdministraClient();
  if (!client) return { data: [], configured: false };

  try {
    const clean = normalizeText(query);
    const rpcRes = await client.rpc('administra_buscar_rts', { p_termo: clean });
    if (!rpcRes.error && Array.isArray(rpcRes.data)) {
      return { data: rpcRes.data as ResponsavelTecnicoMaster[], configured: true };
    }

    let q = client
      .from('administra_responsaveis_tecnicos')
      .select('id, nome, cpf, registro_profissional, email, telefone, sistema_origem, created_by_user_id, created_by_name, created_at, updated_at')
      .order('nome', { ascending: true })
      .limit(50);

    if (clean) {
      q = q.or(`nome.ilike.%${clean}%,registro_profissional.ilike.%${clean}%`);
    }

    const { data, error } = await q;
    if (error) return { data: [], configured: true, error: 'Não foi possível consultar responsáveis técnicos no Administra.' };
    return { data: (data || []) as ResponsavelTecnicoMaster[], configured: true };
  } catch {
    return { data: [], configured: true, error: 'Falha de comunicação com o Administra Barragens.' };
  }
}

// ============================================================================
// ESCRITA NA BASE MESTRE COM REGRA DE PROPRIEDADE POR SISTEMA DE ORIGEM
// ============================================================================

export function canClassificaEditDirectly(sistemaOrigem?: SistemaOrigem | null): boolean {
  return !sistemaOrigem || sistemaOrigem === CURRENT_SYSTEM;
}

export async function saveEmpreendedorMaster(
  payload: Partial<EmpreendedorMaster> & { cpf_cnpj: string; razao_social: string },
  currentUser: User
): Promise<MasterWriteResult<EmpreendedorMaster>> {
  const client = getAdministraClient();
  if (!client) {
    return { success: false, notConfigured: true, message: 'Administra Barragens ainda não está conectado neste ambiente.' };
  }

  if (currentUser.role === 'Visualizador') {
    return { success: false, message: 'Usuários com perfil Visualizador não podem cadastrar ou alterar dados mestres.' };
  }

  const cpfCnpjDigits = normalizeDigits(payload.cpf_cnpj);
  if (cpfCnpjDigits.length !== 11 && cpfCnpjDigits.length !== 14) {
    return { success: false, message: 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.' };
  }

  // Regra estrita de propriedade: o Classifica só edita registros gerados pelo próprio Classifica.
  if (payload.id && payload.sistema_origem && !canClassificaEditDirectly(payload.sistema_origem)) {
    return {
      success: false,
      ownershipConflict: true,
      ownerSystem: payload.sistema_origem,
      message: `Este empreendedor pertence ao sistema ${SYSTEM_LABELS[payload.sistema_origem]}. Envie uma solicitação de alteração.`,
    };
  }

  try {
    const cleanPayload = {
      cpf_cnpj: cpfCnpjDigits,
      tipo_pessoa: cpfCnpjDigits.length === 14 ? 'PJ' : 'PF',
      razao_social: normalizeText(payload.razao_social),
      nome_fantasia: payload.nome_fantasia ? normalizeText(payload.nome_fantasia) : null,
      email: payload.email ? payload.email.trim().toLowerCase() : null,
      telefone: payload.telefone ? payload.telefone.trim() : null,
      endereco: payload.endereco ? normalizeText(payload.endereco) : null,
      municipio: payload.municipio ? normalizeText(payload.municipio) : null,
      num_car: payload.num_car ? normalizeText(payload.num_car) : null,
    };

    const rpcRes = await client.rpc('administra_upsert_empreendedor', {
      p_id: payload.id || null,
      p_sistema_solicitante: CURRENT_SYSTEM,
      p_user_id: currentUser.authUserId,
      p_user_name: currentUser.name,
      p_dados: cleanPayload,
    });

    if (rpcRes.error) {
      if (rpcRes.error.message?.includes('OWNERSHIP_CONFLICT')) {
        return {
          success: false,
          ownershipConflict: true,
          ownerSystem: payload.sistema_origem,
          message: 'Registro pertencente a outro sistema. Utilize o fluxo de Solicitação de Alteração.',
        };
      }
      return { success: false, message: 'Não foi possível salvar o empreendedor no Administra Barragens.' };
    }

    await logActivity(payload.id ? 'ECOSYSTEM_ENTITY_UPDATED' : 'ECOSYSTEM_ENTITY_CREATED', {
      entidade: 'empreendedor',
      destino: 'ADMINISTRA_BARRAGENS',
    });

    return { success: true, data: rpcRes.data as EmpreendedorMaster };
  } catch {
    return { success: false, message: 'Erro de comunicação ao salvar empreendedor no Administra.' };
  }
}

export async function saveBarragemMaster(
  payload: Partial<BarragemMaster> & { nome: string; municipio: string },
  currentUser: User
): Promise<MasterWriteResult<BarragemMaster>> {
  const client = getAdministraClient();
  if (!client) {
    return { success: false, notConfigured: true, message: 'Administra Barragens ainda não está conectado neste ambiente.' };
  }

  if (currentUser.role === 'Visualizador') {
    return { success: false, message: 'Usuários com perfil Visualizador não podem cadastrar ou alterar barragens.' };
  }

  if (payload.id && payload.sistema_origem && !canClassificaEditDirectly(payload.sistema_origem)) {
    return {
      success: false,
      ownershipConflict: true,
      ownerSystem: payload.sistema_origem,
      message: `Esta barragem foi cadastrada pelo sistema ${SYSTEM_LABELS[payload.sistema_origem]}. Envie uma solicitação de alteração.`,
    };
  }

  try {
    const cleanPayload = {
      empreendedor_id: payload.empreendedor_id || null,
      snisb: payload.snisb ? payload.snisb.trim().toUpperCase() : null,
      nome: normalizeText(payload.nome),
      municipio: normalizeText(payload.municipio),
      upg: payload.upg ? normalizeText(payload.upg) : null,
      sub_bacia: payload.sub_bacia ? normalizeText(payload.sub_bacia) : null,
      curso_agua: payload.curso_agua ? normalizeText(payload.curso_agua) : null,
      zona: payload.zona || 'Rural',
      localizacao: payload.localizacao ? normalizeText(payload.localizacao) : null,
      lat_gms: payload.lat_gms || null,
      long_gms: payload.long_gms || null,
      lat_decimal: payload.lat_decimal ?? null,
      long_decimal: payload.long_decimal ?? null,
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

    const rpcRes = await client.rpc('administra_upsert_barragem', {
      p_id: payload.id || null,
      p_sistema_solicitante: CURRENT_SYSTEM,
      p_user_id: currentUser.authUserId,
      p_user_name: currentUser.name,
      p_dados: cleanPayload,
    });

    if (rpcRes.error) {
      if (rpcRes.error.message?.includes('OWNERSHIP_CONFLICT')) {
        return {
          success: false,
          ownershipConflict: true,
          ownerSystem: payload.sistema_origem,
          message: 'Barragem pertencente a outro sistema. Utilize o fluxo de Solicitação de Alteração.',
        };
      }
      return { success: false, message: 'Não foi possível salvar a barragem no Administra Barragens.' };
    }

    await logActivity(payload.id ? 'ECOSYSTEM_ENTITY_UPDATED' : 'ECOSYSTEM_ENTITY_CREATED', {
      entidade: 'barragem',
      destino: 'ADMINISTRA_BARRAGENS',
    });

    return { success: true, data: rpcRes.data as BarragemMaster };
  } catch {
    return { success: false, message: 'Erro de comunicação ao salvar barragem no Administra.' };
  }
}

export async function saveResponsavelTecnicoMaster(
  payload: Partial<ResponsavelTecnicoMaster> & { nome: string },
  currentUser: User
): Promise<MasterWriteResult<ResponsavelTecnicoMaster>> {
  const client = getAdministraClient();
  if (!client) {
    return { success: false, notConfigured: true, message: 'Administra Barragens ainda não está conectado neste ambiente.' };
  }

  if (currentUser.role === 'Visualizador') {
    return { success: false, message: 'Usuários com perfil Visualizador não podem alterar responsáveis técnicos.' };
  }

  if (payload.id && payload.sistema_origem && !canClassificaEditDirectly(payload.sistema_origem)) {
    return {
      success: false,
      ownershipConflict: true,
      ownerSystem: payload.sistema_origem,
      message: `Este responsável técnico pertence ao sistema ${SYSTEM_LABELS[payload.sistema_origem]}. Envie uma solicitação de alteração.`,
    };
  }

  try {
    const cleanPayload = {
      nome: normalizeText(payload.nome),
      cpf: payload.cpf ? normalizeDigits(payload.cpf) : null,
      registro_profissional: payload.registro_profissional ? normalizeText(payload.registro_profissional).toUpperCase() : null,
      email: payload.email ? payload.email.trim().toLowerCase() : null,
      telefone: payload.telefone ? payload.telefone.trim() : null,
    };

    const rpcRes = await client.rpc('administra_upsert_rt', {
      p_id: payload.id || null,
      p_sistema_solicitante: CURRENT_SYSTEM,
      p_user_id: currentUser.authUserId,
      p_user_name: currentUser.name,
      p_dados: cleanPayload,
    });

    if (rpcRes.error) {
      if (rpcRes.error.message?.includes('OWNERSHIP_CONFLICT')) {
        return {
          success: false,
          ownershipConflict: true,
          ownerSystem: payload.sistema_origem,
          message: 'Responsável técnico pertencente a outro sistema. Envie uma solicitação de alteração.',
        };
      }
      return { success: false, message: 'Não foi possível salvar o responsável técnico no Administra.' };
    }

    await logActivity(payload.id ? 'ECOSYSTEM_ENTITY_UPDATED' : 'ECOSYSTEM_ENTITY_CREATED', {
      entidade: 'responsavel_tecnico',
      destino: 'ADMINISTRA_BARRAGENS',
    });

    return { success: true, data: rpcRes.data as ResponsavelTecnicoMaster };
  } catch {
    return { success: false, message: 'Erro de comunicação ao salvar responsável técnico no Administra.' };
  }
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


