import { corsHeaders, erro, json } from "../_shared/cors.ts";
import { blocoArquivo, pedirJSON, TOM_CLINICO } from "../_shared/claude.ts";

interface Marcador {
  nome: string;
  valor: string | number;
  unidade?: string;
  ref_min?: number | null;
  ref_max?: number | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { arquivo_base64, tipo_mime, nome_arquivo } = await req.json();
    if (!arquivo_base64) return erro("Envie o arquivo do laudo.");

    const resultado = await pedirJSON<{ marcadores: Marcador[]; laboratorio?: string; data?: string }>({
      system: `${TOM_CLINICO}

Você extrai marcadores de laudos laboratoriais.

Devolva um objeto JSON com:
{
  "laboratorio": string | null,
  "data": "AAAA-MM-DD" | null,        // data da coleta, se aparecer no laudo
  "marcadores": [
    {
      "nome": string,                  // nome do exame como consta no laudo, sem abreviar demais
      "valor": string | number,        // apenas o resultado, sem unidade
      "unidade": string | null,
      "ref_min": number | null,        // referência do próprio laboratório
      "ref_max": number | null
    }
  ]
}

Regras:
- Extraia TODOS os marcadores numéricos que encontrar, na ordem do laudo.
- Use ponto como separador decimal.
- Não converta unidades e não recalcule nada.
- Se um valor for qualitativo (ex.: "não reagente"), mantenha o texto em "valor".
- Se não encontrar nenhum marcador, devolva "marcadores": [].`,
      conteudo: [
        blocoArquivo(arquivo_base64, tipo_mime ?? "application/pdf"),
        { type: "text", text: `Extraia os marcadores deste laudo${nome_arquivo ? ` (${nome_arquivo})` : ""}.` },
      ],
      maxTokens: 8000,
      esforco: "medium",
    });

    return json({ marcadores: resultado.marcadores ?? [], laboratorio: resultado.laboratorio ?? null, data: resultado.data ?? null });
  } catch (e) {
    return erro((e as Error).message, 500);
  }
});
