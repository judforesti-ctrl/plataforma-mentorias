-- Duas mudanças pedidas pela Juliana (2026-10-14):
-- 1. Sessões concluídas: o mentor do mentorado completa e corrige QUALQUER sessão, sem prazo (antes: 7 dias, script 36).
--    Só a administração mexe na data de conclusão. Toda mudança depois de concluída continua no histórico.
-- 2. Envios do mentorado: o mentorado anexa documentos (tarefa feita, ferramenta preenchida ou outro documento) com um recado,
--    e os mentores dele recebem. Arquivos na pasta privada "entregas", em "<id do mentorado>/<id do envio>/<arquivo>".
--    Quem vê: o próprio mentorado, os mentores dele e a administração. O mentor marca como visto ao abrir o arquivo.
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema.

-- ---------- 1. sessões concluídas sem prazo para o mentor ----------
create or replace function public.trava_sessao_concluida() returns trigger
language plpgsql security definer set search_path = public as $$
declare concluida timestamptz; v_mentorado uuid;
begin
  if tg_table_name = 'sessoes' then
    concluida := old.concluida_em; v_mentorado := old.mentorado_id;
  else
    select concluida_em, mentorado_id into concluida, v_mentorado from sessoes where id = old.sessao_id;
  end if;
  if concluida is not null and not eh_admin() then
    -- o mentor do mentorado completa e corrige quando quiser (sem mexer na conclusão)
    if eh_mentor_de(v_mentorado) then
      if tg_table_name = 'sessoes' and (new.concluida_em is distinct from old.concluida_em
         or new.concluida_por is distinct from old.concluida_por or new.mentorado_id is distinct from old.mentorado_id) then
        raise exception 'Só a administração muda a conclusão da sessão.';
      end if;
      return new;
    end if;
    -- o mentorado ainda pode marcar a própria tarefa como feita
    if tg_table_name = 'sessoes' and auth.uid() = (select perfil_id from mentorados where id = old.mentorado_id)
       and (to_jsonb(new) - 'tarefa_feita_em' - 'tarefa_comentario' - 'atualizado_em')
         = (to_jsonb(old) - 'tarefa_feita_em' - 'tarefa_comentario' - 'atualizado_em') then
      return new;
    end if;
    raise exception 'Sessão concluída: só os mentores do mentorado e a administração podem alterar.';
  end if;
  return new;
end $$;

create or replace function public.protege_tarefa() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_mentorado uuid;
begin
  select mentorado_id into v_mentorado from sessoes where id = coalesce(new.sessao_id, old.sessao_id);
  if tg_op <> 'DELETE' then
    new.mentorado_id := v_mentorado;
    new.atualizado_em := now();
  end if;
  if auth.uid() is null or eh_admin() or eh_mentor_de(v_mentorado) then return coalesce(new, old); end if;
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'feita_em' - 'comentario' - 'atualizado_em') = (to_jsonb(old) - 'feita_em' - 'comentario' - 'atualizado_em') then
    return new;
  end if;
  raise exception 'O mentorado só pode marcar a própria tarefa como feita.';
end $$;

-- ---------- 2. envios do mentorado ----------
create table if not exists public.entregas (
  id uuid primary key default gen_random_uuid(),
  mentorado_id uuid not null references public.mentorados (id) on delete cascade,
  tipo text not null default 'documento' check (tipo in ('tarefa', 'ferramenta', 'documento')),
  tarefa_id uuid,                                   -- tarefa da tabela "tarefas" (script 33), quando é uma tarefa
  sessao_id uuid references public.sessoes (id) on delete set null,
  ferramenta_id text references public.ferramentas (id) on delete set null,
  titulo text,                                      -- o que é (texto da tarefa, nome da ferramenta ou o que o mentorado escreveu)
  mensagem text,                                    -- recado do mentorado para os mentores
  arquivos jsonb not null default '[]'::jsonb,      -- [{ caminho, nome, tamanho, tipo }]
  enviado_por uuid references public.perfis (id) default auth.uid(),
  enviado_em timestamptz not null default now(),
  visto_em timestamptz,                             -- quando um mentor abriu pela primeira vez
  visto_por uuid references public.perfis (id),
  avisado_em timestamptz                            -- e-mail aos mentores já saiu (/api/entrega)
);
create index if not exists entregas_mentorado on public.entregas (mentorado_id, enviado_em desc);

-- o mentor só marca como visto; o resto não muda depois de enviado
create or replace function public.protege_entrega() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or eh_admin() then return new; end if;
  if (to_jsonb(new) - 'visto_em' - 'visto_por') <> (to_jsonb(old) - 'visto_em' - 'visto_por') then
    raise exception 'Depois de enviado, só dá para marcar como visto.';
  end if;
  return new;
end $$;
drop trigger if exists protege_entrega on public.entregas;
create trigger protege_entrega before update on public.entregas for each row execute function public.protege_entrega();

alter table public.entregas enable row level security;
drop policy if exists entrega_admin on public.entregas;
drop policy if exists entrega_mentor_ler on public.entregas;
drop policy if exists entrega_mentor_visto on public.entregas;
drop policy if exists entrega_mentorado_ler on public.entregas;
drop policy if exists entrega_mentorado_enviar on public.entregas;
drop policy if exists entrega_mentorado_apagar on public.entregas;
create policy entrega_admin on public.entregas for all to authenticated using (eh_admin()) with check (eh_admin());
create policy entrega_mentor_ler on public.entregas for select to authenticated using (eh_mentor_de(mentorado_id));
create policy entrega_mentor_visto on public.entregas for update to authenticated
  using (eh_mentor_de(mentorado_id)) with check (eh_mentor_de(mentorado_id));
create policy entrega_mentorado_ler on public.entregas for select to authenticated using (mentorado_id = meu_mentorado());
create policy entrega_mentorado_enviar on public.entregas for insert to authenticated
  with check (mentorado_id = meu_mentorado() and enviado_por = auth.uid());
create policy entrega_mentorado_apagar on public.entregas for delete to authenticated using (mentorado_id = meu_mentorado());

-- pasta privada dos arquivos (25 MB por arquivo): PDF, Word, Excel, PowerPoint, LibreOffice, texto e fotos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('entregas', 'entregas', false, 26214400, array[
  'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet', 'application/vnd.oasis.opendocument.presentation',
  'text/plain', 'text/csv', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- quem pode abrir os arquivos de um mentorado (pela pasta com o id dele)
create or replace function public.pode_ver_entregas(p_pasta text) returns boolean
language sql stable security definer set search_path = public as $$
  select eh_admin()
      or exists (select 1 from mentor_mentorado where mentorado_id::text = p_pasta and mentor_id = auth.uid())
      or exists (select 1 from mentorados where id::text = p_pasta and perfil_id = auth.uid());
$$;

drop policy if exists entregas_enviar on storage.objects;
drop policy if exists entregas_ler on storage.objects;
drop policy if exists entregas_apagar on storage.objects;
create policy entregas_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'entregas' and (storage.foldername(name))[1] = public.meu_mentorado()::text);
create policy entregas_ler on storage.objects for select to authenticated
  using (bucket_id = 'entregas' and public.pode_ver_entregas((storage.foldername(name))[1]));
create policy entregas_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'entregas' and (owner = auth.uid() or public.eh_admin()));

notify pgrst, 'reload schema';

-- Conferência: deve aparecer "ok"
select 'ok' as sessoes_livres_e_entregas;
