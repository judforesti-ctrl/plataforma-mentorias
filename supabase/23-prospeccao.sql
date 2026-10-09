-- Prospecção (Vendas): listas de cooperativas entram numa aba própria. Empresas ganham CNPJ, sistema, central, telefone,
-- e-mail geral e situação (cliente ativa, ex-cliente, nunca foi cliente). O funil ganha "A prospectar" e "Apresentação feita"
-- e anda sozinho quando alguém registra ligação, e-mail, WhatsApp, reunião marcada ou apresentação feita (nunca volta sozinho).
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema.
begin;

-- 1. Dados da empresa (cooperativas)
alter table public.empresas add column if not exists cnpj text;
alter table public.empresas add column if not exists razao_social text;
alter table public.empresas add column if not exists sistema text;               -- Sicoob, Sicredi, Cresol, Unicred, Ailos, Credisis, Uniprime, Independentes
alter table public.empresas add column if not exists central text;               -- central a que a cooperativa é filiada
alter table public.empresas add column if not exists telefone text;
alter table public.empresas add column if not exists email text;                 -- e-mail geral; o de cada pessoa fica em contatos
alter table public.empresas add column if not exists situacao text;              -- vazio = a plataforma decide (turmas, programas, vendas fechadas)
do $$ begin
  alter table public.empresas add constraint empresas_situacao_check check (situacao in ('ativa', 'ex_cliente', 'nunca'));
exception when duplicate_object then null; end $$;
create unique index if not exists empresas_cnpj on public.empresas (cnpj) where cnpj is not null;
create index if not exists empresas_sistema on public.empresas (sistema);

