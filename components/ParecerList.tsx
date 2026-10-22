
import React, { useState, useMemo, useRef, useEffect, useContext } from 'react';
import { Search, ChevronDown, ChevronUp, Check, Eye, Edit, Trash2, Database, Filter, ArrowUpDown, ArrowUp, ArrowDown, Loader2, ChevronLeft, ChevronRight, X, Plus, FileText, Download, FileWarning } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import ConfirmModal from './ui/ConfirmModal';
import MultiSelect from './ui/MultiSelect';
import { formatToGMS } from './MTMap';
import { OPS_MUNICIPIOS, OPS_ANALISTA, OPS_RESPONSAVEL_TECNICO } from '../constants';
import { RiscoEnum, DanoEnum, ParecerData, OficioData, NoObligatoryData } from '../types';
import { DataContext, AppDocument } from '../src/contexts/DataContext';
import { AuthContext } from '../src/contexts/AuthContext';
import { logActivity } from '../src/lib/auditService';

// --- MultiSelect Component (Reused) ---
// Removed local MultiSelect, using imported one

interface ParecerListProps {
  onEditParecer?: (parecer: ParecerData) => void;
  onViewParecer?: (parecer: ParecerData) => void;
  onNewParecer?: () => void;
  onNewOficio?: () => void;
  onNewIndeferimento?: () => void;
}

