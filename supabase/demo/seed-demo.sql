-- =====================================================================
--  DADOS DE DEMONSTRAÇÃO
--
--  Popula a conta logada com um consultório fictício completo, para
--  apresentar o sistema. NÃO use na conta que você usa com pacientes reais.
--
--  Rode este arquivo no SQL Editor e depois, logado no app, chame:
--     select public.seed_demo();     -- cria os dados
--     select public.limpar_demo();   -- remove tudo que a demonstração criou
--
--  Todo registro criado aqui fica marcado com origem/descrição
--  'Demonstração', então a limpeza não toca em nada que seja seu.
-- =====================================================================

create or replace function public.limpar_demo()
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  ids uuid[];
  removidos int;
begin
  if uid is null then raise exception 'sem usuario autenticado'; end if;

  select array_agg(id) into ids from public.patients where user_id = uid and origem = 'Demonstração';
  ids := coalesce(ids, '{}');

  delete from public.agenda_tasks where user_id = uid and (patient_id = any(ids) or titulo like '[demo]%');
  delete from public.patients where id = any(ids);
  delete from public.leads   where user_id = uid and origem = 'Demonstração';
  delete from public.lancamentos where user_id = uid and descricao like '[demo]%';
  delete from public.receitas    where user_id = uid and descricao like '[demo]%';
  delete from public.despesas    where user_id = uid and descricao like '[demo]%';

  get diagnostics removidos = row_count;
  return format('Demonstração removida (%s pacientes).', coalesce(array_length(ids, 1), 0));
end;
$$;

