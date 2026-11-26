import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Database,
  FileCheck2,
  Loader2,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
  UserCheck,
  UserPlus,
  Waves,
  X,
} from 'lucide-react';
import {
  BarragemMaster,
  EmpreendedorMaster,
  ProdutoEcossistemaResumo,
  ResponsavelTecnicoEntry,
  ResponsavelTecnicoMaster,
} from '../types';
import {
  checkAdministraCanonicalAccess,
  createResponsavelTecnicoInAdministra,
  getEcosystemProductsByEntity,
  listArtsForRt,
  RtArtVinculo,
  saveArtForRt,
  searchBarragens,
  searchEmpreendedores,
  searchResponsaveisTecnicos,
  SYSTEM_LABELS,
} from '../src/services/administraService';
import { isAdministraConfigured } from '../src/lib/ecosystemClients';
import { CLASSIFICA_INTEGRATION_ARCHITECTURE } from '../src/config/integrationArchitecture';
import { DataContext } from '../src/contexts/DataContext';
import { AuthContext } from '../src/contexts/AuthContext';
import {
  applyPaginatedPageResult,
  createInitialPaginatedState,
  formatPaginationCounterText,
  getAdministraBarragemFilterCapabilities,
  mergeUniqueById,
  PaginatedEntityState,
  preserveSelectedItemInList,
  resetPaginatedSearchState,
} from '../src/utils/administraPagination';

export type ResponsavelTecnicoSearchItem = ResponsavelTecnicoMaster & {
  art?: string | null;
  arts?: RtArtVinculo[];
};

const PAGE_SIZE = 25;

interface EcosystemSelectorProps {
  selectedEmpreendedorId?: string;
  selectedBarragemId?: string;
  selectedBarragemNome?: string;
  cpfCnpjFallback?: string;
  snisbFallback?: string;
  linkedRTs?: ResponsavelTecnicoEntry[];
  onRemoveRT?: (id: string) => void;
  onRegisterLinkedRT?: (entryId: string, rtId: string, art?: string) => void;
  onSelectEmpreendedor?: (emp: EmpreendedorMaster) => void;
  onSelectBarragem?: (bar: BarragemMaster) => void;
  onSelectRT?: (rt: ResponsavelTecnicoSearchItem) => void;
  onSaveToAdministra?: () => Promise<void> | void;
  savingToAdministra?: boolean;
  showRtSelector?: boolean;
  readOnly?: boolean;
}

