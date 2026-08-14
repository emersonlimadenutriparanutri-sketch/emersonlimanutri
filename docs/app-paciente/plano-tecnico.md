# App do Paciente — Plano Técnico

Segunda interface sobre o mesmo Supabase do **De Nutri para Nutri**. O paciente
entra com e-mail e senha e acompanha o próprio processo — da pré-consulta ao
check-in semanal — enquanto o nutricionista continua no app dele, com o mesmo
dado, na mesma hora.

**Status:** plano para aprovação. Nada implementado ainda.

| | |
|---|---|
| Login | e-mail e senha |
| Hospedagem | Lovable, segundo projeto apontando para o mesmo Supabase |
| Convite | WhatsApp |
| Alcance | funcionalidade da plataforma, para todos os nutricionistas assinantes |

---

## 1. O app, na ordem em que o paciente vive

O produto tem duas metades separadas pela primeira consulta. Antes dela, o app
coleta. Depois dela, o app entrega e acompanha.

### Metade 1 — Pré-consulta

O paciente fecha o acompanhamento, recebe o convite por WhatsApp, instala o app
e encontra três tarefas em sequência:

| # | Passo | O nutricionista faz | O paciente faz |
|---|---|---|---|
| 1 | **Anamnese** | escolhe o modelo no app dele | preenche pelo app |
| 2 | **Exames** | — | anexa os PDFs |
| 3 | **Rastreamento metabólico** | escolhe o questionário | responde pelo app |

Tudo volta para o app do nutricionista na hora. A anamnese chega como
**rascunho**, não como ficha pronta: o nutricionista revisa, completa os campos
restantes e usa as ferramentas HERO para consolidar. Quem assina o prontuário é
ele (§7).

### Metade 2 — Acompanhamento

Feita a consulta, o nutricionista libera as abas:

| Aba | O que o paciente vê | Vem de |
|---|---|---|
| **Plano alimentar** | PDF do plano, aberto no app | upload manual (§6.8) |
| **Resumos** | resumo da consulta e das avaliações | `resumos_consulta`, `relatorios_evolucao` |
| **Check-ins** | "novo check-in disponível" quando abre a janela | tarefas `envio-raio-x` da jornada |
| **Feedback** | o retorno do nutricionista sobre o check-in da semana | resumo escrito pelo nutri |
| **Materiais** | o que foi disponibilizado na jornada | tarefas `envio-material` |
| **Ciclo** | fase do ciclo e orientação nutricional da semana | §6.9 — só para quem tem ciclo ativo |
| **Receitas** | busca em uma biblioteca de preparos | tabela nova (§6.5) |
| **Tira-dúvidas** | IA respondendo dentro do escopo do plano dele | §10 |

O ciclo semanal fecha assim: **abre o check-in → paciente responde → resposta cai
no app do nutri → nutri escreve o feedback → paciente lê na aba Feedback.**

### A jornada do paciente não é a sua

Este é o ponto que mais define o produto. A jornada no app do nutricionista é
ferramenta de controle: onboarding, cadastro em apps de prescrição, criação de
grupo de WhatsApp, preparo da consulta. Nada disso é da conta do paciente.

E o dado já separa isso sozinho — a jornada tem duas camadas distintas:

```
jornada.data.fullJornada
├── timelineStages[]          ← controle interno. NUNCA vai para o paciente.
│     "Pagamento efetuado"
│     "Cadastrar paciente nos apps de prescrição"
│     "Criar grupo individual de WhatsApp e demais acessos"
│     "Preparar a consulta inicial"
│
└── monthsData["mes-01"].monthTasks[]   ← candidatas a visíveis, filtradas por tipo
      { tipo: "envio-raio-x",   titulo: "Envio de HERO X",        modeloQuestionario, dataEnvioRaioX, prazoRespostaRaioX }
      { tipo: "envio-material", titulo: "Envio de Material",      documentos[], links[] }
      { tipo: "ponto-contato",  titulo: "Envio Feedback HERO-X" }
```

