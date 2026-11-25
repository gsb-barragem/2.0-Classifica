
export enum RiscoEnum {
  BAIXO = 'Baixa',
  MEDIO = 'Média',
  ALTO = 'Alta'
}

export enum DanoEnum {
  BAIXO = 'Baixo',
  MEDIO = 'Médio',
  ALTO = 'Alto'
}

export interface ClassificacaoData {
  // Volume (4.1)
  dpa1Select: string; // The selected string from OPS_DPA1_VOLUME
  
  // DPA (4.2)
  dpa2Select: string; // Selection for Construções a jusante
  
  dpa3Select: string;
  dpa4Select: string;
  
  // Scores DPA
  scoreDpa1: number;
  scoreDpa2: number;
  scoreDpa3: number;
  scoreDpa4: number;
  totalDpa: number;
  dpaClass: DanoEnum; // Baixo, Medio, Alto calculated
  
  rupturaTexto: string;
  legendaDPA: string;

  // CRI (4.3)
  criPreClassificacao: boolean;

  // Caracteristicas Tecnicas (CT)
  scoreCt1: number; // Altura (calc from sec 3)
  scoreCt2: number; // Comprimento (calc from sec 3)
  scoreCt3: number; // Tipo (from sec 3)
  scoreCt4: number; // Fundacao (from sec 3)
  scoreCt5: number; // Idade (from sec 3)
  ct6Select: string; // Vazao
  scoreCt6: number;

  // Estado de Conservacao (EC)
  ec1Select: string; scoreEc1: number;
  ec2Select: string; scoreEc2: number;
  ec3Select: string; scoreEc3: number;
  ec4Select: string; scoreEc4: number;
  ec5Select: string; scoreEc5: number;

  // Plano de Seguranca (PSB)
  ps1Select: string; scorePs1: number;
  ps2Select: string; scorePs2: number;
  ps3Select: string; scorePs3: number;
  ps4Select: string; scorePs4: number;
  ps5Select: string; scorePs5: number;
  ps6Select: string; scorePs6: number;

  // CRI Computed Indicators
  totalCT: number;
  totalEC: number;
  totalPS: number;
  
  riskGeral: RiscoEnum;
  valGeral: number;

  riskPercolacao: RiscoEnum;
  valPercolacao: number;

  riskGalgamento: RiscoEnum;
  valGalgamento: number;

  riskGerencial: RiscoEnum;
  valGerencial: number;

  // Legacy/Final
  risco: RiscoEnum; // Final calculated CRI
  resumo: string; // Resumo da classificação (ex: Categoria B)
}

export interface DocItem {
  id: string;
  label: string;
  checked: boolean;
  pageNumber: string; // "Fls. 123"
  extraInput?: string; // For Names, ART numbers, etc.
  extraSelect?: string; // For ART activity type if needed
}

export interface EstruturaHidraulica {
  id: string;
  descricao: string; // "Estrutura Hidráulica 01"
  vazao: string;
  cotaSoleira: string;
  localizacao: string;
  seguranca: string;
}

export interface BarramentoData {
  id: string;
  nome: string;
  snisb: string;
  lat: string;
  long: string;
  relacaoBarragemPrincipal?: 'Barragem em sequência' | 'Reservatório comunicante' | '';
  alturaMaxima: string;
  alturaMaximaFls: string;
  bordaLivre: string;
  bordaLivreFls: string;
  cotaCoroamento: string;
  cotaCoroamentoFls: string;
  comprimentoCoroamento: string;
  comprimentoCoroamentoFls: string;
  larguraCoroamento: string;
  larguraCoroamentoFls: string;
  tipoEstrutural: string;
  tipoFundacao: string;
  
  idade: string;
  scoreIdade: number | null;

  // Reservatório
  cotaNNO: string;
  cotaNMM: string;
  areaNNO: string;
  areaNMM: string;
  volumeNMO: string;
  volumeNMM: string;
  
  vazaoMaxima: string; // m3/s /TR
  
  estruturas: EstruturaHidraulica[];

