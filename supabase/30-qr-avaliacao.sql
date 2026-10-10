-- QR code de avaliação: a administração coloca (e troca quando quiser) a imagem do QR code que os mentores
-- põem no ÚLTIMO SLIDE de cada módulo. Os mentores só veem e baixam; só a administração coloca, troca ou tira.
-- Vale em três níveis, do mais específico ao mais geral: só um módulo → todos os módulos de uma turma → todas as turmas.
-- O módulo mostra o mais específico que existir.
-- A imagem fica na pasta privada "turmas", em "avaliacao/<geral | turma-<id> | modulo-<id>>/<arquivo>".
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema.
begin;

-- 1. a lista dos QR codes
create table if not exists public.qr_avaliacao (
  id uuid primary key default gen_random_uuid(),
  escopo text not null check (escopo in ('geral', 'turma', 'modulo')),
  turma_id uuid references public.turmas (id) on delete cascade,
  modulo_id uuid references public.modulos (id) on delete cascade,
  caminho text not null,                               -- a imagem, na pasta "turmas"
  nome text,                                           -- nome do arquivo como foi enviado
  link text,                                           -- endereço da avaliação (opcional), para mandar no chat da aula online
  atualizado_por uuid references public.perfis (id) default auth.uid(),
  atualizado_em timestamptz not null default now(),
  check ((escopo = 'geral' and turma_id is null and modulo_id is null)
      or (escopo = 'turma' and turma_id is not null and modulo_id is null)
      or (escopo = 'modulo' and turma_id is null and modulo_id is not null))
);
-- um só por nível: um geral, um por turma, um por módulo
create unique index if not exists qr_avaliacao_geral on public.qr_avaliacao (escopo) where escopo = 'geral';
create unique index if not exists qr_avaliacao_turma on public.qr_avaliacao (turma_id) where escopo = 'turma';
create unique index if not exists qr_avaliacao_modulo on public.qr_avaliacao (modulo_id) where escopo = 'modulo';

-- 2. quem vê: a administração faz tudo; o mentor vê o geral e o das turmas em que dá aula
alter table public.qr_avaliacao enable row level security;
drop policy if exists admin_tudo on public.qr_avaliacao;
create policy admin_tudo on public.qr_avaliacao for all to authenticated using (eh_admin()) with check (eh_admin());
drop policy if exists mentor_ler on public.qr_avaliacao;
create policy mentor_ler on public.qr_avaliacao for select to authenticated using (
  eh_equipe() and (escopo = 'geral'
    or (escopo = 'turma' and eh_mentor_da_turma(turma_id))
    or (escopo = 'modulo' and exists (select 1 from modulos m where m.id = modulo_id and eh_mentor_da_turma(m.turma_id)))));

-- 3. a pasta "turmas" aceita imagens (JPG, PNG e WEBP), além dos slides (o script 29 faz o mesmo)
update storage.buckets
   set allowed_mime_types = array(select distinct unnest(coalesce(allowed_mime_types, '{}') || array['image/jpeg', 'image/png', 'image/webp']))
 where id = 'turmas';

-- 4. o mentor baixa a imagem do QR code que ele pode ver (a administração já envia, lê e apaga tudo na pasta)
drop policy if exists turmas_ler_avaliacao on storage.objects;
create policy turmas_ler_avaliacao on storage.objects for select to authenticated
  using (bucket_id = 'turmas' and (storage.foldername(name))[1] = 'avaliacao'
         and exists (select 1 from public.qr_avaliacao q where q.caminho = name));

commit;
