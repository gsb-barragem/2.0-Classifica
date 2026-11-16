import React, { useContext, useEffect, useState } from 'react';
import {
  Building2,
  Database,
  ExternalLink,
  FileCheck2,
  Lock,
  Search,
  Send,
  ShieldAlert,
} from 'lucide-react';
import {
  BarragemMaster,
  EmpreendedorMaster,
  ProdutoEcossistemaResumo,
} from '../types';
import {
  getEcosystemProductsByEntity,
  searchBarragens,
  searchEmpreendedores,
  SYSTEM_LABELS,
} from '../src/services/administraService';
import { isAdministraConfigured } from '../src/lib/ecosystemClients';
import { DataContext } from '../src/contexts/DataContext';

interface EcosystemSelectorProps {
  selectedEmpreendedorId?: string;
  selectedBarragemId?: string;
  cpfCnpjFallback?: string;
  snisbFallback?: string;
  onSelectEmpreendedor?: (emp: EmpreendedorMaster) => void;
  onSelectBarragem?: (bar: BarragemMaster) => void;
  readOnly?: boolean;
}

export const EcosystemSelector: React.FC<EcosystemSelectorProps> = ({
  selectedEmpreendedorId,
  selectedBarragemId,
  cpfCnpjFallback,
  snisbFallback,
  onSelectEmpreendedor,
  onSelectBarragem,
  readOnly = false,
}) => {
  const { documents } = useContext(DataContext);
  const [empTerm, setEmpTerm] = useState('');
  const [barTerm, setBarTerm] = useState('');
  const [empreendedores, setEmpreendedores] = useState<EmpreendedorMaster[]>([]);
  const [barragens, setBarragens] = useState<BarragemMaster[]>([]);
  const [relatedProducts, setRelatedProducts] = useState<ProdutoEcossistemaResumo[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const administraReady = isAdministraConfigured();

  useEffect(() => {
    if (!administraReady || readOnly) return;
    const timer = setTimeout(async () => {
      if (empTerm.trim().length < 2) {
        setEmpreendedores([]);
        return;
      }
      const res = await searchEmpreendedores(empTerm);
      setEmpreendedores(res.data);
    }, 300);
    return () => clearTimeout(timer);
  }, [empTerm, administraReady, readOnly]);

  useEffect(() => {
    if (!administraReady || readOnly) return;
    const timer = setTimeout(async () => {
      if (barTerm.trim().length < 2 && !selectedEmpreendedorId) {
        setBarragens([]);
        return;
      }
      const res = await searchBarragens(barTerm, selectedEmpreendedorId);
      setBarragens(res.data);
    }, 300);
    return () => clearTimeout(timer);
  }, [barTerm, selectedEmpreendedorId, administraReady, readOnly]);

  useEffect(() => {
    if (!selectedEmpreendedorId && !selectedBarragemId && !cpfCnpjFallback && !snisbFallback) {
      setRelatedProducts([]);
      return;
    }
    let alive = true;
    setLoadingProducts(true);
    void getEcosystemProductsByEntity({
      empreendedorId: selectedEmpreendedorId,
      cpfCnpj: cpfCnpjFallback,
      barragemId: selectedBarragemId,
      snisb: snisbFallback,
      localDocuments: documents,
    })
      .then((res) => {
        if (alive) setRelatedProducts(res.products);
      })
      .finally(() => {
        if (alive) setLoadingProducts(false);
      });
    return () => {
      alive = false;
    };
  }, [selectedEmpreendedorId, selectedBarragemId, cpfCnpjFallback, snisbFallback, documents]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Database size={16} className="text-emerald-600" />
          <span className="text-xs font-black uppercase tracking-wider text-slate-700">
            Vínculo Padrão — Administra Barragens
          </span>
        </div>
        <span
          className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
            administraReady
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-amber-100 text-amber-800'
          }`}
        >
          {administraReady ? 'Base Administra Conectada' : 'Aguardando chaves Administra'}
        </span>
      </div>

      {!readOnly && administraReady && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              Buscar Empreendedor Padronizado (CPF/CNPJ ou Nome)
            </label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={empTerm}
                onChange={(e) => setEmpTerm(e.target.value)}
                placeholder="Digite ao menos 2 caracteres..."
                className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            {empreendedores.length > 0 && (
              <div className="mt-1 bg-white border border-slate-200 rounded-lg shadow-md max-h-40 overflow-y-auto divide-y divide-slate-100">
                {empreendedores.map((emp) => (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => {
                      onSelectEmpreendedor?.(emp);
                      setEmpTerm(emp.razao_social);
                      setEmpreendedores([]);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-xs flex items-center justify-between gap-2"
                  >
                    <div className="truncate">
                      <span className="font-bold text-slate-800">{emp.razao_social}</span>
                      <span className="block text-[10px] text-slate-500">{emp.cpf_cnpj}</span>
                    </div>
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">
                      {SYSTEM_LABELS[emp.sistema_origem]}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              Buscar Barragem Cadastrada (SNISB, Nome ou Município)
            </label>
            <div className="relative">
              <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={barTerm}
                onChange={(e) => setBarTerm(e.target.value)}
                placeholder="Digite SNISB ou nome da barragem..."
                className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            {barragens.length > 0 && (
              <div className="mt-1 bg-white border border-slate-200 rounded-lg shadow-md max-h-40 overflow-y-auto divide-y divide-slate-100">
                {barragens.map((bar) => (
                  <button
                    key={bar.id}
                    type="button"
                    onClick={() => {
                      onSelectBarragem?.(bar);
                      setBarTerm(bar.nome);
                      setBarragens([]);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-xs flex items-center justify-between gap-2"
                  >
                    <div className="truncate">
                      <span className="font-bold text-slate-800">{bar.nome}</span>
                      <span className="block text-[10px] text-slate-500">
                        {bar.snisb ? `SNISB: ${bar.snisb} • ` : ''}
                        {bar.municipio}
                      </span>
                    </div>
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">
                      {SYSTEM_LABELS[bar.sistema_origem]}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {(loadingProducts || relatedProducts.length > 0) && (
        <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-600">
            <FileCheck2 size={14} className="text-blue-600" />
            Produtos identificados no Ecossistema CSB ({relatedProducts.length})
          </div>
          {loadingProducts ? (
            <p className="text-xs text-slate-400">Consultando Classifica, Notifica e Fiscaliza...</p>
          ) : (
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {relatedProducts.map((p) => (
                <div
                  key={`${p.sistema_origem}-${p.id}`}
                  className="flex items-center justify-between text-xs bg-slate-50 px-3 py-2 rounded-lg border border-slate-100"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[9px] font-black uppercase shrink-0">
                      {SYSTEM_LABELS[p.sistema_origem]}
                    </span>
                    <span className="font-bold text-slate-700 truncate">
                      {p.tipo_produto} {p.numero_documento ? `(${p.numero_documento})` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-[10px] text-slate-500">
                    <span>{p.status || '—'}</span>
                    {p.sistema_origem !== 'CLASSIFICA_CSB' && (
                      <span title="Somente leitura — gerenciado pelo sistema de origem" className="text-amber-600">
                        <Lock size={12} />
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!administraReady && (
        <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
          <ShieldAlert size={13} className="text-amber-600 shrink-0" />
          Os produtos salvos aqui permanecem no banco do Classifica CSB e serão vinculados ao Administra Barragens assim que as chaves de integração forem configuradas.
        </p>
      )}
    </div>
  );
};
