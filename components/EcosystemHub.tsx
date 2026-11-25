import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Database,
  Eye,
  FileText,
  HardHat,
  Info,
  Link2,
  Loader2,
  Lock,
  Network,
  RefreshCw,
  Search,
  ShieldAlert,
  UserCheck,
  X,
} from 'lucide-react';
import { ParecerData, ProdutoEcossistemaResumo, SistemaOrigem, SolicitacaoVistoriaPrefill, TransferData } from '../types';
import { AuthContext } from '../src/contexts/AuthContext';
import { AppDocument, DataContext } from '../src/contexts/DataContext';
import { getEcosystemStatus } from '../src/lib/ecosystemClients';
import { normalizeCoordinateToGMS } from '../src/utils/coordinateUtils';
import { SolicitarVistoriaModal } from './SolicitarVistoriaModal';
import {
  AdministraCanonicalTable,
  AdministraReadError,
  AdministraRecord,
  AdministraRpcName,
  AdministraTableDiagnostic,
  BarragemWithRelations,
  checkAdministraCanonicalAccess,
  EmpreendedorWithRelations,
  fetchBarragensPage,
  fetchEmpreendedoresPage,
  fetchRtBarragensPage,
  fetchRtsPage,
  getEcosystemProductsByEntity,
  mapLocalDocToEcosystemSummary,
  RtWithRelations,
  VinculoRtBarragemWithRelations,
} from '../src/services/administraService';

type HubTab = 'empreendedores' | 'barragens' | 'rts' | 'vinculos' | 'produtos';

const TAB_TO_TABLE: Record<Exclude<HubTab, 'produtos'>, AdministraCanonicalTable> = {
  empreendedores: 'empreendedores',
  barragens: 'barragens',
  rts: 'rts',
  vinculos: 'responsaveis_tecnicos_barragens',
};

const TAB_TO_RPC: Record<Exclude<HubTab, 'produtos'>, AdministraRpcName> = {
  empreendedores: 'csb_ler_empreendedores',
  barragens: 'csb_ler_barragens',
  rts: 'csb_ler_rts',
  vinculos: 'csb_ler_vinculos_rt_barragem',
};

const systemBadgeClass = (sistema: SistemaOrigem) => {
  switch (sistema) {
    case 'CLASSIFICA_CSB':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'ADMINISTRA_BARRAGENS':
      return 'bg-slate-900 text-white border-slate-800';
    case 'NOTIFICA_CSB':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'FISCALIZA_BARRAGENS':
      return 'bg-blue-100 text-blue-800 border-blue-200';
  }
};

function pickField(row: AdministraRecord | null | undefined, patterns: RegExp[]): string | null {
  if (!row || typeof row !== 'object') return null;
  const keys = Object.keys(row);
  for (const rx of patterns) {
    const matchedKey = keys.find((k) => rx.test(k));
    if (matchedKey) {
      const val = row[matchedKey];
      if (val !== null && val !== undefined && String(val).trim() !== '') {
        return String(val);
      }
    }
  }
  return null;
}

function formatCellValue(val: any): string {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof val === 'boolean') return val ? 'Sim' : 'Não';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function getEmpreendedorLabel(emp: AdministraRecord | null | undefined): string {
  return (
    pickField(emp, [
      /^empreendedor_nome$/i,
      /^razao_social$/i,
      /^nome_razao$/i,
      /^nome_razao_social$/i,
      /^nome$/i,
      /^nome_empreendedor$/i,
      /^nome_completo$/i,
      /^nome_fantasia$/i,
      /^titulo$/i,
    ]) ||
    pickField(emp, [/^id$/i, /^empreendedor_id$/i, /^id_empreendedor$/i]) ||
    'Empreendedor sem nome'
  );
}

function getEmpreendedorDoc(emp: AdministraRecord | null | undefined): string | null {
  return pickField(emp, [/^cpf_cnpj$/i, /^cnpj_cpf$/i, /^documento$/i, /^cnpj$/i, /^cpf$/i]);
}

function getBarragemLabel(bar: AdministraRecord | null | undefined): string {
  return (
    pickField(bar, [
      /^barragem_nome$/i,
      /^nome_barragem$/i,
      /^nome$/i,
      /^barragem$/i,
      /^denominacao$/i,
      /^titulo$/i,
    ]) ||
    pickField(bar, [/^id$/i, /^barragem_id$/i, /^id_barragem$/i]) ||
    'Barragem sem nome'
  );
}

function getRtLabel(rt: AdministraRecord | null | undefined): string {
  return (
    pickField(rt, [
      /^rt_nome$/i,
      /^nome_rt$/i,
      /^nome$/i,
      /^nome_completo$/i,
      /^responsavel_tecnico$/i,
      /^razao_social$/i,
    ]) ||
    pickField(rt, [/^id$/i, /^rt_id$/i, /^id_rt$/i]) ||
    'Responsável Técnico'
  );
}

function getRtRegistro(rt: AdministraRecord | null | undefined): string | null {
  return pickField(rt, [
    /^registro_profissional$/i,
    /^crea$/i,
    /^registro$/i,
    /^conselho_registro$/i,
    /^numero_registro$/i,
    /^art$/i,
  ]);
}

function getSummaryEntries(
  row: AdministraRecord | null | undefined,
  max = 4,
  excludePatterns: RegExp[] = []
): Array<[string, string]> {
  if (!row || typeof row !== 'object') return [];
  const entries: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(row)) {
    if (k === 'id' || k.endsWith('_id') || k.startsWith('id_') || k === 'created_at' || k === 'updated_at') {
      continue;
    }
    if (excludePatterns.some((rx) => rx.test(k))) {
      continue;
    }
    if (v === null || v === undefined || String(v).trim() === '' || typeof v === 'object') {
      continue;
    }
    entries.push([k, formatCellValue(v)]);
    if (entries.length >= max) break;
  }
  return entries;
}

const COORD_EXCLUDE_PATTERNS: RegExp[] = [
  /^lat$/i,
  /^lat_gms$/i,
  /^lat_decimal$/i,
  /^latitude$/i,
  /^latitude_gms$/i,
  /^latitude_decimal$/i,
  /^long$/i,
  /^lng$/i,
  /^long_gms$/i,
  /^long_decimal$/i,
  /^longitude$/i,
  /^longitude_gms$/i,
  /^longitude_decimal$/i,
];

function getBarragemCoordinatesGMS(bar: AdministraRecord | null | undefined): {
  lat: string;
  long: string;
} {
  const rawLat = pickField(bar, [/^lat_gms$/i, /^latitude_gms$/i, /^latitude$/i, /^lat$/i]);
  const rawLatDec = pickField(bar, [/^lat_decimal$/i, /^latitude_decimal$/i]);
  const rawLong = pickField(bar, [/^long_gms$/i, /^longitude_gms$/i, /^longitude$/i, /^long$/i, /^lng$/i]);
  const rawLongDec = pickField(bar, [/^long_decimal$/i, /^longitude_decimal$/i]);

  return {
    lat: normalizeCoordinateToGMS(rawLat, rawLatDec),
    long: normalizeCoordinateToGMS(rawLong, rawLongDec),
  };
}

