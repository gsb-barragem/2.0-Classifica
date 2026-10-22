
import { ParecerData, RiscoEnum, DanoEnum, DocItem, BarramentoData } from './types';

// Options for Dropdowns
export const OPS_TIPO_CLASSIFICACAO = [
  "CLASSIFICAÇÃO DE BARRAGEM",
  "PRÉ-CLASSIFICAÇÃO DE BARRAGEM",
  "CRI em pré-classificação",
  "RECLASSIFICAÇÃO DE BARRAGEM",
  "CLASSIFICAÇÃO DE RESERVATÓRIO PULMÃO",
  "OUTRO"
];

export const OPS_TIPO_BARRAGEM = [
  "barragem de terra existente",
  "barragem - tipo reservatório pulmão",
  "barragem de terra",
  "OUTRO"
];

export const OPS_SITUACAO = [
  "Planejamento",
  "Projeto",
  "Construção",
  "Primeiro Enchimento",
  "Operação",
  "Descomissionamento",
  "Desativada",
  "Rompida",
  "Descaracterizada",
  "Sem informação",
  "OUTRO"
];

export const OPS_FINALIDADE = [
  "Abastecimento Público",
  "Irrigação",
  "Regularização de vazão",
  "Combate às secas",
  "Defesa contra inundações",
  "Proteção ao meio ambiente",
  "Navegação",
  "Industrial",
  "Recreação",
  "Aquicultura",
  "Contenção de resíduos industriais",
  "Dessedentação animal",
  "Paisagismo",
  "Contenção de sedimentos",
  "OUTRO"
];

export const OPS_ANALISTA = [
  "Alahn Wellington de Morais",
  "Eliane Antônia Nadaf Diniz",
  "Géssika Rodrigues de Almeida Camacho",
  "Junior Silva de Paula",
  "Matheus Costa Oliveira de Moraes",
  "Vanusa de Souza Pacheco Hoki",
  "Edemar Pinho Vilas Boas",
  "Igor de Oliveira Vital",
  "Yara Dias Pereira",
  "Bianka Nuccya Magalhães Campos",
  "Carlos Augusto Gomes de Oliveria",
  "Fernando de Almeida Pires",
  "OUTRO"
];