O campo `tipo` é o filtro pronto: `envio-raio-x` alimenta a aba Check-ins,
`envio-material` alimenta Materiais, e o `ponto-contato` de feedback alimenta a
aba Feedback. Nenhuma flag nova nas etapas — a regra é estrutural:
**`timelineStages` é interno por definição, `monthTasks` é filtrado por tipo.**

Regra de ouro para não vazar: o app do paciente lê de uma **lista de tipos
permitidos**, nunca de uma lista de tipos proibidos. Tipo novo que apareça na
jornada nasce invisível até alguém decidir o contrário.

---

## 2. Quanto disso já existe

Mais do que parece. O modelo de dados já antecipou boa parte do fluxo:

| O que o app do paciente precisa | Situação hoje |
|---|---|
| Modelos de anamnese selecionáveis | **Pronto** — `questionario_modelos.tipo = 'anamnese'`, com "Pré-Consulta Nutricional" feminino e masculino cadastrados |
| Modelo de check-in semanal | **Pronto** — `tipo = 'raio-x'`, "Acompanhamento — 1ª Semana" |
| Envio de questionário com prazo e token | **Pronto** — `questionario_envios` com `token`, `prazo`, `status`, `jornada_task_id` |
| Respostas voltando para o nutri | **Pronto** — `questionario_respostas`, inclusive com `resumo_nutricionista` |
| Tarefas de check-in e material na jornada | **Pronto** — `monthTasks[]` com `tipo`, `modeloQuestionario`, `documentos[]`, `links[]` |
| Exames por paciente | **Pronto** — `analise_exames` |
| Resumo de consulta e evolução | **Pronto** — `resumos_consulta`, `relatorios_evolucao` |
| Endpoint público de questionário | **Pronto** — Edge Function `questionario-publico`, que é o caminho tokenizado que o app substitui por card interno |
| Leitura de exame em PDF por IA | **Pronto** — `exames-pdf-ia` |
| Anamnese por IA | **Pronto** — `anamnese-externa-ia` |
| Base para o tira-dúvidas | **Meio caminho** — já existe `agente-ia-chat`; falta o escopo fechado por paciente (§10) |
| Configuração de ciclo menstrual | **Meio caminho** — `jornada.data.cicloMenstrual` já tem `ativo`, `duracaoCiclo`, `duracaoTPM`, `duracaoMenstruacao`, `ultimaMenstruacao`. Falta o histórico (§6.9) |
| Canal de convite | **Escrito, não mesclado** — Edge Functions de WhatsApp na branch `whatsapp-api-integration` |
| Questionário de rastreamento metabólico | **Falta** — criar `tipo = 'rastreamento'` e o modelo |
| Anexo de exame **pelo paciente** | **Falta** |
| Feedback do check-in como entidade | **Falta** |
| Biblioteca de receitas culinárias | **Falta** — e atenção ao nome (§6.5) |
| Plano alimentar | **Falta** — vive hoje em app externo de prescrição; entra como PDF (§6.8) |
| Registro e fases do ciclo | **Falta** — histórico, cálculo de fase e orientações (§6.9) |

O trabalho real não é criar dado novo. É **abrir uma porta de acesso sem abrir
junto o que não deve ser visto** — e, como isso vira produto vendido, essa porta
é aberta no dado de terceiros, não só no seu.

---

## 3. Três bloqueios que precisam ser resolvidos antes

Não são detalhes de implementação. São condições para o app existir. Como
funcionalidade de plataforma, os três viram **pré-requisito de lançamento**: uma
falha aqui não expõe os seus pacientes, expõe os pacientes de todos os
assinantes.

### 3.1 `profiles` não está isolada entre contas — CRÍTICO

Consultando o banco como usuário autenticado, é possível listar **todos os
nutricionistas da plataforma**, com e-mail:

```
socorrinha.coelho@gmail.com, marcia.qson@gmail.com,
nutri.mariafernandadiniz@gmail.com, rufinarosaff@gmail.com, ... (20+ linhas)
```

Para comparação, `patients` está correta — só retorna linhas do dono.

Isso já é um vazamento entre contas hoje. Com pacientes virando usuários
`authenticated`, **cada paciente de cada assinante passaria a ler a lista de
e-mails de todos os nutricionistas do sistema** — que é, na prática, a sua base
de clientes.

