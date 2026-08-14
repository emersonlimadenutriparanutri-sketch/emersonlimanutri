# Meu Acompanhamento — app do paciente

App para os pacientes, ligado ao mesmo Supabase do **De Nutri para Nutri**. O paciente
acompanha o plano, envia o check-in semanal, responde questionários, conversa com o
nutricionista, registra o diário alimentar e vê a própria evolução. Multi-nutri desde o
início: qualquer nutricionista da plataforma libera o acesso para os pacientes dele, e o
paciente vê o nome e o avatar de quem o acompanha.

É um PWA mobile-first: instala na tela de início do celular e abre como aplicativo.

## O que tem dentro

| Tela | O que faz |
|---|---|
| Início | Check-in da semana, próxima consulta, resumo da evolução, avisos |
| Meu plano | Jornada, etapas, tarefas e pilares publicados pelo nutricionista |
| Check-in | Raio-X semanal: peso, adesão, sono, energia, estresse, intestino, texto livre |
| Evolução | Gráficos de peso/gordura/cintura, histórico de avaliações e relatórios |
| Exames | Análise dos exames, quando o nutricionista libera |
| Questionários | Formulários enviados pelo app do nutri, respondidos direto aqui |
| Conversa | Chat com o nutricionista, em tempo real |
| Diário | Registro de refeições com foto, fome e saciedade |
| Materiais | Receitas, PDFs, vídeos e textos liberados pelo nutricionista |
| Lembretes | Água, suplementos, refeições e ativação das notificações push |
| Área do nutri | Gerar convites, controlar o que cada paciente vê, responder conversas |

## Como o acesso funciona

1. O nutricionista entra em `/nutri` com o mesmo login do app De Nutri para Nutri.
2. Na lista de pacientes, clica em **Gerar convite** — sai um link `/convite/<token>`,
   válido por 30 dias, que dá para copiar ou mandar direto no WhatsApp.
3. O paciente abre o link, cria uma senha e a conta fica vinculada ao cadastro dele.
4. A partir daí ele entra por `/entrar` com e-mail e senha.

Gerar um convite novo revoga o anterior que ainda não foi usado. Se o cadastro do
paciente tem e-mail, o convite fica preso àquele e-mail.

## Setup

### 1. Banco de dados

Rode `supabase/migrations/20260814000000_app_paciente.sql` inteiro no SQL Editor do
Supabase. Ele cria as tabelas novas, as funções de convite e as políticas de RLS.

As políticas novas são **aditivas** — o Postgres aplica OR entre policies do mesmo
comando, então nada do que o app do nutricionista já enxerga muda.

O que a migration cria:

- `patient_users` — vínculo entre um login e um paciente
- `patient_invites` — convites gerados pelo nutricionista
- `patient_app_settings` — o que cada paciente pode ver
- `patient_messages` — chat
- `diario_alimentar`, `lembretes`, `materiais`, `push_subscriptions`
- Funções: `criar_convite_paciente`, `convite_info`, `aceitar_convite`, `meus_exames`,
  `sou_este_paciente`, `paciente_pode_ver`
- Buckets `paciente-diario` e `paciente-chat`

### 2. Variáveis de ambiente

```bash
cp .env.example .env
```

Preencha `VITE_SUPABASE_ANON_KEY` com a anon key do projeto (Supabase → Project Settings
→ API). `VITE_VAPID_PUBLIC_KEY` é opcional — sem ela o app funciona normalmente, só não
oferece push.

### 3. Rodar

```bash
npm install
npm run dev      # desenvolvimento
npm run build    # build de produção em dist/
```

O `dist/` é estático: sobe em Vercel, Netlify, Cloudflare Pages ou no próprio Supabase
Storage. Configure o host para servir `index.html` em qualquer rota (SPA fallback), senão
o link do convite quebra ao ser aberto direto.

## Permissões por paciente

Cada paciente tem uma linha em `patient_app_settings` controlando o que aparece:

| Campo | Padrão |
|---|---|
| `ver_jornada`, `ver_evolucao`, `ver_relatorios`, `ver_consultas` | ligado |
| `chat_ativo`, `diario_ativo`, `materiais_ativo` | ligado |
| `ver_exames` | **desligado** |

Exames vêm desligados de propósito: laudo é documento clínico e a liberação deve ser uma
decisão consciente, caso a caso. Dá para mudar tudo isso na área do nutri, em
**Permissões**, ou direto pelo conector no Claude.

## Decisões que valem saber

**Check-in semanal.** Grava em `raio_x_semanal`, na coluna `data` (JSONB), com
`semana_referencia` na segunda-feira da semana e a marca `enviado_pelo_app: true`.
Se o app do nutricionista espera outro formato nesse JSONB, o mapeamento fica em
`RaioXRespostas` (`src/lib/types.ts`) — é o único ponto a ajustar.

**Exames.** A coluna `data` de `analise_exames` carrega os PDFs originais em base64 —
centenas de KB por linha. Buscar isso no celular do paciente seria cruel, então a função
`meus_exames()` devolve só o texto das análises, já sem os arquivos.

**Relatórios em Markdown.** `relatorios_evolucao.conteudo` é Markdown com tabelas. Em vez
de puxar uma biblioteca inteira, `src/components/Markdown.tsx` renderiza o subconjunto
usado ali: títulos, listas, tabelas, negrito e código.

**Peso do bundle.** As rotas carregam sob demanda. O recharts (390 KB) só é baixado quando
o paciente abre a tela de evolução; a entrada fica em ~129 KB comprimidos.

## Notificações push — o que falta

O app já pede permissão, registra o dispositivo em `push_subscriptions` e o service worker
já sabe exibir a notificação. **O envio ainda não existe**: falta uma Edge Function que leia
`lembretes` e `push_subscriptions` e dispare o push com a chave VAPID privada, chamada por um
cron. Enquanto isso não existe, os lembretes funcionam como lista dentro do app, sem alerta
no celular.

## Estrutura

```
src/
  components/    Layout, estados de carregamento/vazio, Markdown
  contexts/      AuthContext — sessão, vínculo, paciente, nutri, permissões
  hooks/         useDados — busca assíncrona com recarga
  lib/           supabase, tipos, consultas, formatação, convite, push
  pages/         telas do paciente
  pages/nutri/   área do nutricionista
supabase/migrations/
```