function normalizeSearchText(val?: string | null): string {
  return (val || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export const EcosystemSelector: React.FC<EcosystemSelectorProps> = ({
  selectedEmpreendedorId,
  selectedBarragemId,
  selectedBarragemNome,
  cpfCnpjFallback,
  snisbFallback,
  linkedRTs,
  onRemoveRT,
  onRegisterLinkedRT,
  onSelectEmpreendedor,
  onSelectBarragem,
  onSelectRT,
  onSaveToAdministra,
  savingToAdministra = false,
  showRtSelector = true,
  readOnly = false,
}) => {
  const { documents } = useContext(DataContext);
  const { currentUser } = useContext(AuthContext);
  const isMasterWriteBlocked = CLASSIFICA_INTEGRATION_ARCHITECTURE.masterWriteApi.blocked;
  const rtSearchInputRef = useRef<HTMLInputElement>(null);
  const [registeringRtEntryId, setRegisteringRtEntryId] = useState<string | null>(null);
  const [linkedRtFeedback, setLinkedRtFeedback] = useState<string | null>(null);

  const [empTerm, setEmpTerm] = useState('');
  const [barTerm, setBarTerm] = useState('');
  const [rtTerm, setRtTerm] = useState('');

  const [debouncedEmpTerm, setDebouncedEmpTerm] = useState('');
  const [debouncedBarTerm, setDebouncedBarTerm] = useState('');
  const [debouncedRtTerm, setDebouncedRtTerm] = useState('');

  // Estados paginados para listas de navegação (<select>) e buscas ativas
  const [empPageState, setEmpPageState] = useState<PaginatedEntityState<EmpreendedorMaster>>(() =>
    createInitialPaginatedState<EmpreendedorMaster>(PAGE_SIZE)
  );
  const [barPageState, setBarPageState] = useState<PaginatedEntityState<BarragemMaster>>(() =>
    createInitialPaginatedState<BarragemMaster>(PAGE_SIZE)
  );
  const [rtPageState, setRtPageState] = useState<PaginatedEntityState<ResponsavelTecnicoSearchItem>>(() =>
    createInitialPaginatedState<ResponsavelTecnicoSearchItem>(PAGE_SIZE)
  );

  const [empSearchState, setEmpSearchState] = useState<PaginatedEntityState<EmpreendedorMaster>>(() =>
    createInitialPaginatedState<EmpreendedorMaster>(PAGE_SIZE)
  );
  const [barSearchState, setBarSearchState] = useState<PaginatedEntityState<BarragemMaster>>(() =>
    createInitialPaginatedState<BarragemMaster>(PAGE_SIZE)
  );
  const [rtSearchState, setRtSearchState] = useState<PaginatedEntityState<ResponsavelTecnicoSearchItem>>(() =>
    createInitialPaginatedState<ResponsavelTecnicoSearchItem>(PAGE_SIZE)
  );

  const [selectedEmpRecord, setSelectedEmpRecord] = useState<EmpreendedorMaster | null>(null);
  const [selectedBarRecord, setSelectedBarRecord] = useState<BarragemMaster | null>(null);
  const selectedEmpRecordRef = useRef<EmpreendedorMaster | null>(null);
  const selectedBarRecordRef = useRef<BarragemMaster | null>(null);
  const selectedRtRecordRef = useRef<ResponsavelTecnicoSearchItem | null>(null);
  const barragemFilterCapabilities = useMemo(() => getAdministraBarragemFilterCapabilities(), []);

  const [empSearchError, setEmpSearchError] = useState<string | null>(null);
  const [barSearchError, setBarSearchError] = useState<string | null>(null);
  const [rtSearchError, setRtSearchError] = useState<string | null>(null);

  const [selectedRtId, setSelectedRtId] = useState('');
  const [selectedRtRecord, setSelectedRtRecord] = useState<ResponsavelTecnicoSearchItem | null>(null);
  const [rtArts, setRtArts] = useState<RtArtVinculo[]>([]);
  const [loadingRtArts, setLoadingRtArts] = useState(false);
  const [rtArtMode, setRtArtMode] = useState<'existing' | 'new'>('existing');
  const [newArtForm, setNewArtForm] = useState({ art: '', atividade: '', observacao: '' });
  const [savingNewArt, setSavingNewArt] = useState(false);
  const [artActionError, setArtActionError] = useState<string | null>(null);
  const [artActionSuccess, setArtActionSuccess] = useState<string | null>(null);

  const [showCreateRtForm, setShowCreateRtForm] = useState(false);
  const [newRtForm, setNewRtForm] = useState({
    nome: '',
    registro_profissional: '',
    cpf: '',
    email: '',
    telefone: '',
    art: '',
  });
  const [savingNewRt, setSavingNewRt] = useState(false);
  const [newRtError, setNewRtError] = useState<string | null>(null);

  const [loadingEmp, setLoadingEmp] = useState(false);
  const [loadingMoreEmp, setLoadingMoreEmp] = useState(false);
  const [loadingMoreEmpSearch, setLoadingMoreEmpSearch] = useState(false);
  const [loadingBar, setLoadingBar] = useState(false);
  const [loadingMoreBar, setLoadingMoreBar] = useState(false);
  const [loadingMoreBarSearch, setLoadingMoreBarSearch] = useState(false);
  const [loadingRt, setLoadingRt] = useState(false);
  const [loadingMoreRt, setLoadingMoreRt] = useState(false);
  const [loadingMoreRtSearch, setLoadingMoreRtSearch] = useState(false);
  const [refreshingBase, setRefreshingBase] = useState(false);

  const [administraReady, setAdministraReady] = useState<boolean>(() =>
    isAdministraConfigured()
  );
  const [counts, setCounts] = useState<{
    empreendedores: number | null;
    barragens: number | null;
    rts: number | null;
  }>({
    empreendedores: null,
    barragens: null,
    rts: null,
  });
  const [statusError, setStatusError] = useState<string | null>(null);

  const [relatedProducts, setRelatedProducts] = useState<ProdutoEcossistemaResumo[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  selectedEmpRecordRef.current = selectedEmpRecord;
  selectedBarRecordRef.current = selectedBarRecord;
  selectedRtRecordRef.current = selectedRtRecord;

  const empOptions = empPageState.items;
  const barOptions = barPageState.items;
  const rtOptions = rtPageState.items;

  useEffect(() => {
    if (!selectedEmpreendedorId) {
      setSelectedEmpRecord(null);
      return;
    }
    const found =
      empPageState.items.find((item) => item.id === selectedEmpreendedorId) ||
      empSearchState.items.find((item) => item.id === selectedEmpreendedorId);
    if (found) {
      setSelectedEmpRecord(found);
    }
  }, [selectedEmpreendedorId, empPageState.items, empSearchState.items]);

  useEffect(() => {
    if (!selectedBarragemId) {
      setSelectedBarRecord(null);
      return;
    }
    const found =
      barPageState.items.find((item) => item.id === selectedBarragemId) ||
      barSearchState.items.find((item) => item.id === selectedBarragemId);
    if (found) {
      setSelectedBarRecord(found);
    }
  }, [selectedBarragemId, barPageState.items, barSearchState.items]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedEmpTerm(empTerm), 200);
    return () => clearTimeout(timer);
  }, [empTerm]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedBarTerm(barTerm), 200);
    return () => clearTimeout(timer);
  }, [barTerm]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedRtTerm(rtTerm), 200);
    return () => clearTimeout(timer);
  }, [rtTerm]);

  const loadDiagnostics = useCallback(async () => {
    const diagRes = await checkAdministraCanonicalAccess();
    const empDiag = diagRes.diagnostics.find((d) => d.table === 'empreendedores');
    const barDiag = diagRes.diagnostics.find((d) => d.table === 'barragens');
    const rtDiag = diagRes.diagnostics.find((d) => d.table === 'rts');

    const anyAccessible = diagRes.diagnostics.some((d) => d.accessible);
    if (diagRes.configured || anyAccessible || isAdministraConfigured()) {
      setAdministraReady(true);
      setStatusError(null);
    } else {
      setAdministraReady(false);
      setStatusError(diagRes.error?.userMessage || null);
    }

    setCounts({
      empreendedores: typeof empDiag?.totalCount === 'number' ? empDiag.totalCount : null,
      barragens: typeof barDiag?.totalCount === 'number' ? barDiag.totalCount : null,
      rts: typeof rtDiag?.totalCount === 'number' ? rtDiag.totalCount : null,
    });
  }, []);

  const fetchEmpreendedoresBrowsePage = useCallback(
    async (page: number, append: boolean) => {
      if (append) {
        setLoadingMoreEmp(true);
      } else {
        setLoadingEmp(true);
      }
      try {
        const res = await searchEmpreendedores('', PAGE_SIZE, page);
        if (res.configured && !res.error) {
          setEmpPageState((prev) =>
            applyPaginatedPageResult(prev, {
              query: '',
              page: res.page || page,
              pageSize: PAGE_SIZE,
              items: res.data,
              hasMore: res.hasMore,
              total: typeof res.total === 'number' ? res.total : null,
              append,
              selectedItem: selectedEmpRecordRef.current,
            })
          );
          setAdministraReady(true);
          setStatusError(null);
          setEmpSearchError(null);
          if (typeof res.total === 'number') {
            setCounts((prev) => ({
              ...prev,
              empreendedores: prev.empreendedores ?? res.total ?? null,
            }));
          }
        } else if (res.error) {
          setStatusError((prev) => prev || res.error || null);
        }
      } finally {
        if (append) {
          setLoadingMoreEmp(false);
        } else {
          setLoadingEmp(false);
        }
      }
    },
    []
  );

  const fetchBarragensBrowsePage = useCallback(
    async (page: number, append: boolean, empId?: string) => {
      if (append) {
        setLoadingMoreBar(true);
      } else {
        setLoadingBar(true);
      }
      try {
        const res = await searchBarragens('', empId, PAGE_SIZE, page);
        if (res.configured && !res.error) {
          setBarPageState((prev) =>
            applyPaginatedPageResult(prev, {
              query: '',
              page: res.page || page,
              pageSize: PAGE_SIZE,
              items: res.data,
              hasMore: res.hasMore,
              total: typeof res.total === 'number' ? res.total : null,
              append,
              selectedItem: selectedBarRecordRef.current,
            })
          );
          setAdministraReady(true);
          setStatusError(null);
          setBarSearchError(null);
          if (typeof res.total === 'number') {
            setCounts((prev) => ({
              ...prev,
              barragens: prev.barragens ?? res.total ?? null,
            }));
          }
        } else if (res.error) {
          setStatusError((prev) => prev || res.error || null);
        }
      } finally {
        if (append) {
          setLoadingMoreBar(false);
        } else {
          setLoadingBar(false);
        }
      }
    },
    []
  );

  const fetchRtsBrowsePage = useCallback(
    async (page: number, append: boolean) => {
      if (!showRtSelector) return;
      if (append) {
        setLoadingMoreRt(true);
      } else {
        setLoadingRt(true);
      }
      try {
        const res = await searchResponsaveisTecnicos('', PAGE_SIZE, page);
        if (res.configured && !res.error) {
          setRtPageState((prev) =>
            applyPaginatedPageResult(prev, {
              query: '',
              page: res.page || page,
              pageSize: PAGE_SIZE,
              items: res.data,
              hasMore: res.hasMore,
              total: typeof res.total === 'number' ? res.total : null,
              append,
              selectedItem: selectedRtRecordRef.current,
            })
          );
          setAdministraReady(true);
          setStatusError(null);
          setRtSearchError(null);
          if (typeof res.total === 'number') {
            setCounts((prev) => ({
              ...prev,
              rts: prev.rts ?? res.total ?? null,
            }));
          }
        } else if (res.error) {
          setStatusError((prev) => prev || res.error || null);
        }
      } finally {
        if (append) {
          setLoadingMoreRt(false);
        } else {
          setLoadingRt(false);
        }
      }
    },
    [showRtSelector]
  );

  useEffect(() => {
    if (readOnly) return;
    void loadDiagnostics();
    void fetchEmpreendedoresBrowsePage(1, false);
    if (showRtSelector) void fetchRtsBrowsePage(1, false);
  }, [readOnly, showRtSelector, loadDiagnostics, fetchEmpreendedoresBrowsePage, fetchRtsBrowsePage]);

  useEffect(() => {
    if (readOnly) return;
    void fetchBarragensBrowsePage(1, false, selectedEmpreendedorId);
  }, [readOnly, selectedEmpreendedorId, fetchBarragensBrowsePage]);

  // Busca ativa de Empreendedores ao digitar qualquer dado (reinicia paginação ao mudar termo)
  useEffect(() => {
    if (readOnly) return;
    const term = debouncedEmpTerm.trim();
    if (!term) {
      setEmpSearchState(createInitialPaginatedState<EmpreendedorMaster>(PAGE_SIZE));
      setEmpSearchError(null);
      return;
    }

    let alive = true;
    setLoadingEmp(true);
    setEmpSearchError(null);
    setEmpSearchState(resetPaginatedSearchState<EmpreendedorMaster>(term, PAGE_SIZE));
    void searchEmpreendedores(term, PAGE_SIZE, 1)
      .then((res) => {
        if (!alive) return;
        if (res.error) {
          setEmpSearchState(resetPaginatedSearchState<EmpreendedorMaster>(term, PAGE_SIZE));
          setEmpSearchError(res.error);
          setStatusError((prev) => prev || res.error || null);
        } else {
          setEmpSearchState((prev) =>
            applyPaginatedPageResult(prev, {
              query: term,
              page: res.page || 1,
              pageSize: PAGE_SIZE,
              items: res.data,
              hasMore: res.hasMore,
              total: typeof res.total === 'number' ? res.total : null,
              append: false,
            })
          );
          setAdministraReady(true);
          setEmpSearchError(null);
        }
      })
      .finally(() => {
        if (alive) setLoadingEmp(false);
      });

    return () => {
      alive = false;
    };
  }, [debouncedEmpTerm, readOnly]);

  // Busca ativa de Barragens ao digitar qualquer dado (reinicia paginação ao mudar termo)
  useEffect(() => {
    if (readOnly) return;
    const term = debouncedBarTerm.trim();
    if (!term) {
      setBarSearchState(createInitialPaginatedState<BarragemMaster>(PAGE_SIZE));
      setBarSearchError(null);
      return;
    }

    let alive = true;
    setLoadingBar(true);
    setBarSearchError(null);
    setBarSearchState(resetPaginatedSearchState<BarragemMaster>(term, PAGE_SIZE));
    void searchBarragens(term, selectedEmpreendedorId, PAGE_SIZE, 1)
      .then((res) => {
        if (!alive) return;
        if (res.error) {
          setBarSearchState(resetPaginatedSearchState<BarragemMaster>(term, PAGE_SIZE));
          setBarSearchError(res.error);
          setStatusError((prev) => prev || res.error || null);
        } else {
          setBarSearchState((prev) =>
            applyPaginatedPageResult(prev, {
              query: term,
              page: res.page || 1,
              pageSize: PAGE_SIZE,
              items: res.data,
              hasMore: res.hasMore,
              total: typeof res.total === 'number' ? res.total : null,
              append: false,
            })
          );
          setAdministraReady(true);
          setBarSearchError(null);
        }
      })
      .finally(() => {
        if (alive) setLoadingBar(false);
      });

    return () => {
      alive = false;
    };
  }, [debouncedBarTerm, selectedEmpreendedorId, readOnly]);

  // Busca ativa de RTs ao digitar qualquer dado (reinicia paginação ao mudar termo)
  useEffect(() => {
    if (readOnly || !showRtSelector) return;
    const term = debouncedRtTerm.trim();
    if (!term) {
      setRtSearchState(createInitialPaginatedState<ResponsavelTecnicoSearchItem>(PAGE_SIZE));
      setRtSearchError(null);
      return;
    }

    let alive = true;
    setLoadingRt(true);
    setRtSearchError(null);
    setRtSearchState(resetPaginatedSearchState<ResponsavelTecnicoSearchItem>(term, PAGE_SIZE));
    void searchResponsaveisTecnicos(term, PAGE_SIZE, 1)
      .then((res) => {
        if (!alive) return;
        if (res.error) {
          setRtSearchState(resetPaginatedSearchState<ResponsavelTecnicoSearchItem>(term, PAGE_SIZE));
          setRtSearchError(res.error);
          setStatusError((prev) => prev || res.error || null);
        } else {
          setRtSearchState((prev) =>
            applyPaginatedPageResult(prev, {
              query: term,
              page: res.page || 1,
              pageSize: PAGE_SIZE,
              items: res.data,
              hasMore: res.hasMore,
              total: typeof res.total === 'number' ? res.total : null,
              append: false,
            })
          );
          setAdministraReady(true);
          setRtSearchError(null);
        }
      })
      .finally(() => {
        if (alive) setLoadingRt(false);
      });

    return () => {
      alive = false;
    };
  }, [debouncedRtTerm, readOnly, showRtSelector]);

  const handleLoadMoreEmpSearch = async () => {
    const term = debouncedEmpTerm.trim();
    if (!term || !empSearchState.hasMore || loadingMoreEmpSearch) return;
    const nextPage = empSearchState.page + 1;
    setLoadingMoreEmpSearch(true);
    try {
      const res = await searchEmpreendedores(term, PAGE_SIZE, nextPage);
      if (!res.error) {
        setEmpSearchState((prev) =>
          prev.query !== term
            ? prev
            : applyPaginatedPageResult(prev, {
                query: term,
                page: res.page || nextPage,
                pageSize: PAGE_SIZE,
                items: res.data,
                hasMore: res.hasMore,
                total: typeof res.total === 'number' ? res.total : prev.total,
                append: true,
              })
        );
      } else {
        setEmpSearchError(res.error);
      }
    } finally {
      setLoadingMoreEmpSearch(false);
    }
  };

  const handleLoadMoreBarSearch = async () => {
    const term = debouncedBarTerm.trim();
    if (!term || !barSearchState.hasMore || loadingMoreBarSearch) return;
    const nextPage = barSearchState.page + 1;
    setLoadingMoreBarSearch(true);
    try {
      const res = await searchBarragens(term, selectedEmpreendedorId, PAGE_SIZE, nextPage);
      if (!res.error) {
        setBarSearchState((prev) =>
          prev.query !== term
            ? prev
            : applyPaginatedPageResult(prev, {
                query: term,
                page: res.page || nextPage,
                pageSize: PAGE_SIZE,
                items: res.data,
                hasMore: res.hasMore,
                total: typeof res.total === 'number' ? res.total : prev.total,
                append: true,
              })
        );
      } else {
        setBarSearchError(res.error);
      }
    } finally {
      setLoadingMoreBarSearch(false);
    }
  };

  const handleLoadMoreRtSearch = async () => {
    const term = debouncedRtTerm.trim();
    if (!term || !rtSearchState.hasMore || loadingMoreRtSearch) return;
    const nextPage = rtSearchState.page + 1;
    setLoadingMoreRtSearch(true);
    try {
      const res = await searchResponsaveisTecnicos(term, PAGE_SIZE, nextPage);
      if (!res.error) {
        setRtSearchState((prev) =>
          prev.query !== term
            ? prev
            : applyPaginatedPageResult(prev, {
                query: term,
                page: res.page || nextPage,
                pageSize: PAGE_SIZE,
                items: res.data,
                hasMore: res.hasMore,
                total: typeof res.total === 'number' ? res.total : prev.total,
                append: true,
              })
        );
      } else {
        setRtSearchError(res.error);
      }
    } finally {
      setLoadingMoreRtSearch(false);
    }
  };

  useEffect(() => {
    if (!selectedEmpreendedorId && !selectedBarragemId && !cpfCnpjFallback && !snisbFallback) {
      setRelatedProducts([]);
      return;
    }
    let alive = true;
    setLoadingProducts(true);
    void getEcosystemProductsByEntity({
      empreendedorId: selectedEmpreendedorId,
      cpfCnpj: cpfCnpjFallback,
      barragemId: selectedBarragemId,
      snisb: snisbFallback,
      localDocuments: documents,
    })
      .then((res) => {
        if (alive) setRelatedProducts(res.products);
      })
      .finally(() => {
        if (alive) setLoadingProducts(false);
      });
    return () => {
      alive = false;
    };
  }, [selectedEmpreendedorId, selectedBarragemId, cpfCnpjFallback, snisbFallback, documents]);

  // Combina resultados do servidor + filtro instantâneo local enquanto digita
  const visibleEmpResults = useMemo(() => {
    const q = normalizeSearchText(empTerm);
    if (!q) return [];
    const digits = q.replace(/\D/g, '');
    const localMatches = empOptions.filter((emp) => {
      const text = normalizeSearchText(`${emp.razao_social} ${emp.cpf_cnpj} ${emp.num_car || ''} ${emp.municipio || ''}`);
      const empDigits = (emp.cpf_cnpj || '').replace(/\D/g, '');
      return text.includes(q) || (digits.length >= 2 && empDigits.includes(digits));
    });
    return mergeUniqueById(empSearchState.items, localMatches);
  }, [empTerm, empOptions, empSearchState.items]);

  const visibleBarResults = useMemo(() => {
    const q = normalizeSearchText(barTerm);
    if (!q) return [];
    const localMatches = barOptions.filter((bar) => {
      const text = normalizeSearchText(
        `${bar.nome} ${bar.snisb || ''} ${bar.municipio || ''} ${bar.empreendedor_nome || ''}`
      );
      return text.includes(q);
    });
    return mergeUniqueById(barSearchState.items, localMatches);
  }, [barTerm, barOptions, barSearchState.items]);

  const visibleRtResults = useMemo(() => {
    const q = normalizeSearchText(rtTerm);
    if (!q) return [];
    const digits = q.replace(/\D/g, '');
    const localMatches = rtOptions.filter((rt) => {
      const text = normalizeSearchText(
        `${rt.nome} ${rt.registro_profissional || ''} ${rt.cpf || ''} ${rt.art || ''}`
      );
      const rtDigits = (rt.cpf || '').replace(/\D/g, '');
      return text.includes(q) || (digits.length >= 2 && rtDigits.includes(digits));
    });
    return mergeUniqueById(rtSearchState.items, localMatches);
  }, [rtTerm, rtOptions, rtSearchState.items]);

  const handleUseEmpreendedor = (emp: EmpreendedorMaster) => {
    setSelectedEmpRecord(emp);
    setEmpPageState((prev) => ({
      ...prev,
      items: preserveSelectedItemInList(prev.items, emp),
    }));
    onSelectEmpreendedor?.(emp);
    setEmpTerm('');
    setDebouncedEmpTerm('');
    setEmpSearchState(createInitialPaginatedState<EmpreendedorMaster>(PAGE_SIZE));
  };

  const handleUseBarragem = (bar: BarragemMaster) => {
    setSelectedBarRecord(bar);
    setBarPageState((prev) => ({
      ...prev,
      items: preserveSelectedItemInList(prev.items, bar),
    }));
    onSelectBarragem?.(bar);
    setBarTerm('');
    setDebouncedBarTerm('');
    setBarSearchState(createInitialPaginatedState<BarragemMaster>(PAGE_SIZE));
  };

  const mergeRtArts = useCallback(
    (primary: RtArtVinculo[], secondary: RtArtVinculo[]): RtArtVinculo[] => {
      const seen = new Set<string>();
      const out: RtArtVinculo[] = [];
      for (const item of [...primary, ...secondary]) {
        const clean = (item?.art || '').trim();
        if (!clean) continue;
        const key = `${clean.toUpperCase()}::${item.barragem_id || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ ...item, art: clean });
      }
      return out;
    },
    []
  );

  const loadRtArts = useCallback(
    async (rt: ResponsavelTecnicoSearchItem) => {
      const initialArts = rt.arts || [];
      setRtArts(initialArts);
      setRtArtMode(initialArts.length > 0 || isMasterWriteBlocked ? 'existing' : 'new');
      setLoadingRtArts(true);
      try {
        const res = await listArtsForRt(rt.id);
        const merged = mergeRtArts(res.data || [], initialArts);
        setRtArts(merged);
        if (merged.length > 0) {
          setRtArtMode((prev) => (prev === 'new' && initialArts.length === 0 ? 'existing' : prev));
        }
      } finally {
        setLoadingRtArts(false);
      }
    },
    [mergeRtArts, isMasterWriteBlocked]
  );

  const handleUseRt = (rt: ResponsavelTecnicoSearchItem) => {
    setRtPageState((prev) => ({
      ...prev,
      items: preserveSelectedItemInList(prev.items, rt),
    }));
    setSelectedRtId(rt.id);
    setSelectedRtRecord(rt);
    setShowCreateRtForm(false);
    setArtActionError(null);
    setArtActionSuccess(null);
    setNewArtForm({ art: '', atividade: '', observacao: '' });
    setRtTerm('');
    setDebouncedRtTerm('');
    setRtSearchState(createInitialPaginatedState<ResponsavelTecnicoSearchItem>(PAGE_SIZE));
    void loadRtArts(rt);
  };

  const handleClearSelectedRt = () => {
    setSelectedRtId('');
    setSelectedRtRecord(null);
    setRtArts([]);
    setArtActionError(null);
    setArtActionSuccess(null);
    setNewArtForm({ art: '', atividade: '', observacao: '' });
  };

  const handlePrepareAddAnotherRt = () => {
    handleClearSelectedRt();
    setShowCreateRtForm(false);
    setTimeout(() => {
      rtSearchInputRef.current?.focus();
    }, 30);
  };

  const handleLinkExistingArt = (artItem: RtArtVinculo) => {
    if (!selectedRtRecord) return;
    setArtActionError(null);
    setArtActionSuccess(`ART ${artItem.art} vinculada ao parecer para ${selectedRtRecord.nome}.`);
    onSelectRT?.({
      ...selectedRtRecord,
      art: artItem.art,
      arts: rtArts,
    });
  };

  const handleSaveAndLinkNewArt = async () => {
    if (!selectedRtRecord) return;
    setArtActionError(null);
    setArtActionSuccess(null);

    if (isMasterWriteBlocked) {
      setArtActionError(
        'Gravação direta de ART no Administra Barragens está bloqueada até a implantação da API de escrita híbrida.'
      );
      return;
    }

    if (!currentUser) {
      setArtActionError('Usuário não autenticado para salvar no Administra Barragens.');
      return;
    }

    const cleanArt = newArtForm.art.trim();
    if (cleanArt.length < 2) {
      setArtActionError('Informe o número da nova ART.');
      return;
    }

    setSavingNewArt(true);
    try {
      const res = await saveArtForRt(
        {
          rtId: selectedRtRecord.id,
          art: cleanArt,
          barragemId: selectedBarragemId || null,
          atividade: newArtForm.atividade.trim() || null,
          observacao: newArtForm.observacao.trim() || null,
        },
        currentUser
      );

      if (!res.success || !res.data || res.blocked) {
        setArtActionError(res.message || 'Não foi possível salvar a ART no Administra.');
        return;
      }

      const savedItem: RtArtVinculo = {
        ...res.data,
        barragem_nome: res.data.barragem_nome || selectedBarragemNome || null,
      };
      const nextArts = mergeRtArts([savedItem], rtArts);
      setRtArts(nextArts);
      setRtPageState((prev) => ({
        ...prev,
        items: prev.items.map((item) =>
          item.id === selectedRtRecord.id
            ? { ...item, art: item.art || savedItem.art, arts: nextArts }
            : item
        ),
      }));
      setSelectedRtRecord((prev) =>
        prev ? { ...prev, art: prev.art || savedItem.art, arts: nextArts } : prev
      );
      setNewArtForm({ art: '', atividade: '', observacao: '' });
      setRtArtMode('existing');
      setArtActionSuccess(
        `ART ${savedItem.art} salva no Administra com vínculo ao RT e adicionada ao parecer.`
      );
      onSelectRT?.({
        ...selectedRtRecord,
        art: savedItem.art,
        arts: nextArts,
      });
    } finally {
      setSavingNewArt(false);
    }
  };

  const handleCreateNewRt = async () => {
    setNewRtError(null);
    if (isMasterWriteBlocked) {
      setNewRtError(
        'Cadastro direto de Responsável Técnico no Administra Barragens está bloqueado até a implantação da API de escrita híbrida.'
      );
      return;
    }
    if (!currentUser) {
      setNewRtError('Usuário não autenticado para cadastrar no Administra Barragens.');
      return;
    }
    if (newRtForm.nome.trim().length < 2) {
      setNewRtError('Informe o nome completo do Responsável Técnico.');
      return;
    }

    setSavingNewRt(true);
    try {
      const res = await createResponsavelTecnicoInAdministra(
        {
          nome: newRtForm.nome,
          registro_profissional: newRtForm.registro_profissional,
          cpf: newRtForm.cpf,
          email: newRtForm.email,
          telefone: newRtForm.telefone,
          art: newRtForm.art,
          barragemId: selectedBarragemId || null,
        },
        currentUser
      );

      if (!res.success || !res.data?.rt) {
        setNewRtError(res.message || 'Não foi possível cadastrar o RT no Administra.');
        return;
      }

      const createdRt = res.data.rt;
      const createdArt = res.data.artItem;
      setRtPageState((prev) => ({
        ...prev,
        items: preserveSelectedItemInList(prev.items, createdRt),
      }));
      setSelectedRtId(createdRt.id);
      setSelectedRtRecord(createdRt);
      setShowCreateRtForm(false);
      setNewRtForm({
        nome: '',
        registro_profissional: '',
        cpf: '',
        email: '',
        telefone: '',
        art: '',
      });

      const initialArts = createdArt ? [createdArt] : createdRt.arts || [];
      setRtArts(initialArts);
      setRtArtMode(initialArts.length > 0 ? 'existing' : 'new');

      if (createdArt) {
        setArtActionSuccess(
          `RT "${createdRt.nome}" e ART ${createdArt.art} salvos no Administra e vinculados ao parecer.`
        );
        onSelectRT?.({ ...createdRt, art: createdArt.art, arts: initialArts });
      } else {
        setArtActionError(res.data.artSaveWarning || null);
        setArtActionSuccess(
          `RT "${createdRt.nome}" cadastrado no Administra. Vincule ou cadastre a ART abaixo.`
        );
        void loadRtArts(createdRt);
      }
    } finally {
      setSavingNewRt(false);
    }
  };

  const handleRefreshBase = async () => {
    setRefreshingBase(true);
    try {
      await Promise.all([
        loadDiagnostics(),
        fetchEmpreendedoresBrowsePage(1, false),
        fetchBarragensBrowsePage(1, false, selectedEmpreendedorId),
        showRtSelector ? fetchRtsBrowsePage(1, false) : Promise.resolve(),
      ]);
    } finally {
      setRefreshingBase(false);
    }
  };

  const empSummaryCount = counts.empreendedores ?? empPageState.total ?? empOptions.length;
  const barSummaryCount = counts.barragens ?? barPageState.total ?? barOptions.length;
  const rtSummaryCount = counts.rts ?? rtPageState.total ?? rtOptions.length;

  const isLoadingAny =
    refreshingBase ||
    loadingEmp ||
    loadingMoreEmp ||
    loadingBar ||
    loadingMoreBar ||
    loadingRt ||
    loadingMoreRt;

  const hasSelectedEmpInList =
    !selectedEmpreendedorId || empOptions.some((e) => e.id === selectedEmpreendedorId);
  const hasSelectedBarInList =
    !selectedBarragemId || barOptions.some((b) => b.id === selectedBarragemId);

  return (
    <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/40 p-4 md:p-5 space-y-4">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-emerald-100">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-sm shrink-0">
            <Database size={20} />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm md:text-base font-black text-slate-900 leading-tight">
                Base Central • Administra Barragens
              </h3>
            </div>
            <span className="inline-block text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">
              ECOSSISTEMA CSB
            </span>
            <p className="text-xs text-slate-600 leading-relaxed">
              Consulte por <strong className="text-slate-800">Nome, CPF/CNPJ ou CAR/MT</strong> (
              {empSummaryCount} empreendedores, {barSummaryCount} barragens
              {showRtSelector ? `, ${rtSummaryCount} RTs` : ''}).
            </p>
          </div>
        </div>

        {!readOnly && (
          <div className="flex flex-row sm:flex-col items-stretch sm:items-end gap-2 shrink-0">
            {onSaveToAdministra && isMasterWriteBlocked && (
              <span
                title="Gravação direta de cadastros mestres no Administra está bloqueada até a aprovação da API de escrita híbrida."
                className="px-3 py-1.5 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-bold flex items-center justify-center gap-1.5"
              >
                <Lock size={13} />
                Escrita no Administra bloqueada (somente leitura)
              </span>
            )}
            {onSaveToAdministra && !isMasterWriteBlocked && (
              <button
                type="button"
                onClick={() => void onSaveToAdministra()}
                disabled={savingToAdministra}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-colors disabled:opacity-60"
              >
                {savingToAdministra ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                Salvar no Administra
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleRefreshBase()}
              disabled={isLoadingAny}
              className="px-4 py-2 rounded-xl bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-colors disabled:opacity-60"
            >
              <RefreshCw size={14} className={isLoadingAny ? 'animate-spin' : ''} />
              Atualizar Base
            </button>
          </div>
        )}
      </div>

      {/* Blocos de busca no Administra */}
      {!readOnly && (
        <div className="space-y-4">
          {/* 1. Buscar Empreendedor */}
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-slate-700">
              <Building2 size={13} className="text-emerald-600" />
              BUSCAR EMPREENDEDOR (NOME, CPF/CNPJ OU CAR)
            </label>
            <div className="relative">
              <Search
                size={15}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={empTerm}
                onChange={(e) => setEmpTerm(e.target.value)}
                placeholder="Nome, CPF/CNPJ ou CAR/MT..."
                className="w-full pl-9 pr-16 py-2.5 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                {loadingEmp && <Loader2 size={14} className="animate-spin text-emerald-600" />}
                {empTerm && (
                  <button
                    type="button"
                    onClick={() => {
                      setEmpTerm('');
                      setDebouncedEmpTerm('');
                      setEmpSearchState(createInitialPaginatedState<EmpreendedorMaster>(PAGE_SIZE));
                      setEmpSearchError(null);
                    }}
                    aria-label="Limpar busca de empreendedor"
                    className="p-0.5 text-slate-400 hover:text-slate-700 rounded"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            </div>

            {/* Lista instantânea de empreendedores encontrados */}
            {empTerm.trim().length > 0 && (
              <div className="rounded-xl border border-emerald-200 bg-white shadow-lg max-h-60 overflow-y-auto divide-y divide-slate-100">
                {visibleEmpResults.length > 0 ? (
                  <>
                    {visibleEmpResults.map((emp) => (
                      <div
                        key={emp.id}
                        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-emerald-50/50 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-black text-slate-900 uppercase truncate">
                            {emp.razao_social}
                          </div>
                          <div className="text-xs text-slate-500 truncate mt-0.5">
                            {[
                              emp.cpf_cnpj || null,
                              emp.num_car ? `CAR: ${emp.num_car}` : null,
                              emp.municipio || null,
                            ]
                              .filter(Boolean)
                              .join(' • ') || 'Sem documento informado'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleUseEmpreendedor(emp)}
                          className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wide shrink-0 shadow-sm transition-colors"
                        >
                          USAR
                        </button>
                      </div>
                    ))}
                    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-slate-50 text-[11px] text-slate-600">
                      <span>
                        {formatPaginationCounterText(
                          visibleEmpResults.length,
                          empSearchState.total,
                          empSearchState.hasMore,
                          'empreendedores encontrados'
                        )}
                      </span>
                      {empSearchState.hasMore && (
                        <button
                          type="button"
                          disabled={loadingMoreEmpSearch}
                          onClick={() => void handleLoadMoreEmpSearch()}
                          className="px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold inline-flex items-center gap-1 disabled:opacity-60"
                        >
                          {loadingMoreEmpSearch && <Loader2 size={12} className="animate-spin" />}
                          Carregar mais (+{PAGE_SIZE})
                        </button>
                      )}
                    </div>
                  </>
                ) : loadingEmp ? (
                  <div className="px-4 py-4 text-xs text-slate-500 flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin text-emerald-600" />
                    Buscando empreendedores no Administra...
                  </div>
                ) : empSearchError ? (
                  <div className="px-4 py-3 text-xs text-amber-800 bg-amber-50/70">
                    {empSearchError}
                  </div>
                ) : (
                  <div className="px-4 py-4 text-xs text-slate-500">
                    Nenhum empreendedor encontrado para &ldquo;{empTerm}&rdquo;.
                  </div>
                )}
              </div>
            )}

            <select
              value={selectedEmpreendedorId || ''}
              onChange={(e) => {
                const chosen = empOptions.find((emp) => emp.id === e.target.value);
                if (chosen) {
                  handleUseEmpreendedor(chosen);
                }
              }}
              className="w-full px-3.5 py-2.5 text-sm font-bold text-slate-800 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            >
              <option value="">
                -- Escolher empreendedor ({empOptions.length}) --
              </option>
              {!hasSelectedEmpInList && selectedEmpreendedorId && (
                <option value={selectedEmpreendedorId}>
                  Empreendedor vinculado ({selectedEmpreendedorId})
                </option>
              )}
              {empOptions.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.razao_social}
                  {emp.cpf_cnpj ? ` — ${emp.cpf_cnpj}` : ''}
                  {emp.num_car ? ` • CAR: ${emp.num_car}` : ''}
                </option>
              ))}
            </select>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 px-1">
              <span>
                {formatPaginationCounterText(
                  empOptions.length,
                  empPageState.total ?? counts.empreendedores,
                  empPageState.hasMore,
                  'empreendedores'
                )}
              </span>
              {empPageState.hasMore && (
                <button
                  type="button"
                  disabled={loadingMoreEmp}
                  onClick={() => void fetchEmpreendedoresBrowsePage(empPageState.page + 1, true)}
                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold inline-flex items-center gap-1 disabled:opacity-60"
                >
                  {loadingMoreEmp && <Loader2 size={12} className="animate-spin" />}
                  Carregar mais (+{PAGE_SIZE})
                </button>
              )}
            </div>
          </div>

          {/* 2. Buscar Barragem */}
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-slate-700">
              <Waves size={13} className="text-emerald-600" />
              BUSCAR BARRAGEM (NOME, SNISB, MUNICÍPIO)
            </label>
            <div className="relative">
              <Search
                size={15}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={barTerm}
                onChange={(e) => setBarTerm(e.target.value)}
                placeholder="Nome, SNISB, município ou CAR..."
                className="w-full pl-9 pr-16 py-2.5 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                {loadingBar && <Loader2 size={14} className="animate-spin text-emerald-600" />}
                {barTerm && (
                  <button
                    type="button"
                    onClick={() => {
                      setBarTerm('');
                      setDebouncedBarTerm('');
                      setBarSearchState(createInitialPaginatedState<BarragemMaster>(PAGE_SIZE));
                      setBarSearchError(null);
                    }}
                    aria-label="Limpar busca de barragem"
                    className="p-0.5 text-slate-400 hover:text-slate-700 rounded"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            </div>

            {barTerm.trim().length > 0 && (
              <div className="rounded-xl border border-emerald-200 bg-white shadow-lg max-h-60 overflow-y-auto divide-y divide-slate-100">
                {visibleBarResults.length > 0 ? (
                  <>
                    {visibleBarResults.map((bar) => (
                      <div
                        key={bar.id}
                        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-emerald-50/50 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-black text-slate-900 uppercase truncate">
                            {bar.nome}
                          </div>
                          <div className="text-xs text-slate-500 truncate mt-0.5">
                            {[
                              bar.snisb ? `SNISB: ${bar.snisb}` : null,
                              bar.municipio || null,
                              bar.empreendedor_nome || null,
                            ]
                              .filter(Boolean)
                              .join(' • ') || 'Sem detalhes adicionais'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleUseBarragem(bar)}
                          className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wide shrink-0 shadow-sm transition-colors"
                        >
                          USAR
                        </button>
                      </div>
                    ))}
                    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-slate-50 text-[11px] text-slate-600">
                      <span>
                        {formatPaginationCounterText(
                          visibleBarResults.length,
                          barSearchState.total,
                          barSearchState.hasMore,
                          'barragens encontradas'
                        )}
                      </span>
                      {barSearchState.hasMore && (
                        <button
                          type="button"
                          disabled={loadingMoreBarSearch}
                          onClick={() => void handleLoadMoreBarSearch()}
                          className="px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold inline-flex items-center gap-1 disabled:opacity-60"
                        >
                          {loadingMoreBarSearch && <Loader2 size={12} className="animate-spin" />}
                          Carregar mais (+{PAGE_SIZE})
                        </button>
                      )}
                    </div>
                  </>
                ) : loadingBar ? (
                  <div className="px-4 py-4 text-xs text-slate-500 flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin text-emerald-600" />
                    Buscando barragens no Administra...
                  </div>
                ) : barSearchError ? (
                  <div className="px-4 py-3 text-xs text-amber-800 bg-amber-50/70">
                    {barSearchError}
                  </div>
                ) : (
                  <div className="px-4 py-4 text-xs text-slate-500">
                    Nenhuma barragem encontrada para &ldquo;{barTerm}&rdquo;.
                  </div>
                )}
              </div>
            )}

            <select
              value={selectedBarragemId || ''}
              onChange={(e) => {
                const chosen = barOptions.find((bar) => bar.id === e.target.value);
                if (chosen) {
                  handleUseBarragem(chosen);
                }
              }}
              className="w-full px-3.5 py-2.5 text-sm font-bold text-slate-800 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            >
              <option value="">-- Escolher barragem ({barOptions.length}) --</option>
              {!hasSelectedBarInList && selectedBarragemId && (
                <option value={selectedBarragemId}>
                  Barragem vinculada ({selectedBarragemId})
                </option>
              )}
              {barOptions.map((bar) => {
                const isLinked =
                  Boolean(selectedEmpreendedorId) &&
                  bar.empreendedor_id === selectedEmpreendedorId;
                return (
                  <option key={bar.id} value={bar.id}>
                    {isLinked ? '★ ' : ''}
                    {bar.nome}
                    {bar.municipio ? ` — ${bar.municipio}` : ''}
                    {bar.snisb ? ` (SNISB: ${bar.snisb})` : ''}
                  </option>
                );
              })}
            </select>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 px-1">
              <span>
                {formatPaginationCounterText(
                  barOptions.length,
                  barPageState.total ?? counts.barragens,
                  barPageState.hasMore,
                  'barragens'
                )}
              </span>
              {barPageState.hasMore && (
                <button
                  type="button"
                  disabled={loadingMoreBar}
                  onClick={() =>
                    void fetchBarragensBrowsePage(
                      barPageState.page + 1,
                      true,
                      selectedEmpreendedorId
                    )
                  }
                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold inline-flex items-center gap-1 disabled:opacity-60"
                >
                  {loadingMoreBar && <Loader2 size={12} className="animate-spin" />}
                  Carregar mais (+{PAGE_SIZE})
                </button>
              )}
            </div>

            {selectedEmpreendedorId && !barragemFilterCapabilities.legacyBarragensSupportsEmpreendedorIdFilter && (
              <p className="text-[11px] text-slate-500 px-1">
                Barragens vinculadas ao empreendedor selecionado aparecem destacadas com ★ na página carregada; filtragem global por empreendedor depende de suporte no endpoint de leitura.
              </p>
            )}
          </div>

          {/* 3. Vincular RT da Base */}
          {showRtSelector && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-slate-700">
                  <UserPlus size={13} className="text-emerald-600" />
                  VINCULAR RT DA BASE
                </label>
                {isMasterWriteBlocked ? (
                  <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-semibold inline-flex items-center gap-1">
                    <Lock size={11} />
                    Cadastro direto de RT bloqueado
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateRtForm((prev) => !prev);
                      setNewRtError(null);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold inline-flex items-center gap-1 shadow-sm transition-colors"
                  >
                    {showCreateRtForm ? <X size={12} /> : <Plus size={12} />}
                    {showCreateRtForm ? 'Fechar cadastro de RT' : 'Cadastrar novo RT'}
                  </button>
                )}
              </div>

              {!isMasterWriteBlocked && showCreateRtForm && (
                <div className="rounded-xl border border-emerald-200 bg-white p-3.5 space-y-3 shadow-sm">
                  <div className="text-xs font-black uppercase tracking-wider text-emerald-800">
                    Novo Responsável Técnico no Administra Barragens
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                        Nome completo *
                      </label>
                      <input
                        type="text"
                        value={newRtForm.nome}
                        onChange={(e) =>
                          setNewRtForm((prev) => ({ ...prev, nome: e.target.value }))
                        }
                        placeholder="Nome completo do Responsável Técnico"
                        className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg outline-none focus:bg-white focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                        Registro Profissional (CREA/CFT)
                      </label>
                      <input
                        type="text"
                        value={newRtForm.registro_profissional}
                        onChange={(e) =>
                          setNewRtForm((prev) => ({
                            ...prev,
                            registro_profissional: e.target.value,
                          }))
                        }
                        placeholder="Ex.: CREA-MT 12345/D"
                        className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg outline-none focus:bg-white focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                        CPF
                      </label>
                      <input
                        type="text"
                        value={newRtForm.cpf}
                        onChange={(e) =>
                          setNewRtForm((prev) => ({ ...prev, cpf: e.target.value }))
                        }
                        placeholder="000.000.000-00"
                        className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg outline-none focus:bg-white focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                        E-mail
                      </label>
                      <input
                        type="email"
                        value={newRtForm.email}
                        onChange={(e) =>
                          setNewRtForm((prev) => ({ ...prev, email: e.target.value }))
                        }
                        placeholder="email@exemplo.com"
                        className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg outline-none focus:bg-white focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                        Telefone
                      </label>
                      <input
                        type="text"
                        value={newRtForm.telefone}
                        onChange={(e) =>
                          setNewRtForm((prev) => ({ ...prev, telefone: e.target.value }))
                        }
                        placeholder="(65) 99999-9999"
                        className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg outline-none focus:bg-white focus:border-emerald-500"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                        Número da ART inicial (opcional — já salva com vínculo do RT)
                      </label>
                      <input
                        type="text"
                        value={newRtForm.art}
                        onChange={(e) =>
                          setNewRtForm((prev) => ({ ...prev, art: e.target.value }))
                        }
                        placeholder="Ex.: 1234567890"
                        className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg outline-none focus:bg-white focus:border-emerald-500"
                      />
                    </div>
                  </div>
                  {newRtError && (
                    <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      {newRtError}
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCreateRtForm(false)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCreateNewRt()}
                      disabled={savingNewRt}
                      className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-60"
                    >
                      {savingNewRt ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Save size={13} />
                      )}
                      Salvar RT no Administra
                    </button>
                  </div>
                </div>
              )}

              <div className="relative">
                <Search
                  size={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  ref={rtSearchInputRef}
                  type="text"
                  value={rtTerm}
                  onChange={(e) => setRtTerm(e.target.value)}
                  placeholder="Filtrar RT, CREA, CPF ou ART..."
                  className="w-full pl-9 pr-16 py-2.5 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                  {loadingRt && <Loader2 size={14} className="animate-spin text-emerald-600" />}
                  {rtTerm && (
                    <button
                      type="button"
                      onClick={() => {
                        setRtTerm('');
                        setDebouncedRtTerm('');
                        setRtSearchState(createInitialPaginatedState<ResponsavelTecnicoSearchItem>(PAGE_SIZE));
                        setRtSearchError(null);
                      }}
                      aria-label="Limpar busca de RT"
                      className="p-0.5 text-slate-400 hover:text-slate-700 rounded"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
              </div>

              {rtTerm.trim().length > 0 && (
                <div className="rounded-xl border border-emerald-200 bg-white shadow-lg max-h-60 overflow-y-auto divide-y divide-slate-100">
                  {visibleRtResults.length > 0 ? (
                    <>
                      {visibleRtResults.map((rt) => (
                        <div
                          key={rt.id}
                          className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-emerald-50/50 transition-colors"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-black text-slate-900 uppercase truncate">
                              {rt.nome}
                            </div>
                            <div className="text-xs text-slate-500 truncate mt-0.5">
                              {[
                                rt.registro_profissional || null,
                                rt.cpf ? `CPF: ${rt.cpf}` : null,
                                rt.arts && rt.arts.length > 0
                                  ? `${rt.arts.length} ART(s)`
                                  : rt.art
                                  ? `ART: ${rt.art}`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(' • ') || 'Sem registro informado'}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleUseRt(rt)}
                            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wide shrink-0 shadow-sm transition-colors"
                          >
                            USAR
                          </button>
                        </div>
                      ))}
                      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-slate-50 text-[11px] text-slate-600">
                        <span>
                          {formatPaginationCounterText(
                            visibleRtResults.length,
                            rtSearchState.total,
                            rtSearchState.hasMore,
                            'RTs encontrados'
                          )}
                        </span>
                        {rtSearchState.hasMore && (
                          <button
                            type="button"
                            disabled={loadingMoreRtSearch}
                            onClick={() => void handleLoadMoreRtSearch()}
                            className="px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold inline-flex items-center gap-1 disabled:opacity-60"
                          >
                            {loadingMoreRtSearch && <Loader2 size={12} className="animate-spin" />}
                            Carregar mais (+{PAGE_SIZE})
                          </button>
                        )}
                      </div>
                    </>
                  ) : loadingRt ? (
                    <div className="px-4 py-4 text-xs text-slate-500 flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin text-emerald-600" />
                      Buscando responsáveis técnicos no Administra...
                    </div>
                  ) : rtSearchError ? (
                    <div className="px-4 py-3 text-xs text-amber-800 bg-amber-50/70">
                      {rtSearchError}
                    </div>
                  ) : (
                    <div className="px-4 py-4 text-xs text-slate-500 flex items-center justify-between gap-2">
                      <span>Nenhum RT encontrado para &ldquo;{rtTerm}&rdquo;.</span>
                      {!isMasterWriteBlocked && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowCreateRtForm(true);
                            setNewRtForm((prev) => ({ ...prev, nome: rtTerm.trim() }));
                          }}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold shrink-0"
                        >
                          + Cadastrar este RT
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              <select
                value={selectedRtId}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) {
                    handleClearSelectedRt();
                    return;
                  }
                  const chosen = rtOptions.find((r) => r.id === val);
                  if (chosen) {
                    handleUseRt(chosen);
                  }
                }}
                className="w-full px-3.5 py-2.5 text-sm font-bold text-slate-800 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              >
                <option value="">
                  -- Escolher RT e vincular/cadastrar ART ({rtOptions.length}) --
                </option>
                {rtOptions.map((rt) => (
                  <option key={rt.id} value={rt.id}>
                    {rt.nome}
                    {rt.registro_profissional ? ` — ${rt.registro_profissional}` : ''}
                    {rt.cpf ? ` (${rt.cpf})` : ''}
                  </option>
                ))}
              </select>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 px-1">
                <span>
                  {formatPaginationCounterText(
                    rtOptions.length,
                    rtPageState.total ?? counts.rts,
                    rtPageState.hasMore,
                    'RTs'
                  )}
                </span>
                {rtPageState.hasMore && (
                  <button
                    type="button"
                    disabled={loadingMoreRt}
                    onClick={() => void fetchRtsBrowsePage(rtPageState.page + 1, true)}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold inline-flex items-center gap-1 disabled:opacity-60"
                  >
                    {loadingMoreRt && <Loader2 size={12} className="animate-spin" />}
                    Carregar mais (+{PAGE_SIZE})
                  </button>
                )}
              </div>

              {selectedRtRecord && (
                <div className="rounded-xl border border-emerald-200 bg-white p-3.5 space-y-3 shadow-sm">
                  <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div className="min-w-0">
                      <div className="text-[10px] font-black uppercase tracking-wider text-emerald-700">
                        RT Selecionado na Base
                      </div>
                      <div className="text-sm font-black text-slate-900 uppercase truncate">
                        {selectedRtRecord.nome}
                      </div>
                      <div className="text-xs text-slate-500">
                        {[
                          selectedRtRecord.registro_profissional || null,
                          selectedRtRecord.cpf ? `CPF: ${selectedRtRecord.cpf}` : null,
                        ]
                          .filter(Boolean)
                          .join(' • ') || 'Sem registro profissional cadastrado'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleClearSelectedRt}
                      className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 shrink-0"
                      title="Fechar seleção do RT"
                    >
                      <X size={15} />
                    </button>
                  </div>

                  {/* Alternância entre vincular ART já cadastrada ou cadastrar nova ART */}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setRtArtMode('existing');
                        setArtActionError(null);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                        rtArtMode === 'existing'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Vincular ART já cadastrada ({rtArts.length})
                    </button>
                    {!isMasterWriteBlocked && (
                      <button
                        type="button"
                        onClick={() => {
                          setRtArtMode('new');
                          setArtActionError(null);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors inline-flex items-center gap-1 ${
                          rtArtMode === 'new'
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <Plus size={13} />
                        Cadastrar nova ART para este RT
                      </button>
                    )}
                  </div>

                  {(rtArtMode === 'existing' || isMasterWriteBlocked) && (
                    <div className="space-y-2">
                      {loadingRtArts ? (
                        <div className="text-xs text-slate-500 flex items-center gap-2 py-2">
                          <Loader2 size={14} className="animate-spin text-emerald-600" />
                          Carregando ARTs cadastradas para este RT no Administra...
                        </div>
                      ) : rtArts.length === 0 ? (
                        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 flex flex-wrap items-center justify-between gap-2">
                          <span>
                            Nenhuma ART cadastrada para este RT no Administra
                            {isMasterWriteBlocked ? ' (cadastro direto bloqueado).' : '.'}
                          </span>
                          {!isMasterWriteBlocked && (
                            <button
                              type="button"
                              onClick={() => setRtArtMode('new')}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold text-[11px] hover:bg-emerald-700"
                            >
                              Cadastrar nova ART
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {rtArts.map((item) => {
                            const isAlreadyLinked = (linkedRTs || []).some(
                              (l) =>
                                l.nome.trim().toLowerCase() ===
                                  selectedRtRecord.nome.trim().toLowerCase() &&
                                l.art.trim().toUpperCase() === item.art.trim().toUpperCase()
                            );
                            return (
                              <div
                                key={item.id}
                                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 hover:border-emerald-300 transition-colors"
                              >
                                <div className="min-w-0">
                                  <div className="text-xs font-black text-slate-900">
                                    ART: {item.art}
                                  </div>
                                  <div className="text-[11px] text-slate-500 truncate">
                                    {[
                                      item.barragem_nome
                                        ? `Barragem: ${item.barragem_nome}${
                                            item.barragem_snisb ? ` (${item.barragem_snisb})` : ''
                                          }`
                                        : null,
                                      item.atividade || null,
                                      item.observacao || null,
                                    ]
                                      .filter(Boolean)
                                      .join(' • ') || 'ART vinculada ao cadastro deste RT'}
                                  </div>
                                </div>
                                {isAlreadyLinked ? (
                                  <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-[11px] font-bold shrink-0 inline-flex items-center gap-1">
                                    <CheckCircle2 size={12} />
                                    Vinculada
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleLinkExistingArt(item)}
                                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shrink-0 shadow-sm transition-colors"
                                  >
                                    Vincular ART
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {!isMasterWriteBlocked && rtArtMode === 'new' && (
                    <div className="space-y-2.5 rounded-lg bg-slate-50 border border-slate-200 p-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                            Número da nova ART *
                          </label>
                          <input
                            type="text"
                            value={newArtForm.art}
                            onChange={(e) =>
                              setNewArtForm((prev) => ({ ...prev, art: e.target.value }))
                            }
                            placeholder="Ex.: 1234567890"
                            className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                            Atividade / Função (opcional)
                          </label>
                          <input
                            type="text"
                            value={newArtForm.atividade}
                            onChange={(e) =>
                              setNewArtForm((prev) => ({ ...prev, atividade: e.target.value }))
                            }
                            placeholder="Ex.: Classificação / PSB / Projeto"
                            className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                            Observação (opcional)
                          </label>
                          <input
                            type="text"
                            value={newArtForm.observacao}
                            onChange={(e) =>
                              setNewArtForm((prev) => ({ ...prev, observacao: e.target.value }))
                            }
                            placeholder="Detalhes adicionais do vínculo..."
                            className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:border-emerald-500"
                          />
                        </div>
                      </div>

                      {selectedBarragemId && (
                        <div className="text-[11px] text-emerald-700 font-medium">
                          Será salva no Administra com vínculo ao RT
                          {selectedBarragemNome ? ` e à barragem "${selectedBarragemNome}"` : ''}.
                        </div>
                      )}

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => void handleSaveAndLinkNewArt()}
                          disabled={savingNewArt}
                          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm disabled:opacity-60"
                        >
                          {savingNewArt ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Save size={13} />
                          )}
                          Salvar no Administra e Vincular
                        </button>
                      </div>
                    </div>
                  )}

                  {artActionError && (
                    <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      {artActionError}
                    </div>
                  )}
                  {artActionSuccess && (
                    <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                        <span>{artActionSuccess}</span>
                      </div>
                      <button
                        type="button"
                        onClick={handlePrepareAddAnotherRt}
                        className="px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-[11px] font-bold inline-flex items-center gap-1 shrink-0 transition-colors"
                      >
                        <Plus size={12} />
                        Adicionar outro RT
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showRtSelector && linkedRTs !== undefined && (
        <div className="bg-white rounded-xl border border-emerald-200 p-3.5 space-y-2.5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-black text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
              <UserCheck size={14} className="text-emerald-600" />
              RTs e ARTs Vinculados ao Projeto ({linkedRTs.length})
            </h4>
            {!readOnly && (
              <button
                type="button"
                onClick={handlePrepareAddAnotherRt}
                className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[11px] font-bold inline-flex items-center gap-1 transition-colors"
              >
                <Plus size={12} />
                Adicionar outro RT
              </button>
            )}
          </div>

          {linkedRTs.length > 0 ? (
            <div className="space-y-2">
              {linkedRtFeedback && (
                <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  {linkedRtFeedback}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {linkedRTs.map((rt) => {
                  const isRegistered = Boolean(rt.rtId || rt.registeredInAdministra);
                  const isRegLoading = registeringRtEntryId === rt.id;
                  return (
                    <div
                      key={rt.id}
                      className={`flex justify-between items-start gap-2 p-2.5 border rounded-lg ${
                        isRegistered
                          ? 'bg-emerald-50/40 border-emerald-100'
                          : 'bg-amber-50/50 border-amber-200'
                      }`}
                    >
                      <div className="flex flex-col min-w-0 gap-1 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-800 text-xs uppercase truncate" title={rt.nome}>
                            {rt.nome}
                          </span>
                          {isRegistered && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[9px] font-bold uppercase shrink-0">
                              Cadastrado no Administra
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-600">ART: {rt.art || '—'}</span>
                        {!isRegistered && !readOnly && onRegisterLinkedRT && currentUser && !isMasterWriteBlocked && (
                          <button
                            type="button"
                            disabled={isRegLoading}
                            onClick={async () => {
                              setLinkedRtFeedback(null);
                              setRegisteringRtEntryId(rt.id);
                              try {
                                const res = await createResponsavelTecnicoInAdministra(
                                  {
                                    nome: rt.nome,
                                    cpf: rt.cpf,
                                    registro_profissional: rt.registroProfissional,
                                    art: rt.art,
                                    barragemId: selectedBarragemId || null,
                                  },
                                  currentUser
                                );
                                if (res.success && res.data?.rt?.id && !res.blocked) {
                                  onRegisterLinkedRT(
                                    rt.id,
                                    res.data.rt.id,
                                    res.data.artItem?.art || rt.art
                                  );
                                } else {
                                  setLinkedRtFeedback(
                                    res.message || 'Não foi possível cadastrar o RT na base de dados.'
                                  );
                                }
                              } finally {
                                setRegisteringRtEntryId(null);
                              }
                            }}
                            className="mt-1 self-start px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold inline-flex items-center gap-1 shadow-sm disabled:opacity-60"
                          >
                            {isRegLoading ? (
                              <Loader2 size={11} className="animate-spin" />
                            ) : (
                              <UserPlus size={11} />
                            )}
                            Cadastrar Responsável Técnico na base de dados
                          </button>
                        )}
                        {!isRegistered && !readOnly && isMasterWriteBlocked && (
                          <span className="mt-1 text-[10px] font-semibold text-amber-800">
                            RT sem vínculo ao Administra (gravação direta bloqueada).
                          </span>
                        )}
                      </div>
                      {!readOnly && onRemoveRT && (
                        <button
                          type="button"
                          onClick={() => onRemoveRT(rt.id)}
                          className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-1 rounded transition-colors shrink-0"
                          title="Remover RT deste parecer"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Nenhum RT vinculado ao parecer. Selecione ou cadastre um RT acima e vincule sua ART (é possível adicionar mais de um RT com ART para equipe multidisciplinar).
            </p>
          )}
        </div>
      )}

      {(loadingProducts || relatedProducts.length > 0) && (
        <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-600">
            <FileCheck2 size={14} className="text-blue-600" />
            Produtos identificados no Ecossistema CSB ({relatedProducts.length})
          </div>
          {loadingProducts ? (
            <p className="text-xs text-slate-400">
              Consultando Classifica, Notifica e Fiscaliza...
            </p>
          ) : (
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {relatedProducts.map((p) => (
                <div
                  key={`${p.sistema_origem}-${p.id}`}
                  className="flex items-center justify-between text-xs bg-slate-50 px-3 py-2 rounded-lg border border-slate-100"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[9px] font-black uppercase shrink-0">
                      {SYSTEM_LABELS[p.sistema_origem]}
                    </span>
                    <span className="font-bold text-slate-700 truncate">
                      {p.tipo_produto} {p.numero_documento ? `(${p.numero_documento})` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-[10px] text-slate-500">
                    <span>{p.status || '—'}</span>
                    {p.sistema_origem !== 'CLASSIFICA_CSB' && (
                      <span
                        title="Somente leitura — gerenciado pelo sistema de origem"
                        className="text-amber-600"
                      >
                        <Lock size={12} />
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Indicadores de vínculo */}
      <div className="flex flex-col items-start gap-2 pt-1">
        <div
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold border ${
            selectedEmpreendedorId
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-amber-50 text-amber-800 border-amber-200'
          }`}
        >
          <Database size={13} className="shrink-0" />
          {selectedEmpreendedorId
            ? 'Empreendedor vinculado à base central do Administra.'
            : isMasterWriteBlocked
            ? 'Empreendedor não vinculado ao ID do Administra — gravação direta bloqueada; selecione pela busca acima quando disponível.'
            : 'Empreendedor não vinculado — mantido localmente em Rascunho; cadastre na base de dados antes de concluir.'}
        </div>

        <div
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold border ${
            selectedBarragemId
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-amber-50 text-amber-800 border-amber-200'
          }`}
        >
          <Waves size={13} className="shrink-0" />
          {selectedBarragemId
            ? 'Barragem vinculada à base central do Administra.'
            : isMasterWriteBlocked
            ? 'Barragem não vinculada ao ID do Administra — gravação direta bloqueada; selecione pela busca acima quando disponível.'
            : 'Barragem não vinculada — mantida localmente em Rascunho; cadastre na base de dados antes de concluir.'}
        </div>

        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold border bg-blue-50 text-blue-700 border-blue-200">
          <Pencil size={13} className="shrink-0" />
          {isMasterWriteBlocked
            ? 'Administra Barragens é a fonte única dos cadastros mestres; gravação direta pelo Classifica 2.0 está bloqueada até a API híbrida.'
            : 'Dados preenchidos manualmente exigem clique em "Cadastrar ... na base de dados" para concluir o documento.'}
        </div>
      </div>

      {!administraReady && statusError && (
        <p className="text-[11px] text-amber-800 flex items-center gap-1.5 bg-amber-50/80 border border-amber-200 rounded-xl px-3 py-2">
          <ShieldAlert size={14} className="text-amber-600 shrink-0" />
          {statusError}
        </p>
      )}
    </div>
  );
};
