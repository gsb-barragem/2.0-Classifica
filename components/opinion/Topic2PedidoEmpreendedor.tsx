import React from 'react';
import { ChevronDown, ChevronUp, Plus, UserCheck, X } from 'lucide-react';
import {
  OPS_FINALIDADE,
  OPS_MUNICIPIOS,
  OPS_RESPONSAVEL_TECNICO,
  OPS_SITUACAO,
} from '../../constants';
import { BarragemMaster, EmpreendedorMaster, ParecerData } from '../../types';
import { EcosystemSelector } from '../EcosystemSelector';
import { getUpgOptionsForMunicipality } from '../../src/utils/opinionCalculations';

interface Topic2PedidoEmpreendedorProps {
  formData: ParecerData;
  isOpen: boolean;
  readOnly?: boolean;
  newRT: { selectedName: string; customName: string; art: string };
  onSetNewRT: React.Dispatch<
    React.SetStateAction<{ selectedName: string; customName: string; art: string }>
  >;
  onAddRT: () => void;
  onRemoveRT: (id: string) => void;
  onToggleSection: () => void;
  onInputChange: (field: keyof ParecerData, value: any) => void;
  onBatchUpdate: (updater: (prev: ParecerData) => ParecerData) => void;
  maskCpfCnpj: (value: string) => string;
}

