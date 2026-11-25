// TEMPORÁRIO: componente exclusivo para validação administrativa da chamada S2S-V2
// contra GET /api/v2/barragens?limit=1. Remover este arquivo e a renderização em
// components/EcosystemHub.tsx após o teste.

import React, { useContext, useState } from 'react';
import { CheckCircle2, Loader2, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react';
import { AuthContext } from '../src/contexts/AuthContext';
import { isSupabaseConfigured, supabase } from '../src/supabaseClient';
import { User } from '../types';

export const TEMP_S2S_BARRAGENS_TEST_ENDPOINT = '/api/administra-s2s-barragens-test';

export type TempMaskingPolicyDisplay =
  | string
  | Record<string, string | boolean | number>
  | null;

export interface TempS2sBarragensTestResult {
  ok: boolean;
  httpStatus?: number;
  maskingPolicy?: TempMaskingPolicyDisplay;
  message: string;
}

export interface TriggerAdministraS2sBarragensDeps {
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

function formatMaskingPolicy(policy: unknown): string {
  if (policy === null || policy === undefined) {
    return 'não informada';
  }
  if (typeof policy === 'string') {
    const clean = policy.trim();
    return clean || 'não informada';
  }
  if (typeof policy === 'object' && !Array.isArray(policy)) {
    const pairs = Object.entries(policy as Record<string, unknown>)
      .filter(
        ([, v]) =>
          typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number'
      )
      .map(([k, v]) => `${k}: ${String(v)}`);
    return pairs.length > 0 ? pairs.join(', ') : 'não informada';
  }
  return 'não informada';
}

export async function triggerAdministraS2sBarragensTest(
  deps: TriggerAdministraS2sBarragensDeps
): Promise<TempS2sBarragensTestResult> {
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
    const response = await fetchFn(TEMP_S2S_BARRAGENS_TEST_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const json = (await response.json().catch(() => null)) as {
      ok?: unknown;
      status?: unknown;
      maskingPolicy?: unknown;
    } | null;

    if (
      response.ok &&
      json?.ok === true &&
      typeof json?.status === 'number' &&
      Number.isInteger(json.status)
    ) {
      const policyLabel = formatMaskingPolicy(json.maskingPolicy);
      return {
        ok: true,
        httpStatus: json.status,
        maskingPolicy:
          typeof json.maskingPolicy === 'string' ||
          (json.maskingPolicy &&
            typeof json.maskingPolicy === 'object' &&
            !Array.isArray(json.maskingPolicy))
            ? (json.maskingPolicy as TempMaskingPolicyDisplay)
            : null,
        message: `Teste S2S concluído com sucesso (HTTP ${json.status}). Política de mascaramento: ${policyLabel}.`,
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        httpStatus: response.status,
        message: 'Acesso não autorizado para executar o teste S2S.',
      };
    }

    if (response.status === 404) {
      return {
        ok: false,
        httpStatus: 404,
        message: 'Teste temporário S2S desabilitado no servidor.',
      };
    }

    if (response.status === 429) {
      return {
        ok: false,
        httpStatus: 429,
        message: 'Aguarde alguns segundos antes de repetir o teste S2S.',
      };
    }

    const upstreamStatus =
      typeof json?.status === 'number' && Number.isInteger(json.status)
        ? json.status
        : response.status;

    return {
      ok: false,
      httpStatus: upstreamStatus,
      message: `Falha ao executar o teste S2S (HTTP ${upstreamStatus}).`,
    };
  } catch {
    return {
      ok: false,
      message: 'Falha ao executar o teste S2S com o Administra.',
    };
  }
}

export const AdministraS2sBarragensTempTestCard: React.FC = () => {
  const { currentUser } = useContext(AuthContext);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TempS2sBarragensTestResult | null>(null);

  if (!currentUser || currentUser.role !== 'Administrador') {
    return null;
  }

  const handleRunTest = async () => {
    if (loading) return;
    setLoading(true);
    setResult(null);
    try {
      const outcome = await triggerAdministraS2sBarragensTest({ currentUser });
      setResult(outcome);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      data-testid="temp-administra-s2s-barragens-card"
      className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 shadow-sm space-y-3"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-amber-700 shrink-0" />
            <span className="text-xs font-black uppercase tracking-wider text-slate-800">
              Teste S2S Barragens Administra
            </span>
            <span className="px-2 py-0.5 rounded bg-amber-200/80 text-amber-900 text-[10px] font-black uppercase tracking-wider">
              Temporário
            </span>
          </div>
          <p className="text-xs text-slate-600">
            Validação administrativa temporária da chamada server-side S2S-V2 (sem retorno de registros ao navegador).
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
              Testar S2S Barragens (Temporário)
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
