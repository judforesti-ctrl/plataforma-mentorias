-- Gestão de agenda da equipe: dias de atendimento de cada mentor, bloqueios e férias, recessos da Mentorei,
-- pré-bloqueios da coordenação (com aceite do mentor por e-mail e WhatsApp), deslocamento e viagem dos presenciais,
-- contagem de remarcações, resumo semanal por e-mail e agenda no celular.
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema.
begin;

-- 1. Quem é da equipe (administração e mentores)
create or replace function public.eh_equipe() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = auth.uid() and ativo and (papel in ('admin', 'mentor') or tambem_mentor));
$$;

-- 2. Dias e períodos em que cada mentor atende. Ex.: {"1":["manha","tarde"],"5":["manha"]} (0 = domingo … 6 = sábado).
--    Vazio = ainda não informado: a plataforma considera segunda a sexta, manhã, tarde e noite.
alter table public.perfis add column if not exists disponibilidade jsonb;

-- 3. Deslocamento e viagem de cada mentor em cada módulo presencial
alter table public.modulo_mentores add column if not exists com_deslocamento boolean not null default true;
alter table public.modulo_mentores add column if not exists viagem jsonb not null default '{}'::jsonb;  -- {passagem, hotel, transporte, obs}

-- 4. Quantas vezes cada sessão foi remarcada (para "clientes que mais remarcam")
alter table public.sessoes add column if not exists remarcacoes integer not null default 0;

-- 5. Bloqueios pedidos pelo mentor (compromisso, férias) e recessos da Mentorei (sem mentor = vale para todos)
create table if not exists public.agenda_bloqueios (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid references public.perfis (id) on delete cascade,
  tipo text not null default 'bloqueio' check (tipo in ('bloqueio', 'ferias', 'recesso')),
  inicio date not null,
  fim date not null,
  dias_semana integer[],                              -- vazio = todos os dias; ex.: {2} = só às terças (bloqueio que se repete)
  periodos text[] not null default '{manha,tarde,noite}',
  hora_inicio time,                                   -- horário exato, quando o bloqueio não é o período inteiro
  hora_fim time,
  motivo text,                                        -- só o próprio mentor e a administração veem
  criado_por uuid references public.perfis (id) default auth.uid(),
  criado_em timestamptz not null default now(),
  visto_em timestamptz,                               -- quando a coordenação viu o aviso
  check (fim >= inicio),
  check (tipo = 'recesso' or mentor_id is not null)
);
create index if not exists agenda_bloqueios_mentor on public.agenda_bloqueios (mentor_id, fim);

-- 6. Pré-bloqueios da coordenação (cliente em negociação)
create table if not exists public.agenda_reservas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  empresa_id uuid references public.empresas (id),
  cliente text,                                       -- nome do cliente quando ainda não é empresa cadastrada
  formato text not null default 'online' check (formato in ('online', 'presencial')),
  local text,
  com_deslocamento boolean not null default true,
  observacoes text,                                   -- o mentor vê
  situacao text not null default 'pre' check (situacao in ('pre', 'confirmada', 'convertida', 'liberada')),
  lembrar_em date not null default (current_date + 5),
  turma_id uuid references public.turmas (id) on delete set null,
  criado_por uuid references public.perfis (id) default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create table if not exists public.agenda_reserva_datas (
  id uuid primary key default gen_random_uuid(),
  reserva_id uuid not null references public.agenda_reservas (id) on delete cascade,
  dia date not null,
  periodos text[] not null default '{manha,tarde,noite}',
  hora_inicio time,
  duracao_min integer check (duracao_min > 0),
  unique (reserva_id, dia)
);
create table if not exists public.agenda_reserva_mentores (
  reserva_id uuid not null references public.agenda_reservas (id) on delete cascade,
  mentor_id uuid not null references public.perfis (id) on delete cascade,
  resposta text not null default 'aguardando' check (resposta in ('aguardando', 'aceito', 'recusado')),
  respondido_em timestamptz,
  comentario text,
  token uuid not null default gen_random_uuid() unique,  -- link do e-mail e do WhatsApp para responder sem entrar na plataforma
  email_enviado_em timestamptz,
  visto_em timestamptz,                               -- quando a coordenação viu a resposta
  primary key (reserva_id, mentor_id)
);
create index if not exists agenda_reserva_datas_reserva on public.agenda_reserva_datas (reserva_id);
create index if not exists agenda_reserva_mentores_mentor on public.agenda_reserva_mentores (mentor_id);

-- 7. Agenda no celular: um link secreto por pessoa
create table if not exists public.agenda_links (
  perfil_id uuid primary key references public.perfis (id) on delete cascade,
  token uuid not null default gen_random_uuid() unique,
  criado_em timestamptz not null default now()
);

