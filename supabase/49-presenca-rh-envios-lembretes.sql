-- Pedidos da Juliana em 28/10/2026, a partir do escopo que a Cláudia mandou:
-- 1. Presença de cada aluno em cada encontro (lista de chamada), puxada do Zoom, de um arquivo ou marcada à mão.
-- 2. Envios dos alunos: o mesmo que o mentorado já tem (tarefa feita, documento), com resposta do mentor (vale para os dois).
-- 3. Acesso do RH da empresa cliente: login próprio e um painel só com números (presença, conclusão, avaliações), nunca conteúdo.
-- 4. Lembretes aos mentores antes e depois do módulo (3 e 2 dias antes, 1 dia depois): controle do que já foi enviado.
-- Precisa dos scripts 37 e 44. Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema.

-- ---------- 1. Novo tipo de acesso: RH da empresa cliente ----------
alter table public.perfis drop constraint if exists perfis_papel_check;
alter table public.perfis add constraint perfis_papel_check check (papel in ('admin', 'mentor', 'mentorado', 'aluno', 'rh'));
alter table public.convites drop constraint if exists convites_papel_check;
alter table public.convites add constraint convites_papel_check check (papel in ('admin', 'mentor', 'mentorado', 'aluno', 'rh'));

-- quem do RH acompanha cada empresa (ligado ao login pelo e-mail, como os alunos)
create table if not exists public.empresa_rh (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nome text not null,
  email text,
  cargo text,
  whatsapp text,
  perfil_id uuid references public.perfis (id) on delete set null,
  ativo boolean not null default true,
  convidado_em timestamptz,
  criado_por uuid references public.perfis (id) default auth.uid(),
  criado_em timestamptz not null default now()
);
create unique index if not exists empresa_rh_email on public.empresa_rh (empresa_id, lower(email)) where email is not null;
create index if not exists empresa_rh_perfil on public.empresa_rh (perfil_id);

create or replace function public.ligar_rh_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.email := nullif(lower(trim(coalesce(new.email, ''))), '');
  if new.email is not null and (tg_op = 'INSERT' or new.email is distinct from old.email or new.perfil_id is null) then
    select id into new.perfil_id from perfis where lower(email) = new.email limit 1;
  end if;
  return new;
end $$;
drop trigger if exists ligar_rh_perfil on public.empresa_rh;
create trigger ligar_rh_perfil before insert or update on public.empresa_rh for each row execute function public.ligar_rh_perfil();

alter table public.empresa_rh enable row level security;
drop policy if exists admin_tudo on public.empresa_rh;
create policy admin_tudo on public.empresa_rh for all to authenticated using (eh_admin()) with check (eh_admin());
drop policy if exists rh_ler on public.empresa_rh;
create policy rh_ler on public.empresa_rh for select to authenticated using (perfil_id = auth.uid());

-- quando a pessoa cria o login: perfil do convite (como antes) + turmas do aluno + empresas do RH
create or replace function public.criar_perfil_do_convite() returns trigger
language plpgsql security definer set search_path = public as $$
declare c convites%rowtype;
begin
  select * into c from convites where lower(email) = lower(new.email);
  if not found then
    return new;  -- sem convite, sem perfil: a pessoa não vê nada
  end if;
  insert into perfis (id, papel, tambem_mentor, nome, email)
  values (new.id, c.papel, c.tambem_mentor, c.nome, lower(new.email))
  on conflict (id) do nothing;
  if c.mentorado_id is not null then
    update mentorados set perfil_id = new.id where id = c.mentorado_id;
  end if;
  update turma_alunos set perfil_id = new.id where lower(email) = lower(new.email) and perfil_id is null;
  update empresa_rh set perfil_id = new.id where lower(email) = lower(new.email) and perfil_id is null;
  update convites set usado_em = now() where email = c.email;
  return new;
end $$;

-- ---------- 2. Presença dos alunos em cada encontro ----------
create table if not exists public.presencas (
  modulo_id uuid not null references public.modulos (id) on delete cascade,
  turma_aluno_id uuid not null references public.turma_alunos (id) on delete cascade,
  presente boolean not null,
  minutos integer check (minutos >= 0),                     -- tempo na sala (quando veio do Zoom ou do arquivo)
  origem text not null default 'manual' check (origem in ('manual', 'zoom', 'arquivo')),
  registrado_por uuid references public.perfis (id) default auth.uid(),
  registrado_em timestamptz not null default now(),
  primary key (modulo_id, turma_aluno_id)
);
create index if not exists presencas_aluno on public.presencas (turma_aluno_id);

