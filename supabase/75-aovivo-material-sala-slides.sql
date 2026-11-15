-- 75 · Mentorei Ao Vivo (15/11/2026, pedidos da Juliana depois do 1º teste):
--   material em PDF ligado ao slide ou ao exercício em grupo (para todos ou para um grupo), aberto no celular sem baixar;
--   link da sala da aula (Zoom, Meet, Teams) no painel; slides mais rápidos no celular (o aviso do tempo real já leva o
--   slide novo e cada mudança diz quais são os próximos, para o celular carregar antes).
-- Rodado pelo Claude pelo conector do Supabase no mesmo dia.

alter table public.aovivo_sessoes add column if not exists sala_link text;

-- confere a lista de materiais (PDF) de um item do roteiro
create or replace function public.aovivo_materiais(p_lista jsonb, p_ordem integer) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  v_base text := 'https://mixnubenhaleohkcanma.supabase.co/storage/v1/object/public/aovivo-slides/';
  m jsonb; r jsonb := '[]'::jsonb; v_pdf text; v_g integer;
begin
  if p_lista is null or jsonb_typeof(p_lista) <> 'array' then return '[]'::jsonb; end if;
  for m in select value from jsonb_array_elements(p_lista) limit 12 loop
    if jsonb_typeof(m) <> 'object' then continue; end if;
    v_pdf := coalesce(m->>'pdf', '');
    if v_pdf = '' then continue; end if;
    if left(v_pdf, length(v_base)) <> v_base or v_pdf !~ '^[A-Za-z0-9:/._-]+\.pdf$' then
      raise exception 'Material em PDF inválido no item %.', p_ordem;
    end if;
    v_g := case when coalesce(m->>'grupo', '') ~ '^[0-9]{1,2}$' then (m->>'grupo')::int end;
    if v_g is not null and (v_g < 1 or v_g > 30) then v_g := null; end if;
    r := r || jsonb_build_array(jsonb_build_object('pdf', v_pdf, 'nome', left(btrim(coalesce(m->>'nome', '')), 80), 'grupo', v_g));
  end loop;
  return r;
end $$;
revoke all on function public.aovivo_materiais(jsonb, integer) from public, anon, authenticated;

create or replace function public.aovivo_salvar_roteiro(p_sessao uuid, p_chave text, p_lista jsonb)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
  v_ids uuid[];
  item jsonb;
  v_ordem integer := 0;
  v_tipo text; v_perg text; v_opc jsonb; v_cor integer; v_tempo integer; v_cfg jsonb; v_n integer; v_notas text;
  v_id uuid; v_img text; v_passos jsonb; v_modo text; v_pdf text; v_url text;
  v_base text := 'https://mixnubenhaleohkcanma.supabase.co/storage/v1/object/public/aovivo-slides/';
