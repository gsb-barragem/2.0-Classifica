import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ACCESS_REQUEST_UNAVAILABLE_NOTICE,
  handleDisabledAccessRequestSubmit,
  LoginPage,
} from '../components/LoginPage';
import { AuthContext } from '../src/contexts/AuthContext';

function renderLoginPage(
  initialMode: 'login' | 'request' | 'recovery',
  supabaseConfigured = true
): string {
  return renderToStaticMarkup(
    React.createElement(
      AuthContext.Provider,
      {
        value: {
          currentUser: null,
          login: async () => ({ success: false }),
          logout: async () => undefined,
          loading: false,
          refreshProfile: async () => undefined,
        },
      },
      React.createElement(LoginPage, { initialMode, supabaseConfigured })
    )
  );
}

test('Solicitar acesso renderiza apenas nome, matrícula e e-mail institucional, com botão desabilitado e aviso claro', () => {
  const html = renderLoginPage('request', true);

  assert.match(html, /Solicitar Acesso/);
  assert.match(html, /id="request-name"/);
  assert.match(html, /id="request-matricula"/);
  assert.match(html, /id="request-email"/);

  // Não deve incluir campos adicionais, selects nem busca pública de usuários
  assert.doesNotMatch(html, /id="request-sector"/);
  assert.doesNotMatch(html, /id="request-perfil"/);
  assert.doesNotMatch(html, /id="request-password"/);
  assert.doesNotMatch(html, /id="request-confirm"/);
  assert.doesNotMatch(html, /<select/i);
  assert.doesNotMatch(html, /<datalist/i);
  assert.doesNotMatch(html, /type="search"/i);

  // Aviso claro e botão de envio desabilitado
  assert.ok(html.includes(ACCESS_REQUEST_UNAVAILABLE_NOTICE));
  assert.match(html, /Administração/);
  assert.match(
    html,
    /<button[^>]*type="submit"[^>]*disabled[^>]*aria-disabled="true"[^>]*>Enviar solicitação<\/button>/
  );
  assert.match(html, /Voltar ao login/);
});

test('Envio de Solicitar acesso está completamente desativado e não chama Supabase, Edge Function nem fetch', () => {
  let preventDefaultCalled = false;
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error('fetch não deve ser chamado pelo formulário desativado');
  }) as typeof fetch;

  try {
    const result = handleDisabledAccessRequestSubmit({
      preventDefault: () => {
        preventDefaultCalled = true;
      },
    });
    assert.equal(result, false);
    assert.equal(preventDefaultCalled, true);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const loginPageSource = fs.readFileSync(
    path.resolve(process.cwd(), 'components/LoginPage.tsx'),
    'utf8'
  );
  assert.equal(loginPageSource.includes('auth.signUp'), false);
  assert.equal(loginPageSource.includes('functions.invoke'), false);
  assert.equal(loginPageSource.includes('classifica_access_request'), false);
  assert.equal(loginPageSource.includes('localStorage'), false);
  assert.equal(loginPageSource.includes('sessionStorage'), false);
  assert.equal(/\bfetch\s*\(/.test(loginPageSource), false);
});

test('Fluxos existentes de login, aviso de ambiente e recuperação de senha/sessão permanecem preservados', () => {
  const loginHtml = renderLoginPage('login', true);
  assert.match(loginHtml, /Acesso Restrito/);
  assert.match(loginHtml, /id="login-email"/);
  assert.match(loginHtml, /id="login-password"/);
  assert.match(loginHtml, /<button[^>]*type="submit"[^>]*>Entrar<\/button>/);
  assert.match(loginHtml, /Esqueci minha senha/);
  assert.match(loginHtml, /Solicitar acesso/);

  const unconfiguredLoginHtml = renderLoginPage('login', false);
  assert.match(unconfiguredLoginHtml, /VITE_SUPABASE_URL/);
  assert.match(unconfiguredLoginHtml, /VITE_SUPABASE_ANON_KEY/);

  const recoveryHtml = renderLoginPage('recovery', true);
  assert.match(recoveryHtml, /Recuperar Senha/);
  assert.match(recoveryHtml, /id="recovery-email"/);
  assert.match(recoveryHtml, /Enviar link de recuperação/);
  assert.match(recoveryHtml, /Voltar ao login/);

  const authContextSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/contexts/AuthContext.tsx'),
    'utf8'
  );
  assert.ok(authContextSource.includes('supabase.auth.getSession'));
  assert.ok(authContextSource.includes('supabase.auth.onAuthStateChange'));
  assert.ok(authContextSource.includes('supabase.auth.signInWithPassword'));
  assert.ok(authContextSource.includes('classifica_my_profile'));
  assert.ok(authContextSource.includes('verifySessionProfile'));
  assert.ok(authContextSource.includes('refreshProfile'));
});
