-- 83 · Mais de um mentor na mesma sessão individual (pedido da Juliana, 17/11/2026: "às vezes atendemos dois mentores na mesma
-- sessão com o mentorado; faça como nas turmas, que dá para marcar os mentores").
-- `sessoes.mentor_id` continua sendo o mentor principal (o primeiro marcado). Quem atende JUNTO fica em `sessoes.outros_mentores`.
-- A sessão entra na agenda, no convite do Google, no "hoje" de Meus mentorados e no extrato de cada mentor marcado.
-- Só a administração marca. Marcar alguém que ainda não acompanha o mentorado já dá a essa pessoa acesso à ficha
-- (vínculo em mentor_mentorado), porque é o vínculo que libera a sessão para ela (regras do banco).
-- Pode rodar de novo sem problema.

alter table public.sessoes add column if not exists outros_mentores uuid[] not null default '{}';
comment on column public.sessoes.outros_mentores is 'Mentores que atendem JUNTO com o mentor principal (mentor_id) nesta sessão. Desde 17/11/2026.';
create index if not exists sessoes_outros_mentores_idx on public.sessoes using gin (outros_mentores);

create or replace function public.sessao_outros_mentores()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  limpa uuid[];
  x uuid;
  prox int;
begin
  -- sem repetido, sem vazio e sem o mentor principal (na ordem em que foram marcados)
  select coalesce(array_agg(u order by o), '{}') into limpa
    from (select u, min(o) as o from unnest(coalesce(new.outros_mentores, '{}'::uuid[])) with ordinality as t(u, o)
          where u is not null and u is distinct from new.mentor_id group by u) z;
  new.outros_mentores := limpa;

  -- quem escolhe os mentores da sessão é a administração (o servidor, sem login, também pode)
  if tg_op = 'UPDATE' and new.outros_mentores is distinct from old.outros_mentores
     and auth.uid() is not null and not eh_admin() then
    raise exception 'Só a administração escolhe os mentores da sessão.';
  end if;

  -- quem atende junto passa a acompanhar o mentorado (vê a ficha e as sessões)
  foreach x in array new.outros_mentores loop
    if not exists (select 1 from mentor_mentorado where mentorado_id = new.mentorado_id and mentor_id = x) then
      select coalesce(max(ordem), 0) + 1 into prox from mentor_mentorado where mentorado_id = new.mentorado_id;
      insert into mentor_mentorado (mentorado_id, mentor_id, ordem) values (new.mentorado_id, x, prox) on conflict do nothing;
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists sessoes_outros_mentores on public.sessoes;
create trigger sessoes_outros_mentores before insert or update on public.sessoes
  for each row execute function public.sessao_outros_mentores();

-- Extrato do mentor (Notas fiscais): a sessão em dupla conta para cada mentor marcado.
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
        'mentorado', mt.nome, 'numero', s.numero, 'data_hora', s.data_hora, 'duracao_min', s.duracao_min,
        'em_dupla', cardinality(s.outros_mentores) > 0) order by s.data_hora)
      from sessoes s join mentorados mt on mt.id = s.mentorado_id left join programas pr on pr.id = mt.programa_id left join empresas e on e.id = pr.empresa_id
      where (s.mentor_id = eu or eu = any(s.outros_mentores)) and s.situacao = 'realizada'
        and (s.data_hora at time zone 'America/Sao_Paulo')::date >= d0 and (s.data_hora at time zone 'America/Sao_Paulo')::date < d1), '[]'::jsonb),
    'extras', coalesce((select jsonb_agg(to_jsonb(x) order by x.data nulls last, x.criado_em) from fin_mentor_extras x where x.perfil_id = eu and x.mes = p_mes), '[]'::jsonb),
    'faturado', coalesce((select jsonb_object_agg(f.turma_id::text, f.total) from (
        select pl.turma_id, sum(r.valor) as total from fin_receber r join fin_planos pl on pl.id = r.plano_id
        where pl.turma_id is not null and r.situacao <> 'cancelado' and r.data >= d0 and r.data < d1
          and coalesce((select v.forma from fin_mentor_valores v where v.perfil_id = eu and v.turma_id = pl.turma_id), forma_padrao) = 'percentual'
        group by pl.turma_id) f), '{}'::jsonb)
  );
end $$;
