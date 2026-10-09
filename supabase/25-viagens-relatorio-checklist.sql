-- Viagens (quem paga e quem compra), relatório das turmas para a empresa cliente e checklist de atividades.
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema.
begin;

-- 1. Viagens: o padrão da turma diz quem paga e quem compra passagem, hotel e transporte (Mentorei ou empresa).
--    Cada viagem (modulo_mentores.viagem) pode mudar para aquele mentor; vazio = segue o padrão da turma.
alter table public.turmas add column if not exists viagem_padrao jsonb not null default '{}'::jsonb;

-- 2. Relatório das turmas para a empresa cliente (PDF com a cara da Mentorei).
--    A IA reescreve as percepções dos mentores em linguagem para o cliente; a administração revisa antes de baixar.
--    conteudo = { dados: números e módulos (calculados pelo sistema), texto: o que a IA escreveu e a equipe revisou }
create table if not exists public.relatorios_turmas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  turmas uuid[] not null default '{}',
  titulo text,
  observacoes text,                   -- pedido para a IA (foco, tom, o que destacar)
  status text not null default 'gerando' check (status in ('gerando', 'rascunho', 'erro')),
  conteudo jsonb not null default '{}'::jsonb,
  erro text,
  criado_por uuid references public.perfis (id) default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
drop trigger if exists relatorios_turmas_atualizado on public.relatorios_turmas;
create trigger relatorios_turmas_atualizado before update on public.relatorios_turmas for each row execute function public.marcar_atualizacao();
alter table public.relatorios_turmas enable row level security;
revoke all on public.relatorios_turmas from anon;
drop policy if exists admin_tudo on public.relatorios_turmas;
create policy admin_tudo on public.relatorios_turmas for all to authenticated using (eh_admin()) with check (eh_admin());

-- 3. Checklist: atividades com responsáveis (equipe e administração) e data de entrega (opcional, pode mudar depois).
--    Entram na agenda de cada responsável no dia da entrega.
create table if not exists public.atividades (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  grupo text,                                          -- lista ou projeto (ex.: "Turma Sicredi", "Lançamento do Radar")
  responsaveis uuid[] not null default '{}',
  responsaveis_nomes text[] not null default '{}',     -- nomes na hora de salvar (o mentor não lê os perfis de todos)
  prazo date,
  prazo_hora time,
  passos jsonb not null default '[]'::jsonb,           -- [{ texto, feito }]
  situacao text not null default 'aberta' check (situacao in ('aberta', 'feita')),
  feita_em timestamptz,
  feita_por uuid references public.perfis (id),
  turma_id uuid references public.turmas (id) on delete set null,
  empresa_id uuid references public.empresas (id) on delete set null,
  vinculo_nome text,                                   -- "Empresa · Turma", para mostrar
  avisados uuid[] not null default '{}',               -- quem já recebeu o e-mail de que a atividade é dele
  criado_por uuid references public.perfis (id) default auth.uid(),
  criado_por_nome text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists atividades_prazo on public.atividades (prazo);
create index if not exists atividades_responsaveis on public.atividades using gin (responsaveis);
drop trigger if exists atividades_atualizado on public.atividades;
create trigger atividades_atualizado before update on public.atividades for each row execute function public.marcar_atualizacao();
drop trigger if exists hist_atividades on public.atividades;
create trigger hist_atividades after insert or update or delete on public.atividades for each row execute function public.registrar_historico();

alter table public.atividades enable row level security;
revoke all on public.atividades from anon;
-- Administração: tudo. Equipe: vê e muda as atividades em que é responsável ou que criou; cria (como autora) e apaga as que criou.
drop policy if exists admin_tudo on public.atividades;
create policy admin_tudo on public.atividades for all to authenticated using (eh_admin()) with check (eh_admin());
drop policy if exists atividade_ler on public.atividades;
create policy atividade_ler on public.atividades for select to authenticated
  using (eh_equipe() and (auth.uid() = any (responsaveis) or criado_por = auth.uid()));
drop policy if exists atividade_criar on public.atividades;
create policy atividade_criar on public.atividades for insert to authenticated
  with check (eh_equipe() and criado_por = auth.uid());
drop policy if exists atividade_mudar on public.atividades;
create policy atividade_mudar on public.atividades for update to authenticated
  using (eh_equipe() and (auth.uid() = any (responsaveis) or criado_por = auth.uid()))
  with check (eh_equipe() and (auth.uid() = any (responsaveis) or criado_por = auth.uid()));
drop policy if exists atividade_apagar on public.atividades;
create policy atividade_apagar on public.atividades for delete to authenticated using (eh_equipe() and criado_por = auth.uid());

notify pgrst, 'reload schema';
commit;
