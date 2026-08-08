// =====================================================================
// whatsapp-send — envio a partir do app (botão "Enviar WhatsApp")
//
// Chamada autenticada: o app manda o JWT do nutricionista logado.
//   supabase functions deploy whatsapp-send
//
// Body:
// {
//   "telefone": "(61) 99679-8718",     // ou "wa_id": "5561996798718"
//   "texto": "Oi Ana, ...",             // só funciona dentro da janela de 24h
//   "template": "lembrete_consulta_24h",// obrigatório fora da janela
//   "params": ["Ana", "12/08", "14h"],
//   "documento": { "link": "https://...", "nome": "exames.pdf", "legenda": "..." },
//   "referencia_tipo": "agenda_task",
//   "referencia_id": "uuid"
// }
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enviarTexto, enviarTemplate, enviarDocumento } from "../_shared/meta.ts";
import { normalizarTelefone } from "../_shared/telefone.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

const admin = createClient(
  SUPABASE_URL,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "método não permitido" }, 405);

  // --- Autenticação ---------------------------------------------------
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ erro: "não autenticado" }, 401);

  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: { user }, error: erroAuth } = await userClient.auth.getUser();
  if (erroAuth || !user) return json({ erro: "não autenticado" }, 401);
  const userId = user.id;

  // --- Entrada --------------------------------------------------------
  const body = await req.json().catch(() => null);
  if (!body) return json({ erro: "json inválido" }, 400);

  const waId = body.wa_id ?? normalizarTelefone(body.telefone);
  if (!waId) {
    return json({
      erro: "telefone_invalido",
      detalhe: `Não consegui normalizar "${body.telefone}" para o formato internacional. ` +
        `Confira o cadastro: precisa ter DDD + número.`,
    }, 400);
  }

  // --- Configuração do número -----------------------------------------
  const { data: config } = await admin
    .from("whatsapp_config")
    .select("phone_number_id, ativo")
    .eq("user_id", userId)
    .maybeSingle();

  if (!config?.phone_number_id) return json({ erro: "whatsapp_nao_configurado" }, 400);
  if (!config.ativo) return json({ erro: "whatsapp_desativado" }, 400);

  // --- Contato: consentimento e janela de 24h -------------------------
  const { data: contato } = await admin
    .from("whatsapp_contatos")
    .select("id, opt_out, ultima_msg_recebida_em")
    .eq("user_id", userId)
    .eq("wa_id", waId)
    .maybeSingle();

  if (contato?.opt_out) {
    return json({
      erro: "opt_out",
      detalhe: "Este contato pediu para não receber mais mensagens. Envio bloqueado.",
    }, 403);
  }

  const dentroJanela = contato?.ultima_msg_recebida_em
    ? new Date(contato.ultima_msg_recebida_em).getTime() > Date.now() - 24 * 60 * 60 * 1000
    : false;

  // --- Envio ----------------------------------------------------------
  let resultado;
  let tipo: string;
  let conteudoLog: string;

  if (body.template) {
    tipo = "template";
    conteudoLog = `[template ${body.template}] ${(body.params ?? []).join(" | ")}`;
    resultado = await enviarTemplate(
      config.phone_number_id,
      waId,
      body.template,
      body.params ?? [],
    );
  } else if (body.documento?.link) {
    if (!dentroJanela) {
      return json({
        erro: "fora_da_janela_24h",
        detalhe: "Anexo só pode ser enviado dentro de 24h desde a última mensagem do contato. " +
          "Mande antes um template pedindo pra pessoa responder, e envie o arquivo depois.",
      }, 409);
    }
    tipo = "document";
    conteudoLog = body.documento.nome ?? "[documento]";
    resultado = await enviarDocumento(
      config.phone_number_id,
      waId,
      body.documento.link,
      body.documento.nome ?? "documento.pdf",
      body.documento.legenda,
    );
  } else if (body.texto) {
    if (!dentroJanela) {
      return json({
        erro: "fora_da_janela_24h",
        detalhe: "Passaram-se mais de 24h desde a última mensagem deste contato. " +
          "Fora dessa janela a Meta só aceita template aprovado — mande `template` em vez de `texto`.",
      }, 409);
    }
    tipo = "text";
    conteudoLog = body.texto;
    resultado = await enviarTexto(config.phone_number_id, waId, body.texto);
  } else {
    return json({ erro: "informe texto, template ou documento" }, 400);
  }

  // --- Log ------------------------------------------------------------
  await admin.from("whatsapp_mensagens").insert({
    user_id: userId,
    contato_id: contato?.id ?? null,
    wa_id: waId,
    direcao: "saida",
    tipo,
    conteudo: conteudoLog,
    template_nome: body.template ?? null,
    template_params: body.params ?? null,
    wamid: resultado.wamid ?? null,
    status: resultado.ok ? "enviada" : "falhou",
    erro: resultado.ok ? null : resultado.erro,
    automacao: null, // manual
    referencia_tipo: body.referencia_tipo ?? null,
    referencia_id: body.referencia_id ?? null,
  });

  if (!resultado.ok) {
    return json({ erro: "falha_no_envio", detalhe: resultado.erro }, 502);
  }

  return json({ ok: true, wamid: resultado.wamid });
});
