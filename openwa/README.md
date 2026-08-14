# OpenWA + MCP — passo a passo

Arquivos prontos para subir o [OpenWA](https://github.com/rmyndharis/OpenWA) com o
servidor MCP habilitado e conectar o Claude nele.

> **Por que isso está aqui e não rodando:** a tentativa de subir o stack neste
> ambiente falhou porque `production.cloudfront.docker.com` — o CDN de onde o
> Docker Hub serve todas as camadas de imagem — está bloqueado pela política de
> rede. Nenhum container chegou a ser criado. Estes arquivos são para você rodar
> numa máquina com acesso normal ao Docker Hub (seu computador, VPS ou servidor).

## Conteúdo

| Arquivo             | Para que serve                                      |
| ------------------- | --------------------------------------------------- |
| `env.exemplo`       | Vira o `.env` do OpenWA, com MCP já configurado     |
| `mcp.json.exemplo`  | Vira o `.mcp.json` que o Claude Code lê             |

---

## 1. Clonar e configurar

```bash
git clone https://github.com/rmyndharis/OpenWA.git
cd OpenWA
cp ../openwa/env.exemplo .env
```

Revise o `.env` — principalmente `ENGINE_TYPE` e `MCP_READONLY`.

## 2. Subir o stack

```bash
docker compose up -d
```

Isso compila a imagem da API a partir do código-fonte (Node + Chromium — alguns
minutos na primeira vez). Se quiser subir mais rápido para testar, use o arquivo
de desenvolvimento, que é o recomendado pelo README do projeto:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Acompanhe até a API ficar de pé:

```bash
docker compose logs -f openwa-api
```

Quando subir:

- Dashboard: <http://localhost:2785>
- API: <http://localhost:2785/api>
- Swagger: <http://localhost:2785/api/docs>

## 3. Pegar a chave de API

Na primeira subida o OpenWA gera uma chave:

```bash
cat data/.api-key
```

Para uso com agente, a documentação recomenda **não** usar essa chave mestra.
Crie no dashboard uma chave dedicada, com o menor privilégio possível
(`docs/24-mcp-integration.md`, seção 24.5):

- role `OPERATOR` no máximo — nunca admin;
- escopada para a sessão específica que o agente pode tocar;
- **sem** `allowedIps` — chamadas MCP não têm IP real de cliente, e uma chave com
  lista de IPs é rejeitada no MCP.

A chave em texto puro aparece **uma única vez**, na criação. Para rotacionar, crie
uma nova e apague a antiga.

## 4. Conectar o Claude

Copie o exemplo para a raiz do projeto de onde você usa o Claude Code e coloque a
chave real:

```bash
cp openwa/mcp.json.exemplo .mcp.json
```

```json
{
  "mcpServers": {
    "openwa": {
      "type": "http",
      "url": "http://localhost:2785/mcp",
      "headers": { "Authorization": "Bearer SUA_CHAVE_REAL" }
    }
  }
}
```

> **Adicione `.mcp.json` ao `.gitignore`.** Ele passa a conter uma credencial
> válida em texto puro. A própria documentação do OpenWA orienta isso.

Se o OpenWA estiver em outra máquina, troque `localhost` pelo host correspondente.

## 5. Verificar

No cliente, liste as ferramentas e chame uma leitura simples, como `SessionFindAll`,
para confirmar autenticação e execução.

O que você deve ver depende do modo:

| `MCP_READONLY` | Ferramentas expostas                                          |
| -------------- | ------------------------------------------------------------- |
| `true` (padrão) | Só leitura: listar sessões, ler chats, contatos, grupos       |
| `false`         | Leitura + escrita: enviar mensagens e demais mutações         |

Se as ferramentas de envio não aparecerem, é o modo read-only agindo — é o
comportamento padrão, não um erro. Só mude para `false` quando tiver certeza do
que o agente pode fazer com o número conectado.

---

## Antes de conectar um número

O README do OpenWA é direto sobre isso e vale repetir:

- É um gateway **não oficial**, baseado em clientes de engenharia reversa. O risco
  de restrição ou banimento da conta nunca é zero.
- **Use um número dedicado**, que você pode perder. Nunca o número pessoal nem o
  principal do consultório.
- **Aqueça números novos**: nos primeiros dias, use como humano — troque mensagens
  com contatos salvos, entre em algum grupo, defina foto de perfil. Não dispare
  em massa no primeiro dia.
- **Não faça disparo frio.** Mandar a primeira mensagem para uma lista grande de
  números que nunca falaram com você é o caminho mais rápido para a restrição.
- **Limite sua própria taxa de envio** (variáveis `RATE_LIMIT_*`). Poucas mensagens
  por minuto por sessão é sustentável.

## Referências

- `OpenWA/docs/24-mcp-integration.md` — integração MCP completa
- `OpenWA/.env.example` — todas as variáveis disponíveis
- `OpenWA/README.md` — visão geral e quick start
