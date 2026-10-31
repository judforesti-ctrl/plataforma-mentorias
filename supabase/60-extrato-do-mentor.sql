-- Extrato do mentor parceiro (31/10/2026, pedido da Juliana: o mentor emite a nota fiscal, então precisa ver o que deu e quanto).
-- 1. fin_mentor_extras: horas e trabalhos que a coordenação lança para um mentor (além das aulas e sessões da agenda), com a
--    descrição; entram no pagamento do mês e aparecem no extrato dele.
-- 2. fin_mentor_recados: recados do mentor sobre pagamento (e o aviso de que ele mudou os dados para pagamento). A coordenação
--    recebe e-mail, vê nas pendências, marca como visto e pode responder.
-- 3. meu_extrato_mentor(mês): o que o próprio mentor pode ver do mês dele (valor da hora, valor combinado, aulas, sessões,
--    horas lançadas e o pagamento conferido). Ele não lê as tabelas do Financeiro direto.
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema. Precisa do 54 e do 58.

-- 1. Horas e trabalhos lançados pela coordenação
create table if not exists public.fin_mentor_extras (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  mes text not null check (mes ~ '^\d{4}-\d{2}$'),
  data date,
  descricao text not null check (length(descricao) between 1 and 300),
  horas numeric(8, 2) check (horas is null or horas > 0),
  valor_hora numeric(14, 2) check (valor_hora is null or valor_hora >= 0),
  valor numeric(14, 2) check (valor is null or valor >= 0),      -- valor fechado (no lugar de horas × valor da hora)
  turma_id uuid references public.turmas (id) on delete set null,
  programa_id uuid references public.programas (id) on delete set null,
  criado_por uuid references public.perfis (id) on delete set null default auth.uid(),
  criado_em timestamptz not null default now(),
  check (horas is not null or valor is not null)
);
create index if not exists fin_mentor_extras_mes on public.fin_mentor_extras (perfil_id, mes);

-- 2. Recados do mentor sobre pagamento
create table if not exists public.fin_mentor_recados (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfis (id) on delete cascade default auth.uid(),
  mes text check (mes is null or mes ~ '^\d{4}-\d{2}$'),
  tipo text not null default 'recado' check (tipo in ('recado', 'dados')),
  texto text not null check (length(texto) between 1 and 2000),
  criado_em timestamptz not null default now(),
  avisado_em timestamptz,
  lido_em timestamptz,
  lido_por uuid references public.perfis (id) on delete set null,
  resposta text,
  respondido_em timestamptz
);
create index if not exists fin_mentor_recados_perfil on public.fin_mentor_recados (perfil_id, criado_em);

-- 3. Regras de acesso: a administração tudo; o mentor lê o dele e escreve recados só como novos
alter table public.fin_mentor_extras enable row level security;
alter table public.fin_mentor_recados enable row level security;
revoke all on public.fin_mentor_extras from anon;
revoke all on public.fin_mentor_recados from anon;
drop policy if exists admin_tudo on public.fin_mentor_extras;
drop policy if exists proprio_ler on public.fin_mentor_extras;
create policy admin_tudo on public.fin_mentor_extras for all to authenticated using (eh_admin()) with check (eh_admin());
create policy proprio_ler on public.fin_mentor_extras for select to authenticated using (perfil_id = auth.uid());

drop policy if exists admin_tudo on public.fin_mentor_recados;
drop policy if exists proprio_ler on public.fin_mentor_recados;
drop policy if exists proprio_criar on public.fin_mentor_recados;
create policy admin_tudo on public.fin_mentor_recados for all to authenticated using (eh_admin()) with check (eh_admin());
create policy proprio_ler on public.fin_mentor_recados for select to authenticated using (perfil_id = auth.uid());
create policy proprio_criar on public.fin_mentor_recados for insert to authenticated
  with check (perfil_id = auth.uid() and avisado_em is null and lido_em is null and lido_por is null and resposta is null and respondido_em is null);

