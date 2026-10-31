-- Notas fiscais dos mentores parceiros e agenda de pagamentos (30/10/2026, pedido da Juliana).
-- O mentor completa os dados para pagamento (mentor_pagamento_dados) e envia a nota fiscal de serviço do mês pela plataforma
-- (fin_notas_mentor + arquivo na pasta privada "financeiro", em notas-mentores/<id do mentor>/...). A plataforma calcula a data
-- prevista: a Mentorei paga nos dias 5, 15 e 25 (fim de semana ou feriado = dia útil seguinte); a nota entra no primeiro desses
-- dias que vier pelo menos 3 dias depois do envio e depois do fim do mês da nota. "Fora da curva" = pagar_em (a administração muda).
-- O mentor vê só as notas dele, a data prevista e a situação; nunca quanto a plataforma calcula que ele tem a receber.
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema. Precisa do 54.

-- 1. Dados para pagamento, que o próprio mentor preenche
create table if not exists public.mentor_pagamento_dados (
  perfil_id uuid primary key references public.perfis (id) on delete cascade,
  tipo text check (tipo in ('pf', 'pj')),
  nome_pagamento text,
  documento text,
  pix_tipo text,
  pix text,
  banco text,
  agencia text,
  conta text,
  atualizado_em timestamptz not null default now()
);

-- 2. Notas fiscais enviadas
create table if not exists public.fin_notas_mentor (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfis (id) on delete cascade default auth.uid(),
  mes_referencia text not null check (mes_referencia ~ '^\d{4}-\d{2}$'),
  numero text,
  emitida_em date,
  valor numeric(14, 2) not null check (valor > 0),
  arquivo text not null,
  arquivo_nome text,
  observacao text,
  enviada_em timestamptz not null default now(),
  pagamento_previsto date not null,
  pagar_em date,                                  -- fora da curva: a administração escolhe outro dia
  situacao text not null default 'recebida' check (situacao in ('recebida', 'conferida', 'paga', 'devolvida')),
  devolvida_motivo text,
  conferida_por uuid references public.perfis (id) on delete set null,
  conferida_em timestamptz,
  pago_em date,
  avisado_em timestamptz
);
create index if not exists fin_notas_mentor_perfil on public.fin_notas_mentor (perfil_id, mes_referencia);

-- 3. Regras de acesso: a administração tudo; o mentor só o dele
alter table public.mentor_pagamento_dados enable row level security;
alter table public.fin_notas_mentor enable row level security;
revoke all on public.mentor_pagamento_dados from anon;
revoke all on public.fin_notas_mentor from anon;
drop policy if exists admin_tudo on public.mentor_pagamento_dados;
drop policy if exists proprio_ler on public.mentor_pagamento_dados;
drop policy if exists proprio_criar on public.mentor_pagamento_dados;
drop policy if exists proprio_mudar on public.mentor_pagamento_dados;
create policy admin_tudo on public.mentor_pagamento_dados for all to authenticated using (eh_admin()) with check (eh_admin());
create policy proprio_ler on public.mentor_pagamento_dados for select to authenticated using (perfil_id = auth.uid());
create policy proprio_criar on public.mentor_pagamento_dados for insert to authenticated with check (perfil_id = auth.uid());
create policy proprio_mudar on public.mentor_pagamento_dados for update to authenticated using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());

drop policy if exists admin_tudo on public.fin_notas_mentor;
drop policy if exists proprio_ler on public.fin_notas_mentor;
drop policy if exists proprio_criar on public.fin_notas_mentor;
drop policy if exists proprio_apagar on public.fin_notas_mentor;
create policy admin_tudo on public.fin_notas_mentor for all to authenticated using (eh_admin()) with check (eh_admin());
create policy proprio_ler on public.fin_notas_mentor for select to authenticated using (perfil_id = auth.uid());
create policy proprio_criar on public.fin_notas_mentor for insert to authenticated with check (perfil_id = auth.uid() and situacao = 'recebida' and pago_em is null and pagar_em is null);
create policy proprio_apagar on public.fin_notas_mentor for delete to authenticated using (perfil_id = auth.uid() and situacao in ('recebida', 'devolvida'));

-- 4. Pasta privada "financeiro": o mentor envia, lê e apaga só os arquivos da pasta dele
drop policy if exists financeiro_nota_mentor_enviar on storage.objects;
drop policy if exists financeiro_nota_mentor_ler on storage.objects;
drop policy if exists financeiro_nota_mentor_apagar on storage.objects;
create policy financeiro_nota_mentor_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'financeiro' and (storage.foldername(name))[1] = 'notas-mentores' and (storage.foldername(name))[2] = auth.uid()::text);
create policy financeiro_nota_mentor_ler on storage.objects for select to authenticated
  using (bucket_id = 'financeiro' and (storage.foldername(name))[1] = 'notas-mentores' and (storage.foldername(name))[2] = auth.uid()::text);
create policy financeiro_nota_mentor_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'financeiro' and (storage.foldername(name))[1] = 'notas-mentores' and (storage.foldername(name))[2] = auth.uid()::text);

notify pgrst, 'reload schema';

-- Conferência: deve aparecer "ok"
select 'ok' as notas_dos_mentores;
