-- =====================================================================
--  SEED — conteúdo inicial de cada nutricionista.
--  Rode DEPOIS do 0001. A função é chamada pelo app no 1º login e é
--  idempotente: nunca duplica o que o usuário já tem.
-- =====================================================================

create or replace function public.seed_dados_iniciais()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_board uuid;
begin
  if uid is null then
    raise exception 'sem usuario autenticado';
  end if;

  -- ---------- Plano de contas ----------
  if not exists (select 1 from public.plano_contas where user_id = uid) then
    insert into public.plano_contas (user_id, codigo, nome, tipo) values
      (uid, '1',   'Receitas',                'receita'),
      (uid, '1.1', 'Consultas',               'receita'),
      (uid, '1.2', 'Planos de acompanhamento','receita'),
      (uid, '1.3', 'Produtos digitais',       'receita'),
      (uid, '2',   'Despesas',                'despesa'),
      (uid, '2.1', 'Estrutura e aluguel',     'despesa'),
      (uid, '2.2', 'Marketing e tráfego',     'despesa'),
      (uid, '2.3', 'Softwares e assinaturas', 'despesa'),
      (uid, '2.4', 'Impostos e contabilidade','despesa'),
      (uid, '2.5', 'Educação continuada',     'despesa'),
      (uid, '2.6', 'Equipe',                  'despesa'),
      (uid, '2.7', 'Pró-labore',              'despesa');

    update public.plano_contas f
       set parent_id = p.id
      from public.plano_contas p
     where f.user_id = uid and p.user_id = uid
       and p.codigo = split_part(f.codigo, '.', 1)
       and f.codigo <> p.codigo;
  end if;

  -- ---------- Conta financeira padrão ----------
  if not exists (select 1 from public.contas_financeiras where user_id = uid) then
    insert into public.contas_financeiras (user_id, nome, tipo) values (uid, 'Caixa', 'caixa');
  end if;

  -- ---------- Serviços de exemplo ----------
  if not exists (select 1 from public.servicos where user_id = uid) then
    insert into public.servicos (user_id, nome, descricao, valor, tipo, duracao_meses) values
      (uid, 'Acompanhamento Mensal', 'Consulta + plano alimentar + ajustes mensais.', 350, 'mensal', 1),
      (uid, 'Acompanhamento Premium 3 meses', 'Acompanhamento próximo, suporte entre consultas e reavaliações.', 1500, 'premium', 3);
  end if;

  -- ---------- Jornada modelo (aplicada a todo novo paciente) ----------
  if not exists (select 1 from public.jornada_templates where user_id = uid) then
    insert into public.jornada_templates (user_id, nome, descricao, padrao, estrutura) values (
      uid,
      'Jornada padrão — 3 meses',
      'Cronograma base de acompanhamento: adaptação, consolidação e autonomia.',
      true,
      '[
        {"mes":1,"titulo":"Mês 1 — Adaptação","semanas":[
          {"semana":1,"titulo":"Semana 1 — Início","tarefas":[
            {"titulo":"Enviar boas-vindas e combinados","tipo":"contato","dia_offset":0},
            {"titulo":"Enviar plano alimentar","tipo":"envio_material","dia_offset":1},
            {"titulo":"Check-in de adaptação","tipo":"contato","dia_offset":4}]},
          {"semana":2,"titulo":"Semana 2 — Ajuste fino","tarefas":[
            {"titulo":"Raio-X semanal","tipo":"raio_x","dia_offset":7},
            {"titulo":"Ajustar plano conforme rotina","tipo":"ajuste_plano","dia_offset":9}]},
          {"semana":3,"titulo":"Semana 3 — Consistência","tarefas":[
            {"titulo":"Raio-X semanal","tipo":"raio_x","dia_offset":14},
            {"titulo":"Material educativo do mês","tipo":"envio_material","dia_offset":16}]},
          {"semana":4,"titulo":"Semana 4 — Reavaliação","tarefas":[
            {"titulo":"Raio-X semanal","tipo":"raio_x","dia_offset":21},
            {"titulo":"Consulta de retorno","tipo":"retorno","dia_offset":28}]}]},
        {"mes":2,"titulo":"Mês 2 — Consolidação","semanas":[
          {"semana":1,"titulo":"Semana 5","tarefas":[
            {"titulo":"Ajuste do plano pós-retorno","tipo":"ajuste_plano","dia_offset":30},
            {"titulo":"Raio-X semanal","tipo":"raio_x","dia_offset":35}]},
          {"semana":2,"titulo":"Semana 6","tarefas":[
            {"titulo":"Raio-X semanal","tipo":"raio_x","dia_offset":42}]},
          {"semana":3,"titulo":"Semana 7","tarefas":[
            {"titulo":"Solicitar exames de controle","tipo":"envio_material","dia_offset":49}]},
          {"semana":4,"titulo":"Semana 8","tarefas":[
            {"titulo":"Consulta de retorno","tipo":"retorno","dia_offset":56}]}]},
        {"mes":3,"titulo":"Mês 3 — Autonomia","semanas":[
          {"semana":1,"titulo":"Semana 9","tarefas":[
            {"titulo":"Avaliação física comparativa","tipo":"tarefa","dia_offset":60}]},
          {"semana":2,"titulo":"Semana 10","tarefas":[
            {"titulo":"Raio-X semanal","tipo":"raio_x","dia_offset":70}]},
          {"semana":3,"titulo":"Semana 11","tarefas":[
            {"titulo":"Conversa sobre manutenção","tipo":"contato","dia_offset":77}]},
          {"semana":4,"titulo":"Semana 12 — Renovação","tarefas":[
            {"titulo":"Relatório de evolução","tipo":"tarefa","dia_offset":84},
            {"titulo":"Proposta de renovação","tipo":"contato","dia_offset":86}]}]}
      ]'::jsonb
    );
  end if;

  -- ---------- Quadro Kanban inicial ----------
  if not exists (select 1 from public.kanban_boards where user_id = uid) then
    insert into public.kanban_boards (user_id, nome, descricao, cor)
    values (uid, 'Consultório', 'Projetos e tarefas do consultório', '#071739')
    returning id into v_board;

    insert into public.kanban_columns (user_id, board_id, nome, cor, ordem) values
      (uid, v_board, 'A fazer',   '#94a3b8', 0),
      (uid, v_board, 'Fazendo',   '#a68768', 1),
      (uid, v_board, 'Aguardando','#0284c7', 2),
      (uid, v_board, 'Concluído', '#15803d', 3);
  end if;

  -- ---------- Modelos de questionário ----------
  if not exists (select 1 from public.questionario_modelos where user_id = uid) then
    insert into public.questionario_modelos (user_id, titulo, descricao, categoria, perguntas) values
    (uid, 'Pré-consulta nutricional — Feminino',
     'Formulário enviado antes da primeira consulta.', 'pre_consulta',
     '[
       {"id":"q1","tipo":"texto","titulo":"Nome completo","obrigatoria":true},
       {"id":"q2","tipo":"data","titulo":"Data de nascimento","obrigatoria":true},
       {"id":"q3","tipo":"numero","titulo":"Peso atual (kg)","obrigatoria":true},
       {"id":"q4","tipo":"numero","titulo":"Altura (cm)","obrigatoria":true},
       {"id":"q5","tipo":"textarea","titulo":"Qual é o seu principal objetivo hoje?","obrigatoria":true},
       {"id":"q6","tipo":"textarea","titulo":"Conte a sua história com o peso: o que já tentou e o que aconteceu depois","obrigatoria":false},
       {"id":"q7","tipo":"escolha_unica","titulo":"Como está o seu ciclo menstrual?","opcoes":["Regular","Irregular","Perimenopausa","Menopausa","Uso contraceptivo contínuo","Não menstruo por outro motivo"],"obrigatoria":true},
       {"id":"q8","tipo":"multipla","titulo":"Você tem algum destes diagnósticos?","opcoes":["SOP","Resistência à insulina","Diabetes","Hipotireoidismo","Endometriose","Hipertensão","Esteatose hepática","Nenhum"],"obrigatoria":false},
       {"id":"q9","tipo":"textarea","titulo":"Medicamentos e suplementos em uso (inclua dose)","obrigatoria":false},
       {"id":"q10","tipo":"escolha_unica","titulo":"Você usa ou já usou tirzepatida, semaglutida ou similar?","opcoes":["Uso atualmente","Já usei e parei","Nunca usei","Estou avaliando usar"],"obrigatoria":true},
       {"id":"q11","tipo":"escala","titulo":"De 0 a 10, como está a sua qualidade de sono?","min":0,"max":10,"obrigatoria":true},
       {"id":"q12","tipo":"escala","titulo":"De 0 a 10, qual o seu nível de estresse hoje?","min":0,"max":10,"obrigatoria":true},
       {"id":"q13","tipo":"escolha_unica","titulo":"Com que frequência você pratica atividade física?","opcoes":["Não pratico","1 a 2x por semana","3 a 4x por semana","5x ou mais"],"obrigatoria":true},
       {"id":"q14","tipo":"textarea","titulo":"Descreva um dia alimentar típico seu, do café da manhã à noite","obrigatoria":true},
       {"id":"q15","tipo":"textarea","titulo":"Existe algum momento do dia em que você sente que perde o controle com a comida?","obrigatoria":false},
       {"id":"q16","tipo":"textarea","titulo":"Alergias, intolerâncias ou alimentos que você não come","obrigatoria":false},
       {"id":"q17","tipo":"upload","titulo":"Anexe seus exames mais recentes (opcional)","obrigatoria":false}
     ]'::jsonb),
    (uid, 'Pré-consulta nutricional — Masculino',
     'Formulário enviado antes da primeira consulta.', 'pre_consulta',
     '[
       {"id":"q1","tipo":"texto","titulo":"Nome completo","obrigatoria":true},
       {"id":"q2","tipo":"data","titulo":"Data de nascimento","obrigatoria":true},
       {"id":"q3","tipo":"numero","titulo":"Peso atual (kg)","obrigatoria":true},
       {"id":"q4","tipo":"numero","titulo":"Altura (cm)","obrigatoria":true},
       {"id":"q5","tipo":"textarea","titulo":"Qual é o seu principal objetivo hoje?","obrigatoria":true},
       {"id":"q6","tipo":"textarea","titulo":"Histórico de peso: o que já tentou e o que aconteceu depois","obrigatoria":false},
       {"id":"q7","tipo":"multipla","titulo":"Você tem algum destes diagnósticos?","opcoes":["Resistência à insulina","Diabetes","Hipertensão","Colesterol alterado","Esteatose hepática","Apneia do sono","Nenhum"],"obrigatoria":false},
       {"id":"q8","tipo":"textarea","titulo":"Medicamentos e suplementos em uso (inclua dose)","obrigatoria":false},
       {"id":"q9","tipo":"escala","titulo":"De 0 a 10, como está a sua qualidade de sono?","min":0,"max":10,"obrigatoria":true},
       {"id":"q10","tipo":"escala","titulo":"De 0 a 10, qual o seu nível de estresse hoje?","min":0,"max":10,"obrigatoria":true},
       {"id":"q11","tipo":"escolha_unica","titulo":"Consumo de álcool","opcoes":["Não bebo","Socialmente","1 a 2x por semana","3x ou mais por semana"],"obrigatoria":true},
       {"id":"q12","tipo":"escolha_unica","titulo":"Com que frequência você treina?","opcoes":["Não treino","1 a 2x por semana","3 a 4x por semana","5x ou mais"],"obrigatoria":true},
       {"id":"q13","tipo":"textarea","titulo":"Descreva um dia alimentar típico seu","obrigatoria":true},
       {"id":"q14","tipo":"textarea","titulo":"Alergias, intolerâncias ou alimentos que você não come","obrigatoria":false},
       {"id":"q15","tipo":"upload","titulo":"Anexe seus exames mais recentes (opcional)","obrigatoria":false}
     ]'::jsonb),
    (uid, 'Acompanhamento — 1ª semana',
     'Check-in rápido para ajustar o plano na primeira semana.', 'acompanhamento',
     '[
       {"id":"q1","tipo":"escala","titulo":"De 0 a 10, quanto você conseguiu seguir o plano?","min":0,"max":10,"obrigatoria":true},
       {"id":"q2","tipo":"numero","titulo":"Peso de hoje (kg)","obrigatoria":false},
       {"id":"q3","tipo":"escolha_unica","titulo":"Como esteve a sua fome ao longo da semana?","opcoes":["Controlada","Oscilou","Muita fome","Sem fome nenhuma"],"obrigatoria":true},
       {"id":"q4","tipo":"escolha_unica","titulo":"Intestino","opcoes":["Normal","Preso","Solto","Alternando"],"obrigatoria":true},
       {"id":"q5","tipo":"escala","titulo":"Energia durante o dia (0 a 10)","min":0,"max":10,"obrigatoria":true},
       {"id":"q6","tipo":"escala","titulo":"Qualidade do sono (0 a 10)","min":0,"max":10,"obrigatoria":true},
       {"id":"q7","tipo":"numero","titulo":"Quantos treinos você fez nesta semana?","obrigatoria":false},
       {"id":"q8","tipo":"textarea","titulo":"Qual foi a maior dificuldade da semana?","obrigatoria":true},
       {"id":"q9","tipo":"textarea","titulo":"O que funcionou bem e você quer manter?","obrigatoria":false}
     ]'::jsonb),
    (uid, 'Rastreamento metabólico',
     'Pontue de 0 (nunca) a 4 (sempre) a frequência de cada sintoma nos últimos 30 dias.', 'rastreamento',
     '[
       {"id":"cabeca_1","tipo":"escala","titulo":"Dores de cabeça","min":0,"max":4,"sistema":"Cabeça","obrigatoria":true},
       {"id":"cabeca_2","tipo":"escala","titulo":"Tontura ou sensação de desmaio","min":0,"max":4,"sistema":"Cabeça","obrigatoria":true},
       {"id":"digest_1","tipo":"escala","titulo":"Distensão abdominal ou gases","min":0,"max":4,"sistema":"Digestivo","obrigatoria":true},
       {"id":"digest_2","tipo":"escala","titulo":"Azia ou refluxo","min":0,"max":4,"sistema":"Digestivo","obrigatoria":true},
       {"id":"digest_3","tipo":"escala","titulo":"Constipação ou diarreia","min":0,"max":4,"sistema":"Digestivo","obrigatoria":true},
       {"id":"energia_1","tipo":"escala","titulo":"Fadiga ou cansaço ao acordar","min":0,"max":4,"sistema":"Energia","obrigatoria":true},
       {"id":"energia_2","tipo":"escala","titulo":"Queda de energia à tarde","min":0,"max":4,"sistema":"Energia","obrigatoria":true},
       {"id":"emocional_1","tipo":"escala","titulo":"Ansiedade ou irritabilidade","min":0,"max":4,"sistema":"Emocional","obrigatoria":true},
       {"id":"emocional_2","tipo":"escala","titulo":"Oscilação de humor","min":0,"max":4,"sistema":"Emocional","obrigatoria":true},
       {"id":"emocional_3","tipo":"escala","titulo":"Dificuldade de concentração","min":0,"max":4,"sistema":"Emocional","obrigatoria":true},
       {"id":"pele_1","tipo":"escala","titulo":"Acne, coceira ou manchas na pele","min":0,"max":4,"sistema":"Pele","obrigatoria":true},
       {"id":"pele_2","tipo":"escala","titulo":"Queda de cabelo ou unhas fracas","min":0,"max":4,"sistema":"Pele","obrigatoria":true},
       {"id":"peso_1","tipo":"escala","titulo":"Compulsão ou desejo por doces","min":0,"max":4,"sistema":"Peso","obrigatoria":true},
       {"id":"peso_2","tipo":"escala","titulo":"Retenção de líquido ou inchaço","min":0,"max":4,"sistema":"Peso","obrigatoria":true},
       {"id":"articular_1","tipo":"escala","titulo":"Dores articulares ou musculares","min":0,"max":4,"sistema":"Articular","obrigatoria":true},
       {"id":"imuno_1","tipo":"escala","titulo":"Infecções frequentes ou gripes","min":0,"max":4,"sistema":"Imunológico","obrigatoria":true},
       {"id":"sono_1","tipo":"escala","titulo":"Insônia ou sono não reparador","min":0,"max":4,"sistema":"Sono","obrigatoria":true},
       {"id":"hormonal_1","tipo":"escala","titulo":"TPM intensa, fogachos ou sintomas hormonais","min":0,"max":4,"sistema":"Hormonal","obrigatoria":true}
     ]'::jsonb);
  end if;
end;
$$;

grant execute on function public.seed_dados_iniciais() to authenticated;
