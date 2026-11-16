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
