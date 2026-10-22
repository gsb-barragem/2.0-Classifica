
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

  // Plano de Seguranca (PS)
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
  scoreIdade: number;

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
}

export interface ResponsavelTecnicoEntry {
  id: string;
  nome: string;
  art: string;
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
  assunto: string;
  data: string;
  pendencias: string[];
  analista: string;
  analistaOutro?: string;
  prazo: string;
  prorrogacaoPrazo?: string;
  situacaoPendencia?: 'Pendente' | 'Cumprido' | 'Não cumprido' | 'Arquivado';
  anotacoesInternas?: string;
  responsaveisTecnicos: { nome: string; nomeOutro: string; art: string }[];
  lat?: string;
  long?: string;
  municipio?: string;
  status?: 'Rascunho' | 'Concluído';
  tipo_documento: 'Ofício de Pendências';
  tipo_oficio?: '1° Ofício de Pendências' | '2° Ofício de Pendências' | 'Ofício Geral';
  created_at?: string;
}

export type UserRole = 'Administrador' | 'Analista' | 'Visualizador';

export type UserSector = 'SETOR DE CLASSIFICAÇÃO DE BARRAGENS' | 'SETOR DE FISCALIZAÇÃO E MONITORAMENTO' | 'SETOR ADMINISTRATIVO' | 'COORDENADOR';

export interface User {
  id: string;
  authUserId: string;
  username: string;
  email?: string;
  name: string;
  role: UserRole;
  setor?: UserSector | null;
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
}

export interface RTRejectionEntry {
  id: string;
  nome: string;
  nomeOutro?: string;
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
}
