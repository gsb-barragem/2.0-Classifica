import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Database,
  Edit2,
  FileText,
  GitPullRequest,
  HardHat,
  Info,
  Loader2,
  Lock,
  Network,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  BarragemMaster,
  EmpreendedorMaster,
  EntidadeTipoEcossistema,
  ProdutoEcossistemaResumo,
  ResponsavelTecnicoMaster,
  SistemaOrigem,
  SolicitacaoAlteracao,
} from '../types';
import { AuthContext } from '../src/contexts/AuthContext';
import { DataContext } from '../src/contexts/DataContext';
import { getEcosystemStatus, isAdministraConfigured } from '../src/lib/ecosystemClients';
import {
  canClassificaEditDirectly,
  createChangeRequest,
  getEcosystemProductsByEntity,
  listChangeRequests,
  mapLocalDocToEcosystemSummary,
  reviewChangeRequest,
  saveBarragemMaster,
  saveEmpreendedorMaster,
  saveResponsavelTecnicoMaster,
  searchBarragens,
  searchEmpreendedores,
  searchResponsaveisTecnicos,
  SYSTEM_LABELS,
} from '../src/services/administraService';
import { OPS_MUNICIPIOS, OPS_SITUACAO, OPS_TIPO_ESTRUTURAL } from '../constants';

const inputClass =
  'w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-emerald-500';

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

