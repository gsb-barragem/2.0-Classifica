import React, { useState, useContext } from 'react';
import { User, Lock, Loader2, Eye, EyeOff, Mail, BadgeCheck, Building2, UserRoundPlus, ArrowLeft, CheckCircle2, KeyRound } from 'lucide-react';
import { AuthContext } from '../src/contexts/AuthContext';
import { supabase, isSupabaseConfigured } from '../src/supabaseClient';
import { logActivity } from '../src/lib/auditService';

const SECTORS = [
  'SETOR DE CLASSIFICAÇÃO DE BARRAGENS',
  'SETOR DE FISCALIZAÇÃO E MONITORAMENTO',
  'SETOR ADMINISTRATIVO',
  'COORDENADOR',
];

export const LoginPage: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'request' | 'recovery'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [request, setRequest] = useState({ name: '', email: '', matricula: '', setor: '', perfil: '', password: '', confirmPassword: '' });
  const { login } = useContext(AuthContext);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null); setNotice(null);
    if (!isSupabaseConfigured()) {
      setError('Supabase de homologação não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env (consulte docs/TESTE_SUPABASE_ISOLADO.md).');
      setLoading(false);
      return;
    }
    try {
      const result = await login(email.trim().toLowerCase(), password);
      if (result.success) {
        void logActivity('LOGIN_SUCCESS').catch(() => undefined);
      } else {
        void logActivity('LOGIN_FAIL').catch(() => undefined);
        setError(result.message || 'E-mail ou senha inválidos.');
      }
    } catch (err: any) {
      setError(err?.message || 'Não foi possível entrar. Confira os dados e tente novamente.');
    } finally { setLoading(false); }
  };

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError(null); setNotice(null);
    if (!isSupabaseConfigured()) {
      setError('Supabase de homologação não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env.');
      setLoading(false);
      return;
    }
    const cleanEmail = request.email.trim().toLowerCase();
    const cleanName = request.name.trim().replace(/\s+/g, ' ');
    const cleanMatricula = request.matricula.trim();
    if (!cleanName || !cleanEmail || !cleanMatricula || !request.setor || !request.perfil) {
      setError('Preencha todos os campos obrigatórios.'); setLoading(false); return;
    }
    if (request.password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.'); setLoading(false); return;
    }
    if (request.password !== request.confirmPassword) {
      setError('As senhas não coincidem.'); setLoading(false); return;
    }
    try {
      // A conta Auth é criada com credencial própria do solicitante. O acesso ao app
      // só é liberado após aprovação administrativa e vínculo do perfil no banco.
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: cleanEmail,
        password: request.password,
        options: {
          emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
          data: { 
            classifica_access_request: true, 
            full_name: cleanName, 
            matricula: cleanMatricula, 
            setor: request.setor,
            perfil: request.perfil
          },
        },
      });
      if (signUpError) throw signUpError;
      if (!data.user) throw new Error('Não foi possível registrar a solicitação.');

      if (data.session) await supabase.auth.signOut().catch(() => undefined);
      setNotice(data.session
        ? 'Solicitação enviada para análise. O acesso será liberado somente após aprovação de um administrador.'
        : 'Cadastro recebido. Se o Supabase solicitar, confirme seu e-mail; a solicitação ficará disponível para análise e o acesso depende da aprovação administrativa.');
      setRequest({ name: '', email: '', matricula: '', setor: '', perfil: '', password: '', confirmPassword: '' });
      setMode('login');
    } catch (err: any) {
      await supabase.auth.signOut().catch(() => undefined);
      const msg = err?.message || err?.error_description || 'Não foi possível enviar a solicitação.';
      setError(`${msg}. Confira os dados ou contate um administrador.`);
    } finally { setLoading(false); }
  };

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null); setNotice(null);
    if (!isSupabaseConfigured()) {
      setError('Supabase de homologação não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env.');
      setLoading(false);
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError('Informe o e-mail institucional.');
      setLoading(false);
      return;
    }
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      });
      if (resetError) throw resetError;
      setNotice('Se houver uma conta institucional vinculada a este e-mail, as instruções de recuperação foram enviadas para sua caixa de entrada.');
      setMode('login');
    } catch {
      // Mensagem genérica para não revelar se o e-mail existe no banco
      setNotice('Se houver uma conta institucional vinculada a este e-mail, as instruções de recuperação foram enviadas para sua caixa de entrada.');
      setMode('login');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = 'w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none';
  const labelClass = 'block text-sm font-medium text-slate-700 mb-1';

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 max-h-[95vh] overflow-y-auto">
        <div className="flex flex-col items-center mb-7">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
            {mode === 'login' ? <Lock className="text-slate-400" size={32} /> : mode === 'request' ? <UserRoundPlus className="text-emerald-600" size={32} /> : <KeyRound className="text-amber-500" size={32} />}
          </div>
          <h1 className="text-xl font-black text-slate-900 tracking-widest uppercase">{mode === 'login' ? 'Acesso Restrito' : mode === 'request' ? 'Solicitar Acesso' : 'Recuperar Senha'}</h1>
          <p className="text-slate-400 text-[9px] font-bold uppercase tracking-[0.2em] mt-2 text-center">Área de Uso Exclusivo e Monitorado</p>
        </div>

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-5" autoComplete="on">
            <div className="bg-amber-50 border border-amber-100 p-3 rounded-lg">
              <p className="text-[10px] text-amber-800 leading-tight font-medium text-center italic">Este sistema é de uso institucional. Todas as tentativas de acesso são registradas e auditadas.</p>
            </div>
            {!isSupabaseConfigured() && (
              <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg text-[11px] text-blue-900 leading-relaxed">
                <span className="font-bold block text-blue-800 uppercase tracking-wide text-[9px] mb-1">Ambiente de Teste / Homologação</span>
                Instância Supabase isolada não conectada no momento. Para login ou solicitação de acesso, defina <code className="bg-blue-100 px-1 py-0.5 rounded font-mono text-[10px]">VITE_SUPABASE_URL</code> e <code className="bg-blue-100 px-1 py-0.5 rounded font-mono text-[10px]">VITE_SUPABASE_ANON_KEY</code> no ambiente local conforme <span className="font-semibold">docs/TESTE_SUPABASE_ISOLADO.md</span>.
              </div>
            )}
            <div>
              <label className={labelClass} htmlFor="login-email">Usuário ou E-mail</label>
              <div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input id="login-email" type="text" required autoComplete="username" className={inputClass} placeholder="admin ou e-mail institucional" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
            </div>
            <div>
              <label className={labelClass} htmlFor="login-password">Senha</label>
              <div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input id="login-password" type={showPassword ? 'text' : 'password'} required autoComplete="current-password" className="w-full pl-10 pr-10 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="••••••••••••" value={password} onChange={e => setPassword(e.target.value)} />
                <button type="button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </div>
            </div>
            {notice && <div role="status" className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm rounded-lg">{notice}</div>}
            {error && <div role="alert" className="p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg">{error}</div>}
            <button type="submit" disabled={loading} className="w-full bg-emerald-600 text-white py-2.5 rounded-lg font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60">{loading ? <Loader2 className="animate-spin" size={20} /> : 'Entrar'}</button>
            <div className="flex justify-between items-center text-xs pt-2">
              <button type="button" onClick={() => { setMode('recovery'); setError(null); setNotice(null); }} className="text-slate-500 hover:text-emerald-700 font-medium">Esqueci minha senha</button>
              <button type="button" onClick={() => { setMode('request'); setError(null); setNotice(null); }} className="text-emerald-700 hover:text-emerald-900 font-bold">Solicitar acesso</button>
            </div>
          </form>
        ) : mode === 'request' ? (
          <form onSubmit={handleRequest} className="space-y-4" autoComplete="on">
            <p className="text-xs text-slate-500 text-center">Preencha os dados institucionais. A solicitação será revisada por um administrador; nenhum perfil ou permissão é concedido automaticamente.</p>
            {!isSupabaseConfigured() && (
              <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg text-[11px] text-blue-900 leading-relaxed">
                <span className="font-bold block text-blue-800 uppercase tracking-wide text-[9px] mb-1">Ambiente de Teste / Homologação</span>
                Instância Supabase isolada não conectada no momento. Defina <code className="bg-blue-100 px-1 py-0.5 rounded font-mono text-[10px]">VITE_SUPABASE_URL</code> e <code className="bg-blue-100 px-1 py-0.5 rounded font-mono text-[10px]">VITE_SUPABASE_ANON_KEY</code> no arquivo <code className="bg-blue-100 px-1 py-0.5 rounded font-mono text-[10px]">.env</code> para habilitar solicitações.
              </div>
            )}
            <div><label className={labelClass} htmlFor="request-name">Nome completo</label><div className="relative"><User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input id="request-name" required maxLength={160} autoComplete="name" className={inputClass} value={request.name} onChange={e => setRequest({ ...request, name: e.target.value })} /></div></div>
            <div><label className={labelClass} htmlFor="request-email">E-mail institucional</label><div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input id="request-email" type="email" required maxLength={254} autoComplete="email" className={inputClass} placeholder="nome@instituicao.gov.br" value={request.email} onChange={e => setRequest({ ...request, email: e.target.value })} /></div></div>
            <div><label className={labelClass} htmlFor="request-matricula">Matrícula</label><div className="relative"><BadgeCheck className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input id="request-matricula" required maxLength={40} autoComplete="off" className={inputClass} value={request.matricula} onChange={e => setRequest({ ...request, matricula: e.target.value })} /></div></div>
            <div><label className={labelClass} htmlFor="request-sector">Setor</label><div className="relative"><Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><select id="request-sector" required className={inputClass} value={request.setor} onChange={e => setRequest({ ...request, setor: e.target.value })}><option value="" disabled>Selecione o setor</option>{SECTORS.map(s => <option key={s} value={s}>{s}</option>)}</select></div></div>
            <div><label className={labelClass} htmlFor="request-perfil">Perfil Profissional</label><div className="relative"><UserRoundPlus className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><select id="request-perfil" required className={inputClass} value={request.perfil} onChange={e => setRequest({ ...request, perfil: e.target.value })}><option value="" disabled>Selecione seu perfil</option><option>Analista de Meio Ambiente</option><option>Técnico de Meio Ambiente</option><option>Residente Técnico</option><option>Estagiário de Nível Superior</option><option>Estagiário de Nível Médio</option><option>Técnico de Desenvolvimento econômico e social</option></select></div></div>
            <div><label className={labelClass} htmlFor="request-password">Criar senha</label><div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input id="request-password" type={showPassword ? 'text' : 'password'} required minLength={6} autoComplete="new-password" className="w-full pl-10 pr-10 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" value={request.password} onChange={e => setRequest({ ...request, password: e.target.value })} /><button type="button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div><p className="text-[10px] text-slate-400 mt-1">Use pelo menos 6 caracteres. A senha é tratada pelo Supabase Auth, não salva na solicitação.</p></div>
            <div><label className={labelClass} htmlFor="request-confirm">Confirmar senha</label><div className="relative"><CheckCircle2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input id="request-confirm" type="password" required minLength={6} autoComplete="new-password" className={inputClass} value={request.confirmPassword} onChange={e => setRequest({ ...request, confirmPassword: e.target.value })} /></div></div>
            {error && <div role="alert" className="p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg">{error}</div>}
            <button type="submit" disabled={loading} className="w-full bg-emerald-600 text-white py-2.5 rounded-lg font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60">{loading ? <Loader2 className="animate-spin" size={20} /> : 'Enviar solicitação'}</button>
            <button type="button" onClick={() => { setMode('login'); setError(null); }} className="w-full text-slate-500 hover:text-slate-800 font-bold text-sm py-2 flex items-center justify-center gap-2"><ArrowLeft size={16} /> Voltar ao login</button>
          </form>
        ) : (
          <form onSubmit={handleRecovery} className="space-y-4" autoComplete="on">
            <p className="text-xs text-slate-500 text-center">Informe seu e-mail institucional para receber um link de redefinição de senha pelo Supabase Auth.</p>
            <div>
              <label className={labelClass} htmlFor="recovery-email">E-mail institucional</label>
              <div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input id="recovery-email" type="email" required autoComplete="username" className={inputClass} placeholder="nome@instituicao.gov.br" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
            </div>
            {error && <div role="alert" className="p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg">{error}</div>}
            <button type="submit" disabled={loading} className="w-full bg-emerald-600 text-white py-2.5 rounded-lg font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60">{loading ? <Loader2 className="animate-spin" size={20} /> : 'Enviar link de recuperação'}</button>
            <button type="button" onClick={() => { setMode('login'); setError(null); }} className="w-full text-slate-500 hover:text-slate-800 font-bold text-sm py-2 flex items-center justify-center gap-2"><ArrowLeft size={16} /> Voltar ao login</button>
          </form>
        )}
      </div>
    </div>
  );
};
