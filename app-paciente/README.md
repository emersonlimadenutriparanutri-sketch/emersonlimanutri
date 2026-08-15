# App do Paciente — Fases 0 e 1 (banco)

Registro do que foi aplicado, na ordem, com o porquê. Acompanha o
[plano técnico](../docs/app-paciente/plano-tecnico.md).

## Estado

| Fase | O quê | Situação |
|---|---|---|
| **0.1** | Isolar `profiles` entre contas | aplicada e verificada |
| **0.2** | Bucket de fotos e laudos privado | já estava resolvida |
| **1** | Vínculo, convite, `is_patient_of`, `meu_nutri`, consentimento | aplicada e verificada |
| **1** | Edge Functions de convite e aceite | implantadas, ciclo testado ponta a ponta |

Falta, para a fase 1 fechar: o app do paciente existir — projeto Lovable novo,
rota `/convite`, login e uma tela inicial.

## Migrations, na ordem

| | O quê |
|---|---|
| `001` | tranca `profiles`; cria `platform_admins` (aposentada na 005) |
| `002` | verificação de isolamento — **não roda no Lovable Cloud**, ver abaixo |
| `003` | remove policies redundantes de INSERT/UPDATE |
| `004` | corrige o revoke que não pegou (grant herdado de `PUBLIC`) |
| `005` | aposenta `platform_admins`; admin passa a sair de `user_roles` |
| `010` | `patient_users`, `patient_invites`, `is_patient_of`, `v_nutri_publico` |
| `011` | desvio nas triggers de signup — **não funciona sozinha**, ver 014 |
| `012` | troca a view por `meu_nutri()`; fecha as funções de trigger |
| `013` | consentimento no vínculo |
| `014` | o que de fato impede paciente de virar nutricionista |
| `015` | fecha a leitura de `user_roles` |

## Os quatro achados de segurança

Nenhum tinha a ver com o app do paciente. Ele só forçou o olhar.

| Achado | Alcance | Corrigido em |
|---|---|---|
| `profiles` legível por qualquer autenticado — 148 e-mails | toda a plataforma | `001` |
| Duas listas de admin em paralelo | introduzido pela `001`, corrigido | `005` |
| `has_role` chamável por visitante deslogado | toda a plataforma | `004` |
| `user_roles` legível por qualquer autenticado | toda a plataforma | `015` |

## Isolamento verificado nos três níveis

Provado pela API HTTP, que é como o app do paciente se conecta — não por
consulta no editor, que roda como superusuário e ignora RLS.

| Quem | Linhas visíveis em `profiles` |
|---|---|
| Visitante sem login | 0 |
| Nutricionista comum | 1 |
| Admin | 148 |

---

## 0.1 — Isolar `profiles`

Qualquer usuário autenticado lia a tabela `profiles` inteira: nome, e-mail e
telefone de **148 nutricionistas**. Com pacientes virando usuários autenticados,
cada um deles passaria a ler a base de clientes da plataforma.

### Arquivos

| | |
|---|---|
| `sql/001_profiles_rls.sql` | a migration — **aplicada** |
| `sql/002_verificacao.sql` | prova de isolamento — **pendente**, precisa do SQL Editor |
| `sql/003_limpeza_profiles.sql` | remove policies redundantes — **pendente** |
| `PROMPT-LOVABLE.md` | texto pronto para aplicar sem acesso ao painel |

O projeto Supabase foi criado pela Lovable e o painel não está acessível pela
conta atual, então a 001 foi aplicada pedindo à Lovable. Enquanto o acesso ao
painel não for resolvido, cada migration precisa desse caminho.

### Estado depois da 001

Três policies novas em `profiles`, e as duas antigas de INSERT/UPDATE
sobreviveram — a 001 só removia policies de SELECT. Foram conferidas: são
duplicatas exatas das novas, não deixam nenhum buraco aberto. A `003` remove.

Confirmado por leitura como o nutricionista autenticado: `profiles` devolve as
148 linhas (caminho de admin OK) enquanto `patients` devolve só os pacientes
dele — o que prova que a RLS está ativa de verdade, e não que a conexão está
passando como `service_role`.

Telas Admin e Perfil testadas no app, funcionando.

### Verificação

