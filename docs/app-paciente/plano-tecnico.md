# App do Paciente — Plano Técnico

Segunda interface sobre o mesmo Supabase do **De Nutri para Nutri**: um app onde
o paciente entra com e-mail e senha, vê o que foi combinado com o nutricionista
e devolve dado novo (check-in, medidas, questionários).

**Status:** plano para aprovação. Nada implementado ainda.
**Decisões já tomadas:** login com e-mail e senha; MVP com os quatro blocos
(questionários, check-in semanal + tarefas, ver plano e relatórios, registrar
peso/medidas/fotos).

---

## 1. Por que isso é mais barato do que parece

O banco já tem quase toda a estrutura que o app do paciente precisa. Nada aqui
começa do zero:

| O que o paciente vai usar | Onde já existe hoje |
|---|---|
| Plano da semana, tarefas, agendamentos | `jornada.data` (JSONB) |
| Questionários | `questionario_modelos`, `questionario_envios`, `questionario_respostas` |
| Relatórios e PDFs | `relatorios_evolucao`, `analise_exames`, `resumos_consulta`, `avaliacoes_fisicas.anexos_pdf` |
| Histórico de peso e medidas | `avaliacoes_fisicas` |
| Próxima consulta | `agenda_tasks` |
| Canal de notificação | Edge Functions de WhatsApp (branch `whatsapp-api-integration`) |

E `questionario_envios` já carrega `token`, `prazo` e `status` — ou seja, a ideia
de "o paciente acessa alguma coisa de fora" já é um conceito vivo no sistema.

O trabalho real não é criar dado novo. É **abrir uma porta de acesso sem abrir
junto o que não deve ser visto.**

---

## 2. Três bloqueios que precisam ser resolvidos antes

Estes não são detalhes de implementação. São condições para o app do paciente
poder existir com segurança.

### 2.1 `profiles` não está isolada entre contas — CRÍTICO

Consultando o banco como usuário autenticado, é possível listar **todos os
nutricionistas da plataforma**, com e-mail:

```
socorrinha.coelho@gmail.com, marcia.qson@gmail.com,
nutri.mariafernandadiniz@gmail.com, rufinarosaff@gmail.com, ... (20+ linhas)
```

Para comparação, `patients` está correta — só retorna linhas do dono.

Isso já é um vazamento entre contas hoje, independente do app do paciente. Mas
com pacientes virando usuários `authenticated`, **cada paciente passaria a ler a
lista de e-mails de todos os nutricionistas do sistema**.

Correção: policy de SELECT em `profiles` restrita a `id = auth.uid()`. Se alguma
tela precisa exibir dados de outro nutri, expor uma view com as colunas públicas
(nome, CRN) e nada de contato.

> A verificar junto: existe trigger `on_auth_user_created` que insere em
> `profiles`? Se existir, todo paciente que se cadastrar vira uma linha de
> "nutricionista". O fluxo de convite (§5) precisa desviar disso.

### 2.2 `jornada.data` mistura dado do paciente com anotação interna

O JSONB de jornada guarda, no mesmo objeto, o que é do paciente e o que é seu:

```jsonc
{
  "tipoPlano": "Mensal", "dataInicio": "...", "jornadas": [], "agendamentos": [],
  "cicloMenstrual": { ... },

  "statusPaciente": "Inativo",              // ← interno
  "temperaturaPaciente": "Não engajado",    // ← interno
  "observacoesEstrategicas": ""             // ← interno
}
```

`"Não engajado"` é um valor real, num registro real. Se o app do paciente der
`SELECT` nessa tabela, o paciente lê a classificação que você deu a ele. Policy
de linha não resolve — o problema está *dentro* da linha.

O mesmo vale para `agenda_tasks.descricao`, que na prática é sua nota de
trabalho. Exemplo real:

> "...aproveitar para reforçar **a renovação do plano** e agendar a próxima
> reavaliação."

O paciente precisa saber que tem consulta dia tal. Não precisa ler isso.

**Opção A (recomendada para o MVP):** views de leitura que removem as chaves
internas. Não exige mexer no app principal.

