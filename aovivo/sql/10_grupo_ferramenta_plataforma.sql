-- Mentorei Ao Vivo · exercício em grupo, ferramenta da plataforma, avaliação no fim e ligação com a plataforma
-- (módulo da turma abre a aula, aluno entra identificado, presença vai para o módulo, sugestões da IA)

create table if not exists public.aovivo_convites (
  token uuid primary key default gen_random_uuid(),
  sessao_id uuid not null references public.aovivo_sessoes(id) on delete cascade,
  turma_aluno_id uuid not null references public.turma_alunos(id) on delete cascade,
  nome text not null,
  criado_em timestamptz not null default now(),
  unique (sessao_id, turma_aluno_id)
);
alter table public.aovivo_convites enable row level security;
revoke all on public.aovivo_convites from anon, authenticated;

-- nome sem acento, minúsculo e com um espaço só (para ligar quem digitou o nome a um aluno da turma)
create or replace function public.aovivo_norm(p text) returns text
language sql immutable set search_path = '' as $$
  select lower(translate(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g'),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'));
$$;

-- ---------- o que todo mundo da sala lê ----------
create or replace function public.aovivo_publico(p_sessao uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'codigo', s.codigo, 'titulo', s.titulo,
    'modo_equipes', s.modo_equipes, 'equipes', to_jsonb(s.equipes),
    'fase', s.fase, 'atividade', s.atividade, 'extra', s.extra, 'versao', s.versao,
    'tela_preta', s.tela_preta, 'comecou_em', s.comecou_em,
    'avaliacao', case when s.avaliacao_link = '-' then null
                      else coalesce(nullif(s.avaliacao_link, ''),
                        case when s.modulo_id is not null then 'https://plataforma.mentorei.com.br/avaliar.html?m=' || s.modulo_id::text end) end,
    'modulo', s.modulo_id is not null)
  from public.aovivo_sessoes s where s.id = p_sessao;
$$;

-- link da avaliação: vazio = automático (o do módulo, se a aula veio da plataforma); '-' = sem avaliação
create or replace function public.aovivo_ajustes(p_sessao uuid, p_chave text, p_avaliacao text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v text := btrim(coalesce(p_avaliacao, ''));
begin
  perform public.aovivo_checa_chave(p_sessao, p_chave);
  if v not in ('', '-') and (v !~ '^https://[^\s"<>]+$' or length(v) > 500) then
    raise exception 'O link da avaliação precisa começar com https://';
  end if;
  update public.aovivo_sessoes set avaliacao_link = nullif(v, '') where id = p_sessao;
  return public.aovivo_painel(p_sessao, p_chave);
end $$;

-- bilhete para enviar o PDF de instruções de um exercício em grupo
create or replace function public.aovivo_bilhete_pdf(p_sessao uuid, p_chave text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_cam text := p_sessao::text || '/' || replace(gen_random_uuid()::text, '-', '') || '/instrucoes.pdf';
begin
  perform public.aovivo_checa_chave(p_sessao, p_chave);
  insert into public.aovivo_uploads (path, sessao_id) values (v_cam, p_sessao);
  return jsonb_build_object('caminho', v_cam,
    'base', 'https://mixnubenhaleohkcanma.supabase.co/storage/v1/object/public/aovivo-slides/');
end $$;

-- ---------- roteiro ----------
create or replace function public.aovivo_salvar_roteiro(p_sessao uuid, p_chave text, p_lista jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
                                  'texto', left(coalesce(v_cfg->>'texto', ''), 1500));
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
        'nome_pdf', left(coalesce(v_cfg->>'nome_pdf', ''), 80));
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
end $$;

-- ---------- grupos do exercício: sorteados aqui, as equipes da aula ou cada um marca a sua sala ----------
create or replace function public.aovivo_sortear_grupos(p_sessao uuid, p_chave text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.aovivo_sessoes; a public.aovivo_atividades; v_modo text; v_tam integer; v_qtd integer; v_n integer; v_grupos jsonb;
begin
  perform public.aovivo_checa_chave(p_sessao, p_chave);
  select * into s from public.aovivo_sessoes where id = p_sessao for update;
  if s.fase not in ('atividade', 'resultado') or s.atividade->>'tipo' <> 'grupo' then
    raise exception 'Abra o exercício em grupo para sortear os grupos.';
  end if;
  select * into a from public.aovivo_atividades where id = (s.atividade->>'id')::uuid;
  v_modo := coalesce(a.config->'grupos'->>'modo', 'escolher');
  v_tam := coalesce((a.config->'grupos'->>'tamanho')::int, 4);

  if v_modo = 'sortear' then
    select count(*) into v_qtd from public.aovivo_participantes where sessao_id = p_sessao;
    v_n := greatest(1, ceil(v_qtd::numeric / v_tam)::int);
    select coalesce(jsonb_agg(jsonb_build_object('n', g, 'nome', 'Grupo ' || g, 'membros', membros) order by g), '[]'::jsonb) into v_grupos
      from (select g, jsonb_agg(jsonb_build_object('id', id, 'nome', nome) order by nome) as membros
              from (select id, nome, (row_number() over (order by random()) - 1) % v_n + 1 as g
                      from public.aovivo_participantes where sessao_id = p_sessao) x
             group by g) y;
  elsif v_modo = 'equipes' and s.modo_equipes and coalesce(array_length(s.equipes, 1), 0) >= 2 then
    select coalesce(jsonb_agg(jsonb_build_object('n', e.i, 'nome', e.eq,
             'membros', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome) order by p.nome)
                                    from public.aovivo_participantes p where p.sessao_id = p_sessao and p.equipe = e.eq), '[]'::jsonb))
             order by e.i), '[]'::jsonb) into v_grupos
      from unnest(s.equipes) with ordinality as e(eq, i);
  else
    v_grupos := null;
  end if;

  update public.aovivo_atividades set estado = jsonb_build_object('grupos', v_grupos) where id = a.id;
  update public.aovivo_sessoes set atividade = s.atividade || jsonb_build_object('grupos', v_grupos) where id = p_sessao;
  return public.aovivo_painel(p_sessao, p_chave);
