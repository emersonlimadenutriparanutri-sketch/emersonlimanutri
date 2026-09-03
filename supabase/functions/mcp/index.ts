import { createClient } from "@supabase/supabase-js";

/**
 * Servidor MCP do consultório — o "conector" que o nutricionista adiciona no Claude.
 *
 * Roda no Supabase do próprio nutricionista e responde apenas com os dados dele:
 * o token identifica o dono e TODA consulta é forçada a `user_id = dono`, mesmo
 * usando a service role. Não existe caminho que devolva dado de outro usuário.
 *
 * Autenticação aceita duas formas, porque os clientes MCP diferem:
 *   1. Cabeçalho  Authorization: Bearer nutri_xxx      (Claude Code, MCP local)
 *   2. Token na URL  .../functions/v1/mcp/nutri_xxx    (conector do claude.ai)
 */

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, mcp-protocol-version, mcp-session-id",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Expose-Headers": "mcp-session-id",
};

const PROTOCOLO_PADRAO = "2025-06-18";

/** Tabelas que o conector pode tocar. Tudo fora desta lista é recusado. */
const TABELAS = [
  "patients", "leads", "anamnese", "rastreamento_metabolico", "jornada", "jornada_templates",
  "agenda_tasks", "avaliacoes_fisicas", "analise_exames", "resumos_consulta", "raio_x_semanal",
  "calorimetria_indireta", "relatorios_evolucao", "servicos", "receitas", "despesas",
  "lancamentos", "contas_financeiras", "plano_contas", "metas_financeiras",
  "questionario_modelos", "questionario_envios", "questionario_respostas",
  "kanban_boards", "kanban_columns", "kanban_cards", "mind_maps",
] as const;

type Tabela = (typeof TABELAS)[number];
const tabelaValida = (t: string): t is Tabela => (TABELAS as readonly string[]).includes(t);

/* ------------------------------------------------------------------ */
/* Autenticação                                                        */
/* ------------------------------------------------------------------ */

