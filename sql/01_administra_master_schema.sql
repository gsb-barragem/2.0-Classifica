-- ============================================================================
-- ECOSSISTEMA CSB - BANCO CENTRAL: ADMINISTRA BARRAGENS (SCHEMA + RLS + RPCs)
-- ============================================================================
-- Objetivo:
--   Centralizar a base mestre padronizada de:
--     1) Empreendedores (PF/PJ)
--     2) Barragens cadastradas
--     3) Responsáveis Técnicos
--     4) Índice unificado de produtos gerados (Classifica, Notifica, Fiscaliza, Administra)
--     5) Solicitações de Alteração entre sistemas (Aprovar / Reprovar)
--
-- Regras de Propriedade e Segurança:
--   - Qualquer sistema autenticado do ecossistema pode CONSULTAR toda a base mestre.
--   - Qualquer sistema produtor pode CADASTRAR novos registros mestres (gravando seu sistema_origem).
--   - Um sistema NÃO PODE alterar diretamente um registro cujo sistema_origem seja de outro sistema.
--   - Exceção: O sistema proprietário (sistema_origem) pode editar o registro que gerou,
--     e o Administra Barragens detém a governança da base mestre que hospeda.
--   - Sistemas terceiros enviam uma Solicitação de Alteração para aprovação/reprovação.
--
-- NOTA ARQUITETURAL DE AUTENTICAÇÃO ENTRE PROJETOS SUPABASE:
--   As RPCs abaixo concedem EXECUTE apenas para `authenticated` (e `service_role`).
--   Para que o navegador no Classifica CSB invoque o Administra como `authenticated` sem
--   expor `service_role` e sem abrir `anon`:
--     Opção A (Recomendada): Compartilhar SSO/JWT entre os projetos Supabase do ecossistema
--       ou enviar o token para uma Edge Function/BFF intermediária no Administra.
--     Opção B: Configurar um Gateway de API autenticado que valide o JWT do Classifica e
--       execute no Administra com role controlada.
--   NUNCA exponha a chave `service_role` em variáveis `VITE_*` do frontend.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Empreendedores Padronizados
CREATE TABLE IF NOT EXISTS public.administra_empreendedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cpf_cnpj text NOT NULL,
  tipo_pessoa text NOT NULL CHECK (tipo_pessoa IN ('PF', 'PJ')),
  razao_social text NOT NULL CHECK (length(trim(razao_social)) BETWEEN 2 AND 240),
  nome_fantasia text,
  email text,
  telefone text,
  endereco text,
  municipio text,
  num_car text,
  sistema_origem text NOT NULL CHECK (sistema_origem IN ('CLASSIFICA_CSB','ADMINISTRA_BARRAGENS','NOTIFICA_CSB','FISCALIZA_BARRAGENS')),
  created_by_user_id uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS administra_empreendedores_cpf_cnpj_uidx
  ON public.administra_empreendedores (regexp_replace(cpf_cnpj, '\D', '', 'g'));
CREATE INDEX IF NOT EXISTS administra_empreendedores_razao_idx
  ON public.administra_empreendedores (lower(razao_social));

-- 2. Barragens Padronizadas
CREATE TABLE IF NOT EXISTS public.administra_barragens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empreendedor_id uuid REFERENCES public.administra_empreendedores(id) ON DELETE SET NULL,
  snisb text,
  nome text NOT NULL CHECK (length(trim(nome)) BETWEEN 2 AND 240),
  municipio text NOT NULL CHECK (length(trim(municipio)) BETWEEN 2 AND 120),
  upg text,
  sub_bacia text,
  curso_agua text,
  zona text CHECK (zona IN ('Rural', 'Urbana') OR zona IS NULL),
  localizacao text,
  lat_gms text,
  long_gms text,
  lat_decimal double precision,
  long_decimal double precision,
  altura_maxima text,
  comprimento_coroamento text,
  largura_coroamento text,
  volume_nmo text,
  volume_nmm text,
  tipo_estrutural text,
  tipo_fundacao text,
  finalidade text,
  situacao text,
  dpa_atual text,
  cri_atual text,
  enquadramento_pnsb boolean,
  sistema_origem text NOT NULL CHECK (sistema_origem IN ('CLASSIFICA_CSB','ADMINISTRA_BARRAGENS','NOTIFICA_CSB','FISCALIZA_BARRAGENS')),
  created_by_user_id uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS administra_barragens_snisb_uidx
  ON public.administra_barragens (upper(trim(snisb)))
  WHERE snisb IS NOT NULL AND trim(snisb) <> '';
CREATE INDEX IF NOT EXISTS administra_barragens_emp_idx
  ON public.administra_barragens (empreendedor_id);
CREATE INDEX IF NOT EXISTS administra_barragens_nome_idx
  ON public.administra_barragens (lower(nome));