function normalizeMatchText(value?: string | null): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

interface DamClassificationInfo {
  enquadramento: string | null;
  categoria: string | null;
  cri: string | null;
  dpa: string | null;
  portaria: string | null;
  parecerNumero: string | null;
  fonte: string | null;
}

function findLocalDocumentsForDam(bar: AdministraRecord, documents: AppDocument[]): AppDocument[] {
  const barId = pickField(bar, [/^id$/i, /^barragem_id$/i, /^id_barragem$/i]);
  const barSnisb = normalizeMatchText(pickField(bar, [/^snisb$/i, /^codigo_snisb$/i]));
  const rawBarName = pickField(bar, [
    /^barragem_nome$/i,
    /^nome_barragem$/i,
    /^nome$/i,
    /^barragem$/i,
    /^denominacao$/i,
    /^titulo$/i,
  ]);
  const barNameNorm = normalizeMatchText(rawBarName);

  return documents.filter((doc) => {
    const anyDoc = doc as any;
    const docBarId = anyDoc.barragemId ? String(anyDoc.barragemId) : '';
    if (barId && docBarId && docBarId === barId) return true;

    const docSnisb = normalizeMatchText(anyDoc.barragemPrincipal?.snisb || anyDoc.snisb);
    if (barSnisb && docSnisb && docSnisb === barSnisb) return true;

    if (barNameNorm.length >= 3) {
      const candidates = [
        anyDoc.barragemPrincipal?.nome,
        anyDoc.nomeFazenda,
        anyDoc.empreendimento,
      ]
        .map((c) => normalizeMatchText(c))
        .filter(Boolean);
      if (candidates.includes(barNameNorm)) return true;
    }
    return false;
  });
}

function extractDamClassification(bar: AdministraRecord, localDocs: AppDocument[]): DamClassificationInfo {
  const criRaw = pickField(bar, [/^cri_atual$/i, /^cri$/i, /^categoria_risco$/i]);
  const dpaRaw = pickField(bar, [/^dpa_atual$/i, /^dpa$/i, /^dano_potencial$/i, /^dano_potencial_associado$/i]);
  const categoriaRaw = pickField(bar, [
    /^classe_enquadramento$/i,
    /^enquadramento_classe$/i,
    /^categoria$/i,
    /^classe$/i,
    /^classificacao$/i,
  ]);

  let enquadramento: string | null = null;
  const rawEnq = bar?.enquadramento_pnsb ?? bar?.enquadrada_pnsb ?? bar?.enquadramento ?? bar?.enquadrada;
  if (typeof rawEnq === 'boolean') {
    enquadramento = rawEnq ? 'Enquadrada na PNSB' : 'Não enquadrada na PNSB';
  } else if (rawEnq !== null && rawEnq !== undefined && String(rawEnq).trim() !== '') {
    const str = String(rawEnq).trim();
    if (/^(true|sim|s)$/i.test(str)) enquadramento = 'Enquadrada na PNSB';
    else if (/^(false|nao|não|n)$/i.test(str)) enquadramento = 'Não enquadrada na PNSB';
    else enquadramento = str;
  }

  let cri = criRaw;
  let dpa = dpaRaw;
  let categoria = categoriaRaw;
  let portaria: string | null = null;
  let parecerNumero: string | null = null;
  let fonte: string | null = criRaw || dpaRaw || categoriaRaw || enquadramento ? 'Administra Barragens' : null;

  const sortedDocs = [...localDocs].sort((a, b) => {
    const tA = new Date((a as any).data || a.created_at || 0).getTime();
    const tB = new Date((b as any).data || b.created_at || 0).getTime();
    return tB - tA;
  });

  const parecerDoc = sortedDocs.find((d) => d.tipo_documento === 'Parecer Técnico') as ParecerData | undefined;
  if (parecerDoc) {
    cri = cri || parecerDoc.classificacao?.risco || null;
    dpa = dpa || parecerDoc.classificacao?.dpaClass || null;
    categoria = categoria || parecerDoc.classificacao?.resumo || null;
    portaria = parecerDoc.portariaNumero || null;
    parecerNumero = parecerDoc.parecerTecnicoNumero || parecerDoc.protocolo || null;

    if (!enquadramento) {
      const dpaUpper = String(parecerDoc.classificacao?.dpaClass || '').toUpperCase();
      const altura = parseFloat(String(parecerDoc.barragemPrincipal?.alturaMaxima || '0').replace(',', '.')) || 0;
      const volume = parseFloat(String(parecerDoc.barragemPrincipal?.volumeNMO || '0').replace(',', '.')) || 0;
      const isPnsb = dpaUpper === 'MÉDIO' || dpaUpper === 'MEDIO' || dpaUpper === 'ALTO' || altura >= 15 || volume >= 3;
      enquadramento = isPnsb ? 'Enquadrada na PNSB' : 'Não enquadrada na PNSB';
    }
    fonte = fonte ? `${fonte} + Classifica CSB` : 'Classifica CSB (Parecer Técnico)';
  }

  const transferDoc = sortedDocs.find((d) => d.tipo_documento === 'Transferência de Titularidade') as TransferData | undefined;
  if (transferDoc) {
    cri = cri || transferDoc.cri || null;
    dpa = dpa || transferDoc.dpa || null;
    portaria = portaria || transferDoc.portariaNova || transferDoc.portariaNumero || null;
    parecerNumero = parecerNumero || transferDoc.parecerTecnico || null;
    fonte = fonte || 'Classifica CSB (Transferência)';
  }

  const noObligDoc = sortedDocs.find((d) => d.tipo_documento === 'Não Obrigatoriedade');
  if (noObligDoc && !enquadramento) {
    enquadramento = 'Não enquadrada na PNSB (Não Obrigatoriedade)';
    fonte = fonte || 'Classifica CSB (Não Obrigatoriedade)';
  }

  return {
    enquadramento,
    categoria,
    cri,
    dpa,
    portaria,
    parecerNumero,
    fonte,
  };
}

