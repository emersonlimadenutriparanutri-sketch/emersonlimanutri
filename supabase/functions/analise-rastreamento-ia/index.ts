import { corsHeaders, erro, json } from "../_shared/cors.ts";
import { pedirTexto, TOM_CLINICO } from "../_shared/claude.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const dados = await req.json();

    const texto = await pedirTexto({
      system: `${TOM_CLINICO}

Você interpreta um questionário de rastreamento metabólico (carga de sintomas
pontuada de 0 a 4 por item, agrupada por sistema).

Estruture o relatório em quatro partes, sem títulos numerados:
1. Uma leitura geral da carga total de sintomas e do que ela sugere.
2. Os sistemas mais pontuados, explicando o que costuma estar por trás deles.
3. Hipóteses de investigação — exames ou perguntas que valeria checar.
4. Duas ou três prioridades de conduta para as próximas semanas.

Lembre que pontuação alta indica carga sintomática, não diagnóstico.`,
      conteudo: JSON.stringify(dados, null, 2),
      maxTokens: 3000,
    });

    return json({ texto });
  } catch (e) {
    return erro((e as Error).message, 500);
  }
});
