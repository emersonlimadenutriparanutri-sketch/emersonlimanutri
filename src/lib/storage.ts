import { supabase } from "./supabase";

export type Bucket = "avatars" | "exames-temp" | "paciente-exames" | "avaliacoes-fotos" | "lesson-materials";

/** Todo arquivo é gravado em <user_id>/... — é o que as policies de storage exigem. */
export async function enviarArquivo(bucket: Bucket, userId: string, file: File, prefixo = "") {
  const extensao = file.name.split(".").pop() ?? "bin";
  const caminho = `${userId}/${prefixo ? `${prefixo}/` : ""}${crypto.randomUUID()}.${extensao}`;
  const { error } = await supabase.storage.from(bucket).upload(caminho, file, { upsert: false });
  if (error) throw error;
  return { caminho, nome: file.name };
}

/** Buckets são privados: o acesso é sempre por URL assinada temporária. */
export async function urlAssinada(bucket: Bucket, caminho: string, segundos = 3600) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(caminho, segundos);
  if (error) throw error;
  return data.signedUrl;
}

export async function removerArquivo(bucket: Bucket, caminho: string) {
  const { error } = await supabase.storage.from(bucket).remove([caminho]);
  if (error) throw error;
}

export async function abrirArquivo(bucket: Bucket, caminho: string) {
  const url = await urlAssinada(bucket, caminho);
  window.open(url, "_blank", "noopener");
}