export const OPS_RESPONSAVEL_TECNICO = [
  "Alencar Cella", "Alex Sallas Lopes", "André Luiz Machado", "André Luiz Schuring", "Anderson C. Aragão Vasconcelos",
  "ANDRE LUIS DO ESPIRITO SANTO", "Ana Carolina Martins de Siqueira Antonachi", "Apoliana dos Santos Vieira Medeiros",
  "Áureo Sierra da Silva", "Beatriz Crestina", "Beno Guilherme Ziech", "Bruno Renner", "Bruna Assis Paim dos Santos",
  "Bruna Caroline Freitas Machado", "Caio Vinicius Mallezan", "Carlos Eduardo Vendite de Assis",
  "César Augusto Mamede de Oliveira Pinto", "Claudio Giuseppe Terzi", "Cleber Cenci", "Cosme Alves Rodrigues",
  "Cristiane Schotten dos Santos", "Darci Carlos Fornari", "David Edson Teixeira", "Derkian Sanches de Oliveira",
  "Diego Luciano Gualdi", "Dreyfus Lincoln Silveira Feitoza", "Duan Marcel da Silva Oliveira", "Edson Fiabani",
  "Eduardo Jacusiel Miranda", "Eduardo Jacusiel Miranda e Leonardo Chicre Maluf", "Elias Rodrigues Leal", "Esmeraldo de Almeida",
  "Fabiana Rodrigues dos Santos Souza", "Fábio Borges Lima", "Fernando dos Santos Sanches", "Fernando Alécio Costa",
  "Fernando Cuiabano", "Fernando Henrique de Godoy", "Gabriela Marques Batista", "Giovane Almondes Anderção",
  "Guilherme Alexandre Leachenski", "Gustavo Ribeiro da Silva", "Hélio David de Almeida Filho", "Higor Cezar da Silva Pavinato",
  "Hiago Cesar Souza Rodrigues", "Italo Silva Oliveira", "Jailson Baumgartner", "João Antonio Bernardo das Neves",
  "João Antonio Possani Oinaski", "João Bernardo das Neves", "João Bosco Silva Gonçalves", "Jonas Mangoni Rambo",
  "Jonatas Garcia Hurtado", "José Benedito Gaiva", "Juli Victório Rocha Lima", "Karyna Lorrainy da Silva",
  "Keli Rejane Silva Dantas", "Kerolin Elza Costa Gonçalves", "Khayke Botelho Sonohata", "Leonardo Pinheiro Costa",
  "Livio Costa Recedive", "Lucas Souza Pereira", "Luciana Rezende Almeida", "Luciano Jorge da Cunha Viana",
  "Luis Augusto Siebeneichler", "Luiz Carlos Machado Filho", "Maria Luiza Santi Presentinho", "Mariele da Rocha",
  "Matheus Felype Rocha Baldin", "Mário Luiz Cuiabano", "Monique Kothrade Casonatto", "Patricia Aparecida Justino",
  "Paulo Sergio Alencar Carvalho", "Paulo Sérgio Alencar Carvalho", "Péricles Aquino Botelho", "Rafael Beduschi",
  "Rafael Cantuério de Souza", "Renan Felipe Quaresma Martins", "Ricardo Barbosa Damascena", "Ricardo Faria Mecca",
  "Ricardo Yotzchetz Junior", "Sandra Eudes Simão de Lima", "Sergio Alex Martins Bragagnolo", "Tadeu Miranda de Queiroz",
  "Taiana Todes chini", "Tainah da Silva Ferreira", "Tamara Cristina Tariga", "Thaiana Todeschini",
  "Thaice Laine Pedroso Marques Neis", "Thiago Eustácio da Rocha", "Tiago Guilherme Menegon", "Tiago Onorio",
  "Tiago Saraiva Muniz", "Túllio Moraes Dias", "Vanessa Gomes", "Wagner Barros de Paula", "Warley Leonel Vilela",
  "Wesley dos Santos Marques", "OUTRO"
];

export const OPS_MUNICIPIOS = [
  "Acorizal", "Água Boa", "Alta Floresta", "Alto Araguaia", "Alto Boa Vista", "Alto Garças", "Alto Paraguai", "Alto Taquari", "Apiacás",
  "Araguaiana", "Araguainha", "Araputanga", "Arenápolis", "Aripuanã", "Barão de Melgaço", "Barra do Bugres", "Barra do Garças", "Bom Jesus do Araguaia",
  "Brasnorte", "Cáceres", "Campinápolis", "Campo Novo do Parecis", "Campo Verde", "Campos de Júlio", "Canabrava do Norte", "Canarana", "Carlinda",
  "Castanheira", "Chapada dos Guimarães", "Cláudia", "Cocalinho", "Colíder", "Colniza", "Comodoro", "Confresa", "Conquista d’Oeste", "Cotriguaçu",
  "Cuiabá", "Curvelândia", "Denise", "Diamantino", "Dom Aquino", "Feliz Natal", "Figueirópolis d’Oeste", "Gaúcha do Norte", "General Carneiro",
  "Glória d’Oeste", "Guarantã do Norte", "Guiratinga", "Indiavaí", "Ipiranga do Norte", "Itanhangá", "Itaúba", "Itiquira", "Jaciara", "Jangada",
  "Jauru", "Juara", "Juína", "Juruena", "Juscimeira", "Lambari d’Oeste", "Lucas do Rio Verde", "Luciára", "Marcelândia", "Matupá", "Mirassol d’Oeste",
  "Nobres", "Nortelândia", "Nossa Senhora do Livramento", "Nova Bandeirantes", "Nova Brasilândia", "Nova Canaã do Norte", "Nova Guarita", "Nova Lacerda",
  "Nova Marilândia", "Nova Maringá", "Nova Monte Verde", "Nova Mutum", "Nova Nazaré", "Nova Olímpia", "Nova Santa Helena", "Nova Ubiratã", "Nova Xavantina",
  "Novo Horizonte do Norte", "Novo Mundo", "Novo Santo Antônio", "Novo São Joaquim", "Paranaíta", "Paranatinga", "Pedra Preta", "Peixoto de Azevedo",
  "Planalto da Serra", "Poconé", "Pontal do Araguaia", "Ponte Branca", "Pontes e Lacerda", "Porto Alegre do Norte", "Porto dos Gaúchos", "Porto Esperidião",
  "Porto Estrela", "Poxoréu", "Primavera do Leste", "Querência", "Reserva do Cabaçal", "Ribeirão Cascalheira", "Ribeirãozinho", "Rio Branco",
  "Rondolândia", "Rondonópolis", "Rosário Oeste", "Salto do Céu", "Santa Carmem", "Santa Cruz do Xingu", "Santa Rita do Trivelato", "Santa Terezinha",
  "Santo Afonso", "Santo Antônio do Leste", "Santo Antônio do Leverger", "São Félix do Araguaia", "São José do Povo", "São José do Rio Claro",
  "São José do Xingu", "São José dos Quatro Marcos", "São Pedro da Cipa", "Sapezal", "Serra Nova Dourada", "Sinop", "Sorriso", "Tabaporã",
  "Tangará da Serra", "Tapurah", "Terra Nova do Norte", "Tesouro", "Torixoréu", "União do Sul", "Vale de São Domingos", "Várzea Grande", "Vera",
  "Vila Bela da Santíssima Trindade", "Vila Rica"
];