Correção: policy de SELECT restrita a `id = auth.uid()`, mais uma view
`v_nutri_publico` com nome, CRN e avatar — sem contato — para o app do paciente
exibir de quem ele é paciente.

> A verificar junto: existe trigger `on_auth_user_created` que insere em
> `profiles`? Se existir, todo paciente que se cadastrar vira uma linha de
> "nutricionista" — e entra na contagem de assinantes.

### 3.2 Os JSONBs misturam dado do paciente com anotação interna

Não é só a jornada. O padrão se repete em três lugares:

| Onde | Campo interno no mesmo objeto |
|---|---|
| `jornada.data.fullJornada` | `temperaturaPaciente` (valor real: `"Não engajado"`), `observacoesEstrategicas`, `statusPaciente` |
| `anamnese.data.anamneses[].fields` | `observacoesNutricionista` |
| `agenda_tasks.descricao` | nota de trabalho — *"reforçar a renovação do plano"* |

Policy de linha não resolve nenhum dos três: o problema está *dentro* da linha.

**Opção A, ponte:** views de leitura que removem as chaves internas e achatam o
que interessa.

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

**Opção B, destino:** mover os campos internos para colunas `notas_internas`
separadas, às quais o paciente nunca recebe policy. O dia em que alguém
adicionar um campo interno novo, ele não vaza por padrão.

Num produto de um usuário só, a lista de chaves removidas é gerenciável. Num
produto com muitos assinantes e roadmap ativo, **a Opção B deixa de ser
refinamento e vira a forma certa.**

### 3.3 Fotos e PDFs de paciente estão em bucket público

Os anexos de avaliação apontam para:

```
https://<projeto>.supabase.co/storage/v1/object/public/avaliacoes-fotos/...
```

O `/public/` no caminho indica bucket público: **qualquer pessoa com a URL abre o
arquivo, sem autenticação**. São fotos corporais e laudos — dado de saúde, que a
LGPD trata como sensível. Isso pesa ainda mais agora que o paciente vai anexar
exames pelo app.

Correção: bucket privado + URLs assinadas com expiração curta. Os buckets novos
já nascem privados.

> Confirmar no painel do Supabase se `avaliacoes-fotos` está de fato marcado como
> público — o padrão da URL indica que sim.

---

## 4. O que muda por ser funcionalidade de plataforma

A arquitetura não muda: o banco já é multi-tenant. O que muda é a régua.

- **Branding por nutricionista.** O paciente da Márcia vê o nome da Márcia. Sai
  da view `v_nutri_publico`.
- **Um domínio só**, com a marca aparecendo depois do login. Subdomínio por
  assinante multiplicaria certificado e configuração sem ganho.
- **Gate de assinatura.** Precisa existir a flag "este nutri tem o app do
  paciente". Não há tabela de plano entre as expostas — localizar antes da fase 1.
- **Suporte vira volume.** Convite não entregue, senha esquecida. Já na fase 1,
  uma tela onde o nutricionista vê o status do convite e reenvia sozinho elimina
  o ticket mais comum.
- **Os modelos são de cada nutri.** `questionario_modelos` já tem `user_id`, então
  cada assinante escolhe entre os próprios modelos. Vale um conjunto de modelos
  padrão da plataforma para quem entra sem nada montado — senão o app abre vazio
  no primeiro dia, que é onde o assinante desiste.

---

## 5. Arquitetura

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
    │  Edge Functions: convite, IA     │
    └──────────────────────────────────┘
```

**Segundo projeto Lovable sobre o mesmo Supabase**, não uma rota dentro do app do
nutri. O bundle do nutricionista carrega financeiro, leads, funis e CRM. Num app
único, um erro de roteamento expõe receita e despesa ao paciente. Dois apps
tornam essa classe inteira de bug impossível — o código do financeiro simplesmente
não existe no app do paciente.

Não há sincronização entre os dois: **é o mesmo banco.** O que o paciente salva
aparece do outro lado no instante seguinte, sem fila nem importação.

---

## 6. Modelo de dados

### 6.1 Vínculo e convite

```sql
create table public.patient_users (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid not null references auth.users(id) on delete cascade,
  patient_id    uuid not null references public.patients(id) on delete cascade,
  nutri_user_id uuid not null,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (auth_user_id, patient_id)
);

