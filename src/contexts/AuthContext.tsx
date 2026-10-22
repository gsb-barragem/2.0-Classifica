import React, { createContext, useCallback, useEffect, useState, ReactNode } from 'react';
import { User } from '../../types';
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
  currentUser: null, login: async () => ({ success: false }), logout: async () => {}, loading: true, refreshProfile: async () => {},
});

const getProfile = async (): Promise<User | null> => {
  const { data, error } = await supabase.rpc('classifica_my_profile');
  if (error) throw error;
  const profile = Array.isArray(data) ? data[0] : data;
  if (!profile || profile.active !== true) return null;
  return {
    id: profile.id, authUserId: profile.auth_user_id, username: profile.username || profile.email || '',
    email: profile.email || '', name: profile.name, role: profile.role, setor: profile.setor || null,
    matricula: profile.matricula || '', active: true, forcePasswordChange: profile.force_password_change === true,
    forcePasswordChangeAt: profile.force_password_change_at || null,
  };
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(async () => {
    setCurrentUser(null);
    const { error } = await supabase.auth.signOut();
    if (error) console.error('Falha ao encerrar sessão:', error.message);
  }, []);

  const verifySessionProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setCurrentUser(null); return null; }
    const profile = await getProfile();
    if (!profile) {
      setCurrentUser(null);
      await supabase.auth.signOut();
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
        if (session?.user && alive) await verifySessionProfile();
      } catch (error) {
        console.error('Falha ao validar a sessão:', error);
        if (alive) setCurrentUser(null);
      } finally { if (alive) setLoading(false); }
    };
    void init();
    try {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') setCurrentUser(null);
        if (event === 'SIGNED_IN' && session?.user) {
          queueMicrotask(() => { void verifySessionProfile().catch(() => undefined); });
        }
      });
      return () => { alive = false; subscription.unsubscribe(); };
    } catch (e) {
      console.warn('Não foi possível registrar o ouvinte de autenticação:', e);
      return () => { alive = false; };
    }
  }, [verifySessionProfile]);

  const login = async (email: string, password: string): Promise<LoginResult> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error || !data.user) {
        await new Promise(resolve => setTimeout(resolve, 700));
        return { success: false, message: 'E-mail ou senha inválidos.' };
      }
      const profile = await verifySessionProfile();
      if (!profile) {
        await supabase.auth.signOut();
        return { success: false, message: 'Não foi possível liberar o acesso. Se sua solicitação foi enviada, aguarde a análise administrativa.' };
      }
      return { success: true, mustChangePassword: profile.forcePasswordChange };
    } catch (error) {
      console.error('Falha no login:', error);
      return { success: false, message: 'Não foi possível validar o acesso. Tente novamente ou contate um administrador.' };
    }
  };

  const refreshProfile = async () => { await verifySessionProfile(); };
  return <AuthContext.Provider value={{ currentUser, login, logout, loading, refreshProfile }}>{children}</AuthContext.Provider>;
};
