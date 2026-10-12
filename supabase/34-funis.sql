-- Funis de e-mail (Vendas → Funis de e-mail), para substituir o RD Station. Pedido da Juliana, 12/10/2026.
-- Cada funil tem uma sequência de e-mails com o intervalo entre eles; as pessoas marcadas entram e recebem sozinhas.
-- O servidor (funis-agendada, de hora em hora) envia, lê no Brevo quem abriu, clicou, devolveu ou reclamou, e aplica as regras.
-- E-mail errado ou devolvido vai para "Contatos para atualizar" (ninguém se perde). Quem pede para sair nunca mais recebe.
-- Rodar uma vez: SQL Editor → New query → colar tudo → Run. Pode rodar de novo sem problema.

-- 1. Funis
create table if not exists public.funis (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  publico text not null default 'clientes' check (publico in ('clientes', 'frio')),   -- frio = sai pela conta de marketing do Brevo
  ativo boolean not null default true,                                                   -- false = envios pausados
  arquivado boolean not null default false,
  remetente_nome text,
  remetente_email text,
  responder_para text,
  dias_semana integer[] not null default '{1,2,3,4,5}',                                  -- 0 = domingo ... 6 = sábado
  hora_inicio integer not null default 9 check (hora_inicio between 0 and 23),
  hora_fim integer not null default 17 check (hora_fim between 1 and 24),
  regra_passagem jsonb not null default '{}'::jsonb,   -- { ligada, gatilho: clique|leitura|abertura, quantidade, destino, criar_oportunidade, responsavel }
  regra_limpeza jsonb not null default '{}'::jsonb,    -- { ligada, sem_sinal: 3 }
  criado_por uuid references public.perfis (id) default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- 2. E-mails da sequência (dias_depois = dias depois do e-mail anterior; no primeiro, depois de entrar no funil)
create table if not exists public.funil_emails (
  id uuid primary key default gen_random_uuid(),
  funil_id uuid not null references public.funis (id) on delete cascade,
  ordem integer not null default 1,
  dias_depois integer not null default 0 check (dias_depois >= 0),
  assunto text not null default '',
  preheader text,
  formato text not null default 'texto' check (formato in ('texto', 'html')),
  titulo text,
  corpo text,
  html text,
  imagem_url text,
  botao_texto text,
  botao_link text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists funil_emails_funil on public.funil_emails (funil_id, ordem);

-- 3. Quem está em cada funil (uma linha por e-mail em cada funil)
create table if not exists public.funil_membros (
  id uuid primary key default gen_random_uuid(),
  funil_id uuid not null references public.funis (id) on delete cascade,
  email text not null,
  nome text,
  empresa_id uuid references public.empresas (id) on delete set null,
  contato_id uuid references public.contatos (id) on delete set null,
  status text not null default 'ativo' check (status in ('ativo', 'pausado', 'concluido', 'removido', 'passou', 'descadastrado', 'email_errado')),
  motivo text,
  origem text,
  entrou_em timestamptz not null default now(),
  entrou_por uuid references public.perfis (id) default auth.uid(),
  proximo_envio_em timestamptz default now(),
  saiu_em timestamptz,
  passou_para uuid references public.funis (id) on delete set null,
  unique (funil_id, email)
);
create index if not exists funil_membros_funil on public.funil_membros (funil_id, status);
create index if not exists funil_membros_email on public.funil_membros (email);

-- 4. Cada e-mail enviado a cada pessoa, com o que aconteceu (contas refeitas a partir dos eventos)
create table if not exists public.funil_envios (
  id bigint generated always as identity primary key,
  membro_id uuid not null references public.funil_membros (id) on delete cascade,
  funil_id uuid not null references public.funis (id) on delete cascade,
  email_id uuid references public.funil_emails (id) on delete set null,
  email text not null,
  assunto text,
  conta text not null default 'principal',
  status text not null default 'enviando' check (status in ('enviando', 'enviado', 'erro')),
  erro text,
  message_id text,
  enviado_em timestamptz not null default now(),
  aberto_em timestamptz,
  aberturas integer not null default 0,
  automatico_em timestamptz,          -- abertura feita pelo iPhone sozinho ou clique de antivírus: não conta como interesse
  clicado_em timestamptz,
  cliques integer not null default 0,
  leitura_pct integer,                -- até onde rolou a página "continuar lendo"
  leitura_seg integer,
  leu_em timestamptz,                 -- chegou ao fim (90% ou mais)
  problema text,                      -- devolvido, devolvido_temp, invalido, bloqueado, spam, erro
  problema_em timestamptz,
  unique (membro_id, email_id)
);
create index if not exists funil_envios_funil on public.funil_envios (funil_id);
create index if not exists funil_envios_membro on public.funil_envios (membro_id);
create index if not exists funil_envios_msg on public.funil_envios (message_id);
create index if not exists funil_envios_dia on public.funil_envios (enviado_em);

-- 5. Eventos lidos do Brevo e da página de leitura (chave evita contar duas vezes)
create table if not exists public.funil_eventos (
  id bigint generated always as identity primary key,
  envio_id bigint not null references public.funil_envios (id) on delete cascade,
  tipo text not null,                 -- abriu, automatico, clicou, leu, devolvido, devolvido_temp, invalido, bloqueado, spam, erro, saiu
  link text,
  em timestamptz not null default now(),
  chave text unique
);
create index if not exists funil_eventos_envio on public.funil_eventos (envio_id);

-- 6. Quem pediu para sair (ou marcou como spam): nunca mais recebe e-mail de funil
create table if not exists public.descadastros (
  email text primary key,
  em timestamptz not null default now(),
  origem text,                        -- link, spam, manual
  envio_id bigint references public.funil_envios (id) on delete set null
);

-- 7. Contatos para atualizar: e-mail que voltou, não existe ou está escrito errado
create table if not exists public.contatos_atualizar (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  nome text,
  empresa_id uuid references public.empresas (id) on delete set null,
  contato_id uuid references public.contatos (id) on delete set null,
  motivo text not null,
  detalhe text,
  funis uuid[] not null default '{}',
  detectado_em timestamptz not null default now(),
  resolvido_em timestamptz,
  resolvido_por uuid references public.perfis (id),
  email_novo text,
  solucao text                         -- corrigido, sem_email, ignorado
);
create index if not exists contatos_atualizar_aberto on public.contatos_atualizar (email) where resolvido_em is null;

-- 8. Resumo por pessoa (para as telas e as regras): recebidos, aberturas, cliques, leitura e e-mails seguidos sem sinal
create or replace view public.funil_membros_resumo with (security_invoker = true) as
select m.*,
  coalesce(r.recebidos, 0) as recebidos,
  coalesce(r.abertos, 0) as abertos,
  coalesce(r.automaticos, 0) as automaticos,
  coalesce(r.cliques, 0) as cliques,
  coalesce(r.leram, 0) as leram,
  r.ultimo_envio_em,
  r.ultimo_sinal_em,
  coalesce((select count(*) from public.funil_envios w where w.membro_id = m.id and w.status = 'enviado'
    and w.enviado_em > coalesce(r.ultimo_sinal_em, '-infinity'::timestamptz)), 0)::integer as sem_sinal_seguidos
from public.funil_membros m
left join lateral (
  select count(*) filter (where v.status = 'enviado')::integer as recebidos,
    count(*) filter (where v.aberto_em is not null)::integer as abertos,
    count(*) filter (where v.automatico_em is not null and v.aberto_em is null and v.clicado_em is null)::integer as automaticos,
    coalesce(sum(v.cliques), 0)::integer as cliques,
    count(*) filter (where v.leu_em is not null)::integer as leram,
    max(v.enviado_em) filter (where v.status = 'enviado') as ultimo_envio_em,
    max(greatest(v.aberto_em, v.automatico_em, v.clicado_em, v.leu_em)) as ultimo_sinal_em
  from public.funil_envios v where v.membro_id = m.id
) r on true;

-- 9. Refaz as contas de cada envio a partir dos eventos (só o servidor chama)
create or replace function public.recontar_envios(ids bigint[]) returns void
language sql security definer set search_path = public as $$
  update funil_envios v set
    aberturas = x.ab, aberto_em = x.ab_em, automatico_em = x.auto_em, cliques = x.cl, clicado_em = x.cl_em,
    leu_em = coalesce(v.leu_em, x.leu_em),
    problema = coalesce(x.prob, v.problema), problema_em = coalesce(x.prob_em, v.problema_em)
  from (
    select envio_id,
      count(*) filter (where tipo = 'abriu')::integer as ab, min(em) filter (where tipo = 'abriu') as ab_em,
      min(em) filter (where tipo = 'automatico') as auto_em,
      count(*) filter (where tipo = 'clicou')::integer as cl, min(em) filter (where tipo = 'clicou') as cl_em,
      min(em) filter (where tipo = 'leu') as leu_em,
      (array_agg(tipo order by case tipo when 'spam' then 1 when 'devolvido' then 2 when 'invalido' then 3 when 'bloqueado' then 4 else 5 end, em)
        filter (where tipo in ('spam', 'devolvido', 'invalido', 'bloqueado', 'devolvido_temp', 'erro')))[1] as prob,
      min(em) filter (where tipo in ('spam', 'devolvido', 'invalido', 'bloqueado', 'devolvido_temp', 'erro')) as prob_em
    from funil_eventos where envio_id = any(ids) group by envio_id
  ) x
  where v.id = x.envio_id;
$$;

-- Leitura da página "continuar lendo": guarda o ponto mais longe e o tempo (só o servidor chama)
create or replace function public.marcar_leitura(p_envio bigint, p_pct integer, p_seg integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare chegou boolean;
begin
  update funil_envios set leitura_pct = greatest(coalesce(leitura_pct, 0), least(greatest(p_pct, 0), 100)),
    leitura_seg = greatest(coalesce(leitura_seg, 0), least(greatest(p_seg, 0), 7200))
    where id = p_envio;
  select leitura_pct >= 90 and leu_em is null into chegou from funil_envios where id = p_envio;
  if chegou then
    update funil_envios set leu_em = now() where id = p_envio;
    insert into funil_eventos (envio_id, tipo, em, chave) values (p_envio, 'leu', now(), 'leu:' || p_envio) on conflict (chave) do nothing;
  end if;
  return coalesce(chegou, false);
end $$;

do $$
begin
  revoke all on function public.recontar_envios(bigint[]) from public, anon, authenticated;
  revoke all on function public.marcar_leitura(bigint, integer, integer) from public, anon, authenticated;
  grant execute on function public.recontar_envios(bigint[]) to service_role;
  grant execute on function public.marcar_leitura(bigint, integer, integer) to service_role;
end $$;

-- 10. Carimbo de atualização
drop trigger if exists funis_atualizado on public.funis;
create trigger funis_atualizado before update on public.funis for each row execute function public.marcar_atualizacao();
drop trigger if exists funil_emails_atualizado on public.funil_emails;
create trigger funil_emails_atualizado before update on public.funil_emails for each row execute function public.marcar_atualizacao();

-- 11. Regras de acesso: só a administração (o servidor usa a chave secreta)
do $$
declare t text;
begin
  foreach t in array array['funis', 'funil_emails', 'funil_membros', 'funil_envios', 'funil_eventos', 'descadastros', 'contatos_atualizar']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists admin_tudo on public.%I', t);
    execute format('create policy admin_tudo on public.%I for all to authenticated using (eh_admin()) with check (eh_admin())', t);
  end loop;
end $$;
revoke all on public.funil_membros_resumo from anon;
grant select on public.funil_membros_resumo to authenticated;

-- 12. Limite de e-mails de funil por dia em cada conta do Brevo (o plano grátis manda 300 por dia, contando os da plataforma)
insert into public.configuracoes (chave, valor) values ('funis', '{"limite_principal": 150, "limite_marketing": 280}') on conflict (chave) do nothing;

notify pgrst, 'reload schema';
