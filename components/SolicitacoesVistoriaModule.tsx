import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  Edit2,
  Filter,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Users,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { AuthContext } from '../src/contexts/AuthContext';
import { SolicitacaoVistoriaRecord } from '../types';
import {
  containsCpfOrCnpj,
  formatEquipeMemberLabel,
  isSolicitacaoAuthor,
  isSolicitacaoEquipeMember,
  listSolicitacoesVistoria,
  SOLICITACAO_OBSERVACAO_MAX_LENGTH,
  SOLICITACAO_RELATO_MAX_LENGTH,
  SOLICITACAO_STATUS_LABELS,
  SolicitacaoActor,
  updateSolicitacaoObservacao,
  updateSolicitacaoVistoria,
} from '../src/services/solicitacoesVistoriaService';
import { SolicitarVistoriaModal } from './SolicitarVistoriaModal';

const STATUS_BADGE_CLASSES: Record<string, string> = {
  pendente: 'bg-amber-100 text-amber-800 border-amber-200',
  aberta: 'bg-amber-100 text-amber-800 border-amber-200',
  em_planejamento: 'bg-blue-100 text-blue-800 border-blue-200',
  realizada: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  cancelada: 'bg-slate-100 text-slate-600 border-slate-200',
};

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('pt-BR');
}

