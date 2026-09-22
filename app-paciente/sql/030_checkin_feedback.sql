-- =====================================================================
-- App do Paciente — Fase 3
-- 030_checkin_feedback.sql — a volta do check-in semanal
--
-- O QUE JÁ EXISTE E NÃO PRECISA SER FEITO
-- O check-in é um questionário de tipo 'raio-x'. A tela do paciente
-- (fase 2) lista qualquer envio pendente, e a Edge Function
-- questionario-publico grava a resposta, muda o status e marca a tarefa
-- da jornada como concluída. A ida está pronta.
--
-- Por isso NÃO existe aqui a tabela jornada_task_checkins que o plano
-- previa: ela serviria para o paciente marcar tarefa de jornada como
-- feita, e no caso do check-in a própria função já faz isso. Criar a
-- tabela agora seria um segundo registro da mesma informação.
--
-- O QUE FALTA, E É O QUE ESTA MIGRATION CRIA
-- A volta: o nutricionista lê a resposta, escreve o feedback, e o
-- paciente vê.
--
-- Rode depois da 023. É idempotente.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. O feedback
--
-- publicado_em é a coluna que importa. O feedback nasce rascunho e só
-- aparece para o paciente quando o nutricionista publica. Sem isso, ele
-- leria anotação pela metade enquanto ela ainda está sendo escrita — e
-- num acompanhamento nutricional, meia frase mal colocada faz estrago.
--
-- audio_path já entra no schema porque a jornada prevê o HERO-X em
-- áudio (tipoRaioX: "audio") e é assim que o feedback é enviado hoje,
-- por WhatsApp. A tela de gravar/enviar vem depois; a coluna existir
-- agora evita uma migration só para isso.
-- ---------------------------------------------------------------------
create table if not exists public.checkin_feedbacks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id)      on delete cascade,
  patient_id   uuid not null references public.patients(id) on delete cascade,
  resposta_id  uuid references public.questionario_respostas(id) on delete set null,
  semana_ref   date,
  texto        text,
  audio_path   text,
  publicado_em timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists checkin_feedbacks_patient_idx
  on public.checkin_feedbacks (patient_id, created_at desc);

create index if not exists checkin_feedbacks_resposta_idx
  on public.checkin_feedbacks (resposta_id);

comment on column public.checkin_feedbacks.publicado_em is
  'Null enquanto for rascunho. O paciente só enxerga depois de publicado.';


-- ---------------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------------
alter table public.checkin_feedbacks enable row level security;

-- O nutricionista faz tudo no que é dele, inclusive enquanto é rascunho.
drop policy if exists checkin_feedbacks_nutri_all on public.checkin_feedbacks;
create policy checkin_feedbacks_nutri_all
  on public.checkin_feedbacks
  for all
  to authenticated
  using      (user_id = auth.uid())
  with check (user_id = auth.uid());

-- O paciente lê apenas o que foi publicado.
--
-- A condição de publicação fica DENTRO da policy, e não na consulta da
-- tela. Se ficasse só na tela, bastaria um filtro esquecido num ajuste
-- futuro para o rascunho vazar — e o vazamento seria silencioso, sem
-- erro nenhum para denunciar.
drop policy if exists checkin_feedbacks_paciente_select on public.checkin_feedbacks;
create policy checkin_feedbacks_paciente_select
  on public.checkin_feedbacks
  for select
  to authenticated
  using (
    public.is_patient_of(patient_id)
    and publicado_em is not null
  );


-- ---------------------------------------------------------------------
-- 3. Bucket do áudio, privado
--
-- Mesma convenção de caminho dos exames: {patient_id}/{arquivo}, com as
-- funções de prefixo já criadas na 021.
--
-- Aqui quem escreve é o NUTRICIONISTA e quem lê é o paciente — o
-- inverso do bucket de exames.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('checkin-feedback-audio', 'checkin-feedback-audio', false)
on conflict (id) do nothing;

drop policy if exists checkin_audio_insert_nutri on storage.objects;
create policy checkin_audio_insert_nutri
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'checkin-feedback-audio'
    and public.nutri_dono_do_prefixo((storage.foldername(name))[1])
  );

drop policy if exists checkin_audio_select_nutri on storage.objects;
create policy checkin_audio_select_nutri
  on storage.objects for select to authenticated
  using (
    bucket_id = 'checkin-feedback-audio'
    and public.nutri_dono_do_prefixo((storage.foldername(name))[1])
  );

drop policy if exists checkin_audio_delete_nutri on storage.objects;
create policy checkin_audio_delete_nutri
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'checkin-feedback-audio'
    and public.nutri_dono_do_prefixo((storage.foldername(name))[1])
  );

-- O paciente ouve o áudio dos feedbacks dele.
--
-- Não há como amarrar esta policy ao publicado_em: storage não conhece
-- a tabela. A proteção real é que o caminho do arquivo só chega ao
-- paciente através de checkin_feedbacks, que já filtra por publicação.
-- Quem não recebeu o caminho não tem o que pedir.
drop policy if exists checkin_audio_select_paciente on storage.objects;
create policy checkin_audio_select_paciente
  on storage.objects for select to authenticated
  using (
    bucket_id = 'checkin-feedback-audio'
    and public.paciente_dono_do_prefixo((storage.foldername(name))[1])
  );


-- ---------------------------------------------------------------------
-- 4. Verificação
-- ---------------------------------------------------------------------
select policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'checkin_feedbacks'
order by cmd, policyname;

select id, public from storage.buckets where id = 'checkin-feedback-audio';

select policyname, cmd
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'checkin_audio%'
order by cmd, policyname;
