-- Convites na Google Agenda: guarda qual evento da Google Agenda corresponde a cada compromisso da plataforma
-- (sessão, aula, deslocamento, bloqueio, recesso, pré-bloqueio), para mudar sempre o mesmo convite e nunca duplicar.
-- Só o servidor da plataforma lê e grava esta tabela.
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema.
begin;

create table if not exists public.google_eventos (
  chave text primary key,              -- ex.: sessao:<id>, modulo:<id>, bloqueio:<id>, reserva:<id>:<dia>
  evento_id text not null,             -- id do evento na Google Agenda conectada
  assinatura text,                     -- resumo do que foi enviado (só muda o convite quando algo mudou)
  inicio timestamptz,                  -- quando o compromisso começa
  adotado boolean not null default false,  -- convite que já existia (feito à mão): a plataforma muda só horário e convidados
  atualizado_em timestamptz not null default now()
);
create index if not exists google_eventos_evento on public.google_eventos (evento_id);
alter table public.google_eventos enable row level security;
revoke all on public.google_eventos from anon, authenticated;

-- Liga e desliga os convites automáticos (começam desligados): equipe e mentorados separadamente.
insert into public.configuracoes (chave, valor) values ('google_convites', '{"equipe": false, "mentorados": false}') on conflict (chave) do nothing;

notify pgrst, 'reload schema';
commit;
