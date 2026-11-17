import React, { useState } from 'react';
import { ChevronDown, ChevronUp, FileText, RefreshCw } from 'lucide-react';
import {
  ConclusaoCategoria,
  DerivedClassificationResult,
  TEXTO_APROVADO_NAO_ENQUADRAMENTO_PNSB,
  getQuadro7RegulatorioRows,
} from '../../src/utils/opinionCalculations';

interface Topic8ParecerConclusivoProps {
  parecerFinal: string;
  tipoClassificacaoLabel: string;
  derived: DerivedClassificationResult;
  isOpen: boolean;
  readOnly?: boolean;
  isManualEdited: boolean;
  onToggleSection: () => void;
  onChangeParecerFinal: (value: string) => void;
  onRegenerateSuggestedText: () => void;
}

const MODALIDADES: { key: ConclusaoCategoria; label: string }[] = [
  { key: 'CLASSE_A', label: 'Classe A' },
  { key: 'CLASSE_B', label: 'Classe B' },
  { key: 'CLASSE_C', label: 'Classe C' },
  { key: 'CLASSE_D', label: 'Classe D' },
  { key: 'NAO_ENQUADRADA_PNSB', label: 'Não enquadramento na PNSB' },
  { key: 'PRE_CLASSIFICACAO', label: 'Pré-classificação' },
];

export const Topic8ParecerConclusivo: React.FC<Topic8ParecerConclusivoProps> = ({
  parecerFinal,
  tipoClassificacaoLabel,
  derived,
  isOpen,
  readOnly = false,
  isManualEdited,
  onToggleSection,
  onChangeParecerFinal,
  onRegenerateSuggestedText,
}) => {
  const [showRefText, setShowRefText] = useState(false);

  const quadro7Rows =
    !derived.isPreClassificacao &&
    derived.resultado.isComplete &&
    derived.pnsb.enquadrada === true
      ? getQuadro7RegulatorioRows(derived.resultado.label)
      : [];

  return (
    <section id="parecer" className="scroll-mt-56">
      <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
        <button
          type="button"
          onClick={onToggleSection}
          className="w-full flex items-center justify-between mb-6 border-b border-slate-100 pb-4 group"
        >
          <div className="flex items-center gap-2 text-left">
            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-sm shrink-0">
              {derived.isPreClassificacao || derived.pnsb.status === 'nao_enquadrada' ? 6 : 7}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 group-hover:text-emerald-600 transition-colors">
                PARECER TÉCNICO CONCLUSIVO
              </h2>
              <p className="text-xs text-slate-500">
                Texto conclusivo editável conforme o resultado apurado e condicionantes regulatórias
              </p>
            </div>
          </div>
          <div className="text-slate-400 group-hover:text-emerald-600 transition-colors">
            {isOpen ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
          </div>
        </button>

        {isOpen && (
          <div className="space-y-5">
            {/* Modalidades suportadas */}
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-600 uppercase">
                  Modalidade de conclusão aplicável
                </span>
                <span className="text-xs font-bold text-emerald-800">
                  {derived.resultado.label}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {MODALIDADES.map((mod) => {
                  const active = derived.resultado.categoria === mod.key;
                  return (
                    <span
                      key={mod.key}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold border ${
                        active
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-slate-500 border-slate-200'
                      }`}
                    >
                      {mod.label}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Editor do texto completo */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="block text-sm font-medium text-slate-700">
                  Texto Completo do Parecer Técnico Conclusivo
                </label>
                {!readOnly && (
                  <button
                    type="button"
                    disabled={!derived.resultado.isComplete}
                    onClick={onRegenerateSuggestedText}
                    className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title={
                      derived.resultado.isComplete
                        ? 'Atualizar o texto a partir dos dados atuais do formulário'
                        : 'Complete os dados pendentes do cálculo antes de gerar o texto sugerido'
                    }
                  >
                    <RefreshCw size={13} />
                    {isManualEdited
                      ? 'Aplicar texto sugerido pelos cálculos'
                      : 'Atualizar texto sugerido'}
                  </button>
                )}
              </div>

              {!derived.resultado.isComplete && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Existem dados pendentes nos cálculos. O texto conclusivo não será declarado automaticamente enquanto faltarem dados necessários; você ainda pode editar ou manter o rascunho manualmente.
                </p>
              )}

              <textarea
                rows={14}
                className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-4 text-sm md:text-base leading-relaxed focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                value={parecerFinal}
                onChange={(e) => onChangeParecerFinal(e.target.value)}
                placeholder="Redija ou gere o texto completo do parecer técnico conclusivo..."
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                <span>
                  {isManualEdited
                    ? 'Edição manual preservada (não será sobrescrita automaticamente).'
                    : 'Texto sincronizado com os cálculos quando completos.'}
                </span>
                <span>Este texto será incluído no final do documento gerado.</span>
              </div>
            </div>

            {/* Referência integral do texto aprovado para Não Enquadramento na PNSB */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setShowRefText((prev) => !prev)}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <FileText size={14} className="text-slate-500" />
                  Referência de texto aprovado: “Não enquadramento na PNSB”
                </span>
                {showRefText ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {showRefText && (
                <div className="p-4 bg-white border-t border-slate-200 text-xs text-slate-700 whitespace-pre-line leading-relaxed">
                  {TEXTO_APROVADO_NAO_ENQUADRAMENTO_PNSB}
                </div>
              )}
            </div>

            {/* Condicionantes e Consequências Regulatórias (somente PNSB enquadrada e não pré-classificação) */}
            {quadro7Rows.length > 0 && (
              <div className="pt-2">
                <h3 className="font-bold text-xs uppercase text-slate-700 mb-2">
                  5.1 CONDICIONANTES E CONSEQUÊNCIAS REGULATÓRIAS
                </h3>
                <p className="text-xs text-slate-600 mb-3">
                  As consequências regulatórias da {tipoClassificacaoLabel || 'classificação'} são definidas pela legislação vigente e estão discriminadas no Quadro 7 abaixo:
                </p>
                <p className="text-center text-xs font-bold text-slate-700 mb-1">
                  Quadro 7. Consequências regulatórias.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-slate-300 text-xs">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="border border-slate-300 p-2 text-left w-1/2">
                          Atividades a serem executadas pelo empreendedor:
                        </th>
                        <th className="border border-slate-300 p-2 text-left w-1/2">
                          Prazo / Periodicidade:
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {quadro7Rows.map((row, idx) => (
                        <tr key={idx}>
                          {row.col2 === '' ? (
                            <td
                              colSpan={2}
                              className={`border border-slate-300 p-2 ${
                                idx === 0 ? 'font-bold bg-slate-100' : ''
                              }`}
                            >
                              {row.col1}
                            </td>
                          ) : (
                            <>
                              <td className="border border-slate-300 p-2">{row.col1}</td>
                              <td className="border border-slate-300 p-2">{row.col2}</td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
