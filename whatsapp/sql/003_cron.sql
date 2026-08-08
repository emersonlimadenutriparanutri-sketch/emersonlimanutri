-- =====================================================================
-- De Nutri para Nutri — Integração WhatsApp Cloud API (Meta)
-- 003_cron.sql — automações agendadas
--
-- Modelo: o cron ENFILEIRA (funções abaixo), o worker DESPACHA
-- (supabase/functions/whatsapp-worker). Nada é enviado direto daqui.
--
-- Automações implementadas (chave em whatsapp_automacoes.chave):
--   lembrete_consulta_24h  — 1 dia antes da consulta
--   lembrete_consulta_2h   — 2 horas antes da consulta
--   followup_lead          — cadência do funil (usa leads.data_proxima_acao)
--   envio_questionario     — manda o link quando o questionário é gerado
--   cobranca_questionario  — cobra quem não respondeu, 24h antes do prazo
--
-- TODAS nascem desligadas. Ligue uma por vez, testando no próprio número.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;


-- ---------------------------------------------------------------------
-- Respeita a janela educada de envio (default 08:00–20:00).
-- Se o disparo cairia às 6h da manhã, empurra para as 8h.
-- ---------------------------------------------------------------------
create or replace function public.wa_proximo_horario_permitido(
  p_user_id uuid,
  p_quando  timestamptz
)
returns timestamptz
language plpgsql
stable
as $$
declare
  cfg     record;
  -- 'local' é palavra reservada no Postgres; não use como nome de variável.
  v_local timestamp;
begin
  select janela_envio_inicio, janela_envio_fim, fuso
    into cfg
    from public.whatsapp_config
   where user_id = p_user_id;

  if not found then
    return p_quando;
  end if;

  v_local := p_quando at time zone cfg.fuso;

  if v_local::time < cfg.janela_envio_inicio then
    -- cedo demais: mesmo dia, no início da janela
    return ((v_local::date + cfg.janela_envio_inicio) at time zone cfg.fuso);
  elsif v_local::time > cfg.janela_envio_fim then
    -- tarde demais: dia seguinte, no início da janela
    return ((v_local::date + interval '1 day' + cfg.janela_envio_inicio) at time zone cfg.fuso);
  end if;

  return p_quando;
end;
$$;


-- ---------------------------------------------------------------------
-- Uma automação está ligada para este usuário?
-- ---------------------------------------------------------------------
create or replace function public.wa_automacao_ativa(p_user_id uuid, p_chave text)
returns boolean
language sql
stable
as $$
  select coalesce(
    (select ativo from public.whatsapp_automacoes
      where user_id = p_user_id and chave = p_chave),
    false
  );
$$;

create or replace function public.wa_template_de(p_user_id uuid, p_chave text, p_default text)
returns text
language sql
stable
as $$
  select coalesce(
    (select nullif(template_nome, '') from public.whatsapp_automacoes
      where user_id = p_user_id and chave = p_chave),
    p_default
  );
$$;

-- Primeiro nome, capitalizado. 'Raquel ( filha )' -> 'Raquel'
create or replace function public.wa_primeiro_nome(p_nome text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(initcap(split_part(btrim(regexp_replace(p_nome, '\(.*?\)', '', 'g')), ' ', 1)), ''),
    'tudo bem'
  );
$$;


-- =====================================================================
-- 1 e 2. Lembretes de consulta (24h e 2h antes)
-- =====================================================================
create or replace function public.wa_agendar_lembretes_consulta()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r          record;
  inseridos  int := 0;
