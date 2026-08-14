-- =====================================================================
-- App do Paciente — Fase 0
-- 005_admin_via_user_roles.sql — aposenta platform_admins
--
-- POR QUE
-- Quando a 001 foi escrita, não se sabia que o projeto já tinha um
-- sistema de papéis. Ele tem:
--
--   public.user_roles          (user_id, role)
--   type app_role              enum: 'admin' | 'user'
--   public.has_role(uuid, app_role)
--
-- E a própria tela de Admin do app já usa esse caminho, via RPC:
--   supabase.rpc("has_role", { _user_id: user.id, _role: "admin" })
--
-- Ou seja, platform_admins virou uma segunda lista respondendo à mesma
-- pergunta. Duas fontes de verdade para "quem é admin" funcionam bem
-- até divergirem — alguém é removido de uma e continua na outra, e a
-- descoberta acontece no pior momento possível.
--
-- Esta migration passa a policy de profiles a usar has_role e remove a
-- estrutura duplicada.
--
-- Rode depois da 004. É idempotente.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. Trava de segurança
--
-- Se o dono da plataforma não estiver em user_roles como admin, esta
-- migration tiraria o acesso dele à lista de assinantes. Melhor falhar
-- alto agora do que descobrir depois.
--
-- A tela Admin do app já funciona hoje e ela usa has_role, então isto
-- deve passar. A trava existe para o caso de não passar.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from public.user_roles
    where user_id = '281b6d15-1b04-432e-a162-d06988887bcc'
      and role    = 'admin'::app_role
  ) then
    raise exception
      'ABORTADO: o usuário 281b6d15… não está em user_roles como admin. '
      'Aplicar isto agora removeria o acesso dele a profiles. '
      'Cadastre-o em user_roles antes de rodar esta migration.';
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 1. A policy passa a consultar o sistema de papéis do projeto
--
-- Trocar a policy antes de remover a função: a policy depende dela.
-- Tudo dentro da mesma transação, então não existe instante em que
-- profiles fica sem policy de SELECT.
-- ---------------------------------------------------------------------
drop policy if exists profiles_select_own on public.profiles;

create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (
    id = auth.uid()
    or public.has_role(auth.uid(), 'admin'::app_role)
  );


-- ---------------------------------------------------------------------
-- 2. Remover a estrutura duplicada
-- ---------------------------------------------------------------------
drop function if exists public.is_platform_admin();
drop table    if exists public.platform_admins;


-- ---------------------------------------------------------------------
-- 3. Estado final
--
-- Devem restar as três policies, com a de SELECT agora usando has_role.
-- ---------------------------------------------------------------------
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'profiles'
order by cmd, policyname;
