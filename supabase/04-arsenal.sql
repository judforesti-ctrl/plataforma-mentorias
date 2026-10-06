-- Plataforma de Mentorias Mentorei · arsenal de ferramentas
-- Rodar uma vez: SQL Editor → colar tudo → Run.
-- As fichas e os PDFs são carregados depois, pela tela "Arsenal → Carregar arsenal" (administração).

-- Quem é da equipe (administração ou mentor ativo)
create or replace function public.eh_equipe() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = auth.uid() and ativo and (papel in ('admin', 'mentor') or tambem_mentor));
$$;

-- Fichas das ferramentas (o conteúdo completo do fichas.json fica em "dados")
create table public.ferramentas (
  id text primary key,                 -- ex.: MNT-COM-01
  numero text,
  nome text not null,
  lote text,
  arquivo text,                        -- nome do PDF na pasta "arsenal" (vazio = ferramenta online, sem PDF)
  dados jsonb not null,
  atualizado_em timestamptz not null default now()
);

-- Vocabulário de tags (do tags.json)
create table public.arsenal_tags (
  tag text primary key,
  quando_aplicar text
);

-- Ferramentas enviadas a cada mentorado
create table public.ferramentas_enviadas (
  id uuid primary key default gen_random_uuid(),
  mentorado_id uuid not null references public.mentorados (id) on delete cascade,
  ferramenta_id text not null references public.ferramentas (id),
  sessao_id uuid references public.sessoes (id) on delete set null,
  enviado_por uuid references public.perfis (id),
  enviado_em timestamptz not null default now()
);
create index on public.ferramentas_enviadas (mentorado_id);

alter table public.ferramentas enable row level security;
alter table public.arsenal_tags enable row level security;
alter table public.ferramentas_enviadas enable row level security;

-- Administração: tudo
create policy admin_tudo on public.ferramentas for all to authenticated using (eh_admin()) with check (eh_admin());
create policy admin_tudo on public.arsenal_tags for all to authenticated using (eh_admin()) with check (eh_admin());
create policy admin_tudo on public.ferramentas_enviadas for all to authenticated using (eh_admin()) with check (eh_admin());

-- Equipe lê o arsenal inteiro; mentorado lê só as fichas das ferramentas que recebeu
create policy equipe_ler on public.ferramentas for select to authenticated using (eh_equipe());
create policy mentorado_ler_recebidas on public.ferramentas for select to authenticated using (
  exists (select 1 from ferramentas_enviadas fe where fe.ferramenta_id = ferramentas.id and fe.mentorado_id = meu_mentorado()));
create policy equipe_ler on public.arsenal_tags for select to authenticated using (eh_equipe());

-- Envio: o mentor envia e vê os envios dos seus mentorados; o mentorado vê o que recebeu
create policy mentor_enviar on public.ferramentas_enviadas for insert to authenticated
  with check (eh_mentor_de(mentorado_id) and enviado_por = auth.uid());
create policy mentor_ler on public.ferramentas_enviadas for select to authenticated using (eh_mentor_de(mentorado_id));
create policy mentorado_ler on public.ferramentas_enviadas for select to authenticated using (mentorado_id = meu_mentorado());

-- Pasta privada dos PDFs
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('arsenal', 'arsenal', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

create policy arsenal_equipe_ler on storage.objects for select to authenticated
  using (bucket_id = 'arsenal' and public.eh_equipe());
create policy arsenal_mentorado_ler on storage.objects for select to authenticated
  using (bucket_id = 'arsenal' and exists (
    select 1 from public.ferramentas f join public.ferramentas_enviadas fe on fe.ferramenta_id = f.id
    where f.arquivo = storage.objects.name and fe.mentorado_id = public.meu_mentorado()));
create policy arsenal_admin_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'arsenal' and public.eh_admin());
create policy arsenal_admin_trocar on storage.objects for update to authenticated
  using (bucket_id = 'arsenal' and public.eh_admin());
create policy arsenal_admin_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'arsenal' and public.eh_admin());
