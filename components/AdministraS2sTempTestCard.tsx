// TEMPORÁRIO: componente exclusivo para validação administrativa do handshake S2S-V2.
// Remover este arquivo e a linha de renderização em components/EcosystemHub.tsx após o teste.

import React, { useContext, useState } from 'react';
import { CheckCircle2, Loader2, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react';
import { AuthContext } from '../src/contexts/AuthContext';
import { isSupabaseConfigured, supabase } from '../src/supabaseClient';
import { User } from '../types';

export const TEMP_S2S_HEALTH_ENDPOINT = '/api/administra-s2s-health';

export interface TempS2sTestResult {
  ok: boolean;
  httpStatus?: number;
  message: string;
}

export interface TriggerAdministraS2sDeps {
  currentUser: User | null | undefined;
  isConfigured?: () => boolean;
  getSession?: () => Promise<{
    data: {
      session: {
        access_token?: string | null;
        expires_at?: number | null;
      } | null;
    };
    error: unknown;
  }>;
  fetchImpl?: typeof fetch;
  nowMs?: () => number;
}

export async function triggerAdministraS2sHealthTest(
  deps: TriggerAdministraS2sDeps
): Promise<TempS2sTestResult> {
  const { currentUser } = deps;
  if (!currentUser || currentUser.role !== 'Administrador') {
    return {
      ok: false,
      message: 'Acesso restrito a Administradores autenticados.',
    };
  }

  const configured = deps.isConfigured ? deps.isConfigured() : isSupabaseConfigured();
  if (!configured) {
    return {
      ok: false,
      message: 'Autenticação indisponível no momento.',
    };
  }

  let accessToken = '';
  try {
    const sessionRes = deps.getSession
      ? await deps.getSession()
      : await supabase.auth.getSession();

    const session = sessionRes?.data?.session;
    const now = deps.nowMs ? deps.nowMs() : Date.now();
    const isExpired =
      typeof session?.expires_at === 'number' && session.expires_at * 1000 <= now;

    if (sessionRes?.error || !session?.access_token || isExpired) {
      return {
        ok: false,
        message: 'Sessão ausente ou expirada. Faça login novamente para testar.',
      };
    }

    accessToken = session.access_token.trim();
  } catch {
    return {
      ok: false,
      message: 'Não foi possível validar a sessão atual.',
    };
  }

  if (!accessToken) {
    return {
      ok: false,
      message: 'Sessão ausente ou expirada. Faça login novamente para testar.',
    };
  }

  try {
    const fetchFn = deps.fetchImpl ?? fetch;
    const response = await fetchFn(TEMP_S2S_HEALTH_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const json = (await response.json().catch(() => null)) as {
      ok?: unknown;
      status?: unknown;
    } | null;

    if (
      response.ok &&
      json?.ok === true &&
      typeof json?.status === 'number' &&
      Number.isInteger(json.status)
    ) {
      return {
        ok: true,
        httpStatus: json.status,
        message: `Teste S2S concluído com sucesso (HTTP ${json.status}).`,
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        message: 'Acesso não autorizado para executar o teste S2S.',
      };
    }

    if (response.status === 404) {
      return {
        ok: false,
        message: 'Teste temporário S2S desabilitado no servidor.',
      };
    }

    if (response.status === 429) {
      return {
        ok: false,
        message: 'Aguarde alguns segundos antes de repetir o teste S2S.',
      };
    }

    return {
      ok: false,
      message: 'Falha ao executar o teste S2S com o Administra.',
    };
  } catch {
    return {
      ok: false,
      message: 'Falha ao executar o teste S2S com o Administra.',
    };
  }
}

export const AdministraS2sTempTestCard: React.FC = () => {
  const { currentUser } = useContext(AuthContext);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TempS2sTestResult | null>(null);

  if (!currentUser || currentUser.role !== 'Administrador') {
    return null;
  }

  const handleRunTest = async () => {
    if (loading) return;
    setLoading(true);
    setResult(null);
    try {
      const outcome = await triggerAdministraS2sHealthTest({ currentUser });
      setResult(outcome);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      data-testid="temp-administra-s2s-card"
      className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 shadow-sm space-y-3"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-amber-700 shrink-0" />
            <span className="text-xs font-black uppercase tracking-wider text-slate-800">
              Teste S2S Administra
            </span>
            <span className="px-2 py-0.5 rounded bg-amber-200/80 text-amber-900 text-[10px] font-black uppercase tracking-wider">
              Temporário
            </span>
          </div>
          <p className="text-xs text-slate-600">
            Botão administrativo temporário para validar a conectividade server-side S2S-V2 com o Administra Barragens.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleRunTest()}
          disabled={loading}
          className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-slate-800 disabled:opacity-60 self-start sm:self-auto shrink-0 cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Testando S2S...
            </>
          ) : (
            <>
              <ShieldAlert size={14} />
              Testar S2S Administra (Temporário)
            </>
          )}
        </button>
      </div>

      {result && (
        <div
          role={result.ok ? 'status' : 'alert'}
          className={`rounded-xl border px-3.5 py-2.5 text-xs font-medium flex items-center gap-2 ${
            result.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {result.ok ? (
            <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
          ) : (
            <XCircle size={15} className="shrink-0 text-red-600" />
          )}
          <span>{result.message}</span>
        </div>
      )}
    </div>
  );
};
