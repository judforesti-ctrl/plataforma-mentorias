-- Envio de propostas pela plataforma (pedido da Juliana, 2026-10-15): gerar ou importar a proposta e clicar em "Enviar proposta".
-- Puxa o e-mail dos contatos do cliente, aceita outros e-mails, e cada envio fica registrado aqui (para quem, quando, por quem,
-- assunto e mensagem). Dá para enviar de novo (outra pessoa, lembrete). Só a administração (as sócias entram como administração).
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema.

create table if not exists public.proposta_envios (
  id uuid primary key default gen_random_uuid(),
  proposta_id uuid not null references public.propostas (id) on delete cascade,
  oportunidade_id uuid references public.oportunidades (id) on delete cascade,
  enviado_em timestamptz not null default now(),
  enviado_por uuid references public.perfis (id) on delete set null default auth.uid(),
  canal text not null default 'email' check (canal in ('email', 'whatsapp', 'outro')),
  para jsonb not null default '[]'::jsonb,       -- [{ nome, email, contato_id }] ou [{ nome, whatsapp }]
  copia_para text,                               -- quem recebeu cópia (quem enviou)
  assunto text,
  mensagem text,
  arquivo text,                                  -- nome do arquivo que foi junto
  como text                                      -- 'anexo' (arquivo no e-mail) ou 'link' (arquivo grande: link para baixar)
);
create index if not exists proposta_envios_proposta on public.proposta_envios (proposta_id, enviado_em desc);

alter table public.proposta_envios enable row level security;
drop policy if exists proposta_envios_admin on public.proposta_envios;
create policy proposta_envios_admin on public.proposta_envios for all to authenticated using (eh_admin()) with check (eh_admin());

notify pgrst, 'reload schema';

-- Conferência: deve aparecer "ok"
select 'ok' as envios_de_proposta;
