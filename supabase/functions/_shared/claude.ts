import Anthropic from "npm:@anthropic-ai/sdk";

/**
 * Camada única de acesso ao Claude.
 * A chave vive apenas em ANTHROPIC_API_KEY nos secrets do projeto Supabase:
 *   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
 */
const apiKey = Deno.env.get("ANTHROPIC_API_KEY");

/** Leitura de documentos e raciocínio clínico. */
export const MODELO_PRINCIPAL = Deno.env.get("CLAUDE_MODELO") ?? "claude-opus-5";
/** Textos curtos (resumos rápidos, listas) — mais barato. */
export const MODELO_RAPIDO = Deno.env.get("CLAUDE_MODELO_RAPIDO") ?? "claude-sonnet-5";

export function cliente() {
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY não configurada. Rode: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...",
    );
  }
  return new Anthropic({ apiKey });
}

type Bloco =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };

/** Monta o bloco certo conforme o arquivo enviado (PDF vira document, foto vira image). */
export function blocoArquivo(base64: string, mime: string): Bloco {
  if (mime === "application/pdf" || mime.endsWith("/pdf")) {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } };
  }
  const suportadas = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  const media = suportadas.includes(mime) ? mime : "image/jpeg";
  return { type: "image", source: { type: "base64", media_type: media, data: base64 } };
}

interface OpcoesTexto {
  system: string;
  conteudo: string | Bloco[];
  modelo?: string;
  maxTokens?: number;
  esforco?: "low" | "medium" | "high" | "xhigh" | "max";
}

/** Pede um texto corrido (relatórios clínicos). */
export async function pedirTexto({
  system, conteudo, modelo = MODELO_PRINCIPAL, maxTokens = 4000, esforco = "medium",
}: OpcoesTexto): Promise<string> {
  const resposta = await cliente().messages.create({
    model: modelo,
    max_tokens: maxTokens,
    system,
    output_config: { effort: esforco },
    messages: [{ role: "user", content: conteudo as never }],
  });

  if (resposta.stop_reason === "refusal") {
    throw new Error("Não foi possível analisar este conteúdo.");
  }

  return resposta.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/**
 * Pede um JSON. O modelo às vezes embrulha em cerca de código ou
 * escreve uma frase antes — por isso o fallback de parsing.
 */
export async function pedirJSON<T>(opcoes: OpcoesTexto): Promise<T> {
  const bruto = await pedirTexto({
    ...opcoes,
    system: `${opcoes.system}\n\nResponda APENAS com JSON válido, sem cercas de código e sem texto antes ou depois.`,
  });

  const tentativas = [
    bruto,
    bruto.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim(),
    bruto.slice(bruto.indexOf("{"), bruto.lastIndexOf("}") + 1),
    bruto.slice(bruto.indexOf("["), bruto.lastIndexOf("]") + 1),
  ];

  for (const tentativa of tentativas) {
    if (!tentativa) continue;
    try {
      return JSON.parse(tentativa) as T;
    } catch {
      /* tenta o próximo formato */
    }
  }
  throw new Error("A resposta da análise veio em formato inesperado. Tente novamente.");
}

/** Tom comum a todos os relatórios do app. */
export const TOM_CLINICO = `
Você redige relatórios para um nutricionista, que os revisa e assina.

Regras de escrita:
- Português do Brasil, tom humano, clínico e direto ao ponto.
- Nada de linguagem de marketing, superlativos ou promessas.
- Sem terrorismo nutricional e sem culpabilizar o paciente.
- Nunca mencione que o texto foi gerado por inteligência artificial, nem se refira a si mesmo.
- Não invente dados: trabalhe apenas com o que foi informado. Quando um dado
  importante faltar, diga explicitamente o que seria necessário coletar.
- Correlações e hipóteses devem ser apresentadas como hipóteses, nunca como diagnóstico.
- Prefira frases curtas e parágrafos de no máximo 4 linhas. Sem tabelas em markdown.
`.trim();
