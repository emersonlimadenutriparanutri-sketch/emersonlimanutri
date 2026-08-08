-- =====================================================================
-- De Nutri para Nutri — Integração WhatsApp Cloud API (Meta)
-- 001_schema.sql — tabelas, índices e funções auxiliares
--
-- Rode este arquivo INTEIRO no SQL Editor do Supabase.
-- É idempotente: pode rodar de novo sem quebrar nada.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Normalização de telefone -> E.164 sem o '+' (formato que a Meta usa)
--
-- O banco hoje tem telefone em 3 formatos diferentes:
--   '19992390247'      (DDD + celular, sem país)
--   '55 61 9943-2661'  (com país, com espaços e hífen)
--   '(61) 99679-8718'  (com parênteses)
-- Esta função converte todos para '5561996798718'.
--
-- OBS sobre o 9º dígito: números BR antigos podem estar cadastrados com
-- 8 dígitos. A função devolve o número como está (55+DDD+8 dígitos); o
-- wa_id canônico verdadeiro só é conhecido quando a Meta responde. Por
-- isso o webhook SEMPRE grava o wa_id que a Meta devolve, e a partir do
-- primeiro contato passamos a usar esse valor em vez do telefone bruto.
-- ---------------------------------------------------------------------
create or replace function public.wa_normalizar_telefone(p_telefone text)
returns text
language plpgsql
immutable
as $$
declare
  d text;
begin
  if p_telefone is null then
    return null;
  end if;

  -- mantém só dígitos
  d := regexp_replace(p_telefone, '\D', '', 'g');

  if d = '' then
    return null;
  end if;

  -- remove zeros à esquerda (ex.: '061...' de discagem interurbana)
  d := ltrim(d, '0');

  -- já veio com código do país (55 + DDD(2) + 8 ou 9 dígitos)
  if left(d, 2) = '55' and length(d) in (12, 13) then
    return d;
  end if;

  -- veio só com DDD (2) + 8 ou 9 dígitos
  if length(d) in (10, 11) then
    return '55' || d;
  end if;

  -- qualquer outro formato: não confiável para disparo automático
  return null;
end;
$$;

comment on function public.wa_normalizar_telefone(text) is
  'Converte telefone em formato livre para E.164 sem "+" (ex.: 5561996798718). Retorna NULL se não for possível normalizar com segurança.';


