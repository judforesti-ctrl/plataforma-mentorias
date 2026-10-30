-- Financeiro (30/10/2026, pedido da Juliana: "não quero depender da Cintia para inserir"): o que a plataforma lança sozinha
-- (despesas da planilha "Controle de NF e recebimentos" e a previsão de faturamento das turmas e mentorias ativas) entra com
-- um recado em "conferir"; a aba Financeiro → Conferir mostra a lista e, ao confirmar ou salvar, o recado sai.
-- Despesa que não é fixa nem de um programa vira "despesa pessoal de" uma sócia (categoria 'socia' + pessoa_id).
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema. Precisa do 52.
alter table public.fin_planos add column if not exists conferir text;
alter table public.fin_despesas add column if not exists conferir text;
alter table public.fin_despesas drop constraint if exists fin_despesas_origem_check;
alter table public.fin_despesas add constraint fin_despesas_origem_check check (origem in ('manual', 'fixa', 'foto', 'extrato', 'planilha'));
create index if not exists fin_despesas_conferir on public.fin_despesas (data) where conferir is not null;
notify pgrst, 'reload schema';
