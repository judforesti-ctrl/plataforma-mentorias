-- Importar proposta (PDF) para criar turmas de mentoria em grupo.
-- A plataforma lê o texto do PDF, a IA organiza em segundo plano e guarda o resultado aqui;
-- a administração revisa e só então cria a turma. Só a administração vê esta tabela.
create table if not exists public.importacoes_proposta (
  id uuid primary key default gen_random_uuid(),
  criado_por uuid references public.perfis (id) default auth.uid(),
  arquivo text,
  status text not null default 'processando' check (status in ('processando', 'pronto', 'erro')),
  resultado jsonb,
  erro text,
  criado_em timestamptz not null default now()
);
alter table public.importacoes_proposta enable row level security;
create policy admin_tudo on public.importacoes_proposta for all to authenticated using (eh_admin()) with check (eh_admin());

-- Local da aula "a definir" (quando a proposta ainda não diz se é online ou presencial).
alter table public.modulos drop constraint if exists modulos_formato_check;
alter table public.modulos add constraint modulos_formato_check
  check (formato in ('meet', 'zoom', 'teams', 'presencial', 'outro', 'indefinido'));
