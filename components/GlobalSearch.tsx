
import React, { useState, useContext, useMemo, useEffect, useRef } from 'react';
import { Search, X, FileText, User, Building2, Calendar, ArrowRight, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DataContext, AppDocument } from '../src/contexts/DataContext';

interface GlobalSearchProps {
  onNavigate: (view: any, doc: AppDocument | null, viewOnly: boolean) => void;
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({ onNavigate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { documents, loading } = useContext(DataContext);
  const searchRef = useRef<HTMLDivElement>(null);

  // Close search on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Handle ESC key
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const results = useMemo(() => {
    if (!query.trim() || query.length < 2) return [];

    const searchTerm = query.toLowerCase();

    return documents.filter(doc => {
      // Helper to check fields
      const check = (val?: string | null) => val?.toLowerCase().includes(searchTerm);

      // Common fields across types
      const protocolo = (doc as any).protocolo || '';
      const processo = (doc as any).processo || (doc as any).numProcesso || (doc as any).nProcesso || '';
      const empreendedor = (doc as any).interessado || (doc as any).razaoSocial || (doc as any).empreendedor || (doc as any).nomeEmpreendedor || (doc as any).novoProprietario || (doc as any).antigoProprietario || '';
      const docIdent = (doc as any).cpfCnpj || (doc as any).novoDoc || (doc as any).antigoDoc || '';

      return (
        check(protocolo) ||
        check(processo) ||
        check(empreendedor) ||
        check(docIdent) ||
        check(doc.tipo_documento)
      );
    }).slice(0, 10); // Limit results for performance and UI
  }, [query, documents]);

  const handleSelect = (doc: AppDocument) => {
    let view: any = 'dashboard';
    if (doc.tipo_documento === 'Parecer Técnico') view = 'form';
    else if (doc.tipo_documento === 'Ofício de Pendências') view = 'oficio';
    else if (doc.tipo_documento === 'Não Obrigatoriedade') view = 'no-obligatory';
    else if (doc.tipo_documento === 'Indeferimento') view = 'rejection';
    else if (doc.tipo_documento === 'Transferência de Titularidade') view = 'transfer';

    onNavigate(view, doc, true);
    setIsOpen(false);
    setQuery('');
  };

  const getDocIcon = (type: string) => {
    switch (type) {
      case 'Parecer Técnico': return <FileText className="text-emerald-500" size={16} />;
      case 'Ofício de Pendências': return <FileText className="text-blue-500" size={16} />;
      case 'Não Obrigatoriedade': return <FileText className="text-amber-500" size={16} />;
      case 'Indeferimento': return <X className="text-rose-500" size={16} />;
      case 'Transferência de Titularidade': return <Building2 className="text-purple-500" size={16} />;
      default: return <FileText className="text-slate-500" size={16} />;
    }
  };

  const formatDocId = (doc: any) => {
    return doc.protocolo || doc.processo || doc.numProcesso || doc.nProcesso || 'S/N';
  };

  const formatOwner = (doc: any) => {
    return doc.interessado || doc.razaoSocial || doc.empreendedor || doc.nomeEmpreendedor || doc.novoProprietario || 'Nâo informado';
  };

  return (
    <div className="relative" ref={searchRef}>
      <div className="flex items-center">
        <div className={`
          flex items-center bg-slate-100 rounded-2xl px-4 py-2 transition-all duration-300 border border-transparent
          ${isOpen ? 'w-64 md:w-80 bg-white border-emerald-500/30 shadow-lg ring-4 ring-emerald-500/5' : 'w-10 md:w-48 overflow-hidden'}
        `}>
          <Search 
            size={18} 
            className={`shrink-0 transition-colors ${isOpen ? 'text-emerald-500' : 'text-slate-400'}`} 
            onClick={() => setIsOpen(true)}
          />
          <input 
            type="text"
            placeholder="Buscar documentos..."
            className={`
              ml-3 bg-transparent border-none focus:outline-none text-sm font-medium text-slate-700 w-full
              ${!isOpen && 'hidden md:block'}
            `}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsOpen(true)}
          />
          {isOpen && query && (
            <button onClick={() => setQuery('')} className="ml-2 text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {isOpen && query.length >= 2 && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            className="absolute top-full mt-2 left-0 md:left-auto md:right-0 w-[calc(100vw-2rem)] md:w-[450px] bg-white rounded-[2rem] shadow-2xl border border-slate-200 overflow-hidden z-[100]"
          >
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Resultados da busca</span>
              <span className="text-[10px] font-bold text-slate-400">{results.length} encontrados</span>
            </div>

            <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
              {loading ? (
                <div className="p-12 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="animate-spin text-emerald-500" size={24} />
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sincronizando banco...</span>
                </div>
              ) : results.length > 0 ? (
                <div className="p-2 space-y-1">
                  {results.map((doc) => (
                    <button
                      key={doc.id}
                      onClick={() => handleSelect(doc)}
                      className="w-full text-left p-4 rounded-2xl hover:bg-slate-50 transition-all group flex items-start gap-4 border border-transparent hover:border-emerald-100"
                    >
                      <div className="mt-1 p-2 bg-slate-100 rounded-xl group-hover:bg-white transition-colors group-hover:shadow-sm">
                        {getDocIcon(doc.tipo_documento)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                            {doc.tipo_documento}
                          </span>
                          {doc.status === 'Concluído' ? (
                            <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded uppercase">Finalizado</span>
                          ) : (
                            <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded uppercase">Rascunho</span>
                          )}
                        </div>
                        <h4 className="text-sm font-black text-slate-900 truncate group-hover:text-emerald-600 transition-colors">
                          {formatDocId(doc)}
                        </h4>
                        <div className="flex items-center gap-3 mt-1 text-slate-500">
                          <div className="flex items-center gap-1 min-w-0">
                            <User size={12} className="shrink-0" />
                            <span className="text-[10px] font-bold truncate max-w-[150px]">{formatOwner(doc)}</span>
                          </div>
                          {(doc as any).data && (
                            <div className="flex items-center gap-1 shrink-0">
                              <Calendar size={12} className="shrink-0" />
                              <span className="text-[10px] font-bold">{new Date((doc as any).data).toLocaleDateString('pt-BR')}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="self-center opacity-0 group-hover:opacity-100 transition-opacity translate-x-2 group-hover:translate-x-0">
                        <ArrowRight size={16} className="text-emerald-500" />
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Search className="text-slate-200" size={32} />
                  </div>
                  <p className="text-sm font-bold text-slate-900 mb-1 tracking-tight">Nenhum resultado encontrado</p>
                  <p className="text-xs font-medium text-slate-400">Verifique os dados informados e tente novamente.</p>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
                Pressione <kbd className="bg-white px-1.5 py-0.5 rounded border border-slate-200 shadow-sm mx-1">ESC</kbd> para fechar
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
