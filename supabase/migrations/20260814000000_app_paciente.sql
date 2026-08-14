-- =====================================================================
-- App do Paciente — estrutura de dados, RLS e RPCs
-- =====================================================================
-- Roda no mesmo projeto Supabase do "De Nutri para Nutri".
-- Nada aqui remove ou altera política existente do app do nutricionista:
-- as policies novas são ADITIVAS (o Postgres aplica OR entre policies do
-- mesmo comando), então o nutri continua enxergando tudo o que já via.
--
-- Rode este arquivo inteiro no SQL Editor do Supabase.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabelas novas
-- ---------------------------------------------------------------------

-- Vínculo entre uma conta de login (auth.users) e um paciente do nutri.
create table if not exists public.patient_users (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid not null references auth.users(id) on delete cascade,
  patient_id    uuid not null references public.patients(id) on delete cascade,
  nutri_user_id uuid not null,
  email         text,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (auth_user_id, patient_id)
);

create index if not exists patient_users_auth_idx  on public.patient_users(auth_user_id);
create index if not exists patient_users_pat_idx   on public.patient_users(patient_id);
create index if not exists patient_users_nutri_idx on public.patient_users(nutri_user_id);

-- Convites gerados pelo nutricionista para o paciente criar o login.
create table if not exists public.patient_invites (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,                       -- nutricionista que convidou
  patient_id    uuid not null references public.patients(id) on delete cascade,
  token         text not null unique,
  email         text,                                -- se preenchido, o cadastro exige este e-mail
  expira_em     timestamptz not null default (now() + interval '30 days'),
  aceito_em     timestamptz,
  aceito_por    uuid references auth.users(id) on delete set null,
  revogado      boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists patient_invites_token_idx on public.patient_invites(token);
create index if not exists patient_invites_user_idx  on public.patient_invites(user_id);

-- O que cada paciente pode ver dentro do app. Criado junto com o convite.
create table if not exists public.patient_app_settings (
  patient_id      uuid primary key references public.patients(id) on delete cascade,
  user_id         uuid not null,
  ver_jornada     boolean not null default true,
  ver_evolucao    boolean not null default true,
  ver_relatorios  boolean not null default true,
  ver_exames      boolean not null default false,   -- laudo clínico: nutri libera caso a caso
  ver_consultas   boolean not null default true,
  chat_ativo      boolean not null default true,
  diario_ativo    boolean not null default true,
  materiais_ativo boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Chat entre paciente e nutricionista.
create table if not exists public.patient_messages (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,                        -- nutricionista da conversa
  patient_id   uuid not null references public.patients(id) on delete cascade,
  autor        text not null check (autor in ('paciente', 'nutri')),
  corpo        text,
  anexo_url    text,
  anexo_tipo   text,
  lida_em      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists patient_messages_conv_idx on public.patient_messages(patient_id, created_at desc);
create index if not exists patient_messages_nutri_idx on public.patient_messages(user_id, created_at desc);

-- Diário alimentar com foto.
create table if not exists public.diario_alimentar (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  patient_id  uuid not null references public.patients(id) on delete cascade,
  data        date not null default current_date,
  horario     time,
  refeicao    text,                                  -- cafe, lanche_manha, almoco, ...
  descricao   text,
  foto_url    text,
  fome_antes  int check (fome_antes between 0 and 10),
  saciedade   int check (saciedade between 0 and 10),
  contexto    text,                                  -- como se sentia ao comer
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists diario_pat_idx on public.diario_alimentar(patient_id, data desc);

-- Lembretes (água, suplemento, refeição, check-in...).
create table if not exists public.lembretes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  patient_id   uuid not null references public.patients(id) on delete cascade,
  criado_por   text not null default 'paciente' check (criado_por in ('paciente', 'nutri')),
  tipo         text not null default 'outro',        -- agua, suplemento, refeicao, checkin, consulta, outro
  titulo       text not null,
  descricao    text,
  horario      time,
  dias_semana  int[] not null default '{0,1,2,3,4,5,6}',  -- 0 = domingo
  ativo        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists lembretes_pat_idx on public.lembretes(patient_id) where ativo;

-- Biblioteca de materiais e receitas do nutricionista.
-- patient_id nulo = liberado para todos os pacientes daquele nutri.
create table if not exists public.materiais (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  patient_id  uuid references public.patients(id) on delete cascade,
  tipo        text not null default 'pdf' check (tipo in ('pdf', 'video', 'link', 'receita', 'texto')),
  titulo      text not null,
  descricao   text,
  categoria   text,
  url         text,
  conteudo    text,                                   -- receita/texto direto no app
  capa_url    text,
  publicado   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists materiais_user_idx on public.materiais(user_id) where publicado;

-- Inscrições de push (Web Push) por dispositivo.
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  patient_id   uuid references public.patients(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth_key     text not null,
  user_agent   text,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. updated_at automático
-- ---------------------------------------------------------------------

create or replace function public.tg_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'patient_users', 'patient_app_settings', 'diario_alimentar', 'lembretes', 'materiais'
  ] loop
    execute format(
      'drop trigger if exists touch_updated_at on public.%I;
       create trigger touch_updated_at before update on public.%I
       for each row execute function public.tg_touch_updated_at();', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. Funções auxiliares de identidade
-- ---------------------------------------------------------------------

-- Todos os patient_id ligados ao login atual (um paciente pode ser
-- atendido por mais de um nutricionista da plataforma).
create or replace function public.meus_patient_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select pu.patient_id
    from public.patient_users pu
   where pu.auth_user_id = auth.uid()
     and pu.ativo;
$$;

create or replace function public.sou_este_paciente(p_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.patient_users pu
     where pu.auth_user_id = auth.uid()
       and pu.patient_id = p_patient_id
       and pu.ativo
  );
$$;

-- Checagem de permissão configurada pelo nutri para aquele paciente.
create or replace function public.paciente_pode_ver(p_patient_id uuid, p_campo text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  liberado boolean;
begin
  if not public.sou_este_paciente(p_patient_id) then
    return false;
  end if;

  execute format('select coalesce(%I, false) from public.patient_app_settings where patient_id = $1', p_campo)
    into liberado
    using p_patient_id;

  -- Sem linha de configuração, valem os defaults da tabela.
  if liberado is null then
    return p_campo <> 'ver_exames';
  end if;

  return liberado;
end;
$$;

grant execute on function public.meus_patient_ids()                to authenticated;
grant execute on function public.sou_este_paciente(uuid)           to authenticated;
grant execute on function public.paciente_pode_ver(uuid, text)     to authenticated;

-- ---------------------------------------------------------------------
-- 4. RLS das tabelas novas
-- ---------------------------------------------------------------------

alter table public.patient_users       enable row level security;
alter table public.patient_invites     enable row level security;
alter table public.patient_app_settings enable row level security;
alter table public.patient_messages    enable row level security;
alter table public.diario_alimentar    enable row level security;
alter table public.lembretes           enable row level security;
alter table public.materiais           enable row level security;
alter table public.push_subscriptions  enable row level security;

-- patient_users
drop policy if exists "nutri gerencia vinculos" on public.patient_users;
create policy "nutri gerencia vinculos" on public.patient_users
  for all using (nutri_user_id = auth.uid()) with check (nutri_user_id = auth.uid());

drop policy if exists "paciente le seu vinculo" on public.patient_users;
create policy "paciente le seu vinculo" on public.patient_users
  for select using (auth_user_id = auth.uid());

-- patient_invites (só o nutri manipula; o paciente usa as RPCs)
drop policy if exists "nutri gerencia convites" on public.patient_invites;
create policy "nutri gerencia convites" on public.patient_invites
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- patient_app_settings
drop policy if exists "nutri gerencia permissoes" on public.patient_app_settings;
create policy "nutri gerencia permissoes" on public.patient_app_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "paciente le suas permissoes" on public.patient_app_settings;
create policy "paciente le suas permissoes" on public.patient_app_settings
  for select using (public.sou_este_paciente(patient_id));

-- patient_messages
drop policy if exists "nutri gerencia conversas" on public.patient_messages;
create policy "nutri gerencia conversas" on public.patient_messages
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "paciente le sua conversa" on public.patient_messages;
create policy "paciente le sua conversa" on public.patient_messages
  for select using (public.sou_este_paciente(patient_id));

drop policy if exists "paciente escreve na sua conversa" on public.patient_messages;
create policy "paciente escreve na sua conversa" on public.patient_messages
  for insert with check (
    autor = 'paciente'
    and public.paciente_pode_ver(patient_id, 'chat_ativo')
  );

drop policy if exists "paciente marca como lida" on public.patient_messages;
create policy "paciente marca como lida" on public.patient_messages
  for update using (public.sou_este_paciente(patient_id))
  with check (public.sou_este_paciente(patient_id));

-- diario_alimentar
drop policy if exists "nutri le diario" on public.diario_alimentar;
create policy "nutri le diario" on public.diario_alimentar
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "paciente gerencia seu diario" on public.diario_alimentar;
create policy "paciente gerencia seu diario" on public.diario_alimentar
  for all using (public.sou_este_paciente(patient_id))
  with check (public.paciente_pode_ver(patient_id, 'diario_ativo'));

-- lembretes
drop policy if exists "nutri gerencia lembretes" on public.lembretes;
create policy "nutri gerencia lembretes" on public.lembretes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "paciente gerencia seus lembretes" on public.lembretes;
create policy "paciente gerencia seus lembretes" on public.lembretes
  for all using (public.sou_este_paciente(patient_id))
  with check (public.sou_este_paciente(patient_id));

-- materiais
drop policy if exists "nutri gerencia materiais" on public.materiais;
create policy "nutri gerencia materiais" on public.materiais
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "paciente le materiais liberados" on public.materiais;
create policy "paciente le materiais liberados" on public.materiais
  for select using (
    publicado
    and (
      (patient_id is not null and public.paciente_pode_ver(patient_id, 'materiais_ativo'))
      or (
        patient_id is null
        and exists (
          select 1 from public.patient_users pu
           where pu.auth_user_id = auth.uid()
             and pu.ativo
             and pu.nutri_user_id = materiais.user_id
        )
      )
    )
  );

-- push_subscriptions
drop policy if exists "dono gerencia suas inscricoes" on public.push_subscriptions;
create policy "dono gerencia suas inscricoes" on public.push_subscriptions
  for all using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 5. Leitura do paciente nas tabelas que já existem
-- ---------------------------------------------------------------------

-- Cadastro do próprio paciente
drop policy if exists "paciente le seu cadastro" on public.patients;
create policy "paciente le seu cadastro" on public.patients
  for select using (public.sou_este_paciente(id));

-- Jornada / plano
drop policy if exists "paciente le sua jornada" on public.jornada;
create policy "paciente le sua jornada" on public.jornada
  for select using (public.paciente_pode_ver(patient_id, 'ver_jornada'));

-- Avaliações físicas (gráficos de evolução)
drop policy if exists "paciente le suas avaliacoes" on public.avaliacoes_fisicas;
create policy "paciente le suas avaliacoes" on public.avaliacoes_fisicas
  for select using (public.paciente_pode_ver(patient_id, 'ver_evolucao'));

-- Relatórios de evolução
drop policy if exists "paciente le seus relatorios" on public.relatorios_evolucao;
create policy "paciente le seus relatorios" on public.relatorios_evolucao
  for select using (public.paciente_pode_ver(patient_id, 'ver_relatorios'));

-- Análises de exames (liberação caso a caso)
drop policy if exists "paciente le seus exames" on public.analise_exames;
create policy "paciente le seus exames" on public.analise_exames
  for select using (public.paciente_pode_ver(patient_id, 'ver_exames'));

-- Consultas e tarefas com paciente vinculado
drop policy if exists "paciente le seus agendamentos" on public.agenda_tasks;
create policy "paciente le seus agendamentos" on public.agenda_tasks
  for select using (
    paciente_id is not null
    and public.paciente_pode_ver(paciente_id, 'ver_consultas')
  );

-- Check-in semanal: o paciente lê e escreve o próprio
drop policy if exists "paciente le seu raio x" on public.raio_x_semanal;
create policy "paciente le seu raio x" on public.raio_x_semanal
  for select using (public.sou_este_paciente(patient_id));

drop policy if exists "paciente envia raio x" on public.raio_x_semanal;
create policy "paciente envia raio x" on public.raio_x_semanal
  for insert with check (public.sou_este_paciente(patient_id));

drop policy if exists "paciente edita seu raio x" on public.raio_x_semanal;
create policy "paciente edita seu raio x" on public.raio_x_semanal
  for update using (public.sou_este_paciente(patient_id))
  with check (public.sou_este_paciente(patient_id));

-- Questionários enviados a ele
drop policy if exists "paciente le seus envios" on public.questionario_envios;
create policy "paciente le seus envios" on public.questionario_envios
  for select using (public.sou_este_paciente(patient_id));

drop policy if exists "paciente atualiza status do envio" on public.questionario_envios;
create policy "paciente atualiza status do envio" on public.questionario_envios
  for update using (public.sou_este_paciente(patient_id))
  with check (public.sou_este_paciente(patient_id));

drop policy if exists "paciente le modelo enviado" on public.questionario_modelos;
create policy "paciente le modelo enviado" on public.questionario_modelos
  for select using (
    exists (
      select 1 from public.questionario_envios e
       where e.modelo_id = questionario_modelos.id
         and public.sou_este_paciente(e.patient_id)
    )
  );

drop policy if exists "paciente le suas respostas" on public.questionario_respostas;
create policy "paciente le suas respostas" on public.questionario_respostas
  for select using (public.sou_este_paciente(patient_id));

drop policy if exists "paciente responde questionario" on public.questionario_respostas;
create policy "paciente responde questionario" on public.questionario_respostas
  for insert with check (
    public.sou_este_paciente(patient_id)
    and exists (
      select 1 from public.questionario_envios e
       where e.id = questionario_respostas.envio_id
         and e.patient_id = questionario_respostas.patient_id
    )
  );

-- Dados do nutricionista (nome e avatar para a marca dentro do app)
drop policy if exists "paciente le perfil do seu nutri" on public.profiles;
create policy "paciente le perfil do seu nutri" on public.profiles
  for select using (
    exists (
      select 1 from public.patient_users pu
       where pu.auth_user_id = auth.uid()
         and pu.ativo
         and pu.nutri_user_id = profiles.id
    )
  );

-- ---------------------------------------------------------------------
-- 6. RPCs do fluxo de convite
-- ---------------------------------------------------------------------

-- Chamada pelo nutricionista logado: cria (ou renova) o convite do paciente.
create or replace function public.criar_convite_paciente(
  p_patient_id uuid,
  p_email      text default null
)
returns table (token text, expira_em timestamptz)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_token text;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;

  if not exists (
    select 1 from public.patients p
     where p.id = p_patient_id
       and p.user_id = auth.uid()
  ) then
    raise exception 'Paciente não encontrado para este nutricionista';
  end if;

  select coalesce(p_email, nullif(p.email, '')) into v_email
    from public.patients p where p.id = p_patient_id;

  -- Um convite aberto por vez: os anteriores são revogados.
  update public.patient_invites
     set revogado = true
   where patient_id = p_patient_id
     and aceito_em is null
     and not revogado;

  v_token := encode(gen_random_bytes(24), 'hex');

  insert into public.patient_invites (user_id, patient_id, token, email)
  values (auth.uid(), p_patient_id, v_token, v_email);

  insert into public.patient_app_settings (patient_id, user_id)
  values (p_patient_id, auth.uid())
  on conflict (patient_id) do nothing;

  return query
    select i.token, i.expira_em
      from public.patient_invites i
     where i.token = v_token;
end;
$$;

-- Chamada sem login, na tela do convite: mostra de quem é o convite.
create or replace function public.convite_info(p_token text)
returns table (
  valido       boolean,
  motivo       text,
  paciente     text,
  email        text,
  nutri        text,
  nutri_avatar text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v record;
begin
  select i.*, p.nome as paciente_nome, pr.nome_completo as nutri_nome, pr.avatar_url as nutri_avatar
    into v
    from public.patient_invites i
    join public.patients p on p.id = i.patient_id
    left join public.profiles pr on pr.id = i.user_id
   where i.token = p_token;

  if not found then
    return query select false, 'Convite não encontrado', null::text, null::text, null::text, null::text;
    return;
  end if;

  if v.revogado then
    return query select false, 'Convite cancelado pelo nutricionista', null::text, null::text, null::text, null::text;
    return;
  end if;

  if v.aceito_em is not null then
    return query select false, 'Convite já utilizado', null::text, null::text, null::text, null::text;
    return;
  end if;

  if v.expira_em < now() then
    return query select false, 'Convite expirado', null::text, null::text, null::text, null::text;
    return;
  end if;

  return query select true, null::text, v.paciente_nome, v.email, v.nutri_nome, v.nutri_avatar;
end;
$$;

-- Chamada logo depois do cadastro (usuário já autenticado): faz o vínculo.
create or replace function public.aceitar_convite(p_token text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v         record;
  v_email   text;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;

  select * into v from public.patient_invites where token = p_token for update;

  if not found then
    raise exception 'Convite não encontrado';
  end if;
  if v.revogado then
    raise exception 'Convite cancelado';
  end if;
  if v.aceito_em is not null then
    raise exception 'Convite já utilizado';
  end if;
  if v.expira_em < now() then
    raise exception 'Convite expirado';
  end if;

  select email into v_email from auth.users where id = auth.uid();

  if v.email is not null and lower(v.email) <> lower(coalesce(v_email, '')) then
    raise exception 'Este convite é para o e-mail %', v.email;
  end if;

  insert into public.patient_users (auth_user_id, patient_id, nutri_user_id, email)
  values (auth.uid(), v.patient_id, v.user_id, v_email)
  on conflict (auth_user_id, patient_id) do update set ativo = true;

  insert into public.patient_app_settings (patient_id, user_id)
  values (v.patient_id, v.user_id)
  on conflict (patient_id) do nothing;

  update public.patient_invites
     set aceito_em = now(), aceito_por = auth.uid()
   where id = v.id;

  return v.patient_id;
end;
$$;

-- Exames sem o peso morto: a coluna `data` de analise_exames guarda os PDFs
-- originais em base64 (centenas de KB por linha). O app do paciente só precisa
-- do texto, então esta função devolve as análises já sem os arquivos.
create or replace function public.meus_exames(p_patient_id uuid)
returns table (id uuid, created_at timestamptz, analises jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select
    ae.id,
    ae.created_at,
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id',                a ->> 'id',
            'date',              a ->> 'date',
            'perfil',            a -> 'data' ->> 'perfil',
            'analiseClinica',    a -> 'data' ->> 'analiseClinica',
            'observacoesFinais', a -> 'data' ->> 'observacoesFinais',
            'condutaExames',     a -> 'data' ->> 'condutaExames',
            'aiReport',          a -> 'data' ->> 'aiReport',
            'marcadores',        a -> 'data' -> 'marcadores'
          )
          order by a ->> 'date' desc
        ),
        '[]'::jsonb
      )
      from jsonb_array_elements(coalesce(ae.data -> 'analises', '[]'::jsonb)) a
    ) as analises
  from public.analise_exames ae
  where ae.patient_id = p_patient_id
    and public.paciente_pode_ver(p_patient_id, 'ver_exames')
  order by ae.created_at desc;
$$;

grant execute on function public.meus_exames(uuid) to authenticated;

grant execute on function public.criar_convite_paciente(uuid, text) to authenticated;
grant execute on function public.convite_info(text)                 to anon, authenticated;
grant execute on function public.aceitar_convite(text)              to authenticated;

-- ---------------------------------------------------------------------
-- 7. Storage
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('paciente-diario', 'paciente-diario', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('paciente-chat', 'paciente-chat', true)
on conflict (id) do nothing;

-- Caminho dos arquivos: <patient_id>/<arquivo>
drop policy if exists "paciente envia arquivo do diario" on storage.objects;
create policy "paciente envia arquivo do diario" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'paciente-diario'
    and public.sou_este_paciente((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "paciente apaga arquivo do diario" on storage.objects;
create policy "paciente apaga arquivo do diario" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'paciente-diario'
    and public.sou_este_paciente((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "paciente envia anexo do chat" on storage.objects;
create policy "paciente envia anexo do chat" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'paciente-chat'
    and public.sou_este_paciente((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "nutri envia anexo do chat" on storage.objects;
create policy "nutri envia anexo do chat" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('paciente-chat', 'paciente-diario')
    and exists (
      select 1 from public.patients p
       where p.id = (storage.foldername(name))[1]::uuid
         and p.user_id = auth.uid()
    )
  );