begin
  perform public.aovivo_checa_chave(p_sessao, p_chave);
  if jsonb_typeof(p_lista) <> 'array' then raise exception 'Lista inválida.'; end if;
  if jsonb_array_length(p_lista) > 400 then raise exception 'Roteiro grande demais.'; end if;

  v_ids := array(select (x->>'id')::uuid from jsonb_array_elements(p_lista) x
                 where coalesce(x->>'id', '') ~ '^[0-9a-f-]{36}$');
  update public.aovivo_atividades set arquivada = true, ordem = 0
   where sessao_id = p_sessao and not arquivada and not (id = any(coalesce(v_ids, '{}')));

  for item in select value from jsonb_array_elements(p_lista) loop
    v_ordem := v_ordem + 1;
    v_tipo := item->>'tipo';
    if v_tipo is null or v_tipo not in ('slide','nuvem','quiz','votacao','escala','grupo','ferramenta') then raise exception 'Tipo de item inválido.'; end if;
    v_perg := left(btrim(coalesce(item->>'pergunta', '')), 200);
    v_notas := left(coalesce(item->>'notas', ''), 4000);
    v_cfg := coalesce(item->'config', '{}'::jsonb);
    if jsonb_typeof(v_cfg) <> 'object' then v_cfg := '{}'::jsonb; end if;
    v_opc := coalesce((select jsonb_agg(left(btrim(o), 80)) from jsonb_array_elements_text(coalesce(item->'opcoes', '[]'::jsonb)) o
                        where btrim(o) <> ''), '[]'::jsonb);
    v_n := jsonb_array_length(v_opc);
    v_cor := nullif(item->>'correta', '')::int;
    v_tempo := coalesce(nullif(item->>'tempo', '')::int, 0);

    if v_tipo = 'slide' then
      v_img := coalesce(v_cfg->>'imagem', '');
      if left(v_img, length(v_base)) <> v_base or v_img !~ '^[A-Za-z0-9:/._-]+$' then
        raise exception 'Imagem de slide inválida no item %.', v_ordem;
      end if;
      v_cfg := jsonb_build_object('imagem', v_img, 'celular', coalesce((v_cfg->>'celular')::boolean, true),
                                  'texto', left(coalesce(v_cfg->>'texto', ''), 1500),
                                  'materiais', public.aovivo_materiais(v_cfg->'materiais', v_ordem));
      v_opc := '[]'::jsonb; v_cor := null; v_tempo := 0;

    elsif v_tipo = 'grupo' then
      if v_perg = '' then raise exception 'O exercício em grupo na posição % está sem título.', v_ordem; end if;
      v_passos := coalesce((select jsonb_agg(left(btrim(x), 300)) from (
                    select x from jsonb_array_elements_text(case when jsonb_typeof(v_cfg->'passos') = 'array' then v_cfg->'passos' else '[]'::jsonb end) x
                     where btrim(x) <> '' limit 8) z), '[]'::jsonb);
      if jsonb_array_length(v_passos) = 0 then raise exception 'Escreva o passo a passo do exercício em grupo na posição %.', v_ordem; end if;
      v_modo := coalesce(v_cfg->'grupos'->>'modo', 'escolher');
      if v_modo not in ('escolher', 'sortear', 'equipes', 'nenhum') then v_modo := 'escolher'; end if;
      v_pdf := coalesce(v_cfg->>'pdf', '');
      if v_pdf <> '' and (left(v_pdf, length(v_base)) <> v_base or v_pdf !~ '^[A-Za-z0-9:/._-]+\.pdf$') then
        raise exception 'PDF de instruções inválido no item %.', v_ordem;
      end if;
      v_cfg := jsonb_build_object(
        'passos', v_passos,
        'entrega', left(btrim(coalesce(v_cfg->>'entrega', '')), 300),
        'grupos', jsonb_build_object('modo', v_modo,
                    'quantos', least(greatest(coalesce((v_cfg->'grupos'->>'quantos')::int, 6), 2), 30),
                    'tamanho', least(greatest(coalesce((v_cfg->'grupos'->>'tamanho')::int, 4), 2), 12)),
        'resposta', jsonb_build_object('ligada', coalesce((v_cfg->'resposta'->>'ligada')::boolean, true),
                    'pergunta', left(btrim(coalesce(v_cfg->'resposta'->>'pergunta', '')), 160)),
        'pdf', v_pdf,
        'nome_pdf', left(coalesce(v_cfg->>'nome_pdf', ''), 80),
        'materiais', public.aovivo_materiais(v_cfg->'materiais', v_ordem));
      v_opc := '[]'::jsonb; v_cor := null;
      v_tempo := least(greatest(case when v_tempo <= 0 then 600 else v_tempo end, 60), 3600);

    elsif v_tipo = 'ferramenta' then
      if v_perg = '' then raise exception 'Escolha a ferramenta na posição %.', v_ordem; end if;
      v_url := btrim(coalesce(v_cfg->>'url', ''));
      if v_url !~ '^https://[^\s"<>]+$' or length(v_url) > 500 then
        raise exception 'O link da ferramenta na posição % precisa começar com https://', v_ordem;
      end if;
      v_cfg := jsonb_build_object('url', v_url, 'codigo', left(coalesce(v_cfg->>'codigo', ''), 20),
                                  'instrucao', left(btrim(coalesce(v_cfg->>'instrucao', '')), 300));
      v_opc := '[]'::jsonb; v_cor := null;
      v_tempo := least(greatest(v_tempo, 0), 3600);

    else
      if v_perg = '' then raise exception 'A atividade na posição % está sem pergunta.', v_ordem; end if;
      if v_tipo = 'quiz' then
        if v_n < 2 or v_n > 4 then raise exception 'O quiz na posição % precisa de 2 a 4 alternativas.', v_ordem; end if;
        if v_cor is null or v_cor < 0 or v_cor >= v_n then raise exception 'Marque a alternativa certa do quiz na posição %.', v_ordem; end if;
        v_tempo := least(greatest(case when v_tempo <= 0 then 30 else v_tempo end, 5), 180);
        v_cfg := '{}'::jsonb;
      elsif v_tipo = 'votacao' then
        v_cor := null;
        v_tempo := least(greatest(v_tempo, 0), 600);
        if coalesce((v_cfg->>'entre_equipes')::boolean, false) then
          v_opc := '[]'::jsonb;
          v_cfg := jsonb_build_object('entre_equipes', true,
                     'bonus', least(greatest(coalesce((v_cfg->>'bonus')::int, 300), 0), 1000));
        else
          if v_n < 2 or v_n > 8 then raise exception 'A votação na posição % precisa de 2 a 8 opções.', v_ordem; end if;
          v_cfg := '{}'::jsonb;
        end if;
      elsif v_tipo = 'nuvem' then
        v_cor := null; v_opc := '[]'::jsonb;
        v_tempo := least(greatest(v_tempo, 0), 600);
        v_cfg := jsonb_build_object('max_respostas', least(greatest(coalesce((v_cfg->>'max_respostas')::int, 3), 1), 5));
      else
        v_cor := null; v_opc := '[]'::jsonb;
        v_tempo := least(greatest(v_tempo, 0), 600);
        v_cfg := jsonb_build_object(
          'min', 0,
          'max', case when coalesce((v_cfg->>'max')::int, 10) = 5 then 5 else 10 end,
          'rotulo_min', left(coalesce(v_cfg->>'rotulo_min', ''), 40),
          'rotulo_max', left(coalesce(v_cfg->>'rotulo_max', ''), 40));
      end if;
    end if;

    v_id := case when coalesce(item->>'id', '') ~ '^[0-9a-f-]{36}$' then (item->>'id')::uuid end;
    if v_id is not null and exists (select 1 from public.aovivo_atividades where id = v_id and sessao_id = p_sessao) then
      update public.aovivo_atividades set ordem = v_ordem, tipo = v_tipo, pergunta = v_perg, opcoes = v_opc,
        correta = v_cor, tempo = v_tempo, config = v_cfg, notas = v_notas, arquivada = false
      where id = v_id;
    else
      insert into public.aovivo_atividades (sessao_id, ordem, tipo, pergunta, opcoes, correta, tempo, config, notas)
      values (p_sessao, v_ordem, v_tipo, v_perg, v_opc, v_cor, v_tempo, v_cfg, v_notas);
    end if;
  end loop;

  update public.aovivo_sessoes s set fase = 'lobby', atividade = null, extra = null
   where s.id = p_sessao and s.atividade is not null
     and not exists (select 1 from public.aovivo_atividades a
                      where a.id = (s.atividade->>'id')::uuid and not a.arquivada);

  return public.aovivo_painel(p_sessao, p_chave);