  // Adequações (Moved from EstruturaHidraulica)
  possuiAdequacao: boolean;
  adequacaoVazao?: string;
  adequacaoCota?: string;
  adequacaoLocalizacao?: string;
  adequacaoVazaoRemanescente?: string;
  adequacaoSeguranca?: string;
  barragemId?: string;
  sistemaOrigem?: SistemaOrigem;
}

export interface ResponsavelTecnicoEntry {
  id: string;
  nome: string;
  art: string;
  rtId?: string;
  registroProfissional?: string;
  cpf?: string;
  registeredInAdministra?: boolean;
  sistemaOrigem?: SistemaOrigem;
}

export interface ParecerData {
  id?: string;
  userId?: string;
  protocolo: string;
  analista: string;
  analistaOutro?: string;
  data: string;
  dataRecebimentoProcesso?: string;
  dataConclusao?: string;
  
  // Legacy fields
  interessado: string; 
  empreendimento: string; 
  coordenadas: string;

  // Tabela 1 Fields
  razaoSocial: string;
  cpfCnpj: string;
  localizacao: string;
  numCAR: string;
  municipio: string;
  finalidade: string;
  finalidadeOutro: string;
  situacaoEmpreendimento: string;
  situacaoEmpreendimentoOutro: string;
  cursoAgua: string;
  propriedadesLimites: string;
  subBacia: string;
  upg?: string;
  areaBacia: string;
  indicePluviosidade: string;
  legendaTabela1: string;
  
  // Responsaveis Tecnicos
  responsaveisTecnicos: ResponsavelTecnicoEntry[];

  // New Intro Fields
  tipoClassificacao: string;
  tipoClassificacaoOutro: string;
  tipoBarragem: string;
  tipoBarragemOutro: string;
  
  // Documentation Fields
  docsGerais: DocItem[];
  docsGeraisOutro: DocItem[];

  docsIdentificacao: DocItem[];
  docsIdentificacaoOutro: DocItem[];

  espolio: boolean;
  docsEspolio: DocItem[];
  docsEspolioOutro: DocItem[];

  docsArt: DocItem[];
  docsArtOutro: DocItem[];

  docsTecnicos: DocItem[];
  docsTecnicosOutro: DocItem[];

  introducao: string;
  
  // Section 3: Barramento info (replaced string with structured data)
  infoBarramento: string; // Keep for legacy compatibility if needed
  barragemPrincipal: BarramentoData;
  barragensMontante: BarramentoData[];

  classificacao: ClassificacaoData;
  parecer_final: string;
  
  // Portaria Fields
  parecerTecnicoNumero?: string;
  dataParecerTecnico?: string;
  portariaNumero?: string;
  dataPortaria?: string;
  customPortariaText?: string | null;

  status: 'Rascunho' | 'Concluído';
  tipo_documento: 'Parecer Técnico';
  created_at?: string;
  sistemaInformacoes?: InformacaoEmpreendedor;
  empreendedorId?: string;
  empreendimentoId?: string;
  barragemId?: string;
  sistemaOrigem?: SistemaOrigem;
}

export interface InformacaoEmpreendedor {
  id?: string;
  parecer_id?: string;
  processo: string;
  analista: string;
  municipio: string;
  upg?: string;
  data_envio_pendencia?: string;
  data_limite_dias?: number;
  situacao?: 'Aguardando análise' | 'Aguardando cumprimento de pendencias';
  observacoes_analista?: string;
  created_at?: string;
  updated_at?: string;
}

export interface OficioData {
  id?: string;
  userId?: string;
  protocolo: string;
  interessado: string;
  cpfCnpj?: string;
  barragemNome?: string;
  assunto: string;
  data: string;
  pendencias: string[];
  analista: string;
  analistaOutro?: string;
  prazo: string;
  prorrogacaoPrazo?: string;
  situacaoPendencia?: 'Pendente' | 'Cumprido' | 'Não cumprido' | 'Arquivado';
  anotacoesInternas?: string;
  responsaveisTecnicos: {
    nome: string;
    nomeOutro: string;
    art: string;
    rtId?: string;
    registroProfissional?: string;
    cpf?: string;
    registeredInAdministra?: boolean;
    sistemaOrigem?: SistemaOrigem;
  }[];
  lat?: string;
  long?: string;
  municipio?: string;
  status?: 'Rascunho' | 'Concluído';
  tipo_documento: 'Ofício de Pendências';
  tipo_oficio?: '1° Ofício de Pendências' | '2° Ofício de Pendências' | 'Ofício Geral';
  created_at?: string;
  empreendedorId?: string;
  empreendimentoId?: string;
  barragemId?: string;
  sistemaOrigem?: SistemaOrigem;
}

