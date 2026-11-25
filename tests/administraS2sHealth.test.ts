import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {
  ADMINISTRA_HEALTH_PATH,
  buildS2sV2HealthCanonicalString,
  createAdministraS2sHealthHeaders,
  EMPTY_BODY_SHA256,
  resolveAdministraHealthUrl,
  signS2sV2Canonical,
  testAdministraHealth,
} from '../server/administraS2sHealth';

function generateEphemeralEd25519Pair(): {
  privateKeyPem: string;
  publicKey: crypto.KeyObject;
} {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const privateKeyPem = privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  }) as string;
  return { privateKeyPem, publicKey };
}

test('buildS2sV2HealthCanonicalString gera exatamente 10 linhas separadas por LF sem LF final', () => {
  const keyId = 'classifica-test-kid-01';
  const timestamp = '1764000000';
  const jti = '550e8400-e29b-41d4-a716-446655440000';

  const canonical = buildS2sV2HealthCanonicalString({
    keyId,
    timestamp,
    jti,
  });

  assert.equal(canonical.endsWith('\n'), false);
  const lines = canonical.split('\n');
  assert.equal(lines.length, 10);
  assert.deepEqual(lines, [
    'S2S-V2',
    'GET',
    '/api/v2/health',
    '',
    '',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    keyId,
    timestamp,
    jti,
    '|',
  ]);
});

test('createAdministraS2sHealthHeaders gera JTI UUID, timestamp Unix em segundos e assinatura Ed25519 verificável', () => {
  const { privateKeyPem, publicKey } = generateEphemeralEd25519Pair();
  const keyId = 'classifica-test-kid-02';

  const beforeSec = Math.floor(Date.now() / 1000);
  const created = createAdministraS2sHealthHeaders({
    keyId,
    privateKeyPem,
  });
  const afterSec = Math.floor(Date.now() / 1000);

  assert.match(
    created.jti,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  );
  assert.match(created.timestamp, /^\d+$/);
  const tsNum = Number(created.timestamp);
  assert.ok(tsNum >= beforeSec && tsNum <= afterSec + 1);

  assert.equal(created.headers['x-s2s-key-id'], keyId);
  assert.equal(created.headers['x-s2s-timestamp'], created.timestamp);
  assert.equal(created.headers['x-s2s-jti'], created.jti);
  assert.equal(created.headers['x-s2s-body-sha256'], EMPTY_BODY_SHA256);

  const isValid = crypto.verify(
    null,
    Buffer.from(created.canonicalString, 'utf8'),
    publicKey,
    Buffer.from(created.headers['x-s2s-signature'], 'base64')
  );
  assert.equal(isValid, true);

  // Também aceita PEM PKCS8 serializado com \\n em variáveis de ambiente
  const escapedPem = privateKeyPem.replace(/\n/g, '\\n');
  const escapedSig = signS2sV2Canonical(created.canonicalString, escapedPem);
  assert.equal(escapedSig, created.headers['x-s2s-signature']);
});

