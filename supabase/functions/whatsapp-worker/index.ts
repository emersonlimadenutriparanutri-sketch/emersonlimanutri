// =====================================================================
// whatsapp-worker — motor das automações, chamado pelo pg_cron a cada 10min
//
//   Fase 1 (AGENDAR)  -> select public.wa_agendar_todas()
//   Fase 2 (DESPACHAR)-> pega a fila pendente e envia pela Cloud API
//
// DEPLOY: pública, mas protegida por segredo compartilhado.
//   supabase functions deploy whatsapp-worker --no-verify-jwt
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enviarTemplate, enviarTexto, erroEhPermanente } from "../_shared/meta.ts";

const CRON_SECRET = Deno.env.get("CRON_SECRET")!;
const MAX_TENTATIVAS = 3;
// Teto por rodada. Segura o ritmo de envio e evita estourar o rate limit
// da Meta se algo enfileirar muita coisa de uma vez.
const LOTE = 60;

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

/** Comparação em tempo constante do segredo do cron. */
function segredoValido(recebido: string | null): boolean {
  if (!recebido || !CRON_SECRET || recebido.length !== CRON_SECRET.length) return false;
  let diff = 0;
  for (let i = 0; i < CRON_SECRET.length; i++) {
    diff |= CRON_SECRET.charCodeAt(i) ^ recebido.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Garante um whatsapp_contatos para o número. Leads que nunca trocaram
 * mensagem ainda não têm registro — este é o primeiro contato.
 */
async function garantirContato(
  userId: string,
  waId: string,
  referenciaTipo: string | null,
  referenciaId: string | null,
): Promise<{ id: string; optOut: boolean; dentroJanela: boolean } | null> {
  const { data: existente } = await admin
    .from("whatsapp_contatos")
    .select("id, opt_out, ultima_msg_recebida_em")
    .eq("user_id", userId)
    .eq("wa_id", waId)
    .maybeSingle();

  if (existente) {
    return {
      id: existente.id,
      optOut: existente.opt_out,
      dentroJanela: existente.ultima_msg_recebida_em
        ? new Date(existente.ultima_msg_recebida_em).getTime() > Date.now() - 24 * 3600 * 1000
        : false,
    };
  }

  const { data: criado } = await admin
    .from("whatsapp_contatos")
    .insert({
      user_id: userId,
      wa_id: waId,
      telefone_original: waId,
      lead_id: referenciaTipo === "lead" ? referenciaId : null,
      // Consentimento aqui vem do cadastro do lead/paciente (quiz, contrato,
      // formulário). A origem fica registrada para auditoria de LGPD.
      opt_in: true,
      opt_in_em: new Date().toISOString(),
      opt_in_origem: "cadastro_manual",
    })
    .select("id")
    .single();

  return criado ? { id: criado.id, optOut: false, dentroJanela: false } : null;
}

Deno.serve(async (req) => {
  if (!segredoValido(req.headers.get("x-cron-secret"))) {
    return new Response("forbidden", { status: 403 });
  }

  // ------------------------------------------------------------------
  // Fase 0 — destravar itens órfãos
  //
  // Se uma execução anterior morreu no meio (timeout, deploy, crash), o
  // item ficou marcado 'enviando' e nunca mais seria processado. Depois
  // de 15 minutos é seguro assumir que aquela execução não volta.
  // ------------------------------------------------------------------
  await admin
    .from("whatsapp_fila")
    .update({ status: "pendente" })
    .eq("status", "enviando")
    .lt("updated_at", new Date(Date.now() - 15 * 60 * 1000).toISOString());

  // ------------------------------------------------------------------
  // Fase 1 — agendar
  // ------------------------------------------------------------------
  const { data: agendadas, error: erroAgendar } = await admin.rpc("wa_agendar_todas");
  if (erroAgendar) console.error("erro ao agendar:", erroAgendar);

  // ------------------------------------------------------------------
  // Fase 2 — despachar
  // ------------------------------------------------------------------
  const { data: itens } = await admin
    .from("whatsapp_fila")
    .select("*")
    .eq("status", "pendente")
    .lte("agendado_para", new Date().toISOString())
    .order("agendado_para", { ascending: true })
    .limit(LOTE);

  const resumo = { enviados: 0, falhas: 0, pulados: 0 };

  for (const item of itens ?? []) {
    // Claim otimista: só processa se ainda estiver 'pendente'. Se duas
    // execuções do cron se sobrepuserem, a segunda não pega o mesmo item.
    const { data: reservado } = await admin
      .from("whatsapp_fila")
      .update({ status: "enviando" })
      .eq("id", item.id)
      .eq("status", "pendente")
      .select("id")
      .maybeSingle();

    if (!reservado) continue;

    const { data: config } = await admin
      .from("whatsapp_config")
      .select("phone_number_id, ativo")
      .eq("user_id", item.user_id)
      .maybeSingle();

    if (!config?.phone_number_id || !config.ativo) {
      await admin.from("whatsapp_fila")
        .update({ status: "cancelado", ultimo_erro: "whatsapp não configurado ou inativo" })
        .eq("id", item.id);
      resumo.pulados++;
      continue;
    }

    const contato = await garantirContato(
      item.user_id,
      item.wa_id,
      item.referencia_tipo,
      item.referencia_id,
    );

    if (contato?.optOut) {
      await admin.from("whatsapp_fila")
        .update({ status: "cancelado", ultimo_erro: "contato com opt-out" })
        .eq("id", item.id);
      resumo.pulados++;
      continue;
    }

    // Regra da Meta: fora da janela de 24h só template aprovado.
    // Toda automação agendada cai nesse caso, por isso template é o padrão.
    let resultado;
    if (item.template_nome) {
      resultado = await enviarTemplate(
        config.phone_number_id,
        item.wa_id,
        item.template_nome,
        (item.template_params ?? []) as string[],
      );
    } else if (item.texto && contato?.dentroJanela) {
      resultado = await enviarTexto(config.phone_number_id, item.wa_id, item.texto);
    } else {
      await admin.from("whatsapp_fila")
        .update({
          status: "falhou",
          ultimo_erro: "sem template e fora da janela de 24h",
        })
        .eq("id", item.id);
      resumo.falhas++;
      continue;
    }

    // Log da mensagem, dê certo ou errado.
    await admin.from("whatsapp_mensagens").insert({
      user_id: item.user_id,
      contato_id: contato?.id ?? null,
      wa_id: item.wa_id,
      direcao: "saida",
      tipo: item.template_nome ? "template" : "text",
      conteudo: item.template_nome
        ? `[template ${item.template_nome}] ${(item.template_params ?? []).join(" | ")}`
        : item.texto,
      template_nome: item.template_nome,
      template_params: item.template_params,
      wamid: resultado.wamid ?? null,
      status: resultado.ok ? "enviada" : "falhou",
      erro: resultado.ok ? null : resultado.erro,
      automacao: item.automacao,
      referencia_tipo: item.referencia_tipo,
      referencia_id: item.referencia_id,
    });

    if (resultado.ok) {
      await admin.from("whatsapp_fila")
        .update({ status: "enviado", tentativas: item.tentativas + 1, ultimo_erro: null })
        .eq("id", item.id);
      resumo.enviados++;
      continue;
    }

    // Falhou: decide entre desistir e tentar de novo.
    const tentativas = item.tentativas + 1;
    const desistir = erroEhPermanente(resultado.codigoErro) || tentativas >= MAX_TENTATIVAS;

    await admin.from("whatsapp_fila")
      .update({
        status: desistir ? "falhou" : "pendente",
        tentativas,
        ultimo_erro: JSON.stringify(resultado.erro).slice(0, 500),
        // Backoff: 10min, 40min, 90min.
        agendado_para: desistir
          ? item.agendado_para
          : new Date(Date.now() + tentativas * tentativas * 10 * 60 * 1000).toISOString(),
      })
      .eq("id", item.id);

    resumo.falhas++;
  }

  console.log("whatsapp-worker:", JSON.stringify({ agendadas, ...resumo }));

  return new Response(JSON.stringify({ agendadas, ...resumo }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
