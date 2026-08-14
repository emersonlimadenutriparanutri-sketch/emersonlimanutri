import { supabase } from './supabase'
import type {
  Agendamento,
  Avaliacao,
  EnvioQuestionario,
  Jornada,
  Lembrete,
  Material,
  Mensagem,
  ModeloQuestionario,
  RaioX,
  RegistroDiario,
  RelatorioEvolucao,
  RespostaQuestionario,
} from './types'

/**
 * Consultas do app do paciente. Todas dependem de RLS: se o nutricionista não
 * tiver liberado o recurso, o Supabase devolve lista vazia em vez de erro.
 */

export async function buscarJornada(patientId: string): Promise<Jornada | null> {
  const { data, error } = await supabase
    .from('jornada')
    .select('id, patient_id, data, updated_at')
    .eq('patient_id', patientId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as Jornada) ?? null
}

export async function buscarAvaliacoes(patientId: string): Promise<Avaliacao[]> {
  const { data, error } = await supabase
    .from('avaliacoes_fisicas')
    .select(
      'id, patient_id, data_avaliacao, peso, altura, imc, percentual_gordura, massa_magra, massa_gorda, cintura, quadril, agua_corporal, shaped_score, razao_cintura_estatura, observacoes, foto_frente, foto_lado, foto_costas'
    )
    .eq('patient_id', patientId)
    .order('data_avaliacao', { ascending: true })

  if (error) throw new Error(error.message)
  return (data as Avaliacao[]) ?? []
}

export async function buscarRelatorios(patientId: string): Promise<RelatorioEvolucao[]> {
  const { data, error } = await supabase
    .from('relatorios_evolucao')
    .select('id, patient_id, titulo, conteudo, report_date, created_at')
    .eq('patient_id', patientId)
    .order('report_date', { ascending: false })

  if (error) throw new Error(error.message)
  return (data as RelatorioEvolucao[]) ?? []
}

export async function buscarExames(patientId: string) {
  const { data, error } = await supabase
    .from('analise_exames')
    .select('id, patient_id, data, created_at')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data ?? []
}

export async function buscarConsultas(patientId: string): Promise<Agendamento[]> {
  const { data, error } = await supabase
    .from('agenda_tasks')
    .select('id, titulo, descricao, tipo, data_inicio, data_fim, dia_inteiro, concluido, paciente_id')
    .eq('paciente_id', patientId)
    .order('data_inicio', { ascending: true })

  if (error) throw new Error(error.message)
  return (data as Agendamento[]) ?? []
}

export async function buscarCheckIns(patientId: string, limite = 12): Promise<RaioX[]> {
  const { data, error } = await supabase
    .from('raio_x_semanal')
    .select('id, patient_id, user_id, data, created_at')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
    .limit(limite)

  if (error) throw new Error(error.message)
  return (data as RaioX[]) ?? []
}

export async function buscarQuestionarios(patientId: string) {
  const [{ data: envios, error: erroEnvios }, { data: respostas, error: erroRespostas }] =
    await Promise.all([
      supabase
        .from('questionario_envios')
        .select('id, modelo_id, patient_id, status, prazo, data_envio, permite_multiplas')
        .eq('patient_id', patientId)
        .order('data_envio', { ascending: false }),
      supabase
        .from('questionario_respostas')
        .select('id, envio_id, patient_id, respostas, respondido_em')
        .eq('patient_id', patientId),
    ])

  if (erroEnvios) throw new Error(erroEnvios.message)
  if (erroRespostas) throw new Error(erroRespostas.message)

  const lista = (envios as EnvioQuestionario[]) ?? []
  const feitas = (respostas as RespostaQuestionario[]) ?? []

  if (lista.length === 0) return { envios: lista, respostas: feitas, modelos: {} as Record<string, ModeloQuestionario> }

  const { data: modelos, error: erroModelos } = await supabase
    .from('questionario_modelos')
    .select('id, nome, perguntas')
    .in('id', Array.from(new Set(lista.map((e) => e.modelo_id))))

  if (erroModelos) throw new Error(erroModelos.message)

  const porId: Record<string, ModeloQuestionario> = {}
  for (const m of (modelos as ModeloQuestionario[]) ?? []) porId[m.id] = m

  return { envios: lista, respostas: feitas, modelos: porId }
}

export async function buscarMensagens(patientId: string): Promise<Mensagem[]> {
  const { data, error } = await supabase
    .from('patient_messages')
    .select('id, user_id, patient_id, autor, corpo, anexo_url, anexo_tipo, lida_em, created_at')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data as Mensagem[]) ?? []
}

export async function buscarDiario(patientId: string, limite = 60): Promise<RegistroDiario[]> {
  const { data, error } = await supabase
    .from('diario_alimentar')
    .select('id, patient_id, user_id, data, horario, refeicao, descricao, foto_url, fome_antes, saciedade, contexto, created_at')
    .eq('patient_id', patientId)
    .order('data', { ascending: false })
    .order('horario', { ascending: false, nullsFirst: false })
    .limit(limite)

  if (error) throw new Error(error.message)
  return (data as RegistroDiario[]) ?? []
}

export async function buscarLembretes(patientId: string): Promise<Lembrete[]> {
  const { data, error } = await supabase
    .from('lembretes')
    .select('id, patient_id, user_id, criado_por, tipo, titulo, descricao, horario, dias_semana, ativo')
    .eq('patient_id', patientId)
    .order('horario', { ascending: true, nullsFirst: false })

  if (error) throw new Error(error.message)
  return (data as Lembrete[]) ?? []
}

export async function buscarMateriais(nutriId: string, patientId: string): Promise<Material[]> {
  const { data, error } = await supabase
    .from('materiais')
    .select('id, user_id, patient_id, tipo, titulo, descricao, categoria, url, conteudo, capa_url, created_at')
    .eq('user_id', nutriId)
    .or(`patient_id.is.null,patient_id.eq.${patientId}`)
    .eq('publicado', true)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data as Material[]) ?? []
}
