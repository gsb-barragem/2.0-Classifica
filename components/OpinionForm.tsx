
import React, { useState, useEffect, useRef, useContext } from 'react';
import { Save, Download, ArrowLeft, CheckSquare, Square, ChevronDown, ChevronUp, MapPin, FileText, Activity, Scale, PenTool, Plus, Trash2, Droplets, Eye, X, CheckCircle, Eraser, FileDown, Navigation, UserCheck, Loader2, ShieldCheck, Copy, Edit3, RotateCcw } from 'lucide-react';
import { logActivity } from '../src/lib/auditService';
import { toast } from 'sonner';
import { saveAs } from 'file-saver';
import L from 'leaflet';
import { parseGMS } from './MTMap';
import { 
  Document, 
  Packer, 
  Paragraph, 
  TextRun, 
  AlignmentType, 
  HeadingLevel,
} from 'docx';
import ConfirmModal from './ui/ConfirmModal';
import { ParecerData, RiscoEnum, DanoEnum, DocItem, BarramentoData, EstruturaHidraulica, ResponsavelTecnicoEntry } from '../types';
import { generateParecerDoc } from '../services/docxService';
import { supabase } from '../src/supabaseClient';
import { AuthContext } from '../src/contexts/AuthContext';
import { handleSupabaseError, OperationType } from '../src/utils/supabaseErrorHandler';
import { getUpgsForMunicipality } from '../src/data/upgData';
import { 
  OPS_TIPO_CLASSIFICACAO, OPS_TIPO_BARRAGEM, OPS_SITUACAO, OPS_ANALISTA, OPS_FINALIDADE,
  OPS_TIPO_ESTRUTURAL, OPS_TIPO_FUNDACAO, OPS_MUNICIPIOS, OPS_RESPONSAVEL_TECNICO,
  LABELS_DOCS_GERAIS, LABELS_DOCS_IDENTIFICACAO, LABELS_DOCS_ESPOLIO, 
  LABELS_DOCS_ART, LABELS_DOCS_TECNICOS,
  OPS_DPA1_VOLUME, OPS_DPA2_CONSTRUCOES, OPS_DPA3_ENV, OPS_DPA4_SOCIO,
  OPS_CT6_VAZAO, OPS_EC1_EXTRAVASOR, OPS_EC2_ADUTORA, OPS_EC3_PERCOLACAO, OPS_EC4_DEFORMACAO, OPS_EC5_TALUDES,
  OPS_PS1_DOCS, OPS_PS2_ORG, OPS_PS3_INSP, OPS_PS4_REL, OPS_PS5_PAE, OPS_PS6_REGRA
} from '../constants';

interface OpinionFormProps {
  onBack: () => void;
  initialData?: ParecerData | null;
  readOnly?: boolean;
}

const createDocItem = (label: string, idx: number, prefix: string): DocItem => ({
  id: `${prefix}_${idx}`,
  label,
  checked: false,
  pageNumber: ''
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
  tipoEstrutural: OPS_TIPO_ESTRUTURAL[4], // Default: Terra Homogênea
  tipoFundacao: OPS_TIPO_FUNDACAO[3], // Default: Solo residual
  idade: '',
  scoreIdade: 5, // Default worst case
  cotaNNO: '',
  cotaNMM: '',
  areaNNO: '',
  areaNMM: '',
  volumeNMO: '',
  volumeNMM: '',
  vazaoMaxima: '',
  estruturas: [createEmptyStructure(`${id}_s1`, 1)],
  possuiAdequacao: false
});

const INITIAL_DATA: ParecerData = {
  protocolo: '',
  analista: '',
  analistaOutro: '',
  data: new Date().toISOString().split('T')[0],
  dataRecebimentoProcesso: '',
  
  // Tabela 1 Fields
  razaoSocial: '',
  cpfCnpj: '',
  localizacao: '',
  numCAR: '',
  municipio: '',
  finalidade: OPS_FINALIDADE[0],
  finalidadeOutro: '',
  situacaoEmpreendimento: OPS_SITUACAO[0],
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
  docsGeraisOutro: [{ id: 'geral_outro_0', label: 'OUTRO', checked: false, pageNumber: '', extraInput: '' }],

  docsIdentificacao: LABELS_DOCS_IDENTIFICACAO.map((item, i) => ({
    ...createDocItem(item.label, i, 'ident'),
    extraInput: item.hasInput ? '' : undefined
  })),
  docsIdentificacaoOutro: [{ id: 'ident_outro_0', label: 'OUTRO', checked: false, pageNumber: '', extraInput: '' }],

  espolio: false,
  docsEspolio: LABELS_DOCS_ESPOLIO.map((item, i) => ({
    ...createDocItem(item.label, i, 'espolio'),
    extraInput: item.hasInput ? '' : undefined
  })),
  docsEspolioOutro: [{ id: 'espolio_outro_0', label: 'OUTRO', checked: false, pageNumber: '', extraInput: '' }],

  docsArt: LABELS_DOCS_ART.map((l, i) => ({ ...createDocItem(l, i, 'art'), extraInput: '' })), 
  docsArtOutro: [{ id: 'art_outro_0', label: 'OUTRO', checked: false, pageNumber: '', extraInput: '', extraSelect: '' }],

  docsTecnicos: LABELS_DOCS_TECNICOS.map((item, i) => ({
    ...createDocItem(item.label, i, 'tec'),
    extraInput: item.hasInput ? '' : undefined
  })),
  docsTecnicosOutro: [{ id: 'tec_outro_0', label: 'OUTRO', checked: false, pageNumber: '', extraInput: '' }],

  introducao: '',
  infoBarramento: '', // Deprecated, using structured data below
  barragemPrincipal: createEmptyBarramento('main', ''),
  barragensMontante: [],

  classificacao: {
    // New DPA Fields
    dpa1Select: OPS_DPA1_VOLUME[0],
    dpa2Select: OPS_DPA2_CONSTRUCOES[0],
    dpa3Select: OPS_DPA3_ENV[0],
    dpa4Select: OPS_DPA4_SOCIO[0],
    
    scoreDpa1: 1,
    scoreDpa2: 0,
    scoreDpa3: 1,
    scoreDpa4: 0,
    totalDpa: 2,
    dpaClass: DanoEnum.BAIXO,
    rupturaTexto: 'Os estudos de ruptura hipotética consideraram...',
    legendaDPA: '*Classificação do DPA (Dano Potencial Associado) conforme as Faixas de Classificação estabelecidas no item II.4, do Anexo II, da Resolução CNRH Nº 241, de 10 de setembro de 2024',

    // CRI
    criPreClassificacao: false,
    scoreCt1: 0,
    scoreCt2: 0,
    scoreCt3: 0,
    scoreCt4: 0,
    scoreCt5: 0,
    ct6Select: OPS_CT6_VAZAO[0], scoreCt6: 1,
    
    ec1Select: OPS_EC1_EXTRAVASOR[0], scoreEc1: 0,
    ec2Select: OPS_EC2_ADUTORA[0], scoreEc2: 0,
    ec3Select: OPS_EC3_PERCOLACAO[0], scoreEc3: 0,
    ec4Select: OPS_EC4_DEFORMACAO[0], scoreEc4: 0,
    ec5Select: OPS_EC5_TALUDES[0], scoreEc5: 0,

    ps1Select: OPS_PS1_DOCS[0], scorePs1: 0,
    ps2Select: OPS_PS2_ORG[0], scorePs2: 0,
    ps3Select: OPS_PS3_INSP[0], scorePs3: 0,
    ps4Select: OPS_PS4_REL[0], scorePs4: 0,
    ps5Select: OPS_PS5_PAE[0], scorePs5: 0,
    ps6Select: OPS_PS6_REGRA[0], scorePs6: 0,

    totalCT: 0, totalEC: 0, totalPS: 0,
    riskGeral: RiscoEnum.BAIXO, valGeral: 0,
    riskPercolacao: RiscoEnum.BAIXO, valPercolacao: 0,
    riskGalgamento: RiscoEnum.BAIXO, valGalgamento: 0,
    riskGerencial: RiscoEnum.BAIXO, valGerencial: 0,

    risco: RiscoEnum.BAIXO,
    resumo: 'CLASSE C (CRI Baixa)',
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
    situacao: 'Aguardando análise'
  }
};

const extractScore = (text: string | null | undefined): number => {
  if (!text || typeof text !== 'string') return 0;
  const match = text.match(/\((\d+)/);
  return match ? parseInt(match[1], 10) : 0;
};

const cleanScore = (text: string | null | undefined) => {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/\s*\(\d+.*?\)$/, '');
};

// Calculate Age Score based on rules
const getAgeScore = (ageStr: string | null | undefined): number => {
  if (!ageStr || isNaN(Number(ageStr))) return 5;
  const age = Number(ageStr);
  
  if (age < 5) return 5;
  if (age >= 5 && age < 10) return 3;
  if (age >= 10 && age < 30) return 2;
  if (age >= 30 && age < 40) return 1;
  if (age >= 40 && age <= 50) return 2;
  if (age > 50) return 3;
  
  return 5;
};

// Get DPA1 Volume classification based on volume value
const getDpa1FromVolume = (volumeStr: string | null | undefined): string => {
  if (!volumeStr) return OPS_DPA1_VOLUME[0];
  const vol = parseFloat(String(volumeStr).replace(',', '.') || '0');
  if (vol < 3) return OPS_DPA1_VOLUME[0];
  if (vol >= 3 && vol < 10) return OPS_DPA1_VOLUME[1];
  if (vol >= 10 && vol < 75) return OPS_DPA1_VOLUME[2];
  if (vol >= 75 && vol < 200) return OPS_DPA1_VOLUME[3];
  return OPS_DPA1_VOLUME[4];
};

// Check PNSB Enquadramento
const checkPNSB = (dpaClass: DanoEnum, altura: number, volume: number): boolean => {
  if (dpaClass === DanoEnum.MEDIO || dpaClass === DanoEnum.ALTO) return true;
  if (altura >= 15) return true;
  if (volume >= 3) return true;
  return false;
};

// Helper to determine the regulatory text
const getEnquadramentoText = (dpaClass: DanoEnum, altura: number, volume: number): string => {
  // 1. DPA MEDIO/ALTO
  if (dpaClass === DanoEnum.MEDIO || dpaClass === DanoEnum.ALTO) {
    return `apresenta características que a enquadrem na Política Nacional de Segurança de Barragens, à Lei nº 12.334/2010, bem como a sua atualização pela Lei 14.066/2020, conforme termos do Art. 1º, inciso IV, considera-se como critério de inclusão a categoria de dano potencial associado médio ou alto, em termos econômicos, sociais, ambientais ou de perda de vidas humanas.\nDessa forma, deverá ser elaborado o Plano de Segurança da Barragem (PSB), estruturado nos Volumes I, II, III, IV, V e VI, devendo conter, no mínimo, as informações previstas no Anexo II – Conteúdo Mínimo e Nível de Detalhamento do PSB, em conformidade com os critérios estabelecidos pela Resolução CEHIDRO nº 163, de 11 de maio de 2023. Ademais, a elaboração deverá observar as condicionantes estabelecidas no Quadro 4 do item 5.1 do presente parecer.`;
  }
  // 2. Altura >= 15m
  if (altura >= 15) {
    return `apresenta características que a enquadrem na Política Nacional de Segurança de Barragens, à Lei nº 12.334/2010, bem como a sua atualização pela Lei 14.066/2020, conforme termos do Art. 1º, inciso I, considera-se como critério de inclusão a altura do maciço, medida do encontro do pé do talude de jusante com o nível do solo até a crista de coroamento do barramento, maior ou igual a 15 (quinze) metros.\nDessa forma, deverá ser elaborado o Plano de Segurança da Barragem (PSB), estruturado nos Volumes I, II, III, IV, V e VI, devendo conter, no mínimo, as informações previstas no Anexo II – Conteúdo Mínimo e Nível de Detalhamento do PSB, em conformidade com os critérios estabelecidos pela Resolução CEHIDRO nº 163, de 11 de maio de 2023. Ademais, a elaboração deverá observar as condicionantes estabelecidas no Quadro 4 do item 5.1 do presente parecer.`;
  }
  // 3. Volume >= 3hm3
  if (volume >= 3) {
    return `apresenta características que a enquadrem na Política Nacional de Segurança de Barragens, à Lei nº 12.334/2010, bem como a sua atualização pela Lei 14.066/2020, conforme termos do Art. 1º, inciso II, considera-se como critério de inclusão a capacidade total do reservatório maior ou igual a 3.000.000m³ (três milhões de metros cúbicos).\nDessa forma, deverá ser elaborado o Plano de Segurança da Barragem (PSB), estruturado nos Volumes I, II, III, IV, V e VI, devendo conter, no mínimo, as informações previstas no Anexo II – Conteúdo Mínimo e Nível de Detalhamento do PSB, em conformidade com os critérios estabelecidos pela Resolução CEHIDRO nº 163, de 11 de maio de 2023. Ademais, a elaboração deverá observar as condicionantes estabelecidas no Quadro 4 do item 5.1 do presente parecer.`;
  }

  // Fallback (Non PNSB)
  return `não apresenta características que a enquadrem na Política Nacional de Segurança de Barragens, à Lei nº 12.334/2010, bem como a sua atualização pela Lei 14.066/2020.`;
};

// --- Extracted Components ---

interface DocItemRowProps { 
  item: DocItem; 
  listKey: keyof ParecerData; 
  hasExtraInput?: boolean; 
  extraPlaceholder?: string; 
  artMode?: boolean;
  onDocChange: (listKey: keyof ParecerData, id: string, field: keyof DocItem, value: any) => void;
  onRemove?: () => void;
}

const DocItemRow: React.FC<DocItemRowProps> = ({ 
  item, 
  listKey, 
  hasExtraInput, 
  extraPlaceholder, 
  artMode = false,
  onDocChange,
  onRemove
}) => (
  <div className={`flex flex-wrap items-start gap-4 p-3 rounded-md transition-colors ${item.checked ? 'bg-emerald-50 border border-emerald-100' : 'hover:bg-slate-50 border border-transparent'}`}>
    <div 
      className="flex items-center gap-3 cursor-pointer mt-1 w-full sm:w-auto"
      onClick={() => onDocChange(listKey, item.id, 'checked', !item.checked)}
    >
      {item.checked ? <CheckSquare className="text-emerald-600 shrink-0" size={20} /> : <Square className="text-slate-400 shrink-0" size={20} />}
      <span className={`text-sm ${item.checked ? 'text-slate-900 font-medium' : 'text-slate-600'} leading-snug`}>{item.label}</span>
    </div>
    
    {item.checked && (
      <div className="flex flex-wrap gap-2 flex-1 ml-8 sm:ml-0 w-full sm:w-auto">
         {artMode && (
          <div className="flex items-center gap-1 w-full sm:w-auto">
             <span className="text-xs text-slate-500 whitespace-nowrap">ART nº:</span>
             <input 
              type="text" 
              placeholder="123456" 
              className="text-xs border border-slate-400 bg-[#F5F5F5] rounded px-2 py-1 w-full sm:w-24 focus:bg-white focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500 shadow-sm transition-all outline-none"
              value={item.extraInput || ''}
              onChange={(e) => onDocChange(listKey, item.id, 'extraInput', e.target.value)}
            />
          </div>
        )}
        {!artMode && hasExtraInput && (
           <input 
            type="text" 
            placeholder={extraPlaceholder || "Detalhes..."} 
            className="text-xs border border-slate-400 bg-[#F5F5F5] rounded px-2 py-1 flex-1 min-w-[150px] w-full sm:w-auto focus:bg-white focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500 shadow-sm transition-all outline-none"
            value={item.extraInput || ''}
            onChange={(e) => onDocChange(listKey, item.id, 'extraInput', e.target.value)}
          />
        )}
        <div className="flex items-center gap-1 w-full sm:w-auto">
           <span className="text-xs text-slate-500 whitespace-nowrap">Folha(s):</span>
           <input 
            type="text" 
            placeholder="Ex: 15" 
            className="text-xs border border-slate-400 bg-[#F5F5F5] rounded px-2 py-1 w-20 focus:bg-white focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500 shadow-sm transition-all outline-none"
            value={item.pageNumber || ''}
            onChange={(e) => onDocChange(listKey, item.id, 'pageNumber', e.target.value)}
          />
        </div>
        {onRemove && (
          <button 
            onClick={onRemove}
            className="p-1 text-slate-400 hover:text-rose-500 transition-colors"
            title="Remover"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    )}
  </div>
);

const formatGMS = (value: string): string => {
  const digits = (value || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length === 0) return '';
  let formatted = digits.slice(0, 2);
  if (digits.length > 2) formatted += '°' + digits.slice(2, 4);
  if (digits.length > 4) formatted += "'" + digits.slice(4, 6);
  if (digits.length > 6) formatted += "," + digits.slice(6, 8);
  if (digits.length === 8) formatted += '"';
  return formatted;
};

const MiniMap: React.FC<{ lat: string, long: string }> = ({ lat, long }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    if (!leafletMap.current) {
      leafletMap.current = L.map(mapRef.current, {
        zoomControl: false,
        attributionControl: false,
        dragging: true,
        scrollWheelZoom: false,
      }).setView([-12.9, -56.0], 5);

      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Esri'
      }).addTo(leafletMap.current);

      fetch('https://servicodados.ibge.gov.br/api/v3/malhas/estados/51?formato=application/vnd.geo+json&intrarregiao=municipio&qualidade=minima')
        .then(res => res.json())
        .then(data => {
          if (leafletMap.current) {
            L.geoJSON(data, {
              style: { color: '#ffffff', weight: 0.5, opacity: 0.3, fillColor: 'transparent', fillOpacity: 0 },
              interactive: false
            }).addTo(leafletMap.current);
          }
        })
        .catch(() => {});
    }

    const dLat = parseGMS(lat);
    const dLong = parseGMS(long);

    if (!isNaN(dLat) && !isNaN(dLong) && Math.abs(dLat) > 0 && Math.abs(dLong) > 0) {
      const pos: [number, number] = [dLat, dLong];
      if (!markerRef.current) {
        markerRef.current = L.marker(pos).addTo(leafletMap.current);
      } else {
        markerRef.current.setLatLng(pos);
      }
      leafletMap.current.setView(pos, 15);
    } else {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      leafletMap.current.setView([-12.9, -56.0], 5);
    }
  }, [lat, long]);

  return (
    <div className="sm:col-span-2 overflow-hidden rounded-xl border border-slate-300 shadow-inner relative mb-2">
       <div ref={mapRef} className="h-48 w-full z-0" />
       <div className="absolute top-2 right-2 bg-slate-900/60 backdrop-blur-sm text-[9px] text-white px-2 py-1 rounded font-bold uppercase tracking-wider z-10 pointer-events-none">
          Geolocalização do Barramento
       </div>
    </div>
  );
};

interface BarramentoFormProps { 
  data: BarramentoData; 
  isMain: boolean; 
  idx?: number;
  updateBarramento: (isMain: boolean, idx: number, field: keyof BarramentoData, value: any) => void;
  removeUpstreamDam: (idx: number) => void;
  updateStructure: (isMain: boolean, barramentoIdx: number, structIdx: number, field: keyof EstruturaHidraulica, value: any) => void;
  addStructure: (isMain: boolean, barramentoIdx: number) => void;
  removeStructure: (isMain: boolean, barramentoIdx: number, structIdx: number) => void;
}

