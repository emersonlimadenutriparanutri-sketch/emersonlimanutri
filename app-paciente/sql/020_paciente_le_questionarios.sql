-- =====================================================================
-- App do Paciente — Fase 2
-- 020_paciente_le_questionarios.sql — o paciente enxerga o que tem para responder
--
-- Primeira policy de paciente em tabela clínica. Até aqui ele só via o
-- próprio vínculo e o nome do nutricionista.
--
-- SÓ LEITURA. O caminho de escrita (gravar a resposta) fica de fora de
-- propósito: ainda não está decidido se o app do paciente vai reusar a
-- Edge Function questionario-publico, que já existe e já é usada pelo
-- link tokenizado, ou se ganha uma função própria. Escrever a policy
-- antes dessa decisão seria adivinhar.
--
-- Rode depois da 015. É idempotente.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Os envios dele
--
-- É o que alimenta "você tem uma anamnese para preencher": o app lista
-- os envios do paciente com status e prazo.
--
-- Nota sobre a coluna token: o paciente passa a enxergar o próprio
-- token. Não é exposição nova — é exatamente o que ele já recebe no
-- link do questionário. RLS filtra linha, não coluna; esconder o campo
-- exigiria uma view, e o ganho seria nenhum.
-- ---------------------------------------------------------------------
drop policy if exists questionario_envios_paciente_select on public.questionario_envios;

create policy questionario_envios_paciente_select
  on public.questionario_envios
  for select
  to authenticated
  using (public.is_patient_of(patient_id));


-- ---------------------------------------------------------------------
-- 2. Os modelos que ele precisa ver
--
-- questionario_modelos é do nutricionista: são os formulários que ele
-- montou, e um paciente não tem por que ver o catálogo inteiro de
-- ninguém — muito menos o de outros assinantes.
--
-- Por isso a policy não é "paciente lê modelos", e sim "paciente lê o
-- modelo de um envio que é dele". Modelo sem envio para aquele
-- paciente permanece invisível.
-- ---------------------------------------------------------------------
drop policy if exists questionario_modelos_paciente_select on public.questionario_modelos;

create policy questionario_modelos_paciente_select
  on public.questionario_modelos
  for select
  to authenticated
  using (
    exists (
      select 1 from public.questionario_envios e
      where e.modelo_id = questionario_modelos.id
        and public.is_patient_of(e.patient_id)
    )
  );


-- ---------------------------------------------------------------------
-- 3. O que NÃO foi liberado, e por quê
--
-- questionario_respostas continua fechada para o paciente, inclusive
-- para leitura das próprias respostas. Motivo: a tabela tem a coluna
-- resumo_nutricionista, que é anotação interna. É o mesmo padrão de
-- jornada.data e anamnese.data — dado do paciente e nota do
-- profissional no mesmo lugar.
--
-- Se um dia o paciente precisar rever o que respondeu, isso sai por
-- função ou view com as colunas escolhidas, nunca por policy na tabela.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- 4. Verificação
--
-- Esperado: uma policy nova em cada tabela, somando às que já existiam
-- para o nutricionista (policies permissivas se combinam com OR, então
-- nada do que ele já faz é afetado).
-- ---------------------------------------------------------------------
select tablename, policyname, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename in ('questionario_envios', 'questionario_modelos', 'questionario_respostas')
order by tablename, cmd, policyname;
