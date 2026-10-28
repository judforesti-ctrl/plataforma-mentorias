-- Avaliações feitas em FICHA DE PAPEL (quando a turma não consegue usar o QR code). A equipe tabula as fichas numa planilha e
-- elas entram aqui com origem 'papel', ligadas ao módulo, para contar nos relatórios (Gestão › Avaliações e no módulo).
-- Continua anônimo: nenhum nome de aluno é gravado (o nome escrito numa ficha foi tirado).
-- Como a ficha de papel tem outras perguntas, as notas foram convertidas assim (Muito satisfeito 5, Satisfeito 4, Normal 3,
-- Pouco satisfeito 2, Insatisfeito 1; marcação dupla não conta; média arredondada):
--   nota geral (0 a 10)  = "Nota geral" da ficha
--   nota da mentora      = média de Conhecimento do assunto, Esclarecimento de dúvidas, Linguagem clara e objetiva e Relacionamento
--   conteúdo             = média de Conteúdo, Qualidade do assunto e Assuntos práticos
--   aula (ritmo)         = média de Qualidade da apresentação e Tempo de duração
--   comentário           = Pontos positivos + Pontos a melhorar + Comentários e sugestões
--   Ferramentas e recomendação (NPS) não existem na ficha: ficam vazias. Cada critério original fica guardado em extras.
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo: não repete nada.

-- 1. a origem 'papel' passa a valer
do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'public.avaliacoes'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%origem%' loop
    execute format('alter table public.avaliacoes drop constraint %I', c.conname);
  end loop;
  alter table public.avaliacoes add constraint avaliacoes_origem_check check (origem in ('plataforma', 'google_forms', 'papel'));
end $$;

-- 2. Cresol Amazônia · Formação Ativa Idade · 26/10/2026 · Viviane (11 fichas)
do $$
declare
  v_mod uuid; v_turma uuid; v_empresa uuid; v_quando timestamptz; v_mentor uuid; v_qtd int; v_lista text;
  r record; v_id uuid;