-- O convite é endereçado ao TELEFONE: chega por WhatsApp. O e-mail é
-- escolhido pelo paciente na hora de aceitar.
create table public.patient_invites (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  patient_id    uuid not null references public.patients(id) on delete cascade,
  telefone_e164 text not null,          -- via wa_normalizar_telefone()
  token_hash    text not null,
  expira_em     timestamptz not null,
  status        text not null default 'pendente',
    -- pendente · enviado · entregue · aceito · expirado · falhou
  enviado_em    timestamptz,
  aceito_em     timestamptz,
  created_at    timestamptz not null default now()
);
```

### 6.2 O que o paciente responde

Aqui a boa notícia: **`questionario_envios` já é a estrutura certa.** Ele tem
`modelo_id`, `patient_id`, `token`, `prazo`, `status` e `jornada_task_id`. Anamnese,
rastreamento e check-in semanal são todos o mesmo mecanismo, distinguidos por
`questionario_modelos.tipo`.

O que muda com o app: em vez de o paciente abrir um link tokenizado, ele vê o
envio pendente como card dentro do app. O token continua existindo — serve para
quem ainda não instalou.

Falta criar o tipo `rastreamento` e cadastrar o modelo do rastreamento
metabólico. A skill `rastreamento-metabolico-hero` já define os sistemas e a
pontuação de 0 a 4, então o modelo sai de lá.

### 6.3 Anamnese em rascunho

O paciente responde um `questionario_modelos` do tipo `anamnese`. A resposta cai
em `questionario_respostas` como sempre — e daí precisa virar ficha.

As duas estruturas não se falam hoje: `questionario_respostas.respostas` é um
JSONB indexado por id de pergunta, e `anamnese.data.anamneses[].fields` tem
chaves nomeadas (`queixaPrincipal`, `qualidadeSono`, `funcionamentoIntestinal`,
`nivelEstresse`…). A ponte é um mapeamento declarado no modelo:

```jsonc
// questionario_modelos.perguntas[]
{ "id": "…", "text": "Como está seu sono?", "type": "short",
  "campo_anamnese": "qualidadeSono" }   // ← novo
```

Com isso, o app do nutri mostra "o paciente respondeu 18 campos da anamnese —
revisar e aplicar", e um clique preenche a ficha. **Não gravar direto.** Dois
motivos: a anamnese é documento de prontuário sob responsabilidade profissional
do nutricionista, e `observacoesNutricionista` mora dentro do mesmo objeto
`fields` — escrita direta do paciente misturaria as duas autorias sem
rastreabilidade.

### 6.4 Exames anexados pelo paciente

```sql
create table public.paciente_exames (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references public.patients(id) on delete cascade,
  nome_arquivo text not null,
  storage_path text not null,          -- bucket privado
  data_exame   date,
  laboratorio  text,
  observacao   text,
  enviado_em   timestamptz not null default now()
);
```

Aparece no app do nutricionista na tela do paciente, ao lado de
`analise_exames` — e é exatamente a entrada da skill de análise de exames.

Guardas necessárias: aceitar só PDF e imagem, limitar tamanho, e varrer o
arquivo antes de disponibilizar. Upload de arquivo por usuário externo é a
superfície de ataque mais óbvia do app inteiro.

### 6.5 Receitas — cuidado com o nome

**Existe uma tabela `receitas` no banco, mas ela é financeira.** Fica no meio de
`despesas`, `lancamentos`, `contas_financeiras`, `plano_contas` e
`metas_financeiras`. A biblioteca culinária precisa de nome próprio —
`receitas_culinarias` ou `preparos`. Um prompt desatento na Lovable apontando
para `receitas` bagunça o financeiro do assinante.

> A tabela está vazia hoje, então a confirmação é rápida: conferir as colunas no
> painel antes de escrever qualquer coisa.

### 6.6 Check-in de tarefas e feedback

O paciente **nunca** escreve na `jornada` — o JSONB é grande e uma edição
simultânea do nutricionista sobrescreveria a dele.

```sql
create table public.jornada_task_checkins (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid not null references public.patients(id) on delete cascade,
  jornada_task_id uuid not null,
  concluido_em    timestamptz not null default now(),
  observacao      text,
  origem          text not null default 'paciente',
  unique (patient_id, jornada_task_id)
);

