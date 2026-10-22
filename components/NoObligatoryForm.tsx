import React, { useState, useEffect, useContext } from 'react';
import { 
  ChevronRight, 
  ChevronLeft, 
  ChevronDown,
  Save, 
  FileText, 
  Info, 
  ArrowRight,
  Database,
  Cloud,
  CheckCircle,
  Layout,
  Plus,
  Trash2,
  Download,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Document, 
  Packer, 
  Paragraph, 
  TextRun, 
  Table, 
  TableRow, 
  TableCell, 
  AlignmentType, 
  BorderStyle, 
  WidthType,
  VerticalAlign,
  Header,
  Footer
} from 'docx';
import { saveAs } from 'file-saver';
import { toast } from 'sonner';
import { logActivity } from '../src/lib/auditService';
import { supabase } from '../src/supabaseClient';
import { AuthContext } from '../src/contexts/AuthContext';
import { DataContext } from '../src/contexts/DataContext';
import { NoObligatoryData } from '../types';
import { OPS_ANALISTA as ANALYST_LIST } from '../constants';

interface NoObligatoryFormProps {
  onBack: () => void;
  initialData?: NoObligatoryData;
  readOnly?: boolean;
}

const steps = [
  { id: 1, title: 'INTRODUÇÃO', icon: Info },
  { id: 2, title: 'INFORMAÇÕES DO PEDIDO', icon: Layout },
  { id: 3, title: 'BARRAMENTO', icon: Database },
  { id: 4, title: 'SISTEMA DE INFORMAÇÕES AO EMPREENDEDOR', icon: Cloud },
  { id: 5, title: 'REVISAR E EXPORTAR', icon: CheckCircle },
];

const RT_LIST = [
  "Alex Sallas Lopes",
  "Ana Carolina Martins de Siqueira Antonachi",
  "Anderson C. Aragão Vasconcelos",
  "ANDRE LUIS DO ESPIRITO SANTO",
  "André Luiz Machado",
  "André Luiz Schuring",
  "Apoliana dos Santos Vieira Medeiros",
  "Áureo Sierra da Silva",
  "Beatriz Crestina",
  "Beno Guilherme Ziech",
  "Bruna Assis Paim dos Santos",
  "Bruna Caroline Freitas Machado",
  "Bruno Renner",
  "Caio Vinicius Mallezan",
  "Carlos Eduardo Vendite de Assis",
  "César Augusto Mamede de Oliveira Pinto",
  "Claudio Giuseppe Terzi",
  "Cleber Cenci",
  "Cosme Alves Rodrigues",
  "Cristiane Schotten dos Santos",
  "Darci Carlos Fornari",
  "David Edson Teixeira",
  "Derkian Sanches de Oliveira",
  "Diego Luciano Gualdi",
  "Dreyfus Lincoln Silveira Feitoza",
  "Duan Marcel da Silva Oliveira",
  "Edson Fiabani",
  "Eduardo Jacusiel Miranda",
  "Eduardo Jacusiel Miranda e Leonardo Chicre Maluf",
  "Elias Rodrigues Leal",
  "Esmeraldo de Almeida",
  "Fabiana Rodrigues dos Santos Souza",
  "Fábio Borges Lima",
  "Fernando Alécio Costa",
  "Fernando Cuiabano",
  "Fernando dos Santos Sanches",
  "Fernando Henrique de Godoy",
  "Gabriela Marques Batista",
  "Giovane Almondes Anderção",
  "Guilherme Alexandre Leachenski",
  "Gustavo Ribeiro da Silva",
  "Hélio David de Almeida Filho",
  "Hiago Cesar Souza Rodrigues",
  "Higor Cezar da Silva Pavinato",
  "Italo Silva Oliveira",
  "Jailson Baumgartner",
  "João Antonio Bernardo das Neves",
  "João Antonio Possani Oinaski",
  "João Bernardo das Neves",
  "João Bosco Silva Gonçalves",
  "Jonas Mangoni Rambo",
  "Jonatas Garcia Hurtado",
  "José Benedito Gaiva",
  "Juli Victório Rocha Lima",
  "Karyna Lorrainy da Silva",
  "Keli Rejane Silva Dantas",
  "Kerolin Elza Costa Gonçalves",
  "Khayke Botelho Sonohata",
  "Leonardo Pinheiro Costa",
  "Livio Costa Recedive",
  "Lucas Souza Pereira",
  "Luciana Rezende Almeida",
  "Luciano Jorge da Cunha Viana",
  "Luis Augusto Siebeneichler",
  "Luiz Carlos Machado Filho",
  "Maria Luiza Santi Presentinho",
  "Mariele da Rocha",
  "Mário Luiz Cuiabano",
  "Matheus Felype Rocha Baldin",
  "Monique Kothrade Casonatto",
  "Patricia Aparecida Justino",
  "Paulo Sergio Alencar Carvalho",
  "Péricles Aquino Botelho",
  "Rafael Beduschi",
  "Rafael Cantuério de Souza",
  "Renan Felipe Quaresma Martins",
  "Ricardo Barbosa Damascena",
  "Ricardo Faria Mecca",
  "Ricardo Yotzchetz Junior",
  "Sandra Eudes Simão de Lima",
  "Sergio Alex Martins Bragagnolo",
  "Tadeu Miranda de Queiroz",
  "Taiana Todeschini",
  "Tainah da Silva Ferreira",
  "Tamara Cristina Tariga",
  "Thaiana Todeschini",
  "Thaice Laine Pedroso Marques Neis",
  "Thiago Eustácio da Rocha",
  "Tiago Guilherme Menegon",
  "Tiago Onorio",
  "Tiago Saraiva Muniz",
  "Túllio Moraes Dias",
  "Vanessa Gomes",
  "Wagner Barros de Paula",
  "Warley Leonel Vilela",
  "Wesley dos Santos Marques"
];

const MUNICIPALITIES = [
  "Acorizal", "Água Boa", "Alta Floresta", "Alto Araguaia", "Alto Boa Vista", "Alto Garças", "Alto Paraguai", "Alto Taquari", "Apiacás", "Araguaiana", "Araguainha", "Araputanga", "Arenápolis", "Aripuanã", "Barão de Melgaço", "Barra do Bugres", "Barra do Garças", "Bom Jesus do Araguaia", "Brasnorte", "Cáceres", "Campinápolis", "Campo Novo do Parecis", "Campo Verde", "Campos de Júlio", "Canabrava do Norte", "Canarana", "Carlinda", "Castanheira", "Chapada dos Guimarães", "Cláudia", "Cocalinho", "Colíder", "Colniza", "Comodoro", "Confresa", "Conquista d’Oeste", "Cotriguaçu", "Curvelândia", "Cuiabá", "Denise", "Diamantino", "Dom Aquino", "Feliz Natal", "Figueirópolis d’Oeste", "Gaúcha do Norte", "General Carneiro", "Glória d’Oeste", "Guarantã do Norte", "Guiratinga", "Indiavái", "Itaúba", "Itiquira", "Jaciara", "Jangada", "Jauru", "Juara", "Juína", "Juruena", "Juscimeira", "Lambari d’Oeste", "Lucas do Rio Verde", "Luciára", "Marcelândia", "Matupá", "Mirassol d’Oeste", "Nobres", "Nortelândia", "Nossa Senhora do Livramento", "Nova Bandeirantes", "Nova Brasilândia", "Nova Canaã do Norte", "Nova Guarita", "Nova Lacerda", "Nova Marilândia", "Nova Maringá", "Nova Monte Verde", "Nova Mutum", "Nova Nazaré", "Nova Olímpia", "Nova Santa Helena", "Nova Ubiratã", "Nova Xavantina", "Novo Horizonte do Norte", "Novo Mundo", "Novo Santo Antônio", "Novo São Joaquim", "Paranaíta", "Paranatinga", "Pedra Preta", "Peixoto de Azevedo", "Planalto da Serra", "Poconé", "Pontal do Araguaia", "Ponte Branca", "Pontes e Lacerda", "Porto Alegre do Norte", "Porto dos Gaúchos", "Porto Esperidião", "Porto Estrela", "Poxoréu", "Primavera do Leste", "Querência", "Reserva do Cabaçal", "Ribeirão Cascalheira", "Ribeirãozinho", "Rio Branco", "Rondolândia", "Rondonópolis", "Rosário Oeste", "Salto do Céu", "Santa Carmem", "Santa Cruz do Xingu", "Santa Rita do Trivelato", "Santa Terezinha", "Santo Afonso", "Santo Antônio do Leste", "Santo Antônio do Leverger", "São Félix do Araguaia", "São José do Povo", "São José do Rio Claro", "São José do Xingu", "São José dos Quatro Marcos", "São Pedro da Cipa", "Sapezal", "Serra Nova Dourada", "Sinop", "Sorriso", "Tabaporã", "Tangará da Serra", "Tapurah", "Terra Nova do Norte", "Tesouro", "Torixoréu", "União do Sul", "Vale de São Domingos", "Várzea Grande", "Vera", "Vila Bela da Santíssima Trindade", "Vila Rica"
];

