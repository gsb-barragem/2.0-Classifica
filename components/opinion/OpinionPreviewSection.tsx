import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { DanoEnum, ParecerData, RiscoEnum } from '../../types';
import {
  DerivedClassificationResult,
  buildAutomaticIntroText,
  cleanOptionScore,
  evaluateCt5Age,
  getQuadro7RegulatorioRows,
} from '../../src/utils/opinionCalculations';
import { normalizeCoordinateToGMS } from '../../src/utils/coordinateUtils';

const TableCellPreview = ({
  value,
  bold = false,
  align = 'left',
  colSpan = 1,
  bg = '',
}: {
  value: React.ReactNode;
  bold?: boolean;
  align?: 'left' | 'center';
  colSpan?: number;
  bg?: string;
}) => (
  <td
    colSpan={colSpan}
    className={`border border-black px-2 py-1 text-[10pt] ${bold ? 'font-bold' : ''} ${
      align === 'center' ? 'text-center' : 'text-left'
    } ${bg}`}
  >
    {value}
  </td>
);

const formatFls = (val: string) => {
  if (!val) return '';
  const clean = val.trim();
  if (clean.toLowerCase().includes('fls')) return clean;
  return `fls. ${clean}`;
};

interface OpinionPreviewSectionProps {
  formData: ParecerData;
  derived: DerivedClassificationResult;
  isOpen: boolean;
  onToggleSection: () => void;
}

