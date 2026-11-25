import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  isSelfUserAccount,
  toggleUserActiveStatus,
  UserManagement,
} from '../components/UserManagement';
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

function renderUserManagement(
  currentUser: User | null,
  options?: {
    initialTab?: 'requests' | 'users';
    initialLoading?: boolean;
    initialUsers?: Array<{
      id: string;
      auth_user_id: string;
      username: string;
      email: string;
      name: string;
      matricula: string;
      setor: string;
      perfil?: string;
      role: User['role'];
      active: boolean;
    }>;
  }
): string {
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
      React.createElement(UserManagement, {
        initialTab: options?.initialTab ?? 'users',
        initialLoading: options?.initialLoading ?? false,
        initialUsers: options?.initialUsers ?? [],
      })
    )
  );
}

test('UserManagement não renderiza ação Excluir nem chama classifica_delete_user, mantendo inativar/reativar', () => {
  const html = renderUserManagement(ADMIN_USER, {
    initialTab: 'users',
    initialLoading: false,
    initialUsers: [
      {
        id: ADMIN_USER.id,
        auth_user_id: ADMIN_USER.authUserId,
        username: ADMIN_USER.username,
        email: ADMIN_USER.email || '',
        name: ADMIN_USER.name,
        matricula: ADMIN_USER.matricula || '',
        setor: ADMIN_USER.setor || '',
        perfil: ADMIN_USER.perfil || '',
        role: 'Administrador',
        active: true,
      },
      {
        id: 'user-2',
        auth_user_id: 'auth-2',
        username: 'analista.ativo@exemplo.local',
        email: 'analista.ativo@exemplo.local',
        name: 'Analista Ativo',
        matricula: '200002',
        setor: 'SETOR DE CLASSIFICAÇÃO DE BARRAGENS',
        perfil: 'Analista de Meio Ambiente',
        role: 'Analista',
        active: true,
      },
      {
        id: 'user-3',
        auth_user_id: 'auth-3',
        username: 'analista.inativo@exemplo.local',
        email: 'analista.inativo@exemplo.local',
        name: 'Analista Inativo',
        matricula: '300003',
        setor: 'SETOR DE CLASSIFICAÇÃO DE BARRAGENS',
        perfil: 'Analista de Meio Ambiente',
        role: 'Analista',
        active: false,
      },
    ],
  });

  assert.match(html, /Gerenciar Usuários/);
  assert.match(html, /title="Inativar usuário"/);
  assert.match(html, /title="Ativar usuário"/);
  assert.match(html, /title="Você não pode inativar sua própria conta"/);

  assert.doesNotMatch(html, /Excluir permanentemente/);
  assert.doesNotMatch(html, /Excluir Usuário/);

  const source = fs.readFileSync(
    path.resolve(process.cwd(), 'components/UserManagement.tsx'),
    'utf8'
  );
  assert.equal(source.includes('classifica_delete_user'), false);
  assert.equal(source.includes('handleDeleteUser'), false);
  assert.equal(source.includes('USER_DELETED'), false);
  assert.equal(source.includes('Trash2'), false);
  assert.equal(source.includes('classifica_toggle_user_status'), true);
});

test('UserManagement restringe acesso exclusivamente a Administrador', () => {
  const htmlUnauth = renderUserManagement(null);
  assert.match(htmlUnauth, /Acesso Negado/);
  assert.doesNotMatch(htmlUnauth, /Gerenciar Usuários/);

  const htmlAnalyst = renderUserManagement(ANALYST_USER);
  assert.match(htmlAnalyst, /Acesso Negado/);
  assert.doesNotMatch(htmlAnalyst, /Gerenciar Usuários/);
});