export type UserRole = 'Administrador' | 'Analista' | 'Visualizador';

export type UserSector = 'SETOR DE CLASSIFICAÇÃO DE BARRAGENS' | 'SETOR DE FISCALIZAÇÃO E MONITORAMENTO' | 'SETOR ADMINISTRATIVO' | 'COORDENADOR';

export type UserPerfil = 'Analista de Meio Ambiente' | 'Técnico de Meio Ambiente' | 'Residente Técnico' | 'Estagiário de Nível Superior' | 'Estagiário de Nível Médio' | 'Técnico de Desenvolvimento econômico e social';

export interface User {
  id: string;
  authUserId: string;
  username: string;
  email?: string;
  name: string;
  role: UserRole;
  setor?: UserSector | null;
  perfil?: UserPerfil | null;
  matricula?: string;
  active: boolean;
  forcePasswordChange: boolean;
  forcePasswordChangeAt?: string | null;
}

export interface DashboardStats {
  total: number;
  totalPareceres: number;
  pareceresConcluidos: number;
  pareceresRascunhos: number;
  totalOficios: number;
  oficiosConcluidos: number;
  oficiosRascunhos: number;
  totalNoObligatoriedades: number;
  noObligatoriedadesConcluidos: number;
  noObligatoriedadesRascunhos: number;
}

export interface NoObligatoryData {
  id?: string;
  userId?: string;
  data: any; // Raw JSON from the form
  analista: string;
  processo: string;
  status: 'Rascunho' | 'Concluído';
  tipo_documento: 'Não Obrigatoriedade';
  created_at?: string;
  updated_at?: string;
  // Summary fields for map/charts
  municipio?: string;
  lat?: string;
  long?: string;
  empreendedor?: string;
  empreendedorId?: string;
  empreendimentoId?: string;
  barragemId?: string;
  sistemaOrigem?: SistemaOrigem;
}

export interface RTRejectionEntry {
  id: string;
  nome: string;
  nomeOutro?: string;
  rtId?: string;
  registroProfissional?: string;
  cpf?: string;
  registeredInAdministra?: boolean;
  sistemaOrigem?: SistemaOrigem;
  arts: {
    numero: string;
    atividades: string[];
    atividadesOutro?: string;
    folha: string;
  }[];
}

export interface RejectionData {
  id?: string;
  userId?: string;
  protocolo: string;
  analista: string;
  analistaOutro?: string;
  dataProtocolo: string;
  situacao: string;
  situacaoOutro?: string;

  // Documentação
  docsGerais: DocItem[];
  docsIdentificacao: DocItem[];
  
  espolio: boolean;
  docsEspolio: DocItem[];

  responsaveisTecnicos: RTRejectionEntry[];

  docsTecnicos: DocItem[];

  // Tópico 2: Informações do Pedido
  numProcesso: string;
  analistaRef: string;
  analistaRefOutro?: string;
  
  // Informações do empreendedor/empreendimento
  nomeEmpreendedor: string;
  cpfCnpj: string;
  enderecoEmpreendimento: string;
  nomeFazenda: string;
  numCar: string;
  municipioEmpreendimento: string;
  latEixo: string;
  longEixo: string;
  finalidadeBarramento: string;
  finalidadeBarramentoOutro?: string;
  situacaoEmpreendimento: string;
  situacaoEmpreendimentoOutro?: string;

