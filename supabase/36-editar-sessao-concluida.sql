-- Pedido dos mentores (2026-10-14): às vezes não dá tempo de escrever tudo no fim da sessão e eles voltam no fim do dia.
-- Agora o mentor do mentorado continua podendo completar e corrigir a sessão por 7 dias depois de concluir
-- (anotações, informações delicadas, notas, resumo do mentorado e tarefas). Depois disso, só a administração altera.
-- Toda mudança feita depois de concluída continua indo para o histórico. Só a administração mexe na data de conclusão.
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema.

create or replace function public.trava_sessao_concluida() returns trigger
language plpgsql security definer set search_path = public as $$
declare concluida timestamptz; v_mentorado uuid;
begin
  if tg_table_name = 'sessoes' then
    concluida := old.concluida_em; v_mentorado := old.mentorado_id;
  else
    select concluida_em, mentorado_id into concluida, v_mentorado from sessoes where id = old.sessao_id;
  end if;
  if concluida is not null and not eh_admin() then
    -- o mentor do mentorado completa e corrige por 7 dias depois de concluir (sem mexer na conclusão)
    if eh_mentor_de(v_mentorado) and concluida > now() - interval '7 days' then
      if tg_table_name = 'sessoes' and (new.concluida_em is distinct from old.concluida_em
         or new.concluida_por is distinct from old.concluida_por or new.mentorado_id is distinct from old.mentorado_id) then
        raise exception 'Só a administração muda a conclusão da sessão.';
      end if;
      return new;
    end if;
    -- o mentorado ainda pode marcar a própria tarefa como feita
    if tg_table_name = 'sessoes' and auth.uid() = (select perfil_id from mentorados where id = old.mentorado_id)
       and (to_jsonb(new) - 'tarefa_feita_em' - 'tarefa_comentario' - 'atualizado_em')
         = (to_jsonb(old) - 'tarefa_feita_em' - 'tarefa_comentario' - 'atualizado_em') then
      return new;
    end if;
    raise exception 'Sessão concluída há mais de 7 dias: só a administração pode alterar.';
  end if;
  return new;
end $$;

-- Tarefas (script 33): mesma regra dos 7 dias para o mentor.
create or replace function public.protege_tarefa() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_mentorado uuid; v_concluida timestamptz;
begin
  select mentorado_id, concluida_em into v_mentorado, v_concluida from sessoes where id = coalesce(new.sessao_id, old.sessao_id);
  if tg_op <> 'DELETE' then
    new.mentorado_id := v_mentorado;
    new.atualizado_em := now();
  end if;
  if auth.uid() is null or eh_admin() then return coalesce(new, old); end if;
  if eh_mentor_de(v_mentorado) then
    if v_concluida is not null and v_concluida <= now() - interval '7 days' then
      raise exception 'Sessão concluída há mais de 7 dias: só a administração pode mudar as tarefas.';
    end if;
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'feita_em' - 'comentario' - 'atualizado_em') = (to_jsonb(old) - 'feita_em' - 'comentario' - 'atualizado_em') then
    return new;
  end if;
  raise exception 'O mentorado só pode marcar a própria tarefa como feita.';
end $$;

-- Conferência: deve aparecer "ok"
select 'ok' as editar_sessao_concluida;