const BarramentoForm: React.FC<BarramentoFormProps> = ({ 
  data, 
  isMain, 
  idx = 0,
  updateBarramento,
  removeUpstreamDam,
  updateStructure,
  addStructure,
  removeStructure
}) => (
  <div className={`space-y-6 ${!isMain ? 'p-3 md:p-4 border border-dashed border-emerald-300 rounded-lg bg-emerald-50/50 mt-6 relative' : ''}`}>
    {!isMain && (
      <button 
        onClick={() => removeUpstreamDam(idx)}
        className="absolute top-2 right-2 md:top-4 md:right-4 text-red-400 hover:text-red-600 p-1"
        title="Remover Barragem"
      >
        <Trash2 size={18} />
      </button>
    )}
    
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="sm:col-span-2 lg:col-span-1">
        <label className="block text-sm font-medium text-slate-700 mb-1">Nome da barragem</label>
        <input type="text" value={data.nome} onChange={(e) => updateBarramento(isMain, idx, 'nome', e.target.value)} className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" placeholder="Nome do Barramento" />
      </div>
      
      <div className="sm:col-span-2 lg:col-span-1">
        <label className="block text-sm font-medium text-slate-700 mb-1">Número do SNISB</label>
        <input type="text" value={data.snisb} onChange={(e) => updateBarramento(isMain, idx, 'snisb', e.target.value)} className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" placeholder="Apenas números" />
      </div>
      
      <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
         <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Coordenadas - Latitude</label>
            <input type="text" value={data.lat} onChange={(e) => updateBarramento(isMain, idx, 'lat', formatGMS(e.target.value))} className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" placeholder={"00°00'00,00\""} />
         </div>
         <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Coordenadas - Longitude</label>
            <input type="text" value={data.long} onChange={(e) => updateBarramento(isMain, idx, 'long', formatGMS(e.target.value))} className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" placeholder={"00°00'00,00\""} />
         </div>
         <MiniMap lat={data.lat} long={data.long} />
      </div>

      <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Altura máxima projetada (m)</label>
          <div className="flex gap-2">
            <input type="number" step="0.01" value={data.alturaMaxima} onChange={(e) => updateBarramento(isMain, idx, 'alturaMaxima', e.target.value)} className="flex-1 rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" />
            <div className="w-24">
              <label className="block text-[10px] font-bold text-slate-400 mb-0.5">Folha</label>
              <input type="text" placeholder="Ex: fls. 23" value={data.alturaMaximaFls} onChange={(e) => updateBarramento(isMain, idx, 'alturaMaximaFls', e.target.value)} className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" />
            </div>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Borda livre (m)</label>
          <div className="flex gap-2">
            <input type="number" step="0.01" value={data.bordaLivre} onChange={(e) => updateBarramento(isMain, idx, 'bordaLivre', e.target.value)} className="flex-1 rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" />
            <div className="w-24">
              <label className="block text-[10px] font-bold text-slate-400 mb-0.5">Folha</label>
              <input type="text" placeholder="Ex: fls. 23" value={data.bordaLivreFls} onChange={(e) => updateBarramento(isMain, idx, 'bordaLivreFls', e.target.value)} className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" />
            </div>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Cota do coroamento (m)</label>
          <div className="flex gap-2">
            <input type="number" step="0.01" value={data.cotaCoroamento} onChange={(e) => updateBarramento(isMain, idx, 'cotaCoroamento', e.target.value)} className="flex-1 rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" />
            <div className="w-24">
              <label className="block text-[10px] font-bold text-slate-400 mb-0.5">Folha</label>
              <input type="text" placeholder="Ex: fls. 23" value={data.cotaCoroamentoFls} onChange={(e) => updateBarramento(isMain, idx, 'cotaCoroamentoFls', e.target.value)} className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" />
            </div>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Comprimento do coroamento (m)</label>
          <div className="flex gap-2">
            <input type="number" step="0.01" value={data.comprimentoCoroamento} onChange={(e) => updateBarramento(isMain, idx, 'comprimentoCoroamento', e.target.value)} className="flex-1 rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" />
            <div className="w-24">
              <label className="block text-[10px] font-bold text-slate-400 mb-0.5">Folha</label>
              <input type="text" placeholder="Ex: fls. 23" value={data.comprimentoCoroamentoFls} onChange={(e) => updateBarramento(isMain, idx, 'comprimentoCoroamentoFls', e.target.value)} className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" />
            </div>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Largura média do coroamento (m)</label>
          <div className="flex gap-2">
            <input type="number" step="0.01" value={data.larguraCoroamento} onChange={(e) => updateBarramento(isMain, idx, 'larguraCoroamento', e.target.value)} className="flex-1 rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" />
            <div className="w-24">
              <label className="block text-[10px] font-bold text-slate-400 mb-0.5">Folha</label>
              <input type="text" placeholder="Ex: fls. 23" value={data.larguraCoroamentoFls} onChange={(e) => updateBarramento(isMain, idx, 'larguraCoroamentoFls', e.target.value)} className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" />
            </div>
          </div>
        </div>
      </div>
      
      <div className="sm:col-span-2">
        <label className="block text-sm font-medium text-slate-700 mb-1">Tipo estrutural</label>
        <select value={data.tipoEstrutural} onChange={(e) => updateBarramento(isMain, idx, 'tipoEstrutural', e.target.value)} className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none">
          {OPS_TIPO_ESTRUTURAL.map(op => <option key={op} value={op}>{op}</option>)}
        </select>
      </div>
       <div className="sm:col-span-2">
        <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de fundação</label>
        <select value={data.tipoFundacao} onChange={(e) => updateBarramento(isMain, idx, 'tipoFundacao', e.target.value)} className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none">
          {OPS_TIPO_FUNDACAO.map(op => <option key={op} value={op}>{op}</option>)}
        </select>
      </div>

      <div className="sm:col-span-2">
        <label className="block text-sm font-medium text-slate-700 mb-1">Idade da barragem (anos)</label>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
           <input type="number" step="1" value={data.idade} onChange={(e) => updateBarramento(isMain, idx, 'idade', e.target.value)} className="w-full sm:w-32 rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" placeholder="Ex: 15" />
           <div className="text-xs text-slate-500 bg-slate-100 px-3 py-1 rounded w-full sm:w-auto text-center">
             Pontuação (CRI): <strong>{data.scoreIdade}</strong>
           </div>
        </div>
      </div>

    </div>

    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
      <h4 className="font-bold text-slate-700 text-sm mb-3 flex items-center gap-2"><Droplets size={16}/> Reservatório</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 gap-4">
         <div>
           <label className="block text-xs text-slate-500 mb-1">Nível normal de operação (NNO) (m)</label>
           <input type="number" step="0.01" value={data.cotaNNO} onChange={(e) => updateBarramento(isMain, idx, 'cotaNNO', e.target.value)} className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" />
         </div>
         <div>
           <label className="block text-xs text-slate-500 mb-1">Nível máximo Maximorum (NMM) (m)</label>
           <input type="number" step="0.01" value={data.cotaNMM} onChange={(e) => updateBarramento(isMain, idx, 'cotaNMM', e.target.value)} className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" />
         </div>
         <div>
           <label className="block text-xs text-slate-500 mb-1">Área inundada (NNO) (m²)/(ha)</label>
           <input type="number" step="0.01" value={data.areaNNO} onChange={(e) => updateBarramento(isMain, idx, 'areaNNO', e.target.value)} className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" />
         </div>
         <div>
           <label className="block text-xs text-slate-500 mb-1">Área inundada (NMM) (m²)/(ha)</label>
           <input type="number" step="0.01" value={data.areaNMM} onChange={(e) => updateBarramento(isMain, idx, 'areaNMM', e.target.value)} className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" />
         </div>
         <div className="sm:col-span-2 md:col-span-1">
           <label className="block text-xs text-slate-500 mb-1">Volume armazenado (NMO) (hm³)</label>
           <input type="text" value={data.volumeNMO} onChange={(e) => updateBarramento(isMain, idx, 'volumeNMO', e.target.value)} className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" placeholder="Ex: 1,50" />
         </div>
         <div className="sm:col-span-2 md:col-span-1">
           <label className="block text-xs text-slate-500 mb-1">Volume armazenado (NMM) (hm³)</label>
           <input type="number" step="0.0001" value={data.volumeNMM} onChange={(e) => updateBarramento(isMain, idx, 'volumeNMM', e.target.value)} className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" />
         </div>
      </div>
    </div>

    <div className="grid grid-cols-1">
      <label className="block text-sm font-medium text-slate-700 mb-1">Vazão máxima de projeto (m³/s) /TR</label>
      <input type="text" value={data.vazaoMaxima} onChange={(e) => updateBarramento(isMain, idx, 'vazaoMaxima', e.target.value)} className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" placeholder="Ex: 150,00 m³/s (TR 10.000 anos)" />
    </div>

    <div>
      <div className="flex justify-between items-center mb-2">
         <label className="block text-sm font-medium text-slate-700">Estrutura(s) Hidráulica(s)</label>
         <button onClick={() => addStructure(isMain, idx)} className="text-xs flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-medium">
           <Plus size={14} /> Adicionar Estrutura
         </button>
      </div>
      
      {data.estruturas.map((struct, sIdx) => (
        <div key={struct.id} className="bg-white border border-slate-200 rounded-lg p-4 mb-3 shadow-sm relative">
           {data.estruturas.length > 1 && (
             <button onClick={() => removeStructure(isMain, idx, sIdx)} className="absolute top-2 right-2 text-slate-300 hover:text-red-500"><Trash2 size={16}/></button>
           )}
           <div className="mb-3">
             <input 
                type="text" 
                value={struct.descricao} 
                onChange={(e) => updateStructure(isMain, idx, sIdx, 'descricao', e.target.value)}
                className="font-semibold text-sm text-slate-700 border-none p-0 focus:ring-0 w-full"
              />
           </div>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
             <div>
                <label className="block text-xs text-slate-500">Vazão da estrutura (m³/s)</label>
                <input type="number" step="0.001" value={struct.vazao} onChange={(e) => updateStructure(isMain, idx, sIdx, 'vazao', e.target.value)} className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-1.5 text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" />
             </div>
             <div>
                <label className="block text-xs text-slate-500">Cota da soleira (m)</label>
                <input type="number" step="0.01" value={struct.cotaSoleira} onChange={(e) => updateStructure(isMain, idx, sIdx, 'cotaSoleira', e.target.value)} className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-1.5 text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" />
             </div>
             <div className="col-span-1 md:col-span-2">
                <label className="block text-xs text-slate-500">Localização no barramento</label>
                <input type="text" placeholder="Ex: Na ombreira esquerda" value={struct.localizacao} onChange={(e) => updateStructure(isMain, idx, sIdx, 'localizacao', e.target.value)} className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-1.5 text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" />
             </div>
             <div className="col-span-1 md:col-span-2">
                <label className="block text-xs text-slate-500">Segurança Estrutural</label>
                <textarea rows={2} value={struct.seguranca} onChange={(e) => updateStructure(isMain, idx, sIdx, 'seguranca', e.target.value)} className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-1.5 text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" />
             </div>
           </div>
        </div>
      ))}
    </div>

    {/* ADEQUAÇÕES - Moved outside structures loop */}
    <div className="border-t border-slate-200 pt-4">
      <label className="flex items-center gap-2 cursor-pointer mb-2">
        <input 
           type="checkbox" 
           checked={data.possuiAdequacao} 
           onChange={(e) => updateBarramento(isMain, idx, 'possuiAdequacao', e.target.checked)}
           className="rounded text-emerald-600 focus:ring-emerald-500"
        />
        <span className="text-sm font-bold text-slate-700">INSERIR ADEQUAÇÕES</span>
      </label>
      
      {data.possuiAdequacao && (
        <div className="bg-orange-50 p-4 rounded border border-orange-100 grid grid-cols-1 md:grid-cols-2 gap-4">
           <div>
             <label className="block text-xs text-orange-800 font-medium mb-1">Vazão (Adequação) (m³/s)</label>
             <input type="number" step="0.001" value={data.adequacaoVazao || ''} onChange={(e) => updateBarramento(isMain, idx, 'adequacaoVazao', e.target.value)} className="w-full rounded border-orange-200 p-2 text-sm bg-[#F5F5F5]" />
           </div>
           <div>
             <label className="block text-xs text-orange-800 font-medium mb-1">Cota Soleira (Adequação) (m)</label>
             <input type="number" step="0.01" value={data.adequacaoCota || ''} onChange={(e) => updateBarramento(isMain, idx, 'adequacaoCota', e.target.value)} className="w-full rounded border-orange-200 p-2 text-sm bg-[#F5F5F5]" />
           </div>
            <div className="col-span-1 md:col-span-2">
             <label className="block text-xs text-orange-800 font-medium mb-1">Localização (Adequação)</label>
             <input type="text" value={data.adequacaoLocalizacao || ''} onChange={(e) => updateBarramento(isMain, idx, 'adequacaoLocalizacao', e.target.value)} className="w-full rounded border-orange-200 p-2 text-sm bg-[#F5F5F5]" />
           </div>
            <div className="col-span-1 md:col-span-2">
             <label className="block text-xs text-orange-800 font-medium mb-1">Vazão Mínima Remanescente</label>
             <input type="text" value={data.adequacaoVazaoRemanescente || ''} onChange={(e) => updateBarramento(isMain, idx, 'adequacaoVazaoRemanescente', e.target.value)} className="w-full rounded border-orange-200 p-2 text-sm bg-[#F5F5F5]" />
           </div>
            <div className="col-span-1 md:col-span-2">
             <label className="block text-xs text-orange-800 font-medium mb-1">Segurança (Adequação)</label>
             <textarea rows={2} value={data.adequacaoSeguranca || ''} onChange={(e) => updateBarramento(isMain, idx, 'adequacaoSeguranca', e.target.value)} className="w-full rounded border-orange-200 p-2 text-sm bg-[#F5F5F5]" />
           </div>
        </div>
      )}
    </div>
  </div>
);

const TableRowPreview = ({ label, value, bold = false, align = 'left', colSpan = 1, bg = '' }: any) => (
  <td colSpan={colSpan} className={`border border-black px-2 py-1 text-[10pt] ${bold ? 'font-bold' : ''} ${align === 'center' ? 'text-center' : 'text-left'} ${bg}`}>
    {value}
  </td>
);

