import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  CheckCircle,
  ClipboardCheck,
  Droplets,
  Eraser,
  Eye,
  FileDown,
  FileText,
  Layers,
  MapPin,
  PenTool,
  Save,
  Scale,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  LABELS_DOCS_ART,
  LABELS_DOCS_ESPOLIO,
  LABELS_DOCS_GERAIS,
  LABELS_DOCS_IDENTIFICACAO,
  LABELS_DOCS_TECNICOS,
  OPS_ANALISTA,
  OPS_TIPO_BARRAGEM,
  OPS_TIPO_CLASSIFICACAO,
} from '../constants';
import { generateParecerDoc } from '../services/docxService';
import { AuthContext } from '../src/contexts/AuthContext';
import { logActivity } from '../src/lib/auditService';
import {
  saveBarragemMaster,
  syncClassificaProductToAdministra,
} from '../src/services/administraService';
import { supabase } from '../src/supabaseClient';
import {
  buildSuggestedParecerText,
  deriveClassification,
  evaluateCt5Age,
  getUpgOptionsForMunicipality,
  isPreClassificacaoTipo,
} from '../src/utils/opinionCalculations';
import { normalizeCoordinateToGMS } from '../src/utils/coordinateUtils';
import { OperationType, handleSupabaseError } from '../src/utils/supabaseErrorHandler';
import {
  BarramentoData,
  ClassificacaoData,
  DanoEnum,
  DocItem,
  EstruturaHidraulica,
  ParecerData,
  RiscoEnum,
  SolicitacaoVistoriaPrefill,
} from '../types';
import { OpinionPreviewSection } from './opinion/OpinionPreviewSection';
import { Topic1Introducao } from './opinion/Topic1Introducao';
import { Topic2PedidoEmpreendedor } from './opinion/Topic2PedidoEmpreendedor';
import { Topic3Barramentos } from './opinion/Topic3Barramentos';
import { Topic4Dpa } from './opinion/Topic4Dpa';
import { Topic5Cri } from './opinion/Topic5Cri';
import { Topic6ResultadoMatriz } from './opinion/Topic6ResultadoMatriz';
import { Topic8ParecerConclusivo } from './opinion/Topic8ParecerConclusivo';
import ConfirmModal from './ui/ConfirmModal';
import { SolicitarVistoriaModal } from './SolicitarVistoriaModal';

interface OpinionFormProps {
  onBack: () => void;
  initialData?: ParecerData | null;
  readOnly?: boolean;
}

const createDocItem = (label: string, idx: number, prefix: string): DocItem => ({
  id: `${prefix}_${idx}`,
  label,
  checked: false,
  pageNumber: '',
});

const createEmptyStructure = (id: string, count: number): EstruturaHidraulica => ({
  id,
  descricao: `Estrutura Hidráulica ${count.toString().padStart(2, '0')}`,
  vazao: '',
  cotaSoleira: '',
  localizacao: '',
  seguranca: '',
});

const createEmptyBarramento = (id: string, nomePadrao = ''): BarramentoData => ({
  id,
  nome: nomePadrao,
  snisb: '',
  lat: '',
  long: '',
  relacaoBarragemPrincipal: '',
  alturaMaxima: '',
  alturaMaximaFls: '',
  bordaLivre: '',
  bordaLivreFls: '',
  cotaCoroamento: '',
  cotaCoroamentoFls: '',
  comprimentoCoroamento: '',
  comprimentoCoroamentoFls: '',
  larguraCoroamento: '',
  larguraCoroamentoFls: '',
  tipoEstrutural: '',
  tipoFundacao: '',
  idade: '',
  scoreIdade: null,
  cotaNNO: '',
  cotaNMM: '',
  areaNNO: '',
  areaNMM: '',
  volumeNMO: '',
  volumeNMM: '',
  vazaoMaxima: '',
  estruturas: [createEmptyStructure(`${id}_s1`, 1)],
  possuiAdequacao: false,
});

const INITIAL_DATA: ParecerData = {
  protocolo: '',
  analista: '',
  analistaOutro: '',
  data: new Date().toISOString().split('T')[0],
  dataRecebimentoProcesso: '',

  // Tabela 1
  razaoSocial: '',
  cpfCnpj: '',
  localizacao: '',
  numCAR: '',
  municipio: '',
  finalidade: '',
  finalidadeOutro: '',
  situacaoEmpreendimento: '',
  situacaoEmpreendimentoOutro: '',
  cursoAgua: '',
  propriedadesLimites: '',
  subBacia: '',
  upg: '',
  areaBacia: '',
  indicePluviosidade: '',
  legendaTabela1: `*Calculada pelo autor do projeto e indicada nos autos. **Fonte: SIMLAM, ${new Date().getFullYear()}`,

  // Legacy
  interessado: '',
  empreendimento: '',
  coordenadas: '',

  responsaveisTecnicos: [],

  tipoClassificacao: OPS_TIPO_CLASSIFICACAO[0],
  tipoClassificacaoOutro: '',
  tipoBarragem: OPS_TIPO_BARRAGEM[2],
  tipoBarragemOutro: '',

  docsGerais: LABELS_DOCS_GERAIS.map((l, i) => createDocItem(l, i, 'geral')),
  docsGeraisOutro: [
    { id: 'geral_outro_0', label: 'OUTRO', checked: false, pageNumber: '', extraInput: '' },
  ],

  docsIdentificacao: LABELS_DOCS_IDENTIFICACAO.map((item, i) => ({
    ...createDocItem(item.label, i, 'ident'),
    extraInput: item.hasInput ? '' : undefined,
  })),
  docsIdentificacaoOutro: [
    { id: 'ident_outro_0', label: 'OUTRO', checked: false, pageNumber: '', extraInput: '' },
  ],

  espolio: false,
  docsEspolio: LABELS_DOCS_ESPOLIO.map((item, i) => ({
    ...createDocItem(item.label, i, 'espolio'),
    extraInput: item.hasInput ? '' : undefined,
  })),
  docsEspolioOutro: [
    { id: 'espolio_outro_0', label: 'OUTRO', checked: false, pageNumber: '', extraInput: '' },
  ],

  docsArt: LABELS_DOCS_ART.map((l, i) => ({ ...createDocItem(l, i, 'art'), extraInput: '' })),
  docsArtOutro: [
    {
      id: 'art_outro_0',
      label: 'OUTRO',
      checked: false,
      pageNumber: '',
      extraInput: '',
      extraSelect: '',
    },
  ],

  docsTecnicos: LABELS_DOCS_TECNICOS.map((item, i) => ({
    ...createDocItem(item.label, i, 'tec'),
    extraInput: item.hasInput ? '' : undefined,
  })),
  docsTecnicosOutro: [
    { id: 'tec_outro_0', label: 'OUTRO', checked: false, pageNumber: '', extraInput: '' },
  ],

  introducao: '',
  infoBarramento: '',
  barragemPrincipal: createEmptyBarramento('main', ''),
  barragensMontante: [],

  classificacao: {
    dpa1Select: '',
    dpa2Select: '',
    dpa3Select: '',
    dpa4Select: '',
    scoreDpa1: null as unknown as number,
    scoreDpa2: null as unknown as number,
    scoreDpa3: null as unknown as number,
    scoreDpa4: null as unknown as number,
    totalDpa: null as unknown as number,
    dpaClass: '' as DanoEnum,
    rupturaTexto: '',
    legendaDPA:
      '*Classificação do DPA (Dano Potencial Associado) conforme as Faixas de Classificação estabelecidas no item II.4, do Anexo II, da Resolução CNRH Nº 241, de 10 de setembro de 2024',

    criPreClassificacao: false,
    scoreCt1: null as unknown as number,
    scoreCt2: null as unknown as number,
    scoreCt3: null as unknown as number,
    scoreCt4: null as unknown as number,
    scoreCt5: null as unknown as number,
    ct6Select: '',
    scoreCt6: null as unknown as number,

    ec1Select: '',
    scoreEc1: null as unknown as number,
    ec2Select: '',
    scoreEc2: null as unknown as number,
    ec3Select: '',
    scoreEc3: null as unknown as number,
    ec4Select: '',
    scoreEc4: null as unknown as number,
    ec5Select: '',
    scoreEc5: null as unknown as number,

    ps1Select: '',
    scorePs1: null as unknown as number,
    ps2Select: '',
    scorePs2: null as unknown as number,
    ps3Select: '',
    scorePs3: null as unknown as number,
    ps4Select: '',
    scorePs4: null as unknown as number,
    ps5Select: '',
    scorePs5: null as unknown as number,
    ps6Select: '',
    scorePs6: null as unknown as number,

    totalCT: null as unknown as number,
    totalEC: null as unknown as number,
    totalPS: null as unknown as number,
    riskGeral: '' as RiscoEnum,
    valGeral: null as unknown as number,
    riskPercolacao: '' as RiscoEnum,
    valPercolacao: null as unknown as number,
    riskGalgamento: '' as RiscoEnum,
    valGalgamento: null as unknown as number,
    riskGerencial: '' as RiscoEnum,
    valGerencial: null as unknown as number,

    risco: '' as RiscoEnum,
    resumo: 'PENDENTE — DADOS NECESSÁRIOS PARA CLASSIFICAÇÃO',
  },
  parecer_final: '',
  parecerTecnicoNumero: '',
  dataParecerTecnico: '',
  portariaNumero: '',
  dataPortaria: '',
  customPortariaText: null,
  status: 'Rascunho',
  tipo_documento: 'Parecer Técnico',
  sistemaInformacoes: {
    processo: '',
    analista: '',
    municipio: '',
    situacao: 'Aguardando análise',
  },
};

