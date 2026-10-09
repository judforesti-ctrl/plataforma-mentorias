-- Convites que chegam na conta Google da coordenação (a conectada no Painel) entram sozinhos na agenda da plataforma:
-- cada pessoa da equipe que está no convite (como quem marcou ou convidada) fica com o horário ocupado, sem precisar colar link.
-- Para reconhecer as pessoas, a plataforma usa o e-mail do cadastro e os "outros e-mails" de cada uma (ex.: o Gmail pessoal).
-- Este script já traz tudo do 24 (agenda pessoal): quem não rodou o 24 pode rodar só este.
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema.
begin;

-- ===== do script 24: agenda pessoal (link secreto de cada um) =====
create table if not exists public.agenda_pessoal_links (
  perfil_id uuid primary key references public.perfis (id) on delete cascade,
  url text not null,
  origem text,
  conta text,
  ligado_por uuid references public.perfis (id),
  ligado_em timestamptz not null default now(),
  lido_em timestamptz,
  total integer not null default 0,
  erro text,
  erro_em timestamptz
);
alter table public.agenda_pessoal_links enable row level security;
revoke all on public.agenda_pessoal_links from anon, authenticated;

create table if not exists public.agenda_pessoal (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  uid text not null,
  titulo text,
  inicio timestamptz not null,
  fim timestamptz not null,
  dia_inteiro boolean not null default false,
  local text,
  link text,
  organizador text,
  organizador_email text,
  resposta text,
  ocupa boolean not null default true,
  particular boolean not null default false,
  interno boolean not null default false,
  atualizado_em timestamptz not null default now()
);
create index if not exists agenda_pessoal_quem on public.agenda_pessoal (perfil_id, inicio);
alter table public.agenda_pessoal enable row level security;
revoke all on public.agenda_pessoal from anon;
revoke insert, update, delete on public.agenda_pessoal from authenticated;
drop policy if exists admin_ler on public.agenda_pessoal;
create policy admin_ler on public.agenda_pessoal for select to authenticated using (eh_admin());
drop policy if exists pessoal_proprio on public.agenda_pessoal;
create policy pessoal_proprio on public.agenda_pessoal for select to authenticated using (perfil_id = auth.uid());

-- ===== novo: de onde veio cada compromisso =====
-- pessoal = link secreto da própria pessoa; google = convite na conta Google da coordenação
alter table public.agenda_pessoal add column if not exists fonte text not null default 'pessoal';

-- Troca a lista que veio do link de uma pessoa (não mexe no que veio da conta da coordenação).
create or replace function public.trocar_agenda_pessoal(p_perfil uuid, p_eventos jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.agenda_pessoal where perfil_id = p_perfil and fonte = 'pessoal';
  insert into public.agenda_pessoal (perfil_id, uid, titulo, inicio, fim, dia_inteiro, local, link, organizador, organizador_email,
    resposta, ocupa, particular, interno, fonte)
  select p_perfil, e.uid, e.titulo, e.inicio, e.fim, coalesce(e.dia_inteiro, false), e.local, e.link, e.organizador, e.organizador_email,
    e.resposta, coalesce(e.ocupa, true), coalesce(e.particular, false), coalesce(e.interno, false), 'pessoal'
  from jsonb_to_recordset(coalesce(p_eventos, '[]'::jsonb)) as e(uid text, titulo text, inicio timestamptz, fim timestamptz, dia_inteiro boolean,
    local text, link text, organizador text, organizador_email text, resposta text, ocupa boolean, particular boolean, interno boolean)
  where e.uid is not null and e.inicio is not null and e.fim is not null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.trocar_agenda_pessoal(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.trocar_agenda_pessoal(uuid, jsonb) to service_role;

-- Troca de uma vez tudo o que veio da conta Google da coordenação (cada linha já diz de quem é).
create or replace function public.trocar_agenda_google(p_eventos jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.agenda_pessoal where fonte = 'google';
  insert into public.agenda_pessoal (perfil_id, uid, titulo, inicio, fim, dia_inteiro, local, link, organizador, organizador_email,
    resposta, ocupa, particular, interno, fonte)
  select e.perfil_id, e.uid, e.titulo, e.inicio, e.fim, coalesce(e.dia_inteiro, false), e.local, e.link, e.organizador, e.organizador_email,
    e.resposta, coalesce(e.ocupa, true), coalesce(e.particular, false), coalesce(e.interno, false), 'google'
  from jsonb_to_recordset(coalesce(p_eventos, '[]'::jsonb)) as e(perfil_id uuid, uid text, titulo text, inicio timestamptz, fim timestamptz, dia_inteiro boolean,
    local text, link text, organizador text, organizador_email text, resposta text, ocupa boolean, particular boolean, interno boolean)
  where e.perfil_id is not null and e.uid is not null and e.inicio is not null and e.fim is not null
    and exists (select 1 from public.perfis p where p.id = e.perfil_id);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.trocar_agenda_google(jsonb) from public, anon, authenticated;
grant execute on function public.trocar_agenda_google(jsonb) to service_role;

-- ===== novo: outros e-mails de cada pessoa (Gmail pessoal, e-mail da empresa...) para reconhecer os convites =====
alter table public.perfis add column if not exists outros_emails text[] not null default '{}';

notify pgrst, 'reload schema';
commit;
