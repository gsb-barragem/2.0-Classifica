import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Edit2,
  Eye,
  Filter,
  History,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Send,
  UserCheck,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { AuthContext } from '../src/contexts/AuthContext';
import { AppDocument, DataContext } from '../src/contexts/DataContext';
import {
  PendenciaHistoricoRecord,
  PendenciaRecord,
  PendenciaSituacao,
  PendenciaUsuarioOption,
} from '../types';
import {
  alterarSituacaoPendencia,
  createPendencia,
  direcionarPendencia,
  editarPendencia,
  listAssignableUsersForAdmin,
  listPendenciaHistorico,
  listPendencias,
  matchesActorUserId,
  PENDENCIA_SITUACAO_LABELS,
  PENDENCIA_SITUACOES,
  VerifiedSessionActor,
} from '../src/services/pendenciasService';

type PendenciaTab = 'minhas' | 'geral' | 'direcionado';

const PENDENCIA_TIPOS = [
  'Documentação',
  'Análise Técnica',
  'Regularização Cadastral',
  'ART / Responsável Técnico',
  'Classificação DPA / CRI',
  'Outro',
];

const SITUACAO_BADGE_CLASSES: Record<PendenciaSituacao, string> = {
  aberta: 'bg-amber-100 text-amber-800 border-amber-200',
  direcionada: 'bg-blue-100 text-blue-800 border-blue-200',
  em_analise: 'bg-purple-100 text-purple-800 border-purple-200',
  resolvida: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  cancelada: 'bg-slate-100 text-slate-600 border-slate-200',
};

const ACAO_LABELS: Record<string, string> = {
  criacao: 'Criação',
  direcionamento: 'Direcionamento',
  mudanca_situacao: 'Mudança de situação',
  edicao: 'Edição',
  resolucao: 'Resolução',
};

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all';

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('pt-BR');
}

function getDocumentRefSummary(doc: AppDocument): {
  refId: string;
  tipoRef: string;
  origemRefId: string | null;
  empreendedorId: string | null;
  barragemId: string | null;
  label: string;
} {
  const raw = doc as any;
  const numero =
    raw.protocolo || raw.processo || raw.numProcesso || raw.nProcesso || doc.id || 'Sem número';
  return {
    refId: doc.id || '',
    tipoRef: doc.tipo_documento,
    origemRefId: numero ? String(numero) : null,
    empreendedorId: doc.empreendedorId || null,
    barragemId: doc.barragemId || null,
    label: `${doc.tipo_documento} — ${numero}`,
  };
}

