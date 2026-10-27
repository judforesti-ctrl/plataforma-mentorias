-- Alunos das turmas (trilhas): pedido da Juliana em 27/10/2026.
-- Cada turma ganha a lista de alunos; o aluno recebe o convite, cria a senha e entra na área dele ("Minha trilha"):
-- nome da trilha, módulos com data, link da sala, slides em PDF para os alunos, tarefas e ferramentas que o mentor sobe
-- e a gravação de cada aula (lida da pasta do Zoom no Google Drive da contato@mentorei.com.br).
-- O aluno NUNCA lê as tabelas de turmas e módulos direto (lá estão percepções e recomendações internas):
-- tudo o que ele vê vem da função minhas_trilhas(), que só devolve o que é para ele.
-- Cada cliente pode ter o próprio logo e as próprias cores na área do aluno (empresas.marca).
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema.

-- 1. Novo tipo de acesso: aluno
alter table public.perfis drop constraint if exists perfis_papel_check;
alter table public.perfis add constraint perfis_papel_check check (papel in ('admin', 'mentor', 'mentorado', 'aluno'));
alter table public.convites drop constraint if exists convites_papel_check;
alter table public.convites add constraint convites_papel_check check (papel in ('admin', 'mentor', 'mentorado', 'aluno'));

-- 2. Alunos de cada turma (a mesma pessoa pode estar em mais de uma turma: uma linha por turma, ligadas pelo e-mail)
create table if not exists public.turma_alunos (
  id uuid primary key default gen_random_uuid(),
  turma_id uuid not null references public.turmas (id) on delete cascade,
  nome text not null,
  email text,
  whatsapp text,
  cargo text,
  perfil_id uuid references public.perfis (id) on delete set null,   -- preenchido quando a pessoa tem login
  ativo boolean not null default true,
  convidado_em timestamptz,
  criado_por uuid references public.perfis (id) default auth.uid(),
  criado_em timestamptz not null default now()
);
create unique index if not exists turma_alunos_email on public.turma_alunos (turma_id, lower(email)) where email is not null;
create index if not exists turma_alunos_perfil on public.turma_alunos (perfil_id);
create index if not exists turma_alunos_turma on public.turma_alunos (turma_id);

-- e-mail sempre em letra minúscula, e já ligado ao login se a pessoa existir na plataforma
create or replace function public.ligar_aluno_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.email := nullif(lower(trim(coalesce(new.email, ''))), '');
  if new.email is not null and (tg_op = 'INSERT' or new.email is distinct from old.email or new.perfil_id is null) then
    select id into new.perfil_id from perfis where lower(email) = new.email limit 1;
  end if;
  return new;
end $$;
drop trigger if exists ligar_aluno_perfil on public.turma_alunos;
create trigger ligar_aluno_perfil before insert or update on public.turma_alunos for each row execute function public.ligar_aluno_perfil();

create or replace function public.eh_aluno_da_turma(p_turma uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from turma_alunos where turma_id = p_turma and perfil_id = auth.uid() and ativo);
$$;
create or replace function public.eh_aluno_do_modulo_pasta(p_pasta text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from modulos m join turma_alunos a on a.turma_id = m.turma_id
                 where m.id::text = p_pasta and a.perfil_id = auth.uid() and a.ativo);
$$;

alter table public.turma_alunos enable row level security;
drop policy if exists admin_tudo on public.turma_alunos;
create policy admin_tudo on public.turma_alunos for all to authenticated using (eh_admin()) with check (eh_admin());
drop policy if exists mentor_ler on public.turma_alunos;
create policy mentor_ler on public.turma_alunos for select to authenticated using (eh_mentor_da_turma(turma_id));
drop policy if exists aluno_ler on public.turma_alunos;
create policy aluno_ler on public.turma_alunos for select to authenticated using (perfil_id = auth.uid());

