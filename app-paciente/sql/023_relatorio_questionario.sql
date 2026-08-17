-- =====================================================================
-- App do Paciente — Fase 2
-- 023_relatorio_questionario.sql — onde mora o relatório de IA
--
-- A calorimetria guarda o relatório em colunas próprias
-- (calorimetria_indireta.relatorio_tecnico / relatorio_didatico). O
-- rastreamento não tem tabela própria: a resposta vive em
-- questionario_respostas, junto com anamnese e check-ins.
--
-- Em vez de criar uma tabela só para o rastreamento, as duas colunas
-- entram em questionario_respostas. Qualquer questionário pode ganhar
-- análise de IA — anamnese e check-in semanal são candidatos naturais
-- — e o mesmo par de colunas serve para todos.
--
-- Reforça, de passagem, por que essa tabela continua fechada ao
-- paciente: agora ela guarda não só resumo_nutricionista, mas dois
-- relatórios escritos para o profissional.
--
-- Rode depois da 022. É idempotente.
-- =====================================================================

alter table public.questionario_respostas
  add column if not exists relatorio_tecnico   text,
  add column if not exists relatorio_didatico  text,
  add column if not exists relatorio_gerado_em timestamptz;

comment on column public.questionario_respostas.relatorio_tecnico is
  'Leitura clínica gerada por IA e revisada pelo nutricionista. Nunca visível ao paciente por esta tabela.';

comment on column public.questionario_respostas.relatorio_didatico is
  'Versão em linguagem acessível. Só chega ao paciente quando o nutricionista publicar por um caminho próprio.';


-- Verificação
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'questionario_respostas'
order by ordinal_position;
