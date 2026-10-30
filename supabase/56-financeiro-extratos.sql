-- Financeiro, etapa 3 (30/10/2026): EXTRATO DO BANCO E CONFERÊNCIA DAS CONTAS.
-- A administração sobe o extrato do Sicoob ou da Unicred (o PDF do internet banking, ou OFX); a tela lê os movimentos, guarda o
-- arquivo na pasta privada "financeiro" (extratos/<conta>/...) e cada movimento vira uma linha em fin_movimentos (a chave evita
-- repetir quando o mesmo período é importado de novo). Depois cada movimento é conferido: entrada = recebimento de uma nota
-- (fin_receber) ou outra entrada; saída = despesa que já existe, despesa nova, retirada de sócia, aplicação na reserva,
-- transferência entre contas ou nada. O que a pessoa ensina ("lembrar") vira regra em fin_regras_extrato e vale sozinho nos
-- próximos extratos.
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema. Precisa do 52 ao 54.

-- 1. Extratos importados
create table if not exists public.fin_extratos (
  id uuid primary key default gen_random_uuid(),
  conta text not null,                          -- Sicoob, Unicred
  numero_conta text,
  arquivo text,                                 -- nome do arquivo
  caminho text,                                 -- na pasta "financeiro"
  formato text,                                 -- sicoob_pdf, unicred_pdf, ofx
  periodo_de date,
  periodo_ate date,
  saldo_inicial numeric(14, 2),
  saldo_final numeric(14, 2),
  movimentos integer not null default 0,
  novos integer not null default 0,
  criado_por uuid references public.perfis (id) on delete set null default auth.uid(),
  criado_em timestamptz not null default now()
);

-- 2. Regras aprendidas ("quando o texto tiver X, é sempre Y")
create table if not exists public.fin_regras_extrato (
  id uuid primary key default gen_random_uuid(),
  texto text not null,                          -- pedaço do texto do extrato (sem acento, minúsculo)
  sentido text not null default 'saida' check (sentido in ('entrada', 'saida')),
  acao text not null check (acao in ('despesa', 'retirada', 'reserva', 'transferencia', 'entrada', 'ignorado')),
  categoria text,
  descricao text,
  empresa_id uuid references public.empresas (id) on delete set null,
  turma_id uuid references public.turmas (id) on delete set null,
  programa_id uuid references public.programas (id) on delete set null,
  pessoa_id uuid references public.perfis (id) on delete set null,
  observacao text,
  usos integer not null default 0,
  criado_por uuid references public.perfis (id) on delete set null default auth.uid(),
  criado_em timestamptz not null default now()
);

-- 3. Movimentos do extrato
create table if not exists public.fin_movimentos (
  id uuid primary key default gen_random_uuid(),
  extrato_id uuid references public.fin_extratos (id) on delete set null,
  conta text not null,
  data date not null,
  historico text not null,
  detalhe text,                                 -- favorecido, remetente, CNPJ/CPF
  documento text,                               -- número do documento no banco
  valor numeric(14, 2) not null,                -- + entrou, − saiu
  chave text not null unique,                   -- conta + dia + valor + texto + ordem (não repete ao importar de novo)
  situacao text not null default 'pendente' check (situacao in ('pendente', 'conciliado')),
  acao text check (acao in ('recebimento', 'despesa', 'despesa_nova', 'retirada', 'reserva', 'transferencia', 'entrada', 'ignorado')),
  receber_ids uuid[] not null default '{}',
  despesa_id uuid references public.fin_despesas (id) on delete set null,
  pessoa_id uuid references public.perfis (id) on delete set null,
  regra_id uuid references public.fin_regras_extrato (id) on delete set null,
  observacao text,
  desfazer jsonb,                               -- o que voltar se a conferência for desfeita
  conciliado_por uuid references public.perfis (id) on delete set null,
  conciliado_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists fin_movimentos_data on public.fin_movimentos (data);
create index if not exists fin_movimentos_situacao on public.fin_movimentos (situacao);

-- 4. Regras de acesso: só a administração
do $$
declare t text;
begin
  foreach t in array array['fin_extratos', 'fin_regras_extrato', 'fin_movimentos']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists admin_tudo on public.%I', t);
    execute format('create policy admin_tudo on public.%I for all to authenticated using (eh_admin()) with check (eh_admin())', t);
  end loop;
end $$;

-- 5. A pasta "financeiro" passa a aceitar também o extrato em OFX (texto)
update storage.buckets set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf', 'application/x-ofx', 'application/vnd.intu.qfx', 'text/plain', 'application/octet-stream']
where id = 'financeiro';

notify pgrst, 'reload schema';

-- Conferência: deve aparecer "ok"
select 'ok' as financeiro_etapa_3;