const ParecerList: React.FC<ParecerListProps> = ({ 
  onEditParecer, 
  onViewParecer,
  onNewParecer,
  onNewOficio,
  onNewIndeferimento
}) => {
  const { documents: pareceres, loading, refreshData, deleteParecer, deleteOficio, deleteNoObligatoriedade, deleteIndeferimento, deleteTransferencia } = useContext(DataContext);
  const { currentUser } = useContext(AuthContext);
  const [filters, setFilters] = useState({
    municipios: [] as string[],
    dpa: [] as string[],
    cri: [] as string[],
    pnsb: [] as string[],
    analistas: [] as string[],
    rt: [] as string[],
    status: [] as string[],
    classificacao: [] as string[],
    tipo: [] as string[],
    mesAno: [] as string[],
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  
  // Confirm Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant: 'danger' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    variant: 'warning'
  });

  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({
    key: 'data',
    direction: 'desc',
  });

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Reset to page 1 when filters or search change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters, searchTerm]);

  // Clear Filters
  const clearFilters = () => {
    setFilters({
      municipios: [], dpa: [], cri: [], pnsb: [], analistas: [], rt: [], status: [], classificacao: [], tipo: [], mesAno: []
    });
    setSortConfig({ key: 'data', direction: 'desc' });
    setCurrentPage(1);
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' | null = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    } else if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = null;
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: string) => {
    if (sortConfig.key !== key || !sortConfig.direction) return <ArrowUpDown size={14} className="text-slate-300" />;
    return sortConfig.direction === 'asc' ? <ArrowUp size={14} className="text-emerald-500" /> : <ArrowDown size={14} className="text-emerald-500" />;
  };

    // Derived Filtered and Sorted Data
    const filteredData = useMemo(() => {
        const relevantDocs = pareceres.filter(doc => 
            doc.tipo_documento === 'Parecer Técnico' || 
            doc.tipo_documento === 'Ofício de Pendências' ||
            doc.tipo_documento === 'Não Obrigatoriedade' ||
            doc.tipo_documento === 'Indeferimento' ||
            doc.tipo_documento === 'Transferência de Titularidade'
        );

        let result = relevantDocs.filter(item => {
            // 1. Text Search
            if (searchTerm) {
                const lower = searchTerm.toLowerCase();
                let matches = false;
                
                if (item.tipo_documento === 'Parecer Técnico') {
                  const p = item as ParecerData;
                  matches = (p.protocolo || '').toLowerCase().includes(lower) || 
                            (p.analista || '').toLowerCase().includes(lower) ||
                            (p.razaoSocial || '').toLowerCase().includes(lower);
                } else if (item.tipo_documento === 'Ofício de Pendências') {
                  const o = item as OficioData;
                  matches = (o.protocolo || '').toLowerCase().includes(lower) || 
                            (o.analista || '').toLowerCase().includes(lower) ||
                            (o.interessado || '').toLowerCase().includes(lower);
                } else if (item.tipo_documento === 'Não Obrigatoriedade') {
                  const n = item as NoObligatoryData;
                  matches = (n.processo || '').toLowerCase().includes(lower) || 
                            (n.analista || '').toLowerCase().includes(lower) ||
                            (n.empreendedor || '').toLowerCase().includes(lower);
                } else if (item.tipo_documento === 'Indeferimento') {
                  const i = item as any;
                  matches = (i.protocolo || '').toLowerCase().includes(lower) || 
                            (i.analista || '').toLowerCase().includes(lower) ||
                            (i.empreendedor || '').toLowerCase().includes(lower);
                } else if (item.tipo_documento === 'Transferência de Titularidade') {
                  const t = item as any;
                  matches = (t.protocolo || t.nProcesso || '').toLowerCase().includes(lower) || 
                            (t.analista || '').toLowerCase().includes(lower) ||
                            (t.novoProprietario || t.empreendedor || '').toLowerCase().includes(lower);
                }
                
                if (!matches) return false;
            }

            // 2. Filters
            // Safe access to municipio
            const itemMunicipio = (item as any).municipio || "";
            if (filters.municipios.length > 0 && !filters.municipios.includes(itemMunicipio)) return false;
            
            // Classification filters only apply to Parecer Técnico
            if (item.tipo_documento === 'Parecer Técnico') {
                const p = item as ParecerData;
                const classificacao = (p.classificacao || {}) as any;

                if (filters.dpa.length > 0 && !filters.dpa.includes(classificacao.dpaClass || "")) return false;
                if (filters.cri.length > 0 && !filters.cri.includes(classificacao.risco || "")) return false;
                
                if (filters.classificacao.length > 0) {
                    let itemClass = "Não Enquadra";
                    const resumo = classificacao.resumo || "";
                    if (resumo.includes("CLASSE A")) itemClass = "Classe A";
                    else if (resumo.includes("CLASSE B")) itemClass = "Classe B";
                    else if (resumo.includes("CLASSE C")) itemClass = "Classe C";
                    else if (resumo.includes("CLASSE D")) itemClass = "Classe D";
                    
                    if (!filters.classificacao.includes(itemClass)) return false;
                }

                if (filters.pnsb.length > 0) {
                    const resumo = classificacao.resumo || "";
                    const isEnquadrada = !resumo.includes("NÃO SE ENQUADRA");
                    const statusStr = isEnquadrada ? "Enquadrada na PNSB" : "Não enquadrada na PNSB";
                    if (!filters.pnsb.includes(statusStr)) return false;
                }
            } else if (item.tipo_documento === 'Ofício de Pendências' || item.tipo_documento === 'Não Obrigatoriedade' || item.tipo_documento === 'Transferência de Titularidade' || item.tipo_documento === 'Indeferimento') {
                // If any Parecer-specific filters are active, exclude them
                if (filters.dpa.length > 0 || filters.cri.length > 0 || filters.classificacao.length > 0 || filters.pnsb.length > 0) {
                    return false;
                }
            }

      if (filters.analistas.length > 0 && !filters.analistas.includes(item.analista || "")) return false;
      
      if (filters.rt.length > 0) {
        let itemRTNames: string[] = [];
        if (item.tipo_documento === 'Parecer Técnico') {
          itemRTNames = (item as ParecerData).responsaveisTecnicos?.map(rt => rt.nome) || [];
        } else if (item.tipo_documento === 'Ofício de Pendências') {
          itemRTNames = (item as OficioData).responsaveisTecnicos?.map(rt => rt.nome) || [];
        } else if (item.tipo_documento === 'Não Obrigatoriedade') {
          const n = item as NoObligatoryData;
          itemRTNames = n.data?.introduction?.artAtividades?.map((art: any) => art.respTecnico) || [];
        } else if (item.tipo_documento === 'Indeferimento') {
          const i = item as any;
          itemRTNames = i.data?.introduction?.rtAtividades?.map((rt: any) => rt.nome) || [];
        } else if (item.tipo_documento === 'Transferência de Titularidade') {
          const t = item as any;
          itemRTNames = t.responsavelTecnico ? [t.responsavelTecnico] : [];
        }
        const hasRT = itemRTNames.some(name => filters.rt.includes(name));
        if (!hasRT) return false;
      }

      if (filters.status.length > 0 && !filters.status.includes(item.status || "")) return false;
      if (filters.tipo.length > 0 && !filters.tipo.includes(item.tipo_documento)) return false;

      if (filters.mesAno.length > 0) {
        const dateStr = item.tipo_documento === 'Parecer Técnico' 
          ? (item as ParecerData).data 
          : (item as any).created_at;
          
        if (!dateStr) return false;
        
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          const month = (date.getMonth() + 1).toString().padStart(2, '0');
          const year = date.getFullYear();
          const itemMesAno = `${month}/${year}`;
          if (!filters.mesAno.includes(itemMesAno)) return false;
        } else {
          return false;
        }
      }

      return true;
    });

    // 3. Sorting
    if (sortConfig.key && sortConfig.direction) {
      result.sort((a: any, b: any) => {
        let aValue = a[sortConfig.key] || "";
        let bValue = b[sortConfig.key] || "";

        // Handle nested or special keys
        if (sortConfig.key === 'resumo') {
          aValue = a.classificacao?.resumo || "";
          bValue = b.classificacao?.resumo || "";
        }

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [filters, searchTerm, sortConfig]);

  // Paginated Data
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, currentPage, itemsPerPage]);

  const handleExportExcel = () => {
    if (filteredData.length === 0) {
      toast.error('Nenhum documento para exportar.');
      return;
    }

    // Define exhaustive columns covering both Parecer and Oficio
    const columns = [
      { header: 'Tipo de Documento', key: 'tipo_documento' },
      { header: 'Protocolo', key: 'protocolo' },
      { header: 'Status', key: 'status' },
      { header: 'Data de Emissão', key: 'data' },
      { header: 'Analista', key: 'analista' },
      { header: 'Interessado / Razão Social', getter: (d: any) => {
          if (d.tipo_documento === 'Parecer Técnico') return d.razaoSocial;
          if (d.tipo_documento === 'Ofício de Pendências') return d.interessado;
          if (d.tipo_documento === 'Não Obrigatoriedade') return d.empreendedor;
          if (d.tipo_documento === 'Transferência de Titularidade') return d.novoProprietario;
          if (d.tipo_documento === 'Indeferimento') return d.empreendedor;
          return '';
      }},
      { header: 'CPF / CNPJ', key: 'cpfCnpj' },
      { header: 'Município', key: 'municipio' },
      { header: 'Localização / Endereço', key: 'localizacao' },
      { header: 'Nº CAR', key: 'numCAR' },
      { header: 'Finalidade', key: 'finalidade' },
      { header: 'Situação do Empreendimento', key: 'situacaoEmpreendimento' },
      { header: 'Curso d\'Água', key: 'cursoAgua' },
      { header: 'Sub-bacia', key: 'subBacia' },
      { header: 'Área da Bacia (km²)', key: 'areaBacia' },
      { header: 'Índice Pluviosidade (mm)', key: 'indicePluviosidade' },
      { header: 'Responsáveis Técnicos', getter: (d: any) => d.responsaveisTecnicos?.map((rt: any) => rt.nome + (rt.art ? ` (ART: ${rt.art})` : '')).join('; ') || '' },
      
      // Barramento Principal
      { header: 'Barragem Nome', getter: (d: any) => d.barragemPrincipal?.nome || '' },
      { header: 'SNISB', getter: (d: any) => d.barragemPrincipal?.snisb || '' },
      { header: 'Latitude (GMS)', getter: (d: any) => formatToGMS(d.tipo_documento === 'Parecer Técnico' ? d.barragemPrincipal?.lat : d.lat) },
      { header: 'Longitude (GMS)', getter: (d: any) => formatToGMS(d.tipo_documento === 'Parecer Técnico' ? d.barragemPrincipal?.long : d.long) },
      { header: 'Latitude (Decimal)', getter: (d: any) => {
        if (d.tipo_documento === 'Parecer Técnico') return d.barragemPrincipal?.lat;
        if (d.tipo_documento === 'Não Obrigatoriedade') return d.lat;
        if (d.tipo_documento === 'Transferência de Titularidade') return d.latGMS;
        return d.lat;
      }},
      { header: 'Longitude (Decimal)', getter: (d: any) => {
        if (d.tipo_documento === 'Parecer Técnico') return d.barragemPrincipal?.long;
        if (d.tipo_documento === 'Não Obrigatoriedade') return d.long;
        if (d.tipo_documento === 'Transferência de Titularidade') return d.longGMS;
        return d.long;
      }},
      { header: 'Altura Máxima (m)', getter: (d: any) => {
        if (d.tipo_documento === 'Parecer Técnico') return d.barragemPrincipal?.alturaMaxima || '';
        if (d.tipo_documento === 'Transferência de Titularidade') return d.alturaMaxima || '';
        return '';
      }},
      { header: 'Comprimento Coroamento (m)', getter: (d: any) => d.barragemPrincipal?.comprimentoCoroamento || '' },
      { header: 'Largura Coroamento (m)', getter: (d: any) => d.barragemPrincipal?.larguraCoroamento || '' },
      { header: 'Volume NMM (m³)', getter: (d: any) => {
        if (d.tipo_documento === 'Parecer Técnico') return d.barragemPrincipal?.volumeNMM || '';
        if (d.tipo_documento === 'Transferência de Titularidade') return d.volumeArmazenado || '';
        return '';
      }},
      { header: 'Tipo Estrutural', getter: (d: any) => d.barragemPrincipal?.tipoEstrutural || '' },
      { header: 'Tipo Fundação', getter: (d: any) => d.barragemPrincipal?.tipoFundacao || '' },
      
      // Classificação
      { header: 'DPA Categoria', getter: (d: any) => {
        if (d.tipo_documento === 'Parecer Técnico') return d.classificacao?.dpaClass || '';
        if (d.tipo_documento === 'Transferência de Titularidade') return d.dpa || '';
        return '';
      }},
      { header: 'CRI Categoria', getter: (d: any) => {
        if (d.tipo_documento === 'Parecer Técnico') return d.classificacao?.risco || '';
        if (d.tipo_documento === 'Transferência de Titularidade') return d.cri || '';
        return '';
      }},
      { header: 'Resumo Classificação', getter: (d: any) => d.classificacao?.resumo || '' },
      
      // Scores
      { header: 'Total DPA', getter: (d: any) => d.classificacao?.totalDpa || '' },
      { header: 'Total CT', getter: (d: any) => d.classificacao?.totalCT || '' },
      { header: 'Total EC', getter: (d: any) => d.classificacao?.totalEC || '' },
      { header: 'Total PS', getter: (d: any) => d.classificacao?.totalPS || '' },
      { header: 'Valor Geral CRI', getter: (d: any) => d.classificacao?.valGeral || '' },
      
      // Ofício specific
      { header: 'Assunto (Ofício)', key: 'assunto' },
      { header: 'Prazo (dias)', key: 'prazo' },
      { header: 'Prorrogação Prazo (dias)', key: 'prorrogacaoPrazo' },
      { header: 'Situação Pendência', key: 'situacaoPendencia' },
      { header: 'Anotações Internas', key: 'anotacoesInternas' },
      
      // Final
      { header: 'Parecer Final', getter: (d: any) => d.parecerFinal || '' }
    ];

    // Prepare data for XLSX
    const data = filteredData.map(d => {
      const row: any = {};
      columns.forEach(col => {
        row[col.header] = col.getter ? col.getter(d) : (d as any)[col.key as string];
      });
      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Database");

    // Generate Excel file and trigger download
    XLSX.writeFile(workbook, `export_database_${new Date().toISOString().split('T')[0]}.xlsx`);
    logActivity('DOWNLOAD_DOCUMENT', { type: 'Exportação Excel', count: filteredData.length });
    toast.success('Banco de dados exportado com sucesso!');
  };

  const handleEdit = (item: AppDocument) => {
    if (item.status === 'Concluído') {
      setConfirmModal({
        isOpen: true,
        title: `Alterar ${item.tipo_documento} Concluído`,
        message: `Este ${item.tipo_documento.toLowerCase()} já está concluído. Deseja realmente alterá-lo? Se sim, a data de conclusão será atualizada para o momento da nova finalização.`,
        variant: 'warning',
        onConfirm: () => {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          if (item.tipo_documento === 'Parecer Técnico') {
            onEditParecer?.(item as ParecerData);
          } else {
            onEditParecer?.(item as any);
          }
        }
      });
    } else {
      onEditParecer?.(item as any);
    }
  };

  const handleDelete = async (id: string, item: AppDocument) => {
    if (!currentUser) return;

    const isAdmin = currentUser.role === 'Administrador';
    const isAuthor = item.userId === currentUser.id;

    if (!isAdmin && !isAuthor) {
      toast.error(`Você não tem permissão para excluir este ${item.tipo_documento.toLowerCase()}.`);
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: `Excluir ${item.tipo_documento}`,
      message: `Tem certeza que deseja excluir este ${item.tipo_documento.toLowerCase()}? Esta ação não pode ser desfeita.`,
      variant: 'danger',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        let result;
        if (item.tipo_documento === 'Parecer Técnico') {
          result = await deleteParecer(id);
        } else if (item.tipo_documento === 'Ofício de Pendências') {
          result = await deleteOficio(id);
        } else if (item.tipo_documento === 'Indeferimento') {
          result = await deleteIndeferimento(id);
        } else if (item.tipo_documento === 'Transferência de Titularidade') {
          result = await deleteTransferencia(id);
        } else {
          result = await deleteNoObligatoriedade(id);
        }
          
        if (result.success) {
          if (item.tipo_documento === 'Parecer Técnico') {
            await logActivity('DELETE_OPINION', { id, doc: item.protocolo, interessado: (item as any).razaoSocial });
          } else if (item.tipo_documento === 'Ofício de Pendências') {
            await logActivity('DELETE_OFICIO', { id, doc: item.protocolo, interessado: (item as any).interessado });
          } else if (item.tipo_documento === 'Indeferimento') {
            await logActivity('DELETE_NOTIFICACAO', { id, type: 'Indeferimento', doc: (item as any).protocolo });
          } else if (item.tipo_documento === 'Transferência de Titularidade') {
            await logActivity('DELETE_NOTIFICACAO', { id, type: 'Transferência', doc: (item as any).protocolo || (item as any).nProcesso });
          } else {
            await logActivity('DELETE_NOTIFICACAO', { id, type: 'Não Obrigatoriedade', doc: (item as any).processo });
          }
          toast.success(`${item.tipo_documento} excluído com sucesso!`);
        } else {
          toast.error(result.message || `Erro ao excluir ${item.tipo_documento.toLowerCase()}`);
        }
      }
    });
  };

  // Generate Month/Year options from documents
  const mesAnoOptions = useMemo(() => {
    const options = new Set<string>();
    pareceres.forEach(item => {
      const dateStr = item.tipo_documento === 'Parecer Técnico' 
        ? (item as ParecerData).data 
        : (item as any).created_at;
      
      if (!dateStr) return;
      
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        options.add(`${month}/${year}`);
      }
    });
    return Array.from(options).sort((a, b) => {
      const [mA, yA] = a.split('/').map(Number);
      const [mB, yB] = b.split('/').map(Number);
      if (yA !== yB) return yB - yA;
      return mB - mA;
    });
  }, [pareceres]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
          <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Carregando dados do Supabase...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 lg:p-10 space-y-8 max-w-[1600px] mx-auto animate-fade-in bg-slate-50/50 rounded-2xl md:rounded-[3rem] my-2 md:my-4 shadow-inner border border-slate-200/50">
      {/* HEADER SECTION */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 border-b border-slate-200 pb-8">
        <div className="space-y-1 w-full lg:w-auto">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-[0.2em]">Database: Connected</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tighter">
            Repositório <span className="text-emerald-600">Digital</span>
            <span className="text-slate-300 font-light ml-3 text-xl md:text-2xl tracking-widest uppercase hidden sm:inline">// Listagem</span>
          </h1>
          <p className="text-slate-500 font-medium max-w-md text-sm md:text-base">Acesso centralizado a todos os documentos técnicos e administrativos gerados pelo sistema.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
           <div className="relative flex-1 sm:w-64 md:w-80">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
             <input 
              type="text" 
              placeholder="Filtrar por protocolo ou interessado..." 
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={handleExportExcel}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 px-4 md:px-6 py-3 rounded-xl shadow-sm transition-all font-bold whitespace-nowrap group text-xs md:text-sm"
              title="Exportar todos os dados filtrados para Excel"
            >
              <Download size={18} className="group-hover:translate-y-0.5 transition-transform" />
              Exportar Excel
            </button>
            <button
              onClick={onNewParecer}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-slate-900 hover:bg-emerald-600 text-white px-4 md:px-6 py-3 rounded-xl shadow-lg transition-all font-bold whitespace-nowrap group text-xs md:text-sm"
            >
              <Plus size={18} className="group-hover:rotate-90 transition-transform" />
              Parecer
            </button>
            <button
              onClick={onNewOficio}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-white border border-slate-200 hover:border-emerald-50 text-slate-700 hover:text-emerald-600 px-4 md:px-6 py-3 rounded-xl shadow-sm transition-all font-bold whitespace-nowrap group text-xs md:text-sm"
            >
              <FileText size={18} className="group-hover:scale-110 transition-transform" />
              Ofício
            </button>
            <button
              onClick={onNewIndeferimento}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-red-50 border border-red-100 hover:border-red-200 text-red-600 hover:text-red-700 px-4 md:px-6 py-3 rounded-xl shadow-sm transition-all font-bold whitespace-nowrap group text-xs md:text-sm"
            >
              <FileWarning size={18} className="group-hover:scale-110 transition-transform" />
              Indef.
            </button>
          </div>
        </div>
      </div>

      {/* ADVANCED FILTER BAR */}
      <div className="bg-white p-4 md:p-6 rounded-2xl shadow-md border border-slate-200 relative z-20 group hover:shadow-lg transition-shadow">
        <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity rounded-l-2xl"></div>
        <div className="flex justify-between items-center mb-6">
           <div className="flex items-center gap-2">
             <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
               <Database size={16} className="text-slate-600" />
             </div>
             <h3 className="font-bold text-slate-800 text-xs uppercase tracking-widest">Filtros Avançados</h3>
           </div>
           <div className="flex items-center gap-4">
             <button 
               onClick={() => setShowFilters(!showFilters)}
               className="lg:hidden flex items-center gap-2 text-[10px] font-bold text-emerald-600 uppercase tracking-wider bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100 transition-all active:scale-95"
             >
               {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
               {showFilters ? 'Ocultar Filtros' : 'Mostrar Filtros'}
             </button>
             <button 
               onClick={clearFilters} 
               className="text-[10px] font-bold text-slate-400 hover:text-red-500 uppercase tracking-wider transition-colors flex items-center gap-1"
             >
               <X size={12} /> <span className="hidden sm:inline">Limpar Filtros</span>
             </button>
           </div>
        </div>
        
        <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-10 gap-4 md:gap-6 ${showFilters ? 'block' : 'hidden lg:grid'}`}>
                <MultiSelect 
                    label="Municípios" 
                    options={OPS_MUNICIPIOS} 
                    selected={filters.municipios} 
                    onChange={(val) => setFilters({...filters, municipios: val})} 
                    searchable 
                />
                <MultiSelect 
                    label="Dano Potencial (DPA)" 
                    options={[DanoEnum.BAIXO, DanoEnum.MEDIO, DanoEnum.ALTO]} 
                    selected={filters.dpa} 
                    onChange={(val) => setFilters({...filters, dpa: val})} 
                />
                <MultiSelect 
                    label="Risco (CRI)" 
                    options={[RiscoEnum.BAIXO, RiscoEnum.MEDIO, RiscoEnum.ALTO]} 
                    selected={filters.cri} 
                    onChange={(val) => setFilters({...filters, cri: val})} 
                />
                <MultiSelect 
                    label="Classificação" 
                    options={['Classe A', 'Classe B', 'Classe C', 'Classe D', 'Não Enquadra']} 
                    selected={filters.classificacao} 
                    onChange={(val) => setFilters({...filters, classificacao: val})} 
                />
                <MultiSelect 
                    label="Enquadramento PNSB" 
                    options={["Enquadrada na PNSB", "Não enquadrada na PNSB"]} 
                    selected={filters.pnsb} 
                    onChange={(val) => setFilters({...filters, pnsb: val})} 
                />
                <MultiSelect 
                    label="Analista" 
                    options={OPS_ANALISTA.filter(a => a !== 'OUTRO')} 
                    selected={filters.analistas} 
                    onChange={(val) => setFilters({...filters, analistas: val})} 
                />
                <MultiSelect 
                    label="Responsável Técnico" 
                    options={OPS_RESPONSAVEL_TECNICO.filter(rt => rt !== 'OUTRO')} 
                    selected={filters.rt} 
                    onChange={(val) => setFilters({...filters, rt: val})} 
                    searchable
                />
                <MultiSelect 
                    label="Status" 
                    options={['Rascunho', 'Concluído']} 
                    selected={filters.status} 
                    onChange={(val) => setFilters({...filters, status: val})} 
                />
                <MultiSelect 
                    label="Tipo de Documento" 
                    options={['Parecer Técnico', 'Ofício de Pendências', 'Não Obrigatoriedade', 'Indeferimento', 'Transferência de Titularidade']} 
                    selected={filters.tipo} 
                    onChange={(val) => setFilters({...filters, tipo: val})} 
                />
                <MultiSelect 
                    label="Mês/Ano" 
                    options={mesAnoOptions} 
                    selected={filters.mesAno} 
                    onChange={(val) => setFilters({...filters, mesAno: val})} 
                    searchable
                />
            </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <span className="font-bold text-slate-700 text-sm">Registros encontrados: {filteredData.length}</span>
            </div>
            <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
                <table className="w-full text-left text-sm text-slate-600 min-w-[1000px] lg:min-w-0">
                    <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-xs tracking-wider border-b border-slate-200">
                    <tr>
                        <th className="px-6 py-4 cursor-pointer hover:bg-slate-200 transition-colors" onClick={() => handleSort('tipo_documento')}>
                            <div className="flex items-center gap-2">Tipo {getSortIcon('tipo_documento')}</div>
                        </th>
                        <th className="px-6 py-4 cursor-pointer hover:bg-slate-200 transition-colors" onClick={() => handleSort('protocolo')}>
                            <div className="flex items-center gap-2">Protocolo {getSortIcon('protocolo')}</div>
                        </th>
                        <th className="px-6 py-4 cursor-pointer hover:bg-slate-200 transition-colors" onClick={() => handleSort('razaoSocial')}>
                            <div className="flex items-center gap-2">Empreendedor / Local {getSortIcon('razaoSocial')}</div>
                        </th>
                        <th className="px-6 py-4 cursor-pointer hover:bg-slate-200 transition-colors hidden md:table-cell" onClick={() => handleSort('analista')}>
                            <div className="flex items-center gap-2">Analista {getSortIcon('analista')}</div>
                        </th>
                        <th className="px-6 py-4 cursor-pointer hover:bg-slate-200 transition-colors hidden lg:table-cell" onClick={() => handleSort('data')}>
                            <div className="flex items-center gap-2">Data {getSortIcon('data')}</div>
                        </th>
                        <th className="px-6 py-4 cursor-pointer hover:bg-slate-200 transition-colors hidden xl:table-cell" onClick={() => handleSort('dataConclusao')}>
                            <div className="flex items-center gap-2">Conclusão {getSortIcon('dataConclusao')}</div>
                        </th>
                        <th className="px-6 py-4 text-center cursor-pointer hover:bg-slate-200 transition-colors hidden sm:table-cell" onClick={() => handleSort('resumo')}>
                            <div className="flex items-center justify-center gap-2">Classificação {getSortIcon('resumo')}</div>
                        </th>
                        <th className="px-6 py-4 text-center hidden xl:table-cell">Indicadores</th>
                        <th className="px-6 py-4 text-center cursor-pointer hover:bg-slate-200 transition-colors" onClick={() => handleSort('status')}>
                            <div className="flex items-center justify-center gap-2">Status {getSortIcon('status')}</div>
                        </th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                    {paginatedData.length > 0 ? (
                        paginatedData.map((item) => {
                            const isParecer = item.tipo_documento === 'Parecer Técnico';
                            const isOficio = item.tipo_documento === 'Ofício de Pendências';
                            const isNoObligatory = item.tipo_documento === 'Não Obrigatoriedade';
                            const isRejection = item.tipo_documento === 'Indeferimento';
                            const isTransfer = item.tipo_documento === 'Transferência de Titularidade';
                            const p = isParecer ? item as ParecerData : null;
                            const o = isOficio ? item as OficioData : null;
                            const n = isNoObligatory ? item as NoObligatoryData : null;
                            const reject = isRejection ? item as any : null;
                            const trans = isTransfer ? item as any : null;
                            
                            return (
                                <tr 
                                    key={`${item.tipo_documento}-${item.id}`} 
                                    className="hover:bg-emerald-100/50 transition-all duration-200 group cursor-pointer hover:shadow-[inset_12px_0_0_0_#10b981] relative z-10"
                                >
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col gap-2">
                                            <div className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-bold uppercase w-fit ${
                                                isParecer ? 'bg-blue-50 text-blue-700 border border-blue-100' : 
                                                isOficio ? 'bg-purple-50 text-purple-700 border border-purple-100' :
                                                isRejection ? 'bg-red-50 text-red-700 border border-red-100' :
                                                isTransfer ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' :
                                                'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                            }`}>
                                                {isParecer ? 'Parecer' : isOficio ? 'Ofício' : isRejection ? 'Indef.' : isTransfer ? 'Transf.' : 'Não Obri.'}
                                            </div>
                                            
                                            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button 
                                                    className="p-1.5 bg-white border border-slate-200 text-slate-400 hover:text-emerald-600 hover:border-emerald-300 rounded-lg transition-all shadow-sm" 
                                                    title="Visualizar"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onViewParecer?.(item as any);
                                                    }}
                                                >
                                                    <Eye size={12} />
                                                </button>
                                                
                                                {(currentUser?.role === 'Administrador' || item.userId === currentUser?.id) && (
                                                    <button 
                                                        className="p-1.5 bg-white border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-300 rounded-lg transition-all shadow-sm" 
                                                        title="Editar"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleEdit(item);
                                                        }}
                                                    >
                                                        <Edit size={12} />
                                                    </button>
                                                )}
                                                
                                                {(currentUser?.role === 'Administrador' || item.userId === currentUser?.id) && (
                                                    <button 
                                                        className="p-1.5 bg-white border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-300 rounded-lg transition-all shadow-sm" 
                                                        title="Excluir"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            item.id && handleDelete(item.id, item);
                                                        }}
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                        <td className="px-6 py-4">
                            <div className="font-bold text-slate-800 group-hover:text-emerald-900 transition-colors">
                                {isNoObligatory ? n?.processo : isRejection ? reject?.protocolo : isTransfer ? trans?.protocolo || trans?.nProcesso : item.protocolo}
                            </div>
                        </td>
                        <td className="px-6 py-4">
                            <div className="font-medium text-slate-800 group-hover:text-emerald-900 truncate max-w-[200px] transition-colors" title={isParecer ? p?.razaoSocial : isOficio ? o?.interessado : isNoObligatory ? n?.empreendedor : isTransfer ? trans?.novoProprietario : reject?.empreendedor}>
                                {isParecer ? p?.razaoSocial : isOficio ? o?.interessado : isNoObligatory ? n?.empreendedor : isTransfer ? trans?.novoProprietario : reject?.empreendedor}
                            </div>
                            <div className="text-[10px] font-bold text-slate-400 mt-0.5">
                                {isParecer ? p?.cpfCnpj : isOficio ? (o as any).cpfCnpj : isNoObligatory ? (n as any).data?.introduction?.cpfCnpj : isTransfer ? trans?.novoDoc : reject?.cpfCnpj || '-'}
                            </div>
                            <div className="text-xs text-slate-500 group-hover:text-emerald-700 mt-0.5 flex items-center gap-1 transition-colors">
                                <span className="truncate max-w-[150px]">{item.municipio || 'SEMA/MT'}</span>
                            </div>
                        </td>
                            <td className="px-6 py-4 hidden md:table-cell">
                                <div className="truncate max-w-[150px] group-hover:text-emerald-900 transition-colors" title={item.analista}>{item.analista}</div>
                            </td>
                              <td className="px-6 py-4 hidden lg:table-cell">
                                <div className="text-slate-600 group-hover:text-emerald-800 transition-colors">
                                    {isParecer && item.data ? new Date(item.data).toLocaleDateString('pt-BR') : 
                                     isOficio && item.data ? new Date(item.data).toLocaleDateString('pt-BR') :
                                     (isNoObligatory || isRejection || isTransfer) && (item as any)?.created_at ? new Date((item as any).created_at).toLocaleDateString('pt-BR') : '---'}
                                </div>
                            </td>
                              <td className="px-6 py-4 hidden xl:table-cell">
                                <div className="text-slate-600 group-hover:text-emerald-800 transition-colors">
                                    {isParecer && p?.dataConclusao ? new Date(p.dataConclusao).toLocaleDateString('pt-BR') : 
                                     (isNoObligatory || isRejection || isTransfer) && item?.status === 'Concluído' ? 'Finalizado' : '-'}
                                </div>
                            </td>
                              <td className="px-6 py-4 text-center hidden sm:table-cell">
                                {isParecer && p?.classificacao ? (
                                    <span className={`
                                        inline-block px-3 py-1 rounded-md text-[10px] font-bold uppercase border
                                        ${(p.classificacao.resumo || "").includes("CLASSE A") ? 'bg-red-50 text-red-700 border-red-200' : 
                                          (p.classificacao.resumo || "").includes("CLASSE B") ? 'bg-amber-50 text-amber-700 border-amber-200' : 
                                          (p.classificacao.resumo || "").includes("CLASSE C") || (p.classificacao.resumo || "").includes("CLASSE D") ? 'bg-green-50 text-green-700 border-green-200' : 
                                          'bg-slate-100 text-slate-500 border-slate-200'}
                                    `}>
                                        {(p.classificacao.resumo || "").split('(')[0]}
                                    </span>
                                ) : (isNoObligatory || isRejection || isTransfer) ? (
                                    <span className="inline-block px-3 py-1 rounded-md text-[10px] font-bold uppercase border bg-slate-100 text-slate-500 border-slate-200">
                                        Isento
                                    </span>
                                ) : (
                                    <span className="text-slate-400 text-[10px]">-</span>
                                )}
                            </td>
                              <td className="px-6 py-4 hidden xl:table-cell">
                                {isParecer && p?.classificacao ? (
                                    <div className="flex justify-center gap-2">
                                        <div className="flex flex-col items-center">
                                            <span className="text-[9px] font-bold text-slate-400 mb-0.5">DPA</span>
                                            <span className={`w-2 h-2 rounded-full ${
                                                p.classificacao.dpaClass === DanoEnum.ALTO ? 'bg-red-500' : 
                                                p.classificacao.dpaClass === DanoEnum.MEDIO ? 'bg-amber-500' : 'bg-emerald-500'
                                            }`} title={`DPA: ${p.classificacao.dpaClass}`}></span>
                                        </div>
                                        <div className="flex flex-col items-center">
                                            <span className="text-[9px] font-bold text-slate-400 mb-0.5">CRI</span>
                                            <span className={`w-2 h-2 rounded-full ${
                                                p.classificacao.risco === RiscoEnum.ALTO ? 'bg-red-500' : 
                                                p.classificacao.risco === RiscoEnum.MEDIO ? 'bg-amber-500' : 'bg-emerald-500'
                                            }`} title={`CRI: ${p.classificacao.risco}`}></span>
                                        </div>
                                    </div>
                                ) : (isNoObligatory || isRejection || isTransfer) ? (
                                    <div className="flex justify-center gap-2">
                                        <div className="flex flex-col items-center">
                                            <span className="text-[9px] font-bold text-slate-200 mb-0.5">DPA</span>
                                            <span className="w-2 h-2 rounded-full bg-slate-200" title="Isento"></span>
                                        </div>
                                        <div className="flex flex-col items-center">
                                            <span className="text-[9px] font-bold text-slate-200 mb-0.5">CRI</span>
                                            <span className="w-2 h-2 rounded-full bg-slate-200" title="Isento"></span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex justify-center">
                                        <span className="text-slate-400 text-[10px]">-</span>
                                    </div>
                                )}
                            </td>
                            <td className="px-6 py-4 text-center">
                                <div className="flex items-center justify-center gap-2">
                                    <span className={`w-2 h-2 rounded-full animate-pulse-slow ${
                                        item.status === 'Concluído' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                                    }`}></span>
                                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase border ${
                                        item.status === 'Concluído' 
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                        : 'bg-amber-50 text-amber-700 border-amber-200'
                                    }`}>
                                        {item.status}
                                    </span>
                                </div>
                            </td>
                        </tr>
                    );
                })
            ) : (
                        <tr>
                        <td colSpan={8} className="px-6 py-12 text-center text-slate-400 bg-slate-50">
                            <div className="flex flex-col items-center gap-2">
                                <Filter size={32} className="opacity-20" />
                                <p>Nenhum registro encontrado com os filtros selecionados.</p>
                            </div>
                        </td>
                        </tr>
                    )}
                    </tbody>
                </table>
            </div>
            {/* Pagination Controls */}
            <div className="p-6 border-t border-slate-200 bg-slate-50/50 flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="flex flex-col sm:flex-row items-center gap-6">
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Itens por página:</span>
                        <select 
                            value={itemsPerPage} 
                            onChange={(e) => {
                                setItemsPerPage(Number(e.target.value));
                                setCurrentPage(1);
                            }}
                            className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all cursor-pointer shadow-sm"
                        >
                            {[10, 15, 20, 30, 50].map(val => (
                                <option key={val} value={val}>{val}</option>
                            ))}
                        </select>
                    </div>
                    <span className="text-xs text-slate-500 font-medium bg-white px-4 py-2 rounded-full border border-slate-200 shadow-sm">
                        Exibindo <span className="text-emerald-600 font-bold">{paginatedData.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}</span> — <span className="text-emerald-600 font-bold">{Math.min(currentPage * itemsPerPage, filteredData.length)}</span> de <span className="text-slate-900 font-bold">{filteredData.length}</span> pareceres
                    </span>
                </div>

                {totalPages > 1 && (
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            className={`p-2 rounded-xl border transition-all ${currentPage === 1 ? 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed' : 'bg-white text-slate-600 border-slate-200 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 shadow-sm'}`}
                        >
                            <ChevronLeft size={18} />
                        </button>
                        
                        <div className="flex items-center gap-1.5">
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                                if (
                                    totalPages <= 7 || 
                                    page === 1 || 
                                    page === totalPages || 
                                    (page >= currentPage - 1 && page <= currentPage + 1)
                                ) {
                                    return (
                                        <button
                                            key={page}
                                            onClick={() => setCurrentPage(page)}
                                            className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold transition-all ${currentPage === page ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200 scale-105' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:border-emerald-300 shadow-sm'}`}
                                        >
                                            {page}
                                        </button>
                                    );
                                } else if (
                                    (page === 2 && currentPage > 3) || 
                                    (page === totalPages - 1 && currentPage < totalPages - 2)
                                ) {
                                    return <span key={page} className="px-1 text-slate-400 font-bold">...</span>;
                                }
                                return null;
                            })}
                        </div>

                        <button 
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                            className={`p-2 rounded-xl border transition-all ${currentPage === totalPages ? 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed' : 'bg-white text-slate-600 border-slate-200 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 shadow-sm'}`}
                        >
                            <ChevronRight size={18} />
                        </button>
                    </div>
                )}
            </div>
        </div>
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        variant={confirmModal.variant}
      />
    </div>
  );
};

export default ParecerList;
