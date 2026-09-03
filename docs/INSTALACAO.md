# Instalação passo a passo

Guia para colocar a plataforma no ar no **seu próprio** Supabase, com seus
dados e no seu domínio. Não é preciso saber programar — só seguir a ordem.

Tempo estimado: 20 a 30 minutos.

---

## 1. Crie o projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie uma conta.
2. Clique em **New project**.
3. Dê um nome (ex.: `consultorio`), escolha a região **South America (São Paulo)**
   e defina uma senha para o banco. **Guarde essa senha** em um gerenciador de senhas.
4. Aguarde alguns minutos até o projeto ficar pronto.

---

## 2. Crie as tabelas

1. No menu lateral do Supabase, abra **SQL Editor**.
2. Clique em **New query**.
3. Abra o arquivo `supabase/migrations/0001_schema.sql` deste projeto, copie **todo**
   o conteúdo e cole no editor.
4. Clique em **Run**. Deve aparecer *Success*.
5. Repita o processo com `supabase/migrations/0002_seed.sql`.

> Os dois arquivos podem ser executados mais de uma vez sem quebrar nada —
> eles verificam o que já existe antes de criar.

---

## 3. Configure o login

1. Vá em **Authentication → Providers**.
2. **Email** já vem habilitado. Para testar mais rápido, desligue
   *Confirm email* enquanto estiver configurando.
3. Para entrar com Google: habilite **Google**, crie as credenciais OAuth no
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials) e
   cole o *Client ID* e o *Client Secret*.
4. Em **Authentication → URL Configuration**, preencha:
   - **Site URL**: o endereço final do app (ex.: `https://app.seudominio.com.br`).
   - **Redirect URLs**: o mesmo endereço e, para desenvolvimento, `http://localhost:8080`.

> Sem esse passo, o login por Google e a recuperação de senha redirecionam para o lugar errado.

---

## 4. Conecte o app ao seu Supabase

1. No Supabase, vá em **Project Settings → API** e copie:
   - **Project URL**
   - **anon public** (a chave pública — a `service_role` **nunca** vai para o app)
2. Na pasta do projeto, duplique `.env.example` como `.env`.
3. Preencha:

```env
VITE_SUPABASE_URL="https://xxxxxxxx.supabase.co"
VITE_SUPABASE_ANON_KEY="eyJhbGciOi..."
```

4. Instale e rode:

```bash
npm install
npm run dev
```

5. Abra `http://localhost:8080`.

---

## 5. Crie o seu acesso

1. Na tela de login, clique em **Solicitar cadastro** e crie a sua conta.
2. **O primeiro usuário do projeto vira administrador e já entra aprovado.**
   Todos os cadastros seguintes ficam pendentes até você liberar em
   **Administração**.
3. Entre em **Configurações → Criar conteúdo inicial** para gerar o plano de contas,
   a jornada modelo de 3 meses e os questionários padrão.

---

## 6. Ligue a inteligência artificial

Sem este passo o app funciona normalmente, mas os botões de relatório não geram texto.

1. Crie uma chave em [console.anthropic.com](https://console.anthropic.com) →
   **API Keys**.
2. Instale a CLI do Supabase ([documentação](https://supabase.com/docs/guides/cli)) e rode:

```bash
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy
```

O `SEU_PROJECT_REF` é a parte do meio da URL do projeto
(`https://SEU_PROJECT_REF.supabase.co`).

> A chave fica somente nos *secrets* do Supabase. Ela nunca é enviada ao navegador,
> nem aparece no código do app.

Modelos usados (pode trocar sem mexer no código):

```bash
supabase secrets set CLAUDE_MODELO=claude-opus-5          # leitura de laudos e relatórios longos
supabase secrets set CLAUDE_MODELO_RAPIDO=claude-sonnet-5 # resumos curtos
```

---

## 7. Conecte o Claude ao seu consultório (opcional)

Em **Configurações → Conector do Claude**, gere um conector e cole o endereço no
Claude. A partir daí você pode perguntar "quem tem plano vencendo esta semana?"
direto na conversa. O passo a passo completo está em
[`CONECTOR-CLAUDE.md`](CONECTOR-CLAUDE.md).

---

## 8. Publique no seu domínio

Qualquer hospedagem de site estático serve. Com a Vercel:

1. Suba o projeto para um repositório no GitHub.
2. Em [vercel.com](https://vercel.com), importe o repositório.
3. Em **Environment Variables**, adicione `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
4. Faça o deploy e aponte o seu domínio.
5. Volte ao Supabase e coloque o endereço final em
   **Authentication → URL Configuration**.

> O app usa rotas de navegador (`/consultorio`, `/q/:token`). Se a hospedagem não
> for Vercel/Netlify, configure o redirecionamento de todas as rotas para
> `index.html`, senão o link público do questionário dá erro 404.

---

## Problemas comuns

| Sintoma | O que verificar |
|---|---|
| Tela "Falta conectar o seu Supabase" | O `.env` não foi preenchido ou o servidor não foi reiniciado depois de editar. |
| "Aguardando aprovação" e você é o dono | Você não foi o primeiro cadastro. Em **Table Editor → profiles**, marque `aprovado = true` na sua linha. |
| Botões de IA dão erro | A `ANTHROPIC_API_KEY` não foi definida ou as functions não foram publicadas. |
| Link do questionário dá 404 | Falta o redirecionamento de rotas para `index.html` na hospedagem. |
| Upload de exame falha | Rode o `0001_schema.sql` de novo — ele cria os buckets e as policies de storage. |
| Login com Google volta para o endereço errado | **Authentication → URL Configuration** está com a Site URL antiga. |
