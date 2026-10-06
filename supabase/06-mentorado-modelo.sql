-- Mentorado modelo, para testar a navegação como mentorado.
-- Cria a empresa "Empresa Modelo (teste)", um programa de 4 sessões e o mentorado "Mentorado Modelo",
-- com a Juliana como mentora, uma sessão já concluída (resumo e tarefa), a próxima marcada e duas ferramentas enviadas.
-- O acesso (e-mail judforesti+mentorado@gmail.com) é criado depois, pelo botão "Enviar convite de acesso" da ficha.
-- Para apagar tudo depois: veja o bloco comentado no fim deste arquivo.

do $$
declare
  v_mentora uuid;
  v_empresa uuid;
  v_programa uuid;
  v_mentorado uuid;
  v_s1 uuid;
begin
  select id into v_mentora from perfis where lower(email) = 'judforesti@gmail.com';
  if v_mentora is null then raise exception 'Perfil da Juliana não encontrado.'; end if;

  insert into empresas (nome) values ('Empresa Modelo (teste)') returning id into v_empresa;
  insert into programas (empresa_id, nome, sessoes_por_mentorado, frequencia, duracao_min, inicio, fim_previsto, status)
  values (v_empresa, 'Programa de teste', 4, 'semanal', 50, current_date - 7, current_date + 28, 'em_andamento')
  returning id into v_programa;

  insert into mentorados (programa_id, nome, email, cargo, tempo_de_casa, pessoas_no_time, gestor_direto, objetivo_principal, pontos_desenvolver)
  values (v_programa, 'Mentorado Modelo', 'judforesti+mentorado@gmail.com', 'Coordenador de Produção', '3 anos', 8, 'Gerente Industrial',
          'Delegar mais e sair do operacional, para ter tempo de cuidar da equipe.',
          '[{"ponto":"Delegação"},{"ponto":"Feedback"}]'::jsonb)
  returning id into v_mentorado;
  insert into mentor_mentorado (mentorado_id, mentor_id, ordem) values (v_mentorado, v_mentora, 1);

  -- sessão 1: já concluída, com resumo para o mentorado e tarefa
  insert into sessoes (mentorado_id, numero, mentor_id, data_hora, tema, situacao, duracao_min, resumo_mentorado, tarefa, tarefa_prazo, concluida_em, concluida_por)
  values (v_mentorado, 1, v_mentora, now() - interval '7 days', 'Contrato de mentoria e diagnóstico', 'realizada', 50,
          'Nesta primeira sessão você contou como está a sua rotina: muito tempo apagando incêndios e pouco tempo para a equipe. Combinamos que o foco da mentoria será delegar com critério e dar retornos mais frequentes ao time.' || chr(10) || chr(10) ||
          'A principal percepção foi que muitas tarefas voltam para você porque não ficou claro o que é "pronto". Até a próxima sessão, você vai experimentar delegar uma tarefa com combinado de entrega.',
          'Escolher uma tarefa que hoje só você faz e delegar para alguém do time, combinando o que é "pronto" e quando vocês vão conversar.',
          current_date + 3, now() - interval '7 days', v_mentora)
  returning id into v_s1;
  insert into sessoes_interno (sessao_id, resumo_mentor, notas_evolucao)
  values (v_s1, 'Sessão de exemplo para teste da plataforma.', '{"Delegação": 2, "Feedback": 2}'::jsonb);

  -- sessões 2 a 4: agendadas
  insert into sessoes (mentorado_id, numero, mentor_id, data_hora, tema)
  values (v_mentorado, 2, v_mentora, date_trunc('day', now()) + interval '7 days' + interval '12 hours', 'Delegação'),
         (v_mentorado, 3, v_mentora, date_trunc('day', now()) + interval '14 days' + interval '12 hours', 'Feedback'),
         (v_mentorado, 4, v_mentora, date_trunc('day', now()) + interval '21 days' + interval '12 hours', 'Fechamento e próximos passos');
  insert into sessoes_interno (sessao_id)
  select id from sessoes where mentorado_id = v_mentorado and numero > 1;

  -- ferramentas enviadas: a Roda do Comunicador (online) e uma ferramenta em PDF
  insert into ferramentas_enviadas (mentorado_id, ferramenta_id, sessao_id, enviado_por)
  select v_mentorado, id, v_s1, v_mentora from ferramentas where id = 'MNT-COM-06';
  insert into ferramentas_enviadas (mentorado_id, ferramenta_id, sessao_id, enviado_por)
  select v_mentorado, id, v_s1, v_mentora from ferramentas where arquivo is not null order by numero limit 1;
end $$;

-- Para apagar o mentorado modelo depois (rode só estas linhas, sem os dois traços do começo):
-- delete from ferramentas_enviadas where mentorado_id in (select id from mentorados where nome = 'Mentorado Modelo');
-- delete from testes where mentorado_id in (select id from mentorados where nome = 'Mentorado Modelo');
-- delete from convites where email = 'judforesti+mentorado@gmail.com';
-- delete from mentorados where nome = 'Mentorado Modelo';
-- delete from programas where nome = 'Programa de teste';
-- delete from empresas where nome = 'Empresa Modelo (teste)';
