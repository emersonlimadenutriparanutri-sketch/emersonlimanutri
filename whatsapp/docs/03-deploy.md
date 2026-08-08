# 3. Deploy no Supabase (app feito no Lovable)

Como o app é no-code/Lovable rodando sobre Supabase, o caminho mais direto é:
**SQL você cola no painel do Supabase, as Edge Functions você sobe pelo CLI**
(ou pede pro Lovable criar, colando o conteúdo dos arquivos).

---

## Passo 1 — Rodar o SQL

No Supabase: **SQL Editor → New query**. Cole e rode, **nesta ordem**:

1. `whatsapp/sql/001_schema.sql` — tabelas, índices, normalização de telefone
2. `whatsapp/sql/002_rls.sql` — Row Level Security
3. `whatsapp/sql/003_cron.sql` — automações + agendamento

⚠️ Antes de rodar o **003**, troque no final do arquivo:
- `<PROJECT_REF>` → a ref do seu projeto (aparece na URL do painel)
- `<CRON_SECRET>` → o mesmo valor que você vai pôr no secret `CRON_SECRET`

Os três são idempotentes: pode rodar de novo se precisar corrigir algo.

---

## Passo 2 — Cadastrar os Secrets

**Supabase → Project Settings → Edge Functions → Secrets** (ou via CLI):

```bash
supabase secrets set \
  WHATSAPP_TOKEN="EAAG...tokenpermanentedopasso5" \
  WHATSAPP_APP_SECRET="chave_secreta_do_app" \
  WHATSAPP_VERIFY_TOKEN="o_que_voce_inventou" \
  CRON_SECRET="$(openssl rand -hex 32)"
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já existem
por padrão — não precisa criar.

> **Nunca** coloque o `WHATSAPP_TOKEN` numa tabela, num arquivo do front-end
> ou numa variável `VITE_*`. Ele dá acesso total ao envio pelo seu número.

---

## Passo 3 — Subir as Edge Functions

```bash
supabase functions deploy whatsapp-webhook --no-verify-jwt
supabase functions deploy whatsapp-worker  --no-verify-jwt
supabase functions deploy whatsapp-send
```

**Por que `--no-verify-jwt` nas duas primeiras:** a Meta e o pg_cron chamam
sem JWT de usuário. Elas se protegem sozinhas — o webhook valida a assinatura
HMAC da Meta, o worker valida o header `x-cron-secret`. A `whatsapp-send` é
chamada pelo app com usuário logado, então mantém a verificação de JWT.

**Sem CLI (direto pelo Lovable):** peça ao Lovable para criar três edge
functions com esses nomes e cole o conteúdo de cada `index.ts`. Os arquivos em
`supabase/functions/_shared/` precisam existir no mesmo projeto — Lovable
suporta arquivos compartilhados entre functions.

---

## Passo 4 — Registrar o webhook na Meta

1. Painel do app → **WhatsApp → Configuração → Webhooks → Editar**.
2. **URL de retorno de chamada:**
   ```
   https://<PROJECT_REF>.supabase.co/functions/v1/whatsapp-webhook
   ```
3. **Token de verificação:** o mesmo `WHATSAPP_VERIFY_TOKEN`.
4. **Verificar e salvar.** Se der erro, veja os logs da função — quase sempre
   é o verify token diferente.
5. Depois de salvar, em **Campos do webhook**, clique em **Assinar** em:
   - `messages` ← obrigatório (mensagens recebidas + status de entrega)

---

## Passo 5 — Ligar sua conta e as automações

No SQL Editor, **logado como o Emerson no app** (para `auth.uid()` resolver):

```sql
-- 5.1 — o seu número
insert into public.whatsapp_config (user_id, phone_number_id, waba_id, numero_exibicao, ativo)
values (
  auth.uid(),
  '123456789012345',        -- phone_number_id da Meta
  '987654321098765',        -- waba_id
  '+55 61 99999-9999',
  true
)
on conflict (user_id) do update
   set phone_number_id = excluded.phone_number_id,
       waba_id         = excluded.waba_id,
       numero_exibicao = excluded.numero_exibicao,
       ativo           = excluded.ativo;

-- 5.2 — as automações, TODAS DESLIGADAS por enquanto
insert into public.whatsapp_automacoes (user_id, chave, template_nome, ativo)
values
  (auth.uid(), 'lembrete_consulta_24h',  'lembrete_consulta_24h',  false),
  (auth.uid(), 'lembrete_consulta_2h',   'lembrete_consulta_2h',   false),
  (auth.uid(), 'followup_lead',          'followup_lead',          false),
  (auth.uid(), 'envio_questionario',     'envio_questionario',     false),
  (auth.uid(), 'cobranca_questionario',  'cobranca_questionario',  false)
on conflict (user_id, chave) do nothing;
```

Se preferir rodar como service_role (fora da sessão do app), troque
`auth.uid()` pelo UUID do usuário — no banco atual ele é
`281b6d15-1b04-432e-a162-d06988887bcc`.

---

## Passo 6 — Testar antes de ligar qualquer automação

### 6.1 Mande uma mensagem PARA o número da API pelo seu celular pessoal

Isso testa o webhook inteiro. Confira:

```sql
select wa_id, nome, opt_in, ultima_msg_recebida_em
  from public.whatsapp_contatos order by created_at desc limit 5;

select direcao, tipo, conteudo, status, created_at
  from public.whatsapp_mensagens order by created_at desc limit 5;
