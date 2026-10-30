-- Financeiro, etapa 1 (pedido da Juliana, 30/10/2026): faturamento automático pelas turmas e mentorias.
-- Cada turma ou programa ganha um PLANO DE FATURAMENTO (montado a partir da proposta, com valor que dá para mudar), com uma
-- linha a receber por módulo ou por parcela. A linha passa por: em aberto → nota emitida → recebido (ou cancelado).
-- Despesas: lançadas à mão nesta etapa, e as despesas fixas (agência, Contabilizei...) entram sozinhas todo mês.
-- O faturamento dos meses antigos (planilha da Cintia, 2021 a 2026) e as metas de 2026 ficam em fin_meses.
-- Só a administração vê e mexe em tudo isto.
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema.
begin;

-- 1. Plano de faturamento: um por turma ou por programa de mentoria individual
create table if not exists public.fin_planos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  turma_id uuid references public.turmas (id) on delete set null,
  programa_id uuid references public.programas (id) on delete set null,
  oportunidade_id uuid references public.oportunidades (id) on delete set null,
  titulo text not null,
  modo text not null default 'modulo' check (modo in ('modulo', 'parcelas')),   -- cobra por módulo dado ou por parcela com data
  valor_total numeric(14, 2),
  valor_modulo numeric(14, 2),
  emissor text not null default 'principal' check (emissor in ('principal', 'outro')),   -- qual CNPJ da Mentorei emite a nota
  pagador_nome text,                -- quem paga, quando não é a própria empresa (ex.: Sescoop/PR)
  pagador_cnpj text,
  prazo_dias integer not null default 30 check (prazo_dias between 0 and 180),          -- vencimento depois da nota
  descricao_nota text,              -- texto que vai na nota fiscal
  observacoes text,
  criado_por uuid references public.perfis (id) on delete set null default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists fin_planos_turma on public.fin_planos (turma_id) where turma_id is not null;
create unique index if not exists fin_planos_programa on public.fin_planos (programa_id) where programa_id is not null;
create index if not exists fin_planos_empresa on public.fin_planos (empresa_id);

