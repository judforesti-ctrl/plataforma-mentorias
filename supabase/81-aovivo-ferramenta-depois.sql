-- 81 · Ao Vivo: a ferramenta abre dentro da aula e pode ficar "para depois" (pedido da Juliana, 16/11/2026)
-- O aluno pode tocar em "Fazer depois": a resposta 'depois' (sem pontos) guarda a ferramenta para mais tarde.
-- Ela aparece no alto da tela do celular até ele terminar e o link vai no e-mail dos materiais.
-- Pode rodar de novo: cada troca só acontece se o texto antigo ainda estiver lá.

do $$
declare d text; n text;
begin
  -- 1) aceitar 'depois'
  select pg_get_functiondef('public.aovivo_responder(uuid, uuid, uuid, jsonb)'::regprocedure) into d;
  if position('''abriu'', ''terminou'', ''depois''' in d) = 0 then
    n := replace(d, 'if v_txt not in (''abriu'', ''terminou'') then', 'if v_txt not in (''abriu'', ''terminou'', ''depois'') then');
    if n = d then raise exception 'aovivo_responder: trecho da ferramenta não encontrado'; end if;
    execute n;
  end if;

  -- 2) a lista de ferramentas em aberto também traz as guardadas para depois
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'aovivo_estado';
  if position('''url'', a.config->>''url'', ''depois''' in d) = 0 then
    n := replace(d, 'jsonb_build_object(''id'', a.id, ''pergunta'', a.pergunta, ''url'', a.config->>''url'')',
      'jsonb_build_object(''id'', a.id, ''pergunta'', a.pergunta, ''url'', a.config->>''url'', ''depois'', exists (select 1 from public.aovivo_respostas r where r.atividade_id = a.id and r.participante_id = p.id and (r.valor #>> ''{}'') = ''depois''))');
    n := replace(n, 'and r.participante_id = p.id and (r.valor #>> ''{}'') = ''abriu'')',
      'and r.participante_id = p.id and (r.valor #>> ''{}'') in (''abriu'', ''depois''))');
    if n = d or position('in (''abriu'', ''depois'')' in n) = 0 then raise exception 'aovivo_estado: trecho das pendentes não encontrado'; end if;
    execute n;
  end if;

  -- 3) no resultado: "abriram" só quem abriu de verdade, e quantos deixaram para depois
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'aovivo_resultado';
  if position('''abriram'', v_abriu, ''depois''' in d) = 0 then
    n := replace(d, '           count(distinct participante_id)
      into v_total, v_abriu from public.aovivo_respostas where atividade_id = a.id;
    return jsonb_build_object(''tipo'', a.tipo, ''total'', v_total, ''abriram'', v_abriu);',
      '           count(distinct participante_id) filter (where (valor #>> ''{}'') in (''abriu'', ''terminou''))
      into v_total, v_abriu from public.aovivo_respostas where atividade_id = a.id;
    select count(distinct r.participante_id) into v_min from public.aovivo_respostas r
     where r.atividade_id = a.id and (r.valor #>> ''{}'') = ''depois''
       and not exists (select 1 from public.aovivo_respostas t where t.atividade_id = a.id and t.participante_id = r.participante_id and (t.valor #>> ''{}'') = ''terminou'');
    return jsonb_build_object(''tipo'', a.tipo, ''total'', v_total, ''abriram'', v_abriu, ''depois'', v_min);');
    if n = d then raise exception 'aovivo_resultado: trecho da ferramenta não encontrado'; end if;
    execute n;
  end if;
end $$;
