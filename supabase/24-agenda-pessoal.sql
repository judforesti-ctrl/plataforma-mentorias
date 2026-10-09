-- Agenda pessoal de cada um (Gmail, Hotmail/Outlook...) dentro da agenda da plataforma.
-- Cada pessoa da equipe cola uma vez o "endereço secreto" da própria agenda (formato iCal); a cada 15 minutos o servidor
-- lê essa agenda e traz os compromissos (reuniões que os clientes marcaram, viagens, consultas...) com o nome,
-- ocupando o horário. A plataforma só LÊ: nunca muda nada na agenda pessoal de ninguém.
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema.
begin;

-- 1. O link de cada pessoa. É secreto (quem tem o link lê a agenda inteira): só o servidor enxerga esta tabela.
create table if not exists public.agenda_pessoal_links (
  perfil_id uuid primary key references public.perfis (id) on delete cascade,
  url text not null,
  origem text,                       -- google, outlook, icloud ou outro
  conta text,                        -- nome da agenda (no Gmail, o próprio e-mail)
  ligado_por uuid references public.perfis (id),
  ligado_em timestamptz not null default now(),
  lido_em timestamptz,               -- última leitura que deu certo
  total integer not null default 0,  -- compromissos trazidos na última leitura
  erro text,                         -- última leitura que deu errado (some quando volta a dar certo)
  erro_em timestamptz
);
alter table public.agenda_pessoal_links enable row level security;
revoke all on public.agenda_pessoal_links from anon, authenticated;

-- 2. Os compromissos trazidos (de 30 dias atrás a 6 meses à frente). A cada leitura a lista da pessoa é trocada inteira.
create table if not exists public.agenda_pessoal (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  uid text not null,                 -- identificação do compromisso na agenda de origem (com a data, quando se repete)
  titulo text,
  inicio timestamptz not null,
  fim timestamptz not null,
  dia_inteiro boolean not null default false,
  local text,
  link text,                         -- sala online (Meet, Zoom, Teams...)
  organizador text,                  -- quem marcou (nome ou e-mail)
  organizador_email text,
  resposta text,                     -- aceito, talvez, sem_resposta (convite ainda não respondido)
  ocupa boolean not null default true,      -- false = marcado como "disponível" na agenda de origem: aparece, mas não ocupa
  particular boolean not null default false, -- marcado como particular/privado: aparece só "Particular"
  interno boolean not null default false,    -- marcado por alguém da Mentorei (serve para não duplicar o que já está na plataforma)
  atualizado_em timestamptz not null default now()
);
create index if not exists agenda_pessoal_quem on public.agenda_pessoal (perfil_id, inicio);
alter table public.agenda_pessoal enable row level security;
revoke all on public.agenda_pessoal from anon;
revoke insert, update, delete on public.agenda_pessoal from authenticated;

-- Administração vê a agenda de todos; cada pessoa vê só a sua (como no resto da agenda).
drop policy if exists admin_ler on public.agenda_pessoal;
create policy admin_ler on public.agenda_pessoal for select to authenticated using (eh_admin());
drop policy if exists pessoal_proprio on public.agenda_pessoal;
create policy pessoal_proprio on public.agenda_pessoal for select to authenticated using (perfil_id = auth.uid());

-- 3. Troca a lista de uma pessoa de uma vez só (apaga a antiga e grava a nova juntas). Só o servidor usa.
create or replace function public.trocar_agenda_pessoal(p_perfil uuid, p_eventos jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.agenda_pessoal where perfil_id = p_perfil;
  insert into public.agenda_pessoal (perfil_id, uid, titulo, inicio, fim, dia_inteiro, local, link, organizador, organizador_email,
    resposta, ocupa, particular, interno)
  select p_perfil, e.uid, e.titulo, e.inicio, e.fim, coalesce(e.dia_inteiro, false), e.local, e.link, e.organizador, e.organizador_email,
    e.resposta, coalesce(e.ocupa, true), coalesce(e.particular, false), coalesce(e.interno, false)
  from jsonb_to_recordset(coalesce(p_eventos, '[]'::jsonb)) as e(uid text, titulo text, inicio timestamptz, fim timestamptz, dia_inteiro boolean,
    local text, link text, organizador text, organizador_email text, resposta text, ocupa boolean, particular boolean, interno boolean)
  where e.uid is not null and e.inicio is not null and e.fim is not null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.trocar_agenda_pessoal(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.trocar_agenda_pessoal(uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
