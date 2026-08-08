# Integração WhatsApp — De Nutri para Nutri

Integração do app com a **WhatsApp Cloud API oficial da Meta**, para automação
de lembretes, follow-up de leads e envio de questionários — sem risco de
banimento do número.

---

## O que isso faz

| Automação | Gatilho | Fonte no banco |
|---|---|---|
| **Lembrete de consulta 24h** | 1 dia antes | `agenda_tasks.data_inicio` |
| **Lembrete de consulta 2h** | 2 horas antes | `agenda_tasks.data_inicio` |
| **Follow-up de lead** | quando vence a próxima ação | `leads.data_proxima_acao` |
| **Envio de questionário** | quando o envio é gerado | `questionario_envios` |
| **Cobrança de questionário** | 24h antes do prazo, se não respondeu | `questionario_envios` + `questionario_respostas` |

Além disso, **toda mensagem recebida** vira registro no CRM: se o número não
existe em `leads` nem em `patients`, um lead novo é criado com origem
`WhatsApp`. É o lead que hoje chega no WhatsApp e se perde por ninguém
cadastrar na hora.

E **se o lead responde, o follow-up automático pendente é cancelado na hora** —
o robô não insiste em cima de quem já está falando com você.

---

## Como funciona

```
                    ┌──────────────────────────┐
   Meta Cloud API ──▶│    whatsapp-webhook      │  mensagem recebida
        (webhook)    │  (público, valida HMAC)  │  → grava, abre janela 24h,
                     └────────────┬─────────────┘    casa com lead/paciente
                                  ▼
                        ┌───────────────────┐
                        │  tabelas whatsapp_*│
                        └─────────┬─────────┘
                                  ▲
   pg_cron (10 em 10 min)         │
        │                         │
        ▼                         │
   ┌──────────────────┐    ┌──────┴──────────┐
   │ whatsapp-worker  │───▶│ wa_agendar_todas│  varre agenda/leads/questionários
   │  (fase despacho) │    └─────────────────┘  e ENFILEIRA
   └────────┬─────────┘
            │
            ▼
     Meta Cloud API          ┌──────────────────┐
                             │  whatsapp-send   │◀── botão no app (com JWT)
                             └──────────────────┘
```

O cron **nunca envia direto**. Ele enfileira em `whatsapp_fila`; o worker
despacha. Isso dá retry com backoff, deduplicação e auditoria de graça — e
significa que um bug no agendamento não vira 300 mensagens enviadas.

---

## Instalação

Siga na ordem:

1. **[docs/01-setup-meta.md](./docs/01-setup-meta.md)** — conta Meta, número,
   token permanente. Comece pela verificação do negócio: leva dias.
2. **[docs/02-templates.md](./docs/02-templates.md)** — os 5 templates,
   com os textos prontos pra copiar.
3. **[docs/03-deploy.md](./docs/03-deploy.md)** — SQL, secrets, functions,
   testes e ativação gradual.

```
whatsapp/
├── README.md
├── docs/
│   ├── 01-setup-meta.md
│   ├── 02-templates.md
│   └── 03-deploy.md
└── sql/
    ├── 001_schema.sql     tabelas + normalização de telefone
    ├── 002_rls.sql        Row Level Security
    └── 003_cron.sql       automações + pg_cron

supabase/functions/
├── _shared/
│   ├── meta.ts            cliente da Cloud API
│   └── telefone.ts        normalização E.164
├── whatsapp-webhook/      recebe da Meta       (público, HMAC)
├── whatsapp-send/         envio manual do app  (JWT)
└── whatsapp-worker/       motor do cron        (público, segredo)
```

---

## Três coisas que você precisa saber antes de começar

### 1. O número sai do celular
Um número na Cloud API **não funciona mais no app WhatsApp Business**. Use um
chip novo para as automações e mantenha o seu atual no celular. Detalhes em
`docs/01-setup-meta.md`.

### 2. A janela de 24h manda em tudo
Fora de 24h desde a última mensagem do contato, a Meta **só aceita template
aprovado**. Não existe "mandar um textinho" automático — por isso os 5
templates são obrigatórios, e por isso PDF (exames, "Sua Evolução") só sai
com a janela aberta.

### 3. LGPD: isso aqui é dado de saúde
Paciente de nutrição é **dado pessoal sensível** (art. 5º, II da LGPD). O que
já está tratado no código:

- `whatsapp_contatos` registra **opt-in com data e origem**
- opt-out por palavra-chave (`SAIR`, `PARAR`, `DESCADASTRAR`…) é automático,
  e o worker bloqueia qualquer envio a quem optou por sair
- RLS isola tudo por nutricionista
- `whatsapp_mensagens` não é editável nem apagável pela UI

O que **depende de você**:

- **Nenhum conteúdo clínico em template.** Resultado de exame, diagnóstico e
  conduta vão em conversa individual, nunca em disparo automático. Os textos
  em `docs/02-templates.md` foram escritos assim de propósito.
- Registrar o consentimento na captação (quiz, contrato, formulário).
- Nada de lista comprada ou disparo frio — além de ilegal, é o que restringe
  o número.

---

## Estado atual

Código pronto para deploy, **ainda não instalado**. Nada foi alterado nas
tabelas existentes do app (`leads`, `patients`, `agenda_tasks`,
`questionario_envios` são apenas lidos).

Para o app não ficar mudo, ainda faltam as telas no Lovable:
uma caixa de conversas lendo `whatsapp_mensagens`, um botão "Enviar WhatsApp"
chamando a `whatsapp-send`, e um painel de liga/desliga sobre
`whatsapp_automacoes`. O back-end já suporta as três.