-- 3. Quando a pessoa cria o login, o perfil nasce do convite (como antes) e as turmas dela são ligadas pelo e-mail
create or replace function public.criar_perfil_do_convite() returns trigger
language plpgsql security definer set search_path = public as $$
declare c convites%rowtype;
begin
  select * into c from convites where lower(email) = lower(new.email);
  if not found then
    return new;  -- sem convite, sem perfil: a pessoa não vê nada
  end if;
  insert into perfis (id, papel, tambem_mentor, nome, email)
  values (new.id, c.papel, c.tambem_mentor, c.nome, lower(new.email))
  on conflict (id) do nothing;
  if c.mentorado_id is not null then
    update mentorados set perfil_id = new.id where id = c.mentorado_id;
  end if;
  update turma_alunos set perfil_id = new.id where lower(email) = lower(new.email) and perfil_id is null;
  update convites set usado_em = now() where email = c.email;
  return new;
end $$;

-- 4. Arquivos do módulo para os alunos: "aluno" = slides em PDF da aula; "tarefa" = tarefa ou ferramenta para baixar
alter table public.modulo_arquivos drop constraint if exists modulo_arquivos_tipo_check;
alter table public.modulo_arquivos add constraint modulo_arquivos_tipo_check
  check (tipo in ('oficial', 'mentor', 'foto', 'material', 'aluno', 'tarefa'));

drop policy if exists mentor_enviar_aluno on public.modulo_arquivos;
create policy mentor_enviar_aluno on public.modulo_arquivos for insert to authenticated
  with check (tipo in ('aluno', 'tarefa') and enviado_por = auth.uid() and eh_mentor_do_modulo(modulo_id));
drop policy if exists mentor_apagar_aluno on public.modulo_arquivos;
create policy mentor_apagar_aluno on public.modulo_arquivos for delete to authenticated
  using (tipo in ('aluno', 'tarefa') and enviado_por = auth.uid());
drop policy if exists aluno_ler on public.modulo_arquivos;
create policy aluno_ler on public.modulo_arquivos for select to authenticated
  using (tipo in ('aluno', 'tarefa') and exists (select 1 from modulos m where m.id = modulo_id and eh_aluno_da_turma(m.turma_id)));

-- na pasta privada "turmas": "<módulo>/aluno/" e "<módulo>/tarefa/"
update storage.buckets
   set allowed_mime_types = array(select distinct unnest(coalesce(allowed_mime_types, '{}') || array[
     'application/pdf', 'application/zip',
     'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
     'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
     'image/jpeg', 'image/png']))
 where id = 'turmas';
drop policy if exists turmas_mentor_aluno on storage.objects;
create policy turmas_mentor_aluno on storage.objects for insert to authenticated
  with check (bucket_id = 'turmas' and (storage.foldername(name))[2] in ('aluno', 'tarefa')
              and public.ministra_modulo_pasta((storage.foldername(name))[1]));
drop policy if exists turmas_apagar_aluno on storage.objects;
create policy turmas_apagar_aluno on storage.objects for delete to authenticated
  using (bucket_id = 'turmas' and owner = auth.uid() and (storage.foldername(name))[2] in ('aluno', 'tarefa'));
drop policy if exists turmas_aluno_ler on storage.objects;
create policy turmas_aluno_ler on storage.objects for select to authenticated
  using (bucket_id = 'turmas' and (storage.foldername(name))[2] in ('aluno', 'tarefa')
         and public.eh_aluno_do_modulo_pasta((storage.foldername(name))[1]));

