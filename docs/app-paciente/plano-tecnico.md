# App do Paciente — Plano Técnico

Segunda interface sobre o mesmo Supabase do **De Nutri para Nutri**: um app onde
o paciente entra com e-mail e senha, vê o que foi combinado com o nutricionista
e devolve dado novo (check-in, medidas, questionários).

**Status:** plano para aprovação. Nada implementado ainda.

**Decisões tomadas**

| | |
|---|---|
| Login | e-mail e senha |
| MVP | questionários · check-in semanal e tarefas · ver plano e relatórios · peso, medidas e fotos |
| Hospedagem | Lovable, segundo projeto apontando para o mesmo Supabase |
| Convite | WhatsApp |
| Alcance | funcionalidade da plataforma, para todos os nutricionistas assinantes |

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
| Canal de convite e notificação | Edge Functions de WhatsApp (branch `whatsapp-api-integration`) |

E `questionario_envios` já carrega `token`, `prazo` e `status` — a ideia de "o
paciente acessa alguma coisa de fora" já é um conceito vivo no sistema.

O trabalho real não é criar dado novo. É **abrir uma porta de acesso sem abrir
junto o que não deve ser visto** — e agora, com a decisão de vender isso para
outros nutricionistas, essa porta é aberta no dado de terceiros, não no seu.

---

## 2. Três bloqueios que precisam ser resolvidos antes

Não são detalhes de implementação. São condições para o app do paciente poder
existir. Como funcionalidade de plataforma, os três deixam de ser "corrigir logo"
e viram **pré-requisito de lançamento**: uma falha aqui não expõe os seus
pacientes, expõe os pacientes de todos os assinantes.

### 2.1 `profiles` não está isolada entre contas — CRÍTICO

Consultando o banco como usuário autenticado, é possível listar **todos os
nutricionistas da plataforma**, com e-mail:

```
socorrinha.coelho@gmail.com, marcia.qson@gmail.com,
nutri.mariafernandadiniz@gmail.com, rufinarosaff@gmail.com, ... (20+ linhas)
```

Para comparação, `patients` está correta — só retorna linhas do dono.

Isso já é um vazamento entre contas hoje, independente do app do paciente. Mas
com pacientes virando usuários `authenticated`, **cada paciente de cada
assinante passaria a ler a lista de e-mails de todos os nutricionistas do
sistema** — que é, na prática, a sua base de clientes.

Correção: policy de SELECT em `profiles` restrita a `id = auth.uid()`, mais uma
view `v_nutri_publico` com nome, CRN e avatar — sem contato — para o app do
paciente exibir de quem ele é paciente (§3).

> A verificar junto: existe trigger `on_auth_user_created` que insere em
> `profiles`? Se existir, todo paciente que se cadastrar vira uma linha de
> "nutricionista" — e, pior, entra na contagem de assinantes.

### 2.2 `jornada.data` mistura dado do paciente com anotação interna

O JSONB de jornada guarda, no mesmo objeto, o que é do paciente e o que é do
nutricionista:

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
`SELECT` nessa tabela, o paciente lê a classificação que recebeu. Policy de linha
não resolve — o problema está *dentro* da linha.

O mesmo vale para `agenda_tasks.descricao`, que na prática é nota de trabalho.
Exemplo real do banco:

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
`notas_internas jsonb` separada, à qual o paciente nunca recebe policy. À prova
de esquecimento — o dia em que alguém adicionar um campo interno novo, ele não
vaza por padrão. Custo: exige alterar o app principal.

Num produto de um usuário só, a lista de chaves removidas da Opção A é
gerenciável. Num produto com muitos assinantes e roadmap ativo, a Opção B deixa
de ser refinamento e vira a forma certa — **a Opção A é ponte, não destino.**

### 2.3 Fotos e PDFs de paciente estão em bucket público

Os anexos de avaliação apontam para:

```
https://<projeto>.supabase.co/storage/v1/object/public/avaliacoes-fotos/...
```

O `/public/` no caminho indica bucket público: **qualquer pessoa com a URL abre o
arquivo, sem autenticação**. São fotos corporais e laudos — dado de saúde, que a
LGPD trata como sensível.