```

Deve ter aparecido um contato (e um lead novo com origem `WhatsApp`, se o
número não estava cadastrado) e uma mensagem de `entrada`.

**Se não apareceu nada:** veja os logs da `whatsapp-webhook`. Erro 401 =
`WHATSAPP_APP_SECRET` errado. Nenhuma chamada = webhook não assinou o campo
`messages` no passo 4.

### 6.2 Teste um template no seu próprio número

```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/whatsapp-send" \
  -H "Authorization: Bearer <JWT_DO_USUARIO_LOGADO>" \
  -H "Content-Type: application/json" \
  -d '{
    "telefone": "(61) 99999-9999",
    "template": "lembrete_consulta_24h",
    "params": ["Emerson", "12/08", "14:30"]
  }'
```

### 6.3 Force uma rodada do worker

```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/whatsapp-worker" \
  -H "x-cron-secret: <CRON_SECRET>"
```

Resposta esperada: `{"agendadas":{...},"enviados":0,"falhas":0,"pulados":0}`.
Com tudo desligado, os contadores ficam zerados — é esse o resultado correto
neste ponto.

---

## Passo 7 — Ligar as automações, UMA POR VEZ

Esta é a parte onde dá pra estragar o número. Siga a ordem:

```sql
-- Semana 1: a mais segura. Paciente já é seu, já espera o contato.
update public.whatsapp_automacoes set ativo = true
 where chave = 'lembrete_consulta_24h' and user_id = auth.uid();
```

Rode uma semana. Confira a **nota de qualidade** do número no WhatsApp Manager
(precisa continuar **verde**) e o log:

```sql
select automacao, status, count(*)
  from public.whatsapp_mensagens
 where direcao = 'saida' and created_at > now() - interval '7 days'
 group by 1, 2 order by 1;
```

Só então:

- **Semana 2:** `lembrete_consulta_2h` e `envio_questionario`
- **Semana 3:** `cobranca_questionario`
- **Semana 4:** `followup_lead` ← deixe por último. É a única de categoria
  **marketing**, é a que gera bloqueio, e é a que derruba a nota de qualidade
  se disparar pra lead frio.

Ligar as cinco no mesmo dia é o caminho mais rápido para um número restringido.

---

## Monitoramento

```sql
-- Fila travada?
select automacao, status, count(*), max(ultimo_erro)
  from public.whatsapp_fila group by 1, 2;

-- Nada saindo? o cron está rodando?
select jobname, schedule, active from cron.job;
select start_time, status, return_message
  from cron.job_run_details
 where jobid = (select jobid from cron.job where jobname = 'whatsapp-worker')
 order by start_time desc limit 10;

-- Quem pediu pra sair
select wa_id, nome, opt_out_em from public.whatsapp_contatos where opt_out;
```

---

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Webhook não verifica | `WHATSAPP_VERIFY_TOKEN` diferente do que você digitou na Meta |
| Webhook responde 401 | `WHATSAPP_APP_SECRET` errado |
| Erro `131047` no envio | Fora da janela de 24h e você mandou texto livre em vez de template |
| Erro `132001` | Template não existe, não foi aprovado, ou o idioma não é `pt_BR` |
| Erro `131026` | O número não tem WhatsApp — ou o cadastro está sem o 9º dígito |
| Erro `190` | Token expirado — você usou o token de teste de 24h, não o permanente |
| Fila cheia de `pendente` | `whatsapp_config.ativo = false`, ou o cron não está rodando |
| Nada agendado | A automação está com `ativo = false` em `whatsapp_automacoes` |

---

## Higiene dos telefones (faça antes de ligar o follow-up)

Hoje o banco tem telefone em três formatos (`19992390247`,
`55 61 9943-2661`, `(61) 99679-8718`). A função `wa_normalizar_telefone()`
resolve os casos normais, mas o que ela **não** consegue normalizar é
silenciosamente ignorado pelas automações. Veja o estrago antes:

```sql
select 'lead' as origem, id, nome, telefone
  from public.leads
 where telefone is not null and telefone <> ''
   and wa_normalizar_telefone(telefone) is null
union all
select 'paciente', id, nome, telefone
  from public.patients
 where telefone is not null and telefone <> ''
   and wa_normalizar_telefone(telefone) is null;
```

Corrija esses cadastros na mão. São eles que nunca vão receber nada.

### O caso mais traiçoeiro: o 9º dígito faltando

Pior que o telefone impossível de normalizar é o que **normaliza errado**. O
cadastro `55 61 9943-2661` vira `556199432661` — 12 dígitos, ou seja, um
celular sem o nono dígito. A função não tem como adivinhar se falta um `9` ou
se é um fixo, então devolve como está e a Meta responde erro `131026`
("número não existe no WhatsApp").

Liste os suspeitos:

```sql
select 'lead' as origem, id, nome, telefone, wa_normalizar_telefone(telefone) as e164
  from public.leads
 where length(wa_normalizar_telefone(telefone)) = 12
union all
select 'paciente', id, nome, telefone, wa_normalizar_telefone(telefone)
  from public.patients
 where length(wa_normalizar_telefone(telefone)) = 12;
```

Nem todo resultado está errado (fixo com DDD tem 12 dígitos mesmo), mas todo
celular nessa lista está. Conferir isso agora custa 10 minutos; descobrir
depois custa lembretes de consulta que nunca chegaram.
