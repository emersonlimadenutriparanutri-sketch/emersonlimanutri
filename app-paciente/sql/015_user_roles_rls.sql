-- =====================================================================
-- App do Paciente — Fase 1
-- 015_user_roles_rls.sql — fecha a leitura da tabela de papéis
--
-- O QUE FOI ENCONTRADO
-- A policy de SELECT em user_roles é:
--
--   "Authenticated users can view roles"   SELECT   using (true)
--
-- Ou seja, qualquer usuário autenticado lê a tabela inteira. Foi
-- descoberto por acaso: um nutricionista comum, testando o isolamento
-- de profiles, enxergou 2 linhas de user_roles — que é o total da
-- tabela, não o que é dele.
--
-- É anterior ao app do paciente. Hoje expõe quem é admin da plataforma
-- aos 148 nutricionistas; com pacientes autenticados, a todos eles.
--
-- Não dá acesso a nada por si só — saber que alguém é admin não é
-- credencial. Mas é mapa de alvo para phishing, e paciente não tem
-- motivo para ver isso.
--
-- SOBRE RECURSÃO
-- A policy nova chama has_role, que consulta user_roles — a própria
-- tabela que a policy protege. Isso não gera recursão porque has_role é
-- SECURITY DEFINER e portanto não passa pela RLS. Se ela fosse
-- SECURITY INVOKER, este arquivo travaria o banco.
--
-- Rode depois da 014. É idempotente.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Cada um vê os próprios papéis; admin vê todos
--
-- Admin continua vendo tudo porque uma tela de administração que liste
-- usuários e papéis precisa disso. O gate da tela em si usa a RPC
-- has_role e não depende desta policy.
-- ---------------------------------------------------------------------
do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename  = 'user_roles'
      and cmd        = 'SELECT'
  loop
    raise notice 'Removendo policy de SELECT em user_roles: %', p.policyname;
    execute format('drop policy %I on public.user_roles', p.policyname);
  end loop;
end;
$$;

create policy user_roles_select_own
  on public.user_roles
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.has_role(auth.uid(), 'admin'::app_role)
  );


-- ---------------------------------------------------------------------
-- 2. Verificação
--
-- Esperado: uma policy de SELECT (user_roles_select_own), mais as de
-- INSERT e DELETE que já existiam e não foram tocadas.
-- ---------------------------------------------------------------------
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'user_roles'
order by cmd, policyname;