-- 5. Gravações das aulas (pasta do Zoom no Google Drive, lida pelo servidor; ou link colado à mão)
create table if not exists public.gravacoes (
  id uuid primary key default gen_random_uuid(),
  modulo_id uuid references public.modulos (id) on delete set null,   -- vazio = a plataforma não soube de qual aula é
  drive_id text unique,                                                -- arquivo do Google Drive (vazio = link colado à mão)
  nome text not null,
  link text not null,
  gravada_em timestamptz,
  duracao_min integer,
  ligada text not null default 'auto' check (ligada in ('auto', 'manual')),
  ignorada boolean not null default false,                             -- "não é de aula": não aparece para ninguém
  compartilhada boolean not null default false,                        -- o Drive já libera "qualquer pessoa com o link"
  aviso text,                                                          -- problema ao liberar no Drive
  criado_por uuid references public.perfis (id) default auth.uid(),
  criado_em timestamptz not null default now()
);
create index if not exists gravacoes_modulo on public.gravacoes (modulo_id);

alter table public.gravacoes enable row level security;
drop policy if exists admin_tudo on public.gravacoes;
create policy admin_tudo on public.gravacoes for all to authenticated using (eh_admin()) with check (eh_admin());
drop policy if exists mentor_ler on public.gravacoes;
create policy mentor_ler on public.gravacoes for select to authenticated
  using (exists (select 1 from modulos m where m.id = modulo_id and eh_mentor_da_turma(m.turma_id)));
drop policy if exists mentor_colar on public.gravacoes;
create policy mentor_colar on public.gravacoes for insert to authenticated
  with check (drive_id is null and ligada = 'manual' and criado_por = auth.uid() and eh_mentor_do_modulo(modulo_id));
drop policy if exists mentor_apagar on public.gravacoes;
create policy mentor_apagar on public.gravacoes for delete to authenticated
  using (drive_id is null and criado_por = auth.uid());

-- 6. Logo e cores de cada cliente na área do aluno: { logo: {caminho, largura, altura}, principal: '#hex', destaque: '#hex', paleta }
alter table public.empresas add column if not exists marca jsonb not null default '{}'::jsonb;

-- 7. Tudo o que o aluno vê, numa chamada só (sem percepções, recomendações, slides internos nem fotos)
create or replace function public.minhas_trilhas() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'nome', t.nome, 'empresa', e.nome, 'marca', e.marca, 'inicio', t.inicio, 'fim', t.fim_previsto, 'status', t.status,
    'modulos', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id, 'numero', m.numero, 'titulo', m.titulo, 'data_hora', m.data_hora, 'duracao_min', m.duracao_min, 'formato', m.formato,
        'link', case when m.formato = 'presencial' then null else m.link end,
        'local', case when m.formato = 'presencial' then m.local end,
        'mentores', (select coalesce(jsonb_agg(jsonb_build_object('nome', p.nome, 'foto_url', p.foto_url) order by p.nome), '[]'::jsonb)
                     from modulo_mentores mm join perfis p on p.id = mm.mentor_id where mm.modulo_id = m.id),
        'arquivos', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'tipo', a.tipo, 'nome', a.nome, 'caminho', a.caminho,
                       'tamanho', a.tamanho, 'enviado_em', a.enviado_em) order by a.enviado_em), '[]'::jsonb)
                     from modulo_arquivos a where a.modulo_id = m.id and a.tipo in ('aluno', 'tarefa')),
        'gravacoes', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'nome', g.nome, 'link', g.link, 'gravada_em', g.gravada_em,
                       'duracao_min', g.duracao_min) order by g.gravada_em nulls last, g.criado_em), '[]'::jsonb)
                     from gravacoes g where g.modulo_id = m.id and not g.ignorada)
      ) order by m.numero), '[]'::jsonb) from modulos m where m.turma_id = t.id)
  ) order by t.inicio desc nulls last), '[]'::jsonb)
  from turmas t join empresas e on e.id = t.empresa_id
  where exists (select 1 from turma_alunos a where a.turma_id = t.id and a.perfil_id = auth.uid() and a.ativo);
$$;
revoke all on function public.minhas_trilhas() from anon;

-- 8. Lugar da configuração das gravações (a pasta do Drive e a última leitura; só o servidor e a administração usam)
insert into public.configuracoes (chave, valor) values ('gravacoes', '{}') on conflict (chave) do nothing;
