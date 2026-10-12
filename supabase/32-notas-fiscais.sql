-- Notas fiscais emitidas pela Mentorei (planilha de controle desde 2019). Cada nota fica ligada à empresa; a empresa ganha o
-- resumo (quantas notas, total, última nota), endereço e CEP. Situação automática: nota há menos de 1 ano = cliente ativo;
-- nota mais antiga = cliente inativo. Os inativos entram na Prospecção, na lista "Clientes inativos" (oportunidades.lista).
-- Importar de novo a mesma planilha não duplica nada (o número da nota é único).
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema. Precisa do 19 e do 23.
begin;

-- 1. As notas
create table if not exists public.notas_fiscais (
  id uuid primary key default gen_random_uuid(),
  numero integer not null unique,
  emissao date not null,
  empresa_id uuid references public.empresas (id) on delete set null,
  cnpj text,                       -- CNPJ ou CPF como veio na nota
  razao_social text,               -- nome do cliente na nota
  descricao text,
  valor numeric(14, 2),            -- valor dos serviços
  valor_liquido numeric(14, 2),
  iss numeric(14, 2), pis numeric(14, 2), cofins numeric(14, 2), inss numeric(14, 2), ir numeric(14, 2), csll numeric(14, 2),
  codigo_verificacao text,
  endereco text, cidade text, uf text, cep text, telefone text, email text,   -- dados do cliente declarados na nota
  importado_em timestamptz not null default now()
);
create index if not exists notas_fiscais_empresa on public.notas_fiscais (empresa_id);

-- 2. Empresa: endereço e o resumo das notas (mantido sozinho pelo gatilho abaixo)
alter table public.empresas add column if not exists endereco text;
alter table public.empresas add column if not exists cep text;
alter table public.empresas add column if not exists qtd_notas integer not null default 0;
alter table public.empresas add column if not exists total_notas numeric(14, 2) not null default 0;
alter table public.empresas add column if not exists primeira_nota_em date;
alter table public.empresas add column if not exists ultima_nota_em date;

-- 3. Listas da Prospecção: vazio = lista de prospecção (nunca comprou); "Clientes inativos" = já comprou e parou
alter table public.oportunidades add column if not exists lista text;

create or replace function public.resumir_notas(emp uuid) returns void
language sql security definer set search_path = public as $$
  update empresas e set qtd_notas = coalesce(n.qtd, 0), total_notas = coalesce(n.total, 0), primeira_nota_em = n.primeira, ultima_nota_em = n.ultima
  from (select count(*)::int qtd, sum(valor) total, min(emissao) primeira, max(emissao) ultima from notas_fiscais where empresa_id = emp) n
  where e.id = emp;
$$;
create or replace function public.notas_mudaram() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'INSERT' and old.empresa_id is not null then perform resumir_notas(old.empresa_id); end if;
  if tg_op <> 'DELETE' and new.empresa_id is not null and (tg_op = 'INSERT' or new.empresa_id is distinct from old.empresa_id or new.valor is distinct from old.valor or new.emissao is distinct from old.emissao) then
    perform resumir_notas(new.empresa_id);
  end if;
  return null;
end $$;
drop trigger if exists notas_resumo on public.notas_fiscais;
create trigger notas_resumo after insert or update or delete on public.notas_fiscais for each row execute function public.notas_mudaram();

-- 4. Importar. Cada item é um cliente da planilha: nome, cnpj, razao_social, tipo, sistema, telefone, email, cidade, uf,
--    endereco, cep, observacoes, ativo (nota há menos de 1 ano), empresa_id (quando a administração confirmou que é uma
--    empresa já cadastrada), responsavel_id, contatos [{nome, email}] e notas [{numero, emissao, valor, ...}].
--    Empresa já cadastrada: não duplica, só completa o que estiver vazio e recebe as notas.
--    Inativo: entra em "A prospectar" na lista "Clientes inativos" (se já estava em A prospectar, muda de lista; se já está
--    em conversa, fica onde está). Ativo: sai de "A prospectar" se estava lá só por causa de uma lista (sem nada registrado).
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

    select ultima_nota_em, total_notas, qtd_notas into v_ult, v_total, v_qtd from empresas where id = emp;
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

-- 5. Regras de acesso: só a administração
alter table public.notas_fiscais enable row level security;
revoke all on public.notas_fiscais from anon;
drop policy if exists admin_tudo on public.notas_fiscais;
create policy admin_tudo on public.notas_fiscais for all to authenticated using (eh_admin()) with check (eh_admin());
revoke execute on function public.importar_notas_fiscais(jsonb, text) from public, anon;
grant execute on function public.importar_notas_fiscais(jsonb, text) to authenticated;
revoke execute on function public.resumir_notas(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
