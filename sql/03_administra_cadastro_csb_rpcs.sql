-- ============================================================================
-- ECOSSISTEMA CSB - CADASTRO SOB DEMANDA NO ADMINISTRA & RASTREIO NO CLASSIFICA
-- ============================================================================
-- Este script é dividido em duas partes idempotentes:
--   PARTE 1 -> Executar no SQL Editor do projeto Supabase: ADMINISTRA BARRAGENS
--   PARTE 2 -> Executar no SQL Editor do projeto Supabase: 2.0 CLASSIFICA CSB
-- ============================================================================


-- ============================================================================
-- PARTE 1: ADMINISTRA BARRAGENS (Executar no Supabase do Administra Barragens)
-- ============================================================================
-- Garante colunas canônicas nas tabelas centrais (empreendedores, barragens,
-- rts e responsaveis_tecnicos_barragens), ajusta nulidades opcionais e cria as
-- RPCs transacionais SECURITY DEFINER usadas pelos formulários do Classifica CSB
-- quando o analista clica em "Cadastrar <<tipo>> na base de dados".

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1.1 Tabelas e colunas canônicas do Administra Barragens
CREATE TABLE IF NOT EXISTS public.empreendedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cpf_cnpj text,
  tipo_pessoa text DEFAULT 'PF',
  razao_social text,
  nome text,
  nome_fantasia text,
  email text,
  telefone text,
  endereco text,
  municipio text,
  num_car text,
  sistema_origem text DEFAULT 'CLASSIFICA_CSB',
  created_by_user_id uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.empreendedores ADD COLUMN IF NOT EXISTS cpf_cnpj text;
ALTER TABLE public.empreendedores ADD COLUMN IF NOT EXISTS tipo_pessoa text;
ALTER TABLE public.empreendedores ADD COLUMN IF NOT EXISTS razao_social text;
ALTER TABLE public.empreendedores ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.empreendedores ADD COLUMN IF NOT EXISTS nome_fantasia text;
ALTER TABLE public.empreendedores ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.empreendedores ADD COLUMN IF NOT EXISTS telefone text;
ALTER TABLE public.empreendedores ADD COLUMN IF NOT EXISTS endereco text;
ALTER TABLE public.empreendedores ADD COLUMN IF NOT EXISTS municipio text;
ALTER TABLE public.empreendedores ADD COLUMN IF NOT EXISTS num_car text;
ALTER TABLE public.empreendedores ADD COLUMN IF NOT EXISTS sistema_origem text DEFAULT 'CLASSIFICA_CSB';
ALTER TABLE public.empreendedores ADD COLUMN IF NOT EXISTS created_by_user_id uuid;
ALTER TABLE public.empreendedores ADD COLUMN IF NOT EXISTS created_by_name text;
ALTER TABLE public.empreendedores ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.empreendedores ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  ALTER TABLE public.empreendedores ALTER COLUMN cpf_cnpj DROP NOT NULL;
EXCEPTION WHEN undefined_column OR others THEN NULL;
END;
$$;

CREATE TABLE IF NOT EXISTS public.barragens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empreendedor_id uuid REFERENCES public.empreendedores(id) ON DELETE SET NULL,
  snisb text,
  nome text,
  municipio text,
  upg text,
  sub_bacia text,
  curso_agua text,
  zona text,
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
  sistema_origem text DEFAULT 'CLASSIFICA_CSB',
  created_by_user_id uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.barragens ADD COLUMN IF NOT EXISTS empreendedor_id uuid;
