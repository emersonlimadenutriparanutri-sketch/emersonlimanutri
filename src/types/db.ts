/* Tipos das tabelas — espelham supabase/migrations/0001_schema.sql */

export type Temperatura = "frio" | "morno" | "quente";
export type StatusLead =
  | "novo_lead" | "contato_feito" | "qualificado"
  | "proposta_enviada" | "agendado" | "fechado" | "perdido";

export interface Perfil {
  id: string; nome: string | null; email: string | null; telefone: string | null;
  crn: string | null; avatar_url: string | null; clinica: string | null;
  aprovado: boolean; created_at: string;
}

export interface Servico {
  id: string; user_id: string; nome: string; descricao: string | null;
  valor: number; tipo: "mensal" | "premium"; duracao_meses: number | null;
  ativo: boolean; created_at: string;
}

export interface Lead {
  id: string; user_id: string; nome: string;
  telefone: string | null; email: string | null; cidade: string | null; estado: string | null;
  instagram: string | null; data_nascimento: string | null; sexo: string | null; profissao: string | null;
  origem: string | null; status: StatusLead; temperatura: Temperatura;
  valor_potencial: number | null; servico_id: string | null; data_consulta: string | null;
  proxima_acao: string | null; proxima_acao_data: string | null;
  tags: string[] | null; observacoes: string | null; motivo_perda: string | null;
  tentativas: Tentativa[]; em_recuperacao: boolean; convertido_em: string | null;
  ordem: number; created_at: string; updated_at: string;
}

export interface Tentativa { data: string; canal: string; resultado: string; nota?: string }

export interface Paciente {
  id: string; user_id: string; nome: string;
  telefone: string | null; email: string | null; cidade: string | null; estado: string | null;
  instagram: string | null; data_nascimento: string | null; sexo: string | null; profissao: string | null;
  objetivo: string | null; observacoes: string | null; status: "ativo" | "inativo";
  servico_id: string | null; plano_tipo: "mensal" | "premium" | null; plano_valor: number | null;
  plano_inicio: string | null; plano_vencimento: string | null; origem: string | null;
  lead_id: string | null;
  ciclo_ultima_menstruacao: string | null; ciclo_duracao: number | null; ciclo_duracao_menstruacao: number | null;
  usa_medicacao: boolean | null; medicacoes: string | null; foto_url: string | null;
  created_at: string; updated_at: string;
}

export interface Anamnese {
  id: string; user_id: string; patient_id: string; data: string;
  dados: Record<string, any>; resumo_ia: string | null;
  arquivo_url: string | null; arquivo_nome: string | null; created_at: string;
}

export interface Rastreamento {
  id: string; user_id: string; patient_id: string; data: string;
  respostas: Record<string, number>; pontuacao_sistemas: Record<string, number>;
  pontuacao_total: number; relatorio_ia: string | null; created_at: string;
}

export interface AvaliacaoFisica {
  id: string; user_id: string; patient_id: string; data: string; metodo: string;
  peso: number | null; altura: number | null; imc: number | null; gordura_pct: number | null;
  massa_magra: number | null; massa_gorda: number | null; agua_pct: number | null; tmb: number | null;
  medidas: Record<string, number>; dobras: Record<string, number>;
  fotos: { url: string; angulo: string }[]; observacoes: string | null; created_at: string;
}

export interface Marcador {
  nome: string; valor: string | number; unidade?: string;
  ref_min?: number | null; ref_max?: number | null;
  otimo_min?: number | null; otimo_max?: number | null;
  status?: "abaixo" | "normal" | "acima" | "atencao";
}

export interface AnaliseExame {
  id: string; user_id: string; patient_id: string; data: string;
  laboratorio: string | null; origem: "nutricionista" | "paciente";
  arquivo_url: string | null; arquivo_nome: string | null;
  marcadores: Marcador[]; relatorio_ia: string | null; created_at: string;
}

export interface ResumoConsulta {
  id: string; user_id: string; patient_id: string; data: string;
  titulo: string | null; anotacoes: string | null; relatorio_ia: string | null;
  arquivo_url: string | null; arquivo_nome: string | null; created_at: string;
}

export interface RaioX {
  id: string; user_id: string; patient_id: string; semana_ref: string;
  respostas: Record<string, any>; peso: number | null; adesao_pct: number | null;
  leitura_ia: string | null; created_at: string;
}

export interface RelatorioEvolucao {
  id: string; user_id: string; patient_id: string;
  periodo_de: string | null; periodo_ate: string | null;
  conteudo: string | null; fontes: Record<string, any>; created_at: string;
}

