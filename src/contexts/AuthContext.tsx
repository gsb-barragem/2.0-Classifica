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

const SAFE_USER_COLUMNS =
  'id, auth_user_id, username, email, name, role, setor, perfil, matricula, active, force_password_change, force_password_change_at';

const LEGACY_SAFE_USER_COLUMNS =
  'id, nome, login, email, setor, papel, situacao, status';

const MINIMAL_LEGACY_USER_COLUMNS =
  'id, email, setor, papel, situacao, status';

const normalizeRole = (role?: string | null): UserRole => {
  if (!role) return 'Visualizador';
  const lower = role.toLowerCase().trim();
  if (lower === 'administrador' || lower === 'administradora' || lower === 'admin') return 'Administrador';
  if (lower === 'analista') return 'Analista';
  return 'Visualizador';
};

const isProfileActive = (profile: any): boolean => {
  if (!profile) return false;
  if (profile.active === false) return false;
  if (profile.active === true) return true;
  const statusText = String(profile.status ?? profile.situacao ?? '').trim().toLowerCase();
  return ['ativo', 'ativa', 'active', 'aprovado', 'aprovada'].includes(statusText);
};

const mapProfileRow = (profile: any, fallbackEmail?: string): User | null => {
  if (!profile || !isProfileActive(profile)) return null;

  return {
    id: String(profile.id),
    authUserId: profile.auth_user_id ? String(profile.auth_user_id) : String(profile.id),
    username: profile.username || profile.login || profile.email || fallbackEmail || '',
    email: profile.email || fallbackEmail || '',
    name: profile.name || profile.nome || profile.login || profile.username || 'Usuário',
    role: normalizeRole(profile.role || profile.papel),
    setor: (profile.setor as UserSector) || null,
    perfil: (profile.perfil as any) || null,
    matricula: profile.matricula || '',
    active: true,
    forcePasswordChange: profile.force_password_change === true,
    forcePasswordChangeAt: profile.force_password_change_at || null,
  };
};

const queryTableByColumns = async (
  tableName: 'users' | 'user' | 'usuarios',
  columns: string,
  authUser: { id: string; email?: string }
): Promise<User | null> => {
  if (columns.includes('auth_user_id')) {
    const byAuthId = await supabase
      .from(tableName)
      .select(columns)
      .eq('auth_user_id', authUser.id)
      .maybeSingle();

    if (!byAuthId.error && byAuthId.data) {
      return mapProfileRow(byAuthId.data, authUser.email);
    }
  }

  const byId = await supabase
    .from(tableName)
    .select(columns)
    .eq('id', authUser.id)
    .maybeSingle();

  if (!byId.error && byId.data) {
    return mapProfileRow(byId.data, authUser.email);
  }

  const verifiedEmail = authUser.email?.trim().toLowerCase();
  if (verifiedEmail) {
    const byEmail = await supabase
      .from(tableName)
      .select(columns)
      .ilike('email', verifiedEmail)
      .maybeSingle();

    if (!byEmail.error && byEmail.data) {
      return mapProfileRow(byEmail.data, verifiedEmail);
    }
  }

  return null;
};

const getProfile = async (authUser: { id: string; email?: string }): Promise<User | null> => {
  // 1. Tenta a função RPC oficial e segura do Classifica 2.0 (SECURITY DEFINER)
  try {
    const { data, error } = await supabase.rpc('classifica_my_profile');
    if (!error && data) {
      const profile = Array.isArray(data) ? data[0] : data;
      const mapped = mapProfileRow(profile, authUser.email);
      if (mapped) return mapped;
    }
  } catch {
    // Segue para fallback restrito caso a RPC ainda não esteja instalada
  }

  // 2. Fallback restrito a colunas seguras (sem password_hash/senha e sem auto-provisionamento)
  try {
    const candidates: Array<{ table: 'users' | 'user' | 'usuarios'; columns: string }> = [
      { table: 'users', columns: SAFE_USER_COLUMNS },
      { table: 'users', columns: LEGACY_SAFE_USER_COLUMNS },
      { table: 'user', columns: LEGACY_SAFE_USER_COLUMNS },
      { table: 'user', columns: MINIMAL_LEGACY_USER_COLUMNS },
      { table: 'usuarios', columns: LEGACY_SAFE_USER_COLUMNS },
      { table: 'usuarios', columns: MINIMAL_LEGACY_USER_COLUMNS },
    ];

    for (const candidate of candidates) {
      const match = await queryTableByColumns(candidate.table, candidate.columns, authUser);
      if (match) return match;
    }
  } catch {
    console.warn('Falha ao consultar perfil autorizado.');
  }

  // Usuário autenticado no Auth, mas sem perfil ativo aprovado:
  // nunca auto-provisiona no cliente.
  return null;
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(async () => {
    setCurrentUser(null);
    const { error } = await supabase.auth.signOut();
    if (error) console.warn('Falha ao encerrar sessão.');
  }, []);

  const verifySessionProfile = useCallback(async (userParam?: any) => {
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
      } catch {
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
        } else if (
          (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') &&
          session?.user
        ) {
          queueMicrotask(() => {
            void verifySessionProfile(session.user).catch(() => undefined);
          });
        }
      });
      return () => {
        alive = false;
        subscription.unsubscribe();
      };
    } catch {
      return () => { alive = false; };
    }
  }, [verifySessionProfile]);

  const login = async (email: string, password: string): Promise<LoginResult> => {
    try {
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail || !password) {
        return { success: false, message: 'Informe e-mail e senha.' };
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error || !data.user) {
        let msg = 'E-mail ou senha inválidos.';
        if (error?.message?.toLowerCase().includes('email not confirmed')) {
          msg = 'E-mail cadastrado, mas ainda pendente de confirmação.';
        }
        return { success: false, message: msg };
      }

      const profile = await getProfile(data.user);
      if (!profile) {
        await supabase.auth.signOut().catch(() => undefined);
        return {
          success: false,
          message: 'Acesso aguardando aprovação administrativa ou perfil inativo.',
        };
      }

      setCurrentUser(profile);
      return { success: true, mustChangePassword: profile.forcePasswordChange };
    } catch {
      return { success: false, message: 'Não foi possível validar o acesso. Tente novamente.' };
    }
  };

  const refreshProfile = async () => {
    await verifySessionProfile();
  };

  return (
    <AuthContext.Provider value={{ currentUser, login, logout, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
