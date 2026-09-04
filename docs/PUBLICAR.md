# Colocar no ar (e ter um link para mostrar)

Hoje o app existe como código no GitHub. Para virar um endereço que abre no
navegador, faltam duas coisas: **um banco de dados** e **uma hospedagem**.

Este guia cobre as duas, em cerca de 30 minutos, sem cartão de crédito.

> Se a intenção é só demonstrar, faça exatamente estes passos e depois rode o
> **conteúdo de demonstração** (passo 5). Você fica com um endereço com um
> consultório fictício completo, seguro para mostrar em aula, story ou reunião.

---

## Antes de começar

Você vai precisar de três contas gratuitas:

| Conta | Para quê |
|---|---|
| [github.com](https://github.com) | Guardar o código (você já tem, o projeto está lá) |
| [supabase.com](https://supabase.com) | Banco de dados e login |
| [vercel.com](https://vercel.com) | Hospedar o site e dar o endereço |

Entre nas três com o mesmo e-mail para não se perder depois.

---

## 1. Crie o banco (Supabase)

O passo a passo detalhado está em [`INSTALACAO.md`](INSTALACAO.md), seções 1 a 3.
Em resumo:

1. **New project** → nome `consultorio`, região **South America (São Paulo)**.
2. **SQL Editor → New query** → cole todo o `supabase/migrations/0001_schema.sql` → **Run**.
3. Repita com `0002_seed.sql` e `0003_conector_mcp.sql`.
4. Em **Authentication → Providers**, deixe *Email* ligado e desligue *Confirm email*
   enquanto estiver testando.
5. Em **Project Settings → API**, copie a **Project URL** e a chave **anon public**.

> A chave `service_role` fica no Supabase. Ela **nunca** vai para a Vercel nem para o app.

---

## 2. Publique o site (Vercel)

1. Entre em [vercel.com](https://vercel.com) com o GitHub.
2. **Add New → Project**.
3. Encontre o repositório `emersonlimanutri` e clique em **Import**.
4. A Vercel reconhece o Vite sozinho. Não mexa em *Build Command* nem em *Output Directory*.
5. Abra **Environment Variables** e adicione duas:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | a Project URL que você copiou |
   | `VITE_SUPABASE_ANON_KEY` | a chave anon public |

   Opcionalmente, para trocar o nome que aparece no app:

   | Name | Value |
   |---|---|
   | `VITE_BRAND_NAME` | `Emerson Lima Nutre` |
   | `VITE_BRAND_TAGLINE` | `Emagrecimento sustentável para mulheres 40+` |

6. **Deploy**. Em um a dois minutos você recebe um endereço parecido com
   `https://emersonlimanutri.vercel.app`.

### Qual branch a Vercel publica

Por padrão ela publica a branch principal do repositório. O trabalho atual está na
branch `claude/lovable-nutrition-app-q3aiuy`. Duas opções:

- **Para testar agora:** em *Settings → Git → Production Branch*, troque para
  `claude/lovable-nutrition-app-q3aiuy`.
- **Para deixar definitivo:** abra um Pull Request dessa branch para a `main`,
  faça o merge, e a Vercel publica a `main` a cada mudança.

---

## 3. Avise o Supabase qual é o endereço

Sem isto, o login com Google e a recuperação de senha voltam para o lugar errado.

No Supabase, **Authentication → URL Configuration**:

- **Site URL**: o endereço da Vercel (ou o seu domínio, se já apontou).
- **Redirect URLs**: o mesmo endereço e, se for mexer no código no computador,
  `http://localhost:8080`.

---

## 4. Crie o seu acesso

1. Abra o endereço publicado.
2. **Solicitar cadastro** → crie a conta com o seu e-mail.
3. O **primeiro cadastro do projeto vira administrador e já entra aprovado**.
   Os próximos ficam pendentes até você liberar em **Administração**.
4. Em **Configurações → Criar conteúdo inicial**, gere o plano de contas,
   a jornada modelo e os questionários padrão.

---

## 5. Encha com dados de demonstração (opcional, mas recomendado)

Um sistema vazio não demonstra nada. Este passo cria um consultório fictício
completo: 11 pacientes do perfil 40+, 10 leads no funil, três meses de avaliações,
exames, rastreamento, Raio-X semanal, jornada, financeiro e agenda.

1. No Supabase, **SQL Editor → New query** → cole todo o
   `supabase/demo/seed-demo.sql` → **Run**.
2. Logado no app, volte ao SQL Editor e rode:

   ```sql
   select public.seed_demo();
   ```

   > O SQL Editor roda como administrador do banco, sem usuário logado.
   > Para funcionar, chame a função **pelo app**: a forma mais simples é abrir
   > **Configurações**, clicar em **Criar conteúdo inicial** e, em seguida, pedir
   > ao Claude pelo conector: *"rode a demonstração"*. Ou crie a conta de
   > demonstração e execute o `select public.seed_demo();` autenticado como ela,
   > usando o menu **Run as → authenticated** do SQL Editor quando disponível.

3. Para remover depois: `select public.limpar_demo();`
   Ele apaga **apenas** o que a demonstração criou — nada seu é tocado.

> **Use uma conta separada para demonstrar.** Crie, por exemplo,
> `demo@seudominio.com.br`. Nunca rode a demonstração na conta que você usa com
> pacientes reais.

---

## 6. Seu domínio próprio

1. Na Vercel: **Settings → Domains → Add**.
2. Digite o domínio (ex.: `app.emersonlimanutre.com.br`).
3. A Vercel mostra um registro **CNAME** para você cadastrar onde comprou o domínio
   (Registro.br, GoDaddy, Hostinger…).
4. Depois que propagar, volte ao passo 3 e troque a **Site URL** no Supabase
   para o domínio novo.

---

## 7. Ligue a inteligência artificial

Sem isto o app funciona, mas os botões de relatório não geram texto.

```bash
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy
```

O `SEU_PROJECT_REF` é o pedaço do meio da URL do Supabase
(`https://SEU_PROJECT_REF.supabase.co`). A chave sai de
[console.anthropic.com](https://console.anthropic.com) → **API Keys**.

Este passo também publica o **conector do Claude** — veja
[`CONECTOR-CLAUDE.md`](CONECTOR-CLAUDE.md).

---

## Roteiro de demonstração (10 minutos)

Ordem que funciona bem para mostrar a outro nutricionista:

1. **Dashboard** — "isto é o que eu vejo às 8 da manhã". Aponte os planos vencendo
   e o alerta de TPM.
2. **Funil de leads** — arraste um card de etapa. Mostre a receita potencial mudando.
3. **Converter em paciente** — um clique. Abra a jornada que se montou sozinha.
4. **Análise de exames** — mostre as duas colunas: referência do laboratório e
   faixa ótima. É aqui que a plateia entende o diferencial.
5. **Evolução** — o bloco "Resultado no período". Diga que é o print que a paciente recebe.
6. **Questionário** — abra o link no celular, ao vivo, e responda uma pergunta.
7. **Financeiro → Inteligência de vendas** — receita por origem do lead.
8. **Configurações → Conector do Claude** — pergunte ao Claude "quem tem plano
   vencendo esta semana?" na frente deles.

Deixe o passo 8 por último. É o que ninguém mais mostra.

---

## Problemas comuns

| Sintoma | Solução |
|---|---|
| A Vercel publica mas a tela pede para conectar o Supabase | As variáveis de ambiente não foram salvas, ou faltou fazer *Redeploy* depois de adicioná-las. |
| Login com Google volta para o endereço errado | **Authentication → URL Configuration** está com a Site URL antiga. |
| O link do questionário dá erro 404 | A Vercel resolve isso sozinha em projetos Vite. Em outra hospedagem, configure o redirecionamento de todas as rotas para `index.html`. |
| Botões de IA dão erro | Falta a `ANTHROPIC_API_KEY` ou o `supabase functions deploy`. |
| "Aguardando aprovação" e você é o dono | Você não foi o primeiro cadastro. Em **Table Editor → profiles**, marque `aprovado = true` na sua linha. |
