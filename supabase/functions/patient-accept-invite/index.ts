// =====================================================================
// App do Paciente — patient-accept-invite
//
// O paciente abre o link, escolhe e-mail e senha, e esta função cria a
// conta dele e o vínculo com o prontuário.
//
// Roda SEM autenticação — o paciente ainda não tem conta. Quem autoriza
// é o token do convite, e por isso ele é a única coisa entre um
// desconhecido e uma conta ligada a um prontuário. Daí o cuidado:
// token conferido por hash, prazo verificado, uso único.
//
// POST { token, email, senha, nome?, consentimento_versao }
//   200 { ok: true }
//   400 dados faltando ou senha curta
//   401 token inválido, expirado ou já usado
//   409 e-mail já cadastrado  (código: email_em_uso)
//
// IMPORTANTE — verificação de e-mail
// A conta é criada com o e-mail já confirmado, para o paciente entrar
// direto sem depender de servidor de e-mail configurado. O custo é que o
// e-mail não é verificado, e é para ele que vai a recuperação de senha.
// Aceitável no piloto; antes de abrir para assinantes, vale exigir
// confirmação.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { respostaPreflight, json } from '../_shared/cors.ts'
import { hashToken } from '../_shared/token.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const SENHA_MINIMA = 8

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return respostaPreflight(req)
  if (req.method !== 'POST') return json(req, { erro: 'metodo_nao_permitido' }, 405)

  let corpo: {
    token?: string
    email?: string
    senha?: string
    nome?: string
    consentimento_versao?: string
  }
  try {
    corpo = await req.json()
  } catch {
    return json(req, { erro: 'corpo_invalido' }, 400)
  }

  const { token, email, senha, nome, consentimento_versao } = corpo

  if (!token || !email || !senha) return json(req, { erro: 'dados_incompletos' }, 400)
  if (senha.length < SENHA_MINIMA) return json(req, { erro: 'senha_curta' }, 400)
  if (!consentimento_versao) return json(req, { erro: 'consentimento_obrigatorio' }, 400)

  const servico = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  })

  // ---------------------------------------------------------------
  // O convite
  //
  // Busca pelo hash: o token cru nunca esteve no banco. Prazo e status
  // entram na própria consulta, então convite expirado ou já usado
  // simplesmente não aparece.
  //
  // A resposta é a mesma para "não existe", "expirou" e "já foi usado"
  // — distinguir só ajudaria quem estivesse testando tokens.
  // ---------------------------------------------------------------
  const { data: convite } = await servico
    .from('patient_invites')
    .select('id, user_id, patient_id, expira_em, status')
    .eq('token_hash', await hashToken(token))
    .eq('status', 'gerado')
    .gt('expira_em', new Date().toISOString())
    .maybeSingle()

  if (!convite) return json(req, { erro: 'convite_invalido' }, 401)

  // ---------------------------------------------------------------
  // A conta
  //
  // role='patient' vai em app_metadata, não em user_metadata: o primeiro
  // só é gravável por service_role, e é ele que a trigger handle_new_user
  // consulta para não criar linha de nutricionista (migration 011).
  // ---------------------------------------------------------------
  const { data: criado, error: erroCriar } = await servico.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    app_metadata: { role: 'patient' },
    user_metadata: nome ? { nome_completo: nome } : {},
  })

  if (erroCriar || !criado?.user) {
    const msg = (erroCriar?.message ?? '').toLowerCase()
    if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
      // Acontece de verdade: o paciente também é assinante da plataforma,
      // ou já aceitou um convite antes com este e-mail. Não se cria conta
      // nova nem se adivinha senha — o app manda entrar e reabrir o link.
      return json(req, { erro: 'email_em_uso' }, 409)
    }
    console.error('falha ao criar usuário', erroCriar)
    return json(req, { erro: 'falha_ao_criar_conta' }, 500)
  }

  const authUserId = criado.user.id

  // ---------------------------------------------------------------
  // O vínculo
  //
  // Se falhar aqui, a conta recém-criada é apagada. Sem isso sobraria um
  // usuário sem vínculo nenhum: não conseguiria usar o app, e travaria o
  // e-mail dele para uma segunda tentativa.
  // ---------------------------------------------------------------
  const { error: erroVinculo } = await servico.from('patient_users').insert({
    auth_user_id: authUserId,
    patient_id: convite.patient_id,
    nutri_user_id: convite.user_id,
    ativo: true,
    consentimento_em: new Date().toISOString(),
    consentimento_versao,
  })

  if (erroVinculo) {
    console.error('falha ao vincular; desfazendo a conta', erroVinculo)
    await servico.auth.admin.deleteUser(authUserId)
    return json(req, { erro: 'falha_ao_vincular' }, 500)
  }

  // ---------------------------------------------------------------
  // Queimar o convite
  //
  // Por último, e de propósito: se algo acima falhar, o convite continua
  // válido e o paciente pode tentar de novo com o mesmo link.
  // ---------------------------------------------------------------
  await servico
    .from('patient_invites')
    .update({ status: 'aceito', aceito_em: new Date().toISOString() })
    .eq('id', convite.id)

  // Sem devolver sessão: o app do paciente faz signIn normal com o
  // e-mail e a senha que a pessoa acabou de escolher.
  return json(req, { ok: true })
})
