// =====================================================================
// whatsapp-webhook — recebe eventos da Meta
//
// Faz três coisas:
//   1. GET  -> handshake de verificação exigido pela Meta ao cadastrar a URL
//   2. POST /messages -> mensagem recebida: grava, abre a janela de 24h,
//                        casa com lead/paciente, cria lead se for número novo
//   3. POST /statuses -> atualiza status de entrega (enviada/entregue/lida/falhou)
//
// DEPLOY: esta função é PÚBLICA (a Meta chama sem JWT).
//   supabase functions deploy whatsapp-webhook --no-verify-jwt
//
// Por ser pública, a validação de assinatura HMAC abaixo é a ÚNICA coisa
// separando o banco de qualquer um que descubra a URL. Não remova.
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { marcarComoLida } from "../_shared/meta.ts";

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN")!;
const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET")!;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

// ---------------------------------------------------------------------
// Validação da assinatura X-Hub-Signature-256
// ---------------------------------------------------------------------
async function assinaturaValida(corpoBruto: string, header: string | null): Promise<boolean> {
  if (!header?.startsWith("sha256=") || !APP_SECRET) return false;

  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinatura = await crypto.subtle.sign(
    "HMAC",
    chave,
    new TextEncoder().encode(corpoBruto),
  );
  const esperado = Array.from(new Uint8Array(assinatura))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const recebido = header.slice("sha256=".length);
  if (recebido.length !== esperado.length) return false;

  // Comparação em tempo constante — evita timing attack.
  let diff = 0;
  for (let i = 0; i < esperado.length; i++) {
    diff |= esperado.charCodeAt(i) ^ recebido.charCodeAt(i);
  }
  return diff === 0;
}

// ---------------------------------------------------------------------
// Palavras que o contato pode mandar pra sair da lista (LGPD, art. 18)
// ---------------------------------------------------------------------
const PALAVRAS_OPT_OUT = ["sair", "parar", "descadastrar", "nao quero", "não quero", "stop"];

function pediuOptOut(texto: string): boolean {
  const t = texto.trim().toLowerCase();
  return PALAVRAS_OPT_OUT.some((p) => t === p || t.startsWith(p + " "));
}

// ---------------------------------------------------------------------
// Extrai um texto legível de qualquer tipo de mensagem
// ---------------------------------------------------------------------
function extrairConteudo(msg: Record<string, any>): { tipo: string; conteudo: string; midiaId?: string } {
  switch (msg.type) {
    case "text":
      return { tipo: "text", conteudo: msg.text?.body ?? "" };
    case "button":
      return { tipo: "button", conteudo: msg.button?.text ?? "" };
    case "interactive":
      return {
        tipo: "interactive",
        conteudo: msg.interactive?.button_reply?.title
          ?? msg.interactive?.list_reply?.title
          ?? "",
      };
    case "image":
      return { tipo: "image", conteudo: msg.image?.caption ?? "[imagem]", midiaId: msg.image?.id };
    case "document":
      return { tipo: "document", conteudo: msg.document?.filename ?? "[documento]", midiaId: msg.document?.id };
    case "audio":
      return { tipo: "audio", conteudo: "[áudio]", midiaId: msg.audio?.id };
    case "video":
      return { tipo: "video", conteudo: msg.video?.caption ?? "[vídeo]", midiaId: msg.video?.id };
    default:
      return { tipo: msg.type ?? "desconhecido", conteudo: `[${msg.type}]` };
  }
}

// ---------------------------------------------------------------------
// Encontra (ou cria) o contato, casando com lead/paciente existentes
// ---------------------------------------------------------------------
async function resolverContato(
  userId: string,
  waId: string,
  nomePerfil: string | null,
): Promise<string | null> {
  const { data: existente } = await supabase
    .from("whatsapp_contatos")
    .select("id")
    .eq("user_id", userId)
    .eq("wa_id", waId)
    .maybeSingle();

  if (existente) return existente.id;

  // Número novo: tenta casar com um paciente ou lead já cadastrado.
  // Compara pelos 8 últimos dígitos — é o que sobrevive à bagunça de
  // formatos ('(61) 99679-8718' vs '55 61 9943-2661' vs '19992390247')
  // e ao 9º dígito faltando em cadastros antigos.
  const sufixo = waId.slice(-8);

  let pacienteId: string | null = null;
  let leadId: string | null = null;

  const { data: pacientes } = await supabase
    .from("patients")
    .select("id, nome, telefone")
    .eq("user_id", userId)
    .not("telefone", "is", null);

  const paciente = pacientes?.find(
    (p) => (p.telefone ?? "").replace(/\D/g, "").endsWith(sufixo),
  );
  if (paciente) pacienteId = paciente.id;

  if (!pacienteId) {
    const { data: leads } = await supabase
      .from("leads")
      .select("id, nome, telefone")
      .eq("user_id", userId)
      .not("telefone", "is", null);

    const lead = leads?.find(
      (l) => (l.telefone ?? "").replace(/\D/g, "").endsWith(sufixo),
    );
    if (lead) leadId = lead.id;
  }

  // Número totalmente desconhecido -> vira lead novo no CRM.
  // É exatamente o "lead que chegou no WhatsApp e se perdeu" que hoje
  // some porque ninguém cadastra na hora.
  if (!pacienteId && !leadId) {
    const { data: novoLead } = await supabase
      .from("leads")
      .insert({
        user_id: userId,
        nome: nomePerfil ?? "Contato WhatsApp",
        telefone: waId,
        origem: "WhatsApp",
        status: "Novo lead",
        temperatura: "morno",
        data_entrada: new Date().toISOString(),
        historico: [{
          data: new Date().toISOString(),
          texto: "Lead criado automaticamente a partir de mensagem recebida no WhatsApp.",
        }],
      })
      .select("id")
      .single();

    leadId = novoLead?.id ?? null;
  }

  const { data: criado } = await supabase
    .from("whatsapp_contatos")
    .insert({
      user_id: userId,
      wa_id: waId,
      telefone_original: waId,
      nome: nomePerfil,
      lead_id: leadId,
      paciente_id: pacienteId,
      // Quem manda mensagem pra você está, por definição, iniciando
      // contato. Isso é opt-in válido — e fica registrado com origem.
      opt_in: true,
      opt_in_em: new Date().toISOString(),
      opt_in_origem: "mensagem_recebida",
    })
    .select("id")
    .single();

  return criado?.id ?? null;
}

