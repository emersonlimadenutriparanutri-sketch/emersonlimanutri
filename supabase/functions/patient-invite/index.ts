// =====================================================================
// App do Paciente — patient-invite
//
// Gera o link de convite de um paciente. Quem chama é o nutricionista,
// autenticado, a partir do app dele.
//
// O sistema NÃO envia nada: devolve o link uma única vez, e o
// nutricionista manda pelo WhatsApp em que já conversa com o paciente.
//
// POST { patient_id: uuid, dias_validade?: number }
//   200 { link, expira_em }
//   401 sem sessão
//   403 o paciente não é dele
//   404 paciente inexistente
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, respostaPreflight, json } from '../_shared/cors.ts'
import { gerarToken, hashToken } from '../_shared/token.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_PACIENTE_URL = Deno.env.get('PATIENT_APP_URL')!

const DIAS_PADRAO = 7
const DIAS_MAXIMO = 30

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return respostaPreflight(req)
  if (req.method !== 'POST') return json(req, { erro: 'metodo_nao_permitido' }, 405)

  // ---------------------------------------------------------------
  // Quem está chamando
  //
  // Cliente com a anon key + o Authorization de quem chamou: as leituras
  // abaixo passam pela RLS como o próprio nutricionista. É de propósito —
  // se ele não enxerga o paciente, não pode convidá-lo.
  // ---------------------------------------------------------------
  const authorization = req.headers.get('Authorization') ?? ''
  if (!authorization) return json(req, { erro: 'sem_sessao' }, 401)

  const comoUsuario = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authorization } },
  })

  const { data: sessao, error: erroSessao } = await comoUsuario.auth.getUser()
  if (erroSessao || !sessao?.user) return json(req, { erro: 'sem_sessao' }, 401)
  const nutriId = sessao.user.id

  // ---------------------------------------------------------------
  // Entrada
  // ---------------------------------------------------------------
  let corpo: { patient_id?: string; dias_validade?: number }
  try {
    corpo = await req.json()
  } catch {
    return json(req, { erro: 'corpo_invalido' }, 400)
  }

  const patientId = corpo.patient_id
  if (!patientId) return json(req, { erro: 'patient_id_obrigatorio' }, 400)

  const dias = Math.min(Math.max(corpo.dias_validade ?? DIAS_PADRAO, 1), DIAS_MAXIMO)

  // ---------------------------------------------------------------
  // O paciente é dele?
  //
  // A RLS já garantiria isso, mas a checagem explícita permite devolver
  // 403 em vez de um erro genérico mais adiante — e deixa a regra
  // legível para quem for ler esta função depois.
  // ---------------------------------------------------------------
  const { data: paciente, error: erroPaciente } = await comoUsuario
    .from('patients')
    .select('id, nome, user_id')
    .eq('id', patientId)
    .maybeSingle()

  if (erroPaciente) return json(req, { erro: 'falha_ao_buscar_paciente' }, 500)
  if (!paciente) return json(req, { erro: 'paciente_nao_encontrado' }, 404)
  if (paciente.user_id !== nutriId) return json(req, { erro: 'paciente_de_outro_nutricionista' }, 403)

  // ---------------------------------------------------------------
  // Já aceitou?
  //
  // Convidar de novo quem já está dentro não faz sentido e confundiria
  // o paciente com um segundo link que não leva a lugar nenhum.
  // ---------------------------------------------------------------
  const servico = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  })

  const { data: vinculo } = await servico
    .from('patient_users')
    .select('id, ativo')
    .eq('patient_id', patientId)
    .maybeSingle()

  if (vinculo?.ativo) return json(req, { erro: 'paciente_ja_tem_acesso' }, 409)

  // ---------------------------------------------------------------
  // Gerar
  //
  // Convites anteriores ainda pendentes são revogados: se o
  // nutricionista pediu um link novo, o antigo não deve mais servir.
  // Dois links válidos para o mesmo paciente é uma porta a mais sem
  // ganho nenhum.
  // ---------------------------------------------------------------
  await servico
    .from('patient_invites')
    .update({ status: 'revogado' })
    .eq('patient_id', patientId)
    .eq('status', 'gerado')

  const token = gerarToken()
  const expiraEm = new Date(Date.now() + dias * 24 * 60 * 60 * 1000)

  const { error: erroInsert } = await servico.from('patient_invites').insert({
    user_id: nutriId,
    patient_id: patientId,
    token_hash: await hashToken(token),
    expira_em: expiraEm.toISOString(),
    status: 'gerado',
  })

  if (erroInsert) {
    console.error('falha ao gravar convite', erroInsert)
    return json(req, { erro: 'falha_ao_gerar_convite' }, 500)
  }

  // Única vez que o token cru sai daqui.
  return json(req, {
    link: `${APP_PACIENTE_URL.replace(/\/$/, '')}/convite?token=${token}`,
    expira_em: expiraEm.toISOString(),
    paciente_nome: paciente.nome,
  })
})
