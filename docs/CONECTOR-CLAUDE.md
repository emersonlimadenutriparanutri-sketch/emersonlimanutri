# Conector do Claude

Depois de instalado, o consultório vira uma fonte de dados que **você** pode
consultar conversando com o Claude:

> "Quem tem plano vencendo esta semana?"
> "Me dá o histórico da Mariana antes da consulta das 15h."
> "Quantos leads entraram este mês e quantos fecharam?"
> "Cria uma tarefa pra segunda: revisar o plano do Carlos."

Cada nutricionista gera **o próprio conector**, dentro do próprio app. Um conector
enxerga apenas os dados de quem o gerou — não existe caminho pelo qual ele alcance
o consultório de outra pessoa.

---

## 1. Publique a função do conector

Uma vez só, no terminal, dentro da pasta do projeto:

```bash
supabase functions deploy mcp
```

Se você já rodou `supabase functions deploy` (sem nome), a função do conector já foi
publicada junto e este passo não é necessário.

---

## 2. Gere o seu conector no app

1. Entre no app e abra **Configurações**.
2. Vá até **Conector do Claude**.
3. Dê um nome (ex.: "Claude do consultório") e clique em **Gerar conector**.
4. **Copie o endereço que aparece.** Ele é mostrado uma única vez.

> O endereço tem esta cara:
> `https://SEU-PROJETO.supabase.co/functions/v1/mcp/nutri_a1b2c3...`

Guarde-o como você guardaria uma senha. Se perder, basta gerar outro e revogar o antigo.

---

## 3. Adicione no Claude

### No Claude (claude.ai ou aplicativo)

1. Abra **Configurações → Conectores**.
2. Clique em **Adicionar conector personalizado**.
3. Cole o endereço completo (com o `nutri_...` no final).
4. Salve e autorize o uso na conversa.

### No Claude Code (terminal)

Aqui o token vai no cabeçalho, separado do endereço:

```bash
claude mcp add --transport http consultorio \
  https://SEU-PROJETO.supabase.co/functions/v1/mcp \
  --header "Authorization: Bearer nutri_a1b2c3..."
```

---

## 4. Confira se funcionou

Pergunte ao Claude:

> "Usando o conector do consultório, me mostra o resumo do consultório."

Deve voltar a contagem de pacientes ativos, planos vencendo, leads do mês e
tarefas em atraso. No app, em **Configurações → Conector do Claude**, o campo
"último uso" passa a mostrar a data e hora.

---

## O que o conector consegue fazer

**Consultar**

| Ferramenta | Para quê |
|---|---|
| `listar_pacientes` | Buscar por nome, filtrar por situação ou por plano vencendo |
| `obter_paciente` | Ficha cadastral completa |
| `historico_do_paciente` | Anamneses, exames, avaliações, rastreamentos, Raio-X e consultas |
| `jornada_do_paciente` | Cronograma de acompanhamento e o que está atrasado |
| `listar_leads` | Funil comercial por etapa e temperatura |
| `agenda` | Compromissos em um intervalo de datas |
| `resumo_do_consultorio` | Visão geral: pacientes, leads, tarefas e receita do mês |
| `consultar_tabela` | Consulta livre nas tabelas do app |

**Gravar**

| Ferramenta | Para quê |
|---|---|
| `criar_tarefa` | Nova tarefa ou compromisso na agenda |
| `salvar_registro` | Criar ou atualizar um registro em uma tabela permitida |

---

## Segurança

- **O token não é guardado em lugar nenhum.** O banco só tem o hash dele; nem você,
  nem o suporte, nem quem tiver acesso ao banco consegue recuperá-lo.
- **Um conector = um nutricionista.** Toda consulta é forçada ao dono do token,
  mesmo internamente. Está coberto por testes automatizados (`tests/mcp.mjs`).
- **Tabelas sensíveis ficam fora.** O conector não acessa a tabela de tokens nem a
  de papéis de usuário, então ele não consegue criar acesso nem se promover.
- **Revogação é imediata.** Em Configurações, clique na lixeira ao lado do conector:
  na chamada seguinte o Claude já perde o acesso.
- **Trate o endereço como uma senha.** Quem tiver o link consegue ler e alterar os
  dados do seu consultório. Não mande em grupo, print ou e-mail.
- **Gere um conector por dispositivo.** Assim, se você perder o celular, revoga só
  aquele e o resto continua funcionando.

> O conector devolve dado clínico real. Continue conferindo o que o Claude escrever
> antes de usar em prontuário ou mandar para o paciente — a responsabilidade técnica
> segue sendo sua.

---

## Problemas comuns

| Sintoma | O que verificar |
|---|---|
| "Token do conector ausente, inválido ou revogado" | O endereço foi copiado incompleto, ou o conector foi revogado. Gere outro. |
| O Claude não encontra o conector | A função não foi publicada: rode `supabase functions deploy mcp`. |
| Conector conecta mas não devolve nada | A conta é nova e ainda não tem dados, ou você gerou o conector em outro projeto Supabase. |
| "último uso" continua vazio | O Claude ainda não chamou nenhuma ferramenta. Peça explicitamente: "use o conector do consultório". |
