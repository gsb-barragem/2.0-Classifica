import React, { useEffect, useState } from 'react';
import { AlertCircle, Loader2, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { SolicitacaoVistoriaPrefill, SolicitacaoVistoriaRecord } from '../types';
import {
  containsCpfOrCnpj,
  createSolicitacaoVistoria,
  formatDpaCriSuffix,
  SOLICITACAO_DADOS_PRE_MAX_LENGTH,
  SOLICITACAO_RELATO_MAX_LENGTH,
  SOLICITACAO_RELATO_MIN_LENGTH,
} from '../src/services/solicitacoesVistoriaService';

interface SolicitarVistoriaModalProps {
  isOpen: boolean;
  onClose: () => void;
  prefill?: SolicitacaoVistoriaPrefill | null;
  onSuccess?: (created: SolicitacaoVistoriaRecord) => void;
}

const inputClass =
  'w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all';

export const SolicitarVistoriaModal: React.FC<SolicitarVistoriaModalProps> = ({
  isOpen,
  onClose,
  prefill,
  onSuccess,
}) => {
  const [origemRefId, setOrigemRefId] = useState('');
  const [barragemId, setBarragemId] = useState('');
  const [barragemNome, setBarragemNome] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [cursoAgua, setCursoAgua] = useState('');
  const [coordenadas, setCoordenadas] = useState('');
  const [uso, setUso] = useState('');
  const [empreendedorId, setEmpreendedorId] = useState('');
  const [empreendedorNome, setEmpreendedorNome] = useState('');
  const [processo, setProcesso] = useState('');
  const [classificacaoAtual, setClassificacaoAtual] = useState('');
  const [dpa, setDpa] = useState('');
  const [cri, setCri] = useState('');
  const [relato, setRelato] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setOrigemRefId(prefill?.origem_ref_id || '');
    setBarragemId(prefill?.barragem_id || '');
    setBarragemNome(prefill?.barragem_nome || '');
    setMunicipio(prefill?.municipio || '');
    setCursoAgua(prefill?.curso_agua || '');
    setCoordenadas(prefill?.coordenadas || '');
    setUso(prefill?.uso || '');
    setEmpreendedorId(prefill?.empreendedor_id || '');
    setEmpreendedorNome(prefill?.empreendedor_nome || '');
    setProcesso(prefill?.processo || '');
    setClassificacaoAtual(prefill?.classificacao_atual || '');
    setDpa(prefill?.dpa || '');
    setCri(prefill?.cri || '');
    setRelato('');
  }, [isOpen, prefill]);

  if (!isOpen) return null;

  const dpaCriSuffix = formatDpaCriSuffix(dpa, cri);
  const suffixReserve = dpaCriSuffix ? dpaCriSuffix.length + 1 : 0;
  const maxRelatoInput = Math.max(
    SOLICITACAO_RELATO_MIN_LENGTH,
    SOLICITACAO_RELATO_MAX_LENGTH - suffixReserve
  );
  const hasCpfCnpj = containsCpfOrCnpj(relato);
  const remaining = maxRelatoInput - relato.length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedRelato = relato.trim();
    if (!trimmedRelato) {
      setError('O relato técnico é obrigatório.');
      return;
    }
    if (trimmedRelato.length < SOLICITACAO_RELATO_MIN_LENGTH) {
      setError(`O relato deve ter pelo menos ${SOLICITACAO_RELATO_MIN_LENGTH} caracteres.`);
      return;
    }
    if (trimmedRelato.length > maxRelatoInput) {
      setError(`O relato não pode ultrapassar ${maxRelatoInput} caracteres.`);
      return;
    }
    if (containsCpfOrCnpj(trimmedRelato)) {
      setError('Não informe CPF ou CNPJ no relato. Utilize apenas referências de ID.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await createSolicitacaoVistoria({
        origem_ref_id: origemRefId || null,
        barragem_id: barragemId || null,
        barragem_nome: barragemNome || null,
        municipio: municipio || null,
        curso_agua: cursoAgua || null,
        coordenadas: coordenadas || null,
        uso: uso || null,
        empreendedor_id: empreendedorId || null,
        empreendedor_nome: empreendedorNome || null,
        processo: processo || null,
        classificacao_atual: classificacaoAtual || null,
        dpa: dpa || null,
        cri: cri || null,
        relato: trimmedRelato,
      });
      toast.success('Solicitação de vistoria enviada com sucesso.');
      onSuccess?.(created);
      onClose();
    } catch (err: any) {
      const msg = err?.message || 'Não foi possível enviar a solicitação de vistoria.';
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-100 flex items-start justify-between gap-4 sticky top-0 bg-white z-10">
          <div>
            <h3 className="text-xl font-bold text-slate-800">Solicitar Vistoria</h3>
            <p className="text-xs text-slate-500 mt-1">
              Encaminhamento técnico com dados do empreendimento e barragem para verificação em campo.
            </p>
            {origemRefId && (
              <p className="text-[10px] font-mono text-slate-400 mt-1">
                Ref. parecer/classificação: {origemRefId}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1"
            aria-label="Fechar modal"
          >
            <X size={22} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl flex items-start gap-2"
            >
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                Barragem
              </label>
              <input
                className={inputClass}
                maxLength={SOLICITACAO_DADOS_PRE_MAX_LENGTH}
                placeholder="Nome da barragem"
                value={barragemNome}
                onChange={(e) => setBarragemNome(e.target.value)}
              />
              {barragemId && (
                <p className="text-[10px] font-mono text-slate-400 mt-1 truncate" title={barragemId}>
                  ID: {barragemId}
                </p>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                Empreendedor
              </label>
              <input
                className={inputClass}
                maxLength={SOLICITACAO_DADOS_PRE_MAX_LENGTH}
                placeholder="Nome ou razão social (sem CPF/CNPJ)"
                value={empreendedorNome}
                onChange={(e) => setEmpreendedorNome(e.target.value)}
              />
              {empreendedorId && (
                <p className="text-[10px] font-mono text-slate-400 mt-1 truncate" title={empreendedorId}>
                  ID: {empreendedorId}
                </p>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                Município
              </label>
              <input
                className={inputClass}
                maxLength={SOLICITACAO_DADOS_PRE_MAX_LENGTH}
                value={municipio}
                onChange={(e) => setMunicipio(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                Curso d&apos;água
              </label>
              <input
                className={inputClass}
                maxLength={SOLICITACAO_DADOS_PRE_MAX_LENGTH}
                value={cursoAgua}
                onChange={(e) => setCursoAgua(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                Coordenadas (GMS)
              </label>
              <input
                className={`${inputClass} font-mono text-xs`}
                maxLength={SOLICITACAO_DADOS_PRE_MAX_LENGTH}
                value={coordenadas}
                onChange={(e) => setCoordenadas(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                Uso / Finalidade
              </label>
              <input
                className={inputClass}
                maxLength={SOLICITACAO_DADOS_PRE_MAX_LENGTH}
                value={uso}
                onChange={(e) => setUso(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                Processo / Protocolo
              </label>
              <input
                className={inputClass}
                maxLength={120}
                value={processo}
                onChange={(e) => setProcesso(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                Classificação atual
              </label>
              <input
                className={inputClass}
                maxLength={SOLICITACAO_DADOS_PRE_MAX_LENGTH}
                value={classificacaoAtual}
                onChange={(e) => setClassificacaoAtual(e.target.value)}
              />
            </div>

            <div className="md:col-span-2 grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                  DPA
                </label>
                <input
                  className={inputClass}
                  maxLength={60}
                  value={dpa}
                  onChange={(e) => setDpa(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                  CRI
                </label>
                <input
                  className={inputClass}
                  maxLength={60}
                  value={cri}
                  onChange={(e) => setCri(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                Relato / Justificativa da Solicitação *
              </label>
              <span
                className={`text-xs font-mono font-bold ${
                  remaining < 0 ? 'text-red-600' : remaining < 100 ? 'text-amber-600' : 'text-slate-400'
                }`}
              >
                {relato.length} / {maxRelatoInput}
              </span>
            </div>
            <textarea
              required
              rows={4}
              minLength={SOLICITACAO_RELATO_MIN_LENGTH}
              maxLength={maxRelatoInput}
              placeholder="Descreva os pontos técnicos que motivam a vistoria em campo (mínimo 3 caracteres, sem CPF/CNPJ)."
              className={`${inputClass} ${hasCpfCnpj ? 'border-red-400 focus:ring-red-400' : ''}`}
              value={relato}
              onChange={(e) => setRelato(e.target.value)}
            />
            {dpaCriSuffix && (
              <p className="text-[11px] text-slate-500 mt-1">
                Será anexado ao final do relato: <span className="font-mono">{dpaCriSuffix}</span>
              </p>
            )}
            {hasCpfCnpj && (
              <p className="text-xs text-red-600 mt-1 font-medium">
                Não é permitido informar CPF ou CNPJ no relato.
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={
                submitting ||
                relato.trim().length < SOLICITACAO_RELATO_MIN_LENGTH ||
                hasCpfCnpj
              }
              className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  <Send size={16} />
                  Enviar Solicitação
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