end $function$;

-- as imagens que o celular deve carregar antes: os 3 slides seguintes e o anterior
create or replace function public.aovivo_proximas(p_sessao uuid, p_ordem integer, p_criado timestamptz) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(img), '[]'::jsonb) from (
    (select a.config->>'imagem' img from public.aovivo_atividades a
      where a.sessao_id = p_sessao and not a.arquivada and a.tipo = 'slide' and coalesce((a.config->>'celular')::boolean, true)
        and (a.ordem > p_ordem or (a.ordem = p_ordem and a.criado_em > p_criado))
      order by a.ordem, a.criado_em limit 3)
    union all
    (select a.config->>'imagem' from public.aovivo_atividades a
      where a.sessao_id = p_sessao and not a.arquivada and a.tipo = 'slide' and coalesce((a.config->>'celular')::boolean, true)
        and (a.ordem < p_ordem or (a.ordem = p_ordem and a.criado_em < p_criado))
      order by a.ordem desc, a.criado_em desc limit 1)) z
  where img is not null;
$$;
revoke all on function public.aovivo_proximas(uuid, integer, timestamptz) from public, anon, authenticated;

create or replace function public.aovivo_ir_para(p_sessao uuid, p_chave text, p_item uuid, p_limpar boolean default false)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
declare a public.aovivo_atividades; prox public.aovivo_atividades; v_num integer; v_tot integer;
begin
  perform public.aovivo_checa_chave(p_sessao, p_chave);
  perform 1 from public.aovivo_sessoes where id = p_sessao for update;
  select * into a from public.aovivo_atividades where id = p_item and sessao_id = p_sessao and not arquivada;
  if not found then raise exception 'Item não encontrado.'; end if;

  if a.tipo = 'slide' then
    select * into prox from public.aovivo_atividades
     where sessao_id = p_sessao and not arquivada and (ordem > a.ordem or (ordem = a.ordem and criado_em > a.criado_em))
     order by ordem, criado_em limit 1;
    select count(*) into v_tot from public.aovivo_atividades where sessao_id = p_sessao and not arquivada and tipo = 'slide';
    select count(*) into v_num from public.aovivo_atividades
     where sessao_id = p_sessao and not arquivada and tipo = 'slide'
       and (ordem < a.ordem or (ordem = a.ordem and criado_em <= a.criado_em));
    update public.aovivo_sessoes set fase = 'slide', extra = null, comecou_em = coalesce(comecou_em, now()),
      atividade = jsonb_build_object('id', a.id, 'tipo', 'slide', 'imagem', a.config->>'imagem',
        'celular', coalesce((a.config->>'celular')::boolean, true), 'numero', v_num, 'total', v_tot,
        'iniciada_em', now(),
        'materiais', coalesce(a.config->'materiais', '[]'::jsonb),
        'proximas', public.aovivo_proximas(p_sessao, a.ordem, a.criado_em),
        'a_seguir', case when prox.id is not null and prox.tipo <> 'slide' then jsonb_build_object('tipo', prox.tipo) end)
    where id = p_sessao;
    return public.aovivo_painel(p_sessao, p_chave);
  end if;

  perform public.aovivo_iniciar(p_sessao, p_chave, p_item, p_limpar);

  select count(*) into v_tot from public.aovivo_atividades where sessao_id = p_sessao and not arquivada and tipo <> 'slide';
  select count(*) into v_num from public.aovivo_atividades
   where sessao_id = p_sessao and not arquivada and tipo <> 'slide'
     and (ordem < a.ordem or (ordem = a.ordem and criado_em <= a.criado_em));
  update public.aovivo_sessoes set comecou_em = coalesce(comecou_em, now()),
    atividade = atividade || jsonb_build_object('numero', v_num, 'total', v_tot,
                  'proximas', public.aovivo_proximas(p_sessao, a.ordem, a.criado_em))
  where id = p_sessao;

  if a.tipo = 'grupo' then
    -- os grupos ficam guardados: voltar ao exercício não sorteia de novo (só "Sortear de novo" ou "Repetir do zero")
    if a.estado is not null and a.estado ? 'grupos' and not p_limpar then
      update public.aovivo_sessoes set atividade = atividade || jsonb_build_object('grupos', a.estado->'grupos') where id = p_sessao;
    else
      perform public.aovivo_sortear_grupos(p_sessao, p_chave);
    end if;
  end if;
  return public.aovivo_painel(p_sessao, p_chave);
