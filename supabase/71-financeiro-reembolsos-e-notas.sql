-- 71 · Pedidos da Cintia (11/11/2026, pelo WhatsApp, com a Juliana):
-- 1. fin_despesas.grupo: um pagamento dividido entre vários programas vira várias linhas com o mesmo grupo
--    (ex.: o mentor recebe de uma vez por três turmas).
-- 2. fin_receber.nota_arquivo: o PDF da nota emitida, na pasta privada "financeiro" (notas/<cnpj>/<arquivo>).
-- 3. fin_reembolsos: a planilha de reembolso de uma sócia ou de um mentor. Cada gasto vira uma despesa (fin_despesas.reembolso_id)
--    ligada ao cliente, à turma e ao módulo; o PIX do reembolso no extrato é reconhecido sozinho pelo total
--    (fin_movimentos.acao = 'reembolso', fin_movimentos.reembolso_id) e marca tudo como pago.
-- 4. Categorias de despesa novas ficam em configuracoes.financeiro.categorias (sem tabela).
-- Só a administração lê e muda. Pode rodar de novo.

alter table public.fin_despesas add column if not exists grupo uuid;
create index if not exists fin_despesas_grupo on public.fin_despesas (grupo) where grupo is not null;

alter table public.fin_receber add column if not exists nota_arquivo text;

create table if not exists public.fin_reembolsos (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null references public.perfis (id),
  titulo text,                                   -- ex.: "Reembolso de outubro"
  arquivo text,                                  -- nome do arquivo que a Cintia importou
  caminho text,                                  -- cópia na pasta privada financeiro/reembolsos/...
  enviado_em date,                               -- dia em que a planilha foi feita ou enviada
  total numeric(12, 2) not null default 0,
  situacao text not null default 'a_pagar' check (situacao in ('a_pagar', 'pago')),
  pago_em date,
  conta text,
  movimento_id uuid references public.fin_movimentos (id) on delete set null,
  observacoes text,
  criado_por uuid references public.perfis (id) default auth.uid(),
  criado_em timestamptz not null default now()
);
create index if not exists fin_reembolsos_pessoa on public.fin_reembolsos (pessoa_id, situacao);
alter table public.fin_reembolsos enable row level security;
revoke all on public.fin_reembolsos from anon;
drop policy if exists admin_tudo on public.fin_reembolsos;
create policy admin_tudo on public.fin_reembolsos for all to authenticated using (eh_admin()) with check (eh_admin());

alter table public.fin_despesas add column if not exists reembolso_id uuid references public.fin_reembolsos (id) on delete cascade;
create index if not exists fin_despesas_reembolso on public.fin_despesas (reembolso_id) where reembolso_id is not null;
alter table public.fin_despesas drop constraint if exists fin_despesas_origem_check;
alter table public.fin_despesas add constraint fin_despesas_origem_check
  check (origem in ('manual', 'fixa', 'foto', 'extrato', 'planilha', 'reembolso', 'divisao'));

alter table public.fin_movimentos add column if not exists reembolso_id uuid references public.fin_reembolsos (id) on delete set null;
alter table public.fin_movimentos drop constraint if exists fin_movimentos_acao_check;
alter table public.fin_movimentos add constraint fin_movimentos_acao_check
  check (acao in ('recebimento', 'despesa', 'despesa_nova', 'retirada', 'reserva', 'transferencia', 'entrada', 'ignorado', 'reembolso'));

-- a pasta "financeiro" passa a aceitar as planilhas de reembolso
update storage.buckets set allowed_mime_types = array(select distinct unnest(coalesce(allowed_mime_types, '{}'::text[]) || array[
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv',
  'application/vnd.oasis.opendocument.spreadsheet']))
where id = 'financeiro';

select 'script 71 ok' as resultado,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'fin_despesas' and column_name in ('grupo', 'reembolso_id')) as colunas_despesas,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'fin_receber' and column_name = 'nota_arquivo') as coluna_nota,
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'fin_reembolsos') as tabela_reembolsos;
