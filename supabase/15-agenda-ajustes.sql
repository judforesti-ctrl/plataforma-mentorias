-- Agenda, ajustes: cada turma diz se é online, presencial ou parte de cada (e a cidade das aulas presenciais);
-- o bloqueio do mentor tem um tipo (pessoal, tempo de criação, tempo operacional, reunião entre mentores ou outro).
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema.
begin;

alter table public.turmas add column if not exists formato text check (formato in ('online', 'presencial', 'misto'));
alter table public.turmas add column if not exists local text;

alter table public.agenda_bloqueios add column if not exists categoria text check (categoria in ('pessoal', 'criacao', 'operacional', 'reuniao', 'outro'));
alter table public.agenda_bloqueios add column if not exists categoria_texto text;   -- o que o mentor escreveu em "Outro"

-- Turmas que já existem: o formato vem dos módulos já cadastrados (todos presenciais, todos online ou mistura).
update public.turmas t set formato = x.f
from (select turma_id,
             case when bool_and(formato = 'presencial') then 'presencial'
                  when bool_and(formato <> 'presencial') then 'online'
                  else 'misto' end as f
      from public.modulos where formato <> 'indefinido' group by turma_id) x
where x.turma_id = t.id and t.formato is null;

notify pgrst, 'reload schema';
commit;
