import crypto from 'node:crypto';
import {
  EMPTY_BODY_SHA256,
  readAdministraS2sEnv,
  S2S_V2_VERSION,
  signS2sV2Canonical,
  type S2sV2HealthHeaders,
} from './administraS2sHealth.ts';

export const ADMINISTRA_BARRAGENS_TEST_PATH = '/api/v2/barragens';
export const ADMINISTRA_BARRAGENS_TEST_QUERY = 'limit=1';
export const ADMINISTRA_BARRAGENS_REQUIRED_SCOPE = 'barragens:read';

export type SafeMaskingPolicyValue =
  | string
  | Record<string, string | boolean | number>
  | null;

export interface AdministraBarragensS2sTestResult {
  ok: boolean;
  status: number;
  maskingPolicy: SafeMaskingPolicyValue;
}

function assertSingleLineValue(value: string, fieldName: string): string {
  const clean = value.trim();
  if (!clean) {
    throw new Error(`${fieldName} não configurado.`);
  }
  if (/[\r\n]/.test(clean)) {
    throw new Error(`${fieldName} contém quebra de linha inválida.`);
  }
  return clean;
}

export function resolveAdministraBarragensTestUrl(rawBaseUrl: string): string {
  const trimmed = rawBaseUrl.trim();
  if (!trimmed) {
    throw new Error('ADMINISTRA_API_BASE_URL não configurada.');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('ADMINISTRA_API_BASE_URL inválida.');
  }

  const isLocalhost =
    parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !isLocalhost) {
    throw new Error('ADMINISTRA_API_BASE_URL deve utilizar protocolo HTTPS.');
  }

  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    throw new Error(
      'ADMINISTRA_API_BASE_URL deve conter apenas a URL-base, sem caminho.'
    );
  }

  if (parsed.search || parsed.hash) {
    throw new Error(
      'ADMINISTRA_API_BASE_URL não deve conter query string nem fragmento.'
    );
  }

  return `${parsed.origin}${ADMINISTRA_BARRAGENS_TEST_PATH}?${ADMINISTRA_BARRAGENS_TEST_QUERY}`;
}

export function buildS2sV2BarragensTestCanonicalString(input: {
  keyId: string;
  timestamp: string;
  jti: string;
}): string {
  const keyId = assertSingleLineValue(input.keyId, 'CLASSIFICA_S2S_KID');
  const timestamp = assertSingleLineValue(input.timestamp, 'timestamp');
  if (!/^\d+$/.test(timestamp)) {
    throw new Error('timestamp deve ser Unix em segundos.');
  }
  const jti = assertSingleLineValue(input.jti, 'jti');

  const lines = [
    S2S_V2_VERSION,
    'GET',
    ADMINISTRA_BARRAGENS_TEST_PATH,
    ADMINISTRA_BARRAGENS_TEST_QUERY,
    '',
    EMPTY_BODY_SHA256,
    keyId,
    timestamp,
    jti,
    '|',
  ];

  return lines.join('\n');
}

export function createAdministraS2sBarragensHeaders(params: {
  keyId: string;
  privateKeyPem: string;
  timestamp?: string;
  jti?: string;
}): {
  headers: S2sV2HealthHeaders;
  canonicalString: string;
  timestamp: string;
  jti: string;
} {
  const timestamp =
    params.timestamp ?? String(Math.floor(Date.now() / 1000));
  const jti = params.jti ?? crypto.randomUUID();
  const keyId = assertSingleLineValue(params.keyId, 'CLASSIFICA_S2S_KID');

  const canonicalString = buildS2sV2BarragensTestCanonicalString({
    keyId,
    timestamp,
    jti,
  });
  const signature = signS2sV2Canonical(canonicalString, params.privateKeyPem);

  return {
    canonicalString,
    timestamp,
    jti,
    headers: {
      'x-s2s-key-id': keyId,
      'x-s2s-timestamp': timestamp,
      'x-s2s-jti': jti,
      'x-s2s-body-sha256': EMPTY_BODY_SHA256,
      'x-s2s-signature': signature,
    },
  };
}

const FORBIDDEN_POLICY_DATA_KEYS = new Set([
  'items',
  'data',
  'barragens',
  'records',
  'rows',
  'results',
  'empreendedor',
  'empreendedores',
  'responsavel_tecnico',
  'rts',
  'cpf',
  'cnpj',
  'cpf_cnpj',
  'email',
  'telefone',
  'endereco',
  'coordenadas',
  'latitude',
  'longitude',
  'nome',
  'razao_social',
]);