// Coordinates for Map Plotting (Approximate)
export const MUNICIPALITY_COORDS: Record<string, {lat: number, lng: number}> = {
  "Cuiabá": { lat: -15.601, lng: -56.097 },
  "Várzea Grande": { lat: -15.654, lng: -56.132 },
  "Rondonópolis": { lat: -16.467, lng: -54.636 },
  "Sinop": { lat: -11.862, lng: -55.500 },
  "Sorriso": { lat: -12.542, lng: -55.721 },
  "Tangará da Serra": { lat: -14.620, lng: -57.486 },
  "Cáceres": { lat: -16.071, lng: -57.681 },
  "Primavera do Leste": { lat: -15.559, lng: -54.302 },
  "Lucas do Rio Verde": { lat: -13.056, lng: -55.918 },
  "Barra do Garças": { lat: -15.893, lng: -52.260 },
  "Alta Floresta": { lat: -9.877, lng: -56.083 },
  "Pontes e Lacerda": { lat: -15.226, lng: -59.335 },
  "Juína": { lat: -11.378, lng: -58.743 },
  "Campo Novo do Parecis": { lat: -13.674, lng: -57.888 },
  "Juara": { lat: -11.254, lng: -57.525 },
  "Peixoto de Azevedo": { lat: -10.224, lng: -54.978 },
  "Colíder": { lat: -10.810, lng: -55.457 },
  "Guarantã do Norte": { lat: -9.788, lng: -54.908 },
  "Água Boa": { lat: -14.050, lng: -52.161 },
  "Nova Mutum": { lat: -13.840, lng: -56.082 },
  "Sapezal": { lat: -12.989, lng: -58.764 },
  "Aripuanã": { lat: -10.168, lng: -59.444 },
  "Poconé": { lat: -16.257, lng: -56.623 },
  "Barra do Bugres": { lat: -15.074, lng: -57.181 },
  "Matupá": { lat: -10.211, lng: -54.933 },
  "Confresa": { lat: -10.643, lng: -51.567 },
  "Ipiranga do Norte": { lat: -12.062, lng: -56.171 },
  "Jaciara": { lat: -15.952, lng: -54.966 },
  "Mirassol d’Oeste": { lat: -15.675, lng: -58.096 },
  "Querência": { lat: -12.607, lng: -52.186 },
  "Paranatinga": { lat: -14.428, lng: -54.047 },
  "Diamantino": { lat: -14.408, lng: -56.446 },
  "Canarana": { lat: -13.551, lng: -52.269 },
  "Colniza": { lat: -9.406, lng: -59.023 },
  "Comodoro": { lat: -13.662, lng: -59.787 },
  "Chapada dos Guimarães": { lat: -15.460, lng: -55.749 }
};

