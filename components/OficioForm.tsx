
import React, { useState, useContext, useEffect } from 'react';
import { Save, Download, ArrowLeft, FileText, Plus, Trash2, X, CheckCircle, Loader2, Users, Calendar, RotateCcw, AlertTriangle, Info, Database, UserPlus, Unlink, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { logActivity } from '../src/lib/auditService';
import ConfirmModal from './ui/ConfirmModal';
import { OPS_RESPONSAVEL_TECNICO, OPS_ANALISTA, OPS_MUNICIPIOS } from '../constants';
import { supabase } from '../src/supabaseClient';
import { AuthContext } from '../src/contexts/AuthContext';
import { handleSupabaseError, OperationType } from '../src/utils/supabaseErrorHandler';
import { generateOficioDoc } from '../services/docxService';
import { EcosystemSelector, ResponsavelTecnicoSearchItem } from './EcosystemSelector';
import {
  createResponsavelTecnicoInAdministra,
  saveBarragemMaster,
  saveEmpreendedorMaster,
  syncClassificaProductToAdministra,
} from '../src/services/administraService';

import { BarragemMaster, EmpreendedorMaster, OficioData } from '../types';
import { GMS_PLACEHOLDER, formatGmsInput, normalizeCoordinateToGMS } from '../src/utils/coordinateUtils';

const INITIAL_STATE: OficioData = {
  protocolo: '',
  interessado: '',
  cpfCnpj: '',
  barragemNome: '',
  municipio: '',
  assunto: 'Ofício de Pendências - Segurança de Barragens',
  data: new Date().toISOString().split('T')[0],
  pendencias: [''],
  analista: '',
  analistaOutro: '',
  prazo: '90',
  prorrogacaoPrazo: '0',
  situacaoPendencia: 'Pendente',
  anotacoesInternas: '',
  responsaveisTecnicos: [],
  lat: '',
  long: '',
  status: 'Rascunho',
  tipo_documento: 'Ofício de Pendências',
  tipo_oficio: '1° Ofício de Pendências',
  id: undefined
};

interface OficioFormProps {
  onBack: () => void;
  initialData?: OficioData | null;
  readOnly?: boolean;
}

const OficioForm: React.FC<OficioFormProps> = ({ onBack, initialData, readOnly }) => {
  const { currentUser } = useContext(AuthContext);
  const [loading, setLoading] = useState(false);
  const [registeringEmp, setRegisteringEmp] = useState(false);
  const [registeringBar, setRegisteringBar] = useState(false);
  const [registeringRtIndex, setRegisteringRtIndex] = useState<number | null>(null);
  
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

  const [formData, setFormData] = useState<OficioData>(() => {
    if (initialData) {
      return {
        ...INITIAL_STATE,
        ...initialData,
        lat: normalizeCoordinateToGMS(initialData.lat),
        long: normalizeCoordinateToGMS(initialData.long),
      };
    }
    return INITIAL_STATE;
  });

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

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAddPendencia = () => {
    setFormData(prev => ({ ...prev, pendencias: [...prev.pendencias, ''] }));
  };

  const handleRemovePendencia = (index: number) => {
    setFormData(prev => ({
      ...prev,
      pendencias: prev.pendencias.filter((_, i) => i !== index)
    }));
  };

  const handlePendenciaChange = (index: number, value: string) => {
    const newPendencias = [...formData.pendencias];
    newPendencias[index] = value;
    setFormData(prev => ({ ...prev, pendencias: newPendencias }));
  };

  const handleAddRT = () => {
    setFormData(prev => ({
      ...prev,
      responsaveisTecnicos: [...prev.responsaveisTecnicos, { nome: '', nomeOutro: '', art: '' }]
    }));
  };

  const handleRemoveRT = (index: number) => {
    setFormData(prev => ({
      ...prev,
      responsaveisTecnicos: prev.responsaveisTecnicos.filter((_, i) => i !== index)
    }));
  };

  const handleRTChange = (index: number, field: 'nome' | 'art' | 'nomeOutro', value: string) => {
    const newRTs = [...formData.responsaveisTecnicos];
    const resetLink = field === 'nome' || field === 'nomeOutro'
      ? { rtId: undefined, registeredInAdministra: false }
      : {};
    newRTs[index] = { ...newRTs[index], [field]: value, ...resetLink };
    setFormData(prev => ({ ...prev, responsaveisTecnicos: newRTs }));
  };

  const handleRegisterEmpreendedor = async () => {
    if (!currentUser) {
      toast.error('Você precisa estar logado para cadastrar na base de dados.');
      return;
    }
    const nome = (formData.interessado || '').trim();
    if (nome.length < 2) {
      toast.error('Informe o nome do Interessado / Empreendedor antes de cadastrar.');
      return;
    }
    setRegisteringEmp(true);
    try {
      const res = await saveEmpreendedorMaster(
        {
          id: formData.empreendedorId || undefined,
          razao_social: nome,
          cpf_cnpj: formData.cpfCnpj || undefined,
          municipio: formData.municipio || undefined,
          sistema_origem: formData.sistemaOrigem || 'CLASSIFICA_CSB',
        },
        currentUser
      );
      if (res.success && res.data) {
        setFormData(prev => ({
          ...prev,
          empreendedorId: res.data!.id,
          interessado: res.data!.razao_social || prev.interessado,
          cpfCnpj: res.data!.cpf_cnpj || prev.cpfCnpj,
          municipio: res.data!.municipio || prev.municipio,
          sistemaOrigem: res.data!.sistema_origem || prev.sistemaOrigem,
        }));
        toast.success('Empreendedor cadastrado/vinculado na base do Administra.');
      } else {
        toast.error(res.message || 'Não foi possível cadastrar o empreendedor no Administra.');
      }
    } finally {
      setRegisteringEmp(false);
    }
  };

  const handleRegisterBarragem = async () => {
    if (!currentUser) {
      toast.error('Você precisa estar logado para cadastrar na base de dados.');
      return;
    }
    const nome = (formData.barragemNome || '').trim() || (formData.interessado || '').trim();
    if (nome.length < 2 && !formData.lat?.trim() && !formData.long?.trim()) {
      toast.error('Informe o nome da barragem ou coordenadas antes de cadastrar.');
      return;
    }
    setRegisteringBar(true);
    try {
      const res = await saveBarragemMaster(
        {
          id: formData.barragemId || undefined,
          nome: nome.length >= 2 ? nome : 'Barragem sem identificação',
          empreendedor_id: formData.empreendedorId || undefined,
          municipio: formData.municipio || undefined,
          lat_gms: normalizeCoordinateToGMS(formData.lat) || undefined,
          long_gms: normalizeCoordinateToGMS(formData.long) || undefined,
          sistema_origem: formData.sistemaOrigem || 'CLASSIFICA_CSB',
        },
        currentUser
      );
      if (res.success && res.data) {
        setFormData(prev => ({
          ...prev,
          barragemId: res.data!.id,
          barragemNome: res.data!.nome || prev.barragemNome,
          municipio: res.data!.municipio || prev.municipio,
          lat: normalizeCoordinateToGMS(res.data!.lat_gms, res.data!.lat_decimal) || prev.lat,
          long: normalizeCoordinateToGMS(res.data!.long_gms, res.data!.long_decimal) || prev.long,
        }));
        toast.success('Barragem cadastrada/vinculada na base do Administra.');
      } else {
        toast.error(res.message || 'Não foi possível cadastrar a barragem no Administra.');
      }
    } finally {
      setRegisteringBar(false);
    }
  };

  const handleRegisterRT = async (index: number) => {
    if (!currentUser) {
      toast.error('Você precisa estar logado para cadastrar na base de dados.');
      return;
    }
    const rt = formData.responsaveisTecnicos[index];
    if (!rt) return;
    const nomeFinal = (rt.nome === 'OUTRO' ? rt.nomeOutro : rt.nome || '').trim();
    if (nomeFinal.length < 2) {
      toast.error('Informe o nome completo do Responsável Técnico antes de cadastrar.');
      return;
    }
    setRegisteringRtIndex(index);
    try {
      const res = await createResponsavelTecnicoInAdministra(
        {
          nome: nomeFinal,
          cpf: rt.cpf || undefined,
          registro_profissional: rt.registroProfissional || undefined,
          art: rt.art?.trim() || undefined,
          barragemId: formData.barragemId || null,
        },
        currentUser
      );
      if (res.success && res.data?.rt) {
        setFormData(prev => {
          const next = [...prev.responsaveisTecnicos];
          if (next[index]) {
            next[index] = {
              ...next[index],
              rtId: res.data!.rt.id,
              registroProfissional: res.data!.rt.registro_profissional || next[index].registroProfissional,
              cpf: res.data!.rt.cpf || next[index].cpf,
              registeredInAdministra: true,
              sistemaOrigem: res.data!.rt.sistema_origem || 'CLASSIFICA_CSB',
            };
          }
          return { ...prev, responsaveisTecnicos: next };
        });
        toast.success(`Responsável Técnico "${nomeFinal}" cadastrado na base do Administra.`);
        if (res.data.artSaveWarning) {
          toast.warning(res.data.artSaveWarning);
        }
      } else {
        toast.error(res.message || 'Não foi possível cadastrar o Responsável Técnico no Administra.');
      }
    } finally {
      setRegisteringRtIndex(null);
    }
  };

  const getAdministraPendencias = (): string[] => {
    const missing: string[] = [];
    if ((formData.interessado || '').trim() && !formData.empreendedorId) {
      missing.push('Empreendedor');
    }
    const hasBarragemManual = Boolean(
      (formData.barragemNome || '').trim() ||
      (formData.lat || '').trim() ||
      (formData.long || '').trim()
    );
    if (hasBarragemManual && !formData.barragemId) {
      missing.push('Barragem');
    }
    formData.responsaveisTecnicos.forEach((rt, idx) => {
      const rtName = (rt.nome === 'OUTRO' ? rt.nomeOutro : rt.nome || '').trim();
      if (rtName && !(rt.rtId || rt.registeredInAdministra)) {
        missing.push(`Responsável Técnico (${rtName || `#${idx + 1}`})`);
      }
    });
    return missing;
  };

  const handleClear = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Limpar Formulário',
      message: 'Tem certeza que deseja limpar todo o formulário? Esta ação não pode ser desfeita.',
      variant: 'danger',
      onConfirm: () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setFormData(INITIAL_STATE);
        toast.info('Formulário limpo.');
      }
    });
  };

  const handleSaveDraft = async () => {
    setConfirmModal({
      isOpen: true,
      title: 'Salvar Rascunho',
      message: 'Deseja realmente salvar este ofício como rascunho?',
      variant: 'info',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        await saveToSupabase('Rascunho');
      }
    });
  };

  const handleSaveComplete = async () => {
    const pendencias = getAdministraPendencias();
    if (pendencias.length > 0) {
      toast.error(
        `Para concluir, cadastre ou vincule na base do Administra: ${pendencias.join(', ')}. Você ainda pode salvar como Rascunho.`
      );
      return;
    }
    setConfirmModal({
      isOpen: true,
      title: 'Finalizar Ofício',
      message: 'Deseja realmente FINALIZAR este ofício? Após a finalização, ele não poderá mais ser editado como rascunho.',
      variant: 'warning',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        await saveToSupabase('Concluído');
      }
    });
  };

  const saveToSupabase = async (status: 'Rascunho' | 'Concluído') => {
    if (!currentUser) {
      toast.error('Você precisa estar logado para salvar.');
      return;
    }
    if (status === 'Concluído') {
      const pendencias = getAdministraPendencias();
      if (pendencias.length > 0) {
        toast.error(
          `Para concluir, cadastre ou vincule na base do Administra: ${pendencias.join(', ')}.`
        );
        return;
      }
    }
    setLoading(true);
    try {
      const userName = currentUser.name || 'Analista';

      const normalizedLat = normalizeCoordinateToGMS(formData.lat);
      const normalizedLong = normalizeCoordinateToGMS(formData.long);

      const payload = {
        ...formData,
        lat: normalizedLat,
        long: normalizedLong,
        analista: userName,
        status,
        tipo_documento: 'Ofício de Pendências' as const,
        sistema_origem: formData.sistemaOrigem || 'CLASSIFICA_CSB',
        updated_at: new Date().toISOString()
      };

      let savedId = formData.id;

      const { data: upsertData, error: upsertError } = await supabase
        .from('oficios')
        .upsert({
          id: formData.id || undefined,
          data: payload,
          status: status,
          tipo_documento: 'Ofício de Pendências',
          tipo_oficio: formData.tipo_oficio,
          user_id: currentUser.id,
          analista: userName,
          empreendedor_id: formData.empreendedorId || null,
          barragem_id: formData.barragemId || null,
          sistema_origem: formData.sistemaOrigem || 'CLASSIFICA_CSB',
          updated_at: new Date().toISOString()
        })
        .select();

      if (upsertError) {
        if (upsertError.code === '42703') {
           const { data: retryData, error: retryError } = await supabase
            .from('oficios')
            .upsert({
              id: formData.id || undefined,
              data: { ...payload, status, tipo_documento: 'Ofício de Pendências', analista: userName, tipo_oficio: formData.tipo_oficio },
              user_id: currentUser.id,
              analista: userName,
              updated_at: new Date().toISOString()
            })
            .select();
           
           if (retryError) await handleSupabaseError(retryError, OperationType.UPSERT, 'oficios');
           
           if (retryData && retryData[0]) {
             savedId = retryData[0].id;
             setFormData(prev => ({ ...prev, id: retryData[0].id, status }));
           }
        } else {
          await handleSupabaseError(upsertError, OperationType.UPSERT, 'oficios');
        }
      } else if (upsertData && upsertData[0]) {
        savedId = upsertData[0].id;
        setFormData(prev => ({ ...prev, id: upsertData[0].id, status }));
      } else {
        setFormData(prev => ({ ...prev, status }));
      }

      if (savedId) {
        void syncClassificaProductToAdministra(
          {
            produto_origem_id: savedId,
            tipo_produto: 'Ofício de Pendências',
            numero_documento: formData.protocolo || null,
            status,
            data_documento: formData.data || null,
            analista_nome: userName,
            empreendedor_id: formData.empreendedorId || null,
            empreendedor_nome: formData.interessado || null,
            empreendedor_cpf_cnpj: formData.cpfCnpj || null,
            barragem_id: formData.barragemId || null,
            barragem_nome: formData.barragemNome || null,
            municipio: formData.municipio || null,
          },
          currentUser
        );
      }

      toast.success(`Ofício salvo como ${status} com sucesso!`);
      if (status === 'Concluído') onBack();
    } catch (error: any) {
      console.error('Erro ao salvar ofício:', error);
      toast.error(`Erro ao salvar ofício: ${error.message || 'Erro desconhecido'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadDocx = async () => {
    try {
      await generateOficioDoc({
        ...formData,
        lat: normalizeCoordinateToGMS(formData.lat),
        long: normalizeCoordinateToGMS(formData.long),
      });
      await logActivity('DOWNLOAD_DOCUMENT', { type: 'Ofício de Pendências', doc: formData.protocolo, interessado: formData.interessado });
    } catch (error) {
      console.error('Erro ao gerar DOCX:', error);
      toast.error('Erro ao gerar o arquivo Word.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20 md:pb-10">
      {/* Sticky Header for Actions on Mobile */}
      <div className="sticky top-[80px] md:top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 md:px-10 py-3 md:py-4 mb-4 md:mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-6 shadow-sm md:shadow-none md:bg-transparent md:border-none">
        <div className="flex items-center gap-3 md:gap-4 w-full md:w-auto">
          <button 
            onClick={onBack}
            className="p-2 md:p-3 bg-white border border-slate-200 rounded-xl md:rounded-2xl text-slate-600 hover:bg-slate-50 hover:border-emerald-500 hover:text-emerald-600 transition-all shadow-sm group"
            title="Voltar"
          >
            <ArrowLeft size={18} className="md:w-5 md:h-5 group-hover:-translate-x-1 transition-transform" />
          </button>
          <div>
            <h1 className="text-xl md:text-3xl font-black text-slate-900 tracking-tighter leading-tight">
              Ofício de <span className="text-emerald-600">Pendências</span>
            </h1>
            <p className="text-slate-500 font-medium text-[9px] md:text-sm uppercase tracking-widest">Geração de Documento de Notificação</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 w-full md:w-auto overflow-x-auto no-scrollbar pb-1 md:pb-0">
          {!readOnly && (
            <>
              <button 
                onClick={handleClear}
                disabled={loading}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-white border border-slate-200 hover:border-slate-400 text-slate-600 px-3 py-2 rounded-xl shadow-sm transition-all font-bold text-xs disabled:opacity-50"
              >
                <RotateCcw size={16} />
                <span className="whitespace-nowrap">Limpar</span>
              </button>
              <button 
                onClick={handleSaveDraft}
                disabled={loading}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-white border border-slate-200 hover:border-emerald-500 hover:text-emerald-600 text-slate-700 px-3 py-2 rounded-xl shadow-sm transition-all font-bold text-xs disabled:opacity-50"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                <span className="whitespace-nowrap">Rascunho</span>
              </button>
              <button 
                onClick={handleSaveComplete}
                disabled={loading}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-xl shadow-lg shadow-emerald-600/20 transition-all font-bold text-xs disabled:opacity-50"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                <span className="whitespace-nowrap">Concluir</span>
              </button>
            </>
          )}
          <button 
            onClick={handleDownloadDocx}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-xl shadow-lg shadow-blue-600/20 transition-all font-bold text-xs"
          >
            <Download size={16} />
            <span className="whitespace-nowrap">Exportar Docx</span>
          </button>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-4 md:px-10 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-8">
          <section className="bg-white p-8 rounded-[2rem] shadow-xl border border-slate-100 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full -mr-16 -mt-16"></div>
            
            <div className="flex items-center gap-3 mb-8 relative z-10">
              <div className="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <FileText size={20} />
              </div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">Dados Gerais do Ofício</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Protocolo / Processo</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all font-medium disabled:bg-slate-100 disabled:text-slate-500"
                  placeholder="Ex: 123456/2024"
                  value={formData.protocolo}
                  onChange={(e) => handleInputChange('protocolo', e.target.value)}
                  disabled={readOnly}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Data de Emissão</label>
                <input 
                  type="date" 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all font-medium disabled:bg-slate-100 disabled:text-slate-500"
                  value={formData.data}
                  onChange={(e) => handleInputChange('data', e.target.value)}
                  disabled={readOnly}
                />
              </div>

              <div className="md:col-span-2 space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Tipo de Ofício</label>
                <div className="flex flex-wrap gap-3">
                  {['1° Ofício de Pendências', '2° Ofício de Pendências', 'Ofício Geral'].map((tipo) => (
                    <label 
                      key={tipo}
                      className={`flex-1 min-w-[150px] flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 transition-all cursor-pointer font-bold text-sm ${
                        formData.tipo_oficio === tipo 
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-md shadow-emerald-500/10' 
                          : 'bg-white border-slate-100 text-slate-500 hover:border-slate-200'
                      } ${readOnly ? 'pointer-events-none opacity-70' : ''}`}
                    >
                      <input 
                        type="radio"
                        className="hidden"
                        name="tipo_oficio"
                        value={tipo}
                        checked={formData.tipo_oficio === tipo}
                        onChange={(e) => handleInputChange('tipo_oficio', e.target.value)}
                        disabled={readOnly}
                      />
                      {tipo}
                    </label>
                  ))}
                </div>
              </div>
              <div className="md:col-span-2">
                <EcosystemSelector
                  selectedEmpreendedorId={formData.empreendedorId}
                  selectedBarragemId={formData.barragemId}
                  selectedBarragemNome={formData.barragemNome}
                  cpfCnpjFallback={formData.cpfCnpj}
                  showRtSelector={true}
                  readOnly={readOnly}
                  onSelectEmpreendedor={(emp: EmpreendedorMaster) => {
                    setFormData(prev => ({
                      ...prev,
                      empreendedorId: emp.id,
                      interessado: emp.razao_social || prev.interessado,
                      cpfCnpj: emp.cpf_cnpj || prev.cpfCnpj,
                      municipio: emp.municipio || prev.municipio,
                      sistemaOrigem: emp.sistema_origem || prev.sistemaOrigem,
                    }));
                  }}
                  onSelectBarragem={(bar: BarragemMaster) => {
                    setFormData(prev => ({
                      ...prev,
                      barragemId: bar.id,
                      barragemNome: bar.nome || prev.barragemNome,
                      empreendedorId: bar.empreendedor_id || prev.empreendedorId,
                      municipio: bar.municipio || prev.municipio,
                      lat: normalizeCoordinateToGMS(bar.lat_gms, bar.lat_decimal) || prev.lat,
                      long: normalizeCoordinateToGMS(bar.long_gms, bar.long_decimal) || prev.long,
                      sistemaOrigem: bar.sistema_origem || prev.sistemaOrigem,
                    }));
                  }}
                  onSelectRT={(rt: ResponsavelTecnicoSearchItem) => {
                    const matchedOpt = OPS_RESPONSAVEL_TECNICO.find(
                      opt => opt.trim().toLowerCase() === (rt.nome || '').trim().toLowerCase()
                    );
                    const artVinculada = rt.art || rt.arts?.[0]?.art || '';
                    setFormData(prev => {
                      const existingIndex = prev.responsaveisTecnicos.findIndex(
                        item =>
                          item.rtId === rt.id ||
                          (item.nome === 'OUTRO' ? item.nomeOutro : item.nome).trim().toLowerCase() ===
                            (rt.nome || '').trim().toLowerCase()
                      );
                      const nextEntry = {
                        nome: matchedOpt || 'OUTRO',
                        nomeOutro: matchedOpt ? '' : rt.nome,
                        art: artVinculada,
                        rtId: rt.id,
                        registroProfissional: rt.registro_profissional || undefined,
                        cpf: rt.cpf || undefined,
                        registeredInAdministra: true,
                        sistemaOrigem: rt.sistema_origem,
                      };
                      if (existingIndex >= 0) {
                        const updated = [...prev.responsaveisTecnicos];
                        updated[existingIndex] = {
                          ...updated[existingIndex],
                          ...nextEntry,
                          art: artVinculada || updated[existingIndex].art,
                        };
                        return { ...prev, responsaveisTecnicos: updated };
                      }
                      return {
                        ...prev,
                        responsaveisTecnicos: [...prev.responsaveisTecnicos, nextEntry],
                      };
                    });
                  }}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Interessado / Empreendedor</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all font-medium disabled:bg-slate-100 disabled:text-slate-500"
                  placeholder="Nome completo do interessado ou empresa"
                  value={formData.interessado}
                  onChange={(e) => handleInputChange('interessado', e.target.value)}
                  disabled={readOnly}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">CPF / CNPJ (Opcional)</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all font-medium disabled:bg-slate-100 disabled:text-slate-500"
                  placeholder="000.000.000-00 ou 00.000.000/0000-00"
                  value={formData.cpfCnpj || ''}
                  onChange={(e) => handleInputChange('cpfCnpj', e.target.value)}
                  disabled={readOnly}
                />
              </div>
              {!readOnly && (formData.empreendedorId || (formData.interessado || '').trim().length >= 2) && (
                <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50">
                  {formData.empreendedorId ? (
                    <>
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                        <CheckCircle2 size={14} /> Empreendedor cadastrado/vinculado no Administra
                      </span>
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, empreendedorId: undefined }))}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100"
                      >
                        <Unlink size={12} /> Desvincular
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-xs font-medium text-amber-700">
                        Empreendedor preenchido manualmente ainda não cadastrado no Administra.
                      </span>
                      <button
                        type="button"
                        onClick={handleRegisterEmpreendedor}
                        disabled={registeringEmp}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                      >
                        {registeringEmp ? <Loader2 size={13} className="animate-spin" /> : <Database size={13} />}
                        Cadastrar Empreendedor na base de dados
                      </button>
                    </>
                  )}
                </div>
              )}
              <div className="md:col-span-2 space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Assunto</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all font-medium disabled:bg-slate-100 disabled:text-slate-500"
                  value={formData.assunto}
                  onChange={(e) => handleInputChange('assunto', e.target.value)}
                  disabled={readOnly}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Nome da Barragem / Empreendimento</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all font-medium disabled:bg-slate-100 disabled:text-slate-500"
                  placeholder="Nome da barragem ou fazenda"
                  value={formData.barragemNome || ''}
                  onChange={(e) => handleInputChange('barragemNome', e.target.value)}
                  disabled={readOnly}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Município</label>
                <select 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all font-medium disabled:bg-slate-100 disabled:text-slate-500"
                  value={formData.municipio || ''}
                  onChange={(e) => handleInputChange('municipio', e.target.value)}
                  disabled={readOnly}
                >
                  <option value="">Selecione...</option>
                  {OPS_MUNICIPIOS.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Coordenadas - Latitude</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all font-medium disabled:bg-slate-100 disabled:text-slate-500"
                  placeholder={GMS_PLACEHOLDER}
                  value={formData.lat || ''}
                  onChange={(e) => handleInputChange('lat', formatGmsInput(e.target.value, formData.lat))}
                  onBlur={() => handleInputChange('lat', normalizeCoordinateToGMS(formData.lat))}
                  disabled={readOnly}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Coordenadas - Longitude</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all font-medium disabled:bg-slate-100 disabled:text-slate-500"
                  placeholder={GMS_PLACEHOLDER}
                  value={formData.long || ''}
                  onChange={(e) => handleInputChange('long', formatGmsInput(e.target.value, formData.long))}
                  onBlur={() => handleInputChange('long', normalizeCoordinateToGMS(formData.long))}
                  disabled={readOnly}
                />
              </div>
              {!readOnly && (formData.barragemId || formData.barragemNome?.trim() || formData.lat?.trim() || formData.long?.trim()) && (
                <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50">
                  {formData.barragemId ? (
                    <>
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                        <CheckCircle2 size={14} /> Barragem cadastrada/vinculada no Administra
                      </span>
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, barragemId: undefined }))}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100"
                      >
                        <Unlink size={12} /> Desvincular
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-xs font-medium text-amber-700">
                        Barragem preenchida manualmente ainda não cadastrada no Administra.
                      </span>
                      <button
                        type="button"
                        onClick={handleRegisterBarragem}
                        disabled={registeringBar}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                      >
                        {registeringBar ? <Loader2 size={13} className="animate-spin" /> : <Database size={13} />}
                        Cadastrar Barragem na base de dados
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="bg-white p-8 rounded-[2rem] shadow-xl border border-slate-100">
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                  <Users size={20} />
                </div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Responsável Técnico</h2>
              </div>
              {!readOnly && (
                <button 
                  onClick={handleAddRT}
                  className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-700 transition-colors"
                >
                  <Plus size={16} /> Adicionar RT
                </button>
              )}
            </div>

            <div className="space-y-4">
              {formData.responsaveisTecnicos.length === 0 && (
                <p className="text-slate-400 text-sm italic text-center py-4 border-2 border-dashed border-slate-100 rounded-2xl">
                  Nenhum responsável técnico adicionado.
                </p>
              )}
              {formData.responsaveisTecnicos.map((rt, index) => (
                <div key={index} className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-2xl relative group animate-fade-in">
                  {!readOnly && (
                    <button 
                      onClick={() => handleRemoveRT(index)}
                      className="absolute -top-2 -right-2 w-8 h-8 bg-white text-red-500 rounded-full shadow-md flex items-center justify-center md:opacity-0 md:group-hover:opacity-100 opacity-100 transition-all hover:bg-red-50"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Nome do Profissional</label>
                    <select 
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all font-medium disabled:bg-slate-100 disabled:text-slate-500"
                      value={rt.nome}
                      onChange={(e) => handleRTChange(index, 'nome', e.target.value)}
                      disabled={readOnly}
                    >
                      <option value="">Selecione...</option>
                      {OPS_RESPONSAVEL_TECNICO.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                  {rt.nome === 'OUTRO' && (
                    <div className="space-y-2 animate-fade-in">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Nome do Profissional (Outro)</label>
                      <input 
                        type="text" 
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all font-medium disabled:bg-slate-100 disabled:text-slate-500"
                        placeholder="Digite o nome completo..."
                        value={rt.nomeOutro}
                        onChange={(e) => handleRTChange(index, 'nomeOutro', e.target.value)}
                        disabled={readOnly}
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Número da ART</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all font-medium disabled:bg-slate-100 disabled:text-slate-500"
                      placeholder="Ex: 123456789"
                      value={rt.art}
                      onChange={(e) => handleRTChange(index, 'art', e.target.value)}
                      disabled={readOnly}
                    />
                  </div>
                  {!readOnly && (
                    <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/70">
                      {rt.rtId || rt.registeredInAdministra ? (
                        <>
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                            <CheckCircle2 size={14} /> Responsável Técnico cadastrado no Administra
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const next = [...formData.responsaveisTecnicos];
                              next[index] = { ...next[index], rtId: undefined, registeredInAdministra: false };
                              setFormData(prev => ({ ...prev, responsaveisTecnicos: next }));
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100"
                          >
                            <Unlink size={12} /> Desvincular
                          </button>
                        </>
                      ) : (rt.nome === 'OUTRO' ? rt.nomeOutro : rt.nome || '').trim().length >= 2 ? (
                        <>
                          <span className="text-xs font-medium text-amber-700">
                            RT ainda não cadastrado na base do Administra.
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRegisterRT(index)}
                            disabled={registeringRtIndex === index}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                          >
                            {registeringRtIndex === index ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
                            Cadastrar Responsável Técnico na base de dados
                          </button>
                        </>
                      ) : null}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white p-8 rounded-[2rem] shadow-xl border border-slate-100">
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/20">
                  <Plus size={20} />
                </div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Listagem de Pendências</h2>
              </div>
              {!readOnly && (
                <button 
                  onClick={handleAddPendencia}
                  className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-700 transition-colors"
                >
                  <Plus size={16} /> Adicionar Item
                </button>
              )}
            </div>

            <div className="space-y-4">
              {formData.pendencias.map((pendencia, index) => (
                <div key={index} className="flex gap-4 group animate-fade-in">
                  <div className="flex-1 relative">
                    <span className="absolute -left-3 top-4 w-6 h-6 bg-slate-100 rounded-full flex items-center justify-center text-[10px] font-black text-slate-400 border border-white shadow-sm">
                      {index + 1}
                    </span>
                    <textarea 
                      className="w-full pl-6 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all font-medium min-h-[80px] disabled:bg-slate-100 disabled:text-slate-500"
                      placeholder="Descreva a pendência técnica ou documental..."
                      value={pendencia}
                      onChange={(e) => handlePendenciaChange(index, e.target.value)}
                      disabled={readOnly}
                    />
                  </div>
                  {!readOnly && (
                    <button 
                      onClick={() => handleRemovePendencia(index)}
                      className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all h-fit mt-2 md:opacity-0 md:group-hover:opacity-100 opacity-100"
                    >
                      <Trash2 size={20} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
          <div className="bg-slate-900 text-white p-8 rounded-[2rem] shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full -mr-16 -mt-16"></div>
            <h3 className="text-lg font-black tracking-tight mb-4 relative z-10">Instruções</h3>
            <ul className="space-y-4 relative z-10">
              <li className="flex gap-3 text-sm text-slate-400">
                <CheckCircle size={18} className="text-emerald-500 shrink-0" />
                <span>Liste todas as pendências de forma clara e objetiva.</span>
              </li>
              <li className="flex gap-3 text-sm text-slate-400">
                <CheckCircle size={18} className="text-emerald-500 shrink-0" />
                <span>Indique o item normativo ou técnico quando possível.</span>
              </li>
              <li className="flex gap-3 text-sm text-slate-400">
                <CheckCircle size={18} className="text-emerald-500 shrink-0" />
                <span>O documento gerado seguirá o padrão oficial da SEMA-MT.</span>
              </li>
            </ul>
          </div>

          <div className="bg-emerald-50 p-6 rounded-[2rem] border border-emerald-100">
            <h4 className="font-black text-emerald-800 text-xs uppercase tracking-widest mb-4">Prazo para Cumprimento</h4>
            <div className="space-y-4">
              <div className="relative">
                <label className="text-[9px] font-black uppercase tracking-widest text-emerald-600 ml-1 mb-1 block">Prazo Inicial</label>
                <input 
                  type="number" 
                  className="w-full pl-4 pr-16 py-3 bg-white border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all font-bold text-emerald-900 disabled:bg-slate-50 disabled:text-slate-500"
                  value={formData.prazo}
                  onChange={(e) => handleInputChange('prazo', e.target.value)}
                  disabled={readOnly}
                />
                <span className="absolute right-4 top-[38px] -translate-y-1/2 text-[10px] font-black text-emerald-600 uppercase tracking-widest pointer-events-none">
                  Dias
                </span>
              </div>
              
              <div className="relative">
                <label className="text-[9px] font-black uppercase tracking-widest text-emerald-600 ml-1 mb-1 block">Prorrogação de Prazo</label>
                <input 
                  type="number" 
                  className="w-full pl-4 pr-16 py-3 bg-white border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all font-bold text-emerald-900 disabled:bg-slate-50 disabled:text-slate-500"
                  value={formData.prorrogacaoPrazo || '0'}
                  onChange={(e) => handleInputChange('prorrogacaoPrazo', e.target.value)}
                  disabled={readOnly}
                />
                <span className="absolute right-4 top-[38px] -translate-y-1/2 text-[10px] font-black text-emerald-600 uppercase tracking-widest pointer-events-none">
                  Dias
                </span>
              </div>

              <div className="pt-2 border-t border-emerald-200">
                <div className="flex justify-between items-center px-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-800">Prazo Total Atualizado:</span>
                  <span className="text-sm font-black text-emerald-900">{(parseInt(formData.prazo) || 0) + (parseInt(formData.prorrogacaoPrazo || '0') || 0)} Dias</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-emerald-50 p-6 rounded-[2rem] border border-emerald-100">
            <h4 className="font-black text-emerald-800 text-xs uppercase tracking-widest mb-4">Situação do Cumprimento</h4>
            <select 
              className="w-full px-4 py-3 bg-white border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all font-bold text-emerald-900 disabled:bg-slate-50 disabled:text-slate-500"
              value={formData.situacaoPendencia || 'Pendente'}
              onChange={(e) => handleInputChange('situacaoPendencia', e.target.value)}
              disabled={readOnly}
            >
              <option value="Pendente">Pendente / Em Aberto</option>
              <option value="Cumprido">Cumprido</option>
              <option value="Não cumprido">Não Cumprido</option>
              <option value="Arquivado">Arquivado</option>
            </select>
          </div>

          <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-200">
            <h4 className="font-black text-slate-800 text-xs uppercase tracking-widest mb-4">Anotações Internas</h4>
            <textarea 
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-500/20 focus:border-slate-500 outline-none transition-all font-medium text-slate-700 min-h-[120px] disabled:bg-slate-50 disabled:text-slate-500"
              placeholder="Inserir anotações sobre o processo (apenas para conhecimento interno)..."
              value={formData.anotacoesInternas || ''}
              onChange={(e) => handleInputChange('anotacoesInternas', e.target.value)}
              disabled={readOnly}
            />
          </div>

          <div className="bg-emerald-50 p-6 rounded-[2rem] border border-emerald-100">
            <h4 className="font-black text-emerald-800 text-xs uppercase tracking-widest mb-4">Analista Responsável</h4>
            <select 
              className="w-full px-4 py-3 bg-white border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all font-bold text-emerald-900 disabled:bg-slate-50 disabled:text-slate-500"
              value={formData.analista}
              onChange={(e) => handleInputChange('analista', e.target.value)}
              disabled={readOnly}
            >
              {OPS_ANALISTA.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            {formData.analista === 'OUTRO' && (
              <div className="mt-4 space-y-2 animate-fade-in">
                <label className="text-[10px] font-black uppercase tracking-widest text-emerald-600 ml-1">Nome do Analista (Outro)</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-2.5 bg-white border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all font-medium disabled:bg-slate-50 disabled:text-slate-500"
                  placeholder="Digite o nome completo..."
                  value={formData.analistaOutro}
                  onChange={(e) => handleInputChange('analistaOutro', e.target.value)}
                  disabled={readOnly}
                />
              </div>
            )}
          </div>
        </div>
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

export default OficioForm;
