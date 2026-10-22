-- Correção da função de exclusão de usuário para lidar com vínculos e Auth
-- Execute este script no SQL Editor do Supabase.

CREATE OR REPLACE FUNCTION public.classifica_delete_user(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_auth_user_id uuid;
BEGIN
  -- 1. Verificação de permissão
  IF NOT EXISTS (
    SELECT 1 FROM public.users 
    WHERE auth_user_id = auth.uid() AND role = 'Administrador' AND active IS TRUE
  ) THEN 
    RAISE EXCEPTION 'Acesso não autorizado'; 
  END IF;

  -- 2. Identificar se o usuário possui vínculo com o Auth
  SELECT auth_user_id INTO v_auth_user_id FROM public.users WHERE id = p_user_id;

  -- 3. Se houver vínculo com o Auth, exclui do Auth (o cascade no banco cuidará de classifica_access_requests se configurado)
  IF v_auth_user_id IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = v_auth_user_id;
  END IF;

  -- 4. Excluir da tabela de perfis (public.users)
  -- Caso existam registros em tabelas de negócio (pareceres, oficios), a FK impedirá a exclusão por segurança.
  DELETE FROM public.users WHERE id = p_user_id;

  IF NOT FOUND AND v_auth_user_id IS NULL THEN 
    RAISE EXCEPTION 'Usuário não encontrado'; 
  END IF;
END;
$$;

-- Garantir privilégios
GRANT EXECUTE ON FUNCTION public.classifica_delete_user(uuid) TO authenticated;