alter table public.presencas enable row level security;
drop policy if exists admin_tudo on public.presencas;
create policy admin_tudo on public.presencas for all to authenticated using (eh_admin()) with check (eh_admin());
drop policy if exists mentor_ler on public.presencas;
create policy mentor_ler on public.presencas for select to authenticated
  using (exists (select 1 from modulos m where m.id = modulo_id and eh_mentor_da_turma(m.turma_id)));
drop policy if exists mentor_marcar on public.presencas;
create policy mentor_marcar on public.presencas for insert to authenticated with check (eh_mentor_do_modulo(modulo_id));
drop policy if exists mentor_mudar on public.presencas;
create policy mentor_mudar on public.presencas for update to authenticated using (eh_mentor_do_modulo(modulo_id)) with check (eh_mentor_do_modulo(modulo_id));
drop policy if exists mentor_tirar on public.presencas;
create policy mentor_tirar on public.presencas for delete to authenticated using (eh_mentor_do_modulo(modulo_id));
drop policy if exists aluno_ler on public.presencas;
create policy aluno_ler on public.presencas for select to authenticated
  using (exists (select 1 from turma_alunos a where a.id = turma_aluno_id and a.perfil_id = auth.uid()));

-- ---------- 3. Envios dos alunos (a mesma tabela dos envios do mentorado) + resposta do mentor ----------
alter table public.entregas alter column mentorado_id drop not null;
alter table public.entregas add column if not exists turma_aluno_id uuid references public.turma_alunos (id) on delete cascade;
alter table public.entregas add column if not exists modulo_id uuid references public.modulos (id) on delete set null;
alter table public.entregas add column if not exists arquivo_id uuid references public.modulo_arquivos (id) on delete set null;  -- a tarefa do módulo
alter table public.entregas add column if not exists retorno text;                 -- resposta do mentor
alter table public.entregas add column if not exists retorno_em timestamptz;
alter table public.entregas add column if not exists retorno_por uuid references public.perfis (id);
alter table public.entregas drop constraint if exists entregas_de_quem;
alter table public.entregas add constraint entregas_de_quem check (mentorado_id is not null or turma_aluno_id is not null);
create index if not exists entregas_aluno on public.entregas (turma_aluno_id, enviado_em desc);
create index if not exists entregas_modulo on public.entregas (modulo_id);

create or replace function public.eh_meu_aluno(p_aluno uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from turma_alunos where id = p_aluno and perfil_id = auth.uid() and ativo);
$$;
create or replace function public.eh_mentor_do_aluno(p_aluno uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from turma_alunos a where a.id = p_aluno and eh_mentor_da_turma(a.turma_id));
$$;

-- depois de enviado, o mentor só marca como visto e responde
create or replace function public.protege_entrega() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or eh_admin() then return new; end if;
  if (to_jsonb(new) - 'visto_em' - 'visto_por' - 'retorno' - 'retorno_em' - 'retorno_por')
     <> (to_jsonb(old) - 'visto_em' - 'visto_por' - 'retorno' - 'retorno_em' - 'retorno_por') then
    raise exception 'Depois de enviado, só dá para marcar como visto e responder.';
  end if;
  if (new.retorno is distinct from old.retorno or new.visto_em is distinct from old.visto_em)
     and not (coalesce(eh_mentor_de(new.mentorado_id), false) or (new.turma_aluno_id is not null and eh_mentor_do_aluno(new.turma_aluno_id))) then
    raise exception 'Só os mentores respondem e marcam como visto.';
  end if;
  return new;
end $$;

drop policy if exists entrega_aluno_ler on public.entregas;
drop policy if exists entrega_aluno_enviar on public.entregas;
drop policy if exists entrega_aluno_apagar on public.entregas;
drop policy if exists entrega_mentor_aluno_ler on public.entregas;
drop policy if exists entrega_mentor_aluno_mudar on public.entregas;
create policy entrega_aluno_ler on public.entregas for select to authenticated using (turma_aluno_id is not null and eh_meu_aluno(turma_aluno_id));
create policy entrega_aluno_enviar on public.entregas for insert to authenticated
  with check (turma_aluno_id is not null and mentorado_id is null and eh_meu_aluno(turma_aluno_id) and enviado_por = auth.uid());
