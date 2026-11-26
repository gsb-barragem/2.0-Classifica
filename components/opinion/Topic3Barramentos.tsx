import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { CheckCircle2, ChevronDown, ChevronUp, Database, Droplets, Loader2, Plus, Trash2, Unlink } from 'lucide-react';
import { OPS_TIPO_ESTRUTURAL, OPS_TIPO_FUNDACAO } from '../../constants';
import { BarragemMaster, BarramentoData, EmpreendedorMaster, EstruturaHidraulica } from '../../types';
import {
  IDADE_SEM_ENCHIMENTO,
  IDADE_SEM_INFORMACAO,
  OPS_RELACAO_BARRAMENTO_MONTANTE,
  evaluateCt5Age,
  normalizeBarramentoMontanteComplemento,
} from '../../src/utils/opinionCalculations';
import { parseGMS } from '../MTMap';
import {
  GMS_PLACEHOLDER,
  formatGmsInput,
  normalizeCoordinateToGMS,
} from '../../src/utils/coordinateUtils';
import { CLASSIFICA_INTEGRATION_ARCHITECTURE } from '../../src/config/integrationArchitecture';
import {
  AdministraBarragemMontantePicker,
  AdministraEmpreendedorMontantePicker,
} from './AdministraMontantePickers';
import { CondicaoAreaEmpreendedorFieldset } from './Topic2PedidoEmpreendedor';

const MiniMap: React.FC<{ lat: string; long: string }> = ({ lat, long }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    if (!leafletMap.current) {
      leafletMap.current = L.map(mapRef.current, {
        zoomControl: false,
        attributionControl: false,
        dragging: true,
        scrollWheelZoom: false,
      }).setView([-12.9, -56.0], 5);

      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { attribution: 'Esri' }
      ).addTo(leafletMap.current);

      fetch(
        'https://servicodados.ibge.gov.br/api/v3/malhas/estados/51?formato=application/vnd.geo+json&intrarregiao=municipio&qualidade=minima'
      )
        .then((res) => res.json())
        .then((data) => {
          if (leafletMap.current) {
            L.geoJSON(data, {
              style: {
                color: '#ffffff',
                weight: 0.5,
                opacity: 0.3,
                fillColor: 'transparent',
                fillOpacity: 0,
              },
              interactive: false,
            }).addTo(leafletMap.current);
          }
        })
        .catch(() => {});
    }

    const dLat = parseGMS(lat);
    const dLong = parseGMS(long);

    if (!isNaN(dLat) && !isNaN(dLong) && Math.abs(dLat) > 0 && Math.abs(dLong) > 0) {
      const pos: [number, number] = [dLat, dLong];
      if (!markerRef.current) {
        markerRef.current = L.marker(pos).addTo(leafletMap.current);
      } else {
        markerRef.current.setLatLng(pos);
      }
      leafletMap.current.setView(pos, 15);
    } else {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      leafletMap.current.setView([-12.9, -56.0], 5);
    }
  }, [lat, long]);

  return (
    <div className="sm:col-span-2 overflow-hidden rounded-xl border border-slate-300 shadow-inner relative mb-2">
      <div ref={mapRef} className="h-48 w-full z-0" />
      <div className="absolute top-2 right-2 bg-slate-900/60 backdrop-blur-sm text-[9px] text-white px-2 py-1 rounded font-bold uppercase tracking-wider z-10 pointer-events-none">
        Geolocalização do Barramento
      </div>
    </div>
  );
};

interface BarramentoFormProps {
  data: BarramentoData;
  isMain: boolean;
  idx?: number;
  readOnly?: boolean;
  linkedBarragemId?: string;
  mainCarFallback?: string;
  registeringBarragemKey?: string | null;
  onRegisterBarragem?: (isMain: boolean, idx: number, data: BarramentoData) => Promise<void>;
  onUnlinkBarragem?: (isMain: boolean, idx: number) => void;
  onSelectUpstreamBarragem?: (idx: number, bar: BarragemMaster) => void;
  onSelectUpstreamEmpreendedor?: (idx: number, emp: EmpreendedorMaster) => void;
  onClearUpstreamEmpreendedor?: (idx: number) => void;
  updateBarramento: (
    isMain: boolean,
    idx: number,
    field: keyof BarramentoData,
    value: any
  ) => void;
  removeUpstreamDam: (idx: number) => void;
  updateStructure: (
    isMain: boolean,
    barramentoIdx: number,
    structIdx: number,
    field: keyof EstruturaHidraulica,
    value: any
  ) => void;
  addStructure: (isMain: boolean, barramentoIdx: number) => void;
  removeStructure: (isMain: boolean, barramentoIdx: number, structIdx: number) => void;
}

