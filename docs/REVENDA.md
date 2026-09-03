# Entregando a plataforma para outro nutricionista

Este projeto foi desenhado para ser **instalado por cliente**, não hospedado em
uma base única. Cada nutricionista tem o próprio Supabase, o próprio domínio e a
própria conta de IA — o que resolve, de saída, três problemas que costumam matar
produtos de saúde: custo variável, responsabilidade sobre dado clínico e limite
de escala.

## O que muda por cliente

| Item | Onde | Observação |
|---|---|---|
| Banco de dados | Projeto Supabase do cliente | Rodar `0001_schema.sql` e `0002_seed.sql` |
| Marca | `src/index.css` (tokens) e `src/config/brand.ts` | Nenhum componente usa cor fixa |
| Domínio | Hospedagem do cliente | Atualizar a Site URL no Supabase |
| IA | `ANTHROPIC_API_KEY` nos secrets do cliente | Cada um paga o próprio consumo |

## Trocando a identidade visual

Em `src/index.css`, no bloco `:root`, as cores estão em HSL:

```css
--primary: 221 78% 13%;    /* azul-marinho */
--secondary: 30 26% 53%;   /* dourado */
--background: 0 0% 98%;
```

Converta as cores da marca do cliente para HSL e substitua. As tipografias ficam
em `index.html` (Google Fonts) e em `tailwind.config.ts` (`fontFamily`).

Nome, tagline e logo saem de variáveis de ambiente, então dá para publicar a
mesma base de código com marcas diferentes:

```env
VITE_BRAND_NAME="Instituto Fulana Nutrição"
VITE_BRAND_TAGLINE="Emagrecimento com ciência e acolhimento"
```

## Checklist de entrega

- [ ] Projeto Supabase criado na região São Paulo
- [ ] `0001_schema.sql` e `0002_seed.sql` executados
- [ ] Site URL e Redirect URLs configuradas
- [ ] `.env` preenchido e deploy publicado no domínio do cliente
- [ ] Primeiro cadastro feito (vira administrador automaticamente)
- [ ] "Criar conteúdo inicial" executado em Configurações
- [ ] `ANTHROPIC_API_KEY` definida e `supabase functions deploy` rodado
- [ ] Teste ponta a ponta: criar lead → converter em paciente → jornada aplicada →
      enviar questionário → responder pelo link público → gerar um relatório

## Custos que o cliente assume

- **Supabase**: o plano gratuito atende um consultório em início. O plano Pro
  (a partir de US$ 25/mês) é recomendado quando houver muitos anexos de exame,
  por causa do backup diário.
- **Anthropic**: cobrança por uso. Leitura de laudo é o item mais caro; resumos
  curtos rodam no modelo mais barato justamente para segurar a conta.
- **Hospedagem**: gratuita na Vercel ou Netlify em uso normal.

## Suporte e atualização

Como cada cliente roda a própria cópia, uma correção publicada por você só chega
até ele em um novo deploy. Duas formas de resolver:

1. **Cliente com repositório próprio** (fork): ele puxa as atualizações quando quiser.
2. **Você mantém o deploy** de todos: um repositório, várias configurações de
   ambiente — mais simples de manter atualizado e mais fácil de cobrar como serviço.

A segunda opção costuma ser a melhor: transforma o produto em recorrência de
instalação e manutenção, e não em uma venda única de código.
