-- Plataforma de Mentorias Mentorei · estrutura do banco (fase 1 e 2)
-- Rodar uma vez no projeto NOVO do Supabase: SQL Editor → colar tudo → Run.
-- Quem pode ver e mudar o quê é garantido aqui, no banco (Row Level Security),
-- e não só nas telas.

-- ============================================================
-- 1. Pessoas
-- ============================================================
-- Uma linha por pessoa com login. O id é o mesmo do login do Supabase (auth.users).
create table public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  papel text not null check (papel in ('admin', 'mentor', 'mentorado')),
  tambem_mentor boolean not null default false,       -- administradora que também atende (ex.: Juliana)
  nome text not null,
  email text not null unique,
  foto_url text,
  whatsapp text,
  rede_social text,
  cargo text,
  -- só para mentores: a trajetória que vira o resumo de apresentação
  trajetoria jsonb not null default '{}'::jsonb,
  resumo_apresentacao text,                           -- texto escrito pelo sistema
  resumo_aprovado_em timestamptz,                     -- quando o mentor aprovou o texto
  assinatura text,
  sala_meet text,
  -- primeiro acesso
  termo_versao text,
  termo_aceito_em timestamptz,
  autorizacoes jsonb not null default '{}'::jsonb,    -- {whatsapp:true, email:true, testes:true}
  dados_completos boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Convites criados pelo administrador. Quando a pessoa entra pela primeira vez,
-- o perfil dela nasce com o papel e o vínculo do convite.
create table public.convites (
  email text primary key,
  papel text not null check (papel in ('admin', 'mentor', 'mentorado')),
  tambem_mentor boolean not null default false,
  nome text not null,
  mentorado_id uuid,                                  -- preenchido quando o convite é de mentorado
  criado_por uuid references public.perfis (id),
  criado_em timestamptz not null default now(),
  usado_em timestamptz
);

-- ============================================================
-- 2. Empresas, programas e mentorados
-- ============================================================
create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  contato_rh text,
  observacoes text,
  criado_em timestamptz not null default now()
);

create table public.programas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  nome text not null,
  sessoes_por_mentorado integer not null check (sessoes_por_mentorado > 0),  -- sem teto: o administrador escolhe
  frequencia text not null default 'semanal',
  duracao_min integer not null default 50,
  inicio date,
  fim_previsto date,
  divisao_mentores text not null default 'dupla_alternando',
  status text not null default 'planejado' check (status in ('planejado', 'em_andamento', 'concluido', 'pausado')),
  criado_em timestamptz not null default now(),
  unique (empresa_id, nome)
);

-- Plano de temas por número de sessão (opcional). Copiado para cada mentorado ao criar as sessões.
create table public.programa_temas (
  programa_id uuid not null references public.programas (id) on delete cascade,
  numero integer not null check (numero > 0),
  tema text not null,
  roteiro text,
  ferramentas text[] not null default '{}',           -- ids do arsenal (ex.: MNT-COM-01)
  primary key (programa_id, numero)
);

create table public.mentorados (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid unique references public.perfis (id),   -- vazio até a pessoa fazer o primeiro acesso
  programa_id uuid not null references public.programas (id),
  nome text not null,
  email text,
  cargo text,
  tempo_de_casa text,
  pessoas_no_time integer,
  gestor_direto text,
  sala_meet text,
  objetivo_principal text,
  pontos_desenvolver jsonb not null default '[]'::jsonb,     -- [{"ponto":"Delegação"}, ...]
  forcas_visao_mentorado text,
  fraquezas_visao_mentorado text,
  forcas_visao_gestor text,
  fraquezas_visao_gestor text,
  swot jsonb not null default '{}'::jsonb,                   -- {forcas, fraquezas, oportunidades, ameacas}
  status text not null default 'ativo' check (status in ('ativo', 'pausado', 'concluido', 'desligado')),
  criado_em timestamptz not null default now()
);

alter table public.convites
  add constraint convites_mentorado_fk foreign key (mentorado_id) references public.mentorados (id);

create table public.mentor_mentorado (
  mentorado_id uuid not null references public.mentorados (id) on delete cascade,
  mentor_id uuid not null references public.perfis (id),
  ordem integer not null default 1,                   -- 1 = primeiro mentor da dupla
  primary key (mentorado_id, mentor_id)
);

