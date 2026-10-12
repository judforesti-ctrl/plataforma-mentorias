-- Várias tarefas por sessão: o mentor clica em "+ Adicionar tarefa" quantas vezes quiser e põe o prazo de cada uma.
-- O mentorado vê as tarefas na área dele depois que a sessão é concluída e marca cada uma como feita.
-- A tarefa única antiga de cada sessão (colunas sessoes.tarefa...) é copiada para cá na primeira vez.
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema.
begin;

create table if not exists public.tarefas (
  id uuid primary key default gen_random_uuid(),
  sessao_id uuid not null references public.sessoes (id) on delete cascade,
  mentorado_id uuid not null references public.mentorados (id) on delete cascade,
  texto text not null,
  prazo date,
  ordem integer not null default 0,
  feita_em timestamptz,                 -- o mentorado marca como feita
  comentario text,                      -- o mentorado pode comentar
  criado_por uuid references public.perfis (id) default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists tarefas_sessao on public.tarefas (sessao_id, ordem);
create index if not exists tarefas_mentorado on public.tarefas (mentorado_id);

-- Regras: o mentorado da tarefa é sempre o da sessão; sessão concluída só a administração muda;
-- o mentorado só marca como feita e comenta. (Sem login = SQL Editor: liberado.)
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
    if v_concluida is not null then raise exception 'Sessão concluída: só a administração pode mudar as tarefas.'; end if;
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'feita_em' - 'comentario' - 'atualizado_em') = (to_jsonb(old) - 'feita_em' - 'comentario' - 'atualizado_em') then
    return new;
  end if;
  raise exception 'O mentorado só pode marcar a própria tarefa como feita.';
end $$;
drop trigger if exists protege_tarefa on public.tarefas;
create trigger protege_tarefa before insert or update or delete on public.tarefas for each row execute function public.protege_tarefa();

-- Histórico: só o que muda depois da sessão concluída (o salvamento automático de quem escreve não entra).
create or replace function public.historico_tarefa() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from sessoes where id = coalesce(new.sessao_id, old.sessao_id) and concluida_em is not null) then
    perform gravar_historico(lower(tg_op), tg_table_name,
            case when tg_op <> 'INSERT' then to_jsonb(old) end, case when tg_op <> 'DELETE' then to_jsonb(new) end);
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists hist_tarefas on public.tarefas;
create trigger hist_tarefas after update or delete on public.tarefas for each row execute function public.historico_tarefa();

-- Quem vê e quem muda
alter table public.tarefas enable row level security;
drop policy if exists tarefa_admin on public.tarefas;
drop policy if exists tarefa_mentor on public.tarefas;
drop policy if exists tarefa_mentorado_ler on public.tarefas;
drop policy if exists tarefa_mentorado_marcar on public.tarefas;
create policy tarefa_admin on public.tarefas for all to authenticated using (eh_admin()) with check (eh_admin());
create policy tarefa_mentor on public.tarefas for all to authenticated
  using (eh_mentor_de(mentorado_id)) with check (eh_mentor_de(mentorado_id));
create policy tarefa_mentorado_ler on public.tarefas for select to authenticated using (
  mentorado_id = meu_mentorado() and exists (select 1 from sessoes s where s.id = sessao_id and s.concluida_em is not null));
create policy tarefa_mentorado_marcar on public.tarefas for update to authenticated using (
  mentorado_id = meu_mentorado() and exists (select 1 from sessoes s where s.id = sessao_id and s.concluida_em is not null))
  with check (mentorado_id = meu_mentorado());

-- Copia a tarefa única antiga de cada sessão (só na primeira vez, com a tabela ainda vazia).
insert into public.tarefas (sessao_id, mentorado_id, texto, prazo, feita_em, comentario, criado_por, criado_em)
select s.id, s.mentorado_id, trim(s.tarefa), s.tarefa_prazo, s.tarefa_feita_em, s.tarefa_comentario, s.mentor_id, coalesce(s.concluida_em, s.atualizado_em)
from public.sessoes s
where nullif(trim(s.tarefa), '') is not null
  and not exists (select 1 from public.tarefas);

commit;
notify pgrst, 'reload schema';

-- Conferência: quantas tarefas existem agora
select count(*) as tarefas from public.tarefas;
