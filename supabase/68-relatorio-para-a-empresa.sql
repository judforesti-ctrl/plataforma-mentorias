-- Relatório da mentoria para a empresa (pedido da Juliana, 06/11/2026): a leitura macro de um programa de mentoria individual
-- para a diretoria e o RH do cliente. A administração escolhe a empresa e os programas e a IA cruza os registros de todos os
-- mentorados: maiores dificuldades, pontos mais trabalhados, maiores medos e próximos passos. Os números (quantos líderes em cada
-- dificuldade, quantas sessões em cada tema) a plataforma conta a partir das listas que a IA devolve. Nada identifica quem disse
-- o quê. A administração revisa e baixa o PDF (relatorio-empresa.html), com o mesmo desenho do relatório da jornada.
-- Só a administração lê e muda (a tabela tem os nomes dos mentorados por trás de cada número, para conferir).
-- Rodar no SQL Editor do Supabase (New query → colar tudo → Run); pode rodar de novo.

create table if not exists public.relatorios_empresa (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  programas uuid[] not null default '{}',
  titulo text,
  observacoes text,                            -- pedido da equipe para a IA (interno)
  opcoes jsonb not null default '{}'::jsonb,   -- o que entra no PDF: {"tarefas": true, "avaliacao": true, "mentores": true}
  status text not null default 'gerando' check (status in ('gerando', 'rascunho', 'erro')),
  conteudo jsonb not null default '{}'::jsonb, -- {versao, dados (números da plataforma), texto (da IA, revisado)}
  erro text,
  criado_por uuid references public.perfis (id) default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists relatorios_empresa_empresa on public.relatorios_empresa (empresa_id, criado_em desc);
drop trigger if exists relatorios_empresa_atualizado on public.relatorios_empresa;
create trigger relatorios_empresa_atualizado before update on public.relatorios_empresa for each row execute function public.marcar_atualizacao();
alter table public.relatorios_empresa enable row level security;
revoke all on public.relatorios_empresa from anon;
drop policy if exists admin_tudo on public.relatorios_empresa;
create policy admin_tudo on public.relatorios_empresa for all to authenticated using (eh_admin()) with check (eh_admin());

notify pgrst, 'reload schema';

-- Conferência: deve aparecer "ok"
select 'ok' as relatorio_para_a_empresa;
