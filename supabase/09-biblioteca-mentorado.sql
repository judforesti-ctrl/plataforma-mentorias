-- Biblioteca do mentorado: todos os PDFs do arsenal, sem as fichas técnicas.
-- A ficha técnica (sinais, perguntas, dica da mentora, quando não usar...) continua só para a equipe:
-- o mentorado lê apenas o nome, o resumo, o nível e os temas de cada ferramenta, por esta função.

create or replace function public.catalogo_ferramentas()
returns table (id text, numero text, nome text, arquivo text, resumo text, nivel text, tags jsonb)
language sql stable security definer set search_path = public as $$
  select f.id, f.numero, f.nome, f.arquivo, f.dados ->> 'resumo', f.dados ->> 'nivel', coalesce(f.dados -> 'tags', '[]'::jsonb)
  from ferramentas f
  where auth.uid() is not null
  order by f.numero;
$$;
revoke all on function public.catalogo_ferramentas() from public, anon;
grant execute on function public.catalogo_ferramentas() to authenticated;

-- O mentorado não lê mais a tabela de ferramentas (que guarda a ficha técnica completa), nem das que recebeu:
-- tudo o que ele vê vem da função acima.
drop policy if exists mentorado_ler_recebidas on public.ferramentas;

-- O mentorado pode baixar qualquer PDF do arsenal (antes, só os que o mentor tinha enviado).
drop policy if exists arsenal_mentorado_ler on storage.objects;
create policy arsenal_mentorado_ler on storage.objects for select to authenticated
  using (bucket_id = 'arsenal' and public.meu_mentorado() is not null);
