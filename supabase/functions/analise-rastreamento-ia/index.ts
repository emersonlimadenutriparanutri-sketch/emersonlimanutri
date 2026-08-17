// =====================================================================
// analise-rastreamento-ia
//
// Lê um rastreamento metabólico respondido (opcionalmente comparando
// com um anterior) e devolve dois relatórios: técnico e didático.
//
// Segue o padrão de analise-calorimetria-ia — mesmo gateway, mesmos
// marcadores de bloco, mesma forma de erro.
//
// DUAS DIFERENÇAS DELIBERADAS
//
// 1. A pontuação é calculada AQUI, não recebida do cliente.
//    A calorimetria recebe `dadosAtuais` do front. Aqui a função busca
//    a resposta e o modelo no banco e soma ela mesma. Motivo: a soma
//    por sistema é o dado clínico do instrumento — se vier pronta do
//    cliente, um bug de tela vira laudo errado sem deixar rastro. E o
//    modelo pode ter 69 sintomas; deixar a IA somar seria pior ainda,
//    porque modelo de linguagem erra aritmética silenciosamente.
//
// 2. A IA recebe a tabela já somada e é instruída a NÃO recalcular.
//    O trabalho dela é interpretar, que é o que a skill HERO chama de
//    narrativa: quais sistemas se destacam, o que a combinação sugere,
//    o que investigar. Números são do código.
//
// POST { envio_id, envio_id_anterior? }
//   200 { relatorio_tecnico, relatorio_didatico, pontuacao }
// =====================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { requireUser } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function err(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function callAI(apiKey: string, body: Record<string, unknown>) {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const t = await response.text();
    console.error("AI gateway error:", response.status, t);
    if (response.status === 429) return err(429, "Limite de requisições excedido.");
    if (response.status === 402) return err(402, "Créditos insuficientes.");
    return err(500, "Erro no serviço de IA");
  }
  return response;
}

type Sintoma = { sistema: string; sintoma: string; nota: number };
type Pontuacao = {
  respondido_em: string | null;
  total: number;
  sistemas: { sistema: string; pontos: number; itens: number }[];
  altos: Sintoma[];
};

// ---------------------------------------------------------------------
// Agrupa e soma.
//
// As perguntas vêm numa lista ordenada: uma type='section' abre um
// sistema, e as type='scale' seguintes pertencem a ele. É a mesma regra
// que a tela do paciente usa para dividir as etapas, então formulário e
// laudo enxergam a mesma estrutura.
// ---------------------------------------------------------------------
function pontuar(perguntas: any[], respostas: Record<string, unknown>, respondidoEm: string | null): Pontuacao {
  const sistemas: { sistema: string; pontos: number; itens: number }[] = [];
  const altos: Sintoma[] = [];
  let atual = "Sem sistema";
  let total = 0;

  for (const p of perguntas ?? []) {
    if (p?.type === "section") {
      atual = String(p.text ?? "Sem sistema");
      sistemas.push({ sistema: atual, pontos: 0, itens: 0 });
      continue;
    }
    if (p?.type !== "scale") continue;

    const bruto = respostas?.[p.id];
    const nota = Number(bruto);
    if (!Number.isFinite(nota)) continue;

    let alvo = sistemas.find((s) => s.sistema === atual);
    if (!alvo) {
      alvo = { sistema: atual, pontos: 0, itens: 0 };
      sistemas.push(alvo);
    }
    alvo.pontos += nota;
    alvo.itens += 1;
    total += nota;

    // A skill HERO destaca os sintomas com nota 3 ou 4.
    if (nota >= 3) altos.push({ sistema: atual, sintoma: String(p.text ?? ""), nota });
  }

  sistemas.sort((a, b) => b.pontos - a.pontos);
  altos.sort((a, b) => b.nota - a.nota);

  return { respondido_em: respondidoEm, total, sistemas, altos };
}

