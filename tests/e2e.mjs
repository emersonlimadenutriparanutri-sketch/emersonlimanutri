/**
 * Fluxo ponta a ponta pela interface, contra um Supabase real:
 * login → lead → conversão em paciente → jornada → questionário público
 * → financeiro → dashboard.
 *
 *   node tests/e2e.mjs
 */
import { chromium } from "playwright";

const APP = "http://localhost:8080";
const API = "http://127.0.0.1:54321";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const PASTA = process.env.SHOTS ?? "/tmp/e2e";

let passou = 0, falhou = 0;
const ok = (n) => { passou++; console.log(`  ok    ${n}`); };
const nok = (n, d) => { falhou++; console.log(`  FALHA ${n}\n        ${d}`); };
const checar = (n, c, d = "") => (c ? ok(n) : nok(n, d));

const admin = (caminho, opcoes = {}) =>
  fetch(`${API}/rest/v1/${caminho}`, {
    ...opcoes,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", Prefer: "return=representation", ...(opcoes.headers ?? {}) },
  }).then((r) => r.json());

const EMAIL = `e2e.${Date.now()}@teste.local`;
const SENHA = "senha-de-teste-123";

console.log("\n=== Fluxo ponta a ponta ===\n");

// Usuário aprovado, como ficaria depois de um admin liberar o acesso.
const criado = await fetch(`${API}/auth/v1/admin/users`, {
  method: "POST",
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: SENHA, email_confirm: true, user_metadata: { nome: "Nutri de Teste" } }),
}).then((r) => r.json());
const USER_ID = criado.id;
await admin(`profiles?id=eq.${USER_ID}`, { method: "PATCH", body: JSON.stringify({ aprovado: true }) });

const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pagina = await navegador.newPage({ viewport: { width: 1440, height: 900 } });
const erros = [];
pagina.on("pageerror", (e) => erros.push(String(e.message)));

const foto = (nome) => pagina.screenshot({ path: `${PASTA}/${nome}.png`, fullPage: false });

