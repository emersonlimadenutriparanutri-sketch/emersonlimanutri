-- =====================================================================
-- App do Paciente — Fase 3
-- 031_marcadores_diarios.sql — biofeedback diário do paciente
--
-- POR QUE ISTO EXISTE
-- Hoje o paciente abre o app três vezes antes da consulta e some:
-- anamnese, exames, rastreamento, acabou. Marcador diário é a única
-- coisa que dá motivo para abrir todo dia — e é o que transforma
-- formulário em acompanhamento. De quebra, o feedback semanal deixa de
-- ser escrito no escuro.
--
-- UMA COLUNA POR MARCADOR, NÃO CHAVE-VALOR
-- O conjunto é padrão e pequeno. Acrescentar marcador depois é um
-- ALTER TABLE de uma linha; em troca, média móvel e gráfico saem de
-- uma consulta direta. Tabela genérica daria uma flexibilidade que não
-- será usada e cobraria por ela em toda leitura.
--
-- PESO NÃO ESTÁ AQUI, DE PROPÓSITO
-- Pesagem diária faz mal a boa parte deste público — nas anamneses do
-- próprio banco aparecem compulsão, fome emocional e histórico de
-- tentativas. Peso continua em paciente_medidas, com registro pontual,
-- e nunca como marcador de todo dia.
--
-- Rode depois da 030. É idempotente.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. O registro do dia
--
-- Uma linha por paciente por dia. A tela faz upsert: tocar de novo no
-- mesmo dia corrige, não duplica.
--
-- Todos os marcadores são opcionais. Quem só registra água tem uma
-- linha com água — dia pela metade é melhor que dia nenhum, e a tela
-- nunca deve exigir o conjunto completo para salvar.
-- ---------------------------------------------------------------------
create table if not exists public.paciente_marcadores_diarios (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references public.patients(id) on delete cascade,
  data        date not null,

  agua_copos  smallint check (agua_copos between 0 and 30),
  intestino   text     check (intestino in ('nao_evacuou', 'ressecado', 'normal', 'amolecido', 'diarreia')),
  sono_horas  numeric(3,1) check (sono_horas between 0 and 24),
  energia     smallint check (energia between 1 and 5),
  humor       smallint check (humor between 1 and 5),
  observacao  text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (patient_id, data),

  -- Não se registra o futuro. A folga de um dia evita rejeição por
  -- diferença de fuso: o aparelho manda a data local, o banco compara
  -- com a dele.
  constraint data_nao_futura check (data <= (current_date + 1))
);

create index if not exists marcadores_diarios_patient_idx
  on public.paciente_marcadores_diarios (patient_id, data desc);

comment on table public.paciente_marcadores_diarios is
  'Biofeedback diário registrado pelo paciente. Um toque por marcador; todos opcionais.';

comment on column public.paciente_marcadores_diarios.intestino is
  'nao_evacuou | ressecado | normal | amolecido | diarreia';

comment on column public.paciente_marcadores_diarios.energia is
  '1 a 5, do mais baixo ao mais alto. Mesma escala de humor, para poderem ser lidos juntos.';


-- ---------------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------------
alter table public.paciente_marcadores_diarios enable row level security;

-- O paciente registra e corrige os próprios dias, inclusive apagando —
-- quem marcou errado precisa poder desfazer sem pedir ajuda.
drop policy if exists marcadores_diarios_paciente_all on public.paciente_marcadores_diarios;
create policy marcadores_diarios_paciente_all
  on public.paciente_marcadores_diarios
  for all
  to authenticated
  using      (public.is_patient_of(patient_id))
  with check (public.is_patient_of(patient_id));

-- O nutricionista lê os marcadores dos pacientes dele. Sem escrita:
-- este registro é relato do paciente, e misturar a mão do profissional
-- aqui tornaria impossível saber depois quem marcou o quê.
drop policy if exists marcadores_diarios_nutri_select on public.paciente_marcadores_diarios;
create policy marcadores_diarios_nutri_select
  on public.paciente_marcadores_diarios
  for select
  to authenticated
  using (
    exists (
      select 1 from public.patients p
      where p.id = paciente_marcadores_diarios.patient_id
        and p.user_id = auth.uid()
    )
  );


-- ---------------------------------------------------------------------
-- 3. Verificação
-- ---------------------------------------------------------------------
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'paciente_marcadores_diarios'
order by ordinal_position;

select policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'paciente_marcadores_diarios'
order by cmd, policyname;