async function sha256(valor: string) {
  const bytes = new TextEncoder().encode(valor);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function extrairToken(req: Request): string | null {
  const cabecalho = req.headers.get("authorization") ?? "";
  const bearer = cabecalho.match(/^Bearer\s+(nutri_[A-Za-z0-9]+)$/i);
  if (bearer) return bearer[1];

  const url = new URL(req.url);
  const naQuery = url.searchParams.get("token");
  if (naQuery?.startsWith("nutri_")) return naQuery;

  // .../functions/v1/mcp/nutri_xxxx
  const ultimo = url.pathname.split("/").filter(Boolean).pop();
  if (ultimo?.startsWith("nutri_")) return ultimo;

  return null;
}

async function donoDoToken(req: Request): Promise<string | null> {
  const token = extrairToken(req);
  if (!token) return null;

  const { data } = await supabase
    .from("mcp_tokens")
    .select("id, user_id")
    .eq("token_hash", await sha256(token))
    .eq("revogado", false)
    .maybeSingle();

  if (!data) return null;

  // Registro de uso: não bloqueia a resposta se falhar.
  supabase.from("mcp_tokens").update({ ultimo_uso: new Date().toISOString() }).eq("id", data.id)
    .then(() => {}, () => {});

  return data.user_id as string;
}

/* ------------------------------------------------------------------ */
/* Catálogo de ferramentas                                             */
/* ------------------------------------------------------------------ */

const objeto = (props: Record<string, unknown>, obrigatorios: string[] = []) => ({
  type: "object", properties: props, required: obrigatorios, additionalProperties: false,
});
const texto = (description: string) => ({ type: "string", description });
const numero = (description: string) => ({ type: "number", description });

const FERRAMENTAS = [
  {
    name: "listar_pacientes",
    description:
      "Lista os pacientes do consultório. Use para responder quem está ativo, quem tem plano vencendo " +
      "ou para encontrar o id de um paciente antes de chamar outra ferramenta.",
    inputSchema: objeto({
      busca: texto("Filtra por nome (parcial, sem diferenciar maiúsculas)."),
      status: { type: "string", enum: ["ativo", "inativo"], description: "Situação do paciente." },
      vencendo_em_dias: numero("Somente pacientes cujo plano vence dentro deste número de dias."),
      limite: numero("Máximo de registros (padrão 50)."),
    }),
  },
  {
    name: "obter_paciente",
    description: "Ficha completa de um paciente: dados cadastrais, plano e ciclo menstrual.",
    inputSchema: objeto({ patient_id: texto("Id do paciente.") }, ["patient_id"]),
  },
  {
    name: "historico_do_paciente",
    description:
      "Histórico clínico consolidado de um paciente: anamneses, avaliações físicas, exames, " +
      "rastreamentos, Raio-X semanais e resumos de consulta. Use antes de escrever qualquer conduta.",
    inputSchema: objeto({
      patient_id: texto("Id do paciente."),
      limite_por_tipo: numero("Quantos registros de cada tipo trazer (padrão 5)."),
    }, ["patient_id"]),
  },
  {
    name: "jornada_do_paciente",
    description: "Cronograma de acompanhamento do paciente (mês, semana, tarefas e o que está atrasado).",
    inputSchema: objeto({
      patient_id: texto("Id do paciente."),
      apenas_pendentes: { type: "boolean", description: "Só tarefas não concluídas." },
    }, ["patient_id"]),
  },
  {
    name: "listar_leads",
    description: "Leads do funil comercial, com etapa, temperatura, valor potencial e próxima ação.",
    inputSchema: objeto({
      status: texto("Etapa do funil: novo_lead, contato_feito, qualificado, proposta_enviada, agendado, fechado ou perdido."),
      temperatura: { type: "string", enum: ["frio", "morno", "quente"] },
      limite: numero("Máximo de registros (padrão 50)."),
    }),
  },
  {
    name: "agenda",
    description: "Tarefas e compromissos da agenda em um intervalo de datas.",
    inputSchema: objeto({
      de: texto("Data inicial no formato AAAA-MM-DD."),
      ate: texto("Data final no formato AAAA-MM-DD."),
      apenas_pendentes: { type: "boolean", description: "Só o que ainda não foi concluído." },
    }),
  },
  {
    name: "resumo_do_consultorio",
    description:
      "Visão geral do consultório agora: pacientes ativos por tipo de plano, planos vencendo em 7 dias, " +
      "leads do mês, tarefas atrasadas e receita do mês corrente.",
    inputSchema: objeto({}),
  },
  {
    name: "criar_tarefa",
    description: "Cria uma tarefa ou compromisso na agenda do nutricionista.",
    inputSchema: objeto({
      titulo: texto("Título da tarefa."),
      data: texto("Data no formato AAAA-MM-DD."),
      hora: texto("Hora no formato HH:MM (opcional)."),
      tipo: texto("tarefa, consulta, raio_x, contato, lembrete, envio_material, ajuste_plano, retorno ou outro."),
      descricao: texto("Detalhes da tarefa."),
      patient_id: texto("Id do paciente relacionado (opcional)."),
    }, ["titulo", "data"]),
  },
  {
    name: "salvar_registro",
    description:
      "Cria ou atualiza um registro em uma tabela do app. Informe 'id' para atualizar. " +
      "Use com cuidado: escreve no prontuário real. Tabelas permitidas: " + TABELAS.join(", ") + ".",
    inputSchema: objeto({
      tabela: texto("Nome da tabela."),
      dados: { type: "object", description: "Campos a gravar. Inclua 'id' para atualizar um registro existente." },
    }, ["tabela", "dados"]),
  },
  {
    name: "consultar_tabela",
    description:
      "Consulta genérica em qualquer tabela permitida, para perguntas que as outras ferramentas não cobrem. " +
      "Tabelas: " + TABELAS.join(", ") + ".",
    inputSchema: objeto({
      tabela: texto("Nome da tabela."),
      filtros: { type: "object", description: "Pares coluna: valor para filtrar (igualdade)." },
      ordenar_por: texto("Coluna de ordenação (padrão created_at)."),
      crescente: { type: "boolean", description: "Ordem crescente (padrão falso)." },
      limite: numero("Máximo de registros (padrão 50, teto 200)."),
    }, ["tabela"]),
  },
];

/* ------------------------------------------------------------------ */
/* Execução das ferramentas                                            */
/* ------------------------------------------------------------------ */

const hoje = () => new Date().toISOString().slice(0, 10);

function emDias(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

async function executar(nome: string, args: Record<string, any>, userId: string): Promise<unknown> {
  const limite = (v: unknown, padrao = 50) => Math.min(Number(v) || padrao, 200);

  switch (nome) {
    case "listar_pacientes": {
      let q = supabase.from("patients").select("*").eq("user_id", userId);
      if (args.status) q = q.eq("status", args.status);
      if (args.busca) q = q.ilike("nome", `%${args.busca}%`);
      if (args.vencendo_em_dias != null) {
        q = q.gte("plano_vencimento", hoje()).lte("plano_vencimento", emDias(Number(args.vencendo_em_dias)));
      }
      const { data, error } = await q.order("nome", { ascending: true }).limit(limite(args.limite));
      if (error) throw error;
      return { total: data?.length ?? 0, pacientes: data };
    }

    case "obter_paciente": {
      const { data, error } = await supabase
        .from("patients").select("*").eq("user_id", userId).eq("id", args.patient_id).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Paciente não encontrado.");
      return data;
    }

    case "historico_do_paciente": {
      const n = Math.min(Number(args.limite_por_tipo) || 5, 20);
      const buscar = async (tabela: string, coluna: string) => {
        const { data } = await supabase
          .from(tabela).select("*")
          .eq("user_id", userId).eq("patient_id", args.patient_id)
          .order(coluna, { ascending: false }).limit(n);
        return data ?? [];
      };
      const [paciente, anamneses, avaliacoes, exames, rastreios, raiosX, consultas] = await Promise.all([
        supabase.from("patients").select("*").eq("user_id", userId).eq("id", args.patient_id).maybeSingle(),
        buscar("anamnese", "data"),
        buscar("avaliacoes_fisicas", "data"),
        buscar("analise_exames", "data"),
        buscar("rastreamento_metabolico", "data"),
        buscar("raio_x_semanal", "semana_ref"),
        buscar("resumos_consulta", "data"),
      ]);
      if (!paciente.data) throw new Error("Paciente não encontrado.");
      return {
        paciente: paciente.data,
        anamneses, avaliacoes_fisicas: avaliacoes, exames,
        rastreamentos: rastreios, raio_x_semanal: raiosX, resumos_consulta: consultas,
      };
    }

    case "jornada_do_paciente": {
      let q = supabase.from("jornada").select("*").eq("user_id", userId).eq("patient_id", args.patient_id);
      if (args.apenas_pendentes) q = q.eq("concluida", false);
      const { data, error } = await q.order("mes").order("semana").order("ordem");
      if (error) throw error;
      const atrasadas = (data ?? []).filter((t: any) => !t.concluida && t.data_prevista && t.data_prevista < hoje());
      return { total: data?.length ?? 0, atrasadas: atrasadas.length, tarefas: data };
    }

    case "listar_leads": {
      let q = supabase.from("leads").select("*").eq("user_id", userId);
      if (args.status) q = q.eq("status", args.status);
      if (args.temperatura) q = q.eq("temperatura", args.temperatura);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(limite(args.limite));
      if (error) throw error;
      return { total: data?.length ?? 0, leads: data };
    }

    case "agenda": {
      let q = supabase.from("agenda_tasks").select("*").eq("user_id", userId);
      if (args.de) q = q.gte("data", args.de);
      if (args.ate) q = q.lte("data", args.ate);
      if (args.apenas_pendentes) q = q.eq("concluida", false);
      const { data, error } = await q.order("data", { ascending: true }).limit(200);
      if (error) throw error;
      return { total: data?.length ?? 0, eventos: data };
    }

    case "resumo_do_consultorio": {
      const inicioDoMes = `${hoje().slice(0, 7)}-01`;
      const [pacientes, leads, tarefas, receitas] = await Promise.all([
        supabase.from("patients").select("plano_tipo, plano_vencimento, status").eq("user_id", userId),
        supabase.from("leads").select("status, created_at, valor_potencial").eq("user_id", userId).gte("created_at", inicioDoMes),
        supabase.from("agenda_tasks").select("data, concluida").eq("user_id", userId).eq("concluida", false),
        supabase.from("receitas").select("valor").eq("user_id", userId).gte("data_competencia", inicioDoMes),
      ]);

      const todos = pacientes.data ?? [];
      const ativos = todos.filter((p: any) => p.status === "ativo" && (!p.plano_vencimento || p.plano_vencimento >= hoje()));
      return {
        pacientes_ativos_premium: ativos.filter((p: any) => p.plano_tipo === "premium").length,
        pacientes_ativos_mensal: ativos.filter((p: any) => p.plano_tipo !== "premium").length,
        pacientes_vencidos: todos.filter((p: any) => p.status === "ativo" && p.plano_vencimento && p.plano_vencimento < hoje()).length,
        planos_vencendo_em_7_dias: ativos.filter((p: any) => p.plano_vencimento && p.plano_vencimento <= emDias(7)).length,
        leads_do_mes: leads.data?.length ?? 0,
        leads_fechados_no_mes: (leads.data ?? []).filter((l: any) => l.status === "fechado").length,
        tarefas_pendentes: tarefas.data?.length ?? 0,
        tarefas_atrasadas: (tarefas.data ?? []).filter((t: any) => t.data < hoje()).length,
        receita_do_mes: (receitas.data ?? []).reduce((s: number, r: any) => s + Number(r.valor || 0), 0),
      };
    }

    case "criar_tarefa": {
      const { data, error } = await supabase.from("agenda_tasks").insert({
        user_id: userId,
        titulo: args.titulo,
        data: args.data,
        hora: args.hora ?? null,
        tipo: args.tipo ?? "tarefa",
        descricao: args.descricao ?? null,
        patient_id: args.patient_id ?? null,
      }).select().single();
      if (error) throw error;
      return data;
    }

    case "salvar_registro": {
      if (!tabelaValida(args.tabela)) throw new Error(`Tabela não permitida: ${args.tabela}`);
      const { id, user_id: _ignorado, ...campos } = (args.dados ?? {}) as Record<string, any>;
      const payload = { ...campos, user_id: userId };

      const query = id
        // O filtro por user_id impede escrita em registro de outro dono.
        ? supabase.from(args.tabela).update(payload).eq("id", id).eq("user_id", userId).select().single()
        : supabase.from(args.tabela).insert(payload).select().single();

      const { data, error } = await query;
      if (error) throw error;
      return data;
    }

    case "consultar_tabela": {
      if (!tabelaValida(args.tabela)) throw new Error(`Tabela não permitida: ${args.tabela}`);
      let q = supabase.from(args.tabela).select("*").eq("user_id", userId);
      for (const [coluna, valor] of Object.entries(args.filtros ?? {})) {
        if (coluna === "user_id" || valor === null || valor === undefined || valor === "") continue;
        q = q.eq(coluna, valor as never);
      }
      const { data, error } = await q
        .order(args.ordenar_por ?? "created_at", { ascending: Boolean(args.crescente) })
        .limit(limite(args.limite));
      if (error) throw error;
      return { total: data?.length ?? 0, registros: data };
    }

    default:
      throw new Error(`Ferramenta desconhecida: ${nome}`);
  }
}

/* ------------------------------------------------------------------ */
/* Transporte JSON-RPC (MCP Streamable HTTP)                           */
/* ------------------------------------------------------------------ */

const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, "Content-Type": "application/json" } });

