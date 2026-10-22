-- Classifica 2.0: Ajustes de Perfil Profissional e Gestão de Usuários
-- Execute este script no SQL Editor do Supabase para corrigir a estrutura e as funções.

-- 1. Garantir colunas necessárias
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS perfil text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;
ALTER TABLE public.classifica_access_requests ADD COLUMN IF NOT EXISTS perfil text;

-- 2. Atualizar função de captura de solicitação (Trigger do Auth)
CREATE OR REPLACE FUNCTION public.classifica_capture_access_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE meta jsonb := COALESCE(NEW.raw_user_meta_data,'{}'::jsonb); nm text; mat text; sec text; perf text;
BEGIN
  IF meta->>'classifica_access_request' IS DISTINCT FROM 'true' THEN RETURN NEW; END IF;
  nm := trim(COALESCE(meta->>'full_name','')); mat := trim(COALESCE(meta->>'matricula','')); sec := meta->>'setor';
  perf := meta->>'perfil';
  IF length(nm) NOT BETWEEN 2 AND 160 OR length(mat) NOT BETWEEN 1 AND 40
     OR NEW.email IS NULL THEN RAISE EXCEPTION 'Dados da solicitação Classifica inválidos'; END IF;
  INSERT INTO public.classifica_access_requests(auth_user_id,name,email,matricula,setor,perfil)
  VALUES(NEW.id,nm,lower(NEW.email),mat,sec,perf);
  RETURN NEW;
END;
$$;

-- 3. Atualizar listagem de solicitações
CREATE OR REPLACE FUNCTION public.classifica_list_access_requests()
RETURNS TABLE(id uuid,auth_user_id uuid,name text,email text,matricula text,setor text,perfil text,status text,requested_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.classifica_is_admin() THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
  RETURN QUERY SELECT r.id,r.auth_user_id,r.name,r.email,r.matricula,r.setor,r.perfil,r.status,r.requested_at
    FROM public.classifica_access_requests r ORDER BY r.requested_at DESC;
END;
$$;

-- 4. Atualizar revisão de solicitação
CREATE OR REPLACE FUNCTION public.classifica_review_access_request(p_request_id uuid,p_decision text,p_name text,p_email text,p_matricula text,p_setor text,p_perfil text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.classifica_access_requests%ROWTYPE;
BEGIN
  IF NOT public.classifica_is_admin() THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
  IF p_decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Decisão inválida'; END IF;
  
  SELECT * INTO r FROM public.classifica_access_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND OR r.status<>'pending' THEN RAISE EXCEPTION 'Solicitação pendente não encontrada'; END IF;
  
  IF p_decision='approved' THEN
    INSERT INTO public.users(auth_user_id,email,username,name,matricula,setor,perfil,role,active,force_password_change,updated_at)
    VALUES(r.auth_user_id,lower(trim(p_email)),lower(trim(p_email)),trim(p_name),trim(p_matricula),p_setor,p_perfil,'Analista',true,false,now())
    ON CONFLICT (auth_user_id) WHERE auth_user_id IS NOT NULL DO UPDATE SET
      email=EXCLUDED.email,username=EXCLUDED.username,name=EXCLUDED.name,matricula=EXCLUDED.matricula,setor=EXCLUDED.setor,perfil=EXCLUDED.perfil,active=true,updated_at=now();
  END IF;
  
  UPDATE public.classifica_access_requests SET name=trim(p_name),email=lower(trim(p_email)),matricula=trim(p_matricula),setor=p_setor,perfil=p_perfil,status=p_decision,reviewed_at=now(),reviewed_by=(SELECT auth.uid()) WHERE id=p_request_id;
END;
$$;

-- 5. Atualizar listagem de usuários
CREATE OR REPLACE FUNCTION public.classifica_list_users()
RETURNS TABLE(id uuid,auth_user_id uuid,username text,email text,name text,matricula text,setor text,perfil text,role text,active boolean,created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.classifica_is_admin() THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
  RETURN QUERY SELECT u.id,u.auth_user_id,u.username,u.email,u.name,u.matricula,u.setor,u.perfil,u.role::text,u.active,u.created_at
    FROM public.users u ORDER BY u.name ASC;
END;
$$;

-- 6. Atualizar edição de usuário
CREATE OR REPLACE FUNCTION public.classifica_update_user_profile(p_user_id uuid,p_name text,p_matricula text,p_setor text,p_perfil text,p_role text,p_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.classifica_is_admin() THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
  UPDATE public.users SET name=trim(p_name),matricula=trim(p_matricula),setor=p_setor,perfil=p_perfil,role=p_role,active=p_active,updated_at=now()
    WHERE id=p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil não encontrado'; END IF;
END;
$$;

-- 7. RPC para Resetar Senha (marca para troca obrigatória)
CREATE OR REPLACE FUNCTION public.classifica_reset_user_password(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.classifica_is_admin() THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
  UPDATE public.users SET force_password_change=true, updated_at=now() WHERE id=p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuário não encontrado'; END IF;
END;
$$;

-- 8. RPC para Excluir Usuário
CREATE OR REPLACE FUNCTION public.classifica_delete_user(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.classifica_is_admin() THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
  DELETE FROM public.users WHERE id=p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuário não encontrado'; END IF;
END;
$$;

-- 9. RPC para Alternar Status Ativo/Inativo
CREATE OR REPLACE FUNCTION public.classifica_toggle_user_status(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.classifica_is_admin() THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
  UPDATE public.users SET active = NOT active, updated_at = now() WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuário não encontrado'; END IF;
END;
$$;

-- Garantir privilégios
GRANT EXECUTE ON FUNCTION public.classifica_list_access_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.classifica_review_access_request(uuid,text,text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.classifica_list_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.classifica_update_user_profile(uuid,text,text,text,text,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.classifica_reset_user_password(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.classifica_delete_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.classifica_toggle_user_status(uuid) TO authenticated;