// ---------------------------------------------------------------------
Deno.serve(async (req) => {
  const url = new URL(req.url);

  // --- 1. Handshake de verificação ------------------------------------
  if (req.method === "GET") {
    const modo = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (modo === "subscribe" && token === VERIFY_TOKEN) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  // --- 2. Assinatura --------------------------------------------------
  const corpoBruto = await req.text();
  if (!await assinaturaValida(corpoBruto, req.headers.get("x-hub-signature-256"))) {
    console.error("assinatura inválida no webhook");
    return new Response("invalid signature", { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(corpoBruto);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  // --- 3. Processamento -----------------------------------------------
  // Sempre respondemos 200 no fim: se devolvermos erro, a Meta reentrega
  // o mesmo evento em loop e ainda pode desativar o webhook.
  try {
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {};
        const phoneNumberId = value.metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        // Descobre de qual nutricionista é este número.
        const { data: config } = await supabase
          .from("whatsapp_config")
          .select("user_id")
          .eq("phone_number_id", phoneNumberId)
          .maybeSingle();

        if (!config) {
          console.warn(`phone_number_id desconhecido: ${phoneNumberId}`);
          continue;
        }
        const userId = config.user_id;

        // --- 3a. Mensagens recebidas ---
        for (const msg of value.messages ?? []) {
          const waId: string = msg.from;
          const nomePerfil: string | null =
            value.contacts?.find((c: any) => c.wa_id === waId)?.profile?.name ?? null;

          const contatoId = await resolverContato(userId, waId, nomePerfil);
          const { tipo, conteudo, midiaId } = extrairConteudo(msg);

          // Idempotência: a Meta reentrega webhooks. O UNIQUE em wamid
          // faz o insert duplicado falhar silenciosamente.
          const { error: erroInsert } = await supabase
            .from("whatsapp_mensagens")
            .insert({
              user_id: userId,
              contato_id: contatoId,
              wa_id: waId,
              direcao: "entrada",
              tipo,
              conteudo,
              midia_id: midiaId,
              wamid: msg.id,
              status: "recebida",
            });

          // 23505 = unique_violation -> já processamos este evento, pula.
          if (erroInsert?.code === "23505") continue;

          // Abre (ou renova) a janela de 24h.
          const patch: Record<string, unknown> = {
            ultima_msg_recebida_em: new Date(Number(msg.timestamp) * 1000).toISOString(),
          };

          if (tipo === "text" && pediuOptOut(conteudo)) {
            patch.opt_out = true;
            patch.opt_out_em = new Date().toISOString();
            console.log(`opt-out solicitado por ${waId}`);
          }

          if (contatoId) {
            await supabase.from("whatsapp_contatos").update(patch).eq("id", contatoId);

            // O lead respondeu: cancela follow-ups automáticos na fila.
            // Nada pior que o robô insistindo depois que a pessoa já falou.
            await supabase
              .from("whatsapp_fila")
              .update({ status: "cancelado", ultimo_erro: "contato respondeu" })
              .eq("contato_id", contatoId)
              .eq("status", "pendente")
              .like("automacao", "followup%");
          }

          await marcarComoLida(phoneNumberId, msg.id);
        }

        // --- 3b. Status de entrega ---
        for (const st of value.statuses ?? []) {
          const mapa: Record<string, string> = {
            sent: "enviada",
            delivered: "entregue",
            read: "lida",
            failed: "falhou",
          };

          await supabase
            .from("whatsapp_mensagens")
            .update({
              status: mapa[st.status] ?? st.status,
              erro: st.errors ?? null,
            })
            .eq("wamid", st.id);
        }
      }
    }
  } catch (e) {
    // Loga mas devolve 200 — ver comentário acima.
    console.error("erro processando webhook:", e);
  }

  return new Response("ok", { status: 200 });
});
