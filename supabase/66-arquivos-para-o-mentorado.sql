-- Arquivos que o mentor manda para o mentorado (pedido da Juliana, 05/11/2026): PowerPoint, PDF, Word, Excel ou foto,
-- na tela da sessão ou na ficha. O mentorado baixa em Minha mentoria; o mentor vê quando ele baixou.
-- Os arquivos ficam na mesma pasta privada "entregas" (script 37), em "<mentorado>/do-mentor/<arquivo>".
-- Precisa do script 37. Rodar no SQL Editor do Supabase (New query → colar tudo → Run); pode rodar de novo.

create table if not exists public.arquivos_mentorado (
  id uuid primary key default gen_random_uuid(),
  mentorado_id uuid not null references public.mentorados (id) on delete cascade,
  sessao_id uuid references public.sessoes (id) on delete set null,   -- vazio = mandado pela ficha, fora de uma sessão
  nome text not null,                                                  -- nome do arquivo, como o mentorado vê
  caminho text not null,                                               -- na pasta privada "entregas"
  tamanho bigint,
  tipo text,
  recado text,                                                         -- recado do mentor (opcional)
  enviado_por uuid references public.perfis (id) default auth.uid(),
  enviado_em timestamptz not null default now(),
  baixado_em timestamptz                                               -- primeira vez que o mentorado baixou
);
create index if not exists arquivos_mentorado_mentorado on public.arquivos_mentorado (mentorado_id, enviado_em desc);

alter table public.arquivos_mentorado enable row level security;
drop policy if exists am_admin on public.arquivos_mentorado;
drop policy if exists am_mentor_ler on public.arquivos_mentorado;
drop policy if exists am_mentor_enviar on public.arquivos_mentorado;
drop policy if exists am_mentor_apagar on public.arquivos_mentorado;
drop policy if exists am_mentorado_ler on public.arquivos_mentorado;
create policy am_admin on public.arquivos_mentorado for all to authenticated using (eh_admin()) with check (eh_admin());
create policy am_mentor_ler on public.arquivos_mentorado for select to authenticated using (eh_mentor_de(mentorado_id));
create policy am_mentor_enviar on public.arquivos_mentorado for insert to authenticated
  with check (eh_mentor_de(mentorado_id) and enviado_por = auth.uid());
create policy am_mentor_apagar on public.arquivos_mentorado for delete to authenticated
  using (eh_mentor_de(mentorado_id) and enviado_por = auth.uid());
create policy am_mentorado_ler on public.arquivos_mentorado for select to authenticated using (mentorado_id = meu_mentorado());

-- o mentorado só marca que baixou (nada mais muda)
create or replace function public.marcar_arquivo_baixado(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update arquivos_mentorado set baixado_em = now()
   where id = p_id and baixado_em is null and mentorado_id = meu_mentorado();
$$;
grant execute on function public.marcar_arquivo_baixado(uuid) to authenticated;

-- pasta "entregas": apresentações com imagens passam de 25 MB, então o limite sobe para 50 MB (o mesmo das turmas)
update storage.buckets set file_size_limit = 52428800 where id = 'entregas';

-- o mentor do mentorado (e a administração) põe arquivos em "<mentorado>/do-mentor/"; ler e apagar já valem pelo script 37
drop policy if exists entregas_mentor_enviar on storage.objects;
create policy entregas_mentor_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'entregas' and (storage.foldername(name))[2] = 'do-mentor'
              and (public.eh_admin()
                   or exists (select 1 from public.mentor_mentorado
                               where mentorado_id::text = (storage.foldername(name))[1] and mentor_id = auth.uid())));

notify pgrst, 'reload schema';

-- Conferência: deve aparecer "ok"
select 'ok' as arquivos_para_o_mentorado;