  // Ofício emitido
  numOficioEmitido: string;
  dataOficioEmitido: string;
  viaEncaminhamento: string[];
  viaEncaminhamentoOutro?: string;
  enderecoEncaminhamento: string;
  dataRecebimentoOficio: string;
  prazoConcedido: number;
  recebidoPorNome: string;

  // Tópico 3: Sistema de Informações ao Empreendedor
  sistemaSituacao: string;
  sistemaObservacoes: string;

  // Tópicos vazios por enquanto conforme pedido
  sistemaEmpreendedor: string;

  status: 'Rascunho' | 'Concluído';
  tipo_documento: 'Indeferimento';
  created_at?: string;
  updated_at?: string;
  
  // Dashboard/Map common fields
  municipio?: string;
  lat?: string;
  long?: string;
  empreendedor?: string;
  empreendedorId?: string;
  empreendimentoId?: string;
  barragemId?: string;
  sistemaOrigem?: SistemaOrigem;
}

export interface TransferData {
  id?: string;
  userId?: string;
  protocolo?: string; // used for listing
  analista: string;
  analistaOutro: string;
  nProcesso: string;
  snisb: string;
  tipoClassificacao: string;
  dataProtocolo: string;
  portariaNumero: string;
  dataPortaria: string;
  portariaNova?: string;
  dataPortariaNova?: string;
  parecerTecnico: string;
  dataParecerTecnico?: string;
  responsavelTecnico: string;
  responsavelTecnicoId?: string;
  responsavelTecnicoRegistered?: boolean;
  artNumero: string;
  nomeFazenda: string;
  zonaEndereco: string;
  municipio: string;
  latGMS: string;
  longGMS: string;
  barragemTipoClassificacao: string;
  barragemTipoClassificacaoOutro: string;
  nomeCursoAgua: string;
  subBacia: string;
  upg?: string;
  alturaMaxima: string;
  tipoBarragem: string;
  situacaoEmpreendimento: string;
  situacaoEmpreendimentoOutro: string;
  volumeArmazenado: string;
  dpa: string;
  cri: string;
  antigoProprietario: string;
  antigoTipoDoc: 'CPF' | 'CNPJ';
  antigoDoc: string;
  novoProprietario: string;
  novoTipoDoc: 'CPF' | 'CNPJ';
  novoDoc: string;
  docs: any[];
  customPortariaText?: string | null;
  status: 'Rascunho' | 'Concluído';
  tipo_documento: 'Transferência de Titularidade';
  created_at?: string;
  updated_at?: string;
  // Dashboard/Map common fields
  lat?: string;
  long?: string;
  empreendedor?: string;
  // Ecosystem integration canonical references
  empreendedorId?: string;
  empreendimentoId?: string;
  barragemId?: string;
  sistemaOrigem?: SistemaOrigem;
}

// ============================================================================
// ECOSSISTEMA CSB (Administra Barragens, Classifica, Notifica, Fiscaliza)
// ============================================================================

export type SistemaOrigem =
  | 'CLASSIFICA_CSB'
  | 'ADMINISTRA_BARRAGENS'
  | 'NOTIFICA_CSB'
  | 'FISCALIZA_BARRAGENS';

export type AdministraEntidadeMestra =
  | 'empreendedor'
  | 'empreendimento'
  | 'barragem'
  | 'responsavel_tecnico';

export type EntidadeTipoEcossistema =
  | AdministraEntidadeMestra
  | 'produto';

export type SolicitacaoStatus = 'pendente' | 'aprovada' | 'reprovada';

export type PoliticaMigracaoAdministra = 'hibrida_deterministica';

export type MasterWriteApiStatus =
  | 'bloqueada_aguardando_api_hibrida'
  | 'ativa';

export interface AdministraEndpointPolicy {
  path: string;
  method: 'POST';
  mode: 'somente_leitura' | 'bloqueado';
  blocked: boolean;
  httpStatusWhenBlocked?: 409;
  allowedActions?: readonly string[];
  blockedActions?: readonly string[];
}

export type PropostaCadastroAdministraStatus =
  | 'elegivel_criacao_automatica'
  | 'revisao_humana_ambigua'
  | 'rejeitada_validacao';

