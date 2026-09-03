import { createClient } from "@supabase/supabase-js";
import { corsHeaders, erro, json } from "../_shared/cors.ts";

/**
 * Tela pública do questionário (/q/:token).
 *
 * Roda com service role para que as tabelas continuem 100% fechadas por RLS:
 * o paciente nunca recebe uma sessão, e esta função só devolve/aceita dados
 * do envio correspondente ao token — nada além disso.
 */
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const TOKEN_VALIDO = /^[a-zA-Z0-9_-]{8,128}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { acao, token, respostas } = await req.json();
    if (!token || !TOKEN_VALIDO.test(String(token))) return erro("Link inválido.", 404);

    const { data: envio, error: erroEnvio } = await supabase
      .from("questionario_envios")
      .select("id, user_id, modelo_id, patient_id, respondido, respondido_em, expira_em, destinatario")
      .eq("token", token)
      .maybeSingle();

    if (erroEnvio) throw erroEnvio;
    if (!envio) return erro("Este link não existe mais.", 404);

    if (envio.expira_em && envio.expira_em < new Date().toISOString().slice(0, 10)) {
      return erro("Este link expirou. Peça um novo ao seu nutricionista.", 410);
    }

    const { data: modelo, error: erroModelo } = await supabase
      .from("questionario_modelos")
      .select("titulo, descricao, perguntas, ativo")
      .eq("id", envio.modelo_id)
      .maybeSingle();

    if (erroModelo) throw erroModelo;
    if (!modelo || !modelo.ativo) return erro("Este questionário não está mais disponível.", 410);

    if (acao === "buscar") {
      return json({
        titulo: modelo.titulo,
        descricao: modelo.descricao,
        perguntas: modelo.perguntas ?? [],
        respondido: envio.respondido,
        destinatario: envio.destinatario,
      });
    }

    if (acao === "responder") {
      if (envio.respondido) return erro("Este questionário já foi respondido.", 409);
      if (!respostas || typeof respostas !== "object") return erro("Nenhuma resposta recebida.");

      // Só aceita chaves que existem no modelo — o corpo da requisição é público.
      const idsValidos = new Set((modelo.perguntas ?? []).map((p: { id: string }) => p.id));
      const limpas: Record<string, unknown> = {};
      for (const [chave, valor] of Object.entries(respostas)) {
        if (idsValidos.has(chave)) limpas[chave] = valor;
      }

      const faltando = (modelo.perguntas ?? []).find(
        (p: { id: string; obrigatoria?: boolean }) =>
          p.obrigatoria && (limpas[p.id] === undefined || limpas[p.id] === "" ||
            (Array.isArray(limpas[p.id]) && (limpas[p.id] as unknown[]).length === 0)),
      );
      if (faltando) return erro("Responda todas as perguntas obrigatórias.");

      const agora = new Date().toISOString();

      const { error: erroResposta } = await supabase.from("questionario_respostas").insert({
        user_id: envio.user_id,
        envio_id: envio.id,
        modelo_id: envio.modelo_id,
        patient_id: envio.patient_id,
        respostas: limpas,
      });
      if (erroResposta) throw erroResposta;

      const { error: erroUpdate } = await supabase
        .from("questionario_envios")
        .update({ respondido: true, respondido_em: agora })
        .eq("id", envio.id);
      if (erroUpdate) throw erroUpdate;

      return json({ ok: true });
    }

    return erro("Ação desconhecida.");
  } catch (e) {
    console.error(e);
    return erro("Não foi possível processar agora. Tente novamente em instantes.", 500);
  }
});
