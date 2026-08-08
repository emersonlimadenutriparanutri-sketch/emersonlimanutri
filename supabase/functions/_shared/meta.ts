// =====================================================================
// Cliente da WhatsApp Cloud API (Meta Graph API)
//
// O access token vem de Supabase Secrets, NUNCA do banco.
// =====================================================================

// A Meta descontinua versões da Graph API a cada ~2 anos. Deixe isso
// configurável e confira a versão atual em
// https://developers.facebook.com/docs/graph-api/changelog antes de subir.
const GRAPH_VERSION = Deno.env.get("WHATSAPP_GRAPH_VERSION") ?? "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

const TOKEN = Deno.env.get("WHATSAPP_TOKEN");

export interface ResultadoEnvio {
  ok: boolean;
  wamid?: string;
  /** wa_id canônico devolvido pela Meta — pode diferir do número que enviamos. */
  waIdCanonico?: string;
  erro?: unknown;
  /** Código de erro da Meta, útil para decidir entre retry e desistir. */
  codigoErro?: number;
}

interface PayloadMeta {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  [k: string]: unknown;
}

async function postMensagem(
  phoneNumberId: string,
  payload: PayloadMeta,
): Promise<ResultadoEnvio> {
  if (!TOKEN) {
    return { ok: false, erro: "WHATSAPP_TOKEN não configurado nos secrets" };
  }

  let resp: Response;
  try {
    resp = await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    // Falha de rede: vale retry.
    return { ok: false, erro: `falha de rede: ${e}` };
  }

  const corpo = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    return {
      ok: false,
      erro: corpo,
      codigoErro: corpo?.error?.code,
    };
  }

  return {
    ok: true,
    wamid: corpo?.messages?.[0]?.id,
    waIdCanonico: corpo?.contacts?.[0]?.wa_id,
  };
}

/**
 * Texto livre. Só funciona DENTRO da janela de 24h desde a última
 * mensagem recebida do contato. Fora dela a Meta rejeita com o erro 131047.
 */
export function enviarTexto(
  phoneNumberId: string,
  to: string,
  texto: string,
): Promise<ResultadoEnvio> {
  return postMensagem(phoneNumberId, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: true, body: texto },
  });
}

/**
 * Template aprovado. É o ÚNICO jeito de iniciar conversa fora da
 * janela de 24h — ou seja, é o que toda automação agendada usa.
 *
 * `params` são os {{1}}, {{2}}... do corpo, na ordem.
 */
export function enviarTemplate(
  phoneNumberId: string,
  to: string,
  nomeTemplate: string,
  params: string[] = [],
  idioma = "pt_BR",
): Promise<ResultadoEnvio> {
  const componentes = params.length > 0
    ? [{
      type: "body",
      parameters: params.map((p) => ({ type: "text", text: p })),
    }]
    : [];

  return postMensagem(phoneNumberId, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: nomeTemplate,
      language: { code: idioma },
      components: componentes,
    },
  });
}

/**
 * Documento (PDF de exames, "Sua Evolução", plano alimentar...).
 * Requer janela de 24h aberta — anexo não pode ir em template de texto.
 */
export function enviarDocumento(
  phoneNumberId: string,
  to: string,
  link: string,
  nomeArquivo: string,
  legenda?: string,
): Promise<ResultadoEnvio> {
  return postMensagem(phoneNumberId, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "document",
    document: { link, filename: nomeArquivo, caption: legenda },
  });
}

/** Marca a mensagem recebida como lida (o "visto" azul). */
export async function marcarComoLida(
  phoneNumberId: string,
  wamid: string,
): Promise<void> {
  if (!TOKEN) return;
  await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: wamid,
    }),
  }).catch(() => {/* não-crítico */});
}

/**
 * Erros da Meta que NÃO adianta tentar de novo.
 * 131026 = número não tem WhatsApp | 131047 = fora da janela de 24h
 * 132000/132001 = template inexistente ou não aprovado
 * 131051 = tipo de mensagem não suportado
 */
const ERROS_PERMANENTES = new Set([131026, 131047, 131051, 132000, 132001, 132005, 132007]);

export function erroEhPermanente(codigo?: number): boolean {
  return codigo !== undefined && ERROS_PERMANENTES.has(codigo);
}