```sql
create view public.v_jornada_paciente
with (security_invoker = true) as
select
  j.id, j.patient_id,
  j.data - 'observacoesEstrategicas'
         - 'temperaturaPaciente'
         - 'statusPaciente' as data,
  j.updated_at
from public.jornada j;
```

**Opção B (melhor no médio prazo):** mover os campos internos para uma coluna
`notas_internas jsonb` separada, à qual o paciente nunca recebe policy. Estrutura
mais limpa e à prova de esquecimento — o dia em que alguém adicionar um campo
interno novo, ele não vaza por padrão. Custo: exige alterar o app principal.

Sugestão: A agora, B logo depois, com a Opção A escrita de forma que a migração
para B não quebre o app do paciente.

### 2.3 Fotos e PDFs de paciente estão em bucket público

Os anexos de avaliação apontam para:

```
https://<projeto>.supabase.co/storage/v1/object/public/avaliacoes-fotos/...
```

O `/public/` no caminho indica bucket público: **qualquer pessoa com a URL abre
o arquivo, sem autenticação**. São fotos corporais e laudos — dado de saúde, que
a LGPD trata como dado sensível.

Correção: bucket privado + URLs assinadas com expiração curta. E o bucket novo de
uploads do paciente (§4.4) já nasce privado.

> Confirmar no painel do Supabase se `avaliacoes-fotos` está de fato marcado como
> público antes de agir — o padrão da URL indica que sim.

---

## 3. Arquitetura

```
┌──────────────────┐     ┌──────────────────┐
│  App do Nutri    │     │  App do Paciente │   ← novo, PWA
│  (existente)     │     │  React + Vite    │
└────────┬─────────┘     └────────┬─────────┘
         │                        │
         │   auth.users (compartilhado, papéis distintos)
         │                        │
    ┌────▼────────────────────────▼────┐
    │          Supabase / Postgres     │
    │                                  │
    │  RLS: nutri = dono               │
    │       paciente = is_patient_of() │
    │  Views seguras de leitura        │
    │  Edge Functions p/ convite       │
    └──────────────────────────────────┘
```

**App separado, não uma rota dentro do app do nutri.** O bundle do nutricionista
carrega financeiro, leads, funis e CRM. Num app único, um erro de roteamento ou
de guarda de rota expõe receita/despesa ao paciente. Dois apps tornam essa classe
inteira de bug impossível — o código do financeiro simplesmente não existe no app
do paciente.

Stack sugerida: React + Vite + Tailwind + `supabase-js`, igual ao app principal,
como PWA instalável (o paciente abre pelo ícone, sem loja de app).

---

## 4. Modelo de dados

### 4.1 Vínculo e convite

```sql
-- Liga o usuário de login ao prontuário. N:N de propósito: a plataforma é
-- multi-tenant, e o mesmo paciente pode um dia ser atendido por outro nutri
-- sem precisar de segunda conta.
create table public.patient_users (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid not null references auth.users(id) on delete cascade,
  patient_id    uuid not null references public.patients(id) on delete cascade,
  nutri_user_id uuid not null,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (auth_user_id, patient_id)
);

create table public.patient_invites (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,              -- nutri que convidou
  patient_id uuid not null references public.patients(id) on delete cascade,
  email      text not null,
  token_hash text not null,              -- hash, nunca o token cru
  expira_em  timestamptz not null,
  aceito_em  timestamptz,
  created_at timestamptz not null default now()
);
```

### 4.2 Check-in de tarefas — sem refatorar a jornada

As tarefas da jornada vivem hoje dentro de `jornada.data.jornadas[]`. Se o
paciente marcasse "feito" escrevendo nesse JSONB, dois problemas: ele precisaria
de UPDATE na linha inteira, e uma edição sua ao mesmo tempo sobrescreveria a
dele (ou vice-versa).

Solução: tabela append-only. O paciente **nunca** escreve na `jornada`.

```sql
create table public.jornada_task_checkins (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid not null references public.patients(id) on delete cascade,
  jornada_task_id uuid not null,     -- id da tarefa dentro do JSONB
  concluido_em    timestamptz not null default now(),
  observacao      text,
  origem          text not null default 'paciente',
  unique (patient_id, jornada_task_id)
);
```

