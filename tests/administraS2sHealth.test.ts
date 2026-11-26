import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {
  ADMINISTRA_BARRAGENS_V2_PATH,
  ADMINISTRA_HEALTH_PATH,
  ADMINISTRA_S2S_V2_SCOPES,
  buildS2sV2CanonicalString,
  buildS2sV2HealthCanonicalString,
  canonicalizeS2sQuery,
  createAdministraS2sHealthHeaders,
  EMPTY_BODY_SHA256,
  requestAdministraS2sGet,
  resolveAdministraHealthUrl,
  resolveAdministraS2sUrl,
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

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test('buildS2sV2HealthCanonicalString gera exatamente 10 linhas separadas por LF sem LF final (comparação literal)', () => {
  const keyId = 'classifica-test-kid-01';
  const timestamp = '1764000000';
  const jti = '550e8400-e29b-41d4-a716-446655440000';

  const canonical = buildS2sV2HealthCanonicalString({
    keyId,
    timestamp,
    jti,
  });

  const expectedLiteral =
    'S2S-V2\n' +
    'GET\n' +
    '/api/v2/health\n' +
    '\n' +
    '\n' +
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n' +
    'classifica-test-kid-01\n' +
    '1764000000\n' +
    '550e8400-e29b-41d4-a716-446655440000\n' +
    '|';

  assert.equal(canonical.endsWith('\n'), false);
  assert.equal(canonical.split('\n').length, 10);
  assert.equal(canonical, expectedLiteral);
});

test('createAdministraS2sHealthHeaders gera JTI UUID v4, timestamp em segundos, sem Authorization/x-consumer-* e assinatura Ed25519 em base64url', () => {
  const { privateKeyPem, publicKey } = generateEphemeralEd25519Pair();
  const keyId = 'classifica-test-kid-02';

  const beforeSec = Math.floor(Date.now() / 1000);
  const created = createAdministraS2sHealthHeaders({
    keyId,
    privateKeyPem,
  });
  const afterSec = Math.floor(Date.now() / 1000);

  assert.match(created.jti, UUID_V4_RE);
  assert.match(created.timestamp, /^\d+$/);
  const tsNum = Number(created.timestamp);
  assert.ok(tsNum >= beforeSec && tsNum <= afterSec + 1);

  assert.equal(created.headers['x-s2s-key-id'], keyId);
  assert.equal(created.headers['x-s2s-timestamp'], created.timestamp);
  assert.equal(created.headers['x-s2s-jti'], created.jti);
  assert.equal(created.headers['x-s2s-body-sha256'], EMPTY_BODY_SHA256);
  assert.doesNotMatch(created.headers['x-s2s-signature'], /[+/=]/);

  const headerKeys = Object.keys(created.headers).map((k) => k.toLowerCase());
  assert.equal(headerKeys.includes('authorization'), false);
  assert.equal(
    headerKeys.some((k) => k.startsWith('x-consumer-')),
    false
  );

  const expectedCanonicalLiteral =
    'S2S-V2\n' +
    'GET\n' +
    '/api/v2/health\n' +
    '\n' +
    '\n' +
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n' +
    'classifica-test-kid-02\n' +
    `${created.timestamp}\n` +
    `${created.jti}\n` +
    '|';

  const isValid = crypto.verify(
    null,
    Buffer.from(expectedCanonicalLiteral, 'utf8'),
    publicKey,
    Buffer.from(created.headers['x-s2s-signature'], 'base64url')
  );
  assert.equal(isValid, true);

  // Também aceita PEM PKCS8 serializado com \\n em variáveis de ambiente
  const fixedLiteral =
    'S2S-V2\n' +
    'GET\n' +
    '/api/v2/health\n' +
    '\n' +
    '\n' +
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n' +
    'classifica-test-kid-02\n' +
    '1764000000\n' +
    '550e8400-e29b-41d4-a716-446655440000\n' +
    '|';
  const escapedPem = privateKeyPem.replace(/\n/g, '\\n');
  const escapedSig = signS2sV2Canonical(fixedLiteral, escapedPem);
  assert.doesNotMatch(escapedSig, /[+/=]/);
  assert.equal(
    crypto.verify(
      null,
      Buffer.from(fixedLiteral, 'utf8'),
      publicKey,
      Buffer.from(escapedSig, 'base64url')
    ),
    true
  );
});

test('cliente restringe endpoints apenas a GET /api/v2/health (health:read) e GET /api/v2/barragens (barragens:read) e rejeita /empreendedores', async () => {
  assert.deepEqual(ADMINISTRA_S2S_V2_SCOPES, {
    '/api/v2/health': 'health:read',
    '/api/v2/barragens': 'barragens:read',
  });

  const { privateKeyPem } = generateEphemeralEd25519Pair();

  for (const forbiddenPath of [
    '/api/v2/empreendedores',
    '/empreendedores',
    '/api/v1/barragens',
    '/api/v2/rts',
  ]) {
    assert.throws(
      () => resolveAdministraS2sUrl('https://administra.exemplo.gov.br', forbiddenPath),
      /Endpoint S2S-V2 não permitido/
    );
    assert.throws(
      () =>
        buildS2sV2CanonicalString({
          method: 'GET',
          path: forbiddenPath,
          keyId: 'kid-1',
          timestamp: '1764000000',
          jti: '550e8400-e29b-41d4-a716-446655440000',
        }),
      /Endpoint S2S-V2 não permitido/
    );
    await assert.rejects(
      () =>
        requestAdministraS2sGet({
          path: forbiddenPath,
          env: {
            ADMINISTRA_API_URL: 'https://administra.exemplo.gov.br',
            CLASSIFICA_S2S_KID: 'kid-1',
            CLASSIFICA_S2S_PRIVATE_KEY: privateKeyPem,
          },
          fetchImpl: async () => {
            throw new Error('não deveria chamar fetch para endpoint proibido');
          },
        }),
      /Endpoint S2S-V2 não permitido/
    );
  }

  assert.throws(
    () =>
      buildS2sV2CanonicalString({
        method: 'POST',
        path: ADMINISTRA_BARRAGENS_V2_PATH,
        keyId: 'kid-1',
        timestamp: '1764000000',
        jti: '550e8400-e29b-41d4-a716-446655440000',
      }),
    /Método S2S-V2 não permitido/
  );
});

test('canonicalizeS2sQuery aplica RFC 3986 estrita (%20 e !\'()* codificados) e ordenação lexicográfica', () => {
  const canonical = canonicalizeS2sQuery("z=a b!c'd(e)f*g&a=São Paulo&a=Alpha");
  assert.equal(
    canonical,
    'a=Alpha&a=S%C3%A3o%20Paulo&z=a%20b%21c%27d%28e%29f%2Ag'
  );
  assert.equal(canonical.includes('+'), false);

  const canonicalMsg = buildS2sV2CanonicalString({
    method: 'GET',
    path: ADMINISTRA_BARRAGENS_V2_PATH,
    query: "limit=10&cursor=cur 1!'()*",
    keyId: 'kid-rfc',
    timestamp: '1764000000',
    jti: '550e8400-e29b-41d4-a716-446655440000',
  });
  const expectedLiteral =
    'S2S-V2\n' +
    'GET\n' +
    '/api/v2/barragens\n' +
    'cursor=cur%201%21%27%28%29%2A&limit=10\n' +
    '\n' +
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n' +
    'kid-rfc\n' +
    '1764000000\n' +
    '550e8400-e29b-41d4-a716-446655440000\n' +
    '|';
  assert.equal(canonicalMsg, expectedLiteral);
});

test('rejeita chaves não-Ed25519, JTI inválido, quebras de linha e ADMINISTRA_API_URL insegura', () => {
  const { privateKey: rsaKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const rsaPem = rsaKey.export({ type: 'pkcs8', format: 'pem' }) as string;

  const validHealthLiteral =
    'S2S-V2\n' +
    'GET\n' +
    '/api/v2/health\n' +
    '\n' +
    '\n' +
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n' +
    'kid-rsa\n' +
    '1764000000\n' +
    '550e8400-e29b-41d4-a716-446655440000\n' +
    '|';

  assert.throws(
    () => signS2sV2Canonical(validHealthLiteral, rsaPem),
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
    () =>
      buildS2sV2HealthCanonicalString({
        keyId: 'kid-1',
        timestamp: '1764000000',
        jti: 'nao-e-uuid-v4',
      }),
    /UUID v4/
  );

  assert.throws(
    () => resolveAdministraHealthUrl('https://administra.exemplo.gov.br/api/v2/health'),
    /sem caminho/
  );
  assert.throws(
    () => resolveAdministraHealthUrl('http://administra.exemplo.gov.br'),
    /HTTPS/
  );
  assert.throws(
    () => resolveAdministraHealthUrl('https://user:pass@administra.exemplo.gov.br'),
    /credenciais/
  );
  assert.throws(
    () => resolveAdministraHealthUrl('https://user@administra.exemplo.gov.br'),
    /credenciais/
  );
  assert.throws(
    () => resolveAdministraHealthUrl('https://administra.exemplo.gov.br?foo=bar'),
    /query string/
  );
  assert.throws(
    () => resolveAdministraHealthUrl('https://administra.exemplo.gov.br/?'),
    /query string/
  );
  assert.throws(
    () => resolveAdministraHealthUrl('https://administra.exemplo.gov.br#frag'),
    /fragmento/
  );
  assert.throws(
    () => resolveAdministraHealthUrl('https://administra.exemplo.gov.br/#'),
    /fragmento/
  );
  assert.throws(
    () =>
      resolveAdministraHealthUrl('http://127.0.0.1:3001', {
        env: { NODE_ENV: 'production' },
      }),
    /HTTPS em produção/
  );
  assert.throws(
    () =>
      resolveAdministraHealthUrl('http://localhost:3001', {
        env: { VERCEL_ENV: 'production' },
      }),
    /HTTPS em produção/
  );
  assert.equal(
    resolveAdministraHealthUrl('https://administra.exemplo.gov.br/', {
      env: { NODE_ENV: 'production' },
    }),
    'https://administra.exemplo.gov.br/api/v2/health'
  );
});

test('testAdministraHealth aceita ADMINISTRA_API_URL, gera JTI UUID v4 novo por chamada e valida assinatura Ed25519 base64url com string canônica literal', async () => {
  const { privateKeyPem, publicKey } = generateEphemeralEd25519Pair();
  const keyId = 'classifica-test-kid-http';

  const observedJtis: string[] = [];
  const observedChecks: Array<{
    method: string | undefined;
    url: string | undefined;
    contentType: string | string[] | undefined;
    authorization: string | string[] | undefined;
    hasConsumerHeader: boolean;
    verified: boolean;
  }> = [];

  const server = http.createServer((req, res) => {
    const timestamp = String(req.headers['x-s2s-timestamp'] || '');
    const jti = String(req.headers['x-s2s-jti'] || '');
    const kid = String(req.headers['x-s2s-key-id'] || '');
    const bodySha = String(req.headers['x-s2s-body-sha256'] || '');
    const sig = String(req.headers['x-s2s-signature'] || '');

    observedJtis.push(jti);

    const canonicalLiteral =
      'S2S-V2\n' +
      'GET\n' +
      '/api/v2/health\n' +
      '\n' +
      '\n' +
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n' +
      `${kid}\n` +
      `${timestamp}\n` +
      `${jti}\n` +
      '|';

    const verified =
      bodySha === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' &&
      !/[+/=]/.test(sig) &&
      crypto.verify(
        null,
        Buffer.from(canonicalLiteral, 'utf8'),
        publicKey,
        Buffer.from(sig, 'base64url')
      );

    observedChecks.push({
      method: req.method,
      url: req.url,
      contentType: req.headers['content-type'],
      authorization: req.headers.authorization,
      hasConsumerHeader: Object.keys(req.headers).some((h) =>
        h.toLowerCase().startsWith('x-consumer-')
      ),
      verified,
    });

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

    const result1 = await testAdministraHealth({
      env: {
        ADMINISTRA_API_URL: baseUrl,
        CLASSIFICA_S2S_KID: keyId,
        CLASSIFICA_S2S_PRIVATE_KEY: privateKeyPem,
      },
    });
    const result2 = await testAdministraHealth({
      env: {
        ADMINISTRA_API_URL: baseUrl,
        CLASSIFICA_S2S_KID: keyId,
        CLASSIFICA_S2S_PRIVATE_KEY: privateKeyPem,
      },
    });

    assert.equal(result1.ok, true);
    assert.equal(result1.status, 200);
    assert.equal(result1.url, `${baseUrl}${ADMINISTRA_HEALTH_PATH}`);
    assert.deepEqual(result1.body, { ok: true, service: 'administra-mock' });
    assert.equal(result2.ok, true);

    assert.equal(observedJtis.length, 2);
    assert.match(observedJtis[0], UUID_V4_RE);
    assert.match(observedJtis[1], UUID_V4_RE);
    assert.notEqual(observedJtis[0], observedJtis[1]);

    for (const check of observedChecks) {
      assert.equal(check.method, 'GET');
      assert.equal(check.url, '/api/v2/health');
      assert.equal(check.contentType, undefined);
      assert.equal(check.authorization, undefined);
      assert.equal(check.hasConsumerHeader, false);
      assert.equal(check.verified, true);
    }
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
    'ADMINISTRA_API_URL',
    'ADMINISTRA_API_BASE_URL',
    'VITE_CLASSIFICA_S2S_',
    'VITE_ADMINISTRA_API_',
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

test('requestAdministraS2sGet assina GET /api/v2/barragens com query RFC 3986, base64url, JTI UUID v4 único e verificação por string canônica literal', async () => {
  const { privateKeyPem, publicKey } = generateEphemeralEd25519Pair();
  const keyId = 'classifica-test-kid-barragens';

  assert.throws(
    () =>
      resolveAdministraS2sUrl(
        'https://administra.exemplo.gov.br',
        '/api/v2/barragens?limit=10'
      ),
    /query string/
  );
  assert.equal(
    resolveAdministraS2sUrl(
      'https://administra.exemplo.gov.br',
      ADMINISTRA_BARRAGENS_V2_PATH,
      'limit=20&cursor=cur 1!'
    ),
    'https://administra.exemplo.gov.br/api/v2/barragens?cursor=cur%201%21&limit=20'
  );

  let observedPathname = '';
  let observedQuery = '';
  let observedAuthHeader: string | undefined;
  let observedConsumerHeaders: string[] = [];
  const observedJtis: string[] = [];
  let verifiedSignature = false;

  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1');
    observedPathname = parsedUrl.pathname;
    observedQuery = parsedUrl.search.replace(/^\?/, '');
    observedAuthHeader = req.headers.authorization;
    observedConsumerHeaders = Object.keys(req.headers).filter((k) =>
      k.toLowerCase().startsWith('x-consumer-')
    );

    const timestamp = String(req.headers['x-s2s-timestamp'] || '');
    const jti = String(req.headers['x-s2s-jti'] || '');
    observedJtis.push(jti);

    const expectedLiteral =
      'S2S-V2\n' +
      'GET\n' +
      '/api/v2/barragens\n' +
      'cursor=cur_1&limit=20\n' +
      '\n' +
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n' +
      `${String(req.headers['x-s2s-key-id'] || '')}\n` +
      `${timestamp}\n` +
      `${jti}\n` +
      '|';

    const sig = String(req.headers['x-s2s-signature'] || '');
    verifiedSignature =
      !/[+/=]/.test(sig) &&
      crypto.verify(
        null,
        Buffer.from(expectedLiteral, 'utf8'),
        publicKey,
        Buffer.from(sig, 'base64url')
      );

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('x-masking-policy', 'masked');
    res.end(
      JSON.stringify({
        maskingPolicy: 'masked',
        items: [],
        pagination: { limit: 20, nextCursor: null, hasMore: false, total: 0 },
      })
    );
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  try {
    const addr = server.address();
    assert.ok(addr && typeof addr !== 'string');
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    const envConfig = {
      ADMINISTRA_API_URL: baseUrl,
      CLASSIFICA_S2S_KID: keyId,
      CLASSIFICA_S2S_PRIVATE_KEY: privateKeyPem,
    };

    const result1 = await requestAdministraS2sGet({
      path: ADMINISTRA_BARRAGENS_V2_PATH,
      query: 'limit=20&cursor=cur_1',
      env: envConfig,
    });
    const result2 = await requestAdministraS2sGet({
      path: ADMINISTRA_BARRAGENS_V2_PATH,
      query: 'limit=20&cursor=cur_1',
      env: envConfig,
    });

    assert.equal(result1.ok, true);
    assert.equal(result1.status, 200);
    assert.equal(result2.ok, true);
    assert.equal(observedPathname, '/api/v2/barragens');
    assert.equal(observedQuery, 'cursor=cur_1&limit=20');
    assert.equal(observedAuthHeader, undefined);
    assert.deepEqual(observedConsumerHeaders, []);
    assert.equal(verifiedSignature, true);
    assert.equal(result1.headers.get('x-masking-policy'), 'masked');
    assert.equal(observedJtis.length, 2);
    assert.match(observedJtis[0], UUID_V4_RE);
    assert.match(observedJtis[1], UUID_V4_RE);
    assert.notEqual(observedJtis[0], observedJtis[1]);
  } finally {
    server.closeAllConnections?.();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});
