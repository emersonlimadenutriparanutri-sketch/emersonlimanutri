// =====================================================================
// App do Paciente — CORS
//
// O app do paciente é um projeto Lovable separado, em outro domínio,
// falando com este backend. Sem estes cabeçalhos o navegador recusa a
// resposta antes mesmo de o código dela ser lido.
//
// A lista de origens permitidas vem do secret PATIENT_APP_ORIGINS
// (separadas por vírgula). Origem não listada não recebe cabeçalho de
// permissão, e o navegador bloqueia — que é o comportamento desejado.
//
// Deliberadamente não se usa '*': estas funções criam contas e vínculos,
// e liberar qualquer origem convida qualquer site a chamá-las.
// =====================================================================

const origensPermitidas = (Deno.env.get('PATIENT_APP_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

export function corsHeaders(req: Request): Record<string, string> {
  const origem = req.headers.get('origin') ?? ''
  const liberada = origensPermitidas.includes(origem)

  return {
    ...(liberada ? { 'Access-Control-Allow-Origin': origem } : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

export function respostaPreflight(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req) })
}

export function json(req: Request, corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}
