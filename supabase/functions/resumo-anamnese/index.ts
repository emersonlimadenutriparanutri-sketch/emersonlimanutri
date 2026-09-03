import { corsHeaders, erro, json } from "../_shared/cors.ts";
import { MODELO_RAPIDO, pedirTexto, TOM_CLINICO } from "../_shared/claude.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const dados = await req.json();

    const texto = await pedirTexto({
      modelo: MODELO_RAPIDO,
      system: `${TOM_CLINICO}

Você resume uma anamnese nutricional para consulta rápida antes do atendimento.

Escreva de 3 a 5 parágrafos curtos cobrindo, nesta ordem:
- Quem é essa pessoa e o que ela busca, em uma frase.
- História do peso e comportamento alimentar: padrões que se repetem.
- Fatores clínicos e de estilo de vida que mais impactam o caso (sono, estresse,
  intestino, hormonal, medicações).
- O que merece atenção na primeira conduta.
- O que ficou faltando coletar, se algo faltou.

Não repita literalmente o que foi escrito: sintetize e conecte.`,
      conteudo: JSON.stringify(dados, null, 2),
      maxTokens: 2000,
      esforco: "low",
    });

    return json({ texto });
  } catch (e) {
    return erro((e as Error).message, 500);
  }
});