export interface TarefaJornada {
  id: string; user_id: string; patient_id: string;
  mes: number; semana: number; titulo: string; descricao: string | null; tipo: string | null;
  data_prevista: string | null; concluida: boolean; concluida_em: string | null;
  anexos: { nome: string; url: string }[]; ordem: number; created_at: string;
}

export interface JornadaTemplate {
  id: string; user_id: string; nome: string; descricao: string | null; padrao: boolean;
  estrutura: {
    mes: number; titulo: string;
    semanas: { semana: number; titulo: string; tarefas: { titulo: string; tipo?: string; dia_offset?: number }[] }[];
  }[];
  created_at: string;
}

export type TipoEvento =
  | "tarefa" | "consulta" | "raio_x" | "contato" | "lembrete"
  | "envio_material" | "ajuste_plano" | "retorno" | "outro";

export interface AgendaTask {
  id: string; user_id: string; titulo: string; descricao: string | null;
  tipo: TipoEvento; data: string; hora: string | null; cor: string | null;
  concluida: boolean; concluida_em: string | null;
  patient_id: string | null; lead_id: string | null; link_reuniao: string | null;
  created_at: string;
}

export interface PlanoConta {
  id: string; user_id: string; codigo: string | null; nome: string;
  tipo: "receita" | "despesa"; parent_id: string | null; ativo: boolean;
}

export interface ContaFinanceira {
  id: string; user_id: string; nome: string;
  tipo: "caixa" | "banco" | "cartao_debito" | "cartao_credito";
  banco: string | null; saldo_inicial: number; dia_fechamento: number | null;
  dia_vencimento: number | null; ativo: boolean;
}

export interface Receita {
  id: string; user_id: string; descricao: string; valor: number; data_competencia: string;
  patient_id: string | null; lead_id: string | null; servico_id: string | null;
  conta_id: string | null; plano_conta_id: string | null; origem_lead: string | null;
  parcelas: number; forma_pagamento: string | null; observacoes: string | null; created_at: string;
}

export interface Despesa {
  id: string; user_id: string; descricao: string; valor: number; data_competencia: string;
  conta_id: string | null; plano_conta_id: string | null; fornecedor: string | null;
  parcelas: number; recorrente: boolean; observacoes: string | null; created_at: string;
}

export interface Lancamento {
  id: string; user_id: string; tipo: "receber" | "pagar"; descricao: string; valor: number;
  vencimento: string; pago: boolean; data_pagamento: string | null;
  receita_id: string | null; despesa_id: string | null; conta_id: string | null;
  parcela: number; total_parcelas: number; created_at: string;
}

export interface MetaFinanceira {
  id: string; user_id: string; mes_ref: string;
  meta_receita: number; meta_pacientes: number; dias_uteis: number;
}

export type TipoPergunta =
  | "texto" | "textarea" | "numero" | "escolha_unica" | "multipla" | "escala" | "data" | "upload";

export interface Pergunta {
  id: string; tipo: TipoPergunta; titulo: string; descricao?: string;
  obrigatoria?: boolean; opcoes?: string[]; min?: number; max?: number; sistema?: string;
}

export interface QuestionarioModelo {
  id: string; user_id: string; titulo: string; descricao: string | null;
  categoria: string | null; perguntas: Pergunta[]; ativo: boolean; created_at: string;
}

export interface QuestionarioEnvio {
  id: string; user_id: string; modelo_id: string; patient_id: string | null; lead_id: string | null;
  token: string; destinatario: string | null; respondido: boolean; respondido_em: string | null;
  expira_em: string | null; created_at: string;
}

export interface QuestionarioResposta {
  id: string; user_id: string; envio_id: string; modelo_id: string | null; patient_id: string | null;
  respostas: Record<string, any>; resumo_ia: string | null; created_at: string;
}

export interface KanbanBoard { id: string; user_id: string; nome: string; descricao: string | null; cor: string | null; ordem: number }
export interface KanbanColumn { id: string; user_id: string; board_id: string; nome: string; cor: string | null; ordem: number }
export interface KanbanCard {
  id: string; user_id: string; column_id: string; titulo: string; descricao: string | null;
  cor: string | null; data_limite: string | null;
  checklist: { id: string; texto: string; feito: boolean }[]; ordem: number;
}

export interface NoMapa { id: string; parentId: string | null; texto: string; x: number; y: number; cor: string }
export interface MindMap {
  id: string; user_id: string; titulo: string; descricao: string | null;
  nos: NoMapa[]; created_at: string; updated_at: string;
}
