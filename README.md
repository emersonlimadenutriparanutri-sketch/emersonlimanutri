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

## Instalação

O passo a passo completo está em [`docs/INSTALACAO.md`](docs/INSTALACAO.md).
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
