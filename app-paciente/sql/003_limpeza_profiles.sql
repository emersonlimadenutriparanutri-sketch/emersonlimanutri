-- =====================================================================
-- App do Paciente — Fase 0
-- 003_limpeza_profiles.sql — remove policies redundantes e fecha o anon
--
-- CONTEXTO
-- A 001 só removia policies de SELECT, então as de INSERT e UPDATE
-- anteriores sobreviveram e ficaram duplicadas com as novas.
--
-- Foram conferidas uma a uma antes de escrever este arquivo:
--
--   INSERT · "…inserir seu próprio perfil"   with_check (auth.uid() = id)
--   INSERT · profiles_insert_own             with_check (id = auth.uid())
--
--   UPDATE · "…atualizar seu próprio perfil" using (auth.uid() = id), with_check NULL
--   UPDATE · profiles_update_own             using (id = auth.uid()), with_check (id = auth.uid())
--
-- São equivalentes. Detalhe do Postgres que confirma isso: numa policy
-- de UPDATE sem WITH CHECK, a expressão do USING vale também como
-- check. Então a antiga não era mais ampla que a nova — nenhuma delas
-- estava mantendo buraco aberto. É limpeza, não correção.
--
-- Rode depois da 001. É idempotente.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Deixar só as três policies desenhadas
--
-- Remove por exclusão em vez de por nome: os nomes antigos estão em
-- português e chegaram aqui com variações de acento e artigo, o que
-- torna `drop policy if exists '<nome>'` frágil — erra o nome e o
-- comando não faz nada, silenciosamente.
--
-- Assim, qualquer policy que não seja uma das três nossas sai, e o log
-- registra o que saiu.
-- ---------------------------------------------------------------------
do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename  = 'profiles'
      and policyname not in (
        'profiles_select_own',
        'profiles_update_own',
        'profiles_insert_own'
      )
  loop
    raise notice 'Removendo policy redundante: %', p.policyname;
    execute format('drop policy %I on public.profiles', p.policyname);
  end loop;
end;
$$;


-- ---------------------------------------------------------------------
-- 2. Tirar o anon de is_platform_admin
--
-- Usuário deslogado nunca vai ser admin, então não há motivo para ele
-- poder executar a função. `authenticated` continua podendo — isso é
-- obrigatório, porque a policy de profiles chama a função em nome do
-- usuário logado. Sem isso, ninguém lê o próprio perfil.
--
-- Nota: o linter de segurança avisa sobre funções SECURITY DEFINER
-- executáveis por authenticated. No caso desta o aviso é esperado e ela
-- é segura: tem search_path fixo, não recebe parâmetro nenhum (então
-- não dá para sondar linha alheia) e devolve só um booleano sobre quem
-- está chamando.
-- ---------------------------------------------------------------------
revoke execute on function public.is_platform_admin() from anon;


-- ---------------------------------------------------------------------
-- 3. Estado final — devem sobrar exatamente três policies
-- ---------------------------------------------------------------------
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'profiles'
order by cmd, policyname;