const reconcileDocList = (standardList: DocItem[], savedList: DocItem[] | undefined): DocItem[] => {
  if (!savedList || savedList.length === 0) return standardList;
  return standardList.map((std) => {
    const saved = savedList.find((s) => s.label === std.label);
    return saved ? { ...std, ...saved } : std;
  });
};

const reconcileOtherDocs = (
  fallbackList: DocItem[],
  savedList: DocItem[] | undefined,
  artMode = false
): DocItem[] => {
  if (!savedList || savedList.length === 0) return fallbackList;
  return savedList.map((d) => ({
    ...d,
    extraInput: d.extraInput ?? '',
    ...(artMode ? { extraSelect: d.extraSelect ?? '' } : {}),
  }));
};

const maskCPF = (value: string) =>
  (value || '')
    .replace(/\D/g, '')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})/, '$1-$2')
    .replace(/(-\d{2})\d+?$/, '$1');

const maskCNPJ = (value: string) =>
  (value || '')
    .replace(/\D/g, '')
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})/, '$1-$2')
    .replace(/(-\d{2})\d+?$/, '$1');

const maskCpfCnpj = (value: string) => {
  const digits = (value || '').replace(/\D/g, '');
  return digits.length <= 11 ? maskCPF(value) : maskCNPJ(value);
};

