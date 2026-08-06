---
name: bodymetrix-hero
description: Avaliação BodyMetrix HERO — lê o relatório de ultrassom corporal BodyMetrix/BodyView (PDF exportado, print, foto da tela ou valores digitados), recalcula a composição corporal a partir das espessuras de gordura e gera dois PDFs no layout da marca Emerson Lima Nutre - um relatório clínico para o profissional e uma versão em linguagem acessível para o paciente. Use sempre que o usuário mencionar BodyMetrix, BodyView, ultrassom corporal, ultrassom de gordura, avaliação de composição corporal, percentual de gordura, %GC, massa magra, massa gorda, adipometria, dobras cutâneas, bioimpedância comparada ao ultrassom, ou disser "lê essa avaliação", "monta o relatório da avaliação física", "quanto ela está de gordura", "compara com a avaliação anterior". Use também quando o usuário anexar um PDF ou imagem com espessuras em mm por ponto anatômico (tríceps, abdominal, supra-ilíaca, coxa, subescapular, peitoral, axilar média) — mesmo que não escreva a palavra BodyMetrix.
---

# Avaliação BodyMetrix HERO

Transforma a leitura crua do ultrassom corporal em um **relatório clínico interpretado**
para o Emerson Lima (CRN/1 - 19620/P) e em uma **versão acolhedora para o paciente**.

## O princípio: interpretar, não transcrever

O software BodyMetrix já imprime uma tabela de números. Reproduzi-la em outra fonte não
ajuda ninguém. O valor deste relatório está em responder o que a tabela não responde:
o que esses números dizem sobre este caso, o que mudou desde a última avaliação, e o
que fazer na consulta de hoje.

Dois compromissos guiam tudo aqui:

**Todo número vem do script.** Nunca estime, arredonde de cabeça ou reaproveite um
percentual de gordura de outra conversa. O `calcular_composicao.py` é a única fonte de
número neste fluxo — o texto usa exatamente o que ele imprimiu. Um percentual inventado
vira meta errada, e a paciente vai comparar esse valor daqui a três meses.

**Nunca invente dado clínico.** Interprete e correlacione livremente o que foi medido e
informado; não acrescente sintoma, diagnóstico, hábito ou exame que ninguém relatou. O
que faltar, registre como "não informado".

## Etapa 1 — Reunir os dados

Aceite qualquer formato de entrada:

- **PDF exportado do BodyView** (o caso mais comum) — leia o arquivo inteiro
- **Print da tela ou foto** do software — leia visualmente
- **Valores digitados/colados** no chat
- **Fonte indicada** ("pega da avaliação que te mandei antes")

Leia `references/leitura-do-pdf-bodymetrix.md` antes de extrair — o layout do BodyView
varia por versão e idioma, e esse arquivo mostra o que procurar, como mapear os nomes
dos pontos do inglês para o português e quais armadilhas mudam o resultado (unidade em
polegadas, medições repetidas, pontos faltando).

Precisa ter, no mínimo: **sexo, idade, peso e as espessuras em mm**. Altura é necessária
só para o IMC. Se faltar algo essencial, pergunte de forma agrupada — uma rodada de
perguntas, não uma de cada vez.

Quando os dados vierem de imagem ou foto, **transcreva a tabela no chat e confirme com
o Emerson antes de calcular**. Um dígito trocado desloca meio ponto percentual, e esse
erro só apareceria na comparação da próxima avaliação.

Se houver avaliações anteriores (anexadas ou já discutidas na conversa), inclua todas —
a seção de evolução é o que ele mais usa na consulta.

## Etapa 2 — Montar o `dados.json` e calcular

Copie `scripts/exemplo-dados.json` para um arquivo de trabalho e preencha os blocos
`paciente`, `avaliacao_atual` e `avaliacoes_anteriores`. Deixe as seções narrativas
vazias por enquanto — elas dependem dos números.

```bash
python3 scripts/calcular_composicao.py dados.json
```

O script aplica Jackson & Pollock (7 pontos, com fallback automático para 3 pontos
quando faltar sítio) e a equação de Siri, calcula massa gorda e magra, IMC,
classificação por sexo e idade, deltas contra as avaliações anteriores e projeção de
metas. Ele grava tudo de volta no `dados.json` e imprime um resumo — **esse resumo é a
sua fonte de verdade daqui pra frente**.