Correção: bucket privado + URLs assinadas com expiração curta. E o bucket novo de
uploads do paciente (§5) já nasce privado.

> Confirmar no painel do Supabase se `avaliacoes-fotos` está de fato marcado como
> público antes de agir — o padrão da URL indica que sim.

---

## 3. O que muda por ser funcionalidade de plataforma

A arquitetura não muda: o banco já é multi-tenant e tudo abaixo já foi desenhado
com `patient_users` N:N. O que muda é a régua.

**Branding por nutricionista.** O paciente da Márcia precisa ver o nome da
Márcia, não "De Nutri para Nutri". Isso conflita com travar `profiles` (§2.1), e
a saída é a view `v_nutri_publico`: nome, CRN e avatar, legível só para quem é
paciente daquele nutri.

```sql
create view public.v_nutri_publico
with (security_invoker = true) as
select p.id, p.nome_completo, p.crn, p.especialidade, p.avatar_url
from public.profiles p;
-- + policy em profiles liberando SELECT quando
--   exists (select 1 from patient_users pu
--           where pu.auth_user_id = auth.uid() and pu.nutri_user_id = p.id)
```

**Um domínio só, não um por nutri.** Todos os pacientes entram pelo mesmo
endereço e a marca aparece depois do login, a partir do vínculo. Subdomínio por
assinante multiplicaria certificado e configuração sem ganho real.

**Gate de assinatura.** Precisa existir uma flag de "este nutri tem o app do
paciente" — para lançar em plano específico, liberar em piloto ou cortar em
inadimplência. Não vi tabela de assinatura entre as expostas, então isso precisa
ser localizado antes da fase 1 (§11).

**Suporte deixa de ser você olhando o próprio banco.** Convite não entregue,
paciente que não consegue entrar, senha esquecida: com muitos assinantes isso
vira volume. Vale prever, já na fase 1, uma tela onde o nutricionista vê o status
do convite (enviado, entregue, aceito, expirado) e reenvia sozinho — é o ticket
de suporte mais comum e o mais fácil de eliminar.

---

## 4. Arquitetura

```
┌──────────────────┐     ┌──────────────────┐
│  App do Nutri    │     │  App do Paciente │   ← novo projeto Lovable
│  (Lovable)       │     │  (Lovable, PWA)  │
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
    │  Edge Functions: convite, WhatsApp│
    └──────────────────────────────────┘
```

**Segundo projeto Lovable sobre o mesmo Supabase**, não uma rota dentro do app do
nutri. O bundle do nutricionista carrega financeiro, leads, funis e CRM. Num app
único, um erro de roteamento ou de guarda de rota expõe receita e despesa ao
paciente. Dois apps tornam essa classe inteira de bug impossível — o código do
financeiro simplesmente não existe no app do paciente.

Efeito colateral bom: os dois projetos evoluem sem disputar o mesmo deploy, e um
prompt errado na Lovable de um lado não derruba o outro.

---

## 5. Modelo de dados

### 5.1 Vínculo e convite

```sql
-- Liga o usuário de login ao prontuário. N:N de propósito: a plataforma é
-- multi-tenant, e o mesmo paciente pode ser atendido por mais de um nutri
-- assinante sem precisar de segunda conta.
create table public.patient_users (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid not null references auth.users(id) on delete cascade,
  patient_id    uuid not null references public.patients(id) on delete cascade,
  nutri_user_id uuid not null,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (auth_user_id, patient_id)
);

-- O convite é endereçado ao TELEFONE, não ao e-mail: ele chega por WhatsApp.
-- O e-mail é escolhido pelo paciente na hora de aceitar (§6).
create table public.patient_invites (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,          -- nutri que convidou
  patient_id    uuid not null references public.patients(id) on delete cascade,
  telefone_e164 text not null,          -- via wa_normalizar_telefone()
  token_hash    text not null,          -- hash, nunca o token cru
  expira_em     timestamptz not null,
  status        text not null default 'pendente',
    -- pendente · enviado · entregue · aceito · expirado · falhou
  enviado_em    timestamptz,
  aceito_em     timestamptz,
  created_at    timestamptz not null default now()
);
```

