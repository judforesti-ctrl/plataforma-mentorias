-- Contato do mentorado preenchido pela administração antes do primeiro acesso (WhatsApp e rede social).
-- No primeiro acesso, o mentorado já encontra esses dados preenchidos e pode corrigir.
alter table public.mentorados add column if not exists whatsapp text;
alter table public.mentorados add column if not exists rede_social text;