ALTER TABLE public.barragens ADD COLUMN IF NOT EXISTS snisb text;
ALTER TABLE public.barragens ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.barragens ADD COLUMN IF NOT EXISTS municipio text;
ALTER TABLE public.barragens ADD COLUMN IF NOT EXISTS upg text;
ALTER TABLE public.barragens ADD COLUMN IF NOT EXISTS sub_bacia text;
ALTER TABLE public.barragens ADD COLUMN IF NOT EXISTS curso_agua text;
ALTER TABLE public.barragens ADD COLUMN IF NOT EXISTS zona text;
ALTER TABLE public.barragens ADD COLUMN IF NOT EXISTS localizacao text;
ALTER TABLE public.barragens ADD COLUMN IF NOT EXISTS lat_gms text;
ALTER TABLE public.barragens ADD COLUMN IF NOT EXISTS long_gms text;
ALTER TABLE public.barragens ADD COLUMN IF NOT EXISTS lat_decimal double precision;
ALTER TABLE public.barragens ADD COLUMN IF NOT EXISTS long_decimal double precision;
ALTER TABLE public.barragens ADD COLUMN IF NOT EXISTS altura_maxima text;
ALTER TABLE public.barragens ADD COLUMN IF NOT EXISTS comprimento_coroamento text;
ALTER TABLE public.barragens ADD COLUMN IF NOT EXISTS largura_coroamento text;
ALTER TABLE public.barragens ADD COLUMN IF NOT EXISTS volume_nmo text;
ALTER TABLE public.barragens ADD COLUMN IF NOT EXISTS volume_nmm text;
ALTER TABLE public.barragens ADD COLUMN IF NOT EXISTS tipo_estrutural text;
ALTER TABLE public.barragens ADD COLUMN IF NOT EXISTS tipo_fundacao text;
ALTER TABLE public.barragens ADD COLUMN IF NOT EXISTS finalidade text;
ALTER TABLE public.barragens ADD COLUMN IF NOT EXISTS situacao text;
ALTER TABLE public.barragens ADD COLUMN IF NOT EXISTS dpa_atual text;
ALTER TABLE public.barragens ADD COLUMN IF NOT EXISTS cri_atual text;
ALTER TABLE public.barragens ADD COLUMN IF NOT EXISTS enquadramento_pnsb boolean;
ALTER TABLE public.barragens ADD COLUMN IF NOT EXISTS sistema_origem text DEFAULT 'CLASSIFICA_CSB';
ALTER TABLE public.barragens ADD COLUMN IF NOT EXISTS created_by_user_id uuid;
ALTER TABLE public.barragens ADD COLUMN IF NOT EXISTS created_by_name text;
ALTER TABLE public.barragens ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.barragens ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  ALTER TABLE public.barragens ALTER COLUMN municipio DROP NOT NULL;
EXCEPTION WHEN undefined_column OR others THEN NULL;
END;
$$;

CREATE TABLE IF NOT EXISTS public.rts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text,
  cpf text,
  registro_profissional text,
  email text,
  telefone text,
  art text,
  arts jsonb NOT NULL DEFAULT '[]'::jsonb,
  sistema_origem text DEFAULT 'CLASSIFICA_CSB',
  created_by_user_id uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rts ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.rts ADD COLUMN IF NOT EXISTS cpf text;
ALTER TABLE public.rts ADD COLUMN IF NOT EXISTS registro_profissional text;
ALTER TABLE public.rts ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.rts ADD COLUMN IF NOT EXISTS telefone text;
ALTER TABLE public.rts ADD COLUMN IF NOT EXISTS art text;
ALTER TABLE public.rts ADD COLUMN IF NOT EXISTS arts jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.rts ADD COLUMN IF NOT EXISTS sistema_origem text DEFAULT 'CLASSIFICA_CSB';
ALTER TABLE public.rts ADD COLUMN IF NOT EXISTS created_by_user_id uuid;
ALTER TABLE public.rts ADD COLUMN IF NOT EXISTS created_by_name text;
ALTER TABLE public.rts ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.rts ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.responsaveis_tecnicos_barragens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rt_id uuid REFERENCES public.rts(id) ON DELETE CASCADE,
  barragem_id uuid REFERENCES public.barragens(id) ON DELETE CASCADE,
  art text,
  atividade text,
  observacao text,
  sistema_origem text DEFAULT 'CLASSIFICA_CSB',
  created_by_user_id uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.responsaveis_tecnicos_barragens ADD COLUMN IF NOT EXISTS rt_id uuid;
ALTER TABLE public.responsaveis_tecnicos_barragens ADD COLUMN IF NOT EXISTS barragem_id uuid;
ALTER TABLE public.responsaveis_tecnicos_barragens ADD COLUMN IF NOT EXISTS art text;
ALTER TABLE public.responsaveis_tecnicos_barragens ADD COLUMN IF NOT EXISTS atividade text;
ALTER TABLE public.responsaveis_tecnicos_barragens ADD COLUMN IF NOT EXISTS observacao text;
ALTER TABLE public.responsaveis_tecnicos_barragens ADD COLUMN IF NOT EXISTS sistema_origem text DEFAULT 'CLASSIFICA_CSB';
ALTER TABLE public.responsaveis_tecnicos_barragens ADD COLUMN IF NOT EXISTS created_by_user_id uuid;
ALTER TABLE public.responsaveis_tecnicos_barragens ADD COLUMN IF NOT EXISTS created_by_name text;
ALTER TABLE public.responsaveis_tecnicos_barragens ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.responsaveis_tecnicos_barragens ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Permite vincular ART diretamente ao RT mesmo antes de selecionar a barragem
DO $$
BEGIN
  ALTER TABLE public.responsaveis_tecnicos_barragens ALTER COLUMN barragem_id DROP NOT NULL;
