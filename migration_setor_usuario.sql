-- Classifica 2.0: adição compatível, sem apagar/alterar dados existentes.
-- Revise o schema e aplique somente após backup validado do Supabase.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS setor text;

COMMENT ON COLUMN public.users.setor IS
  'Setor institucional do usuário no Classifica 2.0';
