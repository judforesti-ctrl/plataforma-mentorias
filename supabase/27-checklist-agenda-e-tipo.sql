-- Checklist: tipo da atividade (operacional, de gestão, estratégica) e como ela entra na agenda:
--   prazo     só o prazo de entrega aparece no dia (não ocupa o horário) — como era antes
--   bloqueio  ocupa o horário (início e fim) na agenda da plataforma de cada responsável
--   convite   ocupa o horário e manda convite da Google Agenda com sala do Meet para os responsáveis (e convidados de fora)
-- Precisa do script 25 (checklist). Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema.
begin;

alter table public.atividades add column if not exists categoria text;
alter table public.atividades drop constraint if exists atividades_categoria_check;
alter table public.atividades add constraint atividades_categoria_check check (categoria is null or categoria in ('operacional', 'gestao', 'estrategica'));

alter table public.atividades add column if not exists na_agenda text not null default 'prazo';
alter table public.atividades drop constraint if exists atividades_na_agenda_check;
alter table public.atividades add constraint atividades_na_agenda_check check (na_agenda in ('prazo', 'bloqueio', 'convite'));

alter table public.atividades add column if not exists hora_fim time;                         -- fim do horário (bloqueio e convite)
alter table public.atividades add column if not exists convidados text[] not null default '{}';  -- e-mails de fora (convite)
alter table public.atividades add column if not exists google_evento_id text;                  -- convite na Google Agenda conectada
alter table public.atividades add column if not exists meet_link text;
alter table public.atividades add column if not exists convite_enviado_em timestamptz;

create index if not exists atividades_categoria on public.atividades (categoria);

notify pgrst, 'reload schema';
commit;
