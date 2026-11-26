import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

export const S2S_V2_VERSION = 'S2S-V2';
export const ADMINISTRA_HEALTH_PATH = '/api/v2/health';
export const ADMINISTRA_BARRAGENS_V2_PATH = '/api/v2/barragens';
export const ADMINISTRA_S2S_V2_SCOPES = {
  [ADMINISTRA_HEALTH_PATH]: 'health:read',
  [ADMINISTRA_BARRAGENS_V2_PATH]: 'barragens:read',
} as const;
export type AllowedAdministraS2sPath = keyof typeof ADMINISTRA_S2S_V2_SCOPES;

const ALLOWED_ADMINISTRA_S2S_PATHS = new Set<string>([
  ADMINISTRA_HEALTH_PATH,
  ADMINISTRA_BARRAGENS_V2_PATH,
]);

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const EMPTY_BODY_SHA256 =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

export interface S2sV2HealthCanonicalInput {
  keyId: string;
  timestamp: string;
  jti: string;
}

export interface AdministraS2sEnvConfig {
  baseUrl: string;
  keyId: string;
  privateKeyPem: string;
}

export type S2sV2HealthHeaders = {
  'x-s2s-key-id': string;
  'x-s2s-timestamp': string;
  'x-s2s-jti': string;
  'x-s2s-body-sha256': string;
  'x-s2s-signature': string;
};

export interface AdministraHealthCheckResult {
  ok: boolean;
  status: number;
  url: string;
  keyId: string;
  timestamp: string;
  jti: string;
  bodySha256: string;
  body: unknown;
}

export interface AdministraS2sGetResult {
  ok: boolean;
  status: number;
  body: unknown;
  headers: Headers;
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

function assertUuidV4(value: string, fieldName = 'jti'): string {
  const clean = assertSingleLineValue(value, fieldName);
  if (!UUID_V4_REGEX.test(clean)) {
    throw new Error(`${fieldName} deve ser um UUID v4 válido.`);
  }
  return clean;
}

export function assertAllowedAdministraS2sPath(
  rawPath: string
): AllowedAdministraS2sPath {
  const clean = assertSingleLineValue(rawPath, 'path');
  if (clean.includes('?') || clean.includes('#')) {
    throw new Error('path S2S não deve conter query string nem fragmento.');
  }
  const normalized = normalizeS2sPath(clean);
  if (!ALLOWED_ADMINISTRA_S2S_PATHS.has(normalized)) {
    throw new Error(
      `Endpoint S2S-V2 não permitido: ${normalized}. Permitidos apenas ${ADMINISTRA_HEALTH_PATH} e ${ADMINISTRA_BARRAGENS_V2_PATH}.`
    );
  }
  return normalized as AllowedAdministraS2sPath;
}

export function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

export function normalizePkcs8Pem(rawPem: string): string {
  const normalized = rawPem.replace(/\\n/g, '\n').trim();
  if (!normalized) {
    throw new Error('CLASSIFICA_S2S_PRIVATE_KEY não configurada.');
  }
  return normalized;
}

export function parseEd25519PrivateKey(rawPem: string): crypto.KeyObject {
  const normalizedPem = normalizePkcs8Pem(rawPem);
  let keyObject: crypto.KeyObject;
  try {
    keyObject = crypto.createPrivateKey({
      key: normalizedPem,
      format: 'pem',
      type: 'pkcs8',
    });
  } catch {
    throw new Error(
      'CLASSIFICA_S2S_PRIVATE_KEY inválida: esperado PEM PKCS8 válido.'
    );
  }
  if (keyObject.asymmetricKeyType !== 'ed25519') {
    throw new Error('CLASSIFICA_S2S_PRIVATE_KEY deve ser uma chave Ed25519.');
  }
  return keyObject;
}

export function resolveAdministraS2sUrl(
  rawBaseUrl: string,
  rawPath: string,
  rawQuery = '',
  opts?: { env?: NodeJS.ProcessEnv }
): string {
  const trimmed = rawBaseUrl.trim();
  if (!trimmed) {
    throw new Error('ADMINISTRA_API_URL não configurada.');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('ADMINISTRA_API_URL inválida.');
  }

  if (parsed.username || parsed.password || /^[^/]+:\/\/[^/]*@/.test(trimmed)) {
    throw new Error('ADMINISTRA_API_URL não deve conter credenciais.');
  }

  const runtimeEnv = opts?.env ?? process.env;
  const isProduction =
    runtimeEnv.NODE_ENV === 'production' ||
    runtimeEnv.VERCEL_ENV === 'production';
  const isLocalhost =
    parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';

  if (isProduction) {
    if (parsed.protocol !== 'https:') {
      throw new Error(
        'ADMINISTRA_API_URL deve utilizar protocolo HTTPS em produção.'
      );
    }
  } else if (parsed.protocol !== 'https:' && !isLocalhost) {
    throw new Error('ADMINISTRA_API_URL deve utilizar protocolo HTTPS.');
  }

  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    throw new Error(
      'ADMINISTRA_API_URL deve conter apenas a URL-base, sem caminho.'
    );
  }