-- 3. Responsáveis Técnicos Padronizados
CREATE TABLE IF NOT EXISTS public.administra_responsaveis_tecnicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (length(trim(nome)) BETWEEN 2 AND 200),
  cpf text,
  registro_profissional text,
  email text,
  telefone text,
  sistema_origem text NOT NULL CHECK (sistema_origem IN ('CLASSIFICA_CSB','ADMINISTRA_BARRAGENS','NOTIFICA_CSB','FISCALIZA_BARRAGENS')),
  created_by_user_id uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS administra_rts_registro_uidx
  ON public.administra_responsaveis_tecnicos (upper(trim(registro_profissional)))
  WHERE registro_profissional IS NOT NULL AND trim(registro_profissional) <> '';
CREATE INDEX IF NOT EXISTS administra_rts_nome_idx
  ON public.administra_responsaveis_tecnicos (lower(nome));

-- 4. Índice Unificado de Produtos Gerados no Ecossistema
CREATE TABLE IF NOT EXISTS public.administra_produtos_index (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sistema_origem text NOT NULL CHECK (sistema_origem IN ('CLASSIFICA_CSB','ADMINISTRA_BARRAGENS','NOTIFICA_CSB','FISCALIZA_BARRAGENS')),
  produto_origem_id text NOT NULL,
  tipo_produto text NOT NULL,
  numero_documento text,
  status text,
  data_documento text,
  analista_nome text,
  empreendedor_id uuid REFERENCES public.administra_empreendedores(id) ON DELETE SET NULL,
  empreendedor_nome text,
  empreendedor_cpf_cnpj text,
  barragem_id uuid REFERENCES public.administra_barragens(id) ON DELETE SET NULL,
  barragem_nome text,
  barragem_snisb text,
  municipio text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sistema_origem, produto_origem_id)
);

CREATE INDEX IF NOT EXISTS administra_produtos_emp_idx
  ON public.administra_produtos_index (empreendedor_id, empreendedor_cpf_cnpj);
CREATE INDEX IF NOT EXISTS administra_produtos_bar_idx
  ON public.administra_produtos_index (barragem_id, barragem_snisb);

-- 5. Solicitações de Alteração entre Sistemas
CREATE TABLE IF NOT EXISTS public.administra_solicitacoes_alteracao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade_tipo text NOT NULL CHECK (entidade_tipo IN ('empreendedor','barragem','responsavel_tecnico')),
  entidade_id uuid NOT NULL,
  entidade_rotulo text NOT NULL,
  sistema_solicitante text NOT NULL CHECK (sistema_solicitante IN ('CLASSIFICA_CSB','ADMINISTRA_BARRAGENS','NOTIFICA_CSB','FISCALIZA_BARRAGENS')),
  sistema_destino_proprietario text NOT NULL CHECK (sistema_destino_proprietario IN ('CLASSIFICA_CSB','ADMINISTRA_BARRAGENS','NOTIFICA_CSB','FISCALIZA_BARRAGENS')),
  solicitante_user_id uuid,
  solicitante_nome text NOT NULL,
  solicitante_email text,
  dados_atuais jsonb NOT NULL DEFAULT '{}'::jsonb,
  dados_propostos jsonb NOT NULL DEFAULT '{}'::jsonb,
  justificativa text NOT NULL CHECK (length(trim(justificativa)) >= 5),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovada','reprovada')),
  analisado_por_user_id uuid,
  analisado_por_nome text,
  parecer_analise text,
  created_at timestamptz NOT NULL DEFAULT now(),
  analisado_at timestamptz
);

CREATE INDEX IF NOT EXISTS administra_solic_dest_idx
  ON public.administra_solicitacoes_alteracao (sistema_destino_proprietario, status, created_at DESC);

-- ============================================================================
-- BLOQUEIO RLS DIRETO (Toda leitura e escrita passa por RPCs seguras)
-- ============================================================================
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'administra_empreendedores',
    'administra_barragens',
    'administra_responsaveis_tecnicos',
    'administra_produtos_index',
    'administra_solicitacoes_alteracao'
  ] LOOP
    EXECUTE pg_catalog.format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE pg_catalog.format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', tbl);
  END LOOP;
END;
$$;

-- ============================================================================
-- RPCs DE CONSULTA FEDERADA (SOMENTE LEITURA PARA TODOS OS SISTEMAS)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.administra_buscar_empreendedores(p_termo text DEFAULT '')
RETURNS SETOF public.administra_empreendedores
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_clean text := trim(COALESCE(p_termo, ''));
  v_digits text := regexp_replace(v_clean, '\D', '', 'g');
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.administra_empreendedores e
  WHERE v_clean = ''
     OR e.razao_social ILIKE '%' || v_clean || '%'
     OR COALESCE(e.nome_fantasia, '') ILIKE '%' || v_clean || '%'
     OR (length(v_digits) >= 3 AND regexp_replace(e.cpf_cnpj, '\D', '', 'g') LIKE '%' || v_digits || '%')
  ORDER BY e.razao_social ASC
  LIMIT 60;
