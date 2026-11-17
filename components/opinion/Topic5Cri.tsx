import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  OPS_CT6_VAZAO,
  OPS_EC1_EXTRAVASOR,
  OPS_EC2_ADUTORA,
  OPS_EC3_PERCOLACAO,
  OPS_EC4_DEFORMACAO,
  OPS_EC5_TALUDES,
  OPS_PS1_DOCS,
  OPS_PS2_ORG,
  OPS_PS3_INSP,
  OPS_PS4_REL,
  OPS_PS5_PAE,
  OPS_PS6_REGRA,
} from '../../constants';
import {
  BarramentoData,
  ClassificacaoData,
  RiscoEnum,
} from '../../types';
import {
  DerivedCriResult,
  cleanOptionScore,
  evaluateCt5Age,
} from '../../src/utils/opinionCalculations';

interface Topic5CriProps {
  classificacao: ClassificacaoData;
  barragemPrincipal: BarramentoData;
  derivedCri: DerivedCriResult;
  isOpen: boolean;
  onToggleSection: () => void;
  onClassificationChange: (field: keyof ClassificacaoData, value: any) => void;
}

const renderScore = (score: number | null) =>
  score !== null ? score : <span className="text-amber-700 font-semibold">Pendente</span>;

const formatRiskLabel = (risk: RiscoEnum | null) =>
  risk ? risk.toUpperCase() : 'PENDENTE';