-- ============================================================
-- 3. Sessões
-- ============================================================
-- Parte da sessão que o mentorado também vê (depois de liberada).
create table public.sessoes (
  id uuid primary key default gen_random_uuid(),
  mentorado_id uuid not null references public.mentorados (id) on delete cascade,
  numero integer not null check (numero > 0),
  extra boolean not null default false,               -- sessão acrescentada além do programa
  mentor_id uuid references public.perfis (id),
  data_hora timestamptz,
  tema text,
  roteiro text,
  situacao text not null default 'agendada'
    check (situacao in ('agendada', 'realizada', 'falta_avisada', 'falta_sem_aviso', 'remarcada', 'cancelada')),
  motivo_falta text,
  duracao_min integer,
  resumo_mentorado text,                              -- versão para o mentorado (escrita pelo sistema, revisada pelo mentor)
  tarefa text,
  tarefa_prazo date,
  tarefa_feita_em timestamptz,                        -- o mentorado marca como feita
  tarefa_comentario text,
  ferramentas_enviadas text[] not null default '{}',
  whatsapp_enviado_em timestamptz,
  concluida_em timestamptz,                           -- depois disso, só o administrador altera
  concluida_por uuid references public.perfis (id),
  atualizado_em timestamptz not null default now(),
  unique (mentorado_id, numero)
);

-- Parte interna: nunca aparece para o mentorado.
create table public.sessoes_interno (
  sessao_id uuid primary key references public.sessoes (id) on delete cascade,
  resumo_mentor text,                                 -- anotações do mentor (digitadas ou por voz)
  informacoes_delicadas text,                         -- visível só aos mentores do mentorado e à administração
  notas_evolucao jsonb not null default '{}'::jsonb,  -- {"Delegação": 3, ...}
  atualizado_em timestamptz not null default now()
);

-- Nota que o mentorado dá para a sessão.
create table public.avaliacoes_sessao (
  sessao_id uuid primary key references public.sessoes (id) on delete cascade,
  nota integer not null check (nota between 1 and 5),
  comentario text,
  criado_em timestamptz not null default now()
);

-- Resultados de testes (Radar e outros).
create table public.testes (
  id uuid primary key default gen_random_uuid(),
  mentorado_id uuid not null references public.mentorados (id) on delete cascade,
  nome text not null,
  resultado jsonb not null default '{}'::jsonb,
  arquivo_url text,
  feito_em date,
  criado_em timestamptz not null default now()
);

-- ============================================================
-- 4. Acessos e histórico
-- ============================================================
create table public.acessos (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfis (id),
  entrou_em timestamptz not null default now(),
  ultimo_sinal_em timestamptz not null default now(),  -- atualizado enquanto a pessoa usa a plataforma
  aparelho text
);

create table public.historico (
  id bigint generated always as identity primary key,
  quando timestamptz not null default now(),
  perfil_id uuid,
  acao text not null,                                 -- insert, update, delete
  tabela text not null,
  registro_id text,
  antes jsonb,
  depois jsonb
);

create index on public.mentor_mentorado (mentor_id);
create index on public.mentorados (programa_id);
create index on public.sessoes (mentorado_id);
create index on public.sessoes (mentor_id, data_hora);
create index on public.acessos (perfil_id, entrou_em desc);
create index on public.historico (tabela, registro_id);

-- ============================================================
-- 5. Funções de apoio às regras de acesso
-- ============================================================
create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = auth.uid() and papel = 'admin' and ativo);
$$;

create or replace function public.eh_mentor_de(p_mentorado uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from mentor_mentorado where mentorado_id = p_mentorado and mentor_id = auth.uid());
$$;

create or replace function public.meu_mentorado() returns uuid
language sql stable security definer set search_path = public as $$
  select id from mentorados where perfil_id = auth.uid();
$$;

-- Quando a pessoa entra pela primeira vez, cria o perfil a partir do convite.
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
  update convites set usado_em = now() where email = c.email;
  return new;
end $$;

create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil_do_convite();

-- Histórico de alterações nas tabelas importantes.
create or replace function public.gravar_historico(p_acao text, p_tabela text, p_antes jsonb, p_depois jsonb)
returns void language sql security definer set search_path = public as $$
  insert into historico (perfil_id, acao, tabela, registro_id, antes, depois)
  values (auth.uid(), p_acao, p_tabela,
          coalesce(coalesce(p_depois, p_antes) ->> 'id', coalesce(p_depois, p_antes) ->> 'sessao_id'),
          p_antes, p_depois);
$$;

