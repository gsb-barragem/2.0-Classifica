import React, { createContext, useCallback, useEffect, useState, ReactNode } from 'react';
import { User, UserRole, UserSector } from '../../types';
import { supabase, isSupabaseConfigured } from '../supabaseClient';

type LoginResult = { success: boolean; message?: string; mustChangePassword?: boolean };
interface AuthContextType {
  currentUser: User | null;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}
export const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  login: async () => ({ success: false }),
  logout: async () => {},
  loading: true,
  refreshProfile: async () => {},
});

const normalizeRole = (role?: string | null, email?: string): UserRole => {
  if (email) {
    const lowerEmail = email.toLowerCase();
    if (
      lowerEmail.includes('admin') ||
      lowerEmail.includes('csb@') ||
      lowerEmail === 'csb@sema.mt.gov.br' ||
      lowerEmail.includes('yarageologa')
    ) {
      return 'Administrador';
    }
  }
  if (!role) return 'Analista';
  const lower = role.toLowerCase().trim();
  if (lower === 'administrador' || lower === 'admin' || lower === 'coordenador') return 'Administrador';
  if (lower === 'visualizador' || lower === 'viewer') return 'Visualizador';
  return 'Analista';
};

const getProfile = async (authUser: { id: string; email?: string; user_metadata?: Record<string, any> }): Promise<User | null> => {
  // 1. Tenta a função RPC oficial do Classifica 2.0 (se já instalada no banco)
  try {
    const { data, error } = await supabase.rpc('classifica_my_profile');
    if (!error && data) {
      const profile = Array.isArray(data) ? data[0] : data;
      if (profile) {
        const isActive = profile.active !== false && profile.is_active !== false;
        if (!isActive) return null;
        return {
          id: profile.id || authUser.id,
          authUserId: profile.auth_user_id || authUser.id,
          username: profile.username || profile.email || authUser.email || '',
          email: profile.email || authUser.email || '',
          name: profile.name || authUser.email?.split('@')[0] || 'Usuário',
          role: normalizeRole(profile.role, profile.email || authUser.email),
          setor: (profile.setor as UserSector) || null,
          matricula: profile.matricula || '',
          active: true,
          forcePasswordChange: profile.force_password_change === true,
          forcePasswordChangeAt: profile.force_password_change_at || null,
        };
      }
    }
  } catch {
    // Ignora se RPC ainda não estiver criada
  }

  // 2. Consulta tabela public.users buscando por auth_user_id, id ou email
  try {
    let profile: any = null;

    // A. Busca por auth_user_id
    const byAuthId = await supabase
      .from('users')
      .select('*')
      .eq('auth_user_id', authUser.id)
      .maybeSingle();

    if (!byAuthId.error && byAuthId.data) {
      profile = byAuthId.data;
    }

    // B. Se não encontrou, busca por id igual ao auth.uid()
    if (!profile) {
      const byId = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      if (!byId.error && byId.data) {
        profile = byId.data;
      }
    }

    // C. Se não encontrou e o usuário tem email, busca por email
    if (!profile && authUser.email) {
      const byEmail = await supabase
        .from('users')
        .select('*')
        .ilike('email', authUser.email.trim())
        .maybeSingle();

      if (!byEmail.error && byEmail.data) {
        profile = byEmail.data;
        // Atualiza auth_user_id no registro para vincular de forma permanente
        void supabase
          .from('users')
          .update({ auth_user_id: authUser.id })
          .eq('id', profile.id)
          .then(() => {}, () => {});
      }
    }

    // D. Se ainda não encontrou e tem username igual ao email
    if (!profile && authUser.email) {
      const byUsername = await supabase
        .from('users')
        .select('*')
        .ilike('username', authUser.email.trim())
        .maybeSingle();

      if (!byUsername.error && byUsername.data) {
        profile = byUsername.data;
        void supabase
          .from('users')
          .update({ auth_user_id: authUser.id })
          .eq('id', profile.id)
          .then(() => {}, () => {});
      }
    }

    // Se encontrou no banco, valida se está ativo
    if (profile) {
      const isActive = profile.active !== false && profile.is_active !== false;
      if (!isActive) return null;

      return {
        id: profile.id,
        authUserId: profile.auth_user_id || authUser.id,
        username: profile.username || profile.email || authUser.email || '',
        email: profile.email || authUser.email || '',
        name: profile.name || authUser.email?.split('@')[0] || 'Usuário',
        role: normalizeRole(profile.role, profile.email || authUser.email),
        setor: (profile.setor as UserSector) || null,
        matricula: profile.matricula || '',
        active: true,
        forcePasswordChange: profile.force_password_change === true,
        forcePasswordChangeAt: profile.force_password_change_at || null,
      };
    }
  } catch (err) {
    console.warn('Consulta à tabela users falhou ou restrita por RLS:', err);
  }

  // 3. Usuário autenticado com sucesso no Supabase Auth, mas ainda sem registro correspondente em public.users
  // Auto-provisiona perfil com base nos metadados do Auth
  const email = authUser.email || '';
  const userMetadata = authUser.user_metadata || {};
  const determinedRole = normalizeRole(userMetadata.role, email);
  const determinedName = userMetadata.full_name || userMetadata.name || (email ? email.split('@')[0].toUpperCase() : 'Usuário');
  const determinedSector = (userMetadata.setor as UserSector) || 'SETOR DE CLASSIFICAÇÃO DE BARRAGENS';
  const determinedMatricula = userMetadata.matricula || '';

  // Tenta salvar na tabela users se o banco permitir
  try {
    await supabase.from('users').upsert({
      id: authUser.id,
      auth_user_id: authUser.id,
      email: email.toLowerCase(),
      username: email.toLowerCase(),
      name: determinedName,
      role: determinedRole,
      setor: determinedSector,
      matricula: determinedMatricula,
      active: true,
      is_active: true,
      force_password_change: false,
    }, { onConflict: 'id' });
  } catch {
    // Continua sem falhar caso o banco tenha RLS estrito
  }

  return {
    id: authUser.id,
    authUserId: authUser.id,
    username: email || 'usuario',
    email,
    name: determinedName,
    role: determinedRole,
    setor: determinedSector,
    matricula: determinedMatricula,
    active: true,
    forcePasswordChange: false,
    forcePasswordChangeAt: null,
  };
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(async () => {
    setCurrentUser(null);
    try {
      sessionStorage.removeItem('classifica_direct_admin_session');
    } catch {}
    const { error } = await supabase.auth.signOut();
    if (error) console.error('Falha ao encerrar sessão:', error.message);
  }, []);

  const verifySessionProfile = useCallback(async (userParam?: any) => {
    try {
      const savedAdmin = sessionStorage.getItem('classifica_direct_admin_session');
      if (savedAdmin) {
        const parsed = JSON.parse(savedAdmin);
        setCurrentUser(parsed);
        return parsed;
      }
    } catch {}
    const authUser = userParam || (await supabase.auth.getUser()).data.user;
    if (!authUser) {
      setCurrentUser(null);
      return null;
    }
    const profile = await getProfile(authUser);
    if (!profile) {
      setCurrentUser(null);
      await supabase.auth.signOut().catch(() => undefined);
      return null;
    }
    setCurrentUser(profile);
    return profile;
  }, []);

  useEffect(() => {
    try {
      const savedAdmin = sessionStorage.getItem('classifica_direct_admin_session');
      if (savedAdmin) {
        setCurrentUser(JSON.parse(savedAdmin));
        setLoading(false);
        return;
      }
    } catch {}

    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }
    let alive = true;
    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user && alive) {
          await verifySessionProfile(session.user);
        }
      } catch (error) {
        console.error('Falha ao validar a sessão:', error);
        if (alive) setCurrentUser(null);
      } finally {
        if (alive) setLoading(false);
      }
    };
    void init();

    try {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
          setCurrentUser(null);
        } else if (event === 'PASSWORD_RECOVERY') {
          if (session?.user) {
            queueMicrotask(() => { void verifySessionProfile(session.user).catch(() => undefined); });
          }
        } else if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && session?.user) {
          queueMicrotask(() => { void verifySessionProfile(session.user).catch(() => undefined); });
        }
      });
      return () => {
        alive = false;
        subscription.unsubscribe();
      };
    } catch (e) {
      console.warn('Não foi possível registrar o ouvinte de autenticação:', e);
      return () => { alive = false; };
    }
  }, [verifySessionProfile]);

  const login = async (email: string, password: string): Promise<LoginResult> => {
    try {
      const cleanEmail = email.trim().toLowerCase();

      // Perfil de acesso administrativo direto solicitado pelo usuário para desbloqueio
      if (
        (cleanEmail === 'admin' ||
         cleanEmail === 'admin@sema.mt.gov.br' ||
         cleanEmail === 'yarageologa@gmail.com' ||
         cleanEmail === 'csb@sema.mt.gov.br') &&
        password === '@12345'
      ) {
        const directAdmin: User = {
          id: 'admin-contingencia',
          authUserId: 'admin-contingencia',
          username: cleanEmail,
          email: cleanEmail.includes('@') ? cleanEmail : 'admin@sema.mt.gov.br',
          name: cleanEmail === 'yarageologa@gmail.com' ? 'Yara Dias' : 'Administrador do Sistema',
          role: 'Administrador',
          setor: 'SETOR DE CLASSIFICAÇÃO DE BARRAGENS',
          matricula: 'SEMA-ADM',
          active: true,
          forcePasswordChange: false,
          forcePasswordChangeAt: null,
        };
        try {
          sessionStorage.setItem('classifica_direct_admin_session', JSON.stringify(directAdmin));
        } catch {}
        setCurrentUser(directAdmin);
        return { success: true };
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error || !data.user) {
        let msg = 'E-mail ou senha inválidos.';
        if (error?.message) {
          const lower = error.message.toLowerCase();
          if (lower.includes('email not confirmed')) {
            msg = 'E-mail cadastrado, mas ainda não confirmado no Supabase. No painel Authentication > Users, confirme o usuário (ou desative "Confirm email" em Providers > Email).';
          } else if (lower.includes('invalid login credentials')) {
            msg = 'Credenciais não aceitas pelo Supabase. Verifique a senha digitada e confirme se o e-mail foi confirmado no painel do Supabase.';
          } else {
            msg = error.message;
          }
        }
        return { success: false, message: msg };
      }

      const profile = await getProfile(data.user);
      if (!profile) {
        await supabase.auth.signOut().catch(() => undefined);
        return { success: false, message: 'Usuário desativado pelo administrador.' };
      }

      setCurrentUser(profile);
      return { success: true, mustChangePassword: profile.forcePasswordChange };
    } catch (error: any) {
      console.error('Falha no login:', error);
      return { success: false, message: error?.message || 'Não foi possível validar o acesso. Tente novamente.' };
    }
  };

  const refreshProfile = async () => { await verifySessionProfile(); };
  return <AuthContext.Provider value={{ currentUser, login, logout, loading, refreshProfile }}>{children}</AuthContext.Provider>;
};
