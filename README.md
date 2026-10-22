# Classifica 2.0 — base com autenticação Supabase

Projeto baseado no Classifica enviado, preservando a identidade visual. Os módulos de formulários permanecem disponíveis apenas como telas vazias, para reestruturação posterior.

## Ambiente de teste isolado (obrigatório)
Crie um **projeto Supabase separado** para homologação. Não conecte este Classifica 2.0 nem aplique migrações no projeto atual usado pelos usuários. Antes de copiar dados, faça backup restaurável, consulte as regras institucionais de proteção de dados e siga o roteiro `docs/TESTE_SUPABASE_ISOLADO.md`; a cópia pode conter dados pessoais e precisa de acesso restrito.

Aponte somente o ambiente local para a instância de teste, usando `.env` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` dela; nunca configure `service_role` no frontend. Use Node.js 22, execute `npm ci` e `npm run dev`; `npm run build` gera a versão para publicação.

Antes de rodar SQL, faça cópia recuperável do projeto de teste e confira schema, triggers, extensões, grants, RLS, usuários Auth, Storage e tabelas reais. A migração incluída é **proposta não certificada**. Não use em produção sem revisão SQL, ensaio por papel, validação das exposições do banco e aprovação institucional.

O app não cria o cliente Supabase até o primeiro acesso e mostra erro claro quando faltam as variáveis. A URL e a chave `anon` ficam públicas no navegador; a segurança dos dados depende das políticas e privilégios do banco.

## Executar localmente
1. Copie `.env.example` para `.env` e preencha apenas com credenciais públicas do projeto isolado.
2. Execute `npm ci` e `npm run dev`.
3. `npm run build` gera a versão para publicação.
4. Nunca aponte o projeto local para produção durante testes ou restauração.

## Configuração necessária antes de liberar acesso
1. Faça backup restaurável e confira o schema e as políticas atuais do Supabase.
2. Revise e aplique manualmente `migration_setor_usuario.sql` e `migration_acesso_auth.sql` **somente depois de ensaiar numa cópia descartável do projeto de teste**. O segundo SQL altera RLS, privilégios e gatilhos conhecidos e pode bloquear o app legado quando aplicado em qualquer banco usado por ele. O código não executa SQL automaticamente.
3. No Supabase Auth, habilite cadastro por e-mail e defina a configuração de confirmação de e-mail. O trigger da migração cria uma solicitação pendente e mantém a fila invisível para o solicitante.
4. Cadastre a conta administrativa inicial pelo painel do Supabase Auth. Depois vincule o UUID Auth na linha da tabela `users`, preenchendo e-mail, matrícula, nome e setor, `role='Administrador'`, `active=true` e `force_password_change=true`. Defina a senha temporária diretamente no Auth; nenhuma senha está embutida no código.
5. Teste solicitação, confirmação de e-mail conforme a configuração, aprovação/recusa, edição e recuperação de sessão com contas de teste.

## Solicitações e perfis
A tela de entrada usa Supabase Auth. O solicitante informa nome, e-mail, matrícula, setor e cria a própria senha; o perfil só é liberado depois de decisão de administrador. A fila é lida e analisada por administradores, e novos aprovados recebem inicialmente o papel Analista. Administradores podem editar os perfis ativos/inativos; autenticação e alteração de senha não consultam nem escrevem `password_hash`.

## Limites e segurança
A página Informações carrega somente nome, papel e setor pela função `classifica_public_team`, com autenticação. A migração retira privilégios diretos de consulta à tabela de solicitações e propõe restringir tabelas conhecidas de documentos a perfis aprovados/ativos; ainda assim, é necessário inventariar toda tabela, view, função, bucket, política, privilégio `PUBLIC` e tabela não listada no banco restaurado. Revise também nomes reais de colunas, constraints, gatilhos e políticas legadas, pois o SQL presume uma estrutura específica e **não foi executado nem validado contra o Supabase real**. Não há garantia de segurança absoluta; build, observação local, revisão SQL, pentest e avaliação institucional são etapas diferentes.

A migração usa `DROP POLICY` apenas para refazer políticas nomeadas `classifica_*` desta proposta, altera RLS/permissões das tabelas de negócio listadas e substitui o gatilho nomeado `classifica_auth_access_request`; apesar de não apagar pareceres, essas ações podem mudar o acesso do sistema conectado ao banco onde forem aplicadas. Por isso, aplique primeiro somente em cópia de teste e **não no projeto atual**.

## Usuário inicial provisório
A conta temporária **não é criada por SQL do projeto nem fica hardcoded**. Provisioná-la manualmente no Supabase Auth e vincular o UUID na tabela `users`, conforme descrito acima. A senha inicial não deve ser registrada em código, banco legado, log ou documentação.
