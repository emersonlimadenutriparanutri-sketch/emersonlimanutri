/**
 * Teste de isolamento (RLS): dois nutricionistas no mesmo banco não podem,
 * em hipótese alguma, enxergar ou alterar os dados um do outro.
 * Roda contra o Supabase local: node tests/rls.mjs
 */
const API = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

let passou = 0, falhou = 0;
const ok = (nome) => { passou++; console.log(`  ok   ${nome}`); };
const nok = (nome, detalhe) => { falhou++; console.log(`  FALHA ${nome}\n        ${detalhe}`); };
const checar = (nome, condicao, detalhe = "") => (condicao ? ok(nome) : nok(nome, detalhe));

async function criarUsuario(email, senha) {
  const r = await fetch(`${API}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: senha, email_confirm: true, user_metadata: { nome: email.split("@")[0] } }),
  });
  const corpo = await r.json();
  if (!r.ok) throw new Error(`criar usuário ${email}: ${JSON.stringify(corpo)}`);
  return corpo.id;
}

async function entrar(email, senha) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: senha }),
  });
  const corpo = await r.json();
  if (!r.ok) throw new Error(`login ${email}: ${JSON.stringify(corpo)}`);
  return corpo.access_token;
}

/** Chamada ao PostgREST como um usuário autenticado (RLS ativa). */
async function api(token, caminho, opcoes = {}) {
  const r = await fetch(`${API}/rest/v1/${caminho}`, {
    ...opcoes,
    headers: {
      apikey: ANON, Authorization: `Bearer ${token}`,
      "Content-Type": "application/json", Prefer: "return=representation",
      ...(opcoes.headers ?? {}),
    },
  });
  const texto = await r.text();
  let corpo = null;
  try { corpo = texto ? JSON.parse(texto) : null; } catch { corpo = texto; }
  return { status: r.status, corpo };
}

const sufixo = Date.now();
const emailA = `nutri.a.${sufixo}@teste.local`;
const emailB = `nutri.b.${sufixo}@teste.local`;
const SENHA = "senha-de-teste-123";

console.log("\n=== Isolamento entre nutricionistas (RLS) ===\n");

const idA = await criarUsuario(emailA, SENHA);
const idB = await criarUsuario(emailB, SENHA);

// --- trigger de cadastro ---
const perfis = await fetch(`${API}/rest/v1/profiles?id=in.(${idA},${idB})&select=id,email,aprovado`, {
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
}).then((r) => r.json());
checar("trigger cria perfil para cada cadastro", perfis.length === 2, `perfis criados: ${perfis.length}`);

const papeis = await fetch(`${API}/rest/v1/user_roles?user_id=in.(${idA},${idB})&select=user_id,role`, {
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
}).then((r) => r.json());
checar("trigger atribui papel a cada cadastro", papeis.length === 2, JSON.stringify(papeis));

// Aprova os dois para poderem usar o app.
await fetch(`${API}/rest/v1/profiles?id=in.(${idA},${idB})`, {
  method: "PATCH",
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
  body: JSON.stringify({ aprovado: true }),
});

const tokenA = await entrar(emailA, SENHA);
const tokenB = await entrar(emailB, SENHA);

// --- dados do nutricionista A ---
const criado = await api(tokenA, "patients", {
  method: "POST",
  body: JSON.stringify({ user_id: idA, nome: "Paciente da Nutri A", plano_tipo: "premium", status: "ativo" }),
});
checar("A consegue criar o próprio paciente", criado.status === 201, JSON.stringify(criado.corpo));
const pacienteA = criado.corpo?.[0]?.id;

const listaA = await api(tokenA, "patients?select=id,nome");
checar("A enxerga o próprio paciente", listaA.corpo?.some((p) => p.id === pacienteA), JSON.stringify(listaA.corpo));

// --- tentativas do nutricionista B ---
const listaB = await api(tokenB, "patients?select=id,nome");
checar("B NÃO enxerga o paciente de A", Array.isArray(listaB.corpo) && listaB.corpo.length === 0,
  `B recebeu ${JSON.stringify(listaB.corpo)}`);

const leituraDireta = await api(tokenB, `patients?id=eq.${pacienteA}&select=*`);
checar("B NÃO lê o paciente de A nem sabendo o id",
  Array.isArray(leituraDireta.corpo) && leituraDireta.corpo.length === 0,
  JSON.stringify(leituraDireta.corpo));

const updateCruzado = await api(tokenB, `patients?id=eq.${pacienteA}`, {
  method: "PATCH", body: JSON.stringify({ nome: "INVADIDO" }),
});
checar("B NÃO altera o paciente de A",
  Array.isArray(updateCruzado.corpo) && updateCruzado.corpo.length === 0,
  `status ${updateCruzado.status}: ${JSON.stringify(updateCruzado.corpo)}`);

const deleteCruzado = await api(tokenB, `patients?id=eq.${pacienteA}`, { method: "DELETE" });
const aindaExiste = await api(tokenA, `patients?id=eq.${pacienteA}&select=id,nome`);
checar("B NÃO apaga o paciente de A", aindaExiste.corpo?.[0]?.nome === "Paciente da Nutri A",
  `status ${deleteCruzado.status}; depois: ${JSON.stringify(aindaExiste.corpo)}`);

const insertFalsificado = await api(tokenB, "patients", {
  method: "POST",
  body: JSON.stringify({ user_id: idA, nome: "Plantado por B" }),
});
checar("B NÃO cria registro em nome de A", insertFalsificado.status === 403 || insertFalsificado.status === 401,
  `status ${insertFalsificado.status}: ${JSON.stringify(insertFalsificado.corpo)}`);

// --- escalada de privilégio ---
const virarAdmin = await api(tokenB, "user_roles", {
  method: "POST", body: JSON.stringify({ user_id: idB, role: "admin" }),
});
checar("B NÃO consegue se promover a admin", virarAdmin.status === 403 || virarAdmin.status === 401,
  `status ${virarAdmin.status}: ${JSON.stringify(virarAdmin.corpo)}`);

const perfisPorB = await api(tokenB, "profiles?select=id,email");
checar("B só enxerga o próprio perfil",
  Array.isArray(perfisPorB.corpo) && perfisPorB.corpo.length === 1 && perfisPorB.corpo[0].id === idB,
  JSON.stringify(perfisPorB.corpo));

// --- anônimo ---
const anonimo = await fetch(`${API}/rest/v1/patients?select=*`, { headers: { apikey: ANON } });
const corpoAnonimo = await anonimo.json();
checar("Visitante sem login não lê pacientes",
  Array.isArray(corpoAnonimo) ? corpoAnonimo.length === 0 : true,
  JSON.stringify(corpoAnonimo));

// --- conteúdo inicial (seed) ---
const seed = await fetch(`${API}/rest/v1/rpc/seed_dados_iniciais`, {
  method: "POST",
  headers: { apikey: ANON, Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
  body: "{}",
});
checar("Conteúdo inicial roda para o usuário logado", seed.ok, `status ${seed.status}: ${await seed.text()}`);

const modelos = await api(tokenA, "questionario_modelos?select=titulo");
checar("Seed cria os 4 questionários padrão", modelos.corpo?.length === 4, JSON.stringify(modelos.corpo?.map?.((m) => m.titulo)));

const template = await api(tokenA, "jornada_templates?select=nome,estrutura");
checar("Seed cria a jornada modelo de 3 meses", template.corpo?.[0]?.estrutura?.length === 3,
  JSON.stringify(template.corpo?.[0]?.nome));

const contas = await api(tokenA, "plano_contas?select=codigo,parent_id");
const comPai = contas.corpo?.filter?.((c) => c.parent_id) ?? [];
checar("Seed monta o plano de contas hierárquico", contas.corpo?.length === 12 && comPai.length === 10,
  `${contas.corpo?.length} contas, ${comPai.length} com pai`);

// Rodar duas vezes não pode duplicar nada.
await fetch(`${API}/rest/v1/rpc/seed_dados_iniciais`, {
  method: "POST",
  headers: { apikey: ANON, Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
  body: "{}",
});
const modelosDepois = await api(tokenA, "questionario_modelos?select=id");
checar("Rodar o seed de novo não duplica dados", modelosDepois.corpo?.length === 4,
  `${modelosDepois.corpo?.length} modelos`);

// --- seed do B é independente ---
const modelosB = await api(tokenB, "questionario_modelos?select=id");
checar("O seed de A não vaza para B", modelosB.corpo?.length === 0, JSON.stringify(modelosB.corpo));

console.log(`\n${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou ? 1 : 0);