const OpinionForm: React.FC<OpinionFormProps> = ({ onBack, initialData, readOnly }) => {
  const { currentUser } = useContext(AuthContext);
  
  // Confirm Modal State
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
    variant: 'warning'
  });

  const [formData, setFormData] = useState<ParecerData>(() => {
    const reconcileDocList = (standardList: DocItem[], savedList: DocItem[] | undefined) => {
      if (!savedList || savedList.length === 0) return standardList;
      return standardList.map(std => {
        const saved = savedList.find(s => s.label === std.label);
        if (saved) {
          return { ...std, ...saved };
        }
        return std;
      });
    };

    if (initialData) {
      // Merge initialData with INITIAL_DATA to ensure all fields exist
      const merged = { 
        ...INITIAL_DATA, 
        ...initialData,
        docsGerais: reconcileDocList(INITIAL_DATA.docsGerais, initialData.docsGerais),
        docsIdentificacao: reconcileDocList(INITIAL_DATA.docsIdentificacao, initialData.docsIdentificacao),
        docsEspolio: reconcileDocList(INITIAL_DATA.docsEspolio, initialData.docsEspolio),
        docsArt: reconcileDocList(INITIAL_DATA.docsArt, initialData.docsArt),
        docsTecnicos: reconcileDocList(INITIAL_DATA.docsTecnicos, initialData.docsTecnicos),
        classificacao: {
          ...INITIAL_DATA.classificacao,
          ...(initialData.classificacao || {})
        },
        barragemPrincipal: {
          ...INITIAL_DATA.barragemPrincipal,
          ...(initialData.barragemPrincipal || {})
        },
        barragensMontante: (initialData.barragensMontante || []).map((bm, i) => ({
          ...createEmptyBarramento(`montante_${i}`, `Barragem a Montante ${i + 1}`),
          ...bm,
          possuiAdequacao: Boolean(bm.possuiAdequacao),
          estruturas: bm.estruturas && bm.estruturas.length > 0 ? bm.estruturas : [createEmptyStructure(`montante_${i}_s1`, 1)]
        }))
      };
      return merged;
    }
    return {
      ...INITIAL_DATA,
      id: crypto.randomUUID()
    };
  });
  const [isSaving, setIsSaving] = useState(false);
  const [autoCalc, setAutoCalc] = useState(true);
  const [activeSection, setActiveSection] = useState('introducao');
  const [isPNSB, setIsPNSB] = useState(false);
  
  const formatFls = (val: string) => {
    if (!val) return '';
    const clean = val.trim();
    if (clean.toLowerCase().includes('fls')) return clean;
    return `fls. ${clean}`;
  };
  
  const navRef = useRef<HTMLDivElement>(null);

  const sections = [
    { id: 'introducao', label: '1. Introdução', icon: FileText },
    { id: 'pedido', label: '2. Informações do Pedido', icon: Activity },
    { id: 'barramento', label: '3. Barramento', icon: MapPin },
    { id: 'classificacao', label: '4. Classificação', icon: Scale },
    { id: 'parecer', label: '5. Parecer Técnico', icon: PenTool },
    { id: 'sistema_info', label: '6. Sistema de Informações ao Empreendedor', icon: ShieldCheck },
    { id: 'revisar', label: '7. Revisar e Exportar', icon: Eye },
    { id: 'portaria', label: '8. Portaria', icon: FileDown },
  ];

  const currentStepIndex = sections.findIndex(s => s.id === activeSection);
  const progressPercent = ((currentStepIndex + 1) / sections.length) * 100;

  // Pre-select analyst based on logged-in user
  useEffect(() => {
    if (currentUser?.name && !initialData && (!formData.analista || formData.analista === OPS_ANALISTA[0])) {
      const userName = currentUser.name.trim().toLowerCase();
      const matchedAnalista = OPS_ANALISTA.find(
        name => name.trim().toLowerCase().includes(userName) || 
                userName.includes(name.trim().toLowerCase())
      );
      if (matchedAnalista) {
        setFormData(prev => ({ ...prev, analista: matchedAnalista }));
      }
    }
  }, [currentUser, initialData]);

  // Scroll Spy Effect
  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const sectionIds = sections.map(s => s.id);
          const offset = 220; 

          for (let i = sectionIds.length - 1; i >= 0; i--) {
              const sectionId = sectionIds[i];
              const el = document.getElementById(sectionId);
              if (el) {
                  if (el.getBoundingClientRect().top < offset) {
                      setActiveSection(sectionId);
                      break;
                  }
              }
          }
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Initial check
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Scroll Into View for Mobile Nav (Horizontal Only)
  useEffect(() => {
    if (navRef.current) {
        const activeBtn = navRef.current.querySelector(`[data-section="${activeSection}"]`) as HTMLElement;
        if (activeBtn) {
            const container = navRef.current;
            const scrollLeft = activeBtn.offsetLeft - (container.offsetWidth / 2) + (activeBtn.offsetWidth / 2);
            container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
        }
    }
  }, [activeSection]);
  
  // State for adding new RT
  const [newRT, setNewRT] = useState({
    selectedName: '',
    customName: '',
    art: ''
  });

  const [openSections, setOpenSections] = useState({
    introducao: true,
    pedido: true,
    barramento: true,
    classificacao: true,
    parecer: true,
    sistema_info: true,
    revisar: true,
    portaria: true,
    geral: true,
    ident: false,
    espolio: false,
    art: false,
    tecnico: false
  });

  const toggleSection = (sec: keyof typeof openSections) => {
    setOpenSections(prev => ({...prev, [sec]: !prev[sec]}));
  };

  const maskCPF = (value: string) => {
    return (value || '')
      .replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1');
  };

  const maskCNPJ = (value: string) => {
    return (value || '')
      .replace(/\D/g, '')
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d{1,2})/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1');
  };

  const maskCpfCnpj = (value: string) => {
    const digits = (value || '').replace(/\D/g, '');
    if (digits.length <= 11) {
      return maskCPF(value);
    }
    return maskCNPJ(value);
  };

  const handleInputChange = (field: keyof ParecerData, value: any) => {
    setFormData((prev) => {
      let updated = { ...prev, [field]: value };
      
      // Auto-fill UPG when municipio changes
      if (field === 'municipio') {
        const upgs = getUpgsForMunicipality(value);
        updated.upg = upgs.length === 1 ? upgs[0] : '';
      }
      
      // Auto-select CRI Pre-classificação if tipoClassificacao is "CRI em pré-classificação"
      if (field === 'tipoClassificacao' && value === 'CRI em pré-classificação') {
        updated.classificacao = {
          ...updated.classificacao,
          criPreClassificacao: true
        };
      }
      
      return updated;
    });
  };

  // --- RT Handlers ---
  const handleAddRT = () => {
    if ((!newRT.selectedName && !newRT.customName) || !newRT.art) {
      toast.error("Por favor, selecione ou digite o nome do Responsável Técnico e o número da ART.");
      return;
    }

    const name = newRT.selectedName === 'OUTRO' ? newRT.customName : newRT.selectedName;
    if (!name) {
       toast.error("Por favor, digite o nome do Responsável Técnico.");
       return;
    }

    const entry: ResponsavelTecnicoEntry = {
      id: Date.now().toString(),
      nome: name,
      art: newRT.art
    };

    setFormData(prev => ({
      ...prev,
      responsaveisTecnicos: [...prev.responsaveisTecnicos, entry]
    }));

    setNewRT({ selectedName: '', customName: '', art: '' });
  };

  const handleRemoveRT = (id: string) => {
    setFormData(prev => ({
      ...prev,
      responsaveisTecnicos: prev.responsaveisTecnicos.filter(rt => rt.id !== id)
    }));
  };

  const handleSistemaInfoChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      sistemaInformacoes: {
        ...(prev.sistemaInformacoes || { processo: '', analista: '', municipio: '' }),
        [field]: value
      }
    }));
  };

  const calculateDateLimit = () => {
    const info = formData.sistemaInformacoes;
    if (!info?.data_envio_pendencia || !info?.data_limite_dias) return null;
    
    const sendDate = new Date(info.data_envio_pendencia);
    const limitDate = new Date(sendDate);
    limitDate.setDate(limitDate.getDate() + info.data_limite_dias);
    
    const today = new Date();
    const diffTime = limitDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return {
      vencimento: limitDate.toLocaleDateString('pt-BR'),
      faltam: diffDays > 0 ? diffDays : 0,
      concedidos: info.data_limite_dias
    };
  };

  const dateLimitInfo = calculateDateLimit();

  const handleDocChange = (listKey: keyof ParecerData, id: string, field: keyof DocItem, value: any) => {
    setFormData((prev) => {
      const list = prev[listKey];
      if (Array.isArray(list)) {
        const newList = list.map(item => item.id === id ? { ...item, [field]: value } : item);
        return { ...prev, [listKey]: newList };
      }
      return prev;
    });
  };

  const handleAddOtherDoc = (listKey: keyof ParecerData, prefix: string) => {
    setFormData(prev => {
      const list = prev[listKey] as DocItem[];
      const newId = `${prefix}_outro_${list.length}`;
      const newItem: DocItem = { id: newId, label: 'OUTRO', checked: true, pageNumber: '', extraInput: '' };
      return { ...prev, [listKey]: [...list, newItem] };
    });
  };

  const handleRemoveOtherDoc = (listKey: keyof ParecerData, id: string) => {
    setFormData(prev => {
      const list = prev[listKey] as DocItem[];
      if (list.length <= 1) return prev; // Keep at least one
      return { ...prev, [listKey]: list.filter(item => item.id !== id) };
    });
  };

  // --- BARRAMENTO HELPERS ---

  const updateBarramento = (
    isMain: boolean, 
    idx: number, 
    field: keyof BarramentoData, 
    value: any
  ) => {
    setFormData(prev => {
      let additionalUpdates = {};
      
      // Auto-calculate score when age changes
      if (field === 'idade') {
        const score = getAgeScore(value);
        additionalUpdates = { scoreIdade: score };
      }

      if (isMain) {
        return { ...prev, barragemPrincipal: { ...prev.barragemPrincipal, [field]: value, ...additionalUpdates } };
      } else {
        const newArr = [...prev.barragensMontante];
        newArr[idx] = { ...newArr[idx], [field]: value, ...additionalUpdates };
        return { ...prev, barragensMontante: newArr };
      }
    });
  };

  const updateStructure = (
    isMain: boolean,
    barramentoIdx: number,
    structIdx: number,
    field: keyof EstruturaHidraulica,
    value: any
  ) => {
    setFormData(prev => {
      const targetBarramento = isMain ? prev.barragemPrincipal : prev.barragensMontante[barramentoIdx];
      const newStructs = [...targetBarramento.estruturas];
      newStructs[structIdx] = { ...newStructs[structIdx], [field]: value };

      if (isMain) {
        return { ...prev, barragemPrincipal: { ...prev.barragemPrincipal, estruturas: newStructs } };
      } else {
        const newArr = [...prev.barragensMontante];
        newArr[barramentoIdx] = { ...targetBarramento, estruturas: newStructs };
        return { ...prev, barragensMontante: newArr };
      }
    });
  };

  const addStructure = (isMain: boolean, barramentoIdx: number) => {
    setFormData(prev => {
      const targetBarramento = isMain ? prev.barragemPrincipal : prev.barragensMontante[barramentoIdx];
      const count = targetBarramento.estruturas.length + 1;
      const newStruct = createEmptyStructure(`${targetBarramento.id}_s${count}`, count);
      
      if (isMain) {
        return { ...prev, barragemPrincipal: { ...prev.barragemPrincipal, estruturas: [...prev.barragemPrincipal.estruturas, newStruct] } };
      } else {
        const newArr = [...prev.barragensMontante];
        newArr[barramentoIdx] = { ...targetBarramento, estruturas: [...targetBarramento.estruturas, newStruct] };
        return { ...prev, barragensMontante: newArr };
      }
    });
  };

  const removeStructure = (isMain: boolean, barramentoIdx: number, structIdx: number) => {
    setFormData(prev => {
      const targetBarramento = isMain ? prev.barragemPrincipal : prev.barragensMontante[barramentoIdx];
      if (targetBarramento.estruturas.length <= 1) return prev; // Don't remove the last one
      
      const newStructs = targetBarramento.estruturas.filter((_, i) => i !== structIdx);
      
      if (isMain) {
        return { ...prev, barragemPrincipal: { ...prev.barragemPrincipal, estruturas: newStructs } };
      } else {
        const newArr = [...prev.barragensMontante];
        newArr[barramentoIdx] = { ...targetBarramento, estruturas: newStructs };
        return { ...prev, barragensMontante: newArr };
      }
    });
  };

  const addUpstreamDam = () => {
    setFormData(prev => ({
      ...prev,
      barragensMontante: [...prev.barragensMontante, createEmptyBarramento(`montante_${prev.barragensMontante.length}`, `Barragem a Montante ${prev.barragensMontante.length + 1}`)]
    }));
  };

  const removeUpstreamDam = (idx: number) => {
    setFormData(prev => ({
      ...prev,
      barragensMontante: prev.barragensMontante.filter((_, i) => i !== idx)
    }));
  };

  // --- CLASSIFICATION HELPERS ---
  // (Effect to recalculate Scores and CRI)
  useEffect(() => {
    if (autoCalc) {
      setFormData(prev => {
        // --- 1. DPA CALCULATION ---
        // Auto-calculate DPA1 based on Barramento Volume (Request #4)
        const dpa1Select = getDpa1FromVolume(prev.barragemPrincipal.volumeNMM);
        const scoreDpa1 = extractScore(dpa1Select);
        
        const scoreDpa2 = extractScore(prev.classificacao.dpa2Select);
        const scoreDpa3 = extractScore(prev.classificacao.dpa3Select);
        const scoreDpa4 = extractScore(prev.classificacao.dpa4Select);
        
        const totalDpa = scoreDpa1 + scoreDpa2 + scoreDpa3 + scoreDpa4;
        
        let dpaClass = DanoEnum.BAIXO;
        if (totalDpa < 7) dpaClass = DanoEnum.BAIXO;
        else if (totalDpa >= 7 && totalDpa <= 13) dpaClass = DanoEnum.MEDIO;
        else if (totalDpa > 13) dpaClass = DanoEnum.ALTO;

        // --- 2. CRI CALCULATION ---

        // CT1: Altura
        let scoreCt1 = 0;
        const h = parseFloat(prev.barragemPrincipal.alturaMaxima || '0');
        if (h < 15) scoreCt1 = 0;
        else if (h >= 15 && h < 30) scoreCt1 = 3;
        else if (h >= 30 && h <= 60) scoreCt1 = 4;
        else if (h > 60) scoreCt1 = 5;

        // CT2: Comprimento
        let scoreCt2 = 0;
        const len = parseFloat(prev.barragemPrincipal.comprimentoCoroamento || '0');
        if (len < 200) scoreCt2 = 1;
        else if (len >= 200 && len < 600) scoreCt2 = 3;
        else if (len >= 600 && len <= 1200) scoreCt2 = 4;
        else if (len > 1200) scoreCt2 = 5;

        // CT3, CT4, CT5: pulled from main dam data
        const scoreCt3 = extractScore(prev.barragemPrincipal.tipoEstrutural);
        const scoreCt4 = extractScore(prev.barragemPrincipal.tipoFundacao);
        const scoreCt5 = prev.barragemPrincipal.scoreIdade; // pre-calc in barramento

        // CT6: Selected in 4.3
        const scoreCt6 = extractScore(prev.classificacao.ct6Select);

        // EC Scores
        const scoreEc1 = extractScore(prev.classificacao.ec1Select);
        const scoreEc2 = extractScore(prev.classificacao.ec2Select);
        const scoreEc3 = extractScore(prev.classificacao.ec3Select);
        const scoreEc4 = extractScore(prev.classificacao.ec4Select);
        const scoreEc5 = extractScore(prev.classificacao.ec5Select);

        // PS Scores
        const scorePs1 = extractScore(prev.classificacao.ps1Select);
        const scorePs2 = extractScore(prev.classificacao.ps2Select);
        const scorePs3 = extractScore(prev.classificacao.ps3Select);
        const scorePs4 = extractScore(prev.classificacao.ps4Select);
        const scorePs5 = extractScore(prev.classificacao.ps5Select);
        const scorePs6 = extractScore(prev.classificacao.ps6Select);

        const totalCT = Number(scoreCt1) + Number(scoreCt2) + Number(scoreCt3) + Number(scoreCt4) + Number(scoreCt5) + Number(scoreCt6);
        const totalEC = Number(scoreEc1) + Number(scoreEc2) + Number(scoreEc3) + Number(scoreEc4) + Number(scoreEc5);
        const totalPS = Number(scorePs1) + Number(scorePs2) + Number(scorePs3) + Number(scorePs4) + Number(scorePs5) + Number(scorePs6);

        // Risk Indicators
        
        // Geral (CT + EC + PS)
        const valGeral = Number(totalCT) + Number(totalEC) + Number(totalPS);
        let riskGeral = RiscoEnum.BAIXO;
        if (valGeral >= 65) riskGeral = RiscoEnum.ALTO;
        else if (valGeral > 35 && valGeral < 65) riskGeral = RiscoEnum.MEDIO;
        else riskGeral = RiscoEnum.BAIXO;

        // Percolação/Conservação (EC3 + EC4 + EC5)
        const valPercolacao = Number(scoreEc3) + Number(scoreEc4) + Number(scoreEc5);
        let riskPercolacao = RiscoEnum.BAIXO;
        if (Number(scoreEc3) === 5 || Number(scoreEc4) === 5 || Number(scoreEc5) === 5 || valPercolacao > 10) riskPercolacao = RiscoEnum.ALTO;
        else if (valPercolacao > 7 && valPercolacao <= 10) riskPercolacao = RiscoEnum.MEDIO;
        else riskPercolacao = RiscoEnum.BAIXO;

        // Galgamento (CT6 + EC1)
        const valGalgamento = Number(scoreCt6) + Number(scoreEc1);
        let riskGalgamento = RiscoEnum.BAIXO;
        if (valGalgamento > 7 || Number(scoreEc1) === 5) riskGalgamento = RiscoEnum.ALTO;
        else if (valGalgamento > 4 && valGalgamento <= 7) riskGalgamento = RiscoEnum.MEDIO;
        else riskGalgamento = RiscoEnum.BAIXO;

        // Gerencial (PS)
        const valGerencial = totalPS;
        let riskGerencial = RiscoEnum.BAIXO;
        if (valGerencial >= 24) riskGerencial = RiscoEnum.ALTO;
        else if (valGerencial > 13 && valGerencial < 24) riskGerencial = RiscoEnum.MEDIO;
        else riskGerencial = RiscoEnum.BAIXO;

        // FINAL CRI
        let finalRisco = RiscoEnum.BAIXO;
        const risks = [riskGeral, riskPercolacao, riskGalgamento, riskGerencial];
        
        if (risks.includes(RiscoEnum.ALTO)) {
            finalRisco = RiscoEnum.ALTO;
        } else if (risks.includes(RiscoEnum.MEDIO)) {
            finalRisco = RiscoEnum.MEDIO;
        } else {
            finalRisco = RiscoEnum.BAIXO;
        }

        // --- 3. MATRIX RECALC ---
        const altura = parseFloat(prev.barragemPrincipal.alturaMaxima || '0');
        const volume = parseFloat(prev.barragemPrincipal.volumeNMM || '0');
        
        // Update PNSB Flag
        const fitsPNSB = checkPNSB(dpaClass, altura, volume);
        setIsPNSB(fitsPNSB);

        const matrixResumo = calculateClassificationMatrix(finalRisco, dpaClass, altura, volume, fitsPNSB);

        // --- 4. GENERATE PARECER TEXT (SECTION 5) ---
        const tipoClass = prev.tipoClassificacao === 'OUTRO' ? prev.tipoClassificacaoOutro : prev.tipoClassificacao;
        const enquadramentoText = getEnquadramentoText(dpaClass, altura, volume);
        
        const volNomenclatureMap: Record<string, string> = {
          "MUITO BAIXO – inferior a 3hm³ (1)": "muito pequeno.",
          "BAIXO – de 3 a 10 hm³ (2)": "pequeno.",
          "MEDIO – de 10 a 75 hm³ (3)": "médio.",
          "ALTO – de 75 a 200 hm³ (4)": "grande.",
          "MUITO ALTO – superior a 200hm³ (5)": "muito grande."
        };
        const volNomenclature = volNomenclatureMap[prev.classificacao.dpa1Select] || cleanScore(prev.classificacao.dpa1Select);
        
        const snisb = prev.barragemPrincipal.snisb || '_____';

        let parecerText = "";
        
        parecerText = `A solicitação de ${tipoClass} da barragem está em conformidade com a Instrução Normativa nº 08, de 18 de dezembro de 2023. Na análise de classificação realizada, verificou-se que a barragem apresenta Volume ‘${volNomenclature}’, Dano Potencial Associado (DPA) classificado como ${dpaClass.toUpperCase()} e Categoria de Risco (CRI) classificada como ${finalRisco.toUpperCase()}.
Assim, em conclusão à análise, tem-se que a barragem ${enquadramentoText}
É responsabilidade do empreendedor comunicar ao fiscalizador sobre qualquer alteração na sua barragem, bem como, fazer a gestão de segurança da barragem e reparação de danos decorrentes de seu rompimento, vazamento ou mau funcionamento independentemente da existência de culpa.
O empreendedor deverá permitir o acesso irrestrito do órgão fiscalizador e dos órgãos integrantes do Sistema Nacional de Proteção e Defesa Civil (SINPDEC) ao local da barragem e à sua documentação de segurança.
Considerando os fatos e análises apresentadas, manifestamo-nos pelo deferimento da ${tipoClass} desta barragem localizada em rio de domínio estadual sendo inserida no cadastro do Sistema Nacional de Informação de Segurança de Barragens (SNISB) com o código nº ${snisb}.
Esta classificação é realizada considerando o uso e ocupação do solo atuais e poderá ser alterada caso sejam identificadas modificações em algum dos critérios utilizados para a classificação. Salienta-se que este parecer ou o ato de classificação não autorizam obras no barramento e que o empreendedor deve obter as licenças antes de quaisquer obras em conformidade com a lei ambiental vigente.`;

        return {
          ...prev,
          parecer_final: parecerText,
          classificacao: {
            ...prev.classificacao,
            // DPA
            dpa1Select, scoreDpa1, scoreDpa2, scoreDpa3, scoreDpa4, totalDpa, dpaClass,
            // CRI Stats
            scoreCt1, scoreCt2, scoreCt3, scoreCt4, scoreCt5, scoreCt6,
            scoreEc1, scoreEc2, scoreEc3, scoreEc4, scoreEc5,
            scorePs1, scorePs2, scorePs3, scorePs4, scorePs5, scorePs6,
            totalCT, totalEC, totalPS,
            valGeral, riskGeral,
            valPercolacao, riskPercolacao,
            valGalgamento, riskGalgamento,
            valGerencial, riskGerencial,
            risco: finalRisco,
            resumo: matrixResumo
          }
        };
      });
    }
  }, [
    autoCalc,
    // DPA Deps
    formData.classificacao.dpa1Select, formData.classificacao.dpa2Select, formData.classificacao.dpa3Select, formData.classificacao.dpa4Select,
    // CT Deps
    formData.barragemPrincipal.alturaMaxima, formData.barragemPrincipal.comprimentoCoroamento, formData.barragemPrincipal.tipoEstrutural, formData.barragemPrincipal.tipoFundacao, formData.barragemPrincipal.scoreIdade, formData.classificacao.ct6Select, formData.barragemPrincipal.volumeNMM,
    // EC Deps
    formData.classificacao.ec1Select, formData.classificacao.ec2Select, formData.classificacao.ec3Select, formData.classificacao.ec4Select, formData.classificacao.ec5Select,
    // PS Deps
    formData.classificacao.ps1Select, formData.classificacao.ps2Select, formData.classificacao.ps3Select, formData.classificacao.ps4Select, formData.classificacao.ps5Select, formData.classificacao.ps6Select,
    // Extra fields needed for Text generation
    formData.tipoClassificacao, formData.tipoClassificacaoOutro, formData.barragemPrincipal.snisb
  ]);

  const handleClassificationChange = (field: keyof typeof INITIAL_DATA.classificacao, value: any) => {
    setFormData((prev) => ({ 
      ...prev, 
      classificacao: { ...prev.classificacao, [field]: value } 
    }));
  };

  const calculateClassificationMatrix = (risco: RiscoEnum, dpa: DanoEnum, altura: number, volume: number, fitsPNSB: boolean): string => {
    if (dpa === DanoEnum.ALTO) {
       return "CLASSE A";
    } 
    
    if (dpa === DanoEnum.MEDIO) {
       return "CLASSE B"; 
    }

    if (dpa === DanoEnum.BAIXO) {
        if (fitsPNSB) {
            if (risco === RiscoEnum.ALTO) {
                return "CLASSE C";
            } else {
                return "CLASSE D";
            }
        } else {
            return "NÃO SE ENQUADRA NA PNSB";
        }
    }

    return "NÃO SE ENQUADRA NA PNSB";
  };

  const handleGenerateDoc = async () => {
    setIsSaving(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 800));
      await generateParecerDoc(formData);
      await logActivity('DOWNLOAD_DOCUMENT', { type: 'Parecer Técnico', doc: formData.protocolo, interessado: formData.razaoSocial });
    } catch (error) {
      console.error(error);
      toast.error('Erro ao gerar documento.');
    } finally {
      setIsSaving(false);
    }
  };

  const [isEditingPortaria, setIsEditingPortaria] = useState(false);

  const generatePortariaText = () => {
    const months = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
    const formatDate = (dateStr?: string) => {
      if (!dateStr) return "___ DE ________ DE ____";
      const d = new Date(dateStr + 'T12:00:00');
      return `${String(d.getDate()).padStart(2, '0')} DE ${months[d.getMonth()]} DE ${d.getFullYear()}`;
    };

    const classif = (formData.tipoClassificacao === 'OUTRO' ? formData.tipoClassificacaoOutro : formData.tipoClassificacao) || '';
    const barragem = (formData.tipoBarragem === 'OUTRO' ? formData.tipoBarragemOutro : formData.tipoBarragem) || '';
    const portariaNumero = formData.portariaNumero || '__________';
    const dataPortariaStr = formatDate(formData.dataPortaria);
    
    const dpaValue = formData.classificacao.dpaClass;
    const isHighOrMedDpa = dpaValue === DanoEnum.MEDIO || dpaValue === DanoEnum.ALTO;

    const dpaParag = isHighOrMedDpa 
      ? `Considerando a Resolução CEHIDRO n° 163, de 11 de maio de 2023, que estabelece a periocidade de execução ou atualização, a qualificação dos responsáveis técnicos, o conteúdo mínimo e o nível de detalhamento do Plano de Segurança de Barragem, das Inspeções da Segurança Regular e Especial, da Revisão Periódica da Segurança de Barragem e do Plano de Ação de Emergência, das Barragens fiscalizadas pela SEMA, MT;\n\n`
      : "";

    const ptDateFormatted = formData.dataParecerTecnico 
      ? `${new Date(formData.dataParecerTecnico + 'T12:00:00').getDate().toString().padStart(2, '0')} de ${months[new Date(formData.dataParecerTecnico + 'T12:00:00').getMonth()].toLowerCase()} de ${new Date(formData.dataParecerTecnico + 'T12:00:00').getFullYear()}`
      : "___ de ________ de ____";

    const roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV"];
    let currentIndex = 0;
    
    const items = [
      `${roman[currentIndex++]}.\tCódigo SNISB: ${formData.barragemPrincipal.snisb || '__________'};`,
      `${roman[currentIndex++]}.\tDano Potencial Associado: ${dpaValue};`,
    ];

    if (!formData.classificacao.criPreClassificacao) {
      items.push(`${roman[currentIndex++]}.\tCategoria de Risco: ${formData.classificacao.risco};`);
    }

    items.push(
      `${roman[currentIndex++]}.\tClassificação quanto ao volume: ${formData.barragemPrincipal.volumeNMM} hm³;`,
      `${roman[currentIndex++]}.\tEmpreendedor: ${formData.razaoSocial} ${(formData.cpfCnpj || '').replace(/\D/g, '').length > 11 ? 'CNPJ' : 'CPF'} n° ${formData.cpfCnpj};`,
      `${roman[currentIndex++]}.\tMunicípio/UF: ${formData.municipio}/MT;`,
      `${roman[currentIndex++]}.\tCoordenadas Geográficas: ${formData.barragemPrincipal.lat} , ${formData.barragemPrincipal.long};`,
      `${roman[currentIndex++]}.\tAltura (m): ${formData.barragemPrincipal.alturaMaxima};`,
      `${roman[currentIndex++]}.\tVolume (hm³): ${formData.barragemPrincipal.volumeNMM};`,
      `${roman[currentIndex++]}.\tCurso d'água barrado: ${formData.cursoAgua}, UPG ${formData.upg}, ${formData.subBacia}.`
    );

    let artIndex = 3;
    let optionalArts = "";
    if (isHighOrMedDpa) {
      optionalArts = `Art. 3º A barragem objeto deste ato, por apresentar volume maior que 3hm³, está submetida à Lei nº 12.334, de 20 de setembro de 2010, atualizada pela Lei 14.066 de 30 de setembro de 2020.\n\nArt. 4º O empreendedor deverá atender as condicionantes constantes no item 5.1 do Parecer Técnico Nº ${formData.parecerTecnicoNumero || '__________'}.\n\n`;
      artIndex = 5;
    } else {
      optionalArts = `Art. 3º A barragem objeto deste ato, por apresentar Dano Potencial Associado Baixo, altura do maciço menor que quinze metros e capacidade total do reservatório menor que três hectômetros cúbicos, não está submetida à Lei nº 12.334, de 20 de setembro de 2010, atualizada pela Lei 14.066 de 30 de setembro de 2020.\n\n`;
      artIndex = 4;
    }

    return `PORTARIA DE ${classif.toUpperCase()} DE ${barragem.toUpperCase()} N° ${portariaNumero} DE ${dataPortariaStr}

${classif.toUpperCase()} quanto à Segurança da ${barragem} existente no ${formData.cursoAgua || '__________'}, UPG ${formData.upg || '__________'}, ${formData.subBacia || '__________'}, município de ${formData.municipio || '__________'}/MT, empreendedor ${formData.razaoSocial || '__________'}.

A Secretária Adjunta de Licenciamento Ambiental e Recursos Hídricos, Lilian Ferreira dos Santos, no uso das atribuições que lhe confere o Art. 118, do Decreto nº 1.599, de 06 de agosto de 2025, e

Considerando o disposto no art. 7º, da Lei 12.334, de 20 de setembro de 2010, que estabelece a Política Nacional de Segurança de Barragens;

Considerando a Resolução CNRH n° 241, de 10 de setembro de 2024 que estabelece critérios gerais de classificação de barragens por dano potencial associado, por volume e por categoria de risco, em andamento ao art.7° da Lei 12.334, de 20 de setembro de 2010;

${dpaParag}Considerando a Instrução Normativa nº 08, de 19 de dezembro de 2023, que dispõe sobre os procedimentos referentes à Classificação quanto à Segurança de Barragens para usos de múltiplos, exceto para geração de energia, em corpos hídricos de dominialidade do Estado de Mato Grosso e dá outras providências. 

Considerando o Parecer Técnico n° ${formData.parecerTecnicoNumero || '__________'}/CSB/SEMA, de ${ptDateFormatted}, do processo ${formData.protocolo || '__________'}.

RESOLVE:

Art. 1º Classificar a Barragem localizada no município de ${formData.municipio || '__________'}/MT ao Dano Potencial Associado e ao volume, conforme discriminado abaixo: 

${items.join('\n')}

Art. 2º A SEMA, a seu critério ou por solicitação do empreendedor, poderá rever a classificação da barragem, com a devida justificativa.

${optionalArts}Art. ${artIndex++}º O empreendedor é o responsável pela segurança da barragem, esteja ela submetida ou não à referida Lei, devendo zelar pela sua manutenção e operação, de maneira a reduzir a possibilidade de acidente e suas consequências.

Art. ${artIndex++}º Compete inteiramente ao empreendedor a responsabilidade pela classificação da segurança da barragem e pelo cumprimento das obrigações elencadas no Parecer Técnico n° ${formData.parecerTecnicoNumero || '__________'}.

Art. ${artIndex++}º Esta Portaria entra em vigor na data de sua publicação.

LILIAN FERREIRA DOS SANTOS
Secretária Adjunta de Licenciamento Ambiental e Recursos Hídricos
GSALARH/SEMA-MT`;
  };

  const handleCopyPortaria = () => {
    const text = formData.customPortariaText || generatePortariaText();
    navigator.clipboard.writeText(text);
    toast.success("Texto da portaria copiado!");
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
                indent: { start: 1700 }, // Roughly ruler 3
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
      saveAs(blob, `Portaria_${formData.protocolo?.replace(/\//g, '_') || 'Gerada'}.docx`);
      await logActivity('DOWNLOAD_DOCUMENT', { type: 'Portaria de Classificação', doc: formData.protocolo, interessado: formData.razaoSocial });
      toast.success("Portaria DOCX gerada com sucesso!");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao gerar Portaria DOCX.");
    }
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
          <div key={i} className="text-justify indent-12 mb-4">
            {parts[0]}
            <span className="font-bold">Lilian Ferreira dos Santos</span>
            {parts[1] || ""}
          </div>
        );
      }

      if (["LILIAN FERREIRA DOS SANTOS", "Secretária Adjunta de Licenciamento Ambiental e Recursos Hídricos", "GSALARH/SEMA-MT"].includes(cleanLine)) {
        return (
          <div key={i} className={`text-center ${cleanLine === "LILIAN FERREIRA DOS SANTOS" ? "font-bold mt-12" : ""}`}>
            {cleanLine}
          </div>
        );
      }

      const isItem = cleanLine.match(/^[IVX]+\.\t/);
      return (
        <div key={i} className={`text-justify mb-2 ${isItem ? 'ml-16' : 'indent-12'}`}>
          {cleanLine}
        </div>
      );
    });
  };

  const handleSaveDraft = async () => {
    setConfirmModal({
      isOpen: true,
      title: 'Salvar Rascunho',
      message: 'Deseja realmente salvar este parecer como rascunho?',
      variant: 'info',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        await saveToSupabase('Rascunho');
      }
    });
  };

  const handleSaveComplete = async () => {
    setConfirmModal({
      isOpen: true,
      title: 'Finalizar Parecer',
      message: 'Deseja realmente FINALIZAR este parecer? Após a finalização, ele não poderá mais ser editado como rascunho.',
      variant: 'warning',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        await saveToSupabase('Concluído');
      }
    });
  };

  const saveToSupabase = async (status: 'Rascunho' | 'Concluído') => {
    if (!currentUser) {
      toast.error("Erro: Usuário não autenticado.");
      return;
    }

    if (!formData.protocolo || !formData.razaoSocial || !formData.municipio) {
      toast.error('Por favor, preencha todos os campos obrigatórios (Protocolo, Interessado e Município).');
      return;
    }

    setIsSaving(true);
    try {
      const userName = currentUser.name || 'Analista';

      const parecerId = formData.id || crypto.randomUUID();
      if (!formData.id) {
        setFormData(prev => ({ ...prev, id: parecerId }));
      }

      // 1. Upsert Parecer Principal
      const payload = {
        user_id: currentUser.id,
        protocolo: formData.protocolo,
        analista: userName,
        analista_outro: formData.analistaOutro || null,
        data_parecer: formData.data || null,
        data_recebimento_processo: formData.dataRecebimentoProcesso || null,
        razao_social: formData.razaoSocial,
        cpf_cnpj: formData.cpfCnpj,
        localizacao: formData.localizacao,
        num_car: formData.numCAR,
        municipio: formData.municipio,
        finalidade: formData.finalidade,
        finalidade_outro: formData.finalidadeOutro,
        situacao_empreendimento: formData.situacaoEmpreendimento,
        situacao_empreendimento_outro: formData.situacaoEmpreendimentoOutro,
        curso_agua: formData.cursoAgua,
        propriedades_limites: formData.propriedadesLimites,
        sub_bacia: formData.subBacia,
        upg: formData.upg,
        area_bacia: formData.areaBacia,
        indice_pluviosidade: formData.indicePluviosidade,
        legenda_tabela1: formData.legendaTabela1,
        tipo_classificacao: formData.tipoClassificacao,
        tipo_classificacao_outro: formData.tipoClassificacaoOutro,
        tipo_barragem: formData.tipoBarragem,
        tipo_barragem_outro: formData.tipoBarragemOutro,
        introducao: formData.introducao,
        parecer_final: formData.parecer_final,
        parecer_tecnico_numero: formData.parecerTecnicoNumero,
        data_parecer_tecnico: formData.dataParecerTecnico || null,
        portaria_numero: formData.portariaNumero,
        data_portaria: formData.dataPortaria || null,
        custom_portaria_text: formData.customPortariaText,
        status: status,
        tipo_documento: 'Parecer Técnico',
        data_conclusao: status === 'Concluído' ? new Date().toISOString() : (formData.status === 'Concluído' ? formData.dataConclusao : null),
        updated_at: new Date().toISOString(),
        // Campos de classificação
        dpa_class: formData.classificacao.dpaClass,
        dpa1_select: formData.classificacao.dpa1Select,
        dpa2_select: formData.classificacao.dpa2Select,
        dpa3_select: formData.classificacao.dpa3Select,
        dpa4_select: formData.classificacao.dpa4Select,
        score_dpa1: formData.classificacao.scoreDpa1,
        score_dpa2: formData.classificacao.scoreDpa2,
        score_dpa3: formData.classificacao.scoreDpa3,
        score_dpa4: formData.classificacao.scoreDpa4,
        total_dpa: formData.classificacao.totalDpa,
        ruptura_texto: formData.classificacao.rupturaTexto,
        legenda_dpa: formData.classificacao.legendaDPA,
        cri_pre_classificacao: formData.classificacao.criPreClassificacao,
        ct6_select: formData.classificacao.ct6Select,
        ec1_select: formData.classificacao.ec1Select,
        ec2_select: formData.classificacao.ec2Select,
        ec3_select: formData.classificacao.ec3Select,
        ec4_select: formData.classificacao.ec4Select,
        ec5_select: formData.classificacao.ec5Select,
        ps1_select: formData.classificacao.ps1Select,
        ps2_select: formData.classificacao.ps2Select,
        ps3_select: formData.classificacao.ps3Select,
        ps4_select: formData.classificacao.ps4Select,
        ps5_select: formData.classificacao.ps5Select,
        ps6_select: formData.classificacao.ps6Select,
        score_ct1: formData.classificacao.scoreCt1,
        score_ct2: formData.classificacao.scoreCt2,
        score_ct3: formData.classificacao.scoreCt3,
        score_ct4: formData.classificacao.scoreCt4,
        score_ct5: formData.classificacao.scoreCt5,
        score_ct6: formData.classificacao.scoreCt6,
        score_ec1: formData.classificacao.scoreEc1,
        score_ec2: formData.classificacao.scoreEc2,
        score_ec3: formData.classificacao.scoreEc3,
        score_ec4: formData.classificacao.scoreEc4,
        score_ec5: formData.classificacao.scoreEc5,
        score_ps1: formData.classificacao.scorePs1,
        score_ps2: formData.classificacao.scorePs2,
        score_ps3: formData.classificacao.scorePs3,
        score_ps4: formData.classificacao.scorePs4,
        score_ps5: formData.classificacao.scorePs5,
        score_ps6: formData.classificacao.scorePs6,
        total_ct: formData.classificacao.totalCT,
        total_ec: formData.classificacao.totalEC,
        total_ps: formData.classificacao.totalPS,
        val_geral: formData.classificacao.valGeral,
        risk_geral: formData.classificacao.riskGeral,
        val_percolacao: formData.classificacao.valPercolacao,
        risk_percolacao: formData.classificacao.riskPercolacao,
        val_galgamento: formData.classificacao.valGalgamento,
        risk_galgamento: formData.classificacao.riskGalgamento,
        val_gerencial: formData.classificacao.valGerencial,
        risk_gerencial: formData.classificacao.riskGerencial,
        risco: formData.classificacao.risco,
        resumo: formData.classificacao.resumo
      };

      // 1. Upsert Parecer Principal
      let actualParecerId = parecerId;
      const { data: parecerRows, error: parecerError } = await supabase
        .from('pareceres')
        .upsert({ id: parecerId, ...payload })
        .select()
        .single();

      if (parecerError) {
        console.error('Supabase Upsert Error (Pareceres):', parecerError);
        // Fallback para coluna 'data' se as colunas específicas não existirem
        if (parecerError.code === '42703') {
          const { data: retryData, error: retryError } = await supabase
            .from('pareceres')
            .upsert({
              id: parecerId,
              user_id: currentUser.id,
              analista: userName,
              protocolo: formData.protocolo,
              status: status,
              tipo_documento: 'Parecer Técnico',
              data: { ...payload, analista: userName },
              updated_at: new Date().toISOString()
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

      // 2. Responsáveis Técnicos
      const { error: deleteRespError } = await supabase.from('parecer_responsaveis').delete().eq('parecer_id', actualParecerId);
      if (deleteRespError) await handleSupabaseError(deleteRespError, OperationType.DELETE, 'parecer_responsaveis');

      const rts = formData.responsaveisTecnicos || [];
      if (rts.length > 0) {
        const { error: respError } = await supabase.from('parecer_responsaveis').insert(
          rts.map(rt => ({
            parecer_id: actualParecerId,
            nome: rt.nome,
            art: rt.art
          }))
        );
        if (respError) await handleSupabaseError(respError, OperationType.CREATE, 'parecer_responsaveis');
      }

      // 2.1 Sistema de Informações ao Empreendedor
      const infoPayload = {
        parecer_id: actualParecerId,
        processo: formData.protocolo,
        analista: formData.analista === 'OUTRO' ? formData.analistaOutro : formData.analista,
        municipio: formData.municipio,
        data_envio_pendencia: formData.sistemaInformacoes?.data_envio_pendencia || null,
        data_limite_dias: formData.sistemaInformacoes?.data_limite_dias || null,
        situacao: formData.sistemaInformacoes?.situacao || 'Aguardando análise',
        observacoes_analista: formData.sistemaInformacoes?.observacoes_analista || null,
        updated_at: new Date().toISOString()
      };

      const { error: infoError } = await supabase
        .from('informacoes_empreendedor')
        .upsert(infoPayload, { onConflict: 'parecer_id' });
      
      if (infoError) {
        console.error(infoError);
        // Não lançaremos erro fatal aqui para não bloquear o salvamento principal, mas reportaremos para fins de robustez
        handleSupabaseError(infoError, OperationType.UPSERT, 'informacoes_empreendedor').catch(console.error);
      }

      // 3. Documentos
      const { error: deleteDocsError } = await supabase.from('parecer_documentos').delete().eq('parecer_id', actualParecerId);
      if (deleteDocsError) await handleSupabaseError(deleteDocsError, OperationType.DELETE, 'parecer_documentos');
      
      const allDocs = [
        ...(formData.docsGerais || []).map(d => ({ ...d, grupo: 'Gerais' })),
        ...(formData.docsIdentificacao || []).map(d => ({ ...d, grupo: 'Identificação' })),
        ...(formData.docsEspolio || []).map(d => ({ ...d, grupo: 'Espólio' })),
        ...(formData.docsArt || []).map(d => ({ ...d, grupo: 'ART' })),
        ...(formData.docsTecnicos || []).map(d => ({ ...d, grupo: 'Técnicos' })),
        ...(formData.docsGeraisOutro || []).map(d => ({ ...d, grupo: 'Gerais_Outro' })),
        ...(formData.docsIdentificacaoOutro || []).map(d => ({ ...d, grupo: 'Identificação_Outro' })),
        ...(formData.docsEspolioOutro || []).map(d => ({ ...d, grupo: 'Espólio_Outro' })),
        ...(formData.docsArtOutro || []).map(d => ({ ...d, grupo: 'ART_Outro' })),
        ...(formData.docsTecnicosOutro || []).map(d => ({ ...d, grupo: 'Técnicos_Outro' }))
      ];

      const docsToInsert = allDocs
        .filter(d => d.checked || (d.label && d.grupo.includes('_Outro')))
        .map(d => ({
          parecer_id: actualParecerId,
          grupo: d.grupo,
          label: d.label,
          checked: d.checked,
          page_number: d.pageNumber,
          extra_input: d.extraInput
        }));

      if (docsToInsert.length > 0) {
        const { error: docsError } = await supabase.from('parecer_documentos').insert(docsToInsert);
        if (docsError) await handleSupabaseError(docsError, OperationType.CREATE, 'parecer_documentos');
      }

      // 4. Barramentos e Estruturas
      const { error: deleteBarError } = await supabase.from('parecer_barramentos').delete().eq('parecer_id', actualParecerId);
      if (deleteBarError) await handleSupabaseError(deleteBarError, OperationType.DELETE, 'parecer_barramentos');
      
      const barramentos = [
        { data: formData.barragemPrincipal, is_principal: true, ordem: 0 },
        ...(formData.barragensMontante || []).map((b, i) => ({ data: b, is_principal: false, ordem: i + 1 }))
      ];

      for (const b of barramentos) {
        const { data: savedBar, error: barError } = await supabase
          .from('parecer_barramentos')
          .insert({
            parecer_id: actualParecerId,
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
            adequacao_seguranca: b.data.adequacaoSeguranca
          })
          .select()
          .single();

        if (barError) await handleSupabaseError(barError, OperationType.CREATE, 'parecer_barramentos');

        const structs = b.data.estruturas || [];
        if (structs.length > 0) {
          const { error: estError } = await supabase.from('parecer_estruturas').insert(
            structs.map(e => ({
              barramento_id: savedBar.id,
              descricao: e.descricao,
              vazao: e.vazao,
              cota_soleira: e.cotaSoleira,
              localizacao: e.localizacao,
              seguranca: e.seguranca
            }))
          );
          if (estError) await handleSupabaseError(estError, OperationType.CREATE, 'parecer_estruturas');
        }
      }

      toast.success(`Sucesso: Parecer salvo como ${status}!`);
      await logActivity(parecerId ? 'EDIT_OPINION' : 'CREATE_OPINION', { 
        protocolo: formData.protocolo, 
        interessado: formData.razaoSocial,
        status: status 
      });
      setFormData(prev => ({ ...prev, status }));
      onBack();
    } catch (error: any) {
      console.error("Erro ao salvar no Supabase:", error);
      toast.error(`Erro ao salvar: ${error.message || "Erro desconhecido"}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearForm = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Limpar Formulário',
      message: 'Tem certeza que deseja limpar todo o formulário? Esta ação não pode ser desfeita.',
      variant: 'danger',
      onConfirm: () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setFormData({ ...INITIAL_DATA });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        toast.info('Formulário limpo.');
      }
    });
  };

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      // Need to account for sticky header height (approx 80px) plus potential mobile header
      const yOffset = -200; 
      const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({top: y, behavior: 'smooth'});
      setActiveSection(id);
    }
  };

  const getIntroPreview = () => {
    const classif = formData.tipoClassificacao === 'OUTRO' ? formData.tipoClassificacaoOutro : formData.tipoClassificacao;
    const barragem = formData.tipoBarragem === 'OUTRO' ? formData.tipoBarragemOutro : formData.tipoBarragem;
    const situacao = formData.situacaoEmpreendimento === 'OUTRO' ? formData.situacaoEmpreendimentoOutro : formData.situacaoEmpreendimento;

    return `De acordo com a Política Nacional de Segurança de Barragens... Este Parecer apresenta os resultados da análise do pedido de ${classif || '...'} quanto à Segurança ${barragem || '...'} de acumulação de água... observa-se que o empreendimento se encontra ${situacao || '...'}. Este documento encontra embasamento na análise dos documentos disponibilizados nos autos, contendo em referência à análise documental:`;
  };

  const NavItem = ({ id, label, icon: Icon }: any) => (
    <button
      data-section={id}
      onClick={() => scrollToSection(id)}
      className={`flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-1.5 md:py-2 text-xs md:text-sm font-medium rounded-full transition-all whitespace-nowrap border shadow-sm ${
        activeSection === id 
        ? 'bg-emerald-600 text-white border-emerald-600 ring-2 ring-emerald-200' 
        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-emerald-300'
      }`}
    >
      <Icon size={14} className="md:size-[16px]" />
      {label}
    </button>
  );

  const PreviewSection = () => {
    const classif = formData.tipoClassificacao === 'OUTRO' ? formData.tipoClassificacaoOutro : formData.tipoClassificacao;
    const barragem = formData.tipoBarragem === 'OUTRO' ? formData.tipoBarragemOutro : formData.tipoBarragem;
    const situacao = formData.situacaoEmpreendimento === 'OUTRO' ? formData.situacaoEmpreendimentoOutro : formData.situacaoEmpreendimento;
    const rtText = (formData.responsaveisTecnicos || []).map(rt => `${rt.nome} (ART ${rt.art})`).join('; ');
    const volDesc = cleanScore(formData.classificacao.dpa1Select);

    const introText = formData.introducao || `De acordo com a Política Nacional de Segurança de Barragens, Lei nº 12.334, de 20 de setembro de 2010, em seu artigo 5º inciso I, a fiscalização da segurança de barragens compete à entidade que outorga o direito de uso dos recursos hídricos, observado o domínio do corpo hídrico, quando o objeto for de acumulação de água, exceto para fins de aproveitamento hidrelétrico. 
A fiscalização deve se basear em análise documental, em vistorias técnicas, em indicadores de segurança de barragem e em outros procedimentos definidos pelo órgão fiscalizador. 
No estado de Mato Grosso, os critérios técnicos a serem aplicados e os procedimentos administrativos estão estabelecidos na Resolução CNRH nº 241, de 10 de setembro de 2024 e na Instrução Normativa nº 08, de 18 de dezembro de 2023.  
Este Parecer apresenta os resultados da análise do pedido de ${classif || '...'} quanto à Segurança de Barragem de ${barragem || '...'} de acumulação de água para usos múltiplos, exceto para geração de energia elétrica, com ou sem captação de água. Conforme a solicitação, observa-se que o empreendimento se encontra-se em fase de ${situacao || '...'}. 
Este documento encontra embasamento na análise dos documentos disponibilizados nos autos, contendo em referência à análise documental:`;

    const volNomenclatureMap: Record<string, string> = {
      "MUITO BAIXO – inferior a 3hm³ (1)": "muito pequeno.",
      "BAIXO – de 3 a 10 hm³ (2)": "pequeno.",
      "MEDIO – de 10 a 75 hm³ (3)": "médio.",
      "ALTO – de 75 a 200 hm³ (4)": "grande.",
      "MUITO ALTO – superior a 200hm³ (5)": "muito grande."
    };
    const volNomenclature = volNomenclatureMap[formData.classificacao.dpa1Select] || cleanScore(formData.classificacao.dpa1Select);

    const volumeText = `De acordo com o Art. 6º da Resolução CNRH Nº 241/2024, as barragens são classificadas quanto ao volume total do reservatório. Conforme informações apresentadas pelo empreendedor, a Barragem é classificada, quanto ao Volume, como ‘${volNomenclature}’`;

    const dpaText = `Conforme Art. 4º da Resolução CNRH Nº 241, de 10 de setembro de 2024, a classificação por Categoria de Dano Potencial Associado (DPA) da barragem tem por objetivo classificar as barragens em função do potencial de danos humanos, sociais, econômicos e ambientais decorrentes de eventual ruptura, vazamento, infiltração no solo ou mau funcionamento da barragem, devendo ser considerado o cenário de pior caso. ${formData.classificacao.rupturaTexto}`;
    const criText = `Segundo o Art. 7º da Resolução CNRH Nº 241/2024, a Categoria de Risco (CRI) refere-se aos aspectos da própria barragem que possam influenciar na probabilidade de ocorrência de acidente, sendo classificada em função das características técnicas, do estado de conservação do empreendimento e do plano de segurança da barragem. Abaixo se encontra a classificação do barramento quanto à categoria de risco embasada na Resolução:`;

    // Helper for Documents
    const renderAllDocs = () => {
      const sections = [
        { title: "Documentos Gerais", docs: formData.docsGerais, outros: formData.docsGeraisOutro },
        { title: "Documentos de Identificação", docs: formData.docsIdentificacao, outros: formData.docsIdentificacaoOutro },
        { title: "Documentos de Espólio", docs: formData.docsEspolio, outros: formData.docsEspolioOutro },
        { title: "Documentos de ART", docs: formData.docsArt, outros: formData.docsArtOutro },
        { title: "Documentos Técnicos", docs: formData.docsTecnicos, outros: formData.docsTecnicosOutro },
      ];

      return (
        <div className="mb-6 space-y-4">
          {sections.map((sec, idx) => {
            const checked = (sec.docs || []).filter(d => d.checked);
            const checkedOutros = (sec.outros || []).filter(d => d.checked);
            if (checked.length === 0 && checkedOutros.length === 0) return null;

            return (
              <div key={idx}>
                <p className="font-bold text-xs underline mb-1">{sec.title}:</p>
                <ul className="list-disc ml-6 text-xs space-y-1">
                  {checked.map(d => (
                    <li key={d.id}>
                      {d.label} {d.extraInput ? `- ${d.extraInput}` : ''} {d.pageNumber ? `(Fls. ${d.pageNumber})` : ''}
                    </li>
                  ))}
                  {checkedOutros.map(d => (
                    <li key={d.id}>
                      {d.extraInput || d.label} {d.pageNumber ? `(Fls. ${d.pageNumber})` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      );
    };

    // Helper for Barramento Table
    const renderBarramentoTable = (b: any, title: string) => (
      <div className="mb-6">
        <p className="text-center text-xs font-bold mb-1">{title}</p>
        <table className="w-full border-collapse border border-black text-xs">
          <tbody>
            <tr><TableRowPreview value="Nome da barragem" bold /><TableRowPreview value={b.nome || ""} /></tr>
            <tr><TableRowPreview value="SNISB" bold /><TableRowPreview value={b.snisb || ""} /></tr>
            <tr><TableRowPreview value="Coordenadas" bold /><TableRowPreview value={`Lat: ${b.lat || ""} Long: ${b.long || ""}`} /></tr>
            <tr><TableRowPreview value="Altura Máxima (m)" bold /><TableRowPreview value={(b.alturaMaxima || "") + (b.alturaMaximaFls ? ` (${formatFls(b.alturaMaximaFls)})` : "")} /></tr>
            <tr><TableRowPreview value="Borda Livre (m)" bold /><TableRowPreview value={(b.bordaLivre || "") + (b.bordaLivreFls ? ` (${formatFls(b.bordaLivreFls)})` : "")} /></tr>
            <tr><TableRowPreview value="Cota do Coroamento (m)" bold /><TableRowPreview value={(b.cotaCoroamento || "") + (b.cotaCoroamentoFls ? ` (${formatFls(b.cotaCoroamentoFls)})` : "")} /></tr>
            <tr><TableRowPreview value="Comprimento do Coroamento (m)" bold /><TableRowPreview value={(b.comprimentoCoroamento || "") + (b.comprimentoCoroamentoFls ? ` (${formatFls(b.comprimentoCoroamentoFls)})` : "")} /></tr>
            <tr><TableRowPreview value="Largura do Coroamento (m)" bold /><TableRowPreview value={(b.larguraCoroamento || "") + (b.larguraCoroamentoFls ? ` (${formatFls(b.larguraCoroamentoFls)})` : "")} /></tr>
            <tr><TableRowPreview value="Tipo Estrutural" bold /><TableRowPreview value={cleanScore(b.tipoEstrutural)} /></tr>
            <tr><TableRowPreview value="Tipo de Fundação" bold /><TableRowPreview value={cleanScore(b.tipoFundacao)} /></tr>
            <tr><TableRowPreview value="Idade (anos)" bold /><TableRowPreview value={b.idade || ""} /></tr>
            <tr><TableRowPreview value="Reservatório (Cota NNO) (m)" bold /><TableRowPreview value={b.cotaNNO || ""} /></tr>
            <tr><TableRowPreview value="Reservatório (Cota NMM) (m)" bold /><TableRowPreview value={b.cotaNMM || ""} /></tr>
            <tr><TableRowPreview value="Reservatório (Área NNO) (m²)/(ha)" bold /><TableRowPreview value={b.areaNNO || ""} /></tr>
            <tr><TableRowPreview value="Reservatório (Área NMM) (m²)/(ha)" bold /><TableRowPreview value={b.areaNMM || ""} /></tr>
            <tr><TableRowPreview value="Reservatório (Vol. NMO) (hm³)" bold /><TableRowPreview value={b.volumeNMO || ""} /></tr>
            <tr><TableRowPreview value="Reservatório (Vol. NMM) (hm³)" bold /><TableRowPreview value={b.volumeNMM || ""} /></tr>
            <tr><TableRowPreview value="Vazão Máxima de Projeto (m³/s) /TR" bold /><TableRowPreview value={b.vazaoMaxima || ""} /></tr>
          </tbody>
        </table>
        {b.estruturas.length > 0 && (
          <div className="mt-2">
            <p className="font-bold text-xs mb-1">Estruturas Hidráulicas:</p>
            <table className="w-full border-collapse border border-black text-xs">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border border-black p-1">Descrição</th>
                  <th className="border border-black p-1">Vazão (m³/s)</th>
                  <th className="border border-black p-1">Cota Soleira (m)</th>
                  <th className="border border-black p-1">Localização</th>
                  <th className="border border-black p-1">Segurança</th>
                </tr>
              </thead>
              <tbody>
                {b.estruturas.map((s: any, idx: number) => (
                  <tr key={idx}>
                    <td className="border border-black p-1">{s.descricao}</td>
                    <td className="border border-black p-1 text-center">{s.vazao}</td>
                    <td className="border border-black p-1 text-center">{s.cotaSoleira}</td>
                    <td className="border border-black p-1 text-center">{s.localizacao}</td>
                    <td className="border border-black p-1 text-center">{s.seguranca}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );

    // Helper for Adequação Table
    const renderAdequacaoTable = (b: any, title?: string) => {
      if (!b || !b.possuiAdequacao) return null;
      return (
        <div className="mt-4">
          <p className="text-center text-xs font-bold mb-1">
            {title || (formData.barragensMontante.length > 0 ? "Tabela 3. Adequações propostas para o barramento principal" : "Tabela 3. Adequações propostas para o barramento")}
          </p>
          <table className="w-full border-collapse border border-black text-xs">
            <tbody>
              <tr><TableRowPreview value="Vazão (Adequação) (m³/s)" bold /><TableRowPreview value={b.adequacaoVazao || '-'} /></tr>
              <tr><TableRowPreview value="Cota Soleira (Adequação) (m)" bold /><TableRowPreview value={b.adequacaoCota || '-'} /></tr>
              <tr><TableRowPreview value="Localização (Adequação)" bold /><TableRowPreview value={b.adequacaoLocalizacao || '-'} /></tr>
              <tr><TableRowPreview value="Vazão Mínima Remanescente" bold /><TableRowPreview value={b.adequacaoVazaoRemanescente || '-'} /></tr>
              <tr><TableRowPreview value="Segurança (Adequação)" bold /><TableRowPreview value={b.adequacaoSeguranca || '-'} /></tr>
            </tbody>
          </table>
        </div>
      );
    };

    // CRI Tables Data
    const ctTable = [
      { label: "CT1 - Altura", desc: formData.barragemPrincipal.alturaMaxima + " m", score: formData.classificacao.scoreCt1 },
      { label: "CT2 - Comprimento", desc: formData.barragemPrincipal.comprimentoCoroamento + " m", score: formData.classificacao.scoreCt2 },
      { label: "CT3 - Tipo Estrutural", desc: cleanScore(formData.barragemPrincipal.tipoEstrutural), score: formData.classificacao.scoreCt3 },
      { label: "CT4 - Tipo de Fundação", desc: cleanScore(formData.barragemPrincipal.tipoFundacao), score: formData.classificacao.scoreCt4 },
      { label: "CT5 - Idade da Barragem (CRI)", desc: formData.barragemPrincipal.idade + " anos", score: formData.classificacao.scoreCt5 },
      { label: "CT6 - Vazão de Projeto", desc: cleanScore(formData.classificacao.ct6Select), score: formData.classificacao.scoreCt6 },
    ];

    const ecTable = [
      { label: "EC1 - Confiabilidade das Estruturas Extravasoras", desc: cleanScore(formData.classificacao.ec1Select), score: formData.classificacao.scoreEc1 },
      { label: "EC2 - Confiabilidade das Estruturas de Adução", desc: cleanScore(formData.classificacao.ec2Select), score: formData.classificacao.scoreEc2 },
      { label: "EC3 - Percolação", desc: cleanScore(formData.classificacao.ec3Select), score: formData.classificacao.scoreEc3 },
      { label: "EC4 - Deformações e Recalques", desc: cleanScore(formData.classificacao.ec4Select), score: formData.classificacao.scoreEc4 },
      { label: "EC5 - Deterioração dos Taludes / Proteções", desc: cleanScore(formData.classificacao.ec5Select), score: formData.classificacao.scoreEc5 },
    ];

    const psTable = [
      { label: "PS1 - Documentação de Projeto", desc: cleanScore(formData.classificacao.ps1Select), score: formData.classificacao.scorePs1 },
      { label: "PS2 - Estrutura Organizacional e Qualificação Técnica", desc: cleanScore(formData.classificacao.ps2Select), score: formData.classificacao.scorePs2 },
      { label: "PS3 - Procedimentos de Inspeção e Monitoramento", desc: cleanScore(formData.classificacao.ps3Select), score: formData.classificacao.scorePs3 },
      { label: "PS4 - Relatórios de Inspeção e Revisão Periódica", desc: cleanScore(formData.classificacao.ps4Select), score: formData.classificacao.scorePs4 },
      { label: "PS5 - Plano de Ação de Emergência (PAE)", desc: cleanScore(formData.classificacao.ps5Select), score: formData.classificacao.scorePs5 },
      { label: "PS6 - Regra Operacional dos Dispositivos de Descarga", desc: cleanScore(formData.classificacao.ps6Select), score: formData.classificacao.scorePs6 },
    ];

    // CONDICIONANTES LOGIC (QUADRO 6)
    const getQuadro6Rows = (resumoClass: string) => {
      const isA = (resumoClass || "").includes("CLASSE A");
      const isB = (resumoClass || "").includes("CLASSE B");
      const isC = (resumoClass || "").includes("CLASSE C");
      const isD = (resumoClass || "").includes("CLASSE D");

      if (isA || isB) {
        const className = isA ? "Classe A" : "Classe B";
        const rpsbFreq = isA ? "a cada 5 anos" : "a cada 7 anos";
        return [
          { col1: className, col2: "", isHeader: true },
          { col1: "Peças técnicas obrigatórias: PSB completo (6 volumes, incluindo RPSB e PAE), PAE, Relatórios ISR e ISE, RPSB.", col2: "" },
          { col1: "Periodicidade:", col2: "" },
          { col1: "• ISR", col2: "anual (até 31/dez)" },
          { col1: "• ISE", col2: "quando NPGB Alerta/Emergência, antes primeiro enchimento, com RPSB, deplecionamento rápido, eventos extremos, descomissionamento/sabotagem ou exigência SEMA." },
          { col1: "• RPSB", col2: `${rpsbFreq} (Resumo Executivo no SNISB).` },
          { col1: "• PAE", col2: "atualização anual; revisão quando necessário (mudanças, recomendações etc.)." },
          { col1: "• PSB", col2: "atualização contínua com resultados de inspeções." }
        ];
      } else if (isC) {
        return [
          { col1: "Classe C", col2: "", isHeader: true },
          { col1: "Peças técnicas obrigatórias: PSB (6 volumes, sem PAE obrigatório), Relatórios ISR e ISE, RPSB.", col2: "" },
          { col1: "Periodicidade:", col2: "" },
          { col1: "• ISR", col2: "anual (até 31/dez)" },
          { col1: "• ISE", col2: "quando NPGB Alerta/Emergência, antes primeiro enchimento, com RPSB, deplecionamento rápido, eventos extremos, descomissionamento/sabotagem ou exigência SEMA." },
          { col1: "• RPSB", col2: "a cada 10 anos (Resumo Executivo no SNISB)." },
          { col1: "• PSB", col2: "atualização contínua com resultados de inspeções." }
        ];
      } else if (isD) {
        return [
          { col1: "Classe D", col2: "", isHeader: true },
          { col1: "Peças técnicas obrigatórias: PSB (6 volumes, sem PAE obrigatório), Relatórios ISR e, quando exigido pela SEMA, ISE, RPSB.", col2: "" },
          { col1: "Periodicidade:", col2: "" },
          { col1: "• ISR", col2: "anual (até 31/dez)" },
          { col1: "• ISE", col2: "quando NPGB Alerta/Emergência, antes do primeiro enchimento, com RPSB, deplecionamento rápido, eventos extremos, descomissionamento/sabotagem ou por exigência da SEMA." },
          { col1: "• RPSB", col2: "a cada 15 anos (Resumo Executivo no SNISB)." },
          { col1: "• PSB", col2: "atualização contínua com resultados de inspeções." }
        ];
      }
      return [];
    };

    const quadro6Rows = getQuadro6Rows((formData.classificacao.resumo || "").toUpperCase());

    return (
       <div className="bg-gray-200 p-2 sm:p-4 md:p-8 rounded-lg overflow-x-auto border border-gray-300 w-full flex justify-center">
        <div className="bg-white shadow-2xl p-[0.5cm] sm:p-[1cm] md:p-[2cm] w-full max-w-[210mm] min-h-[297mm] text-black font-[Times_New_Roman] text-justify leading-relaxed text-[9px] sm:text-xs md:text-sm">
           {/* HEADER */}
           <div className="text-center font-bold mb-6 text-[12pt]">
              <p>GOVERNO DO ESTADO DE MATO GROSSO</p>
              <p>SECRETARIA DE ESTADO DE MEIO AMBIENTE - SEMA</p>
           </div>
           
           <h1 className="text-center font-bold mb-8 text-[14pt]">
             PARECER TÉCNICO - CBS/SURH/SEMA-MT
           </h1>

           <div className="mb-6">
             <p><strong>Processo nº:</strong> {formData.protocolo}</p>
             <p className="mt-2 text-justify font-bold uppercase">
               {classif} quanto à Segurança de {classif === 'CLASSIFICAÇÃO DE RESERVATÓRIO PULMÃO' ? 'Barragem' : `Barragem de ${barragem || '...'}`} - {formData.barragemPrincipal.nome} (Código SNISB nº {formData.barragemPrincipal.snisb || '____'})
             </p>
           </div>

           {/* 1. INTRODUÇÃO */}
           <h2 className="font-bold mb-2 uppercase">1. INTRODUÇÃO</h2>
           <p className="mb-4">{introText}</p>
           {renderAllDocs()}

           {/* 2. INFORMAÇÕES DO PEDIDO */}
           <h2 className="font-bold mb-2 uppercase">2. INFORMAÇÕES DO PEDIDO</h2>
           <p className="text-center text-xs font-bold mb-1">Tabela 1. Informações do empreendedor e empreendimento</p>
           <table className="w-full border-collapse border border-black text-xs mb-4">
             <tbody>
               <tr><TableRowPreview value="Identificação do empreendedor" bold /><TableRowPreview value={formData.razaoSocial} /></tr>
               <tr>
                 <TableRowPreview value={(formData.cpfCnpj || '').replace(/\D/g, '').length > 11 ? "CNPJ" : "CPF"} bold />
                 <TableRowPreview value={formData.cpfCnpj || '-'} />
               </tr>
               <tr><TableRowPreview value="Localização / Endereço" bold /><TableRowPreview value={formData.localizacao} /></tr>
               <tr><TableRowPreview value="Nº CAR" bold /><TableRowPreview value={formData.numCAR} /></tr>
               <tr><TableRowPreview value="Município/UF" bold /><TableRowPreview value={formData.municipio ? `${formData.municipio}/MT` : '-'} /></tr>
               <tr><TableRowPreview value="Finalidade" bold /><TableRowPreview value={formData.finalidade === 'OUTRO' ? formData.finalidadeOutro : formData.finalidade} /></tr>
               <tr><TableRowPreview value="Situação" bold /><TableRowPreview value={formData.situacaoEmpreendimento === 'OUTRO' ? formData.situacaoEmpreendimentoOutro : formData.situacaoEmpreendimento} /></tr>
               <tr><TableRowPreview value="Curso d'água" bold /><TableRowPreview value={formData.cursoAgua} /></tr>
               <tr><TableRowPreview value="Propriedades Limites" bold /><TableRowPreview value={formData.propriedadesLimites} /></tr>
               <tr><TableRowPreview value="Sub-bacia/Bacia" bold /><TableRowPreview value={formData.subBacia} /></tr>
               <tr><TableRowPreview value="UPG" bold /><TableRowPreview value={formData.upg} /></tr>
               <tr><TableRowPreview value="Área da bacia (km²)" bold /><TableRowPreview value={formData.areaBacia} /></tr>
               <tr><TableRowPreview value="Índice pluviosidade" bold /><TableRowPreview value={formData.indicePluviosidade} /></tr>
               <tr><TableRowPreview value="Resp. Técnico" bold /><TableRowPreview value={rtText} /></tr>
             </tbody>
           </table>
           <p className="text-[10pt] italic mb-6">{formData.legendaTabela1}</p>

           {/* 3. BARRAMENTO */}
           <h2 className="font-bold mb-2 uppercase">3. INFORMAÇÕES DO BARRAMENTO</h2>
           {renderBarramentoTable(formData.barragemPrincipal, "Tabela 2. Informações gerais do barramento principal")}

           {formData.barragensMontante.length > 0 && (
             <div className="mt-6">
               <h3 className="font-bold mb-2 uppercase">3.1 BARRAGENS A MONTANTE</h3>
               {formData.barragensMontante.map((b, idx) => (
                 <div key={idx}>
                   {renderBarramentoTable(b, `Tabela 2.${idx + 1}. Informações da ${b.nome}`)}
                 </div>
               ))}
             </div>
           )}

            {/* ADEQUAÇÕES */}
            {renderAdequacaoTable(
              formData.barragemPrincipal,
              formData.barragensMontante.length > 0 ? "Tabela 3. Adequações propostas para o barramento principal" : "Tabela 3. Adequações propostas para o barramento"
            )}
            {formData.barragensMontante.map((b, idx) => (
              <React.Fragment key={b.id || idx}>
                {renderAdequacaoTable(b, `Tabela 3.${idx + 1}. Adequações propostas para a ${b.nome || `Barragem a montante ${idx + 1}`}`)}
              </React.Fragment>
            ))}

            {/* 4. CLASSIFICAÇÃO */}
            <h2 className="font-bold mb-2 uppercase mt-8">4. CLASSIFICAÇÃO</h2>
           
           <h3 className="font-bold mb-1">4.1 Quanto ao Volume</h3>
           <p className="mb-4 text-justify">{volumeText}</p>

           <h3 className="font-bold mb-1">4.2 Quanto ao Dano Potencial Associado (DPA)</h3>
           <p className="mb-4 text-justify">{dpaText}</p>
           
           <p className="text-center text-xs font-bold mb-1">Quadro 1. Memória de cálculo quanto ao DPA*.</p>
           <table className="w-full border-collapse border border-black text-xs mb-2">
              <thead className="bg-gray-100">
                 <tr><th className="border border-black p-1">Critério</th><th className="border border-black p-1">Descrição</th><th className="border border-black p-1">Pontos</th></tr>
              </thead>
              <tbody>
                 <tr><TableRowPreview value="Potencial Impacto devido ao volume" /><TableRowPreview value={volDesc} /><TableRowPreview value={formData.classificacao.scoreDpa1} align="center"/></tr>
                 <tr><TableRowPreview value="Potencial de perda de vidas humanas" /><TableRowPreview value={cleanScore(formData.classificacao.dpa2Select)} /><TableRowPreview value={formData.classificacao.scoreDpa2} align="center"/></tr>
                 <tr><TableRowPreview value="Potencial de Impacto Ambiental" /><TableRowPreview value={cleanScore(formData.classificacao.dpa3Select)} /><TableRowPreview value={formData.classificacao.scoreDpa3} align="center"/></tr>
                 <tr><TableRowPreview value="Potencial de Impacto Socioeconômico" /><TableRowPreview value={cleanScore(formData.classificacao.dpa4Select)} /><TableRowPreview value={formData.classificacao.scoreDpa4} align="center"/></tr>
                 <tr><TableRowPreview value="TOTAL" bold /><TableRowPreview value="" /><TableRowPreview value={formData.classificacao.totalDpa} bold align="center"/></tr>
                 <tr><TableRowPreview value="CLASSIFICAÇÃO" bold /><TableRowPreview value="" /><TableRowPreview value={formData.classificacao.dpaClass} bold align="center"/></tr>
              </tbody>
           </table>
           <p className="text-[9pt] italic mb-6">{formData.classificacao.legendaDPA}</p>

           <h3 className="font-bold mb-1 mt-4">4.3 Quanto à Categoria de Risco (CRI)</h3>
           <p className="mb-4 text-justify">{criText}</p>

           <p className="text-center text-xs font-bold mb-1 mt-4">Quadro 2. Características Técnicas (CT)</p>
           <table className="w-full border-collapse border border-black text-xs mb-2">
              <thead className="bg-gray-100">
                 <tr><th className="border border-black p-1">Critério</th><th className="border border-black p-1">Descrição</th><th className="border border-black p-1">Pontos</th></tr>
              </thead>
              <tbody>
                 {ctTable.map((row, idx) => (
                   <tr key={idx}><TableRowPreview value={row.label} /><TableRowPreview value={row.desc} /><TableRowPreview value={row.score} align="center"/></tr>
                 ))}
                 <tr><TableRowPreview value="TOTAL CT" bold /><TableRowPreview value="" /><TableRowPreview value={formData.classificacao.totalCT} bold align="center"/></tr>
              </tbody>
           </table>

           <p className="text-center text-xs font-bold mb-1 mt-4">Quadro 3. Estado de Conservação (EC)</p>
           <table className="w-full border-collapse border border-black text-xs mb-2">
              <thead className="bg-gray-100">
                 <tr><th className="border border-black p-1">Critério</th><th className="border border-black p-1">Descrição</th><th className="border border-black p-1">Pontos</th></tr>
              </thead>
              <tbody>
                 {ecTable.map((row, idx) => (
                   <tr key={idx}><TableRowPreview value={row.label} /><TableRowPreview value={row.desc} /><TableRowPreview value={row.score} align="center"/></tr>
                 ))}
                 <tr><TableRowPreview value="TOTAL EC" bold /><TableRowPreview value="" /><TableRowPreview value={formData.classificacao.totalEC} bold align="center"/></tr>
              </tbody>
           </table>

           <p className="text-center text-xs font-bold mb-1 mt-4">Quadro 4. Plano de Segurança (PS)</p>
           <table className="w-full border-collapse border border-black text-xs mb-2">
              <thead className="bg-gray-100">
                 <tr><th className="border border-black p-1">Critério</th><th className="border border-black p-1">Descrição</th><th className="border border-black p-1">Pontos</th></tr>
               </thead>
               <tbody>
                  {psTable.map((row, idx) => (
                    <tr key={idx}><TableRowPreview value={row.label} /><TableRowPreview value={row.desc} /><TableRowPreview value={row.score} align="center"/></tr>
                  ))}
                  <tr><TableRowPreview value="TOTAL PS" bold /><TableRowPreview value="" /><TableRowPreview value={formData.classificacao.totalPS} bold align="center"/></tr>
               </tbody>
            </table>

           {!formData.classificacao.criPreClassificacao && (
             <>
               <p className="text-center text-xs font-bold mb-1 mt-4">Quadro 5.1. Resumo do cálculo dos indicadores da CRI</p>
               <table className="w-full border-collapse border border-black text-xs mb-2">
                  <tbody>
                     <tr className="bg-gray-100">
                       <td colSpan={2} className="border border-black px-2 py-1 font-bold text-left">FAIXAS DE CLASSIFICAÇÃO POR CATEGORIA DE RISCO (ÁGUA)</td>
                     </tr>
                     <tr className="bg-gray-50">
                       <td className="border border-black px-2 py-1 font-bold text-left">Critério de Avaliação</td>
                       <td className="border border-black px-2 py-1 font-bold text-left">Classe de Categoria de Risco</td>
                     </tr>
                     <tr className={formData.classificacao.risco === RiscoEnum.ALTO ? 'bg-amber-100' : ''}>
                       <td className="border border-black px-2 py-1">Se algum indicador de risco resultar em ALTO</td>
                       <td className="border border-black px-2 py-1">ALTA</td>
                     </tr>
                     <tr className={formData.classificacao.risco === RiscoEnum.MEDIO ? 'bg-amber-100' : ''}>
                       <td className="border border-black px-2 py-1">Se NENHUM indicador de risco resultar em ALTO, e algum resultar em MÉDIO</td>
                       <td className="border border-black px-2 py-1">MÉDIA</td>
                     </tr>
                     <tr className={formData.classificacao.risco === RiscoEnum.BAIXO ? 'bg-amber-100' : ''}>
                       <td className="border border-black px-2 py-1">Se todos os indicadores de risco resultarem em BAIXO</td>
                       <td className="border border-black px-2 py-1">BAIXA</td>
                     </tr>
                     <tr className="bg-gray-100">
                       <td colSpan={2} className="border border-black px-2 py-1 font-bold text-center">{formData.classificacao.risco.toUpperCase()}</td>
                     </tr>
                  </tbody>
               </table>
               <p className="text-[10px] italic mb-4">*Os indicadores de riscos são calculados a partir do quadro 5.2</p>

               <p className="text-center text-xs font-bold mb-1 mt-4">Quadro 5.2. INDICADOR DE RISCO GERAL</p>
               <table className="w-full border-collapse border border-black text-xs mb-2">
                  <tbody>
                     <tr className="bg-gray-100">
                       <td colSpan={2} className="border border-black px-2 py-1 font-bold text-left">INDICADOR DE RISCO GERAL</td>
                     </tr>
                     <tr className="bg-gray-50">
                       <td className="border border-black px-2 py-1 font-bold text-left">Fórmula de cálculo</td>
                       <td className="border border-black px-2 py-1 font-bold text-left">Classe do indicador</td>
                     </tr>
                     <tr className={formData.classificacao.riskGeral === RiscoEnum.ALTO ? 'bg-amber-100' : ''}>
                       <td className="border border-black px-2 py-1">CT + EC + PSB &gt;= 65</td>
                       <td className="border border-black px-2 py-1">ALTO</td>
                     </tr>
                     <tr className={formData.classificacao.riskGeral === RiscoEnum.MEDIO ? 'bg-amber-100' : ''}>
                       <td className="border border-black px-2 py-1">35 &lt; CT + EC + PSB &lt; 65</td>
                       <td className="border border-black px-2 py-1">MÉDIO</td>
                     </tr>
                     <tr className={formData.classificacao.riskGeral === RiscoEnum.BAIXO ? 'bg-amber-100' : ''}>
                       <td className="border border-black px-2 py-1">CT + EC + PSB &lt;= 35</td>
                       <td className="border border-black px-2 py-1">BAIXO</td>
                     </tr>
                     <tr className="bg-gray-100">
                       <td colSpan={2} className="border border-black px-2 py-1 font-bold text-center">{formData.classificacao.riskGeral.toUpperCase()}</td>
                     </tr>
                  </tbody>
               </table>

               <p className="text-center text-xs font-bold mb-1 mt-4">Quadro 5.3. INDICADOR DE RISCO POR PERCOLAÇÃO / CONSERVAÇÃO</p>
               <table className="w-full border-collapse border border-black text-xs mb-2">
                  <tbody>
                     <tr className="bg-gray-100">
                       <td colSpan={2} className="border border-black px-2 py-1 font-bold text-left">INDICADOR DE RISCO POR PERCOLAÇÃO / CONSERVAÇÃO</td>
                     </tr>
                     <tr className="bg-gray-50">
                       <td className="border border-black px-2 py-1 font-bold text-left">Fórmula de cálculo</td>
                       <td className="border border-black px-2 py-1 font-bold text-left">Classe do indicador</td>
                     </tr>
                     <tr className={formData.classificacao.riskPercolacao === RiscoEnum.ALTO ? 'bg-amber-100' : ''}>
                       <td className="border border-black px-2 py-1">EC3 = 5 ou EC4 = 5 ou EC5 = 5 ou (EC3+ EC4 + EC5) &gt; 10</td>
                       <td className="border border-black px-2 py-1">ALTO</td>
                     </tr>
                     <tr className={formData.classificacao.riskPercolacao === RiscoEnum.MEDIO ? 'bg-amber-100' : ''}>
                       <td className="border border-black px-2 py-1">7 &lt; (EC3 + EC4 + EC5) &lt;= 10</td>
                       <td className="border border-black px-2 py-1">MÉDIO</td>
                     </tr>
                     <tr className={formData.classificacao.riskPercolacao === RiscoEnum.BAIXO ? 'bg-amber-100' : ''}>
                       <td className="border border-black px-2 py-1">(EC3 + EC4 + EC5) &lt;= 7</td>
                       <td className="border border-black px-2 py-1">BAIXO</td>
                     </tr>
                     <tr className="bg-gray-100">
                       <td colSpan={2} className="border border-black px-2 py-1 font-bold text-center">{formData.classificacao.riskPercolacao.toUpperCase()}</td>
                     </tr>
                  </tbody>
               </table>

               <p className="text-center text-xs font-bold mb-1 mt-4">Quadro 5.4. INDICADOR DE RISCO POR GALGAMENTO</p>
               <table className="w-full border-collapse border border-black text-xs mb-2">
                  <tbody>
                     <tr className="bg-gray-100">
                       <td colSpan={2} className="border border-black px-2 py-1 font-bold text-left">INDICADOR DE RISCO POR GALGAMENTO</td>
                     </tr>
                     <tr className="bg-gray-50">
                       <td className="border border-black px-2 py-1 font-bold text-left">Fórmula de cálculo</td>
                       <td className="border border-black px-2 py-1 font-bold text-left">Classe do indicador</td>
                     </tr>
                     <tr className={formData.classificacao.riskGalgamento === RiscoEnum.ALTO ? 'bg-amber-100' : ''}>
                       <td className="border border-black px-2 py-1">(CT6 + EC1) &gt; 7 ou EC1 = 5</td>
                       <td className="border border-black px-2 py-1">ALTO</td>
                     </tr>
                     <tr className={formData.classificacao.riskGalgamento === RiscoEnum.MEDIO ? 'bg-amber-100' : ''}>
                       <td className="border border-black px-2 py-1">4 &lt; (CT6) + (EC1) &lt;= 7</td>
                       <td className="border border-black px-2 py-1">MÉDIO</td>
                     </tr>
                     <tr className={formData.classificacao.riskGalgamento === RiscoEnum.BAIXO ? 'bg-amber-100' : ''}>
                       <td className="border border-black px-2 py-1">(CT6) + (EC1) &lt;= 4</td>
                       <td className="border border-black px-2 py-1">BAIXO</td>
                     </tr>
                     <tr className="bg-gray-100">
                       <td colSpan={2} className="border border-black px-2 py-1 font-bold text-center">{formData.classificacao.riskGalgamento.toUpperCase()}</td>
                     </tr>
                  </tbody>
               </table>

               <p className="text-center text-xs font-bold mb-1 mt-4">Quadro 5.5. INDICADOR DE RISCO GERENCIAL</p>
               <table className="w-full border-collapse border border-black text-xs mb-2">
                  <tbody>
                     <tr className="bg-gray-100">
                       <td colSpan={2} className="border border-black px-2 py-1 font-bold text-left">INDICADOR DE RISCO GERENCIAL</td>
                     </tr>
                     <tr className="bg-gray-50">
                       <td className="border border-black px-2 py-1 font-bold text-left">Fórmula de cálculo</td>
                       <td className="border border-black px-2 py-1 font-bold text-left">Classe do indicador</td>
                     </tr>
                     <tr className={formData.classificacao.riskGerencial === RiscoEnum.ALTO ? 'bg-amber-100' : ''}>
                       <td className="border border-black px-2 py-1">PSB &gt;= 24</td>
                       <td className="border border-black px-2 py-1">ALTO</td>
                     </tr>
                     <tr className={formData.classificacao.riskGerencial === RiscoEnum.MEDIO ? 'bg-amber-100' : ''}>
                       <td className="border border-black px-2 py-1">13 &lt; PSB &lt; 24</td>
                       <td className="border border-black px-2 py-1">MÉDIO</td>
                     </tr>
                     <tr className={formData.classificacao.riskGerencial === RiscoEnum.BAIXO ? 'bg-amber-100' : ''}>
                       <td className="border border-black px-2 py-1">PSB &lt;= 13</td>
                       <td className="border border-black px-2 py-1">BAIXO</td>
                     </tr>
                     <tr className="bg-gray-100">
                       <td colSpan={2} className="border border-black px-2 py-1 font-bold text-center">{formData.classificacao.riskGerencial.toUpperCase()}</td>
                     </tr>
                  </tbody>
               </table>

               <p className="text-center text-xs font-bold mb-1">QUADRO 6. RESUMO DO QUADRO DE CLASSIFICAÇÃO</p>
               <table className="w-full border-collapse border border-black text-xs mb-4">
                  <tbody>
                     <tr className="bg-gray-100">
                        <td colSpan={2} className="border border-black px-2 py-1 font-bold text-center uppercase">RESUMO DO QUADRO DE CLASSIFICAÇÃO</td>
                     </tr>
                     <tr><TableRowPreview value="Tipo de Classificação:" bold /><TableRowPreview value={classif} /></tr>
                     <tr><TableRowPreview value="Nome do Curso D’água:" bold /><TableRowPreview value={formData.cursoAgua} /></tr>
                     <tr><TableRowPreview value="Sub-bacia/Bacia:" bold /><TableRowPreview value={formData.subBacia} /></tr>
                     <tr><TableRowPreview value="UPG:" bold /><TableRowPreview value={formData.upg} /></tr>
                     <tr><TableRowPreview value="Município/UF:" bold /><TableRowPreview value={formData.municipio ? `${formData.municipio}/MT` : ''} /></tr>
                     <tr><TableRowPreview value="Nome do Empreendedor:" bold /><TableRowPreview value={formData.razaoSocial} /></tr>
                     <tr><TableRowPreview value="Localização do empreendimento:" bold /><TableRowPreview value={formData.localizacao} /></tr>
                     <tr><TableRowPreview value="Número do Processo:" bold /><TableRowPreview value={formData.protocolo} /></tr>
                     <tr><TableRowPreview value="Número do SNISB:" bold /><TableRowPreview value={formData.barragemPrincipal.snisb} /></tr>
                     <tr><TableRowPreview value="DANO POTENCIAL ASSOCIADO:" bold /><TableRowPreview value={formData.classificacao.dpaClass.toUpperCase()} /></tr>
                     <tr><TableRowPreview value="CATEGORIA DE RISCO:" bold /><TableRowPreview value={formData.classificacao.risco.toUpperCase()} /></tr>
                     <tr><TableRowPreview value="Classificação quanto ao volume:" bold /><TableRowPreview value={volNomenclature} /></tr>
                     <tr><TableRowPreview value="Coordenadas:" bold /><TableRowPreview value={`${formData.barragemPrincipal.lat} - ${formData.barragemPrincipal.long}`} /></tr>
                     <tr><TableRowPreview value="Altura:" bold /><TableRowPreview value={formData.barragemPrincipal.alturaMaxima} /></tr>
                     <tr><TableRowPreview value="Tipo de Barragem:" bold /><TableRowPreview value={barragem} /></tr>
                     <tr><TableRowPreview value="Volume armazenado (NMM) (hm³):" bold /><TableRowPreview value={formData.barragemPrincipal.volumeNMM} /></tr>
                     <tr><TableRowPreview value="Situação do empreendimento:" bold /><TableRowPreview value={situacao} /></tr>
                  </tbody>
               </table>
             </>
           )}
           {/* 5. PARECER */}
           <h2 className="font-bold mb-2 uppercase mt-8">5. PARECER TÉCNICO CONCLUSIVO</h2>
           <p className="text-justify whitespace-pre-wrap">{formData.parecer_final}</p>

           {/* 5.1 CONDICIONANTES (PNSB ONLY) */}
           {isPNSB && quadro6Rows.length > 0 && (
             <div className="mt-6">
                <h3 className="font-bold mb-2 uppercase">5.1 CONDICIONANTES E CONSEQUÊNCIAS REGULATÓRIAS</h3>
                <p className="mb-4 text-justify">
                   As consequências regulatórias da {classif} são definidas pela legislação vigente, estão discriminadas no quadro abaixo:
                </p>
                <p className="text-center text-xs font-bold mb-1">Quadro 7. Consequências regulatórias.</p>
                <table className="w-full border-collapse border border-black text-xs mb-6">
                   <thead>
                      <tr className="bg-gray-100">
                         <th className="border border-black p-1 text-left w-1/2">Atividades a serem executadas pelo empreendedor:</th>
                         <th className="border border-black p-1 text-left w-1/2">Prazo / Periodicidade:</th>
                      </tr>
                   </thead>
                   <tbody>
                      {quadro6Rows.map((row, idx) => (
                         <tr key={idx}>
                            {row.col2 === "" ? (
                               <td colSpan={2} className={`border border-black p-1 ${idx === 0 ? 'font-bold bg-gray-100' : ''}`}>
                                  {row.col1}
                               </td>
                            ) : (
                               <>
                                  <td className="border border-black p-1">{row.col1}</td>
                                  <td className="border border-black p-1">{row.col2}</td>
                               </>
                            )}
                         </tr>
                      ))}
                   </tbody>
                </table>
             </div>
           )}

           <div className="mt-12 text-center">
              <p>________________________________________________</p>
              <p className="font-bold">{formData.analista !== 'OUTRO' ? formData.analista : formData.analistaOutro}</p>
              <p>Analista de Meio Ambiente - SEMA/MT</p>
              <p className="mt-2">Cuiabá/MT, {new Date().toLocaleDateString('pt-BR')}</p>
           </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto pb-20 w-full">
      {/* Top Header */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center border-b border-slate-200 pb-3 mb-4 sticky top-[80px] md:top-0 bg-slate-50/95 backdrop-blur-sm z-30 pt-2 md:pt-4 gap-3 md:gap-4">
        <div className="flex items-center gap-3 md:gap-4">
          <button onClick={onBack} className="p-1.5 md:p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
            <ArrowLeft size={20} className="md:w-6 md:h-6" />
          </button>
          <div>
            <h1 className="text-lg md:text-2xl font-bold text-slate-800 leading-tight">
              {readOnly ? 'Visualizar Parecer' : (initialData ? 'Editar Parecer' : 'Parecer de Classificação')}
            </h1>
            <p className="text-slate-500 text-[10px] md:text-sm">Resolução CNRH Nº 241</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 w-full xl:w-auto justify-end items-center">
          {currentUser && (
            <div className="flex flex-col items-end mr-2 pr-4 border-r border-slate-200 hidden md:flex">
              <span className="text-xs font-bold text-slate-700 leading-none">{currentUser.name}</span>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider mt-1 font-medium">{currentUser.role}</span>
            </div>
          )}
          {!readOnly && (
            <>
              <button 
                 onClick={handleClearForm} 
                 className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 font-medium shadow-sm text-sm transition-colors"
                 title="Limpar todos os campos"
              >
                 <Eraser size={18} /> <span className="hidden sm:inline">Limpar</span>
              </button>
              
              <button 
                 onClick={handleSaveDraft} 
                 className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-400 rounded-lg hover:bg-slate-50 text-slate-700 font-medium shadow-sm text-sm"
                 title="Salvar como Rascunho"
              >
                 <Save size={18} /> Rascunho
              </button>
    
              <button 
                 onClick={handleSaveComplete} 
                 className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium shadow-sm text-sm"
                 title="Concluir e Salvar"
              >
                 <CheckCircle size={18} /> Concluir
              </button>
            </>
          )}
          
          <button 
             onClick={handleGenerateDoc} 
             disabled={isSaving} 
             className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm disabled:opacity-70 text-sm"
             title="Exportar para Word"
          >
             {isSaving ? "Gerando..." : <><FileDown size={18} /> Exportar DOCX</>}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Strip */}
      <div 
         ref={navRef}
         className="lg:hidden -mx-4 px-4 pb-4 mb-4 overflow-x-auto flex gap-2 no-scrollbar sticky top-[160px] md:top-[85px] z-20 bg-slate-50 border-b border-slate-200 transition-all duration-300"
      >
         {sections.map(section => (
           <NavItem key={section.id} id={section.id} label={section.label.split('. ')[1]} icon={section.icon} />
         ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-8 relative items-start">
        
        {/* LEFT SIDEBAR - NAVIGATION (Desktop) */}
        <div className="hidden lg:block w-72 shrink-0 sticky top-28 self-start space-y-4 z-20">
           
           <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wider">Progresso</h3>
                <span className="text-xs font-bold text-emerald-600">{Math.round(progressPercent)}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 mb-6 overflow-hidden">
                <div 
                  className="bg-emerald-500 h-full rounded-full transition-all duration-700 ease-out" 
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <div className="space-y-1.5">
                 {sections.map(item => (
                   <button 
                     key={item.id}
                     onClick={() => scrollToSection(item.id)}
                     className={`
                       group flex items-center gap-3 w-full text-left text-sm px-4 py-3 rounded-xl transition-all
                       ${activeSection === item.id 
                         ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200 font-semibold translate-x-1' 
                         : 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 hover:translate-x-1'}
                     `}
                   >
                     <div className={`
                       w-8 h-8 rounded-lg flex items-center justify-center transition-colors
                       ${activeSection === item.id ? 'bg-white/20' : 'bg-slate-100 group-hover:bg-emerald-100'}
                     `}>
                       <item.icon size={16} className={activeSection === item.id ? 'text-white' : 'text-slate-400 group-hover:text-emerald-600'} />
                     </div>
                     <span className="flex-1">{item.label}</span>
                     {activeSection === item.id && (
                       <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                     )}
                   </button>
                 ))}
              </div>
           </div>

           <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="font-bold text-slate-700 mb-4 text-xs uppercase tracking-wider">Resumo da Classificação</h3>
              <div className="space-y-3">
                 <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-xs text-slate-500 font-medium">DPA</span>
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg ${formData.classificacao.dpaClass === DanoEnum.ALTO ? 'bg-red-100 text-red-700' : formData.classificacao.dpaClass === DanoEnum.MEDIO ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                       {formData.classificacao.dpaClass}
                    </span>
                 </div>
                 <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-xs text-slate-500 font-medium">CRI</span>
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg ${formData.classificacao.risco === RiscoEnum.ALTO ? 'bg-red-100 text-red-700' : formData.classificacao.risco === RiscoEnum.MEDIO ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                       {formData.classificacao.risco}
                    </span>
                 </div>
                 <div className="pt-3 border-t border-slate-100 text-center">
                    <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-tighter mb-1">Resultado Final</span>
                    <span className="block font-bold text-emerald-700 text-sm leading-tight">{formData.classificacao.resumo}</span>
                 </div>
              </div>
           </div>

        </div>
        
        {/* FORM CONTENT (Right) */}
        <fieldset disabled={readOnly} className="flex-1 space-y-10 min-w-0 w-full border-none p-0 m-0">
          
          <section id="introducao" className="scroll-mt-56">
             <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
              <button 
                onClick={() => toggleSection('introducao')}
                className="w-full flex items-center justify-between mb-6 border-b border-slate-100 pb-4 group"
              >
                <div className="flex items-center gap-2">
                   <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-sm">1</div>
                   <h2 className="text-lg font-bold text-slate-800 group-hover:text-emerald-600 transition-colors">INTRODUÇÃO</h2>
                </div>
                <div className="text-slate-400 group-hover:text-emerald-600 transition-colors">
                   {openSections.introducao ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
                </div>
              </button>
              
              {openSections.introducao && (
                <>
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6">
                     <h3 className="font-semibold text-slate-700 text-sm mb-3">Configuração do Texto Automático</h3>
                     <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-600 mb-1">Data de Recebimento</label>
                          <input 
                            type="date" 
                            value={formData.dataRecebimentoProcesso} 
                            onChange={(e) => handleInputChange('dataRecebimentoProcesso', e.target.value)} 
                            className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" 
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-600 mb-1">Tipo de Classificação</label>
                          <select value={formData.tipoClassificacao} onChange={(e) => handleInputChange('tipoClassificacao', e.target.value)} className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none">
                            {OPS_TIPO_CLASSIFICACAO.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                          {formData.tipoClassificacao === 'OUTRO' && <input type="text" placeholder="Digite..." value={formData.tipoClassificacaoOutro} onChange={(e) => handleInputChange('tipoClassificacaoOutro', e.target.value)} className="mt-2 w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" />}
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-600 mb-1">Tipo de Barragem</label>
                          <select value={formData.tipoBarragem} onChange={(e) => handleInputChange('tipoBarragem', e.target.value)} className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none">
                            {OPS_TIPO_BARRAGEM.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                          {formData.tipoBarragem === 'OUTRO' && <input type="text" placeholder="Digite..." value={formData.tipoBarragemOutro} onChange={(e) => handleInputChange('tipoBarragemOutro', e.target.value)} className="mt-2 w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" />}
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-600 mb-1">Situação</label>
                          <select value={formData.situacaoEmpreendimento} onChange={(e) => handleInputChange('situacaoEmpreendimento', e.target.value)} className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none">
                            {OPS_SITUACAO.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                          {formData.situacaoEmpreendimento === 'OUTRO' && <input type="text" placeholder="Digite..." value={formData.situacaoEmpreendimentoOutro} onChange={(e) => handleInputChange('situacaoEmpreendimentoOutro', e.target.value)} className="mt-2 w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" />}
                        </div>
                     </div>
                  </div>

                  <div className="space-y-4">
                     <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-4">
                        <label className="block text-sm font-medium text-slate-700 mb-2">Texto da Introdução</label>
                        <textarea 
                          rows={8} 
                          className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" 
                          value={formData.introducao}
                          onChange={(e) => handleInputChange('introducao', e.target.value)}
                          placeholder="O texto da introdução será gerado automaticamente se deixado em branco, mas você pode personalizá-lo aqui..."
                        />
                        <p className="text-[10px] text-slate-400 mt-1 italic">Se deixado em branco, o sistema utilizará o texto padrão baseado nas seleções acima.</p>
                     </div>

                     <div className="border rounded-lg overflow-hidden">
                        <button onClick={() => toggleSection('geral')} className="w-full flex justify-between items-center p-3 bg-slate-100 hover:bg-slate-200 transition-colors">
                           <span className="font-bold text-sm text-slate-700">Documentos Gerais</span>
                           {openSections.geral ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}
                        </button>
                        {openSections.geral && (
                           <div className="p-3 bg-white space-y-2">
                              {formData.docsGerais.map(item => <DocItemRow key={item.id} item={item} listKey="docsGerais" onDocChange={handleDocChange} />)}
                              {formData.docsGeraisOutro.map((item, index) => (
                                <DocItemRow 
                                  key={item.id} 
                                  item={item} 
                                  listKey="docsGeraisOutro" 
                                  hasExtraInput={true} 
                                  extraPlaceholder="Nome do documento..." 
                                  onDocChange={handleDocChange}
                                  onRemove={index > 0 ? () => handleRemoveOtherDoc('docsGeraisOutro', item.id) : undefined}
                                />
                              ))}
                              {formData.docsGeraisOutro.some(d => d.checked) && (
                                <button 
                                  type="button"
                                  onClick={() => handleAddOtherDoc('docsGeraisOutro', 'geral')}
                                  className="ml-11 mt-2 text-xs flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
                                >
                                  <Plus size={14} /> Adicionar outro documento
                                </button>
                              )}
                           </div>
                        )}
                     </div>

                     {/* Other doc sections... reusing structure */}
                     <div className="border rounded-lg overflow-hidden">
                        <button onClick={() => toggleSection('ident')} className="w-full flex justify-between items-center p-3 bg-slate-100 hover:bg-slate-200 transition-colors">
                           <span className="font-bold text-sm text-slate-700">Identificação do Responsável</span>
                           {openSections.ident ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}
                        </button>
                        {openSections.ident && (
                           <div className="p-3 bg-white space-y-2">
                              {formData.docsIdentificacao.map(item => <DocItemRow key={item.id} item={item} listKey="docsIdentificacao" hasExtraInput={item.extraInput !== undefined} onDocChange={handleDocChange} />)}
                              {formData.docsIdentificacaoOutro.map((item, index) => (
                                <DocItemRow 
                                  key={item.id} 
                                  item={item} 
                                  listKey="docsIdentificacaoOutro" 
                                  hasExtraInput={true} 
                                  onDocChange={handleDocChange}
                                  onRemove={index > 0 ? () => handleRemoveOtherDoc('docsIdentificacaoOutro', item.id) : undefined}
                                />
                              ))}
                              {formData.docsIdentificacaoOutro.some(d => d.checked) && (
                                <button 
                                  type="button"
                                  onClick={() => handleAddOtherDoc('docsIdentificacaoOutro', 'ident')}
                                  className="ml-11 mt-2 text-xs flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
                                >
                                  <Plus size={14} /> Adicionar outro documento
                                </button>
                              )}
                           </div>
                        )}
                     </div>
                     
                     <div className="border rounded-lg overflow-hidden">
                        <div className="p-3 bg-slate-100 flex items-center justify-between">
                           <div className="flex items-center gap-3">
                              <input type="checkbox" checked={formData.espolio} onChange={(e) => handleInputChange('espolio', e.target.checked)} className="rounded text-emerald-600 w-5 h-5" id="checkEspolio" />
                              <label htmlFor="checkEspolio" className="font-bold text-sm text-slate-700 cursor-pointer">Solicitante falecido (Espólio)</label>
                           </div>
                           <button onClick={() => toggleSection('espolio')} disabled={!formData.espolio} className="disabled:opacity-30">
                              {openSections.espolio ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}
                           </button>
                        </div>
                        {formData.espolio && openSections.espolio && (
                           <div className="p-3 bg-white space-y-2 border-t border-slate-200">
                              {formData.docsEspolio.map(item => <DocItemRow key={item.id} item={item} listKey="docsEspolio" hasExtraInput={item.extraInput !== undefined} onDocChange={handleDocChange} />)}
                              {formData.docsEspolioOutro.map((item, index) => (
                                <DocItemRow 
                                  key={item.id} 
                                  item={item} 
                                  listKey="docsEspolioOutro" 
                                  hasExtraInput={true} 
                                  onDocChange={handleDocChange}
                                  onRemove={index > 0 ? () => handleRemoveOtherDoc('docsEspolioOutro', item.id) : undefined}
                                />
                              ))}
                              {formData.docsEspolioOutro.some(d => d.checked) && (
                                <button 
                                  type="button"
                                  onClick={() => handleAddOtherDoc('docsEspolioOutro', 'espolio')}
                                  className="ml-11 mt-2 text-xs flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
                                >
                                  <Plus size={14} /> Adicionar outro documento
                                </button>
                              )}
                           </div>
                        )}
                     </div>

                     <div className="border rounded-lg overflow-hidden">
                        <button onClick={() => toggleSection('art')} className="w-full flex justify-between items-center p-3 bg-slate-100 hover:bg-slate-200 transition-colors">
                           <span className="font-bold text-sm text-slate-700">ARTs e Equipe Técnica</span>
                           {openSections.art ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}
                        </button>
                        {openSections.art && (
                           <div className="p-3 bg-white space-y-2">
                              {formData.docsArt.map(item => <DocItemRow key={item.id} item={item} listKey="docsArt" artMode={true} onDocChange={handleDocChange} />)}
                              {formData.docsArtOutro.map((item, index) => (
                                <DocItemRow 
                                  key={item.id} 
                                  item={item} 
                                  listKey="docsArtOutro" 
                                  artMode={true} 
                                  hasExtraInput={true} 
                                  extraPlaceholder="Descrição..." 
                                  onDocChange={handleDocChange}
                                  onRemove={index > 0 ? () => handleRemoveOtherDoc('docsArtOutro', item.id) : undefined}
                                />
                              ))}
                              {formData.docsArtOutro.some(d => d.checked) && (
                                <button 
                                  type="button"
                                  onClick={() => handleAddOtherDoc('docsArtOutro', 'art')}
                                  className="ml-11 mt-2 text-xs flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
                                >
                                  <Plus size={14} /> Adicionar outro documento
                                </button>
                              )}
                           </div>
                        )}
                     </div>

                     <div className="border rounded-lg overflow-hidden">
                        <button onClick={() => toggleSection('tecnico')} className="w-full flex justify-between items-center p-3 bg-slate-100 hover:bg-slate-200 transition-colors">
                           <span className="font-bold text-sm text-slate-700">Documentos Técnicos</span>
                           {openSections.tecnico ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}
                        </button>
                        {openSections.tecnico && (
                           <div className="p-3 bg-white space-y-2">
                              {formData.docsTecnicos.map(item => <DocItemRow key={item.id} item={item} listKey="docsTecnicos" hasExtraInput={item.extraInput !== undefined} onDocChange={handleDocChange} />)}
                              {formData.docsTecnicosOutro.map((item, index) => (
                                <DocItemRow 
                                  key={item.id} 
                                  item={item} 
                                  listKey="docsTecnicosOutro" 
                                  hasExtraInput={true} 
                                  onDocChange={handleDocChange}
                                  onRemove={index > 0 ? () => handleRemoveOtherDoc('docsTecnicosOutro', item.id) : undefined}
                                />
                              ))}
                              {formData.docsTecnicosOutro.some(d => d.checked) && (
                                <button 
                                  type="button"
                                  onClick={() => handleAddOtherDoc('docsTecnicosOutro', 'tec')}
                                  className="ml-11 mt-2 text-xs flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
                                >
                                  <Plus size={14} /> Adicionar outro documento
                                </button>
                              )}
                           </div>
                        )}
                     </div>
                  </div>
                </>
              )}
            </div>
          </section>

          <section id="pedido" className="scroll-mt-56">
             <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
                <button 
                  onClick={() => toggleSection('pedido')}
                  className="w-full flex items-center justify-between mb-6 border-b border-slate-100 pb-4 group"
                >
                  <div className="flex items-center gap-2">
                     <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-sm">2</div>
                     <h2 className="text-lg font-bold text-slate-800 group-hover:text-emerald-600 transition-colors">INFORMAÇÕES DO PEDIDO</h2>
                  </div>
                  <div className="text-slate-400 group-hover:text-emerald-600 transition-colors">
                     {openSections.pedido ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
                  </div>
                </button>

                {openSections.pedido && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="col-span-1"><label className="block text-sm font-medium text-slate-700 mb-1">Processo</label><input type="text" value={formData.protocolo} onChange={(e) => handleInputChange('protocolo', e.target.value)} className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-base md:text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" /></div>
                      <div className="col-span-1">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Analista</label>
                        <select 
                          value={formData.analista} 
                          onChange={(e) => handleInputChange('analista', e.target.value)} 
                          className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-base md:text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                        >
                          {OPS_ANALISTA.map(name => <option key={name} value={name}>{name}</option>)}
                        </select>
                        {formData.analista === 'OUTRO' && (
                          <div className="mt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                            <label className="block text-xs font-bold text-slate-500 mb-1">Nome do Analista (Manual)</label>
                            <input 
                              type="text" 
                              value={formData.analistaOutro} 
                              onChange={(e) => handleInputChange('analistaOutro', e.target.value)} 
                              className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" 
                              placeholder="Digite o nome completo..."
                            />
                          </div>
                        )}
                      </div>
                    </div>
                    
                     <div className="mt-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                       <h3 className="font-bold text-slate-700 text-sm mb-3">Responsável Técnico</h3>
                       <div className="flex flex-col gap-3 mb-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                             <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Nome</label>
                                <input list="rt-list" value={newRT.selectedName} onChange={(e) => setNewRT({...newRT, selectedName: e.target.value})} className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" placeholder="Selecione ou digite..." />
                                <datalist id="rt-list">{OPS_RESPONSAVEL_TECNICO.map(name => <option key={name} value={name} />)}</datalist>
                             </div>
                             <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">ART (Números)</label>
                                <input type="number" value={newRT.art} onChange={(e) => setNewRT({...newRT, art: e.target.value})} className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" placeholder="Somente números" />
                             </div>
                          </div>
                          <button onClick={handleAddRT} className="w-full sm:w-auto self-start px-3 py-2 bg-emerald-600 text-white rounded text-sm font-medium hover:bg-emerald-700 flex items-center justify-center gap-1 shadow-sm transition-colors"><Plus size={16} /> Adicionar RT</button>
                       </div>
                       
                       {formData.responsaveisTecnicos.length > 0 && (
                          <div className="mt-4">
                             <h4 className="text-xs font-bold text-emerald-700 uppercase mb-2 flex items-center gap-2">
                                <UserCheck size={14} /> Profissionais Adicionados:
                             </h4>
                             <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {formData.responsaveisTecnicos.map(rt => (
                                    <div key={rt.id} className="flex justify-between items-start bg-white p-3 border border-emerald-100 rounded-lg shadow-sm hover:shadow-md transition-shadow group">
                                       <div className="flex flex-col overflow-hidden">
                                          <span className="font-bold text-slate-700 text-sm truncate" title={rt.nome}>{rt.nome}</span>
                                          <span className="text-xs text-slate-500">ART: {rt.art}</span>
                                       </div>
                                       <button 
                                          onClick={() => handleRemoveRT(rt.id)} 
                                          className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded transition-colors"
                                          title="Remover Profissional"
                                       >
                                          <X size={16} />
                                       </button>
                                    </div>
                                ))}
                             </div>
                          </div>
                       )}
                    </div>

                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mt-6">
                       <h3 className="font-bold text-slate-700 text-sm mb-4 border-b border-slate-200 pb-2">Tabela 1. Informações do empreendedor e empreendimento</h3>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          
                          <div className="col-span-1 md:col-span-2">
                            <label className="block text-xs font-bold text-slate-500 mb-1">Identificação do empreendedor</label>
                            <input type="text" className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" placeholder="Nome do Empreendedor" value={formData.razaoSocial} onChange={(e) => handleInputChange('razaoSocial', e.target.value)} />
                          </div>

                          <div className="col-span-1 md:col-span-2">
                            <label className="block text-xs font-bold text-slate-500 mb-1">
                                {(formData.cpfCnpj || '').replace(/\D/g, '').length === 0 ? "CPF / CNPJ" : ((formData.cpfCnpj || '').replace(/\D/g, '').length > 11 ? "CNPJ" : "CPF")}
                            </label>
                            <input type="text" className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" placeholder="000.000.000-00 / 00.000.000/0000-00" value={formData.cpfCnpj} onChange={(e) => handleInputChange('cpfCnpj', maskCpfCnpj(e.target.value))} />
                          </div>

                          <div className="col-span-1 md:col-span-2">
                            <label className="block text-xs font-bold text-slate-500 mb-1">Localização do empreendimento</label>
                            <input type="text" className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" placeholder="Endereço / Localização" value={formData.localizacao} onChange={(e) => handleInputChange('localizacao', e.target.value)} />
                          </div>

                          <div>
                             <label className="block text-xs font-bold text-slate-500 mb-1">Nº CAR</label>
                             <input type="text" className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" placeholder="MT-..." value={formData.numCAR} onChange={(e) => handleInputChange('numCAR', e.target.value)} />
                          </div>

                          <div>
                             <label className="block text-xs font-bold text-slate-500 mb-1">Município/UF</label>
                             <select className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" value={formData.municipio} onChange={(e) => handleInputChange('municipio', e.target.value)}>
                               <option value="">Selecione...</option>
                               {OPS_MUNICIPIOS.map(m => <option key={m} value={m}>{m}</option>)}
                             </select>
                          </div>

                          <div className="col-span-1 md:col-span-2">
                             <label className="block text-xs font-bold text-slate-500 mb-1">Finalidade do barramento</label>
                             <select className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" value={formData.finalidade} onChange={(e) => handleInputChange('finalidade', e.target.value)}>
                                {OPS_FINALIDADE.map(f => <option key={f} value={f}>{f}</option>)}
                             </select>
                             {formData.finalidade === 'OUTRO' && (
                                <input type="text" className="mt-2 w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" placeholder="Digite a finalidade..." value={formData.finalidadeOutro} onChange={(e) => handleInputChange('finalidadeOutro', e.target.value)} />
                             )}
                          </div>

                          <div className="col-span-1 md:col-span-2">
                             <label className="block text-xs font-bold text-slate-500 mb-1">Situação do empreendimento</label>
                             <select className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" value={formData.situacaoEmpreendimento} onChange={(e) => handleInputChange('situacaoEmpreendimento', e.target.value)}>
                                {OPS_SITUACAO.map(s => <option key={s} value={s}>{s}</option>)}
                             </select>
                             {formData.situacaoEmpreendimento === 'OUTRO' && (
                                <input type="text" className="mt-2 w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" placeholder="Digite a situação..." value={formData.situacaoEmpreendimentoOutro} onChange={(e) => handleInputChange('situacaoEmpreendimentoOutro', e.target.value)} />
                             )}
                          </div>

                          <div>
                             <label className="block text-xs font-bold text-slate-500 mb-1">Nome do Curso d’água barrado</label>
                             <input type="text" className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" value={formData.cursoAgua} onChange={(e) => handleInputChange('cursoAgua', e.target.value)} />
                          </div>

                          <div>
                             <label className="block text-xs font-bold text-slate-500 mb-1">Propriedades Limites da barragem</label>
                             <input type="text" className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" value={formData.propriedadesLimites} onChange={(e) => handleInputChange('propriedadesLimites', e.target.value)} />
                          </div>

                          <div>
                             <label className="block text-xs font-bold text-slate-500 mb-1">Sub-bacia/Bacia</label>
                             <input type="text" className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" value={formData.subBacia} onChange={(e) => handleInputChange('subBacia', e.target.value)} />
                          </div>

                          <div>
                             <label className="block text-xs font-bold text-slate-500 mb-1">UPG</label>
                             <select 
                                className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" 
                                value={formData.upg || ''} 
                                onChange={(e) => handleInputChange('upg', e.target.value)}
                             >
                                <option value="">Selecione a UPG</option>
                                {(formData.municipio ? getUpgsForMunicipality(formData.municipio) : []).map(u => (
                                   <option key={u} value={u}>{u}</option>
                                ))}
                                <option value="OUTRA">OUTRA</option>
                             </select>
                          </div>

                          <div>
                             <label className="block text-xs font-bold text-slate-500 mb-1">Área da bacia de contribuição (km²)*</label>
                             <input type="text" className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" value={formData.areaBacia} onChange={(e) => handleInputChange('areaBacia', e.target.value)} />
                          </div>

                          <div>
                             <label className="block text-xs font-bold text-slate-500 mb-1">Índice de pluviosidade**</label>
                             <input type="text" className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" value={formData.indicePluviosidade} onChange={(e) => handleInputChange('indicePluviosidade', e.target.value)} />
                          </div>
                          
                          <div className="col-span-1 md:col-span-2">
                             <label className="block text-xs font-bold text-slate-500 mb-1">Legenda (Rodapé da Tabela)</label>
                             <textarea rows={2} className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" value={formData.legendaTabela1} onChange={(e) => handleInputChange('legendaTabela1', e.target.value)} />
                          </div>
                       </div>
                    </div>
                  </>
                )}
             </div>
          </section>

          <section id="barramento" className="scroll-mt-56">
             <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
                <button 
                  onClick={() => toggleSection('barramento')}
                  className="w-full flex items-center justify-between mb-6 border-b border-slate-100 pb-4 group"
                >
                  <div className="flex items-center gap-2">
                     <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-sm">3</div>
                     <h2 className="text-lg font-bold text-slate-800 group-hover:text-emerald-600 transition-colors">INFORMAÇÕES DO BARRAMENTO</h2>
                  </div>
                  <div className="text-slate-400 group-hover:text-emerald-600 transition-colors">
                     {openSections.barramento ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
                  </div>
                </button>
                
                {openSections.barramento && (
                  <div className="space-y-8">
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                      <h3 className="font-bold text-slate-700 text-sm mb-4">Barragem Principal</h3>
                      <BarramentoForm 
                        data={formData.barragemPrincipal} 
                        isMain={true} 
                        updateBarramento={updateBarramento}
                        updateStructure={updateStructure}
                        addStructure={addStructure}
                        removeStructure={removeStructure}
                        removeUpstreamDam={() => {}} 
                      />
                    </div>

                    <div>
                       <div className="flex justify-between items-center mb-4">
                          <h3 className="font-bold text-slate-700 text-sm">Barragens a Montante</h3>
                          <button onClick={addUpstreamDam} className="text-xs flex items-center gap-1 bg-emerald-600 text-white px-3 py-2 rounded hover:bg-emerald-700 font-medium">
                            <Plus size={16} /> Adicionar Barragem
                          </button>
                       </div>
                       {formData.barragensMontante.length === 0 && <p className="text-sm text-slate-400 italic">Nenhuma barragem a montante adicionada.</p>}
                       {formData.barragensMontante.map((b, idx) => (
                          <BarramentoForm 
                            key={b.id} 
                            data={b} 
                            isMain={false} 
                            idx={idx}
                            updateBarramento={updateBarramento}
                            updateStructure={updateStructure}
                            addStructure={addStructure}
                            removeStructure={removeStructure}
                            removeUpstreamDam={removeUpstreamDam}
                          />
                       ))}
                    </div>

                     <div className="bg-slate-900 text-white p-4 rounded-xl shadow-lg mt-6">
                        <div className="flex items-center gap-2 mb-2">
                           <Droplets size={16} className="text-emerald-400" />
                           <span className="font-bold text-sm">Dica do Analista</span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">
                           Lembre-se de conferir se todas as barragens a montante foram inseridas corretamente, pois elas impactam diretamente na segurança da barragem principal.
                        </p>
                     </div>
                  </div>
                )}
             </div>
          </section>

          <section id="classificacao" className="scroll-mt-56">
             <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
                <button 
                  onClick={() => toggleSection('classificacao')}
                  className="w-full flex items-center justify-between mb-6 border-b border-slate-100 pb-4 group"
                >
                  <div className="flex items-center gap-2">
                     <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-sm">4</div>
                     <h2 className="text-lg font-bold text-slate-800 group-hover:text-emerald-600 transition-colors">CLASSIFICAÇÃO</h2>
                  </div>
                  <div className="text-slate-400 group-hover:text-emerald-600 transition-colors">
                     {openSections.classificacao ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
                  </div>
                </button>

                {openSections.classificacao && (
                  <div className="space-y-8">
                     
                     {/* DPA Section */}
                     <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
                           <h3 className="font-bold text-blue-800 text-sm uppercase">Dano Potencial Associado (DPA)</h3>
                           <span className={`px-2 py-1 rounded text-xs font-bold ${formData.classificacao.dpaClass === DanoEnum.ALTO ? 'bg-red-100 text-red-700' : formData.classificacao.dpaClass === DanoEnum.MEDIO ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                              {formData.classificacao.dpaClass} (Total: {formData.classificacao.totalDpa})
                           </span>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                           <div>
                              <label className="block text-xs font-bold text-slate-600 mb-1">DPA 1 - Volume</label>
                              <select value={formData.classificacao.dpa1Select} onChange={(e) => handleClassificationChange('dpa1Select', e.target.value)} className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none">
                                 {OPS_DPA1_VOLUME.map(o => <option key={o} value={o}>{o}</option>)}
                              </select>
                           </div>
                           <div>
                              <label className="block text-xs font-bold text-slate-600 mb-1">DPA 2 - Construções na área afetada a jusante</label>
                              <select value={formData.classificacao.dpa2Select} onChange={(e) => handleClassificationChange('dpa2Select', e.target.value)} className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none">
                                 {OPS_DPA2_CONSTRUCOES.map(o => <option key={o} value={o}>{o}</option>)}
                              </select>
                           </div>
                           <div>
                              <label className="block text-xs font-bold text-slate-600 mb-1">DPA 3 - Ambiental</label>
                              <select value={formData.classificacao.dpa3Select} onChange={(e) => handleClassificationChange('dpa3Select', e.target.value)} className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none">
                                 {OPS_DPA3_ENV.map(o => <option key={o} value={o}>{o}</option>)}
                              </select>
                           </div>
                           <div>
                              <label className="block text-xs font-bold text-slate-600 mb-1">DPA 4 - Socioeconômico</label>
                              <select value={formData.classificacao.dpa4Select} onChange={(e) => handleClassificationChange('dpa4Select', e.target.value)} className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none">
                                 {OPS_DPA4_SOCIO.map(o => <option key={o} value={o}>{o}</option>)}
                              </select>
                           </div>
                           <div className="sm:col-span-2">
                               <label className="block text-xs font-bold text-slate-600 mb-1">Texto de Ruptura Hipotética</label>
                               <textarea rows={3} value={formData.classificacao.rupturaTexto} onChange={(e) => handleClassificationChange('rupturaTexto', e.target.value)} className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" />
                           </div>
                        </div>
                     </div>

                     {/* CRI Section */}
                     <div className="bg-amber-50/50 p-4 rounded-lg border border-amber-100">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                           <h3 className="font-bold text-amber-800 text-sm uppercase">Categoria de Risco (CRI)</h3>
                           <div className="flex flex-wrap items-center gap-2">
                              <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                                 <input type="checkbox" checked={formData.classificacao.criPreClassificacao} onChange={(e) => handleClassificationChange('criPreClassificacao', e.target.checked)} className="rounded text-amber-600" />
                                 Pré-classificação (Sem pontuação)
                              </label>
                              <span className={`px-2 py-1 rounded text-xs font-bold ${formData.classificacao.risco === RiscoEnum.ALTO ? 'bg-red-100 text-red-700' : formData.classificacao.risco === RiscoEnum.MEDIO ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                                 {formData.classificacao.risco} (Geral: {formData.classificacao.valGeral})
                              </span>
                           </div>
                        </div>

                        {/* CT */}
                        <div className="mb-4">
                           <h4 className="text-xs font-bold text-slate-500 border-b border-amber-200 mb-2">Características Técnicas (CT) - (Auto: {formData.classificacao.totalCT})</h4>
                           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                               <div>
                                  <label className="block text-xs text-slate-600 mb-1">CT6 - Vazão de Projeto</label>
                                  <select value={formData.classificacao.ct6Select} onChange={(e) => handleClassificationChange('ct6Select', e.target.value)} className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none">
                                     {OPS_CT6_VAZAO.map(o => <option key={o} value={o}>{o}</option>)}
                                  </select>
                               </div>
                               <div className="flex flex-col gap-1">
                                  <label className="block text-[10px] font-bold text-slate-400 uppercase">Pontuações Automáticas (CT1 a CT5)</label>
                                  <div className="flex flex-wrap gap-2">
                                     {[
                                       { label: 'CT1', score: formData.classificacao.scoreCt1 },
                                       { label: 'CT2', score: formData.classificacao.scoreCt2 },
                                       { label: 'CT3', score: formData.classificacao.scoreCt3 },
                                       { label: 'CT4', score: formData.classificacao.scoreCt4 },
                                       { label: 'CT5', score: formData.classificacao.scoreCt5 },
                                     ].map((ct) => (
                                       <div key={ct.label} className="flex flex-col items-center bg-slate-50 border border-slate-200 rounded px-2 py-1 min-w-[45px]">
                                          <span className="text-[9px] text-slate-500 font-bold">{ct.label}</span>
                                          <span className="text-xs font-bold text-slate-700">{ct.score}</span>
                                       </div>
                                     ))}
                                  </div>
                               </div>
                           </div>
                        </div>

                        {/* EC */}
                        <div className="mb-4">
                           <h4 className="text-xs font-bold text-slate-500 border-b border-amber-200 mb-2">Estado de Conservação (EC) - (Total: {formData.classificacao.totalEC})</h4>
                           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                               {[
                                  {label: "EC1 - Extravasor", val: formData.classificacao.ec1Select, key: 'ec1Select', ops: OPS_EC1_EXTRAVASOR},
                                  {label: "EC2 - Adutora", val: formData.classificacao.ec2Select, key: 'ec2Select', ops: OPS_EC2_ADUTORA},
                                  {label: "EC3 - Percolação", val: formData.classificacao.ec3Select, key: 'ec3Select', ops: OPS_EC3_PERCOLACAO},
                                  {label: "EC4 - Deformações", val: formData.classificacao.ec4Select, key: 'ec4Select', ops: OPS_EC4_DEFORMACAO},
                                  {label: "EC5 - Taludes", val: formData.classificacao.ec5Select, key: 'ec5Select', ops: OPS_EC5_TALUDES},
                               ].map((field) => (
                                  <div key={field.key}>
                                     <label className="block text-xs text-slate-600 mb-1">{field.label}</label>
                                     <select value={field.val} onChange={(e) => handleClassificationChange(field.key as any, e.target.value)} className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none">
                                        {field.ops.map(o => <option key={o} value={o}>{o}</option>)}
                                     </select>
                                  </div>
                               ))}
                           </div>
                        </div>

                         {/* PS */}
                        <div>
                           <h4 className="text-xs font-bold text-slate-500 border-b border-amber-200 mb-2">Plano de Segurança (PS) - (Total: {formData.classificacao.totalPS})</h4>
                           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                               {[
                                  {label: "PS1 - Documentação", val: formData.classificacao.ps1Select, key: 'ps1Select', ops: OPS_PS1_DOCS},
                                  {label: "PS2 - Estrutura Organizacional", val: formData.classificacao.ps2Select, key: 'ps2Select', ops: OPS_PS2_ORG},
                                  {label: "PS3 - Procedimentos de Inspeção", val: formData.classificacao.ps3Select, key: 'ps3Select', ops: OPS_PS3_INSP},
                                  {label: "PS4 - Relatórios de Inspeção", val: formData.classificacao.ps4Select, key: 'ps4Select', ops: OPS_PS4_REL},
                                  {label: "PS5 - PAE", val: formData.classificacao.ps5Select, key: 'ps5Select', ops: OPS_PS5_PAE},
                                  {label: "PS6 - Regras Operacionais", val: formData.classificacao.ps6Select, key: 'ps6Select', ops: OPS_PS6_REGRA},
                               ].map((field) => (
                                  <div key={field.key}>
                                     <label className="block text-xs text-slate-600 mb-1">{field.label}</label>
                                     <select value={field.val} onChange={(e) => handleClassificationChange(field.key as any, e.target.value)} className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none">
                                        {field.ops.map(o => <option key={o} value={o}>{o}</option>)}
                                     </select>
                                  </div>
                               ))}
                           </div>
                        </div>

                     </div>

                  </div>
                )}
             </div>
          </section>

          <section id="parecer" className="scroll-mt-56">
             <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
                <button 
                  onClick={() => toggleSection('parecer')}
                  className="w-full flex items-center justify-between mb-6 border-b border-slate-100 pb-4 group"
                >
                  <div className="flex items-center gap-2">
                     <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-sm">5</div>
                     <h2 className="text-lg font-bold text-slate-800 group-hover:text-emerald-600 transition-colors">PARECER TÉCNICO CONCLUSIVO</h2>
                  </div>
                  <div className="text-slate-400 group-hover:text-emerald-600 transition-colors">
                     {openSections.parecer ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
                  </div>
                </button>
                
                {openSections.parecer && (
                  <>
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-4">
                       <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-bold text-slate-500 uppercase">Resultado Calculado</span>
                          {isPNSB ? (
                            <span className="bg-red-100 text-red-700 text-xs px-2 py-1 rounded font-bold">ENQUADRADA NA PNSB</span>
                          ) : (
                            <span className="bg-slate-200 text-slate-600 text-xs px-2 py-1 rounded font-bold">NÃO ENQUADRADA</span>
                          )}
                       </div>
                       <div className="text-2xl font-bold text-slate-800 text-center py-4">{formData.classificacao.resumo}</div>
                    </div>

                    <div>
                       <label className="block text-sm font-medium text-slate-700 mb-2">Texto do Parecer</label>
                       <textarea 
                         rows={12} 
                         className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-4 text-sm md:text-base leading-relaxed focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none" 
                         value={formData.parecer_final}
                         onChange={(e) => handleInputChange('parecer_final', e.target.value)}
                       />
                       <p className="text-xs text-slate-400 mt-2 text-right">Este texto será incluído no final do documento gerado.</p>
                    </div>
                  </>
                )}
             </div>
          </section>

          <section id="sistema_info" className="scroll-mt-56">
             <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
                <button 
                  onClick={() => toggleSection('sistema_info')}
                  className="w-full flex items-center justify-between mb-6 border-b border-slate-100 pb-4 group"
                >
                  <div className="flex items-center gap-2">
                     <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-sm">6</div>
                     <h2 className="text-lg font-bold text-slate-800 group-hover:text-emerald-600 transition-colors uppercase">SISTEMA DE INFORMAÇÕES AO EMPREENDEDOR</h2>
                  </div>
                  <div className="text-slate-400 group-hover:text-emerald-600 transition-colors">
                     {openSections.sistema_info ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
                  </div>
                </button>

                {openSections.sistema_info && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Processo</label>
                        <p className="text-sm font-bold text-slate-700">{formData.protocolo || 'Não informado'}</p>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Analista</label>
                        <p className="text-sm font-bold text-slate-700">{formData.analista || 'Não informado'}</p>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Município</label>
                        <p className="text-sm font-bold text-slate-700">{formData.municipio ? `${formData.municipio}/MT` : 'Não informado'}</p>
                      </div>
                    </div>

                    {formData.status === 'Rascunho' ? (
                      <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Data de envio da pendência</label>
                            <input 
                              type="date" 
                              className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 outline-none"
                              value={formData.sistemaInformacoes?.data_envio_pendencia || ''}
                              onChange={(e) => handleSistemaInfoChange('data_envio_pendencia', e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Data Limite (Número de dias)</label>
                            <input 
                              type="number" 
                              placeholder="Ex: 30"
                              className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 outline-none"
                              value={formData.sistemaInformacoes?.data_limite_dias || ''}
                              onChange={(e) => handleSistemaInfoChange('data_limite_dias', parseInt(e.target.value))}
                            />
                            {dateLimitInfo && (
                              <div className="mt-2 p-2 bg-emerald-50 border border-emerald-100 rounded text-[10px] flex justify-between">
                                <span>Concedidos: <strong>{dateLimitInfo.concedidos}</strong></span>
                                <span>Faltam: <strong>{dateLimitInfo.faltam}</strong></span>
                                <span>Vencimento: <strong>{dateLimitInfo.vencimento}</strong></span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Situação</label>
                          <select 
                            className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 outline-none"
                            value={formData.sistemaInformacoes?.situacao || 'Aguardando análise'}
                            onChange={(e) => handleSistemaInfoChange('situacao', e.target.value)}
                          >
                            <option value="Aguardando análise">Aguardando análise</option>
                            <option value="Aguardando cumprimento de pendencias">Aguardando cumprimento de pendencias</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">OBSERVAÇÕES DO ANALISTA</label>
                          <textarea 
                            rows={4}
                            placeholder="Essas informações serão compartilhadas com o Empreendedor e Responsável Técnico"
                            className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 text-sm focus:bg-white focus:border-emerald-500 outline-none"
                            value={formData.sistemaInformacoes?.observacoes_analista || ''}
                            onChange={(e) => handleSistemaInfoChange('observacoes_analista', e.target.value)}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="flex items-start gap-3">
                          <CheckCircle className="text-emerald-600 shrink-0 mt-0.5" size={20} />
                          <div className="text-sm text-slate-700 space-y-2">
                            <p className="font-bold">Status do Parecer: CONCLUÍDO</p>
                            {isPNSB ? (
                              <p><strong>Parecer Técnico emitido</strong> = para barragens que se enquadrarem na PNSB de acordo com a classificação.</p>
                            ) : (
                              <p><strong>Parecer Técnico concluído</strong> = barragens que não se enquadraram na PNSB e estão desobrigados de apresentar demais peças técnicas.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
             </div>
          </section>

          <section id="revisar" className="scroll-mt-56">
             <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
                <button 
                  onClick={() => toggleSection('revisar')}
                  className="w-full flex items-center justify-between mb-6 border-b border-slate-100 pb-4 group"
                >
                  <div className="flex items-center gap-2">
                     <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-sm">7</div>
                     <h2 className="text-lg font-bold text-slate-800 group-hover:text-emerald-600 transition-colors uppercase">REVISÃO FINAL</h2>
                  </div>
                  <div className="text-slate-400 group-hover:text-emerald-600 transition-colors">
                     {openSections.revisar ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
                  </div>
                </button>
                
                {openSections.revisar && (
                  <div className="flex justify-center">
                     <PreviewSection />
                  </div>
                )}
             </div>
          </section>
          <section id="portaria" className="scroll-mt-56">
             <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
                <button 
                  onClick={() => toggleSection('portaria')}
                  className="w-full flex items-center justify-between mb-6 border-b border-slate-100 pb-4 group"
                >
                  <div className="flex items-center gap-2">
                     <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-sm">8</div>
                     <h2 className="text-lg font-bold text-slate-800 group-hover:text-emerald-600 transition-colors uppercase">Portaria</h2>
                  </div>
                  <div className="text-slate-400 group-hover:text-emerald-600 transition-colors">
                     {openSections.portaria ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
                  </div>
                </button>
                
                {openSections.portaria && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-emerald-50/50 rounded-xl border border-emerald-100">
                      <div>
                        <label className="block text-xs font-bold text-emerald-800 uppercase mb-1">Parecer Técnico n°</label>
                        <input 
                          type="text" 
                          placeholder="000/CSB/SURH/SEMA/2024"
                          className="w-full rounded-lg border-emerald-200 bg-white p-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                          value={formData.parecerTecnicoNumero || ''}
                          onChange={(e) => setFormData(p => ({ ...p, parecerTecnicoNumero: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-emerald-800 uppercase mb-1">Data do Parecer Técnico</label>
                        <input 
                          type="date" 
                          className="w-full rounded-lg border-emerald-200 bg-white p-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                          value={formData.dataParecerTecnico || ''}
                          onChange={(e) => setFormData(p => ({ ...p, dataParecerTecnico: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-emerald-800 uppercase mb-1">Portaria n°</label>
                        <input 
                          type="text" 
                          placeholder="000/2024"
                          className="w-full rounded-lg border-emerald-200 bg-white p-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                          value={formData.portariaNumero || ''}
                          onChange={(e) => setFormData(p => ({ ...p, portariaNumero: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-emerald-800 uppercase mb-1">Data da Portaria</label>
                        <input 
                          type="date" 
                          className="w-full rounded-lg border-emerald-200 bg-white p-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                          value={formData.dataPortaria || ''}
                          onChange={(e) => setFormData(p => ({ ...p, dataPortaria: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                       <button 
                         onClick={handleCopyPortaria}
                         className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors text-sm"
                       >
                         <Copy size={18} /> Copiar todo texto
                       </button>
                       <button 
                         onClick={handleSavePortariaDocx}
                         className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors text-sm shadow-sm"
                       >
                         <FileDown size={18} /> Salvar DOCX da Portaria
                       </button>
                       <button 
                         onClick={() => {
                           if (!formData.customPortariaText) {
                             setFormData(p => ({ ...p, customPortariaText: generatePortariaText() }));
                           }
                           setIsEditingPortaria(true);
                         }}
                         className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg font-medium transition-colors text-sm"
                       >
                         <Edit3 size={18} /> Editar texto da portaria
                       </button>
                       {formData.customPortariaText && (
                         <button 
                           onClick={() => {
                             if (window.confirm("Deseja realmente descartar as alterações manuais e voltar ao texto automático?")) {
                               setFormData(p => ({ ...p, customPortariaText: null }));
                               setIsEditingPortaria(false);
                             }
                           }}
                           className="flex items-center gap-2 px-4 py-2 bg-orange-50 text-orange-600 hover:bg-orange-100 rounded-lg font-medium transition-colors text-sm"
                         >
                           <RotateCcw size={18} /> Voltar texto gerado automaticamente
                         </button>
                       )}
                    </div>

                    {isEditingPortaria ? (
                      <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
                        <textarea 
                          rows={20}
                          className="w-full rounded-xl border border-slate-300 p-6 text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-none leading-relaxed shadow-inner"
                          value={formData.customPortariaText || generatePortariaText()}
                          onChange={(e) => setFormData(p => ({ ...p, customPortariaText: e.target.value }))}
                        />
                        <div className="flex justify-end">
                          <button 
                            onClick={() => setIsEditingPortaria(false)}
                            className="px-6 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 shadow-md transition-all active:scale-95"
                          >
                            Concluir Edição
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-slate-200 p-4 md:p-8 rounded-xl overflow-x-auto border border-slate-300 flex justify-center">
                        <div className="bg-white shadow-2xl p-[0.5cm] sm:p-[1cm] md:p-[2cm] w-full max-w-[210mm] min-h-[297mm] text-black font-nexa text-justify leading-relaxed text-xs md:text-sm">
                           {renderPortariaPreview(formData.customPortariaText || generatePortariaText())}
                        </div>
                      </div>
                    )}
                  </div>
                )}
             </div>
          </section>
        </fieldset>

      </div>
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        variant={confirmModal.variant}
      />
    </div>
  );
};

export default OpinionForm;