begin
  if exists (select 1 from avaliacoes where extras->>'lote' = 'papel-ativa-idade-2026-10-26') then
    raise notice 'Estas 11 avaliações já tinham entrado. Nada foi repetido.';
    return;
  end if;

  -- o módulo: Cresol, "Ativa Idade" no nome do módulo ou da turma, no dia das fichas (26/10/2026, horário de Brasília).
  -- Se houver mais de um nesse dia (várias cidades), fica o que tem a Viviane.
  select count(*) into v_qtd from modulos m join turmas t on t.id = m.turma_id left join empresas e on e.id = t.empresa_id
   where (m.data_hora at time zone 'America/Sao_Paulo')::date = date '2026-10-26'
     and (e.nome ilike '%cresol%' or t.nome ilike '%cresol%')
     and (m.titulo ilike '%ativa%idade%' or t.nome ilike '%ativa%idade%');
  if v_qtd > 1 then
    select count(*) into v_qtd from modulos m join turmas t on t.id = m.turma_id left join empresas e on e.id = t.empresa_id
     where (m.data_hora at time zone 'America/Sao_Paulo')::date = date '2026-10-26'
       and (e.nome ilike '%cresol%' or t.nome ilike '%cresol%')
       and (m.titulo ilike '%ativa%idade%' or t.nome ilike '%ativa%idade%')
       and exists (select 1 from modulo_mentores mm join perfis p on p.id = mm.mentor_id where mm.modulo_id = m.id and p.nome ilike 'viviane%');
    if v_qtd = 1 then
      select m.id, m.turma_id, t.empresa_id, m.data_hora into v_mod, v_turma, v_empresa, v_quando
        from modulos m join turmas t on t.id = m.turma_id left join empresas e on e.id = t.empresa_id
       where (m.data_hora at time zone 'America/Sao_Paulo')::date = date '2026-10-26'
         and (e.nome ilike '%cresol%' or t.nome ilike '%cresol%')
         and (m.titulo ilike '%ativa%idade%' or t.nome ilike '%ativa%idade%')
         and exists (select 1 from modulo_mentores mm join perfis p on p.id = mm.mentor_id where mm.modulo_id = m.id and p.nome ilike 'viviane%');
    end if;
  elsif v_qtd = 1 then
    select m.id, m.turma_id, t.empresa_id, m.data_hora into v_mod, v_turma, v_empresa, v_quando
      from modulos m join turmas t on t.id = m.turma_id left join empresas e on e.id = t.empresa_id
     where (m.data_hora at time zone 'America/Sao_Paulo')::date = date '2026-10-26'
       and (e.nome ilike '%cresol%' or t.nome ilike '%cresol%')
       and (m.titulo ilike '%ativa%idade%' or t.nome ilike '%ativa%idade%');
  end if;
  if v_mod is null then
    select string_agg(format('%s · %s · %s · Módulo %s · %s', to_char(m.data_hora at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'), e.nome, t.nome, m.numero, m.titulo), ' | ')
      into v_lista
      from modulos m join turmas t on t.id = m.turma_id left join empresas e on e.id = t.empresa_id
     where (m.data_hora at time zone 'America/Sao_Paulo')::date between date '2026-10-25' and date '2026-10-27'
       and (e.nome ilike '%cresol%' or t.nome ilike '%cresol%');
    raise exception 'NÃO ACHEI um módulo só da Cresol (Ativa Idade) no dia 26/10/2026. Nada foi gravado. Módulos da Cresol de 25 a 27/10: %',
      coalesce(v_lista, 'nenhum');
  end if;

  -- a mentora: a Viviane do módulo (ou, se ela não estiver no módulo, a Viviane do cadastro)
  select mm.mentor_id into v_mentor from modulo_mentores mm join perfis p on p.id = mm.mentor_id
   where mm.modulo_id = v_mod and p.nome ilike 'viviane%' limit 1;
  if v_mentor is null then
    select count(*) into v_qtd from perfis where nome ilike 'viviane%' and nome not ilike '%modelo%';
    if v_qtd = 1 then select id into v_mentor from perfis where nome ilike 'viviane%' and nome not ilike '%modelo%'; end if;
  end if;

  for r in select * from (values
      (10, 5, 5, 5, 'Pontos positivos: Os conteúdos didáticos e dinâmicos.
Pontos a melhorar: Nenhum.
Comentários e sugestões: Ter mais vezes uma agência (?).', '{"origem": "ficha de papel", "lote": "papel-ativa-idade-2026-10-26", "ficha": 1, "programa": "Formação Ativa Idade", "cooperativa": "Cresol Amazônia", "instrutora": "Viviane Sotoriva Cappellesso", "criterios_1a5": {"conhecimento": 5, "esclarecimento": 5, "linguagem": 5, "relacionamento": 5, "conteudo": 5, "qualidade_assunto": 5, "qualidade_apresentacao": 5, "assuntos_praticos": 5, "local": 5, "assistencia_equipe": 5, "tempo_duracao": 5}, "fotos": ["IMG_9632.jpeg", "IMG_9631.jpeg"]}'::jsonb),
      (10, 5, 5, 5, 'Pontos positivos: Foi incrível estar com vocês hoje. Interação, troca de ideias, dinâmica, lanche, encontro com amigos e conhecer pessoas.', '{"origem": "ficha de papel", "lote": "papel-ativa-idade-2026-10-26", "ficha": 2, "programa": "Formação Ativa Idade", "cooperativa": "Cresol Amazônia", "instrutora": "Viviane Sotoriva Cappellesso", "criterios_1a5": {"conhecimento": 5, "esclarecimento": 5, "linguagem": 5, "relacionamento": 5, "conteudo": 5, "qualidade_assunto": 5, "qualidade_apresentacao": 5, "assuntos_praticos": 5, "local": 5, "assistencia_equipe": 5, "tempo_duracao": 5}, "fotos": ["IMG_9630.jpeg", "IMG_9629.jpeg"]}'::jsonb),
      (10, 4, 4, 3, 'Pontos positivos: Muito bom.
Pontos a melhorar: Foi ótimo.', '{"origem": "ficha de papel", "lote": "papel-ativa-idade-2026-10-26", "ficha": 3, "programa": "Formação Ativa Idade", "cooperativa": "Cresol Amazônia", "instrutora": "Viviane Sotoriva Cappellesso", "criterios_1a5": {"conhecimento": null, "esclarecimento": 4, "linguagem": 3, "relacionamento": 3, "conteudo": 5, "qualidade_assunto": 5, "qualidade_apresentacao": 4, "assuntos_praticos": 3, "local": 5, "assistencia_equipe": 5, "tempo_duracao": 4}, "fotos": ["IMG_9628.jpeg", "IMG_9627.jpeg"], "conferencia": "Marcação dupla em \"Conhecimento do assunto\" (não contada)."}'::jsonb),
      (10, 5, 5, 5, 'Pontos positivos: Assuntos, dinâmicas...
Pontos a melhorar: Continuar com as formações.
Comentários e sugestões: Gratidão por tudo.', '{"origem": "ficha de papel", "lote": "papel-ativa-idade-2026-10-26", "ficha": 4, "programa": "Formação Ativa Idade", "cooperativa": "Cresol Amazônia", "instrutora": "Viviane Sotoriva Cappellesso", "criterios_1a5": {"conhecimento": 5, "esclarecimento": 5, "linguagem": 5, "relacionamento": 5, "conteudo": 5, "qualidade_assunto": 5, "qualidade_apresentacao": 5, "assuntos_praticos": 5, "local": 5, "assistencia_equipe": 5, "tempo_duracao": 5}, "fotos": ["IMG_9626.jpeg", "IMG_9625.jpeg"]}'::jsonb),
      (10, 5, 5, 5, 'Pontos positivos: Esclarecimento de todos os assuntos.
Pontos a melhorar: Sim, sempre pode melhorar.
Comentários e sugestões: Gostei muito da palestra, aprendendo coisas novas, é bom.', '{"origem": "ficha de papel", "lote": "papel-ativa-idade-2026-10-26", "ficha": 5, "programa": "Formação Ativa Idade", "cooperativa": "Cresol Amazônia", "instrutora": "Viviane Sotoriva Cappellesso", "criterios_1a5": {"conhecimento": 5, "esclarecimento": 4, "linguagem": 5, "relacionamento": 5, "conteudo": 5, "qualidade_assunto": 5, "qualidade_apresentacao": 5, "assuntos_praticos": 5, "local": 5, "assistencia_equipe": 5, "tempo_duracao": 4}, "fotos": ["IMG_9624.jpeg", "IMG_9623.jpeg"]}'::jsonb),
      (10, 5, 5, 5, 'Pontos positivos: Experiência de cada um dos participantes.
Pontos a melhorar: Tudo OK.', '{"origem": "ficha de papel", "lote": "papel-ativa-idade-2026-10-26", "ficha": 6, "programa": "Formação Ativa Idade", "cooperativa": "Cresol Amazônia", "instrutora": "Viviane Sotoriva Cappellesso", "criterios_1a5": {"conhecimento": 5, "esclarecimento": 5, "linguagem": 5, "relacionamento": 5, "conteudo": 5, "qualidade_assunto": 5, "qualidade_apresentacao": 5, "assuntos_praticos": 5, "local": 5, "assistencia_equipe": 5, "tempo_duracao": 5}, "fotos": ["IMG_9622.jpeg", "IMG_9621.jpeg"]}'::jsonb),
      (10, 5, 5, 5, 'Pontos positivos: Todos.
Pontos a melhorar: Continuar com as formações.', '{"origem": "ficha de papel", "lote": "papel-ativa-idade-2026-10-26", "ficha": 7, "programa": "Formação Ativa Idade", "cooperativa": "Cresol Amazônia", "instrutora": "Viviane Sotoriva Cappellesso", "criterios_1a5": {"conhecimento": 4, "esclarecimento": 4, "linguagem": 5, "relacionamento": 5, "conteudo": 4, "qualidade_assunto": 5, "qualidade_apresentacao": 5, "assuntos_praticos": 5, "local": 4, "assistencia_equipe": 5, "tempo_duracao": 5}, "fotos": ["IMG_9620.jpeg", "IMG_9619.jpeg"]}'::jsonb),
      (10, 5, 5, 5, 'Pontos positivos: Todos os pontos foram positivos.
Pontos a melhorar: Dar continuidade nas formações.', '{"origem": "ficha de papel", "lote": "papel-ativa-idade-2026-10-26", "ficha": 8, "programa": "Formação Ativa Idade", "cooperativa": "Cresol Amazônia", "instrutora": "Viviane Sotoriva Cappellesso", "criterios_1a5": {"conhecimento": 5, "esclarecimento": 5, "linguagem": 5, "relacionamento": 5, "conteudo": 5, "qualidade_assunto": 5, "qualidade_apresentacao": 5, "assuntos_praticos": 5, "local": 5, "assistencia_equipe": 5, "tempo_duracao": 5}, "fotos": ["IMG_9618.jpeg", "IMG_9617.jpeg"]}'::jsonb),
      (10, 5, 5, 5, null, '{"origem": "ficha de papel", "lote": "papel-ativa-idade-2026-10-26", "ficha": 9, "programa": "Formação Ativa Idade", "cooperativa": "Cresol Amazônia", "instrutora": "Viviane Sotoriva Cappellesso", "criterios_1a5": {"conhecimento": 5, "esclarecimento": 4, "linguagem": 5, "relacionamento": 5, "conteudo": 4, "qualidade_assunto": 5, "qualidade_apresentacao": 5, "assuntos_praticos": 5, "local": 4, "assistencia_equipe": 5, "tempo_duracao": 5}, "fotos": ["IMG_9616.jpeg", "IMG_9615.jpeg"]}'::jsonb),
      (10, 5, 5, 5, null, '{"origem": "ficha de papel", "lote": "papel-ativa-idade-2026-10-26", "ficha": 10, "programa": "Formação Ativa Idade", "cooperativa": "Cresol Amazônia", "instrutora": "Viviane Sotoriva Cappellesso", "criterios_1a5": {"conhecimento": 5, "esclarecimento": 5, "linguagem": 5, "relacionamento": 5, "conteudo": 5, "qualidade_assunto": 5, "qualidade_apresentacao": 5, "assuntos_praticos": 5, "local": 5, "assistencia_equipe": 5, "tempo_duracao": 5}, "fotos": ["IMG_9614.jpeg", "IMG_9613.jpeg"]}'::jsonb),
      (9, 5, 5, 5, 'Pontos positivos: Participação do grupo no geral.
Pontos a melhorar: No geral, todos.
Comentários e sugestões: Maior tempo de duração dos assuntos.', '{"origem": "ficha de papel", "lote": "papel-ativa-idade-2026-10-26", "ficha": 11, "programa": "Formação Ativa Idade", "cooperativa": "Cresol Amazônia", "instrutora": "Viviane Sotoriva Cappellesso", "criterios_1a5": {"conhecimento": 5, "esclarecimento": 4, "linguagem": 5, "relacionamento": 4, "conteudo": 5, "qualidade_assunto": 5, "qualidade_apresentacao": 5, "assuntos_praticos": 4, "local": 5, "assistencia_equipe": 5, "tempo_duracao": 5}, "fotos": ["IMG_9611.jpeg", "IMG_9612.jpeg"]}'::jsonb)
    ) as x(geral, aula, conteudo, mentor, comentario, extras) loop
    insert into avaliacoes (modulo_id, turma_id, empresa_id, origem, geral, aula, conteudo, comentario, extras, criado_em)
    values (v_mod, v_turma, v_empresa, 'papel', r.geral, r.aula, r.conteudo, r.comentario, r.extras, coalesce(v_quando, now()))
    returning id into v_id;
    if v_mentor is not null and r.mentor is not null then
      insert into avaliacao_mentores (avaliacao_id, mentor_id, nota) values (v_id, v_mentor, r.mentor);
    end if;
  end loop;

  raise notice 'Pronto: 11 avaliações de papel gravadas no módulo %.', v_mod;
  if v_mentor is null then raise notice 'Atenção: não achei a Viviane no cadastro; as notas da mentora ficaram de fora.'; end if;
end $$;

-- 3. conferência: deve aparecer uma linha com 11 avaliações
select e.nome as empresa, t.nome as turma, m.numero as modulo, m.titulo, to_char(m.data_hora at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') as data,
       count(*) as avaliacoes, round(avg(a.geral), 1) as nota_geral
  from avaliacoes a join modulos m on m.id = a.modulo_id join turmas t on t.id = m.turma_id left join empresas e on e.id = t.empresa_id
 where a.extras->>'lote' = 'papel-ativa-idade-2026-10-26'
 group by 1, 2, 3, 4, 5;