create or replace function public.registrar_historico() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform gravar_historico(lower(tg_op), tg_table_name,
          case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

-- Na sessão, só registra a conclusão, as alterações depois de concluída (feitas pelo administrador)
-- e as exclusões, para não encher o histórico com o salvamento automático de quem está escrevendo.
create or replace function public.registrar_historico_sessao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform gravar_historico('delete', tg_table_name, to_jsonb(old), null);
    return old;
  end if;
  if old.concluida_em is not null or new.concluida_em is not null then
    perform gravar_historico('update', tg_table_name, to_jsonb(old), to_jsonb(new));
  end if;
  return new;
end $$;

-- Na ficha do mentorado: o próprio mentorado só muda os dados pessoais e profissionais;
-- o mentor muda a ficha, mas não o programa, o vínculo de login nem a situação.
create or replace function public.protege_mentorado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if eh_admin() then return new; end if;
  if new.programa_id <> old.programa_id or new.perfil_id is distinct from old.perfil_id or new.status <> old.status then
    raise exception 'Só o administrador muda o programa, o login ou a situação do mentorado.';
  end if;
  if not eh_mentor_de(old.id) then
    if (to_jsonb(new) - 'email' - 'cargo' - 'tempo_de_casa' - 'pessoas_no_time' - 'gestor_direto')
       <> (to_jsonb(old) - 'email' - 'cargo' - 'tempo_de_casa' - 'pessoas_no_time' - 'gestor_direto') then
      raise exception 'O mentorado só atualiza os próprios dados de cadastro.';
    end if;
  end if;
  return new;
end $$;
create trigger protege_mentorado before update on public.mentorados for each row execute function public.protege_mentorado();

create trigger hist_perfis after insert or update or delete on public.perfis for each row execute function public.registrar_historico();
create trigger hist_mentorados after insert or update or delete on public.mentorados for each row execute function public.registrar_historico();
create trigger hist_programas after insert or update or delete on public.programas for each row execute function public.registrar_historico();
create trigger hist_mentor_mentorado after insert or update or delete on public.mentor_mentorado for each row execute function public.registrar_historico();
create trigger hist_sessoes after update or delete on public.sessoes for each row execute function public.registrar_historico_sessao();

create or replace function public.marcar_atualizacao() returns trigger
language plpgsql as $$ begin new.atualizado_em := now(); return new; end $$;
create trigger sessoes_atualizado before update on public.sessoes for each row execute function public.marcar_atualizacao();
create trigger interno_atualizado before update on public.sessoes_interno for each row execute function public.marcar_atualizacao();

-- Uma sessão concluída fica trancada: só o administrador altera, inclusive a parte interna.
create or replace function public.trava_sessao_concluida() returns trigger
language plpgsql security definer set search_path = public as $$
declare concluida timestamptz;
begin
  if tg_table_name = 'sessoes' then
    concluida := old.concluida_em;
  else
    select concluida_em into concluida from sessoes where id = old.sessao_id;
  end if;
  if concluida is not null and not eh_admin() then
    -- o mentorado ainda pode marcar a própria tarefa como feita
    if tg_table_name = 'sessoes' and auth.uid() = (select perfil_id from mentorados where id = old.mentorado_id)
       and (to_jsonb(new) - 'tarefa_feita_em' - 'tarefa_comentario' - 'atualizado_em')
         = (to_jsonb(old) - 'tarefa_feita_em' - 'tarefa_comentario' - 'atualizado_em') then
      return new;
    end if;
    raise exception 'Sessão concluída: só o administrador pode alterar.';
  end if;
  return new;
end $$;
create trigger trava_sessoes before update on public.sessoes for each row execute function public.trava_sessao_concluida();
create trigger trava_interno before update on public.sessoes_interno for each row execute function public.trava_sessao_concluida();

-- O mentorado só pode mudar, na própria sessão, a tarefa feita e o comentário.
create or replace function public.limita_mentorado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not eh_admin() and not eh_mentor_de(old.mentorado_id) then
    if (to_jsonb(new) - 'tarefa_feita_em' - 'tarefa_comentario' - 'atualizado_em')
       <> (to_jsonb(old) - 'tarefa_feita_em' - 'tarefa_comentario' - 'atualizado_em') then
      raise exception 'O mentorado só pode atualizar a própria tarefa.';
    end if;
  end if;
  return new;
end $$;
create trigger limita_mentorado_sessoes before update on public.sessoes for each row execute function public.limita_mentorado();

-- Cada pessoa não pode mudar o próprio papel nem se ativar.
create or replace function public.protege_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not eh_admin() and (new.papel <> old.papel or new.tambem_mentor <> old.tambem_mentor
                          or new.ativo <> old.ativo or new.email <> old.email) then
    raise exception 'Só o administrador muda papel, e-mail ou situação de um perfil.';
  end if;
  return new;
end $$;
create trigger protege_perfil before update on public.perfis for each row execute function public.protege_perfil();

-- ============================================================
-- 6. Regras de acesso (Row Level Security)
-- ============================================================
alter table public.perfis enable row level security;
alter table public.convites enable row level security;
alter table public.empresas enable row level security;
alter table public.programas enable row level security;
alter table public.programa_temas enable row level security;
alter table public.mentorados enable row level security;
alter table public.mentor_mentorado enable row level security;
alter table public.sessoes enable row level security;
alter table public.sessoes_interno enable row level security;
alter table public.avaliacoes_sessao enable row level security;
alter table public.testes enable row level security;
alter table public.acessos enable row level security;
alter table public.historico enable row level security;

-- Administrador: tudo, em todas as tabelas.
do $$
declare t text;
begin
  foreach t in array array['perfis','convites','empresas','programas','programa_temas','mentorados',
                           'mentor_mentorado','sessoes','sessoes_interno','avaliacoes_sessao','testes','acessos','historico']
  loop
    execute format('create policy admin_tudo on public.%I for all to authenticated using (eh_admin()) with check (eh_admin())', t);
  end loop;
end $$;

-- Perfis: cada um lê e atualiza o próprio. Mentor lê o perfil dos seus mentorados;
-- mentorado lê o perfil dos seus mentores; mentores da mesma dupla se veem.
create policy perfil_proprio_ler on public.perfis for select to authenticated using (id = auth.uid());
create policy perfil_proprio_mudar on public.perfis for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy perfil_ver_relacionados on public.perfis for select to authenticated using (
  exists (select 1 from mentor_mentorado mm join mentorados m on m.id = mm.mentorado_id
          where (mm.mentor_id = auth.uid() and m.perfil_id = perfis.id)          -- mentor vê o mentorado
             or (m.perfil_id = auth.uid() and mm.mentor_id = perfis.id))          -- mentorado vê o mentor
  or exists (select 1 from mentor_mentorado a join mentor_mentorado b on a.mentorado_id = b.mentorado_id
             where a.mentor_id = auth.uid() and b.mentor_id = perfis.id)          -- colega de dupla
);

-- Empresas e programas: mentor e mentorado leem os dos seus vínculos.
create policy empresa_ler on public.empresas for select to authenticated using (
  exists (select 1 from programas p join mentorados m on m.programa_id = p.id
          where p.empresa_id = empresas.id and (eh_mentor_de(m.id) or m.perfil_id = auth.uid())));
create policy programa_ler on public.programas for select to authenticated using (
  exists (select 1 from mentorados m where m.programa_id = programas.id and (eh_mentor_de(m.id) or m.perfil_id = auth.uid())));
create policy temas_ler on public.programa_temas for select to authenticated using (
  exists (select 1 from mentorados m where m.programa_id = programa_temas.programa_id and eh_mentor_de(m.id)));

-- Mentorados: o mentor lê e atualiza os seus; o mentorado lê e atualiza a própria ficha.
create policy mentorado_mentor_ler on public.mentorados for select to authenticated using (eh_mentor_de(id));
create policy mentorado_mentor_mudar on public.mentorados for update to authenticated using (eh_mentor_de(id)) with check (eh_mentor_de(id));
create policy mentorado_proprio_ler on public.mentorados for select to authenticated using (perfil_id = auth.uid());
create policy mentorado_proprio_mudar on public.mentorados for update to authenticated using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());
create policy vinculo_ler on public.mentor_mentorado for select to authenticated using (
  mentor_id = auth.uid() or eh_mentor_de(mentorado_id) or mentorado_id = meu_mentorado());