O `status` não é enfeite: é o que alimenta a tela de acompanhamento de convite da
§3, e o webhook de WhatsApp já sabe atualizar status de entrega.

### 5.2 Check-in de tarefas — sem refatorar a jornada

As tarefas da jornada vivem hoje dentro de `jornada.data.jornadas[]`. Se o
paciente marcasse "feito" escrevendo nesse JSONB, dois problemas: precisaria de
UPDATE na linha inteira, e uma edição do nutricionista ao mesmo tempo
sobrescreveria a dele.

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

Isso já funciona porque as tarefas da jornada têm id estável —
`questionario_envios` já referencia `jornada_task_id`.

### 5.3 Check-in semanal

`raio_x_semanal` existe mas está vazia, então o schema precisa ser confirmado
antes de decidir entre reaproveitar ou criar `paciente_checkins`. Campos que o
MVP pede: semana de referência, adesão ao plano, sono, intestino, energia, humor,
dificuldades da semana, texto livre.

### 5.4 Medidas e fotos do paciente

**Não gravar em `avaliacoes_fisicas`.** Essa tabela guarda avaliação profissional
(Shaped, dobras, bioimpedância, `shaped_score`). Peso de balança de banheiro
misturado ali polui gráfico e relatório, e pior: cria risco de o paciente
sobrescrever uma avaliação do nutricionista.

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
avaliação profissional como ponto cheio, autorrelato do paciente como ponto
vazado.

Uploads vão para bucket **privado** `paciente-uploads`, com path
`{patient_id}/{ano}/{arquivo}` e policy de storage casando o prefixo com
`is_patient_of()`.

---

## 6. Convite por WhatsApp e onboarding

### 6.1 O fluxo

```
1. Nutri clica "Convidar paciente"
     → Edge Function `patient-invite` (service_role)
     → normaliza o telefone, gera token, grava o hash
     → enfileira template aprovado com botão de URL dinâmica

2. Paciente recebe no WhatsApp e toca no botão
     → abre /convite?token=... e define e-mail e senha
     → Edge Function `patient-accept-invite`
     → valida token + prazo, cria auth.user com role='patient',
       cria patient_users, marca aceito_em, registra o consentimento

3. Dali em diante: login normal com e-mail e senha
```

Repare na inversão: o convite chega no **telefone**, mas a credencial que fica é
**e-mail e senha**, escolhidos pelo próprio paciente no passo 2. Isso é bom — não
depende de o e-mail estar cadastrado corretamente em `patients` (muitos estão
vazios), e o paciente escolhe um e-mail que ele realmente usa.

**Cadastro aberto não pode existir.** Se qualquer pessoa se cadastrar e virar
paciente, o vínculo perde o sentido. O vínculo só é criado por código
privilegiado, e o token vai hasheado: quem tiver leitura na tabela não consegue
aceitar convite de ninguém.

**Guarda de telefone.** `wa_normalizar_telefone()` devolve `NULL` quando o número
não é confiável — e o banco tem telefone em três formatos diferentes. O botão de
convite precisa estar desabilitado, com motivo visível, quando o telefone do
paciente não normaliza. Falhar na hora do disparo, silenciosamente, é o pior
resultado possível.

### 6.2 Isto exige template aprovado pela Meta

Convite é mensagem iniciada pelo negócio, fora da janela de 24h. Pela Cloud API,
**só passa como template previamente aprovado**. Aprovação leva de minutos a 24h,
e reprovação na primeira tentativa é comum. Isso entra no caminho crítico da fase
1 — não dá para deixar para a véspera.

O template precisa de categoria **Utilidade**, corpo sem variável no início nem
no fim, e botão de URL dinâmica carregando o token. Nada de conteúdo clínico.

### 6.3 Os templates existentes são de um nutricionista só

Os templates já escritos em `whatsapp/docs/02-templates.md` têm o nome cravado no
corpo:

> `Oi, {{1}}! Passando pra lembrar da sua consulta com o nutricionista`
> **`Emerson Lima`** `amanhã, dia {{2}}, às {{3}}.`

