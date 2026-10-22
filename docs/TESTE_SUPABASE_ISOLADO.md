# Guia de cópia e teste Supabase — Classifica 2.0

## Não conectar ao projeto em uso
O ambiente de teste deve ser um projeto Supabase separado. Não aplique as migrações deste pacote no projeto usado pelo Classifica atual. O projeto de teste pode conter dados pessoais reais após restauração; mantenha-o restrito, sem URL pública de produção e seguindo as regras institucionais e de proteção de dados.

## Cópia controlada
1. Faça um backup pelo procedimento oficial do Supabase e confirme que ele é restaurável antes de qualquer mudança.
2. Restaure o backup no projeto Supabase vazio de teste por procedimento documentado, preservando schema e registros. Auth, Storage, configurações de Auth, extensões, secrets, funções externas, triggers, grants e políticas podem requerer configuração/cópia à parte.
3. Antes e depois da restauração, compare contagem por tabela, integridade referencial e amostras de identificadores (sem exportar dados pessoais). Não altere a origem.
4. Restrinja a URL, chaves e usuários do projeto de teste a pessoas autorizadas; nunca coloque `service_role` em `.env` iniciado por `VITE_`, no cliente, no repositório ou em mensagens.
5. Faça outro backup do projeto de teste antes de qualquer SQL. Inspecione o SQL e confirme nomes/constraints/colunas no schema restaurado.

## Variáveis e publicação
- Configure somente `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` da instância de teste.
- Confirme o destino no painel do Supabase antes de aplicar qualquer SQL.
- O frontend expõe a chave `anon` e URL por desenho; elas não são segredos. A proteção depende de RLS, grants e funções seguras no servidor do banco.
- Não habilite cadastro irrestrito/publicação externa como solução temporária. Ajuste confirmação e restrições de Auth para homologação controlada.

## Sequência de ensaio
1. Verifique o build e o app local apontado para o Supabase de teste.
2. Aplique primeiro apenas alterações de schema não destrutivas, numa cópia substituível; registre saída SQL e estado anterior.
3. Provisione uma conta administradora de teste manualmente em Auth e vincule o UUID ao perfil; use senha temporária exclusivamente no Auth.
4. Crie contas de teste Analista, Visualizador, pendente e inativa. Confira na API/banco que só o aprovado e ativo lê dados; apenas Admin administra usuários; somente Admin/Analista escrevem documentos; exclusão é restrita ao papel definido pela política institucional.
5. Teste solicitação, confirmação de e-mail, fila, edição, aprovação, recusa, troca de senha inicial, logout, reentrada e expiração de sessão.
6. Verifique com chamadas diretas como `anon` e authenticated que `users.password_hash`, solicitações e documentos pessoais não são retornados a quem não tem autorização; ocultar elementos da interface não basta.
7. Compare contagem e identificadores dos documentos antes/depois de todos os testes. Não execute DELETE, DROP, limpeza ou migrações em produção.
8. Mantenha o Classifica atual apontado para seu projeto original durante toda a homologação. Só planeje eventual transição após aprovação e plano de retorno testado.

## Limitação do pacote atual
A migração `migration_acesso_auth.sql` é uma proposta inicial, não um script certificado: não foi executada contra um projeto de teste nem validada com o esquema real da instância. Ela altera RLS e privilégios em tabelas conhecidas, e pode não cobrir toda a superfície do banco. Não aplicar até completar inventário, revisão SQL, restauração comprovada e testes por papel.
