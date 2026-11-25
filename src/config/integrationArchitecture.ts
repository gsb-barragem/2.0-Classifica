import type {
  AdministraEndpointPolicy,
  AdministraEntidadeMestra,
  MasterWriteApiStatus,
  PoliticaMigracaoAdministra,
  SistemaOrigem,
} from '../../types';

export interface IntegrationArchitectureSpec {
  readonly masterSourceOfTruth: Extract<SistemaOrigem, 'ADMINISTRA_BARRAGENS'>;
  readonly consumerSystem: Extract<SistemaOrigem, 'CLASSIFICA_CSB'>;
  readonly canonicalEntitiesOwnedByAdministra: readonly AdministraEntidadeMestra[];
  readonly classificaOwnedWorkflows: readonly string[];
  readonly entityReferenceRule: {
    readonly strategy: 'referencia_por_identificador_administra';
    readonly allowParallelMasterRegistriesInClassifica: false;
    readonly referenceFields: readonly string[];
  };
  readonly canonicalReadApi: AdministraEndpointPolicy & {
    readonly status: 'ativa_somente_leitura';
    readonly auxiliaryReadEndpoint: '/api/administra-escrita';
    readonly auxiliaryReadAction: 'listar_arts_rt';
  };
  readonly masterWriteApi: AdministraEndpointPolicy & {
    readonly status: MasterWriteApiStatus;
    readonly blocked: boolean;
    readonly blockHttpStatus: 409;
    readonly blockCode: 'ADMINISTRA_MASTER_WRITE_BLOCKED';
    readonly clientDirectRpcFallbackDisabled: true;
  };
  readonly futureProposalPolicy: {
    readonly mode: PoliticaMigracaoAdministra;
    readonly approvedHybridWriteApiImplemented: false;
    readonly automaticCreationRequirements: readonly string[];
    readonly humanReviewRequiredFor: readonly string[];
  };
}

/**
 * Arquitetura de integração acordada entre Administra Barragens e Classifica 2.0.
 * Mantém leitura canônica ativa e bloqueia escrita direta de cadastros mestres (HTTP 409)
 * até a implantação da API de escrita aprovada com validação híbrida.
 */
export const CLASSIFICA_INTEGRATION_ARCHITECTURE: IntegrationArchitectureSpec = {
  masterSourceOfTruth: 'ADMINISTRA_BARRAGENS',
  consumerSystem: 'CLASSIFICA_CSB',
  canonicalEntitiesOwnedByAdministra: [
    'empreendedor',
    'empreendimento',
    'barragem',
    'responsavel_tecnico',
  ],
  classificaOwnedWorkflows: [
    'pareceres',
    'oficios',
    'nao_obrigatoriedades',
    'indeferimentos',
    'transferencias_titularidade',
    'documentos_requeridos',
    'analises_e_status',
    'pendencias',
    'solicitacoes_vistoria',
  ],
  entityReferenceRule: {
    strategy: 'referencia_por_identificador_administra',
    allowParallelMasterRegistriesInClassifica: false,
    referenceFields: [
      'empreendedorId',
      'empreendimentoId',
      'barragemId',
      'rtId',
    ],
  },
  canonicalReadApi: {
    path: '/api/administra-leitura',
    method: 'POST',
    mode: 'somente_leitura',
    blocked: false,
    status: 'ativa_somente_leitura',
    allowedActions: [
      'diagnostico',
      'empreendedores',
      'barragens',
      'rts',
      'vinculos_rt_barragem',
    ],
    auxiliaryReadEndpoint: '/api/administra-escrita',
    auxiliaryReadAction: 'listar_arts_rt',
  },
  masterWriteApi: {
    path: '/api/administra-escrita',
    method: 'POST',
    mode: 'bloqueado',
    status: 'bloqueada_aguardando_api_hibrida',
    blocked: true,
    httpStatusWhenBlocked: 409,
    blockHttpStatus: 409,
    blockCode: 'ADMINISTRA_MASTER_WRITE_BLOCKED',
    blockedActions: [
      'salvar_art_rt',
      'salvar_rt',
      'salvar_empreendedor',
      'salvar_barragem',
    ],
    clientDirectRpcFallbackDisabled: true,
  },
  futureProposalPolicy: {
    mode: 'hibrida_deterministica',
    approvedHybridWriteApiImplemented: false,
    automaticCreationRequirements: [
      'validacao_estrutural_e_campos_obrigatorios',
      'verificacao_deterministica_de_duplicidade',
    ],
    humanReviewRequiredFor: [
      'casos_ambiguos_ou_conflito_de_duplicidade',
      'dados_invalidos_ou_incompletos',
    ],
  },
};
