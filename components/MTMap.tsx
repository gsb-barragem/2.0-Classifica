import React, { useRef, useEffect } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { renderToString } from 'react-dom/server';
import { ShieldCheck, FileText, ClipboardList, Layers, X } from 'lucide-react';
import { ParecerData, OficioData, NoObligatoryData, RejectionData } from '../types';

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export const parseGMS = (gms: string): number => {
  if (!gms) return NaN;
  // Format: 00°00'00,00"
  const regex = /(\d+)°(\d+)'(\d+),(\d+)"/;
  const match = gms.match(regex);
  
  if (!match) {
    const val = parseFloat(gms.replace(',', '.'));
    return val;
  }
  
  const degrees = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  const seconds = parseFloat(match[3] + '.' + match[4]);
  
  let decimal = degrees + (minutes / 60) + (seconds / 3600);
  
  // MT is South and West. If the user enters positive values, they are likely meant to be negative.
  // We'll assume if degrees > 0 and it's not already negative, it should be negative for MT coordinates.
  return -decimal; 
};

export const formatToGMS = (val: any): string => {
  if (val === null || val === undefined || val === '') return '';
  const str = String(val);
  
  // If it already looks like GMS, return it
  if (str.includes('°')) return str;
  
  // If it's a number (decimal), convert it
  const num = parseFloat(str.replace(',', '.'));
  if (isNaN(num)) return str;
  
  const absolute = Math.abs(num);
  let degrees = Math.floor(absolute);
  let minutesNotTruncated = (absolute - degrees) * 60;
  let minutes = Math.floor(minutesNotTruncated);
  const secondsNotTruncated = (minutesNotTruncated - minutes) * 60;
  let seconds = Math.floor(secondsNotTruncated);
  let hundredths = Math.round((secondsNotTruncated - seconds) * 100);
  
  if (hundredths >= 100) {
    hundredths = 0;
    seconds++;
  }
  if (seconds >= 60) {
    seconds = 0;
    minutes++;
  }
  if (minutes >= 60) {
    minutes = 0;
    degrees++;
  }
  
  const d = degrees.toString().padStart(2, '0');
  const m = minutes.toString().padStart(2, '0');
  const s = seconds.toString().padStart(2, '0');
  const h = hundredths.toString().padStart(2, '0');
  
  return `${d}°${m}'${s},${h}"`;
};

interface MTMapProps {
  pareceres: ParecerData[];
  oficios: OficioData[];
  noObligatoriedades: NoObligatoryData[];
  indeferimentos?: RejectionData[];
  transferencias?: any[];
  hoveredCity: string | null;
  highlightType: string | null;
  onMapClick?: () => void;
}

