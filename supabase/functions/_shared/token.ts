// =====================================================================
// App do Paciente — token de convite
//
// O token cru existe em dois lugares e em nenhum outro: na resposta que
// o nutricionista recebe uma única vez, e no link que ele envia. O banco
// guarda só o hash.
//
// Consequência aceita de propósito: link perdido não se recupera, gera-se
// outro. O contrário exigiria guardar o token em claro, e aí quem tivesse
// leitura na tabela poderia aceitar convite alheio.
// =====================================================================

/** 32 bytes aleatórios em base64url — 256 bits, sem caracteres que quebram URL. */
export function gerarToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** SHA-256 em hex. É o que vai para patient_invites.token_hash. */
export async function hashToken(token: string): Promise<string> {
  const dados = new TextEncoder().encode(token)
  const digest = await crypto.subtle.digest('SHA-256', dados)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
