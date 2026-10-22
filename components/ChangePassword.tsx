import React, { useContext, useState } from 'react';
import { supabase } from '../src/supabaseClient';
import { AuthContext } from '../src/contexts/AuthContext';
import { logActivity } from '../src/lib/auditService';
import { Key, Lock, ShieldCheck, Loader2, AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';

interface ChangePasswordProps { forced?: boolean; onComplete?: () => void; }
export const ChangePassword: React.FC<ChangePasswordProps> = ({ forced = false, onComplete }) => {
  const { currentUser, refreshProfile } = useContext(AuthContext);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError(null); setSuccess(false);
    if (newPassword.length < 12) { setError('A nova senha deve ter pelo menos 12 caracteres.'); setLoading(false); return; }
    if (newPassword !== confirmPassword) { setError('A nova senha e a confirmação não coincidem.'); setLoading(false); return; }
    try {
      if (forced) {
        if (!currentUser?.forcePasswordChange) throw new Error('A troca obrigatória não está mais pendente. Atualize a página e entre novamente.');
      } else if (!currentPassword) {
        throw new Error('Informe sua senha atual para alterá-la.');
      } else {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user?.email) throw new Error('Não foi possível validar sua sessão.');
        const { error: verifyError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
        if (verifyError) throw new Error('A senha atual está incorreta.');
      }
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw new Error('Não foi possível atualizar a senha no Supabase Auth.');
      if (forced || currentUser?.forcePasswordChange) {
        const { error: rpcError } = await supabase.rpc('classifica_finish_password_change');
        if (rpcError) throw new Error('A senha foi alterada, mas não foi possível registrar a conclusão no perfil. Contate um administrador antes de sair.');
      }
      await logActivity('PASSWORD_CHANGED');
      await refreshProfile();
      setSuccess(true); setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      if (forced) onComplete?.();
    } catch (err: any) { setError(err.message || 'Erro ao alterar senha.'); }
    finally { setLoading(false); }
  };

  const passwordField = (label: string, value: string, set: (value: string) => void, visible: boolean, toggle: () => void, required: boolean, autoComplete: string) => <div><label className="block text-sm font-bold text-slate-700 mb-1 flex items-center gap-2"><Lock size={16} className="text-slate-400"/>{label}</label><div className="relative"><input type={visible ? 'text' : 'password'} required={required} minLength={required ? 12 : undefined} autoComplete={autoComplete} className="w-full pl-4 pr-10 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-emerald-500 transition-all" placeholder={required ? 'Mínimo 12 caracteres' : 'Senha atual'} value={value} onChange={e=>set(e.target.value)}/><button type="button" aria-label={visible?'Ocultar senha':'Mostrar senha'} onClick={toggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></div>;

  return <div className="p-6 md:p-12 max-w-[800px] mx-auto w-full animate-fade-in"><div className="mb-8"><h2 className="text-3xl font-bold text-slate-800 flex items-center gap-3"><Key className="text-emerald-600"/>{forced ? 'Atualize sua senha' : 'Alterar Senha'}</h2><p className="text-slate-500 mt-1">{forced ? 'Por segurança, defina uma senha pessoal antes de continuar.' : 'A senha é gerenciada pelo Supabase Auth.'}</p></div><div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"><div className="p-8"><form onSubmit={handleSubmit} className="space-y-6 max-w-md mx-auto"><div className="bg-slate-50 p-6 rounded-xl border border-slate-100 flex items-center gap-4"><div className="bg-emerald-100 p-3 rounded-full text-emerald-600"><ShieldCheck size={24}/></div><div><p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Usuário autenticado</p><p className="text-slate-800 font-bold">{currentUser?.name}</p><p className="text-slate-500 text-xs font-mono">{currentUser?.email}</p></div></div><div className="space-y-4">{!forced && passwordField('Senha atual',currentPassword,setCurrentPassword,showCurrentPassword,()=>setShowCurrentPassword(!showCurrentPassword),true,'current-password')}{passwordField('Nova senha',newPassword,setNewPassword,showNewPassword,()=>setShowNewPassword(!showNewPassword),true,'new-password')}{passwordField('Confirmar nova senha',confirmPassword,setConfirmPassword,showConfirmPassword,()=>setShowConfirmPassword(!showConfirmPassword),true,'new-password')}</div>{error&&<div role="alert" className="p-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl flex items-center gap-3"><AlertCircle size={20}/>{error}</div>}{success&&<div role="status" className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm rounded-xl flex items-center gap-3"><CheckCircle2 size={20}/>Senha alterada com sucesso!</div>}<button type="submit" disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50">{loading?<Loader2 className="animate-spin" size={20}/>:forced?'Salvar senha e continuar':'Atualizar senha'}</button></form></div>{!forced&&<div className="bg-slate-50 p-6 border-t border-slate-100 text-center"><p className="text-xs text-slate-400">Se não conseguir acessar sua conta, entre em contato com um administrador.</p></div>}</div></div>;
};
