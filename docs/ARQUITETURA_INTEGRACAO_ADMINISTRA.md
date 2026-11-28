# Arquitetura de Integração — Classifica 2.0 e Administra Barragens

## 1. Fonte Oficial e Única (Administra Barragens)
O **Administra Barragens** (`ADMINISTRA_BARRAGENS`) é a fonte oficial e única para as entidades mestras do ecossistema:
- `empreendedor`
- `empreendimento`
- `barragem`
- `responsavel_tecnico`

O **Classifica 2.0** (`CLASSIFICA_CSB`) não deve criar nem manter cadastros mestres paralelos dessas entidades.

## 2. Domínio Próprio e Separação de Leitura Canônica vs. Escrita Bloqueada
O Classifica 2.0 mantém exclusivamente seus fluxos de trabalho e processos internos:
- Pareceres técnicos de classificação
- Ofícios de pendência, não obrigatoriedades, indeferimentos e transferências de titularidade
- Documentos requeridos, análises técnicas, status de tramitação, pendências e solicitações de vistoria

Quando qualquer fluxo do Classifica precisar vincular uma entidade mestra, deve referenciá-la pelo identificador oficial do Administra (`empreendedorId`, `empreendimentoId`, `barragemId`, `rtId`), conforme tipado em `types.ts` e declarado em `src/config/integrationArchitecture.ts`.

### Estado Real dos Endpoints neste Repositório
- **Leitura canônica ativa (`POST /api/administra-leitura`):** consulta autenticada e somente leitura no Administra (`diagnostico`, `empreendedores`, `barragens`, `rts`, `vinculos_rt_barragem`).
- **Leitura auxiliar de ARTs (`POST /api/administra-escrita`, ação `listar_arts_rt`):** mantida funcional e autenticada exclusivamente em modo somente leitura para consulta das ARTs vinculadas a um RT.
- **Escrita de cadastros mestres bloqueada (`POST /api/administra-escrita`):** as ações de gravação (`salvar_empreendedor`, `salvar_barragem`, `salvar_rt`, `salvar_art_rt`) estão bloqueadas **antes de qualquer chamada remota**, retornando **HTTP 409 (`ADMINISTRA_MASTER_WRITE_BLOCKED`)** e `ok: false`.
- **Camada cliente (`src/services/administraService.ts`):** os antigos fallbacks diretos para RPCs de escrita no navegador (`administra_upsert_empreendedor`, `administra_upsert_barragem`, `administra_upsert_rt`) foram removidos; `syncClassificaProductToAdministra` permanece intocada e não redirecionada para `registrar_documento`. Para operações S2S permitidas, o cliente chama exclusivamente `POST /api/administra-escrita` com token de sessão do Classifica.
- **Integração Server-to-Server `S2S-V2` (`POST /api/v2/operacoes`, escopo `operacoes:write`):**
  - Implementada em `server/administraS2sOperacoes.ts` e `server/administraOutbox.ts`, exposta via ações `operacao_s2s`, `outbox_reprocessar` e `outbox_listar` em `POST /api/administra-escrita`.
  - **Operações permitidas:** `cadastrar_empreendedor`, `cadastrar_barragem`, `cadastrar_rt`, `propor_alteracao_empreendedor`, `propor_alteracao_barragem` e `propor_alteracao_rt` (alterações em cadastros existentes nunca são aplicadas diretamente; seguem como proposta para aprovação).
  - **Operações bloqueadas (não enviadas nesta etapa):** `registrar_documento`, `transferencia_titularidade`, `desativar` e `reverter`.
  - **Assinatura Ed25519 (`S2S-V2`):** string canônica de 10 linhas (`S2S-V2`, `POST`, `/api/v2/operacoes`, query vazia, `application/json`, SHA-256 hex do corpo UTF-8, `kid`, `timestamp`, `jti` UUID v4, `<consumer_user_id>|`) assinada no servidor com `CLASSIFICA_S2S_PRIVATE_KEY` (`x-s2s-scope: operacoes:write` e `x-consumer-user-id` extraído exclusivamente da sessão verificada).

## 3. Outbox Persistente e Lacuna com `integracao_administra_outbox`
- A tabela `integracao_administra_outbox` **não existe neste repositório** (e não foi presumida compatível com operações mestras S2S, podendo existir apenas externamente para `PARECER`/`OFICIO`).
- Foi preparada a migration incremental separada **`sql/04_administra_s2s_operacoes_outbox.sql`** (não executada automaticamente) criando `public.administra_operacoes_outbox`, restrita a `service_role` via RLS, com `idempotency_key` determinística (`UNIQUE`), controle de `tentativas`, `proxima_tentativa_em`, `estado` (`pendente`, `processando`, `concluida`, `aguardando_aprovacao`, `conflito`, `erro_temporario`, `rejeitada`) e respostas HTTP (`200`, `202`, `409`, `503`).

## 4. Variáveis de Ambiente Server-Side e Formato das Chaves Ed25519
- `ADMINISTRA_API_URL` (ou fallback `ADMINISTRA_API_BASE_URL`): URL-base HTTPS do Administra (sem caminho/query/credenciais).
- `CLASSIFICA_S2S_KID`: identificador (`kid`) da chave pública cadastrada no Administra.
- `CLASSIFICA_S2S_PRIVATE_KEY`: chave privada Ed25519 em formato **PEM PKCS#8** (`-----BEGIN PRIVATE KEY-----...-----END PRIVATE KEY-----`, aceitando `\n` escapados). Nunca gerar, registrar ou expor no navegador/logs/repositório.
- Chave pública esperada pelo Administra: formato **PEM SPKI** (`-----BEGIN PUBLIC KEY-----...-----END PUBLIC KEY-----`).
- `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`: acesso exclusivo server-side à tabela `public.administra_operacoes_outbox`.