create policy entrega_aluno_apagar on public.entregas for delete to authenticated using (turma_aluno_id is not null and eh_meu_aluno(turma_aluno_id));
create policy entrega_mentor_aluno_ler on public.entregas for select to authenticated using (turma_aluno_id is not null and eh_mentor_do_aluno(turma_aluno_id));
create policy entrega_mentor_aluno_mudar on public.entregas for update to authenticated
  using (turma_aluno_id is not null and eh_mentor_do_aluno(turma_aluno_id)) with check (turma_aluno_id is not null and eh_mentor_do_aluno(turma_aluno_id));

-- arquivos dos alunos na mesma pasta privada "entregas", em "<id do aluno na turma>/<id do envio>/<arquivo>"
create or replace function public.pode_ver_entregas(p_pasta text) returns boolean
language sql stable security definer set search_path = public as $$
  select eh_admin()
      or exists (select 1 from mentor_mentorado where mentorado_id::text = p_pasta and mentor_id = auth.uid())
      or exists (select 1 from mentorados where id::text = p_pasta and perfil_id = auth.uid())
      or exists (select 1 from turma_alunos a where a.id::text = p_pasta and (a.perfil_id = auth.uid() or eh_mentor_da_turma(a.turma_id)));
$$;
create or replace function public.eh_minha_pasta_aluno(p_pasta text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from turma_alunos where id::text = p_pasta and perfil_id = auth.uid() and ativo);
$$;
drop policy if exists entregas_aluno_enviar on storage.objects;
create policy entregas_aluno_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'entregas' and public.eh_minha_pasta_aluno((storage.foldername(name))[1]));

-- ---------- 4. Lembretes aos mentores: o que já foi enviado (nunca repete) ----------
create table if not exists public.avisos_mentor (
  modulo_id uuid not null references public.modulos (id) on delete cascade,
  mentor_id uuid not null references public.perfis (id) on delete cascade,
  tipo text not null check (tipo in ('slides', 'preparo', 'depois')),
  enviado_em timestamptz not null default now(),
  primary key (modulo_id, mentor_id, tipo)
);
alter table public.avisos_mentor enable row level security;
drop policy if exists admin_ler on public.avisos_mentor;
create policy admin_ler on public.avisos_mentor for select to authenticated using (eh_admin());
insert into public.configuracoes (chave, valor) values ('lembretes_mentor', '{"ligado": true}') on conflict (chave) do nothing;

-- ---------- 5. Área do aluno: passa a receber o próprio registro na turma e a presença em cada encontro ----------
create or replace function public.minhas_trilhas() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'nome', t.nome, 'empresa', e.nome, 'marca', e.marca, 'inicio', t.inicio, 'fim', t.fim_previsto, 'status', t.status,
    'aluno_id', (select a.id from turma_alunos a where a.turma_id = t.id and a.perfil_id = auth.uid() and a.ativo order by a.criado_em limit 1),
    'modulos', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id, 'numero', m.numero, 'titulo', m.titulo, 'data_hora', m.data_hora, 'duracao_min', m.duracao_min, 'formato', m.formato,
        'link', case when m.formato = 'presencial' then null else m.link end,
        'local', case when m.formato = 'presencial' then m.local end,
        'presente', (select bool_or(p.presente) from presencas p join turma_alunos a on a.id = p.turma_aluno_id
                     where p.modulo_id = m.id and a.turma_id = t.id and a.perfil_id = auth.uid()),
        'mentores', (select coalesce(jsonb_agg(jsonb_build_object('nome', p.nome, 'foto_url', p.foto_url) order by p.nome), '[]'::jsonb)
                     from modulo_mentores mm join perfis p on p.id = mm.mentor_id where mm.modulo_id = m.id),
        'arquivos', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'tipo', a.tipo, 'nome', a.nome, 'caminho', a.caminho,
                       'tamanho', a.tamanho, 'enviado_em', a.enviado_em) order by a.enviado_em), '[]'::jsonb)
                     from modulo_arquivos a where a.modulo_id = m.id and a.tipo in ('aluno', 'tarefa')),
        'gravacoes', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'nome', g.nome, 'link', g.link, 'gravada_em', g.gravada_em,
                       'duracao_min', g.duracao_min, 'senha', g.senha) order by g.gravada_em nulls last, g.criado_em), '[]'::jsonb)
                     from gravacoes g where g.modulo_id = m.id and not g.ignorada)
      ) order by m.numero), '[]'::jsonb) from modulos m where m.turma_id = t.id)
  ) order by t.inicio desc nulls last), '[]'::jsonb)
  from turmas t join empresas e on e.id = t.empresa_id
  where exists (select 1 from turma_alunos a where a.turma_id = t.id and a.perfil_id = auth.uid() and a.ativo);