Isso já funciona porque as tarefas da jornada têm id estável — `questionario_envios`
já referencia `jornada_task_id`.

### 4.3 Check-in semanal

`raio_x_semanal` existe mas está vazia, então o schema precisa ser confirmado
antes de decidir entre reaproveitar ou criar `paciente_checkins`. Campos que o
MVP pede: semana de referência, adesão ao plano, sono, intestino, energia,
humor, dificuldades da semana, texto livre.

### 4.4 Medidas e fotos do paciente

**Não gravar em `avaliacoes_fisicas`.** Essa tabela guarda avaliação profissional
(Shaped, dobras, bioimpedância, `shaped_score`). Peso de balança de banheiro
misturado ali polui gráfico e relatório, e pior: cria risco de o paciente
sobrescrever uma avaliação sua.

```sql
create table public.paciente_medidas (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references public.patients(id) on delete cascade,
  data        date not null,
  peso        numeric(5,2),
  cintura     numeric(5,2),
  quadril     numeric(5,2),
  abdomen     numeric(5,2),
  foto_frente text,   -- path no bucket privado
  foto_lado   text,
  foto_costas text,
  observacoes text,
  created_at  timestamptz not null default now()
);
```

Nos gráficos do app do nutri, as duas séries aparecem juntas mas distinguíveis:
avaliação profissional como ponto cheio, autorrelato do paciente como ponto vazado.

Uploads vão para bucket **privado** `paciente-uploads`, com path
`{patient_id}/{ano}/{arquivo}` e policy de storage casando o prefixo com
`is_patient_of()`.

---

## 5. Autenticação e onboarding

Nutricionistas e pacientes dividem o mesmo `auth.users`. O que separa os dois:

- **É paciente** quem tem linha ativa em `patient_users`.
- **É nutricionista** quem tem linha em `profiles`.
- Reforço em `raw_app_meta_data.role`, gravado no convite (não é editável pelo
  usuário, ao contrário de `user_metadata`).

Cada app recusa o login do papel errado, com mensagem clara em vez de tela quebrada.

**Cadastro aberto não pode existir.** Se qualquer pessoa se cadastrar e virar
paciente, o vínculo perde o sentido. O vínculo só é criado por código
privilegiado:

```
1. Nutri clica "Convidar paciente"
     → Edge Function `patient-invite` (service_role)
     → gera token, grava o hash, envia link por e-mail ou WhatsApp

2. Paciente abre /convite?token=...  e define a senha
     → Edge Function `patient-accept-invite`
     → valida token + prazo, cria auth.user com role='patient',
       cria patient_users, marca aceito_em, registra o consentimento

3. Dali em diante: login normal com e-mail e senha
```

O token vai hasheado no banco: quem tiver acesso de leitura à tabela não
consegue aceitar convite de ninguém.

---

## 6. RLS

O padrão do banco (visto em `whatsapp/sql/002_rls.sql`) é "dono da linha faz
tudo". As policies do paciente **somam** a esse padrão — policies permissivas se
combinam com `OR`, então nada do que o nutricionista já faz é afetado.

```sql
create or replace function public.is_patient_of(p_patient_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.patient_users pu
    where pu.patient_id = p_patient_id
      and pu.auth_user_id = auth.uid()
      and pu.ativo
  );
$$;
```

Matriz de acesso do paciente:

| Tabela | Paciente pode |
|---|---|
| `patients` (própria linha) | ler colunas não sensíveis |
| `jornada` | **nada direto** — só via `v_jornada_paciente` |
| `agenda_tasks` | **nada direto** — só via `v_agenda_paciente` (data/hora, sem `descricao`) |
| `relatorios_evolucao`, `analise_exames`, `resumos_consulta` | ler apenas o que for marcado como liberado |
| `avaliacoes_fisicas` | ler subconjunto de colunas (peso, medidas) — sem `observacoes` |
| `questionario_envios` | ler os próprios envios |
| `questionario_respostas` | inserir, se o envio é dele, ainda no prazo e não respondido |
| `jornada_task_checkins` | inserir e apagar as próprias linhas |
| `paciente_medidas` | CRUD nas próprias linhas |
| `leads`, financeiro, `kanban_*`, `funis_*`, `mind_maps`, `profiles` | **nenhum acesso** |

