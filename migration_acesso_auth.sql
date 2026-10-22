-- Classifica 2.0 — identidade, solicitações de acesso e perfis de usuário.
-- NÃO executar em produção sem backup restaurável, inventário do schema e revisão RLS.
-- A migração é aditiva em dados de negócio e não apaga pareceres/documentos.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_user_id uuid;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS matricula text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS force_password_change boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS force_password_change_at timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS users_auth_user_id_uidx ON public.users(auth_user_id) WHERE auth_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uidx ON public.users(lower(email)) WHERE email IS NOT NULL;
-- Mantém o legado para compatibilidade, mas o Classifica 2.0 não lê nem grava esse campo.
ALTER TABLE public.users ALTER COLUMN password_hash DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.classifica_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 160),
  email text NOT NULL,
  matricula text NOT NULL CHECK (length(trim(matricula)) BETWEEN 1 AND 40),
  setor text NOT NULL CHECK (setor IN ('SETOR DE CLASSIFICAÇÃO DE BARRAGENS','SETOR DE FISCALIZAÇÃO E MONITORAMENTO','SETOR ADMINISTRATIVO','COORDENADOR')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id), admin_note text
);
ALTER TABLE public.classifica_access_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.classifica_access_requests FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.classifica_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id=(SELECT auth.uid()) AND u.role='Administrador' AND u.active IS TRUE AND u.force_password_change IS FALSE);
$$;
REVOKE ALL ON FUNCTION public.classifica_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.classifica_is_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.classifica_can_access_app()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id=(SELECT auth.uid()) AND u.active IS TRUE AND u.force_password_change IS FALSE
  );
$$;
REVOKE ALL ON FUNCTION public.classifica_can_access_app() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.classifica_can_access_app() TO authenticated;