export const EcosystemHub: React.FC = () => {
  const { currentUser } = useContext(AuthContext);
  const { documents } = useContext(DataContext);

  const [activeTab, setActiveTab] = useState<'empreendedores' | 'barragens' | 'rts' | 'solicitacoes' | 'produtos'>('empreendedores');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [empreendedores, setEmpreendedores] = useState<EmpreendedorMaster[]>([]);
  const [barragens, setBarragens] = useState<BarragemMaster[]>([]);
  const [rts, setRts] = useState<ResponsavelTecnicoMaster[]>([]);
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoAlteracao[]>([]);

  // Modal de Cadastro/Edição (quando sistema_origem === CLASSIFICA_CSB) ou Solicitação de Alteração (outros sistemas)
  const [modalMode, setModalMode] = useState<{
    open: boolean;
    tipo: EntidadeTipoEcossistema;
    action: 'create' | 'edit' | 'request_change';
    target?: any;
  }>({ open: false, tipo: 'empreendedor', action: 'create' });

  const [empForm, setEmpForm] = useState({
    cpf_cnpj: '',
    razao_social: '',
    nome_fantasia: '',
    email: '',
    telefone: '',
    endereco: '',
    municipio: '',
    num_car: '',
  });

  const [barForm, setBarForm] = useState({
    empreendedor_id: '',
    snisb: '',
    nome: '',
    municipio: '',
    curso_agua: '',
    sub_bacia: '',
    zona: 'Rural',
    lat_gms: '',
    long_gms: '',
    altura_maxima: '',
    volume_nmm: '',
    tipo_estrutural: OPS_TIPO_ESTRUTURAL[4],
    situacao: OPS_SITUACAO[4],
  });

  const [rtForm, setRtForm] = useState({
    nome: '',
    cpf: '',
    registro_profissional: '',
    email: '',
    telefone: '',
  });

  const [justificativa, setJustificativa] = useState('');

  // Modal de revisão de solicitação recebida (Aprovar / Reprovar)
  const [reviewModal, setReviewModal] = useState<{
    open: boolean;
    request: SolicitacaoAlteracao | null;
    parecer: string;
  }>({ open: false, request: null, parecer: '' });

  // Drawer/Painel de Produtos Cruzados por Entidade
  const [productsDrawer, setProductsDrawer] = useState<{
    open: boolean;
    title: string;
    products: ProdutoEcossistemaResumo[];
    loading: boolean;
  }>({ open: false, title: '', products: [], loading: false });

  const ecosystemStatus = useMemo(() => getEcosystemStatus(), []);
  const administraReady = isAdministraConfigured();
  const canWrite = currentUser?.role === 'Administrador' || currentUser?.role === 'Analista';

  const loadEcosystemData = useCallback(async () => {
    if (!administraReady) {
      setEmpreendedores([]);
      setBarragens([]);
      setRts([]);
      setSolicitacoes([]);
      return;
    }

    setLoading(true);
    try {
      const [empRes, barRes, rtRes, reqRes] = await Promise.all([
        searchEmpreendedores(searchTerm),
        searchBarragens(searchTerm),
        searchResponsaveisTecnicos(searchTerm),
        listChangeRequests('all'),
      ]);
      setEmpreendedores(empRes.data);
      setBarragens(barRes.data);
      setRts(rtRes.data);
      setSolicitacoes(reqRes.data);
    } finally {
      setLoading(false);
    }
  }, [administraReady, searchTerm]);

  useEffect(() => {
    void loadEcosystemData();
  }, [loadEcosystemData]);

  const localProductSummaries = useMemo(
    () => documents.map(mapLocalDocToEcosystemSummary),
    [documents]
  );

  const incomingPendingCount = useMemo(
    () =>
      solicitacoes.filter(
        (s) => s.sistema_destino_proprietario === 'CLASSIFICA_CSB' && s.status === 'pendente'
      ).length,
    [solicitacoes]
  );

  const openEntityProducts = async (params: {
    title: string;
    empreendedorId?: string;
    cpfCnpj?: string | null;
    barragemId?: string;
    snisb?: string | null;
  }) => {
    setProductsDrawer({ open: true, title: params.title, products: [], loading: true });
    const res = await getEcosystemProductsByEntity({
      empreendedorId: params.empreendedorId,
      cpfCnpj: params.cpfCnpj,
      barragemId: params.barragemId,
      snisb: params.snisb,
      localDocuments: documents,
    });
    setProductsDrawer({ open: true, title: params.title, products: res.products, loading: false });
  };

  const openCreateModal = (tipo: EntidadeTipoEcossistema) => {
    setJustificativa('');
    if (tipo === 'empreendedor') {
      setEmpForm({ cpf_cnpj: '', razao_social: '', nome_fantasia: '', email: '', telefone: '', endereco: '', municipio: '', num_car: '' });
    } else if (tipo === 'barragem') {
      setBarForm({
        empreendedor_id: '',
        snisb: '',
        nome: '',
        municipio: '',
        curso_agua: '',
        sub_bacia: '',
        zona: 'Rural',
        lat_gms: '',
        long_gms: '',
        altura_maxima: '',
        volume_nmm: '',
        tipo_estrutural: OPS_TIPO_ESTRUTURAL[4],
        situacao: OPS_SITUACAO[4],
      });
    } else if (tipo === 'responsavel_tecnico') {
      setRtForm({ nome: '', cpf: '', registro_profissional: '', email: '', telefone: '' });
    }
    setModalMode({ open: true, tipo, action: 'create', target: null });
  };

  const openEditOrRequestModal = (
    tipo: EntidadeTipoEcossistema,
    item: EmpreendedorMaster | BarragemMaster | ResponsavelTecnicoMaster
  ) => {
    const isOwner = canClassificaEditDirectly(item.sistema_origem);
    setJustificativa('');

    if (tipo === 'empreendedor') {
      const e = item as EmpreendedorMaster;
      setEmpForm({
        cpf_cnpj: e.cpf_cnpj || '',
        razao_social: e.razao_social || '',
        nome_fantasia: e.nome_fantasia || '',
        email: e.email || '',
        telefone: e.telefone || '',
        endereco: e.endereco || '',
        municipio: e.municipio || '',
        num_car: e.num_car || '',
      });
    } else if (tipo === 'barragem') {
      const b = item as BarragemMaster;
      setBarForm({
        empreendedor_id: b.empreendedor_id || '',
        snisb: b.snisb || '',
        nome: b.nome || '',
        municipio: b.municipio || '',
        curso_agua: b.curso_agua || '',
        sub_bacia: b.sub_bacia || '',
        zona: b.zona || 'Rural',
        lat_gms: b.lat_gms || '',
        long_gms: b.long_gms || '',
        altura_maxima: b.altura_maxima || '',
        volume_nmm: b.volume_nmm || '',
        tipo_estrutural: b.tipo_estrutural || OPS_TIPO_ESTRUTURAL[4],
        situacao: b.situacao || OPS_SITUACAO[4],
      });
    } else if (tipo === 'responsavel_tecnico') {
      const r = item as ResponsavelTecnicoMaster;
      setRtForm({
        nome: r.nome || '',
        cpf: r.cpf || '',
        registro_profissional: r.registro_profissional || '',
        email: r.email || '',
        telefone: r.telefone || '',
      });
    }

    setModalMode({
      open: true,
      tipo,
      action: isOwner ? 'edit' : 'request_change',
      target: item,
    });
  };

  const handleSubmitModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setBusy(true);

    try {
      if (modalMode.action === 'request_change' && modalMode.target) {
        const target = modalMode.target;
        const proposed =
          modalMode.tipo === 'empreendedor'
            ? empForm
            : modalMode.tipo === 'barragem'
            ? barForm
            : rtForm;

        const rotulo =
          modalMode.tipo === 'empreendedor'
            ? target.razao_social
            : target.nome;

        const res = await createChangeRequest(
          {
            entidade_tipo: modalMode.tipo,
            entidade_id: target.id,
            entidade_rotulo: rotulo,
            sistema_destino_proprietario: target.sistema_origem,
            dados_atuais: target,
            dados_propostos: proposed,
            justificativa,
          },
          currentUser
        );

        if (!res.success) {
          toast.error(res.message || 'Erro ao enviar solicitação de alteração.');
          return;
        }
        toast.success(
          `Solicitação enviada ao sistema ${SYSTEM_LABELS[target.sistema_origem as SistemaOrigem]} para aprovação.`
        );
        setModalMode({ open: false, tipo: 'empreendedor', action: 'create' });
        await loadEcosystemData();
        return;
      }

      // Create or direct edit (only when owned by CLASSIFICA_CSB)
      if (modalMode.tipo === 'empreendedor') {
        const res = await saveEmpreendedorMaster(
          { ...empForm, id: modalMode.target?.id, sistema_origem: modalMode.target?.sistema_origem },
          currentUser
        );
        if (!res.success) {
          toast.error(res.message || 'Falha ao salvar empreendedor.');
          return;
        }
        toast.success('Empreendedor salvo na base central do Administra Barragens.');
      } else if (modalMode.tipo === 'barragem') {
        const res = await saveBarragemMaster(
          { ...barForm, id: modalMode.target?.id, sistema_origem: modalMode.target?.sistema_origem },
          currentUser
        );
        if (!res.success) {
          toast.error(res.message || 'Falha ao salvar barragem.');
          return;
        }
        toast.success('Barragem salva na base central do Administra Barragens.');
      } else if (modalMode.tipo === 'responsavel_tecnico') {
        const res = await saveResponsavelTecnicoMaster(
          { ...rtForm, id: modalMode.target?.id, sistema_origem: modalMode.target?.sistema_origem },
          currentUser
        );
        if (!res.success) {
          toast.error(res.message || 'Falha ao salvar responsável técnico.');
          return;
        }
        toast.success('Responsável técnico salvo na base central do Administra.');
      }

      setModalMode({ open: false, tipo: 'empreendedor', action: 'create' });
      await loadEcosystemData();
    } finally {
      setBusy(false);
    }
  };

  const handleReviewDecision = async (decision: 'aprovada' | 'reprovada') => {
    if (!currentUser || !reviewModal.request) return;
    setBusy(true);
    try {
      const res = await reviewChangeRequest(
        reviewModal.request.id,
        decision,
        reviewModal.parecer,
        currentUser
      );
      if (!res.success) {
        toast.error(res.message || 'Erro ao registrar decisão.');
        return;
      }
      toast.success(
        decision === 'aprovada'
          ? 'Solicitação aprovada e dados atualizados!'
          : 'Solicitação reprovada.'
      );
      setReviewModal({ open: false, request: null, parecer: '' });
      await loadEcosystemData();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-[1600px] mx-auto w-full space-y-8 animate-fade-in">
      {/* Cabeçalho */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 flex items-center gap-3 tracking-tight">
            <Network className="text-emerald-600" size={32} />
            Ecossistema CSB & Administra Barragens
          </h2>
          <p className="text-slate-500 mt-1 text-sm font-medium">
            Integração padronizada de Empreendedores, Barragens, Responsáveis Técnicos e consulta cruzada entre sistemas.
          </p>
        </div>
        <button
          onClick={() => void loadEcosystemData()}
          disabled={loading}
          className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 flex items-center gap-2 hover:bg-slate-50 shadow-sm self-start"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Sincronizar
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
                {sys.configured ? 'Conectado' : 'Aguardando chaves'}
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">{sys.papel}</p>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              {sys.readOnlyFromClassifica ? (
                <>
                  <Lock size={11} /> Somente leitura pelo Classifica
                </>
              ) : (
                <>
                  <ShieldCheck size={11} className="text-emerald-600" /> Leitura / Escrita autorizada
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {!administraReady && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-4">
          <Info className="text-amber-600 shrink-0 mt-0.5" size={20} />
          <div className="text-sm text-amber-900 space-y-1">
            <p className="font-bold">
              Modo de Preparação para Migração — Administra Barragens ainda não conectado
            </p>
            <p className="text-xs text-amber-800 leading-relaxed">
              O Classifica CSB já está estruturado para operar com a base mestre do <strong>Administra Barragens</strong> e conversar com o <strong>Notifica CSB</strong> e <strong>Fiscaliza Barragens</strong>. Assim que os projetos Supabase forem criados, adicione as variáveis <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono">VITE_ADMINISTRA_SUPABASE_URL</code> e <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono">VITE_ADMINISTRA_SUPABASE_ANON_KEY</code> no ambiente e execute os scripts SQL da pasta <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono">sql/</code>.
            </p>
          </div>
        </div>
      )}

      {/* Abas */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        {[
          { id: 'empreendedores', label: `Empreendedores (${empreendedores.length})`, icon: <UserCheck size={16} /> },
          { id: 'barragens', label: `Barragens (${barragens.length})`, icon: <Building2 size={16} /> },
          { id: 'rts', label: `Responsáveis Técnicos (${rts.length})`, icon: <HardHat size={16} /> },
          {
            id: 'solicitacoes',
            label: 'Solicitações de Alteração',
            badge: incomingPendingCount,
            icon: <GitPullRequest size={16} />,
          },
          { id: 'produtos', label: `Produtos Classifica (${localProductSummaries.length})`, icon: <FileText size={16} /> },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={`px-4 py-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === t.id
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.icon}
            {t.label}
            {t.badge ? (
              <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-xs">
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Barra de busca e ações */}
      {activeTab !== 'solicitacoes' && activeTab !== 'produtos' && (
        <div className="flex flex-col sm:flex-row justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="Buscar na base mestre do Administra..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          {canWrite && (
            <button
              disabled={!administraReady}
              onClick={() =>
                openCreateModal(
                  activeTab === 'empreendedores'
                    ? 'empreendedor'
                    : activeTab === 'barragens'
                    ? 'barragem'
                    : 'responsavel_tecnico'
                )
              }
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-sm rounded-xl flex items-center gap-2 shadow-sm"
            >
              <Plus size={17} />
              Cadastrar no Administra
            </button>
          )}
        </div>
      )}

      {/* Conteúdo das Abas */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {activeTab === 'empreendedores' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                  <th className="px-5 py-4 border-b">Empreendedor</th>
                  <th className="px-5 py-4 border-b">CPF / CNPJ</th>
                  <th className="px-5 py-4 border-b">Município / CAR</th>
                  <th className="px-5 py-4 border-b">Sistema de Origem</th>
                  <th className="px-5 py-4 border-b text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {empreendedores.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                      {administraReady
                        ? 'Nenhum empreendedor encontrado na base do Administra Barragens.'
                        : 'Conecte o Supabase do Administra Barragens para listar os empreendedores padronizados.'}
                    </td>
                  </tr>
                ) : (
                  empreendedores.map((emp) => {
                    const isOwner = canClassificaEditDirectly(emp.sistema_origem);
                    return (
                      <tr key={emp.id} className="hover:bg-slate-50/70">
                        <td className="px-5 py-4">
                          <div className="font-bold text-slate-800">{emp.razao_social}</div>
                          {emp.email && <div className="text-xs text-slate-500">{emp.email}</div>}
                        </td>
                        <td className="px-5 py-4 font-mono text-xs text-slate-700">{emp.cpf_cnpj}</td>
                        <td className="px-5 py-4 text-xs text-slate-600">
                          <div>{emp.municipio || '—'}</div>
                          {emp.num_car && <div className="text-slate-400">CAR: {emp.num_car}</div>}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${systemBadgeClass(emp.sistema_origem)}`}>
                            {SYSTEM_LABELS[emp.sistema_origem]}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right space-x-2">
                          <button
                            onClick={() =>
                              void openEntityProducts({
                                title: `Produtos: ${emp.razao_social}`,
                                empreendedorId: emp.id,
                                cpfCnpj: emp.cpf_cnpj,
                              })
                            }
                            className="px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg"
                          >
                            Ver Produtos
                          </button>
                          {canWrite && (
                            <button
                              onClick={() => openEditOrRequestModal('empreendedor', emp)}
                              className={`px-3 py-1.5 text-xs font-bold rounded-lg inline-flex items-center gap-1 ${
                                isOwner
                                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                              }`}
                            >
                              {isOwner ? <Edit2 size={13} /> : <Send size={13} />}
                              {isOwner ? 'Editar' : 'Solicitar Alteração'}
                            </button>
                          )}
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
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                  <th className="px-5 py-4 border-b">Barragem / SNISB</th>
                  <th className="px-5 py-4 border-b">Município / Curso d'água</th>
                  <th className="px-5 py-4 border-b">Classificação Atual</th>
                  <th className="px-5 py-4 border-b">Sistema de Origem</th>
                  <th className="px-5 py-4 border-b text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {barragens.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                      {administraReady
                        ? 'Nenhuma barragem encontrada na base do Administra Barragens.'
                        : 'Conecte o Supabase do Administra Barragens para listar as barragens cadastradas.'}
                    </td>
                  </tr>
                ) : (
                  barragens.map((bar) => {
                    const isOwner = canClassificaEditDirectly(bar.sistema_origem);
                    return (
                      <tr key={bar.id} className="hover:bg-slate-50/70">
                        <td className="px-5 py-4">
                          <div className="font-bold text-slate-800">{bar.nome}</div>
                          <div className="text-xs text-slate-500 font-mono">
                            {bar.snisb ? `SNISB: ${bar.snisb}` : 'Sem SNISB'}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-600">
                          <div className="font-semibold text-slate-700">{bar.municipio}</div>
                          <div>{bar.curso_agua || '—'}</div>
                        </td>
                        <td className="px-5 py-4 text-xs">
                          <span className="text-slate-700 font-bold">
                            {bar.dpa_atual ? `DPA: ${bar.dpa_atual}` : 'Não classificada'}
                            {bar.cri_atual ? ` • CRI: ${bar.cri_atual}` : ''}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${systemBadgeClass(bar.sistema_origem)}`}>
                            {SYSTEM_LABELS[bar.sistema_origem]}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right space-x-2">
                          <button
                            onClick={() =>
                              void openEntityProducts({
                                title: `Produtos: ${bar.nome}`,
                                barragemId: bar.id,
                                snisb: bar.snisb,
                              })
                            }
                            className="px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg"
                          >
                            Ver Produtos
                          </button>
                          {canWrite && (
                            <button
                              onClick={() => openEditOrRequestModal('barragem', bar)}
                              className={`px-3 py-1.5 text-xs font-bold rounded-lg inline-flex items-center gap-1 ${
                                isOwner
                                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                              }`}
                            >
                              {isOwner ? <Edit2 size={13} /> : <Send size={13} />}
                              {isOwner ? 'Editar' : 'Solicitar Alteração'}
                            </button>
                          )}
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
            <table className="w-full text-left border-collapse min-w-[750px]">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                  <th className="px-5 py-4 border-b">Nome</th>
                  <th className="px-5 py-4 border-b">Registro Profissional (CREA/CFT)</th>
                  <th className="px-5 py-4 border-b">Contato</th>
                  <th className="px-5 py-4 border-b">Sistema de Origem</th>
                  <th className="px-5 py-4 border-b text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {rts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                      {administraReady
                        ? 'Nenhum responsável técnico encontrado.'
                        : 'Conecte o Supabase do Administra Barragens para listar os responsáveis técnicos.'}
                    </td>
                  </tr>
                ) : (
                  rts.map((rt) => {
                    const isOwner = canClassificaEditDirectly(rt.sistema_origem);
                    return (
                      <tr key={rt.id} className="hover:bg-slate-50/70">
                        <td className="px-5 py-4 font-bold text-slate-800">{rt.nome}</td>
                        <td className="px-5 py-4 font-mono text-xs text-slate-700">
                          {rt.registro_profissional || '—'}
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-600">
                          <div>{rt.email || '—'}</div>
                          <div>{rt.telefone || ''}</div>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${systemBadgeClass(rt.sistema_origem)}`}>
                            {SYSTEM_LABELS[rt.sistema_origem]}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          {canWrite && (
                            <button
                              onClick={() => openEditOrRequestModal('responsavel_tecnico', rt)}
                              className={`px-3 py-1.5 text-xs font-bold rounded-lg inline-flex items-center gap-1 ${
                                isOwner
                                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                              }`}
                            >
                              {isOwner ? <Edit2 size={13} /> : <Send size={13} />}
                              {isOwner ? 'Editar' : 'Solicitar Alteração'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'solicitacoes' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[850px]">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                  <th className="px-5 py-4 border-b">Entidade / Registro</th>
                  <th className="px-5 py-4 border-b">Fluxo Entre Sistemas</th>
                  <th className="px-5 py-4 border-b">Justificativa</th>
                  <th className="px-5 py-4 border-b">Status</th>
                  <th className="px-5 py-4 border-b text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {solicitacoes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                      Nenhuma solicitação de alteração registrada entre os sistemas.
                    </td>
                  </tr>
                ) : (
                  solicitacoes.map((req) => {
                    const isForClassifica = req.sistema_destino_proprietario === 'CLASSIFICA_CSB';
                    return (
                      <tr key={req.id} className="hover:bg-slate-50/70">
                        <td className="px-5 py-4">
                          <div className="font-bold text-slate-800">{req.entidade_rotulo || req.entidade_id}</div>
                          <div className="text-[11px] uppercase text-slate-400 font-bold">{req.entidade_tipo}</div>
                        </td>
                        <td className="px-5 py-4 text-xs space-y-1">
                          <div>
                            <span className="text-slate-400">De:</span>{' '}
                            <span className="font-bold">{SYSTEM_LABELS[req.sistema_solicitante]}</span>{' '}
                            <span className="text-slate-500">({req.solicitante_nome})</span>
                          </div>
                          <div>
                            <span className="text-slate-400">Para:</span>{' '}
                            <span className="font-bold">{SYSTEM_LABELS[req.sistema_destino_proprietario]}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-600 max-w-xs">{req.justificativa}</td>
                        <td className="px-5 py-4">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                              req.status === 'pendente'
                                ? 'bg-amber-100 text-amber-800'
                                : req.status === 'aprovada'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {req.status}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          {isForClassifica && req.status === 'pendente' && canWrite ? (
                            <button
                              onClick={() => setReviewModal({ open: true, request: req, parecer: '' })}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg"
                            >
                              Analisar
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">
                              {req.analisado_por_nome ? `Por ${req.analisado_por_nome}` : 'Aguardando'}
                            </span>
                          )}
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
                      Nenhum produto gerado localmente no Classifica CSB.
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
      </div>

      {/* Modal Cadastro / Edição / Solicitação de Alteração */}
      {modalMode.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900">
                  {modalMode.action === 'create'
                    ? `Cadastrar ${modalMode.tipo.replace('_', ' ')} no Administra`
                    : modalMode.action === 'edit'
                    ? `Editar ${modalMode.tipo.replace('_', ' ')}`
                    : 'Solicitar Alteração ao Sistema de Origem'}
                </h3>
                {modalMode.action === 'request_change' && modalMode.target?.sistema_origem && (
                  <p className="text-xs text-amber-700 mt-1 font-medium">
                    Este registro pertence ao sistema{' '}
                    <strong>{SYSTEM_LABELS[modalMode.target.sistema_origem as SistemaOrigem]}</strong>. Sua alteração será analisada para aprovação.
                  </p>
                )}
              </div>
              <button
                onClick={() => setModalMode({ open: false, tipo: 'empreendedor', action: 'create' })}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmitModal} className="p-6 space-y-4">
              {modalMode.tipo === 'empreendedor' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">CPF / CNPJ *</label>
                    <input
                      className={inputClass}
                      required
                      value={empForm.cpf_cnpj}
                      onChange={(e) => setEmpForm({ ...empForm, cpf_cnpj: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Nome / Razão Social *</label>
                    <input
                      className={inputClass}
                      required
                      value={empForm.razao_social}
                      onChange={(e) => setEmpForm({ ...empForm, razao_social: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Município</label>
                      <select
                        className={inputClass}
                        value={empForm.municipio}
                        onChange={(e) => setEmpForm({ ...empForm, municipio: e.target.value })}
                      >
                        <option value="">Selecione</option>
                        {OPS_MUNICIPIOS.map((m) => (
                          <option key={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Nº CAR</label>
                      <input
                        className={inputClass}
                        value={empForm.num_car}
                        onChange={(e) => setEmpForm({ ...empForm, num_car: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">E-mail</label>
                      <input
                        type="email"
                        className={inputClass}
                        value={empForm.email}
                        onChange={(e) => setEmpForm({ ...empForm, email: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Telefone</label>
                      <input
                        className={inputClass}
                        value={empForm.telefone}
                        onChange={(e) => setEmpForm({ ...empForm, telefone: e.target.value })}
                      />
                    </div>
                  </div>
                </>
              )}

              {modalMode.tipo === 'barragem' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Nome da Barragem *</label>
                    <input
                      className={inputClass}
                      required
                      value={barForm.nome}
                      onChange={(e) => setBarForm({ ...barForm, nome: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Código SNISB</label>
                      <input
                        className={inputClass}
                        value={barForm.snisb}
                        onChange={(e) => setBarForm({ ...barForm, snisb: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Município *</label>
                      <select
                        className={inputClass}
                        required
                        value={barForm.municipio}
                        onChange={(e) => setBarForm({ ...barForm, municipio: e.target.value })}
                      >
                        <option value="">Selecione</option>
                        {OPS_MUNICIPIOS.map((m) => (
                          <option key={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Latitude (GMS)</label>
                      <input
                        className={inputClass}
                        value={barForm.lat_gms}
                        onChange={(e) => setBarForm({ ...barForm, lat_gms: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Longitude (GMS)</label>
                      <input
                        className={inputClass}
                        value={barForm.long_gms}
                        onChange={(e) => setBarForm({ ...barForm, long_gms: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Curso d'Água</label>
                      <input
                        className={inputClass}
                        value={barForm.curso_agua}
                        onChange={(e) => setBarForm({ ...barForm, curso_agua: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Situação</label>
                      <select
                        className={inputClass}
                        value={barForm.situacao}
                        onChange={(e) => setBarForm({ ...barForm, situacao: e.target.value })}
                      >
                        {OPS_SITUACAO.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              )}

              {modalMode.tipo === 'responsavel_tecnico' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Nome Completo *</label>
                    <input
                      className={inputClass}
                      required
                      value={rtForm.nome}
                      onChange={(e) => setRtForm({ ...rtForm, nome: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">CREA / Registro</label>
                      <input
                        className={inputClass}
                        value={rtForm.registro_profissional}
                        onChange={(e) => setRtForm({ ...rtForm, registro_profissional: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">CPF</label>
                      <input
                        className={inputClass}
                        value={rtForm.cpf}
                        onChange={(e) => setRtForm({ ...rtForm, cpf: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">E-mail</label>
                      <input
                        type="email"
                        className={inputClass}
                        value={rtForm.email}
                        onChange={(e) => setRtForm({ ...rtForm, email: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Telefone</label>
                      <input
                        className={inputClass}
                        value={rtForm.telefone}
                        onChange={(e) => setRtForm({ ...rtForm, telefone: e.target.value })}
                      />
                    </div>
                  </div>
                </>
              )}

              {modalMode.action === 'request_change' && (
                <div>
                  <label className="block text-xs font-bold text-amber-800 mb-1">
                    Justificativa da Solicitação de Alteração *
                  </label>
                  <textarea
                    required
                    minLength={5}
                    rows={3}
                    className={inputClass}
                    placeholder="Explique o motivo da atualização (ex: correção de CPF/CNPJ conforme matrícula do imóvel)..."
                    value={justificativa}
                    onChange={(e) => setJustificativa(e.target.value)}
                  />
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalMode({ open: false, tipo: 'empreendedor', action: 'create' })}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {busy && <Loader2 size={16} className="animate-spin" />}
                  {modalMode.action === 'request_change' ? 'Enviar Solicitação' : 'Salvar no Administra'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Revisão de Solicitação Recebida */}
      {reviewModal.open && reviewModal.request && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-black text-slate-900">Analisar Solicitação de Alteração</h3>
              <button
                onClick={() => setReviewModal({ open: false, request: null, parecer: '' })}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="text-xs space-y-2">
              <p>
                <strong>Solicitante:</strong> {reviewModal.request.solicitante_nome} ({SYSTEM_LABELS[reviewModal.request.sistema_solicitante]})
              </p>
              <p>
                <strong>Justificativa:</strong> {reviewModal.request.justificativa}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <p className="font-black uppercase text-[10px] text-slate-400 mb-1">Dados Atuais</p>
                  <pre className="text-[11px] font-mono text-slate-700 whitespace-pre-wrap break-all">
                    {JSON.stringify(reviewModal.request.dados_atuais, null, 2)}
                  </pre>
                </div>
                <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                  <p className="font-black uppercase text-[10px] text-emerald-700 mb-1">Dados Propostos</p>
                  <pre className="text-[11px] font-mono text-emerald-900 whitespace-pre-wrap break-all">
                    {JSON.stringify(reviewModal.request.dados_propostos, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Parecer da Análise (opcional)</label>
              <textarea
                rows={2}
                className={inputClass}
                value={reviewModal.parecer}
                onChange={(e) => setReviewModal({ ...reviewModal, parecer: e.target.value })}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                disabled={busy}
                onClick={() => void handleReviewDecision('reprovada')}
                className="flex-1 px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl font-bold text-sm"
              >
                Reprovar
              </button>
              <button
                disabled={busy}
                onClick={() => void handleReviewDecision('aprovada')}
                className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm"
              >
                Aprovar e Atualizar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Painel Produtos no Ecossistema */}
      {productsDrawer.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-black text-slate-900">{productsDrawer.title}</h3>
              <button
                onClick={() => setProductsDrawer((p) => ({ ...p, open: false }))}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            {productsDrawer.loading ? (
              <div className="py-10 text-center text-slate-400">
                <Loader2 className="animate-spin mx-auto mb-2 text-emerald-500" size={28} />
                Consultando Classifica, Administra, Notifica e Fiscaliza...
              </div>
            ) : productsDrawer.products.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">
                Nenhum produto encontrado para esta entidade no ecossistema.
              </p>
            ) : (
              <div className="space-y-2">
                {productsDrawer.products.map((prod) => (
                  <div
                    key={`${prod.sistema_origem}-${prod.id}`}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-4"
                  >
                    <div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${systemBadgeClass(prod.sistema_origem)}`}>
                        {SYSTEM_LABELS[prod.sistema_origem]}
                      </span>
                      <p className="font-bold text-slate-800 text-sm mt-1">
                        {prod.tipo_produto} {prod.numero_documento ? `• ${prod.numero_documento}` : ''}
                      </p>
                      <p className="text-xs text-slate-500">
                        Analista: {prod.analista_nome || '—'} • Status: {prod.status || '—'}
                      </p>
                    </div>
                    <span className="text-xs text-slate-400 font-mono">
                      {prod.data_documento ? new Date(prod.data_documento).toLocaleDateString('pt-BR') : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