const rpcErro = (id: unknown, code: number, message: string) =>
  resposta({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Alguns clientes abrem um GET para SSE; este servidor é só request/response.
  if (req.method === "GET") {
    return new Response("Servidor MCP do consultório. Use POST com JSON-RPC.", {
      status: 405, headers: { ...cors, Allow: "POST, OPTIONS" },
    });
  }

  if (req.method !== "POST") return new Response(null, { status: 405, headers: cors });

  let corpo: any;
  try {
    corpo = await req.json();
  } catch {
    return rpcErro(null, -32700, "JSON inválido.");
  }

  const { id, method, params } = corpo ?? {};

  // Notificações não esperam resposta.
  if (typeof method === "string" && method.startsWith("notifications/")) {
    return new Response(null, { status: 202, headers: cors });
  }

  if (method === "initialize") {
    return resposta({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: params?.protocolVersion ?? PROTOCOLO_PADRAO,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "consultorio-nutri", version: "1.0.0" },
        instructions:
          "Ferramentas do consultório de nutrição. Os dados são do prontuário real de um " +
          "profissional de saúde: nunca invente valores, sempre consulte antes de responder e " +
          "confirme com o nutricionista antes de gravar qualquer alteração.",
      },
    });
  }

  if (method === "ping") return resposta({ jsonrpc: "2.0", id, result: {} });

  // Daqui para baixo exige token.
  const userId = await donoDoToken(req);
  if (!userId) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0", id: id ?? null,
        error: { code: -32001, message: "Token do conector ausente, inválido ou revogado. Gere um novo em Configurações → Conector do Claude." },
      }),
      {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json", "WWW-Authenticate": 'Bearer realm="consultorio"' },
      },
    );
  }

  if (method === "tools/list") {
    return resposta({ jsonrpc: "2.0", id, result: { tools: FERRAMENTAS } });
  }

  if (method === "tools/call") {
    const nome = params?.name;
    const args = params?.arguments ?? {};
    try {
      const resultado = await executar(nome, args, userId);
      return resposta({
        jsonrpc: "2.0", id,
        result: { content: [{ type: "text", text: JSON.stringify(resultado, null, 2) }] },
      });
    } catch (e) {
      // Erro de ferramenta volta como resultado com isError, não como erro de protocolo:
      // assim o modelo consegue ler a mensagem e corrigir a chamada.
      return resposta({
        jsonrpc: "2.0", id,
        result: { content: [{ type: "text", text: `Erro: ${(e as Error).message}` }], isError: true },
      });
    }
  }

  return rpcErro(id, -32601, `Método não suportado: ${method}`);
});
