# Como ler o PDF exportado do BodyMetrix / BodyView

Este arquivo existe porque o relatório do BodyView não tem um layout único: ele muda
conforme a versão do software, o idioma da instalação e o modo de medição escolhido.
Em vez de decorar um formato, entenda **o que precisa ser extraído** e vá atrás disso
no documento que estiver na sua frente.

## O que você precisa achar

| Dado | Por que importa | Onde costuma estar |
|---|---|---|
| Nome, sexo, idade, data | Sexo e idade entram nas equações; sem eles não há cálculo | Cabeçalho / "Client Info" |
| Peso e altura | Convertem % em kg de massa gorda e magra; altura dá o IMC | Cabeçalho ou "Measurements" |
| Espessura por ponto (mm) | É o dado bruto da leitura de ultrassom | Tabela "Sites" / "Thickness" / "Skinfold" |
| % de gordura do software | Serve de conferência contra o seu recálculo | "Body Fat %" / "% BF" / resumo |
| Protocolo configurado | Explica divergências entre o software e o recálculo | "Method" / "Protocol" / rodapé |
| Circunferências | Complementam a leitura regional quando existirem | Seção "Girths" / "Circumferences" |

## Nomes dos pontos: inglês → português

O software costuma vir em inglês mesmo em instalações brasileiras.

| No PDF | Chave a usar no `dados.json` |
|---|---|
| Chest / Pectoral | `peitoral` |
| Midaxillary / Mid-Axillary | `axilar_media` |
| Tricep / Triceps | `triceps` |
| Subscapular | `subescapular` |
| Abdomen / Abdominal | `abdominal` |
| Suprailiac / Supra-iliac | `suprailiaca` |
| Thigh | `coxa` |
| Bicep, Calf, Lower Back | `biceps`, `panturrilha`, `lombar` |

O módulo `composicao.py` reconhece esses sinônimos automaticamente, mas usar a chave
canônica deixa o `dados.json` legível para quem for revisar depois.

## Armadilhas que mudam o resultado

**Unidade.** Se as espessuras vierem em polegadas (instalação em unidades imperiais),
multiplique por 25,4 antes de qualquer conta. Sinal de alerta: valores abaixo de 2 em
pontos como abdômen e coxa quase nunca são milímetros de gordura de um adulto.

**Ultrassom não é adipômetro.** O BodyMetrix mede a espessura de **uma** camada de
gordura subcutânea. A dobra cutânea do adipômetro é uma prega dupla (pele + gordura
dobradas). São grandezas diferentes, e o BodyView já aplica sua própria conversão
internamente. É por isso que o recálculo pelas equações de Jackson & Pollock pode
divergir do número impresso pelo software — o script sinaliza divergências acima de
1,5 ponto percentual. **Divergência não é erro de conta: quase sempre é protocolo
diferente.** Registre os dois valores no relatório e diga qual está sendo usado como
referência, em vez de escolher em silêncio.

**Medições repetidas.** Alguns relatórios trazem 2 ou 3 leituras por ponto. Use a
média das leituras válidas, ou a mediana se uma delas destoar muito. Diga no relatório
qual critério usou.

**Pontos faltando.** Sem os 7 pontos, o JP7 não roda. O script cai automaticamente
para o JP3 do sexo correspondente e registra o aviso. Se nem o JP3 fechar, o script
para — nesse caso, pergunte ao Emerson se ele quer informar os valores que faltam ou
usar o % que o software calculou.

**PDF que é imagem.** Se o arquivo for um escaneamento ou uma foto colada, leia
visualmente os números e **confirme com o usuário a tabela transcrita antes de gerar
o relatório**. Um dígito trocado em um ponto vira meio ponto percentual de gordura, e
o paciente vai comparar esse número com o da avaliação anterior.

## Consistência entre avaliações

Comparar duas avaliações só faz sentido se elas foram feitas em condições parecidas.
Ao montar a seção de evolução, verifique:

- Os mesmos pontos foram medidos nas duas datas?
- O protocolo é o mesmo? (JP7 numa data e JP3 na outra invalida a comparação direta)
- O intervalo é suficiente? Abaixo de ~6 semanas, boa parte da variação é ruído de
  medição e hidratação, não mudança real de composição.

Quando algum desses pontos não fecha, diga isso no relatório em vez de omitir. Uma
comparação com ressalva ainda é útil; uma comparação silenciosamente inválida induz
a decisão clínica errada.