const OpinionForm: React.FC<OpinionFormProps> = ({ onBack, initialData, readOnly = false }) => {
  const { currentUser } = useContext(AuthContext);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant: 'danger' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    variant: 'warning',
  });

  const [formData, setFormData] = useState<ParecerData>(() => {
    if (initialData) {
      const mergedPrincipal: BarramentoData = {
        ...INITIAL_DATA.barragemPrincipal,
        ...(initialData.barragemPrincipal || {}),
        lat: normalizeCoordinateToGMS(initialData.barragemPrincipal?.lat),
        long: normalizeCoordinateToGMS(initialData.barragemPrincipal?.long),
        estruturas:
          initialData.barragemPrincipal?.estruturas &&
          initialData.barragemPrincipal.estruturas.length > 0
            ? initialData.barragemPrincipal.estruturas
            : [createEmptyStructure('main_s1', 1)],
      };

      const isPre = isPreClassificacaoTipo(
        initialData.tipoClassificacao,
        initialData.classificacao?.criPreClassificacao
      );

      return {
        ...INITIAL_DATA,
        ...initialData,
        docsGerais: reconcileDocList(INITIAL_DATA.docsGerais, initialData.docsGerais),
        docsGeraisOutro: reconcileOtherDocs(
          INITIAL_DATA.docsGeraisOutro,
          initialData.docsGeraisOutro
        ),
        docsIdentificacao: reconcileDocList(
          INITIAL_DATA.docsIdentificacao,
          initialData.docsIdentificacao
        ),
        docsIdentificacaoOutro: reconcileOtherDocs(
          INITIAL_DATA.docsIdentificacaoOutro,
          initialData.docsIdentificacaoOutro
        ),
        docsEspolio: reconcileDocList(INITIAL_DATA.docsEspolio, initialData.docsEspolio),
        docsEspolioOutro: reconcileOtherDocs(
          INITIAL_DATA.docsEspolioOutro,
          initialData.docsEspolioOutro
        ),
        docsArt: reconcileDocList(INITIAL_DATA.docsArt, initialData.docsArt),
        docsArtOutro: reconcileOtherDocs(
          INITIAL_DATA.docsArtOutro,
          initialData.docsArtOutro,
          true
        ),
        docsTecnicos: reconcileDocList(INITIAL_DATA.docsTecnicos, initialData.docsTecnicos),
        docsTecnicosOutro: reconcileOtherDocs(
          INITIAL_DATA.docsTecnicosOutro,
          initialData.docsTecnicosOutro
        ),
        espolio: Boolean(
          initialData.espolio || initialData.docsEspolio?.some((d) => d.checked)
        ),
        classificacao: {
          ...INITIAL_DATA.classificacao,
          ...(initialData.classificacao || {}),
          criPreClassificacao: isPre,
        },
        barragemPrincipal: mergedPrincipal,
        barragensMontante: (initialData.barragensMontante || []).map((bm, i) => ({
          ...createEmptyBarramento(`montante_${i}`, `Barragem a Montante ${i + 1}`),
          ...bm,
          lat: normalizeCoordinateToGMS(bm.lat),
          long: normalizeCoordinateToGMS(bm.long),
          relacaoBarragemPrincipal: bm.relacaoBarragemPrincipal || '',
          possuiAdequacao: Boolean(bm.possuiAdequacao),
          estruturas:
            bm.estruturas && bm.estruturas.length > 0
              ? bm.estruturas
              : [createEmptyStructure(`montante_${i}_s1`, 1)],
        })),
      };
    }

    return {
      ...INITIAL_DATA,
      id: crypto.randomUUID(),
    };
  });

  const [isSaving, setIsSaving] = useState(false);
  const [solicitarVistoriaOpen, setSolicitarVistoriaOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('introducao');
  const [isManualParecerEdited, setIsManualParecerEdited] = useState(() =>
    Boolean(initialData?.parecer_final && initialData.parecer_final.trim().length > 0)
  );
  const navRef = useRef<HTMLDivElement>(null);

  const [openSections, setOpenSections] = useState({
    introducao: true,
    pedido: true,
    barramento: true,
    dpa: true,
    cri: true,
    resultado: true,
    parecer: true,
    revisar: true,
    geral: true,
    ident: false,
    espolio: false,
    art: false,
    tecnico: false,
  });

  const derived = useMemo(() => deriveClassification(formData), [formData]);

  const hideCriSection =
    derived.isPreClassificacao || derived.pnsb.status === 'nao_enquadrada';

  const solicitacaoPrefill = useMemo<SolicitacaoVistoriaPrefill>(() => {
    const latGms = normalizeCoordinateToGMS(formData.barragemPrincipal?.lat);
    const longGms = normalizeCoordinateToGMS(formData.barragemPrincipal?.long);
    const coords =
      [latGms, longGms].filter(Boolean).join(' / ') || formData.coordenadas || null;

    return {
      barragem_id: formData.barragemId || formData.barragemPrincipal?.barragemId || null,
      barragem_nome: formData.barragemPrincipal?.nome || null,
      municipio: formData.municipio || null,
      curso_agua: formData.cursoAgua || null,
      coordenadas: coords,
      empreendedor_id: formData.empreendedorId || null,
      empreendedor_nome: formData.razaoSocial || formData.interessado || null,
      processo: formData.protocolo || formData.sistemaInformacoes?.processo || null,
      classificacao_atual: derived.resultado.label || null,
      dpa: derived.dpa.dpaClass || null,
      cri: hideCriSection ? null : derived.cri?.risco || null,
    };
  }, [
    formData.barragemId,
    formData.barragemPrincipal?.barragemId,
    formData.barragemPrincipal?.nome,
    formData.barragemPrincipal?.lat,
    formData.barragemPrincipal?.long,
    formData.municipio,
    formData.cursoAgua,
    formData.coordenadas,
    formData.empreendedorId,
    formData.razaoSocial,
    formData.interessado,
    formData.protocolo,
    formData.sistemaInformacoes?.processo,
    derived.resultado.label,
    derived.dpa.dpaClass,
    derived.cri?.risco,
    hideCriSection,
  ]);

  const sections = useMemo(() => {
    if (derived.isPreClassificacao) {
      return [
        { id: 'introducao', label: '1. Introdução', icon: FileText },
        { id: 'pedido', label: '2. Empreendedor e Pedido', icon: Activity },
        { id: 'barramento', label: '3. Barramentos', icon: MapPin },
        { id: 'dpa', label: '4. Volume e DPA', icon: Droplets },
        { id: 'resultado', label: '5. Pré-Classificação', icon: Scale },
        { id: 'parecer', label: '6. Parecer Conclusivo', icon: PenTool },
        { id: 'revisar', label: '7. Revisão', icon: Eye },
      ];
    }

    if (derived.pnsb.status === 'nao_enquadrada') {
      return [
        { id: 'introducao', label: '1. Introdução', icon: FileText },
        { id: 'pedido', label: '2. Empreendedor e Pedido', icon: Activity },
        { id: 'barramento', label: '3. Barramentos', icon: MapPin },
        { id: 'dpa', label: '4. Volume e DPA', icon: Droplets },
        { id: 'resultado', label: '5. Resultado', icon: Scale },
        { id: 'parecer', label: '6. Parecer Conclusivo', icon: PenTool },
        { id: 'revisar', label: '7. Revisão', icon: Eye },
      ];
    }

    return [
      { id: 'introducao', label: '1. Introdução', icon: FileText },
      { id: 'pedido', label: '2. Empreendedor e Pedido', icon: Activity },
      { id: 'barramento', label: '3. Barramentos', icon: MapPin },
      { id: 'dpa', label: '4. Volume e DPA', icon: Droplets },
      { id: 'cri', label: '5. CRI', icon: Layers },
      { id: 'resultado', label: '6. Resultado e Matriz', icon: Scale },
      { id: 'parecer', label: '7. Parecer Conclusivo', icon: PenTool },
      { id: 'revisar', label: '8. Revisão', icon: Eye },
    ];
  }, [derived.isPreClassificacao, derived.pnsb.status]);

  const currentStepIndex = Math.max(
    0,
    sections.findIndex((s) => s.id === activeSection)
  );
  const progressPercent = ((currentStepIndex + 1) / sections.length) * 100;

  // Pré-seleciona analista com base no usuário autenticado sem inventar lista
  useEffect(() => {
    if (currentUser?.name && !initialData && !formData.analista) {
      const userName = currentUser.name.trim().toLowerCase();
      const matchedAnalista = OPS_ANALISTA.find(
        (name) =>
          name.trim().toLowerCase().includes(userName) ||
          userName.includes(name.trim().toLowerCase())
      );
      if (matchedAnalista) {
        setFormData((prev) => ({ ...prev, analista: matchedAnalista }));
      }
    }
  }, [currentUser, initialData, formData.analista]);

  // Atualiza texto conclusivo sugerido apenas quando não houve edição manual e o cálculo está completo
  useEffect(() => {
    if (readOnly || isManualParecerEdited || !derived.resultado.isComplete) return;
    const suggested = buildSuggestedParecerText(formData, derived);
    if (!suggested || suggested === formData.parecer_final) return;

    setFormData((prev) =>
      prev.parecer_final === suggested ? prev : { ...prev, parecer_final: suggested }
    );
  }, [
    readOnly,
    isManualParecerEdited,
    derived,
    formData.tipoClassificacao,
    formData.tipoClassificacaoOutro,
    formData.barragemPrincipal.snisb,
    formData.barragemPrincipal.volumeNMM,
    formData.barragemPrincipal.alturaMaxima,
    formData.parecer_final,
  ]);

  // Scroll Spy
  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const sectionIds = sections.map((s) => s.id);
          const offset = 220;

          for (let i = sectionIds.length - 1; i >= 0; i--) {
            const sectionId = sectionIds[i];
            const el = document.getElementById(sectionId);
            if (el && el.getBoundingClientRect().top < offset) {
              setActiveSection(sectionId);
              break;
            }
          }
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [sections]);

  useEffect(() => {
    if (navRef.current) {
      const activeBtn = navRef.current.querySelector(
        `[data-section="${activeSection}"]`
      ) as HTMLElement | null;
      if (activeBtn) {
        const container = navRef.current;
        const scrollLeft =
          activeBtn.offsetLeft - container.offsetWidth / 2 + activeBtn.offsetWidth / 2;
        container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
      }
    }
  }, [activeSection]);

  const toggleSection = (sec: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [sec]: !prev[sec] }));
  };

  const handleInputChange = (field: keyof ParecerData, value: any) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };

      // Preenche automaticamente UPG somente quando única; preserva quando houver múltiplas opções
      if (field === 'municipio') {
        const upgs = getUpgOptionsForMunicipality(value);
        if (upgs.length === 1) {
          updated.upg = upgs[0];
        } else if (!value) {
          updated.upg = '';
        }
      }

      if (field === 'tipoClassificacao') {
        const isPre = isPreClassificacaoTipo(value, false);
        updated.classificacao = {
          ...prev.classificacao,
          criPreClassificacao: isPre,
        };
      }

      return updated;
    });
  };

  const handleClassificationChange = (field: keyof ClassificacaoData, value: any) => {
    setFormData((prev) => ({
      ...prev,
      classificacao: {
        ...prev.classificacao,
        [field]: value,
      },
    }));
  };

  // --- RT Handlers ---
  const handleRemoveRT = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      responsaveisTecnicos: prev.responsaveisTecnicos.filter((rt) => rt.id !== id),
    }));
  };

  // --- Document Handlers ---
  const handleDocChange = (
    listKey: keyof ParecerData,
    id: string,
    field: keyof DocItem,
    value: any
  ) => {
    setFormData((prev) => {
      const list = prev[listKey];
      if (Array.isArray(list)) {
        const newList = list.map((item) =>
          item.id === id ? { ...item, [field]: value } : item
        );
        return { ...prev, [listKey]: newList };
      }
      return prev;
    });
  };

  const handleAddOtherDoc = (listKey: keyof ParecerData, prefix: string) => {
    setFormData((prev) => {
      const list = prev[listKey] as DocItem[];
      const newId = `${prefix}_outro_${Date.now()}_${list.length}`;
      const newItem: DocItem = {
        id: newId,
        label: 'OUTRO',
        checked: true,
        pageNumber: '',
        extraInput: '',
        ...(listKey === 'docsArtOutro' ? { extraSelect: '' } : {}),
      };
      return { ...prev, [listKey]: [...list, newItem] };
    });
  };

  const handleRemoveOtherDoc = (listKey: keyof ParecerData, id: string) => {
    setFormData((prev) => {
      const list = prev[listKey] as DocItem[];
      if (list.length <= 1) return prev;
      return { ...prev, [listKey]: list.filter((item) => item.id !== id) };
    });
  };

  // --- Barramento Handlers ---
  const updateBarramento = (
    isMain: boolean,
    idx: number,
    field: keyof BarramentoData,
    value: any
  ) => {
    setFormData((prev) => {
      const additionalUpdates: Partial<BarramentoData> =
        field === 'idade'
          ? { scoreIdade: evaluateCt5Age(value).score }
          : {};

      if (isMain) {
        return {
          ...prev,
          barragemPrincipal: { ...prev.barragemPrincipal, [field]: value, ...additionalUpdates },
        };
      }

      const newArr = [...prev.barragensMontante];
      newArr[idx] = { ...newArr[idx], [field]: value, ...additionalUpdates };
      return { ...prev, barragensMontante: newArr };
    });
  };

  const updateStructure = (
    isMain: boolean,
    barramentoIdx: number,
    structIdx: number,
    field: keyof EstruturaHidraulica,
    value: any
  ) => {
    setFormData((prev) => {
      const targetBarramento = isMain
        ? prev.barragemPrincipal
        : prev.barragensMontante[barramentoIdx];
      const newStructs = [...targetBarramento.estruturas];
      newStructs[structIdx] = { ...newStructs[structIdx], [field]: value };

      if (isMain) {
        return {
          ...prev,
          barragemPrincipal: { ...prev.barragemPrincipal, estruturas: newStructs },
        };
      }

      const newArr = [...prev.barragensMontante];
      newArr[barramentoIdx] = { ...targetBarramento, estruturas: newStructs };
      return { ...prev, barragensMontante: newArr };
    });
  };

  const addStructure = (isMain: boolean, barramentoIdx: number) => {
    setFormData((prev) => {
      const targetBarramento = isMain
        ? prev.barragemPrincipal
        : prev.barragensMontante[barramentoIdx];
      const count = targetBarramento.estruturas.length + 1;
      const newStruct = createEmptyStructure(`${targetBarramento.id}_s${count}_${Date.now()}`, count);

      if (isMain) {
        return {
          ...prev,
          barragemPrincipal: {
            ...prev.barragemPrincipal,
            estruturas: [...prev.barragemPrincipal.estruturas, newStruct],
          },
        };
      }

      const newArr = [...prev.barragensMontante];
      newArr[barramentoIdx] = {
        ...targetBarramento,
        estruturas: [...targetBarramento.estruturas, newStruct],
      };
      return { ...prev, barragensMontante: newArr };
    });
  };

  const removeStructure = (isMain: boolean, barramentoIdx: number, structIdx: number) => {
    setFormData((prev) => {
      const targetBarramento = isMain
        ? prev.barragemPrincipal
        : prev.barragensMontante[barramentoIdx];
      if (targetBarramento.estruturas.length <= 1) return prev;

      const newStructs = targetBarramento.estruturas.filter((_, i) => i !== structIdx);

      if (isMain) {
        return {
          ...prev,
          barragemPrincipal: { ...prev.barragemPrincipal, estruturas: newStructs },
        };
      }

      const newArr = [...prev.barragensMontante];
      newArr[barramentoIdx] = { ...targetBarramento, estruturas: newStructs };
      return { ...prev, barragensMontante: newArr };
    });
  };

  const addUpstreamDam = () => {
    setFormData((prev) => ({
      ...prev,
      barragensMontante: [
        ...prev.barragensMontante,
        createEmptyBarramento(
          `montante_${prev.barragensMontante.length}_${Date.now()}`,
          `Barragem a Montante ${prev.barragensMontante.length + 1}`
        ),
      ],
    }));
  };

  const removeUpstreamDam = (idx: number) => {
    setFormData((prev) => ({
      ...prev,
      barragensMontante: prev.barragensMontante.filter((_, i) => i !== idx),
    }));
  };

  // Snapshot compatível com persistência e DOCX existente sem converter pendências em 0 nem armazenar CRI quando não aplicável
  const buildCompatSnapshot = (): ParecerData => {
    const cls = formData.classificacao;
    const isPre = derived.isPreClassificacao;
    const omitCri = isPre || derived.pnsb.status === 'nao_enquadrada';
    const nullableScore = (value: number | null | undefined): number =>
      (value ?? null) as unknown as number;

    return {
      ...formData,
      barragemPrincipal: {
        ...formData.barragemPrincipal,
        lat: normalizeCoordinateToGMS(formData.barragemPrincipal.lat),
        long: normalizeCoordinateToGMS(formData.barragemPrincipal.long),
        scoreIdade: evaluateCt5Age(formData.barragemPrincipal.idade).score,
      },
      barragensMontante: (formData.barragensMontante || []).map((bm) => ({
        ...bm,
        lat: normalizeCoordinateToGMS(bm.lat),
        long: normalizeCoordinateToGMS(bm.long),
        scoreIdade: evaluateCt5Age(bm.idade).score,
      })),
      classificacao: {
        ...cls,
        criPreClassificacao: isPre,
        dpa1Select: derived.dpa.dpa1?.selectValue || '',
        scoreDpa1: nullableScore(derived.dpa.scoreDpa1),
        scoreDpa2: nullableScore(derived.dpa.scoreDpa2),
        scoreDpa3: nullableScore(derived.dpa.scoreDpa3),
        scoreDpa4: nullableScore(derived.dpa.scoreDpa4),
        totalDpa: nullableScore(derived.dpa.totalDpa),
        dpaClass: (derived.dpa.dpaClass || '') as DanoEnum,
        ...(omitCri
          ? {
              scoreCt1: nullableScore(null),
              scoreCt2: nullableScore(null),
              scoreCt3: nullableScore(null),
              scoreCt4: nullableScore(null),
              scoreCt5: nullableScore(null),
              scoreCt6: nullableScore(null),
              scoreEc1: nullableScore(null),
              scoreEc2: nullableScore(null),
              scoreEc3: nullableScore(null),
              scoreEc4: nullableScore(null),
              scoreEc5: nullableScore(null),
              scorePs1: nullableScore(null),
              scorePs2: nullableScore(null),
              scorePs3: nullableScore(null),
              scorePs4: nullableScore(null),
              scorePs5: nullableScore(null),
              scorePs6: nullableScore(null),
              totalCT: nullableScore(null),
              totalEC: nullableScore(null),
              totalPS: nullableScore(null),
              valGeral: nullableScore(null),
              riskGeral: '' as RiscoEnum,
              valPercolacao: nullableScore(null),
              riskPercolacao: '' as RiscoEnum,
              valGalgamento: nullableScore(null),
              riskGalgamento: '' as RiscoEnum,
              valGerencial: nullableScore(null),
              riskGerencial: '' as RiscoEnum,
              risco: '' as RiscoEnum,
              resumo: derived.resultado.label,
            }
          : {
              scoreCt1: nullableScore(derived.cri?.scoreCt1),
              scoreCt2: nullableScore(derived.cri?.scoreCt2),
              scoreCt3: nullableScore(derived.cri?.scoreCt3),
              scoreCt4: nullableScore(derived.cri?.scoreCt4),
              scoreCt5: nullableScore(derived.cri?.scoreCt5),
              scoreCt6: nullableScore(derived.cri?.scoreCt6),
              scoreEc1: nullableScore(derived.cri?.scoreEc1),
              scoreEc2: nullableScore(derived.cri?.scoreEc2),
              scoreEc3: nullableScore(derived.cri?.scoreEc3),
              scoreEc4: nullableScore(derived.cri?.scoreEc4),
              scoreEc5: nullableScore(derived.cri?.scoreEc5),
              scorePs1: nullableScore(derived.cri?.scorePs1),
              scorePs2: nullableScore(derived.cri?.scorePs2),
              scorePs3: nullableScore(derived.cri?.scorePs3),
              scorePs4: nullableScore(derived.cri?.scorePs4),
              scorePs5: nullableScore(derived.cri?.scorePs5),
              scorePs6: nullableScore(derived.cri?.scorePs6),
              totalCT: nullableScore(derived.cri?.totalCT),
              totalEC: nullableScore(derived.cri?.totalEC),
              totalPS: nullableScore(derived.cri?.totalPS),
              valGeral: nullableScore(derived.cri?.valGeral),
              riskGeral: (derived.cri?.riskGeral || '') as RiscoEnum,
              valPercolacao: nullableScore(derived.cri?.valPercolacao),
              riskPercolacao: (derived.cri?.riskPercolacao || '') as RiscoEnum,
              valGalgamento: nullableScore(derived.cri?.valGalgamento),
              riskGalgamento: (derived.cri?.riskGalgamento || '') as RiscoEnum,
              valGerencial: nullableScore(derived.cri?.valGerencial),
              riskGerencial: (derived.cri?.riskGerencial || '') as RiscoEnum,
              risco: (derived.cri?.risco || '') as RiscoEnum,
              resumo: derived.resultado.label,
            }),
      },
    };
  };

  const [registeringBarragemKey, setRegisteringBarragemKey] = useState<string | null>(null);

  const handleRegisterBarragem = async (isMain: boolean, idx: number, data: BarramentoData) => {
    if (!currentUser) {
      toast.error('Usuário não autenticado para cadastrar no Administra Barragens.');
      return;
    }
    if (!data.nome?.trim()) {
      toast.warning('Informe o nome da barragem antes de cadastrar na base de dados.');
      return;
    }

    const regKey = isMain ? 'main' : `montante_${idx}`;
    setRegisteringBarragemKey(regKey);
    try {
      const barRes = await saveBarragemMaster(
        {
          id: isMain ? formData.barragemId || data.barragemId : data.barragemId,
          empreendedor_id: formData.empreendedorId || undefined,
          snisb: data.snisb || undefined,
          nome: data.nome,
          municipio: formData.municipio || '',
          upg: formData.upg,
          sub_bacia: formData.subBacia,
          curso_agua: formData.cursoAgua,
          localizacao: formData.localizacao,
          lat_gms: normalizeCoordinateToGMS(data.lat) || data.lat,
          long_gms: normalizeCoordinateToGMS(data.long) || data.long,
          altura_maxima: data.alturaMaxima,
          comprimento_coroamento: data.comprimentoCoroamento,
          largura_coroamento: data.larguraCoroamento,
          volume_nmo: data.volumeNMO,
          volume_nmm: data.volumeNMM,
          tipo_estrutural: data.tipoEstrutural,
          tipo_fundacao: data.tipoFundacao,
          finalidade: formData.finalidade,
          situacao: formData.situacaoEmpreendimento,
          dpa_atual: isMain ? derived.dpa.dpaClass || undefined : undefined,
          cri_atual:
            isMain && !derived.isPreClassificacao ? derived.cri?.risco || undefined : undefined,
          sistema_origem: data.sistemaOrigem || formData.sistemaOrigem,
        },
        currentUser
      );

      if (barRes.success && barRes.data?.id) {
        const registeredId = barRes.data.id;
        const orig = barRes.data.sistema_origem || 'CLASSIFICA_CSB';
        setFormData((prev) => {
          if (isMain) {
            return {
              ...prev,
              barragemId: registeredId,
              sistemaOrigem: orig,
              barragemPrincipal: {
                ...prev.barragemPrincipal,
                barragemId: registeredId,
                sistemaOrigem: orig,
              },
            };
          }
          const updatedMont = [...(prev.barragensMontante || [])];
          if (updatedMont[idx]) {
            updatedMont[idx] = {
              ...updatedMont[idx],
              barragemId: registeredId,
              sistemaOrigem: orig,
            };
          }
          return { ...prev, barragensMontante: updatedMont };
        });
        toast.success(`Barragem "${barRes.data.nome}" cadastrada na base do Administra Barragens.`);
      } else {
        toast.error(barRes.message || 'Não foi possível cadastrar a barragem na base de dados.');
      }
    } finally {
      setRegisteringBarragemKey(null);
    }
  };

  const handleUnlinkBarragem = (isMain: boolean, idx: number) => {
    setFormData((prev) => {
      if (isMain) {
        return {
          ...prev,
          barragemId: undefined,
          barragemPrincipal: {
            ...prev.barragemPrincipal,
            barragemId: undefined,
          },
        };
      }
      const updatedMont = [...(prev.barragensMontante || [])];
      if (updatedMont[idx]) {
        updatedMont[idx] = { ...updatedMont[idx], barragemId: undefined };
      }
      return { ...prev, barragensMontante: updatedMont };
    });
  };

  const getConclusaoPendencias = (): string[] => {
    const missingUpstreamRelations = (formData.barragensMontante || [])
      .map((bm, i) =>
        !bm.relacaoBarragemPrincipal
          ? `Relação com a barragem principal (${bm.nome || `Barragem a Montante ${i + 1}`})`
          : null
      )
      .filter((v): v is string => Boolean(v));

    const administraPendencias: string[] = [];
    if (formData.razaoSocial?.trim() && !formData.empreendedorId) {
      administraPendencias.push('Cadastrar Empreendedor na base de dados do Administra');
    }

    const principalFilled = Boolean(
      formData.barragemPrincipal?.nome?.trim() ||
        formData.barragemPrincipal?.lat?.trim() ||
        formData.barragemPrincipal?.long?.trim()
    );
    if (principalFilled && !(formData.barragemId || formData.barragemPrincipal?.barragemId)) {
      administraPendencias.push('Cadastrar Barragem Principal na base de dados do Administra');
    }

    (formData.barragensMontante || []).forEach((bm, i) => {
      const filled = Boolean(bm.nome?.trim() || bm.lat?.trim() || bm.long?.trim());
      if (filled && !bm.barragemId) {
        administraPendencias.push(
          `Cadastrar Barragem a Montante (${bm.nome || `Barragem ${i + 1}`}) na base de dados do Administra`
        );
      }
    });

    (formData.responsaveisTecnicos || []).forEach((rt, i) => {
      if (rt.nome?.trim() && !(rt.rtId || rt.registeredInAdministra)) {
        administraPendencias.push(
          `Cadastrar Responsável Técnico (${rt.nome || `RT ${i + 1}`}) na base de dados do Administra`
        );
      }
    });

    if (
      derived.resultado.isComplete &&
      missingUpstreamRelations.length === 0 &&
      administraPendencias.length === 0
    ) {
      return [];
    }

    const basePending =
      derived.pnsb.status === 'nao_enquadrada'
        ? [...derived.dpa.pendingFields, ...derived.pnsb.pendingFields]
        : derived.resultado.pendingFields;

    return Array.from(
      new Set([...basePending, ...missingUpstreamRelations, ...administraPendencias])
    );
  };

  const handleGenerateDoc = async () => {
    setIsSaving(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 400));
      const snapshot = buildCompatSnapshot();
      await generateParecerDoc(snapshot);
      await logActivity('DOWNLOAD_DOCUMENT', {
        type: 'Parecer Técnico',
        doc: formData.protocolo,
        interessado: formData.razaoSocial,
      });
    } catch (error) {
      console.error(error);
      toast.error('Erro ao gerar documento.');
    } finally {
      setIsSaving(false);
    }
  };

  const saveToSupabase = async (status: 'Rascunho' | 'Concluído') => {
    if (!currentUser) {
      toast.error('Erro: Usuário não autenticado.');
      return;
    }

    if (!formData.protocolo || !formData.razaoSocial || !formData.municipio) {
      toast.error(
        'Por favor, preencha todos os campos obrigatórios (Protocolo, Empreendedor e Município).'
      );
      return;
    }

    if (status === 'Concluído') {
      const pendencias = getConclusaoPendencias();
      if (!derived.resultado.isComplete || pendencias.length > 0) {
        const resumoPendencias =
          pendencias.length > 0
            ? pendencias.join('; ')
            : 'Cálculo de classificação incompleto.';
        toast.error(`Não é possível concluir o parecer com pendências: ${resumoPendencias}`);
        return;
      }
    }

    setIsSaving(true);
    try {
      const snapshot = buildCompatSnapshot();
      const userName = currentUser.name || 'Analista';
      const parecerId = snapshot.id || crypto.randomUUID();
      if (!snapshot.id) {
        setFormData((prev) => ({ ...prev, id: parecerId }));
      }

      const payload = {
        user_id: currentUser.id,
        protocolo: snapshot.protocolo,
        analista: snapshot.analista || userName,
        analista_outro: snapshot.analistaOutro || null,
        data_parecer: snapshot.data || null,
        data_recebimento_processo: snapshot.dataRecebimentoProcesso || null,
        razao_social: snapshot.razaoSocial,
        cpf_cnpj: snapshot.cpfCnpj,
        localizacao: snapshot.localizacao,
        num_car: snapshot.numCAR,
        municipio: snapshot.municipio,
        finalidade: snapshot.finalidade,
        finalidade_outro: snapshot.finalidadeOutro,
        situacao_empreendimento: snapshot.situacaoEmpreendimento,
        situacao_empreendimento_outro: snapshot.situacaoEmpreendimentoOutro,
        curso_agua: snapshot.cursoAgua,
        propriedades_limites: snapshot.propriedadesLimites,
        sub_bacia: snapshot.subBacia,
        upg: snapshot.upg,
        area_bacia: snapshot.areaBacia,
        indice_pluviosidade: snapshot.indicePluviosidade,
        legenda_tabela1: snapshot.legendaTabela1,
        tipo_classificacao: snapshot.tipoClassificacao,
        tipo_classificacao_outro: snapshot.tipoClassificacaoOutro,
        tipo_barragem: snapshot.tipoBarragem,
        tipo_barragem_outro: snapshot.tipoBarragemOutro,
        introducao: snapshot.introducao,
        parecer_final: snapshot.parecer_final,
        parecer_tecnico_numero: snapshot.parecerTecnicoNumero,
        data_parecer_tecnico: snapshot.dataParecerTecnico || null,
        portaria_numero: snapshot.portariaNumero,
        data_portaria: snapshot.dataPortaria || null,
        custom_portaria_text: snapshot.customPortariaText,
        status,
        tipo_documento: 'Parecer Técnico',
        data_conclusao:
          status === 'Concluído'
            ? new Date().toISOString()
            : snapshot.status === 'Concluído'
            ? snapshot.dataConclusao
            : null,
        updated_at: new Date().toISOString(),
        dpa_class: snapshot.classificacao.dpaClass || null,
        dpa1_select: snapshot.classificacao.dpa1Select,
        dpa2_select: snapshot.classificacao.dpa2Select,
        dpa3_select: snapshot.classificacao.dpa3Select,
        dpa4_select: snapshot.classificacao.dpa4Select,
        score_dpa1: snapshot.classificacao.scoreDpa1,
        score_dpa2: snapshot.classificacao.scoreDpa2,
        score_dpa3: snapshot.classificacao.scoreDpa3,
        score_dpa4: snapshot.classificacao.scoreDpa4,
        total_dpa: snapshot.classificacao.totalDpa,
        ruptura_texto: snapshot.classificacao.rupturaTexto,
        legenda_dpa: snapshot.classificacao.legendaDPA,
        cri_pre_classificacao: snapshot.classificacao.criPreClassificacao,
        ct6_select: snapshot.classificacao.ct6Select,
        ec1_select: snapshot.classificacao.ec1Select,
        ec2_select: snapshot.classificacao.ec2Select,
        ec3_select: snapshot.classificacao.ec3Select,
        ec4_select: snapshot.classificacao.ec4Select,
        ec5_select: snapshot.classificacao.ec5Select,
        ps1_select: snapshot.classificacao.ps1Select,
        ps2_select: snapshot.classificacao.ps2Select,
        ps3_select: snapshot.classificacao.ps3Select,
        ps4_select: snapshot.classificacao.ps4Select,
        ps5_select: snapshot.classificacao.ps5Select,
        ps6_select: snapshot.classificacao.ps6Select,
        score_ct1: snapshot.classificacao.scoreCt1,
        score_ct2: snapshot.classificacao.scoreCt2,
        score_ct3: snapshot.classificacao.scoreCt3,
        score_ct4: snapshot.classificacao.scoreCt4,
        score_ct5: snapshot.classificacao.scoreCt5,
        score_ct6: snapshot.classificacao.scoreCt6,
        score_ec1: snapshot.classificacao.scoreEc1,
        score_ec2: snapshot.classificacao.scoreEc2,
        score_ec3: snapshot.classificacao.scoreEc3,
        score_ec4: snapshot.classificacao.scoreEc4,
        score_ec5: snapshot.classificacao.scoreEc5,
        score_ps1: snapshot.classificacao.scorePs1,
        score_ps2: snapshot.classificacao.scorePs2,
        score_ps3: snapshot.classificacao.scorePs3,
        score_ps4: snapshot.classificacao.scorePs4,
        score_ps5: snapshot.classificacao.scorePs5,
        score_ps6: snapshot.classificacao.scorePs6,
        total_ct: snapshot.classificacao.totalCT,
        total_ec: snapshot.classificacao.totalEC,
        total_ps: snapshot.classificacao.totalPS,
        val_geral: snapshot.classificacao.valGeral,
        risk_geral: snapshot.classificacao.riskGeral || null,
        val_percolacao: snapshot.classificacao.valPercolacao,
        risk_percolacao: snapshot.classificacao.riskPercolacao || null,
        val_galgamento: snapshot.classificacao.valGalgamento,
        risk_galgamento: snapshot.classificacao.riskGalgamento || null,
        val_gerencial: snapshot.classificacao.valGerencial,
        risk_gerencial: snapshot.classificacao.riskGerencial || null,
        risco: snapshot.classificacao.risco || null,
        resumo: snapshot.classificacao.resumo,
        empreendedor_id: snapshot.empreendedorId || null,
        barragem_id: snapshot.barragemId || snapshot.barragemPrincipal?.barragemId || null,
        sistema_origem: snapshot.sistemaOrigem || 'CLASSIFICA_CSB',
        data: {
          empreendedorId: snapshot.empreendedorId || null,
          barragemId: snapshot.barragemId || snapshot.barragemPrincipal?.barragemId || null,
          sistemaOrigem: snapshot.sistemaOrigem || 'CLASSIFICA_CSB',
          responsaveisTecnicos: snapshot.responsaveisTecnicos || [],
          barragemPrincipal: snapshot.barragemPrincipal,
          barragensMontante: snapshot.barragensMontante || [],
        },
      };

      let actualParecerId = parecerId;
      const { data: parecerRows, error: parecerError } = await supabase
        .from('pareceres')
        .upsert({ id: parecerId, ...payload })
        .select()
        .single();

      if (parecerError) {
        if (parecerError.code === '42703') {
          const { data: retryData, error: retryError } = await supabase
            .from('pareceres')
            .upsert({
              id: parecerId,
              user_id: currentUser.id,
              analista: snapshot.analista || userName,
              protocolo: snapshot.protocolo,
              status,
              tipo_documento: 'Parecer Técnico',
              data: { ...payload, analista: snapshot.analista || userName },
              updated_at: new Date().toISOString(),
            })
            .select()
            .single();

          if (retryError) {
            await handleSupabaseError(retryError, OperationType.UPSERT, 'pareceres');
          }
          if (retryData) {
            actualParecerId = retryData.id;
          }
        } else {
          await handleSupabaseError(parecerError, OperationType.UPSERT, 'pareceres');
        }
      } else {
        actualParecerId = parecerRows.id;
      }

      const { error: deleteRespError } = await supabase
        .from('parecer_responsaveis')
        .delete()
        .eq('parecer_id', actualParecerId);
      if (deleteRespError) {
        await handleSupabaseError(deleteRespError, OperationType.DELETE, 'parecer_responsaveis');
      }

      const rts = snapshot.responsaveisTecnicos || [];
      if (rts.length > 0) {
        const { error: respError } = await supabase.from('parecer_responsaveis').insert(
          rts.map((rt) => ({
            parecer_id: actualParecerId,
            nome: rt.nome,
            art: rt.art,
            rt_id: rt.rtId || null,
            registered_in_administra: Boolean(rt.rtId || rt.registeredInAdministra),
          }))
        );
        if (respError) {
          if (respError.code === '42703') {
            const { error: respFallbackError } = await supabase.from('parecer_responsaveis').insert(
              rts.map((rt) => ({
                parecer_id: actualParecerId,
                nome: rt.nome,
                art: rt.art,
              }))
            );
            if (respFallbackError) {
              await handleSupabaseError(respFallbackError, OperationType.CREATE, 'parecer_responsaveis');
            }
          } else {
            await handleSupabaseError(respError, OperationType.CREATE, 'parecer_responsaveis');
          }
        }
      }

      const infoPayload = {
        parecer_id: actualParecerId,
        processo: snapshot.protocolo,
        analista:
          snapshot.analista === 'OUTRO'
            ? snapshot.analistaOutro
            : snapshot.analista || userName,
        municipio: snapshot.municipio,
        data_envio_pendencia: snapshot.sistemaInformacoes?.data_envio_pendencia || null,
        data_limite_dias: snapshot.sistemaInformacoes?.data_limite_dias || null,
        situacao: snapshot.sistemaInformacoes?.situacao || 'Aguardando análise',
        observacoes_analista: snapshot.sistemaInformacoes?.observacoes_analista || null,
        updated_at: new Date().toISOString(),
      };

      const { error: infoError } = await supabase
        .from('informacoes_empreendedor')
        .upsert(infoPayload, { onConflict: 'parecer_id' });

      if (infoError) {
        console.error(infoError);
        handleSupabaseError(
          infoError,
          OperationType.UPSERT,
          'informacoes_empreendedor'
        ).catch(console.error);
      }

      const { error: deleteDocsError } = await supabase
        .from('parecer_documentos')
        .delete()
        .eq('parecer_id', actualParecerId);
      if (deleteDocsError) {
        await handleSupabaseError(deleteDocsError, OperationType.DELETE, 'parecer_documentos');
      }

      const allDocs = [
        ...(snapshot.docsGerais || []).map((d) => ({ ...d, grupo: 'Gerais' })),
        ...(snapshot.docsIdentificacao || []).map((d) => ({ ...d, grupo: 'Identificação' })),
        ...(snapshot.docsEspolio || []).map((d) => ({ ...d, grupo: 'Espólio' })),
        ...(snapshot.docsArt || []).map((d) => ({ ...d, grupo: 'ART' })),
        ...(snapshot.docsTecnicos || []).map((d) => ({ ...d, grupo: 'Técnicos' })),
        ...(snapshot.docsGeraisOutro || []).map((d) => ({ ...d, grupo: 'Gerais_Outro' })),
        ...(snapshot.docsIdentificacaoOutro || []).map((d) => ({
          ...d,
          grupo: 'Identificação_Outro',
        })),
        ...(snapshot.docsEspolioOutro || []).map((d) => ({ ...d, grupo: 'Espólio_Outro' })),
        ...(snapshot.docsArtOutro || []).map((d) => ({ ...d, grupo: 'ART_Outro' })),
        ...(snapshot.docsTecnicosOutro || []).map((d) => ({ ...d, grupo: 'Técnicos_Outro' })),
      ];

      const docsToInsert = allDocs
        .filter((d) => d.checked || (d.label && d.grupo.includes('_Outro')))
        .map((d) => ({
          parecer_id: actualParecerId,
          grupo: d.grupo,
          label: d.label,
          checked: d.checked,
          page_number: d.pageNumber,
          extra_input: d.extraInput,
        }));

      if (docsToInsert.length > 0) {
        const { error: docsError } = await supabase.from('parecer_documentos').insert(docsToInsert);
        if (docsError) {
          await handleSupabaseError(docsError, OperationType.CREATE, 'parecer_documentos');
        }
      }

      const { error: deleteBarError } = await supabase
        .from('parecer_barramentos')
        .delete()
        .eq('parecer_id', actualParecerId);
      if (deleteBarError) {
        await handleSupabaseError(deleteBarError, OperationType.DELETE, 'parecer_barramentos');
      }

      const barramentos = [
        { data: snapshot.barragemPrincipal, is_principal: true, ordem: 0 },
        ...(snapshot.barragensMontante || []).map((b, i) => ({
          data: b,
          is_principal: false,
          ordem: i + 1,
        })),
      ];

      for (const b of barramentos) {
        const barInsertPayload = {
          parecer_id: actualParecerId,
          barragem_id: b.is_principal
            ? snapshot.barragemId || b.data.barragemId || null
            : b.data.barragemId || null,
          nome: b.data.nome,
          snisb: b.data.snisb,
          lat: b.data.lat,
          long: b.data.long,
          altura_maxima: b.data.alturaMaxima,
          altura_maxima_fls: b.data.alturaMaximaFls,
          borda_livre: b.data.bordaLivre,
          borda_livre_fls: b.data.bordaLivreFls,
          cota_coroamento: b.data.cotaCoroamento,
          cota_coroamento_fls: b.data.cotaCoroamentoFls,
          comprimento_coroamento: b.data.comprimentoCoroamento,
          comprimento_coroamento_fls: b.data.comprimentoCoroamentoFls,
          largura_coroamento: b.data.larguraCoroamento,
          largura_coroamento_fls: b.data.larguraCoroamentoFls,
          tipo_estrutural: b.data.tipoEstrutural,
          tipo_fundacao: b.data.tipoFundacao,
          idade: b.data.idade,
          score_idade: b.data.scoreIdade,
          cota_nno: b.data.cotaNNO,
          cota_nmm: b.data.cotaNMM,
          area_nno: b.data.areaNNO,
          area_nmm: b.data.areaNMM,
          volume_nmo: b.data.volumeNMO,
          volume_nmm: b.data.volumeNMM,
          vazao_maxima: b.data.vazaoMaxima,
          is_principal: b.is_principal,
          ordem: b.ordem,
          possui_adequacao: b.data.possuiAdequacao,
          adequacao_vazao: b.data.adequacaoVazao,
          adequacao_cota: b.data.adequacaoCota,
          adequacao_localizacao: b.data.adequacaoLocalizacao,
          adequacao_vazao_remanescente: b.data.adequacaoVazaoRemanescente,
          adequacao_seguranca: b.data.adequacaoSeguranca,
        };

        let savedBar: any = null;
        const { data: savedBarData, error: barError } = await supabase
          .from('parecer_barramentos')
          .insert(barInsertPayload)
          .select()
          .single();

        if (barError) {
          if (barError.code === '42703') {
            const { barragem_id: _omitted, ...legacyBarPayload } = barInsertPayload;
            const { data: fallbackBar, error: fallbackBarErr } = await supabase
              .from('parecer_barramentos')
              .insert(legacyBarPayload)
              .select()
              .single();
            if (fallbackBarErr) {
              await handleSupabaseError(fallbackBarErr, OperationType.CREATE, 'parecer_barramentos');
            }
            savedBar = fallbackBar;
          } else {
            await handleSupabaseError(barError, OperationType.CREATE, 'parecer_barramentos');
          }
        } else {
          savedBar = savedBarData;
        }

        const structs = b.data.estruturas || [];
        if (structs.length > 0 && savedBar) {
          const { error: estError } = await supabase.from('parecer_estruturas').insert(
            structs.map((e) => ({
              barramento_id: savedBar.id,
              descricao: e.descricao,
              vazao: e.vazao,
              cota_soleira: e.cotaSoleira,
              localizacao: e.localizacao,
              seguranca: e.seguranca,
            }))
          );
          if (estError) {
            await handleSupabaseError(estError, OperationType.CREATE, 'parecer_estruturas');
          }
        }
      }

      const empIdToSync = snapshot.empreendedorId || null;
      const barIdToSync = snapshot.barragemId || snapshot.barragemPrincipal?.barragemId || null;
      const digitsDoc = (snapshot.cpfCnpj || '').replace(/\D/g, '');

      if (empIdToSync || barIdToSync) {
        void syncClassificaProductToAdministra(
          {
            produto_origem_id: actualParecerId,
            tipo_produto: 'Parecer Técnico',
            numero_documento: snapshot.protocolo || null,
            status,
            data_documento: snapshot.data || null,
            analista_nome: snapshot.analista || userName,
            empreendedor_id: empIdToSync,
            empreendedor_nome: snapshot.razaoSocial || null,
            empreendedor_cpf_cnpj: digitsDoc || null,
            barragem_id: barIdToSync,
            barragem_nome: snapshot.barragemPrincipal?.nome || null,
            barragem_snisb: snapshot.barragemPrincipal?.snisb || null,
            municipio: snapshot.municipio || null,
          },
          currentUser
        );
      }

      toast.success(`Sucesso: Parecer salvo como ${status}!`);
      await logActivity(parecerId ? 'EDIT_OPINION' : 'CREATE_OPINION', {
        protocolo: snapshot.protocolo,
        interessado: snapshot.razaoSocial,
        status,
      });
      setFormData((prev) => ({
        ...prev,
        status,
        empreendedorId: empIdToSync || prev.empreendedorId,
        barragemId: barIdToSync || prev.barragemId,
      }));
      onBack();
    } catch (error: any) {
      console.error('Erro ao salvar no Supabase:', error);
      toast.error(`Erro ao salvar: ${error.message || 'Erro desconhecido'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDraft = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Salvar Rascunho',
      message: 'Deseja realmente salvar este parecer como rascunho?',
      variant: 'info',
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        await saveToSupabase('Rascunho');
      },
    });
  };

  const handleSaveComplete = () => {
    const pendencias = getConclusaoPendencias();
    if (!derived.resultado.isComplete || pendencias.length > 0) {
      const resumoPendencias =
        pendencias.length > 0
          ? pendencias.join('; ')
          : 'Cálculo de classificação incompleto.';
      toast.error(`Não é possível concluir o parecer com pendências: ${resumoPendencias}`);
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: 'Finalizar Parecer',
      message:
        'Deseja realmente FINALIZAR este parecer? Após a finalização, ele não poderá mais ser editado como rascunho.',
      variant: 'warning',
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        await saveToSupabase('Concluído');
      },
    });
  };

  const handleClearForm = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Limpar Formulário',
      message: 'Tem certeza que deseja limpar todo o formulário? Esta ação não pode ser desfeita.',
      variant: 'danger',
      onConfirm: () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        setFormData({ ...INITIAL_DATA, id: crypto.randomUUID() });
        setIsManualParecerEdited(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        toast.info('Formulário limpo.');
      },
    });
  };

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const yOffset = -200;
      const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
      setActiveSection(id);
    }
  };

  const tipoClassLabel =
    formData.tipoClassificacao === 'OUTRO'
      ? formData.tipoClassificacaoOutro
      : formData.tipoClassificacao;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto pb-20 w-full">
      {/* Cabeçalho */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center border-b border-slate-200 pb-3 mb-4 sticky top-[80px] md:top-0 bg-slate-50/95 backdrop-blur-sm z-30 pt-2 md:pt-4 gap-3 md:gap-4">
        <div className="flex items-center gap-3 md:gap-4">
          <button
            type="button"
            onClick={onBack}
            className="p-1.5 md:p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
          >
            <ArrowLeft size={20} className="md:w-6 md:h-6" />
          </button>
          <div>
            <h1 className="text-lg md:text-2xl font-bold text-slate-800 leading-tight">
              {readOnly
                ? 'Visualizar Parecer'
                : initialData
                ? 'Editar Parecer'
                : 'Parecer de Classificação'}
            </h1>
            <p className="text-slate-500 text-[10px] md:text-sm">Resolução CNRH Nº 241/2024</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 w-full xl:w-auto justify-end items-center">
          {currentUser && (
            <div className="hidden md:flex flex-col items-end mr-2 pr-4 border-r border-slate-200">
              <span className="text-xs font-bold text-slate-700 leading-none">
                {currentUser.name}
              </span>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider mt-1 font-medium">
                {currentUser.role}
              </span>
            </div>
          )}

          {!readOnly && (
            <>
              <button
                type="button"
                onClick={handleClearForm}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 font-medium shadow-sm text-sm transition-colors"
                title="Limpar todos os campos"
              >
                <Eraser size={18} /> <span className="hidden sm:inline">Limpar</span>
              </button>

              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={isSaving}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-400 rounded-lg hover:bg-slate-50 text-slate-700 font-medium shadow-sm text-sm disabled:opacity-60"
                title="Salvar como Rascunho"
              >
                <Save size={18} /> Rascunho
              </button>

              <button
                type="button"
                onClick={handleSaveComplete}
                disabled={isSaving}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium shadow-sm text-sm disabled:opacity-60"
                title="Concluir e Salvar"
              >
                <CheckCircle size={18} /> Concluir
              </button>
            </>
          )}

          {currentUser && currentUser.role !== 'Visualizador' && (
            <button
              type="button"
              onClick={() => setSolicitarVistoriaOpen(true)}
              disabled={isSaving}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium shadow-sm text-sm disabled:opacity-60"
              title="Solicitar vistoria técnica para esta barragem"
            >
              <ClipboardCheck size={18} /> Solicitar vistoria
            </button>
          )}

          <button
            type="button"
            onClick={handleGenerateDoc}
            disabled={isSaving}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm disabled:opacity-70 text-sm"
            title="Exportar para Word"
          >
            {isSaving ? (
              'Gerando...'
            ) : (
              <>
                <FileDown size={18} /> Exportar DOCX
              </>
            )}
          </button>
        </div>
      </div>

      {/* Barra de navegação móvel */}
      <div
        ref={navRef}
        className="lg:hidden -mx-4 px-4 pb-4 mb-4 overflow-x-auto flex gap-2 no-scrollbar sticky top-[160px] md:top-[85px] z-20 bg-slate-50 border-b border-slate-200 transition-all duration-300"
      >
        {sections.map((section) => {
          const Icon = section.icon;
          const shortLabel = section.label.includes('. ')
            ? section.label.split('. ')[1]
            : section.label;
          return (
            <button
              key={section.id}
              type="button"
              data-section={section.id}
              onClick={() => scrollToSection(section.id)}
              className={`flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-1.5 md:py-2 text-xs md:text-sm font-medium rounded-full transition-all whitespace-nowrap border shadow-sm ${
                activeSection === section.id
                  ? 'bg-emerald-600 text-white border-emerald-600 ring-2 ring-emerald-200'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-emerald-300'
              }`}
            >
              <Icon size={14} className="md:size-[16px]" />
              {shortLabel}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col lg:flex-row gap-8 relative items-start">
        {/* Sidebar Desktop */}
        <div className="hidden lg:block w-72 shrink-0 sticky top-28 self-start space-y-4 z-20">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wider">
                Progresso
              </h3>
              <span className="text-xs font-bold text-emerald-600">
                {Math.round(progressPercent)}%
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 mb-6 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-700 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="space-y-1.5">
              {sections.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => scrollToSection(item.id)}
                    className={`group flex items-center gap-3 w-full text-left text-sm px-4 py-3 rounded-xl transition-all ${
                      active
                        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200 font-semibold translate-x-1'
                        : 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 hover:translate-x-1'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                        active ? 'bg-white/20' : 'bg-slate-100 group-hover:bg-emerald-100'
                      }`}
                    >
                      <Icon
                        size={16}
                        className={
                          active ? 'text-white' : 'text-slate-400 group-hover:text-emerald-600'
                        }
                      />
                    </div>
                    <span className="flex-1">{item.label}</span>
                    {active && <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="font-bold text-slate-700 mb-4 text-xs uppercase tracking-wider">
              {derived.isPreClassificacao ? 'Resumo da Pré-Classificação' : 'Resumo da Classificação'}
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-xs text-slate-500 font-medium">DPA</span>
                <span
                  className={`text-xs font-bold px-2 py-1 rounded-lg ${
                    derived.dpa.dpaClass === DanoEnum.ALTO
                      ? 'bg-red-100 text-red-700'
                      : derived.dpa.dpaClass === DanoEnum.MEDIO
                      ? 'bg-amber-100 text-amber-700'
                      : derived.dpa.dpaClass === DanoEnum.BAIXO
                      ? 'bg-green-100 text-green-700'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {derived.dpa.dpaClass || 'Pendente'}
                </span>
              </div>

              {!hideCriSection && (
                <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-xs text-slate-500 font-medium">CRI</span>
                  <span
                    className={`text-xs font-bold px-2 py-1 rounded-lg ${
                      derived.cri?.risco === RiscoEnum.ALTO
                        ? 'bg-red-100 text-red-700'
                        : derived.cri?.risco === RiscoEnum.MEDIO
                        ? 'bg-amber-100 text-amber-700'
                        : derived.cri?.risco === RiscoEnum.BAIXO
                        ? 'bg-green-100 text-green-700'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {derived.cri?.risco || 'Pendente'}
                  </span>
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 text-center">
                <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-tighter mb-1">
                  Resultado Atual
                </span>
                <span
                  className={`block font-bold text-sm leading-tight ${
                    derived.resultado.isComplete ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {derived.resultado.label}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Conteúdo do Formulário */}
        <fieldset
          disabled={readOnly}
          className="flex-1 space-y-10 min-w-0 w-full border-none p-0 m-0"
        >
          <Topic1Introducao
            formData={formData}
            isOpen={openSections.introducao}
            docGroupsOpen={{
              geral: openSections.geral,
              ident: openSections.ident,
              espolio: openSections.espolio,
              art: openSections.art,
              tecnico: openSections.tecnico,
            }}
            readOnly={readOnly}
            onToggleSection={() => toggleSection('introducao')}
            onToggleDocGroup={(group) => toggleSection(group)}
            onInputChange={handleInputChange}
            onDocChange={handleDocChange}
            onAddOtherDoc={handleAddOtherDoc}
            onRemoveOtherDoc={handleRemoveOtherDoc}
          />

          <Topic2PedidoEmpreendedor
            formData={formData}
            isOpen={openSections.pedido}
            readOnly={readOnly}
            onRemoveRT={handleRemoveRT}
            onToggleSection={() => toggleSection('pedido')}
            onInputChange={handleInputChange}
            onBatchUpdate={(updater) => setFormData(updater)}
            maskCpfCnpj={maskCpfCnpj}
          />

          <Topic3Barramentos
            barragemPrincipal={formData.barragemPrincipal}
            barragensMontante={formData.barragensMontante}
            barragemId={formData.barragemId}
            registeringBarragemKey={registeringBarragemKey}
            onRegisterBarragem={handleRegisterBarragem}
            onUnlinkBarragem={handleUnlinkBarragem}
            isOpen={openSections.barramento}
            readOnly={readOnly}
            onToggleSection={() => toggleSection('barramento')}
            updateBarramento={updateBarramento}
            addUpstreamDam={addUpstreamDam}
            removeUpstreamDam={removeUpstreamDam}
            updateStructure={updateStructure}
            addStructure={addStructure}
            removeStructure={removeStructure}
          />

          <Topic4Dpa
            classificacao={formData.classificacao}
            volumeNmmTexto={formData.barragemPrincipal.volumeNMM}
            derivedDpa={derived.dpa}
            isOpen={openSections.dpa}
            onToggleSection={() => toggleSection('dpa')}
            onClassificationChange={handleClassificationChange}
          />

          {!hideCriSection && derived.cri && (
            <Topic5Cri
              classificacao={formData.classificacao}
              barragemPrincipal={formData.barragemPrincipal}
              derivedCri={derived.cri}
              isOpen={openSections.cri}
              onToggleSection={() => toggleSection('cri')}
              onClassificationChange={handleClassificationChange}
            />
          )}

          <Topic6ResultadoMatriz
            derived={derived}
            isOpen={openSections.resultado}
            onToggleSection={() => toggleSection('resultado')}
          />

          <Topic8ParecerConclusivo
            parecerFinal={formData.parecer_final}
            tipoClassificacaoLabel={tipoClassLabel}
            derived={derived}
            isOpen={openSections.parecer}
            readOnly={readOnly}
            isManualEdited={isManualParecerEdited}
            onToggleSection={() => toggleSection('parecer')}
            onChangeParecerFinal={(val) => {
              setIsManualParecerEdited(true);
              setFormData((prev) => ({ ...prev, parecer_final: val }));
            }}
            onRegenerateSuggestedText={() => {
              const suggested = buildSuggestedParecerText(formData, derived);
              if (suggested) {
                setIsManualParecerEdited(false);
                setFormData((prev) => ({ ...prev, parecer_final: suggested }));
              }
            }}
          />

          <OpinionPreviewSection
            formData={formData}
            derived={derived}
            isOpen={openSections.revisar}
            onToggleSection={() => toggleSection('revisar')}
          />
        </fieldset>
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        variant={confirmModal.variant}
      />

      <SolicitarVistoriaModal
        isOpen={solicitarVistoriaOpen}
        onClose={() => setSolicitarVistoriaOpen(false)}
        prefill={solicitacaoPrefill}
      />
    </div>
  );
};

export default OpinionForm;
