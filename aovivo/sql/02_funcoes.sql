-- Mentorei Ao Vivo: funções (toda a lógica fica no banco, o navegador só chama)

-- ============ Auxiliares internas ============

create or replace function public.aovivo_checa_chave(p_sessao uuid, p_chave text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.aovivo_chaves c where c.sessao_id = p_sessao and c.chave = p_chave) then
    raise exception 'Acesso negado a esta sessão.' using errcode = '42501';
  end if;
end $$;

create or replace function public.aovivo_publico(p_sessao uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'codigo', s.codigo, 'titulo', s.titulo,
    'modo_equipes', s.modo_equipes, 'equipes', to_jsonb(s.equipes),
    'fase', s.fase, 'atividade', s.atividade, 'extra', s.extra, 'versao', s.versao)
  from public.aovivo_sessoes s where s.id = p_sessao;
$$;

create or replace function public.aovivo_resultado(p_atividade uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  a public.aovivo_atividades;
  v_total integer;
  v_lista jsonb;
  v_media numeric;
  v_min integer;
  v_max integer;
begin
  select * into a from public.aovivo_atividades where id = p_atividade;
  if not found then return null; end if;
  select count(distinct participante_id) into v_total from public.aovivo_respostas where atividade_id = a.id;

  if a.tipo = 'nuvem' then
    select coalesce(jsonb_agg(jsonb_build_object('t', t, 'n', n) order by n desc, t), '[]'::jsonb) into v_lista
    from (select (r.valor #>> '{}') as t, count(*)::int as n
          from public.aovivo_respostas r where r.atividade_id = a.id
          group by 1 order by 2 desc, 1 limit 80) x;
    return jsonb_build_object('tipo', a.tipo, 'total', v_total, 'palavras', v_lista);

  elsif a.tipo in ('quiz', 'votacao') then
    select coalesce(jsonb_agg(coalesce(c.n, 0) order by i.idx), '[]'::jsonb) into v_lista
    from generate_series(0, jsonb_array_length(a.opcoes) - 1) as i(idx)
    left join (select (r.valor #>> '{}')::int as idx, count(*)::int as n
               from public.aovivo_respostas r where r.atividade_id = a.id group by 1) c on c.idx = i.idx;
    return jsonb_build_object('tipo', a.tipo, 'total', v_total, 'contagem', v_lista,
      'correta', case when a.tipo = 'quiz' then a.correta end, 'bonus', a.bonus);

  else -- escala
    v_min := coalesce((a.config->>'min')::int, 0);
    v_max := coalesce((a.config->>'max')::int, 10);
    select coalesce(jsonb_agg(coalesce(c.n, 0) order by i.v), '[]'::jsonb) into v_lista
    from generate_series(v_min, v_max) as i(v)
    left join (select (r.valor #>> '{}')::int as v, count(*)::int as n
               from public.aovivo_respostas r where r.atividade_id = a.id group by 1) c on c.v = i.v;
    select round(avg((r.valor #>> '{}')::numeric), 1) into v_media
    from public.aovivo_respostas r where r.atividade_id = a.id;
    return jsonb_build_object('tipo', a.tipo, 'total', v_total, 'distribuicao', v_lista,
      'media', v_media, 'min', v_min, 'max', v_max);
  end if;
end $$;

create or replace function public.aovivo_ranking_dados(p_sessao uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_top jsonb; v_eq jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'equipe', equipe,
           'pontos', pontos, 'sequencia', sequencia) order by pontos desc, criado_em), '[]'::jsonb)
  into v_top
  from (select * from public.aovivo_participantes where sessao_id = p_sessao
        order by pontos desc, criado_em limit 10) x;

  select coalesce(jsonb_agg(jsonb_build_object('equipe', equipe, 'pontos', media,
           'soma', soma, 'membros', membros) order by media desc, soma desc), '[]'::jsonb)
  into v_eq
  from (select equipe, round(avg(pontos))::int as media, sum(pontos)::int as soma, count(*)::int as membros
        from public.aovivo_participantes where sessao_id = p_sessao and equipe is not null
        group by equipe) y;

  return jsonb_build_object('top', v_top, 'equipes', v_eq);
end $$;

-- Avisa os celulares (Supabase Realtime) sempre que a sessão muda
create or replace function public.aovivo_antes_atualizar()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.versao := old.versao + 1;
  new.atualizado_em := now();
  return new;
end $$;

create or replace function public.aovivo_avisar()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform realtime.send(jsonb_build_object('versao', new.versao, 'fase', new.fase),
                          'estado', 'aovivo-' || new.id::text, false);
  exception when others then
    null; -- se o aviso falhar, os celulares ainda conferem sozinhos a cada poucos segundos
  end;
  return null;
end $$;

drop trigger if exists aovivo_sessoes_versao on public.aovivo_sessoes;
create trigger aovivo_sessoes_versao before update on public.aovivo_sessoes
  for each row execute function public.aovivo_antes_atualizar();
drop trigger if exists aovivo_sessoes_avisar on public.aovivo_sessoes;
create trigger aovivo_sessoes_avisar after update on public.aovivo_sessoes
  for each row execute function public.aovivo_avisar();

-- ============ Apresentadora ============

create or replace function public.aovivo_limpa_equipes(p_equipes text[])
returns text[] language sql immutable set search_path = '' as $$
  select coalesce(array_agg(t order by n), '{}') from (
    select t, n from (
      select distinct on (lower(t)) t, n
        from (select left(btrim(e), 30) as t, n from unnest(coalesce(p_equipes, '{}'::text[])) with ordinality u(e, n)) z
       where t <> ''
       order by lower(t), n) d
    order by n limit 8) f;
$$;


create or replace function public.aovivo_criar_sessao(p_titulo text, p_modo_equipes boolean default false, p_equipes text[] default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_codigo text; v_chave text; v_eq text[]; i integer := 0;
begin
  v_eq := public.aovivo_limpa_equipes(p_equipes);
  loop
    v_codigo := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.aovivo_sessoes where codigo = v_codigo and fase <> 'encerrada');
    i := i + 1;
    if i > 50 then raise exception 'Não consegui gerar um código. Tente de novo.'; end if;
  end loop;
  v_chave := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.aovivo_sessoes (codigo, titulo, modo_equipes, equipes)
  values (v_codigo, coalesce(nullif(left(btrim(p_titulo), 80), ''), 'Aula Mentorei'),
          coalesce(p_modo_equipes, false) and coalesce(array_length(v_eq, 1), 0) >= 2, v_eq)
  returning id into v_id;
  insert into public.aovivo_chaves (sessao_id, chave) values (v_id, v_chave);
  return jsonb_build_object('id', v_id, 'codigo', v_codigo, 'chave', v_chave);
end $$;

create or replace function public.aovivo_editar_sessao(p_sessao uuid, p_chave text, p_titulo text, p_modo_equipes boolean, p_equipes text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_eq text[];
begin
  perform public.aovivo_checa_chave(p_sessao, p_chave);
  v_eq := public.aovivo_limpa_equipes(p_equipes);
  update public.aovivo_sessoes set
    titulo = coalesce(nullif(left(btrim(p_titulo), 80), ''), titulo),
    modo_equipes = coalesce(p_modo_equipes, false) and coalesce(array_length(v_eq, 1), 0) >= 2,
    equipes = v_eq
  where id = p_sessao;
  return public.aovivo_publico(p_sessao);
end $$;

create or replace function public.aovivo_salvar_atividades(p_sessao uuid, p_chave text, p_lista jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[];
  item jsonb;
  v_ordem integer := 0;
  v_tipo text; v_perg text; v_opc jsonb; v_cor integer; v_tempo integer; v_cfg jsonb; v_n integer;
  v_id uuid;
begin
  perform public.aovivo_checa_chave(p_sessao, p_chave);
  if jsonb_typeof(p_lista) <> 'array' then raise exception 'Lista inválida.'; end if;

  v_ids := array(select (x->>'id')::uuid from jsonb_array_elements(p_lista) x
                 where coalesce(x->>'id', '') ~ '^[0-9a-f-]{36}$');
  delete from public.aovivo_atividades
   where sessao_id = p_sessao and not (id = any(coalesce(v_ids, '{}')));

  for item in select value from jsonb_array_elements(p_lista) loop
    v_ordem := v_ordem + 1;
    v_tipo := item->>'tipo';
    if v_tipo not in ('nuvem','quiz','votacao','escala') then raise exception 'Tipo de atividade inválido.'; end if;
    v_perg := left(btrim(coalesce(item->>'pergunta', '')), 200);
    if v_perg = '' then raise exception 'A atividade % está sem pergunta.', v_ordem; end if;
    v_cfg := coalesce(item->'config', '{}'::jsonb);
    v_opc := coalesce((select jsonb_agg(left(btrim(o), 80)) from jsonb_array_elements_text(coalesce(item->'opcoes', '[]'::jsonb)) o
                        where btrim(o) <> ''), '[]'::jsonb);
    v_n := jsonb_array_length(v_opc);
    v_cor := nullif(item->>'correta', '')::int;
    v_tempo := coalesce(nullif(item->>'tempo', '')::int, 0);

    if v_tipo = 'quiz' then
      if v_n < 2 or v_n > 4 then raise exception 'O quiz % precisa de 2 a 4 alternativas.', v_ordem; end if;
      if v_cor is null or v_cor < 0 or v_cor >= v_n then raise exception 'Marque a alternativa certa do quiz %.', v_ordem; end if;
      v_tempo := least(greatest(case when v_tempo <= 0 then 20 else v_tempo end, 5), 120);
      v_cfg := '{}'::jsonb;
    elsif v_tipo = 'votacao' then
      v_cor := null;
      v_tempo := least(greatest(v_tempo, 0), 600);
      if coalesce((v_cfg->>'entre_equipes')::boolean, false) then
        v_opc := '[]'::jsonb;
        v_cfg := jsonb_build_object('entre_equipes', true,
                   'bonus', least(greatest(coalesce((v_cfg->>'bonus')::int, 300), 0), 1000));
      else
        if v_n < 2 or v_n > 8 then raise exception 'A votação % precisa de 2 a 8 opções.', v_ordem; end if;
        v_cfg := '{}'::jsonb;
      end if;
    elsif v_tipo = 'nuvem' then
      v_cor := null; v_opc := '[]'::jsonb;
      v_tempo := least(greatest(v_tempo, 0), 600);
      v_cfg := jsonb_build_object('max_respostas', least(greatest(coalesce((v_cfg->>'max_respostas')::int, 3), 1), 5));
    else -- escala
      v_cor := null; v_opc := '[]'::jsonb;
      v_tempo := least(greatest(v_tempo, 0), 600);
      v_cfg := jsonb_build_object(
        'min', 0,
        'max', case when coalesce((v_cfg->>'max')::int, 10) = 5 then 5 else 10 end,
        'rotulo_min', left(coalesce(v_cfg->>'rotulo_min', ''), 40),
        'rotulo_max', left(coalesce(v_cfg->>'rotulo_max', ''), 40));
    end if;

    v_id := case when coalesce(item->>'id', '') ~ '^[0-9a-f-]{36}$' then (item->>'id')::uuid end;
    if v_id is not null and exists (select 1 from public.aovivo_atividades where id = v_id and sessao_id = p_sessao) then
      update public.aovivo_atividades set ordem = v_ordem, tipo = v_tipo, pergunta = v_perg, opcoes = v_opc,
        correta = v_cor, tempo = v_tempo, config = v_cfg
      where id = v_id;
    else
      insert into public.aovivo_atividades (sessao_id, ordem, tipo, pergunta, opcoes, correta, tempo, config)
      values (p_sessao, v_ordem, v_tipo, v_perg, v_opc, v_cor, v_tempo, v_cfg);
    end if;
  end loop;

  -- se a atividade que estava no telão foi apagada, volta para a sala de espera
  update public.aovivo_sessoes s set fase = 'lobby', atividade = null, extra = null
   where s.id = p_sessao and s.atividade is not null
     and not exists (select 1 from public.aovivo_atividades a where a.id = (s.atividade->>'id')::uuid);

  return public.aovivo_painel(p_sessao, p_chave);
end $$;

create or replace function public.aovivo_painel(p_sessao uuid, p_chave text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_pub jsonb; v_ativ jsonb; v_part jsonb; v_atual uuid;
begin
  perform public.aovivo_checa_chave(p_sessao, p_chave);
  v_pub := public.aovivo_publico(p_sessao);
  v_atual := (v_pub->'atividade'->>'id')::uuid;

  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'ordem', a.ordem, 'tipo', a.tipo, 'pergunta', a.pergunta,
           'opcoes', a.opcoes, 'correta', a.correta, 'tempo', a.tempo, 'config', a.config,
           'encerrada', a.encerrada_em is not null,
           'respostas', (select count(distinct r.participante_id) from public.aovivo_respostas r where r.atividade_id = a.id))
           order by a.ordem, a.criado_em), '[]'::jsonb)
  into v_ativ from public.aovivo_atividades a where a.sessao_id = p_sessao;

  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'equipe', p.equipe,
           'pontos', p.pontos, 'sequencia', p.sequencia, 'sorteado', p.sorteado) order by p.pontos desc, p.criado_em), '[]'::jsonb)
  into v_part from public.aovivo_participantes p where p.sessao_id = p_sessao;

  return v_pub || jsonb_build_object(
    'atividades', v_ativ,
    'participantes', v_part,
    'ao_vivo', case when v_atual is not null then public.aovivo_resultado(v_atual) end,
    'ranking', public.aovivo_ranking_dados(p_sessao),
    'agora', now());
end $$;

create or replace function public.aovivo_iniciar(p_sessao uuid, p_chave text, p_atividade uuid, p_limpar boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.aovivo_sessoes; a public.aovivo_atividades; v_num integer; v_tot integer; b text;
begin
  perform public.aovivo_checa_chave(p_sessao, p_chave);
  select * into s from public.aovivo_sessoes where id = p_sessao for update;
  select * into a from public.aovivo_atividades where id = p_atividade and sessao_id = p_sessao;
  if not found then raise exception 'Atividade não encontrada.'; end if;

  if a.tipo = 'votacao' and coalesce((a.config->>'entre_equipes')::boolean, false) then
    if not s.modo_equipes or coalesce(array_length(s.equipes, 1), 0) < 2 then
      raise exception 'Para votar entre equipes, ative o modo equipes com pelo menos 2 equipes.';
    end if;
    if a.encerrada_em is null or p_limpar then
      update public.aovivo_atividades set opcoes = to_jsonb(s.equipes) where id = a.id returning * into a;
    end if;
  end if;

  if p_limpar then
    update public.aovivo_participantes pp set pontos = greatest(0, pp.pontos - x.soma)
      from (select participante_id, sum(pontos)::int as soma from public.aovivo_respostas
            where atividade_id = a.id group by 1) x
     where pp.id = x.participante_id;
    if a.bonus is not null then
      for b in select jsonb_array_elements_text(a.bonus->'equipes') loop
        update public.aovivo_participantes set pontos = greatest(0, pontos - coalesce((a.bonus->>'pontos')::int, 0))
         where sessao_id = p_sessao and equipe = b;
      end loop;
    end if;
    delete from public.aovivo_respostas where atividade_id = a.id;
    update public.aovivo_atividades set encerrada_em = null, bonus = null where id = a.id returning * into a;
  end if;

  select count(*) into v_tot from public.aovivo_atividades where sessao_id = p_sessao;
  select count(*) into v_num from public.aovivo_atividades
   where sessao_id = p_sessao and (ordem < a.ordem or (ordem = a.ordem and criado_em <= a.criado_em));

  update public.aovivo_sessoes set fase = 'atividade', extra = null,
    atividade = jsonb_build_object('id', a.id, 'tipo', a.tipo, 'pergunta', a.pergunta, 'opcoes', a.opcoes,
      'tempo', a.tempo, 'config', a.config, 'iniciada_em', now(), 'numero', v_num, 'total', v_tot)
  where id = p_sessao;
  return public.aovivo_painel(p_sessao, p_chave);
end $$;

create or replace function public.aovivo_mostrar_resultado(p_sessao uuid, p_chave text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.aovivo_sessoes; a public.aovivo_atividades; v_bonus integer; v_venc jsonb;
begin
  perform public.aovivo_checa_chave(p_sessao, p_chave);
  select * into s from public.aovivo_sessoes where id = p_sessao for update;
  if s.atividade is null then raise exception 'Nenhuma atividade em andamento.'; end if;
  select * into a from public.aovivo_atividades where id = (s.atividade->>'id')::uuid;
  if not found then raise exception 'Atividade não encontrada.'; end if;

  if a.encerrada_em is null then
    if a.tipo = 'quiz' then
      -- quem não acertou perde a sequência de acertos
      update public.aovivo_participantes p set sequencia = 0
       where p.sessao_id = p_sessao
         and not exists (select 1 from public.aovivo_respostas r
                          where r.atividade_id = a.id and r.participante_id = p.id and r.correta);
    end if;
    if a.tipo = 'votacao' and coalesce((a.config->>'entre_equipes')::boolean, false) then
      v_bonus := coalesce((a.config->>'bonus')::int, 0);
      with c as (select (valor #>> '{}')::int as idx, count(*) as n from public.aovivo_respostas
                 where atividade_id = a.id group by 1),
           m as (select max(n) as mx from c)
      select coalesce(jsonb_agg(a.opcoes->>c.idx), '[]'::jsonb) into v_venc
        from c, m where c.n = m.mx and m.mx > 0;
      if v_bonus > 0 and jsonb_array_length(v_venc) > 0 then
        update public.aovivo_participantes set pontos = pontos + v_bonus
         where sessao_id = p_sessao and equipe in (select jsonb_array_elements_text(v_venc));
        update public.aovivo_atividades set bonus = jsonb_build_object('equipes', v_venc, 'pontos', v_bonus)
         where id = a.id;
      end if;
    end if;
    update public.aovivo_atividades set encerrada_em = now() where id = a.id;
  end if;

  update public.aovivo_sessoes set fase = 'resultado',
    atividade = s.atividade || jsonb_build_object('correta', a.correta),
    extra = public.aovivo_resultado(a.id)
  where id = p_sessao;
  return public.aovivo_painel(p_sessao, p_chave);
end $$;

create or replace function public.aovivo_mostrar_ranking(p_sessao uuid, p_chave text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.aovivo_checa_chave(p_sessao, p_chave);
  update public.aovivo_sessoes set fase = 'ranking', extra = public.aovivo_ranking_dados(p_sessao)
   where id = p_sessao;
  return public.aovivo_painel(p_sessao, p_chave);
end $$;

create or replace function public.aovivo_sortear(p_sessao uuid, p_chave text, p_config jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.aovivo_sessoes;
  v_modo text := coalesce(p_config->>'modo', 'pessoa');
  v_filtro text := coalesce(p_config->>'filtro', 'todos');
  v_qtd integer := least(greatest(coalesce((p_config->>'quantidade')::int, 1), 1), 10);
  v_norep boolean := coalesce((p_config->>'nao_repetir')::boolean, true);
  v_ref uuid;
  v_ganh jsonb; v_cand jsonb; v_total integer;
begin
  perform public.aovivo_checa_chave(p_sessao, p_chave);
  select * into s from public.aovivo_sessoes where id = p_sessao for update;

  if v_modo = 'equipe' then
    if coalesce(array_length(s.equipes, 1), 0) < 2 then raise exception 'Cadastre pelo menos 2 equipes para sortear equipe.'; end if;
    select jsonb_agg(jsonb_build_object('nome', e)) into v_ganh
      from (select e from unnest(s.equipes) e order by random() limit v_qtd) x;
    v_cand := to_jsonb(s.equipes);
    v_total := array_length(s.equipes, 1);
  else
    if v_filtro = 'acertaram' then
      select id into v_ref from public.aovivo_atividades
       where sessao_id = p_sessao and tipo = 'quiz' and encerrada_em is not null
       order by encerrada_em desc limit 1;
      if v_ref is null then raise exception 'Ainda não houve nenhum quiz encerrado nesta aula.'; end if;
    elsif v_filtro = 'participaram' then
      v_ref := (s.atividade->>'id')::uuid;
      if v_ref is null then raise exception 'Ainda não houve nenhuma atividade nesta aula.'; end if;
    end if;

    with cand as (
      select p.id, p.nome, p.equipe from public.aovivo_participantes p
       where p.sessao_id = p_sessao
         and (not v_norep or not p.sorteado)
         and (v_filtro = 'todos'
              or (v_filtro = 'acertaram' and exists (select 1 from public.aovivo_respostas r
                    where r.atividade_id = v_ref and r.participante_id = p.id and r.correta))
              or (v_filtro = 'participaram' and exists (select 1 from public.aovivo_respostas r
                    where r.atividade_id = v_ref and r.participante_id = p.id)))),
    g as (select * from cand order by random() limit v_qtd)
    select (select count(*) from cand),
           (select jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'equipe', equipe)) from g),
           (select jsonb_agg(nome) from (select nome from cand order by random() limit 60) c)
      into v_total, v_ganh, v_cand;
    if v_total = 0 then raise exception 'Não há ninguém para sortear com esse filtro.'; end if;

    update public.aovivo_participantes set sorteado = true
     where id in (select (g->>'id')::uuid from jsonb_array_elements(v_ganh) g);
  end if;

  update public.aovivo_sessoes set fase = 'sorteio',
    extra = jsonb_build_object('modo', v_modo, 'filtro', v_filtro, 'ganhadores', v_ganh,
                               'candidatos', v_cand, 'total', v_total, 'em', now())
  where id = p_sessao;
  return public.aovivo_painel(p_sessao, p_chave);
end $$;

create or replace function public.aovivo_mudar_fase(p_sessao uuid, p_chave text, p_fase text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.aovivo_checa_chave(p_sessao, p_chave);
  if p_fase not in ('lobby', 'encerrada') then raise exception 'Fase inválida.'; end if;
  if p_fase = 'encerrada' then
    update public.aovivo_sessoes set fase = 'encerrada', extra = public.aovivo_ranking_dados(p_sessao) where id = p_sessao;
  else
    update public.aovivo_sessoes set fase = 'lobby', atividade = null, extra = null where id = p_sessao;
  end if;
  return public.aovivo_painel(p_sessao, p_chave);
end $$;

create or replace function public.aovivo_reiniciar(p_sessao uuid, p_chave text, p_remover_participantes boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.aovivo_checa_chave(p_sessao, p_chave);
  delete from public.aovivo_respostas where sessao_id = p_sessao;
  if p_remover_participantes then
    delete from public.aovivo_participantes where sessao_id = p_sessao;
  else
    update public.aovivo_participantes set pontos = 0, sequencia = 0, sorteado = false where sessao_id = p_sessao;
  end if;
  update public.aovivo_atividades set encerrada_em = null, bonus = null where sessao_id = p_sessao;
  -- se a sessão tinha sido encerrada e o código voltou a ser usado por outra, gera um novo
  update public.aovivo_sessoes s set
    codigo = case when s.fase = 'encerrada' and exists (select 1 from public.aovivo_sessoes o
                    where o.codigo = s.codigo and o.fase <> 'encerrada' and o.id <> s.id)
                  then lpad((floor(random() * 1000000))::int::text, 6, '0') else s.codigo end,
    fase = 'lobby', atividade = null, extra = null
  where s.id = p_sessao;
  return public.aovivo_painel(p_sessao, p_chave);
end $$;

create or replace function public.aovivo_duplicar(p_sessao uuid, p_chave text, p_titulo text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.aovivo_sessoes; v_nova jsonb;
begin
  perform public.aovivo_checa_chave(p_sessao, p_chave);
  select * into s from public.aovivo_sessoes where id = p_sessao;
  v_nova := public.aovivo_criar_sessao(coalesce(nullif(btrim(p_titulo), ''), s.titulo), s.modo_equipes, s.equipes);
  insert into public.aovivo_atividades (sessao_id, ordem, tipo, pergunta, opcoes, correta, tempo, config)
    select (v_nova->>'id')::uuid, ordem, tipo, pergunta,
           case when tipo = 'votacao' and coalesce((config->>'entre_equipes')::boolean, false) then '[]'::jsonb else opcoes end,
           correta, tempo, config
      from public.aovivo_atividades where sessao_id = p_sessao;
  return v_nova;
end $$;

create or replace function public.aovivo_remover_participante(p_sessao uuid, p_chave text, p_participante uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.aovivo_checa_chave(p_sessao, p_chave);
  delete from public.aovivo_participantes where id = p_participante and sessao_id = p_sessao;
  return public.aovivo_painel(p_sessao, p_chave);
end $$;

create or replace function public.aovivo_remover_palavra(p_sessao uuid, p_chave text, p_atividade uuid, p_palavra text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.aovivo_checa_chave(p_sessao, p_chave);
  delete from public.aovivo_respostas
   where sessao_id = p_sessao and atividade_id = p_atividade and (valor #>> '{}') = p_palavra;
  update public.aovivo_sessoes set extra = public.aovivo_resultado(p_atividade)
   where id = p_sessao and fase = 'resultado' and (atividade->>'id')::uuid = p_atividade;
  return public.aovivo_painel(p_sessao, p_chave);
end $$;

-- ============ Alunos ============

create or replace function public.aovivo_entrar(p_codigo text, p_nome text, p_equipe text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.aovivo_sessoes; v_base text; v_nome text; v_eq text; i integer := 1; p public.aovivo_participantes;
begin
  select * into s from public.aovivo_sessoes
   where codigo = regexp_replace(coalesce(p_codigo, ''), '\D', '', 'g') and fase <> 'encerrada'
   order by criado_em desc limit 1;
  if not found then raise exception 'Código não encontrado. Confira o número na tela da aula.'; end if;

  v_base := left(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')), 24);
  if v_base = '' then raise exception 'Digite seu nome para entrar.'; end if;
  v_nome := v_base;
  while exists (select 1 from public.aovivo_participantes where sessao_id = s.id and lower(nome) = lower(v_nome)) loop
    i := i + 1;
    v_nome := v_base || ' ' || i;
  end loop;

  if s.modo_equipes then
    if p_equipe is not null and p_equipe = any(s.equipes) then
      v_eq := p_equipe;
    else
      select e into v_eq from unnest(s.equipes) e
        left join (select equipe, count(*) as c from public.aovivo_participantes where sessao_id = s.id group by equipe) x
          on x.equipe = e
       order by coalesce(x.c, 0), random() limit 1;
    end if;
  end if;

  insert into public.aovivo_participantes (sessao_id, nome, equipe) values (s.id, v_nome, v_eq) returning * into p;
  return jsonb_build_object('sessao_id', s.id, 'participante_id', p.id, 'token', p.token, 'nome', p.nome, 'equipe', p.equipe);
end $$;

create or replace function public.aovivo_estado(p_sessao uuid, p_participante uuid default null, p_token uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_pub jsonb; p public.aovivo_participantes; v_eu jsonb; v_pos integer; v_tot integer;
  v_atual uuid; v_n integer; v_cor boolean; v_pts integer; v_vals jsonb; v_eqpos integer; v_fase text;
begin
  v_pub := public.aovivo_publico(p_sessao);
  if v_pub is null then raise exception 'Sessão não encontrada.'; end if;
  v_fase := v_pub->>'fase';

  if p_participante is not null then
    select * into p from public.aovivo_participantes
     where id = p_participante and token = p_token and sessao_id = p_sessao;
    if found then
      select count(*) + 1 into v_pos from public.aovivo_participantes where sessao_id = p_sessao and pontos > p.pontos;
      select count(*) into v_tot from public.aovivo_participantes where sessao_id = p_sessao;
      v_atual := (v_pub->'atividade'->>'id')::uuid;
      if v_atual is not null then
        select count(*), bool_or(correta), coalesce(sum(pontos), 0), jsonb_agg(valor order by id)
          into v_n, v_cor, v_pts, v_vals
          from public.aovivo_respostas where atividade_id = v_atual and participante_id = p.id;
      end if;
      if p.equipe is not null then
        select pos into v_eqpos from (
          select equipe, rank() over (order by avg(pontos) desc) as pos
            from public.aovivo_participantes where sessao_id = p_sessao and equipe is not null group by equipe) z
         where z.equipe = p.equipe;
      end if;
      v_eu := jsonb_build_object('id', p.id, 'nome', p.nome, 'equipe', p.equipe, 'pontos', p.pontos,
        'posicao', v_pos, 'total', v_tot, 'sequencia', p.sequencia, 'equipe_posicao', v_eqpos,
        'respostas', coalesce(v_n, 0), 'valores', coalesce(v_vals, '[]'::jsonb),
        'correta', case when v_fase <> 'atividade' then v_cor end,
        'ganhou', case when v_fase <> 'atividade' then v_pts end);
    end if;
  end if;
  return v_pub || jsonb_build_object('eu', v_eu, 'agora', now());
end $$;

create or replace function public.aovivo_responder(p_participante uuid, p_token uuid, p_atividade uuid, p_valor jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  p public.aovivo_participantes; s public.aovivo_sessoes; a public.aovivo_atividades;
  v_ms numeric; v_n integer; v_txt text; v_int integer; v_pts integer := 0; v_ok boolean; v_max integer;
begin
  select * into p from public.aovivo_participantes where id = p_participante and token = p_token;
  if not found then raise exception 'Você saiu da sala. Entre de novo com o código.'; end if;
  perform pg_advisory_xact_lock(hashtext(p.id::text));

  select * into s from public.aovivo_sessoes where id = p.sessao_id;
  if s.fase <> 'atividade' or (s.atividade->>'id')::uuid is distinct from p_atividade then
    raise exception 'Essa atividade já foi encerrada.';
  end if;
  select * into a from public.aovivo_atividades where id = p_atividade;
  v_ms := extract(epoch from (clock_timestamp() - (s.atividade->>'iniciada_em')::timestamptz)) * 1000;
  if a.tempo > 0 and v_ms > a.tempo * 1000 + 2000 then raise exception 'O tempo acabou!'; end if;

  select count(*) into v_n from public.aovivo_respostas where atividade_id = a.id and participante_id = p.id;

  if a.tipo = 'nuvem' then
    v_max := coalesce((a.config->>'max_respostas')::int, 3);
    if v_n >= v_max then raise exception 'Você já enviou suas % respostas.', v_max; end if;
    v_txt := left(lower(btrim(regexp_replace(coalesce(p_valor #>> '{}', ''), '\s+', ' ', 'g'))), 30);
    if v_txt = '' then raise exception 'Escreva uma palavra.'; end if;
    if exists (select 1 from public.aovivo_respostas where atividade_id = a.id and participante_id = p.id
                and (valor #>> '{}') = v_txt) then
      raise exception 'Você já enviou essa palavra.';
    end if;
    if v_n = 0 then v_pts := 50; end if;
    insert into public.aovivo_respostas (sessao_id, atividade_id, participante_id, valor, pontos, tempo_ms)
    values (s.id, a.id, p.id, to_jsonb(v_txt), v_pts, v_ms::int);

  elsif a.tipo in ('quiz', 'votacao') then
    if v_n > 0 then raise exception 'Você já respondeu.'; end if;
    v_int := (p_valor #>> '{}')::int;
    if v_int is null or v_int < 0 or v_int >= jsonb_array_length(a.opcoes) then raise exception 'Opção inválida.'; end if;
    if a.tipo = 'votacao' then
      if coalesce((a.config->>'entre_equipes')::boolean, false) and (a.opcoes->>v_int) = p.equipe then
        raise exception 'Não vale votar na própria equipe!';
      end if;
      v_pts := 50;
    else
      v_ok := (v_int = a.correta);
      if v_ok then
        v_pts := round(1000 - 500 * least(v_ms, a.tempo * 1000.0) / (a.tempo * 1000.0))::int
                 + least(p.sequencia, 3) * 100;
        update public.aovivo_participantes set sequencia = sequencia + 1 where id = p.id;
      else
        update public.aovivo_participantes set sequencia = 0 where id = p.id;
      end if;
    end if;
    insert into public.aovivo_respostas (sessao_id, atividade_id, participante_id, valor, correta, pontos, tempo_ms)
    values (s.id, a.id, p.id, to_jsonb(v_int), v_ok, v_pts, v_ms::int);

  else -- escala
    if v_n > 0 then raise exception 'Você já respondeu.'; end if;
    v_int := round((p_valor #>> '{}')::numeric)::int;
    if v_int is null or v_int < coalesce((a.config->>'min')::int, 0) or v_int > coalesce((a.config->>'max')::int, 10) then
      raise exception 'Valor fora da escala.';
    end if;
    v_pts := 50;
    insert into public.aovivo_respostas (sessao_id, atividade_id, participante_id, valor, pontos, tempo_ms)
    values (s.id, a.id, p.id, to_jsonb(v_int), v_pts, v_ms::int);
  end if;

  if v_pts > 0 then update public.aovivo_participantes set pontos = pontos + v_pts where id = p.id; end if;
  return jsonb_build_object('ok', true);
end $$;

-- ============ Permissões ============
-- Funções internas: ninguém de fora chama.
revoke all on function public.aovivo_checa_chave(uuid, text) from public, anon, authenticated;
revoke all on function public.aovivo_publico(uuid) from public, anon, authenticated;
revoke all on function public.aovivo_limpa_equipes(text[]) from public, anon, authenticated;
revoke all on function public.aovivo_resultado(uuid) from public, anon, authenticated;
revoke all on function public.aovivo_ranking_dados(uuid) from public, anon, authenticated;
revoke all on function public.aovivo_antes_atualizar() from public, anon, authenticated;
revoke all on function public.aovivo_avisar() from public, anon, authenticated;

-- Funções que o site chama
grant execute on function public.aovivo_criar_sessao(text, boolean, text[]) to anon, authenticated;
grant execute on function public.aovivo_editar_sessao(uuid, text, text, boolean, text[]) to anon, authenticated;
grant execute on function public.aovivo_salvar_atividades(uuid, text, jsonb) to anon, authenticated;
grant execute on function public.aovivo_painel(uuid, text) to anon, authenticated;
grant execute on function public.aovivo_iniciar(uuid, text, uuid, boolean) to anon, authenticated;
grant execute on function public.aovivo_mostrar_resultado(uuid, text) to anon, authenticated;
grant execute on function public.aovivo_mostrar_ranking(uuid, text) to anon, authenticated;
grant execute on function public.aovivo_sortear(uuid, text, jsonb) to anon, authenticated;
grant execute on function public.aovivo_mudar_fase(uuid, text, text) to anon, authenticated;
grant execute on function public.aovivo_reiniciar(uuid, text, boolean) to anon, authenticated;
grant execute on function public.aovivo_duplicar(uuid, text, text) to anon, authenticated;
grant execute on function public.aovivo_remover_participante(uuid, text, uuid) to anon, authenticated;
grant execute on function public.aovivo_remover_palavra(uuid, text, uuid, text) to anon, authenticated;
grant execute on function public.aovivo_entrar(text, text, text) to anon, authenticated;
grant execute on function public.aovivo_estado(uuid, uuid, uuid) to anon, authenticated;
grant execute on function public.aovivo_responder(uuid, uuid, uuid, jsonb) to anon, authenticated;