Como funcionalidade de plataforma, o nome do nutricionista tem que virar
variável. Cabe dentro das regras da Meta — a variável fica no meio da frase, não
na borda, e não encosta em outra. Mas é reescrita e reaprovação de **todos** os
templates, não só o de convite.

### 6.4 De qual número sai a mensagem

Esta é a decisão em aberto mais pesada do projeto. `whatsapp_config` já é uma
linha por nutricionista, então o schema aguenta as duas saídas; o que muda é onde
mora o token e quanto trabalho a Meta exige.

**Modelo A — número único da plataforma.** Um WABA, um token, templates aprovados
uma vez. Funciona já, sem nenhuma aprovação nova além dos templates.
Contras: o paciente recebe convite de um número que não conhece, o que derruba
aceite; e o limite de conversas iniciadas por dia é **compartilhado por todos os
assinantes** — um número novo começa em 250/dia e sobe conforme qualidade.

**Modelo B — cada nutri com o próprio número.** O paciente recebe do número que
já conhece, que é muito melhor de converter, e o limite é de cada um. Exige
Embedded Signup, aprovação sua junto à Meta como Tech Provider, e os WABAs dos
assinantes compartilhados no seu Business Manager. Nesse desenho o
`WHATSAPP_TOKEN` único continua correto — vira um System User token do seu BM
cobrindo todos os números. Ou seja, a integração como está escrita **já aponta
para o modelo B**, só falta a parte da Meta.

Recomendação: **A no lançamento, B como evolução** — com o cuidado de já gravar
`phone_number_id` por nutri desde o começo, para a migração não exigir remexer
em dado.

Um lembrete de custo: template é cobrado por conversa. Como funcionalidade
vendida, esse custo é por assinante e precisa estar no preço do plano —
conversas de Utilidade são mais baratas que Marketing, o que reforça manter o
convite nessa categoria.

---

## 7. RLS

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
| `profiles` | ler **só** o nutri dele, via `v_nutri_publico` |
| `jornada` | **nada direto** — só via `v_jornada_paciente` |
| `agenda_tasks` | **nada direto** — só via `v_agenda_paciente` (data/hora, sem `descricao`) |
| `relatorios_evolucao`, `analise_exames`, `resumos_consulta` | ler apenas o que for marcado como liberado |
| `avaliacoes_fisicas` | ler subconjunto de colunas (peso, medidas) — sem `observacoes` |
| `questionario_envios` | ler os próprios envios |
| `questionario_respostas` | inserir, se o envio é dele, ainda no prazo e não respondido |
| `jornada_task_checkins` | inserir e apagar as próprias linhas |
| `paciente_medidas` | CRUD nas próprias linhas |
| `leads`, financeiro, `kanban_*`, `funis_*`, `mind_maps` | **nenhum acesso** |

Três pontos de atenção:

- `questionario_respostas` **não tem coluna `user_id`** — a policy precisa passar
  por `envio_id` até `questionario_envios`.
- Relatórios não devem ser visíveis por padrão. Precisa de um
  `liberado_para_paciente boolean default false`, para o nutricionista decidir
  quando o laudo vai ao ar. Padrão negado, liberação explícita.
- Como isso agora roda sobre dado de terceiros, a matriz precisa virar **teste
  automatizado**, não conferência manual: um script que autentica como paciente
  de teste e tenta ler cada tabela proibida, rodando a cada deploy. É o único
  jeito de um prompt na Lovable não reabrir um vazamento silenciosamente.

---

## 8. O MVP, tela a tela

| # | Tela | Lê | Escreve |
|---|---|---|---|
| 1 | **Início** — próxima consulta, tarefas da semana, pendências | `v_jornada_paciente`, `v_agenda_paciente`, `v_nutri_publico` | — |
| 2 | **Minha semana** — lista de tarefas com check | `v_jornada_paciente` | `jornada_task_checkins` |
| 3 | **Check-in semanal** — formulário curto | — | `raio_x_semanal` / `paciente_checkins` |
| 4 | **Meu corpo** — gráfico de peso, histórico, envio de fotos | `avaliacoes_fisicas` (subconjunto), `paciente_medidas` | `paciente_medidas` + storage privado |
| 5 | **Questionários** — pendentes e respondidos | `questionario_envios`, `questionario_modelos` | `questionario_respostas` |
| 6 | **Meus documentos** — PDFs liberados | `relatorios_evolucao`, `analise_exames`, `resumos_consulta` | — |