create or replace function public.seed_demo()
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  hoje date := current_date;
  premium_id uuid;
  mensal_id uuid;
  conta_id uuid;
  conta_receita uuid;
  conta_despesa uuid;
  pid uuid;
  rid uuid;
  p record;
  m int;
  s int;
  i int;
  peso_base numeric;
  total int := 0;

  -- nome, idade, sexo, objetivo, plano, dias até vencer, status, ciclo (dias desde a última menstruação), medicação
  pacientes jsonb := '[
    {"nome":"Adriana Moraes","idade":47,"sexo":"feminino","obj":"Emagrecer sem perder massa na perimenopausa","plano":"premium","venc":54,"status":"ativo","ciclo":24,"med":"Não usa","peso":82.4,"cidade":"São Paulo"},
    {"nome":"Cláudia Bernardes","idade":52,"sexo":"feminino","obj":"Controlar peso na menopausa e melhorar disposição","plano":"mensal","venc":18,"status":"ativo","ciclo":null,"med":"Levotiroxina 75 mcg","peso":76.1,"cidade":"Campinas"},
    {"nome":"Renata Vasconcelos","idade":43,"sexo":"feminino","obj":"SOP e resistência à insulina","plano":"premium","venc":71,"status":"ativo","ciclo":3,"med":"Metformina 850 mg 2x/dia","peso":89.7,"cidade":"Belo Horizonte"},
    {"nome":"Patrícia Nunes","idade":41,"sexo":"feminino","obj":"Manter o resultado depois da tirzepatida","plano":"premium","venc":39,"status":"ativo","ciclo":12,"med":"Tirzepatida 5 mg semanal","peso":71.3,"cidade":"São Paulo"},
    {"nome":"Simone Tavares","idade":55,"sexo":"feminino","obj":"Recomposição corporal e saúde óssea","plano":"mensal","venc":26,"status":"ativo","ciclo":null,"med":"Cálcio + vitamina D","peso":68.9,"cidade":"Santos"},
    {"nome":"Lúcia Andrade","idade":49,"sexo":"feminino","obj":"Pressão alta e esteatose hepática","plano":"mensal","venc":3,"status":"ativo","ciclo":26,"med":"Losartana 50 mg","peso":94.2,"cidade":"Guarulhos"},
    {"nome":"Beatriz Salgado","idade":44,"sexo":"feminino","obj":"Comportamento alimentar e compulsão à noite","plano":"premium","venc":6,"status":"ativo","ciclo":22,"med":"Escitalopram 10 mg","peso":79.5,"cidade":"Ribeirão Preto"},
    {"nome":"Vanessa Coutinho","idade":38,"sexo":"feminino","obj":"Endometriose e inflamação","plano":"mensal","venc":33,"status":"ativo","ciclo":8,"med":"Dienogeste","peso":64.8,"cidade":"Curitiba"},
    {"nome":"Marcelo Prado","idade":45,"sexo":"masculino","obj":"Resistência à insulina e gordura visceral","plano":"mensal","venc":21,"status":"ativo","ciclo":null,"med":"Não usa","peso":103.6,"cidade":"São Paulo"},
    {"nome":"Heloísa Campos","idade":58,"sexo":"feminino","obj":"Diabetes tipo 2 com controle difícil","plano":"mensal","venc":-9,"status":"ativo","ciclo":null,"med":"Metformina + dapagliflozina","peso":85.0,"cidade":"Sorocaba"},
    {"nome":"Tânia Belmonte","idade":46,"sexo":"feminino","obj":"Pausou o acompanhamento por questão financeira","plano":"mensal","venc":-46,"status":"inativo","ciclo":null,"med":"Não usa","peso":73.2,"cidade":"São Paulo"}
  ]'::jsonb;

  -- nome, etapa, temperatura, origem, valor, dias desde a criação, próxima ação
  leads_demo jsonb := '[
    {"nome":"Fernanda Lisboa","status":"novo_lead","temp":"morno","origem":"Instagram","valor":1500,"dias":2,"acao":"Responder o direct e qualificar"},
    {"nome":"Juliana Peixoto","status":"novo_lead","temp":"frio","origem":"Tráfego pago","valor":350,"dias":4,"acao":"Enviar material de boas-vindas"},
    {"nome":"Débora Antunes","status":"contato_feito","temp":"morno","origem":"Indicação","valor":1500,"dias":6,"acao":"Perguntar sobre a rotina de treino"},
    {"nome":"Rosana Militão","status":"qualificado","temp":"quente","origem":"Indicação","valor":1500,"dias":9,"acao":"Enviar proposta do Premium"},
    {"nome":"Carla Bittencourt","status":"proposta_enviada","temp":"quente","origem":"Instagram","valor":1500,"dias":11,"acao":"Follow up da proposta"},
    {"nome":"Michele Sarmento","status":"proposta_enviada","temp":"morno","origem":"Google","valor":350,"dias":14,"acao":"Reforçar o que está incluso"},
    {"nome":"Aline Vasques","status":"agendado","temp":"quente","origem":"Instagram","valor":1500,"dias":8,"acao":"Enviar questionário de pré-consulta"},
    {"nome":"Sandra Rocha","status":"fechado","temp":"quente","origem":"Indicação","valor":1500,"dias":20,"acao":null},
    {"nome":"Priscila Domingues","status":"perdido","temp":"frio","origem":"Tráfego pago","valor":350,"dias":31,"acao":null},
    {"nome":"Elaine Furtado","status":"perdido","temp":"morno","origem":"Instagram","valor":1500,"dias":24,"acao":null}
  ]'::jsonb;