export const OPS_TIPO_ESTRUTURAL = [
  "concreto (1 ponto)",
  "alvenaria de Pedra (2)",
  "Enrocamento (3)",
  "face em concreto (3)",
  "Terra Homogênea (4)",
  "Terra Zoneada (4)",
  "Gabião (5)",
  "Material Não Convencional (5)",
  "Outros/ Desconhecido (5)"
];

export const OPS_TIPO_FUNDACAO = [
  "Rocha sã (0)",
  "Rocha Alterada Dura com tratamento (2)",
  "Rocha Alterada sem tratamento (3)",
  "Solo residual (5)",
  "Aluvião (5)",
  "Solos Permeáveis (5)",
  "Solos Compressíveis (5)",
  "Desconhecido (5)"
];

// --- DPA OPTIONS ---
export const OPS_DPA1_VOLUME = [
  "MUITO BAIXO – inferior a 3hm³ (1)",
  "BAIXO – de 3 a 10 hm³ (2)",
  "MEDIO – de 10 a 75 hm³ (3)",
  "ALTO – de 75 a 200 hm³ (4)",
  "MUITO ALTO – superior a 200hm³ (5)"
];

export const OPS_DPA2_CONSTRUCOES = [
  "BAIXO – Não existem pessoas permanentes, residentes ou temporárias na área de inundação, exceto aquelas indispensáveis à operação (0)",
  "MÉDIO - Existem locais de ocupação temporária, rodovia, ferrovia, estrada de acesso de uso local (2)",
  "ALTO - Existem edificações ocupadas permanentemente, residentes na área de inundação, somente em zonas rurais (4)",
  "MUITO ALTO – Existem edificações ocupadas permanentemente, residentes na área de inundação, incluindo zona urbana (5)"
];

export const OPS_DPA3_ENV = [
  "Baixo – a área afetada encontra-se ambientalmente degradada (1)",
  "MÉDIO – Não constitui área de interesse ambiental protegida por legislação especifica (2)",
  "ALTO – Atinge áreas de proteção de uso sustentável (3)",
  "MUITO ALTO – áreas de proteção integral (5)"
];

export const OPS_DPA4_SOCIO = [
  "Muito Baixo – Sem possibilidade de impactar nenhuma área ocupada permanentemente ou temporária (0)",
  "BAIXO – Com possibilidade de impactar somente área rural, sem nenhuma aglomeração rural (1)",
  "Médio – Com possibilidade de impactar aglomerado rural ou somente áreas não-urbanizadas de cidade ou vila (2)",
  "ALTO – Possibilidade de impactar área urbanizada ou distrito, ou descontinuar pelo menos uma atividade de grande impacto econômico regional, ou patrimônio histórico, sitio arqueológico, comunidade tradicional, TI, quilombolas (4)",
  "MUITO ALTO – Com possibilidade de impactar serviços públicos essenciais (5)"
];

// --- CRI OPTIONS (CT, EC, PS) ---

export const OPS_CT6_VAZAO = [
  "MCP - Cheia Máxima Provável (0)",
  "Decamilenar TR = 10.000 (0)",
  "1.000 ≤ TR < 10.000 anos (2)",
  "500 ≤ TR < 1.000 anos (3)",
  "TR < 500 (5)",
  "TR Desconhecida (5)"
];