test('toggleUserActiveStatus bloqueia auto-inativação, bloqueia não-administradores e alterna status via classifica_toggle_user_status', async () => {
  let rpcCalls = 0;
  let logCalls: Array<{ action: string; userId: string }> = [];

  const selfResult = await toggleUserActiveStatus(
    {
      id: ADMIN_USER.id,
      auth_user_id: ADMIN_USER.authUserId,
      username: ADMIN_USER.username,
      email: ADMIN_USER.email || '',
      name: ADMIN_USER.name,
      matricula: ADMIN_USER.matricula || '',
      setor: ADMIN_USER.setor || '',
      role: 'Administrador',
      active: true,
    },
    ADMIN_USER,
    {
      rpc: async () => {
        rpcCalls += 1;
        return { error: null };
      },
      log: async (action, metadata) => {
        logCalls.push({ action, userId: metadata.userId });
      },
    }
  );
  assert.equal(selfResult.ok, false);
  assert.equal(selfResult.errorMessage, 'Você não pode inativar sua própria conta.');
  assert.equal(rpcCalls, 0);

  const selfByAuthOnly = isSelfUserAccount(
    { id: 'different-row-id', auth_user_id: ADMIN_USER.authUserId },
    ADMIN_USER
  );
  assert.equal(selfByAuthOnly, true);

  const nonAdminResult = await toggleUserActiveStatus(
    {
      id: 'user-2',
      auth_user_id: 'auth-2',
      username: 'analista@exemplo.local',
      email: 'analista@exemplo.local',
      name: 'Analista',
      matricula: '200002',
      setor: 'SETOR DE CLASSIFICAÇÃO DE BARRAGENS',
      role: 'Analista',
      active: true,
    },
    ANALYST_USER,
    {
      rpc: async () => {
        rpcCalls += 1;
        return { error: null };
      },
      log: async (action, metadata) => {
        logCalls.push({ action, userId: metadata.userId });
      },
    }
  );
  assert.equal(nonAdminResult.ok, false);
  assert.equal(rpcCalls, 0);

  let lastRpcArgs: { fn: string; p_user_id: string } | null = null;
  const inactivateResult = await toggleUserActiveStatus(
    {
      id: 'user-2',
      auth_user_id: 'auth-2',
      username: 'analista@exemplo.local',
      email: 'analista@exemplo.local',
      name: 'Analista',
      matricula: '200002',
      setor: 'SETOR DE CLASSIFICAÇÃO DE BARRAGENS',
      role: 'Analista',
      active: true,
    },
    ADMIN_USER,
    {
      rpc: async (fn, args) => {
        rpcCalls += 1;
        lastRpcArgs = { fn, p_user_id: args.p_user_id };
        return { error: null };
      },
      log: async (action, metadata) => {
        logCalls.push({ action, userId: metadata.userId });
      },
    }
  );
  assert.equal(inactivateResult.ok, true);
  assert.equal(inactivateResult.nextActive, false);
  assert.equal(rpcCalls, 1);
  assert.deepEqual(lastRpcArgs, {
    fn: 'classifica_toggle_user_status',
    p_user_id: 'user-2',
  });
  assert.deepEqual(logCalls, [{ action: 'USER_INACTIVATED', userId: 'user-2' }]);

  const reactivateResult = await toggleUserActiveStatus(
    {
      id: 'user-3',
      auth_user_id: 'auth-3',
      username: 'analista.inativo@exemplo.local',
      email: 'analista.inativo@exemplo.local',
      name: 'Analista Inativo',
      matricula: '300003',
      setor: 'SETOR DE CLASSIFICAÇÃO DE BARRAGENS',
      role: 'Analista',
      active: false,
    },
    ADMIN_USER,
    {
      rpc: async (fn, args) => {
        rpcCalls += 1;
        lastRpcArgs = { fn, p_user_id: args.p_user_id };
        return { error: null };
      },
      log: async (action, metadata) => {
        logCalls.push({ action, userId: metadata.userId });
      },
    }
  );
  assert.equal(reactivateResult.ok, true);
  assert.equal(reactivateResult.nextActive, true);
  assert.equal(rpcCalls, 2);
  assert.deepEqual(lastRpcArgs, {
    fn: 'classifica_toggle_user_status',
    p_user_id: 'user-3',
  });
  assert.deepEqual(logCalls[1], { action: 'USER_ACTIVATED', userId: 'user-3' });
});