-- ---------------------------------------------------------------------
-- whatsapp_config — 1 linha por nutricionista
--
-- ATENÇÃO: o access token NÃO fica aqui. Ele vive em Supabase Secrets
-- (WHATSAPP_TOKEN). Token em tabela é vazamento esperando pra acontecer.
-- ---------------------------------------------------------------------
create table if not exists public.whatsapp_config (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  phone_number_id      text not null,           -- ID do número na Cloud API
  waba_id              text,                    -- WhatsApp Business Account ID
  numero_exibicao      text,                    -- '+55 61 99999-9999' (só pra UI)
  ativo                boolean not null default false,
  -- Janela educada de envio. Nada de automação às 3h da manhã.
  janela_envio_inicio  time not null default '08:00',
  janela_envio_fim     time not null default '20:00',
  fuso                 text not null default 'America/Sao_Paulo',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create unique index if not exists whatsapp_config_phone_number_id_idx
  on public.whatsapp_config (phone_number_id);


-- ---------------------------------------------------------------------
-- whatsapp_contatos — identidade + consentimento (LGPD) + janela de 24h
-- ---------------------------------------------------------------------
create table if not exists public.whatsapp_contatos (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  wa_id                   text not null,        -- E.164 sem '+', canônico da Meta
  telefone_original       text,
  nome                    text,
  lead_id                 uuid references public.leads(id) on delete set null,
  paciente_id             uuid references public.patients(id) on delete set null,

  -- Consentimento. Dado de saúde é dado sensível na LGPD (art. 5º, II):
  -- sem opt-in registrado, não sai mensagem de MARKETING.
  opt_in                  boolean not null default false,
  opt_in_em               timestamptz,
  opt_in_origem           text,                 -- 'mensagem_recebida' | 'quiz_site' | 'cadastro_manual' | 'contrato'
  opt_out                 boolean not null default false,
  opt_out_em              timestamptz,

  -- Base da janela de 24h da Meta: dentro dela pode texto livre,
  -- fora dela SÓ template aprovado.
  ultima_msg_recebida_em  timestamptz,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint whatsapp_contatos_user_wa_id_key unique (user_id, wa_id)
);

create index if not exists whatsapp_contatos_lead_idx     on public.whatsapp_contatos (user_id, lead_id);
create index if not exists whatsapp_contatos_paciente_idx on public.whatsapp_contatos (user_id, paciente_id);


-- ---------------------------------------------------------------------
-- whatsapp_mensagens — log completo (entrada e saída)
-- ---------------------------------------------------------------------
create table if not exists public.whatsapp_mensagens (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  contato_id       uuid references public.whatsapp_contatos(id) on delete cascade,
  wa_id            text not null,
  direcao          text not null check (direcao in ('entrada', 'saida')),
  tipo             text not null default 'text',   -- text | template | document | image | audio | interactive
  conteudo         text,
  template_nome    text,
  template_params  jsonb,
  midia_id         text,
  -- wamid é o ID da mensagem na Meta. UNIQUE porque a Meta reentrega
  -- webhooks; sem isso a mesma mensagem entra 2x no histórico.
  wamid            text unique,
  status           text,                            -- enviada | entregue | lida | falhou
  erro             jsonb,
  automacao        text,                            -- qual automação gerou (null = manual)
  referencia_tipo  text,                            -- 'agenda_task' | 'lead' | 'questionario' | ...
  referencia_id    uuid,
  created_at       timestamptz not null default now()
);

create index if not exists whatsapp_mensagens_contato_idx on public.whatsapp_mensagens (user_id, contato_id, created_at desc);
create index if not exists whatsapp_mensagens_wa_id_idx   on public.whatsapp_mensagens (user_id, wa_id, created_at desc);


-- ---------------------------------------------------------------------
-- whatsapp_fila — outbox
--
-- Nada é enviado direto pelo cron. O cron ENFILEIRA, o worker DESPACHA.
-- Isso dá retry, dedupe e auditoria de graça.
-- ---------------------------------------------------------------------
create table if not exists public.whatsapp_fila (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  contato_id       uuid references public.whatsapp_contatos(id) on delete cascade,
  wa_id            text not null,

  template_nome    text,                          -- obrigatório se fora da janela de 24h
  template_params  jsonb not null default '[]'::jsonb,
  texto            text,                          -- usado só se dentro da janela de 24h

  agendado_para    timestamptz not null default now(),
  status           text not null default 'pendente'
                     check (status in ('pendente', 'enviando', 'enviado', 'falhou', 'cancelado')),
  tentativas       int not null default 0,
  ultimo_erro      text,

  automacao        text not null,
  referencia_tipo  text,
  referencia_id    uuid,

  -- Chave de deduplicação. Ex.: 'lembrete_24h:<agenda_task_id>'.
  -- É o que permite o cron rodar de 10 em 10 minutos sem mandar
  -- o mesmo lembrete 6 vezes por hora.
  dedupe_key       text not null,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint whatsapp_fila_dedupe_key_unique unique (user_id, dedupe_key)
);

create index if not exists whatsapp_fila_pendentes_idx
  on public.whatsapp_fila (status, agendado_para)
  where status = 'pendente';


-- ---------------------------------------------------------------------
-- whatsapp_automacoes — liga/desliga por automação
--
-- Tudo nasce DESLIGADO. O Emerson liga uma de cada vez, depois de testar
-- no próprio número. Ligar as 5 de uma vez é como o número vira spam.
-- ---------------------------------------------------------------------
create table if not exists public.whatsapp_automacoes (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  chave          text not null,          -- ver 003_cron.sql para a lista
  ativo          boolean not null default false,
  template_nome  text,
  config         jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint whatsapp_automacoes_user_chave_key unique (user_id, chave)
);


-- ---------------------------------------------------------------------
-- Trigger de updated_at
-- ---------------------------------------------------------------------
create or replace function public.wa_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'whatsapp_config', 'whatsapp_contatos', 'whatsapp_fila', 'whatsapp_automacoes'
  ] loop
    execute format('drop trigger if exists %I on public.%I', 'wa_touch_' || t, t);
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function public.wa_touch_updated_at()',
      'wa_touch_' || t, t
    );
  end loop;
end;
$$;


-- ---------------------------------------------------------------------
-- Helper: o contato está dentro da janela de 24h da Meta?
-- ---------------------------------------------------------------------
create or replace function public.wa_dentro_janela_24h(p_contato_id uuid)
returns boolean
language sql
stable
as $$
  select coalesce(ultima_msg_recebida_em > now() - interval '24 hours', false)
    from public.whatsapp_contatos
   where id = p_contato_id;
$$;
