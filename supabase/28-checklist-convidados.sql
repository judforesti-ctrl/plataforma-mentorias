-- Checklist: convidados da atividade (bloqueio ou reunião com link).
--   participantes  pessoas da equipe convidadas (o horário entra na agenda delas e, na reunião, recebem o convite do Google)
--   externos       participantes de fora: [{ nome, email, whatsapp }] (e-mail recebe o convite do Google na reunião;
--                  WhatsApp recebe uma mensagem pronta pelo botão)
-- Quem é convidado da equipe também enxerga a atividade (para abrir pela agenda). Precisa dos scripts 25 e 27.
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema.
begin;

alter table public.atividades add column if not exists participantes uuid[] not null default '{}';
alter table public.atividades add column if not exists participantes_nomes text[] not null default '{}';
alter table public.atividades add column if not exists externos jsonb not null default '[]'::jsonb;
create index if not exists atividades_participantes on public.atividades using gin (participantes);

-- os e-mails de fora que já existiam (script 27) passam para a lista de participantes de fora
update public.atividades
   set externos = (select coalesce(jsonb_agg(jsonb_build_object('nome', null, 'email', e, 'whatsapp', null)), '[]'::jsonb) from unnest(convidados) e)
 where coalesce(array_length(convidados, 1), 0) > 0 and externos = '[]'::jsonb;

-- quem foi convidado da equipe também lê a atividade
drop policy if exists atividade_ler on public.atividades;
create policy atividade_ler on public.atividades for select to authenticated
  using (eh_equipe() and (auth.uid() = any (responsaveis) or auth.uid() = any (participantes) or criado_por = auth.uid()));

notify pgrst, 'reload schema';
commit;
