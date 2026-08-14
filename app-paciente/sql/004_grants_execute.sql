-- =====================================================================
-- App do Paciente — Fase 0
-- 004_grants_execute.sql — corrige o revoke que não teve efeito
--
-- POR QUE A 003 NÃO FUNCIONOU
-- A 003 fazia `revoke execute ... from anon`, e o linter continuou
-- mostrando anon com permissão. O motivo: função criada no schema
-- public nasce com EXECUTE concedido a PUBLIC, e PUBLIC inclui anon.
-- Revogar de anon não remove o grant herdado de PUBLIC.
--
-- O correto é revogar de PUBLIC e conceder de volta só a authenticated.
--
-- Aplicada. Registrada aqui para o histórico.
-- =====================================================================

-- authenticated precisa continuar podendo executar: a policy de
-- profiles chama is_platform_admin em nome do usuário logado.
revoke execute on function public.is_platform_admin() from public;
revoke execute on function public.is_platform_admin() from anon;
grant  execute on function public.is_platform_admin() to authenticated;

-- has_role era executável por anon, o que deixava qualquer visitante
-- perguntar "fulano é admin?". Não vaza linha, mas é gratuito.
revoke execute on function public.has_role(uuid, app_role) from public;
revoke execute on function public.has_role(uuid, app_role) from anon;
grant  execute on function public.has_role(uuid, app_role) to authenticated;


-- Verificação: anon_pode deve ser false nas duas.
select
  p.proname,
  has_function_privilege('anon', p.oid, 'EXECUTE')          as anon_pode,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_pode
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('is_platform_admin', 'has_role');