test('rejeita chaves não-Ed25519, quebras de linha em campos e URLs inválidas', () => {
  const { privateKey: rsaKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const rsaPem = rsaKey.export({ type: 'pkcs8', format: 'pem' }) as string;

  assert.throws(
    () =>
      signS2sV2Canonical(
        buildS2sV2HealthCanonicalString({
          keyId: 'kid-rsa',
          timestamp: '1764000000',
          jti: crypto.randomUUID(),
        }),
        rsaPem
      ),
    /Ed25519/
  );

  assert.throws(
    () =>
      buildS2sV2HealthCanonicalString({
        keyId: 'kid\ninject',
        timestamp: '1764000000',
        jti: crypto.randomUUID(),
      }),
    /quebra de linha/
  );

  assert.throws(
    () => resolveAdministraHealthUrl('https://administra.exemplo.gov.br/api/v2/health'),
    /sem caminho/
  );
  assert.throws(
    () => resolveAdministraHealthUrl('http://administra.exemplo.gov.br'),
    /HTTPS/
  );
  assert.equal(
    resolveAdministraHealthUrl('https://administra.exemplo.gov.br/'),
    'https://administra.exemplo.gov.br/api/v2/health'
  );
});

test('testAdministraHealth executa GET sem Content-Type com cabeçalhos S2S-V2 válidos contra servidor HTTP local simulado', async () => {
  const { privateKeyPem, publicKey } = generateEphemeralEd25519Pair();
  const keyId = 'classifica-test-kid-http';

  let observedMethod: string | undefined;
  let observedUrl: string | undefined;
  let observedContentType: string | string[] | undefined;
  let observedHeaders: http.IncomingHttpHeaders = {};
  let verifiedSignature = false;

  const server = http.createServer((req, res) => {
    observedMethod = req.method;
    observedUrl = req.url;
    observedContentType = req.headers['content-type'];
    observedHeaders = req.headers;

    const canonicalFromRequest = [
      'S2S-V2',
      req.method || '',
      req.url || '',
      '',
      '',
      String(req.headers['x-s2s-body-sha256'] || ''),
      String(req.headers['x-s2s-key-id'] || ''),
      String(req.headers['x-s2s-timestamp'] || ''),
      String(req.headers['x-s2s-jti'] || ''),
      '|',
    ].join('\n');

    const sig = String(req.headers['x-s2s-signature'] || '');
    verifiedSignature = crypto.verify(
      null,
      Buffer.from(canonicalFromRequest, 'utf8'),
      publicKey,
      Buffer.from(sig, 'base64')
    );

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, service: 'administra-mock' }));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  try {
    const addr = server.address();
    assert.ok(addr && typeof addr !== 'string');
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    const result = await testAdministraHealth({
      env: {
        ADMINISTRA_API_BASE_URL: baseUrl,
        CLASSIFICA_S2S_KID: keyId,
        CLASSIFICA_S2S_PRIVATE_KEY: privateKeyPem,
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(result.url, `${baseUrl}${ADMINISTRA_HEALTH_PATH}`);
    assert.deepEqual(result.body, { ok: true, service: 'administra-mock' });

    assert.equal(observedMethod, 'GET');
    assert.equal(observedUrl, '/api/v2/health');
    assert.equal(observedContentType, undefined);
    assert.equal(observedHeaders['x-s2s-key-id'], keyId);
    assert.equal(observedHeaders['x-s2s-body-sha256'], EMPTY_BODY_SHA256);
    assert.match(String(observedHeaders['x-s2s-timestamp']), /^\d+$/);
    assert.match(
      String(observedHeaders['x-s2s-jti']),
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    assert.equal(verifiedSignature, true);
  } finally {
    server.closeAllConnections?.();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

test('variáveis S2S e cliente server-side não são referenciados no frontend nem usam prefixo VITE_', () => {
  const s2sSource = fs.readFileSync(
    path.resolve(process.cwd(), 'server/administraS2sHealth.ts'),
    'utf8'
  );
  assert.equal(s2sSource.includes('VITE_'), false);

  const clientRoots = ['src', 'components', 'App.tsx'];
  const forbiddenNames = [
    'CLASSIFICA_S2S_PRIVATE_KEY',
    'CLASSIFICA_S2S_KID',
    'ADMINISTRA_API_BASE_URL',
    'administraS2sHealth',
  ];

  const collectTsFiles = (entry: string): string[] => {
    const full = path.resolve(process.cwd(), entry);
    if (!fs.existsSync(full)) return [];
    const stat = fs.statSync(full);
    if (stat.isFile()) return [full];
    const files: string[] = [];
    for (const item of fs.readdirSync(full)) {
      files.push(...collectTsFiles(path.join(entry, item)));
    }
    return files;
  };

  for (const root of clientRoots) {
    for (const filePath of collectTsFiles(root)) {
      const content = fs.readFileSync(filePath, 'utf8');
      for (const name of forbiddenNames) {
        assert.equal(
          content.includes(name),
          false,
          `${filePath} não deve referenciar ${name}`
        );
      }
    }
  }
});
