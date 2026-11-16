-- ============================================================================
-- 2.0 CLASSIFICA CSB - MIGRAÇÃO DE INTEGRAÇÃO AO ECOSSISTEMA E SEGURANÇA
-- ============================================================================
-- Executar no SQL Editor do projeto Supabase do 2.0 Classifica CSB.
-- Idempotente: não apaga registros existentes.
--
-- Responsabilidades deste script:
--   1) Adicionar chaves de vínculo canônico (empreendedor_id, barragem_id, sistema_origem)
--      às tabelas de produtos do Classifica CSB.
--   2) Consolidar RPCs seguras de Gestão de Usuários e Auditoria (sem senha padrão literal,
--      sem acesso direto a `public.users`, com checagem estrita de `classifica_is_admin()`).
--   3) Criar RPC somente leitura `classifica_consultar_produtos_entidade` para que
--      Administra, Notifica e Fiscaliza identifiquem produtos já emitidos pelo Classifica.
-- ============================================================================

-- 1. Colunas de vínculo ao cadastro mestre do Administra Barragens
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'pareceres',
    'oficios',
    'nao_obrigatoriedades',
    'indeferimentos',
    'transferencias_titularidade'
  ] LOOP
    IF pg_catalog.to_regclass(pg_catalog.format('public.%I', tbl)) IS NOT NULL THEN
      EXECUTE pg_catalog.format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS empreendedor_id uuid', tbl);
      EXECUTE pg_catalog.format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS barragem_id uuid', tbl);
      EXECUTE pg_catalog.format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS sistema_origem text NOT NULL DEFAULT ''CLASSIFICA_CSB''', tbl);
      EXECUTE pg_catalog.format('CREATE INDEX IF NOT EXISTS %I ON public.%I (empreendedor_id)', tbl || '_emp_id_idx', tbl);
      EXECUTE pg_catalog.format('CREATE INDEX IF NOT EXISTS %I ON public.%I (barragem_id)', tbl || '_bar_id_idx', tbl);
    END IF;
  END LOOP;
END;
$$;

-- 2. Garantir colunas padrão, vínculo automático auth.users <-> public.users e bloqueio RLS
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_user_id uuid;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS setor text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS perfil text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS matricula text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS active boolean;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS force_password_change boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS force_password_change_at timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Migração compatível de colunas legadas (nome, login, papel, status, situacao) e vínculo com auth.users
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'nome') THEN
    EXECUTE 'UPDATE public.users SET name = trim(nome) WHERE (name IS NULL OR trim(name) = '''') AND nome IS NOT NULL AND trim(nome) <> ''''';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'login') THEN
    EXECUTE 'UPDATE public.users SET username = trim(login) WHERE (username IS NULL OR trim(username) = '''') AND login IS NOT NULL AND trim(login) <> ''''';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'papel') THEN
    EXECUTE $sql$
      UPDATE public.users
      SET role = CASE
        WHEN lower(trim(papel)) IN ('administrador','administradora','admin') THEN 'Administrador'
        WHEN lower(trim(papel)) = 'analista' THEN 'Analista'
        ELSE 'Visualizador'
      END
      WHERE (role IS NULL OR trim(role::text) = '') AND papel IS NOT NULL AND trim(papel) <> ''
    $sql$;
  END IF;

  UPDATE public.users u
  SET active = true
  WHERE u.active IS NULL
    AND lower(trim(COALESCE(to_jsonb(u)->>'status', to_jsonb(u)->>'situacao', ''))) IN ('ativo','ativa','active','aprovado','aprovada');

  UPDATE public.users u
  SET auth_user_id = au.id,
      updated_at = now()
  FROM auth.users au
  WHERE u.auth_user_id IS NULL
    AND u.email IS NOT NULL
    AND lower(trim(u.email)) = lower(trim(au.email));
END;
$$;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.users FROM PUBLIC, anon, authenticated;

-- 3. Funções de verificação de acesso e perfil compatíveis com schema novo e legado
CREATE OR REPLACE FUNCTION public.classifica_is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE (
      u.auth_user_id = (SELECT auth.uid())
      OR (to_jsonb(u)->>'id') = (SELECT auth.uid())::text
      OR (
        u.auth_user_id IS NULL
        AND u.email IS NOT NULL
        AND lower(trim(u.email)) = lower(trim(COALESCE((SELECT au.email FROM auth.users au WHERE au.id = (SELECT auth.uid())), '')))
      )
    )
    AND lower(trim(COALESCE(NULLIF(u.role::text, ''), to_jsonb(u)->>'papel', ''))) IN ('administrador','administradora','admin')
    AND (
      u.active IS TRUE
      OR (
        u.active IS NOT FALSE
        AND lower(trim(COALESCE(to_jsonb(u)->>'status', to_jsonb(u)->>'situacao', ''))) IN ('ativo','ativa','active','aprovado','aprovada')
      )
    )
    AND COALESCE(u.force_password_change, false) IS FALSE
  );
$$;
REVOKE ALL ON FUNCTION public.classifica_is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classifica_is_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.classifica_can_access_app()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE (
      u.auth_user_id = (SELECT auth.uid())
      OR (to_jsonb(u)->>'id') = (SELECT auth.uid())::text
      OR (
        u.auth_user_id IS NULL
        AND u.email IS NOT NULL
        AND lower(trim(u.email)) = lower(trim(COALESCE((SELECT au.email FROM auth.users au WHERE au.id = (SELECT auth.uid())), '')))
      )
    )
    AND (
      u.active IS TRUE
      OR (
        u.active IS NOT FALSE
        AND lower(trim(COALESCE(to_jsonb(u)->>'status', to_jsonb(u)->>'situacao', ''))) IN ('ativo','ativa','active','aprovado','aprovada')
      )
    )
    AND COALESCE(u.force_password_change, false) IS FALSE
  );
$$;
REVOKE ALL ON FUNCTION public.classifica_can_access_app() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classifica_can_access_app() TO authenticated;

CREATE OR REPLACE FUNCTION public.classifica_my_profile()
RETURNS TABLE(
  id uuid,
  auth_user_id uuid,
  username text,
  email text,
  name text,
  role text,
  setor text,
  perfil text,
  matricula text,
  active boolean,
  force_password_change boolean,
  force_password_change_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT
    u.id,
    COALESCE(u.auth_user_id, (SELECT auth.uid())) AS auth_user_id,
    COALESCE(NULLIF(u.username, ''), NULLIF(to_jsonb(u)->>'login', ''), u.email) AS username,
    u.email,
    COALESCE(NULLIF(u.name, ''), NULLIF(to_jsonb(u)->>'nome', ''), u.email) AS name,
    CASE
      WHEN lower(trim(COALESCE(NULLIF(u.role::text, ''), to_jsonb(u)->>'papel', ''))) IN ('administrador','administradora','admin') THEN 'Administrador'
      WHEN lower(trim(COALESCE(NULLIF(u.role::text, ''), to_jsonb(u)->>'papel', ''))) = 'analista' THEN 'Analista'
      ELSE 'Visualizador'
    END AS role,
    u.setor,
    u.perfil,
    u.matricula,
    (
      u.active IS TRUE
      OR (
        u.active IS NOT FALSE
        AND lower(trim(COALESCE(to_jsonb(u)->>'status', to_jsonb(u)->>'situacao', ''))) IN ('ativo','ativa','active','aprovado','aprovada')
      )
    ) AS active,
    COALESCE(u.force_password_change, false) AS force_password_change,
    u.force_password_change_at
  FROM public.users u
  WHERE (
    u.auth_user_id = (SELECT auth.uid())
    OR (to_jsonb(u)->>'id') = (SELECT auth.uid())::text
    OR (
      u.auth_user_id IS NULL
      AND u.email IS NOT NULL
      AND lower(trim(u.email)) = lower(trim(COALESCE((SELECT au.email FROM auth.users au WHERE au.id = (SELECT auth.uid())), '')))
    )
  )
  AND (
    u.active IS TRUE
    OR (
      u.active IS NOT FALSE
      AND lower(trim(COALESCE(to_jsonb(u)->>'status', to_jsonb(u)->>'situacao', ''))) IN ('ativo','ativa','active','aprovado','aprovada')
    )
  )
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.classifica_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classifica_my_profile() TO authenticated;

-- 4. Criação pré-autorizada de perfil de usuário (sem senha hardcoded)
CREATE OR REPLACE FUNCTION public.classifica_create_user_profile(
  p_email text,
  p_name text,
  p_matricula text,
  p_setor text,
  p_perfil text,
  p_role text,
  p_active boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_clean_email text := lower(trim(COALESCE(p_email, '')));
  v_clean_name text := trim(COALESCE(p_name, ''));
  v_clean_mat text := trim(COALESCE(p_matricula, ''));
  v_id uuid;
BEGIN
  IF NOT public.classifica_is_admin() THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  IF v_clean_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'E-mail inválido';
  END IF;
  IF length(v_clean_name) NOT BETWEEN 2 AND 160 OR length(v_clean_mat) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'Nome ou matrícula inválidos';
  END IF;
  IF p_role NOT IN ('Administrador', 'Analista', 'Visualizador') THEN
    RAISE EXCEPTION 'Nível de acesso inválido';
  END IF;
  IF p_setor NOT IN ('SETOR DE CLASSIFICAÇÃO DE BARRAGENS','SETOR DE FISCALIZAÇÃO E MONITORAMENTO','SETOR ADMINISTRATIVO','COORDENADOR') THEN
    RAISE EXCEPTION 'Setor inválido';
  END IF;

  INSERT INTO public.users (
    email, username, name, matricula, setor, perfil, role, active, force_password_change, updated_at
  ) VALUES (
    v_clean_email, v_clean_email, v_clean_name, v_clean_mat, p_setor, p_perfil, p_role, COALESCE(p_active, true), true, now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.classifica_create_user_profile(text, text, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classifica_create_user_profile(text, text, text, text, text, text, boolean) TO authenticated;

-- 5. Exclusão segura de usuário (exige Administrador ativo e aprovado)
CREATE OR REPLACE FUNCTION public.classifica_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_auth_user_id uuid;
BEGIN
  IF NOT public.classifica_is_admin() THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  SELECT auth_user_id INTO v_auth_user_id FROM public.users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado';
  END IF;

  IF v_auth_user_id = (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Não é permitido excluir o próprio usuário conectado';
  END IF;

  DELETE FROM public.users WHERE id = p_user_id;

  IF v_auth_user_id IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = v_auth_user_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.classifica_delete_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classifica_delete_user(uuid) TO authenticated;

-- 6. Listagem segura de logs de auditoria (restrita a Administradores)
CREATE OR REPLACE FUNCTION public.classifica_list_audit_logs(
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  created_at timestamptz,
  user_email text,
  user_name text,
  user_role text,
  action text,
  details jsonb,
  user_agent text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.classifica_is_admin() THEN
    RAISE EXCEPTION 'Acesso não autorizado';
  END IF;

  RETURN QUERY
  SELECT a.id, a.created_at, a.user_email, a.user_name, a.user_role, a.action, a.details, a.user_agent
  FROM public.audit_logs a
  ORDER BY a.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;
REVOKE ALL ON FUNCTION public.classifica_list_audit_logs(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classifica_list_audit_logs(integer, integer) TO authenticated;

-- 7. Consulta cruzada somente leitura dos produtos gerados no Classifica CSB
CREATE OR REPLACE FUNCTION public.classifica_consultar_produtos_entidade(
  p_empreendedor_id uuid DEFAULT NULL,
  p_cpf_cnpj text DEFAULT NULL,
  p_barragem_id uuid DEFAULT NULL,
  p_snisb text DEFAULT NULL
)
RETURNS TABLE(
  id text,
  sistema_origem text,
  produto_origem_id text,
  tipo_produto text,
  numero_documento text,
  status text,
  data_documento text,
  analista_nome text,
  empreendedor_id uuid,
  empreendedor_nome text,
  empreendedor_cpf_cnpj text,
  barragem_id uuid,
  barragem_nome text,
  barragem_snisb text,
  municipio text,
  created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_digits text := NULLIF(regexp_replace(COALESCE(p_cpf_cnpj, ''), '\D', '', 'g'), '');
BEGIN
  RETURN QUERY
  SELECT
    ('parecer_' || p.id::text) AS id,
    COALESCE(p.sistema_origem, 'CLASSIFICA_CSB') AS sistema_origem,
    p.id::text AS produto_origem_id,
    'Parecer Técnico'::text AS tipo_produto,
    p.protocolo AS numero_documento,
    COALESCE(p.status, 'Rascunho') AS status,
    p.data_parecer::text AS data_documento,
    p.analista AS analista_nome,
    p.empreendedor_id,
    p.razao_social AS empreendedor_nome,
    regexp_replace(COALESCE(p.cpf_cnpj, ''), '\D', '', 'g') AS empreendedor_cpf_cnpj,
    p.barragem_id,
    NULL::text AS barragem_nome,
    NULL::text AS barragem_snisb,
    p.municipio,
    p.created_at
  FROM public.pareceres p
  WHERE (p_empreendedor_id IS NOT NULL AND p.empreendedor_id = p_empreendedor_id)
     OR (p_barragem_id IS NOT NULL AND p.barragem_id = p_barragem_id)
     OR (v_digits IS NOT NULL AND regexp_replace(COALESCE(p.cpf_cnpj, ''), '\D', '', 'g') = v_digits)

  UNION ALL

  SELECT
    ('oficio_' || o.id::text) AS id,
    COALESCE(o.sistema_origem, 'CLASSIFICA_CSB') AS sistema_origem,
    o.id::text AS produto_origem_id,
    'Ofício de Pendências'::text AS tipo_produto,
    o.data->>'protocolo' AS numero_documento,
    COALESCE(o.status, 'Rascunho') AS status,
    o.data->>'data' AS data_documento,
    o.analista AS analista_nome,
    o.empreendedor_id,
    o.data->>'interessado' AS empreendedor_nome,
    NULL::text AS empreendedor_cpf_cnpj,
    o.barragem_id,
    NULL::text AS barragem_nome,
    NULL::text AS barragem_snisb,
    COALESCE(o.data->>'municipio', '') AS municipio,
    o.created_at
  FROM public.oficios o
  WHERE (p_empreendedor_id IS NOT NULL AND o.empreendedor_id = p_empreendedor_id)
     OR (p_barragem_id IS NOT NULL AND o.barragem_id = p_barragem_id)

  UNION ALL

  SELECT
    ('indeferimento_' || i.id::text) AS id,
    COALESCE(i.sistema_origem, 'CLASSIFICA_CSB') AS sistema_origem,
    i.id::text AS produto_origem_id,
    'Indeferimento'::text AS tipo_produto,
    COALESCE(i.num_processo, i.protocolo) AS numero_documento,
    COALESCE(i.status, 'Rascunho') AS status,
    i.data_protocolo::text AS data_documento,
    i.analista AS analista_nome,
    i.empreendedor_id,
    i.nome_empreendedor AS empreendedor_nome,
    regexp_replace(COALESCE(i.cpf_cnpj, ''), '\D', '', 'g') AS empreendedor_cpf_cnpj,
    i.barragem_id,
    i.nome_fazenda AS barragem_nome,
    NULL::text AS barragem_snisb,
    i.municipio,
    i.created_at
  FROM public.indeferimentos i
  WHERE (p_empreendedor_id IS NOT NULL AND i.empreendedor_id = p_empreendedor_id)
     OR (p_barragem_id IS NOT NULL AND i.barragem_id = p_barragem_id)
     OR (v_digits IS NOT NULL AND regexp_replace(COALESCE(i.cpf_cnpj, ''), '\D', '', 'g') = v_digits)

  UNION ALL

  SELECT
    ('transferencia_' || t.id::text) AS id,
    COALESCE(t.sistema_origem, 'CLASSIFICA_CSB') AS sistema_origem,
    t.id::text AS produto_origem_id,
    'Transferência de Titularidade'::text AS tipo_produto,
    t.n_processo AS numero_documento,
    COALESCE(t.status, 'rascunho') AS status,
    t.data_protocolo::text AS data_documento,
    t.analista AS analista_nome,
    t.empreendedor_id,
    t.novo_proprietario AS empreendedor_nome,
    regexp_replace(COALESCE(t.novo_doc, ''), '\D', '', 'g') AS empreendedor_cpf_cnpj,
    t.barragem_id,
    t.nome_fazenda AS barragem_nome,
    t.snisb AS barragem_snisb,
    t.municipio,
    t.created_at
  FROM public.transferencias_titularidade t
  WHERE (p_empreendedor_id IS NOT NULL AND t.empreendedor_id = p_empreendedor_id)
     OR (p_barragem_id IS NOT NULL AND t.barragem_id = p_barragem_id)
     OR (v_digits IS NOT NULL AND regexp_replace(COALESCE(t.novo_doc, ''), '\D', '', 'g') = v_digits)
     OR (p_snisb IS NOT NULL AND upper(trim(COALESCE(t.snisb, ''))) = upper(trim(p_snisb)));
END;
$$;
REVOKE ALL ON FUNCTION public.classifica_consultar_produtos_entidade(uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classifica_consultar_produtos_entidade(uuid, text, uuid, text) TO authenticated;
