
import React, { useState, useContext, useEffect } from 'react';
import { Save, Download, ArrowLeft, FileText, Plus, Trash2, X, CheckCircle, Loader2, Users, Calendar, RotateCcw, AlertTriangle, Info } from 'lucide-react';
import { toast } from 'sonner';
import { logActivity } from '../src/lib/auditService';
import ConfirmModal from './ui/ConfirmModal';
import { OPS_RESPONSAVEL_TECNICO, OPS_ANALISTA } from '../constants';
import { supabase } from '../src/supabaseClient';
import { AuthContext } from '../src/contexts/AuthContext';
import { handleSupabaseError, OperationType } from '../src/utils/supabaseErrorHandler';
import { generateOficioDoc } from '../services/docxService';

import { OficioData } from '../types';

const INITIAL_STATE: OficioData = {
  protocolo: '',
  interessado: '',
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

const formatGMS = (value: string | null | undefined): string => {
  if (!value || typeof value !== 'string') return '';
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length === 0) return '';
  let formatted = digits.slice(0, 2);
  if (digits.length > 2) formatted += '°' + digits.slice(2, 4);
  if (digits.length > 4) formatted += "'" + digits.slice(4, 6);
  if (digits.length > 6) formatted += "," + digits.slice(6, 8);
  if (digits.length === 8) formatted += '"';
  return formatted;
};

interface OficioFormProps {
  onBack: () => void;
  initialData?: OficioData | null;
  readOnly?: boolean;
}

const OficioForm: React.FC<OficioFormProps> = ({ onBack, initialData, readOnly }) => {
  const { currentUser } = useContext(AuthContext);
  const [loading, setLoading] = useState(false);
  
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
      return { ...INITIAL_STATE, ...initialData };
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
    newRTs[index] = { ...newRTs[index], [field]: value };
    setFormData(prev => ({ ...prev, responsaveisTecnicos: newRTs }));
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
    setLoading(true);
    try {
      const userName = currentUser.name || 'Analista';

      const payload = {
        ...formData,
        analista: userName,
        status,
        tipo_documento: 'Ofício de Pendências' as const,
        updated_at: new Date().toISOString()
      };

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
          updated_at: new Date().toISOString()
        })
        .select();

      if (upsertError) {
        console.error('Supabase Upsert Error:', upsertError);
        // Se o erro for de coluna inexistente (42703), tenta salvar apenas no campo 'data'
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
             setFormData(prev => ({ ...prev, id: retryData[0].id, status }));
           }
        } else {
          await handleSupabaseError(upsertError, OperationType.UPSERT, 'oficios');
        }
      } else if (upsertData && upsertData[0]) {
        setFormData(prev => ({ ...prev, id: upsertData[0].id, status }));
      } else {
        setFormData(prev => ({ ...prev, status }));
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
      await generateOficioDoc(formData);
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
              <div className="md:col-span-2 space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Interessado / Empreendimento</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all font-medium disabled:bg-slate-100 disabled:text-slate-500"
                  placeholder="Nome completo do interessado ou empresa"
                  value={formData.interessado}
                  onChange={(e) => handleInputChange('interessado', e.target.value)}
                  disabled={readOnly}
                />
              </div>
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
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Coordenadas - Latitude</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all font-medium disabled:bg-slate-100 disabled:text-slate-500"
                  placeholder={"00°00'00,00\""}
                  value={formData.lat || ''}
                  onChange={(e) => handleInputChange('lat', formatGMS(e.target.value))}
                  disabled={readOnly}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Coordenadas - Longitude</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all font-medium disabled:bg-slate-100 disabled:text-slate-500"
                  placeholder={"00°00'00,00\""}
                  value={formData.long || ''}
                  onChange={(e) => handleInputChange('long', formatGMS(e.target.value))}
                  disabled={readOnly}
                />
              </div>
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
