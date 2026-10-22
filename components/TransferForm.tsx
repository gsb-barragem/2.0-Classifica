import React, { useState, useContext, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar,
  Hash,
  User,
  ExternalLink,
  PlusCircle,
  Home,
  MapPin,
  Trash2,
  Check,
  Save, 
  ChevronDown, 
  FileText, 
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  FileDown,
  Info,
  Search,
  ClipboardList,
  Eye,
  Eraser,
  Send,
  Copy,
  Edit3,
  RotateCcw
} from 'lucide-react';
import { toast } from 'sonner';
import { saveAs } from 'file-saver';
import { logActivity } from '../src/lib/auditService';
import { supabase } from '../src/supabaseClient';
import { getUpgsForMunicipality } from '../src/data/upgData';
import { AuthContext } from '../src/contexts/AuthContext';
import { OPS_ANALISTA as ANALISTAS } from '../constants';
import { 
  Document, 
  Packer, 
  Paragraph, 
  TextRun, 
  Table, 
  TableRow, 
  TableCell, 
  WidthType, 
  AlignmentType, 
  HeadingLevel,
  BorderStyle,
  VerticalAlign
} from 'docx';

const INITIAL_DATA = {
  analista: '',
  analistaOutro: '',
  nProcesso: '',
  snisb: '',
  tipoClassificacao: 'Classificação',
  dataProtocolo: '',
  portariaNumero: '',
  dataPortaria: '',
  portariaNova: '',
  dataPortariaNova: '',
  parecerTecnico: '',
  dataParecerTecnico: '',
  parecerTecnicoPortaria: '',
  dataParecerTecnicoPortaria: '',
  responsavelTecnico: '',
  artNumero: '',
  nomeFazenda: '',
  zonaEndereco: 'Rural',
  municipio: 'Cuiabá',
  latGMS: '',
  longGMS: '',
  barragemTipoClassificacao: 'classificação',
  barragemTipoClassificacaoOutro: '',
  nomeCursoAgua: '',
  subBacia: '',
  upg: '',
  alturaMaxima: '',
  tipoBarragem: 'barragem de terra',
  situacaoEmpreendimento: 'Operação',
  situacaoEmpreendimentoOutro: '',
  volumeArmazenado: '',
  dpa: 'Baixo',
  cri: 'Baixa',
  antigoProprietario: '',
  antigoTipoDoc: 'CPF' as 'CPF' | 'CNPJ',
  antigoDoc: '',
  novoProprietario: '',
  novoTipoDoc: 'CPF' as 'CPF' | 'CNPJ',
  novoDoc: '',
  enquadradaPNSB: 'SIM',
  classeEnquadramento: 'A',
  customPortariaText: null as string | null
};

interface TransferFormProps {
  initialData?: any;
  onBack: () => void;
  onSave?: () => void;
  readOnly?: boolean;
}

interface DocItem {
  id: string;
  label: string;
  checked: boolean;
  extraInput?: string;
  pageNumber?: string;
}

const INITIAL_DOCS = [
  { id: 'req_sema', label: 'Requerimento padrão SEMA;' },
  { id: 'guia', label: 'Cópia da guia de recolhimento da classificação com o comprovante do pagamento;' },
  { id: 'portaria', label: 'Cópia da portaria de' }, // Dynamic
  { id: 'parecer', label: 'Parecer Técnico n°' }, // Dynamic
  { id: 'doe', label: 'Publicação do pedido de transferência da titularidade no Diário Oficial do Estado de Mato Grosso;' },
  { id: 'jornal', label: 'Publicação do pedido de transferência da titularidade em jornal de circulação local;' },
  { id: 'jucemat', label: 'Cópia do Registro Digital emitido pela Junta Comercial do Estado de Mato Grosso;' },
  { id: 'alteracao', label: 'Cópia da Alteração do Contrato Social;' },
  { id: 'procuracao', label: 'Procuração devidamente autenticada;' },
  { id: 'pessoais', label: 'Cópia dos documentos pessoais do antigo e do atual responsável pela barragem;' },
  { id: 'art', label: 'Anotação de Responsabilidade Técnica (ART) de' }, // Dynamic
  { id: 'anuencia', label: 'Carta de anuência do antigo titular' }, // Dynamic
  { id: 'compra_venda', label: 'Cópia do Instrumento Particular de Compromisso de Compra e Venda de Imóvel Rural e Outras Avenças;' },
  { id: 'pendrive', label: 'Pen drive contendo toda a documentação apresentada.' },
  { id: 'outro', label: 'OUTRO' }
];

const MUNICIPIOS = [
  "Acorizal", "Água Boa", "Alta Floresta", "Alto Araguaia", "Alto Boa Vista", "Alto Garças", "Alto Paraguai", "Alto Taquari", "Apiacás", "Araguaiana", "Araguainha", "Araputanga", "Arenápolis", "Aripuanã", "Barão de Melgaço", "Barra do Bugres", "Barra do Garças", "Bom Jesus do Araguaia", "Brasnorte", "Cáceres", "Campinápolis", "Campo Novo do Parecis", "Campo Verde", "Campos de Júlio", "Canabrava do Norte", "Canarana", "Carlinda", "Castanheira", "Chapada dos Guimarães", "Cláudia", "Cocalinho", "Colíder", "Colniza", "Comodoro", "Confresa", "Conquista d’Oeste", "Cotriguaçu", "Curvelândia", "Cuiabá", "Denise", "Diamantino", "Dom Aquino", "Feliz Natal", "Figueirópolis d’Oeste", "Gaúcha do Norte", "General Carneiro", "Glória d’Oeste", "Guarantã do Norte", "Guiratinga", "Indiavái", "Itaúba", "Itiquira", "Jaciara", "Jangada", "Jauru", "Juara", "Juína", "Juruena", "Juscimeira", "Lambari d’Oeste", "Lucas do Rio Verde", "Luciára", "Marcelândia", "Matupá", "Mirassol d’Oeste", "Nobres", "Nortelândia", "Nossa Senhora do Livramento", "Nova Bandeirantes", "Nova Brasilândia", "Nova Canaã do Norte", "Nova Guarita", "Nova Lacerda", "Nova Marilândia", "Nova Maringá", "Nova Monte Verde", "Nova Mutum", "Nova Nazaré", "Nova Olímpia", "Nova Santa Helena", "Nova Ubiratã", "Nova Xavantina", "Novo Horizonte do Norte", "Novo Mundo", "Novo Santo Antônio", "Novo São Joaquim", "Paranaíta", "Paranatinga", "Pedra Preta", "Peixoto de Azevedo", "Planalto da Serra", "Poconé", "Pontal do Araguaia", "Ponte Branca", "Pontes e Lacerda", "Porto Alegre do Norte", "Porto dos Gaúchos", "Porto Esperidião", "Porto Estrela", "Poxoréu", "Primavera do Leste", "Querência", "Reserva do Cabaçal", "Ribeirão Cascalheira", "Ribeirãozinho", "Rio Branco", "Rondolândia", "Rondonópolis", "Rosário Oeste", "Salto do Céu", "Santa Carmem", "Santa Cruz do Xingu", "Santa Rita do Trivelato", "Santa Terezinha", "Santo Afonso", "Santo Antônio do Leste", "Santo Antônio do Leverger", "São Félix do Araguaia", "São José do Povo", "São José do Rio Claro", "São José do Xingu", "São José dos Quatro Marcos", "São Pedro da Cipa", "Sapezal", "Serra Nova Dourada", "Sinop", "Sorriso", "Tabaporã", "Tangará da Serra", "Tapurah", "Terra Nova do Norte", "Tesouro", "Torixoréu", "União do Sul", "Vale de São Domingos", "Várzea Grande", "Vera", "Vila Bela da Santíssima Trindade", "Vila Rica"
];

