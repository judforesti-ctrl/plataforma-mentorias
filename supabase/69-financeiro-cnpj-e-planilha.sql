-- 69 · Financeiro separado por CNPJ + importação da planilha da Cintia (11/11/2026, pedido da Juliana:
-- "você deve sempre separar os faturamentos por CNPJ" e "um campo onde a Cintia possa importar a planilha que ela ainda usa
-- para a emissão de notas, até ela parar de usar a planilha").
-- 1. fin_receber.emissor: qual CNPJ da Mentorei emite a nota daquela linha. Vazio = o do plano (fin_planos.emissor); serve
--    para as linhas avulsas, que não têm plano.
-- 2. fin_importacoes: cada importação da planilha, com o que mudou e como estava antes (para "Desfazer a importação").
-- Só a administração lê e muda. Pode rodar de novo.

alter table public.fin_receber add column if not exists emissor text;
alter table public.fin_receber drop constraint if exists fin_receber_emissor_check;
alter table public.fin_receber add constraint fin_receber_emissor_check check (emissor is null or emissor in ('principal', 'outro'));

create table if not exists public.fin_importacoes (
  id uuid primary key default gen_random_uuid(),
  arquivo text,
  resumo jsonb not null default '{}'::jsonb,     -- {itens, iguais, mudadas, criadas, meses}
  mudancas jsonb not null default '[]'::jsonb,   -- [{tabela, id, antes, depois}] (antes = null quando a linha foi criada)
  desfeita_em timestamptz,
  criado_por uuid references public.perfis (id) default auth.uid(),
  criado_em timestamptz not null default now()
);
create index if not exists fin_importacoes_criado on public.fin_importacoes (criado_em desc);
alter table public.fin_importacoes enable row level security;
revoke all on public.fin_importacoes from anon;
drop policy if exists admin_tudo on public.fin_importacoes;
create policy admin_tudo on public.fin_importacoes for all to authenticated using (eh_admin()) with check (eh_admin());

notify pgrst, 'reload schema';

-- Conferência: deve aparecer "ok"
select 'ok' as financeiro_cnpj_e_planilha;