-- O retorno do nutricionista sobre o check-in da semana.
create table public.checkin_feedbacks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  patient_id   uuid not null references public.patients(id) on delete cascade,
  resposta_id  uuid references public.questionario_respostas(id) on delete set null,
  semana_ref   date not null,
  texto        text not null,
  audio_path   text,                     -- a jornada já prevê HERO-X em áudio
  publicado_em timestamptz,              -- null = rascunho, invisível ao paciente
  created_at   timestamptz not null default now()
);
```

O `publicado_em` importa: o feedback nasce rascunho e só aparece para o paciente
quando o nutricionista publica. Sem isso, ele lê anotação pela metade.

### 6.7 Medidas e fotos

**Não gravar em `avaliacoes_fisicas`** — essa tabela guarda avaliação
profissional (Shaped, dobras, `shaped_score`). Autorrelato misturado ali polui
gráfico e relatório, e arrisca sobrescrever avaliação do nutricionista. Tabela
`paciente_medidas` separada, com peso, circunferências, fotos e observação; nos
gráficos as duas séries aparecem juntas mas distinguíveis.

### 6.8 Plano alimentar — por PDF, por enquanto

O plano é prescrito hoje em app externo, e o app do nutricionista ainda não tem
aba de plano alimentar. A solução provisória é a certa: **o nutricionista sobe o
PDF, o paciente abre no app.** Sem integração, sem parser.

```sql
create table public.planos_alimentares (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  patient_id   uuid not null references public.patients(id) on delete cascade,
  versao       int  not null default 1,
  titulo       text,
  storage_path text not null,        -- bucket privado
  vigente_de   date,
  publicado_em timestamptz,          -- null = rascunho, invisível ao paciente
  created_at   timestamptz not null default now()
);
```

Duas decisões que valem a pena mesmo na versão provisória:

- **Versionar em vez de sobrescrever.** O plano muda a cada mês. Guardar as
  versões custa quase nada e evita a pergunta "qual plano eu estava seguindo em
  maio?" — que aparece sempre.
- **Só a versão vigente aparece em destaque**, com as anteriores num histórico.
  Paciente vendo dois PDFs sem saber qual vale é pior do que não ter a aba.

Quando o plano passar a ser montado dentro do seu app, essa tabela vira o
registro do documento gerado, e a aba do paciente não muda. É por isso que a
solução provisória não vira dívida: o formato de entrega continua o mesmo.

> A confirmar: o nome do app externo de prescrição, para o caso de ele ter API
> de exportação — isso mudaria "subir PDF na mão" para "puxar automático" mais
> adiante.

### 6.9 Ciclo menstrual

Uma aba onde a paciente registra cada menstruação, vê em que fase está e recebe a
orientação nutricional daquela fase. É o tipo de coisa que os apps de ciclo já
fazem — a diferença aqui é que a orientação vem do nutricionista dela.

**O que já existe:** `jornada.data.cicloMenstrual`, com `ativo`, `duracaoCiclo`,
`duracaoTPM`, `duracaoMenstruacao` e `ultimaMenstruacao`. É **configuração**, não
histórico: um único campo que é sobrescrito. Para calcular fase com alguma
honestidade, é preciso o log.

```sql
-- Uma linha por menstruação. A paciente marca quando vem.
create table public.paciente_ciclo_registros (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references public.patients(id) on delete cascade,
  inicio      date not null,
  fim         date,
  fluxo       text,          -- leve · moderado · intenso
  sintomas    text[],        -- cólica, TPM, dor de cabeça…
  observacao  text,
  created_at  timestamptz not null default now(),
  unique (patient_id, inicio)
);