export const Topic5Cri: React.FC<Topic5CriProps> = ({
  classificacao,
  barragemPrincipal,
  derivedCri,
  isOpen,
  onToggleSection,
  onClassificationChange,
}) => {
  const ageEval = evaluateCt5Age(barragemPrincipal.idade);

  const criBadgeClass =
    derivedCri.risco === RiscoEnum.ALTO
      ? 'bg-red-100 text-red-700'
      : derivedCri.risco === RiscoEnum.MEDIO
      ? 'bg-amber-100 text-amber-700'
      : derivedCri.risco === RiscoEnum.BAIXO
      ? 'bg-green-100 text-green-700'
      : 'bg-slate-200 text-slate-700';

  const ctRows = [
    {
      label: 'CT1 — Altura máxima projetada',
      desc: barragemPrincipal.alturaMaxima
        ? `${barragemPrincipal.alturaMaxima} m`
        : 'Pendente (informar no Tópico 3)',
      score: derivedCri.scoreCt1,
    },
    {
      label: 'CT2 — Comprimento do coroamento (margem a margem)',
      desc: barragemPrincipal.comprimentoCoroamento
        ? `${barragemPrincipal.comprimentoCoroamento} m`
        : 'Pendente (informar no Tópico 3)',
      score: derivedCri.scoreCt2,
    },
    {
      label: 'CT3 — Tipo estrutural',
      desc: barragemPrincipal.tipoEstrutural
        ? cleanOptionScore(barragemPrincipal.tipoEstrutural)
        : 'Pendente (informar no Tópico 3)',
      score: derivedCri.scoreCt3,
    },
    {
      label: 'CT4 — Tipo de fundação',
      desc: barragemPrincipal.tipoFundacao
        ? cleanOptionScore(barragemPrincipal.tipoFundacao)
        : 'Pendente (informar no Tópico 3)',
      score: derivedCri.scoreCt4,
    },
    {
      label: 'CT5 — Idade da barragem (desde o início da construção)',
      desc: ageEval.descricao,
      score: derivedCri.scoreCt5,
    },
    {
      label: 'CT6 — Vazão de projeto',
      desc: classificacao.ct6Select
        ? cleanOptionScore(classificacao.ct6Select)
        : 'Pendente',
      score: derivedCri.scoreCt6,
    },
  ];

  const ecRows = [
    {
      label: 'EC1 — Confiabilidade das Estruturas Extravasoras',
      desc: classificacao.ec1Select ? cleanOptionScore(classificacao.ec1Select) : 'Pendente',
      score: derivedCri.scoreEc1,
    },
    {
      label: 'EC2 — Confiabilidade das Estruturas de Adução',
      desc: classificacao.ec2Select ? cleanOptionScore(classificacao.ec2Select) : 'Pendente',
      score: derivedCri.scoreEc2,
    },
    {
      label: 'EC3 — Percolação',
      desc: classificacao.ec3Select ? cleanOptionScore(classificacao.ec3Select) : 'Pendente',
      score: derivedCri.scoreEc3,
    },
    {
      label: 'EC4 — Deformações e Recalques',
      desc: classificacao.ec4Select ? cleanOptionScore(classificacao.ec4Select) : 'Pendente',
      score: derivedCri.scoreEc4,
    },
    {
      label: 'EC5 — Deterioração dos Taludes / Proteções',
      desc: classificacao.ec5Select ? cleanOptionScore(classificacao.ec5Select) : 'Pendente',
      score: derivedCri.scoreEc5,
    },
  ];

  const psRows = [
    {
      label: 'PS1 — Documentação de Projeto',
      desc: classificacao.ps1Select ? cleanOptionScore(classificacao.ps1Select) : 'Pendente',
      score: derivedCri.scorePs1,
    },
    {
      label: 'PS2 — Estrutura Organizacional e Qualificação Técnica',
      desc: classificacao.ps2Select ? cleanOptionScore(classificacao.ps2Select) : 'Pendente',
      score: derivedCri.scorePs2,
    },
    {
      label: 'PS3 — Procedimentos de Inspeção e Monitoramento',
      desc: classificacao.ps3Select ? cleanOptionScore(classificacao.ps3Select) : 'Pendente',
      score: derivedCri.scorePs3,
    },
    {
      label: 'PS4 — Relatórios de Inspeção e Revisão Periódica',
      desc: classificacao.ps4Select ? cleanOptionScore(classificacao.ps4Select) : 'Pendente',
      score: derivedCri.scorePs4,
    },
    {
      label: 'PS5 — Plano de Ação de Emergência (PAE)',
      desc: classificacao.ps5Select ? cleanOptionScore(classificacao.ps5Select) : 'Pendente',
      score: derivedCri.scorePs5,
    },
    {
      label: 'PS6 — Regra Operacional dos Dispositivos de Descarga',
      desc: classificacao.ps6Select ? cleanOptionScore(classificacao.ps6Select) : 'Pendente',
      score: derivedCri.scorePs6,
    },
  ];

  return (
    <section id="cri" className="scroll-mt-56">
      <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
        <button
          type="button"
          onClick={onToggleSection}
          className="w-full flex items-center justify-between mb-6 border-b border-slate-100 pb-4 group"
        >
          <div className="flex items-center gap-2 text-left">
            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-sm shrink-0">
              5
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 group-hover:text-emerald-600 transition-colors">
                CLASSIFICAÇÃO QUANTO À CRI
              </h2>
              <p className="text-xs text-slate-500">
                Características Técnicas (CT), Estado de Conservação (EC), Plano de Segurança da Barragem (PSB) e indicadores de risco
              </p>
            </div>
          </div>
          <div className="text-slate-400 group-hover:text-emerald-600 transition-colors">
            {isOpen ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
          </div>
        </button>

        {isOpen && (
          <div className="space-y-6">
            <div className="bg-amber-50/50 p-4 rounded-lg border border-amber-100 space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <h3 className="font-bold text-amber-900 text-sm uppercase">
                  Categoria de Risco (CRI)
                </h3>
                <span className={`px-2.5 py-1 rounded text-xs font-bold ${criBadgeClass}`}>
                  {derivedCri.isComplete && derivedCri.risco
                    ? `CRI ${derivedCri.risco} (Geral: ${derivedCri.valGeral})`
                    : 'Pendente'}
                </span>
              </div>

              {/* CT */}
              <div>
                <h4 className="text-xs font-bold text-slate-600 border-b border-amber-200 pb-1 mb-3">
                  Características Técnicas (CT) — Total CT:{' '}
                  {derivedCri.totalCT !== null ? derivedCri.totalCT : 'Pendente'}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">
                      CT6 — Vazão de Projeto
                    </label>
                    <select
                      value={classificacao.ct6Select || ''}
                      onChange={(e) => onClassificationChange('ct6Select', e.target.value)}
                      className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                    >
                      <option value="">Selecione...</option>
                      {OPS_CT6_VAZAO.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">
                      Pontuações Derivadas do Tópico 3 (CT1 a CT5)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: 'CT1', score: derivedCri.scoreCt1 },
                        { label: 'CT2', score: derivedCri.scoreCt2 },
                        { label: 'CT3', score: derivedCri.scoreCt3 },
                        { label: 'CT4', score: derivedCri.scoreCt4 },
                        { label: 'CT5', score: derivedCri.scoreCt5 },
                      ].map((ct) => (
                        <div
                          key={ct.label}
                          className={`flex flex-col items-center border rounded px-2.5 py-1 min-w-[54px] ${
                            ct.score === null
                              ? 'bg-amber-50 border-amber-300'
                              : 'bg-white border-slate-200'
                          }`}
                        >
                          <span className="text-[9px] text-slate-500 font-bold">{ct.label}</span>
                          <span className="text-xs font-bold text-slate-700">
                            {ct.score !== null ? ct.score : 'Pend.'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* EC */}
              <div>
                <h4 className="text-xs font-bold text-slate-600 border-b border-amber-200 pb-1 mb-3">
                  Estado de Conservação (EC) — Total EC:{' '}
                  {derivedCri.totalEC !== null ? derivedCri.totalEC : 'Pendente'}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    {
                      label: 'EC1 — Confiabilidade das Estruturas Extravasoras',
                      val: classificacao.ec1Select,
                      key: 'ec1Select' as const,
                      ops: OPS_EC1_EXTRAVASOR,
                    },
                    {
                      label: 'EC2 — Confiabilidade das Estruturas de Adução',
                      val: classificacao.ec2Select,
                      key: 'ec2Select' as const,
                      ops: OPS_EC2_ADUTORA,
                    },
                    {
                      label: 'EC3 — Percolação',
                      val: classificacao.ec3Select,
                      key: 'ec3Select' as const,
                      ops: OPS_EC3_PERCOLACAO,
                    },
                    {
                      label: 'EC4 — Deformações e Recalques',
                      val: classificacao.ec4Select,
                      key: 'ec4Select' as const,
                      ops: OPS_EC4_DEFORMACAO,
                    },
                    {
                      label: 'EC5 — Deterioração dos Taludes / Proteções',
                      val: classificacao.ec5Select,
                      key: 'ec5Select' as const,
                      ops: OPS_EC5_TALUDES,
                    },
                  ].map((field) => (
                    <div key={field.key}>
                      <label className="block text-xs text-slate-600 mb-1">{field.label}</label>
                      <select
                        value={field.val || ''}
                        onChange={(e) => onClassificationChange(field.key, e.target.value)}
                        className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                      >
                        <option value="">Selecione...</option>
                        {field.ops.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* PSB */}
              <div>
                <h4 className="text-xs font-bold text-slate-600 border-b border-amber-200 pb-1 mb-3">
                  Plano de Segurança da Barragem (PSB) — Total PSB:{' '}
                  {derivedCri.totalPS !== null ? derivedCri.totalPS : 'Pendente'}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    {
                      label: 'PS1 — Documentação de Projeto',
                      val: classificacao.ps1Select,
                      key: 'ps1Select' as const,
                      ops: OPS_PS1_DOCS,
                    },
                    {
                      label: 'PS2 — Estrutura Organizacional e Qualificação Técnica',
                      val: classificacao.ps2Select,
                      key: 'ps2Select' as const,
                      ops: OPS_PS2_ORG,
                    },
                    {
                      label: 'PS3 — Procedimentos de Inspeção e Monitoramento',
                      val: classificacao.ps3Select,
                      key: 'ps3Select' as const,
                      ops: OPS_PS3_INSP,
                    },
                    {
                      label: 'PS4 — Relatórios de Inspeção e Revisão Periódica',
                      val: classificacao.ps4Select,
                      key: 'ps4Select' as const,
                      ops: OPS_PS4_REL,
                    },
                    {
                      label: 'PS5 — Plano de Ação de Emergência (PAE)',
                      val: classificacao.ps5Select,
                      key: 'ps5Select' as const,
                      ops: OPS_PS5_PAE,
                    },
                    {
                      label: 'PS6 — Regra Operacional dos Dispositivos de Descarga',
                      val: classificacao.ps6Select,
                      key: 'ps6Select' as const,
                      ops: OPS_PS6_REGRA,
                    },
                  ].map((field) => (
                    <div key={field.key}>
                      <label className="block text-xs text-slate-600 mb-1">{field.label}</label>
                      <select
                        value={field.val || ''}
                        onChange={(e) => onClassificationChange(field.key, e.target.value)}
                        className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                      >
                        <option value="">Selecione...</option>
                        {field.ops.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Memória de Cálculo Detalhada CT / EC / PS */}
            <div className="space-y-4">
              {/* Quadro 2 CT */}
              <div className="overflow-x-auto">
                <p className="text-center text-xs font-bold text-slate-700 mb-1">
                  Quadro 2. Características Técnicas (CT)
                </p>
                <table className="w-full border-collapse border border-slate-300 text-xs">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="border border-slate-300 p-2 text-left">Critério</th>
                      <th className="border border-slate-300 p-2 text-left">Descrição</th>
                      <th className="border border-slate-300 p-2 text-center w-24">Pontos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ctRows.map((r) => (
                      <tr key={r.label}>
                        <td className="border border-slate-300 p-2">{r.label}</td>
                        <td className="border border-slate-300 p-2">{r.desc}</td>
                        <td className="border border-slate-300 p-2 text-center font-bold">
                          {renderScore(r.score)}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-100 font-bold">
                      <td className="border border-slate-300 p-2">TOTAL CT</td>
                      <td className="border border-slate-300 p-2" />
                      <td className="border border-slate-300 p-2 text-center">
                        {renderScore(derivedCri.totalCT)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Quadro 3 EC */}
              <div className="overflow-x-auto">
                <p className="text-center text-xs font-bold text-slate-700 mb-1">
                  Quadro 3. Estado de Conservação (EC)
                </p>
                <table className="w-full border-collapse border border-slate-300 text-xs">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="border border-slate-300 p-2 text-left">Critério</th>
                      <th className="border border-slate-300 p-2 text-left">Descrição</th>
                      <th className="border border-slate-300 p-2 text-center w-24">Pontos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ecRows.map((r) => (
                      <tr key={r.label}>
                        <td className="border border-slate-300 p-2">{r.label}</td>
                        <td className="border border-slate-300 p-2">{r.desc}</td>
                        <td className="border border-slate-300 p-2 text-center font-bold">
                          {renderScore(r.score)}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-100 font-bold">
                      <td className="border border-slate-300 p-2">TOTAL EC</td>
                      <td className="border border-slate-300 p-2" />
                      <td className="border border-slate-300 p-2 text-center">
                        {renderScore(derivedCri.totalEC)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Quadro 4 PSB */}
              <div className="overflow-x-auto">
                <p className="text-center text-xs font-bold text-slate-700 mb-1">
                  Quadro 4. Plano de Segurança da Barragem (PSB)
                </p>
                <table className="w-full border-collapse border border-slate-300 text-xs">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="border border-slate-300 p-2 text-left">Critério</th>
                      <th className="border border-slate-300 p-2 text-left">Descrição</th>
                      <th className="border border-slate-300 p-2 text-center w-24">Pontos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {psRows.map((r) => (
                      <tr key={r.label}>
                        <td className="border border-slate-300 p-2">{r.label}</td>
                        <td className="border border-slate-300 p-2">{r.desc}</td>
                        <td className="border border-slate-300 p-2 text-center font-bold">
                          {renderScore(r.score)}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-100 font-bold">
                      <td className="border border-slate-300 p-2">TOTAL PSB</td>
                      <td className="border border-slate-300 p-2" />
                      <td className="border border-slate-300 p-2 text-center">
                        {renderScore(derivedCri.totalPS)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Indicadores de Risco (Quadros 5.1 a 5.5) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
                {/* Quadro 5.2 Risco Geral */}
                <table className="w-full border-collapse border border-slate-300 text-xs">
                  <tbody>
                    <tr className="bg-slate-100">
                      <td colSpan={2} className="border border-slate-300 p-2 font-bold">
                        Quadro 5.2 — INDICADOR DE RISCO GERAL{' '}
                        {derivedCri.valGeral !== null ? `(Total: ${derivedCri.valGeral})` : ''}
                      </td>
                    </tr>
                    <tr className={derivedCri.riskGeral === RiscoEnum.ALTO ? 'bg-amber-100 font-semibold' : ''}>
                      <td className="border border-slate-300 p-1.5">CT + EC + PSB &gt;= 65</td>
                      <td className="border border-slate-300 p-1.5 w-24">ALTO</td>
                    </tr>
                    <tr className={derivedCri.riskGeral === RiscoEnum.MEDIO ? 'bg-amber-100 font-semibold' : ''}>
                      <td className="border border-slate-300 p-1.5">35 &lt; CT + EC + PSB &lt; 65</td>
                      <td className="border border-slate-300 p-1.5">MÉDIO</td>
                    </tr>
                    <tr className={derivedCri.riskGeral === RiscoEnum.BAIXO ? 'bg-amber-100 font-semibold' : ''}>
                      <td className="border border-slate-300 p-1.5">CT + EC + PSB &lt;= 35</td>
                      <td className="border border-slate-300 p-1.5">BAIXO</td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td colSpan={2} className="border border-slate-300 p-1.5 font-bold text-center">
                        Resultado: {formatRiskLabel(derivedCri.riskGeral)}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Quadro 5.3 Percolação / Conservação */}
                <table className="w-full border-collapse border border-slate-300 text-xs">
                  <tbody>
                    <tr className="bg-slate-100">
                      <td colSpan={2} className="border border-slate-300 p-2 font-bold">
                        Quadro 5.3 — RISCO POR PERCOLAÇÃO / CONSERVAÇÃO{' '}
                        {derivedCri.valPercolacao !== null
                          ? `(Soma EC3..EC5: ${derivedCri.valPercolacao})`
                          : ''}
                      </td>
                    </tr>
                    <tr
                      className={
                        derivedCri.riskPercolacao === RiscoEnum.ALTO
                          ? 'bg-amber-100 font-semibold'
                          : ''
                      }
                    >
                      <td className="border border-slate-300 p-1.5">
                        EC3 = 5 ou EC4 = 5 ou EC5 = 5 ou (EC3 + EC4 + EC5) &gt; 10
                      </td>
                      <td className="border border-slate-300 p-1.5 w-24">ALTO</td>
                    </tr>
                    <tr
                      className={
                        derivedCri.riskPercolacao === RiscoEnum.MEDIO
                          ? 'bg-amber-100 font-semibold'
                          : ''
                      }
                    >
                      <td className="border border-slate-300 p-1.5">
                        7 &lt; (EC3 + EC4 + EC5) &lt;= 10
                      </td>
                      <td className="border border-slate-300 p-1.5">MÉDIO</td>
                    </tr>
                    <tr
                      className={
                        derivedCri.riskPercolacao === RiscoEnum.BAIXO
                          ? 'bg-amber-100 font-semibold'
                          : ''
                      }
                    >
                      <td className="border border-slate-300 p-1.5">(EC3 + EC4 + EC5) &lt;= 7</td>
                      <td className="border border-slate-300 p-1.5">BAIXO</td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td colSpan={2} className="border border-slate-300 p-1.5 font-bold text-center">
                        Resultado: {formatRiskLabel(derivedCri.riskPercolacao)}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Quadro 5.4 Galgamento */}
                <table className="w-full border-collapse border border-slate-300 text-xs">
                  <tbody>
                    <tr className="bg-slate-100">
                      <td colSpan={2} className="border border-slate-300 p-2 font-bold">
                        Quadro 5.4 — RISCO POR GALGAMENTO{' '}
                        {derivedCri.valGalgamento !== null
                          ? `(CT6 + EC1: ${derivedCri.valGalgamento})`
                          : ''}
                      </td>
                    </tr>
                    <tr
                      className={
                        derivedCri.riskGalgamento === RiscoEnum.ALTO
                          ? 'bg-amber-100 font-semibold'
                          : ''
                      }
                    >
                      <td className="border border-slate-300 p-1.5">
                        (CT6 + EC1) &gt; 7 ou EC1 = 5
                      </td>
                      <td className="border border-slate-300 p-1.5 w-24">ALTO</td>
                    </tr>
                    <tr
                      className={
                        derivedCri.riskGalgamento === RiscoEnum.MEDIO
                          ? 'bg-amber-100 font-semibold'
                          : ''
                      }
                    >
                      <td className="border border-slate-300 p-1.5">4 &lt; (CT6 + EC1) &lt;= 7</td>
                      <td className="border border-slate-300 p-1.5">MÉDIO</td>
                    </tr>
                    <tr
                      className={
                        derivedCri.riskGalgamento === RiscoEnum.BAIXO
                          ? 'bg-amber-100 font-semibold'
                          : ''
                      }
                    >
                      <td className="border border-slate-300 p-1.5">(CT6 + EC1) &lt;= 4</td>
                      <td className="border border-slate-300 p-1.5">BAIXO</td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td colSpan={2} className="border border-slate-300 p-1.5 font-bold text-center">
                        Resultado: {formatRiskLabel(derivedCri.riskGalgamento)}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Quadro 5.5 Gerencial */}
                <table className="w-full border-collapse border border-slate-300 text-xs">
                  <tbody>
                    <tr className="bg-slate-100">
                      <td colSpan={2} className="border border-slate-300 p-2 font-bold">
                        Quadro 5.5 — INDICADOR DE RISCO GERENCIAL{' '}
                        {derivedCri.valGerencial !== null ? `(Total PSB: ${derivedCri.valGerencial})` : ''}
                      </td>
                    </tr>
                    <tr
                      className={
                        derivedCri.riskGerencial === RiscoEnum.ALTO
                          ? 'bg-amber-100 font-semibold'
                          : ''
                      }
                    >
                      <td className="border border-slate-300 p-1.5">PSB &gt;= 24</td>
                      <td className="border border-slate-300 p-1.5 w-24">ALTO</td>
                    </tr>
                    <tr
                      className={
                        derivedCri.riskGerencial === RiscoEnum.MEDIO
                          ? 'bg-amber-100 font-semibold'
                          : ''
                      }
                    >
                      <td className="border border-slate-300 p-1.5">13 &lt; PSB &lt; 24</td>
                      <td className="border border-slate-300 p-1.5">MÉDIO</td>
                    </tr>
                    <tr
                      className={
                        derivedCri.riskGerencial === RiscoEnum.BAIXO
                          ? 'bg-amber-100 font-semibold'
                          : ''
                      }
                    >
                      <td className="border border-slate-300 p-1.5">PSB &lt;= 13</td>
                      <td className="border border-slate-300 p-1.5">BAIXO</td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td colSpan={2} className="border border-slate-300 p-1.5 font-bold text-center">
                        Resultado: {formatRiskLabel(derivedCri.riskGerencial)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Quadro 5.1 Resumo Final da CRI */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-slate-300 text-xs">
                  <tbody>
                    <tr className="bg-slate-100">
                      <td colSpan={2} className="border border-slate-300 p-2 font-bold">
                        Quadro 5.1 — FAIXAS DE CLASSIFICAÇÃO POR CATEGORIA DE RISCO (CRI)
                      </td>
                    </tr>
                    <tr className={derivedCri.risco === RiscoEnum.ALTO ? 'bg-amber-100 font-semibold' : ''}>
                      <td className="border border-slate-300 p-2">
                        Se algum indicador de risco resultar em ALTO
                      </td>
                      <td className="border border-slate-300 p-2 w-32">ALTA</td>
                    </tr>
                    <tr className={derivedCri.risco === RiscoEnum.MEDIO ? 'bg-amber-100 font-semibold' : ''}>
                      <td className="border border-slate-300 p-2">
                        Se NENHUM indicador resultar em ALTO, e algum resultar em MÉDIO
                      </td>
                      <td className="border border-slate-300 p-2">MÉDIA</td>
                    </tr>
                    <tr className={derivedCri.risco === RiscoEnum.BAIXO ? 'bg-amber-100 font-semibold' : ''}>
                      <td className="border border-slate-300 p-2">
                        Se todos os indicadores de risco resultarem em BAIXO
                      </td>
                      <td className="border border-slate-300 p-2">BAIXA</td>
                    </tr>
                    <tr className="bg-slate-100 font-bold">
                      <td colSpan={2} className="border border-slate-300 p-2 text-center">
                        RESULTADO FINAL DA CRI: {formatRiskLabel(derivedCri.risco)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