$$;
revoke all on function public.minhas_trilhas() from anon;

-- ---------- 6. Painel do RH: só números da empresa dele (nada de percepções, anotações, comentários ou envios) ----------
-- p_empresa vazio = a primeira empresa do RH. A administração abre qualquer empresa (prévia "Ver como o RH vê").
-- Notas das avaliações só aparecem com 3 respostas ou mais (a avaliação é anônima).
create or replace function public.painel_rh(p_empresa uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_emp uuid; v_lista jsonb;
begin
  if eh_admin() then
    v_emp := p_empresa;
    v_lista := (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', nome) order by nome), '[]'::jsonb) from empresas where id = p_empresa);
  else
    select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome) order by e.nome), '[]'::jsonb) into v_lista
      from empresas e where exists (select 1 from empresa_rh r where r.empresa_id = e.id and r.perfil_id = auth.uid() and r.ativo);
    select e.id into v_emp from empresas e
     where exists (select 1 from empresa_rh r where r.empresa_id = e.id and r.perfil_id = auth.uid() and r.ativo)
       and (p_empresa is null or e.id = p_empresa)
     order by e.nome limit 1;
  end if;
  if v_emp is null then return jsonb_build_object('empresas', coalesce(v_lista, '[]'::jsonb)); end if;

  return jsonb_build_object(
    'empresas', v_lista,
    'empresa', (select jsonb_build_object('id', id, 'nome', nome, 'marca', marca) from empresas where id = v_emp),
    'trilhas', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'nome', t.nome, 'status', t.status, 'inicio', t.inicio, 'fim', t.fim_previsto, 'formato', t.formato,
        'previstos', t.participantes_previstos,
        'certificados', (select count(*) from cert_certificados c join cert_pastas cp on cp.id = c.pasta_id where cp.turma_id = t.id and c.status = 'valido'),
        'modulos', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', m.id, 'numero', m.numero, 'titulo', m.titulo, 'data_hora', m.data_hora, 'duracao_min', m.duracao_min,
            'chamada', exists (select 1 from presencas p where p.modulo_id = m.id),
            'presentes', (select count(*) from presencas p join turma_alunos a on a.id = p.turma_aluno_id where p.modulo_id = m.id and p.presente and a.ativo),
            'presentes_informados', m.participantes_presentes,
            'avaliacoes', (select count(*) from avaliacoes v where v.modulo_id = m.id),
            'nota', (select case when count(*) >= 3 then round(avg(v.geral)::numeric, 1) end from avaliacoes v where v.modulo_id = m.id and v.geral is not null)
          ) order by m.numero), '[]'::jsonb) from modulos m where m.turma_id = t.id),
        'alunos', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', a.id, 'nome', a.nome, 'cargo', a.cargo, 'ativo', a.ativo,
            'entrou', exists (select 1 from perfis pf where pf.id = a.perfil_id and pf.termo_aceito_em is not null),
            'presencas', (select count(*) from presencas p where p.turma_aluno_id = a.id and p.presente),
            'faltas', (select count(*) from presencas p where p.turma_aluno_id = a.id and not p.presente)
          ) order by a.nome), '[]'::jsonb) from turma_alunos a where a.turma_id = t.id),
        'avaliacao', (select case when count(*) >= 3 then jsonb_build_object(
            'n', count(*),
            'geral', round(avg(v.geral)::numeric, 1),
            'aula', round(avg(v.aula)::numeric, 1), 'conteudo', round(avg(v.conteudo)::numeric, 1), 'ferramentas', round(avg(v.ferramentas)::numeric, 1),
            'nps_n', count(v.nps), 'promotores', count(*) filter (where v.nps >= 9), 'detratores', count(*) filter (where v.nps <= 6),
            'aprendeu_bastante', count(*) filter (where v.aprendeu in ('bastante', 'muito')), 'aprendeu_n', count(v.aprendeu))
          else jsonb_build_object('n', count(*)) end
          from avaliacoes v join modulos m on m.id = v.modulo_id where m.turma_id = t.id)
      ) order by t.inicio desc nulls last), '[]'::jsonb) from turmas t where t.empresa_id = v_emp),
    'programas', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', pr.id, 'nome', pr.nome, 'status', pr.status, 'inicio', pr.inicio, 'fim', pr.fim_previsto, 'sessoes_por_mentorado', pr.sessoes_por_mentorado,
        'mentorados', (select coalesce(jsonb_agg(jsonb_build_object(
            'nome', mt.nome, 'status', mt.status,
            'feitas', (select count(*) from sessoes s where s.mentorado_id = mt.id and s.situacao = 'realizada'),
            'faltas', (select count(*) from sessoes s where s.mentorado_id = mt.id and s.situacao in ('falta_avisada', 'falta_sem_aviso')),
            'tarefas', (select count(*) from tarefas tf join sessoes s on s.id = tf.sessao_id where tf.mentorado_id = mt.id and s.concluida_em is not null),
            'tarefas_feitas', (select count(*) from tarefas tf join sessoes s on s.id = tf.sessao_id where tf.mentorado_id = mt.id and s.concluida_em is not null and tf.feita_em is not null)
          ) order by mt.nome), '[]'::jsonb) from mentorados mt where mt.programa_id = pr.id)
      ) order by pr.inicio desc nulls last), '[]'::jsonb) from programas pr where pr.empresa_id = v_emp)
  );
