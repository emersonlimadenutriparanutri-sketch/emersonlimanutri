import { supabase } from './supabase'

const CHAVE = 'app-paciente-convite-pendente'

/**
 * O vínculo do convite só pode ser feito com o usuário já autenticado.
 * Quando o projeto exige confirmação de e-mail, o cadastro não abre sessão
 * na hora — então guardamos o token e resgatamos no primeiro login.
 */
export function guardarConvitePendente(token: string) {
  try {
    localStorage.setItem(CHAVE, token)
  } catch {
    // Navegador sem storage: o vínculo terá de ser refeito pelo link do convite.
  }
}

export function convitePendente(): string | null {
  try {
    return localStorage.getItem(CHAVE)
  } catch {
    return null
  }
}

export function limparConvitePendente() {
  try {
    localStorage.removeItem(CHAVE)
  } catch {
    // nada a fazer
  }
}

/** Vincula o login atual ao paciente do convite. Devolve o patient_id. */
export async function aceitarConvite(token: string): Promise<string> {
  const { data, error } = await supabase.rpc('aceitar_convite', { p_token: token })
  if (error) throw new Error(error.message)
  limparConvitePendente()
  return data as string
}

/** Chamado depois de qualquer login: resgata um convite que ficou pendente. */
export async function resgatarConvitePendente(): Promise<boolean> {
  const token = convitePendente()
  if (!token) return false
  try {
    await aceitarConvite(token)
    return true
  } catch {
    // Convite expirado, revogado ou já usado — segue o login normalmente.
    limparConvitePendente()
    return false
  }
}
