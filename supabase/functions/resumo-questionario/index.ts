import { corsHeaders, erro, json } from "../_shared/cors.ts";
import { MODELO_RAPIDO, pedirTexto, TOM_CLINICO } from "../_shared/claude.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const dados = await req.json();

    const texto = await pedirTexto({
      modelo: MODELO_RAPIDO,
      system: `${TOM_CLINICO}

Você resume as respostas de um questionário respondido pelo paciente.

${dados.instrucao ?? "Destaque o que muda conduta e o que merece ser perguntado na consulta."}

Escreva em 2 a 4 parágrafos curtos. Comece pelo que é mais relevante clinicamente,
não pela ordem das perguntas. Se houver sinal de alerta (comportamento alimentar,
sintomas importantes, uso de medicação), aponte com clareza e sem dramatizar.`,
      conteudo: JSON.stringify(dados, null, 2),
      maxTokens: 1800,
      esforco: "low",
    });

    return json({ texto });
  } catch (e) {
    return erro((e as Error).message, 500);
  }
});
