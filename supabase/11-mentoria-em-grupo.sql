-- Mentoria em grupo: turmas (por empresa), módulos (aulas), mentores de cada módulo, slides e percepções.
-- Rodar uma vez: SQL Editor → colar tudo → Run.
-- Nesta fase só a equipe entra: a administração organiza tudo; o mentor vê as turmas em que dá aula,
-- baixa os slides oficiais, envia os slides dele e registra as percepções dos módulos que ministra.

-- 1. Tipo de atendimento de cada mentor (individual, grupo ou os dois). Só a administração muda.
alter table public.perfis add column if not exists atende_individual boolean not null default true;
alter table public.perfis add column if not exists atende_grupo boolean not null default false;

create or replace function public.protege_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not eh_admin() and (new.papel <> old.papel or new.tambem_mentor <> old.tambem_mentor
                          or new.ativo <> old.ativo or new.email <> old.email
                          or new.atende_individual <> old.atende_individual or new.atende_grupo <> old.atende_grupo) then
    raise exception 'Só o administrador muda papel, e-mail, situação ou tipo de atendimento de um perfil.';
  end if;
  return new;
end $$;

-- 2. Tabelas
create table if not exists public.turmas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  nome text not null,
  perfil_turma text,                                   -- cargos, nível, desafios, o que a empresa espera
  participantes_previstos integer check (participantes_previstos >= 0),
  inicio date,
  fim_previsto date,
  status text not null default 'planejada' check (status in ('planejada', 'em_andamento', 'concluida', 'pausada')),
  observacoes text,
  criado_em timestamptz not null default now()
);

create table if not exists public.modulos (
  id uuid primary key default gen_random_uuid(),
  turma_id uuid not null references public.turmas (id) on delete cascade,
  numero integer not null check (numero > 0),
  titulo text not null,
  tematica text,                                       -- tema e objetivos da aula
  data_hora timestamptz,
  duracao_min integer,
  formato text not null default 'meet' check (formato in ('meet', 'zoom', 'teams', 'presencial', 'outro')),
  link text,                                           -- link da sala online
  local text,                                          -- endereço, quando presencial
  recomendacoes text,                                  -- o que enfatizar, cuidados, combinados com a empresa
  percepcoes text,                                     -- escrito pelo mentor depois da aula
  participantes_presentes integer check (participantes_presentes >= 0),
  percepcoes_em timestamptz,
  percepcoes_por uuid references public.perfis (id),
  atualizado_em timestamptz not null default now(),
  unique (turma_id, numero)
);

create table if not exists public.modulo_mentores (
  modulo_id uuid not null references public.modulos (id) on delete cascade,
  mentor_id uuid not null references public.perfis (id),
  primary key (modulo_id, mentor_id)
);

create table if not exists public.modulo_arquivos (
  id uuid primary key default gen_random_uuid(),
  modulo_id uuid not null references public.modulos (id) on delete cascade,
  tipo text not null check (tipo in ('oficial', 'mentor')),
  nome text not null,                                  -- nome do arquivo como a pessoa enviou
  caminho text not null unique,                        -- onde está guardado (pasta "turmas")
  tamanho bigint,
  enviado_por uuid references public.perfis (id) default auth.uid(),
  enviado_em timestamptz not null default now()
);
create index if not exists modulos_turma on public.modulos (turma_id);
create index if not exists arquivos_modulo on public.modulo_arquivos (modulo_id);

-- 3. Quem é mentor de quê
create or replace function public.eh_mentor_do_modulo(p_modulo uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from modulo_mentores where modulo_id = p_modulo and mentor_id = auth.uid());
$$;
create or replace function public.eh_mentor_da_turma(p_turma uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from modulo_mentores mm join modulos m on m.id = mm.modulo_id
                 where m.turma_id = p_turma and mm.mentor_id = auth.uid());
$$;
-- versões que recebem o nome da pasta (texto), usadas nas regras da pasta de arquivos
create or replace function public.pode_ver_modulo_pasta(p_pasta text) returns boolean
language sql stable security definer set search_path = public as $$
  select eh_admin() or exists (select 1 from modulos m where m.id::text = p_pasta and eh_mentor_da_turma(m.turma_id));
$$;
create or replace function public.ministra_modulo_pasta(p_pasta text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from modulo_mentores where modulo_id::text = p_pasta and mentor_id = auth.uid());
$$;