-- 2. O que a Mentorei tem a receber (uma linha por módulo ou parcela)
create table if not exists public.fin_receber (
  id uuid primary key default gen_random_uuid(),
  plano_id uuid references public.fin_planos (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  modulo_id uuid references public.modulos (id) on delete set null,
  descricao text not null,
  data date,                        -- dia do módulo ou da parcela (vazio = ainda sem data)
  valor numeric(14, 2) not null default 0,
  situacao text not null default 'aberto' check (situacao in ('aberto', 'faturado', 'recebido', 'cancelado')),
  nota_numero integer,
  nota_emitida_em date,
  vencimento date,
  recebido_em date,
  valor_recebido numeric(14, 2),
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists fin_receber_plano on public.fin_receber (plano_id);
create index if not exists fin_receber_data on public.fin_receber (data);
create index if not exists fin_receber_situacao on public.fin_receber (situacao);
create unique index if not exists fin_receber_modulo on public.fin_receber (plano_id, modulo_id) where modulo_id is not null;

-- 3. Despesas fixas (modelo que se repete todo mês) e despesas
create table if not exists public.fin_despesas_fixas (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  categoria text not null default 'outros',
  valor numeric(14, 2) not null,
  dia integer not null default 10 check (dia between 1 and 28),
  conta text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.fin_despesas (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  descricao text not null,
  valor numeric(14, 2) not null check (valor >= 0),
  categoria text not null default 'outros',
  empresa_id uuid references public.empresas (id) on delete set null,
  turma_id uuid references public.turmas (id) on delete set null,
  modulo_id uuid references public.modulos (id) on delete set null,
  programa_id uuid references public.programas (id) on delete set null,
  pessoa_id uuid references public.perfis (id) on delete set null,     -- quem gastou ou quem recebe (parceiro)
  reembolsavel boolean not null default false,                          -- o cliente devolve
  fixa_id uuid references public.fin_despesas_fixas (id) on delete set null,
  competencia text,                                                     -- AAAA-MM, só nas despesas fixas
  pago_em date,
  conta text,
  comprovante text,                                                     -- caminho do arquivo (etapa 2)
  origem text not null default 'manual' check (origem in ('manual', 'fixa', 'foto', 'extrato')),
  observacoes text,
  criado_por uuid references public.perfis (id) on delete set null default auth.uid(),
  criado_em timestamptz not null default now()
);
create index if not exists fin_despesas_data on public.fin_despesas (data);
create unique index if not exists fin_despesas_fixa_mes on public.fin_despesas (fixa_id, competencia) where fixa_id is not null;

-- 4. Meses: faturamento da planilha (antes da plataforma) e meta de cada mês
create table if not exists public.fin_meses (
  mes text primary key check (mes ~ '^\d{4}-\d{2}$'),
  faturado_planilha numeric(14, 2),
  meta numeric(14, 2),
  atualizado_em timestamptz not null default now()
);

-- Faturamento por mês da planilha "Controle de NF e recebimentos" (aba Faturamento 2026) e metas de 2026.
-- Não apaga o que a Cintia já corrigiu na tela: só preenche o que está vazio.
insert into public.fin_meses (mes, faturado_planilha, meta) values
  ('2021-01', 11166.66, null), ('2021-02', 43858.32, null), ('2021-03', 37525, null), ('2021-04', 4788, null), ('2021-05', 3950, null), ('2021-06', 2599, null),
  ('2021-07', 30734, null), ('2021-08', 53874.05, null), ('2021-09', 7999, null), ('2021-10', 107693.38, null), ('2021-11', 10099, null), ('2021-12', 82034, null),
  ('2022-01', 61474.2, null), ('2022-02', 42660, null), ('2022-03', 104134.2, null), ('2022-04', 7456.83, null), ('2022-05', 68865.2, null), ('2022-06', 64066.8, null),
  ('2022-07', 41238, null), ('2022-08', 82860.12, null), ('2022-09', 39215.55, null), ('2022-10', 59781.96, null), ('2022-11', 64907.4, null), ('2022-12', 68933, null),
  ('2023-01', 25688, null), ('2023-02', 11888, null), ('2023-03', 55301.74, null), ('2023-04', 56144, null), ('2023-05', 57013.2, null), ('2023-06', 52333.5, null),
  ('2023-07', 47923, null), ('2023-08', 114272.1, null), ('2023-09', 73951.86, null), ('2023-10', 45668.77, null), ('2023-11', 70674, null), ('2023-12', 51306.6, null),
  ('2024-01', 52364, null), ('2024-02', 9530, null), ('2024-03', 87987.24, null), ('2024-04', 124039.1, null), ('2024-05', 126554.01, null), ('2024-06', 74526.46, null),
  ('2024-07', 155167.2, null), ('2024-08', 86406.95, null), ('2024-09', 128412.07, null), ('2024-10', 119873.32, null), ('2024-11', 316759.27, null), ('2024-12', 213403.41, null),
  ('2025-01', 4500, null), ('2025-02', 83059.5, null), ('2025-03', 134166, null), ('2025-04', 216871.32, null), ('2025-05', 176927.07, null), ('2025-06', 147949.3, null),
  ('2025-07', 82330.59, null), ('2025-08', 138032.2, null), ('2025-09', 206123.61, null), ('2025-10', 154682, null), ('2025-11', 92406, null), ('2025-12', 61350.72, null),
  ('2026-01', 13200, 5400), ('2026-02', 0, 99671.4), ('2026-03', 242781.44, 160999.2), ('2026-04', 157407.47, 260245.58), ('2026-05', 104963.76, 212312.48),
  ('2026-06', 105039.76, 177539.16), ('2026-07', 182393.76, 98796.71), ('2026-08', 98359.36, 165638.64), ('2026-09', 109399.36, 247348.33),
  ('2026-10', null, 185618.4), ('2026-11', null, 110887.2), ('2026-12', null, 73620.86)
on conflict (mes) do update set
  faturado_planilha = coalesce(public.fin_meses.faturado_planilha, excluded.faturado_planilha),
  meta = coalesce(public.fin_meses.meta, excluded.meta);

-- 5. Configuração: a partir de que mês a plataforma conta o faturamento (antes disso vale a planilha), nomes dos CNPJs e
-- imposto estimado (média do Simples na planilha)
insert into public.configuracoes (chave, valor) values
  ('financeiro', '{"inicio": "2026-11", "emissores": {"principal": "Contabilizei", "outro": "Prefeitura"}, "imposto_pct": 11.5}')
on conflict (chave) do nothing;

-- 6. Regras de acesso: só a administração
do $$
declare t text;
begin
  foreach t in array array['fin_planos', 'fin_receber', 'fin_despesas_fixas', 'fin_despesas', 'fin_meses']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists admin_tudo on public.%I', t);
    execute format('create policy admin_tudo on public.%I for all to authenticated using (eh_admin()) with check (eh_admin())', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;
