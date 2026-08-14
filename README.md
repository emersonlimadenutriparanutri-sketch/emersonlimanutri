# OpenWA Service

Serviço de WhatsApp baseado no [@open-wa/wa-automate](https://github.com/open-wa/wa-automate-nodejs),
empacotado para rodar em VPS com Docker.

O que ele entrega:

- **API REST** para enviar texto, imagem, arquivo, áudio e localização;
- **Webhook** que avisa seu sistema a cada mensagem recebida (com assinatura HMAC);
- **Sessão persistente** — o QR Code é lido uma vez e fica salvo em volume;
- **Fila de envio** com intervalo aleatório entre mensagens, para reduzir risco de bloqueio;
- **Reconexão automática** quando a sessão cai.

---

## 1. Subir na VPS

Pré-requisitos: uma VPS Linux (2 vCPU / 2 GB de RAM já rodam bem) com Docker e
Docker Compose instalados.

```bash
# 1. Docker (caso ainda não tenha)
curl -fsSL https://get.docker.com | sh

# 2. Código
git clone https://github.com/emersonlimadenutriparanutri-sketch/emersonlimanutri.git openwa
cd openwa

# 3. Configuração
cp .env.example .env
openssl rand -hex 24            # copie o resultado para API_KEY no .env
nano .env

# 4. Pasta da sessão (o container roda como uid 1000, não como root)
mkdir -p data && sudo chown -R 1000:1000 data

# 5. Build e start
docker compose up -d --build

# 6. Acompanhe o boot (leva 1–2 min na primeira vez)
docker compose logs -f openwa
```

### Ler o QR Code

A porta fica publicada só em `127.0.0.1`, então leia o QR de dentro da VPS:

```bash
# QR em ASCII, direto no terminal (dá para apontar o celular para a tela)
curl -s -H "X-API-Key: SUA_CHAVE" "http://127.0.0.1:3000/api/session/qr?format=ascii"

# ou salve o PNG e abra na sua máquina
curl -s -H "X-API-Key: SUA_CHAVE" "http://127.0.0.1:3000/api/session/qr?format=png" -o qr.png
```

No celular: **WhatsApp → Aparelhos conectados → Conectar um aparelho**.

Confirme depois:

```bash
curl -s -H "X-API-Key: SUA_CHAVE" http://127.0.0.1:3000/api/session
# -> {"status":"connected","me":{"number":"5511999999999",...}}
```

> **Importante:** deixe a sessão rodando por pelo menos 5 minutos após ler o QR
> antes de reiniciar o container. É o tempo que o WhatsApp leva para gravar o
> pareamento; reiniciar antes disso costuma invalidar a sessão.

---

## 2. Expor com HTTPS

Não abra a porta 3000 na internet. Use um proxy reverso com TLS. Exemplo de
Nginx (`/etc/nginx/sites-available/openwa`):

```nginx
server {
    listen 443 ssl http2;
    server_name wa.seudominio.com.br;

    ssl_certificate     /etc/letsencrypt/live/wa.seudominio.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/wa.seudominio.com.br/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/openwa /etc/nginx/sites-enabled/
certbot --nginx -d wa.seudominio.com.br
nginx -t && systemctl reload nginx
```

Com Caddy é uma linha só no `Caddyfile`:

```
wa.seudominio.com.br {
    reverse_proxy 127.0.0.1:3000
}
```

---

## 3. API

Toda rota sob `/api` exige a chave, no header `X-API-Key: SUA_CHAVE`
(`Authorization: Bearer SUA_CHAVE` também funciona). `/health` é público.

O campo `to` aceita `5511999999999`, `+55 (11) 99999-9999`, `11999999999`
(assume DDI 55) ou um id pronto como `5511999999999@c.us` / `...@g.us`.

### Sessão

| Método | Rota | O que faz |
| --- | --- | --- |
| `GET` | `/health` | Processo vivo + status resumido (sem autenticação) |
| `GET` | `/health/ready` | 200 só quando o WhatsApp está pareado |
| `GET` | `/api/session` | Status completo, número conectado, último erro |
| `GET` | `/api/session/qr` | QR atual — `?format=json\|png\|ascii` |
| `POST` | `/api/session/restart` | Reinicia o navegador mantendo a sessão salva |
| `POST` | `/api/session/logout` | Desconecta o aparelho (exige ler o QR de novo) |

### Mensagens

```bash
# Texto
curl -X POST https://wa.seudominio.com.br/api/messages/text \
  -H "X-API-Key: SUA_CHAVE" -H "Content-Type: application/json" \
  -d '{"to":"5511999999999","message":"Olá! Sua consulta é amanhã às 14h."}'

# Responder citando uma mensagem: acrescente "quotedMsgId" ao mesmo endpoint
#   {"to":"5511999999999","message":"Isso mesmo","quotedMsgId":"false_5511...@c.us_ABC"}

# Imagem (por URL ou base64)
curl -X POST https://wa.seudominio.com.br/api/messages/image \
  -H "X-API-Key: SUA_CHAVE" -H "Content-Type: application/json" \
  -d '{"to":"5511999999999","url":"https://exemplo.com/plano.jpg","caption":"Seu plano alimentar"}'

# Arquivo (PDF, etc.)
curl -X POST https://wa.seudominio.com.br/api/messages/file \
  -H "X-API-Key: SUA_CHAVE" -H "Content-Type: application/json" \
  -d '{"to":"5511999999999","url":"https://exemplo.com/relatorio.pdf","filename":"relatorio.pdf"}'

# Demais endpoints, mesmos headers:
# POST /api/messages/audio     {"to":"...","url":"https://exemplo.com/audio.ogg"}
#      (ogg/opus vira áudio de voz; outros formatos viram anexo de áudio)
# POST /api/messages/location  {"to":"...","lat":-23.55,"lng":-46.63,"address":"Consultório"}
# POST /api/messages/seen      {"to":"..."}
# POST /api/messages/typing    {"to":"...","on":true}
```

Envio bem-sucedido responde `202` com o id da mensagem:

```json
{ "status": "sent", "id": "true_5511999999999@c.us_3EB0...", "to": "5511999999999@c.us" }
```

Base64 também é aceito em `image`, `file` e `audio`:
`{"to":"...","base64":"data:image/jpeg;base64,/9j/4AAQ..."}` — ou `base64` puro
acompanhado de `"mimetype":"image/jpeg"`.

### Consultas

| Método | Rota | O que faz |
| --- | --- | --- |
| `GET` | `/api/chats?limit=50` | Lista de conversas |
| `GET` | `/api/chats/:chatId/messages?limit=50` | Histórico de uma conversa |
| `GET` | `/api/contacts?limit=50` | Contatos |
| `GET` | `/api/numbers/:numero` | Confere se o número tem WhatsApp |

### Erros

Sempre no mesmo formato:

```json
{ "error": { "code": "ValidationError", "message": "O numero X nao tem WhatsApp ativo." } }
```

- `401` chave inválida
- `400` payload inválido
- `503` WhatsApp desconectado ou aguardando QR

---

## 4. Webhook (mensagens recebidas)

Defina `WEBHOOK_URL` no `.env`. Cada evento vira um `POST` JSON:

```json
{
  "event": "message",
  "sessionId": "emerson",
  "timestamp": "2026-08-14T12:00:00.000Z",
  "data": {
    "id": "false_5511999999999@c.us_ABC",
    "from": "5511999999999@c.us",
    "fromMe": false,
    "isGroupMsg": false,
    "type": "chat",
    "body": "Oi, queria marcar uma consulta",
    "sender": { "pushname": "Maria" }
  }
}
```

Eventos disponíveis (configuráveis em `WEBHOOK_EVENTS`):

- `message` — mensagem recebida;
- `ack` — mudança de status de entrega (enviado, entregue, lido);
- `state` — sessão conectou, caiu ou está pedindo QR;
- `call` — chamada recebida.

Se `WEBHOOK_SECRET` estiver definido, cada requisição leva
`X-OpenWA-Signature: sha256=<hmac>`. Valide assim no seu backend:

```js
const esperado = 'sha256=' + crypto.createHmac('sha256', SECRET).update(corpoBruto).digest('hex');
const ok = crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(req.get('X-OpenWA-Signature')));
```

Responda `2xx` rápido. Erros `5xx`/timeout são reenviados até
`WEBHOOK_MAX_RETRIES` vezes, com backoff de 1s, 2s, 4s.

---

## 5. Operação

```bash
docker compose logs -f openwa      # logs (JSON, uma linha por evento)
docker compose restart openwa      # reiniciar
docker compose up -d --build       # atualizar depois de um git pull
docker compose down                # parar (a sessão continua em ./data)
```

**Backup da sessão** — sem isso, uma migração de servidor exige ler o QR de novo:

```bash
docker compose stop openwa
tar czf openwa-sessao-$(date +%F).tar.gz data/
docker compose start openwa
```

### Problemas comuns

| Sintoma | Causa provável / o que fazer |
| --- | --- |
| Fica em `qr` e o QR expira sozinho | Normal: o QR é renovado a cada ~20s. Pegue o mais recente e leia rápido. |
| `status: error` com `ERR_TUNNEL_CONNECTION_FAILED` / timeout | A VPS não alcança `web.whatsapp.com`. Verifique firewall/proxy de saída. |
| Container reinicia sozinho durante o uso | Falta de memória. O Chromium precisa de ~1 GB; confira `shm_size` no compose. |
| Caiu para `disconnected` toda hora | O celular ficou muito tempo offline, ou o mesmo número está pareado em outro servidor. |
| `Sessao do WhatsApp indisponivel` em todo envio | Cheque `GET /api/session`; se o status for `error`, veja `lastError`. |

### Cuidados com bloqueio

Esta é uma automação não oficial do WhatsApp — a conta pode ser banida se o uso
parecer spam. Recomendações:

- use um número dedicado, com histórico e foto de perfil;
- fale só com quem já entrou em contato ou autorizou;
- mantenha os delays (`SEND_MIN_DELAY_MS` / `SEND_MAX_DELAY_MS`) ligados;
- evite disparos em massa com o mesmo texto — varie a mensagem;
- deixe sempre uma saída ("responda SAIR para não receber mais").

---

## 6. Rodar sem Docker (desenvolvimento)

```bash
npm install
cp .env.example .env   # deixe CHROME_EXECUTABLE_PATH vazio
npm start
```

Sem `CHROME_EXECUTABLE_PATH`, o puppeteer baixa o próprio Chromium na primeira
instalação.

---

## 7. Variáveis de ambiente

Todas estão documentadas em [`.env.example`](.env.example). As essenciais:

| Variável | Padrão | Para que serve |
| --- | --- | --- |
| `API_KEY` | — | **Obrigatória.** Chave de acesso à API |
| `SESSION_ID` | `default` | Nome da sessão (uma pasta por sessão em `data/`) |
| `WEBHOOK_URL` | vazio | Destino das mensagens recebidas |
| `WEBHOOK_SECRET` | vazio | Assina o webhook com HMAC-SHA256 |
| `SEND_MIN_DELAY_MS` / `SEND_MAX_DELAY_MS` | `1500` / `4000` | Intervalo entre envios |
| `CHECK_NUMBER_BEFORE_SEND` | `true` | Valida o número antes de enviar (resolve o 9º dígito) |
| `DEFAULT_COUNTRY_CODE` | `55` | DDI assumido quando o número vem sem ele |
| `MAX_MEDIA_MB` | `16` | Limite de tamanho de mídia |
