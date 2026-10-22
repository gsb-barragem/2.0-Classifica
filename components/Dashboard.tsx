
import React, { useState, useMemo, useRef, useEffect, useContext } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell, Rectangle
} from 'recharts';
import * as XLSX from 'xlsx';
import { 
  FileText, Clock, AlertTriangle, Plus, Search, ChevronDown, ChevronUp, Check, X, Map as MapIcon,
  Eye, Edit, Trash2, Trophy, Database, Download, Loader2, ClipboardList, Menu, ShieldCheck, Layers
} from 'lucide-react';
import { toast } from 'sonner';
import MultiSelect from './ui/MultiSelect';
import MTMap, { formatToGMS } from './MTMap';
import { 
  OPS_MUNICIPIOS, OPS_ANALISTA, OPS_RESPONSAVEL_TECNICO, OPS_DPA1_VOLUME, MUNICIPALITY_COORDS
} from '../constants';
import { ParecerData, RiscoEnum, DanoEnum, OficioData, NoObligatoryData } from '../types';
import { DataContext, AppDocument } from '../src/contexts/DataContext';
import { AuthContext } from '../src/contexts/AuthContext';

interface DashboardProps {
  onNewParecer: () => void;
  onNewOficio: () => void;
  onNewIndeferimento?: () => void;
  onEditParecer?: (parecer: ParecerData) => void;
  onViewParecer?: (parecer: ParecerData) => void;
  onEditOficio?: (oficio: OficioData) => void;
  onViewOficio?: (oficio: OficioData) => void;
}

const COLORS = {
  emerald: ['#34d399', '#10b981', '#059669', '#047857'],
  blue: ['#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8'],
  amber: ['#fbbf24', '#f59e0b', '#d97706', '#b45309'],
  rose: ['#fb7185', '#f43f5e', '#e11d48', '#be123c'],
  gray: '#94a3b8'
};

const CHART_COLORS = [COLORS.emerald[1], COLORS.blue[1], COLORS.amber[1], COLORS.rose[1], '#8b5cf6', '#ec4899'];

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// --- Dashboard Component ---

