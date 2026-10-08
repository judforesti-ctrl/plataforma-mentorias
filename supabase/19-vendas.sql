-- Fase 4: pipeline de vendas. Empresas ganham dados comerciais e contatos (quantos quiser); cada proposta vira uma
-- oportunidade com etapa, valor, responsável, próximo contato (que entra na agenda) e histórico de interações.
-- Só a administração usa (as sócias entram como administração em Mentores → Editar dados).
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema.
begin;

-- 1. Dados comerciais da empresa
alter table public.empresas add column if not exists tipo text check (tipo in ('cooperativa', 'empresa', 'outro'));
alter table public.empresas add column if not exists cidade text;
alter table public.empresas add column if not exists uf text;
alter table public.empresas add column if not exists porte text;                 -- ex.: "até 50 pessoas", "200 a 500"
alter table public.empresas add column if not exists origem text;                -- como chegou: indicação, LinkedIn, evento, Radar, cliente antigo
alter table public.empresas add column if not exists site text;
alter table public.empresas add column if not exists atualizado_em timestamptz not null default now();

-- 2. Contatos da empresa (decisor, RH, financeiro...). "marketing" = aceita receber e-mails de relacionamento (Fase 5).
create table if not exists public.contatos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nome text not null,
  cargo text,
  email text,
  whatsapp text,
  decisor boolean not null default false,
  marketing boolean not null default false,
  marketing_em timestamptz,
  marketing_por uuid references public.perfis (id),
  observacoes text,
  ativo boolean not null default true,
  criado_por uuid references public.perfis (id) default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists contatos_empresa on public.contatos (empresa_id);

