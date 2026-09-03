-- =====================================================================
--  CONECTOR DO CLAUDE (MCP)
--  Cada nutricionista gera os próprios tokens dentro do app. O token é
--  guardado apenas como hash — nem o banco nem o suporte conseguem lê-lo.
-- =====================================================================

create table if not exists public.mcp_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  nome        text not null default 'Claude',
  token_hash  text not null unique,   -- sha256 do token, em hexadecimal
  prefixo     text not null,          -- primeiros caracteres, só para o dono reconhecer
  ultimo_uso  timestamptz,
  revogado    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_mcp_tokens_hash on public.mcp_tokens(token_hash) where revogado = false;

grant select, insert, update, delete on public.mcp_tokens to authenticated;
grant all on public.mcp_tokens to service_role;
alter table public.mcp_tokens enable row level security;

drop policy if exists "own_select" on public.mcp_tokens;
drop policy if exists "own_insert" on public.mcp_tokens;
drop policy if exists "own_update" on public.mcp_tokens;
drop policy if exists "own_delete" on public.mcp_tokens;

create policy "own_select" on public.mcp_tokens for select using (auth.uid() = user_id);
create policy "own_insert" on public.mcp_tokens for insert with check (auth.uid() = user_id);
create policy "own_update" on public.mcp_tokens for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_delete" on public.mcp_tokens for delete using (auth.uid() = user_id);

drop trigger if exists set_updated_at on public.mcp_tokens;
create trigger set_updated_at before update on public.mcp_tokens
  for each row execute function public.set_updated_at();