end $$;

create or replace function public.aovivo_ir_para(p_sessao uuid, p_chave text, p_item uuid, p_limpar boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
    atividade = atividade || jsonb_build_object('numero', v_num, 'total', v_tot)
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
end $$;

-- ---------- respostas ----------
create or replace function public.aovivo_responder(p_participante uuid, p_token uuid, p_atividade uuid, p_valor jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.aovivo_participantes; s public.aovivo_sessoes; a public.aovivo_atividades;
  v_ms numeric; v_n integer; v_txt text; v_int integer; v_pts integer := 0; v_ok boolean; v_max integer; v_tempo integer;
begin
  select * into p from public.aovivo_participantes where id = p_participante and token = p_token;
  if not found then raise exception 'Você saiu da sala. Entre de novo com o código.'; end if;
  perform pg_advisory_xact_lock(hashtext(p.id::text));
  update public.aovivo_participantes set visto_em = now() where id = p.id;

  select * into s from public.aovivo_sessoes where id = p.sessao_id;
  if s.fase <> 'atividade' or (s.atividade->>'id')::uuid is distinct from p_atividade then
    raise exception 'Essa atividade já foi encerrada.';
  end if;
  select * into a from public.aovivo_atividades where id = p_atividade;
  v_tempo := coalesce((s.atividade->>'tempo')::int, a.tempo);
  v_ms := extract(epoch from (clock_timestamp() - (s.atividade->>'iniciada_em')::timestamptz)) * 1000;
  -- no exercício em grupo e na ferramenta, quem atrasou ainda consegue mandar até a professora seguir
  if a.tipo not in ('grupo', 'ferramenta') and v_tempo > 0 and v_ms > v_tempo * 1000 + 2000 then raise exception 'O tempo acabou!'; end if;

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
        v_pts := round(1000 - 500 * least(v_ms, v_tempo * 1000.0) / (v_tempo * 1000.0))::int
                 + least(p.sequencia, 3) * 100;
        update public.aovivo_participantes set sequencia = sequencia + 1 where id = p.id;
      else
        update public.aovivo_participantes set sequencia = 0 where id = p.id;
      end if;
    end if;
    insert into public.aovivo_respostas (sessao_id, atividade_id, participante_id, valor, correta, pontos, tempo_ms)
    values (s.id, a.id, p.id, to_jsonb(v_int), v_ok, v_pts, v_ms::int);

  elsif a.tipo = 'escala' then
    if v_n > 0 then raise exception 'Você já respondeu.'; end if;
    v_int := round((p_valor #>> '{}')::numeric)::int;
    if v_int is null or v_int < coalesce((a.config->>'min')::int, 0) or v_int > coalesce((a.config->>'max')::int, 10) then
      raise exception 'Valor fora da escala.';
    end if;
    v_pts := 50;
    insert into public.aovivo_respostas (sessao_id, atividade_id, participante_id, valor, pontos, tempo_ms)
    values (s.id, a.id, p.id, to_jsonb(v_int), v_pts, v_ms::int);

  elsif a.tipo = 'grupo' then
    if not coalesce((a.config->'resposta'->>'ligada')::boolean, true) then raise exception 'Este exercício não pede resposta pelo celular.'; end if;
    if v_n >= 30 then raise exception 'Você já mandou muitas vezes. Peça para outra pessoa do grupo mandar.'; end if;
    v_int := nullif(p_valor->>'grupo', '')::int;
    if v_int is null or v_int < 1 or v_int > 50 then raise exception 'Escolha o número do seu grupo.'; end if;
    v_txt := left(btrim(coalesce(p_valor->>'texto', '')), 600);
    if v_txt = '' then raise exception 'Escreva a resposta do grupo.'; end if;
    insert into public.aovivo_respostas (sessao_id, atividade_id, participante_id, valor, pontos, tempo_ms)
    values (s.id, a.id, p.id, jsonb_build_object('grupo', v_int, 'texto', v_txt), 0, v_ms::int);

  elsif a.tipo = 'ferramenta' then
    v_txt := p_valor #>> '{}';
    if v_txt not in ('abriu', 'terminou') then raise exception 'Resposta inválida.'; end if;
    if exists (select 1 from public.aovivo_respostas where atividade_id = a.id and participante_id = p.id and (valor #>> '{}') = v_txt) then
      return jsonb_build_object('ok', true);
    end if;
    if v_txt = 'terminou' then v_pts := 50; end if;
    insert into public.aovivo_respostas (sessao_id, atividade_id, participante_id, valor, pontos, tempo_ms)
    values (s.id, a.id, p.id, to_jsonb(v_txt), v_pts, v_ms::int);
  else
    raise exception 'Este item não recebe respostas.';
  end if;

  if v_pts > 0 then update public.aovivo_participantes set pontos = pontos + v_pts where id = p.id; end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.aovivo_resultado(p_atividade uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  a public.aovivo_atividades;
  v_total integer; v_lista jsonb; v_media numeric; v_min integer; v_max integer; v_abriu integer;
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

  elsif a.tipo = 'grupo' then
    -- a última resposta de cada grupo
    select coalesce(jsonb_agg(jsonb_build_object('grupo', g, 'texto', t, 'nome', nome, 'em', em) order by g), '[]'::jsonb) into v_lista
    from (select distinct on ((r.valor->>'grupo')::int) (r.valor->>'grupo')::int as g, r.valor->>'texto' as t, p.nome, r.criado_em as em
            from public.aovivo_respostas r join public.aovivo_participantes p on p.id = r.participante_id
           where r.atividade_id = a.id
           order by (r.valor->>'grupo')::int, r.id desc) x;
    return jsonb_build_object('tipo', a.tipo, 'total', jsonb_array_length(v_lista), 'grupos', v_lista);

  elsif a.tipo = 'ferramenta' then
    select count(distinct participante_id) filter (where (valor #>> '{}') = 'terminou'),
           count(distinct participante_id)
      into v_total, v_abriu from public.aovivo_respostas where atividade_id = a.id;
    return jsonb_build_object('tipo', a.tipo, 'total', v_total, 'abriram', v_abriu);

  else
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

create or replace function public.aovivo_estado(p_sessao uuid, p_participante uuid default null, p_token uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_pub jsonb; p public.aovivo_participantes; v_eu jsonb; v_pos integer; v_tot integer;
  v_atual uuid; v_n integer; v_cor boolean; v_pts integer; v_vals jsonb; v_eqpos integer; v_fase text;
  v_pontos integer; v_grupos jsonb;
begin
  v_pub := public.aovivo_publico(p_sessao);
  if v_pub is null then raise exception 'Sessão não encontrada.'; end if;
  v_fase := v_pub->>'fase';

  if p_participante is not null then
    select * into p from public.aovivo_participantes
     where id = p_participante and token = p_token and sessao_id = p_sessao;
    if found then
      -- "visto agora" (para o tempo na aula da lista de presença), no máximo a cada 20 segundos
      if p.visto_em is null or p.visto_em < now() - interval '20 seconds' then
        update public.aovivo_participantes set visto_em = now() where id = p.id;
      end if;
      v_atual := (v_pub->'atividade'->>'id')::uuid;
      if v_atual is not null then
        select count(*), bool_or(correta), coalesce(sum(pontos), 0), jsonb_agg(valor order by id)
          into v_n, v_cor, v_pts, v_vals
          from public.aovivo_respostas where atividade_id = v_atual and participante_id = p.id;
        if (v_pub->'atividade'->>'tipo') = 'grupo' and v_fase in ('atividade', 'resultado') then
          v_grupos := (public.aovivo_resultado(v_atual))->'grupos';
        end if;
      end if;
      v_pontos := p.pontos - case when v_fase = 'atividade' and (v_pub->'atividade'->>'tipo') = 'quiz' then coalesce(v_pts, 0) else 0 end;
      select count(*) + 1 into v_pos from public.aovivo_participantes where sessao_id = p_sessao and pontos > p.pontos;
      select count(*) into v_tot from public.aovivo_participantes where sessao_id = p_sessao;
      if p.equipe is not null then
        select pos into v_eqpos from (
          select equipe, rank() over (order by avg(pontos) desc) as pos
            from public.aovivo_participantes where sessao_id = p_sessao and equipe is not null group by equipe) z
         where z.equipe = p.equipe;
      end if;
      v_eu := jsonb_build_object('id', p.id, 'nome', p.nome, 'equipe', p.equipe, 'pontos', v_pontos,
        'posicao', v_pos, 'total', v_tot, 'sequencia', p.sequencia, 'equipe_posicao', v_eqpos,
        'respostas', coalesce(v_n, 0), 'valores', coalesce(v_vals, '[]'::jsonb),
        'correta', case when v_fase <> 'atividade' then v_cor end,
        'ganhou', case when v_fase <> 'atividade' then v_pts end,
        'identificado', p.turma_aluno_id is not null);
    end if;
  end if;
  return v_pub || jsonb_build_object('eu', v_eu, 'agora', now(), 'grupo_respostas', v_grupos);
end $$;

-- ---------- presença: quem esteve na aula vai para o módulo da plataforma ----------
create or replace function public.aovivo_gravar_presenca(p_sessao uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare s public.aovivo_sessoes; m public.modulos; v_ini timestamptz; v_dur numeric; v_nativ integer; v_n integer := 0;
begin
  select * into s from public.aovivo_sessoes where id = p_sessao;
  if not found or s.modulo_id is null then return 0; end if;
  select * into m from public.modulos where id = s.modulo_id;
  if not found then return 0; end if;
  v_ini := coalesce(s.comecou_em, s.criado_em);
  v_dur := greatest(coalesce(m.duracao_min::numeric, extract(epoch from (now() - v_ini)) / 60), 10);
  select count(distinct atividade_id) into v_nativ from public.aovivo_respostas where sessao_id = p_sessao;

  -- quem entrou digitando o nome: liga ao aluno da turma quando nome e sobrenome batem com um aluno só
  update public.aovivo_participantes pp set turma_aluno_id = x.aluno
    from (select p.id as pid, (array_agg(ta.id))[1] as aluno
            from public.aovivo_participantes p
            join public.turma_alunos ta on ta.turma_id = m.turma_id and ta.ativo
           where p.sessao_id = p_sessao and p.turma_aluno_id is null
             and position(' ' in public.aovivo_norm(p.nome)) > 0
             and (public.aovivo_norm(ta.nome) = public.aovivo_norm(p.nome)
                  or (split_part(public.aovivo_norm(ta.nome), ' ', 1) = split_part(public.aovivo_norm(p.nome), ' ', 1)
                      and regexp_replace(public.aovivo_norm(ta.nome), '^.* ', '') = regexp_replace(public.aovivo_norm(p.nome), '^.* ', '')))
           group by p.id having count(*) = 1) x
   where pp.id = x.pid;

  with base as (
    select p.turma_aluno_id as aluno,
           max(round(extract(epoch from (greatest(coalesce(p.visto_em, p.criado_em),
                 coalesce((select max(r.criado_em) from public.aovivo_respostas r where r.participante_id = p.id), p.criado_em))
                 - p.criado_em)) / 60))::int as minutos,
           sum((select count(distinct r.atividade_id) from public.aovivo_respostas r where r.participante_id = p.id))::int as feitas
      from public.aovivo_participantes p
      join public.turma_alunos ta on ta.id = p.turma_aluno_id and ta.turma_id = m.turma_id
     where p.sessao_id = p_sessao
     group by p.turma_aluno_id),
  ins as (
    insert into public.presencas (modulo_id, turma_aluno_id, presente, minutos, origem, registrado_por, registrado_em)
    select m.id, b.aluno, true, b.minutos, 'aovivo', null, now() from base b
     where b.minutos >= v_dur / 2 or (v_nativ > 0 and b.feitas * 2 >= v_nativ)
    on conflict (modulo_id, turma_aluno_id) do nothing
    returning 1)
  select count(*) into v_n from ins;

  update public.modulos set participantes_presentes =
    (select count(*) from public.presencas where modulo_id = m.id and presente)
   where id = m.id and participantes_presentes is null
     and exists (select 1 from public.presencas where modulo_id = m.id and presente);
  return v_n;
end $$;
revoke all on function public.aovivo_gravar_presenca(uuid) from public, anon, authenticated;

create or replace function public.aovivo_mudar_fase(p_sessao uuid, p_chave text, p_fase text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.aovivo_checa_chave(p_sessao, p_chave);
  if p_fase not in ('lobby', 'encerrada') then raise exception 'Fase inválida.'; end if;
  if p_fase = 'encerrada' then
    update public.aovivo_sessoes set fase = 'encerrada', extra = public.aovivo_ranking_dados(p_sessao) where id = p_sessao;
    begin
      perform public.aovivo_gravar_presenca(p_sessao);
    exception when others then null;   -- a presença nunca impede de encerrar a aula
    end;
  else
    update public.aovivo_sessoes set fase = 'lobby', atividade = null, extra = null where id = p_sessao;
  end if;
  return public.aovivo_painel(p_sessao, p_chave);
end $$;

-- ---------- a plataforma abre a aula do módulo (mentor do módulo ou administração) ----------
create or replace function public.aovivo_do_modulo(p_modulo uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m record; s public.aovivo_sessoes; v_chave text; r jsonb; v_tit text;
begin
  if auth.uid() is null then raise exception 'Entre na plataforma para abrir a aula ao vivo.'; end if;
  if not (public.eh_admin() or public.eh_mentor_do_modulo(p_modulo)) then
    raise exception 'Só o mentor deste módulo ou a coordenação abrem a aula ao vivo.' using errcode = '42501';
  end if;
  select mo.id, mo.numero, mo.titulo into m from public.modulos mo where mo.id = p_modulo;
  if not found then raise exception 'Módulo não encontrado.'; end if;
  select * into s from public.aovivo_sessoes where modulo_id = p_modulo;
  if not found then
    v_tit := left('Módulo ' || m.numero || coalesce(' · ' || nullif(btrim(m.titulo), ''), ''), 80);
    r := public.aovivo_criar_sessao(v_tit, false, '{}');
    update public.aovivo_sessoes set modulo_id = p_modulo where id = (r->>'id')::uuid returning * into s;
  end if;
  select c.chave into v_chave from public.aovivo_chaves c where c.sessao_id = s.id limit 1;
  return jsonb_build_object('id', s.id, 'chave', v_chave, 'codigo', s.codigo, 'titulo', s.titulo, 'fase', s.fase,
    'comecou_em', s.comecou_em,
    'roteiro', (select count(*) from public.aovivo_atividades a where a.sessao_id = s.id and not a.arquivada),
    'participantes', (select count(*) from public.aovivo_participantes p where p.sessao_id = s.id));
end $$;

-- lista de quem esteve na aula ao vivo do módulo, para a chamada da plataforma
create or replace function public.aovivo_presenca_modulo(p_modulo uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_lista jsonb; v_nativ integer; v_sessoes integer;
begin
  if auth.uid() is null or not (public.eh_admin() or public.eh_mentor_do_modulo(p_modulo)) then
    raise exception 'Sem acesso a este módulo.' using errcode = '42501';
  end if;
  select count(*) into v_sessoes from public.aovivo_sessoes where modulo_id = p_modulo;
  select count(distinct r.atividade_id) into v_nativ
    from public.aovivo_respostas r join public.aovivo_sessoes s on s.id = r.sessao_id where s.modulo_id = p_modulo;
  select coalesce(jsonb_agg(jsonb_build_object('nome', coalesce(ta.nome, p.nome), 'email', ta.email, 'aluno_id', ta.id,
           'minutos', round(extract(epoch from (greatest(coalesce(p.visto_em, p.criado_em),
                 coalesce((select max(r.criado_em) from public.aovivo_respostas r where r.participante_id = p.id), p.criado_em))
                 - p.criado_em)) / 60)::int,
           'atividades', (select count(distinct r.atividade_id) from public.aovivo_respostas r where r.participante_id = p.id))
           order by coalesce(ta.nome, p.nome)), '[]'::jsonb)
    into v_lista
    from public.aovivo_participantes p
    join public.aovivo_sessoes s on s.id = p.sessao_id
    left join public.turma_alunos ta on ta.id = p.turma_aluno_id
   where s.modulo_id = p_modulo;
  return jsonb_build_object('sessoes', v_sessoes, 'atividades', v_nativ, 'participantes', v_lista);
end $$;

-- aluno: aulas ao vivo abertas nas turmas dele
create or replace function public.aovivo_aulas_abertas() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('modulo_id', s.modulo_id, 'codigo', s.codigo, 'fase', s.fase)), '[]'::jsonb)
    from public.aovivo_sessoes s
    join public.modulos mo on mo.id = s.modulo_id
   where s.fase <> 'encerrada'
     and exists (select 1 from public.turma_alunos ta where ta.turma_id = mo.turma_id and ta.perfil_id = auth.uid() and ta.ativo);
$$;

-- aluno: convite para entrar na aula já identificado (sem digitar código nem nome)
create or replace function public.aovivo_convite_aluno(p_modulo uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_ta record; s public.aovivo_sessoes; v_tok uuid; v_nome text;
begin
  if auth.uid() is null then raise exception 'Entre na plataforma de novo.'; end if;
  select ta.id, ta.nome into v_ta from public.turma_alunos ta join public.modulos mo on mo.turma_id = ta.turma_id
   where mo.id = p_modulo and ta.perfil_id = auth.uid() and ta.ativo limit 1;
  if not found then raise exception 'Você não está na lista de alunos desta turma.'; end if;
  select * into s from public.aovivo_sessoes where modulo_id = p_modulo and fase <> 'encerrada';
  if not found then raise exception 'A aula ao vivo deste encontro ainda não foi aberta. Espere o mentor começar.'; end if;
  v_nome := regexp_replace(btrim(v_ta.nome), '\s+', ' ', 'g');
  if position(' ' in v_nome) > 0 then v_nome := split_part(v_nome, ' ', 1) || ' ' || regexp_replace(v_nome, '^.* ', ''); end if;
  insert into public.aovivo_convites (sessao_id, turma_aluno_id, nome) values (s.id, v_ta.id, left(v_nome, 24))
  on conflict (sessao_id, turma_aluno_id) do update set nome = excluded.nome
  returning token into v_tok;
  return jsonb_build_object('codigo', s.codigo, 'convite', v_tok);
end $$;

create or replace function public.aovivo_entrar_convite(p_codigo text, p_convite uuid, p_equipe text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.aovivo_sessoes; c public.aovivo_convites; p public.aovivo_participantes; v_base text; v_nome text; i integer := 1; v_eq text;
begin
  select * into s from public.aovivo_sessoes
   where codigo = regexp_replace(coalesce(p_codigo, ''), '\D', '', 'g') and fase <> 'encerrada'
   order by criado_em desc limit 1;
  if not found then raise exception 'Código não encontrado. Confira o número na tela da aula.'; end if;
  select * into c from public.aovivo_convites where token = p_convite and sessao_id = s.id;
  if not found then raise exception 'Este link de entrada não vale para esta aula. Entre de novo pela plataforma ou digite o código.'; end if;

  -- já entrou antes (outro aparelho ou recarregou): volta para o mesmo lugar, com os mesmos pontos
  select * into p from public.aovivo_participantes where sessao_id = s.id and turma_aluno_id = c.turma_aluno_id order by criado_em limit 1;
  if found then
    return jsonb_build_object('sessao_id', s.id, 'participante_id', p.id, 'token', p.token, 'nome', p.nome, 'equipe', p.equipe);
  end if;

  v_base := left(btrim(c.nome), 24);
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
        left join (select equipe, count(*) as n from public.aovivo_participantes where sessao_id = s.id group by equipe) x on x.equipe = e
       order by coalesce(x.n, 0), random() limit 1;
    end if;
  end if;
  insert into public.aovivo_participantes (sessao_id, nome, equipe, turma_aluno_id, visto_em)
  values (s.id, v_nome, v_eq, c.turma_aluno_id, now()) returning * into p;
  return jsonb_build_object('sessao_id', s.id, 'participante_id', p.id, 'token', p.token, 'nome', p.nome, 'equipe', p.equipe);
end $$;

-- ---------- sugestões da IA (o pedido vai para a função da plataforma, que grava aqui) ----------
create or replace function public.aovivo_pedir_sugestao(p_sessao uuid, p_chave text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform public.aovivo_checa_chave(p_sessao, p_chave);
  if (select count(*) from public.aovivo_sugestoes where sessao_id = p_sessao and criado_em > now() - interval '1 hour') >= 12 then
    raise exception 'Muitos pedidos à IA nesta aula na última hora. Espere um pouco.';
  end if;
  insert into public.aovivo_sugestoes (sessao_id) values (p_sessao) returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.aovivo_ver_sugestao(p_sessao uuid, p_chave text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g public.aovivo_sugestoes;
begin
  perform public.aovivo_checa_chave(p_sessao, p_chave);
  select * into g from public.aovivo_sugestoes where id = p_id and sessao_id = p_sessao;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if g.status = 'gerando' and g.criado_em < now() - interval '6 minutes' then
    return jsonb_build_object('status', 'erro', 'erro', 'A IA demorou demais. Tente de novo.');
  end if;
  return jsonb_build_object('status', g.status, 'resultado', g.resultado, 'erro', g.erro);
end $$;

-- ---------- permissões ----------
revoke all on function public.aovivo_norm(text) from public, anon, authenticated;
grant execute on function public.aovivo_ajustes(uuid, text, text) to anon, authenticated;
grant execute on function public.aovivo_bilhete_pdf(uuid, text) to anon, authenticated;
grant execute on function public.aovivo_sortear_grupos(uuid, text) to anon, authenticated;
grant execute on function public.aovivo_entrar_convite(text, uuid, text) to anon, authenticated;
grant execute on function public.aovivo_pedir_sugestao(uuid, text) to anon, authenticated;
grant execute on function public.aovivo_ver_sugestao(uuid, text, uuid) to anon, authenticated;
revoke all on function public.aovivo_do_modulo(uuid) from public, anon;
grant execute on function public.aovivo_do_modulo(uuid) to authenticated;
revoke all on function public.aovivo_presenca_modulo(uuid) from public, anon;
grant execute on function public.aovivo_presenca_modulo(uuid) to authenticated;
revoke all on function public.aovivo_aulas_abertas() from public, anon;
grant execute on function public.aovivo_aulas_abertas() to authenticated;
revoke all on function public.aovivo_convite_aluno(uuid) from public, anon;
grant execute on function public.aovivo_convite_aluno(uuid) to authenticated;
