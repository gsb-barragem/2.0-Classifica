import React, { useState, useContext } from 'react';
import { User, Lock, Loader2, Eye, EyeOff, Mail, BadgeCheck, UserRoundPlus, ArrowLeft, KeyRound, AlertCircle } from 'lucide-react';
import { AuthContext } from '../src/contexts/AuthContext';
import { supabase, isSupabaseConfigured } from '../src/supabaseClient';
import { logActivity } from '../src/lib/auditService';

export type LoginPageMode = 'login' | 'request' | 'recovery';

export interface LoginPageProps {
  initialMode?: LoginPageMode;
  supabaseConfigured?: boolean;
}

export const ACCESS_REQUEST_UNAVAILABLE_NOTICE =
  'A solicitação de acesso ainda não está disponível por este formulário. Enquanto o backend do Administra não estiver validado, o acesso deve ser tratado diretamente com a Administração.';

export function handleDisabledAccessRequestSubmit(event?: { preventDefault?: () => void }): false {
  event?.preventDefault?.();
  return false;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  initialMode = 'login',
  supabaseConfigured,
}) => {
  const [mode, setMode] = useState<LoginPageMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [request, setRequest] = useState({ name: '', matricula: '', email: '' });
  const { login } = useContext(AuthContext);

  const hasSupabaseConfig = () =>
    typeof supabaseConfigured === 'boolean' ? supabaseConfigured : isSupabaseConfigured();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null); setNotice(null);
    if (!hasSupabaseConfig()) {
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

  const handleRequest = (e: React.FormEvent) => {
    handleDisabledAccessRequestSubmit(e);
  };

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null); setNotice(null);
    if (!hasSupabaseConfig()) {
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
            {!hasSupabaseConfig() && (
              <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg text-[11px] text-blue-900 leading-relaxed">
                <span className="font-bold block text-blue-800 uppercase tracking-wide text-[9px] mb-1">Ambiente de Teste / Homologação</span>
                Instância Supabase isolada não conectada no momento. Para login, defina <code className="bg-blue-100 px-1 py-0.5 rounded font-mono text-[10px]">VITE_SUPABASE_URL</code> e <code className="bg-blue-100 px-1 py-0.5 rounded font-mono text-[10px]">VITE_SUPABASE_ANON_KEY</code> no ambiente local conforme <span className="font-semibold">docs/TESTE_SUPABASE_ISOLADO.md</span>.
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
          <form onSubmit={handleRequest} className="space-y-4" autoComplete="off">
            <div role="status" className="bg-amber-50 border border-amber-200 p-3 rounded-lg flex items-start gap-2.5 text-xs text-amber-900 leading-relaxed">
              <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={16} />
              <p>{ACCESS_REQUEST_UNAVAILABLE_NOTICE}</p>
            </div>
            <div>
              <label className={labelClass} htmlFor="request-name">Nome completo</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  id="request-name"
                  name="name"
                  type="text"
                  maxLength={160}
                  autoComplete="name"
                  className={inputClass}
                  placeholder="Seu nome completo"
                  value={request.name}
                  onChange={e => setRequest({ ...request, name: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className={labelClass} htmlFor="request-matricula">Matrícula</label>
              <div className="relative">
                <BadgeCheck className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  id="request-matricula"
                  name="matricula"
                  type="text"
                  maxLength={40}
                  autoComplete="off"
                  className={inputClass}
                  placeholder="Ex.: 000000"
                  value={request.matricula}
                  onChange={e => setRequest({ ...request, matricula: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className={labelClass} htmlFor="request-email">E-mail institucional</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  id="request-email"
                  name="email"
                  type="email"
                  maxLength={254}
                  autoComplete="email"
                  className={inputClass}
                  placeholder="nome@instituicao.gov.br"
                  value={request.email}
                  onChange={e => setRequest({ ...request, email: e.target.value })}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled
              aria-disabled="true"
              className="w-full bg-slate-200 text-slate-500 py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 cursor-not-allowed"
            >
              Enviar solicitação
            </button>
            <button
              type="button"
              onClick={() => {
                setRequest({ name: '', matricula: '', email: '' });
                setMode('login');
                setError(null);
                setNotice(null);
              }}
              className="w-full text-slate-500 hover:text-slate-800 font-bold text-sm py-2 flex items-center justify-center gap-2"
            >
              <ArrowLeft size={16} /> Voltar ao login
            </button>
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
