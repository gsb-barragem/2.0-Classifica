import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  AdministraS2sTempTestCard,
  TEMP_S2S_HEALTH_ENDPOINT,
  triggerAdministraS2sHealthTest,
} from '../components/AdministraS2sTempTestCard';
import { AuthContext } from '../src/contexts/AuthContext';
import { User } from '../types';

const ADMIN_USER: User = {
  id: 'user-admin-1',
  authUserId: 'auth-admin-1',
  username: 'admin.teste@exemplo.local',
  email: 'admin.teste@exemplo.local',
  name: 'Administrador Teste',
  role: 'Administrador',
  setor: 'COORDENADOR',
  perfil: 'Analista de Meio Ambiente',
  matricula: '100001',
  active: true,
  forcePasswordChange: false,
};

const ANALYST_USER: User = {
  ...ADMIN_USER,
  id: 'user-analista-1',
  authUserId: 'auth-analista-1',
  role: 'Analista',
};

const VIEWER_USER: User = {
  ...ADMIN_USER,
  id: 'user-vis-1',
  authUserId: 'auth-vis-1',
  role: 'Visualizador',
};

function renderTempCard(currentUser: User | null): string {
  return renderToStaticMarkup(
    React.createElement(
      AuthContext.Provider,
      {
        value: {
          currentUser,
          login: async () => ({ success: false }),
          logout: async () => undefined,
          loading: false,
          refreshProfile: async () => undefined,
        },
      },
      React.createElement(AdministraS2sTempTestCard)
    )
  );
}

test('botão temporário S2S é exibido apenas para perfil com role exatamente Administrador e não possui inputs', () => {
  assert.equal(renderTempCard(null), '');
  assert.equal(renderTempCard(ANALYST_USER), '');
  assert.equal(renderTempCard(VIEWER_USER), '');

  const adminHtml = renderTempCard(ADMIN_USER);
  assert.match(adminHtml, /Testar S2S Administra \(Temporário\)/);
  assert.match(adminHtml, /Temporário/);
  assert.doesNotMatch(adminHtml, /<input/i);
  assert.doesNotMatch(adminHtml, /<textarea/i);
  assert.doesNotMatch(adminHtml, /<select/i);
});

test('triggerAdministraS2sHealthTest bloqueia chamada quando sessão está ausente, expirada ou usuário não é Administrador', async () => {
  let fetchCalls = 0;
  const countingFetch: typeof fetch = async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ ok: true, status: 200 }), { status: 200 });
  };

  const nonAdmin = await triggerAdministraS2sHealthTest({
    currentUser: ANALYST_USER,
    isConfigured: () => true,
    getSession: async () => ({
      data: { session: { access_token: 'tok-1', expires_at: 9_999_999_999 } },
      error: null,
    }),
    fetchImpl: countingFetch,
  });
  assert.equal(nonAdmin.ok, false);
  assert.equal(fetchCalls, 0);

  const noUser = await triggerAdministraS2sHealthTest({
    currentUser: null,
    isConfigured: () => true,
    getSession: async () => ({
      data: { session: { access_token: 'tok-1', expires_at: 9_999_999_999 } },
      error: null,
    }),
    fetchImpl: countingFetch,
  });
  assert.equal(noUser.ok, false);
  assert.equal(fetchCalls, 0);

  const missingSession = await triggerAdministraS2sHealthTest({
    currentUser: ADMIN_USER,
    isConfigured: () => true,
    getSession: async () => ({
      data: { session: null },
      error: null,
    }),
    fetchImpl: countingFetch,
  });
  assert.equal(missingSession.ok, false);
  assert.match(missingSession.message, /Sessão ausente ou expirada/);
  assert.equal(fetchCalls, 0);

  const expiredSession = await triggerAdministraS2sHealthTest({
    currentUser: ADMIN_USER,
    isConfigured: () => true,
    nowMs: () => 1_700_000_000_000,
    getSession: async () => ({
      data: {
        session: {
          access_token: 'tok-expirado',
          expires_at: 1_699_999_999,
        },
      },
      error: null,
    }),
    fetchImpl: countingFetch,
  });
  assert.equal(expiredSession.ok, false);
  assert.match(expiredSession.message, /Sessão ausente ou expirada/);
  assert.equal(fetchCalls, 0);
});

test('triggerAdministraS2sHealthTest envia POST para /api/administra-s2s-health com Bearer token e retorna resultado simples sem vazar dados sensíveis', async () => {
  let capturedUrl = '';
  let capturedMethod = '';
  let capturedBody: RequestInit['body'] | undefined;
  let capturedHeaders: HeadersInit | undefined;

  const okRes = await triggerAdministraS2sHealthTest({
    currentUser: ADMIN_USER,
    isConfigured: () => true,
    nowMs: () => 1_700_000_000_000,
    getSession: async () => ({
      data: {
        session: {
          access_token: 'session-jwt-teste',
          expires_at: 1_700_003_600,
        },
      },
      error: null,
    }),
    fetchImpl: async (input, init) => {
      capturedUrl = String(input);
      capturedMethod = init?.method || 'GET';
      capturedBody = init?.body;
      capturedHeaders = init?.headers;
      return new Response(JSON.stringify({ ok: true, status: 200 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  assert.equal(capturedUrl, TEMP_S2S_HEALTH_ENDPOINT);
  assert.equal(capturedUrl, '/api/administra-s2s-health');
  assert.equal(capturedMethod, 'POST');
  assert.equal(capturedBody, undefined);
  assert.deepEqual(capturedHeaders, {
    Authorization: 'Bearer session-jwt-teste',
  });
  assert.equal(okRes.ok, true);
  assert.equal(okRes.httpStatus, 200);
  assert.equal(okRes.message, 'Teste S2S concluído com sucesso (HTTP 200).');
  assert.equal(okRes.message.includes('session-jwt-teste'), false);

  const leakMarker = 'PRIVATE-KEY-OR-INTERNAL-TRACE';
  const failRes = await triggerAdministraS2sHealthTest({
    currentUser: ADMIN_USER,
    isConfigured: () => true,
    nowMs: () => 1_700_000_000_000,
    getSession: async () => ({
      data: {
        session: {
          access_token: 'session-jwt-teste',
          expires_at: 1_700_003_600,
        },
      },
      error: null,
    }),
    fetchImpl: async () =>
      new Response(JSON.stringify({ ok: false, error: leakMarker }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      }),
  });
  assert.equal(failRes.ok, false);
  assert.equal(failRes.message.includes(leakMarker), false);
  assert.equal(failRes.message.includes('session-jwt-teste'), false);
});

test('componente temporário não usa secrets, VITE_ ou logs de dados sensíveis', () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), 'components/AdministraS2sTempTestCard.tsx'),
    'utf8'
  );
  assert.equal(source.includes('VITE_'), false);
  assert.equal(source.includes('CLASSIFICA_S2S_'), false);
  assert.equal(source.includes('ADMINISTRA_API_BASE_URL'), false);
  assert.equal(source.includes('console.'), false);
});