-- Conteúdo por fase, escrito pelo nutricionista (ou padrão da plataforma).
create table public.orientacoes_ciclo (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid,           -- null = conteúdo padrão da plataforma
  fase       text not null,  -- menstrual · folicular · ovulatoria · lutea
  titulo     text not null,
  conteudo   text not null,
  ativo      boolean not null default true
);
```

**Quem é a fonte da verdade.** `paciente_ciclo_registros` passa a ser — a data da
última menstruação é derivada do registro mais recente, não digitada em dois
lugares. O campo `ultimaMenstruacao` do JSONB vira leitura derivada (ou é
aposentado), senão o app do nutricionista e o da paciente vão discordar em duas
semanas.

**A fase é estimativa, e o app precisa dizer isso.** O cálculo parte do último
início e da duração média dos ciclos registrados. Ciclo irregular quebra a
previsão — e irregularidade não é exceção nessa população: numa anamnese real do
seu banco, a resposta era *"Irregular, com cólicas intensas"*. Com menos de três
ciclos registrados, ou com desvio alto entre eles, a tela deve mostrar a fase
como aproximação e não exibir previsão de data. Errar com confiança é pior do que
dizer "ainda não dá para estimar".

**Isto não é método contraceptivo.** Aviso explícito na aba, uma linha, sem
rodeio. Aplicativo que mostra janela fértil acaba sendo usado como
anticoncepcional por alguém, e o app precisa ser claro que não serve para isso.

**Quem vê.** O ciclo é clinicamente relevante — a anamnese já pergunta sobre ele,
e a jornada já prevê o ajuste por fase. O nutricionista vê o histórico, e a
paciente precisa saber disso no momento em que ativa a aba. Registro de
menstruação é dado sensível mesmo dentro do que já é dado de saúde: guardar o
mínimo, bucket e tabela privados, e a paciente podendo apagar os próprios
registros.

**Quando a aba aparece.** Só com `cicloMenstrual.ativo = true`. A chave é do
nutricionista, e a paciente pode desativar do lado dela — sem virar uma aba que
aparece para todo mundo por padrão.

---

## 7. Convite por WhatsApp

```
1. Nutri clica "Convidar paciente"
     → patient-invite (service_role) normaliza o telefone, gera token, grava o hash
     → enfileira template aprovado com botão de URL dinâmica
2. Paciente toca no botão → define e-mail e senha
     → patient-accept-invite valida token e prazo, cria auth.user com role='patient',
       cria patient_users, registra o consentimento
