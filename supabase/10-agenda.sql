-- Ligação com a Google Agenda (para remarcar sessões e o Google mandar o convite atualizado).
-- A chave de acesso da conta Google fica guardada aqui e só o servidor da plataforma lê:
-- a tabela não tem nenhuma regra de leitura para quem entra na plataforma.

create table if not exists public.integracoes (
  chave text primary key,
  dados jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);
alter table public.integracoes enable row level security;
revoke all on public.integracoes from anon, authenticated;
