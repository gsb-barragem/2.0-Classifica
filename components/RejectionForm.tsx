import React, { useState, useContext, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  Save, 
  ChevronDown, 
  ChevronUp, 
  Plus, 
  Trash2, 
  FileText, 
  ArrowLeft,
  Calendar,
  User,
  Wrench,
  CheckCircle2,
  FileCheck,
  Eye,
  Download,
  Database,
  AlertCircle,
  RotateCcw,
  X,
  FileDown
} from 'lucide-react';
import { toast } from 'sonner';
import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, BorderStyle } from 'docx';
import { saveAs } from 'file-saver';
import { logActivity } from '../src/lib/auditService';
import { AuthContext } from '../src/contexts/AuthContext';
import { DataContext } from '../src/contexts/DataContext';
import { DocItem, RejectionData, RTRejectionEntry } from '../types';
import { supabase } from '../src/supabaseClient';
import { OPS_ANALISTA as ANALISTAS } from '../constants';

interface RejectionFormProps {
  initialData?: RejectionData;
  onCancel: () => void;
  onSave: () => void;
}

const SITUACOES = [
  "Planejamento", "Projeto", "Construção", "Primeiro Enchimento", 
  "Operação", "Descomissionamento", "Desativada", "Rompida", 
  "Descaracterizada", "Sem informação", "OUTRO"
];

const DOCS_GERAIS = [
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
  "Cópia do IPTU",
  "OUTRO"
];

const DOCS_IDENTIFICACAO = [
  "Cópia do RG",
  "Cópia do CPF",
  "Cópia d CNH",
  "Cópia do Comprovante de Endereço do Interessado",
  "Cadastro do profissional junto à SEMA",
  "Cópia do Contrato Social consolidado com as alterações devidamente registrado",
  "Cópia do Estatuto Social em vigor e da ata de eleição dos administradores, ambos registrados na Junta Comercial",
  "Órgão público dos três poderes, autarquia e fundação pública – Cópia do Ato de nomeação do titular devidamente publicado ou diploma e ata de nomeação do Prefeito",
  "Cópia do Comprovante de endereço da empresa",
  "OUTRO"
];

const DOCS_ESPOLIO = [
  "Cópia da Certidão de óbito",
  "Cópia do Termo de inventariante do representante do espólio",
  "Protocolo de inventário extrajudicial no cartório",
  "Anuência de todos os herdeiros declarados na certidão de óbito",
  "Documentos do representante do espólio (inventariante)",
  "Documentos de todos os herdeiros: cópia do RG; CPF e cópia do comprovante de endereço",
  "OUTRO"
];

const RT_LIST_BASE = [
  "Alex Sallas Lopes", "André Luiz Machado", "André Luiz Schuring", "Anderson C. Aragão Vasconcelos",
  "ANDRE LUIS DO ESPIRITO SANTO", "Ana Carolina Martins de Siqueira Antonachi", "Apoliana dos Santos Vieira Medeiros",
  "Áureo Sierra da Silva", "Beatriz Crestina", "Beno Guilherme Ziech", "Bruno Renner", "Bruna Assis Paim dos Santos",
  "Bruna Caroline Freitas Machado", "Caio Vinicius Mallezan", "Carlos Eduardo Vendite de Assis",
  "César Augusto Mamede de Oliveira Pinto", "Claudio Giuseppe Terzi", "Cleber Cenci", "Cosme Alves Rodrigues",
  "Cristiane Schotten dos Santos", "Darci Carlos Fornari", "David Edson Teixeira", "Derkian Sanches de Oliveira",
  "Diego Luciano Gualdi", "Dreyfus Lincoln Silveira Feitoza", "Duan Marcel da Silva Oliveira",
  "Edson Fiabani", "Eduardo Jacusiel Miranda", "Elias Rodrigues Leal", "Esmeraldo de Almeida",
  "Fabiana Rodrigues dos Santos Souza", "Fábio Borges Lima", "Fernando dos Santos Sanches",
  "Fernando Alécio Costa", "Fernando Cuiabano", "Fernando Henrique de Godoy", "Gabriela Marques Batista",
  "Giovane Almondes Anderção", "Guilherme Alexandre Leachenski", "Gustavo Ribeiro da Silva",
  "Hélio David de Almeida Filho", "Higor Cezar da Silva Pavinato", "Hiago Cesar Souza Rodrigues",
  "Italo Silva Oliveira", "Jailson Baumgartner", "João Antonio Bernardo das Neves", "João Antonio Possani Oinaski",
  "João Bernardo das Neves", "João Bosco Silva Gonçalves", "Jonas Mangoni Rambo", "Jonatas Garcia Hurtado",
  "José Benedito Gaiva", "Juli Victório Rocha Lima", "Karyna Lorrainy da Silva", "Keli Rejane Silva Dantas",
  "Kerolin Elza Costa Gonçalves", "Khayke Botelho Sonohata", "Leonardo Chicre Maluf", "Leonardo Pinheiro Costa",
  "Livio Costa Recedive", "Lucas Souza Pereira", "Luciana Rezende Almeida", "Luciano Jorge da Cunha Viana",
  "Luis Augusto Siebeneichler", "Luiz Carlos Machado Filho", "Maria Luiza Santi Presentinho",
  "Mariele da Rocha", "Matheus Felype Rocha Baldin", "Mário Luiz Cuiabano", "Monique Kothrade Casonatto",
  "Patricia Aparecida Justino", "Paulo Sergio Alencar Carvalho", "Paulo Sérgio Alencar Carvalho",
  "Péricles Aquino Botelho", "Rafael Beduschi", "Rafael Cantuério de Souza", "Renan Felipe Quaresma Martins",
  "Ricardo Barbosa Damascena", "Ricardo Faria Mecca", "Ricardo Yotzchetz Junior", "Sandra Eudes Simão de Lima",
  "Sergio Alex Martins Bragagnolo", "Tadeu Miranda de Queiroz", "Taiana Todes chini", "Tainah da Silva Ferreira",
  "Tamara Cristina Tariga", "Thaiana Todeschini", "Thaice Laine Pedroso Marques Neis", "Thiago Eustácio da Rocha",
  "Tiago Guilherme Menegon", "Tiago Onorio", "Tiago Saraiva Muniz", "Túllio Moraes Dias", "Vanessa Gomes",
  "Wagner Barros de Paula", "Warley Leonel Vilela", "Wesley dos Santos Marques"
].sort();

const RT_LIST = ["OUTRO", ...RT_LIST_BASE];

const ATIVIDADES_ART = [
  "hidrológicos",
  "projeto básico da barragem",
  "levantamentos planialtimétrico",
  "projeto de levantamento batimétrico",
  "execução da barragem de terra",
  "OUTRO"
];

const DOCS_TECNICOS = [
  "Croquis de acesso ao local da barragem",
  "Projeto da barragem elaborado por",
  "Memorial de cálculo em referência aos estudos hidrológicos",
  "Memorial - Relação curva Cota x Área x Volume",
  "Estudos de estabilidade dos taludes e anexos",
  "Memorial quanto ao estudo de ruptura hipotética - ‘mancha de inundação’",
  "Relatório de inspeção de reservatório artificial",
  "Plano de Manutenção",
  "Plano de Monitoramento",
  "Plano de operação",
  "Pranchas dos projetos do reservatório: planta baixa, perfil de alinhamento, perfil transversal e longitudinal",
  "Estudo de ruptura hipotética da barragem",
  "Mapa de Inundação",
  "Requerimento para cadastro no sistema nacional de informações sobre segurança de barragens (SNISB) /ANA)",
  "OUTRO"
];

const MUNICIPIOS = [
  "Acorizal", "Água Boa", "Alta Floresta", "Alto Araguaia", "Alto Boa Vista", "Alto Garças", "Alto Paraguai", "Alto Taquari", "Apiacás", "Araguaiana", "Araguainha", "Araputanga", "Arenápolis", "Aripuanã", "Barão de Melgaço", "Barra do Bugres", "Barra do Garças", "Bom Jesus do Araguaia", "Brasnorte", "Cáceres", "Campinápolis", "Campo Novo do Parecis", "Campo Verde", "Campos de Júlio", "Canabrava do Norte", "Canarana", "Carlinda", "Castanheira", "Chapada dos Guimarães", "Cláudia", "Cocalinho", "Colíder", "Colniza", "Comodoro", "Confresa", "Conquista d’Oeste", "Cotriguaçu", "Curvelândia", "Cuiabá", "Denise", "Diamantino", "Dom Aquino", "Feliz Natal", "Figueirópolis d’Oeste", "Gaúcha do Norte", "General Carneiro", "Glória d’Oeste", "Guarantã do Norte", "Guiratinga", "Indiavái", "Itaúba", "Itiquira", "Jaciara", "Jangada", "Jauru", "Juara", "Juína", "Juruena", "Juscimeira", "Lambari d’Oeste", "Lucas do Rio Verde", "Luciára", "Marcelândia", "Matupá", "Mirassol d’Oeste", "Nobres", "Nortelândia", "Nossa Senhora do Livramento", "Nova Bandeirantes", "Nova Brasilândia", "Nova Canaã do Norte", "Nova Guarita", "Nova Lacerda", "Nova Marilândia", "Nova Maringá", "Nova Monte Verde", "Nova Mutum", "Nova Nazaré", "Nova Olímpia", "Nova Santa Helena", "Nova Ubiratã", "Nova Xavantina", "Novo Horizonte do Norte", "Novo Mundo", "Novo Santo Antônio", "Novo São Joaquim", "Paranaíta", "Paranatinga", "Pedra Preta", "Peixoto de Azevedo", "Planalto da Serra", "Poconé", "Pontal do Araguaia", "Ponte Branca", "Pontes e Lacerda", "Porto Alegre do Norte", "Porto dos Gaúchos", "Porto Esperidião", "Porto Estrela", "Poxoréu", "Primavera do Leste", "Querência", "Reserva do Cabaçal", "Ribeirão Cascalheira", "Ribeirãozinho", "Rio Branco", "Rondolândia", "Rondonópolis", "Rosário Oeste", "Salto do Céu", "Santa Carmem", "Santa Cruz do Xingu", "Santa Rita do Trivelato", "Santa Terezinha", "Santo Afonso", "Santo Antônio do Leste", "Santo Antônio do Leverger", "São Félix do Araguaia", "São José do Povo", "São José do Rio Claro", "São José do Xingu", "São José dos Quatro Marcos", "São Pedro da Cipa", "Sapezal", "Serra Nova Dourada", "Sinop", "Sorriso", "Tabaporã", "Tangará da Serra", "Tapurah", "Terra Nova do Norte", "Tesouro", "Torixoréu", "União do Sul", "Vale de São Domingos", "Várzea Grande", "Vera", "Vila Bela da Santíssima Trindade", "Vila Rica."
].sort();

