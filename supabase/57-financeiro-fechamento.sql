-- Financeiro, etapa 4 (30/10/2026): MARGEM, FECHAMENTO DO MÊS E DISTRIBUIÇÃO DAS SÓCIAS.
-- 1) fin_planos.estimativa: como cada pessoa vai a cada módulo presencial na conta da margem ({ viagens: { "<modulo>:<pessoa>":
--    { modo: aviao|carro|nao, km } } }); vazio = avião.
-- 2) fin_fechamentos: o retrato do mês fechado (faturamento, despesas, Simples, INSS, líquido, caixa e a parte de cada sócia).
--    Decisão dela (30/10): a distribuição só as SÓCIAS veem. Sócia = administração que também é mentora (a Cintia é administração
--    e não é mentora), pela função eh_socia().
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema. Precisa do 52.

alter table public.fin_planos add column if not exists estimativa jsonb not null default '{}'::jsonb;

create or replace function public.eh_socia() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = auth.uid() and papel = 'admin' and tambem_mentor and coalesce(ativo, true));
$$;

create table if not exists public.fin_fechamentos (
  mes text primary key check (mes ~ '^\d{4}-\d{2}$'),
  numeros jsonb not null,
  observacao text,
  fechado_por uuid references public.perfis (id) on delete set null default auth.uid(),
  fechado_em timestamptz not null default now()
);

alter table public.fin_fechamentos enable row level security;
revoke all on public.fin_fechamentos from anon;
drop policy if exists socias_tudo on public.fin_fechamentos;
create policy socias_tudo on public.fin_fechamentos for all to authenticated using (eh_socia()) with check (eh_socia());

notify pgrst, 'reload schema';

-- Conferência: deve aparecer "ok"
select 'ok' as financeiro_etapa_4;