-- Sessões: o mentor lê e escreve as dos seus mentorados (a trava acima protege as concluídas).
create policy sessao_mentor_ler on public.sessoes for select to authenticated using (eh_mentor_de(mentorado_id));
create policy sessao_mentor_mudar on public.sessoes for update to authenticated using (eh_mentor_de(mentorado_id)) with check (eh_mentor_de(mentorado_id));
-- O mentorado lê as próprias sessões e atualiza só a tarefa (trigger limita_mentorado).
create policy sessao_mentorado_ler on public.sessoes for select to authenticated using (mentorado_id = meu_mentorado());
create policy sessao_mentorado_tarefa on public.sessoes for update to authenticated using (mentorado_id = meu_mentorado()) with check (mentorado_id = meu_mentorado());

-- Parte interna e campo delicado: só mentores do mentorado (e administração). O mentorado nunca lê.
create policy interno_mentor on public.sessoes_interno for all to authenticated using (
  exists (select 1 from sessoes s where s.id = sessao_id and eh_mentor_de(s.mentorado_id)))
  with check (exists (select 1 from sessoes s where s.id = sessao_id and eh_mentor_de(s.mentorado_id)));

-- Avaliação: o mentorado dá nota às próprias sessões; o mentor lê as notas das suas.
create policy avaliacao_mentorado on public.avaliacoes_sessao for all to authenticated using (
  exists (select 1 from sessoes s where s.id = sessao_id and s.mentorado_id = meu_mentorado()))
  with check (exists (select 1 from sessoes s where s.id = sessao_id and s.mentorado_id = meu_mentorado()));
