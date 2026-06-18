# Find Skills

Ajuda a descobrir e instalar skills do ecossistema open agent skills.

## Quando Usar

Use quando o usuário:
- Perguntar "como eu faço X?" onde X pode ser uma tarefa com skill existente
- Disser "encontra uma skill para X" ou "existe skill para X?"
- Quiser estender as capacidades do agente
- Mencionar que precisa de ajuda com um domínio específico (design, testes, deploy, etc.)

## Comandos Principais

```bash
npx skills find [query]   # Buscar skills por palavra-chave
npx skills add <pacote>   # Instalar skill do GitHub
npx skills check          # Verificar atualizações
npx skills update         # Atualizar todas as skills instaladas
```

## Como Executar

### 1. Entender o que o usuário precisa

Identifique:
1. O domínio (ex: React, testes, design, deploy)
2. A tarefa específica
3. Se é comum o suficiente para existir uma skill

### 2. Buscar skills

```bash
npx skills find $ARGUMENTS
```

Exemplos:
- "como deixar meu React mais rápido?" → `npx skills find react performance`
- "revisão de PR" → `npx skills find pr review`
- "preciso criar changelog" → `npx skills find changelog`

### 3. Verificar qualidade antes de recomendar

- **Contagem de instalações** — Prefira skills com 1K+ instalações
- **Reputação da fonte** — Fontes oficiais (`vercel-labs`, `anthropics`, `microsoft`) são mais confiáveis
- **Stars no GitHub** — Skills de repos com <100 stars merecem cautela

### 4. Apresentar opções ao usuário

Mostre:
1. Nome da skill e o que faz
2. Contagem de instalações e fonte
3. Comando de instalação
4. Link para saber mais: https://skills.sh/

### 5. Instalar se o usuário quiser

```bash
npx skills add <owner/repo@skill> -g -y
```

O `-g` instala globalmente e `-y` pula confirmações.

## Categorias Comuns

| Categoria       | Palavras-chave                           |
| --------------- | ---------------------------------------- |
| Web Development | react, nextjs, typescript, css, tailwind |
| Testes          | testing, jest, playwright, e2e           |
| DevOps          | deploy, docker, kubernetes, ci-cd        |
| Documentação    | docs, readme, changelog, api-docs        |
| Qualidade       | review, lint, refactor, best-practices   |
| Design          | ui, ux, design-system, accessibility     |
| Produtividade   | workflow, automation, git                |

## Quando Nenhuma Skill for Encontrada

1. Informe que não foi encontrada nenhuma skill
2. Ofereça ajuda direta com as capacidades gerais
3. Sugira criar uma skill própria:

```bash
npx skills init minha-skill
```
