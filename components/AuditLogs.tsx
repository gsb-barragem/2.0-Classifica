import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../src/supabaseClient';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AuthContext } from '../src/contexts/AuthContext';
import { 
  Shield, 
  Search, 
  Filter, 
  User, 
  Clock, 
  Activity,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Download,
  AlertTriangle,
  Monitor,
  Smartphone,
  Info,
  Copy,
  Table,
  CheckCircle2,
  XCircle,
  Database,
  Trash2,
  Code,
  RotateCcw as RotateCcwIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useContext } from 'react';

interface AuditLog {
  id: string;
  created_at: string;
  user_email: string;
  user_name: string;
  user_role?: string;
  action: string;
  details: any;
  user_agent?: string;
}

export const AuditLogs: React.FC = () => {
  const { currentUser } = useContext(AuthContext);
  const [logs, setLogs] = useState<AuditLog[]>([]);

  if (currentUser?.role !== 'Administrador') {
    return (
      <div className="p-12 text-center">
        <AlertTriangle size={64} className="text-red-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-slate-800">Acesso Negado</h2>
        <p className="text-slate-500">Você não tem permissão para acessar esta área.</p>
      </div>
    );
  }

  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>('ALL');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const pageSize = 20;

  useEffect(() => {
    fetchLogs();
  }, [page]);

  const fetchLogs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (!error && data) {
      setLogs(data);
    }
    setLoading(false);
  };

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesSearch = 
        log.user_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
        JSON.stringify(log.details).toLowerCase().includes(searchTerm.toLowerCase());

      const matchesAction = activeFilter === 'ALL' || log.action === activeFilter;
      const matchesRole = roleFilter === 'ALL' || log.user_role === roleFilter;

      return matchesSearch && matchesAction && matchesRole;
    });
  }, [logs, searchTerm, activeFilter, roleFilter]);

  // KPIs Calculations
  const stats = useMemo(() => {
    const total = logs.length;
    const logins = logs.filter(l => l.action === 'LOGIN_SUCCESS').length;
    const fails = logs.filter(l => l.action === 'LOGIN_FAIL').length;
    
    const userCounts: Record<string, number> = {};
    logs.forEach(l => {
      userCounts[l.user_name] = (userCounts[l.user_name] || 0) + 1;
    });
    const mostActive = Object.entries(userCounts).sort((a,b) => b[1] - a[1])[0]?.[0] || '-';

    return { total, logins, fails, mostActive };
  }, [logs]);

  const exportToCSV = () => {
    const headers = ['Data/Hora', 'Usuário', 'Perfil', 'Ação', 'Dispositivo', 'Detalhes'];
    const rows = filteredLogs.map(log => [
      format(new Date(log.created_at), "yyyy-MM-dd HH:mm:ss"),
      log.user_name,
      log.user_role || '-',
      log.action,
      log.user_agent || '-',
      JSON.stringify(log.details).replace(/"/g, '""')
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `audit_logs_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Logs exportados com sucesso!');
  };

  const copySQL = () => {
    const sql = `CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  user_email TEXT,
  user_name TEXT,
  user_role TEXT,
  action TEXT NOT NULL,
  details JSONB,
  user_agent TEXT
);`;
    navigator.clipboard.writeText(sql);
    toast.success('Script SQL copiado!');
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'LOGIN_SUCCESS': return <span className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full text-xs font-bold border border-emerald-100"><CheckCircle2 className="w-3 h-3" /> Login Sucesso</span>;
      case 'LOGIN_FAIL': return <span className="flex items-center gap-1 text-red-600 bg-red-50 px-2 py-1 rounded-full text-xs font-bold border border-red-100"><AlertTriangle className="w-3 h-3" /> Falha Segurança</span>;
      case 'DELETE_OPINION':
      case 'DELETE_OFICIO': return <span className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-1 rounded-full text-xs font-bold border border-amber-100"><Trash2 className="w-3 h-3" /> Exclusão Doc</span>;
      case 'DOWNLOAD_DOCUMENT': return <span className="flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-1 rounded-full text-xs font-bold border border-blue-100"><Download className="w-3 h-3" /> Download Doc</span>;
      default: return <span className="px-2 py-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-full text-xs font-bold">{action}</span>;
    }
  };

  const getDeviceIcon = (ua?: string) => {
    if (!ua) return <Activity className="w-4 h-4 text-slate-400" />;
    if (ua.includes('Mobi')) return <Smartphone className="w-4 h-4 text-slate-500" />;
    return <Monitor className="w-4 h-4 text-slate-500" />;
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-8 animate-fade-in">
      {/* HEADER & TOP BAR */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-600/20">
              <Shield className="w-7 h-7 text-white" />
            </div>
            Central de Auditoria
          </h1>
          <p className="text-slate-500 mt-1 font-medium italic">Monitoramento inteligente de integridade e acessos do sistema.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative group">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
            <input 
              type="text" 
              placeholder="Buscar logs..."
              className="pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all outline-none w-full md:w-80 shadow-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-sm font-bold text-sm text-slate-700 active:scale-95"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            Exportar CSV
          </button>
          <button 
            onClick={fetchLogs}
            className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors shadow-sm border border-emerald-100"
          >
            <RotateCcwIcon className="w-5 h-5 animate-pulse-slow" />
          </button>
        </div>
      </div>

      {/* KPI DASHBOARD */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Eventos Capturados', value: stats.total, icon: Activity, color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
          { label: 'Logins com Sucesso', value: stats.logins, icon: CheckCircle2, color: 'text-blue-600', bg: 'bg-blue-500/10' },
          { label: 'Alertas de Segurança', value: stats.fails, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-500/10' },
          { label: 'Analista Mais Ativo', value: stats.mostActive, icon: User, color: 'text-amber-600', bg: 'bg-amber-500/10' },
        ].map((kpi, i) => (
          <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex items-center gap-4 group">
            <div className={`w-12 h-12 ${kpi.bg} rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform`}>
              <kpi.icon className={`w-6 h-6 ${kpi.color}`} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{kpi.label}</p>
              <p className="text-xl font-black text-slate-800">{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* FILTER BAR - MATCHING IMAGE REQUEST */}
      <div className="flex flex-wrap items-center gap-6 bg-slate-50/50 p-4 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-2 text-slate-400 font-bold text-[10px] uppercase tracking-[0.15em]">
          <Filter className="w-4 h-4" /> FILTRAR AÇÕES:
        </div>
        
        <div className="relative">
           <select 
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value)}
            className="appearance-none bg-white border border-slate-200 rounded-xl px-5 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 shadow-sm cursor-pointer pr-10 min-w-[220px] transition-all"
          >
            <option value="ALL">Todas as Ações</option>
            <option value="LOGIN_SUCCESS">Login Sucesso</option>
            <option value="LOGIN_FAIL">Falha Segurança</option>
            <option value="CREATE_OPINION">Criação Parecer</option>
            <option value="EDIT_OPINION">Edição Parecer</option>
            <option value="DELETE_OPINION">Exclusão Parecer</option>
            <option value="DOWNLOAD_DOCUMENT">Download de Documentos</option>
            <option value="USER_CREATED">Novo Usuário</option>
            <option value="USER_DELETED">Exclusão Usuário</option>
            <option value="LOGOUT">Logout</option>
          </select>
          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        <div className="relative">
          <select 
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="appearance-none bg-white border border-slate-200 rounded-xl px-5 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 shadow-sm cursor-pointer pr-10 min-w-[200px] transition-all"
          >
            <option value="ALL">Quaisquer Perfis</option>
            <option value="Administrador">Administrador</option>
            <option value="Analista">Analista</option>
            <option value="Visualizador">Visualizador</option>
          </select>
          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* DATA TABLE */}
      <div className="bg-white rounded-[2rem] shadow-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-[0.15em]">Data Local</th>
                <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-[0.15em]">Operador</th>
                <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-[0.15em]">Função</th>
                <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-[0.15em]">Ação</th>
                <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-[0.15em] text-center">Disp.</th>
                <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-[0.15em] text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={6} className="px-6 py-6 h-12 bg-slate-50/20"></td>
                  </tr>
                ))
              ) : filteredLogs.length > 0 ? (
                filteredLogs.map((log) => (
                  <motion.tr 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    key={log.id} 
                    className="hover:bg-emerald-50/30 transition-colors group"
                  >
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-700">{format(new Date(log.created_at), "dd/MM/yyyy")}</span>
                        <span className="text-[10px] font-mono text-slate-400">{format(new Date(log.created_at), "HH:mm:ss")}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-800">{log.user_name}</span>
                        <span className="text-xs text-slate-400">{log.user_email}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{log.user_role || '-'}</span>
                    </td>
                    <td className="px-6 py-5">
                      {getActionBadge(log.action)}
                    </td>
                    <td className="px-6 py-5 text-center">
                      <div className="flex justify-center">
                        {getDeviceIcon(log.user_agent)}
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <button 
                        onClick={() => setSelectedLog(log)}
                        className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                      >
                        <Info className="w-5 h-5" />
                      </button>
                    </td>
                  </motion.tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Search className="w-12 h-12 text-slate-200" />
                      <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Nenhum evento localizado nos registros</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION */}
        <div className="px-8 py-5 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            {filteredLogs.length} EVENTOS NESTA PÁGINA
          </p>
          <div className="flex items-center gap-4">
            <button 
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-all shadow-sm"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center font-black shadow-lg">
              {page + 1}
            </div>
            <button 
              disabled={logs.length < pageSize}
              onClick={() => setPage(p => p + 1)}
              className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-all shadow-sm"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* SQL INSTRUCTIONS BOX */}
      <div className="bg-slate-900 rounded-3xl p-8 border border-slate-800 shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
        <div className="relative flex flex-col md:flex-row justify-between gap-8 mt-4">
          <div className="space-y-4 max-w-xl">
            <div className="flex items-center gap-2 text-emerald-400 uppercase tracking-[0.2em] font-black text-[10px]">
              <Database className="w-4 h-4" /> Setup da Base de Dados
            </div>
            <h3 className="text-2xl font-black text-white leading-tight">Configuração Inicial Supabase</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Caso deseje resetar ou configurar a tabela de auditoria manualmente no editor SQL do Supabase, utilize o script de estrutura ao lado para garantir compatibilidade total com os sensores inteligentes.
            </p>
            <div className="flex items-center gap-4 pt-2">
              <button 
                onClick={copySQL}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg active:scale-95"
              >
                <Copy className="w-4 h-4" /> Copiar SQL
              </button>
              <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                <Code className="w-4 h-4 text-emerald-500/50" /> Suporta IDs únicos e JSONB
              </div>
            </div>
          </div>
          
          <div className="flex-1 bg-black/40 rounded-2xl border border-white/5 p-4 font-mono text-[11px] text-emerald-400/80 overflow-hidden select-none">
            <div className="flex items-center gap-2 mb-3 opacity-50 border-b border-white/5 pb-2">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/50"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500/50"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/50"></div>
            </div>
            <p>CREATE TABLE audit_logs (</p>
            <p className="pl-4">id UUID PRIMARY KEY,</p>
            <p className="pl-4">created_at TIMESTAMPTZ,</p>
            <p className="pl-4">user_email TEXT,</p>
            <p className="pl-4">action TEXT,</p>
            <p className="pl-4">details JSONB</p>
            <p>);</p>
          </div>
        </div>
      </div>

      {/* DETAIL MODAL */}
      <AnimatePresence>
        {selectedLog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedLog(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            ></motion.div>
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="h-2 bg-emerald-600"></div>
              <div className="p-10 space-y-8">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Detalhes do Evento</h2>
                    <p className="text-slate-400 mt-1 font-bold text-xs uppercase tracking-widest">REGISTRO #{selectedLog.id.slice(0, 8)}</p>
                  </div>
                  <button onClick={() => setSelectedLog(null)} className="p-2 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">
                    <XCircle className="w-6 h-6 text-slate-400" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-8">
                   <div className="space-y-4">
                      <div>
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">Operador</p>
                        <p className="font-bold text-slate-800">{selectedLog.user_name}</p>
                        <p className="text-xs text-slate-500">{selectedLog.user_email}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">Ação Executada</p>
                        <div className="inline-block mt-1">{getActionBadge(selectedLog.action)}</div>
                      </div>
                   </div>
                   <div className="space-y-4 border-l border-slate-100 pl-8">
                      <div>
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">Temporalidade</p>
                        <p className="font-bold text-slate-800">{format(new Date(selectedLog.created_at), "dd/MM/yyyy HH:mm:ss")}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">Perfil de Acesso</p>
                        <p className="font-bold text-emerald-600">{selectedLog.user_role || '---'}</p>
                      </div>
                   </div>
                </div>

                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                     <Table className="w-3.5 h-3.5" /> Metadados Técnicos do Evento
                   </p>
                   <pre className="text-[11px] font-mono text-slate-600 bg-white p-4 rounded-xl border border-slate-200 overflow-x-auto whitespace-pre-wrap leading-relaxed shadow-inner">
                     {JSON.stringify(selectedLog.details, null, 2)}
                   </pre>
                </div>
                
                {selectedLog.user_agent && (
                  <div>
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-2">Fingerprint do Dispositivo</p>
                    <p className="text-[10px] font-mono text-slate-400 break-all leading-normal bg-slate-50 p-3 rounded-lg border border-slate-100">{selectedLog.user_agent}</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
