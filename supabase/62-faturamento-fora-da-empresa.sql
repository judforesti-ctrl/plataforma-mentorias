-- O resumo das notas fiscais de cada cliente (quantas notas, quanto faturou, primeira e última nota) saía da tabela empresas,
-- e o mentor e o mentorado conseguem ler a linha da empresa deles (para o nome e as cores do cliente). Nenhuma tela mostrava,
-- mas os números ficavam ao alcance de quem soubesse pedir direto ao banco. Pedido da Juliana (31/10/2026): os mentores não
-- podem ter acesso a nada da Mentorei além do que é deles. Agora o resumo fica em empresa_notas, que só a administração lê,
-- e as 4 colunas saem de empresas.
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema. Precisa do 32.
begin;

-- 1. O resumo, numa tabela só da administração
create table if not exists public.empresa_notas (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  qtd_notas integer not null default 0,
  total_notas numeric(14, 2) not null default 0,
  primeira_nota_em date,
  ultima_nota_em date
);
alter table public.empresa_notas enable row level security;
revoke all on public.empresa_notas from anon;
drop policy if exists admin_tudo on public.empresa_notas;
create policy admin_tudo on public.empresa_notas for all to authenticated using (eh_admin()) with check (eh_admin());

-- 2. Refaz o resumo a partir das notas
insert into public.empresa_notas (empresa_id, qtd_notas, total_notas, primeira_nota_em, ultima_nota_em)
select empresa_id, count(*)::int, coalesce(sum(valor), 0), min(emissao), max(emissao) from public.notas_fiscais where empresa_id is not null group by empresa_id
on conflict (empresa_id) do update set qtd_notas = excluded.qtd_notas, total_notas = excluded.total_notas,
  primeira_nota_em = excluded.primeira_nota_em, ultima_nota_em = excluded.ultima_nota_em;
delete from public.empresa_notas n where not exists (select 1 from public.notas_fiscais f where f.empresa_id = n.empresa_id);

-- 3. O gatilho das notas passa a manter a tabela nova
create or replace function public.resumir_notas(emp uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from notas_fiscais where empresa_id = emp) then
    delete from empresa_notas where empresa_id = emp;
    return;
  end if;
  insert into empresa_notas (empresa_id, qtd_notas, total_notas, primeira_nota_em, ultima_nota_em)
  select emp, count(*)::int, coalesce(sum(valor), 0), min(emissao), max(emissao) from notas_fiscais where empresa_id = emp
  on conflict (empresa_id) do update set qtd_notas = excluded.qtd_notas, total_notas = excluded.total_notas,
    primeira_nota_em = excluded.primeira_nota_em, ultima_nota_em = excluded.ultima_nota_em;
end $$;
revoke execute on function public.resumir_notas(uuid) from public, anon, authenticated;

-- 4. A importação das notas lê o resumo da tabela nova (o resto é igual ao script 32)
create or replace function public.importar_notas_fiscais(itens jsonb, fonte text default null)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  it jsonb; n jsonb; c jsonb; emp uuid; v_todas boolean; op uuid; v_nome text; v_cnpj text; v_raiz text; v_email text;
  novas_notas integer; n_fora integer; v_ult date; v_total numeric; v_qtd integer;
  novas integer := 0; ligadas integer := 0; notas integer := 0; contatos_novos integer := 0; ja integer := 0;
  inativos integer := 0; mudaram_lista integer := 0; sairam integer := 0;
