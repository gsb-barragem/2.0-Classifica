import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { EcosystemSystemStatus } from '../../types';
import { isPrivilegedJwtKey, isSupabaseConfigured, isValidSupabaseUrl, validatePublicSupabaseEnv } from '../supabaseClient';
export { CLASSIFICA_INTEGRATION_ARCHITECTURE } from '../config/integrationArchitecture';

let administraClient: SupabaseClient | undefined;
let notificaClient: SupabaseClient | undefined;
let fiscalizaClient: SupabaseClient | undefined;

function normalizeSupabaseOrigin(rawUrl?: string): string {
  const clean = rawUrl?.trim();
  if (!clean) return '';
  try {
    return new URL(clean).origin;
  } catch {
    return clean.replace(/\/+$/, '');
  }
}

function isSecretSupabaseKey(key?: string): boolean {
  const trimmed = key?.trim() || '';
  if (!trimmed) return false;
  if (trimmed.toLowerCase().startsWith('sb_secret_')) return true;
  return isPrivilegedJwtKey(trimmed);
}

function getAdministraPublicKey(): string | undefined {
  return (
    import.meta.env.VITE_ADMINISTRA_SUPABASE_ANON_KEY ||
    import.meta.env.VITE_ADMINISTRA_SUPABASE_PUBLISHABLE_KEY
  );
}

function isEnvPairReady(url?: string, anonKey?: string): boolean {
  const cleanUrl = normalizeSupabaseOrigin(url);
  const cleanKey = anonKey?.trim();
  if (!cleanUrl || !cleanKey) return false;
  return isValidSupabaseUrl(cleanUrl) && !isSecretSupabaseKey(cleanKey);
}

export function isAdministraConfigured(): boolean {
  return isEnvPairReady(
    import.meta.env.VITE_ADMINISTRA_SUPABASE_URL,
    getAdministraPublicKey()
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
    const rawUrl = normalizeSupabaseOrigin(import.meta.env.VITE_ADMINISTRA_SUPABASE_URL);
    const rawKey = getAdministraPublicKey();
    if (isSecretSupabaseKey(rawKey)) {
      throw new Error('Violação de segurança bloqueada: chave secreta detectada em variável pública do Administra Barragens.');
    }
    const { url, anonKey } = validatePublicSupabaseEnv(
      rawUrl,
      rawKey,
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
          'X-Client-Info': 'classifica-to-administra-readonly',
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
      normalizeSupabaseOrigin(import.meta.env.VITE_NOTIFICA_SUPABASE_URL),
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
      normalizeSupabaseOrigin(import.meta.env.VITE_FISCALIZA_SUPABASE_URL),
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
      papel: 'Base Canônica Central (Empreendedores, Barragens, RTs e Vínculos RT–Barragem)',
      configured: isAdministraConfigured(),
      readOnlyFromClassifica: true,
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
