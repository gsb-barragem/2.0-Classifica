import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { EcosystemSystemStatus } from '../../types';
import { isPrivilegedJwtKey, isSupabaseConfigured, isValidSupabaseUrl, validatePublicSupabaseEnv } from '../supabaseClient';

let administraClient: SupabaseClient | undefined;
let notificaClient: SupabaseClient | undefined;
let fiscalizaClient: SupabaseClient | undefined;

function isEnvPairReady(url?: string, anonKey?: string): boolean {
  const cleanUrl = url?.trim();
  const cleanKey = anonKey?.trim();
  if (!cleanUrl || !cleanKey) return false;
  return isValidSupabaseUrl(cleanUrl) && !isPrivilegedJwtKey(cleanKey);
}

export function isAdministraConfigured(): boolean {
  return isEnvPairReady(
    import.meta.env.VITE_ADMINISTRA_SUPABASE_URL,
    import.meta.env.VITE_ADMINISTRA_SUPABASE_ANON_KEY
  );
}

export function isNotificaConfigured(): boolean {
  return isEnvPairReady(
    import.meta.env.VITE_NOTIFICA_SUPABASE_URL,
    import.meta.env.VITE_NOTIFICA_SUPABASE_ANON_KEY
  );
}

export function isFiscalizaConfigured(): boolean {
  return isEnvPairReady(
    import.meta.env.VITE_FISCALIZA_SUPABASE_URL,
    import.meta.env.VITE_FISCALIZA_SUPABASE_ANON_KEY
  );
}

export function getAdministraClient(): SupabaseClient | null {
  if (!isAdministraConfigured()) return null;
  if (!administraClient) {
    const { url, anonKey } = validatePublicSupabaseEnv(
      import.meta.env.VITE_ADMINISTRA_SUPABASE_URL,
      import.meta.env.VITE_ADMINISTRA_SUPABASE_ANON_KEY,
      'Administra Barragens'
    );
    administraClient = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          'X-Client-Info': 'classifica-to-administra',
          'X-CSB-Sistema': 'CLASSIFICA_CSB',
        },
      },
    });
  }
  return administraClient;
}

export function getNotificaReadOnlyClient(): SupabaseClient | null {
  if (!isNotificaConfigured()) return null;
  if (!notificaClient) {
    const { url, anonKey } = validatePublicSupabaseEnv(
      import.meta.env.VITE_NOTIFICA_SUPABASE_URL,
      import.meta.env.VITE_NOTIFICA_SUPABASE_ANON_KEY,
      'Notifica CSB'
    );
    notificaClient = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          'X-Client-Info': 'classifica-ro-notifica',
          'X-CSB-Sistema': 'CLASSIFICA_CSB',
        },
      },
    });
  }
  return notificaClient;
}

export function getFiscalizaReadOnlyClient(): SupabaseClient | null {
  if (!isFiscalizaConfigured()) return null;
  if (!fiscalizaClient) {
    const { url, anonKey } = validatePublicSupabaseEnv(
      import.meta.env.VITE_FISCALIZA_SUPABASE_URL,
      import.meta.env.VITE_FISCALIZA_SUPABASE_ANON_KEY,
      'Fiscaliza Barragens'
    );
    fiscalizaClient = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          'X-Client-Info': 'classifica-ro-fiscaliza',
          'X-CSB-Sistema': 'CLASSIFICA_CSB',
        },
      },
    });
  }
  return fiscalizaClient;
}

/**
 * Retorna apenas o estado operacional dos sistemas do ecossistema,
 * sem expor URLs, chaves ou detalhes de infraestrutura.
 */
export function getEcosystemStatus(): EcosystemSystemStatus[] {
  return [
    {
      id: 'CLASSIFICA_CSB',
      nome: '2.0 Classifica CSB',
      papel: 'Produtos de Classificação (Pareceres, Ofícios, Indeferimentos, Transferências)',
      configured: isSupabaseConfigured(),
      readOnlyFromClassifica: false,
    },
    {
      id: 'ADMINISTRA_BARRAGENS',
      nome: 'Administra Barragens',
      papel: 'Base Central (Empreendedores, Barragens, RTs, Solicitações e Índice de Produtos)',
      configured: isAdministraConfigured(),
      readOnlyFromClassifica: false,
    },
    {
      id: 'NOTIFICA_CSB',
      nome: 'Notifica CSB',
      papel: 'Notificações e Prazos (Consulta Cruzada Somente Leitura)',
      configured: isNotificaConfigured(),
      readOnlyFromClassifica: true,
    },
    {
      id: 'FISCALIZA_BARRAGENS',
      nome: 'Fiscaliza Barragens',
      papel: 'Vistorias e Autos de Fiscalização (Consulta Cruzada Somente Leitura)',
      configured: isFiscalizaConfigured(),
      readOnlyFromClassifica: true,
    },
  ];
}