**A `002` não roda neste ambiente.** O executor de migration da Lovable recusa o
`set local role authenticated` — *"permission denied to set role"*. O papel de
banco disponível ali não tem essa permissão, e sem painel do Supabase não há
outro caminho SQL. O arquivo fica versionado para quando houver acesso direto.

A prova veio por outro caminho, e melhor: **pela API HTTP**, que é exatamente
como o app do paciente vai se conectar. Passa pelo PostgREST de verdade, em vez
de simular papel dentro do banco.

Rodado do console do navegador, com a anon key e **sem login**:

```
profiles   → HTTP 200 | linhas: 0
patients   → HTTP 200 | linhas: 0
user_roles → HTTP 200 | linhas: 0
jornada    → HTTP 200 | linhas: 0
anamnese   → HTTP 200 | linhas: 0
```

O `200` importa tanto quanto o `0`: a requisição foi aceita e respondida — não é
erro de chave nem de rota. Visitante anônimo simplesmente não enxerga linha
nenhuma.

Somado ao que já se sabia — o admin lê as 148 via `has_role`, e a mesma conexão
lê só os próprios pacientes em `patients` — o isolamento está demonstrado nos
dois extremos.

**O que resta sem prova direta** é o meio: um nutricionista autenticado e **não**
admin, que exercita o ramo `id = auth.uid()` da policy. Para o admin esse ramo
nunca é avaliado, porque o `or has_role(...)` resolve antes.

O risco residual é baixo — a expressão é a mais simples possível e `profiles.id`
foi confirmado como o id do Auth. Mas o teste pegaria uma classe de problema que
nenhum outro pega: RLS não estar sendo aplicada ao papel `authenticated` por
algum motivo estrutural.

Fecha-se assim, quando valer a pena: criar uma conta descartável pelo cadastro
normal, autenticar por HTTP com `grant_type=password` e listar `profiles`. O
esperado é 1 linha. O mesmo mecanismo vira o teste automatizado da matriz de
acesso da fase 1, que tem quinze linhas em vez de uma.

### `service_role` — verificado

Nenhuma ocorrência em `src/`. A chave só é lida via `Deno.env.get` dentro de
Edge Functions, e o `.env` do frontend tem apenas `VITE_SUPABASE_PUBLISHABLE_KEY`.

Isso importava mais que todo o resto: chave de serviço num bundle de navegador
ignora RLS e é legível por qualquer pessoa no DevTools — tornaria todas as
policies decorativas.

---

## 0.2 — Storage

**Já estava resolvida.** `avaliacoes-fotos` está privado (`public = false`).

Os buckets públicos do projeto são `avatares`, `coberturas-de-curso` e
`materiais-de-aula` — nenhum deles guarda dado clínico de paciente.

### Duas coisas para verificar mesmo assim

**1. As URLs antigas ainda abrem?** O banco guarda URLs no formato
`/storage/v1/object/public/avaliacoes-fotos/…` em `avaliacoes_fisicas.anexos_pdf`
e nos campos de foto. Com o bucket privado, esse formato de URL não funciona —
então ou o app já gera URL assinada na hora de exibir, ou os anexos antigos
estão quebrados sem ninguém ter notado.

Teste rápido: abrir um paciente com PDF anexado e ver se o arquivo abre.

**2. Os buckets do app do paciente nascem privados.** `paciente-uploads`,
`paciente-exames` e `planos-alimentares` entram na fase 1 com policy de storage
casando o prefixo do path com o paciente dono.

Atenção especial na aba **Materiais**: é tentador reaproveitar
`materiais-de-aula`, que já existe — mas ele é **público**. Material dirigido a
um paciente específico não pode morar lá. Ou vai para bucket privado próprio, ou
`materiais-de-aula` fica restrito ao que é conteúdo aberto de curso.

---

## O que a fase 0 deliberadamente não faz

- **Teste automatizado da matriz de RLS.** Precisa autenticar como paciente de
  teste, e `patient_users` só existe na fase 1.
- **Separação dos JSONBs.** `jornada.data` e `anamnese.data` continuam
  misturando dado do paciente com anotação interna — o que não é problema
  enquanto ninguém além do nutricionista lê essas tabelas. Vira problema na
  fase 2, e é lá que as views entram.
