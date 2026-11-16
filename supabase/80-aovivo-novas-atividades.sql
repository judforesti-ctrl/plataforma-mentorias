-- 80 · Mentorei Ao Vivo: novas atividades (pedido da Juliana, 16/11/2026, "pode fazer todos esses que você sugeriu").
-- Rodado pelo Claude no banco (migração aovivo_24_novas_atividades). Pode rodar de novo: cada troca confere se já foi feita.
--   reacao     · Reações ao vivo: emojis voando no telão (toques à vontade, até 80 por pessoa).
--   checkin    · Check-in de humor: uma carinha por pessoa (0 a 4).
--   checkout   · Check-out: "o que você leva desta aula" (uma frase; vai no e-mail dos materiais).
--   perguntas  · Mural de perguntas anônimas: cada um manda até N perguntas e curte as dos outros.
--   mural      · Mural de ideias: etapa "escrever" (até N ideias) e etapa "votar" (até N votos), aberta pela professora.
--   relampago  · Rodada relâmpago: 2 a 10 perguntas seguidas (config.perguntas), cada uma com N segundos + 4 de revelação.
--   escala     · antes e depois: config.par (mesmo código nas duas escalas) e config.papel ('antes' | 'depois').
--   fase 'intervalo' (aovivo_intervalo) · medalhas do fim da aula (aovivo_medalhas, no aovivo_estado da aula encerrada).

alter table public.aovivo_atividades drop constraint if exists aovivo_atividades_tipo_check;
alter table public.aovivo_atividades add constraint aovivo_atividades_tipo_check
  check (tipo = any (array['slide','nuvem','quiz','votacao','escala','grupo','ferramenta','entrada',
                           'reacao','checkin','checkout','perguntas','mural','relampago']));
alter table public.aovivo_sessoes drop constraint if exists aovivo_sessoes_fase_check;
alter table public.aovivo_sessoes add constraint aovivo_sessoes_fase_check
  check (fase = any (array['lobby','slide','atividade','resultado','ranking','sorteio','encerrada','intervalo']));

do $migracao$
declare d text; n text;
begin
  ---------------------------------------------------------------- salvar o roteiro
  d := pg_get_functiondef('public.aovivo_salvar_roteiro(uuid,text,jsonb)'::regprocedure);
  if position('''relampago''' in d) = 0 then
    n := replace(d, $a$v_tipo not in ('slide','nuvem','quiz','votacao','escala','grupo','ferramenta','entrada')$a$,
                    $a$v_tipo not in ('slide','nuvem','quiz','votacao','escala','grupo','ferramenta','entrada','reacao','checkin','checkout','perguntas','mural','relampago')$a$);
    n := replace(n, $a$    elsif v_tipo = 'ferramenta' then
      if v_perg = '' then raise exception 'Escolha a ferramenta na posição %.', v_ordem; end if;$a$,
$a$    elsif v_tipo in ('reacao', 'checkin', 'checkout', 'perguntas', 'mural') then
      if v_tipo = 'mural' and v_perg = '' then raise exception 'Escreva o desafio do mural de ideias na posição %.', v_ordem; end if;
      v_opc := '[]'::jsonb; v_cor := null;
      v_tempo := least(greatest(v_tempo, 0), 3600);
      v_cfg := case v_tipo
        when 'mural' then jsonb_build_object('ideias', least(greatest(coalesce((v_cfg->>'ideias')::int, 2), 1), 5),
                                             'votos', least(greatest(coalesce((v_cfg->>'votos')::int, 3), 1), 5))
        when 'perguntas' then jsonb_build_object('max', least(greatest(coalesce((v_cfg->>'max')::int, 3), 1), 5))
        else '{}'::jsonb end;

    elsif v_tipo = 'relampago' then
      v_passos := coalesce((select jsonb_agg(jsonb_build_object(
            'pergunta', left(btrim(z.q->>'pergunta'), 160),
            'opcoes', coalesce((select jsonb_agg(left(btrim(o), 60)) from jsonb_array_elements_text(
                         case when jsonb_typeof(z.q->'opcoes') = 'array' then z.q->'opcoes' else '[]'::jsonb end) o where btrim(o) <> ''), '[]'::jsonb),
            'correta', case when coalesce(z.q->>'correta', '') ~ '^[0-9]+$' then (z.q->>'correta')::int end) order by z.k)
          from jsonb_array_elements(case when jsonb_typeof(v_cfg->'perguntas') = 'array' then v_cfg->'perguntas' else '[]'::jsonb end) with ordinality z(q, k)
         where jsonb_typeof(z.q) = 'object' and btrim(coalesce(z.q->>'pergunta', '')) <> ''), '[]'::jsonb);
      if jsonb_array_length(v_passos) < 2 or jsonb_array_length(v_passos) > 10 then
        raise exception 'A rodada relâmpago na posição % precisa de 2 a 10 perguntas.', v_ordem;
      end if;
      if exists (select 1 from jsonb_array_elements(v_passos) x(q)
                  where jsonb_array_length(x.q->'opcoes') < 2 or jsonb_array_length(x.q->'opcoes') > 4
                     or (x.q->>'correta') is null or (x.q->>'correta')::int >= jsonb_array_length(x.q->'opcoes')) then
        raise exception 'Na rodada relâmpago da posição %, cada pergunta precisa de 2 a 4 alternativas e da certa marcada.', v_ordem;
      end if;
      v_cfg := jsonb_build_object('perguntas', v_passos, 'segundos', least(greatest(coalesce((v_cfg->>'segundos')::int, 12), 5), 30));
      if v_perg = '' then v_perg := 'Rodada relâmpago'; end if;
      v_opc := '[]'::jsonb; v_cor := null; v_tempo := 0;

    elsif v_tipo = 'ferramenta' then
      if v_perg = '' then raise exception 'Escolha a ferramenta na posição %.', v_ordem; end if;$a$);
    n := replace(n, $a$          'rotulo_max', left(coalesce(v_cfg->>'rotulo_max', ''), 40));$a$,
