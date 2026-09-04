/**
 * Botão "Criar demonstração" em Configurações.
 * A função roda como o usuário logado, então só o app consegue chamá-la —
 * este teste garante que o caminho pela interface funciona de ponta a ponta.
 *
 *   node tests/demo.mjs
 */
import { chromium } from "playwright";

const APP = "http://localhost:8080";
const API = "http://127.0.0.1:54321";
const SERVICE = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

let passou = 0, falhou = 0;
const checar = (n, c, d = "") => (c ? (passou++, console.log(`  ok    ${n}`)) : (falhou++, console.log(`  FALHA ${n}\n        ${d}`)));
const admin = (caminho) =>
  fetch(`${API}/rest/v1/${caminho}`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } }).then((r) => r.json());

const email = `demo.${Date.now()}@teste.local`, senha = "senha-de-teste-123";
const u = await fetch(`${API}/auth/v1/admin/users`, { method: "POST",
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: senha, email_confirm: true, user_metadata: { nome: "Nutri Demo" } }) }).then((r) => r.json());
await fetch(`${API}/rest/v1/profiles?id=eq.${u.id}`, { method: "PATCH",
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
  body: JSON.stringify({ aprovado: true }) });

console.log("\n=== Consultório de demonstração ===\n");

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const erros = [];
p.on("pageerror", (e) => erros.push(e.message));

try {
  await p.goto(`${APP}/entrar`, { waitUntil: "networkidle" });
  await p.fill("#email", email); await p.fill("#senha", senha);
  await p.click('button:has-text("Entrar")');
  await p.waitForURL(`${APP}/`, { timeout: 20000 });

  // Um registro que o usuário "cadastrou" antes: a limpeza não pode tocá-lo.
  await fetch(`${API}/rest/v1/patients`, { method: "POST",
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: u.id, nome: "Paciente de verdade", status: "ativo" }) });

  await p.goto(`${APP}/configuracoes`, { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  checar("a seção de demonstração aparece nas Configurações",
    await p.locator("text=Consultório de demonstração").isVisible());

  await p.click('button:has-text("Criar demonstração")');
  await p.waitForTimeout(600);
  checar("pede confirmação antes de criar", await p.locator("text=Serão criados pacientes").isVisible());
  await p.locator('button:has-text("Criar demonstração")').last().click();
  await p.waitForTimeout(6000);

  const pacientes = await admin(`patients?user_id=eq.${u.id}&select=nome,origem`);
  const doDemo = pacientes.filter((x) => x.origem === "Demonstração");
  checar("cria os 11 pacientes fictícios", doDemo.length === 11, `${doDemo.length} pacientes`);
  checar("não mexe em quem já estava lá",
    pacientes.some((x) => x.nome === "Paciente de verdade"), JSON.stringify(pacientes.map((x) => x.nome)));

  const leads = await admin(`leads?user_id=eq.${u.id}&select=id`);
  const avaliacoes = await admin(`avaliacoes_fisicas?user_id=eq.${u.id}&select=id`);
  const jornada = await admin(`jornada?user_id=eq.${u.id}&select=id`);
  checar("cria o funil de leads", leads.length === 10, `${leads.length} leads`);
  checar("cria três meses de avaliações", avaliacoes.length === 44, `${avaliacoes.length} avaliações`);
  checar("cria a jornada de cada paciente", jornada.length === 132, `${jornada.length} tarefas`);

  // Rodar de novo não pode duplicar.
  await p.click('button:has-text("Criar demonstração")');
  await p.waitForTimeout(600);
  await p.locator('button:has-text("Criar demonstração")').last().click();
  await p.waitForTimeout(7000);
  const depois = await admin(`patients?user_id=eq.${u.id}&origem=eq.Demonstração&select=id`);
  checar("rodar de novo substitui em vez de duplicar", depois.length === 11, `${depois.length} pacientes`);

  await p.click('button:has-text("Remover dados de demonstração")');
  await p.waitForTimeout(600);
  await p.locator('button:has-text("Remover")').last().click();
  await p.waitForTimeout(4000);

  const restantes = await admin(`patients?user_id=eq.${u.id}&select=nome,origem`);
  checar("a limpeza remove tudo da demonstração",
    restantes.filter((x) => x.origem === "Demonstração").length === 0, JSON.stringify(restantes.map((x) => x.nome)));
  checar("a limpeza preserva o paciente de verdade",
    restantes.some((x) => x.nome === "Paciente de verdade"), JSON.stringify(restantes.map((x) => x.nome)));

  checar("nenhum erro de JavaScript", erros.length === 0, erros.slice(0, 2).join(" | "));
} catch (e) {
  falhou++; console.log("  FALHA fluxo interrompido\n        " + e.message);
} finally {
  await b.close();
}

console.log(`\n${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou ? 1 : 0);
