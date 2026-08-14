# Prompt para a Lovable — Fase 0.1

Use este texto quando não houver acesso ao SQL Editor do Supabase. Copie tudo
dentro do bloco e cole na Lovable do app do nutricionista.

**Diferenças em relação ao `sql/001_profiles_rls.sql`:**

- A seção de rollback foi removida. No arquivo original ela é comentário, mas
  contém `create policy ... using (true)` escrito por extenso — e há risco de a
  Lovable tratar aquilo como instrução e reabrir o vazamento. O rollback
  continua disponível no arquivo original, para uso manual.
- As instruções no topo travam o escopo: só migration, nada de mexer no código
  do app.

---

```
Preciso que você aplique uma migration no Supabase deste projeto.

REGRAS IMPORTANTES:
1. Execute o SQL abaixo EXATAMENTE como está escrito. Não altere, não
   simplifique e não "melhore" nenhuma policy — o desenho é intencional.
2. NÃO altere nenhum arquivo de código do app. Esta tarefa é só banco de dados.
3. Se alguma tela do app parar de funcionar depois disso, NÃO conserte por
   conta própria. Apenas me diga qual tela e qual erro apareceu.
4. Ao terminar, me mostre o resultado da consulta final (a lista de policies).

CONTEXTO: hoje qualquer usuário autenticado consegue ler a tabela profiles
inteira — nome, e-mail e telefone de 148 nutricionistas de outras contas. Esta
migration corrige isso, mantendo o acesso de administrador da plataforma.

SQL:

-- 1. Allowlist de administradores da plataforma.
-- RLS ligada e zero policies de propósito: nessa combinação ninguém lê nem
-- escreve pela API do app, só service_role. Assim ninguém se promove a admin
-- de dentro do produto.
create table if not exists public.platform_admins (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins a
    where a.user_id = auth.uid()
  );
$$;

-- 1.1 Emerson Lima Silva entra como admin.
-- profiles.id é o id do usuário no Auth, então este id serve direto.
insert into public.platform_admins (user_id)
values ('281b6d15-1b04-432e-a162-d06988887bcc')
on conflict (user_id) do nothing;

-- 2. Trancar profiles. A comparação correta é id = auth.uid():
-- profiles.id É o id do Auth, não existe coluna user_id nesta tabela.
alter table public.profiles enable row level security;

-- Remove as policies de SELECT existentes, quaisquer que sejam os nomes.
-- Mexe só em SELECT; INSERT e UPDATE são recriadas logo abaixo.
do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename  = 'profiles'
      and cmd        = 'SELECT'
  loop
    raise notice 'Removendo policy de SELECT: %', p.policyname;
    execute format('drop policy %I on public.profiles', p.policyname);
  end loop;
end;
$$;

create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid() or public.is_platform_admin());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles
  for insert
  to authenticated
  with check (id = auth.uid());

-- 3. Me mostre o resultado desta consulta ao terminar.
-- Devem aparecer exatamente três policies.
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'profiles'
order by cmd, policyname;
```

---

## Depois que a Lovable aplicar

O `sql/002_verificacao.sql` provavelmente **não** vai rodar por lá: ele usa
`begin … rollback` com troca de papel, que o executor de migration da Lovable
normalmente não aceita. Guarde-o para quando o acesso ao painel do Supabase
estiver resolvido.

A verificação possível agora é outra, e é a que mais importa na prática:

1. **A consulta final da migration.** Devem aparecer exatamente três policies —
   `profiles_select_own`, `profiles_update_own`, `profiles_insert_own`. Se
   sobrou alguma outra de SELECT, o vazamento continua aberto.
2. **O app de pé.** Entre como nutricionista e navegue: lista de pacientes,
   jornada, agenda, financeiro, edição de perfil. Se alguma tela quebrar, ela
   lia `profiles` de outras contas — e a correção é uma view de nome e CRN, não
   reabrir a tabela.
3. **O caminho de admin.** Dá para conferir pela conexão MCP do app: uma leitura
   de `profiles` como o nutricionista autenticado deve devolver as 148 linhas.
   Se devolver 1, o insert em `platform_admins` não pegou.

O que fica pendente até haver acesso ao painel: a prova de que um nutricionista
comum vê só a própria linha. Os testes 1, 3 e 4 do `002` cobrem isso e valem ser
rodados depois — a migration estar aplicada não substitui essa checagem.
