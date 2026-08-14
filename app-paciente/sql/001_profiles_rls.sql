-- =====================================================================
-- App do Paciente — Fase 0
-- 001_profiles_rls.sql — isolamento de profiles entre contas
--
-- PROBLEMA QUE ISTO RESOLVE
-- Hoje qualquer usuário autenticado lê a tabela profiles inteira: nome,
-- e-mail e telefone de TODOS os nutricionistas da plataforma — 148
-- linhas na última contagem. Isso já é um vazamento entre contas, e
-- vira um problema muito maior quando pacientes passarem a ser usuários
-- autenticados: cada paciente leria a base de clientes inteira.
--
-- Para comparação: patients está correta e só devolve linhas do dono.
-- O problema é específico de profiles.
--
-- COMO RODAR
-- Cole este arquivo inteiro no SQL Editor do Supabase e execute.
-- Não há nada para editar: os UUIDs já estão preenchidos com os valores
-- reais do seu banco.
--
-- É idempotente: pode rodar de novo sem quebrar nada.
--
-- Depois de rodar, execute 002_verificacao.sql separadamente.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Allowlist de administradores da plataforma
--
-- Se alguma tela sua lista os assinantes, ela precisa continuar lendo
-- profiles de outras contas. Esta tabela é quem autoriza isso.
--
-- Ela fica com RLS ligada e ZERO policies, de propósito: nessa
-- combinação ninguém lê nem escreve pela API do app. Só o SQL Editor e
-- as Edge Functions (service_role) enxergam. Assim ninguém consegue se
-- promover a admin de dentro do produto.
-- ---------------------------------------------------------------------
create table if not exists public.platform_admins (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

comment on table public.platform_admins is
  'Quem pode ler profiles de outras contas. Editável apenas via SQL Editor ou service_role.';


create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins a
    where a.user_id = auth.uid()
  );
$$;


-- ---------------------------------------------------------------------
-- 1.1 Emerson Lima Silva (CRN 01 19620) entra como admin.
--
-- Este é o id da linha dele em profiles. Como profiles.id É o id do
-- usuário no Auth, ele serve direto — sem precisar procurar e-mail de
-- login, que pode ser diferente do e-mail cadastrado no perfil.
--
-- A foreign key para auth.users protege contra engano: se o id não
-- existir no Auth, o insert falha em vez de passar batido.
-- ---------------------------------------------------------------------
insert into public.platform_admins (user_id)
values ('281b6d15-1b04-432e-a162-d06988887bcc')
on conflict (user_id) do nothing;


-- ---------------------------------------------------------------------
-- 2. Trancar profiles
--
-- profiles.id é o id do usuário no Auth (confirmado no banco), então a
-- comparação correta é id = auth.uid(). Não existe coluna user_id aqui.
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;

-- Remove as policies de SELECT existentes, quaisquer que sejam os nomes,
-- e registra no log o que foi removido. Mexe só em SELECT: policies de
-- INSERT e UPDATE são recriadas logo abaixo de forma idempotente.
do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename  = 'profiles'
      and cmd        = 'SELECT'
  loop
    raise notice 'Removendo policy de SELECT: %', p.policyname;
    execute format('drop policy %I on public.profiles', p.policyname);
  end loop;
end;
$$;

-- Cada nutricionista lê a própria linha. Admin da plataforma lê todas.
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid() or public.is_platform_admin());

-- Edição do próprio perfil continua funcionando.
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Criação do próprio perfil, caso o app crie a linha no primeiro login.
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles
  for insert
  to authenticated
  with check (id = auth.uid());


-- ---------------------------------------------------------------------
-- 3. Estado final — confira o resultado desta consulta
--
-- Devem aparecer exatamente três policies:
--   profiles_select_own  · SELECT
--   profiles_update_own  · UPDATE
--   profiles_insert_own  · INSERT
--
-- Se sobrou alguma outra policy de SELECT, me mande o resultado.
-- ---------------------------------------------------------------------
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'profiles'
order by cmd, policyname;


-- ---------------------------------------------------------------------
-- 4. Rollback
--
-- Se alguma tela do app quebrar e você precisar voltar ao estado
-- anterior enquanto investiga:
--
--   drop policy if exists profiles_select_own on public.profiles;
--   create policy profiles_select_tudo
--     on public.profiles for select to authenticated using (true);
--
-- Isso reabre o vazamento — é medida temporária para destravar, não
-- solução. O certo é descobrir qual tela precisava de leitura cruzada e
-- resolver com uma view de colunas públicas (nome e CRN, sem contato).
-- ---------------------------------------------------------------------
