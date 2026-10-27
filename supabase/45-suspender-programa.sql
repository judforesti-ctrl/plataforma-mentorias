-- 45 · Suspender o programa de mentoria de um mentorado (pedido da Juliana, 2026-10-27: um mentorado foi desligado da empresa).
-- Um clique da administração na ficha (com confirmação na tela) faz tudo de uma vez:
--   - cancela as sessões que ainda não aconteceram (a agenda e a Google Agenda liberam esses horários);
--   - tira os mentores do mentorado (eles ficam livres; a ficha sai da lista deles);
--   - marca o mentorado como "suspenso".
-- Nada é apagado: ficha, sessões feitas, anotações, tarefas e resultados continuam guardados para a administração.
-- Fica registrado quem suspendeu (o login de quem clicou), quando e por quê: no próprio mentorado e no histórico.
-- REATIVAR (pedido dela no mesmo dia): desfaz a suspensão. Volta a situação anterior do mentorado, devolve os mesmos mentores
-- e as sessões que a suspensão cancelou voltam como estavam (as que ficaram com data no passado precisam de data nova:
-- "Remarcar várias de uma vez"). Também fica registrado quem reativou, quando e por quê.
-- Pode rodar de novo sem problema.

alter table public.mentorados drop constraint if exists mentorados_status_check;
alter table public.mentorados add constraint mentorados_status_check
  check (status in ('ativo', 'pausado', 'concluido', 'desligado', 'suspenso'));

alter table public.mentorados
  add column if not exists suspenso_em timestamptz,
  add column if not exists suspenso_por uuid references public.perfis (id),
  add column if not exists suspensao_motivo text,
  add column if not exists suspensao jsonb;          -- o que foi liberado: mentores, sessões canceladas, situação anterior

create or replace function public.suspender_programa(p_mentorado uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m mentorados%rowtype;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
  v_mentores jsonb;
  v_sessoes jsonb;
  v_detalhes jsonb;
begin
  if not eh_admin() then raise exception 'Só a administração suspende um programa de mentoria.'; end if;
  if v_motivo is null then raise exception 'Escreva o motivo da suspensão.'; end if;
  select * into m from mentorados where id = p_mentorado for update;
  if not found then raise exception 'Mentorado não encontrado.'; end if;
  if m.status = 'suspenso' then raise exception 'O programa deste mentorado já está suspenso.'; end if;

  -- quem acompanhava (guardado, para saber depois quem eram os mentores)
  select coalesce(jsonb_agg(jsonb_build_object('mentor_id', mm.mentor_id, 'nome', p.nome, 'ordem', mm.ordem) order by mm.ordem), '[]'::jsonb)
    into v_mentores
    from mentor_mentorado mm left join perfis p on p.id = mm.mentor_id
   where mm.mentorado_id = p_mentorado;

  -- sessões que ainda não aconteceram: as feitas, as faltas e as que já passaram ficam como estão
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'numero', s.numero, 'data_hora', s.data_hora, 'mentor_id', s.mentor_id,
                                               'situacao', s.situacao, 'motivo_falta', s.motivo_falta) order by s.numero), '[]'::jsonb)
    into v_sessoes
    from sessoes s
   where s.mentorado_id = p_mentorado and s.concluida_em is null
     and s.situacao in ('agendada', 'remarcada')
     and (s.data_hora is null or s.data_hora >= now());

  update sessoes set situacao = 'cancelada', motivo_falta = 'Programa suspenso: ' || v_motivo
   where id in (select (x ->> 'id')::uuid from jsonb_array_elements(v_sessoes) x);

  delete from mentor_mentorado where mentorado_id = p_mentorado;

  v_detalhes := jsonb_build_object('status_antes', m.status, 'motivo', v_motivo, 'em', now(),
    'por', auth.uid(), 'por_nome', (select nome from perfis where id = auth.uid()),
    'mentores', v_mentores, 'sessoes_canceladas', v_sessoes);

  update mentorados set status = 'suspenso', suspenso_em = now(), suspenso_por = auth.uid(),
         suspensao_motivo = v_motivo, suspensao = v_detalhes
   where id = p_mentorado;

  insert into historico (perfil_id, acao, tabela, registro_id, antes, depois)
  values (auth.uid(), 'suspender_programa', 'mentorados', p_mentorado::text, to_jsonb(m), v_detalhes);

  return jsonb_build_object('sessoes', jsonb_array_length(v_sessoes), 'mentores', jsonb_array_length(v_mentores));
end $$;

revoke all on function public.suspender_programa(uuid, text) from public, anon;
grant execute on function public.suspender_programa(uuid, text) to authenticated;

create or replace function public.reativar_programa(p_mentorado uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m mentorados%rowtype;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
  v_susp jsonb;
  v_sessoes int;
  v_passado int;
  v_mentores int;
  v_detalhes jsonb;
begin
  if not eh_admin() then raise exception 'Só a administração reativa um programa de mentoria.'; end if;
  select * into m from mentorados where id = p_mentorado for update;
  if not found then raise exception 'Mentorado não encontrado.'; end if;
  if m.status <> 'suspenso' then raise exception 'O programa deste mentorado não está suspenso.'; end if;
  v_susp := coalesce(m.suspensao, '{}'::jsonb);

  -- as sessões que a suspensão cancelou (e que continuam canceladas) voltam como estavam
  with antes as (
    select (x ->> 'id')::uuid as id, x ->> 'situacao' as situacao, x ->> 'motivo_falta' as motivo_falta
      from jsonb_array_elements(coalesce(v_susp -> 'sessoes_canceladas', '[]'::jsonb)) x),
  voltou as (
    update sessoes s set situacao = coalesce(a.situacao, 'agendada'), motivo_falta = a.motivo_falta
      from antes a
     where s.id = a.id and s.situacao = 'cancelada' and s.concluida_em is null
    returning s.data_hora)
  select count(*), count(*) filter (where data_hora < now()) into v_sessoes, v_passado from voltou;

  -- os mesmos mentores voltam a acompanhar (quem ainda tem cadastro)
  with volta as (
    insert into mentor_mentorado (mentorado_id, mentor_id, ordem)
    select p_mentorado, (x ->> 'mentor_id')::uuid, coalesce((x ->> 'ordem')::int, 1)
      from jsonb_array_elements(coalesce(v_susp -> 'mentores', '[]'::jsonb)) x
     where exists (select 1 from perfis where id = (x ->> 'mentor_id')::uuid)
    on conflict (mentorado_id, mentor_id) do nothing
    returning 1)
  select count(*) into v_mentores from volta;

  v_detalhes := v_susp || jsonb_build_object('reativado_em', now(), 'reativado_por', auth.uid(),
    'reativado_por_nome', (select nome from perfis where id = auth.uid()), 'reativacao_motivo', v_motivo,
    'suspenso_em', m.suspenso_em, 'sessoes_voltaram', v_sessoes, 'mentores_voltaram', v_mentores);

  update mentorados set status = coalesce(nullif(v_susp ->> 'status_antes', 'suspenso'), 'ativo'),
         suspenso_em = null, suspenso_por = null, suspensao_motivo = null, suspensao = v_detalhes
   where id = p_mentorado;

  insert into historico (perfil_id, acao, tabela, registro_id, antes, depois)
  values (auth.uid(), 'reativar_programa', 'mentorados', p_mentorado::text, to_jsonb(m), v_detalhes);

  return jsonb_build_object('sessoes', v_sessoes, 'no_passado', v_passado, 'mentores', v_mentores);
end $$;

revoke all on function public.reativar_programa(uuid, text) from public, anon;
grant execute on function public.reativar_programa(uuid, text) to authenticated;
