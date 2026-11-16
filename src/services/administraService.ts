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

// ============================================================================
// LEITURA CANÔNICA SOMENTE LEITURA (ADMINISTRA BARRAGENS)
// Tabelas reais: empreendedores, barragens, rts, responsaveis_tecnicos_barragens
// ============================================================================

export type AdministraCanonicalTable =
  | 'empreendedores'
  | 'barragens'
  | 'rts'
  | 'responsaveis_tecnicos_barragens';

export type AdministraRecord = Record<string, any>;

export interface AdministraReadError {
  table: AdministraCanonicalTable;
  status?: number;
  code?: string;
  message: string;
  details?: string | null;
  hint?: string | null;
  isRlsOrPermission: boolean;
  userMessage: string;
}

export interface AdministraTableDiagnostic {
  table: AdministraCanonicalTable;
  accessible: boolean;
  totalCount: number | null;
  error?: AdministraReadError;
}

export interface AdministraPageResult<T = AdministraRecord> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  configured: boolean;
  error?: AdministraReadError;
  relationErrors: AdministraReadError[];
  detectedColumns: string[];
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

interface TableSchemaHint {
  allColumns: string[];
  searchableColumns: string[];
  pkColumn: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/;
const schemaCache = new Map<AdministraCanonicalTable, TableSchemaHint>();

export function classifyAdministraReadError(
  table: AdministraCanonicalTable,
  err: { code?: string; message?: string; details?: string | null; hint?: string | null; status?: number } | null | undefined,
  httpStatus?: number
): AdministraReadError {
  const code = err?.code || undefined;
  const message = err?.message || 'Erro desconhecido ao consultar Administra Barragens.';
  const status = err?.status ?? httpStatus;
  const lowerMsg = message.toLowerCase();

  const isRlsOrPermission =
    code === '42501' ||
    code === 'PGRST301' ||
    status === 401 ||
    status === 403 ||
    lowerMsg.includes('permission denied') ||
    lowerMsg.includes('row-level security') ||
    lowerMsg.includes('policy') ||
    lowerMsg.includes('insufficient_privilege');

  const isMissingTable = code === 'PGRST205' || status === 404;

  let userMessage: string;
  if (isRlsOrPermission) {
    userMessage = `Leitura bloqueada por RLS/permissão na tabela public.${table} (${code || `HTTP ${status || 401}`}: ${message}).`;
  } else if (isMissingTable) {
    userMessage = `Tabela public.${table} não encontrada no Administra (${code || '404'}: ${message}).`;
  } else {
    userMessage = `Erro ao consultar public.${table}: ${message}${code ? ` (${code})` : ''}.`;
  }

  return {
    table,
    status,
    code,
    message,
    details: err?.details ?? null,
    hint: err?.hint ?? null,
    isRlsOrPermission,
    userMessage,
  };
}

function sanitizePostgrestSearch(term: string): string {
  return normalizeText(term).replace(/[,()*%\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

function deriveSchemaFromRows(rows: AdministraRecord[]): TableSchemaHint {
  const allColumnsSet = new Set<string>();
  const searchableSet = new Set<string>();

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    for (const key of Object.keys(row)) {
      allColumnsSet.add(key);
    }
  }

  const allColumns = Array.from(allColumnsSet);
  const pkColumn =
    allColumns.find((c) => c === 'id') ||
    allColumns.find((c) => /^id$|_id$|^id_/i.test(c)) ||
    'id';

  for (const col of allColumns) {
    if (col === 'id' || col.endsWith('_id') || col.startsWith('id_') || col.endsWith('_at')) {
      continue;
    }
    const values = rows.map((r) => r[col]).filter((v) => v !== null && v !== undefined && v !== '');
    if (values.length === 0) continue;
    const looksTextual = values.every(
      (v) =>
        typeof v === 'string' &&
        !UUID_REGEX.test(v.trim()) &&
        !ISO_DATE_REGEX.test(v.trim())
    );
    if (looksTextual) {
      searchableSet.add(col);
    }
  }

  return {
    allColumns,
    searchableColumns: Array.from(searchableSet),
    pkColumn,
  };
}

export function clearAdministraSchemaCache(): void {
  schemaCache.clear();
}

async function inspectTableSchema(
  table: AdministraCanonicalTable
): Promise<{ hint?: TableSchemaHint; error?: AdministraReadError }> {
  const cached = schemaCache.get(table);
  if (cached) return { hint: cached };

  const client = getAdministraClient();
  if (!client) {
    return {
      error: classifyAdministraReadError(table, {
        message: 'Administra Barragens não configurado no ambiente.',
      }),
    };
  }

  const { data, error, status } = await client
    .from(table)
    .select('*')
    .limit(50);

  if (error) {
    return { error: classifyAdministraReadError(table, error, status) };
  }

  const rows = (data || []) as AdministraRecord[];
  const hint = deriveSchemaFromRows(rows);
  if (rows.length > 0) {
    schemaCache.set(table, hint);
  }
  return { hint };
}

function findColumnByPattern(columns: string[], patterns: RegExp[]): string | null {
  for (const rx of patterns) {
    const found = columns.find((col) => rx.test(col));
    if (found) return found;
  }
  return null;
}

function getRowPkValue(row: AdministraRecord, pkCol = 'id'): string | number | null {
  const val = row?.[pkCol] ?? row?.id;
  if (val === null || val === undefined || val === '') return null;
  return val;
}

async function queryTableWithOptionalSearch(
  table: AdministraCanonicalTable,
  page: number,
  pageSize: number,
  query: string
): Promise<{
  rows: AdministraRecord[];
  total: number;
  hint: TableSchemaHint;
  error?: AdministraReadError;
}> {
  const client = getAdministraClient();
  if (!client) {
    return {
      rows: [],
      total: 0,
      hint: { allColumns: [], searchableColumns: [], pkColumn: 'id' },
      error: classifyAdministraReadError(table, {
        message: 'Administra Barragens não configurado neste ambiente.',
      }),
    };
  }

  const safePage = Math.max(1, page);
  const safeSize = Math.max(1, Math.min(50, pageSize));
  const from = (safePage - 1) * safeSize;
  const to = from + safeSize - 1;
  const cleanSearch = sanitizePostgrestSearch(query);

  if (!cleanSearch) {
    const res = await client
      .from(table)
      .select('*', { count: 'exact' })
      .range(from, to);

    if (res.error) {
      return {
        rows: [],
        total: 0,
        hint: { allColumns: [], searchableColumns: [], pkColumn: 'id' },
        error: classifyAdministraReadError(table, res.error, res.status),
      };
    }

    const rows = (res.data || []) as AdministraRecord[];
    const hint = deriveSchemaFromRows(rows);
    if (rows.length > 0) {
      schemaCache.set(table, hint);
    }
    return { rows, total: res.count ?? rows.length, hint };
  }

  const schemaRes = await inspectTableSchema(table);
  if (schemaRes.error) {
    return {
      rows: [],
      total: 0,
      hint: { allColumns: [], searchableColumns: [], pkColumn: 'id' },
      error: schemaRes.error,
    };
  }

  const hint = schemaRes.hint || { allColumns: [], searchableColumns: [], pkColumn: 'id' };
  if (hint.allColumns.length === 0) {
    // Tabela vazia ou sem colunas detectadas em amostra inicial: consulta direta no Administra
    const emptyRes = await client
      .from(table)
      .select('*', { count: 'exact' })
      .range(from, to);
    if (emptyRes.error) {
      return {
        rows: [],
        total: 0,
        hint,
        error: classifyAdministraReadError(table, emptyRes.error, emptyRes.status),
      };
    }
    const rows = (emptyRes.data || []) as AdministraRecord[];
    return { rows, total: emptyRes.count ?? rows.length, hint: deriveSchemaFromRows(rows) };
  }

  let activeSearchCols = [...hint.searchableColumns];
  const isUuidQuery = UUID_REGEX.test(cleanSearch);

  for (let attempt = 0; attempt < 3; attempt++) {
    const orClauses: string[] = activeSearchCols.map((col) => `${col}.ilike.%${cleanSearch}%`);
    if (isUuidQuery && hint.pkColumn) {
      orClauses.push(`${hint.pkColumn}.eq.${cleanSearch}`);
    }

    if (orClauses.length === 0) {
      return { rows: [], total: 0, hint };
    }

    const res = await client
      .from(table)
      .select('*', { count: 'exact' })
      .or(orClauses.join(','))
      .range(from, to);

    if (!res.error) {
      const rows = (res.data || []) as AdministraRecord[];
      return { rows, total: res.count ?? rows.length, hint };
    }

    // Se alguma coluna textual for enum/não-suportada para ILIKE, remove a coluna indicada e tenta novamente
    if (res.error.code === '42883' || res.error.code === '42703') {
      const badMatch = res.error.message?.match(/column\s+["']?(?:[a-z0-9_]+\.)?([a-z0-9_]+)["']?/i);
      if (badMatch && activeSearchCols.includes(badMatch[1])) {
        activeSearchCols = activeSearchCols.filter((c) => c !== badMatch[1]);
        schemaCache.set(table, { ...hint, searchableColumns: activeSearchCols });
        continue;
      }
    }

    return {
      rows: [],
      total: 0,
      hint,
      error: classifyAdministraReadError(table, res.error, res.status),
    };
  }

  return { rows: [], total: 0, hint };
}

async function fetchByIds(
  table: AdministraCanonicalTable,
  idColumn: string,
  ids: Array<string | number>
): Promise<{ rows: AdministraRecord[]; error?: AdministraReadError }> {
  const uniqueIds = Array.from(new Set(ids.filter((v) => v !== null && v !== undefined && v !== '')));
  if (uniqueIds.length === 0) return { rows: [] };

  const client = getAdministraClient();
  if (!client) return { rows: [] };

  const { data, error, status } = await client
    .from(table)
    .select('*')
    .in(idColumn, uniqueIds);

  if (error) {
    return { rows: [], error: classifyAdministraReadError(table, error, status) };
  }
  const rows = (data || []) as AdministraRecord[];
  if (rows.length > 0 && !schemaCache.has(table)) {
    schemaCache.set(table, deriveSchemaFromRows(rows));
  }
  return { rows };
}

export async function checkAdministraCanonicalAccess(): Promise<{
  configured: boolean;
  diagnostics: AdministraTableDiagnostic[];
}> {
  const client = getAdministraClient();
  const tables: AdministraCanonicalTable[] = [
    'empreendedores',
    'barragens',
    'rts',
    'responsaveis_tecnicos_barragens',
  ];

  if (!client) {
    return {
      configured: false,
      diagnostics: tables.map((table) => ({
        table,
        accessible: false,
        totalCount: null,
      })),
    };
  }

  const diagnostics = await Promise.all(
    tables.map(async (table): Promise<AdministraTableDiagnostic> => {
      try {
        const res = await client
          .from(table)
          .select('*', { count: 'exact', head: true });
        if (res.error) {
          return {
            table,
            accessible: false,
            totalCount: null,
            error: classifyAdministraReadError(table, res.error, res.status),
          };
        }
        return {
          table,
          accessible: true,
          totalCount: res.count ?? 0,
        };
      } catch (err: any) {
        return {
          table,
          accessible: false,
          totalCount: null,
          error: classifyAdministraReadError(table, {
            message: err?.message || 'Falha de comunicação com o Administra Barragens.',
          }),
        };
      }
    })
  );

  return { configured: true, diagnostics };
}

export async function fetchEmpreendedoresPage(
  page = 1,
  pageSize = 15,
  query = ''
): Promise<AdministraPageResult<EmpreendedorWithRelations>> {
  const client = getAdministraClient();
  if (!client) {
    return {
      data: [],
      total: 0,
      page,
      pageSize,
      configured: false,
      relationErrors: [],
      detectedColumns: [],
    };
  }

  const base = await queryTableWithOptionalSearch('empreendedores', page, pageSize, query);
  if (base.error) {
    return {
      data: [],
      total: 0,
      page,
      pageSize,
      configured: true,
      error: base.error,
      relationErrors: [],
      detectedColumns: [],
    };
  }

  const relationErrors: AdministraReadError[] = [];
  const empIds = base.rows
    .map((r) => getRowPkValue(r, base.hint.pkColumn))
    .filter((v): v is string | number => v !== null);

  let barragensByEmp = new Map<string, AdministraRecord[]>();

  if (empIds.length > 0) {
    const barSchema = await inspectTableSchema('barragens');
    if (barSchema.error) {
      relationErrors.push(barSchema.error);
    } else if (barSchema.hint && barSchema.hint.allColumns.length > 0) {
      const empFkCol = findColumnByPattern(barSchema.hint.allColumns, [
        /^empreendedor_id$/i,
        /^id_empreendedor$/i,
        /^empreendedor_uuid$/i,
        /empreendedor.*id/i,
        /^empreendedor$/i,
      ]);

      if (empFkCol) {
        const barRes = await fetchByIds('barragens', empFkCol, empIds);
        if (barRes.error) {
          relationErrors.push(barRes.error);
        } else {
          for (const bar of barRes.rows) {
            const fkVal = bar[empFkCol];
            if (fkVal === null || fkVal === undefined) continue;
            const key = String(fkVal);
            const list = barragensByEmp.get(key) || [];
            list.push(bar);
            barragensByEmp.set(key, list);
          }
        }
      }
    }
  }

  const enriched: EmpreendedorWithRelations[] = base.rows.map((emp) => {
    const id = getRowPkValue(emp, base.hint.pkColumn);
    return {
      record: emp,
      barragens: id !== null ? barragensByEmp.get(String(id)) || [] : [],
    };
  });

  return {
    data: enriched,
    total: base.total,
    page,
    pageSize,
    configured: true,
    relationErrors,
    detectedColumns: base.hint.allColumns,
  };
}

export async function fetchBarragensPage(
  page = 1,
  pageSize = 15,
  query = ''
): Promise<AdministraPageResult<BarragemWithRelations>> {
  const client = getAdministraClient();
  if (!client) {
    return {
      data: [],
      total: 0,
      page,
      pageSize,
      configured: false,
      relationErrors: [],
      detectedColumns: [],
    };
  }

  const base = await queryTableWithOptionalSearch('barragens', page, pageSize, query);
  if (base.error) {
    return {
      data: [],
      total: 0,
      page,
      pageSize,
      configured: true,
      error: base.error,
      relationErrors: [],
      detectedColumns: [],
    };
  }

  const relationErrors: AdministraReadError[] = [];
  const barIds = base.rows
    .map((r) => getRowPkValue(r, base.hint.pkColumn))
    .filter((v): v is string | number => v !== null);

  // 1. Resolver Empreendedor de cada barragem
  const empFkCol = findColumnByPattern(base.hint.allColumns, [
    /^empreendedor_id$/i,
    /^id_empreendedor$/i,
    /^empreendedor_uuid$/i,
    /empreendedor.*id/i,
    /^empreendedor$/i,
  ]);
  const empreendedoresMap = new Map<string, AdministraRecord>();

  if (empFkCol) {
    const empIds = base.rows
      .map((r) => r[empFkCol])
      .filter((v): v is string | number => v !== null && v !== undefined && v !== '');

    if (empIds.length > 0) {
      const empSchema = await inspectTableSchema('empreendedores');
      if (empSchema.error) {
        relationErrors.push(empSchema.error);
      } else {
        const empPk = empSchema.hint?.pkColumn || 'id';
        const empRes = await fetchByIds('empreendedores', empPk, empIds);
        if (empRes.error) {
          relationErrors.push(empRes.error);
        } else {
          for (const emp of empRes.rows) {
            const pk = getRowPkValue(emp, empPk);
            if (pk !== null) empreendedoresMap.set(String(pk), emp);
          }
        }
      }
    }
  }

  // 2. Resolver vínculos RT–Barragem via responsaveis_tecnicos_barragens + rts
  const vinculosByBar = new Map<string, Array<{ vinculo: AdministraRecord; rt: AdministraRecord | null }>>();
  if (barIds.length > 0) {
    const linkSchema = await inspectTableSchema('responsaveis_tecnicos_barragens');
    if (linkSchema.error) {
      relationErrors.push(linkSchema.error);
    } else if (linkSchema.hint && linkSchema.hint.allColumns.length > 0) {
      const barFkCol = findColumnByPattern(linkSchema.hint.allColumns, [
        /^barragem_id$/i,
        /^id_barragem$/i,
        /^barragem_uuid$/i,
        /barragem.*id/i,
        /^barragem$/i,
      ]);
      const rtFkCol = findColumnByPattern(linkSchema.hint.allColumns, [
        /^rt_id$/i,
        /^responsavel_tecnico_id$/i,
        /^id_rt$/i,
        /^id_responsavel_tecnico$/i,
        /(rt|responsavel).*id/i,
      ]);

      if (barFkCol) {
        const linkRes = await fetchByIds('responsaveis_tecnicos_barragens', barFkCol, barIds);
        if (linkRes.error) {
          relationErrors.push(linkRes.error);
        } else if (linkRes.rows.length > 0) {
          const rtsMap = new Map<string, AdministraRecord>();
          if (rtFkCol) {
            const rtIds = linkRes.rows
              .map((l) => l[rtFkCol])
              .filter((v): v is string | number => v !== null && v !== undefined && v !== '');
            if (rtIds.length > 0) {
              const rtSchema = await inspectTableSchema('rts');
              if (rtSchema.error) {
                relationErrors.push(rtSchema.error);
              } else {
                const rtPk = rtSchema.hint?.pkColumn || 'id';
                const rtRes = await fetchByIds('rts', rtPk, rtIds);
                if (rtRes.error) {
                  relationErrors.push(rtRes.error);
                } else {
                  for (const rt of rtRes.rows) {
                    const pk = getRowPkValue(rt, rtPk);
                    if (pk !== null) rtsMap.set(String(pk), rt);
                  }
                }
              }
            }
          }

          for (const link of linkRes.rows) {
            const bVal = link[barFkCol];
            if (bVal === null || bVal === undefined) continue;
            const bKey = String(bVal);
            const rtVal = rtFkCol ? link[rtFkCol] : null;
            const rtObj = rtVal !== null && rtVal !== undefined ? rtsMap.get(String(rtVal)) || null : null;
            const list = vinculosByBar.get(bKey) || [];
            list.push({ vinculo: link, rt: rtObj });
            vinculosByBar.set(bKey, list);
          }
        }
      }
    }
  }

  const enriched: BarragemWithRelations[] = base.rows.map((bar) => {
    const barId = getRowPkValue(bar, base.hint.pkColumn);
    const empFkVal = empFkCol ? bar[empFkCol] : null;
    const empreendedor =
      empFkVal !== null && empFkVal !== undefined ? empreendedoresMap.get(String(empFkVal)) || null : null;

    return {
      record: bar,
      empreendedor,
      vinculosRt: barId !== null ? vinculosByBar.get(String(barId)) || [] : [],
    };
  });

  return {
    data: enriched,
    total: base.total,
    page,
    pageSize,
    configured: true,
    relationErrors,
    detectedColumns: base.hint.allColumns,
  };
}

export async function fetchRtsPage(
  page = 1,
  pageSize = 15,
  query = ''
): Promise<AdministraPageResult<RtWithRelations>> {
  const client = getAdministraClient();
  if (!client) {
    return {
      data: [],
      total: 0,
      page,
      pageSize,
      configured: false,
      relationErrors: [],
      detectedColumns: [],
    };
  }

  const base = await queryTableWithOptionalSearch('rts', page, pageSize, query);
  if (base.error) {
    return {
      data: [],
      total: 0,
      page,
      pageSize,
      configured: true,
      error: base.error,
      relationErrors: [],
      detectedColumns: [],
    };
  }

  const relationErrors: AdministraReadError[] = [];
  const rtIds = base.rows
    .map((r) => getRowPkValue(r, base.hint.pkColumn))
    .filter((v): v is string | number => v !== null);

  const vinculosByRt = new Map<string, Array<{ vinculo: AdministraRecord; barragem: AdministraRecord | null }>>();

  if (rtIds.length > 0) {
    const linkSchema = await inspectTableSchema('responsaveis_tecnicos_barragens');
    if (linkSchema.error) {
      relationErrors.push(linkSchema.error);
    } else if (linkSchema.hint && linkSchema.hint.allColumns.length > 0) {
      const rtFkCol = findColumnByPattern(linkSchema.hint.allColumns, [
        /^rt_id$/i,
        /^responsavel_tecnico_id$/i,
        /^id_rt$/i,
        /^id_responsavel_tecnico$/i,
        /(rt|responsavel).*id/i,
      ]);
      const barFkCol = findColumnByPattern(linkSchema.hint.allColumns, [
        /^barragem_id$/i,
        /^id_barragem$/i,
        /^barragem_uuid$/i,
        /barragem.*id/i,
        /^barragem$/i,
      ]);

      if (rtFkCol) {
        const linkRes = await fetchByIds('responsaveis_tecnicos_barragens', rtFkCol, rtIds);
        if (linkRes.error) {
          relationErrors.push(linkRes.error);
        } else if (linkRes.rows.length > 0) {
          const barMap = new Map<string, AdministraRecord>();
          if (barFkCol) {
            const barIds = linkRes.rows
              .map((l) => l[barFkCol])
              .filter((v): v is string | number => v !== null && v !== undefined && v !== '');
            if (barIds.length > 0) {
              const barSchema = await inspectTableSchema('barragens');
              if (barSchema.error) {
                relationErrors.push(barSchema.error);
              } else {
                const barPk = barSchema.hint?.pkColumn || 'id';
                const barRes = await fetchByIds('barragens', barPk, barIds);
                if (barRes.error) {
                  relationErrors.push(barRes.error);
                } else {
                  for (const bar of barRes.rows) {
                    const pk = getRowPkValue(bar, barPk);
                    if (pk !== null) barMap.set(String(pk), bar);
                  }
                }
              }
            }
          }

          for (const link of linkRes.rows) {
            const rVal = link[rtFkCol];
            if (rVal === null || rVal === undefined) continue;
            const rKey = String(rVal);
            const bVal = barFkCol ? link[barFkCol] : null;
            const barObj = bVal !== null && bVal !== undefined ? barMap.get(String(bVal)) || null : null;
            const list = vinculosByRt.get(rKey) || [];
            list.push({ vinculo: link, barragem: barObj });
            vinculosByRt.set(rKey, list);
          }
        }
      }
    }
  }

  const enriched: RtWithRelations[] = base.rows.map((rt) => {
    const rtId = getRowPkValue(rt, base.hint.pkColumn);
    return {
      record: rt,
      vinculosBarragem: rtId !== null ? vinculosByRt.get(String(rtId)) || [] : [],
    };
  });

  return {
    data: enriched,
    total: base.total,
    page,
    pageSize,
    configured: true,
    relationErrors,
    detectedColumns: base.hint.allColumns,
  };
}

export async function fetchRtBarragensPage(
  page = 1,
  pageSize = 15,
  query = ''
): Promise<AdministraPageResult<VinculoRtBarragemWithRelations>> {
  const client = getAdministraClient();
  if (!client) {
    return {
      data: [],
      total: 0,
      page,
      pageSize,
      configured: false,
      relationErrors: [],
      detectedColumns: [],
    };
  }

  const cleanSearch = sanitizePostgrestSearch(query);
  const relationErrors: AdministraReadError[] = [];

  let baseRows: AdministraRecord[] = [];
  let total = 0;
  let linkHint: TableSchemaHint = { allColumns: [], searchableColumns: [], pkColumn: 'id' };

  if (!cleanSearch) {
    const base = await queryTableWithOptionalSearch('responsaveis_tecnicos_barragens', page, pageSize, '');
    if (base.error) {
      return {
        data: [],
        total: 0,
        page,
        pageSize,
        configured: true,
        error: base.error,
        relationErrors: [],
        detectedColumns: [],
      };
    }
    baseRows = base.rows;
    total = base.total;
    linkHint = base.hint;
  } else {
    // Busca cruzada no servidor: verifica colunas de texto da tabela de vínculo E registros correspondentes em rts / barragens
    const linkSchemaRes = await inspectTableSchema('responsaveis_tecnicos_barragens');
    if (linkSchemaRes.error) {
      return {
        data: [],
        total: 0,
        page,
        pageSize,
        configured: true,
        error: linkSchemaRes.error,
        relationErrors: [],
        detectedColumns: [],
      };
    }

    linkHint = linkSchemaRes.hint || linkHint;
    const rtFkCol = findColumnByPattern(linkHint.allColumns, [
      /^rt_id$/i,
      /^responsavel_tecnico_id$/i,
      /^id_rt$/i,
      /^id_responsavel_tecnico$/i,
      /(rt|responsavel).*id/i,
    ]);
    const barFkCol = findColumnByPattern(linkHint.allColumns, [
      /^barragem_id$/i,
      /^id_barragem$/i,
      /^barragem_uuid$/i,
      /barragem.*id/i,
      /^barragem$/i,
    ]);

    const [rtSearch, barSearch] = await Promise.all([
      rtFkCol ? queryTableWithOptionalSearch('rts', 1, 50, cleanSearch) : Promise.resolve(null),
      barFkCol ? queryTableWithOptionalSearch('barragens', 1, 50, cleanSearch) : Promise.resolve(null),
    ]);

    if (rtSearch?.error) relationErrors.push(rtSearch.error);
    if (barSearch?.error) relationErrors.push(barSearch.error);

    const orClauses: string[] = linkHint.searchableColumns.map((col) => `${col}.ilike.%${cleanSearch}%`);

    if (rtFkCol && rtSearch && rtSearch.rows.length > 0) {
      const ids = rtSearch.rows
        .map((r) => getRowPkValue(r, rtSearch.hint.pkColumn))
        .filter((v): v is string | number => v !== null);
      if (ids.length > 0) {
        orClauses.push(`${rtFkCol}.in.(${ids.join(',')})`);
      }
    }

    if (barFkCol && barSearch && barSearch.rows.length > 0) {
      const ids = barSearch.rows
        .map((b) => getRowPkValue(b, barSearch.hint.pkColumn))
        .filter((v): v is string | number => v !== null);
      if (ids.length > 0) {
        orClauses.push(`${barFkCol}.in.(${ids.join(',')})`);
      }
    }

    if (orClauses.length === 0) {
      return {
        data: [],
        total: 0,
        page,
        pageSize,
        configured: true,
        relationErrors,
        detectedColumns: linkHint.allColumns,
      };
    }

    const safePage = Math.max(1, page);
    const safeSize = Math.max(1, Math.min(50, pageSize));
    const from = (safePage - 1) * safeSize;
    const to = from + safeSize - 1;

    const linkRes = await client
      .from('responsaveis_tecnicos_barragens')
      .select('*', { count: 'exact' })
      .or(orClauses.join(','))
      .range(from, to);

    if (linkRes.error) {
      return {
        data: [],
        total: 0,
        page,
        pageSize,
        configured: true,
        error: classifyAdministraReadError('responsaveis_tecnicos_barragens', linkRes.error, linkRes.status),
        relationErrors,
        detectedColumns: linkHint.allColumns,
      };
    }

    baseRows = (linkRes.data || []) as AdministraRecord[];
    total = linkRes.count ?? baseRows.length;
  }

  const rtFkCol = findColumnByPattern(linkHint.allColumns, [
    /^rt_id$/i,
    /^responsavel_tecnico_id$/i,
    /^id_rt$/i,
    /^id_responsavel_tecnico$/i,
    /(rt|responsavel).*id/i,
  ]);
  const barFkCol = findColumnByPattern(linkHint.allColumns, [
    /^barragem_id$/i,
    /^id_barragem$/i,
    /^barragem_uuid$/i,
    /barragem.*id/i,
    /^barragem$/i,
  ]);

  const rtMap = new Map<string, AdministraRecord>();
  const barMap = new Map<string, AdministraRecord>();
  const empMap = new Map<string, AdministraRecord>();

  if (rtFkCol && baseRows.length > 0) {
    const rtIds = baseRows
      .map((l) => l[rtFkCol])
      .filter((v): v is string | number => v !== null && v !== undefined && v !== '');
    if (rtIds.length > 0) {
      const rtSchema = await inspectTableSchema('rts');
      if (rtSchema.error) {
        relationErrors.push(rtSchema.error);
      } else {
        const rtPk = rtSchema.hint?.pkColumn || 'id';
        const rtRes = await fetchByIds('rts', rtPk, rtIds);
        if (rtRes.error) {
          relationErrors.push(rtRes.error);
        } else {
          for (const rt of rtRes.rows) {
            const pk = getRowPkValue(rt, rtPk);
            if (pk !== null) rtMap.set(String(pk), rt);
          }
        }
      }
    }
  }

  let barEmpFkCol: string | null = null;
  if (barFkCol && baseRows.length > 0) {
    const barIds = baseRows
      .map((l) => l[barFkCol])
      .filter((v): v is string | number => v !== null && v !== undefined && v !== '');
    if (barIds.length > 0) {
      const barSchema = await inspectTableSchema('barragens');
      if (barSchema.error) {
        relationErrors.push(barSchema.error);
      } else {
        const barPk = barSchema.hint?.pkColumn || 'id';
        const barRes = await fetchByIds('barragens', barPk, barIds);
        if (barRes.error) {
          relationErrors.push(barRes.error);
        } else {
          for (const bar of barRes.rows) {
            const pk = getRowPkValue(bar, barPk);
            if (pk !== null) barMap.set(String(pk), bar);
          }
          const barCols = deriveSchemaFromRows(barRes.rows).allColumns;
          barEmpFkCol = findColumnByPattern(barCols, [
            /^empreendedor_id$/i,
            /^id_empreendedor$/i,
            /^empreendedor_uuid$/i,
            /empreendedor.*id/i,
            /^empreendedor$/i,
          ]);
          if (barEmpFkCol) {
            const empIds = barRes.rows
              .map((b) => b[barEmpFkCol!])
              .filter((v): v is string | number => v !== null && v !== undefined && v !== '');
            if (empIds.length > 0) {
              const empSchema = await inspectTableSchema('empreendedores');
              if (empSchema.error) {
                relationErrors.push(empSchema.error);
              } else {
                const empPk = empSchema.hint?.pkColumn || 'id';
                const empRes = await fetchByIds('empreendedores', empPk, empIds);
                if (empRes.error) {
                  relationErrors.push(empRes.error);
                } else {
                  for (const emp of empRes.rows) {
                    const pk = getRowPkValue(emp, empPk);
                    if (pk !== null) empMap.set(String(pk), emp);
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  const enriched: VinculoRtBarragemWithRelations[] = baseRows.map((vinculo) => {
    const rtVal = rtFkCol ? vinculo[rtFkCol] : null;
    const barVal = barFkCol ? vinculo[barFkCol] : null;
    const rt = rtVal !== null && rtVal !== undefined ? rtMap.get(String(rtVal)) || null : null;
    const barragem = barVal !== null && barVal !== undefined ? barMap.get(String(barVal)) || null : null;
    const empVal = barragem && barEmpFkCol ? barragem[barEmpFkCol] : null;
    const empreendedor = empVal !== null && empVal !== undefined ? empMap.get(String(empVal)) || null : null;

    return {
      vinculo,
      rt,
      barragem,
      empreendedor,
    };
  });

  return {
    data: enriched,
    total,
    page,
    pageSize,
    configured: true,
    relationErrors,
    detectedColumns: linkHint.allColumns,
  };
}