export const OPS_EC1_EXTRAVASOR = [
  "Em condições adequadas de funcionamento e desobstruídos (0)",
  "Em funcionamento com alguma anomalia, sem comprometer a estabilidade (2)",
  "Em funcionamento com anomalia que possa comprometer estabilidade, com medidas corretivas (3)",
  "Em funcionamento com anomalia que possa comprometer estabilidade, sem medidas corretivas (5)"
];

export const OPS_EC2_ADUTORA = [
  "Em condições adequadas de manutenção e funcionamento, ou inexistência (0)",
  "Comprometidas, com estrutura que viabilize interrupção por montante (3)",
  "Comprometidas, sem estrutura que viabilize interrupção por montante (5)"
];

export const OPS_EC3_PERCOLACAO = [
  "Percolação controlada ou umidade insignificante (0)",
  "Umidade/Surgência estáveis e monitoradas (2)",
  "Umidade/Surgência sem intervenções, não estabilizadas e não monitoradas (4)",
  "Infiltração ou Surgência com carreamento de material ou vazão crescente (5)"
];

export const OPS_EC4_DEFORMACAO = [
  "Inexistente ou pouco significativo (0)",
  "Trincas/abatimentos significativos, com medidas corretivas em implantação (2)",
  "Trincas/abatimentos significativos, sem implantação das medidas corretivas (4)",
  "Trincas, abatimentos ou escorregamentos com potencial de comprometimento (5)"
];

export const OPS_EC5_TALUDES = [
  "Inexistente ou pouco significativo (0)",
  "Falhas na proteção ou vegetação pequeno porte ou desagregação pequena (1)",
  "Erosões superficiais ou vegetação médio porte ou desagregação localizada (3)",
  "Erosões acentuadas ou vegetação grande porte ou desagregação generalizada (4)",
  "Erosões generalizadas, escorregamentos ou desplacamento com risco (5)"
];

export const OPS_PS1_DOCS = [
  "Projeto básico e executivo como construído (0)",
  "Projeto executivo ou como construído (1)",
  "Projeto básico ou RPSB (3)",
  "Anteprojeto ou projeto conceitual (4)",
  "Inexiste documentação de projeto (5)"
];

export const OPS_PS2_ORG = [
  "Possui responsável técnico e estrutura organizacional, com unidade local subordinada a esta estrutura (0)",
  "Possui estrutura organizacional e responsável técnico (1)",
  "Possui estrutura organizacional, sem responsável técnico (4)",
  "Possui apenas responsável técnico (3)",
  "Não possui estrutura organizacional nem responsável técnico (5)"
];

export const OPS_PS3_INSP = [
  "Possui normativos internos e aplica procedimentos de inspeção e monitoramento (0)",
  "Possui normativos internos e aplica somente procedimentos de inspeção (2)",
  "Possui normativos internos e aplica somente os procedimentos de monitoramento (3)",
  "Possui normativos internos mas não aplica procedimentos de inspeção e monitoramento (4)",
  "Não possui normativos internos de inspeção e monitoramento, ou possui procedimentos em desconformidade com a PNSB (5)"
];

export const OPS_PS4_REL = [
  "Emite relatórios de monitoramento e inspeção (0)",
  "Emite apenas relatório de inspeção (2)",
  "Emite apenas relatório de monitoramento (3)",
  "Emite relatórios, porém em desconformidade com a PNSB e suas regulamentações (4)",
  "Não emite relatórios (5)"
];

export const OPS_PS5_PAE = [
  "Não é exigido ou PAE implantado (0)",
  "PAE em fase de implantação (1)",
  "PAE elaborado e disponibilizado (2)",
  "PAE em elaboração ou rotina simplificada (3)",
  "Não possui PAE - quando exigido (5)"
];

export const OPS_PS6_REGRA = [
  "Possui normativo e aplica regra para todos (0)",
  "Possui normativo e aplica regra para alguns (2)",
  "Possui normativo e não aplica regra (4)",
  "Não possui normativo interno das regras operacionais (5)"
];

