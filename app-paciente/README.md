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

### O que ainda falta provar

A `002` prova o que a 001 não prova sozinha: que um nutricionista **comum** vê
só a própria linha. Ela usa `begin … rollback` com troca de papel, que o
executor de migration da Lovable não aceita — precisa do SQL Editor.

Não é formalidade. Um `select count(*)` no painel roda como superusuário e
ignora RLS: devolveria as 148 linhas mesmo com as policies erradas. A 002 troca
o papel para `authenticated` e forja as claims de JWT, que é como o Postgres
enxerga um usuário real vindo do app.

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