const Dashboard: React.FC<DashboardProps> = ({ onNewParecer, onNewOficio, onNewIndeferimento, onEditParecer, onViewParecer, onEditOficio, onViewOficio }) => {
  const { pareceres, oficios, noObligatoriedades, indeferimentos, transferencias, documents, loading, deleteParecer, deleteOficio, deleteNoObligatoriedade, deleteIndeferimento, deleteTransferencia } = useContext(DataContext);
  const { currentUser } = useContext(AuthContext);
  // Filter State
  const [filters, setFilters] = useState({
    municipios: [] as string[],
    dpa: [] as string[],
    cri: [] as string[],
    pnsb: [] as string[], // "Enquadra", "Não Enquadra"
    analistas: [] as string[],
    rt: [] as string[],
    status: [] as string[],
    classificacao: [] as string[],
    tipoDocumento: [] as string[],
    mesAno: [] as string[],
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [hoveredCity, setHoveredCity] = useState<string | null>(null);
  const [selectedAnalyst, setSelectedAnalyst] = useState<string | null>(null);
  const [highlightType, setHighlightType] = useState<string | null>(null);
  const [isLegendLocked, setIsLegendLocked] = useState(false);
  
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

  const handleEdit = (item: AppDocument) => {
    if (item.status === 'Concluído') {
      setConfirmModal({
        isOpen: true,
        title: `Alterar ${item.tipo_documento} Concluído`,
        message: `Este documento já está concluído. Deseja realmente alterá-lo? Se sim, a data de conclusão será atualizada para o momento da nova finalização.`,
        variant: 'warning',
        onConfirm: () => {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          if (item.tipo_documento === 'Parecer Técnico') {
            onEditParecer?.(item as ParecerData);
          } else if (item.tipo_documento === 'Não Obrigatoriedade' || item.tipo_documento === 'Transferência de Titularidade' || item.tipo_documento === 'Indeferimento') {
            onEditParecer?.(item as any);
          } else {
            onEditOficio?.(item as OficioData);
          }
        }
      });
    } else {
      if (item.tipo_documento === 'Parecer Técnico') {
        onEditParecer?.(item as ParecerData);
      } else if (item.tipo_documento === 'Não Obrigatoriedade') {
        onEditParecer?.(item as any);
      } else {
        onEditOficio?.(item as OficioData);
      }
    }
  };

  const handleDelete = async (id: string, item: AppDocument) => {
    if (!currentUser) return;

    // Check permissions
    const isAdmin = currentUser.role === 'Administrador';
    const isAuthor = item.userId === currentUser.id;

    if (!isAdmin && !isAuthor) {
      toast.error('Você não tem permissão para excluir este documento.');
      return;
    }

    const docName = item.tipo_documento === 'Parecer Técnico' ? 'parecer' : 
                   item.tipo_documento === 'Não Obrigatoriedade' ? 'não obrigatoriedade' : 
                   item.tipo_documento === 'Indeferimento' ? 'indeferimento' : 
                   item.tipo_documento === 'Transferência de Titularidade' ? 'transferência' : 'ofício';
    
    setConfirmModal({
      isOpen: true,
      title: `Excluir ${item.tipo_documento}`,
      message: `Tem certeza que deseja excluir este ${docName}? Esta ação não pode ser desfeita.`,
      variant: 'danger',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        let result;
        if (item.tipo_documento === 'Parecer Técnico') {
          result = await deleteParecer(id);
        } else if (item.tipo_documento === 'Não Obrigatoriedade') {
          result = await deleteNoObligatoriedade(id);
        } else if (item.tipo_documento === 'Indeferimento') {
          result = await deleteIndeferimento(id);
        } else if (item.tipo_documento === 'Transferência de Titularidade') {
          result = await deleteTransferencia(id);
        } else {
          result = await deleteOficio(id);
        }
          
        if (result.success) {
          toast.success(`${docName.charAt(0).toUpperCase() + docName.slice(1)} excluído com sucesso!`);
        } else {
          toast.error(`Erro ao excluir: ${result.message}`);
        }
      }
    });
  };

  const handleExportExcel = () => {
    if (filteredDocuments.length === 0) {
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
      { header: 'Interessado / Razão Social', getter: (d: any) => d.tipo_documento === 'Parecer Técnico' ? d.razaoSocial : d.interessado },
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
      { header: 'Latitude (Decimal)', getter: (d: any) => d.tipo_documento === 'Parecer Técnico' ? d.barragemPrincipal?.lat : d.lat },
      { header: 'Longitude (Decimal)', getter: (d: any) => d.tipo_documento === 'Parecer Técnico' ? d.barragemPrincipal?.long : d.long },
      { header: 'Altura Máxima (m)', getter: (d: any) => d.barragemPrincipal?.alturaMaxima || '' },
      { header: 'Comprimento Coroamento (m)', getter: (d: any) => d.barragemPrincipal?.comprimentoCoroamento || '' },
      { header: 'Largura Coroamento (m)', getter: (d: any) => d.barragemPrincipal?.larguraCoroamento || '' },
      { header: 'Volume NMM (m³)', getter: (d: any) => d.barragemPrincipal?.volumeNMM || '' },
      { header: 'Tipo Estrutural', getter: (d: any) => d.barragemPrincipal?.tipoEstrutural || '' },
      { header: 'Tipo Fundação', getter: (d: any) => d.barragemPrincipal?.tipoFundacao || '' },
      
      // Classificação
      { header: 'DPA Categoria', getter: (d: any) => d.classificacao?.dpaClass || '' },
      { header: 'CRI Categoria', getter: (d: any) => d.classificacao?.risco || '' },
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
    const data = filteredDocuments.map(doc => {
      const row: any = {};
      columns.forEach(col => {
        row[col.header] = col.getter ? col.getter(doc) : (doc as any)[col.key!];
      });
      return row;
    });

    // Add NoObligatory data to Excel
    const nData = filteredNoObligatoriedades.map(n => ({
      'Tipo de Documento': 'Não Obrigatoriedade',
      'Protocolo/Processo': n.processo,
      'Status': n.status,
      'Analista': n.analista,
      'Empreendedor': n.empreendedor,
      'Município': n.municipio,
      'Latitude': n.lat,
      'Longitude': n.long,
      'Data Criação': n.created_at ? new Date(n.created_at).toLocaleDateString('pt-BR') : ''
    }));

    const worksheet = XLSX.utils.json_to_sheet([...data, ...nData]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Barragens");

    // Generate Excel file and trigger download
    XLSX.writeFile(workbook, `export_barragens_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Banco de dados exportado com sucesso!');
  };

  // Derived Filtered Data
  const filteredDocuments = useMemo(() => {
    return documents.filter(item => {
      // 1. Text Search
      if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        let matches = false;
        if (item.tipo_documento === 'Parecer Técnico') {
          matches = matches || Boolean((item as ParecerData).razaoSocial?.toLowerCase().includes(lower));
        } else if (item.tipo_documento === 'Ofício de Pendências') {
          matches = matches || Boolean((item as OficioData).interessado?.toLowerCase().includes(lower));
        } else if (item.tipo_documento === 'Não Obrigatoriedade') {
          matches = matches || Boolean((item as NoObligatoryData).empreendedor?.toLowerCase().includes(lower));
        } else if (item.tipo_documento === 'Indeferimento') {
          matches = matches || Boolean((item as any).protocolo?.toLowerCase().includes(lower));
        } else if (item.tipo_documento === 'Transferência de Titularidade') {
          matches = matches || Boolean((item as any).novoProprietario?.toLowerCase().includes(lower) || (item as any).nProcesso?.toLowerCase().includes(lower));
        }
        if (!matches) return false;
      }

      // 2. Filters
      if (item.tipo_documento === 'Parecer Técnico') {
        const p = item as ParecerData;
        if (filters.municipios.length > 0 && !filters.municipios.includes(p.municipio)) return false;
        if (filters.dpa.length > 0 && !filters.dpa.includes(p.classificacao.dpaClass)) return false;
        if (filters.cri.length > 0 && !filters.cri.includes(p.classificacao.risco)) return false;
        
        // RT Check (Array some)
        if (filters.rt.length > 0) {
          const hasRT = p.responsaveisTecnicos.some(rt => filters.rt.includes(rt.nome));
          if (!hasRT) return false;
        }

        // PNSB Check
        if (filters.pnsb.length > 0) {
          const resumo = p.classificacao?.resumo || "";
          const isEnquadrada = !resumo.includes("NÃO SE ENQUADRA");
          const statusStr = isEnquadrada ? "Enquadrada na PNSB" : "Não enquadrada na PNSB";
          if (!filters.pnsb.includes(statusStr)) return false;
        }

        if (filters.classificacao.length > 0) {
          let itemClass = "Não Enquadra";
          const resumo = p.classificacao?.resumo || "";
          if (resumo.includes("CLASSE A")) itemClass = "Classe A";
          else if (resumo.includes("CLASSE B")) itemClass = "Classe B";
          else if (resumo.includes("CLASSE C")) itemClass = "Classe C";
          else if (resumo.includes("CLASSE D")) itemClass = "Classe D";
          
          if (!filters.classificacao.includes(itemClass)) return false;
        }
      } else if (item.tipo_documento === 'Não Obrigatoriedade') {
        const n = item as NoObligatoryData;
        if (filters.municipios.length > 0 && (!n.municipio || !filters.municipios.includes(n.municipio))) return false;
        // Non-Obligatory doesn't have DPA/CRI in main search
      } else if (item.tipo_documento === 'Transferência de Titularidade') {
        const t = item as any;
        if (filters.municipios.length > 0 && !filters.municipios.includes(t.municipio)) return false;
      } else {
        // For Oficios, we only apply basic filters if they match
        if (filters.municipios.length > 0) return false; // Oficios don't have municipio
        if (filters.dpa.length > 0) return false;
        if (filters.cri.length > 0) return false;
        if (filters.pnsb.length > 0) return false;
        if (filters.classificacao.length > 0) return false;
        
        if (filters.rt.length > 0) {
          const o = item as OficioData;
          const hasRT = o.responsaveisTecnicos.some(rt => filters.rt.includes(rt.nome));
          if (!hasRT) return false;
        }
      }

      if (filters.analistas.length > 0 && !filters.analistas.includes(item.analista)) return false;
      if (filters.status.length > 0 && item.status && !filters.status.includes(item.status)) return false;
      if (filters.tipoDocumento.length > 0 && !filters.tipoDocumento.includes(item.tipo_documento)) return false;

      if (filters.mesAno.length > 0) {
        let dateStr = "";
        if (item.tipo_documento === 'Parecer Técnico') dateStr = (item as ParecerData).data;
        else if (item.tipo_documento === 'Ofício de Pendências') dateStr = (item as OficioData).data;
        else dateStr = (item as any).created_at || (item as any).dataProtocolo || "";

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
  }, [documents, filters, searchTerm]);

  // Stats and charts should still only use Pareceres for technical metrics
  const filteredPareceres = useMemo(() => {
    return filteredDocuments.filter(d => d.tipo_documento === 'Parecer Técnico') as ParecerData[];
  }, [filteredDocuments]);

  const filteredOficios = useMemo(() => {
    return filteredDocuments.filter(d => d.tipo_documento === 'Ofício de Pendências') as OficioData[];
  }, [filteredDocuments]);

  const filteredNoObligatoriedades = useMemo(() => {
    return filteredDocuments.filter(d => d.tipo_documento === 'Não Obrigatoriedade') as NoObligatoryData[];
  }, [filteredDocuments]);

  const filteredIndeferimentos = useMemo(() => {
    return filteredDocuments.filter(d => d.tipo_documento === 'Indeferimento') as any[];
  }, [filteredDocuments]);

  const filteredTransferencias = useMemo(() => {
    return filteredDocuments.filter(d => d.tipo_documento === 'Transferência de Titularidade') as any[];
  }, [filteredDocuments]);

  // --- Aggregation for Charts ---

  const [showFilters, setShowFilters] = useState(false);

  const stats = useMemo(() => {
    const totalPareceres = filteredPareceres.length;
    const pareceresConcluidos = filteredPareceres.filter(i => i.status === 'Concluído').length;
    const pareceresRascunhos = filteredPareceres.filter(i => i.status === 'Rascunho').length;

    const totalOficios = filteredOficios.length;
    const oficiosConcluidos = filteredOficios.filter(i => i.status === 'Concluído').length;
    const oficiosRascunhos = filteredOficios.filter(i => i.status === 'Rascunho').length;

    const totalNoOblig = filteredNoObligatoriedades.length;
    const noObligConcluidos = filteredNoObligatoriedades.filter(i => i.status === 'Concluído').length;
    const noObligRascunhos = filteredNoObligatoriedades.filter(i => i.status === 'Rascunho').length;

    const totalInd = filteredIndeferimentos.length;
    const indConcluidos = filteredIndeferimentos.filter(i => i.status === 'Concluído').length;
    const indRascunhos = filteredIndeferimentos.filter(i => i.status === 'Rascunho').length;

    const totalTransf = filteredTransferencias.length;
    const transfConcluidos = filteredTransferencias.filter(i => i.status === 'Concluído').length;
    const transfRascunhos = filteredTransferencias.filter(i => i.status === 'Rascunho').length;

    return { 
      total: totalPareceres + totalOficios + totalNoOblig + totalInd + totalTransf,
      totalPareceres, 
      pareceresConcluidos, 
      pareceresRascunhos,
      totalOficios,
      oficiosConcluidos,
      oficiosRascunhos,
      totalNoOblig,
      noObligConcluidos,
      noObligRascunhos,
      totalInd,
      indConcluidos,
      indRascunhos,
      totalTransf,
      transfConcluidos,
      transfRascunhos
    };
  }, [filteredPareceres, filteredOficios, filteredNoObligatoriedades, filteredIndeferimentos]);

  const charts = useMemo(() => {
    // 1. Classificação Distribution
    const classMap: Record<string, number> = {};
    filteredPareceres.forEach(i => {
      // Extract simplified class name (A, B, C, D, Não Enquadra)
      let label = "Não Enquadrada";
      const resumo = i.classificacao?.resumo || "";
      if (resumo.includes("CLASSE A")) label = "Classe A (CRI Alta)";
      else if (resumo.includes("CLASSE B")) label = "Classe B (CRI Média)";
      else if (resumo.includes("CLASSE C")) label = "Classe C (CRI Baixa)";
      
      classMap[label] = (classMap[label] || 0) + 1;
    });
    const classificationData = Object.keys(classMap).map(k => ({ name: k, value: classMap[k] }));

    // 2. DPA Breakdown
    const dpaData = [
      { name: 'Baixo', value: filteredPareceres.filter(i => i.classificacao.dpaClass === DanoEnum.BAIXO).length },
      { name: 'Médio', value: filteredPareceres.filter(i => i.classificacao.dpaClass === DanoEnum.MEDIO).length },
      { name: 'Alto', value: filteredPareceres.filter(i => i.classificacao.dpaClass === DanoEnum.ALTO).length },
    ];

    // 3. CRI Breakdown
    const criData = [
      { name: 'Baixa', value: filteredPareceres.filter(i => i.classificacao.risco === RiscoEnum.BAIXO).length },
      { name: 'Média', value: filteredPareceres.filter(i => i.classificacao.risco === RiscoEnum.MEDIO).length },
      { name: 'Alta', value: filteredPareceres.filter(i => i.classificacao.risco === RiscoEnum.ALTO).length },
    ];

    // 4. Municipalities Map Data (Aggregated)
    const cityMap: Record<string, number> = {};
    filteredPareceres.forEach(i => {
      if (i.municipio) cityMap[i.municipio] = (cityMap[i.municipio] || 0) + 1;
    });
    filteredNoObligatoriedades.forEach(i => {
      if (i.municipio) cityMap[i.municipio] = (cityMap[i.municipio] || 0) + 1;
    });
    const cityData = Object.keys(cityMap)
      .map(k => ({ name: k, value: cityMap[k] }))
      .sort((a, b) => b.value - a.value);

    // 5. Analyst Productivity
    const analystMap: Record<string, { 
      total: number; 
      parecerConcluido: number; 
      parecerRascunho: number;
      oficioPendente: number;
      oficioExpirado: number;
      oficioCumprido: number;
      oficioArquivado: number;
      noObligConcluido: number;
      noObligRascunho: number;
      transfConcluido: number;
      transfRascunho: number;
    }> = {};

    const docTypeMap = {
      parecerConcluido: 0,
      parecerRascunho: 0,
      oficioPendente: 0,
      oficioExpirado: 0,
      oficioCumprido: 0,
      oficioArquivado: 0,
      noObligConcluido: 0,
      noObligRascunho: 0,
      transfConcluido: 0,
      transfRascunho: 0
    };

    filteredDocuments.forEach(i => {
      if (!analystMap[i.analista]) {
        analystMap[i.analista] = { 
          total: 0, 
          parecerConcluido: 0, 
          parecerRascunho: 0,
          oficioPendente: 0,
          oficioExpirado: 0,
          oficioCumprido: 0,
          oficioArquivado: 0,
          noObligConcluido: 0,
          noObligRascunho: 0,
          transfConcluido: 0,
          transfRascunho: 0
        };
      }
      analystMap[i.analista].total += 1;
      
      if (i.tipo_documento === 'Parecer Técnico') {
        const p = i as ParecerData;
        if (p.status === 'Concluído') {
          analystMap[i.analista].parecerConcluido += 1;
          docTypeMap.parecerConcluido += 1;
        } else {
          analystMap[i.analista].parecerRascunho += 1;
          docTypeMap.parecerRascunho += 1;
        }
      } else if (i.tipo_documento === 'Não Obrigatoriedade') {
        const n = i as NoObligatoryData;
        if (n.status === 'Concluído') {
          analystMap[i.analista].noObligConcluido += 1;
          docTypeMap.noObligConcluido += 1;
        } else {
          analystMap[i.analista].noObligRascunho += 1;
          docTypeMap.noObligRascunho += 1;
        }
      } else if (i.tipo_documento === 'Transferência de Titularidade') {
        if (i.status === 'Concluído') {
          analystMap[i.analista].transfConcluido += 1;
          docTypeMap.transfConcluido += 1;
        } else {
          analystMap[i.analista].transfRascunho += 1;
          docTypeMap.transfRascunho += 1;
        }
      } else {
        const o = i as OficioData;
        const dataEmissao = new Date(o.data);
        const diasPrazo = (parseInt(o.prazo) || 0) + (parseInt(o.prorrogacaoPrazo || '0') || 0);
        const dataExpiracao = new Date(dataEmissao);
        dataExpiracao.setDate(dataExpiracao.getDate() + diasPrazo);
        const hoje = new Date();
        const expirado = hoje > dataExpiracao;

        if (o.situacaoPendencia === 'Arquivado') {
          analystMap[i.analista].oficioArquivado += 1;
          docTypeMap.oficioArquivado += 1;
        } else if (o.situacaoPendencia === 'Cumprido') {
          analystMap[i.analista].oficioCumprido += 1;
          docTypeMap.oficioCumprido += 1;
        } else if (o.situacaoPendencia === 'Não cumprido' || (expirado && o.situacaoPendencia === 'Pendente')) {
          analystMap[i.analista].oficioExpirado += 1;
          docTypeMap.oficioExpirado += 1;
        } else {
          analystMap[i.analista].oficioPendente += 1;
          docTypeMap.oficioPendente += 1;
        }
      }
    });

    const analystData = Object.keys(analystMap)
      .map(k => ({ 
        name: k.split(' ')[0], 
        full: k, 
        value: analystMap[k].total,
        parecerConcluido: analystMap[k].parecerConcluido,
        parecerRascunho: analystMap[k].parecerRascunho,
        oficioPendente: analystMap[k].oficioPendente,
        oficioExpirado: analystMap[k].oficioExpirado,
        oficioCumprido: analystMap[k].oficioCumprido,
        oficioArquivado: analystMap[k].oficioArquivado,
        noObligConcluido: analystMap[k].noObligConcluido,
        noObligRascunho: analystMap[k].noObligRascunho,
        transfConcluido: analystMap[k].transfConcluido,
        transfRascunho: analystMap[k].transfRascunho
      }))
      .sort((a, b) => b.value - a.value);

    // 6. Sector Productivity (Monthly)
    const monthlyMap: Record<string, { 
      total: number; 
      parecerConcluido: number; 
      parecerRascunho: number;
      oficioPendente: number;
      oficioExpirado: number;
      oficioCumprido: number;
      oficioArquivado: number;
      noObligConcluido: number;
      noObligRascunho: number;
      transfConcluido: number;
      transfRascunho: number;
    }> = {};
    MONTHS.forEach(m => monthlyMap[m] = { 
      total: 0, 
      parecerConcluido: 0, 
      parecerRascunho: 0,
      oficioPendente: 0,
      oficioExpirado: 0,
      oficioCumprido: 0,
      oficioArquivado: 0,
      noObligConcluido: 0,
      noObligRascunho: 0,
      transfConcluido: 0,
      transfRascunho: 0
    });

    const productivitySource = selectedAnalyst 
      ? filteredDocuments.filter(i => i.analista === selectedAnalyst)
      : filteredDocuments;

    productivitySource.forEach(i => {
      const dateStr = i.tipo_documento === 'Parecer Técnico' 
        ? (i as ParecerData).data 
        : i.tipo_documento === 'Não Obrigatoriedade'
          ? (i as NoObligatoryData).created_at
          : (i as OficioData).data;
      const date = new Date(dateStr || '');
      if (!isNaN(date.getTime())) {
        const monthName = MONTHS[date.getMonth()];
        if (monthlyMap[monthName]) {
          monthlyMap[monthName].total += 1;
          
          if (i.tipo_documento === 'Parecer Técnico') {
            const p = i as ParecerData;
            if (p.status === 'Concluído') monthlyMap[monthName].parecerConcluido += 1;
            else monthlyMap[monthName].parecerRascunho += 1;
          } else if (i.tipo_documento === 'Não Obrigatoriedade') {
            const n = i as NoObligatoryData;
            if (n.status === 'Concluído') monthlyMap[monthName].noObligConcluido += 1;
            else monthlyMap[monthName].noObligRascunho += 1;
          } else if (i.tipo_documento === 'Transferência de Titularidade') {
            if (i.status === 'Concluído') monthlyMap[monthName].transfConcluido += 1;
            else monthlyMap[monthName].transfRascunho += 1;
          } else {
            const o = i as OficioData;
            const dataEmissao = new Date(o.data);
            const diasPrazo = (parseInt(o.prazo) || 0) + (parseInt(o.prorrogacaoPrazo || '0') || 0);
            const dataExpiracao = new Date(dataEmissao);
            dataExpiracao.setDate(dataExpiracao.getDate() + diasPrazo);
            const hoje = new Date();
            const expirado = hoje > dataExpiracao;

            if (o.situacaoPendencia === 'Arquivado') monthlyMap[monthName].oficioArquivado += 1;
            else if (o.situacaoPendencia === 'Cumprido') monthlyMap[monthName].oficioCumprido += 1;
            else if (o.situacaoPendencia === 'Não cumprido' || (expirado && o.situacaoPendencia === 'Pendente')) monthlyMap[monthName].oficioExpirado += 1;
            else monthlyMap[monthName].oficioPendente += 1;
          }
        }
      }
    });

    const sectorProductivityData = MONTHS.map(m => ({
      month: m,
      value: monthlyMap[m].total,
      parecerConcluido: monthlyMap[m].parecerConcluido,
      parecerRascunho: monthlyMap[m].parecerRascunho,
      oficioPendente: monthlyMap[m].oficioPendente,
      oficioExpirado: monthlyMap[m].oficioExpirado,
      oficioCumprido: monthlyMap[m].oficioCumprido,
      oficioArquivado: monthlyMap[m].oficioArquivado,
      noObligConcluido: monthlyMap[m].noObligConcluido,
      noObligRascunho: monthlyMap[m].noObligRascunho,
      transfConcluido: monthlyMap[m].transfConcluido,
      transfRascunho: monthlyMap[m].transfRascunho
    }));

    const docTypeData = [
      { name: 'Parecer Classif. (Concluído)', value: docTypeMap.parecerConcluido, color: '#0000CD' },
      { name: 'Parecer Classif. (Rascunho)', value: docTypeMap.parecerRascunho, color: '#87CEEB' },
      { name: 'Não Obrigatoriedade (Conc.)', value: docTypeMap.noObligConcluido, color: '#4ade80' },
      { name: 'Não Obrigatoriedade (Rasc.)', value: docTypeMap.noObligRascunho, color: '#bcf3d1' },
      { name: 'Transferência (Conc.)', value: docTypeMap.transfConcluido, color: '#4f46e5' },
      { name: 'Transferência (Rasc.)', value: docTypeMap.transfRascunho, color: '#818cf8' },
      { name: 'Ofício (Pendente)', value: docTypeMap.oficioPendente, color: '#fbbf24' },
      { name: 'Ofício (Expirado)', value: docTypeMap.oficioExpirado, color: '#ef4444' },
      { name: 'Ofício (Cumprido)', value: docTypeMap.oficioCumprido, color: '#10b981' },
      { name: 'Ofício (Arquivado)', value: docTypeMap.oficioArquivado, color: '#94a3b8' },
    ];

    return { classificationData, dpaData, criData, cityData, analystData, sectorProductivityData, docTypeData };
  }, [filteredDocuments, filteredPareceres, selectedAnalyst]);

  // Clear Filters
  const clearFilters = () => {
    setFilters({
      municipios: [], dpa: [], cri: [], pnsb: [], analistas: [], rt: [], status: [], classificacao: [], tipoDocumento: [], mesAno: []
    });
    setSelectedAnalyst(null);
  };

  // Generate Month/Year options from documents
  const mesAnoOptions = useMemo(() => {
    const options = new Set<string>();
    documents.forEach(item => {
      let dateStr = "";
      if (item.tipo_documento === 'Parecer Técnico') dateStr = (item as ParecerData).data;
      else if (item.tipo_documento === 'Ofício de Pendências') dateStr = (item as OficioData).data;
      else dateStr = (item as any).created_at || (item as any).dataProtocolo || "";

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
  }, [documents]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "Bom dia";
    if (hour >= 12 && hour < 18) return "Boa tarde";
    return "Boa noite";
  };

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
      {/* HEADER SECTION - TECHNICAL STYLE */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 border-b border-slate-200 pb-8">
        <div className="space-y-1 w-full lg:w-auto">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-[0.2em]">System Status: Operational</span>
          </div>
          <div className="mb-1">
            <span className="text-slate-500 font-medium text-sm md:text-base">
              Olá <span className="text-emerald-600 font-bold">{currentUser?.name || 'Analista'}</span>, {getGreeting()}!
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tighter">
            Classifica <span className="text-emerald-600">Barragens</span>
            <span className="text-slate-300 font-light ml-3 text-xl md:text-2xl tracking-widest uppercase hidden sm:inline">// Painel</span>
          </h1>
          <p className="text-slate-500 font-medium max-w-md text-sm md:text-base">Monitoramento analítico e gestão estratégica da classificação de segurança de barragens.</p>
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
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-white border border-slate-200 hover:border-emerald-50 text-slate-700 hover:text-emerald-600 px-4 md:px-6 py-3 rounded-xl shadow-sm transition-all font-bold whitespace-nowrap group text-xs md:text-sm"
            >
              <X size={18} className="group-hover:rotate-45 transition-transform" />
              Indeferimento
            </button>
            <button
              onClick={handleExportExcel}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-emerald-50 border border-emerald-100 hover:bg-emerald-100 text-emerald-700 px-4 md:px-6 py-3 rounded-xl shadow-sm transition-all font-bold whitespace-nowrap group text-xs md:text-sm"
              title="Exportar todos os dados filtrados para Excel"
            >
              <Download size={18} className="group-hover:translate-y-0.5 transition-transform" />
              Exportar Excel
            </button>
          </div>
        </div>
      </div>

      {/* KPI CARDS - BENTO STYLE */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Total Pareceres Card */}
        <div className="bg-white p-6 rounded-2xl shadow-md border border-slate-200 hover:border-emerald-200 hover:shadow-xl transition-all group">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-all">
              <FileText size={20}/>
            </div>
            <span className="text-[10px] font-mono font-bold text-slate-400">PARECERES TÉCNICOS</span>
          </div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total de Pareceres</p>
          <div className="flex items-baseline justify-between">
            <h3 className="text-4xl font-black text-slate-900 font-mono tracking-tighter">{stats.totalPareceres}</h3>
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Concluídos:</span>
                <span className="text-xs font-black text-emerald-600">{stats.pareceresConcluidos}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Rascunhos:</span>
                <span className="text-xs font-black text-amber-500">{stats.pareceresRascunhos}</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Total Ofícios Card */}
        <div className="bg-white p-6 rounded-2xl shadow-md border border-slate-200 hover:border-emerald-200 hover:shadow-xl transition-all group">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all">
              <ClipboardList size={20}/>
            </div>
            <span className="text-[10px] font-mono font-bold text-slate-400">OFÍCIOS DE PENDÊNCIAS</span>
          </div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total de Ofícios</p>
          <div className="flex items-baseline justify-between">
            <h3 className="text-4xl font-black text-slate-900 font-mono tracking-tighter">{stats.totalOficios}</h3>
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Concluídos:</span>
                <span className="text-xs font-black text-emerald-600">{stats.oficiosConcluidos}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Rascunhos:</span>
                <span className="text-xs font-black text-amber-500">{stats.oficiosRascunhos}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Total Não Obrigatoriedade Card */}
        <div className="bg-white p-6 rounded-2xl shadow-md border border-slate-200 hover:border-emerald-200 hover:shadow-xl transition-all group">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-all">
              <ShieldCheck size={20}/>
            </div>
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">Não Obrigatoriedade</span>
          </div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total de Documentos</p>
          <div className="flex items-baseline justify-between">
            <h3 className="text-4xl font-black text-slate-900 font-mono tracking-tighter">{stats.totalNoOblig}</h3>
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Concluídos:</span>
                <span className="text-xs font-black text-emerald-600">{stats.noObligConcluidos}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Rascunhos:</span>
                <span className="text-xs font-black text-amber-500">{stats.noObligRascunhos}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Total Indeferimentos Card */}
        <div className="bg-white p-6 rounded-2xl shadow-md border border-slate-200 hover:border-emerald-200 hover:shadow-xl transition-all group">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 bg-red-50 text-red-600 rounded-xl flex items-center justify-center group-hover:bg-red-600 group-hover:text-white transition-all">
              <X size={20}/>
            </div>
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">Indeferimentos</span>
          </div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total de Documentos</p>
          <div className="flex items-baseline justify-between">
            <h3 className="text-4xl font-black text-slate-900 font-mono tracking-tighter">{stats.totalInd}</h3>
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Concluídos:</span>
                <span className="text-xs font-black text-emerald-600">{stats.indConcluidos}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Rascunhos:</span>
                <span className="text-xs font-black text-amber-500">{stats.indRascunhos}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Total Transferência de Titularidade Card */}
        <div className="bg-white p-6 rounded-2xl shadow-md border border-slate-200 hover:border-emerald-200 hover:shadow-xl transition-all group">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all">
              <Layers size={20}/>
            </div>
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">Transf. Titularidade</span>
          </div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total de Documentos</p>
          <div className="flex items-baseline justify-between">
            <h3 className="text-4xl font-black text-slate-900 font-mono tracking-tighter">{stats.totalTransf}</h3>
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Concluídos:</span>
                <span className="text-xs font-black text-emerald-600">{stats.transfConcluidos}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Rascunhos:</span>
                <span className="text-xs font-black text-amber-500">{stats.transfRascunhos}</span>
              </div>
            </div>
          </div>
        </div>

        {/* TOTAL de Documentos Card */}
        <div className="bg-slate-900 p-6 rounded-2xl shadow-md border border-slate-800 hover:border-emerald-500/50 hover:shadow-xl transition-all group relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-4 -mt-4 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-colors"></div>
          
          <div className="flex justify-between items-start mb-4 relative z-10">
            <div className="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Database size={20}/>
            </div>
            <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-[0.2em]">SISTEMA GERAL</span>
          </div>
          
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 relative z-10">TOTAL de Documentos</p>
          <div className="flex items-baseline justify-between relative z-10">
            <h3 className="text-4xl font-black text-white font-mono tracking-tighter">{stats.total}</h3>
            <span className="text-[10px] font-bold text-emerald-400 uppercase bg-emerald-400/10 px-2 py-0.5 rounded-full">Base Sincronizada</span>
          </div>

          {/* Hover Overlay with Details */}
          <div className="absolute inset-0 bg-slate-900/95 backdrop-blur-sm p-6 flex flex-col justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20">
             <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] mb-4 border-b border-slate-800 pb-2">Distribuição por Tipo</p>
             <div className="space-y-2">
                {[
                  { label: 'Pareceres', value: stats.totalPareceres, color: 'text-emerald-400' },
                  { label: 'Ofícios', value: stats.totalOficios, color: 'text-blue-400' },
                  { label: 'Não Obri.', value: stats.totalNoOblig, color: 'text-emerald-500' },
                  { label: 'Indef.', value: stats.totalInd, color: 'text-red-400' },
                  { label: 'Transf.', value: stats.totalTransf, color: 'text-indigo-400' }
                ].map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">{item.label}</span>
                    <span className={`text-xs font-black font-mono ${item.color}`}>{item.value}</span>
                  </div>
                ))}
             </div>
          </div>
        </div>
      </div>

      {/* ADVANCED FILTER BAR - CLEAN & ARROJADA */}
      <div className="bg-white p-4 md:p-6 rounded-2xl shadow-md border border-slate-200 relative z-20 group hover:shadow-lg transition-shadow">
        <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity rounded-l-2xl"></div>
        <div className="flex justify-between items-center mb-6">
           <div className="flex items-center gap-2">
             <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
               <Database size={16} className="text-slate-600" />
             </div>
             <h3 className="font-bold text-slate-800 text-xs uppercase tracking-widest">Parâmetros de Filtragem</h3>
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
             selected={filters.tipoDocumento} 
             onChange={(val) => setFilters({...filters, tipoDocumento: val})} 
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

      {/* CHARTS ROW 1 - TECHNICAL & CLEAN */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Classification Distribution */}
        <div className="bg-white p-8 rounded-2xl shadow-md border border-slate-200 relative hover:shadow-lg transition-shadow">
          <div className="flex justify-between items-center mb-8">
            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-widest">Distribuição por Classificação</h3>
            <div className="flex gap-1">
              <div className="w-1 h-3 bg-slate-200 rounded-full"></div>
              <div className="w-1 h-3 bg-emerald-500 rounded-full"></div>
            </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.classificationData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                <YAxis dataKey="name" type="category" width={140} axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 10, fontWeight: 800 }} />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }} 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '12px' }} 
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={28}>
                  {charts.classificationData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Risk Breakdown (Pie Charts) */}
        <div className="bg-white p-8 rounded-2xl shadow-md border border-slate-200 hover:shadow-lg transition-shadow">
          <div className="flex justify-between items-center mb-8">
            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-widest">Indicadores de Produção e Risco</h3>
            <div className="flex gap-1">
              <div className="w-1 h-3 bg-emerald-500 rounded-full"></div>
              <div className="w-1 h-3 bg-blue-500 rounded-full"></div>
              <div className="w-1 h-3 bg-slate-200 rounded-full"></div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 min-h-[400px]">
             <div className="flex flex-col items-center h-80 md:h-full">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Tipo de Documento</span>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={charts.docTypeData} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={8} dataKey="value" stroke="none">
                      {charts.docTypeData.map((e, i) => (
                        <Cell key={`cell-${i}`} fill={e.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none' }} />
                    <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', paddingTop: '20px' }} />
                  </PieChart>
                </ResponsiveContainer>
             </div>
             <div className="flex flex-col items-center h-80 md:h-full">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Dano Potencial (DPA)</span>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={charts.dpaData} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={8} dataKey="value" stroke="none">
                      {charts.dpaData.map((e, i) => (
                        <Cell key={`cell-${i}`} fill={e.name === 'Alto' ? COLORS.rose[1] : e.name === 'Médio' ? COLORS.amber[1] : COLORS.emerald[1]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none' }} />
                    <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', paddingTop: '20px' }} />
                  </PieChart>
                </ResponsiveContainer>
             </div>
             <div className="flex flex-col items-center h-80 md:h-full">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Categoria de Risco (CRI)</span>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={charts.criData} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={8} dataKey="value" stroke="none">
                      {charts.criData.map((e, i) => (
                        <Cell key={`cell-${i}`} fill={e.name === 'Alta' ? COLORS.rose[1] : e.name === 'Média' ? COLORS.amber[1] : COLORS.emerald[1]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none' }} />
                    <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', paddingTop: '20px' }} />
                  </PieChart>
                </ResponsiveContainer>
             </div>
          </div>
        </div>
      </div>

      {/* CHARTS ROW 2 - INTERACTIVE MAP & RANKING */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
         {/* Municipality Map + Ranking (Full Width) */}
         <div className="bg-white p-6 md:p-8 rounded-2xl shadow-md border border-slate-200 lg:col-span-2 hover:shadow-lg transition-shadow">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
             <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                 <MapIcon size={20}/>
               </div>
               <div>
                 <h3 className="font-bold text-slate-800 text-sm uppercase tracking-widest">Distribuição Geográfica</h3>
                 <p className="text-[10px] font-bold text-slate-400 uppercase">Monitoramento por Município</p>
               </div>
             </div>
             <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                   <div className="w-3 h-3 bg-amber-400 rounded-full"></div>
                   <span className="text-[10px] font-bold text-slate-500 uppercase">Localização Exata</span>
                </div>
             </div>
          </div>
          
          <div className="flex flex-col xl:flex-row gap-8">
            {/* Map Area */}
            <div 
              className="h-[400px] md:h-[600px] w-full xl:flex-1 border border-slate-100 rounded-2xl overflow-hidden bg-slate-50 relative shadow-inner"
              onClick={() => {
                if (isLegendLocked) {
                  setIsLegendLocked(false);
                  setHighlightType(null);
                }
              }}
            >
              <MTMap 
                pareceres={filteredPareceres} 
                oficios={filteredOficios} 
                noObligatoriedades={filteredNoObligatoriedades}
                indeferimentos={filteredIndeferimentos}
                transferencias={filteredTransferencias}
                hoveredCity={hoveredCity} 
                highlightType={highlightType}
                onMapClick={() => {
                  if (isLegendLocked) {
                    setIsLegendLocked(false);
                    setHighlightType(null);
                  }
                }}
              />
              <div 
                className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-md p-3 md:p-4 rounded-2xl text-[8px] md:text-[9px] font-black shadow-2xl text-slate-700 z-[1000] border border-white/40 space-y-2 md:space-y-3 max-w-[180px] md:max-w-none"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="pb-1 md:pb-2 border-b border-slate-200/50 mb-1 flex justify-between items-center">
                  <span className="text-slate-400 tracking-widest uppercase block">Legenda do Mapa</span>
                  {isLegendLocked && (
                    <button 
                      onClick={() => { setIsLegendLocked(false); setHighlightType(null); }}
                      className="text-[8px] text-emerald-600 hover:text-emerald-700 uppercase"
                    >
                      Limpar
                    </button>
                  )}
                </div>
                
                {[
                  { label: 'P. CLASSIF (RASC.)', type: 'Parecer (Rascunho)', color: '#87CEEB', border: 'sky-400', icon: <FileText size={10} /> },
                  { label: 'P. CLASSIF (CONCL.)', type: 'Parecer (Concluído)', color: '#0000CD', border: 'blue-800', icon: <FileText size={10} /> },
                  { label: 'NÃO OBRIG (RASC.)', type: 'Não Obrigatoriedade (Rascunho)', color: '#bcf3d1', border: 'emerald-200', icon: <ShieldCheck size={10} />, iconColor: '#047857' },
                  { label: 'NÃO OBRIG (CONCL.)', type: 'Não Obrigatoriedade (Concluído)', color: '#4ade80', border: 'emerald-600', icon: <ShieldCheck size={10} /> },
                  { label: 'OFÍCIO (RASCUNHO)', type: 'Ofício (Rascunho)', color: '#fde68a', border: 'amber-200', icon: <ClipboardList size={10} />, iconColor: '#92400e' },
                  { label: 'OFÍCIO (PENDENTE)', type: 'Ofício (Pendente)', color: '#fbbf24', border: 'amber-600', icon: <ClipboardList size={10} /> },
                  { label: 'OFÍCIO (EXPIRADO)', type: 'Ofício (Expirado)', color: '#ef4444', border: 'red-600', icon: <ClipboardList size={10} /> },
                  { label: 'OFÍCIO (CUMPRIDO)', type: 'Ofício (Cumprido)', color: '#10b981', border: 'emerald-600', icon: <ClipboardList size={10} />, isHatched: true },
                  { label: 'OFÍCIO (ARQUIVADO)', type: 'Ofício (Arquivado)', color: '#94a3b8', border: 'slate-500', icon: <ClipboardList size={10} /> },
                  { label: 'INDEFERIMENTO (RASC.)', type: 'Indeferimento (Rascunho)', color: '#fecaca', border: 'red-200', icon: <X size={10} />, iconColor: '#991b1b' },
                  { label: 'INDEFERIMENTO (CONC.)', type: 'Indeferimento (Concluído)', color: '#ef4444', border: 'red-600', icon: <X size={10} /> },
                  { label: 'TRANSF. (RASCUNHO)', type: 'Transferência (Rascunho)', color: '#818cf8', border: 'indigo-200', icon: <Layers size={10} /> },
                  { label: 'TRANSF. (CONCLUÍDO)', type: 'Transferência (Concluído)', color: '#4f46e5', border: 'indigo-800', icon: <Layers size={10} /> },
                  { label: 'MÚLTIPLOS DOCS', type: 'MÚLTIPLOS DOCS', color: '#4f46e5', border: 'white', isMulti: true, icon: <Layers size={10} /> }
                ].map((item) => {
                  const isActive = highlightType === item.type;
                  return (
                    <div 
                      key={item.type}
                      className={`flex items-center gap-2 md:gap-3 cursor-pointer transition-all p-1 rounded-lg ${isActive ? 'bg-emerald-50 scale-105' : 'hover:bg-slate-50'}`}
                      onMouseEnter={() => { if (!isLegendLocked) setHighlightType(item.type); }}
                      onMouseLeave={() => { if (!isLegendLocked) setHighlightType(null); }}
                      onClick={() => {
                        if (isLegendLocked && highlightType === item.type) {
                          setIsLegendLocked(false);
                          setHighlightType(null);
                        } else {
                          setIsLegendLocked(true);
                          setHighlightType(item.type);
                        }
                      }}
                    >
                      <div 
                        className={`w-5 h-5 flex items-center justify-center rounded border shadow-sm ${item.border ? `border-${item.border}` : ''}`}
                        style={{ 
                          background: item.isHatched 
                            ? 'repeating-linear-gradient(45deg, #fbbf24, #fbbf24 2px, #10b981 2px, #10b981 4px)' 
                            : item.color,
                          borderColor: isActive ? '#10b981' : undefined,
                          borderWidth: isActive ? '2px' : '1px',
                          color: (item as any).iconColor || (item.color === '#87CEEB' || item.color === '#bcf3d1' || item.color === '#fde68a' ? '#334155' : 'white')
                        }}
                      >
                        {item.icon}
                      </div>
                      <span className={`tracking-tight transition-colors ${isActive ? 'text-emerald-700 font-black' : 'text-slate-600'}`}>
                        {item.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Ranking List */}
            <div className="w-full xl:w-96 flex flex-col h-auto xl:h-[500px]">
                <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
                     <div className="flex items-center gap-2">
                       <Trophy size={18} className="text-amber-500"/>
                       <h4 className="font-bold text-slate-800 text-xs uppercase tracking-widest">Ranking Municipal</h4>
                     </div>
                     <span className="text-[10px] font-mono font-bold text-slate-400">COUNT: {charts.cityData.length}</span>
                </div>
                
                <div className="overflow-y-auto pr-2 space-y-3 flex-1 custom-scrollbar max-h-[400px] xl:max-h-none">
                    {charts.cityData.map((city, index) => {
                        const percent = stats.total > 0 ? ((city.value / stats.total) * 100).toFixed(1) : "0.0";
                        const isHovered = hoveredCity === city.name;
                        return (
                            <div 
                              key={city.name} 
                              className={`
                                flex items-center justify-between p-3 rounded-xl transition-all cursor-default border
                                ${isHovered ? 'bg-slate-900 border-slate-900 shadow-xl -translate-y-1' : 'bg-white border-slate-100 hover:border-emerald-200'}
                              `}
                              onMouseEnter={() => setHoveredCity(city.name)}
                              onMouseLeave={() => setHoveredCity(null)}
                            >
                                <div className="flex items-center gap-4 overflow-hidden">
                                     <span className={`
                                        flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-xs font-black transition-all
                                        ${isHovered ? 'bg-emerald-500 text-white rotate-12' : 
                                          index === 0 ? 'bg-yellow-400 text-white' : 
                                          index === 1 ? 'bg-slate-300 text-white' : 
                                          index === 2 ? 'bg-orange-400 text-white' : 'bg-slate-100 text-slate-400'}
                                     `}>
                                        {(index + 1).toString().padStart(2, '0')}
                                     </span>
                                     <span className={`text-sm font-bold truncate transition-colors ${isHovered ? 'text-white' : 'text-slate-700'}`} title={city.name}>
                                        {city.name}
                                     </span>
                                </div>
                                <div className="text-right flex-shrink-0 ml-2">
                                    <div className={`text-lg font-black font-mono transition-colors ${isHovered ? 'text-emerald-400' : 'text-slate-900'}`}>{city.value}</div>
                                    <div className={`text-[10px] font-bold transition-colors ${isHovered ? 'text-slate-400' : 'text-slate-400'}`}>{percent}%</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
          </div>
        </div>

        {/* Analyst Productivity */}
        <div className="bg-white p-8 rounded-2xl shadow-md border border-slate-200 lg:col-span-2 hover:shadow-lg transition-shadow">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-widest">Produtividade por Analista</h3>
              <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase">Clique em uma barra para filtrar a produtividade mensal</p>
            </div>
            <div className="flex items-center gap-4">
              {selectedAnalyst && (
                <button 
                  onClick={() => setSelectedAnalyst(null)}
                  className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg transition-colors"
                >
                  <X size={12} /> Limpar Filtro: {selectedAnalyst.split(' ')[0]}
                </button>
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 max-w-[400px] justify-end">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-[#0000CD] rounded-full"></div>
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">P. Classif. Concluído</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-[#87CEEB] rounded-full"></div>
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">P. Classif. Rascunho</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-[#4ade80] rounded-full"></div>
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">N.O. Concluído</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-[#bcf3d1] rounded-full"></div>
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">N.O. Rascunho</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-[#fbbf24] rounded-full"></div>
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">O. Pendente</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-[#ef4444] rounded-full"></div>
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">O. Expirado</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-[#10b981] rounded-full"></div>
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">O. Cumprido</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-[#94a3b8] rounded-full"></div>
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">O. Arquivado</span>
                </div>
              </div>
            </div>
          </div>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={charts.analystData}
                onClick={(data: any) => {
                  if (data && data.activePayload && data.activePayload.length > 0) {
                    const analyst = data.activePayload[0].payload.full;
                    setSelectedAnalyst(prev => prev === analyst ? null : analyst);
                  }
                }}
              >
                <CartesianGrid strokeDasharray="6 6" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 'bold' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 'bold' }} />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }} 
                  content={<ProductivityTooltip />}
                />
                <Bar dataKey="parecerConcluido" name="Parecer Classif. (Concluído)" stackId="a" fill="#0000CD" barSize={35} cursor="pointer" />
                <Bar dataKey="parecerRascunho" name="Parecer Classif. (Rascunho)" stackId="a" fill="#87CEEB" barSize={35} cursor="pointer" />
                <Bar dataKey="oficioPendente" name="Ofício (Pendente)" stackId="a" fill="#fbbf24" barSize={35} cursor="pointer" />
                <Bar dataKey="oficioExpirado" name="Ofício (Expirado)" stackId="a" fill="#ef4444" barSize={35} cursor="pointer" />
                <Bar dataKey="oficioCumprido" name="Ofício (Cumprido)" stackId="a" fill="#10b981" barSize={35} cursor="pointer" />
                <Bar dataKey="oficioArquivado" name="Ofício (Arquivado)" stackId="a" fill="#94a3b8" radius={[6, 6, 0, 0]} barSize={35} cursor="pointer" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sector Productivity (Monthly) */}
        <div className="bg-white p-8 rounded-2xl shadow-md border border-slate-200 lg:col-span-2 hover:shadow-lg transition-shadow">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-widest">
                {selectedAnalyst ? `Produtividade: ${selectedAnalyst}` : 'Produtividade do Setor'}
              </h3>
              <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase">Volume total de documentos emitidos por mês</p>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 max-w-[400px] justify-end">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-[#0000CD] rounded-full"></div>
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">P. Classif. Concluído</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-[#87CEEB] rounded-full"></div>
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">P. Classif. Rascunho</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-[#fbbf24] rounded-full"></div>
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">O. Pendente</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-[#ef4444] rounded-full"></div>
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">O. Expirado</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-[#10b981] rounded-full"></div>
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">O. Cumprido</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-[#94a3b8] rounded-full"></div>
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">O. Arquivado</span>
              </div>
            </div>
          </div>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.sectorProductivityData}>
                <CartesianGrid strokeDasharray="6 6" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 'bold' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 'bold' }} />
                <Tooltip 
                  cursor={{ fill: '#f1f5f9', opacity: 0.4 }} 
                  content={<ProductivityTooltip />}
                />
                <Bar dataKey="parecerConcluido" name="Parecer Classif. (Concluído)" stackId="a" fill="#0000CD" barSize={35} />
                <Bar dataKey="parecerRascunho" name="Parecer Classif. (Rascunho)" stackId="a" fill="#87CEEB" barSize={35} />
                <Bar dataKey="oficioPendente" name="Ofício (Pendente)" stackId="a" fill="#fbbf24" barSize={35} />
                <Bar dataKey="oficioExpirado" name="Ofício (Expirado)" stackId="a" fill="#ef4444" barSize={35} />
                <Bar dataKey="oficioCumprido" name="Ofício (Cumprido)" stackId="a" fill="#10b981" barSize={35} />
                <Bar dataKey="oficioArquivado" name="Ofício (Arquivado)" stackId="a" fill="#94a3b8" radius={[6, 6, 0, 0]} barSize={35} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* FILTERED LIST TABLE - MODERN DATA GRID */}
      <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden hover:shadow-lg transition-shadow">
        <div className="p-6 md:p-8 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-50/50 gap-4">
          <div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight">Listagem de Documentos</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Registros Filtrados: {filteredDocuments.length}</p>
          </div>
          <div className="flex gap-2">
             <button 
               onClick={handleExportExcel}
               className="p-2 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-emerald-600 hover:border-emerald-200 transition-all shadow-sm active:scale-95"
               title="Exportar Excel"
             >
                <Download size={18} />
             </button>
          </div>
        </div>
        <div className="overflow-x-auto max-h-[600px] custom-scrollbar">
          <table className="w-full text-left text-sm text-slate-600 border-collapse min-w-[1000px]">
            <thead className="bg-white text-slate-400 font-bold sticky top-0 z-10 shadow-sm">
              <tr className="border-b border-slate-100">
                <th className="px-8 py-5 text-[10px] uppercase tracking-widest">Tipo</th>
                <th className="px-8 py-5 text-[10px] uppercase tracking-widest">Protocolo</th>
                <th className="px-8 py-5 text-[10px] uppercase tracking-widest">Interessado / Município</th>
                <th className="px-8 py-5 text-[10px] uppercase tracking-widest">Analista</th>
                <th className="px-8 py-5 text-[10px] uppercase tracking-widest">Classificação</th>
                <th className="px-8 py-5 text-[10px] uppercase tracking-widest">Status</th>
                <th className="px-8 py-5 text-[10px] uppercase tracking-widest text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredDocuments.length > 0 ? (
                filteredDocuments.map((item) => (
                  <tr 
                    key={item.id} 
                    className="hover:bg-emerald-100/50 transition-all duration-200 group cursor-pointer hover:shadow-[inset_12px_0_0_0_#10b981] relative z-10"
                  >
                    <td className="px-8 py-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        item.tipo_documento === 'Parecer Técnico' ? 'bg-blue-50 text-blue-700 border border-blue-100' : 
                        item.tipo_documento === 'Não Obrigatoriedade' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                        item.tipo_documento === 'Indeferimento' ? 'bg-red-50 text-red-700 border border-red-100' :
                        'bg-purple-50 text-purple-700 border border-purple-100'
                      }`}>
                        {item.tipo_documento === 'Parecer Técnico' ? 'Parecer' : 
                         item.tipo_documento === 'Não Obrigatoriedade' ? 'N.O.' : 
                         item.tipo_documento === 'Indeferimento' ? 'Indef.' : 'Ofício'}
                      </span>
                    </td>
                    <td className="px-8 py-4 font-black text-slate-900 font-mono text-xs group-hover:text-emerald-900 transition-colors">
                      {item.tipo_documento === 'Parecer Técnico' ? (item as ParecerData).protocolo : 
                       item.tipo_documento === 'Não Obrigatoriedade' ? (item as NoObligatoryData).processo : 
                       item.tipo_documento === 'Indeferimento' ? (item as any).protocolo :
                       (item as OficioData).protocolo}
                    </td>
                    <td className="px-8 py-4">
                      <div className="font-medium text-slate-600 group-hover:text-emerald-800 transition-colors truncate max-w-[200px]" title={
                        item.tipo_documento === 'Parecer Técnico' ? (item as ParecerData).razaoSocial : 
                        item.tipo_documento === 'Não Obrigatoriedade' ? (item as NoObligatoryData).empreendedor :
                        item.tipo_documento === 'Indeferimento' ? (item as any).protocolo :
                        (item as OficioData).interessado
                      }>
                        {item.tipo_documento === 'Parecer Técnico' ? (item as ParecerData).razaoSocial : 
                         item.tipo_documento === 'Não Obrigatoriedade' ? (item as NoObligatoryData).empreendedor :
                         item.tipo_documento === 'Indeferimento' ? "Processo de Indeferimento" :
                         (item as OficioData).interessado}
                      </div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase">
                        {item.tipo_documento === 'Parecer Técnico' ? (item as ParecerData).municipio : 
                         item.tipo_documento === 'Não Obrigatoriedade' ? (item as NoObligatoryData).municipio :
                         'SEMA/MT'}
                      </div>
                    </td>
                    <td className="px-8 py-4 truncate max-w-[150px] font-medium group-hover:text-emerald-900 transition-colors" title={item.analista}>{item.analista}</td>
                    <td className="px-8 py-4">
                      {item.tipo_documento === 'Parecer Técnico' ? (
                        <span className={`
                          inline-block px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border
                          ${((item as ParecerData).classificacao?.resumo || "").includes("CLASSE A") ? 'bg-red-50 text-red-600 border-red-100' : 
                            ((item as ParecerData).classificacao?.resumo || "").includes("CLASSE B") ? 'bg-amber-50 text-amber-600 border-amber-100' : 
                            'bg-emerald-50 text-emerald-600 border-emerald-100'}
                        `}>
                          {((item as ParecerData).classificacao?.resumo || "").split('(')[0]}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[10px]">-</span>
                      )}
                    </td>
                    <td className="px-8 py-4">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter border ${
                        item.status === 'Concluído' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-8 py-4">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                        <button 
                          className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all" 
                          title="Ver Detalhes"
                          onClick={() => {
                            if (item.tipo_documento === 'Parecer Técnico') {
                              onViewParecer?.(item as ParecerData);
                            } else if (item.tipo_documento === 'Não Obrigatoriedade') {
                              onViewParecer?.(item as any);
                            } else {
                              onViewOficio?.(item as OficioData);
                            }
                          }}
                        >
                          <Eye size={16} />
                        </button>
                        
                        {(currentUser?.role === 'Administrador' || item.userId === currentUser?.id) && (
                          <button 
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all" 
                            title="Editar"
                            onClick={() => handleEdit(item)}
                          >
                            <Edit size={16} />
                          </button>
                        )}

                        {(currentUser?.role === 'Administrador' || item.userId === currentUser?.id) && (
                          <button 
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all" 
                            title="Excluir"
                            onClick={() => item.id && handleDelete(item.id, item)}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-4 opacity-20">
                       <Database size={64} />
                       <p className="font-black uppercase tracking-[0.3em] text-xs">No Data Found</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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

// --- Components ---

const ProductivityTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-4 border border-slate-200 rounded-xl shadow-2xl backdrop-blur-md bg-white/90">
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 border-b border-slate-100 pb-1">{label}</p>
        {payload.filter((p: any) => p.value > 0).map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-3 py-0.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-tighter">{entry.name}:</span>
            <span className="text-xs font-black text-slate-900">{entry.value}</span>
          </div>
        ))}
        <div className="mt-2 pt-1 border-t border-slate-100 flex justify-between items-center">
          <span className="text-[10px] font-black text-slate-400 uppercase">Total:</span>
          <span className="text-xs font-black text-slate-900">
            {payload.reduce((acc: number, curr: any) => acc + (curr.value || 0), 0)}
          </span>
        </div>
      </div>
    );
  }
  return null;
};

const ConfirmModal = ({ isOpen, title, message, onConfirm, onCancel, variant }: any) => {
  if (!isOpen) return null;
  
  const colors = {
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    warning: 'bg-amber-500 hover:bg-amber-600 text-white',
    info: 'bg-blue-600 hover:bg-blue-700 text-white'
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200">
        <div className="p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className={`p-3 rounded-2xl ${variant === 'danger' ? 'bg-red-50 text-red-600' : variant === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
              {variant === 'danger' ? <Trash2 size={24} /> : variant === 'warning' ? <AlertTriangle size={24} /> : <FileText size={24} />}
            </div>
            <h3 className="text-xl font-black text-slate-900 tracking-tight">{title}</h3>
          </div>
          <p className="text-slate-600 leading-relaxed font-medium">{message}</p>
        </div>
        <div className="bg-slate-50 p-6 flex gap-3 justify-end">
          <button 
            onClick={onCancel}
            className="px-6 py-3 rounded-2xl text-sm font-bold text-slate-600 hover:bg-slate-200 transition-colors"
          >
            Cancelar
          </button>
          <button 
            onClick={onConfirm}
            className={`px-6 py-3 rounded-2xl text-sm font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 ${colors[variant as keyof typeof colors]}`}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
