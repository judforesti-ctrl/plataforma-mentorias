-- Gravações direto da nuvem do Zoom (pedido da Juliana em 27/10/2026): as aulas ficam gravadas no Zoom, com link e senha.
-- A plataforma lê as contas do Zoom ligadas (de hora em hora), acha a aula pela data e hora e guarda o link e a senha.
-- O aluno vê "Assistir à gravação" (a senha já vai dentro do link) e, por garantia, a senha com o botão Copiar.
-- Precisa do script 44. Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema.

-- 1. De onde veio a gravação, o código da reunião gravada no Zoom e a senha para assistir
alter table public.gravacoes add column if not exists origem text;
alter table public.gravacoes add column if not exists zoom_id text unique;     -- código da gravação no Zoom (nunca repete)
alter table public.gravacoes add column if not exists senha text;               -- senha da gravação (o aluno vê com "Copiar")
update public.gravacoes set origem = case when drive_id is not null then 'drive' else 'manual' end where origem is null;

-- 2. A área do aluno passa a receber a senha de cada gravação
create or replace function public.minhas_trilhas() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'nome', t.nome, 'empresa', e.nome, 'marca', e.marca, 'inicio', t.inicio, 'fim', t.fim_previsto, 'status', t.status,
    'modulos', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id, 'numero', m.numero, 'titulo', m.titulo, 'data_hora', m.data_hora, 'duracao_min', m.duracao_min, 'formato', m.formato,
        'link', case when m.formato = 'presencial' then null else m.link end,
        'local', case when m.formato = 'presencial' then m.local end,
        'mentores', (select coalesce(jsonb_agg(jsonb_build_object('nome', p.nome, 'foto_url', p.foto_url) order by p.nome), '[]'::jsonb)
                     from modulo_mentores mm join perfis p on p.id = mm.mentor_id where mm.modulo_id = m.id),
        'arquivos', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'tipo', a.tipo, 'nome', a.nome, 'caminho', a.caminho,
                       'tamanho', a.tamanho, 'enviado_em', a.enviado_em) order by a.enviado_em), '[]'::jsonb)
                     from modulo_arquivos a where a.modulo_id = m.id and a.tipo in ('aluno', 'tarefa')),
        'gravacoes', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'nome', g.nome, 'link', g.link, 'gravada_em', g.gravada_em,
                       'duracao_min', g.duracao_min, 'senha', g.senha) order by g.gravada_em nulls last, g.criado_em), '[]'::jsonb)
                     from gravacoes g where g.modulo_id = m.id and not g.ignorada)
      ) order by m.numero), '[]'::jsonb) from modulos m where m.turma_id = t.id)
  ) order by t.inicio desc nulls last), '[]'::jsonb)
  from turmas t join empresas e on e.id = t.empresa_id
  where exists (select 1 from turma_alunos a where a.turma_id = t.id and a.perfil_id = auth.uid() and a.ativo);
$$;
revoke all on function public.minhas_trilhas() from anon;