export const EcosystemHub: React.FC = () => {
  const { documents } = useContext(DataContext);

  const [activeTab, setActiveTab] = useState<HubTab>('empreendedores');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const [loading, setLoading] = useState(false);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [serverConfigured, setServerConfigured] = useState<boolean | null>(null);
  const [diagnostics, setDiagnostics] = useState<AdministraTableDiagnostic[]>([]);
  const [diagnosticsError, setDiagnosticsError] = useState<AdministraReadError | null>(null);
  const [activeError, setActiveError] = useState<AdministraReadError | null>(null);
  const [relationErrors, setRelationErrors] = useState<AdministraReadError[]>([]);

  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [empreendedores, setEmpreendedores] = useState<EmpreendedorWithRelations[]>([]);
  const [barragens, setBarragens] = useState<BarragemWithRelations[]>([]);
  const [rts, setRts] = useState<RtWithRelations[]>([]);
  const [vinculos, setVinculos] = useState<VinculoRtBarragemWithRelations[]>([]);

  const { currentUser } = useContext(AuthContext);
  const [vistoriaPrefill, setVistoriaPrefill] = useState<SolicitacaoVistoriaPrefill | null>(null);

  const [detailModal, setDetailModal] = useState<{
    open: boolean;
    title: string;
    subtitle?: string;
    primaryRecord: AdministraRecord | null;
    relations: Array<{ label: string; records: AdministraRecord[] }>;
    isDam?: boolean;
    damClassification?: DamClassificationInfo | null;
    damProducts?: ProdutoEcossistemaResumo[];
    damProductsLoading?: boolean;
  }>({
    open: false,
    title: '',
    primaryRecord: null,
    relations: [],
  });

  const openDamDetails = useCallback(
    (
      bar: AdministraRecord,
      relations: Array<{ label: string; records: AdministraRecord[] }>
    ) => {
      const barId = pickField(bar, [/^id$/i, /^barragem_id$/i, /^id_barragem$/i]);
      const barSnisb = pickField(bar, [/^snisb$/i, /^codigo_snisb$/i]);
      const localDocs = findLocalDocumentsForDam(bar, documents);
      const localSummaries = localDocs.map(mapLocalDocToEcosystemSummary);
      const classification = extractDamClassification(bar, localDocs);

      const inlineDocs: ProdutoEcossistemaResumo[] = [];
      const rawInline = Array.isArray(bar?.documentos)
        ? bar.documentos
        : Array.isArray(bar?.produtos)
        ? bar.produtos
        : [];
      for (let i = 0; i < rawInline.length; i++) {
        const d = rawInline[i];
        if (!d || typeof d !== 'object') continue;
        inlineDocs.push({
          id: String(d.id || `inline_${i}`),
          sistema_origem: (d.sistema_origem || 'ADMINISTRA_BARRAGENS') as SistemaOrigem,
          produto_origem_id: String(d.produto_origem_id || d.id || `inline_${i}`),
          tipo_produto: String(d.tipo_produto || d.tipo || d.tipo_documento || 'Documento'),
          numero_documento: d.numero_documento || d.protocolo || d.numero || null,
          status: d.status || null,
          data_documento: d.data_documento || d.data || d.created_at || null,
          analista_nome: d.analista_nome || d.analista || null,
          barragem_id: barId || null,
          barragem_nome: getBarragemLabel(bar),
        });
      }

      const mergeProducts = (base: ProdutoEcossistemaResumo[], incoming: ProdutoEcossistemaResumo[]) => {
        const map = new Map<string, ProdutoEcossistemaResumo>();
        for (const item of [...base, ...incoming]) {
          const key = `${item.sistema_origem}:${item.produto_origem_id || item.numero_documento || item.id}`;
          if (!map.has(key)) map.set(key, item);
        }
        return Array.from(map.values()).sort((a, b) => {
          const tA = new Date(a.data_documento || a.created_at || 0).getTime();
          const tB = new Date(b.data_documento || b.created_at || 0).getTime();
          return tB - tA;
        });
      };

      const initialProducts = mergeProducts(localSummaries, inlineDocs);

      setDetailModal({
        open: true,
        title: getBarragemLabel(bar),
        subtitle: 'RPC canônica: csb_ler_barragens',
        primaryRecord: bar,
        relations,
        isDam: true,
        damClassification: classification,
        damProducts: initialProducts,
        damProductsLoading: Boolean(barId || barSnisb),
      });

      if (barId || barSnisb) {
        void getEcosystemProductsByEntity({
          barragemId: barId || null,
          snisb: barSnisb || null,
          localDocuments: [],
        })
          .then(({ products }) => {
            setDetailModal((prev) => {
              if (!prev.open || prev.primaryRecord !== bar) return prev;
              return {
                ...prev,
                damProducts: mergeProducts(initialProducts, products),
                damProductsLoading: false,
              };
            });
          })
          .catch(() => {
            setDetailModal((prev) => {
              if (!prev.open || prev.primaryRecord !== bar) return prev;
              return { ...prev, damProductsLoading: false };
            });
          });
      }
    },
    [documents]
  );

  const ecosystemStatus = useMemo(() => {
    const base = getEcosystemStatus();
    return base.map((sys) =>
      sys.id === 'ADMINISTRA_BARRAGENS' && serverConfigured !== null
        ? { ...sys, configured: serverConfigured }
        : sys
    );
  }, [serverConfigured]);

  // Debounce da busca para consultar o Administra via endpoint server-side
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setDebouncedSearch(searchInput);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadDiagnostics = useCallback(async () => {
    setDiagnosticsLoading(true);
    setDiagnosticsError(null);
    try {
      const res = await checkAdministraCanonicalAccess();
      setServerConfigured(res.configured);
      setDiagnostics(res.diagnostics);
      setDiagnosticsError(res.error || null);
    } finally {
      setDiagnosticsLoading(false);
    }
  }, []);

  const loadActiveTabData = useCallback(async () => {
    if (activeTab === 'produtos') {
      setActiveError(null);
      setRelationErrors([]);
      return;
    }

    setLoading(true);
    setActiveError(null);
    setRelationErrors([]);

    try {
      if (activeTab === 'empreendedores') {
        const res = await fetchEmpreendedoresPage(page, pageSize, debouncedSearch);
        setServerConfigured((prev) => (res.configured ? true : prev === null ? false : prev));
        setEmpreendedores(res.data);
        setTotalCount(res.total);
        setHasMore(res.hasMore);
        setActiveError(res.error || null);
        setRelationErrors(res.relationErrors || []);
      } else if (activeTab === 'barragens') {
        const res = await fetchBarragensPage(page, pageSize, debouncedSearch);
        setServerConfigured((prev) => (res.configured ? true : prev === null ? false : prev));
        setBarragens(res.data);
        setTotalCount(res.total);
        setHasMore(res.hasMore);
        setActiveError(res.error || null);
        setRelationErrors(res.relationErrors || []);
      } else if (activeTab === 'rts') {
        const res = await fetchRtsPage(page, pageSize, debouncedSearch);
        setServerConfigured((prev) => (res.configured ? true : prev === null ? false : prev));
        setRts(res.data);
        setTotalCount(res.total);
        setHasMore(res.hasMore);
        setActiveError(res.error || null);
        setRelationErrors(res.relationErrors || []);
      } else if (activeTab === 'vinculos') {
        const res = await fetchRtBarragensPage(page, pageSize, debouncedSearch);
        setServerConfigured((prev) => (res.configured ? true : prev === null ? false : prev));
        setVinculos(res.data);
        setTotalCount(res.total);
        setHasMore(res.hasMore);
        setActiveError(res.error || null);
        setRelationErrors(res.relationErrors || []);
      }
    } finally {
      setLoading(false);
    }
  }, [activeTab, debouncedSearch, page, pageSize]);

  useEffect(() => {
    void loadDiagnostics();
  }, [loadDiagnostics]);

  useEffect(() => {
    void loadActiveTabData();
  }, [loadActiveTabData]);

  const handleRefreshAll = () => {
    void loadDiagnostics();
    void loadActiveTabData();
  };

  const handleTabChange = (tab: HubTab) => {
    setActiveTab(tab);
    setPage(1);
    setActiveError(null);
    setRelationErrors([]);
  };

  const localProductSummaries = useMemo<ProdutoEcossistemaResumo[]>(() => {
    const base = documents.map(mapLocalDocToEcosystemSummary);
    const term = searchInput.trim().toLowerCase();
    if (!term) return base;
    return base.filter(
      (p) =>
        (p.tipo_produto || '').toLowerCase().includes(term) ||
        (p.numero_documento || '').toLowerCase().includes(term) ||
        (p.empreendedor_nome || '').toLowerCase().includes(term) ||
        (p.empreendedor_cpf_cnpj || '').toLowerCase().includes(term) ||
        (p.municipio || '').toLowerCase().includes(term)
    );
  }, [documents, searchInput]);

  const currentItemsCount = useMemo(() => {
    if (activeTab === 'empreendedores') return empreendedores.length;
    if (activeTab === 'barragens') return barragens.length;
    if (activeTab === 'rts') return rts.length;
    if (activeTab === 'vinculos') return vinculos.length;
    return 0;
  }, [activeTab, barragens.length, empreendedores.length, rts.length, vinculos.length]);

  const totalPages = typeof totalCount === 'number' ? Math.max(1, Math.ceil(totalCount / pageSize)) : null;
  const canGoNext = totalPages !== null ? page < totalPages : hasMore;
  const blockedTables = useMemo(
    () => diagnostics.filter((d) => !d.accessible && d.error?.isRlsOrPermission),
    [diagnostics]
  );

  const countBadgeForTable = (table: AdministraCanonicalTable): string => {
    const diag = diagnostics.find((d) => d.table === table);
    if (!diag) return '';
    if (diag.accessible && typeof diag.totalCount === 'number') return ` (${diag.totalCount})`;
    if (!diag.accessible && diag.error?.isRlsOrPermission) return ' (Bloq.)';
    return '';
  };

  const fromIdx = currentItemsCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const toIdx = currentItemsCount === 0 ? 0 : (page - 1) * pageSize + currentItemsCount;

  return (
    <div className="p-6 md:p-10 max-w-[1600px] mx-auto w-full space-y-6 animate-fade-in">
      {/* Cabeçalho */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 flex items-center gap-3 tracking-tight">
            <Network className="text-emerald-600" size={32} />
            Ecossistema CSB & Administra Barragens
          </h2>
          <p className="text-slate-500 mt-1 text-sm font-medium">
            Consulta somente leitura às tabelas canônicas do Administra Barragens (empreendedores, barragens, RTs e vínculos RT–barragem).
          </p>
        </div>
        <button
          onClick={handleRefreshAll}
          disabled={loading || diagnosticsLoading}
          className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 flex items-center gap-2 hover:bg-slate-50 shadow-sm self-start disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading || diagnosticsLoading ? 'animate-spin' : ''} />
          Atualizar Consulta
        </button>
      </div>

      {/* Painel de Conectividade dos 4 Sistemas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {ecosystemStatus.map((sys) => (
          <div
            key={sys.id}
            className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between gap-3"
          >
            <div className="flex items-start justify-between gap-2">
              <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase border ${systemBadgeClass(sys.id)}`}>
                {sys.nome}
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  sys.configured
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}
              >
                {sys.configured ? 'Configurado' : 'Aguardando chaves'}
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">{sys.papel}</p>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Lock size={11} />
              {sys.id === 'ADMINISTRA_BARRAGENS'
                ? 'Somente leitura via endpoint server-side'
                : sys.readOnlyFromClassifica
                ? 'Somente leitura'
                : 'Base local do Classifica CSB'}
            </div>
          </div>
        ))}
      </div>

      {/* Diagnóstico das 4 RPCs canônicas no Administra via /api/administra-leitura */}
      {serverConfigured === false && diagnosticsError ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-4">
          <Info className="text-amber-600 shrink-0 mt-0.5" size={20} />
          <div className="text-sm text-amber-900 space-y-1">
            <p className="font-bold">Leitura canônica server-side do Administra Barragens indisponível</p>
            <p className="text-xs text-amber-800 leading-relaxed">{diagnosticsError.userMessage}</p>
            <p className="text-xs text-amber-800 leading-relaxed">
              No servidor (sem prefixo <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">VITE_</code>), defina{' '}
              <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">ADMINISTRA_SUPABASE_URL</code>,{' '}
              <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">ADMINISTRA_SUPABASE_SERVICE_ROLE_KEY</code>,{' '}
              <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">SUPABASE_URL</code> e{' '}
              <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">SUPABASE_ANON_KEY</code>.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-700">
              <Database size={15} className="text-emerald-600" />
              Status de Leitura Canônica (RPCs) — Administra Barragens
            </div>
            {diagnosticsLoading && (
              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                <Loader2 size={13} className="animate-spin" /> Validando sessão e RPCs...
              </span>
            )}
          </div>
          {diagnosticsError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-800">
              {diagnosticsError.userMessage}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {diagnostics.map((d) => (
              <div
                key={d.rpc}
                className={`rounded-xl border p-3 text-xs ${
                  d.accessible
                    ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
                    : 'bg-red-50/60 border-red-200 text-red-900'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <code className="font-mono font-bold text-[11px] truncate">{d.rpc}</code>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase shrink-0 ${
                      d.accessible ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {d.accessible
                      ? typeof d.totalCount === 'number'
                        ? `${d.totalCount} reg.`
                        : d.hasRecords
                        ? 'Ativa'
                        : '0 reg.'
                      : d.error?.code || 'Bloqueada'}
                  </span>
                </div>
                <div className="text-[10px] font-mono text-slate-500 mt-1">public.{d.table}</div>
                {!d.accessible && d.error && (
                  <p className="mt-1.5 text-[11px] text-red-700 leading-snug">{d.error.userMessage}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alerta explícito quando autenticação/permissão bloqueia RPCs do Administra */}
      {blockedTables.length > 0 && !diagnosticsError && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-start gap-3">
          <ShieldAlert className="text-red-600 shrink-0 mt-0.5" size={22} />
          <div className="space-y-1.5 text-xs text-red-900">
            <p className="font-black text-sm">
              Leitura bloqueada nas RPCs canônicas do Administra Barragens
            </p>
            <p className="text-red-800">
              A chamada autenticada via endpoint server-side recebeu recusa de permissão/autenticação nas seguintes RPCs:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-red-800">
              {blockedTables.map((b) => (
                <li key={b.rpc}>
                  <code className="font-mono font-bold">{b.rpc}</code> — {b.error?.userMessage}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Abas */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        {[
          {
            id: 'empreendedores' as HubTab,
            label: `Empreendedores${countBadgeForTable('empreendedores')}`,
            icon: <UserCheck size={16} />,
          },
          {
            id: 'barragens' as HubTab,
            label: `Barragens${countBadgeForTable('barragens')}`,
            icon: <Building2 size={16} />,
          },
          {
            id: 'rts' as HubTab,
            label: `Responsáveis Técnicos${countBadgeForTable('rts')}`,
            icon: <HardHat size={16} />,
          },
          {
            id: 'vinculos' as HubTab,
            label: `Vínculos RT–Barragem${countBadgeForTable('responsaveis_tecnicos_barragens')}`,
            icon: <Link2 size={16} />,
          },
          {
            id: 'produtos' as HubTab,
            label: `Produtos Classifica (${documents.length})`,
            icon: <FileText size={16} />,
          },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => handleTabChange(t.id)}
            className={`px-4 py-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === t.id
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Barra de busca (consulta no servidor do Administra) e tamanho da página */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
        <div className="relative flex-1 max-w-lg">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder={
              activeTab === 'produtos'
                ? 'Filtrar produtos locais do Classifica...'
                : `Buscar no Administra (${TAB_TO_RPC[activeTab]})...`
            }
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                setDebouncedSearch('');
                setPage(1);
              }}
              aria-label="Limpar busca"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {activeTab !== 'produtos' && (
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span className="font-semibold">Itens por página:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {[10, 15, 25, 50].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Erros parciais ao resolver relações */}
      {activeTab !== 'produtos' && !activeError && relationErrors.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-xs text-amber-900">
          <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={18} />
          <div className="space-y-1">
            <p className="font-bold">Algumas relações não puderam ser carregadas:</p>
            {relationErrors.map((err, idx) => (
              <p key={`${err.table}-${idx}`}>{err.userMessage}</p>
            ))}
          </div>
        </div>
      )}

      {/* Conteúdo Principal */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {activeTab !== 'produtos' && loading ? (
          <div className="py-16 text-center text-slate-500 space-y-3">
            <Loader2 className="animate-spin mx-auto text-emerald-600" size={32} />
            <p className="text-sm font-semibold">
              Consultando <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">{TAB_TO_RPC[activeTab]}</code> no Administra Barragens...
            </p>
          </div>
        ) : activeTab !== 'produtos' && activeError ? (
          <div className="p-8 text-center space-y-3">
            <ShieldAlert className="mx-auto text-red-500" size={36} />
            <h3 className="text-base font-black text-slate-900">
              {activeError.isRlsOrPermission
                ? `Acesso bloqueado ao consultar ${activeError.rpc || TAB_TO_RPC[activeTab]}`
                : `Erro ao consultar ${activeError.rpc || TAB_TO_RPC[activeTab]}`}
            </h3>
            <p className="text-sm text-red-700 max-w-2xl mx-auto">{activeError.userMessage}</p>
            {(activeError.details || activeError.hint) && (
              <p className="text-xs text-slate-500 max-w-2xl mx-auto">
                {[activeError.details, activeError.hint].filter(Boolean).join(' • ')}
              </p>
            )}
            <div className="pt-2">
              <button
                onClick={handleRefreshAll}
                className="px-4 py-2 text-xs font-bold bg-slate-900 text-white rounded-xl hover:bg-slate-800"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'empreendedores' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[820px]">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                      <th className="px-5 py-4 border-b">Empreendedor</th>
                      <th className="px-5 py-4 border-b">Documento / Dados</th>
                      <th className="px-5 py-4 border-b">Barragens Vinculadas</th>
                      <th className="px-5 py-4 border-b text-right">Detalhes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {empreendedores.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                          {serverConfigured === false
                            ? 'Configure as variáveis server-side do Administra Barragens para consultar empreendedores.'
                            : debouncedSearch
                            ? `Nenhum empreendedor encontrado no Administra para "${debouncedSearch}".`
                            : 'Nenhum empreendedor retornado pela RPC csb_ler_empreendedores.'}
                        </td>
                      </tr>
                    ) : (
                      empreendedores.map((item, idx) => {
                        const emp = item.record;
                        const empId = pickField(emp, [/^id$/i, /^empreendedor_id$/i, /^id_empreendedor$/i]);
                        const doc = getEmpreendedorDoc(emp);
                        const summary = getSummaryEntries(emp, 4, [
                          /^empreendedor_nome$/i,
                          /^razao_social$/i,
                          /^nome_razao$/i,
                          /^nome_razao_social$/i,
                          /^nome$/i,
                          /^nome_empreendedor$/i,
                          /^cpf_cnpj$/i,
                          /^cnpj_cpf$/i,
                          /^documento$/i,
                          /^cnpj$/i,
                          /^cpf$/i,
                        ]);
                        return (
                          <tr key={empId || String(idx)} className="hover:bg-slate-50/70 align-top">
                            <td className="px-5 py-4">
                              <div className="font-bold text-slate-800">{getEmpreendedorLabel(emp)}</div>
                              {empId && <div className="text-[11px] font-mono text-slate-400 mt-0.5">{empId}</div>}
                            </td>
                            <td className="px-5 py-4 text-xs text-slate-600 space-y-1">
                              {doc && <div className="font-mono font-bold text-slate-800">{doc}</div>}
                              {summary.map(([k, v]) => (
                                <div key={k} className="truncate max-w-xs">
                                  <span className="text-slate-400">{k}:</span> {v}
                                </div>
                              ))}
                            </td>
                            <td className="px-5 py-4 text-xs">
                              {item.barragens.length === 0 ? (
                                <span className="text-slate-400">Nenhuma barragem vinculada</span>
                              ) : (
                                <div className="flex flex-wrap gap-1.5">
                                  {item.barragens.map((bar, bIdx) => (
                                    <button
                                      type="button"
                                      key={pickField(bar, [/^id$/i, /^barragem_id$/i, /^id_barragem$/i]) || String(bIdx)}
                                      onClick={() =>
                                        openDamDetails(bar, [
                                          { label: 'Empreendedor vinculado (csb_ler_empreendedores)', records: [emp] },
                                        ])
                                      }
                                      className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold text-left transition-colors"
                                    >
                                      {getBarragemLabel(bar)}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="px-5 py-4 text-right">
                              <button
                                onClick={() =>
                                  setDetailModal({
                                    open: true,
                                    title: getEmpreendedorLabel(emp),
                                    subtitle: 'RPC canônica: csb_ler_empreendedores',
                                    primaryRecord: emp,
                                    relations: [
                                      { label: `Barragens vinculadas (${item.barragens.length})`, records: item.barragens },
                                    ],
                                  })
                                }
                                className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1"
                              >
                                <Eye size={13} /> Detalhes
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'barragens' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[880px]">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                      <th className="px-5 py-4 border-b">Barragem</th>
                      <th className="px-5 py-4 border-b">Atributos</th>
                      <th className="px-5 py-4 border-b">Empreendedor</th>
                      <th className="px-5 py-4 border-b">RTs Vinculados (RT–Barragem)</th>
                      <th className="px-5 py-4 border-b text-right">Detalhes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {barragens.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                          {serverConfigured === false
                            ? 'Configure as variáveis server-side do Administra Barragens para consultar barragens.'
                            : debouncedSearch
                            ? `Nenhuma barragem encontrada no Administra para "${debouncedSearch}".`
                            : 'Nenhuma barragem retornada pela RPC csb_ler_barragens.'}
                        </td>
                      </tr>
                    ) : (
                      barragens.map((item, idx) => {
                        const bar = item.record;
                        const barId = pickField(bar, [/^id$/i, /^barragem_id$/i, /^id_barragem$/i]);
                        const summary = getSummaryEntries(bar, 3, COORD_EXCLUDE_PATTERNS);
                        const coords = getBarragemCoordinatesGMS(bar);
                        return (
                          <tr key={barId || String(idx)} className="hover:bg-slate-50/70 align-top">
                            <td className="px-5 py-4">
                              <div className="font-bold text-slate-800">{getBarragemLabel(bar)}</div>
                              {barId && <div className="text-[11px] font-mono text-slate-400 mt-0.5">{barId}</div>}
                            </td>
                            <td className="px-5 py-4 text-xs text-slate-600 space-y-1 max-w-xs break-words">
                              {summary.map(([k, v]) => (
                                <div key={k} className="break-words">
                                  <span className="text-slate-400">{k}:</span> {v}
                                </div>
                              ))}
                              <div className="break-words font-mono text-slate-700">
                                <span className="font-sans text-slate-400">LAT:</span> {coords.lat || '—'}
                              </div>
                              <div className="break-words font-mono text-slate-700">
                                <span className="font-sans text-slate-400">LONG:</span> {coords.long || '—'}
                              </div>
                            </td>
                            <td className="px-5 py-4 text-xs">
                              {item.empreendedor ? (
                                <div>
                                  <div className="font-bold text-slate-800">{getEmpreendedorLabel(item.empreendedor)}</div>
                                  {getEmpreendedorDoc(item.empreendedor) && (
                                    <div className="font-mono text-slate-500">{getEmpreendedorDoc(item.empreendedor)}</div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400">Não vinculado</span>
                              )}
                            </td>
                            <td className="px-5 py-4 text-xs">
                              {item.vinculosRt.length === 0 ? (
                                <span className="text-slate-400">Sem RT vinculado</span>
                              ) : (
                                <div className="flex flex-wrap gap-1.5">
                                  {item.vinculosRt.map((v, vIdx) => (
                                    <span
                                      key={String(v.vinculo.id ?? vIdx)}
                                      className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 border border-blue-200 font-semibold"
                                    >
                                      {v.rt ? getRtLabel(v.rt) : `Vínculo #${vIdx + 1}`}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="px-5 py-4 text-right">
                              <button
                                onClick={() =>
                                  openDamDetails(bar, [
                                    ...(item.empreendedor
                                      ? [{ label: 'Empreendedor vinculado (csb_ler_empreendedores)', records: [item.empreendedor] }]
                                      : []),
                                    {
                                      label: `Vínculos RT–Barragem (${item.vinculosRt.length})`,
                                      records: item.vinculosRt.map((v) => v.vinculo),
                                    },
                                    {
                                      label: 'Responsáveis Técnicos vinculados (csb_ler_rts)',
                                      records: item.vinculosRt
                                        .map((v) => v.rt)
                                        .filter((rt): rt is AdministraRecord => Boolean(rt)),
                                    },
                                  ])
                                }
                                className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1"
                              >
                                <Eye size={13} /> Detalhes
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'rts' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[820px]">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                      <th className="px-5 py-4 border-b">Responsável Técnico (RT)</th>
                      <th className="px-5 py-4 border-b">Registro / Dados</th>
                      <th className="px-5 py-4 border-b">Barragens Vinculadas</th>
                      <th className="px-5 py-4 border-b text-right">Detalhes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {rts.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                          {serverConfigured === false
                            ? 'Configure as variáveis server-side do Administra Barragens para consultar RTs.'
                            : debouncedSearch
                            ? `Nenhum RT encontrado no Administra para "${debouncedSearch}".`
                            : 'Nenhum RT retornado pela RPC csb_ler_rts.'}
                        </td>
                      </tr>
                    ) : (
                      rts.map((item, idx) => {
                        const rt = item.record;
                        const rtId = pickField(rt, [/^id$/i, /^rt_id$/i, /^id_rt$/i]);
                        const reg = getRtRegistro(rt);
                        const summary = getSummaryEntries(rt, 3);
                        return (
                          <tr key={rtId || String(idx)} className="hover:bg-slate-50/70 align-top">
                            <td className="px-5 py-4">
                              <div className="font-bold text-slate-800">{getRtLabel(rt)}</div>
                              {rtId && <div className="text-[11px] font-mono text-slate-400 mt-0.5">{rtId}</div>}
                            </td>
                            <td className="px-5 py-4 text-xs text-slate-600 space-y-1">
                              {reg && <div className="font-mono font-bold text-slate-800">{reg}</div>}
                              {summary.map(([k, v]) => (
                                <div key={k} className="truncate max-w-xs">
                                  <span className="text-slate-400">{k}:</span> {v}
                                </div>
                              ))}
                            </td>
                            <td className="px-5 py-4 text-xs">
                              {item.vinculosBarragem.length === 0 ? (
                                <span className="text-slate-400">Nenhuma barragem vinculada</span>
                              ) : (
                                <div className="flex flex-wrap gap-1.5">
                                  {item.vinculosBarragem.map((v, vIdx) => (
                                    <span
                                      key={String(v.vinculo.id ?? vIdx)}
                                      className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold"
                                    >
                                      {v.barragem ? getBarragemLabel(v.barragem) : `Vínculo #${vIdx + 1}`}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="px-5 py-4 text-right">
                              <button
                                onClick={() =>
                                  setDetailModal({
                                    open: true,
                                    title: getRtLabel(rt),
                                    subtitle: 'RPC canônica: csb_ler_rts',
                                    primaryRecord: rt,
                                    relations: [
                                      {
                                        label: `Vínculos RT–Barragem (${item.vinculosBarragem.length})`,
                                        records: item.vinculosBarragem.map((v) => v.vinculo),
                                      },
                                      {
                                        label: 'Barragens vinculadas (csb_ler_barragens)',
                                        records: item.vinculosBarragem
                                          .map((v) => v.barragem)
                                          .filter((b): b is AdministraRecord => Boolean(b)),
                                      },
                                    ],
                                  })
                                }
                                className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1"
                              >
                                <Eye size={13} /> Detalhes
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'vinculos' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[880px]">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                      <th className="px-5 py-4 border-b">Responsável Técnico (RT)</th>
                      <th className="px-5 py-4 border-b">Barragem</th>
                      <th className="px-5 py-4 border-b">Empreendedor</th>
                      <th className="px-5 py-4 border-b">Dados do Vínculo</th>
                      <th className="px-5 py-4 border-b text-right">Detalhes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {vinculos.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                          {serverConfigured === false
                            ? 'Configure as variáveis server-side do Administra Barragens para consultar vínculos RT–Barragem.'
                            : debouncedSearch
                            ? `Nenhum vínculo RT–barragem encontrado no Administra para "${debouncedSearch}".`
                            : 'Nenhum vínculo retornado pela RPC csb_ler_vinculos_rt_barragem.'}
                        </td>
                      </tr>
                    ) : (
                      vinculos.map((item, idx) => {
                        const summary = getSummaryEntries(item.vinculo, 3);
                        return (
                          <tr key={String(item.vinculo.id ?? idx)} className="hover:bg-slate-50/70 align-top">
                            <td className="px-5 py-4">
                              {item.rt ? (
                                <>
                                  <div className="font-bold text-slate-800">{getRtLabel(item.rt)}</div>
                                  {getRtRegistro(item.rt) && (
                                    <div className="text-xs font-mono text-slate-500">{getRtRegistro(item.rt)}</div>
                                  )}
                                </>
                              ) : (
                                <span className="text-xs text-slate-400">RT não resolvido</span>
                              )}
                            </td>
                            <td className="px-5 py-4">
                              {item.barragem ? (
                                <div className="font-bold text-slate-800">{getBarragemLabel(item.barragem)}</div>
                              ) : (
                                <span className="text-xs text-slate-400">Barragem não resolvida</span>
                              )}
                            </td>
                            <td className="px-5 py-4 text-xs text-slate-600">
                              {item.empreendedor ? (
                                <div>
                                  <div className="font-semibold text-slate-800">{getEmpreendedorLabel(item.empreendedor)}</div>
                                  {getEmpreendedorDoc(item.empreendedor) && (
                                    <div className="font-mono text-slate-500">{getEmpreendedorDoc(item.empreendedor)}</div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="px-5 py-4 text-xs text-slate-600 space-y-1">
                              {summary.length === 0 ? (
                                <span className="text-slate-400">Vínculo direto</span>
                              ) : (
                                summary.map(([k, v]) => (
                                  <div key={k} className="truncate max-w-xs">
                                    <span className="text-slate-400">{k}:</span> {v}
                                  </div>
                                ))
                              )}
                            </td>
                            <td className="px-5 py-4 text-right">
                              <button
                                onClick={() =>
                                  setDetailModal({
                                    open: true,
                                    title: 'Vínculo RT–Barragem',
                                    subtitle: 'RPC canônica: csb_ler_vinculos_rt_barragem',
                                    primaryRecord: item.vinculo,
                                    relations: [
                                      ...(item.rt ? [{ label: 'Responsável Técnico (csb_ler_rts)', records: [item.rt] }] : []),
                                      ...(item.barragem ? [{ label: 'Barragem (csb_ler_barragens)', records: [item.barragem] }] : []),
                                      ...(item.empreendedor
                                        ? [{ label: 'Empreendedor (csb_ler_empreendedores)', records: [item.empreendedor] }]
                                        : []),
                                    ],
                                  })
                                }
                                className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1"
                              >
                                <Eye size={13} /> Detalhes
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'produtos' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                      <th className="px-5 py-4 border-b">Produto (Classifica CSB)</th>
                      <th className="px-5 py-4 border-b">Protocolo / Processo</th>
                      <th className="px-5 py-4 border-b">Empreendedor</th>
                      <th className="px-5 py-4 border-b">Município</th>
                      <th className="px-5 py-4 border-b">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {localProductSummaries.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                          Nenhum produto local encontrado no Classifica CSB.
                        </td>
                      </tr>
                    ) : (
                      localProductSummaries.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/70">
                          <td className="px-5 py-4 font-bold text-slate-800">{p.tipo_produto}</td>
                          <td className="px-5 py-4 font-mono text-xs text-slate-700">{p.numero_documento || '—'}</td>
                          <td className="px-5 py-4 text-xs text-slate-600">
                            <div className="font-semibold text-slate-800">{p.empreendedor_nome || '—'}</div>
                            {p.empreendedor_cpf_cnpj && <div className="font-mono">{p.empreendedor_cpf_cnpj}</div>}
                          </td>
                          <td className="px-5 py-4 text-xs text-slate-600">{p.municipio || '—'}</td>
                          <td className="px-5 py-4">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                              {p.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Rodapé de paginação para abas do Administra */}
        {activeTab !== 'produtos' && serverConfigured !== false && !activeError && (
          <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
            <div>
              Mostrando <strong className="text-slate-900">{fromIdx}</strong>–<strong className="text-slate-900">{toIdx}</strong>
              {typeof totalCount === 'number' ? (
                <>
                  {' '}
                  de <strong className="text-slate-900">{totalCount}</strong> registro(s)
                </>
              ) : (
                ' registro(s)'
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={loading || page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 flex items-center gap-1"
              >
                <ChevronLeft size={14} /> Anterior
              </button>
              <span className="px-2 font-bold text-slate-700">
                Página {page}
                {totalPages !== null ? ` de ${totalPages}` : ''}
              </span>
              <button
                type="button"
                disabled={loading || !canGoNext}
                onClick={() => setPage((p) => (totalPages !== null ? Math.min(totalPages, p + 1) : p + 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 flex items-center gap-1"
              >
                Próxima <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Inspeção Somente Leitura */}
      {detailModal.open && detailModal.primaryRecord && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">{detailModal.title}</h3>
                {detailModal.subtitle && <p className="text-xs text-slate-500 font-mono mt-0.5">{detailModal.subtitle}</p>}
              </div>
              <div className="flex items-center gap-2">
                {detailModal.isDam && currentUser?.role !== 'Visualizador' && (
                  <button
                    type="button"
                    onClick={() => {
                      const bar = detailModal.primaryRecord!;
                      const coords = getBarragemCoordinatesGMS(bar);
                      const coordStr = [coords.lat, coords.long].filter(Boolean).join(' / ') || null;
                      const empRel = detailModal.relations.find((r) => /empreendedor/i.test(r.label))?.records?.[0];
                      const empId =
                        pickField(bar, [/^empreendedor_id$/i, /^id_empreendedor$/i]) ||
                        (empRel ? pickField(empRel, [/^id$/i, /^empreendedor_id$/i, /^id_empreendedor$/i]) : null);
                      const empName =
                        (empRel ? getEmpreendedorLabel(empRel) : null) ||
                        pickField(bar, [/^empreendedor_nome$/i, /^razao_social$/i, /^empreendedor$/i]);

                      setVistoriaPrefill({
                        origem_ref_id:
                          detailModal.damProducts?.find((prod) => prod.id)?.id || null,
                        barragem_id: pickField(bar, [/^id$/i, /^barragem_id$/i, /^id_barragem$/i]),
                        barragem_nome: getBarragemLabel(bar),
                        municipio: pickField(bar, [/^municipio$/i, /^cidade$/i]),
                        curso_agua: pickField(bar, [/^curso_agua$/i, /^curso_d_agua$/i, /^rio$/i, /^hidrografia$/i]),
                        coordenadas: coordStr,
                        uso: pickField(bar, [/^uso$/i, /^finalidade$/i, /^uso_principal$/i]),
                        empreendedor_id: empId,
                        empreendedor_nome: empName,
                        processo:
                          pickField(bar, [/^processo$/i, /^protocolo$/i, /^numero_processo$/i]) ||
                          detailModal.damProducts?.find((prod) => prod.numero_documento)?.numero_documento ||
                          null,
                        classificacao_atual: detailModal.damClassification?.categoria || null,
                        dpa: detailModal.damClassification?.dpa || null,
                        cri: detailModal.damClassification?.cri || null,
                      });
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition-colors shadow-sm"
                  >
                    <ClipboardCheck size={14} /> Solicitar vistoria
                  </button>
                )}
                <button
                  onClick={() => setDetailModal((prev) => ({ ...prev, open: false }))}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {detailModal.isDam && (
              <div className="space-y-4">
                {/* Classificação e Enquadramento */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-700">
                      Classificação e Enquadramento
                    </p>
                    {detailModal.damClassification?.fonte && (
                      <span className="text-[10px] font-bold text-slate-500">
                        Fonte: {detailModal.damClassification.fonte}
                      </span>
                    )}
                  </div>
                  {detailModal.damClassification &&
                  (detailModal.damClassification.enquadramento ||
                    detailModal.damClassification.categoria ||
                    detailModal.damClassification.cri ||
                    detailModal.damClassification.dpa ||
                    detailModal.damClassification.portaria ||
                    detailModal.damClassification.parecerNumero) ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                      <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                        <span className="block text-[10px] font-bold uppercase text-slate-400">Enquadramento PNSB</span>
                        <span className="font-bold text-slate-800">
                          {detailModal.damClassification.enquadramento || 'Não informado'}
                        </span>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                        <span className="block text-[10px] font-bold uppercase text-slate-400">Categoria / Classe</span>
                        <span className="font-bold text-slate-800">
                          {detailModal.damClassification.categoria || '—'}
                        </span>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                        <span className="block text-[10px] font-bold uppercase text-slate-400">CRI (Risco)</span>
                        <span className="font-bold text-slate-800">
                          {detailModal.damClassification.cri || '—'}
                        </span>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                        <span className="block text-[10px] font-bold uppercase text-slate-400">DPA (Dano Potencial)</span>
                        <span className="font-bold text-slate-800">
                          {detailModal.damClassification.dpa || '—'}
                        </span>
                      </div>
                      {(detailModal.damClassification.parecerNumero || detailModal.damClassification.portaria) && (
                        <div className="sm:col-span-2 lg:col-span-4 bg-white border border-slate-200 rounded-lg p-2.5 flex flex-wrap gap-4">
                          {detailModal.damClassification.parecerNumero && (
                            <div>
                              <span className="text-[10px] font-bold uppercase text-slate-400 mr-1.5">Parecer Técnico:</span>
                              <span className="font-mono font-bold text-slate-800">{detailModal.damClassification.parecerNumero}</span>
                            </div>
                          )}
                          {detailModal.damClassification.portaria && (
                            <div>
                              <span className="text-[10px] font-bold uppercase text-slate-400 mr-1.5">Portaria:</span>
                              <span className="font-mono font-bold text-slate-800">{detailModal.damClassification.portaria}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Sem classificação de enquadramento registrada para esta barragem.
                    </p>
                  )}
                </div>

                {/* Documentos vinculados à barragem */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <FileText size={14} className="text-emerald-600" />
                      Documentos sobre esta Barragem ({detailModal.damProducts?.length || 0})
                    </p>
                    {detailModal.damProductsLoading && (
                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Loader2 size={12} className="animate-spin" /> Buscando no ecossistema...
                      </span>
                    )}
                  </div>
                  {!detailModal.damProducts || detailModal.damProducts.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      Nenhum documento localizado para esta barragem (parecer de classificação, ofício, notificação, etc.).
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {detailModal.damProducts.map((prod) => (
                        <div
                          key={prod.id}
                          className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                        >
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase border ${systemBadgeClass(prod.sistema_origem)}`}>
                                {prod.sistema_origem.replace(/_/g, ' ')}
                              </span>
                              <span className="font-bold text-slate-800">{prod.tipo_produto}</span>
                              {prod.numero_documento && (
                                <span className="font-mono text-[11px] bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-700">
                                  {prod.numero_documento}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 flex flex-wrap gap-3">
                              {prod.analista_nome && <span>Analista: {prod.analista_nome}</span>}
                              {prod.data_documento && (
                                <span>Data: {new Date(prod.data_documento).toLocaleDateString('pt-BR')}</span>
                              )}
                            </div>
                          </div>
                          {prod.status && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white border border-slate-200 text-slate-700 self-start sm:self-center">
                              {prod.status}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-black uppercase tracking-wider text-slate-500">Campos reais retornados</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {Object.entries(detailModal.primaryRecord).map(([key, val]) => (
                  <div key={key} className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs">
                    <span className="block font-mono text-[10px] font-bold text-slate-400">{key}</span>
                    <span className="font-medium text-slate-800 break-words">{formatCellValue(val)}</span>
                  </div>
                ))}
              </div>
            </div>

            {detailModal.relations.map((rel, rIdx) => (
              <div key={rIdx} className="space-y-2">
                <p className="text-xs font-black uppercase tracking-wider text-emerald-700">{rel.label}</p>
                {rel.records.length === 0 ? (
                  <p className="text-xs text-slate-400">Nenhum registro relacionado.</p>
                ) : (
                  <div className="space-y-2">
                    {rel.records.map((rec, recIdx) => (
                      <div key={String(rec.id ?? recIdx)} className="bg-emerald-50/40 border border-emerald-200 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {Object.entries(rec).map(([k, v]) => (
                          <div key={k}>
                            <span className="block font-mono text-[10px] font-bold text-emerald-700/70">{k}</span>
                            <span className="text-slate-800 break-words">{formatCellValue(v)}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <SolicitarVistoriaModal
        isOpen={Boolean(vistoriaPrefill)}
        onClose={() => setVistoriaPrefill(null)}
        prefill={vistoriaPrefill}
      />
    </div>
  );
};
