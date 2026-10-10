-- Fotos das aulas: no módulo da turma, o mentor do módulo e a administração colocam as fotos do encontro.
-- Ficam na mesma pasta privada dos slides ("turmas"), em "<id do módulo>/foto/" (foto grande) e
-- "<id do módulo>/foto-mini/" (miniatura para a tela abrir rápido), e na mesma lista de arquivos do módulo (tipo 'foto').
-- Quem vê o módulo vê as fotos. Cada mentor apaga as fotos que ele mesmo colocou; a administração apaga qualquer uma.
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema.
begin;

-- 1. a pasta "turmas" passa a aceitar fotos (JPG, PNG e WEBP), além dos slides
update storage.buckets
   set allowed_mime_types = array(select distinct unnest(coalesce(allowed_mime_types, '{}') || array['image/jpeg', 'image/png', 'image/webp']))
 where id = 'turmas';

-- 2. a lista de arquivos do módulo ganha o tipo "foto"
alter table public.modulo_arquivos drop constraint if exists modulo_arquivos_tipo_check;
alter table public.modulo_arquivos add constraint modulo_arquivos_tipo_check check (tipo in ('oficial', 'mentor', 'foto'));

drop policy if exists mentor_enviar_foto on public.modulo_arquivos;
create policy mentor_enviar_foto on public.modulo_arquivos for insert to authenticated
  with check (tipo = 'foto' and enviado_por = auth.uid() and eh_mentor_do_modulo(modulo_id));
drop policy if exists mentor_apagar_foto on public.modulo_arquivos;
create policy mentor_apagar_foto on public.modulo_arquivos for delete to authenticated
  using (tipo = 'foto' and enviado_por = auth.uid());

-- 3. o mentor do módulo envia e apaga as próprias fotos na pasta (a administração já envia e apaga tudo)
drop policy if exists turmas_mentor_fotos on storage.objects;
create policy turmas_mentor_fotos on storage.objects for insert to authenticated
  with check (bucket_id = 'turmas' and (storage.foldername(name))[2] in ('foto', 'foto-mini')
              and public.ministra_modulo_pasta((storage.foldername(name))[1]));
drop policy if exists turmas_apagar_fotos on storage.objects;
create policy turmas_apagar_fotos on storage.objects for delete to authenticated
  using (bucket_id = 'turmas' and owner = auth.uid() and (storage.foldername(name))[2] in ('foto', 'foto-mini'));

commit;
