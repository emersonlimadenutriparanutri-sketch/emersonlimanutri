# 1. Configurar a WhatsApp Cloud API na Meta

Essa é a parte chata e é toda feita no navegador, fora do código. Reserve
**uma tarde**. A parte técnica (SQL + funções) leva 20 minutos; a burocracia
da Meta leva dias por causa da verificação.

---

## ⚠️ Leia isto antes de qualquer coisa

**O número que você usar na Cloud API sai do aplicativo WhatsApp Business do
celular.** Não dá pra ter os dois. Quando o número é migrado para a API, o app
para de funcionar naquele número — todo o atendimento passa a acontecer via
API/integração.

Você tem duas saídas:

| Opção | O que acontece |
|---|---|
| **Chip novo só pra API** (recomendado no começo) | Seu número atual continua no celular normalmente. As automações saem de um número novo. Você testa sem risco. |
| **Migrar o número atual** | Ganha o histórico e o reconhecimento do número, mas perde o app no celular e o atendimento manual precisa ser feito dentro do app De Nutri para Nutri. |

Comece com **chip novo**. Se as automações provarem valor, migra depois.

---

## Passo a passo

### 1. Conta Meta Business verificada
1. Acesse [business.facebook.com](https://business.facebook.com).
2. **Configurações do Negócio → Central de Segurança → Verificação do negócio.**
3. Envie os documentos do CNPJ (cartão CNPJ, comprovante de endereço).
   → **Isso pode levar de 1 a 5 dias úteis.** Comece por aqui.

Sem verificação você fica limitado a 250 conversas por dia e não consegue
subir o limite.

### 2. Criar o app
1. [developers.facebook.com](https://developers.facebook.com) → **Meus apps → Criar app**.
2. Tipo: **Negócios (Business)**.
3. No painel do app: **Adicionar produto → WhatsApp → Configurar**.

### 3. Associar a WhatsApp Business Account (WABA) e o número
1. Ainda no produto WhatsApp, crie ou selecione a WABA.
2. **Adicionar número de telefone.** Use o chip novo. A Meta manda um código
   por SMS ou ligação.
3. Defina o **nome de exibição** (ex.: `Emerson Lima Nutrição`).
   → Passa por aprovação. Não pode ser genérico tipo "Nutricionista".

### 4. Anotar os dois IDs
Na tela do produto WhatsApp → **Configuração da API**, copie:

- **Identificação do número de telefone** (`phone_number_id`) — número longo.
- **Identificação da conta do WhatsApp Business** (`waba_id`).

⚠️ `phone_number_id` **não** é o número de telefone. É um ID interno da Meta.

### 5. Gerar o token PERMANENTE

O token que aparece na tela de teste **expira em 24 horas**. Não use ele.
Para gerar um permanente:

1. **business.facebook.com → Configurações do Negócio → Usuários → Usuários do sistema**.
2. **Adicionar** → nome: `api-whatsapp` → função: **Administrador**.
3. Nesse usuário, **Adicionar ativos**:
   - o **app** que você criou (permissão total)
   - a **WABA** (permissão total)
4. **Gerar novo token** → selecione o app → marque as permissões:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
5. Em "Expiração do token", escolha **Nunca**.
6. **Copie o token agora.** Ele não é mostrado de novo.

### 6. Pegar o App Secret
No painel do app: **Configurações → Básico → Chave secreta do app → Mostrar**.

Esse valor é o que valida a assinatura dos webhooks. Sem ele, qualquer pessoa
que descobrir a URL do webhook consegue injetar mensagens falsas no seu banco.

### 7. Inventar um Verify Token
É uma senha qualquer que **você** escolhe — a Meta só devolve ela de volta no
handshake. Gere algo aleatório:

```bash
openssl rand -hex 24
```

---

## O que você deve ter no fim

Guarde os cinco valores; eles vão para os Secrets do Supabase no passo 3:

| Valor | Onde achou |
|---|---|
| `WHATSAPP_TOKEN` | token permanente do usuário do sistema (passo 5) |
| `WHATSAPP_APP_SECRET` | Configurações → Básico (passo 6) |
| `WHATSAPP_VERIFY_TOKEN` | você inventou (passo 7) |
| `phone_number_id` | Configuração da API (passo 4) |
| `waba_id` | Configuração da API (passo 4) |

Os dois últimos vão numa linha da tabela `whatsapp_config`, não nos secrets.

---

## Limites e custo — o que esperar

**Limite de conversas iniciadas:** começa em **250 por 24h**. Sobe
automaticamente (1.000 → 10.000 → 100.000) conforme o volume cresce e a
**nota de qualidade** do número se mantém verde. Bloquear/denunciar derruba a
nota; nota vermelha faz o limite cair ou o número ser restringido.

**Cobrança:** a Meta cobra **por mensagem de template enviada**, com preço
diferente por categoria (utilidade, marketing, autenticação) e por país.
Mensagens de texto livre dentro da janela de 24h de atendimento não são
cobradas.

Como o preço muda com frequência e varia por país, **confira os valores
atuais** em
<https://developers.facebook.com/docs/whatsapp/pricing> antes de estimar o
custo mensal. Para dimensionar: some lembretes de consulta + follow-ups de
lead que você dispararia por mês — no volume de um consultório, o gasto tende
a ser baixo, mas o número exato depende da tabela vigente.

---

➡️ Próximo: [02-templates.md](./02-templates.md)