// Documentation Lists - labels only, items created at runtime
export const LABELS_DOCS_GERAIS = [
  "Requerimento padrão SEMA",
  "Publicação do pedido no Diário Oficial do Estado de Mato Grosso",
  "Cópia da guia de recolhimento da classificação com o comprovante do pagamento",
  "Comprovante de endereço urbano do empreendedor",
  "Comprovante de caixa postal",
  "Outorga de direito de uso",
  "Licença vigente",
  "Licença em processo de renovação",
  "Autorização que lhe confere direito de operação da barragem e do respectivo reservatório",
  "Documentação comprobatória da posse do imóvel e Número do Cadastro Ambiental Rural (CAR)",
  "Cópia do contrato de arrendamento e Número do Cadastro Ambiental Rural (CAR) em nome do proprietário da terra",
  "Carta de anuência do detentor da posse do imóvel",
  "Cópia do IPTU"
];

export const LABELS_DOCS_IDENTIFICACAO = [
  { label: "Cópia do RG", hasInput: true, placeholder: "Nome..." },
  { label: "Cópia do CPF", hasInput: true, placeholder: "Nome..." },
  { label: "Cópia da CNH", hasInput: true, placeholder: "Nome..." },
  { label: "Cópia do Comprovante de Endereço do Interessado", hasInput: true, placeholder: "Nome..." },
  { label: "Cadastro do profissional junto à SEMA", hasInput: true, placeholder: "Nome..." },
  { label: "Cópia do Contrato Social consolidado com as alterações devidamente registrado", hasInput: false },
  { label: "Cópia do Estatuto Social em vigor e da ata de eleição dos administradores, ambos registrados na Junta Comercial", hasInput: false },
  { label: "Órgão público dos três poderes, autarquia e fundação pública – Cópia do Ato de nomeação do titular devidamente publicado ou diploma e ata de nomeação do Prefeito", hasInput: false },
  { label: "Cópia do Comprovante de endereço da empresa", hasInput: true, placeholder: "Nome..." }
];

export const LABELS_DOCS_ESPOLIO = [
  { label: "Cópia da Certidão de óbito", hasInput: true, placeholder: "Nome..." },
  { label: "Cópia do Termo de inventariante do representante do espólio", hasInput: true, placeholder: "Nome..." },
  { label: "Protocolo de inventário extrajudicial no cartório", hasInput: false },
  { label: "Anuência de todos os herdeiros declarados na certidão de óbito", hasInput: false },
  { label: "Documentos do representante do espólio (inventariante)", hasInput: false },
  { label: "Documentos de todos os herdeiros: cópia do RG; CPF e cópia do comprovante de endereço", hasInput: true, placeholder: "Vários nomes..." }
];

export const LABELS_DOCS_ART = [
  "hidrológicos",
  "projeto básico da barragem",
  "levantamentos planialtimétrico",
  "projeto de levantamento batimétrico",
  "execução da barragem de terra"
];

export const LABELS_DOCS_TECNICOS = [
  { label: "Croquis de acesso ao local da barragem", hasInput: false },
  { label: "Projeto da barragem elaborado por", hasInput: true, placeholder: "Nome do elaborador..." },
  { label: "Memorial de cálculo em referência aos estudos hidrológicos", hasInput: false },
  { label: "Memorial - Relação curva Cota x Área x Volume", hasInput: false },
  { label: "Estudos de estabilidade dos taludes e anexos", hasInput: false },
  { label: "Memorial quanto ao estudo de ruptura hipotética - ‘mancha de inundação’", hasInput: false },
  { label: "Relatório de inspeção de reservatório artificial", hasInput: false },
  { label: "Plano de Manutenção", hasInput: false },
  { label: "Plano de Monitoramento", hasInput: false },
  { label: "Plano de operação", hasInput: false },
  { label: "Pranchas dos projetos do reservatório: planta baixa, perfil de alinhamento, perfil transversal e longitudinal", hasInput: false },
  { label: "Estudo de ruptura hipotética da barragem", hasInput: false },
  { label: "Mapa de Inundação", hasInput: false },
  { label: "Requerimento para cadastro no sistema nacional de informações sobre segurança de barragens (SNISB) /ANA)", hasInput: false }
];

