import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | undefined;

function createSupabaseClient(): SupabaseClient {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    throw new Error('Supabase de teste não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no ambiente local.');
  }

  try {
    new URL(url);
  } catch {
    throw new Error('A URL do Supabase configurada não é válida.');
  }

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
    global: {
      headers: { 'X-Client-Info': 'classifica-2-test' },
    },
  });
}

export function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// Instancia o cliente apenas quando acessado: ausência de configuração não gera
// chamadas com URL vazia nem interrompe a renderização antes de exibir erro claro.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, property, receiver) {
    client ??= createSupabaseClient();
    const value = Reflect.get(client, property, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
