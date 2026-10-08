-- Reuniões da equipe (com clientes, fornecedores ou entre mentores) marcadas pela plataforma:
-- aparecem na agenda da equipe, criam o convite na Google Agenda conectada (com link do Meet gerado sozinho)
-- e o Google manda o convite para todos os envolvidos, inclusive convidados de fora sem cadastro.
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema.
begin;

create table if not exists public.agenda_reunioes (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  dia date not null,
  hora_inicio time not null,
  hora_fim time not null,
  pauta text,                                          -- vai junto no convite
  participantes uuid[] not null default '{}',          -- pessoas da equipe (perfis)
  participantes_nomes text[] not null default '{}',    -- nomes na hora de marcar (para mostrar sem precisar ler os perfis)
  convidados text[] not null default '{}',             -- e-mails de fora (clientes, fornecedores)
  meet_link text,                                      -- link do Meet gerado pelo Google
  google_evento_id text,                               -- convite na Google Agenda conectada
  convites_enviados_em timestamptz,
  situacao text not null default 'marcada' check (situacao in ('marcada', 'cancelada')),
  criado_por uuid references public.perfis (id) default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (hora_fim > hora_inicio)
);
create index if not exists agenda_reunioes_dia on public.agenda_reunioes (dia);

drop trigger if exists reunioes_atualizado on public.agenda_reunioes;
create trigger reunioes_atualizado before update on public.agenda_reunioes for each row execute function public.marcar_atualizacao();
drop trigger if exists hist_agenda_reunioes on public.agenda_reunioes;
create trigger hist_agenda_reunioes after insert or update or delete on public.agenda_reunioes for each row execute function public.registrar_historico();

alter table public.agenda_reunioes enable row level security;
revoke all on public.agenda_reunioes from anon;

-- Administração: tudo. Mentor: lê as reuniões em que participa ou que marcou; o resto passa pelo servidor.
drop policy if exists admin_tudo on public.agenda_reunioes;
create policy admin_tudo on public.agenda_reunioes for all to authenticated using (eh_admin()) with check (eh_admin());
drop policy if exists reuniao_participante_ler on public.agenda_reunioes;
create policy reuniao_participante_ler on public.agenda_reunioes for select to authenticated
  using (eh_equipe() and (auth.uid() = any (participantes) or criado_por = auth.uid()));

notify pgrst, 'reload schema';
commit;
