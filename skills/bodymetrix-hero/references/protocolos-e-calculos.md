# Protocolos, equações e faixas de referência

Tudo aqui já está implementado em `scripts/composicao.py`. Este documento serve para
duas coisas: conferir se um número saiu estranho e explicar o método ao Emerson quando
ele perguntar de onde veio o valor. **Não refaça as contas à mão** — rode o script.

## Fluxo do cálculo

```
espessuras (mm) → somatório → densidade corporal (Jackson & Pollock) → %GC (Siri)
                                                                          ↓
                                              massa gorda / massa magra / classificação
```

## Densidade corporal

**Jackson & Pollock 7 pontos** — peitoral, axilar média, tríceps, subescapular,
abdominal, supra-ilíaca e coxa. Σ = soma dos 7, em mm; idade em anos.

- Homens: `Db = 1,112 − 0,00043499·Σ + 0,00000055·Σ² − 0,00028826·idade`
- Mulheres: `Db = 1,097 − 0,00046971·Σ + 0,00000056·Σ² − 0,00012828·idade`

**Jackson & Pollock 3 pontos** — usado quando faltam pontos para o JP7. Os sítios
mudam conforme o sexo, e trocar isso invalida a equação:

- Homens (peitoral, abdominal, coxa):
  `Db = 1,10938 − 0,0008267·Σ + 0,0000016·Σ² − 0,0002574·idade`
- Mulheres (tríceps, supra-ilíaca, coxa):
  `Db = 1,0994921 − 0,0009929·Σ + 0,0000023·Σ² − 0,0001392·idade`

## Densidade → percentual de gordura

- **Siri (padrão):** `%GC = (495 / Db) − 450`
- **Brozek:** `%GC = (457 / Db) − 414,2`

Siri é o default por ser o mais usado em avaliação nutricional. Só troque para Brozek
se o Emerson pedir — e, se trocar, mantenha a mesma equação nas avaliações seguintes,
porque a diferença entre elas (≈0,5 a 1 p.p.) pode ser confundida com evolução real.

## Derivados

```
massa gorda (kg) = peso × %GC / 100
massa magra (kg) = peso − massa gorda
IMC              = peso / altura²  (altura em metros)
peso para um %GC alvo = massa magra / (1 − %GC_alvo / 100)
```

A projeção de meta assume massa magra constante. É uma referência de planejamento,
não uma previsão: na prática a massa magra oscila, e é justamente por isso que ela é
monitorada avaliação a avaliação.

## Classificação do %GC (ACSM / Pollock & Wilmore)

**Homens**

| Idade | Excelente | Bom | Médio | Acima da média | Elevado |
|---|---|---|---|---|---|
| 20–29 | ≤11 | ≤13 | ≤16 | ≤19 | >19 |
| 30–39 | ≤12 | ≤14 | ≤17 | ≤21 | >21 |
| 40–49 | ≤14 | ≤16 | ≤19 | ≤23 | >23 |
| 50–59 | ≤15 | ≤17 | ≤21 | ≤24 | >24 |
| 60+ | ≤16 | ≤18 | ≤21 | ≤25 | >25 |

**Mulheres**

| Idade | Excelente | Bom | Médio | Acima da média | Elevado |
|---|---|---|---|---|---|
| 20–29 | ≤16 | ≤19 | ≤23 | ≤27 | >27 |
| 30–39 | ≤17 | ≤20 | ≤24 | ≤28 | >28 |
| 40–49 | ≤18 | ≤22 | ≤26 | ≤30 | >30 |
| 50–59 | ≤20 | ≤24 | ≤28 | ≤32 | >32 |
| 60+ | ≤21 | ≤25 | ≤29 | ≤33 | >33 |

**Faixas de referência adicionais**

| Faixa | Homens | Mulheres |
|---|---|---|
| Gordura essencial | 3–5% | 8–12% |
| Atlético | 6–13% | 14–20% |

Abaixo da gordura essencial o script classifica como **Atenção**, não como "excelente".
Percentual muito baixo tem custo — em mulheres, associa-se a disfunção menstrual e
perda de densidade óssea; em ambos os sexos, a queda de desempenho e de imunidade.
Um relatório que celebra um valor baixo demais está prestando um desserviço clínico.

## Limites do método — o que dizer quando perguntarem

- O erro típico das equações de dobras/ultrassom é de cerca de ±3 a 4 p.p. contra
  DEXA. O valor absoluto é uma estimativa; **a tendência ao longo do tempo é o dado
  confiável**, desde que o método e o avaliador não mudem.
- Hidratação, horário, treino recente e fase do ciclo menstrual deslocam o resultado.
  Padronizar as condições da avaliação vale mais do que trocar de equação.
- As equações de Jackson & Pollock foram derivadas com adipômetro. O BodyMetrix aplica
  sua própria adaptação para ultrassom. Por isso o recálculo e o número do software
  podem não bater — ver `leitura-do-pdf-bodymetrix.md`.
- Populações fora do intervalo de validação (atletas de elite, obesidade grave,
  idosos com sarcopenia, gestantes) têm erro maior. Nesses casos, registre a ressalva
  no relatório e dê mais peso à evolução das espessuras ponto a ponto, que é medida
  direta, do que ao percentual, que é estimado.
