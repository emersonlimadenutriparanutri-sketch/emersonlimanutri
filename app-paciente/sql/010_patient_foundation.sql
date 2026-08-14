-- =====================================================================
-- App do Paciente — Fase 1
-- 010_patient_foundation.sql — vínculo, convite e leitura do nutricionista
--
-- O QUE ESTA MIGRATION CRIA
--   public.patient_users        quem é paciente de quem
--   public.patient_invites      convites por link, com token hasheado
--   public.is_patient_of(uuid)  a função que as policies do paciente usam
--   public.v_nutri_publico      nome e CRN do nutricionista, sem contato
--
-- O QUE ELA NÃO FAZ
-- Nenhuma policy de paciente em tabela clínica ainda. Elas entram junto
-- com as telas que precisam delas, para que cada acesso liberado tenha
-- um motivo visível. Aqui só se monta o alicerce.
--
-- Nada nesta migration altera comportamento do app atual: são tabelas
-- novas, uma função nova e uma view nova. Nenhuma policy existente é
-- tocada.
--
-- Rode depois da 005. É idempotente.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. patient_users — o vínculo
--
-- N:N de propósito. A plataforma é multi-tenant e o mesmo paciente pode
-- ser atendido por mais de um nutricionista assinante sem precisar de
-- uma segunda conta.
--
-- nutri_user_id é desnormalizado (dá para chegar nele por patients),
-- mas evita um join em toda policy e no branding do app do paciente.
-- ---------------------------------------------------------------------
create table if not exists public.patient_users (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid not null references auth.users(id)      on delete cascade,
  patient_id    uuid not null references public.patients(id) on delete cascade,
  nutri_user_id uuid not null references auth.users(id)      on delete cascade,
  ativo         boolean     not null default true,
  created_at    timestamptz not null default now(),
  unique (auth_user_id, patient_id)
);

create index if not exists patient_users_auth_user_idx on public.patient_users (auth_user_id);
create index if not exists patient_users_patient_idx   on public.patient_users (patient_id);
create index if not exists patient_users_nutri_idx     on public.patient_users (nutri_user_id);

comment on table public.patient_users is
  'Liga o usuário de login do paciente ao prontuário. Desativar (ativo=false) corta o acesso sem apagar o prontuário.';


-- ---------------------------------------------------------------------
-- 2. patient_invites — o convite
--
-- O nutricionista gera o link e envia pelo WhatsApp dele. O sistema não
-- dispara nada, então não há telefone nem status de entrega aqui.
--
-- Só o HASH do token é guardado. Quem tiver leitura nesta tabela não
-- consegue aceitar convite de ninguém. O token cru é devolvido uma
-- única vez, na resposta da Edge Function que o gera.
-- ---------------------------------------------------------------------
create table if not exists public.patient_invites (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id)      on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  token_hash text not null unique,
  expira_em  timestamptz not null,
  status     text not null default 'gerado'
             check (status in ('gerado', 'aceito', 'revogado')),
  aceito_em  timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists patient_invites_patient_idx on public.patient_invites (patient_id);
create index if not exists patient_invites_status_idx  on public.patient_invites (user_id, status);

comment on column public.patient_invites.token_hash is
  'Hash do token. O valor cru existe só no link, devolvido uma vez pela Edge Function.';


-- ---------------------------------------------------------------------
-- 3. is_patient_of — a função que sustenta todas as policies do paciente
--
-- SECURITY DEFINER porque precisa ler patient_users por dentro da
-- policy, sem depender das policies de patient_users.
--
-- Segue o mesmo padrão que torna is_approved_user e has_role seguras
-- neste projeto: search_path fixo, e o parâmetro identifica o RECURSO,
-- nunca o chamador — quem chama vem sempre de auth.uid(). Assim não há
-- como passar o id de outra pessoa e se fazer passar por ela.
-- ---------------------------------------------------------------------
create or replace function public.is_patient_of(p_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.patient_users pu
    where pu.patient_id   = p_patient_id
      and pu.auth_user_id = auth.uid()
      and pu.ativo
  );
$$;

revoke execute on function public.is_patient_of(uuid) from public;
revoke execute on function public.is_patient_of(uuid) from anon;
grant  execute on function public.is_patient_of(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------
alter table public.patient_users   enable row level security;
alter table public.patient_invites enable row level security;

-- --- patient_users ---------------------------------------------------
-- O nutricionista administra os vínculos dos próprios pacientes.
drop policy if exists patient_users_nutri_all on public.patient_users;
create policy patient_users_nutri_all
  on public.patient_users
  for all
  to authenticated
  using      (nutri_user_id = auth.uid())
  with check (nutri_user_id = auth.uid());

-- O paciente enxerga o próprio vínculo — é o que diz ao app do paciente
-- de quem ele é paciente. Só leitura: criar e desativar vínculo é ato do
-- nutricionista ou da Edge Function de aceite.
drop policy if exists patient_users_self_select on public.patient_users;
create policy patient_users_self_select
  on public.patient_users
  for select
  to authenticated
  using (auth_user_id = auth.uid());

-- --- patient_invites -------------------------------------------------
-- Só o nutricionista dono. O paciente nunca lê esta tabela: ela guarda
-- hash de token, e o convite chega a ele pelo link, não pela API.
drop policy if exists patient_invites_nutri_all on public.patient_invites;
create policy patient_invites_nutri_all
  on public.patient_invites
  for all
  to authenticated
  using      (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ---------------------------------------------------------------------
-- 5. v_nutri_publico — o que o paciente pode saber do nutricionista dele
--
-- A policy de profiles não é afetada: continua sendo "própria linha ou
-- admin". Esta view é uma janela estreita e separada, com as colunas de
-- identificação profissional e NENHUM dado de contato — sem e-mail, sem
-- telefone, sem instagram.
--
-- security_invoker = false (padrão) de propósito: a view roda com os
-- privilégios do dono e portanto atravessa a RLS de profiles. É o
-- WHERE abaixo que faz a restrição, e ele é a única coisa entre o
-- paciente e a tabela — por isso está escrito de forma que só devolve
-- linhas de nutricionista de quem o chamador é paciente ativo.
-- ---------------------------------------------------------------------
drop view if exists public.v_nutri_publico;

create view public.v_nutri_publico
with (security_invoker = false) as
select
  p.id,
  p.nome_completo,
  p.crn,
  p.especialidade,
  p.avatar_url
from public.profiles p
where exists (
  select 1 from public.patient_users pu
  where pu.auth_user_id  = auth.uid()
    and pu.nutri_user_id = p.id
    and pu.ativo
);

revoke all on public.v_nutri_publico from public;
revoke all on public.v_nutri_publico from anon;
grant select on public.v_nutri_publico to authenticated;

comment on view public.v_nutri_publico is
  'Identificação profissional do nutricionista, visível apenas para pacientes ativos dele. Sem dados de contato.';


-- ---------------------------------------------------------------------
-- 6. Estado final
-- ---------------------------------------------------------------------
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('patient_users', 'patient_invites')
order by tablename, cmd, policyname;
