export type Paciente = {
  id: string
  user_id: string
  nome: string
  email: string | null
  telefone: string | null
  status: string | null
  objetivo: string | null
  sexo: string | null
  data_nascimento: string | null
  data_entrada: string | null
}

export type PerfilNutri = {
  id: string
  nome_completo: string | null
  especialidade: string | null
  crn: string | null
  avatar_url: string | null
  instagram: string | null
  telefone: string | null
}

export type Vinculo = {
  id: string
  auth_user_id: string
  patient_id: string
  nutri_user_id: string
  ativo: boolean
}

export type Permissoes = {
  patient_id: string
  ver_jornada: boolean
  ver_evolucao: boolean
  ver_relatorios: boolean
  ver_exames: boolean
  ver_consultas: boolean
  chat_ativo: boolean
  diario_ativo: boolean
  materiais_ativo: boolean
}

export const PERMISSOES_PADRAO: Omit<Permissoes, 'patient_id'> = {
  ver_jornada: true,
  ver_evolucao: true,
  ver_relatorios: true,
  ver_exames: false,
  ver_consultas: true,
  chat_ativo: true,
  diario_ativo: true,
  materiais_ativo: true,
}

// --- Jornada -----------------------------------------------------------
// A coluna `data` é JSONB montado pelo app do nutricionista. Os campos
// abaixo são os que o app do paciente consome; o resto é ignorado.

export type JornadaTarefa = {
  id?: string
  titulo?: string
  nome?: string
  descricao?: string
  concluida?: boolean
  concluido?: boolean
  data?: string
  prazo?: string
}

export type JornadaEtapa = {
  id?: string
  titulo?: string
  nome?: string
  descricao?: string
  status?: string
  dataInicio?: string
  dataFim?: string
  tarefas?: JornadaTarefa[]
  itens?: JornadaTarefa[]
}

export type JornadaData = {
  tipoPlano?: string
  dataInicio?: string
  dataFim?: string
  estrategia?: string
  estrategias?: Array<string | { titulo?: string; descricao?: string }>
  jornadas?: JornadaEtapa[]
  agendamentos?: Array<{ data?: string; titulo?: string; tipo?: string; observacao?: string }>
  statusPaciente?: string
  observacoesEstrategicas?: string
  cicloMenstrual?: {
    ativo?: boolean
    ultimaMenstruacao?: string
    duracaoCiclo?: number
    duracaoMenstruacao?: number
    duracaoTPM?: number
  }
}

export type Jornada = {
  id: string
  patient_id: string
  data: JornadaData | null
  updated_at: string
}

// --- Avaliações --------------------------------------------------------

export type Avaliacao = {
  id: string
  patient_id: string
  data_avaliacao: string
  peso: number | null
  altura: number | null
  imc: number | null
  percentual_gordura: number | null
  massa_magra: number | null
  massa_gorda: number | null
  cintura: number | null
  quadril: number | null
  agua_corporal: number | null
  shaped_score: number | null
  razao_cintura_estatura: number | null
  observacoes: string | null
  foto_frente: string | null
  foto_lado: string | null
  foto_costas: string | null
}

export type RelatorioEvolucao = {
  id: string
  patient_id: string
  titulo: string
  conteudo: string
  report_date: string | null
  created_at: string
}

export type AnaliseExames = {
  id: string
  patient_id: string
  data: Record<string, unknown> | null
  created_at: string
}

// --- Check-in semanal --------------------------------------------------

export type RaioXRespostas = {
  semana_referencia: string
  peso?: number | null
  adesao_plano?: number
  adesao_treino?: number
  qualidade_sono?: number
  nivel_energia?: number
  nivel_estresse?: number
  agua_litros?: number
  intestino?: string
  fome?: string
  dias_treino?: number
  vitorias?: string
  dificuldades?: string
  observacoes?: string
  enviado_pelo_app?: boolean
  enviado_em?: string
}

export type RaioX = {
  id: string
  patient_id: string
  user_id: string
  data: RaioXRespostas | null
  created_at: string
}

// --- Questionários -----------------------------------------------------

export type TipoPergunta =
  | 'section'
  | 'short'
  | 'long'
  | 'number'
  | 'date'
  | 'single'
  | 'multiple'
  | 'scale'

export type Pergunta = {
  id: string
  text: string
  type: TipoPergunta
  description?: string
  required?: boolean
  options?: Array<{ id: string; label: string }>
}

export type ModeloQuestionario = {
  id: string
  nome: string
  perguntas: Pergunta[]
}

export type EnvioQuestionario = {
  id: string
  modelo_id: string
  patient_id: string
  status: string
  prazo: string | null
  data_envio: string
  permite_multiplas: boolean
}

export type RespostaQuestionario = {
  id: string
  envio_id: string
  patient_id: string
  respostas: Record<string, unknown>
  respondido_em: string
}

// --- Chat, diário, lembretes, materiais --------------------------------

export type Mensagem = {
  id: string
  user_id: string
  patient_id: string
  autor: 'paciente' | 'nutri'
  corpo: string | null
  anexo_url: string | null
  anexo_tipo: string | null
  lida_em: string | null
  created_at: string
}

export type RegistroDiario = {
  id: string
  patient_id: string
  user_id: string
  data: string
  horario: string | null
  refeicao: string | null
  descricao: string | null
  foto_url: string | null
  fome_antes: number | null
  saciedade: number | null
  contexto: string | null
  created_at: string
}

export type Lembrete = {
  id: string
  patient_id: string
  user_id: string
  criado_por: 'paciente' | 'nutri'
  tipo: string
  titulo: string
  descricao: string | null
  horario: string | null
  dias_semana: number[]
  ativo: boolean
}

export type Material = {
  id: string
  user_id: string
  patient_id: string | null
  tipo: 'pdf' | 'video' | 'link' | 'receita' | 'texto'
  titulo: string
  descricao: string | null
  categoria: string | null
  url: string | null
  conteudo: string | null
  capa_url: string | null
  created_at: string
}

export type Agendamento = {
  id: string
  titulo: string
  descricao: string | null
  tipo: string | null
  data_inicio: string
  data_fim: string | null
  dia_inteiro: boolean
  concluido: boolean
  paciente_id: string | null
}