$a$          'rotulo_max', left(coalesce(v_cfg->>'rotulo_max', ''), 40),
          'par', nullif(left(regexp_replace(lower(coalesce(v_cfg->>'par', '')), '[^a-z0-9]', '', 'g'), 24), ''),
          'papel', case when v_cfg->>'papel' in ('antes', 'depois') then v_cfg->>'papel' end);$a$);
    if position('elsif v_tipo = ''relampago''' in n) = 0 or position('''papel''' in n) = 0 then raise exception 'salvar_roteiro: troca não aconteceu'; end if;
    execute n;
  end if;

  ---------------------------------------------------------------- começar uma atividade
  d := pg_get_functiondef('public.aovivo_iniciar(uuid,text,uuid,boolean)'::regprocedure);
  if position('''etapa''' in d) = 0 then
    n := replace(d, $a$'tempo', a.tempo, 'config', a.config, 'iniciada_em', now(),$a$,
$a$'tempo', a.tempo,
      -- na rodada relâmpago o celular não recebe a resposta certa
      'config', case when a.tipo = 'relampago' then a.config || jsonb_build_object('perguntas',
                  coalesce((select jsonb_agg(z.q - 'correta' order by z.k) from jsonb_array_elements(a.config->'perguntas') with ordinality z(q, k)), '[]'::jsonb))
                else a.config end,
      'etapa', case when a.tipo = 'mural' then coalesce(a.estado->>'etapa', 'escrever') end,
      'iniciada_em', now(),$a$);
    n := replace(n, $a$    update public.aovivo_atividades set encerrada_em = null, bonus = null where id = a.id returning * into a;$a$,
$a$    update public.aovivo_atividades set encerrada_em = null, bonus = null where id = a.id returning * into a;
    if a.tipo in ('mural', 'perguntas', 'checkout') then
      update public.aovivo_atividades set estado = null where id = a.id returning * into a;
    end if;$a$);
    if position('''etapa''' in n) = 0 or position('estado = null' in n) = 0 then raise exception 'iniciar: troca não aconteceu'; end if;
    execute n;
  end if;

  ---------------------------------------------------------------- responder
  d := pg_get_functiondef('public.aovivo_responder(uuid,uuid,uuid,jsonb)'::regprocedure);
  if position('''relampago''' in d) = 0 then
    n := replace(d, 'v_max integer; v_tempo integer; v_atrasado boolean;',
                    'v_max integer; v_tempo integer; v_atrasado boolean; v_alvo bigint; v_dono uuid; v_n2 integer; v_q integer; v_seg integer; v_nq integer; v_ja bigint;');
    n := replace(n, $a$  else
    raise exception 'Este item não recebe respostas.';$a$,
$a$  elsif a.tipo = 'reacao' then
    if v_n >= 80 then return jsonb_build_object('ok', true); end if;
    v_int := case when coalesce(p_valor #>> '{}', '') ~ '^[0-9]$' then (p_valor #>> '{}')::int end;
    if v_int is null or v_int > 5 then raise exception 'Reação inválida.'; end if;
    if v_n = 0 then v_pts := 20; end if;
    insert into public.aovivo_respostas (sessao_id, atividade_id, participante_id, valor, pontos, tempo_ms)
    values (s.id, a.id, p.id, to_jsonb(v_int), v_pts, v_ms::int);

  elsif a.tipo = 'checkin' then
    if v_n > 0 then raise exception 'Você já respondeu.'; end if;
    v_int := case when coalesce(p_valor #>> '{}', '') ~ '^[0-9]$' then (p_valor #>> '{}')::int end;
    if v_int is null or v_int > 4 then raise exception 'Escolha uma carinha.'; end if;
    v_pts := 50;
    insert into public.aovivo_respostas (sessao_id, atividade_id, participante_id, valor, pontos, tempo_ms)
    values (s.id, a.id, p.id, to_jsonb(v_int), v_pts, v_ms::int);

  elsif a.tipo = 'checkout' then
    if v_n > 0 then raise exception 'Você já mandou a sua frase.'; end if;
    v_txt := left(btrim(regexp_replace(coalesce(p_valor #>> '{}', ''), '\s+', ' ', 'g')), 160);
    if v_txt = '' then raise exception 'Escreva a sua frase.'; end if;
    v_pts := 50;
    insert into public.aovivo_respostas (sessao_id, atividade_id, participante_id, valor, pontos, tempo_ms)
    values (s.id, a.id, p.id, to_jsonb(v_txt), v_pts, v_ms::int);

  elsif a.tipo in ('perguntas', 'mural') then
    if jsonb_typeof(p_valor) = 'object' and p_valor ? 'curte' then
      -- curtir (perguntas) ou votar (mural, só na etapa de votar); tocar de novo tira o voto
      if a.tipo = 'mural' and coalesce(s.atividade->>'etapa', 'escrever') <> 'votar' then raise exception 'A votação ainda não abriu.'; end if;
      v_alvo := case when coalesce(p_valor->>'curte', '') ~ '^[0-9]+$' then (p_valor->>'curte')::bigint end;
      select r.participante_id into v_dono from public.aovivo_respostas r where r.id = v_alvo and r.atividade_id = a.id and r.valor ? 'texto';
      if not found then raise exception 'Não achei esse item.'; end if;
      if v_dono = p.id then raise exception 'Não vale votar na própria.'; end if;
      select r.id into v_ja from public.aovivo_respostas r
       where r.atividade_id = a.id and r.participante_id = p.id and r.valor->>'curte' = v_alvo::text limit 1;
      if v_ja is not null then
        update public.aovivo_respostas set valor = jsonb_build_object('desfeito', valor) where id = v_ja;
        return jsonb_build_object('ok', true, 'tirou', true);
      end if;
      if a.tipo = 'mural' then
        select count(*) into v_n2 from public.aovivo_respostas r where r.atividade_id = a.id and r.participante_id = p.id and r.valor ? 'curte';
        v_max := coalesce((a.config->>'votos')::int, 3);
        if v_n2 >= v_max then raise exception 'Você já usou os seus % votos. Toque num voto para tirar.', v_max; end if;
      end if;
      insert into public.aovivo_respostas (sessao_id, atividade_id, participante_id, valor, pontos, tempo_ms)
      values (s.id, a.id, p.id, jsonb_build_object('curte', v_alvo::text), 0, v_ms::int);
    else
      if a.tipo = 'mural' and coalesce(s.atividade->>'etapa', 'escrever') <> 'escrever' then raise exception 'Agora é hora de votar.'; end if;
      select count(*) into v_n2 from public.aovivo_respostas r where r.atividade_id = a.id and r.participante_id = p.id and r.valor ? 'texto';
      v_max := case when a.tipo = 'mural' then coalesce((a.config->>'ideias')::int, 2) else coalesce((a.config->>'max')::int, 3) end;
      if v_n2 >= v_max then raise exception 'Você já mandou % %.', v_max, case when a.tipo = 'mural' then 'ideias' else 'perguntas' end; end if;
      v_txt := left(btrim(regexp_replace(coalesce(case when jsonb_typeof(p_valor) = 'object' then p_valor->>'texto' else p_valor #>> '{}' end, ''), '\s+', ' ', 'g')),
                    case when a.tipo = 'mural' then 140 else 200 end);
      if v_txt = '' then raise exception 'Escreva primeiro.'; end if;
      if exists (select 1 from public.aovivo_respostas r where r.atividade_id = a.id and r.participante_id = p.id and lower(r.valor->>'texto') = lower(v_txt)) then
        raise exception 'Você já mandou essa.';
      end if;
      v_pts := case when v_n2 = 0 then 30 else 0 end;
      insert into public.aovivo_respostas (sessao_id, atividade_id, participante_id, valor, pontos, tempo_ms)
      values (s.id, a.id, p.id, jsonb_build_object('texto', v_txt), v_pts, v_ms::int);
    end if;

  elsif a.tipo = 'relampago' then
    v_seg := least(greatest(coalesce((a.config->>'segundos')::int, 12), 5), 30);
    v_nq := coalesce(jsonb_array_length(a.config->'perguntas'), 0);
    v_q := floor(v_ms / ((v_seg + 4) * 1000.0))::int;
    if v_q >= v_nq then raise exception 'A rodada acabou.'; end if;
    if coalesce(p_valor->>'q', '') !~ '^[0-9]+$' or (p_valor->>'q')::int <> v_q then raise exception 'Essa pergunta já passou.'; end if;
    if v_ms - v_q * (v_seg + 4) * 1000.0 > v_seg * 1000 + 1500 then raise exception 'O tempo acabou!'; end if;
    if exists (select 1 from public.aovivo_respostas r where r.atividade_id = a.id and r.participante_id = p.id and r.valor->>'q' = v_q::text) then
      raise exception 'Você já respondeu.';
    end if;
    v_int := case when coalesce(p_valor->>'v', '') ~ '^[0-9]$' then (p_valor->>'v')::int end;
    if v_int is null or v_int >= jsonb_array_length(a.config->'perguntas'->v_q->'opcoes') then raise exception 'Opção inválida.'; end if;
    v_ok := v_int = (a.config->'perguntas'->v_q->>'correta')::int;
    if v_ok then
      v_pts := round(1000 - 500 * least(v_ms - v_q * (v_seg + 4) * 1000.0, v_seg * 1000.0) / (v_seg * 1000.0))::int;
    end if;
    insert into public.aovivo_respostas (sessao_id, atividade_id, participante_id, valor, correta, pontos, tempo_ms)
    values (s.id, a.id, p.id, jsonb_build_object('q', v_q, 'v', v_int), v_ok, v_pts, (v_ms - v_q * (v_seg + 4) * 1000.0)::int);

  else
    raise exception 'Este item não recebe respostas.';$a$);
    -- o check-out também aceita quem termina de escrever depois que a aula seguiu
    n := replace(n, $a$if a.tipo not in ('grupo', 'ferramenta') or s.comecou_em is null$a$,
                    $a$if a.tipo not in ('grupo', 'ferramenta', 'checkout') or s.comecou_em is null$a$);
    if position('elsif a.tipo = ''relampago''' in n) = 0 or position('v_alvo bigint' in n) = 0 then raise exception 'responder: troca não aconteceu'; end if;
    execute n;
  end if;

  ---------------------------------------------------------------- resultado
  d := pg_get_functiondef('public.aovivo_resultado(uuid)'::regprocedure);
  if position('''relampago''' in d) = 0 then
    n := replace(d, 'v_total integer; v_lista jsonb; v_media numeric; v_min integer; v_max integer; v_abriu integer;',
                    'v_total integer; v_lista jsonb; v_media numeric; v_min integer; v_max integer; v_abriu integer; v_seg integer; v_nq integer; v_ini timestamptz; v_ms numeric; v_rev integer; v_placar jsonb; v_eq jsonb; v_antes jsonb;');
    n := replace(n, $a$  else
    v_min := coalesce((a.config->>'min')::int, 0);$a$,
$a$  elsif a.tipo in ('reacao', 'checkin') then
    select coalesce(jsonb_agg(coalesce(c.n, 0) order by i.idx), '[]'::jsonb) into v_lista
      from generate_series(0, case when a.tipo = 'reacao' then 5 else 4 end) as i(idx)
      left join (select (r.valor #>> '{}')::int as idx, count(*)::int as n from public.aovivo_respostas r
                  where r.atividade_id = a.id group by 1) c on c.idx = i.idx;
    return jsonb_build_object('tipo', a.tipo, 'total', v_total, 'contagem', v_lista,
      'toques', (select count(*)::int from public.aovivo_respostas r where r.atividade_id = a.id));

  elsif a.tipo = 'checkout' then
    select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'texto', x.t) order by x.id desc), '[]'::jsonb) into v_lista
      from (select r.id, r.valor #>> '{}' as t from public.aovivo_respostas r
             where r.atividade_id = a.id and not coalesce(a.estado->'ocultas', '[]'::jsonb) ? r.id::text
             order by r.id desc limit 80) x;
    return jsonb_build_object('tipo', a.tipo, 'total', v_total, 'frases', v_lista);

  elsif a.tipo in ('perguntas', 'mural') then
    select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'texto', x.t, 'n', x.n, 'respondida', x.resp) order by x.resp, x.n desc, x.id), '[]'::jsonb) into v_lista
      from (select r.id, r.valor->>'texto' as t,
                   (select count(*)::int from public.aovivo_respostas c where c.atividade_id = a.id and c.valor->>'curte' = r.id::text) as n,
                   coalesce(a.estado->'respondidas', '[]'::jsonb) ? r.id::text as resp
              from public.aovivo_respostas r
             where r.atividade_id = a.id and r.valor ? 'texto'
               and not coalesce(a.estado->'ocultas', '[]'::jsonb) ? r.id::text
             order by r.id limit 150) x;
    return jsonb_build_object('tipo', a.tipo, 'total', v_total, 'itens', v_lista, 'etapa', coalesce(a.estado->>'etapa', 'escrever'),
      'autores', (select count(distinct r.participante_id)::int from public.aovivo_respostas r where r.atividade_id = a.id and r.valor ? 'texto'),
      'votantes', (select count(distinct r.participante_id)::int from public.aovivo_respostas r where r.atividade_id = a.id and r.valor ? 'curte'));

  elsif a.tipo = 'relampago' then
    v_seg := least(greatest(coalesce((a.config->>'segundos')::int, 12), 5), 30);
    v_nq := coalesce(jsonb_array_length(a.config->'perguntas'), 0);
    select (s.atividade->>'iniciada_em')::timestamptz into v_ini from public.aovivo_sessoes s
     where s.id = a.sessao_id and s.fase = 'atividade' and (s.atividade->>'id')::uuid = a.id;
    if v_ini is null then v_rev := v_nq;
    else
      v_ms := extract(epoch from (now() - v_ini)) * 1000;
      v_rev := case when v_ms < v_seg * 1000 then 0 else least(v_nq, floor((v_ms - v_seg * 1000) / ((v_seg + 4) * 1000.0))::int + 1) end;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
             'contagem', (select coalesce(jsonb_agg(coalesce(c.n, 0) order by o.i), '[]'::jsonb)
                            from generate_series(0, jsonb_array_length(z.q->'opcoes') - 1) o(i)
                            left join (select (r.valor->>'v')::int as v, count(*)::int as n from public.aovivo_respostas r
                                        where r.atividade_id = a.id and r.valor->>'q' = (z.k - 1)::text group by 1) c on c.v = o.i),
             'correta', case when z.k <= v_rev then (z.q->>'correta')::int end) order by z.k), '[]'::jsonb) into v_lista
      from jsonb_array_elements(a.config->'perguntas') with ordinality z(q, k);
    select coalesce(jsonb_agg(jsonb_build_object('nome', x.nome, 'equipe', x.equipe, 'pontos', x.pts) order by x.pts desc, x.nome), '[]'::jsonb) into v_placar
      from (select pp.nome, pp.equipe, sum(r.pontos)::int as pts from public.aovivo_respostas r
              join public.aovivo_participantes pp on pp.id = r.participante_id
             where r.atividade_id = a.id group by pp.id, pp.nome, pp.equipe order by 3 desc, 1 limit 8) x;
    select coalesce(jsonb_agg(jsonb_build_object('equipe', x.equipe, 'pontos', x.pts) order by x.pts desc), '[]'::jsonb) into v_eq
      from (select pp.equipe, sum(r.pontos)::int as pts from public.aovivo_respostas r
              join public.aovivo_participantes pp on pp.id = r.participante_id
             where r.atividade_id = a.id and pp.equipe is not null group by pp.equipe) x;
    return jsonb_build_object('tipo', a.tipo, 'total', v_total, 'segundos', v_seg, 'perguntas', v_nq, 'reveladas', v_rev,
      'questoes', v_lista, 'placar', v_placar, 'equipes', v_eq);

  else
    v_min := coalesce((a.config->>'min')::int, 0);$a$);
    n := replace(n, $a$    return jsonb_build_object('tipo', a.tipo, 'total', v_total, 'distribuicao', v_lista,
      'media', v_media, 'min', v_min, 'max', v_max);$a$,
$a$    -- antes e depois: esta escala é a "depois" de um par
    if coalesce(a.config->>'par', '') <> '' and a.config->>'papel' = 'depois' then
      select jsonb_build_object('media', round(avg((r.valor #>> '{}')::numeric), 1), 'total', count(distinct r.participante_id), 'pergunta', b.pergunta)
        into v_antes
        from public.aovivo_atividades b left join public.aovivo_respostas r on r.atividade_id = b.id
       where b.sessao_id = a.sessao_id and not b.arquivada and b.tipo = 'escala' and b.id <> a.id
         and b.config->>'par' = a.config->>'par'
       group by b.id, b.pergunta, b.ordem order by b.ordem limit 1;
    end if;
    return jsonb_build_object('tipo', a.tipo, 'total', v_total, 'distribuicao', v_lista,
      'media', v_media, 'min', v_min, 'max', v_max, 'antes', v_antes);$a$);
    if position('elsif a.tipo = ''relampago''' in n) = 0 or position('''antes'', v_antes' in n) = 0 then raise exception 'resultado: troca não aconteceu'; end if;
    execute n;
  end if;
end $migracao$;

-- Medalhas do fim da aula (vão no aovivo_estado da aula encerrada e no e-mail dos materiais)
create or replace function public.aovivo_medalhas(p_sessao uuid, p_participante uuid)
returns jsonb language plpgsql stable security definer set search_path to ''
as $f$
declare m jsonb := '[]'::jsonb; v_pts integer; v_pos integer; v_linha record; v_seq integer := 0; v_max integer := 0;
        v_ativ integer; v_feitas integer;
begin
  select pontos into v_pts from public.aovivo_participantes where id = p_participante and sessao_id = p_sessao;
  if not found then return '[]'::jsonb; end if;
  select count(*) + 1 into v_pos from public.aovivo_participantes where sessao_id = p_sessao and pontos > v_pts;
  if v_pts > 0 and v_pos <= 3 then
    m := m || jsonb_build_object('k', 'podio', 'icone', case v_pos when 1 then '🥇' when 2 then '🥈' else '🥉' end,
      'nome', v_pos || 'º lugar', 'texto', 'Ficou no pódio da aula.');
  end if;
  if exists (select 1 from public.aovivo_respostas r join public.aovivo_atividades a on a.id = r.atividade_id
              where r.sessao_id = p_sessao and a.tipo = 'quiz' and r.correta and r.participante_id = p_participante
                and r.tempo_ms = (select min(x.tempo_ms) from public.aovivo_respostas x where x.atividade_id = r.atividade_id and x.correta)) then
    m := m || jsonb_build_object('k', 'rapido', 'icone', '⚡', 'nome', 'Mais rápido(a)', 'texto', 'Acertou um quiz antes de todo mundo.');
  end if;
  for v_linha in select (select x.correta from public.aovivo_respostas x where x.atividade_id = a.id and x.participante_id = p_participante limit 1) as c
             from public.aovivo_atividades a
            where a.sessao_id = p_sessao and a.tipo = 'quiz' and not a.arquivada
              and exists (select 1 from public.aovivo_respostas y where y.atividade_id = a.id)
            order by a.ordem loop
    if coalesce(v_linha.c, false) then v_seq := v_seq + 1; v_max := greatest(v_max, v_seq); else v_seq := 0; end if;
  end loop;
  if v_max >= 3 then
    m := m || jsonb_build_object('k', 'sequencia', 'icone', '🔥', 'nome', v_max || ' acertos seguidos', 'texto', 'Acertou ' || v_max || ' quizzes em sequência.');
  end if;
  if exists (select 1 from public.aovivo_respostas r join public.aovivo_atividades a on a.id = r.atividade_id
              where r.sessao_id = p_sessao and r.participante_id = p_participante and a.tipo = 'grupo') then
    m := m || jsonb_build_object('k', 'voz', 'icone', '📣', 'nome', 'Voz do grupo', 'texto', 'Mandou a resposta do grupo.');
  end if;
  if exists (select 1 from public.aovivo_atividades a
              where a.sessao_id = p_sessao and a.tipo = 'mural' and not a.arquivada
                and exists (select 1 from public.aovivo_respostas c where c.atividade_id = a.id and c.valor ? 'curte')
                and (select r.participante_id from public.aovivo_respostas r where r.atividade_id = a.id and r.valor ? 'texto'
                      order by (select count(*) from public.aovivo_respostas c where c.atividade_id = a.id and c.valor->>'curte' = r.id::text) desc, r.id
                      limit 1) = p_participante) then
    m := m || jsonb_build_object('k', 'ideia', 'icone', '💡', 'nome', 'Ideia campeã', 'texto', 'A sua ideia foi a mais votada.');
  end if;
  if exists (select 1 from public.aovivo_respostas r join public.aovivo_atividades a on a.id = r.atividade_id
              where r.sessao_id = p_sessao and r.participante_id = p_participante and a.tipo = 'perguntas' and r.valor ? 'texto') then
    m := m || jsonb_build_object('k', 'curioso', 'icone', '🙋', 'nome', 'Boa pergunta', 'texto', 'Fez pergunta no mural.');
  end if;
  if exists (select 1 from public.aovivo_respostas r join public.aovivo_atividades a on a.id = r.atividade_id
              where r.sessao_id = p_sessao and r.participante_id = p_participante and a.tipo = 'ferramenta' and (r.valor #>> '{}') = 'terminou') then
    m := m || jsonb_build_object('k', 'mao', 'icone', '🧭', 'nome', 'Mão na massa', 'texto', 'Terminou a ferramenta da aula.');
  end if;
  select count(*) into v_ativ from public.aovivo_atividades a
   where a.sessao_id = p_sessao and not a.arquivada and a.tipo not in ('slide', 'entrada', 'grupo')
     and exists (select 1 from public.aovivo_respostas r where r.atividade_id = a.id);
  select count(distinct r.atividade_id) into v_feitas from public.aovivo_respostas r join public.aovivo_atividades a on a.id = r.atividade_id
   where r.sessao_id = p_sessao and r.participante_id = p_participante and a.tipo not in ('slide', 'entrada', 'grupo') and not a.arquivada;
  if v_ativ >= 3 and v_feitas >= v_ativ then
    m := m || jsonb_build_object('k', 'total', 'icone', '🙌', 'nome', 'Participação total', 'texto', 'Respondeu todas as atividades.');
  elsif v_ativ >= 3 and v_feitas * 10 >= v_ativ * 7 then
    m := m || jsonb_build_object('k', 'ativa', 'icone', '✋', 'nome', 'Participação ativa', 'texto', 'Respondeu quase todas as atividades.');
  end if;
  return m;
end $f$;
revoke all on function public.aovivo_medalhas(uuid, uuid) from public, anon, authenticated;

-- O que o celular vê: textos do mural/perguntas (sem nome), as respostas da rodada relâmpago já reveladas e as medalhas
do $migracao$
declare d text; n text;
begin
  d := pg_get_functiondef('public.aovivo_estado(uuid,uuid,uuid)'::regprocedure);
  if position('v_textos' in d) = 0 then
    n := replace(d, '  v_pontos integer; v_grupos jsonb;', '  v_pontos integer; v_grupos jsonb; v_textos jsonb; v_est jsonb; v_rel jsonb; v_med jsonb; v_oculto integer := 0; v_seg integer;');
    n := replace(n, $a$        if (v_pub->'atividade'->>'tipo') = 'grupo' and v_fase in ('atividade', 'resultado') then
          v_grupos := (public.aovivo_resultado(v_atual))->'grupos';
        end if;$a$,
$a$        if (v_pub->'atividade'->>'tipo') = 'grupo' and v_fase in ('atividade', 'resultado') then
          v_grupos := (public.aovivo_resultado(v_atual))->'grupos';
        end if;
        if (v_pub->'atividade'->>'tipo') in ('perguntas', 'mural') and v_fase in ('atividade', 'resultado') then
          select estado into v_est from public.aovivo_atividades where id = v_atual;
          select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'texto', x.t, 'n', x.n, 'meu', x.meu, 'curti', x.curti, 'respondida', x.resp)
                   order by x.resp, x.n desc, x.id), '[]'::jsonb) into v_textos
            from (select r.id, r.valor->>'texto' as t, r.participante_id = p.id as meu,
                         (select count(*)::int from public.aovivo_respostas c where c.atividade_id = v_atual and c.valor->>'curte' = r.id::text) as n,
                         exists (select 1 from public.aovivo_respostas c where c.atividade_id = v_atual and c.participante_id = p.id and c.valor->>'curte' = r.id::text) as curti,
                         coalesce(v_est->'respondidas', '[]'::jsonb) ? r.id::text as resp
                    from public.aovivo_respostas r
                   where r.atividade_id = v_atual and r.valor ? 'texto' and not coalesce(v_est->'ocultas', '[]'::jsonb) ? r.id::text
                   order by r.id limit 150) x;
        end if;
        if (v_pub->'atividade'->>'tipo') = 'relampago' then
          v_seg := least(greatest(coalesce((v_pub->'atividade'->'config'->>'segundos')::int, 12), 5), 30);
          select coalesce(jsonb_agg(jsonb_build_object('q', x.q, 'v', x.v, 'certo', case when x.rev then x.correta end, 'pontos', case when x.rev then x.pontos end) order by x.q), '[]'::jsonb),
                 coalesce(sum(case when x.rev then 0 else x.pontos end), 0)
            into v_rel, v_oculto
            from (select (r.valor->>'q')::int as q, (r.valor->>'v')::int as v, r.correta, r.pontos,
                         v_fase <> 'atividade' or extract(epoch from (now() - (v_pub->'atividade'->>'iniciada_em')::timestamptz)) * 1000
                           >= ((r.valor->>'q')::int * (v_seg + 4) + v_seg) * 1000 as rev
                    from public.aovivo_respostas r where r.atividade_id = v_atual and r.participante_id = p.id) x;
        end if;$a$);
    n := replace(n, $a$v_pontos := p.pontos - case when v_fase = 'atividade' and (v_pub->'atividade'->>'tipo') = 'quiz' then coalesce(v_pts, 0) else 0 end;$a$,
                    $a$v_pontos := p.pontos - case when v_fase = 'atividade' and (v_pub->'atividade'->>'tipo') = 'quiz' then coalesce(v_pts, 0) else 0 end - coalesce(v_oculto, 0);
      if v_fase = 'encerrada' then v_med := public.aovivo_medalhas(p_sessao, p.id); end if;$a$);
    n := replace(n, $a$|| jsonb_build_object('pendentes',$a$, $a$|| jsonb_build_object('relampago', v_rel, 'medalhas', v_med)
        || jsonb_build_object('pendentes',$a$);
    n := replace(n, $a$return v_pub || jsonb_build_object('eu', v_eu, 'agora', now(), 'grupo_respostas', v_grupos);$a$,
                    $a$return v_pub || jsonb_build_object('eu', v_eu, 'agora', now(), 'grupo_respostas', v_grupos, 'textos', v_textos);$a$);
    if position('''textos'', v_textos' in n) = 0 or position('''medalhas'', v_med' in n) = 0 or position('coalesce(v_oculto, 0)' in n) = 0 then
      raise exception 'estado: troca não aconteceu';
    end if;
    execute n;
  end if;
end $migracao$;

-- Mural de ideias: a professora abre a votação
create or replace function public.aovivo_mural_etapa(p_sessao uuid, p_chave text, p_etapa text)
returns jsonb language plpgsql security definer set search_path to ''
as $f$
declare s public.aovivo_sessoes;
begin
  perform public.aovivo_checa_chave(p_sessao, p_chave);
  if p_etapa not in ('escrever', 'votar') then raise exception 'Etapa inválida.'; end if;
  select * into s from public.aovivo_sessoes where id = p_sessao for update;
  if s.fase <> 'atividade' or s.atividade->>'tipo' <> 'mural' then raise exception 'O mural de ideias não está no ar.'; end if;
  update public.aovivo_atividades set estado = coalesce(estado, '{}'::jsonb) || jsonb_build_object('etapa', p_etapa)
   where id = (s.atividade->>'id')::uuid;
  update public.aovivo_sessoes set atividade = atividade || jsonb_build_object('etapa', p_etapa, 'etapa_em', now(), 'iniciada_em', now())   -- a votação ganha o mesmo tempo where id = p_sessao;
  return public.aovivo_painel(p_sessao, p_chave);
end $f$;

-- Perguntas e mural: marcar como respondida, ou esconder (o que não deve aparecer); clicar de novo desfaz
create or replace function public.aovivo_marcar_texto(p_sessao uuid, p_chave text, p_resposta bigint, p_acao text)
returns jsonb language plpgsql security definer set search_path to ''
as $f$
declare r public.aovivo_respostas; a public.aovivo_atividades; k text; v_lista jsonb;
begin
  perform public.aovivo_checa_chave(p_sessao, p_chave);
  if p_acao not in ('respondida', 'ocultar') then raise exception 'Ação inválida.'; end if;
  select * into r from public.aovivo_respostas where id = p_resposta and sessao_id = p_sessao;
  if not found then raise exception 'Não achei esse item.'; end if;
  select * into a from public.aovivo_atividades where id = r.atividade_id for update;
  if a.tipo not in ('perguntas', 'mural', 'checkout') then raise exception 'Este item não tem textos.'; end if;
  k := case when p_acao = 'respondida' then 'respondidas' else 'ocultas' end;
  v_lista := coalesce(a.estado->k, '[]'::jsonb);
  if v_lista ? r.id::text then
    v_lista := coalesce((select jsonb_agg(x) from jsonb_array_elements_text(v_lista) x where x <> r.id::text), '[]'::jsonb);
  else
    v_lista := v_lista || to_jsonb(r.id::text);
  end if;
  update public.aovivo_atividades set estado = coalesce(estado, '{}'::jsonb) || jsonb_build_object(k, v_lista) where id = a.id;
  -- o resultado já no telão também muda
  update public.aovivo_sessoes set extra = case when fase = 'resultado' and (atividade->>'id')::uuid = a.id then public.aovivo_resultado(a.id) else extra end
   where id = p_sessao;
  return public.aovivo_painel(p_sessao, p_chave);
end $f$;

-- Intervalo: telão e celular com a contagem para voltar (a música toca no painel)
create or replace function public.aovivo_intervalo(p_sessao uuid, p_chave text, p_minutos integer)
returns jsonb language plpgsql security definer set search_path to ''
as $f$
declare v_min integer := least(greatest(coalesce(p_minutos, 10), 1), 60);
begin
  perform public.aovivo_checa_chave(p_sessao, p_chave);
  update public.aovivo_sessoes set fase = 'intervalo', comecou_em = coalesce(comecou_em, now()),
    extra = jsonb_build_object('fim', now() + make_interval(mins => v_min), 'minutos', v_min, 'em', now())
   where id = p_sessao;
  return public.aovivo_painel(p_sessao, p_chave);
end $f$;

-- "Zerar para a próxima aula": o mural de ideias volta para a etapa de escrever; respondidas e escondidas zeram
do $migracao$
declare d text; n text;
begin
  d := pg_get_functiondef('public.aovivo_reiniciar(uuid,text,boolean)'::regprocedure);
  if position('''mural''' in d) = 0 then
    n := replace(d, $a$  update public.aovivo_atividades set encerrada_em = null, bonus = null where sessao_id = p_sessao;$a$,
$a$  update public.aovivo_atividades set encerrada_em = null, bonus = null where sessao_id = p_sessao;
  update public.aovivo_atividades set estado = null where sessao_id = p_sessao and tipo in ('mural', 'perguntas', 'checkout');$a$);
    if n = d then raise exception 'troca não aconteceu'; end if;
    execute n;
  end if;
end $migracao$;