EXCEPTION WHEN undefined_column OR others THEN NULL;
END;
$$;

-- Índices de consulta e deduplicação segura
CREATE INDEX IF NOT EXISTS csb_emp_cpf_digits_idx
  ON public.empreendedores (regexp_replace(COALESCE(cpf_cnpj, ''), '\D', '', 'g'));
CREATE INDEX IF NOT EXISTS csb_emp_razao_lower_idx
  ON public.empreendedores (lower(trim(COALESCE(razao_social, nome, ''))));
CREATE INDEX IF NOT EXISTS csb_bar_emp_id_idx
  ON public.barragens (empreendedor_id);
CREATE INDEX IF NOT EXISTS csb_bar_snisb_upper_idx
  ON public.barragens (upper(trim(COALESCE(snisb, ''))));
CREATE INDEX IF NOT EXISTS csb_bar_nome_lower_idx
  ON public.barragens (lower(trim(COALESCE(nome, ''))));
CREATE INDEX IF NOT EXISTS csb_rts_nome_lower_idx
  ON public.rts (lower(trim(COALESCE(nome, ''))));
CREATE INDEX IF NOT EXISTS csb_rts_reg_upper_idx
  ON public.rts (upper(trim(COALESCE(registro_profissional, ''))));
CREATE INDEX IF NOT EXISTS csb_rt_bar_rt_idx
  ON public.responsaveis_tecnicos_barragens (rt_id);
CREATE INDEX IF NOT EXISTS csb_rt_bar_bar_idx
  ON public.responsaveis_tecnicos_barragens (barragem_id);

-- Compatibilidade caso o Administra também utilize tabelas administra_* legadas
DO $$
BEGIN
  IF pg_catalog.to_regclass('public.administra_empreendedores') IS NOT NULL THEN
    ALTER TABLE public.administra_empreendedores ALTER COLUMN cpf_cnpj DROP NOT NULL;
  END IF;
  IF pg_catalog.to_regclass('public.administra_barragens') IS NOT NULL THEN
    ALTER TABLE public.administra_barragens ALTER COLUMN municipio DROP NOT NULL;
  END IF;
EXCEPTION WHEN others THEN NULL;
END;
$$;

