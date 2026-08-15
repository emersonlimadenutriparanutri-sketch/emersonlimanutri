-- =====================================================================
-- App do Paciente — Fase 1
-- 014_paciente_sem_perfil.sql — corrige o que a 011 não conseguia pegar
--
-- O QUE ACONTECEU
-- A 011 pôs um desvio no topo de handle_new_user e
-- handle_new_user_features: se raw_app_meta_data->>'role' = 'patient',
-- não cria linha. Testado com uma conta real, não funcionou.
--
-- O motivo, confirmado no banco: o GoTrue insere a linha em auth.users
-- PRIMEIRO e aplica o app_metadata depois, num update. As triggers são
-- AFTER INSERT, então elas leem um campo que ainda está vazio. Depois o
-- campo chega — o usuário de teste tem "role": "patient" gravado — mas
-- as linhas em profiles e user_features já foram criadas.
--
-- Nenhuma reescrita da condição resolveria: o dado não existe no
-- instante em que a trigger roda.
--
-- A CORREÇÃO
-- Reagir ao momento em que a marca aparece, em vez do insert. Uma
-- trigger em UPDATE de raw_app_meta_data remove as linhas assim que o
-- usuário passa a ser paciente.
--
-- Vale mais que limpar dentro da Edge Function: é invariante de banco,
-- e vale para qualquer caminho que venha a criar paciente — não só o
-- fluxo de convite atual.
--
-- Os desvios da 011 ficam. Não disparam hoje, mas evitam criar-e-apagar
-- caso o GoTrue passe a gravar app_metadata já no insert.
--
-- Rode depois da 013. É idempotente.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. A regra: paciente não tem perfil de nutricionista
--
-- Envolvida em exception handler de propósito. Esta função roda dentro
-- do update de auth.users — se ela levantar erro (uma foreign key
-- inesperada apontando para profiles, por exemplo), o update falha e o
-- login do usuário quebra junto. Linha órfã é problema pequeno e
-- detectável; auth quebrado não é.
-- ---------------------------------------------------------------------
create or replace function public.remover_perfil_de_paciente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.raw_app_meta_data->>'role', '') <> 'patient' then
    return new;
  end if;

  begin
    delete from public.profiles      where id      = new.id;
    delete from public.user_features where user_id = new.id;
  exception when others then
    raise warning 'nao foi possivel limpar perfil de paciente %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

revoke execute on function public.remover_perfil_de_paciente() from public;
revoke execute on function public.remover_perfil_de_paciente() from anon;
revoke execute on function public.remover_perfil_de_paciente() from authenticated;


drop trigger if exists on_auth_user_virou_paciente on auth.users;

create trigger on_auth_user_virou_paciente
  after insert or update of raw_app_meta_data on auth.users
  for each row
  execute function public.remover_perfil_de_paciente();


-- ---------------------------------------------------------------------
-- 2. Limpar o que a conta de teste deixou para trás
--
-- Uma linha em cada, do teste de aceite do convite. Escrito de forma
-- genérica: apaga perfil e features de QUALQUER usuário marcado como
-- paciente, então serve também se aparecerem outros antes de a trigger
-- entrar em vigor.
-- ---------------------------------------------------------------------
delete from public.profiles p
where exists (
  select 1 from auth.users u
  where u.id = p.id
    and u.raw_app_meta_data->>'role' = 'patient'
);

delete from public.user_features f
where exists (
  select 1 from auth.users u
  where u.id = f.user_id
    and u.raw_app_meta_data->>'role' = 'patient'
);


-- ---------------------------------------------------------------------
-- 3. Verificação
--
-- Esperado agora: 1, 1, 0, 0, aceito
-- ---------------------------------------------------------------------
select
  (select count(*) from public.patient_users)                          as vinculos,
  (select count(*) from auth.users u
     where u.raw_app_meta_data->>'role' = 'patient')                   as contas_paciente,
  (select count(*) from public.profiles p
     join auth.users u on u.id = p.id
     where u.raw_app_meta_data->>'role' = 'patient')                   as perfis_indevidos,
  (select count(*) from public.user_features f
     join auth.users u on u.id = f.user_id
     where u.raw_app_meta_data->>'role' = 'patient')                   as features_indevidas,
  (select status from public.patient_invites
     order by created_at desc limit 1)                                 as ultimo_convite;
