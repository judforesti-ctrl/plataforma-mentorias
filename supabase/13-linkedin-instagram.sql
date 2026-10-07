-- LinkedIn e Instagram em campos separados (antes era um campo só, "rede_social"), para a equipe e para os mentorados.
-- Rodar uma vez: SQL Editor → colar tudo → Run. Pode rodar de novo sem problema.
begin;
alter table public.perfis add column if not exists linkedin text;
alter table public.perfis add column if not exists instagram text;
alter table public.mentorados add column if not exists rede_social text;   -- já existe se o 07 foi rodado
alter table public.mentorados add column if not exists linkedin text;
alter table public.mentorados add column if not exists instagram text;

-- O que já estava preenchido vai para o campo certo: "@..." ou endereço do Instagram vai para Instagram; o resto, para LinkedIn.
update public.perfis set instagram = trim(rede_social)
  where linkedin is null and instagram is null and rede_social ~* '(instagram|^\s*@)';
update public.perfis set linkedin = trim(rede_social)
  where linkedin is null and instagram is null and nullif(trim(rede_social), '') is not null;
-- (a trava da ficha do mentorado só vale para quem usa a plataforma; aqui ela fica desligada só durante a cópia)
alter table public.mentorados disable trigger protege_mentorado;
update public.mentorados set instagram = trim(rede_social)
  where linkedin is null and instagram is null and rede_social ~* '(instagram|^\s*@)';
update public.mentorados set linkedin = trim(rede_social)
  where linkedin is null and instagram is null and nullif(trim(rede_social), '') is not null;
alter table public.mentorados enable trigger protege_mentorado;

notify pgrst, 'reload schema';
commit;