-- 1.2 RPCs de Cadastro Sob Demanda a partir do Classifica CSB
CREATE OR REPLACE FUNCTION public.csb_cadastrar_empreendedor(
  p_id uuid DEFAULT NULL,
  p_dados jsonb DEFAULT '{}'::jsonb,
  p_user_id text DEFAULT NULL,
  p_user_name text DEFAULT NULL,
  p_sistema_origem text DEFAULT 'CLASSIFICA_CSB'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cpf_raw text := COALESCE(NULLIF(trim(COALESCE(p_dados->>'cpf_cnpj', '')), ''), '');
  v_cpf_digits text := regexp_replace(v_cpf_raw, '\D', '', 'g');
  v_tipo_pessoa text;
  v_razao text := regexp_replace(trim(COALESCE(p_dados->>'razao_social', p_dados->>'nome', '')), '\s+', ' ', 'g');
  v_fantasia text := NULLIF(regexp_replace(trim(COALESCE(p_dados->>'nome_fantasia', '')), '\s+', ' ', 'g'), '');
  v_email text := NULLIF(lower(trim(COALESCE(p_dados->>'email', ''))), '');
  v_tel text := NULLIF(trim(COALESCE(p_dados->>'telefone', '')), '');
  v_endereco text := NULLIF(regexp_replace(trim(COALESCE(p_dados->>'endereco', p_dados->>'localizacao', '')), '\s+', ' ', 'g'), '');
  v_municipio text := NULLIF(regexp_replace(trim(COALESCE(p_dados->>'municipio', '')), '\s+', ' ', 'g'), '');
  v_car text := NULLIF(regexp_replace(trim(COALESCE(p_dados->>'num_car', '')), '\s+', ' ', 'g'), '');
  v_sistema text := COALESCE(NULLIF(trim(COALESCE(p_sistema_origem, '')), ''), 'CLASSIFICA_CSB');
  v_user_uuid uuid;
  v_existing public.empreendedores%ROWTYPE;
  v_result public.empreendedores%ROWTYPE;
BEGIN
  IF length(v_razao) < 2 THEN
    RAISE EXCEPTION 'Nome ou Razão Social do empreendedor é obrigatório.' USING ERRCODE = '22023';
  END IF;

  IF length(v_cpf_digits) > 0 AND length(v_cpf_digits) NOT IN (11, 14) THEN
    RAISE EXCEPTION 'CPF/CNPJ inválido. Informe 11 ou 14 dígitos.' USING ERRCODE = '22023';
  END IF;

  v_tipo_pessoa := COALESCE(
    NULLIF(upper(trim(COALESCE(p_dados->>'tipo_pessoa', ''))), ''),
    CASE WHEN length(v_cpf_digits) = 14 THEN 'PJ' ELSE 'PF' END
  );

  BEGIN
    v_user_uuid := NULLIF(trim(COALESCE(p_user_id, '')), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_user_uuid := NULL;
  END;

  IF p_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.empreendedores WHERE id = p_id LIMIT 1;
  END IF;

  IF v_existing.id IS NULL AND length(v_cpf_digits) IN (11, 14) THEN
    SELECT * INTO v_existing
    FROM public.empreendedores e
    WHERE regexp_replace(COALESCE(e.cpf_cnpj, ''), '\D', '', 'g') = v_cpf_digits
    LIMIT 1;
  END IF;

  IF v_existing.id IS NULL THEN
    SELECT * INTO v_existing
    FROM public.empreendedores e
    WHERE lower(trim(COALESCE(e.razao_social, e.nome, ''))) = lower(v_razao)
      AND (
        v_municipio IS NULL
        OR NULLIF(trim(COALESCE(e.municipio, '')), '') IS NULL
        OR lower(trim(e.municipio)) = lower(v_municipio)
      )
    LIMIT 1;
  END IF;

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.empreendedores e
    SET
      cpf_cnpj = COALESCE(NULLIF(e.cpf_cnpj, ''), NULLIF(v_cpf_digits, '')),
      tipo_pessoa = COALESCE(NULLIF(e.tipo_pessoa, ''), v_tipo_pessoa),
      razao_social = COALESCE(NULLIF(e.razao_social, ''), v_razao),
      nome = COALESCE(NULLIF(e.nome, ''), v_razao),
      nome_fantasia = COALESCE(e.nome_fantasia, v_fantasia),
      email = COALESCE(e.email, v_email),
      telefone = COALESCE(e.telefone, v_tel),
      endereco = COALESCE(NULLIF(e.endereco, ''), v_endereco),
      municipio = COALESCE(NULLIF(e.municipio, ''), v_municipio),
      num_car = COALESCE(NULLIF(e.num_car, ''), v_car),
      updated_at = now()
    WHERE e.id = v_existing.id
    RETURNING * INTO v_result;
  ELSE
    INSERT INTO public.empreendedores (
      cpf_cnpj,
      tipo_pessoa,
      razao_social,
      nome,
      nome_fantasia,
      email,
      telefone,
      endereco,
      municipio,
      num_car,
      sistema_origem,
      created_by_user_id,
      created_by_name,
      created_at,
      updated_at
    ) VALUES (
      NULLIF(v_cpf_digits, ''),
      v_tipo_pessoa,
      v_razao,
      v_razao,
      v_fantasia,
      v_email,
      v_tel,
      v_endereco,
      v_municipio,
      v_car,
      v_sistema,
      v_user_uuid,
      NULLIF(trim(COALESCE(p_user_name, '')), ''),
      now(),
      now()
    )
    RETURNING * INTO v_result;
  END IF;

  RETURN to_jsonb(v_result);
END;
$$;

CREATE OR REPLACE FUNCTION public.csb_cadastrar_barragem(
  p_id uuid DEFAULT NULL,
  p_dados jsonb DEFAULT '{}'::jsonb,
  p_user_id text DEFAULT NULL,
  p_user_name text DEFAULT NULL,
  p_sistema_origem text DEFAULT 'CLASSIFICA_CSB'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp_id uuid;
  v_snisb text := NULLIF(upper(trim(COALESCE(p_dados->>'snisb', ''))), '');
  v_nome text := regexp_replace(trim(COALESCE(p_dados->>'nome', '')), '\s+', ' ', 'g');
  v_municipio text := NULLIF(regexp_replace(trim(COALESCE(p_dados->>'municipio', '')), '\s+', ' ', 'g'), '');
  v_upg text := NULLIF(regexp_replace(trim(COALESCE(p_dados->>'upg', '')), '\s+', ' ', 'g'), '');
  v_sub_bacia text := NULLIF(regexp_replace(trim(COALESCE(p_dados->>'sub_bacia', '')), '\s+', ' ', 'g'), '');
  v_curso_agua text := NULLIF(regexp_replace(trim(COALESCE(p_dados->>'curso_agua', '')), '\s+', ' ', 'g'), '');
  v_zona text := NULLIF(trim(COALESCE(p_dados->>'zona', '')), '');
  v_localizacao text := NULLIF(regexp_replace(trim(COALESCE(p_dados->>'localizacao', '')), '\s+', ' ', 'g'), '');
  v_lat_gms text := NULLIF(trim(COALESCE(p_dados->>'lat_gms', '')), '');
  v_long_gms text := NULLIF(trim(COALESCE(p_dados->>'long_gms', '')), '');
  v_lat_dec double precision;
  v_long_dec double precision;
  v_altura text := NULLIF(trim(COALESCE(p_dados->>'altura_maxima', '')), '');
  v_comp text := NULLIF(trim(COALESCE(p_dados->>'comprimento_coroamento', '')), '');
  v_larg text := NULLIF(trim(COALESCE(p_dados->>'largura_coroamento', '')), '');
  v_vol_nmo text := NULLIF(trim(COALESCE(p_dados->>'volume_nmo', '')), '');
  v_vol_nmm text := NULLIF(trim(COALESCE(p_dados->>'volume_nmm', '')), '');
  v_tipo_est text := NULLIF(trim(COALESCE(p_dados->>'tipo_estrutural', '')), '');
  v_tipo_fund text := NULLIF(trim(COALESCE(p_dados->>'tipo_fundacao', '')), '');
  v_finalidade text := NULLIF(trim(COALESCE(p_dados->>'finalidade', '')), '');
  v_situacao text := NULLIF(trim(COALESCE(p_dados->>'situacao', '')), '');
  v_dpa text := NULLIF(trim(COALESCE(p_dados->>'dpa_atual', '')), '');
  v_cri text := NULLIF(trim(COALESCE(p_dados->>'cri_atual', '')), '');
  v_pnsb boolean;
  v_sistema text := COALESCE(NULLIF(trim(COALESCE(p_sistema_origem, '')), ''), 'CLASSIFICA_CSB');
  v_user_uuid uuid;
  v_existing public.barragens%ROWTYPE;
  v_result public.barragens%ROWTYPE;
BEGIN
  IF length(v_nome) < 2 THEN
    RAISE EXCEPTION 'Nome da barragem é obrigatório.' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_emp_id := NULLIF(trim(COALESCE(p_dados->>'empreendedor_id', '')), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_emp_id := NULL;
  END;

  BEGIN
    v_user_uuid := NULLIF(trim(COALESCE(p_user_id, '')), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_user_uuid := NULL;
  END;

  BEGIN
    v_lat_dec := NULLIF(replace(trim(COALESCE(p_dados->>'lat_decimal', '')), ',', '.'), '')::double precision;
  EXCEPTION WHEN others THEN
    v_lat_dec := NULL;
  END;

  BEGIN
    v_long_dec := NULLIF(replace(trim(COALESCE(p_dados->>'long_decimal', '')), ',', '.'), '')::double precision;
  EXCEPTION WHEN others THEN
    v_long_dec := NULL;
  END;

  IF p_dados ? 'enquadramento_pnsb' AND p_dados->>'enquadramento_pnsb' IN ('true', 'false') THEN
    v_pnsb := (p_dados->>'enquadramento_pnsb')::boolean;
  ELSE
    v_pnsb := NULL;
  END IF;

  IF p_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.barragens WHERE id = p_id LIMIT 1;
  END IF;

  IF v_existing.id IS NULL AND v_snisb IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.barragens b
    WHERE upper(trim(COALESCE(b.snisb, ''))) = v_snisb
    LIMIT 1;
  END IF;

  IF v_existing.id IS NULL THEN
    SELECT * INTO v_existing
    FROM public.barragens b
    WHERE lower(trim(COALESCE(b.nome, ''))) = lower(v_nome)
      AND (
        v_municipio IS NULL
        OR NULLIF(trim(COALESCE(b.municipio, '')), '') IS NULL
        OR lower(trim(b.municipio)) = lower(v_municipio)
      )
      AND (v_emp_id IS NULL OR b.empreendedor_id IS NULL OR b.empreendedor_id = v_emp_id)
    LIMIT 1;
  END IF;

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.barragens b
    SET
      empreendedor_id = COALESCE(b.empreendedor_id, v_emp_id),
      snisb = COALESCE(NULLIF(b.snisb, ''), v_snisb),
      municipio = COALESCE(NULLIF(b.municipio, ''), v_municipio),
      upg = COALESCE(NULLIF(b.upg, ''), v_upg),
      sub_bacia = COALESCE(NULLIF(b.sub_bacia, ''), v_sub_bacia),
      curso_agua = COALESCE(NULLIF(b.curso_agua, ''), v_curso_agua),
      zona = COALESCE(NULLIF(b.zona, ''), v_zona),
      localizacao = COALESCE(NULLIF(b.localizacao, ''), v_localizacao),
      lat_gms = COALESCE(NULLIF(b.lat_gms, ''), v_lat_gms),
      long_gms = COALESCE(NULLIF(b.long_gms, ''), v_long_gms),
      lat_decimal = COALESCE(b.lat_decimal, v_lat_dec),
      long_decimal = COALESCE(b.long_decimal, v_long_dec),
      altura_maxima = COALESCE(NULLIF(b.altura_maxima, ''), v_altura),
      comprimento_coroamento = COALESCE(NULLIF(b.comprimento_coroamento, ''), v_comp),
      largura_coroamento = COALESCE(NULLIF(b.largura_coroamento, ''), v_larg),
      volume_nmo = COALESCE(NULLIF(b.volume_nmo, ''), v_vol_nmo),
      volume_nmm = COALESCE(NULLIF(b.volume_nmm, ''), v_vol_nmm),
      tipo_estrutural = COALESCE(NULLIF(b.tipo_estrutural, ''), v_tipo_est),
      tipo_fundacao = COALESCE(NULLIF(b.tipo_fundacao, ''), v_tipo_fund),
      finalidade = COALESCE(NULLIF(b.finalidade, ''), v_finalidade),
      situacao = COALESCE(NULLIF(b.situacao, ''), v_situacao),
      dpa_atual = COALESCE(NULLIF(b.dpa_atual, ''), v_dpa),
      cri_atual = COALESCE(NULLIF(b.cri_atual, ''), v_cri),
      enquadramento_pnsb = COALESCE(b.enquadramento_pnsb, v_pnsb),
      updated_at = now()
    WHERE b.id = v_existing.id
    RETURNING * INTO v_result;
  ELSE
    INSERT INTO public.barragens (
      empreendedor_id,
      snisb,
      nome,
      municipio,
      upg,
      sub_bacia,
      curso_agua,
      zona,
      localizacao,
      lat_gms,
      long_gms,
      lat_decimal,
      long_decimal,
      altura_maxima,
      comprimento_coroamento,
      largura_coroamento,
      volume_nmo,
      volume_nmm,
      tipo_estrutural,
      tipo_fundacao,
      finalidade,
      situacao,
      dpa_atual,
      cri_atual,
      enquadramento_pnsb,
      sistema_origem,
      created_by_user_id,
      created_by_name,
      created_at,
      updated_at
    ) VALUES (
      v_emp_id,
      v_snisb,
      v_nome,
      COALESCE(v_municipio, ''),
      v_upg,
      v_sub_bacia,
      v_curso_agua,
      v_zona,
      v_localizacao,
      v_lat_gms,
      v_long_gms,
      v_lat_dec,
      v_long_dec,
      v_altura,
      v_comp,
      v_larg,
      v_vol_nmo,
      v_vol_nmm,
      v_tipo_est,
      v_tipo_fund,
      v_finalidade,
      v_situacao,
      v_dpa,
      v_cri,
      v_pnsb,
      v_sistema,
      v_user_uuid,
      NULLIF(trim(COALESCE(p_user_name, '')), ''),
      now(),
      now()
    )
    RETURNING * INTO v_result;
  END IF;

  RETURN to_jsonb(v_result);
END;
$$;

CREATE OR REPLACE FUNCTION public.csb_cadastrar_rt(
  p_id uuid DEFAULT NULL,
  p_dados jsonb DEFAULT '{}'::jsonb,
  p_user_id text DEFAULT NULL,
  p_user_name text DEFAULT NULL,
  p_sistema_origem text DEFAULT 'CLASSIFICA_CSB'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_nome text := regexp_replace(trim(COALESCE(p_dados->>'nome', '')), '\s+', ' ', 'g');
  v_cpf text := NULLIF(regexp_replace(COALESCE(p_dados->>'cpf', ''), '\D', '', 'g'), '');
  v_reg text := NULLIF(upper(regexp_replace(trim(COALESCE(p_dados->>'registro_profissional', '')), '\s+', ' ', 'g')), '');
  v_email text := NULLIF(lower(trim(COALESCE(p_dados->>'email', ''))), '');
  v_tel text := NULLIF(trim(COALESCE(p_dados->>'telefone', '')), '');
  v_art text := NULLIF(trim(COALESCE(p_dados->>'art', '')), '');
  v_sistema text := COALESCE(NULLIF(trim(COALESCE(p_sistema_origem, '')), ''), 'CLASSIFICA_CSB');
  v_user_uuid uuid;
  v_existing public.rts%ROWTYPE;
  v_result public.rts%ROWTYPE;
BEGIN
  IF length(v_nome) < 2 THEN
    RAISE EXCEPTION 'Nome do Responsável Técnico é obrigatório.' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_user_uuid := NULLIF(trim(COALESCE(p_user_id, '')), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_user_uuid := NULL;
  END;

  IF p_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.rts WHERE id = p_id LIMIT 1;
  END IF;

  IF v_existing.id IS NULL AND v_reg IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.rts r
    WHERE upper(trim(COALESCE(r.registro_profissional, ''))) = v_reg
    LIMIT 1;
  END IF;

  IF v_existing.id IS NULL AND v_cpf IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.rts r
    WHERE regexp_replace(COALESCE(r.cpf, ''), '\D', '', 'g') = v_cpf
    LIMIT 1;
  END IF;

  IF v_existing.id IS NULL THEN
    SELECT * INTO v_existing
    FROM public.rts r
    WHERE lower(trim(COALESCE(r.nome, ''))) = lower(v_nome)
    LIMIT 1;
  END IF;

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.rts r
    SET
      cpf = COALESCE(NULLIF(r.cpf, ''), v_cpf),
      registro_profissional = COALESCE(NULLIF(r.registro_profissional, ''), v_reg),
      email = COALESCE(r.email, v_email),
      telefone = COALESCE(r.telefone, v_tel),
      art = COALESCE(NULLIF(r.art, ''), v_art),
      updated_at = now()
    WHERE r.id = v_existing.id
    RETURNING * INTO v_result;
  ELSE
    INSERT INTO public.rts (
      nome,
      cpf,
      registro_profissional,
      email,
      telefone,
      art,
      sistema_origem,
      created_by_user_id,
      created_by_name,
      created_at,
      updated_at
    ) VALUES (
      v_nome,
      v_cpf,
      v_reg,
      v_email,
      v_tel,
      v_art,
      v_sistema,
      v_user_uuid,
      NULLIF(trim(COALESCE(p_user_name, '')), ''),
      now(),
      now()
    )
    RETURNING * INTO v_result;
  END IF;

  RETURN to_jsonb(v_result);
END;
$$;

CREATE OR REPLACE FUNCTION public.csb_vincular_art_rt(
  p_rt_id uuid,
  p_art text,
  p_barragem_id uuid DEFAULT NULL,
  p_atividade text DEFAULT NULL,
  p_observacao text DEFAULT NULL,
  p_sistema_origem text DEFAULT 'CLASSIFICA_CSB',
  p_user_id text DEFAULT NULL,
  p_user_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_art text := NULLIF(trim(COALESCE(p_art, '')), '');
  v_ativ text := NULLIF(trim(COALESCE(p_atividade, '')), '');
  v_obs text := NULLIF(trim(COALESCE(p_observacao, '')), '');
  v_sistema text := COALESCE(NULLIF(trim(COALESCE(p_sistema_origem, '')), ''), 'CLASSIFICA_CSB');
  v_user_uuid uuid;
  v_existing public.responsaveis_tecnicos_barragens%ROWTYPE;
  v_result public.responsaveis_tecnicos_barragens%ROWTYPE;
BEGIN
  IF p_rt_id IS NULL OR v_art IS NULL THEN
    RAISE EXCEPTION 'RT e número da ART são obrigatórios.' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_user_uuid := NULLIF(trim(COALESCE(p_user_id, '')), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_user_uuid := NULL;
  END;

  SELECT * INTO v_existing
  FROM public.responsaveis_tecnicos_barragens v
  WHERE v.rt_id = p_rt_id
    AND upper(trim(COALESCE(v.art, ''))) = upper(v_art)
    AND (p_barragem_id IS NULL OR v.barragem_id IS NULL OR v.barragem_id = p_barragem_id)
  LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.responsaveis_tecnicos_barragens v
    SET
      barragem_id = COALESCE(v.barragem_id, p_barragem_id),
      atividade = COALESCE(v.atividade, v_ativ),
      observacao = COALESCE(v.observacao, v_obs),
      updated_at = now()
    WHERE v.id = v_existing.id
    RETURNING * INTO v_result;
  ELSE
    INSERT INTO public.responsaveis_tecnicos_barragens (
      rt_id,
      barragem_id,
      art,
      atividade,
      observacao,
      sistema_origem,
      created_by_user_id,
      created_by_name,
      created_at,
      updated_at
    ) VALUES (
      p_rt_id,
      p_barragem_id,
      v_art,
      v_ativ,
      v_obs,
      v_sistema,
      v_user_uuid,
      NULLIF(trim(COALESCE(p_user_name, '')), ''),
      now(),
      now()
    )
    RETURNING * INTO v_result;
  END IF;

  RETURN to_jsonb(v_result);
END;
$$;

REVOKE ALL ON FUNCTION public.csb_cadastrar_empreendedor(uuid, jsonb, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.csb_cadastrar_empreendedor(uuid, jsonb, text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.csb_cadastrar_barragem(uuid, jsonb, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.csb_cadastrar_barragem(uuid, jsonb, text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.csb_cadastrar_rt(uuid, jsonb, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.csb_cadastrar_rt(uuid, jsonb, text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.csb_vincular_art_rt(uuid, text, uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.csb_vincular_art_rt(uuid, text, uuid, text, text, text, text, text) TO authenticated, service_role;


-- ============================================================================
-- PARTE 2: 2.0 CLASSIFICA CSB (Executar no Supabase do Classifica CSB)
-- ============================================================================
-- Garante que todas as tabelas de documentos e sub-itens rastreiem o vínculo
-- efetivo com o Administra Barragens, permitindo salvar Rascunhos locais com
-- dados temporários e exigir cadastro no Administra ao Concluir.

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

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.parecer_responsaveis') IS NOT NULL THEN
    ALTER TABLE public.parecer_responsaveis ADD COLUMN IF NOT EXISTS rt_id uuid;
    ALTER TABLE public.parecer_responsaveis ADD COLUMN IF NOT EXISTS registered_in_administra boolean NOT NULL DEFAULT false;
    CREATE INDEX IF NOT EXISTS parecer_responsaveis_rt_id_idx ON public.parecer_responsaveis (rt_id);
  END IF;

  IF pg_catalog.to_regclass('public.parecer_barramentos') IS NOT NULL THEN
    ALTER TABLE public.parecer_barramentos ADD COLUMN IF NOT EXISTS barragem_id uuid;
    CREATE INDEX IF NOT EXISTS parecer_barramentos_barragem_id_idx ON public.parecer_barramentos (barragem_id);
  END IF;

  IF pg_catalog.to_regclass('public.transferencias_titularidade') IS NOT NULL THEN
    ALTER TABLE public.transferencias_titularidade ADD COLUMN IF NOT EXISTS responsavel_tecnico_id uuid;
    ALTER TABLE public.transferencias_titularidade ADD COLUMN IF NOT EXISTS responsavel_tecnico_registered boolean NOT NULL DEFAULT false;
    CREATE INDEX IF NOT EXISTS transferencias_rt_id_idx ON public.transferencias_titularidade (responsavel_tecnico_id);
  END IF;
END;
$$;