end $function$;

-- o aviso do tempo real já leva o slide novo: o celular troca na hora, sem esperar a consulta
create or replace function public.aovivo_avisar() returns trigger
language plpgsql security definer set search_path to '' as $function$
begin
  begin
    perform realtime.send(
      jsonb_build_object('versao', new.versao, 'fase', new.fase)
        || case when new.fase = 'slide' and new.atividade is not null
                then jsonb_build_object('atividade', new.atividade, 'tela_preta', new.tela_preta) else '{}'::jsonb end,
      'estado', 'aovivo-' || new.id::text, false);
  exception when others then
    null;
  end;
  return null;
end $function$;

-- link da sala (Zoom, Meet, Teams): vazio = o do módulo da plataforma; '-' = sem sala
create or replace function public.aovivo_sala(p_sessao uuid, p_chave text, p_link text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v text := btrim(coalesce(p_link, ''));
begin
  perform public.aovivo_checa_chave(p_sessao, p_chave);
  if v not in ('', '-') and (v !~ '^https://[^\s"<>]+$' or length(v) > 600) then
    raise exception 'O link da sala precisa começar com https://';
  end if;
  update public.aovivo_sessoes set sala_link = nullif(v, '') where id = p_sessao;
  return public.aovivo_painel(p_sessao, p_chave);
end $$;
grant execute on function public.aovivo_sala(uuid, text, text) to anon, authenticated;

create or replace function public.aovivo_painel(p_sessao uuid, p_chave text)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v_pub jsonb; v_ativ jsonb; v_part jsonb; v_atual uuid; v_resp jsonb; v_sala text; v_sala_mod text;
begin
  perform public.aovivo_checa_chave(p_sessao, p_chave);
  v_pub := public.aovivo_publico(p_sessao);
  v_atual := (v_pub->'atividade'->>'id')::uuid;

  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'ordem', a.ordem, 'tipo', a.tipo, 'pergunta', a.pergunta,
           'opcoes', a.opcoes, 'correta', a.correta, 'tempo', a.tempo, 'config', a.config, 'notas', a.notas,
           'encerrada', a.encerrada_em is not null,
           'respostas', case when a.tipo = 'slide' then 0 else (select count(distinct r.participante_id) from public.aovivo_respostas r where r.atividade_id = a.id) end)
           order by a.ordem, a.criado_em), '[]'::jsonb)
  into v_ativ from public.aovivo_atividades a where a.sessao_id = p_sessao and not a.arquivada;

  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'equipe', p.equipe,
           'pontos', p.pontos, 'sequencia', p.sequencia, 'sorteado', p.sorteado) order by p.pontos desc, p.criado_em), '[]'::jsonb)
  into v_part from public.aovivo_participantes p where p.sessao_id = p_sessao;

  if v_atual is not null then
    select coalesce(jsonb_agg(distinct r.participante_id), '[]'::jsonb) into v_resp
      from public.aovivo_respostas r where r.atividade_id = v_atual;
  end if;

  select s.sala_link, case when m.link ~ '^https?://\S+$' then m.link end into v_sala, v_sala_mod
    from public.aovivo_sessoes s left join public.modulos m on m.id = s.modulo_id where s.id = p_sessao;

  return v_pub || jsonb_build_object(
    'atividades', v_ativ,
    'participantes', v_part,
    'responderam', coalesce(v_resp, '[]'::jsonb),
    'ao_vivo', case when v_atual is not null and (v_pub->'atividade'->>'tipo') <> 'slide' then public.aovivo_resultado(v_atual) end,
    'ranking', public.aovivo_ranking_dados(p_sessao),
    'sala', case when v_sala = '-' then null else coalesce(v_sala, v_sala_mod) end,
    'sala_escolhida', v_sala,
    'sala_modulo', v_sala_mod,
    'agora', now());
end $function$;
