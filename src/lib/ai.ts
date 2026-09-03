import { supabase } from "./supabase";

/**
 * Toda chamada de IA passa por Edge Function.
 * A chave da Anthropic vive apenas nos secrets do Supabase — nunca no front.
 */
export type FuncaoIA =
  | "exames-pdf-ia"
  | "analise-rastreamento-ia"
  | "resumo-anamnese"
  | "resumo-consulta"
  | "resumo-questionario"
  | "evolucao-paciente"
  | "gerar-mapa-mental";

export async function chamarIA<T = any>(funcao: FuncaoIA, payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(funcao, { body: payload });
  if (error) {
    const detalhe = (data as any)?.error || error.message;
    throw new Error(detalhe || "Não foi possível concluir a análise agora.");
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

/** Lê um arquivo local e devolve base64 puro (sem o prefixo data:). */
export function arquivoParaBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
    reader.readAsDataURL(file);
  });
}
