import React from 'react';
import { AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import {
  OPS_DPA2_CONSTRUCOES,
  OPS_DPA3_ENV,
  OPS_DPA4_SOCIO,
} from '../../constants';
import { ClassificacaoData, DanoEnum } from '../../types';
import {
  DerivedDpaResult,
  cleanOptionScore,
} from '../../src/utils/opinionCalculations';

interface Topic4DpaProps {
  classificacao: ClassificacaoData;
  volumeNmmTexto: string;
  derivedDpa: DerivedDpaResult;
  isOpen: boolean;
  onToggleSection: () => void;
  onClassificationChange: (field: keyof ClassificacaoData, value: any) => void;
}

export const Topic4Dpa: React.FC<Topic4DpaProps> = ({
  classificacao,
  volumeNmmTexto,
  derivedDpa,
  isOpen,
  onToggleSection,
  onClassificationChange,
}) => {
  const dpaBadgeClass =
    derivedDpa.dpaClass === DanoEnum.ALTO
      ? 'bg-red-100 text-red-700'
      : derivedDpa.dpaClass === DanoEnum.MEDIO
      ? 'bg-amber-100 text-amber-700'
      : derivedDpa.dpaClass === DanoEnum.BAIXO
      ? 'bg-green-100 text-green-700'
      : 'bg-slate-200 text-slate-700';

  return (
    <section id="dpa" className="scroll-mt-56">
      <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
        <button
          type="button"
          onClick={onToggleSection}
          className="w-full flex items-center justify-between mb-6 border-b border-slate-100 pb-4 group"
        >
          <div className="flex items-center gap-2 text-left">
            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-sm shrink-0">
              4
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 group-hover:text-emerald-600 transition-colors">
                CLASSIFICAÇÃO QUANTO AO VOLUME E AO DPA
              </h2>
              <p className="text-xs text-slate-500">
                DPA1 derivado do volume NMM, parcelas do DPA, ruptura hipotética e memória de cálculo
              </p>
            </div>
          </div>
          <div className="text-slate-400 group-hover:text-emerald-600 transition-colors">
            {isOpen ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
          </div>
        </button>

        {isOpen && (
          <div className="space-y-6">
            <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <h3 className="font-bold text-blue-900 text-sm uppercase">
                  Dano Potencial Associado (DPA)
                </h3>
                <span className={`px-2.5 py-1 rounded text-xs font-bold ${dpaBadgeClass}`}>
                  {derivedDpa.isComplete && derivedDpa.dpaClass
                    ? `${derivedDpa.dpaClass} (Total: ${derivedDpa.totalDpa} pontos)`
                    : 'Pendente'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* DPA1 Derivado */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    DPA1 — Potencial de impacto devido ao volume (derivado do NMM)
                  </label>
                  <div
                    className={`w-full rounded-lg border p-3 md:p-2 text-xs ${
                      derivedDpa.dpa1
                        ? 'border-blue-200 bg-white text-slate-800'
                        : 'border-amber-300 bg-amber-50 text-amber-800'
                    }`}
                  >
                    {derivedDpa.dpa1 ? (
                      <div className="space-y-0.5">
                        <div className="font-bold">{derivedDpa.dpa1.faixaLabel}</div>
                        <div className="text-[11px] text-slate-500">
                          Volume NMM informado: {volumeNmmTexto} hm³
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 font-semibold">
                        <AlertCircle size={14} className="shrink-0" />
                        <span>
                          Pendente — informe um volume armazenado (NMM) válido no Tópico 3.
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* DPA2 */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    DPA2 — Construções na área afetada a jusante
                  </label>
                  <select
                    value={classificacao.dpa2Select || ''}
                    onChange={(e) => onClassificationChange('dpa2Select', e.target.value)}
                    className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                  >
                    <option value="">Selecione...</option>
                    {OPS_DPA2_CONSTRUCOES.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>

                {/* DPA3 */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    DPA3 — Potencial de impacto ambiental
                  </label>
                  <select
                    value={classificacao.dpa3Select || ''}
                    onChange={(e) => onClassificationChange('dpa3Select', e.target.value)}
                    className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                  >
                    <option value="">Selecione...</option>
                    {OPS_DPA3_ENV.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>

                {/* DPA4 */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    DPA4 — Potencial de impacto socioeconômico
                  </label>
                  <select
                    value={classificacao.dpa4Select || ''}
                    onChange={(e) => onClassificationChange('dpa4Select', e.target.value)}
                    className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                  >
                    <option value="">Selecione...</option>
                    {OPS_DPA4_SOCIO.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Ruptura hipotética */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Texto do Estudo / Cenário de Ruptura Hipotética
                  </label>
                  <textarea
                    rows={3}
                    value={classificacao.rupturaTexto}
                    onChange={(e) => onClassificationChange('rupturaTexto', e.target.value)}
                    placeholder="Os estudos de ruptura hipotética consideraram..."
                    className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                  />
                </div>

                {/* Legenda do quadro */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Legenda / Referência Normativa do Quadro DPA
                  </label>
                  <textarea
                    rows={2}
                    value={classificacao.legendaDPA}
                    onChange={(e) => onClassificationChange('legendaDPA', e.target.value)}
                    className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Memória de cálculo do DPA */}
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h4 className="text-xs font-bold text-slate-700 text-center mb-2">
                Quadro 1. Memória de cálculo quanto ao DPA*
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-slate-300 text-xs">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="border border-slate-300 p-2 text-left">Critério</th>
                      <th className="border border-slate-300 p-2 text-left">Descrição</th>
                      <th className="border border-slate-300 p-2 text-center w-24">Pontos</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-slate-300 p-2 font-medium">
                        DPA1 — Potencial de impacto devido ao volume
                      </td>
                      <td className="border border-slate-300 p-2">
                        {derivedDpa.dpa1 ? derivedDpa.dpa1.faixaLabel : 'Pendente'}
                      </td>
                      <td className="border border-slate-300 p-2 text-center font-bold">
                        {derivedDpa.scoreDpa1 !== null ? derivedDpa.scoreDpa1 : 'Pendente'}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 p-2 font-medium">
                        DPA2 — Construções na área afetada a jusante
                      </td>
                      <td className="border border-slate-300 p-2">
                        {classificacao.dpa2Select
                          ? cleanOptionScore(classificacao.dpa2Select)
                          : 'Pendente'}
                      </td>
                      <td className="border border-slate-300 p-2 text-center font-bold">
                        {derivedDpa.scoreDpa2 !== null ? derivedDpa.scoreDpa2 : 'Pendente'}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 p-2 font-medium">
                        DPA3 — Potencial de impacto ambiental
                      </td>
                      <td className="border border-slate-300 p-2">
                        {classificacao.dpa3Select
                          ? cleanOptionScore(classificacao.dpa3Select)
                          : 'Pendente'}
                      </td>
                      <td className="border border-slate-300 p-2 text-center font-bold">
                        {derivedDpa.scoreDpa3 !== null ? derivedDpa.scoreDpa3 : 'Pendente'}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 p-2 font-medium">
                        DPA4 — Potencial de impacto socioeconômico
                      </td>
                      <td className="border border-slate-300 p-2">
                        {classificacao.dpa4Select
                          ? cleanOptionScore(classificacao.dpa4Select)
                          : 'Pendente'}
                      </td>
                      <td className="border border-slate-300 p-2 text-center font-bold">
                        {derivedDpa.scoreDpa4 !== null ? derivedDpa.scoreDpa4 : 'Pendente'}
                      </td>
                    </tr>
                    <tr className="bg-slate-50 font-bold">
                      <td className="border border-slate-300 p-2">TOTAL DPA</td>
                      <td className="border border-slate-300 p-2 text-slate-500">
                        Baixo (&lt; 7) | Médio (7 a 13) | Alto (&gt; 13)
                      </td>
                      <td className="border border-slate-300 p-2 text-center">
                        {derivedDpa.totalDpa !== null ? derivedDpa.totalDpa : 'Pendente'}
                      </td>
                    </tr>
                    <tr className="bg-slate-100 font-bold">
                      <td className="border border-slate-300 p-2">CLASSIFICAÇÃO DPA</td>
                      <td className="border border-slate-300 p-2" />
                      <td className="border border-slate-300 p-2 text-center">
                        {derivedDpa.dpaClass ? derivedDpa.dpaClass.toUpperCase() : 'PENDENTE'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {classificacao.legendaDPA && (
                <p className="text-[11px] italic text-slate-500 mt-2">{classificacao.legendaDPA}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
