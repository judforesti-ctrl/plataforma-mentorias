-- Ferramentas da trilha (fase 2 da área do aluno, pedido da Juliana em 28/10/2026).
-- A administração escolhe, na página da turma, quais ferramentas online os alunos fazem e em que módulo cada uma abre
-- (ou desde o começo). O aluno faz na área dele e o resultado fica para ele e para os mentores da trilha: a empresa nunca vê.
-- O resultado do aluno vai para testes_alunos (a tabela "testes" é do mentorado individual e exige a ficha dele).
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema.

-- 1. Quais ferramentas cada turma tem e quando abrem
create table if not exists public.turma_ferramentas (
  id uuid primary key default gen_random_uuid(),
  turma_id uuid not null references public.turmas (id) on delete cascade,
  ferramenta_id text not null references public.ferramentas (id) on delete cascade,
  modulo_id uuid references public.modulos (id) on delete set null,   -- vazio = aberta desde o começo; senão abre no dia do módulo
  ordem int not null default 0,
  criado_por uuid references public.perfis (id) default auth.uid(),
  criado_em timestamptz not null default now()
);
create unique index if not exists turma_ferramentas_unica on public.turma_ferramentas (turma_id, ferramenta_id);

alter table public.turma_ferramentas enable row level security;
drop policy if exists admin_tudo on public.turma_ferramentas;
create policy admin_tudo on public.turma_ferramentas for all to authenticated using (eh_admin()) with check (eh_admin());
drop policy if exists mentor_ler on public.turma_ferramentas;
create policy mentor_ler on public.turma_ferramentas for select to authenticated using (eh_mentor_da_turma(turma_id));

-- 2. Resultados dos alunos
create table if not exists public.testes_alunos (
  id uuid primary key default gen_random_uuid(),
  turma_id uuid not null references public.turmas (id) on delete cascade,
  perfil_id uuid not null references public.perfis (id) on delete cascade default auth.uid(),
  ferramenta_id text not null,
  nome text not null,
  resultado jsonb not null default '{}'::jsonb,
  feito_em date,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists testes_alunos_turma on public.testes_alunos (turma_id);
create index if not exists testes_alunos_perfil on public.testes_alunos (perfil_id);

alter table public.testes_alunos enable row level security;
drop policy if exists admin_tudo on public.testes_alunos;
create policy admin_tudo on public.testes_alunos for all to authenticated using (eh_admin()) with check (eh_admin());
drop policy if exists mentor_ler on public.testes_alunos;
create policy mentor_ler on public.testes_alunos for select to authenticated using (eh_mentor_da_turma(turma_id));
drop policy if exists aluno_ler on public.testes_alunos;
create policy aluno_ler on public.testes_alunos for select to authenticated using (perfil_id = auth.uid());
drop policy if exists aluno_criar on public.testes_alunos;
create policy aluno_criar on public.testes_alunos for insert to authenticated
  with check (perfil_id = auth.uid() and eh_aluno_da_turma(turma_id));
drop policy if exists aluno_atualizar on public.testes_alunos;
create policy aluno_atualizar on public.testes_alunos for update to authenticated
  using (perfil_id = auth.uid()) with check (perfil_id = auth.uid() and eh_aluno_da_turma(turma_id));

-- 3. O que o aluno vê: as ferramentas da trilha dele, com o módulo em que abrem e quando ele fez (o aluno não lê turmas nem módulos direto)
create or replace function public.ferramentas_da_trilha(p_turma uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'ferramenta_id', tf.ferramenta_id, 'nome', f.nome, 'resumo', f.dados ->> 'resumo',
    'modulo_id', m.id, 'modulo_numero', m.numero, 'modulo_titulo', m.titulo, 'modulo_data', m.data_hora,
    'feito_em', (select max(x.feito_em) from testes_alunos x
                 where x.turma_id = tf.turma_id and x.perfil_id = auth.uid() and x.ferramenta_id = tf.ferramenta_id)
  ) order by m.numero nulls first, tf.ordem, f.nome), '[]'::jsonb)
  from turma_ferramentas tf
  join ferramentas f on f.id = tf.ferramenta_id
  left join modulos m on m.id = tf.modulo_id
  where tf.turma_id = p_turma and (eh_aluno_da_turma(p_turma) or eh_admin() or eh_mentor_da_turma(p_turma));
$$;
revoke all on function public.ferramentas_da_trilha(uuid) from public, anon;
grant execute on function public.ferramentas_da_trilha(uuid) to authenticated;
