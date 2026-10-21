-- Materiais necessários no módulo da turma: checklist de ferramentas, áudio e vídeo e materiais de apoio da aula.
-- Dá para preencher item por item, colar uma lista ou ler de um arquivo (Word, Excel, PDF, texto), e anexar arquivos de apoio
-- (ficam na mesma pasta privada dos slides, "turmas", em "<id do módulo>/material/", tipo 'material' na lista de arquivos).
-- Quem vê o módulo vê o checklist. A administração e o mentor do módulo incluem, mudam, marcam como pronto e apagam.
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema.
begin;

-- 1. os itens do checklist
create table if not exists public.modulo_materiais (
  id uuid primary key default gen_random_uuid(),
  modulo_id uuid not null references public.modulos (id) on delete cascade,
  categoria text not null default 'outro' check (categoria in ('ferramenta', 'audio_video', 'apoio', 'outro')),
  texto text not null check (length(trim(texto)) > 0),
  quem text check (quem in ('mentorei', 'mentor', 'cliente')),   -- quem providencia (opcional)
  pronto boolean not null default false,
  pronto_por uuid references public.perfis (id),
  pronto_em timestamptz,
  ordem integer not null default 0,
  criado_por uuid references public.perfis (id) default auth.uid(),
  criado_em timestamptz not null default now()
);
create index if not exists materiais_modulo on public.modulo_materiais (modulo_id);

alter table public.modulo_materiais enable row level security;
drop policy if exists admin_tudo on public.modulo_materiais;
create policy admin_tudo on public.modulo_materiais for all to authenticated using (eh_admin()) with check (eh_admin());
drop policy if exists mentor_ler on public.modulo_materiais;
create policy mentor_ler on public.modulo_materiais for select to authenticated using (
  exists (select 1 from modulos m where m.id = modulo_id and eh_mentor_da_turma(m.turma_id)));
drop policy if exists mentor_incluir on public.modulo_materiais;
create policy mentor_incluir on public.modulo_materiais for insert to authenticated with check (eh_mentor_do_modulo(modulo_id));
drop policy if exists mentor_mudar on public.modulo_materiais;
create policy mentor_mudar on public.modulo_materiais for update to authenticated
  using (eh_mentor_do_modulo(modulo_id)) with check (eh_mentor_do_modulo(modulo_id));
drop policy if exists mentor_apagar on public.modulo_materiais;
create policy mentor_apagar on public.modulo_materiais for delete to authenticated using (eh_mentor_do_modulo(modulo_id));

-- 2. a pasta "turmas" passa a aceitar os arquivos de apoio (Word, Excel, texto, fotos, áudio e vídeo), além dos slides
update storage.buckets
   set allowed_mime_types = array(select distinct unnest(coalesce(allowed_mime_types, '{}') || array[
     'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
     'text/csv', 'text/plain', 'image/jpeg', 'image/png', 'image/webp',
     'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'video/mp4', 'video/quicktime']))
 where id = 'turmas';

-- 3. a lista de arquivos do módulo ganha o tipo "material"
alter table public.modulo_arquivos drop constraint if exists modulo_arquivos_tipo_check;
alter table public.modulo_arquivos add constraint modulo_arquivos_tipo_check check (tipo in ('oficial', 'mentor', 'foto', 'material'));

drop policy if exists mentor_enviar_material on public.modulo_arquivos;
create policy mentor_enviar_material on public.modulo_arquivos for insert to authenticated
  with check (tipo = 'material' and enviado_por = auth.uid() and eh_mentor_do_modulo(modulo_id));
drop policy if exists mentor_apagar_material on public.modulo_arquivos;
create policy mentor_apagar_material on public.modulo_arquivos for delete to authenticated
  using (tipo = 'material' and enviado_por = auth.uid());

-- 4. o mentor do módulo envia e apaga os próprios arquivos de apoio na pasta (a administração já envia e apaga tudo)
drop policy if exists turmas_mentor_material on storage.objects;
create policy turmas_mentor_material on storage.objects for insert to authenticated
  with check (bucket_id = 'turmas' and (storage.foldername(name))[2] = 'material'
              and public.ministra_modulo_pasta((storage.foldername(name))[1]));
drop policy if exists turmas_apagar_material on storage.objects;
create policy turmas_apagar_material on storage.objects for delete to authenticated
  using (bucket_id = 'turmas' and owner = auth.uid() and (storage.foldername(name))[2] = 'material');

commit;