Dois pontos de atenção:

- `questionario_respostas` **não tem coluna `user_id`** — a policy precisa passar
  por `envio_id` até `questionario_envios`.
- Relatórios não devem ser visíveis por padrão. Precisa de um
  `liberado_para_paciente boolean default false`, para você decidir quando o
  laudo vai ao ar. Padrão negado, liberação explícita.

---

## 7. O MVP, tela a tela

| # | Tela | Lê | Escreve |
|---|---|---|---|
| 1 | **Início** — próxima consulta, tarefas da semana, pendências | `v_jornada_paciente`, `v_agenda_paciente` | — |
| 2 | **Minha semana** — lista de tarefas com check | `v_jornada_paciente` | `jornada_task_checkins` |
| 3 | **Check-in semanal** — formulário curto | — | `raio_x_semanal` / `paciente_checkins` |
| 4 | **Meu corpo** — gráfico de peso, histórico, envio de fotos | `avaliacoes_fisicas` (subconjunto), `paciente_medidas` | `paciente_medidas` + storage privado |
| 5 | **Questionários** — pendentes e respondidos | `questionario_envios`, `questionario_modelos` | `questionario_respostas` |
| 6 | **Meus documentos** — PDFs liberados | `relatorios_evolucao`, `analise_exames`, `resumos_consulta` | — |

Do lado do nutricionista, três acréscimos pequenos: botão "Convidar paciente",
toggle "liberar documento para o paciente", e um indicador de quem fez check-in
na semana. Esse último é o que transforma o app em informação clínica útil em vez
de só mais uma tela.

---

## 8. Faseamento

| Fase | Entrega | Depende de |
|---|---|---|
| **0** | Correções de segurança: RLS de `profiles`, bucket privado | — |
| **1** | Fundação: `patient_users`, convites, Edge Functions, `is_patient_of`, views seguras | 0 |
| **2** | App casca: login, PWA, Início, Meus documentos (só leitura) | 1 |
| **3** | Minha semana + check-in semanal (primeira escrita) | 2 |
| **4** | Meu corpo: medidas, fotos, gráfico | 2 |
| **5** | Questionários dentro do app | 2 |

As fases 3, 4 e 5 são independentes entre si — dá para reordenar conforme o que
você quiser testar primeiro com paciente real.

Sugestão: piloto com 3 a 5 pacientes engajados ao fim da fase 3, antes de
construir 4 e 5. Se ninguém fizer check-in, o problema é de produto, e é melhor
descobrir isso antes de escrever a tela de fotos.

---

## 9. LGPD

O app passa a tratar dado de saúde de titular não-cliente (o paciente não é seu
usuário contratante), o que eleva a régua:

- **Consentimento** registrado no aceite do convite, com data e versão do texto.
- **Política de privacidade** e termo de uso próprios do app do paciente.
- **Revogação**: `patient_users.ativo = false` corta o acesso na hora, sem apagar
  o prontuário — que é documento clínico e tem retenção própria (CFN: 10 anos).
- **Storage privado** para foto corporal, sempre. Item §2.3.
- **Trilha de acesso**: registrar quem leu o quê, ao menos para documentos.

---

## 10. Aberto — precisa de decisão ou verificação

1. Colunas de `raio_x_semanal` (tabela vazia): reaproveitar ou criar nova?
2. Existe trigger de criação automática em `profiles` no signup?
3. Confirmar no painel se `avaliacoes-fotos` é bucket público.
4. Onde o app do paciente é hospedado — subdomínio próprio? Foi feito na Lovable
   como o app principal, ou fora?
5. Convite chega por e-mail, WhatsApp (infra já existe) ou os dois?
6. O app do paciente é só seu ou vira funcionalidade da plataforma para todos os
   nutricionistas assinantes? Isso muda o dimensionamento — não a arquitetura,
   que já nasce multi-tenant.