export const PendenciasModule: React.FC = () => {
  const { currentUser } = useContext(AuthContext);
  const { documents } = useContext(DataContext);

  const [verifiedActor, setVerifiedActor] = useState<VerifiedSessionActor | null>(null);
  const [pendencias, setPendencias] = useState<PendenciaRecord[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<PendenciaUsuarioOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<PendenciaTab>('minhas');
  const [searchTerm, setSearchTerm] = useState('');
  const [situacaoFilter, setSituacaoFilter] = useState<'todas' | PendenciaSituacao>('todas');

  // Create Modal State
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [selectedDocIdCreate, setSelectedDocIdCreate] = useState('');
  const [createForm, setCreateForm] = useState({
    tipo: 'Documentação',
    tipoCustom: '',
    titulo: '',
    descricao: '',
    origem_ref_id: '',
    tipo_referencia: '',
    referencia_id: '',
    empreendedor_id: '',
    barragem_id: '',
    responsavel_id: '',
    motivo: '',
  });

  // Detail / Edit / Direcionar / History Modal State
  const [selectedPendencia, setSelectedPendencia] = useState<PendenciaRecord | null>(null);
  const [historico, setHistorico] = useState<PendenciaHistoricoRecord[]>([]);
  const [historicoLoading, setHistoricoLoading] = useState(false);
  const [historicoError, setHistoricoError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [selectedDocIdEdit, setSelectedDocIdEdit] = useState('');
  const [editForm, setEditForm] = useState({
    tipo: '',
    tipoCustom: '',
    titulo: '',
    descricao: '',
    origem_ref_id: '',
    tipo_referencia: '',
    referencia_id: '',
    empreendedor_id: '',
    barragem_id: '',
    motivo: '',
  });

  const [direcionarTargetId, setDirecionarTargetId] = useState('');
  const [direcionarMotivo, setDirecionarMotivo] = useState('');

  const [situacaoTarget, setSituacaoTarget] = useState<PendenciaSituacao>('em_analise');
  const [situacaoMotivo, setSituacaoMotivo] = useState('');

  const effectiveActor = useMemo(() => {
    if (verifiedActor) return verifiedActor;
    if (!currentUser) return null;
    return {
      authUserId: currentUser.authUserId,
      profileId: currentUser.id,
      name: currentUser.name,
      email: currentUser.email || '',
      role: currentUser.role,
    };
  }, [verifiedActor, currentUser]);

  const isAdmin = effectiveActor?.role === 'Administrador';
  const canWrite = effectiveActor ? effectiveActor.role !== 'Visualizador' : false;

  // Ensure non-admins cannot stay on the Admin-only tab
  useEffect(() => {
    if (!isAdmin && activeTab === 'direcionado') {
      setActiveTab('minhas');
    }
  }, [isAdmin, activeTab]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { actor, items } = await listPendencias();
      setVerifiedActor(actor);
      setPendencias(items);

      if (actor.role === 'Administrador') {
        try {
          const users = await listAssignableUsersForAdmin();
          setAssignableUsers(users);
        } catch {
          setAssignableUsers([]);
        }
      } else {
        setAssignableUsers([]);
      }
    } catch (err: any) {
      setError(err?.message || 'Não foi possível carregar as pendências.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser) {
      void loadData();
    }
  }, [currentUser, loadData]);

  const usersLookupMap = useMemo(() => {
    const map = new Map<string, string>();
    if (effectiveActor) {
      map.set(effectiveActor.authUserId, effectiveActor.name);
      map.set(effectiveActor.profileId, effectiveActor.name);
    }
    assignableUsers.forEach((u) => {
      map.set(u.id, u.name);
      map.set(u.authUserId, u.name);
    });
    return map;
  }, [effectiveActor, assignableUsers]);

  const resolveUserName = useCallback(
    (userId?: string | null): string => {
      if (!userId) return 'Não atribuído';
      const found = usersLookupMap.get(userId);
      if (found) return found;
      return `Usuário (${userId.slice(0, 8)})`;
    },
    [usersLookupMap]
  );

  const activeAssignableUsers = useMemo(
    () => assignableUsers.filter((u) => u.active),
    [assignableUsers]
  );

  const loadHistorico = useCallback(async (pendenciaId: string) => {
    setHistoricoLoading(true);
    setHistoricoError(null);
    try {
      const rows = await listPendenciaHistorico(pendenciaId);
      setHistorico(rows);
    } catch (err: any) {
      setHistoricoError(err?.message || 'Não foi possível carregar o histórico.');
      setHistorico([]);
    } finally {
      setHistoricoLoading(false);
    }
  }, []);

  const openPendenciaDetail = (item: PendenciaRecord, startInEdit = false) => {
    setSelectedPendencia(item);
    setActionError(null);
    setIsEditing(startInEdit);
    setSelectedDocIdEdit('');
    const isKnownTipo = PENDENCIA_TIPOS.includes(item.tipo) && item.tipo !== 'Outro';
    setEditForm({
      tipo: isKnownTipo ? item.tipo : 'Outro',
      tipoCustom: isKnownTipo ? '' : item.tipo,
      titulo: item.titulo || '',
      descricao: item.descricao || '',
      origem_ref_id: item.origem_ref_id || '',
      tipo_referencia: item.tipo_referencia || '',
      referencia_id: item.referencia_id || '',
      empreendedor_id: item.empreendedor_id || '',
      barragem_id: item.barragem_id || '',
      motivo: '',
    });
    setDirecionarTargetId(item.responsavel_id || '');
    setDirecionarMotivo('');
    setSituacaoTarget(item.situacao);
    setSituacaoMotivo('');
    void loadHistorico(item.id);
  };

  const refreshAfterMutation = async (updatedId?: string) => {
    const { actor, items } = await listPendencias();
    setVerifiedActor(actor);
    setPendencias(items);
    if (updatedId) {
      const refreshed = items.find((p) => p.id === updatedId) || null;
      if (refreshed) {
        setSelectedPendencia(refreshed);
        setDirecionarTargetId(refreshed.responsavel_id || '');
        setSituacaoTarget(refreshed.situacao);
      }
      await loadHistorico(updatedId);
    }
  };

  const tabCounts = useMemo(() => {
    const minhas = pendencias.filter((p) => matchesActorUserId(p.responsavel_id, effectiveActor)).length;
    const geral = pendencias.length;
    const direcionado = pendencias.filter((p) => Boolean(p.responsavel_id)).length;
    return { minhas, geral, direcionado };
  }, [pendencias, effectiveActor]);

  const filteredPendencias = useMemo(() => {
    const base = pendencias.filter((p) => {
      if (activeTab === 'minhas') {
        return matchesActorUserId(p.responsavel_id, effectiveActor);
      }
      if (activeTab === 'direcionado') {
        return isAdmin && Boolean(p.responsavel_id);
      }
      return true;
    });

    return base.filter((p) => {
      if (situacaoFilter !== 'todas' && p.situacao !== situacaoFilter) {
        return false;
      }
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const hay = [
          p.titulo,
          p.tipo,
          p.descricao || '',
          p.origem,
          p.origem_ref_id || '',
          p.tipo_referencia || '',
          p.referencia_id || '',
          resolveUserName(p.responsavel_id),
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [pendencias, activeTab, effectiveActor, isAdmin, situacaoFilter, searchTerm, resolveUserName]);

  const canResolveItem = useCallback(
    (item: PendenciaRecord): boolean => {
      if (!canWrite || !effectiveActor) return false;
      if (item.situacao === 'resolvida' || item.situacao === 'cancelada') return false;
      if (isAdmin) return true;
      if (!item.responsavel_id) return true;
      return matchesActorUserId(item.responsavel_id, effectiveActor);
    },
    [canWrite, effectiveActor, isAdmin]
  );

  const canEditItem = useCallback(
    (item: PendenciaRecord): boolean => {
      if (!canWrite || !effectiveActor) return false;
      if (isAdmin) return true;
      return (
        !item.responsavel_id ||
        matchesActorUserId(item.responsavel_id, effectiveActor) ||
        matchesActorUserId(item.criado_por, effectiveActor)
      );
    },
    [canWrite, effectiveActor, isAdmin]
  );

  const selectableDocs = useMemo(
    () => documents.filter((d) => Boolean(d.id)).map(getDocumentRefSummary),
    [documents]
  );

  const handleSelectDocForCreate = (docId: string) => {
    setSelectedDocIdCreate(docId);
    if (!docId) return;
    const found = selectableDocs.find((d) => d.refId === docId);
    if (!found) return;
    setCreateForm((prev) => ({
      ...prev,
      tipo_referencia: found.tipoRef,
      referencia_id: found.refId,
      origem_ref_id: found.origemRefId || '',
      empreendedor_id: found.empreendedorId || '',
      barragem_id: found.barragemId || '',
    }));
  };

  const handleSelectDocForEdit = (docId: string) => {
    setSelectedDocIdEdit(docId);
    if (!docId) return;
    const found = selectableDocs.find((d) => d.refId === docId);
    if (!found) return;
    setEditForm((prev) => ({
      ...prev,
      tipo_referencia: found.tipoRef,
      referencia_id: found.refId,
      origem_ref_id: found.origemRefId || '',
      empreendedor_id: found.empreendedorId || '',
      barragem_id: found.barragemId || '',
    }));
  };

  const openCreateModal = () => {
    setCreateError(null);
    setSelectedDocIdCreate('');
    setCreateForm({
      tipo: 'Documentação',
      tipoCustom: '',
      titulo: '',
      descricao: '',
      origem_ref_id: '',
      tipo_referencia: '',
      referencia_id: '',
      empreendedor_id: '',
      barragem_id: '',
      responsavel_id: '',
      motivo: '',
    });
    setCreateOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite) return;
    const resolvedTipo =
      createForm.tipo === 'Outro' ? createForm.tipoCustom.trim() : createForm.tipo.trim();

    setCreateBusy(true);
    setCreateError(null);
    try {
      await createPendencia({
        tipo: resolvedTipo,
        titulo: createForm.titulo,
        descricao: createForm.descricao,
        origem_ref_id: createForm.origem_ref_id,
        tipo_referencia: createForm.tipo_referencia,
        referencia_id: createForm.referencia_id,
        empreendedor_id: createForm.empreendedor_id,
        barragem_id: createForm.barragem_id,
        responsavel_id: isAdmin ? createForm.responsavel_id || null : undefined,
        motivo: createForm.motivo,
      });
      toast.success('Pendência registrada com sucesso.');
      setCreateOpen(false);
      await refreshAfterMutation();
    } catch (err: any) {
      const msg = err?.message || 'Erro ao criar pendência.';
      setCreateError(msg);
      toast.error(msg);
    } finally {
      setCreateBusy(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPendencia || !canEditItem(selectedPendencia)) return;

    const resolvedTipo =
      editForm.tipo === 'Outro' ? editForm.tipoCustom.trim() : editForm.tipo.trim();

    setActionBusy(true);
    setActionError(null);
    try {
      await editarPendencia(selectedPendencia.id, {
        tipo: resolvedTipo,
        titulo: editForm.titulo,
        descricao: editForm.descricao,
        origem_ref_id: editForm.origem_ref_id,
        tipo_referencia: editForm.tipo_referencia,
        referencia_id: editForm.referencia_id,
        empreendedor_id: editForm.empreendedor_id,
        barragem_id: editForm.barragem_id,
        motivo: editForm.motivo,
      });
      toast.success('Pendência atualizada.');
      setIsEditing(false);
      await refreshAfterMutation(selectedPendencia.id);
    } catch (err: any) {
      const msg = err?.message || 'Erro ao atualizar pendência.';
      setActionError(msg);
      toast.error(msg);
    } finally {
      setActionBusy(false);
    }
  };

  const handleDirecionar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPendencia || !isAdmin) return;

    setActionBusy(true);
    setActionError(null);
    try {
      await direcionarPendencia(selectedPendencia.id, direcionarTargetId, direcionarMotivo);
      toast.success('Responsável direcionado com sucesso.');
      setDirecionarMotivo('');
      await refreshAfterMutation(selectedPendencia.id);
    } catch (err: any) {
      const msg = err?.message || 'Erro ao direcionar pendência.';
      setActionError(msg);
      toast.error(msg);
    } finally {
      setActionBusy(false);
    }
  };

  const handleChangeSituacao = async (novaSituacao: PendenciaSituacao, motivo?: string) => {
    if (!selectedPendencia) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await alterarSituacaoPendencia(selectedPendencia.id, novaSituacao, motivo);
      toast.success(
        novaSituacao === 'resolvida'
          ? 'Pendência marcada como resolvida.'
          : `Situação alterada para ${PENDENCIA_SITUACAO_LABELS[novaSituacao]}.`
      );
      setSituacaoMotivo('');
      await refreshAfterMutation(selectedPendencia.id);
    } catch (err: any) {
      const msg = err?.message || 'Erro ao alterar situação da pendência.';
      setActionError(msg);
      toast.error(msg);
    } finally {
      setActionBusy(false);
    }
  };

  const handleQuickResolve = async (item: PendenciaRecord) => {
    if (!canResolveItem(item)) return;
    setActionBusy(true);
    try {
      await alterarSituacaoPendencia(item.id, 'resolvida', 'Resolução rápida pela listagem');
      toast.success('Pendência resolvida.');
      await refreshAfterMutation(selectedPendencia?.id === item.id ? item.id : undefined);
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível resolver a pendência.');
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="p-6 md:p-12 max-w-[1600px] mx-auto w-full animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
            <ClipboardList className="text-emerald-600" />
            Pendências
          </h2>
          <p className="text-slate-500 mt-1">
            Acompanhamento, direcionamento e resolução de pendências com histórico auditável.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canWrite && (
            <button
              type="button"
              onClick={openCreateModal}
              className="bg-emerald-600 text-white px-5 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 transition-all"
            >
              <Plus size={18} />
              Nova Pendência
            </button>
          )}
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="bg-white border border-slate-200 text-slate-600 px-5 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-5 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('minhas')}
          className={`px-5 py-3 font-bold text-sm border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'minhas'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Minhas pendências
          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full text-xs">
            {tabCounts.minhas}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('geral')}
          className={`px-5 py-3 font-bold text-sm border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'geral'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Lista geral
          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full text-xs">
            {tabCounts.geral}
          </span>
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setActiveTab('direcionado')}
            className={`px-5 py-3 font-bold text-sm border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'direcionado'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Direcionado
            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs">
              {tabCounts.direcionado}
            </span>
          </button>
        )}
      </div>

      {/* Main Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Search & Filter Bar */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row items-stretch md:items-center gap-3">
          <div className="flex items-center gap-3 flex-1 bg-white px-3.5 py-2 rounded-xl border border-slate-200">
            <Search size={18} className="text-slate-400 shrink-0" />
            <input
              type="search"
              placeholder="Buscar por título, tipo, descrição, referência ou responsável..."
              className="bg-transparent border-none outline-none text-sm text-slate-700 w-full"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-slate-400 shrink-0" />
            <select
              aria-label="Filtrar por situação"
              value={situacaoFilter}
              onChange={(e) => setSituacaoFilter(e.target.value as 'todas' | PendenciaSituacao)}
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="todas">Todas as situações</option>
              {PENDENCIA_SITUACOES.map((sit) => (
                <option key={sit} value={sit}>
                  {PENDENCIA_SITUACAO_LABELS[sit]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div
            role="alert"
            className="m-4 p-4 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl flex items-center justify-between gap-3"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => void loadData()}
              className="px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-800 text-xs font-bold shrink-0"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[920px]">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider font-bold">
                <th className="px-5 py-4 border-b border-slate-100">Pendência</th>
                <th className="px-5 py-4 border-b border-slate-100">Tipo / Origem</th>
                <th className="px-5 py-4 border-b border-slate-100">Situação</th>
                <th className="px-5 py-4 border-b border-slate-100">Responsável</th>
                <th className="px-5 py-4 border-b border-slate-100">Referência</th>
                <th className="px-5 py-4 border-b border-slate-100">Atualizado em</th>
                <th className="px-5 py-4 border-b border-slate-100 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-14 text-center text-slate-500">
                    <Loader2 className="animate-spin text-emerald-500 mx-auto mb-2" size={32} />
                    Carregando pendências...
                  </td>
                </tr>
              ) : filteredPendencias.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-14 text-center text-slate-400">
                    <ClipboardList size={36} className="mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-500">
                      {activeTab === 'minhas'
                        ? 'Nenhuma pendência atribuída ao seu usuário.'
                        : activeTab === 'direcionado'
                        ? 'Nenhuma pendência direcionada encontrada.'
                        : 'Nenhuma pendência encontrada para os filtros selecionados.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredPendencias.map((item) => {
                  const resolvable = canResolveItem(item);
                  const editable = canEditItem(item);
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-4 max-w-[300px]">
                        <button
                          type="button"
                          onClick={() => openPendenciaDetail(item)}
                          className="text-left font-bold text-slate-800 hover:text-emerald-700 transition-colors line-clamp-1"
                        >
                          {item.titulo}
                        </button>
                        {item.descricao && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{item.descricao}</p>
                        )}
                      </td>
                      <td className="px-5 py-4 text-xs">
                        <div className="font-semibold text-slate-700">{item.tipo}</div>
                        <span className="inline-block mt-1 px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px]">
                          {item.origem}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${
                            SITUACAO_BADGE_CLASSES[item.situacao] || 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          {PENDENCIA_SITUACAO_LABELS[item.situacao] || item.situacao}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-700">
                        {item.responsavel_id ? (
                          <div>
                            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                              <UserCheck size={14} className="text-emerald-600 shrink-0" />
                              {resolveUserName(item.responsavel_id)}
                            </div>
                            {item.direcionado_em && (
                              <div className="text-[11px] text-slate-400 mt-0.5">
                                {formatDateTime(item.direcionado_em)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                            Sem responsável
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-600">
                        {item.tipo_referencia || item.origem_ref_id || item.referencia_id ? (
                          <div className="space-y-0.5">
                            {item.tipo_referencia && (
                              <div className="font-semibold text-slate-700">{item.tipo_referencia}</div>
                            )}
                            {item.origem_ref_id && (
                              <div className="text-slate-500 font-mono text-[11px]">
                                Ref: {item.origem_ref_id}
                              </div>
                            )}
                            {item.referencia_id && (
                              <div className="text-slate-400 font-mono text-[10px] truncate max-w-[160px]" title={item.referencia_id}>
                                ID: {item.referencia_id}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-500">
                        <div className="flex items-center gap-1">
                          <Clock3 size={13} className="text-slate-400" />
                          {formatDateTime(item.updated_at || item.created_at)}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex justify-end items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openPendenciaDetail(item, false)}
                            className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="Detalhes e histórico"
                          >
                            <Eye size={16} />
                          </button>
                          {editable && (
                            <button
                              type="button"
                              onClick={() => openPendenciaDetail(item, true)}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Editar pendência"
                            >
                              <Edit2 size={16} />
                            </button>
                          )}
                          {resolvable && (
                            <button
                              type="button"
                              disabled={actionBusy}
                              onClick={() => void handleQuickResolve(item)}
                              className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-lg inline-flex items-center gap-1 transition-colors disabled:opacity-50"
                              title="Marcar como resolvida"
                            >
                              <CheckCircle2 size={14} />
                              Resolver
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Criar Pendência */}
      {createOpen && canWrite && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Nova Pendência</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Origem: <span className="font-mono font-bold">CLASSIFICA_CSB</span> — registrada com histórico automático.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
                aria-label="Fechar"
              >
                <X size={22} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
              {createError && (
                <div
                  role="alert"
                  className="p-3 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl flex items-start gap-2"
                >
                  <AlertCircle size={18} className="shrink-0 mt-0.5" />
                  <span>{createError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    Tipo *
                  </label>
                  <select
                    className={inputClass}
                    value={createForm.tipo}
                    onChange={(e) => setCreateForm({ ...createForm, tipo: e.target.value })}
                  >
                    {PENDENCIA_TIPOS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                {createForm.tipo === 'Outro' && (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                      Especifique o tipo *
                    </label>
                    <input
                      className={inputClass}
                      required
                      maxLength={80}
                      placeholder="Ex.: Vistoria, Notificação..."
                      value={createForm.tipoCustom}
                      onChange={(e) => setCreateForm({ ...createForm, tipoCustom: e.target.value })}
                    />
                  </div>
                )}

                <div className={createForm.tipo === 'Outro' ? 'md:col-span-2' : ''}>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    Título *
                  </label>
                  <input
                    className={inputClass}
                    required
                    minLength={3}
                    maxLength={200}
                    placeholder="Resumo objetivo da pendência"
                    value={createForm.titulo}
                    onChange={(e) => setCreateForm({ ...createForm, titulo: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Descrição
                </label>
                <textarea
                  className={inputClass}
                  rows={3}
                  maxLength={2000}
                  placeholder="Detalhamento técnico da pendência (não informe CPF/CNPJ)"
                  value={createForm.descricao}
                  onChange={(e) => setCreateForm({ ...createForm, descricao: e.target.value })}
                />
              </div>

              {/* Vincular referência por IDs */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
                  <Link2 size={14} className="text-emerald-600" />
                  Referências (somente IDs)
                </div>

                {selectableDocs.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Vincular a documento existente (opcional)
                    </label>
                    <select
                      className={inputClass}
                      value={selectedDocIdCreate}
                      onChange={(e) => handleSelectDocForCreate(e.target.value)}
                    >
                      <option value="">Selecionar documento...</option>
                      {selectableDocs.map((d) => (
                        <option key={d.refId} value={d.refId}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Tipo de referência
                    </label>
                    <input
                      className={inputClass}
                      maxLength={80}
                      placeholder="Ex.: Parecer Técnico, Ofício..."
                      value={createForm.tipo_referencia}
                      onChange={(e) => setCreateForm({ ...createForm, tipo_referencia: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Ref. de origem (protocolo/processo)
                    </label>
                    <input
                      className={inputClass}
                      maxLength={120}
                      placeholder="Ex.: Protocolo ou nº processo"
                      value={createForm.origem_ref_id}
                      onChange={(e) => setCreateForm({ ...createForm, origem_ref_id: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      ID da referência
                    </label>
                    <input
                      className={`${inputClass} font-mono text-xs`}
                      maxLength={120}
                      placeholder="UUID do registro"
                      value={createForm.referencia_id}
                      onChange={(e) => setCreateForm({ ...createForm, referencia_id: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      ID do Empreendedor (UUID)
                    </label>
                    <input
                      className={`${inputClass} font-mono text-xs`}
                      maxLength={120}
                      placeholder="UUID do empreendedor"
                      value={createForm.empreendedor_id}
                      onChange={(e) => setCreateForm({ ...createForm, empreendedor_id: e.target.value })}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      ID da Barragem (UUID)
                    </label>
                    <input
                      className={`${inputClass} font-mono text-xs`}
                      maxLength={120}
                      placeholder="UUID da barragem"
                      value={createForm.barragem_id}
                      onChange={(e) => setCreateForm({ ...createForm, barragem_id: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Direcionamento inicial visível apenas para Administrador */}
              {isAdmin && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    Direcionar responsável inicial (opcional — Administrador)
                  </label>
                  <select
                    className={inputClass}
                    value={createForm.responsavel_id}
                    onChange={(e) => setCreateForm({ ...createForm, responsavel_id: e.target.value })}
                  >
                    <option value="">Sem responsável (situação: Aberta)</option>
                    {activeAssignableUsers.map((u) => (
                      <option key={u.id} value={u.authUserId}>
                        {u.name} ({u.role})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Motivo / Observação de criação (opcional)
                </label>
                <input
                  className={inputClass}
                  maxLength={300}
                  placeholder="Contexto para o histórico"
                  value={createForm.motivo}
                  onChange={(e) => setCreateForm({ ...createForm, motivo: e.target.value })}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createBusy}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {createBusy ? <Loader2 size={18} className="animate-spin" /> : 'Registrar Pendência'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Detalhes, Edição, Direcionamento e Histórico */}
      {selectedPendencia && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-start justify-between gap-4 sticky top-0 bg-white z-10">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                      SITUACAO_BADGE_CLASSES[selectedPendencia.situacao]
                    }`}
                  >
                    {PENDENCIA_SITUACAO_LABELS[selectedPendencia.situacao]}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[11px]">
                    {selectedPendencia.origem}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    {selectedPendencia.tipo}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-slate-800">{selectedPendencia.titulo}</h3>
                <p className="text-xs text-slate-400 font-mono">ID: {selectedPendencia.id}</p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {canEditItem(selectedPendencia) && (
                  <button
                    type="button"
                    onClick={() => setIsEditing((prev) => !prev)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border ${
                      isEditing
                        ? 'bg-slate-100 border-slate-300 text-slate-700'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Edit2 size={14} />
                    {isEditing ? 'Cancelar edição' : 'Editar'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedPendencia(null)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                  aria-label="Fechar"
                >
                  <X size={22} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {actionError && (
                <div
                  role="alert"
                  className="p-3 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl flex items-start gap-2"
                >
                  <AlertCircle size={18} className="shrink-0 mt-0.5" />
                  <span>{actionError}</span>
                </div>
              )}

              {/* Edição ou Visualização */}
              {isEditing && canEditItem(selectedPendencia) ? (
                <form
                  onSubmit={handleSaveEdit}
                  className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4"
                >
                  <h4 className="text-sm font-bold text-slate-800">Editar informações da pendência</h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">Tipo *</label>
                      <select
                        className={inputClass}
                        value={editForm.tipo}
                        onChange={(e) => setEditForm({ ...editForm, tipo: e.target.value })}
                      >
                        {PENDENCIA_TIPOS.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    {editForm.tipo === 'Outro' && (
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1">
                          Especifique o tipo *
                        </label>
                        <input
                          className={inputClass}
                          required
                          maxLength={80}
                          value={editForm.tipoCustom}
                          onChange={(e) => setEditForm({ ...editForm, tipoCustom: e.target.value })}
                        />
                      </div>
                    )}
                    <div className={editForm.tipo === 'Outro' ? 'md:col-span-2' : ''}>
                      <label className="block text-xs font-bold text-slate-600 mb-1">Título *</label>
                      <input
                        className={inputClass}
                        required
                        minLength={3}
                        maxLength={200}
                        value={editForm.titulo}
                        onChange={(e) => setEditForm({ ...editForm, titulo: e.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Descrição</label>
                    <textarea
                      className={inputClass}
                      rows={3}
                      maxLength={2000}
                      value={editForm.descricao}
                      onChange={(e) => setEditForm({ ...editForm, descricao: e.target.value })}
                    />
                  </div>

                  {selectableDocs.length > 0 && (
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">
                        Atualizar referência por documento existente (opcional)
                      </label>
                      <select
                        className={inputClass}
                        value={selectedDocIdEdit}
                        onChange={(e) => handleSelectDocForEdit(e.target.value)}
                      >
                        <option value="">Manter referências atuais...</option>
                        {selectableDocs.map((d) => (
                          <option key={d.refId} value={d.refId}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Tipo de referência
                      </label>
                      <input
                        className={inputClass}
                        maxLength={80}
                        value={editForm.tipo_referencia}
                        onChange={(e) => setEditForm({ ...editForm, tipo_referencia: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Ref. de origem
                      </label>
                      <input
                        className={inputClass}
                        maxLength={120}
                        value={editForm.origem_ref_id}
                        onChange={(e) => setEditForm({ ...editForm, origem_ref_id: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        ID da referência
                      </label>
                      <input
                        className={`${inputClass} font-mono text-xs`}
                        maxLength={120}
                        value={editForm.referencia_id}
                        onChange={(e) => setEditForm({ ...editForm, referencia_id: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        ID do Empreendedor (UUID)
                      </label>
                      <input
                        className={`${inputClass} font-mono text-xs`}
                        maxLength={120}
                        value={editForm.empreendedor_id}
                        onChange={(e) => setEditForm({ ...editForm, empreendedor_id: e.target.value })}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        ID da Barragem (UUID)
                      </label>
                      <input
                        className={`${inputClass} font-mono text-xs`}
                        maxLength={120}
                        value={editForm.barragem_id}
                        onChange={(e) => setEditForm({ ...editForm, barragem_id: e.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">
                      Motivo da edição (opcional)
                    </label>
                    <input
                      className={inputClass}
                      maxLength={300}
                      placeholder="Motivo registrado no histórico"
                      value={editForm.motivo}
                      onChange={(e) => setEditForm({ ...editForm, motivo: e.target.value })}
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 bg-white"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={actionBusy}
                      className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-50"
                    >
                      {actionBusy ? <Loader2 size={16} className="animate-spin" /> : 'Salvar Alterações'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-200 text-sm">
                  <div className="md:col-span-2">
                    <span className="text-xs font-bold uppercase text-slate-400">Descrição</span>
                    <p className="text-slate-700 mt-1 whitespace-pre-wrap">
                      {selectedPendencia.descricao || 'Sem descrição detalhada.'}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs font-bold uppercase text-slate-400">Responsável atual</span>
                    <p className="font-semibold text-slate-800 mt-0.5">
                      {resolveUserName(selectedPendencia.responsavel_id)}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs font-bold uppercase text-slate-400">Criado por / em</span>
                    <p className="text-slate-700 mt-0.5">
                      {resolveUserName(selectedPendencia.criado_por)} em{' '}
                      {formatDateTime(selectedPendencia.created_at)}
                    </p>
                  </div>
                  {selectedPendencia.direcionado_em && (
                    <div>
                      <span className="text-xs font-bold uppercase text-slate-400">Direcionado por / em</span>
                      <p className="text-slate-700 mt-0.5">
                        {resolveUserName(selectedPendencia.direcionado_por)} em{' '}
                        {formatDateTime(selectedPendencia.direcionado_em)}
                      </p>
                    </div>
                  )}
                  {selectedPendencia.resolvido_em && (
                    <div>
                      <span className="text-xs font-bold uppercase text-slate-400">Resolvido por / em</span>
                      <p className="text-emerald-700 font-semibold mt-0.5">
                        {resolveUserName(selectedPendencia.resolvido_por)} em{' '}
                        {formatDateTime(selectedPendencia.resolvido_em)}
                      </p>
                    </div>
                  )}
                  <div className="md:col-span-2 pt-2 border-t border-slate-200/80 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-slate-400 font-bold uppercase block">Tipo / Ref.</span>
                      <span className="text-slate-700">
                        {selectedPendencia.tipo_referencia || '—'}{' '}
                        {selectedPendencia.origem_ref_id ? `(${selectedPendencia.origem_ref_id})` : ''}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-bold uppercase block">ID Referência</span>
                      <span className="text-slate-700 font-mono break-all">
                        {selectedPendencia.referencia_id || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-bold uppercase block">IDs Cadastro Mestre</span>
                      <span className="text-slate-700 font-mono break-all">
                        Emp: {selectedPendencia.empreendedor_id || '—'} | Bar:{' '}
                        {selectedPendencia.barragem_id || '—'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Painel de Situação / Resolução & Direcionamento */}
              {canWrite && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Alterar Situação / Resolver */}
                  {(canResolveItem(selectedPendencia) ||
                    isAdmin ||
                    !selectedPendencia.responsavel_id ||
                    matchesActorUserId(selectedPendencia.responsavel_id, effectiveActor)) && (
                    <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                        <CheckCircle2 size={15} className="text-emerald-600" />
                        Situação e Resolução
                      </h4>
                      <select
                        className={inputClass}
                        value={situacaoTarget}
                        onChange={(e) => setSituacaoTarget(e.target.value as PendenciaSituacao)}
                      >
                        {PENDENCIA_SITUACOES.filter(
                          (s) => s !== 'direcionada' || Boolean(selectedPendencia.responsavel_id)
                        ).map((s) => (
                          <option key={s} value={s}>
                            {PENDENCIA_SITUACAO_LABELS[s]}
                          </option>
                        ))}
                      </select>
                      <input
                        className={inputClass}
                        maxLength={300}
                        placeholder="Motivo da mudança / resolução (opcional)"
                        value={situacaoMotivo}
                        onChange={(e) => setSituacaoMotivo(e.target.value)}
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={actionBusy || situacaoTarget === selectedPendencia.situacao}
                          onClick={() => void handleChangeSituacao(situacaoTarget, situacaoMotivo)}
                          className="flex-1 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold disabled:opacity-40"
                        >
                          Aplicar situação
                        </button>
                        {canResolveItem(selectedPendencia) && (
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => void handleChangeSituacao('resolvida', situacaoMotivo)}
                            className="flex-1 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
                          >
                            <CheckCircle2 size={15} />
                            Resolver
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Direcionamento: exclusivo para Administrador */}
                  {isAdmin && (
                    <form
                      onSubmit={handleDirecionar}
                      className="p-4 rounded-2xl border border-blue-200 bg-blue-50/40 space-y-3"
                    >
                      <h4 className="text-xs font-bold uppercase tracking-wider text-blue-800 flex items-center gap-1.5">
                        <Send size={14} />
                        Direcionar Responsável (Administrador)
                      </h4>
                      <select
                        className={inputClass}
                        required
                        disabled={
                          selectedPendencia.situacao === 'resolvida' ||
                          selectedPendencia.situacao === 'cancelada'
                        }
                        value={direcionarTargetId}
                        onChange={(e) => setDirecionarTargetId(e.target.value)}
                      >
                        <option value="">Selecione um usuário ativo...</option>
                        {activeAssignableUsers.map((u) => (
                          <option key={u.id} value={u.authUserId}>
                            {u.name} ({u.role})
                          </option>
                        ))}
                      </select>
                      <input
                        className={inputClass}
                        maxLength={300}
                        disabled={
                          selectedPendencia.situacao === 'resolvida' ||
                          selectedPendencia.situacao === 'cancelada'
                        }
                        placeholder="Motivo do direcionamento (opcional)"
                        value={direcionarMotivo}
                        onChange={(e) => setDirecionarMotivo(e.target.value)}
                      />
                      <button
                        type="submit"
                        disabled={
                          actionBusy ||
                          !direcionarTargetId ||
                          direcionarTargetId === selectedPendencia.responsavel_id ||
                          selectedPendencia.situacao === 'resolvida' ||
                          selectedPendencia.situacao === 'cancelada'
                        }
                        className="w-full px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40"
                      >
                        {actionBusy ? <Loader2 size={15} className="animate-spin" /> : <UserCheck size={15} />}
                        {selectedPendencia.responsavel_id ? 'Alterar responsável' : 'Direcionar pendência'}
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* Histórico Append-Only */}
              <div className="border-t border-slate-200 pt-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <History size={17} className="text-emerald-600" />
                    Histórico de alterações (somente leitura)
                  </h4>
                  <button
                    type="button"
                    onClick={() => void loadHistorico(selectedPendencia.id)}
                    disabled={historicoLoading}
                    className="text-xs font-bold text-slate-500 hover:text-emerald-600 flex items-center gap-1"
                  >
                    <RefreshCw size={13} className={historicoLoading ? 'animate-spin' : ''} />
                    Atualizar
                  </button>
                </div>

                {historicoLoading ? (
                  <div className="py-8 text-center text-sm text-slate-500">
                    <Loader2 size={22} className="animate-spin text-emerald-500 mx-auto mb-2" />
                    Carregando histórico...
                  </div>
                ) : historicoError ? (
                  <div
                    role="alert"
                    className="p-3 bg-red-50 border border-red-100 text-red-700 text-xs rounded-xl flex items-center gap-2"
                  >
                    <AlertCircle size={16} />
                    {historicoError}
                  </div>
                ) : historico.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-slate-100">
                    Nenhum registro encontrado no histórico desta pendência.
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                    {historico.map((entry) => {
                      const formatHistValue = (val: string | null, campo: string | null) => {
                        if (!val) return '—';
                        if (campo === 'responsavel_id') return resolveUserName(val);
                        if (campo === 'situacao' && val in PENDENCIA_SITUACAO_LABELS) {
                          return PENDENCIA_SITUACAO_LABELS[val as PendenciaSituacao];
                        }
                        return val;
                      };

                      return (
                        <div
                          key={entry.id}
                          className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 text-xs space-y-1"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded bg-slate-200/80 text-slate-800 font-bold">
                                {ACAO_LABELS[entry.acao] || entry.acao}
                              </span>
                              {entry.campo && (
                                <span className="font-mono text-slate-500">campo: {entry.campo}</span>
                              )}
                            </div>
                            <span className="text-slate-400">{formatDateTime(entry.created_at)}</span>
                          </div>
                          <div className="text-slate-700">
                            <span className="font-semibold">{resolveUserName(entry.usuario_id)}</span>
                            {(entry.valor_anterior || entry.valor_novo) && (
                              <span className="text-slate-600">
                                {' '}
                                — de{' '}
                                <span className="font-medium text-slate-700">
                                  {formatHistValue(entry.valor_anterior, entry.campo)}
                                </span>{' '}
                                para{' '}
                                <span className="font-semibold text-emerald-700">
                                  {formatHistValue(entry.valor_novo, entry.campo)}
                                </span>
                              </span>
                            )}
                          </div>
                          {entry.motivo && (
                            <p className="text-slate-500 italic">Motivo: {entry.motivo}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