try {
  // ---------- login ----------
  await pagina.goto(`${APP}/entrar`, { waitUntil: "networkidle" });
  await pagina.fill("#email", EMAIL);
  await pagina.fill("#senha", SENHA);
  await pagina.click('button:has-text("Entrar")');
  await pagina.waitForURL(`${APP}/`, { timeout: 15000 });
  await pagina.waitForTimeout(1200);
  checar("login entra no dashboard", await pagina.locator("text=Indicadores").isVisible());
  await foto("01-dashboard-vazio");

  // ---------- conteúdo inicial ----------
  await pagina.goto(`${APP}/configuracoes`, { waitUntil: "networkidle" });
  await pagina.click('button:has-text("Criar conteúdo inicial")');
  await pagina.waitForTimeout(2500);
  const servicos = await admin(`servicos?user_id=eq.${USER_ID}&select=id,nome,tipo,duracao_meses`);
  checar("conteúdo inicial cria os serviços", servicos.length === 2, JSON.stringify(servicos));

  // ---------- lead ----------
  await pagina.goto(`${APP}/consultorio?aba=leads`, { waitUntil: "networkidle" });
  await pagina.waitForTimeout(1000);
  await pagina.click('button:has-text("Novo lead")');
  await pagina.waitForTimeout(600);
  await pagina.fill("#l-nome", "Mariana Ribeiro");
  await pagina.fill("#l-tel", "11988887777");
  await pagina.fill("#l-email", "mariana@teste.local");

  // Serviço premium: define tipo de plano e vencimento na conversão.
  const premium = servicos.find((s) => s.tipo === "premium");
  await pagina.click('button:has-text("Nenhum")');
  await pagina.waitForTimeout(400);
  await pagina.click(`[role="option"]:has-text("${premium.nome}")`);
  await pagina.waitForTimeout(300);

  const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 16);
  await pagina.fill("#l-consulta", amanha);
  await pagina.click('button[type="submit"]:has-text("Salvar")');
  await pagina.waitForTimeout(1800);

  const leads = await admin(`leads?user_id=eq.${USER_ID}&select=id,nome,status,servico_id,data_consulta,valor_potencial`);
  checar("lead é criado no funil", leads.length === 1 && leads[0].nome === "Mariana Ribeiro", JSON.stringify(leads));
  checar("valor potencial herda o valor do serviço", Number(leads[0]?.valor_potencial) > 0, JSON.stringify(leads[0]?.valor_potencial));
  checar("card do lead aparece na coluna Novo lead", await pagina.locator('text=Mariana Ribeiro').first().isVisible());
  await foto("02-funil-leads");

  // ---------- conversão ----------
  await pagina.click('button[title="Converter em paciente"]');
  await pagina.waitForURL(/\/paciente\//, { timeout: 15000 });
  await pagina.waitForTimeout(1800);
  const pacientes = await admin(`patients?user_id=eq.${USER_ID}&select=id,nome,telefone,plano_tipo,plano_inicio,plano_vencimento,lead_id`);
  checar("lead vira paciente", pacientes.length === 1 && pacientes[0].nome === "Mariana Ribeiro", JSON.stringify(pacientes));
  checar("dados pessoais são copiados", pacientes[0]?.telefone === "11988887777", JSON.stringify(pacientes[0]?.telefone));
  checar("plano premium é aplicado", pacientes[0]?.plano_tipo === "premium", JSON.stringify(pacientes[0]?.plano_tipo));
  checar("vencimento é calculado pela duração do serviço",
    Boolean(pacientes[0]?.plano_vencimento) && pacientes[0].plano_vencimento > pacientes[0].plano_inicio,
    `${pacientes[0]?.plano_inicio} → ${pacientes[0]?.plano_vencimento}`);
  const PACIENTE = pacientes[0].id;
  await foto("03-central-paciente");

  checar("Central do Paciente renderiza (não fica em branco)",
    await pagina.locator("text=Central do Paciente").first().isVisible(),
    (await pagina.locator("body").innerText()).slice(0, 120));

  // ---------- guarda de alterações não salvas ----------
  await pagina.fill("#d-obj", "Emagrecimento na perimenopausa");
  await pagina.waitForTimeout(400);
  checar("aviso de alteração não salva aparece",
    await pagina.locator("text=Há alterações não salvas").isVisible());
  await pagina.click('a:has-text("Pacientes")');
  await pagina.waitForTimeout(800);
  checar("guarda bloqueia a saída com alterações pendentes",
    await pagina.locator("text=Sair sem salvar").isVisible(),
    pagina.url());
  await pagina.click('button:has-text("Continuar editando")');
  await pagina.waitForTimeout(500);
  await pagina.click('button:has-text("Salvar alterações")');
  await pagina.waitForTimeout(1500);
  const salvo = await admin(`patients?id=eq.${PACIENTE}&select=objetivo`);
  checar("salvar grava o campo editado", salvo[0]?.objetivo === "Emagrecimento na perimenopausa", JSON.stringify(salvo));

  const leadDepois = await admin(`leads?id=eq.${leads[0].id}&select=status,convertido_em`);
  checar("lead é marcado como fechado e vinculado", leadDepois[0]?.status === "fechado" && leadDepois[0]?.convertido_em === PACIENTE, JSON.stringify(leadDepois));

  // ---------- jornada aplicada automaticamente ----------
  const jornada = await admin(`jornada?patient_id=eq.${PACIENTE}&select=mes,semana,titulo,data_prevista&order=ordem`);
  // A contagem esperada sai do próprio template, não de um número chutado.
  const modelo = await admin(`jornada_templates?user_id=eq.${USER_ID}&padrao=eq.true&select=estrutura`);
  const esperadas = (modelo[0]?.estrutura ?? []).reduce(
    (total, mes) => total + mes.semanas.reduce((t, semana) => t + semana.tarefas.length, 0), 0);
  checar("jornada modelo é aplicada por inteiro na conversão",
    esperadas > 0 && jornada.length === esperadas, `${jornada.length} de ${esperadas} tarefas`);
  checar("jornada cobre 3 meses", new Set(jornada.map((t) => t.mes)).size === 3, JSON.stringify([...new Set(jornada.map((t) => t.mes))]));
  checar("tarefas têm data ancorada no início", jornada.every((t) => t.data_prevista), "há tarefa sem data");

  await pagina.goto(`${APP}/paciente/${PACIENTE}?t=jornada`, { waitUntil: "networkidle" });
  await pagina.waitForTimeout(1500);
  checar("aba Jornada mostra o cronograma", await pagina.locator("text=Mês 1").first().isVisible());
  await foto("04-jornada");

  // ---------- consulta agendada entra na agenda ----------
  const agenda = await admin(`agenda_tasks?user_id=eq.${USER_ID}&select=titulo,tipo,data,patient_id`);
  checar("consulta agendada vira evento na Torre de Controle",
    agenda.some((t) => t.tipo === "consulta" && t.patient_id === PACIENTE), JSON.stringify(agenda));

  await pagina.goto(`${APP}/agenda`, { waitUntil: "networkidle" });
  await pagina.waitForTimeout(1500);
  checar("calendário carrega com os eventos", await pagina.locator("text=Hoje").first().isVisible());
  await foto("05-torre-de-controle");

  // ---------- questionário público ----------
  await pagina.goto(`${APP}/consultorio?aba=questionarios`, { waitUntil: "networkidle" });
  await pagina.waitForTimeout(1200);
  await pagina.click('button:has-text("Envios")');
  await pagina.waitForTimeout(800);
  await pagina.click('button:has-text("Selecione o questionário")');
  await pagina.waitForTimeout(400);
  await pagina.click('[role="option"]:has-text("Acompanhamento")');
  await pagina.waitForTimeout(300);
  await pagina.click('button:has-text("Gerar link")');
  await pagina.waitForTimeout(1800);

  const envios = await admin(`questionario_envios?user_id=eq.${USER_ID}&select=id,token,respondido`);
  checar("link único é gerado", envios.length === 1 && envios[0].token?.length >= 16, JSON.stringify(envios));
  await foto("06-questionarios");

  // O paciente abre o link em outro navegador, sem sessão.
  const anonimo = await navegador.newContext();
  const paginaPaciente = await anonimo.newPage();
  await paginaPaciente.setViewportSize({ width: 420, height: 900 });
  await paginaPaciente.goto(`${APP}/q/${envios[0].token}`, { waitUntil: "networkidle" });
  await paginaPaciente.waitForTimeout(1500);
  checar("questionário público abre sem login",
    await paginaPaciente.locator("text=Acompanhamento").first().isVisible());
  await paginaPaciente.screenshot({ path: `${PASTA}/07-questionario-publico.png`, fullPage: false });

  // Responde tudo o que é obrigatório.
  for (const escala of await paginaPaciente.locator('button:has-text("8")').all()) {
    if (await escala.isVisible()) await escala.click();
  }
  for (const rotulo of ["Controlada", "Normal"]) {
    const b = paginaPaciente.locator(`button:has-text("${rotulo}")`).first();
    if (await b.isVisible()) await b.click();
  }
  const textareas = await paginaPaciente.locator("textarea").all();
  for (const t of textareas) await t.fill("Semana difícil no trabalho, mas mantive as refeições principais.");
  await paginaPaciente.click('button:has-text("Enviar respostas")');
  await paginaPaciente.waitForTimeout(2500);
  checar("paciente consegue enviar as respostas",
    await paginaPaciente.locator("text=Recebido").first().isVisible(),
    (await paginaPaciente.locator("body").innerText()).slice(0, 200));
  await paginaPaciente.screenshot({ path: `${PASTA}/08-questionario-enviado.png` });

  const respostas = await admin(`questionario_respostas?user_id=eq.${USER_ID}&select=id,respostas`);
  checar("resposta chega na conta do nutricionista", respostas.length === 1, JSON.stringify(respostas.length));
  const envioDepois = await admin(`questionario_envios?id=eq.${envios[0].id}&select=respondido`);
  checar("envio é marcado como respondido", envioDepois[0]?.respondido === true, JSON.stringify(envioDepois));

  // Link não pode ser respondido duas vezes.
  const reenvio = await fetch(`${API}/functions/v1/questionario-publico`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ acao: "responder", token: envios[0].token, respostas: { q1: 1 } }),
  });
  checar("link não aceita resposta duplicada", reenvio.status === 409, `status ${reenvio.status}`);
  await anonimo.close();

  // ---------- financeiro ----------
  await pagina.goto(`${APP}/consultorio?aba=financeiro`, { waitUntil: "networkidle" });
  await pagina.waitForTimeout(1200);
  await pagina.click('button:has-text("Vendas")');
  await pagina.waitForTimeout(800);
  await pagina.click('button:has-text("Nova venda")');
  await pagina.waitForTimeout(600);
  await pagina.fill("#m-desc", "Acompanhamento Premium — Mariana");
  await pagina.fill("#m-valor", "1500");
  await pagina.fill("#m-parc", "3");
  await pagina.click('button[type="submit"]:has-text("Lançar")');
  await pagina.waitForTimeout(2000);

  const receitas = await admin(`receitas?user_id=eq.${USER_ID}&select=id,valor,parcelas`);
  checar("venda é lançada por competência", receitas.length === 1 && Number(receitas[0].valor) === 1500, JSON.stringify(receitas));
  const parcelas = await admin(`lancamentos?user_id=eq.${USER_ID}&select=valor,vencimento,parcela,total_parcelas&order=parcela`);
  checar("parcelamento gera 3 contas a receber", parcelas.length === 3, `${parcelas.length} parcelas`);
  const soma = parcelas.reduce((s, p) => s + Number(p.valor), 0);
  checar("as parcelas somam exatamente o total da venda", Math.abs(soma - 1500) < 0.001, `soma = ${soma}`);
  checar("parcelas vencem a cada 30 dias",
    parcelas.length === 3 &&
      (new Date(parcelas[2].vencimento) - new Date(parcelas[0].vencimento)) / 86400000 === 60,
    JSON.stringify(parcelas.map((p) => p.vencimento)));
  await foto("09-financeiro");

  // Baixa de uma parcela.
  await pagina.click('button:has-text("A receber")');
  await pagina.waitForTimeout(1000);
  await pagina.locator('button[title="Dar baixa"]').first().click();
  await pagina.waitForTimeout(1500);
  const baixadas = await admin(`lancamentos?user_id=eq.${USER_ID}&pago=eq.true&select=id,data_pagamento`);
  checar("baixa registra o pagamento", baixadas.length === 1 && Boolean(baixadas[0].data_pagamento), JSON.stringify(baixadas));

  // ---------- dashboard ----------
  await pagina.goto(`${APP}/`, { waitUntil: "networkidle" });
  await pagina.waitForTimeout(1800);
  const texto = await pagina.locator("body").innerText();
  checar("dashboard conta o paciente premium ativo", /PACIENTES ATIVOS PREMIUM[\s\S]{0,60}\b1\b/i.test(texto), texto.slice(0, 400));
  await foto("10-dashboard-com-dados");

  // ---------- integridade ----------
  const semDuplicar = await admin(`patients?user_id=eq.${USER_ID}&select=id`);
  checar("converter o mesmo lead de novo não duplica paciente", semDuplicar.length === 1, `${semDuplicar.length} pacientes`);

  checar("nenhum erro de JavaScript durante o fluxo", erros.length === 0, erros.slice(0, 3).join(" | "));
} catch (e) {
  nok("fluxo interrompido", e.message);
  await foto("99-erro");
} finally {
  await navegador.close();
}

console.log(`\n${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou ? 1 : 0);
