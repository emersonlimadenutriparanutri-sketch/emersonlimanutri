-- =====================================================================
--  INSTALAÇÃO COMPLETA — Plataforma de Gestão para Nutricionistas
--  Cole este arquivo inteiro no SQL Editor do seu projeto Supabase
--  e clique em RUN. Pode rodar mais de uma vez sem quebrar nada.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 0. Utilitários
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$ begin
  create type public.app_role as enum ('admin', 'user');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 1. Perfil, papéis e módulos liberados
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  nome          text,
  email         text,
  telefone      text,
  crn           text,
  avatar_url    text,
  clinica       text,
  aprovado      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Papel NUNCA fica no perfil: tabela separada evita escalada de privilégio.
create table if not exists public.user_roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       public.app_role not null default 'user',
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create table if not exists public.user_features (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  feature    text not null,
  habilitado boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, feature)
);

-- SECURITY DEFINER: quebra a recursão de RLS ao consultar papéis dentro de policies.
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;

create or replace function public.is_approved(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select aprovado from public.profiles where id = _user_id), false);
$$;

-- Cria perfil + papel padrão no cadastro. O 1º usuário do projeto vira admin aprovado.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  primeiro boolean;
begin
  select count(*) = 0 into primeiro from public.profiles;

  insert into public.profiles (id, nome, email, avatar_url, aprovado)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.email,
    new.raw_user_meta_data->>'avatar_url',
    primeiro
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, case when primeiro then 'admin'::public.app_role else 'user'::public.app_role end)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 2. Comercial — leads e serviços
-- ---------------------------------------------------------------------
create table if not exists public.servicos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  nome        text not null,
  descricao   text,
  valor       numeric(12,2) not null default 0,
  tipo        text not null default 'mensal',      -- mensal | premium
  duracao_meses int default 1,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.leads (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  nome              text not null,
  telefone          text,
  email             text,
  cidade            text,
  estado            text,
  instagram         text,
  data_nascimento   date,
  sexo              text,
  profissao         text,
  origem            text,                          -- indicacao | instagram | trafego | ...
  status            text not null default 'novo_lead',
  temperatura       text not null default 'frio',  -- frio | morno | quente
  valor_potencial   numeric(12,2) default 0,
  servico_id        uuid references public.servicos(id) on delete set null,
  data_consulta     timestamptz,
  proxima_acao      text,
  proxima_acao_data date,
  tags              text[] default '{}',
  observacoes       text,
  motivo_perda      text,
  tentativas        jsonb not null default '[]'::jsonb,   -- histórico de follow up
  em_recuperacao    boolean not null default false,
  convertido_em     uuid,                                  -- patients.id
  ordem             integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. Pacientes
-- ---------------------------------------------------------------------
create table if not exists public.patients (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  nome              text not null,
  telefone          text,
  email             text,
  cidade            text,
  estado            text,
  instagram         text,
  data_nascimento   date,
  sexo              text,
  profissao         text,
  objetivo          text,
  observacoes       text,
  status            text not null default 'ativo',  -- ativo | inativo
  servico_id        uuid references public.servicos(id) on delete set null,
  plano_tipo        text default 'mensal',          -- mensal | premium
  plano_valor       numeric(12,2) default 0,
  plano_inicio      date,
  plano_vencimento  date,
  origem            text,
  lead_id           uuid references public.leads(id) on delete set null,
  ciclo_ultima_menstruacao date,
  ciclo_duracao     integer default 28,
  ciclo_duracao_menstruacao integer default 5,
  usa_medicacao     boolean default false,
  medicacoes        text,
  foto_url          text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.anamnese (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  patient_id    uuid not null references public.patients(id) on delete cascade,
  data          date not null default current_date,
  dados         jsonb not null default '{}'::jsonb,
  resumo_ia     text,
  arquivo_url   text,
  arquivo_nome  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.rastreamento_metabolico (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  patient_id     uuid not null references public.patients(id) on delete cascade,
  data           date not null default current_date,
  respostas      jsonb not null default '{}'::jsonb,
  pontuacao_sistemas jsonb not null default '{}'::jsonb,
  pontuacao_total integer default 0,
  relatorio_ia   text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.avaliacoes_fisicas (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  patient_id   uuid not null references public.patients(id) on delete cascade,
  data         date not null default current_date,
  metodo       text default 'bioimpedancia',   -- bioimpedancia | dobras | medidas
  peso         numeric(6,2),
  altura       numeric(5,2),
  imc          numeric(6,2),
  gordura_pct  numeric(5,2),
  massa_magra  numeric(6,2),
  massa_gorda  numeric(6,2),
  agua_pct     numeric(5,2),
  tmb          numeric(8,2),
  medidas      jsonb not null default '{}'::jsonb,  -- cintura, quadril, braco...
  dobras       jsonb not null default '{}'::jsonb,
  fotos        jsonb not null default '[]'::jsonb,  -- [{url, angulo}]
  observacoes  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.analise_exames (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  patient_id    uuid not null references public.patients(id) on delete cascade,
  data          date not null default current_date,
  laboratorio   text,
  origem        text not null default 'nutricionista', -- nutricionista | paciente
  arquivo_url   text,
  arquivo_nome  text,
  marcadores    jsonb not null default '[]'::jsonb,    -- [{nome, valor, unidade, ref_min, ref_max, otimo_min, otimo_max, status}]
  relatorio_ia  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.resumos_consulta (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  patient_id   uuid not null references public.patients(id) on delete cascade,
  data         date not null default current_date,
  titulo       text,
  anotacoes    text,
  relatorio_ia text,
  arquivo_url  text,
  arquivo_nome text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.raio_x_semanal (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  patient_id   uuid not null references public.patients(id) on delete cascade,
  semana_ref   date not null default current_date,
  respostas    jsonb not null default '{}'::jsonb,
  peso         numeric(6,2),
  adesao_pct   integer,
  leitura_ia   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.calorimetria_indireta (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  patient_id   uuid not null references public.patients(id) on delete cascade,
  data         date not null default current_date,
  gasto_repouso numeric(8,2),
  qr           numeric(4,2),
  vo2          numeric(8,2),
  vco2         numeric(8,2),
  observacoes  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.relatorios_evolucao (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  patient_id   uuid not null references public.patients(id) on delete cascade,
  periodo_de   date,
  periodo_ate  date,
  conteudo     text,
  fontes       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4. Jornada do paciente
-- ---------------------------------------------------------------------
create table if not exists public.jornada_templates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  nome        text not null,
  descricao   text,
  padrao      boolean not null default false,
  estrutura   jsonb not null default '[]'::jsonb, -- [{mes, titulo, semanas:[{semana,titulo,tarefas:[{titulo,tipo,dia_offset}]}]}]
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.jornada (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  patient_id   uuid not null references public.patients(id) on delete cascade,
  mes          integer not null default 1,
  semana       integer not null default 1,
  titulo       text not null,
  descricao    text,
  tipo         text default 'tarefa',
  data_prevista date,
  concluida    boolean not null default false,
  concluida_em timestamptz,
  anexos       jsonb not null default '[]'::jsonb,
  ordem        integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. Agenda / Torre de Controle
-- ---------------------------------------------------------------------
create table if not exists public.agenda_tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  titulo       text not null,
  descricao    text,
  tipo         text not null default 'tarefa',  -- tarefa|consulta|raio_x|contato|lembrete|envio_material|ajuste_plano|retorno|outro
  data         date not null default current_date,
  hora         time,
  cor          text,
  concluida    boolean not null default false,
  concluida_em timestamptz,
  patient_id   uuid references public.patients(id) on delete set null,
  lead_id      uuid references public.leads(id) on delete set null,
  link_reuniao text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.kanban_boards (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  nome       text not null,
  descricao  text,
  cor        text,
  ordem      integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kanban_columns (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  board_id   uuid not null references public.kanban_boards(id) on delete cascade,
  nome       text not null,
  cor        text,
  ordem      integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kanban_cards (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  column_id   uuid not null references public.kanban_columns(id) on delete cascade,
  titulo      text not null,
  descricao   text,
  cor         text,
  data_limite date,
  checklist   jsonb not null default '[]'::jsonb,
  ordem       integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.mind_maps (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  titulo     text not null,
  descricao  text,
  nos        jsonb not null default '[]'::jsonb,  -- [{id,parentId,texto,x,y,cor}]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. Financeiro (regime de competência)
-- ---------------------------------------------------------------------
create table if not exists public.plano_contas (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  codigo     text,
  nome       text not null,
  tipo       text not null default 'despesa',  -- receita | despesa
  parent_id  uuid references public.plano_contas(id) on delete cascade,
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contas_financeiras (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  nome           text not null,
  tipo           text not null default 'caixa', -- caixa | banco | cartao_debito | cartao_credito
  banco          text,
  saldo_inicial  numeric(12,2) not null default 0,
  dia_fechamento integer,
  dia_vencimento integer,
  ativo          boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.receitas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  descricao     text not null,
  valor         numeric(12,2) not null default 0,
  data_competencia date not null default current_date,
  patient_id    uuid references public.patients(id) on delete set null,
  lead_id       uuid references public.leads(id) on delete set null,
  servico_id    uuid references public.servicos(id) on delete set null,
  conta_id      uuid references public.contas_financeiras(id) on delete set null,
  plano_conta_id uuid references public.plano_contas(id) on delete set null,
  origem_lead   text,
  parcelas      integer not null default 1,
  forma_pagamento text,
  observacoes   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.despesas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  descricao     text not null,
  valor         numeric(12,2) not null default 0,
  data_competencia date not null default current_date,
  conta_id      uuid references public.contas_financeiras(id) on delete set null,
  plano_conta_id uuid references public.plano_contas(id) on delete set null,
  fornecedor    text,
  parcelas      integer not null default 1,
  recorrente    boolean not null default false,
  observacoes   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Cada parcela vira um lançamento (a receber / a pagar) com baixa individual.
create table if not exists public.lancamentos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  tipo          text not null default 'receber',  -- receber | pagar
  descricao     text not null,
  valor         numeric(12,2) not null default 0,
  vencimento    date not null default current_date,
  pago          boolean not null default false,
  data_pagamento date,
  receita_id    uuid references public.receitas(id) on delete cascade,
  despesa_id    uuid references public.despesas(id) on delete cascade,
  conta_id      uuid references public.contas_financeiras(id) on delete set null,
  parcela       integer not null default 1,
  total_parcelas integer not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.metas_financeiras (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  mes_ref      date not null default date_trunc('month', current_date)::date,
  meta_receita numeric(12,2) not null default 0,
  meta_pacientes integer not null default 0,
  dias_uteis   integer not null default 22,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, mes_ref)
);

-- ---------------------------------------------------------------------
-- 7. Questionários
-- ---------------------------------------------------------------------
create table if not exists public.questionario_modelos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  titulo     text not null,
  descricao  text,
  categoria  text,
  perguntas  jsonb not null default '[]'::jsonb, -- [{id,tipo,titulo,obrigatoria,opcoes,min,max}]
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.questionario_envios (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  modelo_id   uuid not null references public.questionario_modelos(id) on delete cascade,
  patient_id  uuid references public.patients(id) on delete set null,
  lead_id     uuid references public.leads(id) on delete set null,
  token       text not null unique default encode(gen_random_bytes(16), 'hex'),
  destinatario text,
  respondido  boolean not null default false,
  respondido_em timestamptz,
  expira_em   date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.questionario_respostas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  envio_id    uuid not null references public.questionario_envios(id) on delete cascade,
  modelo_id   uuid references public.questionario_modelos(id) on delete set null,
  patient_id  uuid references public.patients(id) on delete set null,
  respostas   jsonb not null default '{}'::jsonb,
  resumo_ia   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 8. Índices
-- ---------------------------------------------------------------------
create index if not exists idx_patients_user     on public.patients(user_id, status);
create index if not exists idx_patients_venc     on public.patients(user_id, plano_vencimento);
create index if not exists idx_leads_user        on public.leads(user_id, status);
create index if not exists idx_leads_created     on public.leads(user_id, created_at desc);
create index if not exists idx_agenda_user_data  on public.agenda_tasks(user_id, data);
create index if not exists idx_jornada_patient   on public.jornada(patient_id, mes, semana, ordem);
create index if not exists idx_lanc_user_venc    on public.lancamentos(user_id, vencimento);
create index if not exists idx_receitas_comp     on public.receitas(user_id, data_competencia);
create index if not exists idx_despesas_comp     on public.despesas(user_id, data_competencia);
create index if not exists idx_envios_token      on public.questionario_envios(token);
create index if not exists idx_kanban_cards_col  on public.kanban_cards(column_id, ordem);

-- ---------------------------------------------------------------------
-- 9. RLS — cada nutricionista enxerga SOMENTE os próprios dados
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  tabelas text[] := array[
    'user_features','patients','leads','anamnese','rastreamento_metabolico','avaliacoes_fisicas',
    'analise_exames','resumos_consulta','raio_x_semanal','calorimetria_indireta','relatorios_evolucao',
    'jornada','jornada_templates','agenda_tasks','servicos','receitas','despesas','lancamentos',
    'contas_financeiras','plano_contas','metas_financeiras','questionario_modelos','questionario_envios',
    'questionario_respostas','kanban_boards','kanban_columns','kanban_cards','mind_maps'
  ];
begin
  foreach t in array tabelas loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "own_select" on public.%I', t);
    execute format('drop policy if exists "own_insert" on public.%I', t);
    execute format('drop policy if exists "own_update" on public.%I', t);
    execute format('drop policy if exists "own_delete" on public.%I', t);

    execute format('create policy "own_select" on public.%I for select using (auth.uid() = user_id)', t);
    execute format('create policy "own_insert" on public.%I for insert with check (auth.uid() = user_id)', t);
    execute format('create policy "own_update" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('create policy "own_delete" on public.%I for delete using (auth.uid() = user_id)', t);
  end loop;
end $$;

-- profiles: dono lê/edita o próprio; admin lê e aprova todos
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
drop policy if exists "profile_select" on public.profiles;
drop policy if exists "profile_update" on public.profiles;
drop policy if exists "profile_insert" on public.profiles;
create policy "profile_select" on public.profiles for select
  using (auth.uid() = id or public.has_role(auth.uid(), 'admin'));
create policy "profile_update" on public.profiles for update
  using (auth.uid() = id or public.has_role(auth.uid(), 'admin'))
  with check (auth.uid() = id or public.has_role(auth.uid(), 'admin'));
create policy "profile_insert" on public.profiles for insert with check (auth.uid() = id);

-- user_roles: leitura do próprio papel; só admin escreve
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
drop policy if exists "roles_select" on public.user_roles;
drop policy if exists "roles_admin_write" on public.user_roles;
create policy "roles_select" on public.user_roles for select
  using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));
create policy "roles_admin_write" on public.user_roles for all
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------
-- 10. Storage — buckets privados, cada usuário na própria pasta
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars','avatars',false), ('exames-temp','exames-temp',false),
       ('paciente-exames','paciente-exames',false), ('avaliacoes-fotos','avaliacoes-fotos',false),
       ('lesson-materials','lesson-materials',false)
on conflict (id) do nothing;

do $$
declare
  b text;
  buckets text[] := array['avatars','exames-temp','paciente-exames','avaliacoes-fotos','lesson-materials'];
begin
  foreach b in array buckets loop
    execute format('drop policy if exists %I on storage.objects', b || '_select');
    execute format('drop policy if exists %I on storage.objects', b || '_insert');
    execute format('drop policy if exists %I on storage.objects', b || '_update');
    execute format('drop policy if exists %I on storage.objects', b || '_delete');

    execute format($f$create policy %I on storage.objects for select to authenticated
      using (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)$f$, b || '_select', b);
    execute format($f$create policy %I on storage.objects for insert to authenticated
      with check (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)$f$, b || '_insert', b);
    execute format($f$create policy %I on storage.objects for update to authenticated
      using (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)$f$, b || '_update', b);
    execute format($f$create policy %I on storage.objects for delete to authenticated
      using (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)$f$, b || '_delete', b);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 11. updated_at automático
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in
    select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
  loop
    if exists (select 1 from information_schema.columns
               where table_schema='public' and table_name=t and column_name='updated_at') then
      execute format('drop trigger if exists set_updated_at on public.%I', t);
      execute format('create trigger set_updated_at before update on public.%I
                      for each row execute function public.set_updated_at()', t);
    end if;
  end loop;
end $$;