-- O mentor só altera, no módulo, as percepções e a presença. O resto é da administração.
create or replace function public.protege_modulo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_em := now();
  if auth.uid() is null or eh_admin() then return new; end if;
  if (to_jsonb(new) - 'percepcoes' - 'participantes_presentes' - 'percepcoes_em' - 'percepcoes_por' - 'atualizado_em')
     <> (to_jsonb(old) - 'percepcoes' - 'participantes_presentes' - 'percepcoes_em' - 'percepcoes_por' - 'atualizado_em') then
    raise exception 'O mentor só registra as percepções e a presença do módulo.';
  end if;
  return new;
end $$;
drop trigger if exists protege_modulo on public.modulos;
create trigger protege_modulo before update on public.modulos for each row execute function public.protege_modulo();

-- 4. Regras de acesso
alter table public.turmas enable row level security;
alter table public.modulos enable row level security;
alter table public.modulo_mentores enable row level security;
alter table public.modulo_arquivos enable row level security;

create policy admin_tudo on public.turmas for all to authenticated using (eh_admin()) with check (eh_admin());
create policy admin_tudo on public.modulos for all to authenticated using (eh_admin()) with check (eh_admin());
create policy admin_tudo on public.modulo_mentores for all to authenticated using (eh_admin()) with check (eh_admin());
create policy admin_tudo on public.modulo_arquivos for all to authenticated using (eh_admin()) with check (eh_admin());

create policy mentor_ler on public.turmas for select to authenticated using (eh_mentor_da_turma(id));
create policy mentor_ler on public.modulos for select to authenticated using (eh_mentor_da_turma(turma_id));
create policy mentor_percepcoes on public.modulos for update to authenticated
  using (eh_mentor_do_modulo(id)) with check (eh_mentor_do_modulo(id));
create policy mentor_ler on public.modulo_mentores for select to authenticated using (
  exists (select 1 from modulos m where m.id = modulo_id and eh_mentor_da_turma(m.turma_id)));
create policy mentor_ler on public.modulo_arquivos for select to authenticated using (
  exists (select 1 from modulos m where m.id = modulo_id and eh_mentor_da_turma(m.turma_id)));
create policy mentor_enviar on public.modulo_arquivos for insert to authenticated
  with check (tipo = 'mentor' and enviado_por = auth.uid() and eh_mentor_do_modulo(modulo_id));
create policy mentor_apagar on public.modulo_arquivos for delete to authenticated
  using (tipo = 'mentor' and enviado_por = auth.uid());

-- O mentor de grupo vê o nome e a foto dos colegas que dão aula na mesma turma.
create policy perfil_colegas_turma on public.perfis for select to authenticated using (
  exists (select 1 from modulo_mentores a join modulos ma on ma.id = a.modulo_id
          join modulos mb on mb.turma_id = ma.turma_id join modulo_mentores b on b.modulo_id = mb.id
          where a.mentor_id = auth.uid() and b.mentor_id = perfis.id));
-- e o nome da empresa das suas turmas
create policy empresa_mentor_turma on public.empresas for select to authenticated using (
  exists (select 1 from turmas t where t.empresa_id = empresas.id and eh_mentor_da_turma(t.id)));

-- 5. Contato da coordenação (botão "Falar com a Cintia"): nome e WhatsApp de quem usa contato@mentorei.com.br
create or replace function public.contato_coordenacao() returns table (nome text, whatsapp text)
language sql stable security definer set search_path = public as $$
  select p.nome, p.whatsapp from perfis p where lower(p.email) = 'contato@mentorei.com.br' and p.ativo limit 1;
$$;
revoke all on function public.contato_coordenacao() from anon;

-- 6. Pasta privada dos slides: "turmas/<id do módulo>/<oficial|mentor>/<arquivo>"
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('turmas', 'turmas', false, 52428800, array[
  'application/pdf',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.presentation',
  'application/vnd.apple.keynote',
  'application/zip'])
on conflict (id) do nothing;

create policy turmas_ler on storage.objects for select to authenticated
  using (bucket_id = 'turmas' and public.pode_ver_modulo_pasta((storage.foldername(name))[1]));
create policy turmas_admin_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'turmas' and public.eh_admin());
create policy turmas_mentor_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'turmas' and (storage.foldername(name))[2] = 'mentor'
              and public.ministra_modulo_pasta((storage.foldername(name))[1]));
create policy turmas_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'turmas' and (public.eh_admin() or (owner = auth.uid() and (storage.foldername(name))[2] = 'mentor')));
