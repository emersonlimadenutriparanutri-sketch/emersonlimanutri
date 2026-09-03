import { corsHeaders, erro, json } from "../_shared/cors.ts";
import { pedirTexto, TOM_CLINICO } from "../_shared/claude.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const dados = await req.json();

    const texto = await pedirTexto({
      system: `${TOM_CLINICO}

Você redige o relatório de evolução de um paciente em acompanhamento,
cruzando avaliações físicas, check-ins semanais (Raio-X), exames,
rastreamento metabólico e anotações de consulta.

Estruture assim, sem numerar:
- O ponto de partida e onde o paciente está hoje, em números concretos.
- Composição corporal e medidas: o que mudou de fato. Se o peso mudou pouco mas
  as medidas ou a composição mudaram, diga isso com clareza.
- Adesão e comportamento ao longo das semanas: padrões, não episódios isolados.
- Exames e sintomas: o que melhorou, o que piorou, o que se manteve.
- Conclusão com as prioridades do próximo ciclo.

Este texto pode ser mostrado ao paciente: seja honesto, específico e encorajador
sem prometer resultado. Sempre que possível, use os números do próprio caso.`,
      conteudo: JSON.stringify(dados, null, 2),
      maxTokens: 5000,
      esforco: "high",
    });

    return json({ texto });
  } catch (e) {
    return erro((e as Error).message, 500);
  }
});
