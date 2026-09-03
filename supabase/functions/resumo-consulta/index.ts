import { corsHeaders, erro, json } from "../_shared/cors.ts";
import { pedirTexto, TOM_CLINICO } from "../_shared/claude.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const dados = await req.json();
    const ehExames = dados.tipo === "exames";

    const system = ehExames
      ? `${TOM_CLINICO}

Você interpreta um painel de exames laboratoriais para conduta nutricional.

Cada marcador vem com o intervalo de referência do laboratório, quando disponível,
a faixa ótima funcional e uma situação já calculada ("normal", "atencao",
"abaixo", "acima"). "atencao" significa dentro da normalidade laboratorial, mas
fora da faixa de melhor funcionamento.

Organize assim:
- Uma leitura geral do painel em um parágrafo.
- Os achados que mudam conduta, agrupados por eixo (metabólico, tireoide,
  lipídico, vitaminas e minerais, inflamação, hepático, hormonal).
- Correlações entre marcadores, apresentadas como hipóteses.
- Sugestões de conduta nutricional e de exames complementares.

Nunca prescreva medicamento. Deixe claro quando um achado pede avaliação médica.`
      : `${TOM_CLINICO}

Você redige o relatório de uma consulta a partir das anotações do nutricionista,
cruzando com a avaliação física e os exames mais recentes quando existirem.

Estruture em: contexto da consulta, achados objetivos (o que os números mostram),
condutas definidas e o que observar até o próximo retorno.
Se as anotações forem curtas, seja igualmente curto — não invente conteúdo.`;

    const texto = await pedirTexto({
      system,
      conteudo: JSON.stringify(dados, null, 2),
      maxTokens: 4000,
      esforco: "medium",
    });

    return json({ texto });
  } catch (e) {
    return erro((e as Error).message, 500);
  }
});