const FINALIDADES = [
  "Abastecimento Público", "Irrigação", "Regularização de vazão", "Combate às secas", "Defesa contra inundações", "Proteção ao meio ambiente", "Navegação", "Industrial", "Recreação", "Aquicultura", "Contenção de resíduos industriais", "Dessedentação animal", "Paisagismo", "Contenção de sedimentos", "Outro"
];

const SITUACOES_EP = [
  "Planejamento", "Projeto", "Construção", "Primeiro Enchimento", "Operação", "Descomissionamento", "Desativada", "Rompida", "Descaracterizada", "Sem informação", "Outro"
];

const RejectionForm: React.FC<RejectionFormProps> = ({ initialData, onCancel, onSave }) => {
  const { currentUser } = useContext(AuthContext);
  const { refreshData } = useContext(DataContext);
  const [activeTab, setActiveTab] = useState(1);
  const sectionsRef = {
    1: React.useRef<HTMLDivElement>(null),
    2: React.useRef<HTMLDivElement>(null),
    3: React.useRef<HTMLDivElement>(null),
    4: React.useRef<HTMLDivElement>(null)
  };

  const [expandedSections, setExpandedSections] = useState<Record<number, boolean>>({
    1: true,
    2: true,
    3: true,
    4: true
  });

  const toggleSection = (id: number) => {
    setExpandedSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const scrollToSection = (id: number) => {
    if (!expandedSections[id]) {
      setExpandedSections(prev => ({ ...prev, [id]: true }));
    }
    setTimeout(() => {
      sectionsRef[id as keyof typeof sectionsRef].current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };
  const [expandedBlocks, setExpandedBlocks] = useState<Record<string, boolean>>({
    intro: true,
    docsGerais: true,
    docsIdent: true,
    espolio: true,
    rt: true,
    docsTec: true
  });

  const [formData, setFormData] = useState<RejectionData>(() => {
    const defaultData: RejectionData = {
      protocolo: '',
      analista: '',
      dataProtocolo: '',
      situacao: 'Planejamento',
      situacaoOutro: '',
      docsGerais: DOCS_GERAIS.map(label => ({ id: crypto.randomUUID(), label, checked: false, pageNumber: '' })),
      docsIdentificacao: DOCS_IDENTIFICACAO.map(label => ({ id: crypto.randomUUID(), label, checked: false, pageNumber: '', extraInput: '' })),
      espolio: false,
      docsEspolio: DOCS_ESPOLIO.map(label => ({ id: crypto.randomUUID(), label, checked: false, pageNumber: '', extraInput: '' })),
      responsaveisTecnicos: [],
      docsTecnicos: DOCS_TECNICOS.map(label => ({ id: crypto.randomUUID(), label, checked: false, pageNumber: '', extraInput: '' })),
      numProcesso: '',
      analistaRef: '',
      analistaRefOutro: '',
      nomeEmpreendedor: '',
      cpfCnpj: '',
      enderecoEmpreendimento: '',
      nomeFazenda: '',
      numCar: '',
      municipioEmpreendimento: MUNICIPIOS[0],
      latEixo: '',
      longEixo: '',
      finalidadeBarramento: FINALIDADES[0],
      finalidadeBarramentoOutro: '',
      situacaoEmpreendimento: SITUACOES_EP[0],
      situacaoEmpreendimentoOutro: '',
      numOficioEmitido: '',
      dataOficioEmitido: '',
      viaEncaminhamento: [],
      viaEncaminhamentoOutro: '',
      enderecoEncaminhamento: '',
      dataRecebimentoOficio: '',
      prazoConcedido: 0,
      recebidoPorNome: '',
      sistemaSituacao: 'Parecer Técnico emitido',
      sistemaObservacoes: 'Processo indeferido por inércia',
      sistemaEmpreendedor: '',
      status: 'Rascunho',
      tipo_documento: 'Indeferimento'
    };

    if (initialData) {
      const reconcileDocList = (standardList: DocItem[], savedList: DocItem[] | undefined) => {
        if (!savedList || savedList.length === 0) return standardList;
        
        const matchedIds = new Set<string>();
        
        const result = standardList.map(std => {
          const saved = savedList.find(s => s.label === std.label && !matchedIds.has(s.id));
          if (saved) {
            matchedIds.add(saved.id);
            return { ...std, ...saved };
          }
          return std;
        });

        const extras = savedList.filter(s => !matchedIds.has(s.id));
        return [...result, ...extras];
      };

      return {
        ...defaultData,
        ...initialData,
        docsGerais: reconcileDocList(defaultData.docsGerais, initialData.docsGerais),
        docsIdentificacao: reconcileDocList(defaultData.docsIdentificacao, initialData.docsIdentificacao),
        docsEspolio: reconcileDocList(defaultData.docsEspolio, initialData.docsEspolio),
        docsTecnicos: reconcileDocList(defaultData.docsTecnicos, initialData.docsTecnicos),
      };
    }

    return defaultData;
  });

  // Pre-select analyst based on logged-in user
  useEffect(() => {
    if (currentUser?.name && !initialData && !formData.analistaRef) {
      const userName = currentUser.name.trim().toLowerCase();
      const matchedAnalista = ANALISTAS.find(
        name => name.trim().toLowerCase().includes(userName) || 
                userName.includes(name.trim().toLowerCase())
      );
      if (matchedAnalista) {
        setFormData(prev => ({ 
          ...prev, 
          analistaRef: matchedAnalista,
          analista: matchedAnalista
        }));
      } else {
        setFormData(prev => ({ 
          ...prev, 
          analistaRef: currentUser.name,
          analista: currentUser.name
        }));
      }
    }
  }, [currentUser, initialData, formData.analistaRef]);

  const [isSaving, setIsSaving] = useState(false);

  const formatGMS = (value: string, isLat: boolean) => {
    const numeric = value.replace(/\D/g, '');
    let formatted = numeric;
    
    if (numeric.length > 0) {
      const g = numeric.substring(0, 2);
      const m = numeric.substring(2, 4);
      const s = numeric.substring(4, 6);
      const d = numeric.substring(6, 8);
      
      formatted = g;
      if (numeric.length > 2) formatted += `°${m}`;
      if (numeric.length > 4) formatted += `'${s}`;
      if (numeric.length > 6) formatted += `,${d}`;
      
      if (numeric.length >= 8) {
        formatted += `¨${isLat ? 'S' : 'O'}`;
      }
    }
    return formatted;
  };

  const toggleBlock = (block: string) => {
    setExpandedBlocks(prev => ({ ...prev, [block]: !prev[block] }));
  };

  const addExtraDoc = (group: keyof RejectionData) => {
    const newItem: DocItem = {
      id: crypto.randomUUID(),
      label: 'OUTRO',
      checked: true,
      pageNumber: '',
      extraInput: ''
    };
    setFormData(prev => ({
      ...prev,
      [group]: [...(prev[group] as DocItem[]), newItem]
    }));
  };

  const removeDoc = (group: keyof RejectionData, id: string) => {
    setFormData(prev => ({
      ...prev,
      [group]: (prev[group] as DocItem[]).filter(item => item.id !== id)
    }));
  };

  const handleDocChange = (group: keyof RejectionData, id: string, field: keyof DocItem, value: any) => {
    const list = formData[group] as DocItem[];
    const newList = list.map(item => item.id === id ? { ...item, [field]: value } : item);
    setFormData(prev => ({ ...prev, [group]: newList }));
  };

  const addRT = () => {
    const newRT: RTRejectionEntry = {
      id: crypto.randomUUID(),
      nome: RT_LIST[0],
      arts: [{
        numero: '',
        atividades: [],
        folha: ''
      }]
    };
    setFormData(prev => ({
      ...prev,
      responsaveisTecnicos: [...prev.responsaveisTecnicos, newRT]
    }));
  };

  const updateRT = (rtId: string, field: keyof RTRejectionEntry, value: any) => {
    setFormData(prev => ({
      ...prev,
      responsaveisTecnicos: prev.responsaveisTecnicos.map(rt => 
        rt.id === rtId ? { ...rt, [field]: value } : rt
      )
    }));
  };

  const removeRT = (rtId: string) => {
    setFormData(prev => ({
      ...prev,
      responsaveisTecnicos: prev.responsaveisTecnicos.filter(rt => rt.id !== rtId)
    }));
  };

  const addART = (rtId: string) => {
    setFormData(prev => ({
      ...prev,
      responsaveisTecnicos: prev.responsaveisTecnicos.map(rt => 
        rt.id === rtId ? {
          ...rt,
          arts: [...rt.arts, { numero: '', atividades: [], folha: '' }]
        } : rt
      )
    }));
  };

  const updateART = (rtId: string, artIndex: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      responsaveisTecnicos: prev.responsaveisTecnicos.map(rt => 
        rt.id === rtId ? {
          ...rt,
          arts: rt.arts.map((art, idx) => idx === artIndex ? { ...art, [field]: value } : art)
        } : rt
      )
    }));
  };

  const removeART = (rtId: string, artIndex: number) => {
    setFormData(prev => ({
      ...prev,
      responsaveisTecnicos: prev.responsaveisTecnicos.map(rt => 
        rt.id === rtId ? {
          ...rt,
          arts: rt.arts.filter((_, idx) => idx !== artIndex)
        } : rt
      )
    }));
  };

  const handleSave = async (isFinal: boolean = false) => {
    if (isFinal) {
      if (!formData.protocolo || !formData.numProcesso || !formData.nomeEmpreendedor) {
        toast.error('Preencha os campos obrigatórios (Protocolo, Processo e Empreendedor) para concluir.');
        return;
      }
    }

    setIsSaving(true);
    try {
      const status = isFinal ? 'Concluído' : 'Rascunho';

      const payload = {
        user_id: currentUser?.id ?? null,
        protocolo: formData.protocolo,
        num_processo: formData.numProcesso,
        analista: formData.analistaRef === 'OUTRO' ? formData.analistaRefOutro : formData.analistaRef,
        analista_ref: formData.analistaRef,
        analista_ref_outro: formData.analistaRefOutro || null,
        nome_empreendedor: formData.nomeEmpreendedor,
        cpf_cnpj: formData.cpfCnpj,
        endereco_empreendimento: formData.enderecoEmpreendimento,
        nome_fazenda: formData.nomeFazenda,
        num_car: formData.numCar,
        municipio: formData.municipioEmpreendimento,
        lat_eixo: formData.latEixo,
        long_eixo: formData.longEixo,
        situacao: formData.situacao,
        situacao_outro: formData.situacaoOutro || null,
        situacao_empreendimento: formData.situacaoEmpreendimento,
        situacao_empreendimento_outro: formData.situacaoEmpreendimentoOutro || null,
        finalidade_barramento: formData.finalidadeBarramento,
        finalidade_barramento_outro: formData.finalidadeBarramentoOutro || null,
        num_oficio_emitido: formData.numOficioEmitido,
        data_oficio_emitido: formData.dataOficioEmitido || null,
        via_encaminhamento: formData.viaEncaminhamento,
        via_encaminhamento_outro: formData.viaEncaminhamentoOutro || null,
        endereco_encaminhamento: formData.enderecoEncaminhamento,
        data_recebimento_oficio: formData.dataRecebimentoOficio || null,
        prazo_concedido: formData.prazoConcedido || 0,
        recebido_por_nome: formData.recebidoPorNome,
        sistema_situacao: formData.sistemaSituacao,
        sistema_observacoes: formData.sistemaObservacoes,
        docs_gerais: formData.docsGerais,
        docs_ident: formData.docsIdentificacao,
        docs_espolio: formData.docsEspolio,
        docs_tecnicos: formData.docsTecnicos,
        responsaveis: formData.responsaveisTecnicos,
        status,
        tipo_documento: formData.tipo_documento
      };

      let queryResult;
      if (formData.id) {
        queryResult = await supabase
          .from('indeferimentos')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', formData.id)
          .select();
      } else {
        queryResult = await supabase
          .from('indeferimentos')
          .insert(payload)
          .select();
      }

      if (queryResult.error) throw queryResult.error;

      const savedItem = queryResult.data?.[0];
      if (savedItem?.id && !formData.id) {
        setFormData(prev => ({ ...prev, id: savedItem.id }));
      }

      await refreshData();
      
      if (isFinal) {
        toast.success('Parecer técnico finalizado com sucesso!');
        onSave();
      } else {
        toast.success('Rascunho salvo com sucesso!');
      }
    } catch (error) {
      console.error('Error saving rejection:', error);
      toast.error('Erro ao salvar indeferimento. Verifique sua conexão.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = () => {
    if (window.confirm('Tem certeza que deseja limpar todo o formulário?')) {
      setFormData({
        protocolo: '',
        analista: currentUser?.name || '',
        dataProtocolo: '',
        situacao: 'Planejamento',
        situacaoOutro: '',
        docsGerais: DOCS_GERAIS.map(label => ({ id: crypto.randomUUID(), label, checked: false, pageNumber: '' })),
        docsIdentificacao: DOCS_IDENTIFICACAO.map(label => ({ id: crypto.randomUUID(), label, checked: false, pageNumber: '', extraInput: '' })),
        espolio: false,
        docsEspolio: DOCS_ESPOLIO.map(label => ({ id: crypto.randomUUID(), label, checked: false, pageNumber: '', extraInput: '' })),
        responsaveisTecnicos: [],
        docsTecnicos: DOCS_TECNICOS.map(label => ({ id: crypto.randomUUID(), label, checked: false, pageNumber: '', extraInput: '' })),
        numProcesso: '',
        analistaRef: ANALISTAS[0],
        analistaRefOutro: '',
        nomeEmpreendedor: '',
        cpfCnpj: '',
        enderecoEmpreendimento: '',
        nomeFazenda: '',
        numCar: '',
        municipioEmpreendimento: MUNICIPIOS[0],
        latEixo: '',
        longEixo: '',
        finalidadeBarramento: FINALIDADES[0],
        finalidadeBarramentoOutro: '',
        situacaoEmpreendimento: SITUACOES_EP[0],
        situacaoEmpreendimentoOutro: '',
        numOficioEmitido: '',
        dataOficioEmitido: '',
        viaEncaminhamento: [],
        viaEncaminhamentoOutro: '',
        enderecoEncaminhamento: '',
        dataRecebimentoOficio: '',
        prazoConcedido: 0,
        recebidoPorNome: '',
        sistemaSituacao: 'Parecer Técnico emitido',
        sistemaObservacoes: 'Processo indeferido por inércia',
        sistemaEmpreendedor: '',
        status: 'Rascunho',
        tipo_documento: 'Indeferimento'
      });
    }
  };

  const handleDelete = async () => {
    if (!formData.id) return;
    if (window.confirm('Tem certeza que deseja excluir permanentemente este documento?')) {
      try {
        const { error } = await supabase.from('indeferimentos').delete().eq('id', formData.id);
        if (error) throw error;
        await refreshData();
        onCancel();
      } catch (err) {
        console.error('Error deleting:', err);
        alert('Erro ao excluir o documento.');
      }
    }
  };

  const exportToDocx = async () => {
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: "GOVERNO DO ESTADO DE MATO GROSSO", bold: true, size: 22 }),
              new TextRun({ text: "\nSECRETARIA DE ESTADO DE MEIO AMBIENTE", bold: true, size: 22, break: 1 }),
              new TextRun({ text: "\nSECRETARIA ADJUNTA DE LICENCIAMENTO AMBIENTAL E RECURSOS HÍDRICOS", bold: true, size: 20, break: 1 }),
              new TextRun({ text: "\nSUPERINTENDÊNCIA DE RECURSOS HÍDRICOS", bold: true, size: 20, break: 1 }),
              new TextRun({ text: "\nCOORDENADORIA DE SEGURANÇA DE BARRAGENS", bold: true, size: 20, break: 1 }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 400, after: 400 },
            border: {
              top: { color: "auto", space: 1, style: BorderStyle.SINGLE, size: 6 },
              bottom: { color: "auto", space: 1, style: BorderStyle.SINGLE, size: 6 },
            },
            children: [
              new TextRun({ text: "PARECER TÉCNICO DE INDEFERIMENTO POR INÉRCIA - CBS/SURH/SEMA-MT", bold: true, size: 26 }),
            ],
          }),
          new Paragraph({
            spacing: { before: 200, after: 400 },
            children: [
              new TextRun({ text: "Assunto: ", bold: true, size: 24 }),
              new TextRun({ text: "Análise referente ao pedido de classificação da segurança de barragem", size: 24 }),
            ],
          }),
          new Paragraph({ text: "1. PROJETO PROPOSTO", heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 } }),
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            children: [
              new TextRun({ text: `Trata-se da análise do requerimento de classificação de barragem cuja razão social ${formData.nomeEmpreendedor || '...'} protocolado nesta secretaria sob o processo ${formData.numProcesso || '...'}. A barragem está localizada na ${formData.nomeFazenda || '...'} no município de ${formData.municipioEmpreendimento || '...'}/ MT.`, size: 24 }),
            ],
          }),
          new Paragraph({ text: "2. HISTÓRICO", heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 } }),
          new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun({ text: `Foi requerido em ${formData.dataProtocolo ? new Date(formData.dataProtocolo).toLocaleDateString('pt-BR') : '...'} a classificação de barragem sob o processo ${formData.numProcesso || '...'} onde apresentou documentos referentes ao barramento.`, size: 24 })] }),
          new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun({ text: `Em ${formData.dataOficioEmitido ? new Date(formData.dataOficioEmitido).toLocaleDateString('pt-BR') : '...'} foi emitido o Oficio nº ${formData.numOficioEmitido || '...'}/GSB/SEMA, por meio do qual foram elencadas pendencias a serem apresentadas para a continuidade da análise do processo, sendo encaminhado via ${formData.viaEncaminhamento.join(', ')} para ${formData.recebidoPorNome || '...'}, tendo a confirmação do recebimento em ${formData.dataRecebimentoOficio ? new Date(formData.dataRecebimentoOficio).toLocaleDateString('pt-BR') : '...'}.`, size: 24 })] }),
          new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun({ text: `Visto que o prazo para o cumprimento integral das pendencias encerrou-se em ${formData.dataRecebimentoOficio && formData.prazoConcedido ? (() => { let d = new Date(formData.dataRecebimentoOficio); d.setDate(d.getDate() + formData.prazoConcedido); return d.toLocaleDateString('pt-BR'); })() : '...'} e, até a presente data, não houve manifestação por parte do interessado, o processo será INDEFERIDO por inércia.`, size: 24 })] }),
          new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun({ text: "Após análise foi constatado que não houve atendimento da Instrução Normativa nº 08/2023, como também ao Termo de Referência n° 17/SURH/SEMA-MT.", size: 24 })] }),
          new Paragraph({ text: "3. ANÁLISE", heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 } }),
          new Paragraph({ children: [new TextRun({ text: "Localização Georeferenciada:", bold: true, size: 24 })] }),
          new Paragraph({ children: [new TextRun({ text: `A barragem está localizada na ${formData.enderecoEmpreendimento || '...'}, município ${formData.municipioEmpreendimento || '...'}/ MT, sob as coordenadas geográficas: LAT:${formData.latEixo || '...'} e LONG:${formData.longEixo || '...'}.`, size: 24 })] }),
          new Paragraph({ text: "4. CONFERÊNCIA DOCUMENTAL", heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 } }),
          new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun({ text: "Os documentos apresentados pela interessada foram conferidos quanto a sua forma e atendimento ao roteiro orientativa, não consistindo em atribuição do órgão ambiental atestar a veracidade destes, sendo responsabilidade da requerente e do responsável técnico a autenticidade dos mesmos.", size: 24 })] }),
          new Paragraph({ children: [new TextRun({ text: "Consta nos autos:", bold: true, size: 24 })] }),
          ...[...formData.docsGerais, ...formData.docsIdentificacao, ...formData.docsEspolio, ...formData.docsTecnicos]
            .filter(d => d.checked)
            .map(d => new Paragraph({ 
              bullet: { level: 0 }, 
              children: [new TextRun({ 
                text: `${d.label === 'OUTRO' ? (d.extraInput || 'Outro') : d.label}${d.pageNumber ? ` (Fls. ${d.pageNumber})` : ''}`, 
                size: 20 
              })] 
            })),
          new Paragraph({ text: "5. ANÁLISE TÉCNICA", heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 } }),
          new Paragraph({ children: [new TextRun({ text: "As pendências não foram apresentadas no prazo estabelecido, cabendo o indeferimento por inércia do interessado", size: 24 })] }),
          new Paragraph({ text: "6. CONCLUSÃO", heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 } }),
          new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun({ text: `Considerando as informações fornecidas pelo responsável técnico da classificação da barragem, ${formData.responsaveisTecnicos.map(rt => rt.nome === 'OUTRO' ? rt.nomeOutro : rt.nome).join(', ')}, acompanhado pelo ART CREA/MT ${formData.responsaveisTecnicos.map(rt => rt.arts.map(a => a.numero).join(', ')).join('; ')}, bem como por toda documentação trazida aos autos, sendo essas de sua inteira responsabilidade;`, size: 24 })] }),
          new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun({ text: `Considerando o acima exposto sugerimos o INDEFERIMENTO do requerimento de classificação da barragem localizada na ${formData.nomeFazenda || '...'}, no município ${formData.municipioEmpreendimento || '...'}/ MT solicitado por ${formData.nomeEmpreendedor || '...'}, por entender que os documentos apresentados não contemplaram todas as informações/documentações relevantes para a conclusão da análise, estando assim, em desconformidade com as legislações vigentes e com as solicitações deste órgão.`, size: 24 })] }),
          new Paragraph({ children: [new TextRun({ size: 24, text: "Informamos que o arquivamento do processo não impedirá a apresentação de novo requerimento, que deverá obedecer ao Termo de Referência nº 17/SURH/SEMA-MT e a Instrução Normativa 08/2023 disponibilizado no sítio eletrônico da SEMA, mediante o pagamento de custo de análise, conforme regulamenta as normas vigentes." })] }),
          new Paragraph({ children: [new TextRun({ size: 24, text: "Ressalvamos, porém, que o presente Parecer não exime os responsáveis, em qualquer época, dos exames e eventuais exigências que venham a ser feitas pela SEMA/MT, onde a operação da barragem sem a devida outorga de obra hidráulica ou cadastro da mesma está sujeita a pena das aplicações das medidas legais cabíveis." })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1000 }, children: [new TextRun({ text: "_______________________________________", size: 24 })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: (formData.analistaRef === 'OUTRO' ? formData.analistaRefOutro : formData.analistaRef) || 'Analista Responsável', bold: true, size: 22 })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Analista de Meio Ambiente", size: 18 })] }),
        ],
      }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `Parecer_Indeferimento_${formData.numProcesso || 'Documento'}.docx`);
    await logActivity('DOWNLOAD_DOCUMENT', { type: 'Indeferimento', doc: formData.numProcesso, interessado: formData.empreendedor });
  };

  const renderDocGroup = (group: keyof RejectionData, title: string, blockKey: string, extraPlaceholder?: string) => {
    const list = formData[group] as DocItem[];
    const isExpanded = expandedBlocks[blockKey];

    return (
      <div className="border border-slate-200 rounded-lg overflow-hidden mb-4">
        <button 
          onClick={() => toggleBlock(blockKey)}
          className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-indigo-600" />
            <h3 className="font-bold text-slate-700">{title}</h3>
          </div>
          {isExpanded ? <ChevronUp /> : <ChevronDown />}
        </button>
        
        <AnimatePresence>
          {isExpanded && (
            <motion.div 
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              exit={{ height: 0 }}
              className="p-4 bg-white border-t border-slate-200 space-y-4"
            >
              {list.map((item) => (
                <div key={item.id} className="space-y-2 pb-3 border-b border-slate-100 last:border-0">
                  <div className="flex items-start gap-3">
                    <input 
                      type="checkbox"
                      checked={item.checked}
                      onChange={(e) => handleDocChange(group, item.id, 'checked', e.target.checked)}
                      className="mt-1 w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <label className="text-sm text-slate-700 font-medium">{item.label}</label>
                        {item.label === 'OUTRO' && (
                          <div className="flex gap-2">
                             {item.checked && (
                              <button
                                onClick={() => addExtraDoc(group)}
                                className="p-1 text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
                                title="Adicionar outro"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            )}
                            {/* Allow removal if it's an extra one (not the first one if we can identify it, or just allow any except the very first one) */}
                            {list.filter(d => d.label === 'OUTRO').length > 1 && item.id !== list.find(d => d.label === 'OUTRO')?.id && (
                              <button
                                onClick={() => removeDoc(group, item.id)}
                                className="p-1 text-red-600 hover:bg-red-50 rounded-full transition-colors"
                                title="Remover"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      
                      {item.checked && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                          <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                              {item.label === 'OUTRO' ? 'Descrição Manual' : (extraPlaceholder || 'Informação Adicional')}
                            </label>
                            <input 
                              type="text"
                              value={item.extraInput || ''}
                              onChange={(e) => handleDocChange(group, item.id, 'extraInput', e.target.value)}
                              className="w-full p-2 text-sm border border-slate-300 rounded focus:border-indigo-500 outline-none"
                              placeholder={item.label === 'OUTRO' ? 'Digite aqui...' : 'Opcional...'}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Folha (n°)</label>
                            <input 
                              type="number"
                              value={item.pageNumber || ''}
                              onChange={(e) => handleDocChange(group, item.id, 'pageNumber', e.target.value)}
                              className="w-full p-2 text-sm border border-slate-300 rounded focus:border-indigo-500 outline-none"
                              placeholder="Ex: 172"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const handleMapLocationSelect = (lat: number, lng: number) => {
    const latGMS = formatDecimalToGMS(lat, true);
    const lngGMS = formatDecimalToGMS(lng, false);
    setFormData(prev => ({
      ...prev,
      latEixo: latGMS,
      longEixo: lngGMS
    }));
  };

  const formatDecimalToGMS = (val: number, isLat: boolean): string => {
    const absolute = Math.abs(val);
    const degrees = Math.floor(absolute);
    const minutesNotTruncated = (absolute - degrees) * 60;
    const minutes = Math.floor(minutesNotTruncated);
    const secondsNotTruncated = (minutesNotTruncated - minutes) * 60;
    const seconds = Math.floor(secondsNotTruncated);
    const hundredths = Math.round((secondsNotTruncated - seconds) * 100);
    
    const d = degrees.toString().padStart(2, '0');
    const m = minutes.toString().padStart(2, '0');
    const s = seconds.toString().padStart(2, '0');
    const h = hundredths.toString().padStart(2, '0');
    
    return `${d}°${m}'${s},${h}"¨${isLat ? 'S' : 'O'}`;
  };

  const parseGMSToDecimal = (gms: string): number => {
    if (!gms) return NaN;
    const regex = /(\d+)°(\d+)'(\d+),(\d+)"/;
    const match = gms.match(regex);
    
    if (!match) {
      const val = parseFloat(gms.replace(',', '.'));
      if (isNaN(val)) return NaN;
      return val > 0 ? -val : val;
    }
    
    const degrees = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    const seconds = parseFloat(match[3] + '.' + match[4]);
    const decimal = degrees + (minutes / 60) + (seconds / 3600);
    return -decimal;
  };

  const MapPicker: React.FC = () => {
    const mapRef = useRef<HTMLDivElement>(null);
    const leafletMap = useRef<L.Map | null>(null);
    const markerRef = useRef<L.Marker | null>(null);

    useEffect(() => {
      if (!mapRef.current) return;
      if (!leafletMap.current) {
        leafletMap.current = L.map(mapRef.current).setView([-12.9, -56.0], 6);
        
        const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors'
        });

        const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
          attribution: 'Tiles &copy; Esri &mdash; Source: Esri'
        });

        satellite.addTo(leafletMap.current);
        
        L.control.layers({
          "Satélite": satellite,
          "Mapa": osm
        }, {}, { position: 'topright' }).addTo(leafletMap.current);

        leafletMap.current.on('click', (e: L.LeafletMouseEvent) => {
          handleMapLocationSelect(e.latlng.lat, e.latlng.lng);
        });

        const resizeObserver = new ResizeObserver(() => {
          leafletMap.current?.invalidateSize();
        });
        resizeObserver.observe(mapRef.current);
        return () => resizeObserver.disconnect();
      }
    }, []);

    useEffect(() => {
      if (!leafletMap.current) return;
      const lat = parseGMSToDecimal(formData.latEixo);
      const lng = parseGMSToDecimal(formData.longEixo);

      if (!isNaN(lat) && !isNaN(lng)) {
        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
        } else {
          markerRef.current = L.marker([lat, lng], { draggable: true }).addTo(leafletMap.current);
          markerRef.current.on('dragend', (e) => {
            const m = e.target;
            const { lat, lng } = m.getLatLng();
            handleMapLocationSelect(lat, lng);
          });
        }
        leafletMap.current.setView([lat, lng], leafletMap.current.getZoom() < 10 ? 15 : leafletMap.current.getZoom());
      } else if (markerRef.current) {
        leafletMap.current.removeLayer(markerRef.current);
        markerRef.current = null;
      }
    }, [formData.latEixo, formData.longEixo]);

    return (
      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
            Localização no Mapa
            <span className="text-[8px] font-medium normal-case text-slate-400">(Clique no mapa ou arraste o marcador)</span>
          </label>
        </div>
        <div ref={mapRef} className="w-full h-72 rounded-xl border border-slate-200 overflow-hidden shadow-inner z-0" />
      </div>
    );
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col h-full max-h-[90vh]">
      {/* Header */}
      <div className="bg-indigo-900 p-6 text-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/10 rounded-lg">
            <FileText className="w-6 h-6 text-indigo-300" />
          </div>
          <div>
            <h2 className="text-xl font-black">Indeferimento de Segurança de Barragens</h2>
            <p className="text-xs text-indigo-200 uppercase font-bold tracking-widest mt-1">
              Parecer Técnico de Indeferimento por Inércia
            </p>
          </div>
        </div>
        <button onClick={onCancel} className="p-2 hover:bg-white/10 rounded-full transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
      </div>

      {/* Actions Toolbar */}
      <div className="bg-slate-100 border-b border-slate-200 px-6 py-2 flex items-center justify-between shrink-0 overflow-x-auto gap-4">
        <div className="flex gap-2">
          <button 
            onClick={handleClear}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-[10px] font-black uppercase text-slate-600 hover:bg-slate-50 transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Limpar
          </button>
          <button 
            onClick={() => handleSave(false)}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-[10px] font-black uppercase text-slate-600 hover:bg-slate-50 transition-all"
          >
            <Save className="w-3.5 h-3.5" /> Salvar Rascunho
          </button>
          <button 
            onClick={() => handleSave(true)}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-[10px] font-black uppercase hover:bg-green-700 transition-all"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Concluir
          </button>
        </div>
        
        <div className="flex gap-2">
          {formData.id && (
            <button 
              onClick={handleDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 border border-red-100 rounded-lg text-[10px] font-black uppercase hover:bg-red-100 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" /> Excluir
            </button>
          )}
          <button 
            onClick={exportToDocx}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-white rounded-lg text-[10px] font-black uppercase hover:bg-slate-900 transition-all"
          >
            <FileDown className="w-3.5 h-3.5" /> Exportar Docx
          </button>
        </div>
      </div>

      {/* Floating Navigation Menu */}
      <div className="fixed right-8 top-1/2 -translate-y-1/2 z-50 hidden xl:flex flex-col gap-2 p-3 bg-white/80 backdrop-blur border border-slate-200 rounded-2xl shadow-2xl">
        {[
          { id: 1, label: 'Intro', icon: <Calendar size={14} /> },
          { id: 2, label: 'Pedido', icon: <FileText size={14} /> },
          { id: 3, label: 'Sistema', icon: <Wrench size={14} /> },
          { id: 4, label: 'Exportar', icon: <FileDown size={14} /> }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => scrollToSection(tab.id)}
            title={tab.label}
            className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${
              activeTab === tab.id 
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' 
                : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
            }`}
          >
            {tab.icon}
          </button>
        ))}
      </div>

      {/* Content */}
      <div 
        className="flex-1 overflow-y-auto p-6 bg-slate-50/30 space-y-12 pb-24 scroll-smooth"
        onScroll={(e) => {
          const container = e.currentTarget;
          const scrollPos = container.scrollTop + 100;
          
          if (sectionsRef[4].current && scrollPos >= sectionsRef[4].current.offsetTop) setActiveTab(4);
          else if (sectionsRef[3].current && scrollPos >= sectionsRef[3].current.offsetTop) setActiveTab(3);
          else if (sectionsRef[2].current && scrollPos >= sectionsRef[2].current.offsetTop) setActiveTab(2);
          else setActiveTab(1);
        }}
      >
        {/* Section 1 */}
        <section ref={sectionsRef[1]} id="section-1" className="scroll-mt-6">
          <div className="max-w-4xl mx-auto">
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm mb-6">
              <button 
                onClick={() => toggleSection(1)}
                className="w-full flex items-center justify-between p-4 bg-indigo-50/50 hover:bg-indigo-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-xs">1</div>
                  <h3 className="font-black text-slate-800 uppercase text-xs tracking-widest">INTRODUÇÃO E DOCUMENTAÇÃO</h3>
                </div>
                {expandedSections[1] ? <ChevronUp className="text-indigo-600" /> : <ChevronDown className="text-indigo-600" />}
              </button>

              <AnimatePresence>
                {expandedSections[1] && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="p-6 space-y-6"
                  >
                    {/* Informações Iniciais */}
                    <div className="bg-white p-6 rounded-xl border border-slate-100 bg-slate-50/30">
                        <div className="flex items-center gap-2 mb-6 pb-2 border-b border-slate-100">
                          <Calendar className="w-5 h-5 text-indigo-600" />
                          <h3 className="font-black text-slate-800 uppercase text-xs tracking-widest">Informações Básicas</h3>
                        </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5">Processo / Protocolo</label>
                    <input 
                      type="text"
                      value={formData.protocolo}
                      onChange={(e) => setFormData(p => ({ ...p, protocolo: e.target.value }))}
                      className="w-full flex-1 h-10 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      placeholder="Ex: 12345/2024"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5">Data do protocolo</label>
                    <div className="relative">
                      <input 
                        type="date"
                        value={formData.dataProtocolo}
                        onChange={(e) => setFormData(p => ({ ...p, dataProtocolo: e.target.value }))}
                        className="w-full h-10 px-3 pl-10 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      />
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5">Situação</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <select 
                        value={formData.situacao}
                        onChange={(e) => setFormData(p => ({ ...p, situacao: e.target.value }))}
                        className="w-full h-10 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        {SITUACOES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      {formData.situacao === 'OUTRO' && (
                        <input 
                          type="text"
                          placeholder="Especifique a situação..."
                          value={formData.situacaoOutro}
                          onChange={(e) => setFormData(p => ({ ...p, situacaoOutro: e.target.value }))}
                          className="w-full h-10 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Documentação */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2 p-2 bg-indigo-50 rounded-lg border border-indigo-100">
                  <FileCheck className="w-5 h-5 text-indigo-700" />
                  <h3 className="font-black text-indigo-900 uppercase text-xs tracking-widest">Documentação Apresentada</h3>
                </div>

                {renderDocGroup('docsGerais', 'Documentos Gerais', 'docsGerais')}
                
                {renderDocGroup('docsIdentificacao', 'Identificação do Responsável Técnico / Interessado', 'docsIdent', 'Nome')}

                {/* Bloco Espólio */}
                <div className="border border-slate-200 rounded-lg overflow-hidden mb-4">
                  <button 
                    onClick={() => toggleBlock('espolio')}
                    className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <User className="w-5 h-5 text-amber-600" />
                      <h3 className="font-bold text-slate-700">Solicitante falecido - Espólio</h3>
                    </div>
                    {expandedBlocks.espolio ? <ChevronUp /> : <ChevronDown />}
                  </button>
                  
                  <AnimatePresence>
                    {expandedBlocks.espolio && (
                      <motion.div 
                        initial={{ height: 0 }}
                        animate={{ height: 'auto' }}
                        exit={{ height: 0 }}
                        className="p-4 bg-white border-t border-slate-200 space-y-4"
                      >
                        <div className="flex items-center gap-2 mb-4 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                          <input 
                            type="checkbox"
                            id="espolio-active"
                            checked={formData.espolio}
                            onChange={(e) => setFormData(p => ({ ...p, espolio: e.target.checked }))}
                            className="w-5 h-5 text-amber-600 rounded"
                          />
                          <label htmlFor="espolio-active" className="text-sm font-bold text-amber-900">
                            Ativar informações de Espólio
                          </label>
                        </div>

                        {formData.espolio && formData.docsEspolio.map((item) => (
                          <div key={item.id} className="space-y-2 pb-3 border-b border-slate-100 last:border-0 pl-6">
                            <div className="flex items-start gap-3">
                              <input 
                                type="checkbox"
                                checked={item.checked}
                                onChange={(e) => handleDocChange('docsEspolio', item.id, 'checked', e.target.checked)}
                                className="mt-1 w-4 h-4 text-indigo-600 rounded"
                              />
                              <div className="flex-1">
                                <label className="text-sm text-slate-700 font-medium">{item.label}</label>
                                {item.checked && (
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                                    <div>
                                      <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Nome(s)</label>
                                      <input 
                                        type="text"
                                        value={item.extraInput || ''}
                                        onChange={(e) => handleDocChange('docsEspolio', item.id, 'extraInput', e.target.value)}
                                        className="w-full p-2 text-sm border border-slate-300 rounded bg-slate-50"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Folha</label>
                                      <input 
                                        type="number"
                                        value={item.pageNumber || ''}
                                        onChange={(e) => handleDocChange('docsEspolio', item.id, 'pageNumber', e.target.value)}
                                        className="w-full p-2 text-sm border border-slate-300 rounded bg-slate-50"
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Responsáveis Técnicos e ARTs */}
                <div className="border border-slate-200 rounded-lg overflow-hidden mb-4">
                  <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wrench className="w-5 h-5 text-indigo-600" />
                      <h3 className="font-bold text-slate-700">Atividades técnicas das ART do Responsável Técnico</h3>
                    </div>
                    <button 
                      onClick={addRT}
                      className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-[10px] font-black uppercase rounded-lg hover:bg-indigo-700"
                    >
                      <Plus className="w-3 h-3" /> Adicionar RT
                    </button>
                  </div>
                  
                  <div className="p-4 bg-white space-y-6">
                    {formData.responsaveisTecnicos.map((rt) => (
                      <div key={rt.id} className="p-4 border-2 border-indigo-50 rounded-xl relative bg-slate-50/30">
                        <button 
                          onClick={() => removeRT(rt.id)}
                          className="absolute top-2 right-2 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          <div>
                            <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Responsável Técnico</label>
                            <div className="space-y-2">
                              <select 
                                value={rt.nome}
                                onChange={(e) => updateRT(rt.id, 'nome', e.target.value)}
                                className="w-full p-2 text-sm border border-slate-300 rounded-lg bg-white"
                              >
                                {RT_LIST.map(name => <option key={name} value={name}>{name}</option>)}
                              </select>
                              {rt.nome === 'OUTRO' && (
                                <input 
                                  type="text"
                                  placeholder="Nome do responsável técnico..."
                                  value={rt.nomeOutro || ''}
                                  onChange={(e) => updateRT(rt.id, 'nomeOutro', e.target.value)}
                                  className="w-full p-2 text-sm border border-slate-300 rounded-lg bg-white"
                                />
                              )}
                            </div>
                          </div>
                          <div className="flex items-end">
                            <button 
                              onClick={() => addART(rt.id)}
                              className="w-full flex items-center justify-center gap-2 p-2 bg-slate-200 text-slate-700 text-[10px] font-black uppercase rounded-lg hover:bg-slate-300"
                            >
                              <Plus className="w-4 h-4" /> Nova ART para este RT
                            </button>
                          </div>
                        </div>

                        <div className="space-y-4">
                          {rt.arts.map((art, artIdx) => (
                            <div key={artIdx} className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm space-y-3">
                              <div className="flex items-center justify-between">
                                <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">ART #{artIdx + 1}</h4>
                                {rt.arts.length > 1 && (
                                  <button onClick={() => removeART(rt.id, artIdx)} className="text-red-400 hover:text-red-600">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label className="text-[10px] font-bold text-slate-500 block">N° da ART</label>
                                  <input 
                                    type="text"
                                    value={art.numero}
                                    onChange={(e) => updateART(rt.id, artIdx, 'numero', e.target.value.replace(/\D/g, ''))}
                                    placeholder="Ex: 123456"
                                    className="w-full p-2 text-sm border border-slate-300 rounded"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-bold text-slate-500 block">Folha</label>
                                  <input 
                                    type="number"
                                    value={art.folha}
                                    onChange={(e) => updateART(rt.id, artIdx, 'folha', e.target.value)}
                                    placeholder="Ex: 123"
                                    className="w-full p-2 text-sm border border-slate-300 rounded"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="text-[10px] font-bold text-slate-500 block mb-2">Atividades Técnicas (Múltipla Escolha)</label>
                                <div className="grid grid-cols-2 gap-2">
                                  {ATIVIDADES_ART.map(ativ => (
                                    <label key={ativ} className="flex items-center gap-2 text-xs text-slate-600 p-2 border border-slate-100 rounded hover:bg-slate-50 cursor-pointer">
                                      <input 
                                        type="checkbox"
                                        checked={art.atividades.includes(ativ)}
                                        onChange={(e) => {
                                          const newAtivs = e.target.checked 
                                            ? [...art.atividades, ativ]
                                            : art.atividades.filter(a => a !== ativ);
                                          updateART(rt.id, artIdx, 'atividades', newAtivs);
                                        }}
                                        className="rounded text-indigo-600"
                                      />
                                      {ativ}
                                    </label>
                                  ))}
                                </div>
                                {art.atividades.includes('OUTRO') && (
                                  <input 
                                    type="text"
                                    placeholder="Especifique a atividade..."
                                    value={art.atividadesOutro || ''}
                                    onChange={(e) => updateART(rt.id, artIdx, 'atividadesOutro', e.target.value)}
                                    className="w-full mt-2 p-2 text-sm border border-slate-300 rounded"
                                  />
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    {formData.responsaveisTecnicos.length === 0 && (
                      <div className="text-center py-8 text-slate-400 italic text-sm">
                        Nenhum responsável técnico adicionado.
                      </div>
                    )}
                  </div>
                </div>

                {renderDocGroup('docsTecnicos', 'Documentos Técnicos', 'docsTec', 'Elaborador/Descrição')}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  </section>

        {/* Section 2 */}
        <section ref={sectionsRef[2]} id="section-2" className="scroll-mt-6">
          <div className="max-w-4xl mx-auto">
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm mb-6">
              <button 
                onClick={() => toggleSection(2)}
                className="w-full flex items-center justify-between p-4 bg-indigo-50/50 hover:bg-indigo-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-xs">2</div>
                  <h3 className="font-black text-slate-800 uppercase text-xs tracking-widest">Informações do Pedido</h3>
                </div>
                {expandedSections[2] ? <ChevronUp className="text-indigo-600" /> : <ChevronDown className="text-indigo-600" />}
              </button>

              <AnimatePresence>
                {expandedSections[2] && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="p-6 space-y-6"
                  >
                    <div className="bg-white p-6 rounded-xl border border-slate-100 bg-slate-50/30">
                        <div className="flex items-center gap-2 mb-6 pb-2 border-b border-slate-100">
                          <FileText className="w-5 h-5 text-indigo-600" />
                          <h3 className="font-black text-slate-800 uppercase text-xs tracking-widest">Informações do Pedido</h3>
                        </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5">Processo</label>
                    <input 
                      type="text"
                      className="w-full flex-1 h-10 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      placeholder="Ex: SEMA-PRO-12345/2026"
                      value={formData.numProcesso}
                      onChange={(e) => setFormData(p => ({ ...p, numProcesso: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5">Analista</label>
                    <div className="space-y-2">
                      <select 
                        className="w-full h-10 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={formData.analistaRef}
                        onChange={(e) => setFormData(p => ({ ...p, analistaRef: e.target.value }))}
                      >
                        {ANALISTAS.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                      {formData.analistaRef === 'OUTRO' && (
                        <input 
                          type="text"
                          className="w-full h-10 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                          placeholder="Inserção manual (suprimirá a palavra outro)"
                          value={formData.analistaRefOutro}
                          onChange={(e) => setFormData(p => ({ ...p, analistaRefOutro: e.target.value }))}
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* Sub-bloco: Informações do empreendedor e empreendimento */}
                <div className="mt-8 p-6 bg-slate-50/50 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-2 mb-6">
                    <User className="w-4 h-4 text-slate-400" />
                    <h4 className="font-bold text-slate-700 text-sm">Informações do empreendedor e empreendimento</h4>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5">Identificação do empreendedor</label>
                      <input 
                        type="text"
                        className="w-full h-10 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="Nome do empreendedor"
                        value={formData.nomeEmpreendedor}
                        onChange={(e) => setFormData(p => ({ ...p, nomeEmpreendedor: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5">CPF / CNPJ</label>
                      <input 
                        type="text"
                        className="w-full h-10 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="000.000.000-00 ou 00.000.000/0000-00"
                        value={formData.cpfCnpj}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          if (val.length <= 14) {
                            setFormData(p => ({ ...p, cpfCnpj: val }));
                          }
                        }}
                        onBlur={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          let formatted = val;
                          if (val.length === 11) {
                            formatted = val.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
                          } else if (val.length === 14) {
                            formatted = val.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
                          }
                          setFormData(p => ({ ...p, cpfCnpj: formatted }));
                        }}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5">Localização do empreendimento</label>
                      <input 
                        type="text"
                        className="w-full h-10 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="Endereço do empreendimento"
                        value={formData.enderecoEmpreendimento}
                        onChange={(e) => setFormData(p => ({ ...p, enderecoEmpreendimento: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5">Fazenda</label>
                      <input 
                        type="text"
                        className="w-full h-10 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="Nome da Fazenda"
                        value={formData.nomeFazenda}
                        onChange={(e) => setFormData(p => ({ ...p, nomeFazenda: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5">Nº CAR</label>
                      <input 
                        type="text"
                        className="w-full h-10 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="Ex: MT-12345/2026"
                        value={formData.numCar}
                        onChange={(e) => setFormData(p => ({ ...p, numCar: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5">Município</label>
                      <select 
                        className="w-full h-10 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={formData.municipioEmpreendimento}
                        onChange={(e) => setFormData(p => ({ ...p, municipioEmpreendimento: e.target.value }))}
                      >
                        {MUNICIPIOS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>

                    <div className="md:col-span-2 space-y-4">
                      <label className="text-[10px] font-black text-slate-500 uppercase block">Coordenadas do eixo da barragem (Sirgas 2000)</label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 uppercase">Lat</span>
                          <input 
                            type="text"
                            className="w-full h-10 pl-10 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                            placeholder="15104144"
                            value={formData.latEixo}
                            onChange={(e) => setFormData(p => ({ ...p, latEixo: formatGMS(e.target.value, true) }))}
                            maxLength={12}
                          />
                        </div>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 uppercase">Long</span>
                          <input 
                            type="text"
                            className="w-full h-10 pl-12 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                            placeholder="54135682"
                            value={formData.longEixo}
                            onChange={(e) => setFormData(p => ({ ...p, longEixo: formatGMS(e.target.value, false) }))}
                            maxLength={12}
                          />
                        </div>
                      </div>
                      <MapPicker />
                    </div>

                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5">Finalidade do barramento</label>
                      <div className="space-y-2">
                        <select 
                          className="w-full h-10 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                          value={formData.finalidadeBarramento}
                          onChange={(e) => setFormData(p => ({ ...p, finalidadeBarramento: e.target.value }))}
                        >
                          {FINALIDADES.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                        {formData.finalidadeBarramento === 'Outro' && (
                          <input 
                            type="text"
                            className="w-full h-10 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="Inserção manual"
                            value={formData.finalidadeBarramentoOutro}
                            onChange={(e) => setFormData(p => ({ ...p, finalidadeBarramentoOutro: e.target.value }))}
                          />
                        )}
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5">Situação do empreendimento</label>
                      <div className="space-y-2">
                        <select 
                          className="w-full h-10 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                          value={formData.situacaoEmpreendimento}
                          onChange={(e) => setFormData(p => ({ ...p, situacaoEmpreendimento: e.target.value }))}
                        >
                          {SITUACOES_EP.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        {formData.situacaoEmpreendimento === 'Outro' && (
                          <input 
                            type="text"
                            className="w-full h-10 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="Inserção manual"
                            value={formData.situacaoEmpreendimentoOutro}
                            onChange={(e) => setFormData(p => ({ ...p, situacaoEmpreendimentoOutro: e.target.value }))}
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bloco: Ofício emitido */}
                  <div className="mt-8 p-6 bg-white border border-slate-200 rounded-xl">
                    <div className="flex items-center gap-2 mb-6">
                      <FileText className="w-4 h-4 text-indigo-600" />
                      <h4 className="font-bold text-slate-700 text-sm">Ofício emitido</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5">Ofício n°</label>
                        <input 
                          type="text"
                          className="w-full h-10 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                          placeholder="Ex: 1234/2026"
                          value={formData.numOficioEmitido}
                          onChange={(e) => setFormData(p => ({ ...p, numOficioEmitido: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5">Emitido em</label>
                        <div className="relative">
                          <input 
                            type="date"
                            className="w-full h-10 px-3 pl-10 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                            value={formData.dataOficioEmitido}
                            onChange={(e) => setFormData(p => ({ ...p, dataOficioEmitido: e.target.value }))}
                          />
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        </div>
                      </div>

                      <div className="md:col-span-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase block mb-3">Encaminhado via</label>
                        <div className="flex flex-wrap gap-4 mb-3">
                          {['e-mail', 'correspondência', 'OUTRO'].map(via => (
                            <label key={via} className="flex items-center gap-2 cursor-pointer group">
                              <input 
                                type="checkbox"
                                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                checked={formData.viaEncaminhamento.includes(via)}
                                onChange={(e) => {
                                  const newVal = e.target.checked 
                                    ? [...formData.viaEncaminhamento, via]
                                    : formData.viaEncaminhamento.filter(v => v !== via);
                                  setFormData(p => ({ ...p, viaEncaminhamento: newVal }));
                                }}
                              />
                              <span className="text-sm font-bold text-slate-600 group-hover:text-indigo-600 transition-colors uppercase text-[10px]">{via}</span>
                            </label>
                          ))}
                        </div>
                        {formData.viaEncaminhamento.includes('OUTRO') && (
                          <input 
                            type="text"
                            className="w-full h-10 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="Inserção manual (suprimirá a palavra outro)"
                            value={formData.viaEncaminhamentoOutro}
                            onChange={(e) => setFormData(p => ({ ...p, viaEncaminhamentoOutro: e.target.value }))}
                          />
                        )}
                      </div>

                      <div className="md:col-span-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5">Encaminhado para o endereço</label>
                        <input 
                          type="text"
                          className="w-full h-10 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                          placeholder="Endereço físico / e-mail"
                          value={formData.enderecoEncaminhamento}
                          onChange={(e) => setFormData(p => ({ ...p, enderecoEncaminhamento: e.target.value }))}
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5">Prazo concedido (dias)</label>
                        <input 
                          type="number"
                          className="w-full h-10 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                          placeholder="Ex: 30"
                          value={formData.prazoConcedido || ''}
                          onChange={(e) => setFormData(p => ({ ...p, prazoConcedido: parseInt(e.target.value) || 0 }))}
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5">Recebido em</label>
                        <div className="relative">
                          <input 
                            type="date"
                            className="w-full h-10 px-3 pl-10 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                            value={formData.dataRecebimentoOficio}
                            onChange={(e) => setFormData(p => ({ ...p, dataRecebimentoOficio: e.target.value }))}
                          />
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          {formData.dataRecebimentoOficio && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                              <span className="text-[10px] font-black px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                                {(() => {
                                  const receivedDate = new Date(formData.dataRecebimentoOficio);
                                  const today = new Date();
                                  today.setHours(0, 0, 0, 0);
                                  const diffTime = today.getTime() - receivedDate.getTime();
                                  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                                  return diffDays >= 0 ? `${diffDays} dias atrás` : "Data futura";
                                })()}
                              </span>
                              {formData.prazoConcedido > 0 && (
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                  (() => {
                                    const receivedDate = new Date(formData.dataRecebimentoOficio);
                                    const expiryDate = new Date(receivedDate);
                                    expiryDate.setDate(expiryDate.getDate() + formData.prazoConcedido);
                                    const today = new Date();
                                    today.setHours(0, 0, 0, 0);
                                    return today > expiryDate ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700';
                                  })()
                                }`}>
                                  Prazo expirado em: {(() => {
                                    const receivedDate = new Date(formData.dataRecebimentoOficio);
                                    const expiryDate = new Date(receivedDate);
                                    expiryDate.setDate(expiryDate.getDate() + formData.prazoConcedido);
                                    return expiryDate.toLocaleDateString('pt-BR');
                                  })()}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5">Recebido por</label>
                        <input 
                          type="text"
                          className="w-full h-10 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                          placeholder="Nome de quem recebeu"
                          value={formData.recebidoPorNome}
                          onChange={(e) => setFormData(p => ({ ...p, recebidoPorNome: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  </section>

        {/* Section 3 */}
        <section ref={sectionsRef[3]} id="section-3" className="scroll-mt-6">
          <div className="max-w-4xl mx-auto">
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm mb-6">
              <button 
                onClick={() => toggleSection(3)}
                className="w-full flex items-center justify-between p-4 bg-indigo-50/50 hover:bg-indigo-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-xs">3</div>
                  <h3 className="font-black text-slate-800 uppercase text-xs tracking-widest">Sistema ao Empreendedor</h3>
                </div>
                {expandedSections[3] ? <ChevronUp className="text-indigo-600" /> : <ChevronDown className="text-indigo-600" />}
              </button>

              <AnimatePresence>
                {expandedSections[3] && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="p-6 space-y-6"
                  >
                    <div className="bg-white p-6 rounded-xl border border-slate-100 bg-slate-50/30 font-medium">
                        <div className="flex items-center gap-2 mb-6 pb-2 border-b border-slate-100">
                          <Wrench className="w-5 h-5 text-indigo-600" />
                          <h3 className="font-black text-slate-800 uppercase text-xs tracking-widest">SISTEMA DE INFORMAÇÕES AO EMPREENDEDOR</h3>
                        </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                    <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Processo</label>
                    <p className="text-sm font-bold text-slate-700">{formData.numProcesso || <span className="text-slate-300 italic">Não informado no tópico 2</span>}</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                    <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Analista</label>
                    <p className="text-sm font-bold text-slate-700">
                      {formData.analistaRef === 'OUTRO' ? (formData.analistaRefOutro || <span className="text-slate-300 italic">Não informado</span>) : formData.analistaRef}
                    </p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                    <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Município</label>
                    <p className="text-sm font-bold text-slate-700">{formData.municipioEmpreendimento}/MT</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5">Situação</label>
                    <input 
                      type="text"
                      className="w-full h-10 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold text-indigo-700"
                      value={formData.sistemaSituacao}
                      onChange={(e) => setFormData(p => ({ ...p, sistemaSituacao: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="bg-amber-50 border-2 border-amber-200 p-6 rounded-xl flex items-start gap-4 shadow-sm shadow-amber-100">
                    <div className="p-2 bg-amber-100 rounded-full">
                      <AlertCircle className="w-6 h-6 text-amber-600" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-amber-900 uppercase tracking-tight mb-1">Atenção Analista</h4>
                      <p className="text-xs font-bold text-amber-700 leading-relaxed uppercase">
                        Essas informações serão compartilhadas com o Empreendedor e Responsável Técnico
                      </p>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5">Observações do Analista</label>
                    <textarea 
                      className="w-full h-40 px-4 py-3 bg-white border-2 border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none shadow-inner font-medium text-slate-700"
                      value={formData.sistemaObservacoes}
                      onChange={(e) => setFormData(p => ({ ...p, sistemaObservacoes: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  </section>

        {/* Section 4 */}
        <section ref={sectionsRef[4]} id="section-4" className="scroll-mt-6">
          <div className="max-w-5xl mx-auto">
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm mb-6">
              <button 
                onClick={() => toggleSection(4)}
                className="w-full flex items-center justify-between p-4 bg-indigo-50/50 hover:bg-indigo-50 transition-colors"
                id="toggle-section-4"
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-xs">4</div>
                  <h3 className="font-black text-slate-800 uppercase text-xs tracking-widest">Revisar e Exportar</h3>
                </div>
                {expandedSections[4] ? <ChevronUp className="text-indigo-600" /> : <ChevronDown className="text-indigo-600" />}
              </button>

              <AnimatePresence>
                {expandedSections[4] && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="p-6 space-y-6"
                  >
                    {/* Header Preview Section */}
                    <div className="bg-white p-6 rounded-xl border border-slate-100 flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">4. REVISAR E EXPORTAR</h3>
                        <p className="text-slate-500 text-xs font-medium">Visualize o Parecer Técnico gerado automaticamente.</p>
                      </div>
                      <button 
                        onClick={exportToDocx}
                        className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold text-xs uppercase shadow-lg shadow-indigo-600/20 transition-all hover:bg-indigo-700"
                      >
                        <FileDown className="w-4 h-4" /> Exportar Docx
                      </button>
                    </div>

              {/* A4 Preview Container */}
              <div className="bg-slate-200 p-8 md:p-12 rounded-xl border border-slate-300 shadow-inner overflow-x-auto min-h-[1000px] flex justify-center">
                <div className="bg-white w-[210mm] min-h-[297mm] p-[25mm] shadow-2xl origin-top transition-transform duration-500 hover:scale-[1.01]">
                  {/* Cabeçalho */}
                  <div className="text-center mb-10 space-y-1">
                    <h2 className="text-[11px] font-black leading-tight text-slate-800 uppercase">GOVERNO DO ESTADO DE MATO GROSSO</h2>
                    <h2 className="text-[11px] font-black leading-tight text-slate-800 uppercase">SECRETARIA DE ESTADO DE MEIO AMBIENTE</h2>
                    <h2 className="text-[10px] font-bold leading-tight text-slate-700 uppercase">SECRETARIA ADJUNTA DE LICENCIAMENTO AMBIENTAL E RECURSOS HÍDRICOS</h2>
                    <h2 className="text-[10px] font-bold leading-tight text-slate-700 uppercase">SUPERINTENDÊNCIA DE RECURSOS HÍDRICOS</h2>
                    <h2 className="text-[10px] font-bold leading-tight text-slate-700 uppercase">COORDENADORIA DE SEGURANÇA DE BARRAGENS</h2>
                    <div className="pt-6">
                      <h1 className="text-[13px] font-black text-slate-900 border-y-2 border-slate-900 py-2 inline-block px-12 tracking-tight uppercase">
                        PARECER TÉCNICO DE INDEFERIMENTO POR INÉRCIA - CBS/SURH/SEMA-MT
                      </h1>
                    </div>
                  </div>

                  {/* Assunto */}
                  <div className="mb-10">
                    <p className="text-[12px] font-black text-slate-900 flex gap-2">
                       <span className="uppercase">Assunto:</span>
                       <span className="font-bold">Análise referente ao pedido de classificação da segurança de barragem</span>
                    </p>
                  </div>

                  {/* 1. PROJETO PROPOSTO */}
                  <section className="mb-8">
                    <h3 className="text-[12px] font-black text-slate-900 mb-2 uppercase">1. PROJETO PROPOSTO</h3>
                    <p className="text-[12px] leading-relaxed text-justify text-slate-800">
                      Trata-se da análise do requerimento de classificação de barragem cuja razão social <b>{formData.nomeEmpreendedor || '...'}</b> protocolado nesta secretaria sob o processo <b>{formData.numProcesso || '...'}</b>. A barragem está localizada na <b>{formData.nomeFazenda || '...'}</b> no município de <b>{formData.municipioEmpreendimento || '...'}</b>/ MT.
                    </p>
                  </section>

                  {/* 2. HISTÓRICO */}
                  <section className="mb-8">
                    <h3 className="text-[12px] font-black text-slate-900 mb-2 uppercase">2. HISTÓRICO</h3>
                    <div className="text-[12px] leading-relaxed text-justify text-slate-800 space-y-4">
                      <p>
                        Foi requerido em <b>{formData.dataProtocolo ? new Date(formData.dataProtocolo).toLocaleDateString('pt-BR') : '...'}</b> a classificação de barragem sob o processo <b>{formData.numProcesso || '...'}</b> onde apresentou documentos referentes ao barramento.
                      </p>
                      <p>
                        Em <b>{formData.dataOficioEmitido ? new Date(formData.dataOficioEmitido).toLocaleDateString('pt-BR') : '...'}</b> foi emitido o Oficio nº <b>{formData.numOficioEmitido || '...'}/GSB/SEMA</b>, por meio do qual foram elencadas pendencias a serem apresentadas para a continuidade da análise do processo, sendo encaminhado via <b>{
                          (() => {
                            const vias = [...formData.viaEncaminhamento];
                            if (vias.includes('OUTRO')) {
                              const filtered = vias.filter(v => v !== 'OUTRO');
                              if (formData.viaEncaminhamentoOutro) filtered.push(formData.viaEncaminhamentoOutro);
                              return filtered.join(', ');
                            }
                            return vias.join(', ');
                          })() || '...'
                        }</b> para <b>{formData.recebidoPorNome || '...'}</b>, tendo a confirmação do recebimento em <b>{formData.dataRecebimentoOficio ? new Date(formData.dataRecebimentoOficio).toLocaleDateString('pt-BR') : '...'}</b>.
                      </p>
                      <p>
                        Visto que o prazo para o cumprimento integral das pendencias encerrou-se em <b>{
                          (() => {
                            if (!formData.dataRecebimentoOficio || !formData.prazoConcedido) return '...';
                            const date = new Date(formData.dataRecebimentoOficio);
                            date.setDate(date.getDate() + formData.prazoConcedido);
                            return date.toLocaleDateString('pt-BR');
                          })()
                        }</b> e, até a presente data, não houve manifestação por parte do interessado, o processo será INDEFERIDO por inércia.
                      </p>
                      <p>
                        Após análise foi constatado que não houve atendimento da Instrução Normativa nº 08/2023, como também ao Termo de Referência n° 17/SURH/SEMA-MT.
                      </p>
                    </div>
                  </section>

                  {/* 3. ANÁLISE */}
                  <section className="mb-8">
                    <h3 className="text-[12px] font-black text-slate-900 mb-2 uppercase">3. ANÁLISE</h3>
                    <div className="text-[12px] leading-relaxed text-justify text-slate-800 space-y-2">
                      <p className="font-bold border-b pb-1 mb-2">Localização Georeferenciada:</p>
                      <p>
                        A barragem está localizada na <b>{formData.enderecoEmpreendimento || '...'}</b>, município <b>{formData.municipioEmpreendimento || '...'}</b>/ MT, sob as coordenadas geográficas: <b>{formData.latEixo ? `LAT:${formData.latEixo}` : '...'}</b> e <b>{formData.longEixo ? `LONG:${formData.longEixo}` : '...'}</b>.
                      </p>
                    </div>
                  </section>

                  {/* 4. CONFERÊNCIA DOCUMENTAL */}
                  <section className="mb-8">
                    <h3 className="text-[12px] font-black text-slate-900 mb-2 uppercase">4. CONFERÊNCIA DOCUMENTAL</h3>
                    <p className="text-[12px] leading-relaxed text-justify text-slate-800 mb-2">
                       Os documentos apresentados pela interessada foram conferidos quanto a sua forma e atendimento ao roteiro orientativa, não consistindo em atribuição do órgão ambiental atestar a veracidade destes, sendo responsabilidade da requerente e do responsável técnico a autenticidade dos mesmos.
                    </p>
                    <p className="text-[12px] font-bold mb-2">Consta nos autos:</p>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-1">
                      {[...formData.docsGerais, ...formData.docsEspolio, ...formData.docsTecnicos]
                        .filter(d => d.checked)
                        .map((doc, idx) => (
                          <div key={idx} className="flex gap-2 text-[10px] items-start">
                            <span className="text-indigo-600 font-black">•</span>
                            <span className="text-slate-700 leading-tight uppercase font-medium">
                              {doc.label === 'OUTRO' ? (doc.extraInput || doc.label) : doc.label}
                            </span>
                          </div>
                      ))}
                    </div>
                  </section>

                  {/* 5. ANÁLISE TÉCNICA */}
                  <section className="mb-8">
                    <h3 className="text-[12px] font-black text-slate-900 mb-2 uppercase">5. ANÁLISE TÉCNICA</h3>
                    <p className="text-[12px] leading-relaxed text-justify text-slate-800 italic">
                      As pendências não foram apresentadas no prazo estabelecido, cabendo o indeferimento por inércia do interessado.
                    </p>
                  </section>

                  {/* 6. CONCLUSÃO */}
                  <section className="mb-8">
                    <h3 className="text-[12px] font-black text-slate-900 mb-2 uppercase">6. CONCLUSÃO</h3>
                    <div className="text-[12px] leading-relaxed text-justify text-slate-800 space-y-4">
                      <p>
                        Considerando as informações fornecidas pelo responsável técnico da classificação da barragem, <b>{
                          formData.responsaveisTecnicos.length > 0 
                            ? formData.responsaveisTecnicos.map(rt => rt.nome === 'OUTRO' ? rt.nomeOutro : rt.nome).join(', ')
                            : '...'
                        }</b>, acompanhado pelo ART CREA/MT <b>{
                          formData.responsaveisTecnicos.length > 0
                            ? formData.responsaveisTecnicos.map(rt => rt.arts.map(a => a.numero).join(', ')).join('; ')
                            : '...'
                        }</b>, bem como por toda documentação trazida aos autos, sendo essas de sua inteira responsabilidade;
                      </p>
                      <p>
                        Considerando o acima exposto sugerimos o <b>INDEFERIMENTO</b> do requerimento de classificação da barragem localizada na <b>{formData.nomeFazenda || '...'}</b>, no município <b>{formData.municipioEmpreendimento || '...'}</b>/ MT solicitado por <b>{formData.nomeEmpreendedor || '...'}</b>, por entender que os documentos apresentados não contemplaram todas as informações/documentações relevantes para a conclusão da análise, estando assim, em desconformidade com as legislações vigentes e com as solicitações deste órgão.
                      </p>
                      <p>
                        Informamos que o arquivamento do processo não impedirá a apresentação de novo requerimento, que deverá obedecer ao Termo de Referência nº 17/SURH/SEMA-MT e a Instrução Normativa 08/2023 disponibilizado no sítio eletrônico da SEMA, mediante o pagamento de custo de análise, conforme regulamenta as normas vigentes.
                      </p>
                      <p>
                        Ressalvamos, porém, que o presente Parecer não exime os responsáveis, em qualquer época, dos exames e eventuais exigências que venham a ser feitas pela SEMA/MT, onde a operação da barragem sem a devida outorga de obra hidráulica ou cadastro da mesma está sujeita a pena das aplicações das medidas legais cabíveis.
                      </p>
                    </div>
                  </section>

                  {/* Assinatura Placeholder */}
                  <div className="mt-16 text-center">
                    <div className="w-64 border-t border-slate-400 mx-auto pt-2">
                       <p className="text-[11px] font-black uppercase text-slate-800">{formData.analistaRef === 'OUTRO' ? formData.analistaRefOutro : formData.analistaRef}</p>
                       <p className="text-[10px] text-slate-500 uppercase font-bold">Analista de Meio Ambiente</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  </section>
</div>
</div>
);
};

export default RejectionForm;