create policy avaliacao_mentor_ler on public.avaliacoes_sessao for select to authenticated using (
  exists (select 1 from sessoes s where s.id = sessao_id and eh_mentor_de(s.mentorado_id)));

-- Testes: mentor lê os dos seus; mentorado lê os próprios.
create policy testes_ler on public.testes for select to authenticated using (eh_mentor_de(mentorado_id) or mentorado_id = meu_mentorado());

-- Acessos: cada um registra e atualiza o próprio; só a administração lê os de todos.
create policy acesso_proprio_criar on public.acessos for insert to authenticated with check (perfil_id = auth.uid());
create policy acesso_proprio_atualizar on public.acessos for update to authenticated using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());
create policy acesso_proprio_ler on public.acessos for select to authenticated using (perfil_id = auth.uid());

-- Visitante sem login não vê nada.
revoke all on all tables in schema public from anon;

-- ============================================================
-- 7. Criar as sessões de um mentorado a partir do programa
-- ============================================================
create or replace function public.criar_sessoes_do_programa(p_mentorado uuid, p_primeira timestamptz)
returns integer language plpgsql security definer set search_path = public as $$
declare
  m mentorados%rowtype; p programas%rowtype; mentores uuid[]; i integer; passo interval;
begin
  if not eh_admin() then raise exception 'Só o administrador cria sessões do programa.'; end if;
  select * into m from mentorados where id = p_mentorado;
  select * into p from programas where id = m.programa_id;
  select array_agg(mentor_id order by ordem) into mentores from mentor_mentorado where mentorado_id = p_mentorado;
  passo := case p.frequencia when 'quinzenal' then interval '14 days' when 'mensal' then interval '1 month' else interval '7 days' end;
  for i in 1 .. p.sessoes_por_mentorado loop
    insert into sessoes (mentorado_id, numero, mentor_id, data_hora, tema, roteiro)
    select p_mentorado, i,
           case when mentores is null then null
                when p.divisao_mentores = 'dupla_alternando' then mentores[1 + ((i - 1) % array_length(mentores, 1))]
                else mentores[1] end,
           case when p_primeira is null then null else p_primeira + passo * (i - 1) end,
           t.tema, t.roteiro
    from (select 1) x left join programa_temas t on t.programa_id = p.id and t.numero = i
    on conflict (mentorado_id, numero) do nothing;
    insert into sessoes_interno (sessao_id)
      select id from sessoes where mentorado_id = p_mentorado and numero = i on conflict do nothing;
  end loop;
  return p.sessoes_por_mentorado;
end $$;

-- Sessão extra para um mentorado (repor falta, estender o processo).
create or replace function public.criar_sessao_extra(p_mentorado uuid, p_data timestamptz, p_mentor uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare novo uuid; n integer;
begin
  if not eh_admin() then raise exception 'Só o administrador cria sessões extras.'; end if;
  select coalesce(max(numero), 0) + 1 into n from sessoes where mentorado_id = p_mentorado;
  insert into sessoes (mentorado_id, numero, extra, mentor_id, data_hora)
  values (p_mentorado, n, true, p_mentor, p_data) returning id into novo;
  insert into sessoes_interno (sessao_id) values (novo);
  return novo;
end $$;