END;
$$;

CREATE OR REPLACE FUNCTION public.administra_buscar_barragens(
  p_termo text DEFAULT '',
  p_empreendedor_id uuid DEFAULT NULL
)
RETURNS SETOF public.administra_barragens
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_clean text := trim(COALESCE(p_termo, ''));
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.administra_barragens b
  WHERE (p_empreendedor_id IS NULL OR b.empreendedor_id = p_empreendedor_id)
    AND (
      v_clean = ''
      OR b.nome ILIKE '%' || v_clean || '%'
      OR COALESCE(b.snisb, '') ILIKE '%' || v_clean || '%'
      OR b.municipio ILIKE '%' || v_clean || '%'
    )
  ORDER BY b.nome ASC
  LIMIT 60;
END;
$$;

CREATE OR REPLACE FUNCTION public.administra_buscar_rts(p_termo text DEFAULT '')
RETURNS SETOF public.administra_responsaveis_tecnicos
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_clean text := trim(COALESCE(p_termo, ''));
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.administra_responsaveis_tecnicos r
  WHERE v_clean = ''
     OR r.nome ILIKE '%' || v_clean || '%'
     OR COALESCE(r.registro_profissional, '') ILIKE '%' || v_clean || '%'
  ORDER BY r.nome ASC
  LIMIT 60;
END;
$$;

-- ============================================================================
-- RPCs DE ESCRITA COM BLOQUEIO ESTRITO DE PROPRIEDADE POR SISTEMA DE ORIGEM
-- ============================================================================

CREATE OR REPLACE FUNCTION public.administra_upsert_empreendedor(
  p_id uuid,
  p_sistema_solicitante text,
  p_user_id uuid,
  p_user_name text,
  p_dados jsonb
)
RETURNS public.administra_empreendedores
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_existing public.administra_empreendedores%ROWTYPE;
  v_result public.administra_empreendedores%ROWTYPE;
  v_cpf_cnpj text := regexp_replace(COALESCE(p_dados->>'cpf_cnpj', ''), '\D', '', 'g');
  v_razao text := trim(COALESCE(p_dados->>'razao_social', ''));