-- 2. Etapas novas do funil e o tipo "apresentação feita" no histórico
do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'public.oportunidades'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%etapa%' loop
    execute format('alter table public.oportunidades drop constraint %I', c.conname);
  end loop;
  for c in select conname from pg_constraint where conrelid = 'public.interacoes'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%tipo%' loop
    execute format('alter table public.interacoes drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.oportunidades add constraint oportunidades_etapa_check
  check (etapa in ('prospectar', 'contato', 'reuniao', 'apresentacao', 'proposta', 'negociacao', 'fechado', 'perdido'));
alter table public.interacoes add constraint interacoes_tipo_check
  check (tipo in ('email', 'whatsapp', 'reuniao', 'apresentacao', 'ligacao', 'nota', 'proposta', 'etapa', 'sistema'));

create or replace function public.nome_etapa(e text) returns text language sql immutable as $$
  select case e when 'prospectar' then 'A prospectar' when 'contato' then 'Primeiro contato feito' when 'reuniao' then 'Reunião marcada'
    when 'apresentacao' then 'Apresentação feita' when 'proposta' then 'Proposta enviada' when 'negociacao' then 'Negociação'
    when 'fechado' then 'Fechado' when 'perdido' then 'Perdido' else e end $$;

-- 3. O funil anda sozinho: ligação, e-mail ou WhatsApp → Primeiro contato; reunião → Reunião marcada;
--    apresentação → Apresentação feita; proposta → Proposta enviada. Só avança, nunca volta; fechado e perdido não mudam.
--    Quem registra o primeiro contato vira a responsável, se ainda não houver uma.
create or replace function public.marcar_interacao() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ordem constant text[] := array['prospectar', 'contato', 'reuniao', 'apresentacao', 'proposta', 'negociacao'];
  atual text; alvo text;
begin
  if new.tipo in ('email', 'whatsapp', 'reuniao', 'apresentacao', 'ligacao', 'proposta') then
    update oportunidades set ultima_interacao_em = greatest(ultima_interacao_em, new.quando) where id = new.oportunidade_id
      returning etapa into atual;
    alvo := case new.tipo when 'reuniao' then 'reuniao' when 'apresentacao' then 'apresentacao' when 'proposta' then 'proposta' else 'contato' end;
    if atual = any(ordem) and array_position(ordem, alvo) > array_position(ordem, atual) then
      update oportunidades set etapa = alvo, chance = null, responsavel_id = coalesce(responsavel_id, new.por) where id = new.oportunidade_id;
      insert into interacoes (oportunidade_id, tipo, texto, por) values (new.oportunidade_id, 'etapa', nome_etapa(atual) || ' → ' || nome_etapa(alvo) || ' · automático', new.por);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists interacao_marca on public.interacoes;
create trigger interacao_marca after insert on public.interacoes for each row execute function public.marcar_interacao();

-- 4. Fechou uma venda: a empresa volta para a situação automática (vira cliente ativa)
create or replace function public.fechou_volta_situacao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.etapa = 'fechado' and old.etapa is distinct from 'fechado' then
    update empresas set situacao = null where id = new.empresa_id and situacao is not null;
  end if;
  return new;
end $$;
drop trigger if exists oportunidade_fechou on public.oportunidades;
create trigger oportunidade_fechou after update of etapa on public.oportunidades for each row execute function public.fechou_volta_situacao();

-- 5. Importar uma lista. Cada item: nome, cnpj, razao_social, sistema, central, telefone, email, site, cidade, uf, porte,
--    observacoes, titulo, responsavel_id e, se a administração confirmou que é uma empresa já cadastrada, empresa_id.
--    CNPJ que já está na plataforma é pulado (dá para importar o mesmo arquivo de novo sem duplicar).
create or replace function public.importar_prospeccao(itens jsonb, fonte text default null)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  it jsonb; emp uuid; op uuid; v_nome text; v_cnpj text;
  novas integer := 0; ligadas integer := 0; repetidas integer := 0; no_funil integer := 0;
begin
  if not eh_admin() then raise exception 'Só a administração importa listas.'; end if;
  for it in select value from jsonb_array_elements(itens) loop
    v_cnpj := nullif(trim(coalesce(it->>'cnpj', '')), '');
    emp := nullif(it->>'empresa_id', '')::uuid;
    if emp is null and v_cnpj is not null then
      select id into emp from empresas where cnpj = v_cnpj;
      if emp is not null then repetidas := repetidas + 1; continue; end if;
    end if;
    if emp is not null then
      -- empresa que já estava cadastrada: completa só o que estiver vazio
      update empresas set
        cnpj = coalesce(cnpj, case when v_cnpj is not null and not exists (select 1 from empresas x where x.cnpj = v_cnpj) then v_cnpj end),
        razao_social = coalesce(razao_social, nullif(it->>'razao_social', '')),
        tipo = coalesce(tipo, 'cooperativa'),
        sistema = coalesce(sistema, nullif(it->>'sistema', '')),
        central = coalesce(central, nullif(it->>'central', '')),
        telefone = coalesce(telefone, nullif(it->>'telefone', '')),
        email = coalesce(email, nullif(it->>'email', '')),
        site = coalesce(site, nullif(it->>'site', '')),
        cidade = coalesce(cidade, nullif(it->>'cidade', '')),
        uf = coalesce(uf, nullif(it->>'uf', '')),
        porte = coalesce(porte, nullif(it->>'porte', ''))
      where id = emp;
      ligadas := ligadas + 1;
      -- só entra em "A prospectar" se ainda não tem nada com a Mentorei (nem venda, nem programa, nem turma)
      if exists (select 1 from oportunidades where empresa_id = emp) or exists (select 1 from programas where empresa_id = emp)
         or exists (select 1 from turmas where empresa_id = emp) then continue; end if;
    else
      v_nome := left(trim(coalesce(it->>'nome', '')), 200);
      if v_nome = '' then continue; end if;
      if exists (select 1 from empresas where lower(nome) = lower(v_nome)) then
        v_nome := v_nome || coalesce(' (' || nullif(concat_ws('/', nullif(it->>'cidade', ''), nullif(it->>'uf', '')), '') || ')', '');
      end if;
      if exists (select 1 from empresas where lower(nome) = lower(v_nome)) then
        v_nome := v_nome || ' · ' || coalesce(v_cnpj, left(md5(random()::text), 6));
      end if;
      insert into empresas (nome, tipo, cnpj, razao_social, sistema, central, telefone, email, site, cidade, uf, porte, origem, observacoes)
      values (v_nome, 'cooperativa', v_cnpj, nullif(it->>'razao_social', ''), nullif(it->>'sistema', ''), nullif(it->>'central', ''),
              nullif(it->>'telefone', ''), nullif(it->>'email', ''), nullif(it->>'site', ''), nullif(it->>'cidade', ''), nullif(it->>'uf', ''),
              nullif(it->>'porte', ''), 'Lista de prospecção', nullif(it->>'observacoes', ''))
      returning id into emp;
      novas := novas + 1;
    end if;
    insert into oportunidades (empresa_id, titulo, servico, etapa, origem, responsavel_id)
    values (emp, coalesce(nullif(left(it->>'titulo', 200), ''), 'Treinamento'), 'treinamento', 'prospectar', 'Lista de prospecção',
            nullif(it->>'responsavel_id', '')::uuid)
    returning id into op;
    insert into interacoes (oportunidade_id, tipo, texto) values (op, 'sistema', 'Entrou na Prospecção' || coalesce(' · ' || nullif(fonte, ''), '') || '.');
    no_funil := no_funil + 1;
  end loop;
  return jsonb_build_object('novas', novas, 'ligadas', ligadas, 'repetidas', repetidas, 'no_funil', no_funil);
end $$;

-- 6. Trocar a responsável de um sistema inteiro (só o que ainda está em "A prospectar")
create or replace function public.definir_responsavel_sistema(p_sistema text, p_responsavel uuid)
returns integer language plpgsql security invoker set search_path = public as $$
declare n integer;
begin
  if not eh_admin() then raise exception 'Só a administração.'; end if;
  update oportunidades o set responsavel_id = p_responsavel
    from empresas e where e.id = o.empresa_id and e.sistema = p_sistema and o.etapa = 'prospectar';
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.importar_prospeccao(jsonb, text) from public, anon;
revoke execute on function public.definir_responsavel_sistema(text, uuid) from public, anon;
grant execute on function public.importar_prospeccao(jsonb, text) to authenticated;
grant execute on function public.definir_responsavel_sistema(text, uuid) to authenticated;

-- 7. Responsável de cada sistema (a tela de importação lembra a última escolha)
insert into public.configuracoes (chave, valor) values ('prospeccao', '{"responsaveis": {}}') on conflict (chave) do nothing;

notify pgrst, 'reload schema';
commit;