export const SolicitacoesVistoriaModule: React.FC = () => {
  const { currentUser } = useContext(AuthContext);

  const [actor, setActor] = useState<SolicitacaoActor | null>(null);
  const [items, setItems] = useState<SolicitacaoVistoriaRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>('todas');
  const [searchTerm, setSearchTerm] = useState('');

  const [createOpen, setCreateOpen] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRelato, setEditRelato] = useState('');

  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [cancelMotivo, setCancelMotivo] = useState('');

  const [obsEditingId, setObsEditingId] = useState<string | null>(null);
  const [obsText, setObsText] = useState('');

  const [busyId, setBusyId] = useState<string | null>(null);

  const effectiveActor: SolicitacaoActor | null = useMemo(() => {
    if (actor) return actor;
    if (!currentUser) return null;
    return {
      canonicalUserId: currentUser.authUserId,
      name: currentUser.name,
      email: currentUser.email || '',
      role: currentUser.role,
    };
  }, [actor, currentUser]);

  const isAdmin = effectiveActor?.role === 'Administrador';
  const canCreate = effectiveActor ? effectiveActor.role !== 'Visualizador' : false;

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listSolicitacoesVistoria(statusFilter);
      setActor(res.actor);
      setItems(res.items);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível carregar as solicitações de vistoria.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (currentUser) {
      void loadData();
    }
  }, [currentUser, loadData]);

  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return items;
    const term = searchTerm.toLowerCase();
    return items.filter((item) =>
      [
        item.barragem_nome,
        item.municipio,
        item.empreendedor_nome,
        item.processo,
        item.relato,
        item.classificacao_atual,
        item.solicitante_nome,
        item.observacao_campo,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }, [items, searchTerm]);

  const handleSaveRelatoEdit = async (id: string) => {
    const trimmed = editRelato.trim();
    if (!trimmed) {
      toast.error('O campo relato é obrigatório.');
      return;
    }
    if (trimmed.length > SOLICITACAO_RELATO_MAX_LENGTH) {
      toast.error(`O relato não pode ultrapassar ${SOLICITACAO_RELATO_MAX_LENGTH} caracteres.`);
      return;
    }
    if (containsCpfOrCnpj(trimmed)) {
      toast.error('O relato não pode conter CPF ou CNPJ.');
      return;
    }

    setBusyId(id);
    try {
      await updateSolicitacaoVistoria(id, { acao: 'editar', relato: trimmed });
      toast.success('Solicitação atualizada com sucesso.');
      setEditingId(null);
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível atualizar a solicitação.');
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmCancel = async (id: string) => {
    const motivo = cancelMotivo.trim();
    if (motivo && containsCpfOrCnpj(motivo)) {
      toast.error('O motivo do cancelamento não pode conter CPF ou CNPJ.');
      return;
    }
    setBusyId(id);
    try {
      await updateSolicitacaoVistoria(id, {
        acao: 'cancelar',
        motivo_cancelamento: motivo || null,
      });
      toast.success('Solicitação cancelada.');
      setCancelingId(null);
      setCancelMotivo('');
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível cancelar a solicitação.');
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveObservacao = async (id: string) => {
    if (obsText.length > SOLICITACAO_OBSERVACAO_MAX_LENGTH) {
      toast.error(
        `A observação de campo não pode ultrapassar ${SOLICITACAO_OBSERVACAO_MAX_LENGTH} caracteres.`
      );
      return;
    }
    if (containsCpfOrCnpj(obsText)) {
      toast.error('A observação de campo não pode conter CPF ou CNPJ.');
      return;
    }

    setBusyId(id);
    try {
      await updateSolicitacaoObservacao(id, obsText);
      toast.success('Observação de campo atualizada.');
      setObsEditingId(null);
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível atualizar a observação de campo.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-6 md:p-12 max-w-[1600px] mx-auto w-full animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
            <ClipboardCheck className="text-emerald-600" />
            Solicitações de Vistoria
          </h2>
          <p className="text-slate-500 mt-1">
            Acompanhamento de solicitações de vistoria em campo vinculadas às análises técnicas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreate && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="bg-emerald-600 text-white px-5 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 transition-all"
            >
              <Plus size={18} />
              Solicitar vistoria
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

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row items-stretch md:items-center gap-3">
          <div className="flex items-center gap-3 flex-1 bg-white px-3.5 py-2 rounded-xl border border-slate-200">
            <Search size={18} className="text-slate-400 shrink-0" />
            <input
              type="search"
              placeholder="Buscar por barragem, município, empreendedor, processo ou relato..."
              className="bg-transparent border-none outline-none text-sm text-slate-700 w-full"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-slate-400 shrink-0" />
            <select
              aria-label="Filtrar por status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="todas">Todos os status</option>
              <option value="pendente">Pendente</option>
              <option value="em_planejamento">Em planejamento</option>
              <option value="realizada">Vistoria realizada</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </div>
        </div>

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

        <div className="p-4 space-y-4">
          {loading ? (
            <div className="py-16 text-center text-slate-500">
              <Loader2 className="animate-spin text-emerald-500 mx-auto mb-2" size={32} />
              Carregando solicitações de vistoria...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <ClipboardCheck size={36} className="mx-auto mb-2 text-slate-300" />
              <p className="font-semibold text-slate-500">
                Nenhuma solicitação de vistoria encontrada.
              </p>
            </div>
          ) : (
            filteredItems.map((item) => {
              const statusLower = item.status.toLowerCase();
              const isRealizada = statusLower === 'realizada';
              const isCancelada = statusLower === 'cancelada';
              const canEditOrCancel =
                canCreate &&
                !isRealizada &&
                !isCancelada &&
                (isAdmin || isSolicitacaoAuthor(item, effectiveActor));
              const canEditObservacao =
                canCreate &&
                isRealizada &&
                (isAdmin || isSolicitacaoEquipeMember(item.equipe, effectiveActor));

              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4"
                >
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${
                            STATUS_BADGE_CLASSES[statusLower] ||
                            'bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          {isRealizada && <CheckCircle2 size={13} />}
                          {SOLICITACAO_STATUS_LABELS[statusLower] || item.status}
                        </span>
                        {item.processo && (
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-xs">
                            Processo: {item.processo}
                          </span>
                        )}
                        {item.classificacao_atual && (
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
                            {item.classificacao_atual}
                          </span>
                        )}
                      </div>

                      <h3 className="text-lg font-bold text-slate-800">
                        {item.barragem_nome || 'Barragem sem identificação'}
                      </h3>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        {item.empreendedor_nome && (
                          <span>
                            Empreendedor: <strong className="text-slate-700">{item.empreendedor_nome}</strong>
                          </span>
                        )}
                        {item.municipio && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin size={12} /> {item.municipio}
                          </span>
                        )}
                        {item.curso_agua && <span>Curso d&apos;água: {item.curso_agua}</span>}
                        {item.coordenadas && (
                          <span className="font-mono">Coord.: {item.coordenadas}</span>
                        )}
                        {(item.dpa || item.cri) && (
                          <span>
                            DPA: <strong>{item.dpa || '—'}</strong> | CRI:{' '}
                            <strong>{item.cri || '—'}</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    {canEditOrCancel && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(editingId === item.id ? null : item.id);
                            setEditRelato(item.relato);
                            setCancelingId(null);
                          }}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
                        >
                          <Edit2 size={13} />
                          Editar relato
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCancelingId(cancelingId === item.id ? null : item.id);
                            setCancelMotivo('');
                            setEditingId(null);
                          }}
                          className="px-3 py-1.5 rounded-lg border border-red-200 text-xs font-bold text-red-600 hover:bg-red-50 inline-flex items-center gap-1.5"
                        >
                          <XCircle size={13} />
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Relato ou Edição */}
                  {editingId === item.id ? (
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase text-slate-600">
                          Editar relato
                        </span>
                        <span className="text-xs font-mono text-slate-500">
                          {editRelato.length} / {SOLICITACAO_RELATO_MAX_LENGTH}
                        </span>
                      </div>
                      <textarea
                        rows={3}
                        maxLength={SOLICITACAO_RELATO_MAX_LENGTH}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                        value={editRelato}
                        onChange={(e) => setEditRelato(e.target.value)}
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 bg-white"
                        >
                          Fechar
                        </button>
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => void handleSaveRelatoEdit(item.id)}
                          className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50"
                        >
                          Salvar relato
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 text-sm text-slate-700 whitespace-pre-wrap">
                      <span className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                        Relato técnico
                      </span>
                      {item.relato}
                    </div>
                  )}

                  {/* Confirmação de Cancelamento */}
                  {cancelingId === item.id && (
                    <div className="p-4 rounded-xl bg-red-50/70 border border-red-200 space-y-3">
                      <p className="text-xs font-bold text-red-800">
                        Confirmar cancelamento da solicitação
                      </p>
                      <input
                        className="w-full px-3.5 py-2 rounded-xl border border-red-200 bg-white text-sm text-slate-800 outline-none"
                        maxLength={500}
                        placeholder="Motivo do cancelamento (opcional, sem CPF/CNPJ)"
                        value={cancelMotivo}
                        onChange={(e) => setCancelMotivo(e.target.value)}
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setCancelingId(null)}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 bg-white"
                        >
                          Voltar
                        </button>
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => void handleConfirmCancel(item.id)}
                          className="px-4 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-50"
                        >
                          Confirmar cancelamento
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Dados de conclusão quando realizada */}
                  {isRealizada && (
                    <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                          <CheckCircle2 size={18} className="text-emerald-600" />
                          Vistoria realizada
                        </div>
                        {canEditObservacao && obsEditingId !== item.id && (
                          <button
                            type="button"
                            onClick={() => {
                              setObsEditingId(item.id);
                              setObsText(item.observacao_campo || '');
                            }}
                            className="px-3 py-1 rounded-lg bg-white border border-emerald-300 text-emerald-700 text-xs font-bold hover:bg-emerald-50 inline-flex items-center gap-1"
                          >
                            <Edit2 size={12} />
                            Editar observação de campo
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div className="flex items-center gap-2 text-slate-700">
                          <CalendarCheck size={14} className="text-emerald-600 shrink-0" />
                          <span>
                            Data de realização:{' '}
                            <strong>{formatDateTime(item.data_realizacao)}</strong>
                          </span>
                        </div>
                        <div className="flex items-start gap-2 text-slate-700">
                          <Users size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                          <span>
                            Equipe:{' '}
                            <strong>
                              {item.equipe.length > 0
                                ? item.equipe.map(formatEquipeMemberLabel).join(', ')
                                : 'Não informada'}
                            </strong>
                          </span>
                        </div>
                      </div>

                      {obsEditingId === item.id ? (
                        <div className="space-y-2 pt-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-emerald-900">
                              Observações de campo
                            </span>
                            <span className="text-xs font-mono text-slate-500">
                              {obsText.length} / {SOLICITACAO_OBSERVACAO_MAX_LENGTH}
                            </span>
                          </div>
                          <textarea
                            rows={3}
                            maxLength={SOLICITACAO_OBSERVACAO_MAX_LENGTH}
                            placeholder="Registre observações complementares da vistoria (sem CPF/CNPJ)"
                            className="w-full px-3.5 py-2 rounded-xl border border-emerald-200 bg-white text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                            value={obsText}
                            onChange={(e) => setObsText(e.target.value)}
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setObsEditingId(null)}
                              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 bg-white"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              disabled={busyId === item.id}
                              onClick={() => void handleSaveObservacao(item.id)}
                              className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50"
                            >
                              Salvar observação
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-700 bg-white/80 rounded-lg p-3 border border-emerald-100">
                          <span className="block font-bold uppercase text-[10px] text-emerald-700 mb-0.5">
                            Observações de campo
                          </span>
                          <p className="whitespace-pre-wrap">
                            {item.observacao_campo || 'Sem observações registradas.'}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {isCancelada && item.motivo_cancelamento && (
                    <div className="text-xs text-slate-500 italic">
                      Motivo do cancelamento: {item.motivo_cancelamento}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 pt-1 border-t border-slate-100">
                    <span>
                      Solicitante: <strong className="text-slate-600">{item.solicitante_nome || '—'}</strong>
                    </span>
                    <span>Registrada em {formatDateTime(item.created_at)}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <SolicitarVistoriaModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => {
          void loadData();
        }}
      />
    </div>
  );
};
