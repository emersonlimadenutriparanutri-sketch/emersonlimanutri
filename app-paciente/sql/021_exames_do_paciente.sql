-- =====================================================================
-- App do Paciente — Fase 2
-- 021_exames_do_paciente.sql — o paciente anexa os próprios exames
--
-- Primeira escrita do paciente em storage. Até aqui ele só lia.
--
-- Upload por usuário externo é a superfície de ataque mais óbvia do app
-- inteiro, então as restrições ficam no bucket — validadas pelo
-- servidor — e não na tela. Validação só no cliente não vale nada:
-- qualquer pessoa com a chave anon chama a API de storage direto.
--
-- Rode depois da 020. É idempotente.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. O bucket, privado desde o nascimento
--
-- Diferente de avaliacoes-fotos, que nasceu público e teve de ser
-- corrigido. Laudo de exame é dado de saúde: nunca deve ser alcançável
-- por quem tem só a URL.
--
-- ⚠ OS LIMITES ABAIXO NÃO FORAM APLICADOS.
--
-- O Lovable Cloud bloqueia UPDATE direto em storage.buckets, e as
-- ferramentas de Storage disponíveis só criam bucket e alteram a flag
-- public. Sem painel do Supabase, não há caminho. O UPDATE fica no
-- arquivo para quando houver acesso direto — hoje ele roda sem efeito.
--
-- Consequência: tamanho e tipo de arquivo são validados apenas no app
-- do paciente.
--
-- O risco disso é menor do que "validação no cliente" costuma sugerir.
-- A policy de INSERT exige paciente_dono_do_prefixo, então não é uma
-- porta aberta a qualquer um com a chave anon: só um paciente
-- autenticado escreve, e só na própria pasta. O que sobra é abuso por
-- usuário legítimo — arquivo grande demais ou de tipo estranho na
-- pasta dele. Desperdício e incômodo, não vazamento.
--
-- Não vale construir uma Edge Function de upload por causa disso: o
-- arquivo passaria inteiro por ela, num plano Tiny, para proteger
-- contra um paciente abusando do próprio espaço.
--
-- Limites pretendidos, quando for possível aplicá-los:
--   20 MB   — laudo com imagens costuma passar de 5 MB; 20 dá folga
--             sem virar upload de vídeo
--   tipos   — PDF e imagem. Nada de zip, doc ou executável.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('paciente-exames', 'paciente-exames', false)
on conflict (id) do nothing;

update storage.buckets
set
  public             = false,
  file_size_limit    = 20971520,
  allowed_mime_types = array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
where id = 'paciente-exames';


-- ---------------------------------------------------------------------
-- 2. Quem pode no prefixo
--
-- Convenção de caminho:  {patient_id}/{arquivo}
--
-- As duas funções abaixo recebem o primeiro segmento do caminho e
-- respondem se o chamador tem direito a ele.
--
-- O bloco de exceção existe porque o caminho vem do cliente: alguém
-- pode enviar "qualquer-coisa/arquivo.pdf", e um cast direto para uuid
-- levantaria erro em vez de negar. Erro numa policy de storage vira
-- mensagem estranha e, pior, permite sondar o sistema pela diferença
-- entre "negado" e "quebrou".
-- ---------------------------------------------------------------------
create or replace function public.paciente_dono_do_prefixo(p_prefixo text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v uuid;
begin
  begin
    v := p_prefixo::uuid;
  exception when others then
    return false;
  end;

  return public.is_patient_of(v);
end;
$$;


create or replace function public.nutri_dono_do_prefixo(p_prefixo text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v uuid;
begin
  begin
    v := p_prefixo::uuid;
  exception when others then
    return false;
  end;

  return exists (
    select 1 from public.patients p
    where p.id = v
      and p.user_id = auth.uid()
  );
end;
$$;

revoke execute on function public.paciente_dono_do_prefixo(text) from public, anon;
revoke execute on function public.nutri_dono_do_prefixo(text)    from public, anon;
grant  execute on function public.paciente_dono_do_prefixo(text) to authenticated;
grant  execute on function public.nutri_dono_do_prefixo(text)    to authenticated;


-- ---------------------------------------------------------------------
-- 3. Policies de storage
--
-- O paciente envia, lê e apaga dentro da própria pasta. Apagar é
-- proposital: quem manda a foto errada precisa poder corrigir sem
-- pedir ajuda.
--
-- O nutricionista lê os exames dos pacientes dele. Não apaga — laudo é
-- documento clínico, e remoção deve ser ato deliberado, não um clique.
-- ---------------------------------------------------------------------
drop policy if exists paciente_exames_insert on storage.objects;
create policy paciente_exames_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'paciente-exames'
    and public.paciente_dono_do_prefixo((storage.foldername(name))[1])
  );

drop policy if exists paciente_exames_select_paciente on storage.objects;
create policy paciente_exames_select_paciente
  on storage.objects for select to authenticated
  using (
    bucket_id = 'paciente-exames'
    and public.paciente_dono_do_prefixo((storage.foldername(name))[1])
  );

drop policy if exists paciente_exames_delete_paciente on storage.objects;
create policy paciente_exames_delete_paciente
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'paciente-exames'
    and public.paciente_dono_do_prefixo((storage.foldername(name))[1])
  );

drop policy if exists paciente_exames_select_nutri on storage.objects;
create policy paciente_exames_select_nutri
  on storage.objects for select to authenticated
  using (
    bucket_id = 'paciente-exames'
    and public.nutri_dono_do_prefixo((storage.foldername(name))[1])
  );


-- ---------------------------------------------------------------------
-- 4. O registro
--
-- O arquivo no bucket é só o arquivo. Esta tabela guarda o que o
-- paciente informou sobre ele — data da coleta, laboratório, uma
-- observação — e é o que aparece na tela do nutricionista.
--
-- Separada de analise_exames de propósito: aquela é a análise feita
-- pelo profissional. Esta é o que o paciente entregou.
-- ---------------------------------------------------------------------
create table if not exists public.paciente_exames (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references public.patients(id) on delete cascade,
  nome_arquivo text not null,
  storage_path text not null,
  data_exame   date,
  laboratorio  text,
  observacao   text,
  enviado_em   timestamptz not null default now()
);

create index if not exists paciente_exames_patient_idx
  on public.paciente_exames (patient_id, enviado_em desc);

alter table public.paciente_exames enable row level security;

drop policy if exists paciente_exames_paciente_all on public.paciente_exames;
create policy paciente_exames_paciente_all
  on public.paciente_exames
  for all
  to authenticated
  using      (public.is_patient_of(patient_id))
  with check (public.is_patient_of(patient_id));

-- O nutricionista lê os exames dos pacientes dele. Sem escrita: quem
-- envia é o paciente.
drop policy if exists paciente_exames_nutri_select on public.paciente_exames;
create policy paciente_exames_nutri_select
  on public.paciente_exames
  for select
  to authenticated
  using (
    exists (
      select 1 from public.patients p
      where p.id = paciente_exames.patient_id
        and p.user_id = auth.uid()
    )
  );


-- ---------------------------------------------------------------------
-- 5. Verificação
-- ---------------------------------------------------------------------
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'paciente-exames';

select policyname, cmd
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'paciente_exames%'
order by cmd, policyname;

select policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'paciente_exames'
order by cmd, policyname;
