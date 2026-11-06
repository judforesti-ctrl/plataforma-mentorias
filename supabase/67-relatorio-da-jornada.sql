-- Relatório da jornada do mentorado (pedido da Juliana, 06/11/2026): na mentoria individual, a administração aperta um botão e a
-- IA monta o relatório do processo inteiro do mentorado (cada sessão: data, mentor, temas e um resumo curto) e, no fim, a síntese:
-- pontos altos, o que ele já reconhece que melhorou e os desafios que ainda existem. A administração revisa e, no fim do processo,
-- libera para o mentorado, que lê (e baixa em PDF) na área dele.
-- O mentorado NUNCA lê a linha da tabela (ela tem o pedido interno para a IA e o rascunho): lê só o retrato "liberado", pela
-- função minha_jornada(). Rodar no SQL Editor do Supabase (New query → colar tudo → Run); pode rodar de novo.

create table if not exists public.relatorios_mentorado (
  id uuid primary key default gen_random_uuid(),
  mentorado_id uuid not null references public.mentorados (id) on delete cascade,
  titulo text,
  observacoes text,                     -- pedido da equipe para a IA (interno)
  opcoes jsonb not null default '{}'::jsonb,   -- o que entra no relatório: {"evolucao": true, "notas": true}
  status text not null default 'gerando' check (status in ('gerando', 'rascunho', 'erro')),
  conteudo jsonb not null default '{}'::jsonb, -- {versao, dados (números da plataforma), texto (da IA, revisado)}
  erro text,
  liberado jsonb,                       -- retrato que o mentorado lê: {titulo, opcoes, dados, texto}
  liberado_em timestamptz,
  liberado_por uuid references public.perfis (id),
  avisado_em timestamptz,               -- último e-mail ao mentorado
  criado_por uuid references public.perfis (id) default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists relatorios_mentorado_mentorado on public.relatorios_mentorado (mentorado_id, criado_em desc);
drop trigger if exists relatorios_mentorado_atualizado on public.relatorios_mentorado;
create trigger relatorios_mentorado_atualizado before update on public.relatorios_mentorado
  for each row execute function public.marcar_atualizacao();

-- só a administração lê e muda a tabela
alter table public.relatorios_mentorado enable row level security;
revoke all on public.relatorios_mentorado from anon;
drop policy if exists admin_tudo on public.relatorios_mentorado;
create policy admin_tudo on public.relatorios_mentorado for all to authenticated using (eh_admin()) with check (eh_admin());

-- o mentorado lê só o que foi liberado para ele (o retrato), nada mais da linha
create or replace function public.minha_jornada()
returns table (id uuid, titulo text, liberado jsonb, liberado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, coalesce(r.liberado ->> 'titulo', 'Relatório da sua jornada'), r.liberado, r.liberado_em
    from relatorios_mentorado r
   where r.mentorado_id = meu_mentorado() and r.liberado is not null and r.liberado_em is not null
   order by r.liberado_em desc;
$$;
revoke all on function public.minha_jornada() from public, anon;
grant execute on function public.minha_jornada() to authenticated;

notify pgrst, 'reload schema';

-- Conferência: deve aparecer "ok"
select 'ok' as relatorio_da_jornada;