begin
  if not eh_admin() then raise exception 'Só a administração importa notas fiscais.'; end if;
  for it in select value from jsonb_array_elements(itens) loop
    -- todas as notas já importadas antes: não grava nada, só confere a lista (quem passou de 1 ano sem nota vira inativo)
    v_todas := not exists (select 1 from jsonb_array_elements(it->'notas') x
                           where not exists (select 1 from notas_fiscais f where f.numero = (x->>'numero')::int));
    -- empresa que já recebeu notas deste cliente (vale mesmo se o nome ou o CNPJ foi mudado na plataforma)
    select f.empresa_id into emp from notas_fiscais f join jsonb_array_elements(it->'notas') x on f.numero = (x->>'numero')::int
     where f.empresa_id is not null order by f.emissao desc limit 1;
    if v_todas then
      if emp is null then continue; end if;
      ja := ja + 1;
    else
      v_cnpj := nullif(trim(coalesce(it->>'cnpj', '')), '');
      v_raiz := case when length(regexp_replace(coalesce(v_cnpj, ''), '\D', '', 'g')) = 14 then left(regexp_replace(v_cnpj, '\D', '', 'g'), 8) end;
      emp := coalesce(emp, nullif(it->>'empresa_id', '')::uuid);
      -- mesmo CNPJ (ou matriz/filial: mesma raiz de 8 números) = mesma empresa
      if emp is null and v_cnpj is not null then
        select id into emp from empresas
         where regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') = regexp_replace(v_cnpj, '\D', '', 'g')
            or (v_raiz is not null and length(regexp_replace(coalesce(cnpj, ''), '\D', '', 'g')) = 14 and left(regexp_replace(cnpj, '\D', '', 'g'), 8) = v_raiz)
         order by (regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') = regexp_replace(v_cnpj, '\D', '', 'g')) desc limit 1;
      end if;
      if emp is not null then
        update empresas set
          cnpj = coalesce(cnpj, case when v_cnpj is not null and not exists (select 1 from empresas x where x.cnpj = v_cnpj) then v_cnpj end),
          razao_social = coalesce(razao_social, nullif(it->>'razao_social', '')),
          tipo = coalesce(tipo, nullif(it->>'tipo', '')),
          sistema = coalesce(sistema, nullif(it->>'sistema', '')),
          telefone = coalesce(telefone, nullif(it->>'telefone', '')),
          email = coalesce(email, nullif(it->>'email', '')),
          cidade = coalesce(cidade, nullif(it->>'cidade', '')),
          uf = coalesce(uf, nullif(it->>'uf', '')),
          endereco = coalesce(endereco, nullif(it->>'endereco', '')),
          cep = coalesce(cep, nullif(it->>'cep', '')),
          observacoes = case when nullif(it->>'observacoes', '') is null or position(it->>'observacoes' in coalesce(observacoes, '')) > 0 then observacoes
                             else concat_ws(E'\n', observacoes, it->>'observacoes') end
        where id = emp;
        ligadas := ligadas + 1;
      else
        v_nome := left(trim(coalesce(it->>'nome', '')), 200);
        if v_nome = '' then v_nome := 'Cliente sem nome'; end if;
        if exists (select 1 from empresas where lower(nome) = lower(v_nome)) then
          v_nome := v_nome || coalesce(' (' || nullif(concat_ws('/', nullif(it->>'cidade', ''), nullif(it->>'uf', '')), '') || ')', '');
        end if;
        if exists (select 1 from empresas where lower(nome) = lower(v_nome)) then
          v_nome := v_nome || ' · ' || coalesce(v_cnpj, left(md5(random()::text), 6));
        end if;
        insert into empresas (nome, tipo, cnpj, razao_social, sistema, telefone, email, cidade, uf, endereco, cep, origem, observacoes)
        values (v_nome, nullif(it->>'tipo', ''), v_cnpj, nullif(it->>'razao_social', ''), nullif(it->>'sistema', ''), nullif(it->>'telefone', ''),
                nullif(it->>'email', ''), nullif(it->>'cidade', ''), nullif(it->>'uf', ''), nullif(it->>'endereco', ''), nullif(it->>'cep', ''),
                'Cliente antigo', nullif(it->>'observacoes', ''))
        returning id into emp;
        novas := novas + 1;
      end if;

      -- notas (número repetido é pulado)
      for n in select value from jsonb_array_elements(it->'notas') loop
        insert into notas_fiscais (numero, emissao, empresa_id, cnpj, razao_social, descricao, valor, valor_liquido, iss, pis, cofins, inss, ir, csll,
                                   codigo_verificacao, endereco, cidade, uf, cep, telefone, email)
        values ((n->>'numero')::int, (n->>'emissao')::date, emp, nullif(n->>'cnpj', ''), nullif(n->>'razao_social', ''), nullif(n->>'descricao', ''),
                nullif(n->>'valor', '')::numeric, nullif(n->>'valor_liquido', '')::numeric, nullif(n->>'iss', '')::numeric, nullif(n->>'pis', '')::numeric,
                nullif(n->>'cofins', '')::numeric, nullif(n->>'inss', '')::numeric, nullif(n->>'ir', '')::numeric, nullif(n->>'csll', '')::numeric,
                nullif(n->>'codigo_verificacao', ''), nullif(n->>'endereco', ''), nullif(n->>'cidade', ''), nullif(n->>'uf', ''), nullif(n->>'cep', ''),
                nullif(n->>'telefone', ''), nullif(n->>'email', ''))
        on conflict (numero) do nothing;
        get diagnostics novas_notas = row_count;
        notas := notas + novas_notas;
      end loop;

      -- pessoas que receberam a nota (e-mail com nome): viram contatos, sem repetir e-mail
      for c in select value from jsonb_array_elements(coalesce(it->'contatos', '[]'::jsonb)) loop
        v_email := lower(nullif(trim(c->>'email'), ''));
        if v_email is null or exists (select 1 from contatos where empresa_id = emp and lower(email) = v_email) then continue; end if;
        insert into contatos (empresa_id, nome, email, observacoes)
        values (emp, left(coalesce(nullif(trim(c->>'nome'), ''), v_email), 120), v_email, 'Veio das notas fiscais (e-mail que recebeu a nota). Confirmar nome e cargo.');
        contatos_novos := contatos_novos + 1;
      end loop;
    end if;

    select n.ultima_nota_em, coalesce(n.total_notas, 0), coalesce(n.qtd_notas, 0) into v_ult, v_total, v_qtd
      from (select 1) x left join empresa_notas n on n.empresa_id = emp;
    if coalesce((it->>'ativo')::boolean, false) then
      -- cliente ativo: tira de "A prospectar" o que só estava lá por causa de uma lista (nada registrado por ninguém)
      delete from oportunidades o where o.empresa_id = emp and o.etapa = 'prospectar' and o.proximo_contato_em is null
        and not exists (select 1 from interacoes i where i.oportunidade_id = o.id and i.tipo <> 'sistema');
      get diagnostics n_fora = row_count;
      sairam := sairam + n_fora;
    else
      if exists (select 1 from oportunidades where empresa_id = emp and lista = 'Clientes inativos') then continue; end if;
      update oportunidades set lista = 'Clientes inativos', origem = coalesce(origem, 'Cliente antigo')
       where empresa_id = emp and etapa = 'prospectar';
      if found then mudaram_lista := mudaram_lista + 1; continue; end if;
      -- já em conversa, ou com programa/turma em andamento: fica onde está
      if exists (select 1 from oportunidades where empresa_id = emp and etapa not in ('fechado', 'perdido'))
         or exists (select 1 from programas where empresa_id = emp and status <> 'concluido')
         or exists (select 1 from turmas where empresa_id = emp and status <> 'concluida') then continue; end if;
      insert into oportunidades (empresa_id, titulo, servico, etapa, origem, lista, responsavel_id)
      values (emp, 'Nova contratação', 'treinamento', 'prospectar', 'Cliente antigo', 'Clientes inativos', nullif(it->>'responsavel_id', '')::uuid)
      returning id into op;
      insert into interacoes (oportunidade_id, tipo, texto) values (op, 'sistema',
        'Entrou em Clientes inativos' || coalesce(' · ' || nullif(fonte, ''), '') || '. Última nota fiscal em ' || to_char(v_ult, 'DD/MM/YYYY')
        || ' · ' || v_qtd || case when v_qtd = 1 then ' nota' else ' notas' end || ' · R$ ' || replace(replace(replace(to_char(v_total, 'FM999G999G990D00'), ',', '#'), '.', ','), '#', '.') || '.');
      inativos := inativos + 1;
    end if;
  end loop;
  return jsonb_build_object('novas', novas, 'ligadas', ligadas, 'notas', notas, 'contatos', contatos_novos, 'ja_importadas', ja,
                            'inativos', inativos, 'mudaram_lista', mudaram_lista, 'sairam', sairam);
end $$;
revoke execute on function public.importar_notas_fiscais(jsonb, text) from public, anon;
grant execute on function public.importar_notas_fiscais(jsonb, text) to authenticated;

-- 5. As colunas saem da empresa
alter table public.empresas drop column if exists qtd_notas;
alter table public.empresas drop column if exists total_notas;
alter table public.empresas drop column if exists primeira_nota_em;
alter table public.empresas drop column if exists ultima_nota_em;

notify pgrst, 'reload schema';
commit;

-- Conferência: deve aparecer "ok" e quantos clientes têm notas
select 'ok' as faturamento_fora_da_empresa, (select count(*) from public.empresa_notas) as clientes_com_notas;
