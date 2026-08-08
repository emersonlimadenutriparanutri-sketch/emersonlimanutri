# 2. Templates de mensagem (HSM)

## Por que templates existem

A Meta divide as conversas em duas situações:

- **Dentro da janela de 24h** — o contato te mandou mensagem nas últimas 24h.
  Aqui você manda o que quiser: texto livre, PDF, áudio, imagem.
- **Fora da janela** — mais de 24h desde a última mensagem dele.
  Aqui você **só pode mandar template previamente aprovado pela Meta**.

**Toda automação agendada cai no segundo caso.** Lembrete de consulta,
follow-up de lead, cobrança de questionário — todos precisam de template
aprovado. Por isso este passo é obrigatório, não opcional.

Aprovação leva de alguns minutos a 24h. Rejeição é comum na primeira tentativa;
o motivo vem escrito e dá pra corrigir e reenviar.

---

## Onde cadastrar

**business.facebook.com → WhatsApp Manager → Modelos de mensagem → Criar modelo**

Para cada um abaixo: idioma **Português (BR)** — código `pt_BR`.

---

## As 5 regras que mais reprovam template

1. O corpo **não pode começar nem terminar com uma variável**.
   ❌ `{{1}}, sua consulta é amanhã` — ❌ `Acesse aqui: {{2}}`
2. **Duas variáveis não podem ficar coladas**: `{{1}}{{2}}` é rejeitado.
3. Categoria errada reprova. Lembrete de consulta é **UTILIDADE**;
   prospecção de lead é **MARKETING**. Marcar marketing como utilidade
   para fugir da cobrança é a rejeição mais comum.
4. O valor enviado numa variável **não pode ter quebra de linha, tab, nem
   4 espaços seguidos**.
5. Nada de conteúdo clínico no template. Diagnóstico, resultado de exame e
   conduta são dado sensível de saúde — vão em conversa, nunca em disparo
   automático.

---

## Template 1 — `lembrete_consulta_24h`

- **Categoria:** Utilidade
- **Idioma:** pt_BR

**Corpo:**
```
Oi, {{1}}! Passando pra lembrar da sua consulta com o nutricionista Emerson Lima amanhã, dia {{2}}, às {{3}}. Se precisar remarcar, é só me responder por aqui.
```

**Botões (resposta rápida):** `Confirmar presença` · `Preciso remarcar`

**Exemplos que a Meta pede no cadastro:**
`{{1}}` = `Ana` · `{{2}}` = `12/08` · `{{3}}` = `14:30`

> O `wa_agendar_lembretes_consulta()` já monta esses três parâmetros nessa
> ordem, a partir de `agenda_tasks.paciente_nome` e `data_inicio`.

---

## Template 2 — `lembrete_consulta_2h`

- **Categoria:** Utilidade

**Corpo:**
```
Oi, {{1}}! Sua consulta com o nutricionista Emerson Lima é hoje, às {{2}}. Te espero! Se tiver qualquer imprevisto, me avisa por aqui.
```

**Exemplos:** `{{1}}` = `Ana` · `{{2}}` = `14:30`

---

## Template 3 — `followup_lead`

- **Categoria:** **Marketing** (não tente cadastrar como utilidade)

**Corpo:**
```
Oi, {{1}}! Aqui é da equipe do nutricionista Emerson Lima. Vi que você demonstrou interesse no acompanhamento nutricional e queria saber se ainda faz sentido a gente conversar sobre isso. Se preferir não receber mais mensagens, é só responder SAIR.
```

**Exemplos:** `{{1}}` = `Ana`

> A palavra **SAIR** não é decorativa: o `whatsapp-webhook` reconhece
> `sair`, `parar`, `descadastrar`, `não quero` e `stop`, marca `opt_out = true`
> no contato e o worker passa a bloquear qualquer envio para ele. Isso é o
> art. 18 da LGPD funcionando na prática — mantenha essa frase.

---

## Template 4 — `envio_questionario`

- **Categoria:** Utilidade

**Corpo:**
```
Oi, {{1}}! Para eu preparar sua consulta com calma, preciso que você preencha este formulário: {{2}} — leva poucos minutos. Qualquer dúvida, me chama por aqui.
```

**Exemplos:** `{{1}}` = `Ana` · `{{2}}` = `https://app.denutriparanutri.com.br/q/c31aebb3`

> **Alternativa mais robusta:** em vez de mandar a URL como variável de corpo,
> cadastre um **botão de URL dinâmica** com base fixa
> `https://app.denutriparanutri.com.br/q/` e sufixo variável (só o token).
> A Meta aprova mais fácil e o link fica clicável de forma mais confiável.
> Se optar por isso, ajuste `enviarTemplate()` em `_shared/meta.ts` para
> incluir o componente `button`.

---

## Template 5 — `cobranca_questionario`

- **Categoria:** Utilidade

**Corpo:**
```
Oi, {{1}}! Seu formulário de pré-consulta ainda está em aberto. Quando puder, acesse {{2}} e finalize — assim eu consigo preparar tudo antes do nosso encontro.
```

**Exemplos:** `{{1}}` = `Ana` · `{{2}}` = `https://app.denutriparanutri.com.br/q/c31aebb3`

---

## Depois de aprovar

Os nomes acima são os **defaults do código**. Se você cadastrar com outro
nome na Meta, não precisa mexer no SQL — basta apontar na tabela de
automações:

```sql
update public.whatsapp_automacoes
   set template_nome = 'nome_que_voce_usou_na_meta'
 where chave = 'lembrete_consulta_24h'
   and user_id = auth.uid();
```

---

➡️ Próximo: [03-deploy.md](./03-deploy.md)