function sanitizeMaskingPolicyCandidate(candidate: unknown): SafeMaskingPolicyValue {
  if (candidate === null || candidate === undefined) return null;

  if (typeof candidate === 'string') {
    const trimmed = candidate.trim().slice(0, 120);
    return trimmed || null;
  }

  if (typeof candidate === 'boolean' || typeof candidate === 'number') {
    return String(candidate);
  }

  if (typeof candidate === 'object' && !Array.isArray(candidate)) {
    const sanitized: Record<string, string | boolean | number> = {};
    const entries = Object.entries(candidate as Record<string, unknown>).slice(0, 16);
    for (const [rawKey, val] of entries) {
      const key = rawKey.trim().slice(0, 64);
      if (!key || FORBIDDEN_POLICY_DATA_KEYS.has(key.toLowerCase())) {
        continue;
      }
      if (typeof val === 'string') {
        const clean = val.trim().slice(0, 120);
        if (clean) sanitized[key] = clean;
      } else if (typeof val === 'boolean') {
        sanitized[key] = val;
      } else if (typeof val === 'number' && Number.isFinite(val)) {
        sanitized[key] = val;
      }
    }
    return Object.keys(sanitized).length > 0 ? sanitized : null;
  }

  return null;
}

export function extractSafeMaskingPolicy(
  headers: Headers | Record<string, string | undefined>,
  parsedBody: unknown
): SafeMaskingPolicyValue {
  const headerGet = (name: string): string | null => {
    if (headers instanceof Headers) {
      return headers.get(name);
    }
    const lower = name.toLowerCase();
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() === lower && typeof v === 'string') {
        return v;
      }
    }
    return null;
  };

  if (parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody)) {
    const root = parsedBody as Record<string, unknown>;
    const containers: Array<Record<string, unknown>> = [root];
    if (root.meta && typeof root.meta === 'object' && !Array.isArray(root.meta)) {
      containers.push(root.meta as Record<string, unknown>);
    }
    if (root.policy && typeof root.policy === 'object' && !Array.isArray(root.policy)) {
      containers.push(root.policy as Record<string, unknown>);
    }

    const candidateKeys = [
      'masking_policy',
      'maskingPolicy',
      'politica_mascaramento',
      'politicaMascaramento',
      'masking',
      'mascaramento',
    ];

    for (const container of containers) {
      for (const key of candidateKeys) {
        if (key in container) {
          const safe = sanitizeMaskingPolicyCandidate(container[key]);
          if (safe !== null) return safe;
        }
      }
    }
  }

  const headerCandidate =
    headerGet('x-masking-policy') ||
    headerGet('x-politica-mascaramento') ||
    headerGet('x-s2s-masking-policy');
  return sanitizeMaskingPolicyCandidate(headerCandidate);
}

export async function testAdministraBarragensS2s(opts?: {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  timestamp?: string;
  jti?: string;
}): Promise<AdministraBarragensS2sTestResult> {
  if (typeof window !== 'undefined') {
    throw new Error('Cliente S2S-V2 só pode ser executado no servidor.');
  }

  // Escopo obrigatório do endpoint: barragens:read (mantido exclusivamente no servidor).
  void ADMINISTRA_BARRAGENS_REQUIRED_SCOPE;

  const config = readAdministraS2sEnv(opts?.env ?? process.env);
  const url = resolveAdministraBarragensTestUrl(config.baseUrl);
  const { headers } = createAdministraS2sBarragensHeaders({
    keyId: config.keyId,
    privateKeyPem: config.privateKeyPem,
    timestamp: opts?.timestamp,
    jti: opts?.jti,
  });

  const fetchFn = opts?.fetchImpl ?? fetch;
  const timeoutMs = opts?.timeoutMs ?? 10_000;

  const response = await fetchFn(url, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });

  let maskingPolicy: SafeMaskingPolicyValue = null;
  if (response.ok) {
    const rawText = await response.text().catch(() => '');
    let parsedBody: unknown = null;
    if (rawText) {
      try {
        parsedBody = JSON.parse(rawText);
      } catch {
        parsedBody = null;
      }
    }
    maskingPolicy = extractSafeMaskingPolicy(response.headers, parsedBody);
  } else {
    // Descarta o corpo de erro upstream sem armazená-lo nem repassá-lo ao navegador.
    await response.body?.cancel().catch(() => undefined);
  }

  return {
    ok: response.ok,
    status: response.status,
    maskingPolicy: response.ok ? maskingPolicy : null,
  };
}
