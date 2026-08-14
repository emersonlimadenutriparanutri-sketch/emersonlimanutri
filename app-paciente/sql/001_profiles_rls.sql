-- =====================================================================
-- App do Paciente — Fase 0
-- 001_profiles_rls.sql — isolamento de profiles entre contas
--
-- PROBLEMA QUE ISTO RESOLVE
-- Hoje qualquer usuário autenticado consegue ler a tabela profiles
-- inteira: nome, e-mail e telefone de TODOS os nutricionistas da
-- plataforma. Isso já é um vazamento entre contas, e vira um problema
-- muito maior quando pacientes passarem a ser usuários autenticados —
-- cada paciente leria a base de clientes inteira.
--
-- Para comparação: patients está correta e só devolve linhas do dono.
-- O problema é específico de profiles.
--
-- Rode este arquivo INTEIRO no SQL Editor do Supabase.
-- É idempotente: pode rodar de novo sem quebrar nada.
--
-- LEIA A SEÇÃO 0 ANTES DE RODAR.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. Antes de rodar: o que pode quebrar
--
-- Depois desta migration, um nutricionista logado enxerga APENAS a
-- própria linha de profiles. Se alguma tela do app hoje depende de ler
-- profiles de outras contas, ela para de funcionar.
--
-- O caso mais provável é uma tela de administração da plataforma, onde
-- você lista os assinantes. Por isso a seção 1 cria uma allowlist de
-- administradores — preencha-a antes de aplicar a seção 2, ou você
-- perde acesso à sua própria lista de assinantes.
--
-- Rode esta consulta primeiro para ver o estado atual das policies:
--
--   select policyname, cmd, qual
--   from pg_policies
--   where schemaname = 'public' and tablename = 'profiles';
--
-- Guarde o resultado. É o seu ponto de retorno se algo der errado.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- 1. Allowlist de administradores da plataforma
--
-- Tabela sem nenhuma policy de propósito: com RLS ligada e zero
-- policies, ninguém lê nem escreve pela API. Só service_role (Edge
-- Functions) e o SQL Editor enxergam. Assim, ninguém consegue se
-- promover a admin pelo app.
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
-- 1.1 Cadastre-se como admin ANTES de aplicar a seção 2.
--
-- Troque o e-mail abaixo pelo e-mail com que VOCÊ entra no app.
-- Se não souber qual é, rode antes:
--
--   select id, email from auth.users order by created_at limit 50;
--
-- Se o insert devolver 0 linhas, o e-mail está errado — corrija antes
-- de seguir, senão você perde o acesso à lista de assinantes.
-- ---------------------------------------------------------------------
insert into public.platform_admins (user_id)
select u.id
from auth.users u
where u.email = 'TROQUE-PELO-SEU-EMAIL-DE-LOGIN@exemplo.com'
on conflict (user_id) do nothing;

-- Confirmação: deve listar você.
select a.user_id, u.email
from public.platform_admins a
join auth.users u on u.id = a.user_id;


-- ---------------------------------------------------------------------
-- 2. Trancar profiles
--
-- profiles.id É o id do usuário no Auth (confirmado no banco), então a
-- comparação correta é id = auth.uid() — não existe coluna user_id aqui.
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;

-- Remove as policies de SELECT existentes, quaisquer que sejam os nomes.
-- Mexe só em SELECT: policies de INSERT/UPDATE ficam como estão e são
-- recriadas logo abaixo de forma idempotente.
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

-- Criação do próprio perfil (caso o app crie a linha no primeiro login).
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles
  for insert
  to authenticated
  with check (id = auth.uid());


-- ---------------------------------------------------------------------
-- 3. Verificação
--
-- ATENÇÃO: um `select count(*) from profiles` rodado aqui no SQL Editor
-- NÃO prova nada — o editor roda como superusuário e ignora RLS por
-- completo. O teste abaixo simula um usuário autenticado de verdade.
--
-- Troque o UUID por um nutricionista que NÃO seja você (pegue um em
-- `select id, email from auth.users limit 10`).
-- ---------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"TROQUE-POR-UM-UUID-DE-OUTRO-NUTRI","role":"authenticated"}';

  -- Deve retornar exatamente 1 (só a linha dele).
  select count(*) as linhas_visiveis_para_um_nutri_comum
  from public.profiles;
rollback;

-- E o seu acesso de admin, que deve continuar vendo todas:
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"TROQUE-PELO-SEU-UUID","role":"authenticated"}';

  select count(*) as linhas_visiveis_para_o_admin
  from public.profiles;
rollback;


-- ---------------------------------------------------------------------
-- 4. Rollback
--
-- Se alguma tela do app quebrar e você precisar voltar ao estado
-- anterior enquanto investiga, rode:
--
--   drop policy if exists profiles_select_own on public.profiles;
--   create policy profiles_select_tudo
--     on public.profiles for select to authenticated using (true);
--
-- Isso reabre o vazamento — é medida temporária, não solução. O certo
-- é descobrir qual tela precisava de leitura cruzada e resolver com uma
-- view de colunas públicas (nome e CRN, sem contato).
-- ---------------------------------------------------------------------
