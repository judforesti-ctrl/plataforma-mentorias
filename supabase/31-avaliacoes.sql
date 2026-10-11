-- Avaliação das turmas (substitui o Google Forms). Cada módulo tem o próprio link e QR code (a plataforma faz sozinha);
-- o aluno responde sem login e de forma ANÔNIMA: não se guarda nome, e-mail, login nem endereço de internet de quem respondeu.
-- Quem grava a resposta é o servidor (/api/avaliar); ninguém de fora lê ou escreve nestas tabelas.
-- A administração vê tudo (Gestão › Avaliações). O mentor vê as avaliações dos módulos dele e só a PRÓPRIA nota de mentor,
-- nunca a do colega. 24 horas depois do fim do módulo, cada mentor recebe o resumo por e-mail (avaliacoes-email).
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema.
begin;

-- 1. as respostas (uma linha por aluno que respondeu)
create table if not exists public.avaliacoes (
  id uuid primary key default gen_random_uuid(),
  modulo_id uuid references public.modulos (id) on delete set null,
  turma_id uuid references public.turmas (id) on delete set null,
  empresa_id uuid references public.empresas (id) on delete set null,
  origem text not null default 'plataforma' check (origem in ('plataforma', 'google_forms')),
  formacao text,                                       -- só nas respostas antigas do Google Forms (o aluno escrevia o nome)
  geral smallint check (geral between 0 and 10),       -- nota geral do encontro
  aula smallint check (aula between 1 and 5),          -- carinhas de 1 a 5
  conteudo smallint check (conteudo between 1 and 5),
  ferramentas smallint check (ferramentas between 1 and 5),
  aprendeu text check (aprendeu in ('quase_nada', 'um_pouco', 'bastante', 'muito')),
  tempo text check (tempo in ('curto', 'na_medida', 'longo')),
  nps smallint check (nps between 0 and 10),           -- recomendaria a Mentorei
  marcas text[] not null default '{}',                 -- atalhos de um toque ("Exemplos práticos"...)
  comentario text,
  temas text[] not null default '{}',                  -- temas que gostaria de aprender
  extras jsonb not null default '{}'::jsonb,           -- perguntas do formulário antigo que não existem mais
  criado_em timestamptz not null default now()
);
create index if not exists avaliacoes_modulo on public.avaliacoes (modulo_id);
create index if not exists avaliacoes_criado on public.avaliacoes (criado_em);

-- 2. a nota de cada mentor do módulo (quando são dois, cada um tem a sua)
create table if not exists public.avaliacao_mentores (
  avaliacao_id uuid not null references public.avaliacoes (id) on delete cascade,
  mentor_id uuid not null references public.perfis (id) on delete cascade,
  nota smallint not null check (nota between 1 and 5),
  primary key (avaliacao_id, mentor_id)
);
create index if not exists avaliacao_mentores_mentor on public.avaliacao_mentores (mentor_id);

-- 3. quando o resumo foi mandado aos mentores (para não mandar duas vezes)
alter table public.modulos add column if not exists avaliacao_aviso_em timestamptz;
alter table public.modulos add column if not exists avaliacao_aviso_qtd integer;

-- 4. quem vê
alter table public.avaliacoes enable row level security;
alter table public.avaliacao_mentores enable row level security;
revoke all on public.avaliacoes from anon;
revoke all on public.avaliacao_mentores from anon;
drop policy if exists admin_tudo on public.avaliacoes;
create policy admin_tudo on public.avaliacoes for all to authenticated using (eh_admin()) with check (eh_admin());
drop policy if exists mentor_ler on public.avaliacoes;
create policy mentor_ler on public.avaliacoes for select to authenticated using (modulo_id is not null and eh_mentor_do_modulo(modulo_id));
drop policy if exists admin_tudo on public.avaliacao_mentores;
create policy admin_tudo on public.avaliacao_mentores for all to authenticated using (eh_admin()) with check (eh_admin());
drop policy if exists mentor_ler on public.avaliacao_mentores;
create policy mentor_ler on public.avaliacao_mentores for select to authenticated using (mentor_id = auth.uid());

-- 5. o contador da tela de agradecimento: média de recomendação (0 a 10) e total de avaliações
create or replace function public.avaliacao_contador() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('media', round(avg(nps)::numeric, 1), 'total', count(*)) from avaliacoes;
$$;
revoke all on function public.avaliacao_contador() from public, anon, authenticated;
grant execute on function public.avaliacao_contador() to service_role;

commit;
