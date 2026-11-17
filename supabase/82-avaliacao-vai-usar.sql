-- 82 · Avaliação das turmas: a pergunta "Quanto você aprendeu de novo hoje?" (Quase nada, Um pouco, Bastante, Muito) sai
-- e entra "Quanto do encontro de hoje você vai usar no trabalho?" (Nada, Uma ou outra coisa, Boa parte, Quase tudo).
-- Pedido da Juliana, 16/11/2026: "Bastante" e "Muito" quase não se distinguem (267 das 294 respostas caíram nos dois).
-- A coluna antiga `aprendeu` fica como está, com as respostas até 16/11/2026 (histórico); as novas vão para `aplicar`.
-- Pode rodar de novo sem problema.

alter table public.avaliacoes add column if not exists aplicar text;
do $$ begin
  alter table public.avaliacoes add constraint avaliacoes_aplicar_check
    check (aplicar in ('nada', 'uma_ou_outra', 'boa_parte', 'quase_tudo'));
exception when duplicate_object then null; end $$;
comment on column public.avaliacoes.aplicar is 'Quanto do encontro a pessoa vai usar no trabalho (desde 16/11/2026). Substitui "aprendeu", que fica só no histórico.';

-- Painel → Mentoria em grupo: o número novo "vão usar boa parte ou quase tudo no trabalho" (aplicar_*), sem tirar os antigos.
create or replace function public.numeros_trilhas(p_empresa uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not eh_admin() then raise exception 'Só a administração vê estes números.'; end if;
  return (
    with t as (select * from turmas where p_empresa is null or empresa_id = p_empresa),
    m as (select m.* from modulos m join t on t.id = m.turma_id),
    a as (select a.* from turma_alunos a join t on t.id = a.turma_id where a.ativo),
    p as (select p.* from presencas p join a on a.id = p.turma_aluno_id),
    fa as (select a.id, a.turma_id, count(p.turma_aluno_id) filter (where p.presente) as pres, count(p.turma_aluno_id) as tot
           from a left join presencas p on p.turma_aluno_id = a.id group by a.id, a.turma_id),
    v as (select v.* from avaliacoes v where p_empresa is null or v.empresa_id = p_empresa or v.turma_id in (select id from t)),
    e as (select e.* from entregas e join a on a.id = e.turma_aluno_id)
    select jsonb_build_object(
      'turmas', (select count(*) from t),
      'turmas_andamento', (select count(*) from t where status = 'em_andamento'),
      'turmas_concluidas', (select count(*) from t where status = 'concluida'),
      'modulos', (select count(*) from m),
      'modulos_realizados', (select count(*) from m where m.data_hora + make_interval(mins => coalesce(m.duracao_min, 180)) <= now()),
      'modulos_chamada', (select count(distinct modulo_id) from p),
      'alunos', (select count(*) from a),
      'alunos_entraram', (select count(*) from a join perfis pf on pf.id = a.perfil_id where pf.termo_aceito_em is not null),
      'presencas', (select count(*) from p where presente),
      'faltas', (select count(*) from p where not presente),
      'freq_media', (select round(avg(100.0 * pres / tot)) from fa where tot > 0),
      'concluintes_base', (select count(*) from fa join t on t.id = fa.turma_id where t.status = 'concluida' and fa.tot > 0),
      'concluintes', (select count(*) from fa join t on t.id = fa.turma_id where t.status = 'concluida' and fa.tot > 0 and 100.0 * fa.pres / fa.tot >= 75),
      'avaliacoes', (select count(*) from v),
      'nota', (select round(avg(geral)::numeric, 1) from v where geral is not null),
      'nps_n', (select count(nps) from v),
      'promotores', (select count(*) from v where nps >= 9),
      'detratores', (select count(*) from v where nps <= 6),
      'aprendeu_n', (select count(aprendeu) from v),
      'aprendeu_bastante', (select count(*) from v where aprendeu in ('bastante', 'muito')),
      'aplicar_n', (select count(aplicar) from v),
      'aplicar_boa_parte', (select count(*) from v where aplicar in ('boa_parte', 'quase_tudo')),
      'certificados', (select count(*) from cert_certificados c join cert_pastas cp on cp.id = c.pasta_id
                       where c.status = 'valido' and (p_empresa is null or cp.empresa_id = p_empresa)),
      'envios', (select count(*) from e),
      'envios_respondidos', (select count(*) from e where retorno is not null),
      'envios_sem_abrir', (select count(*) from e where visto_em is null),
      'gravacoes', (select count(*) from gravacoes g join m on m.id = g.modulo_id where not g.ignorada)
    ));
end $$;

-- Conferir: deve mostrar a coluna nova e o número novo do Painel (0 até chegarem respostas).
select (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'avaliacoes' and column_name = 'aplicar') as coluna_aplicar,
       (select count(*) from avaliacoes where aplicar is not null) as respostas_novas;
