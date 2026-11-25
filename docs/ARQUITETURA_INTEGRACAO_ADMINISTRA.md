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
- **Camada cliente (`src/services/administraService.ts`):** os antigos fallbacks diretos para RPCs de escrita no navegador (`administra_upsert_empreendedor`, `administra_upsert_barragem`, `administra_upsert_rt`) foram removidos; tentativas de gravação mestra retornam bloqueio sem indicar sucesso.
- **Rotas S2S:** não há rota S2S habilitada; permanece bloqueada.

## 3. Política Futura de Proposta de Entidades e Migração Híbrida
Entidades ausentes no Administra poderão futuramente ser propostas via integração seguindo política **híbrida**:
- **Criação automática:** somente quando a proposta passar integralmente por validações estruturais/obrigatórias e por verificação determinística de não duplicidade.
- **Revisão humana:** casos ambíguos, potenciais duplicidades não determinísticas ou registros inválidos/incompletos permanecem bloqueados para análise humana antes de efetivação no Administra.

> **Estado atual:** a leitura canônica está operacional; a rota `/api/administra-escrita` para gravação de cadastros mestres existe no servidor apenas para retornar bloqueio explícito (`HTTP 409`) sem executar chamadas remotas de escrita, aguardando a futura API de escrita aprovada com validação híbrida.