  if (
    parsed.search ||
    parsed.hash ||
    trimmed.includes('?') ||
    trimmed.includes('#')
  ) {
    throw new Error(
      'ADMINISTRA_API_URL não deve conter query string nem fragmento.'
    );
  }

  const normalizedPath = assertAllowedAdministraS2sPath(rawPath);
  const canonicalQuery = canonicalizeS2sQuery(rawQuery);
  return `${parsed.origin}${normalizedPath}${canonicalQuery ? `?${canonicalQuery}` : ''}`;
}

export function resolveAdministraHealthUrl(
  rawBaseUrl: string,
  opts?: { env?: NodeJS.ProcessEnv }
): string {
  return resolveAdministraS2sUrl(rawBaseUrl, ADMINISTRA_HEALTH_PATH, '', opts);
}

export function normalizeS2sPath(rawPath: string): string {
  const clean = assertSingleLineValue(rawPath, 'path');
  const withLeadingSlash = clean.startsWith('/') ? clean : `/${clean}`;
  return withLeadingSlash.length > 1
    ? withLeadingSlash.replace(/\/+$/, '')
    : withLeadingSlash;
}

export function canonicalizeS2sQuery(rawQuery = ''): string {
  const trimmed = rawQuery.trim().replace(/^\?/, '');
  if (!trimmed) return '';
  if (/[\r\n]/.test(trimmed)) {
    throw new Error('query contém quebra de linha inválida.');
  }
  const params = new URLSearchParams(trimmed);
  const encodedPairs = Array.from(params.entries())
    .map(([key, val]) => [encodeRfc3986(key), encodeRfc3986(val)] as const)
    .sort(([aKey, aVal], [bKey, bVal]) => {
      if (aKey !== bKey) return aKey < bKey ? -1 : 1;
      return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    });
  return encodedPairs.map(([key, val]) => `${key}=${val}`).join('&');
}

export interface S2sV2CanonicalInput {
  method: string;
  path: string;
  query?: string;
  contentType?: string;
  bodySha256?: string;
  keyId: string;
  timestamp: string;
  jti: string;
  actorSegment?: string;
}

export function buildS2sV2CanonicalString(input: S2sV2CanonicalInput): string {
  const method = assertSingleLineValue(input.method, 'method').toUpperCase();
  if (method !== 'GET') {
    throw new Error(`Método S2S-V2 não permitido: ${method}. Permitido apenas GET.`);
  }
  const normalizedPath = assertAllowedAdministraS2sPath(input.path);
  const canonicalQuery = canonicalizeS2sQuery(input.query ?? '');
  const contentType = (input.contentType ?? '').trim();
  if (/[\r\n]/.test(contentType)) {
    throw new Error('contentType contém quebra de linha inválida.');
  }
  const bodySha256 = assertSingleLineValue(
    input.bodySha256 ?? EMPTY_BODY_SHA256,
    'bodySha256'
  );
  const keyId = assertSingleLineValue(input.keyId, 'CLASSIFICA_S2S_KID');
  const timestamp = assertSingleLineValue(input.timestamp, 'timestamp');
  if (!/^\d+$/.test(timestamp)) {
    throw new Error('timestamp deve ser Unix em segundos.');
  }
  const jti = assertUuidV4(input.jti, 'jti');
  const actorSegment = input.actorSegment ?? '|';
  if (/[\r\n]/.test(actorSegment)) {
    throw new Error('actorSegment contém quebra de linha inválida.');
  }

  return [
    S2S_V2_VERSION,
    method,
    normalizedPath,
    canonicalQuery,
    contentType,
    bodySha256,
    keyId,
    timestamp,
    jti,
    actorSegment,
  ].join('\n');
}

