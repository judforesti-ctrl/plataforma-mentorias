-- Mentorei Ao Vivo: ferramenta interativa para aulas online
-- Tudo isolado com o prefixo aovivo_. Não toca em nenhuma tabela existente.

create table if not exists public.aovivo_sessoes (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  titulo text not null default 'Aula Mentorei',
  modo_equipes boolean not null default false,
  equipes text[] not null default '{}',
  fase text not null default 'lobby'
    check (fase in ('lobby','atividade','resultado','ranking','sorteio','encerrada')),
  atividade jsonb,
  extra jsonb,
  versao integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists aovivo_sessoes_codigo_ativo
  on public.aovivo_sessoes (codigo) where fase <> 'encerrada';

create table if not exists public.aovivo_chaves (
  sessao_id uuid primary key references public.aovivo_sessoes(id) on delete cascade,
  chave text not null
);

create table if not exists public.aovivo_atividades (
  id uuid primary key default gen_random_uuid(),
  sessao_id uuid not null references public.aovivo_sessoes(id) on delete cascade,
  ordem integer not null default 0,
  tipo text not null check (tipo in ('nuvem','quiz','votacao','escala')),
  pergunta text not null,
  opcoes jsonb not null default '[]'::jsonb,
  correta integer,
  tempo integer not null default 0,
  config jsonb not null default '{}'::jsonb,
  encerrada_em timestamptz,
  bonus jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists aovivo_atividades_sessao on public.aovivo_atividades (sessao_id, ordem);

create table if not exists public.aovivo_participantes (
  id uuid primary key default gen_random_uuid(),
  sessao_id uuid not null references public.aovivo_sessoes(id) on delete cascade,
  nome text not null,
  equipe text,
  token uuid not null default gen_random_uuid(),
  pontos integer not null default 0,
  sequencia integer not null default 0,
  sorteado boolean not null default false,
  criado_em timestamptz not null default now()
);
create index if not exists aovivo_participantes_sessao on public.aovivo_participantes (sessao_id, pontos desc);

create table if not exists public.aovivo_respostas (
  id bigint generated always as identity primary key,
  sessao_id uuid not null references public.aovivo_sessoes(id) on delete cascade,
  atividade_id uuid not null references public.aovivo_atividades(id) on delete cascade,
  participante_id uuid not null references public.aovivo_participantes(id) on delete cascade,
  valor jsonb not null,
  correta boolean,
  pontos integer not null default 0,
  tempo_ms integer,
  criado_em timestamptz not null default now()
);
create index if not exists aovivo_respostas_atividade on public.aovivo_respostas (atividade_id, participante_id);
create index if not exists aovivo_respostas_sessao on public.aovivo_respostas (sessao_id);
create index if not exists aovivo_respostas_participante on public.aovivo_respostas (participante_id);

-- Segurança: ninguém lê ou grava direto nas tabelas. Tudo passa pelas funções abaixo.
alter table public.aovivo_sessoes enable row level security;
alter table public.aovivo_chaves enable row level security;
alter table public.aovivo_atividades enable row level security;
alter table public.aovivo_participantes enable row level security;
alter table public.aovivo_respostas enable row level security;

revoke all on public.aovivo_sessoes, public.aovivo_chaves, public.aovivo_atividades,
  public.aovivo_participantes, public.aovivo_respostas from anon, authenticated;