-- 4. O extrato do mês para o próprio mentor
create or replace function public.meu_extrato_mentor(p_mes text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  eu uuid := auth.uid();
  d0 date;
  d1 date;
  forma_padrao text;
begin
  if eu is null or p_mes !~ '^\d{4}-\d{2}$' then return null; end if;
  d0 := (p_mes || '-01')::date;
  d1 := (d0 + interval '1 month')::date;
  select c.forma into forma_padrao from fin_mentores c where c.perfil_id = eu;
  return jsonb_build_object(
    'cadastro', (select jsonb_build_object('forma', c.forma, 'valor', c.valor) from fin_mentores c where c.perfil_id = eu),
    'valores', coalesce((select jsonb_agg(jsonb_build_object('turma_id', v.turma_id, 'programa_id', v.programa_id, 'forma', v.forma, 'valor', v.valor))
      from fin_mentor_valores v where v.perfil_id = eu), '[]'::jsonb),
    'pagamento', (select jsonb_build_object('linhas', p.linhas, 'total', p.total, 'situacao', p.situacao, 'pago_em', p.pago_em)
      from fin_pagamentos p where p.perfil_id = eu and p.mes = p_mes),
    'modulos', coalesce((select jsonb_agg(jsonb_build_object('turma_id', m.turma_id, 'rotulo', coalesce(e.nome, '') || ' · ' || t.nome,
        'numero', m.numero, 'titulo', m.titulo, 'data_hora', m.data_hora, 'duracao_min', m.duracao_min) order by m.data_hora)
      from modulo_mentores mm join modulos m on m.id = mm.modulo_id join turmas t on t.id = m.turma_id left join empresas e on e.id = t.empresa_id
      where mm.mentor_id = eu and (m.data_hora at time zone 'America/Sao_Paulo')::date >= d0 and (m.data_hora at time zone 'America/Sao_Paulo')::date < d1), '[]'::jsonb),
    'sessoes', coalesce((select jsonb_agg(jsonb_build_object('programa_id', mt.programa_id,
        'rotulo', case when pr.id is null then 'Mentoria individual' else coalesce(e.nome, '') || ' · ' || pr.nome end,
        'mentorado', mt.nome, 'numero', s.numero, 'data_hora', s.data_hora, 'duracao_min', s.duracao_min) order by s.data_hora)
      from sessoes s join mentorados mt on mt.id = s.mentorado_id left join programas pr on pr.id = mt.programa_id left join empresas e on e.id = pr.empresa_id
      where s.mentor_id = eu and s.situacao = 'realizada'
        and (s.data_hora at time zone 'America/Sao_Paulo')::date >= d0 and (s.data_hora at time zone 'America/Sao_Paulo')::date < d1), '[]'::jsonb),
    'extras', coalesce((select jsonb_agg(to_jsonb(x) order by x.data nulls last, x.criado_em) from fin_mentor_extras x where x.perfil_id = eu and x.mes = p_mes), '[]'::jsonb),
    -- faturado da turma no mês: só para quem recebe por % do faturado
    'faturado', coalesce((select jsonb_object_agg(f.turma_id::text, f.total) from (
        select pl.turma_id, sum(r.valor) as total from fin_receber r join fin_planos pl on pl.id = r.plano_id
        where pl.turma_id is not null and r.situacao <> 'cancelado' and r.data >= d0 and r.data < d1
          and coalesce((select v.forma from fin_mentor_valores v where v.perfil_id = eu and v.turma_id = pl.turma_id), forma_padrao) = 'percentual'
        group by pl.turma_id) f), '{}'::jsonb)
  );
end $$;
revoke all on function public.meu_extrato_mentor(text) from public, anon;
grant execute on function public.meu_extrato_mentor(text) to authenticated;

notify pgrst, 'reload schema';

-- Conferência: deve aparecer "ok"
select 'ok' as extrato_do_mentor;