export const Topic2PedidoEmpreendedor: React.FC<Topic2PedidoEmpreendedorProps> = ({
  formData,
  isOpen,
  readOnly = false,
  newRT,
  onSetNewRT,
  onAddRT,
  onRemoveRT,
  onToggleSection,
  onInputChange,
  onBatchUpdate,
  maskCpfCnpj,
}) => {
  const upgOptions = formData.municipio
    ? getUpgOptionsForMunicipality(formData.municipio)
    : [];
  const hasMultipleUpgs = upgOptions.length > 1;
  const currentUpgNotInOptions =
    Boolean(formData.upg) &&
    formData.upg !== 'OUTRA' &&
    !upgOptions.includes(formData.upg || '');
  const situacaoFilledInTopic1 =
    Boolean(formData.situacaoEmpreendimento) &&
    (formData.situacaoEmpreendimento !== 'OUTRO' ||
      Boolean(formData.situacaoEmpreendimentoOutro?.trim()));

  const digitsDoc = (formData.cpfCnpj || '').replace(/\D/g, '');

  return (
    <section id="pedido" className="scroll-mt-56">
      <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
        <button
          type="button"
          onClick={onToggleSection}
          className="w-full flex items-center justify-between mb-6 border-b border-slate-100 pb-4 group"
        >
          <div className="flex items-center gap-2 text-left">
            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-sm shrink-0">
              2
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 group-hover:text-emerald-600 transition-colors">
                INFORMAÇÕES DO EMPREENDEDOR E DO PEDIDO
              </h2>
              <p className="text-xs text-slate-500">
                Seleção integrada, tabela cadastral e responsáveis técnicos com ART
              </p>
            </div>
          </div>
          <div className="text-slate-400 group-hover:text-emerald-600 transition-colors">
            {isOpen ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
          </div>
        </button>

        {isOpen && (
          <div className="space-y-6">
            {/* Preservação integral do seletor do Ecossistema */}
            <EcosystemSelector
              selectedEmpreendedorId={formData.empreendedorId}
              selectedBarragemId={formData.barragemId}
              cpfCnpjFallback={formData.cpfCnpj}
              snisbFallback={formData.barragemPrincipal?.snisb}
              readOnly={readOnly}
              onSelectEmpreendedor={(emp: EmpreendedorMaster) => {
                onBatchUpdate((prev) => ({
                  ...prev,
                  empreendedorId: emp.id,
                  razaoSocial: emp.razao_social || prev.razaoSocial,
                  cpfCnpj: emp.cpf_cnpj ? maskCpfCnpj(emp.cpf_cnpj) : prev.cpfCnpj,
                  localizacao: emp.endereco || prev.localizacao,
                  municipio: emp.municipio || prev.municipio,
                  numCAR: emp.num_car || prev.numCAR,
                }));
              }}
              onSelectBarragem={(bar: BarragemMaster) => {
                onBatchUpdate((prev) => ({
                  ...prev,
                  barragemId: bar.id,
                  empreendedorId: bar.empreendedor_id || prev.empreendedorId,
                  municipio: bar.municipio || prev.municipio,
                  upg: bar.upg || prev.upg,
                  subBacia: bar.sub_bacia || prev.subBacia,
                  cursoAgua: bar.curso_agua || prev.cursoAgua,
                  barragemPrincipal: {
                    ...prev.barragemPrincipal,
                    nome: bar.nome || prev.barragemPrincipal.nome,
                    snisb: bar.snisb || prev.barragemPrincipal.snisb,
                    lat: bar.lat_gms || prev.barragemPrincipal.lat,
                    long: bar.long_gms || prev.barragemPrincipal.long,
                    alturaMaxima: bar.altura_maxima || prev.barragemPrincipal.alturaMaxima,
                    comprimentoCoroamento:
                      bar.comprimento_coroamento || prev.barragemPrincipal.comprimentoCoroamento,
                    larguraCoroamento:
                      bar.largura_coroamento || prev.barragemPrincipal.larguraCoroamento,
                    volumeNMO: bar.volume_nmo || prev.barragemPrincipal.volumeNMO,
                    volumeNMM: bar.volume_nmm || prev.barragemPrincipal.volumeNMM,
                  },
                }));
              }}
            />

            {/* Tabela 1 */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <h3 className="font-bold text-slate-700 text-sm mb-4 border-b border-slate-200 pb-2">
                Tabela 1. Informações do empreendedor e empreendimento
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-1">
                    Empreendedor (Razão Social / Nome)
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                    placeholder="Razão Social ou Nome completo do Empreendedor"
                    value={formData.razaoSocial}
                    onChange={(e) => onInputChange('razaoSocial', e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">
                    {digitsDoc.length === 0 ? 'CPF / CNPJ' : digitsDoc.length > 11 ? 'CNPJ' : 'CPF'}
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                    placeholder="000.000.000-00 / 00.000.000/0000-00"
                    value={formData.cpfCnpj}
                    onChange={(e) => onInputChange('cpfCnpj', maskCpfCnpj(e.target.value))}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">
                    Nº CAR (quando informado)
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                    placeholder="MT-..."
                    value={formData.numCAR}
                    onChange={(e) => onInputChange('numCAR', e.target.value)}
                  />
                </div>

                <div className="col-span-1 md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-1">
                    Endereço / Localização do empreendimento
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                    placeholder="Endereço / Localização"
                    value={formData.localizacao}
                    onChange={(e) => onInputChange('localizacao', e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Município/UF</label>
                  <select
                    className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                    value={formData.municipio}
                    onChange={(e) => onInputChange('municipio', e.target.value)}
                  >
                    <option value="">Selecione...</option>
                    {formData.municipio && !OPS_MUNICIPIOS.includes(formData.municipio) && (
                      <option value={formData.municipio}>{formData.municipio}</option>
                    )}
                    {OPS_MUNICIPIOS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">UPG</label>
                  <select
                    className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                    value={formData.upg || ''}
                    onChange={(e) => onInputChange('upg', e.target.value)}
                  >
                    <option value="">Selecione a UPG...</option>
                    {currentUpgNotInOptions && (
                      <option value={formData.upg}>{formData.upg}</option>
                    )}
                    {upgOptions.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                    <option value="OUTRA">OUTRA</option>
                  </select>
                  {hasMultipleUpgs && (
                    <p className="text-[11px] text-amber-700 mt-1">
                      Este município possui {upgOptions.length} UPGs possíveis. Confirme a seleção adequada sem apagar a UPG já informada.
                    </p>
                  )}
                  {currentUpgNotInOptions && formData.municipio && upgOptions.length > 0 && (
                    <p className="text-[11px] text-amber-700 mt-1">
                      A UPG preservada ({formData.upg}) difere das opções mapeadas para {formData.municipio}; altere apenas se necessário.
                    </p>
                  )}
                </div>

                <div className="col-span-1 md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-1">
                    Finalidade do barramento
                  </label>
                  <select
                    className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                    value={formData.finalidade}
                    onChange={(e) => onInputChange('finalidade', e.target.value)}
                  >
                    <option value="">Selecione...</option>
                    {OPS_FINALIDADE.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                  {formData.finalidade === 'OUTRO' && (
                    <input
                      type="text"
                      className="mt-2 w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                      placeholder="Digite a finalidade complementar..."
                      value={formData.finalidadeOutro}
                      onChange={(e) => onInputChange('finalidadeOutro', e.target.value)}
                    />
                  )}
                </div>

                {!situacaoFilledInTopic1 ? (
                  <div className="col-span-1 md:col-span-2 bg-amber-50/70 border border-amber-200 rounded-lg p-3">
                    <label className="block text-xs font-bold text-amber-900 mb-1">
                      Situação do empreendimento (não preenchida no Tópico 1)
                    </label>
                    <select
                      className="w-full rounded-lg border-slate-400 bg-white p-2 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                      value={formData.situacaoEmpreendimento}
                      onChange={(e) => onInputChange('situacaoEmpreendimento', e.target.value)}
                    >
                      <option value="">Selecione...</option>
                      {OPS_SITUACAO.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    {formData.situacaoEmpreendimento === 'OUTRO' && (
                      <input
                        type="text"
                        className="mt-2 w-full rounded-lg border-slate-400 bg-white p-2 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                        placeholder="Digite a situação complementar..."
                        value={formData.situacaoEmpreendimentoOutro}
                        onChange={(e) =>
                          onInputChange('situacaoEmpreendimentoOutro', e.target.value)
                        }
                      />
                    )}
                  </div>
                ) : (
                  <div className="col-span-1 md:col-span-2 bg-white border border-slate-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-500">
                      Situação do empreendimento (definida no Tópico 1):
                    </span>
                    <span className="text-xs font-semibold text-slate-800 bg-slate-100 px-2.5 py-1 rounded">
                      {formData.situacaoEmpreendimento === 'OUTRO'
                        ? formData.situacaoEmpreendimentoOutro
                        : formData.situacaoEmpreendimento}
                    </span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">
                    Nome do Curso d’água barrado
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                    value={formData.cursoAgua}
                    onChange={(e) => onInputChange('cursoAgua', e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">
                    Propriedades Limítrofes da barragem
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                    value={formData.propriedadesLimites}
                    onChange={(e) => onInputChange('propriedadesLimites', e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">
                    Sub-bacia / Bacia
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                    value={formData.subBacia}
                    onChange={(e) => onInputChange('subBacia', e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">
                    Área da bacia de contribuição (km²)*
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                    value={formData.areaBacia}
                    onChange={(e) => onInputChange('areaBacia', e.target.value)}
                  />
                </div>

                <div className="col-span-1 md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-1">
                    Índice de pluviosidade**
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                    value={formData.indicePluviosidade}
                    onChange={(e) => onInputChange('indicePluviosidade', e.target.value)}
                  />
                </div>

                <div className="col-span-1 md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-1">
                    Legenda / Nota de Rodapé da Tabela Cadastral
                  </label>
                  <textarea
                    rows={2}
                    className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                    value={formData.legendaTabela1}
                    onChange={(e) => onInputChange('legendaTabela1', e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Responsáveis Técnicos */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <h3 className="font-bold text-slate-700 text-sm mb-3">
                Responsável(is) Técnico(s)
              </h3>
              {!readOnly && (
                <div className="flex flex-col gap-3 mb-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Nome</label>
                      <input
                        list="rt-list"
                        value={newRT.selectedName}
                        onChange={(e) =>
                          onSetNewRT((prev) => ({ ...prev, selectedName: e.target.value }))
                        }
                        className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                        placeholder="Selecione ou digite (use OUTRO para manual)..."
                      />
                      <datalist id="rt-list">
                        {OPS_RESPONSAVEL_TECNICO.map((name) => (
                          <option key={name} value={name} />
                        ))}
                      </datalist>
                      {newRT.selectedName === 'OUTRO' && (
                        <input
                          type="text"
                          value={newRT.customName}
                          onChange={(e) =>
                            onSetNewRT((prev) => ({ ...prev, customName: e.target.value }))
                          }
                          placeholder="Digite o nome completo do RT..."
                          className="mt-2 w-full rounded-lg border-slate-400 bg-white p-2 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                        />
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">
                        Número da ART
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={newRT.art}
                        onChange={(e) => onSetNewRT((prev) => ({ ...prev, art: e.target.value }))}
                        className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                        placeholder="Número da ART"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onAddRT}
                    className="w-full sm:w-auto self-start px-3 py-2 bg-emerald-600 text-white rounded text-sm font-medium hover:bg-emerald-700 flex items-center justify-center gap-1 shadow-sm transition-colors"
                  >
                    <Plus size={16} /> Adicionar RT
                  </button>
                </div>
              )}

              {formData.responsaveisTecnicos.length > 0 ? (
                <div className="mt-2">
                  <h4 className="text-xs font-bold text-emerald-700 uppercase mb-2 flex items-center gap-2">
                    <UserCheck size={14} /> Profissionais Adicionados ({formData.responsaveisTecnicos.length}):
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {formData.responsaveisTecnicos.map((rt) => (
                      <div
                        key={rt.id}
                        className="flex justify-between items-start bg-white p-3 border border-emerald-100 rounded-lg shadow-sm"
                      >
                        <div className="flex flex-col overflow-hidden">
                          <span className="font-bold text-slate-700 text-sm truncate" title={rt.nome}>
                            {rt.nome}
                          </span>
                          <span className="text-xs text-slate-500">ART: {rt.art}</span>
                        </div>
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => onRemoveRT(rt.id)}
                            className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded transition-colors"
                            title="Remover Profissional"
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">Nenhum responsável técnico adicionado.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