const BarramentoForm: React.FC<BarramentoFormProps> = ({
  data,
  isMain,
  idx = 0,
  readOnly = false,
  linkedBarragemId,
  mainCarFallback,
  registeringBarragemKey,
  onRegisterBarragem,
  onUnlinkBarragem,
  onSelectUpstreamBarragem,
  onSelectUpstreamEmpreendedor,
  onClearUpstreamEmpreendedor,
  updateBarramento,
  removeUpstreamDam,
  updateStructure,
  addStructure,
  removeStructure,
}) => {
  const effectiveBarragemId = isMain ? data.barragemId || linkedBarragemId : data.barragemId;
  const regKey = isMain ? 'main' : `montante_${idx}`;
  const isRegisteringHere = registeringBarragemKey === regKey;
  const hasManualDamData = Boolean(data.nome.trim() || data.lat.trim() || data.long.trim());
  const ageEval = evaluateCt5Age(data.idade);
  const isSpecialAge =
    ageEval.modo === 'sem_enchimento' || ageEval.modo === 'sem_informacao';
  const montanteComplemento = !isMain
    ? normalizeBarramentoMontanteComplemento(data)
    : null;

  useEffect(() => {
    const rawLat = (data.lat || '').trim();
    if (rawLat && !rawLat.includes('°') && /^-?\d{1,3}[.,]\d{3,}$/.test(rawLat)) {
      const normalized = normalizeCoordinateToGMS(rawLat);
      if (normalized && normalized !== data.lat) {
        updateBarramento(isMain, idx, 'lat', normalized);
      }
    }
    const rawLong = (data.long || '').trim();
    if (rawLong && !rawLong.includes('°') && /^-?\d{1,3}[.,]\d{3,}$/.test(rawLong)) {
      const normalized = normalizeCoordinateToGMS(rawLong);
      if (normalized && normalized !== data.long) {
        updateBarramento(isMain, idx, 'long', normalized);
      }
    }
  }, [data.lat, data.long, isMain, idx, updateBarramento]);

  return (
    <div
      className={`space-y-6 ${
        !isMain
          ? 'p-3 md:p-4 border border-dashed border-emerald-300 rounded-lg bg-emerald-50/50 mt-6 relative'
          : ''
      }`}
    >
      {!isMain && !readOnly && (
        <button
          type="button"
          onClick={() => removeUpstreamDam(idx)}
          className="absolute top-2 right-2 md:top-4 md:right-4 text-red-400 hover:text-red-600 p-1"
          title="Remover Barragem"
        >
          <Trash2 size={18} />
        </button>
      )}

      {!isMain && (
        <div className="bg-white p-3 rounded-lg border border-emerald-200 pr-10">
          <label className="block text-xs font-bold text-slate-700 mb-2">
            Relação com a barragem principal <span className="text-rose-600">*</span>
          </label>
          <div className="flex flex-wrap gap-3">
            {OPS_RELACAO_BARRAMENTO_MONTANTE.map((opt) => {
              const checked = data.relacaoBarragemPrincipal === opt;
              return (
                <label
                  key={opt}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                    checked
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
                      : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <input
                    type="radio"
                    name={`relacao_montante_${data.id || idx}`}
                    value={opt}
                    checked={checked}
                    onChange={() =>
                      updateBarramento(false, idx, 'relacaoBarragemPrincipal', opt)
                    }
                    className="text-emerald-600 focus:ring-emerald-500"
                  />
                  {opt}
                </label>
              );
            })}
          </div>
          {!data.relacaoBarragemPrincipal && (
            <p className="text-[11px] text-amber-700 font-medium mt-1.5">
              Pendente: selecione a relação desta barragem a montante com a barragem principal.
            </p>
          )}
        </div>
      )}

      {!isMain && onSelectUpstreamBarragem && (
        <AdministraBarragemMontantePicker
          selectedBarragemId={data.barragemId}
          selectedBarragemNome={data.nome}
          readOnly={readOnly}
          onSelectBarragem={(bar) => onSelectUpstreamBarragem(idx, bar)}
          onUnlinkBarragem={
            onUnlinkBarragem ? () => onUnlinkBarragem(false, idx) : undefined
          }
        />
      )}

      {!isMain && montanteComplemento && (
        <div className="rounded-lg border border-emerald-200 bg-white p-3 space-y-3">
          <div>
            <h4 className="text-xs font-bold text-slate-700">
              Identificação fundiária e condição na área (opcional)
            </h4>
            <p className="text-[11px] text-slate-500">
              Campos opcionais armazenados no parecer sem afetar a conclusão da classificação.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label
                htmlFor={`montante-${idx}-mesmo-car`}
                className="block text-xs font-bold text-slate-600 mb-1"
              >
                Está no mesmo CAR da barragem principal?
              </label>
              <select
                id={`montante-${idx}-mesmo-car`}
                disabled={readOnly}
                value={montanteComplemento.mesmoCarPrincipal}
                onChange={(e) =>
                  updateBarramento(
                    false,
                    idx,
                    'mesmoCarPrincipal',
                    e.target.value as '' | 'sim' | 'nao'
                  )
                }
                className="w-full md:w-72 rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-xs font-medium focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="">Não informado</option>
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
              </select>
              {montanteComplemento.mesmoCarPrincipal === 'sim' && mainCarFallback && (
                <p className="text-[11px] text-emerald-700 mt-1">
                  CAR de referência da barragem principal: <strong>{mainCarFallback}</strong>
                </p>
              )}
            </div>

            {montanteComplemento.mesmoCarPrincipal === 'nao' && (
              <>
                <div>
                  <label
                    htmlFor={`montante-${idx}-car-proprio`}
                    className="block text-xs font-bold text-slate-500 mb-1"
                  >
                    CAR/MT próprio desta barragem
                  </label>
                  <input
                    id={`montante-${idx}-car-proprio`}
                    type="text"
                    disabled={readOnly}
                    value={montanteComplemento.carProprio}
                    onChange={(e) =>
                      updateBarramento(false, idx, 'carProprio', e.target.value)
                    }
                    placeholder="Ex.: MT-5103403-..."
                    className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none disabled:opacity-60"
                  />
                </div>

                <div>
                  <label
                    htmlFor={`montante-${idx}-empreendimento-nome`}
                    className="block text-xs font-bold text-slate-500 mb-1"
                  >
                    Propriedade / empreendimento
                  </label>
                  <input
                    id={`montante-${idx}-empreendimento-nome`}
                    type="text"
                    disabled={readOnly}
                    value={montanteComplemento.empreendimentoNome}
                    onChange={(e) =>
                      updateBarramento(false, idx, 'empreendimentoNome', e.target.value)
                    }
                    placeholder="Nome da propriedade ou empreendimento"
                    className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none disabled:opacity-60"
                  />
                </div>

                {onSelectUpstreamEmpreendedor && onClearUpstreamEmpreendedor && (
                  <div className="md:col-span-2">
                    <AdministraEmpreendedorMontantePicker
                      selectedEmpreendedorId={montanteComplemento.empreendedorId}
                      selectedEmpreendedorNome={montanteComplemento.empreendedorNome}
                      readOnly={readOnly}
                      onSelectEmpreendedor={(emp) =>
                        onSelectUpstreamEmpreendedor(idx, emp)
                      }
                      onClearEmpreendedor={() => onClearUpstreamEmpreendedor(idx)}
                    />
                  </div>
                )}
              </>
            )}

            <CondicaoAreaEmpreendedorFieldset
              idPrefix={`montante-${idx}-`}
              condicaoArea={montanteComplemento.condicaoArea}
              vigenciaContratoAnos={montanteComplemento.vigenciaContratoAnos}
              vigenciaInicio={montanteComplemento.vigenciaInicio}
              readOnly={readOnly}
              onChangeCondicaoArea={(val) =>
                updateBarramento(false, idx, 'condicaoArea', val)
              }
              onChangeVigenciaAnos={(val) =>
                updateBarramento(false, idx, 'vigenciaContratoAnos', val)
              }
              onChangeVigenciaInicio={(val) =>
                updateBarramento(false, idx, 'vigenciaInicio', val)
              }
              onClear={() => updateBarramento(false, idx, 'condicaoArea', '')}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Nome da barragem
          </label>
          <input
            type="text"
            value={data.nome}
            onChange={(e) => updateBarramento(isMain, idx, 'nome', e.target.value)}
            className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
            placeholder="Nome do Barramento"
          />
        </div>

        <div className="sm:col-span-2 lg:col-span-1">
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Número do SNISB
          </label>
          <input
            type="text"
            value={data.snisb}
            onChange={(e) => updateBarramento(isMain, idx, 'snisb', e.target.value)}
            className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
            placeholder="Apenas números"
          />
        </div>

        {!readOnly && effectiveBarragemId && (
          <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 text-xs text-emerald-800">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
              Barragem vinculada / cadastrada na base do Administra.
            </span>
            {onUnlinkBarragem && (
              <button
                type="button"
                onClick={() => onUnlinkBarragem(isMain, idx)}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 hover:text-red-600 px-2 py-0.5 rounded bg-white border border-slate-200"
              >
                <Unlink size={12} /> Desvincular
              </button>
            )}
          </div>
        )}

        {!readOnly && !effectiveBarragemId && hasManualDamData && (
          <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-900">
            <span>
              {CLASSIFICA_INTEGRATION_ARCHITECTURE.masterWriteApi.blocked
                ? 'Barragem preenchida manualmente sem vínculo no Administra. Gravação direta bloqueada até a aprovação da API híbrida.'
                : 'Barragem preenchida manualmente sem vínculo no Administra.'}
            </span>
            {!CLASSIFICA_INTEGRATION_ARCHITECTURE.masterWriteApi.blocked && onRegisterBarragem && (
              <button
                type="button"
                disabled={isRegisteringHere}
                onClick={() => void onRegisterBarragem(isMain, idx, data)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm disabled:opacity-60"
              >
                {isRegisteringHere ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Database size={13} />
                )}
                Cadastrar Barragem na base de dados
              </button>
            )}
          </div>
        )}

        <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">
              Coordenadas - Latitude
            </label>
            <input
              type="text"
              value={data.lat}
              onChange={(e) =>
                updateBarramento(isMain, idx, 'lat', formatGmsInput(e.target.value, data.lat))
              }
              onBlur={() =>
                updateBarramento(isMain, idx, 'lat', normalizeCoordinateToGMS(data.lat))
              }
              className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
              placeholder={GMS_PLACEHOLDER}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">
              Coordenadas - Longitude
            </label>
            <input
              type="text"
              value={data.long}
              onChange={(e) =>
                updateBarramento(isMain, idx, 'long', formatGmsInput(e.target.value, data.long))
              }
              onBlur={() =>
                updateBarramento(isMain, idx, 'long', normalizeCoordinateToGMS(data.long))
              }
              className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
              placeholder={GMS_PLACEHOLDER}
            />
          </div>
          <MiniMap lat={data.lat} long={data.long} />
        </div>

        <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Altura máxima projetada (m)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="decimal"
                placeholder="Ex: 12,5"
                value={data.alturaMaxima}
                onChange={(e) => updateBarramento(isMain, idx, 'alturaMaxima', e.target.value)}
                className="flex-1 rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
              />
              <div className="w-24">
                <label className="block text-[10px] font-bold text-slate-400 mb-0.5">Folha</label>
                <input
                  type="text"
                  placeholder="Ex: fls. 23"
                  value={data.alturaMaximaFls}
                  onChange={(e) => updateBarramento(isMain, idx, 'alturaMaximaFls', e.target.value)}
                  className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Borda livre (m)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="decimal"
                placeholder="Ex: 1,5"
                value={data.bordaLivre}
                onChange={(e) => updateBarramento(isMain, idx, 'bordaLivre', e.target.value)}
                className="flex-1 rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
              />
              <div className="w-24">
                <label className="block text-[10px] font-bold text-slate-400 mb-0.5">Folha</label>
                <input
                  type="text"
                  placeholder="Ex: fls. 23"
                  value={data.bordaLivreFls}
                  onChange={(e) => updateBarramento(isMain, idx, 'bordaLivreFls', e.target.value)}
                  className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Cota do coroamento (m)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="decimal"
                placeholder="Ex: 345,20"
                value={data.cotaCoroamento}
                onChange={(e) => updateBarramento(isMain, idx, 'cotaCoroamento', e.target.value)}
                className="flex-1 rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
              />
              <div className="w-24">
                <label className="block text-[10px] font-bold text-slate-400 mb-0.5">Folha</label>
                <input
                  type="text"
                  placeholder="Ex: fls. 23"
                  value={data.cotaCoroamentoFls}
                  onChange={(e) =>
                    updateBarramento(isMain, idx, 'cotaCoroamentoFls', e.target.value)
                  }
                  className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Comprimento do coroamento (m)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="decimal"
                placeholder="Ex: 200,5"
                value={data.comprimentoCoroamento}
                onChange={(e) =>
                  updateBarramento(isMain, idx, 'comprimentoCoroamento', e.target.value)
                }
                className="flex-1 rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
              />
              <div className="w-24">
                <label className="block text-[10px] font-bold text-slate-400 mb-0.5">Folha</label>
                <input
                  type="text"
                  placeholder="Ex: fls. 23"
                  value={data.comprimentoCoroamentoFls}
                  onChange={(e) =>
                    updateBarramento(isMain, idx, 'comprimentoCoroamentoFls', e.target.value)
                  }
                  className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Largura média do coroamento (m)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="decimal"
                placeholder="Ex: 6,0"
                value={data.larguraCoroamento}
                onChange={(e) =>
                  updateBarramento(isMain, idx, 'larguraCoroamento', e.target.value)
                }
                className="flex-1 rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
              />
              <div className="w-24">
                <label className="block text-[10px] font-bold text-slate-400 mb-0.5">Folha</label>
                <input
                  type="text"
                  placeholder="Ex: fls. 23"
                  value={data.larguraCoroamentoFls}
                  onChange={(e) =>
                    updateBarramento(isMain, idx, 'larguraCoroamentoFls', e.target.value)
                  }
                  className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">Tipo estrutural</label>
          <select
            value={data.tipoEstrutural}
            onChange={(e) => updateBarramento(isMain, idx, 'tipoEstrutural', e.target.value)}
            className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
          >
            <option value="">Selecione...</option>
            {OPS_TIPO_ESTRUTURAL.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de fundação</label>
          <select
            value={data.tipoFundacao}
            onChange={(e) => updateBarramento(isMain, idx, 'tipoFundacao', e.target.value)}
            className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
          >
            <option value="">Selecione...</option>
            {OPS_TIPO_FUNDACAO.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2 bg-white p-3 rounded-lg border border-slate-200 space-y-2">
          <label className="block text-sm font-medium text-slate-700">
            Idade da barragem (desde o início da construção)
          </label>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <input
              type="text"
              inputMode="decimal"
              value={isSpecialAge ? '' : data.idade}
              disabled={isSpecialAge}
              onChange={(e) => updateBarramento(isMain, idx, 'idade', e.target.value)}
              className="w-full sm:w-36 rounded-lg border-slate-400 bg-[#F5F5F5] p-3 md:p-2 text-sm md:text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none disabled:opacity-50"
              placeholder="Anos (ex: 15 ou 4,5)"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={readOnly}
                onClick={() =>
                  updateBarramento(
                    isMain,
                    idx,
                    'idade',
                    ageEval.modo === 'sem_enchimento' ? '' : IDADE_SEM_ENCHIMENTO
                  )
                }
                className={`px-2.5 py-1.5 rounded text-xs font-medium border transition-colors ${
                  ageEval.modo === 'sem_enchimento'
                    ? 'bg-amber-100 border-amber-400 text-amber-900 font-bold'
                    : 'bg-slate-50 border-slate-300 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Ainda não atingiu NMO
              </button>
              <button
                type="button"
                disabled={readOnly}
                onClick={() =>
                  updateBarramento(
                    isMain,
                    idx,
                    'idade',
                    ageEval.modo === 'sem_informacao' ? '' : IDADE_SEM_INFORMACAO
                  )
                }
                className={`px-2.5 py-1.5 rounded text-xs font-medium border transition-colors ${
                  ageEval.modo === 'sem_informacao'
                    ? 'bg-amber-100 border-amber-400 text-amber-900 font-bold'
                    : 'bg-slate-50 border-slate-300 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Sem informação
              </button>
            </div>
            <div
              className={`text-xs px-3 py-1 rounded w-full sm:w-auto text-center ${
                ageEval.score === null
                  ? 'bg-amber-50 text-amber-700 border border-amber-200 font-semibold'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {ageEval.score === null ? (
                <span>Pontuação CT5: Pendente</span>
              ) : (
                <span>
                  Pontuação CT5: <strong>{ageEval.score}</strong>
                </span>
              )}
            </div>
          </div>
          {isSpecialAge && (
            <p className="text-[11px] text-slate-500">
              Condição selecionada explicitamente: <strong>{ageEval.descricao}</strong> (5 pontos). Clique novamente para informar idade numérica.
            </p>
          )}
        </div>
      </div>

      {/* Reservatório */}
      <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
        <h4 className="font-bold text-slate-700 text-sm mb-3 flex items-center gap-2">
          <Droplets size={16} /> Reservatório
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">
              Nível normal de operação (NNO) (m)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={data.cotaNNO}
              onChange={(e) => updateBarramento(isMain, idx, 'cotaNNO', e.target.value)}
              className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">
              Nível máximo Maximorum (NMM) (m)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={data.cotaNMM}
              onChange={(e) => updateBarramento(isMain, idx, 'cotaNMM', e.target.value)}
              className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">
              Área inundada (NNO) (m²)/(ha)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={data.areaNNO}
              onChange={(e) => updateBarramento(isMain, idx, 'areaNNO', e.target.value)}
              className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">
              Área inundada (NMM) (m²)/(ha)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={data.areaNMM}
              onChange={(e) => updateBarramento(isMain, idx, 'areaNMM', e.target.value)}
              className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">
              Volume armazenado (NMO) (hm³)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={data.volumeNMO}
              onChange={(e) => updateBarramento(isMain, idx, 'volumeNMO', e.target.value)}
              className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
              placeholder="Ex: 1,50"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">
              Volume armazenado (NMM) (hm³)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={data.volumeNMM}
              onChange={(e) => updateBarramento(isMain, idx, 'volumeNMM', e.target.value)}
              className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
              placeholder="Ex: 3,00"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1">
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Vazão máxima de projeto (m³/s) / Tempo de Retorno (TR)
        </label>
        <input
          type="text"
          value={data.vazaoMaxima}
          onChange={(e) => updateBarramento(isMain, idx, 'vazaoMaxima', e.target.value)}
          className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-2 text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
          placeholder="Ex: 150,00 m³/s (TR 10.000 anos)"
        />
      </div>

      {/* Estruturas Hidráulicas */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="block text-sm font-medium text-slate-700">
            Estrutura(s) Hidráulica(s)
          </label>
          {!readOnly && (
            <button
              type="button"
              onClick={() => addStructure(isMain, idx)}
              className="text-xs flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-medium"
            >
              <Plus size={14} /> Adicionar Estrutura
            </button>
          )}
        </div>

        {data.estruturas.map((struct, sIdx) => (
          <div
            key={struct.id}
            className="bg-white border border-slate-200 rounded-lg p-4 mb-3 shadow-sm relative"
          >
            {data.estruturas.length > 1 && !readOnly && (
              <button
                type="button"
                onClick={() => removeStructure(isMain, idx, sIdx)}
                className="absolute top-2 right-2 text-slate-300 hover:text-red-500"
                title="Remover estrutura"
              >
                <Trash2 size={16} />
              </button>
            )}
            <div className="mb-3 pr-6">
              <input
                type="text"
                value={struct.descricao}
                onChange={(e) =>
                  updateStructure(isMain, idx, sIdx, 'descricao', e.target.value)
                }
                className="font-semibold text-sm text-slate-700 border-none p-0 focus:ring-0 w-full bg-transparent outline-none"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs text-slate-500">Vazão da estrutura (m³/s)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={struct.vazao}
                  onChange={(e) => updateStructure(isMain, idx, sIdx, 'vazao', e.target.value)}
                  className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-1.5 text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500">Cota da soleira (m)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={struct.cotaSoleira}
                  onChange={(e) =>
                    updateStructure(isMain, idx, sIdx, 'cotaSoleira', e.target.value)
                  }
                  className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-1.5 text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                />
              </div>
              <div className="col-span-1 md:col-span-2">
                <label className="block text-xs text-slate-500">Localização no barramento</label>
                <input
                  type="text"
                  placeholder="Ex: Na ombreira esquerda"
                  value={struct.localizacao}
                  onChange={(e) =>
                    updateStructure(isMain, idx, sIdx, 'localizacao', e.target.value)
                  }
                  className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-1.5 text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                />
              </div>
              <div className="col-span-1 md:col-span-2">
                <label className="block text-xs text-slate-500">Segurança Estrutural</label>
                <textarea
                  rows={2}
                  value={struct.seguranca}
                  onChange={(e) =>
                    updateStructure(isMain, idx, sIdx, 'seguranca', e.target.value)
                  }
                  className="w-full rounded-lg border-slate-400 bg-[#F5F5F5] p-1.5 text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 shadow-sm transition-all outline-none"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Adequações */}
      <div className="border-t border-slate-200 pt-4">
        <label className="flex items-center gap-2 cursor-pointer mb-2">
          <input
            type="checkbox"
            checked={data.possuiAdequacao}
            onChange={(e) =>
              updateBarramento(isMain, idx, 'possuiAdequacao', e.target.checked)
            }
            className="rounded text-emerald-600 focus:ring-emerald-500"
          />
          <span className="text-sm font-bold text-slate-700">INSERIR ADEQUAÇÕES PROPOSTAS</span>
        </label>

        {data.possuiAdequacao && (
          <div className="bg-orange-50 p-4 rounded border border-orange-100 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-orange-800 font-medium mb-1">
                Vazão (Adequação) (m³/s)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={data.adequacaoVazao || ''}
                onChange={(e) =>
                  updateBarramento(isMain, idx, 'adequacaoVazao', e.target.value)
                }
                className="w-full rounded border-orange-200 p-2 text-sm bg-[#F5F5F5]"
              />
            </div>
            <div>
              <label className="block text-xs text-orange-800 font-medium mb-1">
                Cota Soleira (Adequação) (m)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={data.adequacaoCota || ''}
                onChange={(e) =>
                  updateBarramento(isMain, idx, 'adequacaoCota', e.target.value)
                }
                className="w-full rounded border-orange-200 p-2 text-sm bg-[#F5F5F5]"
              />
            </div>
            <div className="col-span-1 md:col-span-2">
              <label className="block text-xs text-orange-800 font-medium mb-1">
                Localização (Adequação)
              </label>
              <input
                type="text"
                value={data.adequacaoLocalizacao || ''}
                onChange={(e) =>
                  updateBarramento(isMain, idx, 'adequacaoLocalizacao', e.target.value)
                }
                className="w-full rounded border-orange-200 p-2 text-sm bg-[#F5F5F5]"
              />
            </div>
            <div className="col-span-1 md:col-span-2">
              <label className="block text-xs text-orange-800 font-medium mb-1">
                Vazão Mínima Remanescente
              </label>
              <input
                type="text"
                value={data.adequacaoVazaoRemanescente || ''}
                onChange={(e) =>
                  updateBarramento(isMain, idx, 'adequacaoVazaoRemanescente', e.target.value)
                }
                className="w-full rounded border-orange-200 p-2 text-sm bg-[#F5F5F5]"
              />
            </div>
            <div className="col-span-1 md:col-span-2">
              <label className="block text-xs text-orange-800 font-medium mb-1">
                Segurança (Adequação)
              </label>
              <textarea
                rows={2}
                value={data.adequacaoSeguranca || ''}
                onChange={(e) =>
                  updateBarramento(isMain, idx, 'adequacaoSeguranca', e.target.value)
                }
                className="w-full rounded border-orange-200 p-2 text-sm bg-[#F5F5F5]"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface Topic3BarramentosProps {
  barragemPrincipal: BarramentoData;
  barragensMontante: BarramentoData[];
  barragemId?: string;
  mainCarFallback?: string;
  registeringBarragemKey?: string | null;
  onRegisterBarragem?: (isMain: boolean, idx: number, data: BarramentoData) => Promise<void>;
  onUnlinkBarragem?: (isMain: boolean, idx: number) => void;
  onSelectUpstreamBarragem?: (idx: number, bar: BarragemMaster) => void;
  onSelectUpstreamEmpreendedor?: (idx: number, emp: EmpreendedorMaster) => void;
  onClearUpstreamEmpreendedor?: (idx: number) => void;
  isOpen: boolean;
  readOnly?: boolean;
  onToggleSection: () => void;
  updateBarramento: (
    isMain: boolean,
    idx: number,
    field: keyof BarramentoData,
    value: any
  ) => void;
  addUpstreamDam: () => void;
  removeUpstreamDam: (idx: number) => void;
  updateStructure: (
    isMain: boolean,
    barramentoIdx: number,
    structIdx: number,
    field: keyof EstruturaHidraulica,
    value: any
  ) => void;
  addStructure: (isMain: boolean, barramentoIdx: number) => void;
  removeStructure: (isMain: boolean, barramentoIdx: number, structIdx: number) => void;
}

export const Topic3Barramentos: React.FC<Topic3BarramentosProps> = ({
  barragemPrincipal,
  barragensMontante,
  barragemId,
  mainCarFallback,
  registeringBarragemKey,
  onRegisterBarragem,
  onUnlinkBarragem,
  onSelectUpstreamBarragem,
  onSelectUpstreamEmpreendedor,
  onClearUpstreamEmpreendedor,
  isOpen,
  readOnly = false,
  onToggleSection,
  updateBarramento,
  addUpstreamDam,
  removeUpstreamDam,
  updateStructure,
  addStructure,
  removeStructure,
}) => (
  <section id="barramento" className="scroll-mt-56">
    <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
      <button
        type="button"
        onClick={onToggleSection}
        className="w-full flex items-center justify-between mb-6 border-b border-slate-100 pb-4 group"
      >
        <div className="flex items-center gap-2 text-left">
          <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-sm shrink-0">
            3
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800 group-hover:text-emerald-600 transition-colors">
              INFORMAÇÕES DOS BARRAMENTOS
            </h2>
            <p className="text-xs text-slate-500">
              Barragem principal, reservatório, estruturas hidráulicas, adequações e barragens a montante
            </p>
          </div>
        </div>
        <div className="text-slate-400 group-hover:text-emerald-600 transition-colors">
          {isOpen ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
        </div>
      </button>

      {isOpen && (
        <div className="space-y-8">
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <h3 className="font-bold text-slate-700 text-sm mb-4">Barragem Principal</h3>
            <BarramentoForm
              data={barragemPrincipal}
              isMain={true}
              readOnly={readOnly}
              linkedBarragemId={barragemId}
              registeringBarragemKey={registeringBarragemKey}
              onRegisterBarragem={onRegisterBarragem}
              onUnlinkBarragem={onUnlinkBarragem}
              updateBarramento={updateBarramento}
              updateStructure={updateStructure}
              addStructure={addStructure}
              removeStructure={removeStructure}
              removeUpstreamDam={() => {}}
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-slate-700 text-sm">Barragens a Montante</h3>
              {!readOnly && (
                <button
                  type="button"
                  onClick={addUpstreamDam}
                  className="text-xs flex items-center gap-1 bg-emerald-600 text-white px-3 py-2 rounded hover:bg-emerald-700 font-medium"
                >
                  <Plus size={16} /> Adicionar Barragem
                </button>
              )}
            </div>

            {barragensMontante.length === 0 && (
              <p className="text-sm text-slate-400 italic">
                Nenhuma barragem a montante adicionada.
              </p>
            )}

            {barragensMontante.map((b, idx) => (
              <BarramentoForm
                key={b.id || idx}
                data={b}
                isMain={false}
                idx={idx}
                readOnly={readOnly}
                mainCarFallback={mainCarFallback}
                registeringBarragemKey={registeringBarragemKey}
                onRegisterBarragem={onRegisterBarragem}
                onUnlinkBarragem={onUnlinkBarragem}
                onSelectUpstreamBarragem={onSelectUpstreamBarragem}
                onSelectUpstreamEmpreendedor={onSelectUpstreamEmpreendedor}
                onClearUpstreamEmpreendedor={onClearUpstreamEmpreendedor}
                updateBarramento={updateBarramento}
                updateStructure={updateStructure}
                addStructure={addStructure}
                removeStructure={removeStructure}
                removeUpstreamDam={removeUpstreamDam}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  </section>
);
