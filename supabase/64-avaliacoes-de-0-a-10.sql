-- 64. Todas as notas das avaliações de 0 a 10 (pedido da Juliana, 03/11/2026: havia dois jeitos, 0 a 10 e 1 a 5).
-- Passam para 0 a 10: aula, conteúdo, ferramentas e a nota de cada mentor (avaliação das turmas, que eram carinhas de 1 a 5)
-- e a nota que o mentorado dá para cada sessão (estrelas de 1 a 5). Nota geral e recomendação já eram de 0 a 10: não mudam.
-- Como converte as respostas que já existem:
--   - de 1 a 5 → dobra (1 → 2, 3 → 6, 4 → 8, 5 → 10);
--   - histórico do Google Forms: conteúdo, ferramentas e nota do mentor tinham sido divididos por 2 (a pergunta antiga era de 1 a 10);
--     voltam para a nota original, que ficou guardada (relevância, materiais e didática). Se a original não bater, dobra.
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo: não converte duas vezes.

do $$
declare c record; n_av int; n_ment int; n_sess int;
begin
  if exists (select 1 from configuracoes where chave = 'avaliacoes_escala' and (valor->>'escala')::int = 10) then
    raise notice 'As avaliações já estavam de 0 a 10. Nada foi mudado.';
    return;
  end if;

  -- 1. tira as regras antigas de 1 a 5
  for c in select conrelid::regclass as tabela, conname from pg_constraint
            where contype = 'c' and (
              (conrelid = 'public.avaliacoes'::regclass and pg_get_constraintdef(oid) ~* '(aula|conteudo|ferramentas)')
              or (conrelid = 'public.avaliacao_mentores'::regclass and pg_get_constraintdef(oid) ~* 'nota')
              or (conrelid = 'public.avaliacoes_sessao'::regclass and pg_get_constraintdef(oid) ~* 'nota')) loop
    execute format('alter table %s drop constraint %I', c.tabela, c.conname);
  end loop;

  -- 2. avaliação das turmas: aula, conteúdo e ferramentas
  update avaliacoes a set
    aula = a.aula * 2,
    conteudo = case
      when a.origem = 'google_forms' and a.extras->'escala_antiga'->>'relevancia' ~ '^[0-9]+(\.[0-9]+)?$'
        and ceil(round((a.extras->'escala_antiga'->>'relevancia')::numeric) / 2.0) = a.conteudo
        then least(10, round((a.extras->'escala_antiga'->>'relevancia')::numeric))::int
      else a.conteudo * 2 end,
    ferramentas = case
      when a.origem = 'google_forms' and a.extras->'escala_antiga'->>'materiais' ~ '^[0-9]+(\.[0-9]+)?$'
        and ceil(round((a.extras->'escala_antiga'->>'materiais')::numeric) / 2.0) = a.ferramentas
        then least(10, round((a.extras->'escala_antiga'->>'materiais')::numeric))::int
      else a.ferramentas * 2 end
  where a.aula is not null or a.conteudo is not null or a.ferramentas is not null;
  get diagnostics n_av = row_count;

  -- 3. nota de cada mentor: no histórico do Forms, a didática original (da planilha de mentores ou da resposta); senão dobra
  update avaliacao_mentores am set nota = coalesce((
      select least(10, round(o.d))::int
        from (select (m->>'didatica')::numeric as d, 1 as ordem
                from avaliacoes a cross join lateral jsonb_array_elements(coalesce(a.extras->'planilha_mentores'->'mentores', '[]'::jsonb)) m
               where a.id = am.avaliacao_id and a.origem = 'google_forms' and m->>'perfil_id' = am.mentor_id::text
                 and m->>'didatica' ~ '^[0-9]+(\.[0-9]+)?$'
              union all
              select (a.extras->'escala_antiga'->>'didatica')::numeric, 2
                from avaliacoes a
               where a.id = am.avaliacao_id and a.origem = 'google_forms' and a.extras->'escala_antiga'->>'didatica' ~ '^[0-9]+(\.[0-9]+)?$') o
       where ceil(round(o.d) / 2.0) = am.nota
       order by o.ordem limit 1),
    am.nota * 2);
  get diagnostics n_ment = row_count;

  -- 4. nota da sessão dada pelo mentorado
  update avaliacoes_sessao set nota = nota * 2;
  get diagnostics n_sess = row_count;

  -- 5. as regras novas: tudo de 0 a 10
  alter table avaliacoes add constraint avaliacoes_aula_check check (aula between 0 and 10);
  alter table avaliacoes add constraint avaliacoes_conteudo_check check (conteudo between 0 and 10);
  alter table avaliacoes add constraint avaliacoes_ferramentas_check check (ferramentas between 0 and 10);
  alter table avaliacao_mentores add constraint avaliacao_mentores_nota_check check (nota between 0 and 10);
  alter table avaliacoes_sessao add constraint avaliacoes_sessao_nota_check check (nota between 0 and 10);

  -- 6. marca que já converteu (a plataforma lê isto)
  insert into configuracoes (chave, valor, atualizado_em) values ('avaliacoes_escala', jsonb_build_object('escala', 10, 'em', now()), now())
  on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();

  raise notice 'Pronto: % avaliações de turma, % notas de mentor e % notas de sessão passaram para 0 a 10.', n_av, n_ment, n_sess;
end $$;

-- conferência: tudo deve ficar entre 0 e 10
select 'aula' as nota, min(aula), max(aula), round(avg(aula), 1) as media, count(aula) as respostas from avaliacoes
union all select 'conteúdo', min(conteudo), max(conteudo), round(avg(conteudo), 1), count(conteudo) from avaliacoes
union all select 'ferramentas', min(ferramentas), max(ferramentas), round(avg(ferramentas), 1), count(ferramentas) from avaliacoes
union all select 'mentor', min(nota), max(nota), round(avg(nota), 1), count(*) from avaliacao_mentores
union all select 'sessão (mentorado)', min(nota), max(nota), round(avg(nota), 1), count(*) from avaliacoes_sessao
union all select 'nota geral', min(geral), max(geral), round(avg(geral), 1), count(geral) from avaliacoes
union all select 'recomendação', min(nps), max(nps), round(avg(nps), 1), count(nps) from avaliacoes;