const MTMap: React.FC<MTMapProps> = ({ pareceres, oficios, noObligatoriedades, indeferimentos = [], transferencias = [], hoveredCity, highlightType, onMapClick }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const markersRef = useRef<{ [key: string]: (L.CircleMarker | L.Layer)[] }>({});
  const allMarkersRef = useRef<L.Layer[]>([]);

  useEffect(() => {
    if (!mapRef.current) return;

    // Initialize Map if not already done
    if (!leafletMap.current) {
      leafletMap.current = L.map(mapRef.current).setView([-12.9, -56.0], 6);

      const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      });

      const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
      });

      satellite.addTo(leafletMap.current);

      leafletMap.current.on('click', () => {
        if (onMapClick) onMapClick();
      });

      L.control.layers({
        "Satélite": satellite,
        "OpenStreetMap": osm
      }, {}, { position: 'topright' }).addTo(leafletMap.current);

      // Camada de Limites Municipais do MT (IBGE)
      fetch('https://servicodados.ibge.gov.br/api/v3/malhas/estados/51?formato=application/vnd.geo+json&intrarregiao=municipio&qualidade=minima')
        .then(res => res.json())
        .then(data => {
          if (leafletMap.current) {
            L.geoJSON(data, {
              style: {
                color: '#ffffff',
                weight: 0.8,
                opacity: 0.4,
                fillColor: 'transparent',
                fillOpacity: 0
              },
              onEachFeature: (feature, layer) => {
                const name = feature.properties.nm_mun || feature.properties.NM_MUN || feature.properties.nome;
                if (name) {
                  layer.bindTooltip(name, {
                    sticky: true,
                    direction: 'top',
                    className: 'map-muni-tooltip'
                  });
                }
                
                layer.on({
                  mouseover: (e) => {
                    const l = e.target;
                    l.setStyle({
                      weight: 1.5,
                      opacity: 0.7,
                      color: '#ffffff'
                    });
                  },
                  mouseout: (e) => {
                    const l = e.target;
                    l.setStyle({
                      weight: 0.8,
                      opacity: 0.4,
                      color: '#ffffff'
                    });
                  }
                });
              }
            }).addTo(leafletMap.current);
          }
        })
        .catch(err => console.error('Error loading municipalities:', err));

      // Destaque para o Mato Grosso (Escurecer exterior)
      fetch('https://servicodados.ibge.gov.br/api/v3/malhas/estados/51?formato=application/vnd.geo+json&qualidade=minima')
        .then(res => res.json())
        .then(data => {
          if (leafletMap.current) {
            const worldCoords: L.LatLngExpression[] = [
              [-90, -180],
              [-90, 180],
              [90, 180],
              [90, -180],
              [-90, -180]
            ];

            const mtFeatures = data.features[0].geometry;
            let holes: L.LatLngExpression[][] = [];

            if (mtFeatures.type === 'Polygon') {
              holes = mtFeatures.coordinates.map((ring: any) => 
                ring.map((coord: [number, number]) => [coord[1], coord[0]]) as L.LatLngExpression[]
              );
            } else if (mtFeatures.type === 'MultiPolygon') {
              mtFeatures.coordinates.forEach((polygon: any) => {
                polygon.forEach((ring: any) => {
                  holes.push(ring.map((coord: [number, number]) => [coord[1], coord[0]]) as L.LatLngExpression[]);
                });
              });
            }

            L.polygon([worldCoords, ...holes], {
              fillColor: '#000',
              fillOpacity: 0.4,
              stroke: false,
              interactive: false
            }).addTo(leafletMap.current);
          }
        })
        .catch(err => console.error('Error loading state mask:', err));

      // Handle Resize
      const resizeObserver = new ResizeObserver(() => {
        if (leafletMap.current && mapRef.current) {
          leafletMap.current.invalidateSize();
        }
      });
      if (mapRef.current) {
        resizeObserver.observe(mapRef.current);
      }

      return () => {
        resizeObserver.disconnect();
      };
    }
  }, []);

  useEffect(() => {
    if (!leafletMap.current) return;
    const map = leafletMap.current;

    // Clear existing markers
    map.eachLayer((layer) => {
      if (layer instanceof L.CircleMarker || (layer as any).options?.icon?.options?.className === 'custom-hatched-marker' || (layer as any).options?.icon?.options?.className === 'custom-multi-marker') {
        map.removeLayer(layer);
      }
    });
    markersRef.current = {};
    allMarkersRef.current = [];

    // Group all items by coordinate
    const groupedItems: { [key: string]: { lat: number, lng: number, items: { type: 'parecer' | 'oficio' | 'no-obligatory' | 'rejection', data: any }[], municipio: string } } = {};

    pareceres.forEach(item => {
      const lat = parseGMS(item.barragemPrincipal.lat);
      const lng = parseGMS(item.barragemPrincipal.long);
      if (!isNaN(lat) && !isNaN(lng)) {
        const key = `${lat.toFixed(6)}_${lng.toFixed(6)}`;
        if (!groupedItems[key]) {
          groupedItems[key] = { lat, lng, items: [], municipio: item.municipio };
        }
        groupedItems[key].items.push({ type: 'parecer', data: item });
      }
    });

    oficios.forEach(item => {
      if (!item.lat || !item.long) return;
      const lat = parseGMS(item.lat);
      const lng = parseGMS(item.long);
      if (!isNaN(lat) && !isNaN(lng)) {
        const key = `${lat.toFixed(6)}_${lng.toFixed(6)}`;
        if (!groupedItems[key]) {
          groupedItems[key] = { lat, lng, items: [], municipio: item.municipio || '' };
        }
        groupedItems[key].items.push({ type: 'oficio', data: item });
      }
    });

    noObligatoriedades.forEach(item => {
      if (!item.lat || !item.long) return;
      const lat = parseGMS(item.lat);
      const lng = parseGMS(item.long);
      if (!isNaN(lat) && !isNaN(lng)) {
        const key = `${lat.toFixed(6)}_${lng.toFixed(6)}`;
        if (!groupedItems[key]) {
          groupedItems[key] = { lat, lng, items: [], municipio: item.municipio || '' };
        }
        groupedItems[key].items.push({ type: 'no-obligatory', data: item });
      }
    });

    indeferimentos.forEach(item => {
      if (!item.lat || !item.long) return;
      const lat = parseGMS(item.lat);
      const lng = parseGMS(item.long);
      if (!isNaN(lat) && !isNaN(lng)) {
        const key = `${lat.toFixed(6)}_${lng.toFixed(6)}`;
        if (!groupedItems[key]) {
          groupedItems[key] = { lat, lng, items: [], municipio: item.municipio || '' };
        }
        groupedItems[key].items.push({ type: 'rejection', data: item });
      }
    });

    transferencias.forEach(item => {
      if (!item.latGMS || !item.longGMS) return;
      const lat = parseGMS(item.latGMS);
      const lng = parseGMS(item.longGMS);
      if (!isNaN(lat) && !isNaN(lng)) {
        const key = `${lat.toFixed(6)}_${lng.toFixed(6)}`;
        if (!groupedItems[key]) {
          groupedItems[key] = { lat, lng, items: [], municipio: item.municipio || '' };
        }
        groupedItems[key].items.push({ type: 'transferencia' as any, data: item });
      }
    });

    // Plot Grouped Items
    Object.values(groupedItems).forEach(group => {
      const { lat, lng, items, municipio } = group;
      let marker: L.Layer | null = null;
      let markerColor = '#0000CD'; // Default
      let tooltipContent = '';
      
      // Collect all legend types for this location
      const legendTypes = new Set<string>();
      if (items.length > 1) legendTypes.add('MÚLTIPLOS DOCS');

      const getItemStyle = (item: { type: 'parecer' | 'oficio' | 'no-obligatory' | 'rejection', data: any }) => {
        let type = '';
        let color = '';
        let isHatched = false;

        if (item.type === 'parecer') {
          const p = item.data;
          type = p.status === 'Concluído' ? 'Parecer (Concluído)' : 'Parecer (Rascunho)';
          color = p.status === 'Concluído' ? '#0000CD' : '#87CEEB';
        } else if (item.type === 'no-obligatory') {
          const n = item.data;
          type = n.status === 'Concluído' ? 'Não Obrigatoriedade (Concluído)' : 'Não Obrigatoriedade (Rascunho)';
          color = n.status === 'Concluído' ? '#4ade80' : '#bcf3d1'; // light green shades
        } else if (item.type === 'rejection') {
          const r = item.data;
          type = r.status === 'Concluído' ? 'Indeferimento (Concluído)' : 'Indeferimento (Rascunho)';
          color = r.status === 'Concluído' ? '#ef4444' : '#fecaca'; // Red shades
        } else if (item.type === 'transferencia' as any) {
          const t = item.data;
          type = t.status === 'Concluído' ? 'Transferência (Concluído)' : 'Transferência (Rascunho)';
          color = t.status === 'Concluído' ? '#4f46e5' : '#818cf8'; // Indigo shades
        } else if (item.type === 'oficio') {
          const o = item.data;
          if (o.status === 'Rascunho') {
            type = 'Ofício (Rascunho)';
            color = '#fde68a'; // amber-200
          } else {
            const dataEmissao = new Date(o.data);
            const diasPrazo = (parseInt(o.prazo) || 0) + (parseInt(o.prorrogacaoPrazo || '0') || 0);
            const dataExpiracao = new Date(dataEmissao);
            dataExpiracao.setDate(dataExpiracao.getDate() + diasPrazo);
            const hoje = new Date();
            const expirado = hoje > dataExpiracao;

            if (o.situacaoPendencia === 'Arquivado') {
              color = '#94a3b8';
              type = 'Ofício (Arquivado)';
            } else if (o.situacaoPendencia === 'Cumprido') {
              color = '#10b981';
              isHatched = true;
              type = 'Ofício (Cumprido)';
            } else if (o.situacaoPendencia === 'Não cumprido' || (expirado && o.situacaoPendencia === 'Pendente')) {
              color = '#ef4444';
              type = 'Ofício (Expirado)';
            } else {
              color = '#fbbf24';
              type = 'Ofício (Pendente)';
            }
          }
        }
        return { type, color, isHatched };
      };

      items.forEach(it => {
        const style = getItemStyle(it);
        legendTypes.add(style.type);
      });

      if (items.length === 1) {
        const item = items[0];
        const style = getItemStyle(item);
        markerColor = style.color;

        if (item.type === 'parecer') {
          const p = item.data;
          const statusColor = p.status === 'Concluído' ? '#0000CD' : '#87CEEB';
          marker = L.marker([lat, lng], {
            icon: L.divIcon({
              className: 'custom-doc-marker',
              html: renderToString(
                <div style={{
                  width: '24px',
                  height: '24px',
                  backgroundColor: statusColor,
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  border: '2px solid white',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                }}>
                  <FileText size={14} />
                </div>
              ),
              iconSize: [24, 24],
              iconAnchor: [12, 12]
            })
          });
          
          tooltipContent = `
            <div class="p-2 min-w-[200px] font-sans">
              <div class="border-b border-slate-200 pb-1 mb-1">
                <div class="text-[10px] font-bold uppercase" style="color: ${statusColor}">Parecer Técnico (${escapeHtml(p.status)})</div>
                <div class="text-[10px] font-bold text-slate-500 uppercase">Processo: ${escapeHtml(p.protocolo)}</div>
                <div class="text-sm font-black text-slate-900">${escapeHtml(p.razaoSocial)}</div>
              </div>
              <div class="space-y-1 text-xs">
                <div><span class="font-bold text-slate-500">Data:</span> ${escapeHtml(new Date(p.data).toLocaleDateString('pt-BR'))}</div>
                <div><span class="font-bold text-slate-500">Analista:</span> ${escapeHtml(p.analista === 'OUTRO' ? p.analistaOutro : p.analista)}</div>
                <div><span class="font-bold text-slate-500">Município:</span> ${escapeHtml(p.municipio)}</div>
                <div><span class="font-bold text-slate-500">Classificação:</span> ${escapeHtml(p.classificacao.resumo)}</div>
              </div>
            </div>
          `;
        } else if (item.type === 'no-obligatory') {
          const n = item.data;
          const statusColor = n.status === 'Concluído' ? '#10b981' : '#bcf3d1';
          marker = L.marker([lat, lng], {
            icon: L.divIcon({
              className: 'custom-no-obligatory-marker',
              html: renderToString(
                <div style={{
                  width: '24px',
                  height: '24px',
                  backgroundColor: statusColor,
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: n.status === 'Concluído' ? 'white' : '#047857',
                  border: '2px solid white',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                }}>
                  <ShieldCheck size={14} />
                </div>
              ),
              iconSize: [24, 24],
              iconAnchor: [12, 12]
            })
          });

          tooltipContent = `
            <div class="p-2 min-w-[200px] font-sans">
              <div class="border-b border-slate-200 pb-1 mb-1">
                <div class="text-[10px] font-bold uppercase" style="color: #10b981">Não Obrigatoriedade (${escapeHtml(n.status)})</div>
                <div class="text-[10px] font-bold text-slate-500 uppercase">Processo: ${escapeHtml(n.processo)}</div>
                <div class="text-sm font-black text-slate-900">${escapeHtml(n.empreendedor)}</div>
              </div>
              <div class="space-y-1 text-xs">
                <div><span class="font-bold text-slate-500">Analista:</span> ${escapeHtml(n.analista)}</div>
                <div><span class="font-bold text-slate-500">Município:</span> ${escapeHtml(n.municipio)}</div>
              </div>
            </div>
          `;
        } else if (item.type === 'rejection') {
          const r = item.data;
          const statusColor = r.status === 'Concluído' ? '#ef4444' : '#fecaca';
          marker = L.marker([lat, lng], {
            icon: L.divIcon({
              className: 'custom-rejection-marker',
              html: renderToString(
                <div style={{
                  width: '24px',
                  height: '24px',
                  backgroundColor: statusColor,
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: r.status === 'Concluído' ? 'white' : '#991b1b',
                  border: '2px solid white',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                }}>
                  <X size={14} />
                </div>
              ),
              iconSize: [24, 24],
              iconAnchor: [12, 12]
            })
          });

          tooltipContent = `
            <div class="p-2 min-w-[200px] font-sans">
              <div class="border-b border-slate-200 pb-1 mb-1">
                <div class="text-[10px] font-bold uppercase" style="color: #ef4444">Indeferimento (${escapeHtml(r.status)})</div>
                <div class="text-[10px] font-bold text-slate-500 uppercase">Processo: ${escapeHtml(r.protocolo)}</div>
                <div class="text-sm font-black text-slate-900">${escapeHtml(r.empreendedor || r.nomeEmpreendedor)}</div>
              </div>
              <div class="space-y-1 text-xs">
                <div><span class="font-bold text-slate-500">Analista:</span> ${escapeHtml(r.analista)}</div>
                <div><span class="font-bold text-slate-500">Município:</span> ${escapeHtml(r.municipio || r.municipioEmpreendimento)}</div>
                <div><span class="font-bold text-slate-500">Situação:</span> ${escapeHtml(r.sistemaSituacao || 'Indeferido por inércia')}</div>
              </div>
            </div>
          `;
        } else if (item.type === 'transferencia' as any) {
          const t = item.data;
          const statusColor = t.status === 'Concluído' ? '#4f46e5' : '#818cf8';
          marker = L.marker([lat, lng], {
            icon: L.divIcon({
              className: 'custom-transfer-marker',
              html: renderToString(
                <div style={{
                  width: '24px',
                  height: '24px',
                  backgroundColor: statusColor,
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  border: '2px solid white',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                }}>
                  <Layers size={14} />
                </div>
              ),
              iconSize: [24, 24],
              iconAnchor: [12, 12]
            })
          });

          tooltipContent = `
            <div class="p-2 min-w-[200px] font-sans">
              <div class="border-b border-slate-200 pb-1 mb-1">
                <div class="text-[10px] font-bold uppercase" style="color: #4f46e5">Transferência Titularidade (${escapeHtml(t.status)})</div>
                <div class="text-[10px] font-bold text-slate-500 uppercase">Processo: ${escapeHtml(t.nProcesso)}</div>
                <div class="text-sm font-black text-slate-900">${escapeHtml(t.novoProprietario)}</div>
              </div>
              <div class="space-y-1 text-xs">
                <div><span class="font-bold text-slate-500">Analista:</span> ${escapeHtml(t.analista)}</div>
                <div><span class="font-bold text-slate-500">Município:</span> ${escapeHtml(t.municipio)}</div>
                <div><span class="font-bold text-slate-500">Fazenda:</span> ${escapeHtml(t.nomeFazenda)}</div>
              </div>
            </div>
          `;
        } else if (item.type === 'oficio') {
          const o = item.data;
          const dataEmissao = new Date(o.data);
          const diasPrazo = (parseInt(o.prazo) || 0) + (parseInt(o.prorrogacaoPrazo || '0') || 0);
          const dataExpiracao = new Date(dataEmissao);
          dataExpiracao.setDate(dataExpiracao.getDate() + diasPrazo);
          const hoje = new Date();
          const expirado = hoje > dataExpiracao;
          
          marker = L.marker([lat, lng], {
            icon: L.divIcon({
              className: 'custom-oficio-marker',
              html: renderToString(
                <div style={{
                  width: '24px',
                  height: '24px',
                  backgroundColor: markerColor,
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: o.status === 'Rascunho' ? '#92400e' : 'white',
                  border: '2px solid white',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                  background: style.isHatched ? 'repeating-linear-gradient(45deg, #fbbf24, #fbbf24 2px, #10b981 2px, #10b981 4px)' : markerColor
                }}>
                  <ClipboardList size={14} />
                </div>
              ),
              iconSize: [24, 24],
              iconAnchor: [12, 12]
            })
          });

          tooltipContent = `
            <div class="p-2 min-w-[240px] font-sans">
              <div class="border-b border-slate-200 pb-1 mb-1">
                <div class="flex justify-between items-start">
                  <div>
                    <div class="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Ofício de Pendências</div>
                    <div class="text-[10px] font-bold text-slate-400 uppercase">Processo: ${escapeHtml(o.protocolo)}</div>
                  </div>
                  <span class="px-1.5 py-0.5 rounded text-[8px] font-black uppercase border ${
                    o.status === 'Rascunho' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                    o.situacaoPendencia === 'Cumprido' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    o.situacaoPendencia === 'Arquivado' ? 'bg-slate-50 text-slate-600 border-slate-200' :
                    (expirado && o.situacaoPendencia === 'Pendente') || o.situacaoPendencia === 'Não cumprido' ? 'bg-red-50 text-red-700 border-red-200' :
                    'bg-amber-50 text-amber-700 border-amber-200'
                  }">
                    ${escapeHtml(o.status === 'Rascunho' ? 'Rascunho' : (o.situacaoPendencia || 'Pendente'))}
                  </span>
                </div>
                <div class="text-sm font-black text-slate-900 mt-1">${escapeHtml(o.interessado)}</div>
              </div>
              <div class="space-y-1.5 text-xs py-1">
                <div class="flex justify-between items-center">
                  <span class="font-bold text-slate-500 uppercase text-[9px]">Emissão:</span>
                  <span class="font-medium text-slate-700">${escapeHtml(dataEmissao.toLocaleDateString('pt-BR'))}</span>
                </div>
                <div class="flex justify-between items-center p-1 rounded ${expirado && o.situacaoPendencia === 'Pendente' && o.status !== 'Rascunho' ? 'bg-red-50' : 'bg-emerald-50'}">
                  <span class="font-bold ${expirado && o.situacaoPendencia === 'Pendente' && o.status !== 'Rascunho' ? 'text-red-500' : 'text-emerald-600'} uppercase text-[9px]">Vencimento:</span>
                  <span class="font-black ${expirado && o.situacaoPendencia === 'Pendente' && o.status !== 'Rascunho' ? 'text-red-600' : 'text-emerald-700'}">${escapeHtml(dataExpiracao.toLocaleDateString('pt-BR'))}</span>
                </div>
              </div>
            </div>
          `;
        }
      } else {
        // Multiple items
        markerColor = '#4f46e5'; // Indigo for multiple
        marker = L.marker([lat, lng], {
          icon: L.divIcon({
            className: 'custom-multi-marker',
            html: renderToString(
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                border: '2px solid white',
                backgroundColor: '#4f46e5',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 6px rgba(0,0,0,0.4)',
                position: 'relative'
              }}>
                <Layers size={18} />
                <span style={{
                  position: 'absolute',
                  top: '-8px',
                  right: '-8px',
                  backgroundColor: '#ef4444',
                  color: 'white',
                  borderRadius: '10px',
                  padding: '2px 6px',
                  fontSize: '10px',
                  fontWeight: 'black',
                  border: '1px solid white'
                }}>
                  {items.length}
                </span>
              </div>
            ),
            iconSize: [32, 32],
            iconAnchor: [16, 16]
          })
        });

        tooltipContent = `
          <div class="p-2 min-w-[260px] font-sans">
            <div class="border-b border-slate-200 pb-1 mb-1">
              <div class="text-[10px] font-black text-indigo-600 uppercase tracking-wider">Múltiplos Documentos (${items.length})</div>
              <div class="text-sm font-black text-slate-900 mt-1">${escapeHtml(municipio)}</div>
            </div>
            <div class="space-y-2 mt-2 max-h-[240px] overflow-y-auto pr-1">
              ${items.map(item => {
                if (item.type === 'parecer') {
                  const p = item.data;
                  return `
                    <div class="p-1.5 rounded bg-blue-50 border border-blue-100">
                      <div class="flex justify-between items-start">
                        <div class="text-[8px] font-bold text-blue-700 uppercase">Parecer (${escapeHtml(p.status)})</div>
                        <div class="text-[8px] text-slate-400">${escapeHtml(new Date(p.data).toLocaleDateString('pt-BR'))}</div>
                      </div>
                      <div class="text-[10px] font-black text-slate-900 leading-tight mt-0.5">${escapeHtml(p.razaoSocial)}</div>
                    </div>
                  `;
                } else if (item.type === 'no-obligatory') {
                  const n = item.data;
                  return `
                    <div class="p-1.5 rounded bg-emerald-50 border border-emerald-100">
                      <div class="flex justify-between items-start">
                        <div class="text-[8px] font-bold text-emerald-700 uppercase">Não Obrigatoriedade (${escapeHtml(n.status)})</div>
                      </div>
                      <div class="text-[10px] font-black text-slate-900 leading-tight mt-0.5">${escapeHtml(n.empreendedor)}</div>
                    </div>
                  `;
                } else if (item.type === 'rejection') {
                  const r = item.data;
                  return `
                    <div class="p-1.5 rounded bg-red-50 border border-red-100">
                      <div class="flex justify-between items-start">
                        <div class="text-[8px] font-bold text-red-700 uppercase">Indeferimento (${escapeHtml(r.status)})</div>
                      </div>
                      <div class="text-[10px] font-black text-slate-900 leading-tight mt-0.5">${escapeHtml(r.empreendedor || r.nomeEmpreendedor)}</div>
                    </div>
                  `;
                } else if (item.type === 'transferencia' as any) {
                  const t = item.data;
                  return `
                    <div class="p-1.5 rounded bg-indigo-50 border border-indigo-100">
                      <div class="flex justify-between items-start">
                        <div class="text-[8px] font-bold text-indigo-700 uppercase">Transferência (${escapeHtml(t.status)})</div>
                      </div>
                      <div class="text-[10px] font-black text-slate-900 leading-tight mt-0.5">${escapeHtml(t.novoProprietario)}</div>
                    </div>
                  `;
                } else if (item.type === 'oficio') {
                  const o = item.data;
                  return `
                    <div class="p-1.5 rounded bg-amber-50 border border-amber-100">
                      <div class="flex justify-between items-start">
                        <div class="text-[8px] font-bold text-amber-700 uppercase">Ofício (${escapeHtml(o.status === 'Rascunho' ? 'Rascunho' : (o.situacaoPendencia || 'Pendente'))})</div>
                        <div class="text-[8px] text-slate-400">${escapeHtml(new Date(o.data).toLocaleDateString('pt-BR'))}</div>
                      </div>
                      <div class="text-[10px] font-black text-slate-900 leading-tight mt-0.5">${escapeHtml(o.interessado)}</div>
                    </div>
                  `;
                }
              }).join('')}
            </div>
          </div>
        `;
      }

      if (!marker) return;

      (marker as any).originalColor = markerColor;
      (marker as any).legendTypes = Array.from(legendTypes);
      (marker as any).municipio = municipio;
      marker.bindTooltip(tooltipContent, {
        direction: 'top',
        className: 'custom-map-tooltip',
        sticky: true
      });

      marker.addTo(map);
      allMarkersRef.current.push(marker);
      
      if (!markersRef.current[municipio]) {
        markersRef.current[municipio] = [];
      }
      markersRef.current[municipio].push(marker);
    });

  }, [pareceres, oficios, noObligatoriedades, indeferimentos, transferencias]);

  // Handle Hover Effects from Sidebar and Legend
  useEffect(() => {
    allMarkersRef.current.forEach(marker => {
      const muni = (marker as any).municipio;
      const types = (marker as any).legendTypes || [];
      
      let shouldHighlight = false;
      let shouldDim = false;

      const isCityMatch = hoveredCity ? muni === hoveredCity : true;
      const isTypeMatch = highlightType ? types.includes(highlightType) : true;

      if (hoveredCity || highlightType) {
        if (isCityMatch && isTypeMatch) {
          shouldHighlight = true;
        } else {
          shouldDim = true;
        }
      }

      if (marker instanceof L.CircleMarker) {
        if (shouldHighlight) {
          marker.setStyle({
            radius: 10,
            fillColor: (marker as any).originalColor,
            weight: 3,
            color: '#fff',
            fillOpacity: 1
          });
          marker.bringToFront();
        } else if (shouldDim) {
          marker.setStyle({
            radius: 4,
            fillOpacity: 0.1,
            opacity: 0.1,
            weight: 1
          });
        } else {
          marker.setStyle({
            radius: 6,
            fillColor: (marker as any).originalColor,
            color: '#000',
            weight: 1,
            opacity: 1,
            fillOpacity: 0.9
          });
        }
      } else if (marker instanceof L.Marker) {
        const element = marker.getElement();
        if (element) {
          if (shouldHighlight) {
            element.style.transform = element.style.transform.replace(/ scale\(\d+\.?\d*\)/g, '') + ' scale(1.8)';
            element.style.zIndex = '1000';
            element.style.opacity = '1';
            element.style.filter = 'drop-shadow(0 0 5px white)';
          } else if (shouldDim) {
            element.style.opacity = '0.1';
            element.style.transform = element.style.transform.replace(/ scale\(\d+\.?\d*\)/g, '') + ' scale(0.6)';
          } else {
            element.style.transform = element.style.transform.replace(/ scale\(\d+\.?\d*\)/g, '');
            element.style.zIndex = '';
            element.style.opacity = '1';
            element.style.filter = '';
          }
        }
      }
    });
  }, [hoveredCity, highlightType]);

  return <div ref={mapRef} className="w-full h-full rounded-lg z-0" />;
};

export default MTMap;
