-- Arquivo para a contabilidade (31/10/2026, pedido da Juliana): a Cintia marca em Financeiro → Emitir nota o que vai virar nota e
-- baixa uma planilha com tudo o que a Contabilizei precisa para emitir (as mesmas colunas da planilha de notas fiscais dela).
-- 1) fin_tomadores: os dados de quem recebe a nota (razão social, CNPJ/CPF, endereço, código do município do IBGE, e-mail) e as
--    retenções de costume (% sobre o valor), carregados da planilha de notas fiscais e completados na tela.
-- 2) fin_receber.contabilidade_em: quando a linha foi mandada para a contabilidade (aparece em Emitir nota até a nota sair).
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema. Precisa do 52.

create table if not exists public.fin_tomadores (
  documento text primary key check (documento ~ '^\d{11}$|^\d{14}$'),   -- CPF ou CNPJ, só números
  razao_social text not null,
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  codigo_municipio text,
  cidade text,
  uf text,
  cep text,
  telefone text,
  email text,
  retencoes jsonb not null default '{}'::jsonb,                          -- { iss, pis, cofins, inss, ir, csll } em %
  ultima_nota date,
  observacao text,
  atualizado_em timestamptz not null default now()
);

alter table public.fin_receber add column if not exists contabilidade_em timestamptz;

alter table public.fin_tomadores enable row level security;
revoke all on public.fin_tomadores from anon;
drop policy if exists admin_tudo on public.fin_tomadores;
create policy admin_tudo on public.fin_tomadores for all to authenticated using (eh_admin()) with check (eh_admin());

notify pgrst, 'reload schema';

-- Conferência: deve aparecer "ok"
select 'ok' as arquivo_contabilidade;