end $$;
revoke all on function public.painel_rh(uuid) from anon;

-- ---------- 7. Números das trilhas para o Painel da administração (somados no banco; p_empresa vazio = todas) ----------
create or replace function public.numeros_trilhas(p_empresa uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not eh_admin() then raise exception 'Só a administração vê estes números.'; end if;
  return (
    with t as (select * from turmas where p_empresa is null or empresa_id = p_empresa),
    m as (select m.* from modulos m join t on t.id = m.turma_id),
    a as (select a.* from turma_alunos a join t on t.id = a.turma_id where a.ativo),
    p as (select p.* from presencas p join a on a.id = p.turma_aluno_id),
    fa as (select a.id, a.turma_id, count(p.turma_aluno_id) filter (where p.presente) as pres, count(p.turma_aluno_id) as tot
           from a left join presencas p on p.turma_aluno_id = a.id group by a.id, a.turma_id),
    v as (select v.* from avaliacoes v where p_empresa is null or v.empresa_id = p_empresa or v.turma_id in (select id from t)),
    e as (select e.* from entregas e join a on a.id = e.turma_aluno_id)
    select jsonb_build_object(
      'turmas', (select count(*) from t),
      'turmas_andamento', (select count(*) from t where status = 'em_andamento'),
      'turmas_concluidas', (select count(*) from t where status = 'concluida'),
      'modulos', (select count(*) from m),
      'modulos_realizados', (select count(*) from m where m.data_hora + make_interval(mins => coalesce(m.duracao_min, 180)) <= now()),
      'modulos_chamada', (select count(distinct modulo_id) from p),
      'alunos', (select count(*) from a),
      'alunos_entraram', (select count(*) from a join perfis pf on pf.id = a.perfil_id where pf.termo_aceito_em is not null),
      'presencas', (select count(*) from p where presente),
      'faltas', (select count(*) from p where not presente),
      'freq_media', (select round(avg(100.0 * pres / tot)) from fa where tot > 0),
      'concluintes_base', (select count(*) from fa join t on t.id = fa.turma_id where t.status = 'concluida' and fa.tot > 0),
      'concluintes', (select count(*) from fa join t on t.id = fa.turma_id where t.status = 'concluida' and fa.tot > 0 and 100.0 * fa.pres / fa.tot >= 75),
      'avaliacoes', (select count(*) from v),
      'nota', (select round(avg(geral)::numeric, 1) from v where geral is not null),
      'nps_n', (select count(nps) from v),
      'promotores', (select count(*) from v where nps >= 9),
      'detratores', (select count(*) from v where nps <= 6),
      'aprendeu_n', (select count(aprendeu) from v),
      'aprendeu_bastante', (select count(*) from v where aprendeu in ('bastante', 'muito')),
      'certificados', (select count(*) from cert_certificados c join cert_pastas cp on cp.id = c.pasta_id
                       where c.status = 'valido' and (p_empresa is null or cp.empresa_id = p_empresa)),
      'envios', (select count(*) from e),
      'envios_respondidos', (select count(*) from e where retorno is not null),
      'envios_sem_abrir', (select count(*) from e where visto_em is null),
      'gravacoes', (select count(*) from gravacoes g join m on m.id = g.modulo_id where not g.ignorada)
    ));
end $$;
revoke all on function public.numeros_trilhas(uuid) from anon;

notify pgrst, 'reload schema';

-- Conferência: deve aparecer "ok"
select 'ok' as presenca_rh_envios_lembretes;
