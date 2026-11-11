-- 72 · Planejamento estratégico 2027 dentro da plataforma (pedido da Juliana, 11/11/2026)
-- "Algumas pessoas não têm conta no Claude. Quero que cada um tenha o seu login e que cada comentário fique guardado no
-- nome da pessoa." O site do planejamento (antes um artifact do Claude) passa a ser /planejamento.html, com o login da
-- plataforma. Quem vê o quê:
--   administração (sócias e Cintia) = editora: decide, edita, vê os valores em reais;
--   quem a administração inclui em planejamento_membros = colaboradora (faz a jornada e comenta) ou leitora (só lê);
--   o financeiro do planejamento (coleções fin e finpremissas) só a administração lê.
-- Os dados ficam em planejamento_docs como documentos (coleção + id + dados jsonb), no mesmo formato do artifact.
-- O conteúdo do plano (vertentes, concorrentes, decisões...) é o documento conteudo/base: fica no banco, não em arquivo
-- público do site. Pode rodar de novo.

create table if not exists public.planejamento_membros (
  perfil_id uuid primary key references public.perfis(id) on delete cascade,
  nivel text not null check (nivel in ('colaboradora', 'leitora')),
  incluido_por uuid references public.perfis(id) on delete set null,
  incluido_em timestamptz not null default now()
);
alter table public.planejamento_membros enable row level security;

drop policy if exists plan_membros_admin on public.planejamento_membros;
create policy plan_membros_admin on public.planejamento_membros for all using (public.eh_admin()) with check (public.eh_admin());
drop policy if exists plan_membros_o_seu on public.planejamento_membros;
create policy plan_membros_o_seu on public.planejamento_membros for select using (perfil_id = auth.uid());

-- Nível de quem está usando: 'editora' (administração ativa), 'colaboradora', 'leitora' ou null (sem acesso).
create or replace function public.planejamento_nivel() returns text
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from perfis where id = auth.uid() and papel = 'admin' and ativo) then 'editora'
    else (select m.nivel from planejamento_membros m join perfis p on p.id = m.perfil_id
          where m.perfil_id = auth.uid() and p.ativo)
  end;
$$;
revoke all on function public.planejamento_nivel() from public, anon;
grant execute on function public.planejamento_nivel() to authenticated;

create table if not exists public.planejamento_docs (
  colecao text not null check (colecao ~ '^[a-z]+$'),
  id text not null check (char_length(id) between 1 and 120),
  dados jsonb not null,
  por uuid default auth.uid() references public.perfis(id) on delete set null,
  em timestamptz not null default now(),
  primary key (colecao, id)
);
alter table public.planejamento_docs enable row level security;

-- Leitura: administração lê tudo; quem participa lê o plano sem o financeiro, e da jornada só a própria.
drop policy if exists plan_docs_ler on public.planejamento_docs;
create policy plan_docs_ler on public.planejamento_docs for select using (
  public.planejamento_nivel() = 'editora'
  or (public.planejamento_nivel() in ('colaboradora', 'leitora') and colecao not in ('fin', 'finpremissas')
      and (colecao <> 'jornada' or id = auth.uid()::text))
);
drop policy if exists plan_docs_editora on public.planejamento_docs;
create policy plan_docs_editora on public.planejamento_docs for all
  using (public.planejamento_nivel() = 'editora') with check (public.planejamento_nivel() = 'editora');
-- colaboradora: só os próprios comentários (criar e apagar), sempre no nome dela
drop policy if exists plan_docs_comentar on public.planejamento_docs;
create policy plan_docs_comentar on public.planejamento_docs for insert with check (
  colecao = 'comentarios' and public.planejamento_nivel() = 'colaboradora'
  and por = auth.uid() and dados->>'autor' = auth.uid()::text
);
drop policy if exists plan_docs_apagar_comentario on public.planejamento_docs;
create policy plan_docs_apagar_comentario on public.planejamento_docs for delete using (
  colecao = 'comentarios' and public.planejamento_nivel() = 'colaboradora' and por = auth.uid()
);

-- Jornada (pedido da Juliana, 11/11/2026): cada pessoa percorre o plano clicando nas suas escolhas e pode parar e voltar.
-- Um documento por pessoa (coleção jornada, id = o login). A colaboradora cria e muda só a dela; a leitora não responde;
-- a administração lê todas (relatório geral com convergências e divergências).
drop policy if exists plan_docs_jornada_criar on public.planejamento_docs;
create policy plan_docs_jornada_criar on public.planejamento_docs for insert with check (
  colecao = 'jornada' and id = auth.uid()::text and por = auth.uid() and public.planejamento_nivel() = 'colaboradora'
);
drop policy if exists plan_docs_jornada_mudar on public.planejamento_docs;
create policy plan_docs_jornada_mudar on public.planejamento_docs for update
  using (colecao = 'jornada' and id = auth.uid()::text and public.planejamento_nivel() = 'colaboradora')
  with check (colecao = 'jornada' and id = auth.uid()::text and por = auth.uid() and public.planejamento_nivel() = 'colaboradora');

-- Nomes e fotos de quem participa (mentor não lê os perfis da equipe): só para quem tem acesso ao planejamento.
create or replace function public.planejamento_pessoas()
returns table (id uuid, nome text, foto_url text, nivel text)
language sql stable security definer set search_path = public as $$
  select p.id, p.nome, p.foto_url, case when p.papel = 'admin' then 'editora' else m.nivel end
  from perfis p left join planejamento_membros m on m.perfil_id = p.id
  where public.planejamento_nivel() is not null and p.ativo and (p.papel = 'admin' or m.perfil_id is not null)
  order by p.nome;
$$;
revoke all on function public.planejamento_pessoas() from public, anon;
grant execute on function public.planejamento_pessoas() to authenticated;
