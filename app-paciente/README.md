# App do Paciente — Fase 0

Primeira etapa do [plano técnico](../docs/app-paciente/plano-tecnico.md).

A fase 0 não constrói nada do app do paciente. Ela fecha as duas portas que
precisam estar fechadas **antes** de qualquer paciente virar usuário
autenticado — e as duas já valem a pena hoje, mesmo que o app nunca seja
construído.

Começamos por aqui porque é a única etapa que não depende de nenhuma decisão em
aberto: modelo de WhatsApp, gate de assinatura e conteúdo do ciclo não bloqueiam
nada disto.

| | |
|---|---|
| **0.1** | Isolar `profiles` entre contas | `sql/001_profiles_rls.sql` |
| **0.2** | Tornar privado o bucket `avaliacoes-fotos` | procedimento abaixo |

---

## 0.1 — Isolar `profiles`

Hoje qualquer usuário autenticado lê a tabela `profiles` inteira: nome, e-mail e
telefone de todos os nutricionistas da plataforma. Com pacientes virando
usuários autenticados, cada um deles passaria a ler a sua base de clientes.

**Como aplicar**

1. Abra o SQL Editor do Supabase.
2. Rode a consulta de diagnóstico que está na seção 0 do arquivo e **guarde o
   resultado** — é o ponto de retorno.
3. Edite o e-mail na seção 1.1 e o UUID na seção 3.
4. Rode o arquivo inteiro.
5. Confira as duas contagens da seção 3: um nutricionista comum deve ver `1`, e
   você como admin deve ver todas.

**O que pode quebrar.** Se alguma tela do app hoje lê `profiles` de outras
contas, ela para de funcionar. O caso mais provável é uma tela sua de
administração listando assinantes — por isso a migration cria a allowlist
`platform_admins` e pede que você se cadastre nela **antes** de trancar a
tabela. Se pular esse passo, você perde acesso à própria lista de assinantes.

Depois de aplicar, entre no app como nutricionista e navegue pelas telas
principais. O rollback está na seção 4 do arquivo, mas ele reabre o vazamento —
serve para destravar enquanto você investiga, não como solução.

> A view `v_nutri_publico`, que deixa o paciente ver o nome e o CRN do
> nutricionista dele, fica para a fase 1: ela depende da tabela
> `patient_users`, que ainda não existe.

---

## 0.2 — Bucket privado

Os anexos de avaliação hoje apontam para URLs como:

```
https://<projeto>.supabase.co/storage/v1/object/public/avaliacoes-fotos/...
```

O `/public/` significa bucket público: qualquer pessoa com o link abre o
arquivo, sem autenticação. São fotos corporais e laudos — dado de saúde, que a
LGPD trata como sensível.

### A ordem importa

**Não vire a chave do bucket primeiro.** Se o bucket virar privado antes de o
app saber gerar URL assinada, toda foto e todo PDF já cadastrado param de abrir
na hora — para você e para todos os assinantes.

A sequência segura é o inverso:

1. **Confirmar** no painel (Storage → `avaliacoes-fotos` → Settings) se o bucket
   está mesmo marcado como público. O padrão da URL indica que sim, mas confirme.

2. **Ajustar o app primeiro**, ainda com o bucket público. Onde hoje ele usa a
   URL salva direto, passa a gerar uma URL assinada na hora de exibir:

   ```js
   const { data } = await supabase
     .storage.from('avaliacoes-fotos')
     .createSignedUrl(path, 60 * 10)   // 10 minutos
   ```

   Detalhe que vai aparecer: o banco guarda a **URL pública completa** em
   `avaliacoes_fisicas.anexos_pdf[].url` e nos campos `foto_frente`, `foto_lado`
   e `foto_costas` — não o path. Para assinar é preciso o path relativo ao
   bucket, que sai da própria URL, cortando tudo até
   `/public/avaliacoes-fotos/`. Vale encapsular isso numa função só, porque o
   mesmo tratamento serve para os buckets novos do app do paciente.

3. **Testar** com o bucket ainda público: se as telas continuam funcionando com
   URL assinada, o passo seguinte é seguro.

4. **Virar o bucket para privado** no painel.

5. **Verificar** abrindo uma URL pública antiga numa janela anônima — deve dar
   erro. Se ainda abrir, o bucket não virou.

### Bucket novo, já privado

Os buckets do app do paciente (`paciente-uploads`, `paciente-exames`,
`planos-alimentares`) nascem privados, com policy de storage casando o prefixo
do path com o paciente dono. Isso entra na fase 1, junto com `is_patient_of()`.

---

## O que a fase 0 deliberadamente não faz

- **Teste automatizado da matriz de RLS.** Ele precisa autenticar como paciente
  de teste, e `patient_users` só existe na fase 1. O esqueleto entra junto com
  ela.
- **Qualquer separação dos JSONBs.** `jornada.data` e `anamnese.data` continuam
  misturando dado do paciente com anotação interna — o que não é problema
  enquanto ninguém além do nutricionista lê essas tabelas. Vira problema na fase
  2, e é lá que as views entram.

---

## Ordem de execução

0.1 e 0.2 são independentes. 0.1 é mais rápida e reversível; 0.2 mexe em código
do app e pede uma janela com calma. Sugestão: 0.1 primeiro, confirmar que o app
está de pé, e só então começar 0.2.
