# App do Paciente — Fase 0

Primeira etapa do [plano técnico](../docs/app-paciente/plano-tecnico.md).

A fase 0 não constrói nada do app do paciente. Ela fecha as portas que precisam
estar fechadas **antes** de qualquer paciente virar usuário autenticado — e as
duas já valiam a pena hoje, mesmo que o app nunca fosse construído.

| Etapa | O quê | Situação |
|---|---|---|
| **0.1** | Isolar `profiles` entre contas | **Aplicada.** Falta rodar `sql/003_limpeza_profiles.sql` |
| **0.2** | Bucket de fotos e laudos privado | **Já estava resolvida** — ver abaixo |

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