begin
  for r in
    select
      t.id            as task_id,
      t.user_id,
      t.data_inicio,
      t.paciente_nome,
      p.telefone,
      case
        when t.data_inicio between now() + interval '23 hours' and now() + interval '25 hours'
          then '24h'
        else '2h'
      end as quando
    from public.agenda_tasks t
    join public.patients p
      on p.id = t.paciente_id
     and p.user_id = t.user_id
    join public.whatsapp_config c
      on c.user_id = t.user_id and c.ativo
   where t.concluido is not true
     and t.data_inicio is not null
     and (
       (t.data_inicio between now() + interval '23 hours' and now() + interval '25 hours'
         and wa_automacao_ativa(t.user_id, 'lembrete_consulta_24h'))
       or
       (t.data_inicio between now() + interval '90 minutes' and now() + interval '150 minutes'
         and wa_automacao_ativa(t.user_id, 'lembrete_consulta_2h'))
     )
     -- Só o que parece consulta de verdade, não tarefa administrativa.
     and (t.tipo = 'consulta' or t.titulo ilike '%consulta%')
  loop
    -- Sem telefone normalizável não dá pra enviar; segue o baile.
    continue when wa_normalizar_telefone(r.telefone) is null;

    insert into public.whatsapp_fila (
      user_id, wa_id, template_nome, template_params,
      agendado_para, automacao, referencia_tipo, referencia_id, dedupe_key
    )
    values (
      r.user_id,
      wa_normalizar_telefone(r.telefone),
      wa_template_de(
        r.user_id,
        'lembrete_consulta_' || r.quando,
        'lembrete_consulta_' || r.quando
      ),
      case r.quando
        when '24h' then jsonb_build_array(
          wa_primeiro_nome(r.paciente_nome),
          to_char(r.data_inicio at time zone 'America/Sao_Paulo', 'DD/MM'),
          to_char(r.data_inicio at time zone 'America/Sao_Paulo', 'HH24:MI')
        )
        else jsonb_build_array(
          wa_primeiro_nome(r.paciente_nome),
          to_char(r.data_inicio at time zone 'America/Sao_Paulo', 'HH24:MI')
        )
      end,
      -- Lembrete de 2h é urgente: vai agora, mesmo fora da janela educada.
      case r.quando
        when '24h' then wa_proximo_horario_permitido(r.user_id, now())
        else now()
      end,
      'lembrete_consulta_' || r.quando,
      'agenda_task',
      r.task_id,
      'lembrete_' || r.quando || ':' || r.task_id
    )
    on conflict (user_id, dedupe_key) do nothing;

    -- FOUND é false quando o ON CONFLICT ignorou (já estava na fila).
    if found then
      inseridos := inseridos + 1;
    end if;
  end loop;

  return inseridos;
end;
$$;


-- =====================================================================
-- 3. Follow-up de lead (usa leads.data_proxima_acao)
--
-- Hoje esses campos existem mas ninguém dispara nada com eles. É a
-- automação de maior retorno: lead do Instagram/quiz que esfria sozinho.
-- =====================================================================
create or replace function public.wa_agendar_followup_leads()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r         record;
  inseridos int := 0;
begin
  for r in
    select l.id, l.user_id, l.nome, l.telefone, l.data_proxima_acao
      from public.leads l
      join public.whatsapp_config c
        on c.user_id = l.user_id and c.ativo
     where wa_automacao_ativa(l.user_id, 'followup_lead')
       and coalesce(l.proxima_acao_concluida, false) = false
       -- data_proxima_acao é text livre no schema atual e vem '' com
       -- frequência. Só aceita o que realmente parece uma data ISO.
       and l.data_proxima_acao ~ '^\d{4}-\d{2}-\d{2}'
       and substring(l.data_proxima_acao from 1 for 10)::date <= current_date
       and coalesce(l.status, '') not in ('Fechado', 'Perdido', 'Convertido')
       -- Não insiste com quem pediu pra sair.
       and not exists (
         select 1 from public.whatsapp_contatos wc
          where wc.user_id = l.user_id
            and wc.lead_id = l.id
            and wc.opt_out
       )
  loop
    continue when wa_normalizar_telefone(r.telefone) is null;

    insert into public.whatsapp_fila (
      user_id, wa_id, template_nome, template_params,
      agendado_para, automacao, referencia_tipo, referencia_id, dedupe_key
    )
    values (
      r.user_id,
      wa_normalizar_telefone(r.telefone),
      wa_template_de(r.user_id, 'followup_lead', 'followup_lead'),
      jsonb_build_array(wa_primeiro_nome(r.nome)),
      wa_proximo_horario_permitido(r.user_id, now()),
      'followup_lead',
      'lead',
      r.id,
      -- Inclui a data no dedupe: se o Emerson reagendar a próxima ação,
      -- um novo follow-up é permitido; no mesmo dia, só um.
      'followup:' || r.id || ':' || substring(r.data_proxima_acao from 1 for 10)
    )
    on conflict (user_id, dedupe_key) do nothing;

    if found then
      inseridos := inseridos + 1;
    end if;
  end loop;

  return inseridos;
end;
$$;


-- =====================================================================
-- 4 e 5. Questionários: envio do link e cobrança de quem não respondeu
-- =====================================================================
create or replace function public.wa_agendar_questionarios()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r         record;
  inseridos int := 0;
  url_base  text;