-- 8. Configurações da administração (ex.: resumo semanal por e-mail ligado ou desligado)
create table if not exists public.configuracoes (
  chave text primary key,
  valor jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);
insert into public.configuracoes (chave, valor) values ('resumo_semanal', '{"ligado": false}') on conflict (chave) do nothing;

-- 9. Quem está num pré-bloqueio
create or replace function public.esta_na_reserva(p_reserva uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from agenda_reserva_mentores where reserva_id = p_reserva and mentor_id = auth.uid());
$$;

-- 10. Bloqueio criado ou mudado pelo mentor volta a aparecer como aviso novo para a coordenação
create or replace function public.aviso_bloqueio() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not eh_admin() then
    new.visto_em := null;
    if tg_op = 'INSERT' then new.criado_por := auth.uid(); end if;
  end if;
  return new;
end $$;
drop trigger if exists aviso_bloqueio on public.agenda_bloqueios;
create trigger aviso_bloqueio before insert or update on public.agenda_bloqueios for each row execute function public.aviso_bloqueio();

drop trigger if exists reservas_atualizado on public.agenda_reservas;
create trigger reservas_atualizado before update on public.agenda_reservas for each row execute function public.marcar_atualizacao();

-- 11. Histórico de alterações
drop trigger if exists hist_agenda_bloqueios on public.agenda_bloqueios;
create trigger hist_agenda_bloqueios after insert or update or delete on public.agenda_bloqueios for each row execute function public.registrar_historico();
drop trigger if exists hist_agenda_reservas on public.agenda_reservas;
create trigger hist_agenda_reservas after insert or update or delete on public.agenda_reservas for each row execute function public.registrar_historico();
drop trigger if exists hist_agenda_reserva_mentores on public.agenda_reserva_mentores;
create trigger hist_agenda_reserva_mentores after insert or update or delete on public.agenda_reserva_mentores for each row execute function public.registrar_historico();

-- 12. Regras de acesso
alter table public.agenda_bloqueios enable row level security;
alter table public.agenda_reservas enable row level security;
alter table public.agenda_reserva_datas enable row level security;
alter table public.agenda_reserva_mentores enable row level security;
alter table public.agenda_links enable row level security;
alter table public.configuracoes enable row level security;
revoke all on public.agenda_bloqueios, public.agenda_reservas, public.agenda_reserva_datas,
  public.agenda_reserva_mentores, public.agenda_links, public.configuracoes from anon;

do $$
declare t text;
begin
  foreach t in array array['agenda_bloqueios','agenda_reservas','agenda_reserva_datas','agenda_reserva_mentores','agenda_links','configuracoes']
  loop
    execute format('drop policy if exists admin_tudo on public.%I', t);
    execute format('create policy admin_tudo on public.%I for all to authenticated using (eh_admin()) with check (eh_admin())', t);
  end loop;
end $$;

-- Bloqueios: cada mentor vê e cuida dos próprios; a equipe toda vê os recessos da Mentorei.
drop policy if exists bloqueio_proprio on public.agenda_bloqueios;
create policy bloqueio_proprio on public.agenda_bloqueios for all to authenticated
  using (mentor_id = auth.uid()) with check (mentor_id = auth.uid() and tipo in ('bloqueio', 'ferias'));
drop policy if exists recesso_ler on public.agenda_bloqueios;
create policy recesso_ler on public.agenda_bloqueios for select to authenticated using (mentor_id is null and eh_equipe());

-- Pré-bloqueios: o mentor lê os em que foi chamado (a resposta passa pelo servidor, com o link).
drop policy if exists reserva_mentor_ler on public.agenda_reservas;
create policy reserva_mentor_ler on public.agenda_reservas for select to authenticated using (esta_na_reserva(id));
drop policy if exists reserva_datas_mentor_ler on public.agenda_reserva_datas;
create policy reserva_datas_mentor_ler on public.agenda_reserva_datas for select to authenticated using (esta_na_reserva(reserva_id));
drop policy if exists reserva_mentor_propria on public.agenda_reserva_mentores;
create policy reserva_mentor_propria on public.agenda_reserva_mentores for select to authenticated using (mentor_id = auth.uid());
-- e o nome da empresa dos pré-bloqueios em que foi chamado
drop policy if exists empresa_reserva_mentor on public.empresas;
create policy empresa_reserva_mentor on public.empresas for select to authenticated using (
  exists (select 1 from agenda_reservas r where r.empresa_id = empresas.id and esta_na_reserva(r.id)));

-- Agenda no celular: cada um cria, vê e apaga o próprio link.
drop policy if exists link_proprio on public.agenda_links;
create policy link_proprio on public.agenda_links for all to authenticated using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());

notify pgrst, 'reload schema';
commit;
