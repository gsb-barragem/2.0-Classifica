import React, { useContext, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Database, Loader2, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import {
  OPS_FINALIDADE,
  OPS_MUNICIPIOS,
  OPS_SITUACAO,
} from '../../constants';
import { BarragemMaster, EmpreendedorMaster, ParecerData } from '../../types';
import { EcosystemSelector, ResponsavelTecnicoSearchItem } from '../EcosystemSelector';
import { AuthContext } from '../../src/contexts/AuthContext';
import { saveBarragemMaster, saveEmpreendedorMaster } from '../../src/services/administraService';
import { getUpgOptionsForMunicipality } from '../../src/utils/opinionCalculations';
import { normalizeCoordinateToGMS } from '../../src/utils/coordinateUtils';

interface Topic2PedidoEmpreendedorProps {
  formData: ParecerData;
  isOpen: boolean;
  readOnly?: boolean;
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
  onRemoveRT,
  onToggleSection,
  onInputChange,
  onBatchUpdate,
  maskCpfCnpj,
}) => {
  const { currentUser } = useContext(AuthContext);
  const [savingToAdministra, setSavingToAdministra] = useState(false);
  const [registeringEmpreendedor, setRegisteringEmpreendedor] = useState(false);

  const handleRegisterEmpreendedor = async () => {
    if (!currentUser) {
      toast.error('Usuário não autenticado para cadastrar no Administra Barragens.');
      return;
    }
    if (!formData.razaoSocial.trim()) {
      toast.warning('Informe o nome ou razão social do empreendedor.');
      return;
    }

    const digits = (formData.cpfCnpj || '').replace(/\D/g, '');
    if (digits.length > 0 && digits.length !== 11 && digits.length !== 14) {
      toast.warning('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido, ou deixe o campo em branco caso não disponível.');
      return;
    }

    setRegisteringEmpreendedor(true);
    try {
      const empRes = await saveEmpreendedorMaster(
        {
          id: formData.empreendedorId,
          cpf_cnpj: digits || undefined,
          razao_social: formData.razaoSocial,
          endereco: formData.localizacao,
          municipio: formData.municipio,
          num_car: formData.numCAR,
          sistema_origem: formData.sistemaOrigem,
        },
        currentUser
      );
      if (empRes.success && empRes.data?.id) {
        onBatchUpdate((prev) => ({
          ...prev,
          empreendedorId: empRes.data!.id,
          sistemaOrigem: empRes.data!.sistema_origem || prev.sistemaOrigem || 'CLASSIFICA_CSB',
        }));
        toast.success(`Empreendedor "${empRes.data.razao_social}" cadastrado na base do Administra Barragens.`);
      } else {
        toast.error(empRes.message || 'Não foi possível cadastrar o empreendedor na base de dados.');
      }
    } finally {
      setRegisteringEmpreendedor(false);
    }
  };

  const handleSaveToAdministra = async () => {
    if (!currentUser) {
      toast.error('Usuário não autenticado para salvar no Administra Barragens.');
      return;
    }

    const digits = (formData.cpfCnpj || '').replace(/\D/g, '');
    if (!formData.razaoSocial.trim() && !formData.barragemPrincipal?.nome?.trim()) {
      toast.warning('Preencha ao menos o Empreendedor ou a Barragem para salvar no Administra.');
      return;
    }

    setSavingToAdministra(true);
    try {
      let nextEmpId = formData.empreendedorId;
      let nextBarId = formData.barragemId;
      let savedAny = false;

      if (formData.razaoSocial.trim()) {
        const empRes = await saveEmpreendedorMaster(
          {
            id: formData.empreendedorId,
            cpf_cnpj: digits || undefined,
            razao_social: formData.razaoSocial,
            endereco: formData.localizacao,
            municipio: formData.municipio,
            num_car: formData.numCAR,
            sistema_origem: formData.sistemaOrigem,
          },
          currentUser
        );
        if (empRes.notConfigured) {
          toast.info(empRes.message || 'Escrita direta no Administra não configurada neste ambiente.');
          return;
        }
        if (empRes.success && empRes.data?.id) {
          nextEmpId = empRes.data.id;
          savedAny = true;
        } else if (empRes.message) {
          toast.warning(empRes.message);
        }
      }

      if (formData.barragemPrincipal?.nome && formData.municipio) {
        const barRes = await saveBarragemMaster(
          {
            id: formData.barragemId,
            empreendedor_id: nextEmpId || undefined,
            snisb: formData.barragemPrincipal.snisb || undefined,
            nome: formData.barragemPrincipal.nome,
            municipio: formData.municipio,
            upg: formData.upg,
            sub_bacia: formData.subBacia,
            curso_agua: formData.cursoAgua,
            localizacao: formData.localizacao,
            lat_gms: normalizeCoordinateToGMS(formData.barragemPrincipal.lat) || formData.barragemPrincipal.lat,
            long_gms: normalizeCoordinateToGMS(formData.barragemPrincipal.long) || formData.barragemPrincipal.long,
            altura_maxima: formData.barragemPrincipal.alturaMaxima,
            comprimento_coroamento: formData.barragemPrincipal.comprimentoCoroamento,
            largura_coroamento: formData.barragemPrincipal.larguraCoroamento,
            volume_nmo: formData.barragemPrincipal.volumeNMO,
            volume_nmm: formData.barragemPrincipal.volumeNMM,
            tipo_estrutural: formData.barragemPrincipal.tipoEstrutural,
            tipo_fundacao: formData.barragemPrincipal.tipoFundacao,
            finalidade: formData.finalidade,
            situacao: formData.situacaoEmpreendimento,
            sistema_origem: formData.sistemaOrigem,
          },
          currentUser
        );
        if (barRes.notConfigured) {
          toast.info(barRes.message || 'Escrita direta no Administra não configurada neste ambiente.');
          return;
        }
        if (barRes.success && barRes.data?.id) {
          nextBarId = barRes.data.id;
          savedAny = true;
        } else if (barRes.message) {
          toast.warning(barRes.message);
        }
      }

      if (nextEmpId !== formData.empreendedorId || nextBarId !== formData.barragemId) {
        onBatchUpdate((prev) => ({
          ...prev,
          empreendedorId: nextEmpId,
          barragemId: nextBarId,
        }));
      }

      if (savedAny) {
        toast.success('Dados sincronizados com o Administra Barragens.');
      }
    } finally {
      setSavingToAdministra(false);
    }
  };

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
              selectedBarragemNome={formData.barragemPrincipal?.nome}
              cpfCnpjFallback={formData.cpfCnpj}
              snisbFallback={formData.barragemPrincipal?.snisb}
              linkedRTs={formData.responsaveisTecnicos}
              onRemoveRT={onRemoveRT}
              onRegisterLinkedRT={(entryId, rtId, art) => {
                onBatchUpdate((prev) => ({
                  ...prev,
                  responsaveisTecnicos: prev.responsaveisTecnicos.map((item) =>
                    item.id === entryId
                      ? {
                          ...item,
                          rtId,
                          art: art || item.art,
                          registeredInAdministra: true,
                          sistemaOrigem: 'CLASSIFICA_CSB',
                        }
                      : item
                  ),
                }));
                toast.success('Responsável Técnico cadastrado na base de dados do Administra.');
              }}
              readOnly={readOnly}
              savingToAdministra={savingToAdministra}
              onSaveToAdministra={handleSaveToAdministra}
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
                  razaoSocial: prev.razaoSocial || bar.empreendedor_nome || '',
                  cpfCnpj:
                    prev.cpfCnpj ||
                    (bar.empreendedor_cpf_cnpj ? maskCpfCnpj(bar.empreendedor_cpf_cnpj) : ''),
                  localizacao: prev.localizacao || bar.localizacao || '',
                  municipio: bar.municipio || prev.municipio,
                  upg: bar.upg || prev.upg,
                  subBacia: bar.sub_bacia || prev.subBacia,
                  cursoAgua: bar.curso_agua || prev.cursoAgua,
                  finalidade: prev.finalidade || bar.finalidade || '',
                  situacaoEmpreendimento: prev.situacaoEmpreendimento || bar.situacao || '',
                  barragemPrincipal: {
                    ...prev.barragemPrincipal,
                    barragemId: bar.id,
                    sistemaOrigem: bar.sistema_origem || 'ADMINISTRA_BARRAGENS',
                    nome: bar.nome || prev.barragemPrincipal.nome,
                    snisb: bar.snisb || prev.barragemPrincipal.snisb,
                    lat:
                      normalizeCoordinateToGMS(bar.lat_gms, bar.lat_decimal) ||
                      prev.barragemPrincipal.lat,
                    long:
                      normalizeCoordinateToGMS(bar.long_gms, bar.long_decimal) ||
                      prev.barragemPrincipal.long,
                    alturaMaxima: bar.altura_maxima || prev.barragemPrincipal.alturaMaxima,
                    comprimentoCoroamento:
                      bar.comprimento_coroamento || prev.barragemPrincipal.comprimentoCoroamento,
                    larguraCoroamento:
                      bar.largura_coroamento || prev.barragemPrincipal.larguraCoroamento,
                    volumeNMO: bar.volume_nmo || prev.barragemPrincipal.volumeNMO,
                    volumeNMM: bar.volume_nmm || prev.barragemPrincipal.volumeNMM,
                    tipoEstrutural: bar.tipo_estrutural || prev.barragemPrincipal.tipoEstrutural,
                    tipoFundacao: bar.tipo_fundacao || prev.barragemPrincipal.tipoFundacao,
                  },
                }));
              }}
              onSelectRT={(rt: ResponsavelTecnicoSearchItem) => {
                const art = (rt.art || '').trim();
                if (!art) {
                  toast.warning('Selecione uma ART existente ou cadastre uma nova ART para vincular este RT.');
                  return;
                }
                const alreadyExists = formData.responsaveisTecnicos.some(
                  (item) =>
                    item.nome.trim().toLowerCase() === rt.nome.trim().toLowerCase() &&
                    item.art.trim().toUpperCase() === art.toUpperCase()
                );
                if (!alreadyExists) {
                  onBatchUpdate((prev) => {
                    const existsInPrev = prev.responsaveisTecnicos.some(
                      (item) =>
                        item.nome.trim().toLowerCase() === rt.nome.trim().toLowerCase() &&
                        item.art.trim().toUpperCase() === art.toUpperCase()
                    );
                    if (existsInPrev) return prev;
                    return {
                      ...prev,
                      responsaveisTecnicos: [
                        ...prev.responsaveisTecnicos,
                        {
                          id: `${rt.id || Date.now().toString()}_${art}`,
                          nome: rt.nome,
                          art,
                          rtId: rt.id,
                          registroProfissional: rt.registro_profissional || undefined,
                          cpf: rt.cpf || undefined,
                          registeredInAdministra: true,
                          sistemaOrigem: rt.sistema_origem || 'ADMINISTRA_BARRAGENS',
                        },
                      ],
                    };
                  });
                  toast.success(`RT "${rt.nome}" (ART ${art}) vinculado ao parecer.`);
                } else {
                  toast.info(`RT "${rt.nome}" com ART ${art} já está vinculado ao parecer.`);
                }
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
                  {!readOnly && formData.empreendedorId && (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 text-xs text-emerald-800">
                      <span className="inline-flex items-center gap-1.5 font-semibold">
                        <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                        Empreendedor vinculado à base central do Administra.
                      </span>
                      <button
                        type="button"
                        onClick={() => onBatchUpdate((prev) => ({ ...prev, empreendedorId: undefined }))}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 hover:text-red-600 px-2 py-0.5 rounded bg-white border border-slate-200"
                      >
                        <Unlink size={12} /> Desvincular
                      </button>
                    </div>
                  )}
                  {!readOnly && !formData.empreendedorId && formData.razaoSocial.trim() && (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-900">
                      <span>Empreendedor preenchido manualmente sem vínculo no Administra.</span>
                      <button
                        type="button"
                        onClick={() => void handleRegisterEmpreendedor()}
                        disabled={registeringEmpreendedor}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm disabled:opacity-60"
                      >
                        {registeringEmpreendedor ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Database size={13} />
                        )}
                        Cadastrar Empreendedor na base de dados
                      </button>
                    </div>
                  )}
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
          </div>
        )}
      </div>
    </section>
  );
};