const TransferForm: React.FC<TransferFormProps> = ({ initialData, onBack, onSave, readOnly }) => {
  const { currentUser } = useContext(AuthContext);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    ...INITIAL_DATA,
    docs: INITIAL_DOCS.map(doc => ({ ...doc, checked: false, extraInput: '', pageNumber: '' })) as DocItem[]
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        ...INITIAL_DATA,
        ...initialData,
        // Ensure docs are correctly handle if they exist in initialData
        docs: initialData.docs || INITIAL_DOCS.map(doc => ({ ...doc, checked: false, extraInput: '', pageNumber: '' }))
      });
    }
  }, [initialData]);

  // Pre-select analyst based on logged-in user
  useEffect(() => {
    if (currentUser?.name && !initialData && !formData.analista) {
      const userName = currentUser.name.trim().toLowerCase();
      const matchedAnalista = ANALISTAS.find(
        name => name.trim().toLowerCase().includes(userName) || 
                userName.includes(name.trim().toLowerCase())
      );
      if (matchedAnalista) {
        setFormData(prev => ({ ...prev, analista: matchedAnalista }));
      }
    }
  }, [currentUser, initialData, formData.analista]);

  const maskGMS = (value: string, type: 'Lat' | 'Long') => {
    const digits = (value || '').replace(/\D/g, '');
    if (!digits) return '';
    
    let res = '';
    if (digits.length > 0) res += digits.substring(0, 2);
    if (digits.length > 2) res += '°' + digits.substring(2, 4);
    if (digits.length > 4) res += '’' + digits.substring(4, 6);
    if (digits.length > 6) res += ',' + digits.substring(6, 8);
    
    if (digits.length >= 8) {
      res = res.substring(0, 11) + '¨';
    }
    
    return res + (type === 'Lat' ? 'S' : 'O');
  };

  const getClassificacaoVolume = (volume: string) => {
    const val = parseFloat((volume || '').replace(',', '.'));
    if (isNaN(val)) return '-';
    if (val < 3) return 'muito pequeno.';
    if (val >= 3 && val < 10) return 'pequeno.';
    if (val >= 10 && val < 75) return 'médio.';
    if (val >= 75 && val < 200) return 'grande.';
    return 'muito grande.';
  };

  const maskCPF = (valueText: string) => {
    const value = valueText || '';
    return value
      .replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1');
  };

  const maskCNPJ = (valueText: string) => {
    const value = valueText || '';
    return value
      .replace(/\D/g, '')
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d{1,2})/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1');
  };

  const renderParecer = () => {
    const dataProtocolo = formData.dataProtocolo ? new Date(formData.dataProtocolo + 'T12:00:00').toLocaleDateString('pt-BR') : '___/___/_____';
    const dataPortaria = formData.dataPortaria ? new Date(formData.dataPortaria + 'T12:00:00').toLocaleDateString('pt-BR') : '___/___/_____';
    
    const docsSelecionados = formData.docs
      .filter(doc => doc.checked)
      .map(doc => {
        let label = getDocLabel(doc);
        if (doc.id.startsWith('outro_') || doc.id === 'outro') {
          label = doc.label;
        }
        return `${label}${doc.extraInput ? ` (${doc.extraInput})` : ''}${doc.pageNumber ? ` - Fls. ${doc.pageNumber}` : ''}`;
      });

    const tipoClassificacao = formData.barragemTipoClassificacao === 'OUTRO' ? formData.barragemTipoClassificacaoOutro : formData.barragemTipoClassificacao;
    const situacaoEmpreendimento = formData.situacaoEmpreendimento === 'OUTRO' ? formData.situacaoEmpreendimentoOutro : formData.situacaoEmpreendimento;

    return (
      <div id="parecer-document" className="bg-white p-12 shadow-2xl mx-auto my-8 max-w-[210mm] min-h-[297mm] text-slate-800 font-serif leading-relaxed text-justify space-y-8 print:shadow-none print:m-0 print:p-8 print:w-full">
        <div className="text-center font-bold">
          <p>GOVERNO DO ESTADO DE MATO GROSSO</p>
          <p>SECRETARIA DE ESTADO DE MEIO AMBIENTE - SEMA</p>
          <p>PARECER TÉCNICO - CBS/SURH/SEMA-MT</p>
        </div>

        <div className="text-left font-bold space-y-1">
          <p>Processo nº: {formData.nProcesso || '__________'}</p>
          <p>{tipoClassificacao || '__________'} quanto à Segurança de {formData.tipoBarragem || '__________'} - (Código SNISB nº {formData.snisb || '__________'})</p>
        </div>

        <div>
          <h2 className="text-center font-bold text-lg uppercase mb-8">1. HISTÓRICO</h2>
          <p>
            No dia <strong>{dataProtocolo}</strong> foi protocolado nesta secretaria sob o protocolo nº <strong>{formData.nProcesso || '__________'}</strong> por meio do qual foi solicitado a transferência de titularidade da Portaria de <strong>{tipoClassificacao || '__________'}</strong> da Barragem n° <strong>{formData.portariaNumero || '__________'}</strong> emitida em <strong>{dataPortaria}</strong>, anteriormente concedida à <strong>{formData.antigoProprietario || '__________'}</strong>, de <strong>{formData.antigoTipoDoc} n° {formData.antigoDoc || '__________'}</strong>, passando a responsabilidade ao novo interessado <strong>{formData.novoProprietario || '__________'}</strong>, de <strong>{formData.novoTipoDoc} n° {formData.novoDoc || '__________'}</strong>.
          </p>
          <p className="mt-4">
            Registra-se que a referida Portaria de <strong>{tipoClassificacao || '__________'} n° {formData.portariaNumero || '__________'}</strong>, vinculada ao processo <strong>{formData.nProcesso || '__________'}</strong>, trata-se de uma barragem localizada na <strong>{formData.nomeFazenda || '__________'}</strong>, <strong>{formData.zonaEndereco || '__________'}</strong>, na zona <strong>{formData.zonaEndereco.toLowerCase()}</strong> no município de <strong>{formData.municipio}/MT</strong>, sob as coordenadas <strong>{formData.latGMS || '__________'}</strong> e <strong>{formData.longGMS || '__________'}</strong>.
          </p>
          <p className="mt-4">
            O pedido foi instruído pelo novo interessado com o envio dos seguintes documentos:
          </p>
          <ul className="list-disc pl-8 mt-4 space-y-1">
            {docsSelecionados.map((doc, i) => <li key={i}>{doc}</li>)}
          </ul>
        </div>

        <div>
          <h2 className="text-center font-bold text-lg uppercase mb-8">2- INFORMAÇÃO ADICIONAL</h2>
          <p>
            A transferência de titularidade da Portaria de Classificação restringe-se exclusivamente à alteração do polo responsável, devendo a estrutura conservar integralmente as mesmas características técnicas, estruturais, operacionais e a classificação quanto a segurança e suas obrigações seguem listados no Parecer Técnico <strong>{formData.parecerTecnico || '__________'}</strong>{formData.dataParecerTecnico && ` de ${new Date(formData.dataParecerTecnico).toLocaleDateString('pt-BR')}`}, conforme quadro abaixo:
          </p>
          
          <div className="mt-8 border border-slate-300">
            <h3 className="bg-slate-50 p-2 text-center font-bold border-b border-slate-300 text-sm">QUADRO 1. RESUMO DO QUADRO DE CLASSIFICAÇÃO</h3>
            <div className="grid grid-cols-2 divide-x divide-y divide-slate-300 text-xs">
              <div className="p-2 font-bold bg-slate-50/50">Tipo de Classificação:</div>
              <div className="p-2">{tipoClassificacao}</div>
              
              <div className="p-2 font-bold bg-slate-50/50">Nome do Curso D’água:</div>
              <div className="p-2">{formData.nomeCursoAgua}</div>
              
              <div className="p-2 font-bold bg-slate-50/50">Sub-bacia/Bacia:</div>
              <div className="p-2">{formData.subBacia}</div>
              
              <div className="p-2 font-bold bg-slate-50/50">UPG:</div>
              <div className="p-2">{formData.upg}</div>
              
              <div className="p-2 font-bold bg-slate-50/50">Município/UF:</div>
              <div className="p-2">{formData.municipio}/MT</div>
              
              <div className="p-2 font-bold bg-slate-50/50">Nome do Empreendedor:</div>
              <div className="p-2">{formData.novoProprietario}</div>
              
              <div className="p-2 font-bold bg-slate-50/50">Localização do empreendimento:</div>
              <div className="p-2">{formData.nomeFazenda}</div>
              
              <div className="p-2 font-bold bg-slate-50/50">{formData.novoTipoDoc}:</div>
              <div className="p-2">{formData.novoDoc}</div>
              
              <div className="p-2 font-bold bg-slate-50/50">Número do Processo:</div>
              <div className="p-2">{formData.nProcesso}</div>
              
              <div className="p-2 font-bold bg-slate-50/50">Número do SNISB:</div>
              <div className="p-2">{formData.snisb}</div>
              
              <div className="p-2 font-bold bg-slate-50/50">DANO POTENCIAL ASSOCIADO:</div>
              <div className="p-2">{formData.dpa}</div>
              
              {formData.barragemTipoClassificacao !== 'pré-classificação' && (
                <>
                  <div className="p-2 font-bold bg-slate-50/50">CATEGORIA DE RISCO:</div>
                  <div className="p-2">{formData.cri}</div>
                </>
              )}
              
              <div className="p-2 font-bold bg-slate-50/50">Classificação quanto ao volume:</div>
              <div className="p-2">{getClassificacaoVolume(formData.volumeArmazenado)}</div>
              
              <div className="p-2 font-bold bg-slate-50/50">Coordenadas:</div>
              <div className="p-2">{formData.latGMS} e {formData.longGMS}</div>
              
              <div className="p-2 font-bold bg-slate-50/50">Altura:</div>
              <div className="p-2">{formData.alturaMaxima} m</div>
              
              <div className="p-2 font-bold bg-slate-50/50">Tipo de Barragem:</div>
              <div className="p-2">{formData.tipoBarragem}</div>
              
              <div className="p-2 font-bold bg-slate-50/50">Volume armazenado (NMM) /(hm³):</div>
              <div className="p-2">{formData.volumeArmazenado}</div>
              
              <div className="p-2 font-bold bg-slate-50/50">Situação do empreendimento:</div>
              <div className="p-2">{situacaoEmpreendimento}</div>

              <div className="p-2 font-bold bg-slate-50/50">Enquadrada na PNSB:</div>
              <div className="p-2">{formData.enquadradaPNSB}</div>

              <div className="p-2 font-bold bg-slate-50/50">Classe de enquadramento:</div>
              <div className="p-2">{formData.classeEnquadramento}</div>
            </div>
            <div className="p-2 text-[10px] italic text-slate-500 border-t border-slate-300">
              *Dados extraídos do Parecer Técnico n° {formData.parecerTecnico || '__________'} emitido em {formData.dataParecerTecnico ? new Date(formData.dataParecerTecnico + 'T12:00:00').toLocaleDateString('pt-BR') : '___/___/_____'}.
            </div>
          </div>

          <p className="mt-8">
            Salienta-se que o presente parecer técnico não autoriza a execução de obras no barramento, devendo o empreendedor obter previamente as licenças ambientais cabíveis antes de qualquer intervenção, em conformidade com a legislação vigente, quando aplicável. Diante do exposto, esta manifestação técnica limita-se à análise das condicionantes apresentadas, não se tratando de procedimento de reclassificação da barragem, permanecendo inalterada a classificação atualmente atribuída. Ressalta-se que a barragem está localizada em rio de domínio estadual, encontrando-se inserida no cadastro de barragens da Secretaria de Estado de Meio Ambiente do Estado de Mato Grosso (SEMA-MT) e no Sistema Nacional de Informações sobre Segurança de Barragens (SNISB), sob o código n° <strong>{formData.snisb || '__________'}</strong>.
          </p>
        </div>

        <div>
          <h2 className="text-center font-bold text-lg uppercase mb-8">3. DAS OBRIGAÇÕES DO TITULAR</h2>
          <p>
            Salientamos que é obrigação do atual titular <strong>{formData.novoProprietario || '__________'}</strong> informar ao órgão fiscalizador acerca de qualquer alteração em sua barragem. Outrossim, é responsabilidade do empreendedor realizar a gestão da segurança da barragem e a reparação de possíveis danos decorrentes de rompimento, vazamento ou funcionamento inadequado, independentemente da existência de dolo ou culpa.
          </p>
          {formData.barragemTipoClassificacao === 'pré-classificação' && (
            <p className="mt-4">
              Por se tratar de uma transferência de titularidade de pré-classificação, o novo titular fica responsável por solicitar a continuidade do processo de classificação.
            </p>
          )}
        </div>

        <div>
          <h2 className="text-center font-bold text-lg uppercase mb-8">{/* A user request said "3." for conclusion but it's likely 4. */} 4. CONCLUSÃO</h2>
          <p>
            Após analisarmos a documentação apresentada pelo interessado <strong>{formData.novoProprietario || '__________'}</strong> no processo nº <strong>{formData.nProcesso || '__________'}</strong> constatamos que o requerente cumpriu todas as exigências administrativas para a transferência de titularidade da Portaria de <strong>{tipoClassificacao || '__________'}</strong> nº <strong>{formData.portariaNumero || '__________'}</strong> emitida em <strong>{dataPortaria}</strong>.
          </p>
          <p className="mt-4">
            Diante do exposto, este parecer é favorável à transferência de titularidade e, consequentemente, à emissão de uma nova portaria de classificação.
          </p>
        <div className="mt-12 text-right">
          <p>{new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}</p>
          <p>Cuiabá/MT.</p>
        </div>
      </div>
    </div>
  );
};

  const handlePrint = () => {
    window.print();
  };

  const generatePortariaText = () => {
    const months = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
    const formatDate = (dateStr: string) => {
      if (!dateStr) return "___ DE ________ DE ____";
      const d = new Date(dateStr + 'T12:00:00');
      return `${String(d.getDate()).padStart(2, '0')} DE ${months[d.getMonth()]} DE ${d.getFullYear()}`;
    };

    const tipoClassificacao = formData.barragemTipoClassificacao === 'OUTRO' ? formData.barragemTipoClassificacaoOutro : formData.barragemTipoClassificacao;
    const capitalizedTipoClassificacao = tipoClassificacao.charAt(0).toUpperCase() + tipoClassificacao.slice(1);
    const tipoBarragem = formData.tipoBarragem;
    const portariaNova = formData.portariaNova || '__________';
    const dataPortariaNova = formatDate(formData.dataPortariaNova);
    
    const dpaParag = (formData.dpa === 'Médio' || formData.dpa === 'Alto') 
      ? `Considerando a Resolução CEHIDRO n° 163, de 11 de maio de 2023, que estabelece a periocidade de execução ou atualização, a qualificação dos responsáveis técnicos, o conteúdo mínimo e o nível de detalhamento do Plano de Segurança de Barragem, das Inspeções da Segurança Regular e Especial, da Revisão Periódica da Segurança de Barragem e do Plano de Ação de Emergência, das Barragens fiscalizadas pela SEMA, MT;\n\n`
      : "";

    const ptDateFormatted = formData.dataParecerTecnico 
      ? `${new Date(formData.dataParecerTecnico + 'T12:00:00').getDate().toString().padStart(2, '0')} de ${months[new Date(formData.dataParecerTecnico + 'T12:00:00').getMonth()].toLowerCase()} de ${new Date(formData.dataParecerTecnico + 'T12:00:00').getFullYear()}`
      : "___ de ________ de ____";

    const ptPortariaDateFormatted = formData.dataParecerTecnicoPortaria 
      ? `${new Date(formData.dataParecerTecnicoPortaria + 'T12:00:00').getDate().toString().padStart(2, '0')} de ${months[new Date(formData.dataParecerTecnicoPortaria + 'T12:00:00').getMonth()].toLowerCase()} de ${new Date(formData.dataParecerTecnicoPortaria + 'T12:00:00').getFullYear()}`
      : "___ de ________ de ____";

    let art34Text = "";
    const volumeValue = parseFloat((formData.volumeArmazenado || '').replace(',', '.')) || 0;
    const isHighDpa = formData.dpa === 'Médio' || formData.dpa === 'Alto';
    const isLargeVolume = volumeValue >= 3;

    if (isHighDpa || isLargeVolume) {
      const reason = isLargeVolume 
        ? "por apresentar volume maior que 3hm³" 
        : `por apresentar Dano Potencial Associado (DPA) ${formData.dpa}`;
      
      art34Text = `Art. 3º A barragem objeto deste ato, ${reason}, está submetida à Lei nº 12.334, de 20 de setembro de 2010, atualizada pela Lei 14.066 de 30 de setembro de 2020.\n\nArt. 4º O empreendedor deverá atender as condicionantes constantes no item 5.1 do Parecer Técnico Nº ${formData.parecerTecnico || '__________'}.\n\nArt. 5º O empreendedor é o responsável pela segurança da barragem, esteja ela submetida ou não à referida Lei, devendo zelar pela sua manutenção e operação, de maneira a reduzir a possibilidade de acidente e suas consequências.\n\nArt. 6° Este ato substitui a Portaria n° ${formData.portariaNumero || '__________'} de ${formData.dataPortaria ? new Date(formData.dataPortaria + 'T12:00:00').toLocaleDateString('pt-BR') : '___/___/_____'} em virtude da transferência de titularidade.\n\nArt. 7º Compete inteiramente ao empreendedor a responsabilidade pela classificação da segurança da barragem e pelo cumprimento das obrigações elencadas no Parecer Técnico n° ${formData.parecerTecnico || '__________'}.\n\nArt. 8° Esta Portaria entra em vigor na data de sua publicação.`;
    } else {
       art34Text = `Art. 3º A barragem objeto deste ato, por apresentar Dano Potencial Associado Baixo, altura do maciço menor que quinze metros e capacidade total do reservatório menor que três hectômetros cúbicos, não está submetida à Lei nº 12.334, de 20 de setembro de 2010, atualizada pela Lei 14.066 de 30 de setembro de 2020.\n\nArt. 4º O empreendedor é o responsável pela segurança da barragem, esteja ela submetida ou não à referida Lei, devendo zelar pela sua manutenção e operação, de maneira a reduzir a possibilidade de acidente e suas consequências.\n\nArt. 5° Este ato substitui a Portaria n° ${formData.portariaNumero || '__________'} de ${formData.dataPortaria ? new Date(formData.dataPortaria + 'T12:00:00').toLocaleDateString('pt-BR') : '___/___/_____'} em virtude da transferência de titularidade.\n\nArt. 6º Compete inteiramente ao empreendedor a responsabilidade pela classificação da segurança da barragem e pelo cumprimento das obrigações elencadas no Parecer Técnico n° ${formData.parecerTecnico || '__________'}.\n\nArt. 7° Esta Portaria entra em vigor na data de sua publicação.`;
    }

    const volumeNomenclature = getClassificacaoVolume(formData.volumeArmazenado);
    const roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
    let finalItems = [];
    let currentIndex = 0;
    finalItems.push(`${roman[currentIndex++]}.\tCódigo SNISB: ${formData.snisb || '__________'};`);
    finalItems.push(`${roman[currentIndex++]}.\tDano Potencial Associado: ${formData.dpa};`);
    if (formData.barragemTipoClassificacao !== 'pré-classificação') {
      finalItems.push(`${roman[currentIndex++]}.\tCategoria de Risco: ${formData.cri};`);
    }
    finalItems.push(`${roman[currentIndex++]}.\tClassificação quanto ao volume: ${volumeNomenclature}`);
    finalItems.push(`${roman[currentIndex++]}.\tEmpreendedor: ${formData.novoProprietario} ${formData.novoTipoDoc} n° ${formData.novoDoc}`);
    finalItems.push(`${roman[currentIndex++]}.\tMunicípio/UF: ${formData.municipio}/MT;`);
    finalItems.push(`${roman[currentIndex++]}.\tCoordenadas Geográficas: ${formData.latGMS || '__________'} , ${formData.longGMS || '__________'};`);
    finalItems.push(`${roman[currentIndex++]}.\tAltura (m): ${formData.alturaMaxima || '__________'};`);
    finalItems.push(`${roman[currentIndex++]}.\tVolume (hm³): ${formData.volumeArmazenado || '__________'};`);
    finalItems.push(`${roman[currentIndex++]}.\tCurso d’água barrado: ${formData.nomeCursoAgua}, UPG ${formData.upg}, ${formData.subBacia}.`);

    return `PORTARIA DE ${tipoClassificacao.toUpperCase()} DE ${tipoBarragem.toUpperCase()} N° ${portariaNova} DE ${dataPortariaNova}
 
 ${capitalizedTipoClassificacao} quanto à Segurança da ${tipoBarragem} existente no ${formData.nomeCursoAgua}, UPG ${formData.upg}, ${formData.subBacia}, município de ${formData.municipio}/MT, empreendedor ${formData.novoProprietario}.
 
 A Secretária Adjunta de Licenciamento Ambiental e Recursos Hídricos, Lilian Ferreira dos Santos, no uso das atribuições que lhe confere o Art. 118, do Decreto nº 1.599, de 06 de agosto de 2025, e
 
 Considerando o disposto no art. 7º, da Lei 12.334, de 20 de setembro de 2010, que estabelece a Política Nacional de Segurança de Barragens;
 
 Considerando a Resolução CNRH n° 241, de 10 de setembro de 2024 que estabelece critérios gerais de classificação de barragens por dano potencial associado, por volume e por categoria de risco, em andamento ao art.7° da Lei 12.334, de 20 de setembro de 2010;
 
 ${dpaParag}Considerando a Instrução Normativa nº 08, de 19 de dezembro de 2023, que dispõe sobre os procedimentos referentes à Classificação quanto à Segurança de Barragens para usos de múltiplos, exceto para geração de energia, em corpos hídricos de dominialidade do Estado de Mato Grosso e dá outras providências. 
 
 Considerando o Parecer Técnico n° ${formData.parecerTecnicoPortaria || '__________'} CSB/SEMA, de ${ptPortariaDateFormatted}, do processo ${formData.nProcesso || '__________'}.

RESOLVE:

Art. 1º Classificar a Barragem localizada no município de ${formData.municipio}/MT ao Dano Potencial Associado e ao volume, conforme discriminado abaixo: 

${finalItems.join('\n')}

Art. 2º A SEMA, a seu critério ou por solicitação do empreendedor, poderá rever a classificação da barragem, com a devida justificativa.

${art34Text}

LILIAN FERREIRA DOS SANTOS
Secretária Adjunta de Licenciamento Ambiental e Recursos Hídricos
GSALARH/SEMA-MT`;
  };

  const handleSavePortariaDocx = async () => {
    try {
      const text = formData.customPortariaText || generatePortariaText();
      const lines = text.split('\n');
      
      const doc = new Document({
        styles: {
          paragraphStyles: [
            {
              id: "Normal",
              name: "Normal",
              run: {
                font: "Nexa Light",
                size: 22,
              },
              paragraph: {
                alignment: AlignmentType.JUSTIFIED,
                spacing: { line: 360, after: 0 },
              },
            },
          ],
        },
        sections: [{
          properties: {
             page: {
                size: {
                   width: 11906, // A4 width
                   height: 16838, // A4 height
                },
                margin: {
                   top: 1417, // 2.5cm
                   right: 1417,
                   bottom: 1417,
                   left: 1701, // 3cm
                }
             }
          },
          children: lines.map(line => {
             const cleanLine = line.trim();
             if (!cleanLine) return new Paragraph({ children: [] });

            if (cleanLine.startsWith("PORTARIA DE")) {
              return new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: cleanLine, bold: true, size: 24, font: "Nexa Light" })],
                spacing: { after: 0 }
              });
            }
            if (cleanLine.includes("quanto à Segurança da")) {
              return new Paragraph({
                alignment: AlignmentType.JUSTIFIED,
                indent: { start: 4536 }, // 8cm
                children: [new TextRun({ text: cleanLine, bold: true, size: 22, font: "Nexa Light" })],
                spacing: { after: 0 }
              });
            }
            if (cleanLine.includes("A Secretária Adjunta") || cleanLine.includes("Considerando") || cleanLine.includes("Art.") || cleanLine.includes("RESOLVE:")) {
               let children: TextRun[] = [];
               if (cleanLine.includes("Lilian Ferreira dos Santos")) {
                  const parts = cleanLine.split("Lilian Ferreira dos Santos");
                  children = [
                    new TextRun({ text: parts[0], size: 22, font: "Nexa Light" }),
                    new TextRun({ text: "Lilian Ferreira dos Santos", bold: true, size: 22, font: "Nexa Light" }),
                    new TextRun({ text: parts[1], size: 22, font: "Nexa Light" })
                  ];
               } else {
                  children = [new TextRun({ text: cleanLine, size: 22, font: "Nexa Light" })];
               }

               return new Paragraph({
                alignment: AlignmentType.JUSTIFIED,
                indent: { firstLine: 850 }, // 1.5cm indent
                children,
                spacing: { after: 0 }
              });
            }
            if (cleanLine.match(/^[IVX]+\.\t/)) {
               return new Paragraph({
                alignment: AlignmentType.JUSTIFIED,
                indent: { start: 1700 }, // Corresponds to ruler 3
                children: [new TextRun({ text: cleanLine, size: 22, font: "Nexa Light" })],
                spacing: { after: 0 }
              });
            }
            if (["LILIAN FERREIRA DOS SANTOS", "Secretária Adjunta de Licenciamento Ambiental e Recursos Hídricos", "GSALARH/SEMA-MT"].includes(cleanLine)) {
               return new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: cleanLine, bold: cleanLine === "LILIAN FERREIRA DOS SANTOS", size: 22, font: "Nexa Light" })],
                spacing: { before: cleanLine === "LILIAN FERREIRA DOS SANTOS" ? 800 : 0, after: 0 }
              });
            }
            return new Paragraph({ 
              children: [new TextRun({ text: cleanLine, size: 22, font: "Nexa Light" })], 
              alignment: AlignmentType.JUSTIFIED,
              indent: { firstLine: 850 }
            });
          })
        }]
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `Portaria_Transferencia_${(formData.nProcesso || '').replace(/\//g, '_') || 'Titularidade'}.docx`);
      await logActivity('DOWNLOAD_DOCUMENT', { type: 'Transferência de Titularidade (Portaria)', doc: formData.nProcesso, interessado: formData.antigoProprietario });
      toast.success("Portaria DOCX gerada com sucesso!");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao gerar Portaria DOCX.");
    }
  };

  const handleCopyPortaria = () => {
    const text = formData.customPortariaText || generatePortariaText();
    navigator.clipboard.writeText(text);
    toast.success("Texto da portaria copiado!");
  };

  const renderPortariaPreview = (text: string) => {
    return text.split('\n').map((line, i) => {
      const cleanLine = line.trim();
      if (!cleanLine) return <div key={i} className="h-4" />;

      if (cleanLine.includes("quanto à Segurança da") || cleanLine.startsWith("PORTARIA DE")) {
        const isHeader = cleanLine.startsWith("PORTARIA DE");
        return (
          <div key={i} className={`font-bold text-justify mb-6 leading-tight ${isHeader ? 'text-center uppercase text-[12pt]' : 'ml-[20%] md:ml-[30%]'}`}>
            {cleanLine}
          </div>
        );
      }

      if (cleanLine.includes("A Secretária Adjunta")) {
        const parts = cleanLine.split("Lilian Ferreira dos Santos");
        return (
          <div key={i} className="text-justify indent-12 mb-4 font-nexa">
            {parts[0]}
            <span className="font-bold">Lilian Ferreira dos Santos</span>
            {parts[1] || ""}
          </div>
        );
      }

      if (["LILIAN FERREIRA DOS SANTOS", "Secretária Adjunta de Licenciamento Ambiental e Recursos Hídricos", "GSALARH/SEMA-MT"].includes(cleanLine)) {
        return (
          <div key={i} className={`text-center font-nexa ${cleanLine === "LILIAN FERREIRA DOS SANTOS" ? "font-bold mt-12" : ""}`}>
            {cleanLine}
          </div>
        );
      }

      const isItem = cleanLine.match(/^[IVX]+\.\t/);
      return (
        <div key={i} className={`text-justify mb-2 font-nexa ${isItem ? 'ml-16' : 'indent-12'}`}>
          {cleanLine}
        </div>
      );
    });
  };

  const [isEditingPortaria, setIsEditingPortaria] = useState(false);

  const handleDocChange = (field: 'antigoDoc' | 'novoDoc', type: 'CPF' | 'CNPJ', value: string) => {
    const masked = type === 'CPF' ? maskCPF(value) : maskCNPJ(value);
    setFormData(p => ({ ...p, [field]: masked }));
  };

  const [expandedBlocks, setExpandedBlocks] = useState({
    pedido: true,
    docs: true,
    revisar: true,
    portaria: true
  });

  const handleDocToggle = (id: string) => {
    setFormData(prev => ({
      ...prev,
      docs: prev.docs.map(doc => doc.id === id ? { ...doc, checked: !doc.checked } : doc)
    }));
  };

  const updateDocData = (id: string, field: 'extraInput' | 'pageNumber' | 'label', value: string) => {
    setFormData(prev => ({
      ...prev,
      docs: prev.docs.map(doc => doc.id === id ? { ...doc, [field]: value } : doc)
    }));
  };

  const getDocLabel = (doc: DocItem) => {
    switch(doc.id) {
      case 'portaria': return `Cópia da portaria de ${formData.tipoClassificacao} n° ${formData.portariaNumero || '...'}`;
      case 'parecer': return `Parecer Técnico n° ${formData.parecerTecnico || '...'}`;
      case 'art': return `Anotação de Responsabilidade Técnica (ART) de ${formData.responsavelTecnico || '...'} n° ${formData.artNumero || '...'}, em nome do atual contratante`;
      case 'anuencia': return `Carta de anuência do antigo titular ${formData.antigoProprietario || '...'}, manifestando concordância com a transferência da titularidade da portaria à ${formData.novoProprietario || '...'}`;
      default: return doc.label;
    }
  };

  const handleAddOutro = () => {
    const newId = `outro_${Date.now()}`;
    setFormData(prev => ({
      ...prev,
      docs: [...prev.docs, { id: newId, label: 'OUTRO', checked: true, extraInput: '', pageNumber: '' }]
    }));
  };

  const handleRemoveDoc = (id: string) => {
    setFormData(prev => ({
      ...prev,
      docs: prev.docs.filter(doc => doc.id !== id)
    }));
  };

  const toggleBlock = (block: keyof typeof expandedBlocks) => {
    setExpandedBlocks(prev => ({ ...prev, [block]: !prev[block] }));
  };

  const handleLimpar = () => {
    if (window.confirm("Tem certeza que deseja limpar todo o preenchimento do formulário? Esta ação não pode ser desfeita.")) {
      setFormData({
        ...INITIAL_DATA,
        docs: INITIAL_DOCS.map(doc => ({ ...doc, checked: false, extraInput: '', pageNumber: '' })) as DocItem[]
      });
      toast.success("Formulário limpo com sucesso.");
    }
  };

  const saveToSupabase = async (status: 'rascunho' | 'concluido') => {
    const dbData: any = {
      status,
      analista: formData.analista,
      analista_outro: formData.analistaOutro,
      n_processo: formData.nProcesso,
      snisb: formData.snisb,
      tipo_classificacao: formData.tipoClassificacao,
      data_protocolo: formData.dataProtocolo || null,
      portaria_numero: formData.portariaNumero,
      data_portaria: formData.dataPortaria || null,
      portaria_nova: formData.portariaNova,
      data_portaria_nova: formData.dataPortariaNova || null,
      parecer_tecnico: formData.parecerTecnico,
      data_parecer_tecnico: formData.dataParecerTecnico || null,
      parecer_tecnico_portaria: formData.parecerTecnicoPortaria,
      data_parecer_tecnico_portaria: formData.dataParecerTecnicoPortaria || null,
      responsavel_tecnico: formData.responsavelTecnico,
      art_numero: formData.artNumero,
      nome_fazenda: formData.nomeFazenda,
      zona_endereco: formData.zonaEndereco,
      municipio: formData.municipio,
      lat_gms: formData.latGMS,
      long_gms: formData.longGMS,
      barragem_tipo_classificacao: formData.barragemTipoClassificacao,
      barragem_tipo_classificacao_outro: formData.barragemTipoClassificacaoOutro,
      nome_curso_agua: formData.nomeCursoAgua,
      sub_bacia: formData.subBacia,
      upg: formData.upg,
      altura_maxima: formData.alturaMaxima ? parseFloat(formData.alturaMaxima.toString().replace(',', '.')) : null,
      tipo_barragem: formData.tipoBarragem,
      situacao_empreendimento: formData.situacaoEmpreendimento,
      situacao_empreendimento_outro: formData.situacaoEmpreendimentoOutro,
      volume_armazenado: formData.volumeArmazenado ? parseFloat(formData.volumeArmazenado.toString().replace(',', '.')) : null,
      classificacao_volume: getClassificacaoVolume(formData.volumeArmazenado),
      dpa: formData.dpa,
      cri: formData.cri,
      antigo_proprietario: formData.antigoProprietario,
      antigo_tipo_doc: formData.antigoTipoDoc,
      antigo_doc: formData.antigoDoc,
      novo_proprietario: formData.novoProprietario,
      novo_tipo_doc: formData.novoTipoDoc,
      novo_doc: formData.novoDoc,
      enquadrada_pnsb: formData.enquadradaPNSB,
      classe_enquadramento: formData.classeEnquadramento,
      docs: formData.docs,
      custom_portaria_text: formData.customPortariaText
    };

    if (initialData?.id) {
      dbData.id = initialData.id;
    }

    const { error } = await supabase
      .from('transferencias_titularidade')
      .upsert([dbData]);

    if (error) throw error;
  };

  const handleConcluir = async () => {
    setIsSaving(true);
    try {
      await saveToSupabase('concluido');
      toast.success("Transferência concluída e salva no banco de dados!");
      if (onSave) onSave();
    } catch (error) {
      console.error(error);
      toast.error("Erro ao concluir e salvar no Supabase.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDocx = async () => {
    try {
      const dataProtocolo = formData.dataProtocolo ? new Date(formData.dataProtocolo + 'T12:00:00').toLocaleDateString('pt-BR') : '___/___/_____';
      const dataPortaria = formData.dataPortaria ? new Date(formData.dataPortaria + 'T12:00:00').toLocaleDateString('pt-BR') : '___/___/_____';
      const tipoClassificacao = formData.barragemTipoClassificacao === 'OUTRO' ? formData.barragemTipoClassificacaoOutro : formData.barragemTipoClassificacao;
      const situacaoEmpreendimento = formData.situacaoEmpreendimento === 'OUTRO' ? formData.situacaoEmpreendimentoOutro : formData.situacaoEmpreendimento;
      
      const docsSelecionados = formData.docs
        .filter(doc => doc.checked)
        .map(doc => {
          let label = getDocLabel(doc);
          if (doc.id.startsWith('outro_') || doc.id === 'outro') label = doc.label;
          return `${label}${doc.extraInput ? ` (${doc.extraInput})` : ''}${doc.pageNumber ? ` - Fls. ${doc.pageNumber}` : ''}`;
        });

      const createTableRow = (label: string, value: any) => new TableRow({
        children: [
          new TableCell({ 
            children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20, font: "Cambria" })] })], 
            shading: { fill: "F8FAFC" },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 100, bottom: 100, left: 100, right: 100 }
          }),
          new TableCell({ 
            children: [new Paragraph({ children: [new TextRun({ text: String(value || ''), size: 20, font: "Cambria" })] })],
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 100, bottom: 100, left: 100, right: 100 }
          }),
        ]
      });

      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "GOVERNO DO ESTADO DE MATO GROSSO", bold: true, size: 24, font: "Cambria" }),
                new TextRun({ text: "SECRETARIA DE ESTADO DE MEIO AMBIENTE - SEMA", bold: true, size: 24, font: "Cambria", break: 1 }),
                new TextRun({ text: "PARECER TÉCNICO - CBS/SURH/SEMA-MT", bold: true, size: 24, font: "Cambria", break: 1 }),
              ],
              spacing: { after: 400 }
            }),
            new Paragraph({
              alignment: AlignmentType.LEFT,
              children: [
                new TextRun({ text: `Processo nº: ${formData.nProcesso || '__________'}`, bold: true, size: 22, font: "Cambria" }),
                new TextRun({ text: `${tipoClassificacao || '__________'} quanto à Segurança de ${formData.tipoBarragem || '__________'} - (Código SNISB nº ${formData.snisb || '__________'})`, bold: true, size: 22, font: "Cambria", break: 1 }),
              ],
              spacing: { after: 400 }
            }),
            new Paragraph({ text: "1. HISTÓRICO", heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER, spacing: { after: 400 } }),
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              spacing: { line: 360, after: 200 },
              children: [
                new TextRun(`No dia `),
                new TextRun({ text: dataProtocolo, bold: true }),
                new TextRun(` foi protocolado nesta secretaria sob o protocolo nº `),
                new TextRun({ text: formData.nProcesso || '__________', bold: true }),
                new TextRun(` por meio do qual foi solicitado a transferência de titularidade da Portaria de `),
                new TextRun({ text: tipoClassificacao || '__________', bold: true }),
                new TextRun(` da Barragem n° `),
                new TextRun({ text: formData.portariaNumero || '__________', bold: true }),
                new TextRun(` emitida em `),
                new TextRun({ text: dataPortaria, bold: true }),
                new TextRun(`, anteriormente concedida à `),
                new TextRun({ text: formData.antigoProprietario || '__________', bold: true }),
                new TextRun(`, de `),
                new TextRun({ text: `${formData.antigoTipoDoc} n° ${formData.antigoDoc || '__________'}`, bold: true }),
                new TextRun(`, passando a responsabilidade ao novo interessado `),
                new TextRun({ text: formData.novoProprietario || '__________', bold: true }),
                new TextRun(`, de `),
                new TextRun({ text: `${formData.novoTipoDoc} n° ${formData.novoDoc || '__________'}`, bold: true }),
                new TextRun(`.`),
              ]
            }),
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              spacing: { line: 360, after: 200 },
              children: [
                new TextRun(`Registra-se que a referida Portaria de `),
                new TextRun({ text: tipoClassificacao || '__________', bold: true }),
                new TextRun(` n° `),
                new TextRun({ text: formData.portariaNumero || '__________', bold: true }),
                new TextRun(`, vinculada ao processo `),
                new TextRun({ text: formData.nProcesso || '__________', bold: true }),
                new TextRun(`, trata-se de uma barragem localizada na `),
                new TextRun({ text: formData.nomeFazenda || '__________', bold: true }),
                new TextRun(`, `),
                new TextRun({ text: formData.zonaEndereco || '__________', bold: true }),
                new TextRun(`, na zona `),
                new TextRun({ text: formData.zonaEndereco.toLowerCase(), bold: true }),
                new TextRun(` no município de `),
                new TextRun({ text: `${formData.municipio}/MT`, bold: true }),
                new TextRun(`, sob as coordenadas `),
                new TextRun({ text: formData.latGMS || '__________', bold: true }),
                new TextRun(` e `),
                new TextRun({ text: formData.longGMS || '__________', bold: true }),
                new TextRun(`.`),
              ]
            }),
            new Paragraph({
              text: "O pedido foi instruído pelo novo interessado com o envio dos seguintes documentos:",
              spacing: { before: 200, after: 200 }
            }),
            ...docsSelecionados.map(d => new Paragraph({
              text: d,
              bullet: { level: 0 },
              spacing: { after: 100 }
            })),

            new Paragraph({ text: "2- INFORMAÇÃO ADICIONAL", heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER, spacing: { before: 800, after: 400 } }),
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              spacing: { line: 360, after: 400 },
              children: [
                new TextRun(`A transferência de titularidade da Portaria de Classificação restringe-se exclusivamente à alteração do polo responsável, devendo a estrutura conservar integralmente as mesmas características técnicas, estruturais, operacionais e a classificação quanto a segurança e suas obrigações seguem listados no Parecer Técnico `),
                new TextRun({ text: formData.parecerTecnico || '__________', bold: true }),
                new TextRun(formData.dataParecerTecnico ? ` de ${new Date(formData.dataParecerTecnico).toLocaleDateString('pt-BR')}` : ""),
                new TextRun(`, conforme quadro abaixo:`),
              ]
            }),

            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({ children: [new TableCell({ children: [new Paragraph({ text: "QUADRO 1. RESUMO DO QUADRO DE CLASSIFICAÇÃO", alignment: AlignmentType.CENTER, children: [new TextRun({ bold: true, size: 22 })] })], columnSpan: 2, shading: { fill: "F1F5F9" } })] }),
                createTableRow("Tipo de Classificação:", tipoClassificacao),
                createTableRow("Nome do Curso D’água:", formData.nomeCursoAgua),
                createTableRow("Sub-bacia/Bacia:", formData.subBacia),
                createTableRow("UPG:", formData.upg),
                createTableRow("Município/UF:", `${formData.municipio}/MT`),
                createTableRow("Nome do Empreendedor:", formData.novoProprietario),
                createTableRow("Localização do empreendimento:", formData.nomeFazenda),
                createTableRow(`${formData.novoTipoDoc}:`, formData.novoDoc),
                createTableRow("Número do Processo:", formData.nProcesso),
                createTableRow("Número do SNISB:", formData.snisb),
                createTableRow("DANO POTENCIAL ASSOCIADO:", formData.dpa),
                ...(formData.barragemTipoClassificacao !== 'pré-classificação' ? [createTableRow("CATEGORIA DE RISCO:", formData.cri)] : []),
                createTableRow("Classificação quanto ao volume:", getClassificacaoVolume(formData.volumeArmazenado)),
                createTableRow("Coordenadas:", `${formData.latGMS} e ${formData.longGMS}`),
                createTableRow("Altura:", `${formData.alturaMaxima} m`),
                createTableRow("Tipo de Barragem:", formData.tipoBarragem),
                createTableRow("Volume armazenado (NMM) /(hm³):", formData.volumeArmazenado),
                createTableRow("Situação do empreendimento:", situacaoEmpreendimento),
                createTableRow("Enquadrada na PNSB:", formData.enquadradaPNSB),
                createTableRow("Classe de enquadramento:", formData.classeEnquadramento),
              ]
            }),

            new Paragraph({
              children: [
                new TextRun({ 
                  text: `*Dados extraídos do Parecer Técnico n° ${formData.parecerTecnico || '__________'} emitido em ${formData.dataParecerTecnico ? new Date(formData.dataParecerTecnico + 'T12:00:00').toLocaleDateString('pt-BR') : '___/___/_____'}.`,
                  italics: true,
                  size: 20, // 10pt
                  font: "Cambria"
                })
              ],
              spacing: { before: 100 }
            }),

            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              spacing: { line: 360, before: 400 },
              children: [
                new TextRun(`Salienta-se que o presente parecer técnico não autoriza a execução de obras no barramento, devendo o empreendedor obter previamente as licenças ambientais cabíveis antes de qualquer intervenção, em conformidade com a legislação vigente, quando aplicável. Diante do exposto, esta manifestação técnica limita-se à análise das condicionantes apresentadas, não se tratando de procedimento de reclassificação da barragem, permanecendo inalterada a classificação atualmente atribuída. Ressalta-se que a barragem está localizada em rio de domínio estadual, encontrando-se inserida no cadastro de barragens da Secretaria de Estado de Meio Ambiente do Estado de Mato Grosso (SEMA-MT) e no Sistema Nacional de Informações sobre Segurança de Barragens (SNISB), sob o código n° `),
                new TextRun({ text: formData.snisb || '__________', bold: true }),
                new TextRun(`.`),
              ]
            }),

            new Paragraph({ text: "3. DAS OBRIGAÇÕES DO TITULAR", heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER, spacing: { before: 800, after: 400 } }),
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              spacing: { line: 360, after: 200 },
              children: [
                new TextRun(`Salientamos que é obrigação do atual titular `),
                new TextRun({ text: formData.novoProprietario || '__________', bold: true }),
                new TextRun(` informar ao órgão fiscalizador acerca de qualquer alteração em sua barragem. Outrossim, é responsabilidade do empreendedor realizar a gestão da segurança da barragem e a reparação de possíveis danos decorrentes de rompimento, vazamento ou funcionamento inadequado, independentemente da existência de dolo ou culpa.`),
              ]
            }),
            ...(formData.barragemTipoClassificacao === 'pré-classificação' ? [
              new Paragraph({
                alignment: AlignmentType.JUSTIFIED,
                spacing: { line: 360, before: 200, after: 200 },
                children: [
                  new TextRun(`Por se tratar de uma transferência de titularidade de pré-classificação, o novo titular fica responsável por solicitar a continuidade do processo de classificação.`),
                ]
              })
            ] : []),

            new Paragraph({ text: "4. CONCLUSÃO", heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER, spacing: { before: 800, after: 400 } }),
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              spacing: { line: 360, after: 200 },
              children: [
                new TextRun(`Após analisarmos a documentação apresentada pelo interessado `),
                new TextRun({ text: formData.novoProprietario || '__________', bold: true }),
                new TextRun(` no processo nº `),
                new TextRun({ text: formData.nProcesso || '__________', bold: true }),
                new TextRun(` constatamos que o requerente cumpriu todas as exigências administrativas para a transferência de titularidade da Portaria de `),
                new TextRun({ text: tipoClassificacao || '__________', bold: true }),
                new TextRun(` nº `),
                new TextRun({ text: formData.portariaNumero || '__________', bold: true }),
                new TextRun(` emitida em `),
                new TextRun({ text: dataPortaria, bold: true }),
                new TextRun(`.`),
              ]
            }),
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              text: "Diante do exposto, este parecer é favorável à transferência de titularidade e, consequentemente, à emissão de uma nova portaria de classificação."
            }),
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              spacing: { before: 800 },
              children: [
                new TextRun({ 
                  text: new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()),
                  font: "Cambria",
                  size: 22
                }),
                new TextRun({ 
                  text: "Cuiabá/MT.",
                  font: "Cambria",
                  size: 22,
                  break: 1
                })
              ]
            }),
          ]
        }]
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `Parecer_Transferencia_${(formData.nProcesso || '').replace(/\//g, '_') || 'Titularidade'}.docx`);
      await logActivity('DOWNLOAD_DOCUMENT', { type: 'Transferência de Titularidade (Parecer)', doc: formData.nProcesso, interessado: formData.antigoProprietario });
      toast.success("Documento DOCX gerado e baixado com sucesso!");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao gerar DOCX.");
    }
  };

  const handleSave = async (isFinal: boolean = false) => {
    setIsSaving(true);
    try {
      await saveToSupabase(isFinal ? 'concluido' : 'rascunho');
      toast.success(isFinal ? 'Transferência finalizada e salva no Supabase!' : 'Rascunho salvo no Supabase!');
      if (isFinal && onSave) onSave();
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar no Supabase.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col h-full max-h-[90vh]">
      {/* Header */}
      <div className="bg-emerald-900 p-6 text-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500/20 p-2 rounded-lg">
            <FileText className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-xl font-black italic">Transferência de Titularidade</h2>
            <p className="text-xs text-emerald-200 uppercase font-bold tracking-widest mt-1">
              Novo Módulo Independente
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-[500px] sm:max-w-none">
          <button 
            onClick={() => handleSave(false)}
            disabled={isSaving}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-800 hover:bg-emerald-700 text-white rounded-lg transition-all font-bold text-[10px] uppercase tracking-widest border border-emerald-700 shrink-0"
          >
            <Save className="w-3.5 h-3.5" />
            Salvar Rascunho
          </button>
          
          <button 
            onClick={handleConcluir}
            disabled={isSaving}
            className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-slate-50 text-emerald-700 rounded-lg transition-all font-bold text-[10px] uppercase tracking-widest border border-emerald-100 shadow-sm shrink-0"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Concluir
          </button>

          <button 
            onClick={handleSaveDocx}
            className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-lg transition-all font-bold text-[10px] uppercase tracking-widest border border-slate-200 shadow-sm shrink-0"
          >
            <FileDown className="w-3.5 h-3.5 text-blue-500" />
            Salvar DOCX
          </button>

          <button 
            onClick={handleLimpar}
            className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-red-50 text-red-600 rounded-lg transition-all font-bold text-[10px] uppercase tracking-widest border border-red-100 shadow-sm shrink-0"
          >
            <Eraser className="w-3.5 h-3.5" />
            Limpar
          </button>

          <button 
            onClick={onBack}
            className="p-2 hover:bg-emerald-800 rounded-lg transition-colors shrink-0"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 custom-scrollbar">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Section 1 */}
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <button 
              onClick={() => toggleBlock('pedido')}
              className="w-full p-4 flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition-colors border-b border-slate-100"
            >
              <div className="flex items-center gap-3">
                <div className="bg-emerald-500 text-white p-1.5 rounded-lg">
                  <ClipboardList className="w-4 h-4" />
                </div>
                <h3 className="font-black text-slate-800 uppercase tracking-tight text-sm text-left">1. INFORMAÇÕES DO PEDIDO</h3>
              </div>
              <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${expandedBlocks.pedido ? 'rotate-180' : ''}`} />
            </button>
            {expandedBlocks.pedido && (
              <div className="p-6">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Analista */}
                    <div className="md:col-span-2 space-y-2">
                       <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                          Analista responsavel
                       </label>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="relative group">
                             <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                             <select
                                value={formData.analista}
                                onChange={(e) => setFormData(p => ({ ...p, analista: e.target.value }))}
                                className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 appearance-none transition-all cursor-pointer"
                             >
                                {ANALISTAS.map(a => <option key={a} value={a}>{a}</option>)}
                             </select>
                             <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                                <ChevronDown className="w-4 h-4 text-slate-400" />
                             </div>
                          </div>
                          {formData.analista === 'OUTRO' && (
                             <motion.div 
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="relative group"
                             >
                                <FileText className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                                <input 
                                   type="text"
                                   value={formData.analistaOutro}
                                   onChange={(e) => setFormData(p => ({ ...p, analistaOutro: e.target.value }))}
                                   placeholder="Nome do analista..."
                                   className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                />
                             </motion.div>
                          )}
                       </div>
                    </div>

                    {/* n° do Processo */}
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                          n° do Processo
                       </label>
                       <div className="relative group">
                          <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                          <input 
                             type="text"
                             value={formData.nProcesso}
                             onChange={(e) => setFormData(p => ({ ...p, nProcesso: e.target.value }))}
                             placeholder="Ex: 12345/2024"
                             className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                          />
                       </div>
                    </div>

                    {/* SNISB */}
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                          SNISB
                       </label>
                       <div className="relative group">
                          <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                          <input 
                             type="number"
                             step="1"
                             value={formData.snisb}
                             onChange={(e) => setFormData(p => ({ ...p, snisb: e.target.value }))}
                             placeholder="Informe o número SNISB"
                             className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                          />
                       </div>
                    </div>

                    {/* Tipo de Classificação */}
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                          Tipo de Classificação
                       </label>
                       <div className="flex gap-4">
                          {['Classificação', 'Pré-Classificação'].map((tipo) => (
                             <button
                                key={tipo}
                                onClick={() => setFormData(p => ({ ...p, tipoClassificacao: tipo }))}
                                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all border-2 ${formData.tipoClassificacao === tipo ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-sm' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}
                             >
                                <div className={`w-3 h-3 rounded-full border-2 transition-all ${formData.tipoClassificacao === tipo ? 'border-emerald-500 bg-emerald-500' : 'border-slate-200'}`} />
                                {tipo}
                             </button>
                          ))}
                       </div>
                    </div>

                    {/* Data do Protocolo */}
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                          Data do Protocolo
                       </label>
                       <div className="relative group">
                          <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                          <input 
                             type="date"
                             value={formData.dataProtocolo}
                             onChange={(e) => setFormData(p => ({ ...p, dataProtocolo: e.target.value }))}
                             className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                          />
                       </div>
                    </div>

                    {/* Portaria de ... */}
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                          Portaria de {formData.tipoClassificacao}
                       </label>
                       <div className="relative group">
                          <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                          <input 
                             type="number"
                             step="1"
                             value={formData.portariaNumero}
                             onChange={(e) => setFormData(p => ({ ...p, portariaNumero: e.target.value }))}
                             placeholder="Ex: 123"
                             className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                          />
                       </div>
                    </div>

                    {/* Data da portaria */}
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                          Data da portaria
                       </label>
                       <div className="relative group">
                          <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                          <input 
                             type="date"
                             value={formData.dataPortaria}
                             onChange={(e) => setFormData(p => ({ ...p, dataPortaria: e.target.value }))}
                             className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                          />
                       </div>
                    </div>

                    {/* Portaria Nova */}
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                          Portaria Nova
                       </label>
                       <div className="relative group">
                          <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                          <input 
                             type="text"
                             value={formData.portariaNova}
                             onChange={(e) => setFormData(p => ({ ...p, portariaNova: e.target.value }))}
                             placeholder="Informe o número da nova portaria"
                             className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                          />
                       </div>
                    </div>

                    {/* Data da Nova Portaria */}
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                          Data da Nova Portaria
                       </label>
                       <div className="relative group">
                          <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                          <input 
                             type="date"
                             value={formData.dataPortariaNova}
                             onChange={(e) => setFormData(p => ({ ...p, dataPortariaNova: e.target.value }))}
                             className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                          />
                       </div>
                    </div>

                    {/* Parecer Técnico n° */}
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                          Parecer Técnico n°
                       </label>
                       <div className="relative group">
                          <FileText className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                          <input 
                             type="text"
                             value={formData.parecerTecnico}
                             onChange={(e) => setFormData(p => ({ ...p, parecerTecnico: e.target.value }))}
                             placeholder="Informe o número do parecer"
                             className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                          />
                       </div>
                       <p className="text-[10px] text-slate-400 italic font-medium ml-1">*Parecer da Classificação</p>
                    </div>

                    {/* Data do Parecer Técnico */}
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                          Data do Parecer Técnico
                       </label>
                       <div className="relative group">
                          <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                          <input 
                             type="date"
                             value={formData.dataParecerTecnico}
                             onChange={(e) => setFormData(p => ({ ...p, dataParecerTecnico: e.target.value }))}
                             className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                          />
                       </div>
                       <p className="text-[10px] text-slate-400 italic font-medium ml-1">*Data do Parecer da Classificação</p>
                    </div>

                    {/* Parecer Técnico da Portaria n° */}
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                          Parecer Técnico da Portaria n°
                       </label>
                       <div className="relative group">
                          <FileText className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                          <input 
                             type="text"
                             value={formData.parecerTecnicoPortaria}
                             onChange={(e) => setFormData(p => ({ ...p, parecerTecnicoPortaria: e.target.value }))}
                             placeholder="Informe o número do parecer da portaria"
                             className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                          />
                       </div>
                    </div>

                    {/* Data do Parecer Técnico da Portaria */}
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                          Data do Parecer Técnico da Portaria
                       </label>
                       <div className="relative group">
                          <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                          <input 
                             type="date"
                             value={formData.dataParecerTecnicoPortaria}
                             onChange={(e) => setFormData(p => ({ ...p, dataParecerTecnicoPortaria: e.target.value }))}
                             className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                          />
                       </div>
                    </div>

                    {/* Responsável Técnico */}
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                          Responsável Técnico
                       </label>
                       <div className="relative group">
                          <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                          <input 
                             type="text"
                             value={formData.responsavelTecnico}
                             onChange={(e) => setFormData(p => ({ ...p, responsavelTecnico: e.target.value }))}
                             placeholder="Nome completo do RT"
                             className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                          />
                       </div>
                    </div>

                    {/* ART n° */}
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                          ART n°
                       </label>
                       <div className="relative group">
                          <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                          <input 
                             type="number"
                             step="1"
                             value={formData.artNumero}
                             onChange={(e) => setFormData(p => ({ ...p, artNumero: e.target.value }))}
                             placeholder="Ex: 987654"
                             className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                          />
                       </div>
                    </div>

                    {/* Localização / Nome da Fazenda */}
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                          Localização (Nome da Fazenda)
                       </label>
                       <div className="relative group">
                          <Home className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                          <input 
                             type="text"
                             value={formData.nomeFazenda}
                             onChange={(e) => setFormData(p => ({ ...p, nomeFazenda: e.target.value }))}
                             placeholder="Ex: Fazenda Boa Esperança"
                             className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                          />
                       </div>
                    </div>

                    {/* Endereço / Zona */}
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                          Endereço (Zona Rural/Urbana)
                       </label>
                       <div className="flex gap-4">
                          {['Rural', 'Urbana'].map((zona) => (
                             <button
                                key={zona}
                                onClick={() => setFormData(p => ({ ...p, zonaEndereco: zona }))}
                                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all border-2 ${formData.zonaEndereco === zona ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-sm' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}
                             >
                                <div className={`w-3 h-3 rounded-full border-2 transition-all ${formData.zonaEndereco === zona ? 'border-emerald-500 bg-emerald-500' : 'border-slate-200'}`} />
                                {zona}
                             </button>
                          ))}
                       </div>
                    </div>

                    {/* Município */}
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                          Município
                       </label>
                       <div className="relative group">
                          <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                          <select
                             value={formData.municipio}
                             onChange={(e) => {
                                 const mun = e.target.value;
                                 const upgs = getUpgsForMunicipality(mun);
                                 setFormData(p => ({ 
                                    ...p, 
                                    municipio: mun,
                                    upg: upgs.length === 1 ? upgs[0] : ''
                                 }));
                              }}
                             className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 appearance-none transition-all cursor-pointer"
                          >
                             {MUNICIPIOS.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                             <ChevronDown className="w-4 h-4 text-slate-400" />
                          </div>
                       </div>
                    </div>

                    {/* Coordenadas Geográficas */}
                    <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 bg-emerald-50/30 p-4 rounded-2xl border border-emerald-100/50">
                       <div className="md:col-span-2">
                          <label className="text-[10px] font-black text-emerald-800 uppercase flex items-center gap-2">
                             <MapPin className="w-3 h-3" />
                             Coordenadas Geográficas (GMS)
                          </label>
                       </div>
                       
                       <div className="space-y-2">
                          <label className="text-[9px] font-black text-slate-400 uppercase">Latitude (S)</label>
                          <div className="relative group">
                             <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 group-focus-within:text-emerald-500 transition-colors">LAT</div>
                             <input 
                                type="text"
                                value={formData.latGMS}
                                onChange={(e) => setFormData(p => ({ ...p, latGMS: maskGMS(e.target.value, 'Lat') }))}
                                placeholder="15°10’41,44¨S"
                                className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-sm font-mono font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                             />
                          </div>
                       </div>

                       <div className="space-y-2">
                          <label className="text-[9px] font-black text-slate-400 uppercase">Longitude (O)</label>
                          <div className="relative group">
                             <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 group-focus-within:text-emerald-500 transition-colors">LONG</div>
                             <input 
                                type="text"
                                value={formData.longGMS}
                                onChange={(e) => setFormData(p => ({ ...p, longGMS: maskGMS(e.target.value, 'Long') }))}
                                placeholder="54°13’56,82¨O"
                                className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-sm font-mono font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                             />
                          </div>
                       </div>
                    </div>

                    {/* Informações sobre a barragem */}
                    <div className="md:col-span-2 mt-8 space-y-6 pt-8 border-t border-slate-100">
                       <div className="flex items-center gap-2 mb-2">
                          <div className="w-1.5 h-6 bg-emerald-500 rounded-full" />
                          <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest italic">
                             Informações sobre a barragem
                          </h4>
                       </div>

                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50/50 p-6 rounded-2xl border border-slate-100 shadow-inner">
                          {/* Tipo de Classificação */}
                          <div className="space-y-2">
                             <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                                Tipo de Classificação
                             </label>
                             <div className="relative group">
                                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                <select
                                   value={formData.barragemTipoClassificacao}
                                   onChange={(e) => setFormData(p => ({ ...p, barragemTipoClassificacao: e.target.value }))}
                                   className="w-full bg-white border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 appearance-none transition-all cursor-pointer"
                                >
                                   <option value="classificação">Classificação</option>
                                   <option value="pré-classificação">Pré-Classificação</option>
                                   <option value="reclassificação">Reclassificação</option>
                                   <option value="classificação de reservatório pulmão">Classificação de reservatório pulmão</option>
                                   <option value="OUTRO">OUTRO</option>
                                </select>
                             </div>
                             {formData.barragemTipoClassificacao === 'OUTRO' && (
                                <motion.div 
                                   initial={{ opacity: 0, y: -10 }}
                                   animate={{ opacity: 1, y: 0 }}
                                   className="mt-2"
                                >
                                   <input 
                                      type="text"
                                      value={formData.barragemTipoClassificacaoOutro}
                                      onChange={(e) => setFormData(p => ({ ...p, barragemTipoClassificacaoOutro: e.target.value }))}
                                      placeholder="Descreva o tipo de classificação..."
                                      className="w-full bg-white border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                   />
                                </motion.div>
                             )}
                          </div>

                          {/* Nome do Curso d’água barrado */}
                          <div className="space-y-2">
                             <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2 text-left">
                                Nome do Curso d’água barrado
                             </label>
                             <div className="relative group">
                                <input 
                                   type="text"
                                   value={formData.nomeCursoAgua}
                                   onChange={(e) => setFormData(p => ({ ...p, nomeCursoAgua: e.target.value }))}
                                   placeholder="Nome do rio/córrego..."
                                   className="w-full bg-white border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                />
                             </div>
                          </div>

                          {/* Sub-bacia/Bacia */}
                          <div className="space-y-2">
                             <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                                Sub-bacia/Bacia
                             </label>
                             <div className="relative group">
                                <input 
                                   type="text"
                                   value={formData.subBacia}
                                   onChange={(e) => setFormData(p => ({ ...p, subBacia: e.target.value }))}
                                   placeholder="Informe a bacia hidrográfica..."
                                   className="w-full bg-white border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                />
                             </div>
                          </div>

                          {/* UPG */}
                           <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                                 UPG
                              </label>
                              <div className="relative group">
                                 <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                 <select 
                                    value={formData.upg}
                                    onChange={(e) => setFormData(p => ({ ...p, upg: e.target.value }))}
                                    className="w-full bg-white border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 appearance-none transition-all cursor-pointer"
                                 >
                                    <option value="">Selecione a UPG</option>
                                    {getUpgsForMunicipality(formData.municipio).map(u => (
                                       <option key={u} value={u}>{u}</option>
                                    ))}
                                    <option value="OUTRA">OUTRA</option>
                                 </select>
                              </div>
                           </div>

                           {/* Enquadrada na PNSB */}
                           <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2 text-left">
                                 Enquadrada na PNSB
                              </label>
                              <div className="relative group">
                                 <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                 <select
                                    value={formData.enquadradaPNSB}
                                    onChange={(e) => setFormData(p => ({ ...p, enquadradaPNSB: e.target.value }))}
                                    className="w-full bg-white border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 appearance-none transition-all cursor-pointer"
                                 >
                                    <option value="SIM">SIM</option>
                                    <option value="NÃO">NÃO</option>
                                 </select>
                              </div>
                           </div>

                           {/* Classe de enquadramento */}
                           <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2 text-left">
                                 Classe de enquadramento
                              </label>
                              <div className="relative group">
                                 <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                 <select
                                    value={formData.classeEnquadramento}
                                    onChange={(e) => setFormData(p => ({ ...p, classeEnquadramento: e.target.value }))}
                                    className="w-full bg-white border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 appearance-none transition-all cursor-pointer"
                                 >
                                    <option value="A">A</option>
                                    <option value="B">B</option>
                                    <option value="C">C</option>
                                    <option value="D">D</option>
                                    <option value="N/A">N/A</option>
                                 </select>
                              </div>
                           </div>

                           {/* Altura máxima projetada (m) */}
                          <div className="space-y-2">
                             <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                                Altura máxima projetada (m)
                             </label>
                             <div className="relative group">
                                <input 
                                   type="number"
                                   step="0.01"
                                   value={formData.alturaMaxima}
                                   onChange={(e) => setFormData(p => ({ ...p, alturaMaxima: e.target.value }))}
                                   placeholder="0.00"
                                   className="w-full bg-white border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                />
                             </div>
                          </div>

                          {/* Tipo de Barragem */}
                          <div className="space-y-2">
                             <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                                Tipo de Barragem
                             </label>
                             <div className="relative group">
                                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                <select
                                   value={formData.tipoBarragem}
                                   onChange={(e) => setFormData(p => ({ ...p, tipoBarragem: e.target.value }))}
                                   className="w-full bg-white border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 appearance-none transition-all cursor-pointer"
                                >
                                   <option value="barragem de terra">Barragem de terra</option>
                                   <option value="barragem - tipo reservatório pulmão">Barragem - tipo reservatório pulmão</option>
                                </select>
                             </div>
                          </div>

                          {/* Situação do empreendimento */}
                          <div className="space-y-2">
                             <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                                Situação do empreendimento
                             </label>
                             <div className="relative group">
                                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                <select
                                   value={formData.situacaoEmpreendimento}
                                   onChange={(e) => setFormData(p => ({ ...p, situacaoEmpreendimento: e.target.value }))}
                                   className="w-full bg-white border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 appearance-none transition-all cursor-pointer"
                                >
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
                             </div>
                             {formData.situacaoEmpreendimento === 'OUTRO' && (
                                <motion.div 
                                   initial={{ opacity: 0, y: -10 }}
                                   animate={{ opacity: 1, y: 0 }}
                                   className="mt-2"
                                >
                                   <input 
                                      type="text"
                                      value={formData.situacaoEmpreendimentoOutro}
                                      onChange={(e) => setFormData(p => ({ ...p, situacaoEmpreendimentoOutro: e.target.value }))}
                                      placeholder="Descreva a situação..."
                                      className="w-full bg-white border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                   />
                                </motion.div>
                             )}
                          </div>

                          {/* Volume armazenado (NMM)/(hm³) */}
                          <div className="space-y-2">
                             <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                                Volume armazenado (NMM)/(hm³)
                             </label>
                             <div className="relative group">
                                <input 
                                   type="number"
                                   step="0.01"
                                   value={formData.volumeArmazenado}
                                   onChange={(e) => setFormData(p => ({ ...p, volumeArmazenado: e.target.value }))}
                                   placeholder="0.00"
                                   className="w-full bg-white border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                />
                             </div>
                          </div>

                          {/* DPA */}
                          <div className="space-y-2">
                             <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                                DPA
                             </label>
                             <div className="relative group">
                                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                <select
                                   value={formData.dpa}
                                   onChange={(e) => setFormData(p => ({ ...p, dpa: e.target.value }))}
                                   className="w-full bg-white border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 appearance-none transition-all cursor-pointer"
                                >
                                   <option value="Baixo">Baixo</option>
                                   <option value="Médio">Médio</option>
                                   <option value="Alto">Alto</option>
                                </select>
                             </div>
                          </div>

                          {/* CRI */}
                          {formData.barragemTipoClassificacao !== 'pré-classificação' && (
                            <div className="space-y-2">
                               <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                                  CRI
                               </label>
                               <div className="relative group">
                                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                  <select
                                     value={formData.cri}
                                     onChange={(e) => setFormData(p => ({ ...p, cri: e.target.value }))}
                                     className="w-full bg-white border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 appearance-none transition-all cursor-pointer"
                                  >
                                     <option value="Baixa">Baixa</option>
                                     <option value="Média">Média</option>
                                     <option value="Alta">Alta</option>
                                  </select>
                               </div>
                            </div>
                          )}

                          {/* Classificação quanto ao volume */}
                          <div className="space-y-2">
                             <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                                Classificação quanto ao volume
                             </label>
                             <div className="w-full bg-emerald-50 border border-emerald-100 rounded-xl py-3 px-4 text-sm font-black text-emerald-700 shadow-inner">
                                {getClassificacaoVolume(formData.volumeArmazenado)}
                             </div>
                          </div>
                       </div>
                    </div>

                    {/* Antigo proprietário */}
                    <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                       <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                             Antigo proprietário
                          </label>
                          <div className="relative group">
                             <ExternalLink className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                             <input 
                                type="text"
                                value={formData.antigoProprietario}
                                onChange={(e) => setFormData(p => ({ ...p, antigoProprietario: e.target.value }))}
                                placeholder="Nome do antigo proprietário"
                                className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                             />
                          </div>
                       </div>

                       <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                             Documento (Antigo)
                          </label>
                          <div className="flex gap-2">
                             <div className="flex bg-white rounded-xl border border-slate-200 p-1">
                                {['CPF', 'CNPJ'].map((t) => (
                                   <button
                                      key={t}
                                      onClick={() => setFormData(p => ({ ...p, antigoTipoDoc: t as 'CPF' | 'CNPJ', antigoDoc: '' }))}
                                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${formData.antigoTipoDoc === t ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                   >
                                      {t}
                                   </button>
                                ))}
                             </div>
                             <div className="relative flex-1 group">
                                <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                                <input 
                                   type="text"
                                   value={formData.antigoDoc}
                                   onChange={(e) => handleDocChange('antigoDoc', formData.antigoTipoDoc, e.target.value)}
                                   placeholder={formData.antigoTipoDoc === 'CPF' ? "000.000.000-00" : "00.000.000/0000-00"}
                                   className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                />
                             </div>
                          </div>
                       </div>
                    </div>

                    {/* Novo Proprietário */}
                    <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                       <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                             Novo Proprietário
                          </label>
                          <div className="relative group">
                             <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                             <input 
                                type="text"
                                value={formData.novoProprietario}
                                onChange={(e) => setFormData(p => ({ ...p, novoProprietario: e.target.value }))}
                                placeholder="Nome do novo proprietário"
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3 pl-12 pr-4 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                             />
                          </div>
                       </div>

                       <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                             Documento (Novo)
                          </label>
                          <div className="flex gap-2">
                             <div className="flex bg-slate-50 rounded-xl border border-slate-100 p-1">
                                {['CPF', 'CNPJ'].map((t) => (
                                   <button
                                      key={t}
                                      onClick={() => setFormData(p => ({ ...p, novoTipoDoc: t as 'CPF' | 'CNPJ', novoDoc: '' }))}
                                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${formData.novoTipoDoc === t ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                   >
                                      {t}
                                   </button>
                                ))}
                             </div>
                             <div className="relative flex-1 group">
                                <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                                <input 
                                   type="text"
                                   value={formData.novoDoc}
                                   onChange={(e) => handleDocChange('novoDoc', formData.novoTipoDoc, e.target.value)}
                                   placeholder={formData.novoTipoDoc === 'CPF' ? "000.000.000-00" : "00.000.000/0000-00"}
                                   className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3 pl-12 pr-4 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                />
                             </div>
                          </div>
                       </div>
                    </div>
                 </div>

              </div>
            )}
          </section>

          {/* Section 2 */}
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <button 
               onClick={() => toggleBlock('docs')}
               className="w-full p-4 flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition-colors border-b border-slate-100"
            >
               <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-lg shadow-sm transition-all ${expandedBlocks.docs ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200'}`}>
                     <ClipboardList className="w-4 h-4" />
                  </div>
                  <h3 className={`font-black uppercase tracking-tight text-sm italic transition-colors ${expandedBlocks.docs ? 'text-slate-800' : 'text-slate-400 group-hover:text-slate-600'}`}>
                     {"2. Documentação apresentada"}
                  </h3>
               </div>
               <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${expandedBlocks.docs ? 'rotate-180' : ''}`} />
            </button>

            {expandedBlocks.docs && (
               <div className="p-6">
                 <div className="bg-slate-50/50 rounded-2xl border border-slate-200 overflow-hidden shadow-inner p-2 space-y-2">
                    <div className="bg-white p-3 rounded-xl border border-slate-100 mb-4">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">
                          Documentos Gerais
                       </p>
                    </div>

                    {formData.docs.map((doc) => (
                       <div 
                          key={doc.id}
                          className={`group transition-all duration-300 ${doc.checked ? 'bg-white shadow-md border-emerald-100' : 'hover:bg-white/50 border-transparent'} border rounded-xl overflow-hidden`}
                       >
                          <div className="flex items-start gap-4 p-4">
                             <button
                                onClick={() => handleDocToggle(doc.id)}
                                className={`mt-0.5 w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all ${doc.checked ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-white border-slate-200 text-transparent hover:border-emerald-300'}`}
                             >
                                <Check className="w-3.5 h-3.5" />
                             </button>

                             <div className="flex-1 space-y-4">
                                <div className="flex items-start justify-between gap-4">
                                   <p className={`text-xs font-bold transition-colors ${doc.checked ? 'text-slate-900' : 'text-slate-500'}`}>
                                      {getDocLabel(doc)}
                                   </p>
                                   {(doc.id === 'outro' || doc.id.startsWith('outro_')) && (
                                      <button 
                                         onClick={() => handleRemoveDoc(doc.id)}
                                         className="text-slate-300 hover:text-red-500 transition-colors p-1"
                                      >
                                         <Trash2 className="w-4 h-4" />
                                      </button>
                                   )}
                                </div>

                                {doc.checked && (
                                   <motion.div 
                                      initial={{ opacity: 0, y: -10 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      className="grid grid-cols-1 md:grid-cols-12 gap-4 pb-2"
                                   >
                                      <div className="md:col-span-8 space-y-1.5">
                                         <label className="text-[9px] font-black text-slate-400 uppercase tracking-tighter flex items-center gap-1.5">
                                            Informação Adicional
                                            <span className="font-medium normal-case text-slate-300">(Opcional)</span>
                                         </label>
                                         <input 
                                            type="text"
                                            value={doc.id.startsWith('outro_') || doc.id === 'outro' ? doc.label : doc.extraInput}
                                            onChange={(e) => {
                                               if (doc.id.startsWith('outro_') || doc.id === 'outro') {
                                                  updateDocData(doc.id, 'label', e.target.value);
                                               } else {
                                                  updateDocData(doc.id, 'extraInput', e.target.value);
                                               }
                                            }}
                                            placeholder={doc.id.startsWith('outro_') || doc.id === 'outro' ? "Descreva o documento..." : "Informação complementar..."}
                                            className="w-full bg-emerald-50/30 border border-emerald-100 rounded-lg py-2 px-3 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-300 transition-all shadow-inner"
                                         />
                                      </div>
                                      <div className="md:col-span-4 space-y-1.5">
                                         <label className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">
                                            Folha(s)
                                         </label>
                                         <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold text-slate-300">Fls.</span>
                                            <input 
                                               type="number"
                                               value={doc.pageNumber}
                                               onChange={(e) => updateDocData(doc.id, 'pageNumber', e.target.value)}
                                               placeholder="000"
                                               className="w-full bg-emerald-50/30 border border-emerald-100 rounded-lg py-2 px-3 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-300 transition-all shadow-inner text-center"
                                            />
                                         </div>
                                      </div>
                                   </motion.div>
                                )}
                             </div>
                          </div>
                       </div>
                    ))}

                    <button
                       onClick={handleAddOutro}
                       className="w-full mt-4 flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 hover:border-emerald-300 hover:bg-emerald-50/50 hover:text-emerald-600 transition-all duration-300 group"
                    >
                       <PlusCircle className="w-5 h-5 transition-transform group-hover:rotate-90" />
                       <span className="text-xs font-black uppercase tracking-widest">Adicionar Outro Documento</span>
                    </button>
                 </div>
               </div>
            )}
          </section>

          {/* Section 3 */}
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <button 
              onClick={() => toggleBlock('revisar')}
              className="w-full p-4 flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition-colors border-b border-slate-100"
            >
              <div className="flex items-center gap-3">
                <div className="bg-emerald-500 text-white p-1.5 rounded-lg">
                  <Search className="w-4 h-4" />
                </div>
                <h3 className="font-black text-slate-800 uppercase tracking-tight text-sm text-left">3. REVISAR E EXPORTAR</h3>
              </div>
              <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${expandedBlocks.revisar ? 'rotate-180' : ''}`} />
            </button>
            {expandedBlocks.revisar && (
              <div className="p-6 bg-slate-100/50">
                 <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-2">
                       <Info className="w-4 h-4 text-emerald-600" />
                       <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Visualização em formato A4</p>
                    </div>
                    <button 
                       onClick={handlePrint}
                       className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all font-bold text-xs uppercase tracking-widest text-slate-700 shadow-sm"
                    >
                       <FileDown className="w-4 h-4 text-emerald-600" />
                       Imprimir / Gerar PDF
                    </button>
                 </div>
                 
                 <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
                    <div className="max-h-[800px] overflow-y-auto custom-scrollbar bg-slate-100 p-8">
                       {renderParecer()}
                    </div>
                 </div>
              </div>
            )}
          </section>

          {/* Section 4 */}
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <button 
              onClick={() => toggleBlock('portaria')}
              className="w-full p-4 flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition-colors border-b border-slate-100"
            >
              <div className="flex items-center gap-3">
                <div className="bg-emerald-500 text-white p-1.5 rounded-lg">
                  <FileText className="w-4 h-4" />
                </div>
                <h3 className="font-black text-slate-800 uppercase tracking-tight text-sm text-left">4. PORTARIA</h3>
              </div>
              <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${expandedBlocks.portaria ? 'rotate-180' : ''}`} />
            </button>
            {expandedBlocks.portaria && (
              <div className="p-6 bg-slate-100/50">
                <div className="flex flex-wrap justify-between items-center mb-6 gap-2">
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-emerald-600" />
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Minuta da Portaria em A4</p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={handleCopyPortaria}
                      className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all font-bold text-[10px] uppercase tracking-widest text-slate-700 shadow-sm"
                    >
                      <Copy className="w-3.5 h-3.5 text-blue-500" />
                      Copiar Todo Texto
                    </button>
                    <button 
                      onClick={handleSavePortariaDocx}
                      className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all font-bold text-[10px] uppercase tracking-widest text-slate-700 shadow-sm"
                    >
                      <FileDown className="w-3.5 h-3.5 text-emerald-600" />
                      Salvar DOCX da Portaria
                    </button>
                    <button 
                      onClick={() => setIsEditingPortaria(!isEditingPortaria)}
                      className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg transition-all font-bold text-[10px] uppercase tracking-widest shadow-sm ${isEditingPortaria ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                    >
                      <Edit3 className="w-3.5 h-3.5 text-amber-500" />
                      {isEditingPortaria ? 'Finalizar Edição' : 'Editar Texto da Portaria'}
                    </button>
                    <button 
                      onClick={() => {
                        if (window.confirm("Deseja restaurar o texto para o padrão gerado automaticamente? Suas edições manuais serão perdidas.")) {
                          setFormData(p => ({ ...p, customPortariaText: null }));
                          setIsEditingPortaria(false);
                        }
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all font-bold text-[10px] uppercase tracking-widest text-slate-700 shadow-sm"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-red-500" />
                      Voltar Texto Gerado Automaticamente
                    </button>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden mx-auto max-w-[210mm]">
                  <div className="h-[800px] overflow-y-auto custom-scrollbar p-12 bg-white">
                    {isEditingPortaria ? (
                      <textarea
                        className="w-full h-full p-0 border-none outline-none resize-none font-nexa text-[12pt] leading-relaxed text-justify bg-transparent"
                        value={formData.customPortariaText || generatePortariaText()}
                        onChange={(e) => setFormData(p => ({ ...p, customPortariaText: e.target.value }))}
                        spellCheck={false}
                      />
                    ) : (
                      <div className="font-nexa text-[11pt] leading-relaxed text-slate-800">
                        {renderPortariaPreview(formData.customPortariaText || generatePortariaText())}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
          
          <div className="flex justify-end gap-4 p-4">
            <button
              onClick={() => handleSave(true)}
              className="flex items-center gap-2 px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all font-black uppercase tracking-widest shadow-lg shadow-emerald-600/20"
            >
              <CheckCircle2 className="w-5 h-5" />
              Concluir Parecer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TransferForm;
