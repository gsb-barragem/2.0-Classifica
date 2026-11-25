import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

export const S2S_V2_VERSION = 'S2S-V2';
export const ADMINISTRA_HEALTH_PATH = '/api/v2/health';
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

export function resolveAdministraHealthUrl(rawBaseUrl: string): string {
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

  return `${parsed.origin}${ADMINISTRA_HEALTH_PATH}`;
}

export function buildS2sV2HealthCanonicalString(
  input: S2sV2HealthCanonicalInput
): string {
  const keyId = assertSingleLineValue(input.keyId, 'CLASSIFICA_S2S_KID');
  const timestamp = assertSingleLineValue(input.timestamp, 'timestamp');
  if (!/^\d+$/.test(timestamp)) {
    throw new Error('timestamp deve ser Unix em segundos.');
  }
  const jti = assertSingleLineValue(input.jti, 'jti');

  const lines = [
    S2S_V2_VERSION,
    'GET',
    ADMINISTRA_HEALTH_PATH,
    '',
    '',
    EMPTY_BODY_SHA256,
    keyId,
    timestamp,
    jti,
    '|',
  ];

  return lines.join('\n');
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
  return signature.toString('base64');
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
  const timestamp =
    params.timestamp ?? String(Math.floor(Date.now() / 1000));
  const jti = params.jti ?? crypto.randomUUID();
  const keyId = assertSingleLineValue(params.keyId, 'CLASSIFICA_S2S_KID');

  const canonicalString = buildS2sV2HealthCanonicalString({
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

export function readAdministraS2sEnv(
  env: NodeJS.ProcessEnv = process.env
): AdministraS2sEnvConfig {
  const baseUrl = (env.ADMINISTRA_API_BASE_URL || '').trim();
  const keyId = (env.CLASSIFICA_S2S_KID || '').trim();
  const privateKeyPem = (env.CLASSIFICA_S2S_PRIVATE_KEY || '').trim();

  if (!baseUrl) {
    throw new Error('ADMINISTRA_API_BASE_URL não configurada no servidor.');
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

export async function testAdministraHealth(opts?: {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  timestamp?: string;
  jti?: string;
}): Promise<AdministraHealthCheckResult> {
  if (typeof window !== 'undefined') {
    throw new Error(
      'Cliente S2S-V2 só pode ser executado no servidor.'
    );
  }

  const config = readAdministraS2sEnv(opts?.env ?? process.env);
  const url = resolveAdministraHealthUrl(config.baseUrl);
  const { headers, timestamp, jti } = createAdministraS2sHealthHeaders({
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
