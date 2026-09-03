/**
 * Conector do Claude (MCP): protocolo, ferramentas e — o mais importante —
 * a garantia de que o token de um nutricionista nunca alcança os dados de outro.
 *
 *   node tests/mcp.mjs
 */
import { createHash, randomBytes } from "node:crypto";

const API = "http://127.0.0.1:54321";
const MCP = `${API}/functions/v1/mcp`;
const SERVICE = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

let passou = 0, falhou = 0;
const ok = (n) => { passou++; console.log(`  ok    ${n}`); };
const nok = (n, d) => { falhou++; console.log(`  FALHA ${n}\n        ${d}`); };
const checar = (n, c, d = "") => (c ? ok(n) : nok(n, d));

const admin = (caminho, opcoes = {}) =>
  fetch(`${API}/rest/v1/${caminho}`, {
    ...opcoes,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", Prefer: "return=representation", ...(opcoes.headers ?? {}) },
  }).then((r) => r.json());

async function criarNutri(nome) {
  const email = `mcp.${nome}.${Date.now()}@teste.local`;
  const u = await fetch(`${API}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "senha-de-teste-123", email_confirm: true }),
  }).then((r) => r.json());

  // Mesmo formato que o app gera na tela de Configurações.
  const token = `nutri_${randomBytes(24).toString("hex")}`;
  const hash = createHash("sha256").update(token).digest("hex");
  await admin("mcp_tokens", {
    method: "POST",
    body: JSON.stringify({ user_id: u.id, nome: "Claude", token_hash: hash, prefixo: token.slice(0, 12) }),
  });
  return { id: u.id, token };
}

/** Chamada JSON-RPC ao servidor MCP. */
async function rpc(method, params, token, viaUrl = false) {
  const url = viaUrl && token ? `${MCP}/${token}` : MCP;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token && !viaUrl ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const texto = await r.text();
  return { status: r.status, corpo: texto ? JSON.parse(texto) : null };
}

const conteudo = (resposta) => {
  const t = resposta.corpo?.result?.content?.[0]?.text;
  try { return JSON.parse(t); } catch { return t; }
};

console.log("\n=== Conector do Claude (MCP) ===\n");

const a = await criarNutri("a");
const b = await criarNutri("b");

// Dados só do nutricionista A.
const pacienteA = await admin("patients", {
  method: "POST",
  body: JSON.stringify({ user_id: a.id, nome: "Paciente Secreta da A", plano_tipo: "premium", status: "ativo", plano_vencimento: "2099-01-01" }),
});
const PACIENTE_A = pacienteA[0].id;

// ---------- protocolo ----------
const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {} }, null);
checar("initialize responde sem exigir token", init.status === 200 && Boolean(init.corpo?.result?.serverInfo), JSON.stringify(init.corpo));
checar("initialize devolve a versão de protocolo pedida",
  init.corpo?.result?.protocolVersion === "2025-06-18", JSON.stringify(init.corpo?.result?.protocolVersion));

const ping = await rpc("ping", {}, null);
checar("ping responde", ping.status === 200 && ping.corpo?.result, JSON.stringify(ping.corpo));

const notif = await fetch(MCP, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
});
checar("notificação é aceita sem corpo de resposta", notif.status === 202, `status ${notif.status}`);

// ---------- autenticação ----------
const semToken = await rpc("tools/list", {}, null);
checar("sem token não lista ferramentas", semToken.status === 401, `status ${semToken.status}`);

const tokenFalso = await rpc("tools/list", {}, "nutri_naoexiste000000000000");
checar("token inválido é recusado", tokenFalso.status === 401, `status ${tokenFalso.status}`);

const porCabecalho = await rpc("tools/list", {}, a.token);
checar("token no cabeçalho Authorization funciona",
  Array.isArray(porCabecalho.corpo?.result?.tools), JSON.stringify(porCabecalho.corpo).slice(0, 160));

const porUrl = await rpc("tools/list", {}, a.token, true);
checar("token na URL funciona (conector do claude.ai)",
  Array.isArray(porUrl.corpo?.result?.tools), JSON.stringify(porUrl.corpo).slice(0, 160));

const ferramentas = porCabecalho.corpo.result.tools;
checar("todas as ferramentas têm nome, descrição e schema",
  ferramentas.every((f) => f.name && f.description && f.inputSchema?.type === "object"),
  JSON.stringify(ferramentas.map((f) => f.name)));

// ---------- ferramentas ----------
const listaA = await rpc("tools/call", { name: "listar_pacientes", arguments: {} }, a.token);
const dadosA = conteudo(listaA);
checar("A enxerga o próprio paciente pelo conector",
  dadosA?.pacientes?.some((p) => p.id === PACIENTE_A), JSON.stringify(dadosA).slice(0, 200));

const resumo = conteudo(await rpc("tools/call", { name: "resumo_do_consultorio", arguments: {} }, a.token));
checar("resumo do consultório conta o paciente premium",
  resumo?.pacientes_ativos_premium === 1, JSON.stringify(resumo));

const criada = conteudo(await rpc("tools/call", {
  name: "criar_tarefa",
  arguments: { titulo: "Ligar para a paciente", data: "2099-03-01", tipo: "contato" },
}, a.token));
checar("conector cria tarefa na agenda de A", criada?.id && criada?.user_id === a.id, JSON.stringify(criada).slice(0, 200));

const ficha = conteudo(await rpc("tools/call", {
  name: "historico_do_paciente", arguments: { patient_id: PACIENTE_A },
}, a.token));
checar("histórico consolidado retorna as seções esperadas",
  ficha?.paciente?.id === PACIENTE_A && Array.isArray(ficha?.exames) && Array.isArray(ficha?.raio_x_semanal),
  Object.keys(ficha ?? {}).join(", "));

// ---------- isolamento entre nutricionistas ----------
const listaB = await rpc("tools/call", { name: "listar_pacientes", arguments: {} }, b.token);
const dadosB = conteudo(listaB);
checar("B NÃO enxerga pacientes de A pelo conector",
  dadosB?.total === 0, JSON.stringify(dadosB).slice(0, 200));

const espiar = conteudo(await rpc("tools/call", {
  name: "obter_paciente", arguments: { patient_id: PACIENTE_A },
}, b.token));
checar("B NÃO abre a ficha de um paciente de A nem com o id",
  typeof espiar === "string" && espiar.includes("não encontrado"), JSON.stringify(espiar));

const escrever = conteudo(await rpc("tools/call", {
  name: "salvar_registro",
  arguments: { tabela: "patients", dados: { id: PACIENTE_A, nome: "INVADIDO POR B" } },
}, b.token));
const depois = await admin(`patients?id=eq.${PACIENTE_A}&select=nome`);
checar("B NÃO altera paciente de A pelo conector",
  depois[0]?.nome === "Paciente Secreta da A", `nome ficou: ${depois[0]?.nome} · resposta: ${JSON.stringify(escrever).slice(0, 120)}`);

const plantar = conteudo(await rpc("tools/call", {
  name: "salvar_registro",
  arguments: { tabela: "patients", dados: { user_id: a.id, nome: "Plantado por B" } },
}, b.token));
const dePlantado = await admin(`patients?user_id=eq.${a.id}&select=nome`);
checar("B NÃO consegue criar registro em nome de A",
  !dePlantado.some((p) => p.nome === "Plantado por B"), JSON.stringify(dePlantado.map((p) => p.nome)));

const consultaCruzada = conteudo(await rpc("tools/call", {
  name: "consultar_tabela",
  arguments: { tabela: "patients", filtros: { user_id: a.id } },
}, b.token));
// B pode ter registros próprios; o que não pode é vir qualquer linha de A.
checar("filtro por user_id de outro nutricionista é ignorado",
  (consultaCruzada?.registros ?? []).every((r) => r.user_id === b.id),
  JSON.stringify((consultaCruzada?.registros ?? []).map((r) => r.user_id)));

// ---------- superfície ----------
const tabelaProibida = conteudo(await rpc("tools/call", {
  name: "consultar_tabela", arguments: { tabela: "mcp_tokens" },
}, b.token));
checar("tabela de tokens não é acessível pelo conector",
  typeof tabelaProibida === "string" && tabelaProibida.includes("não permitida"), JSON.stringify(tabelaProibida));

const roles = conteudo(await rpc("tools/call", {
  name: "consultar_tabela", arguments: { tabela: "user_roles" },
}, b.token));
checar("tabela de papéis não é acessível pelo conector",
  typeof roles === "string" && roles.includes("não permitida"), JSON.stringify(roles));

const inexistente = await rpc("tools/call", { name: "fazer_qualquer_coisa", arguments: {} }, a.token);
checar("ferramenta inexistente devolve erro tratado",
  inexistente.corpo?.result?.isError === true, JSON.stringify(inexistente.corpo).slice(0, 160));

// ---------- revogação ----------
await admin(`mcp_tokens?user_id=eq.${a.id}`, { method: "PATCH", body: JSON.stringify({ revogado: true }) });
const revogado = await rpc("tools/list", {}, a.token);
checar("token revogado para de funcionar na hora", revogado.status === 401, `status ${revogado.status}`);

const uso = await admin(`mcp_tokens?user_id=eq.${b.id}&select=ultimo_uso`);
checar("último uso é registrado no token", Boolean(uso[0]?.ultimo_uso), JSON.stringify(uso));

console.log(`\n${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou ? 1 : 0);