BEGIN
  IF p_sistema_solicitante NOT IN ('CLASSIFICA_CSB','ADMINISTRA_BARRAGENS','NOTIFICA_CSB','FISCALIZA_BARRAGENS') THEN
    RAISE EXCEPTION 'Sistema solicitante inválido';
  END IF;
  IF length(v_cpf_cnpj) NOT IN (11, 14) OR length(v_razao) < 2 THEN
    RAISE EXCEPTION 'CPF/CNPJ ou Razão Social inválidos';
  END IF;

  IF p_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.administra_empreendedores WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Empreendedor não encontrado';
    END IF;
    IF v_existing.sistema_origem <> p_sistema_solicitante AND p_sistema_solicitante <> 'ADMINISTRA_BARRAGENS' THEN
      RAISE EXCEPTION 'OWNERSHIP_CONFLICT: Registro pertence a %', v_existing.sistema_origem;
    END IF;

    UPDATE public.administra_empreendedores SET
      cpf_cnpj = v_cpf_cnpj,
      tipo_pessoa = CASE WHEN length(v_cpf_cnpj) = 14 THEN 'PJ' ELSE 'PF' END,
      razao_social = v_razao,
      nome_fantasia = NULLIF(trim(COALESCE(p_dados->>'nome_fantasia', '')), ''),
      email = NULLIF(lower(trim(COALESCE(p_dados->>'email', ''))), ''),
      telefone = NULLIF(trim(COALESCE(p_dados->>'telefone', '')), ''),
      endereco = NULLIF(trim(COALESCE(p_dados->>'endereco', '')), ''),
      municipio = NULLIF(trim(COALESCE(p_dados->>'municipio', '')), ''),
      num_car = NULLIF(trim(COALESCE(p_dados->>'num_car', '')), ''),
      updated_at = now()
    WHERE id = p_id
    RETURNING * INTO v_result;

    RETURN v_result;
  END IF;

  -- Evita duplicação pelo mesmo CPF/CNPJ: se já existe de outro sistema, retorna sem sobrescrever (ou levanta conflito)
  SELECT * INTO v_existing
  FROM public.administra_empreendedores
  WHERE regexp_replace(cpf_cnpj, '\D', '', 'g') = v_cpf_cnpj
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.sistema_origem <> p_sistema_solicitante AND p_sistema_solicitante <> 'ADMINISTRA_BARRAGENS' THEN
      RAISE EXCEPTION 'OWNERSHIP_CONFLICT: Empreendedor já cadastrado por %', v_existing.sistema_origem;
    END IF;
    RETURN v_existing;
  END IF;

  INSERT INTO public.administra_empreendedores (
    cpf_cnpj, tipo_pessoa, razao_social, nome_fantasia, email, telefone,
    endereco, municipio, num_car, sistema_origem, created_by_user_id, created_by_name
  ) VALUES (
    v_cpf_cnpj,
    CASE WHEN length(v_cpf_cnpj) = 14 THEN 'PJ' ELSE 'PF' END,
    v_razao,
    NULLIF(trim(COALESCE(p_dados->>'nome_fantasia', '')), ''),
    NULLIF(lower(trim(COALESCE(p_dados->>'email', ''))), ''),
    NULLIF(trim(COALESCE(p_dados->>'telefone', '')), ''),
    NULLIF(trim(COALESCE(p_dados->>'endereco', '')), ''),
    NULLIF(trim(COALESCE(p_dados->>'municipio', '')), ''),
    NULLIF(trim(COALESCE(p_dados->>'num_car', '')), ''),
    p_sistema_solicitante,
    p_user_id,
    NULLIF(trim(COALESCE(p_user_name, '')), '')
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.administra_upsert_barragem(
  p_id uuid,
  p_sistema_solicitante text,
  p_user_id uuid,
  p_user_name text,
  p_dados jsonb
)
RETURNS public.administra_barragens
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_existing public.administra_barragens%ROWTYPE;
  v_result public.administra_barragens%ROWTYPE;
  v_nome text := trim(COALESCE(p_dados->>'nome', ''));
  v_municipio text := trim(COALESCE(p_dados->>'municipio', ''));
  v_snisb text := NULLIF(upper(trim(COALESCE(p_dados->>'snisb', ''))), '');
BEGIN
  IF p_sistema_solicitante NOT IN ('CLASSIFICA_CSB','ADMINISTRA_BARRAGENS','NOTIFICA_CSB','FISCALIZA_BARRAGENS') THEN
    RAISE EXCEPTION 'Sistema solicitante inválido';
  END IF;
  IF length(v_nome) < 2 OR length(v_municipio) < 2 THEN
    RAISE EXCEPTION 'Nome da barragem e município são obrigatórios';
  END IF;

  IF p_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.administra_barragens WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Barragem não encontrada';
    END IF;
    IF v_existing.sistema_origem <> p_sistema_solicitante AND p_sistema_solicitante <> 'ADMINISTRA_BARRAGENS' THEN
      RAISE EXCEPTION 'OWNERSHIP_CONFLICT: Registro pertence a %', v_existing.sistema_origem;
    END IF;

    UPDATE public.administra_barragens SET
      empreendedor_id = NULLIF(p_dados->>'empreendedor_id', '')::uuid,
      snisb = v_snisb,
      nome = v_nome,
      municipio = v_municipio,
      upg = NULLIF(trim(COALESCE(p_dados->>'upg', '')), ''),
      sub_bacia = NULLIF(trim(COALESCE(p_dados->>'sub_bacia', '')), ''),
      curso_agua = NULLIF(trim(COALESCE(p_dados->>'curso_agua', '')), ''),
      zona = NULLIF(p_dados->>'zona', ''),
      localizacao = NULLIF(trim(COALESCE(p_dados->>'localizacao', '')), ''),
      lat_gms = NULLIF(p_dados->>'lat_gms', ''),
      long_gms = NULLIF(p_dados->>'long_gms', ''),
      lat_decimal = NULLIF(p_dados->>'lat_decimal', '')::double precision,
      long_decimal = NULLIF(p_dados->>'long_decimal', '')::double precision,
      altura_maxima = NULLIF(p_dados->>'altura_maxima', ''),
      comprimento_coroamento = NULLIF(p_dados->>'comprimento_coroamento', ''),
      largura_coroamento = NULLIF(p_dados->>'largura_coroamento', ''),
      volume_nmo = NULLIF(p_dados->>'volume_nmo', ''),
      volume_nmm = NULLIF(p_dados->>'volume_nmm', ''),
      tipo_estrutural = NULLIF(p_dados->>'tipo_estrutural', ''),
      tipo_fundacao = NULLIF(p_dados->>'tipo_fundacao', ''),
      finalidade = NULLIF(p_dados->>'finalidade', ''),
      situacao = NULLIF(p_dados->>'situacao', ''),
      dpa_atual = NULLIF(p_dados->>'dpa_atual', ''),
      cri_atual = NULLIF(p_dados->>'cri_atual', ''),
      enquadramento_pnsb = (p_dados->>'enquadramento_pnsb')::boolean,
      updated_at = now()
    WHERE id = p_id
    RETURNING * INTO v_result;

    RETURN v_result;
  END IF;

  IF v_snisb IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.administra_barragens WHERE upper(trim(snisb)) = v_snisb LIMIT 1;
    IF FOUND THEN
      IF v_existing.sistema_origem <> p_sistema_solicitante AND p_sistema_solicitante <> 'ADMINISTRA_BARRAGENS' THEN
        RAISE EXCEPTION 'OWNERSHIP_CONFLICT: SNISB já cadastrado por %', v_existing.sistema_origem;
      END IF;
      RETURN v_existing;
    END IF;
  END IF;

  INSERT INTO public.administra_barragens (
    empreendedor_id, snisb, nome, municipio, upg, sub_bacia, curso_agua, zona,
    localizacao, lat_gms, long_gms, lat_decimal, long_decimal, altura_maxima,
    comprimento_coroamento, largura_coroamento, volume_nmo, volume_nmm,
    tipo_estrutural, tipo_fundacao, finalidade, situacao, dpa_atual, cri_atual,
    enquadramento_pnsb, sistema_origem, created_by_user_id, created_by_name
  ) VALUES (
    NULLIF(p_dados->>'empreendedor_id', '')::uuid,
    v_snisb,
    v_nome,
    v_municipio,
    NULLIF(trim(COALESCE(p_dados->>'upg', '')), ''),
    NULLIF(trim(COALESCE(p_dados->>'sub_bacia', '')), ''),
    NULLIF(trim(COALESCE(p_dados->>'curso_agua', '')), ''),
    NULLIF(p_dados->>'zona', ''),
    NULLIF(trim(COALESCE(p_dados->>'localizacao', '')), ''),
    NULLIF(p_dados->>'lat_gms', ''),
    NULLIF(p_dados->>'long_gms', ''),
    NULLIF(p_dados->>'lat_decimal', '')::double precision,
    NULLIF(p_dados->>'long_decimal', '')::double precision,
    NULLIF(p_dados->>'altura_maxima', ''),
    NULLIF(p_dados->>'comprimento_coroamento', ''),
    NULLIF(p_dados->>'largura_coroamento', ''),
    NULLIF(p_dados->>'volume_nmo', ''),
    NULLIF(p_dados->>'volume_nmm', ''),
    NULLIF(p_dados->>'tipo_estrutural', ''),
    NULLIF(p_dados->>'tipo_fundacao', ''),
    NULLIF(p_dados->>'finalidade', ''),
    NULLIF(p_dados->>'situacao', ''),
    NULLIF(p_dados->>'dpa_atual', ''),
    NULLIF(p_dados->>'cri_atual', ''),
    (p_dados->>'enquadramento_pnsb')::boolean,
    p_sistema_solicitante,
    p_user_id,
    NULLIF(trim(COALESCE(p_user_name, '')), '')
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.administra_upsert_rt(
  p_id uuid,
  p_sistema_solicitante text,
  p_user_id uuid,
  p_user_name text,
  p_dados jsonb
)
RETURNS public.administra_responsaveis_tecnicos
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_existing public.administra_responsaveis_tecnicos%ROWTYPE;
  v_result public.administra_responsaveis_tecnicos%ROWTYPE;
  v_nome text := trim(COALESCE(p_dados->>'nome', ''));
  v_reg text := NULLIF(upper(trim(COALESCE(p_dados->>'registro_profissional', ''))), '');
BEGIN
  IF p_sistema_solicitante NOT IN ('CLASSIFICA_CSB','ADMINISTRA_BARRAGENS','NOTIFICA_CSB','FISCALIZA_BARRAGENS') THEN
    RAISE EXCEPTION 'Sistema solicitante inválido';
  END IF;
  IF length(v_nome) < 2 THEN
    RAISE EXCEPTION 'Nome do responsável técnico é obrigatório';
  END IF;

  IF p_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.administra_responsaveis_tecnicos WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Responsável técnico não encontrado';
    END IF;
    IF v_existing.sistema_origem <> p_sistema_solicitante AND p_sistema_solicitante <> 'ADMINISTRA_BARRAGENS' THEN
      RAISE EXCEPTION 'OWNERSHIP_CONFLICT: Registro pertence a %', v_existing.sistema_origem;
    END IF;

    UPDATE public.administra_responsaveis_tecnicos SET
      nome = v_nome,
      cpf = NULLIF(regexp_replace(COALESCE(p_dados->>'cpf', ''), '\D', '', 'g'), ''),
      registro_profissional = v_reg,
      email = NULLIF(lower(trim(COALESCE(p_dados->>'email', ''))), ''),
      telefone = NULLIF(trim(COALESCE(p_dados->>'telefone', '')), ''),
      updated_at = now()
    WHERE id = p_id
    RETURNING * INTO v_result;

    RETURN v_result;
  END IF;

  IF v_reg IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.administra_responsaveis_tecnicos WHERE upper(trim(registro_profissional)) = v_reg LIMIT 1;
    IF FOUND THEN
      IF v_existing.sistema_origem <> p_sistema_solicitante AND p_sistema_solicitante <> 'ADMINISTRA_BARRAGENS' THEN
        RAISE EXCEPTION 'OWNERSHIP_CONFLICT: RT já cadastrado por %', v_existing.sistema_origem;
      END IF;
      RETURN v_existing;
    END IF;
  END IF;

  INSERT INTO public.administra_responsaveis_tecnicos (
    nome, cpf, registro_profissional, email, telefone, sistema_origem, created_by_user_id, created_by_name
  ) VALUES (
    v_nome,
    NULLIF(regexp_replace(COALESCE(p_dados->>'cpf', ''), '\D', '', 'g'), ''),
    v_reg,
    NULLIF(lower(trim(COALESCE(p_dados->>'email', ''))), ''),
    NULLIF(trim(COALESCE(p_dados->>'telefone', '')), ''),
    p_sistema_solicitante,
    p_user_id,
    NULLIF(trim(COALESCE(p_user_name, '')), '')
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

-- ============================================================================
-- RPCs DE SOLICITAÇÕES DE ALTERAÇÃO (FLUXO INTER-SISTEMAS)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.administra_criar_solicitacao(
  p_entidade_tipo text,
  p_entidade_id uuid,
  p_entidade_rotulo text,
  p_sistema_solicitante text,
  p_sistema_destino text,
  p_solicitante_user_id uuid,
  p_solicitante_nome text,
  p_solicitante_email text,
  p_dados_atuais jsonb,
  p_dados_propostos jsonb,
  p_justificativa text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_entidade_tipo NOT IN ('empreendedor','barragem','responsavel_tecnico') THEN
    RAISE EXCEPTION 'Tipo de entidade inválido';
  END IF;
  IF p_sistema_solicitante NOT IN ('CLASSIFICA_CSB','ADMINISTRA_BARRAGENS','NOTIFICA_CSB','FISCALIZA_BARRAGENS')
     OR p_sistema_destino NOT IN ('CLASSIFICA_CSB','ADMINISTRA_BARRAGENS','NOTIFICA_CSB','FISCALIZA_BARRAGENS') THEN
    RAISE EXCEPTION 'Sistema de origem/destino inválido';
  END IF;
  IF length(trim(COALESCE(p_justificativa, ''))) < 5 THEN
    RAISE EXCEPTION 'Justificativa obrigatória';
  END IF;

  INSERT INTO public.administra_solicitacoes_alteracao (
    entidade_tipo, entidade_id, entidade_rotulo, sistema_solicitante,
    sistema_destino_proprietario, solicitante_user_id, solicitante_nome,
    solicitante_email, dados_atuais, dados_propostos, justificativa
  ) VALUES (
    p_entidade_tipo, p_entidade_id, trim(p_entidade_rotulo), p_sistema_solicitante,
    p_sistema_destino, p_solicitante_user_id, trim(p_solicitante_nome),
    NULLIF(lower(trim(COALESCE(p_solicitante_email, ''))), ''),
    COALESCE(p_dados_atuais, '{}'::jsonb),
    COALESCE(p_dados_propostos, '{}'::jsonb),
    trim(p_justificativa)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.administra_listar_solicitacoes(
  p_sistema text DEFAULT 'CLASSIFICA_CSB',
  p_escopo text DEFAULT 'all'
)
RETURNS SETOF public.administra_solicitacoes_alteracao
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.administra_solicitacoes_alteracao s
  WHERE (p_escopo = 'incoming' AND s.sistema_destino_proprietario = p_sistema)
     OR (p_escopo = 'outgoing' AND s.sistema_solicitante = p_sistema)
     OR (p_escopo = 'all' AND (s.sistema_destino_proprietario = p_sistema OR s.sistema_solicitante = p_sistema OR p_sistema = 'ADMINISTRA_BARRAGENS'))
  ORDER BY s.created_at DESC
  LIMIT 150;
END;
$$;

CREATE OR REPLACE FUNCTION public.administra_revisar_solicitacao(
  p_solicitacao_id uuid,
  p_decisao text,
  p_sistema_revisor text,
  p_revisor_user_id uuid,
  p_revisor_nome text,
  p_parecer text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r public.administra_solicitacoes_alteracao%ROWTYPE;
BEGIN
  IF p_decisao NOT IN ('aprovada','reprovada') THEN
    RAISE EXCEPTION 'Decisão inválida';
  END IF;

  SELECT * INTO r FROM public.administra_solicitacoes_alteracao WHERE id = p_solicitacao_id FOR UPDATE;
  IF NOT FOUND OR r.status <> 'pendente' THEN
    RAISE EXCEPTION 'Solicitação pendente não encontrada';
  END IF;

  IF p_sistema_revisor <> r.sistema_destino_proprietario AND p_sistema_revisor <> 'ADMINISTRA_BARRAGENS' THEN
    RAISE EXCEPTION 'Apenas o sistema proprietário ou o Administra Barragens pode aprovar/reprovar esta solicitação';
  END IF;

  -- Ao aprovar, aplica automaticamente os campos propostos no cadastro mestre correspondente
  IF p_decisao = 'aprovada' THEN
    IF r.entidade_tipo = 'empreendedor' THEN
      UPDATE public.administra_empreendedores SET
        razao_social = COALESCE(NULLIF(trim(r.dados_propostos->>'razao_social'), ''), razao_social),
        cpf_cnpj = COALESCE(NULLIF(regexp_replace(COALESCE(r.dados_propostos->>'cpf_cnpj', ''), '\D', '', 'g'), ''), cpf_cnpj),
        municipio = COALESCE(NULLIF(trim(r.dados_propostos->>'municipio'), ''), municipio),
        telefone = COALESCE(NULLIF(trim(r.dados_propostos->>'telefone'), ''), telefone),
        email = COALESCE(NULLIF(lower(trim(r.dados_propostos->>'email')), ''), email),
        endereco = COALESCE(NULLIF(trim(r.dados_propostos->>'endereco'), ''), endereco),
        num_car = COALESCE(NULLIF(trim(r.dados_propostos->>'num_car'), ''), num_car),
        updated_at = now()
      WHERE id = r.entidade_id;
    ELSIF r.entidade_tipo = 'barragem' THEN
      UPDATE public.administra_barragens SET
        nome = COALESCE(NULLIF(trim(r.dados_propostos->>'nome'), ''), nome),
        snisb = COALESCE(NULLIF(upper(trim(r.dados_propostos->>'snisb')), ''), snisb),
        municipio = COALESCE(NULLIF(trim(r.dados_propostos->>'municipio'), ''), municipio),
        curso_agua = COALESCE(NULLIF(trim(r.dados_propostos->>'curso_agua'), ''), curso_agua),
        sub_bacia = COALESCE(NULLIF(trim(r.dados_propostos->>'sub_bacia'), ''), sub_bacia),
        dpa_atual = COALESCE(NULLIF(trim(r.dados_propostos->>'dpa_atual'), ''), dpa_atual),
        cri_atual = COALESCE(NULLIF(trim(r.dados_propostos->>'cri_atual'), ''), cri_atual),
        updated_at = now()
      WHERE id = r.entidade_id;
    ELSIF r.entidade_tipo = 'responsavel_tecnico' THEN
      UPDATE public.administra_responsaveis_tecnicos SET
        nome = COALESCE(NULLIF(trim(r.dados_propostos->>'nome'), ''), nome),
        registro_profissional = COALESCE(NULLIF(upper(trim(r.dados_propostos->>'registro_profissional')), ''), registro_profissional),
        email = COALESCE(NULLIF(lower(trim(r.dados_propostos->>'email')), ''), email),
        telefone = COALESCE(NULLIF(trim(r.dados_propostos->>'telefone'), ''), telefone),
        updated_at = now()
      WHERE id = r.entidade_id;
    END IF;
  END IF;

  UPDATE public.administra_solicitacoes_alteracao SET
    status = p_decisao,
    analisado_por_user_id = p_revisor_user_id,
    analisado_por_nome = trim(p_revisor_nome),
    parecer_analise = NULLIF(trim(COALESCE(p_parecer, '')), ''),
    analisado_at = now()
  WHERE id = p_solicitacao_id;
END;
$$;

-- ============================================================================
-- RPCs DO ÍNDICE CRUZADO DE PRODUTOS DO ECOSSISTEMA
-- ============================================================================

CREATE OR REPLACE FUNCTION public.administra_registrar_produto_ecossistema(
  p_sistema_origem text,
  p_produto_origem_id text,
  p_tipo_produto text,
  p_numero_documento text DEFAULT NULL,
  p_status text DEFAULT 'Rascunho',
  p_data_documento text DEFAULT NULL,
  p_analista_nome text DEFAULT NULL,
  p_empreendedor_id uuid DEFAULT NULL,
  p_empreendedor_nome text DEFAULT NULL,
  p_empreendedor_cpf_cnpj text DEFAULT NULL,
  p_barragem_id uuid DEFAULT NULL,
  p_barragem_nome text DEFAULT NULL,
  p_barragem_snisb text DEFAULT NULL,
  p_municipio text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id uuid;
  v_digits text := NULLIF(regexp_replace(COALESCE(p_empreendedor_cpf_cnpj, ''), '\D', '', 'g'), '');
BEGIN
  IF p_sistema_origem NOT IN ('CLASSIFICA_CSB','ADMINISTRA_BARRAGENS','NOTIFICA_CSB','FISCALIZA_BARRAGENS') THEN
    RAISE EXCEPTION 'Sistema de origem inválido';
  END IF;

  INSERT INTO public.administra_produtos_index (
    sistema_origem, produto_origem_id, tipo_produto, numero_documento, status,
    data_documento, analista_nome, empreendedor_id, empreendedor_nome,
    empreendedor_cpf_cnpj, barragem_id, barragem_nome, barragem_snisb, municipio, updated_at
  ) VALUES (
    p_sistema_origem, p_produto_origem_id, p_tipo_produto, p_numero_documento, p_status,
    p_data_documento, p_analista_nome, p_empreendedor_id, p_empreendedor_nome,
    v_digits, p_barragem_id, p_barragem_nome, NULLIF(upper(trim(COALESCE(p_barragem_snisb, ''))), ''), p_municipio, now()
  )
  ON CONFLICT (sistema_origem, produto_origem_id) DO UPDATE SET
    tipo_produto = EXCLUDED.tipo_produto,
    numero_documento = EXCLUDED.numero_documento,
    status = EXCLUDED.status,
    data_documento = EXCLUDED.data_documento,
    analista_nome = EXCLUDED.analista_nome,
    empreendedor_id = COALESCE(EXCLUDED.empreendedor_id, public.administra_produtos_index.empreendedor_id),
    empreendedor_nome = COALESCE(EXCLUDED.empreendedor_nome, public.administra_produtos_index.empreendedor_nome),
    empreendedor_cpf_cnpj = COALESCE(EXCLUDED.empreendedor_cpf_cnpj, public.administra_produtos_index.empreendedor_cpf_cnpj),
    barragem_id = COALESCE(EXCLUDED.barragem_id, public.administra_produtos_index.barragem_id),
    barragem_nome = COALESCE(EXCLUDED.barragem_nome, public.administra_produtos_index.barragem_nome),
    barragem_snisb = COALESCE(EXCLUDED.barragem_snisb, public.administra_produtos_index.barragem_snisb),
    municipio = COALESCE(EXCLUDED.municipio, public.administra_produtos_index.municipio),
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.administra_consultar_produtos_entidade(
  p_empreendedor_id uuid DEFAULT NULL,
  p_cpf_cnpj text DEFAULT NULL,
  p_barragem_id uuid DEFAULT NULL,
  p_snisb text DEFAULT NULL
)
RETURNS SETOF public.administra_produtos_index
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_digits text := NULLIF(regexp_replace(COALESCE(p_cpf_cnpj, ''), '\D', '', 'g'), '');
  v_snisb text := NULLIF(upper(trim(COALESCE(p_snisb, ''))), '');
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.administra_produtos_index p
  WHERE (p_empreendedor_id IS NOT NULL AND p.empreendedor_id = p_empreendedor_id)
     OR (v_digits IS NOT NULL AND p.empreendedor_cpf_cnpj = v_digits)
     OR (p_barragem_id IS NOT NULL AND p.barragem_id = p_barragem_id)
     OR (v_snisb IS NOT NULL AND upper(trim(COALESCE(p.barragem_snisb, ''))) = v_snisb)
  ORDER BY p.created_at DESC
  LIMIT 100;
END;
$$;

-- Permissões restritivas nas funções (nenhum acesso PUBLIC ou anon)
REVOKE ALL ON FUNCTION public.administra_buscar_empreendedores(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.administra_buscar_barragens(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.administra_buscar_rts(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.administra_upsert_empreendedor(uuid, text, uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.administra_upsert_barragem(uuid, text, uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.administra_upsert_rt(uuid, text, uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.administra_criar_solicitacao(text, uuid, text, text, text, uuid, text, text, jsonb, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.administra_listar_solicitacoes(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.administra_revisar_solicitacao(uuid, text, text, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.administra_registrar_produto_ecossistema(text, text, text, text, text, text, text, uuid, text, text, uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.administra_consultar_produtos_entidade(uuid, text, uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.administra_buscar_empreendedores(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.administra_buscar_barragens(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.administra_buscar_rts(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.administra_upsert_empreendedor(uuid, text, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.administra_upsert_barragem(uuid, text, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.administra_upsert_rt(uuid, text, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.administra_criar_solicitacao(text, uuid, text, text, text, uuid, text, text, jsonb, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.administra_listar_solicitacoes(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.administra_revisar_solicitacao(uuid, text, text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.administra_registrar_produto_ecossistema(text, text, text, text, text, text, text, uuid, text, text, uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.administra_consultar_produtos_entidade(uuid, text, uuid, text) TO authenticated;
