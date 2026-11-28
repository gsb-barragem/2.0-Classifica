-- ============================================================================
-- 2.0 CLASSIFICA CSB - MIGRAÇÃO INCREMENTAL: OUTBOX S2S-V2 (/api/v2/operacoes)
-- ============================================================================
-- NÃO EXECUTADA AUTOMATICAMENTE.
-- Aplicar manualmente no SQL Editor do projeto Supabase do Classifica CSB quando
-- a integração S2S-V2 de operações cadastrais for ativada.
--
-- Motivação arquitetural:
--   A tabela legada `integracao_administra_outbox` não existe neste repositório
--   (e caso exista externamente para PARECER/OFICIO, não deve ser alterada nem
--   sobrecarregada com operações mestras S2S). Esta migration cria uma tabela
--   dedicada exclusivamente às operações mestras permitidas no contrato
--   `POST /api/v2/operacoes` (escopo `operacoes:write`), com idempotência
--   determinística, controle de tentativas e retenção estrita para `service_role`.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.administra_operacoes_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operacao text NOT NULL CHECK (
    operacao IN (
      'cadastrar_empreendedor',
      'cadastrar_barragem',
      'cadastrar_rt',
      'propor_alteracao_empreendedor',
      'propor_alteracao_barragem',
      'propor_alteracao_rt'
    )
  ),
  entidade_tipo text NOT NULL CHECK (
    entidade_tipo IN (
      'empreendedor',
      'barragem',
      'responsavel_tecnico'
    )
  ),
  entidade_id uuid NULL,
  idempotency_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  solicitante_user_id uuid NOT NULL,
  solicitante_nome text NOT NULL,
  solicitante_role text NOT NULL,
  origem_documento_tipo text NULL,
  origem_documento_id uuid NULL,
  estado text NOT NULL DEFAULT 'pendente' CHECK (
    estado IN (
      'pendente',
      'processando',
      'concluida',
      'aguardando_aprovacao',
      'conflito',
      'erro_temporario',
      'rejeitada'
    )
  ),
  tentativas integer NOT NULL DEFAULT 0 CHECK (tentativas >= 0),
  max_tentativas integer NOT NULL DEFAULT 5 CHECK (max_tentativas >= 1),
  proxima_tentativa_em timestamptz NULL,
  resposta_http_status integer NULL,
  resposta_codigo text NULL,
  resposta_payload jsonb NULL,
  ultimo_erro text NULL,
  entidade_id_retorno uuid NULL,
  solicitacao_id_retorno uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processado_em timestamptz NULL,
  CONSTRAINT administra_operacoes_outbox_entidade_id_chk CHECK (
    (
      operacao IN (
        'propor_alteracao_empreendedor',
        'propor_alteracao_barragem',
        'propor_alteracao_rt'
      )
      AND entidade_id IS NOT NULL
    )
    OR (
      operacao IN (
        'cadastrar_empreendedor',
        'cadastrar_barragem',
        'cadastrar_rt'
      )
      AND entidade_id IS NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS administra_operacoes_outbox_retry_idx
  ON public.administra_operacoes_outbox (estado, proxima_tentativa_em)
  WHERE estado IN ('pendente', 'erro_temporario');

CREATE INDEX IF NOT EXISTS administra_operacoes_outbox_solicitante_idx
  ON public.administra_operacoes_outbox (solicitante_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS administra_operacoes_outbox_entidade_idx
  ON public.administra_operacoes_outbox (entidade_tipo, entidade_id)
  WHERE entidade_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.administra_operacoes_outbox_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_administra_operacoes_outbox_updated_at
  ON public.administra_operacoes_outbox;

CREATE TRIGGER trg_administra_operacoes_outbox_updated_at
  BEFORE UPDATE ON public.administra_operacoes_outbox
  FOR EACH ROW
  EXECUTE FUNCTION public.administra_operacoes_outbox_set_updated_at();

ALTER TABLE public.administra_operacoes_outbox ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.administra_operacoes_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.administra_operacoes_outbox TO service_role;
