import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../src/supabaseClient';
import { AuthContext } from '../src/contexts/AuthContext';
import { UserRole } from '../types';
import { logActivity } from '../src/lib/auditService';
import { Users, UserPlus, Edit2, Check, X, Loader2, Search, AlertCircle, Shield, ShieldAlert, ShieldCheck, Mail, BadgeCheck, Building2, Clock3, RefreshCw } from 'lucide-react';

type AccessRequest = { id: string; auth_user_id: string; name: string; email: string; matricula: string; setor: string; perfil?: string; status: 'pending' | 'approved' | 'rejected'; requested_at: string };
type AppUser = { id: string; auth_user_id: string; username: string; email: string; name: string; matricula: string; setor: string; perfil?: string; role: UserRole; active: boolean; created_at?: string };
type FormProfile = { name: string; email: string; matricula: string; setor: string; perfil: string; role: UserRole; active: boolean };
const SECTORS = ['SETOR DE CLASSIFICAÇÃO DE BARRAGENS', 'SETOR DE FISCALIZAÇÃO E MONITORAMENTO', 'SETOR ADMINISTRATIVO', 'COORDENADOR'];
const PERFILS = ['Analista de Meio Ambiente', 'Técnico de Meio Ambiente', 'Residente Técnico', 'Estagiário de Nível Superior', 'Estagiário de Nível Médio', 'Técnico de Desenvolvimento econômico e social'];
const emptyProfile: FormProfile = { name: '', email: '', matricula: '', setor: '', perfil: '', role: 'Analista', active: true };
const inputClass = 'w-full px-4 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-emerald-500';