export function buildS2sV2HealthCanonicalString(
  input: S2sV2HealthCanonicalInput
): string {
  return buildS2sV2CanonicalString({
    method: 'GET',
    path: ADMINISTRA_HEALTH_PATH,
    query: '',
    contentType: '',
    bodySha256: EMPTY_BODY_SHA256,
    keyId: input.keyId,
    timestamp: input.timestamp,
    jti: input.jti,
  });
}

export function signS2sV2Canonical(
  canonicalString: string,
  privateKeyPem: string
): string {
  const privateKey = parseEd25519PrivateKey(privateKeyPem);
  const signature = crypto.sign(
    null,
    Buffer.from(canonicalString, 'utf8'),
    privateKey
  );
  return signature.toString('base64url');
}

export function createAdministraS2sHeaders(params: {
  method: string;
  path: string;
  query?: string;
  contentType?: string;
  bodySha256?: string;
  keyId: string;
  privateKeyPem: string;
  timestamp?: string;
  jti?: string;
  actorSegment?: string;
}): {
  headers: S2sV2HealthHeaders;
  canonicalString: string;
  timestamp: string;
  jti: string;
} {
  const timestamp =
    params.timestamp ?? String(Math.floor(Date.now() / 1000));
  const jti = assertUuidV4(params.jti ?? crypto.randomUUID(), 'jti');
  const keyId = assertSingleLineValue(params.keyId, 'CLASSIFICA_S2S_KID');
  const bodySha256 = assertSingleLineValue(
    params.bodySha256 ?? EMPTY_BODY_SHA256,
    'bodySha256'
  );

  const canonicalString = buildS2sV2CanonicalString({
    method: params.method,
    path: params.path,
    query: params.query,
    contentType: params.contentType,
    bodySha256,
    keyId,
    timestamp,
    jti,
    actorSegment: params.actorSegment,
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
      'x-s2s-body-sha256': bodySha256,
      'x-s2s-signature': signature,
    },
  };
}

