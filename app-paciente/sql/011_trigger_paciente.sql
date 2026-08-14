-- =====================================================================
-- App do Paciente — Fase 1
-- 011_trigger_paciente.sql — paciente não vira nutricionista
--
-- O PROBLEMA
-- Duas triggers disparam a cada insert em auth.users:
--
--   on_auth_user_created           → handle_new_user()          → profiles
--   on_auth_user_created_features  → handle_new_user_features() → user_features
--
-- Quando o primeiro paciente se cadastrar, ele ganharia uma linha em
-- profiles (virando um "nutricionista" na contagem de assinantes) e
-- uma em user_features (entrando no controle de aprovação). Nenhuma
-- das duas faz sentido para um paciente.
--
-- A CORREÇÃO
-- Um desvio no topo de cada função quando o usuário nasce marcado como
-- paciente. O resto do corpo é IDÊNTICO ao que está em produção hoje —
-- comparado linha a linha com pg_get_functiondef antes de escrever.
--
-- POR QUE raw_app_meta_data E NÃO raw_user_meta_data
-- user_metadata é gravável pelo próprio usuário no cadastro; app_metadata
-- só por service_role. Como quem marca role='patient' é a Edge Function
-- de aceite de convite, a marca precisa estar no campo que o usuário não
-- controla. Se o campo estiver ausente, o coalesce devolve '' e a função
-- se comporta exatamente como hoje — o padrão continua sendo
-- "é nutricionista".
--
-- QUANDO APLICAR
-- Antes de existir o primeiro paciente. Depois disso vira limpeza de
-- linha órfã em vez de prevenção.
--
-- Rode junto com a 010. É idempotente.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. profiles — só para nutricionista
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Paciente do app do paciente não é nutricionista: sem linha em profiles.
  if coalesce(new.raw_app_meta_data->>'role', '') = 'patient' then
    return new;
  end if;

  INSERT INTO public.profiles (id, email, nome_completo, telefone, instagram)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nome_completo', ''),
    COALESCE(NEW.raw_user_meta_data->>'telefone', ''),
    COALESCE(NEW.raw_user_meta_data->>'instagram', '')
  );
  RETURN NEW;
end;
$function$;


-- ---------------------------------------------------------------------
-- 2. user_features — só para nutricionista
--
-- user_features é o controle de aprovação/assinatura (é o que
-- is_approved_user consulta). Paciente não entra nesse fluxo.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user_features()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if coalesce(new.raw_app_meta_data->>'role', '') = 'patient' then
    return new;
  end if;

  INSERT INTO public.user_features (user_id) VALUES (NEW.id);
  RETURN NEW;
end;
$function$;


-- ---------------------------------------------------------------------
-- 3. Verificação
--
-- As triggers não são recriadas: continuam apontando para as mesmas
-- funções, que agora têm o desvio. Esta consulta confirma que as duas
-- seguem no lugar.
-- ---------------------------------------------------------------------
select tgname, tgrelid::regclass as tabela, tgenabled
from pg_trigger
where tgname in ('on_auth_user_created', 'on_auth_user_created_features');

-- E que o desvio está presente nas duas funções:
select proname,
       prosrc like '%raw_app_meta_data%' as tem_desvio_paciente
from pg_proc
where proname in ('handle_new_user', 'handle_new_user_features');