// --- REALISTIC MOCK DATA GENERATOR ---

const getRandom = (arr: any[]) => arr[Math.floor(Math.random() * arr.length)];
const getRandomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

const generateMockPareceres = (count: number): ParecerData[] => {
  return Array.from({ length: count }).map((_, i) => {
    const dpaEnum = [DanoEnum.BAIXO, DanoEnum.MEDIO, DanoEnum.ALTO][getRandomInt(0, 2)];
    const riscoEnum = [RiscoEnum.BAIXO, RiscoEnum.MEDIO, RiscoEnum.ALTO][getRandomInt(0, 2)];
    const status = getRandomInt(0, 10) > 2 ? 'Concluído' : 'Rascunho';
    
    // Pick municipality slightly biased towards known coordinates for better map demo
    let muni = getRandom(OPS_MUNICIPIOS);
    let lat = '';
    let long = '';

    if (i % 3 === 0 || MUNICIPALITY_COORDS[muni]) {
       const keys = Object.keys(MUNICIPALITY_COORDS);
       const targetMuni = MUNICIPALITY_COORDS[muni] ? muni : keys[getRandomInt(0, keys.length - 1)];
       muni = targetMuni;
       const baseCoords = MUNICIPALITY_COORDS[targetMuni];
       // Add small random offset to simulate exact location
       lat = (baseCoords.lat + (Math.random() - 0.5) * 0.5).toFixed(6);
       long = (baseCoords.lng + (Math.random() - 0.5) * 0.5).toFixed(6);
    }

    // PNSB Logic Simulation
    // Roughly, High DPA or High Height or High Volume triggers PNSB
    const altura = getRandomInt(5, 25);
    const volume = getRandomInt(1, 10); // hm3
    const isPNSB = (dpaEnum !== DanoEnum.BAIXO) || altura >= 15 || volume >= 3;
    const resumo = isPNSB ? 
      (dpaEnum === DanoEnum.ALTO || riscoEnum === RiscoEnum.ALTO ? 'CLASSE A (CRI Alta)' : 
       dpaEnum === DanoEnum.MEDIO ? 'CLASSE B (CRI Média)' : 'CLASSE C (CRI Baixa)') 
      : 'NÃO SE ENQUADRA NA PNSB';

    return {
      id: `proc-${20240000 + i}`,
      protocolo: `${getRandomInt(10000, 99999)}/2024`,
      analista: getRandom(OPS_ANALISTA),
      data: new Date(2024, getRandomInt(0, 11), getRandomInt(1, 28)).toISOString().split('T')[0],
      dataConclusao: status === 'Concluído' ? new Date(2025, getRandomInt(0, 2), getRandomInt(1, 28)).toISOString().split('T')[0] : undefined,
      razaoSocial: `Fazenda ${['Santa Maria', 'Boa Vista', 'Esperança', 'Vitória', 'São José'][getRandomInt(0, 4)]} Ltda`,
      cpfCnpj: `${getRandomInt(10, 99)}.${getRandomInt(100, 999)}.${getRandomInt(100, 999)}/0001-${getRandomInt(10, 99)}`,
      localizacao: 'Zona Rural',
      numCAR: `MT-${getRandomInt(10000, 99999)}/2024`,
      municipio: muni,
      finalidade: getRandom(OPS_FINALIDADE),
      finalidadeOutro: '',
      situacaoEmpreendimento: getRandom(OPS_SITUACAO),
      situacaoEmpreendimentoOutro: '',
      cursoAgua: 'Córrego ' + ['Fundo', 'Grande', 'Pequeno', 'Azul', 'Verde'][getRandomInt(0, 4)],
      propriedadesLimites: 'Própria',
      subBacia: 'Rio Cuiabá',
      areaBacia: '100',
      indicePluviosidade: '1500mm',
      legendaTabela1: '',
      
      responsaveisTecnicos: [{
        id: `rt-${i}`,
        nome: getRandom(OPS_RESPONSAVEL_TECNICO),
        art: `${getRandomInt(1000000, 9999999)}`
      }],

      tipoClassificacao: OPS_TIPO_CLASSIFICACAO[0],
      tipoClassificacaoOutro: '',
      tipoBarragem: OPS_TIPO_BARRAGEM[0],
      tipoBarragemOutro: '',
      
      // Minimal structure for brevity in mock
      docsGerais: [], docsGeraisOutro: [{id:'1',label:'',checked:false,pageNumber:'',extraInput:''}],
      docsIdentificacao: [], docsIdentificacaoOutro: [{id:'2',label:'',checked:false,pageNumber:'',extraInput:''}],
      espolio: false, docsEspolio: [], docsEspolioOutro: [{id:'3',label:'',checked:false,pageNumber:'',extraInput:''}],
      docsArt: [], docsArtOutro: [{id:'4',label:'',checked:false,pageNumber:'',extraInput:''}],
      docsTecnicos: [], docsTecnicosOutro: [{id:'5',label:'',checked:false,pageNumber:'',extraInput:''}],
      introducao: '', infoBarramento: '', barragensMontante: [], parecer_final: '',
      interessado: `Empresário ${i}`, empreendimento: `Barragem ${i}`, coordenadas: '',

      barragemPrincipal: {
        id: 'main', nome: `Barragem ${i}`, snisb: `${getRandomInt(1000, 9999)}`, lat: lat, long: long,
        alturaMaxima: altura.toString(), alturaMaximaFls: '',
        bordaLivre: '', bordaLivreFls: '',
        cotaCoroamento: '', cotaCoroamentoFls: '',
        comprimentoCoroamento: '', comprimentoCoroamentoFls: '',
        larguraCoroamento: '', larguraCoroamentoFls: '',
        tipoEstrutural: '',
        tipoFundacao: '', idade: '10', scoreIdade: 2, cotaNNO: '', cotaNMM: '',
        areaNNO: '', areaNMM: '', volumeNMO: '', volumeNMM: volume.toString(), vazaoMaxima: '', 
        estruturas: [
          { id: 's1', descricao: 'Vertedouro', vazao: '100', cotaSoleira: '100', localizacao: 'Ombreira', seguranca: 'Boa' }
        ],
        possuiAdequacao: false
      },

      classificacao: {
        dpa1Select: '', dpa2Select: '', dpa3Select: '', dpa4Select: '',
        scoreDpa1: 0, scoreDpa2: 0, scoreDpa3: 0, scoreDpa4: 0, totalDpa: 0, 
        dpaClass: dpaEnum, rupturaTexto: '', legendaDPA: '', criPreClassificacao: false,
        scoreCt1: 0, scoreCt2: 0, scoreCt3: 0, scoreCt4: 0, scoreCt5: 0, ct6Select: '', scoreCt6: 0,
        ec1Select: '', scoreEc1: 0, ec2Select: '', scoreEc2: 0, ec3Select: '', scoreEc3: 0, ec4Select: '', scoreEc4: 0, ec5Select: '', scoreEc5: 0,
        ps1Select: '', scorePs1: 0, ps2Select: '', scorePs2: 0, ps3Select: '', scorePs3: 0, ps4Select: '', scorePs4: 0, ps5Select: '', scorePs5: 0, ps6Select: '', scorePs6: 0,
        totalCT: 0, totalEC: 0, totalPS: 0, riskGeral: riscoEnum, valGeral: 0,
        riskPercolacao: RiscoEnum.BAIXO, valPercolacao: 0, riskGalgamento: RiscoEnum.BAIXO, valGalgamento: 0,
        riskGerencial: RiscoEnum.BAIXO, valGerencial: 0,
        risco: riscoEnum, resumo: resumo
      },
      status: status as any,
      tipo_documento: 'Parecer Técnico'
    };
  });
};

export const ALL_MOCK_DATA: ParecerData[] = [];
