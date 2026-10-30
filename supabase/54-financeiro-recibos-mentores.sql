-- Financeiro, etapa 2 (30/10/2026): despesa por FOTO DO RECIBO e PAGAMENTO DOS MENTORES PARCEIROS.
-- 1) Recibo: a foto (ou PDF) vai para a pasta privada "financeiro" (recibos/<AAAA-MM>/<arquivo>); a linha em fin_recibos diz
--    à função /api/despesa-recibo qual arquivo ler; a IA devolve data, valor, quem vendeu, tipo e cidade em `resultado` e a tela
--    preenche a despesa (a pessoa confere e salva; o arquivo fica em fin_despesas.comprovante).
-- 2) Mentores: cadastro financeiro (como recebe, valor, cidade de onde sai, dados para pagamento), valor combinado por turma ou
--    programa (vazio = o padrão) com "conferido", e o pagamento de cada mês (linhas calculadas pelas aulas e sessões, que a
--    administração ajusta, aprova e marca como pago; ao pagar viram despesas "Mentores e parceiros" de cada turma/programa).
--    Decisão dela (30/10): o mentor NÃO vê nada disso. Só a administração.
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema. Precisa do 52 e do 53.

-- 1. Recibos lidos pela IA
create table if not exists public.fin_recibos (
  id uuid primary key default gen_random_uuid(),
  caminho text not null,                        -- na pasta "financeiro"
  tipo text,                                    -- image/jpeg, application/pdf...
  status text not null default 'processando' check (status in ('processando', 'pronto', 'erro')),
  resultado jsonb,
  erro text,
  criado_por uuid references public.perfis (id) on delete set null default auth.uid(),
  criado_em timestamptz not null default now()
);

-- 2. Cadastro financeiro do mentor (um por pessoa)
create table if not exists public.fin_mentores (
  perfil_id uuid primary key references public.perfis (id) on delete cascade,
  forma text not null default 'hora' check (forma in ('hora', 'atendimento', 'modulo', 'mensal', 'percentual')),
  valor numeric(14, 2),                         -- R$ por hora/atendimento/módulo/mês, ou % do faturado da turma
  cidade_saida text,                            -- de onde sai para viajar (custo de viagem, etapa 4)
  nome_pagamento text,                          -- nome ou razão social para o pagamento
  documento text,                               -- CPF ou CNPJ
  pix text,
  emite_nota boolean not null default false,
  observacoes text,
  conferido_em timestamptz,
  conferido_por uuid references public.perfis (id) on delete set null,
  atualizado_em timestamptz not null default now()
);

-- 3. Valor combinado por turma ou programa (vazio = o padrão do cadastro)
create table if not exists public.fin_mentor_valores (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  turma_id uuid references public.turmas (id) on delete cascade,
  programa_id uuid references public.programas (id) on delete cascade,
  forma text check (forma in ('hora', 'atendimento', 'modulo', 'mensal', 'percentual')),
  valor numeric(14, 2),
  observacoes text,
  conferido_em timestamptz,
  conferido_por uuid references public.perfis (id) on delete set null,
  atualizado_em timestamptz not null default now(),
  check (turma_id is not null or programa_id is not null)
);
create unique index if not exists fin_mentor_valores_turma on public.fin_mentor_valores (perfil_id, turma_id) where turma_id is not null;
create unique index if not exists fin_mentor_valores_programa on public.fin_mentor_valores (perfil_id, programa_id) where programa_id is not null;

-- 4. Pagamento do mês (um por mentor e mês)
create table if not exists public.fin_pagamentos (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  mes text not null check (mes ~ '^\d{4}-\d{2}$'),
  linhas jsonb not null default '[]'::jsonb,    -- [{turma_id|programa_id, rotulo, forma, quantidade, horas, valor_unit, total, ajuste}]
  total numeric(14, 2) not null default 0,
  situacao text not null default 'aberto' check (situacao in ('aberto', 'aprovado', 'pago')),
  aprovado_em timestamptz,
  aprovado_por uuid references public.perfis (id) on delete set null,
  pago_em date,
  despesas uuid[] not null default '{}',        -- despesas criadas ao pagar (saem se o pagamento for desfeito)
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (perfil_id, mes)
);

-- 5. Regras de acesso: só a administração
do $$
declare t text;
begin
  foreach t in array array['fin_recibos', 'fin_mentores', 'fin_mentor_valores', 'fin_pagamentos']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists admin_tudo on public.%I', t);
    execute format('create policy admin_tudo on public.%I for all to authenticated using (eh_admin()) with check (eh_admin())', t);
  end loop;
end $$;

-- 6. Pasta privada dos comprovantes (só a administração)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('financeiro', 'financeiro', false, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;
drop policy if exists financeiro_ler on storage.objects;
drop policy if exists financeiro_enviar on storage.objects;
drop policy if exists financeiro_apagar on storage.objects;
create policy financeiro_ler on storage.objects for select to authenticated using (bucket_id = 'financeiro' and public.eh_admin());
create policy financeiro_enviar on storage.objects for insert to authenticated with check (bucket_id = 'financeiro' and public.eh_admin());
create policy financeiro_apagar on storage.objects for delete to authenticated using (bucket_id = 'financeiro' and public.eh_admin());

notify pgrst, 'reload schema';

-- Conferência: deve aparecer "ok"
select 'ok' as financeiro_etapa_2;
