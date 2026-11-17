import React from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { DanoEnum, RiscoEnum } from '../../types';
import { DerivedClassificationResult } from '../../src/utils/opinionCalculations';

interface Topic6ResultadoMatrizProps {
  derived: DerivedClassificationResult;
  isOpen: boolean;
  onToggleSection: () => void;
}

export const Topic6ResultadoMatriz: React.FC<Topic6ResultadoMatrizProps> = ({
  derived,
  isOpen,
  onToggleSection,
}) => {
  const { isPreClassificacao, dpa, cri, pnsb, resultado } = derived;

  const pnsbBadge =
    pnsb.status === 'enquadrada'
      ? 'bg-red-100 text-red-700 border-red-200'
      : pnsb.status === 'nao_enquadrada'
      ? 'bg-slate-200 text-slate-700 border-slate-300'
      : 'bg-amber-100 text-amber-800 border-amber-200';

  const pnsbText =
    pnsb.status === 'enquadrada'
      ? 'ENQUADRADA NA PNSB'
      : pnsb.status === 'nao_enquadrada'
      ? 'NÃO SE ENQUADRA NA PNSB'
      : 'ENQUADRAMENTO PNSB PENDENTE';

  const isCellActive = (targetDpa: DanoEnum, targetCri?: RiscoEnum[]) => {
    if (isPreClassificacao || !resultado.isComplete || !dpa.dpaClass || !cri?.risco) {
      return false;
    }
    if (dpa.dpaClass !== targetDpa) return false;
    if (!targetCri) return true;
    return targetCri.includes(cri.risco) && pnsb.enquadrada === true;
  };

  return (
    <section id="resultado" className="scroll-mt-56">
      <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
        <button
          type="button"
          onClick={onToggleSection}
          className="w-full flex items-center justify-between mb-6 border-b border-slate-100 pb-4 group"
        >
          <div className="flex items-center gap-2 text-left">
            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-sm shrink-0">
              {isPreClassificacao ? 5 : 6}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 group-hover:text-emerald-600 transition-colors">
                {isPreClassificacao
                  ? 'RESUMO DA PRÉ-CLASSIFICAÇÃO (VOLUME E DPA)'
                  : 'RESULTADO E MATRIZ DE CLASSIFICAÇÃO'}
              </h2>
              <p className="text-xs text-slate-500">
                {isPreClassificacao
                  ? 'Apresentação exclusiva de Volume, DPA e enquadramento PNSB aplicável'
                  : 'DPA, CRI, enquadramento legal na PNSB e matriz estadual SEMA/MT (Classes A–D)'}
              </p>
            </div>
          </div>
          <div className="text-slate-400 group-hover:text-emerald-600 transition-colors">
            {isOpen ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
          </div>
        </button>

        {isOpen && (
          <div className="space-y-6">
            {isPreClassificacao && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2.5 text-xs text-blue-900">
                <Info size={16} className="shrink-0 mt-0.5 text-blue-600" />
                <div>
                  <strong>Modo Pré-Classificação ativo:</strong> conforme regra aplicável, são considerados somente os critérios de Volume (NMM) e Dano Potencial Associado (DPA). A Categoria de Risco (CRI) e a classe final A–D não são calculadas nem exibidas.
                </div>
              </div>
            )}

            {/* Pendências */}
            {resultado.pendingFields.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase">
                  <AlertTriangle size={16} className="shrink-0 text-amber-600" />
                  <span>Informações pendentes para conclusão</span>
                </div>
                <ul className="list-disc pl-5 text-xs text-amber-900 space-y-1">
                  {resultado.pendingFields.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Cards de Resultado */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <span className="text-xs font-bold text-slate-500 uppercase">
                  Enquadramento na PNSB (Lei nº 12.334/2010 e Lei nº 14.066/2020)
                </span>
                <span className={`text-xs px-3 py-1 rounded-full font-bold border ${pnsbBadge}`}>
                  {pnsbText}
                </span>
              </div>

              {pnsb.status === 'enquadrada' && pnsb.criteriosAtendidos.length > 0 && (
                <div className="bg-white rounded-lg border border-slate-200 p-3 text-xs text-slate-700">
                  <span className="font-bold text-slate-800 block mb-1">
                    Critérios legais atendidos:
                  </span>
                  <ul className="list-disc pl-5 space-y-0.5">
                    {pnsb.criteriosAtendidos.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}

              {pnsb.status === 'nao_enquadrada' && (
                <div className="bg-white rounded-lg border border-slate-200 p-3 text-xs text-slate-700 flex items-start gap-2">
                  <CheckCircle2 size={16} className="text-slate-500 shrink-0 mt-0.5" />
                  <span>
                    A barragem não atende aos critérios de inclusão da PNSB (altura &lt; 15 m, volume NMM &lt; 3 hm³ e DPA Baixo). Portanto, <strong>não se enquadra na PNSB</strong> e <strong>não recebe Classe A, B, C ou D</strong>.
                  </span>
                </div>
              )}

              <div
                className={`grid grid-cols-1 ${
                  isPreClassificacao ? 'sm:grid-cols-2' : 'sm:grid-cols-3'
                } gap-3`}
              >
                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase">
                    Volume (NMM) / DPA1
                  </span>
                  <span className="text-sm font-bold text-slate-800">
                    {dpa.dpa1
                      ? `${dpa.dpa1.nomenclatura.toUpperCase()} (${dpa.dpa1.score} pt)`
                      : 'Pendente'}
                  </span>
                </div>

                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase">
                    Dano Potencial Associado (DPA)
                  </span>
                  <span className="text-sm font-bold text-slate-800">
                    {dpa.isComplete && dpa.dpaClass
                      ? `${dpa.dpaClass.toUpperCase()} (${dpa.totalDpa} pts)`
                      : 'Pendente'}
                  </span>
                </div>

                {!isPreClassificacao && (
                  <div className="bg-white p-3 rounded-lg border border-slate-200">
                    <span className="block text-[10px] font-bold text-slate-400 uppercase">
                      Categoria de Risco (CRI)
                    </span>
                    <span className="text-sm font-bold text-slate-800">
                      {cri?.isComplete && cri.risco
                        ? `${cri.risco.toUpperCase()} (Geral: ${cri.valGeral})`
                        : 'Pendente'}
                    </span>
                  </div>
                )}
              </div>

              <div className="text-center py-3 bg-white rounded-lg border border-slate-200">
                <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                  Resultado da Análise
                </span>
                <span
                  className={`text-xl font-bold ${
                    resultado.isComplete ? 'text-slate-800' : 'text-amber-700'
                  }`}
                >
                  {resultado.label}
                </span>
              </div>
            </div>

            {/* Matriz SEMA/MT (somente em classificação completa) */}
            {!isPreClassificacao && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-700 uppercase">
                  Matriz de Classificação Estadual (SEMA/MT — Classes A–D)
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-slate-300 text-xs text-center">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="border border-slate-300 p-2 text-left">
                          Dano Potencial Associado (DPA)
                        </th>
                        <th className="border border-slate-300 p-2">CRI Baixa</th>
                        <th className="border border-slate-300 p-2">CRI Média</th>
                        <th className="border border-slate-300 p-2">CRI Alta</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-slate-300 p-2 font-bold text-left bg-slate-50">
                          DPA Alto
                        </td>
                        <td
                          colSpan={3}
                          className={`border border-slate-300 p-2 ${
                            isCellActive(DanoEnum.ALTO)
                              ? 'bg-red-100 text-red-900 font-bold ring-2 ring-inset ring-red-400'
                              : ''
                          }`}
                        >
                          CLASSE A (Enquadrada na PNSB)
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-slate-300 p-2 font-bold text-left bg-slate-50">
                          DPA Médio
                        </td>
                        <td
                          colSpan={3}
                          className={`border border-slate-300 p-2 ${
                            isCellActive(DanoEnum.MEDIO)
                              ? 'bg-amber-100 text-amber-900 font-bold ring-2 ring-inset ring-amber-400'
                              : ''
                          }`}
                        >
                          CLASSE B (Enquadrada na PNSB)
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-slate-300 p-2 font-bold text-left bg-slate-50">
                          DPA Baixo (com critério de inclusão na PNSB)
                        </td>
                        <td
                          className={`border border-slate-300 p-2 ${
                            isCellActive(DanoEnum.BAIXO, [RiscoEnum.BAIXO])
                              ? 'bg-emerald-100 text-emerald-900 font-bold ring-2 ring-inset ring-emerald-400'
                              : ''
                          }`}
                        >
                          CLASSE D
                        </td>
                        <td
                          className={`border border-slate-300 p-2 ${
                            isCellActive(DanoEnum.BAIXO, [RiscoEnum.MEDIO])
                              ? 'bg-emerald-100 text-emerald-900 font-bold ring-2 ring-inset ring-emerald-400'
                              : ''
                          }`}
                        >
                          CLASSE D
                        </td>
                        <td
                          className={`border border-slate-300 p-2 ${
                            isCellActive(DanoEnum.BAIXO, [RiscoEnum.ALTO])
                              ? 'bg-orange-100 text-orange-900 font-bold ring-2 ring-inset ring-orange-400'
                              : ''
                          }`}
                        >
                          CLASSE C
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p
                  className={`text-xs p-2.5 rounded border ${
                    resultado.categoria === 'NAO_ENQUADRADA_PNSB'
                      ? 'bg-slate-200 border-slate-400 text-slate-900 font-bold'
                      : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  Observação: DPA Baixo sem atendimento aos critérios de inclusão (altura &lt; 15 m e volume NMM &lt; 3 hm³) resulta em <strong>NÃO ENQUADRADA NA PNSB</strong> — situação distinta e sem atribuição de Classe A, B, C ou D.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