begin
  -- Envio inicial do link
  for r in
    select e.id, e.user_id, e.token, e.prazo, p.nome, p.telefone
      from public.questionario_envios e
      join public.patients p on p.id = e.patient_id and p.user_id = e.user_id
      join public.whatsapp_config c on c.user_id = e.user_id and c.ativo
     where wa_automacao_ativa(e.user_id, 'envio_questionario')
       and e.status = 'enviado'
       and e.created_at > now() - interval '2 days'
  loop
    continue when wa_normalizar_telefone(r.telefone) is null;

    select coalesce(config ->> 'url_base', 'https://app.denutriparanutri.com.br/q/')
      into url_base
      from public.whatsapp_automacoes
     where user_id = r.user_id and chave = 'envio_questionario';

    insert into public.whatsapp_fila (
      user_id, wa_id, template_nome, template_params,
      agendado_para, automacao, referencia_tipo, referencia_id, dedupe_key
    )
    values (
      r.user_id,
      wa_normalizar_telefone(r.telefone),
      wa_template_de(r.user_id, 'envio_questionario', 'envio_questionario'),
      jsonb_build_array(wa_primeiro_nome(r.nome), url_base || r.token),
      wa_proximo_horario_permitido(r.user_id, now()),
      'envio_questionario',
      'questionario_envio',
      r.id,
      'questionario:' || r.id
    )
    on conflict (user_id, dedupe_key) do nothing;

    if found then
      inseridos := inseridos + 1;
    end if;
  end loop;

  -- Cobrança 24h antes do prazo, só pra quem ainda não respondeu
  for r in
    select e.id, e.user_id, e.token, p.nome, p.telefone
      from public.questionario_envios e
      join public.patients p on p.id = e.patient_id and p.user_id = e.user_id
      join public.whatsapp_config c on c.user_id = e.user_id and c.ativo
     where wa_automacao_ativa(e.user_id, 'cobranca_questionario')
       and e.status = 'enviado'
       and e.prazo between now() + interval '20 hours' and now() + interval '28 hours'
       and not exists (
         select 1 from public.questionario_respostas qr where qr.envio_id = e.id
       )
  loop
    continue when wa_normalizar_telefone(r.telefone) is null;

    select coalesce(config ->> 'url_base', 'https://app.denutriparanutri.com.br/q/')
      into url_base
      from public.whatsapp_automacoes
     where user_id = r.user_id and chave = 'envio_questionario';

    insert into public.whatsapp_fila (
      user_id, wa_id, template_nome, template_params,
      agendado_para, automacao, referencia_tipo, referencia_id, dedupe_key
    )
    values (
      r.user_id,
      wa_normalizar_telefone(r.telefone),
      wa_template_de(r.user_id, 'cobranca_questionario', 'cobranca_questionario'),
      jsonb_build_array(wa_primeiro_nome(r.nome), url_base || r.token),
      wa_proximo_horario_permitido(r.user_id, now()),
      'cobranca_questionario',
      'questionario_envio',
      r.id,
      'cobranca_quest:' || r.id
    )
    on conflict (user_id, dedupe_key) do nothing;

    if found then
      inseridos := inseridos + 1;
    end if;
  end loop;

  return inseridos;
end;
$$;


-- ---------------------------------------------------------------------
-- Ponto de entrada único, chamado pelo worker
-- ---------------------------------------------------------------------
create or replace function public.wa_agendar_todas()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return jsonb_build_object(
    'lembretes',     public.wa_agendar_lembretes_consulta(),
    'followups',     public.wa_agendar_followup_leads(),
    'questionarios', public.wa_agendar_questionarios()
  );
end;
$$;

-- Estas funções são SECURITY DEFINER: rodam com os privilégios do dono e
-- ignoram RLS. Revogar de anon/authenticated NÃO basta, porque o Postgres
-- concede EXECUTE a PUBLIC por padrão — é de PUBLIC que precisa revogar.
-- Só o worker (service_role) pode chamá-las.
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.wa_agendar_todas()',
    'public.wa_agendar_lembretes_consulta()',
    'public.wa_agendar_followup_leads()',
    'public.wa_agendar_questionarios()'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;


-- =====================================================================
-- Agendamento no pg_cron
--
-- ANTES DE RODAR, troque:
--   <PROJECT_REF>  -> a ref do seu projeto Supabase
--   <CRON_SECRET>  -> o mesmo valor do secret CRON_SECRET
--
-- Dica: guarde o segredo no Vault em vez de deixar em texto no job:
--   select vault.create_secret('valor-aqui', 'wa_cron_secret');
-- =====================================================================

select cron.unschedule('whatsapp-worker')
 where exists (select 1 from cron.job where jobname = 'whatsapp-worker');

select cron.schedule(
  'whatsapp-worker',
  '*/10 * * * *',          -- a cada 10 minutos
  $cron$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/whatsapp-worker',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cron$
);