-- 3. Oportunidades (o pipeline)
create table if not exists public.oportunidades (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  titulo text not null,                                                            -- ex.: "Trilha de líderes · gerentes"
  servico text not null default 'treinamento' check (servico in ('palestra', 'treinamento', 'workshop', 'mentoria_grupo', 'mentoria_individual', 'diagnostico', 'outro')),
  valor numeric(12, 2),                                                            -- valor total proposto
  etapa text not null default 'contato' check (etapa in ('contato', 'reuniao', 'proposta', 'negociacao', 'fechado', 'perdido')),
  chance integer check (chance between 0 and 100),                                 -- vazio = a chance padrão da etapa
  fechamento_previsto date,
  origem text,
  motivo_perda text check (motivo_perda in ('preco', 'momento', 'concorrente', 'sem_resposta', 'outro')),
  motivo_perda_texto text,
  contato_id uuid references public.contatos (id) on delete set null,              -- contato principal
  responsavel_id uuid references public.perfis (id) on delete set null,
  proximo_contato_em timestamptz,
  proximo_contato_por uuid references public.perfis (id) on delete set null,
  proximo_contato_obs text,
  ultima_interacao_em timestamptz not null default now(),                          -- define "quente" e "esfriando"
  importacao_id uuid references public.importacoes_proposta (id) on delete set null,
  turma_id uuid references public.turmas (id) on delete set null,
  programa_id uuid references public.programas (id) on delete set null,
  fechado_em timestamptz,
  perdido_em timestamptz,
  observacoes text,
  criado_por uuid references public.perfis (id) default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists oportunidades_empresa on public.oportunidades (empresa_id);
create index if not exists oportunidades_etapa on public.oportunidades (etapa);
create index if not exists oportunidades_proximo on public.oportunidades (proximo_contato_em);

-- 4. Propostas enviadas (versões) de cada oportunidade
create table if not exists public.propostas (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid not null references public.oportunidades (id) on delete cascade,
  versao integer not null default 1,
  valor numeric(12, 2),
  validade date,
  arquivo text,
  importacao_id uuid references public.importacoes_proposta (id) on delete set null,
  resumo text,
  enviada_em date,
  criado_por uuid references public.perfis (id) default auth.uid(),
  criado_em timestamptz not null default now()
);
create index if not exists propostas_oportunidade on public.propostas (oportunidade_id);

-- 5. Histórico de interações (e-mail, WhatsApp, reunião, ligação, nota...)
create table if not exists public.interacoes (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid not null references public.oportunidades (id) on delete cascade,
  contato_id uuid references public.contatos (id) on delete set null,
  tipo text not null check (tipo in ('email', 'whatsapp', 'reuniao', 'ligacao', 'nota', 'proposta', 'etapa', 'sistema')),
  texto text,
  quando timestamptz not null default now(),
  por uuid references public.perfis (id) default auth.uid(),
  criado_em timestamptz not null default now()
);
create index if not exists interacoes_oportunidade on public.interacoes (oportunidade_id, quando);

-- contato com o cliente (e-mail, WhatsApp, reunião, ligação, proposta) atualiza a "última interação" da oportunidade
create or replace function public.marcar_interacao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tipo in ('email', 'whatsapp', 'reuniao', 'ligacao', 'proposta') then
    update oportunidades set ultima_interacao_em = greatest(ultima_interacao_em, new.quando) where id = new.oportunidade_id;
  end if;
  return new;
end $$;
drop trigger if exists interacao_marca on public.interacoes;
create trigger interacao_marca after insert on public.interacoes for each row execute function public.marcar_interacao();

-- 6. Modelos de mensagem (e-mail e WhatsApp), com {contato}, {empresa}, {responsavel}, {servico} e {valor}
create table if not exists public.modelos_mensagem (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  canal text not null check (canal in ('email', 'whatsapp')),
  etapa text,
  assunto text,
  texto text not null,
  ordem integer not null default 0,
  criado_em timestamptz not null default now()
);
insert into public.modelos_mensagem (nome, canal, etapa, assunto, texto, ordem)
select * from (values
  ('Primeiro contato', 'email', 'contato', 'Mentorei · desenvolvimento de líderes na {empresa}',
   E'Olá, {contato}!\n\nSou {responsavel}, da Mentorei. Trabalhamos com desenvolvimento de líderes em cooperativas e empresas, com treinamentos, workshops e mentorias.\n\nGostaria de entender os desafios da {empresa} e ver se faz sentido conversarmos. Teria 30 minutos esta semana?\n\nUm abraço,\n{responsavel}', 1),
  ('Proposta enviada', 'email', 'proposta', 'Proposta Mentorei · {empresa}',
   E'Olá, {contato}!\n\nSegue a nossa proposta de {servico} para a {empresa}, conforme conversamos. O investimento total é de {valor}.\n\nFico à disposição para ajustar o que for preciso e para agendarmos uma conversa sobre os próximos passos.\n\nUm abraço,\n{responsavel}', 2),
  ('Retomar conversa', 'email', 'negociacao', 'Nossa conversa sobre {servico} · {empresa}',
   E'Olá, {contato}!\n\nPassando para retomar a nossa conversa sobre o {servico} para a {empresa}. Ficou alguma dúvida que eu possa esclarecer?\n\nSe preferir, marcamos uma conversa rápida: é só me dizer o melhor dia.\n\nUm abraço,\n{responsavel}', 3),
  ('Primeiro contato', 'whatsapp', 'contato', null,
   E'Olá, {contato}! Aqui é {responsavel}, da Mentorei. Trabalhamos com desenvolvimento de líderes em cooperativas e empresas. Posso te contar em 30 minutos como ajudamos equipes como a da {empresa}? Qual o melhor dia para você?', 4),
  ('Proposta enviada', 'whatsapp', 'proposta', null,
   E'Olá, {contato}! Mandei por e-mail a proposta de {servico} para a {empresa}. Qualquer dúvida é só me chamar por aqui. Um abraço, {responsavel}', 5),
  ('Retomar conversa', 'whatsapp', 'negociacao', null,
   E'Olá, {contato}! Tudo bem? Passando para saber se conseguiu olhar a proposta da Mentorei para a {empresa}. Posso ajudar com alguma dúvida? Um abraço, {responsavel}', 6)
) as v(nome, canal, etapa, assunto, texto, ordem)
where not exists (select 1 from public.modelos_mensagem);

-- 7. Meta de vendas por mês (valor fechado)
create table if not exists public.metas_vendas (
  mes date primary key,                                                            -- sempre o dia 1 do mês
  valor numeric(12, 2) not null,
  atualizado_em timestamptz not null default now()
);

-- 8. Histórico de alterações e carimbo de atualização
drop trigger if exists hist_contatos on public.contatos;
create trigger hist_contatos after insert or update or delete on public.contatos for each row execute function public.registrar_historico();
drop trigger if exists hist_oportunidades on public.oportunidades;
create trigger hist_oportunidades after insert or update or delete on public.oportunidades for each row execute function public.registrar_historico();
drop trigger if exists contatos_atualizado on public.contatos;
create trigger contatos_atualizado before update on public.contatos for each row execute function public.marcar_atualizacao();
drop trigger if exists oportunidades_atualizado on public.oportunidades;
create trigger oportunidades_atualizado before update on public.oportunidades for each row execute function public.marcar_atualizacao();
drop trigger if exists empresas_atualizado on public.empresas;
create trigger empresas_atualizado before update on public.empresas for each row execute function public.marcar_atualizacao();

-- 9. Regras de acesso: só a administração
do $$
declare t text;
begin
  foreach t in array array['contatos', 'oportunidades', 'propostas', 'interacoes', 'modelos_mensagem', 'metas_vendas']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists admin_tudo on public.%I', t);
    execute format('create policy admin_tudo on public.%I for all to authenticated using (eh_admin()) with check (eh_admin())', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;
