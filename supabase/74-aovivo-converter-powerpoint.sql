-- 74 · Mentorei Ao Vivo: o mentor envia o PowerPoint como está e a plataforma transforma em PDF (15/11/2026).
-- Rodado pelo Claude pelo conector do Supabase (migração aovivo_12_conversao_powerpoint) no mesmo dia.
update storage.buckets set file_size_limit = 52428800,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
    'application/vnd.ms-powerpoint',
    'application/vnd.oasis.opendocument.presentation']
 where id = 'aovivo-slides';

create table if not exists public.aovivo_conversoes (
  id uuid primary key default gen_random_uuid(),
  sessao_id uuid not null references public.aovivo_sessoes(id) on delete cascade,
  origem text not null,
  status text not null default 'convertendo' check (status in ('convertendo','pronto','erro')),
  pdf text,
  erro text,
  criado_em timestamptz not null default now()
);
alter table public.aovivo_conversoes enable row level security;
revoke all on public.aovivo_conversoes from anon, authenticated;

create or replace function public.aovivo_bilhete_arquivo(p_sessao uuid, p_chave text, p_nome text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_ext text; v_cam text;
begin
  perform public.aovivo_checa_chave(p_sessao, p_chave);
  v_ext := lower(substring(coalesce(p_nome, '') from '\.([A-Za-z0-9]+)$'));
  if v_ext is null or v_ext not in ('pdf','pptx','ppt','pps','ppsx','odp') then
    raise exception 'Envie a apresentação em PowerPoint (.pptx ou .ppt), OpenOffice (.odp) ou PDF.';
  end if;
  v_cam := p_sessao::text || '/' || replace(gen_random_uuid()::text, '-', '') || '/apresentacao.' || v_ext;
  insert into public.aovivo_uploads (path, sessao_id) values (v_cam, p_sessao);
  return jsonb_build_object('caminho', v_cam,
    'base', 'https://mixnubenhaleohkcanma.supabase.co/storage/v1/object/public/aovivo-slides/');
end $$;

create or replace function public.aovivo_pedir_conversao(p_sessao uuid, p_chave text, p_caminho text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform public.aovivo_checa_chave(p_sessao, p_chave);
  if left(coalesce(p_caminho, ''), 37) <> p_sessao::text || '/'
     or not exists (select 1 from public.aovivo_uploads u where u.path = p_caminho and u.sessao_id = p_sessao) then
    raise exception 'Arquivo não encontrado. Envie de novo.';
  end if;
  if (select count(*) from public.aovivo_conversoes where sessao_id = p_sessao and criado_em > now() - interval '1 hour') >= 15 then
    raise exception 'Muitas conversões nesta aula na última hora. Espere um pouco.';
  end if;
  insert into public.aovivo_conversoes (sessao_id, origem) values (p_sessao, p_caminho) returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.aovivo_ver_conversao(p_sessao uuid, p_chave text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.aovivo_conversoes;
begin
  perform public.aovivo_checa_chave(p_sessao, p_chave);
  select * into c from public.aovivo_conversoes where id = p_id and sessao_id = p_sessao;
  if not found then raise exception 'Conversão não encontrada.'; end if;
  if c.status = 'convertendo' and c.criado_em < now() - interval '8 minutes' then
    return jsonb_build_object('status', 'erro', 'erro', 'A conversão demorou demais. Tente de novo.');
  end if;
  return jsonb_build_object('status', c.status, 'erro', c.erro,
    'pdf', case when c.pdf is not null then 'https://mixnubenhaleohkcanma.supabase.co/storage/v1/object/public/aovivo-slides/' || c.pdf end);
end $$;

grant execute on function public.aovivo_bilhete_arquivo(uuid, text, text) to anon, authenticated;
grant execute on function public.aovivo_pedir_conversao(uuid, text, text) to anon, authenticated;
grant execute on function public.aovivo_ver_conversao(uuid, text, uuid) to anon, authenticated;
