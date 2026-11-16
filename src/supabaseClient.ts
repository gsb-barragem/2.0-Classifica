import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | undefined;

export function isValidSupabaseUrl(rawUrl?: string): boolean {
  const url = rawUrl?.trim();
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (parsed.protocol !== 'https:' && !isLocalhost) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function isPrivilegedJwtKey(key?: string): boolean {
  const trimmed = key?.trim();
  if (!trimmed) return false;
  const parts = trimmed.split('.');
  if (parts.length !== 3) return false;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const payload = JSON.parse(atob(padded));
    const role = typeof payload?.role === 'string' ? payload.role.toLowerCase() : '';
    return role === 'service_role' || role === 'supabase_admin';
  } catch {
    return false;
  }
}

export function validatePublicSupabaseEnv(rawUrl?: string, rawAnonKey?: string, label = 'Supabase'): { url: string; anonKey: string } {
  const url = rawUrl?.trim();
  const anonKey = rawAnonKey?.trim();

  if (!url || !anonKey) {
    throw new Error(`${label} não configurado. Defina as variáveis de ambiente correspondentes.`);
  }
  if (!isValidSupabaseUrl(url)) {
    throw new Error(`A URL configurada para ${label} é inválida ou não utiliza HTTPS.`);
  }
  if (isPrivilegedJwtKey(anonKey)) {
    throw new Error(`Violação de segurança bloqueada: chave privilegiada (service_role) detectada em variável pública de ${label}. Use apenas a chave anon.`);
  }
  return { url, anonKey };
}

function createSupabaseClient(): SupabaseClient {
  const { url, anonKey } = validatePublicSupabaseEnv(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    'Classifica CSB'
  );

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
    global: {
      headers: {
        'X-Client-Info': 'classifica-csb-2.0',
        'X-CSB-Sistema': 'CLASSIFICA_CSB',
      },
    },
  });
}

export function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return false;
  return isValidSupabaseUrl(url) && !isPrivilegedJwtKey(anonKey);
}

// Instancia o cliente apenas quando acessado: ausência de configuração não gera
// chamadas com URL vazia nem interrompe a renderização antes de exibir erro claro.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, property) {
    client ??= createSupabaseClient();
    const value = Reflect.get(client, property, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