3. Dali em diante: login normal
```

**Cadastro aberto não pode existir.** O vínculo só é criado por código
privilegiado, e o token vai hasheado.

**Guarda de telefone.** `wa_normalizar_telefone()` devolve `NULL` quando o número
não é confiável — e o banco tem telefone em três formatos. O botão precisa estar
desabilitado, com motivo visível, quando o telefone não normaliza.

**Template aprovado é caminho crítico.** Convite é mensagem iniciada pelo
negócio, fora da janela de 24h: pela Cloud API só passa como template aprovado
pela Meta. Aprovação leva até 24h e reprovação na primeira tentativa é comum.

**Os templates existentes são de um nutricionista só.** Os já escritos têm o nome
cravado no corpo — *"…sua consulta com o nutricionista **Emerson Lima** amanhã…"*.
Como produto de plataforma, o nome vira variável. Cabe nas regras da Meta, mas é
reescrita e reaprovação de todos os templates.

**De qual número sai a mensagem** é a decisão de maior impacto no cronograma:

| | Modelo A — número da plataforma | Modelo B — número de cada nutri |
|---|---|---|
| Esforço | só aprovar templates | Embedded Signup + aprovação como Tech Provider |
| Conversão | pior: remetente desconhecido | melhor: número que o paciente já conhece |
| Limite diário | compartilhado entre todos (250/dia no início) | de cada assinante |
| Token | um, direto | System User token do seu BM |

`whatsapp_config` já é uma linha por nutricionista, e o `WHATSAPP_TOKEN` único em
Secret **já é o desenho certo do modelo B** — falta só a parte da Meta.
Recomendação: **A no lançamento, B como evolução**, já gravando
`phone_number_id` por nutri desde o começo.

Custo: template é cobrado por conversa, então é custo por assinante e precisa
estar no preço do plano. Utilidade é mais barato que Marketing.

---

## 8. RLS

O padrão do banco é "dono da linha faz tudo". As policies do paciente **somam** a
esse padrão — permissivas se combinam com `OR`, então nada do que o
nutricionista já faz é afetado.

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

| Tabela | Paciente pode |
|---|---|
| `patients` | ler a própria linha, colunas não sensíveis |
| `profiles` | ler **só** o nutri dele, via `v_nutri_publico` |
| `jornada` | **nada direto** — só via `v_jornada_paciente` |
| `anamnese` | **nada direto** — contém `observacoesNutricionista` |
| `agenda_tasks` | **nada direto** — só data e hora, via view |
| `resumos_consulta`, `relatorios_evolucao`, `analise_exames` | ler apenas o que for liberado |
| `avaliacoes_fisicas` | subconjunto de colunas — sem `observacoes` |
| `questionario_envios` | ler os próprios envios |
| `questionario_respostas` | inserir, se o envio é dele, no prazo e não respondido |
| `paciente_exames`, `paciente_medidas`, `jornada_task_checkins` | CRUD nas próprias linhas |
| `paciente_ciclo_registros` | CRUD nas próprias linhas — inclusive apagar |
| `checkin_feedbacks`, `planos_alimentares` | ler apenas onde `publicado_em is not null` |
| `orientacoes_ciclo`, `receitas_culinarias` | ler as do nutri dele, mais as padrão da plataforma |
| financeiro, `leads`, `kanban_*`, `funis_*`, `mind_maps` | **nenhum acesso** |

Três pontos de atenção:

- `questionario_respostas` **não tem coluna `user_id`** — a policy precisa passar
  por `envio_id` até `questionario_envios`.
- Documentos não são visíveis por padrão. Precisa de
  `liberado_para_paciente boolean default false` em resumos, relatórios e plano.
  Padrão negado, liberação explícita.
- Como isso roda sobre dado de terceiros, a matriz precisa virar **teste
  automatizado**, não conferência manual: um script que autentica como paciente de
  teste e tenta ler cada tabela proibida, a cada deploy. É o único jeito de um
  prompt na Lovable não reabrir um vazamento silenciosamente.

---

## 9. IA: receitas e tira-dúvidas

As duas abas com IA são as mais atraentes e as mais delicadas — é uma IA falando
de saúde com paciente, sob o CRN do assinante. Isso não impede construir; define
como construir.

**Escopo fechado, não aberto.** A IA responde a partir do material *daquele*
paciente e *daquele* nutricionista: o plano alimentar dele, os materiais
liberados, as receitas cadastradas. Não é um chat de nutrição genérico.

**Nunca prescreve nem altera.** Não muda plano, não ajusta dose, não interpreta
exame, não sugere suplemento. Pergunta fora do escopo vira encaminhamento: "vou
registrar essa dúvida para o seu nutricionista".

**Fila de dúvidas para o nutricionista.** Toda pergunta encaminhada aparece na
tela dele — o que também vira informação clínica de graça: dá para ver o que os
pacientes mais perguntam.

**Log completo e revisável**, com o assinante podendo desligar a IA na conta
dele. Como você é operador e ele é controlador (§12), essa chave precisa ser
dele.

Para a IA de receitas, o caminho mais seguro é **compor, não inventar**: gerar a
partir da biblioteca de receitas cadastrada e da lista de alimentos do plano, em
vez de texto livre. Menos criativo, muito mais defensável — e evita sugerir
alimento que o paciente tem alergia ou restrição.

Isso é fase tardia. Nada aqui bloqueia o lançamento.

---

## 10. Faseamento

| Fase | Entrega | Depende de |
|---|---|---|
| **0** | Segurança: RLS de `profiles`, bucket privado, teste automatizado da matriz | — |
| **1** | Fundação: `patient_users`, convites, views, template aprovado na Meta, gate de assinatura | 0 |
| **2** | **Pré-consulta**: login, PWA, anamnese pelo app, anexo de exames, rascunho revisável | 1 |
| **3** | Rastreamento metabólico: criar o tipo, o modelo e a tela | 2 |
| **4** | **Ciclo semanal**: aba Check-ins, resposta, feedback publicável | 2 |
| **5** | Entregas: plano alimentar em PDF versionado, resumos, materiais | 2 |
| **6** | Ciclo menstrual: registro, cálculo de fase, orientações | 2 |
| **7** | Receitas (biblioteca com busca) | 5 |
| **8** | Abertura para assinantes: branding, onboarding, modelos padrão, suporte | 4 |
| **9** | IA: tira-dúvidas e composição de receitas | 7, 8 |

A ordem segue a sua: **a fase 2 já entrega valor sozinha.** Anamnese preenchida
pelo paciente antes da consulta economiza tempo em toda primeira consulta, mesmo
sem nenhuma outra aba existir. É o melhor ponto de corte para um piloto.

Rollout: seus próprios pacientes primeiro. Ao fim da fase 2, 3 a 5 pacientes
seus na anamnese pelo app. Ao fim da fase 4, o ciclo semanal completo. Só depois
2 ou 3 assinantes de confiança, antes da abertura geral.

Uma dependência externa a resolver cedo: a integração de WhatsApp está numa
branch que nunca foi mesclada, e este repositório não tem branch principal.
Confirmar se ela já está aplicada no Supabase de produção — o convite depende
dela por inteiro.

---

## 11. Sobre o tamanho disto

O escopo cresceu bastante em relação ao MVP inicial: eram quatro blocos, agora
são dez abas, mais IA. Vale dizer com todas as letras que **isso é um produto,
não uma tela a mais** — e que o caminho seguro é entregar a metade 1
(pré-consulta) completa e em produção antes de abrir a metade 2.

Se em algum momento for preciso cortar, a ordem de corte que menos machuca é:
IA → receitas → ciclo → materiais → rastreamento. Anamnese, check-in e feedback
são o esqueleto; o resto é músculo.

O ciclo é o caso mais interessante dessa lista: é a aba de maior valor percebido
por paciente mulher — é o único item que ela abriria mesmo sem você pedir — e ao
mesmo tempo é a que mais exige cuidado de comunicação, porque previsão errada
com cara de certeza queima confiança rápido. Vale construir, mas não como aba
apressada.

---

## 12. LGPD

O app trata dado de saúde de titular que não é seu cliente. Como funcionalidade
de plataforma, **o assinante é o controlador e você é o operador**. A diferença é
contratual, não técnica.

- **Contrato de operador** nos termos da plataforma, incluindo o que acontece
  quando o assinante cancela.
- **Consentimento** registrado no aceite do convite, com data e versão do texto.
- **Política de privacidade** própria do app do paciente.
- **Revogação:** `patient_users.ativo = false` corta o acesso na hora, sem apagar
  o prontuário — documento clínico tem retenção própria (CFN: 10 anos).
- **Storage privado** para foto corporal e exame, sempre.
- **Trilha de acesso** para documentos, e log das interações com a IA.
- **Saída do assinante:** definir agora o que acontece com os acessos dos
  pacientes dele quando a assinatura termina. Sem regra escrita, o padrão vira
  "continua funcionando para sempre".

---

## 13. Aberto — precisa de decisão ou verificação

1. **De qual número sai o WhatsApp** — modelo A ou B (§7). Maior impacto no
   cronograma.
2. **Nome do app externo de prescrição**, para verificar se ele tem API de
   exportação — mudaria "subir PDF na mão" para "puxar automático" mais adiante.
3. **Quem escreve as orientações por fase do ciclo?** Você escreve as suas, ou a
   plataforma entra com um conjunto padrão que o assinante edita? A segunda
   opção é o que faz a aba não nascer vazia para quem assina.
4. **Assinatura: é Hotmart.** Existe uma Edge Function `hotmart-webhook`, então
   o gate da §4 provavelmente sai do que ela grava. Falta confirmar em qual
   tabela, e se há um campo de plano ou só de status de pagamento.
5. Confirmar se `receitas` é mesmo financeira (§6.5).
6. Colunas de `raio_x_semanal`, hoje vazia: reaproveitar ou criar nova?
7. Existe trigger de criação automática em `profiles` no signup?
8. Confirmar no painel se `avaliacoes-fotos` é bucket público.
9. A integração de WhatsApp da branch já foi aplicada em produção?
10. Domínio do app do paciente.
