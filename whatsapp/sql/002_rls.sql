-- =====================================================================
-- De Nutri para Nutri — Integração WhatsApp Cloud API (Meta)
-- 002_rls.sql — Row Level Security
--
-- Mesmo padrão do resto do app: cada nutricionista só enxerga as
-- próprias linhas. As Edge Functions que precisam furar isso (o webhook,
-- que chega sem usuário logado) usam a service_role key, que ignora RLS.
-- =====================================================================

alter table public.whatsapp_config     enable row level security;
alter table public.whatsapp_contatos   enable row level security;
alter table public.whatsapp_mensagens  enable row level security;
alter table public.whatsapp_fila       enable row level security;
alter table public.whatsapp_automacoes enable row level security;

-- ---------------------------------------------------------------------
-- Política padrão: dono da linha faz tudo.
-- ---------------------------------------------------------------------
do $$
declare
  t   text;
  col text;
begin
  foreach t in array array[
    'whatsapp_config', 'whatsapp_contatos', 'whatsapp_mensagens',
    'whatsapp_fila', 'whatsapp_automacoes'
  ] loop
    -- whatsapp_config usa user_id como PK; as outras têm coluna user_id.
    col := 'user_id';

    execute format('drop policy if exists %I on public.%I', t || '_owner_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner_delete', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using (%I = auth.uid())',
      t || '_owner_select', t, col
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (%I = auth.uid())',
      t || '_owner_insert', t, col
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (%I = auth.uid()) with check (%I = auth.uid())',
      t || '_owner_update', t, col, col
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (%I = auth.uid())',
      t || '_owner_delete', t, col
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Endurecimento: o histórico de mensagens é registro de comunicação com
-- paciente. Não deve ser editável nem apagável pela UI — só a
-- service_role (webhook/worker) escreve status nele.
-- ---------------------------------------------------------------------
drop policy if exists whatsapp_mensagens_owner_update on public.whatsapp_mensagens;
drop policy if exists whatsapp_mensagens_owner_delete on public.whatsapp_mensagens;
drop policy if exists whatsapp_mensagens_owner_insert on public.whatsapp_mensagens;

-- ---------------------------------------------------------------------
-- Nunca exponha estas tabelas via PostgREST anônimo.
-- ---------------------------------------------------------------------
revoke all on public.whatsapp_config     from anon;
revoke all on public.whatsapp_contatos   from anon;
revoke all on public.whatsapp_mensagens  from anon;
revoke all on public.whatsapp_fila       from anon;
revoke all on public.whatsapp_automacoes from anon;