export const OpinionPreviewSection: React.FC<OpinionPreviewSectionProps> = ({
  formData,
  derived,
  isOpen,
  onToggleSection,
}) => {
  const classif =
    formData.tipoClassificacao === 'OUTRO'
      ? formData.tipoClassificacaoOutro
      : formData.tipoClassificacao;
  const barragem =
    formData.tipoBarragem === 'OUTRO' ? formData.tipoBarragemOutro : formData.tipoBarragem;
  const situacao =
    formData.situacaoEmpreendimento === 'OUTRO'
      ? formData.situacaoEmpreendimentoOutro
      : formData.situacaoEmpreendimento;
  const analistaNome =
    formData.analista === 'OUTRO' ? formData.analistaOutro : formData.analista;
  const rtText = (formData.responsaveisTecnicos || [])
    .map((rt) => `${rt.nome} (ART ${rt.art})`)
    .join('; ');

  const introText = formData.introducao.trim()
    ? formData.introducao
    : buildAutomaticIntroText(formData);

  const volNomenclature = derived.dpa.dpa1
    ? `${derived.dpa.dpa1.nomenclatura}.`
    : 'Pendente';

  const volumeText = derived.dpa.dpa1
    ? `De acordo com o Art. 6º da Resolução CNRH Nº 241/2024, as barragens são classificadas quanto ao volume total do reservatório. Conforme informações apresentadas pelo empreendedor, a Barragem é classificada, quanto ao Volume, como ‘${volNomenclature}’`
    : 'Volume armazenado (NMM) pendente para classificação quanto ao volume.';

  const rupturaSuffix = formData.classificacao.rupturaTexto?.trim()
    ? ` ${formData.classificacao.rupturaTexto.trim()}`
    : '';
  const dpaText = `Conforme Art. 4º da Resolução CNRH Nº 241, de 10 de setembro de 2024, a classificação por Categoria de Dano Potencial Associado (DPA) da barragem tem por objetivo classificar as barragens em função do potencial de danos humanos, sociais, econômicos e ambientais decorrentes de eventual ruptura, vazamento, infiltração no solo ou mau funcionamento da barragem, devendo ser considerado o cenário de pior caso.${rupturaSuffix}`;

  const criText = `Segundo o Art. 7º da Resolução CNRH Nº 241/2024, a Categoria de Risco (CRI) refere-se aos aspectos da própria barragem que possam influenciar na probabilidade de ocorrência de acidente, sendo classificada em função das características técnicas, do estado de conservação do empreendimento e do plano de segurança da barragem. Abaixo se encontra a classificação do barramento quanto à categoria de risco embasada na Resolução:`;

  const renderAllDocs = () => {
    const sections = [
      {
        title: 'Documentos Gerais',
        docs: formData.docsGerais,
        outros: formData.docsGeraisOutro,
        artMode: false,
      },
      {
        title: 'Documentos de Identificação',
        docs: formData.docsIdentificacao,
        outros: formData.docsIdentificacaoOutro,
        artMode: false,
      },
      ...(formData.espolio
        ? [
            {
              title: 'Documentos de Espólio',
              docs: formData.docsEspolio,
              outros: formData.docsEspolioOutro,
              artMode: false,
            },
          ]
        : []),
      {
        title: 'Documentos de ART',
        docs: formData.docsArt,
        outros: formData.docsArtOutro,
        artMode: true,
      },
      {
        title: 'Documentos Técnicos',
        docs: formData.docsTecnicos,
        outros: formData.docsTecnicosOutro,
        artMode: false,
      },
    ];

    return (
      <div className="mb-6 space-y-4">
        {sections.map((sec, idx) => {
          const checked = (sec.docs || []).filter((d) => d.checked);
          const checkedOutros = (sec.outros || []).filter((d) => d.checked);
          if (checked.length === 0 && checkedOutros.length === 0) return null;

          return (
            <div key={idx}>
              <p className="font-bold text-xs underline mb-1">{sec.title}:</p>
              <ul className="list-disc ml-6 text-xs space-y-1">
                {checked.map((d) => (
                  <li key={d.id}>
                    {sec.artMode
                      ? `ART nº ${d.extraInput || '_____'} — ${d.label}`
                      : `${d.label}${d.extraInput ? ` - ${d.extraInput}` : ''}`}{' '}
                    {d.pageNumber ? `(Fls. ${d.pageNumber})` : ''}
                  </li>
                ))}
                {checkedOutros.map((d) => (
                  <li key={d.id}>
                    {sec.artMode
                      ? `ART nº ${d.extraInput || '_____'} — ${d.extraSelect || 'OUTRO'}`
                      : d.extraInput || d.label}{' '}
                    {d.pageNumber ? `(Fls. ${d.pageNumber})` : ''}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    );
  };

  const renderBarramentoTable = (b: any, title: string, isMain: boolean) => (
    <div className="mb-6">
      <p className="text-center text-xs font-bold mb-1">{title}</p>
      <table className="w-full border-collapse border border-black text-xs">
        <tbody>
          <tr>
            <TableCellPreview value="Nome da barragem" bold />
            <TableCellPreview value={b.nome || ''} />
          </tr>
          {!isMain && (
            <tr>
              <TableCellPreview value="Relação com a barragem principal" bold />
              <TableCellPreview value={b.relacaoBarragemPrincipal || 'Pendente'} />
            </tr>
          )}
          <tr>
            <TableCellPreview value="SNISB" bold />
            <TableCellPreview value={b.snisb || ''} />
          </tr>
          <tr>
            <TableCellPreview value="Coordenadas" bold />
            <TableCellPreview
              value={`Lat: ${normalizeCoordinateToGMS(b.lat) || b.lat || ''} Long: ${
                normalizeCoordinateToGMS(b.long) || b.long || ''
              }`}
            />
          </tr>
          <tr>
            <TableCellPreview value="Altura Máxima (m)" bold />
            <TableCellPreview
              value={(b.alturaMaxima || '') + (b.alturaMaximaFls ? ` (${formatFls(b.alturaMaximaFls)})` : '')}
            />
          </tr>
          <tr>
            <TableCellPreview value="Borda Livre (m)" bold />
            <TableCellPreview
              value={(b.bordaLivre || '') + (b.bordaLivreFls ? ` (${formatFls(b.bordaLivreFls)})` : '')}
            />
          </tr>
          <tr>
            <TableCellPreview value="Cota do Coroamento (m)" bold />
            <TableCellPreview
              value={
                (b.cotaCoroamento || '') +
                (b.cotaCoroamentoFls ? ` (${formatFls(b.cotaCoroamentoFls)})` : '')
              }
            />
          </tr>
          <tr>
            <TableCellPreview value="Comprimento do Coroamento (m)" bold />
            <TableCellPreview
              value={
                (b.comprimentoCoroamento || '') +
                (b.comprimentoCoroamentoFls ? ` (${formatFls(b.comprimentoCoroamentoFls)})` : '')
              }
            />
          </tr>
          <tr>
            <TableCellPreview value="Largura do Coroamento (m)" bold />
            <TableCellPreview
              value={
                (b.larguraCoroamento || '') +
                (b.larguraCoroamentoFls ? ` (${formatFls(b.larguraCoroamentoFls)})` : '')
              }
            />
          </tr>
          <tr>
            <TableCellPreview value="Tipo Estrutural" bold />
            <TableCellPreview value={cleanOptionScore(b.tipoEstrutural)} />
          </tr>
          <tr>
            <TableCellPreview value="Tipo de Fundação" bold />
            <TableCellPreview value={cleanOptionScore(b.tipoFundacao)} />
          </tr>
          <tr>
            <TableCellPreview value="Idade da barragem" bold />
            <TableCellPreview value={evaluateCt5Age(b.idade).descricao} />
          </tr>
          <tr>
            <TableCellPreview value="Reservatório (Cota NNO) (m)" bold />
            <TableCellPreview value={b.cotaNNO || ''} />
          </tr>
          <tr>
            <TableCellPreview value="Reservatório (Cota NMM) (m)" bold />
            <TableCellPreview value={b.cotaNMM || ''} />
          </tr>
          <tr>
            <TableCellPreview value="Reservatório (Área NNO) (m²)/(ha)" bold />
            <TableCellPreview value={b.areaNNO || ''} />
          </tr>
          <tr>
            <TableCellPreview value="Reservatório (Área NMM) (m²)/(ha)" bold />
            <TableCellPreview value={b.areaNMM || ''} />
          </tr>
          <tr>
            <TableCellPreview value="Reservatório (Vol. NMO) (hm³)" bold />
            <TableCellPreview value={b.volumeNMO || ''} />
          </tr>
          <tr>
            <TableCellPreview value="Reservatório (Vol. NMM) (hm³)" bold />
            <TableCellPreview value={b.volumeNMM || ''} />
          </tr>
          <tr>
            <TableCellPreview value="Vazão Máxima de Projeto (m³/s) /TR" bold />
            <TableCellPreview value={b.vazaoMaxima || ''} />
          </tr>
        </tbody>
      </table>

      {b.estruturas?.length > 0 && (
        <div className="mt-2">
          <p className="font-bold text-xs mb-1">Estruturas Hidráulicas:</p>
          <table className="w-full border-collapse border border-black text-xs">
            <thead className="bg-gray-100">
              <tr>
                <th className="border border-black p-1">Descrição</th>
                <th className="border border-black p-1">Vazão (m³/s)</th>
                <th className="border border-black p-1">Cota Soleira (m)</th>
                <th className="border border-black p-1">Localização</th>
                <th className="border border-black p-1">Segurança</th>
              </tr>
            </thead>
            <tbody>
              {b.estruturas.map((s: any, idx: number) => (
                <tr key={idx}>
                  <td className="border border-black p-1">{s.descricao}</td>
                  <td className="border border-black p-1 text-center">{s.vazao}</td>
                  <td className="border border-black p-1 text-center">{s.cotaSoleira}</td>
                  <td className="border border-black p-1 text-center">{s.localizacao}</td>
                  <td className="border border-black p-1 text-center">{s.seguranca}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderAdequacaoTable = (b: any, title: string) => {
    if (!b || !b.possuiAdequacao) return null;
    return (
      <div className="mt-4">
        <p className="text-center text-xs font-bold mb-1">{title}</p>
        <table className="w-full border-collapse border border-black text-xs">
          <tbody>
            <tr>
              <TableCellPreview value="Vazão (Adequação) (m³/s)" bold />
              <TableCellPreview value={b.adequacaoVazao || '-'} />
            </tr>
            <tr>
              <TableCellPreview value="Cota Soleira (Adequação) (m)" bold />
              <TableCellPreview value={b.adequacaoCota || '-'} />
            </tr>
            <tr>
              <TableCellPreview value="Localização (Adequação)" bold />
              <TableCellPreview value={b.adequacaoLocalizacao || '-'} />
            </tr>
            <tr>
              <TableCellPreview value="Vazão Mínima Remanescente" bold />
              <TableCellPreview value={b.adequacaoVazaoRemanescente || '-'} />
            </tr>
            <tr>
              <TableCellPreview value="Segurança (Adequação)" bold />
              <TableCellPreview value={b.adequacaoSeguranca || '-'} />
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  const quadro7Rows =
    !derived.isPreClassificacao &&
    derived.resultado.isComplete &&
    derived.pnsb.enquadrada === true
      ? getQuadro7RegulatorioRows(derived.resultado.label)
      : [];

  const agePreview = evaluateCt5Age(formData.barragemPrincipal.idade);
  const cri = derived.cri;

  return (
    <section id="revisar" className="scroll-mt-56">
      <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
        <button
          type="button"
          onClick={onToggleSection}
          className="w-full flex items-center justify-between mb-6 border-b border-slate-100 pb-4 group"
        >
          <div className="flex items-center gap-2 text-left">
            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-sm shrink-0">
              {derived.isPreClassificacao || derived.pnsb.status === 'nao_enquadrada' ? 7 : 8}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 group-hover:text-emerald-600 transition-colors uppercase">
                REVISÃO DO PARECER
              </h2>
              <p className="text-xs text-slate-500">
                Pré-visualização estruturada do parecer técnico
              </p>
            </div>
          </div>
          <div className="text-slate-400 group-hover:text-emerald-600 transition-colors">
            {isOpen ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
          </div>
        </button>

        {isOpen && (
          <div className="bg-gray-200 p-2 sm:p-4 md:p-8 rounded-lg overflow-x-auto border border-gray-300 w-full flex justify-center">
            <div className="bg-white shadow-2xl p-[0.5cm] sm:p-[1cm] md:p-[2cm] w-full max-w-[210mm] min-h-[297mm] text-black font-[Times_New_Roman] text-justify leading-relaxed text-[9px] sm:text-xs md:text-sm">
              <div className="text-center font-bold mb-6 text-[12pt]">
                <p>GOVERNO DO ESTADO DE MATO GROSSO</p>
                <p>SECRETARIA DE ESTADO DE MEIO AMBIENTE - SEMA</p>
              </div>

              <h1 className="text-center font-bold mb-8 text-[14pt]">
                PARECER TÉCNICO - CSB/SURH/SEMA-MT
              </h1>

              <div className="mb-6">
                <p>
                  <strong>Processo nº:</strong> {formData.protocolo}
                </p>
                <p className="mt-2 text-justify font-bold uppercase">
                  {classif} quanto à Segurança de{' '}
                  {classif === 'CLASSIFICAÇÃO DE RESERVATÓRIO PULMÃO'
                    ? 'Barragem'
                    : `Barragem de ${barragem || '...'}`}{' '}
                  - {formData.barragemPrincipal.nome} (Código SNISB nº{' '}
                  {formData.barragemPrincipal.snisb || '____'})
                </p>
              </div>

              <h2 className="font-bold mb-2 uppercase">1. INTRODUÇÃO</h2>
              <p className="mb-4 whitespace-pre-line">{introText}</p>
              {renderAllDocs()}

              <h2 className="font-bold mb-2 uppercase">2. INFORMAÇÕES DO PEDIDO</h2>
              <p className="text-center text-xs font-bold mb-1">
                Tabela 1. Informações do empreendedor e empreendimento
              </p>
              <table className="w-full border-collapse border border-black text-xs mb-4">
                <tbody>
                  <tr>
                    <TableCellPreview value="Identificação do empreendedor" bold />
                    <TableCellPreview value={formData.razaoSocial} />
                  </tr>
                  <tr>
                    <TableCellPreview
                      value={
                        (formData.cpfCnpj || '').replace(/\D/g, '').length > 11 ? 'CNPJ' : 'CPF'
                      }
                      bold
                    />
                    <TableCellPreview value={formData.cpfCnpj || '-'} />
                  </tr>
                  <tr>
                    <TableCellPreview value="Localização / Endereço" bold />
                    <TableCellPreview value={formData.localizacao} />
                  </tr>
                  <tr>
                    <TableCellPreview value="Nº CAR" bold />
                    <TableCellPreview value={formData.numCAR} />
                  </tr>
                  <tr>
                    <TableCellPreview value="Município/UF" bold />
                    <TableCellPreview value={formData.municipio ? `${formData.municipio}/MT` : '-'} />
                  </tr>
                  <tr>
                    <TableCellPreview value="Finalidade" bold />
                    <TableCellPreview
                      value={
                        formData.finalidade === 'OUTRO'
                          ? formData.finalidadeOutro
                          : formData.finalidade
                      }
                    />
                  </tr>
                  <tr>
                    <TableCellPreview value="Situação" bold />
                    <TableCellPreview value={situacao} />
                  </tr>
                  <tr>
                    <TableCellPreview value="Curso d'água" bold />
                    <TableCellPreview value={formData.cursoAgua} />
                  </tr>
                  <tr>
                    <TableCellPreview value="Propriedades Limites" bold />
                    <TableCellPreview value={formData.propriedadesLimites} />
                  </tr>
                  <tr>
                    <TableCellPreview value="Sub-bacia/Bacia" bold />
                    <TableCellPreview value={formData.subBacia} />
                  </tr>
                  <tr>
                    <TableCellPreview value="UPG" bold />
                    <TableCellPreview value={formData.upg || ''} />
                  </tr>
                  <tr>
                    <TableCellPreview value="Área da bacia (km²)" bold />
                    <TableCellPreview value={formData.areaBacia} />
                  </tr>
                  <tr>
                    <TableCellPreview value="Índice pluviosidade" bold />
                    <TableCellPreview value={formData.indicePluviosidade} />
                  </tr>
                  <tr>
                    <TableCellPreview value="Resp. Técnico" bold />
                    <TableCellPreview value={rtText} />
                  </tr>
                </tbody>
              </table>
              <p className="text-[10pt] italic mb-6">{formData.legendaTabela1}</p>

              <h2 className="font-bold mb-2 uppercase">3. INFORMAÇÕES DO BARRAMENTO</h2>
              {renderBarramentoTable(
                formData.barragemPrincipal,
                'Tabela 2. Informações gerais do barramento principal',
                true
              )}

              {formData.barragensMontante.length > 0 && (
                <div className="mt-6">
                  <h3 className="font-bold mb-2 uppercase">3.1 BARRAGENS A MONTANTE</h3>
                  {formData.barragensMontante.map((b, idx) => (
                    <div key={b.id || idx}>
                      {renderBarramentoTable(b, `Tabela 2.${idx + 1}. Informações da ${b.nome}`, false)}
                    </div>
                  ))}
                </div>
              )}

              {renderAdequacaoTable(
                formData.barragemPrincipal,
                formData.barragensMontante.length > 0
                  ? 'Tabela 3. Adequações propostas para o barramento principal'
                  : 'Tabela 3. Adequações propostas para o barramento'
              )}
              {formData.barragensMontante.map((b, idx) => (
                <React.Fragment key={b.id || idx}>
                  {renderAdequacaoTable(
                    b,
                    `Tabela 3.${idx + 1}. Adequações propostas para a ${
                      b.nome || `Barragem a montante ${idx + 1}`
                    }`
                  )}
                </React.Fragment>
              ))}

              <h2 className="font-bold mb-2 uppercase mt-8">4. CLASSIFICAÇÃO</h2>
              <h3 className="font-bold mb-1">4.1 Quanto ao Volume</h3>
              <p className="mb-4 text-justify">{volumeText}</p>

              <h3 className="font-bold mb-1">4.2 Quanto ao Dano Potencial Associado (DPA)</h3>
              <p className="mb-4 text-justify">{dpaText}</p>

              <p className="text-center text-xs font-bold mb-1">
                Quadro 1. Memória de cálculo quanto ao DPA*.
              </p>
              <table className="w-full border-collapse border border-black text-xs mb-2">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="border border-black p-1">Critério</th>
                    <th className="border border-black p-1">Descrição</th>
                    <th className="border border-black p-1">Pontos</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <TableCellPreview value="Potencial Impacto devido ao volume" />
                    <TableCellPreview
                      value={derived.dpa.dpa1 ? derived.dpa.dpa1.faixaLabel : 'Pendente'}
                    />
                    <TableCellPreview
                      value={derived.dpa.scoreDpa1 !== null ? derived.dpa.scoreDpa1 : 'Pendente'}
                      align="center"
                    />
                  </tr>
                  <tr>
                    <TableCellPreview value="Potencial de perda de vidas humanas" />
                    <TableCellPreview
                      value={
                        formData.classificacao.dpa2Select
                          ? cleanOptionScore(formData.classificacao.dpa2Select)
                          : 'Pendente'
                      }
                    />
                    <TableCellPreview
                      value={derived.dpa.scoreDpa2 !== null ? derived.dpa.scoreDpa2 : 'Pendente'}
                      align="center"
                    />
                  </tr>
                  <tr>
                    <TableCellPreview value="Potencial de Impacto Ambiental" />
                    <TableCellPreview
                      value={
                        formData.classificacao.dpa3Select
                          ? cleanOptionScore(formData.classificacao.dpa3Select)
                          : 'Pendente'
                      }
                    />
                    <TableCellPreview
                      value={derived.dpa.scoreDpa3 !== null ? derived.dpa.scoreDpa3 : 'Pendente'}
                      align="center"
                    />
                  </tr>
                  <tr>
                    <TableCellPreview value="Potencial de Impacto Socioeconômico" />
                    <TableCellPreview
                      value={
                        formData.classificacao.dpa4Select
                          ? cleanOptionScore(formData.classificacao.dpa4Select)
                          : 'Pendente'
                      }
                    />
                    <TableCellPreview
                      value={derived.dpa.scoreDpa4 !== null ? derived.dpa.scoreDpa4 : 'Pendente'}
                      align="center"
                    />
                  </tr>
                  <tr>
                    <TableCellPreview value="TOTAL" bold />
                    <TableCellPreview value="" />
                    <TableCellPreview
                      value={derived.dpa.totalDpa !== null ? derived.dpa.totalDpa : 'Pendente'}
                      bold
                      align="center"
                    />
                  </tr>
                  <tr>
                    <TableCellPreview value="CLASSIFICAÇÃO" bold />
                    <TableCellPreview value="" />
                    <TableCellPreview
                      value={derived.dpa.dpaClass || 'Pendente'}
                      bold
                      align="center"
                    />
                  </tr>
                </tbody>
              </table>
              <p className="text-[9pt] italic mb-6">{formData.classificacao.legendaDPA}</p>

              {/* CRI somente quando NÃO for pré-classificação e NÃO for não enquadrada na PNSB */}
              {!derived.isPreClassificacao && derived.pnsb.status !== 'nao_enquadrada' && cri && (
                <>
                  <h3 className="font-bold mb-1 mt-4">4.3 Quanto à Categoria de Risco (CRI)</h3>
                  <p className="mb-4 text-justify">{criText}</p>

                  <p className="text-center text-xs font-bold mb-1 mt-4">
                    Quadro 2. Características Técnicas (CT)
                  </p>
                  <table className="w-full border-collapse border border-black text-xs mb-2">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="border border-black p-1">Critério</th>
                        <th className="border border-black p-1">Descrição</th>
                        <th className="border border-black p-1">Pontos</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <TableCellPreview value="CT1 - Altura" />
                        <TableCellPreview
                          value={
                            formData.barragemPrincipal.alturaMaxima
                              ? `${formData.barragemPrincipal.alturaMaxima} m`
                              : 'Pendente'
                          }
                        />
                        <TableCellPreview
                          value={cri.scoreCt1 !== null ? cri.scoreCt1 : 'Pendente'}
                          align="center"
                        />
                      </tr>
                      <tr>
                        <TableCellPreview value="CT2 - Comprimento" />
                        <TableCellPreview
                          value={
                            formData.barragemPrincipal.comprimentoCoroamento
                              ? `${formData.barragemPrincipal.comprimentoCoroamento} m`
                              : 'Pendente'
                          }
                        />
                        <TableCellPreview
                          value={cri.scoreCt2 !== null ? cri.scoreCt2 : 'Pendente'}
                          align="center"
                        />
                      </tr>
                      <tr>
                        <TableCellPreview value="CT3 - Tipo Estrutural" />
                        <TableCellPreview
                          value={
                            formData.barragemPrincipal.tipoEstrutural
                              ? cleanOptionScore(formData.barragemPrincipal.tipoEstrutural)
                              : 'Pendente'
                          }
                        />
                        <TableCellPreview
                          value={cri.scoreCt3 !== null ? cri.scoreCt3 : 'Pendente'}
                          align="center"
                        />
                      </tr>
                      <tr>
                        <TableCellPreview value="CT4 - Tipo de Fundação" />
                        <TableCellPreview
                          value={
                            formData.barragemPrincipal.tipoFundacao
                              ? cleanOptionScore(formData.barragemPrincipal.tipoFundacao)
                              : 'Pendente'
                          }
                        />
                        <TableCellPreview
                          value={cri.scoreCt4 !== null ? cri.scoreCt4 : 'Pendente'}
                          align="center"
                        />
                      </tr>
                      <tr>
                        <TableCellPreview value="CT5 - Idade da Barragem (CRI)" />
                        <TableCellPreview value={agePreview.descricao} />
                        <TableCellPreview
                          value={cri.scoreCt5 !== null ? cri.scoreCt5 : 'Pendente'}
                          align="center"
                        />
                      </tr>
                      <tr>
                        <TableCellPreview value="CT6 - Vazão de Projeto" />
                        <TableCellPreview
                          value={
                            formData.classificacao.ct6Select
                              ? cleanOptionScore(formData.classificacao.ct6Select)
                              : 'Pendente'
                          }
                        />
                        <TableCellPreview
                          value={cri.scoreCt6 !== null ? cri.scoreCt6 : 'Pendente'}
                          align="center"
                        />
                      </tr>
                      <tr>
                        <TableCellPreview value="TOTAL CT" bold />
                        <TableCellPreview value="" />
                        <TableCellPreview
                          value={cri.totalCT !== null ? cri.totalCT : 'Pendente'}
                          bold
                          align="center"
                        />
                      </tr>
                    </tbody>
                  </table>

                  <p className="text-center text-xs font-bold mb-1 mt-4">
                    Quadro 3. Estado de Conservação (EC)
                  </p>
                  <table className="w-full border-collapse border border-black text-xs mb-2">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="border border-black p-1">Critério</th>
                        <th className="border border-black p-1">Descrição</th>
                        <th className="border border-black p-1">Pontos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        {
                          label: 'EC1 - Confiabilidade das Estruturas Extravasoras',
                          sel: formData.classificacao.ec1Select,
                          score: cri.scoreEc1,
                        },
                        {
                          label: 'EC2 - Confiabilidade das Estruturas de Adução',
                          sel: formData.classificacao.ec2Select,
                          score: cri.scoreEc2,
                        },
                        {
                          label: 'EC3 - Percolação',
                          sel: formData.classificacao.ec3Select,
                          score: cri.scoreEc3,
                        },
                        {
                          label: 'EC4 - Deformações e Recalques',
                          sel: formData.classificacao.ec4Select,
                          score: cri.scoreEc4,
                        },
                        {
                          label: 'EC5 - Deterioração dos Taludes / Proteções',
                          sel: formData.classificacao.ec5Select,
                          score: cri.scoreEc5,
                        },
                      ].map((row) => (
                        <tr key={row.label}>
                          <TableCellPreview value={row.label} />
                          <TableCellPreview value={row.sel ? cleanOptionScore(row.sel) : 'Pendente'} />
                          <TableCellPreview
                            value={row.score !== null ? row.score : 'Pendente'}
                            align="center"
                          />
                        </tr>
                      ))}
                      <tr>
                        <TableCellPreview value="TOTAL EC" bold />
                        <TableCellPreview value="" />
                        <TableCellPreview
                          value={cri.totalEC !== null ? cri.totalEC : 'Pendente'}
                          bold
                          align="center"
                        />
                      </tr>
                    </tbody>
                  </table>

                  <p className="text-center text-xs font-bold mb-1 mt-4">
                    Quadro 4. Plano de Segurança da Barragem (PSB)
                  </p>
                  <table className="w-full border-collapse border border-black text-xs mb-2">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="border border-black p-1">Critério</th>
                        <th className="border border-black p-1">Descrição</th>
                        <th className="border border-black p-1">Pontos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        {
                          label: 'PS1 - Documentação de Projeto',
                          sel: formData.classificacao.ps1Select,
                          score: cri.scorePs1,
                        },
                        {
                          label: 'PS2 - Estrutura Organizacional e Qualificação Técnica',
                          sel: formData.classificacao.ps2Select,
                          score: cri.scorePs2,
                        },
                        {
                          label: 'PS3 - Procedimentos de Inspeção e Monitoramento',
                          sel: formData.classificacao.ps3Select,
                          score: cri.scorePs3,
                        },
                        {
                          label: 'PS4 - Relatórios de Inspeção e Revisão Periódica',
                          sel: formData.classificacao.ps4Select,
                          score: cri.scorePs4,
                        },
                        {
                          label: 'PS5 - Plano de Ação de Emergência (PAE)',
                          sel: formData.classificacao.ps5Select,
                          score: cri.scorePs5,
                        },
                        {
                          label: 'PS6 - Regra Operacional dos Dispositivos de Descarga',
                          sel: formData.classificacao.ps6Select,
                          score: cri.scorePs6,
                        },
                      ].map((row) => (
                        <tr key={row.label}>
                          <TableCellPreview value={row.label} />
                          <TableCellPreview value={row.sel ? cleanOptionScore(row.sel) : 'Pendente'} />
                          <TableCellPreview
                            value={row.score !== null ? row.score : 'Pendente'}
                            align="center"
                          />
                        </tr>
                      ))}
                      <tr>
                        <TableCellPreview value="TOTAL PSB" bold />
                        <TableCellPreview value="" />
                        <TableCellPreview
                          value={cri.totalPS !== null ? cri.totalPS : 'Pendente'}
                          bold
                          align="center"
                        />
                      </tr>
                    </tbody>
                  </table>

                  <p className="text-center text-xs font-bold mb-1 mt-4">
                    Quadro 5.1. Resumo do cálculo dos indicadores da CRI
                  </p>
                  <table className="w-full border-collapse border border-black text-xs mb-2">
                    <tbody>
                      <tr className="bg-gray-100">
                        <td colSpan={2} className="border border-black px-2 py-1 font-bold text-left">
                          FAIXAS DE CLASSIFICAÇÃO POR CATEGORIA DE RISCO (ÁGUA)
                        </td>
                      </tr>
                      <tr className="bg-gray-50">
                        <td className="border border-black px-2 py-1 font-bold text-left">
                          Critério de Avaliação
                        </td>
                        <td className="border border-black px-2 py-1 font-bold text-left">
                          Classe de Categoria de Risco
                        </td>
                      </tr>
                      <tr className={cri.risco === RiscoEnum.ALTO ? 'bg-amber-100' : ''}>
                        <td className="border border-black px-2 py-1">
                          Se algum indicador de risco resultar em ALTO
                        </td>
                        <td className="border border-black px-2 py-1">ALTA</td>
                      </tr>
                      <tr className={cri.risco === RiscoEnum.MEDIO ? 'bg-amber-100' : ''}>
                        <td className="border border-black px-2 py-1">
                          Se NENHUM indicador de risco resultar em ALTO, e algum resultar em MÉDIO
                        </td>
                        <td className="border border-black px-2 py-1">MÉDIA</td>
                      </tr>
                      <tr className={cri.risco === RiscoEnum.BAIXO ? 'bg-amber-100' : ''}>
                        <td className="border border-black px-2 py-1">
                          Se todos os indicadores de risco resultarem em BAIXO
                        </td>
                        <td className="border border-black px-2 py-1">BAIXA</td>
                      </tr>
                      <tr className="bg-gray-100">
                        <td colSpan={2} className="border border-black px-2 py-1 font-bold text-center">
                          {cri.risco ? cri.risco.toUpperCase() : 'PENDENTE'}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <p className="text-center text-xs font-bold mb-1 mt-4">
                    Quadro 5.2. INDICADOR DE RISCO GERAL
                  </p>
                  <table className="w-full border-collapse border border-black text-xs mb-2">
                    <tbody>
                      <tr className={cri.riskGeral === RiscoEnum.ALTO ? 'bg-amber-100' : ''}>
                        <td className="border border-black px-2 py-1">CT + EC + PSB &gt;= 65</td>
                        <td className="border border-black px-2 py-1">ALTO</td>
                      </tr>
                      <tr className={cri.riskGeral === RiscoEnum.MEDIO ? 'bg-amber-100' : ''}>
                        <td className="border border-black px-2 py-1">35 &lt; CT + EC + PSB &lt; 65</td>
                        <td className="border border-black px-2 py-1">MÉDIO</td>
                      </tr>
                      <tr className={cri.riskGeral === RiscoEnum.BAIXO ? 'bg-amber-100' : ''}>
                        <td className="border border-black px-2 py-1">CT + EC + PSB &lt;= 35</td>
                        <td className="border border-black px-2 py-1">BAIXO</td>
                      </tr>
                      <tr className="bg-gray-100">
                        <td colSpan={2} className="border border-black px-2 py-1 font-bold text-center">
                          {cri.riskGeral ? cri.riskGeral.toUpperCase() : 'PENDENTE'}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <p className="text-center text-xs font-bold mb-1 mt-4">
                    Quadro 5.3. INDICADOR DE RISCO POR PERCOLAÇÃO / CONSERVAÇÃO
                  </p>
                  <table className="w-full border-collapse border border-black text-xs mb-2">
                    <tbody>
                      <tr className={cri.riskPercolacao === RiscoEnum.ALTO ? 'bg-amber-100' : ''}>
                        <td className="border border-black px-2 py-1">
                          EC3 = 5 ou EC4 = 5 ou EC5 = 5 ou (EC3 + EC4 + EC5) &gt; 10
                        </td>
                        <td className="border border-black px-2 py-1">ALTO</td>
                      </tr>
                      <tr className={cri.riskPercolacao === RiscoEnum.MEDIO ? 'bg-amber-100' : ''}>
                        <td className="border border-black px-2 py-1">
                          7 &lt; (EC3 + EC4 + EC5) &lt;= 10
                        </td>
                        <td className="border border-black px-2 py-1">MÉDIO</td>
                      </tr>
                      <tr className={cri.riskPercolacao === RiscoEnum.BAIXO ? 'bg-amber-100' : ''}>
                        <td className="border border-black px-2 py-1">(EC3 + EC4 + EC5) &lt;= 7</td>
                        <td className="border border-black px-2 py-1">BAIXO</td>
                      </tr>
                      <tr className="bg-gray-100">
                        <td colSpan={2} className="border border-black px-2 py-1 font-bold text-center">
                          {cri.riskPercolacao ? cri.riskPercolacao.toUpperCase() : 'PENDENTE'}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <p className="text-center text-xs font-bold mb-1 mt-4">
                    Quadro 5.4. INDICADOR DE RISCO POR GALGAMENTO
                  </p>
                  <table className="w-full border-collapse border border-black text-xs mb-2">
                    <tbody>
                      <tr className={cri.riskGalgamento === RiscoEnum.ALTO ? 'bg-amber-100' : ''}>
                        <td className="border border-black px-2 py-1">
                          (CT6 + EC1) &gt; 7 ou EC1 = 5
                        </td>
                        <td className="border border-black px-2 py-1">ALTO</td>
                      </tr>
                      <tr className={cri.riskGalgamento === RiscoEnum.MEDIO ? 'bg-amber-100' : ''}>
                        <td className="border border-black px-2 py-1">4 &lt; (CT6 + EC1) &lt;= 7</td>
                        <td className="border border-black px-2 py-1">MÉDIO</td>
                      </tr>
                      <tr className={cri.riskGalgamento === RiscoEnum.BAIXO ? 'bg-amber-100' : ''}>
                        <td className="border border-black px-2 py-1">(CT6 + EC1) &lt;= 4</td>
                        <td className="border border-black px-2 py-1">BAIXO</td>
                      </tr>
                      <tr className="bg-gray-100">
                        <td colSpan={2} className="border border-black px-2 py-1 font-bold text-center">
                          {cri.riskGalgamento ? cri.riskGalgamento.toUpperCase() : 'PENDENTE'}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <p className="text-center text-xs font-bold mb-1 mt-4">
                    Quadro 5.5. INDICADOR DE RISCO GERENCIAL
                  </p>
                  <table className="w-full border-collapse border border-black text-xs mb-2">
                    <tbody>
                      <tr className={cri.riskGerencial === RiscoEnum.ALTO ? 'bg-amber-100' : ''}>
                        <td className="border border-black px-2 py-1">PSB &gt;= 24</td>
                        <td className="border border-black px-2 py-1">ALTO</td>
                      </tr>
                      <tr className={cri.riskGerencial === RiscoEnum.MEDIO ? 'bg-amber-100' : ''}>
                        <td className="border border-black px-2 py-1">13 &lt; PSB &lt; 24</td>
                        <td className="border border-black px-2 py-1">MÉDIO</td>
                      </tr>
                      <tr className={cri.riskGerencial === RiscoEnum.BAIXO ? 'bg-amber-100' : ''}>
                        <td className="border border-black px-2 py-1">PSB &lt;= 13</td>
                        <td className="border border-black px-2 py-1">BAIXO</td>
                      </tr>
                      <tr className="bg-gray-100">
                        <td colSpan={2} className="border border-black px-2 py-1 font-bold text-center">
                          {cri.riskGerencial ? cri.riskGerencial.toUpperCase() : 'PENDENTE'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </>
              )}

              {/* Quadro 6 Resumo (respeita Pré-classificação sem CRI e sem Classe A-D) */}
              <p className="text-center text-xs font-bold mb-1 mt-4">
                QUADRO 6. RESUMO DO QUADRO DE CLASSIFICAÇÃO
              </p>
              <table className="w-full border-collapse border border-black text-xs mb-4">
                <tbody>
                  <tr className="bg-gray-100">
                    <td colSpan={2} className="border border-black px-2 py-1 font-bold text-center uppercase">
                      RESUMO DO QUADRO DE CLASSIFICAÇÃO
                    </td>
                  </tr>
                  <tr>
                    <TableCellPreview value="Tipo de Classificação:" bold />
                    <TableCellPreview value={classif} />
                  </tr>
                  <tr>
                    <TableCellPreview value="Nome do Curso D’água:" bold />
                    <TableCellPreview value={formData.cursoAgua} />
                  </tr>
                  <tr>
                    <TableCellPreview value="Sub-bacia/Bacia:" bold />
                    <TableCellPreview value={formData.subBacia} />
                  </tr>
                  <tr>
                    <TableCellPreview value="UPG:" bold />
                    <TableCellPreview value={formData.upg || ''} />
                  </tr>
                  <tr>
                    <TableCellPreview value="Município/UF:" bold />
                    <TableCellPreview value={formData.municipio ? `${formData.municipio}/MT` : ''} />
                  </tr>
                  <tr>
                    <TableCellPreview value="Nome do Empreendedor:" bold />
                    <TableCellPreview value={formData.razaoSocial} />
                  </tr>
                  <tr>
                    <TableCellPreview value="Localização do empreendimento:" bold />
                    <TableCellPreview value={formData.localizacao} />
                  </tr>
                  <tr>
                    <TableCellPreview value="Número do Processo:" bold />
                    <TableCellPreview value={formData.protocolo} />
                  </tr>
                  <tr>
                    <TableCellPreview value="Número do SNISB:" bold />
                    <TableCellPreview value={formData.barragemPrincipal.snisb} />
                  </tr>
                  <tr>
                    <TableCellPreview value="DANO POTENCIAL ASSOCIADO:" bold />
                    <TableCellPreview
                      value={
                        derived.dpa.dpaClass ? derived.dpa.dpaClass.toUpperCase() : 'PENDENTE'
                      }
                    />
                  </tr>
                  {!derived.isPreClassificacao && derived.pnsb.status !== 'nao_enquadrada' && (
                    <tr>
                      <TableCellPreview value="CATEGORIA DE RISCO:" bold />
                      <TableCellPreview
                        value={cri?.risco ? cri.risco.toUpperCase() : 'PENDENTE'}
                      />
                    </tr>
                  )}
                  <tr>
                    <TableCellPreview value="Classificação quanto ao volume:" bold />
                    <TableCellPreview value={volNomenclature} />
                  </tr>
                  <tr>
                    <TableCellPreview value="Coordenadas:" bold />
                    <TableCellPreview
                      value={`${
                        normalizeCoordinateToGMS(formData.barragemPrincipal.lat) ||
                        formData.barragemPrincipal.lat
                      } - ${
                        normalizeCoordinateToGMS(formData.barragemPrincipal.long) ||
                        formData.barragemPrincipal.long
                      }`}
                    />
                  </tr>
                  <tr>
                    <TableCellPreview value="Altura:" bold />
                    <TableCellPreview value={formData.barragemPrincipal.alturaMaxima} />
                  </tr>
                  <tr>
                    <TableCellPreview value="Tipo de Barragem:" bold />
                    <TableCellPreview value={barragem} />
                  </tr>
                  <tr>
                    <TableCellPreview value="Volume armazenado (NMM) (hm³):" bold />
                    <TableCellPreview value={formData.barragemPrincipal.volumeNMM} />
                  </tr>
                  <tr>
                    <TableCellPreview value="Situação do empreendimento:" bold />
                    <TableCellPreview value={situacao} />
                  </tr>
                  <tr>
                    <TableCellPreview value="Resultado:" bold />
                    <TableCellPreview value={derived.resultado.label} bold />
                  </tr>
                </tbody>
              </table>

              <h2 className="font-bold mb-2 uppercase mt-8">5. PARECER TÉCNICO CONCLUSIVO</h2>
              <p className="text-justify whitespace-pre-wrap">{formData.parecer_final}</p>

              {quadro7Rows.length > 0 && (
                <div className="mt-6">
                  <h3 className="font-bold mb-2 uppercase">
                    5.1 CONDICIONANTES E CONSEQUÊNCIAS REGULATÓRIAS
                  </h3>
                  <p className="mb-4 text-justify">
                    As consequências regulatórias da {classif} são definidas pela legislação vigente e estão discriminadas no Quadro 7 abaixo:
                  </p>
                  <p className="text-center text-xs font-bold mb-1">
                    Quadro 7. Consequências regulatórias.
                  </p>
                  <table className="w-full border-collapse border border-black text-xs mb-6">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-black p-1 text-left w-1/2">
                          Atividades a serem executadas pelo empreendedor:
                        </th>
                        <th className="border border-black p-1 text-left w-1/2">
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
                              className={`border border-black p-1 ${
                                idx === 0 ? 'font-bold bg-gray-100' : ''
                              }`}
                            >
                              {row.col1}
                            </td>
                          ) : (
                            <>
                              <td className="border border-black p-1">{row.col1}</td>
                              <td className="border border-black p-1">{row.col2}</td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-12 text-center">
                <p>________________________________________________</p>
                <p className="font-bold">{analistaNome || 'Analista Responsável'}</p>
                <p>Analista de Meio Ambiente - SEMA/MT</p>
                <p className="mt-2">Cuiabá/MT, {new Date().toLocaleDateString('pt-BR')}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
