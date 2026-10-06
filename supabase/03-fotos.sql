-- Plataforma de Mentorias Mentorei · pasta das fotos de perfil
-- Rodar depois do 01 e do 02: SQL Editor → colar tudo → Run.
-- Cada pessoa só envia e troca fotos dentro da própria pasta (o nome da pasta é o id dela).
-- As fotos podem ser vistas por quem tem o endereço, que tem um código longo e difícil de adivinhar.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy fotos_enviar_propria on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy fotos_trocar_propria on storage.objects for update to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy fotos_apagar_propria on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and ((storage.foldername(name))[1] = auth.uid()::text or public.eh_admin()));

create policy fotos_admin_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and public.eh_admin());