Do lado do nutricionista, quatro acréscimos: botão "Convidar paciente", tela de
status dos convites (§3), toggle "liberar documento para o paciente", e um
indicador de quem fez check-in na semana. O último é o que transforma o app em
informação clínica útil em vez de só mais uma tela — e, num produto vendido, é
o que o assinante enxerga como valor.

---

## 9. Faseamento

| Fase | Entrega | Depende de |
|---|---|---|
| **0** | Correções de segurança: RLS de `profiles`, bucket privado, teste automatizado da matriz | — |
| **1** | Fundação: `patient_users`, convites, `is_patient_of`, views seguras, template de convite aprovado na Meta, gate de assinatura | 0 |
| **2** | App casca na Lovable: login, PWA, Início, Meus documentos (só leitura) | 1 |
| **3** | Minha semana + check-in semanal (primeira escrita) | 2 |
| **4** | Meu corpo: medidas, fotos, gráfico | 2 |
| **5** | Questionários dentro do app | 2 |
| **6** | Abertura para assinantes: branding por nutri, onboarding, suporte | 3 |

As fases 3, 4 e 5 são independentes entre si — dá para reordenar conforme o que
você quiser testar primeiro.

Sugestão de rollout: **use seus próprios pacientes como piloto.** Ao fim da fase
3, 3 a 5 pacientes seus. Depois, 2 ou 3 nutricionistas assinantes de confiança
antes da abertura geral. Se ninguém fizer check-in, o problema é de produto — e é
melhor descobrir isso com pacientes seus do que com os de um cliente pagante.

Uma dependência externa a resolver cedo: a integração de WhatsApp está numa
branch que nunca foi mesclada, e este repositório não tem branch principal.
Confirmar se ela já está aplicada no Supabase de produção — o convite depende
dela por inteiro.

---

## 10. LGPD

O app passa a tratar dado de saúde de titular que não é seu cliente, o que já
elevaria a régua. Como funcionalidade de plataforma, ela sobe de novo: nos dados
dos pacientes de um assinante, **o assinante é o controlador e você é o
operador**. A diferença é contratual, não técnica.

- **Contrato de operador** nos termos da plataforma, definindo o que você faz com
  o dado do paciente do assinante, e o que acontece quando ele cancela.
- **Consentimento** registrado no aceite do convite, com data e versão do texto.
- **Política de privacidade** e termo de uso próprios do app do paciente, com o
  assinante identificado como controlador.
- **Revogação:** `patient_users.ativo = false` corta o acesso na hora, sem apagar
  o prontuário — documento clínico tem retenção própria (CFN: 10 anos).
- **Storage privado** para foto corporal, sempre. Item §2.3.
- **Trilha de acesso:** registrar quem leu o quê, ao menos para documentos.
- **Saída do assinante:** definir agora o que acontece com os acessos dos
  pacientes dele quando a assinatura termina. Sem regra escrita, o padrão vira
  "continua funcionando para sempre", que é o pior dos dois mundos.

---

## 11. Aberto — precisa de decisão ou verificação

1. **De qual número sai o WhatsApp** — modelo A ou B da §6.4. É a decisão de
   maior impacto no cronograma.
2. Onde vive a informação de assinatura, para o gate da §3? Não há tabela de
   plano entre as expostas — está em Stripe, Kiwify, Hotmart, outro?
3. Colunas de `raio_x_semanal` (tabela vazia): reaproveitar ou criar nova?
4. Existe trigger de criação automática em `profiles` no signup?
5. Confirmar no painel se `avaliacoes-fotos` é bucket público.
6. A integração de WhatsApp da branch já foi aplicada no Supabase de produção?
7. Domínio do app do paciente.