-- No projeto de teste, restringe tabelas de negócio conhecidas por papel e status.
-- As regras RESTRICTIVE intersectam políticas permissivas existentes (OR) e não apagam dados.
-- Este inventário NÃO substitui a auditoria de todas as tabelas, views, RPCs e Storage do projeto.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'pareceres','parecer_responsaveis','parecer_documentos','parecer_barramentos',
    'parecer_estruturas','oficios','nao_obrigatoriedades','indeferimentos',
    'transferencias_titularidade','informacoes_empreendedor','audit_logs',
    'fiscalizacoes','fiscalizacao_oficios','fiscalizacao_pareceres'
  ] LOOP
    IF pg_catalog.to_regclass(pg_catalog.format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE pg_catalog.format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE pg_catalog.format('DROP POLICY IF EXISTS classifica_approved_access_gate ON public.%I', table_name);
      EXECUTE pg_catalog.format('DROP POLICY IF EXISTS classifica_approved_read_gate ON public.%I', table_name);
      EXECUTE pg_catalog.format('DROP POLICY IF EXISTS classifica_approved_write_gate ON public.%I', table_name);
      EXECUTE pg_catalog.format('DROP POLICY IF EXISTS classifica_approved_update_gate ON public.%I', table_name);
      EXECUTE pg_catalog.format('DROP POLICY IF EXISTS classifica_admin_delete_gate ON public.%I', table_name);
      EXECUTE pg_catalog.format(
        'CREATE POLICY classifica_approved_read_gate ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (public.classifica_can_access_app())', table_name
      );
      EXECUTE pg_catalog.format(
        'CREATE POLICY classifica_approved_write_gate ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.classifica_is_admin() OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id=(SELECT auth.uid()) AND u.active IS TRUE AND u.force_password_change IS FALSE AND u.role=''Analista''))', table_name
      );
      EXECUTE pg_catalog.format(
        'CREATE POLICY classifica_approved_update_gate ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.classifica_is_admin() OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id=(SELECT auth.uid()) AND u.active IS TRUE AND u.force_password_change IS FALSE AND u.role=''Analista'')) WITH CHECK (public.classifica_is_admin() OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id=(SELECT auth.uid()) AND u.active IS TRUE AND u.force_password_change IS FALSE AND u.role=''Analista''))', table_name
      );
      EXECUTE pg_catalog.format(
        'CREATE POLICY classifica_admin_delete_gate ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (public.classifica_is_admin())', table_name
      );
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON public.classifica_access_requests FROM anon;
REVOKE ALL ON public.classifica_access_requests FROM authenticated;
DROP POLICY IF EXISTS classifica_requests_admin_select ON public.classifica_access_requests;
DROP POLICY IF EXISTS classifica_requests_admin_update ON public.classifica_access_requests;

-- Perfil próprio: retorna apenas as colunas liberadas explicitamente abaixo.
CREATE OR REPLACE FUNCTION public.classifica_my_profile()
RETURNS TABLE(id uuid,auth_user_id uuid,username text,email text,name text,role text,setor text,matricula text,active boolean,force_password_change boolean,force_password_change_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT u.id,u.auth_user_id,u.username,u.email,u.name,u.role::text,u.setor,u.matricula,u.active,u.force_password_change,u.force_password_change_at
  FROM public.users u WHERE u.auth_user_id=(SELECT auth.uid()) AND u.active IS TRUE LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.classifica_my_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.classifica_my_profile() TO authenticated;

-- Lista institucional mínima, apenas para usuários autenticados do sistema.
CREATE OR REPLACE FUNCTION public.classifica_public_team()
RETURNS TABLE(name text,role text,setor text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT u.name,u.role::text,u.setor
  FROM public.users u
  WHERE u.active IS TRUE AND u.role IN ('Administrador','Analista')
    AND EXISTS (
      SELECT 1 FROM public.users member
      WHERE member.auth_user_id=(SELECT auth.uid()) AND member.active IS TRUE AND member.force_password_change IS FALSE
    )
  ORDER BY u.name;
$$;
REVOKE ALL ON FUNCTION public.classifica_public_team() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.classifica_public_team() TO authenticated;

-- A solicitação nasce no trigger Auth, tanto com confirmação de e-mail quanto sem ela.
-- Só os metadados permitidos são copiados, e a senha não entra na fila.
CREATE OR REPLACE FUNCTION public.classifica_capture_access_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE meta jsonb := COALESCE(NEW.raw_user_meta_data,'{}'::jsonb); nm text; mat text; sec text;
BEGIN
  IF meta->>'classifica_access_request' IS DISTINCT FROM 'true' THEN RETURN NEW; END IF;
  nm := trim(COALESCE(meta->>'full_name','')); mat := trim(COALESCE(meta->>'matricula','')); sec := meta->>'setor';
  IF length(nm) NOT BETWEEN 2 AND 160 OR length(mat) NOT BETWEEN 1 AND 40
     OR sec NOT IN ('SETOR DE CLASSIFICAÇÃO DE BARRAGENS','SETOR DE FISCALIZAÇÃO E MONITORAMENTO','SETOR ADMINISTRATIVO','COORDENADOR')
     OR NEW.email IS NULL THEN RAISE EXCEPTION 'Dados da solicitação Classifica inválidos'; END IF;
  INSERT INTO public.classifica_access_requests(auth_user_id,name,email,matricula,setor)
  VALUES(NEW.id,nm,lower(NEW.email),mat,sec);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS classifica_auth_access_request ON auth.users;
CREATE TRIGGER classifica_auth_access_request AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.classifica_capture_access_request();

-- Editar dados da solicitação é operação administrativa em uma única transação.
CREATE OR REPLACE FUNCTION public.classifica_update_access_request(p_request_id uuid,p_name text,p_email text,p_matricula text,p_setor text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.classifica_is_admin() THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
  IF length(trim(p_name)) NOT BETWEEN 2 AND 160 OR length(trim(p_matricula)) NOT BETWEEN 1 AND 40
     OR p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR p_setor NOT IN ('SETOR DE CLASSIFICAÇÃO DE BARRAGENS','SETOR DE FISCALIZAÇÃO E MONITORAMENTO','SETOR ADMINISTRATIVO','COORDENADOR') THEN RAISE EXCEPTION 'Dados inválidos'; END IF;
  UPDATE public.classifica_access_requests SET name=trim(p_name),email=lower(trim(p_email)),matricula=trim(p_matricula),setor=p_setor
    WHERE id=p_request_id AND status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitação pendente não encontrada'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.classifica_update_access_request(uuid,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.classifica_update_access_request(uuid,text,text,text,text) TO authenticated;

-- Aprovar ou recusar atomicamente; o papel inicial é fixo (Analista), nunca enviado pelo solicitante.
CREATE OR REPLACE FUNCTION public.classifica_review_access_request(p_request_id uuid,p_decision text,p_name text,p_email text,p_matricula text,p_setor text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.classifica_access_requests%ROWTYPE;
BEGIN
  IF NOT public.classifica_is_admin() THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
  IF p_decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Decisão inválida'; END IF;
  IF length(trim(p_name)) NOT BETWEEN 2 AND 160 OR length(trim(p_matricula)) NOT BETWEEN 1 AND 40
     OR p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR p_setor NOT IN ('SETOR DE CLASSIFICAÇÃO DE BARRAGENS','SETOR DE FISCALIZAÇÃO E MONITORAMENTO','SETOR ADMINISTRATIVO','COORDENADOR') THEN RAISE EXCEPTION 'Dados inválidos'; END IF;
  SELECT * INTO r FROM public.classifica_access_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND OR r.status<>'pending' THEN RAISE EXCEPTION 'Solicitação pendente não encontrada'; END IF;
  IF p_decision='approved' THEN
    INSERT INTO public.users(auth_user_id,email,username,name,matricula,setor,role,active,force_password_change,password_hash,updated_at)
    VALUES(r.auth_user_id,lower(trim(p_email)),lower(trim(p_email)),trim(p_name),trim(p_matricula),p_setor,'Analista',true,false,NULL,now())
    ON CONFLICT (auth_user_id) WHERE auth_user_id IS NOT NULL DO UPDATE SET
      email=EXCLUDED.email,username=EXCLUDED.username,name=EXCLUDED.name,matricula=EXCLUDED.matricula,setor=EXCLUDED.setor,active=true,updated_at=now();
  END IF;
  UPDATE public.classifica_access_requests SET name=trim(p_name),email=lower(trim(p_email)),matricula=trim(p_matricula),setor=p_setor,status=p_decision,reviewed_at=now(),reviewed_by=(SELECT auth.uid()) WHERE id=p_request_id;
END;
$$;
REVOKE ALL ON FUNCTION public.classifica_review_access_request(uuid,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.classifica_review_access_request(uuid,text,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.classifica_finish_password_change()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.users SET force_password_change=false,force_password_change_at=now(),updated_at=now()
  WHERE auth_user_id=(SELECT auth.uid()) AND active IS TRUE AND force_password_change IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Troca obrigatória de senha não pendente para perfil ativo'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.classifica_finish_password_change() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.classifica_finish_password_change() TO authenticated;

-- A fila é consultada via função com verificação de papel no servidor; nunca há acesso direto.
CREATE OR REPLACE FUNCTION public.classifica_list_access_requests()
RETURNS TABLE(id uuid,auth_user_id uuid,name text,email text,matricula text,setor text,status text,requested_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.classifica_is_admin() THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
  RETURN QUERY SELECT r.id,r.auth_user_id,r.name,r.email,r.matricula,r.setor,r.status,r.requested_at
    FROM public.classifica_access_requests r ORDER BY r.requested_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.classifica_list_access_requests() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.classifica_list_access_requests() TO authenticated;

-- Listagem administrativa explicitamente projetada: nunca retorna password_hash.
CREATE OR REPLACE FUNCTION public.classifica_list_users()
RETURNS TABLE(id uuid,auth_user_id uuid,username text,email text,name text,matricula text,setor text,role text,active boolean,created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.classifica_is_admin() THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
  RETURN QUERY SELECT u.id,u.auth_user_id,u.username,u.email,u.name,u.matricula,u.setor,u.role::text,u.active,u.created_at
    FROM public.users u ORDER BY u.created_at DESC NULLS LAST;
END;
$$;
REVOKE ALL ON FUNCTION public.classifica_list_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.classifica_list_users() TO authenticated;

-- A tabela de perfis não fica consultável diretamente via API.
-- A coluna password_hash permanece no legado, mas não é selecionável pelo cliente 2.0.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.users FROM PUBLIC, anon, authenticated;
-- Nenhum UPDATE direto nos perfis: edição de usuário passa por RPC com verificação de admin.
CREATE OR REPLACE FUNCTION public.classifica_update_user_profile(p_user_id uuid,p_name text,p_matricula text,p_setor text,p_role text,p_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.classifica_is_admin() THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
  IF length(trim(p_name)) NOT BETWEEN 2 AND 160 OR length(trim(p_matricula)) NOT BETWEEN 1 AND 40
     OR p_role NOT IN ('Administrador','Analista','Visualizador')
     OR p_setor NOT IN ('SETOR DE CLASSIFICAÇÃO DE BARRAGENS','SETOR DE FISCALIZAÇÃO E MONITORAMENTO','SETOR ADMINISTRATIVO','COORDENADOR') THEN RAISE EXCEPTION 'Dados inválidos'; END IF;
  UPDATE public.users SET name=trim(p_name),matricula=trim(p_matricula),setor=p_setor,role=p_role,active=p_active,updated_at=now()
    WHERE id=p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil não encontrado'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.classifica_update_user_profile(uuid,text,text,text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.classifica_update_user_profile(uuid,text,text,text,text,boolean) TO authenticated;

-- Criar o administrador inicial manualmente no painel Supabase Auth e vincular seu UUID na
-- linha de users; configurar role='Administrador', active=true e force_password_change=true.
-- Senha inicial definida somente no Auth, fora do código, SQL, logs e password_hash legado.
--
-- Importante: as políticas permissivas antigas podem se somar a estas por OR. Audite RLS,
-- privilégios PUBLIC e políticas de todos os documentos antes de habilitar dados reais.