function tabela(p: Pontuacao): string {
  const linhas = p.sistemas.map((s) => `- ${s.sistema}: ${s.pontos} (${s.itens} sintomas)`).join("\n");
  const destaques = p.altos.length
    ? p.altos.map((a) => `- ${a.sintoma} (${a.sistema}): nota ${a.nota}`).join("\n")
    : "- Nenhum sintoma com nota 3 ou 4.";
  return `Pontuação total: ${p.total}\n\nPor sistema, do maior para o menor:\n${linhas}\n\nSintomas mais pontuados (nota 3 ou 4):\n${destaques}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const _auth = await requireUser(req, { requireApproved: true });
  if (!_auth.ok) return _auth.response;
  const _authUser = _auth.user;

  try {
    const { envio_id, envio_id_anterior } = await req.json();
    if (!envio_id) return err(400, "envio_id é obrigatório");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // -----------------------------------------------------------------
    // Carrega um rastreamento e confere que é de quem está pedindo.
    //
    // A função roda com service_role, então a RLS não protege nada aqui
    // dentro — a conferência de dono é explícita e obrigatória.
    // -----------------------------------------------------------------
    async function carregar(id: string) {
      const { data: envio } = await supa
        .from("questionario_envios")
        .select("id, user_id, patient_id, modelo_id")
        .eq("id", id)
        .maybeSingle();

      if (!envio) return { erro: err(404, "Rastreamento não encontrado") };
      if (envio.user_id !== _authUser.id) return { erro: err(403, "Este rastreamento é de outro nutricionista") };

      const { data: resposta } = await supa
        .from("questionario_respostas")
        .select("respostas, respondido_em")
        .eq("envio_id", id)
        .maybeSingle();

      if (!resposta) return { erro: err(409, "Este rastreamento ainda não foi respondido") };

      const { data: modelo } = await supa
        .from("questionario_modelos")
        .select("perguntas")
        .eq("id", envio.modelo_id)
        .maybeSingle();

      if (!modelo) return { erro: err(404, "Modelo não encontrado") };

      return {
        envio,
        pontuacao: pontuar(
          modelo.perguntas as any[],
          (resposta.respostas ?? {}) as Record<string, unknown>,
          resposta.respondido_em as string | null,
        ),
      };
    }

    const atual = await carregar(envio_id);
    if (atual.erro) return atual.erro;

    let anterior: Pontuacao | null = null;
    if (envio_id_anterior) {
      const a = await carregar(envio_id_anterior);
      if (a.erro) return a.erro;
      if (a.envio!.patient_id !== atual.envio!.patient_id) {
        return err(400, "Os dois rastreamentos são de pacientes diferentes");
      }
      anterior = a.pontuacao!;
    }

    const { data: paciente } = await supa
      .from("patients")
      .select("nome")
      .eq("id", atual.envio!.patient_id)
      .maybeSingle();

    const nome = paciente?.nome ?? "Paciente";

    // -----------------------------------------------------------------
    // O prompt.
    //
    // A IA recebe a tabela pronta. A instrução de não recalcular é
    // explícita: com 69 itens, a tentação de "conferir" a soma produz
    // números diferentes dos que a tela mostra, e aí o laudo contradiz
    // o app.
    // -----------------------------------------------------------------
    const blocoAtual = `RASTREAMENTO ATUAL (${atual.pontuacao!.respondido_em ?? "data não registrada"})\n${tabela(atual.pontuacao!)}`;

    const blocoAnterior = anterior
      ? `\n\nRASTREAMENTO ANTERIOR (${anterior.respondido_em ?? "data não registrada"})\n${tabela(anterior)}`
      : "";

    const pedidoComparativo = anterior
      ? `\n\nCompare os dois momentos: o que melhorou, o que piorou e o que ficou estável. Use as diferenças de pontuação por sistema, não impressões.`
      : "";

    const response = await callAI(LOVABLE_API_KEY, {
      model: "google/gemini-2.5-pro",
      messages: [
        {
          role: "system",
          content:
            "Você é nutricionista clínico com experiência em medicina funcional e no uso de rastreamento metabólico (questionário de sintomas pontuados de 0 a 4 por sistema). Escreve relatórios em dois blocos: um técnico, para o profissional, e um didático humanizado, para o paciente. Nunca inventa sintomas que não foram pontuados. É explícito quanto ao fato de que o instrumento é triagem de sintomas e não substitui diagnóstico médico.",
        },
        {
          role: "user",
          content: `Paciente: ${nome}

${blocoAtual}${blocoAnterior}

REGRA IMPORTANTE: as pontuações acima já foram calculadas e conferidas. NÃO recalcule, NÃO some novamente e NÃO questione os números. Use-os exatamente como estão. Seu trabalho é interpretar.

Gere o relatório em DOIS BLOCOS, usando os marcadores exatos abaixo:

===RELATORIO_TECNICO===
[Para o nutricionista:
- Quais sistemas concentram a carga de sintomas e o que a combinação deles sugere em conjunto (ex.: Emoções + Mente altos apontam eixo neuro/estresse; Trato digestivo + Articulações sugerem componente inflamatório/intestinal)
- Leitura dos sintomas com nota 3 e 4, que são os de maior impacto relatado
- Hipóteses a investigar e o que cruzar com anamnese e exames
- Conduta inicial sugerida e quando reavaliar o rastreamento
- NÃO repita a tabela em texto corrido: interprete
- Bullet points, linguagem técnica]${pedidoComparativo}

===RELATORIO_DIDATICO===
[Para o paciente, em linguagem simples e acolhedora:
- O que este questionário mostra, em duas ou três frases
- Onde o corpo dele está pedindo mais atenção agora
- Três orientações práticas e diretas
- Uma frase final de encorajamento
- NÃO use jargão. NÃO cite "pontuação", "sistemas" nem nomes de exames
- NÃO dê diagnóstico nem fale em doença]

Português do Brasil. Mantenha os marcadores exatamente como mostrados.`,
        },
      ],
    });

    if (response.status !== 200) return response;

    const result = await response.json();
    const fullText = result.choices?.[0]?.message?.content || "";

    const tecMatch = fullText.match(/===RELATORIO_TECNICO===([\s\S]*?)(===RELATORIO_DIDATICO===|$)/);
    const didMatch = fullText.match(/===RELATORIO_DIDATICO===([\s\S]*?)$/);

    return new Response(
      JSON.stringify({
        relatorio_tecnico: (tecMatch?.[1] || fullText).trim(),
        relatorio_didatico: (didMatch?.[1] || "").trim(),
        pontuacao: atual.pontuacao,
        pontuacao_anterior: anterior,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("analise-rastreamento-ia error:", e);
    return err(500, e instanceof Error ? e.message : "Erro desconhecido");
  }
});
