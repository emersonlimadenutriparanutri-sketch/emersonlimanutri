import { corsHeaders, erro, json } from "../_shared/cors.ts";
import { MODELO_RAPIDO, pedirJSON } from "../_shared/claude.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { tema, expandir, contexto } = await req.json();
    if (!tema) return erro("Informe o tema do mapa.");

    // Expandir um nó existente: devolve só os sub-tópicos.
    if (expandir) {
      const resultado = await pedirJSON<{ subtopicos: string[] }>({
        modelo: MODELO_RAPIDO,
        system: `Você expande um nó de mapa mental sobre nutrição e saúde.
Devolva {"subtopicos": ["...", "..."]} com 3 a 5 sub-tópicos do nó indicado.
Cada sub-tópico tem no máximo 6 palavras, é específico e não repete os irmãos.
Português do Brasil.`,
        conteudo: JSON.stringify({ tema, no: expandir, irmaos: contexto ?? [] }),
        maxTokens: 800,
        esforco: "low",
      });
      return json({ subtopicos: resultado.subtopicos ?? [] });
    }

    const resultado = await pedirJSON<{ nos: { id: string; parentId: string | null; texto: string }[] }>({
      modelo: MODELO_RAPIDO,
      system: `Você monta a estrutura de um mapa mental sobre nutrição, saúde e prática clínica.

Devolva {"nos": [{"id": "n1", "parentId": null, "texto": "..."}]} onde:
- Existe exatamente UM nó raiz (parentId null), que é o tema.
- A raiz tem de 4 a 6 ramos principais.
- Cada ramo principal tem de 2 a 4 filhos.
- Nenhum nó passa de 6 palavras.
- Os ids são únicos e os parentId apontam para ids existentes.
- No máximo 30 nós no total.
Português do Brasil, linguagem clínica e prática.`,
      conteudo: `Tema: ${tema}`,
      maxTokens: 2500,
      esforco: "low",
    });

    return json({ nos: resultado.nos ?? [] });
  } catch (e) {
    return erro((e as Error).message, 500);
  }
});
