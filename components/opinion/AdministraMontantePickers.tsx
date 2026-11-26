import React, { useEffect, useState } from 'react';
import { Building2, CheckCircle2, Database, Loader2, Search, Unlink, Waves, X } from 'lucide-react';
import { BarragemMaster, EmpreendedorMaster } from '../../types';
import {
  searchBarragens,
  searchEmpreendedores,
} from '../../src/services/administraService';
import {
  applyPaginatedPageResult,
  createInitialPaginatedState,
  formatPaginationCounterText,
  PaginatedEntityState,
  resetPaginatedSearchState,
} from '../../src/utils/administraPagination';

const PICKER_PAGE_SIZE = 25;

interface AdministraBarragemMontantePickerProps {
  selectedBarragemId?: string;
  selectedBarragemNome?: string;
  readOnly?: boolean;
  onSelectBarragem: (bar: BarragemMaster) => void;
  onUnlinkBarragem?: () => void;
}

export const AdministraBarragemMontantePicker: React.FC<
  AdministraBarragemMontantePickerProps
> = ({
  selectedBarragemId,
  selectedBarragemNome,
  readOnly = false,
  onSelectBarragem,
  onUnlinkBarragem,
}) => {
  const [term, setTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [showBrowseList, setShowBrowseList] = useState(false);

  const [browseState, setBrowseState] = useState<PaginatedEntityState<BarragemMaster>>(() =>
    createInitialPaginatedState<BarragemMaster>(PICKER_PAGE_SIZE)
  );
  const [searchState, setSearchState] = useState<PaginatedEntityState<BarragemMaster>>(() =>
    createInitialPaginatedState<BarragemMaster>(PICKER_PAGE_SIZE)
  );
  const [selectedRecord, setSelectedRecord] = useState<BarragemMaster | null>(null);
  const [loadingBrowse, setLoadingBrowse] = useState(false);
  const [loadingMoreBrowse, setLoadingMoreBrowse] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingMoreSearch, setLoadingMoreSearch] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTerm(term), 200);
    return () => clearTimeout(timer);
  }, [term]);

  const loadBrowsePage = async (page: number, append: boolean) => {
    if (readOnly) return;
    if (append) setLoadingMoreBrowse(true);
    else setLoadingBrowse(true);
    setErrorMsg(null);
    try {
      const res = await searchBarragens('', undefined, PICKER_PAGE_SIZE, page);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setBrowseState((prev) =>
          applyPaginatedPageResult(prev, {
            query: '',
            page: res.page || page,
            pageSize: PICKER_PAGE_SIZE,
            items: res.data,
            hasMore: res.hasMore,
            total: typeof res.total === 'number' ? res.total : null,
            append,
            selectedItem: selectedRecord,
          })
        );
      }
    } finally {
      if (append) setLoadingMoreBrowse(false);
      else setLoadingBrowse(false);
    }
  };

  useEffect(() => {
    if (readOnly) return;
    const clean = debouncedTerm.trim();
    if (!clean) {
      setSearchState(createInitialPaginatedState<BarragemMaster>(PICKER_PAGE_SIZE));
      return;
    }

    let alive = true;
    setLoadingSearch(true);
    setErrorMsg(null);
    setSearchState(resetPaginatedSearchState<BarragemMaster>(clean, PICKER_PAGE_SIZE));

    void searchBarragens(clean, undefined, PICKER_PAGE_SIZE, 1)
      .then((res) => {
        if (!alive) return;
        if (res.error) {
          setErrorMsg(res.error);
        } else {
          setSearchState((prev) =>
            applyPaginatedPageResult(prev, {
              query: clean,
              page: res.page || 1,
              pageSize: PICKER_PAGE_SIZE,
              items: res.data,
              hasMore: res.hasMore,
              total: typeof res.total === 'number' ? res.total : null,
              append: false,
            })
          );
        }
      })
      .finally(() => {
        if (alive) setLoadingSearch(false);
      });

    return () => {
      alive = false;
    };
  }, [debouncedTerm, readOnly]);

  const handleLoadMoreSearch = async () => {
    const clean = debouncedTerm.trim();
    if (!clean || !searchState.hasMore || loadingMoreSearch) return;
    const nextPage = searchState.page + 1;
    setLoadingMoreSearch(true);
    try {
      const res = await searchBarragens(clean, undefined, PICKER_PAGE_SIZE, nextPage);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setSearchState((prev) =>
          prev.query !== clean
            ? prev
            : applyPaginatedPageResult(prev, {
                query: clean,
                page: res.page || nextPage,
                pageSize: PICKER_PAGE_SIZE,
                items: res.data,
                hasMore: res.hasMore,
                total: typeof res.total === 'number' ? res.total : prev.total,
                append: true,
              })
        );
      }
    } finally {
      setLoadingMoreSearch(false);
    }
  };

  const handleChoose = (bar: BarragemMaster) => {
    setSelectedRecord(bar);
    onSelectBarragem(bar);
    setTerm('');
    setDebouncedTerm('');
    setSearchState(createInitialPaginatedState<BarragemMaster>(PICKER_PAGE_SIZE));
  };

  if (readOnly) {
    return null;
  }

  return (
    <div className="rounded-lg border border-emerald-200 bg-white p-3 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-emerald-800">
          <Waves size={13} className="text-emerald-600" />
          Selecionar barragem existente no Administra (somente leitura)
        </div>
        <button
          type="button"
          onClick={() => {
            const nextOpen = !showBrowseList;
            setShowBrowseList(nextOpen);
            if (nextOpen && browseState.items.length === 0) {
              void loadBrowsePage(1, false);
            }
          }}
          className="px-2.5 py-1 rounded-md border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-[11px] font-bold text-emerald-800 transition-colors"
        >
          {showBrowseList ? 'Ocultar lista paginada' : 'Navegar lista paginada'}
        </button>
      </div>

      <p className="text-[11px] text-slate-500">
        Busque uma barragem existente para preencher o vínculo canônico e apenas campos ainda vazios. Dados já digitados e campos mascarados não serão sobrescritos.
      </p>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Buscar barragem a montante por nome, SNISB ou município..."
          className="w-full pl-9 pr-14 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg outline-none focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all"
        />
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {loadingSearch && <Loader2 size={13} className="animate-spin text-emerald-600" />}
          {term && (
            <button
              type="button"
              onClick={() => {
                setTerm('');
                setDebouncedTerm('');
                setSearchState(createInitialPaginatedState<BarragemMaster>(PICKER_PAGE_SIZE));
                setErrorMsg(null);
              }}
              aria-label="Limpar busca de barragem a montante"
              className="p-0.5 text-slate-400 hover:text-slate-700 rounded"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
          {errorMsg}
        </div>
      )}

      {term.trim().length > 0 && (
        <div className="rounded-lg border border-emerald-200 bg-white max-h-56 overflow-y-auto divide-y divide-slate-100">
          {searchState.items.length > 0 ? (
            <>
              {searchState.items.map((bar) => (
                <div
                  key={bar.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-emerald-50/50 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-800 uppercase truncate">
                      {bar.nome}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
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
                    onClick={() => handleChoose(bar)}
                    className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold uppercase shrink-0"
                  >
                    USAR
                  </button>
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-50 text-[11px] text-slate-600">
                <span>
                  {formatPaginationCounterText(
                    searchState.items.length,
                    searchState.total,
                    searchState.hasMore,
                    'barragens encontradas'
                  )}
                </span>
                {searchState.hasMore && (
                  <button
                    type="button"
                    disabled={loadingMoreSearch}
                    onClick={() => void handleLoadMoreSearch()}
                    className="px-2 py-1 rounded bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold inline-flex items-center gap-1 disabled:opacity-60"
                  >
                    {loadingMoreSearch && <Loader2 size={11} className="animate-spin" />}
                    Carregar mais (+{PICKER_PAGE_SIZE})
                  </button>
                )}
              </div>
            </>
          ) : loadingSearch ? (
            <div className="px-3 py-3 text-xs text-slate-500 flex items-center gap-2">
              <Loader2 size={13} className="animate-spin text-emerald-600" />
              Buscando barragens no Administra...
            </div>
          ) : (
            <div className="px-3 py-3 text-xs text-slate-500">
              Nenhuma barragem encontrada para &ldquo;{term}&rdquo;.
            </div>
          )}
        </div>
      )}

      {showBrowseList && (
        <div className="space-y-1.5">
          <select
            value={selectedBarragemId || ''}
            onChange={(e) => {
              const chosen = browseState.items.find((b) => b.id === e.target.value);
              if (chosen) handleChoose(chosen);
            }}
            className="w-full px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-300 rounded-lg outline-none focus:bg-white focus:border-emerald-500"
          >
            <option value="">
              -- Escolher barragem existente ({browseState.items.length}) --
            </option>
            {selectedBarragemId &&
              !browseState.items.some((b) => b.id === selectedBarragemId) && (
                <option value={selectedBarragemId}>
                  {selectedBarragemNome || `Barragem vinculada (${selectedBarragemId})`}
                </option>
              )}
            {browseState.items.map((bar) => (
              <option key={bar.id} value={bar.id}>
                {bar.nome}
                {bar.municipio ? ` — ${bar.municipio}` : ''}
                {bar.snisb ? ` (SNISB: ${bar.snisb})` : ''}
              </option>
            ))}
          </select>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
            <span>
              {loadingBrowse
                ? 'Carregando barragens...'
                : formatPaginationCounterText(
                    browseState.items.length,
                    browseState.total,
                    browseState.hasMore,
                    'barragens'
                  )}
            </span>
            {browseState.hasMore && (
              <button
                type="button"
                disabled={loadingMoreBrowse}
                onClick={() => void loadBrowsePage(browseState.page + 1, true)}
                className="px-2 py-1 rounded bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold inline-flex items-center gap-1 disabled:opacity-60"
              >
                {loadingMoreBrowse && <Loader2 size={11} className="animate-spin" />}
                Carregar mais (+{PICKER_PAGE_SIZE})
              </button>
            )}
          </div>
        </div>
      )}

      {selectedBarragemId && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] bg-emerald-50 border border-emerald-200 rounded-md px-2.5 py-1.5 text-emerald-800">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
            ID Administra vinculado: <code className="font-mono">{selectedBarragemId}</code>
          </span>
          {onUnlinkBarragem && (
            <button
              type="button"
              onClick={onUnlinkBarragem}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600 hover:text-red-600 font-bold"
            >
              <Unlink size={11} /> Desvincular
            </button>
          )}
        </div>
      )}
    </div>
  );
};

interface AdministraEmpreendedorMontantePickerProps {
  selectedEmpreendedorId?: string;
  selectedEmpreendedorNome?: string;
  readOnly?: boolean;
  onSelectEmpreendedor: (emp: EmpreendedorMaster) => void;
  onClearEmpreendedor: () => void;
}

export const AdministraEmpreendedorMontantePicker: React.FC<
  AdministraEmpreendedorMontantePickerProps
> = ({
  selectedEmpreendedorId,
  selectedEmpreendedorNome,
  readOnly = false,
  onSelectEmpreendedor,
  onClearEmpreendedor,
}) => {
  const [term, setTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [showBrowseList, setShowBrowseList] = useState(false);

  const [browseState, setBrowseState] = useState<PaginatedEntityState<EmpreendedorMaster>>(() =>
    createInitialPaginatedState<EmpreendedorMaster>(PICKER_PAGE_SIZE)
  );
  const [searchState, setSearchState] = useState<PaginatedEntityState<EmpreendedorMaster>>(() =>
    createInitialPaginatedState<EmpreendedorMaster>(PICKER_PAGE_SIZE)
  );
  const [selectedRecord, setSelectedRecord] = useState<EmpreendedorMaster | null>(null);
  const [loadingBrowse, setLoadingBrowse] = useState(false);
  const [loadingMoreBrowse, setLoadingMoreBrowse] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingMoreSearch, setLoadingMoreSearch] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTerm(term), 200);
    return () => clearTimeout(timer);
  }, [term]);

  const loadBrowsePage = async (page: number, append: boolean) => {
    if (readOnly) return;
    if (append) setLoadingMoreBrowse(true);
    else setLoadingBrowse(true);
    setErrorMsg(null);
    try {
      const res = await searchEmpreendedores('', PICKER_PAGE_SIZE, page);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setBrowseState((prev) =>
          applyPaginatedPageResult(prev, {
            query: '',
            page: res.page || page,
            pageSize: PICKER_PAGE_SIZE,
            items: res.data,
            hasMore: res.hasMore,
            total: typeof res.total === 'number' ? res.total : null,
            append,
            selectedItem: selectedRecord,
          })
        );
      }
    } finally {
      if (append) setLoadingMoreBrowse(false);
      else setLoadingBrowse(false);
    }
  };

  useEffect(() => {
    if (readOnly) return;
    const clean = debouncedTerm.trim();
    if (!clean) {
      setSearchState(createInitialPaginatedState<EmpreendedorMaster>(PICKER_PAGE_SIZE));
      return;
    }

    let alive = true;
    setLoadingSearch(true);
    setErrorMsg(null);
    setSearchState(resetPaginatedSearchState<EmpreendedorMaster>(clean, PICKER_PAGE_SIZE));

    void searchEmpreendedores(clean, PICKER_PAGE_SIZE, 1)
      .then((res) => {
        if (!alive) return;
        if (res.error) {
          setErrorMsg(res.error);
        } else {
          setSearchState((prev) =>
            applyPaginatedPageResult(prev, {
              query: clean,
              page: res.page || 1,
              pageSize: PICKER_PAGE_SIZE,
              items: res.data,
              hasMore: res.hasMore,
              total: typeof res.total === 'number' ? res.total : null,
              append: false,
            })
          );
        }
      })
      .finally(() => {
        if (alive) setLoadingSearch(false);
      });

    return () => {
      alive = false;
    };
  }, [debouncedTerm, readOnly]);

  const handleLoadMoreSearch = async () => {
    const clean = debouncedTerm.trim();
    if (!clean || !searchState.hasMore || loadingMoreSearch) return;
    const nextPage = searchState.page + 1;
    setLoadingMoreSearch(true);
    try {
      const res = await searchEmpreendedores(clean, PICKER_PAGE_SIZE, nextPage);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setSearchState((prev) =>
          prev.query !== clean
            ? prev
            : applyPaginatedPageResult(prev, {
                query: clean,
                page: res.page || nextPage,
                pageSize: PICKER_PAGE_SIZE,
                items: res.data,
                hasMore: res.hasMore,
                total: typeof res.total === 'number' ? res.total : prev.total,
                append: true,
              })
        );
      }
    } finally {
      setLoadingMoreSearch(false);
    }
  };

  const handleChoose = (emp: EmpreendedorMaster) => {
    setSelectedRecord(emp);
    onSelectEmpreendedor(emp);
    setTerm('');
    setDebouncedTerm('');
    setSearchState(createInitialPaginatedState<EmpreendedorMaster>(PICKER_PAGE_SIZE));
  };

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
          <Building2 size={13} className="text-emerald-600" />
          Empreendedor desta barragem (opcional — busca no Administra)
        </span>
        {!readOnly && (
          <button
            type="button"
            onClick={() => {
              const nextOpen = !showBrowseList;
              setShowBrowseList(nextOpen);
              if (nextOpen && browseState.items.length === 0) {
                void loadBrowsePage(1, false);
              }
            }}
            className="px-2 py-0.5 rounded border border-slate-300 bg-white hover:bg-emerald-50 text-[11px] font-semibold text-slate-700"
          >
            {showBrowseList ? 'Ocultar lista' : 'Listar empreendedores'}
          </button>
        )}
      </div>

      {selectedEmpreendedorId ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-900">
          <span className="inline-flex items-center gap-1.5 font-semibold min-w-0">
            <Database size={12} className="text-emerald-600 shrink-0" />
            <span className="truncate">
              {selectedEmpreendedorNome || 'Empreendedor vinculado'}
            </span>
          </span>
          {!readOnly && (
            <button
              type="button"
              onClick={onClearEmpreendedor}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-slate-200 text-[11px] font-bold text-slate-600 hover:text-red-600"
            >
              <Unlink size={11} /> Desvincular
            </button>
          )}
        </div>
      ) : (
        selectedEmpreendedorNome && (
          <div className="text-xs text-slate-700 font-medium">
            Empreendedor informado: {selectedEmpreendedorNome}
          </div>
        )
      )}

      {!readOnly && (
        <>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Buscar empreendedor existente (nome, CPF/CNPJ ou CAR)..."
              className="w-full pl-8 pr-12 py-2 text-xs bg-white border border-slate-300 rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
            />
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {loadingSearch && <Loader2 size={12} className="animate-spin text-emerald-600" />}
              {term && (
                <button
                  type="button"
                  onClick={() => {
                    setTerm('');
                    setDebouncedTerm('');
                    setSearchState(createInitialPaginatedState<EmpreendedorMaster>(PICKER_PAGE_SIZE));
                    setErrorMsg(null);
                  }}
                  aria-label="Limpar busca de empreendedor a montante"
                  className="p-0.5 text-slate-400 hover:text-slate-700 rounded"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {errorMsg && (
            <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              {errorMsg}
            </div>
          )}

          {term.trim().length > 0 && (
            <div className="rounded-lg border border-emerald-200 bg-white max-h-48 overflow-y-auto divide-y divide-slate-100">
              {searchState.items.length > 0 ? (
                <>
                  {searchState.items.map((emp) => (
                    <div
                      key={emp.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-emerald-50/50"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-800 uppercase truncate">
                          {emp.razao_social}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {[emp.cpf_cnpj || null, emp.num_car ? `CAR: ${emp.num_car}` : null, emp.municipio || null]
                            .filter(Boolean)
                            .join(' • ') || 'Sem documento informado'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleChoose(emp)}
                        className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold uppercase shrink-0"
                      >
                        USAR
                      </button>
                    </div>
                  ))}
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-50 text-[11px] text-slate-600">
                    <span>
                      {formatPaginationCounterText(
                        searchState.items.length,
                        searchState.total,
                        searchState.hasMore,
                        'empreendedores encontrados'
                      )}
                    </span>
                    {searchState.hasMore && (
                      <button
                        type="button"
                        disabled={loadingMoreSearch}
                        onClick={() => void handleLoadMoreSearch()}
                        className="px-2 py-1 rounded bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold inline-flex items-center gap-1 disabled:opacity-60"
                      >
                        {loadingMoreSearch && <Loader2 size={11} className="animate-spin" />}
                        Carregar mais (+{PICKER_PAGE_SIZE})
                      </button>
                    )}
                  </div>
                </>
              ) : loadingSearch ? (
                <div className="px-3 py-2.5 text-xs text-slate-500 flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin text-emerald-600" />
                  Buscando empreendedores no Administra...
                </div>
              ) : (
                <div className="px-3 py-2.5 text-xs text-slate-500">
                  Nenhum empreendedor encontrado para &ldquo;{term}&rdquo;.
                </div>
              )}
            </div>
          )}

          {showBrowseList && (
            <div className="space-y-1.5">
              <select
                value={selectedEmpreendedorId || ''}
                onChange={(e) => {
                  const chosen = browseState.items.find((emp) => emp.id === e.target.value);
                  if (chosen) handleChoose(chosen);
                }}
                className="w-full px-3 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg outline-none focus:border-emerald-500"
              >
                <option value="">
                  -- Escolher empreendedor existente ({browseState.items.length}) --
                </option>
                {selectedEmpreendedorId &&
                  !browseState.items.some((e) => e.id === selectedEmpreendedorId) && (
                    <option value={selectedEmpreendedorId}>
                      {selectedEmpreendedorNome || `Empreendedor vinculado (${selectedEmpreendedorId})`}
                    </option>
                  )}
                {browseState.items.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.razao_social}
                    {emp.cpf_cnpj ? ` — ${emp.cpf_cnpj}` : ''}
                    {emp.num_car ? ` • CAR: ${emp.num_car}` : ''}
                  </option>
                ))}
              </select>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                <span>
                  {loadingBrowse
                    ? 'Carregando empreendedores...'
                    : formatPaginationCounterText(
                        browseState.items.length,
                        browseState.total,
                        browseState.hasMore,
                        'empreendedores'
                      )}
                </span>
                {browseState.hasMore && (
                  <button
                    type="button"
                    disabled={loadingMoreBrowse}
                    onClick={() => void loadBrowsePage(browseState.page + 1, true)}
                    className="px-2 py-1 rounded bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold inline-flex items-center gap-1 disabled:opacity-60"
                  >
                    {loadingMoreBrowse && <Loader2 size={11} className="animate-spin" />}
                    Carregar mais (+{PICKER_PAGE_SIZE})
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
