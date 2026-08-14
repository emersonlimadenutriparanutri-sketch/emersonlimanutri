-- =====================================================================
-- App do Paciente — Fase 1
-- 012_nutri_publico_funcao.sql — troca a view por função e fecha triggers
--
-- POR QUE MEXER NO QUE ACABOU DE SER CRIADO
-- A 010 criou v_nutri_publico com security_invoker = false, para
-- atravessar a RLS de profiles e devolver só as colunas seguras. Funciona
-- — mas o linter do Supabase marca isso como ERROR, e com razão: view
-- que atravessa RLS é o padrão que mais dá errado, porque o filtro fica
-- escondido na definição e ninguém revisa.
--
-- O problema prático de conviver com um ERROR permanente é que ele vira
-- ruído: no dia em que aparecer um ERROR de verdade, ninguém vai notar.
--
-- Uma função SECURITY DEFINER faz o mesmo trabalho e é o padrão que este
-- projeto já adota em has_role, is_approved_user e
-- can_read_questionario_upload. Mesmo filtro, mesmas colunas, e o alerta
-- cai para o WARN que já é a linha de base daqui.
--
-- Rode depois da 010 e da 011. É idempotente.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Sai a view
--
-- Nada depende dela ainda: foi criada na 010 e nenhuma tela usa.
-- ---------------------------------------------------------------------
drop view if exists public.v_nutri_publico;


-- ---------------------------------------------------------------------
-- 2. Entra a função
--
-- Devolve a identificação profissional do nutricionista de quem o
-- chamador é paciente ativo. Sem e-mail, sem telefone, sem instagram —
-- a proteção de coluna está na lista do RETURNS TABLE, não numa policy.
--
-- Não recebe parâmetro nenhum: o chamador é sempre auth.uid(). Não há
-- como pedir os dados do nutricionista de outra pessoa.
--
-- No app do paciente:  supabase.rpc('meu_nutri')
-- ---------------------------------------------------------------------
create or replace function public.meu_nutri()
returns table (
  id            uuid,
  nome_completo text,
  crn           text,
  especialidade text,
  avatar_url    text
)
language sql
stable
security definer
set search_path = public
as $$
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
$$;

revoke execute on function public.meu_nutri() from public;
revoke execute on function public.meu_nutri() from anon;
grant  execute on function public.meu_nutri() to authenticated;

comment on function public.meu_nutri() is
  'Identificação profissional do nutricionista do paciente autenticado. Sem dados de contato. Sem parâmetro: o chamador é sempre auth.uid().';


-- ---------------------------------------------------------------------
-- 3. Fechar as funções de trigger
--
-- handle_new_user e handle_new_user_features existem para serem
-- disparadas por trigger em auth.users. Ninguém precisa chamá-las por
-- RPC, e o disparo do trigger não depende de EXECUTE do usuário — roda
-- no contexto do dono do trigger.
--
-- Fechar não muda comportamento nenhum e tira duas linhas do relatório
-- do linter, deixando visíveis só os avisos que realmente exigem
-- decisão.
-- ---------------------------------------------------------------------
revoke execute on function public.handle_new_user()          from public;
revoke execute on function public.handle_new_user()          from anon;
revoke execute on function public.handle_new_user()          from authenticated;

revoke execute on function public.handle_new_user_features() from public;
revoke execute on function public.handle_new_user_features() from anon;
revoke execute on function public.handle_new_user_features() from authenticated;


-- ---------------------------------------------------------------------
-- 4. Verificação
--
-- Esperado:
--   meu_nutri                  anon=false  authenticated=true
--   is_patient_of              anon=false  authenticated=true   (precisa: a policy chama)
--   handle_new_user            anon=false  authenticated=false
--   handle_new_user_features   anon=false  authenticated=false
--   has_role                   anon=false  authenticated=true   (precisa)
-- ---------------------------------------------------------------------
select
  p.proname                                                 as funcao,
  has_function_privilege('anon', p.oid, 'EXECUTE')          as anon_pode,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_pode
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'meu_nutri', 'is_patient_of', 'has_role',
    'handle_new_user', 'handle_new_user_features'
  )
order by p.proname;

-- E a view não deve mais existir:
select count(*) as view_ainda_existe
from pg_views
where schemaname = 'public' and viewname = 'v_nutri_publico';