Confira o resumo antes de escrever:

- Saiu algum aviso? Divergência acima de 1,5 p.p. contra o % do software quase sempre
  significa protocolo diferente no BodyView, não erro de conta. Registre os dois valores
  no relatório e diga qual está sendo usado como referência.
- O protocolo usado foi o esperado? Se caiu para JP3 por falta de sítio, isso precisa
  aparecer no relatório.
- Os valores fazem sentido para o caso? Se um número surpreender, revise a transcrição
  antes de escrever qualquer interpretação em cima dele.

As equações, faixas de classificação e limites do método estão em
`references/protocolos-e-calculos.md` — consulte quando precisar justificar um valor.

## Etapa 3 — Escrever a interpretação

Agora sim, com os números na mão, escreva o conteúdo dos dois relatórios. Leia
`references/interpretacao-clinica.md`: ele traz os padrões que valem comentar
(distribuição androide × ginoide, peso × composição, o que é ruído do método) e a
diferença de linguagem entre os dois documentos.

O relatório **técnico** precisa de um resumo em prosa, uma leitura da evolução quando
houver histórico, a leitura clínica dos achados e condutas específicas o suficiente
para serem executadas (g/kg de proteína, frequência de treino, prazo de reavaliação).

O relatório do **paciente** é outro documento, não um resumo do técnico. Explica o que
foi medido antes de dar o número, traduz os termos, dá contexto ao valor e termina com
3 a 5 ações concretas. Sem jargão, sem juízo de valor sobre o corpo, sem alarme
desacompanhado de saída.

Preencha esses textos nos blocos `relatorio_tecnico` e `relatorio_paciente` do
`dados.json`, no formato do exemplo (`["texto", "..."]` para parágrafos, `["bullet",
"..."]` para listas curtas, `["destaque", "..."]` para uma frase em negrito).

## Etapa 4 — Gerar os PDFs

```bash
python3 scripts/gerar_relatorio_bodymetrix.py dados.json --saida ./
```

Gera `<nome>-bodymetrix-<data>-tecnico.pdf` e `<nome>-bodymetrix-<data>-paciente.pdf`
no layout aprovado da marca: cabeçalho branco com logo à esquerda e título à direita,
linha verde, tabelas minimalistas com linhas alternadas, régua visual mostrando onde o
paciente está na faixa de referência.

Não monte o layout do zero nem edite o desenho para um caso pontual — ele mantém os
relatórios reconhecíveis como uma família só, junto com os das outras skills HERO. Se
algo no visual precisar mudar de verdade, mude no gerador, para valer para todos.

Entregue os dois arquivos ao usuário e, junto, ofereça no chat o **texto curto de
WhatsApp** (campo `whatsapp` do exemplo): 4 a 6 linhas com o número principal, a
comparação com a última avaliação, o que isso significa em uma frase e o próximo passo.

## Ajustes que o Emerson pode pedir

| Pedido | O que fazer |
|---|---|
| "Usa o percentual do software mesmo" | Não recalcule: preencha `calculado` a partir do valor dele e diga no relatório qual foi a fonte |
| "Só o relatório técnico" | `--apenas tecnico` |
| "Sem a tabela ponto a ponto" | `"incluir_tabela_sitios": false` |
| "Usa Brozek" | `"equacao": "brozek"` — e mantenha nas próximas avaliações, para a mudança de equação não ser lida como evolução |
| "Força 3 pontos" | `"protocolo": "jp3"` |
| "Coloca a meta de 20%" | `"metas_percentual": [20]` |

## Antes de entregar, confira

- Todo número do texto bate com o resumo do script?
- Os avisos do script (divergência, fallback de protocolo) aparecem no relatório?
- A versão do paciente está livre de jargão e termina com ações concretas?
- Se a comparação com a avaliação anterior tem ressalva (intervalo curto, protocolo
  diferente, pontos distintos), a ressalva está escrita?

## Dependências

`reportlab` para os PDFs. Se não estiver instalado: `pip install reportlab`.

A logo vai em `assets/logo-emerson-lima-nutre.png`. Sem ela, o cabeçalho cai
graciosamente para o nome da marca em texto — o PDF continua sendo gerado.
