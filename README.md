# Plataforma de Gestão para Nutricionistas

Aplicação web completa para o consultório de nutrição: funil de leads, prontuário
clínico, jornada do paciente, financeiro, agenda e relatórios assistidos por IA.

Cada nutricionista roda a plataforma **no próprio projeto Supabase e no próprio
domínio** — os dados nunca ficam em uma base compartilhada.

## Stack

| Camada | Tecnologia |
|---|---|
| Front-end | React 18 · Vite · TypeScript · Tailwind CSS · React Router · TanStack Query |
| Back-end | Supabase (Postgres + Auth + Storage + Edge Functions) |
| IA | Claude (Anthropic) via Edge Function — a chave nunca sai do servidor |

## Módulos

- **Dashboard** — pacientes ativos premium e mensal, planos a vencer, leads do mês,
  tarefas pendentes e alerta proativo de TPM/menstruação.
- **Consultório** — abas reordenáveis por drag-and-drop: Leads (CRM kanban de 7 etapas),
  Pacientes, Follow Up, Financeiro, Serviços e Questionários.
- **Central do Paciente** — 9 abas na ordem do atendimento: dados, anamnese,
  rastreamento metabólico, análise de exames, avaliação física, resumo da consulta,
  jornada, Raio-X semanal e evolução.
- **Torre de Controle** — calendário unificado, quadros kanban e mapas mentais.
- **Questionário público** — link por token, sem login, mobile-first.
- **Conector do Claude (MCP)** — cada nutricionista gera o próprio conector e passa a
  consultar o consultório conversando com o Claude. Ver [`docs/CONECTOR-CLAUDE.md`](docs/CONECTOR-CLAUDE.md).

## Instalação

- [`docs/PUBLICAR.md`](docs/PUBLICAR.md) — colocar no ar em um endereço, do zero, com roteiro de demonstração.
- [`docs/INSTALACAO.md`](docs/INSTALACAO.md) — instalação detalhada, passo a passo.
- [`docs/CONECTOR-CLAUDE.md`](docs/CONECTOR-CLAUDE.md) — conectar o Claude ao consultório.
- [`docs/REVENDA.md`](docs/REVENDA.md) — entregar a plataforma para outro nutricionista.
- `supabase/demo/seed-demo.sql` — consultório fictício completo, para demonstrar.
Resumo para quem já conhece Supabase:

```bash
npm install
cp .env.example .env          # preencha URL e anon key do seu projeto
npm run dev
```

No Supabase, rode `supabase/migrations/0001_schema.sql` e depois `0002_seed.sql`
no SQL Editor, e publique as Edge Functions:

```bash
supabase link --project-ref SEU_REF
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy
```

## Testes

Os testes rodam contra um Supabase local de verdade (Postgres, Auth, PostgREST,
Storage e Edge Functions), não contra mocks:

```bash
supabase start     # sobe o stack local
npm run test       # 75 verificações
```

| Suíte | O que cobre |
|---|---|
| `npm run test:rls` | Isolamento entre nutricionistas, escalada de privilégio, acesso anônimo e idempotência do seed |
| `npm run test:mcp` | Protocolo MCP, autenticação por token, superfície de tabelas e isolamento pelo conector |
| `npm run test:e2e` | Fluxo real na interface: login → lead → conversão → jornada → questionário público → financeiro → dashboard |

## Segurança

- Row Level Security em todas as tabelas, com policies `auth.uid() = user_id`.
- Papéis em tabela separada (`user_roles`) e função `has_role` SECURITY DEFINER —
  papel nunca fica no perfil, o que impede escalada de privilégio.
- Novos cadastros entram pendentes até um administrador aprovar.
- Buckets de storage privados, com acesso por pasta do usuário e URLs assinadas.
- Chaves de IA apenas nos secrets do Supabase; o front nunca as enxerga.

## Personalização de marca

Para revender com outra identidade, mexa em dois lugares:

1. `src/index.css` — os tokens de cor no bloco `:root`.
2. `src/config/brand.ts` (ou as variáveis `VITE_BRAND_*` no `.env`) — nome, tagline e logo.

Nenhum componente usa cor fixa, então a troca de paleta é imediata.
