-- =====================================================================
-- App do Paciente — Fase 0
-- 002_verificacao.sql — prova que o isolamento de profiles funciona
--
-- Rode DEPOIS de 001_profiles_rls.sql, numa aba separada do SQL Editor.
--
-- POR QUE NÃO BASTA UM `select count(*) from profiles`
-- O SQL Editor roda como superusuário e ignora RLS por completo. Uma
-- contagem normal aqui devolveria as 148 linhas mesmo com as policies
-- perfeitas — ou seja, não prova nada.
--
-- Os testes abaixo trocam o papel para `authenticated` e forjam as
-- claims de JWT, que é como o Postgres enxerga um usuário real vindo do
-- app. Tudo dentro de begin/rollback: nada é alterado.
--
-- Se preferir, rode um teste de cada vez — cada bloco é independente.
-- =====================================================================


-- ---------------------------------------------------------------------
-- TESTE 1 — um nutricionista comum
--
-- Simula Socorro Coelho (socorrinha.coelho@gmail.com), que não é admin.
--
-- RESULTADO ESPERADO:
--   linhas_visiveis = 1
--   e_a_propria_linha = true
--
-- Se vier 148, alguma policy antiga sobreviveu.
-- ---------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims =
    '{"sub":"dcd52002-fa60-4022-ba16-eafa9b321f72","role":"authenticated"}';

  select
    count(*)                                                        as linhas_visiveis,
    bool_and(id = 'dcd52002-fa60-4022-ba16-eafa9b321f72'::uuid)     as e_a_propria_linha
  from public.profiles;
rollback;


-- ---------------------------------------------------------------------
-- TESTE 2 — você, como admin da plataforma
--
-- RESULTADO ESPERADO:
--   linhas_visiveis = 148 (ou o total de nutricionistas na data)
--
-- Se vier 1, o insert em platform_admins não pegou. Confira com:
--   select * from public.platform_admins;
-- ---------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims =
    '{"sub":"281b6d15-1b04-432e-a162-d06988887bcc","role":"authenticated"}';

  select count(*) as linhas_visiveis
  from public.profiles;
rollback;


-- ---------------------------------------------------------------------
-- TESTE 3 — a allowlist não é legível pelo app
--
-- platform_admins tem RLS ligada e nenhuma policy, então nem você
-- enxerga por aqui. É o comportamento desejado: ninguém descobre nem
-- altera quem é admin de dentro do produto.
--
-- RESULTADO ESPERADO: 0
-- ---------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims =
    '{"sub":"281b6d15-1b04-432e-a162-d06988887bcc","role":"authenticated"}';

  select count(*) as deve_ser_zero
  from public.platform_admins;
rollback;


-- ---------------------------------------------------------------------
-- TESTE 4 — um nutricionista não consegue editar o perfil de outro
--
-- RESULTADO ESPERADO: 0 linhas atualizadas.
-- O rollback desfaz qualquer coisa, então é seguro rodar.
-- ---------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims =
    '{"sub":"dcd52002-fa60-4022-ba16-eafa9b321f72","role":"authenticated"}';

  with tentativa as (
    update public.profiles
       set nome_completo = 'INVASAO'
     where id = '281b6d15-1b04-432e-a162-d06988887bcc'
    returning 1
  )
  select count(*) as deve_ser_zero from tentativa;
rollback;