begin
  if uid is null then raise exception 'sem usuario autenticado'; end if;

  perform public.limpar_demo();
  perform public.seed_dados_iniciais();

  select id into premium_id from public.servicos where user_id = uid and tipo = 'premium' limit 1;
  select id into mensal_id  from public.servicos where user_id = uid and tipo = 'mensal'  limit 1;
  select id into conta_id   from public.contas_financeiras where user_id = uid limit 1;
  select id into conta_receita from public.plano_contas where user_id = uid and codigo = '1.2' limit 1;
  select id into conta_despesa from public.plano_contas where user_id = uid and codigo = '2.2' limit 1;

  -- ================= pacientes =================
  for p in select * from jsonb_to_recordset(pacientes)
      as x(nome text, idade int, sexo text, obj text, plano text, venc int, status text,
           ciclo int, med text, peso numeric, cidade text)
  loop
    insert into public.patients (
      user_id, nome, telefone, email, cidade, estado, data_nascimento, sexo, objetivo,
      status, servico_id, plano_tipo, plano_valor, plano_inicio, plano_vencimento,
      origem, ciclo_ultima_menstruacao, ciclo_duracao, usa_medicacao, medicacoes, observacoes
    ) values (
      uid, p.nome,
      '11' || lpad((90000000 + (random() * 9999999)::int)::text, 8, '0'),
      lower(translate(split_part(p.nome, ' ', 1), 'áàãâéêíóôõúçÁÀÃÂÉÊÍÓÔÕÚÇ', 'aaaaeeioooucAAAAEEIOOOUC')) || '@email.com',
      p.cidade, 'SP',
      (hoje - (p.idade * 365 + 120))::date,
      p.sexo, p.obj, p.status,
      case when p.plano = 'premium' then premium_id else mensal_id end,
      p.plano,
      case when p.plano = 'premium' then 1500 else 350 end,
      (hoje - 90)::date,
      (hoje + p.venc)::date,
      'Demonstração',
      case when p.ciclo is not null then (hoje - p.ciclo)::date else null end,
      28,
      p.med <> 'Não usa', p.med,
      'Paciente de demonstração. ' || p.obj || '.'
    ) returning id into pid;
    total := total + 1;

    -- ---- avaliações físicas: 4 medições em 3 meses, com evolução real ----
    peso_base := p.peso;
    for i in 0..3 loop
      insert into public.avaliacoes_fisicas (
        user_id, patient_id, data, metodo, peso, altura, imc,
        gordura_pct, massa_magra, agua_pct, tmb, medidas, observacoes
      ) values (
        uid, pid, (hoje - (90 - i * 30))::date, 'bioimpedancia',
        round(peso_base - i * (case when p.status = 'inativo' then 0.4 else 1.6 end), 1),
        case when p.sexo = 'masculino' then 178 else 163 end,
        round((peso_base - i * 1.6) / power(case when p.sexo = 'masculino' then 1.78 else 1.63 end, 2), 1),
        round(case when p.sexo = 'masculino' then 30.5 else 39.8 end - i * 1.3, 1),
        round(peso_base * (case when p.sexo = 'masculino' then 0.66 else 0.58 end) + i * 0.35, 1),
        round(50.5 + i * 0.6, 1),
        round(1280 + peso_base * 6, 0),
        jsonb_build_object(
          'cintura', round(case when p.sexo = 'masculino' then 104 else 94 end - i * 2.1, 1),
          'quadril', round(case when p.sexo = 'masculino' then 106 else 112 end - i * 1.4, 1),
          'abdomen', round(case when p.sexo = 'masculino' then 108 else 99 end - i * 2.3, 1),
          'braco_d', round(33 - i * 0.3, 1),
          'coxa_d',  round(60 - i * 0.7, 1)
        ),
        case i when 0 then 'Avaliação inicial.' when 3 then 'Cintura seguiu caindo mesmo com a balança mais lenta.' else null end
      );
    end loop;

    -- ---- anamnese ----
    insert into public.anamnese (user_id, patient_id, data, dados) values (
      uid, pid, (hoje - 90)::date,
      jsonb_build_object(
        'queixa', p.obj,
        'historia', 'Já fez várias dietas restritivas, com reganho depois de cada uma. Relata cansaço da conta de calorias.',
        'clinico', 'Sem cirurgias prévias. ' || case when p.med = 'Não usa' then 'Sem medicação contínua.' else 'Em uso de ' || p.med || '.' end,
        'habitos', 'Café da manhã pulado com frequência, almoço fora de casa e jantar tarde. Fim de semana mais solto.',
        'comportamento', 'Belisca à noite depois que a casa silencia. Relata culpa depois.',
        'sono_estresse', 'Dorme por volta das 23h30, acorda 1 a 2 vezes. Estresse alto no trabalho.',
        'atividade', 'Musculação 2 a 3 vezes por semana, sem constância.',
        'hormonal', case when p.ciclo is not null then 'Ciclo ainda presente, com TPM intensa nos últimos meses.' else 'Sem ciclo menstrual no momento.' end,
        'objetivos', 'Quer emagrecer sem viver de dieta e conseguir manter.'
      )
    );

    -- ---- exames com marcadores ----
    insert into public.analise_exames (user_id, patient_id, data, laboratorio, origem, marcadores) values (
      uid, pid, (hoje - 75)::date, 'Laboratório Central', 'paciente',
      jsonb_build_array(
        jsonb_build_object('nome','Glicose de jejum','valor', 94 + (p.idade % 7), 'unidade','mg/dL','ref_min',70,'ref_max',99),
        jsonb_build_object('nome','Insulina de jejum','valor', 12.4, 'unidade','µUI/mL','ref_min',2.6,'ref_max',24.9),
        jsonb_build_object('nome','Hemoglobina glicada','valor', 5.6, 'unidade','%','ref_min',4,'ref_max',5.6),
        jsonb_build_object('nome','TSH','valor', 3.1, 'unidade','µUI/mL','ref_min',0.4,'ref_max',4.5),
        jsonb_build_object('nome','Vitamina D (25-OH)','valor', 27, 'unidade','ng/mL','ref_min',30,'ref_max',100),
        jsonb_build_object('nome','Ferritina','valor', 38, 'unidade','ng/mL','ref_min',15,'ref_max',150),
        jsonb_build_object('nome','Triglicerídeos','valor', 142, 'unidade','mg/dL','ref_min',0,'ref_max',150),
        jsonb_build_object('nome','HDL','valor', 46, 'unidade','mg/dL','ref_min',40,'ref_max',120),
        jsonb_build_object('nome','PCR ultrassensível','valor', 2.4, 'unidade','mg/L','ref_min',0,'ref_max',3)
      )
    );

    -- ---- rastreamento metabólico ----
    insert into public.rastreamento_metabolico (
      user_id, patient_id, data, respostas, pontuacao_sistemas, pontuacao_total
    ) values (
      uid, pid, (hoje - 88)::date,
      jsonb_build_object('energia_1',3,'energia_2',3,'digest_1',2,'emocional_1',3,'sono_1',2,'peso_1',3,'hormonal_1',3,'pele_2',2),
      jsonb_build_object('Energia',6,'Digestivo',4,'Emocional',7,'Sono',2,'Peso e apetite',5,'Hormonal',3,'Pele e anexos',3),
      30
    );

    -- ---- Raio-X das últimas 6 semanas ----
    for i in 0..5 loop
      insert into public.raio_x_semanal (user_id, patient_id, semana_ref, respostas, peso, adesao_pct) values (
        uid, pid, (hoje - (i * 7))::date,
        jsonb_build_object(
          'adesao', 6 + ((i + p.idade) % 4),
          'fome', case when i % 3 = 0 then 'Controlada' else 'Oscilou' end,
          'intestino', 'Normal',
          'energia', 6 + (i % 4),
          'sono', 5 + (i % 5),
          'treinos', 2 + (i % 3),
          'dificuldade', 'Jantar tarde depois do trabalho.',
          'vitoria', 'Consegui manter o café da manhã com proteína todos os dias.'
        ),
        round(peso_base - (5 - i) * 0.5, 1),
        (6 + ((i + p.idade) % 4)) * 10
      );
    end loop;

    -- ---- resumo de consulta ----
    insert into public.resumos_consulta (user_id, patient_id, data, titulo, anotacoes) values (
      uid, pid, (hoje - 30)::date, 'Retorno do 2º mês',
      'Paciente relata mais saciedade e menos beliscos à noite. Cintura caiu 2 cm desde a última avaliação. ' ||
      'Ajustamos a distribuição de proteína no café da manhã e combinamos treino de força 3x na semana.'
    );

    -- ---- jornada: 3 meses, com o passado já concluído ----
    for m in 1..3 loop
      for s in 1..4 loop
        insert into public.jornada (user_id, patient_id, mes, semana, titulo, tipo, data_prevista, concluida, ordem)
        values (
          uid, pid, m, s,
          case s
            when 1 then 'Check-in da semana'
            when 2 then 'Raio-X semanal'
            when 3 then 'Envio de material educativo'
            else case when m = 3 then 'Conversa de renovação' else 'Consulta de retorno' end
          end,
          case s when 1 then 'contato' when 2 then 'raio_x' when 3 then 'envio_material' else 'retorno' end,
          (hoje - 90 + ((m - 1) * 28) + (s * 7))::date,
          (hoje - 90 + ((m - 1) * 28) + (s * 7)) < hoje,
          (m - 1) * 4 + s
        );
      end loop;
    end loop;
  end loop;

  -- ================= leads =================
  for p in select * from jsonb_to_recordset(leads_demo)
      as x(nome text, status text, temp text, origem text, valor numeric, dias int, acao text)
  loop
    insert into public.leads (
      user_id, nome, telefone, email, cidade, instagram, origem, status, temperatura,
      valor_potencial, servico_id, data_consulta, proxima_acao, proxima_acao_data,
      tags, observacoes, created_at, em_recuperacao, motivo_perda
    ) values (
      uid, p.nome,
      '11' || lpad((90000000 + (random() * 9999999)::int)::text, 8, '0'),
      lower(translate(split_part(p.nome, ' ', 1), 'áàãâéêíóôõúçÁÀÃÂÉÊÍÓÔÕÚÇ', 'aaaaeeioooucAAAAEEIOOOUC')) || '@email.com',
      'São Paulo',
      '@' || lower(translate(replace(p.nome, ' ', '.'), 'áàãâéêíóôõúçÁÀÃÂÉÊÍÓÔÕÚÇ', 'aaaaeeioooucAAAAEEIOOOUC')),
      'Demonstração', p.status, p.temp, p.valor,
      case when p.valor >= 1000 then premium_id else mensal_id end,
      case when p.status = 'agendado' then (now() + interval '2 days' + interval '15 hours') else null end,
      p.acao,
      case when p.acao is not null then (hoje + 2)::date else null end,
      case when p.valor >= 1000 then array['menopausa','premium'] else array['mensal'] end,
      'Lead de demonstração vindo de ' || p.origem || '.',
      now() - (p.dias || ' days')::interval,
      p.status = 'perdido',
      case when p.status = 'perdido' then 'Achou o valor alto neste momento' else null end
    );
    total := total + 1;
  end loop;

  -- ================= financeiro: 4 meses =================
  for i in 0..3 loop
    insert into public.receitas (user_id, descricao, valor, data_competencia, conta_id, plano_conta_id, origem_lead)
    values (
      uid, '[demo] Planos de acompanhamento — ' || to_char(hoje - (i || ' months')::interval, 'MM/YYYY'),
      9800 - i * 1100, date_trunc('month', hoje - (i || ' months')::interval)::date + 4,
      conta_id, conta_receita, 'Instagram'
    ) returning id into rid;

    insert into public.lancamentos (user_id, tipo, descricao, valor, vencimento, pago, data_pagamento, receita_id, conta_id)
    values (
      uid, 'receber', '[demo] Planos de acompanhamento — ' || to_char(hoje - (i || ' months')::interval, 'MM/YYYY'),
      9800 - i * 1100, date_trunc('month', hoje - (i || ' months')::interval)::date + 9,
      i > 0, case when i > 0 then date_trunc('month', hoje - (i || ' months')::interval)::date + 9 else null end,
      rid, conta_id
    );

    insert into public.despesas (user_id, descricao, valor, data_competencia, conta_id, plano_conta_id, fornecedor)
    values (uid, '[demo] Tráfego pago e criativos', 1800, date_trunc('month', hoje - (i || ' months')::interval)::date + 2, conta_id, conta_despesa, 'Agência');

    insert into public.despesas (user_id, descricao, valor, data_competencia, conta_id, plano_conta_id, fornecedor)
    values (uid, '[demo] Softwares e assinaturas', 420, date_trunc('month', hoje - (i || ' months')::interval)::date + 6, conta_id, conta_despesa, 'Diversos');
  end loop;

  insert into public.metas_financeiras (user_id, mes_ref, meta_receita, meta_pacientes, dias_uteis)
  values (uid, date_trunc('month', hoje)::date, 14000, 6, 21)
  on conflict (user_id, mes_ref) do update set meta_receita = excluded.meta_receita;

  -- ================= agenda da semana =================
  insert into public.agenda_tasks (user_id, titulo, descricao, tipo, data, hora, patient_id)
  select uid, '[demo] Consulta — ' || nome, 'Retorno do mês', 'consulta', (hoje + (row_number() over (order by nome))::int % 5), '15:00',
         id
  from public.patients where user_id = uid and origem = 'Demonstração' and status = 'ativo' limit 4;

  insert into public.agenda_tasks (user_id, titulo, tipo, data, concluida) values
    (uid, '[demo] Gravar conteúdo sobre proteína na menopausa', 'tarefa', hoje, false),
    (uid, '[demo] Revisar planos que vencem esta semana', 'lembrete', hoje, false),
    (uid, '[demo] Responder leads do Instagram', 'contato', hoje - 1, false),
    (uid, '[demo] Enviar material da semana', 'envio_material', hoje - 2, true);

  return format('Demonstração criada: %s registros principais, com histórico de 3 meses.', total);
end;
$$;

grant execute on function public.seed_demo() to authenticated;
grant execute on function public.limpar_demo() to authenticated;
