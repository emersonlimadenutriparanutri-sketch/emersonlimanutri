// =====================================================================
// App do Paciente — CORS
//
// O app do paciente é um projeto Lovable separado, em outro domínio,
// falando com este backend. Sem estes cabeçalhos o navegador recusa a
// resposta antes mesmo de o código dela ser lido.
//
// POR QUE '*' AQUI É SEGURO
// CORS protege contra um site malicioso usar a sessão da vítima. Isso
// vale quando a credencial viaja em COOKIE, que o navegador anexa
// sozinho a toda requisição. Não é o caso aqui: a autenticação vai no
// cabeçalho Authorization, montado pelo código do app a partir do
// localStorage do próprio domínio. Um site de terceiros não tem como
// obtê-lo, então não consegue forjar chamada autenticada — com ou sem
// lista de origens.
//
// E a patient-accept-invite é pública por natureza: quem quisesse
// chamá-la faria do próprio servidor, onde CORS nem se aplica.
//
// Quem protege estas funções de verdade:
//   patient-invite         getUser() + conferência de dono do paciente
//   patient-accept-invite  token de 256 bits, por hash, com prazo e uso único
//
// Uma versão anterior mantinha allowlist por secret. Foi removida: ela
// custava depuração real — falha de origem aparece como erro de CORS
// num endpoint corretamente configurado — em troca de proteção que a
// autenticação por cabeçalho já dá.
//
// ATENÇÃO se um dia algo aqui passar a usar cookie de sessão: aí '*'
// deixa de servir e a allowlist volta a ser necessária.
// =====================================================================

export const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function corsHeaders(_req: Request): Record<string, string> {
  return CORS
}

export function respostaPreflight(_req: Request): Response {
  return new Response(null, { status: 204, headers: CORS })
}

export function json(_req: Request, corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