export interface AdministraEntityReference {
  entidade: AdministraEntidadeMestra;
  administraId: string;
  fonteUnica: 'ADMINISTRA_BARRAGENS';
}

export interface PropostaCadastroAdministraContract<
  TPayload = Record<string, unknown>
> {
  entidade: AdministraEntidadeMestra;
  sistemaProponente: 'CLASSIFICA_CSB';
  sistemaDestino: 'ADMINISTRA_BARRAGENS';
  politicaMigracao: PoliticaMigracaoAdministra;
  statusElegibilidade: PropostaCadastroAdministraStatus;
  validacaoDeterministicaAprovada: boolean;
  duplicidadeDeterministicaDetectada: boolean;
  requerRevisaoHumana: boolean;
  motivoPendencia?: string | null;
  dadosPropostos: TPayload;
}

export interface EmpreendedorMaster {
  id: string;
  cpf_cnpj: string;
  tipo_pessoa: 'PF' | 'PJ';
  razao_social: string;
  nome_fantasia?: string | null;
  email?: string | null;
  telefone?: string | null;
  endereco?: string | null;
  municipio?: string | null;
  num_car?: string | null;
  sistema_origem: SistemaOrigem;
  created_by_user_id?: string | null;
  created_by_name?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface EmpreendimentoMaster {
  id: string;
  empreendedor_id?: string | null;
  nome: string;
  num_car?: string | null;
  municipio?: string | null;
  localizacao?: string | null;
  sistema_origem: SistemaOrigem;
  created_by_user_id?: string | null;
  created_by_name?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface BarragemMaster {
  id: string;
  empreendedor_id?: string | null;
  empreendedor_nome?: string | null;
  empreendedor_cpf_cnpj?: string | null;
  snisb?: string | null;
  nome: string;
  municipio: string;
  upg?: string | null;
  sub_bacia?: string | null;
  curso_agua?: string | null;
  zona?: 'Rural' | 'Urbana' | string | null;
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
  sistema_origem: SistemaOrigem;
  created_by_user_id?: string | null;
  created_by_name?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ResponsavelTecnicoMaster {
  id: string;
  nome: string;
  cpf?: string | null;
  registro_profissional?: string | null;
  email?: string | null;
  telefone?: string | null;
  sistema_origem: SistemaOrigem;
  created_by_user_id?: string | null;
  created_by_name?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SolicitacaoAlteracao {
  id: string;
  entidade_tipo: EntidadeTipoEcossistema;
  entidade_id: string;
  entidade_rotulo?: string | null;
  sistema_solicitante: SistemaOrigem;
  sistema_destino_proprietario: SistemaOrigem;
  solicitante_user_id?: string | null;
  solicitante_nome: string;
  solicitante_email?: string | null;
  dados_atuais: Record<string, any>;
  dados_propostos: Record<string, any>;
  justificativa: string;
  status: SolicitacaoStatus;
  analisado_por_user_id?: string | null;
  analisado_por_nome?: string | null;
  parecer_analise?: string | null;
  created_at: string;
  analisado_at?: string | null;
}

export interface ProdutoEcossistemaResumo {
  id: string;
  sistema_origem: SistemaOrigem;
  produto_origem_id: string;
  tipo_produto: string;
  numero_documento?: string | null;
  status?: string | null;
  data_documento?: string | null;
  analista_nome?: string | null;
  empreendedor_id?: string | null;
  empreendedor_nome?: string | null;
  empreendedor_cpf_cnpj?: string | null;
  barragem_id?: string | null;
  barragem_nome?: string | null;
  barragem_snisb?: string | null;
  municipio?: string | null;
  created_at?: string;
}

export interface EcosystemSystemStatus {
  id: SistemaOrigem;
  nome: string;
  papel: string;
  configured: boolean;
  readOnlyFromClassifica: boolean;
}

// ============================================================================
// MÓDULO DE PENDÊNCIAS
// ============================================================================

export type PendenciaSituacao =
  | 'aberta'
  | 'direcionada'
  | 'em_analise'
  | 'resolvida'
  | 'cancelada';

export type PendenciaAcaoHistorico =
  | 'criacao'
  | 'direcionamento'
  | 'mudanca_situacao'
  | 'edicao'
  | 'resolucao';

export interface PendenciaRecord {
  id: string;
  origem: string;
  origem_ref_id: string | null;
  tipo: string;
  titulo: string;
  descricao: string | null;
  situacao: PendenciaSituacao;
  responsavel_id: string | null;
  direcionado_por: string | null;
  direcionado_em: string | null;
  criado_por: string;
  tipo_referencia: string | null;
  referencia_id: string | null;
  empreendedor_id: string | null;
  barragem_id: string | null;
  resolvido_por: string | null;
  resolvido_em: string | null;
  created_at: string;
  updated_at: string;
}

export interface PendenciaHistoricoRecord {
  id: string;
  pendencia_id: string;
  acao: string;
  campo: string | null;
  valor_anterior: string | null;
  valor_novo: string | null;
  usuario_id: string;
  motivo: string | null;
  created_at: string;
}

export interface PendenciaUsuarioOption {
  id: string;
  canonicalUserId: string;
  name: string;
  role: UserRole;
  setor?: string | null;
  active: boolean;
}

export interface PendenciaCapabilities {
  readEnabled: boolean;
  mutationsEnabled: boolean;
  mutationBlockCode: string | null;
  mutationBlockReason: string | null;
}

export interface CreatePendenciaInput {
  tipo: string;
  titulo: string;
  descricao?: string | null;
  origem_ref_id?: string | null;
  tipo_referencia?: string | null;
  referencia_id?: string | null;
  empreendedor_id?: string | null;
  barragem_id?: string | null;
  responsavel_id?: string | null;
  motivo?: string | null;
}

export interface UpdatePendenciaInput {
  tipo: string;
  titulo: string;
  descricao?: string | null;
  origem_ref_id?: string | null;
  tipo_referencia?: string | null;
  referencia_id?: string | null;
  empreendedor_id?: string | null;
  barragem_id?: string | null;
  motivo?: string | null;
}

// ============================================================================
// MÓDULO DE SOLICITAÇÕES DE VISTORIA
// ============================================================================

export type SolicitacaoVistoriaStatus =
  | 'solicitada'
  | 'pendente'
  | 'aberta'
  | 'em_planejamento'
  | 'realizada'
  | 'cancelada';

export interface SolicitacaoVistoriaEquipeMembro {
  id?: string | null;
  nome?: string | null;
  email?: string | null;
}

export interface SolicitacaoVistoriaRecord {
  id: string;
  sistema_origem: 'classifica';
  origem_ref_id: string | null;
  status: SolicitacaoVistoriaStatus | string;
  relato: string;
  barragem_id: string | null;
  barragem_nome: string | null;
  municipio: string | null;
  curso_agua: string | null;
  coordenadas: string | null;
  uso: string | null;
  empreendedor_id: string | null;
  empreendedor_nome: string | null;
  processo: string | null;
  classificacao_atual: string | null;
  dpa: string | null;
  cri: string | null;
  solicitante_id: string | null;
  solicitante_nome: string | null;
  solicitante_email: string | null;
  vistoria_id: string | null;
  data_realizacao: string | null;
  equipe: Array<SolicitacaoVistoriaEquipeMembro | string>;
  observacao_campo: string | null;
  motivo: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface SolicitacaoVistoriaPrefill {
  origem_ref_id?: string | null;
  barragem_id?: string | null;
  barragem_nome?: string | null;
  municipio?: string | null;
  curso_agua?: string | null;
  coordenadas?: string | null;
  uso?: string | null;
  empreendedor_id?: string | null;
  empreendedor_nome?: string | null;
  processo?: string | null;
  classificacao_atual?: string | null;
  dpa?: string | null;
  cri?: string | null;
}

export interface CreateSolicitacaoVistoriaInput extends SolicitacaoVistoriaPrefill {
  relato: string;
}

export interface UpdateSolicitacaoVistoriaInput {
  relato?: string;
  motivo?: string | null;
}