const CollapsibleSection: React.FC<{
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}> = ({ title, subtitle, children, defaultExpanded = true }) => {
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);
  return (
    <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden mb-8 transition-all hover:shadow-2xl hover:shadow-slate-200/60">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-8 py-7 flex items-center justify-between bg-white hover:bg-slate-50 transition-colors border-none cursor-pointer group"
      >
        <div className="text-left">
          <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight group-hover:text-emerald-600 transition-colors">{title}</h3>
          {subtitle && <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">{subtitle}</p>}
        </div>
        <div className={`transform transition-all duration-300 ${isExpanded ? 'rotate-180 bg-emerald-50' : 'bg-slate-100'} p-2 rounded-full`}>
          <ChevronDown size={20} className={isExpanded ? 'text-emerald-500' : 'text-slate-400'} />
        </div>
      </button>
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            <div className="p-8 lg:p-12 border-t border-slate-100 bg-white">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ChecklistSection: React.FC<{
  title: string;
  icon?: React.ElementType;
  children: React.ReactNode;
  badge?: string;
  defaultOpen?: boolean;
}> = ({ title, icon: Icon, children, badge, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-300 rounded-2xl overflow-hidden transition-all duration-300 mb-5 bg-white shadow-md shadow-slate-100/50">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-6 bg-white hover:bg-slate-50 transition-colors border-none cursor-pointer text-left"
      >
        <div className="flex items-center gap-4">
          <div className={`p-2 rounded-xl ${isOpen ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
            {Icon && <Icon size={18} />}
          </div>
          <div>
            <h5 className="text-[11px] font-black text-slate-900 uppercase tracking-widest leading-none">{title}</h5>
            {badge && <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mt-1.5">{badge}</p>}
          </div>
        </div>
        <ChevronDown size={18} className={`text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-7 border-t border-slate-100 bg-slate-50/20">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const NoObligatoryForm: React.FC<NoObligatoryFormProps> = ({ onBack, initialData, readOnly }) => {
  const { currentUser } = useContext(AuthContext);
  const { refreshData } = useContext(DataContext);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    introduction: {
      receiptDate: '',
      classificationType: 'Não Obrigatoriedade',
      damType: '',
      situation: '',
      situationOther: '',
      checklist: {
        item1: false,
        item2: false,
        item3: false,
        item4: false,
      },
      checklistObs: {
        item1: '',
        item2: '',
        item3: '',
        item4: '',
      },
      docsGerais: [] as string[],
      docsGeraisFolhas: {} as Record<string, string>,
      docsGeraisObs: {} as Record<string, string>,
      docsGeraisOther: '',
      respTecnico: [] as string[],
      respTecnicoNomes: {} as Record<string, string>,
      respTecnicoFolhas: {} as Record<string, string>,
      respTecnicoObs: {} as Record<string, string>,
      respTecnicoOther: '',
      espolioActive: false,
      espolio: [] as string[],
      espolioNomes: {} as Record<string, string>,
      espolioFolhas: {} as Record<string, string>,
      espolioObs: {} as Record<string, string>,
      espolioOther: '',
      artAtividades: [] as { id: string, artNum: string, atividade: string, atividadeOther: string, folha: string }[],
      docsTecnicos: [] as string[],
      docsTecnicosNomes: {} as Record<string, string>,
      docsTecnicosFolhas: {} as Record<string, string>,
      docsTecnicosObs: {} as Record<string, string>,
      docsTecnicosOther: '',
    },
    orderInfo: {
      processo: '',
      analista: '',
      analistaOther: '',
      respTecnicos: [] as { id: string, nome: string, art: string, isOther: boolean, nomeOther: string }[],
      empreendedor: '',
      cpfCnpj: '',
      localizacao: '',
      numCar: '',
      municipio: '',
      finalidade: '',
      finalidadeOther: '',
      situacao: '',
      situacaoOther: '',
      cursoAgua: '',
      propriedadesLimites: '',
      subBacia: '',
      areaBacia: '',
      indicePluviosidade: '',
      locaisBenfeitorias: '',
      legenda: '*Calculada pelo autor do projeto e indicada nos autos. **Fonte: SIMLAM, 2026'
    },
    damInfo: {
      principal: {
        id: 'principal',
        nome: '',
        lat: '',
        long: '',
        altura: '',
        alturaFolha: '',
        bordaLivre: '',
        areaInundada: '',
        volume: '',
        vazaoMax: '',
        areaBacia: '',
        segurancaEstrutural: ''
      },
      upstreamDams: [] as {
        id: string;
        nome: string;
        lat: string;
        long: string;
        altura: string;
        alturaFolha: string;
        bordaLivre: string;
        areaInundada: string;
        volume: string;
        vazaoMax: string;
        areaBacia: string;
        segurancaEstrutural: string;
      }[]
    },
    entrepreneurSystem: {
      processo: '',
      dataEnvioPendencia: '',
      prazoDias: '30',
      situacao: 'Aguardando análise',
      observacoes: '',
      status: 'rascunho' as 'rascunho' | 'concluido',
      enquadraPNSB: false
    }
  });

  // Load initial data
  useEffect(() => {
    if (initialData && initialData.data) {
      setFormData(initialData.data);
    }
  }, [initialData]);

  // Pre-select analyst based on logged-in user
  useEffect(() => {
    if (currentUser?.name && !initialData && !formData.orderInfo.analista) {
      const userName = currentUser.name.trim().toLowerCase();
      const matchedAnalista = ANALYST_LIST.find(
        name => name.trim().toLowerCase().includes(userName) || 
                userName.includes(name.trim().toLowerCase())
      );
      if (matchedAnalista) {
        setFormData(prev => ({
          ...prev,
          orderInfo: { ...prev.orderInfo, analista: matchedAnalista }
        }));
      }
    }
  }, [currentUser, initialData, formData.orderInfo.analista]);

  const handleDocToggle = (field: keyof typeof formData.introduction, value: string) => {
    const list = formData.introduction[field] as string[];
    if (list.includes(value)) {
      setFormData({
        ...formData,
        introduction: {
          ...formData.introduction,
          [field]: list.filter(v => v !== value)
        }
      });
    } else {
      setFormData({
        ...formData,
        introduction: {
          ...formData.introduction,
          [field]: [...list, value]
        }
      });
    }
  };

  const analystName = formData.orderInfo.analista === 'OUTRO' ? formData.orderInfo.analistaOther : formData.orderInfo.analista;
  const municipalityText = formData.orderInfo.municipio ? `${formData.orderInfo.municipio}/MT` : '';
  
  const calculateExpiry = () => {
    if (!formData.entrepreneurSystem.dataEnvioPendencia || !formData.entrepreneurSystem.prazoDias) return null;
    const date = new Date(formData.entrepreneurSystem.dataEnvioPendencia);
    date.setDate(date.getDate() + parseInt(formData.entrepreneurSystem.prazoDias));
    return date;
  };

  const expiryDate = calculateExpiry();
  const daysRemaining = expiryDate ? Math.ceil((expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;

  const rtText = formData.orderInfo.respTecnicos.map(rt => rt.isOther ? rt.nomeOther : rt.nome).join(', ');
  const artTextLong = formData.orderInfo.respTecnicos.map(rt => rt.art).join(', ');

  const handleClear = () => {
    if (window.confirm("Você tem certeza que deseja limpar todo o formulário? Todos os dados não salvos serão perdidos.")) {
      window.location.reload();
    }
  };

  const handleSave = async (isConcluido: boolean = false) => {
    if (!currentUser) {
      toast.error("Usuário não autenticado");
      return;
    }

    if (!formData.orderInfo.processo) {
      toast.error("Número do processo é obrigatório");
      return;
    }

    setIsSaving(true);
    const newStatus = isConcluido ? 'Concluído' : 'Rascunho';
    
    try {
      const payload = {
        data: formData, // the full JSON
        analista: analystName,
        processo: formData.orderInfo.processo,
        status: newStatus,
        municipio: formData.orderInfo.municipio,
        lat: formData.damInfo.principal.lat,
        long: formData.damInfo.principal.long,
        empreendedor: formData.orderInfo.empreendedor,
        user_id: currentUser.id,
        updated_at: new Date().toISOString()
      };

      let result;
      if (initialData?.id) {
        result = await supabase
          .from('nao_obrigatoriedades')
          .update(payload)
          .eq('id', initialData.id);
      } else {
        result = await supabase
          .from('nao_obrigatoriedades')
          .insert([{ ...payload, created_at: new Date().toISOString() }]);
      }

      if (result.error) throw result.error;

      toast.success(isConcluido ? "Parecer concluído com sucesso!" : "Rascunho salvo com sucesso!", {
        description: isConcluido ? "O documento foi finalizado e registrado." : "Seus dados foram armazenados com segurança.",
        icon: isConcluido ? <CheckCircle className="text-emerald-500" size={16} /> : <Save className="text-emerald-500" size={16} />
      });

      await refreshData();

      if (isConcluido) {
        setFormData(prev => ({
          ...prev,
          entrepreneurSystem: { ...prev.entrepreneurSystem, status: 'concluido' }
        }));
      }
    } catch (error) {
      console.error('Error saving:', error);
      toast.error("Erro ao salvar dados no banco de dados");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDraft = () => handleSave(false);
  const handleComplete = () => handleSave(true);

  const exportToDocx = async () => {
    try {
      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "GOVERNO DO ESTADO DE MATO GROSSO", bold: true, size: 24 }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "SECRETARIA DE ESTADO DE MEIO AMBIENTE", bold: true, size: 24 }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "SECRETARIA ADJUNTA DE LICENCIAMENTO AMBIENTAL E RECURSOS HÍDRICOS", bold: true, size: 20 }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "SUPERINTENDÊNCIA DE RECURSOS HÍDRICOS", bold: true, size: 24 }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "COORDENADORIA DE SEGURANÇA DE BARRAGENS", bold: true, size: 24 }),
              ],
            }),
            new Paragraph({ spacing: { before: 400, after: 400 } }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "NÃO OBRIGATORIEDADE - CBS/SURH/SEMA-MT", bold: true, size: 28 }),
              ],
            }),
            new Paragraph({ spacing: { before: 400, after: 400 } }),
            new Paragraph({
              children: [
                new TextRun({ text: `Assunto: Análise referente ao pedido de ¨não obrigatoriedade¨ de classificação da segurança de barragem existente`, bold: true, italics: true, size: 24 }),
              ],
            }),
            new Paragraph({ spacing: { before: 400, after: 400 } }),
            new Paragraph({
              children: [
                new TextRun({ text: "1. INTRODUÇÃO", bold: true, size: 28 }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              children: [
                new TextRun({ 
                  text: `Este Parecer expõe os resultados da análise referente ao pedido da ¨não obrigatoriedade¨ de classificação quanto à segurança da barragem existente. Este documento encontra embasamento na análise dos documentos disponibilizados nos autos, com seus projetos e estudos realizados pelo responsável técnico ${rtText || '________________'}, mediado pela ART ${artTextLong || '________________'}, contendo em referência à análise documental:`,
                  size: 24 
                }),
              ],
            }),
            ...reportDocs.map(docText => new Paragraph({
              bullet: { level: 0 },
              children: [new TextRun({ text: docText, size: 24 })],
            })),
            new Paragraph({ spacing: { before: 200 } }),
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              children: [
                new TextRun({ 
                  text: "O presente documento fundamenta-se na avaliação dos materiais apresentados nos autos, cujas características principais do pedido estão sintetizadas no quadro abaixo.",
                  size: 24 
                }),
              ],
            }),
            new Paragraph({ spacing: { before: 400 } }),
            new Paragraph({
              children: [
                new TextRun({ text: "Quadro 1: Características gerais do pedido da barragem.", bold: true, size: 20, smallCaps: true }),
              ],
            }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Empreendedor:", bold: true, size: 20 })] })], width: { size: 30, type: WidthType.PERCENTAGE } }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: formData.orderInfo.empreendedor.toUpperCase(), size: 20 })] })] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "CPF/CNPJ:", bold: true, size: 20 })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: formData.orderInfo.cpfCnpj, size: 20 })] })] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Localização:", bold: true, size: 20 })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: formData.orderInfo.localizacao, size: 20, italics: true })] })] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Nº CAR:", bold: true, size: 20 })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: formData.orderInfo.numCar, size: 20 })] })] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Município/UF:", bold: true, size: 20 })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: municipalityText, size: 20 })] })] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Finalidade:", bold: true, size: 20 })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: formData.orderInfo.finalidade === 'Outro' ? formData.orderInfo.finalidadeOther : formData.orderInfo.finalidade, size: 20 })] })] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Situação:", bold: true, size: 20 })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: formData.orderInfo.situacao === 'Outro' ? formData.orderInfo.situacaoOther : formData.orderInfo.situacao, size: 20 })] })] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Curso d’água:", bold: true, size: 20 })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: formData.orderInfo.cursoAgua, size: 20 })] })] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Sub-bacia:", bold: true, size: 20 })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: formData.orderInfo.subBacia, size: 20 })] })] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Analista:", bold: true, size: 20 })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: analystName.toUpperCase(), size: 20 })] })] }),
                  ],
                }),
              ],
            }),
            new Paragraph({ spacing: { before: 400 } }),
            new Paragraph({
              children: [
                new TextRun({ text: "2. PARECER", bold: true, size: 28 }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              children: [
                new TextRun({ 
                  text: "Em consonância com a Instrução Normativa nº 08, de 18 de dezembro de 2023, que dispõe sobre os procedimentos referentes à classificação quanto à segurança de barragens de usos múltiplos em corpos de dominialidade do Estado de Mato Grosso, especialmente em seu Art. 24, as barragens objeto deste processo não atendem aos requisitos mínimos exigidos – descritos nos itens I a IV do artigo citado - que a desobriga de requerer a classificação nesta Coordenadoria de Segurança de Barragens – CSB, vide documentação trazida nos autos e demonstradas no Quadro 1.",
                  size: 24 
                }),
              ],
            }),
            new Paragraph({ spacing: { before: 200 } }),
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              children: [
                new TextRun({ 
                  text: "Em conclusão à análise, tem-se que, em suas condições atuais, as barragens não se encontram obrigadas a requerer a classificação, tampouco se encontram enquadradas na Política Nacional de Segurança de Barragens (PNSB), regida pela Lei Federal nº 12.334, de 20 de setembro de 2010.",
                  size: 24 
                }),
              ],
            }),
            new Paragraph({ spacing: { before: 200 } }),
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              children: [
                new TextRun({ 
                  text: "Cumpre citar que é responsabilidade do empreendedor comunicar ao fiscalizador sobre qualquer alteração na sua barragem, especialmente eventual situação que implique em reclassificação, conforme versa o texto do art. 8º da Instrução Normativa citada. Ainda, é responsabilidade do empreendedor a gestão de segurança da barragem e reparação de danos decorrentes de seu rompimento, independentemente da existência de culpa.",
                  size: 24,
                  bold: true
                }),
              ],
            }),
            new Paragraph({ spacing: { before: 800 } }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "_______________________________________", size: 24 }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: analystName.toUpperCase(), bold: true, size: 24 }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "Analista de Meio Ambiente", size: 20 }),
              ],
            }),
          ],
        }],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `Parecer_Nao_Obrigatoriedade_${formData.orderInfo.processo || 'Sema'}.docx`);
      await logActivity('DOWNLOAD_DOCUMENT', { type: 'Não Obrigatoriedade', doc: formData.orderInfo.processo, interessado: formData.orderInfo.empreendedor });
      toast.success("Documento exportado com sucesso!");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao exportar o documento.");
    }
  };

  const getSelectedDocs = (isReport: boolean = false) => {
    const docs: string[] = [];
    
    if (!isReport) {
      // Checklist from step 1
      if (formData.introduction.checklist.item1) {
        const obs = formData.introduction.checklistObs?.item1;
        docs.push(`I - Altura inferior a 15 metros${obs ? ` (Obs: ${obs})` : ''}`);
      }
      if (formData.introduction.checklist.item2) {
        const obs = formData.introduction.checklistObs?.item2;
        docs.push(`II - Volume inferior a 3.000.000m³${obs ? ` (Obs: ${obs})` : ''}`);
      }
      if (formData.introduction.checklist.item3) {
        const obs = formData.introduction.checklistObs?.item3;
        docs.push(`III - Não armazena resíduos perigosos${obs ? ` (Obs: ${obs})` : ''}`);
      }
      if (formData.introduction.checklist.item4) {
        const obs = formData.introduction.checklistObs?.item4;
        docs.push(`IV - Dano Potencial Associado Baixo (ou inexistente)${obs ? ` (Obs: ${obs})` : ''}`);
      }
    }

    // Other sections
    formData.introduction.docsGerais.forEach(d => {
      const folha = formData.introduction.docsGeraisFolhas[d];
      const obs = formData.introduction.docsGeraisObs?.[d];
      docs.push(`${d === 'OUTRO' ? formData.introduction.docsGeraisOther : d}${folha ? ` (Fl. ${folha})` : ''}${obs ? ` (Obs: ${obs})` : ''}`);
    });

    formData.introduction.respTecnico.forEach(d => {
      const folha = formData.introduction.respTecnicoFolhas[d];
      const obs = formData.introduction.respTecnicoObs?.[d];
      docs.push(`${d === 'OUTRO' ? formData.introduction.respTecnicoOther : d}${folha ? ` (Fl. ${folha})` : ''}${obs ? ` (Obs: ${obs})` : ''}`);
    });

    if (formData.introduction.espolioActive) {
      formData.introduction.espolio.forEach(d => {
        const folha = formData.introduction.espolioFolhas[d];
        const obs = formData.introduction.espolioObs?.[d];
        docs.push(`${d === 'OUTRO' ? formData.introduction.espolioOther : d}${folha ? ` (Fl. ${folha})` : ''}${obs ? ` (Obs: ${obs})` : ''}`);
      });
    }

    formData.introduction.artAtividades.forEach(a => {
       docs.push(`ART nº ${a.artNum} - ${a.atividade === 'OUTRO' ? a.atividadeOther : a.atividade}${a.folha ? ` (Fl. ${a.folha})` : ''}`);
    });

    formData.introduction.docsTecnicos.forEach(d => {
      const folha = formData.introduction.docsTecnicosFolhas[d];
      const obs = formData.introduction.docsTecnicosObs?.[d];
      docs.push(`${d === 'OUTRO' ? formData.introduction.docsTecnicosOther : d}${folha ? ` (Fl. ${folha})` : ''}${obs ? ` (Obs: ${obs})` : ''}`);
    });

    return docs;
  };

  const allDocs = getSelectedDocs(false);
  const reportDocs = getSelectedDocs(true);

  const renderDamTable = (dam: any, title: string) => (
    <div key={dam.id} className="mt-6 border border-slate-300">
       <div className="bg-slate-100 p-2 font-black text-xs text-center border-b border-slate-300 uppercase">{title}</div>
       <table className="w-full text-left text-[10px] border-collapse">
          <tbody>
            <tr className="border-b border-slate-200">
              <td className="p-2 font-bold bg-slate-50 w-1/3 border-r border-slate-200">Nome da barragem:</td>
              <td className="p-2">{dam.nome}</td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="p-2 font-bold bg-slate-50 border-r border-slate-200">Coordenadas do eixo do barramento:</td>
              <td className="p-2">Lat: {dam.lat} / Long: {dam.long}</td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="p-2 font-bold bg-slate-50 border-r border-slate-200">Dano Potencial Associado (DPA)*:</td>
              <td className="p-2">Baixo</td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="p-2 font-bold bg-slate-50 border-r border-slate-200">Altura do maciço (m):</td>
              <td className="p-2">{dam.altura}</td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="p-2 font-bold bg-slate-50 border-r border-slate-200">Área inundada (NMM) (m²)/(ha):</td>
              <td className="p-2">{dam.areaInundada}</td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="p-2 font-bold bg-slate-50 border-r border-slate-200">Volume armazenado (NNM)(m³)/(hm³):</td>
              <td className="p-2">{dam.volume}</td>
            </tr>
            <tr>
              <td className="p-2 font-bold bg-slate-50 border-r border-slate-200">Área da bacia de contribuição (km²)*:</td>
              <td className="p-2">{dam.areaBacia}</td>
            </tr>
          </tbody>
       </table>
    </div>
  );

  const renderDamForm = (dam: any, index: number | null = null) => {
    const isPrincipal = index === null;
    
    const updateField = (field: string, value: string) => {
      if (isPrincipal) {
        setFormData({
          ...formData,
          damInfo: {
            ...formData.damInfo,
            principal: { ...formData.damInfo.principal, [field]: value }
          }
        });
      } else {
        const newList = [...formData.damInfo.upstreamDams];
        (newList[index as number] as any)[field] = value;
        setFormData({
          ...formData,
          damInfo: { ...formData.damInfo, upstreamDams: newList }
        });
      }
    };

    const formatGMS = (val: string, type: 'lat' | 'long') => {
      let digits = val.replace(/\D/g, '');
      if (digits.length > 8) digits = digits.slice(0, 8);
      let formatted = '';
      if (digits.length > 0) {
        formatted += digits.slice(0, 2) + '°';
        if (digits.length > 2) {
          formatted += digits.slice(2, 4) + '’';
          if (digits.length > 4) {
            formatted += digits.slice(4, 6);
            if (digits.length > 6) {
              formatted += ',' + digits.slice(6, 8);
            }
            formatted += '¨';
          }
        }
      }
      if (formatted) formatted += type === 'lat' ? 'S' : 'O';
      return formatted;
    };

    return (
      <div className={`space-y-6 ${!isPrincipal ? 'bg-slate-50/50 p-6 rounded-3xl border border-slate-200 mt-8 relative' : ''}`}>
        {!isPrincipal && (
          <button 
            type="button"
            onClick={() => {
              if (window.confirm("Deseja realmente remover esta barragem a montante?")) {
                const newList = formData.damInfo.upstreamDams.filter((_, i) => i !== index);
                setFormData({...formData, damInfo: {...formData.damInfo, upstreamDams: newList}});
              }
            }}
            className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-500 rounded-lg text-[10px] font-black uppercase hover:bg-red-100 transition-all border border-red-100 cursor-pointer shadow-sm hover:shadow-md"
          >
            <Trash2 size={14} />
            Remover Barragem
          </button>
        )}
        
        <div className="flex items-center gap-3 border-b border-slate-100 pb-2">
          <Database className="text-emerald-500" size={18} />
          <h4 className="text-sm font-black text-slate-700 uppercase tracking-widest">
            {isPrincipal ? 'Barragem Principal' : `Barragem a Montante #${(index as number) + 1}`}
          </h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2 md:col-span-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nome da Barragem</label>
            <input 
              type="text" 
              placeholder="Nome do Barramento"
              value={dam.nome}
              onChange={(e) => updateField('nome', e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium" 
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Lat (Sirgas 2000 GMS)</label>
            <input 
              type="text" 
              placeholder="Ex: 15°10’41,12¨S"
              value={dam.lat}
              onChange={(e) => updateField('lat', formatGMS(e.target.value, 'lat') || e.target.value)}
              className="w-full px-5 py-3.5 bg-white border border-slate-300 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none font-bold text-slate-800 transition-all placeholder:text-slate-300" 
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Long (Sirgas 2000 GMS)</label>
            <input 
              type="text" 
              placeholder="Ex: 54°13’56,12¨O"
              value={dam.long}
              onChange={(e) => updateField('long', formatGMS(e.target.value, 'long') || e.target.value)}
              className="w-full px-5 py-3.5 bg-white border border-slate-300 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none font-bold text-slate-800 transition-all placeholder:text-slate-300" 
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Altura máxima projetada (m)</label>
            <div className="flex gap-3">
              <input 
                type="number" 
                step="0.01"
                placeholder="Altura Máxima"
                value={dam.altura}
                onChange={(e) => updateField('altura', e.target.value)}
                className="flex-1 px-5 py-3.5 bg-white border border-slate-300 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none font-bold text-slate-800 transition-all placeholder:text-slate-300" 
              />
              <input 
                type="text" 
                placeholder="Folha"
                value={dam.alturaFolha}
                onChange={(e) => updateField('alturaFolha', e.target.value)}
                className="w-20 px-4 py-3.5 bg-slate-100 border border-slate-200 rounded-2xl text-center focus:ring-2 focus:ring-emerald-500 outline-none font-black text-[10px] uppercase text-slate-500" 
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Borda livre (m)</label>
            <input 
              type="number" 
              step="0.01"
              placeholder="Borda Livre"
              value={dam.bordaLivre}
              onChange={(e) => updateField('bordaLivre', e.target.value)}
              className="w-full px-5 py-3.5 bg-white border border-slate-300 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none font-bold text-slate-800 transition-all placeholder:text-slate-300" 
            />
          </div>
          <div className="md:col-span-2 p-6 bg-emerald-50/50 rounded-3xl border border-emerald-100/50 space-y-4">
            <h5 className="text-[11px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2">
              <Cloud size={14} /> Reservatório
            </h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Área inundada (NMM) (m²)/(ha)</label>
                <input 
                  type="number" 
                  step="0.01"
                  value={dam.areaInundada}
                  onChange={(e) => updateField('areaInundada', e.target.value)}
                  className="w-full px-4 py-2 bg-white border border-emerald-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Volume armazenado (NMM)(m³)/(hm³)</label>
                <input 
                  type="number" 
                  step="0.01"
                  value={dam.volume}
                  onChange={(e) => updateField('volume', e.target.value)}
                  className="w-full px-4 py-2 bg-white border border-emerald-100 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium" 
                />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Vazão máxima de projeto (m³/s) /TR</label>
            <input 
              type="number" 
              step="0.01"
              value={dam.vazaoMax}
              onChange={(e) => updateField('vazaoMax', e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium" 
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Área da bacia de contribuição (km²)*</label>
            <input 
              type="number" 
              step="0.01"
              value={dam.areaBacia}
              onChange={(e) => updateField('areaBacia', e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium" 
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Segurança Estrutural</label>
            <textarea 
              rows={3}
              value={dam.segurancaEstrutural}
              onChange={(e) => updateField('segurancaEstrutural', e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium resize-none" 
              placeholder="Inserção manual..."
            />
          </div>
        </div>
      </div>
    );
  };

  const introductionContent = (
    <div className="space-y-10 text-slate-800">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <Layout size={14} className="text-emerald-500" />
                  Data de Recebimento
                </label>
                <div className="relative">
                  <input 
                    type="date" 
                    value={formData.introduction.receiptDate}
                    onChange={(e) => setFormData({...formData, introduction: {...formData.introduction, receiptDate: e.target.value}})}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all font-medium pr-10" 
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Tipo de Classificação</label>
                <input 
                  type="text" 
                  value="Não Obrigatoriedade" 
                  disabled 
                  className="w-full px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 font-bold"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Tipo de Barragem</label>
                <select 
                  value={formData.introduction.damType}
                  onChange={(e) => setFormData({...formData, introduction: {...formData.introduction, damType: e.target.value}})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium appearance-none"
                >
                  <option value="">Selecione...</option>
                  <option value="barragem de terra">Barragem de terra</option>
                  <option value="barragem tipo reservatório pulmão">Barragem tipo reservatório pulmão</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Situação</label>
                <select 
                  value={formData.introduction.situation}
                  onChange={(e) => setFormData({...formData, introduction: {...formData.introduction, situation: e.target.value}})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium"
                >
                  <option value="">Selecione...</option>
                  <option value="Planejamento">Planejamento</option>
                  <option value="Projeto">Projeto</option>
                  <option value="Construção">Construção</option>
                  <option value="Primeiro Enchimento">Primeiro Enchimento</option>
                  <option value="Operação">Operação</option>
                  <option value="Descomissionamento">Descomissionamento</option>
                  <option value="Desativada">Desativada</option>
                  <option value="Rompida">Rompida</option>
                  <option value="Descaracterizada">Descaracterizada</option>
                  <option value="Sem informação">Sem informação</option>
                  <option value="OUTRO">OUTRO</option>
                </select>
                {formData.introduction.situation === 'OUTRO' && (
                  <input 
                    type="text" 
                    placeholder="Especifique a situação..."
                    value={formData.introduction.situationOther}
                    onChange={(e) => setFormData({...formData, introduction: {...formData.introduction, situationOther: e.target.value}})}
                    className="mt-2 w-full px-4 py-3 bg-white border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium animate-in fade-in slide-in-from-top-1"
                  />
                )}
              </div>
            

            <div className="bg-slate-900 rounded-3xl p-8 text-white shadow-2xl shadow-slate-900/20">
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-emerald-500 p-2 rounded-lg">
                  <CheckCircle size={20} className="text-white" />
                </div>
                <div>
                  <h4 className="font-black text-sm uppercase tracking-widest text-emerald-400">Checklist</h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Resolução CNRH nº 241/2024</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { id: 'item1', label: 'I - Altura inferior a 15 metros' },
                  { id: 'item2', label: 'II - Volume inferior a 3.000.000m³' },
                  { id: 'item3', label: 'III - Não armazena resíduos perigosos' },
                  { id: 'item4', label: 'IV - Dano Potencial Associado Baixo (ou inexistente)' },
                ].map((item) => (
                  <div key={item.id} className="space-y-3">
                    <label className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all cursor-pointer group">
                      <input 
                        type="checkbox" 
                        className="w-5 h-5 rounded-md border-white/20 bg-transparent text-emerald-500 focus:ring-emerald-500"
                        checked={formData.introduction.checklist[item.id as keyof typeof formData.introduction.checklist]}
                        onChange={(e) => setFormData({
                          ...formData, 
                          introduction: {
                            ...formData.introduction, 
                            checklist: {...formData.introduction.checklist, [item.id]: e.target.checked}
                          }
                        })}
                      />
                      <span className="text-xs font-bold text-slate-200 group-hover:text-white transition-colors">{item.label}</span>
                    </label>
                    {formData.introduction.checklist[item.id as keyof typeof formData.introduction.checklist] && (
                      <textarea
                        placeholder="Observação (opcional)..."
                        value={formData.introduction.checklistObs?.[item.id as keyof typeof formData.introduction.checklistObs] || ''}
                        onChange={(e) => setFormData({
                          ...formData,
                          introduction: {
                            ...formData.introduction,
                            checklistObs: {...formData.introduction.checklistObs, [item.id]: e.target.value}
                          }
                        })}
                        className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-white outline-none focus:ring-2 focus:ring-emerald-500 h-20 resize-none animate-in fade-in slide-in-from-top-1"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-4">
                <FileText className="text-emerald-500" />
                <h4 className="text-lg font-black text-slate-800 uppercase tracking-tight">Documentação Apresentada</h4>
              </div>

              {/* Documentos Gerais */}
              <ChecklistSection 
                title="Documentos Gerais" 
                badge="Identificação Básica e Outorgas"
                icon={FileText}
              >
                <div className="grid grid-cols-1 gap-3">
                  {[
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
                  ].map((doc) => (
                    <div key={doc} className="space-y-3">
                      <div className="flex flex-col md:flex-row md:items-center gap-4 bg-white p-4 rounded-2xl hover:bg-slate-100/80 transition-colors border border-slate-200/50">
                        <label className="flex-1 flex items-center gap-3 cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="w-5 h-5 rounded-md border-slate-300 text-emerald-500 focus:ring-emerald-500"
                            checked={formData.introduction.docsGerais.includes(doc)}
                            onChange={() => handleDocToggle('docsGerais', doc)}
                          />
                          <span className="text-xs font-bold text-slate-700">{doc}</span>
                        </label>
                        {formData.introduction.docsGerais.includes(doc) && doc !== 'OUTRO' && (
                          <div className="flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-200">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black text-slate-400 uppercase">Folha</span>
                              <input 
                                type="text" 
                                placeholder="Ex: 172"
                                value={formData.introduction.docsGeraisFolhas[doc] || ''}
                                onChange={(e) => setFormData({
                                  ...formData,
                                  introduction: {
                                    ...formData.introduction,
                                    docsGeraisFolhas: {...formData.introduction.docsGeraisFolhas, [doc]: e.target.value}
                                  }
                                })}
                                className="w-24 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500" 
                              />
                            </div>
                            <textarea
                              placeholder="Observação (opcional)..."
                              value={formData.introduction.docsGeraisObs?.[doc] || ''}
                              onChange={(e) => setFormData({
                                ...formData,
                                introduction: {
                                  ...formData.introduction,
                                  docsGeraisObs: {...formData.introduction.docsGeraisObs, [doc]: e.target.value}
                                }
                              })}
                              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500 h-16 resize-none"
                            />
                          </div>
                        )}
                      </div>
                      {doc === 'OUTRO' && formData.introduction.docsGerais.includes('OUTRO') && (
                        <div className="flex flex-col gap-4 p-4 bg-emerald-50 rounded-2xl border border-emerald-100 animate-in slide-in-from-top-2">
                           <div className="flex flex-col md:flex-row gap-4">
                             <input 
                                type="text" 
                                placeholder="Descreva o documento..."
                                value={formData.introduction.docsGeraisOther}
                                onChange={(e) => setFormData({...formData, introduction: {...formData.introduction, docsGeraisOther: e.target.value}})}
                                className="flex-1 px-4 py-2 bg-white border border-emerald-200 rounded-xl text-xs font-bold outline-none" 
                             />
                             <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black text-emerald-400 uppercase">Folha</span>
                              <input 
                                type="text" 
                                placeholder="Ex: 172"
                                value={formData.introduction.docsGeraisFolhas['OUTRO'] || ''}
                                onChange={(e) => setFormData({
                                  ...formData,
                                  introduction: {
                                    ...formData.introduction,
                                    docsGeraisFolhas: {...formData.introduction.docsGeraisFolhas, 'OUTRO': e.target.value}
                                  }
                                })}
                                className="w-24 px-3 py-1.5 bg-white border border-emerald-200 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500" 
                              />
                            </div>
                          </div>
                          <textarea
                            placeholder="Observação (opcional)..."
                            value={formData.introduction.docsGeraisObs?.['OUTRO'] || ''}
                            onChange={(e) => setFormData({
                              ...formData,
                              introduction: {
                                ...formData.introduction,
                                docsGeraisObs: {...formData.introduction.docsGeraisObs, 'OUTRO': e.target.value}
                              }
                            })}
                            className="w-full px-4 py-2 bg-white border border-emerald-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500 h-16 resize-none"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ChecklistSection>

              {/* Responsável Técnico */}
              <ChecklistSection 
                title="Identificação do Responsável Técnico" 
                badge="Documentos do Profissional"
                icon={Layout}
              >
                <div className="grid grid-cols-1 gap-3">
                  {[
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
                  ].map((doc) => (
                    <div key={doc} className="space-y-3">
                      <div className="flex flex-col gap-3 bg-white p-4 rounded-2xl hover:bg-slate-100/80 transition-colors border border-slate-200/50">
                        <div className="flex flex-col md:flex-row md:items-center gap-4">
                          <label className="flex-1 flex items-center gap-3 cursor-pointer">
                            <input 
                              type="checkbox" 
                              className="w-5 h-5 rounded-md border-slate-300 text-emerald-500 focus:ring-emerald-500"
                              checked={formData.introduction.respTecnico.includes(doc)}
                              onChange={() => handleDocToggle('respTecnico', doc)}
                            />
                            <span className="text-xs font-bold text-slate-700">{doc}</span>
                          </label>
                          {formData.introduction.respTecnico.includes(doc) && (
                            <div className="flex flex-col gap-3">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-slate-400 uppercase">Folha</span>
                                <input 
                                  type="text" 
                                  placeholder="Ex: 172"
                                  value={formData.introduction.respTecnicoFolhas[doc] || ''}
                                  onChange={(e) => setFormData({
                                    ...formData,
                                    introduction: {
                                      ...formData.introduction,
                                      respTecnicoFolhas: {...formData.introduction.respTecnicoFolhas, [doc]: e.target.value}
                                    }
                                  })}
                                  className="w-24 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500" 
                                />
                              </div>
                              <textarea
                                placeholder="Observação (opcional)..."
                                value={formData.introduction.respTecnicoObs?.[doc] || ''}
                                onChange={(e) => setFormData({
                                  ...formData,
                                  introduction: {
                                    ...formData.introduction,
                                    respTecnicoObs: {...formData.introduction.respTecnicoObs, [doc]: e.target.value}
                                  }
                                })}
                                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500 h-16 resize-none"
                              />
                            </div>
                          )}
                        </div>
                        {formData.introduction.respTecnico.includes(doc) && doc !== 'OUTRO' && (
                          <div className="pl-8 animate-in fade-in slide-in-from-left-2">
                             <input 
                                type="text" 
                                placeholder="Informe o nome..."
                                value={formData.introduction.respTecnicoNomes[doc] || ''}
                                onChange={(e) => setFormData({
                                  ...formData,
                                  introduction: {
                                    ...formData.introduction,
                                    respTecnicoNomes: {...formData.introduction.respTecnicoNomes, [doc]: e.target.value}
                                  }
                                })}
                                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500" 
                             />
                          </div>
                        )}
                      </div>
                      {doc === 'OUTRO' && formData.introduction.respTecnico.includes('OUTRO') && (
                        <div className="flex flex-col gap-4 p-4 bg-emerald-50 rounded-2xl border border-emerald-100 animate-in slide-in-from-top-2">
                           <input 
                              type="text" 
                              placeholder="Descreva o documento..."
                              value={formData.introduction.respTecnicoOther}
                              onChange={(e) => setFormData({...formData, introduction: {...formData.introduction, respTecnicoOther: e.target.value}})}
                              className="flex-1 px-4 py-2 bg-white border border-emerald-200 rounded-xl text-xs font-bold outline-none" 
                           />
                           <textarea
                             placeholder="Observação (opcional)..."
                             value={formData.introduction.respTecnicoObs?.['OUTRO'] || ''}
                             onChange={(e) => setFormData({
                               ...formData,
                               introduction: {
                                 ...formData.introduction,
                                 respTecnicoObs: {...formData.introduction.respTecnicoObs, 'OUTRO': e.target.value}
                               }
                             })}
                             className="w-full px-4 py-2 bg-white border border-emerald-200 rounded-xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-emerald-500 h-16 resize-none"
                           />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ChecklistSection>

              {/* Espólio */}
              <ChecklistSection 
                title="Solicitante falecido - Espólio" 
                badge="Documentação para Inventariantes"
                icon={Database}
              >
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-4">
                    <div className={`w-3 h-3 rounded-full ${formData.introduction.espolioActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">A barragem pertence a um espólio?</span>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setFormData({
                      ...formData, 
                      introduction: {...formData.introduction, espolioActive: !formData.introduction.espolioActive}
                    })}
                    className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${formData.introduction.espolioActive ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-slate-100 text-slate-400'}`}
                  >
                    {formData.introduction.espolioActive ? 'Sim, Ativo' : 'Não, Inative'}
                  </button>
                </div>

                {formData.introduction.espolioActive ? (
                  <div className="space-y-3 animate-in fade-in zoom-in-95">
                    {[
                      "Cópia da Certidão de óbito",
                      "Cópia do Termo de inventariante do representante do espólio",
                      "Protocolo de inventário extrajudicial no cartório",
                      "Anuência de todos os herdeiros declarados na certidão de óbito",
                      "Documentos do representante do espólio (inventariante)",
                      "Documentos de todos os herdeiros: cópia do RG; CPF e cópia do comprovante de endereço",
                      "OUTRO"
                    ].map((doc) => (
                      <div key={doc} className="space-y-3">
                        <div className="flex flex-col gap-3 bg-white p-4 rounded-2xl border border-slate-200">
                          <div className="flex flex-col md:flex-row md:items-center gap-4">
                            <label className="flex-1 flex items-center gap-3 cursor-pointer">
                              <input 
                                type="checkbox" 
                                className="w-5 h-5 rounded-md border-slate-300 text-emerald-500 focus:ring-emerald-500"
                                checked={formData.introduction.espolio.includes(doc)}
                                onChange={() => handleDocToggle('espolio', doc)}
                              />
                              <span className="text-xs font-bold text-slate-700">{doc}</span>
                            </label>
                            {formData.introduction.espolio.includes(doc) && (
                              <div className="flex flex-col gap-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Folha</span>
                                  <input 
                                    type="text" 
                                    placeholder="Ex: 167 Fls"
                                    value={formData.introduction.espolioFolhas[doc] || ''}
                                    onChange={(e) => setFormData({
                                      ...formData,
                                      introduction: {
                                        ...formData.introduction,
                                        espolioFolhas: {...formData.introduction.espolioFolhas, [doc]: e.target.value}
                                      }
                                    })}
                                    className="w-24 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500" 
                                  />
                                </div>
                                <textarea
                                  placeholder="Observação (opcional)..."
                                  value={formData.introduction.espolioObs?.[doc] || ''}
                                  onChange={(e) => setFormData({
                                    ...formData,
                                    introduction: {
                                      ...formData.introduction,
                                      espolioObs: {...formData.introduction.espolioObs, [doc]: e.target.value}
                                    }
                                  })}
                                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500 h-16 resize-none"
                                />
                              </div>
                            )}
                          </div>
                          {formData.introduction.espolio.includes(doc) && doc !== 'OUTRO' && doc !== 'Protocolo de inventário extrajudicial no cartório' && doc !== 'Anuência de todos os herdeiros declarados na certidão de óbito' && doc !== 'Documentos do representante do espólio (inventariante)' && (
                            <div className="pl-8">
                               <input 
                                  type="text" 
                                  placeholder={doc.includes('herdeiros') ? "Inserir vários nomes..." : "Inserir nome..."}
                                  value={formData.introduction.espolioNomes[doc] || ''}
                                  onChange={(e) => setFormData({
                                    ...formData,
                                    introduction: {
                                      ...formData.introduction,
                                      espolioNomes: {...formData.introduction.espolioNomes, [doc]: e.target.value}
                                    }
                                  })}
                                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none" 
                               />
                            </div>
                          )}
                        </div>
                        {doc === 'OUTRO' && formData.introduction.espolio.includes('OUTRO') && (
                          <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 animate-in slide-in-from-top-2">
                             <input 
                                type="text" 
                                placeholder="Descreva o documento..."
                                value={formData.introduction.espolioOther}
                                onChange={(e) => setFormData({...formData, introduction: {...formData.introduction, espolioOther: e.target.value}})}
                                className="w-full px-4 py-2 bg-white border border-emerald-200 rounded-xl text-xs font-bold outline-none" 
                             />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <Info size={24} className="mx-auto mb-2 opacity-50" />
                    <p className="text-xs font-bold uppercase tracking-widest">Documentação não necessária</p>
                  </div>
                )}
              </ChecklistSection>

              {/* Atividades Técnicas ART */}
              <div className="space-y-4 py-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h5 className="text-xs font-black text-slate-400 uppercase tracking-widest">Atividades Técnicas das ART</h5>
                  <button 
                    type="button"
                    onClick={() => {
                      const newId = Math.random().toString(36).substr(2, 9);
                      setFormData({
                        ...formData,
                        introduction: {
                          ...formData.introduction,
                          artAtividades: [...formData.introduction.artAtividades, { id: newId, artNum: '', atividade: '', atividadeOther: '', folha: '' }]
                        }
                      });
                    }}
                    className="flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-black uppercase hover:bg-emerald-100 transition-colors border-none cursor-pointer"
                  >
                    <Plus size={12} />
                    Adicionar ART
                  </button>
                </div>
                
                <div className="space-y-4">
                  {formData.introduction.artAtividades.map((art, index) => (
                    <div key={art.id} className="p-6 bg-white rounded-3xl border border-slate-200 shadow-sm space-y-4 animate-in fade-in slide-in-from-top-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-400 uppercase">ART #{index + 1}</span>
                        <button 
                          type="button"
                          onClick={() => setFormData({
                            ...formData,
                            introduction: {
                              ...formData.introduction,
                              artAtividades: formData.introduction.artAtividades.filter(a => a.id !== art.id)
                            }
                          })}
                          className="text-slate-400 hover:text-red-500 transition-colors border-none bg-transparent cursor-pointer"
                        >
                          <Plus className="rotate-45" size={18} />
                        </button>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">ART nº</label>
                          <input 
                            type="text"
                            placeholder="Apenas números..."
                            value={art.artNum}
                            onChange={(e) => {
                              const value = e.target.value.replace(/\D/g, '');
                              const newList = [...formData.introduction.artAtividades];
                              newList[index].artNum = value;
                              setFormData({...formData, introduction: {...formData.introduction, artAtividades: newList}});
                            }}
                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Folha</label>
                          <input 
                            type="text"
                            placeholder="Ex: 167 Fls"
                            value={art.folha}
                            onChange={(e) => {
                              const newList = [...formData.introduction.artAtividades];
                              newList[index].folha = e.target.value;
                              setFormData({...formData, introduction: {...formData.introduction, artAtividades: newList}});
                            }}
                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Atividade Técnica</label>
                        <select
                          value={art.atividade}
                          onChange={(e) => {
                            const newList = [...formData.introduction.artAtividades];
                            newList[index].atividade = e.target.value;
                            setFormData({...formData, introduction: {...formData.introduction, artAtividades: newList}});
                          }}
                          className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value="">Selecione...</option>
                          <option value="hidrológicos">Hidrológicos</option>
                          <option value="projeto básico da barragem">Projeto básico da barragem</option>
                          <option value="levantamentos planialtimétrico">Levantamentos planialtimétrico</option>
                          <option value="projeto de levantamento batimétrico">Projeto de levantamento batimétrico</option>
                          <option value="execução da barragem de terra">Execução da barragem de terra</option>
                          <option value="OUTRO">OUTRO</option>
                        </select>
                        {art.atividade === 'OUTRO' && (
                          <input 
                            type="text"
                            placeholder="Especifique a atividade..."
                            value={art.atividadeOther}
                            onChange={(e) => {
                              const newList = [...formData.introduction.artAtividades];
                              newList[index].atividadeOther = e.target.value;
                              setFormData({...formData, introduction: {...formData.introduction, artAtividades: newList}});
                            }}
                            className="mt-2 w-full px-4 py-2 bg-white border border-emerald-200 rounded-xl text-xs font-bold outline-none animate-in slide-in-from-top-1"
                          />
                        )}
                      </div>
                    </div>
                  ))}
                  {formData.introduction.artAtividades.length === 0 && (
                    <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-8 flex flex-col items-center justify-center text-slate-400">
                      <Plus className="mb-2" />
                      <span className="text-xs font-bold uppercase tracking-widest">Nenhuma ART adicionada</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Documentos Técnicos */}
              <ChecklistSection 
                title="Documentos Técnicos" 
                badge="Projetos, Memoriais e Planos"
                icon={Database}
              >
                <div className="grid grid-cols-1 gap-3">
                  {[
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
                  ].map((doc) => (
                    <div key={doc} className="space-y-3">
                      <div className="flex flex-col gap-3 bg-white p-4 rounded-2xl hover:bg-slate-100/80 transition-colors border border-slate-200/50">
                        <div className="flex flex-col md:flex-row md:items-center gap-4">
                          <label className="flex-1 flex items-center gap-3 cursor-pointer">
                            <input 
                              type="checkbox" 
                              className="w-5 h-5 rounded-md border-slate-300 text-emerald-500 focus:ring-emerald-500"
                              checked={formData.introduction.docsTecnicos.includes(doc)}
                              onChange={() => handleDocToggle('docsTecnicos', doc)}
                            />
                            <span className="text-xs font-bold text-slate-700">{doc}</span>
                          </label>
                          {formData.introduction.docsTecnicos.includes(doc) && (
                            <div className="flex flex-col gap-3">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-slate-400 uppercase">Folha</span>
                                <input 
                                  type="text" 
                                  placeholder="Ex: 167 Fls"
                                  value={formData.introduction.docsTecnicosFolhas[doc] || ''}
                                  onChange={(e) => setFormData({
                                    ...formData,
                                    introduction: {
                                      ...formData.introduction,
                                      docsTecnicosFolhas: {...formData.introduction.docsTecnicosFolhas, [doc]: e.target.value}
                                    }
                                  })}
                                  className="w-24 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500" 
                                />
                              </div>
                              <textarea
                                placeholder="Observação (opcional)..."
                                value={formData.introduction.docsTecnicosObs?.[doc] || ''}
                                onChange={(e) => setFormData({
                                  ...formData,
                                  introduction: {
                                    ...formData.introduction,
                                    docsTecnicosObs: {...formData.introduction.docsTecnicosObs, [doc]: e.target.value}
                                  }
                                })}
                                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500 h-16 resize-none"
                              />
                            </div>
                          )}
                        </div>
                        {formData.introduction.docsTecnicos.includes(doc) && doc === 'Projeto da barragem elaborado por' && (
                          <div className="pl-8">
                             <input 
                                type="text" 
                                placeholder="Nome do elaborador..."
                                value={formData.introduction.docsTecnicosNomes[doc] || ''}
                                onChange={(e) => setFormData({
                                  ...formData,
                                  introduction: {
                                    ...formData.introduction,
                                    docsTecnicosNomes: {...formData.introduction.docsTecnicosNomes, [doc]: e.target.value}
                                  }
                                })}
                                className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500" 
                             />
                          </div>
                        )}
                      </div>
                      {doc === 'OUTRO' && formData.introduction.docsTecnicos.includes('OUTRO') && (
                        <div className="flex flex-col gap-4 p-4 bg-emerald-50 rounded-2xl border border-emerald-100 animate-in slide-in-from-top-2">
                           <input 
                              type="text" 
                              placeholder="Descreva o documento..."
                              value={formData.introduction.docsTecnicosOther}
                              onChange={(e) => setFormData({...formData, introduction: {...formData.introduction, docsTecnicosOther: e.target.value}})}
                              className="w-full px-4 py-2 bg-white border border-emerald-200 rounded-xl text-xs font-bold outline-none" 
                           />
                           <textarea
                             placeholder="Observação (opcional)..."
                             value={formData.introduction.docsTecnicosObs?.['OUTRO'] || ''}
                             onChange={(e) => setFormData({
                               ...formData,
                               introduction: {
                                 ...formData.introduction,
                                 docsTecnicosObs: {...formData.introduction.docsTecnicosObs, 'OUTRO': e.target.value}
                               }
                             })}
                             className="w-full px-4 py-2 bg-white border border-emerald-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500 h-16 resize-none"
                           />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ChecklistSection>
            </div>
    </div>
  );

  const orderInfoContent = (
    <div className="space-y-10 text-slate-800">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Número do Processo</label>
          <input 
            type="text" 
            placeholder="Ex: SEMA-PRO-12345/2026"
            value={formData.orderInfo.processo}
            onChange={(e) => setFormData({...formData, orderInfo: {...formData.orderInfo, processo: e.target.value}})}
            className="w-full px-5 py-3.5 bg-white border border-slate-300 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none font-bold text-slate-800 transition-all placeholder:text-slate-300" 
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Analista</label>
          <select 
            value={formData.orderInfo.analista}
            onChange={(e) => setFormData({...formData, orderInfo: {...formData.orderInfo, analista: e.target.value}})}
            className="w-full px-5 py-3.5 bg-white border border-slate-300 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none font-bold text-slate-800 transition-all"
          >
            <option value="">Selecione...</option>
            {ANALYST_LIST.map(analyst => (
              <option key={analyst} value={analyst}>{analyst}</option>
            ))}
            <option value="OUTRO">OUTRO</option>
          </select>
          {formData.orderInfo.analista === 'OUTRO' && (
            <input 
              type="text" 
              placeholder="Nome do analista..."
              value={formData.orderInfo.analistaOther}
              onChange={(e) => setFormData({...formData, orderInfo: {...formData.orderInfo, analistaOther: e.target.value}})}
              className="mt-2 w-full px-4 py-3 bg-white border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium animate-in fade-in slide-in-from-top-1"
            />
          )}
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <h5 className="text-xs font-black text-slate-400 uppercase tracking-widest">Responsáveis Técnicos</h5>
          <button 
            type="button"
            onClick={() => {
              const newId = Math.random().toString(36).substr(2, 9);
              setFormData({
                ...formData,
                orderInfo: {
                  ...formData.orderInfo,
                  respTecnicos: [...formData.orderInfo.respTecnicos, { id: newId, nome: '', art: '', isOther: false, nomeOther: '' }]
                }
              });
            }}
            className="flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-black uppercase hover:bg-emerald-100 transition-colors"
          >
            <Plus size={12} />
            Adicionar RT
          </button>
        </div>

        <div className="space-y-4">
          {formData.orderInfo.respTecnicos.map((rt, index) => (
            <div key={rt.id} className="p-6 bg-slate-50 rounded-3xl border border-slate-200 space-y-4 animate-in fade-in slide-in-from-top-2 relative">
              <button 
                type="button"
                onClick={() => setFormData({
                  ...formData,
                  orderInfo: {
                    ...formData.orderInfo,
                    respTecnicos: formData.orderInfo.respTecnicos.filter(r => r.id !== rt.id)
                  }
                })}
                className="absolute top-4 right-4 text-slate-400 hover:text-red-500 transition-colors"
              >
                <Plus className="rotate-45" size={18} />
              </button>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Responsável Técnico</label>
                  <select
                    value={rt.isOther ? 'OUTRO' : rt.nome}
                    onChange={(e) => {
                      const newList = [...formData.orderInfo.respTecnicos];
                      if (e.target.value === 'OUTRO') {
                        newList[index].isOther = true;
                        newList[index].nome = '';
                      } else {
                        newList[index].isOther = false;
                        newList[index].nome = e.target.value;
                      }
                      setFormData({...formData, orderInfo: {...formData.orderInfo, respTecnicos: newList}});
                    }}
                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Selecione...</option>
                    {RT_LIST.map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                    <option value="OUTRO">OUTRO (Inserir Manualmente)</option>
                  </select>
                  {rt.isOther && (
                    <input 
                      type="text"
                      placeholder="Nome Completo do RT..."
                      value={rt.nomeOther}
                      onChange={(e) => {
                        const newList = [...formData.orderInfo.respTecnicos];
                        newList[index].nomeOther = e.target.value;
                        setFormData({...formData, orderInfo: {...formData.orderInfo, respTecnicos: newList}});
                      }}
                      className="mt-2 w-full px-4 py-2 bg-white border border-emerald-200 rounded-xl text-xs font-bold outline-none animate-in slide-in-from-top-1"
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">ART (Números)</label>
                  <input 
                    type="text"
                    placeholder="Apenas números..."
                    value={rt.art}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '');
                      const newList = [...formData.orderInfo.respTecnicos];
                      newList[index].art = value;
                      setFormData({...formData, orderInfo: {...formData.orderInfo, respTecnicos: newList}});
                    }}
                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm space-y-8">
        <label className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <Layout className="text-emerald-500" size={18} />
          <h4 className="text-lg font-black text-slate-800 uppercase tracking-tight">Informações do Empreendedor e Empreendimento</h4>
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Identificação do Empreendedor</label>
            <input 
              type="text" 
              placeholder="Nome do empreendedor..."
              value={formData.orderInfo.empreendedor}
              onChange={(e) => setFormData({...formData, orderInfo: {...formData.orderInfo, empreendedor: e.target.value}})}
              className="w-full px-5 py-3.5 bg-white border border-slate-300 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none font-bold text-slate-800 transition-all placeholder:text-slate-300" 
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">CPF / CNPJ</label>
            <input 
              type="text" 
              placeholder="000.000.000-00 ou 00.000.000/0000-00"
              value={formData.orderInfo.cpfCnpj}
              onChange={(e) => {
                let val = e.target.value.replace(/\D/g, '');
                if (val.length > 14) val = val.slice(0, 14);
                
                let formatted = val;
                if (val.length <= 11) {
                  formatted = val.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
                } else {
                  formatted = val.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
                }
                setFormData({...formData, orderInfo: {...formData.orderInfo, cpfCnpj: formatted}});
              }}
              className="w-full px-5 py-3.5 bg-white border border-slate-300 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none font-bold text-slate-800 transition-all placeholder:text-slate-300" 
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Localização do Empreendimento</label>
            <input 
              type="text" 
              placeholder="Endereço – Nome da Fazenda"
              value={formData.orderInfo.localizacao}
              onChange={(e) => setFormData({...formData, orderInfo: {...formData.orderInfo, localizacao: e.target.value}})}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium" 
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nº CAR</label>
            <input 
              type="text" 
              placeholder="Ex: MT-12345/2026"
              value={formData.orderInfo.numCar}
              onChange={(e) => setFormData({...formData, orderInfo: {...formData.orderInfo, numCar: e.target.value}})}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium" 
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Município</label>
            <select 
              value={formData.orderInfo.municipio}
              onChange={(e) => setFormData({...formData, orderInfo: {...formData.orderInfo, municipio: e.target.value}})}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium"
            >
              <option value="">Selecione...</option>
              {MUNICIPALITIES.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Finalidade do Barramento</label>
            <select 
              value={formData.orderInfo.finalidade}
              onChange={(e) => setFormData({...formData, orderInfo: {...formData.orderInfo, finalidade: e.target.value}})}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium"
            >
              <option value="">Selecione...</option>
              {["Abastecimento Público", "Irrigação", "Regularização de vazão", "Combate às secas", "Defesa contra inundações", "Proteção ao meio ambiente", "Navegação", "Industrial", "Recreação", "Aquicultura", "Contenção de resíduos industriais", "Dessedentação animal", "Paisagismo", "Contenção de sedimentos", "Outro"].map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Situação do Empreendimento</label>
            <select 
              value={formData.orderInfo.situacao}
              onChange={(e) => setFormData({...formData, orderInfo: {...formData.orderInfo, situacao: e.target.value}})}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium"
            >
              <option value="">Selecione...</option>
              {["Planejamento", "Projeto", "Construção", "Primeiro Enchimento", "Operação", "Descomissionamento", "Desativada", "Rompida", "Descaracterizada", "Sem informação", "Outro"].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nome do Curso d’água Barrado</label>
            <input 
              type="text" 
              value={formData.orderInfo.cursoAgua}
              onChange={(e) => setFormData({...formData, orderInfo: {...formData.orderInfo, cursoAgua: e.target.value}})}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium" 
            />
          </div>
        </div>
      </div>
    </div>
  );

  const damInfoContent = (
    <div className="space-y-10 text-slate-800">
      {renderDamForm(formData.damInfo.principal)}

      {formData.damInfo.upstreamDams.map((dam, idx) => (
        <div key={dam.id}>
          {renderDamForm(dam, idx)}
        </div>
      ))}

      <div className="pt-8 flex flex-col items-center gap-4">
        <div className="p-6 bg-white border border-slate-200 rounded-3xl w-full flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-100 p-2 rounded-lg text-emerald-600">
              <Plus size={20} />
            </div>
            <div>
              <h5 className="text-xs font-black text-slate-700 uppercase tracking-widest">Barragens a Montante</h5>
              <p className="text-[10px] text-slate-400 font-bold">Deseja adicionar barramentos a montante no mesmo curso hídrico?</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={() => {
              const newId = Math.random().toString(36).substr(2, 9);
              setFormData({
                ...formData,
                damInfo: {
                  ...formData.damInfo,
                  upstreamDams: [...formData.damInfo.upstreamDams, {
                    id: newId,
                    nome: '',
                    lat: '',
                    long: '',
                    altura: '',
                    alturaFolha: '',
                    bordaLivre: '',
                    areaInundada: '',
                    volume: '',
                    vazaoMax: '',
                    areaBacia: '',
                    segurancaEstrutural: ''
                  }]
                }
              });
            }}
            className="px-6 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center gap-2"
          >
            <Plus size={14} />
            Adicionar Barragem a Montante
          </button>
        </div>
      </div>
    </div>
  );

  const entrepreneurSystemContent = (
    <div className="space-y-10 text-slate-800">
      <div className="border-b border-slate-200 pb-4 flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Informações Adicionais</h3>
          <p className="text-slate-500 text-sm">Status do parecer e pendências</p>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button 
            type="button"
            onClick={() => setFormData({...formData, entrepreneurSystem: {...formData.entrepreneurSystem, status: 'rascunho'}})}
            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${formData.entrepreneurSystem.status === 'rascunho' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
          >
            Rascunho
          </button>
          <button 
            type="button"
            onClick={() => setFormData({...formData, entrepreneurSystem: {...formData.entrepreneurSystem, status: 'concluido'}})}
            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${formData.entrepreneurSystem.status === 'concluido' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
          >
            Concluído
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Processo</label>
          <div className="px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-500 text-xs text-center">
            {formData.orderInfo.processo || '---'}
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Analista</label>
          <div className="px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-500 text-xs text-center">
            {analystName || '---'}
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Município</label>
          <div className="px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-500 text-xs text-center">
            {municipalityText || '---'}
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {formData.entrepreneurSystem.status === 'rascunho' ? (
          <motion.div
            key="rascunho-fields"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Data de envio da pendência</label>
                <input 
                  type="date" 
                  value={formData.entrepreneurSystem.dataEnvioPendencia}
                  onChange={(e) => setFormData({...formData, entrepreneurSystem: {...formData.entrepreneurSystem, dataEnvioPendencia: e.target.value}})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Prazo (Dias)</label>
                <div className="flex gap-4">
                   <input 
                    type="number" 
                    value={formData.entrepreneurSystem.prazoDias}
                    onChange={(e) => setFormData({...formData, entrepreneurSystem: {...formData.entrepreneurSystem, prazoDias: e.target.value}})}
                    className="w-24 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium" 
                  />
                  {expiryDate && (
                    <div className="flex-1 px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-between">
                       <span className="text-[10px] font-black text-emerald-700 uppercase">Vencimento: {expiryDate.toLocaleDateString('pt-BR')}</span>
                       <span className="text-[10px] font-black text-emerald-600 uppercase">{daysRemaining} dias restantes</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Situação</label>
                <select 
                  value={formData.entrepreneurSystem.situacao}
                  onChange={(e) => setFormData({...formData, entrepreneurSystem: {...formData.entrepreneurSystem, situacao: e.target.value}})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium"
                >
                  <option value="Aguardando análise">Aguardando análise</option>
                  <option value="Aguardando cumprimento de pendencias">Aguardando cumprimento de pendencias</option>
                </select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Observações do Analista</label>
                <textarea 
                  rows={4}
                  placeholder="Essas informações aparecerão no relatório para o empreendedor..."
                  value={formData.entrepreneurSystem.observacoes}
                  onChange={(e) => setFormData({...formData, entrepreneurSystem: {...formData.entrepreneurSystem, observacoes: e.target.value}})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium resize-none shadow-inner" 
                />
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="concluido-fields"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-emerald-50 border border-emerald-100 p-8 rounded-3xl space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
                  <CheckCircle size={24} />
                </div>
                <div>
                  <h4 className="font-black text-emerald-900 tracking-tight">Enquadramento PNSB</h4>
                  <p className="text-emerald-700/60 text-xs font-bold uppercase tracking-widest">A barragem se enquadra na Política Nacional de Segurança de Barragens?</p>
                </div>
              </div>

              <div className="space-y-4">
                <label className="flex items-center gap-4 p-5 rounded-2xl bg-white border border-emerald-200 cursor-pointer hover:border-emerald-500 transition-all">
                  <input 
                    type="radio" 
                    name="enquadraPNSB"
                    checked={formData.entrepreneurSystem.enquadraPNSB === true}
                    onChange={() => setFormData({...formData, entrepreneurSystem: {...formData.entrepreneurSystem, enquadraPNSB: true}})}
                    className="w-5 h-5 text-emerald-500 focus:ring-emerald-500"
                  />
                  <div className="flex-1">
                    <span className="block text-sm font-black text-slate-800">Sim, enquadra-se na PNSB</span>
                    <span className="block text-xs text-slate-500 font-medium tracking-tight">Deverá apresentar os demais estudos exigidos em lei.</span>
                  </div>
                </label>

                <label className="flex items-center gap-4 p-5 rounded-2xl bg-white border border-emerald-200 cursor-pointer hover:border-emerald-500 transition-all">
                  <input 
                    type="radio" 
                    name="enquadraPNSB"
                    checked={formData.entrepreneurSystem.enquadraPNSB === false}
                    onChange={() => setFormData({...formData, entrepreneurSystem: {...formData.entrepreneurSystem, enquadraPNSB: false}})}
                    className="w-5 h-5 text-emerald-500 focus:ring-emerald-500"
                  />
                  <div className="flex-1">
                    <span className="block text-sm font-black text-slate-800">Não se enquadra na PNSB</span>
                    <span className="block text-xs text-slate-500 font-medium tracking-tight">Desobrigada de apresentar classificação e demais peças técnicas.</span>
                  </div>
                </label>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  const reviewExportContent = (
    <div className="space-y-10 text-slate-800">
      <div className="border-b border-slate-200 pb-4">
        <h3 className="text-2xl font-black text-slate-800 uppercase">Parecer Técnico</h3>
        <p className="text-slate-500 text-sm">Visualize o parecer gerado e exporte o documento</p>
      </div>

      <div className="bg-white border shadow-inner p-8 lg:p-12 font-serif text-slate-900 max-w-4xl mx-auto space-y-8 print:shadow-none print:p-0 leading-relaxed">
        <div className="text-center space-y-1 border-b-2 border-slate-900 pb-6">
          <p className="font-bold text-xs uppercase">GOVERNO DO ESTADO DE MATO GROSSO</p>
          <p className="font-bold text-xs uppercase">SECRETARIA DE ESTADO DE MEIO AMBIENTE</p>
          <p className="font-bold text-xs uppercase text-[10px]">SECRETARIA ADJUNTA DE LICENCIAMENTO AMBIENTAL E RECURSOS HÍDRICOS</p>
          <p className="font-bold text-xs uppercase">SUPERINTENDÊNCIA DE RECURSOS HÍDRICOS</p>
          <p className="font-bold text-xs uppercase">COORDENADORIA DE SEGURANÇA DE BARRAGENS</p>
          <div className="h-4"></div>
          <p className="font-bold text-sm uppercase">NÃO OBRIGATORIEDADE - CBS/SURH/SEMA-MT</p>
        </div>

        <div className="pt-4">
          <p className="font-bold text-sm italic">
            Assunto: Análise referente ao pedido de ¨não obrigatoriedade¨ de classificação da segurança de barragem existente
          </p>
        </div>

        <div className="space-y-6">
          <div>
            <h4 className="font-bold text-base uppercase mb-4">1. INTRODUÇÃO</h4>
            <p className="text-sm text-justify leading-relaxed">
              Este Parecer expõe os resultados da análise referente ao pedido da ¨não obrigatoriedade¨ de classificação quanto à segurança da barragem existente. Este documento encontra embasamento na análise dos documentos disponibilizados nos autos, com seus projetos e estudos realizados pelo responsável técnico <span className="font-bold border-b border-slate-900">{rtText || '________________'}</span>, mediado pela ART <span className="font-bold border-b border-slate-900">{artTextLong || '________________'}</span>, contendo em referência à análise documental:
            </p>
            <ul className="mt-4 list-disc pl-8 space-y-2 text-sm">
              {reportDocs.map((doc, i) => <li key={i} className="text-justify">{doc}</li>)}
            </ul>
            <p className="mt-4 text-sm text-justify">
              O presente documento fundamenta-se na avaliação dos materiais apresentados nos autos, cujas características principais do pedido estão sintetizadas no quadro abaixo.
            </p>
          </div>

          <div className="pt-4">
            <p className="font-bold text-[10px] mb-2 uppercase tracking-wide">Quadro 1: Características gerais do pedido da barragem.</p>
            <div className="border border-slate-900 overflow-hidden">
              <table className="w-full text-left text-[10px] border-collapse">
                <tbody>
                  <tr className="border-b border-slate-900">
                    <td className="p-2 font-bold bg-slate-50 w-1/3 border-r border-slate-900 uppercase">Empreendedor:</td>
                    <td className="p-2 uppercase font-medium">{formData.orderInfo.empreendedor}</td>
                  </tr>
                  <tr className="border-b border-slate-900">
                    <td className="p-2 font-bold bg-slate-50 border-r border-slate-900 uppercase">CPF/CNPJ:</td>
                    <td className="p-2 font-medium">{formData.orderInfo.cpfCnpj}</td>
                  </tr>
                  <tr className="border-b border-slate-900">
                    <td className="p-2 font-bold bg-slate-50 border-r border-slate-900 uppercase">Localização:</td>
                    <td className="p-2 italic font-medium">{formData.orderInfo.localizacao}</td>
                  </tr>
                  <tr className="border-b border-slate-900">
                    <td className="p-2 font-bold bg-slate-50 border-r border-slate-900 uppercase">Nº CAR:</td>
                    <td className="p-2 font-medium">{formData.orderInfo.numCar}</td>
                  </tr>
                  <tr className="border-b border-slate-900">
                    <td className="p-2 font-bold bg-slate-50 border-r border-slate-900 uppercase">Município/UF:</td>
                    <td className="p-2 font-medium">{formData.orderInfo.municipio ? `${formData.orderInfo.municipio}/MT` : ''}</td>
                  </tr>
                  <tr className="border-b border-slate-900">
                    <td className="p-2 font-bold bg-slate-50 border-r border-slate-900 uppercase">Finalidade:</td>
                    <td className="p-2 font-medium">{formData.orderInfo.finalidade === 'Outro' ? formData.orderInfo.finalidadeOther : formData.orderInfo.finalidade}</td>
                  </tr>
                  <tr className="border-b border-slate-900">
                    <td className="p-2 font-bold bg-slate-50 border-r border-slate-900 uppercase">Situação:</td>
                    <td className="p-2 font-medium">{formData.orderInfo.situacao === 'Outro' ? formData.orderInfo.situacaoOther : formData.orderInfo.situacao}</td>
                  </tr>
                  <tr className="border-b border-slate-900">
                    <td className="p-2 font-bold bg-slate-50 border-r border-slate-900 uppercase">Curso d’água:</td>
                    <td className="p-2 font-medium">{formData.orderInfo.cursoAgua}</td>
                  </tr>
                  <tr className="border-b border-slate-900">
                    <td className="p-2 font-bold bg-slate-50 border-r border-slate-900 uppercase">Sub-bacia:</td>
                    <td className="p-2 font-medium">{formData.orderInfo.subBacia}</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-bold bg-slate-50 border-r border-slate-900 uppercase">Analista:</td>
                    <td className="p-2 font-medium uppercase">{analystName}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-8">
              {renderDamTable(formData.damInfo.principal, 'Barramento Principal')}
              {formData.damInfo.upstreamDams.map((dam, idx) => renderDamTable(dam, `Barramento a Montante #${idx + 1}`))}
              <p className="text-[9px] mt-2 italic text-slate-500 font-sans">
                *Informações fornecidas pelo interessado e indicadas nos autos.
              </p>
            </div>
          </div>

          <div className="space-y-4 pt-10 border-t border-slate-200 mt-10">
            <h4 className="font-bold text-base uppercase">2. PARECER</h4>
            <p className="text-sm text-justify leading-relaxed">
              Em consonância com a Instrução Normativa nº 08, de 18 de dezembro de 2023, que dispõe sobre os procedimentos referentes à classificação quanto à segurança de barragens de usos múltiplos em corpos de dominialidade do Estado de Mato Grosso, especialmente em seu Art. 24, as barragens objeto deste processo não atendem aos requisitos mínimos exigidos – descritos nos itens I a IV do artigo citado - que a desobriga de requerer a classificação nesta Coordenadoria de Segurança de Barragens – CSB, vide documentação trazida nos autos e demonstradas no Quadro 1.
            </p>
            <p className="text-sm text-justify leading-relaxed">
              Em conclusão à análise, tem-se que, em suas condições atuais, as barragens não se encontram obrigadas a requerer a classificação, tampouco se encontram enquadradas na Política Nacional de Segurança de Barragens (PNSB), regida pela Lei Federal nº 12.334, de 20 de setembro de 2010.
            </p>
            <p className="text-sm text-justify font-bold leading-relaxed">
              Cumpre citar que é responsabilidade do empreendedor comunicar ao fiscalizador sobre qualquer alteração na sua barragem, especialmente eventual situação que implique em reclassificação, conforme versa o texto do art. 8º da Instrução Normativa citada. Ainda, é responsabilidade do empreendedor a gestão de segurança da barragem e reparação de danos decorrentes de seu rompimento, independentemente da existência de culpa.
            </p>
          </div>

          <div className="pt-16 pb-8 text-center space-y-1">
             <div className="w-64 border-b border-slate-900 mx-auto"></div>
             <p className="font-bold text-xs uppercase">{analystName}</p>
             <p className="text-[10px] uppercase text-slate-600">Analista de Meio Ambiente</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-4 pt-12 border-t border-slate-100 no-print">
        <button 
          type="button"
          onClick={handleClear}
          className="px-6 py-3 border border-red-200 text-red-500 rounded-xl font-black text-xs uppercase hover:bg-red-50 transition-all flex items-center gap-2 cursor-pointer bg-white"
        >
          <Trash2 size={16} />
          Limpar Tudo
        </button>
        <button 
          type="button" 
          onClick={handleSaveDraft}
          className="px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-black text-xs uppercase hover:bg-slate-200 transition-all flex items-center gap-2 border-none cursor-pointer"
        >
          <Save size={16} />
          Salvar Rascunho
        </button>
        <button 
          type="button" 
          onClick={handleComplete}
          className="px-8 py-3 bg-emerald-500 text-white rounded-xl font-black text-xs uppercase shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 transition-all flex items-center gap-2 border-none cursor-pointer"
        >
          <CheckCircle size={16} />
          Concluir Parecer
        </button>
        <button 
          type="button" 
          onClick={exportToDocx}
          className="px-8 py-3 bg-slate-900 text-white rounded-xl font-black text-xs uppercase shadow-lg shadow-slate-900/20 hover:bg-slate-800 transition-all flex items-center gap-2 border-none cursor-pointer"
        >
          <Download size={16} />
          Exportar DOCX
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Sticky Header */}
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            type="button"
            onClick={onBack}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500 cursor-pointer border-none bg-transparent"
          >
            <ChevronLeft size={24} />
          </button>
          <div>
            <h2 className="font-black text-xl tracking-tighter text-slate-900">Não Obrigatoriedade</h2>
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Módulo de Cadastro</p>
          </div>
        </div>
        
        <div className="hidden md:flex items-center gap-2">
          <button 
            type="button" 
            onClick={handleClear}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-red-500 hover:bg-red-50 rounded-lg transition-all border-none bg-transparent cursor-pointer"
          >
            <Trash2 size={16} />
            Limpar
          </button>
          <button 
            type="button" 
            onClick={handleSaveDraft}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-all border-none bg-transparent cursor-pointer"
          >
            <Save size={16} />
            Salvar Rascunho
          </button>
          <button 
            type="button" 
            onClick={handleComplete}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all border-none bg-transparent cursor-pointer"
          >
            <CheckCircle size={16} />
            Concluir
          </button>
          <button 
            type="button" 
            onClick={exportToDocx}
            className="flex items-center gap-2 px-4 py-2 text-xs font-black text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-all border-none cursor-pointer"
          >
            <Download size={16} />
            Docx
          </button>
        </div>
      </div>

      <div className="flex-1 max-w-5xl mx-auto w-full p-6 lg:p-12 space-y-6">
        <CollapsibleSection title="1. INTRODUÇÃO" subtitle="Informações iniciais e documentação">
          {introductionContent}
        </CollapsibleSection>

        <CollapsibleSection title="2. INFORMAÇÕES DO PEDIDO" subtitle="Dados do empreendedor e do empreendimento">
          {orderInfoContent}
        </CollapsibleSection>

        <CollapsibleSection title="3. BARRAMENTO" subtitle="Características técnicas das barragens">
          {damInfoContent}
        </CollapsibleSection>

        <CollapsibleSection title="4. SISTEMA DE INFORMAÇÕES AO EMPREENDEDOR" subtitle="Status do processo e pendências">
          {entrepreneurSystemContent}
        </CollapsibleSection>

        <CollapsibleSection title="5. REVISAR E EXPORTAR" subtitle="Visualização do parecer técnico final">
          {reviewExportContent}
        </CollapsibleSection>
      </div>
    </div>
  );
};

export default NoObligatoryForm;