export function createAdministraS2sHealthHeaders(params: {
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
  return createAdministraS2sHeaders({
    method: 'GET',
    path: ADMINISTRA_HEALTH_PATH,
    query: '',
    contentType: '',
    bodySha256: EMPTY_BODY_SHA256,
    keyId: params.keyId,
    privateKeyPem: params.privateKeyPem,
    timestamp: params.timestamp,
    jti: params.jti,
  });
}

export function readAdministraS2sEnv(
  env: NodeJS.ProcessEnv = process.env
): AdministraS2sEnvConfig {
  const baseUrl =
    (env.ADMINISTRA_API_URL || '').trim() ||
    (env.ADMINISTRA_API_BASE_URL || '').trim();
  const keyId = (env.CLASSIFICA_S2S_KID || '').trim();
  const privateKeyPem = (env.CLASSIFICA_S2S_PRIVATE_KEY || '').trim();

  if (!baseUrl) {
    throw new Error('ADMINISTRA_API_URL não configurada no servidor.');
  }
  if (!keyId) {
    throw new Error('CLASSIFICA_S2S_KID não configurado no servidor.');
  }
  if (!privateKeyPem) {
    throw new Error('CLASSIFICA_S2S_PRIVATE_KEY não configurada no servidor.');
  }

  return {
    baseUrl,
    keyId,
    privateKeyPem,
  };
}

function assertCleanS2sHeaders(headers: S2sV2HealthHeaders): void {
  for (const key of Object.keys(headers)) {
    const lower = key.toLowerCase();
    if (lower === 'authorization' || lower.startsWith('x-consumer-')) {
      throw new Error(`Cabeçalho S2S-V2 proibido detectado: ${key}`);
    }
  }
}

export async function requestAdministraS2sGet(params: {
  path: string;
  query?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  timestamp?: string;
}): Promise<AdministraS2sGetResult> {
  if (typeof window !== 'undefined') {
    throw new Error(
      'Cliente S2S-V2 só pode ser executado no servidor.'
    );
  }

  const runtimeEnv = params.env ?? process.env;
  const config = readAdministraS2sEnv(runtimeEnv);
  const canonicalQuery = canonicalizeS2sQuery(params.query ?? '');
  const normalizedPath = assertAllowedAdministraS2sPath(params.path);
  const url = resolveAdministraS2sUrl(
    config.baseUrl,
    normalizedPath,
    canonicalQuery,
    { env: runtimeEnv }
  );
  const { headers } = createAdministraS2sHeaders({
    method: 'GET',
    path: normalizedPath,
    query: canonicalQuery,
    contentType: '',
    bodySha256: EMPTY_BODY_SHA256,
    keyId: config.keyId,
    privateKeyPem: config.privateKeyPem,
    timestamp: params.timestamp,
    jti: crypto.randomUUID(),
  });
  assertCleanS2sHeaders(headers);

  const fetchFn = params.fetchImpl ?? fetch;
  const timeoutMs = params.timeoutMs ?? 8_000;

  const response = await fetchFn(url, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });

  const rawText = await response.text();
  let parsedBody: unknown = null;
  if (rawText) {
    try {
      parsedBody = JSON.parse(rawText);
    } catch {
      parsedBody = null;
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    body: parsedBody,
    headers: response.headers,
  };
}

export async function testAdministraHealth(opts?: {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  timestamp?: string;
}): Promise<AdministraHealthCheckResult> {
  if (typeof window !== 'undefined') {
    throw new Error(
      'Cliente S2S-V2 só pode ser executado no servidor.'
    );
  }

  const runtimeEnv = opts?.env ?? process.env;
  const config = readAdministraS2sEnv(runtimeEnv);
  const url = resolveAdministraHealthUrl(config.baseUrl, { env: runtimeEnv });
  const { headers, timestamp, jti } = createAdministraS2sHealthHeaders({
    keyId: config.keyId,
    privateKeyPem: config.privateKeyPem,
    timestamp: opts?.timestamp,
    jti: crypto.randomUUID(),
  });
  assertCleanS2sHeaders(headers);

  const fetchFn = opts?.fetchImpl ?? fetch;
  const timeoutMs = opts?.timeoutMs ?? 10_000;

  const response = await fetchFn(url, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });

  const rawText = await response.text();
  let parsedBody: unknown = rawText;
  if (rawText) {
    try {
      parsedBody = JSON.parse(rawText);
    } catch {
      parsedBody = rawText;
    }
  } else {
    parsedBody = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    url,
    keyId: headers['x-s2s-key-id'],
    timestamp,
    jti,
    bodySha256: EMPTY_BODY_SHA256,
    body: parsedBody,
  };
}

const isDirectExecution =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  dotenv.config();
  testAdministraHealth()
    .then((result) => {
      console.log(
        JSON.stringify(
          {
            ok: result.ok,
            status: result.status,
            url: result.url,
            keyId: result.keyId,
            timestamp: result.timestamp,
            jti: result.jti,
            body: result.body,
          },
          null,
          2
        )
      );
      if (!result.ok) {
        process.exitCode = 1;
      }
    })
    .catch((err) => {
      console.error(
        'Falha ao consultar /api/v2/health com S2S-V2:',
        err instanceof Error ? err.message : 'erro inesperado'
      );
      process.exitCode = 1;
    });
}
