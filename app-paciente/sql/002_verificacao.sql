-- =====================================================================
-- App do Paciente — Fase 0
-- 002_verificacao.sql — prova que o isolamento de profiles funciona
--
-- Rode DEPOIS da 005. (Uma versão anterior deste arquivo testava a
-- platform_admins, que foi aposentada na 005 em favor de user_roles.)
--
-- POR QUE NÃO BASTA UM `select count(*) from profiles`
-- O SQL Editor — e o executor de migration da Lovable — rodam como
-- superusuário e ignoram RLS por completo. Uma contagem normal
-- devolveria as 148 linhas mesmo com as policies erradas: passaria no
-- teste sem provar nada.
--
-- Os blocos abaixo trocam o papel para `authenticated` e forjam as
-- claims de JWT, que é como o Postgres enxerga um usuário real vindo do
-- app. Tudo dentro de begin/rollback: nada é alterado.
--
-- Cada bloco é independente — se o executor recusar, dá para rodar um
-- de cada vez.
-- =====================================================================


-- ---------------------------------------------------------------------
-- TESTE 1 — um nutricionista comum vê só a própria linha
--
-- Simula Socorro Coelho (socorrinha.coelho@gmail.com).
--
-- A coluna `este_usuario_e_admin` existe para o resultado ser
-- interpretável: se ela vier true, esta pessoa é admin e enxergar tudo
-- é o comportamento correto — nesse caso troque o uuid por outro
-- nutricionista e rode de novo.
--
-- ESPERADO com e_admin = false:
--   linhas_visiveis   = 1
--   e_a_propria_linha = true
-- ---------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims =
    '{"sub":"dcd52002-fa60-4022-ba16-eafa9b321f72","role":"authenticated"}';

  select
    public.has_role(auth.uid(), 'admin'::app_role)              as este_usuario_e_admin,
    count(*)                                                    as linhas_visiveis,
    bool_and(id = 'dcd52002-fa60-4022-ba16-eafa9b321f72'::uuid) as e_a_propria_linha
  from public.profiles;
rollback;


-- ---------------------------------------------------------------------
-- TESTE 2 — um nutricionista não edita o perfil de outro
--
-- ESPERADO: 0 linhas atualizadas.
-- O rollback desfaz qualquer coisa, então é seguro rodar.
-- ---------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims =
    '{"sub":"dcd52002-fa60-4022-ba16-eafa9b321f72","role":"authenticated"}';

  with tentativa as (
    update public.profiles
       set nome_completo = 'TESTE'
     where id = '281b6d15-1b04-432e-a162-d06988887bcc'
    returning 1
  )
  select count(*) as deve_ser_zero from tentativa;
rollback;


-- ---------------------------------------------------------------------
-- TESTE 3 — o admin continua enxergando todos
--
-- ESPERADO:
--   este_usuario_e_admin = true
--   linhas_visiveis      = 148 (ou o total de nutricionistas na data)
--
-- Se vier 1, o caminho de admin quebrou na troca para has_role.
-- ---------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims =
    '{"sub":"281b6d15-1b04-432e-a162-d06988887bcc","role":"authenticated"}';

  select
    public.has_role(auth.uid(), 'admin'::app_role) as este_usuario_e_admin,
    count(*)                                       as linhas_visiveis
  from public.profiles;
rollback;