export const UserManagement: React.FC = () => {
  const { currentUser } = useContext(AuthContext);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'requests' | 'users'>('requests');
  const [requestEdit, setRequestEdit] = useState<AccessRequest | null>(null);
  const [userEdit, setUserEdit] = useState<AppUser | null>(null);
  const [addingUser, setAddingUser] = useState(false);
  const [form, setForm] = useState<FormProfile>(emptyProfile);

  const fetchAll = useCallback(async () => {
    if (currentUser?.role !== 'Administrador') return;
    setLoading(true); setError(null);
    try {
      let loadedUsers: AppUser[] = [];
      let loadedRequests: AccessRequest[] = [];

      // Tenta carregar usuários pela RPC oficial
      const userResult = await supabase.rpc('classifica_list_users');
      if (!userResult.error && userResult.data) {
        loadedUsers = userResult.data as AppUser[];
      } else {
        // Fallback: consulta direta segura restrita a colunas de perfil (sem password_hash)
        const directUsers = await supabase
          .from('users')
          .select('id, auth_user_id, username, email, name, matricula, setor, perfil, role, active, created_at')
          .order('name');
        if (!directUsers.error && directUsers.data) {
          loadedUsers = directUsers.data as AppUser[];
        }
      }

      // Tenta carregar solicitações de acesso pela RPC oficial
      const requestResult = await supabase.rpc('classifica_list_access_requests');
      if (!requestResult.error && requestResult.data) {
        loadedRequests = requestResult.data as AccessRequest[];
      } else {
        const directRequests = await supabase
          .from('classifica_access_requests')
          .select('*')
          .order('requested_at', { ascending: false });
        if (!directRequests.error && directRequests.data) {
          loadedRequests = directRequests.data as AccessRequest[];
        }
      }

      setUsers(loadedUsers);
      setRequests(loadedRequests);
    } catch (e: any) {
      console.error('Falha ao carregar usuários:', e);
      setError('Não foi possível carregar usuários e solicitações. Verifique as permissões de administrador.');
    } finally { setLoading(false); }
  }, [currentUser?.role]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);
  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const filteredUsers = useMemo(() => users.filter(u => `${u.name} ${u.email} ${u.matricula}`.toLowerCase().includes(search.toLowerCase())), [users, search]);
  const filteredRequests = useMemo(() => requests.filter(r => `${r.name} ${r.email} ${r.matricula}`.toLowerCase().includes(search.toLowerCase())), [requests, search]);

  const beginRequestEdit = (r: AccessRequest) => { setRequestEdit(r); setForm({ name: r.name, email: r.email, matricula: r.matricula, setor: r.setor, perfil: r.perfil || '', role: 'Analista', active: true }); setError(null); };
  const beginUserEdit = (u: AppUser) => { setUserEdit(u); setForm({ name: u.name, email: u.email || u.username, matricula: u.matricula || '', setor: u.setor || '', perfil: u.perfil || '', role: u.role, active: u.active }); setError(null); };

  const saveRequestDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestEdit) return;
    if (!form.name.trim() || !form.matricula.trim() || !SECTORS.includes(form.setor) || !PERFILS.includes(form.perfil)) { setError('Nome, matrícula, setor e perfil são obrigatórios.'); return; }
    setBusy(true); setError(null);
    try {
      const { error: updateError } = await supabase.rpc('classifica_update_access_request', { 
        p_request_id: requestEdit.id, 
        p_name: form.name.trim(), 
        p_email: form.email.trim().toLowerCase(), 
        p_matricula: form.matricula.trim(), 
        p_setor: form.setor,
        p_perfil: form.perfil
      });
      if (updateError) throw updateError;
      setRequestEdit(null); await fetchAll();
    } catch (e) { console.error('Falha ao salvar revisão:', e); setError('Não foi possível salvar os dados revisados.'); }
    finally { setBusy(false); }
  };

  const reviewRequest = async (r: AccessRequest, decision: 'approved' | 'rejected') => {
    const profile = requestEdit?.id === r.id ? form : { name: r.name, email: r.email, matricula: r.matricula, setor: r.setor, perfil: r.perfil || '', role: 'Analista' as UserRole, active: true };
    if (profile.role !== 'Analista') { setError('Solicitações aprovadas recebem inicialmente o perfil Analista. Altere o nível depois da aprovação, se necessário.'); return; }
    if (!profile.name.trim() || !profile.email.trim() || !profile.matricula.trim() || !SECTORS.includes(profile.setor) || !PERFILS.includes(profile.perfil)) { setError('Revise nome, e-mail, matrícula, setor e perfil antes de analisar.'); return; }
    setBusy(true); setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('classifica_review_access_request', {
        p_request_id: r.id, p_decision: decision, p_name: profile.name.trim(), p_email: profile.email.trim().toLowerCase(), p_matricula: profile.matricula.trim(), p_setor: profile.setor, p_perfil: profile.perfil
      });
      if (rpcError) {
        // Fallback para caso a RPC não esteja instalada no protótipo
        if (decision === 'approved') {
          await supabase.from('users').upsert({
            auth_user_id: r.auth_user_id,
            email: profile.email.trim().toLowerCase(),
            username: profile.email.trim().toLowerCase(),
            name: profile.name.trim(),
            matricula: profile.matricula.trim(),
            setor: profile.setor,
            perfil: profile.perfil,
            role: 'Analista',
            active: true,
            force_password_change: false,
          }, { onConflict: 'auth_user_id' });
        }
        const reqUpdate = await supabase.from('classifica_access_requests').update({
          status: decision,
          reviewed_at: new Date().toISOString(),
          name: profile.name.trim(),
          email: profile.email.trim().toLowerCase(),
          matricula: profile.matricula.trim(),
          setor: profile.setor,
          perfil: profile.perfil,
        }).eq('id', r.id);
        if (reqUpdate.error) throw reqUpdate.error;
      }
      await logActivity(decision === 'approved' ? 'ACCESS_REQUEST_APPROVED' : 'ACCESS_REQUEST_REJECTED', { requestId: r.id });
      setRequestEdit(null); await fetchAll();
    } catch (e: any) {
      console.error('Falha ao analisar solicitação:', e);
      setError('Não foi possível concluir a análise. Confira se a solicitação ainda está pendente e se o e-mail não está associado a outro perfil.');
    } finally { setBusy(false); }
  };

  const saveUser = async (e: React.FormEvent) => {
    e.preventDefault(); if (!userEdit) return;
    if (!form.name.trim() || !form.matricula.trim() || !SECTORS.includes(form.setor) || !PERFILS.includes(form.perfil)) { setError('Nome, matrícula, setor e perfil são obrigatórios.'); return; }
    setBusy(true); setError(null);
    try {
      let updateError: any;
      const rpcRes = await supabase.rpc('classifica_update_user_profile', { p_user_id: userEdit.id, p_name: form.name.trim(), p_matricula: form.matricula.trim(), p_setor: form.setor, p_perfil: form.perfil, p_role: form.role, p_active: form.active });
      updateError = rpcRes.error;
      if (updateError) {
        const directRes = await supabase
          .from('users')
          .update({ name: form.name.trim(), matricula: form.matricula.trim(), setor: form.setor, perfil: form.perfil, role: form.role, active: form.active, updated_at: new Date().toISOString() })
          .eq('id', userEdit.id);
        updateError = directRes.error;
      }
      if (updateError) throw updateError;
      await logActivity('USER_PROFILE_UPDATED', { userId: userEdit.id });
      setUserEdit(null); await fetchAll();
    } catch (e) {
      console.error('Falha ao editar perfil:', e); setError('Não foi possível atualizar o perfil.');
    } finally { setBusy(false); }
  };

  const saveNewUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.matricula.trim() || !SECTORS.includes(form.setor) || !PERFILS.includes(form.perfil)) { 
      setError('Todos os campos são obrigatórios.'); 
      return; 
    }
    setBusy(true); setError(null);
    try {
      // Inserção direta na tabela de usuários (o usuário precisará criar conta no Auth depois ou Admin criar via Dashboard Supabase)
      const { error: insertError } = await supabase.from('users').insert({
        email: form.email.trim().toLowerCase(),
        username: form.email.trim().toLowerCase(),
        name: form.name.trim(),
        matricula: form.matricula.trim(),
        setor: form.setor,
        perfil: form.perfil,
        role: form.role,
        active: form.active,
        is_active: form.active,
        force_password_change: true
      });
      if (insertError) throw insertError;
      await logActivity('USER_CREATED', { email: form.email });
      setAddingUser(false);
      await fetchAll();
    } catch (e: any) {
      console.error('Falha ao criar usuário:', e);
      setError(e.message || 'Erro ao criar usuário. Verifique se o e-mail já existe.');
    } finally { setBusy(false); }
  };

  if (currentUser?.role !== 'Administrador') return <div className="p-12 text-center"><ShieldAlert size={64} className="text-red-500 mx-auto mb-4" /><h2 className="text-2xl font-bold text-slate-800">Acesso Negado</h2><p className="text-slate-500">Você não tem permissão para acessar esta área.</p></div>;

  return <div className="p-6 md:p-12 max-w-[1600px] mx-auto w-full animate-fade-in">
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
      <div><h2 className="text-3xl font-bold text-slate-800 flex items-center gap-3"><Users className="text-emerald-600" />Gerenciar Usuários</h2><p className="text-slate-500 mt-1">Revise solicitações de acesso e gerencie perfis autorizados.</p></div>
      <div className="flex gap-2">
        <button onClick={() => { setForm(emptyProfile); setAddingUser(true); setError(null); }} className="bg-emerald-600 text-white px-5 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 transition-all"><UserPlus size={17}/>Adicionar Usuário</button>
        <button onClick={() => void fetchAll()} disabled={loading} className="bg-white border border-slate-200 text-slate-600 px-5 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-50"><RefreshCw size={17} className={loading ? 'animate-spin' : ''}/>Atualizar</button>
      </div>
    </div>

    <div className="flex gap-2 mb-5 border-b border-slate-200"><button onClick={() => setTab('requests')} className={`px-5 py-3 font-bold text-sm border-b-2 ${tab === 'requests' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500'}`}>Solicitações {pendingCount > 0 && <span className="ml-1 px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-xs">{pendingCount}</span>}</button><button onClick={() => setTab('users')} className={`px-5 py-3 font-bold text-sm border-b-2 ${tab === 'users' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500'}`}>Usuários cadastrados ({users.length})</button></div>

    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"><div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3"><Search size={20} className="text-slate-400"/><input type="search" placeholder="Buscar por nome, e-mail ou matrícula..." className="bg-transparent border-none outline-none text-slate-700 w-full" value={search} onChange={e => setSearch(e.target.value)}/></div>
      {error && <div role="alert" className="m-4 p-3 bg-red-50 border border-red-100 text-red-700 text-sm rounded-lg flex items-start gap-2"><AlertCircle size={18} className="shrink-0"/>{error}</div>}
      <div className="overflow-x-auto"><table className="w-full text-left border-collapse min-w-[850px]"><thead><tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider font-bold"><th className="px-5 py-4 border-b border-slate-100">Pessoa</th><th className="px-5 py-4 border-b border-slate-100">Matrícula</th><th className="px-5 py-4 border-b border-slate-100">Setor / Perfil</th><th className="px-5 py-4 border-b border-slate-100">{tab === 'requests' ? 'Solicitado em / Situação' : 'Papel / Status'}</th><th className="px-5 py-4 border-b border-slate-100 text-right">Ações</th></tr></thead><tbody className="divide-y divide-slate-100">
        {loading ? <tr><td colSpan={6} className="px-6 py-12 text-center"><Loader2 className="animate-spin text-emerald-500 mx-auto mb-2" size={32}/>Carregando...</td></tr> : tab === 'requests' ? filteredRequests.length === 0 ? <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400">Nenhuma solicitação encontrada.</td></tr> : filteredRequests.map(r => <tr key={r.id} className="hover:bg-slate-50/50"><td className="px-5 py-4"><div className="font-bold text-slate-800">{r.name}</div><div className="text-xs text-slate-500 flex items-center gap-1 mt-1"><Mail size={12}/>{r.email}</div></td><td className="px-5 py-4 text-sm text-slate-600"><span className="inline-flex items-center gap-1"><BadgeCheck size={14}/>{r.matricula}</span></td><td className="px-5 py-4 text-xs text-slate-600"><div className="font-medium text-slate-800">{r.setor}</div><div className="text-slate-500 mt-0.5">{r.perfil || 'Perfil não informado'}</div></td><td className="px-5 py-4"><div className="text-xs text-slate-500 flex items-center gap-1"><Clock3 size={13}/>{new Date(r.requested_at).toLocaleString('pt-BR')}</div><span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${r.status === 'pending' ? 'bg-amber-100 text-amber-800' : r.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{r.status === 'pending' ? 'Pendente' : r.status === 'approved' ? 'Aprovada' : 'Recusada'}</span></td><td className="px-5 py-4 text-right">{r.status === 'pending' ? <div className="flex justify-end gap-2"><button onClick={() => beginRequestEdit(r)} className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Editar dados antes de analisar"><Edit2 size={17}/></button><button onClick={() => void reviewRequest(r,'approved')} disabled={busy} className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg inline-flex items-center gap-1 disabled:opacity-50"><Check size={15}/>Aprovar</button><button onClick={() => void reviewRequest(r,'rejected')} disabled={busy} className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-lg inline-flex items-center gap-1 disabled:opacity-50"><X size={15}/>Recusar</button></div> : <span className="text-xs text-slate-400">Analisada</span>}</td></tr>) : filteredUsers.length === 0 ? <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400">Nenhum usuário encontrado.</td></tr> : filteredUsers.map(u => <tr key={u.id} className="hover:bg-slate-50/50"><td className="px-5 py-4"><div className="font-bold text-slate-800">{u.name}</div><div className="text-xs text-slate-500 flex items-center gap-1 mt-1"><Mail size={12}/>{u.email || u.username}</div></td><td className="px-5 py-4 text-sm text-slate-600">{u.matricula || '—'}</td><td className="px-5 py-4 text-xs text-slate-600"><div className="font-medium text-slate-800">{u.setor || 'Não informado'}</div><div className="text-slate-500 mt-0.5">{u.perfil || '—'}</div></td><td className="px-5 py-4"><span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${u.role === 'Administrador' ? 'bg-purple-100 text-purple-700' : u.role === 'Analista' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'}`}>{u.role === 'Administrador' ? <ShieldAlert size={12}/> : u.role === 'Analista' ? <ShieldCheck size={12}/> : <Shield size={12}/>} {u.role}</span><span className={`ml-2 inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${u.active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{u.active ? 'Ativo' : 'Inativo'}</span></td><td className="px-5 py-4 text-right"><button onClick={() => beginUserEdit(u)} className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Editar perfil"><Edit2 size={17}/></button></td></tr>)}
      </tbody></table></div>
    </div>

    {(requestEdit || userEdit || addingUser) && <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"><div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[95vh] overflow-y-auto"><div className="p-6 border-b border-slate-100 flex items-center justify-between"><div><h3 className="text-xl font-bold text-slate-800">{addingUser ? 'Novo Usuário' : requestEdit ? 'Revisar solicitação' : 'Editar usuário'}</h3><p className="text-xs text-slate-500 mt-1">{addingUser ? 'Preencha os dados do novo usuário.' : requestEdit ? 'Ajuste as informações antes da decisão.' : 'Atualize os dados de perfil, sem acesso às credenciais.'}</p></div><button onClick={() => {setRequestEdit(null);setUserEdit(null);setAddingUser(false);}} className="text-slate-400 hover:text-slate-600"><X size={22}/></button></div>
      <form onSubmit={addingUser ? saveNewUser : requestEdit ? saveRequestDraft : saveUser} className="p-6 space-y-4">
        <div><label className="block text-sm font-bold text-slate-700 mb-1">Nome completo</label><input className={inputClass} required maxLength={160} value={form.name} onChange={e => setForm({...form,name:e.target.value})}/></div>
        <div><label className="block text-sm font-bold text-slate-700 mb-1">E-mail institucional / login</label><input type="email" className={inputClass} required maxLength={254} value={form.email} disabled={!!userEdit || !!requestEdit} onChange={e => setForm({...form,email:e.target.value})}/>{(userEdit || requestEdit) && <p className="text-[10px] text-slate-400 mt-1">O e-mail de autenticação não é alterado nesta tela.</p>}</div>
        <div><label className="block text-sm font-bold text-slate-700 mb-1">Matrícula</label><input className={inputClass} required maxLength={40} value={form.matricula} onChange={e => setForm({...form,matricula:e.target.value})}/></div>
        <div><label className="block text-sm font-bold text-slate-700 mb-1">Setor</label><select className={inputClass} required value={form.setor} onChange={e => setForm({...form,setor:e.target.value})}><option value="">Selecione</option>{SECTORS.map(s=><option key={s}>{s}</option>)}</select></div>
        <div><label className="block text-sm font-bold text-slate-700 mb-1">Perfil Profissional</label><select className={inputClass} required value={form.perfil} onChange={e => setForm({...form,perfil:e.target.value})}><option value="">Selecione</option>{PERFILS.map(p=><option key={p}>{p}</option>)}</select></div>
        {(userEdit || addingUser) && <><div><label className="block text-sm font-bold text-slate-700 mb-1">Papel</label><select className={inputClass} value={form.role} onChange={e=>setForm({...form,role:e.target.value as UserRole})}><option>Administrador</option><option>Analista</option><option>Visualizador</option></select></div><label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/>Usuário ativo</label></>}
        <div className="flex gap-3 pt-2"><button type="button" onClick={()=>{setRequestEdit(null);setUserEdit(null);setAddingUser(false);}} className="flex-1 px-4 py-2 rounded-lg border border-slate-200 font-bold text-slate-600">Cancelar</button><button type="submit" disabled={busy} className="flex-1 px-4 py-2 rounded-lg bg-emerald-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">{busy?<Loader2 size={18} className="animate-spin"/>:addingUser ? 'Criar Usuário' : requestEdit?'Salvar revisão':'Salvar'}</button></div>
      </form>
      {requestEdit && <div className="px-6 pb-6 flex gap-3"><button onClick={()=>void reviewRequest(requestEdit,'approved')} disabled={busy} className="flex-1 px-4 py-2 rounded-lg bg-emerald-600 text-white font-bold flex items-center justify-center gap-2"><Check size={17}/>Aprovar</button><button onClick={()=>void reviewRequest(requestEdit,'rejected')} disabled={busy} className="flex-1 px-4 py-2 rounded-lg bg-red-50 text-red-700 font-bold flex items-center justify-center gap-2"><X size={17}/>Recusar</button></div>}</div></div>}
  </div>;
};
